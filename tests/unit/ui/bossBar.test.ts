// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CATALOGS, createTranslator } from '@/i18n';
import { APPEAR_SECONDS, BossBarModel, FLASH_SECONDS, GHOST_RATE, LINGER_SECONDS } from '@/ui/hud/BossBarModel';
import { BossBarView } from '@/ui/hud/BossBarView';

/**
 * The boss's bar (docs/PROMPT6-LOG.md S29): a pure model the simulation's events move — it appears when the guardian wakes, follows its health with
 * the white trail of the last blow, burns in the second phase, empties when the guardian falls and is gone with the room — and the DOM that draws it:
 * the name, from the catalogs, and a violet bar that never catches a finger.
 */
const FRAME = 1 / 60;
const run = (m: BossBarModel, seconds: number): void => {
  for (let t = 0; t < seconds; t += FRAME) m.update(FRAME);
};

describe('BossBarModel', () => {
  it('shows nothing before a fight, and a blow before it is ignored', () => {
    const m = new BossBarModel();
    expect(m.update(1).visible).toBe(false);
    m.hit(0.5);
    m.phase();
    m.end();
    expect(m.state).toMatchObject({ visible: false, fraction: 1, enraged: false });
  });

  it('a boss that wakes: the bar fades in over half a second, full, with the name', () => {
    const m = new BossBarModel();
    m.start('enemy.warden.name');
    expect(m.state).toMatchObject({ visible: true, appear: 0, fraction: 1, ghost: 1, nameKey: 'enemy.warden.name', enraged: false });
    run(m, APPEAR_SECONDS / 2);
    expect(m.state.appear).toBeCloseTo(0.5, 1);
    run(m, APPEAR_SECONDS);
    expect(m.state.appear).toBe(1);
  });

  it('a game that begins the fight with the boss hurt shows what is left of it', () => {
    const m = new BossBarModel();
    m.start('k', 0.4);
    expect([m.state.fraction, m.state.ghost]).toEqual([0.4, 0.4]);
    m.start('k', 7);
    expect(m.state.fraction).toBe(1);
  });

  it('a blow lowers the bar at once, flashes it for 0.18 s and leaves a white trail that eases down after it', () => {
    const m = new BossBarModel();
    m.start('k');
    run(m, 1);
    m.hit(0.7);
    expect(m.state.fraction).toBe(0.7);
    expect(m.state.ghost).toBe(1);
    expect(m.state.flash).toBe(1);
    run(m, FLASH_SECONDS + FRAME);
    expect(m.state.flash).toBe(0);
    expect(m.state.ghost, 'it has not caught up yet').toBeGreaterThan(0.7);
    run(m, 0.3 / GHOST_RATE + 0.1);
    expect(m.state.ghost).toBe(0.7);
  });

  it('its health never leaves 0 … 1, and healing (a fraction going up) takes the trail with it', () => {
    const m = new BossBarModel();
    m.start('k');
    m.hit(-3);
    expect(m.state.fraction).toBe(0);
    m.hit(5);
    expect(m.state.fraction).toBe(1);
    m.update(FRAME);
    expect(m.state.ghost).toBe(1);
  });

  it('the second phase makes it burn, and a new fight puts it out again', () => {
    const m = new BossBarModel();
    m.start('k');
    m.phase();
    expect(m.state.enraged).toBe(true);
    m.start('k');
    expect(m.state.enraged).toBe(false);
  });

  it('a boss that falls: the bar empties, stays up for a moment and fades, and then there is nothing to draw', () => {
    const m = new BossBarModel();
    m.start('k');
    run(m, 1);
    m.end();
    expect(m.state.fraction).toBe(0);
    run(m, LINGER_SECONDS - 0.1);
    expect(m.state.appear, 'still there').toBe(1);
    run(m, 0.2 + APPEAR_SECONDS + 0.1);
    expect(m.state.appear).toBe(0);
    expect(m.state.visible).toBe(false);
  });

  it('leaving or rebuilding the room hides it at once', () => {
    const m = new BossBarModel();
    m.start('k');
    run(m, 1);
    m.hide();
    expect(m.state).toMatchObject({ visible: false, appear: 0 });
    run(m, 1);
    expect(m.state.visible).toBe(false);
  });

  it('a long frame (a tab that was hidden) finishes every transient at once and never goes backwards', () => {
    const m = new BossBarModel();
    m.start('k');
    m.hit(0.2);
    const s = m.update(30);
    expect(s.appear).toBe(1);
    expect(s.flash).toBe(0);
    expect(s.ghost).toBe(0.2);
    expect(m.update(-5).appear).toBe(1);
  });
});

