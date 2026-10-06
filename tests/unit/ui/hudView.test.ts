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
  s.bottles = [0, 1, 2].map(() => ({ state: 'ready' as const, fill01: 1, iconId: 'bottle' }));
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
        s.bottles[0] = { state: 'recharging', fill01: 0.25, iconId: 'bottle' };
        s.bottles[1] = { state: 'empty', fill01: 0, iconId: 'bottle' };
      }),
    );
    expect(all(host, 'hud-bottle-').map((e) => e.dataset['state'])).toEqual(['recharging', 'empty', 'ready']);
    const liquids = all(host, 'hud-bottle-').map((e) => (e.querySelector('.hud-liquid') as HTMLElement).style.transform);
    expect(liquids).toEqual(['scaleY(0.25)', 'scaleY(0)', 'scaleY(1)']);
  });

  it('drinking pops the vial for a moment', () => {
    model.bottleUsed(0);
    show(status((s) => (s.bottles[0] = { state: 'recharging', fill01: 0, iconId: 'bottle' })), 0);
    expect(q(host, 'hud-bottle-0').style.transform).toContain('scale(1.3');
    for (let i = 0; i < 30; i++) show(status((s) => (s.bottles[0] = { state: 'recharging', fill01: 0, iconId: 'bottle' })));
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

  it('a fourth bottle and an extra life segment appear when the numbers grow', () => {
    show(status((s) => s.bottles.push({ state: 'ready', fill01: 1, iconId: 'bottle' })));
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
    show(status((s) => (s.bottles[2] = { state: 'recharging', fill01: 0.1, iconId: 'bottle' })));
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
});
