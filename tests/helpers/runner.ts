import { attachProgressRecorder, type ProgressRecorder } from '@/app/progressRecorder';
import { ROOMS, START, UPGRADES, WORLD } from '@/content';
import type { Enemy } from '@/enemies/Enemy';
import { Boss } from '@/enemies/boss/Boss';
import { Guardian } from '@/enemies/Guardian';
import { PlayStats } from '@/gameplay/PlayStats';
import { restoreFromProgress } from '@/gameplay/progress';
import type { GameEvents } from '@/gameplay/events';
import type { ProgressData } from '@/save/ProgressData';
import { ProgressStore } from '@/save/ProgressStore';
import { MemoryStorage } from '@/save/StorageAdapter';
import type { InteractableDef } from '@/interaction/Interactable';
import type { RoomDefinition, SealDef } from '@/world/RoomDefinition';
import { buildWorldGraph, routeBetween } from '@/world/worldGraph';
import { Brawler, type Foe } from './brawler';
import { BossFighter } from './bossFight';
import { fightTheWarden } from './fighter';
import { Pilot } from './pilot';
import type { Hop } from './reach';
import { ROAD } from './road';
import { driver, type Driver } from './sim';
import { FALLBACK, TACTICS } from './tactics';

/**
 * A WHOLE PLAYTHROUGH BY A SCRIPTED PLAYER (docs/PROMPT22-LOG.md §5): from a new game to the way out of the world, in ONE session, with the inputs of a person and a hero who can die. The runner is what a person does with the world, in
 * the order the world asks it: it goes to the next thing there is to do — a creature that holds a door, a card on a ledge, a lever, a seal to break, a shrine to rest at, a guardian — wherever that is (through the rooms, by the doors the
 * flags have opened), does it, and goes on; it fights what comes at it (`brawler.ts`), is brought back by the shrine when it falls and starts again from there, and, at some of the shrines, SAVES and begins a new session from the save
 * (the same functions the page uses: `captureProgress`, `parseProgress`, `restoreFromProgress`) as if the game had been closed and opened again.
 *
 * It is a model of a PLAYER, not of a person: the hops are those of the solver (`pilot.ts`), the fights are those of `tactics.ts` and `bossFight.ts`, and it knows the whole world's map (it never explores). What it proves is that the world, as one piece, CAN be finished by the
 * inputs a person has; not how long it takes a person, nor how many times they die.
 */

/** A thing to do, and how to know it is done. Done is read from the world (a flag, an ability), so a defeat, a reload or a second visit cannot confuse it. */
export interface Task {
  /** For the log. */
  id: string;
  room: string;
  /** Where along the room it is (the order inside a room is west to east, the way the road enters). */
  x: number;
  done: (r: Runner) => boolean;
  run: (r: Runner) => void;
}

export interface RunnerOptions {
  seed?: number;
  /** The rooms whose shrine the run saves at and then continues from a NEW session built from that save. */
  reloadAt?: readonly string[];
  /** The most ticks the whole run may take (the test fails with the log instead of hanging). */
  maxTicks?: number;
  /** Stops the run when this is true (for playing the world in stages while it is being built: the whole run does not stop but at the end of the adventure). */
  until?: (r: Runner) => boolean;
}

export interface RoomTime {
  room: string;
  /** Ticks the hero was in the room, counting every visit. */
  ticks: number;
  visits: number;
  /** Ticks of those spent in a fight (a creature winding up or being fought) or against a guardian. */
  combat: number;
}

export interface ZoneTime {
  zone: string;
  ticks: number;
  combat: number;
  visits: number;
  rooms: number;
}

const graph = buildWorldGraph(WORLD, ROOMS);
const PASSIVE = new Set(['idle', 'patrol', 'closed', 'dormant', 'perched', 'lurk', 'wait', 'none', 'drift', 'dead']);

