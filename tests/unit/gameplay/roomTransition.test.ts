// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Scheduler } from '@/core/scheduler';
import { DEFAULT_TRANSITION, RoomTransition, type TransitionHost, type TransitionSnapshot } from '@/gameplay/RoomTransition';
import { TransitionOverlay } from '@/ui/overlays/TransitionOverlay';
import { transitionOpacity } from '@/ui/overlays/transitionOverlayModel';

/**
 * The room transition as a state machine on its own (a fake host that only records), and what the overlay does with its snapshot.
 * The world it runs inside is tested in tests/integration/transitions.test.ts.
 */
function setup(def = { fadeOut: 4, hold: 2, fadeIn: 3 }) {
  const scheduler = new Scheduler();
  const log: string[] = [];
  const host: TransitionHost = {
    scheduler,
    swap: (to, exit) => void log.push(`swap ${to.room}:${to.entry} via ${exit}`),
    emitStarted: (from, exit, to, ticks) => void log.push(`started ${from}/${exit} → ${to.room}:${to.entry} (${ticks})`),
    emitFadeOut: (t) => void log.push(`fadeOut ${t}`),
    emitFadeIn: (t) => void log.push(`fadeIn ${t}`),
    emitFinished: (to) => void log.push(`finished ${to.room}:${to.entry}`),
    emitCancelled: (r) => void log.push(`cancelled ${r}`),
  };
  const t = new RoomTransition(host, def);
  const tick = (n = 1): void => {
    for (let i = 0; i < n; i++) scheduler.tick();
  };
  return { t, scheduler, log, tick };
}
const to = { room: 'b', entry: 'west' };

describe('RoomTransition', () => {
  it('is idle until begun, and begin starts the fade out', () => {
    const { t, log } = setup();
    expect(t.active).toBe(false);
    expect(t.phase).toBe('none');
    expect(t.begin('a', 'east', to)).toBe(true);
    expect(t.active).toBe(true);
    expect(t.phase).toBe('fadeOut');
    expect(log).toEqual(['started a/east → b:west (9)', 'fadeOut 4']);
  });

  it('runs fade out → swap → hold → fade in → finished, each after its length, and the swap happens exactly once, at the end of the fade out', () => {
    const { t, log, tick } = setup();
    t.begin('a', 'east', to);
    tick(3);
    expect(t.phase).toBe('fadeOut');
    expect(log).not.toContain('swap b:west via east');
    tick(1);
    expect(t.phase).toBe('hold');
    expect(log[log.length - 1]).toBe('swap b:west via east');
    tick(1);
    expect(t.phase).toBe('hold');
    tick(1);
    expect(t.phase).toBe('fadeIn');
    expect(log[log.length - 1]).toBe('fadeIn 3');
    tick(2);
    expect(t.phase).toBe('fadeIn');
    tick(1);
    expect(t.phase).toBe('none');
    expect(t.active).toBe(false);
    expect(log).toEqual(['started a/east → b:west (9)', 'fadeOut 4', 'swap b:west via east', 'fadeIn 3', 'finished b:west']);
  });

  it('refuses a second begin while one runs, whatever phase it is in, and accepts one when it is over', () => {
    const { t, log, tick } = setup();
    expect(t.begin('a', 'east', to)).toBe(true);
    for (let i = 0; i < 9; i++) {
      expect(t.begin('a', 'x', { room: 'c', entry: 'e' }), `at tick ${i}`).toBe(false);
      tick();
    }
    expect(t.active).toBe(false);
    expect(log.filter((l) => l.startsWith('started'))).toHaveLength(1);
    expect(t.begin('b', 'west', { room: 'a', entry: 'east' })).toBe(true);
  });

  it('cancel stops it where it is: no swap or fade in follows, the host hears why, and it can start again', () => {
    const { t, log, tick, scheduler } = setup();
    t.begin('a', 'east', to);
    tick(2);
    t.cancel('death');
    expect(t.active).toBe(false);
    expect(log[log.length - 1]).toBe('cancelled death');
    tick(20);
    expect(log.some((l) => l.startsWith('swap') || l.startsWith('finished'))).toBe(false);
    expect(scheduler.pending).toBe(0);
    expect(t.begin('a', 'east', to)).toBe(true);
  });

  it('cancel during the black or the fade in also leaves nothing pending', () => {
    for (const ticks of [5, 7, 8]) {
      const { t, tick, scheduler, log } = setup();
      t.begin('a', 'east', to);
      tick(ticks);
      expect(t.active, `after ${ticks}`).toBe(true);
      t.cancel('reload');
      expect(scheduler.pending).toBe(0);
      expect(log[log.length - 1]).toBe('cancelled reload');
    }
  });

  it('cancelling an idle transition says nothing', () => {
    const { t, log } = setup();
    t.cancel('death');
    expect(log).toEqual([]);
  });

  it('snapshot: the phase, the ticks spent in it and its length', () => {
    const { t, tick } = setup();
    expect(t.snapshot()).toEqual({ phase: 'none', ticks: 0, length: 0 });
    t.begin('a', 'east', to);
    expect(t.snapshot()).toEqual({ phase: 'fadeOut', ticks: 0, length: 4 });
    tick(3);
    expect(t.snapshot()).toEqual({ phase: 'fadeOut', ticks: 3, length: 4 });
    tick(1);
    expect(t.snapshot()).toEqual({ phase: 'hold', ticks: 0, length: 2 });
    const out: TransitionSnapshot = { phase: 'none', ticks: 9, length: 9 };
    expect(t.snapshot(out)).toBe(out); // written into the object it is given: no allocation per frame
    expect(out.phase).toBe('hold');
  });

  it('zero-length phases do not hang or skip the swap (a timer is never due in the tick that made it)', () => {
    const { t, log, tick } = setup({ fadeOut: 0, hold: 0, fadeIn: 0 });
    t.begin('a', 'east', to);
    tick(5);
    expect(t.active).toBe(false);
    expect(log).toContain('swap b:west via east');
    expect(log[log.length - 1]).toBe('finished b:west');
  });

  it('the default definition is a quick fade: about half a second in all', () => {
    const { fadeOut, hold, fadeIn } = DEFAULT_TRANSITION;
    expect(fadeOut + hold + fadeIn).toBeGreaterThanOrEqual(24);
    expect(fadeOut + hold + fadeIn).toBeLessThanOrEqual(45);
  });
});

