/**
 * lib/faceAnalysis.ts
 * 全面人脸分析模块
 * 检测性别、人种、面部特征、头发特征、颜色属性等
 */

import * as faceapi from 'face-api.js';
import { FaceAnalysisResult, Ethnicity, HairShape, HairLength, ColorAttributes } from './types';
import { detectColorAttributes } from './colorDetection';
import { detectBeardLocal } from './localBeardDetection';

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
 * 增强的性别检测 - 分层加权投票策略
 * 
 * 检测优先级：
 * 1. 胡子检测 - 最可靠指标（男性置信度 0.9）
 * 2. 长发+无胡子 - 强女性指标（女性置信度 0.75）
 * 3. 面部特征分析 - 下颌宽度、眉眼比例作为补充
 * 4. 配饰辅助 - 耳环/项链提升女性置信度
 */
function detectGenderEnhanced(
  landmarks: faceapi.FaceLandmarks68,
  hasBeard: boolean,
  hairLength: HairLength,
  shoulderRatio: number = 0,
  jawLine: 'soft' | 'sharp' | 'medium' = 'medium',
  lipShape: 'full' | 'thin' | 'medium' = 'medium',
  hasEarrings: boolean = false,
  hasNecklace: boolean = false,
  beardLength?: 'short' | 'medium' | 'long'
): { gender: 'male' | 'female' | null; confidence: number } {
  const pos = landmarks.positions;
  
  let maleScore = 0;
  let femaleScore = 0;
  
  // 有胡须的情况下，给maleScore加0.5分（方案B）
  //胡子检测已改进，假阳性概率大大降低
  
  // 第二层：长发检测（女性特征）- 但如果有胡须，长发可能不是女性特征
  // [Rollback Point 16] 修复：当 hasBeard=true + beardLength='short' 时，给更高的 maleScore
  // 问题：hasBeard=true + beardLength='short' + hairLength='medium' + shoulderRatio=0.94 时
  //       错误地给 femaleScore += 0.3，认为是披肩发
  // 原因：黑人卷发会导致高 shoulderRatio，但不是披肩发
  if (hasBeard) {
    // [Rollback Point 16] 短胡子是最强的男性特征，无论 hairLength 和 shoulderRatio 如何
    if (beardLength === 'short') {
      maleScore += 0.85;  // 短胡子给非常高的男性分数
      // 即使 hairLength='long' 或 shoulderRatio 高，也不再给 femaleScore
    } else if (hairLength === 'long' || hairLength === 'very_long') {
      // 有胡须但同时有长发，可能是头发遮住下巴而不是真的有胡子
      // 但如果真的检测到胡子，还是给一些男性分数
      maleScore += 0.2;
      femaleScore += 0.2;  // 各加一半，表示不确定是胡子还是长发遮下巴
    } else if (hairLength === 'medium' && shoulderRatio > 0.3) {
      // 中等长度头发+肩膀有头发，可能是披肩发遮住下巴，不是真正的胡子
      femaleScore += 0.3;  // 披肩发是女性特征
    } else if (hairLength === 'short' || hairLength === 'very_short') {
      // [ROLLBACK POINT 11] 修复性别检测问题
        // 问题：maleScore=0.5 与 lipShape='full' 的 femaleScore=0.5 相同，导致平局
        // 原因：hasBeard=true + hairLength='short' 是非常明确的男性特征
        // 解决方案：提高 maleScore 加分（从 0.5 提高到 0.8），因为短胡子是最强的男性特征之一
      maleScore += 0.8;  // 提高短发胡子的男性分数权重
    } else {
      // 其他情况（中等长度但肩膀无头发），给maleScore加0.4分
      maleScore += 0.4;
    }
  } else if (hairLength === 'long' || hairLength === 'very_long') {
    femaleScore += 0.8;  // 提高长发权重
  } else if (hairLength === 'medium') {
    femaleScore += 0.2;  // medium头发不是明确女性特征，降低权重
  } else if (hairLength === 'short' || hairLength === 'very_short') {
    // 短发是男性特征，给maleScore加0.2分
    maleScore += 0.2;
  } else if (hairLength === 'bald') {
    // 光头/近似光头是男性特征，给maleScore加0.25分
    maleScore += 0.25;
  }
  
  // 第三层：下颌线检测（soft是女性特征，sharp是男性特征）
  // 需要从外部传入jawline参数，这里暂不支持，先用面部比例推断
  
  // 第三层：面部特征分析
  const jawWidth = Math.abs(pos[12].x - pos[4].x);
  const faceWidth = Math.abs(pos[16].x - pos[0].x);
  const jawRatio = jawWidth / faceWidth;
  
  const leftEyebrowCenter = avgY(pos.slice(17, 22));
  const rightEyebrowCenter = avgY(pos.slice(22, 27));
  const leftEyeCenter = avgY(pos.slice(36, 42));
  const rightEyeCenter = avgY(pos.slice(42, 48));
  const eyebrowEyeDistance = ((leftEyebrowCenter + rightEyebrowCenter) / 2) - ((leftEyeCenter + rightEyeCenter) / 2);
  
  const eyeDistance = Math.abs(pos[45].x - pos[36].x);
  const eyebrowEyeRatio = eyebrowEyeDistance / eyeDistance;
  
  if (jawRatio > 0.55) maleScore += 0.15;
  else if (jawRatio < 0.5) femaleScore += 0.15;
  
  if (eyebrowEyeRatio < 0.75) maleScore += 0.15;
  else if (eyebrowEyeRatio > 0.85) femaleScore += 0.15;
  
  // 第五层：眉弓角度检测（新增）
  // 男性眉毛通常有明显倾斜：内高外低
  // 女性眉毛通常较平直或外高内低
  const eyebrowAngle = detectEyebrowAngle(landmarks);
  if (eyebrowAngle > 0.15) maleScore += 0.15;  // 明显向下倾斜 = 男性
  else if (eyebrowAngle < 0.0) femaleScore += 0.10;  // 向上倾斜或平直 = 女性
  
  // 第四层：下颌线和嘴唇检测（女性特征）
  // 降低所有面部特征权重，减少侧脸角度导致的误判
  // 重要：如果hasBeard=false（无胡子），则减少对嘴唇和下颌的权重，因为这些特征可能不准确
  const faceFeatureWeight = hasBeard ? 1.0 : 0.5;  // 无胡子时降低面部特征权重
  if (jawLine === 'soft') femaleScore += 0.25 * faceFeatureWeight;
  else if (jawLine === 'sharp') maleScore += 0.10 * faceFeatureWeight;
  
  // [Rollback Point 43 - ISSUE-4] 修复：降低 lipShape='full' 权重从 0.50 到 0.25
  // 原因：full 嘴唇不是强烈的女性特征，厚嘴唇男性也很常见
  // 问题照片：无胡子白人男性被误判为 female，因为 full 嘴唇 + 高 femaleScore
  if (lipShape === 'full') femaleScore += 0.25 * faceFeatureWeight;  // [ROLLBACK POINT 43 - ISSUE-4]
  else if (lipShape === 'thin') maleScore += 0.20 * faceFeatureWeight;
  
  // 第六层：配饰检测
  if (hasEarrings) femaleScore += 0.25;
  if (hasNecklace) femaleScore += 0.15;
  
  const totalScore = maleScore + femaleScore;
  console.log(`[GenderDetect] maleScore=${maleScore.toFixed(2)}, femaleScore=${femaleScore.toFixed(2)}, totalScore=${totalScore.toFixed(2)}`);
  
  // 有胡须的情况下，maleScore已额外+0.5分
  
  if (totalScore < 0.3) return { gender: null, confidence: 0.3 };
  
  const confidence = totalScore > 0 ? Math.max(maleScore, femaleScore) / totalScore : 0.5;
  
  if (maleScore > femaleScore) return { gender: 'male', confidence: Math.min(confidence, 0.85) };
  if (femaleScore > maleScore) return { gender: 'female', confidence: Math.min(confidence, 0.85) };
  
  return { gender: null, confidence: 0.5 };
}

/**
 * 简化版性别检测（仅基于面部特征）
 */
