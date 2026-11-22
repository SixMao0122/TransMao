import { getSettings } from '../shared/storage';
import { BoxRect, isTranslatableEnglish, normalizeSelectedText } from '../shared/text-utils';
import {
  DEFAULT_SETTINGS,
  DictionaryLookupResponse,
  RuntimeMessage,
  UserSettings,
} from '../shared/types';
import { PageDomTranslator } from './dom-translator';
import { TransMaoPopover } from './popover';

const translator = new PageDomTranslator();
const popover = new TransMaoPopover();
let settings: UserSettings = { ...DEFAULT_SETTINGS };

function isCurrentHostBlacklisted(): boolean {
  const host = window.location.hostname.toLowerCase();
  return settings.blacklistDomains.some((d) => {
    const clean = d.trim().toLowerCase();
    return clean && (host === clean || host.endsWith(`.${clean}`));
  });
}

async function init(): Promise<void> {
  settings = await getSettings();
}

void init();

function isExtensionAlive(): boolean {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

async function triggerLookup(text: string, anchor: BoxRect): Promise<void> {
  if (!isExtensionAlive()) {
    popover.showErrorCard(text, '擴充套件已更新，請按 F5 重新整理此分頁以啟用最新版本。', anchor);
    return;
  }
  popover.showLoadingCard(text, anchor);
  try {
    const res = (await chrome.runtime.sendMessage({
      type: 'LOOKUP_WORD',
      text,
    } satisfies RuntimeMessage)) as DictionaryLookupResponse;

    if (res?.ok && res.data) {
      await popover.showResultCard(res.data, anchor, settings.autoSpeak);
    } else {
      popover.showErrorCard(text, res?.error || '無法取得釋義', anchor);
    }
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const friendlyMsg = rawMsg.includes('Extension context invalidated')
      ? '擴充套件已更新，請按 F5 重新整理此分頁以啟用最新版本。'
      : rawMsg;
    popover.showErrorCard(text, friendlyMsg, anchor);
  }
}

// 監聽反白選取事件
document.addEventListener('mouseup', (event) => {
  if (!isExtensionAlive()) return;
  if (popover.isEventInside(event)) return;
  if (!settings.selectionEnabled || isCurrentHostBlacklisted()) return;

  // 略過輸入框內部的文字選取，避免打字時誤觸
  const activeEl = document.activeElement;
  if (
    activeEl &&
    (activeEl.tagName === 'INPUT' ||
      activeEl.tagName === 'TEXTAREA' ||
      (activeEl as HTMLElement).isContentEditable)
  ) {
    return;
  }

  window.setTimeout(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      popover.hideAll();
      return;
    }

    const rawText = sel.toString();
    const cleaned = normalizeSelectedText(rawText);
    if (!cleaned || cleaned.length > 260 || !isTranslatableEnglish(cleaned)) {
      popover.hideAll();
      return;
    }

    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    const anchor: BoxRect = {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };

    if (settings.selectionTrigger === 'instant') {
      void triggerLookup(cleaned, anchor);
    } else {
      popover.showTriggerIcon(anchor, () => {
        void triggerLookup(cleaned, anchor);
      });
    }
  }, 15);
});

// 點擊卡片外部或按下 Esc 立即關閉
document.addEventListener('mousedown', (event) => {
  if (!popover.isEventInside(event)) {
    popover.hideAll();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    popover.hideAll();
    return;
  }
  // 快捷鍵 Alt + T：快速開關全頁翻譯
  if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 't') {
    event.preventDefault();
    const state = translator.toggle(settings.displayMode, settings.engine);
    popover.showToast(
      state.active
        ? `TransMao 已啟動${settings.displayMode === 'bilingual' ? '雙語對照' : '繁中替換'}（Alt+T）`
        : 'TransMao 已還原為英文原文'
    );
  }
});

// 接收 Popup / 右鍵選單指令
chrome.runtime.onMessage.addListener((msg: RuntimeMessage, _sender, sendResponse) => {
  if (msg.type === 'TOGGLE_PAGE_TRANSLATE') {
    const mode = msg.displayMode ?? settings.displayMode;
    const state = translator.toggle(mode, settings.engine);
    if (state.active) {
      popover.showToast(
        `TransMao 正在翻譯（${mode === 'bilingual' ? '雙語對照' : '繁中替換'}）`
      );
    } else {
      popover.showToast('TransMao 已還原為英文原文');
    }
    sendResponse({ ok: true, state });
    return false;
  }

  if (msg.type === 'GET_PAGE_STATE') {
    sendResponse({ ok: true, state: translator.getState() });
    return false;
  }

  if (msg.type === 'LOOKUP_WORD') {
    const cleaned = normalizeSelectedText(msg.text);
    const fallbackAnchor: BoxRect = {
      left: window.innerWidth / 2 - 180,
      top: 90,
      right: window.innerWidth / 2 + 180,
      bottom: 110,
      width: 360,
      height: 20,
    };
    if (cleaned) {
      void triggerLookup(cleaned, fallbackAnchor);
    }
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'SETTINGS_UPDATED') {
    settings = msg.settings;
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
