# 交接文档 — 安全加固 + 技术 SEO（2026-10）

> 本文档覆盖本轮全部改动：**安全修复（P0-P3）→ 工程质量（P4）→ 技术 SEO**
> 共 **11 个提交**，全部已推送到 `origin/main` 并线上验证。
>
> 仓库：https://github.com/flashbulb78/ai-cartoon-website
> 线上：https://www.magicyoyoyo.com

---

## 一、⚠️ 上线后必须确认的三件事

### 1. 数据库迁移是否都已执行

三个脚本都在 `lib/supabase/migrations/`（**在 Supabase Dashboard → SQL Editor 里粘贴执行**）：

| 脚本 | 作用 | 状态 |
|---|---|---|
| `20260824_security_fix_rls.sql` | 修复 RLS 权限提升、profiles 积分篡改、函数越权 | 已确认执行 ✅（触发器已装） |
| `20260824_payment_integrity.sql` | 新增 `process_credit_purchase()`（支付幂等入账） | **请确认** |
| `20260824_security_fix_verify.sql` | **只读自检脚本**（不改数据），输出 8 项 PASS/FAIL | 建议现在跑一次 |

**自检期望结果（8 项全 PASS）：**

```
1. 业务表完整性              ✅ PASS
2. RLS 策略角色范围          ✅ PASS
3. admins 表写保护           ✅ PASS
4. profiles 敏感列保护       ✅ PASS
5. 高权限函数越权            ✅ PASS
6. 支付审计表 transactions   ✅ PASS
7. rate_limits 写保护        ✅ PASS
8. 支付入账函数 process_credit_purchase  ✅ PASS
```

> 若第 8 项 FAIL → 说明 `20260824_payment_integrity.sql` 没执行，**支付成功后积分不会到账**（webhook 会返回 5xx，Dodo 会重试但一直失败）。

### 2. 两个环境变量

| 变量 | 要求 |
|---|---|
| `NEXT_PUBLIC_BASE_URL` | 必须是 `https://www.magicyoyoyo.com`（当前正确）。它决定 `metadataBase`、canonical、robots、sitemap 里的绝对 URL —— 写错会导致 canonical 指向别处，对 SEO 有害 |
| `IMAGE_PROXY_ALLOWED_HOSTS` | 可选。逗号分隔，用于扩展图片代理的域名白名单。默认已含 `minimaxi.com` / `minimax.io` / `minimax.chat` / `aliyuncs.com` 及其子域 |

### 3. 主链路回归（改动触及权限与支付写入路径）

| # | 测试 | 期望 |
|---|---|---|
| 1 | 登录 → 上传照片 → 生成头像 | 成功、积分 -1、图片正常显示 |
| 2 | 点「下载」 | 存下来的文件扩展名是 **`.jpg`**（生成图实为 JPEG） |
| 3 | 走一笔真实小额支付 | 支付成功页显示成功 + 积分到账 |
| 4 | 访问 `/checkout/success?payment_id=随意字符串` | **不显示**"支付成功"，而是"正在确认" |
| 5 | 未登录访问 `/api/image-proxy?url=https://evil.com/x.png` | **401**（登录后为 403） |
| 6 | 系统深色时点主题切换为「浅色」 | **能切成浅色**（此前是 Bug） |
| 7 | 刷新任意页面 | 主题**不闪白** |
| 8 | 后台日志页（F12 → Network） | 首次进入**只发 1 次**请求 |
| 9 | `user_login_logs` 表 | 登录后有新记录 |

---

## 二、改动清单

### 2.1 安全（原 P0）

