/**
 * hooks/useFaceCrop.ts
 * 人脸裁剪Hook - 极简版
 * 使用face-api.js检测人脸并自动裁剪出512x512正方形人脸图
 * 
 * 修复说明：
 * - 只加载 tiny_face_detector 模型（最轻量、最稳定）
 * - 简化逻辑：只保留人脸检测 + 裁剪，移除 face_landmark_68 避免报错
 * - 只检测单张人脸，多人或无人脸都报错
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import * as faceapi from 'face-api.js';

interface FaceCropResult {
  success: boolean;
  croppedImage?: string;
  error?: string;
  // gender 已废弃 - 性别检测现在通过 analyzeFace 中的本地 face-api.js 模型完成
  gender?: 'male' | 'female' | null;
}

interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface UseFaceCropReturn {
  isLoading: boolean;
  error: string | null;
  isModelLoaded: boolean;
  cropFace: (imageBase64: string) => Promise<FaceCropResult>;
  clearError: () => void;
}

const MODEL_URL = '/models';
const OUTPUT_SIZE = 512;
const MARGIN = 0.2; // 扩大20%边缘以确保完整人脸

export function useFaceCrop(): UseFaceCropReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isModelLoadedRef = useRef(false);
  const loadAttemptedRef = useRef(false);

  /**
   * 加载face-api.js模型
   * 只加载 tiny_face_detector（最轻量、最稳定）
   */
  const loadModels = useCallback(async (): Promise<boolean> => {
    if (isModelLoadedRef.current) {
      return true;
    }

    if (loadAttemptedRef.current) {
      return false;
    }
    loadAttemptedRef.current = true;

    setIsLoading(true);
    setError(null);

    try {
      console.log('[FaceCrop] Loading tiny_face_detector model...');
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      console.log('[FaceCrop] tiny_face_detector loaded successfully');

      // 加载face_landmark_68_model用于性别检测
      console.log('[FaceCrop] Loading face_landmark_68_model...');
      await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
      console.log('[FaceCrop] face_landmark_68_model loaded successfully');

      isModelLoadedRef.current = true;
      console.log('[FaceCrop] All models loaded successfully');
      return true;
    } catch (err) {
      console.error('[FaceCrop] Failed to load model:', err);
      setError('Failed to load face detection model. Please refresh and try again.');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * 预加载模型
   */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadModels();
  }, [loadModels]);

  /**
   * 裁剪人脸 - 极简版
   * 只保留基本的人脸检测和裁剪功能
   */
  const cropFace = useCallback(async (imageBase64: string): Promise<FaceCropResult> => {
    setIsLoading(true);
    setError(null);

    try {
      // 确保模型已加载
      if (!isModelLoadedRef.current) {
        console.log('[FaceCrop] Model not loaded, attempting to load...');
        const loaded = await loadModels();
        if (!loaded) {
          return { success: false, error: 'Face detection model not loaded. Please refresh the page.' };
        }
      }

      // 加载图片
      const img = await loadImageFromBase64(imageBase64);
      
      // 使用 TinyFaceDetector 检测人脸
      const faceDetectorOptions = new faceapi.TinyFaceDetectorOptions({
        inputSize: 416,  // 增大输入尺寸以提高小人脸检测
        scoreThreshold: 0.35, // 降低阈值提高检测灵敏度
      });
      
      console.log('[FaceCrop] Detecting faces...');
      const detections = await faceapi.detectAllFaces(img, faceDetectorOptions);
      console.log('[FaceCrop] Detections:', detections.length);

      // 检查是否检测到人脸
      if (detections.length === 0) {
        return { success: false, error: 'No face detected. Please upload a clear front-facing photo.' };
      }

      // 如果检测到多个人脸，选择最大的人脸
      let selectedDetection = detections[0];
      if (detections.length > 1) {
        console.log('[FaceCrop] Multiple faces detected, selecting the largest one');
        // 计算每个人脸的面积，选择最大的
        let largestArea = detections[0].box.width * detections[0].box.height;
        selectedDetection = detections[0];
        
        for (let i = 1; i < detections.length; i++) {
          const area = detections[i].box.width * detections[i].box.height;
          if (area > largestArea) {
            largestArea = area;
            selectedDetection = detections[i];
          }
        }
        
        console.log('[FaceCrop] Selected face with area:', largestArea.toFixed(0));
      }

      // 获取人脸边界框
      const detection = selectedDetection;
      const box = detection.box;
      console.log('[FaceCrop] Face detected, box:', box);

      // 计算扩大后的人脸区域（保持正方形）
      const expandedBox = expandBoxToSquare(box, img.width, img.height, MARGIN);
      
      // 创建裁剪画布
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        return { success: false, error: 'Failed to create canvas context' };
      }

      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      
      // 启用高质量图像插值
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      // 绘制裁剪后的人脸
      ctx.drawImage(
        img,
        expandedBox.x,
        expandedBox.y,
        expandedBox.width,
        expandedBox.height,
        0,
        0,
        OUTPUT_SIZE,
        OUTPUT_SIZE
      );

      // 转换为base64 (JPEG格式，95%质量)
      const croppedImageBase64 = canvas.toDataURL('image/jpeg', 0.95);
      
      console.log('[FaceCrop] Face cropped successfully');
      // 性别检测在 analyzeFace 中通过本地 face-api.js 模型完成
      return { success: true, croppedImage: croppedImageBase64, gender: null };
    } catch (err) {
      console.error('[FaceCrop] Detection error:', err);
      return { 
        success: false, 
        error: err instanceof Error ? err.message : 'Face detection failed. Please try another image.' 
      };
    } finally {
      setIsLoading(false);
    }
  }, [loadModels]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isLoading,
    error,
    // eslint-disable-next-line react-hooks/set-state-in-effect
    isModelLoaded: isModelLoadedRef.current,
    cropFace,
    clearError,
  };
}

