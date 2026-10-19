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

/** What the HUD labels with a key or a button of the device in use (empty: nothing is shown — a touch screen has the buttons themselves). */
export interface HudGlyphs {
  ability: string;
}

const STYLE_ID = 'troid-hud-style';

const rgba = (hex: number, a: number): string => {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return `rgba(${r},${g},${b},${a})`;
};

/** The silhouettes: a plate with its corners cut, a blade-like segment, the slanted ends of a bar, a flask. Each has an outer shape (the rim) and one a pixel smaller (what the rim frames). */
const SHAPES = {
  plate: 'polygon(8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px), 0 8px)',
  plateIn: 'polygon(7px 0, calc(100% - 7px) 0, 100% 7px, 100% calc(100% - 7px), calc(100% - 7px) 100%, 7px 100%, 0 calc(100% - 7px), 0 7px)',
  blade: 'polygon(5px 0, 100% 0, calc(100% - 5px) 100%, 0 100%)',
  bladeIn: 'polygon(4.5px 0, 100% 0, calc(100% - 4.5px) 100%, 0 100%)',
  bar: 'polygon(3px 0, 100% 0, calc(100% - 3px) 100%, 0 100%)',
  barIn: 'polygon(2.4px 0, 100% 0, calc(100% - 2.4px) 100%, 0 100%)',
  flask: 'polygon(32% 0, 68% 0, 68% 22%, 100% 46%, 100% 90%, 86% 100%, 14% 100%, 0 90%, 0 46%, 32% 22%)',
  flaskIn: 'polygon(33% 0, 67% 0, 67% 24%, 100% 47%, 100% 89%, 85% 100%, 15% 100%, 0 89%, 0 47%, 33% 24%)',
} as const;

