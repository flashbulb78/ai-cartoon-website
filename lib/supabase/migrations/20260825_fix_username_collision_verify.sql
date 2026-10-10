-- =====================================================
-- username 冲突修复自检脚本 (verify)
-- 配套：20260825_fix_username_collision.sql
--
-- 用法：Supabase Dashboard → SQL Editor → 粘贴全文 → Run
-- 特性：单条查询，一次性输出全部检查项（PASS/FAIL）到同一张结果表
-- 说明：只读，不会修改任何数据
-- =====================================================

WITH
fn AS (
    SELECT to_regprocedure('public.handle_new_user()') AS oid
),
clash AS (
    -- 线上已存在的「同邮箱前缀、不同域名」用户数（仅作提示）
    SELECT count(*) AS cnt
    FROM (
        SELECT split_part(email, '@', 1) AS prefix
        FROM public.profiles
        WHERE email IS NOT NULL
        GROUP BY 1
        HAVING count(*) > 1
    ) s
)
SELECT
    1,
    'handle_new_user 含用户名冲突重试',
    CASE
        WHEN (SELECT oid FROM fn) IS NULL THEN '❌ FAIL'
        WHEN position('unique_violation' IN pg_get_functiondef((SELECT oid FROM fn))) > 0
            THEN '✅ PASS'
        ELSE '❌ FAIL'
    END,
    '缺少重试逻辑时，两个同前缀邮箱（如 john@gmail.com / john@outlook.com）会导致第二个用户注册整体失败'

UNION ALL
-- ---------- 检查 2：触发器是否挂载 ----------
SELECT
    2,
    'on_auth_user_created 触发器已挂载',
    CASE WHEN EXISTS (
            SELECT 1
            FROM pg_trigger t
            JOIN pg_class c ON c.oid = t.tgrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'auth'
              AND c.relname = 'users'
              AND t.tgname = 'on_auth_user_created'
              AND NOT t.tgisinternal
         ) THEN '✅ PASS' ELSE '❌ FAIL' END,
    '触发器缺失会导致新用户没有 profiles 行（登录后积分/资料为空白）'

UNION ALL
-- ---------- 检查 3：函数执行权限已收紧 ----------
SELECT
    3,
    'handle_new_user 执行权限已收紧',
    CASE
        WHEN (SELECT oid FROM fn) IS NULL THEN '⚠️ N/A'
        WHEN NOT has_function_privilege('anon', (SELECT oid FROM fn), 'EXECUTE')
         AND NOT has_function_privilege('authenticated', (SELECT oid FROM fn), 'EXECUTE')
            THEN '✅ PASS'
        ELSE '❌ FAIL'
    END,
    '禁止客户端通过 PostgREST /rpc/ 直接调用；触发器执行不检查 EXECUTE，不影响注册'

UNION ALL
-- ---------- 检查 4：search_path 加固 ----------
SELECT
    4,
    'handle_new_user 已带 search_path',
    CASE
        WHEN (SELECT oid FROM fn) IS NULL THEN '⚠️ N/A'
        WHEN EXISTS (
                SELECT 1 FROM pg_proc
                WHERE oid = (SELECT oid FROM fn)
                  AND proconfig::text LIKE '%search_path%'
             ) THEN '✅ PASS'
        ELSE '❌ FAIL'
    END,
    'SECURITY DEFINER 函数固定 search_path，消除 search_path 劫持面'

UNION ALL
-- ---------- 检查 5：现存重复前缀（信息项，不是故障） ----------
SELECT
    5,
    '线上现存同前缀邮箱用户（信息项）',
    CASE WHEN (SELECT cnt FROM clash) = 0 THEN '✅ 无冲突'
         ELSE '⚠️ 存在重复前缀' END,
    '仅作提示：历史用户无需处理；修复后新增用户会自动追加数字后缀'

ORDER BY 1;
