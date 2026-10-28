import type { Rect } from '@/core/math';
import type { SimServices } from '@/gameplay/SimServices';
import type { KinematicBody } from '@/world/collision';
import type { ShotSpec } from '../EnemyShot';
import type { BossAttackSpec, BossHandlerId } from './BossDefinition';
import { datan2, dcos, dsin } from '@/core/dmath';

/** One warning of the boss on the floor: where, how wide, and how near the blow is (0 → 1). */
export interface BossMark {
  x: number;
  w: number;
  t01: number;
}

/** How the warning is drawn: a `lane` along the floor (a surge, a sweep) or a `column` of light on a spot (an eruption, a landing). */
export type MarkStyle = 'lane' | 'column';

/**
 * What a pattern may touch of the boss and of the world while it runs: its body, the hero, the arena, the marks it shows, the hitboxes it submits and the shots it throws. The boss owns the state machine (when the wind-up
 * ends, how long it recovers, when a phase changes); a handler owns only WHAT HAPPENS inside its wind-up and its attack. Nothing here knows how it is drawn.
 */
export interface BossCtx {
  readonly sim: SimServices;
  readonly arena: Readonly<Rect>;
  readonly spec: BossAttackSpec;
  /** 1-based. */
  readonly phase: number;
  readonly body: KinematicBody;
  readonly gravity: number;
  /** The floor of the arena (a flyer is above it): where columns rise from and waves run along. */
  readonly floorY: number;
  facing: 1 | -1;
  readonly marks: BossMark[];
  markStyle: MarkStyle;
  /** Numbers that last for the length of ONE attack (when something happened, where the hero stood). */
  readonly memo: Record<string, number>;
  /** How many times each attack has been thrown so far (an alternating pattern reads its parity). */
  readonly uses: number;
  /** The boss is gone (a vanishing): nothing can touch it and nothing sees it. */
  hidden: boolean;
  num(key: string, fallback?: number): number;
  /** A list of the pattern's params for this phase: `key` in the first phase, `key2` in the second if there is one, `key3` in the third. */
  list(key: string): readonly number[];
  heroX(): number;
  heroY(): number;
  heroFacing(): 1 | -1;
  /** The tick of a hitbox for the attack's numbers; the whole attack shares one hit set (a hero caught twice is hurt once). */
  submit(rect: Rect, facing?: 1 | -1): void;
  /** The attack's own hitbox in front of the body. */
  submitMelee(): void;
  throwShot(spec: ShotSpec, x: number, y: number, facing: 1 | -1): void;
  /** `boss:strike`: the effects hang a mark at `x`. */
  strike(x: number, w: number): void;
  /** `enemy:telegraph` at `x`: a ring on the floor (an effect only). */
  cue(x: number): void;
  faceHero(): void;
  random(): number;
  teleportTo(x: number, y: number): void;
  stop(): void;
}

export interface BossHandler {
  /** The beginning of the wind-up: the marks, and the cue. */
  telegraph(c: BossCtx): void;
  /** One tick of the wind-up (`t` counts from 0), after the marks have filled: a boss that follows the hero while it winds up. */
  windup?(c: BossCtx, t: number): void;
  /** The wind-up is over; the attack begins. */
  begin(c: BossCtx): void;
  /** One tick of the attack (`t` counts from 0); true when it is over. */
  tick(c: BossCtx, t: number): boolean;
  end(c: BossCtx): void;
}

const none = (): void => {};
const clampX = (c: BossCtx, x: number, w = 0): number => Math.min(c.arena.x1 - w / 2, Math.max(c.arena.x0 + w / 2, x));
const floorOf = (c: BossCtx): number => c.floorY;
/** The column of a mark: a rectangle from the floor up. */
function column(c: BossCtx, m: BossMark, height: number): Rect {
  const f = floorOf(c);
  return { x0: m.x - m.w / 2, x1: m.x + m.w / 2, y0: f, y1: f + height };
}

/** A wave along the floor, thrown from the feet of the boss each way. */
function groundWaves(c: BossCtx, spec: ShotSpec, from = 0.9): void {
  for (const side of [-1, 1] as const) c.throwShot(spec, c.body.x + side * from, c.floorY + 0.35, side);
}

