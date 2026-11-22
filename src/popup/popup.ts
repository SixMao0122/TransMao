import { getSettings, saveSettings } from '../shared/storage';
import {
  DisplayMode,
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

async function getActiveTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

function updateToggleButton(state?: PageTranslationState): void {
  if (state?.active) {
    toggleBtn.classList.add('active');
    toggleBtn.textContent = '↩️ 還原原始英文網頁';
    statusLine.textContent = `已翻譯 ${state.translatedCount} 個段落 · 引擎：${state.engineUsed || '運作中'}`;
  } else {
    toggleBtn.classList.remove('active');
    toggleBtn.textContent = '🌐 翻譯整個網頁';
  }
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
        updateToggleButton(res.state);
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
  statusLine.textContent = '正在啟動 TransMao 翻譯引擎...';

  try {
    const res = (await chrome.tabs.sendMessage(tabId, {
      type: 'TOGGLE_PAGE_TRANSLATE',
      displayMode: displayModeEl.value as DisplayMode,
    } satisfies RuntimeMessage)) as { ok: boolean; state?: PageTranslationState; error?: string };

    if (res?.ok && res.state) {
      updateToggleButton(res.state);
    } else {
      statusLine.textContent = res?.error || '無法翻譯此頁面';
    }
  } catch {
    statusLine.textContent = '請重新整理網頁後再點擊翻譯';
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

void init();
