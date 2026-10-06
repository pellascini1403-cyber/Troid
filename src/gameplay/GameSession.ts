import { BottleSet, type BottleDefinition, type BottleRules } from '@/abilities/BottleSet';
import { CardLoadout, type CardDefinition } from '@/abilities/CardLoadout';
import { Magic, type MagicDefinition } from '@/abilities/Magic';
import type { SkillDefinition } from '@/abilities/SkillDefinition';
import { SkillRuntime } from '@/abilities/SkillRuntime';
import { CombatSystem } from '@/combat/CombatSystem';
import { EventBus } from '@/core/events';
import { IdGenerator } from '@/core/ids';
import { overlaps, type Rect } from '@/core/math';
import { Rng } from '@/core/rng';
import { Scheduler } from '@/core/scheduler';
import { Enemy } from '@/enemies/Enemy';
import type { EnemyDefinition } from '@/enemies/EnemyDefinition';
import { InteractionSystem } from '@/interaction/InteractionSystem';
import { createInputFrame, NEUTRAL_INPUT, type InputFrame } from '@/input/InputFrame';
import { Player } from '@/player/Player';
import type { PlayerDefinition } from '@/player/PlayerDefinition';
import { AbilitySystem, type AbilityDefinition } from '@/progression/AbilitySystem';
import { WorldFlags } from '@/progression/WorldFlags';
import { bodyRect, CollisionWorld } from '@/world/collision';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { DeathFlow, DEFAULT_DEATH_FLOW, type DeathFlowDefinition, type DeathSnapshot } from './DeathFlow';
import type { GameEvents } from './events';
import { createPlayerStatus, type PlayerStatus } from './PlayerStatus';
import type { SimEntity } from './SimEntity';
import type { SimServices } from './SimServices';

/** The player's resources, as data (docs/GAME-SPEC-2D.md §10–§11): the magic bar, the bottles and the cards that exist. */
export interface PlayerResources {
  magic: MagicDefinition;
  bottles: { definitions: Readonly<Record<string, BottleDefinition>>; initial: readonly string[]; rules: BottleRules };
  cards: Readonly<Record<string, CardDefinition>>;
  /** The active skills the cards can equip. */
  skills: Readonly<Record<string, SkillDefinition>>;
}

export interface SessionOptions {
  rooms: Readonly<Record<string, RoomDefinition>>;
  player: PlayerDefinition;
  abilities: readonly AbilityDefinition[];
  resources: PlayerResources;
  startRoom: string;
  startEntry?: string;
  seed?: number;
  /** Abilities owned from the start (tests, debug, loading a save). */
  unlocked?: readonly string[];
  /** Durations of the defeat flow (docs/GAME-SPEC-2D.md §9.2). */
  death?: DeathFlowDefinition;
  /** The enemy definitions that `RoomDefinition.spawns` refer to, by id. */
  enemies?: Readonly<Record<string, EnemyDefinition>>;
  /** World flags set from the start (tests, loading a save). */
  flags?: readonly string[];
}

/** Where the player comes back after dying: the entrance of the room (Prompt 4); the last save node later (Prompt 6). */
export interface RespawnPoint {
  room: string;
  entry: string;
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
  /** The magic bar, the bottles and the card equipped: independent resources of the player (docs/GAME-SPEC-2D.md §10–§11). */
  readonly magic: Magic;
  readonly bottles: BottleSet;
  readonly loadout: CardLoadout;
  readonly skills: SkillRuntime;
  /** What the player can interact with: the object in reach has the icon, Interact performs it (docs/GAME-SPEC-2D.md §12). */
  readonly interaction: InteractionSystem;
  /** The defeat flow: dying → fade out → title → respawn → fade in (docs/GAME-SPEC-2D.md §9.2). */
  readonly death: DeathFlow;
  /** World memory that outlives room visits and deaths: defeated guardians, opened doors (docs/GAME-SPEC-2D.md §14.3). */
  readonly flags: WorldFlags;

  /** Debug switch: while true the player cannot take damage or die (set by the debug panel). */
  godMode = false;

  private ticks = 0;
  private current: RoomDefinition;
  /** Owner token for everything scheduled on behalf of the current room (cancelled when it unloads). */
  private roomOwner: object = {};
  private lastSafe = { x: 0, y: 0 };
  private _respawnPoint: RespawnPoint = { room: '', entry: '' };
  private disposed = false;

