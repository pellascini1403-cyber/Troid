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

  constructor(initial?: Readonly<PlayStatsData>) {
    this.baseTicks = initial?.ticks ?? 0;
    this.deaths = initial?.deaths ?? 0;
    this.kills = initial?.kills ?? 0;
    this.rooms = new Set(initial?.rooms ?? []);
  }

  /**
   * Starts counting from the session's events. `room` is the one the hero is already in (it was built before anyone could listen). Returns what stops it.
   */
  attach(bus: EventBus<GameEvents>, room: string): () => void {
    this.rooms.add(room);
    const off = [
      bus.on('death:started', () => void this.deaths++),
      bus.on('actor:died', (e) => {
        if (e.team === 'enemy') this.kills++;
      }),
      bus.on('room:loaded', (e) => void this.rooms.add(e.roomId)),
    ];
    return () => {
      for (const f of off) f();
    };
  }

  /** The numbers now. `sessionTicks` is the session's own clock (`GameSession.now`): this session's play time, on top of the time the save already had. */
  snapshot(sessionTicks: number): PlayStatsData {
    return { ticks: this.baseTicks + Math.max(0, Math.floor(sessionTicks)), deaths: this.deaths, kills: this.kills, rooms: [...this.rooms].sort() };
  }
}
