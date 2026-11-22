# 更新日誌 (Changelog)

本專案遵循 [Semantic Versioning](https://semver.org/) 語意化版本規範。

## [0.1.0] - 2026-11-22

### 新增 (Added)
* **抗失效全頁英文翻譯**：支援「雙語對照」與「純繁體中文替換」雙模式，內建 `MutationObserver` 動態頁面翻譯與一鍵還原原文。
* **多引擎自動容錯 (Failover)**：整合 Google RPC、MyMemory 免費備援與 `opencc-js` (`s2twp`) 台灣繁體中文在地化轉換。
* **反白懸浮詞典 (Shadow DOM 隔離)**：選取英文單字或片語即浮現「譯」小圖示與玻璃擬態卡片，顯示繁中釋義、音標、色彩詞性標籤 (`POS`)、中英雙語例句。
* **雙層語音發音**：提供美音 (US) / 英音 (UK) 按鈕，優先播放辭典真人 MP3，受阻時自動降級為 `Web Speech API`。
* **Hugging Face 本地超小模型支援**：透過 Offscreen Document + `Transformers.js` 支援 `Xenova/opus-mt-en-zh` (~80MB) 與 `Xenova/nllb-200-distilled-600M` 離線翻譯。
* **個人單字本與進階控制台**：支援單字收藏、發音複習、匯出 JSON、排除網域清單與本地快取管理。
* **開源社群文件與視覺資產**：Apache-2.0 授權、SVG Banner / Logo / 預覽圖、`SECURITY.md`、`CONTRIBUTING.md`、`CODE_OF_CONDUCT.md`。
