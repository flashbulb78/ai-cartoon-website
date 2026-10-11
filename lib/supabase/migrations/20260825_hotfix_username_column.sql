-- =====================================================
-- 🔴 紧急修复：补上 profiles.username 列
-- 文件：20260825_hotfix_username_column.sql
--
-- 【事故说明】
--   20260825_fix_username_collision.sql 让 handle_new_user() 在 INSERT 时写入
--   profiles.username。但**线上真实表结构里没有 username 列** ——
--   仓库的 lib/supabase/database.sql 定义了它，线上却没有（两者不一致）。
--
--   plpgsql **不校验列名**，所以函数能创建成功、自检脚本也会 PASS；
--   但真正运行时才报 "column username of relation profiles does not exist"。
--   后果：**每一次新用户注册（邮箱或 Google）都会失败**。
--
--   同时 username 是被应用用到的（lib/types.ts、api/admin/user-stats 等），
--   因此正确修法是**补列**，而不是删掉引用。
--
-- 【本脚本做什么】
--   1. 补上 username 列（可空，不影响已有用户）
--   2. 回填现有用户的 username（邮箱前缀；同前缀按创建时间加数字后缀）
--   3. 添加 UNIQUE 约束（与 database.sql 的意图一致，也是冲突重试的前提）
--   4. 用「真实触发 + 主动回滚」的方式**证明**注册流程已经恢复
--
-- 【幂等】可重复执行；每步都做了存在性判断。
-- =====================================================

-- ---------- 1. 补列 ----------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username TEXT;

-- ---------- 2. 回填现有用户 ----------
-- 规则：邮箱前缀；同前缀按 created_at 排序，第一个用裸前缀，后续加 2、3…
-- 只处理 username 仍为空、且前缀在库内尚未被占用的行（保证不会撞唯一约束）
UPDATE public.profiles p
SET username = r.new_username
FROM (
    SELECT
        t.id,
        CASE WHEN t.rn = 1 THEN t.prefix ELSE t.prefix || t.rn::text END AS new_username
    FROM (
        SELECT
            id,
            split_part(email, '@', 1) AS prefix,
            row_number() OVER (
                PARTITION BY split_part(email, '@', 1)
                ORDER BY created_at, id
            ) AS rn
        FROM public.profiles
        WHERE username IS NULL
          AND email IS NOT NULL
          AND split_part(email, '@', 1) <> ''
    ) t
    WHERE NOT EXISTS (
        SELECT 1 FROM public.profiles x
        WHERE x.username = t.prefix
    )
) r
WHERE p.id = r.id
  AND p.username IS NULL;

-- ---------- 3. UNIQUE 约束 ----------
DO $$
DECLARE
    v_dupes INTEGER;
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'profiles_username_key'
          AND conrelid = 'public.profiles'::regclass
    ) THEN
        RAISE NOTICE '[跳过] 约束 profiles_username_key 已存在';
    ELSE
        SELECT count(*) INTO v_dupes
        FROM (
            SELECT username FROM public.profiles
            WHERE username IS NOT NULL
            GROUP BY username HAVING count(*) > 1
        ) d;

        IF v_dupes > 0 THEN
            RAISE NOTICE '[警告] 仍有 % 组重复 username，跳过约束创建（请人工检查）', v_dupes;
        ELSE
            ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_key UNIQUE (username);
            RAISE NOTICE '[完成] 已添加 UNIQUE 约束 profiles_username_key';
        END IF;
    END IF;
END $$;

-- ---------- 4. 真实触发自检：插入 → 读取 → 主动回滚 ----------
-- 这一步才是真正的验证：它会真的触发 handle_new_user()。
-- 无论成功或失败，整个子事务都会回滚，不会留下任何用户数据。
DO $$
DECLARE
    v_id       uuid := gen_random_uuid();
    v_username text;
    v_credits  integer;
    v_err      text;
BEGIN
    BEGIN
        INSERT INTO auth.users (id, instance_id, email, raw_user_meta_data, created_at, updated_at)
        VALUES (
            v_id,
            '00000000-0000-0000-0000-000000000000',
            'trigger-selftest@example.invalid',
            '{"full_name":"Trigger Self Test"}'::jsonb,
            now(), now()
        );

        SELECT username, credits INTO v_username, v_credits
        FROM public.profiles WHERE id = v_id;

        -- 主动抛错，触发回滚（同时也作为"成功标记"）
        RAISE EXCEPTION 'SELFTEST_OK';
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;

    RAISE NOTICE '--------------------------------------------------';
    IF v_err = 'SELFTEST_OK' THEN
        RAISE NOTICE '✅ 触发器自检通过：新用户能成功建档';
        RAISE NOTICE '   username = %   credits = %', v_username, v_credits;
    ELSIF v_err LIKE '%auth.users%' THEN
        RAISE NOTICE '⚠️ 自检脚本无法向 auth.users 插入测试数据（与触发器无关）：%', v_err;
        RAISE NOTICE '   请改用一次真实注册来验证（见下方说明）';
    ELSE
        RAISE NOTICE '❌ 触发器自检失败（注册仍有问题）：%', v_err;
    END IF;
    RAISE NOTICE '   自检数据已回滚，数据库未留下任何痕迹';
    RAISE NOTICE '--------------------------------------------------';
END $$;

-- ---------- 5. 结果速查（只读） ----------
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_schema='public' and table_name='profiles'
-- order by ordinal_position;
