/**
 * lib/faceAnalysis.ts
 * 全面人脸分析模块
 * 检测性别、人种、面部特征、头发特征、颜色属性等
 */

import * as faceapi from 'face-api.js';
import { FaceAnalysisResult, Ethnicity, HairShape, HairLength, ColorAttributes } from './types';
import { detectColorAttributes } from './colorDetection';

// 腾讯云 SDK 是服务器端库，不能在浏览器运行
// 改为通过后端 API 调用: app/api/face-analyze/route.ts
// import { analyzeFaceWithTencent, initTencentCloudConfig, isTencentCloudConfigured } from './tencentCloud';

// 模型加载标志
let modelsLoaded = false;

/**
 * 加载face-api模型
 */
async function loadModels(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (modelsLoaded) return true;
  
  try {
    const MODEL_URL = '/models';
    await Promise.all([
      faceapi.loadTinyFaceDetectorModel(MODEL_URL),
      faceapi.loadFaceLandmarkModel(MODEL_URL),
    ]);
    modelsLoaded = true;
    console.log('[FaceAnalysis] Models loaded successfully');
    return true;
  } catch (error) {
    console.error('[FaceAnalysis] Failed to load models:', error);
    return false;
  }
}

/**
 * 计算两点之间的距离
 */
function calcDistance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

/**
 * 计算一组点的平均Y坐标
 */
function avgY(points: { x: number; y: number }[]): number {
  return points.reduce((acc, p) => acc + p.y, 0) / points.length;
}

/**
 * 检测性别
 */
function detectGender(landmarks: faceapi.FaceLandmarks68): { gender: 'male' | 'female'; confidence: number } {
  const pos = landmarks.positions;
  
  // 下颌宽度与面部宽度比例
  const jawWidth = Math.abs(pos[12].x - pos[4].x);
  const faceWidth = Math.abs(pos[16].x - pos[0].x);
  const jawRatio = jawWidth / faceWidth;
  
  // 眉眼距与眼距比例
  const leftEyebrowCenter = avgY(pos.slice(17, 22));
  const rightEyebrowCenter = avgY(pos.slice(22, 27));
  const leftEyeCenter = avgY(pos.slice(36, 42));
  const rightEyeCenter = avgY(pos.slice(42, 48));
  const eyebrowEyeDistance = ((leftEyebrowCenter + rightEyebrowCenter) / 2) - ((leftEyeCenter + rightEyeCenter) / 2);
  
  const eyeDistance = Math.abs(pos[45].x - pos[36].x);
  const eyebrowEyeRatio = eyebrowEyeDistance / eyeDistance;
  
  let maleScore = 0;
  let femaleScore = 0;
  
  if (jawRatio > 0.55) maleScore += 0.4;
  else if (jawRatio < 0.5) femaleScore += 0.4;
  
  if (eyebrowEyeRatio < 0.8) maleScore += 0.4;
  else if (eyebrowEyeRatio > 0.9) femaleScore += 0.4;
  
  const totalScore = maleScore + femaleScore;
  const confidence = totalScore > 0 ? Math.max(maleScore, femaleScore) / totalScore : 0.5;
  
  return {
    gender: maleScore > femaleScore ? 'male' : 'female',
    confidence: Math.min(confidence + 0.5, 1)
  };
}

/**
 * 根据面部特征推断人种
 */
function detectEthnicity(
  faceWidth: number,
  faceHeight: number,
  noseWidth: number,
  eyeDistance: number,
  skinTone: 'light' | 'medium' | 'dark' | 'unknown'
): { ethnicity: Ethnicity; confidence: number } {
  const faceRatio = faceHeight / faceWidth;
  const eyeDistanceRatio = eyeDistance / faceWidth;
  
  // 亚洲人：脸较窄较长，眼睛间距较小
  if (faceRatio > 1.3 && eyeDistanceRatio < 0.28) {
    return { ethnicity: 'asian', confidence: 0.75 };
  }
  
  // 非洲人：脸较宽，颧骨宽
  if (faceRatio < 1.15 && skinTone === 'dark') {
    return { ethnicity: 'african', confidence: 0.7 };
  }
  
  // 白人：面部比例均衡
  if (faceRatio >= 1.15 && faceRatio <= 1.3 && skinTone === 'light') {
    return { ethnicity: 'caucasian', confidence: 0.65 };
  }
  
  // 印度/中东
  if (skinTone === 'medium') {
    return { ethnicity: 'middle_eastern', confidence: 0.55 };
  }
  
  // 拉丁裔
  if (skinTone !== 'dark' && faceRatio >= 1.2) {
    return { ethnicity: 'latin_american', confidence: 0.5 };
  }
  
  return { ethnicity: 'unknown', confidence: 0.3 };
}

