/**
 * lib/localBeardDetection.ts
 * 本地胡须检测模块
 * 使用图像分析检测面部毛发（胡须）
 */

import * as faceapi from 'face-api.js';

interface BeardDetectionResult {
  hasBeard: boolean;
  beardLength: 'none' | 'short' | 'medium' | 'long';
  beardShape: 'thin' | 'thick' | 'trimmed' | 'full' | 'goatee' | 'unknown';
  beardColor: 'black' | 'brown' | 'dark_brown' | 'gray' | 'white' | 'red' | 'blonde' | 'unknown';
}

/**
 * 检测胡须 - 基于下巴区域的暗度分析
 * @param imageData - 图像数据
 * @param landmarks - 人脸特征点
 * @returns 胡须检测结果
 */
export function detectBeardLocal(
  imageData: ImageData,
  landmarks: faceapi.FaceLandmarks68,
  pos: faceapi.Point[],
  skinTone: 'light' | 'medium' | 'dark' | 'medium_light' | 'medium_dark' | 'unknown'
): BeardDetectionResult {
  const { data, width, height } = imageData;
  
  // 下巴中央区域 - 仅采样下巴下半部分（避开嘴唇和下巴轮廓）
  // 胡须主要生长在下巴下半部分，所以只采样这个区域
  const chinCenterX = (pos[6].x + pos[8].x + pos[10].x) / 3;
  // 下巴中心点向下偏移，避免嘴唇线
  let chinCenterY = pos[8].y + (pos[8].y - (pos[3].y + pos[4].y) / 2) * 0.3;
  
  // [Rollback Point 15] 安全检查：确保下巴中心在图像边界内
  // 如果下巴中心超出图像，说明人脸可能部分在图像外或照片构图问题
  // 使用安全的上限值
  if (chinCenterY > height - 20) {
    chinCenterY = height - 20;
  }
  
  // 调试：显示下巴采样区域
  
  // 参考区域：额头（通常不受胡须影响）
  const foreheadCenterX = (pos[19].x + pos[24].x) / 2;
  const foreheadCenterY = Math.min(pos[19].y, pos[24].y) - 20;
  
  // 脸颊参考区域（右脸颊用于纹理比较）
  const rightCheekX = pos[14].x;
  const rightCheekY = (pos[14].y + pos[54].y) / 2;
  
  // 采样下巴区域（仅下巴下半部分，避免嘴唇阴影）
  let chinDarkPixels = 0;
  let chinTotalPixels = 0;
  let chinBrightnessSum = 0;
  
  // 只采样下巴下半部分（胡须生长区域）
  for (let y = Math.floor(chinCenterY); y < Math.floor(chinCenterY + 25); y += 2) {
    for (let x = Math.floor(chinCenterX - 30); x < Math.floor(chinCenterX + 30); x += 2) {
      if (x >= 0 && x < width && y >= 0 && y < height) {
        const idx = (y * width + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        chinBrightnessSum += (r + g + b) / 3;
        chinTotalPixels++;
        // 低亮度像素可能是胡须
        if ((r + g + b) / 3 < 100) {
          chinDarkPixels++;
        }
      }
    }
  }
  
  // 采样额头区域（参考）
  let foreheadBrightnessSum = 0;
  let foreheadTotalPixels = 0;
  
  for (let y = Math.floor(foreheadCenterY - 20); y < Math.floor(foreheadCenterY + 20); y += 2) {
    for (let x = Math.floor(foreheadCenterX - 40); x < Math.floor(foreheadCenterX + 40); x += 2) {
      if (x >= 0 && x < width && y >= 0 && y < height) {
        const idx = (y * width + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        foreheadBrightnessSum += (r + g + b) / 3;
        foreheadTotalPixels++;
      }
    }
  }
  
  const avgChinBrightness = chinTotalPixels > 0 ? chinBrightnessSum / chinTotalPixels : 150;
  const avgForeheadBrightness = foreheadTotalPixels > 0 ? foreheadBrightnessSum / foreheadTotalPixels : 180;
  
  // 下巴与额头亮度比：如果下巴明显更暗，说明可能有胡须
  const brightnessRatio = avgChinBrightness / avgForeheadBrightness;
  const darkPixelRatio = chinTotalPixels > 0 ? chinDarkPixels / chinTotalPixels : 0;
  
  
  // ========== [DEBUG] 下巴取样区域详细诊断 ==========
  // 注意：此诊断代码放在这里是为了在textureRatio计算之后使用
  // 收集下巴区域的亮度分布，用于诊断
  
  // ========== 花白/灰色胡须检测增强 ==========
  // 花白胡须的亮度可能接近甚至高于皮肤，不能仅依赖暗像素检测
  // 需要检测下巴区域的纹理特征（胡须会导致更多纹理边缘）
  
  // 采样下巴区域计算纹理边缘（仅下巴下半部分，避免嘴唇阴影）
  let chinTextureEdges = 0;
  let chinTextureTotal = 0;
  
  for (let y = Math.floor(chinCenterY); y < Math.floor(chinCenterY + 25); y += 2) {
    for (let x = Math.floor(chinCenterX - 30); x < Math.floor(chinCenterX + 30); x += 2) {
      if (x >= 0 && x < width - 1 && y >= 0 && y < height - 1) {
        const idx = (y * width + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        const nextXIdx = (y * width + x + 1) * 4;
        const dx = Math.abs(data[nextXIdx] - r);
        const dy = Math.abs(data[idx + 4] - g);
        const edgeStrength = dx + dy;
        if (edgeStrength > 50) {  // 提高阈值到50，减少误检（皮肤毛孔、阴影等不应被记为纹理）
          chinTextureEdges++;
        }
        chinTextureTotal++;
      }
    }
  }
  
  // 采样右侧脸颊区域计算纹理边缘（作为参考 - 脸颊更接近下巴，纹理特征更可比）
  let rightCheekTextureEdges = 0;
  let rightCheekTextureTotal = 0;
  
  for (let y = Math.floor(rightCheekY - 20); y < Math.floor(rightCheekY + 20); y += 2) {
    for (let x = Math.floor(rightCheekX - 25); x < Math.floor(rightCheekX + 25); x += 2) {
      if (x >= 0 && x < width - 1 && y >= 0 && y < height - 1) {
        const idx = (y * width + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        const nextXIdx = (y * width + x + 1) * 4;
        const dx = Math.abs(data[nextXIdx] - r);
        const dy = Math.abs(data[idx + 4] - g);
        const edgeStrength = dx + dy;
        if (edgeStrength > 50) {  // 提高阈值到50，减少误检（皮肤毛孔、阴影等不应被记为纹理）
          rightCheekTextureEdges++;
        }
        rightCheekTextureTotal++;
      }
    }
  }
  
  // 采样额头区域计算纹理边缘（用于络腮胡检测 - 额头通常没有胡子）
  let foreheadTextureEdges = 0;
  let foreheadTextureTotal = 0;
  
  for (let y = Math.floor(foreheadCenterY - 20); y < Math.floor(foreheadCenterY + 20); y += 2) {
    for (let x = Math.floor(foreheadCenterX - 35); x < Math.floor(foreheadCenterX + 35); x += 2) {
      if (x >= 0 && x < width - 1 && y >= 0 && y < height - 1) {
        const idx = (y * width + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        const nextXIdx = (y * width + x + 1) * 4;
        const dx = Math.abs(data[nextXIdx] - r);
        const dy = Math.abs(data[idx + 4] - g);
        const edgeStrength = dx + dy;
        if (edgeStrength > 50) {  // 提高阈值到50，减少误检（皮肤毛孔、阴影等不应被记为纹理）
          foreheadTextureEdges++;
        }
        foreheadTextureTotal++;
      }
    }
  }
  
  const chinTextureRatio = chinTextureTotal > 0 ? chinTextureEdges / chinTextureTotal : 0;
  // 调试：显示纹理检测详情
  const rightCheekTextureRatio = rightCheekTextureTotal > 0 ? rightCheekTextureEdges / rightCheekTextureTotal : 0;
  const foreheadTextureRatio = foreheadTextureTotal > 0 ? foreheadTextureEdges / foreheadTextureTotal : 0;
  // 下巴纹理与右脸颊纹理比值（如果下巴有胡须，比值应 > 1.2）
  const textureRatioCheek = chinTextureRatio / (rightCheekTextureRatio || 0.01);
  // 下巴纹理与额头纹理比值（用于络腮胡检测 - 额头通常没有胡子）
  const textureRatioForehead = chinTextureRatio / (foreheadTextureRatio || 0.01);
  // 优先使用两者中的较高值
  const textureRatio = Math.max(textureRatioCheek, textureRatioForehead);
  const usingForeheadRatio = textureRatioForehead > textureRatioCheek;
  
  
  // ========== [DEBUG] 下巴取样区域详细诊断 ==========
  // 收集下巴区域的亮度分布，用于诊断
  const brightnessBuckets = { dark: 0, medium: 0, light: 0, bright: 0 }; // <80, 80-140, 140-180, >180
  const chinSampleTop = Math.floor(chinCenterY);
  const chinSampleBottom = Math.floor(chinCenterY + 25);
  const chinSampleLeft = Math.floor(chinCenterX - 30);
  const chinSampleRight = Math.floor(chinCenterX + 30);
  
  for (let y = chinSampleTop; y < chinSampleBottom; y += 2) {
    for (let x = chinSampleLeft; x < chinSampleRight; x += 2) {
      if (x >= 0 && x < width && y >= 0 && y < height) {
        const idx = (y * width + x) * 4;
        const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        if (brightness < 80) brightnessBuckets.dark++;
        else if (brightness < 140) brightnessBuckets.medium++;
        else if (brightness < 180) brightnessBuckets.light++;
        else brightnessBuckets.bright++;
      }
    }
  }
  
  const totalBucketPixels = brightnessBuckets.dark + brightnessBuckets.medium + brightnessBuckets.light + brightnessBuckets.bright;
  if (totalBucketPixels === 0) {
  }
  
  // 诊断：如果下巴大部分是亮像素(>180)且亮度比接近1.0，可能是花白胡子或无胡子
  if (totalBucketPixels > 0 && brightnessBuckets.bright / totalBucketPixels > 0.5 && brightnessRatio > 0.95 && brightnessRatio < 1.15) {
  }
  
  // 判断标准：
  // 1. 传统方法：下巴亮度明显低于额头 + 暗像素（检测黑色/深色胡须）
  //    注意：由于下巴阴影会导致误判，亮度检测需要与高纹理检测结合
  // 2. 花白胡须：下巴纹理明显多于脸颊（纹理比例 > 1.5）或下巴绝对纹理达到一定强度
  // 3. 备用：下巴有明显的纹理变化但亮度方法未触发（可能是花白胡须）
  
  // 亮度检测：需要同时满足低亮度、大比例暗像素、高纹理比例（防止阴影误判）
  // 阴影导致的低亮度通常纹理不会明显增加，但胡须会增加纹理
  // 特殊处理：当暗像素比例极高(>80%)时，即使纹理比例不高也是有胡须的强烈信号
  // 优化：降低textureRatio阈值以检测络腮胡（脸颊也有胡子导致比值偏低）
  // 男性络腮胡数据：darkPixelRatio=9%, textureRatio=2.13, chinTextureRatio=92.3%
  const darkPixelThreshold = 0.05;  // 降低到5%以检测9%的暗像素
  // [Rollback Point 25] 如果textureRatio > 4.5且brightnessRatio < 0.5，说明可能是手遮挡而不是真正的胡子
  // 手部皮肤会导致极高的纹理和暗像素比例，但不是胡子
  // [Rollback Point 28] 修复：红胡子也会触发 isHandLikeTexture 条件，需要添加颜色检查
  // 红胡子的下巴颜色通常是 reddish/brownish (r>g>b 且色调在红色/橙色范围)
  // 手部皮肤是典型的 flesh tone (r>>g>b 但色调偏黄色)
  // 采样下巴区域中心像素检查颜色
  let chinCenterR = 0, chinCenterG = 0, chinCenterB = 0, chinCenterCount = 0;
  for (let y = Math.floor(chinCenterY); y < Math.floor(chinCenterY + 25); y += 3) {
    for (let x = Math.floor(chinCenterX - 15); x < Math.floor(chinCenterX + 15); x += 3) {
      if (x >= 0 && x < width && y >= 0 && y < height) {
        const idx = (y * width + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        const brightness = (r + g + b) / 3;
        if (brightness < 150) { // 只采样暗色像素
          chinCenterR += r;
          chinCenterG += g;
          chinCenterB += b;
          chinCenterCount++;
        }
      }
    }
  }
  const isBeardLikeColor = chinCenterCount > 10 && 
    (chinCenterR > chinCenterG * 1.1 && chinCenterG > chinCenterB * 0.9); // reddish/brownish
  const isHandLikeTexture = textureRatio > 4.5 && brightnessRatio < 0.5 && !isBeardLikeColor;
  if (isHandLikeTexture) {
    return { hasBeard: false, beardLength: 'none', beardShape: 'unknown', beardColor: 'unknown' };
  }
  // 增加上限检查：如果textureRatio过高(>4.0)但darkPixelRatio低(<8%)，不触发（可能是头发texture）
  // [Rollback Point 38] 修复：当darkPixelRatio > 0.80时，必须同时有足够纹理
  // [Rollback Point 42 - ISSUE-4] 修复：提高 chinTextureRatio 阈值从 0.05 到 0.20
  // 原因：0.05 太低，导致下巴阴影被误检为胡子
  // 问题照片：无胡子白人男性，下巴阴影被误检为 long beard，导致 gender=female
  const hasBeardByDarkness = brightnessRatio < 0.75 && darkPixelRatio > darkPixelThreshold && 
                             (textureRatio > 1.80 || darkPixelRatio > 0.80 && chinTextureRatio > 0.20); // [ROLLBACK ISSUE-3] [ROLLBACK POINT 42 - ISSUE-4]
  // 纹理检测：当textureRatio和chinTextureRatio都很高时，即使darkPixelRatio很低也认为有胡须
  // 优化：降低textureRatio要求以适应络腮胡情况
  // 添加亮度要求：只有下巴比额头暗时（brightnessRatio < 0.80）才根据textureRatio判断有胡子
  // 避免下巴很亮（无胡子）但textureRatio高的情况误判为有胡子
  // [Rollback Point 17] 添加上限检查：textureRatio 过高(>50)可能是阴影或图像问题，不是真正的胡子
  const hasBeardByTexture = (brightnessRatio < 0.80 && textureRatio > 2.50 && textureRatio < 50 && chinTextureRatio > 0.99) || 
                           (brightnessRatio < 0.80 && textureRatio > 2.20 && textureRatio < 50 && chinTextureRatio > 0.97 && darkPixelRatio > 0.15);
  // 传统绝对纹理检测：下巴纹理需要比参考区域强一定比例，且下巴纹理本身要足够强
  const hasBeardByAbsoluteTexture = chinTextureRatio > 0.45 && textureRatio > 1.80 && textureRatio < 4.50 && darkPixelRatio > darkPixelThreshold;
  
  // D2方案：下巴颜色均匀度检测
  // 胡须颜色分布较均匀（深色毛发），头发阴影分布不均匀（有深有浅）
  // 计算下巴区域颜色的标准差
  let colorVarianceSum = 0;
  let colorVarianceCount = 0;
  let darkColorCount = 0;
  let totalColorCount = 0;
  
  for (let y = Math.floor(chinCenterY); y < Math.floor(chinCenterY + 25); y += 2) {
    for (let x = Math.floor(chinCenterX - 30); x < Math.floor(chinCenterX + 30); x += 2) {
      if (x >= 0 && x < width && y >= 0 && y < height) {
        const idx = (y * width + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        const brightness = (r + g + b) / 3;
        if (brightness < 150) {  // 只考虑较暗的像素
          const avgColor = (r + g + b) / 3;
          colorVarianceSum += Math.abs(r - avgColor) + Math.abs(g - avgColor) + Math.abs(b - avgColor);
          colorVarianceCount++;
          if (brightness < 100) {
            darkColorCount++;
          }
          totalColorCount++;
        }
      }
    }
  }
  
  // 计算颜色均匀度：暗像素占比（暗像素多=可能为胡须）
  const darkPixelUniformity = totalColorCount > 0 ? darkColorCount / totalColorCount : 0;
  // 计算平均颜色偏差（低=更均匀=更可能为胡须）
  const avgColorDeviation = colorVarianceCount > 0 ? colorVarianceSum / colorVarianceCount : 100;
  
  // 胡须检测：需要暗像素占比高且颜色均匀
  // 女性头发阴影：暗像素占比低或颜色不均匀
  // 男性胡须：暗像素占比高且颜色均匀
  // [Rollback Point 44 - ISSUE-4] 修复：增加 brightnessRatio < 1.0 约束
  // 原因：真正的胡子会让下巴比额头暗(brightnessRatio < 1)，如果下巴比额头还亮(ratio > 1)
  //       说明是下巴本身肤色暗，不是胡子导致的
  // 问题照片：brightnessRatio=2.12（下巴比额头亮），但仍被 hasBeardByColorUniformity 误判为有胡子
  // [ISSUE-11] 修复：深肤色女性被误判为有胡子
  // 深肤色(dark/medium_dark)的下巴天然暗度高，暗像素多不一定是胡子而是肤色
  // 只在浅肤色(light/medium/medium_light)时启用颜色均匀度胡须检测
  const hasBeardByColorUniformity = (skinTone !== 'dark' && skinTone !== 'medium_dark')
    && darkPixelUniformity > 0.5 && avgColorDeviation < 25 && darkPixelRatio > 0.08 && brightnessRatio < 1.0;  // [ROLLBACK POINT 44 - ISSUE-4]
  
  
  // [ROLLBACK POINT 8] 花白胡子检测阈值修复
  // 问题：brightnessRatio < 1.35 太严格，无法检测到亮度差异超过 35% 的花白胡子
  // 回滚：将 1.35 改回 1.35
  
  // 浅色胡须检测（花白胡须）：下巴比额头亮但纹理明显
  // 花白胡须亮度高不会被记为暗像素，但纹理仍然明显
  // 降低阈值：chinTextureRatio > 0.05 (5%) 以适应短茬胡须
  // 修复：如果额头亮度很低（<80），说明额头参考被头发/眉毛污染，不应使用此检测
  // 这种情况下的高brightnessRatio是因为额头被污染，而不是真的有浅色胡须
  // 重要：如果brightnessRatio过高(>1.70)且下巴极亮(>200)，可能是咧嘴笑露出的牙齿，不是浅色胡子
  const hasBeardByLightColor = avgForeheadBrightness > 80 && brightnessRatio > 1.0 && brightnessRatio < 1.70 && 
                                avgChinBrightness < 200 && textureRatio > 2.20 && chinTextureRatio > 0.05;
  
  
  // [Rollback Point 20] 衣服误检保护：如果下巴极暗(brightnessRatio<0.1)且textureRatio极低(<0.5)，可能是衣服误检
  // 因为胡子即使很短也会有一定的纹理，而衣服（如黑色毛衣）可能完全没有纹理
  // 注意：这种情况对男女都适用，因为真正的胡子不可能完全没有纹理
  const isClothingLikeDarkness = brightnessRatio < 0.1 && textureRatio < 0.5;
  if (isClothingLikeDarkness) {
    return { hasBeard: false, beardLength: 'none', beardShape: 'unknown', beardColor: 'unknown' };
  }
  
  // 使用 OR 组合：满足任一条件即认为有胡须
  const hasBeard = hasBeardByDarkness || hasBeardByTexture || hasBeardByAbsoluteTexture || hasBeardByColorUniformity || hasBeardByLightColor;

  if (!hasBeard) {
    return { hasBeard: false, beardLength: 'none', beardShape: 'unknown', beardColor: 'unknown' };
  }

  // ========== 最终颜色校验：排除衣服/阴影误判 ==========
  // 真正的胡子颜色应该是暖色调（黑/棕/红/金/灰）而非冷色调（蓝/青/绿）
  // 下巴区域的暗像素如果是蓝色调（B > R 且 B 明显高于 R），说明是衣服不是胡子
  {
    let totalR = 0, totalG = 0, totalB = 0, colorCheckCount = 0;
    for (let y = Math.floor(chinCenterY); y < Math.floor(chinCenterY + 25); y += 2) {
      for (let x = Math.floor(chinCenterX - 30); x < Math.floor(chinCenterX + 30); x += 2) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          const idx = (y * width + x) * 4;
          const r = data[idx], g = data[idx + 1], b = data[idx + 2];
          const brightness = (r + g + b) / 3;
          // 只分析暗像素（胡须/头发通常是暗的）
          if (brightness < 120) {
            totalR += r; totalG += g; totalB += b; colorCheckCount++;
          }
        }
      }
    }
    if (colorCheckCount > 20) {
      const avgR = totalR / colorCheckCount;
      const avgB = totalB / colorCheckCount;
      // 如果蓝色通道明显高于红色通道（B > R * 1.3），说明采样到了蓝色系衣物而非胡子
      if (avgB > avgR * 1.3) {
        return { hasBeard: false, beardLength: 'none', beardShape: 'unknown', beardColor: 'unknown' };
      }
    }
  }
  
  // 判断胡须长度（基于暗像素比例 + 纹理比例综合判断）
  // 短胡子：暗像素少 或 纹理比例低
  // 中等胡子：暗像素中等 且 纹理比例中等
  // 长胡子：暗像素多 且 纹理比例高
  let beardLength: 'short' | 'medium' | 'long' = 'short';
  
  // textureRatio: 下巴纹理/脸颊纹理，反映胡子密集程度
  // textureRatio > 2.5 表示下巴有明显胡子纹理
  const isBeardTexture = textureRatio > 2.5;
  
  if (isBeardTexture) {
    // 有胡子纹理的情况下，按暗像素比例细分
    if (darkPixelRatio > 0.5) {
      beardLength = 'long';
    } else if (darkPixelRatio > 0.3) {
      beardLength = 'medium';
    } else if (darkPixelRatio > 0.15) {
      beardLength = 'short';
    } else {
      // 纹理明显但暗像素少 - 可能是花白胡子，归为短胡子
      beardLength = 'short';
    }
  } else {
    // 无明显胡子纹理，可能是花白胡子或短胡子
    // 花白胡子：textureRatio仍然较高但暗像素少
    if (darkPixelRatio > 0.4 && textureRatio > 2.0) {
      beardLength = 'medium';
    } else if (darkPixelRatio > 0.2 && textureRatio > 1.8) {
      beardLength = 'short';
    } else {
      beardLength = 'short';
    }
  }
  
  // 判断胡须形状（基于暗像素分布）
  let beardShape: 'thin' | 'thick' | 'trimmed' | 'full' | 'goatee' | 'unknown' = 'unknown';
  if (darkPixelRatio > 0.5) {
    beardShape = 'full';
  } else if (darkPixelRatio > 0.35) {
    beardShape = 'thick';
  } else if (darkPixelRatio > 0.2) {
    beardShape = 'trimmed';
  } else {
    beardShape = 'thin';
  }
  
  // 判断胡须颜色（基于下巴区域平均颜色 - 仅下巴下半部分）
  let beardColor: 'black' | 'brown' | 'dark_brown' | 'gray' | 'white' | 'red' | 'blonde' | 'unknown' = 'unknown';
  
  // 分别采样深色像素和浅色像素，用于检测不同颜色的胡须
  let chinRSum = 0, chinGSum = 0, chinBSum = 0, chinColorPixels = 0;
  let lightChinRSum = 0, lightChinGSum = 0, lightChinBSum = 0, lightChinPixels = 0;
  
  // 采样下巴区域 - 分为深色和浅色两组
  for (let y = Math.floor(chinCenterY); y < Math.floor(chinCenterY + 25); y += 2) {
    for (let x = Math.floor(chinCenterX - 30); x < Math.floor(chinCenterX + 30); x += 2) {
      if (x >= 0 && x < width && y >= 0 && y < height) {
        const idx = (y * width + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        const brightness = (r + g + b) / 3;
        
        // 深色像素 - 可能是黑色/深棕色胡须或阴影
        if (brightness < 120) {
          chinRSum += r;
          chinGSum += g;
          chinBSum += b;
          chinColorPixels++;
        }
        // 浅色像素 - 可能是灰白/白色胡须
        else if (brightness >= 120 && brightness <= 200) {
          lightChinRSum += r;
          lightChinGSum += g;
          lightChinBSum += b;
          lightChinPixels++;
        }
      }
    }
  }
  
  // 计算两种像素的平均颜色和饱和度
  let avgR = 0, avgG = 0, avgB = 0, avgBrightness = 0, sat = 0, chinPixels = 0;
  let lightAvgR = 0, lightAvgG = 0, lightAvgB = 0, lightAvgBrightness = 0, lightSat = 0;
  
  // 深色像素统计
  if (chinColorPixels > 0) {
    avgR = chinRSum / chinColorPixels;
    avgG = chinGSum / chinColorPixels;
    avgB = chinBSum / chinColorPixels;
    avgBrightness = (avgR + avgG + avgB) / (255 * 3);
    const max = Math.max(avgR, avgG, avgB);
    const min = Math.min(avgR, avgG, avgB);
    sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * avgBrightness - 1)) / 255;
    chinPixels = chinColorPixels;
  }
  
  // 浅色像素统计
  if (lightChinPixels > 0) {
    lightAvgR = lightChinRSum / lightChinPixels;
    lightAvgG = lightChinGSum / lightChinPixels;
    lightAvgB = lightChinBSum / lightChinPixels;
    lightAvgBrightness = (lightAvgR + lightAvgG + lightAvgB) / (255 * 3);
    const max = Math.max(lightAvgR, lightAvgG, lightAvgB);
    const min = Math.min(lightAvgR, lightAvgG, lightAvgB);
    lightSat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightAvgBrightness - 1)) / 255;
  }
  
  
  // 胡须颜色检测 - 简化的三色检测法
  // 使用合并像素计算整体特征
  const totalPixels = chinPixels + lightChinPixels;
  
  if (totalPixels < 30) {
    // 像素不足，无法判断
    beardColor = 'brown';
  } else {
    // 合并计算
    const allRSum = chinRSum + lightChinRSum;
    const allGSum = chinGSum + lightChinGSum;
    const allBSum = chinBSum + lightChinBSum;
    const allAvgR = allRSum / totalPixels;
    const allAvgG = allGSum / totalPixels;
    const allAvgB = allBSum / totalPixels;
    const allBrightness = (allAvgR + allAvgG + allAvgB) / (255 * 3);
    const allMax = Math.max(allAvgR, allAvgG, allAvgB);
    const allMin = Math.min(allAvgR, allAvgG, allAvgB);
    const allSat = allMax === allMin ? 0 : (allMax - allMin) / 255;
    const allRgbDiff = allMax - allMin;
    
    
    // 红胡子：高饱和度 + R是主色 - 提高优先级，sat>35%就直接检测为红色
    if (allSat > 0.35 && allAvgR > allAvgG && allAvgR > allAvgB) {
      beardColor = 'red';
    } else if (allBrightness > 0.60 && allSat < 0.15 && allRgbDiff < 50) {
      // 白胡子：极高亮度 + 极低饱和度 + RGB接近
      beardColor = 'white';
    } else if (allBrightness > 0.50 && allSat < 0.25 && allRgbDiff < 55) {
      // 灰胡子：高亮度 + 低饱和度 + RGB接近
      beardColor = 'gray';
    } else if (allBrightness < 0.40 && allSat < 0.30) {
      // 黑胡子：低亮度 + 低饱和度
      beardColor = 'black';
    } else if (allBrightness < 0.50 && allAvgR < 95 && allSat > 0.20) {
      // 深棕胡子：低亮度 + 低R值 + 有饱和度
      beardColor = 'dark_brown';
    } else if (allSat > 0.22 && allAvgR > allAvgG && allAvgR > allAvgB * 0.85) {
      // 棕色胡子：有饱和度 + R是主色
      if (allBrightness < 0.55) {
        beardColor = 'dark_brown';
      } else {
        beardColor = 'brown';
      }
    } else if (allBrightness < 0.45) {
      // 纯黑 fallback
      beardColor = 'black';
    } else {
      // 默认棕色
      beardColor = 'brown';
    }
  }
  
  
  return { hasBeard, beardLength, beardShape, beardColor };
}