| 问题 | 修复 | 主要文件 |
|---|---|---|
| RLS 策略 `FOR ALL USING (true)` 未限定角色 → **任何人持 anon key 就能把自己写进 `admins` 表提权**，读取全站登录日志 | 11 张表策略统一改为 `TO service_role` | `lib/supabase/database.sql`、migrations SQL |
| `profiles` 更新策略无列级限制 → **用户可直接 PATCH `credits` 刷积分** | 新增 `protect_profile_sensitive_columns()` 触发器，按角色分级放行 | 同上 |
| `SECURITY DEFINER` 函数默认对 PUBLIC 开放 → **可清空他人积分 / 清空限流记录** | `REVOKE anon,authenticated` + `GRANT service_role` | 同上 |
| 管理鉴权不一致（`/api/admin/stats` 依赖 schema 里不存在的 `profiles.is_admin`，可能 500） | 统一改用 `admins` 表 | `app/api/admin/stats/route.ts` |
| 登录日志写入用用户会话（策略收紧后会失败） | 改用 service_role（admin client） | `app/api/auth/callback/route.ts` |

### 2.2 支付链路（原 P1）

| 问题 | 修复 | 主要文件 |
|---|---|---|
| **Webhook 幂等竞态**：先查后插且忽略插入错误 → 并发重复投递**会重复发积分** | 新增 `process_credit_purchase()`：单事务内完成「幂等判定 + 记账 + 加积分」，以 `payment_id` + 唯一约束保证幂等 | `app/api/dodo/webhook/route.ts`、migrations SQL |
| 积分累加是 read-modify-write → 并发到账**丢更新** | 改为单条原子 `UPDATE ... credits + N` | 同上 |
| 处理失败却返回 200 → Dodo 不再重试，积分永久丢失 | 失败返回 **5xx**（配合幂等，可安全重试） | 同上 |
| `/checkout/success` **无条件显示"支付成功"** | 改为本地交易 + Dodo API 权威校验 + **支付归属校验**；无法确认时显示"正在确认" | `app/checkout/success/page.tsx` |
| `/api/dodo/payment-status` 返回与查询无关的"最近一条交易" | 按 `payment_id` 权威查询 + 本地核对 | `app/api/dodo/payment-status/route.ts` |
| Dodo 创建会话时返回的 `payment_id` 被忽略 | 透传并用于对账 | `lib/dodopayment.ts`、`app/api/dodo/create-checkout/route.ts` |

### 2.3 限流与前端反模式（原 P2）

| 问题 | 修复 | 主要文件 |
|---|---|---|
| `createRateLimiter(config, action='api')` 的默认值导致**所有接口共用一个限流计数桶**，各档位互相污染 | `action` 改为**必填**，调用处显式传 `'generate'` / `'auth'` | `lib/rateLimit.ts`、`app/api/generate/route.ts`、`app/api/auth/callback/route.ts` |
| `useFaceCrop` **在渲染期间读取 ref** → `isModelLoaded` 永远是初始值 | 改为 state（ref 仅用于异步流程内部判断） | `hooks/useFaceCrop.ts` |
| 后台日志页**两个 effect 都会在挂载时请求**（重复请求）+ effect 内同步 setState | 合并为单一 effect；新增请求序号保护（丢弃过期响应） | `app/admin/logs/page.tsx` |

### 2.4 防滥用（原 P3）

| 问题 | 修复 | 主要文件 |
|---|---|---|
| 图片代理是**未认证开放代理**（任意 https + CORS `*` + 无限流/体积）→ SSRF、被当免费代理、内存 DoS | 8 项约束：登录 + 限流 + 域名白名单 + 仅 https + 拒绝 IP/内网 + 禁跟随重定向 + 仅图片类型 + 体积上限（流式计数，超限即中断上游）+ 去掉通配 CORS | `app/api/image-proxy/route.ts`、`lib/hostAllowlist.ts`、`lib/requestLimits.ts` |
| 生成接口**只查有没有图片，不查图片是什么**（前端校验可绕过） | 请求体上限 + 图片魔数/体积/分辨率校验 | `app/api/generate/route.ts`、`lib/imageValidation.ts` |
| `next.config` 图片优化白名单为 `**`（`/_next/image` 可代理任意 https） | 收紧为具体域名 | `next.config.ts` |

### 2.5 工程质量（原 P4）

