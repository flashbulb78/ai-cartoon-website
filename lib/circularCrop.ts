/**
 * lib/circularCrop.ts
 * 前端 Canvas 圆形裁切导出工具函数
 * 
 * 核心原则：
 * - 画布尺寸 = 原始图片尺寸，保证分辨率无损
 * - 所有坐标基于原图像素坐标系
 * - 下载前先裁切原图，再缩放到平台尺寸
 * - 全程不调用任何 AI 接口
 */

export type ExportFormat = 'png' | 'jpeg' | 'webp';

export interface CircularAvatarParams {
  /** MiniMax 返回的原始方形头像远程地址 */
  sourceImageUrl: string;
  /** 圆形裁切圆心 X（基于原图像素坐标系） */
  centerX: number;
  /** 圆形裁切圆心 Y（基于原图像素坐标系） */
  centerY: number;
  /** 圆形裁切半径（基于原图像素） */
  radius: number;
  /** 导出格式 */
  exportFormat: ExportFormat;
  /** 原图背景 RGB 色值，用于非 PNG 格式填充外圈 */
  backgroundColor: [number, number, number];
  /** 目标输出尺寸（正方形边长），默认原始尺寸 */
  targetSize?: number;
}

/**
 * 通过 Next.js 代理加载远程图片，解决 canvas CORS 污染
 */
function loadImageSafe(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image loading failed'));

    // 同域或 data: 直接加载，否则走代理
    if (url.startsWith('data:') || url.startsWith('blob:') || url.includes(window.location.hostname)) {
      img.src = url;
    } else {
      img.src = `/api/image-proxy?url=${encodeURIComponent(url)}`;
    }
  });
}

/**
 * 圆形裁切并导出头像
 * 
 * 处理流程：
 * 1. 加载原图
 * 2. 在原图尺寸上执行圆形裁切（保证无损）
 * 3. 缩放到目标尺寸
 * 4. 根据 exportFormat 输出：
 *    - png：圆形外透明，保留 Alpha
 *    - jpeg：圆形外填充 backgroundColor
 *    - webp：圆形外填充 backgroundColor
 */
export async function generateCircularAvatarByCanvas(
  params: CircularAvatarParams
): Promise<Blob> {
  const {
    sourceImageUrl,
    centerX,
    centerY,
    radius,
    exportFormat,
    backgroundColor = [255, 255, 255],
    targetSize,
  } = params;

  // 1. 加载原图
  const img = await loadImageSafe(sourceImageUrl);

  const originalWidth = img.width;
  const originalHeight = img.height;
  const mimeType = exportFormat === 'jpeg' ? 'image/jpeg' :
                   exportFormat === 'webp' ? 'image/webp' : 'image/png';

  // 2. 创建原图尺寸画布（保证分辨率无损）
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = originalWidth;
  fullCanvas.height = originalHeight;
  const fullCtx = fullCanvas.getContext('2d');
  if (!fullCtx) throw new Error('Canvas context not available');

  if (exportFormat === 'png') {
    // ===== PNG：圆形外透明，保留 Alpha 通道 =====
    fullCtx.drawImage(img, 0, 0);
    // 使用 destination-in 保留圆形区域，其余变透明
    fullCtx.globalCompositeOperation = 'destination-in';
    fullCtx.beginPath();
    fullCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    fullCtx.closePath();
    fullCtx.fill();
    fullCtx.globalCompositeOperation = 'source-over';

  } else {
    // ===== JPEG / WebP：圆形外填充 backgroundColor =====
    fullCtx.fillStyle = `rgb(${backgroundColor[0]}, ${backgroundColor[1]}, ${backgroundColor[2]})`;
    fullCtx.fillRect(0, 0, originalWidth, originalHeight);
    fullCtx.save();
    fullCtx.beginPath();
    fullCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    fullCtx.closePath();
    fullCtx.clip();
    fullCtx.drawImage(img, 0, 0);
    fullCtx.restore();
  }

  // 3. 如果有 targetSize，缩小到目标尺寸
  let outputCanvas = fullCanvas;
  if (targetSize && targetSize !== originalWidth) {
    const scaleCanvas = document.createElement('canvas');
    scaleCanvas.width = targetSize;
    scaleCanvas.height = targetSize;
    const scaleCtx = scaleCanvas.getContext('2d');
    if (!scaleCtx) throw new Error('Canvas context not available');
    scaleCtx.drawImage(fullCanvas, 0, 0, targetSize, targetSize);
    outputCanvas = scaleCanvas;
  }

  // 4. 导出 Blob（高质量）
  return new Promise((resolve, reject) => {
    outputCanvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Image processing failed, please try again.'));
      },
      mimeType,
      0.95
    );
  });
}