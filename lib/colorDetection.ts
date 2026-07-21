/**
 * lib/colorDetection.ts
 * 肤色、发色、眼睛颜色检测
 * 使用Canvas和颜色分析从人脸图像中提取颜色特征
 */

import * as faceapi from 'face-api.js';
import { Ethnicity } from './types';

/**
 * 颜色类别
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
/**
 * 判断medium肤色是偏白还是偏黑
 * 基于RGB分量分析肤色偏向
 * - 偏白：R > G > B 且差值明显（暖色调，更像白人/亚洲人）
 * - 偏黑：R、G、B较接近且偏低（偏棕灰色调，更像深肤色）
 */
function classifyMediumSkinSubtype(r: number, g: number, b: number): 'medium_light' | 'medium_dark' {
  const avg = (r + g + b) / 3;
  const rDiff = r - avg;  // 正值表示偏红
  const gDiff = g - avg;
  const bDiff = b - avg;
  
  // 计算RGB分量之间的差异
  const rgDiff = Math.abs(r - g);
  const rbDiff = Math.abs(r - b);
  const gbDiff = Math.abs(g - b);
  
  // 如果R明显大于G和B，且整体偏亮（暖色调），偏白
  // 如果RGB较接近且整体偏暗（棕灰色调），偏黑
  if (r > g && r > b && r - g > 10 && avg > 110) {
    return 'medium_light';
  }
  
  // 如果整体偏暗且RGB较接近，偏黑
  if (avg < 115 && rgDiff < 20 && rbDiff < 20 && gbDiff < 20) {
    return 'medium_dark';
  }
  
  // 默认偏白
  return 'medium_light';
}

function classifySkinTone(r: number, g: number, b: number): 'light' | 'medium' | 'dark' | 'medium_light' | 'medium_dark' {
  const { h, s, l } = rgbToHsl(r, g, b);
  
  // 肤色分类阈值（基于亮度L）:
  // - light: l > 65 (白种人、高加索人)
  // - medium: 45 < l <= 65 (亚洲人、拉丁裔、印度人、浅棕色皮肤)
  // - dark: l <= 45 (非洲人、深肤色)
  // 注：调整阈值以更好区分浅黑肤色(咖啡色皮肤)和白人
  const lightThreshold = 65;
  const darkThreshold = 37; // [ROLLBACK ISSUE-6]
  
  if (s > 50) {
    if (l > lightThreshold) return 'light';
    if (l > darkThreshold) {
      // 进一步细分medium肤色
      return classifyMediumSkinSubtype(r, g, b);
    }
    return 'dark';
  }
  
  // 低饱和度时，基于亮度判断
  if (l > lightThreshold) return 'light';
  if (l > darkThreshold) {
    return classifyMediumSkinSubtype(r, g, b);
  }
  return 'dark';
}

/**
 * 判断发色 - 基于HSL颜色空间的系统性分类
 * 
 * HSL颜色空间分布规律：
 * - 黑色(black)：l<15, s<20 极暗色
 * - 深棕色(dark brown)：l<25, s>=15 低亮度但有色彩
 * - 棕色(brown)：h 15-45(橙褐色), s>=30, l 25-75
 * - 金色(blonde)：h>45(偏黄), s>=25, l>50
 * - 红色(red)：h 0-40, s>40, l<60
 * - 灰色(gray)：l>60, s<30 (且不是暖色高饱和)
 * - 白色(white)：l>85, s<20 或 l>80, s<15
 * 
 * 判断优先级：黑色 > 白色 > 灰色 > 红色 > 金色 > 棕色 > 深棕色 > 默认
 */
