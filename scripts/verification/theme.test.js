/* eslint-disable @typescript-eslint/no-require-imports -- 本脚本直接在 Node 上运行 tsc 编译出的 CommonJS 产物，必须使用 require */
/**
 * 主题逻辑回归测试（lib/theme.ts）
 *
 * 重点验证两个曾经的真实缺陷：
 *   1. 系统为深色时，用户手动选择"浅色"必须生效（原先只移除属性，被 CSS 媒体查询覆盖）
 *   2. 首屏主题在 <head> 内联脚本中即确定（消除刷新闪烁）
 *
 * 运行：bash scripts/verification/run.sh
 */
const vm = require('vm');
const { getThemeInitScript, getCurrentTheme, applyTheme, THEME_STORAGE_KEY } = require('./theme');

let pass = 0;
let fail = 0;

function ok(name, condition, detail) {
  console.log(`${condition ? '✅' : '❌'} ${name}`);
  if (detail) console.log(`   ${detail}`);
  if (condition) {
    pass += 1;
  } else {
    fail += 1;
  }
}

/** 构造最小 DOM / window 替身，并执行内联初始化脚本 */
function runInitScript({ stored = null, systemDark = false } = {}) {
  const attrs = new Map();
  const classes = new Set();
  const listeners = [];

  const element = {
    setAttribute: (key, value) => attrs.set(key, value),
    getAttribute: (key) => (attrs.has(key) ? attrs.get(key) : null),
    classList: {
      toggle: (name, force) => {
        if (force) classes.add(name);
        else classes.delete(name);
      },
      contains: (name) => classes.has(name),
    },
  };

  const localStore = new Map();
  if (stored !== null) localStore.set(THEME_STORAGE_KEY, stored);

  const mediaQuery = {
    matches: systemDark,
    addEventListener: (type, handler) => listeners.push(handler),
  };

  globalThis.document = { documentElement: element };
  globalThis.window = {
    matchMedia: () => mediaQuery,
  };
  globalThis.localStorage = {
    getItem: (key) => (localStore.has(key) ? localStore.get(key) : null),
    setItem: (key, value) => localStore.set(key, value),
  };

  vm.runInThisContext(getThemeInitScript());

  return {
    attrs,
    classes,
    listeners,
    mediaQuery,
    localStore,
    dataTheme: attrs.get('data-theme'),
    hasDarkClass: classes.has('dark'),
    hasLightClass: classes.has('light'),
  };
}

console.log('\n########## 主题逻辑（lib/theme.ts）##########\n');

console.log('--- 1. 首次绘制前的主题确定（消除闪烁）---');
{
  const r = runInitScript({ stored: 'dark', systemDark: false });
  ok('保存过 dark → data-theme=dark 且带 dark 类', r.dataTheme === 'dark' && r.hasDarkClass === true, `data-theme=${r.dataTheme} dark类=${r.hasDarkClass}`);
}
{
  const r = runInitScript({ stored: 'light', systemDark: false });
  ok('保存过 light → data-theme=light 且带 light 类', r.dataTheme === 'light' && r.hasLightClass === true && r.hasDarkClass === false, `data-theme=${r.dataTheme} dark类=${r.hasDarkClass}`);
}

console.log('\n--- 2. 【回归】系统深色 + 用户选浅色，必须生效 ---');
{
  const r = runInitScript({ stored: 'light', systemDark: true });
  ok(
    '系统深色但用户选了浅色 → 保持浅色（此前会被系统偏好覆盖）',
    r.dataTheme === 'light' && r.hasDarkClass === false,
    `data-theme=${r.dataTheme}（必须为 light）`
  );
}

console.log('\n--- 3. 未设置偏好时跟随系统 ---');
{
  const dark = runInitScript({ stored: null, systemDark: true });
  ok('无偏好 + 系统深色 → dark', dark.dataTheme === 'dark' && dark.hasDarkClass === true, `data-theme=${dark.dataTheme}`);
}
{
  const light = runInitScript({ stored: null, systemDark: false });
  ok('无偏好 + 系统浅色 → light', light.dataTheme === 'light' && light.hasLightClass === true, `data-theme=${light.dataTheme}`);
}

console.log('\n--- 4. 系统偏好变化时的跟随行为 ---');
{
  const r = runInitScript({ stored: null, systemDark: false });
  ok('注册了系统偏好监听', r.listeners.length === 1, `监听器数=${r.listeners.length}`);
  r.mediaQuery.matches = true;
  r.listeners[0]({ matches: true });
  ok('无显式偏好时跟随系统切换到 dark', r.attrs.get('data-theme') === 'dark', `data-theme=${r.attrs.get('data-theme')}`);
}
{
  const r = runInitScript({ stored: 'dark', systemDark: true });
  ok('有显式偏好时不注册监听（不跟随系统）', r.listeners.length === 0, `监听器数=${r.listeners.length}`);
}

console.log('\n--- 5. getCurrentTheme / applyTheme（供开关按钮使用）---');
{
  runInitScript({ stored: 'dark', systemDark: true });
  ok('getCurrentTheme 读取 data-theme', getCurrentTheme() === 'dark', `返回=${getCurrentTheme()}`);
  applyTheme('light');
  ok('applyTheme(light) 立即生效', getCurrentTheme() === 'light' && globalThis.document.documentElement.classList.contains('light'), `data-theme=${document.documentElement.getAttribute('data-theme')}`);
  applyTheme('dark');
  ok('applyTheme(dark) 立即生效', getCurrentTheme() === 'dark' && globalThis.document.documentElement.classList.contains('dark'), `data-theme=${document.documentElement.getAttribute('data-theme')}`);
}

console.log(`\n########## 结果：${pass} 通过 / ${fail} 失败 ##########\n`);
process.exit(fail > 0 ? 1 : 0);
