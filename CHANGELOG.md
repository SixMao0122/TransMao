# 更新日誌 (Changelog)

本專案遵循 [Semantic Versioning](https://semver.org/) 語意化版本規範。

## [0.1.0] - 2026-11-23

### 新增 (Added)
* **抗失效全頁英文翻譯**：支援「雙語對照（溫潤紙感底色）」與「純繁體中文替換」雙模式，內建 `IntersectionObserver` 捲動懶載入翻譯、`MutationObserver` 動態頁面翻譯、全域快捷鍵 `Alt + T` 與一鍵還原原文。
* **4 層多引擎自動容錯 (Failover)**：整合 `Google Clients5 (原生多筆批次)`、`Google GTX RPC`、`MyMemory 5 路並發備援` 與 `Hugging Face 本地模型`，搭配 `opencc-js` (`s2twp`) 台灣繁體中文慣用語在地化轉換。
* **極速反白懸浮詞典 (Shadow DOM 隔離)**：溫潤紙本 × 手繪墨線介面（全介面零 Emoji），選取英文單字或片語即浮現「譯」印章圖示與卡片，顯示繁中釋義、音標、防重複色彩詞性標籤（如 `n. 名詞`）、目標單字高亮之中英雙語例句。
* **雙層語音發音**：提供美音 (US) / 英音 (UK) 按鈕，優先播放辭典真人 MP3，受阻時自動降級為 `Web Speech API`。
* **Hugging Face 本地超小模型支援**：內建本機打包之 ONNX Runtime WASM（完全符合 Chrome MV3 CSP）、MV3 Service Worker 保活機制與 Greedy Decoding (`num_beams: 1`) 加速，支援 `Xenova/opus-mt-en-zh` (~80MB) 與 `Xenova/nllb-200-distilled-600M` 離線推論。
* **已收藏單字清單與進階控制台**：支援單字收藏、發音複習、匯出 JSON、排除網域清單與本地快取管理。
* **開源社群與發佈工具**：Apache-2.0 授權、手繪風格 SVG Banner / Logo / 預覽圖、`SECURITY.md`、`CONTRIBUTING.md`、`CODE_OF_CONDUCT.md`、GitHub Actions CI 與 `npm run package` 一鍵壓縮發佈腳本。