function classifyHairColor(r: number, g: number, b: number): 'black' | 'brown' | 'blonde' | 'red' | 'gray' | 'white' {
  const { h, s, l } = rgbToHsl(r, g, b);
  
  
  // 1. 黑色检测：极低亮度 + 低饱和度
  // 也包括深黑色（低亮度中等饱和度）
  // [ROLLBACK Point 49] 修复：排除中等亮度(l=30-50)的姜黄色/棕色被误判为黑色
  // RGB(130,100,70) 的 HSL 是 h=30, s=30, l=39，这是姜黄色/深棕色，不是黑色
  // 原条件 l < 40 太宽，会把姜黄色误判为黑色
  if ((l < 15 && s < 20) || (l < 30 && s < 35 && h < 50)) {  // [ROLLBACK POINT 49]
    return 'black';
  }
  
  // 2. 白色检测：极高亮度 + 极低饱和度
  if ((l > 85 && s <= 20) || (l > 80 && s < 15)) {
    return 'white';
  }
  
  // 3. 灰色检测：中等以上亮度 + 低饱和度
  // 真正的灰色：饱和度很低(<20)，不管hue是什么
  // 条件：l>60 且 s<25 - 但如果 s<20，即使l不高也是灰色
  if ((l > 60 && s < 25) || (l > 50 && s < 20)) {
    return 'gray';
  }
  
  // 4. 灰白色过曝检测：极高亮度+较低饱和度但实际是灰发
  // 灰发的过曝高光：l极高(>85)且s很低(<25)，这才可能是灰色头发反射的光
  // 不应该是暖色hue+中等饱和度(s=50)的情况
  if (l > 85 && s < 25) {
    return 'gray';
  }
  
  // 5. 红色检测：橙红色调 + 高饱和度 + 中等以下亮度
  if (h >= 0 && h <= 40 && s > 40 && l < 60) {
    return 'red';
  }
  
  // 6. 金色/黄色检测：偏黄色调 + 中等亮度 + 中等饱和度
  // [ROLLBACK POINT 4] 修复：blonde应该限制在黄/橙色调范围(h=30-70)，而不是所有h>45的颜色
  // 之前条件h>45会把蓝色(h=220)等错误地判定为blonde
  if (h >= 30 && h <= 70 && s >= 25 && l > 50) {
    return 'blonde';
  }
  
  // 7. 棕色检测：橙褐色(15-45) + 中等饱和度 + 中低亮度
  // 但如果亮度很高(>80)而饱和度较低(<30)，这可能是灰色头发的高光，不是棕色
  if (h >= 15 && h <= 45 && s >= 30) {
    // 高亮度棕色检测时需要特殊处理：如果亮度>80且饱和度<30，很可能是灰色头发的高光
    if (l > 80 && s < 30) {
      return 'gray';
    }
    return 'brown';
  }
  
  // 8. 深棕色检测：低亮度但有色彩
  if (l < 25 && s >= 15) {
    return 'brown';
  }
  
  // 9. 中等亮度灰色调棕色
  if (l > 50 && s >= 15 && s < 30) {
    return 'brown';
  }
  
  // 10. 灰色兜底
  if (l > 60 && s <= 30) {
    return 'gray';
  }
  
  // 11. 默认棕色（暖色系但不符合上面条件的）
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
 * @param excludeSkinColor - 是否排除皮肤色像素（用于头发颜色检测）
 */
function getDarkestNonSkinColor(pixels: Uint8ClampedArray, region: { x: number; y: number; w: number; h: number }, imageWidth: number): { r: number; g: number; b: number } | null {
  // [ROLLBACK POINT 6] 获取区域内最暗的非皮肤色像素
  let darkestColor: { r: number; g: number; b: number; brightness: number } | null = null;
  const step = 4;
  
  for (let py = region.y; py < region.y + region.h; py += step) {
    for (let px = region.x; px < region.x + region.w; px += step) {
      const idx = (py * imageWidth + px) * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      const a = pixels[idx + 3];
      
      // 跳过透明像素
      if (a < 128) continue;
      
      // 跳过极白像素（背景）
      if (r > 200 && g > 200 && b > 200) continue;
      
      // 跳过极黑像素
      if (r < 10 && g < 10 && b < 10) continue;
      
      // 排除皮肤色像素
      if (isSkinColorForHairDetection(r, g, b)) continue;
      
      const brightness = (r + g + b) / 3;
      if (!darkestColor || brightness < darkestColor.brightness) {
        darkestColor = { r, g, b, brightness };
      }
    }
  }
  
  return darkestColor ? { r: darkestColor.r, g: darkestColor.g, b: darkestColor.b } : null;
}

/**
 * 获取区域内最常见的颜色
 * @param pixels - 图像像素数据
 * @param region - 采样区域
 * @param imageWidth - 图像宽度
 * @param excludeSkinColor - 是否排除皮肤色
 */
function getDominantColor(pixels: Uint8ClampedArray, region: { x: number; y: number; w: number; h: number }, imageWidth: number, excludeSkinColor: boolean = false): { r: number; g: number; b: number } | null {
  const colorCounts: Map<string, number> = new Map();
  const step = 4; // 采样间隔
  
  // [ROLLBACK POINT 12] 诊断：统计头发区域采样的像素亮度分布
  const brightnessBuckets = { dark: 0, medium: 0, light: 0, bright: 0 };
  let totalSampled = 0;
  
  for (let py = region.y; py < region.y + region.h; py += 2) {
    for (let px = region.x; px < region.x + region.w; px += 2) {
      const idx = (py * imageWidth + px) * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      const a = pixels[idx + 3];
      
      // 跳过透明和极白/极黑像素（白色背景过滤）
      if (a < 128) continue;
      if (r > 230 && g > 230 && b > 230) continue;  // 降低白色阈值，过滤更多白色背景
      if (r < 5 && g < 5 && b < 5) continue;
      
      // 额外过滤：对于头发颜色检测，排除接近白色的高亮度像素
      // 这些很可能是背景而非头发，也可能是灰发的高光反射
      // 灰白色头发的高光反射会呈现暖色高饱和度，应该排除
      const brightness = (r + g + b) / 3;
      if (brightness >= 200 && excludeSkinColor) continue;
      
      // 额外过滤：排除高饱和度的高亮度像素（这些可能是高光反射）
      // 如果亮度>=190且饱和度>35，很可能是高光反射而非实际发色
      // 计算当前像素的饱和度
      const max_c = Math.max(r, g, b);
      const min_c = Math.min(r, g, b);
      const sat = max_c === min_c ? 0 : (max_c - min_c) / (1 - Math.abs(2 * brightness / 255 - 1)) * 255;
      if (brightness >= 190 && sat > 35 && excludeSkinColor) continue;
      
      // 排除皮肤色像素（用于头发颜色检测）
      if (excludeSkinColor && isSkinColorForHairDetection(r, g, b)) continue;
      
      // 统计亮度分布
      if (brightness < 40) brightnessBuckets.dark++;
      else if (brightness < 80) brightnessBuckets.medium++;
      else if (brightness < 160) brightnessBuckets.light++;
      else brightnessBuckets.bright++;
      totalSampled++;
      
      // 降低精度以获得更稳定的颜色
      const key = `${Math.round(r / 10) * 10},${Math.round(g / 10) * 10},${Math.round(b / 10) * 10}`;
      colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
    }
  }
  
  if (colorCounts.size === 0) return null;
  
  // [ROLLBACK POINT 12] 输出头发区域采样诊断信息
  if (excludeSkinColor && totalSampled > 0) {
  }
  
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
 * 判断是否为皮肤色（用于排除头发采样中的皮肤像素）
 */
function isSkinColorForHairDetection(r: number, g: number, b: number): boolean {
  // 皮肤色特征：高亮度、中等饱和度、红色/橙色色相
  const brightness = (r + g + b) / 3;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  
  // 皮肤亮度范围：80-220（扩展范围以覆盖不同肤色）
  // 皮肤饱和度范围：0.05-0.5
  if (brightness < 80 || brightness > 220) return false;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * brightness / 255 - 1)) / 255;
  if (s < 0.05 || s > 0.5) return false;
  
  // 检查是否为红色/橙色系（皮肤特征）
  // R > G > B 且 R 明显高于 G
  if (r > 150 && g > 130 && b > 100 && r > g * 0.85 && g > b * 0.9) {
    return true;
  }
  
  return false;
}

/**
 * 从人脸图像中检测肤色、发色、眼睛颜色
 * @param imageBase64 - Base64编码的图像（可能包含data URL前缀）
 * @param landmarks - 可选的人脸特征点，用于动态定位检测区域
 * @param ethnicity - 可选的人种，用于调整 African 发色检测区域
 * @param hasBangs - 可选的刘海标志，用于调整发色检测区域
 * @returns 颜色属性
 */
