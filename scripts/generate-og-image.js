/* eslint-disable @typescript-eslint/no-require-imports -- 本脚本直接在 Node 上运行（CommonJS），必须使用 require */
/**
 * scripts/generate-og-image.js
 * 生成社交分享图（Open Graph image）：public/og.png（1200×630）
 *
 * 用途：分享到微信 / Twitter / Discord / Facebook 时的预览卡片，
 *       不生成的话分享出去就是一张空白卡片。
 *
 * 依赖：sharp —— 它是 Next.js 的**可选依赖**，本地 node_modules 中通常已具备，
 *       因此无需在 package.json 中声明（若报错找不到 sharp，执行 npm i -D sharp）。
 *
 * 运行：node scripts/generate-og-image.js
 *
 * 说明：素材取自现有的 logo_192.png 与 samples/example.png（后者实为 JPEG），
 *       文字用 SVG 渲染后再由 sharp 栅格化。
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const AVATAR = path.join(ROOT, 'public/samples/example.png');
const LOGO = path.join(ROOT, 'public/logo_192.png');
const OUTPUT = path.join(ROOT, 'public/og.png');

const avatarDataUri = `data:image/jpeg;base64,${fs.readFileSync(AVATAR).toString('base64')}`;
const logoDataUri = `data:image/png;base64,${fs.readFileSync(LOGO).toString('base64')}`;

const FONT = 'Helvetica, Arial, sans-serif';

const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f8fbff"/>
      <stop offset="55%" stop-color="#e8f0ff"/>
      <stop offset="100%" stop-color="#d8e6ff"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#fbbf24"/>
      <stop offset="100%" stop-color="#fb923c"/>
    </linearGradient>
    <clipPath id="avatarClip"><rect x="742" y="132" width="368" height="368" rx="46"/></clipPath>
    <clipPath id="logoClip"><rect x="80" y="74" width="90" height="90" rx="22"/></clipPath>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="14" stdDeviation="20" flood-color="#1e3a8a" flood-opacity="0.20"/>
    </filter>
  </defs>

  <!-- 背景与装饰 -->
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1120" cy="80" r="170" fill="#3b82f6" opacity="0.07"/>
  <circle cx="120" cy="620" r="190" fill="#3b82f6" opacity="0.06"/>

  <!-- 顶部品牌区 -->
  <image x="80" y="74" width="90" height="90" clip-path="url(#logoClip)" xlink:href="${logoDataUri}"/>
  <text x="190" y="126" font-family="${FONT}" font-size="40" font-weight="bold" fill="#0f172a">Magic Cartoon Avatar</text>
  <text x="191" y="158" font-family="${FONT}" font-size="21" fill="#64748b">AI Cartoon Avatar Generator</text>

  <!-- 主标题（字号 50：精确测量后，50px 时最长行右边界 674px，距头像 68px，视觉舒适。
       此前 60px 时右边界达 793px，实际已压到右下角头像上 51px） -->
  <text x="80" y="316" font-family="${FONT}" font-size="50" font-weight="bold" fill="#0f172a">Turn your photos into</text>
  <text x="80" y="378" font-family="${FONT}" font-size="50" font-weight="bold" fill="#2563eb">stunning cartoon avatars</text>

  <!-- 副标题 -->
  <text x="80" y="440" font-family="${FONT}" font-size="26" fill="#475569">Pixar · Anime · Cyberpunk · and 10 more styles</text>

  <!-- 促销胶囊 -->
  <rect x="80" y="480" width="578" height="62" rx="31" fill="url(#accent)" opacity="0.22"/>
  <rect x="80" y="480" width="578" height="62" rx="31" fill="none" stroke="#f59e0b" stroke-opacity="0.45" stroke-width="2"/>
  <text x="108" y="520" font-family="${FONT}" font-size="25" font-weight="bold" fill="#b45309">New users get 2 FREE avatar generations</text>

  <!-- 示例头像 -->
  <g filter="url(#shadow)">
    <image x="742" y="132" width="368" height="368" clip-path="url(#avatarClip)" preserveAspectRatio="xMidYMid slice" xlink:href="${avatarDataUri}"/>
  </g>
  <rect x="742" y="132" width="368" height="368" rx="46" fill="none" stroke="#ffffff" stroke-width="10" stroke-opacity="0.95"/>

  <!-- 域名 -->
  <text x="1112" y="576" text-anchor="end" font-family="${FONT}" font-size="24" fill="#64748b">magicyoyoyo.com</text>
</svg>`;

sharp(Buffer.from(svg))
  .png({ compressionLevel: 9 })
  .toFile(OUTPUT)
  .then((info) => {
    console.log('✅ 已生成:', path.relative(ROOT, OUTPUT));
    console.log(`   尺寸: ${info.width}x${info.height}`);
    console.log(`   体积: ${(info.size / 1024).toFixed(1)} KB`);
  })
  .catch((error) => {
    console.error('❌ 生成失败:', error);
    process.exit(1);
  });
