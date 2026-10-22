import type { EventBus } from '@/core/events';
import type { GameEvents } from '@/gameplay/events';
import type { AudioCueEvent, AudioSink } from '@/presentation/audioCues';
import type { AmbientScatter } from './ambience';
import type { AudioEngine } from './engine';
import type { LoopChannel } from './loops';
import { soundsFor, STINGER_RANK, UI_SOUNDS, type PlaySpec, type UiSoundKind } from './soundMap';
import { BOSS_MUSIC, zoneOf, type ZoneAudio } from './zoneAudio';

/**
 * THE CONDUCTOR (docs/PROMPT18-LOG.md): what the game sounds like as a whole, moment to moment. The engine plays what it is told; the conductor knows what to tell it — it hears the cues of the simulation and plays the
 * sound of each, and it follows where the hero is and what is happening to them: the room they are in decides the music, the bed of the ambience, the echo and the sound of the floor; a fight brings the drive of the
 * music in and lets it go again; a boss has a piece of its own; a defeat dims the music and a rest gives it back.
 *
 * The music is STATE, not events: asking for the piece that already plays changes nothing, so a room that is rebuilt (a respawn, a quality change, a reload) never restarts it, and two rooms that share a piece share it
 * through the door.
 */
export const FADE = {
  /** Changing from the music of one place to another's. */
  zone: 3.5,
  /** Into a boss's piece: quick, the fight has begun. */
  bossIn: 1.2,
  /** Out of it: slow, the danger is over. */
  bossOut: 4.5,
  /** The bed of the ambience. */
  bed: 2.5,
  /** Everything goes quiet. */
  silence: 2,
} as const;

export const THREAT = {
  /** Seconds the music stays tense after something threatened the hero, counted in game time. */
  hold: 7,
  /** …and after something that threatened them died: a victory is felt soon. */
  afterKill: 2.5,
  /** How long the drive layer takes to come in and to go out. */
  rise: 1.2,
  fall: 5,
} as const;

/** The life (0 … 1) under which the hero's heart is heard. */
export const LOW_LIFE = 0.34;

export interface ConductorOptions {
  engine: AudioEngine;
  music: LoopChannel;
  ambience: LoopChannel;
  scatter: AmbientScatter;
  bus: EventBus<GameEvents>;
  /** The room the game starts in. */
  room: string;
  /** The sound of each room. Default: the table of the game. */
  zones?: (roomId: string) => ZoneAudio;
  /** The pieces of music that exist (a piece that is asked for and is not in the manifest is not played). */
  hasTrack?: (id: string) => boolean;
  /** Where the groups of a place's own sounds are held while the hero is in it. */
  loader?: { retain(group: string): Promise<unknown>; release(group: string): void };
}

/** What the page knows each frame. */
export interface AudioFrame {
  /** Where the hero is (metres). */
  x: number;
  y: number;
  /** Their life, 0 … 1; `undefined` when not known. */
  life?: number;
  /** They are down. */
  dead?: boolean;
}

interface Delayed {
  left: number;
  run: () => void;
}

type BossState = 'none' | 'fight';

export class Conductor implements AudioSink {
  private roomId: string;
  private zone: ZoneAudio;
  private boss: BossState = 'none';
  private bossPhase = 1;
  private dead = false;
  private paused = false;
  /** Game seconds the music stays tense for. */
  private threat = 0;
  private lastDrive = -1;
  private heartbeat = 0;
  private low = false;
  private life = 1;
  /** The room whose echo, bed and small sounds are in place. */
  private appliedRoom: string | null = null;
  /** The groups of sounds held for the place the hero is in. */
  private held: readonly string[] = [];
  private readonly delayed: Delayed[] = [];
  private stingers: Array<{ spec: PlaySpec; rank: number }> = [];
  private readonly offs: Array<() => void> = [];
  private readonly zones: (roomId: string) => ZoneAudio;
  private readonly hasTrack: (id: string) => boolean;

