import { NextResponse } from 'next/server';
import { generateCartoonAvatar } from '@/lib/minimax';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { CartoonStyle, GenerateRequest, ApiResponse, GenerateResponseData } from '@/lib/types';
import { ERROR_MESSAGES } from '@/lib/constants';
import { createRateLimiter, RATE_LIMITS } from '@/lib/rateLimit';

/**
 * POST /api/generate
 * 生成卡通头像API
 *
 * 功能：
 * 1. 验证用户登录状态
 * 2. 检查用户剩余次数
 * 3. 调用MiniMax API生成图片（仅在成功后才扣减次数）
 * 4. 保存生成记录到历史
 */
export async function POST(request: Request) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[Generate API ${requestId}] Starting request`);

  // ========== Rate Limiting 检查 ==========
  const checkRateLimit = createRateLimiter(RATE_LIMITS.generate);
  const rateLimitResponse = checkRateLimit(request);
  if (rateLimitResponse) {
    console.log(`[Generate API ${requestId}] Rate limit exceeded`);
    return rateLimitResponse;
  }
  console.log(`[Generate API ${requestId}] Rate limit check passed`);

  try {
    // ========== 1. 创建Supabase客户端 ==========
    const supabase = await createClient();
    const adminClient = createAdminClient();

    // ========== 2. 验证用户认证 ==========
    console.log(`[Generate API ${requestId}] Step 1: Verifying user authentication`);
    
    // ========== 2.1 CSRF保护验证 ==========
    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    const host = request.headers.get('host');
    
    // 验证请求来源是否合法（防止CSRF攻击）
    // 仅在生产环境执行此检查
    if (process.env.NODE_ENV === 'production') {
      const allowedOrigins = [
        process.env.NEXT_PUBLIC_BASE_URL,
        `http://${host}`,
        `https://${host}`,
      ].filter(Boolean);
      
      const isValidOrigin = origin && allowedOrigins.some(allowed => 
        allowed && (origin === allowed || origin.startsWith(`${allowed}/`))
      );
      const isValidReferer = referer && allowedOrigins.some(allowed =>
        allowed && referer.startsWith(allowed)
      );
      
      if (!isValidOrigin && !isValidReferer) {
        console.log(`[Generate API ${requestId}] Invalid origin/referer: origin=${origin}, referer=${referer}`);
        return NextResponse.json<ApiResponse<GenerateResponseData>>(
          { success: false, error: 'Invalid request origin' },
          { status: 403 }
        );
      }
    }
    console.log(`[Generate API ${requestId}] CSRF check passed`);
    
    // ========== 2.2 获取用户会话 ==========
    // 使用 @supabase/ssr 创建的客户端会自动从 cookie 中获取认证信息
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError) {
      console.error(`[Generate API ${requestId}] Auth error:`, authError);
    }
    
    if (!user) {
      console.log(`[Generate API ${requestId}] No authenticated user found`);
      return NextResponse.json<ApiResponse<GenerateResponseData>>(
        { success: false, error: 'Please login first' },
        { status: 401 }
      );
    }
    console.log(`[Generate API ${requestId}] User authenticated:`, user.id);

    // ========== 3. 获取并检查用户资料 ==========
    // 使用普通客户端（带 RLS），@supabase/ssr 会自动传递认证上下文
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error(`[Generate API ${requestId}] Profile fetch error:`, profileError);
    }

    if (!profile) {
      console.log(`[Generate API ${requestId}] Profile not found for user:`, user.id);
      return NextResponse.json<ApiResponse<GenerateResponseData>>(
        { success: false, error: 'User profile not found' },
        { status: 404 }
      );
    }
    console.log(`[Generate API ${requestId}] Profile found, credits:`, profile.credits, 'is_premium:', profile.is_premium);

    // ========== 4. 检查用户次数（Premium用户无限次） ==========
    if (!profile.is_premium && profile.credits <= 0) {
      console.log(`[Generate API ${requestId}] User has no credits remaining`);
      return NextResponse.json<ApiResponse<GenerateResponseData>>(
        { success: false, error: 'Insufficient credits. Please upgrade your plan.' },
        { status: 403 }
      );
    }

    // ========== 5. 解析请求体 ==========
    console.log(`[Generate API ${requestId}] Step 3: Parsing request body`);
    let body: GenerateRequest;
    try {
      body = await request.json();
      console.log(`[Generate API ${requestId}] Request body parsed, image length:`, body.image?.length, 'style:', body.style);
    } catch (parseError) {
      console.error(`[Generate API ${requestId}] JSON parse error:`, parseError);
      return NextResponse.json<ApiResponse<GenerateResponseData>>(
        { success: false, error: 'Invalid request format' },
        { status: 400 }
      );
    }

    // ========== 6. 参数校验 ==========
    if (!body.image) {
      console.log(`[Generate API ${requestId}] No image provided in request`);
      return NextResponse.json<ApiResponse<GenerateResponseData>>(
        { success: false, error: ERROR_MESSAGES.NO_IMAGE },
        { status: 400 }
      );
    }

    if (!body.style) {
      console.log(`[Generate API ${requestId}] No style provided in request`);
      return NextResponse.json<ApiResponse<GenerateResponseData>>(
        { success: false, error: ERROR_MESSAGES.NO_STYLE },
        { status: 400 }
      );
    }

    // 验证风格值（13套标准化风格）
    const validStyles: CartoonStyle[] = [
      'pixar_3d_cartoon',
      'american_retro_cartoon',
      'cyberpunk_neon',
      'minimal_illustration',
      'japanese_anime',
      'korean_soft_portrait',
      'japanese_watercolor',
      'gothic_dark',
      'vintage_pixel',
      'oil_painting',
      'steampunk_vintage',
      'chibi_q_version',
      'street_sport',
    ];
    if (!validStyles.includes(body.style)) {
      console.log(`[Generate API ${requestId}] Invalid style:`, body.style);
      return NextResponse.json<ApiResponse<GenerateResponseData>>(
        { success: false, error: 'Invalid style. Please select a valid style.' },
        { status: 400 }
      );
    }

    // ========== 7. 读取动态扣点配置 ==========
    console.log(`[Generate API ${requestId}] Step 4: Reading credits_per_generation setting`);
    let creditsToDeduct = 1; // 默认值
    try {
      const { data: settingData, error: settingError } = await adminClient
        .from('app_settings')
        .select('value')
        .eq('key', 'credits_per_generation')
        .single();
      
      if (settingError) {
        console.error(`[Generate API ${requestId}] Failed to read credits_per_generation:`, settingError);
      } else if (settingData?.value) {
        creditsToDeduct = typeof settingData.value === 'number' ? settingData.value : parseInt(String(settingData.value), 10) || 1;
        console.log(`[Generate API ${requestId}] credits_per_generation:`, creditsToDeduct);
      }
    } catch (err) {
      console.error(`[Generate API ${requestId}] Error reading credits_per_generation:`, err);
      creditsToDeduct = 1; // 容错：读取失败时使用默认值
    }

    // ========== 8. 调用MiniMax API生成图片 ==========
    console.log(`[Generate API ${requestId}] Step 5: Calling MiniMax API`);
    
    // 读取用户可选参数
    const userFaceSimilarity = body.faceSimilarity;
    const userStyleStrength = body.styleStrength;
    const userFidelity = body.fidelity;
    
    if (userFaceSimilarity !== undefined) {
      const clampedSimilarity = Math.max(0.5, Math.min(1.0, userFaceSimilarity));
      console.log(`[Generate API ${requestId}] User provided faceSimilarity: ${userFaceSimilarity}, clamped to: ${clampedSimilarity}`);
    }
    
    if (userStyleStrength !== undefined) {
      const clampedStyleStrength = Math.max(0, Math.min(1, userStyleStrength));
      console.log(`[Generate API ${requestId}] User provided styleStrength: ${userStyleStrength}, clamped to: ${clampedStyleStrength}`);
    }
    
    if (userFidelity !== undefined) {
      const clampedFidelity = Math.max(0, Math.min(1, userFidelity));
      console.log(`[Generate API ${requestId}] User provided fidelity: ${userFidelity}, clamped to: ${clampedFidelity}`);
    }
    
    const result = await generateCartoonAvatar(
      body.image,
      body.style,
      userFaceSimilarity,
      userStyleStrength,
      userFidelity,
      body.genderForce,
      body.faceAnalysis
    );
    console.log(`[Generate API ${requestId}] MiniMax result:`, JSON.stringify(result).substring(0, 200));

    // ========== 9. 仅在API成功时扣减次数并保存记录 ==========
    if (result.success && result.data) {
      console.log(`[Generate API ${requestId}] Generation successful, processing credits and saving record`);

      // 9.1 扣减用户次数（非Premium用户）- 仅在成功后执行，使用动态值
      // 使用条件更新防止竞态条件：只有余额足够时才扣减
      if (!profile.is_premium) {
        console.log(`[Generate API ${requestId}] Decrementing ${creditsToDeduct} credits from:`, profile.credits);
        
        // 原子性条件更新：如果当前余额仍足够，则扣减
        // 如果另一个请求已扣减，.gte条件不满足则更新失败
        const { error: updateError } = await adminClient
          .from('profiles')
          .update({ credits: profile.credits - creditsToDeduct })
          .eq('id', user.id)
          .gte('credits', creditsToDeduct);

        if (updateError) {
          console.error(`[Generate API ${requestId}] Failed to decrement credits:`, updateError);
        } else {
          // 检查是否有行被更新（如果没有，说明余额已被其他请求扣减）
          console.log(`[Generate API ${requestId}] Credits decremented successfully`);
        }
      }

      // 8.2 保存生成记录（仅保留最近10条，自动清理旧记录）
      // 检查用户当前生成记录数量
      const { count: currentCount } = await adminClient
        .from('generations')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      console.log(`[Generate API ${requestId}] User has ${currentCount} generation records`);

      // 插入新记录
      const { error: insertError } = await adminClient
        .from('generations')
        .insert({
          user_id: user.id,
          // 不再存储原图的Base64，只存储风格和生成结果URL作为参考
          // 原图由用户本地缓存，生成的图片URL可重新访问
          original_image: `style:${body.style}`, // 仅保存风格作为标识
          generated_image: result.data.imageUrl,
          style: body.style,
        });

      if (insertError) {
        console.error(`[Generate API ${requestId}] Failed to save generation record:`, insertError);
        // 不影响生成流程，仅记录错误
      } else {
        console.log(`[Generate API ${requestId}] Generation record saved successfully`);
      }

      // 清理旧记录：只保留最近10条
      if (currentCount !== null && currentCount >= 10) {
        console.log(`[Generate API ${requestId}] Cleaning up old records (keeping only 10 most recent)`);

        // 查询该用户的旧记录（按时间倒序，跳过前10条，删除其余）
        const { data: oldRecords, error: fetchOldError } = await adminClient
          .from('generations')
          .select('id, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .range(10, currentCount); // 跳过前10条，获取第11条及之后的记录

        if (fetchOldError) {
          console.error(`[Generate API ${requestId}] Failed to fetch old records for cleanup:`, fetchOldError);
        } else if (oldRecords && oldRecords.length > 0) {
          const oldRecordIds = oldRecords.map((r: { id: string }) => r.id);
          const { error: deleteError } = await adminClient
            .from('generations')
            .delete()
            .in('id', oldRecordIds);

          if (deleteError) {
            console.error(`[Generate API ${requestId}] Failed to delete old records:`, deleteError);
          } else {
            console.log(`[Generate API ${requestId}] Successfully deleted ${oldRecordIds.length} old records`);
          }
        }
      }

      // 8.3 更新风格使用统计
      const today = new Date().toISOString().split('T')[0];
      const { error: statsError } = await adminClient
        .from('style_usage_stats')
        .upsert(
          {
            style_name: body.style,
            stat_date: today,
            usage_count: 1,
          },
          {
            onConflict: 'style_name,stat_date',
            ignoreDuplicates: false,
          }
        );

      if (statsError) {
        console.error(`[Generate API ${requestId}] Failed to update style stats:`, statsError);
        // 不影响生成流程，仅记录错误
      } else {
        console.log(`[Generate API ${requestId}] Style usage stats updated for:`, body.style, 'on', today);
      }

      return NextResponse.json<ApiResponse<GenerateResponseData>>(result, { status: 200 });
    } else {
      // API调用失败 - 不扣减次数
      console.log(`[Generate API ${requestId}] Generation failed, NOT decrementing credits`);
      const errorMessage = result.error || ERROR_MESSAGES.GENERATION_FAILED;
      console.log(`[Generate API ${requestId}] Error message:`, errorMessage);
      
      return NextResponse.json<ApiResponse<GenerateResponseData>>(
        { success: false, error: errorMessage },
        { status: 500 }
      );
    }
  } catch (error) {
    // 捕获所有意外错误
    console.error(`[Generate API ${requestId}] Unexpected error:`);
    console.error(`[Generate API ${requestId}] Error name:`, error instanceof Error ? error.name : 'Unknown');
    console.error(`[Generate API ${requestId}] Error message:`, error instanceof Error ? error.message : String(error));
    console.error(`[Generate API ${requestId}] Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
    
    // 判断是否为超时错误
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTimeoutError = 
      errorMessage.includes('timeout') || 
      errorMessage.includes('Timeout') ||
      error instanceof Error && error.name === 'AbortError';
    
    if (isTimeoutError) {
      console.log(`[Generate API ${requestId}] Timeout error detected, returning user-friendly message`);
      return NextResponse.json<ApiResponse<GenerateResponseData>>(
        { success: false, error: ERROR_MESSAGES.TIMEOUT },
        { status: 503 }
      );
    }
    
    return NextResponse.json<ApiResponse<GenerateResponseData>>(
      { success: false, error: ERROR_MESSAGES.API_ERROR },
      { status: 500 }
    );
  }
}

/**
 * GET /api/generate
 * API健康检查
 */
export async function GET() {
  console.log('[Generate API] Health check requested');
  return NextResponse.json({
    status: 'ok',
    message: 'AI Cartoon Avatar Generator API',
    timestamp: new Date().toISOString(),
    endpoints: {
      POST: '/api/generate - Generate cartoon avatar',
      GET: '/api/generate - API health check',
    },
  });
}