import { getSettings, saveSettings } from '../shared/storage';
import {
  DisplayMode,
  HfModelStatus,
  PageTranslationState,
  RuntimeMessage,
  SelectionTriggerMode,
  TranslationEngineMode,
} from '../shared/types';

const toggleBtn = document.getElementById('toggleBtn') as HTMLButtonElement;
const statusLine = document.getElementById('statusLine') as HTMLDivElement;
const displayModeEl = document.getElementById('displayMode') as HTMLSelectElement;
const engineEl = document.getElementById('engineSelect') as HTMLSelectElement;
const selectionToggleEl = document.getElementById('selectionToggle') as HTMLInputElement;
const triggerEl = document.getElementById('triggerSelect') as HTMLSelectElement;
const openOptionsBtn = document.getElementById('openOptions') as HTMLButtonElement;

let pollTimer: number | null = null;

async function getActiveTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

function stopPolling(): void {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function renderState(state?: PageTranslationState): Promise<void> {
  if (state?.active) {
    toggleBtn.classList.add('active');
    toggleBtn.textContent = '還原為英文原文';

    if (state.translating) {
      let extra = '';
      if (engineEl.value === 'hf-local' && state.translatedCount === 0) {
        try {
          const hfRes = (await chrome.runtime.sendMessage({
            type: 'HF_STATUS',
          } satisfies RuntimeMessage)) as { ok: boolean; status?: HfModelStatus };
          if (hfRes?.ok && hfRes.status?.loading) {
            extra = `（本地模型載入中 ${hfRes.status.progress}%）`;
          }
        } catch {
          // 忽略查詢錯誤
        }
      }
      statusLine.textContent = extra
        ? `準備翻譯中${extra}`
        : `翻譯中：${state.translatedCount} / ${state.totalCount} 段${state.engineUsed ? ` · ${state.engineUsed}` : ''}`;
      startPolling();
    } else {
      stopPolling();
      if (state.lastError && state.translatedCount === 0) {
        statusLine.textContent = `翻譯異常：${state.lastError}`;
      } else {
        statusLine.textContent = `已完成翻譯（${state.translatedCount} 個段落 · ${state.engineUsed || '運作中'}）`;
      }
    }
  } else {
    stopPolling();
    toggleBtn.classList.remove('active');
    toggleBtn.textContent = '翻譯整個網頁';
    statusLine.textContent = '反白網頁英文單字即可查看繁中釋義、詞性與發音';
  }
}

function startPolling(): void {
  if (pollTimer !== null) return;
  pollTimer = window.setInterval(async () => {
    const tabId = await getActiveTabId();
    if (tabId === null) {
      stopPolling();
      return;
    }
    try {
      const res = (await chrome.tabs.sendMessage(tabId, {
        type: 'GET_PAGE_STATE',
      } satisfies RuntimeMessage)) as { ok: boolean; state?: PageTranslationState };
      if (res?.ok && res.state) {
        await renderState(res.state);
      }
    } catch {
      stopPolling();
    }
  }, 550);
}

async function broadcastSettingsUpdate(): Promise<void> {
  const settings = await getSettings();
  const tabId = await getActiveTabId();
  if (tabId !== null) {
    chrome.tabs
      .sendMessage(tabId, { type: 'SETTINGS_UPDATED', settings } satisfies RuntimeMessage)
      .catch(() => {});
  }
}

async function init(): Promise<void> {
  const settings = await getSettings();
  displayModeEl.value = settings.displayMode;
  engineEl.value = settings.engine;
  selectionToggleEl.checked = settings.selectionEnabled;
  triggerEl.value = settings.selectionTrigger;

  const tabId = await getActiveTabId();
  if (tabId !== null) {
    try {
      const res = (await chrome.tabs.sendMessage(tabId, {
        type: 'GET_PAGE_STATE',
      } satisfies RuntimeMessage)) as { ok: boolean; state?: PageTranslationState };
      if (res?.ok && res.state) {
        await renderState(res.state);
      }
    } catch {
      statusLine.textContent = '此系統分頁不支援注入翻譯，請切換至一般英文網頁';
      toggleBtn.disabled = true;
    }
  }
}

toggleBtn.addEventListener('click', async () => {
  const tabId = await getActiveTabId();
  if (tabId === null) return;

  toggleBtn.disabled = true;
  try {
    // 確保先將最新選擇的引擎與顯示模式同步到分頁，再執行翻譯
    await broadcastSettingsUpdate();
    const res = (await chrome.tabs.sendMessage(tabId, {
      type: 'TOGGLE_PAGE_TRANSLATE',
      displayMode: displayModeEl.value as DisplayMode,
    } satisfies RuntimeMessage)) as { ok: boolean; state?: PageTranslationState; error?: string };

    if (res?.ok && res.state) {
      await renderState(res.state);
    } else {
      statusLine.textContent = res?.error || '無法翻譯此頁面';
    }
  } catch {
    statusLine.textContent = '請按 F5 重新整理網頁後再點擊翻譯';
  } finally {
    toggleBtn.disabled = false;
  }
});

displayModeEl.addEventListener('change', async () => {
  await saveSettings({ displayMode: displayModeEl.value as DisplayMode });
  await broadcastSettingsUpdate();
});

engineEl.addEventListener('change', async () => {
  await saveSettings({ engine: engineEl.value as TranslationEngineMode });
  await broadcastSettingsUpdate();
});

selectionToggleEl.addEventListener('change', async () => {
  await saveSettings({ selectionEnabled: selectionToggleEl.checked });
  await broadcastSettingsUpdate();
});

triggerEl.addEventListener('change', async () => {
  await saveSettings({ selectionTrigger: triggerEl.value as SelectionTriggerMode });
  await broadcastSettingsUpdate();
});

openOptionsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

window.addEventListener('unload', stopPolling);

void init();
