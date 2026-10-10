/* eslint-disable @typescript-eslint/no-require-imports -- 本脚本直接在 Node 上运行（CommonJS），必须使用 require */
/**
 * scripts/generate-test-fixtures.js
 * 生成回归测试所用的图片样本（scripts/verification/fixtures/）
 *
 * 为什么单独准备测试样本：
 *   回归测试需要「真实的 PNG / JPEG 文件」来验证服务端图片校验逻辑。
 *   若直接引用 public/ 下的业务图片，会有两个问题：
 *     1. 无法清理那些图片（一删测试就挂），它们看起来"没被业务引用"容易被误删
 *     2. 业务图片往往几百 KB，作为测试样本白白占用仓库体积
 *   因此这里用 SVG 合成两张极小的确定性图片（各约 1~4KB）。
 *
 * 依赖：sharp（Next.js 的可选依赖，本地已具备）
 * 运行：node scripts/generate-test-fixtures.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE_DIR = path.join(ROOT, 'scripts/verification/fixtures');

/** 200×200 的确定性图案：渐变底 + 半透明白圆 */
const SVG = `<svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#f59e0b"/>
    </linearGradient>
  </defs>
  <rect width="200" height="200" fill="url(#g)"/>
  <circle cx="100" cy="100" r="60" fill="#ffffff" fill-opacity="0.65"/>
</svg>`;

(async () => {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });

  const pngPath = path.join(FIXTURE_DIR, 'fixture.png');
  const jpgPath = path.join(FIXTURE_DIR, 'fixture.jpg');

  await sharp(Buffer.from(SVG)).png({ compressionLevel: 9 }).toFile(pngPath);
  await sharp(Buffer.from(SVG)).jpeg({ quality: 82 }).toFile(jpgPath);

  for (const file of [pngPath, jpgPath]) {
    const { size } = fs.statSync(file);
    const meta = await sharp(file).metadata();
    console.log(
      `✅ ${path.relative(ROOT, file)}  ${meta.width}x${meta.height} ${meta.format}  ${(size / 1024).toFixed(1)} KB`
    );
  }
})().catch((error) => {
  console.error('❌ 生成失败:', error);
  process.exit(1);
});