| 问题 | 修复 | 主要文件 |
|---|---|---|
| **主题 FOUC**：深色用户刷新会先闪一下浅色 | 在 `<head>` 内联阻塞脚本，首次绘制前写入主题 | `app/layout.tsx`、`lib/theme.ts` |
| **浅色失效 Bug**：系统为深色时用户切"浅色"不生效（`applyTheme('light')` 只移除属性，被 CSS 媒体查询覆盖） | 明确写入 `data-theme="light" \| "dark"` | 同上 |
| 主题逻辑两套实现（`ThemeProvider` + `useTheme`） | 统一到 `lib/theme.ts`，删除这两个文件 | — |
| 死代码 | 删除废弃的性别检测（约 80 行）、`env.ts` 的空实现、14 个文件的未使用 import/变量；ESLint 警告 67 → 38 | 多处 |
| **双锁文件**（npm + pnpm） | 验证 `pnpm-lock.yaml` 与 `package.json` 一致后删除 `package-lock.json` | — |
| 无 CI | 新增 `.github/workflows/ci.yml`（**因 token 缺权限未推送，见附录 8**） | — |
| 生成图 `data URL` MIME 前缀错误（实际是 JPEG 却标成 PNG → 下载得到错误扩展名） | 按真实字节嗅探类型 | `lib/minimax.ts`、`lib/imageValidation.ts`、`lib/utils.ts` |

### 2.6 技术 SEO

| 项目 | 实现 | 主要文件 |
|---|---|---|
| robots.txt | `app/robots.ts`（排除需登录页、接口、后台，并声明 Sitemap 地址） | `app/robots.ts` |
| sitemap.xml | `app/sitemap.ts`（只收录 `/` 与 `/pricing/`，URL 带尾斜杠以匹配 `trailingSlash`） | `app/sitemap.ts` |
| 站点 URL 唯一来源 | `lib/siteConfig.ts`（供 metadata / robots / sitemap 共用，避免域名不一致） | `lib/siteConfig.ts` |
| metadataBase | 补齐（**缺它时相对路径会导致构建报错**） | `app/layout.tsx` |
| 首页可收录内容 | 首页本身已有真实内容（32KB HTML，含标题/风格名/示例图） | — |
| **定价页可收录内容** | 改为服务端取数（此前 HTML 里 `Starter`、`1.49` 命中 **0 次**，即空白页）；使用 ISR `revalidate = 3600` | `app/pricing/page.tsx`、`app/pricing/PricingClient.tsx`、`lib/supabase/server.ts`（新增 `createPublicReadClient`） |
| 每页独立标题 | 根 layout 用 `title.template`，各页写自己的标题 | `app/layout.tsx`、`app/pricing/page.tsx` |
| 结构化数据 | `SoftwareApplication` + `AggregateOffer`（报价**由真实套餐数据计算**，不硬编码；**不加** `aggregateRating`） | `lib/structuredData.ts` |
| og 分享图 | `public/og.png`（1200×630）+ `openGraph`/`twitter` 完整配置 | `scripts/generate-og-image.js` |
| 首页 LCP 图片 | 246KB JPEG → **38KB WebP**（768px） | `scripts/optimize-sample-image.js` |
| 清理死资源 | 删除 11 个 0 引用文件（约 520KB） | — |
| 回归测试 | 82 项（`bash scripts/verification/run.sh`） | `scripts/verification/` |


---

## 三、验证方法（可直接复制粘贴）

### 3.1 本地四项检查（每次改动后必跑）

```bash
cd /Users/superman/Desktop/ai-cartoon-website

npx tsc --noEmit                  # 类型检查
npx eslint .                      # 应 0 errors（38 个 warning 是历史遗留，不影响）
bash scripts/verification/run.sh  # 回归测试，应「82 项全通过」
npx next build                    # 生产构建
```

