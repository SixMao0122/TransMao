import { isWordSaved, toggleSavedVocab } from '../shared/storage';
import { BoxRect, clampPopoverPosition, mapPosToZhTW } from '../shared/text-utils';
import { DictionaryResult } from '../shared/types';
import { speakWord, stopSpeaking } from './audio';

const POPOVER_CSS = `
  :host {
    all: initial;
    font-family: 'Segoe UI', 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif;
  }

  * {
    box-sizing: border-box;
  }

  .tm-icon-btn {
    position: fixed;
    z-index: 2147483647;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 1.5px solid rgba(255, 255, 255, 0.35);
    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 55%, #ec4899 100%);
    color: #ffffff;
    font-weight: 800;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 8px 20px rgba(79, 70, 229, 0.45);
    transition: transform 0.16s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.16s ease;
    animation: tmPopIn 0.16s ease-out;
    user-select: none;
  }

  .tm-icon-btn:hover {
    transform: scale(1.12);
    box-shadow: 0 10px 26px rgba(236, 72, 153, 0.55);
  }

  .tm-card {
    position: fixed;
    z-index: 2147483647;
    width: 368px;
    max-width: calc(100vw - 24px);
    max-height: 440px;
    display: flex;
    flex-direction: column;
    border-radius: 16px;
    background: rgba(15, 23, 42, 0.96);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(148, 163, 184, 0.24);
    box-shadow: 0 22px 48px rgba(2, 6, 23, 0.62);
    color: #f8fafc;
    overflow: hidden;
    animation: tmPopIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .tm-accent-bar {
    height: 3.5px;
    width: 100%;
    background: linear-gradient(90deg, #6366f1, #a855f7, #ec4899);
    flex-shrink: 0;
  }

  .tm-header {
    padding: 14px 16px 10px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }

  .tm-word {
    font-size: 20px;
    font-weight: 800;
    color: #ffffff;
    line-height: 1.25;
    word-break: break-word;
  }

  .tm-phonetic {
    font-family: ui-monospace, 'Cascadia Code', monospace;
    font-size: 12.5px;
    color: #94a3b8;
    margin-top: 3px;
  }

  .tm-close {
    background: rgba(255, 255, 255, 0.08);
    border: none;
    color: #cbd5e1;
    width: 26px;
    height: 26px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.15s, color 0.15s;
  }

  .tm-close:hover {
    background: rgba(248, 113, 113, 0.2);
    color: #fca5a5;
  }

  .tm-audio-row {
    padding: 0 16px 10px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tm-audio-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 11px;
    border-radius: 999px;
    border: 1px solid rgba(129, 140, 248, 0.35);
    background: rgba(79, 70, 229, 0.22);
    color: #e0e7ff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, transform 0.12s;
  }

  .tm-audio-btn:hover {
    background: rgba(99, 102, 241, 0.42);
    transform: translateY(-1px);
  }

  .tm-audio-btn.uk {
    border-color: rgba(148, 163, 184, 0.3);
    background: rgba(51, 65, 85, 0.55);
    color: #cbd5e1;
  }

  .tm-audio-btn.uk:hover {
    background: rgba(71, 85, 105, 0.75);
  }

  .tm-audio-btn.speaking {
    border-color: #f472b6;
    background: rgba(236, 72, 153, 0.28);
    color: #fce7f3;
    box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.2);
  }

  .tm-ex-mark {
    background: rgba(129, 140, 248, 0.28);
    color: #e0e7ff;
    padding: 0 3px;
    border-radius: 4px;
    font-weight: 700;
  }

  .tm-body {
    padding: 0 16px 14px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .tm-body::-webkit-scrollbar {
    width: 6px;
  }
  .tm-body::-webkit-scrollbar-thumb {
    background: rgba(148, 163, 184, 0.3);
    border-radius: 999px;
  }

  .tm-primary-box {
    background: rgba(30, 41, 59, 0.85);
    border: 1px solid rgba(244, 114, 182, 0.28);
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 16px;
    font-weight: 700;
    color: #f9a8d4;
    line-height: 1.45;
  }

  .tm-meaning {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .tm-pos-pill {
    display: inline-flex;
    align-self: flex-start;
    padding: 2px 8px;
    border-radius: 6px;
    font-size: 11.5px;
    font-weight: 700;
    letter-spacing: 0.2px;
  }

  .tm-def-item {
    padding-left: 8px;
    border-left: 2px solid rgba(148, 163, 184, 0.25);
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .tm-def-zh {
    font-size: 13.5px;
    color: #f1f5f9;
    line-height: 1.45;
  }

  .tm-def-en {
    font-size: 12px;
    color: #94a3b8;
    line-height: 1.4;
  }

  .tm-example {
    margin-top: 4px;
    padding: 7px 10px;
    border-radius: 8px;
    background: rgba(2, 6, 23, 0.55);
    border: 1px solid rgba(51, 65, 85, 0.7);
    font-size: 12px;
    line-height: 1.45;
  }

  .tm-example-en {
    color: #cbd5e1;
  }

  .tm-example-zh {
    color: #94a3b8;
    margin-top: 2px;
  }

  .tm-footer {
    padding: 9px 16px;
    border-top: 1px solid rgba(51, 65, 85, 0.65);
    background: rgba(2, 6, 23, 0.35);
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11.5px;
    color: #64748b;
    flex-shrink: 0;
  }

  .tm-footer-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tm-action-btn {
    background: transparent;
    border: 1px solid rgba(148, 163, 184, 0.25);
    color: #cbd5e1;
    border-radius: 7px;
    padding: 3px 9px;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .tm-action-btn:hover {
    border-color: #818cf8;
    color: #e0e7ff;
  }

  .tm-action-btn.saved {
    background: rgba(250, 204, 21, 0.16);
    border-color: rgba(250, 204, 21, 0.55);
    color: #fde047;
  }

  .tm-loading {
    padding: 18px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .tm-shimmer {
    height: 14px;
    border-radius: 6px;
    background: linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%);
    background-size: 200% 100%;
    animation: tmShimmer 1.2s infinite linear;
  }

  .tm-toast {
    position: fixed;
    right: 20px;
    bottom: 20px;
    z-index: 2147483647;
    padding: 10px 16px;
    border-radius: 12px;
    background: rgba(15, 23, 42, 0.94);
    border: 1px solid rgba(129, 140, 248, 0.45);
    color: #f8fafc;
    font-size: 13px;
    font-weight: 600;
    box-shadow: 0 12px 28px rgba(2, 6, 23, 0.55);
    animation: tmPopIn 0.2s ease-out;
  }

  @keyframes tmPopIn {
    from { opacity: 0; transform: translateY(6px) scale(0.96); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes tmShimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
`;

