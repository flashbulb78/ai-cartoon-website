/**
 * lib/colorDetection.ts
 * 肤色、发色、眼睛颜色检测
 * 使用Canvas和颜色分析从人脸图像中提取颜色特征
 */

/**
 * 颜色类别
 */
export interface ColorAttributes {
  skinTone: 'light' | 'medium' | 'dark' | 'unknown';
  skinColor: string; // hex
  hairColor: 'black' | 'brown' | 'blonde' | 'red' | 'gray' | 'white' | 'unknown';
  hairColorHex: string;
  eyeColor: 'brown' | 'blue' | 'green' | 'gray' | 'black' | 'unknown';
  eyeColorHex: string;
}

/**
 * 将RGB转换为HSL
 */
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

/**
 * 将RGB转换为Hex
 */
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

/**
 * 判断肤色类型
 * 基于HSL颜色空间的亮度(L)和色相(H)
 */
function classifySkinTone(r: number, g: number, b: number): 'light' | 'medium' | 'dark' {
  const { h, s, l } = rgbToHsl(r, g, b);
  
  // 肤色通常在色相0-50度之间（红色到黄色）
  // 饱和度低于50%更可能是肤色
  if (s > 50) {
    if (l > 65) return 'light';
    if (l > 40) return 'medium';
    return 'dark';
  }
  
  // 低饱和度时，基于亮度判断
  if (l > 70) return 'light';
  if (l > 45) return 'medium';
  return 'dark';
}

/**
 * 判断发色
 */
function classifyHairColor(r: number, g: number, b: number): 'black' | 'brown' | 'blonde' | 'red' | 'gray' | 'white' {
  const { h, s, l } = rgbToHsl(r, g, b);
  
  // 高亮度低饱和度是白色/灰色
  if (l > 80 && s < 20) return 'white';
  if (l > 60 && s < 25) return 'gray';
  
  // 低亮度是黑色
  if (l < 25) return 'black';
  
  // 红色系
  if (h > 0 && h < 40 && s > 40) return 'red';
  
  // 金色/棕色 - 基于亮度和饱和度
  if (l > 50) return 'blonde';
  return 'brown';
}

/**
 * 判断眼睛颜色
 */
function classifyEyeColor(r: number, g: number, b: number): 'brown' | 'blue' | 'green' | 'gray' | 'black' {
  const { h, s, l } = rgbToHsl(r, g, b);
  
  // 低亮度是黑色/深棕色
  if (l < 25) return 'black';
  if (l < 40) return 'brown';
  
  // 低饱和度是灰色
  if (s < 30) return 'gray';
  
  // 蓝色系 (色相200-260)
  if (h >= 180 && h <= 260) return 'blue';
  
  // 绿色系 (色相80-180)
  if (h >= 80 && h < 180) return 'green';
  
  // 默认棕色
  return 'brown';
}

/**
 * 计算区域内最常见的颜色（排除白色和黑色）
 */
function getDominantColor(pixels: Uint8ClampedArray, region: { x: number; y: number; w: number; h: number }, imageWidth: number): { r: number; g: number; b: number } | null {
  const colorCounts: Map<string, number> = new Map();
  const step = 4; // 采样间隔
  
  for (let py = region.y; py < region.y + region.h; py += 2) {
    for (let px = region.x; px < region.x + region.w; px += 2) {
      const idx = (py * imageWidth + px) * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      const a = pixels[idx + 3];
      
      // 跳过透明和极白/极黑像素
      if (a < 128) continue;
      if (r > 250 && g > 250 && b > 250) continue;
      if (r < 5 && g < 5 && b < 5) continue;
      
      // 降低精度以获得更稳定的颜色
      const key = `${Math.round(r / 10) * 10},${Math.round(g / 10) * 10},${Math.round(b / 10) * 10}`;
      colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
    }
  }
  
  if (colorCounts.size === 0) return null;
  
  // 找到出现最多的颜色
  let maxCount = 0;
  let dominantColor = '';
  
  colorCounts.forEach((count, color) => {
    if (count > maxCount) {
      maxCount = count;
      dominantColor = color;
    }
  });
  
  const [r, g, b] = dominantColor.split(',').map(Number);
  return { r, g, b };
}

/**
 * 从人脸图像中检测肤色、发色、眼睛颜色
 * @param imageBase64 - Base64编码的图像（可能包含data URL前缀）
 * @returns 颜色属性
 */
