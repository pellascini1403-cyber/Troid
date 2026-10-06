import { listen } from '@/app/dom';
import { DisposableStore } from '@/core/lifecycle';
import type { Translator } from '@/i18n/translator';
import { cssHex, PALETTE } from '@/presentation/palette';
import { createIcon, iconForKind } from '../icons';
import { NO_INSETS, type Insets } from '../touch/layout';

/** How the prompt tells the touch layer that a finger touched the icon (the touch source owns every finger). */
export interface PromptPointerSink {
  down(pointerId: number, x: number, y: number, t: number): boolean;
  up(pointerId: number): void;
}

/**
 * What the prompt shows in one frame. `x, y` is the point the icon is anchored to — the TOP of the object — in CSS px (the
 * world→screen mapping is the app's job); the icon floats just above it, whatever the zoom, so the object stays visible beneath.
 */
export interface PromptState {
  active: boolean;
  /** Which object (the icon is rebuilt when it changes). */
  id: string;
  kind: string;
  /** Text key of the verb: the icon's accessible name, through the translator. */
  verbKey: string;
  x: number;
  y: number;
  /** The key or button of the device in use ('' for touch: the icon itself is the button). */
  glyph: string;
}

const STYLE_ID = 'troid-prompt-style';
/** Visible diameter of the icon, css px at scale 1 (the touch target is a few px larger), and the gap between it and the object. */
const SIZE = 48;
const HIT = 60;
const GAP = 10;

const rgba = (hex: number, a: number): string => `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${a})`;

function promptCss(): string {
  const glow = cssHex(PALETTE.energyGlow);
  const white = cssHex(PALETTE.whiteHot);
  const panel = rgba(PALETTE.uiPanel, 0.82);
  const rim = rgba(PALETTE.energyCore, 0.7);
  return `
.troid-prompt { position:absolute; inset:0; pointer-events:none; z-index:26; user-select:none; -webkit-user-select:none; }
.troid-prompt .prompt-hit { position:absolute; left:0; top:0; width:${HIT}px; height:${HIT}px; display:flex; align-items:center; justify-content:center; opacity:0; pointer-events:none; transition:opacity 120ms linear; touch-action:none; -webkit-tap-highlight-color:transparent; will-change:transform; }
.troid-prompt .prompt-hit[data-active="1"] { opacity:1; pointer-events:auto; }
.troid-prompt .prompt-disc { position:relative; width:${SIZE}px; height:${SIZE}px; box-sizing:border-box; border-radius:50%; border:1.5px solid ${rim}; background:${panel}; display:flex; align-items:center; justify-content:center; color:${glow}; box-shadow:0 0 12px ${rgba(PALETTE.energyGlow, 0.45)}; }
.troid-prompt .prompt-hit[data-pressed="1"] .prompt-disc { border-color:${white}; color:${white}; }
.troid-prompt .prompt-glyph { position:absolute; right:-6px; bottom:-6px; min-width:20px; height:20px; padding:0 5px; box-sizing:border-box; border-radius:5px; border:1px solid ${rim}; background:${panel}; color:${white}; font:700 12px/18px system-ui, sans-serif; text-align:center; }
.troid-prompt .prompt-glyph:empty { display:none; }
@media (prefers-reduced-motion: reduce) { .troid-prompt .prompt-hit { transition:none; } }
`;
}

/** Runs `apply` only when `value` differs from what was applied last. */
function set(cache: Record<string, string | number | boolean>, key: string, value: string | number | boolean, apply: () => void): boolean {
  if (cache[key] === value) return false;
  cache[key] = value;
  apply();
  return true;
}

/**
 * The interaction icon (DOM, docs/GAME-SPEC-2D.md §12): it exists only while an object has it, floats over that object, fades in
 * 120 ms, and on touch IS the button (tap the icon). On a keyboard or a gamepad it carries the key or button as a small badge.
 * It is NOT a permanent button: when nothing can be interacted with it is not there (and does not catch a finger).
 *
 * It reads a `PromptState` (it knows no entity and no simulation), writes to the DOM only when something changed, holds no text of
 * its own (the verb is its accessible name, from the translator) and reports back only a finger on it.
 */
export class InteractionPrompt {
  readonly root: HTMLDivElement;
  private readonly hit: HTMLDivElement;
  private readonly disc: HTMLDivElement;
  private readonly glyph: HTMLDivElement;
  private readonly store = new DisposableStore();
  private readonly last: Record<string, string | number | boolean> = {};
  private insets: Insets = NO_INSETS;
  private width = 0;
  private height = 0;
  private scale: number;
  private verbKey = '';

