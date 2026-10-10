-- =====================================================
-- 修复：username 唯一约束冲突导致新用户注册直接失败
-- 文件：20260825_fix_username_collision.sql
--
-- 【问题】
--   handle_new_user() 用邮箱前缀（split_part(email,'@',1)）作为默认用户名，
--   而 profiles.username 上有 UNIQUE 约束。
--   于是 john@gmail.com 与 john@outlook.com 会得到同一个 'john' →
--   插入 profiles 时触发 unique_violation。
--
--   该 INSERT 位于 AFTER INSERT 触发器中且没有任何异常处理，异常会向上冒泡
--   并回滚整个 auth.users 插入 —— 用户端表现为注册失败：
--   "Database error saving new user"（Supabase Auth 的控制台也会记录该错误）。
--
-- 【影响面】
--   * 邮箱注册今天就受影响（小众域名邮箱撞前缀）
--   * 启用 Google 登录后会显著放大：Google 用户集中于 gmail 等大域名，
--     前缀撞车概率明显上升
--   * 这是一个「偶发且难复现」的问题：用户只会看到注册失败，无法自助解决
--
-- 【修复内容】
--   1. 在触发器内捕获 unique_violation，按 base、base2、base3… 递增重试，
--      最终兜底使用 user_<id前8位> —— 保证注册流程不会再因用户名冲突而整体失败。
--   2. 补上 SET search_path = public：
--      本函数是 SECURITY DEFINER，与库内较新的函数（protect_profile_sensitive_columns、
--      process_credit_purchase）保持一致，消除 search_path 劫持面。
--   3. 显式重复一次 REVOKE EXECUTE（与 20260824_security_fix_rls.sql 第 3 部分一致）：
--      即便本迁移单独在一个从未跑过安全修复的库上执行，也不会把权限口子打开。
--      注意 CREATE OR REPLACE FUNCTION 会保留函数原有 ACL，这一步属于双保险。
--
-- 【为什么不需要担心触发器权限】
--   PostgreSQL 在触发器触发时不检查 EXECUTE 权限，因此
--   20260824_security_fix_rls.sql 中的 REVOKE 不影响注册流程（线上现状即为证明）。
--
-- 【执行方式】
--   Supabase Dashboard → SQL Editor → 粘贴全文 → Run
--   执行后请运行配套自检：20260825_fix_username_collision_verify.sql
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    initial_credits INTEGER := 2;   -- 默认赠送次数（权威值见 app_settings.initial_credits）
    base_username   TEXT;
    final_username  TEXT;
    attempt         INTEGER := 0;
BEGIN
    -- 尝试从 app_settings 获取初始点数配置；任何异常都退回默认值，绝不影响注册
    BEGIN
        SELECT (value->>'credits')::INTEGER INTO initial_credits
        FROM public.app_settings
        WHERE key = 'initial_credits';

        IF initial_credits IS NULL THEN
            initial_credits := 2;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        initial_credits := 2;
    END;

    -- 基准用户名：注册表单提交的 username → 邮箱前缀 → user_<id前8位>
    -- 注意：OAuth（Google）注册时不带 username，会走到邮箱前缀分支
    base_username := COALESCE(
        NULLIF(btrim(NEW.raw_user_meta_data->>'username'), ''),
        NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
        'user_' || substr(NEW.id::text, 1, 8)
    );

    LOOP
        attempt := attempt + 1;

        -- 候选用户名：
        --   第 1 次     → base（保持原有行为，绝大多数用户拿到的用户名不变）
        --   第 2~50 次  → base2 … base50
        --   第 51 次起  → user_<id前8位>（几乎不可能冲突）
        IF attempt <= 50 THEN
            final_username := base_username
                              || CASE WHEN attempt = 1 THEN '' ELSE attempt::text END;
        ELSE
            final_username := 'user_' || substr(NEW.id::text, 1, 8);
        END IF;

        BEGIN
            INSERT INTO public.profiles (id, email, username, full_name, avatar_url, credits)
            VALUES (
                NEW.id,
                NEW.email,
                final_username,
                COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
                NEW.raw_user_meta_data->>'avatar_url',
                initial_credits
            );

            EXIT;  -- 插入成功，结束重试

        EXCEPTION WHEN unique_violation THEN
            -- 用户名已被占用 → 换下一个候选值重试。
            -- 超过兜底次数后放开异常：宁可让这一次注册失败（错误会出现在日志里），
            -- 也不要在这里无限循环。
            IF attempt > 51 THEN
                RAISE;
            END IF;
        END;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.handle_new_user() IS
    '新建 auth.users 时自动创建 profiles 行。username 冲突时自动追加数字后缀重试，避免注册整体失败；初始积分为 app_settings.initial_credits。';


-- =====================================================
-- 第 2 部分：确保触发器仍然挂载
-- =====================================================
-- CREATE OR REPLACE FUNCTION 不会改动触发器的绑定关系；这里重挂一次，
-- 是为了让「单独执行本迁移」也能得到确定结果（触发器缺失时自动补上）。
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- =====================================================
-- 第 3 部分：重复确认执行权限已收紧（双保险）
-- =====================================================
-- 与 20260824_security_fix_rls.sql 第 3 部分保持一致。
-- handle_new_user 是触发器函数，不需要任何角色显式持有 EXECUTE 权限即可触发，
-- 因此这里的 REVOKE 既修补了「匿名可调用」的口子，也不会影响注册流程。
DO $$
BEGIN
    IF to_regprocedure('public.handle_new_user()') IS NULL THEN
        RAISE NOTICE '[跳过] public.handle_new_user() 不存在';
        RETURN;
    END IF;

    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated';
    RAISE NOTICE '[权限] public.handle_new_user() → 已禁止 anon/authenticated 调用';
END $$;


-- =====================================================
-- 第 4 部分：执行后速查（只读，可直接复制到 SQL Editor 运行）
-- =====================================================
-- 更完整的自检请运行：20260825_fix_username_collision_verify.sql
--
-- ① 函数定义是否已包含冲突重试逻辑（期望 true）
-- select position('unique_violation' in pg_get_functiondef('public.handle_new_user()'::regprocedure)) > 0
--        as 已包含冲突重试;
--
-- ② 函数是否已带 search_path（期望 {"search_path=public"}）
-- select proconfig from pg_proc where oid = 'public.handle_new_user()'::regprocedure;
--
-- ③ 线上是否已存在「同前缀不同域名」的用户
--    （返回非空说明冲突风险曾真实发生；这些历史数据本身不受影响，无需处理）
-- select split_part(email, '@', 1) as 前缀, count(*) as 数量, array_agg(email) as 邮箱
-- from public.profiles
-- where email is not null
-- group by 1
-- having count(*) > 1
-- order by 2 desc;

