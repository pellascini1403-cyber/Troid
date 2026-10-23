import { listen } from '@/app/dom';
import { onPress } from '@/app/press';
import { DisposableStore } from '@/core/lifecycle';
import type { Translator } from '@/i18n/translator';
import { cssHex, PALETTE } from '@/presentation/palette';
import { createIcon } from '../icons';

const STYLE_ID = 'troid-rotate-style';
const rgba = (hex: number, a: number): string => `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${a})`;

function rotateCss(): string {
  const glow = cssHex(PALETTE.energyGlow);
  const white = cssHex(PALETTE.whiteHot);
  return `
.troid-rotate { position:absolute; left:50%; top:0; z-index:27; display:none; grid-template-columns:auto 1fr; align-items:center; gap:8px 12px; width:max-content; max-width:min(340px, calc(100vw - 24px)); box-sizing:border-box; padding:10px 12px; border-radius:6px; pointer-events:auto; user-select:none; -webkit-user-select:none;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; color:${white}; background:${rgba(PALETTE.uiPanel, 0.92)}; border:1px solid ${rgba(PALETTE.energyCore, 0.6)}; box-shadow:0 0 18px ${rgba(PALETTE.energyGlow, 0.25)}; transform:translateX(-50%); }
.troid-rotate[data-open="1"] { display:grid; }
.troid-rotate .rotate-icon { color:${glow}; }
.troid-rotate .rotate-text { font-size:13px; line-height:1.35; letter-spacing:0.01em; }
.troid-rotate .rotate-play { grid-column:1 / -1; justify-self:end; min-height:40px; box-sizing:border-box; padding:0 14px; font:inherit; font-size:13px; color:${white}; background:${rgba(PALETTE.worldVoid, 0.6)}; border:1px solid ${rgba(PALETTE.energyCore, 0.5)}; border-radius:5px; cursor:pointer; touch-action:manipulation; }
.troid-rotate .rotate-play:focus-visible { outline:2px solid ${glow}; outline-offset:2px; }
`;
}

/**
 * THE NOTICE TO TURN THE DEVICE (DOM, docs/PROMPT20-LOG.md): the game is played sideways. On a touch screen held upright the picture sits in a band across the middle with the controls over it, and a short line at the top says
 * so — with a way to play on like that, because a player may have a reason. It hangs under the HUD, where the black of the upright window is empty. It does not stop the game (it is a hint, not a pause: a fight is not held for a sentence), asks for no focus (a key that jumps must not press its
 * button) and goes by itself when the device is turned; if the player chose to play anyway it stays away until the device has been turned and held upright again. Where it shows is decided by the page — only a touch screen,
 * only a window taller than it is wide — and every word is the translator's.
 */
export class RotateNotice {
  readonly root: HTMLDivElement;
  private readonly store = new DisposableStore();
  private readonly text: HTMLSpanElement;
  private readonly play: HTMLButtonElement;
  /** The player chose to go on: it stays away until the window has been right once. */
  private declined = false;
  private wanted = false;

  constructor(
    parent: HTMLElement,
    private readonly translator: Translator,
  ) {
    const doc = parent.ownerDocument;
    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement('style');
      style.id = STYLE_ID;
      style.appendChild(doc.createTextNode(rotateCss()));
      doc.head.appendChild(style);
    }
    this.root = doc.createElement('div');
    this.root.className = 'troid-rotate';
    this.root.dataset['testid'] = 'rotate-notice';
    this.root.dataset['uiBlock'] = '';
    this.root.dataset['open'] = '0';
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
    const icon = createIcon(doc, 'rotate', 26);
    icon.classList.add('rotate-icon');
    this.text = doc.createElement('span');
    this.text.className = 'rotate-text';
    this.text.dataset['testid'] = 'rotate-text';
    this.play = doc.createElement('button');
    this.play.type = 'button';
    this.play.className = 'rotate-play';
    this.play.dataset['testid'] = 'rotate-play';
    this.play.tabIndex = -1; // never focusable: the keys of the game must not press it
    this.root.append(icon, this.text, this.play);
    parent.appendChild(this.root);
    // a finger lifted over it presses it, as everywhere (a thumb may be on a button of the game: the browser makes no click of such a tap)
    onPress(this.store, this.play, () => {
      this.declined = true;
      this.render();
    });
    // a press on the notice is never a press of the game
    listen(this.store, this.root, 'pointerdown', (e) => e.stopPropagation());
    this.refreshTexts();
    this.store.add(translator.changed.subscribe(() => this.refreshTexts()));
  }

  get isOpen(): boolean {
    return this.root.dataset['open'] === '1';
  }

  /** The page says whether the window asks to be turned (a touch screen narrower than 4:3): it shows, unless the player chose to go on; once the window is right again the choice is forgotten. */
  want(wanted: boolean): void {
    this.wanted = wanted;
    if (!wanted) this.declined = false;
    this.render();
  }

  /** Where it hangs: the middle of the window, just under whatever is at the top (the HUD: `below` is the px where that ends) — in an upright phone that is the black above the picture. */
  place(below: number, scale = 1): void {
    this.root.style.top = `${Math.round(below + 8 * scale)}px`;
  }

  dispose(): void {
    this.store.dispose();
    this.root.remove();
  }

  private render(): void {
    this.root.dataset['open'] = this.wanted && !this.declined ? '1' : '0';
  }

  private refreshTexts(): void {
    this.text.textContent = this.translator.t('rotate.message');
    this.play.textContent = this.translator.t('rotate.play');
  }
}
