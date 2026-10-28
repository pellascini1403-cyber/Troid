import type { EventBus } from '@/core/events';
import type { PlayStatsData } from '@/save/ProgressData';
import type { GameEvents } from './events';

/**
 * What the hero has DONE, counted from the events the simulation already raises (docs/PROMPT14-LOG.md): the times they have fallen, the enemies that fell to them, the rooms they have
 * been in, and for how long they have lived in the world. The profile shows it and the save keeps it; nothing in the rules of the game reads it, so counting it can never change a game.
 *
 * Every number is something that happened: a defeat is `death:started`, a kill is a hostile `actor:died` (a seal is neutral, the hero's own death is not a kill), a room is a room that was
 * built around the hero. Time is the simulation's own tick count — 60 to the second, frozen by a hit-stop, absent while the game is paused, held or loading — added to what the save already
 * held, so it is the time spent PLAYING, not the time the page was open.
 */
export class PlayStats {
  private baseTicks: number;
  private deaths: number;
  private kills: number;
  private readonly rooms: Set<string>;
  /** Where the time went, the falls and how long each guardian took to reach (see `PlayStatsData`). */
  private readonly zones: Map<string, number>;
  private readonly falls: Map<string, number>;
  private readonly guardians: Map<string, number>;
  /** The zone the hero is in, the session tick the stretch began on, and how a room is told from a zone (nothing, until attached with the means to). */
  private zone = '';
  private since = 0;
  private zoneOf: (room: string) => string = () => '';
  private clock: () => number = () => 0;

  constructor(initial?: Readonly<PlayStatsData>) {
    this.baseTicks = initial?.ticks ?? 0;
    this.deaths = initial?.deaths ?? 0;
    this.kills = initial?.kills ?? 0;
    this.rooms = new Set(initial?.rooms ?? []);
    this.zones = new Map(Object.entries(initial?.zones ?? {}));
    this.falls = new Map(Object.entries(initial?.falls ?? {}));
    this.guardians = new Map(Object.entries(initial?.guardians ?? {}));
  }

  /**
   * Starts counting from the session's events. `room` is the one the hero is already in (it was built before anyone could listen). With `where` the time is counted by ZONE as well — the ticks of the session's own clock between one zone and the next —
   * and the falls by zone, and the moment each guardian first falls. Returns what stops it.
   */
  attach(bus: EventBus<GameEvents>, room: string, where?: { zoneOf(room: string): string; clock(): number }): () => void {
    this.rooms.add(room);
    if (where) {
      this.zoneOf = where.zoneOf;
      this.clock = where.clock;
      this.zone = where.zoneOf(room);
      this.since = where.clock();
    }
    const off = [
      bus.on('death:started', () => {
        this.deaths++;
        if (this.zone) this.falls.set(this.zone, (this.falls.get(this.zone) ?? 0) + 1);
      }),
      bus.on('actor:died', (e) => {
        if (e.team === 'enemy') this.kills++;
      }),
      bus.on('room:loaded', (e) => {
        this.rooms.add(e.roomId);
        const zone = this.zoneOf(e.roomId);
        if (zone !== this.zone) {
          this.settle();
          this.zone = zone;
        }
      }),
      bus.on('boss:defeated', (e) => {
        if (this.zone && !this.guardians.has(e.defId)) this.guardians.set(e.defId, this.baseTicks + this.clock());
      }),
    ];
    return () => {
      for (const f of off) f();
    };
  }

  /** Adds the stretch in the zone the hero has been in until now, and begins the next one here. */
  private settle(): void {
    const now = this.clock();
    if (this.zone && now > this.since) this.zones.set(this.zone, (this.zones.get(this.zone) ?? 0) + (now - this.since));
    this.since = now;
  }

  /** The numbers now. `sessionTicks` is the session's own clock (`GameSession.now`): this session's play time, on top of the time the save already had. */
  snapshot(sessionTicks: number): PlayStatsData {
    const zones = new Map(this.zones);
    if (this.zone && sessionTicks > this.since) zones.set(this.zone, (zones.get(this.zone) ?? 0) + Math.floor(sessionTicks) - this.since);
    const out: PlayStatsData = { ticks: this.baseTicks + Math.max(0, Math.floor(sessionTicks)), deaths: this.deaths, kills: this.kills, rooms: [...this.rooms].sort() };
    if (zones.size > 0) out.zones = Object.fromEntries(zones);
    if (this.falls.size > 0) out.falls = Object.fromEntries(this.falls);
    if (this.guardians.size > 0) out.guardians = Object.fromEntries(this.guardians);
    return out;
  }
}
