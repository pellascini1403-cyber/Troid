import { listen } from '@/app/dom';
import { DisposableStore } from '@/core/lifecycle';
import type { Translator } from '@/i18n/translator';
import { cssHex, PALETTE } from '@/presentation/palette';
import { createIcon } from '../icons';
import type { Insets } from '../touch/layout';
import { NO_INSETS } from '../touch/layout';
import type { HudState } from './HudModel';
import { computeHudLayout, HUD_DESIGN, type HudLayout } from './layout';

/** How the HUD tells the touch layer that a finger touched a bottle icon (the touch source owns every finger). */
export interface HudPointerSink {
  down(pointerId: number, slot: number, x: number, y: number, t: number): boolean;
  up(pointerId: number): void;
}

const STYLE_ID = 'troid-hud-style';

const rgba = (hex: number, a: number): string => {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return `rgba(${r},${g},${b},${a})`;
};

/** The HUD's stylesheet, built from the palette tokens (never from literal colours): the art direction stays in `palette.ts`. */
function hudCss(): string {
  const d = HUD_DESIGN;
  const panel = rgba(PALETTE.uiPanel, 0.78);
  const rim = rgba(PALETTE.energyCore, 0.35);
  const life = cssHex(PALETTE.uiLife);
  const white = cssHex(PALETTE.whiteHot);
  const core = cssHex(PALETTE.energyCore);
  const glow = cssHex(PALETTE.energyGlow);
  const mid = cssHex(PALETTE.energyMid);
  return `
.troid-hud { position:absolute; inset:0; pointer-events:none; z-index:25; user-select:none; -webkit-user-select:none; }
.troid-hud .hud-block { position:absolute; transform-origin:0 0; }
.troid-hud .hud-card { position:absolute; left:0; top:0; width:${d.card.w}px; height:${d.card.h}px; box-sizing:border-box; border:1px solid ${rim}; border-radius:6px; background:${panel}; display:flex; align-items:center; justify-content:center; overflow:hidden; color:${glow}; }
.troid-hud .hud-card[data-state="empty"] { border-style:dashed; border-color:${rgba(PALETTE.energyCore, 0.22)}; }
.troid-hud .hud-card[data-state="noMagic"] .hud-card-icon { opacity:0.38; filter:grayscale(0.85); }
.troid-hud .hud-card-empty { width:14px; height:2px; border-radius:1px; background:${rgba(PALETTE.energyCore, 0.3)}; }
.troid-hud .hud-card-sweep { position:absolute; inset:0; pointer-events:none; }
.troid-hud .hud-stack { position:absolute; left:${d.card.w + d.cardGap}px; top:0; }
.troid-hud .hud-life { display:flex; gap:${d.life.gap}px; height:${d.life.segH}px; margin-bottom:${d.rowGap.lifeMagic}px; }
.troid-hud .hud-seg { position:relative; width:${d.life.segW}px; height:${d.life.segH}px; box-sizing:border-box; border:1px solid ${rim}; border-radius:2px; background:${panel}; }
.troid-hud .hud-seg[data-state="full"] { background:${life}; border-color:${rgba(PALETTE.whiteHot, 0.85)}; box-shadow:0 0 6px ${rgba(PALETTE.energyGlow, 0.35)}; }
.troid-hud .hud-seg-ghost { position:absolute; inset:-1px; border-radius:2px; background:${white}; opacity:0; }
.troid-hud[data-critical="1"] .hud-seg[data-final="1"][data-state="full"] { animation:hud-pulse 1.2s ease-in-out infinite; }
.troid-hud .hud-magic { position:relative; width:${d.magic.w}px; height:${d.magic.h}px; box-sizing:border-box; border:1px solid ${rim}; border-radius:4px; background:${panel}; overflow:hidden; margin-bottom:${d.rowGap.magicBottles}px; }
.troid-hud .hud-magic-fill { position:absolute; inset:0; transform-origin:0 50%; background:linear-gradient(90deg, ${mid}, ${core}); }
.troid-hud .hud-magic[data-regen="1"] .hud-magic-fill::after { content:""; position:absolute; top:0; bottom:0; width:24px; right:0; background:linear-gradient(90deg, transparent, ${rgba(PALETTE.whiteHot, 0.55)}); animation:hud-shine 1.1s linear infinite; }
.troid-hud .hud-bottles { display:flex; height:${d.vial.hitH}px; margin-top:-${d.bottlesOverlap}px; }
.troid-hud .hud-vial { position:relative; width:${d.vial.pitch}px; height:${d.vial.hitH}px; display:flex; align-items:center; justify-content:center; pointer-events:auto; touch-action:none; -webkit-tap-highlight-color:transparent; }
.troid-hud .hud-glass { position:relative; width:${d.vial.w}px; height:${d.vial.h}px; box-sizing:border-box; border:1.5px solid ${rgba(PALETTE.energyCore, 0.6)}; border-radius:4px 4px 7px 7px; background:${panel}; overflow:hidden; }
.troid-hud .hud-liquid { position:absolute; left:0; right:0; bottom:0; height:100%; transform-origin:50% 100%; background:linear-gradient(0deg, ${core}, ${glow}); }
.troid-hud .hud-vial[data-state="ready"] .hud-glass { box-shadow:0 0 8px ${rgba(PALETTE.energyGlow, 0.55)}; border-color:${glow}; }
.troid-hud .hud-vial[data-state="empty"] .hud-glass { opacity:0.55; }
.troid-hud .hud-vial[data-drinking="1"] .hud-glass { border-color:${white}; box-shadow:0 0 12px ${rgba(PALETTE.whiteHot, 0.7)}; }
.troid-hud .hud-vial[data-state="recharging"] .hud-liquid { opacity:0.7; background:linear-gradient(0deg, ${mid}, ${core}); }
@keyframes hud-pulse { 0%,100% { opacity:1; } 50% { opacity:0.45; } }
@keyframes hud-shine { from { transform:translateX(-140px); } to { transform:translateX(0); } }
@media (prefers-reduced-motion: reduce) { .troid-hud * { animation:none !important; } }
`;
}

