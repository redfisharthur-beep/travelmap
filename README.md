# Travelmap · 台灣旅遊景點推薦

莫蘭迪色系、Noto Sans TC、無資料庫的 Cloudflare Workers 旅遊景點網站。

## 開始使用

1. 將首頁圖放在 `public/assets/home.webp`（亦支援 home.png、home.jpg，請直接更改 `public/app.js` 裡 `HERO_FILE` 路徑），長直式的圖片適合手機。
2. 在 Cloudflare Worker「Settings → Variables and Secrets」新增 **GOOGLE_PLACES_API_KEY**、**LANGSEARCH_API_KEY** 兩個 Secret，**不要寫進 GitHub**。
3. Cloudflare Dashboard → Workers & Pages → Create → Import a repository → 選擇 `redfisharthur-beep/travelmap`；以 Workers 專案匯入，Build command `npm install`，Deploy command `npx wrangler deploy`。也可以在本機 `npm install && npx wrangler deploy`。
4. Cloudflare Workers AI 已設定 `AI` binding，會自動整合來源產生 50 字內摘要。Workers AI 可能產生費用；API 調用也依各供應商計費。
5. `npm run dev` 可在本機預覽介面（沒有 Secret 時僅會顯示尚未連接資料，不會偽造景點）。

## 資料與規則

- 使用 Google Places API (New) 搜尋景點、評分、評論數、照片、Google Maps 連結。
- 使用 LangSearch 網路檢索景點優缺點、價格。僅能辨識有明確公開票價片段的價格；**不會把 Google Places 的 priceLevel 當門票**。
- 以 Google 評分、評論數做穩健評分，網路負面訊號做小幅調整；分數 1–99，**屬本站推估，非 Google 原始百分制**。
- Workers AI 僅能摘要已取得的資訊。若 AI 不可用，改成客觀的簡短描述。
- 沒有可信的門票資訊時價格欄位為未知；選擇指定門票範圍時不顯示這些未確認的資料。
- 不使用 D1/KV/R2；Google Places 資料不持久化儲存，會依供應商 API 政策即時取得。
- 單次縣市最多向 Google 取得 20 筆，最多向 LangSearch 查詢其中 8 筆，並以一次 Workers AI 請求統整，避免不必要的費用。分類與價格在瀏覽器端篩選，避免重複呼叫 API。
- 香港及境外景點會被排除；搜尋結果需有相符縣市地址，避免行政區偏移造成的誤入。
- 介面不使用 emoji / 箭頭圖案。

## 首頁圖片對位

`public/styles.css` 的 `--map-width`, `--map-top`, `--map-left` 決定透明縣市 SVG 點選區的位置。因尚未提供首頁圖片，需上傳後按圖片內台灣地圖的實際大小對位。缺圖時會顯示可點選的縣市地圖，不會顯示假圖片。

## 設計與版權

縣市輪廓轉用 g0v/twgeojson CC0 1.0 資料；鄉鎮清單取自 ronnywang/twgeojson（資料源為國土資訊系統 2011 年行政區資料，部分新更動可能需更新）。Google Places 的相片與評分原屬原作者及平台；不可擅自永久快取，保留照片作者標示。

## 主要檔案

- `public/index.html`：首頁／縣市景點列表
- `public/styles.css`：版面與色彩
- `public/app.js`：篩選、地圖互動、畫面
- `public/data/counties.topo.json`：縣市形狀
- `public/data/towns.json`：鄉鎮市區清單
- `src/index.js`：Cloudflare Worker API；Google Places / LangSearch / Workers AI
