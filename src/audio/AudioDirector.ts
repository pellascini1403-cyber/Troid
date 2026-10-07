import type { EventBus } from '@/core/events';
import type { GameEvents } from '@/gameplay/events';
import { attackIntensity, hitIntensity, hurtIntensity, landIntensity, clamp01, type AudioCueEvent, type AudioCueId, type AudioSink } from '@/presentation/audioCues';

/**
 * Listens to the simulation's events and raises the cues of the sound to come (docs/ART-PIPELINE-2D.md, part H) — the same shape as the effects' director, for the
 * same reason: the simulation never knows this class exists, WHEN a cue happens is the simulation's event, and WHAT is done with it is a sink's. The game has no
 * sound: this is the seam an audio engine will plug into, and the one thing it reads.
 */
export interface AudioDirectorOptions {
  /** The simulation's clock (ticks), stamped on every cue. */
  now?: () => number;
  /** The ids of the skills that fly as projectiles: a hit by one of them is a bolt impact, not a sword hit. */
  projectileSkills?: ReadonlySet<string>;
}

export class AudioDirector {
  private readonly off: Array<() => void> = [];
  private readonly now: () => number;
  private readonly projectileSkills: ReadonlySet<string>;

  constructor(
    bus: EventBus<GameEvents>,
    private readonly sink: AudioSink,
    options: AudioDirectorOptions = {},
  ) {
    this.now = options.now ?? (() => 0);
    this.projectileSkills = options.projectileSkills ?? new Set();
    const at = (cue: AudioCueId, x: number, y: number, intensity = 1, variant = ''): void => this.raise(cue, x, y, intensity, variant);
    this.off.push(
      bus.on('player:attackActive', (e) => at('attack', e.x, e.y, attackIntensity(e.combo), e.attackId)),
      bus.on('combat:hit', (e) => {
        // the hero's own hurt cue comes from `player:hurt`: this is a blow that LANDED on something else
        if (e.targetTeam === 'player') return;
        at(this.projectileSkills.has(e.attackId) ? 'boltImpact' : 'hit', e.x, e.y, hitIntensity(e.damage, e.killed), e.attackId);
      }),
      bus.on('player:dashed', (e) => at('dash', e.x, e.y, 1, e.air ? 'air' : 'ground')),
      bus.on('player:hurt', (e) => at('hurt', e.x, e.y, hurtIntensity(e.damage))),
      bus.on('player:died', (e) => at('death', e.x, e.y)),
      bus.on('skill:cast', (e) => at('boltCast', e.x, e.y, 1, e.skillId)),
      bus.on('bottle:drinkStarted', (e) => at('bottleStart', e.x, e.y)),
      bus.on('bottle:drunk', (e) => at('bottleDrunk', e.x, e.y, clamp01(e.healed / 2))),
      bus.on('interaction:performed', (e) => at('interact', e.x, e.y, 1, e.kind)),
      bus.on('boss:strike', (e) => at('bossAttack', e.x, e.y, 1, e.attack)),
      bus.on('boss:defeated', (e) => at('bossDeath', e.x, e.y, 1, e.defId)),
      bus.on('transition:started', (e) => this.raise('roomTransition', null, null, 1, e.to.room)),
      bus.on('player:jumped', (e) => at('jump', e.x, e.y, 1, e.air ? 'air' : 'ground')),
      bus.on('player:landed', (e) => at('land', e.x, e.y, landIntensity(e.impact))),
      bus.on('enemy:telegraph', (e) => at('enemyTelegraph', e.x, e.y, 1, e.defId)),
      bus.on('actor:died', (e) => {
        if (e.team !== 'player') at('enemyDeath', e.x, e.y);
      }),
    );
  }

  private raise(cue: AudioCueId, x: number | null, y: number | null, intensity: number, variant: string): void {
    this.sink.cue({ cue, tick: this.now(), x, y, intensity, variant });
  }

  dispose(): void {
    for (const off of this.off.splice(0)) off();
  }
}

/** What a game with no sound does with a cue: nothing. */
export const NO_AUDIO: AudioSink = { cue: () => undefined };

export interface CueLogSnapshot {
  /** Every cue since the start (or the last `clear`). */
  total: number;
  /** …by cue. */
  counts: Partial<Record<AudioCueId, number>>;
  /** The last ones, oldest first. */
  recent: AudioCueEvent[];
}

/**
 * A sink that writes the cues down: what the tests and the development build look at to see what a sound engine WOULD be told. Bounded: it keeps the last `keep` cues
 * and counts the rest.
 */
export class CueLog implements AudioSink {
  private total = 0;
  private counts: Partial<Record<AudioCueId, number>> = {};
  private recent: AudioCueEvent[] = [];

  constructor(private readonly keep = 64) {}

  cue(event: Readonly<AudioCueEvent>): void {
    this.total++;
    this.counts[event.cue] = (this.counts[event.cue] ?? 0) + 1;
    this.recent.push({ ...event });
    if (this.recent.length > this.keep) this.recent.shift();
  }

  clear(): void {
    this.total = 0;
    this.counts = {};
    this.recent = [];
  }

  snapshot(): CueLogSnapshot {
    return { total: this.total, counts: { ...this.counts }, recent: this.recent.map((e) => ({ ...e })) };
  }
}