> `scripts/verification/run.sh` 覆盖：图片校验（魔数/体积/尺寸）、代理白名单与 SSRF 拦截、请求体积限流、主题逻辑（含"系统深色不能覆盖用户浅色选择"的回归用例）、结构化数据。
> 改动 `lib/imageValidation.ts`、`lib/hostAllowlist.ts`、`lib/requestLimits.ts`、`lib/theme.ts`、`lib/structuredData.ts` 后**务必跑一次**。

### 3.2 线上全路径健康检查

```bash
for p in '' 'pricing/' 'og.png' 'robots.txt' 'sitemap.xml' \
         'google46ed066389c13721.html' 'samples/example.webp' 'logo_192.png'; do
  printf '/%-38s ' "$p"
  curl -s -o /dev/null -m 20 -w 'HTTP %{http_code}\n' "https://www.magicyoyoyo.com/$p"
done
```

期望：**全部 200**。
额外确认 `/samples/example.png` 应为 **404**（旧文件已删除）。

### 3.3 SEO 关键项

```bash
# 标题：首页不应带模板后缀；子页应带 " | Magic Cartoon Avatar"
curl -s https://www.magicyoyoyo.com/          | grep -o '<title>[^<]*</title>'
curl -s https://www.magicyoyoyo.com/pricing/  | grep -o '<title>[^<]*</title>'

# 社交分享图：应为绝对 URL
curl -s https://www.magicyoyoyo.com/ | grep -o 'og:image" content="[^"]*"' | head -1

# canonical（定价页）
curl -s https://www.magicyoyoyo.com/pricing/ | grep -o 'rel="canonical" href="[^"]*"'

# 结构化数据存在
curl -s https://www.magicyoyoyo.com/pricing/ | grep -c 'application/ld+json'

# sitemap 内容
curl -s https://www.magicyoyoyo.com/sitemap.xml | grep '<loc>'
```

### 3.4 分享卡片人工确认

把 `https://www.magicyoyoyo.com/` 粘贴到 **Discord / Telegram** 聊天框，应展开一张 1200×630 的卡片。

> 各平台会缓存 OG 图。改了 `og.png` 后若预览仍是旧的，把 `app/layout.tsx` 里的 `/og.png` 改成 `/og.png?v=2` 即可强制刷新。

### 3.5 数据库自检

在 Supabase SQL Editor 执行 `lib/supabase/migrations/20260824_security_fix_verify.sql`（**只读，不改数据**），期望 **8 项全 PASS**。

---

## 四、回滚方案

### 4.1 代码回滚（推荐用 Vercel）

**方式 A（最快）**：Vercel 控制台 → 项目 → Deployments → 找到上一个正常部署 → **Promote to Production**。
不改 git 历史、立即生效。

**方式 B**：`git revert <sha>` 然后 push（会触发一次新部署）。适合要"留下回滚记录"的场景。

```bash
git --no-pager log --oneline -12      # 找到要回滚的提交
git revert <sha>                       # 生成一个反向提交
git push origin main
```

### 4.2 ⚠️ 以下**不要**回滚

| 项目 | 回滚后果 |
|---|---|
| RLS 策略收紧（`20260824_security_fix_rls.sql`） | **重新打开提权漏洞**：任何持公开 anon key 的人都能把自己写进 `admins` 表成为管理员，读取全站登录日志 |
| `profiles` 敏感列触发器 | 用户可**直接 PATCH 自己的 `credits`** 无限免费生成 |
| SECURITY DEFINER 函数权限收紧 | **任何人都能清空他人积分 / 清空限流记录** |
| `process_credit_purchase()` 函数 | 新版 webhook 依赖它；删除会导致**支付后积分不到账** |
| `public/google46ed066389c13721.html` | Google 会定期复查；删除会导致 **GSC 验证失效**，丢失数据与 sitemap 提交能力 |
| `lib/siteConfig.ts` 中的域名 | canonical/sitemap 会指向错误域名，对 SEO 有害 |

### 4.3 恢复被删除的静态资源（如确需）

```bash
git checkout 710f585~1 -- public/logo_512.png     # 从历史恢复指定文件
```

### 4.4 重新生成图片资源

