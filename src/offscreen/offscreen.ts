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

async function detectPreferredDevice(): Promise<'webgpu' | 'wasm'> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    if (gpu) {
      const adapter = await gpu.requestAdapter();
      if (adapter) return 'webgpu';
    }
  } catch {
    // 忽略 WebGPU 偵測錯誤，安全降級為 WASM
  }
  return 'wasm';
}

async function ensureModelLoaded(modelId: HfModelId): Promise<TranslationPipeline> {
  if (activePipeline && loadedModelId === modelId) {
    return activePipeline;
  }

  // 防止多個批次同時觸發重複下載與初始化模型
  if (loadingPromise && loadingModelId === modelId) {
    return loadingPromise;
  }

  loadingModelId = modelId;
  loadingPromise = (async () => {
    configureLocalOnnxRuntime();

    status = {
      ready: false,
      loading: true,
      progress: 0,
      modelId,
    };

    try {
      const preferredDevice = await detectPreferredDevice();
      let translator: unknown;
      try {
        translator = await pipeline('translation', modelId, {
          dtype: 'q8',
          device: preferredDevice,
          progress_callback: (info: { status?: string; progress?: number }) => {
            if (typeof info.progress === 'number') {
              status.progress = Math.round(info.progress);
            }
          },
        });
      } catch {
        // 若 WebGPU 初始化失敗，無縫自動降級至本機 WASM
        translator = await pipeline('translation', modelId, {
          dtype: 'q8',
          device: 'wasm',
          progress_callback: (info: { status?: string; progress?: number }) => {
            if (typeof info.progress === 'number') {
              status.progress = Math.round(info.progress);
            }
          },
        });
      }

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
