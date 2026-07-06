/**
 * lib/types.ts
 * 全局类型定义文件
 */

/**
 * 卡通风格枚举（13套标准化风格）
 */
export type CartoonStyle =
  | 'pixar_3d_cartoon'
  | 'american_retro_cartoon'
  | 'cyberpunk_neon'
  | 'minimal_illustration'
  | 'japanese_anime'
  | 'korean_soft_portrait'
  | 'japanese_watercolor'
  | 'gothic_dark'
  | 'vintage_pixel'
  | 'oil_painting'
  | 'steampunk_vintage'
  | 'chibi_q_version'
  | 'street_sport';

/**
 * 风格专属默认参数
 */
export interface StyleDefaultParams {
  faceSimilarity: number;
  styleStrength: number;
  fidelity: number;
}

/**
 * 13套风格的专属最优初始参数
 */
export const STYLE_DEFAULT_PARAMS: Record<CartoonStyle, StyleDefaultParams> = {
  pixar_3d_cartoon: { faceSimilarity: 0.9, styleStrength: 0.30, fidelity: 0.85 },
  american_retro_cartoon: { faceSimilarity: 0.9, styleStrength: 0.33, fidelity: 0.82 },
  cyberpunk_neon: { faceSimilarity: 0.88, styleStrength: 0.37, fidelity: 0.78 },
  minimal_illustration: { faceSimilarity: 0.92, styleStrength: 0.27, fidelity: 0.88 },
  japanese_anime: { faceSimilarity: 0.9, styleStrength: 0.33, fidelity: 0.82 },
  korean_soft_portrait: { faceSimilarity: 0.9, styleStrength: 0.30, fidelity: 0.85 },
  japanese_watercolor: { faceSimilarity: 0.9, styleStrength: 0.27, fidelity: 0.85 },
  gothic_dark: { faceSimilarity: 0.88, styleStrength: 0.37, fidelity: 0.78 },
  vintage_pixel: { faceSimilarity: 0.9, styleStrength: 0.30, fidelity: 0.82 },
  oil_painting: { faceSimilarity: 0.9, styleStrength: 0.27, fidelity: 0.85 },
  steampunk_vintage: { faceSimilarity: 0.88, styleStrength: 0.33, fidelity: 0.8 },
  chibi_q_version: { faceSimilarity: 0.92, styleStrength: 0.40, fidelity: 0.75 },
  street_sport: { faceSimilarity: 0.9, styleStrength: 0.33, fidelity: 0.82 },
};

/**
 * 风格选项配置
 */
export interface StyleOption {
  id: CartoonStyle;
  name: string;
  description: string;
  emoji: string;
}

/**
 * 图片上传状态
 */
export interface ImageUploadState {
  file: File | null;
  preview: string | null;
  isValid: boolean;
  error: string | null;
}

/**
 * 生成请求参数
 */
export interface GenerateRequest {
  image: string;  // Base64编码
  style: CartoonStyle;
  faceSimilarity?: number;  // 人脸相似度 (0.5-1.0), 可选，默认0.8
  styleStrength?: number;   // 风格强度 (0-1), 可选，默认0.4
  fidelity?: number;        // 还原度 (0-1), 可选，默认0.7
  genderForce?: 'male' | 'female';  // 强制性别，可选
  faceAnalysis?: FaceAnalysisResult;  // 人脸分析结果，可选
}

/**
 * 颜色属性（肤色、发色、眼睛颜色）
 */
export interface ColorAttributes {
  skinTone: 'light' | 'medium' | 'dark' | 'medium_light' | 'medium_dark' | 'unknown';
  skinColor: string; // hex
  hairColor: 'black' | 'brown' | 'blonde' | 'red' | 'gray' | 'white' | 'unknown';
  hairColorHex: string;
  eyeColor: 'brown' | 'blue' | 'green' | 'gray' | 'black' | 'unknown';
  eyeColorHex: string;
}

/**
 * 人种分类
 */
