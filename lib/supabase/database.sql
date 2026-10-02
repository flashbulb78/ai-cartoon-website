-- =====================================================
-- Supabase 数据库初始化SQL
-- 执行此SQL创建所需的表结构和RLS策略
-- =====================================================

-- 1. 创建用户表（profiles）
-- 注意：Supabase Auth已内置users表，这里创建扩展表
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT,
    username TEXT UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    credits INTEGER DEFAULT 2 NOT NULL,  -- 默认4次免费生成次数
    is_premium BOOLEAN DEFAULT FALSE,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 创建生成历史表
CREATE TABLE IF NOT EXISTS public.generations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    original_image TEXT NOT NULL,        -- 原始图片（Base64或URL）
    generated_image TEXT NOT NULL,        -- 生成的卡通图片（Base64或URL）
    style TEXT NOT NULL,                  -- 使用的风格
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_generations_user_id ON public.generations(user_id);
CREATE INDEX IF NOT EXISTS idx_generations_created_at ON public.generations(created_at DESC);
-- 复合索引：加速按用户ID查询并按创建时间排序的查询
CREATE INDEX IF NOT EXISTS idx_generations_user_created ON public.generations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer ON public.profiles(stripe_customer_id);

-- 4. 启用行级安全（RLS）
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;

-- 5. 创建RLS策略
-- profiles表：用户只能查看和修改自己的数据
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- generations表：用户只能查看自己的生成记录
CREATE POLICY "Users can view own generations" ON public.generations
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own generations" ON public.generations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own generations" ON public.generations
    FOR DELETE USING (auth.uid() = user_id);

-- 6. 创建触发器：新建用户时自动创建profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    initial_credits INTEGER := 2;  -- 默认4次免费生成
BEGIN
    -- 尝试从app_settings获取初始点数配置
    BEGIN
        SELECT (value->>'credits')::INTEGER INTO initial_credits
        FROM public.app_settings
        WHERE key = 'initial_credits';
        
        IF initial_credits IS NULL THEN
            initial_credits := 2;  -- 默认4次
        END IF;
    EXCEPTION WHEN OTHERS THEN
        initial_credits := 2;  -- 出错时使用默认值
    END;
    
    INSERT INTO public.profiles (id, email, username, full_name, avatar_url, credits)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(
            NEW.raw_user_meta_data->>'username',
            split_part(NEW.email, '@', 1),  -- 使用邮箱前缀作为默认用户名
            'user_' || substr(NEW.id::text, 1, 8)  -- 备用：使用用户ID前8位
        ),
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
        NEW.raw_user_meta_data->>'avatar_url',
        initial_credits
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. 创建更新updated_at的触发器
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =====================================================
-- 8. 创建应用设置表（app_settings）
-- 用于存储可动态调整的系统配置
-- =====================================================
CREATE TABLE IF NOT EXISTS public.app_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_app_settings_key ON public.app_settings(key);

-- 启用RLS（但服务端可绕过）
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- RLS策略：仅 service_role 可读写
-- 注意：必须带 TO service_role。service_role 本身会绕过 RLS，此策略用于显式声明；
--       若省略 TO 子句，策略默认作用于 public（含 anon/authenticated），
--       会导致任何人用公开 anon key 即可篡改系统配置。
CREATE POLICY "Service role can manage app_settings" ON public.app_settings
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 为app_settings创建更新updated_at的触发器
CREATE TRIGGER update_app_settings_updated_at
    BEFORE UPDATE ON public.app_settings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =====================================================
-- 9. 创建定价套餐表（pricing_packages）
-- =====================================================
CREATE TABLE IF NOT EXISTS public.pricing_packages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    credits INTEGER NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    currency TEXT DEFAULT 'USD' NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    is_highlighted BOOLEAN DEFAULT FALSE NOT NULL,
    sort_order INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 启用RLS
ALTER TABLE public.pricing_packages ENABLE ROW LEVEL SECURITY;