  // ---- what the current room asked for: enemies that leave a flag when they fall, doors, ways out ----
  private readonly defeatFlags = new Map<string, string>();
  private readonly gateStates = new Map<string, boolean>();
  private readonly exitsTouched = new Set<string>();
  private readonly scratch: Rect = { x0: 0, y0: 0, x1: 0, y1: 0 };

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
    this.flags = new WorldFlags(this.bus);
    if (opts.flags) this.flags.restore(opts.flags);
    this.combat = new CombatSystem({
      // `GameEvents` extends `CombatEvents`; TypeScript cannot unify the bus' conditional rest parameters across the two
      // catalogues, so the combat events go through this one adapter.
      bus: { emit: (type, payload) => (this.bus.emit as (t: keyof GameEvents, p: unknown) => void)(type, payload) },
      requestHitStop: (n) => this.requestHitStop(n),
    });
    this.player = new Player(opts.player, this.ids.next('player'));
    this.magic = new Magic(opts.resources.magic, (change) => this.bus.emit('magic:changed', change));
    this.bottles = new BottleSet(opts.resources.bottles.definitions, opts.resources.bottles.initial, opts.resources.bottles.rules, (change) =>
      this.bus.emit('bottle:changed', { ...change, states: this.bottles.slots.map((slot) => slot.state) }),
    );
    this.skills = new SkillRuntime(opts.resources.skills);
    this.loadout = new CardLoadout(opts.resources.cards, (change) => {
      this.bus.emit('card:changed', change);
      // a card that teaches an ability gives it to the player the moment it is acquired (progression: `AbilitySystem` owns it)
      const grants = change.type === 'acquired' && change.cardId ? opts.resources.cards[change.cardId]?.grantsAbility : undefined;
      if (grants) this.abilities.unlock(grants);
    });
    this.interaction = new InteractionSystem(
      {
        hasFlag: (flag) => this.flags.has(flag),
        setFlag: (flag) => void this.flags.set(flag),
        clearFlag: (flag) => void this.flags.clear(flag),
        acquireCard: (cardId) => this.loadout.acquire(cardId),
        addBottleSlot: (bottleId) => this.bottles.addSlot(bottleId),
      },
      {
        available: (e) => this.bus.emit('interaction:available', e),
        lost: (e) => this.bus.emit('interaction:lost', e),
        performed: (e) => this.bus.emit('interaction:performed', e),
      },
    );
    this.death = new DeathFlow(
      {
        scheduler: this.scheduler,
        respawn: () => this.respawnAfterDeath(),
        emitStarted: () => this.bus.emit('death:started', { x: this.player.x, y: this.player.y }),
        emitFadeOut: (ticks) => this.bus.emit('death:fadeOut', { ticks }),
        emitRespawned: () => this.bus.emit('death:respawned', { roomId: this._respawnPoint.room, entryId: this._respawnPoint.entry }),
        emitFadeIn: (ticks) => this.bus.emit('death:fadeIn', { ticks }),
      },
      opts.death ?? DEFAULT_DEATH_FLOW,
    );
    // dying costs nothing but a short walk back: the flow starts the moment the player's health reaches 0
    this.bus.on('player:died', () => this.death.start());
    // an enemy that guards something leaves its flag behind when it falls; doors follow the flags
    this.bus.on('actor:died', ({ id }) => {
      const flag = this.defeatFlags.get(id);
      if (flag !== undefined) this.flags.set(flag);
    });
    this.bus.on('flag:set', () => this.applyGates(true));
    this.bus.on('flag:cleared', () => this.applyGates(true));
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
  get respawnPoint(): Readonly<RespawnPoint> {
    return this._respawnPoint;
  }
  /** One frame of the defeat flow for the overlay. */
  get deathSnapshot(): DeathSnapshot {
    return this.death.snapshot();
  }
  /** Live entities (enemies, projectiles…), in spawn order. The player is not in this list. */
  get entities(): readonly SimEntity[] {
    return this.live;
  }
  /** Is the gate of the current room open? (An unknown gate reads as closed.) */
  gateOpen(gateId: string): boolean {
    return this.gateStates.get(gateId) ?? false;
  }
  /** The exits of the current room the player has touched since it was built. */
  get exitsReached(): ReadonlySet<string> {
    return this.exitsTouched;
  }

