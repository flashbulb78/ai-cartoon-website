'use client';

/**
 * components/SocialAvatarDownload.tsx
 * Social Media Avatar Download Component
 * Provides platform-specific sizes, circular preview, and border templates
 * 
 * [ROLLBACK POINT 51]
 * Features:
 * - Platform presets: Discord, Instagram, TikTok, LinkedIn
 * - Circular crop preview with drag-to-adjust position
 * - Colored border templates (Discord style)
 * - Format selection: PNG, WebP, JPG
 * - Mobile responsive
 * 
 * Rollback: Delete this file and revert to ROLLBACK POINT 51 state
 */

import { useCallback, useState, useRef, useEffect } from 'react';

export type Platform = 'universal' | 'discord' | 'instagram' | 'tiktok' | 'linkedin';
export type ImageFormat = 'png' | 'webp' | 'jpeg';
export type BorderStyle = 'none' | 'discord' | 'colorful';

interface PlatformConfig {
  id: Platform;
  name: string;
  size: number;
  hasBorder: boolean;
  description: string;
}

interface PositionOffset {
  x: number;
  y: number;
}

const PLATFORMS: PlatformConfig[] = [
  { id: 'universal', name: 'Universal', size: 1024, hasBorder: false, description: '1024×1024 - Standard square avatar' },
  { id: 'discord', name: 'Discord', size: 512, hasBorder: true, description: '512×512 or 1024×1024 with rounded border' },
  { id: 'instagram', name: 'Instagram', size: 1080, hasBorder: false, description: '1080×1080 for profile pic' },
  { id: 'tiktok', name: 'TikTok', size: 1080, hasBorder: false, description: '1080×1080 for profile pic' },
  { id: 'linkedin', name: 'LinkedIn', size: 400, hasBorder: false, description: '400×400 professional headshot' },
];

const BORDER_COLORS = [
  { name: 'Blurple', color: '#5865F2', gradient: 'linear-gradient(#5865F2, #7289DA)' },
  { name: 'Dark', color: '#1E1F22', gradient: 'linear-gradient(#36393F, #1E1F22)' },
  { name: 'Green', color: '#57F287', gradient: 'linear-gradient(#57F287, #23A55A)' },
  { name: 'Yellow', color: '#FEE75C', gradient: 'linear-gradient(#FEE75C, #E5C702)' },
  { name: 'Red', color: '#ED4245', gradient: 'linear-gradient(#ED4245, #C9353D)' },
  { name: 'Pink', color: '#EB459E', gradient: 'linear-gradient(#EB459E, #F47FFF)' },
  { name: 'Purple', color: '#9B84EC', gradient: 'linear-gradient(#9B84EC, #7B5CF0)' },
];

interface SocialAvatarDownloadProps {
  /** The generated avatar image URL */
  imageUrl: string | null;
  /** Base filename for downloads */
  baseFilename?: string;
}

