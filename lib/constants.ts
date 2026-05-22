/**
 * lib/constants.ts
 * 全局常量配置
 */

import { StyleOption, CartoonStyle } from './types';

/**
 * 支持的图片格式
 */
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * 图片大小限制（10MB）
 */
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

/**
 * 图片最大宽度（4096px）
 */
export const MAX_IMAGE_WIDTH = 4096;

/**
 * 图片最大高度（4096px）
 */
export const MAX_IMAGE_HEIGHT = 4096;

/**
 * 13套风格选项列表（按照MiniMax标准化开发文档）
 */
export const STYLE_OPTIONS: StyleOption[] = [
  {
    id: 'pixar_3d_cartoon',
    name: 'Pixar 3D Cartoon',
    description: '3D Pixar cartoon style, soft smooth rendering, clean texture, warm soft lighting, cute friendly 3D character',
    emoji: '🎬',
  },
  {
    id: 'american_retro_cartoon',
    name: 'American Retro',
    description: 'American vintage cartoon style, bold clean outline, high saturation retro color, street fashion texture',
    emoji: '🇺🇸',
  },
  {
    id: 'cyberpunk_neon',
    name: 'Cyberpunk Neon',
    description: 'Cyberpunk futuristic portrait, neon glow light, dark tone background, tech texture, futuristic atmosphere',
    emoji: '🌃',
  },
  {
    id: 'minimal_illustration',
    name: 'Minimal Illustration',
    description: 'Minimal clean line illustration, simple elegant color matching, flat design, high sense premium portrait',
    emoji: '✨',
  },
  {
    id: 'japanese_anime',
    name: 'Japanese Anime',
    description: 'Premium Japanese anime style, bright clear eyes, soft gradient shading, youthful texture, clean comic line',
    emoji: '🎌',
  },
  {
    id: 'korean_soft_portrait',
    name: 'Korean Soft',
    description: 'Korean webtoon style, delicate soft skin, gentle tone, smooth shading, elegant and fresh portrait',
    emoji: '🇰🇷',
  },
  {
    id: 'japanese_watercolor',
    name: 'Watercolor',
    description: 'Japanese watercolor texture, warm soft color, transparent watercolor layering, healing artistic atmosphere',
    emoji: '🎨',
  },
  {
    id: 'gothic_dark',
    name: 'Gothic Dark',
    description: 'Dark gothic aesthetic, low saturation tone, mysterious atmosphere, elegant dark texture, subtle shadow detail',
    emoji: '🖤',
  },
  {
    id: 'vintage_pixel',
    name: 'Vintage Pixel',
    description: '8-bit retro pixel art, classic game nostalgic style, clear pixel outline, retro color palette',
    emoji: '👾',
  },
  {
    id: 'oil_painting',
    name: 'Oil Painting',
    description: 'Classic oil painting texture, artistic brush stroke, layered color, high-end art portrait, canvas texture',
    emoji: '🖼️',
  },
  {
    id: 'steampunk_vintage',
    name: 'Steampunk',
    description: 'Steampunk retro style, mechanical texture, metal vintage tone, retro gear detail, old industrial art atmosphere',
    emoji: '⚙️',
  },
  {
    id: 'chibi_q_version',
    name: 'Chibi Q Version',
    description: 'Super cute chibi style, proportional big head, lovely soft feature, warm color, cartoon cute texture',
    emoji: '🥰',
  },
  {
    id: 'street_sport',
    name: 'Street Sport',
    description: 'Modern street fashion style, youthful sports vibe, trendy clothing texture, energetic tone, casual street portrait',
    emoji: '🏂',
  },
];

/**
 * 默认卡通风格
 */
export const DEFAULT_STYLE: CartoonStyle = 'pixar_3d_cartoon';

/**
 * API超时时间（毫秒）
 */
export const API_TIMEOUT = 60000;

/**
 * 生成状态枚举
 */
export const GENERATION_STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error',
} as const;

/**
 * 错误消息映射（将技术错误转换为用户友好消息）
 */
export const ERROR_MESSAGES = {
  // 图片上传错误
  IMAGE_FORMAT: 'Please upload a JPG, PNG, or WEBP image',
  IMAGE_SIZE: 'Image is too large. Maximum size is 10MB',
  IMAGE_RESOLUTION: 'Image resolution must be between 100x100 and 4096x4096 pixels',
  IMAGE_READ_FAILED: 'Failed to read image. Please try another file',

  // 生成错误
  NO_IMAGE: 'Please upload a photo first',
  NO_STYLE: 'Please select a style',
  GENERATION_FAILED: 'Failed to generate avatar. Please try again',
  NETWORK_ERROR: 'Network error. Please check your connection',
  API_ERROR: 'Service error. Please try again later',
  TIMEOUT: 'Request timeout. Please try again',

  // 通用错误
  UNKNOWN: 'An unexpected error occurred',
} as const;

/**
 * 成功消息
 */
export const SUCCESS_MESSAGES = {
  GENERATED: 'Avatar generated successfully!',
  DOWNLOADED: 'Image downloaded!',
  COPIED: 'Image copied to clipboard!',
} as const;

/**
 * 响应式断点
 */
export const BREAKPOINTS = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
} as const;

/**
 * 主题色配置（蓝白配色）
 */
export const THEME = {
  primary: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
  },
  neutral: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
  },
} as const;