export class Runner {
  d!: Driver;
  pilot!: Pilot;
  brawl!: Brawler;
  readonly tasks: Task[];
  readonly log: string[] = [];
  readonly roomTimes = new Map<string, RoomTime>();
  /** Shrines the hero has rested at this far (a room each). */
  readonly rested = new Set<string>();
  deaths = 0;
  reloads = 0;
  combatTicks = 0;
  bossTicks = 0;
  /** What was saved at each shrine, as it was read back from the storage (the same code that saves the page's game: `progressRecorder.ts`). */
  saves: ProgressData[] = [];
  /** The storage the game saves into: it survives a reload, as the browser's does. */
  readonly storage = new MemoryStorage();
  store = new ProgressStore(this.storage);
  /** What the page counts of a game (time played, defeats, kills, rooms): the same class. */
  stats!: PlayStats;
  private recorder: ProgressRecorder | null = null;
  private clock = 0;
  ended = false;
  /** Ticks of play before this session was begun from a save: the clock goes on across a reload. */
  private base = 0;
  private fighting = false;
  private readonly ignored = new Map<unknown, number>();
  private readonly doneReload = new Set<string>();
  private enteredAt = 0;
  private bossFought = 0;
  private failures = new Map<string, number>();

  constructor(readonly opts: RunnerOptions = {}) {
    this.tasks = buildTasks();
    this.begin();
  }

  // -------------------------------------------------------------------------------------------------- sessions

  /** A new session: a new game, or the one a save continues. */
  private begin(from?: ProgressData): void {
    const restored = from ? restoreFromProgress(from, ROOMS, WORLD.start) : null;
    const d = driver({
      room: ROOMS[restored?.startRoom ?? START.room]!,
      entry: restored?.startEntry ?? START.entry,
      unlocked: restored ? restored.unlocked : [...START.unlocked],
      seed: (this.opts.seed ?? 1) + (restored ? this.reloads * 7919 : 0),
      extra: { rooms: ROOMS, upgrades: UPGRADES, ...(restored ? { checkpoint: restored.checkpoint, flags: restored.flags, restore: restored.restore } : {}) },
    });
    d.settle();
    this.d = d;
    this.stats = new PlayStats(from?.stats);
    this.stats.attach(d.session.bus, d.session.room.id);
    this.recorder?.stop();
    this.recorder = attachProgressRecorder(d.session, this.store, { stats: this.stats, now: () => ++this.clock, knownSavedAt: from?.savedAt ?? 0 });
    this.pilot = new Pilot(d, { reflex: () => this.reflex(), overlay: (frame) => this.overlay(frame), abort: (_, hop) => this.letGo(hop) });
    this.brawl = new Brawler(d, TACTICS, FALLBACK);
    this.enteredAt = d.session.now;
    this.lastSwing = -99; // (a clock of the session that was closed means nothing in this one)
    this.fighting = false;
    this.watch();
  }

  /** The clock of the whole run, across reloads. */
  get now(): number {
    return this.base + this.d.session.now;
  }

  private watch(): void {
    const bus = this.d.session.bus;
    const on = <K extends keyof GameEvents>(n: K, f: (e: GameEvents[K]) => void): void => void bus.on(n, f);
    on('room:entered', (e) => {
      this.closeRoom();
      this.enteredAt = this.d.session.now;
      const t = this.roomTime(e.roomId);
      t.visits++;
      this.say(`enters ${e.roomId} from ${e.from}`);
    });
    on('death:started', (e) => {
      this.deaths++;
      this.say(`DEFEATED at (${e.x.toFixed(1)}, ${e.y.toFixed(1)})`);
    });
    on('boss:started', (e) => this.say(`wakes ${e.defId} (${e.health}/${e.maxHealth})`));
    on('boss:defeated', (e) => this.say(`beat ${e.defId}`));
    on('checkpoint:set', (e) => this.say(`rests: checkpoint ${e.room}/${e.entry}`));
    on('adventure:ended', (e) => {
      this.ended = true;
      this.say(`THE END at ${e.roomId}/${e.exitId}`);
    });
    this.roomTime(this.d.session.room.id).visits++;
  }

