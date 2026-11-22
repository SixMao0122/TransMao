import { toTraditionalTW } from './opencc';
import { formatPosLabel, isSingleEnglishWord } from './text-utils';
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
  // 5 路並發請求，大幅加速 MyMemory 整頁翻譯速度（比單條串行快約 5 倍）
  const concurrency = 5;
  const results = new Array<string>(texts.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < texts.length) {
      const idx = cursor++;
      results[idx] = await translateViaMyMemorySingle(texts[idx]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, texts.length) }, () => worker()));
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

interface GoogleRichDictData {
  translation: string;
  meanings: Array<{
    partOfSpeech: string;
    zhTerms: string[];
    enDefs: Array<{ en: string; exampleEn?: string }>;
  }>;
  extraExamples: string[];
}

const dictLookupCache = new Map<string, DictionaryResult>();

function stripHtmlTags(raw: string): string {
  return raw.replace(/<[^>]+>/g, '').trim();
}

/**
 * 單次高速請求 Google Rich Dictionary (dt=t + bd + md + ex)
 * 一次取得：繁中翻譯、詞性、繁中常見詞義、英文解釋與例句（約 150~250ms）
 */
async function fetchGoogleRichDict(text: string): Promise<GoogleRichDictData | null> {
  try {
    const url =
      `https://translate.googleapis.com/translate_a/single` +
      `?client=gtx&sl=en&tl=zh-TW&dt=t&dt=bd&dt=md&dt=ex&q=${encodeURIComponent(text)}`;
    const res = await fetchWithTimeout(url, undefined, 4500);
    if (!res.ok) return null;
    const data = (await res.json()) as unknown[];
    if (!Array.isArray(data) || !Array.isArray(data[0])) return null;

    const translation = toTraditionalTW(
      (data[0] as Array<[string, string]>)
        .map((seg) => (Array.isArray(seg) ? seg[0] : ''))
        .join('')
        .trim()
    );

    const meaningsMap = new Map<
      string,
      { zhTerms: string[]; enDefs: Array<{ en: string; exampleEn?: string }> }
    >();

    // data[1]: 詞性與繁中詞義列表 [[pos, [term1, term2, ...], ...]]
    if (Array.isArray(data[1])) {
      for (const item of data[1] as Array<[string, string[]]>) {
        if (!Array.isArray(item) || typeof item[0] !== 'string') continue;
        const pos = item[0].toLowerCase();
        const terms = Array.isArray(item[1])
          ? item[1].slice(0, 5).map((t) => toTraditionalTW(String(t)))
          : [];
        meaningsMap.set(pos, { zhTerms: terms, enDefs: [] });
      }
    }

    // data[12]: 英文釋義與例句 [[pos, [[enDef, id, example], ...]]]
    if (Array.isArray(data[12])) {
      for (const block of data[12] as Array<[string, Array<[string, string, string?]>]>) {
        if (!Array.isArray(block) || typeof block[0] !== 'string' || !Array.isArray(block[1])) continue;
        const pos = block[0].toLowerCase();
        const entry = meaningsMap.get(pos) ?? { zhTerms: [], enDefs: [] };
        for (const defRow of block[1].slice(0, 2)) {
          if (typeof defRow?.[0] === 'string') {
            entry.enDefs.push({
              en: defRow[0],
              exampleEn: typeof defRow[2] === 'string' ? stripHtmlTags(defRow[2]) : undefined,
            });
          }
        }
        meaningsMap.set(pos, entry);
      }
    }

    // data[13]: 補充例句
    const extraExamples: string[] = [];
    if (Array.isArray(data[13]) && Array.isArray(data[13][0])) {
      for (const exRow of (data[13][0] as Array<[string]>).slice(0, 2)) {
        if (typeof exRow?.[0] === 'string') {
          extraExamples.push(stripHtmlTags(exRow[0]));
        }
      }
    }

    const meanings = Array.from(meaningsMap.entries())
      .slice(0, 3)
      .map(([partOfSpeech, val]) => ({
        partOfSpeech,
        zhTerms: val.zhTerms,
        enDefs: val.enDefs,
      }));

    return { translation, meanings, extraExamples };
  } catch {
    return null;
  }
}

/**
 * 極速反白單字 / 片語查詢：
 * 1. 先查記憶體快取（0ms）
 * 2. 平行呼叫 Google Rich Dict (150ms) 與 Free Dictionary API (嚴格 1.5s 上限取音標與真人 MP3)
 * 3. 若為複數/變化形 (如 radios) 不會卡住等待，立即回傳詞性、繁中釋義與例句
 */
