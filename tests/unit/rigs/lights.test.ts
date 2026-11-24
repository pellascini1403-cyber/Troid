// @vitest-environment happy-dom
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { createActorViewState } from '@/presentation/actorViewState';
import { createLights, createRigAssets, liftLights, RIGS, RigActor, seedOf } from '@/rigs';
import { fakeVfxAtlas } from '../../helpers/vfx';

/** A scene the way the game has it: the layer of the actors inside the world. */
function stage(): { world: Container; actors: Container; before: Container; after: Container } {
  const world = new Container();
  const before = new Container({ label: 'before' });
  const actors = new Container({ label: 'actors' });
  const after = new Container({ label: 'after' });
  world.addChild(before, actors, after);
  return { world, actors, before, after };
}

const glow = (): Texture => fakeVfxAtlas().frames.glow;
const ramps = (): Texture => Texture.WHITE;

/** The additive things a creature draws, at the top of what hangs from them — the ones that go to a layer. */
function topLights(root: Container): Container[] {
  const out: Container[] = [];
  const walk = (n: Container): void => {
    for (const c of n.children as Container[]) {
      if (c.blendMode === 'add') out.push(c);
      else walk(c);
    }
  };
  walk(root);
  return out;
}

describe('the light layers of the creatures', () => {
  it('are two layers in the scene, one right before the layer of the actors and one right after it', () => {
    const s = stage();
    const lights = createLights(s);
    const order = s.world.children;
    expect(order.indexOf(lights.back)).toBe(order.indexOf(s.actors) - 1);
    expect(order.indexOf(lights.front)).toBe(order.indexOf(s.actors) + 1);
    // …and what was before and after the actors still is
    expect(order.indexOf(s.before)).toBeLessThan(order.indexOf(lights.back));
    expect(order.indexOf(lights.front)).toBeLessThan(order.indexOf(s.after));
    lights.destroy();
    expect(s.world.children).toEqual([s.before, s.actors, s.after]);
  });

  it('take the additive things of a creature — the ones before its first body behind it, the rest in front — and leave them where they hang', () => {
    const s = stage();
    const lights = createLights(s);
    const root = new Container();
    const shadow = new Sprite(Texture.WHITE);
    const halo = new Sprite(Texture.WHITE);
    halo.blendMode = 'add';
    const body = new Container();
    const torso = new Graphics();
    const eyes = new Sprite(Texture.WHITE);
    eyes.blendMode = 'add';
    const head = new Container();
    const cracks = new Graphics();
    cracks.blendMode = 'add';
    head.addChild(cracks);
    body.addChild(torso, eyes, head);
    root.addChild(shadow, halo, body);
    s.actors.addChild(root);

    const lifted = liftLights(root, lights);
    expect(lifted).toEqual([halo, eyes, cracks]);
    expect(halo.parentRenderLayer).toBe(lights.back);
    expect(eyes.parentRenderLayer).toBe(lights.front);
    expect(cracks.parentRenderLayer).toBe(lights.front);
    // the things that are not light are drawn where they always were
    expect(shadow.parentRenderLayer).toBeNull();
    expect(torso.parentRenderLayer).toBeNull();
    // and everything is still a child of what it hangs from: it moves, hides and fades with its creature
    expect(halo.parent).toBe(root);
    expect(eyes.parent).toBe(body);
    expect(cracks.parent).toBe(head);
    expect(lights.back.renderLayerChildren).toEqual([halo]);
    expect(lights.front.renderLayerChildren).toEqual([eyes, cracks]);
  });

  it('take what is additive whole: what hangs from it goes with it and is not taken again', () => {
    const s = stage();
    const lights = createLights(s);
    const root = new Container();
    const rings = new Container();
    rings.blendMode = 'add';
    const arc = new Graphics();
    arc.blendMode = 'add';
    rings.addChild(arc);
    root.addChild(new Graphics(), rings);
    s.actors.addChild(root);
    expect(liftLights(root, lights)).toEqual([rings]);
    expect(arc.parentRenderLayer).toBeNull();
  });

  it('let go of what a creature drew when it is destroyed', () => {
    const s = stage();
    const assets = createRigAssets(glow(), ramps, s);
    const def = RIGS['magma_toad']!;
    const crowd = Array.from({ length: 5 }, (_, i) => new RigActor(def, { view: createActorViewState() }, assets, (i + 1) / 7));
    for (const a of crowd) s.actors.addChild(a.root);
    const lights = assets.lights!;
    const held = lights.back.renderLayerChildren.length + lights.front.renderLayerChildren.length;
    expect(held).toBeGreaterThan(0);
    // five creatures of one species hold five times what one holds
    expect(held % 5).toBe(0);
    for (const a of crowd) a.destroy();
    expect(lights.back.renderLayerChildren).toHaveLength(0);
    expect(lights.front.renderLayerChildren).toHaveLength(0);
    assets.destroy();
    expect(s.world.children).toEqual([s.before, s.actors, s.after]);
  });

  it('are not there when the assets are made with no scene to put them in (the lab\'s `lights=0`, a test): the light stays where it is built', () => {
    const assets = createRigAssets(glow(), ramps);
    expect(assets.lights).toBeNull();
    const actor = new RigActor(RIGS['cave_bat']!, { view: createActorViewState() }, assets, 0.3);
    for (const l of topLights(actor.root)) expect(l.parentRenderLayer).toBeNull();
    actor.destroy();
  });

  for (const [id, def] of Object.entries(RIGS)) {
    it(`${id}: all its light is in the layers — built, and the white-hot flash of a hit as it is first made`, () => {
      const s = stage();
      const assets = createRigAssets(glow(), ramps, s);
      const view = createActorViewState();
      const actor = new RigActor(def, { view }, assets, seedOf(id));
      s.actors.addChild(actor.root);
      const lights = assets.lights!;
      const layers = new Set<unknown>([lights.back, lights.front]);
      const loose = (): string[] => topLights(actor.root).filter((l) => !layers.has(l.parentRenderLayer)).map((l) => l.label || l.constructor.name);
      expect(loose()).toEqual([]);
      // the first hit builds the flash of every part: it joins the others in front of the creature
      Object.assign(view, { x: 1, y: 0, prevX: 1, prevY: 0, flash: 1, anim: 'hurt', phase: 'none', phaseT: 0.2 });
      actor.sync(1, 1 / 60);
      actor.sync(1, 1 / 60);
      expect(loose()).toEqual([]);
      // what a creature draws in its own layer is one blend mode only: no change of blend between one thing and the next
      const inPlace: string[] = [];
      const walk = (n: Container): void => {
        for (const c of n.children as Container[]) {
          if (c.blendMode === 'add' && !c.parentRenderLayer) inPlace.push(c.label || c.constructor.name);
          walk(c);
        }
      };
      walk(actor.root);
      expect(inPlace).toEqual([]);
      actor.destroy();
      expect(lights.back.renderLayerChildren).toHaveLength(0);
      expect(lights.front.renderLayerChildren).toHaveLength(0);
      assets.destroy();
    });
  }
});
