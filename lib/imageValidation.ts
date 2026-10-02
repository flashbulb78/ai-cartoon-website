/**
 * lib/imageValidation.ts
 * 服务端图片校验
 *
 * 为什么需要：浏览器端的校验（lib/utils.ts 的 validateImageFile）只作用于正常页面流程，
 * 任何人都可以绕过前端直接调用 /api/generate。因此服务端必须独立校验：
 *   1. 真的是图片吗（按文件头魔数判断，不能只信请求里自称的类型）
 *   2. 解码后有多大（防止超大 payload 吃内存 / 拉高 AI 调用成本）
 *   3. 分辨率是否合理（防止荒谬尺寸的画布）
 *
 * 设计原则：尺寸解析一旦遇到不确定的结构就「放行」（fail-open），
 *          宁可漏检也不能误杀合法图片。
 */

import { MAX_IMAGE_BYTES } from './requestLimits';

/** 允许的图片类型（与前端 ALLOWED_IMAGE_TYPES 对齐） */
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** 单边最大像素（与前端 MAX_IMAGE_WIDTH/HEIGHT 对齐） */
export const MAX_IMAGE_DIMENSION = 4096;

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
  /** 按文件头识别出的真实类型 */
  mimeType?: string;
  /** 解码后的字节数 */
  byteLength?: number;
  width?: number;
  height?: number;
}

/**
 * 校验 base64 图片载荷（支持带或不带 data URL 前缀）
 */
export function validateImagePayload(image: unknown): ImageValidationResult {
  if (typeof image !== 'string' || image.length === 0) {
    return { valid: false, error: 'Image data is required' };
  }

  // ---------- 1. 剥离 data URL 前缀 ----------
  let base64 = image;
  let declaredMime: string | undefined;

  const dataUrlMatch = /^data:([^;,]+);base64,([\s\S]*)$/.exec(image);
  if (dataUrlMatch) {
    declaredMime = dataUrlMatch[1].toLowerCase();
    base64 = dataUrlMatch[2];
  }

  if (base64.length === 0) {
    return { valid: false, error: 'Image data is required' };
  }

  // ---------- 2. 解码前先按长度估算，避免为超大字符串分配内存 ----------
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const approxBytes = Math.floor((base64.length * 3) / 4) - padding;

  if (approxBytes > MAX_IMAGE_BYTES) {
    return {
      valid: false,
      error: `Image is too large. Maximum size is ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB`,
    };
  }

  // ---------- 3. 解码 ----------
  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64, 'base64');
  } catch {
    return { valid: false, error: 'Invalid image data' };
  }

  if (bytes.length === 0) {
    return { valid: false, error: 'Image data is required' };
  }

  if (bytes.length > MAX_IMAGE_BYTES) {
    return {
      valid: false,
      error: `Image is too large. Maximum size is ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB`,
    };
  }

  // ---------- 4. 按文件头魔数判断真实类型 ----------
  const mimeType = sniffMimeType(bytes);
  if (!mimeType) {
    return {
      valid: false,
      error: 'Unsupported or corrupted image. Please upload a JPG, PNG, or WEBP file.',
    };
  }

  if (!ALLOWED_MIME_TYPES.includes(mimeType as (typeof ALLOWED_MIME_TYPES)[number])) {
    return { valid: false, error: 'Unsupported image format' };
  }

  if (declaredMime && declaredMime !== mimeType) {
    // 声明类型与真实类型不一致：仅记录，不拦截（例如 image/jpg 与 image/jpeg 的差异）
    console.warn('[ImageValidation] Declared mime differs from detected:', declaredMime, mimeType);
  }

  // ---------- 5. 分辨率上限（解析不出来则放行）----------
  const dimensions = sniffDimensions(bytes, mimeType);
  if (dimensions) {
    if (dimensions.width > MAX_IMAGE_DIMENSION || dimensions.height > MAX_IMAGE_DIMENSION) {
      return {
        valid: false,
        error: `Image resolution is too large. Maximum is ${MAX_IMAGE_DIMENSION}x${MAX_IMAGE_DIMENSION} pixels`,
      };
    }
    if (dimensions.width < 100 || dimensions.height < 100) {
      return {
        valid: false,
        error: 'Image resolution too low. Minimum is 100x100 pixels',
      };
    }
  }

  return {
    valid: true,
    mimeType,
    byteLength: bytes.length,
    width: dimensions?.width,
    height: dimensions?.height,
  };
}