const charge: BossHandler = {
  telegraph(c) {
    const len = (c.num('speed') * c.num('ticks')) / 60;
    const x0 = c.body.x + c.facing * c.body.halfW;
    c.markStyle = 'lane';
    c.marks.push({ x: x0 + (c.facing * len) / 2, w: len, t01: 0 });
    c.cue(c.body.x);
  },
  begin(c) {
    c.body.vx = c.facing * c.num('speed');
    c.strike(c.body.x, c.body.halfW * 2);
  },
  tick(c, t) {
    c.body.vx = c.facing * c.num('speed');
    c.submitMelee();
    // a surge that stops within half a metre of a wall has run into it: whether the last tick of the clock was also the tick the body touched the wall is a matter of a hair (found in Prompt 22: after one surge from the wall the next
    // one, back to it, ends exactly at it — the stun that is this boss's whole opening came or did not by less than a centimetre)
    const b = c.body;
    const edge = c.facing > 0 ? b.x + b.halfW : b.x - b.halfW;
    const ahead = { x0: Math.min(edge, edge + c.facing * 0.5), x1: Math.max(edge, edge + c.facing * 0.5), y0: b.y + 0.2, y1: b.y + b.height - 0.2 };
    const blocked = (c.facing > 0 ? b.hitRight : b.hitLeft) || c.sim.collision.overlapsSolid(ahead);
    if (blocked) c.memo['wall'] = 1;
    return t + 1 >= c.num('ticks') || blocked;
  },
  end(c) {
    c.stop();
    // a charge that ends at a wall leaves it stunned for longer: that is the price of running into it
    c.memo['bonusRecovery'] = c.memo['wall'] ? c.num('wallStun', 0) : 0;
  },
};

const sweep: BossHandler = {
  telegraph(c) {
    const h = c.spec.attack.hitbox;
    c.markStyle = 'lane';
    const len = h.x + h.w;
    c.marks.push({ x: c.body.x + (c.facing * (len + c.body.halfW)) / 2, w: len, t01: 0 });
    c.cue(c.body.x + c.facing * len * 0.5);
  },
  begin(c) {
    c.strike(c.body.x + c.facing * (c.spec.attack.hitbox.x + c.spec.attack.hitbox.w / 2), c.spec.attack.hitbox.w);
  },
  tick(c, t) {
    c.body.vx = t < c.num('lungeTicks', 0) ? c.facing * c.num('lunge', 0) : 0;
    c.submitMelee();
    return t + 1 >= c.spec.attack.active;
  },
  end: (c) => c.stop(),
};

const leap: BossHandler = {
  telegraph(c) {
    const range = c.num('range');
    const target = clampX(c, Math.max(c.body.x - range, Math.min(c.body.x + range, c.heroX())), c.num('shockWidth') * 2);
    c.memo['target'] = target;
    c.markStyle = 'column';
    c.marks.push({ x: target, w: c.num('shockWidth') * 1.4, t01: 0 });
    c.cue(target);
  },
  begin(c) {
    const flight = (2 * c.num('vy')) / c.gravity;
    c.body.vx = (c.memo['target']! - c.body.x) / flight;
    c.body.vy = c.num('vy');
    c.body.grounded = false;
    c.memo['landed'] = -1;
  },
  tick(c, t) {
    if (c.memo['landed']! < 0) {
      c.submitMelee();
      if (t > 2 && c.body.grounded) {
        c.memo['landed'] = t;
        c.stop();
        c.strike(c.body.x, c.num('shockWidth') * 2);
      }
      return false;
    }
    // the floor shakes either side of where it came down
    const w = c.num('shockWidth');
    const f = floorOf(c);
    c.stop();
    c.submit({ x0: c.body.x, x1: c.body.x + w, y0: f, y1: f + 0.7 }, 1);
    c.submit({ x0: c.body.x - w, x1: c.body.x, y0: f, y1: f + 0.7 }, -1);
    return t - c.memo['landed']! + 1 >= c.num('shockTicks');
  },
  end: (c) => c.stop(),
};