export type Ethnicity = 'white' | 'black' | 'yellow' | 'unknown';

/**
 * 头发形状
 */
export type HairShape = 'straight' | 'wavy' | 'curly' | 'coily' | 'unknown';

/**
 * 头发长度
 */
export type HairLength = 'bald' | 'very_short' | 'short' | 'medium' | 'long' | 'very_long' | 'unknown';

/**
 * 全面人脸分析结果
 */
export interface FaceAnalysisResult {
  // 基本信息
  faceDetected: boolean;
  faceCount: number;  // 检测到的人数
  
  // 性别相关
  gender: 'male' | 'female' | null;
  genderConfidence: number; // 0-1
  
  // 人种/肤色
  ethnicity: Ethnicity;
  ethnicityConfidence: number;
  
  // 颜色属性
  colorAttributes: ColorAttributes;
  
  // 头发特征
  hairShape: HairShape;
  hairLength: HairLength;
  hairBangs: boolean; // 是否有刘海
  hairBangsStyle: 'none' | 'side' | 'center' | 'unknown';
  
  // 面部特征（用于prompt描述）
  facialFeatures: {
    faceShape: 'oval' | 'round' | 'square' | 'heart' | 'oblong' | 'unknown';
    noseShape: 'straight' | 'curved' | 'round' | 'wide' | 'unknown';
    eyeShape: 'almond' | 'round' | 'hooded' | 'upturned' | 'downturned' | 'unknown';
    lipShape: 'full' | 'thin' | 'medium' | 'unknown';
    jawline: 'soft' | 'sharp' | 'medium' | 'unknown';
  };

  // 配饰属性（来自腾讯云API）
  accessories?: {
    hasGlasses: boolean;
    glassesType: 'none' | 'normal' | 'sunglasses' | 'myopia' | 'unknown';
    glassesFrameColor: 'black' | 'brown' | 'silver' | 'gold' | 'red' | 'blue' | 'white' | 'none' | 'unknown';
    hasBeard: boolean;
    beardLength: 'none' | 'short' | 'medium' | 'long' | 'unknown';
    beardShape: 'none' | 'thin' | 'thick' | 'trimmed' | 'full' | 'goatee' | 'unknown';
    beardColor: 'none' | 'black' | 'brown' | 'dark_brown' | 'gray' | 'white' | 'red' | 'blonde' | 'unknown';
    hasHat: boolean;
    hatColor: string | null;
    hasMask: boolean;
    hasOpenEyes: boolean;
  };
}

/**
 * 生成响应数据
 */
export interface GenerateResponseData {
  imageUrl: string;
  processingTime?: number;
}

/**
 * API响应格式
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * 用户资料（数据库profiles表）
 */
export interface UserProfile {
  id: string;
  email: string | null;
  username: string | null;   // 用户名
  full_name: string | null;
  avatar_url: string | null;
  credits: number;           // 剩余生成次数
  is_premium: boolean;      // 是否付费用户
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 用户配额信息
 */
export interface UserCredits {
  remaining: number;       // 剩余次数
  isPremium: boolean;      // 是否Premium用户
  totalUsed: number;       // 已使用次数
}

/**
 * 套餐信息（预留DodoPayment）
 */
export interface Plan {
  id: string;
  name: string;
  credits: number;
  price: number;
  priceId: string;  // DodoPayment Price ID
}

/**
 * 定价套餐（数据库驱动）
 */
export interface PricingPackage {
  id: string;
  name: string;
  credits: number;
  price: number;
  currency: string;
  description: string | null;
  is_active: boolean;
  is_highlighted: boolean;
  sort_order: number;
}

/**
 * 生成历史记录
 */
export interface GenerationHistory {
  id: string;
  user_id: string;
  original_image: string;
  generated_image: string;
  style: CartoonStyle;
  created_at: string;
}

/**
 * 使用量统计
 */
export interface UsageStats {
  totalGenerations: number;
  remainingCredits: number;
  lastGeneratedAt?: Date;
}