  private roomTime(room: string): RoomTime {
    let t = this.roomTimes.get(room);
    if (!t) this.roomTimes.set(room, (t = { room, ticks: 0, visits: 0, combat: 0 }));
    return t;
  }

  private closeRoom(): void {
    this.roomTime(this.d.session.room.id).ticks += this.d.session.now - this.enteredAt;
  }

  say(line: string): void {
    this.log.push(`[${String(this.now).padStart(6)} ${this.d.session.room.id}] ${line}`);
  }

  // -------------------------------------------------------------------------------------------------- fighting

  private isThreat(f: Foe): boolean {
    if ((this.ignored.get(f.entity) ?? -1) > this.d.session.now) return false;
    const flier = f.id === 'cave_bat' || f.id === 'lantern_wisp' || f.id === 'piston_drone';
    if (Math.abs(f.y - this.d.body.y) > 3.2 && !flier) return false;
    if (f.gap > 8) return false;
    // a bat is a threat while it comes (the wake and the dive) or hangs within the sword's reach; going back to its roof, or hanging there, it is not worth waiting for
    if (f.id === 'cave_bat') return f.state === 'wake' || f.state === 'swoop' || (f.state === 'hover' && f.gap < 3.5 && Math.abs(f.y - this.d.body.y) < 3);
    // (a creature that waits shut or hung up is not worth waiting for either: it is passed, and fought if it opens or drops)
    if (f.state === 'closed' || f.state === 'dormant' || f.state === 'perched') return false;
    return !PASSIVE.has(f.state) || f.gap < 3.2;
  }

  private lastSwing = -99;

  /**
   * In the middle of a climb: a lantern that comes level with the hero is put out whole with the Spirit Bolt (it has two lives and the bolt does two); a creature that has come to the hero and is in reach of the sword gets a blow (a wisp at the
   * wall is put out before it goes off) — all without the hero letting go of the wall.
   */
  private overlay(frame: { attackPressed: boolean; abilityPressed: boolean; abilityHeld: boolean }): void {
    const d = this.d;
    if (d.p.controller.state !== 'free') return;
    for (const f of this.brawl.foes(9, 4)) {
      if (f.id === 'lantern_wisp' && (f.state === 'chase' || f.state === 'fuse') && f.gap >= 1.6 && this.brawl.inBolt(f) && this.brawl.cast()) {
        frame.abilityPressed = true;
        frame.abilityHeld = true;
        return;
      }
    }
    if (d.session.now - this.lastSwing < 16) return;
    for (const f of this.brawl.foes(3.5, 4)) {
      if (!['chase', 'fuse', 'swoop', 'wake', 'telegraph', 'windup', 'rush', 'roll', 'attack'].includes(f.state)) continue;
      if (this.brawl.inSword(f)) {
        frame.attackPressed = true;
        this.lastSwing = d.session.now;
        return;
      }
    }
  }

  /**
   * Hanging on a wall with a lantern coming over the hero's head (out of reach of the bolt, which flies level, and of the sword, until it has come down): a swing cannot be made without letting go of the wall, and a blast on the wall throws the
   * hero off it. A person lets go — if there is floor to come down onto, in a column of air —, comes down on it, and puts the lantern out there with a leap and a blow; then climbs. Within a jump of the top they go on instead.
   */
  private letGo(hop: Hop): boolean {
    const d = this.d;
    if (this.fighting || !/wall/.test(hop.script) || d.body.grounded) return false;
    const phys = this.pilot.physics();
    const to = phys.surfaces[hop.to];
    const from = phys.surfaces[hop.from];
    if (!to || !from || to.y - d.body.y <= 3) return false;
    if (!this.brawl.foes(9, 7).some((f) => f.id === 'lantern_wisp' && (f.state === 'chase' || f.state === 'fuse') && Math.abs(f.dx) < 7)) return false;
    // (a floor that nothing is over — a ledge, a block — is a floor the hero cannot come down onto)
    const mid = (from.x0 + from.x1) / 2;
    return from.x1 - from.x0 >= 1.2 && !phys.world.overlapsSolid({ x0: mid - 0.4, x1: mid + 0.4, y0: from.y + 0.3, y1: d.body.y });
  }

