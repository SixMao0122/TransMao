export type TranslationEngineMode = 'auto' | 'google' | 'mymemory' | 'hf-local';
export type DisplayMode = 'bilingual' | 'replace';
export type SelectionTriggerMode = 'icon' | 'instant';
export type HfModelId = 'Xenova/opus-mt-en-zh' | 'Xenova/nllb-200-distilled-600M';

export interface UserSettings {
  engine: TranslationEngineMode;
  hfModel: HfModelId;
  displayMode: DisplayMode;
  selectionEnabled: boolean;
  selectionTrigger: SelectionTriggerMode;
  autoSpeak: boolean;
  blacklistDomains: string[];
}

export const DEFAULT_SETTINGS: UserSettings = {
  engine: 'auto',
  hfModel: 'Xenova/opus-mt-en-zh',
  displayMode: 'bilingual',
  selectionEnabled: true,
  selectionTrigger: 'icon',
  autoSpeak: false,
  blacklistDomains: [],
};

export interface DictionaryExample {
  en: string;
  zh: string;
}

export interface DictionaryMeaning {
  partOfSpeech: string;
  partOfSpeechZh: string;
  definitions: Array<{
    en: string;
    zh: string;
    example?: DictionaryExample;
  }>;
}

export interface DictionaryResult {
  word: string;
  translation: string;
  phonetic?: string;
  audioUs?: string;
  audioUk?: string;
  meanings: DictionaryMeaning[];
  engineUsed: string;
  isPhrase: boolean;
}

export interface SavedVocabItem {
  word: string;
  translation: string;
  phonetic?: string;
  partOfSpeech?: string;
  exampleEn?: string;
  exampleZh?: string;
  savedAt: number;
}

export interface TranslationBatchResponse {
  ok: boolean;
  translations?: string[];
  engineUsed?: string;
  error?: string;
}

export interface DictionaryLookupResponse {
  ok: boolean;
  data?: DictionaryResult;
  error?: string;
}

export interface PageTranslationState {
  active: boolean;
  translating: boolean;
  translatedCount: number;
  totalCount: number;
  engineUsed: string;
  lastError?: string;
}

export interface HfModelStatus {
  ready: boolean;
  loading: boolean;
  progress: number;
  modelId: HfModelId;
  error?: string;
}

export type RuntimeMessage =
  | { type: 'TRANSLATE_BATCH'; texts: string[]; engine?: TranslationEngineMode }
  | { type: 'LOOKUP_WORD'; text: string; engine?: TranslationEngineMode }
  | { type: 'TOGGLE_PAGE_TRANSLATE'; displayMode?: DisplayMode }
  | { type: 'GET_PAGE_STATE' }
  | { type: 'SETTINGS_UPDATED'; settings: UserSettings }
  | { type: 'HF_TRANSLATE'; texts: string[]; modelId: HfModelId }
  | { type: 'HF_PRELOAD'; modelId: HfModelId }
  | { type: 'HF_STATUS' };
