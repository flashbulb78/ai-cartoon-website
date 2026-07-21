/**
 * lib/minimax.ts
 * MiniMax API 调用逻辑
 * 包含错误处理、日志记录和Base64清理
 */

import { CartoonStyle, ApiResponse, GenerateResponseData, FaceAnalysisResult } from './types';

const MINIMAX_BASE_URL = process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/v1';
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const MINIMAX_MODEL_ID = process.env.MINIMAX_MODEL_ID || 'image-01';

/**
 * 人脸保留强度 (0.5-1.0, 默认0.9)
 * 数值越高越保留原图人脸特征
 * 已上调至最高优先级，五官轮廓精准锁定
 */
const FACE_SIMILARITY_STRENGTH = parseFloat(process.env.FACE_SIMILARITY_STRENGTH || '0.9');

/**
 * 风格强度 (0.2-0.8, 默认0.25)
 * 数值越低风格篡改幅度越小，优先保留原图
 */
const STYLE_STRENGTH = parseFloat(process.env.STYLE_STRENGTH || '0.25');

/**
 * 还原度 (0.4-1.0, 默认0.85)
 * 数值越高越保持原图特征，缩小画面整体差异度
 */
const FIDELITY = parseFloat(process.env.FIDELITY || '0.85');

/**
 * MiniMax风格映射
 * 将我们的风格ID映射到MiniMax API接受的提示词
 */
const STYLE_PROMPTS: Record<CartoonStyle, string> = {
  pixar_3d_cartoon: '3D Pixar cartoon style, soft smooth rendering, clean texture, warm soft lighting, cute friendly 3D character, high detail, cinematic render.',
  american_retro_cartoon: 'American vintage cartoon style, bold clean outline, high saturation retro color, street fashion texture, classic western cartoon shading.',
  cyberpunk_neon: 'Cyberpunk futuristic portrait, neon glow light, dark tone background, tech texture, futuristic atmosphere, glowing edge detail.',
  minimal_illustration: 'Minimal clean line illustration, simple elegant color matching, flat design, high sense premium portrait, clean and neat texture.',
  japanese_anime: 'Premium Japanese anime style, bright clear eyes, soft gradient shading, youthful texture, clean comic line, vibrant anime color.',
  korean_soft_portrait: 'Korean webtoon style, delicate soft skin, gentle tone, smooth shading, elegant and fresh portrait, soft facial contour.',
  japanese_watercolor: 'Japanese watercolor texture, warm soft color, transparent watercolor layering, healing artistic atmosphere, faint paper texture.',
  gothic_dark: 'Dark gothic aesthetic, low saturation tone, mysterious atmosphere, elegant dark texture, subtle shadow detail, retro dark art.',
  vintage_pixel: '8-bit retro pixel art, classic game nostalgic style, clear pixel outline, retro color palette, vintage game texture.',
  oil_painting: 'Classic oil painting texture, artistic brush stroke, layered color, high-end art portrait, canvas texture, soft ambient light.',
  steampunk_vintage: 'Steampunk retro style, mechanical texture, metal vintage tone, retro gear detail, old industrial art atmosphere.',
  chibi_q_version: 'Super cute chibi style, proportional big head, lovely soft feature, warm color, cartoon cute texture, suitable for couple avatar.',
  street_sport: 'Modern street fashion style, youthful sports vibe, trendy clothing texture, energetic tone, casual street portrait.',
};

/**
 * MiniMax API 超时配置 (毫秒)
 * 延长至120秒避免固定1分钟截断
 */
const MINIMAX_TIMEOUT = 120 * 1000;

/**
 * 重试配置
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1500,
  maxDelayMs: 3000,
  retryableStatusCodes: [1000, 408, 429, 500, 502, 503, 504],
};

/**
 * 清理Base64图片字符串
 * 移除可能存在的前缀（如 data:image/png;base64,）
 */
function cleanBase64Image(imageBase64: string): string {
  // 移除可能的data URL前缀
  if (imageBase64.includes(',')) {
    return imageBase64.split(',')[1];
  }
  return imageBase64;
}

/**
 * 验证环境变量配置
 */
