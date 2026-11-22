import { isTranslatableEnglish, splitIntoBatches } from '../shared/text-utils';
import {
  DisplayMode,
  PageTranslationState,
  RuntimeMessage,
  TranslationBatchResponse,
} from '../shared/types';

const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'CODE',
  'PRE',
  'TEXTAREA',
  'INPUT',
  'SELECT',
  'OPTION',
  'SVG',
  'CANVAS',
  'IFRAME',
  'KBD',
  'SAMP',
  'VAR',
  'MATH',
]);

const BILINGUAL_CLASS = 'transmao-bilingual-zh';
const STYLE_ID = 'transmao-page-style';

export class PageDomTranslator {
  private active = false;
  private mode: DisplayMode = 'bilingual';
  private engineUsed = '';
  private translatedCount = 0;

  // 保存原始文字節點內容，供「還原原文」時精準復原
  private originalTextMap = new Map<Text, string>();
  private insertedNodes = new Set<HTMLElement>();
  private processedNodes = new WeakSet<Node>();
  private observer: MutationObserver | null = null;
  private mutationTimer: number | null = null;
  private pendingRoots = new Set<Node>();

  public getState(): PageTranslationState {
    return {
      active: this.active,
      translatedCount: this.translatedCount,
      engineUsed: this.engineUsed,
    };
  }

  public async toggle(mode: DisplayMode): Promise<PageTranslationState> {
    if (this.active) {
      this.restore();
      return this.getState();
    }
    await this.translatePage(mode);
    return this.getState();
  }

  public async translatePage(mode: DisplayMode): Promise<void> {
    this.mode = mode;
    this.active = true;
    this.ensurePageStyles();

    const textNodes = this.collectTextNodes(document.body);
    await this.translateNodes(textNodes);
    this.startMutationObserver();
  }

  public restore(): void {
    this.active = false;
    this.stopMutationObserver();

    for (const el of this.insertedNodes) {
      el.remove();
    }
    this.insertedNodes.clear();

    for (const [node, orig] of this.originalTextMap.entries()) {
      if (node.isConnected) {
        node.nodeValue = orig;
      }
    }
    this.originalTextMap.clear();
    this.processedNodes = new WeakSet<Node>();
    this.translatedCount = 0;
  }

  private ensurePageStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${BILINGUAL_CLASS} {
        display: block;
        margin-top: 3px;
        margin-bottom: 4px;
        font-size: 0.92em;
        line-height: 1.55;
        color: inherit;
        opacity: 0.78;
        border-left: 2.5px solid #818cf8;
        padding-left: 8px;
        font-family: 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif;
      }
      a .${BILINGUAL_CLASS}, button .${BILINGUAL_CLASS}, span .${BILINGUAL_CLASS}, li > .${BILINGUAL_CLASS} {
        display: inline;
        border-left: none;
        padding-left: 4px;
        margin: 0;
      }
    `;
    document.head.appendChild(style);
  }

  private collectTextNodes(root: Node): Text[] {
    const nodes: Text[] = [];
    if (!root) return nodes;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (this.processedNodes.has(node)) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest('#transmao-root') || parent.classList.contains(BILINGUAL_CLASS)) {
          return NodeFilter.FILTER_REJECT;
        }
        if (parent.isContentEditable) return NodeFilter.FILTER_REJECT;

        let el: HTMLElement | null = parent;
        while (el) {
          if (SKIP_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
          el = el.parentElement;
        }

        const raw = node.nodeValue ?? '';
        if (!isTranslatableEnglish(raw)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let current = walker.nextNode();
    while (current) {
      nodes.push(current as Text);
      current = walker.nextNode();
    }
    return nodes;
  }

  private async translateNodes(nodes: Text[]): Promise<void> {
    if (nodes.length === 0) return;

    // 標記已排程避免重複處理
    const validNodes: Text[] = [];
    const rawTexts: string[] = [];

    for (const node of nodes) {
      if (this.processedNodes.has(node)) continue;
      const text = (node.nodeValue ?? '').trim();
      if (!text) continue;
      this.processedNodes.add(node);
      validNodes.push(node);
      rawTexts.push(text);
    }

    const batches = splitIntoBatches(rawTexts, 1500, 16);
    let offset = 0;

    for (const batch of batches) {
      if (!this.active) break;

      const sliceNodes = validNodes.slice(offset, offset + batch.length);
      offset += batch.length;

      try {
        const res = (await chrome.runtime.sendMessage({
          type: 'TRANSLATE_BATCH',
          texts: batch,
        } satisfies RuntimeMessage)) as TranslationBatchResponse;

        if (!this.active) break;
        if (res?.ok && Array.isArray(res.translations)) {
          this.engineUsed = res.engineUsed ?? this.engineUsed;
          res.translations.forEach((zh, idx) => {
            const targetNode = sliceNodes[idx];
            if (!targetNode || !targetNode.isConnected) return;
            if (!zh || zh.trim() === batch[idx]) return;
            this.applyTranslation(targetNode, zh.trim());
            this.translatedCount++;
          });
        }
      } catch {
        // 單一批次失敗時不中斷整頁翻譯
      }
    }
  }

  private applyTranslation(node: Text, translated: string): void {
    if (this.mode === 'replace') {
      if (!this.originalTextMap.has(node)) {
        this.originalTextMap.set(node, node.nodeValue ?? '');
      }
      node.nodeValue = translated;
      return;
    }

    // 雙語對照模式：於原文字節點後方插入隔離 span，不更動父元件事件監聽
    const parent = node.parentNode;
    if (!parent) return;

    const tag = document.createElement('span');
    tag.className = BILINGUAL_CLASS;
    tag.setAttribute('data-transmao', '1');
    tag.textContent = translated;
    this.processedNodes.add(tag);

    parent.insertBefore(tag, node.nextSibling);
    this.insertedNodes.add(tag);
  }

  private startMutationObserver(): void {
    this.stopMutationObserver();
    this.observer = new MutationObserver((mutations) => {
      if (!this.active) return;
      for (const m of mutations) {
        for (const added of m.addedNodes) {
          if (added.nodeType === Node.ELEMENT_NODE) {
            const el = added as HTMLElement;
            if (el.id === 'transmao-root' || el.classList?.contains(BILINGUAL_CLASS)) continue;
            this.pendingRoots.add(el);
          }
        }
      }

      if (this.pendingRoots.size > 0) {
        if (this.mutationTimer) window.clearTimeout(this.mutationTimer);
        this.mutationTimer = window.setTimeout(() => {
          const roots = Array.from(this.pendingRoots);
          this.pendingRoots.clear();
          const newNodes: Text[] = [];
          for (const r of roots) {
            if (r.isConnected) {
              newNodes.push(...this.collectTextNodes(r));
            }
          }
          if (newNodes.length > 0) {
            void this.translateNodes(newNodes);
          }
        }, 450);
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  private stopMutationObserver(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.mutationTimer) {
      window.clearTimeout(this.mutationTimer);
      this.mutationTimer = null;
    }
    this.pendingRoots.clear();
  }
}
