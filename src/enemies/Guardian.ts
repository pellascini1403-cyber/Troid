import type { Combatant, HitInfo, HitOutcome, Hurtbox } from '@/combat/Combatant';
import { Health } from '@/combat/Health';
import { attackRect } from '@/combat/hitboxGeometry';
import { approach, type Rect } from '@/core/math';
import { StateMachine, type StateHooks } from '@/core/stateMachine';
import { TICK_SECONDS } from '@/core/time';
import { Actor } from '@/gameplay/Actor';
import type { SimEntity } from '@/gameplay/SimEntity';
import type { SimServices } from '@/gameplay/SimServices';
import { createActorViewState, type ActorViewState } from '@/presentation/actorViewState';
import type { GuardianDefinition } from './GuardianDefinition';

export type GuardianState = 'dormant' | 'intro' | 'choose' | 'telegraph' | 'attack' | 'recover' | 'hurt' | 'dead';
export type GuardianAttack = 'charge' | 'rain';

/** A spot the telegraph marks on the floor, in world metres: where it will strike, how wide, and how far the warning has built (0 → 1). */
export interface GuardianMark {
  x: number;
  w: number;
  t01: number;
}

/** What the view reads of the guardian, on top of every actor's. Nothing here mentions shapes or textures. */
export interface GuardianViewState extends ActorViewState {
  /** Which attack is being wound up / thrown (`null` between them). */
  attack: GuardianAttack | null;
  /** The warning on the floor while it winds up (empty otherwise). */
  marks: GuardianMark[];
  /** The second phase: it moves faster and the crest burns. */
  enraged: boolean;
  /** Awake: the crest is lit (false while it waits dormant). */
  awake: boolean;
}

/** Fastest the guardian can fall (m/s). */
const TERMINAL_VELOCITY = 26;
/** Below this horizontal gap (m) it does not turn around to face the hero (no jitter when directly above). */
const FACING_DEAD_ZONE = 0.15;

/**
 * The boss (docs/PROMPT6-LOG.md S29): a `SimEntity` that is also a `Combatant` and an `Actor`, driven by ONE state machine.
 *
 *   dormant ──(the hero's feet enter the arena)──▶ intro ──▶ choose ──▶ telegraph ──▶ attack ──▶ recover ──▶ choose …
 *                                                                          ▲                          │ hit while it recovers
 *                                                                          └─── (never interrupted) ──┴──▶ hurt ──▶ recover
 *   any state ──(health 0)──▶ dead
 *
 * - **dormant**: it stands and waits; it cannot be hurt. **intro**: it wakes (`boss:started`: the session closes the doors); still unhurtable.
 * - **choose**: picks its next attack from the simulation `Rng` — weighted by how far the hero is (a charge from afar, the rain close up) and never
 *   the same attack more than `repeatLimit` times in a row.
 * - **telegraph**: the wind-up, the part the hero reads: violet marks on the floor that fill as the strike nears (`enemy:telegraph` for each
 *   one: the effects layer draws the rings). It is armoured: it does not flinch. **attack**: the hitbox exists (the charge: a low surge it slides
 *   along; the rain: columns of ink at the marked spots). **recover**: harmless and helpless — the opening. A blow taken here staggers it once
 *   (`hurt`) and the stagger is ADDED to the opening.
 * - It is **enraged** at `enrageAt` of its health: every wind-up and recovery is `enrageScale` as long and the rain has more zones.
 * - It has two vulnerable regions: the body, and the crest above it (a weak point, ×2).
 *
 * The tick semantics are the slime's: a state of D ticks occupies exactly D ticks, counting the one it was entered on as the first. It sees the
 * hero only through `PlayerTarget`, every random choice comes from the simulation `Rng`, and it stops attacking the moment the hero is down.
 */
