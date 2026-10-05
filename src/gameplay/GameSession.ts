import { CombatSystem } from '@/combat/CombatSystem';
import { EventBus } from '@/core/events';
import { IdGenerator } from '@/core/ids';
import { Rng } from '@/core/rng';
import { Scheduler } from '@/core/scheduler';
import { createInputFrame, type InputFrame } from '@/input/InputFrame';
import { Player } from '@/player/Player';
import type { PlayerDefinition } from '@/player/PlayerDefinition';
import { AbilitySystem, type AbilityDefinition } from '@/progression/AbilitySystem';
import { CollisionWorld } from '@/world/collision';
import type { RoomDefinition } from '@/world/RoomDefinition';
import type { GameEvents } from './events';
import type { SimEntity } from './SimEntity';
import type { SimServices } from './SimServices';

export interface SessionOptions {
  rooms: Readonly<Record<string, RoomDefinition>>;
  player: PlayerDefinition;
  abilities: readonly AbilityDefinition[];
  startRoom: string;
  startEntry?: string;
  seed?: number;
  /** Abilities owned from the start (tests, debug, loading a save). */
  unlocked?: readonly string[];
}

/**
 * Root of the simulation. Deterministic: the same options + the same sequence of `InputFrame`s always produce
 * the same state, which is what makes the movement / combat / boss tests possible.
 *
 * It contains no rendering and no DOM. Views subscribe to `bus` and read entity `view` states.
 *
 * Tick order (docs/ARCHITECTURE-2D.md §5.1): hit-stop gate → player → entities → combat → flows → entity flush →
 * scheduler. Later systems (interaction, triggers, resources) slot in at their documented position.
 */
export class GameSession implements SimServices {
  readonly bus = new EventBus<GameEvents>();
  readonly scheduler = new Scheduler();
  readonly rng: Rng;
  readonly ids = new IdGenerator();
  readonly abilities: AbilitySystem;
  readonly player: Player;
  readonly collision = new CollisionWorld();
  readonly combat: CombatSystem;

  /** Debug switch: while true the player cannot take damage or die (set by the debug panel). */
  godMode = false;

  private ticks = 0;
  private current: RoomDefinition;
  /** Owner token for everything scheduled on behalf of the current room (cancelled when it unloads). */
  private roomOwner: object = {};
  private lastSafe = { x: 0, y: 0 };
  private disposed = false;

  // ---- hit-stop: the world holds still; the player's presses are kept for the first tick after it ----
  private hitStopTicks = 0;
  private readonly latch = createInputFrame();
  private readonly merged = createInputFrame();
  private latched = false;

  // ---- entities: added / removed only at the end of a tick, so nothing changes while another entity iterates ----
  private readonly live: SimEntity[] = [];
  private readonly pendingSpawn: SimEntity[] = [];
  private readonly pendingDespawn = new Set<SimEntity>();

  constructor(private readonly opts: SessionOptions) {
    this.rng = new Rng(opts.seed ?? 1);
    this.abilities = new AbilitySystem(opts.abilities, this.bus, opts.unlocked);
    this.combat = new CombatSystem({
      // `GameEvents` extends `CombatEvents`; TypeScript cannot unify the bus' conditional rest parameters across the two
      // catalogues, so the combat events go through this one adapter.
      bus: { emit: (type, payload) => (this.bus.emit as (t: keyof GameEvents, p: unknown) => void)(type, payload) },
      requestHitStop: (n) => this.requestHitStop(n),
    });
    this.player = new Player(opts.player, this.ids.next('player'));
    this.current = this.requireRoom(opts.startRoom);
    this.buildRoom(this.current, opts.startEntry);
  }

  /** Simulation ticks elapsed; frozen while hit-stop holds the world still. */
  get now(): number {
    return this.ticks;
  }
  get room(): RoomDefinition {
    return this.current;
  }
  /** The world is frozen by a hit-stop right now (views freeze sprite animation; camera and VFX keep real time). */
  get frozen(): boolean {
    return this.hitStopTicks > 0;
  }
  get hitStopLeft(): number {
    return this.hitStopTicks;
  }
  /** Live entities (enemies, projectiles…), in spawn order. The player is not in this list. */
  get entities(): readonly SimEntity[] {
    return this.live;
  }

  /** Advances the simulation by exactly one fixed step. */
  tick(input: InputFrame): void {
    if (this.disposed) return;
    // 0 — hit-stop: nothing advances, but a press made during the freeze must not be lost
    if (this.hitStopTicks > 0) {
      this.hitStopTicks--;
      this.latchEdges(input);
      return;
    }
    const frame = this.latched ? this.releaseLatch(input) : input;
    this.ticks++;
    this.player.tick(this, frame); // 1
    for (const e of this.live) e.tick(this); // 2
    this.combat.resolve(); // 3
    this.trackSafeGround(); // 7 (flows)
    this.rescueIfFallen();
    this.flushEntities(); // 8
    this.scheduler.tick(); // 9
  }

  loadRoom(roomId: string, entryId?: string): void {
    this.unloadRoom();
    this.current = this.requireRoom(roomId);
    this.buildRoom(this.current, entryId);
  }