/**
 * 检测脸型
 */
function detectFaceShape(landmarks: faceapi.FaceLandmarks68): 'oval' | 'round' | 'square' | 'heart' | 'oblong' | 'unknown' {
  const pos = landmarks.positions;
  const faceWidth = Math.abs(pos[16].x - pos[0].x);
  const faceHeight = Math.abs(pos[8].y - pos[19].y);
  const faceRatio = faceHeight / faceWidth;
  
  const jawWidth = Math.abs(pos[12].x - pos[4].x);
  const jawRatio = jawWidth / faceWidth;
  
  const foreheadWidth = Math.abs(pos[24].x - pos[19].x);
  const foreheadRatio = foreheadWidth / faceWidth;
  
  if (faceRatio > 1.4) return 'oblong';
  if (jawRatio > 0.75) return 'round';
  if (jawRatio < 0.6) {
    return foreheadRatio > 0.85 ? 'heart' : 'square';
  }
  if (faceRatio >= 1.2 && faceRatio <= 1.4) return 'oval';
  
  return 'unknown';
}

/**
 * 检测鼻型
 */
function detectNoseShape(landmarks: faceapi.FaceLandmarks68): 'straight' | 'curved' | 'round' | 'wide' | 'unknown' {
  const pos = landmarks.positions;
  const noseWidth = Math.abs(pos[35].x - pos[31].x);
  const nostrilWidth = Math.abs(pos[46].x - pos[41].x);
  const noseRatio = noseWidth / nostrilWidth;
  
  const noseHeight = Math.abs(pos[30].y - pos[27].y);
  const noseProtrusion = noseHeight / noseWidth;
  
  if (noseRatio > 1.5) return 'wide';
  if (noseProtrusion > 1.2) return 'straight';
  if (noseProtrusion < 0.8) return 'curved';
  return 'round';
}

/**
 * 检测眼睛形状
 */
function detectEyeShape(landmarks: faceapi.FaceLandmarks68): 'almond' | 'round' | 'hooded' | 'upturned' | 'downturned' | 'unknown' {
  const pos = landmarks.positions;
  const leftEye = pos.slice(36, 42);
  const rightEye = pos.slice(42, 48);
  
  const leftWidth = Math.abs(leftEye[3].x - leftEye[0].x);
  const leftHeight = Math.abs(avgY(leftEye.slice(1, 5)) - avgY([leftEye[0], leftEye[3]]));
  const leftRatio = leftWidth / leftHeight;
  
  const rightWidth = Math.abs(rightEye[3].x - rightEye[0].x);
  const rightHeight = Math.abs(avgY(rightEye.slice(1, 5)) - avgY([rightEye[0], rightEye[3]]));
  const rightRatio = rightWidth / rightHeight;
  
  const avgRatio = (leftRatio + rightRatio) / 2;
  const outerHeightDiff = Math.abs((leftEye[0].y - leftEye[3].y) - (rightEye[3].y - rightEye[0].y));
  
  if (avgRatio > 2.2) return 'round';
  if (outerHeightDiff > 3) {
    return leftEye[0].y > leftEye[3].y ? 'upturned' : 'downturned';
  }
  if (avgRatio < 1.5) return 'hooded';
  
  return 'almond';
}

/**
 * 检测唇型
 */
function detectLipShape(landmarks: faceapi.FaceLandmarks68): 'full' | 'thin' | 'medium' | 'unknown' {
  const pos = landmarks.positions;
  const lipHeight = Math.abs(pos[57].y - pos[51].y);
  const mouthWidth = Math.abs(pos[54].x - pos[48].x);
  const lipRatio = lipHeight / mouthWidth;
  
  if (lipRatio > 0.25) return 'full';
  if (lipRatio < 0.15) return 'thin';
  return 'medium';
}

/**
 * 检测下颌线
 */
