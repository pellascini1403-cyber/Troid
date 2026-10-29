import { BOSSES, ENEMIES } from '@/content/enemies';
import { Boss } from '@/enemies/boss/Boss';
import type { BossDefinition } from '@/enemies/boss/BossDefinition';
import type { GameEvents } from '@/gameplay/events';
import { mapRoom } from '@/world/roomMap';
import { driver, type Driver } from './sim';

/**
 * THE ARENA OF A GUARDIAN IN THE LAB (docs/PROMPT21-LOG.md, shared since docs/PROMPT23-LOG.md §7.3): a hall 70 m wide with the guardian at its east end and the hero at its west, and the handful of things every test of a guardian does with it —
 * fight it (`fight`), wait for a state (`until`), count what happened (`count`), take it to the start of a phase (`enterPhase`), put a blow on whatever part of it is under the sword (`strike`).
 */
export const W = 70;
export const H = 26;

export function arenaFor(def: BossDefinition) {
  void def;
  const grid = Array.from({ length: H }, () => Array.from({ length: W }, () => '.'));
  const fill = (x0: number, x1: number, y0: number, y1: number, ch: string): void => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) grid[H - 1 - y]![x] = ch;
  };
  fill(0, W, 0, 1, '#');
  fill(0, W, 1, 2, 'G'); // the floor, top at y = 2
  fill(0, 1, 0, H, '#');
  fill(W - 1, W, 0, H, '#');
  fill(0, W, H - 1, H, '#');
  const mark = (x: number, y: number, ch: string): void => {
    grid[H - 1 - y]![x] = ch;
  };
  mark(4, 2, 'a'); // the way in
  mark(56, 2, 'b'); // the boss
  mark(10, 2, 'l'); // west end of the arena
  mark(66, 2, 'r'); // east end of the arena
  return mapRoom(
    { id: 'arena', regionId: 'lab', name: 'Arena', nameKey: 'room.lab.name', art: { backdrop: 'ruins', seed: 1 }, rows: grid.map((r) => r.join('')) },
    (m) => ({
      entries: [m.entry('start', 'a', 1)],
      bosses: [m.boss('boss', def.id, 'b', { from: 'l', to: 'r', top: 20 }, { defeatFlag: 'defeated:test_boss', fightFlag: '~fight:test_boss' })],
    }),
  );
}

export interface Fight {
  d: Driver;
  boss: Boss;
  log: Array<[string, unknown]>;
}

export const NAMES: Array<keyof GameEvents> = ['boss:started', 'boss:phase', 'boss:strike', 'boss:defeated', 'enemy:blocked', 'enemy:telegraph', 'enemyshot:ended', 'player:hurt', 'actor:died', 'flag:set', 'flag:cleared'];

export function fight(def: BossDefinition, opts: { god?: boolean; wake?: boolean; hero?: number } = {}): Fight {
  const room = arenaFor(def);
  const d = driver({ room, unlocked: ['dash'], entry: 'start', extra: { bosses: BOSSES, enemies: ENEMIES } });
  d.session.godMode = opts.god ?? true;
  const log: Array<[string, unknown]> = [];
  for (const n of NAMES) d.session.bus.on(n, (e) => void log.push([n as string, e]));
  d.step(2);
  const boss = d.session.entities.find((e): e is Boss => e instanceof Boss)!;
  if (opts.wake !== false) {
    d.teleport(opts.hero ?? 20, 2);
    d.settle();
    d.until(() => boss.state !== 'dormant', 30);
  }
  return { d, boss, log };
}

export const count = (f: Fight, name: string): number => f.log.filter(([n]) => n === name).length;
export const until = (f: Fight, state: string | string[], max = 900): number => {
  const want = Array.isArray(state) ? state : [state];
  return f.d.until(() => want.includes(f.boss.state), max);
};
/** A touch of damage that is not a blow of the hero's (it cannot be turned away): the boss notices that its health has crossed a phase. */
export function nudge(f: Fight): void {
  const b = f.boss.body;
  f.boss.receiveHit({ attackId: 'test', attackerId: 'test', damage: 0.0001, direction: 1, knockbackX: 0, knockbackY: 0, stun: 0, hitStop: 0, shake: 0, x: b.x, y: b.y + 1, part: 'core' });
}
/** Takes the boss's health to just below the start of phase `n` and lets it shut for the roar, open again, and begin the phase. */
export function enterPhase(f: Fight, n: number): void {
  while (f.boss.phase < n) {
    const next = f.boss.def.phases[f.boss.phase]!;
    const drop = f.boss.health.current - (next.at - 0.02) * f.boss.health.max;
    if (drop > 0) f.boss.health.damage(drop);
    nudge(f);
    f.d.until(() => f.boss.state === 'shift', 4000);
    f.d.until(() => f.boss.state === 'choose', 400);
  }
}
/** A perfect hero's blow on the part of the boss that is under the hero's sword: whatever region overlaps the rectangle takes it. */
export function strike(f: Fight, damage = 1): void {
  const b = f.boss.body;
  f.d.session.combat.submit({
    ownerId: 'test', team: 'player', attackId: 'slash_1', damage,
    rect: { x0: b.x - b.halfW - 0.3, x1: b.x + b.halfW + 0.3, y0: b.y + 0.2, y1: b.y + b.height - 0.2 },
    knockback: { x: 3, y: 2 }, stun: 12, hitStop: 0, shake: 0, facing: 1, alreadyHit: new Set(),
  });
  f.d.step(1);
}