function detectGender(landmarks: faceapi.FaceLandmarks68): { gender: 'male' | 'female'; confidence: number } {
  const pos = landmarks.positions;
  
  const jawWidth = Math.abs(pos[12].x - pos[4].x);
  const faceWidth = Math.abs(pos[16].x - pos[0].x);
  const jawRatio = jawWidth / faceWidth;
  
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
  skinTone: 'light' | 'medium' | 'dark' | 'medium_light' | 'medium_dark' | 'unknown'
): { ethnicity: Ethnicity; confidence: number } {
  const faceRatio = faceHeight / faceWidth;
  const eyeDistanceRatio = eyeDistance / faceWidth;
  
  // 亚洲人：脸较窄较长，眼睛间距较小
  if (faceRatio > 1.3 && eyeDistanceRatio < 0.28) {
    return { ethnicity: 'yellow', confidence: 0.75 };
  }
  
        // 非洲人：脸较宽，颧骨宽，或深肤色（仅限dark肤色）
  if ((faceRatio < 1.15 || noseWidth > faceWidth * 0.4) && skinTone === 'dark') {
    return { ethnicity: 'black', confidence: 0.7 };
  }
  
  // 如果是深肤色但脸型不满足上面条件，仍然判断为黑人
  if (skinTone === 'dark' && faceRatio < 1.25) {
    return { ethnicity: 'black', confidence: 0.65 };
  }
  
  // 白人：面部比例均衡
  if (faceRatio >= 1.15 && faceRatio <= 1.3 && skinTone === 'light') {
    return { ethnicity: 'white', confidence: 0.65 };
  }
  
  // 印度/中东/拉丁裔 - 归类为中等肤色白人
  // medium_light 肤色不应仅因宽脸就判定为黑人，medium_light 更接近白人
  if (skinTone === 'medium' || skinTone === 'medium_light') {
    // 只有在非常明显的非洲特征（深肤色+宽脸+宽鼻）才判定为黑人
    // 这种组合在 medium_light 肤色中极少见
    if (skinTone === 'medium_light' && faceRatio < 1.15 && noseWidth > faceWidth * 0.4) {
      return { ethnicity: 'black', confidence: 0.45 };
    }
    return { ethnicity: 'white', confidence: 0.55 };
  }
  
  // medium_dark（偏黑的中等肤色）：结合面部特征判断
  if (skinTone === 'medium_dark') {
    // 如果脸型符合非洲特征（脸宽或鼻宽），判断为黑人
    if (faceRatio < 1.2 || noseWidth > faceWidth * 0.38) {
      return { ethnicity: 'black', confidence: 0.6 };
    }
    return { ethnicity: 'white', confidence: 0.5 };
  }
  
  // 拉丁裔 - 归类为白人
  if (skinTone !== 'dark' && faceRatio >= 1.2) {
    return { ethnicity: 'white', confidence: 0.5 };
  }
  
  // 白人 fallback：浅肤色但脸型不在标准范围内（如圆脸）
  if (skinTone === 'light' && faceRatio < 1.15) {
    return { ethnicity: 'white', confidence: 0.45 };
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
  
  if (avgRatio > 3.0) return 'round';
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
  
  console.log(`[LipShape] lipHeight=${lipHeight.toFixed(1)}, mouthWidth=${mouthWidth.toFixed(1)}, lipRatio=${lipRatio.toFixed(3)}`);
  
  // 提高阈值：full lips 应该是明显的厚嘴唇
  if (lipRatio > 0.35) return 'full';
  if (lipRatio < 0.18) return 'thin';
  return 'medium';
}

/**
 * 检测下颌线
 */
function detectJawline(landmarks: faceapi.FaceLandmarks68): 'soft' | 'sharp' | 'medium' | 'unknown' {
  const pos = landmarks.positions;
  
  // 计算两点之间的角度（返回弧度转角度）
  const calculateAngle = (p1: { x: number; y: number }, vertex: { x: number; y: number }, p2: { x: number; y: number }): number => {
    const v1 = { x: p1.x - vertex.x, y: p1.y - vertex.y };
    const v2 = { x: p2.x - vertex.x, y: p2.y - vertex.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
    if (mag1 === 0 || mag2 === 0) return 180;
    const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
    return Math.acos(cosAngle) * 180 / Math.PI;
  };
  
  // 计算左下颌角角度 (pos[3], pos[4], pos[5])
  const leftJawAngle = calculateAngle(pos[3], pos[4], pos[5]);
  // 计算右下颌角角度 (pos[11], pos[12], pos[13])
  const rightJawAngle = calculateAngle(pos[11], pos[12], pos[13]);
  
  const avgJawAngle = (leftJawAngle + rightJawAngle) / 2;
  
  // 角度越小 =越棱角分明（sharp，方形脸，男性特征）
  // 角度越大 = 越圆润（soft，椭圆脸，女性特征）
  if (avgJawAngle < 130) return 'sharp';
  if (avgJawAngle > 150) return 'soft';
  return 'medium';
}

/**
 * 检测眉弓角度（眉毛倾斜度）
 * 男性眉毛通常有明显倾斜：内高外低（\），即内侧高于外侧
 * 女性眉毛通常较平直或外高内低（/），倾斜度较小
 */
function detectEyebrowAngle(landmarks: faceapi.FaceLandmarks68): number {
  const pos = landmarks.positions;
  
  // 左眉毛：内角(21)到外角(17)的下降程度
  // 在canvas坐标系中，y增加表示向下
  // 如果外侧y > 内侧y，表示眉毛向下倾斜（男性特征）
  const leftEyebrowDrop = (pos[17].y - pos[21].y) / Math.abs(pos[17].x - pos[21].x);
  
  // 右眉毛：内角(22)到外角(26)的下降程度
  const rightEyebrowDrop = (pos[26].y - pos[22].y) / Math.abs(pos[26].x - pos[22].x);
  
  const avgEyebrowDrop = (leftEyebrowDrop + rightEyebrowDrop) / 2;
  
  console.log(`[EyebrowAngle] leftDrop=${leftEyebrowDrop.toFixed(3)}, rightDrop=${rightEyebrowDrop.toFixed(3)}, avgDrop=${avgEyebrowDrop.toFixed(3)}`);
  
  return avgEyebrowDrop;
}

/**
 * 增强的眼镜检测（基于面部特征点和图像分析）
 * 关注：镜框 + 瞳孔间距比
 */
function detectGlasses(landmarks: faceapi.FaceLandmarks68, imageData?: ImageData): { hasGlasses: boolean; glassesType: 'none' | 'normal' | 'sunglasses' | 'unknown' } {
  const pos = landmarks.positions;
  
  // ========== 方法1：基于面部特征点的检测 ==========
  
  // 1.1 计算两眼外角到内角的水平跨度
  // 左眼: 外角(36) -> 内角(39), 右眼: 内角(42) -> 外角(45)
  const leftEyeSpan = Math.abs(pos[39].x - pos[36].x);  // 左眼跨度
  const rightEyeSpan = Math.abs(pos[45].x - pos[42].x); // 右眼跨度
  
  // 1.2 计算脸宽（两个外侧轮廓点）
  const faceWidth = Math.abs(pos[16].x - pos[0].x);
  
  // 1.3 计算眼镜占比（两眼中心距离 / 脸宽）
  const leftEyeCenterX = (pos[36].x + pos[39].x) / 2;
  const rightEyeCenterX = (pos[42].x + pos[45].x) / 2;
  const eyeDistance = Math.abs(rightEyeCenterX - leftEyeCenterX);
  const eyeToFaceRatio = eyeDistance / faceWidth;
  
  // 眼镜通常占脸宽的 40%~55%，细框眼镜可能更低
  const hasGlassesRatio = eyeToFaceRatio > 0.35 && eyeToFaceRatio < 0.60;
  
  // 1.4 计算鼻梁宽度与两眼距离的比值（镜架特征）
  const noseBridgeWidth = Math.abs(pos[31].x - pos[35].x);
  const glassesFrameRatio = noseBridgeWidth / eyeDistance;
  const hasNarrowNoseBridge = glassesFrameRatio < 0.15;
  
  // 1.5 眉毛与眼睛的距离（戴眼镜时通常更大，因为镜架撑开了眉毛）
  const leftEyebrowCenterY = avgY(pos.slice(17, 22));
  const rightEyebrowCenterY = avgY(pos.slice(22, 27));
  const leftEyeCenterY = avgY(pos.slice(36, 42));
  const rightEyeCenterY = avgY(pos.slice(42, 48));
  const avgBrowEyeDist = (leftEyebrowCenterY - leftEyeCenterY + rightEyebrowCenterY - rightEyeCenterY) / 2;
  const hasLargeBrowEyeDist = avgBrowEyeDist > 7;
  
  // ========== 方法2：图像边缘检测 ==========
  let frameEdgeScore = 0;
  if (imageData) {
    const { data, width, height } = imageData;
    
    // 眼睛区域坐标
    const leftEyeLeftX = Math.floor(pos[36].x);
    const leftEyeRightX = Math.floor(pos[39].x);
    const rightEyeLeftX = Math.floor(pos[42].x);
    const rightEyeRightX = Math.floor(pos[45].x);
    const leftEyeCenterY = Math.floor(avgY(pos.slice(36, 42)));
    const rightEyeCenterY = Math.floor(avgY(pos.slice(42, 48)));
    
    // 在眼睛上方 10-30px 区域检测镜框上沿
    const eyeTopY = Math.min(leftEyeCenterY, rightEyeCenterY);
    
    // 检测镜框存在的三个指标
    let horizontalEdgeCount = 0;
    let frameWidthCount = 0;
    let bridgeEdgeCount = 0;
    
    // 2.1 扫描眼睛上方 10-30px 区域（镜框上沿）
    for (let y = eyeTopY - 30; y < eyeTopY - 5; y += 2) {
      for (let x = leftEyeLeftX; x < leftEyeRightX; x += 2) {
        if (x + 1 < width && y >= 0 && y < height) {
          const idx = (Math.floor(y) * width + Math.floor(x)) * 4;
          const nextIdx = (Math.floor(y) * width + Math.floor(x + 1)) * 4;
          if (idx >= 0 && nextIdx < data.length) {
            const diff = Math.abs(data[idx] - data[nextIdx]);
            if (diff > 25) horizontalEdgeCount++;
          }
        }
      }
      for (let x = rightEyeLeftX; x < rightEyeRightX; x += 2) {
        if (x + 1 < width && y >= 0 && y < height) {
          const idx = (Math.floor(y) * width + Math.floor(x)) * 4;
          const nextIdx = (Math.floor(y) * width + Math.floor(x + 1)) * 4;
          if (idx >= 0 && nextIdx < data.length) {
            const diff = Math.abs(data[idx] - data[nextIdx]);
            if (diff > 25) horizontalEdgeCount++;
          }
        }
      }
    }
    
    // 2.2 检查镜框宽度是否与眼睛跨度匹配
    const leftFrameWidth = leftEyeRightX - leftEyeLeftX;
    const rightFrameWidth = rightEyeRightX - rightEyeLeftX;
    const expectedFrameWidth = (leftFrameWidth + rightFrameWidth) / 2;
    const actualEyeSpan = (leftEyeSpan + rightEyeSpan) / 2;
    // 正常眼镜的镜框宽度应该比眼睛跨度稍大
    const frameWidthRatio = actualEyeSpan / expectedFrameWidth;
    frameWidthCount = (frameWidthRatio > 0.8 && frameWidthRatio < 1.3) ? expectedFrameWidth * 0.5 : 0;
    
    // 2.3 检测鼻梁区域的镜架边缘（左右镜片之间的鼻架）
    const bridgeY = Math.floor((pos[30].y + pos[27].y) / 2); // 鼻梁位置
    for (let y = bridgeY - 5; y < bridgeY + 5; y += 2) {
      const bridgeLeftX = Math.floor(pos[39].x);
      const bridgeRightX = Math.floor(pos[42].x);
      for (let x = bridgeLeftX; x < bridgeRightX; x += 2) {
        if (x + 1 < width && y >= 0 && y < height) {
          const idx = (Math.floor(y) * width + Math.floor(x)) * 4;
          const nextIdx = (Math.floor(y) * width + Math.floor(x + 1)) * 4;
          if (idx >= 0 && nextIdx < data.length) {
            const diff = Math.abs(data[idx] - data[nextIdx]);
            // 鼻梁区域有明显边缘可能是镜架
            if (diff > 20) bridgeEdgeCount++;
          }
        }
      }
    }
    
    // 综合边缘得分
    const totalEdgeScore = horizontalEdgeCount + frameWidthCount + bridgeEdgeCount;
    frameEdgeScore = totalEdgeScore / (expectedFrameWidth * 2 + 50);
    
    // [Rollback Point 32] 添加诊断日志
    console.log('[DetectGlasses] Edge diagnostic:', {
      horizontalEdgeCount,
      frameWidthCount,
      bridgeEdgeCount,
      totalEdgeScore,
      expectedFrameWidth,
      frameEdgeScore: frameEdgeScore.toFixed(3)
    });
  }
  
  // ========== 方法3：优先检测镜片暗度（直接检测墨镜）==========
  // 墨镜的镜片暗度是最明显的特征，优先检测
  let lensBrightness = 255;
  const isSunglasses = false;
  
  if (imageData) {
    const { data, width, height } = imageData;
    
    // 镜片区域采样（扩大采样范围以获得更准确的结果）
    const leftLensCenterX = Math.floor((pos[36].x + pos[39].x) / 2);
    const leftLensCenterY = Math.floor(avgY(pos.slice(36, 42)));
    const rightLensCenterX = Math.floor((pos[42].x + pos[45].x) / 2);
    const rightLensCenterY = Math.floor(avgY(pos.slice(42, 48)));
    
    let brightnessSum = 0;
    let brightnessCount = 0;
    
    // 采样左右镜片区域（扩大采样范围）
    const lensSampleSize = 15;
    for (let dy = -lensSampleSize; dy <= lensSampleSize; dy += 2) {
      for (let dx = -lensSampleSize; dx <= lensSampleSize; dx += 2) {
        const lx = leftLensCenterX + dx;
        const ly = leftLensCenterY + dy;
        const rx = rightLensCenterX + dx;
        const ry = rightLensCenterY + dy;
        
        if (lx >= 0 && lx < width && ly >= 0 && ly < height) {
          const lidx = (ly * width + lx) * 4;
          const lr = data[lidx];
          const lg = data[lidx + 1];
          const lb = data[lidx + 2];
          brightnessSum += 0.299 * lr + 0.587 * lg + 0.114 * lb;
          brightnessCount++;
        }
        if (rx >= 0 && rx < width && ry >= 0 && ry < height) {
          const ridx = (ry * width + rx) * 4;
          const rr = data[ridx];
          const rg = data[ridx + 1];
          const rb = data[ridx + 2];
          brightnessSum += 0.299 * rr + 0.587 * rg + 0.114 * rb;
          brightnessCount++;
        }
      }
    }
    
    lensBrightness = brightnessCount > 0 ? brightnessSum / brightnessCount : 255;
    // 注意：不再仅根据 lens brightness 判断墨镜，需要先检测到镜框才能判定
    // 如果没有检测到镜框（frameEdgeScore低），即使镜片暗也可能是阴影，不判定为墨镜
    console.log('[DetectGlasses] Lens brightness:', lensBrightness.toFixed(1));
  }

  // ========== 综合判断（如果镜片不是暗的，再检测普通眼镜）==========
  // 检测咧嘴笑：当下巴区域很亮时，可能是露出白色牙齿的笑容，此时应提高眼镜检测阈值
  let chinBrightness = 0;
  if (imageData) {
    const { data, width, height } = imageData;
    const chinCenterX = Math.floor((pos[6].x + pos[8].x + pos[10].x) / 3);
    const chinCenterY = Math.floor(pos[8].y + 20);
    let brightnessSum = 0, count = 0;
    for (let dy = -10; dy <= 10; dy += 2) {
      for (let dx = -15; dx <= 15; dx += 2) {
        const x = chinCenterX + dx, y = chinCenterY + dy;
        if (x >= 0 && x < width && y >= 0 && y < height) {
          const idx = (y * width + x) * 4;
          const r = data[idx];
          // 跳过白色牙齿像素(r>200)和极暗像素
          if (r > 200 || r < 5) continue;
          brightnessSum += (r + data[idx + 1] + data[idx + 2]) / 3;
          count++;
        }
      }
    }
    chinBrightness = count > 10 ? brightnessSum / count : 0;
  }
  
  const landmarkScore = (hasGlassesRatio ? 2 : 0) + (hasNarrowNoseBridge ? 1 : 0) + (hasLargeBrowEyeDist ? 1 : 0);
  
  // 降低阈值：landmarkScore >= 3 即可确认有眼镜
  const hasGlassesByLandmarks = landmarkScore >= 3;
  // [Rollback Point 30] 修复眼镜检测逻辑
  // 问题1：阈值 0.50 太严格，漏检了真正戴墨镜的情况（frameEdgeScore=0.490）
  // 问题2：lensBrightness=102.6 时被误判为 sunglasses
  // 解决方案：
  // - hasGlassesByStrongLandmarks 的 frameEdgeScore 从 0.50 降到 0.45
  // - 新增专用 sunglasses 检测条件：lensBrightness < 100 且 frameEdgeScore > 0.40
  // [ROLLBACK ISSUE-5] [ISSUE-10] 修复：landmarkScore>=2 且 frameEdgeScore>0.70 时容易误判
  // 当 lensBrightness < 80（深色瞳仁/浓眉导致眼睛区域偏暗），frameEdgeScore 需要 > 0.85
  // 才能确认是镜框而非眉毛/眼窝阴影。只有当 lensBrightness >= 80 时才用 0.70 阈值。
  const glassesEdgeThreshold = lensBrightness < 80 ? 0.85 : 0.70;
  const hasGlassesByStrongLandmarks = landmarkScore >= 2 && frameEdgeScore > glassesEdgeThreshold;
  // 降低边缘阈值：从 0.50 降到 0.45
  // 但如果 landmarkScore=0，说明没有眼镜特征，只根据边缘判断不可靠
  // 需要提高阈值：landmarkScore > 0 时，frameEdgeScore > 0.70 // [ROLLBACK ISSUE-5] 才判定有眼镜
  // landmarkScore=0 时仍需要较高阈值 0.80
  // 重要：如果chinBrightness > 180（咧嘴笑露出牙齿），说明可能是误检，提高阈值到0.90
  // isSmiling 检测：如果下巴亮度 > 180 认为在微笑，提高边缘检测阈值
  // [ISSUE-9] 修复：0.90 阈值太高，戴眼镜微笑的人也通不过检测
  // 改为 0.70，既防止阴影误检又不漏检戴眼镜的微笑人脸
  // [ISSUE-9] 修复：戴眼镜微笑的人 frameEdgeScore 会降低但 landmarkScore 可靠
  // 当 landmarkScore >= 2 时，面部几何特征已足够确认眼镜，降低 frameEdgeScore 要求
  const isSmiling = chinBrightness > 180;
  console.log('[DetectGlasses] Debug: landmarkScore=', landmarkScore, 'frameEdgeScore=', frameEdgeScore.toFixed(3), 'chinBrightness=', chinBrightness.toFixed(1), 'lensBrightness=', lensBrightness.toFixed(1));
  // 根据 landmarkScore 调整边缘检测阈值：landmarkScore 越高，对 frameEdgeScore 的要求越低
  const effectiveEdgeThreshold = isSmiling
    ? (landmarkScore >= 2 ? 0.50 : 0.90)  // landmark>=2时微笑惩罚降低
    : (landmarkScore >= 2 ? 0.55 : 0.65); // landmark>=2时不微笑也降低
  const hasGlassesByEdges = (landmarkScore > 0 && frameEdgeScore > effectiveEdgeThreshold) || (landmarkScore === 0 && frameEdgeScore > 0.80);
  
  // 深色皮肤+深色镜框的特殊情况：
  // 如果镜片非常暗(<55)且下巴不亮(非微笑露齿)，即使frameEdgeScore较低也可能是深色镜框
  // 这是因为深色镜框和深色皮肤对比度低，导致边缘检测得分低
  // [Rollback Point 18] 修复：降低阈值从65到55，避免深色皮肤误检测为眼镜
  // [ISSUE-8] 修复：提高 lensBrightness 阈值从 55→35，防止浓眉/深眼窝的白人男性被误判
  // 同时 landmarkScore 需要 >= 2（面部几何特征匹配），frameEdgeScore > 0.30
  const isDarkSkinWithDarkGlasses = !isSmiling && lensBrightness < 35 && landmarkScore >= 2 && frameEdgeScore > 0.30;
  console.log('[DetectGlasses] Dark skin with dark glasses fallback:', isDarkSkinWithDarkGlasses);
  
  // [Rollback Point 30] 新增：sunglasses 专用检测条件
  // [ISSUE-8] 修复：提高 lensBrightness 阈值从 70→40，frameEdgeScore 从 0.40→0.50
  // 浓眉/深眼窝也会导致低亮度，需要更严格的边缘特征来确认是墨镜
  const isPossibleSunglasses = lensBrightness < 40 && frameEdgeScore > 0.50 && landmarkScore >= 2;
  
  // [Rollback Point 31] 新增：基于面部特征的眼镜检测
  // 当 landmarkScore >= 2（面部几何特征明显符合眼镜）且 frameEdgeScore > 0.70 // [ROLLBACK ISSUE-5] // [ROLLBACK ISSUE-2] 时
  // 判定为有眼镜，因为面部特征点已经足够可靠，即使边缘检测得分较低
  const hasGlassesByFacialFeatures = landmarkScore >= 2 && frameEdgeScore > 0.70 // [ROLLBACK ISSUE-5]; // [ROLLBACK ISSUE-2]
  
  // [Rollback Point 33] 新增：当 landmarkScore >= 2 且 frameEdgeScore <= 0.30 且 lensBrightness < 135 时
  // 直接判定为有眼镜，绕过 frameEdgeScore 的限制
  // [ISSUE-8] 修复：lensBrightness < 135 太宽松，浓眉/深眼窝也容易触发
  // 仅当 lensBrightness < 60 且 landmarkScore >= 3 时才判定
  const hasGlassesByLandmarkAndLens = landmarkScore >= 3 && frameEdgeScore <= 0.20 && lensBrightness < 60;
  
  if (hasGlassesByLandmarks || hasGlassesByStrongLandmarks || hasGlassesByEdges || hasGlassesByFacialFeatures || hasGlassesByLandmarkAndLens || isDarkSkinWithDarkGlasses || isPossibleSunglasses) {
    // 有镜框，检测是普通眼镜还是太阳镜
    // 只有当检测到镜框时，才根据镜片亮度判断是否是太阳镜
    // [Rollback Point 50] 修复：sunglasses 亮度阈值调整为 80
    // [ISSUE-8] 修复：lensBrightness < 80 太宽松，浓眉/深眼窝也会导致低亮度
    // 提高阈值到 lensBrightness < 40 才判定为 sunglasses
    if (lensBrightness < 40) {
      console.log('[DetectGlasses] Sunglasses detected, lens brightness:', lensBrightness.toFixed(1), 'frameEdgeScore:', frameEdgeScore.toFixed(3));
      return { hasGlasses: true, glassesType: 'sunglasses' };
    }
    console.log('[DetectGlasses] Glasses detected, landmarkScore:', landmarkScore, 'frameEdgeScore:', frameEdgeScore.toFixed(3));
    return { hasGlasses: true, glassesType: 'normal' };
  }
  
  // 如果没有检测到镜框，即使镜片区域暗，也不能判定为太阳镜（可能是阴影）
  return { hasGlasses: false, glassesType: 'none' };
}

/**
 * 检测镜框颜色
 * 通过分析镜框区域的颜色来判断框架颜色
 */
function detectGlassesFrameColor(imageData: ImageData | undefined, pos: faceapi.Point[]): 'black' | 'brown' | 'silver' | 'gold' | 'red' | 'blue' | 'white' | 'unknown' {
  if (!imageData) return 'unknown' as const;
  
  const { data, width, height } = imageData;
  
  // 镜框位置：在眼睛上方和鼻梁区域
  const leftEyeCenterY = (pos[36].y + pos[39].y) / 2;
  const rightEyeCenterY = (pos[42].y + pos[45].y) / 2;
  const eyeTopY = Math.min(leftEyeCenterY, rightEyeCenterY);
  
  // 收集镜框区域的颜色
  const frameColors: { r: number; g: number; b: number }[] = [];
  
  // 扫描左眼镜框区域（眼睛上方）
  const leftEyeLeftX = Math.floor(pos[36].x);
  const leftEyeRightX = Math.floor(pos[39].x);
  for (let y = Math.floor(eyeTopY - 30); y < Math.floor(eyeTopY - 3); y += 2) {
    for (let x = leftEyeLeftX; x < leftEyeRightX; x += 2) {
      if (y >= 0 && y < height && x >= 0 && x < width) {
        const idx = (y * width + x) * 4;
        if (idx >= 0 && idx + 2 < data.length) {
          const r = data[idx], g = data[idx + 1], b = data[idx + 2];
          // 扩大亮度范围，捕获深色镜框
          const brightness = (r + g + b) / 3;
          if (brightness > 15 && brightness < 200) {
            frameColors.push({ r, g, b });
          }
        }
      }
    }
  }
  
  // 扫描右眼镜框区域
  const rightEyeLeftX = Math.floor(pos[42].x);
  const rightEyeRightX = Math.floor(pos[45].x);
  for (let y = Math.floor(eyeTopY - 30); y < Math.floor(eyeTopY - 3); y += 2) {
    for (let x = rightEyeLeftX; x < rightEyeRightX; x += 2) {
      if (y >= 0 && y < height && x >= 0 && x < width) {
        const idx = (y * width + x) * 4;
        if (idx >= 0 && idx + 2 < data.length) {
          const r = data[idx], g = data[idx + 1], b = data[idx + 2];
          const brightness = (r + g + b) / 3;
          if (brightness > 15 && brightness < 200) {
            frameColors.push({ r, g, b });
          }
        }
      }
    }
  }
  
  // 计算平均颜色
  if (frameColors.length < 5) {
    console.log('[GlassesFrameColor] Not enough samples:', frameColors.length);
    return 'unknown' as const;
  }
  
  let avgR = 0, avgG = 0, avgB = 0;
  for (const c of frameColors) {
    avgR += c.r;
    avgG += c.g;
    avgB += c.b;
  }
  avgR = Math.round(avgR / frameColors.length);
  avgG = Math.round(avgG / frameColors.length);
  avgB = Math.round(avgB / frameColors.length);
  
  console.log('[GlassesFrameColor] Detected avg color: RGB(', avgR, ',', avgG, ',', avgB, '), samples:', frameColors.length);
  
  // 根据颜色判断框架颜色
  // 黑色：RGB都较低（包括深灰色镜框）
  if (avgR < 50 && avgG < 50 && avgB < 50) return 'black' as const;
  // 扩展黑色检测：低亮度但不是纯黑（如深灰/炭灰色镜框）
  if (avgR < 85 && avgG < 85 && avgB < 85 && (avgR + avgG + avgB) / 3 < 70) return 'black' as const;
  
  // 白色
  if (avgR > 200 && avgG > 200 && avgB > 200) return 'white' as const;
  
  // 金色：红色和绿色较高，蓝色较低
  if (avgR > 150 && avgG > 120 && avgB < 100) {
    if (avgR > avgG && avgG > avgB * 0.8) return 'gold' as const;
  }
  
  // 银色：RGB比较接近且值在中间范围
  if (Math.abs(avgR - avgG) < 30 && Math.abs(avgG - avgB) < 30 && avgR > 100 && avgR < 200) return 'silver' as const;
  
  // 红色
  if (avgR > 150 && avgR > avgG * 1.5 && avgR > avgB * 1.5) return 'red' as const;
  
  // 蓝色
  if (avgB > 100 && avgB > avgR * 1.2 && avgB > avgG * 1.2) return 'blue' as const;
  
  // 棕色：红色和绿色较高，蓝色较低
  if (avgR > 80 && avgG > 50 && avgR > avgB && avgB < 120) return 'brown' as const;
  
  return 'unknown' as const;
}

/**
 * 判断是否为肤色
 * 支持深肤色和普通肤色两种检测逻辑
 */
/**
 * 使用HSL检测是否为头发颜色
 * 头发通常是低亮度、低饱和度的深色
 */
function isHairColor(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2 / 255 * 100; // lightness as percentage
  
  // 如果太亮（可能是高光），不是头发
  if (l > 50) return false;
  
  // 计算饱和度
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l / 100 - 1)) / 255 * 100;
  
  // 头发通常是低饱和度、低亮度
  // 放宽条件以检测更多类型的头发颜色
  // 黑色头发：l < 35, s < 35
  // 深棕头发：l < 45, s < 45
  if (l < 45 && s < 45) return true;
  
  return false;
}

