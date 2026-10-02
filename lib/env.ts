/**
 * lib/env.ts
 * 环境变量验证模块
 * 启动时检查必要的环境变量配置是否完整
 */

/**
 * 必填环境变量列表
 */
const REQUIRED_ENV_VARS = [
  // MiniMax API
  'MINIMAX_API_KEY',
  
  // Supabase
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

/**
 * 可选环境变量列表（带默认值）
 */
const OPTIONAL_ENV_VARS = [
  'NEXT_PUBLIC_BASE_URL',
  'MINIMAX_BASE_URL',
  'MINIMAX_MODEL_ID',
  'FACE_SIMILARITY_STRENGTH',
  'STYLE_STRENGTH',
  'FIDELITY',
  'DODO_PAYMENTS_API_KEY',
  'DODO_PAYMENTS_WEBHOOK_KEY',
  'DODO_PAYMENTS_ENVIRONMENT',
] as const;

/**
 * 环境变量验证错误
 */
export interface EnvValidationError {
  variable: string;
  message: string;
}

/**
 * 环境变量验证结果
 */
export interface EnvValidationResult {
  valid: boolean;
  errors: EnvValidationError[];
  warnings: string[];
}

/**
 * 验证必填环境变量
 */
export function validateEnvironment(): EnvValidationResult {
  const errors: EnvValidationError[] = [];
  const warnings: string[] = [];

  // 检查必填变量
  for (const varName of REQUIRED_ENV_VARS) {
    const value = process.env[varName];
    
    if (!value) {
      errors.push({
        variable: varName,
        message: `${varName} is not set. Please add it to .env.local`,
      });
    } else if (value.length < 10 && varName.includes('KEY')) {
      errors.push({
        variable: varName,
        message: `${varName} appears to be invalid (too short). Please check your configuration.`,
      });
    }
  }

  // 检查可选变量并提供默认值警告
  for (const varName of OPTIONAL_ENV_VARS) {
    const value = process.env[varName];
    if (!value) {
      warnings.push(`${varName} is not set. Using default value.`);
    }
  }

  // Base URL验证
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (baseUrl) {
    try {
      const url = new URL(baseUrl);
      if (!url.protocol.match(/^https?$/)) {
        errors.push({
          variable: 'NEXT_PUBLIC_BASE_URL',
          message: 'NEXT_PUBLIC_BASE_URL must use http or https protocol',
        });
      }
    } catch {
      errors.push({
        variable: 'NEXT_PUBLIC_BASE_URL',
        message: 'NEXT_PUBLIC_BASE_URL is not a valid URL',
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 打印环境变量校验结果（由调用方自行决定在何处调用，如启动检查）
 */
export function logEnvironmentStatus(): void {
  const result = validateEnvironment();

  for (const error of result.errors) {
    console.error(`[Env] ${error.variable}: ${error.message}`);
  }

  for (const warning of result.warnings) {
    console.warn(`[Env] ${warning}`);
  }
}

/**
 * 检查DodoPayment是否配置
 */
export function isDodoPaymentConfigured(): boolean {
  return !!process.env.DODO_PAYMENTS_API_KEY;
}

/**
 * 检查MiniMax是否配置
 */
export function isMiniMaxConfigured(): boolean {
  const apiKey = process.env.MINIMAX_API_KEY;
  return !!apiKey && apiKey.length >= 10;
}

/**
 * 检查Supabase是否配置
 */
export function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}