function validateConfig(): { valid: boolean; error?: string } {
  if (!MINIMAX_API_KEY) {
    return {
      valid: false,
      error: 'MINIMAX_API_KEY environment variable is not set. Please check your .env.local file.',
    };
  }

  if (MINIMAX_API_KEY.length < 10) {
    return {
      valid: false,
      error: 'MINIMAX_API_KEY appears to be invalid (too short). Please check your API key.',
    };
  }

  if (!MINIMAX_BASE_URL) {
    return {
      valid: false,
      error: 'MINIMAX_BASE_URL environment variable is not set.',
    };
  }

  return { valid: true };
}

/**
 * 判断错误是否可重试
 */
function isRetryableError(data: Record<string, unknown>, status: number): boolean {
  // 检查status_code字段（MiniMax特定错误码）
  if (data.status_code === 1000 || data.status_code === '1000') {
    return true;
  }
  // 检查rpc timeout错误
  const errorObj = data.error as Record<string, unknown> | undefined;
  if (errorObj?.type === 'rpc_timeout' || String(data.error).includes('timeout')) {
    return true;
  }
  // 检查HTTP状态码
  if (RETRY_CONFIG.retryableStatusCodes.includes(status)) {
    return true;
  }
  return false;
}

/**
 * 带重试的fetch调用
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retryCount = 0
): Promise<{ response: Response; data: Record<string, unknown> }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MINIMAX_TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    let data: Record<string, unknown> = {};
    try {
      data = await response.json();
    } catch {
      // 响应体可能为空或非JSON
    }

    // 检查是否应该重试
    if (retryCount < RETRY_CONFIG.maxRetries && isRetryableError(data, response.status)) {
      const delay = Math.min(
        RETRY_CONFIG.baseDelayMs * Math.pow(2, retryCount),
        RETRY_CONFIG.maxDelayMs
      );
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, retryCount + 1);
    }

    return { response, data };
  } catch (error) {
    clearTimeout(timeoutId);

    // 判断是否是超时错误
    if (error instanceof Error && error.name === 'AbortError') {
      if (retryCount < RETRY_CONFIG.maxRetries) {
        const delay = Math.min(
          RETRY_CONFIG.baseDelayMs * Math.pow(2, retryCount),
          RETRY_CONFIG.maxDelayMs
        );
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchWithRetry(url, options, retryCount + 1);
      }
      throw new Error(`Request timeout after ${MINIMAX_TIMEOUT}ms`);
    }

    throw error;
  }
}

/**
 * 调用MiniMax API生成卡通头像
 * @param imageBase64 - Base64编码的源图片（可能包含data URL前缀）
 * @param style - 卡通风格
 * @param faceSimilarity - 人脸相似度 (0.5-1.0), 可选，默认使用环境变量配置
 * @returns 生成结果
 */
