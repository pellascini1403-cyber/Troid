import { PLAYER } from '@/content/player';
import type { Rect } from '@/core/math';
import { overlaps } from '@/core/math';
import type { Enemy } from '@/enemies/Enemy';
import { EnemyShot } from '@/enemies/EnemyShot';
import { SPIRIT_BOLT } from '@/content/skills';
import { floorAhead } from '@/enemies/senses';
import type { Driver } from './sim';

/**
 * A BRAWLER (docs/PROMPT22-LOG.md §4): a scripted player with the inputs of a person who fights — the stick, jump, attack, dash, a bottle — and nothing else. It reads a creature the way a person does, by what it is DOING (the state its brain
 * shows is the telegraph the picture draws), and answers it the way the content says it is answered (`tactics.ts`: one small policy for each creature). It is how an encounter is proven BEATABLE by a mortal hero — with the damage it cost.
 */
export interface Me {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  facing: 1 | -1;
  /** The controller's state (`free`, `crouch`, `attack`, `dash`, `hurt`, `drink`…). */
  state: string;
  life: number;
}

/** A creature as the fighter sees it: where it is, what it is doing, how long it has been doing it. */
export interface Foe {
  entity: Enemy;
  id: string;
  x: number;
  y: number;
  hw: number;
  h: number;
  facing: 1 | -1;
  state: string;
  ticks: number;
  hp: number;
  /** Its x less the hero's, and the side of the hero it is on (+1: to the right). */
  dx: number;
  side: 1 | -1;
  /** Horizontal distance between the centres. */
  gap: number;
}

export type Tactic = (f: Brawler, foe: Foe) => void;

/** The states in which a creature is about to hit or hitting: the telegraph and the blow, by every name the brains give them. */
const HOT = new Set(['telegraph', 'windup', 'attack', 'smash', 'rush', 'leap', 'land', 'roll', 'curl', 'lock', 'drop', 'bite', 'rise', 'fuse', 'blast', 'aim', 'fire', 'swoop', 'slash', 'appear', 'bloom', 'burst', 'crouch', 'swing', 'toll', 'weave']);
/** The band of height the bolt crosses (m above the feet): its muzzle is at the chest and the bolt is half a metre tall. */
const BOLT = { y0: SPIRIT_BOLT.projectile!.muzzle.y - SPIRIT_BOLT.projectile!.size.h / 2, y1: SPIRIT_BOLT.projectile!.muzzle.y + SPIRIT_BOLT.projectile!.size.h / 2 };
/** The reach of the sword (m from the centre of the body, facing it): the standing blow, `slash_1`. */
const SWORD = PLAYER.combat.attacks['slash_1']!.hitbox;
/** A swing every so many ticks: the whole of the blow (startup, active, recovery) and a tick to spare, so the next press starts a new one. */
const SWING_EVERY = 15;

export interface FightResult {
  won: boolean;
  /** Ticks it took. */
  ticks: number;
  /** Points of life lost, bottles drunk, swings made, times the hero went down. */
  hurt: number;
  drinks: number;
  swings: number;
  deaths: number;
}

export class Brawler {
  tickCount = 0;
  hurt = 0;
  drinks = 0;
  swings = 0;
  private lastLife: number;
  private swingAt = -99;
  private castAt = -99;
  casts = 0;
  private releaseJumpAt = -1;
  private readonly pulses: Array<'attack' | 'dash' | 'bottle' | 'jump' | 'interact' | 'ability'> = [];
  /** A free-form memory of the tactic (what it decided a few ticks ago). */
  memo: Record<string, number> = {};
  /** Never walks off a ledge: a fight is fought on the floor it began on (a hero who backs away from a blow does not back into a pit). Off for a fight that wants the edge. */
  edgeGuard = true;
  /** Called after every tick (a trace for a person reading a fight). */
  onTick: ((f: Brawler) => void) | null = null;

  constructor(
    readonly d: Driver,
    readonly tactics: Readonly<Record<string, Tactic>>,
    private readonly fallback: Tactic,
  ) {
    this.lastLife = d.p.health.current;
  }

