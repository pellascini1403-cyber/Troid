import type { Enemy } from '@/enemies/Enemy';
import { floorAhead } from '@/enemies/senses';
import type { Driver } from './sim';

/**
 * A scripted player that walks a room with the SAME inputs a person has (a stick, jump, attack): it is how a room is proven
 * COMPLETABLE by physics, not by a coordinate check. It decides each tick from what it can see (the geometry ahead, the
 * enemies, its own state) and nothing else, so it also notices when a tuning change makes a room impossible.
 *
 *  - runs right; jumps when a wall or a pit is ahead (a held jump, released after the rise);
 *  - crouches inside the zones it is told are low passages;
 *  - fights what it meets: closes in, faces it and slashes, chaining the second blow in the window.
 */
export interface BotOptions {
  /** x ranges `[from, to)` where it crouches (low passages). */
  crouchZones?: ReadonlyArray<readonly [number, number]>;
  /** Fight enemies that come within this distance (m). */
  engage?: number;
  /** Ticks to hold the jump (a full jump). */
  jumpHold?: number;
  /** Where to stop: it returns when this is true after a tick. */
  until?: () => boolean;
  maxTicks?: number;
}

export interface BotResult {
  ticks: number;
  /** The `until` condition was met. */
  done: boolean;
  jumps: number;
  slashes: number;
}

const WALL_REACH = 1.0;
const PIT_REACH = 0.05;
/** A floor within this far below is a drop to walk off (stepping down from a block); no floor at all is a pit to jump. */
const DROP_LIMIT = 4.0;

export function runBot(d: Driver, opts: BotOptions = {}): BotResult {
  const crouchZones = opts.crouchZones ?? [];
  const engage = opts.engage ?? 9;
  const jumpHold = opts.jumpHold ?? 24;
  const maxTicks = opts.maxTicks ?? 6000;
  const s = d.session;
  let jumpHeld = 0;
  let jumps = 0;
  let slashes = 0;
  let releaseAttack = false;

  const enemies = (): Enemy[] => s.entities.filter((e) => e.kind === 'enemy' && !(e as Enemy).health.dead) as Enemy[];
  const solidAhead = (dir: 1 | -1): boolean => {
    const b = d.body;
    const x0 = dir > 0 ? b.x + b.halfW + 0.05 : b.x - b.halfW - 0.05 - WALL_REACH;
    const hit = s.collision.query({ x0, x1: x0 + WALL_REACH, y0: b.y + 0.15, y1: b.y + 0.6 });
    return hit.some((c) => c.kind === 'solid');
  };

  let t = 0;
  for (; t < maxTicks; t++) {
    if (opts.until?.()) return { ticks: t, done: true, jumps, slashes };
    const b = d.body;
    d.stop();

    const crouchHere = crouchZones.some(([a, z]) => b.x >= a && b.x < z);
    if (crouchHere) d.moveY = -1;

    // ---- what is in front of me? ----
    const foe = enemies()
      .filter((e) => Math.abs(e.body.x - b.x) <= engage && Math.abs(e.body.y - b.y) < 2)
      .sort((p, q) => Math.abs(p.body.x - b.x) - Math.abs(q.body.x - b.x))[0];

    if (foe && !crouchHere) {
      const dx = foe.body.x - b.x;
      const dir = dx >= 0 ? 1 : -1;
      const inRange = Math.abs(dx) <= 1.45;
      const facingFoe = d.p.facing === dir;
      if (!inRange || !facingFoe) {
        // close in (and turn: moving toward it sets the facing)
        if (dir > 0) d.right();
        else d.left();
      }
      if (inRange && facingFoe) {
        const c = d.p.combat;
        const idle = c.attack === null;
        const chain = c.attack !== null && c.attackTicks >= 8 && c.attackTicks <= 14 && c.combo === 0;
        if (idle || chain) {
          d.press('attack');
          releaseAttack = true;
          slashes++;
        }
      }
    } else {
      d.right(); // (crouched or not, the way on is to the right)
    }

    // ---- obstacles: a wall or a pit ahead while running on the ground → a held jump ----
    if (jumpHeld === 0 && b.grounded && !crouchHere && d.moveX > 0) {
      const wall = solidAhead(1);
      const pit = !floorAhead(s.collision, b, 1, PIT_REACH, DROP_LIMIT);
      if (wall || pit) {
        d.press('jump');
        jumpHeld = jumpHold;
        jumps++;
      }
    }

    d.step(1);

    if (releaseAttack) {
      d.release('attack');
      releaseAttack = false;
    }
    if (jumpHeld > 0 && --jumpHeld === 0) d.release('jump');
  }
  return { ticks: t, done: opts.until?.() ?? false, jumps, slashes };
}