function detectJawline(landmarks: faceapi.FaceLandmarks68): 'soft' | 'sharp' | 'medium' | 'unknown' {
  const pos = landmarks.positions;
  const leftJawAngle = Math.abs(pos[8].y - pos[4].y);
  const rightJawAngle = Math.abs(pos[8].y - pos[12].y);
  const angleDiff = Math.abs(leftJawAngle - rightJawAngle);
  
  if (angleDiff > 10) return 'sharp';
  if (angleDiff < 3) return 'soft';
  return 'medium';
}

/**
 * 检测眼镜（基于面部特征点和图像分析）
 */
function detectGlasses(landmarks: faceapi.FaceLandmarks68, imageData?: ImageData): { hasGlasses: boolean; glassesType: 'none' | 'normal' | 'sunglasses' | 'unknown' } {
  const pos = landmarks.positions;
  
  // 方法1：基于面部特征点的检测
  // 计算眼睛与眉毛的距离
  const leftEyebrowCenterY = avgY(pos.slice(17, 22));
  const rightEyebrowCenterY = avgY(pos.slice(22, 27));
  const leftEyeCenterY = avgY(pos.slice(36, 42));
  const rightEyeCenterY = avgY(pos.slice(42, 48));
  
  const leftBrowEyeDist = leftEyebrowCenterY - leftEyeCenterY;
  const rightBrowEyeDist = rightEyebrowCenterY - rightEyeCenterY;
  const avgBrowEyeDist = (leftBrowEyeDist + rightBrowEyeDist) / 2;
  
  // 计算两眼中心距离和鼻子宽度
  const leftEyeCenterX = (pos[36].x + pos[39].x) / 2;
  const rightEyeCenterX = (pos[42].x + pos[45].x) / 2;
  const eyeDistance = Math.abs(rightEyeCenterX - leftEyeCenterX);
  const noseBridgeWidth = Math.abs(pos[31].x - pos[35].x);
  
  // 眼镜的几何特征：眼镜框宽度接近两眼距离，鼻梁宽度较小
  const glassesFrameRatio = noseBridgeWidth / eyeDistance;
  
  // 方法2：如果有图像数据，检测眼镜框的边缘特征
  let hasFrameEdge = false;
  if (imageData) {
    const { data, width, height } = imageData;
    
    // 在眼睛区域检测水平的边缘（眼镜框的典型特征）
    const leftEyeLeftX = Math.floor(pos[36].x);
    const leftEyeRightX = Math.floor(pos[39].x);
    const rightEyeLeftX = Math.floor(pos[42].x);
    const rightEyeRightX = Math.floor(pos[45].x);
    
    // 眉毛下方区域（眼镜框通常在这里）
    const eyebrowY = Math.floor((leftEyebrowCenterY + rightEyebrowCenterY) / 2);
    const eyeTopY = Math.floor(Math.min(leftEyeCenterY, rightEyeCenterY));
    
    // 扫描眼睛上方区域是否有明显的水平边缘
    let horizontalEdges = 0;
    const scanHeight = Math.max(10, eyeTopY - eyebrowY);
    
    for (let y = eyebrowY; y < eyebrowY + scanHeight; y += 2) {
      for (let x = leftEyeLeftX; x < leftEyeRightX; x += 2) {
        if (x + 1 < width && y >= 0 && y < height) {
          const idx = (Math.floor(y) * width + Math.floor(x)) * 4;
          const nextIdx = (Math.floor(y) * width + Math.floor(x + 1)) * 4;
          if (idx >= 0 && nextIdx < data.length) {
            const diff = Math.abs(data[idx] - data[nextIdx]);
            if (diff > 30) horizontalEdges++;
          }
        }
      }
      for (let x = rightEyeLeftX; x < rightEyeRightX; x += 2) {
        if (x + 1 < width && y >= 0 && y < height) {
          const idx = (Math.floor(y) * width + Math.floor(x)) * 4;
          const nextIdx = (Math.floor(y) * width + Math.floor(x + 1)) * 4;
          if (idx >= 0 && nextIdx < data.length) {
            const diff = Math.abs(data[idx] - data[nextIdx]);
            if (diff > 30) horizontalEdges++;
          }
        }
      }
    }
    
    // 如果在眼睛上方区域检测到足够多的水平边缘，说明可能有眼镜框
    const expectedFrameWidth = (leftEyeRightX - leftEyeLeftX + rightEyeRightX - rightEyeLeftX) / 2;
    hasFrameEdge = horizontalEdges > expectedFrameWidth * 0.3;
  }
  
  // 综合判断：眉毛与眼睛距离足够大，或检测到眼镜框边缘
  const browEyeThresholdMet = avgBrowEyeDist > 8 && glassesFrameRatio < 0.15;
  
  if (browEyeThresholdMet || hasFrameEdge) {
    return { hasGlasses: true, glassesType: 'normal' };
  }
  
  return { hasGlasses: false, glassesType: 'none' };
}