  // -------------------------------------------------------------------------------------------------- perception

  get me(): Me {
    const b = this.d.body;
    return { x: b.x, y: b.y, vx: b.vx, vy: b.vy, grounded: b.grounded, facing: this.d.p.facing, state: this.d.p.controller.state, life: this.d.p.health.current };
  }

  /** The creatures that are alive and within `range` metres across (and `height` up or down), nearest first. */
  foes(range = 18, height = 10): Foe[] {
    const me = this.d.body;
    const out: Foe[] = [];
    for (const e of this.d.session.entities) {
      if (e.kind !== 'enemy') continue;
      const en = e as unknown as Enemy;
      if (en.health.dead || en.expired) continue;
      const dx = en.body.x - me.x;
      if (Math.abs(dx) > range || Math.abs(en.body.y - me.y) > height) continue;
      out.push({
        entity: en,
        id: en.def.id,
        x: en.body.x,
        y: en.body.y,
        hw: en.body.halfW,
        h: en.body.height,
        facing: en.facing,
        state: en.state,
        ticks: en.stateTicks,
        hp: en.health.current,
        dx,
        side: dx >= 0 ? 1 : -1,
        gap: Math.abs(dx),
      });
    }
    return out.sort((a, b) => a.gap - b.gap);
  }

  shots(range = 12): EnemyShot[] {
    const me = this.d.body;
    return this.d.session.entities.filter((e): e is EnemyShot => e instanceof EnemyShot && !e.expired && Math.abs(e.x - me.x) <= range);
  }

  /** Would a standing blow, from where the hero is and the way they face, reach this creature? */
  inSword(foe: Foe, facing: 1 | -1 = this.d.p.facing, slack = 0): boolean {
    const me = this.d.body;
    const a = me.x + facing * SWORD.x;
    const b = me.x + facing * (SWORD.x + SWORD.w);
    const sword: Rect = { x0: Math.min(a, b) - slack, x1: Math.max(a, b) + slack, y0: me.y + SWORD.y, y1: me.y + SWORD.y + SWORD.h };
    return overlaps(sword, { x0: foe.x - foe.hw, x1: foe.x + foe.hw, y0: foe.y, y1: foe.y + foe.h });
  }

  /** The distance (centre to centre) at which a blow from the side the hero faces just reaches a creature of this half-width. */
  strikeGap(foe: Foe, back = 0.35): number {
    return SWORD.x + SWORD.w + foe.hw - back;
  }

  // -------------------------------------------------------------------------------------------------- actions (they set the inputs for this tick)

  /** Move along the floor at `speed` (0 … 1) toward `dir`; 0 stops. */
  walk(dir: -1 | 0 | 1, speed = 1): void {
    this.d.moveX = dir * speed;
  }

  /** Go to `x` and stop there within `tol`, braking early enough not to run past it. Returns true when the hero is there. */
  toward(x: number, tol = 0.15): boolean {
    const b = this.d.body;
    const dx = x - b.x;
    if (Math.abs(dx) <= tol && Math.abs(b.vx) < 1.5) {
      this.d.moveX = 0;
      return true;
    }
    const v = Math.abs(b.vx);
    const stop = (v * v) / (2 * 95) + 0.05;
    if (Math.sign(dx) === Math.sign(b.vx) && Math.abs(dx) <= stop + tol) this.d.moveX = 0;
    else this.d.moveX = Math.sign(dx) * (Math.abs(dx) > 1.6 ? 1 : Math.abs(dx) > 0.5 ? 0.6 : 0.3);
    return Math.abs(dx) <= tol;
  }

  /** Face a side without going anywhere to speak of (a slow step toward it). */
  face(side: 1 | -1): void {
    if (this.d.p.facing !== side) this.d.moveX = side * 0.3;
  }

  /** Press jump now and keep it held for `hold` ticks (the whole of a jump is 26). */
  jump(hold = 26): void {
    if (this.d.p.controller.state === 'free' || this.d.p.controller.state === 'crouch') {
      this.d.press('jump');
      this.releaseJumpAt = this.tickCount + hold;
    }
  }

