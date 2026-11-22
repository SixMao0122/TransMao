# 貢獻指南 (Contributing to TransMao)

感謝您對 **TransMao（譯貓）** 的興趣與支持！無論是回報 Bug、提出新點子、優化繁體中文在地化體驗，或是提交程式碼 PR，都非常歡迎。

## 開發環境建置

```bash
# 1. 安裝相依套件
npm install

# 2. 產生擴充套件 PNG 圖示
npm run icons

# 3. 啟動監聽編譯模式
npm run watch
```

建置完成後，請於 Chrome / Edge 的擴充功能頁面開啟「開發人員模式」，並載入 `dist/` 資料夾進行測試。

## 提交 Pull Request 前的檢查清單

請在提交 PR 前確認以下項目皆已通過：

1. **型別檢查無錯誤**：執行 `npm run typecheck`。
2. **單元測試全數通過**：執行 `npm run test`。
3. **建置成功**：執行 `npm run build` 確認 `dist/` 產物正常。
4. **樣式零污染**：若新增 Content Script UI，請務必放置於 `#transmao-root` 的 Shadow DOM 內，避免影響宿主網頁。
5. **Commit 訊息規範**：建議採用 Conventional Commits（例如 `feat: 新增快捷鍵切換翻譯`、`fix: 修正 SPA 頁面重複翻譯`、`docs: 更新 README 說明`）。

## 專案維護者

* **SxiMao** ([@SixMao0122](https://github.com/SixMao0122))