```bash
node scripts/generate-og-image.js        # 重新生成 public/og.png（改文案请先编辑脚本里的 SVG）
node scripts/generate-test-fixtures.js   # 重新生成测试样本
node scripts/optimize-sample-image.js    # 示例图（需先把原图放回 public/samples/example.png）
node scripts/verify-og-image.js          # 校验 og 图文案/图片是否真的渲染成功
```

> 这些脚本依赖 `sharp`，它随 Next.js 作为**可选依赖**安装，**故意未写入 `package.json`**。若报错找不到 sharp：`npm i -D sharp`。


---

## 五、日常维护手册

### 5.1 改价格 / 改套餐（无需发版）

改 Supabase 的 `pricing_packages` 表即可，**页面与结构化数据都会自动跟随**：

- 页面用的是 ISR（`revalidate = 3600`），最多 1 小时后自动更新
- JSON-LD 的 `lowPrice` / `highPrice` / `offerCount` 由**同一份数据**计算，不会与页面不一致
- 想立刻生效：Vercel 里手动 Redeploy 一次（刷新 ISR 缓存）

### 5.2 改首页示例图 / og 分享图

见 4.4 的脚本。og 图改完请跑 `node scripts/verify-og-image.js` 确认渲染成功。

### 5.3 加新页面到 sitemap

编辑 `app/sitemap.ts`，往数组里加一条即可。三个注意点：

1. 只加「公开、无需登录、有实际内容」的页面（需登录页/事务页/后台不要加）
2. URL **必须带尾斜杠**（项目启用了 `trailingSlash: true`，否则每条 URL 都会多一次 308 跳转）
3. `lastModified` 用 `CONTENT_LAST_MODIFIED` 常量，**不要用 `new Date()`** —— 那样每次部署都会声称所有页面刚更新过，长期会被 Google 忽略该字段

### 5.4 新增"可被搜索收录"的页面

要导出 `metadata` 的页面**不能**是 `'use client'`。正确拆法：

```
app/xxx/page.tsx        → 服务端组件：export const metadata + 服务端取数
app/xxx/XxxClient.tsx   → 'use client'：交互与状态
```

参考现成实现：`app/pricing/page.tsx` + `app/pricing/PricingClient.tsx`

> 若服务端要读**公开数据**（如套餐），请用 `lib/supabase/server.ts` 的 `createPublicReadClient()`
> —— 带 cookies 的 `createClient()` 会让路由变为动态渲染，使 ISR 失效。

### 5.5 删 `public/` 里的文件前

```bash
grep -rl "文件名" . --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git
```

确认 0 引用再删。**回归测试用的是 `scripts/verification/fixtures/` 里的独立样本，不依赖 `public/` 的业务图片**，所以业务图片可以放心删改。

### 5.6 支付相关注意事项

| 事项 | 说明 |
|---|---|
| **部署顺序** | 若代码依赖新的 DB 函数，**先跑 SQL 再部署代码** |
| webhook 失败 | 返回 5xx（Dodo 会重试）；可在 `webhook_logs` 表看 `status='failed'` 与 `error` 字段 |
| 幂等键 | `payment_id`（存放在 `transactions.stripe_session_id`）；重复投递不会重复加分 |
| 支付成功页 | 只有「本地交易记录为 completed」或「Dodo API 确认 succeeded 且归属正确」才显示成功 |
| 手动补发积分（异常时） | 在 SQL Editor 调 `select * from process_credit_purchase('<payment_id>', '<user_id>', <credits>, <amount>, 'completed');` |

---

## 六、已知遗留问题（均不影响线上主链路）

