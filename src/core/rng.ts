/**
 * Deterministic PRNG (mulberry32). All randomness inside the simulation goes through an `Rng`
 * so that tests are reproducible and a session can be replayed. `Math.random` is forbidden in sim code.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** Full internal state; save it to resume an identical sequence. */
  get state(): number {
    return this.s;
  }
  set state(value: number) {
    this.s = value >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, maxExclusive). */
  int(min: number, maxExclusive: number): number {
    return min + Math.floor(this.next() * (maxExclusive - min));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  /** -1 or +1 with equal probability. */
  sign(): -1 | 1 {
    return this.next() < 0.5 ? -1 : 1;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick on an empty array');
    return items[this.int(0, items.length)] as T;
  }

  /** Independent child generator: consuming it does not disturb this one's sequence. */
  fork(): Rng {
    return new Rng(Math.imul(this.int(0, 0x7fffffff), 0x9e3779b1) ^ 0x85ebca6b);
  }
}
