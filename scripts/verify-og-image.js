/* eslint-disable @typescript-eslint/no-require-imports -- 本脚本直接在 Node 上运行（CommonJS），必须使用 require */
/**
 * 校验生成的 og.png 是否渲染正确（因为无法用肉眼查看，改用像素统计判断）
 *
 * 原理：文字/图片区域的像素方差（stdev）会显著大于纯背景区域。
 *       若 SVG 文字因缺字体而没渲染出来，该区域会接近纯背景 → stdev 接近 0。
 */
const path = require('path');
const sharp = require('sharp');

const FILE = path.resolve(__dirname, '..', 'public/og.png');

/** 返回指定区域的灰度统计（手动计算，避免 stats() 忽略 extract 的问题） */
async function regionStats(left, top, width, height) {
  const { data } = await sharp(FILE)
    .extract({ left, top, width, height })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let sum = 0;
  let sumSq = 0;
  for (const value of data) {
    sum += value;
    sumSq += value * value;
  }

  const count = data.length;
  const mean = sum / count;
  const variance = sumSq / count - mean * mean;

  return { mean, stdev: Math.sqrt(Math.max(variance, 0)), pixels: count };
}

(async () => {
  const meta = await sharp(FILE).metadata();
  console.log(`图片: ${meta.width}x${meta.height}, 格式=${meta.format}`);

  const regions = [
    { name: '顶部站点名文字区', box: [190, 96, 430, 40], expectContent: true },
    { name: '主标题第一行', box: [80, 274, 620, 54], expectContent: true },
    { name: '主标题第二行（蓝色）', box: [80, 336, 620, 54], expectContent: true },
    { name: '副标题（风格列表）', box: [80, 418, 600, 32], expectContent: true },
    { name: '促销胶囊文字', box: [100, 494, 560, 36], expectContent: true },
    { name: 'logo 图标区', box: [85, 80, 80, 80], expectContent: true },
    { name: '示例头像区', box: [770, 170, 310, 300], expectContent: true },
    { name: '右下域名文字', box: [900, 552, 210, 30], expectContent: true },
    { name: '【对照】纯背景空白区', box: [1140, 250, 50, 120], expectContent: false },
  ];

  let failed = 0;

  for (const region of regions) {
    const { stdev, mean } = await regionStats(...region.box);
    const hasContent = stdev > 5; // 纯背景区域 stdev 通常 < 3
    const pass = region.expectContent ? hasContent : !hasContent;

    if (!pass) failed += 1;

    console.log(
      `${pass ? '✅' : '❌'} ${region.name.padEnd(22)} stdev=${stdev.toFixed(2).padStart(6)}  mean=${mean
        .toFixed(1)
        .padStart(5)}  ${region.expectContent ? '（应有内容）' : '（应为空白，作为对照）'}`
    );
  }

  console.log(
    failed === 0
      ? '\n✅ 所有区域渲染符合预期（文字与图片都已正常绘制）'
      : `\n❌ 有 ${failed} 个区域不符合预期 —— SVG 文字可能未渲染（缺字体）`
  );
  process.exit(failed === 0 ? 0 : 1);
})();