  constructor(private readonly o: ConductorOptions) {
    this.zones = o.zones ?? zoneOf;
    this.hasTrack = o.hasTrack ?? (() => true);
    this.roomId = o.room;
    this.zone = this.zones(o.room);
    const { bus } = o;
    this.offs.push(
      bus.on('room:loaded', (e) => this.enterRoom(e.roomId)),
      bus.on('boss:started', (e) => this.bossStarted(e.defId)),
      bus.on('boss:phase', (e) => this.bossTurned(e.phase)),
      bus.on('boss:defeated', () => this.bossFell()),
      bus.on('death:started', () => this.heroFell()),
      bus.on('death:respawned', () => this.heroBack()),
      bus.on('enemy:alerted', () => this.threaten(THREAT.hold)),
      bus.on('enemy:telegraph', () => this.threaten(THREAT.hold)),
      bus.on('player:hurt', () => this.threaten(THREAT.hold)),
      bus.on('combat:hit', (e) => {
        if (e.targetTeam !== 'player') this.threaten(THREAT.hold);
      }),
      bus.on('actor:died', (e) => {
        if (e.team !== 'player') this.threat = Math.min(this.threat, THREAT.afterKill);
      }),
    );
    this.enterRoom(o.room);
  }

  // ------------------------------------------------------------------------------------------------ the cues

  /** The sink of the audio director: every cue of the simulation comes here. */
  cue(event: Readonly<AudioCueEvent>): void {
    const { engine } = this.o;
    const at = event.x !== null && event.y !== null ? { x: event.x, y: event.y } : null;
    for (const spec of soundsFor(event, { surface: this.zone.surface })) {
      const rank = STINGER_RANK[spec.id];
      if (rank !== undefined) {
        // a stinger waits one frame for the others of the same moment, and only the biggest is played (a card that teaches a power sounds as the power)
        this.stingers.push({ spec, rank });
        continue;
      }
      engine.play({ id: spec.id, at, gainDb: spec.gainDb, rate: spec.rate, delay: spec.delay });
    }
  }

  /** A sound of the interface. */
  ui(kind: UiSoundKind): void {
    this.o.engine.play({ id: UI_SOUNDS[kind] });
  }

  // ------------------------------------------------------------------------------------------------ the place

  private enterRoom(roomId: string): void {
    this.roomId = roomId;
    this.zone = this.zones(roomId);
    // a room that is built again (the hero comes back to it, a reload) keeps its echo, its bed and the wait of its small sounds as they are
    if (this.appliedRoom !== roomId) {
      this.appliedRoom = roomId;
      this.o.engine.setRoom(this.zone.room);
      this.o.ambience.play(this.zone.bed, FADE.bed);
      this.o.scatter.setZone(this.zone.scatter);
      this.hold(this.zone.groups ?? []);
      // a threat belongs to the place it was met in
      this.threat = 0;
    }
    this.applyMusic();
  }

  /** Holds the groups a place needs and lets go of the ones the place before it did (the loader keeps them a while longer, in case the hero comes back through the door). */
  private hold(groups: readonly string[]): void {
    const loader = this.o.loader;
    if (!loader) return;
    for (const g of groups) if (!this.held.includes(g)) void loader.retain(g);
    for (const g of this.held) if (!groups.includes(g)) loader.release(g);
    this.held = groups;
  }

  /** The piece the game should be playing now, from where the hero is and what is happening. Idempotent: it is called whenever any of it changes. */
  private applyMusic(): void {
    const { music } = this.o;
    let track = this.zone.track;
    let fade: number = FADE.zone;
    if (this.boss === 'fight') {
      track = this.bossTrack ?? track;
      fade = FADE.bossIn;
    } else if (this.leavingBoss) {
      fade = FADE.bossOut;
      this.leavingBoss = false;
    }
    if (track !== null && !this.hasTrack(track)) track = null;
    music.play(track, track === null ? FADE.silence : fade);
    this.driveLayer(true);
  }

  private bossTrack: string | null = null;
  /** The boss's piece was playing and the fight is over: the way back is slow. */
  private leavingBoss = false;

  private bossStarted(defId: string): void {
    this.boss = 'fight';
    this.bossPhase = 1;
    this.bossTrack = BOSS_MUSIC[defId] ?? null;
    this.leavingBoss = false;
    this.applyMusic();
  }

