import {
  clearTranslationCache,
  getSavedVocab,
  getSettings,
  saveSettings,
  toggleSavedVocab,
} from '../shared/storage';
import { HfModelId, HfModelStatus, RuntimeMessage } from '../shared/types';

const SVG_SPEAKER = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
const SVG_TRASH = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`;

const hfModelEl = document.getElementById('hfModel') as HTMLSelectElement;
const hfStatusText = document.getElementById('hfStatusText') as HTMLDivElement;
const hfProgressBar = document.getElementById('hfProgressBar') as HTMLDivElement;
const preloadHfBtn = document.getElementById('preloadHfBtn') as HTMLButtonElement;
const autoSpeakEl = document.getElementById('autoSpeak') as HTMLInputElement;
const blacklistEl = document.getElementById('blacklist') as HTMLTextAreaElement;
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const clearCacheBtn = document.getElementById('clearCacheBtn') as HTMLButtonElement;
const saveMsg = document.getElementById('saveMsg') as HTMLSpanElement;
const vocabCount = document.getElementById('vocabCount') as HTMLSpanElement;
const vocabListEl = document.getElementById('vocabList') as HTMLDivElement;
const exportVocabBtn = document.getElementById('exportVocabBtn') as HTMLButtonElement;

function flashMessage(msg: string): void {
  saveMsg.textContent = msg;
  setTimeout(() => {
    if (saveMsg.textContent === msg) saveMsg.textContent = '';
  }, 2400);
}

async function renderVocab(): Promise<void> {
  const list = await getSavedVocab();
  vocabCount.textContent = String(list.length);
  if (list.length === 0) {
    vocabListEl.innerHTML =
      '<div style="color: #787166; font-size: 13px;">尚未收藏任何單字，在網頁反白英文單字並點擊「收藏」即可加入這裡。</div>';
    return;
  }

  vocabListEl.innerHTML = '';
  for (const item of list) {
    const row = document.createElement('div');
    row.className = 'vocab-item';
    row.innerHTML = `
      <div>
        <div class="vocab-word">${escapeHtml(item.word)}<span class="vocab-phonetic">${escapeHtml(item.phonetic || '')}</span></div>
        <div class="vocab-zh">${item.partOfSpeech ? `[${escapeHtml(item.partOfSpeech)}] ` : ''}${escapeHtml(item.translation)}</div>
        ${item.exampleEn ? `<div class="vocab-ex">“${escapeHtml(item.exampleEn)}”<br/>${escapeHtml(item.exampleZh || '')}</div>` : ''}
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        <button class="btn btn-secondary icon-btn speak-btn" title="朗讀">${SVG_SPEAKER}</button>
        <button class="btn btn-secondary icon-btn del-btn" title="移除">${SVG_TRASH}</button>
      </div>
    `;

    row.querySelector('.speak-btn')?.addEventListener('click', () => {
      const u = new SpeechSynthesisUtterance(item.word);
      u.lang = 'en-US';
      window.speechSynthesis.speak(u);
    });

    row.querySelector('.del-btn')?.addEventListener('click', async () => {
      await toggleSavedVocab(item);
      await renderVocab();
    });

    vocabListEl.appendChild(row);
  }
}

async function pollHfStatus(): Promise<void> {
  try {
    const res = (await chrome.runtime.sendMessage({ type: 'HF_STATUS' } satisfies RuntimeMessage)) as {
      ok: boolean;
      status?: HfModelStatus;
    };
    if (res?.ok && res.status) {
      const st = res.status;
      hfProgressBar.style.width = `${st.progress}%`;
      if (st.ready) {
        hfStatusText.textContent = `模型已就緒：${st.modelId} (100%)`;
      } else if (st.loading) {
        hfStatusText.textContent = `正在載入模型 ${st.modelId}... (${st.progress}%)`;
      } else if (st.error) {
        hfStatusText.textContent = `模型載入失敗：${st.error}`;
      }
    }
  } catch {
    // 忽略查詢錯誤
  }
}

async function init(): Promise<void> {
  const settings = await getSettings();
  hfModelEl.value = settings.hfModel;
  autoSpeakEl.checked = settings.autoSpeak;
  blacklistEl.value = settings.blacklistDomains.join('\n');

  await renderVocab();
  await pollHfStatus();
}

saveBtn.addEventListener('click', async () => {
  const domains = blacklistEl.value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  await saveSettings({
    hfModel: hfModelEl.value as HfModelId,
    autoSpeak: autoSpeakEl.checked,
    blacklistDomains: domains,
  });
  flashMessage('設定已儲存');
});

clearCacheBtn.addEventListener('click', async () => {
  await clearTranslationCache();
  flashMessage('已清除本地翻譯快取');
});

preloadHfBtn.addEventListener('click', async () => {
  const modelId = hfModelEl.value as HfModelId;
  await saveSettings({ hfModel: modelId });
  preloadHfBtn.disabled = true;
  hfStatusText.textContent = `正在啟動並下載 ${modelId}...`;

  const timer = window.setInterval(() => void pollHfStatus(), 800);
  try {
    const res = (await chrome.runtime.sendMessage({
      type: 'HF_PRELOAD',
      modelId,
    } satisfies RuntimeMessage)) as { ok: boolean; error?: string };
    if (res?.ok) {
      hfProgressBar.style.width = '100%';
      hfStatusText.textContent = `本地模型 ${modelId} 載入完成，現在可於離線模式使用`;
    } else {
      hfStatusText.textContent = `載入失敗：${res?.error || '未知錯誤'}`;
    }
  } catch (err) {
    hfStatusText.textContent = `載入失敗：${String(err)}`;
  } finally {
    window.clearInterval(timer);
    preloadHfBtn.disabled = false;
  }
});

exportVocabBtn.addEventListener('click', async () => {
  const list = await getSavedVocab();
  const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `transmao-vocab-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

void init();
