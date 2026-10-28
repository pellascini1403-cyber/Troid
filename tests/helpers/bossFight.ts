import { PLAYER } from '@/content/player';
import type { Rect } from '@/core/math';
import type { Boss } from '@/enemies/boss/Boss';
import type { BossAttackSpec, BossHurtbox } from '@/enemies/boss/BossDefinition';
import type { Enemy } from '@/enemies/Enemy';
import { Brawler, type FightResult } from './brawler';
import type { Driver } from './sim';
import { FALLBACK, TACTICS } from './tactics';

/**
 * THE FIGHTER OF A GUARDIAN (docs/PROMPT22-LOG.md §4): a scripted player with the inputs of a person who reads a boss the way the picture lets them — the warning on the floor (its marks), what it is doing (its state), where its weak point is
 * and when it shows — and nothing else. It is the same for every guardian of the engine; what changes is where the weak point is and what it asks (a jump, a place behind). It is how a boss is proven BEATABLE by a mortal hero — with the damage
 * it cost and the bottles it took.
 *
 *  - **the warning**: every mark on the floor is a zone to be out of (a column, a lane, the landing of a leap, the fall of a flyer); the hero goes to the nearest place that is out of all of them and clear of the shock, and dashes when there is no time;
 *  - **what flies**: a hop over the waves along the floor and over the shots at the height of the body;
 *  - **the opening**: while the boss recovers and its weak point shows (`exposed`), the hero stands where the sword reaches that point (and jumps, if it is high) and strikes;
 *  - **the creatures it calls**: answered as any creature is (`tactics.ts`);
 *  - **a bottle** when the life is low and the boss is shut (the roar between phases, a long recovery far away).
 */
const HW = PLAYER.body.halfWidth;
/** The spare metres kept from a zone of the boss's, beyond the width of the body. */
const CLEAR = 0.2;
const SWORD = PLAYER.combat.attacks['slash_1']!.hitbox;
const AIR = PLAYER.combat.attacks['air_slash']!.hitbox;

interface Zone {
  x0: number;
  x1: number;
}

/**
 * What a guardian asks beyond the common reading, written down once (it is the answer its design names): the Crystal Colossus throws its shards over a hero who stands at its feet and shakes the floor — be close and hop the shake; a surge along the
 * floor is crossed and followed. A guardian without a profile is read the common way.
 */
interface Profile {
  /** Stand this close to the boss while it makes up its mind (m): inside the ring where what it throws lands. */
  hug?: number;
  /** The patterns whose shock along the floor is hopped instead of fled. */
  hopOver?: readonly string[];
}
const PROFILES: Readonly<Record<string, Profile>> = {
  boss_colossus: { hug: 2.4, hopOver: ['stomp'] },
};

export interface BossResult extends FightResult {
  /** The phase the boss was in when the fight ended (1-based), the life the boss had left and the most the hero was ever down to. */
  phase: number;
  bossLife: number;
  lowest: number;
}

export class BossFighter {
  readonly f: Brawler;
  private lastExposes = false;
  private lastId: string | null = null;
  /** The jump of a strike on a high weak point: ticks since the press, or −1. */
  private hop = -1;
  private lowest: number;
  /** What the last decision was (for a person reading a trace). */
  why = '';
  /** For a surge along the floor: the place behind the boss, which the hero crosses to (the boss has no body to hurt them while it winds up, and the surge goes away from them). */
  private behind: number | null = null;

  constructor(
    readonly d: Driver,
    readonly boss: Boss,
  ) {
    this.f = new Brawler(d, TACTICS, FALLBACK);
    this.f.decide = () => this.decide();
    this.lowest = d.p.health.current;
  }

  // -------------------------------------------------------------------------------------------------- reading the boss

  private get arena(): Readonly<Rect> {
    return this.boss.arena;
  }

