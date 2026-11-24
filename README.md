<div align="center">
  <img src="./assets/banner.svg" alt="TransMao 譯貓橫幅" width="100%" />

  <br /><br />

  <p>
    <strong>繁體中文</strong> &nbsp;|&nbsp; <a href="./README.en.md">English</a>
  </p>

  [![CI](https://github.com/SixMao0122/TransMao/actions/workflows/ci.yml/badge.svg)](https://github.com/SixMao0122/TransMao/actions/workflows/ci.yml)
  [![License](https://img.shields.io/badge/License-Apache_2.0-c85a32?style=for-the-badge)](./LICENSE)
  [![Manifest V3](https://img.shields.io/badge/Manifest-V3-26231f?style=for-the-badge)](./public/manifest.json)
  [![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3b5b8c?style=for-the-badge)](./tsconfig.json)
  [![Hugging Face](https://img.shields.io/badge/Hugging_Face-Transformers.js-2e6f5e?style=for-the-badge)](./src/offscreen/offscreen.ts)

  <p align="center">
    <strong>TransMao（譯貓）</strong> 是一款專為台灣繁體中文 (<code>zh-TW</code>) 打造的輕量、抗失效網頁翻譯與反白沉浸式查詞瀏覽器擴充套件。<br/>
    告別原生瀏覽器翻譯動不動失效的痛點，結合 <strong>4 層多引擎自動容錯</strong>、<strong>Shadow DOM 零污染反白詞典</strong> 與 <strong>Hugging Face 本地超小模型</strong>。
  </p>
</div>

---

## 功能演示

<div align="center">
  <img src="./assets/demo.gif" alt="TransMao 譯貓反白查詞與真人發音演示動畫" width="100%" />
</div>

---

## 核心特色

* **抗失效全頁翻譯（EN → 繁體中文 `zh-TW`）**
  * 支援 **雙語對照模式**（溫潤紙感底色區塊清楚區分原文與譯文，且不破壞網頁原有按鈕事件）與 **純繁體中文替換模式**（隨時一鍵還原原文，亦支援快捷鍵 `Alt + T`）。
  * **捲動懶載入翻譯（`IntersectionObserver`）**：優先翻譯眼前可視畫面段落，往下滑動時再即時翻譯新出現的內容，大幅提升本地模型與長文章體驗。
  * 內建 **4 層自動容錯管線（Failover）**：`Google Clients5 (原生多筆陣列)` → `Google GTX RPC` → `MyMemory 免費備援 (5 路並發)` → `Hugging Face 本地模型`，並自動經過 `OpenCC (s2twp)` 轉換為道地台灣繁體中文慣用語（如：軟體、伺服器、記憶體）。
  * 支援 SPA 動態頁面監聽（`MutationObserver`），自動排除隱藏元素與 `<code>`、`<pre>` 等程式碼區塊。
* **極速反白懸浮詞典（詞性 · 例句 · 發音）**
  * 反白網頁任何英文單字或片語，立即浮出輕巧的「**譯**」印章圖示（亦可設定直接展開卡片）。
  * 採用 **Shadow DOM 樣式完全隔離**與單次高速字典請求（搭配記憶體快取），顯示：**繁中釋義**、**國際音標**、**色彩分類詞性標籤（`n.`、`v.`、`adj.`…）**、**中英雙語例句**。
  * **雙層發音引擎**：提供 **美音 (US)** 與 **英音 (UK)** 按鈕，優先播放辭典官方真人 MP3 音檔，受限時自動降級為瀏覽器原生 `Web Speech API`。
  * 內建 **已收藏單字清單**：一鍵收藏生詞，並可在設定頁複習朗讀或匯出 JSON。
* **支援 Hugging Face 本地超小模型（離線終極備援）**
  * 內建本地封裝之 ONNX Runtime WASM（完全符合 Chrome MV3 CSP 規範，無遠端腳本依賴），透過 `Offscreen Document` + `@huggingface/transformers` 進行本機推論：

| 模型 ID (Hugging Face) | 量化大小 | 特色說明 |
| :--- | :--- | :--- |
| **`Xenova/opus-mt-en-zh`** | ~80 MB | 極輕量、速度最快，自動搭配 `opencc-js` (`s2twp`) 轉為台灣繁體中文 |
| **`Xenova/nllb-200-distilled-600M`** | ~350 MB | Meta 多語蒸餾翻譯模型，原生支援 `zho_Hant` 繁體中文 |

---

## 快速安裝與使用

### 方式一：從 GitHub Releases 直接安裝（推薦）
1. 前往 [Releases](https://github.com/SixMao0122/TransMao/releases) 頁面下載最新的 `trans-mao-v*.zip` 並解壓縮。
2. 開啟瀏覽器擴充功能管理頁面：
   * Chrome：`chrome://extensions/`
   * Edge：`edge://extensions/`
3. 開啟右上角的 **「開發人員模式 (Developer mode)」**。
4. 點擊 **「載入未封裝項目 (Load unpacked)」**，選擇剛解壓縮的資料夾即可使用。

### 方式二：從原始碼自行建置
環境需求：**Node.js `>= 20`**（支援 Chrome / Edge / Brave 等 Chromium 核心瀏覽器）。

```bash
git clone https://github.com/SixMao0122/TransMao.git
cd TransMao
npm install
npm run icons   # 產生 16/32/48/128 PNG 擴充套件圖示
npm run build   # 建置至 dist/（自動打包本地 ORT WASM）
```

建置完成後，於瀏覽器擴充功能頁面點擊 **「載入未封裝項目」** 並選擇本專案的 **`dist/`** 資料夾，再將 **TransMao 譯貓** 釘選至工具列即可開始體驗。

---

## 開發指令

```bash
npm run watch          # 監聽變更並自動重新編譯 dist/
npm run typecheck      # TypeScript 嚴格型別檢查
npm run test           # 執行 Vitest 單元測試
npm run build:release  # 正式版極小化建置（移除 sourcemap）
npm run package        # 一鍵打包 release/trans-mao-v0.1.0.zip
```

---

## 安全性與隱私

TransMao 尊重使用者隱私，不收集任何個人瀏覽紀錄或遙測資料。詳細資訊與漏洞回報管道請參閱 [SECURITY.md](./SECURITY.md)。

---

## 參與貢獻

歡迎提出 Issue、功能建議或 Pull Request！請先閱讀 [CONTRIBUTING.md](./CONTRIBUTING.md) 與 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)。

---

## 授權條款

本專案採用 **[Apache License 2.0](./LICENSE)** 開源授權。