  /** The pilot's reflex: what is coming at the hero is fought until it is not (or until it cannot be reached). True when it took over. */
  private reflex(): boolean {
    if (this.fighting || this.d.p.health.dead) return false;
    const threats = (): Foe[] => this.brawl.foes(10, 9).filter((f) => this.isThreat(f));
    if (threats().length === 0) return false;
    this.fighting = true;
    const t0 = this.d.session.now;
    const room = this.d.session.room.id;
    const first = threats().map((f) => `${f.id}:${f.state}@${f.x.toFixed(1)},${f.y.toFixed(1)}`);
    const r = this.brawl.run(() => threats().length === 0, 420);
    const won = r.won;
    const spent = this.d.session.now - t0;
    if (spent > 240) this.say(`a fight of ${spent} ticks against ${first.join(' ')}${won ? '' : ' — not won'}`);
    this.combatTicks += spent;
    this.roomTime(room).combat += spent;
    if (!won && !this.d.p.health.dead) for (const f of threats()) this.ignored.set(f.entity, this.d.session.now + 900);
    this.d.stop();
    this.fighting = false;
    return true;
  }

  // -------------------------------------------------------------------------------------------------- the loop

  /** Lets a defeat run its course: the fall, the fade, the shrine. */
  private afterDefeat(): void {
    const d = this.d;
    d.stop();
    d.release('jump');
    for (let t = 0; t < 1500 && (d.p.health.dead || d.session.deathSnapshot.phase !== 'none' || d.session.transition.active); t++) d.step(1);
    d.settle();
    this.say(`back at ${d.session.room.id} with ${d.p.health.current}/${d.p.health.max}`);
  }

  /** A bottle when the life is low and nobody is near. */
  private maybeDrink(): void {
    const d = this.d;
    const p = d.p;
    // (a bottle mends two: drunk as soon as two are missing and nobody is near, as a person does)
    if (p.health.max - p.health.current < 2 || d.session.bottles.readyCount === 0 || !d.body.grounded) return;
    if (this.brawl.foes(9, 3).some((f) => this.isThreat(f))) return;
    d.stop();
    d.tap('bottle');
    d.step(34);
  }

  private nextTask(): Task | undefined {
    return this.tasks.find((t) => !t.done(this));
  }

  /** Plays the whole world. Resolves when the adventure has ended (or rejects with the log when it cannot). It is asynchronous only so that the game's own saves — which the page makes between frames — get their turn. */
  async play(): Promise<void> {
    const max = this.opts.maxTicks ?? 600_000;
    let guard = 0;
    while (!this.ended) {
      await Promise.resolve();
      if (this.opts.until?.(this)) break;
      if (this.now > max) throw new Error(`the run took more than ${max} ticks\n${this.report()}`);
      if (++guard > 5000) throw new Error(`the run made 5000 decisions and did not end\n${this.report()}`);
      if (this.d.p.health.dead || this.d.session.deathSnapshot.phase !== 'none') {
        this.afterDefeat();
        continue;
      }
      this.maybeDrink();
      const task = this.nextTask();
      if (!task) {
        // everything is done and the adventure has not ended: the last thing is the way out of the world
        this.travelAndExit();
        continue;
      }
      if (this.d.session.room.id !== task.room) {
        this.travel(task.room);
        continue;
      }
      const rested = this.attempt(task);
      if (rested) await this.afterRest(rested);
    }
    await this.settleSaves();
    this.closeRoom();
  }

  /** Lets the saves that were asked for reach the storage. */
  async settleSaves(): Promise<void> {
    await Promise.resolve();
    await this.store.flush();
    await Promise.resolve();
    await this.store.flush();
  }