export class Guardian extends Actor implements SimEntity, Combatant {
  readonly kind = 'guardian';
  readonly health: Health;
  override readonly view: GuardianViewState = { ...createActorViewState(), attack: null, marks: [], enraged: false, awake: false };
  /** Where it was placed. */
  readonly home: { x: number; y: number };
  /** The brain turns this on when the body is gone; the session removes the entity at the end of the tick. */
  expired = false;
  /** Blows received, for tests and the debug panel. */
  hits = 0;

  private readonly fsm: StateMachine<Guardian, GuardianState>;
  private sim: SimServices | null = null;
  private flashTicks = 0;
  private enragedNow = false;
  /** The attack in progress, and the ones it threw most recently (newest last). */
  private current: GuardianAttack | null = null;
  private readonly recent: GuardianAttack[] = [];
  /** Ticks of the telegraph and of the recovery in force for the current attack (scaled when enraged). */
  private windUp = 0;
  private recoverLeft = 0;
  private staggered = false;
  private resuming = false;
  private alreadyHit = new Set<string>();
  private readonly marks: GuardianMark[] = [];

  constructor(
    id: string,
    readonly def: GuardianDefinition,
    spawn: { x: number; y: number; facing?: 1 | -1 },
    /** The fight begins when the hero's feet are inside this rectangle. */
    readonly arena: Readonly<Rect>,
  ) {
    super(id, 'enemy', def.body.halfWidth, def.body.height);
    this.health = new Health(def.health);
    this.home = { x: spawn.x, y: spawn.y };
    this.teleport(spawn.x, spawn.y, spawn.facing ?? -1);
    this.fsm = new StateMachine<Guardian, GuardianState>(this, this.states(), 'dormant');
    this.fsm.onChange = () => this.view.animSerial++;
    this.publish();
  }

  get state(): GuardianState {
    return this.fsm.current;
  }
  get stateTicks(): number {
    return this.fsm.ticksInState;
  }
  get enraged(): boolean {
    return this.enragedNow;
  }
  /** The attack being wound up or thrown, `null` between them. */
  get attackKind(): GuardianAttack | null {
    return this.current;
  }
  /** The warning on the floor, as the view and the tests read it (a live list: do not keep it). */
  get telegraphMarks(): readonly GuardianMark[] {
    return this.marks;
  }
  /** It cannot be hurt while it waits, while it wakes and once it is gone. */
  get invulnerable(): boolean {
    return this.fsm.is('dormant', 'intro', 'dead');
  }

  onSpawn(sim: SimServices): void {
    this.sim = sim;
    sim.combat.add(this);
    sim.collision.probeGround(this.body);
  }

  dispose(sim: SimServices): void {
    sim.combat.remove(this);
    this.sim = null;
  }

  tick(sim: SimServices): void {
    this.beginTick();
    this.fsm.update();
    this.integrate(sim);
    if (this.flashTicks > 0) this.flashTicks--;
    this.view.flash = this.flashTicks / this.def.flashTicks;
    this.syncView();
    this.publish();
  }

  collectHurtboxes(out: Hurtbox[]): void {
    const b = this.body;
    for (const h of this.def.hurtboxes) {
      out.push({
        rect: attackRect({ hitbox: h }, b.x, b.y, this.facing, { x0: 0, y0: 0, x1: 0, y1: 0 }),
        multiplier: h.multiplier,
        part: h.part,
      });
    }
  }

  receiveHit(hit: HitInfo): HitOutcome {
    if (this.health.dead) return 'ignored';
    this.health.damage(hit.damage);
    this.hits++;
    // The blow lands after this tick's view was published and the hit-stop freezes the next ones: show it NOW.
    this.flashTicks = this.def.flashTicks;
    this.view.flash = 1;
    const sim = this.sim;
    if (this.health.dead) {
      this.fsm.go('dead', true);
      sim?.bus.emit('actor:died', { id: this.id, team: this.team, x: this.body.x, y: this.body.y });
      sim?.bus.emit('boss:defeated', { id: this.id, defId: this.def.id, x: this.body.x, y: this.body.y });
      return 'hit';
    }
    if (!this.enragedNow && this.health.fraction <= this.def.enrageAt) {
      this.enragedNow = true;
      this.view.enraged = true;
      sim?.bus.emit('boss:phase', { id: this.id, defId: this.def.id, phase: 2, x: this.body.x, y: this.body.y });
    }
    // armoured while it winds up and strikes; a blow while it recovers staggers it, once (the stagger is added to the opening)
    if (this.fsm.is('recover') && !this.staggered) {
      this.staggered = true;
      this.fsm.go('hurt', true);
    }
    return 'hit';
  }

