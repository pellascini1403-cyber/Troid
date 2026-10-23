import type { Translator } from '@/i18n/translator';
import { cssHex, PALETTE } from '@/presentation/palette';
import { touchFrame, type Insets } from '../touch/layout';
import { NoticeModel, type NoticeKind } from './saveNoticeModel';

const STYLE_ID = 'troid-notice-style';
const rgba = (hex: number, a: number): string => `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${a})`;

/** What each notice says, as a translator key (literals: the catalogs are checked against them). */
const TEXT: Readonly<Record<NoticeKind, string>> = {
  saved: 'save.saved',
  failed: 'save.failed',
  recovered: 'save.recovered',
  damaged: 'save.damaged',
  unavailable: 'save.unavailable',
  conflict: 'save.conflict',
};

function noticeCss(): string {
  const core = cssHex(PALETTE.energyCore);
  const glow = cssHex(PALETTE.energyGlow);
  const white = cssHex(PALETTE.whiteHot);
  const violet = cssHex(PALETTE.violetGlow);
  return `
.troid-notice { position:absolute; left:0; top:0; z-index:26; display:none; align-items:center; gap:8px; max-width:min(300px, 60vw); padding:6px 12px 6px 10px; box-sizing:border-box; border-radius:3px; pointer-events:none; user-select:none; -webkit-user-select:none;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; color:${white}; background:linear-gradient(90deg, ${rgba(PALETTE.uiPanel, 0.0)}, ${rgba(PALETTE.uiPanel, 0.82)} 30%); border-right:2px solid ${rgba(PALETTE.energyCore, 0.7)}; transform-origin:100% 0; }
.troid-notice[data-open="1"] { display:flex; }
.troid-notice .notice-mark { flex:none; width:7px; height:7px; transform:rotate(45deg); background:${glow}; box-shadow:0 0 8px ${core}; }
.troid-notice .notice-text { font-size:11px; letter-spacing:0.2em; text-transform:uppercase; text-shadow:0 0 10px ${rgba(PALETTE.energyCore, 0.5)}; }
.troid-notice:not([data-kind="saved"]) { border-right-color:${rgba(PALETTE.violetCore, 0.9)}; }
.troid-notice:not([data-kind="saved"]) .notice-mark { background:${violet}; box-shadow:0 0 8px ${cssHex(PALETTE.violetCore)}; }
.troid-notice:not([data-kind="saved"]) .notice-text { font-size:12.5px; letter-spacing:0.02em; text-transform:none; text-shadow:none; line-height:1.3; }
`;
}

/**
 * The discreet line that tells the player what became of their saved game (DOM, docs/PROMPT14-LOG.md): a small mark and a few words at the top right, under the pause button, for a moment — "saved" is a blink that does not
 * ask for attention in a fight; a warning (the save did not reach the storage, a game was recovered, one could not be read, nothing can be kept) stays long enough to read. It never takes a touch
 * (`pointer-events: none`), has `role="status"` so a screen reader says it politely, and every word comes from the translator.
 */
export class SaveNotice {
  readonly root: HTMLDivElement;
  private readonly text: HTMLSpanElement;
  private readonly model = new NoticeModel();
  private last = { kind: '' as string, slot: -1, opacity: -1, text: '' };
  private readonly off: Array<() => void> = [];

  constructor(
    parent: HTMLElement,
    private readonly translator: Translator,
  ) {
    const doc = parent.ownerDocument;
    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement('style');
      style.id = STYLE_ID;
      style.appendChild(doc.createTextNode(noticeCss()));
      doc.head.appendChild(style);
    }
    this.root = doc.createElement('div');
    this.root.className = 'troid-notice';
    this.root.dataset['testid'] = 'save-notice';
    this.root.dataset['open'] = '0';
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
    const mark = doc.createElement('span');
    mark.className = 'notice-mark';
    mark.setAttribute('aria-hidden', 'true');
    this.text = doc.createElement('span');
    this.text.className = 'notice-text';
    this.text.dataset['testid'] = 'save-notice-text';
    this.root.append(mark, this.text);
    parent.appendChild(this.root);
    this.off.push(translator.changed.subscribe(() => this.refreshText(true)));
  }

  /** The notice now (the tests read it). */
  get current(): Readonly<{ kind: NoticeKind | null; slot: number; opacity: number }> {
    return this.model.state;
  }

  /**
   * The window and its safe area: the notice hangs from the right edge, just UNDER the pause button (which has the top right corner), growing to the left with its words. Where a window is so narrow that the
   * longest it can be would reach the HUD, it goes under the HUD as well.
   */
  place(width: number, height: number, insets: Insets, scale = 1, hudScale = 1): void {
    const margin = 16 * scale;
    const right = Math.round(width - insets.right - margin);
    const frame = touchFrame(width, height, insets, hudScale);
    const longest = Math.min(300, width * 0.6) * scale;
    const top = Math.round(Math.max(frame.pause.y1 + 2, right - longest < frame.hud.x1 ? frame.hud.y1 + 2 : 0));
    this.root.style.transform = `translate(${right}px, ${top}px) translateX(-100%) scale(${scale})`;
  }

  show(kind: NoticeKind, slot: number): void {
    this.model.show(kind, slot);
    this.update(0);
  }

  /** Once per frame, in real seconds: a notice goes on being read while the game is paused. */
  update(dt: number): void {
    const s = this.model.update(dt);
    const l = this.last;
    const open = s.kind !== null && s.opacity > 0;
    if (open !== (this.root.dataset['open'] === '1')) this.root.dataset['open'] = open ? '1' : '0';
    if (!open) {
      // closed: what was written is forgotten, so the next notice — even the same kind for the same slot — is worded again, in the language in force by then
      l.opacity = 0;
      l.kind = '';
      l.slot = -1;
      return;
    }
    if ((s.kind ?? '') !== l.kind || s.slot !== l.slot) {
      this.root.dataset['kind'] = s.kind ?? '';
      l.kind = s.kind ?? '';
      l.slot = s.slot;
      this.refreshText(true);
    }
    const o = Math.round(s.opacity * 50) / 50;
    if (o !== l.opacity) {
      this.root.style.opacity = String(o);
      l.opacity = o;
    }
  }

  dispose(): void {
    for (const f of this.off.splice(0)) f();
    this.root.remove();
  }

  /** The text of the kind being shown, in the language in force. */
  private refreshText(force: boolean): void {
    const kind = this.model.state.kind;
    if (kind === null) return;
    const words = this.translator.t(TEXT[kind], { slot: this.model.state.slot });
    if (force || words !== this.last.text) {
      this.text.textContent = words;
      this.last.text = words;
    }
  }
}
