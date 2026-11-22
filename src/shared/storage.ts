import { DEFAULT_SETTINGS, SavedVocabItem, UserSettings } from './types';

const SETTINGS_KEY = 'transmao_settings';
const VOCAB_KEY = 'transmao_vocab';
const CACHE_KEY = 'transmao_cache_v1';
const MAX_CACHE_ENTRIES = 800;

export async function getSettings(): Promise<UserSettings> {
  try {
    const res = await chrome.storage.sync.get(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...(res[SETTINGS_KEY] ?? {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(partial: Partial<UserSettings>): Promise<UserSettings> {
  const current = await getSettings();
  const next: UserSettings = { ...current, ...partial };
  await chrome.storage.sync.set({ [SETTINGS_KEY]: next });
  return next;
}

export async function getSavedVocab(): Promise<SavedVocabItem[]> {
  try {
    const res = await chrome.storage.local.get(VOCAB_KEY);
    return Array.isArray(res[VOCAB_KEY]) ? res[VOCAB_KEY] : [];
  } catch {
    return [];
  }
}

export async function toggleSavedVocab(item: SavedVocabItem): Promise<{ saved: boolean; list: SavedVocabItem[] }> {
  const list = await getSavedVocab();
  const normalized = item.word.toLowerCase();
  const existingIdx = list.findIndex((v) => v.word.toLowerCase() === normalized);

  if (existingIdx >= 0) {
    list.splice(existingIdx, 1);
    await chrome.storage.local.set({ [VOCAB_KEY]: list });
    return { saved: false, list };
  }

  const next = [item, ...list].slice(0, 500);
  await chrome.storage.local.set({ [VOCAB_KEY]: next });
  return { saved: true, list: next };
}

export async function isWordSaved(word: string): Promise<boolean> {
  const list = await getSavedVocab();
  const target = word.toLowerCase();
  return list.some((v) => v.word.toLowerCase() === target);
}

// 簡易持久化 LRU 翻譯快取，減少重複 API 呼叫與提升二次瀏覽速度
type CacheMap = Record<string, { value: string; ts: number }>;

export async function getCachedTranslations(keys: string[]): Promise<Record<string, string>> {
  try {
    const res = await chrome.storage.local.get(CACHE_KEY);
    const cache: CacheMap = (res[CACHE_KEY] as CacheMap | undefined) ?? {};
    const found: Record<string, string> = {};
    for (const k of keys) {
      if (cache[k]?.value) {
        found[k] = cache[k].value;
      }
    }
    return found;
  } catch {
    return {};
  }
}

export async function setCachedTranslations(entries: Record<string, string>): Promise<void> {
  try {
    const res = await chrome.storage.local.get(CACHE_KEY);
    const cache: CacheMap = (res[CACHE_KEY] as CacheMap | undefined) ?? {};
    const now = Date.now();
    for (const [k, v] of Object.entries(entries)) {
      if (k && v) {
        cache[k] = { value: v, ts: now };
      }
    }
    const allKeys = Object.keys(cache);
    if (allKeys.length > MAX_CACHE_ENTRIES) {
      allKeys
        .sort((a, b) => cache[a].ts - cache[b].ts)
        .slice(0, allKeys.length - MAX_CACHE_ENTRIES)
        .forEach((oldKey) => delete cache[oldKey]);
    }
    await chrome.storage.local.set({ [CACHE_KEY]: cache });
  } catch {
    // 忽略儲存配額錯誤，不影響翻譯主流程
  }
}

export async function clearTranslationCache(): Promise<void> {
  await chrome.storage.local.remove(CACHE_KEY);
}