  // ------------------------------------------------------------------------------------------------- the states

  private states(): Record<GuardianState, StateHooks<Guardian, GuardianState>> {
    const d = this.def;
    const go = (s: GuardianState): void => this.fsm.go(s);
    return {
      dormant: {
        enter: () => this.stop(),
        update: () => {
          this.slowDown();
          if (this.heroInArena()) go('intro');
        },
      },
      intro: {
        enter: () => {
          this.stop();
          this.faceHero(true);
          this.view.awake = true;
          this.sim?.bus.emit('boss:started', { id: this.id, defId: d.id, nameKey: d.nameKey, health: this.health.current, maxHealth: this.health.max, x: this.body.x, y: this.body.y });
          this.sim?.bus.emit('enemy:alerted', { id: this.id, defId: d.id, x: this.body.x, y: this.body.y });
        },
        update: (_, t) => {
          this.slowDown();
          this.faceHero();
          if (t + 1 >= d.introTicks) go('choose');
        },
      },
      choose: {
        enter: () => this.stop(),
        update: () => {
          this.slowDown();
          // nobody left to hit: it waits (the room is about to be rebuilt) instead of winding up at a body that is down
          if (this.sim?.player.health.dead) return;
          this.faceHero(true);
          this.current = this.pick();
          this.recent.push(this.current);
          if (this.recent.length > d.params.repeatLimit) this.recent.shift();
          go('telegraph');
        },
      },
      telegraph: {
        enter: () => this.beginTelegraph(),
        update: (_, t) => {
          this.slowDown();
          if (this.sim?.player.health.dead) return go('choose');
          for (const m of this.marks) m.t01 = Math.min(1, (t + 1) / this.windUp);
          if (t + 1 >= this.windUp) go('attack');
        },
        // the warning only outlives the wind-up when the strike comes; a hero who fell takes it away with the attack
        exit: (_, to) => {
          if (to !== 'attack') this.marks.length = 0;
        },
      },
      attack: {
        enter: () => {
          this.alreadyHit = new Set();
          if (this.current === 'charge') {
            this.body.vx = this.facing * d.params.charge.speed;
            this.sim?.bus.emit('boss:strike', { id: this.id, defId: d.id, attack: d.attacks.charge.id, x: this.body.x, y: this.body.y, w: d.body.halfWidth * 2 });
          } else {
            // the ink erupts at every mark at once
            for (const m of this.marks) this.sim?.bus.emit('boss:strike', { id: this.id, defId: d.id, attack: d.attacks.rain.id, x: m.x, y: this.body.y, w: m.w });
          }
        },
        update: (_, t) => {
          if (this.sim?.player.health.dead) {
            this.marks.length = 0;
            return go('recover');
          }
          if (this.current === 'charge') {
            this.body.vx = this.facing * d.params.charge.speed;
            this.submitCharge();
            const blocked = this.facing > 0 ? this.body.hitRight : this.body.hitLeft;
            if (t + 1 >= d.params.charge.ticks || blocked) go('recover');
          } else {
            this.submitRain();
            if (t + 1 >= d.attacks.rain.active) go('recover');
          }
        },
        exit: () => {
          this.marks.length = 0;
        },
      },
      recover: {
        enter: () => {
          this.stop();
          if (!this.resuming) {
            const a = this.current === 'charge' ? d.attacks.charge : d.attacks.rain;
            this.recoverLeft = this.scaled(a.recovery);
            this.staggered = false;
          }
          this.resuming = false;
        },
        update: () => {
          this.slowDown();
          if (--this.recoverLeft <= 0) go('choose');
        },
      },
      hurt: {
        update: (_, t) => {
          this.slowDown();
          if (t + 1 >= d.staggerTicks) {
            this.resuming = true; // back to the opening it was in, with what was left of it
            this.recoverLeft = Math.max(this.recoverLeft, 8);
            go('recover');
          }
        },
      },
      dead: {
        update: (_, t) => {
          this.slowDown();
          if (t + 1 >= d.deathTicks) this.expired = true;
        },
      },
    };
  }

