// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CATALOGS, createTranslator } from '@/i18n';
import { createPlayerStatus, type PlayerStatus } from '@/gameplay/PlayerStatus';
import { HUD_ART } from '@/ui/hud/art';
import { HUD_DP_PER_PX, HUD_NUMBER, HUD_PX } from '@/ui/hud/artGeometry';
import { placeBar } from '@/ui/hud/barLayout';
import { HudModel } from '@/ui/hud/HudModel';
import { HudView, type HudPointerSink } from '@/ui/hud/HudView';
import { computeHudLayout, HUD_DESIGN } from '@/ui/hud/layout';

/**
 * The HUD as DOM (docs/ARCHITECTURE-2D.md §8, docs/PROMPT17-LOG.md): what exists, what it shows for each state, that it is the artist's pictures and nothing drawn, that the numbers are the real ones, that it writes to the DOM
 * only when something changed, that it holds no words of its own, and that a finger on a bottle reaches the touch source.
 */
const q = (root: ParentNode, id: string): HTMLElement => root.querySelector(`[data-testid="${id}"]`) as HTMLElement;
const all = (root: ParentNode, prefix: string): HTMLElement[] => [...root.querySelectorAll<HTMLElement>(`[data-testid^="${prefix}"]`)];
const px = (v: string): number => Number.parseFloat(v);

function status(patch: (s: PlayerStatus) => void = () => {}): PlayerStatus {
  const s = createPlayerStatus();
  s.life.current = 5;
  s.life.max = 5;
  s.magic.current = 100;
  s.magic.max = 100;
  s.bottles = [0, 1, 2].map(() => ({ state: 'ready' as const, fill01: 1, iconId: 'bottle', secondsLeft: 0 }));
  patch(s);
  return s;
}
const bottles = (...states: Array<'ready' | 'empty' | 'recharging'>) => (s: PlayerStatus) => void (s.bottles = states.map((state) => ({ state, fill01: state === 'ready' ? 1 : 0, iconId: 'bottle', secondsLeft: 0 })));

