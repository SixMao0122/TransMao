import { toTraditionalTW } from './opencc';
import { isSingleEnglishWord, mapPosToZhTW } from './text-utils';
import { DictionaryMeaning, DictionaryResult, TranslationEngineMode } from './types';

const BATCH_DELIMITER = '\n§TM§\n';
const FETCH_TIMEOUT_MS = 10000;

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 引擎 1：Google Translate 免 Key RPC (速度最快、支援批次)
 */
export async function translateViaGoogleSingle(text: string): Promise<string> {
  const url =
    `https://translate.googleapis.com/translate_a/single` +
    `?client=gtx&sl=en&tl=zh-TW&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    throw new Error(`Google Translate HTTP ${res.status}`);
  }
  const data = (await res.json()) as unknown[];
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error('Google Translate invalid payload');
  }
  const translated = (data[0] as Array<[string, string]>)
    .map((segment) => (Array.isArray(segment) ? segment[0] : ''))
    .join('');
  return toTraditionalTW(translated.trim());
}

export async function translateViaGoogleBatch(texts: string[]): Promise<string[]> {
  if (texts.length === 0) return [];
  if (texts.length === 1) {
    return [await translateViaGoogleSingle(texts[0])];
  }

  const joined = texts.join(BATCH_DELIMITER);
  const translatedJoined = await translateViaGoogleSingle(joined);
  const parts = translatedJoined.split(/\s*§\s*TM\s*§\s*/i);

  if (parts.length === texts.length) {
    return parts.map((p) => toTraditionalTW(p.trim()));
  }

  // 若分隔符被遠端調整導致行數不符，自動降級為單筆並發翻譯，確保段落 100% 對齊
  return Promise.all(texts.map((t) => translateViaGoogleSingle(t)));
}

/**
 * 引擎 2：MyMemory 免費翻譯 API (Google 失效或 429 時之雲端自動備援)
 */
export async function translateViaMyMemorySingle(text: string): Promise<string> {
  const clipped = text.slice(0, 480);
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clipped)}&langpair=en|zh-TW`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    throw new Error(`MyMemory HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    responseStatus?: number;
    responseData?: { translatedText?: string };
  };
  const out = data?.responseData?.translatedText;
  if (!out || data?.responseStatus === 429) {
    throw new Error('MyMemory unavailable or rate-limited');
  }
  return toTraditionalTW(out.trim());
}

export async function translateViaMyMemoryBatch(texts: string[]): Promise<string[]> {
  const results: string[] = [];
  for (const text of texts) {
    results.push(await translateViaMyMemorySingle(text));
  }
  return results;
}

export type LocalHfTranslateFn = (texts: string[]) => Promise<string[]>;

/**
 * 多引擎自動容錯調度器 (Failover Router)
 * - auto: Google -> MyMemory -> Hugging Face 本地模型
 * - google: Google -> MyMemory
 * - mymemory: MyMemory -> Google
 * - hf-local: Hugging Face 本地超小模型 (離線優先) -> Google 備援
 */
export async function translateBatchWithFailover(
  texts: string[],
  mode: TranslationEngineMode,
  localHfFn?: LocalHfTranslateFn
): Promise<{ translations: string[]; engineUsed: string }> {
  if (texts.length === 0) {
    return { translations: [], engineUsed: mode };
  }

  type EngineRunner = { name: string; run: () => Promise<string[]> };
  const googleRunner: EngineRunner = {
    name: 'Google (zh-TW)',
    run: () => translateViaGoogleBatch(texts),
  };
  const myMemoryRunner: EngineRunner = {
    name: 'MyMemory (備援)',
    run: () => translateViaMyMemoryBatch(texts),
  };
  const hfRunner: EngineRunner | null = localHfFn
    ? {
        name: 'HuggingFace 本地模型',
        run: async () => {
          const out = await localHfFn(texts);
          return out.map((s) => toTraditionalTW(s));
        },
      }
    : null;

  let pipeline: EngineRunner[];
  switch (mode) {
    case 'hf-local':
      pipeline = hfRunner ? [hfRunner, googleRunner, myMemoryRunner] : [googleRunner, myMemoryRunner];
      break;
    case 'mymemory':
      pipeline = [myMemoryRunner, googleRunner];
      break;
    case 'google':
      pipeline = [googleRunner, myMemoryRunner];
      break;
    case 'auto':
    default:
      pipeline = hfRunner ? [googleRunner, myMemoryRunner, hfRunner] : [googleRunner, myMemoryRunner];
      break;
  }

  let lastError: unknown = null;
  for (const runner of pipeline) {
    try {
      const translations = await runner.run();
      if (translations.length === texts.length) {
        return { translations, engineUsed: runner.name };
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    `所有翻譯引擎均暫時無法回應：${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

interface FreeDictEntry {
  word: string;
  phonetic?: string;
  phonetics?: Array<{ text?: string; audio?: string }>;
  meanings?: Array<{
    partOfSpeech: string;
    definitions: Array<{
      definition: string;
      example?: string;
    }>;
  }>;
}

/**
 * 反白單字 / 片語深度辭典查詢
 * 整合 Free Dictionary API (音標、詞性、真人發音 MP3、英文例句) + 繁體中文翻譯
 */
export async function lookupDictionary(
  rawText: string,
  mode: TranslationEngineMode,
  localHfFn?: LocalHfTranslateFn
): Promise<DictionaryResult> {
  const cleaned = rawText.trim();
  const singleWord = isSingleEnglishWord(cleaned);

  const [primaryTransRes, dictEntries] = await Promise.all([
    translateBatchWithFailover([cleaned], mode, localHfFn),
    singleWord ? fetchFreeDictionary(cleaned.toLowerCase()) : Promise.resolve(null),
  ]);

  const primaryTranslation = primaryTransRes.translations[0] ?? cleaned;
  const engineUsed = primaryTransRes.engineUsed;

  if (!dictEntries || dictEntries.length === 0) {
    return {
      word: cleaned,
      translation: primaryTranslation,
      meanings: [],
      engineUsed,
      isPhrase: !singleWord,
    };
  }

  const entry = dictEntries[0];
  let phonetic = entry.phonetic;
  let audioUs: string | undefined;
  let audioUk: string | undefined;

  for (const p of entry.phonetics ?? []) {
    if (!phonetic && p.text) phonetic = p.text;
    if (p.audio) {
      const audioUrl = p.audio.startsWith('//') ? `https:${p.audio}` : p.audio;
      if (/-us\.mp3/i.test(audioUrl)) {
        audioUs = audioUrl;
      } else if (/-uk\.mp3/i.test(audioUrl)) {
        audioUk = audioUrl;
      } else if (!audioUs) {
        audioUs = audioUrl;
      }
    }
  }

  // 擷取前 3 個詞性，每個詞性最多取 2 條釋義與對應例句
  const rawMeanings = (entry.meanings ?? []).slice(0, 3).map((m) => ({
    partOfSpeech: m.partOfSpeech,
    defs: (m.definitions ?? []).slice(0, 2),
  }));

  // 收集所有需要翻譯成繁中的釋義與例句，一次批次送出翻譯以達到極速回應
  const stringsToTranslate: string[] = [];
  for (const m of rawMeanings) {
    for (const d of m.defs) {
      stringsToTranslate.push(d.definition);
      if (d.example) {
        stringsToTranslate.push(d.example);
      }
    }
  }

  let translatedStrings: string[] = [];
  if (stringsToTranslate.length > 0) {
    try {
      const batchRes = await translateBatchWithFailover(stringsToTranslate, mode, localHfFn);
      translatedStrings = batchRes.translations;
    } catch {
      translatedStrings = stringsToTranslate;
    }
  }

  let cursor = 0;
  const meanings: DictionaryMeaning[] = rawMeanings.map((m) => {
    const posInfo = mapPosToZhTW(m.partOfSpeech);
    return {
      partOfSpeech: m.partOfSpeech,
      partOfSpeechZh: `${posInfo.short} ${posInfo.zh}`,
      definitions: m.defs.map((d) => {
        const defZh = translatedStrings[cursor++] ?? d.definition;
        let example: { en: string; zh: string } | undefined;
        if (d.example) {
          const exZh = translatedStrings[cursor++] ?? d.example;
          example = { en: d.example, zh: exZh };
        }
        return {
          en: d.definition,
          zh: defZh,
          example,
        };
      }),
    };
  });

  return {
    word: entry.word || cleaned,
    translation: primaryTranslation,
    phonetic,
    audioUs,
    audioUk,
    meanings,
    engineUsed,
    isPhrase: false,
  };
}

async function fetchFreeDictionary(word: string): Promise<FreeDictEntry[] | null> {
  try {
    const res = await fetchWithTimeout(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      undefined,
      6000
    );
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as FreeDictEntry[]) : null;
  } catch {
    return null;
  }
}
