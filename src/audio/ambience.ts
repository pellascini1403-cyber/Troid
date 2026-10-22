import type { AudioEngine } from './engine';

/**
 * THE SMALL SOUNDS OF A PLACE (docs/PROMPT18-LOG.md): what the bed of an ambience cannot be, because it repeats — a drop of water far away, a stone that settles, the wind in a gap, a breath of the sanctum. Each one
 * is a sound of the manifest that is played now and then, at random, from somewhere in the world a little away from the hero and on either side, and not constantly: a place that makes a noise every second is a
 * place that has nothing to say.
 *
 * It keeps time with the WORLD: `update(dt)` is given the seconds the game has run, so a pause (dt of 0) holds the silence where it was instead of letting a whole minute of drops pile up behind the menu.
 */
export interface ScatterSpec {
  /** The sound of the manifest. */
  id: string;
  /** The shortest and longest wait between two plays of it (seconds of the game). */
  gap: readonly [min: number, max: number];
  /** The chance (0 … 1) that it plays when its time comes; when it does not, the next try is a whole new wait. Default 1. */
  chance?: number;
  /** How far from the hero it is, metres (min, max), on a side picked at random. */
  distance: readonly [min: number, max: number];
  /** Level on top of the sound's own (dB). */
  gainDb?: number;
  /** How high above the hero's feet (metres); default 1. */
  height?: number;
}

interface Slot {
  spec: ScatterSpec;
  wait: number;
}

export class AmbientScatter {
  private slots: Slot[] = [];
  private played = 0;

  constructor(
    private readonly engine: AudioEngine,
    private readonly random: () => number = Math.random,
  ) {}

  /** The sounds of the place the hero is in now. The first of each comes after a wait of its own (a place does not start with a drop in the first second). */
  setZone(specs: readonly ScatterSpec[]): void {
    this.slots = specs.map((spec) => ({ spec, wait: this.between(spec.gap[0] * 0.5, spec.gap[1]) }));
  }

  /** `dt`: seconds of the game since the last call (0 while it is paused). */
  update(dt: number): void {
    if (!(dt > 0) || this.slots.length === 0) return;
    const listener = this.engine.listenerPosition;
    for (const slot of this.slots) {
      slot.wait -= dt;
      if (slot.wait > 0) continue;
      const { spec } = slot;
      slot.wait = this.between(spec.gap[0], spec.gap[1]);
      if (this.random() >= (spec.chance ?? 1)) continue;
      const side = this.random() < 0.5 ? -1 : 1;
      const x = listener.x + side * this.between(spec.distance[0], spec.distance[1]);
      if (this.engine.play({ id: spec.id, at: { x, y: listener.y + (spec.height ?? 1) }, gainDb: spec.gainDb })) this.played++;
    }
  }

  get count(): number {
    return this.played;
  }

  /** The ids it is playing in this place, for the tests. */
  get ids(): string[] {
    return this.slots.map((s) => s.spec.id);
  }

  private between(lo: number, hi: number): number {
    return lo + (hi - lo) * this.random();
  }
}