  /** The zones of the floor that will hurt, from what the boss is showing: the marks of its warning, and what its pattern adds. */
  private zones(): Zone[] {
    const b = this.boss;
    this.behind = null;
    if (b.state !== 'telegraph' && b.state !== 'attack') return [];
    const spec = b.attackId ? b.def.attacks[b.attackId] : undefined;
    if (!spec) return [];
    const marks = b.telegraphMarks;
    const out: Zone[] = [];
    this.behind = spec.handler === 'charge' ? b.body.x - b.facing * (b.def.body.halfWidth + 1.6) : null;
    switch (spec.handler) {
      case 'eruptions':
      case 'march':
      case 'stomp':
      case 'charge':
      case 'sweep':
        for (const m of marks) {
          // (a surge hurts with the hitbox of its attack, which reaches beyond the front of its body: the end of the lane is that much farther)
          const reach = spec.handler === 'charge' ? spec.attack.hitbox.x + spec.attack.hitbox.w : 0;
          out.push({ x0: m.x - m.w / 2 - (b.facing < 0 ? reach : 0), x1: m.x + m.w / 2 + (b.facing > 0 ? reach : 0) });
        }
        if (spec.handler === 'stomp') {
          const w = spec.params['shockWidth'] as number;
          out.push({ x0: b.body.x - w, x1: b.body.x + w });
        }
        if (spec.handler === 'charge') out.push({ x0: b.body.x - b.def.body.halfWidth, x1: b.body.x + b.def.body.halfWidth });
        break;
      case 'leap': {
        const target = marks[0]?.x ?? b.body.x;
        const w = spec.params['shockWidth'] as number;
        // the body flies from where it is to where it lands, and the floor shakes either side of that
        out.push({ x0: Math.min(b.body.x, target) - b.def.body.halfWidth - 0.4, x1: Math.max(b.body.x, target) + b.def.body.halfWidth + 0.4 });
        out.push({ x0: target - w - 0.3, x1: target + w + 0.3 });
        break;
      }
      case 'dive': {
        const m = marks[0];
        const at = m?.x ?? b.body.x;
        out.push({ x0: at - 2.4 - 0.2, x1: at + 2.4 + 0.2 });
        break;
      }
      case 'teleport':
        // once it is back it cuts in front of itself
        if (b.state === 'attack' && !b.invulnerable) out.push({ x0: Math.min(b.body.x, b.body.x + b.facing * 3), x1: Math.max(b.body.x, b.body.x + b.facing * 3) });
        break;
      default:
        break;
    }
    return out;
  }

  /** Is it open: recovering from an attack that leaves it so, and its weak point shows? */
  private get exposed(): boolean {
    const b = this.boss;
    if (b.attackId) {
      this.lastId = b.attackId;
      this.lastExposes = b.def.attacks[b.attackId]!.exposes !== false;
    }
    return (b.state === 'recover' || b.state === 'hurt') && this.lastExposes;
  }

  /** The part of it that hurts: the first of its regions that is not armour and takes the blow when it is open (or always). */
  private weakPoint(): BossHurtbox | undefined {
    const parts = this.boss.def.hurtboxes.filter((h) => h.multiplier > 0);
    return parts.find((h) => h.when?.includes('exposed')) ?? parts.sort((a, c) => c.multiplier - a.multiplier)[0];
  }

  /** The world rectangle of one of its regions, as it stands now. */
  private regionOf(h: BossHurtbox): Rect {
    const b = this.boss;
    const a = b.body.x + b.facing * h.x;
    const c = b.body.x + b.facing * (h.x + h.w);
    return { x0: Math.min(a, c), x1: Math.max(a, c), y0: b.body.y + h.y, y1: b.body.y + h.y + h.h };
  }

  // -------------------------------------------------------------------------------------------------- deciding

  private hits(z: Zone[], x: number, extra = CLEAR): boolean {
    return z.some((q) => x + HW + extra > q.x0 && x - HW - extra < q.x1);
  }