export function detectColorAttributes(
  imageBase64: string,
  landmarks?: faceapi.FaceLandmarks68 | null,
  ethnicity?: Ethnicity | 'unknown',
  hasBangs?: boolean,
  hasGlasses?: boolean
): Promise<ColorAttributes> {
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
        
        // 如果传入了landmarks，需要缩放坐标
        const scaledLandmarks = landmarks ? scaleLandmarks(landmarks, scale) : null;
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;
        const w = canvas.width;
        const h = canvas.height;
        
        // 检测肤色 - 使用四个区域采样，选择最浅的区域作为肤色
        // 眉毛、下巴、左脸颊、右脸颊四个区域对比检测，选择亮度最高的区域
        let skinColor: { r: number; g: number; b: number } | null = null;
        let darkPixelRatio = 0;
        let needsDarkSkinAdjustment = false;
        
        if (scaledLandmarks) {
          // 有特征点时，使用多区域采样选择最浅肤色
          const multiRegionResult = getLightestSkinColor(pixels, scaledLandmarks, w, h, hasGlasses);
          if (multiRegionResult) {
            skinColor = { r: multiRegionResult.r, g: multiRegionResult.g, b: multiRegionResult.b };
            darkPixelRatio = multiRegionResult.darkPixelRatio || 0;
            needsDarkSkinAdjustment = multiRegionResult.needsDarkSkinAdjustment || false;
          }
        }
        
        // 如果多区域采样失败或没有特征点，使用传统区域检测作为后备
        if (!skinColor) {
          const skinRegion = scaledLandmarks
            ? calculateSkinRegion(scaledLandmarks, w, h)
            : {
                x: Math.floor(w * 0.25),
                y: Math.floor(h * 0.35),
                w: Math.floor(w * 0.5),
                h: Math.floor(h * 0.4)
              };
          skinColor = getDominantColor(pixels, skinRegion, w);
        }
        
        // 检测发色 - 使用顶部区域
        // 如果有特征点，根据发际线位置动态定位
        // 传入 ethnicity 用于 African 人种的特殊发色检测区域
        // 传入 hasBangs 用于调整刘海情况下的采样区域
        const hairRegion = scaledLandmarks
          ? calculateHairRegion(scaledLandmarks, w, h, ethnicity, hasBangs)
          : {
              x: Math.floor(w * 0.15),
              y: Math.floor(h * 0.02),
              w: Math.floor(w * 0.7),
              h: Math.floor(h * 0.25)
            };
        // 头发颜色检测时排除皮肤色像素，避免刘海/阴影导致的皮肤采样干扰
        // [ROLLBACK POINT 6] 优化：如果getDominantColor返回浅色，尝试获取第二常见的深色
        // 原因：头发区域常包含大量背景，导致浅色成为dominant
        const hairColorResult = getDominantColor(pixels, hairRegion, w, true);
        
        // 如果头发颜色很浅（亮度>70且饱和度<20），可能是背景，尝试获取深色像素
        // 这是为黑发/棕发设计的回退策略
        if (hairColorResult) {
          const { h, s, l } = rgbToHsl(hairColorResult.r, hairColorResult.g, hairColorResult.b);
          if (l > 70 && s < 20) {
            // 尝试从头发区域获取一个更暗的颜色作为回退
            const darkHairColor = getDarkestNonSkinColor(pixels, hairRegion, w);
            if (darkHairColor) {
              return darkHairColor;
            }
          }
        }
        
        // 检测眼睛颜色 - 使用眼睛位置区域
        // 如果有特征点，根据眼部特征点动态定位
        const eyeRegion = scaledLandmarks
          ? calculateEyeRegion(scaledLandmarks, w, h)
          : {
              x: Math.floor(w * 0.2),
              y: Math.floor(h * 0.35),
              w: Math.floor(w * 0.6),
              h: Math.floor(h * 0.15)
            };
        const eyeColorResult = getDominantColor(pixels, eyeRegion, w);
        
        // 如果检测到深肤色信号（useAvgForDark触发或深色像素比例>15%），调整RGB值使其更准确反映真实肤色
        // 原因：isSkinHue过滤掉了深肤色像素，导致采样值偏浅
        // [Rollback Point 21] 添加darkPixelRatio > 0.25检查，防止误触发深肤色调整
        if (skinColor && needsDarkSkinAdjustment && darkPixelRatio > 0.25) {
          const sampledBrightness = (skinColor.r + skinColor.g + skinColor.b) / 3;
          const targetBrightness = 75;  // 深肤色的目标亮度
          const scaleFactor = targetBrightness / sampledBrightness;
          const adjustedR = Math.max(30, Math.round(skinColor.r * scaleFactor));
          const adjustedG = Math.max(20, Math.round(skinColor.g * scaleFactor));
          const adjustedB = Math.max(15, Math.round(skinColor.b * scaleFactor));
          skinColor = { r: adjustedR, g: adjustedG, b: adjustedB };
        }
        
        // 分类颜色
        const skinTone = skinColor ? classifySkinTone(skinColor.r, skinColor.g, skinColor.b) : 'unknown';
        const skinColorHex = skinColor ? rgbToHex(skinColor.r, skinColor.g, skinColor.b) : '#000000';
        
        const hairColor = hairColorResult ? classifyHairColor(hairColorResult.r, hairColorResult.g, hairColorResult.b) : 'unknown';
        const hairColorHex = hairColorResult ? rgbToHex(hairColorResult.r, hairColorResult.g, hairColorResult.b) : '#000000';
        
        // 修正经发色误判：如果检测到红色，实际很可能是棕色
        // 但如果亮度较高（l >= 70），可能是花白发，不要修正
        const hairLightness = hairColorResult ? rgbToHsl(hairColorResult.r, hairColorResult.g, hairColorResult.b).l : 50;
        const correctedHairColor = (hairColor === 'red' && hairLightness < 70) ? 'brown' : hairColor;
        if (hairColor === 'red') {
        }
        
        const eyeColor = eyeColorResult ? classifyEyeColor(eyeColorResult.r, eyeColorResult.g, eyeColorResult.b) : 'unknown';
        const eyeColorHex = eyeColorResult ? rgbToHex(eyeColorResult.r, eyeColorResult.g, eyeColorResult.b) : '#000000';
        
        
        resolve({
          skinTone,
          skinColor: skinColorHex,
          hairColor: correctedHairColor,
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
 * 缩放特征点坐标（因为图像被缩放到maxSize）
 */
function scaleLandmarks(landmarks: faceapi.FaceLandmarks68, scale: number): faceapi.FaceLandmarks68 {
  const scaledPositions = landmarks.positions.map(pos => ({
    x: pos.x * scale,
    y: pos.y * scale
  }));
  return {
    ...landmarks,
    positions: scaledPositions
  } as faceapi.FaceLandmarks68;
}

/**
 * 根据特征点计算肤色检测区域
 * 使用眉毛和脸颊的位置来确定区域
 */
function calculateSkinRegion(
  landmarks: faceapi.FaceLandmarks68,
  w: number,
  h: number
): { x: number; y: number; w: number; h: number } {
  const pos = landmarks.positions;
  
  // 下巴位置（点8）- 作为皮肤亮度的主要参考点
  const chinTip = pos[8];
  
  // 眉毛中心位置（用于确定额头下边界）
  const leftBrowCenterY = (pos[17].y + pos[19].y + pos[21].y) / 3;
  const rightBrowCenterY = (pos[22].y + pos[24].y + pos[26].y) / 3;
  const browCenterY = (leftBrowCenterY + rightBrowCenterY) / 2;
  
  // 脸颊位置（用于确定面部下边界）
  const leftCheekY = (pos[2].y + pos[4].y) / 2;
  const rightCheekY = (pos[12].y + pos[14].y) / 2;
  const cheekCenterY = (leftCheekY + rightCheekY) / 2;
  
  // 皮肤区域：以下巴为基准，向上延伸
  // 下巴（chinTip）作为皮肤亮度的锚点，向下取少量区域，向上覆盖下巴到脸颊的区域
  const skinTop = browCenterY;
  const skinBottom = Math.min(chinTip.y + (chinTip.y - cheekCenterY) * 0.3, h * 0.65);
  const skinHeight = skinBottom - skinTop;
  
  // 宽度：以两眼外角连线为参考，向下巴处收窄
  const leftEyeOuterX = pos[36].x;
  const rightEyeOuterX = pos[45].x;
  const eyeDistance = rightEyeOuterX - leftEyeOuterX;
  // 靠近下巴处宽度收窄
  const chinWidth = Math.max(eyeDistance * 0.6, w * 0.2);
  const skinWidth = Math.max(eyeDistance, w * 0.3) * 1.2;
  const skinCenterX = (leftEyeOuterX + rightEyeOuterX) / 2;
  
  // 下巴区域（用于主参考）
  const chinRegion = {
    x: Math.max(0, Math.floor(skinCenterX - chinWidth / 2)),
    y: Math.max(0, Math.floor(chinTip.y - skinHeight * 0.15)),
    w: Math.min(w, Math.floor(chinWidth)),
    h: Math.max(10, Math.floor(skinHeight * 0.3))
  };
  
  // 返回主要参考区域（下巴）
  return {
    x: Math.max(0, Math.floor(skinCenterX - skinWidth / 2)),
    y: Math.max(0, Math.floor(skinTop)),
    w: Math.min(w, Math.floor(skinWidth)),
    h: Math.max(10, Math.floor(skinHeight))
  };
}

/**
 * 计算四个关键区域的肤色亮度，返回最浅（光线最好）的区域颜色
 * 用于在有刘海/阴影情况下选择最准确的肤色
 */
function calculateMultiRegionSkinColor(
  imageData: ImageData,
  landmarks: faceapi.FaceLandmarks68
): { r: number; g: number; b: number; region: string } | null {
  const pos = landmarks.positions;
  const { data, width, height } = imageData;
  
  interface SkinRegion {
    name: string;
    x: number;
    y: number;
    w: number;
    h: number;
  }
  
  // 定义四个采样区域
  const regions: SkinRegion[] = [
    {
      name: 'brow',
      x: Math.floor((pos[36].x + pos[45].x) / 2 - width * 0.15),
      y: Math.floor((pos[19].y + pos[24].y) / 2),
      w: Math.floor(width * 0.3),
      h: Math.floor(height * 0.08)
    },
    {
      name: 'chin',
      x: Math.floor((pos[4].x + pos[12].x) / 2 - width * 0.1),
      y: Math.floor(pos[8].y),
      w: Math.floor(width * 0.2),
      h: Math.floor(height * 0.08)
    },
    {
      name: 'leftCheek',
      x: Math.max(0, Math.floor(pos[2].x - width * 0.08)),
      y: Math.floor((pos[4].y + pos[2].y) / 2),
      w: Math.floor(width * 0.12),
      h: Math.floor(height * 0.1)
    },
    {
      name: 'rightCheek',
      x: Math.min(width, Math.floor(pos[14].x)),
      y: Math.floor((pos[12].y + pos[14].y) / 2),
      w: Math.floor(width * 0.12),
      h: Math.floor(height * 0.1)
    }
  ];
  
  // 存储每个区域的亮度值
  interface RegionResult {
    name: string;
    r: number;
    g: number;
    b: number;
    brightness: number;
  }
  
  const regionResults: RegionResult[] = [];
  
  for (const region of regions) {
    let sumR = 0, sumG = 0, sumB = 0;
    let pixelCount = 0;
    let validPixelCount = 0;
    
    for (let y = region.y; y < region.y + region.h && y < height; y += 2) {
      for (let x = region.x; x < region.x + region.w && x < width; x += 2) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];
        
        // 跳过透明像素
        if (a < 128) continue;
        // 跳过纯白/纯黑像素
        if (r > 250 && g > 250 && b > 250) continue;
        if (r < 5 && g < 5 && b < 5) continue;
        
        sumR += r;
        sumG += g;
        sumB += b;
        validPixelCount++;
        pixelCount++;
      }
    }
    
    if (validPixelCount > 10) {
      const avgR = sumR / validPixelCount;
      const avgG = sumG / validPixelCount;
      const avgB = sumB / validPixelCount;
      const brightness = (avgR + avgG + avgB) / 3;
      regionResults.push({ name: region.name, r: avgR, g: avgG, b: avgB, brightness });
    }
  }
  
  if (regionResults.length === 0) {
    return null;
  }
  
  // 选择亮度最高的区域（最浅的皮肤色）
  const bestRegion = regionResults.reduce((best, current) => 
    current.brightness > best.brightness ? current : best
  );
  
    name: r.name,
    brightness: r.brightness.toFixed(1)
  })));
  
  return {
    r: bestRegion.r,
    g: bestRegion.g,
    b: bestRegion.b,
    region: bestRegion.name
  };
}

