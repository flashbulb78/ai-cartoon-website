-- =====================================================
-- SECURITY FIX 2026-08-24  (v2 · 防御式版本)
-- 修复：RLS 权限提升、积分自助篡改、SECURITY DEFINER 函数越权调用
--
-- 执行：Supabase Dashboard → SQL Editor → 粘贴全文 → Run
-- 特性：
--   ✅ 幂等：可重复执行
--   ✅ 防御式：表/函数不存在时自动跳过并打印 NOTICE，不会中断执行
--   ✅ 不修改任何业务数据
--
-- 修复的漏洞：
--   [1] admins 等表使用 FOR ALL USING (true)（未限定角色）→
--       任何人持公开 anon key 即可把自己插入 admins 表从而提权为管理员，
--       进而通过所有 /api/admin/* 鉴权，窃取全站登录日志（IP/邮箱/UA）。
--   [2] profiles 的 UPDATE 策略无列级限制 →
--       用户可直接 PATCH 自己的 credits / is_premium 实现无限免费生成。
--   [3] atomic_deduct_credits / cleanup_expired_rate_limits 等
--       SECURITY DEFINER 函数默认对 PUBLIC 开放 EXECUTE →
--       可被用来"清空他人积分"或"清空限流记录绕过限流"。
-- =====================================================

-- =====================================================
-- 第 0 部分：环境体检 —— 打印缺失的表
-- =====================================================
DO $$
DECLARE
    v_missing TEXT;
BEGIN
    SELECT string_agg(t, ', ') INTO v_missing
    FROM unnest(ARRAY[
        'profiles', 'generations', 'app_settings', 'pricing_packages',
        'transactions', 'style_usage_stats', 'admins', 'code_changes',
        'user_login_logs', 'user_access_stats', 'user_page_logs',
        'webhook_logs', 'rate_limits'
    ]) AS t
    WHERE to_regclass('public.' || t) IS NULL;

    IF v_missing IS NULL THEN
        RAISE NOTICE '[体检] ✅ 所有业务表均存在';
    ELSE
        RAISE WARNING '[体检] ⚠️ 以下表不存在，相关策略会自动跳过：%', v_missing;
    END IF;
END $$;

-- =====================================================
-- 第 0.1 部分：补齐缺失的 transactions 表
-- =====================================================
-- 背景：该表用于支付审计（webhook 写入）与订单状态查询。
--       若线上缺失，webhook 的审计写入会静默失败、支付状态接口异常。
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    stripe_session_id TEXT UNIQUE NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    credits INTEGER NOT NULL,
    type TEXT NOT NULL,                        -- 'purchase' | 'refund'
    status TEXT NOT NULL DEFAULT 'pending',    -- 'pending' | 'completed' | 'failed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_stripe_session ON public.transactions(stripe_session_id);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 第 0.2 部分：transactions 的用户只读自身策略
-- =====================================================
-- 应用端 /api/dodo/payment-status 使用用户会话读取自己的订单，
-- 因此必须保留"仅可查看自己的交易"策略（最小权限）。
DO $$
BEGIN
    IF to_regclass('public.transactions') IS NULL THEN
        RETURN;
    END IF;
    EXECUTE 'DROP POLICY IF EXISTS "Users can view own transactions" ON public.transactions';
    EXECUTE 'CREATE POLICY "Users can view own transactions" ON public.transactions '
         || 'FOR SELECT TO authenticated USING (auth.uid() = user_id)';
    RAISE NOTICE '[策略] transactions：已设置"用户仅可查看自己的交易"';
END $$;

-- =====================================================
-- 第 1 部分：RLS 策略收口（核心修复）
-- =====================================================
-- 原理：SQL 中不带 TO 子句的 CREATE POLICY 默认作用于 public 角色，
--       即包含 anon / authenticated。而 service_role 本身会绕过 RLS，
--       所以这些"给服务端用"的策略实际成了对所有匿名客户端的授权。
-- 做法：统一删除后重建为 FOR ALL TO service_role。
--       表不存在时自动跳过（to_regclass 判断），不会报错中断。
DO $$
DECLARE
    -- (表名, 需要清理的旧策略名数组, 统一后的新策略名)
    v_tbl      RECORD;
    v_old_name TEXT;
BEGIN
    FOR v_tbl IN
        SELECT * FROM (VALUES
            ('app_settings',
             ARRAY['Service role can read app_settings',
                   'Service role can update app_settings',
                   'Service role can insert app_settings',
                   'Service role can manage app_settings'],
             'Service role can manage app_settings'),

            ('pricing_packages',
             ARRAY['Service role can manage packages'],
             'Service role can manage packages'),

            ('transactions',
             ARRAY['Service role can manage transactions'],
             'Service role can manage transactions'),

            ('style_usage_stats',
             ARRAY['Anyone can read style stats',
                   'Service role can manage style stats'],
             'Service role can manage style stats'),

            ('admins',
             ARRAY['Service role can manage admins'],
             'Service role can manage admins'),

            ('code_changes',
             ARRAY['Anyone can read code changes',
                   'Service role can manage code changes'],
             'Service role can manage code changes'),

            ('user_login_logs',
             ARRAY['Service role can insert login logs',
                   'Service role can manage login logs'],
             'Service role can manage login logs'),

            ('user_access_stats',
             ARRAY['Service role can update access stats',
                   'Service role can insert access stats',
                   'Service role can manage access stats'],
             'Service role can manage access stats'),

            ('user_page_logs',
             ARRAY['Service role can insert page logs',
                   'Service role can manage page logs'],
             'Service role can manage page logs'),

            ('webhook_logs',
             ARRAY['Service role can manage webhook_logs'],
             'Service role can manage webhook_logs'),

            ('rate_limits',
             ARRAY['Service role can manage rate_limits'],
             'Service role can manage rate_limits')
        ) AS t(tbl, old_names, new_name)
    LOOP
        IF to_regclass('public.' || v_tbl.tbl) IS NULL THEN
            RAISE NOTICE '[跳过] public.% 不存在', v_tbl.tbl;
            CONTINUE;
        END IF;

        -- 删除旧策略（含新策略名，保证脚本可重复执行）
        FOREACH v_old_name IN ARRAY v_tbl.old_names LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_old_name, v_tbl.tbl);
        END LOOP;

        -- 重建为仅 service_role 可用
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
            v_tbl.new_name, v_tbl.tbl
        );

        RAISE NOTICE '[策略] public.% → 已收紧为仅 service_role', v_tbl.tbl;
    END LOOP;

    RAISE NOTICE '[策略] 第 1 部分完成';
END $$;


-- =====================================================
-- 第 2 部分：profiles 敏感列列级保护（核心修复）
-- =====================================================
-- 背景：Supabase 的 RLS 只能限制"行"，无法限制"列"。
--       策略 "Users can update own profile" 允许用户更新自己整行，
--       因此用户可用自己的 token 直接 PATCH credits / is_premium，
--       实现无限免费生成 —— 完全绕过服务端的原子扣减逻辑。
--
-- 规则：
--   - 直连数据库（SQL Editor / psql / migration）：无 request.jwt.claims，放行
--   - service_role（服务端 API）：放行（扣积分、支付回调加积分都走这里）
--   - anon / authenticated（浏览器端）：禁止修改敏感列，抛异常
DO $$
BEGIN
    IF to_regclass('public.profiles') IS NULL THEN
        RAISE WARNING '[跳过] public.profiles 不存在，无法安装保护触发器';
        RETURN;
    END IF;

    EXECUTE $fn$
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_columns()
RETURNS TRIGGER AS $body$
DECLARE
    v_claims TEXT;
    v_role   TEXT;
BEGIN
    -- 读取 PostgREST 注入的 JWT claims（直连数据库时为 NULL）
    BEGIN
        v_claims := current_setting('request.jwt.claims', true);
    EXCEPTION WHEN OTHERS THEN
        v_claims := NULL;
    END;

    IF v_claims IS NULL OR v_claims = '' THEN
        RETURN NEW;
    END IF;

    BEGIN
        v_role := COALESCE((v_claims::jsonb ->> 'role'), '');
    EXCEPTION WHEN OTHERS THEN
        v_role := '';
    END;

    IF v_role = 'service_role' THEN
        RETURN NEW;
    END IF;

    IF NEW.credits IS DISTINCT FROM OLD.credits THEN
        RAISE EXCEPTION 'credits cannot be modified from the client';
    END IF;

    IF NEW.is_premium IS DISTINCT FROM OLD.is_premium THEN
        RAISE EXCEPTION 'is_premium cannot be modified from the client';
    END IF;

    IF NEW.email IS DISTINCT FROM OLD.email THEN
        RAISE EXCEPTION 'email cannot be modified from the client';
    END IF;

    IF NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id THEN
        RAISE EXCEPTION 'stripe_customer_id cannot be modified from the client';
    END IF;

    IF NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id THEN
        RAISE EXCEPTION 'stripe_subscription_id cannot be modified from the client';
    END IF;

    -- is_admin 列未必存在（当前以 admins 表为准），用 to_jsonb 动态判断：
    -- 列不存在时两侧均为 NULL，不会报错。
    IF (to_jsonb(NEW) ->> 'is_admin') IS DISTINCT FROM (to_jsonb(OLD) ->> 'is_admin') THEN
        RAISE EXCEPTION 'is_admin cannot be modified from the client';
    END IF;

    RETURN NEW;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
    $fn$;

    EXECUTE 'DROP TRIGGER IF EXISTS protect_profile_sensitive_columns ON public.profiles';
    EXECUTE 'CREATE TRIGGER protect_profile_sensitive_columns '
         || 'BEFORE UPDATE ON public.profiles '
         || 'FOR EACH ROW EXECUTE FUNCTION public.protect_profile_sensitive_columns()';

    RAISE NOTICE '[保护] profiles 敏感列保护触发器已安装';
END $$;


-- =====================================================
-- 第 3 部分：收紧 SECURITY DEFINER 函数的执行权限（核心修复）
-- =====================================================
-- 背景：函数默认对 PUBLIC 授予 EXECUTE，任何人用 anon key 即可通过
--       PostgREST 的 /rpc/ 端点调用这些高权限函数：
--       - atomic_deduct_credits：传任意 user_id 即可清空他人积分
--       - cleanup_expired_rate_limits：传 0 小时可清空全部限流记录，绕过限流
--       - check_rate_limit / increment_page_views：可被滥用干扰业务数据
-- 说明：函数不存在时用 to_regprocedure 判断后跳过，保证脚本不中断。
DO $$
DECLARE
    v_signatures TEXT[] := ARRAY[
        'public.atomic_deduct_credits(uuid,integer,integer)',
        'public.check_rate_limit(text,text,integer,integer)',
        'public.cleanup_expired_rate_limits(integer)',
        'public.increment_page_views(uuid)',
        'public.protect_profile_sensitive_columns()',
        'public.handle_new_user()',
        'public.update_updated_at()',
        'public.update_access_stats_timestamp()'
    ];
    v_sig TEXT;
BEGIN
    FOREACH v_sig IN ARRAY v_signatures LOOP
        IF to_regprocedure(v_sig) IS NULL THEN
            RAISE NOTICE '[跳过] 函数 % 不存在', v_sig;
            CONTINUE;
        END IF;

        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_sig);
        -- 触发器函数无需授权；业务函数需要 service_role 调用
        IF v_sig NOT LIKE '%handle_new_user%'
           AND v_sig NOT LIKE '%update_updated_at%'
           AND v_sig NOT LIKE '%update_access_stats_timestamp%'
           AND v_sig NOT LIKE '%protect_profile_sensitive_columns%' THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
        END IF;

        RAISE NOTICE '[权限] % → 已禁止 anon/authenticated 调用', v_sig;
    END LOOP;

    RAISE NOTICE '[权限] 第 3 部分完成';
END $$;

-- =====================================================
-- 第 4 部分：验证（执行后查看下方结果）
-- =====================================================

-- 4.1 是否还存在"未限定角色"的宽松策略（期望 0 行）
SELECT tablename AS "表", policyname AS "策略名", cmd AS "操作"
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname LIKE 'Service role%'
  AND roles::text NOT LIKE '%service_role%';

-- 4.2 确认敏感函数已禁止 anon 调用（期望：结果中 anon 列全部为 false/NULL）
SELECT p.proname AS "函数",
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS "anon 可调用",
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS "authenticated 可调用"
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('atomic_deduct_credits', 'check_rate_limit',
                    'cleanup_expired_rate_limits', 'increment_page_views');

-- 4.3 确认 profiles 保护触发器已安装（期望包含 protect_profile_sensitive_columns）
SELECT tgname AS "触发器" FROM pg_trigger
WHERE tgrelid = 'public.profiles'::regclass AND NOT tgisinternal;

-- =====================================================
-- 第 5 部分：人工攻击自检（可选）
-- =====================================================
-- 用「普通用户」身份（不是 SQL Editor）执行下面语句，期望报错：
--   credits cannot be modified from the client
-- UPDATE public.profiles SET credits = 999999 WHERE id = auth.uid();

-- =====================================================
-- 附：如何新增管理员
-- 必须在 SQL Editor / 服务端执行；客户端已无法自助提权
-- =====================================================
-- INSERT INTO public.admins (user_id, role)
-- SELECT id, 'admin' FROM auth.users WHERE email = 'admin@example.com'
-- ON CONFLICT (user_id) DO NOTHING;

