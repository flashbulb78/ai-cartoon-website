/* eslint-disable @typescript-eslint/no-require-imports -- 本脚本直接在 Node 上运行（CommonJS），必须使用 require */
/**
 * scripts/optimize-sample-image.js
 * 优化首页示例图：把 public/samples/example.png 转成 768px 的 WebP
 *
 * 背景：
 *   该文件实际是 **JPEG 编码**（文件名却是 .png），1024×1024 共 246KB。
 *   它是首页结果区最大的图片元素（很可能就是 LCP 元素），
 *   而该区域在桌面端的实际显示宽度仅约 528px。
 *   因此按 768px 重采样并转 WebP，可大幅降低下载体积。
 *
 * 说明（一次性脚本）：原始素材 `public/samples/example.png`（1024×1024 JPEG，246KB）
 *      已在转换完成后删除，因此本脚本默认无法直接重跑。
 *      如需再次优化示例图，请先把原图放回 `public/samples/example.png` 再运行。
 *
 * 依赖：sharp（Next.js 的可选依赖，本地已具备，无需写入 package.json）
 * 运行：node scripts/optimize-sample-image.js
 *
 * 本次执行结果：quality=86 → 768×768 WebP，38.1 KB（节省 84.5%）
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'public/samples/example.png');
const OUTPUT = path.join(ROOT, 'public/samples/example.webp');

/** 目标边长：桌面端显示约 528px，768px 可覆盖 1.45x，兼顾清晰度与体积 */
const TARGET_SIZE = 768;

/** 体积上限：超过则继续降低质量（单位：字节） */
const MAX_BYTES = 80 * 1024;

(async () => {
  if (!fs.existsSync(SOURCE)) {
    console.error('❌ 找不到源文件:', path.relative(ROOT, SOURCE));
    process.exit(1);
  }

  const sourceBytes = fs.statSync(SOURCE).size;
  console.log(`源文件: ${path.relative(ROOT, SOURCE)}  ${(sourceBytes / 1024).toFixed(1)} KB`);

  // 从高到低尝试质量，取「质量最高且不超过体积上限」的结果
  const qualities = [86, 82, 78, 74, 70, 64];
  let chosen = null;

  for (const quality of qualities) {
    const buffer = await sharp(SOURCE)
      .resize(TARGET_SIZE, TARGET_SIZE, { fit: 'cover' })
      .webp({ quality })
      .toBuffer();

    chosen = { quality, buffer };
    console.log(`  quality=${quality} → ${(buffer.length / 1024).toFixed(1)} KB`);

    if (buffer.length <= MAX_BYTES) break;
  }

  fs.writeFileSync(OUTPUT, chosen.buffer);

  const savedPercent = ((1 - chosen.buffer.length / sourceBytes) * 100).toFixed(1);
  console.log(`\n✅ 已生成: ${path.relative(ROOT, OUTPUT)}`);
  console.log(`   尺寸: ${TARGET_SIZE}x${TARGET_SIZE}, 质量: ${chosen.quality}`);
  console.log(`   体积: ${(chosen.buffer.length / 1024).toFixed(1)} KB`);
  console.log(`   相比原图节省 ${savedPercent}% (${(sourceBytes / 1024).toFixed(1)} KB → ${(chosen.buffer.length / 1024).toFixed(1)} KB)`);
})().catch((error) => {
  console.error('❌ 转换失败:', error);
  process.exit(1);
});
