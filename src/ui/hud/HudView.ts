import { listen } from '@/app/dom';
import { DisposableStore } from '@/core/lifecycle';
import type { Translator } from '@/i18n/translator';
import { HUD_ART, type HudPiece } from './art';
import { HUD_DP_PER_PX, HUD_NUMBER, HUD_PX, type PxBox } from './artGeometry';
import { placeBar } from './barLayout';
import type { Insets } from '../touch/layout';
import { NO_INSETS } from '../touch/layout';
import type { BarState, HudState } from './HudModel';
import { computeHudLayout, HUD_DESIGN, type HudLayout } from './layout';

/** How the HUD tells the touch layer that a finger touched a bottle (the touch source owns every finger). */
export interface HudPointerSink {
  down(pointerId: number, slot: number, x: number, y: number, t: number): boolean;
  up(pointerId: number): void;
}

const STYLE_ID = 'troid-hud-style';

/** The font of the numbers: the artist typed them in a light humanist sans; this is the nearest the device has. */
const NUMBER_FONT = '"Segoe UI Light", "Segoe UI", "Helvetica Neue", Roboto, "Noto Sans", system-ui, -apple-system, sans-serif';
/** The digits of that font are about this tall in ems (the height of a capital): the font is sized so that they are as tall as the artist's. */
const DIGIT_EM = 0.71;

const blk = HUD_PX.block;
/** A length in pixels of the artist's canvas, as CSS. The DOM of the HUD IS the artist's canvas at its own size — every piece at 1:1, where the artist put it — and the whole block is scaled to the screen (`relayout`): a
 * piece is never positioned or sized in a unit that has to be rounded to a pixel of the screen, so no piece is moved or stretched by up to half a pixel by the browser's snapping of pictures. */
const px = (n: number): string => `${Number(n.toFixed(3))}px`;
/** Where a piece goes: its place in the artist's canvas, from the top left of the block. */
const at = (b: PxBox): string => `left:${px(b.x - blk.x)};top:${px(b.y - blk.y)};width:${px(b.w)};height:${px(b.h)};`;