export async function generateCartoonAvatar(
  imageBase64: string,
  style: CartoonStyle,
  faceSimilarity?: number,
  styleStrength?: number,
  fidelity?: number,
  genderForce?: 'male' | 'female',
  faceAnalysis?: FaceAnalysisResult
): Promise<ApiResponse<GenerateResponseData>> {

  // 1. 验证配置
  const configValidation = validateConfig();
  if (!configValidation.valid) {
    console.error('[MiniMax] Configuration error:', configValidation.error);
    return {
      success: false,
      error: configValidation.error,
    };
  }

  try {
    // 2. 清理Base64图片
    const cleanImage = cleanBase64Image(imageBase64);

    // 3. 构建提示词
    const stylePrompt = STYLE_PROMPTS[style] || STYLE_PROMPTS.japanese_anime;
    
    // 从faceAnalysis提取信息
    const colorAttributes = faceAnalysis?.colorAttributes;
    
    // 性别控制（最高优先级）
    let genderPrompt = '';
    if (genderForce) {
      genderPrompt = ` MUST be ${genderForce}, ${genderForce} face only, ${genderForce === 'male' ? 'masculine' : 'feminine'} features.`;
    } else if (faceAnalysis?.gender) {
      genderPrompt = ` Preserve original gender: ${faceAnalysis.gender}.`;
    }
    
    // 人种保留
    let ethnicityPrompt = '';
    if (faceAnalysis?.ethnicity && faceAnalysis.ethnicity !== 'unknown') {
      ethnicityPrompt = ` Maintain ${faceAnalysis.ethnicity} ethnic appearance.`;
    }
    
    // 颜色保留
    let colorPrompt = '';
    if (colorAttributes) {
      if (colorAttributes.skinTone !== 'unknown') {
        colorPrompt += ` Preserve skin tone: ${colorAttributes.skinTone} (${colorAttributes.skinColor}).`;
      }
      if (colorAttributes.hairColor !== 'unknown') {
        colorPrompt += ` Preserve hair color: ${colorAttributes.hairColor} (${colorAttributes.hairColorHex}).`;
      }
      if (colorAttributes.eyeColor !== 'unknown') {
        colorPrompt += ` Preserve eye color: ${colorAttributes.eyeColor} (${colorAttributes.eyeColorHex}).`;
      }
    }
    
    // 头发特征
    let hairPrompt = '';
    if (faceAnalysis) {
      if (faceAnalysis.hairLength !== 'unknown' && faceAnalysis.hairLength !== 'bald') {
        // black very_short 头发：贴头皮短发茬，用更具体的描述
        if (faceAnalysis.ethnicity === 'black' && faceAnalysis.hairLength === 'very_short') {
          hairPrompt += ` Very short natural hair (buzz cut style).`;
        } else {
          hairPrompt += ` Hair length: ${faceAnalysis.hairLength}.`;
        }
      }
      if (faceAnalysis.hairShape !== 'unknown') {
        hairPrompt += ` Hair texture: ${faceAnalysis.hairShape}.`;
      }
      if (faceAnalysis.hairBangs && faceAnalysis.hairBangsStyle !== 'unknown') {
        hairPrompt += ` Bangs style: ${faceAnalysis.hairBangsStyle}.`;
      }
    }

    // 配饰特征（眼镜、胡须）
    let accessoriesPrompt = '';
    if (faceAnalysis?.accessories) {
      const acc = faceAnalysis.accessories;
      if (acc.hasGlasses && acc.glassesType !== 'unknown') {
        accessoriesPrompt = `CRITICAL CONSTRAINT: The person is wearing ${acc.glassesType} glasses. You MUST preserve the glasses in the final image. DO NOT remove, omit, or stylize away the glasses. Glasses shape must match the original photo.`;
      }
      if (acc.hasBeard) {
        let beardDesc = `CRITICAL CONSTRAINT: The person has a ${acc.beardLength} beard`;
        if (acc.beardShape && acc.beardShape !== 'unknown') {
          beardDesc += ` (${acc.beardShape} texture`;
          if (acc.beardColor && acc.beardColor !== 'unknown' && acc.beardColor !== 'none') {
            beardDesc += `, ${acc.beardColor} color`;
          }
          beardDesc += ')';
        }
        beardDesc += '. You MUST preserve the beard in the final image. DO NOT remove, omit, or stylize away the beard.';
        accessoriesPrompt += ` ${beardDesc}`;
      }
    }
    
    // 构建完整提示词
    const prompt = `${accessoriesPrompt}${genderPrompt}${ethnicityPrompt}${colorPrompt}${hairPrompt} Style: ${stylePrompt} Transform: ${Math.round((1 - (styleStrength ?? STYLE_STRENGTH)) * 100)}% only.`.trim();
    
    // 对于黑人秃头，添加负向prompt防止AI生成头发
    let negativePrompt = '';
    if (faceAnalysis?.ethnicity === 'black' && faceAnalysis?.hairLength === 'bald') {
      negativePrompt = 'long hair, medium hair, short hair, any hair on head, hair strands, follicular hair, fuzzy head';
    }
    

    // 4. 构建请求体 - 符合MiniMax API格式
    // 添加控制参数以更好地保留人脸特征
    // 如果用户提供了faceSimilarity参数，则使用用户值，否则使用环境变量默认值
    const likenessStrength = faceSimilarity ?? FACE_SIMILARITY_STRENGTH;

    interface MiniMaxRequestBody {
      model: string;
      prompt: string;
      image: string;
      num_images: number;
      width: number;
      height: number;
      response_format: string;
      likeness_strength: number;
      style_strength: number;
      denoising_strength: number;
      face_preservation_weight: number;
      negative_prompt: string;
      auto_beauty: boolean;
      face_reshape: boolean;
      auto_face_correction: boolean;
      enhance_skin: boolean;
    }

    const requestBody: MiniMaxRequestBody = {
      model: MINIMAX_MODEL_ID,
      prompt: prompt,
      image: cleanImage,
      num_images: 1,
      width: 1024,
      height: 1024,
      response_format: 'base64',
      likeness_strength: likenessStrength,
      style_strength: styleStrength ?? STYLE_STRENGTH,
      denoising_strength: 0.35,
      face_preservation_weight: 0.95,
      negative_prompt: negativePrompt,
      auto_beauty: false,
      face_reshape: false,
      auto_face_correction: false,
      enhance_skin: false,
    };

    
    // 打印完整请求体（用于调试）
      ...requestBody,
      image: requestBody.image.substring(0, 50) + '... (truncated for log)',
    }));

    // 5. 调用MiniMax API（带重试机制）
    const { response, data } = await fetchWithRetry(
      `${MINIMAX_BASE_URL}/image_generation`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${MINIMAX_API_KEY}`,
        },
        body: JSON.stringify(requestBody),
      }
    );


    // 6. 处理错误响应
    if (!response.ok) {
      console.error('[MiniMax] API error response:', data);
      
      const err = data.error as Record<string, unknown> | undefined;
      const errorMessage = (err && typeof err === 'object' && 'message' in err)
        ? String(err.message)
        : data.message || data.error || `HTTP ${response.status}: ${response.statusText}`;
      
      return {
        success: false,
        error: `MiniMax API error: ${errorMessage}`,
      };
    }


    // 检查API返回的错误
    if (data.error) {
      console.error('[MiniMax] API returned error object:', data.error);
      return {
        success: false,
        error: (data.error as { message?: string }).message || String(data.error) || 'Generation failed',
      };
    }

    // 8. 提取图片数据 - MiniMax返回格式可能不同
    let imageUrl: string | undefined;
    
    // 定义MiniMax响应数据类型
    interface MiniMaxResponseData {
      image_base64?: string[];
      images?: { b64_image?: string }[];
      image?: string;
      b64_image?: string;
      processing_time?: number;
      processingTime?: number;
    }
    
    const responseData = data.data as MiniMaxResponseData | undefined;
    
    // 尝试多种可能的响应格式
    if (responseData?.image_base64?.[0]) {
      imageUrl = responseData.image_base64[0];
    } else if (responseData?.images?.[0]?.b64_image) {
      imageUrl = responseData.images[0].b64_image;
    } else if (data.b64_image) {
      imageUrl = data.b64_image as string;
    } else if (data.image) {
      imageUrl = data.image as string;
    } else if (responseData?.image) {
      imageUrl = responseData.image;
    }

    if (!imageUrl) {
      console.error('[MiniMax] No image found in response:', JSON.stringify(data).substring(0, 500));
      return {
        success: false,
        error: 'Invalid response from MiniMax API: missing image data',
      };
    }


    // 9. 返回成功结果
    return {
      success: true,
      data: {
        imageUrl: `data:image/png;base64,${imageUrl}`,
        processingTime: (responseData?.processing_time || responseData?.processingTime || 0) as number,
      },
    };
  } catch (error) {
    console.error('[MiniMax] Exception during API call:');
    console.error('[MiniMax] Error name:', error instanceof Error ? error.name : 'Unknown');
    console.error('[MiniMax] Error message:', error instanceof Error ? error.message : String(error));
    console.error('[MiniMax] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred during generation',
    };
  }
}

/**
 * 获取API健康状态
 */
export async function checkApiHealth(): Promise<boolean> {
  if (!MINIMAX_API_KEY) return false;

  try {
    const response = await fetch(`${MINIMAX_BASE_URL}/health`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${MINIMAX_API_KEY}`,
      },
    });

    return response.ok;
  } catch {
    return false;
  }
}