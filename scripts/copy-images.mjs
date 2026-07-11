// Astro 在 build 一開始就把 public/ 複製進 dist/，早於頁面 frontmatter 執行，
// 而 Ragic 圖片是在 frontmatter 執行時才下載進 public/images/，所以 build 完
// 還要再把新下載的圖片同步進 dist/images/，不然靜態頁面會引用到不存在的檔案。
import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';

const src = path.join(process.cwd(), 'public', 'images');
const dest = path.join(process.cwd(), 'dist', 'images');

try {
  await mkdir(dest, { recursive: true });
  await cp(src, dest, { recursive: true });
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}
