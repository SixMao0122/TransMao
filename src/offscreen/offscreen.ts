import { env, pipeline } from '@huggingface/transformers';
import { toTraditionalTW } from '../shared/opencc';
import { HfModelId, HfModelStatus, RuntimeMessage } from '../shared/types';

// 設定瀏覽器端執行環境：使用本機擴充套件內建的 ORT WASM（符合 Chrome MV3 CSP）
env.allowLocalModels = false;
env.useBrowserCache = true;

function configureLocalOnnxRuntime(): void {
  const ortBase = chrome.runtime.getURL('ort/');
  const backends = env.backends as {
    onnx?: {
      logLevel?: 'verbose' | 'info' | 'warning' | 'error' | 'fatal';
      wasm?: {
        wasmPaths?: string | { mjs?: string; wasm?: string };
        numThreads?: number;
        proxy?: boolean;
      };
    };
  };

  if (!backends.onnx) {
    backends.onnx = {};
  }
  if (!backends.onnx.wasm) {
    backends.onnx.wasm = {};
  }

  // 僅輸出 error 等級，過濾 ONNX Runtime C++ 雜訊警告
  backends.onnx.logLevel = 'error';
  backends.onnx.wasm.wasmPaths = {
    mjs: `${ortBase}ort-wasm-simd-threaded.jsep.mjs`,
    wasm: `${ortBase}ort-wasm-simd-threaded.jsep.wasm`,
  };
  backends.onnx.wasm.numThreads = 1;
  backends.onnx.wasm.proxy = false;
}

configureLocalOnnxRuntime();

type TranslationPipeline = (
  input: string | string[],
  options?: Record<string, unknown>
) => Promise<Array<{ translation_text: string }>>;

let activePipeline: TranslationPipeline | null = null;
let loadedModelId: HfModelId | null = null;
let loadingPromise: Promise<TranslationPipeline> | null = null;
let loadingModelId: HfModelId | null = null;
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

  if (loadingPromise && loadingModelId === modelId) {
    return loadingPromise;
  }

  loadingModelId = modelId;
  loadingPromise = (async () => {
    configureLocalOnnxRuntime();

    status = {
      ready: false,
      loading: true,
      progress: 1,
      modelId,
    };

    try {
      // Marian (opus-mt) 與 NLLB 屬於 Encoder-Decoder seq2seq 模型，在瀏覽器端使用 WASM 最穩定且不卡死
      const translator = await pipeline('translation', modelId, {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: (info: { status?: string; progress?: number }) => {
          if (typeof info.progress === 'number') {
            status.progress = Math.max(1, Math.min(99, Math.round(info.progress)));
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
    } finally {
      loadingPromise = null;
      loadingModelId = null;
    }
  })();

  return loadingPromise;
}

async function runLocalTranslation(texts: string[], modelId: HfModelId): Promise<string[]> {
  const translator = await ensureModelLoaded(modelId);
  // 使用 greedy decoding (num_beams: 1) + max_new_tokens: 128，在瀏覽器 WASM 上比預設 4-beam search 快 4~6 倍，避免訊息通道逾時
  const options =
    modelId === 'Xenova/nllb-200-distilled-600M'
      ? { src_lang: 'eng_Latn', tgt_lang: 'zho_Hant', num_beams: 1, max_new_tokens: 128 }
      : { num_beams: 1, max_new_tokens: 128 };

  const results: string[] = [];
  for (const text of texts) {
    const clipped = text.length > 360 ? `${text.slice(0, 360)}...` : text;
    const output = await translator(clipped, options);
    const raw = Array.isArray(output) ? output[0]?.translation_text ?? text : text;
    results.push(toTraditionalTW(raw.trim()));
  }
  return results;
}

// 僅處理明確發往 offscreen 的內部訊息，避免與 background 訊息通道互相搶佔
chrome.runtime.onMessage.addListener((msg: RuntimeMessage, _sender, sendResponse) => {
  if (!('target' in msg) || msg.target !== 'offscreen') {
    return false;
  }

  if (msg.type === 'HF_PING') {
    sendResponse({ ok: true });
    return false;
  }

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
