import { lookupDictionary, translateBatchWithFailover } from '../shared/engines';
import {
  getCachedTranslations,
  getSettings,
  setCachedTranslations,
} from '../shared/storage';
import { HfModelId, RuntimeMessage, TranslationEngineMode } from '../shared/types';

const OFFSCREEN_URL = 'offscreen.html';

async function ensureOffscreenDocument(): Promise<void> {
  if (!chrome.offscreen) {
    throw new Error('目前瀏覽器不支援 Offscreen Document API');
  }
  const existing = await chrome.offscreen.hasDocument();
  if (existing) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification: '在本地執行 Hugging Face Transformers.js 超小翻譯模型',
  });
}

async function translateViaOffscreenHf(texts: string[], modelId: HfModelId): Promise<string[]> {
  await ensureOffscreenDocument();
  const res = (await chrome.runtime.sendMessage({
    type: 'HF_TRANSLATE',
    texts,
    modelId,
  } satisfies RuntimeMessage)) as { ok: boolean; translations?: string[]; error?: string };

  if (!res?.ok || !res.translations) {
    throw new Error(res?.error || 'Hugging Face 本地模型推論失敗');
  }
  return res.translations;
}

// 安裝或更新時建立簡潔右鍵選單
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'transmao-toggle-page',
      title: '翻譯此頁',
      contexts: ['page'],
    });
    chrome.contextMenus.create({
      id: 'transmao-lookup-selection',
      title: '查詢「%s」',
      contexts: ['selection'],
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === 'transmao-toggle-page') {
    const settings = await getSettings();
    chrome.tabs.sendMessage(tab.id, {
      type: 'TOGGLE_PAGE_TRANSLATE',
      displayMode: settings.displayMode,
    } satisfies RuntimeMessage);
  } else if (info.menuItemId === 'transmao-lookup-selection' && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'LOOKUP_WORD',
      text: info.selectionText,
    } satisfies RuntimeMessage);
  }
});

chrome.runtime.onMessage.addListener((msg: RuntimeMessage, _sender, sendResponse) => {
  if (msg.type === 'TRANSLATE_BATCH') {
    handleTranslateBatch(msg.texts, msg.engine)
      .then((res) => sendResponse(res))
      .catch((err) =>
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })
      );
    return true;
  }

  if (msg.type === 'LOOKUP_WORD') {
    handleLookupWord(msg.text, msg.engine)
      .then((res) => sendResponse(res))
      .catch((err) =>
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })
      );
    return true;
  }

  if (msg.type === 'HF_PRELOAD') {
    ensureOffscreenDocument()
      .then(() => chrome.runtime.sendMessage(msg))
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (msg.type === 'HF_STATUS') {
    chrome.offscreen
      ?.hasDocument()
      .then((has) => {
        if (!has) {
          sendResponse({
            ok: true,
            status: { ready: false, loading: false, progress: 0, modelId: 'Xenova/opus-mt-en-zh' },
          });
          return;
        }
        chrome.runtime.sendMessage(msg).then((res) => sendResponse(res));
      })
      .catch(() =>
        sendResponse({
          ok: true,
          status: { ready: false, loading: false, progress: 0, modelId: 'Xenova/opus-mt-en-zh' },
        })
      );
    return true;
  }

  return false;
});

async function handleTranslateBatch(texts: string[], overrideEngine?: TranslationEngineMode) {
  const settings = await getSettings();
  const mode = overrideEngine ?? settings.engine;

  // 先查詢本地快取，僅翻譯尚未命中的文字
  const cachedMap = await getCachedTranslations(texts);
  const missingIndices: number[] = [];
  const missingTexts: string[] = [];

  texts.forEach((t, idx) => {
    if (!cachedMap[t]) {
      missingIndices.push(idx);
      missingTexts.push(t);
    }
  });

  if (missingTexts.length === 0) {
    return {
      ok: true,
      translations: texts.map((t) => cachedMap[t]),
      engineUsed: '本地快取',
    };
  }

  const localHfFn =
    mode === 'hf-local'
      ? (batch: string[]) => translateViaOffscreenHf(batch, settings.hfModel)
      : undefined;

  const { translations: newlyTranslated, engineUsed } = await translateBatchWithFailover(
    missingTexts,
    mode,
    localHfFn
  );

  const toCache: Record<string, string> = {};
  const finalResults = texts.map((t) => cachedMap[t] ?? '');

  missingIndices.forEach((origIdx, i) => {
    const val = newlyTranslated[i] ?? texts[origIdx];
    finalResults[origIdx] = val;
    toCache[texts[origIdx]] = val;
  });

  await setCachedTranslations(toCache);

  return {
    ok: true,
    translations: finalResults,
    engineUsed,
  };
}

async function handleLookupWord(text: string, overrideEngine?: TranslationEngineMode) {
  const settings = await getSettings();
  const mode = overrideEngine ?? settings.engine;
  const localHfFn =
    mode === 'hf-local'
      ? (batch: string[]) => translateViaOffscreenHf(batch, settings.hfModel)
      : undefined;

  const data = await lookupDictionary(text, mode, localHfFn);
  return { ok: true, data };
}