  /** What the storage holds now, read as the page reads it when it is opened. */
  async stored(): Promise<ProgressData | null> {
    await this.settleSaves();
    const data = await new ProgressStore(this.storage).load();
    return data ? (data as ProgressData) : null;
  }

  private attempt(task: Task): Task | null {
    const before = this.d.session.now;
    try {
      task.run(this);
    } catch (e) {
      this.say(`task ${task.id} threw: ${(e as Error).message}`);
    }
    if (task.done(this)) {
      this.say(`done: ${task.id}`);
      return task.id.startsWith('rest:') ? task : null;
    }
    const n = (this.failures.get(task.id) ?? 0) + 1;
    this.failures.set(task.id, n);
    this.say(`${task.id}: not done (${n}) after ${this.d.session.now - before} ticks`);
    if (n >= 12 && !this.d.p.health.dead) throw new Error(`the task "${task.id}" was tried ${n} times and is not done\n${this.report()}`);
    return null;
  }

  /** At a shrine the game is saved (by the page's own recorder), and at some of them the page is closed and opened again: a NEW session begins from what the storage holds. */
  private async afterRest(task: Task): Promise<void> {
    const room = task.room;
    const data = await this.stored();
    if (!data) throw new Error(`nothing was saved at ${room}`);
    this.saves.push(data);
    if (this.opts.reloadAt?.includes(room) && !this.doneReload.has(room)) {
      this.doneReload.add(room);
      this.closeRoom();
      this.base += this.d.session.now;
      this.reloads++;
      this.store = new ProgressStore(this.storage);
      const loaded = await this.store.load();
      if (!loaded) throw new Error(`the game saved at ${room} could not be loaded again`);
      this.begin(loaded as ProgressData);
      this.say(`RELOADED from the save made at ${room}: ${data.flags.length} flags, ${data.abilities.length} abilities, ${data.bottleSlots} bottles`);
    }
  }

  // -------------------------------------------------------------------------------------------------- moving about the world

  /** One step toward `room`: the way out of this one that the flags have opened and that leads the shortest way. */
  travel(room: string): void {
    const here = this.d.session.room.id;
    const flags = new Set(this.d.session.flags.list());
    for (const a of this.d.session.abilities.serialize()) flags.add(`ability:${a}`);
    const path = routeBetween(graph, here, room, flags);
    if (path.length < 2) throw new Error(`no way from ${here} to ${room} with ${[...flags].join(' ')}\n${this.report()}`);
    const next = path[1]!;
    const edge = graph.edges.find((e) => e.from === here && e.to.room === next && (!e.requires || flags.has(e.requires)) && (e.needs ?? []).every((a) => flags.has(`ability:${a}`)));
    if (!edge) throw new Error(`no exit from ${here} to ${next}\n${this.report()}`);
    this.exitBy(edge.exit);
  }

  private exitBy(exitId: string): void {
    const key = `exit:${this.d.session.room.id}/${exitId}`;
    const ok = this.pilot.exit(exitId);
    if (ok) return;
    const n = (this.failures.get(key) ?? 0) + 1;
    this.failures.set(key, n);
    this.say(`could not get to ${exitId} (${n}): ${this.pilot.trace.slice(-2).join(' | ')}`);
    if (n >= 10 && !this.d.p.health.dead) throw new Error(`the way out "${exitId}" of ${this.d.session.room.id} was tried ${n} times\n${this.report()}`);
    this.d.step(30);
  }

  private travelAndExit(): void {
    const last = ROAD[ROAD.length - 1]!;
    if (this.d.session.room.id !== last) return this.travel(last);
    this.exitBy('end');
  }

  // -------------------------------------------------------------------------------------------------- doing things

  /** Walks to an object and presses the key. */
  use(id: string): boolean {
    return this.pilot.use(id);
  }

  /** Stands at `x` (on the floor of the room) facing `dir` and waits a few ticks. */
  standAt(x: number, y: number): boolean {
    return this.pilot.goTo({ stand: { x, y } });
  }

