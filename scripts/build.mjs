import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const isWatch = process.argv.includes('--watch');
const DIST = path.resolve('dist');
const PUBLIC = path.resolve('public');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyStatic() {
  fs.mkdirSync(DIST, { recursive: true });
  copyDir(PUBLIC, DIST);
  // Copy HTML entry points
  for (const [src, name] of [
    ['src/popup/popup.html', 'popup.html'],
    ['src/options/options.html', 'options.html'],
    ['src/offscreen/offscreen.html', 'offscreen.html'],
  ]) {
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(DIST, name));
    }
  }

  // Copy ONNX Runtime WASM + MJS files locally so Chrome MV3 CSP allows loading them without remote CDN
  const ortSrcDir = path.resolve('node_modules/@huggingface/transformers/dist');
  const ortDestDir = path.join(DIST, 'ort');
  fs.mkdirSync(ortDestDir, { recursive: true });
  if (fs.existsSync(ortSrcDir)) {
    for (const file of fs.readdirSync(ortSrcDir)) {
      if (file.startsWith('ort-wasm') && (file.endsWith('.wasm') || file.endsWith('.mjs'))) {
        fs.copyFileSync(path.join(ortSrcDir, file), path.join(ortDestDir, file));
      }
    }
  }
}

const commonOptions = {
  bundle: true,
  sourcemap: true,
  target: ['chrome116', 'edge116', 'firefox121'],
  logLevel: 'info',
  define: {
    'process.env.NODE_ENV': '"production"',
  },
};

async function build() {
  copyStatic();

  // 1. Content Script — IIFE bundle so it runs cleanly in isolated world on any website
  const contentConfig = {
    ...commonOptions,
    entryPoints: ['src/content/index.ts'],
    outfile: 'dist/content.js',
    format: 'iife',
  };

  // 2. Background Service Worker — ESM bundle
  const backgroundConfig = {
    ...commonOptions,
    entryPoints: ['src/background/index.ts'],
    outfile: 'dist/background.js',
    format: 'esm',
  };

  // 3. Popup & Options UI — ESM bundles
  const uiConfig = {
    ...commonOptions,
    entryPoints: {
      popup: 'src/popup/popup.ts',
      options: 'src/options/options.ts',
    },
    outdir: 'dist',
    format: 'esm',
  };

  // 4. Offscreen Document (Hugging Face Transformers.js local model host) — ESM bundle
  const offscreenConfig = {
    ...commonOptions,
    entryPoints: ['src/offscreen/offscreen.ts'],
    outfile: 'dist/offscreen.js',
    format: 'esm',
    // Avoid bundling Node-only sharp/onnxruntime-node inside browser build
    external: ['sharp', 'onnxruntime-node'],
    plugins: [
      {
        name: 'patch-ort-local-wasm',
        setup(buildApi) {
          buildApi.onEnd(() => {
            const outFile = path.join(DIST, 'offscreen.js');
            if (!fs.existsSync(outFile)) return;
            const code = fs.readFileSync(outFile, 'utf8');
            // 徹底移除 transformers.js 內建的遠端 jsdelivr CDN 路徑，強制導向本機擴充套件 ort/ 目錄
            const patched = code.replace(
              /`https:\/\/cdn\.jsdelivr\.net\/npm\/@huggingface\/transformers@\$\{[^}]+\}\/dist\/`/g,
              'chrome.runtime.getURL("ort/")'
            );
            if (patched !== code) {
              fs.writeFileSync(outFile, patched, 'utf8');
            }
          });
        },
      },
    ],
  };

  const configs = [contentConfig, backgroundConfig, uiConfig, offscreenConfig];

  if (isWatch) {
    const contexts = await Promise.all(configs.map((c) => esbuild.context(c)));
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    console.log('[TransMao] Watching for changes...');
  } else {
    await Promise.all(configs.map((c) => esbuild.build(c)));
    console.log('[TransMao] Build complete -> dist/');
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
