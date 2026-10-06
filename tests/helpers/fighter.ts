import { INK_WARDEN } from '@/content/enemies';
import type { Guardian } from '@/enemies/Guardian';
import type { Driver } from './sim';

/**
 * A scripted fighter for the Ink Warden (docs/PROMPT6-LOG.md S29), with the SAME inputs a person has (the stick, jump, attack, dash, a bottle). It reads
 * the boss the way a player reads it — its telegraph — and nothing else:
 *
 *  - **charge**: the lane it will slide along is on the floor; anyone in it crosses the boss (it has no contact damage) and stands behind it, so
 *    the slide goes away from them;
 *  - **rain**: the marks are on the floor; it walks to the gap between them and waits for the ink to pass;
 *  - **the opening** (the boss recovering, or staggered): it closes in, faces it and slashes, once every 13 ticks;
 *  - a bottle when it is hurt and the boss is stuck.
 *
 * It is how the fight is proven WINNABLE by physics, and how the browser plays it: `tools/e2e/scenarios/boss.ts` RECORDS this fight in Node and
 * REPLAYS it through the real keyboard, tick by tick. If a retune makes the boss impossible, this is what notices.
 */
export interface FighterResult {
  ticks: number;
  /** The Warden fell. */
  won: boolean;
  /** Points of life lost, and bottles drunk. */
  hurt: number;
  drinks: number;
}

export interface FighterOptions {
  maxTicks?: number;
  /** Stop as soon as this is true (after a tick). */
  until?: () => boolean;
}

/** The hero's half-width plus a margin: how far from a zone of ink they stand to be clear of it. */
const CLEAR = 0.35 + 0.35;
const SWING_EVERY = 13;
/** Close enough to hit: the hero's sword reaches about 1.6 m from their centre, and the boss's column is 0.8 m to a side. */
const STRIKE_FROM = 1.35;

export function fightTheWarden(d: Driver, opts: FighterOptions = {}): FighterResult {
  const maxTicks = opts.maxTicks ?? 6000;
  const s = d.session;
  const startLife = d.p.health.current;
  const boss = (): Guardian | undefined => s.entities.find((e): e is Guardian => e.kind === 'guardian');
  let swingCooldown = 0;
  let drinks = 0;
  let jumpHeld = 0;
  let tickCount = 0;

  /** Walks toward `x` (stops within `tol`). */
  const goTo = (x: number, tol = 0.2): void => {
    const dx = x - d.body.x;
    if (Math.abs(dx) <= tol) d.stop();
    else if (dx > 0) d.right();
    else d.left();
  };

  const decide = (b: Guardian): void => {
    const hx = d.body.x;
    const bx = b.x;
    const f = b.facing;
    const arena = b.arena;
    if (jumpHeld > 0 && --jumpHeld === 0) d.release('jump');
    if (swingCooldown > 0) swingCooldown--;

    switch (b.state) {
      case 'dormant':
      case 'intro':
      case 'choose': {
        // wait for it, not too close: 9 m in front of it
        goTo(Math.max(arena.x0 + 1, bx - 9), 0.5);
        return;
      }
      case 'telegraph': {
        if (b.attackKind === 'charge') {
          // the danger: from its back to the end of its slide plus the surge (2.3 m ahead of its centre), on the side it faces
          const reach = (INK_WARDEN.params.charge.speed * INK_WARDEN.params.charge.ticks) / 60 + 2.3 + 0.8;
          const ahead = (hx - bx) * f; // + in front of it
          if (ahead > -0.9 && ahead < reach) goTo(bx - f * 2, 0.3); // cross it and stand behind
          else d.stop();
          return;
        }
        // the rain: the gaps between the marks, and the open ground beyond the outer ones
        const marks = [...b.telegraphMarks].sort((a, c) => a.x - c.x);
        const safe = (x: number): boolean => marks.every((m) => Math.abs(x - m.x) >= m.w / 2 + CLEAR);
        if (safe(hx)) {
          d.stop();
          return;
        }
        const candidates: number[] = [];
        for (let i = 0; i + 1 < marks.length; i++) candidates.push((marks[i]!.x + marks[i]!.w / 2 + marks[i + 1]!.x - marks[i + 1]!.w / 2) / 2);
        if (marks.length > 0) {
          candidates.push(marks[0]!.x - marks[0]!.w / 2 - CLEAR - 0.3, marks[marks.length - 1]!.x + marks[marks.length - 1]!.w / 2 + CLEAR + 0.3);
        }
        const inside = candidates.filter((x) => x > arena.x0 + 0.5 && x < arena.x1 - 0.5 && safe(x));
        const best = inside.sort((a, c) => Math.abs(a - hx) - Math.abs(c - hx))[0];
        if (best !== undefined) goTo(best, 0.1);
        else d.stop();
        return;
      }
      case 'attack': {
        if (b.attackKind === 'charge') {
          // a safety net: still in front of the surge, jump it
          const ahead = (hx - bx) * f;
          if (ahead > 0 && ahead < 5 && d.body.grounded && jumpHeld === 0) {
            d.press('jump');
            jumpHeld = 26;
          }
        }
        d.stop();
        return;
      }
      case 'recover':
      case 'hurt': {
        const side = hx >= bx ? 1 : -1;
        const gap = Math.abs(hx - bx);
        // drink when hurt and the opening is long enough (the channel is 24 ticks standing still)
        if (d.p.health.current <= 2 && s.bottles.readyCount > 0 && d.p.controller.state === 'free' && gap > STRIKE_FROM + 0.5 && b.state === 'recover') {
          d.stop();
          d.tap('bottle');
          drinks++;
          return;
        }
        if (gap > STRIKE_FROM) {
          goTo(bx + side * (STRIKE_FROM - 0.15), 0.1);
          return;
        }
        // in reach: face it (a step toward it), then slash
        d.moveX = -side;
        if (swingCooldown === 0 && d.p.controller.state !== 'attack') {
          d.tap('attack');
          swingCooldown = SWING_EVERY;
        }
        return;
      }
      case 'dead':
        d.stop();
        return;
    }
  };

  while (tickCount < maxTicks) {
    const b = boss();
    if (!b || b.state === 'dead' || d.p.health.dead) break;
    if (opts.until?.()) break;
    decide(b);
    d.step(1);
    tickCount++;
  }
  d.release('jump');
  d.stop();
  const b = boss();
  return {
    ticks: tickCount,
    won: !b || b.state === 'dead' || s.flags.has('defeated:r4_boss'),
    hurt: Math.max(0, startLife - d.p.health.current),
    drinks,
  };
}
