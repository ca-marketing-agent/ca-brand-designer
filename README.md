# CA Brand Designer

AI 品牌設計系統 — 風格分析 + Gemini Imagen 4 生圖 + Magnific 升級 + Canva 匯出。

由 [CA 創域國際設計](https://www.ca-design.com) 出品。

## 線上使用

直接打開 `index.html` 即可，所有資料只存在你的瀏覽器 localStorage。

## 4 步驟流程

1. **品牌設定** — 填品牌名稱、Logo、設計目標、平台
2. **風格參考** — 上傳參考圖 → Gemini Vision 分析配色、風格
3. **AI 生圖** — Gemini Imagen 4 Fast 自動生成設計素材
4. **匯出設計** — 一鍵跳 Magnific 升級 / Canva 細部設計

## 需要的 API Key

| 服務 | 用途 | 取得方式 |
|------|------|---------|
| Gemini API | 風格分析 + 生圖 | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| Magnific | 圖像升級（網頁版） | [magnific.ai](https://magnific.ai) |
| Canva | 設計完稿 | [canva.com](https://canva.com) |

點右上角 ⚙️ 設定填入 Gemini API Key。

## 技術

純 HTML + JavaScript，無後端，可部署到任何靜態託管（GitHub Pages / Cloudflare Pages / Vercel）。