  // ----------------------------------------------------------------------------------------------- the attacks

  /** Picks the next attack: a charge from afar, the rain close up (weights), never the same one more than `repeatLimit` times running. */
  private pick(): GuardianAttack {
    const p = this.def.params;
    const far = this.heroDistance() > p.farDistance;
    const weights: Record<GuardianAttack, number> = { charge: far ? 3 : 1, rain: far ? 1 : 3 };
    const last = this.recent[this.recent.length - 1];
    const run = this.recent.length >= p.repeatLimit && this.recent.every((a) => a === last);
    if (run && last) weights[last] = 0;
    const total = weights.charge + weights.rain;
    return (this.sim?.rng.next() ?? 0) * total < weights.charge ? 'charge' : 'rain';
  }

  /** The wind-up: the marks on the floor that tell the hero what is coming and where, and the cue for the effects. */
  private beginTelegraph(): void {
    const d = this.def;
    const sim = this.sim;
    this.stop();
    this.marks.length = 0;
    const kind = this.current ?? 'charge';
    const attack = kind === 'charge' ? d.attacks.charge : d.attacks.rain;
    this.windUp = this.scaled(attack.startup);
    this.view.attack = kind;
    if (kind === 'charge') {
      // one long lane along the floor, from where it stands to where the slide would end
      const len = (d.params.charge.speed * d.params.charge.ticks) / 60;
      const x0 = this.body.x + this.facing * (d.body.halfWidth);
      this.marks.push({ x: x0 + (this.facing * len) / 2, w: len, t01: 0 });
      sim?.bus.emit('enemy:telegraph', { id: this.id, defId: d.id, x: this.body.x, y: this.body.y + 0.45, facing: this.facing, ticks: this.windUp });
    } else {
      // the ink falls where the hero stood when it began (and either side of it): the zones do not follow, so they can be left
      const heroX = this.sim?.player.body.x ?? this.body.x;
      const offsets = this.enragedNow ? d.params.rain.enragedOffsets : d.params.rain.offsets;
      const w = d.params.rain.width;
      for (const off of offsets) {
        const x = Math.min(this.arena.x1 - w / 2, Math.max(this.arena.x0 + w / 2, heroX + off));
        this.marks.push({ x, w, t01: 0 });
        sim?.bus.emit('enemy:telegraph', { id: this.id, defId: d.id, x, y: this.body.y + 0.45, facing: this.facing, ticks: this.windUp });
      }
    }
    this.view.marks = this.marks;
  }

  /** The low surge of the charge: the attack's hitbox, in front of it, along the floor. */
  private submitCharge(): void {
    const a = this.def.attacks.charge;
    this.sim?.combat.submit({
      ownerId: this.id,
      team: 'enemy',
      rect: attackRect(a, this.body.x, this.body.y, this.facing, { x0: 0, y0: 0, x1: 0, y1: 0 }),
      attackId: a.id,
      damage: a.damage,
      knockback: { x: a.knockback.x, y: a.knockback.y },
      stun: a.stun,
      hitStop: a.hitStop,
      shake: a.shake,
      facing: this.facing,
      alreadyHit: this.alreadyHit,
    });
  }