describe('BossBarView', () => {
  let host: HTMLDivElement;
  let model: BossBarModel;
  let view: BossBarView;
  const tr = createTranslator(CATALOGS, 'es');
  const q = (id: string): HTMLElement => host.querySelector(`[data-testid="${id}"]`) as HTMLElement;
  const show = (dt = FRAME): void => view.update(model.update(dt));

  beforeEach(() => {
    document.body.innerHTML = '';
    host = document.createElement('div');
    document.body.appendChild(host);
    model = new BossBarModel();
    view = new BossBarView(host, tr);
  });
  afterEach(() => {
    view.dispose();
    tr.setLocale('es');
  });

  it('is built hidden, catches no finger and says nothing to a screen reader until a boss is there', () => {
    expect(q('boss-bar').style.display).toBe('none');
    expect(q('boss-bar').style.pointerEvents).toBe('none');
    expect(q('boss-bar').getAttribute('role')).toBe('progressbar');
    show();
    expect(q('boss-bar').style.display).toBe('none');
  });

  it('a boss that wakes shows its name — in the language of the player — and a full bar', () => {
    model.start('enemy.warden.name');
    for (let i = 0; i < 40; i++) show();
    expect(q('boss-bar').style.display).toBe('block');
    expect(q('boss-bar-name').textContent).toBe('Custodio de Tinta');
    expect(q('boss-bar').getAttribute('aria-label')).toBe('Custodio de Tinta');
    expect(q('boss-bar-fill').style.transform).toBe('scaleX(1)');
    expect(q('boss-bar').getAttribute('aria-valuenow')).toBe('100');
    tr.setLocale('en');
    show();
    expect(q('boss-bar-name').textContent).toBe('Ink Warden');
  });

  it('follows its health, with the white trail behind it', () => {
    model.start('enemy.warden.name');
    for (let i = 0; i < 40; i++) show();
    model.hit(0.5);
    show(0);
    expect(q('boss-bar-fill').style.transform).toBe('scaleX(0.5)');
    expect(q('boss-bar').getAttribute('aria-valuenow')).toBe('50');
    expect(q('boss-bar-ghost').style.transform).toBe('scaleX(1)');
    expect(Number(q('boss-bar-flash').style.opacity)).toBeGreaterThan(0.5);
    for (let i = 0; i < 120; i++) show();
    expect(q('boss-bar-ghost').style.transform).toBe('scaleX(0.5)');
    expect(q('boss-bar-flash').style.opacity).toBe('0');
  });

  it('burns in the second phase and is gone once the boss has fallen and the bar has faded', () => {
    model.start('enemy.warden.name');
    for (let i = 0; i < 40; i++) show();
    expect(q('boss-bar').dataset['enraged']).toBe('0');
    model.phase();
    show();
    expect(q('boss-bar').dataset['enraged']).toBe('1');
    model.end();
    for (let i = 0; i < 60 * 3; i++) show();
    expect(q('boss-bar').style.display).toBe('none');
  });

  it('writes to the DOM only when something changed: a second identical frame mutates nothing', () => {
    model.start('enemy.warden.name');
    for (let i = 0; i < 60; i++) show();
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((r) => records.push(...r));
    observer.observe(host, { attributes: true, childList: true, subtree: true, characterData: true });
    for (let i = 0; i < 20; i++) show();
    expect([...records, ...observer.takeRecords()]).toHaveLength(0);
    observer.disconnect();
  });

  it('hiding the room hides the bar, and dispose takes it out of the page', () => {
    model.start('enemy.warden.name');
    for (let i = 0; i < 40; i++) show();
    model.hide();
    show();
    expect(q('boss-bar').style.display).toBe('none');
    view.dispose();
    expect(host.querySelector('[data-testid="boss-bar"]')).toBeNull();
    view = new BossBarView(host, tr); // so afterEach has something to dispose
  });
});
