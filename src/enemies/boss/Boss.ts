import type { Combatant, HitInfo, HitOutcome, Hurtbox } from '@/combat/Combatant';
import { Health } from '@/combat/Health';
import { attackRect } from '@/combat/hitboxGeometry';
import { approach, type Rect } from '@/core/math';
import { StateMachine, type StateHooks } from '@/core/stateMachine';
import { TICK_SECONDS } from '@/core/time';
import { Actor } from '@/gameplay/Actor';
import type { SimEntity } from '@/gameplay/SimEntity';
import type { SimServices } from '@/gameplay/SimServices';
import { createActorViewState } from '@/presentation/actorViewState';
import { Enemy } from '../Enemy';
import { EnemyShot, type ShotSpec } from '../EnemyShot';
import type { GuardianAttack, GuardianMark, GuardianViewState } from '../Guardian';
import type { BossAttackSpec, BossDefinition } from './BossDefinition';
import { BOSS_HANDLERS, type BossCtx, type BossMark } from './handlers';

export type BossState = 'dormant' | 'intro' | 'choose' | 'return' | 'telegraph' | 'attack' | 'recover' | 'hurt' | 'shift' | 'dead';

/** Fastest the boss can fall (m/s). */
const TERMINAL_VELOCITY = 26;
const FACING_DEAD_ZONE = 0.15;
/** m/s a flyer climbs back to its hover. */
const RETURN_SPEED = 6;

/**
 * A boss of the data-driven engine (docs/PROMPT21-LOG.md): the guardians after the Ink Warden. It is a `SimEntity` that is a `Combatant` and an `Actor`, and — on purpose — it answers to the same name and the same shape as the Warden
 * (`kind: 'guardian'`, `def.view.lookId`, `view.marks`, `enraged`, `telegraphMarks`…), so that the session, the lights, the boss bar, the doors of the arena and the art all treat any boss the same way.
 *
 *   dormant ──(the hero's feet enter the arena)──▶ intro ──▶ choose ──▶ telegraph ──▶ attack ──▶ recover ──▶ choose …
 *                                                      │                                         │ a blow while it recovers
 *                                                      └── shift (between phases) ◀── choose     └──▶ hurt ──▶ recover
 *
 * It chooses its next attack from the ones its PHASE has, weighted by how far the hero is and never the same one more than `repeatLimit` times in a row; the attack is a PATTERN (`handlers.ts`) that decides what the wind-up shows and
 * what the attack does. A phase begins when its health falls to the phase's `at`: the boss finishes what it is doing, shuts for the roar (`shift`: untouchable, `boss:phase`) and comes back faster, with other attacks and,
 * perhaps, creatures of its own. And it has CONDITIONS: a region of it called `armor` turns every blow away, a weak point that is `when` only some of the time shows only then.
 *
 * The tick semantics are the slime's (a state of D ticks occupies D ticks, counting the one it was entered on as the first); it sees the hero only through `PlayerTarget`, every random choice comes from the simulation `Rng`, and it
 * stops attacking the moment the hero is down.
 */
export class Boss extends Actor implements SimEntity, Combatant {
  readonly kind = 'guardian';
  readonly health: Health;
  override readonly view: GuardianViewState = { ...createActorViewState(), attack: null, marks: [], enraged: false, awake: false };
  readonly home: { x: number; y: number };
  expired = false;
  hits = 0;

  private readonly fsm: StateMachine<Boss, BossState>;
  private sim: SimServices | null = null;
  private flashTicks = 0;
  private phaseIdx = 0;
  private shiftPending = false;
  private current: BossAttackSpec | null = null;
  private currentId: string | null = null;
  private readonly recent: string[] = [];
  private readonly uses = new Map<string, number>();
  private windUp = 0;
  private recoverLeft = 0;
  private staggered = false;
  private resuming = false;
  private exposed = false;
  private hidden = false;
  private hitSet = new Set<string>();
  private readonly marks: BossMark[] = [];
  private memo: Record<string, number> = {};
  private readonly minions: Enemy[] = [];
  private readonly ctx: BossCtx;