/** The HUD's stylesheet: where the artist put each piece, and nothing that draws anything (the pictures are the artist's; the only text is the number). Every length is in pixels of the artist's canvas. */
function hudCss(): string {
  const m = HUD_PX.marker;
  const b = HUD_PX.bottle;
  const hit = HUD_DESIGN.vial.hitH / HUD_DP_PER_PX; // a touch area as tall as a finger needs, in pixels of the canvas
  const numberSize = HUD_NUMBER.digitHeight / DIGIT_EM;
  const shadow = (color: string): string => `text-shadow:${px(HUD_NUMBER.shadow)} ${px(HUD_NUMBER.shadow)} 0 ${color};`;
  return `
.troid-hud { position:absolute; inset:0; pointer-events:none; z-index:25; user-select:none; -webkit-user-select:none; }
.troid-hud .hud-block { position:absolute; transform-origin:0 0; width:${px(blk.w)}; height:${px(blk.h)}; }
.troid-hud .hud-img { position:absolute; display:block; max-width:none; max-height:none; margin:0; padding:0; border:0; pointer-events:none; -webkit-user-drag:none; user-select:none; }
.troid-hud .hud-portrait { ${at(HUD_PX.portrait)} }
.troid-hud .hud-plate-life { ${at(HUD_PX.plateLife)} }
.troid-hud .hud-plate-magic { ${at(HUD_PX.plateMagic)} }

/* ---- a bar: the dark picture from where the life ends on, the bright one up to it, the white rectangle where they meet, and the number ---- */
.troid-hud .hud-bar { position:absolute; }
.troid-hud .hud-bar-life { ${at(HUD_PX.barLife)} }
.troid-hud .hud-bar-magic { ${at(HUD_PX.barMagic)} }
.troid-hud .hud-bar .hud-lost, .troid-hud .hud-bar .hud-fill { left:0; top:0; width:100%; height:100%; }
.troid-hud .hud-bar .hud-mark { left:0; width:${px(m.w)}; height:${px(m.h)}; transform-origin:0 50%; }
.troid-hud .hud-bar-life .hud-mark { top:${px((HUD_PX.barLife.h - m.h) / 2)}; }
.troid-hud .hud-bar-magic .hud-mark { top:${px((HUD_PX.barMagic.h - m.h) / 2)}; }
.troid-hud .hud-num { position:absolute; left:${px(HUD_NUMBER.left)}; top:0; height:100%; display:flex; align-items:center; margin:0; padding:0; white-space:nowrap; color:${HUD_NUMBER.color}; font:300 ${px(numberSize)}/1 ${NUMBER_FONT}; font-variant-numeric:lining-nums; }
.troid-hud .hud-bar-life .hud-num { ${shadow(HUD_NUMBER.shadowLife)} }
.troid-hud .hud-bar-magic .hud-num { ${shadow(HUD_NUMBER.shadowMagic)} }

/* ---- the bottles: the artist's row; each one is a touch area as tall as a finger needs and as wide as its pitch, with its bright picture and its dark one ---- */
.troid-hud .hud-bottles { position:absolute; left:${px(b.x - blk.x)}; top:${px(b.y - blk.y)}; width:0; height:${px(b.h)}; }
.troid-hud .hud-vial { position:absolute; width:${px(b.pitch)}; height:${px(hit)}; top:${px((b.h - hit) / 2)}; pointer-events:auto; touch-action:none; -webkit-tap-highlight-color:transparent; }
.troid-hud .hud-vial .hud-img { left:${px((b.pitch - b.w) / 2)}; top:${px((hit - b.h) / 2)}; width:${px(b.w)}; height:${px(b.h)}; }
`;
}

/** Everything the view keeps about one element so the DOM is only touched when a value changed. */
interface Cache {
  [key: string]: string | number | boolean;
}

interface BarView {
  root: HTMLDivElement;
  fill: HTMLImageElement;
  lost: HTMLImageElement;
  mark: HTMLImageElement;
  number: HTMLSpanElement;
  /** The length of the bar's picture in the pixels of the artist's canvas. */
  length: number;
}

interface VialView {
  el: HTMLDivElement;
  bright: HTMLImageElement;
  dark: HTMLImageElement;
}

/**
 * The HUD (DOM, docs/ARCHITECTURE-2D.md §8, docs/PROMPT17-LOG.md): the artist's own picture — the portrait, the two bars with their plates and the row of bottles — at the top left, inside the safe area, scaled with the
 * window. Every shape in it is one of the artist's PNGs, shown by an `<img>` and moved or clipped, never drawn again; the only thing the code writes is the number. It is DOM and NOT Pixi: resolution-independent,
 * hit-tested natively. It only reads a `HudState` (it knows no entity, no resource, no simulation) and writes to the DOM when a value changed. The only thing it reports back is a finger on a bottle.
 *
 * It draws no WORDS: the few things written on it are the two numbers the game computed. Words appear only as accessible names, and come from the translator (`hud.*` keys).
 */
export class HudView {
  readonly root: HTMLDivElement;
  private readonly block: HTMLDivElement;
  private readonly life: BarView;
  private readonly magic: BarView;
  private readonly bottleRow: HTMLDivElement;
  private readonly store = new DisposableStore();
  private readonly vials: VialView[] = [];
  private readonly last: Cache = {};
  private readonly lastVial: Cache[] = [];
  private insets: Insets = NO_INSETS;
  private width = 0;
  private height = 0;
  private size: number;
  private calm = false;
  private layout: HudLayout;
  private bottleCount = 0;

