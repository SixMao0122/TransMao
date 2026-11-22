import { isWordSaved, toggleSavedVocab } from '../shared/storage';
import { BoxRect, clampPopoverPosition, mapPosToZhTW } from '../shared/text-utils';
import { DictionaryResult } from '../shared/types';
import { speakWord, stopSpeaking } from './audio';

const SVG_SPEAKER = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
const SVG_CLOSE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const SVG_BOOKMARK = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;
const SVG_BOOKMARK_FILLED = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;
const SVG_COPY = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

const POPOVER_CSS = `
  :host {
    all: initial;
    font-family: 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', -apple-system, sans-serif;
  }

  * {
    box-sizing: border-box;
  }

  .tm-icon-btn {
    position: fixed;
    z-index: 2147483647;
    width: 34px;
    height: 34px;
    border-radius: 10px;
    border: 1.5px solid #26231f;
    background: #c85a32;
    color: #fbf9f5;
    font-weight: 800;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 2.5px 2.5px 0 #26231f;
    transition: transform 0.14s ease, box-shadow 0.14s ease, background 0.14s ease;
    animation: tmPopIn 0.14s ease-out;
    user-select: none;
  }

  .tm-icon-btn:hover {
    background: #b24b26;
    transform: translate(-1px, -1px);
    box-shadow: 3.5px 3.5px 0 #26231f;
  }

  .tm-card {
    position: fixed;
    z-index: 2147483647;
    width: 368px;
    max-width: calc(100vw - 24px);
    max-height: 440px;
    display: flex;
    flex-direction: column;
    border-radius: 14px;
    background: #fbf9f5;
    border: 1.5px solid #26231f;
    box-shadow: 5px 5px 0 rgba(38, 35, 31, 0.9);
    color: #1f1d1a;
    overflow: hidden;
    animation: tmPopIn 0.16s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .tm-header {
    padding: 14px 16px 10px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    border-bottom: 1px dashed #d8d1c5;
  }

  .tm-word {
    font-size: 20px;
    font-weight: 800;
    color: #1f1d1a;
    line-height: 1.25;
    word-break: break-word;
    letter-spacing: -0.2px;
  }

  .tm-phonetic {
    font-family: ui-monospace, 'Cascadia Code', monospace;
    font-size: 12.5px;
    color: #6b655b;
    margin-top: 3px;
  }

  .tm-close {
    background: #f2ece1;
    border: 1px solid #d8d1c5;
    color: #57524a;
    width: 26px;
    height: 26px;
    border-radius: 7px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.14s, color 0.14s, border-color 0.14s;
  }

  .tm-close:hover {
    background: #fae8e2;
    border-color: #c85a32;
    color: #c85a32;
  }

  .tm-audio-row {
    padding: 10px 16px 8px;
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
    border: 1px solid #26231f;
    background: #ffffff;
    color: #1f1d1a;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 1.5px 1.5px 0 #26231f;
    transition: transform 0.12s, background 0.12s, color 0.12s;
  }

  .tm-audio-btn:hover {
    background: #f5efe6;
    transform: translate(-0.5px, -0.5px);
  }

  .tm-audio-btn.speaking {
    background: #c85a32;
    border-color: #26231f;
    color: #fbf9f5;
  }

  .tm-body {
    padding: 4px 16px 14px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 11px;
  }

  .tm-body::-webkit-scrollbar {
    width: 6px;
  }
  .tm-body::-webkit-scrollbar-thumb {
    background: #d5cdc0;
    border-radius: 999px;
  }

  .tm-primary-box {
    background: #f3ece0;
    border: 1px solid #dfd6c7;
    border-left: 3.5px solid #c85a32;
    border-radius: 8px;
    padding: 9px 12px;
    font-size: 16px;
    font-weight: 700;
    color: #1f1d1a;
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
    border-radius: 5px;
    font-size: 11.5px;
    font-weight: 700;
    letter-spacing: 0.2px;
  }

  .tm-def-item {
    padding-left: 9px;
    border-left: 2px solid #dfd6c7;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .tm-def-zh {
    font-size: 13.5px;
    color: #1f1d1a;
    font-weight: 600;
    line-height: 1.45;
  }

  .tm-def-en {
    font-size: 12px;
    color: #6b655b;
    line-height: 1.45;
  }

  .tm-example {
    margin-top: 4px;
    padding: 7px 10px;
    border-radius: 8px;
    background: #ffffff;
    border: 1px solid #e4ddd1;
    font-size: 12px;
    line-height: 1.5;
  }

  .tm-example-en {
    color: #2c2925;
  }

  .tm-example-zh {
    color: #6b655b;
    margin-top: 3px;
  }

  .tm-ex-mark {
    background: #f9e2d2;
    color: #9a3b1a;
    padding: 0 3px;
    border-radius: 3px;
    font-weight: 700;
  }

  .tm-footer {
    padding: 9px 16px;
    border-top: 1px dashed #d8d1c5;
    background: #f5efe6;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11.5px;
    color: #787166;
    flex-shrink: 0;
  }

  .tm-footer-actions {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .tm-action-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #ffffff;
    border: 1px solid #c9c0b1;
    color: #3a3630;
    border-radius: 7px;
    padding: 3px 9px;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.14s;
  }

  .tm-action-btn:hover {
    border-color: #26231f;
    color: #1f1d1a;
  }

  .tm-action-btn.saved {
    background: #c85a32;
    border-color: #26231f;
    color: #fbf9f5;
  }

  .tm-loading {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  .tm-shimmer {
    height: 13px;
    border-radius: 6px;
    background: linear-gradient(90deg, #ede6da 25%, #e2d9c9 50%, #ede6da 75%);
    background-size: 200% 100%;
    animation: tmShimmer 1s infinite linear;
  }

  .tm-toast {
    position: fixed;
    right: 20px;
    bottom: 20px;
    z-index: 2147483647;
    padding: 10px 16px;
    border-radius: 10px;
    background: #fbf9f5;
    border: 1.5px solid #26231f;
    color: #1f1d1a;
    font-size: 13px;
    font-weight: 600;
    box-shadow: 3px 3px 0 #26231f;
    animation: tmPopIn 0.16s ease-out;
  }

  @keyframes tmPopIn {
    from { opacity: 0; transform: translateY(5px) scale(0.97); }
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
    const pos = clampPopoverPosition(anchor, 368, 190, window.innerWidth, window.innerHeight);

    const card = document.createElement('div');
    card.className = 'tm-card';
    card.style.left = `${pos.x}px`;
    card.style.top = `${pos.y}px`;

    card.innerHTML = `
      <div class="tm-header">
        <div>
          <div class="tm-word">${escapeHtml(word)}</div>
          <div class="tm-phonetic">查詢繁中釋義與例句中...</div>
        </div>
        <button class="tm-close" title="關閉 (Esc)">${SVG_CLOSE}</button>
      </div>
      <div class="tm-loading">
        <div class="tm-shimmer" style="width: 68%; height: 22px;"></div>
        <div class="tm-shimmer" style="width: 90%;"></div>
        <div class="tm-shimmer" style="width: 78%;"></div>
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
    const pos = clampPopoverPosition(anchor, 368, 340, window.innerWidth, window.innerHeight);
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
              ${d.en ? `<div class="tm-def-en">${escapeHtml(d.en)}</div>` : ''}
              ${
                d.example
                  ? `<div class="tm-example">
                       <div class="tm-example-en">“${highlightWordInSentence(d.example.en, result.word)}”</div>
                       ${d.example.zh ? `<div class="tm-example-zh">${escapeHtml(d.example.zh)}</div>` : ''}
                     </div>`
                  : ''
              }
            </div>`
          )
          .join('');

        return `
          <div class="tm-meaning">
            <span class="tm-pos-pill" style="background: ${posMeta.color}18; color: ${posMeta.color}; border: 1px solid ${posMeta.color}45;">
              ${escapeHtml(m.partOfSpeechZh)}
            </span>
            ${defsHtml}
          </div>
        `;
      })
      .join('');

    card.innerHTML = `
      <div class="tm-header">
        <div>
          <div class="tm-word">${escapeHtml(result.word)}</div>
          ${result.phonetic ? `<div class="tm-phonetic">${escapeHtml(result.phonetic)}</div>` : ''}
        </div>
        <button class="tm-close" title="關閉 (Esc)">${SVG_CLOSE}</button>
      </div>
      <div class="tm-audio-row">
        <button class="tm-audio-btn us" title="美式發音">${SVG_SPEAKER}<span>美音 US</span></button>
        <button class="tm-audio-btn uk" title="英式發音">${SVG_SPEAKER}<span>英音 UK</span></button>
      </div>
      <div class="tm-body">
        <div class="tm-primary-box">${escapeHtml(result.translation)}</div>
        ${meaningsHtml}
      </div>
      <div class="tm-footer">
        <span>TransMao · ${escapeHtml(result.engineUsed)}</span>
        <div class="tm-footer-actions">
          <button class="tm-action-btn copy-btn">${SVG_COPY}<span>複製</span></button>
          <button class="tm-action-btn save-btn ${saved ? 'saved' : ''}">
            ${saved ? SVG_BOOKMARK_FILLED : SVG_BOOKMARK}<span>${saved ? '已收藏' : '收藏'}</span>
          </button>
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
        const label = copyBtn.querySelector('span');
        if (label) {
          label.textContent = '已複製';
          setTimeout(() => (label.textContent = '複製'), 1400);
        }
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
      saveBtn.innerHTML = `${nowSaved ? SVG_BOOKMARK_FILLED : SVG_BOOKMARK}<span>${nowSaved ? '已收藏' : '收藏'}</span>`;
    });

    shadow.appendChild(card);
    this.cardEl = card;

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
      <div class="tm-header">
        <div class="tm-word">${escapeHtml(word)}</div>
        <button class="tm-close">${SVG_CLOSE}</button>
      </div>
      <div class="tm-body" style="color: #b24b26; font-size: 13px; padding-top: 10px;">
        查詢暫時失敗：${escapeHtml(message)}
      </div>
    `;
    card.querySelector('.tm-close')?.addEventListener('click', () => this.hideAll());
    shadow.appendChild(card);
    this.cardEl = card;
  }

  public showToast(message: string, durationMs = 2400): void {
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
