// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOGS, createTranslator } from '@/i18n';
import { PauseMenu } from '@/ui/settings/PauseMenu';
import { PAD_FIRST, PAD_SETTLE, type PadReading } from '@/ui/settings/padNav';
import { pauseProbe, type PauseProbe } from '../../helpers/pauseHost';

/**
 * THE PAD IN THE PAUSE MENU (docs/PROMPT20-LOG.md): the stick or the D-pad goes to the nearest control in a direction, A presses what has the focus, B steps back, the map takes the stick as its own, a slider takes
 * left and right — and none of it before the menu has settled, nor from any device but the pad. happy-dom lays nothing out, so the boxes the menu asks for are given here: the column on the right, the controls of a
 * screen in a list on the left, the map as one big box.
 */
const q = (root: ParentNode, id: string): HTMLElement => root.querySelector(`[data-testid="${id}"]`) as HTMLElement;

const STILL: PadReading = { move: { x: 0, y: 0 }, device: 'gamepad', jumpPressed: false, dashPressed: false, attackPressed: false, abilityPressed: false };
const frame = (over: Partial<Omit<PadReading, 'move'>> & { move?: { x: number; y: number } } = {}): PadReading => ({ ...STILL, ...over });
const stick = (x: number, y: number): PadReading => frame({ move: { x, y } });

