/**
 * lib/ip-parse.ts
 * IP地址解析和设备类型识别工具函数
 * 用于从请求头提取真实IP、解析地理位置、识别设备类型
 */

import type { NextRequest } from 'next/server';

/**
 * 从请求头提取真实IP地址
 * 兼容 Vercel 部署环境，正确处理 x-forwarded-for
 * @param request Next.js 请求对象
 * @returns 真实公网IP或null
 */
export function getClientIp(request: NextRequest): string | null {
  // Vercel 环境下的请求头
  const vercelHeaders = {
    'x-forwarded-for': request.headers.get('x-forwarded-for'),
    'x-real-ip': request.headers.get('x-real-ip'),
    'x-vercel-forwarded-for': request.headers.get('x-vercel-forwarded-for'),
    'x-vercel-ip-country': request.headers.get('x-vercel-ip-country'),
    'cf-connecting-ip': request.headers.get('cf-connecting-ip'), // Cloudflare
  };

  // 1. 优先使用 CF-Connecting-IP（Cloudflare代理）
  if (vercelHeaders['cf-connecting-ip']) {
    return extractFirstIp(vercelHeaders['cf-connecting-ip']);
  }

  // 2. 使用 x-vercel-forwarded-for（Vercel代理）
  if (vercelHeaders['x-vercel-forwarded-for']) {
    return extractFirstIp(vercelHeaders['x-vercel-forwarded-for']);
  }

  // 3. 使用 x-forwarded-for（通用代理）
  if (vercelHeaders['x-forwarded-for']) {
    return extractFirstIp(vercelHeaders['x-forwarded-for']);
  }

  // 4. 使用 x-real-ip（nginx代理）
  if (vercelHeaders['x-real-ip']) {
    return extractFirstIp(vercelHeaders['x-real-ip']);
  }

  return null;
}

/**
 * 从逗号分隔的IP列表中提取第一个IP（最原始的客户端IP）
 */
function extractFirstIp(ipString: string): string | null {
  if (!ipString) return null;
  
  const ips = ipString.split(',').map(ip => ip.trim());
  const firstIp = ips[0];
  
  // 过滤内网IP
  if (isPrivateIp(firstIp)) {
    // 如果第一个是内网IP，尝试返回第二个（可能是真实IP）
    if (ips.length > 1 && !isPrivateIp(ips[1])) {
      return ips[1];
    }
    return null;
  }
  
  return firstIp;
}

/**
 * 判断是否为内网IP地址
 * 10.0.0.0 - 10.255.255.255
 * 172.16.0.0 - 172.31.255.255
 * 192.168.0.0 - 192.168.255.255
 * 127.0.0.0 - 127.255.255.255
 */
export function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return true;
  
  const [a, b] = parts;
  
  // 127.x.x.x (loopback)
  if (a === 127) return true;
  
  // 10.x.x.x
  if (a === 10) return true;
  
  // 172.16.x.x - 172.31.x.x
  if (a === 172 && b >= 16 && b <= 31) return true;
  
  // 192.168.x.x
  if (a === 192 && b === 168) return true;
  
  // 169.254.x.x (link-local)
  if (a === 169 && b === 254) return true;
  
  return false;
}

/**
 * 根据User-Agent识别设备类型
 * @param userAgent 浏览器的User-Agent字符串
 * @returns PC | Mobile | Tablet | Unknown
 */
export function getDeviceType(userAgent: string | null): 'PC' | 'Mobile' | 'Tablet' | 'Unknown' {
  if (!userAgent) return 'Unknown';
  
  const ua = userAgent.toLowerCase();
  
  // 平板检测（需要在手机之前，因为平板UA通常也包含mobile关键词）
  const tablets = [
    'ipad',
    'android tablet',
    'tablet',
    'kindle',
    'silk',
    'playbook',
  ];
  
  for (const tablet of tablets) {
    if (ua.includes(tablet)) {
      return 'Tablet';
    }
  }
  
  // 手机检测
  const mobiles = [
    'mobile',
    'android',
    'iphone',
    'ipod',
    'windows phone',
    'blackberry',
    'opera mini',
    'opera mobi',
    'webos',
    'fennec',
    'iemobile',
  ];
  
  for (const mobile of mobiles) {
    if (ua.includes(mobile)) {
      return 'Mobile';
    }
  }
  
  // 机器人检测（不算设备）
  const bots = [
    'bot', 'crawler', 'spider', 'googlebot', 'bingbot', 'yandexbot',
    'slurp', 'duckduckbot', 'baiduspider', 'facebookexternalhit',
  ];
  
  for (const bot of bots) {
    if (ua.includes(bot)) {
      return 'Unknown';
    }
  }
  
  // 默认PC
  return 'PC';
}

/**
 * 简化版IP地理位置解析
 * 注意：这是基于已知IP段的简化判断，生产环境建议使用专业的IP库
 * @param ip IP地址
 * @param countryCode 国家代码（Vercel或CDN提供）
 * @returns 粗略地理位置描述
 */
export function parseGeoLocation(ip: string | null, countryCode: string | null): string {
  // 如果有国家代码，优先使用
  if (countryCode) {
    const countryNames: Record<string, string> = {
      'US': '美国',
      'CN': '中国',
      'JP': '日本',
      'KR': '韩国',
      'GB': '英国',
      'DE': '德国',
      'FR': '法国',
      'IN': '印度',
      'BR': '巴西',
      'AU': '澳大利亚',
      'CA': '加拿大',
      'SG': '新加坡',
      'HK': '香港',
      'TW': '台湾',
    };
    return countryNames[countryCode.toUpperCase()] || countryCode.toUpperCase();
  }
  
  // 无法确定地理位置
  if (!ip) return '未知';
  
  // 简化的IP段判断（仅用于演示）
  // 实际生产环境应使用专业的IP库如 geoip-lite
  return '未知';
}

/**
 * 从User-Agent提取浏览器信息
 */
export function parseBrowser(userAgent: string | null): string {
  if (!userAgent) return 'Unknown';
  
  const ua = userAgent.toLowerCase();
  
  if (ua.includes('edge')) return 'Edge';
  if (ua.includes('edg/')) return 'Edge';
  if (ua.includes('chrome') && !ua.includes('chromium')) return 'Chrome';
  if (ua.includes('safari') && !ua.includes('chrome')) return 'Safari';
  if (ua.includes('firefox')) return 'Firefox';
  if (ua.includes('msie') || ua.includes('trident/')) return 'IE';
  if (ua.includes('opera') || ua.includes('opr/')) return 'Opera';
  if (ua.includes('chromium')) return 'Chromium';
  
  return 'Other';
}

/**
 * 从User-Agent提取操作系统
 */
export function parseOS(userAgent: string | null): string {
  if (!userAgent) return 'Unknown';
  
  const ua = userAgent.toLowerCase();
  
  if (ua.includes('windows nt 10')) return 'Windows 10';
  if (ua.includes('windows nt 6.3')) return 'Windows 8.1';
  if (ua.includes('windows nt 6.2')) return 'Windows 8';
  if (ua.includes('windows nt 6.1')) return 'Windows 7';
  if (ua.includes('windows')) return 'Windows';
  if (ua.includes('mac os x')) return 'macOS';
  if (ua.includes('iphone') || ua.includes('ipad')) return 'iOS';
  if (ua.includes('android')) return 'Android';
  if (ua.includes('linux')) return 'Linux';
  if (ua.includes('ubuntu')) return 'Ubuntu';
  
  return 'Other';
}

/**
 * 生成会话ID
 */
export function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}