  /** The time of the run by ZONE (the seven of the world, in the order of the road): ticks in its rooms, ticks of those in fights, visits to its rooms, and the rooms of it the road goes through. */
  zones(): ZoneTime[] {
    const zoneOf = (room: string): string => ROOMS[room]!.regionId.replace('ancient_forest_sanctum', 'ancient_forest_ruins');
    const out = new Map<string, ZoneTime>();
    for (const room of ROAD) {
      const zone = zoneOf(room);
      const z = out.get(zone) ?? { zone, ticks: 0, combat: 0, visits: 0, rooms: 0 };
      const t = this.roomTimes.get(room);
      z.rooms++;
      if (t) {
        z.ticks += t.ticks;
        z.combat += t.combat;
        z.visits += t.visits;
      }
      out.set(zone, z);
    }
    return [...out.values()];
  }

  report(): string {
    return [`tasks left: ${this.tasks.filter((t) => !t.done(this)).slice(0, 5).map((t) => t.id).join(', ')}`, `deaths ${this.deaths}, reloads ${this.reloads}, ticks ${this.now}`, ...this.log.slice(-60), ...this.pilot.trace.slice(-12)].join('\n');
  }

  /** The boss of the room, as the session has it. */
  bossHere(): Boss | Guardian | undefined {
    return this.d.session.entities.find((e): e is Boss | Guardian => e instanceof Boss || e instanceof Guardian);
  }

  /** How many fights against guardians were begun. */
  get bossFights(): number {
    return this.bossFought;
  }
  countBoss(): void {
    this.bossFought++;
  }
  addBossTicks(n: number): void {
    this.bossTicks += n;
    this.roomTime(this.d.session.room.id).combat += n;
  }

  fightBoss(room: RoomDefinition): void {
    const d = this.d;
    const placement = room.bosses![0]!;
    const arena = placement.arena;
    // the feet cross the line of the arena: the doors shut behind and the guardian wakes
    this.standAt(arena.x0 + 0.6, placement.y);
    d.stop();
    for (let t = 0; t < 400 && !this.bossHere(); t++) d.step(1);
    const boss = this.bossHere();
    if (!boss) return;
    this.countBoss();
    d.until(() => boss.state !== 'dormant', 120);
    const t0 = d.session.now;
    if (boss instanceof Boss) {
      const bf = new BossFighter(d, boss);
      bf.run(30_000);
    } else {
      fightTheWarden(d, { maxTicks: 12_000 });
    }
    this.addBossTicks(d.session.now - t0);
    d.stop();
    d.release('jump');
    d.step(150); // it dissolves, the doors open
  }

  castAtSeal(seal: SealDef): void {
    const d = this.d;
    const room = d.session.room;
    for (let i = 0; i < 6 && !d.session.flags.has(seal.flag); i++) {
      // eleven metres from the ward on the floor, facing it
      const from = seal.x - 9;
      this.standAt(from, seal.y);
      d.stop();
      d.moveX = 0.4;
      d.step(4);
      d.stop();
      d.step(6);
      d.tap('ability');
      d.step(80);
      if (d.session.flags.has(seal.flag)) break;
      // not enough magic yet: rest a moment
      d.step(240);
    }
    void room;
  }

  /** Over the crack, up and down on it with the slam. */
  slamAtSeal(seal: SealDef): void {
    const d = this.d;
    for (let i = 0; i < 5 && !d.session.flags.has(seal.flag); i++) {
      const area = seal.area ?? { x0: seal.x - (seal.halfWidth ?? 1), x1: seal.x + (seal.halfWidth ?? 1), y0: seal.y, y1: seal.y + 1 };
      this.standAt((area.x0 + area.x1) / 2, seal.y);
      d.stop();
      d.step(4);
      d.press('jump');
      d.step(14);
      d.release('jump');
      d.step(6);
      d.moveY = -1;
      d.tap('attack');
      for (let t = 0; t < 120 && !(d.body.grounded && t > 10); t++) {
        d.moveY = -1;
        d.step(1);
      }
      d.stop();
      d.step(40);
    }
  }