/** Everything the view keeps about one element so the DOM is only touched when a value changed. */
interface Cache {
  [key: string]: string | number | boolean;
}

/**
 * The HUD (DOM, docs/ARCHITECTURE-2D.md §8, GAME-SPEC-2D §17): life segments, the magic bar, the equipped card (or its empty
 * slot) and the bottles, at the top left, inside the safe area, scaled with the window. It is DOM and NOT Pixi: text-free,
 * resolution-independent, hit-tested natively. It only reads a `HudState` (it knows no entity, no resource, no simulation) and
 * writes to the DOM when a value changed. The only thing it reports back is a finger on a bottle icon.
 *
 * Words appear only as accessible names, and come from the translator (`hud.*` keys).
 */
export class HudView {
  readonly root: HTMLDivElement;
  private readonly block: HTMLDivElement;
  private readonly stack: HTMLDivElement;
  private readonly card: HTMLDivElement;
  private readonly cardBody: HTMLDivElement;
  private readonly sweep: HTMLDivElement;
  private readonly lifeRow: HTMLDivElement;
  private readonly magic: HTMLDivElement;
  private readonly magicFill: HTMLDivElement;
  private readonly bottleRow: HTMLDivElement;
  private readonly store = new DisposableStore();
  private readonly segs: Array<{ el: HTMLDivElement; ghost: HTMLDivElement }> = [];
  private readonly vials: Array<{ el: HTMLDivElement; liquid: HTMLDivElement }> = [];
  private readonly last: Cache = {};
  private readonly lastSeg: Cache[] = [];
  private readonly lastVial: Cache[] = [];
  private insets: Insets = NO_INSETS;
  private width = 0;
  private height = 0;
  private size: number;
  private layout: HudLayout;
  private lifeMax = 0;
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
      const css = hudCss();
      style.appendChild(doc.createTextNode(css));
      doc.head.appendChild(style);
    }

    this.root = doc.createElement('div');
    this.root.className = 'troid-hud';
    this.root.dataset['testid'] = 'hud';
    this.block = div(doc, 'hud-block', 'hud-block');
    this.card = div(doc, 'hud-card', 'hud-card');
    this.card.dataset['state'] = 'empty';
    this.card.setAttribute('role', 'img');
    this.cardBody = div(doc, 'hud-card-body');
    this.cardBody.style.display = 'flex';
    this.sweep = div(doc, 'hud-card-sweep');
    this.card.append(this.cardBody, this.sweep);
    this.stack = div(doc, 'hud-stack');
    this.lifeRow = div(doc, 'hud-life', 'hud-life');
    this.lifeRow.setAttribute('role', 'progressbar');
    this.lifeRow.setAttribute('aria-valuemin', '0');
    this.magic = div(doc, 'hud-magic', 'hud-magic');
    this.magic.setAttribute('role', 'progressbar');
    this.magic.setAttribute('aria-valuemin', '0');
    this.magicFill = div(doc, 'hud-magic-fill', 'hud-magic-fill');
    this.magic.appendChild(this.magicFill);
    this.bottleRow = div(doc, 'hud-bottles', 'hud-bottles');
    this.stack.append(this.lifeRow, this.magic, this.bottleRow);
    this.block.append(this.card, this.stack);
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

  /** Applies a frame of HUD state. Only what changed reaches the DOM. */
  update(s: Readonly<HudState>): void {
    this.ensureCounts(s.life.max, s.bottles.length);
    this.updateLife(s);
    this.updateMagic(s);
    this.updateCard(s);
    this.updateBottles(s);
  }

  dispose(): void {
    this.store.dispose();
    this.root.remove();
  }

  // ----------------------------------------------------------------------------------------------- life

  private updateLife(s: Readonly<HudState>): void {
    const l = s.life;
    set(this.last, 'lifeNow', l.current, () => this.lifeRow.setAttribute('aria-valuenow', String(l.current)));
    if (set(this.last, 'critical', l.critical, () => (this.root.dataset['critical'] = l.critical ? '1' : '0'))) {
      /* the last segment pulses by CSS: nothing to do per frame */
    }
    for (let i = 0; i < this.segs.length; i++) {
      const seg = l.segments[i];
      const view = this.segs[i];
      const c = this.lastSeg[i];
      if (!seg || !view || !c) continue;
      set(c, 'full', seg.full, () => (view.el.dataset['state'] = seg.full ? 'full' : 'empty'));
      // the ghost of a lost segment and its white flash share one overlay: whichever is stronger (quantised to 1/20 so it is not rewritten each frame)
      const a = Math.round(Math.max(seg.ghost * 0.55, seg.flash) * 20) / 20;
      set(c, 'ghost', a, () => (view.ghost.style.opacity = String(a)));
    }
  }

  // ----------------------------------------------------------------------------------------------- magic

  private updateMagic(s: Readonly<HudState>): void {
    const m = s.magic;
    const f = Math.round(m.fraction * 400) / 400; // continuous to the eye (a quarter of a percent), not rewritten for every tick
    set(this.last, 'magic', f, () => {
      this.magicFill.style.transform = `scaleX(${f})`;
      this.magic.setAttribute('aria-valuenow', String(Math.round(m.fraction * 100)));
    });
    set(this.last, 'regen', m.regenerating, () => (this.magic.dataset['regen'] = m.regenerating ? '1' : '0'));
    const shakeX = Math.round(m.shakeX * 10) / 10;
    set(this.last, 'magicShake', shakeX, () => (this.magic.style.transform = shakeX === 0 ? '' : `translateX(${shakeX.toFixed(1)}px)`));
  }

  // ----------------------------------------------------------------------------------------------- card

  private updateCard(s: Readonly<HudState>): void {
    const c = s.card;
    const stateChanged = set(this.last, 'cardState', c.state, () => (this.card.dataset['state'] = c.state));
    const iconChanged = set(this.last, 'cardIcon', c.iconId, () => undefined);
    if (stateChanged || iconChanged) {
      this.cardBody.replaceChildren();
      if (c.state === 'empty') {
        this.cardBody.appendChild(div(this.root.ownerDocument, 'hud-card-empty', 'hud-card-empty'));
      } else {
        const icon = createIcon(this.root.ownerDocument, c.iconId, 30);
        icon.classList.add('hud-card-icon');
        this.cardBody.appendChild(icon);
      }
      this.refreshLabels();
    }
    set(this.last, 'cardNameKey', c.nameKey, () => this.refreshLabels());
    const sweep = c.state === 'cooldown' ? Math.round(c.cooldown01 * 100) / 100 : 0;
    set(this.last, 'sweep', sweep, () => {
      this.card.dataset['cooldown'] = String(sweep);
      this.sweep.style.background = sweep > 0 ? `conic-gradient(from 0deg, ${rgba(PALETTE.uiPanel, 0.72)} ${sweep * 360}deg, transparent 0)` : 'none';
    });
    const shakeX = Math.round(c.shakeX * 10) / 10;
    set(this.last, 'cardShake', shakeX, () => (this.card.style.transform = shakeX === 0 ? '' : `translateX(${shakeX.toFixed(1)}px)`));
  }

  // ----------------------------------------------------------------------------------------------- bottles

  private updateBottles(s: Readonly<HudState>): void {
    for (let i = 0; i < this.vials.length; i++) {
      const b = s.bottles[i];
      const v = this.vials[i];
      const c = this.lastVial[i];
      if (!b || !v || !c) continue;
      if (set(c, 'state', b.state, () => (v.el.dataset['state'] = b.state))) this.refreshVialLabel(i, b.state);
      const fill = Math.round((b.state === 'empty' ? 0 : b.fill01) * 200) / 200;
      set(c, 'fill', fill, () => (v.liquid.style.transform = `scaleY(${fill})`));
      set(c, 'drinking', b.drinking, () => (v.el.dataset['drinking'] = b.drinking ? '1' : '0'));
      const pop = Math.round(b.pop * 20) / 20;
      set(c, 'pop', pop, () => (v.el.style.transform = pop === 0 ? '' : `scale(${(1 + 0.3 * pop).toFixed(3)})`));
    }
    const shakeX = Math.round(s.bottlesShakeX * 10) / 10;
    set(this.last, 'bottlesShake', shakeX, () => (this.bottleRow.style.transform = shakeX === 0 ? '' : `translateX(${shakeX.toFixed(1)}px)`));
  }

  // ----------------------------------------------------------------------------------------------- structure

  /** Builds or trims the life segments and the bottle icons when their number changes (a life upgrade, the fourth bottle). */
  private ensureCounts(lifeMax: number, bottles: number): void {
    const doc = this.root.ownerDocument;
    let changed = false;
    if (lifeMax !== this.lifeMax) {
      this.lifeMax = lifeMax;
      this.lifeRow.replaceChildren();
      this.segs.length = 0;
      this.lastSeg.length = 0;
      for (let i = 0; i < lifeMax; i++) {
        const el = div(doc, 'hud-seg', `hud-life-seg-${i}`);
        el.dataset['state'] = 'empty';
        // the segment that is left when only one point of life remains is the FIRST one: it is the one that pulses
        el.dataset['final'] = i === 0 ? '1' : '0';
        const ghost = div(doc, 'hud-seg-ghost');
        el.appendChild(ghost);
        this.lifeRow.appendChild(el);
        this.segs.push({ el, ghost });
        this.lastSeg.push({});
      }
      this.lifeRow.setAttribute('aria-valuemax', String(lifeMax));
      changed = true;
    }
    if (bottles !== this.bottleCount) {
      this.bottleCount = bottles;
      this.bottleRow.replaceChildren();
      this.vials.length = 0;
      this.lastVial.length = 0;
      for (let i = 0; i < bottles; i++) {
        const el = div(doc, 'hud-vial', `hud-bottle-${i}`);
        el.dataset['state'] = 'ready';
        el.setAttribute('role', 'button');
        const glass = div(doc, 'hud-glass');
        const liquid = div(doc, 'hud-liquid');
        glass.appendChild(liquid);
        el.appendChild(glass);
        this.bindVial(el, i);
        this.bottleRow.appendChild(el);
        this.vials.push({ el, liquid });
        this.lastVial.push({});
      }
      this.refreshLabels();
      changed = true;
    }
    if (changed) this.relayout();
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

  private relayout(): void {
    this.layout = computeHudLayout(this.width, this.height, this.insets, this.size, Math.max(1, this.lifeMax), this.bottleCount);
    const l = this.layout;
    Object.assign(this.block.style, {
      left: `${l.x}px`,
      top: `${l.y}px`,
      width: `${l.width}px`,
      height: `${l.height}px`,
      transform: `scale(${l.scale})`,
    });
  }

  private refreshLabels(): void {
    const t = this.translator;
    this.lifeRow.setAttribute('aria-label', t.t('hud.life'));
    this.magic.setAttribute('aria-label', t.t('hud.magic'));
    const hasCard = this.card.dataset['state'] !== 'empty';
    this.card.setAttribute('aria-label', hasCard ? t.t('hud.card') : t.t('hud.cardEmpty'));
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

/** Runs `apply` only when `value` differs from what was applied last; returns whether it did. */
function set(cache: Cache, key: string, value: string | number | boolean, apply: () => void): boolean {
  if (cache[key] === value) return false;
  cache[key] = value;
  apply();
  return true;
}