/** The HUD's stylesheet, built from the palette tokens (never from literal colours): the art direction stays in `palette.ts`. */
function hudCss(): string {
  const d = HUD_DESIGN;
  const rim = rgba(PALETTE.energyCore, 0.42);
  const rimStrong = rgba(PALETTE.energyGlow, 0.9);
  const white = cssHex(PALETTE.whiteHot);
  const core = cssHex(PALETTE.energyCore);
  const glow = cssHex(PALETTE.energyGlow);
  const mid = cssHex(PALETTE.energyMid);
  const violet = cssHex(PALETTE.violetGlow);
  const night = cssHex(PALETTE.worldVoid);
  const deep = cssHex(PALETTE.uiPanel);
  const life = cssHex(PALETTE.uiLife);
  const glass = `linear-gradient(180deg, ${rgba(PALETTE.uiPanel, 0.98)}, ${rgba(PALETTE.worldVoid, 0.96)})`;
  return `
.troid-hud { position:absolute; inset:0; pointer-events:none; z-index:25; user-select:none; -webkit-user-select:none; font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
.troid-hud .hud-block { position:absolute; transform-origin:0 0; }

/* ---- the power: a small plate with its corners cut ---- */
.troid-hud .hud-card { position:absolute; left:0; top:0; width:${d.card.w}px; height:${d.card.h}px; box-sizing:border-box; display:flex; align-items:center; justify-content:center; color:${glow}; filter:drop-shadow(0 2px 5px rgba(0,0,0,0.65)); }
.troid-hud .hud-card-plate { position:absolute; inset:0; clip-path:${SHAPES.plate}; background:linear-gradient(165deg, ${rimStrong}, ${rgba(PALETTE.energyCore, 0.16)} 38%, ${rgba(PALETTE.energyCore, 0.5)}); }
.troid-hud .hud-card-plate::before { content:""; position:absolute; inset:1px; clip-path:${SHAPES.plateIn}; background:${glass}; }
.troid-hud .hud-card-plate::after { content:""; position:absolute; inset:1px; clip-path:${SHAPES.plateIn}; background:radial-gradient(90% 62% at 50% 0%, ${rgba(PALETTE.energyCore, 0.2)}, transparent 72%); }
.troid-hud .hud-card-body { position:relative; display:flex; align-items:center; justify-content:center; padding-bottom:13px; filter:drop-shadow(0 0 5px ${rgba(PALETTE.energyCore, 0.55)}); }
.troid-hud .hud-card[data-state="empty"] .hud-card-plate { opacity:0.45; }
.troid-hud .hud-card[data-state="empty"] .hud-card-body { filter:none; padding-bottom:0; }
.troid-hud .hud-card[data-gain="1"] { filter:drop-shadow(0 0 9px ${rgba(PALETTE.whiteHot, 0.9)}); }
.troid-hud .hud-card[data-gain="1"] .hud-card-plate { background:linear-gradient(165deg, ${white}, ${rgba(PALETTE.whiteHot, 0.5)}); }
.troid-hud .hud-card[data-state="noMagic"] .hud-card-icon { opacity:0.38; filter:grayscale(0.85); }
.troid-hud .hud-card[data-state="noMagic"] .hud-card-body { filter:none; }
.troid-hud .hud-card-empty { width:14px; height:2px; border-radius:1px; background:${rgba(PALETTE.energyCore, 0.34)}; }
.troid-hud .hud-card-sweep { position:absolute; inset:1px; clip-path:${SHAPES.plateIn}; pointer-events:none; }
.troid-hud .hud-card-key, .troid-hud .hud-card-cost { position:absolute; bottom:3px; display:none; box-sizing:border-box; height:13px; min-width:13px; padding:0 3px; text-align:center; font:700 9px/11px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; font-variant-numeric:tabular-nums; background:rgba(0,0,0,0.72); }
.troid-hud .hud-card-key { left:3px; border-radius:3px; border:1px solid ${rgba(PALETTE.energyCore, 0.55)}; color:${glow}; }
.troid-hud .hud-card-cost { right:3px; border-radius:7px; border:1px solid ${rgba(PALETTE.energyCore, 0.5)}; color:${white}; }
.troid-hud .hud-card-key[data-on="1"], .troid-hud .hud-card-cost[data-on="1"] { display:block; }
.troid-hud .hud-card[data-afford="0"] .hud-card-cost { border-color:${rgba(PALETTE.violetCore, 0.9)}; color:${violet}; }

/* ---- the life: segments cut like blades; a lost one leaves a ghost, one that comes back a wave of light ---- */
.troid-hud .hud-stack { position:absolute; left:${d.card.w + d.cardGap}px; top:0; }
.troid-hud .hud-life { position:relative; display:flex; gap:${d.life.gap}px; height:${d.life.segH}px; margin-bottom:${d.rowGap.lifeMagic}px; }
.troid-hud .hud-seg { position:relative; width:${d.life.segW}px; height:${d.life.segH}px; }
.troid-hud .hud-seg-rim { position:absolute; inset:0; clip-path:${SHAPES.blade}; background:${rim}; }
.troid-hud .hud-seg-fill { position:absolute; inset:1px; clip-path:${SHAPES.bladeIn}; background:linear-gradient(180deg, ${deep}, ${night}); }
.troid-hud .hud-seg-ghost { position:absolute; inset:0; clip-path:${SHAPES.blade}; background:${white}; opacity:0; z-index:3; }
.troid-hud .hud-seg-heal { position:absolute; inset:0; clip-path:${SHAPES.blade}; background:linear-gradient(90deg, transparent, ${core}, ${white}, ${core}, transparent); opacity:0; z-index:2; }
.troid-hud .hud-seg[data-state="full"] { filter:drop-shadow(0 0 4px ${rgba(PALETTE.energyGlow, 0.42)}); }
.troid-hud .hud-seg[data-state="full"] .hud-seg-rim { background:linear-gradient(180deg, ${white}, ${rgba(PALETTE.energyGlow, 0.8)}); }
.troid-hud .hud-seg[data-state="full"] .hud-seg-fill { background:linear-gradient(180deg, ${white} 0%, ${life} 50%, ${mid} 130%); }
.troid-hud .hud-life[data-guard="1"] .hud-seg[data-state="full"] .hud-seg-rim { background:linear-gradient(180deg, ${core}, ${glow}); }
.troid-hud .hud-life[data-guard="1"] .hud-seg[data-state="full"] { filter:drop-shadow(0 0 5px ${rgba(PALETTE.energyCore, 0.8)}); }
.troid-hud .hud-guard { position:absolute; left:0; bottom:-4px; width:100%; height:2px; transform-origin:0 50%; transform:scaleX(0); opacity:0; background:linear-gradient(90deg, ${core}, ${white}); box-shadow:0 0 6px ${core}; border-radius:1px; }
.troid-hud[data-critical="1"] .hud-seg[data-final="1"][data-state="full"] { animation:hud-pulse 1.2s ease-in-out infinite; }

/* ---- the magic: a tube with slanted ends; what was just spent lingers; the cost of the power is a notch on it ---- */
.troid-hud .hud-magic { position:relative; width:${d.magic.w}px; height:${d.magic.h}px; margin-bottom:${d.rowGap.magicBottles}px; }
.troid-hud .hud-magic-rim { position:absolute; inset:0; clip-path:${SHAPES.bar}; background:${rim}; }
.troid-hud .hud-magic-well { position:absolute; inset:1px; clip-path:${SHAPES.barIn}; background:linear-gradient(180deg, ${night}, ${deep}); overflow:hidden; }
.troid-hud .hud-magic-trail { position:absolute; inset:0; transform-origin:0 50%; background:linear-gradient(90deg, ${rgba(PALETTE.energyGlow, 0.35)}, ${rgba(PALETTE.whiteHot, 0.75)}); }
.troid-hud .hud-magic-fill { position:absolute; inset:0; transform-origin:0 50%; background:linear-gradient(180deg, ${rgba(PALETTE.whiteHot, 0.22)}, transparent 45%), linear-gradient(90deg, ${mid}, ${core} 70%, ${glow}); }
.troid-hud .hud-magic[data-wait="1"] .hud-magic-fill { filter:saturate(0.55) brightness(0.85); }
.troid-hud .hud-magic[data-regen="1"] .hud-magic-fill::after { content:""; position:absolute; top:0; bottom:0; width:24px; right:0; background:linear-gradient(90deg, transparent, ${rgba(PALETTE.whiteHot, 0.55)}); animation:hud-shine 1.1s linear infinite; }
.troid-hud .hud-magic-cost { position:absolute; top:-2px; bottom:-2px; width:2px; margin-left:-1px; display:none; background:${rgba(PALETTE.whiteHot, 0.9)}; box-shadow:0 0 4px ${core}; border-radius:1px; }
.troid-hud .hud-magic-cost[data-on="1"] { display:block; }
.troid-hud .hud-magic[data-afford="0"] .hud-magic-cost { background:${rgba(PALETTE.whiteHot, 0.34)}; box-shadow:none; }

/* ---- the bottles: flasks of glass; the one that recharges says how long is left ---- */
.troid-hud .hud-bottles { display:flex; height:${d.vial.hitH}px; margin-top:-${d.bottlesOverlap}px; }
.troid-hud .hud-vial { position:relative; width:${d.vial.pitch}px; height:${d.vial.hitH}px; display:flex; align-items:center; justify-content:center; pointer-events:auto; touch-action:none; -webkit-tap-highlight-color:transparent; }
.troid-hud .hud-glass { position:relative; width:${d.vial.w}px; height:${d.vial.h}px; }
.troid-hud .hud-glass-rim { position:absolute; inset:0; clip-path:${SHAPES.flask}; background:${rgba(PALETTE.energyCore, 0.5)}; }
.troid-hud .hud-glass-body { position:absolute; inset:1.2px; clip-path:${SHAPES.flaskIn}; background:${glass}; overflow:hidden; }
.troid-hud .hud-glass-body::before { content:""; position:absolute; left:0; right:0; top:0; height:34%; z-index:2; pointer-events:none; background:linear-gradient(180deg, ${rgba(PALETTE.whiteHot, 0.3)}, transparent); }
.troid-hud .hud-glass-body::after { content:""; position:absolute; inset:0; z-index:2; pointer-events:none; background:linear-gradient(90deg, ${rgba(PALETTE.whiteHot, 0.3)}, transparent 30%, ${rgba(PALETTE.worldVoid, 0.34)}); }
.troid-hud .hud-liquid { position:absolute; left:0; right:0; bottom:0; height:100%; transform-origin:50% 100%; background:linear-gradient(0deg, ${mid}, ${core} 55%, ${glow}); }
.troid-hud .hud-vial-time { position:absolute; left:0; right:0; top:50%; margin-top:-5px; display:none; text-align:center; font:700 9px/11px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; font-variant-numeric:tabular-nums; color:${white}; text-shadow:0 0 3px #000, 0 0 5px #000; pointer-events:none; }
.troid-hud .hud-vial-time[data-on="1"] { display:block; }
.troid-hud .hud-vial[data-state="ready"] .hud-glass { filter:drop-shadow(0 0 5px ${rgba(PALETTE.energyGlow, 0.6)}); }
.troid-hud .hud-vial[data-state="ready"] .hud-glass-rim { background:linear-gradient(180deg, ${white}, ${glow}); }
.troid-hud .hud-vial[data-state="empty"] .hud-glass { opacity:0.55; }
.troid-hud .hud-vial[data-drinking="1"] .hud-glass { filter:drop-shadow(0 0 8px ${rgba(PALETTE.whiteHot, 0.8)}); }
.troid-hud .hud-vial[data-drinking="1"] .hud-glass-rim { background:${white}; }
.troid-hud .hud-vial[data-gain="1"] .hud-glass { filter:drop-shadow(0 0 9px ${rgba(PALETTE.whiteHot, 0.9)}); }
.troid-hud .hud-vial[data-gain="1"] .hud-glass-rim { background:${white}; }
.troid-hud .hud-vial[data-state="recharging"] .hud-liquid { opacity:0.7; background:linear-gradient(0deg, ${mid}, ${core}); }
.troid-hud .hud-vial[data-state="recharging"] .hud-glass-rim { background:${rgba(PALETTE.energyCore, 0.75)}; }

@keyframes hud-pulse { 0%,100% { opacity:1; } 50% { opacity:0.45; } }
@keyframes hud-shine { from { transform:translateX(-140px); } to { transform:translateX(0); } }
@media (prefers-reduced-motion: reduce) { .troid-hud * { animation:none !important; } }
/* "fewer flashes": the last segment does not blink and the magic does not shine as it fills */
.troid-hud[data-calm="1"] * { animation:none !important; }
/* the game waits (the pause menu): what moves by itself waits with it */
.troid-hud[data-paused="1"] *, .troid-hud[data-paused="1"] *::after { animation-play-state:paused !important; }
`;
}