  /** A wall that the sword breaks: beside it, facing it, swinging. */
  swordAtSeal(seal: SealDef): void {
    const d = this.d;
    for (let i = 0; i < 40 && !d.session.flags.has(seal.flag); i++) {
      this.standAt(seal.x - 1.2, seal.y);
      d.moveX = 0.4;
      d.step(3);
      d.stop();
      d.tap('attack');
      d.step(16);
    }
  }

  killKey(room: RoomDefinition, spawnId: string): void {
    const sp = room.spawns!.find((s) => s.id === spawnId)!;
    const flag = sp.defeatFlag!;
    const d = this.d;
    this.standAt(Math.max(room.bounds.x0 + 2, sp.x - 4), sp.y);
    const mine = (): Foe | undefined => this.brawl.foes(30, 8).find((f) => f.id === sp.enemy);
    const r = this.brawl.run(() => d.session.flags.has(flag), 2400);
    void r;
    void mine;
  }
}

// ------------------------------------------------------------------------------------------------------------------ the list of things to do

const DONE_ID = (def: InteractableDef): string => `${def.kind === 'rest' ? 'rest' : def.kind === 'pickup' ? 'take' : 'pull'}:${def.id}`;

/** The road's own tasks, room by room, west to east inside each room. */
export function buildTasks(): Task[] {
  const out: Task[] = [];
  for (const id of ROAD) {
    const room = ROOMS[id]!;
    const here: Task[] = [];
    for (const def of room.interactables ?? []) {
      if (def.kind === 'rest') {
        here.push({ id: `rest:${id}`, room: id, x: def.x, done: (r) => r.rested.has(id), run: (r) => (r.use(def.id), r.rested.add(id)) });
      } else {
        const flags = def.actions.flatMap((a) => (a.type === 'setFlag' ? [a.flag] : []));
        const abilities = def.actions.flatMap((a) => (a.type === 'unlockAbility' ? [a.abilityId] : []));
        here.push({
          id: DONE_ID(def) + `@${id}`,
          room: id,
          x: def.x,
          done: (r) => flags.every((f) => r.d.session.flags.has(f)) && abilities.every((a) => r.d.session.abilities.has(a)),
          run: (r) => void r.use(def.id),
        });
      }
    }
    for (const s of room.seals ?? []) {
      const style = SEAL_HOW[`${id}/${s.id}`];
      if (!style) continue;
      here.push({
        id: `seal:${id}/${s.id}`,
        room: id,
        x: s.x,
        done: (r) => r.d.session.flags.has(s.flag),
        run: (r) => (style === 'bolt' ? r.castAtSeal(s) : style === 'slam' ? r.slamAtSeal(s) : r.swordAtSeal(s)),
      });
    }
    for (const sp of room.spawns ?? []) {
      if (!sp.defeatFlag) continue;
      here.push({ id: `kill:${id}/${sp.id}`, room: id, x: sp.x, done: (r) => r.d.session.flags.has(sp.defeatFlag!), run: (r) => r.killKey(room, sp.id) });
    }
    for (const b of room.bosses ?? []) {
      here.push({ id: `boss:${id}/${b.id}`, room: id, x: b.arena.x0, done: (r) => r.d.session.flags.has(b.defeatFlag), run: (r) => r.fightBoss(room) });
    }
    here.sort((a, b) => a.x - b.x);
    out.push(...here);
  }
  return out;
}

/** The seals of the road that the run breaks, and how (the rest are the optional rooms'). */
const SEAL_HOW: Readonly<Record<string, 'bolt' | 'slam' | 'sword'>> = {
  'r3_chamber/seal': 'bolt',
  'mn_forge/crack': 'slam',
  'mn_descent/crack': 'slam',
  'rt_tangle/crack': 'sword',
};

export type { Enemy };