/**
 * 判断是否为肤色
 */
function isSkinColor(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2 / 255;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1)) / 255;
  
  return l > 0.3 && l < 0.85 && s > 0.05 && s < 0.6;
}

/**
 * 检测头发形状
 */
function detectHairShape(imageData: ImageData): { shape: HairShape; confidence: number } {
  const { data, width, height } = imageData;
  
  let totalEdges = 0;
  let horizontalEdges = 0;
  let verticalEdges = 0;
  let diagonalEdges = 0;
  
  for (let y = 0; y < Math.floor(height * 0.3) - 1; y += 2) {
    for (let x = 0; x < width - 1; x += 2) {
      const idx = (y * width + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      
      if (isSkinColor(r, g, b)) continue;
      
      const nextIdx = ((y + 1) * width + x) * 4;
      const dy = Math.abs(data[nextIdx] - r);
      const rightIdx = (y * width + x + 1) * 4;
      const dx = Math.abs(data[rightIdx] - r);
      
      if (dx + dy > 30) {
        totalEdges++;
        if (dy > dx * 2) horizontalEdges++;
        else if (dx > dy * 2) verticalEdges++;
        else diagonalEdges++;
      }
    }
  }
  
  if (totalEdges < 50) {
    return { shape: 'straight', confidence: 0.4 };
  }
  
  const hRatio = horizontalEdges / totalEdges;
  const vRatio = verticalEdges / totalEdges;
  const dRatio = diagonalEdges / totalEdges;
  
  if (hRatio > 0.4) return { shape: 'straight', confidence: hRatio };
  if (dRatio > 0.35 && vRatio < 0.3) return { shape: 'wavy', confidence: dRatio };
  if (vRatio > 0.3 || (dRatio > 0.4 && vRatio > 0.2)) return { shape: 'curly', confidence: vRatio + dRatio };
  if (dRatio > 0.25) return { shape: 'wavy', confidence: dRatio };
  
  return { shape: 'straight', confidence: 0.5 };
}

/**
 * 检测刘海
 */
function detectBangs(imageData: ImageData): { hasBangs: boolean; style: 'none' | 'side' | 'center' | 'unknown' } {
  const { data, width, height } = imageData;
  
  let leftHairPixels = 0;
  let centerHairPixels = 0;
  let rightHairPixels = 0;
  
  for (let y = Math.floor(height * 0.1); y < Math.floor(height * 0.25); y += 2) {
    for (let x = 0; x < width; x += 2) {
      const idx = (y * width + x) * 4;
      if (!isSkinColor(data[idx], data[idx + 1], data[idx + 2])) {
        if (x < width * 0.33) leftHairPixels++;
        else if (x < width * 0.66) centerHairPixels++;
        else rightHairPixels++;
      }
    }
  }
  
  const totalHair = leftHairPixels + centerHairPixels + rightHairPixels;
  if (totalHair < 30) {
    return { hasBangs: false, style: 'none' };
  }
  
  const centerRatio = centerHairPixels / totalHair;
  const leftRatio = leftHairPixels / totalHair;
  const rightRatio = rightHairPixels / totalHair;
  
  if (centerRatio > 0.5) return { hasBangs: true, style: 'center' };
  if (leftRatio > 0.4 || rightRatio > 0.4) return { hasBangs: true, style: 'side' };
  
  return { hasBangs: true, style: 'unknown' };
}

/**
 * 检测头发长度
 */
function detectHairLength(imageData: ImageData): { length: HairLength; confidence: number } {
  const { data, width, height } = imageData;
  
  let hairPixels = 0;
  const totalPixels = Math.floor(width * height * 0.3);
  
  for (let i = 0; i < totalPixels; i++) {
    const x = i % width;
    const y = Math.floor(i / width);
    const idx = (y * width + x) * 4;
    
    if (!isSkinColor(data[idx], data[idx + 1], data[idx + 2])) {
      hairPixels++;
    }
  }
  
  const hairRatio = hairPixels / totalPixels;
  
  if (hairRatio < 0.05) return { length: 'bald', confidence: 0.7 };
  if (hairRatio < 0.15) return { length: 'very_short', confidence: 0.6 };
  if (hairRatio < 0.3) return { length: 'short', confidence: 0.65 };
  if (hairRatio < 0.5) return { length: 'medium', confidence: 0.7 };
  if (hairRatio < 0.7) return { length: 'long', confidence: 0.65 };
  return { length: 'very_long', confidence: 0.6 };
}

/**
 * 加载图像
 */
function loadImage(imageBase64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (event) => {
      const error = new Error('Failed to load image');
      (error as any).originalEvent = event;
      reject(error);
    };
    // 确保是有效的 data URL 格式
    const dataUrl = imageBase64.startsWith('data:') 
      ? imageBase64 
      : `data:image/jpeg;base64,${imageBase64}`;
    img.src = dataUrl;
  });
}

