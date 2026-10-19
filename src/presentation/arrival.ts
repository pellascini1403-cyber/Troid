import type { Rect } from '@/core/math';

/**
 * THE ARRIVAL (docs/PROMPT13-LOG.md): what makes a change of zone look like a finished place and not like a scenery being put up in front of the player.
 *
 * The simulation swaps the room in ONE step, at the end of the fade to black (`RoomTransition`); what is SEEN of the new room — the art of its zone, its scenes, the dressed creatures — is
 * made of files that may not be in memory yet. This is the small state machine that keeps the two honest with each other, and it knows nothing of Pixi, the DOM or the network (the caller tells
 * it what happened and what time it is):
 *
 *   1. `prepare(room)`  — the way out was touched: the art of the destination starts coming in while the old room fades. The caller reports how it ended (`settle`).
 *   2. `close(room)`    — the swap happened, under the black: the WORLD IS HELD (no tick runs) until the new room can be shown. Nothing about the simulation waits or changes: it simply is not asked
 *                         for the next tick, so the ticks that follow are the same ones whenever they come.
 *   3. `ready(now)`     — the room's view may be built: its art is in (or failed, or the wait ran out). The caller builds it whole, in one step.
 *   4. `built()` / `rendered()` — the room is on the stage; a couple of frames are drawn with it under the black (the first draw is where the GPU takes the pictures: it must happen out of
 *                         sight), and the world goes on — the fade back in starts from a picture that is already there.
 *
 * It can never hold the player: the wait is bounded (`ARRIVAL.maxWaitMs`), a failure lets go at once, and a transition that is cancelled drops everything.
 */
export const ARRIVAL = {
  /** The longest the world waits, held at black, for the art of the room it arrives in (ms). Past it the room is shown as it can be and the art follows, like the boot curtain. */
  maxWaitMs: 10_000,
  /** How long the wait must last before the loading indicator is shown (ms): a change of zone that is ready in less than this shows no screen of loading at all. */
  graceMs: 450,
  /** Frames drawn with the new room under the black before the world goes on. */
  warmFrames: 2,
} as const;

/** How the wait ended: the art is in, it could not be had (the room is shown without it), or it did not come in time. */
export type ArrivalOutcome = 'ready' | 'failed' | 'timeout';

export type ArrivalStage = 'idle' | 'loading' | 'warming';

/** Where the arrival is, as plain data (the interface and the tests read it). */
export interface ArrivalSnapshot {
  /** The world is held: no tick runs until the room it arrived in is on the stage. */
  blocking: boolean;
  /** The room the world is held for. */
  room: string | null;
  /** `loading`: the art is on its way; `warming`: the room is built and being drawn under the black. */
  stage: ArrivalStage;
  /** How the wait ended, once the room was allowed to be built. */
  outcome: ArrivalOutcome | null;
  /** Milliseconds the world has been held. */
  waited: number;
}

interface Preparation {
  room: string;
  serial: number;
  state: 'loading' | 'ready' | 'failed';
}

export class ArrivalGate {
  private prep: Preparation | null = null;
  private serial = 0;
  private held: { room: string; since: number } | null = null;
  private stage: ArrivalStage = 'idle';
  private outcome: ArrivalOutcome | null = null;
  private warm = 0;

  constructor(private readonly options: { maxWaitMs: number; warmFrames: number } = ARRIVAL) {}

  /** The world is held right now. */
  get blocking(): boolean {
    return this.held !== null;
  }

  /** The room being prepared (or ready to be shown), `null` when nothing is. */
  get preparing(): string | null {
    return this.prep?.room ?? null;
  }

  /**
   * The art of `room` is about to be asked for. A second call for the same room while its preparation is running (or done) is the same preparation (`fresh: false`): nothing is started twice.
   * `serial` identifies this preparation for `settle`; a newer preparation makes an older one's answer harmless.
   */
  prepare(room: string): { serial: number; fresh: boolean } {
    if (this.prep && this.prep.room === room && this.prep.state !== 'failed') return { serial: this.prep.serial, fresh: false };
    this.prep = { room, serial: ++this.serial, state: 'loading' };
    return { serial: this.prep.serial, fresh: true };
  }

  /** How the preparation `serial` ended. An answer for a preparation that has been replaced is ignored. */
  settle(serial: number, ok: boolean): void {
    if (this.prep?.serial !== serial) return;
    this.prep.state = ok ? 'ready' : 'failed';
  }