/**
 * 计算六个区域的皮肤颜色和亮度，返回最浅区域的颜色
 * 用于处理阴影、刘海等情况下的肤色检测
 * 采样区域：额头、眉毛、下巴、左脸颊、右脸颊、鼻子
 */
function getLightestSkinColor(
  pixels: Uint8ClampedArray,
  landmarks: faceapi.FaceLandmarks68,
  w: number,
  h: number,
  hasGlasses: boolean = false
): { r: number; g: number; b: number; brightness: number; darkPixelRatio?: number; needsDarkSkinAdjustment?: boolean } | null {
  const pos = landmarks.positions;
  
  const eyeDistance = Math.abs(pos[45].x - pos[36].x);
  const regionSize = Math.floor(eyeDistance * 0.25);  // 区域大小基于眼距（减小以避免镜框和头发干扰）
  
  // 计算五个区域的中心点
  // 1. 额头区域 (forehead - 使用正中位置，高于眉心)
  // 调整额头采样位置到0.6倍眼距，避开眼镜框架同时确保在图像范围内
  // 如果检测到墨镜，进一步上移0.2倍眼距，避免镜片影响
  const foreheadCenterX = (pos[36].x + pos[45].x) / 2;
  // 额头中心：位于眉心上方，距离为眼距的0.35倍（更接近实际额头），有眼镜时用0.6倍（更高以避开镜框和头发）
  // [OPTIMIZED] 2024-06-17: 添加clamp确保额头中心Y坐标在图像范围内，防止超出边界
  // [Rollback Point 24] 确保采样区域在发际线以上，使用foreheadTopY作为下限约束
  const foreheadTopY = pos[24].y;  // 发际线位置（眉毛位置）
  const foreheadCenterYRaw = (pos[19].y + pos[24].y) / 2 - eyeDistance * (hasGlasses ? 0.6 : 0.35);
  // 计算采样下限，确保不低于foreheadTopY（发际线）
  const samplingBottomY = foreheadCenterYRaw - regionSize / 2;
  // 如果采样下限低于foreheadTopY，说明采样会包含发际线以下区域（包括下垂的头发），需要上移
  const foreheadCenterYAdjusted = samplingBottomY < foreheadTopY ? foreheadTopY + regionSize / 2 : foreheadCenterYRaw;
  const foreheadCenterY = Math.max(regionSize / 2, Math.min(h - regionSize / 2, foreheadCenterYAdjusted));
  
  // 2. 下巴区域 (chin)
  const chinCenterX = (pos[4].x + pos[12].x) / 2;
  const chinCenterY = pos[8].y;
  
  // 3. 左脸颊区域 (leftCheek) - 已禁用
  // const leftCheekCenterX = pos[0].x + eyeDistance * 0.3;
  // const leftCheekCenterY = (pos[2].y + pos[4].y) / 2;
  
  // 4. 右脸颊区域 (rightCheek) - 已禁用
  // const rightCheekCenterX = pos[16].x - eyeDistance * 0.3;
  // const rightCheekCenterY = (pos[12].y + pos[14].y) / 2;
  
  // 5. 鼻子区域 (nose)
  const noseCenterX = (pos[31].x + pos[35].x) / 2;
  const noseCenterY = pos[30].y;
  
  // 计算四个区域的颜色
  interface RegionColor {
    r: number;
    g: number;
    b: number;
    brightness: number;
    name: string;
    darkPixelRatio?: number;
    needsDarkSkinAdjustment?: boolean;
  }
  
  const regions: RegionColor[] = [];
  
  // 采样计算每个区域的平均颜色（增加HSL色调过滤）
  // 判断RGB是否为皮肤色调（基于HSL的色调H）
  function isSkinHue(r: number, g: number, b: number): boolean {
    const { h, s, l } = rgbToHsl(r, g, b);
    // 皮肤色调范围：h ≈ 10-50（橙/粉红/黄色）或 h ≈ 340-360（红/偏红肤色）
    // 同时需要一定的饱和度来排除灰色背景
    if (s < 0.1) return false; // 低饱和度可能是灰色背景
    return (h >= 10 && h <= 50) || (h >= 340);
  }
  
  const sampleRegion = (centerX: number, centerY: number, name: string): RegionColor | null => {
    let sumR = 0, sumG = 0, sumB = 0, count = 0;
    const regionTop = Math.floor(centerY - regionSize / 2);
    const regionBottom = Math.floor(centerY + regionSize / 2);
    const regionLeft = Math.floor(centerX - regionSize / 2);
    const regionRight = Math.floor(centerX + regionSize / 2);
    
    for (let y = regionTop; y < regionBottom; y += 2) {
      for (let x = regionLeft; x < regionRight; x += 2) {
        if (x >= 0 && x < w && y >= 0 && y < h) {
          const idx = (y * w + x) * 4;
          const r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];
          // 跳过过白或过黑的像素
          if (r > 230 || r < 25) continue;
          // 过滤非皮肤色调：皮肤色通常h≈10-50（橙/粉红/黄）或h≈340-360（红）
          if (!isSkinHue(r, g, b)) continue;
          sumR += r;
          sumG += g;
          sumB += b;
          count++;
        }
      }
    }
    
    if (count < 10) return null;
    
    return {
      r: Math.floor(sumR / count),
      g: Math.floor(sumG / count),
      b: Math.floor(sumB / count),
      brightness: (sumR + sumG + sumB) / (count * 3),
      name
    };
  };

  // 计算下巴区域亮度（不过滤皮肤色调，因为下巴可能有胡须）
  // 用于辅助判断深肤色：深肤色下巴亮度通常<100
  // 重要：降低白像素阈值从240到200，以排除白色牙齿干扰
  const sampleChinBrightness = (): number => {
    let brightnessSum = 0;
    let count = 0;
    
    for (let y = Math.floor(chinCenterY - regionSize / 2); y < Math.floor(chinCenterY + regionSize / 2); y += 2) {
      for (let x = Math.floor(chinCenterX - regionSize / 2); x < Math.floor(chinCenterX + regionSize / 2); x += 2) {
        if (x >= 0 && x < w && y >= 0 && y < h) {
          const idx = (y * w + x) * 4;
          const r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];
          // 跳过过白(白色牙齿>200)或过黑像素，保留深肤色信息
          if (r > 200 || r < 5) continue;
          brightnessSum += (r + g + b) / 3;
          count++;
        }
      }
    }
    
    return count > 10 ? brightnessSum / count : 128;
  };
  
  const chinBrightness = sampleChinBrightness();

  // 分析整个面部区域的亮度分布，判断是否为深肤色
  // 深肤色像素亮度通常在 15-45 范围
  const analyzeFaceBrightnessDistribution = (): { darkPixelRatio: number; avgBrightness: number; brightnessVariance: number } => {
    // 定义面部区域：使用特征点确定上下左右边界
    const faceTop = Math.max(0, Math.min(pos[19].y, pos[24].y, pos[41].y, pos[46].y) - eyeDistance * 0.3);
    const faceBottom = Math.min(h, Math.max(pos[8].y, pos[57].y, pos[58].y, pos[67].y) + eyeDistance * 0.3);
    const faceLeft = Math.max(0, Math.min(...pos.slice(0, 17).map(p => p.x)) - eyeDistance * 0.2);
    const faceRight = Math.min(w, Math.max(...pos.slice(0, 17).map(p => p.x)) + eyeDistance * 0.2);
    
    let darkPixelCount = 0;  // brightness 15-45 范围内的像素
    let totalPixelCount = 0;
    let brightnessSum = 0;
    let brightnessSquaredSum = 0;  // 用于计算方差
    
    // 每4个像素采样一次以减少计算量
    const stride = 4;
    for (let y = Math.floor(faceTop); y < Math.floor(faceBottom); y += stride) {
      for (let x = Math.floor(faceLeft); x < Math.floor(faceRight); x += stride) {
        const idx = (y * w + x) * 4;
        const r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];
        // 跳过过白或过黑的像素（可能是背景或胡须）
        if (r > 230 || r < 10) continue;
        // 跳过低饱和度像素（可能是背景）
        const { s } = rgbToHsl(r, g, b);
        if (s < 0.05) continue;
        
        const brightness = (r + g + b) / 3;
        brightnessSum += brightness;
        brightnessSquaredSum += brightness * brightness;
        totalPixelCount++;
        
        // 深肤色像素亮度范围：15-45
        if (brightness >= 15 && brightness <= 45) {
          darkPixelCount++;
        }
      }
    }
    
    const avgBrightness = totalPixelCount > 0 ? brightnessSum / totalPixelCount : 128;
    // 方差 = E[X^2] - E[X]^2
    const avgBrightnessSquared = totalPixelCount > 0 ? brightnessSquaredSum / totalPixelCount : 0;
    const brightnessVariance = avgBrightnessSquared - (avgBrightness * avgBrightness);
    
    const darkPixelRatio = totalPixelCount > 0 ? darkPixelCount / totalPixelCount : 0;
    
      faceRegion: { top: faceTop.toFixed(0), bottom: faceBottom.toFixed(0), left: faceLeft.toFixed(0), right: faceRight.toFixed(0) },
      darkPixelCount,
      totalPixelCount,
      darkPixelRatio: (darkPixelRatio * 100).toFixed(1) + '%',
      avgBrightness: avgBrightness.toFixed(1),
      brightnessVariance: brightnessVariance.toFixed(1)
    });
    
    return { darkPixelRatio, avgBrightness, brightnessVariance };
  };
  
  const { darkPixelRatio, avgBrightness: faceAvgBrightness, brightnessVariance } = analyzeFaceBrightnessDistribution();
  
  const forehead = sampleRegion(foreheadCenterX, foreheadCenterY, 'forehead');
  // 注意：下巴区域已移除，因为可能被胡须覆盖干扰肤色检测
  // const chin = sampleRegion(chinCenterX, chinCenterY, 'chin');  // 已禁用
  // const leftCheek = sampleRegion(leftCheekCenterX, leftCheekCenterY, 'leftCheek');  // 已禁用
  // const rightCheek = sampleRegion(rightCheekCenterX, rightCheekCenterY, 'rightCheek');  // 已禁用
  const nose = sampleRegion(noseCenterX, noseCenterY, 'nose');
  
  if (forehead) regions.push(forehead);
  // if (chin) regions.push(chin);  // 已禁用，避免胡须干扰
  // if (leftCheek) regions.push(leftCheek);  // 已禁用
  // if (rightCheek) regions.push(rightCheek);  // 已禁用
  if (nose) regions.push(nose);
  
  if (regions.length === 0) return null;
  
  // 找到最亮的区域（用于高光检测）
  // 鼻子区域权重更高（不易被头发/眉毛/眼镜干扰），额头权重降低
  let lightest = regions[0];
  let lightestAdjusted = regions[0].name === 'nose' ? regions[0].brightness * 1.5 : 
                          regions[0].name === 'forehead' ? regions[0].brightness * 0.8 : regions[0].brightness;
  
  for (const region of regions) {
    const adjustedBrightness = region.name === 'nose' ? region.brightness * 1.5 : 
                               region.name === 'forehead' ? region.brightness * 0.8 : region.brightness;
    if (adjustedBrightness > lightestAdjusted) {
      lightest = region;
      lightestAdjusted = adjustedBrightness;
    }
  }
  
  // [Rollback Point 23] 额头被头发覆盖检测（需要在权重计算前定义）
  const foreheadCoveredByHair = regions.find(r => r.name === 'forehead' && r.brightness < 30);
  if (foreheadCoveredByHair) {
  }
  
  // 计算加权平均亮度（鼻子权重2x，额头权重0.5x，但头发覆盖时权重为0）
  let totalBrightness = 0;
  let totalWeight = 0;
  
  for (const region of regions) {
    let weight = region.name === 'nose' ? 2 : 
                 region.name === 'forehead' ? 0.5 : 1;
    // 额头被头发覆盖时，权重设为0
    if (region.name === 'forehead' && foreheadCoveredByHair) {
      weight = 0;
    }
    totalBrightness += region.brightness * weight;
    totalWeight += weight;
  }
  
  const avgBrightness = totalBrightness / totalWeight;
  
  // 对于深色皮肤，额头通常比脸颊亮，但如果额头远亮于平均，可能只是高光
  // 此时使用平均亮度来判断真实肤色
  // 调整阈值：深肤色为 l <= 45，对应 brightness <= 45*255/100 ≈ 115
  // 如果平均亮度低于120（深肤色边界）且额头明显比平均亮，说明可能是深肤色
  // 新增：如果面部有超过20%的深色像素（亮度15-45），也判定为深肤色
  // 新增：如果下巴亮度<100且平均亮度<130，也判定为深肤色（下巴不易受高光影响，是深肤色的可靠指标）
  // 重要：如果额头亮度非常低（<60）且下巴也暗（<100），说明额头可能被头发覆盖，应使用下巴/平均亮度判断深肤色
  // [Rollback Point 23] 增强：如果额头亮度极低(<30)，说明被头发完全覆盖（已在前面排除）
  const foreheadTooDark = regions.find(r => r.name === 'forehead' && r.brightness < 60);
  // 检测鼻头高光：如果鼻头亮度比额头高15%以上，且下巴很暗，说明鼻头可能有高光反射
  const noseRegion = regions.find(r => r.name === 'nose');
  const foreheadRegion = regions.find(r => r.name === 'forehead');
  const noseHasReflection = noseRegion && foreheadRegion && 
                            noseRegion.brightness > foreheadRegion.brightness * 1.15 && 
                            chinBrightness < 80;
  // 备用检测：如果只有nose区域被采样，且nose很亮(>120)但下巴暗(<95)，可能是高光反射
  const noseOnlyReflection = !foreheadRegion && noseRegion && 
                             noseRegion.brightness > 120 && 
                             chinBrightness < 95 && 
                             darkPixelRatio > 0.05;
  // 额外检测：咧嘴笑时下巴很亮(>150)，但nose在可疑范围(120-135)且faceAvg<145，可能是深肤色
  const noseOnlyWithSmile = !foreheadRegion && noseRegion && 
                             noseRegion.brightness > 120 && 
                             noseRegion.brightness < 135 && 
                             chinBrightness > 150 && 
                             avgBrightness < 145 && 
                             darkPixelRatio > 0.05;
  // [ROLLBACK ISSUE-4] avgBrightness < 100 太宽泛，只有真正暗的肤色(<85)才触发
  const useAvgForDark = (lightest.brightness > avgBrightness * 1.1 && avgBrightness < 85) || 
                        (avgBrightness < 85) || 
                        (darkPixelRatio > 0.40 && brightnessVariance < 500) ||  // [ROLLBACK ISSUE-1] 高方差=patchy(老年斑), 低方差=均匀深肤色 
                        (chinBrightness < 80 && avgBrightness < 85) ||
                        (foreheadTooDark && chinBrightness < 100) ||
                        noseHasReflection ||
                        noseOnlyReflection ||
                        noseOnlyWithSmile;
  
  // 标记是否需要深肤色调整（任一条件触发时）
  const needsDarkSkinAdjustment = useAvgForDark;
  
  
  // 如果是深肤色情况，使用面部整体平均亮度来分类肤色（而非仅限采样区域）
  if (useAvgForDark) {
    // 使用面部整体亮度分布的平均值，更准确反映深肤色
       const avgRegion: RegionColor = {
      r: Math.round(regions.reduce((sum, r) => sum + r.r, 0) / regions.length),
      g: Math.round(regions.reduce((sum, r) => sum + r.g, 0) / regions.length),
      b: Math.round(regions.reduce((sum, r) => sum + r.b, 0) / regions.length),
      brightness: faceAvgBrightness,
      name: 'average',
      darkPixelRatio,
      needsDarkSkinAdjustment: true
    };
    return avgRegion;
  }
  
  return { ...lightest, darkPixelRatio, needsDarkSkinAdjustment: false };
}