/**
 * 检测是否为头发（组合方法：非皮肤 或 HSL头发颜色）
 */
function isHairOrNotSkin(r: number, g: number, b: number): boolean {
  // 方案1：非皮肤颜色检测
  if (!isSkinColor(r, g, b) && r < 220) return true;
  // 方案2：HSL头发颜色检测
  if (isHairColor(r, g, b)) return true;
  return false;
}

function isSkinColor(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2 / 255;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1)) / 255;
  
  // 深肤色检测：低亮度但中等饱和度（用于深肤色人群）
  if (l > 0.10 && l < 0.4 && s > 0.10 && s < 0.5) return true;
  
  // 普通肤色检测（用于白人和亚洲人）
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
  
  console.log(`[HairShape] edges: total=${totalEdges}, h=${horizontalEdges}(${(hRatio*100).toFixed(1)}%), v=${verticalEdges}(${(vRatio*100).toFixed(1)}%), d=${diagonalEdges}(${(dRatio*100).toFixed(1)}%)`);
  
  // 对于非洲人短卷发，vRatio通常较高（>17%），应优先检测卷发
  // 如果 vRatio 超过 17%，就检测为卷发，因为短卷发会有更多垂直边缘
  if (vRatio > 0.17) {
    return { shape: 'curly', confidence: Math.min(vRatio + dRatio, 0.9) };
  }
  if (hRatio > 0.4) return { shape: 'straight', confidence: hRatio };
  if (dRatio > 0.3) return { shape: 'wavy', confidence: dRatio };
  
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
  
  // 只检测额头区域（眉毛到发际线之间）的头发
  for (let y = Math.floor(height * 0.15); y < Math.floor(height * 0.28); y += 2) {
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
  // 提高阈值，只有人脸区域有足够多的头发像素才认为有刘海
  if (totalHair < 50) {
    return { hasBangs: false, style: 'none' };
  }
  
  const centerRatio = centerHairPixels / totalHair;
  const leftRatio = leftHairPixels / totalHair;
  const rightRatio = rightHairPixels / totalHair;
  
  // 修正：更精确地区分刘海样式
  // 中心刘海：中间区域像素占比超过45%（更严格）
  if (centerRatio > 0.45) return { hasBangs: true, style: 'center' };
  // 侧边刘海：左边或右边占比超过40%（更严格）
  if (leftRatio > 0.40 || rightRatio > 0.40) return { hasBangs: true, style: 'side' };
  // 如果头发分布比较均匀但总量足够，可能是凌乱发型，不算刘海
  if (totalHair < 80) return { hasBangs: false, style: 'none' };
  
  return { hasBangs: false, style: 'none' };
}