  /** Dash toward `dir` (the stick is set to it for the tick: a dash goes the way the stick says, and the way the hero faces without it). Not off a ledge into nothing: a dash carries 3.5 m. */
  dash(dir: -1 | 1): void {
    const b = this.d.body;
    if (b.grounded && !floorAhead(this.d.session.collision, b, dir, 3.2, 6.5)) return;
    this.d.moveX = dir;
    this.pulses.push('dash');
  }

  /** A blow, if the hero can make one now and the last one has run its course. True when the button was pressed. */
  swing(): boolean {
    const st = this.d.p.controller.state;
    if (this.tickCount - this.swingAt < SWING_EVERY || (st !== 'free' && st !== 'attack')) return false;
    if (st === 'attack' && this.tickCount - this.swingAt < 9) return false;
    this.pulses.push('attack');
    this.swingAt = this.tickCount;
    this.swings++;
    return true;
  }

  /** Would the Spirit Bolt, from where the hero is and the way they face, cross this creature? (It flies level, from the chest, twelve metres.) */
  inBolt(foe: Foe, facing: 1 | -1 = this.d.p.facing): boolean {
    const me = this.d.body;
    if ((foe.x - me.x) * facing <= 0 || Math.abs(foe.x - me.x) > 11) return false;
    return foe.y < me.y + BOLT.y1 + 0.1 && foe.y + foe.h > me.y + BOLT.y0 - 0.1;
  }

  /** The bolt can be cast: the hero has it, the magic for it, the hands free, and the last cast is behind. */
  get canCast(): boolean {
    const s = this.d.session;
    const st = this.d.p.controller.state;
    return s.abilities.has('magic_attack') && s.magic.current >= SPIRIT_BOLT.cost && (st === 'free' || st === 'crouch') && this.tickCount - this.castAt >= 24;
  }

  /** The Spirit Bolt (the ability key): true when the press was made. */
  cast(): boolean {
    if (!this.canCast) return false;
    this.pulses.push('ability');
    this.castAt = this.tickCount;
    this.casts++;
    return true;
  }

  /** The Ground Slam (down and attack in the air, with the ability): true when the press was made. */
  slam(): boolean {
    const d = this.d;
    if (d.body.grounded || !d.session.abilities.has('ground_slam') || d.p.controller.state !== 'free') return false;
    d.moveY = -1;
    this.pulses.push('attack');
    this.swings++;
    return true;
  }

  /** Face the creature and strike when the sword would reach it. */
  strike(foe: Foe): boolean {
    this.face(foe.side);
    if (this.d.p.facing === foe.side && this.inSword(foe)) return this.swing();
    return false;
  }

  /** Is there floor to step back onto, a couple of metres behind (not a ledge or a pit)? */
  canBack(dir: -1 | 1): boolean {
    return floorAhead(this.d.session.collision, this.d.body, dir, 2.0, 2.5);
  }

  /** The dash is ready: the key is not on its cooldown and the hero is free to use it. */
  get dashReady(): boolean {
    const c = this.d.p.controller;
    return c.state === 'free' && c.dashCooldown01 === 0;
  }

  /**
   * Over what comes along the floor, out of the way of what flies at the chest: a hop when a wave is about to arrive, a hop when a spit is at the height of the body and close. True when it pressed the jump.
   * (A person reads the shot's flight and jumps when it is a body's length away.)
   */
  dodgeShots(): boolean {
    const me = this.d.body;
    if (!me.grounded || this.d.p.controller.state !== 'free') return false;
    for (const s of this.shots(9)) {
      const toward = s.facing === (me.x >= s.x ? 1 : -1);
      if (!toward) continue;
      const gap = Math.abs(me.x - s.x);
      const low = s.spec.mode === 'ground';
      const atBody = s.y > me.y - 0.2 && s.y < me.y + 1.7;
      if (gap < (low ? 2.6 : 3.2) && atBody) {
        this.jump(26);
        return true;
      }
    }
    return false;
  }

