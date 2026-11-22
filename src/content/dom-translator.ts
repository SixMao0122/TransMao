import { isTranslatableEnglish, splitIntoBatches } from '../shared/text-utils';
import {
  DisplayMode,
  PageTranslationState,
  RuntimeMessage,
  TranslationBatchResponse,
  TranslationEngineMode,
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
  private translating = false;
  private mode: DisplayMode = 'bilingual';
  private engineMode: TranslationEngineMode = 'auto';
  private engineUsed = '';
  private translatedCount = 0;
  private totalCount = 0;
  private lastError: string | undefined;

  // 保存原始文字節點內容，供「還原原文」時精準復原
  private originalTextMap = new Map<Text, string>();
  private insertedNodes = new Set<HTMLElement>();
  private processedNodes = new WeakSet<Node>();

  // 捲動懶載入（IntersectionObserver）與串流佇列
  private intersectionObserver: IntersectionObserver | null = null;
  private deferredByElement = new Map<Element, Text[]>();
  private pendingQueue: Text[] = [];
  private draining = false;

  private mutationObserver: MutationObserver | null = null;
  private mutationTimer: number | null = null;
  private pendingRoots = new Set<Node>();

  public getState(): PageTranslationState {
    return {
      active: this.active,
      translating: this.translating,
      translatedCount: this.translatedCount,
      totalCount: this.totalCount,
      engineUsed: this.engineUsed,
      lastError: this.lastError,
    };
  }

  /**
   * 非阻塞切換整頁翻譯：
   * 透過 IntersectionObserver 僅翻譯目前可視畫面段落，滑動到下方時再即時懶載入翻譯。
   */
  public toggle(mode: DisplayMode, engineMode: TranslationEngineMode = 'auto'): PageTranslationState {
    if (this.active) {
      this.restore();
      return this.getState();
    }
    this.startPageTranslation(mode, engineMode);
    return this.getState();
  }

  public startPageTranslation(mode: DisplayMode, engineMode: TranslationEngineMode = 'auto'): void {
    this.mode = mode;
    this.engineMode = engineMode;
    this.active = true;
    this.lastError = undefined;
    this.ensurePageStyles();
    this.ensureIntersectionObserver();

    const textNodes = this.collectTextNodes(document.body);
    this.scheduleNodesWithViewportLazyLoad(textNodes);
    this.startMutationObserver();
  }

  public restore(): void {
    this.active = false;
    this.translating = false;
    this.draining = false;
    this.lastError = undefined;
    this.pendingQueue = [];
    this.deferredByElement.clear();
    this.stopIntersectionObserver();
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
    this.totalCount = 0;
  }

  private ensurePageStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${BILINGUAL_CLASS} {
        display: block;
        margin: 6px 0 10px;
        padding: 7px 12px;
        font-size: 0.94em;
        line-height: 1.62;
        color: inherit;
        background: rgba(214, 168, 108, 0.28);
        border: 1px solid rgba(200, 90, 50, 0.22);
        border-left: 3.5px solid #c85a32;
        border-radius: 0 7px 7px 0;
        font-family: 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif;
      }
      a .${BILINGUAL_CLASS}, button .${BILINGUAL_CLASS}, span .${BILINGUAL_CLASS}, li > .${BILINGUAL_CLASS} {
        display: inline-block;
        padding: 1px 6px;
        margin: 0 0 0 5px;
        border: none;
        border-radius: 4px;
        background: rgba(214, 168, 108, 0.30);
      }
    `;
    document.head.appendChild(style);
  }

  private ensureIntersectionObserver(): void {
    this.stopIntersectionObserver();
    if (typeof IntersectionObserver === 'undefined') return;

    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        if (!this.active) return;
        const newlyVisible: Text[] = [];
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target;
          this.intersectionObserver?.unobserve(el);
          const list = this.deferredByElement.get(el);
          if (list) {
            this.deferredByElement.delete(el);
            newlyVisible.push(...list);
          }
        }
        if (newlyVisible.length > 0) {
          this.enqueueNodes(newlyVisible);
        }
      },
      { rootMargin: '280px 0px' }
    );
  }

  private stopIntersectionObserver(): void {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = null;
    }
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
          if (el.getAttribute('aria-hidden') === 'true' || el.hidden) return NodeFilter.FILTER_REJECT;
          el = el.parentElement;
        }

        // 略過不可見的隱藏節點，大幅減少無效翻譯數量
        const rect = parent.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return NodeFilter.FILTER_REJECT;
        const style = window.getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden') return NodeFilter.FILTER_REJECT;

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

  private scheduleNodesWithViewportLazyLoad(nodes: Text[]): void {
    if (nodes.length === 0) return;

    const vpHeight = window.innerHeight || 900;
    const immediate: Text[] = [];

    for (const node of nodes) {
      const parent = node.parentElement;
      if (!parent) continue;
      const rect = parent.getBoundingClientRect();
      const nearViewport = rect.bottom >= -200 && rect.top <= vpHeight + 280;

      if (nearViewport || !this.intersectionObserver) {
        immediate.push(node);
      } else {
        const existing = this.deferredByElement.get(parent);
        if (existing) {
          existing.push(node);
        } else {
          this.deferredByElement.set(parent, [node]);
          this.intersectionObserver.observe(parent);
        }
      }
    }

    if (immediate.length > 0) {
      this.enqueueNodes(immediate);
    }
  }

  private enqueueNodes(nodes: Text[]): void {
    let added = 0;
    for (const node of nodes) {
      if (this.processedNodes.has(node)) continue;
      const text = (node.nodeValue ?? '').trim();
      if (!text) continue;
      this.processedNodes.add(node);
      this.pendingQueue.push(node);
      added++;
    }

    if (added > 0) {
      this.totalCount += added;
      if (!this.draining) {
        void this.drainQueue();
      }
    }
  }

  private async drainQueue(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    this.translating = true;

    const isLocalHf = this.engineMode === 'hf-local';
    const maxChars = isLocalHf ? 360 : 900;
    const maxItems = isLocalHf ? 1 : 6;

    try {
      while (this.active && this.pendingQueue.length > 0) {
        const chunkNodes = this.pendingQueue.splice(0, maxItems);
        const validPairs: Array<{ node: Text; text: string }> = [];
        for (const node of chunkNodes) {
          if (!node.isConnected) continue;
          const text = (node.nodeValue ?? '').trim();
          if (text) validPairs.push({ node, text });
        }
        if (validPairs.length === 0) continue;

        const batches = splitIntoBatches(
          validPairs.map((p) => p.text),
          maxChars,
          maxItems
        );
        let offset = 0;

        for (const batch of batches) {
          if (!this.active) break;
          const slicePairs = validPairs.slice(offset, offset + batch.length);
          offset += batch.length;

          try {
            const res = (await chrome.runtime.sendMessage({
              type: 'TRANSLATE_BATCH',
              texts: batch,
              engine: this.engineMode,
            } satisfies RuntimeMessage)) as TranslationBatchResponse;

            if (!this.active) break;
            if (res?.ok && Array.isArray(res.translations)) {
              this.engineUsed = res.engineUsed ?? this.engineUsed;
              res.translations.forEach((zh, idx) => {
                const targetNode = slicePairs[idx]?.node;
                if (!targetNode || !targetNode.isConnected) return;
                if (!zh || zh.trim() === batch[idx]) return;
                this.applyTranslation(targetNode, zh.trim());
                this.translatedCount++;
              });
            } else if (res?.error) {
              this.lastError = res.error;
            }
          } catch (err) {
            this.lastError = err instanceof Error ? err.message : String(err);
          }
        }
      }
    } finally {
      this.draining = false;
      this.translating = false;
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
    this.mutationObserver = new MutationObserver((mutations) => {
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
            this.scheduleNodesWithViewportLazyLoad(newNodes);
          }
        }, 450);
      }
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  private stopMutationObserver(): void {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
    if (this.mutationTimer) {
      window.clearTimeout(this.mutationTimer);
      this.mutationTimer = null;
    }
    this.pendingRoots.clear();
  }
}