  /** The columns of ink at the marked spots: one hitbox each, all sharing one hit set (a hero caught by two is hurt once). */
  private submitRain(): void {
    const a = this.def.attacks.rain;
    const h = this.def.params.rain.height;
    const floor = this.body.y;
    for (const m of this.marks) {
      this.sim?.combat.submit({
        ownerId: this.id,
        team: 'enemy',
        rect: { x0: m.x - m.w / 2, x1: m.x + m.w / 2, y0: floor, y1: floor + h },
        attackId: a.id,
        damage: a.damage,
        knockback: { x: a.knockback.x, y: a.knockback.y },
        stun: a.stun,
        hitStop: a.hitStop,
        shake: a.shake,
        facing: this.facing,
        alreadyHit: this.alreadyHit,
      });
    }
  }

  // ------------------------------------------------------------------------------------------------ perception

  private heroInArena(): boolean {
    const pl = this.sim?.player;
    if (!pl || pl.health.dead) return false;
    const a = this.arena;
    return pl.body.x >= a.x0 && pl.body.x <= a.x1 && pl.body.y >= a.y0 && pl.body.y <= a.y1;
  }

  private heroDistance(): number {
    return Math.abs((this.sim?.player.body.x ?? this.body.x) - this.body.x);
  }

  private faceHero(force = false): void {
    const dx = (this.sim?.player.body.x ?? this.body.x) - this.body.x;
    if (force || Math.abs(dx) > FACING_DEAD_ZONE) this.facing = dx >= 0 ? 1 : -1;
  }

  /** A wind-up or a recovery as long as the phase makes it. */
  private scaled(ticks: number): number {
    return this.enragedNow ? Math.max(1, Math.round(ticks * this.def.enrageScale)) : ticks;
  }

  // --------------------------------------------------------------------------------------------------- motion

  private slowDown(): void {
    const b = this.body;
    if (b.grounded) b.vx = approach(b.vx, 0, this.def.params.friction * TICK_SECONDS);
  }

  private stop(): void {
    this.body.vx = 0;
  }

  /** Gravity and movement with collisions, once per tick after the state decided its velocity. */
  private integrate(sim: SimServices): void {
    const b = this.body;
    b.vy = Math.max(b.vy - this.def.params.gravity * TICK_SECONDS, -TERMINAL_VELOCITY);
    sim.collision.moveBody(b, b.vx * TICK_SECONDS, b.vy * TICK_SECONDS);
  }

  /** The logical animation, for any view: which part of the attack it is, and how far through. */
  private publish(): void {
    const v = this.view;
    const t = this.fsm.ticksInState;
    v.phase = 'none';
    v.phaseT = 0;
    v.animSpeed = 1;
    v.animDuration = 0;
    v.opacity = 1;
    v.attack = this.fsm.is('telegraph', 'attack') ? this.current : null;
    switch (this.fsm.current) {
      case 'dormant':
        v.anim = 'idle';
        break;
      case 'intro':
        v.anim = 'alert';
        v.phaseT = Math.min(1, t / Math.max(1, this.def.introTicks));
        break;
      case 'choose':
        v.anim = 'idle';
        break;
      case 'telegraph':
        v.anim = 'telegraph';
        v.phase = 'startup';
        v.phaseT = Math.min(1, t / Math.max(1, this.windUp));
        break;
      case 'attack':
        v.anim = 'attack';
        v.phase = 'active';
        v.phaseT = Math.min(1, t / Math.max(1, this.current === 'charge' ? this.def.params.charge.ticks : this.def.attacks.rain.active));
        break;
      case 'recover':
        v.anim = 'idle';
        v.phase = 'recovery';
        break;
      case 'hurt':
        v.anim = 'hurt';
        v.phaseT = Math.min(1, t / Math.max(1, this.def.staggerTicks));
        break;
      case 'dead':
        v.anim = 'death';
        v.phaseT = Math.min(1, t / Math.max(1, this.def.deathTicks));
        v.opacity = 1 - v.phaseT * v.phaseT;
        break;
    }
  }
}
