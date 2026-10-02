/**
 * lib/theme.ts
 * 主题（明/暗）的唯一来源
 *
 * 为什么单独抽出来：
 *   原先 ThemeProvider（全局）与 useTheme（开关按钮）各自维护了一套主题逻辑，
 *   不仅重复，还导致两个真实问题：
 *     1. 二者都在 useEffect 中应用主题 → 深色用户刷新页面会先闪一下浅色（FOUC）
 *     2. 选择"浅色"时只移除 data-theme 属性，而 globals.css 中存在
 *        @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {...} }
 *        → 系统为深色时，用户手动切换浅色不生效
 *
 * 现在的做法：
 *   - 在 <head> 中内联一段阻塞脚本，在首次绘制前就把主题写进 <html>（消除闪烁）
 *   - 明确写入 data-theme="light" | "dark"，让用户的选择稳定覆盖系统偏好
 *   - 开关按钮直接读写这里的逻辑，不再依赖 React 状态（图标由 CSS 控制显隐）
 */

export type ThemePreference = 'light' | 'dark';

/** localStorage 键名（历史沿用，勿修改，否则老用户偏好会丢失） */
export const THEME_STORAGE_KEY = 'ai-cartoon-theme';

/**
 * 把主题写到 <html> 上
 * 说明：同时设置 data-theme（驱动 globals.css 的 CSS 变量）
 *       与 dark/light class（驱动 Tailwind 的 dark: 工具类）
 */
export function applyTheme(theme: ThemePreference): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
}

/**
 * 读取用户显式保存的主题偏好（未设置过返回 null，表示跟随系统）
 */
export function getStoredTheme(): ThemePreference | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    // 隐私模式等场景下 localStorage 可能抛错
    return null;
  }
}

/**
 * 读取当前实际生效的主题（优先显式设置，其次系统偏好）
 */
export function getCurrentTheme(): ThemePreference {
  if (typeof document === 'undefined') return 'light';

  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * 保存偏好并立即应用
 */
export function setStoredTheme(theme: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // 写不进去也要保证本次立即生效
  }

  applyTheme(theme);
}

/**
 * 生成主题初始化脚本
 *
 * 会被内联到 <head> 中，在浏览器首次绘制前同步执行：
 *   - 有显式偏好 → 直接应用（消除"深色用户看到浅色闪烁"）
 *   - 无偏好 → 跟随系统，并监听系统切换（用户一旦显式选择就不再跟随）
 */
export function getThemeInitScript(): string {
  return `(function(){try{
var KEY=${JSON.stringify(THEME_STORAGE_KEY)};
var el=document.documentElement;
var mq=window.matchMedia('(prefers-color-scheme: dark)');
function apply(t){
el.setAttribute('data-theme',t);
el.classList.toggle('dark',t==='dark');
el.classList.toggle('light',t==='light');
}
function stored(){try{var v=localStorage.getItem(KEY);return (v==='light'||v==='dark')?v:null;}catch(e){return null;}}
var s=stored();
if(s){apply(s);}else{
apply(mq.matches?'dark':'light');
mq.addEventListener('change',function(e){
if(stored()){return;}
apply(e.matches?'dark':'light');
});
}
}catch(e){}})();`;
}
