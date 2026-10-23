// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CATALOGS, createTranslator } from '@/i18n';
import { MENU_CATALOGS } from '@/i18n/menuCatalogs';
import type { ProfileData } from '@/app/profile';
import { ENDING_GRACE_MS, EndingScreen } from '@/ui/settings/EndingScreen';
import { stubScrollLayout } from '../../helpers/layout';
import { profileData, TEST_CREDITS } from '../../helpers/pauseHost';

/**
 * THE CLOSING OF THE ADVENTURE (docs/PROMPT20-LOG.md): "the end", what the game counted of the way, the credits and the two ways on. It shows what the host says and invents nothing; the credits roll by
 * themselves after a moment and the first wheel, finger or key stops that for good; a player who asked for less motion gets a still list.
 */
const q = (root: ParentNode, id: string): HTMLElement => root.querySelector(`[data-testid="${id}"]`) as HTMLElement;

/** The page's frame callbacks, driven by hand. */
function fakeFrames(): { frames: { request(cb: (t: number) => void): number; cancel(id: number): void }; tick(ms: number): void; pending(): number } {
  let next = 1;
  let now = 0;
  const waiting = new Map<number, (t: number) => void>();
  return {
    frames: { request: (cb) => (waiting.set(next, cb), next++), cancel: (id) => void waiting.delete(id) },
    tick(ms) {
      now += ms;
      for (const [id, cb] of [...waiting]) {
        waiting.delete(id);
        cb(now);
      }
    },
    pending: () => waiting.size,
  };
}

