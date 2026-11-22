import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
const DIST = path.resolve('dist');
const RELEASE_DIR = path.resolve('release');
const ZIP_NAME = `trans-mao-v${pkg.version}.zip`;
const ZIP_PATH = path.join(RELEASE_DIR, ZIP_NAME);

// 1. 先執行正式版建置（無 sourcemap、啟用壓縮）
execFileSync(process.execPath, ['scripts/build.mjs', '--release'], { stdio: 'inherit' });

fs.mkdirSync(RELEASE_DIR, { recursive: true });
if (fs.existsSync(ZIP_PATH)) {
  fs.unlinkSync(ZIP_PATH);
}

// 2. 跨平台打包 dist/ 為 .zip，可直接上傳至 GitHub Releases 或 Chrome Web Store
if (process.platform === 'win32') {
  execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path "${DIST}\\*" -DestinationPath "${ZIP_PATH}" -Force`,
    ],
    { stdio: 'inherit' }
  );
} else {
  execFileSync('zip', ['-r', ZIP_PATH, '.'], { cwd: DIST, stdio: 'inherit' });
}

const sizeMb = (fs.statSync(ZIP_PATH).size / (1024 * 1024)).toFixed(2);
console.log(`[TransMao] Release package ready -> ${ZIP_PATH} (${sizeMb} MB)`);
