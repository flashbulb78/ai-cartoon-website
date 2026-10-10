/* eslint-disable @typescript-eslint/no-require-imports -- 本脚本直接在 Node 上运行（CommonJS），必须使用 require */
/**
 * 测量各文字行的实际像素范围（用于确认文字不会侵入右侧头像区域）
 * 头像从 x=742 开始，因此文字右边界必须 < 742（留出间隙更佳）
 */
const path = require('path');
const sharp = require('sharp');

const FILE = path.resolve(__dirname, '..', 'public/og.png');
const AVATAR_LEFT = 742;
const LUM_THRESHOLD = 130; // 低于此亮度视为"文字像素"

async function measureText(name, top, height, leftLimit = 80, rightLimit = AVATAR_LEFT) {
  const width = rightLimit - leftLimit;

  const { data, info } = await sharp(FILE)
    .extract({ left: leftLimit, top, width, height })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let minCol = Infinity;
  let maxCol = -1;

  for (let row = 0; row < info.height; row += 1) {
    for (let col = 0; col < info.width; col += 1) {
      const lum = data[row * info.width + col];
      if (lum < LUM_THRESHOLD) {
        if (col < minCol) minCol = col;
        if (col > maxCol) maxCol = col;
      }
    }
  }

  if (maxCol < 0) {
    console.log(`   ${name.padEnd(26)} 未检测到文字像素`);
    return;
  }

  const absLeft = leftLimit + minCol;
  const absRight = leftLimit + maxCol;
  const gap = AVAIL_GAP(absRight);

  console.log(
    `   ${name.padEnd(26)} x=${String(absLeft).padStart(4)} → ${String(absRight).padStart(4)}  (宽 ${String(
      absRight - absLeft
    ).padStart(4)}px, 距头像 ${gap > 0 ? '+' : ''}${gap}px)`
  );
}

function AVAIL_GAP(right) {
  return AVATAR_LEFT - right;
}

(async () => {
  console.log(`头像区域从 x=${AVATAR_LEFT} 开始\n`);
  console.log('当前各文字行实际占用范围：');

  // y 区间取各行字形的垂直范围（略微放宽以覆盖上下缘）
  await measureText('站点名 "Magic Cartoon Avatar"', 90, 46);
  await measureText('小字 "AI Cartoon Avatar Gen…"', 140, 26);
  await measureText('主标题第 1 行', 274, 54);
  await measureText('主标题第 2 行', 336, 54);
  await measureText('副标题（风格列表）', 418, 32);
  await measureText('促销胶囊内文字', 494, 36);
})();