describe('the closing of the adventure', () => {
  let parent: HTMLDivElement;
  let screen: EndingScreen;
  let data: ProfileData;
  let calls: string[];
  let clock: ReturnType<typeof fakeFrames>;
  /** The page's clock. A screen ignores the buttons for a moment after it opens; most tests are about what comes after that moment. */
  let nowMs = 0;
  const settle = (): void => void (nowMs += ENDING_GRACE_MS + 1);
  const tr = createTranslator(CATALOGS, 'es');
  for (const [lang, entries] of Object.entries(MENU_CATALOGS)) tr.extend(lang, entries);

  const make = (over: { rolls?: boolean; saves?: boolean } = {}): void => {
    screen?.dispose();
    calls = [];
    nowMs = 1000;
    clock = fakeFrames();
    screen = new EndingScreen(parent, tr, {
      profile: () => data,
      credits: TEST_CREDITS,
      rolls: over.rolls ?? false,
      resume: () => void calls.push('resume'),
      saves: over.saves === false ? null : () => void calls.push('saves'),
      frames: clock.frames,
      now: () => nowMs,
    });
  };

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    parent = document.createElement('div');
    document.body.appendChild(parent);
    tr.setLocale('es');
    data = profileData({ ticks: 60 * 3725, deaths: 7, kills: 31, rooms: { visited: 4, total: 4 }, bosses: { beaten: ['enemy.inkWarden.name'], total: 1 }, completed: true });
    make();
  });
  afterEach(() => {
    screen.dispose();
    tr.setLocale('es');
  });

  it('is closed until it is opened, and a modal dialog that the game\'s input leaves alone', () => {
    expect(screen.isOpen).toBe(false);
    expect(screen.root.getAttribute('role')).toBe('dialog');
    expect(screen.root.getAttribute('aria-modal')).toBe('true');
    expect(screen.root.hasAttribute('data-ui-block')).toBe(true);
    screen.open();
    expect(screen.isOpen).toBe(true);
    expect(screen.root.getAttribute('aria-label')).toBe('FIN');
  });

  it('says the end and what the adventure was, in the language in force', () => {
    screen.open();
    expect(q(parent, 'ending-title').textContent).toBe('FIN');
    expect(q(parent, 'ending-lead').textContent).toBe('Has llegado al final de la aventura.');
    tr.setLocale('en');
    expect(q(parent, 'ending-title').textContent).toBe('THE END');
    expect(q(parent, 'ending-lead').textContent).toBe('You have reached the end of the adventure.');
    expect(q(parent, 'ending-continue').textContent).toBe('Keep exploring');
    expect(q(parent, 'ending-saves').textContent).toBe('Saved games');
  });

  it('shows what the game counted of the way — the time, the rooms, the guardians, the falls and the enemies — and nothing it did not', () => {
    screen.open();
    const text = (id: string): string | null => q(parent, `ending-${id}`).textContent;
    expect(text('time')).toBe('1:02:05');
    expect(text('rooms')).toBe('4 de 4');
    expect(text('bosses')).toBe('1 de 1');
    expect(text('deaths')).toBe('7');
    expect(text('kills')).toBe('31');
    expect(q(parent, 'ending-stats').querySelectorAll('dd')).toHaveLength(5);
  });

  it('reads the game again every time it opens: nothing moves while the world is held, but a screen that was shown before is not shown stale', () => {
    screen.open();
    expect(q(parent, 'ending-deaths').textContent).toBe('7');
    screen.close();
    data = profileData({ ...data, deaths: 9 });
    screen.open();
    expect(q(parent, 'ending-deaths').textContent).toBe('9');
  });

  it('a world with no guardian says "ninguna", not "0 de 0"', () => {
    data = profileData({ bosses: { beaten: [], total: 0 } });
    screen.open();
    expect(q(parent, 'ending-bosses').textContent).toBe('ninguna');
  });

  it('rolls the credits: the sections that have something, their names and what each did, and the thanks — a section with no lines is not shown', () => {
    screen.open();
    const credits = q(parent, 'ending-credits');
    expect(credits.querySelector('.credits-title')?.textContent).toBe('Créditos');
    expect([...credits.querySelectorAll('.credits-section h4')].map((h) => h.textContent)).toEqual(['Equipo', 'Programas']);
    expect([...credits.querySelectorAll('.credits-name')].map((n) => n.textContent)).toEqual(['Ada Lovelace', 'Alan Turing', 'PixiJS']);
    expect([...credits.querySelectorAll('.credits-role')].map((n) => n.textContent)).toEqual(['Música y efectos, sintetizados con las herramientas del propio juego', 'Dibujo 2D']);
    expect(credits.querySelector('.credits-thanks')?.textContent).toBe('Gracias por jugar.');
  });

  it('the shipped credits show no invented names: whoever publishes the game fills in the team', async () => {
    const { CREDITS } = await import('@/content/credits');
    expect(CREDITS.find((s) => s.titleKey === 'credits.team')?.lines).toEqual([]);
    screen.dispose();
    screen = new EndingScreen(parent, tr, { profile: () => data, credits: CREDITS, rolls: false, resume: () => undefined, saves: null, frames: clock.frames });
    screen.open();
    expect([...q(parent, 'ending-credits').querySelectorAll('.credits-section h4')].map((h) => h.textContent)).toEqual(['Sonido', 'Programas']);
  });

  it('the first way on is to keep exploring: the focus is on it, and it resumes the game', () => {
    screen.open();
    settle();
    expect(document.activeElement).toBe(q(parent, 'ending-continue'));
    q(parent, 'ending-continue').click();
    expect(calls).toEqual(['resume']);
  });

  it('ignores a press in the first moments: the closing opens as the hero touches the way out, and the Space of a last jump must not skip it unread', () => {
    screen.open();
    q(parent, 'ending-continue').click();
    nowMs += ENDING_GRACE_MS - 5;
    q(parent, 'ending-continue').click();
    q(parent, 'ending-saves').click();
    expect(calls, 'nothing was answered').toEqual([]);
    nowMs += 10;
    q(parent, 'ending-continue').click();
    expect(calls).toEqual(['resume']);
  });

  it('every time it opens it waits again', () => {
    screen.open();
    settle();
    screen.close();
    screen.open();
    q(parent, 'ending-continue').click();
    expect(calls).toEqual([]);
    settle();
    q(parent, 'ending-continue').click();
    expect(calls).toEqual(['resume']);
  });

  it('the second is the saved games (where a new game is begun); where nothing is saved it is not offered', () => {
    screen.open();
    settle();
    expect(q(parent, 'ending-saves').hidden).toBe(false);
    q(parent, 'ending-saves').click();
    expect(calls).toEqual(['saves']);
    make({ saves: false });
    screen.open();
    expect(q(parent, 'ending-saves').hidden).toBe(true);
  });

  it('its middle scrolls and says so: the stylesheet is told whether there is more below', () => {
    const body = q(parent, 'ending-body');
    expect(body.dataset['more']).toBe('0');
    stubScrollLayout(body, { scroll: 800, client: 300 });
    screen.open();
    expect(body.dataset['more']).toBe('1');
  });

  it('a button is pressed once by a click, and once by a finger that lifts over it (not twice for the click that follows)', () => {
    screen.open();
    settle();
    const b = q(parent, 'ending-continue');
    b.getBoundingClientRect = () => ({ left: 0, right: 100, top: 0, bottom: 40, width: 100, height: 40, x: 0, y: 0, toJSON: () => ({}) });
    b.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 3, pointerType: 'touch', bubbles: true }));
    b.dispatchEvent(new PointerEvent('pointerup', { pointerId: 3, pointerType: 'touch', clientX: 50, clientY: 20, bubbles: true }));
    b.click();
    expect(calls).toEqual(['resume']);
  });

  describe('the credits roll by themselves', () => {
    beforeEach(() => {
      make({ rolls: true });
      stubScrollLayout(q(parent, 'ending-body'), { scroll: 1000, client: 400 });
    });

    it('wait a moment, then move at a steady pace while the screen is open', () => {
      const body = q(parent, 'ending-body');
      screen.open();
      expect(screen.isRolling).toBe(true);
      clock.tick(16); // the first frame fixes the start
      expect(body.scrollTop).toBe(0);
      clock.tick(1000);
      expect(body.scrollTop).toBe(0);
      clock.tick(3000); // 4.0 s on: 2.2 s of moving
      expect(body.scrollTop).toBeGreaterThan(40);
      const at = body.scrollTop;
      clock.tick(1000);
      expect(body.scrollTop).toBeGreaterThan(at);
    });

    it('stop for good at the first wheel, finger or key — the credits are the player\'s from then on', () => {
      for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
        make({ rolls: true });
        stubScrollLayout(q(parent, 'ending-body'), { scroll: 1000, client: 400 });
        screen.open();
        clock.tick(16);
        clock.tick(4000);
        expect(screen.isRolling, `rolling before ${type}`).toBe(true);
        const body = q(parent, 'ending-body');
        body.dispatchEvent(new Event(type, { bubbles: true }));
        expect(screen.isRolling, `rolling after ${type}`).toBe(false);
        const stopped = body.scrollTop;
        clock.tick(5000);
        expect(body.scrollTop, `${type}: nothing moves it any more`).toBe(stopped);
        expect(clock.pending(), `${type}: no frame is left asked for`).toBe(0);
      }
    });

    it('end where the credits end', () => {
      const body = q(parent, 'ending-body');
      screen.open();
      clock.tick(16);
      for (let i = 0; i < 40; i++) clock.tick(1000);
      expect(body.scrollTop).toBe(600);
      expect(screen.isRolling).toBe(false);
      expect(clock.pending()).toBe(0);
    });

    it('stop when the screen is closed, and start again from the top when it is opened again', () => {
      const body = q(parent, 'ending-body');
      screen.open();
      clock.tick(16);
      clock.tick(6000);
      expect(body.scrollTop).toBeGreaterThan(0);
      screen.close();
      expect(screen.isRolling).toBe(false);
      expect(clock.pending()).toBe(0);
      screen.open();
      expect(body.scrollTop).toBe(0);
      expect(screen.isRolling).toBe(true);
    });

    it('leave no frame asked for when the screen is taken away', () => {
      screen.open();
      expect(clock.pending()).toBe(1);
      screen.dispose();
      expect(clock.pending()).toBe(0);
    });
  });

  it('a player who asked the system for less motion gets a still list: nothing rolls, nothing is asked of the frames', () => {
    make({ rolls: false });
    stubScrollLayout(q(parent, 'ending-body'), { scroll: 1000, client: 400 });
    screen.open();
    expect(screen.isRolling).toBe(false);
    expect(clock.pending()).toBe(0);
    clock.tick(10_000);
    expect(q(parent, 'ending-body').scrollTop).toBe(0);
  });
});