/**
 * 综合分析人脸图像
 */
export async function analyzeFace(
  imageBase64: string,
  options?: { skipColorDetection?: boolean }
): Promise<FaceAnalysisResult> {
  const defaultResult: FaceAnalysisResult = {
    faceDetected: false,
    faceCount: 0,
    gender: null,
    genderConfidence: 0,
    ethnicity: 'unknown',
    ethnicityConfidence: 0,
    colorAttributes: {
      skinTone: 'medium',
      skinColor: '#C4A484',
      hairColor: 'brown',
      hairColorHex: '#4A3728',
      eyeColor: 'brown',
      eyeColorHex: '#4A3728'
    },
    hairShape: 'unknown',
    hairLength: 'unknown',
    hairBangs: false,
    hairBangsStyle: 'unknown',
    facialFeatures: {
      faceShape: 'unknown',
      noseShape: 'unknown',
      eyeShape: 'unknown',
      lipShape: 'unknown',
      jawline: 'unknown'
    },
    accessories: {
      hasGlasses: false,
      glassesType: 'none',
      hasBeard: false,
      beardLength: 'none',
      hasHat: false,
      hatColor: null,
      hasMask: false,
      hasOpenEyes: true
    }
  };
  
  try {
    const loaded = await loadModels();
    if (!loaded) {
      console.warn('[FaceAnalysis] Models not loaded');
      return defaultResult;
    }

    console.log('[FaceAnalysis] Loading image...');
    const img = await loadImage(imageBase64);
    console.log('[FaceAnalysis] Image loaded, size:', img.width, 'x', img.height);

    // 使用与 useFaceCrop 相同的配置
    const faceDetectorOptions = new faceapi.TinyFaceDetectorOptions({
      inputSize: 320,
      scoreThreshold: 0.5,
    });
    const detections = await faceapi.detectAllFaces(img, faceDetectorOptions);
    console.log('[FaceAnalysis] Detections:', detections.length);

    if (detections.length === 0) {
      console.warn('[FaceAnalysis] No faces detected in analyzeFace, returning default');
      return defaultResult;
    }
    
    const faceCount = detections.length;
    console.log(`[FaceAnalysis] Detected ${faceCount} face(s)`);
    
    const detection = detections[0];
    const landmarksResult = await faceapi.detectFaceLandmarks(img);

    // faceapi.detectFaceLandmarks 可能返回多种格式：
    // - 单个 FaceLandmarks68 对象
    // - FaceLandmarks68[] 数组
    // - undefined
    let landmarks: faceapi.FaceLandmarks68 | null = null;

    if (landmarksResult) {
      if (Array.isArray(landmarksResult)) {
        landmarks = landmarksResult[0] || null;
      } else {
        landmarks = landmarksResult;
      }
    }

    if (!landmarks) {
      console.warn('[FaceAnalysis] Could not detect landmarks');
      return { ...defaultResult, faceDetected: true, faceCount };
    }

    const pos = landmarks.positions;
    
    // 检测性别
    const genderResult = detectGender(landmarks);
    console.log('[FaceAnalysis] Gender:', genderResult);
    
    // 检测颜色属性
    const colorAttributes = options?.skipColorDetection
      ? defaultResult.colorAttributes
      : await detectColorAttributes(imageBase64);
    
    // 检测人种
    const faceWidth = Math.abs(pos[16].x - pos[0].x);
    const faceHeight = Math.abs(pos[8].y - pos[19].y);
    const noseWidth = Math.abs(pos[35].x - pos[31].x);
    const eyeDistance = Math.abs(pos[45].x - pos[36].x);
    
    const ethnicity = detectEthnicity(faceWidth, faceHeight, noseWidth, eyeDistance, colorAttributes.skinTone);
    console.log('[FaceAnalysis] Ethnicity:', ethnicity);
    
    // 检测面部特征
    const faceShape = detectFaceShape(landmarks);
    const noseShape = detectNoseShape(landmarks);
    const eyeShape = detectEyeShape(landmarks);
    const lipShape = detectLipShape(landmarks);
    const jawline = detectJawline(landmarks);
    
    // 头发分析
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    let hairShapeResult = { shape: 'unknown' as HairShape, confidence: 0 };
    let hairLengthResult = { length: 'unknown' as HairLength, confidence: 0 };
    let bangsResult = { hasBangs: false, style: 'none' as 'none' | 'side' | 'center' | 'unknown' };
    
    if (ctx) {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      hairShapeResult = detectHairShape(imageData);
      hairLengthResult = detectHairLength(imageData);
      bangsResult = detectBangs(imageData);
    }

    // ========== 腾讯云 API 调用（通过后端接口，安全不崩溃）==========
    let tencentAccessories = {
      hasGlasses: false,
      mask: false,
      beard: false,
    };

    try {
      // 调用后端 API，不直接引用 SDK
      const apiResponse = await fetch("/api/face-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64 }),
      });

      if (apiResponse.ok) {
        const data = await apiResponse.json();
        tencentAccessories = {
          hasGlasses: data.hasGlasses ?? false,
          mask: data.hasMask ?? false,
          beard: data.hasBeard ?? false,
        };
        console.log("✅ 腾讯云配饰检测成功", tencentAccessories);
      }
    } catch (e) {
      console.warn("[FaceAnalysis] 腾讯云 API 调用失败，使用默认值", e);
    }
    
    // 使用face-api.js检测其他特征（人种、脸型、鼻型、眼型、唇型、下颌线、头发等）
    // 检测眼镜（基于面部特征点和图像分析）
    let imageDataForGlasses: ImageData | undefined;
    if (ctx) {
      imageDataForGlasses = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
    const glassesResult = detectGlasses(landmarks, imageDataForGlasses);
    console.log('[FaceAnalysis] Local glasses detected:', glassesResult);
    
    // 构建配饰对象 - 使用腾讯云 API 检测结果
    const accessories = {
      hasGlasses: glassesResult.hasGlasses,
      glassesType: glassesResult.glassesType,
      hasBeard: tencentAccessories.beard,
      beardLength: tencentAccessories.beard ? 'medium' as const : 'none' as const,
      hasHat: false,    // API 暂不支持帽子检测
      hatColor: null,
      hasMask: tencentAccessories.mask,
      hasOpenEyes: true
    };
    console.log('[FaceAnalysis] Accessories:', accessories);

    return {
      faceDetected: true,
      faceCount,
      gender: genderResult.gender,
      genderConfidence: genderResult.confidence,
      ethnicity: ethnicity.ethnicity,
      ethnicityConfidence: ethnicity.confidence,
      colorAttributes,
      hairShape: hairShapeResult.shape,
      hairLength: hairLengthResult.length,
      hairBangs: bangsResult.hasBangs,
      hairBangsStyle: bangsResult.style,
      facialFeatures: {
        faceShape,
        noseShape,
        eyeShape,
        lipShape,
        jawline
      },
      accessories
    };
  } catch (error) {
    if (error instanceof Error) {
      console.error('[FaceAnalysis] Error:', error.message);
    } else if (error && typeof error === 'object' && 'type' in error) {
      // DOM Event objects (like onerror events) don't have a useful message
      console.error('[FaceAnalysis] Image/Model loading failed (DOM Event caught)');
    } else {
      console.error('[FaceAnalysis] Unexpected error:', error);
    }
    return defaultResult;
  }
}

