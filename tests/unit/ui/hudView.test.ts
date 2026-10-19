// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CATALOGS, createTranslator } from '@/i18n';
import { createPlayerStatus, type PlayerStatus } from '@/gameplay/PlayerStatus';
import { HudModel } from '@/ui/hud/HudModel';
import { HudView, type HudPointerSink } from '@/ui/hud/HudView';
import { computeHudLayout } from '@/ui/hud/layout';

/**
 * The HUD as DOM (docs/ARCHITECTURE-2D.md §8): what exists, what it shows for each state, that it writes to the DOM only when
 * something changed, that it holds no text of its own, and that a finger on a bottle icon reaches the touch source.
 */
const q = (root: ParentNode, id: string): HTMLElement => root.querySelector(`[data-testid="${id}"]`) as HTMLElement;
const all = (root: ParentNode, prefix: string): HTMLElement[] => [...root.querySelectorAll<HTMLElement>(`[data-testid^="${prefix}"]`)];

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
  const show = (s: PlayerStatus, dt = 1 / 60): void => view.update(model.update(s, dt));

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

  it('has the card slot, five life segments, the magic bar and three bottles', () => {
    expect(q(host, 'hud-card')).not.toBeNull();
    expect(all(host, 'hud-life-seg-')).toHaveLength(5);
    expect(q(host, 'hud-magic')).not.toBeNull();
    expect(all(host, 'hud-bottle-')).toHaveLength(3);
  });

  it('draws NO text: every word of the HUD is an accessible name that comes from the translator', () => {
    expect(host.textContent?.trim()).toBe('');
    expect(host.querySelectorAll('input, textarea, button').length).toBe(0);
  });

  it('is DOM and never Pixi: the root is a plain element that lets every touch through except the bottle icons', () => {
    const style = document.getElementById('troid-hud-style')?.textContent ?? '';
    expect(style).toMatch(/\.troid-hud \{[^}]*pointer-events:none/);
    expect(style).toMatch(/\.hud-vial \{[^}]*pointer-events:auto/);
    expect(host.querySelector('canvas')).toBeNull();
  });

  it('shows full life, a full bar and ready bottles at the start', () => {
    expect(all(host, 'hud-life-seg-').map((e) => e.dataset['state'])).toEqual(['full', 'full', 'full', 'full', 'full']);
    expect(q(host, 'hud-magic-fill').style.transform).toBe('scaleX(1)');
    expect(all(host, 'hud-bottle-').map((e) => e.dataset['state'])).toEqual(['ready', 'ready', 'ready']);
    expect(q(host, 'hud-card').dataset['state']).toBe('empty');
  });

  it('losing life empties the last segment and flashes its ghost, which fades away', () => {
    show(status((s) => (s.life.current = 4)));
    const segs = all(host, 'hud-life-seg-');
    expect(segs.map((e) => e.dataset['state'])).toEqual(['full', 'full', 'full', 'full', 'empty']);
    const ghost = segs[4]!.querySelector('div') as HTMLElement;
    expect(Number.parseFloat(ghost.style.opacity)).toBeGreaterThan(0.3);
    for (let i = 0; i < 40; i++) show(status((s) => (s.life.current = 4)));
    expect(Number.parseFloat(ghost.style.opacity)).toBe(0);
  });

  it('the life bar is a progressbar with its value, and one point left is "critical" (the first segment pulses)', () => {
    show(status((s) => (s.life.current = 2)));
    const life = q(host, 'hud-life');
    expect(life.getAttribute('role')).toBe('progressbar');
    expect([life.getAttribute('aria-valuenow'), life.getAttribute('aria-valuemax')]).toEqual(['2', '5']);
    expect(host.querySelector('.troid-hud')?.getAttribute('data-critical')).toBe('0');
    show(status((s) => (s.life.current = 1)));
    expect(host.querySelector('.troid-hud')?.getAttribute('data-critical')).toBe('1');
    expect(q(host, 'hud-life-seg-0').dataset['final']).toBe('1');
  });

  it('the magic bar follows the number, continuously', () => {
    show(status((s) => (s.magic.current = 50)));
    expect(q(host, 'hud-magic-fill').style.transform).toBe('scaleX(0.5)');
    expect(q(host, 'hud-magic').getAttribute('aria-valuenow')).toBe('50');
    show(status((s) => (s.magic.current = 50.2)));
    expect(q(host, 'hud-magic-fill').style.transform).toBe('scaleX(0.5025)');
    show(status((s) => (s.magic.current = 0)));
    expect(q(host, 'hud-magic-fill').style.transform).toBe('scaleX(0)');
  });

  it('the regeneration glow is on only while it regenerates', () => {
    expect(q(host, 'hud-magic').dataset['regen']).toBe('0');
    show(status((s) => ((s.magic.current = 40), (s.magic.regenerating = true))));
    expect(q(host, 'hud-magic').dataset['regen']).toBe('1');
  });

  it('a refused cast shakes the bar and the card, and they settle', () => {
    model.magicDenied();
    show(status(), 0.03);
    const moved = q(host, 'hud-magic').style.transform !== '' || q(host, 'hud-card').style.transform !== '';
    expect(moved).toBe(true);
    for (let i = 0; i < 30; i++) show(status());
    expect(q(host, 'hud-magic').style.transform).toBe('');
    expect(q(host, 'hud-card').style.transform).toBe('');
  });

  it('a new card makes its slot glow and swell, then settle; a refused cast and the glow share the one transform without losing either', () => {
    const bolt = (s: PlayerStatus): void => {
      s.card.equipped = true;
      s.card.id = 'card_spirit_bolt';
      s.card.iconId = 'spirit_bolt';
      s.card.nameKey = 'card.spiritBolt.name';
      s.card.state = 'ready';
    };
    const card = q(host, 'hud-card');
    expect(card.dataset['gain']).toBe('0');
    show(status(bolt), 0);
    expect(card.dataset['gain']).toBe('1');
    expect(card.style.transform).toContain('scale(1.3');
    model.magicDenied();
    show(status(bolt), 0.03);
    expect(card.style.transform).toContain('translateX');
    expect(card.style.transform).toContain('scale(');
    for (let i = 0; i < 90; i++) show(status(bolt));
    expect(card.dataset['gain']).toBe('0');
    expect(card.style.transform).toBe('');
  });

  it('the card slot is EMPTY without a card: dashed, no icon, and it says so', () => {
    const card = q(host, 'hud-card');
    expect(card.dataset['state']).toBe('empty');
    expect(card.querySelector('svg')).toBeNull();
    expect(card.getAttribute('aria-label')).toBe('Sin habilidad equipada');
  });

  it('with a card it shows its icon, dims it without magic and sweeps the cooldown', () => {
    const equip = (s: PlayerStatus, state: 'ready' | 'noMagic' | 'cooldown', cd = 0): void => {
      s.card.equipped = true;
      s.card.id = 'card_spirit_bolt';
      s.card.iconId = 'spirit_bolt';
      s.card.nameKey = 'card.spiritBolt.name';
      s.card.state = state;
      s.card.cooldown01 = cd;
    };
    show(status((s) => equip(s, 'ready')));
    const card = q(host, 'hud-card');
    expect(card.dataset['state']).toBe('ready');
    expect(card.querySelector('svg')).not.toBeNull();
    expect(card.getAttribute('aria-label')).toBe('Habilidad equipada');
    show(status((s) => equip(s, 'noMagic')));
    expect(card.dataset['state']).toBe('noMagic');
    show(status((s) => equip(s, 'cooldown', 0.5)));
    expect(card.dataset['state']).toBe('cooldown');
    expect(card.dataset['cooldown']).toBe('0.5');
    expect((card.querySelector('.hud-card-sweep') as HTMLElement).style.background).toContain('conic-gradient');
    show(status());
    expect(card.dataset['state']).toBe('empty');
    expect(card.querySelector('svg')).toBeNull();
  });

  it('bottles: ready, empty and recharging look different, and a recharging one fills as it goes', () => {
    show(
      status((s) => {
        s.bottles[0] = { state: 'recharging', fill01: 0.25, iconId: 'bottle', secondsLeft: 0 };
        s.bottles[1] = { state: 'empty', fill01: 0, iconId: 'bottle', secondsLeft: 0 };
      }),
    );
    expect(all(host, 'hud-bottle-').map((e) => e.dataset['state'])).toEqual(['recharging', 'empty', 'ready']);
    const liquids = all(host, 'hud-bottle-').map((e) => (e.querySelector('.hud-liquid') as HTMLElement).style.transform);
    expect(liquids).toEqual(['scaleY(0.25)', 'scaleY(0)', 'scaleY(1)']);
  });

  it('drinking pops the vial for a moment', () => {
    model.bottleUsed(0);
    show(status((s) => (s.bottles[0] = { state: 'recharging', fill01: 0, iconId: 'bottle', secondsLeft: 0 })), 0);
    expect(q(host, 'hud-bottle-0').style.transform).toContain('scale(1.3');
    for (let i = 0; i < 30; i++) show(status((s) => (s.bottles[0] = { state: 'recharging', fill01: 0, iconId: 'bottle', secondsLeft: 0 })));
    expect(q(host, 'hud-bottle-0').style.transform).toBe('');
  });

  it('the vial being drunk glows and drains with the channel; a refused drink shakes the row of bottles and it settles', () => {
    show(status((s) => (s.drink = { slot: 2, progress01: 0.5 })));
    expect(all(host, 'hud-bottle-').map((e) => e.dataset['drinking'])).toEqual(['0', '0', '1']);
    expect((q(host, 'hud-bottle-2').querySelector('.hud-liquid') as HTMLElement).style.transform).toBe('scaleY(0.5)');
    show(status());
    expect(q(host, 'hud-bottle-2').dataset['drinking']).toBe('0');
    model.bottlesDenied();
    show(status(), 0.03);
    expect(q(host, 'hud-bottles').style.transform).not.toBe('');
    for (let i = 0; i < 30; i++) show(status());
    expect(q(host, 'hud-bottles').style.transform).toBe('');
  });

  it('the fourth bottle arrives glowing and swollen, and then settles like any other vial', () => {
    const four = (): PlayerStatus => status((s) => s.bottles.push({ state: 'ready', fill01: 1, iconId: 'bottle', secondsLeft: 0 }));
    show(four(), 0);
    expect(all(host, 'hud-bottle-').map((e) => e.dataset['gain'])).toEqual(['0', '0', '0', '1']);
    expect(q(host, 'hud-bottle-3').style.transform).toContain('scale(1.3');
    expect(q(host, 'hud-bottle-0').style.transform).toBe('');
    for (let i = 0; i < 90; i++) show(four());
    expect(all(host, 'hud-bottle-').map((e) => e.dataset['gain'])).toEqual(['0', '0', '0', '0']);
    expect(q(host, 'hud-bottle-3').style.transform).toBe('');
  });

  it('a game that loads with four bottles shows them without a glow', () => {
    const fresh = new HudModel();
    const four = status((s) => s.bottles.push({ state: 'ready', fill01: 1, iconId: 'bottle', secondsLeft: 0 }));
    // a view of its own: the shared one has already shown three
    const other = document.createElement('div');
    document.body.appendChild(other);
    const loaded = new HudView(other, tr, sink);
    loaded.place(844, 390, { top: 0, right: 0, bottom: 0, left: 0 });
    loaded.update(fresh.update(four, 1 / 60));
    expect(all(other, 'hud-bottle-')).toHaveLength(4);
    expect(all(other, 'hud-bottle-').map((e) => e.dataset['gain'])).toEqual(['0', '0', '0', '0']);
    loaded.dispose();
  });

  it('a fourth bottle and an extra life segment appear when the numbers grow', () => {
    show(status((s) => s.bottles.push({ state: 'ready', fill01: 1, iconId: 'bottle', secondsLeft: 0 })));
    expect(all(host, 'hud-bottle-')).toHaveLength(4);
    show(status((s) => ((s.life.max = 6), (s.life.current = 6))));
    expect(all(host, 'hud-life-seg-')).toHaveLength(6);
    expect(q(host, 'hud-life').getAttribute('aria-valuemax')).toBe('6');
  });

  it('writes to the DOM only when something changed: a second identical frame mutates nothing', () => {
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((r) => records.push(...r));
    observer.observe(host, { attributes: true, childList: true, subtree: true, characterData: true });
    show(status((s) => (s.magic.current = 60)));
    show(status((s) => (s.magic.current = 60)), 5); // what was just spent has drained from the trail: the picture is at rest
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
    expect(q(host, 'hud-card').getAttribute('aria-label')).toBe('No ability equipped');
    show(status((s) => (s.bottles[2] = { state: 'recharging', fill01: 0.1, iconId: 'bottle', secondsLeft: 0 })));
    expect(q(host, 'hud-bottle-2').getAttribute('aria-label')).toBe('Bottle 3: recharging');
    expect(q(host, 'hud-bottle-2').getAttribute('aria-disabled')).toBe('true');
    expect(q(host, 'hud-bottle-0').getAttribute('aria-disabled')).toBe('false');
  });

  it('a finger on a bottle icon reaches the touch source with the slot, and lifting lets go', () => {
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
    const l = computeHudLayout(844, 390, { top: 0, right: 47, bottom: 21, left: 47 }, 1, 5, 3);
    expect(Number.parseFloat(block.style.left)).toBeCloseTo(l.x, 6);
    expect(Number.parseFloat(block.style.top)).toBeCloseTo(l.y, 6);
    expect(block.style.transform).toBe(`scale(${l.scale})`);
    expect(Number.parseFloat(block.style.left)).toBeGreaterThanOrEqual(47);
    view.place(1280, 720, { top: 24, right: 0, bottom: 0, left: 0 });
    expect(Number.parseFloat(block.style.top)).toBeGreaterThanOrEqual(24);
  });

  it('honours reduced motion: its animations switch off', () => {
    expect(document.getElementById('troid-hud-style')?.textContent).toContain('prefers-reduced-motion');
  });

  it('dispose removes the HUD and its listeners', () => {
    const v = q(host, 'hud-bottle-0');
    view.dispose();
    v.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, bubbles: true }));
    expect(downs).toEqual([]);
    expect(host.querySelector('[data-testid="hud"]')).toBeNull();
  });

  // ---------------------------------------------------------------------------------------------- docs/PROMPT14-LOG.md: what the HUD now says of the real state

  const equip = (s: PlayerStatus, over: Partial<PlayerStatus['card']> = {}): void => {
    s.card = { equipped: true, id: 'card_spirit_bolt', nameKey: 'card.spiritBolt.name', iconId: 'spirit_bolt', state: 'ready', cooldown01: 0, cost: 30, ...over };
  };
  const text = (id: string): string => q(host, id).textContent ?? '';

  it('the power shows what it costs and the magic bar marks where that falls; the mark is bright while the magic reaches it and faint when it does not', () => {
    show(status((s) => equip(s)));
    expect(text('hud-card-cost')).toBe('30');
    expect(q(host, 'hud-card-cost').dataset['on']).toBe('1');
    expect(q(host, 'hud-magic-cost').dataset['on']).toBe('1');
    expect(q(host, 'hud-magic-cost').style.left).toBe('30.00%');
    expect(q(host, 'hud-magic').dataset['afford']).toBe('1');
    expect(q(host, 'hud-card').dataset['afford']).toBe('1');
    show(status((s) => (equip(s, { state: 'noMagic' }), (s.magic.current = 20))));
    expect(q(host, 'hud-magic').dataset['afford']).toBe('0');
    expect(q(host, 'hud-card').dataset['afford']).toBe('0');
    expect(text('hud-card-cost'), 'the number does not change: the cost is the cost').toBe('30');
  });

  it('with no power in the slot there is no cost, no mark on the bar and no key: nothing to pay, nothing to press', () => {
    view.setGlyphs({ ability: 'K' });
    show(status());
    expect([text('hud-card-cost'), text('hud-card-key')]).toEqual(['', '']);
    expect([q(host, 'hud-card-cost').dataset['on'], q(host, 'hud-card-key').dataset['on'], q(host, 'hud-magic-cost').dataset['on']]).toEqual(['0', '0', '0']);
  });

  it('the key (or button) of the power is the one of the device in use, shown only with a power in the slot, and an empty label hides it (a touch screen has the buttons themselves)', () => {
    show(status((s) => equip(s)));
    expect(q(host, 'hud-card-key').dataset['on'], 'no device label yet').toBe('0');
    view.setGlyphs({ ability: 'K' });
    show(status((s) => equip(s)));
    expect(text('hud-card-key')).toBe('K');
    expect(q(host, 'hud-card-key').dataset['on']).toBe('1');
    view.setGlyphs({ ability: 'Y' });
    show(status((s) => equip(s)));
    expect(text('hud-card-key')).toBe('Y');
    view.setGlyphs({ ability: '' });
    show(status((s) => equip(s)));
    expect(q(host, 'hud-card-key').dataset['on']).toBe('0');
    view.setGlyphs({ ability: 'K' });
    show(status());
    expect(q(host, 'hud-card-key').dataset['on'], 'the power was taken off: the key goes with it').toBe('0');
  });

  it('the bottle that recharges says how many seconds are left; a ready one and one that only waits its turn say nothing', () => {
    show(
      status((s) => {
        s.bottles[0] = { state: 'recharging', fill01: 0.3, iconId: 'bottle', secondsLeft: 42 };
        s.bottles[1] = { state: 'empty', fill01: 0, iconId: 'bottle', secondsLeft: 0 };
      }),
    );
    expect([text('hud-time-0'), text('hud-time-1'), text('hud-time-2')]).toEqual(['42', '', '']);
    expect(q(host, 'hud-time-0').dataset['on']).toBe('1');
    expect(q(host, 'hud-time-2').dataset['on']).toBe('0');
    show(status());
    expect([text('hud-time-0'), q(host, 'hud-time-0').dataset['on']]).toEqual(['', '0']);
  });

  it('the HUD draws no WORDS even with everything on: what is written on it is numbers and the label of a key, the same in every language', () => {
    view.setGlyphs({ ability: 'K' });
    const busy = (s: PlayerStatus): void => {
      equip(s);
      s.bottles[0] = { state: 'recharging', fill01: 0.5, iconId: 'bottle', secondsLeft: 30 };
    };
    show(status(busy));
    const written = (): string[] => [...host.querySelectorAll<HTMLElement>('*')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '')).map((e) => `${e.dataset['testid']}=${e.textContent}`);
    const before = written();
    expect(before).toEqual(['hud-card-key=K', 'hud-card-cost=30', 'hud-time-0=30']);
    for (const t of before) expect(t.split('=')[1], t).toMatch(/^[0-9A-Z↑↓←→]{1,6}$/);
    tr.setLocale('en');
    show(status(busy));
    expect(written(), 'switching the language changes none of them').toEqual(before);
    expect(host.querySelectorAll('[data-glyph], [data-on]').length).toBeGreaterThan(0);
    for (const chip of host.querySelectorAll('[data-testid="hud-card-key"], [data-testid="hud-card-cost"], [data-testid^="hud-time-"]')) expect(chip.getAttribute('aria-hidden'), 'the accessible name of what it sits on says it in words').toBe('true');
  });

  it('the guard line is the i-frames of a blow: full when it lands, draining, gone at 0 — and the life glows cyan while it lasts', () => {
    const guard = q(host, 'hud-guard');
    expect(guard.style.opacity).toBe('0');
    show(status((s) => (s.life.guard01 = 1)));
    expect(guard.style.transform).toBe('scaleX(1)');
    expect(guard.style.opacity).toBe('1');
    expect(q(host, 'hud-life').dataset['guard']).toBe('1');
    show(status((s) => (s.life.guard01 = 0.5)));
    expect(guard.style.transform).toBe('scaleX(0.5)');
    show(status((s) => (s.life.guard01 = 0)));
    expect([guard.style.transform, guard.style.opacity, q(host, 'hud-life').dataset['guard']]).toEqual(['scaleX(0)', '0', '0']);
  });

  it('a segment that comes back is crossed by a wave of light, and the wave is gone when it has run', () => {
    show(status((s) => (s.life.current = 2)));
    show(status((s) => (s.life.current = 4)));
    const wave = (i: number): HTMLElement => q(host, `hud-life-seg-${i}`).querySelector('.hud-seg-heal') as HTMLElement;
    expect(Number.parseFloat(wave(2).style.opacity)).toBeGreaterThan(0.5);
    expect(Number.parseFloat(wave(0).style.opacity || '0'), 'a segment that never left has none').toBe(0);
    show(status((s) => (s.life.current = 4)), 3);
    expect(Number.parseFloat(wave(2).style.opacity)).toBe(0);
  });

  it('what was just spent lingers on the magic bar as a trail that is never behind the bar and drains away; the bar itself is where it is', () => {
    show(status());
    show(status((s) => (s.magic.current = 40)));
    expect(q(host, 'hud-magic-fill').style.transform).toBe('scaleX(0.4)');
    expect(q(host, 'hud-magic-trail').style.transform).toBe('scaleX(1)');
    show(status((s) => (s.magic.current = 40)), 5);
    expect(q(host, 'hud-magic-trail').style.transform).toBe('scaleX(0.4)');
  });

  it('the wait after a spend looks different from the regeneration', () => {
    show(status((s) => ((s.magic.current = 40), (s.magic.regenerating = false))));
    expect(q(host, 'hud-magic').dataset['wait']).toBe('1');
    show(status((s) => ((s.magic.current = 40), (s.magic.regenerating = true))));
    expect(q(host, 'hud-magic').dataset['wait']).toBe('0');
    expect(q(host, 'hud-magic').dataset['regen']).toBe('1');
  });

  it('with fewer flashes the lost segment does not flash white: its ghost is softer and the flash is left out', () => {
    show(status());
    show(status((s) => (s.life.current = 4)));
    const ghost = q(host, 'hud-life-seg-4').querySelector('div') as HTMLElement;
    const normal = Number.parseFloat(ghost.style.opacity);
    expect(normal).toBeGreaterThanOrEqual(0.85);
    view.dispose();
    document.head.innerHTML = '';
    model = new HudModel();
    view = new HudView(host, tr, sink);
    view.place(844, 390, { top: 0, right: 0, bottom: 0, left: 0 });
    view.setCalm(true);
    expect(host.querySelector('.troid-hud')?.getAttribute('data-calm')).toBe('1');
    show(status());
    show(status((s) => (s.life.current = 4)));
    const calm = Number.parseFloat((q(host, 'hud-life-seg-4').querySelector('div') as HTMLElement).style.opacity);
    expect(calm).toBeLessThan(0.35);
    expect(calm).toBeGreaterThan(0);
  });

  it('the size of the HUD follows the setting, inside the same safe area', () => {
    const base = view.current.scale;
    view.setSize(1.2);
    expect(view.current.scale).toBeCloseTo(base * 1.2, 6);
    expect(view.current.x).toBeGreaterThanOrEqual(0);
    view.setSize(1);
    expect(view.current.scale).toBeCloseTo(base, 6);
  });
});

