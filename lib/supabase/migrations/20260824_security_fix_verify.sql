-- =====================================================
-- SECURITY FIX 自检脚本 (verify)
-- 配套：20260824_security_fix_rls.sql
--
-- 用法：Supabase Dashboard → SQL Editor → 粘贴全文 → Run
-- 特性：单条查询，一次性输出全部检查项（PASS/FAIL）到同一张结果表
-- 说明：只读，不会修改任何数据
-- =====================================================

WITH
-- 期望存在的业务表
req AS (
    SELECT unnest(ARRAY[
        'profiles', 'generations', 'app_settings', 'pricing_packages',
        'transactions', 'style_usage_stats', 'admins', 'code_changes',
        'user_login_logs', 'user_access_stats', 'user_page_logs',
        'webhook_logs', 'rate_limits'
    ]) AS t
),
missing AS (
    SELECT string_agg(t, ', ') AS names
    FROM req
    WHERE to_regclass('public.' || t) IS NULL
),
-- 仍对 anon/authenticated 开放的 "Service role..." 策略数量
loose AS (
    SELECT count(*) AS cnt
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname LIKE 'Service role%'
      AND roles::text NOT LIKE '%service_role%'
),
-- 仍可被匿名调用的高权限函数数量
leaky_fn AS (
    SELECT count(*) AS cnt
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
          'atomic_deduct_credits', 'check_rate_limit',
          'cleanup_expired_rate_limits', 'increment_page_views',
          'process_credit_purchase'
      )
      AND (
          has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
      )
)

-- ---------- 检查 1：业务表完整性 ----------
SELECT
    1 AS "序号",
    '业务表完整性' AS "检查项",
    CASE WHEN (SELECT names FROM missing) IS NULL THEN '✅ PASS' ELSE '❌ FAIL' END AS "状态",
    COALESCE((SELECT names FROM missing), '13 张业务表全部存在') AS "详情"

UNION ALL
-- ---------- 检查 2：RLS 策略角色范围（核心修复 1）----------
SELECT
    2,
    'RLS 策略角色范围',
    CASE WHEN (SELECT cnt FROM loose) = 0 THEN '✅ PASS' ELSE '❌ FAIL' END,
    CASE WHEN (SELECT cnt FROM loose) = 0
         THEN '无未限定角色的 "Service role" 策略'
         ELSE (SELECT cnt FROM loose)::text || ' 条策略仍对 anon/authenticated 开放（可被提权/篡改）' END

UNION ALL
-- ---------- 检查 3：admins 表写保护（提权入口）----------
SELECT
    3,
    'admins 表写保护',
    CASE WHEN EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = 'admins'
              AND policyname = 'Service role can manage admins'
              AND roles::text LIKE '%service_role%'
              AND roles::text NOT LIKE '%public%'
         ) THEN '✅ PASS' ELSE '❌ FAIL' END,
    'admins 仅 service_role 可写（阻断"自助成为管理员"）'

UNION ALL
-- ---------- 检查 4：profiles 敏感列保护（核心修复 2）----------
SELECT
    4,
    'profiles 敏感列保护',
    CASE WHEN to_regclass('public.profiles') IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM pg_trigger
                WHERE tgrelid = to_regclass('public.profiles')
                  AND tgname = 'protect_profile_sensitive_columns'
                  AND NOT tgisinternal
              )
         THEN '✅ PASS' ELSE '❌ FAIL' END,
    'BEFORE UPDATE 触发器已安装（禁止客户端改 credits / is_premium / is_admin）'

UNION ALL
-- ---------- 检查 5：高权限函数越权（核心修复 3）----------
SELECT
    5,
    '高权限函数越权',
    CASE WHEN (SELECT cnt FROM leaky_fn) = 0 THEN '✅ PASS' ELSE '❌ FAIL' END,
    CASE WHEN (SELECT cnt FROM leaky_fn) = 0
         THEN 'atomic_deduct_credits 等已禁止 anon/authenticated 调用'
         ELSE (SELECT cnt FROM leaky_fn)::text || ' 个函数仍可匿名调用（可清空他人积分 / 绕过限流）' END

UNION ALL
-- ---------- 检查 6：支付审计表 ----------
SELECT
    6,
    '支付审计表 transactions',
    CASE WHEN to_regclass('public.transactions') IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM pg_policies
                WHERE schemaname = 'public' AND tablename = 'transactions'
                  AND policyname = 'Users can view own transactions'
              )
         THEN '✅ PASS' ELSE '❌ FAIL' END,
    '表已建立且保留"用户仅可查看自己交易"策略（支付 webhook 审计与订单查询可用）'

UNION ALL
-- ---------- 检查 7：限流表写保护 ----------
SELECT
    7,
    'rate_limits 写保护',
    CASE WHEN to_regclass('public.rate_limits') IS NULL THEN '⚠️ N/A'
         WHEN EXISTS (
                SELECT 1 FROM pg_policies
                WHERE schemaname = 'public'
                  AND tablename = 'rate_limits'
                  AND roles::text LIKE '%service_role%'
                  AND roles::text NOT LIKE '%public%'
              ) THEN '✅ PASS' ELSE '❌ FAIL' END,
    'rate_limits 仅 service_role 可操作（防止删除自己的限流记录绕过限流）'

UNION ALL
-- ---------- 检查 8：支付入账函数（幂等 + 原子 + 权限）----------
SELECT
    8,
    '支付入账函数 process_credit_purchase',
    CASE WHEN EXISTS (
            SELECT 1
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname = 'process_credit_purchase'
              AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
              AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
              AND has_function_privilege('service_role', p.oid, 'EXECUTE')
         ) THEN '✅ PASS' ELSE '❌ FAIL' END,
    '单事务内完成"幂等判定 + 记账 + 加积分"；仅 service_role 可调用（防重复发积分）'

ORDER BY 1;
