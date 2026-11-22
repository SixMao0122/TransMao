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