/**
 * 从base64加载图片
 */
function loadImageFromBase64(base64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = base64;
  });
}

/**
 * 扩大人脸边界框并保持正方形
 */
function expandBoxToSquare(box: FaceBox, imageWidth: number, imageHeight: number, margin: number): FaceBox {
  // 计算原始边界框的中心点
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  
  // 计算扩大后的边长（取宽高较大值，并加上边缘margin）
  const maxDim = Math.max(box.width, box.height) * (1 + margin);
  
  // 计算正方形边界（确保不超过图片边界）
  const newWidth = maxDim;
  const newHeight = maxDim;
  let newX = centerX - newWidth / 2;
  let newY = centerY - newHeight / 2;
  
  // 确保不超过图片边界
  if (newX < 0) newX = 0;
  if (newY < 0) newY = 0;
  if (newX + newWidth > imageWidth) newX = imageWidth - newWidth;
  if (newY + newHeight > imageHeight) newY = imageHeight - newHeight;
  
  return { x: newX, y: newY, width: newWidth, height: newHeight };
}

/**
 * 根据人脸68个特征点判断性别
 *
 * 关键特征分析：
 * - 眉毛宽度和高度（男性通常更粗更低）
 * - 下颌宽度（男性通常更宽）
 * - 鼻子大小（男性通常更大）
 * - 眼睛间距（女性通常更宽）
 */
function detectGenderFromLandmarks(landmarks: faceapi.FaceLandmarks68): 'male' | 'female' {
  const positions = landmarks.positions;
  
  // 计算面部特征比例
  // 眉毛位置（索引0-16是轮廓点）
  
  // 计算左眉中心 (索引17-21)
  const leftEyebrow = positions.slice(17, 22);
  const leftEyebrowCenter = averageY(leftEyebrow);
  
  // 计算右眉中心 (索引22-26)
  const rightEyebrow = positions.slice(22, 27);
  const rightEyebrowCenter = averageY(rightEyebrow);
  
  // 计算眼睛中心 (索引36-41左眼, 42-47右眼)
  const leftEye = positions.slice(36, 42);
  const rightEye = positions.slice(42, 48);
  const leftEyeCenter = averageY(leftEye);
  const rightEyeCenter = averageY(rightEye);
  
  // 计算眉毛和眼睛的距离比例
  const eyebrowEyeDistance = ((leftEyebrowCenter + rightEyebrowCenter) / 2) - ((leftEyeCenter + rightEyeCenter) / 2);
  
  // 计算鼻尖位置（索引30）
  const noseTip = positions[30];
  
  // 计算下巴底部位置（索引8）
  const chinBottom = positions[8];
  
  // 计算眼睛间距
  const leftEyeOuter = positions[36];
  const rightEyeOuter = positions[45];
  const eyeDistance = Math.abs(rightEyeOuter.x - leftEyeOuter.x);
  
  // 计算面部宽度（颧骨位置，索引0和16）
  const faceWidth = Math.abs(positions[16].x - positions[0].x);
  
  // 计算下颌宽度（索引4-6和10-12之间）
  const jawLeft = positions[4];
  const jawRight = positions[12];
  const jawWidth = Math.abs(jawRight.x - jawLeft.x);
  
  // 下颌宽度与面部宽度比例（男性下颌通常更宽）
  const jawRatio = jawWidth / faceWidth;
  
  // 眉眼距与眼距比例（女性通常眉眼距更大）
  const eyebrowEyeRatio = eyebrowEyeDistance / eyeDistance;
  
  console.log('[GenderDetection] jawRatio:', jawRatio, 'eyebrowEyeRatio:', eyebrowEyeRatio);
  
  // 使用多个特征判断性别
  // 男性特征：下颌宽、眉眼距小
  // 女性特征：下颌窄、眉眼距大
  
  if (jawRatio > 0.55 && eyebrowEyeRatio < 0.8) {
    return 'male';
  } else if (jawRatio < 0.5 && eyebrowEyeRatio > 0.9) {
    return 'female';
  }
  
  // 综合判断
  const maleScore = (jawRatio > 0.52 ? 1 : 0) + (eyebrowEyeRatio < 0.85 ? 1 : 0);
  
  return maleScore >= 1 ? 'male' : 'female';
}

/**
 * 计算平均Y坐标
 */
function averageY(points: { x: number; y: number }[]): number {
  const sum = points.reduce((acc, p) => acc + p.y, 0);
  return sum / points.length;
}