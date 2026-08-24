/**
 * app/api/image-proxy/route.ts
 * Next.js 图片代理接口 — 解决 Canvas 跨域污染问题
 * 
 * 远程图片直接加载进 Canvas 会触发 tainted canvas，无法导出图片。
 * 本接口中转远程图片资源，附加 CORS 头，浏览器视为同源请求。
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url');

    if (!url) {
      return NextResponse.json({ error: 'url parameter is required' }, { status: 400 });
    }

    // 防止 SSRF：只允许 https 和 data 协议
    if (!url.startsWith('data:') && !url.startsWith('https://')) {
      return NextResponse.json({ error: 'Only https:// and data: URLs are allowed' }, { status: 400 });
    }

    const response = await fetch(url, {
      headers: { 'User-Agent': 'MagicCartoonAvatar/1.0' },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch image: ${response.status}` },
        { status: 502 }
      );
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    const arrayBuffer = await response.arrayBuffer();

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('[ImageProxy] Error:', error);
    return NextResponse.json({ error: 'Image proxy failed' }, { status: 500 });
  }
}