  /** The nearest place in the arena that is out of every zone. */
  private safeX(z: Zone[], from: number): number {
    const lo = this.arena.x0 + 0.8;
    const hi = this.arena.x1 - 0.8;
    const cands = [from];
    for (const q of z) cands.push(q.x0 - HW - CLEAR - 0.05, q.x1 + HW + CLEAR + 0.05);
    const ok = cands.filter((x) => x >= lo && x <= hi && !this.hits(z, x));
    if (ok.length === 0) return Math.min(hi, Math.max(lo, from));
    return ok.sort((p, q) => Math.abs(p - from) - Math.abs(q - from))[0]!;
  }

  private decide(): void {
    const f = this.f;
    const d = this.d;
    const b = this.boss;
    const me = f.me;
    this.lowest = Math.min(this.lowest, me.life);
    if (b.state === 'dead' || d.p.health.dead) return;
    const exposed = this.exposed;
    const zones = this.zones();

    // 0. a shock along the floor is hopped: in the air while it shakes
    const spec = b.attackId ? b.def.attacks[b.attackId] : undefined;
    const prof = PROFILES[b.def.id];
    if (spec && prof?.hopOver?.includes(b.attackId!) && (b.state === 'telegraph' || b.state === 'attack')) {
      this.why = 'hop-shock';
      if (b.state === 'telegraph' && b.stateTicks >= spec.attack.startup - 20 && me.grounded) f.jump(26);
      return;
    }

    // 1. what is about to fall on the hero: out of it (a dash, if there is no time)
    if (zones.length > 0 && this.hits(zones, me.x)) {
      const cross = this.behind !== null && !this.hits(zones, this.behind) && b.state === 'telegraph' && Math.abs(this.behind - me.x) < 9 ? this.behind : null;
      const x = cross ?? this.safeX(zones, me.x);
      const away = x - me.x;
      const time = b.state === 'telegraph' ? Math.max(0, this.windLeft()) : 0;
      this.hop = -1;
      this.why = 'evade';
      // (a dash carries 3.5 m in ten ticks; a run, 0.14 m a tick)
      if (Math.abs(away) > 1.2 && f.dashReady && (time < Math.abs(away) / 0.14 || b.state === 'attack')) return f.dash(away > 0 ? 1 : -1);
      f.walk(away > 0 ? 1 : -1);
      return;
    }

    // 1b. behind a boss that surges away from the hero: after it, so as to be at its back when the surge ends
    if (spec && spec.handler === 'charge' && b.state === 'attack' && (me.x - b.body.x) * b.facing < 0) {
      this.why = 'chase';
      const after = (b.body.x > me.x ? 1 : -1) as 1 | -1;
      // (a dash carries 3.5 m in ten ticks, and it is ready again before the surge is over: after it with both)
      if (f.dashReady && Math.abs(b.body.x - me.x) > 5) return f.dash(after);
      f.walk(after);
      return;
    }

    // 2. what comes along the floor or flies at the chest
    if (f.dodgeShots()) {
      this.hop = -1;
      this.why = 'hop-shot';
      return;
    }

    // 3. a bottle when the life is low and nothing is about to fall: between phases, while the boss makes up its mind, or in a recovery the hero cannot use (far, or shut)
    const critical = me.life <= 2;
    const low = me.life <= Math.ceil(d.p.health.max / 2);
    const calm = zones.length === 0 && f.shots(10).length === 0;
    if (calm && f.canDrink && (critical || low) && (b.state === 'shift' || b.state === 'intro' || b.state === 'choose' || (b.state === 'recover' && (critical || !exposed || Math.abs(b.body.x - me.x) > 5)))) {
      this.why = 'drink';
      return f.drink();
    }

    // 4. the creatures it called: as any creature is answered
    const foes = f.foes(12, 6);
    const hot = foes.find((q) => q.gap < 5 && ['telegraph', 'windup', 'attack', 'smash', 'rush', 'leap', 'land', 'roll', 'curl', 'lock', 'drop', 'bite', 'rise', 'fuse', 'blast', 'aim', 'fire', 'swoop', 'slash', 'appear', 'bloom', 'burst', 'crouch', 'swing', 'toll'].includes(q.state));
    if (hot) {
      this.why = `foe:${hot.id}`;
      return (TACTICS[hot.id] ?? FALLBACK)(f, hot);
    }

    // 5. the opening: stand where the sword reaches the weak point, and strike — once what it threw has gone by
    const weak = this.weakPoint();
    // (a wave along the floor is hopped as the hero goes; what flies and falls — the shards of a burst — is waited for)
    const incoming = f.shots(8).some((q) => q.spec.mode === 'air' && q.facing === (me.x >= q.x ? 1 : -1));
    if (incoming && weak) {
      this.hop = -1;
      this.why = 'hold';
      return this.neutral();
    }
    const always = weak && !weak.when;
    if (weak && (exposed || (always && !b.invulnerable && b.state !== 'dormant' && b.state !== 'intro')) && (!exposed || this.canReach(weak))) {
      this.why = 'strike';
      return this.strikeAt(weak);
    }
    this.hop = -1;

    // 6. the creatures it called, between its attacks
    const near = foes.find((q) => q.gap < 9);
    if (near && !exposed) {
      this.why = `near:${near.id}`;
      return (TACTICS[near.id] ?? FALLBACK)(f, near);
    }

    // 7. neutral: far enough to read it, with room behind
    this.why = 'neutral';
    this.neutral();
  }