/**
 * 仅解码 base64 的开头若干字符来嗅探真实图片类型
 *
 * 用途：MiniMax 返回的 base64 图像数据需要拼成 data URL，
 *       若前缀 MIME 与实际编码不符（例如把 JPEG 标成 image/png），
 *       会导致下载得到的文件扩展名错误、部分工具识别异常。
 */
export function sniffMimeTypeFromBase64(base64: string): string | null {
  // 24 个 base64 字符约等于 18 字节，足以覆盖 PNG / JPEG / WEBP 的魔数
  const head = base64.slice(0, 24);

  try {
    return sniffMimeType(Buffer.from(head, 'base64'));
  } catch {
    return null;
  }
}

/**
 * 按文件头魔数识别图片类型（不认识则返回 null）
 */
export function sniffMimeType(bytes: Uint8Array): string | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // WEBP: RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * 读取尺寸。解析失败返回 null（调用方按「放行」处理）
 *
 * 已实现：PNG、JPEG
 * 未实现：WEBP —— 其 VP8/VP8L/VP8X 变体结构差异较大，
 *         为避免误判导致合法图片被拒，这里选择不做尺寸校验（仅受体积上限约束）
 */
function sniffDimensions(
  bytes: Uint8Array,
  mimeType: string
): { width: number; height: number } | null {
  try {
    if (mimeType === 'image/png') return sniffPngDimensions(bytes);
    if (mimeType === 'image/jpeg') return sniffJpegDimensions(bytes);
    return null;
  } catch (error) {
    console.warn('[ImageValidation] Failed to parse dimensions:', error);
    return null;
  }
}

function readUInt32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) >>> 0) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function sniffPngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  // 签名 8 字节 + 块长度 4 字节 + 'IHDR' 4 字节 = 16，宽高分别在偏移 16 / 20
  if (bytes.length < 24) return null;

  const isIhdr =
    bytes[12] === 0x49 && bytes[13] === 0x48 && bytes[14] === 0x44 && bytes[15] === 0x52;

  if (!isIhdr) return null;

  return {
    width: readUInt32BE(bytes, 16),
    height: readUInt32BE(bytes, 20),
  };
}

function sniffJpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  let p = 2; // 跳过 SOI (FF D8)

  while (p + 1 < bytes.length) {
    if (bytes[p] !== 0xff) return null; // 结构不符，放弃解析

    let marker = bytes[p + 1];

    // 跳过填充用的 FF 字节
    while (marker === 0xff && p + 2 < bytes.length) {
      p += 1;
      marker = bytes[p + 1];
    }

    // 无长度字段的标记（SOI / EOI / TEM / RSTn）
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      p += 2;
      continue;
    }

    if (p + 3 >= bytes.length) return null;

    const segmentLength = (bytes[p + 2] << 8) | bytes[p + 3];
    if (segmentLength < 2) return null;

    // SOF0-SOF15：排除 DHT(0xC4) / JPG(0xC8) / DAC(0xCC)
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isStartOfFrame) {
      if (p + 8 >= bytes.length) return null;
      // 段结构：FF Cn | 长度2 | 精度1 | 高2 | 宽2
      return {
        height: (bytes[p + 5] << 8) | bytes[p + 6],
        width: (bytes[p + 7] << 8) | bytes[p + 8],
      };
    }

    // SOS（压缩数据开始）：未找到 SOF，放弃解析
    if (marker === 0xda) return null;

    p += 2 + segmentLength;
  }

  return null;
}

