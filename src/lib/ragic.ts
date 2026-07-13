/**
 * Ragic API helper
 *
 * 在 build time 從 Ragic 撈資料。需要三個環境變數（見 .env.example）：
 *   RAGIC_SHEET_URL  — 表單的 API 網址，例如 https://ap7.ragic.com/youraccount/forms1/1
 *   RAGIC_API_KEY    — Ragic 帳號的 API Key（個人設定 → API Key 產生）
 *   RAGIC_FIELD_ID   — 要讀取的 Markdown 欄位的 Field ID（欄位設定裡看得到，例如 1000123）
 *
 * 沒設定時回傳 null，頁面會 fallback 到示範內容，方便先看版型。
 *
 * Markdown 欄位裡若含有 Ragic 貼圖產生的語法：
 *   [img=寬x高]https://.../file.jsp?...&f=xxx.png[/img]
 * 會在 build time 用帶認證的 fetch 把圖片下載到 public/images/，
 * 並把該語法換成標準 Markdown 圖片語法 ![xxx.png](/images/xxx.png)，
 * 這樣輸出的靜態頁面只會引用本機路徑，不會暴露 API Key。
 */

import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const IMAGES_DIR = path.join(process.cwd(), 'public', 'images');

// Ragic Markdown 欄位貼圖語法：[img=寬x高]網址[/img]
const RAGIC_IMG_PATTERN = /\[img=\d+x\d+\](https?:\/\/[^\s[]+?)\[\/img\]/g;

export interface RagicContent {
  markdown: string;
  recordCount: number;
}

function extractFilename(url: string): string {
  try {
    const parsed = new URL(url);
    const fParam = parsed.searchParams.get('f');
    if (fParam) return fParam;
    return decodeURIComponent(parsed.pathname.split('/').pop() || 'image');
  } catch {
    return 'image';
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function downloadRagicImage(url: string, apiKey: string): Promise<string> {
  const filename = sanitizeFilename(extractFilename(url));
  const localPath = path.join(IMAGES_DIR, filename);

  const alreadyDownloaded = await access(localPath).then(() => true, () => false);
  if (!alreadyDownloaded) {
    await mkdir(IMAGES_DIR, { recursive: true });
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${apiKey}` },
    });
    if (!res.ok) {
      throw new Error(`[ragic] 圖片下載失敗 ${res.status}：${url}`);
    }
    await writeFile(localPath, Buffer.from(await res.arrayBuffer()));
  }

  return `/images/${filename}`;
}

// 把 Markdown 裡的 [img=WxH]網址[/img] 換成本地圖片的 Markdown 語法
async function resolveRagicImages(markdown: string, apiKey: string): Promise<string> {
  const urls = [...markdown.matchAll(RAGIC_IMG_PATTERN)];
  if (urls.length === 0) return markdown;

  let result = markdown;
  for (const [full, url] of urls) {
    const localSrc = await downloadRagicImage(url, apiKey);
    result = result.replace(full, `![${extractFilename(url)}](${localSrc})`);
  }
  return result;
}

/**
 * @param recordId 指定 Ragic 的資料 node id（表單網址列最後那個數字，例如
 *   .../forms8/2/0 裡的 0）只抓那一筆。省略時抓整個表單、取最新一筆。
 *   RAGIC_SHEET_URL 必須是「不含記錄 id」的乾淨表單網址（.../{tab}/{sheetIndex}）。
 */
export async function fetchRagicMarkdown(
  recordId?: number | string
): Promise<RagicContent | null> {
  const sheetUrl = import.meta.env.RAGIC_SHEET_URL;
  const apiKey = import.meta.env.RAGIC_API_KEY;
  const fieldId = import.meta.env.RAGIC_FIELD_ID;

  if (!sheetUrl || !apiKey || !fieldId) {
    console.warn('[ragic] 環境變數未設定，使用示範內容（請參考 .env.example）');
    return null;
  }

  // ?api      → 回傳 JSON
  // &v=3      → API v3 回傳格式
  // &naming=EID → 用 Field ID 當 key（比欄位名稱穩定，改欄位名不會壞）
  const url =
    recordId === undefined
      ? `${sheetUrl}?api&v=3&naming=EID`
      : `${sheetUrl}/${recordId}?api&v=3&naming=EID`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${apiKey}`,
    },
  });

  if (!res.ok) {
    throw new Error(`[ragic] API 回應 ${res.status}：${await res.text()}`);
  }

  const data = await res.json();

  // 指定的記錄不存在時，Ragic 有時回傳明確的錯誤物件（如 Invalid Form Index），
  // 有時（例如 recordId 超出範圍）回傳完全不相關的結構（如帳號的表單清單）。
  // 不管抓整個表單還是抓單筆，正常回應都是 { "<key>": {record}, ... }，
  // 用 _ragicId 篩掉不是記錄的雜訊，兩種異常情況都能一併擋下來。
  const records = (Object.values(data ?? {}) as any[]).filter(
    (r) => r && typeof r === 'object' && '_ragicId' in r
  ) as Record<string, any>[];

  if (records.length === 0) {
    console.warn(`[ragic] 找不到資料（recordId=${recordId ?? '(latest)'}）`);
    return null;
  }

  // 有指定 recordId 時，回應本來就只會有這一筆；
  // 沒指定時（抓整個表單），示範取「最新一筆」— 依 _ragicId 最大者
  const record =
    recordId !== undefined
      ? records[0]
      : records.reduce((a, b) => ((b._ragicId ?? 0) > (a._ragicId ?? 0) ? b : a));

  const rawMarkdown = record[fieldId];
  if (typeof rawMarkdown !== 'string' || rawMarkdown.trim() === '') {
    console.warn(`[ragic] 欄位 ${fieldId} 是空的或不存在，請確認 Field ID`);
    return null;
  }

  const markdown = await resolveRagicImages(rawMarkdown, apiKey);

  return { markdown, recordCount: records.length };
}
