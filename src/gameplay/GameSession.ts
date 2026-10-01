import { EventBus } from '@/core/events';
import { IdGenerator } from '@/core/ids';
import { Rng } from '@/core/rng';
import { Scheduler } from '@/core/scheduler';
import type { InputFrame } from '@/input/InputFrame';
import { Player } from '@/player/Player';
import type { PlayerDefinition } from '@/player/PlayerDefinition';
import { AbilitySystem, type AbilityDefinition } from '@/progression/AbilitySystem';
import { CollisionWorld } from '@/world/collision';
import type { RoomDefinition } from '@/world/RoomDefinition';
import type { GameEvents } from './events';
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
 * Tick order (docs/ARCHITECTURE.md §3): input → player → [enemies, bosses, projectiles, combat, triggers — added
 * in later phases] → scheduler. Each later system slots into `tick()` at its documented position.
 */
export class GameSession implements SimServices {
  readonly bus = new EventBus<GameEvents>();
  readonly scheduler = new Scheduler();
  readonly rng: Rng;
  readonly ids = new IdGenerator();
  readonly abilities: AbilitySystem;
  readonly player: Player;
  readonly collision = new CollisionWorld();

  /** Debug switch: while true the player cannot take damage or die (set by the debug panel; used from F6). */
  godMode = false;

  private ticks = 0;
  private current: RoomDefinition;
  /** Owner token for everything scheduled on behalf of the current room (cancelled when it unloads). */
  private roomOwner: object = {};
  private lastSafe = { x: 0, y: 0 };
  private disposed = false;

  constructor(private readonly opts: SessionOptions) {
    this.rng = new Rng(opts.seed ?? 1);
    this.abilities = new AbilitySystem(opts.abilities, this.bus, opts.unlocked);
    this.player = new Player(opts.player, this.ids.next('player'));
    this.current = this.requireRoom(opts.startRoom);
    this.buildRoom(this.current, opts.startEntry);
  }

  get now(): number {
    return this.ticks;
  }
  get room(): RoomDefinition {
    return this.current;
  }

  /** Advances the simulation by exactly one fixed step. */
  tick(input: InputFrame): void {
    if (this.disposed) return;
    this.ticks++;
    this.player.tick(this, input);
    this.trackSafeGround();
    this.rescueIfFallen();
    this.scheduler.tick();
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
    this.collision.clear();
  }

  private buildRoom(room: RoomDefinition, entryId?: string): void {
    for (const s of room.solids) {
      this.collision.add({ id: s.id, rect: { ...s.rect }, kind: s.kind ?? 'solid', enabled: true, tag: s.tag });
    }
    const entry = room.entries.find((e) => e.id === entryId) ?? room.entries[0];
    if (!entry) throw new Error(`room "${room.id}" has no entries`);
    this.player.respawn(entry.x, entry.y, entry.facing ?? 1);
    this.collision.probeGround(this.player.body);
    this.lastSafe = { x: entry.x, y: entry.y };
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
