import { Container } from 'pixi.js';
import { damp } from '@/core/math';
import type { RigFrame } from '../types';
import { place, type Kit, type Part } from './kit';
import type { Pt } from './geometry';
import { TAU } from './motion';

/**
 * What the guardians share of their MAKING (docs/PROMPT24-LOG.md) — never their look: the beacon that says the weak point is open, the smoothing of how open it is, and the surge of a phase change. Each guardian decides what its weak
 * point is (a heart behind bark doors, a core behind a lattice, a vent that blows steam) and draws it; this only gives the light and the pulse, driven by what the simulation says (`exposed`), not by a guess from the animation.
 */

/** How open the weak point is, 0 → 1, easing toward what the simulation says (`exposed`): quick to open, a little slower to shut. */
export class Opening {
  amount = 0;
  update(f: RigFrame, open = f.exposed): number {
    const want = open ? 1 : 0;
    if (f.dt > 0) this.amount = damp(this.amount, want, want > this.amount ? 14 : 7, f.dt);
    return this.amount;
  }
}

/** How awake it is (0 dormant → 1 up and fighting), easing: the intro is the wake, so the view needs no state of its own. */
export class Waking {
  amount = 0;
  update(f: RigFrame): number {
    const want = f.awake ? 1 : 0;
    if (f.dt > 0) this.amount = damp(this.amount, want, f.anim === 'alert' ? 2.2 : 6, f.dt);
    return this.amount;
  }
}

/** The surge of a phase change: 0 → 1 → 0 across the roar (`phaseTransition`), for shaking, glowing and growing. */
export function surge(f: RigFrame): number {
  return f.anim === 'phaseTransition' ? Math.sin(Math.min(1, f.p) * Math.PI) : 0;
}

/**
 * The light of an open weak point: a glow that swells, and rings that run out from it — the signal that this is the place to hit and that it is hit NOW. `show` puts it at a spot of the rig (cm, y up) with its openness.
 */
export class Beacon extends Container {
  private readonly glow;
  private readonly core;
  private readonly rings: Part[];
  constructor(k: Kit, color: number, private readonly size: number, hot = 0xffffff) {
    super({ label: 'beacon' });
    this.glow = k.glow(color, size, 0);
    this.core = k.glow(hot, size * 0.5, 0);
    this.rings = [0, 1].map((i) => {
      const r = k.part(`beacon-ring${i}`, (pen) => pen.circle(0, 0, size * 0.32).stroke(color, 2.4, 0.95));
      r.blendMode = 'add';
      return r;
    });
    this.addChild(this.glow, this.core, ...this.rings);
  }

  show(t: number, at: Pt, open: number, base = 0): void {
    const a = Math.min(1, base + open);
    this.visible = a > 0.01;
    if (!this.visible) return;
    const pulse = 0.5 + 0.5 * Math.sin(t * TAU * 1.6);
    this.position.set(at[0], -at[1]);
    this.glow.alpha = a * (0.55 + 0.35 * pulse);
    this.glow.scale.set((this.size * (0.8 + 0.5 * open + 0.1 * pulse)) / this.glow.texture.width);
    this.core.alpha = a * open * (0.5 + 0.5 * pulse);
    this.core.scale.set((this.size * 0.5 * (0.7 + 0.5 * pulse)) / this.core.texture.width);
    this.rings.forEach((r, i) => {
      const u = (t * 0.9 + i * 0.5) % 1;
      r.visible = open > 0.2;
      r.alpha = (1 - u) * open * 0.8;
      place(r, 0, 0, 0, 0.6 + u * 1.3, 0.6 + u * 1.3);
      r.position.set(0, 0);
    });
  }
}