  constructor(
    parent: HTMLElement,
    private readonly translator: Translator,
    private readonly sink: HudPointerSink,
    options: { size?: number } = {},
  ) {
    const doc = parent.ownerDocument;
    this.size = options.size ?? 1;
    this.layout = computeHudLayout(0, 0);
    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement('style');
      style.id = STYLE_ID;
      style.appendChild(doc.createTextNode(hudCss()));
      doc.head.appendChild(style);
    }

    this.root = doc.createElement('div');
    this.root.className = 'troid-hud';
    this.root.dataset['testid'] = 'hud';
    this.root.dataset['calm'] = '0';
    this.root.dataset['paused'] = '0';
    this.block = div(doc, 'hud-block', 'hud-block');
    this.block.append(
      picture(doc, 'hud-portrait', 'portrait', 'hud-portrait'),
      picture(doc, 'hud-plate-life', 'plateLife', 'hud-plate-life'),
      picture(doc, 'hud-plate-magic', 'plateMagic', 'hud-plate-magic'),
    );
    this.life = this.bar(doc, 'life', 'barLife', 'barLifeLost', HUD_PX.barLife);
    this.magic = this.bar(doc, 'magic', 'barMagic', 'barMagicLost', HUD_PX.barMagic);
    this.bottleRow = div(doc, 'hud-bottles', 'hud-bottles');
    this.block.append(this.life.root, this.magic.root, this.bottleRow);
    this.root.appendChild(this.block);
    parent.appendChild(this.root);
    this.refreshLabels();
    this.store.add(translator.changed.subscribe(() => this.refreshLabels()));
  }

  /** The block as laid out right now (the tests and the E2E read it). */
  get current(): Readonly<HudLayout> {
    return this.layout;
  }

  /** Places the HUD for a window of `width × height` css px with the given safe insets. Call on start and on every resize. */
  place(width: number, height: number, insets: Insets): void {
    this.width = width;
    this.height = height;
    this.insets = insets;
    this.relayout();
  }

  setSize(size: number): void {
    this.size = size;
    this.relayout();
  }

  /**
   * "Fewer flashes" (the accessibility setting): the white rectangle of what was just lost does not stretch back to where the bar was; it stays the size the artist drew it. (Nothing else of the HUD flashes: it
   * has no glow, no pulse and no wave of light.)
   */
  setCalm(calm: boolean): void {
    if (this.calm === calm) return;
    this.calm = calm;
    this.root.dataset['calm'] = calm ? '1' : '0';
    // what was drawn under the other mode is drawn again with the next frame
    delete this.last['lifeBar'];
    delete this.last['magicBar'];
  }

  /** The game is paused (the pause menu is up). The HUD runs nothing by itself — the model's transients wait with the game — so this only says so, for whoever asks. */
  setPaused(paused: boolean): void {
    this.root.dataset['paused'] = paused ? '1' : '0';
  }

  /** Applies a frame of HUD state. Only what changed reaches the DOM. */
  update(s: Readonly<HudState>): void {
    this.ensureBottles(s.bottles.length);
    this.updateBar(this.life, 'life', s.life);
    this.updateBar(this.magic, 'magic', s.magic);
    const shakeX = Math.round(s.magic.shakeX * 10) / 10;
    set(this.last, 'magicShake', shakeX, () => (this.magic.root.style.transform = shakeX === 0 ? '' : `translateX(${shakeX.toFixed(1)}px)`));
    this.updateBottles(s);
  }

  dispose(): void {
    this.store.dispose();
    this.root.remove();
  }

  // ----------------------------------------------------------------------------------------------- the bars

  private bar(doc: Document, kind: 'life' | 'magic', fillPiece: HudPiece, lostPiece: HudPiece, box: PxBox): BarView {
    const root = div(doc, `hud-bar hud-bar-${kind}`, `hud-${kind}`);
    root.setAttribute('role', 'progressbar');
    root.setAttribute('aria-valuemin', '0');
    const lost = picture(doc, 'hud-lost', lostPiece, `hud-${kind}-lost`);
    const fill = picture(doc, 'hud-fill', fillPiece, `hud-${kind}-fill`);
    const mark = picture(doc, 'hud-mark', 'marker', `hud-${kind}-mark`);
    const number = doc.createElement('span');
    number.className = 'hud-num';
    number.dataset['testid'] = `hud-${kind}-number`;
    number.setAttribute('aria-hidden', 'true');
    root.append(lost, fill, mark, number);
    return { root, fill, lost, mark, number, length: box.w };
  }

  private updateBar(view: BarView, kind: 'life' | 'magic', s: Readonly<BarState>): void {
    const last = this.last;
    const now = Math.round(s.current); // the magic comes back in tenths: the screen reader is told in whole units
    set(last, `${kind}Real`, `${now}|${s.max}`, () => {
      view.root.setAttribute('aria-valuenow', String(now));
      view.root.setAttribute('aria-valuemax', String(s.max));
      view.root.setAttribute('aria-valuetext', `${s.percent}%`);
    });
    // the number is the simulation's, this frame: never the bar's picture on its way
    set(last, `${kind}Number`, s.percent, () => {
      view.number.textContent = String(s.percent);
      view.root.dataset['percent'] = String(s.percent);
    });
    const edge = Math.round(s.edge * 2000);
    const wear = this.calm ? edge : Math.round(s.wear * 2000);
    set(last, `${kind}Bar`, `${edge}|${wear}`, () => {
      const p = placeBar(edge / 2000, wear / 2000, view.length, this.calm);
      view.fill.style.clipPath = `inset(0 ${px(view.length - p.fillRight)} 0 0)`;
      view.lost.style.clipPath = `inset(0 0 0 ${px(p.lostLeft)})`;
      view.mark.style.transform = `translateX(${px(p.markX)}) scaleX(${Number(p.markScale.toFixed(4))})`;
      view.mark.style.opacity = p.markOpacity >= 1 ? '' : String(Number(p.markOpacity.toFixed(3)));
      view.root.dataset['edge'] = String(edge / 2000);
      view.root.dataset['wear'] = String(wear / 2000);
    });
  }

  // ----------------------------------------------------------------------------------------------- bottles

  private updateBottles(s: Readonly<HudState>): void {
    for (let i = 0; i < this.vials.length; i++) {
      const b = s.bottles[i];
      const v = this.vials[i];
      const c = this.lastVial[i];
      if (!b || !v || !c) continue;
      if (set(c, 'state', b.state, () => (v.el.dataset['state'] = b.state))) this.refreshVialLabel(i, b.state);
      set(c, 'drinking', b.drinking, () => (v.el.dataset['drinking'] = b.drinking ? '1' : '0'));
      // the two pictures fade into each other when the state changes: at any moment the bottle is the bright one, the dark one, or the two of them in proportion
      const dark = Math.round(b.dark * 100) / 100;
      set(c, 'dark', dark, () => {
        v.el.dataset['dark'] = String(dark);
        v.bright.style.opacity = dark === 0 ? '' : String(1 - dark);
        v.dark.style.opacity = dark === 1 ? '' : String(dark);
        v.bright.style.visibility = dark === 1 ? 'hidden' : '';
        v.dark.style.visibility = dark === 0 ? 'hidden' : '';
      });
    }
    const shakeX = Math.round(s.bottlesShakeX * 10) / 10;
    set(this.last, 'bottlesShake', shakeX, () => (this.bottleRow.style.transform = shakeX === 0 ? '' : `translateX(${shakeX.toFixed(1)}px)`));
  }

  /** Builds or trims the bottles when their number changes (the fourth bottle is a reward): each is the artist's bottle, in the artist's row. */
  private ensureBottles(count: number): void {
    if (count === this.bottleCount) return;
    const doc = this.root.ownerDocument;
    this.bottleCount = count;
    this.bottleRow.replaceChildren();
    this.vials.length = 0;
    this.lastVial.length = 0;
    for (let i = 0; i < count; i++) {
      const el = div(doc, 'hud-vial', `hud-bottle-${i}`);
      el.dataset['state'] = 'ready';
      el.dataset['dark'] = '0';
      el.setAttribute('role', 'button');
      el.style.left = px(i * HUD_PX.bottle.pitch + (HUD_PX.bottle.w - HUD_PX.bottle.pitch) / 2);
      const bright = picture(doc, 'hud-b-bright', 'bottle', `hud-vial-${i}-bright`);
      const dark = picture(doc, 'hud-b-dark', 'bottleUsed', `hud-vial-${i}-dark`);
      dark.style.visibility = 'hidden';
      el.append(bright, dark);
      this.bindVial(el, i);
      this.bottleRow.appendChild(el);
      this.vials.push({ el, bright, dark });
      this.lastVial.push({});
    }
    this.refreshLabels();
  }

  private bindVial(el: HTMLDivElement, slot: number): void {
    listen(this.store, el, 'pointerdown', (e) => {
      e.preventDefault();
      if (!this.sink.down(e.pointerId, slot, e.clientX, e.clientY, e.timeStamp)) return;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // a synthetic pointer (tests) cannot be captured: the source still owns it
      }
    });
    const end = (e: PointerEvent): void => this.sink.up(e.pointerId);
    listen(this.store, el, 'pointerup', end);
    listen(this.store, el, 'pointercancel', end);
    listen(this.store, el, 'lostpointercapture', end);
  }

  // ----------------------------------------------------------------------------------------------- structure

  private relayout(): void {
    this.layout = computeHudLayout(this.width, this.height, this.insets, this.size);
    const l = this.layout;
    Object.assign(this.block.style, { left: `${l.x}px`, top: `${l.y}px`, transform: `scale(${l.scale * HUD_DP_PER_PX})` });
  }

  private refreshLabels(): void {
    const t = this.translator;
    this.life.root.setAttribute('aria-label', t.t('hud.life'));
    this.magic.root.setAttribute('aria-label', t.t('hud.magic'));
    this.vials.forEach((v, i) => this.refreshVialLabel(i, (v.el.dataset['state'] ?? 'ready') as 'ready' | 'empty' | 'recharging'));
  }

  private refreshVialLabel(i: number, state: 'ready' | 'empty' | 'recharging'): void {
    const v = this.vials[i];
    if (!v) return;
    const t = this.translator;
    const number = i + 1;
    const label = state === 'ready' ? t.t('hud.bottleReady', { number }) : state === 'recharging' ? t.t('hud.bottleRecharging', { number }) : t.t('hud.bottleEmpty', { number });
    v.el.setAttribute('aria-label', label);
    v.el.setAttribute('aria-disabled', state === 'ready' ? 'false' : 'true');
  }
}

function div(doc: Document, className: string, testid?: string): HTMLDivElement {
  const el = doc.createElement('div');
  el.className = className;
  if (testid) el.dataset['testid'] = testid;
  return el;
}

/** One of the artist's pieces as an `<img>`: it takes no input, cannot be dragged, has no text (decorative: the name of what it belongs to is its owner's). */
function picture(doc: Document, className: string, piece: HudPiece, testid: string): HTMLImageElement {
  const img = doc.createElement('img');
  img.className = `hud-img ${className}`;
  img.dataset['testid'] = testid;
  img.dataset['piece'] = piece;
  img.alt = '';
  img.draggable = false;
  img.decoding = 'async';
  img.src = HUD_ART[piece];
  return img;
}

/** Runs `apply` only when `value` differs from what was applied last; returns whether it did. */
function set(cache: Cache, key: string, value: string | number | boolean, apply: () => void): boolean {
  if (cache[key] === value) return false;
  cache[key] = value;
  apply();
  return true;
}
