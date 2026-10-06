import { listen } from '@/app/dom';
import { DisposableStore } from '@/core/lifecycle';
import type { Translator } from '@/i18n/translator';
import { cssHex, PALETTE } from '@/presentation/palette';
import { createIcon } from '../icons';
import { NO_INSETS, type Insets } from '../touch/layout';

const STYLE_ID = 'troid-pause-style';
/** Size of the button, css px at scale 1 (the controls' scale is never below 0.9): a finger-sized target, 44 px at the least. The visible disc is smaller. */
const SIZE = 50;
const MARGIN = 8;

const rgba = (hex: number, a: number): string => `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${a})`;

function pauseCss(): string {
  return `
.troid-pause { position:absolute; left:0; top:0; width:${SIZE}px; height:${SIZE}px; pointer-events:auto; display:flex; align-items:center; justify-content:center; z-index:24; cursor:pointer; user-select:none; -webkit-user-select:none; touch-action:manipulation; -webkit-tap-highlight-color:transparent; outline:none; }
.troid-pause .pause-disc { width:38px; height:38px; box-sizing:border-box; border-radius:50%; border:1.5px solid ${rgba(PALETTE.energyCore, 0.4)}; background:${rgba(PALETTE.uiPanel, 0.6)}; color:${cssHex(PALETTE.energyGlow)}; display:flex; align-items:center; justify-content:center; opacity:0.7; transition:opacity 120ms linear; }
.troid-pause:hover .pause-disc, .troid-pause[data-pressed="1"] .pause-disc { opacity:1; }
@media (prefers-reduced-motion: reduce) { .troid-pause .pause-disc { transition:none; } }
`;
}

/**
 * The entry to the pause / settings menu (DOM): one small icon at the TOP CENTRE of the screen — not on the right, where the
 * three fixed controls live, and not a gameplay control. Pressing it (or Escape / P / the pad's Start) pauses the game and opens
 * the menu. It never takes keyboard focus (a Space press that jumps must not also "click" it) and, like the other overlays, a
 * click on it is never an attack (`data-ui-block`). Holds no text: its name is the translator's `settings.open`.
 */
export class PauseButton {
  readonly root: HTMLDivElement;
  private readonly store = new DisposableStore();
  private insets: Insets = NO_INSETS;
  private width = 0;
  private height = 0;
  private scale = 1;

  constructor(
    parent: HTMLElement,
    private readonly translator: Translator,
    onPress: () => void,
  ) {
    const doc = parent.ownerDocument;
    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement('style');
      style.id = STYLE_ID;
      style.appendChild(doc.createTextNode(pauseCss()));
      doc.head.appendChild(style);
    }
    this.root = doc.createElement('div');
    this.root.className = 'troid-pause';
    this.root.dataset['testid'] = 'pause-button';
    this.root.dataset['uiBlock'] = '';
    this.root.dataset['pressed'] = '0';
    this.root.setAttribute('role', 'button');
    this.root.tabIndex = -1; // never focusable: the keys of the game must not click it
    const disc = doc.createElement('div');
    disc.className = 'pause-disc';
    disc.appendChild(createIcon(doc, 'pause', 22));
    this.root.appendChild(disc);
    parent.appendChild(this.root);

    listen(this.store, this.root, 'pointerdown', (e) => {
      e.preventDefault(); // no focus, no text selection, and not a game press either
      this.root.dataset['pressed'] = '1';
    });
    const up = (): void => void (this.root.dataset['pressed'] = '0');
    listen(this.store, this.root, 'pointerup', up);
    listen(this.store, this.root, 'pointercancel', up);
    listen(this.store, this.root, 'pointerleave', up);
    listen(this.store, this.root, 'click', (e) => {
      e.preventDefault();
      onPress();
    });
    this.refreshLabel();
    this.store.add(translator.changed.subscribe(() => this.refreshLabel()));
  }

  /** The window and its safe area: the button is centred in what is usable, below the top inset. Call on start and on every resize. */
  place(width: number, height: number, insets: Insets, scale = 1): void {
    this.width = width;
    this.height = height;
    this.insets = insets;
    this.scale = scale;
    const left = insets.left + (width - insets.left - insets.right) / 2 - SIZE / 2;
    const top = insets.top + MARGIN * scale;
    Object.assign(this.root.style, { transform: `translate(${Math.round(left)}px, ${Math.round(top)}px) scale(${scale})` });
  }

  /** The menu is open: the button steps out of the way (it is the menu's own Resume that closes it). */
  setHidden(hidden: boolean): void {
    this.root.style.visibility = hidden ? 'hidden' : 'visible';
  }

  dispose(): void {
    this.store.dispose();
    this.root.remove();
  }

  private refreshLabel(): void {
    this.root.setAttribute('aria-label', this.translator.t('settings.open'));
  }

  /** The window it was last placed for (tests). */
  get placedFor(): { width: number; height: number; insets: Insets; scale: number } {
    return { width: this.width, height: this.height, insets: this.insets, scale: this.scale };
  }
}
