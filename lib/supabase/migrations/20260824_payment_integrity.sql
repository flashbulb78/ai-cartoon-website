-- =====================================================
-- PAYMENT INTEGRITY 2026-08-24
-- 修复支付链路三个问题：
--   [1] Webhook 幂等竞态（TOCTOU）：先 SELECT 再 INSERT 且不检查插入错误，
--       并发重复投递会重复发放积分。
--   [2] 积分累加竞态：原实现为 read-modify-write（读 credits 再写回），
--       同一用户并发到账会丢更新（lost update）。
--   [3] 部分失败：先加积分后写交易记录，若中途失败会出现"加了分但无记录"
--       或"有记录但没加分"的不一致状态。
--
-- 方案：把「幂等判定 + 记账 + 加积分」收敛到一个 Postgres 函数中，
--       在单个事务内完成，配合 transactions.stripe_session_id 唯一约束，
--       使重复投递天然幂等、并发天然安全。
--
-- 执行：Supabase Dashboard → SQL Editor → 粘贴全文 → Run（幂等，可重复执行）
-- =====================================================

CREATE OR REPLACE FUNCTION public.process_credit_purchase(
    p_payment_id TEXT,      -- Dodo 的 payment_id（幂等键）
    p_user_id    UUID,
    p_credits    INTEGER,
    p_amount     NUMERIC,
    p_status     TEXT DEFAULT 'completed'
)
RETURNS TABLE(
    success           BOOLEAN,
    already_processed BOOLEAN,
    new_credits       INTEGER,
    error_message     TEXT
) AS $$
DECLARE
    v_new_credits INTEGER;
BEGIN
    -- ---------- 基本校验 ----------
    IF p_credits IS NULL OR p_credits <= 0 THEN
        RETURN QUERY SELECT FALSE, FALSE, NULL::INTEGER, 'credits must be positive'::TEXT;
        RETURN;
    END IF;

    IF p_payment_id IS NULL OR p_payment_id = '' THEN
        RETURN QUERY SELECT FALSE, FALSE, NULL::INTEGER, 'payment_id is required'::TEXT;
        RETURN;
    END IF;

    -- ---------- 幂等判定（已处理过则直接返回，不再加分）----------
    IF EXISTS (
        SELECT 1 FROM public.transactions t
        WHERE t.stripe_session_id = p_payment_id
          AND t.status = 'completed'
    ) THEN
        SELECT p.credits INTO v_new_credits FROM public.profiles p WHERE p.id = p_user_id;
        RETURN QUERY SELECT TRUE, TRUE, v_new_credits, NULL::TEXT;
        RETURN;
    END IF;

    -- ---------- 记账 ----------
    -- 并发下同一 payment_id 会撞唯一约束，被下面的 EXCEPTION 捕获
    BEGIN
        INSERT INTO public.transactions (user_id, stripe_session_id, amount, credits, type, status)
        VALUES (p_user_id, p_payment_id, p_amount, p_credits, 'purchase', p_status);
    EXCEPTION WHEN unique_violation THEN
        -- 另一个并发请求已抢先处理，本次视为已完成，不重复加分
        SELECT p.credits INTO v_new_credits FROM public.profiles p WHERE p.id = p_user_id;
        RETURN QUERY SELECT TRUE, TRUE, v_new_credits, NULL::TEXT;
        RETURN;
    END;

    -- ---------- 原子加积分（单条 UPDATE，避免 lost update）----------
    UPDATE public.profiles
    SET credits = COALESCE(credits, 0) + p_credits,
        updated_at = NOW()
    WHERE id = p_user_id
    RETURNING credits INTO v_new_credits;

    IF NOT FOUND THEN
        -- 用户不存在 → 抛异常让整个事务回滚（交易记录一并撤销）
        RAISE EXCEPTION 'profile not found for user %', p_user_id;
    END IF;

    RETURN QUERY SELECT TRUE, FALSE, v_new_credits, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================
-- 权限：仅 service_role 可调用
-- =====================================================
-- 该函数可指定任意 user_id 增加积分，绝不能对 anon/authenticated 开放。
REVOKE EXECUTE ON FUNCTION public.process_credit_purchase(TEXT, UUID, INTEGER, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.process_credit_purchase(TEXT, UUID, INTEGER, NUMERIC, TEXT) TO service_role;

-- =====================================================
-- 验证
-- =====================================================
-- 期望：anon / authenticated 均为 false
SELECT p.proname AS "函数",
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS "anon 可调用",
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS "authenticated 可调用",
       has_function_privilege('service_role', p.oid, 'EXECUTE')  AS "service_role 可调用"
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'process_credit_purchase';
