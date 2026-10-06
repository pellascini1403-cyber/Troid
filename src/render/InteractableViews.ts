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
  /** A shrine: the crystal that is bright while the hero's checkpoint is here and dim while it is elsewhere. */
  readonly crystal?: Container;
}

/**
 * What the player sees of the interactables of a room (docs/GAME-SPEC-2D.md §12): a PLACEHOLDER look — abstract energy marks in the
 * hero's cyan / white, like the rest of the blockout — that follows the world's state. A pickup is a small floating card (or, when
 * what it gives is a bottle, a vial) that vanishes when it is taken; a shrine (where the hero rests) is a stone pillar with a crystal that glows while it is their checkpoint;
 * a lever (anything else) is a post with a knob that is lit while it can be used and dim once spent.
 * It decides nothing: `isAvailable` and `isLit` are the simulation's answers, read once per frame.
 */
export class InteractableViews {
  private readonly markers = new Map<string, Marker>();
  private time = 0;

  constructor(private readonly layers: Layers) {}

  build(defs: readonly InteractableDef[], isAvailable: (id: string) => boolean, isLit: (id: string) => boolean = () => false): void {
    this.clear();
    defs.forEach((def, i) => {
      const floats = def.kind === 'pickup';
      const shrine = def.kind === 'rest' ? drawShrine() : null;
      // what the pickup IS decides what floats there: a bottle slot is a vial (the one the HUD shows), an ability a rune (the double chevron of the
      // dash), anything else a card
      const gives = def.actions.some((a) => a.type === 'addBottleSlot') ? drawVial : def.actions.some((a) => a.type === 'unlockAbility') ? drawRune : drawCard;
      const root = shrine ? shrine.root : floats ? gives() : drawPost();
      root.position.set(def.x, viewY(def.y + (floats ? 0.85 : 0)));
      root.label = `interactable:${def.id}`;
      (floats ? this.layers.lightOverlay : this.layers.propsBack).addChild(root);
      this.markers.set(def.id, { def, root, phase: i * 1.7, floats, ...(shrine ? { crystal: shrine.crystal } : {}) });
    });
    this.update(0, isAvailable, isLit);
  }

  /** Once per rendered frame, in real seconds: the bob of the floating things, what is still there and which shrine is the checkpoint. */
  update(dt: number, isAvailable: (id: string) => boolean, isLit: (id: string) => boolean = () => false): void {
    this.time += dt;
    for (const m of this.markers.values()) {
      const on = isAvailable(m.def.id);
      if (m.crystal) {
        m.crystal.alpha = isLit(m.def.id) ? 0.85 + 0.15 * Math.sin(this.time * 2.4 + m.phase) : 0.3;
        continue;
      }
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
  const glow = new Graphics().circle(0, 0, 0.55).fill({ color: PALETTE.energyGlow, alpha: 0.14 });
  const body = new Graphics();
  body.roundRect(-0.17, -0.25, 0.34, 0.5, 0.05).fill({ color: PALETTE.energyMid, alpha: 0.55 }).stroke({ width: 0.035, color: PALETTE.energyCore, alpha: 0.95 });
  body.poly([0, -0.13, 0.05, -0.02, 0, 0.13, -0.05, -0.02]).fill({ color: PALETTE.whiteHot, alpha: 0.95 });
  root.addChild(glow, body);
  return root;
}

/** A floating vial, the bottle of the HUD: a cyan outline over a faint glass, its liquid lit and a white cork, on a soft glow. */
function drawVial(): Container {
  const root = new Container();
  const glow = new Graphics().circle(0, 0, 0.55).fill({ color: PALETTE.energyGlow, alpha: 0.14 });
  const body = new Graphics();
  // the glass: a neck, shoulders and a round body, 0.4 m wide and 0.62 m tall
  body
    .poly([-0.06, -0.27, 0.06, -0.27, 0.06, -0.15, 0.2, 0, 0.2, 0.17, 0.14, 0.29, -0.14, 0.29, -0.2, 0.17, -0.2, 0, -0.06, -0.15])
    .fill({ color: PALETTE.energyMid, alpha: 0.35 })
    .stroke({ width: 0.035, color: PALETTE.energyCore, alpha: 0.95 });
  body.poly([-0.17, 0.03, 0.17, 0.03, 0.17, 0.17, 0.12, 0.26, -0.12, 0.26, -0.17, 0.17]).fill({ color: PALETTE.energyCore, alpha: 0.85 });
  body.rect(-0.075, -0.33, 0.15, 0.06).fill({ color: PALETTE.whiteHot, alpha: 0.95 });
  root.addChild(glow, body);
  return root;
}

/** A floating rune, the sign of an ability: a diamond of light with two chevrons in it, like the dash it teaches, on a soft glow. */
function drawRune(): Container {
  const root = new Container();
  const glow = new Graphics().circle(0, 0, 0.6).fill({ color: PALETTE.energyGlow, alpha: 0.16 });
  const body = new Graphics();
  body.poly([0, -0.42, 0.34, 0, 0, 0.42, -0.34, 0]).fill({ color: PALETTE.energyMid, alpha: 0.4 }).stroke({ width: 0.04, color: PALETTE.energyCore, alpha: 0.95 });
  for (const dx of [-0.1, 0.08]) body.poly([dx - 0.1, -0.16, dx + 0.07, 0, dx - 0.1, 0.16]).stroke({ width: 0.05, color: PALETTE.whiteHot, alpha: 0.95 });
  root.addChild(glow, body);
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

/** A shrine: a dark stone pillar on a step with a cyan crystal over it. The crystal is its own container so it can glow or dim. */
function drawShrine(): { root: Container; crystal: Container } {
  const root = new Container();
  const stone = new Graphics();
  stone.rect(-0.38, -0.12, 0.76, 0.12).fill({ color: PALETTE.worldSlate });
  stone.rect(-0.2, -1.05, 0.4, 0.95).fill({ color: PALETTE.worldSlate });
  stone.rect(-0.2, -1.05, 0.4, 0.05).fill({ color: PALETTE.worldHaze, alpha: 0.7 });
  const crystal = new Container();
  const light = new Graphics();
  light.circle(0, -1.5, 0.8).fill({ color: PALETTE.energyGlow, alpha: 0.16 });
  light.poly([0, -1.85, 0.16, -1.5, 0, -1.15, -0.16, -1.5]).fill({ color: PALETTE.energyCore }).stroke({ width: 0.03, color: PALETTE.whiteHot, alpha: 0.9 });
  crystal.addChild(light);
  root.addChild(stone, crystal);
  return { root, crystal };
}
