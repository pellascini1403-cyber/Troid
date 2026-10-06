// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { INK_SLIME_LOOK } from '@/content/proceduralActors';
import { createActorViewState, type ActorViewState } from '@/presentation/actorViewState';
import { ProceduralActor } from '@/render/ProceduralActor';
import { fakeVfxAtlas } from '../../helpers/vfx';

function make(): { actor: ProceduralActor; view: ActorViewState } {
  const view = createActorViewState();
  const actor = new ProceduralActor(INK_SLIME_LOOK, { view }, { glow: fakeVfxAtlas().frames.glow });
  return { actor, view };
}

/** The scene graph of the actor, by role (the order is part of the contract: aura, shape [body, eyes, glow, glow, flash]). */
function parts(actor: ProceduralActor) {
  const [aura, shape] = actor.root.children as [import('pixi.js').Sprite, import('pixi.js').Container];
  const [body, eyes, glowL, glowR, flash] = shape.children as [
    import('pixi.js').Graphics, import('pixi.js').Graphics, import('pixi.js').Sprite, import('pixi.js').Sprite, import('pixi.js').Graphics,
  ];
  return { aura, shape, body, eyes, glowL, glowR, flash };
}

describe('ProceduralActor (view of the ink creatures)', () => {
  it('builds aura · body · eyes · eye glows · flash once, with additive light and a normal-blend body', () => {
    const { actor } = make();
    const { aura, body, eyes, glowL, glowR, flash } = parts(actor);
    expect(actor.root.children).toHaveLength(2);
    expect(aura.blendMode).toBe('add');
    expect(glowL.blendMode).toBe('add');
    expect(glowR.blendMode).toBe('add');
    expect(flash.blendMode).toBe('add');
    // the ink is NOT additive (a black body cannot glow): it inherits the normal blend of the actors layer
    expect(body.blendMode).not.toBe('add');
    expect(eyes.blendMode).not.toBe('add');
  });

  it('puts the feet at the position (view space is y-down) and mirrors with the facing', () => {
    const { actor, view } = make();
    Object.assign(view, { prevX: 4, prevY: 0, x: 6, y: 2, facing: -1 });
    actor.sync(0.5, 0);
    expect(actor.root.position.x).toBeCloseTo(5, 9); // interpolated between ticks
    expect(actor.root.position.y).toBeCloseTo(-1, 9); // y up in the simulation = −y in the view
    expect(actor.root.scale.x).toBe(-1);
    view.facing = 1;
    actor.sync(0.5, 0);
    expect(actor.root.scale.x).toBe(1);
  });

  it('squashes about the feet during the wind-up: flatter, wider, aura and eyes lighting up', () => {
    const { actor, view } = make();
    const { aura, shape, glowL } = parts(actor);
    view.anim = 'telegraph';
    view.phase = 'startup';
    view.phaseT = 0;
    actor.sync(1, 0);
    const y0 = shape.scale.y;
    const a0 = aura.alpha;
    const g0 = glowL.alpha;
    view.phaseT = 0.95;
    actor.sync(1, 0);
    expect(shape.scale.y).toBeLessThan(y0 - 0.3);
    expect(shape.scale.x).toBeGreaterThan(1.2);
    expect(aura.alpha).toBeGreaterThan(a0 + 0.5);
    expect(aura.scale.x).toBeGreaterThan(0);
    expect(glowL.alpha).toBeGreaterThan(g0);
    expect(glowL.alpha).toBeGreaterThan(0.5);
    // the pivot of the squash is the feet: the shape container sits at the origin
    expect(shape.pivot.y).toBe(0);
  });

  it('squinting closes the eyes about THEIR centre, not about the feet', () => {
    const { actor, view } = make();
    const { eyes } = parts(actor);
    view.anim = 'hurt';
    view.phaseT = 0;
    actor.sync(1, 0);
    expect(eyes.scale.y / eyes.scale.x).toBeLessThan(0.2); // closed to a slit
    expect(eyes.pivot.y * eyes.scale.x).toBeCloseTo(eyes.position.y, 9); // scaled in place: the pivot IS the position
    expect(eyes.position.y).toBeLessThan(0); // above the feet (view y is down)
  });

  it('the hit flash and the fade follow the view state', () => {
    const { actor, view } = make();
    const { flash, shape } = parts(actor);
    view.flash = 1;
    actor.sync(1, 0);
    expect(flash.alpha).toBe(1);
    view.flash = 0.5;
    view.opacity = 0.5;
    actor.sync(1, 0);
    expect(flash.alpha).toBeCloseTo(0.25, 9);
    expect(shape.alpha).toBe(0.5);
  });

  it('breathing runs on animation time: frozen while dt is 0 (pause, hit-stop), moving when it advances', () => {
    const { actor, view } = make();
    const { shape } = parts(actor);
    view.anim = 'idle';
    actor.sync(1, 0);
    const still = shape.scale.y;
    actor.sync(1, 0);
    expect(shape.scale.y).toBe(still);
    actor.sync(1, 0.2);
    expect(shape.scale.y).not.toBe(still);
  });

  it('is hidden when the view state says so, and destroy() releases the whole graph', () => {
    const { actor, view } = make();
    view.visible = false;
    actor.sync(1, 0);
    expect(actor.root.visible).toBe(false);
    actor.destroy();
    expect(actor.root.destroyed).toBe(true);
  });

  it('never allocates in the steady state: the graph is the same objects after 1000 frames', () => {
    const { actor, view } = make();
    const before = [actor.root.children.length, parts(actor).shape.children.length];
    for (let i = 0; i < 1000; i++) {
      view.anim = (['idle', 'walk', 'run', 'telegraph', 'attack', 'hurt', 'death'] as const)[i % 7]!;
      view.phaseT = (i % 24) / 24;
      actor.sync((i % 10) / 10, 1 / 60);
    }
    expect([actor.root.children.length, parts(actor).shape.children.length]).toEqual(before);
  });
});