  /**
   * Is there time to get to the weak point and strike before the boss is shut again? A person reads it off the picture (a boss that has run to the other end of the arena is not worth chasing; one stuck in a wall is). The opening is the
   * recovery of the attack it just made, longer by the stun of a surge that ended against a wall.
   */
  private canReach(h: BossHurtbox): boolean {
    const b = this.boss;
    const spec = this.lastSpec();
    // (only a boss that runs away from its own opening is worth weighing: the others stand where they struck)
    if (!spec || !Object.values(b.def.attacks).some((a) => a.handler === 'charge')) return true;
    const tempo = b.def.phases[b.phase - 1]?.tempo ?? 1;
    const atWall = b.body.x > this.arena.x1 - 2.4 || b.body.x < this.arena.x0 + 2.4;
    const stun = spec.handler === 'charge' && atWall ? (spec.params['wallStun'] as number) : 0;
    const left = spec.attack.recovery * tempo + stun - (b.state === 'recover' ? b.stateTicks : 0);
    const r = this.regionOf(h);
    const dist = Math.max(0, Math.abs(this.f.me.x - (r.x0 + r.x1) / 2) - 1.2);
    return dist / 0.13 + 14 < left; // (8.5 m/s is 0.14 m a tick; and a blow takes time)
  }

  private lastSpec(): BossAttackSpec | undefined {
    return this.lastId ? this.boss.def.attacks[this.lastId] : undefined;
  }

  /** Ticks left of the wind-up. */
  private windLeft(): number {
    const b = this.boss;
    const spec = b.attackId ? b.def.attacks[b.attackId] : undefined;
    return spec ? spec.attack.startup * 0.9 - b.stateTicks : 0;
  }

  private neutral(): void {
    const f = this.f;
    const b = this.boss;
    const me = f.me;
    const lo = this.arena.x0 + 3;
    const hi = this.arena.x1 - 3;
    const hug = PROFILES[b.def.id]?.hug;
    if (hug !== undefined) {
      const sd: 1 | -1 = me.x >= b.body.x ? 1 : -1;
      const want = Math.min(this.arena.x1 - 2, Math.max(this.arena.x0 + 2, b.body.x + sd * hug));
      if (!f.toward(want, 0.3)) return;
      return f.face(-sd as 1 | -1);
    }
    // a boss that throws arcs (a burst, a volley of sparks) lands them within about 7 m of itself, and not inside 3: out of that ring, unless the wall side is the bait
    const throws = (b.def.phases[b.phase - 1]?.attacks ?? []).some((id) => b.def.attacks[id]?.handler === 'burst');
    // a boss that surges along the floor is baited toward a wall: stand between it and the nearer wall, so that its surge ends there (a long stun) and the back it shows is the hero's side after they cross
    if (Object.values(b.def.attacks).some((a) => a.handler === 'charge')) {
      const wallSide: 1 | -1 = this.arena.x1 - b.body.x < b.body.x - this.arena.x0 ? 1 : -1;
      const want = Math.min(hi, Math.max(lo, b.body.x + wallSide * (throws ? 8 : 4.8)));
      if (!f.toward(want, 0.5)) return;
      return f.face(-wallSide as 1 | -1);
    }
    // far enough to read it and out of the reach of what it throws (shards land within 5.5 m): on the side the hero is on, unless the wall leaves less than 6.8 m there
    let side: 1 | -1 = me.x >= b.body.x ? 1 : -1;
    const room = (sd: 1 | -1): number => Math.abs(Math.min(hi, Math.max(lo, b.body.x + sd * 8)) - b.body.x);
    if (room(side) < 6.8 && room(-side as 1 | -1) > room(side)) side = -side as 1 | -1;
    const want = Math.min(hi, Math.max(lo, b.body.x + side * 8));
    if (!f.toward(want, 0.6)) return;
    f.face(side === 1 ? -1 : 1);
  }