describe('transitionOpacity (a pure function of the snapshot)', () => {
  const at = (phase: TransitionSnapshot['phase'], ticks: number, length: number): number => transitionOpacity({ phase, ticks, length });

  it('draws nothing when there is no transition', () => {
    expect(at('none', 0, 0)).toBe(0);
  });

  it('fades to black on the way out, monotonically, from 0 to 1', () => {
    expect(at('fadeOut', 0, 12)).toBe(0);
    expect(at('fadeOut', 12, 12)).toBe(1);
    let prev = -1;
    for (let t = 0; t <= 12; t++) {
      const o = at('fadeOut', t, 12);
      expect(o).toBeGreaterThanOrEqual(prev);
      prev = o;
    }
    expect(at('fadeOut', 6, 12)).toBeCloseTo(0.5, 5);
  });

  it('is fully black while the next room is built, and fades back in from 1 to 0', () => {
    expect(at('hold', 3, 6)).toBe(1);
    expect(at('fadeIn', 0, 14)).toBe(1);
    expect(at('fadeIn', 14, 14)).toBe(0);
    let prev = 2;
    for (let t = 0; t <= 14; t++) {
      const o = at('fadeIn', t, 14);
      expect(o).toBeLessThanOrEqual(prev);
      prev = o;
    }
  });

  it('survives a zero-length phase', () => {
    expect(() => at('hold', 0, 0)).not.toThrow();
    expect(at('fadeOut', 0, 0)).toBe(1);
  });
});

describe('TransitionOverlay (DOM)', () => {
  const snap = (phase: TransitionSnapshot['phase'], ticks: number, length: number): TransitionSnapshot => ({ phase, ticks, length });

  it('is hidden when idle and costs nothing: no text, no pointer events, under the defeat overlay and over the HUD', () => {
    const host = document.createElement('div');
    const o = new TransitionOverlay(host);
    expect(o.root.parentElement).toBe(host);
    expect(o.root.style.display).toBe('none');
    expect(o.root.style.pointerEvents).toBe('none');
    expect(o.root.textContent).toBe('');
    expect(Number(o.root.style.zIndex)).toBeGreaterThan(25);
    expect(Number(o.root.style.zIndex)).toBeLessThan(40);
    o.update(snap('none', 0, 0));
    expect(o.root.style.display).toBe('none');
  });

  it('follows the snapshot: shown and getting darker through the fade out, black in the hold, lighter again, then hidden', () => {
    const o = new TransitionOverlay(document.createElement('div'));
    o.update(snap('fadeOut', 6, 12));
    expect(o.root.style.display).toBe('block');
    expect(Number(o.root.style.opacity)).toBeCloseTo(0.5, 2);
    o.update(snap('fadeOut', 12, 12));
    expect(Number(o.root.style.opacity)).toBe(1);
    o.update(snap('hold', 2, 6));
    expect(Number(o.root.style.opacity)).toBe(1);
    o.update(snap('fadeIn', 7, 14));
    expect(Number(o.root.style.opacity)).toBeCloseTo(0.5, 2);
    o.update(snap('none', 0, 0));
    expect(o.root.style.display).toBe('none');
  });

  it('only touches the DOM when a value changed (no style writes for identical frames)', () => {
    const o = new TransitionOverlay(document.createElement('div'));
    o.update(snap('hold', 0, 6));
    const observer = new MutationObserver(() => {});
    observer.observe(o.root, { attributes: true, subtree: true, characterData: true, childList: true });
    observer.takeRecords();
    for (let i = 0; i < 20; i++) o.update(snap('hold', i % 6, 6)); // the same black picture every frame
    expect(observer.takeRecords()).toHaveLength(0);
    o.update(snap('fadeIn', 5, 14)); // a real change is written
    expect(observer.takeRecords().length).toBeGreaterThan(0);
    observer.disconnect();
  });

  it('dispose removes it from the page', () => {
    const host = document.createElement('div');
    const o = new TransitionOverlay(host);
    o.dispose();
    expect(host.children.length).toBe(0);
  });
});