describe('hud view', () => {
  let host: HTMLDivElement;
  let view: HudView;
  let model: HudModel;
  let downs: Array<[number, number]>;
  let ups: number[];
  const tr = createTranslator(CATALOGS, 'es');
  const sink: HudPointerSink = {
    down: (id, slot) => {
      downs.push([id, slot]);
      return true;
    },
    up: (id) => void ups.push(id),
  };
  /** Shows a frame, then lets the transients finish (the picture of a bar is on its way for a fraction of a second). */
  const show = (s: PlayerStatus, dt = 1 / 60): void => view.update(model.update(s, dt));
  const settle = (s: PlayerStatus): void => {
    for (let i = 0; i < 90; i++) show(s);
  };

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    host = document.createElement('div');
    document.body.appendChild(host);
    downs = [];
    ups = [];
    model = new HudModel();
    view = new HudView(host, tr, sink);
    view.place(844, 390, { top: 0, right: 0, bottom: 0, left: 0 });
    show(status());
  });
  afterEach(() => {
    view.dispose();
    tr.setLocale('es');
  });

  it('has the portrait, the two plates, the two bars and three bottles — and nothing else: no card, no segments, no glyphs', () => {
    expect(q(host, 'hud-portrait')).not.toBeNull();
    expect(q(host, 'hud-plate-life')).not.toBeNull();
    expect(q(host, 'hud-plate-magic')).not.toBeNull();
    expect(q(host, 'hud-life')).not.toBeNull();
    expect(q(host, 'hud-magic')).not.toBeNull();
    expect(all(host, 'hud-bottle-').filter((e) => /^hud-bottle-\d$/.test(e.dataset['testid'] ?? ''))).toHaveLength(3);
    expect(q(host, 'hud-card')).toBeNull();
    expect(all(host, 'hud-life-seg-')).toHaveLength(0);
  });

  it('is the artist\'s pictures: every shape on it is an <img> of one of the ten pieces, nothing is drawn (no canvas, no SVG, no gradient, no background)', () => {
    const imgs = [...host.querySelectorAll('img')];
    // portrait, two plates, (dark, bright, rectangle) × 2 bars, (bright, dark) × 3 bottles
    expect(imgs).toHaveLength(3 + 6 + 6);
    const urls = new Set(Object.values(HUD_ART));
    for (const img of imgs) {
      expect(urls.has(img.getAttribute('src') as (typeof HUD_ART)[keyof typeof HUD_ART]), img.dataset['testid']).toBe(true);
      expect(img.alt, 'decorative: the name of what it belongs to is its owner\'s').toBe('');
      expect(img.draggable).toBe(false);
    }
    expect(host.querySelector('canvas, svg')).toBeNull();
    const css = document.getElementById('troid-hud-style')?.textContent ?? '';
    for (const forbidden of ['gradient', 'background', 'box-shadow', 'border-radius', 'filter', 'mix-blend']) expect(css.includes(forbidden), forbidden).toBe(false);
  });

  it('puts each piece where the artist drew it: the DOM is the artist\'s canvas at its own size, from the corner of the block', () => {
    const css = document.getElementById('troid-hud-style')?.textContent ?? '';
    const rule = (selector: string): string => new RegExp(`${selector.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    const at = (b: { x: number; y: number; w: number; h: number }): string => `left:${b.x - HUD_PX.block.x}px;top:${b.y - HUD_PX.block.y}px;width:${b.w}px;height:${b.h}px;`;
    expect(rule('.troid-hud .hud-portrait').trim()).toBe(at(HUD_PX.portrait));
    expect(rule('.troid-hud .hud-plate-life').trim()).toBe(at(HUD_PX.plateLife));
    expect(rule('.troid-hud .hud-plate-magic').trim()).toBe(at(HUD_PX.plateMagic));
    expect(rule('.troid-hud .hud-bar-life').trim()).toBe(at(HUD_PX.barLife));
    expect(rule('.troid-hud .hud-bar-magic').trim()).toBe(at(HUD_PX.barMagic));
    expect(rule('.troid-hud .hud-block')).toContain(`width:${HUD_PX.block.w}px; height:${HUD_PX.block.h}px;`);
    // the whole block is scaled once: from the canvas to dp to the screen
    const l = view.current;
    expect(q(host, 'hud-block').style.transform).toBe(`scale(${l.scale * HUD_DP_PER_PX})`);
  });

  it('is DOM and never Pixi: the root is a plain element that lets every touch through except the bottles', () => {
    const style = document.getElementById('troid-hud-style')?.textContent ?? '';
    expect(style).toMatch(/\.troid-hud \{[^}]*pointer-events:none/);
    expect(style).toMatch(/\.hud-vial \{[^}]*pointer-events:auto/);
    expect(style).toMatch(/\.hud-img \{[^}]*pointer-events:none/);
  });

  it('writes two numbers and no word: the life and the magic as the game has them, 100 and 100 at the start of a game', () => {
    expect(q(host, 'hud-life-number').textContent).toBe('100');
    expect(q(host, 'hud-magic-number').textContent).toBe('100');
    expect(host.textContent).toBe('100100');
    expect(host.querySelectorAll('input, textarea, button').length).toBe(0);
    for (const n of all(host, 'hud-').filter((e) => e.classList.contains('hud-num'))) expect(n.getAttribute('aria-hidden')).toBe('true');
  });

  it('the numbers are the artist\'s: white, light, with the small hard shadow in the dark of their bar, left in the bar where the artist typed them', () => {
    const css = document.getElementById('troid-hud-style')?.textContent ?? '';
    const num = /\.troid-hud \.hud-num \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(num).toContain(`left:${HUD_NUMBER.left}px`);
    expect(num).toContain(`color:${HUD_NUMBER.color}`);
    expect(num).toMatch(/font:300 /);
    expect(css).toContain(`.troid-hud .hud-bar-life .hud-num { text-shadow:${HUD_NUMBER.shadow}px ${HUD_NUMBER.shadow}px 0 ${HUD_NUMBER.shadowLife}; }`);
    expect(css).toContain(`.troid-hud .hud-bar-magic .hud-num { text-shadow:${HUD_NUMBER.shadow}px ${HUD_NUMBER.shadow}px 0 ${HUD_NUMBER.shadowMagic}; }`);
  });

  it('a full bar: the bright picture to the tip, the dark one clipped away, no white rectangle', () => {
    for (const kind of ['life', 'magic']) {
      expect(q(host, `hud-${kind}-fill`).style.clipPath, kind).toBe('inset(0 0px 0 0)');
      expect(q(host, `hud-${kind}-lost`).style.clipPath, kind).toBe(`inset(0 0 0 ${HUD_PX.barLife.w}px)`);
      expect(q(host, `hud-${kind}-mark`).style.opacity, kind).toBe('0');
    }
    expect(q(host, 'hud-life').dataset['percent']).toBe('100');
  });

  it('life lost: the number and the aria value are the real ones at once, the bright picture ends where the life does, and the white rectangle stands there', () => {
    show(status((s) => (s.life.current = 4)), 0);
    expect(q(host, 'hud-life-number').textContent).toBe('80');
    expect(q(host, 'hud-life').getAttribute('aria-valuenow')).toBe('4');
    expect(q(host, 'hud-life').getAttribute('aria-valuemax')).toBe('5');
    expect(q(host, 'hud-life').getAttribute('aria-valuetext')).toBe('80%');
    settle(status((s) => (s.life.current = 4)));
    const p = placeBar(0.8, 0.8, HUD_PX.barLife.w, false);
    expect(q(host, 'hud-life-fill').style.clipPath).toBe(`inset(0 ${Number((HUD_PX.barLife.w - p.fillRight).toFixed(3))}px 0 0)`);
    expect(q(host, 'hud-life-lost').style.clipPath).toBe(`inset(0 0 0 ${Number(p.lostLeft.toFixed(3))}px)`);
    expect(q(host, 'hud-life-mark').style.transform).toBe(`translateX(${Number(p.markX.toFixed(3))}px) scaleX(1)`);
    expect(q(host, 'hud-life-mark').style.opacity).toBe('');
    expect(q(host, 'hud-life').dataset['edge']).toBe('0.8');
  });

  it('life lost, right away: the white rectangle stretches behind the picture of the bar and then comes back to the size the artist drew it', () => {
    show(status((s) => (s.life.current = 3)));
    const stretched = /scaleX\(([\d.]+)\)/.exec(q(host, 'hud-life-mark').style.transform)?.[1] ?? '';
    expect(Number.parseFloat(stretched)).toBeGreaterThan(1.5);
    settle(status((s) => (s.life.current = 3)));
    expect(q(host, 'hud-life-mark').style.transform).toMatch(/scaleX\(1\)$/);
  });

  it('"fewer flashes": the white rectangle does not stretch, at any moment', () => {
    view.setCalm(true);
    expect(host.querySelector('.troid-hud')?.getAttribute('data-calm')).toBe('1');
    for (let i = 0; i < 40; i++) {
      show(status((s) => (s.life.current = 2)));
      expect(q(host, 'hud-life-mark').style.transform, `frame ${i}`).toMatch(/scaleX\(1\)$/);
    }
    view.setCalm(false);
    show(status((s) => (s.life.current = 1)));
    expect(q(host, 'hud-life-mark').style.transform).not.toMatch(/scaleX\(1\)$/);
  });

  it('the magic follows the number: 70 after a spend of 30, 40 after another 30, 0 when it is gone, and back', () => {
    for (const [value, shown] of [[70, '70'], [40, '40'], [0, '0'], [100, '100']] as const) {
      settle(status((s) => (s.magic.current = value)));
      expect(q(host, 'hud-magic-number').textContent).toBe(shown);
      expect(q(host, 'hud-magic').getAttribute('aria-valuenow')).toBe(shown);
      expect(q(host, 'hud-magic').getAttribute('aria-valuemax')).toBe('100');
      expect(q(host, 'hud-magic').dataset['edge']).toBe(String(value / 100));
    }
  });

  it('the magic comes back in tenths of a unit: the screen reader and the number say whole units', () => {
    settle(status((s) => (s.magic.current = 70)));
    show(status((s) => (s.magic.current = 70.4)));
    expect(q(host, 'hud-magic-number').textContent).toBe('70');
    expect(q(host, 'hud-magic').getAttribute('aria-valuenow')).toBe('70');
    show(status((s) => (s.magic.current = 71.2)));
    expect(q(host, 'hud-magic-number').textContent).toBe('71');
  });

  it('the bars are progressbars with their value, from 0 to the real maximum', () => {
    const life = q(host, 'hud-life');
    expect(life.getAttribute('role')).toBe('progressbar');
    expect([life.getAttribute('aria-valuemin'), life.getAttribute('aria-valuenow'), life.getAttribute('aria-valuemax')]).toEqual(['0', '5', '5']);
    show(status((s) => ((s.life.max = 6), (s.life.current = 5))));
    expect([life.getAttribute('aria-valuenow'), life.getAttribute('aria-valuemax')]).toEqual(['5', '6']);
    expect(q(host, 'hud-life-number').textContent).toBe('83');
  });

  it('a refused cast shakes the bar and it settles', () => {
    model.magicDenied();
    show(status(), 0.03);
    expect(q(host, 'hud-magic').style.transform).not.toBe('');
    for (let i = 0; i < 30; i++) show(status());
    expect(q(host, 'hud-magic').style.transform).toBe('');
  });

  it('bottles: bright or dark by their slot, one by one: one used, two used, three used', () => {
    const shown = (): string[] => all(host, 'hud-bottle-').filter((e) => /^hud-bottle-\d$/.test(e.dataset['testid'] ?? '')).map((e) => `${e.dataset['state']}:${e.dataset['dark']}`);
    settle(status());
    expect(shown()).toEqual(['ready:0', 'ready:0', 'ready:0']);
    settle(status(bottles('recharging', 'ready', 'ready')));
    expect(shown()).toEqual(['recharging:1', 'ready:0', 'ready:0']);
    settle(status(bottles('recharging', 'empty', 'ready')));
    expect(shown()).toEqual(['recharging:1', 'empty:1', 'ready:0']);
    settle(status(bottles('empty', 'empty', 'empty')));
    expect(shown()).toEqual(['empty:1', 'empty:1', 'empty:1']);
    settle(status(bottles('ready', 'empty', 'empty')));
    expect(shown()).toEqual(['ready:0', 'empty:1', 'empty:1']);
  });

  it('a spent bottle shows its dark picture only and an available one its bright picture only; in between the two are in proportion', () => {
    const bright = (i: number): HTMLElement => q(host, `hud-vial-${i}-bright`);
    const dark = (i: number): HTMLElement => q(host, `hud-vial-${i}-dark`);
    expect([bright(0).style.visibility, dark(0).style.visibility]).toEqual(['', 'hidden']);
    show(status(bottles('recharging', 'ready', 'ready')));
    const half = Number.parseFloat(dark(0).style.opacity);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(1);
    expect(Number.parseFloat(bright(0).style.opacity)).toBeCloseTo(1 - half, 6);
    settle(status(bottles('recharging', 'ready', 'ready')));
    expect([bright(0).style.visibility, dark(0).style.visibility, dark(0).style.opacity]).toEqual(['hidden', '', '']);
    expect([bright(1).style.visibility, dark(1).style.visibility]).toEqual(['', 'hidden']);
  });

  it('the bottle that is being drunk says so; a refused drink shakes the row and it settles', () => {
    show(status((s) => (s.drink = { slot: 2, progress01: 0.5 })));
    expect(all(host, 'hud-bottle-').filter((e) => /^hud-bottle-\d$/.test(e.dataset['testid'] ?? '')).map((e) => e.dataset['drinking'])).toEqual(['0', '0', '1']);
    show(status());
    expect(q(host, 'hud-bottle-2').dataset['drinking']).toBe('0');
    model.bottlesDenied();
    show(status(), 0.03);
    expect(q(host, 'hud-bottles').style.transform).not.toBe('');
    for (let i = 0; i < 30; i++) show(status());
    expect(q(host, 'hud-bottles').style.transform).toBe('');
  });

  it('a fourth bottle is another one of the artist\'s, in the artist\'s row, and goes away with the slot', () => {
    show(status(bottles('ready', 'ready', 'ready', 'ready')));
    const four = all(host, 'hud-bottle-').filter((e) => /^hud-bottle-\d$/.test(e.dataset['testid'] ?? ''));
    expect(four).toHaveLength(4);
    const left = four.map((e) => px(e.style.left));
    expect(left[1]! - left[0]!).toBeCloseTo(HUD_PX.bottle.pitch, 3);
    expect(left[3]! - left[2]!).toBeCloseTo(HUD_PX.bottle.pitch, 3);
    show(status(bottles('ready', 'ready', 'ready')));
    expect(all(host, 'hud-bottle-').filter((e) => /^hud-bottle-\d$/.test(e.dataset['testid'] ?? ''))).toHaveLength(3);
  });

  it('the touch area of a bottle is as wide as its pitch and as tall as a finger needs, and neighbours share no pixel', () => {
    const css = document.getElementById('troid-hud-style')?.textContent ?? '';
    const vial = /\.troid-hud \.hud-vial \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(px(/width:([\d.]+)px/.exec(vial)?.[1] ?? '0')).toBeCloseTo(HUD_PX.bottle.pitch, 3);
    expect(px(/height:([\d.]+)px/.exec(vial)?.[1] ?? '0') * HUD_DP_PER_PX).toBeCloseTo(HUD_DESIGN.vial.hitH, 3);
    const left = all(host, 'hud-bottle-').filter((e) => /^hud-bottle-\d$/.test(e.dataset['testid'] ?? '')).map((e) => px(e.style.left));
    expect(left[1]! - left[0]!).toBeGreaterThanOrEqual(HUD_PX.bottle.pitch - 1e-9);
  });

  it('writes to the DOM only when something changed: a second identical frame mutates nothing', () => {
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((r) => records.push(...r));
    observer.observe(host, { attributes: true, childList: true, subtree: true, characterData: true });
    settle(status((s) => (s.magic.current = 60)));
    observer.takeRecords();
    records.length = 0;
    for (let i = 0; i < 20; i++) show(status((s) => (s.magic.current = 60)));
    expect([...records, ...observer.takeRecords()]).toHaveLength(0);
    observer.disconnect();
  });

  it('accessible names come from the translator and follow the language (Spanish ↔ English)', () => {
    expect(q(host, 'hud-life').getAttribute('aria-label')).toBe('Vida');
    expect(q(host, 'hud-magic').getAttribute('aria-label')).toBe('Magia');
    expect(q(host, 'hud-bottle-0').getAttribute('aria-label')).toBe('Botella 1: lista');
    tr.setLocale('en');
    expect(q(host, 'hud-life').getAttribute('aria-label')).toBe('Life');
    expect(q(host, 'hud-magic').getAttribute('aria-label')).toBe('Magic');
    expect(q(host, 'hud-bottle-0').getAttribute('aria-label')).toBe('Bottle 1: ready');
    show(status(bottles('ready', 'ready', 'recharging')));
    expect(q(host, 'hud-bottle-2').getAttribute('aria-label')).toBe('Bottle 3: recharging');
    expect(q(host, 'hud-bottle-2').getAttribute('aria-disabled')).toBe('true');
    expect(q(host, 'hud-bottle-0').getAttribute('aria-disabled')).toBe('false');
    show(status(bottles('empty', 'ready', 'ready')));
    expect(q(host, 'hud-bottle-0').getAttribute('aria-label')).toBe('Bottle 1: empty');
  });

  it('a finger on a bottle reaches the touch source with the slot, and lifting lets go', () => {
    const v = q(host, 'hud-bottle-1');
    v.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, clientX: 90, clientY: 70, bubbles: true, cancelable: true, pointerType: 'touch' }));
    expect(downs).toEqual([[7, 1]]);
    v.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, bubbles: true, pointerType: 'touch' }));
    expect(ups).toEqual([7]);
    v.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 8, bubbles: true }));
    expect(ups).toEqual([7, 8]);
  });

  it('is placed at the top left inside the safe area and scaled with the window', () => {
    view.place(844, 390, { top: 0, right: 47, bottom: 21, left: 47 });
    const block = q(host, 'hud-block');
    const l = computeHudLayout(844, 390, { top: 0, right: 47, bottom: 21, left: 47 }, 1);
    expect(px(block.style.left)).toBeCloseTo(l.x, 6);
    expect(px(block.style.top)).toBeCloseTo(l.y, 6);
    expect(block.style.transform).toBe(`scale(${l.scale * HUD_DP_PER_PX})`);
    expect(px(block.style.left)).toBeGreaterThanOrEqual(47);
    view.place(1280, 720, { top: 24, right: 0, bottom: 0, left: 0 });
    expect(px(block.style.top)).toBeGreaterThanOrEqual(24);
    view.setSize(1.35);
    expect(view.current.scale).toBeCloseTo(computeHudLayout(1280, 720, { top: 24, right: 0, bottom: 0, left: 0 }, 1.35).scale, 9);
  });

  it('runs nothing by itself (no CSS animation, no transition): the game waiting waits for all of it, and it says so', () => {
    const css = document.getElementById('troid-hud-style')?.textContent ?? '';
    expect(css.includes('animation')).toBe(false);
    expect(css.includes('transition')).toBe(false);
    view.setPaused(true);
    expect(host.querySelector('.troid-hud')?.getAttribute('data-paused')).toBe('1');
    view.setPaused(false);
    expect(host.querySelector('.troid-hud')?.getAttribute('data-paused')).toBe('0');
  });

  it('dispose removes the HUD and its listeners', () => {
    const v = q(host, 'hud-bottle-0');
    view.dispose();
    v.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, bubbles: true }));
    expect(downs).toEqual([]);
    expect(host.querySelector('[data-testid="hud"]')).toBeNull();
  });
});
