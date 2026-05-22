/**
 * lib/utils.ts
 * 工具函数库
 */

import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE, MAX_IMAGE_WIDTH, MAX_IMAGE_HEIGHT } from './constants';

/**
 * 格式化文件大小显示
 * @param bytes - 字节大小
 * @returns 格式化后的字符串，如 "1.5 MB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 获取图片尺寸
 * @param file - 图片文件
 * @returns Promise<{width: number, height: number}>
 */
export function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => {
      reject(new Error('Failed to load image'));
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  });
}

/**
 * 验证图片文件（格式、大小、分辨率）
 * @param file - 图片文件
 * @returns 验证结果对象
 */
export async function validateImageFile(
  file: File
): Promise<{ valid: boolean; error?: string }> {
  // 1. 验证文件格式
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as typeof ALLOWED_IMAGE_TYPES[number])) {
    return {
      valid: false,
      error: `Unsupported format. Please use: ${ALLOWED_IMAGE_TYPES.map(t => t.split('/')[1].toUpperCase()).join(', ')}`,
    };
  }

  // 2. 验证文件大小
  if (file.size > MAX_IMAGE_SIZE) {
    return {
      valid: false,
      error: `File too large. Maximum size is ${formatFileSize(MAX_IMAGE_SIZE)}`,
    };
  }

  // 3. 验证图片分辨率
  try {
    const dimensions = await getImageDimensions(file);
    if (dimensions.width < 100 || dimensions.height < 100) {
      return {
        valid: false,
        error: 'Image resolution too low. Minimum is 100x100 pixels',
      };
    }
    if (dimensions.width > MAX_IMAGE_WIDTH || dimensions.height > MAX_IMAGE_HEIGHT) {
      return {
        valid: false,
        error: `Image resolution too high. Maximum is ${MAX_IMAGE_WIDTH}x${MAX_IMAGE_HEIGHT} pixels`,
      };
    }
  } catch {
    return {
      valid: false,
      error: 'Failed to read image. Please try another file',
    };
  }

  return { valid: true };
}

/**
 * 将File转换为Base64编码
 * @param file - 文件对象
 * @returns Base64字符串
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
}

/**
 * 下载图片到本地
 * @param url - 图片URL（可以是data URL或网络URL）
 * @param filename - 下载后的文件名
 */
export function downloadImage(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * 复制Base64图片到剪贴板
 * @param dataUrl - 图片的data URL
 * @returns 是否复制成功
 */
export async function copyImageToClipboard(dataUrl: string): Promise<boolean> {
  try {
    // 将data URL转换为blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();

    // 使用Clipboard API复制
    await navigator.clipboard.write([
      new ClipboardItem({
        [blob.type]: blob,
      }),
    ]);
    return true;
  } catch (error) {
    console.error('Failed to copy image to clipboard:', error);
    return false;
  }
}

/**
 * 复制文本到剪贴板
 * @param text - 要复制的文本
 * @returns 是否复制成功
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Failed to copy text to clipboard:', error);
    // 降级方案：使用传统方法
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      textArea.remove();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * 生成随机ID
 * @returns 随机字符串
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

/**
 * 截断文本（超长显示省略号）
 * @param text - 原始文本
 * @param maxLength - 最大长度
 * @returns 截断后的文本
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * 延迟函数（用于防抖）
 * @param ms - 延迟毫秒数
 * @returns Promise
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 防抖函数
 * @param fn - 要执行的函数
 * @param delay - 延迟毫秒数
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

/**
 * 检查是否为移动设备
 * @returns 是否为移动设备
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

/**
 * 获取用户设备类型
 * @returns 'mobile' | 'tablet' | 'desktop'
 */
export function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  if (typeof window === 'undefined') return 'desktop';
  const width = window.innerWidth;
  if (width < 640) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}