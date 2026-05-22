# AI Cartoon Avatar Generator - 架构设计文档

## 1. 项目目录结构

```
ai-cartoon/
├── app/
│   ├── layout.tsx              # 根布局（含字体、全局元数据）
│   ├── page.tsx               # 首页（主编辑器界面）
│   ├── globals.css            # 全局样式（Tailwind导入）
│   └── api/
│       └── generate/
│           └── route.ts       # 后端API路由（MiniMax中转）
├── components/
│   ├── ui/                    # 基础UI组件库
│   │   ├── Button.tsx         # 按钮组件
│   │   ├── Card.tsx           # 卡片组件
│   │   └── Loading.tsx        # 加载动画组件
│   ├── ImageUploader.tsx      # 图片上传组件
│   ├── StyleSelector.tsx      # 风格选择组件
│   ├── ResultViewer.tsx       # 结果预览/下载组件
│   └── Header.tsx             # 网站头部
├── lib/
│   ├── types.ts               # TypeScript类型定义
│   ├── minimax.ts             # MiniMax API调用逻辑
│   ├── constants.ts            # 常量配置
│   └── utils.ts               # 工具函数
├── hooks/
│   └── useImageUpload.ts      # 图片上传状态管理Hook
├── .env.local                  # 环境变量（API密钥）
└── plans/
    └── ARCHITECTURE.md         # 本文档
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
│                   │ │Generate│ │                            │
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
  style: 'japanese_anime' | 'cartoon' | 'q_version' | 'hand_drawn';
}
```

**响应体**:
```typescript
interface GenerateResponse {
  success: boolean;
  data?: {
    imageUrl: string;  // 生成的图片URL
  };
  error?: string;
}
```

### 3.2 MiniMax API调用流程

```
客户端请求 → /api/generate → 验证输入 → 调用MiniMax API → 返回结果
```

## 4. 状态管理

使用React Hook进行状态管理，无需引入外部状态库：
- `useImageUpload`: 管理图片上传状态（预览、删除、验证）
- 组件内部State: 风格选择、加载状态、生成结果

## 5. 扩展预留

### 5.1 登录功能预留
- 预留用户认证相关的接口定义
- 组件中预留用户状态展示位置

### 5.2 付费功能预留
- 生成按钮预留付费检查逻辑
- API路由预留调用次数限制接口

## 6. 关键实现细节

### 6.1 图片处理
- 支持格式: JPG, PNG, WEBP
- 大小限制: 10MB
- 预览: 使用FileReader生成Base64

### 6.2 风格定义
| 风格ID | 显示名称 | 描述 |
|--------|----------|------|
| japanese_anime | Japanese Anime | 日漫风格 |
| cartoon | Cartoon | 卡通风格 |
| q_version | Q Version | Q版风格 |
| hand_drawn | Hand Drawn | 手绘风格 |

### 6.3 响应式断点
- Mobile: < 640px
- Tablet: 640px - 1024px
- Desktop: > 1024px