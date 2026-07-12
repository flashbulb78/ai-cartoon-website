'use client';

/**
 * app/page.tsx
 * AI卡通头像生成网站首页
 *
 * 功能：
 * - 图片上传与预览（支持拖拽、格式校验、分辨率校验）
 * - 风格选择（4种卡通风格）
 * - 调用后端API生成卡通头像（带防抖和重复提交拦截）
 * - 结果展示、下载与复制功能
 *
 * 认证相关：
 * - 未登录时显示登录提示，拦截生成按钮
 * - 登录后显示剩余次数
 * - 次数不足时引导充值
 *
 * 预留扩展：
 * - DodoPayment付费功能（onUpgrade props）
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { ImageUploader } from '@/components/ImageUploader';
import { StyleSelector } from '@/components/StyleSelector';
import { ResultViewer } from '@/components/ResultViewer';
import { SocialAvatarDownload } from '@/components/SocialAvatarDownload';
import { GenerationParameters } from '@/components/GenerationParameters';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { CartoonStyle, ApiResponse, GenerateResponseData, STYLE_DEFAULT_PARAMS, FaceAnalysisResult } from '@/lib/types';
import { DEFAULT_STYLE, ERROR_MESSAGES } from '@/lib/constants';
import { useFaceCrop } from '@/hooks/useFaceCrop';
import { analyzeFace } from '@/lib/faceAnalysis';

export default function HomePage() {
  // ========== 认证状态 ==========
  const { user, profile, isLoading: isAuthLoading, decrementCredits, signOut } = useAuth();

  // ========== 本地状态 ==========
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<CartoonStyle>(DEFAULT_STYLE);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const [showRegenerateConfirmModal, setShowRegenerateConfirmModal] = useState(false);
  const [isCropping, setIsCropping] = useState(false);

  // ========== 生成参数状态（已上调人脸相似度基准权重）==========
  // face_similarity_strength=0.9, style_strength=0.25, fidelity=0.85
  // 最大化贴合原生五官轮廓、脸型比例，缩小画面整体差异度
  const [faceSimilarity, setFaceSimilarity] = useState<number>(0.9);
  const [styleStrength, setStyleStrength] = useState<number>(0.25);
  const [fidelity, setFidelity] = useState<number>(0.85);
  const [genderForce, setGenderForce] = useState<'male' | 'female' | null>(null);
  const [detectedGender, setDetectedGender] = useState<'male' | 'female' | null>(null);
  const [faceAnalysis, setFaceAnalysis] = useState<FaceAnalysisResult | null>(null);

  // ========== 人脸裁剪 ==========
  const { cropFace, isLoading: isCropLoading } = useFaceCrop();

  // 防止重复提交的ref
  const isGeneratingRef = useRef(false);

  // ========== 回调函数 ==========

  /**
   * 处理图片变化 - 自动裁剪人脸
   */
  const handleImageChange = useCallback(async (base64: string | null) => {
    if (!base64) {
      setSelectedImage(null);
      setError(null);
      setSuccess(null);
      setFaceAnalysis(null);
      return;
    }

    setIsCropping(true);
    setError(null);
    setSuccess(null);
    setFaceAnalysis(null);

    try {
      // 保存原始图像（用于喉结检测等需要完整图像的分析）
      const originalImage = base64;
      
      // 自动裁剪人脸
      const result = await cropFace(base64);
      if (result.success && result.croppedImage) {
        setSelectedImage(result.croppedImage);
        
        // 如果检测到性别，仅记录，不自动设置按钮
        if (result.gender) {
          setDetectedGender(result.gender);
          console.log('[Page] Detected gender:', result.gender);
        }
        
        // 全面人脸分析（包含肤色、发色、眼睛颜色、人种、头发特征等）
        // 使用原始图像而非裁剪图像，以便检测喉结等需要完整图像的特征
        const analysis = await analyzeFace(originalImage);
        setFaceAnalysis(analysis);
        console.log('[Page] Face analysis result:', analysis);
        
        // 如果人脸检测失败，提示用户更换照片
        if (!analysis.faceDetected) {
          setError("We couldn't detect a face in this photo. Please try uploading a clearer image where your face is well-lit and directly visible — this helps us create the best cartoon avatar for you!");
          setSelectedImage(null);
          setFaceAnalysis(null);
          return;
        }
      } else {
        setError(result.error || 'Face cropping failed');
        setSelectedImage(null);
      }
    } catch (err) {
      console.error('[Page] Image change error:', err);
      setError('Failed to process image');
      setSelectedImage(null);
    } finally {
      setIsCropping(false);
    }
  }, [cropFace]);

  /**
   * 处理风格变化
   */
  const handleStyleChange = useCallback((style: CartoonStyle) => {
    setSelectedStyle(style);
    // Auto-adjust parameters based on style defaults for optimal results
    const defaults = STYLE_DEFAULT_PARAMS[style];
    if (defaults) {
      setFaceSimilarity(defaults.faceSimilarity);
      setStyleStrength(defaults.styleStrength);
      setFidelity(defaults.fidelity);
    }
  }, []);

  /**
   * 生成卡通头像
   */
  const handleGenerate = useCallback(async () => {
    // 1. 登录检查
    if (!user) {
      setShowLoginModal(true);
      return;
    }

    // 2. 次数检查
    if (profile && profile.credits <= 0) {
      setShowCreditsModal(true);
      return;
    }

    // 3. 重复提交拦截
    if (isGenerating) return;

    // 4. 前置校验
    if (!selectedImage) {
      setError(ERROR_MESSAGES.NO_IMAGE);
      return;
    }

    // 5. 设置生成状态
    setIsGenerating(true);
    setError(null);
    setSuccess(null);
    setGeneratedImage(null);

    try {
      // 6. 调用API
      console.log('[Page] Sending generation request');
      console.log('[Page] selectedImage type:', typeof selectedImage);
      console.log('[Page] selectedImage length:', selectedImage?.length);
      console.log('[Page] selectedImage prefix:', selectedImage?.substring(0, 50));
      console.log('[Page] selectedStyle:', selectedStyle);
      
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: selectedImage,
          style: selectedStyle,
          faceSimilarity,
          styleStrength,
          fidelity,
          genderForce,
          faceAnalysis,
        }),
      });
      
      console.log('[Page] Response status:', response.status);

      // 7. 解析响应
      const result: ApiResponse<GenerateResponseData> = await response.json();

      // 8. 处理结果
      if (result.success && result.data) {
        setGeneratedImage(result.data.imageUrl);
        setSuccess('Avatar generated successfully!');
        // 扣减本地次数（服务器端也会扣减）
        decrementCredits();
      } else {
        const errorMessage = result.error || ERROR_MESSAGES.GENERATION_FAILED;
        setError(errorMessage);
      }
    } catch (err) {
      console.error('Generation error:', err);
      setError(ERROR_MESSAGES.NETWORK_ERROR);
    } finally {
      setIsGenerating(false);
    }
  }, [user, profile, isGenerating, selectedImage, selectedStyle, faceSimilarity, styleStrength, fidelity, genderForce, faceAnalysis, cropFace, decrementCredits]);

  /**
   * 重新生成 - 显示确认弹窗
   */
  const handleRegenerate = useCallback(() => {
    if (!isGenerating && !profile?.is_premium && profile && profile.credits <= 0) {
      setShowCreditsModal(true);
      return;
    }
    setShowRegenerateConfirmModal(true);
  }, [isGenerating, profile]);

  /**
   * 下载完成回调
   */
  const handleDownload = useCallback(() => {
    setSuccess('Image downloaded!');
    setTimeout(() => setSuccess(null), 3000);
  }, []);

  /**
   * 登录页跳转
   */
  const handleLogin = useCallback(() => {
    window.location.href = '/auth/login';
  }, []);

  /**
   * 定价页跳转
   */
  const handlePricing = useCallback(() => {
    window.location.href = '/pricing';
  }, []);

  /**
   * 升级按钮（预留DodoPayment）
   */
  const handleUpgrade = useCallback(() => {
    // TODO: 跳转DodoPayment支付页
    console.log('Upgrade clicked - DodoPayment');
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      {/* 头部 - 已集成用户信息显示 */}
      <Header
        isLoggedIn={!!user}
        userName={user ? (profile?.username || profile?.full_name || 'User') : undefined}
        userAvatar={profile?.avatar_url}
        credits={profile?.credits}
        onLogin={handleLogin}
        onPricing={handlePricing}
        onSignOut={signOut}
      />

      {/* 主内容区 */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 页面标题 */}
        <div className="text-center mb-8">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">
            Create Your Magic Cartoon Avatar
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Upload your photo and choose a style to generate a unique cartoon avatar in seconds
          </p>
        </div>

        {/* 编辑器区域 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          {/* 左侧：配置区 */}
          <div className="space-y-5">
            {/* 剩余次数提示（已登录用户） */}
            {user && profile && (
              <div className="bg-card rounded-2xl p-4 border border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center">
                      <span className="text-xl">✨</span>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">
                        {profile.credits} Credits Available
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {profile.is_premium ? 'Premium member - unlimited generations' : 'Free tier'}
                      </p>
                    </div>
                  </div>
                  {!profile.is_premium && (
                    <Button variant="primary" size="sm" onClick={() => window.location.href = '/pricing'}>
                      Upgrade
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* 图片上传卡片 */}
            <div className="bg-card rounded-2xl shadow-sm border border-border p-5 sm:p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-blue-600">
                  1
                </span>
                Upload Photo
              </h3>
              <ImageUploader
                onImageChange={handleImageChange}
                disabled={isGenerating}
              />
            </div>

            {/* 风格选择卡片 */}
            <div className="bg-card rounded-2xl shadow-sm border border-border p-5 sm:p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-blue-600">
                  2
                </span>
                Choose Style
              </h3>
              <StyleSelector
                value={selectedStyle}
                onChange={handleStyleChange}
                disabled={isGenerating}
              />
            </div>

            {/* 生成参数卡片 */}
            <GenerationParameters
              faceSimilarity={faceSimilarity}
              styleStrength={styleStrength}
              fidelity={fidelity}
              onFaceSimilarityChange={setFaceSimilarity}
              onStyleStrengthChange={setStyleStrength}
              onFidelityChange={setFidelity}
              disabled={isGenerating}
            />

            {/* 生成按钮卡片 */}
            <div className="bg-card rounded-2xl shadow-sm border border-border p-5 sm:p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-blue-600">
                  3
                </span>
                Generate
              </h3>

              {/* 未登录提示 */}
              {!user && !isAuthLoading && (
                <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex items-start gap-3">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div>
                      <p className="text-sm text-amber-800 font-medium">Login required</p>
                      <p className="text-sm text-amber-700 mt-1">
                        Please login to generate avatars and track your credits
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* 性别选择 */}
              <div className="mb-4">
                <p className="text-sm text-muted-foreground mb-2 text-center">Gender (Optional)</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setGenderForce(genderForce === 'male' ? null : 'male')}
                    className={`
                      flex-1 py-2.5 px-4 rounded-xl
                      text-sm font-semibold
                      transition-all duration-200
                      flex items-center justify-center gap-2
                      ${genderForce === 'male'
                        ? 'bg-blue-500 text-white shadow-md'
                        : 'bg-muted text-muted-foreground hover:bg-gray-200'
                      }
                      active:scale-95
                    `}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Male
                  </button>
                  <button
                    type="button"
                    onClick={() => setGenderForce(genderForce === 'female' ? null : 'female')}
                    className={`
                      flex-1 py-2.5 px-4 rounded-xl
                      text-sm font-semibold
                      transition-all duration-200
                      flex items-center justify-center gap-2
                      ${genderForce === 'female'
                        ? 'bg-blue-500 text-white shadow-md'
                        : 'bg-muted text-muted-foreground hover:bg-gray-200'
                      }
                      active:scale-95
                    `}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                    </svg>
                    Female
                  </button>
                </div>
              </div>

              {/* 生成按钮 */}
              <Button
                onClick={handleGenerate}
                disabled={!selectedImage || isGenerating}
                isLoading={isGenerating}
                className="w-full"
                size="lg"
              >
                {isGenerating
                  ? 'Generating...'
                  : !selectedImage
                  ? 'Select an Image First'
                  : 'Generate Avatar'}
              </Button>

              {/* 错误/成功提示 */}
              {error && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
                  <div className="flex items-start gap-3">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5"
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
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                </div>
              )}

              {success && (
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl">
                  <div className="flex items-start gap-3">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <p className="text-sm text-green-700">{success}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 右侧：结果预览区 */}
          <div className="bg-card rounded-2xl shadow-sm border border-border p-5 sm:p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-blue-600">
                ✨
              </span>
              Result
            </h3>
            <ResultViewer
              imageUrl={generatedImage}
              isLoading={isGenerating}
              onDownload={handleDownload}
              onRegenerate={generatedImage && !isGenerating ? handleRegenerate : undefined}
            />
            {/* Social Media Download Options */}
            <SocialAvatarDownload imageUrl={generatedImage} baseFilename="magicyoyoyo-avatar" />
          </div>
        </div>

        {/* 底部提示 */}
        <div className="mt-10 text-center">
          <p className="text-sm text-gray-400">
            By using our service, you agree to our{' '}
            <button className="text-blue-500 hover:text-blue-600 underline">Terms of Service</button>
            {' '}and{' '}
            <button className="text-blue-500 hover:text-blue-600 underline">Privacy Policy</button>
          </p>
        </div>
      </main>

      {/* 登录提示弹窗 */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-card rounded-2xl shadow-2xl max-w-md w-full p-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🔐</span>
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">Login Required</h3>
              <p className="text-muted-foreground mb-6">
                Please login to generate avatars and track your credits
              </p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setShowLoginModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={handleLogin}>
                  Login
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 次数不足弹窗 */}
      {showCreditsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-card rounded-2xl shadow-2xl max-w-md w-full p-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">⚠️</span>
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">Credits Ran Out</h3>
              <p className="text-muted-foreground mb-6">
                You have no credits remaining. Upgrade to Premium for unlimited generations!
              </p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setShowCreditsModal(false)}>
                  Later
                </Button>
                <Button variant="primary" onClick={() => window.location.href = '/pricing'}>
                  Upgrade Now
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 重新生成确认弹窗 */}
      {showRegenerateConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-card rounded-2xl shadow-2xl max-w-md w-full p-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🔄</span>
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">Regenerate Avatar</h3>
              <p className="text-muted-foreground mb-6">
                Regenerating will cost 1 credit. Do you want to continue?
              </p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setShowRegenerateConfirmModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={() => {
                  setShowRegenerateConfirmModal(false);
                  handleGenerate();
                }}>
                  Continue (Costs 1 Credit)
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}