export async function lookupDictionary(
  rawText: string,
  mode: TranslationEngineMode,
  localHfFn?: LocalHfTranslateFn
): Promise<DictionaryResult> {
  const cleaned = rawText.trim();
  const cacheKey = `${mode}:${cleaned.toLowerCase()}`;
  const cached = dictLookupCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const singleWord = isSingleEnglishWord(cleaned);
  const useGoogleRich = mode === 'auto' || mode === 'google';

  const [richDict, fallbackTrans, freeDictEntries] = await Promise.all([
    useGoogleRich ? fetchGoogleRichDict(cleaned) : Promise.resolve(null),
    !useGoogleRich ? translateBatchWithFailover([cleaned], mode, localHfFn) : Promise.resolve(null),
    singleWord ? fetchFreeDictionaryFast(cleaned.toLowerCase()) : Promise.resolve(null),
  ]);

  let primaryTranslation = richDict?.translation ?? fallbackTrans?.translations[0] ?? '';
  let engineUsed = richDict ? 'Google (zh-TW)' : fallbackTrans?.engineUsed ?? mode;

  // 若 Google Rich Dict 失敗，自動走容錯管線（MyMemory / HF）
  if (!primaryTranslation) {
    const res = await translateBatchWithFailover([cleaned], mode, localHfFn);
    primaryTranslation = res.translations[0] ?? cleaned;
    engineUsed = res.engineUsed;
  }

  // 解析音標與真人發音 MP3（來自 Free Dictionary）
  const freeEntry = freeDictEntries?.[0];
  let phonetic = freeEntry?.phonetic;
  let audioUs: string | undefined;
  let audioUk: string | undefined;

  for (const p of freeEntry?.phonetics ?? []) {
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

  // 組合詞性與例句（優先使用 Google Rich Dict 直接回傳的繁中詞義，零額外翻譯等待）
  const meanings: DictionaryMeaning[] = [];
  const examplesToTranslate: Array<{ meaningIdx: number; defIdx: number; en: string }> = [];

  if (richDict && richDict.meanings.length > 0) {
    richDict.meanings.forEach((m, mIdx) => {
      const defs: DictionaryMeaning['definitions'] = [];

      if (m.zhTerms.length > 0) {
        const firstExample = m.enDefs.find((d) => d.exampleEn)?.exampleEn ?? (mIdx === 0 ? richDict.extraExamples[0] : undefined);
        const firstEnDef = m.enDefs[0]?.en ?? '';
        defs.push({
          zh: m.zhTerms.join('、'),
          en: firstEnDef,
          example: firstExample ? { en: firstExample, zh: '' } : undefined,
        });
        if (firstExample) {
          examplesToTranslate.push({ meaningIdx: mIdx, defIdx: 0, en: firstExample });
        }
      } else if (m.enDefs[0]) {
        const ex = m.enDefs[0].exampleEn;
        defs.push({
          zh: primaryTranslation,
          en: m.enDefs[0].en,
          example: ex ? { en: ex, zh: '' } : undefined,
        });
        if (ex) {
          examplesToTranslate.push({ meaningIdx: mIdx, defIdx: 0, en: ex });
        }
      }

      if (defs.length > 0) {
        meanings.push({
          partOfSpeech: m.partOfSpeech,
          partOfSpeechZh: formatPosLabel(m.partOfSpeech),
          definitions: defs,
        });
      }
    });
  } else if (freeEntry?.meanings?.length) {
    freeEntry.meanings.slice(0, 2).forEach((m, mIdx) => {
      const firstDef = m.definitions[0];
      if (!firstDef) return;
      const ex = firstDef.example;
      meanings.push({
        partOfSpeech: m.partOfSpeech,
        partOfSpeechZh: formatPosLabel(m.partOfSpeech),
        definitions: [
          {
            zh: primaryTranslation,
            en: firstDef.definition,
            example: ex ? { en: ex, zh: '' } : undefined,
          },
        ],
      });
      if (ex) {
        examplesToTranslate.push({ meaningIdx: mIdx, defIdx: 0, en: ex });
      }
    });
  }

  // 僅針對精選的 1~2 條英文例句做一次極速批次翻譯（不翻譯整堆英文解釋，速度提升 4 倍以上）
  if (examplesToTranslate.length > 0) {
    try {
      const slice = examplesToTranslate.slice(0, 2);
      const res = await translateBatchWithFailover(
        slice.map((item) => item.en),
        mode,
        localHfFn
      );
      slice.forEach((item, i) => {
        const targetDef = meanings[item.meaningIdx]?.definitions[item.defIdx];
        if (targetDef?.example) {
          targetDef.example.zh = res.translations[i] ?? '';
        }
      });
    } catch {
      // 例句翻譯失敗時保留英文例句，不影響主釋義顯示
    }
  }

  const finalResult: DictionaryResult = {
    word: freeEntry?.word || cleaned,
    translation: primaryTranslation,
    phonetic,
    audioUs,
    audioUk,
    meanings,
    engineUsed,
    isPhrase: !singleWord,
  };

  if (dictLookupCache.size > 300) {
    const oldestKey = dictLookupCache.keys().next().value;
    if (oldestKey) dictLookupCache.delete(oldestKey);
  }
  dictLookupCache.set(cacheKey, finalResult);

  return finalResult;
}

async function fetchFreeDictionaryFast(word: string): Promise<FreeDictEntry[] | null> {
  try {
    // 嚴格 1.5 秒逾時上限，避免 Free Dictionary 偶發延遲拖慢整個反白查詞體驗
    const res = await fetchWithTimeout(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      undefined,
      1500
    );
    if (res.ok) {
      const data = (await res.json()) as unknown;
      if (Array.isArray(data)) return data as FreeDictEntry[];
    }
    return null;
  } catch {
    return null;
  }
}