export function detectColorAttributes(imageBase64: string): Promise<ColorAttributes> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        if (!ctx) {
          resolve(getDefaultColorAttributes());
          return;
        }
        
        // 缩小图像以提高性能
        const maxSize = 200;
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;
        const w = canvas.width;
        const h = canvas.height;
        
        // 检测肤色 - 使用面部中心偏上区域（前额/脸颊）
        const skinRegion = {
          x: Math.floor(w * 0.25),
          y: Math.floor(h * 0.2),
          w: Math.floor(w * 0.5),
          h: Math.floor(h * 0.35)
        };
        const skinColor = getDominantColor(pixels, skinRegion, w);
        
        // 检测发色 - 使用顶部区域
        const hairRegion = {
          x: Math.floor(w * 0.15),
          y: Math.floor(h * 0.02),
          w: Math.floor(w * 0.7),
          h: Math.floor(h * 0.25)
        };
        const hairColorResult = getDominantColor(pixels, hairRegion, w);
        
        // 检测眼睛颜色 - 使用眼睛位置区域
        const eyeRegion = {
          x: Math.floor(w * 0.2),
          y: Math.floor(h * 0.35),
          w: Math.floor(w * 0.6),
          h: Math.floor(h * 0.15)
        };
        const eyeColorResult = getDominantColor(pixels, eyeRegion, w);
        
        // 分类颜色
        const skinTone = skinColor ? classifySkinTone(skinColor.r, skinColor.g, skinColor.b) : 'unknown';
        const skinColorHex = skinColor ? rgbToHex(skinColor.r, skinColor.g, skinColor.b) : '#000000';
        
        const hairColor = hairColorResult ? classifyHairColor(hairColorResult.r, hairColorResult.g, hairColorResult.b) : 'unknown';
        const hairColorHex = hairColorResult ? rgbToHex(hairColorResult.r, hairColorResult.g, hairColorResult.b) : '#000000';
        
        const eyeColor = eyeColorResult ? classifyEyeColor(eyeColorResult.r, eyeColorResult.g, eyeColorResult.b) : 'unknown';
        const eyeColorHex = eyeColorResult ? rgbToHex(eyeColorResult.r, eyeColorResult.g, eyeColorResult.b) : '#000000';
        
        console.log('[ColorDetection] Detected:', { skinTone, hairColor, eyeColor });
        console.log('[ColorDetection] Hex colors:', { skinColorHex, hairColorHex, eyeColorHex });
        
        resolve({
          skinTone,
          skinColor: skinColorHex,
          hairColor,
          hairColorHex,
          eyeColor,
          eyeColorHex
        });
      } catch (error) {
        console.error('[ColorDetection] Error:', error);
        resolve(getDefaultColorAttributes());
      }
    };
    
    img.onerror = () => {
      console.error('[ColorDetection] Failed to load image');
      resolve(getDefaultColorAttributes());
    };
    
    // 处理data URL - 确保正确的格式
    let imageSrc: string;
    if (imageBase64.startsWith('data:')) {
      // 已经是完整的 data URL，直接使用
      imageSrc = imageBase64;
    } else if (imageBase64.includes(',')) {
      // 格式错误的情况：不应该有逗号但没有 data: 前缀
      // 假设它是 raw base64（不应该发生，但如果发生了就正常处理）
      imageSrc = `data:image/jpeg;base64,${imageBase64}`;
    } else {
      // 只有 base64 数据，添加前缀
      imageSrc = `data:image/jpeg;base64,${imageBase64}`;
    }
    img.src = imageSrc;
  });
}

/**
 * 获取默认颜色属性
 */
function getDefaultColorAttributes(): ColorAttributes {
  return {
    skinTone: 'medium',
    skinColor: '#C4A484',
    hairColor: 'brown',
    hairColorHex: '#4A3728',
    eyeColor: 'brown',
    eyeColorHex: '#4A3728'
  };
}

/**
 * 生成颜色检测的提示词
 */
export function generateColorPrompt(attributes: ColorAttributes): string {
  const parts: string[] = [];
  
  if (attributes.skinTone !== 'unknown') {
    parts.push(`skin tone: ${attributes.skinTone} (${attributes.skinColor})`);
  }
  
  if (attributes.hairColor !== 'unknown') {
    parts.push(`hair color: ${attributes.hairColor} (${attributes.hairColorHex})`);
  }
  
  if (attributes.eyeColor !== 'unknown') {
    parts.push(`eye color: ${attributes.eyeColor} (${attributes.eyeColorHex})`);
  }
  
  if (parts.length === 0) {
    return '';
  }
  
  return `CRITICAL: Preserve the original photo's ${parts.join(', ')}. Do NOT change these colors.`;
}