  /**
   * The swap happened under the black: the world is held for `room`. A room nothing was prepared for (a defeat that brings the hero back to a room the transition did not announce) has nothing to wait
   * for as far as this knows — the caller prepares first if it has anything to prepare.
   */
  close(room: string, now: number): void {
    if (!this.prep || this.prep.room !== room) this.prep = { room, serial: ++this.serial, state: 'ready' };
    this.held = { room, since: now };
    this.stage = 'loading';
    this.outcome = null;
    this.warm = 0;
  }

  /**
   * May the view of the room be built now? `null` while the art is still on its way and the wait has not run out; otherwise how it ended. Asking again after the answer is not `null` gives the
   * same answer. Only meaningful while the world is held.
   */
  ready(now: number): ArrivalOutcome | null {
    if (!this.held) return null;
    if (this.outcome) return this.outcome;
    const state = this.prep?.state ?? 'ready';
    if (state === 'ready') this.outcome = 'ready';
    else if (state === 'failed') this.outcome = 'failed';
    else if (now - this.held.since >= this.options.maxWaitMs) this.outcome = 'timeout';
    return this.outcome;
  }

  /** The view of the room is on the stage: the frames drawn from now on count toward letting the world go on. */
  built(): void {
    if (!this.held || this.stage !== 'loading') return;
    this.stage = 'warming';
    this.warm = 0;
  }

  /** A frame was drawn. Returns true on the one that lets the world go on. */
  rendered(): boolean {
    if (!this.held || this.stage !== 'warming') return false;
    if (++this.warm < this.options.warmFrames) return false;
    this.held = null;
    this.stage = 'idle';
    this.prep = null; // what was prepared was shown: the next visit to the room prepares again
    return true;
  }

  /** The transition was called off (or the room was loaded by hand): nothing is waited for any more. Returns whether the world had been held. */
  cancel(): boolean {
    const was = this.held !== null;
    this.held = null;
    this.stage = 'idle';
    this.outcome = null;
    this.warm = 0;
    this.prep = null;
    return was;
  }

  snapshot(now: number): ArrivalSnapshot {
    return {
      blocking: this.held !== null,
      room: this.held?.room ?? null,
      stage: this.stage,
      outcome: this.outcome,
      waited: this.held ? Math.max(0, now - this.held.since) : 0,
    };
  }
}

// ---------------------------------------------------------------------------------------------------------------------------- walking toward a way out

/**
 * How close to a way out (metres, along the room) the hero must be, WALKING TOWARD IT (faster than `minSpeed` m/s), for the art of what lies beyond to start coming in, and how far they must go
 * away for it to be given back. A hero who has just come through a way and stands beside it is not walking toward it: what they left is not brought back for them until they turn.
 */
export const PREFETCH = { nearM: 42, farM: 64, minSpeed: 0.75 } as const;

interface WatchedRoom {
  exits?: ReadonlyArray<{ rect: Rect; to?: { room: string }; requires?: string }>;
}

/** Distance along the room from `x` to a rectangle (0 inside it). */
const along = (x: number, r: Rect): number => (x < r.x0 ? r.x0 - x : x > r.x1 ? x - r.x1 : 0);

/**
 * The room the hero is walking toward, if any: the destination of the nearest way out that LEADS somewhere (and is open: a way shut by a flag the hero does not have yet is not prepared) within
 * `PREFETCH.nearM` metres of `x` with the hero moving toward it at `vx` — or, for the room already being prepared (`current`), within `farM` whichever way they move, so that a hero pacing around
 * the limit does not make the art come and go.
 */
export function roomAhead(room: WatchedRoom, x: number, vx: number, flagSet: (flag: string) => boolean, known: (room: string) => boolean, current: string | null): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const exit of room.exits ?? []) {
    if (!exit.to || !known(exit.to.room)) continue;
    if (exit.requires !== undefined && !flagSet(exit.requires)) continue;
    const d = along(x, exit.rect);
    const kept = exit.to.room === current;
    const toward = x < exit.rect.x0 ? vx > PREFETCH.minSpeed : x > exit.rect.x1 ? vx < -PREFETCH.minSpeed : true;
    if (d > (kept ? PREFETCH.farM : PREFETCH.nearM) || (!kept && !toward)) continue;
    if (d < bestD) {
      best = exit.to.room;
      bestD = d;
    }
  }
  return best;
}