/**
 * 生成人脸描述字符串
 */
export function generateFaceDescription(result: FaceAnalysisResult): string {
  const parts: string[] = [];
  
  if (result.gender) {
    parts.push(`${result.gender} ${result.ethnicity !== 'unknown' ? result.ethnicity + ' ' : ''}face`);
  }
  if (result.facialFeatures.faceShape !== 'unknown') {
    parts.push(`${result.facialFeatures.faceShape} face shape`);
  }
  if (result.facialFeatures.eyeShape !== 'unknown') {
    parts.push(`${result.facialFeatures.eyeShape} eyes`);
  }
  if (result.facialFeatures.noseShape !== 'unknown') {
    parts.push(`${result.facialFeatures.noseShape} nose`);
  }
  if (result.facialFeatures.lipShape !== 'unknown') {
    parts.push(`${result.facialFeatures.lipShape} lips`);
  }
  if (result.facialFeatures.jawline !== 'unknown') {
    parts.push(`${result.facialFeatures.jawline} jawline`);
  }
  if (result.hairLength !== 'unknown' && result.hairLength !== 'bald') {
    parts.push(`${result.hairLength} hair`);
  }
  if (result.hairShape !== 'unknown') {
    parts.push(`${result.hairShape} texture`);
  }
  if (result.hairBangs && result.hairBangsStyle !== 'unknown') {
    parts.push(`${result.hairBangsStyle} bangs`);
  }
  
  return parts.length > 0 ? parts.join(', ') : '';
}

