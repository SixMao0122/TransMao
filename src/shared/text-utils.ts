/**
 * 判斷文字是否為值得翻譯的英文內容
 * 排除純數字、網址、程式碼符號、或已經包含大量中文的段落
 */
export function isTranslatableEnglish(raw: string): boolean {
  const text = raw.trim();
  if (text.length < 2) return false;
  if (/^https?:\/\/\S+$/i.test(text)) return false;
  if (/^[\d\s.,:%$€£¥+\-*/=<>()[\]{}|\\/_@#!?~`'"]+$/.test(text)) return false;

  const latinMatches = text.match(/[A-Za-z]/g) ?? [];
  const cjkMatches = text.match(/[\u4E00-\u9FFF]/g) ?? [];

  if (latinMatches.length < 2) return false;
  // 若中文比例已超過 35%，視為已翻譯或中文段落，不再重複翻譯
  if (cjkMatches.length > 0 && cjkMatches.length / (latinMatches.length + cjkMatches.length) > 0.35) {
    return false;
  }

  return true;
}

/**
 * 清理使用者反白選取的文字
 */
export function normalizeSelectedText(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'`“”‘’()[\]{},.;:!?]+|[\s"'`“”‘’()[\]{},.;:!?]+$/g, '')
    .trim();
}

/**
 * 判斷是否為單一英文單字（用於決定是否查詢標準辭典詞性與音標）
 */
export function isSingleEnglishWord(text: string): boolean {
  return /^[A-Za-z]+(?:[-'][A-Za-z]+)*$/.test(text) && text.length <= 45;
}

/**
 * 將大量文字陣列依字元上限切分為多個批次，兼顧速度與 API 穩定性
 */
export function splitIntoBatches(texts: string[], maxChars = 1600, maxItems = 18): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let currentChars = 0;

  for (const text of texts) {
    const len = text.length + 12; // 預留分隔符長度
    if (current.length > 0 && (currentChars + len > maxChars || current.length >= maxItems)) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(text);
    currentChars += len;
  }

  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
}

export interface PosInfo {
  zh: string;
  short: string;
  color: string;
}

const POS_MAP: Record<string, PosInfo> = {
  noun: { zh: '名詞', short: 'n.', color: '#3B5B8C' },
  verb: { zh: '動詞', short: 'v.', color: '#2E6F5E' },
  adjective: { zh: '形容詞', short: 'adj.', color: '#B4533C' },
  adverb: { zh: '副詞', short: 'adv.', color: '#8A6A28' },
  pronoun: { zh: '代名詞', short: 'pron.', color: '#4F6D7A' },
  preposition: { zh: '介系詞', short: 'prep.', color: '#6B5B8C' },
  conjunction: { zh: '連接詞', short: 'conj.', color: '#9C5A3C' },
  interjection: { zh: '感嘆詞', short: 'interj.', color: '#A34848' },
  determiner: { zh: '限定詞', short: 'det.', color: '#3E7368' },
  exclamation: { zh: '感嘆詞', short: 'excl.', color: '#A34848' },
};

export function mapPosToZhTW(pos: string): PosInfo {
  const key = pos.toLowerCase().trim();
  return POS_MAP[key] ?? { zh: pos, short: pos, color: '#94A3B8' };
}

export interface BoxRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/**
 * 智慧視窗邊界碰撞計算，確保浮動卡片永遠完整顯示於可視區域內
 */
export function clampPopoverPosition(
  anchor: BoxRect,
  cardWidth: number,
  cardHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  margin = 12
): { x: number; y: number } {
  let x = anchor.left;
  let y = anchor.bottom + 10;

  // 若右側超出螢幕，往左推回
  if (x + cardWidth + margin > viewportWidth) {
    x = Math.max(margin, viewportWidth - cardWidth - margin);
  }
  if (x < margin) {
    x = margin;
  }

  // 若下方空間不足，自動翻轉顯示於選取文字上方
  if (y + cardHeight + margin > viewportHeight) {
    const aboveY = anchor.top - cardHeight - 10;
    y = aboveY >= margin ? aboveY : Math.max(margin, viewportHeight - cardHeight - margin);
  }

  return { x: Math.round(x), y: Math.round(y) };
}