/**
 * 根据特征点计算发色检测区域
 * 使用发际线和面部顶部的位置来确定区域
 * @param ethnicity - 可选的人种，African 人种使用特殊的额头纹理区域
 */
function calculateHairRegion(
  landmarks: faceapi.FaceLandmarks68,
  w: number,
  h: number,
  ethnicity?: Ethnicity | 'unknown',
  hasBangs?: boolean
): { x: number; y: number; w: number; h: number } {
  const pos = landmarks.positions;
  
  // black 人种：使用额头区域的短茬纹理（非传统发际线以上区域）
  if (ethnicity === 'black') {
    // 使用点27（鼻根位置）作为参考，向上延伸到发际线
    const noseBridgeY = pos[27].y;  // 鼻根
    const browCenterY = (pos[19].y + pos[24].y) / 2;  // 眉毛中心
    const foreheadTopY = pos[24].y;
    
    // 扫描区域：从鼻根到发际线（这里是非洲人短茬头发的主要区域）
    const hairTop = Math.max(0, noseBridgeY - (foreheadTopY - noseBridgeY) * 0.3);
    const hairBottom = foreheadTopY + (foreheadTopY - noseBridgeY) * 0.5;
    const hairHeight = Math.max(h * 0.05, hairBottom - hairTop);
    
    // 宽度：比两眼外角稍宽
    const leftEyeOuterX = pos[36].x;
    const rightEyeOuterX = pos[45].x;
    const hairWidth = Math.max(rightEyeOuterX - leftEyeOuterX, w * 0.4) * 1.2;
    const hairCenterX = (leftEyeOuterX + rightEyeOuterX) / 2;
    
    return {
      x: Math.max(0, Math.floor(hairCenterX - hairWidth / 2)),
      y: Math.max(0, Math.floor(hairTop)),
      w: Math.min(w, Math.floor(hairWidth)),
      h: Math.min(h, Math.floor(hairHeight))
    };
  }
  
  // 普通发际线区域
  // 发际线位置：使用额头正中位置
  const foreheadTopY = pos[24].y;  // 右侧眉毛内侧点
  const foreheadBottomY = pos[27].y;  // 鼻根位置
  
  // 如果有刘海，头发区域应该更靠上，采样真正露出的头发
  // 刘海会遮挡额头上方区域，所以需要从更靠上的位置采样
  let hairTop: number;
  let hairHeight: number;
  
  if (hasBangs) {
    // 有刘海时：从发际线更靠上位置开始采样，避免刘海和皮肤
    // 同时增大采样高度，因为刘海可能很厚
    hairTop = Math.max(0, foreheadTopY - (foreheadBottomY - foreheadTopY) * 1.5);
    hairHeight = Math.max(h * 0.15, (foreheadTopY - hairTop) * 2.0);
  } else {
    // [ROLLBACK POINT 3] 头发区域计算优化
    // 原始逻辑：使用固定额头高度倍数，可能导致头发区域偏上或偏下
    // 问题：白人女性长发样本头发区域(y=16-70)与实际头发位置(y=47-227)不重叠
    
    const foreheadHeight = foreheadBottomY - foreheadTopY;
    
    // [ROLLBACK POINT 13] 回滚原因：修改影响了其他照片的头发长度检测
    // 头发区域应该从发际线上方的额头高度处开始，向下覆盖足够高度
    // 原始：hairTop = foreheadTopY - foreheadHeight * 1.5
    // 优化：使用更大的系数确保头发区域覆盖实际头发位置
    hairTop = Math.max(0, foreheadTopY - foreheadHeight * 2.0);  // 从更上的位置开始
    
    // 头发高度：增加高度确保覆盖实际头发区域
    // 原始：hairHeight = max(h * 0.20, foreheadHeight * 2.5)
    // 优化：使用更大的额头倍数确保高度足够
    hairHeight = Math.max(h * 0.25, foreheadHeight * 3.5);  // 增加覆盖高度
    
  }
  
  // [ROLLBACK POINT 12] 修复头发颜色检测问题
  // 问题：头发采样区域 x=[16-66] 太靠左，只覆盖了面部左侧
  // 原因：使用 pos[0] 和 pos[16]（面部最外点）计算 hairCenterX，但当人在图像中偏右时，裁剪后这些点会显得很靠左
  // 解决方案：使用发际线中心点（pos[19] 和 pos[24] 的中点）作为头顶区域的 x 中心
  // 发际线位置更稳定，不会因为人在图像中的位置而变化
  
  // 宽度：以面部宽度为参考（避免包含背景）
  const faceLeftX = pos[0].x;
  const faceRightX = pos[16].x;
  const hairWidth = Math.max(faceRightX - faceLeftX, w * 0.5) * 0.9;
  
  // 使用发际线中心点作为头发区域的 x 中心
  const hairlineCenterX = (pos[19].x + pos[24].x) / 2;
  
    hairTop: hairTop.toFixed(1), 
    hairHeight: hairHeight.toFixed(1), 
    hairWidth: hairWidth.toFixed(1), 
    hairCenterX: hairlineCenterX.toFixed(1),
    foreheadTopY: foreheadTopY.toFixed(1),
    foreheadBottomY: foreheadBottomY.toFixed(1),
    hasBangs,
    faceLeftX: pos[0].x.toFixed(1),
    faceRightX: pos[16].x.toFixed(1),
    imageWidth: w,
    imageHeight: h
  });
  
  // [ROLLBACK POINT 12] 头发颜色检测修复
  // 问题：hairCenterX=41.6 严重偏左，采样到错误区域
  // 解决方案：使用 landmarks 的中心点作为参考，而不是只用 pos[0] 和 pos[16]
  // pos[0] 是左脸颊最外点，pos[16] 是右脸颊最外点
  // 但当人脸在图像中偏右时，这些点的 x 坐标也会偏右
  // 应该使用 pos[27]（鼻根）和 pos[8]（下巴中心）来计算面部中心
  
  // 诊断：检查 pos[0].x + pos[16].x 的值
  const faceLeftMost = pos[0].x;
  const faceRightMost = pos[16].x;
  
  // [ROLLBACK POINT 12 continued] 诊断采样区域的像素
  // 头发区域应该是图像顶部，而不是基于面部水平中心
  // 头发区域的 x 应该覆盖整个头部，而不是只覆盖面部宽度
  
  const hairRegionX = Math.max(0, Math.floor(hairlineCenterX - hairWidth / 2));
  const hairRegionY = Math.max(0, Math.floor(hairTop));
  
  return {
    x: hairRegionX,
    y: hairRegionY,
    w: Math.min(w, Math.floor(hairWidth)),
    h: Math.min(h, Math.floor(hairHeight))
  };
}

