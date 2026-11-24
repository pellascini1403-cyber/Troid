import { GraphicsContext, Texture } from 'pixi.js';
import { createCanvas } from '@/assets/proceduralTextures';
import type { Pen } from './paint';

/**
 * What every rig shares (docs/PROMPT24-LOG.md): a handful of tiny grey ramps that the shapes are filled with and TINTED — so a hundred bodies of a hundred colours use the same few textures and batch together —, the soft
 * round light of the effects' atlas for the halos and the glow of the eyes, and the cache of the shapes' geometry (a bat is drawn once per game, however many hang from the roof). Made once per game (`Game2D` owns it, as it
 * owns the effects' atlas); a test hands over plain white textures.
 */
export type RampName = 'sphere' | 'vert' | 'tube' | 'flat' | 'cap' | 'fade' | 'soft';

/** One thing a shape's silhouette is made of (what the hit flash repaints in white): a path of the pen. */
export type SilhouetteOp = (pen: Pen) => void;

/** A shape the cache holds: its geometry, and the paths of its silhouette (the white-hot flash is built from them the first time somebody is hit). */
export interface ShapeEntry {
  readonly ctx: GraphicsContext;
  readonly silhouette: SilhouetteOp[];
  flash: GraphicsContext | null;
}

export interface RigAssets {
  /** The soft round light (white, alpha falling to the edge): halos, bloom, contact shadows. */
  readonly glow: Texture;
  /** A grey ramp; tinted with the colour of the material it gives volume. */
  ramp(name: RampName): Texture;
  /** The geometry of a shape, built by `make` the first time it is asked for and shared by every creature that draws it. */
  shape(key: string, make: (ctx: GraphicsContext, silhouette: SilhouetteOp[]) => void): ShapeEntry;
  destroy(): void;
}

const SIZE = 64;

function paintRamp(name: RampName): Texture {
  const { canvas, ctx } = createCanvas(SIZE, SIZE);
  const grey = (v: number): string => {
    const c = Math.round(Math.max(0, Math.min(1, v)) * 255);
    return `rgb(${c},${c},${c})`;
  };
  if (name === 'flat') {
    ctx.fillStyle = grey(1);
    ctx.fillRect(0, 0, SIZE, SIZE);
  } else if (name === 'fade') {
    // white that thins away downward: the hem of a veil that dissolves into the dark
    const g = ctx.createLinearGradient(0, 0, 0, SIZE);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);
  } else if (name === 'soft') {
    // white that only thins a little downward: a cloak whose hem is dimmer but still there
    const g = ctx.createLinearGradient(0, 0, 0, SIZE);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.82)');
    g.addColorStop(1, 'rgba(255,255,255,0.3)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);
  } else if (name === 'vert') {
    // light from above: the top of the form is bright, the underside falls away
    const g = ctx.createLinearGradient(0, 0, 0, SIZE);
    g.addColorStop(0, grey(1));
    g.addColorStop(0.55, grey(0.62));
    g.addColorStop(1, grey(0.3));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);
  } else if (name === 'tube') {
    // a round limb seen from the side, lit from above: dark under, a bright shoulder a third of the way down, a thin dark edge up top
    const g = ctx.createLinearGradient(0, 0, 0, SIZE);
    g.addColorStop(0, grey(0.55));
    g.addColorStop(0.28, grey(1));
    g.addColorStop(0.62, grey(0.6));
    g.addColorStop(1, grey(0.26));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);
  } else if (name === 'cap') {
    // a cylinder seen end-on (a bell, a column, a piston): the light runs across it
    const g = ctx.createLinearGradient(0, 0, SIZE, 0);
    g.addColorStop(0, grey(0.3));
    g.addColorStop(0.22, grey(0.82));
    g.addColorStop(0.36, grey(1));
    g.addColorStop(0.7, grey(0.55));
    g.addColorStop(1, grey(0.22));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);
  } else {
    // a sphere lit from the upper left (the back, as the creatures face right): bright there, a dark limb on the far side
    const g = ctx.createRadialGradient(SIZE * 0.34, SIZE * 0.28, 0, SIZE * 0.5, SIZE * 0.5, SIZE * 0.78);
    g.addColorStop(0, grey(1));
    g.addColorStop(0.45, grey(0.7));
    g.addColorStop(1, grey(0.22));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }
  return Texture.from(canvas);
}

/** The rigs' shared assets. `ramps` lets a test (no 2D canvas) hand over the textures instead of painting them. */
export function createRigAssets(glow: Texture, ramps?: (name: RampName) => Texture): RigAssets {
  const made = new Map<RampName, Texture>();
  const shapes = new Map<string, ShapeEntry>();
  const own: Texture[] = [];
  return {
    glow,
    ramp(name) {
      let t = made.get(name);
      if (!t) {
        t = ramps ? ramps(name) : paintRamp(name);
        if (!ramps) own.push(t);
        made.set(name, t);
      }
      return t;
    },
    shape(key, make) {
      let e = shapes.get(key);
      if (!e) {
        // `batch`: Pixi would draw a shape of more than a few hundred vertices on its own, a draw call apiece; a creature is dozens of shapes and they all want to travel together
        const ctx = new GraphicsContext();
        ctx.batchMode = 'batch';
        const silhouette: SilhouetteOp[] = [];
        make(ctx, silhouette);
        e = { ctx, silhouette, flash: null };
        shapes.set(key, e);
      }
      return e;
    },
    destroy() {
      for (const e of shapes.values()) {
        e.ctx.destroy();
        e.flash?.destroy();
      }
      shapes.clear();
      for (const t of own) t.destroy(true);
      own.length = 0;
      made.clear();
    },
  };
}
