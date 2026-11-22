# 安全性政策 (Security Policy)

## 支援的版本 (Supported Versions)

目前提供安全性更新與修補的版本如下：

| 版本 | 支援狀態 |
| :--- | :--- |
| `0.1.x` | ✅ 持續維護中 |

---

## 隱私與權限聲明 (Privacy & Permissions)

TransMao（譯貓）以「最小權限原則」與「零遙測」設計：

1. **零使用者追蹤**：本套件不含任何廣告、第三方追蹤腳本或匿名遙測（Analytics）。
2. **本地儲存**：使用者的單字本與翻譯快取僅儲存於瀏覽器本機的 `chrome.storage.local`；偏好設定透過瀏覽器原生 `chrome.storage.sync` 同步。
3. **隔離渲染**：所有注入至網頁的反白字典介面均嚴格封裝於 Shadow DOM 內，並對所有遠端回傳文字進行 HTML 跳脫處理（XSS 防護）。
4. **本地離線模型**：選用 Hugging Face 本地超小模型時，模型權重僅快取於瀏覽器本機 Cache API，推論過程完全不將網頁文字傳送至外部伺服器。

---

## 如何回報安全性漏洞 (Reporting a Vulnerability)

如果您在 TransMao 中發現任何安全性問題（例如 XSS、權限濫用、CSP 繞過或依賴套件高風險漏洞），請**勿**直接於公開 Issue 揭露細節，請透過以下方式聯繫維護者：

1. 前往本 GitHub 倉庫的 **Security → Advisories → Report a vulnerability** 提交私密安全通報（Private Vulnerability Reporting）。
2. 或於 GitHub 聯繫作者 **SxiMao (`@SixMao0122`)**。

我們將在收到通報後 **72 小時內** 確認回覆，並於修復驗證後公開致謝（若您願意署名）。