const eruptions: BossHandler = {
  telegraph(c) {
    c.markStyle = 'column';
    const w = c.num('width');
    const xs: number[] = [];
    for (const off of c.list('offsets')) xs.push(clampX(c, c.heroX() + off, w));
    const fixed = c.list('fixed');
    if (fixed.length > 0) {
      const span = c.arena.x1 - c.arena.x0;
      const parity = c.num('alternate', 0) > 0 ? c.uses % 2 : -1;
      fixed.forEach((f, i) => {
        if (parity < 0 || i % 2 === parity) xs.push(clampX(c, c.arena.x0 + f * span, w));
      });
    }
    // columns at random spots across the arena that keep clear of each other (the room is read as a whole)
    const gap = c.num('gap', w * 1.6);
    for (let n = c.num('random', 0), tries = 0; n > 0 && tries < 40; tries++) {
      const x = clampX(c, c.arena.x0 + c.random() * (c.arena.x1 - c.arena.x0), w);
      if (xs.every((o) => Math.abs(o - x) >= gap)) {
        xs.push(x);
        n--;
      }
    }
    for (const x of xs) {
      c.marks.push({ x, w, t01: 0 });
      c.cue(x);
    }
  },
  begin(c) {
    for (const m of c.marks) c.strike(m.x, m.w);
  },
  tick(c, t) {
    const h = c.num('height');
    for (const m of c.marks) c.submit(column(c, m, h));
    return t + 1 >= c.spec.attack.active;
  },
  end: none,
};

const march: BossHandler = {
  telegraph(c) {
    c.markStyle = 'column';
    const dir = c.heroX() >= c.body.x ? 1 : -1;
    c.facing = dir;
    c.memo['dir'] = dir;
    const w = c.num('width');
    for (let i = 0; i < c.num('count'); i++) {
      const x = c.body.x + dir * (c.num('first', 2.5) + i * c.num('step'));
      if (x < c.arena.x0 + w / 2 || x > c.arena.x1 - w / 2) break;
      c.marks.push({ x, w, t01: 0 });
    }
    c.cue(c.body.x);
  },
  begin: none,
  tick(c, t) {
    const delay = c.num('delay');
    const life = c.num('columnTicks');
    const h = c.num('height');
    let over = true;
    c.marks.forEach((m, i) => {
      const at = i * delay;
      if (t === at) c.strike(m.x, m.w);
      if (t >= at && t < at + life) c.submit(column(c, m, h));
      if (t < at + life) over = false;
    });
    return over;
  },
  end: none,
};

const volley: BossHandler = {
  telegraph(c) {
    c.cue(c.body.x);
  },
  begin(c) {
    const spec = c.spec.shot!;
    const n = Math.round(c.num('count'));
    const spread = ((c.num('spread', 0) * Math.PI) / 180) * (n > 1 ? 1 : 0);
    const dir: 1 | -1 = c.heroX() >= c.body.x ? 1 : -1;
    const mx = c.body.x + dir * 0.9;
    const my = c.body.y + c.body.height * 0.7;
    const aim = datan2(c.heroY() + 0.9 - my, Math.max(0.5, Math.abs(c.heroX() - mx)));
    const speed = c.num('speed');
    for (let k = 0; k < n; k++) {
      const a = aim + (n > 1 ? (k / (n - 1) - 0.5) * spread : 0) + c.num('lift', 0);
      c.throwShot({ ...spec, speed: dcos(a) * speed, vy: dsin(a) * speed, gravity: c.num('arc', 0) }, mx, my, dir);
    }
    c.strike(mx, 1);
  },
  tick: (c, t) => t + 1 >= c.spec.attack.active,
  end: none,
};

const waves: BossHandler = {
  telegraph(c) {
    c.cue(c.body.x);
  },
  begin: none,
  tick(c, t) {
    const gap = c.num('gap');
    const n = c.num('count');
    if (t % gap === 0 && t / gap < n) {
      groundWaves(c, { ...c.spec.shot!, speed: c.num('speed') + (t / gap) * c.num('faster', 0) }, c.body.halfW + 0.3);
      c.strike(c.body.x, c.body.halfW * 2);
    }
    return t + 1 >= (n - 1) * gap + c.spec.attack.active;
  },
  end: none,
};

const stomp: BossHandler = {
  telegraph(c) {
    c.markStyle = 'column';
    c.marks.push({ x: c.body.x, w: c.num('shockWidth') * 2, t01: 0 });
    c.cue(c.body.x);
  },
  begin(c) {
    c.strike(c.body.x, c.num('shockWidth') * 2);
    if (c.spec.shot) groundWaves(c, c.spec.shot, c.body.halfW + 0.3);
  },
  tick(c, t) {
    const w = c.num('shockWidth');
    const f = floorOf(c);
    c.submit({ x0: c.body.x, x1: c.body.x + w, y0: f, y1: f + 0.8 }, 1);
    c.submit({ x0: c.body.x - w, x1: c.body.x, y0: f, y1: f + 0.8 }, -1);
    return t + 1 >= c.spec.attack.active;
  },
  end: none,
};

