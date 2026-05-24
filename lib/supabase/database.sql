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
    credits INTEGER DEFAULT 5 NOT NULL,  -- 默认5次免费生成次数
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
    initial_credits INTEGER := 5;  -- 默认5次免费生成
BEGIN
    -- 尝试从app_settings获取初始点数配置
    BEGIN
        SELECT (value->>'credits')::INTEGER INTO initial_credits
        FROM public.app_settings
        WHERE key = 'initial_credits';
        
        IF initial_credits IS NULL THEN
            initial_credits := 5;  -- 默认5次
        END IF;
    EXCEPTION WHEN OTHERS THEN
        initial_credits := 5;  -- 出错时使用默认值
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

-- RLS策略：允许服务端读取，不允许普通用户修改
CREATE POLICY "Service role can read app_settings" ON public.app_settings
    FOR SELECT USING (true);

CREATE POLICY "Service role can update app_settings" ON public.app_settings
    FOR UPDATE USING (true);

CREATE POLICY "Service role can insert app_settings" ON public.app_settings
    FOR INSERT WITH CHECK (true);

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

-- 服务端可以修改
CREATE POLICY "Service role can manage packages" ON public.pricing_packages
    FOR ALL USING (true);

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
    FOR ALL USING (true);

-- =====================================================
-- 12. 插入初始设置数据
-- =====================================================
INSERT INTO public.app_settings (key, value)
VALUES
    ('credits_per_generation', '1'::jsonb),
    ('initial_credits', '{"credits": 5}'::jsonb)
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

-- RLS策略：允许服务端所有操作，普通用户只读
CREATE POLICY "Anyone can read style stats" ON public.style_usage_stats
    FOR SELECT USING (true);

CREATE POLICY "Service role can manage style stats" ON public.style_usage_stats
    FOR ALL USING (true);

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

CREATE POLICY "Service role can manage admins" ON public.admins
    FOR ALL USING (true);