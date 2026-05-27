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
  console.log('[MiniMax] Starting avatar generation request');
  console.log('[MiniMax] Style:', style);
  console.log('[MiniMax] Image base64 length:', imageBase64.length);

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
    console.log('[MiniMax] Original image starts with:', imageBase64.substring(0, 50));
    const cleanImage = cleanBase64Image(imageBase64);
    console.log('[MiniMax] Cleaned image starts with:', cleanImage.substring(0, 50));
    console.log('[MiniMax] Cleaned image base64 length:', cleanImage.length);

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
        hairPrompt += ` Hair length: ${faceAnalysis.hairLength}.`;
      }
      if (faceAnalysis.hairShape !== 'unknown') {
        hairPrompt += ` Hair texture: ${faceAnalysis.hairShape}.`;
      }
      if (faceAnalysis.hairBangs && faceAnalysis.hairBangsStyle !== 'unknown') {
        hairPrompt += ` Bangs style: ${faceAnalysis.hairBangsStyle}.`;
      }
    }
    
    // 构建完整提示词
    const prompt = `${genderPrompt}${ethnicityPrompt}${colorPrompt}${hairPrompt} Style: ${stylePrompt} Transform: ${Math.round((1 - (styleStrength ?? STYLE_STRENGTH)) * 100)}% only.`.trim();
    
    console.log('[MiniMax] Generated prompt:', prompt.substring(0, 150) + '...');
    console.log('[MiniMax] Face similarity strength:', FACE_SIMILARITY_STRENGTH);
    console.log('[MiniMax] Style strength:', STYLE_STRENGTH);

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
      negative_prompt: '',
      auto_beauty: false,
      face_reshape: false,
      auto_face_correction: false,
      enhance_skin: false,
    };

    console.log('[MiniMax] Request body keys:', Object.keys(requestBody));
    console.log('[MiniMax] Request body model:', requestBody.model);
    console.log('[MiniMax] Request body prompt length:', requestBody.prompt.length);
    console.log('[MiniMax] Request body image length:', requestBody.image.length);
    console.log('[MiniMax] API Endpoint:', `${MINIMAX_BASE_URL}/image_generation`);
    
    // 打印完整请求体（用于调试）
    console.log('[MiniMax] Full request body:', JSON.stringify({
      ...requestBody,
      image: requestBody.image.substring(0, 50) + '... (truncated for log)',
    }));

    // 5. 调用MiniMax API
    const response = await fetch(`${MINIMAX_BASE_URL}/image_generation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MINIMAX_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    console.log('[MiniMax] Response status:', response.status);
    console.log('[MiniMax] Response ok:', response.ok);

    // 6. 处理错误响应
    if (!response.ok) {
      let errorData: Record<string, unknown> = {};
      try {
        errorData = await response.json();
      } catch {
        console.log('[MiniMax] Could not parse error response as JSON');
      }
      
      console.error('[MiniMax] API error response:', errorData);
      
      const err = errorData.error;
      const errorMessage = (typeof err === 'object' && err !== null && 'message' in err)
        ? String(err.message)
        : errorData.message || errorData.error || `HTTP ${response.status}: ${response.statusText}`;
      
      return {
        success: false,
        error: `MiniMax API error: ${errorMessage}`,
      };
    }

    // 7. 解析成功响应
    const data = await response.json();
    console.log('[MiniMax] Response data keys:', Object.keys(data));
    console.log('[MiniMax] Response data:', JSON.stringify(data).substring(0, 300));

    // 检查API返回的错误
    if (data.error) {
      console.error('[MiniMax] API returned error object:', data.error);
      return {
        success: false,
        error: data.error.message || data.error || 'Generation failed',
      };
    }

    // 8. 提取图片数据 - MiniMax返回格式可能不同
    let imageUrl: string | undefined;
    
    // 尝试多种可能的响应格式
    if (data.data?.image_base64?.[0]) {
      imageUrl = data.data.image_base64[0];
      console.log('[MiniMax] Found image in data.image_base64[0]');
    } else if (data.data?.images?.[0]?.b64_image) {
      imageUrl = data.data.images[0].b64_image;
      console.log('[MiniMax] Found image in data.images[0].b64_image');
    } else if (data.b64_image) {
      imageUrl = data.b64_image;
      console.log('[MiniMax] Found image in b64_image');
    } else if (data.image) {
      imageUrl = data.image;
      console.log('[MiniMax] Found image in image field');
    } else if (data.data?.image) {
      imageUrl = data.data.image;
      console.log('[MiniMax] Found image in data.image');
    }

    if (!imageUrl) {
      console.error('[MiniMax] No image found in response:', JSON.stringify(data).substring(0, 500));
      return {
        success: false,
        error: 'Invalid response from MiniMax API: missing image data',
      };
    }

    console.log('[MiniMax] Successfully extracted image, length:', imageUrl.length);

    // 9. 返回成功结果
    return {
      success: true,
      data: {
        imageUrl: `data:image/png;base64,${imageUrl}`,
        processingTime: data.processing_time || data.processingTime || 0,
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