describe('the pad in the pause menu', () => {
  let parent: HTMLDivElement;
  let menu: PauseMenu;
  let probe: PauseProbe;
  const tr = createTranslator(CATALOGS, 'es');
  /** The pad's own clock: every call is made at a time the test chose. */
  let t = 0;

  /** Boxes by where a control is in the menu (see the header). */
  const boxOf = (el: Element): DOMRect => {
    const rect = (l: number, tp: number, w: number, h: number): DOMRect => ({ left: l, top: tp, right: l + w, bottom: tp + h, x: l, y: tp, width: w, height: h, toJSON: () => ({}) });
    if (el.closest('.pm-side')) {
      const entries = [...menu.root.querySelectorAll('.pm-entry')].filter((e) => !(e as HTMLElement).hidden);
      return rect(300, entries.indexOf(el) * 50, 120, 40);
    }
    if (el === menu.mapView.root) return rect(0, 0, 280, 300);
    const stage = [...(el.closest('.troid-settings') ?? menu.root).querySelectorAll('button, input[type="range"]')].filter((e) => !(e as HTMLElement).hidden && !e.closest('[hidden]'));
    return rect(0, stage.indexOf(el) * 60, 200, 40);
  };

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return boxOf(this);
    });
    parent = document.createElement('div');
    document.body.appendChild(parent);
    tr.setLocale('es');
    probe = pauseProbe();
    menu = new PauseMenu(parent, tr, probe.host);
    menu.mapView.resize(280, 300);
    t = 1000;
  });
  afterEach(() => {
    menu.dispose();
    vi.restoreAllMocks();
    tr.setLocale('es');
  });

  /** Opens the menu (on a screen) and lets it settle: the first call after it opens only starts the wait. */
  const openAndSettle = (screen: Parameters<PauseMenu['open']>[0] = 'main'): void => {
    menu.open(screen);
    menu.pad(STILL, t);
    t += PAD_SETTLE;
  };
  /** One look at the pad: what it reads, now; time moves on a little. */
  const pad = (f: PadReading): 'back' | null => {
    const out = menu.pad(f, t);
    t += 20;
    return out;
  };
  /** A direction pressed and let go. */
  const tap = (x: number, y: number): 'back' | null => {
    const out = pad(stick(x, y));
    pad(STILL);
    return out;
  };
  const press = (button: 'jumpPressed' | 'dashPressed' | 'attackPressed' | 'abilityPressed'): 'back' | null => pad(frame({ [button]: true }));
  const focused = (): string => (document.activeElement as HTMLElement | null)?.dataset['testid'] ?? (document.activeElement as HTMLElement | null)?.className ?? '';

  it('hears only the pad: a frame from the keyboard or a finger changes nothing, and answers nothing', () => {
    openAndSettle();
    const before = document.activeElement;
    for (const device of ['keyboard', 'touch']) {
      expect(menu.pad(frame({ device, move: { x: 0, y: -1 }, dashPressed: true, jumpPressed: true }), t)).toBeNull();
      t += 20;
    }
    expect(document.activeElement).toBe(before);
    expect(menu.root.dataset['pad']).toBeUndefined();
    expect(probe.calls).not.toContain('resume');
  });

  it('is deaf in the first moments after the menu opens: a press made for the game does not press the first thing here — and a direction held as it opened is no step when it starts to listen', () => {
    menu.open();
    expect(menu.pad(frame({ jumpPressed: true, move: { x: 0, y: -1 } }), t)).toBeNull(); // the first look: it only starts the wait
    expect(menu.pad(frame({ jumpPressed: true, move: { x: 0, y: -1 } }), t + PAD_SETTLE - 1)).toBeNull();
    expect(probe.calls).not.toContain('resume');
    expect(focused()).toBe('pause-resume');
    // the stick is still held down when the wait is over: that is the direction it was already in, not a new one
    menu.pad(stick(0, -1), t + PAD_SETTLE);
    expect(focused(), 'no step for a direction that was held already').toBe('pause-resume');
    menu.pad(STILL, t + PAD_SETTLE + 10);
    menu.pad(stick(0, -1), t + PAD_SETTLE + 20);
    expect(focused()).toBe('pause-map');
  });

  it('opening again waits again', () => {
    openAndSettle();
    menu.close();
    menu.open();
    expect(menu.pad(frame({ dashPressed: true }), t)).toBeNull();
    expect(menu.pad(frame({ dashPressed: true }), t + PAD_SETTLE - 1)).toBeNull();
    expect(menu.pad(frame({ dashPressed: true }), t + PAD_SETTLE)).toBe('back');
  });

  it('down and up go through the column of options, one at a time, and stop at its ends', () => {
    openAndSettle();
    expect(focused()).toBe('pause-resume');
    tap(0, -1);
    expect(focused()).toBe('pause-map');
    tap(0, -1);
    expect(focused()).toBe('pause-controls');
    tap(0, 1);
    expect(focused()).toBe('pause-map');
    tap(0, 1);
    tap(0, 1);
    expect(focused(), 'there is nothing above Continue').toBe('pause-resume');
    for (let i = 0; i < 9; i++) tap(0, -1);
    expect(focused(), 'and nothing below Profile').toBe('pause-profile');
  });

  it('a direction that is held repeats, at a steady pace, and stops when it is let go', () => {
    openAndSettle();
    pad(stick(0, -1));
    expect(focused()).toBe('pause-map');
    menu.pad(stick(0, -1), t + PAD_FIRST - 30);
    expect(focused(), 'not yet').toBe('pause-map');
    menu.pad(stick(0, -1), t + PAD_FIRST + 30);
    expect(focused(), 'and then it repeats').toBe('pause-controls');
    menu.pad(STILL, t + PAD_FIRST + 40);
    menu.pad(stick(0, -1), t + PAD_FIRST + 5000);
    expect(focused(), 'a new push is a first step, one step').toBe('pause-sound');
  });

  it('A presses what has the focus: an entry opens its screen, Continue asks the host to resume', () => {
    openAndSettle();
    tap(0, -1);
    tap(0, -1); // Controls
    press('jumpPressed');
    expect(menu.screen).toBe('controls');
    menu.back();
    openAndSettle();
    menu.close();
    openAndSettle();
    press('jumpPressed'); // on Continue
    expect(probe.calls).toContain('resume');
  });

  it('on the main screen left leads to the map, the stick moves it, A centres it on the hero, X and Y bring it closer and farther', () => {
    openAndSettle();
    tap(-1, 0);
    expect(document.activeElement).toBe(menu.mapView.root);
    const start = { ...menu.mapView.view };
    tap(-1, 0);
    expect(menu.mapView.view.x, 'the stick moved the map (and the focus stayed on it)').not.toBe(start.x);
    expect(document.activeElement).toBe(menu.mapView.root);
    expect(menu.mapView.root.dataset['moved']).toBe('1');
    press('jumpPressed');
    expect(menu.mapView.root.dataset['moved'], 'A put it back where it opens').toBe('0');
    const scale = menu.mapView.view.scale;
    press('attackPressed');
    expect(menu.mapView.view.scale, 'X: closer').toBeGreaterThan(scale);
    press('abilityPressed');
    press('abilityPressed');
    expect(menu.mapView.view.scale, 'Y: farther').toBeLessThan(scale);
  });

  it('B from the map goes to the column, B from the column asks to go back — to the game, from the main screen', () => {
    openAndSettle();
    tap(-1, 0);
    expect(press('dashPressed'), 'from the map the column is one step back').toBeNull();
    expect(focused()).toBe('pause-resume');
    expect(press('dashPressed')).toBe('back');
  });

  it('…and the column it goes back to is the entry the pad left it from', () => {
    openAndSettle();
    tap(0, -1);
    tap(0, -1); // Controls
    tap(-1, 0); // the map
    expect(document.activeElement).toBe(menu.mapView.root);
    press('dashPressed');
    expect(focused()).toBe('pause-controls');
  });

  it('a screen of the menu: the pad crosses its controls, and across to the column and back; B asks to go back, to the map', () => {
    openAndSettle();
    tap(0, -1);
    tap(0, -1);
    tap(0, -1); // Sound
    press('jumpPressed');
    expect(menu.screen).toBe('sound');
    const sliders = [...menu.root.querySelectorAll('[data-testid="sound-screen"] input[type="range"], [data-testid^="settings-"][type="range"]')];
    expect(sliders.length).toBeGreaterThan(0);
    // from the entry that is open, left leads into the screen (the controls are on that side)
    tap(-1, 0);
    expect((document.activeElement as HTMLElement).closest('.troid-settings')).not.toBeNull();
    // and right leads back to the column
    tap(1, 0);
    expect((document.activeElement as HTMLElement).closest('.pm-side')).not.toBeNull();
    expect(press('dashPressed')).toBe('back');
  });

  it('on a slider left lowers and right raises it, and says so the way a hand does (the host hears it, and the menu\'s sound is made)', () => {
    openAndSettle('sound');
    const master = q(menu.root, 'settings-volume') as HTMLInputElement;
    expect(master).not.toBeNull();
    master.focus();
    const before = Number(master.value);
    probe.calls.length = 0;
    probe.sounds.length = 0;
    tap(1, 0);
    expect(Number(master.value)).toBeGreaterThanOrEqual(before);
    tap(-1, 0);
    tap(-1, 0);
    expect(Number(master.value)).toBeLessThan(before);
    expect(probe.calls.some((c) => c.startsWith('volume:master:'))).toBe(true);
    expect(probe.sounds).toContain('slider');
    // and up or down leaves it
    tap(0, -1);
    expect(document.activeElement).not.toBe(master);
  });

  it('a button pressed with A is pressed once: a switch asks the host for the other state, one time', () => {
    openAndSettle('settings');
    const flashes = q(menu.root, 'settings-flashes');
    flashes.focus();
    probe.calls.length = 0;
    probe.sounds.length = 0;
    press('jumpPressed');
    expect(probe.calls.filter((c) => c.startsWith('access:'))).toEqual(['access:{"reduceFlashes":true}']);
    expect(probe.sounds, 'and the menu\'s own sound is made once').toHaveLength(1);
  });

  it('with nothing focused the first step brings the focus to the column; the pad never presses what it has not shown', () => {
    openAndSettle();
    (document.activeElement as HTMLElement).blur();
    expect(focused()).not.toBe('pause-resume');
    press('jumpPressed');
    expect(probe.calls, 'A did not press anything: it found the focus').not.toContain('resume');
    expect(focused()).toBe('pause-resume');
    (document.activeElement as HTMLElement).blur();
    tap(0, -1);
    expect(focused()).toBe('pause-resume');
  });

  it('the closing of the adventure: the ways on do not answer in its first instants — neither A nor B', () => {
    probe.clock.now = 1000;
    menu.open('ending');
    menu.pad(STILL, t);
    t += PAD_SETTLE; // the menu has settled…
    probe.clock.now = 1000 + 100; // …but the closing, which opened with it, has not (700 ms)
    expect(press('jumpPressed')).toBeNull();
    expect(probe.calls, 'A on "Keep exploring" is ignored').not.toContain('resume');
    expect(press('dashPressed'), 'B is ignored').toBeNull();
    probe.clock.now = 1000 + 800;
    expect(press('dashPressed'), 'later it asks to go back (which is to keep exploring)').toBe('back');
    press('jumpPressed');
    expect(probe.calls).toContain('resume');
  });

  it('on the closing of the adventure down and up move between the ways on, and past them the credits are scrolled by hand', () => {
    menu.open('ending');
    menu.pad(STILL, t);
    t += PAD_SETTLE;
    probe.clock.now = 5000;
    expect(focused()).toBe('ending-continue');
    tap(0, -1);
    expect(focused()).toBe('ending-saves');
    const body = q(menu.root, 'ending-body');
    Object.defineProperty(body, 'clientHeight', { configurable: true, value: 200 });
    body.scrollTop = 0;
    tap(0, -1); // nothing below the last way on: the credits move instead
    expect(body.scrollTop).toBeGreaterThan(0);
    expect(focused(), 'the focus stayed').toBe('ending-saves');
    const down = body.scrollTop;
    tap(0, 1); // up goes back to the first way on…
    expect(focused()).toBe('ending-continue');
    expect(body.scrollTop).toBe(down);
    tap(0, 1); // …and past it the credits go back up
    expect(body.scrollTop).toBeLessThan(down);
  });

  it('while the editor of the touch buttons has the screen only B is heard (it gives the screen up)', () => {
    openAndSettle();
    menu.setAside(true);
    const at = document.activeElement;
    tap(0, -1);
    expect(document.activeElement).toBe(at);
    expect(press('jumpPressed')).toBeNull();
    expect(probe.calls).not.toContain('resume');
    expect(press('dashPressed')).toBe('back');
  });

  it('the focus is drawn for the pad until a finger or a mouse touches the menu again, and the menu closing forgets it', () => {
    openAndSettle();
    expect(menu.root.dataset['pad']).toBeUndefined();
    tap(0, -1);
    expect(menu.root.dataset['pad']).toBe('1');
    menu.root.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(menu.root.dataset['pad']).toBeUndefined();
    tap(0, -1);
    expect(menu.root.dataset['pad']).toBe('1');
    menu.close();
    expect(menu.root.dataset['pad']).toBeUndefined();
  });

  it('a menu that is closed hears nothing, and a hidden entry is never a way (a playground has no saved games)', () => {
    expect(menu.pad(frame({ dashPressed: true }), t)).toBeNull();
    menu.dispose();
    probe = pauseProbe({ playground: true });
    menu = new PauseMenu(parent, tr, probe.host);
    openAndSettle();
    for (let i = 0; i < 9; i++) tap(0, -1);
    expect(focused(), 'the last entry there is, not one that is hidden').toBe('pause-settings');
  });
});
