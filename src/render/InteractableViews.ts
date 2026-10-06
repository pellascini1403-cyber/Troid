import { Container, Graphics } from 'pixi.js';
import type { InteractableDef } from '@/interaction/Interactable';
import { PALETTE } from '@/presentation/palette';
import { viewY } from '@/presentation/worldTransform';
import type { Layers } from './layers';

interface Marker {
  readonly def: InteractableDef;
  readonly root: Container;
  /** Seconds offset so two markers do not bob in step. */
  readonly phase: number;
  /** A pickup floats and disappears when taken; everything else stays put and dims when it is spent. */
  readonly floats: boolean;
}

/**
 * What the player sees of the interactables of a room (docs/GAME-SPEC-2D.md §12): a PLACEHOLDER look — abstract energy marks in the
 * hero's cyan / white, like the rest of the blockout — that follows the world's state. A pickup is a small floating card that
 * vanishes when it is taken; a lever (anything else) is a post with a knob that is lit while it can be used and dim once spent.
 * It decides nothing: `isAvailable` is the simulation's answer, read once per frame.
 */
export class InteractableViews {
  private readonly markers = new Map<string, Marker>();
  private time = 0;

  constructor(private readonly layers: Layers) {}

  build(defs: readonly InteractableDef[], isAvailable: (id: string) => boolean): void {
    this.clear();
    defs.forEach((def, i) => {
      const floats = def.kind === 'pickup';
      const root = floats ? drawCard() : drawPost();
      root.position.set(def.x, viewY(def.y + (floats ? 0.85 : 0)));
      root.label = `interactable:${def.id}`;
      (floats ? this.layers.lightOverlay : this.layers.propsBack).addChild(root);
      this.markers.set(def.id, { def, root, phase: i * 1.7, floats });
    });
    this.update(0, isAvailable);
  }

  /** Once per rendered frame, in real seconds: the bob of the floating things and what is still there. */
  update(dt: number, isAvailable: (id: string) => boolean): void {
    this.time += dt;
    for (const m of this.markers.values()) {
      const on = isAvailable(m.def.id);
      if (m.floats) {
        m.root.visible = on;
        m.root.y = viewY(m.def.y + 0.85) + Math.sin(this.time * 2.2 + m.phase) * 0.06;
        m.root.alpha = 0.8 + 0.2 * Math.sin(this.time * 3.1 + m.phase);
      } else {
        m.root.alpha = on ? 1 : 0.35;
      }
    }
  }

  get count(): number {
    return this.markers.size;
  }

  clear(): void {
    for (const m of this.markers.values()) m.root.destroy({ children: true });
    this.markers.clear();
  }
}

/** A floating card: a cyan outline over a faint body with a white spark in the middle, on a soft glow. */
function drawCard(): Container {
  const root = new Container();
  const g = new Graphics();
  g.circle(0, 0, 0.55).fill({ color: PALETTE.energyGlow, alpha: 0.14 });
  g.roundRect(-0.17, -0.25, 0.34, 0.5, 0.05).fill({ color: PALETTE.energyMid, alpha: 0.55 }).stroke({ width: 0.035, color: PALETTE.energyCore, alpha: 0.95 });
  g.poly([0, -0.13, 0.05, -0.02, 0, 0.13, -0.05, -0.02]).fill({ color: PALETTE.whiteHot, alpha: 0.95 });
  root.addChild(g);
  return root;
}

/** A post with a knob: the knob is the lit part, the post stays in the dark. */
function drawPost(): Container {
  const root = new Container();
  const g = new Graphics();
  g.rect(-0.07, -0.9, 0.14, 0.9).fill({ color: PALETTE.worldSlate });
  g.rect(-0.2, -0.06, 0.4, 0.06).fill({ color: PALETTE.worldHaze, alpha: 0.7 });
  g.circle(0, -0.98, 0.15).fill({ color: PALETTE.energyCore }).stroke({ width: 0.03, color: PALETTE.whiteHot, alpha: 0.9 });
  root.addChild(g);
  return root;
}
