// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createPlayerStatus } from '@/gameplay/PlayerStatus';
import { CATALOGS, createTranslator } from '@/i18n';
import { HudModel } from '@/ui/hud/HudModel';
import { HudView } from '@/ui/hud/HudView';
import { lcg, soak } from '../helpers/soak';

/**
 * SOAK of the HUD (docs/PROMPT5-LOG.md S20): the real simulation under the random play of `tests/helpers/soak.ts` — hits, deaths,
 * bottles, casts, refusals, room reloads — feeding the real `HudModel` and the real `HudView` frame after frame, with frames of every
 * length (a hidden tab's 1.5 s included), a window that is resized and a size preference that changes. After every frame the DOM
 * must say exactly what the simulation says (life, magic, card, bottles, the vial being drunk), contain no number that is not a
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
      s.bus.on('bottle:drunk', (e) => model.bottleUsed(e.slot));
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
    for (const seg of state.life.segments) if (!(seg.ghost >= 0 && seg.ghost <= 1 && seg.flash >= 0 && seg.flash <= 1)) bad(`a segment ghost ${seg.ghost} / flash ${seg.flash}`);
    for (const b of state.bottles) if (!(b.pop >= 0 && b.pop <= 1 && b.fill01 >= 0 && b.fill01 <= 1)) bad(`a bottle pop ${b.pop} / fill ${b.fill01}`);
    for (const v of [state.magic.shakeX, state.card.shakeX, state.bottlesShakeX]) if (!Number.isFinite(v) || Math.abs(v) > 4 + 1e-9) bad(`a shake of ${v} dp`);
    if (!(state.magic.fraction >= 0 && state.magic.fraction <= 1)) bad(`magic fraction ${state.magic.fraction}`);

    // ---- the DOM says what the simulation says
    const life = q('hud-life');
    if (life.getAttribute('aria-valuenow') !== String(status.life.current)) bad(`life aria-valuenow ${life.getAttribute('aria-valuenow')} vs ${status.life.current}`);
    if (life.getAttribute('aria-valuemax') !== String(status.life.max)) bad(`life aria-valuemax ${life.getAttribute('aria-valuemax')} vs ${status.life.max}`);
    const segs = [...host.querySelectorAll('[data-testid^="hud-life-seg-"]')];
    if (segs.length !== status.life.max) bad(`${segs.length} life segments for a maximum of ${status.life.max}`);
    const full = segs.filter((e) => (e as HTMLElement).dataset['state'] === 'full').length;
    if (full !== status.life.current) bad(`${full} full segments for ${status.life.current} life`);

    const magic = q('hud-magic');
    // (the bar is rewritten when it moves a quarter of a percent, so the accessible value may lag by less than one point)
    if (Math.abs(Number(magic.getAttribute('aria-valuenow')) - (status.magic.current / status.magic.max) * 100) > 1) bad(`magic aria-valuenow ${magic.getAttribute('aria-valuenow')} vs ${status.magic.current}`);
    const fill = /^scaleX\(([\d.]+)\)$/.exec(q('hud-magic-fill').style.transform);
    if (!fill || Math.abs(Number(fill[1]) - status.magic.current / status.magic.max) > 1 / 400 + 1e-9) bad(`magic fill "${q('hud-magic-fill').style.transform}" vs ${status.magic.current / status.magic.max}`);
    if (magic.dataset['regen'] !== (status.magic.regenerating ? '1' : '0')) bad('magic data-regen disagrees');

    const wantCard = status.card.equipped ? status.card.state : 'empty';
    if (q('hud-card').dataset['state'] !== wantCard) bad(`card shows "${q('hud-card').dataset['state']}", the simulation says "${wantCard}"`);

    const vials = [...host.querySelectorAll('[data-testid^="hud-bottle-"]')] as HTMLElement[];
    if (vials.length !== status.bottles.length) bad(`${vials.length} vials for ${status.bottles.length} bottles`);
    vials.forEach((v, i) => {
      if (v.dataset['state'] !== status.bottles[i]?.state) bad(`vial ${i} shows "${v.dataset['state']}", the simulation says "${status.bottles[i]?.state}"`);
      if ((v.dataset['drinking'] === '1') !== (status.drink.slot === i)) bad(`vial ${i} drinking=${v.dataset['drinking']} with the drink slot at ${status.drink.slot}`);
    });

    // ---- nothing in the DOM is not-a-number, and it never grows
    const all = [...host.querySelectorAll('*')];
    for (const el of all) noNonsense(el);
    const l = view.current;
    for (const n of [l.x, l.y, l.width, l.height, l.scale]) if (!Number.isFinite(n)) bad(`the layout has ${n}`);
    const key = `${status.life.max}/${status.bottles.length}/${status.card.equipped ? 'card' : 'empty'}`; // (a card's icon is more nodes than the empty slot's dash)
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
