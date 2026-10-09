<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## 项目约定（改动前请先阅读）

### `public/` 静态资源

- **`public/google*.html` 是 Google Search Console 的站点验证文件：请勿删除、勿修改内容。**
  Google 会定期复查该文件；一旦它变成 404 或内容被改动，站点验证会失效，
  进而丢失 Search Console 数据与 sitemap 提交能力。
- `public/` 已做过一轮无效资源清理。**删除任何文件前，请先全仓库确认「0 引用」**：
  ```
  grep -rl "文件名" . --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git
  ```
  注意 `scripts/verification/` 下的回归测试会引用部分图片作为**测试样本**
  （当前使用 `apple-touch-icon.png` 与 `samples/example.png`），
  它们看起来"没被业务代码引用"，但删除会弄坏测试。
- `public/samples/example.png` **实际是 JPEG 编码**（历史遗留），文件名与内容不一致。
  它同时被「首页示例图」(`app/page.tsx` 的 `SAMPLE_IMAGE_URL`) 与回归测试引用，
  如需改名/转码，请同步修改这两处。
- 图片尺寸参考：`logo_192.png` 显示尺寸为 40px（Header）与 48px（认证页），
  因此**不要把它压到 80px 以下**（retina 屏会发虚，建议 ≥96px）。