/** Everything the view keeps about one element so the DOM is only touched when a value changed. */
interface Cache {
  [key: string]: string | number | boolean;
}

interface SegmentView {
  el: HTMLDivElement;
  ghost: HTMLDivElement;
  heal: HTMLDivElement;
}

interface VialView {
  el: HTMLDivElement;
  liquid: HTMLDivElement;
  time: HTMLDivElement;
}

/**
 * The HUD (DOM, docs/ARCHITECTURE-2D.md §8, GAME-SPEC-2D §17): the equipped power (or its empty slot), the life, the magic and the bottles, at the top left, inside the safe area, scaled with
 * the window. It is DOM and NOT Pixi: resolution-independent, hit-tested natively. It only reads a `HudState` (it knows no entity, no resource, no simulation) and writes to the DOM when a value
 * changed. The only thing it reports back is a finger on a bottle icon.
 *
 * It draws no WORDS: the few things written on it are numbers the game computed (what the power costs, the seconds a bottle still needs) and the hardware label of a key or a button (the device in
 * use: `K`, `Y`) — none is a translation. Words appear only as accessible names, and come from the translator (`hud.*` keys).
 */
export class HudView {
  readonly root: HTMLDivElement;
  private readonly block: HTMLDivElement;
  private readonly stack: HTMLDivElement;
  private readonly card: HTMLDivElement;
  private readonly cardBody: HTMLDivElement;
  private readonly sweep: HTMLDivElement;
  private readonly cardKey: HTMLDivElement;
  private readonly cardCost: HTMLDivElement;
  private readonly lifeRow: HTMLDivElement;
  private readonly guard: HTMLDivElement;
  private readonly magic: HTMLDivElement;
  private readonly magicFill: HTMLDivElement;
  private readonly magicTrail: HTMLDivElement;
  private readonly magicCost: HTMLDivElement;
  private readonly bottleRow: HTMLDivElement;
  private readonly store = new DisposableStore();
  private readonly segs: SegmentView[] = [];
  private readonly vials: VialView[] = [];
  private readonly last: Cache = {};
  private readonly lastSeg: Cache[] = [];
  private readonly lastVial: Cache[] = [];
  private insets: Insets = NO_INSETS;
  private width = 0;
  private height = 0;
  private size: number;
  private calm = false;
  private glyphs: HudGlyphs = { ability: '' };
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
    const plate = div(doc, 'hud-card-plate');
    this.cardBody = div(doc, 'hud-card-body');
    this.cardBody.style.display = 'flex';
    this.sweep = div(doc, 'hud-card-sweep');
    this.cardKey = glyph(doc, 'hud-card-key', 'hud-card-key');
    this.cardCost = glyph(doc, 'hud-card-cost', 'hud-card-cost');
    this.card.append(plate, this.cardBody, this.sweep, this.cardKey, this.cardCost);
    this.stack = div(doc, 'hud-stack');
    this.lifeRow = div(doc, 'hud-life', 'hud-life');
    this.lifeRow.setAttribute('role', 'progressbar');
    this.lifeRow.setAttribute('aria-valuemin', '0');
    this.guard = div(doc, 'hud-guard', 'hud-guard');
    this.magic = div(doc, 'hud-magic', 'hud-magic');
    this.magic.setAttribute('role', 'progressbar');
    this.magic.setAttribute('aria-valuemin', '0');
    const magicRim = div(doc, 'hud-magic-rim');
    const well = div(doc, 'hud-magic-well');
    this.magicTrail = div(doc, 'hud-magic-trail', 'hud-magic-trail');
    this.magicFill = div(doc, 'hud-magic-fill', 'hud-magic-fill');
    well.append(this.magicTrail, this.magicFill);
    magicRim.appendChild(well);
    this.magicCost = div(doc, 'hud-magic-cost', 'hud-magic-cost');
    this.magic.append(magicRim, this.magicCost);
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