| # | 问题 | 影响 | 建议 |
|---|---|---|---|
| 1 | **首页「Fidelity」滑块不生效**：`fidelity` 参数传入 `lib/minimax.ts` 后被忽略，请求体里 `denoising_strength` 是固定值 0.35 | 用户调整该滑块没有实际效果 | 需先确定映射关系并实测生成效果；已在代码注释中标注，未擅自改动 |
| 2 | 生成图以 base64 存库（约 252KB JPEG ≈ 336KB/行），当前只保留最近 10 条 | 单用户上限约 3.4MB；总量 ≈ 用户数 × 3.4MB | 可选：A) 迁 Supabase Storage（需同步改下载/canvas 逻辑，有回归风险）B) 引入 sharp 服务端转码（零回归）C) 只调整保留策略 |
| 3 | 孤儿模块（0 引用）：`lib/log-record.ts`、`lib/circularCrop.ts`、`lib/env.ts` | 无功能影响 | 可删；其中 `circularCrop.ts` 较新（配合 image-proxy 做圆角导出），删前请确认是否还要接 |
| 4 | 除 `/pricing` 外，`creations`/`profile`/`auth` 页共用根标题 | SEO 影响很小（这些页多在 robots 中已禁止抓取） | 如需独立标题，按 5.4 拆分 |
| 5 | 3 个算法文件（`colorDetection.ts`、`faceAnalysis.ts`、`localBeardDetection.ts`）内约 25 处未使用变量 | 无功能影响，是 ESLint 警告的主要来源 | **有意保留**：属深层算法代码，清理收益极低、误改风险高 |
| 6 | CI 未启用（`.github/workflows/ci.yml` 未能推送） | 无自动化检查 | 见附录 8 |
| 7 | `public/og.png` 302KB 偏大 | 功能正常，分享抓取稍慢 | 可改输出 JPEG（约 100KB） |
| 8 | `next.config.ts` 的 `images.remotePatterns` 已收紧为白名单 | 若以后用 `next/image` 加载其他域名的图片会报错 | 按需在白名单里加域名 |


---

## 七、关键文件索引

### 新增（本轮）

| 文件 | 用途 |
|---|---|
| `lib/siteConfig.ts` | 站点绝对 URL / 名称 / 描述的唯一来源（metadata、robots、sitemap 共用） |
| `lib/theme.ts` | 主题唯一来源 + 内联初始化脚本（消除 FOUC） |
| `lib/hostAllowlist.ts` | 图片代理域名白名单与 SSRF 防护（IP/内网地址拦截） |
| `lib/imageValidation.ts` | 服务端图片校验：魔数嗅探、体积、尺寸、类型判断 |
| `lib/requestLimits.ts` | 流式请求/响应体积限制（超限即中断上游） |
| `lib/structuredData.ts` | JSON-LD 结构化数据生成与安全序列化 |
| `app/robots.ts` / `app/sitemap.ts` | `/robots.txt` 与 `/sitemap.xml` |
| `app/pricing/PricingClient.tsx` | 定价页的客户端交互部分（数据由服务端传入） |
| `scripts/verification/` | 回归测试（82 项）与独立测试样本 `fixtures/` |
| `scripts/generate-og-image.js` | 生成 `public/og.png`（社交分享图） |
| `scripts/verify-og-image.js` | 用像素统计校验 og 图文字/图片渲染成功 |
| `scripts/measure-og-text.js` | 测量 og 图文字像素范围（防止与头像重叠） |
| `scripts/optimize-sample-image.js` | 首页示例图转 768px WebP |
| `scripts/generate-test-fixtures.js` | 生成测试样本图片 |
| `lib/supabase/migrations/*.sql` | 3 个 SQL 脚本（2 个迁移 + 1 个只读自检） |
| `HANDOVER.md` | 本文档 |

### 删除（本轮）

| 文件 | 原因 |
|---|---|
| `components/ThemeProvider.tsx`、`hooks/useTheme.ts` | 主题逻辑统一到 `lib/theme.ts` |
| `package-lock.json` | 统一使用 pnpm（已验证 `pnpm-lock.yaml` 与 `package.json` 一致） |
| `public/logo_512.png`、`avatar_logo.jpg`、`avatar_logo_120.jpg`、`favicon_32.png`、`favicon_48.png`、5 个 create-next-app 占位 svg | 0 引用死资源（约 520KB） |
| `public/samples/example.png` | 换成 `example.webp`（246KB → 38KB） |

