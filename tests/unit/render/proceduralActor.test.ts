// @vitest-environment happy-dom
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { INK_SLIME_LOOK } from '@/content/proceduralActors';
import { createActorViewState, type ActorViewState } from '@/presentation/actorViewState';
import { ProceduralActor, type CreatureArt, type CreatureArtPart } from '@/render/ProceduralActor';
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

/**
 * The art takes the creature over (docs/PROMPT8-LOG.md, phase G): its parts — the body in boiling frames, the white flash, the eyes, the sigil in its chest, the bristle, the pool — stand where the shapes stood and take the same
 * numbers. The pose is the simulation's state, read the same way: the art changes what the Slime LOOKS like, never what it does.
 */
describe('ProceduralActor: the art takes the creature over', () => {
  const part = (frames = 1): CreatureArtPart => ({ frames: Array.from({ length: frames }, () => new Texture()), mpp: 0.01, pivot: [0.5, 1] });
  const art = (): CreatureArt => ({ body: part(4), flash: part(), eyes: part(), sigil: part(), spines: part(3), pool: part(), eyesAt: [0.27, 0.45], sigilAt: [-0.12, 0.38] });
  const sprites = (c: Container): Sprite[] => c.children.filter((x): x is Sprite => x instanceof Sprite);
  const shapeOf = (a: ProceduralActor): Container => a.root.children.find((c) => c.label === 'shape') as Container;
  const graphics = (a: ProceduralActor): Graphics[] => (shapeOf(a).children as Container[]).filter((c): c is Graphics => c instanceof Graphics);
  /** The sprite that draws a texture, wherever it is in the view. */
  const find = (a: ProceduralActor, t: Texture): Sprite => [...sprites(a.root), ...sprites(shapeOf(a))].find((s) => s.texture === t)!;

  it('with art the shapes are not drawn and the parts stand in their place: the pool under everything, then the body, the bristle, the sigil, the eyes and the flash', () => {
    const { actor } = make();
    const a = art();
    expect(graphics(actor).filter((g) => g.visible)).toHaveLength(3);
    actor.dress(a);
    // the Graphics that are the body, the eyes and the flash are hidden
    expect(graphics(actor).filter((g) => g.visible)).toEqual([]);
    expect(actor.root.children[0]).toBe(find(actor, a.pool.frames[0]!));
    expect(sprites(shapeOf(actor)).map((s) => s.texture).slice(0, 4)).toEqual([a.body.frames[0], a.spines.frames[0], a.sigil.frames[0], a.eyes.frames[0]]);
    expect(find(actor, a.flash.frames[0]!).blendMode).toBe('add');
    expect(find(actor, a.sigil.frames[0]!).blendMode).toBe('add');
    expect(find(actor, a.eyes.frames[0]!).blendMode).toBe('add');
    // the eyes and the sigil stand where the art's body says (metres from the feet; view space is y-down)
    expect(find(actor, a.eyes.frames[0]!).position.x).toBeCloseTo(0.27, 9);
    expect(find(actor, a.eyes.frames[0]!).position.y).toBeCloseTo(-0.45, 9);
    expect(find(actor, a.sigil.frames[0]!).position.x).toBeCloseTo(-0.12, 9);
    expect(find(actor, a.sigil.frames[0]!).position.y).toBeCloseTo(-0.38, 9);
  });

  it('the surface boils: the body changes picture at its own beat, round a loop of the frames it has', () => {
    const { actor } = make();
    const a = art();
    actor.dress(a);
    const body = sprites(shapeOf(actor))[0]!;
    const seen = new Set<Texture>();
    for (let i = 0; i < 60; i++) {
      actor.sync(1, 1 / 30);
      seen.add(body.texture);
    }
    expect([...seen].sort()).toEqual([...a.body.frames].sort());
    // frozen while time is (a hit-stop, a pause)
    const still = body.texture;
    for (let i = 0; i < 10; i++) actor.sync(1, 0);
    expect(body.texture).toBe(still);
  });

  it('the bristle rises with the warning: none while it rests, some as it wakes, all as it is about to strike — and it falls when the blow is spent', () => {
    const { actor, view } = make();
    const a = art();
    actor.dress(a);
    const spines = sprites(shapeOf(actor))[1]!;
    actor.sync(1, 0);
    expect(spines.visible).toBe(false);
    view.anim = 'telegraph';
    view.phase = 'startup';
    view.phaseT = 0.55;
    actor.sync(1, 0);
    expect(spines.visible && spines.texture).toBe(a.spines.frames[1]);
    view.phaseT = 1;
    actor.sync(1, 0);
    expect(spines.visible && spines.texture).toBe(a.spines.frames[2]);
    view.anim = 'idle';
    view.phase = 'recovery';
    view.phaseT = 0.5;
    actor.sync(1, 0);
    expect(spines.visible).toBe(false);
  });

  it('the sigil is an ember while it sleeps and white-hot as it winds up; the eyes close from the top and bottom when it is hurt', () => {
    const { actor, view } = make();
    const a = art();
    actor.dress(a);
    const sigil = find(actor, a.sigil.frames[0]!);
    const eyes = find(actor, a.eyes.frames[0]!);
    actor.sync(1, 0);
    const asleep = sigil.alpha;
    expect(asleep).toBeLessThan(0.45);
    view.anim = 'telegraph';
    view.phase = 'startup';
    view.phaseT = 1;
    actor.sync(1, 0);
    expect(sigil.alpha).toBeGreaterThan(asleep + 0.5);
    expect(sigil.scale.x).toBeGreaterThan(a.sigil.mpp);
    view.anim = 'hurt';
    view.phase = 'none';
    view.phaseT = 0;
    actor.sync(1, 0);
    expect(eyes.scale.y / eyes.scale.x).toBeLessThan(0.2);
  });

  it('a blow flashes the body white; the pool is wider as it squashes and the last of it to go when it falls', () => {
    const { actor, view } = make();
    const a = art();
    actor.dress(a);
    const flash = find(actor, a.flash.frames[0]!);
    const pool = find(actor, a.pool.frames[0]!);
    view.flash = 1;
    actor.sync(1, 0);
    expect(flash.alpha).toBe(1);
    view.flash = 0;
    actor.sync(1, 0);
    expect(flash.alpha).toBe(0);
    const resting = pool.scale.x;
    view.anim = 'telegraph';
    view.phase = 'startup';
    view.phaseT = 1;
    actor.sync(1, 0);
    expect(pool.scale.x).toBeGreaterThan(resting);
    view.anim = 'death';
    view.phase = 'none';
    view.phaseT = 0.7;
    view.opacity = 1 - 0.7 * 0.7;
    actor.sync(1, 0);
    expect(pool.alpha, 'the body is half gone and the pool is not').toBeGreaterThan(view.opacity + 0.2);
  });

  it('is the same creature: dressed or not, every pose number — where it stands, how it squashes, leans and trembles — is the same', () => {
    const states: Array<Partial<ActorViewState>> = [
      { anim: 'idle' },
      { anim: 'walk' },
      { anim: 'run' },
      { anim: 'alert', phaseT: 0.5 },
      { anim: 'telegraph', phase: 'startup', phaseT: 0.7 },
      { anim: 'attack', phase: 'active', phaseT: 0.4 },
      { anim: 'idle', phase: 'recovery', phaseT: 0.3 },
      { anim: 'hurt', phaseT: 0.2 },
      { anim: 'death', phaseT: 0.6, opacity: 0.64 },
    ];
    for (const patch of states) {
      const bare = make();
      const dressed = make();
      dressed.actor.dress(art());
      for (const m of [bare, dressed]) {
        Object.assign(m.view, { prevX: 3, x: 4, y: 0.5, facing: -1 }, patch);
        m.actor.sync(0.5, 0.1);
      }
      const read = (a: ProceduralActor): number[] => {
        const s = shapeOf(a);
        return [a.root.position.x, a.root.position.y, a.root.scale.x, s.scale.x, s.scale.y, s.skew.x, s.position.x, s.alpha];
      };
      expect(read(dressed.actor), JSON.stringify(patch)).toEqual(read(bare.actor));
    }
  });

  it('with no art (or art that was given back) the shapes are the creature again, and the art\'s sprites are gone', () => {
    const { actor } = make();
    const a = art();
    actor.dress(a);
    const before = sprites(shapeOf(actor)).length;
    expect(before).toBeGreaterThan(4);
    actor.dress(null);
    expect(graphics(actor).filter((g) => g.visible)).toHaveLength(3);
    expect(sprites(shapeOf(actor)).length).toBeLessThan(before);
    expect(sprites(actor.root).filter((s) => a.pool.frames.includes(s.texture))).toEqual([]);
  });

  it('the art may be let go of under it at any time: the shapes draw the creature from the next frame', () => {
    const { actor } = make();
    const a = art();
    actor.dress(a);
    a.body.frames[0]!.destroy();
    actor.sync(1, 0);
    expect(graphics(actor).filter((g) => g.visible)).toHaveLength(3);
    expect(sprites(actor.root).filter((s) => a.pool.frames.includes(s.texture))).toEqual([]);
  });
});
