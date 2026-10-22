// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createPlayerStatus } from '@/gameplay/PlayerStatus';
import { CATALOGS, createTranslator } from '@/i18n';
import { HudModel, percentOf } from '@/ui/hud/HudModel';
import { HudView } from '@/ui/hud/HudView';
import { lcg, soak } from '../helpers/soak';

/**
 * SOAK of the HUD (docs/PROMPT5-LOG.md S20, docs/PROMPT17-LOG.md): the real simulation under the random play of `tests/helpers/soak.ts` — hits, deaths,
 * bottles, casts, refusals, room reloads — feeding the real `HudModel` and the real `HudView` frame after frame, with frames of every
 * length (a hidden tab's 1.5 s included), a window that is resized and a size preference that changes. After every frame the DOM
 * must say exactly what the simulation says (the number of the life and of the magic, the bottles, the one being drunk), contain no number that is not a
 * number, keep the transients of the model inside their ranges, and never grow: the same HUD is the same number of nodes.
 */
const TICKS = Math.max(600, Number(process.env['SOAK_TICKS'] ?? 6000));
const SEEDS = Array.from({ length: Math.max(4, Number(process.env['SOAK_SEEDS'] ?? 4)) }, (_, i) => [2, 8, 77, 404][i] ?? 900 + i * 6007);
const INSETS = [{ top: 0, right: 0, bottom: 0, left: 0 }, { top: 24, right: 47, bottom: 21, left: 47 }, { top: 0, right: 0, bottom: 34, left: 0 }];
const SIZES: Array<[number, number]> = [[844, 390], [932, 430], [667, 375], [1024, 768], [1920, 1080], [390, 844]];