  constructor(
    id: string,
    readonly def: BossDefinition,
    spawn: { x: number; y: number; facing?: 1 | -1 },
    readonly arena: Readonly<Rect>,
  ) {
    super(id, 'enemy', def.body.halfWidth, def.body.height);
    this.health = new Health(def.health);
    this.home = { x: spawn.x, y: spawn.y };
    this.teleport(spawn.x, spawn.y, spawn.facing ?? -1);
    this.ctx = this.makeContext();
    this.fsm = new StateMachine<Boss, BossState>(this, this.states(), 'dormant');
    this.fsm.onChange = () => this.view.animSerial++;
    this.publish();
  }

  get state(): BossState {
    return this.fsm.current;
  }
  get stateTicks(): number {
    return this.fsm.ticksInState;
  }
  /** From the second phase on (the bar burns, the light turns). */
  get enraged(): boolean {
    return this.phaseIdx >= 1;
  }
  /** The phase it is in, 1-based. */
  get phase(): number {
    return this.phaseIdx + 1;
  }
  get attackKind(): GuardianAttack | null {
    return this.current ? this.styleName() : null;
  }
  /** How the warning of the current attack is drawn: as a lane along the floor (`charge`) or as columns on spots (`rain`) — the two styles the view knows. */
  private styleName(): GuardianAttack {
    return this.ctx.markStyle === 'lane' ? 'charge' : 'rain';
  }
  /** The id of the attack in progress (`null` between them). */
  get attackId(): string | null {
    return this.fsm.is('telegraph', 'attack') ? this.currentId : null;
  }
  get telegraphMarks(): readonly GuardianMark[] {
    return this.marks;
  }
  /** The floor of its arena (a flyer is above it): where the warnings are drawn. */
  get floorY(): number {
    return this.home.y;
  }
  /** The creatures it called that are still on their feet. */
  get minionsAlive(): number {
    return this.minions.filter((m) => !m.health.dead && !m.expired).length;
  }
  /** It cannot be hurt while it waits, while it wakes, between phases, when it has vanished, and once it is gone. */
  get invulnerable(): boolean {
    return this.hidden || this.fsm.is('dormant', 'intro', 'shift', 'dead');
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
    if (this.hidden) return;
    const b = this.body;
    const open = this.exposed && this.fsm.is('recover', 'hurt');
    for (const h of this.def.hurtboxes) {
      // a weak point that shows only while the boss is open (`exposed`), or only in some states
      if (h.when && !h.when.some((w) => (w === 'exposed' ? open : this.fsm.current === w))) continue;
      out.push({ rect: attackRect({ hitbox: h }, b.x, b.y, this.facing, { x0: 0, y0: 0, x1: 0, y1: 0 }), multiplier: h.multiplier, part: h.part });
    }
  }

  receiveHit(hit: HitInfo): HitOutcome {
    if (this.health.dead) return 'ignored';
    const sim = this.sim;
    if (hit.part === 'armor') {
      sim?.bus.emit('enemy:blocked', { id: this.id, defId: this.def.id, x: hit.x, y: hit.y, direction: hit.direction, attackId: hit.attackId, shake: 0.1 });
      return 'blocked';
    }
    this.health.damage(hit.damage);
    this.hits++;
    this.flashTicks = this.def.flashTicks;
    this.view.flash = 1;
    if (this.health.dead) {
      this.fsm.go('dead', true);
      sim?.bus.emit('actor:died', { id: this.id, team: this.team, x: this.body.x, y: this.body.y });
      sim?.bus.emit('boss:defeated', { id: this.id, defId: this.def.id, x: this.body.x, y: this.body.y });
      this.dismissMinions();
      return 'hit';
    }
    const next = this.def.phases[this.phaseIdx + 1];
    if (next && this.health.fraction <= next.at) this.shiftPending = true;
    // armoured while it winds up and strikes; a blow while it recovers staggers it, once (the stagger is added to the opening)
    if (this.fsm.is('recover') && !this.staggered) {
      this.staggered = true;
      this.fsm.go('hurt', true);
    }
    return 'hit';
  }

  // ------------------------------------------------------------------------------------------------- the states