  /** Drink a bottle when it is worth it and there is time (the channel is 24 ticks standing still). */
  drink(): void {
    this.d.moveX = 0;
    this.d.moveY = 0;
    this.pulses.push('bottle');
    this.drinks++;
  }

  get canDrink(): boolean {
    const p = this.d.p;
    return p.controller.state === 'free' && this.d.body.grounded && this.d.session.bottles.readyCount > 0 && p.health.current < p.health.max;
  }

  // -------------------------------------------------------------------------------------------------- the loop

  /** Clears the inputs the last decision left; releases what is due. */
  private begin(): void {
    const d = this.d;
    d.moveX = 0;
    d.moveY = 0;
    if (this.releaseJumpAt >= 0 && this.tickCount >= this.releaseJumpAt) {
      d.release('jump');
      this.releaseJumpAt = -1;
    }
  }

  /** The pulses of this tick are pressed before the tick and let go after it. */
  private pressPulses(): void {
    for (const b of this.pulses) this.d.press(b);
  }
  private releasePulses(): void {
    for (const b of this.pulses) this.d.release(b);
    this.pulses.length = 0;
  }

  /** Replaces the reading of creatures with a decision of its own (a guardian is not a creature: `bossFight.ts`). */
  decide: (() => void) | null = null;

  /** One tick: look, decide, play. */
  step(): void {
    this.begin();
    if (this.decide) this.decide();
    else {
      const foes = this.foes();
      const target = this.pick(foes);
      if (target) (this.tactics[target.id] ?? this.fallback)(this, target);
    }
    if (this.edgeGuard && this.d.body.grounded && this.d.moveX !== 0 && this.d.p.controller.state === 'free') {
      const dir = this.d.moveX > 0 ? 1 : -1;
      if (!floorAhead(this.d.session.collision, this.d.body, dir, 0.9, 6.5)) this.d.moveX = 0; // (a drop to a floor below is a way down; a drop into nothing is a pit)
      else if (this.exitAhead(dir)) this.d.moveX = 0; // (and a fight does not leave the room)
    }
    this.pressPulses();
    this.d.step(1);
    this.releasePulses();
    this.tickCount++;
    const life = this.d.p.health.current;
    if (life < this.lastLife) this.hurt += this.lastLife - life;
    this.lastLife = life;
    this.onTick?.(this);
  }

  /** Would a step toward `dir` put the hero into a way out of the room (that is open to them)? A fight is fought in the room it began in: a hero who backs away from a blast does not back out of the door. */
  exitAhead(dir: -1 | 1): boolean {
    const s = this.d.session;
    const b = this.d.body;
    const body = (x: number): Rect => ({ x0: x - b.halfW, x1: x + b.halfW, y0: b.y, y1: b.y + b.height });
    const now = body(b.x);
    const next = body(b.x + dir * 0.7);
    for (const x of s.room.exits ?? []) {
      if (!x.to || (x.requires !== undefined && !s.flags.has(x.requires))) continue;
      if (overlaps(next, x.rect) && !overlaps(now, x.rect)) return true;
    }
    return false;
  }

  /** The creature that matters most now: the nearest one that is winding up or hitting, else the maker of creatures if there is one (put it out first), else the nearest. */
  protected pick(foes: Foe[]): Foe | undefined {
    const hot = foes.find((f) => f.gap < 5 && HOT.has(f.state));
    if (hot) return hot;
    return foes.find((f) => f.id === 'ink_weaver') ?? foes[0];
  }

  /** Plays until `done` is true, the hero falls or `max` ticks pass. */
  run(done: () => boolean, max = 4000): FightResult {
    const t0 = this.tickCount;
    let deaths = 0;
    while (this.tickCount - t0 < max && !done()) {
      if (this.d.p.health.dead) {
        deaths++;
        break;
      }
      this.step();
    }
    this.d.stop();
    this.d.release('jump');
    return { won: done() && !this.d.p.health.dead, ticks: this.tickCount - t0, hurt: this.hurt, drinks: this.drinks, swings: this.swings, deaths };
  }
}