-- RLS策略：允许所有人读取（定价页公开）
CREATE POLICY "Anyone can view active packages" ON public.pricing_packages
    FOR SELECT USING (is_active = true);

-- 仅服务端（service_role）可以修改定价套餐
-- 必须限定 TO service_role，否则任何匿名客户端都可改价
CREATE POLICY "Service role can manage packages" ON public.pricing_packages
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_pricing_packages_active ON public.pricing_packages(is_active, sort_order);

-- 为pricing_packages创建更新updated_at的触发器
CREATE TRIGGER update_pricing_packages_updated_at
    BEFORE UPDATE ON public.pricing_packages
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =====================================================
-- 10. 插入初始定价套餐数据
-- =====================================================
INSERT INTO public.pricing_packages (name, credits, price, currency, description, is_active, is_highlighted, sort_order)
VALUES
    ('Starter', 8, 1.49, 'USD', 'Perfect for getting started', TRUE, FALSE, 1),
    ('Value', 30, 4.99, 'USD', 'Best for trying styles', TRUE, FALSE, 2),
    ('Mid', 45, 6.99, 'USD', 'Great value – more savings', TRUE, TRUE, 3),
    ('Premium', 60, 8.99, 'USD', 'Best value – save even more', TRUE, TRUE, 4)
ON CONFLICT DO NOTHING;

-- =====================================================
-- 11. 创建交易记录表（transactions）
-- 用于存储用户购买记录，支持幂等性检查
-- =====================================================
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    stripe_session_id TEXT UNIQUE NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    credits INTEGER NOT NULL,
    type TEXT NOT NULL,  -- 'purchase' | 'refund'
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'completed' | 'failed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_stripe_session ON public.transactions(stripe_session_id);