export function SocialAvatarDownload({
  imageUrl,
  baseFilename = 'magicyoyoyo-avatar',
}: SocialAvatarDownloadProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>('universal');
  const [selectedFormat, setSelectedFormat] = useState<ImageFormat>('png');
  const [selectedBorder, setSelectedBorder] = useState<BorderStyle>('none');
  const [selectedBorderColor, setSelectedBorderColor] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [positionOffset, setPositionOffset] = useState<PositionOffset>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<PositionOffset>({ x: 0, y: 0 });
  const offsetAtDragStartRef = useRef<PositionOffset>({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  // Zoom factor: image is scaled to 1.15x the circle size so there's room to drag
  const ZOOM_FACTOR = 1.15;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const platform = PLATFORMS.find(p => p.id === selectedPlatform) || PLATFORMS[0];

  // Draw function - use useCallback to stabilize reference
  const drawImageToCanvas = useCallback((
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    size: number,
    offset: PositionOffset
  ) => {
    console.log('drawImageToCanvas called:', { 
      offsetX: offset.x, 
      offsetY: offset.y,
      imgWidth: img.width,
      imgHeight: img.height,
      canvasSize: size 
    });
    
    // Clear entire canvas
    ctx.clearRect(0, 0, size, size);

    // Calculate safe area (full canvas for circular crop)
    const safeRadius = size / 2;
    const centerX = size / 2;
    const centerY = size / 2;

    // Draw circular clip using save/clip/restore pattern
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, safeRadius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    // 把图片缩放到比画布大一些（乘以ZOOM_FACTOR=1.15），这样就有拖拽余量了
    const baseScale = Math.max(size / img.width, size / img.height);
    const scale = baseScale * ZOOM_FACTOR;
    const scaledWidth = img.width * scale;
    const scaledHeight = img.height * scale;
    
    console.log('Scaled dimensions:', { scaledWidth, scaledHeight, scale });
    
    // Base offset (center the image) - this is negative because we're positioning the image
    const baseOffsetX = (size - scaledWidth) / 2;
    const baseOffsetY = (size - scaledHeight) / 2;
    
    // Apply position offset to move the image
    // offset ranges from -0.5 to 0.5, multiply by the image oversize amount
    const moveRangeX = (scaledWidth - size) / 2;
    const moveRangeY = (scaledHeight - size) / 2;
    
    // 如果moveRange为0（理论上不会了，因为有ZOOM_FACTOR），给个保底值
    const effectiveMoveX = moveRangeX || size * 0.1;
    const effectiveMoveY = moveRangeY || size * 0.1;
    
    const drawX = baseOffsetX + offset.x * effectiveMoveX;
    const drawY = baseOffsetY + offset.y * effectiveMoveY;
    
    console.log('Draw position:', { drawX, drawY, moveRangeX, moveRangeY, effectiveMoveX, effectiveMoveY });

    ctx.drawImage(img, drawX, drawY, scaledWidth, scaledHeight);
    
    // Restore context to remove clip
    ctx.restore();
  }, []);

  const generatePreview = useCallback(() => {
    if (!imageUrl || !previewRef.current) return;

    const canvas = previewRef.current;
    const size = 280; // Preview size

    // Set canvas size first
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // If we have a cached image, use it directly
    if (imageRef.current) {
      console.log('Using cached image, offset:', positionOffset);
      drawImageToCanvas(ctx, imageRef.current, size, positionOffset);
      return;
    }

    // Otherwise, load the image
    console.log('Loading new image:', imageUrl);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      console.log('Image loaded successfully');
      // Cache the image
      imageRef.current = img;
      drawImageToCanvas(ctx, img, size, positionOffset);
    };
    img.onerror = (e) => {
      console.error('Image load failed:', e);
    };
    img.src = imageUrl;
  }, [imageUrl, positionOffset, drawImageToCanvas]);

  // Generate preview when settings change
  useEffect(() => {
    if (!imageUrl || !showPreview) return;
    generatePreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, selectedPlatform, selectedBorder, selectedBorderColor, showPreview, positionOffset]);

  // Drag event handlers - 记录拖拽开始时的鼠标位置和当前偏移量
  const handleDragStart = useCallback((clientX: number, clientY: number) => {
    isDraggingRef.current = true;
    offsetAtDragStartRef.current = { x: positionOffset.x, y: positionOffset.y };
    dragStartRef.current = { x: clientX, y: clientY };
    setIsDragging(true);
  }, [positionOffset]);

  const handleDragMove = useCallback((clientX: number, clientY: number) => {
    if (!isDraggingRef.current) return;
    
    // 获取拖拽开始时的鼠标位置
    const startX = dragStartRef.current.x;
    const startY = dragStartRef.current.y;
    
    // 计算相对于起始点的偏移
    const deltaX = (clientX - startX) / 140;
    const deltaY = (clientY - startY) / 140;
    
    // 累加到拖拽开始时的偏移量上，这样多次拖拽可以累加
    const baseOffset = offsetAtDragStartRef.current;
    setPositionOffset({
      x: Math.max(-0.5, Math.min(0.5, baseOffset.x + deltaX)),
      y: Math.max(-0.5, Math.min(0.5, baseOffset.y + deltaY)),
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    isDraggingRef.current = false;
    setIsDragging(false);
  }, []);

  // Add document-level event listeners for drag operations
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      handleDragMove(e.clientX, e.clientY);
    };

    const handleMouseUp = () => {
      handleDragEnd();
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      handleDragMove(touch.clientX, touch.clientY);
    };

    const handleTouchEnd = () => {
      handleDragEnd();
    };

    // Add document-level listeners to track drag outside canvas bounds
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  // Mouse events - only need handleMouseDown now, move/up are handled by document listeners
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    handleDragStart(e.clientX, e.clientY);
  }, [handleDragStart]);

  // Touch events
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    handleDragStart(touch.clientX, touch.clientY);
  }, [handleDragStart]);

  // Reset position offset
  const handleResetPosition = useCallback(() => {
    setPositionOffset({ x: 0, y: 0 });
  }, []);

  const handleDownload = useCallback(async () => {
    if (!imageUrl) return;

    setIsGenerating(true);

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context not available');

      // Load image
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = imageUrl;
      });

      // Set canvas size based on platform
      const size = platform.size;
      canvas.width = size;
      canvas.height = size;

      // Calculate circular mask (full canvas for circular crop)
      const safeRadius = size / 2;
      const centerX = size / 2;
      const centerY = size / 2;

      // Draw border if selected (Discord style)
      if (selectedBorder !== 'none' && platform.hasBorder) {
        const borderWidth = size * 0.08;
        const borderRadius = safeRadius + borderWidth / 2;
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, borderRadius, 0, Math.PI * 2);
        ctx.fillStyle = BORDER_COLORS[selectedBorderColor].color;
        ctx.fill();
      }

      // Draw circular clip for image
      ctx.beginPath();
      ctx.arc(centerX, centerY, safeRadius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      // Draw image centered and scaled to fill, with position offset
      const scale = Math.max(size / img.width, size / img.height);
      const scaledWidth = img.width * scale;
      const scaledHeight = img.height * scale;
      
      // Base offset (center the image)
      let offsetX = (size - scaledWidth) / 2;
      let offsetY = (size - scaledHeight) / 2;
      
      // Apply position offset (same formula as preview)
      const maxOffset = (Math.max(scaledWidth, scaledHeight) - size) / 2;
      offsetX += positionOffset.x * maxOffset * 2;
      offsetY += positionOffset.y * maxOffset * 2;

      ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);

      // Convert to blob and download
      const mimeType = selectedFormat === 'jpeg' ? 'image/jpeg' : 
                       selectedFormat === 'webp' ? 'image/webp' : 'image/png';
      
      canvas.toBlob((blob) => {
        if (!blob) return;
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${baseFilename}-${selectedPlatform}-${size}.${selectedFormat}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, mimeType, 0.95);

    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      setIsGenerating(false);
    }
  }, [imageUrl, platform, selectedFormat, selectedBorder, selectedBorderColor, baseFilename, selectedPlatform, positionOffset]);

  // Show placeholder when no image
  if (!imageUrl) {
    return (
      <div className="w-full mt-4 p-4 bg-white rounded-2xl shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <label className="block text-sm font-semibold text-gray-700">
            Social Media Download
          </label>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-gray-400">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-sm">Generate an avatar first to see download options</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mt-4 p-4 bg-white rounded-2xl shadow-sm border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <label className="block text-sm font-semibold text-gray-700">
          Social Media Download
        </label>
        <button
          type="button"
          onClick={() => setShowPreview(!showPreview)}
          className="text-xs text-blue-500 hover:text-blue-600 font-medium"
        >
          {showPreview ? 'Hide Preview' : 'Show Preview'}
        </button>
      </div>

      {/* Circular Preview */}
      {showPreview && (
        <div className="mb-4 flex flex-col items-center">
          <div className="relative">
            <canvas
              ref={previewRef}
              width={280}
              height={280}
              className={`w-[280px] h-[280px] rounded-full cursor-grab select-none ${
                isDragging ? 'cursor-grabbing' : ''
              }`}
              style={{ boxShadow: '0 0 0 4px white, 0 0 0 6px #e5e7eb' }}
              onMouseDown={handleMouseDown}
              onTouchStart={handleTouchStart}
            />
            {/* Drag indicator */}
            <div className="absolute bottom-1 right-1 w-6 h-6 bg-black/50 rounded-full flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
              </svg>
            </div>
          </div>
          <p className="text-center text-xs text-gray-500 mt-2">
            Drag to adjust position
          </p>
          {/* Reset button */}
          {(positionOffset.x !== 0 || positionOffset.y !== 0) && (
            <button
              type="button"
              onClick={handleResetPosition}
              className="mt-2 text-xs text-blue-500 hover:text-blue-600 font-medium"
            >
              Reset position
            </button>
          )}
        </div>
      )}

      {/* Safety Notice */}
      <div className="mb-4 p-3 bg-blue-50 rounded-xl border border-blue-100">
        <p className="text-xs text-blue-700">
          <span className="font-semibold">Tip:</span> Keep your face centered within the circle for best results on circular social media platforms.
        </p>
      </div>

      {/* Platform Selection */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-600 mb-2">
          Platform
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedPlatform(p.id)}
              className={`
                p-2 rounded-xl text-left transition-all
                ${selectedPlatform === p.id
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }
              `}
            >
              <div className="font-semibold text-sm">{p.name}</div>
              <div className={`text-xs ${selectedPlatform === p.id ? 'text-blue-100' : 'text-gray-500'}`}>
                {p.size}×{p.size}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Border Style (only for Discord) */}
      {platform.hasBorder && (
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-2">
            Border Style
          </label>
          <div className="flex gap-2">
            {(['none', 'discord'] as BorderStyle[]).map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => setSelectedBorder(style)}
                className={`
                  px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                  ${selectedBorder === style
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }
                `}
              >
                {style === 'none' ? 'No Border' : 'Discord Style'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Border Color Selection */}
      {selectedBorder === 'discord' && platform.hasBorder && (
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-2">
            Border Color
          </label>
          <div className="flex flex-wrap gap-2">
            {BORDER_COLORS.map((border, index) => (
              <button
                key={border.name}
                type="button"
                onClick={() => setSelectedBorderColor(index)}
                className={`
                  w-8 h-8 rounded-full transition-all
                  ${selectedBorderColor === index
                    ? 'ring-2 ring-offset-2 ring-blue-500'
                    : 'hover:scale-110'
                  }
                `}
                style={{ background: border.gradient }}
                title={border.name}
              />
            ))}
          </div>
        </div>
      )}

      {/* Format Selection */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-600 mb-2">
          Format
        </label>
        <div className="flex gap-2">
          {(['png', 'webp', 'jpeg'] as ImageFormat[]).map((format) => (
            <button
              key={format}
              type="button"
              onClick={() => setSelectedFormat(format)}
              className={`
                px-3 py-1.5 rounded-lg text-sm font-medium uppercase transition-all
                ${selectedFormat === format
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }
              `}
            >
              {format}
            </button>
          ))}
        </div>
      </div>

      {/* Download Button */}
      <button
        type="button"
        onClick={handleDownload}
        disabled={isGenerating}
        className={`
          w-full py-3 rounded-xl font-semibold text-white
          transition-all flex items-center justify-center gap-2
          ${isGenerating
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 shadow-lg hover:shadow-xl active:scale-98'
          }
        `}
      >
        {isGenerating ? (
          <>
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Generating...
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download {platform.name} {platform.size}×{platform.size} ({selectedFormat.toUpperCase()})
          </>
        )}
      </button>

      {/* Hidden canvas for generation */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