/**
 * 检测下巴区域是否有显著胡须（络腮胡）
 * 当下巴到脸颊区域有显著深色像素时，认为有络腮胡
 * @returns true 表示检测到下巴区域有胡须
 */
function hasChinBeardTexture(imageData: ImageData, landmarks: faceapi.FaceLandmarks68): boolean {
  const { data, width, height } = imageData;
  const pos = landmarks.positions;
  
  // 下巴区域采样（landmark 8 周围 + 脸颊两侧）
  const chinY = pos[8].y;
  const chinX = pos[8].x;
  
  // 采样窗口大小（基于两眼距离）
  const eyeDistance = Math.abs(pos[45].x - pos[36].x);
  const sampleRadius = eyeDistance * 1.2;
  
  // 采样下巴中心偏下区域
  const top = Math.max(0, Math.floor(chinY));
  const bottom = Math.min(height, Math.floor(chinY + sampleRadius * 1.5));
  const left = Math.max(0, Math.floor(chinX - sampleRadius));
  const right = Math.min(width, Math.floor(chinX + sampleRadius));
  
  let darkPixels = 0;
  let totalPixels = 0;
  
  for (let y = top; y < bottom; y += 2) {
    for (let x = left; x < right; x += 2) {
      const idx = (y * width + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      
      // 非肤色且较暗（胡须特征）
      if (!isSkinColor(r, g, b) && r < 120) {
        darkPixels++;
      }
      totalPixels++;
    }
  }
  
  const ratio = totalPixels > 0 ? darkPixels / totalPixels : 0;
  console.log(`[ChinBeard] dark=${darkPixels}/${totalPixels} (${(ratio*100).toFixed(1)}%)`);
  
  // 如果下巴区域暗像素比例超过30%，确认有胡须（避免阴影误判）
  return ratio > 0.30;
}

/**
 * 检测头发长度 - 只检测头部上方的头发，排除胡须干扰
 */
function detectHairLength(imageData: ImageData, landmarks?: faceapi.FaceLandmarks68, hasBeard?: boolean, hairShape?: HairShape, beardLength?: HairLength): { length: HairLength; confidence: number; shoulderRatio: number } {
  const { data, width, height } = imageData;
  
  // 如果有 landmarks，结合方案1和方案2：扫描整个头部区域但排除面部中心
  if (landmarks) {
    const pos = landmarks.positions;
    // 使用发际线位置（pos[19]和pos[24]的Y坐标）作为参考
    const hairlineY = Math.min(pos[19].y, pos[24].y);
    // [ROLLBACK POINT 27] 修复头顶区域扫描范围 - 添加调试日志
    console.log(`[HairLength] [DEBUG] hairlineY=${hairlineY.toFixed(1)}, pos[19].y=${pos[19].y.toFixed(1)}, pos[24].y=${pos[24].y.toFixed(1)}, imageSize=${width}x${height}`);
    // [ROLLBACK POINT 27] 修复头顶区域扫描范围
    // 原问题：使用 hairlineY - 150 导致 hairTop ≈ 0，扫描区域覆盖不到头发（头发在 y=42-94）
    // 修复：使用更合理的头顶扫描范围，从发际线上方开始扫描
    // 注意：头发应该在发际线附近或以上（y值小于hairlineY）
    const hairTop = Math.max(0, hairlineY - 80); // 从发际线上方80像素开始
    const hairBottom = Math.min(height, hairlineY + 20); // 发际线下方20像素
    
    // 面部左右边界（用于排除面部中心区域）- 需要clamp到图像边界内
    const faceLeft = Math.max(0, Math.min(pos[0].x, pos[17].x, pos[36].x) - 10);
    const faceRight = Math.min(width, Math.max(pos[16].x, pos[26].x, pos[45].x) + 10);
    
       let topHairPixels = 0;
    let topTotalPixels = 0;
    let shoulderHairPixels = 0;
    let shoulderTotalPixels = 0;
    
    // 扫描头顶区域（包含两侧）
    for (let y = Math.floor(hairTop); y < Math.floor(hairBottom); y += 2) {
      for (let x = Math.floor(width * 0.05); x < Math.floor(width * 0.95); x += 2) {
        // 排除面部中心区域（只保留面部两侧的头发）
        if (x > faceLeft && x < faceRight) continue;
        
        const idx = (y * width + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        
        // 非皮肤且不太亮（排除高光），放宽对深色头发限制
        // 移除纯黑色过滤(r<30)，因为这会过滤掉深棕/黑色头发
        if (!isSkinColor(r, g, b) && r < 220) {
          topHairPixels++;
        }
        topTotalPixels++;
      }
    }
    
    // 额外扫描面部下方的两侧区域（用于检测披肩发）
    // 扩大扫描范围到胸口位置（chinY + 400），因为披肩发可能延伸到胸口
    const chinY = pos[8].y;
    const shoulderTop = Math.min(height, chinY + 100);
    const shoulderBottom = Math.min(height, chinY + 400);  // 扩大200->400以检测披肩发
    
    // 使用传入的hasBeard参数或回退到hasChinBeardTexture
    // hasBeard来自detectBeardLocal，更可靠
    const cheekBeard = hasBeard ?? hasChinBeardTexture(imageData, landmarks);
    console.log(`[HairLength] Cheek beard (from detectBeardLocal: ${hasBeard}, from texture: ${hasChinBeardTexture(imageData, landmarks)})`);
    
    // 如果有络腮胡，定义胡须区域用于排除
    let beardRegionLeft = 0;
    let beardRegionRight = width;
    let beardRegionTop = 0;
    let beardRegionBottom = 0;
    if (cheekBeard) {
      // 胡须区域：下巴下方到下颌两侧
      // 使用pos[3-5]和pos[11-13]（下颌点）而非pos[0-2]和pos[14-16]（脸颊点）
      // 因为络腮胡主要分布在下巴和下颌区域
      // [FIXED] 2024-06-17: 修复前使用pos[0-2]和pos[14-16]（脸颊点），导致排除区域不准确
      beardRegionTop = chinY + 10;
      beardRegionBottom = Math.min(height, chinY + 150);
      beardRegionLeft = Math.min(pos[3].x, pos[4].x, pos[5].x) - 20;
      beardRegionRight = Math.max(pos[11].x, pos[12].x, pos[13].x) + 20;
    }
    
    // 太阳穴区域扫描 - 用于检测披肩发从发际线沿太阳穴下垂
    // 太阳穴位置：发际线水平，从面部左侧约15%处到30%处，以及从右侧70%处到85%处
    // 使用图像宽度的比例来定义，避免landmark坐标问题
    
    // 太阳穴扫描区域：发际线水平，在面部两侧的固定比例位置
    const templeLeftStart = Math.max(0, Math.floor(width * 0.12)); // 左侧12%开始
    const templeLeftEnd = Math.floor(width * 0.28); // 到28%处
    const templeRightStart = Math.floor(width * 0.72); // 从72%处开始
    const templeRightEnd = Math.min(width, Math.floor(width * 0.88)); // 到88%处
    const templeScanTop = Math.floor(hairlineY - 30); // 发际线上方30像素
    const templeScanBottom = Math.min(height, Math.floor(chinY + 200)); // 扫描到下巴下方200像素（覆盖披肩发区域）
    
    let templeHairPixels = 0;
    let templeTotalPixels = 0;
    let templeBelowChinPixels = 0; // 太阳穴区域下巴以下的头发像素（用于区分披肩发和短发鬓角）
    let templeBelowChinTotalPixels = 0;
    
    // 扫描左侧太阳穴区域
    if (templeLeftStart < templeLeftEnd) {
      for (let y = templeScanTop; y < templeScanBottom; y += 2) {
        for (let x = templeLeftStart; x < templeLeftEnd; x += 2) {
          if (x < 0 || x >= width || y < 0 || y >= height) continue;
          
          const idx = (y * width + x) * 4;
          const r = data[idx], g = data[idx + 1], b = data[idx + 2];
          
          // 使用组合方法检测头发（非皮肤 或 HSL头发颜色）
          if (isHairOrNotSkin(r, g, b)) {
            templeHairPixels++;
            // 统计下巴以下的太阳穴区域头发（披肩发会下垂到下巴以下，鬓角不会）
            if (y > chinY + 50) {
              templeBelowChinPixels++;
            }
          }
          templeTotalPixels++;
          if (y > chinY + 50) {
            templeBelowChinTotalPixels++;
          }
        }
      }
    }
    
    // 扫描右侧太阳穴区域
    if (templeRightStart < templeRightEnd) {
      for (let y = templeScanTop; y < templeScanBottom; y += 2) {
        for (let x = templeRightStart; x < templeRightEnd; x += 2) {
          if (x < 0 || x >= width || y < 0 || y >= height) continue;
          
          const idx = (y * width + x) * 4;
          const r = data[idx], g = data[idx + 1], b = data[idx + 2];
          
          // 使用组合方法检测头发（非皮肤 或 HSL头发颜色）
          if (isHairOrNotSkin(r, g, b)) {
            templeHairPixels++;
            // 统计下巴以下的太阳穴区域头发（披肩发会下垂到下巴以下，鬓角不会）
            if (y > chinY + 50) {
              templeBelowChinPixels++;
            }
          }
          templeTotalPixels++;
          if (y > chinY + 50) {
            templeBelowChinTotalPixels++;
          }
        }
      }
    }
    
    const templeRatio = templeTotalPixels > 0 ? templeHairPixels / templeTotalPixels : 0;
    // 下巴以下的太阳穴区域比例更能区分披肩发和短发鬓角
    const templeBelowChinRatio = templeBelowChinTotalPixels > 0 ? templeBelowChinPixels / templeBelowChinTotalPixels : 0;
    
    console.log(`[HairLength] Temple scan: left[${templeLeftStart}-${templeLeftEnd}], right[${templeRightStart}-${templeRightEnd}], imageSize=${width}x${height}, y[${templeScanTop}-${templeScanBottom}], templeRatio=${templeRatio.toFixed(3)}(${templeHairPixels}/${templeTotalPixels}), templeBelowChinRatio=${templeBelowChinRatio.toFixed(3)}(${templeBelowChinPixels}/${templeBelowChinTotalPixels})`);
    
    // 扫描肩膀区域（保留原有逻辑，但使用clamp确保边界正确）
    for (let y = Math.floor(shoulderTop); y < Math.floor(shoulderBottom); y += 3) {
      for (let x = Math.floor(width * 0.05); x < Math.floor(width * 0.95); x += 3) {
        // 排除面部中心区域（下巴以下到面宽范围内）
        if (y > chinY + 30 && x > faceLeft && x < faceRight) continue;
        
        // 如果检测到络腮胡，排除胡须区域的像素（络腮胡不是头发）
        if (cheekBeard && y > beardRegionTop && y < beardRegionBottom && 
            x > beardRegionLeft && x < beardRegionRight) {
          continue;
        }
        
        const idx = (y * width + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        
        // 使用组合方法检测头发（非皮肤 或 HSL头发颜色）
        if (isHairOrNotSkin(r, g, b)) {
          shoulderHairPixels++;
        }
        shoulderTotalPixels++;
      }
    }
    
    // 分别计算头顶、太阳穴和肩膀区域的hairRatio
    const topRatio = topTotalPixels > 0 ? topHairPixels / topTotalPixels : 0;
    const shoulderRatio = shoulderTotalPixels > 0 ? shoulderHairPixels / shoulderTotalPixels : 0;
    
    // [ROLLED BACK] 2024-06-17: 回滚方案2
    // 原因：提高templeRatio权重导致某些男性短发被误判为long
    // [ORIGINAL]
    const hairRatio = topRatio * 0.2 + templeRatio * 0.4 + shoulderRatio * 0.4;
    
    console.log(`[HairLength] Hair region: topRatio=${topRatio.toFixed(3)}(${topHairPixels}/${topTotalPixels}), templeRatio=${templeRatio.toFixed(3)}(${templeHairPixels}/${templeTotalPixels}), shoulderRatio=${shoulderRatio.toFixed(3)}(${shoulderHairPixels}/${shoulderTotalPixels}), finalRatio=${hairRatio.toFixed(3)}`);
    
    console.log(`[HairLength] Hair region: top=${hairTop.toFixed(0)}, bottom=${hairBottom.toFixed(0)}, faceLeft=${faceLeft.toFixed(0)}, faceRight=${faceRight.toFixed(0)}, topRatio=${topRatio.toFixed(3)}, templeRatio=${templeRatio.toFixed(3)}, shoulderRatio=${shoulderRatio.toFixed(3)}, finalRatio=${hairRatio.toFixed(3)}`);
    
    // 根据头发像素比例判断长度（调整阈值以更好检测长发）
    // 特殊处理：如果头顶和太阳穴都没有头发但肩膀区域有，说明可能是背景干扰
    
    // [ROLLBACK POINT 26] 束发检测优化
    // 问题：束发女性的头发被扎在脑后，正面可见的头发很少（templeRatio=0.031, shoulderRatio=0.000）
    // 导致被误判为bald光头
    // 原因：HairLength的顶部扫描（x=[25-475]）与实际头发区域（x=[0-94]）不匹配，导致topRatio=0
    // 但templeRatio=0.031说明有鬓角头发存在
    // 解决方案：如果hairRatio < 0.05但templeRatio > 0.02，说明有鬓角头发但头顶扫描失败，应该判断为medium而不是bald
    const hasTempleHair = templeRatio > 0.02 && templeRatio < 0.15; // 鬓角有少量头发
    const isLowHairRatio = hairRatio < 0.05; // 头顶扫描比例很低（当前检测为bald）
    
    // [FIXED] 2024-07-01: 添加 topRatio > 0 检查，避免将头顶无头发的光头误判为束发
    if (hasTempleHair && isLowHairRatio && !hasBeard && topRatio > 0) {
      console.log(`[HairLength] [ROLLBACK POINT 26] Bun hairstyle detected: templeRatio=${templeRatio.toFixed(3)}, hairRatio=${hairRatio.toFixed(3)}`);
      // 束发是有一定长度的头发，应该是medium
      return { length: 'medium', confidence: 0.5, shoulderRatio };
    }
    
    // [ROLLBACK POINT 1] 蓬松卷发检测优化
    // 当HairShape=curly时，降低templeBelowChinRatio阈值，因为蓬松卷发不会从太阳穴垂直下垂
    // 蓬松卷发特征：templeRatio较高(>0.35)但templeBelowChinRatio很低(<0.02)
    const isCurlyHair = hairShape === 'curly';
    const belowChinThreshold = isCurlyHair ? 0.02 : 0.1; // 卷发降低阈值
    
    // 优先检查templeRatio：因为长发女性即使hairRatio低，templeRatio也可能很高
    if (!hasBeard && templeRatio >= 0.55 && templeBelowChinRatio > belowChinThreshold) {
      return { length: 'long', confidence: 0.7, shoulderRatio };
    }

    // [ROLLBACK POINT 2] 蓬松卷发检测优化 - 第二阶段 (已回滚)
    // 回滚原因：白人长发样本templeBelowChinRatio=0.516过高，不应触发medium判断
    // 卷发样本：templeRatio=0.363, templeBelowChinRatio=0.013, hairRatio=0.145
    // if (isCurlyHair && hairRatio > 0.10 && hairRatio < 0.25 && templeRatio > 0.35 && templeBelowChinRatio < 0.15 && shoulderRatio > 0.03) {
    //   console.log(`[HairLength] Curly hair medium detection: hairRatio=${hairRatio.toFixed(3)}, templeRatio=${templeRatio.toFixed(3)}, templeBelowChinRatio=${templeBelowChinRatio.toFixed(3)}, shoulderRatio=${shoulderRatio.toFixed(3)}`);
    //   return { length: 'medium', confidence: 0.6, shoulderRatio };
    // }
    
    // [ROLLBACK POINT 35] 修复卷发检测被跳过的问题
    // 问题：line 1210 的 hairRatio < 0.15 检查先于 line 1203 的卷发检测执行
    // 导致 hairRatio=0.145 的卷发被误判为 very_short
    // 解决：将卷发检测移到 hairRatio < 0.15 检查之前
    
    // 蓬松卷发头发长度优化
    // 蓬松卷发特征：templeRatio较高(>0.35)但shoulderRatio很低，头发向两侧蓬松不下垂
    // 白人女性长发：templeRatio=0.431, shoulderRatio=0.045, hairRatio=0.191
    // 黑人女性卷发：templeRatio=0.363, shoulderRatio=0.000, hairRatio=0.145
    // 策略：当templeRatio>0.35但shoulderRatio<0.05时，说明头发蓬松但不下垂，应该是medium
    if (isCurlyHair && templeRatio > 0.35 && shoulderRatio < 0.05 && !hasBeard) {
      console.log(`[HairLength] Curly hair medium detection [ROLLBACK POINT 35]: templeRatio=${templeRatio.toFixed(3)}, shoulderRatio=${shoulderRatio.toFixed(3)}, hairRatio=${hairRatio.toFixed(3)}`);
      return { length: 'medium', confidence: 0.6, shoulderRatio };
    }
    
    // 先判断基本长度（bald和very_short）
    if (hairRatio < 0.05) return { length: 'bald', confidence: 0.7, shoulderRatio };
    if (hairRatio < 0.15) return { length: 'very_short', confidence: 0.65, shoulderRatio };
    
    // [ROLLBACK POINT 50] 修复背景误检问题
    // 问题：shoulderRatio 异常高（如0.834）但实际是黑色衣服被误检为头发
    // 原因：头发从头顶下垂到肩膀时，太阳穴两侧也应该有头发（templeRatio不会太低）
    //       如果 templeRatio很低但 shoulderRatio 很高，说明是背景误检而非真正长发
    // 条件：无胡子 + templeRatio < 0.25（太阳穴几乎没有头发）+ shoulderRatio > 0.6 + hairRatio < 0.35（整体头发较少）
    // 第六张照片：templeRatio=0.198, shoulderRatio=0.834, hairRatio < 0.35 → 应该判断为 short
    // 第七张照片：templeRatio=0.117, shoulderRatio=0.968, hairRatio=0.440 > 0.35 → 不会被误判
    if (!hasBeard && templeRatio < 0.25 && shoulderRatio > 0.6 && hairRatio < 0.35) {
      console.log(`[HairLength] [ROLLBACK POINT 50] Background false positive detected: templeRatio=${templeRatio.toFixed(3)}, shoulderRatio=${shoulderRatio.toFixed(3)}, hairRatio=${hairRatio.toFixed(3)}, treating as short hair`);
      return { length: 'short', confidence: 0.7, shoulderRatio };
    }
    
    // [ROLLBACK POINT 14] 披肩发检测优化 - 提前检查
    // 问题：hairRatio < 0.30 在 line 1171 返回 short，导致后续 templeRatio 检查无法执行
    // 解决：在返回 short 之前，先检查是否是披肩发（templeRatio >= 0.35 && templeBelowChinRatio >= 0.5）
    // [Rollback Point 46 - ISSUE-4] 修复：先检查 hairRatio < 0.30，避免短发被 templeRatio 误判为长发
    if (hairRatio < 0.30) {
      return { length: 'short', confidence: 0.75, shoulderRatio };
    }
    // [Rollback Point 47 - ISSUE-4] 修复：增加 hairRatio >= 0.60 要求
    // 原因：templeRatio 和 templeBelowChinRatio 高不一定代表长发，可能只是背景干扰
    //       只有当 hairRatio >= 0.60 时，才认为有足够的头发面积支持"披肩发"判断
    // 问题照片：hairRatio=0.562，templeRatio=0.404，templeBelowChinRatio=0.707
    //           但 shoulderRatio=1.000 表示背景被误检为头发，应该是短发
    if (!hasBeard && hairRatio >= 0.60 && templeRatio >= 0.35 && templeBelowChinRatio >= 0.5) {  // [ROLLBACK POINT 47 - ISSUE-4]
      console.log(`[HairLength] Rollback Point 14 - Shoulder-length hair detected: templeRatio=${templeRatio.toFixed(3)}, templeBelowChinRatio=${templeBelowChinRatio.toFixed(3)}`);
      return { length: 'long', confidence: 0.65, shoulderRatio };
    }
    
    // [ROLLBACK POINT 10] 修复短胡子时头发长度误判问题
      // 问题：当 beardLength='short' 时，hairRatio=0.373 被误判为 medium
      // 原因：hairRatio 加权公式受 templeRatio 和 shoulderRatio 影响较大
      //       对于短头发+短胡子的人，这些区域的测量值可能偏高（胡须干扰）
      // 解决方案：当 beardLength='short' 时，使用更严格的阈值
      //       - topRatio 作为主要判断依据（头顶区域最能反映真实头发长度）
      //       - 降低 short 的上限阈值
    
    // 当有短胡子时，头发更可能是短的，使用 topRatio 作为主要判断依据
    const isShortBeard = hasBeard && (beardLength === 'short' || beardLength === 'very_short');
    if (isShortBeard) {
      // 对于短胡子，主要依赖 topRatio 判断
      // topRatio 高表示头发集中在头顶（短），topRatio 低表示头发下垂（长）
      if (topRatio < 0.30) {
        return { length: 'medium', confidence: 0.65, shoulderRatio }; // 头顶头发少，可能是长发下垂
      }
      // topRatio 足够高，头发在头顶，是短发
      if (hairRatio < 0.40) {
        return { length: 'short', confidence: 0.7, shoulderRatio };
      }
      if (hairRatio < 0.60) {
        return { length: 'medium', confidence: 0.65, shoulderRatio };
      }
      return { length: 'long', confidence: 0.6, shoulderRatio };
    }
    
    if (hairRatio < 0.30) return { length: 'short', confidence: 0.7, shoulderRatio };
    
    // [ROLLBACK POINT 14] 修复披肩发检测问题
      // 问题：白人女性披肩发 templeRatio=0.431 < 0.45，被误判为 medium
      // 原因：披肩发的头发主要垂在肩上而不是太阳穴两侧，导致 templeRatio 不够高
      // 解决方案：调整 templeBelowChinRatio 阈值，使披肩发更容易被判定为 long
    
    // [ROLLBACK POINT 9] 修复头发长度误判问题
      // 问题：当胡子是 short 时，templeBelowChinRatio >= 0.10 会误判为 long
      // 原因：下巴以下的太阳穴区域检测到的是胡子（尤其是络腮胡），而非长发
      // 解决方案：当 beardLength 为 short 或 very_short 时，提高 templeBelowChinRatio 阈值或忽略该判断
    
    // medium和long的区分：当hairRatio在0.30-0.75范围时，根据templeRatio调整
    if (hairRatio < 0.75) {
      // 有胡子时，低阈值即可升级（因为有胡子时长发更可能是披肩发）
      // 但如果胡子是短的，应该提高阈值或忽略 templeBelowChinRatio 判断
      // beardLength 参数通过函数签名传入（见下方函数定义）
      const effectiveTempleThreshold = (hasBeard && beardLength === 'short') ? 0.35 : 0.10;
      if (hasBeard && templeBelowChinRatio >= effectiveTempleThreshold) {
        return { length: 'long', confidence: 0.7, shoulderRatio };
      }
      // 无胡子时，使用templeRatio作为主要指标（长发女性templeRatio更高）
      if (!hasBeard) {
        if (templeRatio >= 0.55 && templeBelowChinRatio > 0) {
          // templeRatio >= 55% 表示太阳穴区域大部分被头发覆盖，这是长发女性的特征
          return { length: 'long', confidence: 0.7, shoulderRatio };
        }
        // [ROLLBACK POINT 14] 披肩发检测：头发垂在肩上挡住耳朵，templeRatio可能不够高
        // 但 templeBelowChinRatio >= 0.5 表示有足够的下垂头发，这是披肩发的特征
        // 降低 templeRatio 阈值从 0.45 到 0.35
        if (hairRatio >= 0.60 && templeRatio >= 0.35 && templeBelowChinRatio >= 0.5) {
          // templeRatio中等且有足够下垂头发
          return { length: 'long', confidence: 0.65, shoulderRatio };
        }
        return { length: 'medium', confidence: 0.65, shoulderRatio };
      }
      return { length: 'medium', confidence: 0.65, shoulderRatio };
    }
    
    return { length: 'long', confidence: 0.6, shoulderRatio };
  }
  
  // Fallback: 使用旧方法但排除面部下方区域
  let hairPixels = 0;
  const totalPixels = Math.floor(width * height * 0.15); // 只采样上半部分
  
  for (let i = 0; i < totalPixels; i++) {
    const x = i % width;
    const y = Math.floor(i / width);
    const idx = (y * width + x) * 4;
    
    // 排除面部下方区域（避免胡须干扰）
    if (y > height * 0.7) continue;
    
    if (!isSkinColor(data[idx], data[idx + 1], data[idx + 2])) {
      hairPixels++;
    }
  }
  
  const hairRatio = hairPixels / totalPixels;
  
  if (hairRatio < 0.03) return { length: 'bald', confidence: 0.7, shoulderRatio: 0 };
  if (hairRatio < 0.1) return { length: 'very_short', confidence: 0.6, shoulderRatio: 0 };
  if (hairRatio < 0.2) return { length: 'short', confidence: 0.65, shoulderRatio: 0 };
  if (hairRatio < 0.4) return { length: 'medium', confidence: 0.7, shoulderRatio: 0 };
  if (hairRatio < 0.65) return { length: 'long', confidence: 0.65, shoulderRatio: 0 };
  return { length: 'very_long', confidence: 0.6, shoulderRatio: 0 };
}

/**
 * 加载图像
 */
function loadImage(imageBase64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (event) => {
      const error = new Error('Failed to load image') as Error & { originalEvent?: unknown };
      error.originalEvent = event;
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
 * @param imageBase64 - Base64编码的图像
 * @param options - 可选参数
 * @param options.skipColorDetection - 是否跳过颜色检测
 */
export async function analyzeFace(
  imageBase64: string,
  options?: {
    skipColorDetection?: boolean;
  }
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
      glassesFrameColor: 'none',
      hasBeard: false,
      beardLength: 'none',
      beardShape: 'unknown',
      beardColor: 'unknown',
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
      inputSize: 416,  // 与 useFaceCrop 保持一致
      scoreThreshold: 0.4,  // 折中值，平衡检测灵敏度和准确性
    });
    const detections = await faceapi.detectAllFaces(img, faceDetectorOptions);
    console.log('[FaceAnalysis] Detections:', detections.length);

    // 如果本地检测失败，返回错误
    if (detections.length === 0) {
      console.warn('[FaceAnalysis] No faces detected locally');
      return {
        ...defaultResult,
        faceDetected: false,
        faceCount: 0
      };
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

    // ========== 头发和胡须检测（用于增强版性别检测）==========
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let hairLengthResult = { length: 'unknown' as HairLength, confidence: 0, shoulderRatio: 0 };
    let hairShapeResult = { shape: 'unknown' as HairShape, confidence: 0 };
    let bangsResult = { hasBangs: false, style: 'none' as 'none' | 'side' | 'center' | 'unknown' };
    let beardResult = { hasBeard: false, beardLength: 'none' as 'none' | 'short' | 'medium' | 'long', beardShape: 'unknown' as 'thin' | 'thick' | 'trimmed' | 'full' | 'goatee' | 'unknown', beardColor: 'unknown' as 'black' | 'brown' | 'dark_brown' | 'gray' | 'white' | 'red' | 'blonde' | 'unknown' };
    
    if (ctx) {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // 快速肤色估算（使用额头区域，避免下巴被胡须污染）
      // 使用发际线特征点 pos[19]和pos[24]定位额头
      const foreheadCenterX = (pos[19].x + pos[24].x) / 2;
      const foreheadCenterY = (pos[19].y + pos[24].y) / 2;  // 发际线中点
      let foreheadBrightnessSum = 0;
      let foreheadTotalPixels = 0;
      // 从发际线向下采样（避开头发），范围约30像素
      for (let y = Math.floor(foreheadCenterY + 5); y < Math.floor(foreheadCenterY + 35); y += 2) {
        for (let x = Math.floor(foreheadCenterX - 30); x < Math.floor(foreheadCenterX + 30); x += 2) {
          if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
            const idx = (y * canvas.width + x) * 4;
            foreheadBrightnessSum += (imageData.data[idx] + imageData.data[idx + 1] + imageData.data[idx + 2]) / 3;
            foreheadTotalPixels++;
          }
        }
      }
      const avgForeheadBrightness = foreheadTotalPixels > 0 ? foreheadBrightnessSum / foreheadTotalPixels : 150;
      // 根据额头亮度估算肤色（避免胡须干扰）
      const quickSkinTone: 'light' | 'medium' | 'dark' | 'medium_light' | 'medium_dark' | 'unknown' = 
        avgForeheadBrightness > 150 ? 'light' : 
        avgForeheadBrightness > 120 ? 'medium_light' : 
        avgForeheadBrightness > 90 ? 'medium_dark' : 'dark';
      console.log('[FaceAnalysis] Quick skin tone estimate:', quickSkinTone, '(forehead brightness:', avgForeheadBrightness.toFixed(1), ')');
      
      // 先获取胡须检测结果（包含 beardLength）
      beardResult = detectBeardLocal(imageData, landmarks, pos, quickSkinTone);
      // [ROLLBACK POINT 9] 检测头发长度，传入hasBeard和beardLength以避免短胡子导致的长发误判
      // beardLength 可能是 "none"，需要排除以匹配 HairLength 类型
      const beardLengthForHair: HairLength | undefined = beardResult.beardLength === 'none' ? undefined : beardResult.beardLength as HairLength;
      // [Rollback Point 35] 修复：先检测 hairShape，再传给 detectHairLength
      hairShapeResult = detectHairShape(imageData);
      hairLengthResult = detectHairLength(imageData, landmarks, beardResult.hasBeard, hairShapeResult.shape, beardLengthForHair);
      bangsResult = detectBangs(imageData);
    }
    console.log('[FaceAnalysis] Hair length:', hairLengthResult.length, 'Beard:', beardResult.hasBeard);

    // 检测面部特征（需要提前检测，用于增强版性别检测）
    const faceShape = detectFaceShape(landmarks);
    const noseShape = detectNoseShape(landmarks);
    const eyeShape = detectEyeShape(landmarks);
    const lipShape = detectLipShape(landmarks);
    const jawline = detectJawline(landmarks);
    
    // 使用已检测的头发/胡须结果复用canvas
    let imageDataForGlasses: ImageData | undefined;
    if (ctx) {
      imageDataForGlasses = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
    const glassesResult = detectGlasses(landmarks, imageDataForGlasses);
    console.log('[FaceAnalysis] Local glasses detected:', glassesResult);
    
    // ========== 增强版性别检测 - 使用分层加权策略 ==========
    // 注意：jawline 和 lipShape 必须在调用前已定义
    const genderEnhancedResult = detectGenderEnhanced(
      landmarks,
      beardResult.hasBeard,
      hairLengthResult.length,
      hairLengthResult.shoulderRatio,
      jawline !== 'unknown' ? jawline : 'medium',
      lipShape !== 'unknown' ? lipShape : 'medium',
      undefined, // hasEarrings
      undefined, // hasNecklace
      beardResult.beardLength === 'none' ? undefined : beardResult.beardLength as 'short' | 'medium' | 'long'
    );
    console.log('[FaceAnalysis] Enhanced gender result:', genderEnhancedResult);
    
    let finalGender: 'male' | 'female' | null = genderEnhancedResult.gender;
    let finalGenderConfidence = genderEnhancedResult.confidence;

    // 如果增强版无法确定，使用简化版作为fallback
    if (!finalGender) {
      const genderResult = detectGender(landmarks);
      console.log('[FaceAnalysis] Fallback gender result:', genderResult);
      finalGender = genderResult.gender;
      finalGenderConfidence = Math.min(genderResult.confidence, 0.7);
    }
    
    // 检测颜色属性 - 传入 landmarks 用于动态区域定位
    // 如果检测到墨镜，上移额部采样位置避免镜片影响
    const colorAttributes = options?.skipColorDetection
      ? defaultResult.colorAttributes
      : await detectColorAttributes(imageBase64, landmarks, undefined, undefined, glassesResult.hasGlasses);
    
    // [ROLLBACK POINT 7] 诊断日志 - 用于排查 HMR 导致日志丢失问题
    // 回滚：删除 "[DIAGNOSTIC] After detectColorAttributes" 日志行
    console.log('[FaceAnalysis] [DIAGNOSTIC] After detectColorAttributes, colorAttributes:', JSON.stringify(colorAttributes, null, 2));
    
    // 检测人种
    const faceWidth = Math.abs(pos[16].x - pos[0].x);
    const faceHeight = Math.abs(pos[8].y - pos[19].y);
    const noseWidth = Math.abs(pos[35].x - pos[31].x);
    const eyeDistance = Math.abs(pos[45].x - pos[36].x);
    
    const ethnicity = detectEthnicity(faceWidth, faceHeight, noseWidth, eyeDistance, colorAttributes.skinTone);
    console.log('[FaceAnalysis] Ethnicity:', ethnicity);
    
    // 如果是非洲人种，默认没有刘海（非洲人的短发茬发型通常不是传统意义上的刘海）
    if (ethnicity.ethnicity === 'black') {
      bangsResult = { hasBangs: false, style: 'none' as 'none' | 'side' | 'center' | 'unknown' };
    }
    
    // 构建配饰对象 - 使用本地检测结果
    const accessories: {
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
    } = {
      hasGlasses: glassesResult.hasGlasses,
      glassesType: glassesResult.glassesType,
      glassesFrameColor: glassesResult.hasGlasses ? detectGlassesFrameColor(imageDataForGlasses, pos) : 'none' as const,
      hasBeard: beardResult.hasBeard,
      beardLength: beardResult.beardLength,
      beardShape: beardResult.beardShape,
      beardColor: beardResult.beardColor,
      hasHat: false,
      hatColor: null,
      hasMask: false,
      hasOpenEyes: true
    };
    console.log('[FaceAnalysis] Accessories:', accessories);
    
    // ===== 输出完整的人脸检测结果（结构化中文）=====
    console.log('\n🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥');
    console.log('👤 人脸检测结果 👤              ');
    console.log('🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥');
    console.log('\n【基本信息】');
    console.log(`  👔 性别: ${finalGender || 'unknown'} (置信度: ${finalGenderConfidence.toFixed(2)})`);
    console.log(`  🌍 人种: ${ethnicity.ethnicity} (置信度: ${ethnicity.confidence.toFixed(2)})`);
    console.log('\n【肤色属性】');
    console.log(` 🎨 肤色: ${colorAttributes.skinTone} ${colorAttributes.skinColor}`);
    console.log(`  💇 头发: ${colorAttributes.hairColor} ${colorAttributes.hairColorHex}`);
    console.log(`  👁️ 眼睛: ${colorAttributes.eyeColor} ${colorAttributes.eyeColorHex}`);
    console.log('\n【头发特征】');
    console.log(` 🔧 发型: ${hairShapeResult.shape} | 长度: ${hairLengthResult.length} | 刘海: ${bangsResult.hasBangs ? bangsResult.style : '无'}`);
    console.log('\n【面部特征】');
    console.log(`  ⬜脸型: ${faceShape} | 鼻型: ${noseShape} | 眼型: ${eyeShape}`);
    console.log(`👄 唇型: ${lipShape} | 下颌: ${jawline}`);
    console.log('\n【配饰】');
    console.log(`  🕶️ 眼镜: ${glassesResult.hasGlasses ? glassesResult.glassesType + ' (' + (accessories.glassesFrameColor || '') + ')' : '无'}`);
    console.log(`🧔 胡须: ${beardResult.hasBeard ? beardResult.beardLength + ' (' + beardResult.beardColor + ')' : '无'}`);
    console.log('\n🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩\n');

    return {
      faceDetected: true,
      faceCount,
      gender: finalGender,
      genderConfidence: finalGenderConfidence,
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
  //黑人秃头需要明确指定，因为AI可能会生成中等长度头发
  if (result.hairLength === 'bald' && result.ethnicity === 'black') {
    parts.unshift(`CRITICAL CONSTRAINT: Shaved BALD head - ZERO hair - absolutely smooth scalp - NO hair strands should appear - must match original photo's bald appearance.`);
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
      const glassesDesc = acc.glassesType === 'normal' ? 'classic' : acc.glassesType;
      if (acc.glassesFrameColor && acc.glassesFrameColor !== 'unknown') {
        const frameColorMap: Record<string, string> = {
          'silver': 'silver/light gray',
          'gold': 'golden',
          'black': 'dark/black',
          'brown': 'brown/tortoise shell',
          'blue': 'blue',
          'red': 'red',
          'white': 'white',
        };
        const frameDesc = frameColorMap[acc.glassesFrameColor] || acc.glassesFrameColor;
        parts.push(`CRITICAL CONSTRAINT: The person is wearing ${glassesDesc} glasses with ${frameDesc} frames. You MUST preserve the glasses and frame color in the final image. DO NOT remove, omit, or stylize away the glasses. Glasses shape and frame color must match the original photo.`);
      } else {
        parts.push(`CRITICAL CONSTRAINT: The person is wearing ${acc.glassesType} glasses. You MUST preserve the glasses in the final image. DO NOT remove, omit, or stylize away the glasses. Glasses shape must match the original photo.`);
      }
    }
    if (acc.hasBeard) {
      const beardColorMap: Record<string, string> = {
        'black': 'black',
        'brown': 'natural brown',
        'dark_brown': 'dark brown',
        'gray': 'light ash gray',
        'white': 'white',
        'red': 'reddish',
        'blonde': 'blonde/light brown',
      };
      const beardColorDesc = beardColorMap[acc.beardColor] || 'natural';
      //黑人短胡子需要更明确描述，避免AI生成中等长度胡子
      const beardLengthDesc = (result.ethnicity === 'black' && acc.beardLength === 'short') 
        ? 'CRITICAL: Minimal stubble (only a few millimeters, very short facial hair)' 
        : `${acc.beardLength} beard`;
      
      // 如果用户强制指定女性，移除胡须；否则保留胡须
      if (genderForce === 'female') {
        parts.push(`CRITICAL CONSTRAINT: The person currently has a ${beardLengthDesc} (${beardColorDesc} color), but since the target style is female, you MUST completely remove/eliminate the beard. The face should be smooth and feminine without any facial hair.`);
      } else {
        parts.push(`CRITICAL CONSTRAINT: The person has a ${beardLengthDesc} (${beardColorDesc} color). You MUST preserve the beard and its color in the final image. DO NOT remove, omit, or stylize away the beard. Beard length must match the original photo.`);
      }
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