  /**
   * What the HUD reads, as plain numbers, written into `out` (reused every frame: no allocation in steady state). The
   * interface never touches the player, the resources or any entity: this is the only door.
   */
  status(out: PlayerStatus = createPlayerStatus()): PlayerStatus {
    const h = this.player.health;
    out.life.current = h.current;
    out.life.max = h.max;
    out.magic.current = this.magic.current;
    out.magic.max = this.magic.max;
    out.magic.regenerating = this.magic.regenerating;
    const card = this.loadout.equipped;
    out.card.equipped = card !== null;
    out.card.id = card?.id ?? '';
    out.card.nameKey = card?.nameKey ?? '';
    out.card.iconId = card?.iconId ?? '';
    const skill = card ? this.skills.definition(card.skillId) : undefined;
    out.card.cooldown01 = card ? this.skills.cooldown01(card.skillId) : 0;
    out.card.state = !card || !skill ? 'ready' : out.card.cooldown01 > 0 ? 'cooldown' : this.magic.canSpend(skill.cost) ? 'ready' : 'noMagic';
    const slots = this.bottles.slots;
    out.bottles.length = slots.length;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i] as (typeof slots)[number];
      const b = (out.bottles[i] ??= { state: 'ready', fill01: 1, iconId: '' });
      b.state = slot.state;
      b.fill01 = this.bottles.fill(i);
      b.iconId = this.bottles.definition(i)?.iconId ?? '';
    }
    const notice = this.interaction.notice();
    out.interaction.active = notice !== null;
    out.interaction.id = notice?.id ?? '';
    out.interaction.kind = notice?.kind ?? '';
    out.interaction.verbKey = notice?.verbKey ?? '';
    out.interaction.x = notice?.x ?? 0;
    out.interaction.y = notice?.y ?? 0;
    const drink = this.player.controller.drinkProgress();
    out.drink.slot = drink.slot;
    out.drink.progress01 = drink.t;
    out.bottleUseful = !h.dead && h.current < h.max && this.bottles.readyCount > 0;
    return out;
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
    let frame = this.latched ? this.releaseLatch(input) : input;
    this.ticks++;
    // a press can skip the wait of the defeat screen; that press is spent there (it does not also act in the game)
    if (this.death.update(frame)) frame = NEUTRAL_INPUT;
    this.player.tick(this, frame); // 1
    for (const e of this.live) e.tick(this); // 2
    this.combat.resolve(); // 3
    this.interaction.update(this.player.body.x, this.player.body.y, !this.player.health.dead); // 4 — who has the icon
    this.magic.tick(this.player.controller.casting); // 6 — resources: the magic regenerates (not while casting), the bottles recharge one at a time
    this.bottles.tick();
    this.skills.tick();
    this.trackSafeGround(); // 7 (flows)
    this.rescueIfFallen();
    this.checkExits();
    this.flushEntities(); // 8
    this.scheduler.tick(); // 9
  }

  /**
   * Loads a room and puts the player at an entry. A room is ALWAYS entered alive: a defeat flow that was running is
   * cancelled (a reload from somewhere else, e.g. the debug panel, must not leave a player with 0 HP).
   */
  loadRoom(roomId: string, entryId?: string): void {
    this.death.cancel();
    this.unloadRoom();
    this.current = this.requireRoom(roomId);
    this.buildRoom(this.current, entryId);
    if (this.player.health.dead) this.revivePlayer();
    this.bus.emit('room:loaded', { roomId: this.current.id, entryId: this._respawnPoint.entry });
  }

  /**
   * Puts the player back on the last solid ground they stood on (falling out of the world, debug). A player who is already down
   * is only moved: `respawn` would reset their controller and hand the control back to a hero with no life.
   */
  rescuePlayer(): void {
    const p = this.player;
    if (p.health.dead) p.teleport(this.lastSafe.x, this.lastSafe.y, p.facing);
    else p.respawn(this.lastSafe.x, this.lastSafe.y, p.facing);
    this.collision.probeGround(p.body);
  }

  // ------------------------------------------------------------------------------------------- SimServices

  newId(prefix: string): string {
    return this.ids.next(prefix);
  }

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
    this.defeatFlags.clear();
    this.gateStates.clear();
    this.exitsTouched.clear();
    this.interaction.setRoom([]); // the icon of the old room goes away
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
    this._respawnPoint = { room: room.id, entry: entry.id };
    this.placeSpawns(room);
    this.applyGates(false);
    this.interaction.setRoom(room.interactables ?? []);
  }

  /**
   * Places the room's enemies. They are in the world the moment the room is built (a room is whole when it is loaded),
   * except those whose defeat flag is already set: what was beaten for good stays beaten.
   */
  private placeSpawns(room: RoomDefinition): void {
    for (const sp of room.spawns ?? []) {
      if (sp.defeatFlag !== undefined && this.flags.has(sp.defeatFlag)) continue;
      const def = this.opts.enemies?.[sp.enemy];
      if (!def) throw new Error(`room "${room.id}": spawn "${sp.id}" places the unknown enemy "${sp.enemy}"`);
      const enemy = new Enemy(this.ids.next(def.id), def, { x: sp.x, y: sp.y, facing: sp.facing });
      if (sp.defeatFlag !== undefined) this.defeatFlags.set(enemy.id, sp.defeatFlag);
      this.addEntity(enemy);
    }
  }

  /** Opens or closes every gate of the room to match the flags (a gate is one of the room's solids, switched off while open). */
  private applyGates(announce: boolean): void {
    for (const g of this.current.gates ?? []) {
      const open = this.flags.has(g.openWhen);
      const collider = this.collision.get(g.solid);
      if (collider) collider.enabled = !open;
      const was = this.gateStates.get(g.id);
      this.gateStates.set(g.id, open);
      if (announce && was !== open) this.bus.emit('gate:changed', { roomId: this.current.id, gateId: g.id, open });
    }
  }

  /** `exit:reached`, once per exit per room build, while the player is alive and touching its zone. */
  private checkExits(): void {
    const exits = this.current.exits;
    if (!exits || exits.length === 0 || this.player.health.dead) return;
    const body = bodyRect(this.player.body, this.scratch);
    for (const x of exits) {
      if (this.exitsTouched.has(x.id) || !overlaps(body, x.rect)) continue;
      this.exitsTouched.add(x.id);
      this.bus.emit('exit:reached', { roomId: this.current.id, exitId: x.id, ...(x.to ? { to: x.to } : {}) });
    }
  }

  /**
   * The defeat flow's respawn: reload the room at the respawn point (enemies and entities come back, collision is
   * rebuilt without leaks) and give the player full health. Abilities and items are untouched: dying costs nothing.
   */
  private respawnAfterDeath(): void {
    const { room, entry } = this._respawnPoint;
    this.unloadRoom();
    this.current = this.requireRoom(room);
    this.buildRoom(this.current, entry);
    this.revivePlayer();
    this.bus.emit('room:loaded', { roomId: this.current.id, entryId: entry });
  }

  /** Coming back from a defeat: life AND magic full (GAME-SPEC-2D §9.2). The bottles are NOT refilled: their recharge is slow on purpose. */
  private revivePlayer(): void {
    this.player.revive();
    this.magic.restore();
    this.skills.reset();
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
      for (const e of joining) this.addEntity(e);
    }
  }

  private addEntity(e: SimEntity): void {
    this.live.push(e);
    e.onSpawn?.(this);
    this.bus.emit('entity:spawned', { entity: e });
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
    if (i.bottlePressed) {
      l.bottlePressed = true;
      l.bottleSlot = i.bottleSlot;
    }
    l.interactPressed ||= i.interactPressed;
    l.dropPressed ||= i.dropPressed;
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
    m.bottlePressed = i.bottlePressed || l.bottlePressed;
    m.bottleSlot = i.bottlePressed ? i.bottleSlot : l.bottlePressed ? l.bottleSlot : -1;
    m.interactPressed = i.interactPressed || l.interactPressed;
    m.dropPressed = i.dropPressed || l.dropPressed;
    m.pausePressed = i.pausePressed || l.pausePressed;
    l.jumpPressed = l.jumpReleased = l.attackPressed = l.dashPressed = l.abilityPressed = l.pausePressed = false;
    l.bottlePressed = l.interactPressed = l.dropPressed = false;
    l.bottleSlot = -1;
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
