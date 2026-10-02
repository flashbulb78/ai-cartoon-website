/**
 * lib/hostAllowlist.ts
 * 图片代理的目标地址白名单校验
 *
 * 本模块从 /api/image-proxy 中抽离，原因：
 *   1. 这是安全关键逻辑（决定"服务器允许替用户访问哪些地址"），必须可独立测试
 *   2. 路由文件不便于单元测试，纯函数便于直接验证
 *
 * 校验顺序：
 *   1. 必须是合法 URL
 *   2. 必须是 https（杜绝内网 http 地址）
 *   3. 主机名不能是 IP 字面量 / 本机 / 内网域名
 *   4. 主机名必须命中白名单（支持子域）
 */

/**
 * 默认可访问域名（含其子域）
 * 需要扩展时通过环境变量 IMAGE_PROXY_ALLOWED_HOSTS 追加（逗号分隔）
 */
export const DEFAULT_ALLOWED_HOSTS: readonly string[] = [
  'minimaxi.com',
  'minimax.io',
  'minimax.chat',
  'aliyuncs.com', // 对象存储 / 图片 CDN
];

/**
 * 读取生效的白名单（默认 + 环境变量扩展）
 */
export function getAllowedHosts(): string[] {
  const extra = (process.env.IMAGE_PROXY_ALLOWED_HOSTS || '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  return [...DEFAULT_ALLOWED_HOSTS, ...extra];
}

/**
 * 是否为「不应被代理访问」的地址（IP 字面量 / 本机 / 内网域名）
 */
export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();

  // IPv4 字面量（含云元数据地址 169.254.169.254）
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;

  // IPv6 字面量（URL.hostname 会保留方括号）
  if (host.includes(':') || host.startsWith('[')) return true;

  // 本机 / 内网域名后缀
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.endsWith('.local') || host.endsWith('.internal')) return true;

  return false;
}

/**
 * 是否命中白名单（支持子域匹配）
 * 注意：使用的是 `.` + 域名 的后缀匹配，因此 "minimaxi.com.evil.com"、
 *      "xminimaxi.com" 这类伪装域名都不会被放行。
 */
export function isAllowedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();

  if (isBlockedHostname(host)) return false;

  return getAllowedHosts().some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

export type ProxyTargetResult =
  | { ok: true; url: URL }
  | { ok: false; status: number; error: string };

/**
 * 校验代理目标地址，返回可直接用于响应的错误信息
 */
export function validateProxyTarget(rawUrl: string | null): ProxyTargetResult {
  if (!rawUrl) {
    return { ok: false, status: 400, error: 'url parameter is required' };
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, status: 400, error: 'Invalid url' };
  }

  if (url.protocol !== 'https:') {
    return { ok: false, status: 400, error: 'Only https:// URLs are allowed' };
  }

  if (!isAllowedHostname(url.hostname)) {
    return { ok: false, status: 403, error: 'Host not allowed' };
  }

  return { ok: true, url };
}