  /** Puts the player back on the last solid ground they stood on (falling out of the world, debug). */
  rescuePlayer(): void {
    this.player.respawn(this.lastSafe.x, this.lastSafe.y, this.player.facing);
    this.collision.probeGround(this.player.body);
  }

  // ------------------------------------------------------------------------------------------- SimServices

  spawn<T extends SimEntity>(entity: T): T {
    this.pendingSpawn.push(entity);
    return entity;
  }

  despawn(entity: SimEntity): void {
    this.pendingDespawn.add(entity);
  }

  requestHitStop(ticks: number): void {
    this.hitStopTicks = Math.max(this.hitStopTicks, Math.max(0, Math.floor(ticks)));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unloadRoom();
    this.bus.clear();
    this.scheduler.clear();
  }

  // ---------------------------------------------------------------------------------------------- internals

  private requireRoom(id: string): RoomDefinition {
    const room = this.opts.rooms[id];
    if (!room) throw new Error(`unknown room "${id}"`);
    return room;
  }

  private unloadRoom(): void {
    this.scheduler.cancelOwner(this.roomOwner);
    this.roomOwner = {};
    // Everything that lived in the room goes with it: no entity, hitbox or combatant survives a reload.
    this.pendingSpawn.length = 0;
    for (const e of this.live.splice(0)) this.release(e);
    this.pendingDespawn.clear();
    this.combat.clear();
    this.collision.clear();
    this.hitStopTicks = 0;
    this.latched = false;
  }

  private buildRoom(room: RoomDefinition, entryId?: string): void {
    for (const s of room.solids) {
      this.collision.add({ id: s.id, rect: { ...s.rect }, kind: s.kind ?? 'solid', enabled: true, tag: s.tag });
    }
    this.combat.add(this.player);
    const entry = room.entries.find((e) => e.id === entryId) ?? room.entries[0];
    if (!entry) throw new Error(`room "${room.id}" has no entries`);
    this.player.respawn(entry.x, entry.y, entry.facing ?? 1);
    this.collision.probeGround(this.player.body);
    this.lastSafe = { x: entry.x, y: entry.y };
  }

  /** End-of-tick entity bookkeeping: despawns first (explicit and `expired`), then spawns. */
  private flushEntities(): void {
    if (this.pendingDespawn.size > 0) {
      for (const e of this.pendingDespawn) {
        const i = this.live.indexOf(e);
        if (i >= 0) {
          this.live.splice(i, 1);
          this.release(e);
        } else {
          const j = this.pendingSpawn.indexOf(e);
          if (j >= 0) this.pendingSpawn.splice(j, 1); // spawned and removed in the same tick: it never existed
        }
      }
      this.pendingDespawn.clear();
    }
    for (let i = this.live.length - 1; i >= 0; i--) {
      const e = this.live[i] as SimEntity;
      if (e.expired) {
        this.live.splice(i, 1);
        this.release(e);
      }
    }
    if (this.pendingSpawn.length > 0) {
      const joining = this.pendingSpawn.splice(0);
      for (const e of joining) {
        this.live.push(e);
        e.onSpawn?.(this);
        this.bus.emit('entity:spawned', { entity: e });
      }
    }
  }

  private release(e: SimEntity): void {
    e.dispose?.(this);
    this.bus.emit('entity:despawned', { entity: e });
  }

  private latchEdges(i: InputFrame): void {
    const l = this.latch;
    l.jumpPressed ||= i.jumpPressed;
    l.jumpReleased ||= i.jumpReleased;
    l.attackPressed ||= i.attackPressed;
    l.dashPressed ||= i.dashPressed;
    l.abilityPressed ||= i.abilityPressed;
    l.pausePressed ||= i.pausePressed;
    this.latched = true;
  }

  /** The first tick after a freeze: the CURRENT sticks / held buttons plus every press made while frozen. */
  private releaseLatch(i: InputFrame): InputFrame {
    const l = this.latch;
    const m = this.merged;
    m.move.x = i.move.x;
    m.move.y = i.move.y;
    m.jumpHeld = i.jumpHeld;
    m.attackHeld = i.attackHeld;
    m.dashHeld = i.dashHeld;
    m.abilityHeld = i.abilityHeld;
    m.device = i.device;
    m.jumpPressed = i.jumpPressed || l.jumpPressed;
    m.jumpReleased = i.jumpReleased || l.jumpReleased;
    m.attackPressed = i.attackPressed || l.attackPressed;
    m.dashPressed = i.dashPressed || l.dashPressed;
    m.abilityPressed = i.abilityPressed || l.abilityPressed;
    m.pausePressed = i.pausePressed || l.pausePressed;
    l.jumpPressed = l.jumpReleased = l.attackPressed = l.dashPressed = l.abilityPressed = l.pausePressed = false;
    this.latched = false;
    return m;
  }

  private trackSafeGround(): void {
    const b = this.player.body;
    const g = b.ground;
    if (!b.grounded || !g || g.kind !== 'solid') return;
    if (b.x > g.rect.x0 + 0.6 && b.x < g.rect.x1 - 0.6) {
      this.lastSafe.x = b.x;
      this.lastSafe.y = b.y;
    }
  }

  private rescueIfFallen(): void {
    const killY = this.current.killY ?? this.current.bounds.y0 - 10;
    if (this.player.body.y < killY) this.rescuePlayer();
  }
}