### 关键逻辑集中在这些文件（改动时需谨慎）

| 文件 | 说明 |
|---|---|
| `app/api/generate/route.ts` | 生成接口：限流 → 鉴权 → 服务端图片校验 → 调 AI → 原子扣分 |
| `app/api/dodo/webhook/route.ts` | 支付回调：验签 → 事件登记 → `process_credit_purchase` 原子入账 |
| `app/api/image-proxy/route.ts` | 受控图片代理（8 项安全约束） |
| `app/pricing/page.tsx` | 定价页服务端取数 + JSON-LD |
| `app/layout.tsx` | 主题初始化脚本 + 根 metadata |
| `lib/supabase/database.sql` | 完整建库脚本（含安全策略与函数，供全新环境使用） |

---

## 八、附录：CI 工作流（未能推送，需手动启用）

### 8.1 为什么没启用

推送时 GitHub 拒绝了包含 `.github/workflows/ci.yml` 的提交：

```
! [remote rejected] main -> main
  (refusing to allow a Personal Access Token to create or update workflow
   `.github/workflows/ci.yml` without `workflow` scope)
```

原因：你本地的 classic PAT（`ghp_7ymBZBg…`）只有 `repo` 权限，**缺 `workflow`**。
这是 GitHub 的防滥用限制，与代码无关。为了不阻塞代码上线，当时把该文件从提交中移除了。

### 8.2 启用方式（二选一）

**方式一：给 token 加权限（一劳永逸）**
1. 打开 https://github.com/settings/tokens
2. 找到以 `ghp_7ymBZBg…` 开头的 token → 点进去
3. 勾选 ☑️ **`workflow`** → 点 **Update token**
4. 把下面 8.3 的内容保存为 `.github/workflows/ci.yml`，然后 `git add . && git commit -m "ci: 启用 CI" && git push origin main`

**方式二：用 GitHub 网页添加（不用改 token）**
仓库页 → **Add file** → **Create new file** → 文件名填 `.github/workflows/ci.yml` → 粘贴 8.3 的内容 → **Commit changes**

### 8.3 CI 文件内容（完整）

```yaml
name: CI

on:
  push:
  pull_request:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    name: Lint / Typecheck / Tests / Build
    runs-on: ubuntu-latest

    env:
      # next build 会在静态预渲染时构造 Supabase 客户端，因此需要这两个公开变量。
      # 未配置 Secrets 时使用占位值 —— 足以让构建通过，且不会发起真实网络请求。
      NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co' }}
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key-for-ci' }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 11

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Typecheck
        run: npx tsc --noEmit

      - name: Regression tests
        run: bash scripts/verification/run.sh

      - name: Build
        run: pnpm build
```

> 说明：
> - 该流程已在本地完整模拟通过（lint ✅ / typecheck ✅ / 82 项测试 ✅ / build ✅）
> - 构建需要 Supabase 公开变量；未配置 Secrets 时用占位值，实测可构建成功
> - `pnpm` 版本 11 与本地一致；CI 用 `--frozen-lockfile` 保证依赖可复现

---

## 九、下一步（业务层面）

技术 SEO 已无短板，剩下的是**内容与时间**：

| 时间点 | 看哪里 | 期望 |
|---|---|---|
| 2~3 天后 | GSC →「网页」 | 是否出现「已编入索引」 |
| 7 天后 | GSC →「效果」 | 是否开始有「曝光次数」（有曝光=已进索引） |

**建议不要在收录期间频繁改动站点结构**（会让 Google 反复重新评估）。

可考虑做的内容方向（能带来长尾自然流量）：
- 「13 种卡通风格对比」图文页
- 「Discord / TikTok / Instagram 头像尺寸指南」
- 「如何把真人照片变成皮克斯风头像」

---

*文档生成于 2026-10，覆盖提交 `f21178e..2327b79`（共 11 个提交）。*

