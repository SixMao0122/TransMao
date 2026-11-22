import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupDictionary, translateBatchWithFailover } from '../src/shared/engines';
import { toTraditionalTW } from '../src/shared/opencc';
import {
  clampPopoverPosition,
  formatPosLabel,
  isSingleEnglishWord,
  isTranslatableEnglish,
  mapPosToZhTW,
  normalizeSelectedText,
  splitIntoBatches,
} from '../src/shared/text-utils';

describe('text-utils', () => {
  it('辨識可翻譯的英文段落，並排除數字、網址與已翻譯中文', () => {
    expect(isTranslatableEnglish('Hello world')).toBe(true);
    expect(isTranslatableEnglish('serendipity')).toBe(true);
    expect(isTranslatableEnglish('12345.67')).toBe(false);
    expect(isTranslatableEnglish('https://github.com/SixMao0122')).toBe(false);
    expect(isTranslatableEnglish('這是一段繁體中文測試文字')).toBe(false);
  });

  it('正確清理反白文字並辨識單一英文單字', () => {
    expect(normalizeSelectedText('  "Serendipity,"  ')).toBe('Serendipity');
    expect(isSingleEnglishWord('serendipity')).toBe(true);
    expect(isSingleEnglishWord('well-known')).toBe(true);
    expect(isSingleEnglishWord('hello world')).toBe(false);
  });

  it('正確將大量文字依字元數上限分批', () => {
    const items = Array.from({ length: 10 }, (_, i) => `Sentence number ${i} for testing.`);
    const batches = splitIntoBatches(items, 100, 4);
    expect(batches.length).toBeGreaterThan(2);
    expect(batches.flat()).toEqual(items);
  });

  it('正確對應英文與中文詞性至繁體中文標籤（絕不重複顯示）', () => {
    expect(mapPosToZhTW('noun').zh).toBe('名詞');
    expect(mapPosToZhTW('verb').short).toBe('v.');
    expect(mapPosToZhTW('adjective').zh).toBe('形容詞');
    expect(formatPosLabel('名詞')).toBe('n. 名詞');
    expect(formatPosLabel('動詞')).toBe('v. 動詞');
    expect(formatPosLabel('未知詞性')).toBe('未知詞性');
  });

  it('浮動卡片接近螢幕右側或底部時自動邊界回推與翻轉', () => {
    const pos = clampPopoverPosition(
      { left: 1200, top: 750, right: 1260, bottom: 770, width: 60, height: 20 },
      368,
      300,
      1280,
      800
    );
    expect(pos.x + 368).toBeLessThanOrEqual(1280 - 12);
    expect(pos.y).toBeLessThan(750);
  });
});

describe('opencc zh-TW 在地化轉換', () => {
  it('能將簡體用語轉為道地台灣繁體中文詞彙', () => {
    const converted = toTraditionalTW('这个软件在服务器内存上运行很流畅');
    expect(converted).toContain('軟體');
    expect(converted).toContain('伺服器');
    expect(converted).toContain('記憶體');
  });
});

describe('多引擎自動容錯 (Failover Router)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('當 Google 雙主機 (clients5 與 gtx) 均回傳 429 失效時，自動降級切換至 MyMemory 備援引擎', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('clients5.google.com') || url.includes('translate.googleapis.com')) {
        return new Response('Too Many Requests', { status: 429 });
      }
      return new Response(
        JSON.stringify({
          responseStatus: 200,
          responseData: { translatedText: '这个软件很棒' },
        }),
        { status: 200 }
      );
    });

    const res = await translateBatchWithFailover(['This software is great'], 'auto');
    expect(res.engineUsed).toContain('MyMemory');
    expect(res.translations[0]).toContain('軟體');
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('選用 hf-local 模式時優先呼叫本地 Hugging Face 模型並輸出繁體中文', async () => {
    const localMock = vi.fn(async (texts: string[]) => texts.map(() => '服务器内存'));
    const res = await translateBatchWithFailover(['server memory'], 'hf-local', localMock);
    expect(res.engineUsed).toContain('HuggingFace');
    expect(res.translations[0]).toBe('伺服器記憶體');
    expect(localMock).toHaveBeenCalledOnce();
  });

  it('auto 模式下當所有雲端引擎皆失效時，自動降級至第 4 層 Hugging Face 本地模型', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response('Service Unavailable', { status: 503 });
    });
    const localMock = vi.fn(async (texts: string[]) =>
      texts.map(() => '离线模式下的服务器内存')
    );

    const res = await translateBatchWithFailover(['offline server memory'], 'auto', localMock);
    expect(res.engineUsed).toContain('HuggingFace');
    expect(res.translations[0]).toBe('離線模式下的伺服器記憶體');
    expect(localMock).toHaveBeenCalledOnce();
    // Clients5 + GTX + MyMemory 皆應依序嘗試過
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('hf-local 模式下若本地模型推論失敗，自動降級備援至 Google Clients5 雲端引擎', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('clients5.google.com')) {
        return new Response(JSON.stringify([['雲端備援成功']]), { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    });
    const failingLocalMock = vi.fn(async () => {
      throw new Error('WASM OOM');
    });

    const res = await translateBatchWithFailover(['cloud fallback'], 'hf-local', failingLocalMock);
    expect(failingLocalMock).toHaveBeenCalledOnce();
    expect(res.engineUsed).toContain('Clients5');
    expect(res.translations[0]).toBe('雲端備援成功');
  });

  it('Google GTX 批次分隔符遭破壞時，自動降級為單筆並發翻譯確保段落對齊', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('clients5.google.com')) {
        return new Response('Rate Limited', { status: 429 });
      }
      if (url.includes('translate.googleapis.com')) {
        const q = new URL(url).searchParams.get('q') ?? '';
        // 模擬批次合併請求時分隔符被遠端吃掉
        if (q.includes('§TM§')) {
          return new Response(JSON.stringify([[['被合併成單一段落的譯文', q]]]), { status: 200 });
        }
        return new Response(JSON.stringify([[[`譯:${q}`, q]]]), { status: 200 });
      }
      return new Response('Error', { status: 500 });
    });

    const res = await translateBatchWithFailover(['First line', 'Second line'], 'google');
    expect(res.engineUsed).toContain('Google GTX');
    expect(res.translations).toEqual(['譯:First line', '譯:Second line']);
  });

  it('當所有翻譯引擎皆無法回應時，拋出清楚的繁體中文錯誤訊息', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response('Bad Gateway', { status: 502 });
    });

    await expect(translateBatchWithFailover(['hello'], 'google')).rejects.toThrow(
      /所有翻譯引擎均暫時無法回應/
    );
  });

  it('lookupDictionary 遇到中文詞性回傳時正確輸出 n. 名詞且不重複', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('translate.googleapis.com')) {
        if (url.includes('dt=bd')) {
          return new Response(
            JSON.stringify([
              [['貯存', 'storage']],
              [['名詞', ['保管', '儲存']]],
              'en',
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              [['名詞', [['the action of storing', 'id1', 'easy <b>storage</b>']]]],
            ]),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify([[['方便存放', 'easy storage']]]), { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    });

    const dict = await lookupDictionary('storage', 'auto');
    expect(dict.translation).toBe('貯存');
    expect(dict.meanings[0]?.partOfSpeechZh).toBe('n. 名詞');
    expect(dict.meanings[0]?.definitions[0]?.example?.en).toBe('easy storage');
    expect(dict.meanings[0]?.definitions[0]?.example?.zh).toBe('方便存放');
  });
});