  /** The key or button of the device in use to label the power with (empty: nothing). Call whenever the device or the keys change; only a change reaches the DOM. */
  setGlyphs(glyphs: HudGlyphs): void {
    this.glyphs = glyphs;
    this.writeGlyph(this.cardKey, 'cardKey', glyphs.ability);
  }

  /** "Fewer flashes" (the accessibility setting): the white flash of a lost segment is left out, its ghost is softened and nothing blinks or shines by itself. */
  setCalm(calm: boolean): void {
    this.calm = calm;
    this.root.dataset['calm'] = calm ? '1' : '0';
  }

  /** The game is paused (the pause menu is up): the animations the stylesheet runs on its own stop where they are and go on from there. */
  setPaused(paused: boolean): void {
    this.root.dataset['paused'] = paused ? '1' : '0';
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
      // the ghost of a lost segment and its white flash share one overlay: whichever is stronger (quantised to 1/20 so it is not rewritten each frame). Calm: no flash, a softer ghost
      const strength = this.calm ? seg.ghost * 0.3 : Math.max(seg.ghost * 0.55, seg.flash);
      const a = Math.round(strength * 20) / 20;
      set(c, 'ghost', a, () => (view.ghost.style.opacity = String(a)));
      // a segment that is back: a wave of light crosses it once
      const h = Math.round(seg.heal * 20) / 20;
      set(c, 'heal', h, () => {
        view.heal.style.opacity = h === 0 ? '0' : String(Math.min(1, h * 1.6));
        view.heal.style.transform = h === 0 ? '' : `translateX(${((1 - h) * 160 - 60).toFixed(0)}%)`;
      });
    }
    // the guard line: the i-frames a blow gives, draining
    const g = Math.round(l.guard * 60) / 60;
    set(this.last, 'guard', g, () => {
      this.guard.style.transform = `scaleX(${g})`;
      this.guard.style.opacity = g > 0 ? '1' : '0';
      this.lifeRow.dataset['guard'] = g > 0 ? '1' : '0';
    });
  }

  // ----------------------------------------------------------------------------------------------- magic

  private updateMagic(s: Readonly<HudState>): void {
    const m = s.magic;
    const f = Math.round(m.fraction * 400) / 400; // continuous to the eye (a quarter of a percent), not rewritten for every tick
    set(this.last, 'magic', f, () => {
      this.magicFill.style.transform = `scaleX(${f})`;
      this.magic.setAttribute('aria-valuenow', String(Math.round(m.fraction * 100)));
    });
    // the memory of where it was: never behind the bar itself
    const t = Math.max(f, Math.round(m.trail * 400) / 400);
    set(this.last, 'trail', t, () => (this.magicTrail.style.transform = `scaleX(${t})`));
    set(this.last, 'regen', m.regenerating, () => (this.magic.dataset['regen'] = m.regenerating ? '1' : '0'));
    set(this.last, 'wait', m.waiting, () => (this.magic.dataset['wait'] = m.waiting ? '1' : '0'));
    // where the power's cost falls on the bar, and whether the magic reaches it
    const cost = Math.round(m.cost01 * 400) / 400;
    set(this.last, 'cost01', cost, () => {
      this.magicCost.dataset['on'] = cost > 0 ? '1' : '0';
      this.magicCost.style.left = `${(cost * 100).toFixed(2)}%`;
    });
    set(this.last, 'afford', m.affordable, () => (this.magic.dataset['afford'] = m.affordable ? '1' : '0'));
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
        const icon = createIcon(this.root.ownerDocument, c.iconId, 28);
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
    set(this.last, 'cardGain', c.gain > 0, () => (this.card.dataset['gain'] = c.gain > 0 ? '1' : '0'));
    // what the power costs, in magic, and whether the magic reaches it
    this.writeGlyph(this.cardCost, 'cardCost', c.cost > 0 && c.state !== 'empty' ? String(Math.round(c.cost)) : '');
    set(this.last, 'cardAfford', s.magic.affordable, () => (this.card.dataset['afford'] = s.magic.affordable ? '1' : '0'));
    // the key of the power only shows with a power in the slot
    this.writeGlyph(this.cardKey, 'cardKey', c.state === 'empty' ? '' : this.glyphs.ability);
    // a refused cast shakes the slot, a new card makes it swell and settle: both are one transform
    const shakeX = Math.round(c.shakeX * 10) / 10;
    const swell = Math.round(0.35 * c.gain * 20) / 20;
    set(this.last, 'cardFx', `${shakeX}|${swell}`, () => {
      const parts = [shakeX === 0 ? '' : `translateX(${shakeX.toFixed(1)}px)`, swell === 0 ? '' : `scale(${(1 + swell).toFixed(3)})`];
      this.card.style.transform = parts.filter(Boolean).join(' ');
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
      const fill = Math.round((b.state === 'empty' ? 0 : b.fill01) * 200) / 200;
      set(c, 'fill', fill, () => (v.liquid.style.transform = `scaleY(${fill})`));
      set(c, 'drinking', b.drinking, () => (v.el.dataset['drinking'] = b.drinking ? '1' : '0'));
      set(c, 'gain', b.gain > 0, () => (v.el.dataset['gain'] = b.gain > 0 ? '1' : '0'));
      // the seconds left of the recharge going on in this vial: a number, only while it recharges
      const secs = b.state === 'recharging' ? b.secondsLeft : 0;
      set(c, 'secs', secs, () => {
        v.time.dataset['on'] = secs > 0 ? '1' : '0';
        v.time.textContent = secs > 0 ? String(secs) : '';
      });
      // a drunk vial pops out, a new one pops in: both are a scale that settles back to 1
      const swell = Math.round((0.3 * b.pop + 0.35 * b.gain) * 20) / 20;
      set(c, 'swell', swell, () => (v.el.style.transform = swell === 0 ? '' : `scale(${(1 + swell).toFixed(3)})`));
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
        // the ghost is the FIRST child of the segment (the tests and the E2E read its opacity); the rim and what it frames come after, under it
        const ghost = div(doc, 'hud-seg-ghost');
        const heal = div(doc, 'hud-seg-heal');
        const rim = div(doc, 'hud-seg-rim');
        rim.appendChild(div(doc, 'hud-seg-fill'));
        el.append(ghost, rim, heal);
        this.lifeRow.appendChild(el);
        this.segs.push({ el, ghost, heal });
        this.lastSeg.push({});
      }
      this.lifeRow.appendChild(this.guard);
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
        const glassEl = div(doc, 'hud-glass');
        const rim = div(doc, 'hud-glass-rim');
        const body = div(doc, 'hud-glass-body');
        const liquid = div(doc, 'hud-liquid');
        body.appendChild(liquid);
        rim.appendChild(body);
        glassEl.appendChild(rim);
        const time = glyph(doc, 'hud-vial-time', `hud-time-${i}`);
        el.append(glassEl, time);
        this.bindVial(el, i);
        this.bottleRow.appendChild(el);
        this.vials.push({ el, liquid, time });
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

  /** Writes a number or a key label into one of the little chips; an empty value hides the chip. */
  private writeGlyph(el: HTMLDivElement, key: string, value: string): void {
    set(this.last, key, value, () => {
      el.textContent = value;
      el.dataset['on'] = value === '' ? '0' : '1';
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

/** One of the little chips that hold a number or a key label: hidden from the screen reader (the accessible name of what it sits on says it in words) and off until it has something to say. */
function glyph(doc: Document, className: string, testid: string): HTMLDivElement {
  const el = div(doc, className, testid);
  el.setAttribute('aria-hidden', 'true');
  el.dataset['on'] = '0';
  return el;
}

/** Runs `apply` only when `value` differs from what was applied last; returns whether it did. */
function set(cache: Cache, key: string, value: string | number | boolean, apply: () => void): boolean {
  if (cache[key] === value) return false;
  cache[key] = value;
  apply();
  return true;
}
