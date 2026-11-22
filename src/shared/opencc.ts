import * as OpenCC from 'opencc-js';

let converter: ((input: string) => string) | null = null;

/**
 * 將任意簡體或混合中文轉換為道地台灣繁體中文 (s2twp：含常用詞彙在地化)。
 */
export function toTraditionalTW(text: string): string {
  if (!text) return text;
  if (!converter) {
    converter = OpenCC.Converter({ from: 'cn', to: 'twp' });
  }
  return converter(text);
}
