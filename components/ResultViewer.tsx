'use client';

/**
 * components/ResultViewer.tsx
 * 结果预览组件
 * 显示生成的卡通头像，支持下载和复制功能
 */

import { useCallback, useState } from 'react';
import { downloadImage, copyImageToClipboard } from '@/lib/utils';
import { SUCCESS_MESSAGES } from '@/lib/constants';

interface ResultViewerProps {
  /** 生成的图片URL */
  imageUrl: string | null;
  /** 是否正在加载 */
  isLoading?: boolean;
  /** 下载回调 */
  onDownload?: () => void;
  /** 重新生成回调 */
  onRegenerate?: () => void;
  /** 是否显示"Example Output"示例标记（展示示例图时启用） */
  showExampleLabel?: boolean;
}

export function ResultViewer({
  imageUrl,
  isLoading,
  onDownload,
  onRegenerate,
  showExampleLabel = false,
}: ResultViewerProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle');

  /**
   * 处理下载
   */
  const handleDownload = useCallback(() => {
    if (imageUrl) {
      downloadImage(imageUrl, `cartoon-avatar-${Date.now()}.png`);
      onDownload?.();
    }
  }, [imageUrl, onDownload]);

  /**
   * 处理复制到剪贴板
   */
  const handleCopy = useCallback(async () => {
    if (!imageUrl) return;

    setCopyStatus('idle');
    const success = await copyImageToClipboard(imageUrl);
    setCopyStatus(success ? 'success' : 'error');

    // 3秒后重置状态
    setTimeout(() => setCopyStatus('idle'), 3000);
  }, [imageUrl]);

  return (
    <div className="w-full">
      {/* 标签栏 */}
      <div className="flex items-center justify-between mb-4">
        <label className="block text-sm font-semibold text-gray-700">
          Generated Avatar
        </label>
        {imageUrl && !isLoading && !showExampleLabel && (
          <span className="text-xs text-green-600 flex items-center gap-1 font-medium">
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
            {SUCCESS_MESSAGES.GENERATED}
          </span>
        )}
      </div>

      {/* 结果显示区域 */}
      <div
        className={`
          relative aspect-square rounded-2xl overflow-hidden
          bg-gradient-to-br from-gray-100 to-gray-50
          border-2 border-dashed border-gray-300
          ${isLoading ? 'animate-pulse' : ''}
          transition-all duration-300
        `}
      >
        {isLoading ? (
          /* 加载状态 */
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {/* 加载动画 */}
            <div className="relative w-20 h-20 mb-4">
              <div className="absolute inset-0 border-4 border-blue-200 rounded-full" />
              <div className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin" />
            </div>
            <p className="text-base font-medium text-gray-700">Generating your avatar...</p>
            <p className="text-sm text-gray-400 mt-1">This may take a few seconds</p>
          </div>
        ) : imageUrl ? (
          /* 显示结果 */
          <>
            <img
              src={imageUrl}
              alt="Generated cartoon avatar"
              className="w-full h-full object-contain"
            />
            {/* 示例输出标记（示例图展示时叠加在图片上方） */}
            {showExampleLabel && (
              <span className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-gray-900/70 text-white text-xs font-semibold tracking-wide">
                Example Output
              </span>
            )}
            {/* 操作按钮组 */}
            <div className="absolute bottom-4 left-4 right-4">
              <div className="flex gap-2">
                {/* 下载按钮 */}
                <button
                  type="button"
                  onClick={handleDownload}
                  className="
                    flex-1 py-2.5 px-4 rounded-xl
                    bg-blue-500 hover:bg-blue-600 text-white
                    text-sm font-semibold
                    transition-all duration-200
                    flex items-center justify-center gap-2
                    hover:shadow-lg active:scale-95
                  "
                >
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
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Download
                </button>

                {/* 复制按钮 */}
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`
                    py-2.5 px-4 rounded-xl
                    text-sm font-semibold
                    transition-all duration-200
                    flex items-center justify-center gap-2
                    ${copyStatus === 'success'
                      ? 'bg-green-500 text-white'
                      : copyStatus === 'error'
                      ? 'bg-red-500 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }
                    active:scale-95
                  `}
                >
                  {copyStatus === 'success' ? (
                    <>
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
                      Copied!
                    </>
                  ) : copyStatus === 'error' ? (
                    <>
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
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                      Failed
                    </>
                  ) : (
                    <>
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
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                      Copy
                    </>
                  )}
                </button>

                {/* 重新生成按钮 */}
                {onRegenerate && (
                  <button
                    type="button"
                    onClick={onRegenerate}
                    className="
                      py-2.5 px-4 rounded-xl
                      bg-gray-100 hover:bg-gray-200 text-gray-700
                      text-sm font-semibold
                      transition-all duration-200
                      flex items-center justify-center gap-2
                      active:scale-95
                    "
                  >
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
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          /* 空状态 */
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
            <div className="w-24 h-24 mb-4 rounded-full bg-gray-100 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-12 w-12"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
            </div>
            <p className="text-sm font-medium">Your generated avatar will appear here</p>
            <p className="text-xs text-gray-400 mt-1">Upload a photo and choose a style to start</p>
          </div>
        )}
      </div>
    </div>
  );
}