const dive: BossHandler = {
  telegraph(c) {
    c.stop();
    c.markStyle = 'column';
    c.marks.push({ x: clampX(c, c.heroX(), 2.4), w: 2.4, t01: 0 });
    c.memo['tx'] = c.marks[0]!.x;
    c.cue(c.memo['tx']!);
  },
  // it hangs over the hero and follows them while it winds up; for the last fourteen ticks it is locked on the spot it will fall on
  windup(c, t) {
    const lockAt = (c.memo['windUp'] ?? 1) - 14;
    if (t < lockAt) {
      const x = clampX(c, c.heroX(), 2.4);
      const track = c.num('track', 9);
      c.body.vx = Math.max(-track, Math.min(track, (x - c.body.x) * 6));
      c.marks[0]!.x = x;
      c.memo['tx'] = x;
    } else c.body.vx = 0;
    c.faceHero();
  },
  begin(c) {
    const tFloor = Math.max(0.05, (c.body.y - c.floorY) / c.num('speed'));
    c.body.vx = (c.memo['tx']! - c.body.x) / tFloor;
    c.body.vy = -c.num('speed');
    c.strike(c.memo['tx']!, 2.4);
  },
  tick(c, t) {
    c.submitMelee();
    const landed = c.body.grounded || c.body.hitLeft || c.body.hitRight || c.body.hitCeiling;
    if (landed) c.memo['landed'] = 1;
    return landed || t + 1 >= c.spec.attack.active;
  },
  end(c) {
    c.stop();
    c.memo['bonusRecovery'] = c.memo['landed'] ? c.num('stuck', 0) : 0;
  },
};

const teleport: BossHandler = {
  telegraph(c) {
    c.cue(c.body.x);
  },
  begin(c) {
    c.hidden = true;
    c.memo['gone'] = c.num('gone');
    c.memo['appear'] = c.num('appear');
    c.stop();
  },
  tick(c, t) {
    const gone = c.memo['gone']!;
    const appear = c.memo['appear']!;
    if (t < gone) return false;
    if (t === gone) {
      const behind = c.num('behind');
      const side = -c.heroFacing();
      let x = clampX(c, c.heroX() + side * behind, c.body.halfW * 2);
      if (Math.abs(x - c.heroX()) < 1.2) x = clampX(c, c.heroX() - side * behind, c.body.halfW * 2);
      c.teleportTo(x, floorOf(c));
      c.hidden = false;
      c.faceHero();
      c.cue(x);
      return false;
    }
    if (t < gone + appear) {
      c.faceHero();
      return false;
    }
    if (t === gone + appear) c.strike(c.body.x + c.facing * 1.5, 1.6);
    c.submitMelee();
    return t + 1 >= gone + appear + c.spec.attack.active;
  },
  end(c) {
    c.hidden = false;
    c.stop();
  },
};

const burst: BossHandler = {
  telegraph(c) {
    c.cue(c.body.x);
  },
  begin(c) {
    const spec = c.spec.shot!;
    const n = Math.round(c.num('count'));
    const lo = (c.num('minAngle', 5) * Math.PI) / 180;
    const hi = (c.num('maxAngle', 75) * Math.PI) / 180;
    const speed = c.num('speed');
    const x = c.body.x;
    const y = c.body.y + c.body.height * 0.55;
    for (const side of [-1, 1] as const) {
      for (let k = 0; k < n; k++) {
        const a = n > 1 ? lo + (k / (n - 1)) * (hi - lo) : (lo + hi) / 2;
        c.throwShot({ ...spec, speed: dcos(a) * speed, vy: dsin(a) * speed, gravity: c.num('arc', 0) }, x + side * 0.7, y, side);
      }
    }
    c.strike(x, c.body.halfW * 2);
  },
  tick: (c, t) => t + 1 >= c.spec.attack.active,
  end: none,
};

export const BOSS_HANDLERS: Readonly<Record<BossHandlerId, BossHandler>> = { charge, sweep, leap, eruptions, march, volley, waves, stomp, dive, teleport, burst };