  /** Go to the place from which the sword reaches the weak point, and strike (a high one with a jump: the Ground Slam from above if the hero has it, the sword in the air if not). */
  private strikeAt(h: BossHurtbox): void {
    const f = this.f;
    const me = f.me;
    const b = this.boss;
    const r = this.regionOf(h);
    const cx = (r.x0 + r.x1) / 2;
    // the side of the point the hero stands on: the outer side of one that is not in the middle of the boss (a vent on its back), else the side they are on
    const side: 1 | -1 = Math.abs(cx - b.body.x) > 0.4 ? (cx > b.body.x ? 1 : -1) : me.x < cx ? -1 : 1;
    const dir = -side as 1 | -1; // the way the sword points
    const floor = b.floorY;
    const reachY = (y: number): boolean => r.y1 >= y + SWORD.y && r.y0 <= y + SWORD.y + SWORD.h;
    const airY = (y: number): boolean => r.y1 >= y + AIR.y && r.y0 <= y + AIR.y + AIR.h;
    const slam = !reachY(floor) && this.d.session.abilities.has('ground_slam');
    // (the slam falls on the point: the hero stands over it; the sword reaches it from the side)
    const stand = slam ? cx : cx + side * (SWORD.x + SWORD.w / 2);
    const there = Math.abs(me.x - stand) <= (slam ? 0.3 : 0.4);
    if (!there) {
      if (this.hop < 0) f.toward(stand, slam ? 0.15 : 0.25);
      else if (slam && !me.grounded) f.toward(stand, 0.15); // (a little air control while up)
      return;
    }
    f.toward(stand, slam ? 0.15 : 0.25);
    if (!slam && me.facing !== dir) return f.face(dir);
    if (reachY(floor) && this.hop < 0) {
      f.swing();
      return;
    }
    // a weak point above the sword on the ground: a jump, and the blow from above or in the air
    if (this.hop < 0) {
      if (me.grounded) {
        f.jump(26);
        this.hop = 0;
      }
      return;
    }
    this.hop++;
    if (me.grounded && this.hop > 3) {
      this.hop = -1;
      return;
    }
    if (slam) {
      // over the point and high enough that the fall passes through it
      if (!me.grounded && this.hop >= 3 && (me.y >= r.y0 + 0.2 || me.vy <= 0.5)) f.slam();
      return;
    }
    if (airY(me.y) && this.hop >= 3) f.swing();
  }

  // -------------------------------------------------------------------------------------------------- running

  /** Plays until the boss falls, the hero does, or `max` ticks pass. */
  run(max = 14000): BossResult {
    const r = this.f.run(() => this.boss.state === 'dead' || this.boss.expired || this.boss.health.dead, max);
    return { ...r, phase: this.boss.phase, bossLife: this.boss.health.current, lowest: this.lowest };
  }
}

/** The enemy-kind entities alive in the session (the creatures a boss called). */
export const creaturesOf = (d: Driver): Enemy[] => d.session.entities.filter((e): e is Enemy => e.kind === 'enemy' && !(e as Enemy).health.dead);