export class TransMaoPopover {
  private host: HTMLDivElement | null = null;
  private shadow: ShadowRoot | null = null;
  private iconEl: HTMLButtonElement | null = null;
  private cardEl: HTMLDivElement | null = null;
  private toastEl: HTMLDivElement | null = null;
  private toastTimer: number | null = null;

  private ensureShadow(): ShadowRoot {
    if (this.shadow && this.host?.isConnected) {
      return this.shadow;
    }
    const existing = document.getElementById('transmao-root') as HTMLDivElement | null;
    if (existing?.shadowRoot) {
      this.host = existing;
      this.shadow = existing.shadowRoot;
      return this.shadow;
    }

    const host = document.createElement('div');
    host.id = 'transmao-root';
    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = POPOVER_CSS;
    shadow.appendChild(style);

    document.documentElement.appendChild(host);
    this.host = host;
    this.shadow = shadow;
    return shadow;
  }

  public isEventInside(event: Event): boolean {
    if (!this.host) return false;
    return event.composedPath().includes(this.host);
  }

  public showTriggerIcon(anchor: BoxRect, onClick: () => void): void {
    this.hideAll();
    const shadow = this.ensureShadow();
    const pos = clampPopoverPosition(anchor, 38, 38, window.innerWidth, window.innerHeight, 8);

    const btn = document.createElement('button');
    btn.className = 'tm-icon-btn';
    btn.title = 'TransMao：查詢繁中釋義、詞性、例句與發音';
    btn.textContent = '譯';
    btn.style.left = `${pos.x}px`;
    btn.style.top = `${pos.y}px`;

    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });

    shadow.appendChild(btn);
    this.iconEl = btn;
  }

  public showLoadingCard(word: string, anchor: BoxRect): void {
    this.hideIcon();
    this.hideCard();
    const shadow = this.ensureShadow();
    const pos = clampPopoverPosition(anchor, 368, 220, window.innerWidth, window.innerHeight);

    const card = document.createElement('div');
    card.className = 'tm-card';
    card.style.left = `${pos.x}px`;
    card.style.top = `${pos.y}px`;

    card.innerHTML = `
      <div class="tm-accent-bar"></div>
      <div class="tm-header">
        <div>
          <div class="tm-word">${escapeHtml(word)}</div>
          <div class="tm-phonetic">TransMao 正在查詢繁中釋義與例句...</div>
        </div>
        <button class="tm-close" title="關閉 (Esc)">✕</button>
      </div>
      <div class="tm-loading">
        <div class="tm-shimmer" style="width: 72%; height: 22px;"></div>
        <div class="tm-shimmer" style="width: 92%;"></div>
        <div class="tm-shimmer" style="width: 84%;"></div>
      </div>
    `;

    card.querySelector('.tm-close')?.addEventListener('click', () => this.hideAll());
    shadow.appendChild(card);
    this.cardEl = card;
  }

  public async showResultCard(result: DictionaryResult, anchor: BoxRect, autoSpeak: boolean): Promise<void> {
    this.hideIcon();
    this.hideCard();
    const shadow = this.ensureShadow();
    const pos = clampPopoverPosition(anchor, 368, 360, window.innerWidth, window.innerHeight);
    const saved = await isWordSaved(result.word);

    const card = document.createElement('div');
    card.className = 'tm-card';
    card.style.left = `${pos.x}px`;
    card.style.top = `${pos.y}px`;

    const meaningsHtml = result.meanings
      .map((m) => {
        const posMeta = mapPosToZhTW(m.partOfSpeech);
        const defsHtml = m.definitions
          .map(
            (d) => `
            <div class="tm-def-item">
              <div class="tm-def-zh">${escapeHtml(d.zh)}</div>
              <div class="tm-def-en">${escapeHtml(d.en)}</div>
              ${
                d.example
                  ? `<div class="tm-example">
                       <div class="tm-example-en">“${highlightWordInSentence(d.example.en, result.word)}”</div>
                       <div class="tm-example-zh">${escapeHtml(d.example.zh)}</div>
                     </div>`
                  : ''
              }
            </div>`
          )
          .join('');

        return `
          <div class="tm-meaning">
            <span class="tm-pos-pill" style="background: ${posMeta.color}24; color: ${posMeta.color}; border: 1px solid ${posMeta.color}55;">
              ${escapeHtml(m.partOfSpeechZh)}
            </span>
            ${defsHtml}
          </div>
        `;
      })
      .join('');

    card.innerHTML = `
      <div class="tm-accent-bar"></div>
      <div class="tm-header">
        <div>
          <div class="tm-word">${escapeHtml(result.word)}</div>
          ${result.phonetic ? `<div class="tm-phonetic">${escapeHtml(result.phonetic)}</div>` : ''}
        </div>
        <button class="tm-close" title="關閉 (Esc)">✕</button>
      </div>
      <div class="tm-audio-row">
        <button class="tm-audio-btn us" title="美式發音">🔊 美音</button>
        <button class="tm-audio-btn uk" title="英式發音">🔊 英音</button>
      </div>
      <div class="tm-body">
        <div class="tm-primary-box">${escapeHtml(result.translation)}</div>
        ${meaningsHtml}
      </div>
      <div class="tm-footer">
        <span>TransMao · ${escapeHtml(result.engineUsed)}</span>
        <div class="tm-footer-actions">
          <button class="tm-action-btn copy-btn">複製</button>
          <button class="tm-action-btn save-btn ${saved ? 'saved' : ''}">${saved ? '★ 已收藏' : '☆ 收藏'}</button>
        </div>
      </div>
    `;

    card.querySelector('.tm-close')?.addEventListener('click', () => this.hideAll());

    const usBtn = card.querySelector('.tm-audio-btn.us') as HTMLButtonElement | null;
    const ukBtn = card.querySelector('.tm-audio-btn.uk') as HTMLButtonElement | null;
    const triggerSpeak = (btn: HTMLButtonElement | null, accent: 'us' | 'uk', url?: string) => {
      usBtn?.classList.remove('speaking');
      ukBtn?.classList.remove('speaking');
      btn?.classList.add('speaking');
      void speakWord(result.word, accent, url).finally(() => {
        setTimeout(() => btn?.classList.remove('speaking'), 700);
      });
    };

    usBtn?.addEventListener('click', () => triggerSpeak(usBtn, 'us', result.audioUs));
    ukBtn?.addEventListener('click', () => triggerSpeak(ukBtn, 'uk', result.audioUk));

    const copyBtn = card.querySelector('.copy-btn') as HTMLButtonElement | null;
    copyBtn?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(`${result.word} — ${result.translation}`);
        copyBtn.textContent = '已複製 ✓';
        setTimeout(() => (copyBtn.textContent = '複製'), 1400);
      } catch {
        // 忽略剪貼簿權限錯誤
      }
    });

    const saveBtn = card.querySelector('.save-btn') as HTMLButtonElement | null;
    saveBtn?.addEventListener('click', async () => {
      const firstMeaning = result.meanings[0];
      const firstEx = firstMeaning?.definitions.find((d) => d.example)?.example;
      const { saved: nowSaved } = await toggleSavedVocab({
        word: result.word,
        translation: result.translation,
        phonetic: result.phonetic,
        partOfSpeech: firstMeaning?.partOfSpeechZh,
        exampleEn: firstEx?.en,
        exampleZh: firstEx?.zh,
        savedAt: Date.now(),
      });
      saveBtn.classList.toggle('saved', nowSaved);
      saveBtn.textContent = nowSaved ? '★ 已收藏' : '☆ 收藏';
    });

    shadow.appendChild(card);
    this.cardEl = card;

    // 視窗渲染後再次微調高度邊界，防止長卡片溢出底部
    const actualRect = card.getBoundingClientRect();
    const refined = clampPopoverPosition(
      anchor,
      actualRect.width,
      actualRect.height,
      window.innerWidth,
      window.innerHeight
    );
    card.style.left = `${refined.x}px`;
    card.style.top = `${refined.y}px`;

    if (autoSpeak) {
      void speakWord(result.word, 'us', result.audioUs);
    }
  }

  public showErrorCard(word: string, message: string, anchor: BoxRect): void {
    this.hideIcon();
    this.hideCard();
    const shadow = this.ensureShadow();
    const pos = clampPopoverPosition(anchor, 340, 140, window.innerWidth, window.innerHeight);

    const card = document.createElement('div');
    card.className = 'tm-card';
    card.style.left = `${pos.x}px`;
    card.style.top = `${pos.y}px`;
    card.innerHTML = `
      <div class="tm-accent-bar"></div>
      <div class="tm-header">
        <div class="tm-word">${escapeHtml(word)}</div>
        <button class="tm-close">✕</button>
      </div>
      <div class="tm-body" style="color: #fca5a5; font-size: 13px;">
        查詢暫時失敗：${escapeHtml(message)}
      </div>
    `;
    card.querySelector('.tm-close')?.addEventListener('click', () => this.hideAll());
    shadow.appendChild(card);
    this.cardEl = card;
  }

  public showToast(message: string, durationMs = 2600): void {
    const shadow = this.ensureShadow();
    if (this.toastEl) this.toastEl.remove();
    if (this.toastTimer) window.clearTimeout(this.toastTimer);

    const toast = document.createElement('div');
    toast.className = 'tm-toast';
    toast.textContent = message;
    shadow.appendChild(toast);
    this.toastEl = toast;

    this.toastTimer = window.setTimeout(() => {
      toast.remove();
      this.toastEl = null;
    }, durationMs);
  }

  public hideIcon(): void {
    if (this.iconEl) {
      this.iconEl.remove();
      this.iconEl = null;
    }
  }

  public hideCard(): void {
    stopSpeaking();
    if (this.cardEl) {
      this.cardEl.remove();
      this.cardEl = null;
    }
  }

  public hideAll(): void {
    this.hideIcon();
    this.hideCard();
  }
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function highlightWordInSentence(sentence: string, word: string): string {
  const safeSentence = escapeHtml(sentence);
  const cleanWord = word.trim();
  if (!cleanWord || cleanWord.length > 40) return safeSentence;
  const escapedRegex = cleanWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safeSentence.replace(
    new RegExp(`\\b(${escapedRegex}\\w*)\\b`, 'gi'),
    '<mark class="tm-ex-mark">$1</mark>'
  );
}