/**
 * 生成完整prompt
 */
export function generateFullPrompt(
  result: FaceAnalysisResult,
  stylePrompt: string,
  genderForce?: 'male' | 'female'
): string {
  const parts: string[] = [];
  
  // 性别控制（最高优先级）
  if (genderForce) {
    parts.push(`MUST be ${genderForce}, ${genderForce} face only, ${genderForce === 'male' ? 'masculine' : 'feminine'} features.`);
  } else if (result.gender) {
    parts.push(`Preserve original gender: ${result.gender}.`);
  }
  
  // 人种保留
  if (result.ethnicity !== 'unknown') {
    parts.push(`Maintain ${result.ethnicity} ethnic appearance.`);
  }
  
  // 颜色属性
  const colors = result.colorAttributes;
  if (colors.skinTone !== 'unknown') {
    parts.push(`Preserve skin tone: ${colors.skinTone} (${colors.skinColor}).`);
  }
  if (colors.hairColor !== 'unknown') {
    parts.push(`Preserve hair color: ${colors.hairColor} (${colors.hairColorHex}).`);
  }
  if (colors.eyeColor !== 'unknown') {
    parts.push(`Preserve eye color: ${colors.eyeColor} (${colors.eyeColorHex}).`);
  }
  
  // 面部特征
  const faceDesc = generateFaceDescription(result);
  if (faceDesc) {
    parts.push(`Face features: ${faceDesc}.`);
  }
  
  // 头发特征
  if (result.hairLength !== 'unknown' && result.hairLength !== 'bald') {
    parts.push(`Hair length: ${result.hairLength}.`);
  }
  if (result.hairShape !== 'unknown') {
    parts.push(`Hair texture: ${result.hairShape}.`);
  }
  if (result.hairBangs && result.hairBangsStyle !== 'unknown') {
    parts.push(`Bangs style: ${result.hairBangsStyle}.`);
  }

  // 配饰特征（眼镜、胡须、帽子等）
  if (result.accessories) {
    const acc = result.accessories;
    if (acc.hasGlasses && acc.glassesType !== 'unknown') {
      parts.push(`Must wear ${acc.glassesType} glasses.`);
    }
    if (acc.hasBeard) {
      parts.push(`Has ${acc.beardLength} beard.`);
    }
    if (acc.hasHat) {
      parts.push(`Wearing hat${acc.hatColor ? ` (${acc.hatColor})` : ''}.`);
    }
    if (acc.hasMask) {
      parts.push(`Wearing mask.`);
    }
  }

  // 风格
  parts.push(`Style: ${stylePrompt}`);
  
  return parts.join(' ');
}