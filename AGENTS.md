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
  注意：**上线资源也可能被测试引用**。因此回归测试现在使用
  `scripts/verification/fixtures/` 下专用的小图片（由
  `node scripts/generate-test-fixtures.js` 合成，各约数 KB），
  不再依赖 `public/` 里的业务图片 —— 这样业务图片可以放心删改。
- `public/samples/example.webp` 是首页默认示例图（768×768，约 38KB），
  被 `app/page.tsx` 的 `SAMPLE_IMAGE_URL` 与一条回归测试引用。
  它由 `scripts/optimize-sample-image.js` 一次性生成（原来的 1024×1024、246KB
  的 PNG/JPEG 已删除）；若需再次优化，请先把原图放回
  `public/samples/example.png` 再运行该脚本，并同步更新上面两处引用。
- 图片尺寸参考：`logo_192.png` 显示尺寸为 40px（Header）与 48px（认证页），
  因此**不要把它压到 80px 以下**（retina 屏会发虚，建议 ≥96px）。
