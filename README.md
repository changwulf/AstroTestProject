# 巧禾官網 — Astro + Ragic 串接測試

首頁有一個內容區塊，在 **build time** 從 Ragic API 取得 Markdown 欄位、轉 HTML 後編進靜態頁面。訪客瀏覽時不會碰到 Ragic，API Key 也不會出現在前端。

## 快速開始

```bash
npm install
cp .env.example .env   # 填入你的 Ragic 資訊
npm run dev            # http://localhost:4321
```

沒設定 `.env` 也能跑，會顯示示範內容（頁面上的 badge 會標示目前資料來源）。

## Ragic 端要準備的

1. 開一張表單，至少一個「多行文字」欄位，內容用 Markdown 寫
2. 記下三個值填進 `.env`：
   - 表單網址（瀏覽器網址列直接複製，去掉參數）
   - API Key（個人設定 → 產生 API Key）
   - Markdown 欄位的 Field ID（設計模式點欄位可見）

目前的邏輯是**取最新一筆資料**（`_ragicId` 最大者）的該欄位。抓取邏輯都在 `src/lib/ragic.ts`，之後要改成多筆文章、篩選「已發布」狀態等，都是改這一個檔案。

## 驗證串接

```bash
npm run build
```

Build log 出現 `[ragic]` 警告 = 沒抓到（會印出原因：沒設環境變數 / 欄位空 / Field ID 錯）。
沒有警告且頁面 badge 顯示「資料來源：Ragic API」= 串接成功。

也可以先用 curl 單獨測 API：

```bash
curl -H "Authorization: Basic 你的APIKey" \
  "https://ap7.ragic.com/你的帳號/forms1/1?api&v=3&naming=EID"
```

## 部署到 Cloudflare Pages

1. Push 到 GitHub
2. Cloudflare Dashboard → Workers & Pages → 連 repo
   - Build command: `npm run build`
   - Output directory: `dist`
3. 在 Pages 專案的 **Settings → Environment variables** 加上 `.env` 那三個變數
4. Settings → Build → 建一個 **Deploy hook**，拿到的 URL 給 n8n 用：
   Ragic 資料更新 → webhook → n8n → POST deploy hook → 網站自動重建

## 專案結構

```
src/
  pages/index.astro   # 首頁（版型 + 渲染）
  lib/ragic.ts        # Ragic API 抓取邏輯
```
