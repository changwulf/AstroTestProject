import { defineConfig } from 'astro/config';

// 純靜態輸出（SSG）— build 時抓 Ragic 資料，產出的頁面是純 HTML
export default defineConfig({
  output: 'static',
});
