# AI Cartoon Avatar Generator - 架构设计文档

## 1. 项目目录结构

```
ai-cartoon/
├── app/
│   ├── layout.tsx              # 根布局（含字体、全局元数据）
│   ├── page.tsx               # 首页（主编辑器界面）
│   ├── globals.css            # 全局样式（Tailwind导入）
│   ├── api/
│   │   ├── generate/
│   │   │   └── route.ts       # 后端API路由（MiniMax中转）
│   │   ├── checkout/
│   │   │   └── verify/        # Stripe支付验证
│   │   ├── pricing/
│   │   │   └── purchase/      # 定价套餐购买
│   │   └── admin/
│   │       └── stats/         # 管理员统计
│   ├── auth/                   # 认证相关页面
│   ├── pricing/               # 定价页面
│   ├── profile/               # 用户资料页面
│   ├── creations/             # 创作历史页面
│   └── checkout/success/      # 支付成功页面
├── components/
│   ├── ui/                    # 基础UI组件库
│   │   └── Button.tsx         # 按钮组件
│   ├── ImageUploader.tsx      # 图片上传组件
│   ├── StyleSelector.tsx      # 风格选择组件
│   ├── ResultViewer.tsx       # 结果预览/下载组件
│   ├── Header.tsx             # 网站头部
│   ├── GenerationParameters.tsx  # 生成参数控制
│   ├── PrivacyConsentModal.tsx   # 隐私同意弹窗
│   └── ThemeToggle.tsx         # 主题切换
├── lib/
│   ├── types.ts               # TypeScript类型定义
│   ├── minimax.ts             # MiniMax API调用逻辑
│   ├── faceAnalysis.ts        # 人脸分析模块
│   ├── colorDetection.ts      # 肤色/发色/眼睛颜色检测
│   ├── localBeardDetection.ts  # 本地胡须检测
│   ├── constants.ts            # 常量配置
│   ├── utils.ts               # 工具函数
│   ├── env.ts                 # 环境变量验证
│   └── supabase/              # Supabase配置
├── hooks/
│   ├── useFaceCrop.ts         # 人脸裁剪Hook
│   ├── useImageUpload.ts      # 图片上传状态管理Hook
│   └── useTheme.ts            # 主题切换Hook
├── contexts/
│   └── AuthContext.tsx        # 认证状态管理
├── public/
│   └── models/                # face-api.js模型文件
├── plans/
│   └── ARCHITECTURE.md        # 本文档
└── .env.local                  # 环境变量（API密钥）
```

## 2. 组件架构

```
┌─────────────────────────────────────────────────────────────┐
│                         HomePage                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │
│  │   Header    │  │   Main     │  │                     │   │
│  │  (Logo/Nav) │  │  Editor    │  │   ResultViewer      │   │
│  └─────────────┘  │  Area      │  │   (生成结果展示)     │   │
│                   │           │  │                     │   │
│                   │ ┌───────┐ │  └─────────────────────┘   │
│                   │ │Image  │ │                             │
│                   │ │Uploader│ │                             │
│                   │ └───────┘ │                             │
│                   │ ┌───────┐ │                             │
│                   │ │Style  │ │                             │
│                   │ │Selector│ │                            │
│                   │ └───────┘ │                             │
│                   │ ┌───────┐ │                             │
│                   │ │Generate│ │                             │
│                   │ │Button │ │                             │
│                   │ └───────┘ │                             │
│                   └───────────┘                             │
└─────────────────────────────────────────────────────────────┘
```

## 3. API设计

### 3.1 后端生成API

**端点**: `POST /api/generate`

**请求体**:
```typescript
interface GenerateRequest {
  image: string;      // Base64编码的图片
  style: CartoonStyle;  // 卡通风格
  faceSimilarity?: number;  // 人脸相似度 (0.5-1.0)
  styleStrength?: number;   // 风格强度 (0-1)
  fidelity?: number;        // 还原度 (0-1)
  genderForce?: 'male' | 'female';  // 强制性别
  faceAnalysis?: FaceAnalysisResult;  // 人脸分析结果
}
```

**响应体**:
```typescript
interface GenerateResponse {
  success: boolean;
  data?: {
    imageUrl: string;  // 生成的图片URL
    processingTime?: number;
  };
  error?: string;
}
```

### 3.2 MiniMax API调用流程

```
客户端请求 → /api/generate → 验证输入 → 调用MiniMax API → 返回结果
```

## 4. 状态管理

使用React Hook进行状态管理：
- `useAuth`: 管理用户认证状态
- `useFaceCrop`: 管理人脸裁剪状态
- `useImageUpload`: 管理图片上传状态
- `useTheme`: 管理主题切换状态

## 5. 13套卡通风格

| 风格ID | 显示名称 | 描述 |
|--------|----------|------|
| pixar_3d_cartoon | Pixar 3D Cartoon | 3D皮克斯卡通风格 |
| american_retro_cartoon | American Retro | 美式复古卡通 |
| cyberpunk_neon | Cyberpunk Neon | 赛博朋克霓虹 |
| minimal_illustration | Minimal Illustration | 极简插画风格 |
| japanese_anime | Japanese Anime | 日漫风格 |
| korean_soft_portrait | Korean Soft | 韩系柔焦肖像 |
| japanese_watercolor | Watercolor | 水彩风格 |
| gothic_dark | Gothic Dark | 哥特暗色风格 |
| vintage_pixel | Vintage Pixel | 复古像素风格 |
| oil_painting | Oil Painting | 油画风格 |
| steampunk_vintage | Steampunk | 蒸汽朋克风格 |
| chibi_q_version | Chibi Q Version | Q版可爱风格 |
| street_sport | Street Sport | 街头运动风格 |

## 6. 人脸分析功能

本地使用 face-api.js 进行人脸分析，包括：
- 人脸检测与裁剪
- 性别检测（多重算法加权）
- 人种检测
- 肤色/发色/眼睛颜色检测
- 眼镜检测与镜框颜色识别
- 胡须检测与分类
- 头发长度/形状/刘海检测
- 面部特征（脸型、鼻型、眼型、唇型、下颌线）

## 7. 扩展预留

### 7.1 登录功能
- 邮箱密码登录/注册
- Google OAuth登录
- 用户资料管理

### 7.2 付费功能
- Stripe支付集成
- 定价套餐管理
- 积分系统
- Premium会员

### 7.3 管理功能
- 管理员仪表盘
- 风格使用统计
- 代码修改记录

## 8. 关键实现细节

### 8.1 图片处理
- 支持格式: JPG, PNG, WEBP
- 大小限制: 10MB
- 分辨率要求: 100x100 - 4096x4096
- 预览: 使用FileReader生成Base64
- 人脸裁剪: 512x512 正方形

### 8.2 响应式断点
- Mobile: < 640px
- Tablet: 640px - 1024px
- Desktop: > 1024px

### 8.3 数据库
- Supabase (PostgreSQL)
- Row Level Security (RLS)
- 自动触发器创建用户profile