  private bossTurned(phase: number): void {
    this.bossPhase = phase;
    this.driveLayer(true);
  }

  private bossFell(): void {
    this.endFight();
    // the room goes quiet for the fall, and the calm comes back after it
    this.o.music.play(null, 1.6);
    this.after(2.4, () => this.applyMusic());
  }

  private heroFell(): void {
    this.dead = true;
    this.threat = 0;
    this.o.engine.setMusicMood('death', true);
  }

  private heroBack(): void {
    this.dead = false;
    this.o.engine.setMusicMood('death', false);
    // a fight that the hero lost is over: the boss starts anew when they come back to it
    if (this.boss === 'fight') this.endFight();
    this.applyMusic();
  }

  private endFight(): void {
    this.boss = 'none';
    this.bossPhase = 1;
    this.leavingBoss = true;
    this.threat = 0;
  }

  // ------------------------------------------------------------------------------------------------ the drive

  private threaten(seconds: number): void {
    if (this.dead) return;
    this.threat = Math.max(this.threat, seconds);
  }

  /** How much of the music's drive layer is heard: all of it while there is a threat, a fixed share through a boss fight (more once it turns). */
  private driveTarget(): number {
    if (this.dead) return 0;
    if (this.boss === 'fight') return this.bossPhase >= 2 ? 1 : 0.45;
    return this.threat > 0 ? 1 : 0;
  }

  private driveLayer(force: boolean): void {
    const target = this.driveTarget();
    if (!force && target === this.lastDrive) return;
    const rising = target > this.lastDrive;
    this.lastDrive = target;
    this.o.music.setLayer('drive', target, rising ? THREAT.rise : THREAT.fall);
  }

  // ------------------------------------------------------------------------------------------------ time

  private after(seconds: number, run: () => void): void {
    this.delayed.push({ left: seconds, run });
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.o.engine.setPaused(paused);
  }

  /**
   * Once per frame. `dt` is the seconds the GAME ran (0 while it is paused, held or hidden behind a curtain): the threat, the small sounds of the place, the heart and the delayed changes of the music all keep game time.
   */
  update(dt: number, frame: AudioFrame): void {
    const { engine } = this.o;
    engine.setListener(frame.x, frame.y);
    engine.tick();
    if (dt > 0) {
      this.o.scatter.update(dt);
      if (this.threat > 0) this.threat = Math.max(0, this.threat - dt);
      for (const d of [...this.delayed]) {
        d.left -= dt;
        if (d.left <= 0) {
          this.delayed.splice(this.delayed.indexOf(d), 1);
          d.run();
        }
      }
      this.beat(dt, frame);
    }
    this.driveLayer(false);
    this.flushStingers();
  }

  /** The hero's heart, while their life is low: a pulse that is faster the lower it is. */
  private beat(dt: number, frame: AudioFrame): void {
    const life = frame.life;
    this.life = life ?? 1;
    if (frame.dead || this.dead || life === undefined || !(life > 0) || life > LOW_LIFE) {
      this.low = false;
      return;
    }
    if (!this.low) {
      // the first beat comes after the blow that took the life, not on top of it
      this.low = true;
      this.heartbeat = 0.9;
    }
    this.heartbeat -= dt;
    if (this.heartbeat > 0) return;
    const low = 1 - life / LOW_LIFE;
    this.heartbeat = 1.15 - 0.4 * low;
    this.o.engine.play({ id: 'hero.heartbeat', gainDb: -6 + 5 * low });
  }

  private flushStingers(): void {
    if (this.stingers.length === 0) return;
    const best = this.stingers.reduce((a, b) => (b.rank > a.rank ? b : a));
    this.stingers = [];
    this.o.engine.play({ id: best.spec.id, gainDb: best.spec.gainDb, delay: best.spec.delay });
  }

  // ------------------------------------------------------------------------------------------------ observing

  state(): { room: string; boss: BossState; threat: number; dead: boolean; paused: boolean; drive: number; life: number } {
    return { room: this.roomId, boss: this.boss, threat: this.threat, dead: this.dead, paused: this.paused, drive: this.lastDrive, life: this.life };
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    this.hold([]);
    this.delayed.length = 0;
    this.stingers = [];
  }
}
