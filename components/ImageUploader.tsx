'use client';

/**
 * components/ImageUploader.tsx
 * 图片上传组件
 * 支持拖拽上传、点击选择、实时预览、图片删除
 * 适配移动端和桌面端
 * 
 * Privacy consent required before uploading face images
 */

import { useCallback, useRef, useState } from 'react';
import { useImageUpload } from '@/hooks/useImageUpload';
import { formatFileSize } from '@/lib/utils';
import { ALLOWED_IMAGE_TYPES } from '@/lib/constants';
import { PrivacyConsentModal } from './PrivacyConsentModal';

interface ImageUploaderProps {
  /** 图片变化回调 */
  onImageChange?: (base64: string | null) => void;
  /** 是否禁用上传 */
  disabled?: boolean;
}

export function ImageUploader({ onImageChange, disabled }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { state, handleFileSelect, handleDrop, handleClear, isUploading } = useImageUpload();
  
  // Privacy consent state
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [hasConsented, setHasConsented] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  /**
   * 当状态变化时通知父组件
   */
  const notifyChange = useCallback(
    (base64: string | null) => {
      if (onImageChange) {
        onImageChange(base64);
      }
    },
    [onImageChange]
  );

  /**
   * 处理文件选择 - 触发隐私同意
   */
  const onInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files && files.length > 0) {
        // Store the file and show consent modal
        setPendingFile(files[0]);
        setShowConsentModal(true);
      }
    },
    []
  );

  /**
   * Handle consent acceptance
   */
  const handleConsentAccept = useCallback(async () => {
    setShowConsentModal(false);
    setHasConsented(true);
    
    if (pendingFile) {
      const base64 = await handleFileSelect(pendingFile);
      if (base64) {
        notifyChange(base64);
      }
      setPendingFile(null);
    }
  }, [pendingFile, handleFileSelect, notifyChange]);

  /**
   * Handle consent decline
   */
  const handleConsentDecline = useCallback(() => {
    setShowConsentModal(false);
    setHasConsented(false);
    setPendingFile(null);
    // Reset input
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }, []);

  /**
   * 处理清除按钮点击
   */
  const onClear = useCallback(() => {
    handleClear();
    notifyChange(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }, [handleClear, notifyChange]);

  /**
   * 阻止默认拖拽行为
   */
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  /**
   * 点击上传区域
   */
  const onClick = useCallback(() => {
    if (!disabled && !isUploading) {
      inputRef.current?.click();
    }
  }, [disabled, isUploading]);

  /**
   * 处理拖拽上传 - 触发隐私同意
   */
  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        // Store the file and show consent modal
        setPendingFile(files[0]);
        setShowConsentModal(true);
      }
    },
    []
  );

  return (
    <div className="w-full">
      {/* Privacy Consent Modal */}
      <PrivacyConsentModal
        isOpen={showConsentModal}
        onAccept={handleConsentAccept}
        onDecline={handleConsentDecline}
      />

      {/* 上传区域 */}
      <div
        onClick={onClick}
        onDrop={onDrop}
        onDragOver={onDragOver}
        className={`
          relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer
          transition-all duration-300 ease-out
          ${disabled || isUploading ? 'opacity-60 cursor-not-allowed' : 'hover:border-blue-400 hover:bg-blue-50/50 active:scale-98'}
          ${state.error ? 'border-red-400 bg-red-50/50' : 'border-gray-300 bg-gray-50/50'}
          ${state.preview ? 'border-green-400 bg-green-50/30' : ''}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_IMAGE_TYPES.join(',')}
          onChange={onInputChange}
          disabled={disabled || isUploading}
          className="hidden"
        />

        {/* 有预览图时显示预览 */}
        {state.preview ? (
          <div className="relative group">
            <img
              src={state.preview}
              alt="Preview"
              className="max-h-56 mx-auto rounded-xl object-contain shadow-md"
            />
            {/* 删除按钮 - 悬停时显示 */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              disabled={disabled}
              className={`
                absolute -top-3 -right-3 w-9 h-9
                bg-red-500 hover:bg-red-600 text-white
                rounded-full flex items-center justify-center
                shadow-lg transition-all duration-200
                disabled:opacity-50
                hover:scale-110 active:scale-95
              `}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        ) : (
          /* 无预览图时显示上传提示 */
          <div className="space-y-4">
            {/* 上传图标 */}
            <div className={`
              mx-auto w-20 h-20 rounded-full flex items-center justify-center
              transition-all duration-300
              ${isUploading ? 'bg-blue-100 scale-110' : 'bg-gray-100 group-hover:bg-blue-100'}
            `}>
              {isUploading ? (
                /* 加载动画 */
                <svg
                  className="animate-spin h-10 w-10 text-blue-500"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              ) : (
                /* 上传图标 */
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-10 w-10 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              )}
            </div>

            {/* 文字提示 */}
            <div>
              <p className="text-base font-medium text-gray-700">
                {isUploading ? 'Processing...' : 'Drop your photo here or click to upload'}
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Supports JPG, PNG, WEBP • Max 10MB • Min 100×100px
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 错误提示 */}
      {state.error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-red-500 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm text-red-600">{state.error}</p>
          </div>
        </div>
      )}

      {/* 文件信息 */}
      {state.file && (
        <div className="mt-3 flex items-center justify-center gap-3 text-sm text-gray-500">
          <span className="font-medium text-gray-700 truncate max-w-[200px]">{state.file.name}</span>
          <span className="text-gray-300">•</span>
          <span>{formatFileSize(state.file.size)}</span>
          {state.isValid && (
            <>
              <span className="text-gray-300">•</span>
              <span className="text-green-600 flex items-center gap-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                Ready
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}