-- 启用RLS
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- RLS策略：用户只能查看自己的交易记录
CREATE POLICY "Users can view own transactions" ON public.transactions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage transactions" ON public.transactions
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================
-- 12. 插入初始设置数据
-- =====================================================
INSERT INTO public.app_settings (key, value)
VALUES
    ('credits_per_generation', '1'::jsonb),
    ('initial_credits', '{"credits": 2}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- 13. 创建风格使用统计表（style_usage_stats）
-- 用于统计各风格被使用的次数，支持按日期和风格名称筛选
-- =====================================================
CREATE TABLE IF NOT EXISTS public.style_usage_stats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    style_name TEXT NOT NULL,                  -- 风格名称（如：pixar_3d_cartoon）
    usage_count INTEGER DEFAULT 0 NOT NULL,      -- 使用次数
    stat_date DATE NOT NULL DEFAULT CURRENT_DATE,  -- 统计日期
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(style_name, stat_date)               -- 同一风格同一天只能有一条记录
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_style_usage_stats_date ON public.style_usage_stats(stat_date DESC);
CREATE INDEX IF NOT EXISTS idx_style_usage_stats_style ON public.style_usage_stats(style_name);
CREATE INDEX IF NOT EXISTS idx_style_usage_stats_count ON public.style_usage_stats(usage_count DESC);

-- 启用RLS
ALTER TABLE public.style_usage_stats ENABLE ROW LEVEL SECURITY;

-- RLS策略：仅服务端可读写（应用通过 service_role 读取统计数据）
CREATE POLICY "Service role can manage style stats" ON public.style_usage_stats
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 为style_usage_stats创建更新updated_at的触发器
CREATE TRIGGER update_style_usage_stats_updated_at
    BEFORE UPDATE ON public.style_usage_stats
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =====================================================
-- 14. 创建管理员表（admins）
-- 用于区分普通用户和管理员
-- =====================================================
CREATE TABLE IF NOT EXISTS public.admins (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    role TEXT DEFAULT 'admin' NOT NULL,  -- 'admin' | 'super_admin'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_admins_user_id ON public.admins(user_id);

-- 启用RLS
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

-- RLS策略：管理员可查看自己的记录
CREATE POLICY "Admins can view own record" ON public.admins
    FOR SELECT USING (auth.uid() = user_id);

-- 仅服务端可管理管理员名单
-- ⚠️ 安全要点：必须限定 TO service_role。若写成 FOR ALL USING (true)，
--    任何持有公开 anon key 的人都能把自己插入 admins 表从而提权为管理员。
CREATE POLICY "Service role can manage admins" ON public.admins
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================
-- 15. 创建代码修改记录表（code_changes）
-- 用于记录每次代码修改，支持准确回退到某次修改
-- =====================================================
CREATE TABLE IF NOT EXISTS public.code_changes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    file_path TEXT NOT NULL,                      -- 修改的文件路径，如 'lib/faceAnalysis.ts'
    change_type TEXT NOT NULL,                    -- 修改类型：'feature_add' | 'bug_fix' | 'rollback' | 'refactor' | 'optimization'
    change_title TEXT NOT NULL,                   -- 修改标题，简短描述
    change_description TEXT,                      -- 详细描述，说明修改内容和原因
    is_rollback_point BOOLEAN DEFAULT FALSE,     -- 是否为回滚点（可作为回退目标）
    git_commit_hash TEXT,                         -- 关联的 Git commit hash（可选）
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by TEXT                              -- 修改者标识（可以是用户名或 'system'）
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_code_changes_file_path ON public.code_changes(file_path);
CREATE INDEX IF NOT EXISTS idx_code_changes_created_at ON public.code_changes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_code_changes_rollback ON public.code_changes(is_rollback_point) WHERE is_rollback_point = true;

-- 启用RLS
ALTER TABLE public.code_changes ENABLE ROW LEVEL SECURITY;

-- RLS策略：仅服务端可读写代码修改记录
CREATE POLICY "Service role can manage code changes" ON public.code_changes
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================
-- 16. 创建用户登录日志表（user_login_logs）
-- 用于记录每次用户登录/访问行为
-- =====================================================
CREATE TABLE IF NOT EXISTS public.user_login_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- 允许空（游客访问无账号）
    login_ip TEXT,                                              -- 客户端真实公网IP
    login_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,               -- 登录/访问时间
    user_agent TEXT,                                           -- 客户端浏览器、设备系统标识
    device_type TEXT DEFAULT 'Unknown',                        -- 设备分类：PC/Mobile/Tablet/Unknown
    location TEXT,                                             -- 根据IP解析的粗略地区（省市）
    login_type TEXT DEFAULT 'email' NOT NULL,                  -- 登录方式：email/google/github/guest
    session_id TEXT                                            -- 用户会话标识
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_user_login_logs_user_id ON public.user_login_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_login_logs_login_at ON public.user_login_logs(login_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_login_logs_ip ON public.user_login_logs(login_ip);
CREATE INDEX IF NOT EXISTS idx_user_login_logs_session ON public.user_login_logs(session_id);

-- 启用RLS
ALTER TABLE public.user_login_logs ENABLE ROW LEVEL SECURITY;

-- RLS策略：管理员可查看所有日志，普通用户仅可查看自己的登录记录
CREATE POLICY "Admin can view all login logs" ON public.user_login_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.admins 
            WHERE admins.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can view own login logs" ON public.user_login_logs
    FOR SELECT USING (auth.uid() = user_id);

-- 服务端（service_role）负责写入登录日志
-- 安全要点：写入统一走服务端 admin client，避免匿名客户端伪造登录日志
CREATE POLICY "Service role can manage login logs" ON public.user_login_logs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================
-- 17. 创建用户访问统计表（user_access_stats）
-- 用于聚合统计用户登录行为，减少查询压力
-- =====================================================
CREATE TABLE IF NOT EXISTS public.user_access_stats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    total_login_count BIGINT DEFAULT 0 NOT NULL,               -- 累计登录总次数
    daily_login_count INT DEFAULT 0 NOT NULL,                  -- 当日登录次数
    last_login_at TIMESTAMPTZ,                                 -- 最近一次登录时间
    first_login_at TIMESTAMPTZ,                                -- 首次登录时间
    last_ip TEXT,                                              -- 最后登录IP
    total_page_views BIGINT DEFAULT 0 NOT NULL,                -- 用户累计页面访问次数
    update_at TIMESTAMPTZ DEFAULT NOW() NOT NULL               -- 统计更新时间
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_user_access_stats_user_id ON public.user_access_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_user_access_stats_last_login ON public.user_access_stats(last_login_at DESC);

-- 启用RLS
ALTER TABLE public.user_access_stats ENABLE ROW LEVEL SECURITY;

-- RLS策略：管理员可查看所有统计，普通用户仅可查看自己的
CREATE POLICY "Admin can view all access stats" ON public.user_access_stats
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.admins 
            WHERE admins.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can view own access stats" ON public.user_access_stats
    FOR SELECT USING (auth.uid() = user_id);

-- 服务端（service_role）负责维护访问统计
CREATE POLICY "Service role can manage access stats" ON public.user_access_stats
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================
-- 18. 创建页面访问日志表（user_page_logs）
-- 用于记录用户页面访问行为
-- =====================================================
CREATE TABLE IF NOT EXISTS public.user_page_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- 允许空（游客访问无账号）
    page_path TEXT NOT NULL,                                    -- 访问的页面路径
    access_ip TEXT,                                             -- 访问IP
    access_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,               -- 访问时间
    user_agent TEXT,                                            -- 客户端UA
    device_type TEXT DEFAULT 'Unknown',                         -- 设备类型
    location TEXT                                               -- 地区
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_user_page_logs_user_id ON public.user_page_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_page_logs_access_at ON public.user_page_logs(access_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_page_logs_page ON public.user_page_logs(page_path);

-- 启用RLS
ALTER TABLE public.user_page_logs ENABLE ROW LEVEL SECURITY;

-- RLS策略：管理员可查看所有页面访问日志，普通用户仅可查看自己的
CREATE POLICY "Admin can view all page logs" ON public.user_page_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.admins 
            WHERE admins.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can view own page logs" ON public.user_page_logs
    FOR SELECT USING (auth.uid() = user_id);

-- 服务端（service_role）负责写入页面访问记录
CREATE POLICY "Service role can manage page logs" ON public.user_page_logs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================
-- 19. 创建增加页面访问次数的RPC函数
-- =====================================================
CREATE OR REPLACE FUNCTION public.increment_page_views(user_id_param UUID)
RETURNS void AS $$
BEGIN
    UPDATE user_access_stats
    SET total_page_views = COALESCE(total_page_views, 0) + 1,
        update_at = NOW()
    WHERE user_id = user_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 20. 创建更新用户最后登录IP的触发器
-- 当 user_access_stats 的 last_ip 变化时自动更新 update_at
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_access_stats_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.update_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_access_stats_timestamp
    BEFORE UPDATE ON public.user_access_stats
    FOR EACH ROW EXECUTE FUNCTION public.update_access_stats_timestamp();

-- =====================================================
-- 21. 创建 DodoPayment Webhook 日志表（用于幂等去重）
-- =====================================================
CREATE TABLE IF NOT EXISTS public.webhook_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    webhook_id TEXT UNIQUE NOT NULL,                    -- Dodo webhook 唯一 ID（用于幂等）
    event_type TEXT NOT NULL,                           -- 事件类型
    payload JSONB,                                      -- 原始 payload
    status TEXT DEFAULT 'received' NOT NULL,            -- 状态：received/processed/failed
    error TEXT,                                         -- 错误信息（如果失败）
    processed_at TIMESTAMP WITH TIME ZONE,              -- 处理时间
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_webhook_logs_webhook_id ON public.webhook_logs(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_status ON public.webhook_logs(status);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON public.webhook_logs(created_at DESC);

-- 启用 RLS
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- RLS 策略：仅服务端可操作
CREATE POLICY "Service role can manage webhook_logs" ON public.webhook_logs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 为 webhook_logs 创建 updated_at 触发器
CREATE TRIGGER update_webhook_logs_updated_at
    BEFORE UPDATE ON public.webhook_logs
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =====================================================
-- 22. 修复Serverless环境下限流失效问题
-- 使用数据库表存储限流计数器，确保多实例共享
-- =====================================================
CREATE TABLE IF NOT EXISTS public.rate_limits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    identifier TEXT NOT NULL,                    -- 客户端标识符（IP、用户ID等）
    action TEXT NOT NULL,                        -- 限流动作名称（如 'generate', 'api', 'auth'）
    count INTEGER DEFAULT 1 NOT NULL,            -- 当前计数
    window_start TIMESTAMPTZ DEFAULT NOW() NOT NULL,  -- 窗口开始时间
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(identifier, action)                   -- 同一标识符同一动作唯一
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier ON public.rate_limits(identifier);
CREATE INDEX IF NOT EXISTS idx_rate_limits_action ON public.rate_limits(action);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON public.rate_limits(window_start);

-- RLS策略：仅服务端可操作
-- 安全要点：必须限定 TO service_role，否则任何人可删除自己的限流记录绕过限流
CREATE POLICY "Service role can manage rate_limits" ON public.rate_limits
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 为rate_limits创建updated_at触发器
CREATE TRIGGER update_rate_limits_updated_at
    BEFORE UPDATE ON public.rate_limits
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =====================================================
-- 23. 原子性积分扣减函数
-- 解决竞态条件：SELECT和UPDATE分离导致的问题
-- =====================================================
CREATE OR REPLACE FUNCTION public.atomic_deduct_credits(
    p_user_id UUID,
    p_amount INTEGER,
    p_max_retries INTEGER DEFAULT 3
)
RETURNS TABLE(success BOOLEAN, new_credits INTEGER, error_message TEXT) AS $$
DECLARE
    v_current_credits INTEGER;
    v_new_credits INTEGER;
    v_retry_count INTEGER := 0;
    v_sleep_time NUMERIC;
BEGIN
    -- 重试循环，处理可能的并发冲突
    WHILE v_retry_count < p_max_retries LOOP
        -- 锁定并获取当前积分（使用SELECT FOR UPDATE）
        SELECT credits INTO v_current_credits
        FROM public.profiles
        WHERE id = p_user_id
        FOR UPDATE;
        
        -- 检查用户是否存在
        IF v_current_credits IS NULL THEN
            RETURN QUERY SELECT FALSE, NULL::INTEGER, 'User not found'::TEXT;
            RETURN;
        END IF;
        
        -- 检查积分是否足够
        IF v_current_credits < p_amount THEN
            RETURN QUERY SELECT FALSE, v_current_credits, 'Insufficient credits'::TEXT;
            RETURN;
        END IF;
        
        -- 计算新积分
        v_new_credits := v_current_credits - p_amount;
        
        -- 执行更新
        UPDATE public.profiles
        SET credits = v_new_credits, updated_at = NOW()
        WHERE id = p_user_id;
        
        -- 检查是否更新成功（affected rows = 1）
        IF FOUND THEN
            RETURN QUERY SELECT TRUE, v_new_credits, NULL::TEXT;
            RETURN;
        END IF;
        
        -- 如果更新失败（可能被其他事务更新），重试
        v_retry_count := v_retry_count + 1;
        v_sleep_time := 0.1 * v_retry_count; -- 递增延迟：100ms, 200ms, 300ms
        PERFORM pg_sleep(v_sleep_time);
    END LOOP;
    
    -- 达到最大重试次数
    RETURN QUERY SELECT FALSE, v_current_credits, 'Transaction conflict, please retry'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 24. 数据库限流检查函数
-- 使用数据库实现真正的分布式限流
-- =====================================================
CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_identifier TEXT,
    p_action TEXT,
    p_max_requests INTEGER,
    p_window_seconds INTEGER
)
RETURNS TABLE(allowed BOOLEAN, remaining INTEGER, reset_in_seconds INTEGER) AS $$
DECLARE
    v_record RECORD;
    v_now TIMESTAMPTZ := NOW();
    v_window_start TIMESTAMPTZ;
    v_count INTEGER;
    v_reset_in INTEGER;
BEGIN
    -- 计算当前窗口开始时间
    v_window_start := v_now - (p_window_seconds || ' seconds')::INTERVAL;
    
    -- 查找现有记录
    SELECT id, count, window_start INTO v_record
    FROM public.rate_limits
    WHERE identifier = p_identifier AND action = p_action
    FOR UPDATE;
    
    IF NOT FOUND THEN
        -- 没有记录，创建新记录（允许请求）
        INSERT INTO public.rate_limits (identifier, action, count, window_start)
        VALUES (p_identifier, p_action, 1, v_now);
        
        RETURN QUERY SELECT TRUE, p_max_requests - 1, p_window_seconds;
        RETURN;
    END IF;
    
    -- 检查窗口是否过期
    IF v_record.window_start < v_window_start THEN
        -- 窗口过期，重置计数器
        UPDATE public.rate_limits
        SET count = 1, window_start = v_now
        WHERE id = v_record.id;
        
        RETURN QUERY SELECT TRUE, p_max_requests - 1, p_window_seconds;
        RETURN;
    END IF;
    
    -- 窗口未过期，检查计数
    v_count := v_record.count;
    v_reset_in := EXTRACT(EPOCH FROM (v_record.window_start + (p_window_seconds || ' seconds')::INTERVAL - v_now))::INTEGER;
    
    IF v_count >= p_max_requests THEN
        -- 超过限制
        RETURN QUERY SELECT FALSE, 0, GREATEST(v_reset_in, 0);
        RETURN;
    END IF;
    
    -- 未超过限制，增加计数
    UPDATE public.rate_limits
    SET count = count + 1
    WHERE id = v_record.id;
    
    RETURN QUERY SELECT TRUE, p_max_requests - v_count - 1, GREATEST(v_reset_in, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 清理过期限流记录的函数（可定期调用）
CREATE OR REPLACE FUNCTION public.cleanup_expired_rate_limits(p_max_age_hours INTEGER DEFAULT 24)
RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM public.rate_limits
    WHERE window_start < NOW() - (p_max_age_hours || ' hours')::INTERVAL;
    
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 25. 【安全】profiles 敏感列列级保护
-- =====================================================
-- 背景：Supabase 的 RLS 只能限制"行"，无法限制"列"。
--       策略 "Users can update own profile" 允许用户更新自己整行，
--       因此用户可用自己的 token 直接 PATCH credits / is_premium，
--       实现无限免费生成 —— 这会完全绕过服务端的原子扣减逻辑。
--
-- 规则：
--   - 直连数据库（SQL Editor / psql / migration）：无 request.jwt.claims，放行
--   - service_role（服务端 API）：放行（扣积分、支付回调加积分都走这里）
--   - anon / authenticated（浏览器端）：禁止修改敏感列，抛异常
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_columns()
RETURNS TRIGGER AS $$
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

    -- is_admin 列未必存在（当前以 admins 表为准），用 to_jsonb 动态判断
    IF (to_jsonb(NEW) ->> 'is_admin') IS DISTINCT FROM (to_jsonb(OLD) ->> 'is_admin') THEN
        RAISE EXCEPTION 'is_admin cannot be modified from the client';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS protect_profile_sensitive_columns ON public.profiles;
CREATE TRIGGER protect_profile_sensitive_columns
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_profile_sensitive_columns();

-- =====================================================
-- 26. 【安全】收紧 SECURITY DEFINER 函数的执行权限
-- =====================================================
-- 背景：函数默认对 PUBLIC 授予 EXECUTE，任何人用 anon key 即可通过
--       PostgREST 的 /rpc/ 端点调用这些高权限函数：
--       - atomic_deduct_credits：传任意 user_id 即可清空他人积分
--       - cleanup_expired_rate_limits：传 0 小时可清空全部限流记录，绕过限流
REVOKE EXECUTE ON FUNCTION public.atomic_deduct_credits(UUID, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_rate_limits(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_page_views(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_profile_sensitive_columns() FROM PUBLIC, anon, authenticated;

-- 触发器函数不允许被直接调用
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_access_stats_timestamp() FROM PUBLIC, anon, authenticated;

-- 服务端仍需调用
GRANT EXECUTE ON FUNCTION public.atomic_deduct_credits(UUID, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_rate_limits(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_page_views(UUID) TO service_role;

-- =====================================================
-- 27. 新增管理员（必须在此处 / 服务端执行；客户端已无法自助提权）
-- =====================================================
-- INSERT INTO public.admins (user_id, role)
-- SELECT id, 'admin' FROM auth.users WHERE email = 'admin@example.com'
-- ON CONFLICT (user_id) DO NOTHING;

-- =====================================================
-- 28. 【支付完整性】积分购买入账函数
-- =====================================================
-- 背景：原 webhook 实现存在三个问题：
--   1. 幂等竞态（先 SELECT 再 INSERT 且忽略插入错误）→ 并发重复投递会重复加分
--   2. 积分累加用 read-modify-write（读 credits 再写回）→ 并发到账会丢更新
--   3. 先加分后记账，中途失败会留下不一致状态
-- 方案：把「幂等判定 + 记账 + 加分」收敛到单个事务内完成，
--       以 payment_id 为幂等键并依赖 transactions.stripe_session_id 唯一约束。
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
    IF p_credits IS NULL OR p_credits <= 0 THEN
        RETURN QUERY SELECT FALSE, FALSE, NULL::INTEGER, 'credits must be positive'::TEXT;
        RETURN;
    END IF;

    IF p_payment_id IS NULL OR p_payment_id = '' THEN
        RETURN QUERY SELECT FALSE, FALSE, NULL::INTEGER, 'payment_id is required'::TEXT;
        RETURN;
    END IF;

    -- 幂等判定：同一 payment_id 已成功入账则直接返回
    IF EXISTS (
        SELECT 1 FROM public.transactions t
        WHERE t.stripe_session_id = p_payment_id
          AND t.status = 'completed'
    ) THEN
        SELECT p.credits INTO v_new_credits FROM public.profiles p WHERE p.id = p_user_id;
        RETURN QUERY SELECT TRUE, TRUE, v_new_credits, NULL::TEXT;
        RETURN;
    END IF;

    -- 记账（并发撞唯一约束 → 视为已被其他请求处理）
    BEGIN
        INSERT INTO public.transactions (user_id, stripe_session_id, amount, credits, type, status)
        VALUES (p_user_id, p_payment_id, p_amount, p_credits, 'purchase', p_status);
    EXCEPTION WHEN unique_violation THEN
        SELECT p.credits INTO v_new_credits FROM public.profiles p WHERE p.id = p_user_id;
        RETURN QUERY SELECT TRUE, TRUE, v_new_credits, NULL::TEXT;
        RETURN;
    END;

    -- 原子加积分（单条 UPDATE，避免 lost update）
    UPDATE public.profiles
    SET credits = COALESCE(credits, 0) + p_credits,
        updated_at = NOW()
    WHERE id = p_user_id
    RETURNING credits INTO v_new_credits;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'profile not found for user %', p_user_id;
    END IF;

    RETURN QUERY SELECT TRUE, FALSE, v_new_credits, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 权限：可指定任意 user_id 增加积分，仅允许 service_role 调用
REVOKE EXECUTE ON FUNCTION public.process_credit_purchase(TEXT, UUID, INTEGER, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.process_credit_purchase(TEXT, UUID, INTEGER, NUMERIC, TEXT) TO service_role;