/**
 * 根据特征点计算眼睛颜色检测区域
 * 使用眼部特征点位置来确定区域
 */
function calculateEyeRegion(
  landmarks: faceapi.FaceLandmarks68,
  w: number,
  h: number
): { x: number; y: number; w: number; h: number } {
  const pos = landmarks.positions;
  
  // 眼睛中心位置
  const leftEyeCenterX = (pos[36].x + pos[39].x) / 2;
  const leftEyeCenterY = (pos[36].y + pos[39].y) / 2;
  const rightEyeCenterX = (pos[42].x + pos[45].x) / 2;
  const rightEyeCenterY = (pos[42].y + pos[45].y) / 2;
  
  const eyeCenterX = (leftEyeCenterX + rightEyeCenterX) / 2;
  const eyeCenterY = (leftEyeCenterY + rightEyeCenterY) / 2;
  
  // 两眼之间的距离
  const eyeDistance = Math.abs(rightEyeCenterX - leftEyeCenterX);
  
  // 眼睛区域：横向覆盖双眼，纵向覆盖眼睛高度
  const eyeRegionWidth = eyeDistance * 1.5;
  const eyeRegionHeight = eyeRegionWidth * 0.4;
  
  return {
    x: Math.max(0, Math.floor(eyeCenterX - eyeRegionWidth / 2)),
    y: Math.max(0, Math.floor(eyeCenterY - eyeRegionHeight / 2)),
    w: Math.min(w, Math.floor(eyeRegionWidth)),
    h: Math.max(5, Math.floor(eyeRegionHeight))
  };
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