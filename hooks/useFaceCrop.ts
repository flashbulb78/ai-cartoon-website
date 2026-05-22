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

      isModelLoadedRef.current = true;
      console.log('[FaceCrop] Model loaded successfully');
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
        inputSize: 320,
        scoreThreshold: 0.5,
      });
      
      console.log('[FaceCrop] Detecting faces...');
      const detections = await faceapi.detectAllFaces(img, faceDetectorOptions);
      console.log('[FaceCrop] Detections:', detections.length);

      // 检查是否检测到人脸
      if (detections.length === 0) {
        return { success: false, error: 'No face detected. Please upload a clear front-facing photo.' };
      }

      // 检查是否有多个人脸
      if (detections.length > 1) {
        return { success: false, error: 'Multiple faces detected. Please upload a single person photo.' };
      }

      // 获取人脸边界框
      const detection = detections[0];
      const box = detection.box;
      console.log('[FaceCrop] Face detected, box:', box);

      // 计算扩大后的人脸区域（保持正方形）
      const expandedBox = expandBoxToSquare(box, img.width, img.height, MARGIN);
      
      // 创建裁剪画布
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
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
      return { success: true, croppedImage: croppedImageBase64 };
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
  let newWidth = maxDim;
  let newHeight = maxDim;
  let newX = centerX - newWidth / 2;
  let newY = centerY - newHeight / 2;
  
  // 确保不超过图片边界
  if (newX < 0) newX = 0;
  if (newY < 0) newY = 0;
  if (newX + newWidth > imageWidth) newX = imageWidth - newWidth;
  if (newY + newHeight > imageHeight) newY = imageHeight - newHeight;
  
  return { x: newX, y: newY, width: newWidth, height: newHeight };
}