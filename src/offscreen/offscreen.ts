import { env, pipeline } from '@huggingface/transformers';
import { toTraditionalTW } from '../shared/opencc';
import { HfModelId, HfModelStatus, RuntimeMessage } from '../shared/types';

// 設定瀏覽器端執行環境：使用本機擴充套件內建的 ORT WASM（符合 Chrome MV3 CSP，絕不從遠端 CDN 載入可執行腳本）
env.allowLocalModels = false;
env.useBrowserCache = true;
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('ort/');
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.proxy = false;
}

type TranslationPipeline = (
  input: string | string[],
  options?: Record<string, unknown>
) => Promise<Array<{ translation_text: string }>>;

let activePipeline: TranslationPipeline | null = null;
let loadedModelId: HfModelId | null = null;
let status: HfModelStatus = {
  ready: false,
  loading: false,
  progress: 0,
  modelId: 'Xenova/opus-mt-en-zh',
};

async function ensureModelLoaded(modelId: HfModelId): Promise<TranslationPipeline> {
  if (activePipeline && loadedModelId === modelId) {
    return activePipeline;
  }

  status = {
    ready: false,
    loading: true,
    progress: 0,
    modelId,
  };

  try {
    const translator = await pipeline('translation', modelId, {
      dtype: 'q8',
      progress_callback: (info: { status?: string; progress?: number }) => {
        if (typeof info.progress === 'number') {
          status.progress = Math.round(info.progress);
        }
      },
    });

    activePipeline = translator as unknown as TranslationPipeline;
    loadedModelId = modelId;
    status = {
      ready: true,
      loading: false,
      progress: 100,
      modelId,
    };
    return activePipeline;
  } catch (err) {
    status = {
      ready: false,
      loading: false,
      progress: 0,
      modelId,
      error: err instanceof Error ? err.message : String(err),
    };
    throw err;
  }
}

async function runLocalTranslation(texts: string[], modelId: HfModelId): Promise<string[]> {
  const translator = await ensureModelLoaded(modelId);
  const options =
    modelId === 'Xenova/nllb-200-distilled-600M'
      ? { src_lang: 'eng_Latn', tgt_lang: 'zho_Hant' }
      : {};

  const results: string[] = [];
  for (const text of texts) {
    const output = await translator(text, options);
    const raw = Array.isArray(output) ? output[0]?.translation_text ?? text : text;
    results.push(toTraditionalTW(raw.trim()));
  }
  return results;
}

chrome.runtime.onMessage.addListener((msg: RuntimeMessage, _sender, sendResponse) => {
  if (msg.type === 'HF_STATUS') {
    sendResponse({ ok: true, status });
    return false;
  }

  if (msg.type === 'HF_PRELOAD') {
    ensureModelLoaded(msg.modelId)
      .then(() => sendResponse({ ok: true, status }))
      .catch((err) => sendResponse({ ok: false, status, error: String(err) }));
    return true;
  }

  if (msg.type === 'HF_TRANSLATE') {
    runLocalTranslation(msg.texts, msg.modelId)
      .then((translations) => sendResponse({ ok: true, translations }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  return false;
});
