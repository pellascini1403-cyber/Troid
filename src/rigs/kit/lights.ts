import { RenderLayer, type Container } from 'pixi.js';

/**
 * THE LIGHT OF THE CREATURES, in two layers they all share (docs/PROMPT24-LOG.md, F7).
 *
 * A creature is dark bodies with light on them — halos, the glow of the eyes, the cracks that burn, the rings of a warning — and the light is ADDITIVE. Pixi draws things in the order of the scene and cannot batch across a change of
 * blend mode, so a creature built body · light · body · light · … cost one draw call for every change (a magma toad: twelve), and a dozen of them in view broke the budget of sixty. What a change of blend mode costs, though, is the
 * ORDER things are drawn in, not where they are: a `RenderLayer` takes an object out of the order of its parent and puts it in the order of the layer, while it stays a child of its parent — it moves with it, hides with it, fades with it.
 *
 * So the light of every creature goes to two layers in the scene: `back`, drawn before ALL the creatures (the halo that stands behind a body, never over it: the dark silhouette against its own light), and `front`, drawn after them
 * (the eyes, the cracks, the rings, the white-hot flash of a hit). What is left in the creatures' own layer is all one blend mode and travels in a batch with the next creature's; the light is one batch more per layer. A room's creatures
 * cost a handful of draw calls however many there are.
 */
export interface Lights {
  /** Before every creature. */
  readonly back: RenderLayer;
  /** After every creature. */
  readonly front: RenderLayer;
  /** Takes both layers out of the scene (what is attached to them goes with its creatures). */
  destroy(): void;
}

/** The parts of the scene the layers are put between: `actors` is where the creatures are, and `world` is what `actors` is in. */
export interface LightStage {
  readonly world: Container;
  readonly actors: Container;
}

/** Puts the two layers in the scene, `back` right before the actors' layer and `front` right after it. */
export function createLights(stage: LightStage): Lights {
  const back = new RenderLayer();
  const front = new RenderLayer();
  const at = stage.world.getChildIndex(stage.actors);
  stage.world.addChildAt(back, at);
  stage.world.addChildAt(front, at + 2);
  return {
    back,
    front,
    destroy() {
      back.detachAll();
      front.detachAll();
      back.destroy();
      front.destroy();
    },
  };
}

/** Whether an object is a body — a shape or a mesh, not a sprite (the contact shadow and the halos are sprites): from the first one on, what is additive is in front of the creature and not behind it. */
function isBody(node: Container): boolean {
  const pipe = (node as unknown as { renderPipeId?: string }).renderPipeId;
  return pipe === 'graphics' || pipe === 'mesh';
}

/**
 * Moves the light of a creature that has just been built to the layers, and returns what it moved. Everything additive that comes BEFORE the first body — in the order the creature is drawn in — is behind it (the halo, the glow
 * of the root of a tree); everything after it is in front. What is additive is taken whole, with whatever hangs from it. (Nothing has to be given back: Pixi lets a layer go of an object when its parent removes it, and a
 * `destroy` removes the children first.) A rule that also sent the big soft glows behind was tried and measured against the creatures as they were drawn before the layers: it came out further from them, not nearer.
 */
export function liftLights(root: Container, lights: Lights): Container[] {
  const lifted: Container[] = [];
  let bodySeen = false;
  const walk = (parent: Container): void => {
    for (const child of parent.children as Container[]) {
      if (child.blendMode === 'add') {
        (bodySeen ? lights.front : lights.back).attach(child);
        lifted.push(child);
        continue;
      }
      if (isBody(child)) bodySeen = true;
      walk(child);
    }
  };
  walk(root);
  return lifted;
}

/** The light a part makes when it is first needed — the white-hot flash of a hit is built the first time somebody is hit — goes to the front layer too (with no layers, the lab or a test, it stays where it was added). */
export function liftFlash(lights: Lights | null, overlay: Container): void {
  lights?.front.attach(overlay);
}
