/**
 * hooks/useImageUpload.ts
 * 图片上传状态管理Hook
 * 提供图片选择、验证、预览和删除功能
 */

import { useState, useCallback } from 'react';
import { ImageUploadState } from '@/lib/types';
import { validateImageFile, fileToBase64 } from '@/lib/utils';

interface UseImageUploadReturn {
  /** 上传状态 */
  state: ImageUploadState;
  /** 处理文件选择 */
  handleFileSelect: (file: File) => Promise<string | null>;
  /** 处理拖拽上传 */
  handleDrop: (event: React.DragEvent) => Promise<string | null>;
  /** 清除已上传的图片 */
  handleClear: () => void;
  /** 是否正在处理上传 */
  isUploading: boolean;
}

/**
 * 图片上传Hook
 * 管理图片选择、验证、预览和删除的状态
 */
export function useImageUpload(): UseImageUploadReturn {
  const [state, setState] = useState<ImageUploadState>({
    file: null,
    preview: null,
    isValid: false,
    error: null,
  });
  const [isUploading, setIsUploading] = useState(false);

  /**
   * 处理文件选择
   * 验证文件格式、大小和分辨率，然后生成预览
   */
  const handleFileSelect = useCallback(async (file: File): Promise<string | null> => {
    setIsUploading(true);
    setState((prev) => ({ ...prev, error: null }));

    try {
      // 验证文件（格式、大小、分辨率）
      const validation = await validateImageFile(file);
      if (!validation.valid) {
        setState({
          file: null,
          preview: null,
          isValid: false,
          error: validation.error || 'Invalid file',
        });
        setIsUploading(false);
        return null;
      }

      // 转换为Base64预览
      const base64 = await fileToBase64(file);

      setState({
        file,
        preview: base64,
        isValid: true,
        error: null,
      });
      return base64;
    } catch (error) {
      setState({
        file: null,
        preview: null,
        isValid: false,
        error: error instanceof Error ? error.message : 'Failed to process image',
      });
      return null;
    } finally {
      setIsUploading(false);
    }
  }, []);

  /**
   * 处理拖拽上传
   */
  const handleDrop = useCallback(
    async (event: React.DragEvent): Promise<string | null> => {
      event.preventDefault();
      event.stopPropagation();

      const files = event.dataTransfer.files;
      if (files && files.length > 0) {
        return await handleFileSelect(files[0]);
      }
      return null;
    },
    [handleFileSelect]
  );

  /**
   * 清除上传的图片
   */
  const handleClear = useCallback(() => {
    setState({
      file: null,
      preview: null,
      isValid: false,
      error: null,
    });
  }, []);

  return {
    state,
    handleFileSelect,
    handleDrop,
    handleClear,
    isUploading,
  };
}