import { Container, Sprite } from 'pixi.js';
import { taperedOutline, type Pt } from './geometry';
import { place, type Kit, type Part } from './kit';
import { ik2, mote } from './motion';
import type { Material, Pen } from './paint';

/**
 * The anatomy that several species share the MAKING of (docs/PROMPT24-LOG.md) — never the look: a limb of two bones, a cloud of rising motes, the closed-form fall of a piece that has come loose. Each species decides what its limb
 * is made of, how long its bones are and what it does with them.
 */

export interface LegSpec {
  /** Length of the upper and the lower bone, cm. */
  l1: number;
  l2: number;
  /** Width at the joint, at the knee and at the foot, cm. */
  w0: number;
  w1: number;
  w2: number;
  mat: Material;
  /** Draws what is at the end of the lower bone (a foot, a claw, a hoof) in the space of the bone (+x along it). */
  foot?: (pen: Pen, l2: number) => void;
}

/** A limb of two bones that reaches for a point: set `reach` every frame and the bones turn to meet it. */
export class Leg {
  readonly root: Container;
  readonly upper: Part;
  readonly lower: Part;
  private readonly spec: LegSpec;

  constructor(k: Kit, key: string, spec: LegSpec) {
    this.spec = spec;
    this.root = k.group(key);
    this.upper = k.part(`${key}-upper`, (pen) => pen.shape(taperedOutline(spec.l1, spec.w0, spec.w1), spec.mat));
    this.lower = k.part(`${key}-lower`, (pen) => {
      pen.shape(taperedOutline(spec.l2, spec.w1, spec.w2), spec.mat);
      spec.foot?.(pen, spec.l2);
    });
    this.root.addChild(this.upper);
    this.upper.addChild(this.lower);
  }

  /** The foot goes to `(tx, ty)` measured from the hip (y up); `bend` is the side the knee pops out to. Returns the angle of the lower bone. */
  reach(tx: number, ty: number, bend: 1 | -1 = 1): number {
    const r = ik2(this.spec.l1, this.spec.l2, tx, ty, bend);
    place(this.upper, 0, 0, r.a1);
    place(this.lower, this.spec.l1, 0, r.a2 - r.a1);
    return r.a2;
  }
}

/** A cloud of motes (embers, spores, ash, sparks) that rise and fade: `show` moves them from the clock alone, so it holds no state and allocates nothing. */
export class Motes extends Container {
  private readonly sprites: Sprite[];
  constructor(
    k: Kit,
    private readonly count: number,
    color: number,
    /** Size of a mote at its biggest, cm. */
    private readonly size: number,
    private readonly seed = 0,
  ) {
    super({ label: 'motes' });
    this.sprites = Array.from({ length: count }, () => {
      const s = k.glow(color, size, 0);
      this.addChild(s);
      return s;
    });
  }

  /** Over the box centred on `(x, y)`, `w` wide and `h` tall (cm, y up): the motes start at its foot and rise to its top, `hz` laps a second, all at `alpha`. */
  show(t: number, x: number, y: number, w: number, h: number, hz: number, alpha: number): void {
    this.visible = alpha > 0.01;
    if (!this.visible) return;
    for (let i = 0; i < this.count; i++) {
      const m = mote(i, this.count, t, hz, this.seed);
      const s = this.sprites[i]!;
      s.position.set(x + (m.x * w) / 2, -(y - h / 2 + m.y * h));
      s.alpha = m.a * alpha;
      s.scale.set((this.size * m.s) / s.texture.width);
    }
  }
}

/**
 * Where a piece that has come loose is, as a function of how far the death has got — no state, so a frozen frame and a replay agree. It starts at `from`, leaves with velocity `v` (cm per death), falls under `g` and turns
 * `spin` radians in all; once it hits `floor` (cm, y up, local) it stops there. Writes into `node`.
 */
export function flung(node: Container, from: Pt, v: Pt, spin: number, g: number, floor: number, dying: number): void {
  const t = Math.min(1, Math.max(0, dying));
  let y = from[1] + v[1] * t - 0.5 * g * t * t;
  let rest = 0;
  if (y < floor) {
    y = floor;
    rest = 1;
  }
  node.position.set(from[0] + v[0] * t, -y);
  node.rotation = -spin * (rest ? Math.min(1, t * 1.15) : t);
}