  private states(): Record<BossState, StateHooks<Boss, BossState>> {
    const d = this.def;
    const go = (s: BossState): void => this.fsm.go(s);
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
          if (this.shiftPending) return go('shift');
          if (d.hover !== undefined && Math.abs(this.body.y - (this.home.y + d.hover)) > 0.4) return go('return');
          this.faceHero(true);
          this.currentId = this.pick();
          this.current = d.attacks[this.currentId]!;
          this.recent.push(this.currentId);
          if (this.recent.length > d.repeatLimit) this.recent.shift();
          go('telegraph');
        },
      },
      return: {
        update: () => {
          this.faceHero();
          if (this.flyTo(this.body.x, this.home.y + (d.hover ?? 0), RETURN_SPEED)) go('choose');
        },
      },
      telegraph: {
        enter: () => this.beginTelegraph(),
        update: (_, t) => {
          this.slowDown();
          if (this.sim?.player.health.dead) return go('choose');
          for (const m of this.marks) m.t01 = Math.min(1, (t + 1) / this.windUp);
          BOSS_HANDLERS[this.current!.handler].windup?.(this.ctx, t);
          if (t + 1 >= this.windUp) go('attack');
        },
        exit: (_, to) => {
          if (to !== 'attack') this.marks.length = 0;
        },
      },
      attack: {
        enter: () => {
          this.hitSet = new Set();
          BOSS_HANDLERS[this.current!.handler].begin(this.ctx);
        },
        update: (_, t) => {
          if (this.sim?.player.health.dead) {
            this.marks.length = 0;
            return go('recover');
          }
          if (BOSS_HANDLERS[this.current!.handler].tick(this.ctx, t)) go('recover');
        },
        exit: () => {
          BOSS_HANDLERS[this.current!.handler].end(this.ctx);
          this.marks.length = 0;
        },
      },
      recover: {
        enter: () => {
          this.stop();
          if (!this.resuming && this.current) {
            this.exposed = this.current.exposes !== false;
            this.recoverLeft = this.scaled(this.current.attack.recovery) + (this.memo['bonusRecovery'] ?? 0);
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
            this.resuming = true;
            this.recoverLeft = Math.max(this.recoverLeft, 8);
            go('recover');
          }
        },
      },
      shift: {
        enter: () => {
          this.stop();
          this.shiftPending = false;
          this.phaseIdx++;
          this.exposed = false;
          const phase = d.phases[this.phaseIdx]!;
          this.view.enraged = true;
          this.sim?.bus.emit('boss:phase', { id: this.id, defId: d.id, phase: this.phaseIdx + 1, x: this.body.x, y: this.body.y });
          if (phase.summon) this.summon(phase.summon.def, phase.summon.count);
        },
        update: (_, t) => {
          this.slowDown();
          this.faceHero();
          if (t + 1 >= (d.phases[this.phaseIdx]!.shiftTicks ?? 60)) go('choose');
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

  /** Picks the next attack of the phase: weighted by how far the hero is, never the same one more than `repeatLimit` times running. */
  private pick(): string {
    const d = this.def;
    const ids = d.phases[this.phaseIdx]!.attacks;
    const far = Math.abs((this.sim?.player.body.x ?? this.body.x) - this.body.x) > d.farDistance;
    const last = this.recent[this.recent.length - 1];
    const run = this.recent.length >= d.repeatLimit && this.recent.every((a) => a === last);
    const weights = ids.map((id) => (run && id === last && ids.length > 1 ? 0 : far ? d.attacks[id]!.weight.far : d.attacks[id]!.weight.near));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return ids[0]!;
    let r = (this.sim?.rng.next() ?? 0) * total;
    for (let i = 0; i < ids.length; i++) {
      r -= weights[i]!;
      if (r < 0) return ids[i]!;
    }
    return ids[ids.length - 1]!;
  }

  private beginTelegraph(): void {
    const spec = this.current!;
    this.stop();
    this.marks.length = 0;
    this.memo = {};
    this.windUp = this.scaled(spec.attack.startup);
    this.memo['windUp'] = this.windUp;
    this.ctx.markStyle = 'column';
    BOSS_HANDLERS[spec.handler].telegraph(this.ctx);
    this.uses.set(this.currentId!, (this.uses.get(this.currentId!) ?? 0) + 1);
    this.view.attack = this.styleName();
    this.view.marks = this.marks;
  }

  /** The context a pattern runs with: one object for the life of the boss, read through the boss's current attack. */
  private makeContext(): BossCtx {
    const self = this;
    const spec = (): BossAttackSpec => self.current!;
    const ctx: BossCtx = {
      get sim() {
        return self.sim!;
      },
      get arena() {
        return self.arena;
      },
      get spec() {
        return spec();
      },
      get phase() {
        return self.phaseIdx + 1;
      },
      get body() {
        return self.body;
      },
      gravity: self.def.gravity,
      floorY: self.home.y,
      get facing() {
        return self.facing;
      },
      set facing(v: 1 | -1) {
        self.facing = v;
      },
      marks: self.marks,
      markStyle: 'column',
      get memo() {
        return self.memo;
      },
      get uses() {
        return self.uses.get(self.currentId ?? '') ?? 0;
      },
      get hidden() {
        return self.hidden;
      },
      set hidden(v: boolean) {
        self.hidden = v;
        self.view.opacity = v ? 0 : 1;
      },
      num: (key, fallback) => {
        const v = spec().params[key];
        if (typeof v === 'number') return v;
        if (fallback !== undefined) return fallback;
        throw new Error(`boss "${self.def.id}": attack "${self.currentId}" has no number "${key}"`);
      },
      list: (key) => {
        let found: readonly number[] = [];
        for (let p = 1; p <= self.phaseIdx + 1; p++) {
          const v = spec().params[p === 1 ? key : `${key}${p}`];
          if (Array.isArray(v)) found = v as readonly number[];
        }
        return found;
      },
      heroX: () => self.sim?.player.body.x ?? self.body.x,
      heroY: () => self.sim?.player.body.y ?? self.body.y,
      heroFacing: () => self.sim?.player.facing ?? 1,
      submit: (rect, facing = self.facing) => self.submitRect(rect, facing),
      submitMelee: () => self.submitRect(attackRect(spec().attack, self.body.x, self.body.y, self.facing, { x0: 0, y0: 0, x1: 0, y1: 0 }), self.facing),
      throwShot: (shot: ShotSpec, x, y, facing) => void self.sim?.spawn(new EnemyShot(self.sim.newId('shot'), shot, self.id, x, y, facing)),
      strike: (x, w) => self.sim?.bus.emit('boss:strike', { id: self.id, defId: self.def.id, attack: spec().attack.id, x, y: self.home.y, w }),
      cue: (x) => self.sim?.bus.emit('enemy:telegraph', { id: self.id, defId: self.def.id, x, y: self.home.y + 0.45, facing: self.facing, ticks: self.windUp, attack: spec().attack.id }),
      faceHero: () => self.faceHero(true),
      random: () => self.sim?.rng.next() ?? 0.5,
      teleportTo: (x, y) => {
        self.teleport(x, y, self.facing);
        self.sim?.collision.probeGround(self.body);
      },
      stop: () => self.stop(),
    };
    return ctx;
  }

  private submitRect(rect: Rect, facing: 1 | -1): void {
    const a = this.current!.attack;
    this.sim?.combat.submit({
      ownerId: this.id,
      team: 'enemy',
      rect,
      attackId: a.id,
      damage: a.damage,
      knockback: { x: a.knockback.x, y: a.knockback.y },
      stun: a.stun,
      hitStop: a.hitStop,
      shake: a.shake,
      facing,
      alreadyHit: this.hitSet,
    });
  }

  /** It calls creatures of its own, spread across the arena. */
  private summon(def: import('../EnemyDefinition').EnemyDefinition, count: number): void {
    const sim = this.sim;
    if (!sim) return;
    const span = this.arena.x1 - this.arena.x0;
    for (let k = 0; k < count; k++) {
      const x = this.arena.x0 + ((k + 1) / (count + 1)) * span;
      const flies = def.ai.archetype === 'wisp' || def.ai.archetype === 'bat';
      const e = new Enemy(sim.newId(def.id), def, { x, y: this.home.y + (flies ? 3 : 0), facing: k % 2 === 0 ? 1 : -1 });
      this.minions.push(e);
      sim.spawn(e);
    }
  }

  /** What it called falls with it. */
  private dismissMinions(): void {
    for (const m of this.minions) {
      if (m.health.dead || m.expired) continue;
      m.receiveHit({ attackId: 'boss_fell', attackerId: this.id, damage: m.health.max, direction: 1, knockbackX: 0, knockbackY: 0, stun: 0, hitStop: 0, shake: 0, x: m.body.x, y: m.body.y });
    }
  }

  // ------------------------------------------------------------------------------------------------ perception

  private heroInArena(): boolean {
    const pl = this.sim?.player;
    if (!pl || pl.health.dead) return false;
    const a = this.arena;
    return pl.body.x >= a.x0 && pl.body.x <= a.x1 && pl.body.y >= a.y0 && pl.body.y <= a.y1;
  }

  private faceHero(force = false): void {
    const dx = (this.sim?.player.body.x ?? this.body.x) - this.body.x;
    if (force || Math.abs(dx) > FACING_DEAD_ZONE) this.facing = dx >= 0 ? 1 : -1;
  }

  /** A wind-up or a recovery as long as the phase makes it. */
  private scaled(ticks: number): number {
    return Math.max(1, Math.round(ticks * this.def.phases[this.phaseIdx]!.tempo));
  }

  // --------------------------------------------------------------------------------------------------- motion

  private slowDown(): void {
    const b = this.body;
    if (b.grounded || this.def.hover !== undefined) b.vx = approach(b.vx, 0, this.def.friction * TICK_SECONDS);
    if (this.def.hover !== undefined && this.fsm.current !== 'dead' && !this.fsm.is('attack')) b.vy = approach(b.vy, 0, this.def.friction * TICK_SECONDS);
  }

  private stop(): void {
    this.body.vx = 0;
    if (this.def.hover !== undefined) this.body.vy = 0;
  }

  private flyTo(x: number, y: number, speed: number): boolean {
    const b = this.body;
    const dx = x - b.x;
    const dy = y - b.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.15) {
      this.stop();
      return true;
    }
    const s = Math.min(speed, d * 6);
    b.vx = (dx / d) * s;
    b.vy = (dy / d) * s;
    return false;
  }

  private integrate(sim: SimServices): void {
    const b = this.body;
    const g = this.def.hover !== undefined && this.fsm.current !== 'dead' ? 0 : this.def.gravity;
    b.vy = Math.max(b.vy - g * TICK_SECONDS, -TERMINAL_VELOCITY);
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
    v.opacity = this.hidden ? 0 : 1;
    v.attack = this.fsm.is('telegraph', 'attack') ? this.styleName() : null;
    const a = this.current?.attack;
    switch (this.fsm.current) {
      case 'dormant':
      case 'choose':
      case 'return':
        v.anim = 'idle';
        break;
      case 'intro':
        v.anim = 'alert';
        v.phaseT = Math.min(1, t / Math.max(1, this.def.introTicks));
        break;
      case 'telegraph':
        v.anim = 'telegraph';
        v.phase = 'startup';
        v.phaseT = Math.min(1, t / Math.max(1, this.windUp));
        break;
      case 'attack':
        v.anim = 'attack';
        v.phase = 'active';
        v.phaseT = Math.min(1, t / Math.max(1, a?.active ?? 1));
        break;
      case 'recover':
        v.anim = 'idle';
        v.phase = 'recovery';
        v.phaseT = Math.min(1, (a ? a.recovery - this.recoverLeft : 0) / Math.max(1, a?.recovery ?? 1));
        break;
      case 'hurt':
        v.anim = 'hurt';
        v.phaseT = Math.min(1, t / Math.max(1, this.def.staggerTicks));
        break;
      case 'shift':
        v.anim = 'phaseTransition';
        v.phaseT = Math.min(1, t / Math.max(1, this.def.phases[this.phaseIdx]?.shiftTicks ?? 60));
        break;
      case 'dead':
        v.anim = 'death';
        v.phaseT = Math.min(1, t / Math.max(1, this.def.deathTicks));
        v.opacity = 1 - v.phaseT * v.phaseT;
        break;
    }
  }
}