  constructor(
    parent: HTMLElement,
    private readonly translator: Translator,
    private readonly sink: PromptPointerSink,
    options: { scale?: number } = {},
  ) {
    const doc = parent.ownerDocument;
    this.scale = options.scale ?? 1;
    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement('style');
      style.id = STYLE_ID;
      style.appendChild(doc.createTextNode(promptCss()));
      doc.head.appendChild(style);
    }
    this.root = doc.createElement('div');
    this.root.className = 'troid-prompt';
    this.root.dataset['testid'] = 'prompt';
    this.hit = doc.createElement('div');
    this.hit.className = 'prompt-hit';
    this.hit.dataset['testid'] = 'prompt-hit';
    this.hit.dataset['active'] = '0';
    this.hit.dataset['pressed'] = '0';
    this.hit.setAttribute('role', 'button');
    this.disc = doc.createElement('div');
    this.disc.className = 'prompt-disc';
    this.glyph = doc.createElement('div');
    this.glyph.className = 'prompt-glyph';
    this.glyph.dataset['testid'] = 'prompt-glyph';
    this.disc.appendChild(this.glyph);
    this.hit.appendChild(this.disc);
    this.root.appendChild(this.hit);
    parent.appendChild(this.root);
    this.bindPointer();
    this.store.add(translator.changed.subscribe(() => this.refreshLabel()));
  }

  /** The window and its safe area: the icon never leaves the usable part of the screen. Call on start and on every resize. */
  place(width: number, height: number, insets: Insets, scale = this.scale): void {
    this.width = width;
    this.height = height;
    this.insets = insets;
    this.scale = scale;
    this.last['pos'] = '';
  }

  /** Applies a frame. Only what changed reaches the DOM. */
  update(s: Readonly<PromptState>): void {
    set(this.last, 'active', s.active, () => {
      this.hit.dataset['active'] = s.active ? '1' : '0';
      if (!s.active) this.letGo();
    });
    if (!s.active) return;
    const objectChanged = set(this.last, 'id', s.id, () => undefined);
    const kindChanged = set(this.last, 'kind', s.kind, () => undefined);
    if (objectChanged || kindChanged) {
      this.disc.querySelector('svg')?.remove();
      const icon = createIcon(this.root.ownerDocument, iconForKind(s.kind), 24);
      this.disc.insertBefore(icon, this.glyph);
      this.hit.dataset['kind'] = s.kind;
      this.hit.dataset['object'] = s.id;
    }
    if (set(this.last, 'verb', s.verbKey, () => (this.verbKey = s.verbKey))) this.refreshLabel();
    set(this.last, 'glyph', s.glyph, () => (this.glyph.textContent = s.glyph));

    // just above the point, kept inside the usable screen (a window that has not been placed yet leaves it where it is)
    let x = s.x;
    let y = s.y - ((SIZE / 2 + GAP) * this.scale);
    if (this.width > 0 && this.height > 0) {
      const r = (HIT * this.scale) / 2;
      x = Math.min(Math.max(x, this.insets.left + r), this.width - this.insets.right - r);
      y = Math.min(Math.max(y, this.insets.top + r), this.height - this.insets.bottom - r);
    }
    const px = Math.round((x - HIT / 2) * 2) / 2;
    const py = Math.round((y - HIT / 2) * 2) / 2;
    // the whole touch target scales about its centre with the controls: a bigger icon is a bigger target too
    set(this.last, 'pos', `${px},${py},${this.scale}`, () => (this.hit.style.transform = `translate(${px}px, ${py}px)${this.scale === 1 ? '' : ` scale(${this.scale})`}`));
  }

  dispose(): void {
    this.store.dispose();
    this.root.remove();
  }

  // ----------------------------------------------------------------------------------------------- internals

  /** The finger that holds the icon, or −1. */
  private pointer = -1;

  /** The icon went away under a finger: let go of it (the source must not keep an Interact press for an icon that is not there). */
  private letGo(): void {
    if (this.pointer < 0) return;
    this.sink.up(this.pointer);
    this.pointer = -1;
    this.hit.dataset['pressed'] = '0';
  }

  private bindPointer(): void {
    listen(this.store, this.hit, 'pointerdown', (e) => {
      e.preventDefault();
      if (!this.sink.down(e.pointerId, e.clientX, e.clientY, e.timeStamp)) return;
      this.pointer = e.pointerId;
      this.hit.dataset['pressed'] = '1';
      try {
        this.hit.setPointerCapture(e.pointerId);
      } catch {
        // a synthetic pointer (tests) cannot be captured: the source still owns it
      }
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== this.pointer) return;
      this.sink.up(e.pointerId);
      this.pointer = -1;
      this.hit.dataset['pressed'] = '0';
    };
    listen(this.store, this.hit, 'pointerup', end);
    listen(this.store, this.hit, 'pointercancel', end);
    listen(this.store, this.hit, 'lostpointercapture', end);
  }

  private refreshLabel(): void {
    this.hit.setAttribute('aria-label', this.verbKey === '' ? '' : this.translator.t(this.verbKey));
  }
}