function run(seed: number): { violations: string[]; frames: number; sizes: Set<string> } {
  const violations: string[] = [];
  let frameNo = 0;
  const bad = (what: string): void => {
    if (violations.length < 10) violations.push(`seed ${seed}, frame ${frameNo}: ${what}`);
  };
  const rnd = lcg(seed ^ 0x9e3779b9); // the view's own chance: it never touches the simulation's
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;

  document.body.innerHTML = '';
  document.head.innerHTML = '';
  const host = document.createElement('div');
  document.body.appendChild(host);
  const tr = createTranslator(CATALOGS, 'es');
  const model = new HudModel();
  const view = new HudView(host, tr, { down: () => false, up: () => undefined });
  view.place(844, 390, INSETS[0]!);
  const status = createPlayerStatus();
  const sizesSeen = new Set<string>();
  const nodesFor = new Map<string, number>();
  let subscribed = false;

  const q = (id: string): HTMLElement => host.querySelector(`[data-testid="${id}"]`) as HTMLElement;
  const noNonsense = (el: Element): void => {
    for (const attr of el.getAttributeNames()) {
      const v = el.getAttribute(attr) ?? '';
      if (/NaN|undefined|Infinity/.test(v)) bad(`${el.getAttribute('data-testid') ?? el.className} has ${attr}="${v}"`);
    }
  };

  soak(seed, TICKS, (s, tick) => {
    frameNo = tick;
    if (!subscribed) {
      subscribed = true;
      s.bus.on('skill:denied', () => model.magicDenied());
      s.bus.on('bottle:denied', () => model.bottlesDenied());
    }
    // the window and the preference move now and then
    if (rnd() < 0.004) {
      const [w, h] = pick(SIZES);
      view.place(w, h, pick(INSETS));
      sizesSeen.add(`${w}x${h}`);
    }
    if (rnd() < 0.003) view.setSize(0.8 + rnd() * 0.6);

    s.status(status);
    const dt = pick([1 / 60, 1 / 60, 1 / 60, 1 / 30, 0.1, 0, 1.5]);
    const state = model.update(status, dt);
    view.update(state);

    // ---- the model: transients inside their ranges
    for (const b of [state.life, state.magic]) {
      if (!(b.edge >= 0 && b.edge <= 1 && b.wear >= b.edge - 1e-12 && b.wear <= 1 && b.fraction >= 0 && b.fraction <= 1)) bad(`a bar: edge ${b.edge}, wear ${b.wear}, fraction ${b.fraction}`);
      if (!Number.isInteger(b.percent) || b.percent < 0 || b.percent > 100) bad(`a number of ${b.percent}`);
    }
    for (const b of state.bottles) if (!(b.dark >= 0 && b.dark <= 1)) bad(`a bottle with dark ${b.dark}`);
    for (const v of [state.magic.shakeX, state.bottlesShakeX]) if (!Number.isFinite(v) || Math.abs(v) > 4 + 1e-9) bad(`a shake of ${v} dp`);

    // ---- the DOM says what the simulation says: the numbers are the real ones, on every frame, whatever the length of the frame
    const life = q('hud-life');
    if (life.getAttribute('aria-valuenow') !== String(Math.round(status.life.current))) bad(`life aria-valuenow ${life.getAttribute('aria-valuenow')} vs ${status.life.current}`);
    if (life.getAttribute('aria-valuemax') !== String(status.life.max)) bad(`life aria-valuemax ${life.getAttribute('aria-valuemax')} vs ${status.life.max}`);
    if (q('hud-life-number').textContent !== String(percentOf(status.life.current, status.life.max))) bad(`the number of the life is "${q('hud-life-number').textContent}", the simulation has ${status.life.current} of ${status.life.max}`);

    const magic = q('hud-magic');
    if (magic.getAttribute('aria-valuenow') !== String(Math.round(status.magic.current))) bad(`magic aria-valuenow ${magic.getAttribute('aria-valuenow')} vs ${status.magic.current}`);
    if (q('hud-magic-number').textContent !== String(percentOf(status.magic.current, status.magic.max))) bad(`the number of the magic is "${q('hud-magic-number').textContent}", the simulation has ${status.magic.current} of ${status.magic.max}`);
    for (const bar of [life, magic]) {
      const edge = Number(bar.dataset['edge']);
      if (!(edge >= 0 && edge <= 1) || !Number.isFinite(edge)) bad(`${bar.dataset['testid']} edge ${bar.dataset['edge']}`);
      if (!(Number(bar.dataset['wear']) >= edge - 1e-9)) bad(`${bar.dataset['testid']} wear ${bar.dataset['wear']} behind its edge ${edge}`);
    }
    if (host.textContent !== `${percentOf(status.life.current, status.life.max)}${percentOf(status.magic.current, status.magic.max)}`) bad(`the HUD writes "${host.textContent}": nothing but its two numbers`);

    const vials = [...host.querySelectorAll('[data-testid^="hud-bottle-"]')].filter((e) => /^hud-bottle-\d$/.test((e as HTMLElement).dataset['testid'] ?? '')) as HTMLElement[];
    if (vials.length !== status.bottles.length) bad(`${vials.length} vials for ${status.bottles.length} bottles`);
    vials.forEach((v, i) => {
      if (v.dataset['state'] !== status.bottles[i]?.state) bad(`vial ${i} shows "${v.dataset['state']}", the simulation says "${status.bottles[i]?.state}"`);
      if ((v.dataset['drinking'] === '1') !== (status.drink.slot === i)) bad(`vial ${i} drinking=${v.dataset['drinking']} with the drink slot at ${status.drink.slot}`);
      const dark = Number(v.dataset['dark']);
      if (!(dark >= 0 && dark <= 1)) bad(`vial ${i} dark ${v.dataset['dark']}`);
      // a bottle changes picture by fading, and the fading waits with the game (dt 0): in a frame that moves, one that has just become available is never still the dark one alone, and one that has just been spent never still the bright one alone
      if (dt > 0 && status.bottles[i]?.state === 'ready' && dark === 1) bad(`vial ${i} is ready and fully dark after a frame of ${dt} s`);
      if (dt > 0 && status.bottles[i]?.state !== 'ready' && dark === 0) bad(`vial ${i} is not available and fully bright after a frame of ${dt} s`);
    });

    // ---- nothing in the DOM is not-a-number, and it never grows
    const all = [...host.querySelectorAll('*')];
    for (const el of all) noNonsense(el);
    const l = view.current;
    for (const n of [l.x, l.y, l.width, l.height, l.scale]) if (!Number.isFinite(n)) bad(`the layout has ${n}`);
    const key = `${status.bottles.length}`;
    const seen = nodesFor.get(key);
    if (seen === undefined) nodesFor.set(key, all.length);
    else if (seen !== all.length) bad(`${all.length} nodes for ${key}, it was ${seen} before: the HUD leaks or loses nodes`);
  });
  view.dispose();
  return { violations, frames: TICKS, sizes: sizesSeen };
}

describe('HUD soak: the real HUD under the random play of the real simulation', () => {
  const results = SEEDS.map((seed) => run(seed));

  it('says exactly what the simulation says, with no nonsense and no leak, on every frame of every seed', () => {
    expect(results.flatMap((r) => r.violations)).toEqual([]);
  });

  it('really plays: every frame was checked, and the window was resized', () => {
    expect(results.reduce((n, r) => n + r.frames, 0)).toBe(SEEDS.length * TICKS);
    expect(new Set(results.flatMap((r) => [...r.sizes])).size).toBeGreaterThan(3);
  });
});
