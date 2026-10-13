// @vitest-environment happy-dom
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { createActorViewState } from '@/presentation/actorViewState';
import { GuardianView, type GuardianArt, type GuardianArtPart, type GuardianLike } from '@/render/GuardianView';

/**
 * What the player sees of the Ink Warden (docs/PROMPT6-LOG.md S29): an abstract column with a violet crest, posed by what the simulation says it is
 * doing, and the telegraph on the floor — a lane for the charge, discs and rising columns for the rain — in violet. The view decides nothing: it
 * reads the guardian's `view`.
 */
type Marks = Array<{ x: number; w: number; t01: number }>;
/** The guardian's `view` as a test writes it (the simulation owns it for real; here the test is the simulation). */
type Writable<T> = { -readonly [K in keyof T]: T[K] };
interface Fake extends GuardianLike {
  view: Writable<GuardianLike['view']> & { marks: Marks };
}
function fake(patch: Partial<Writable<GuardianLike['view']>> = {}): Fake {
  return { body: { halfW: 0.8, height: 2.9 }, view: { ...createActorViewState(), x: 58, y: 0, prevX: 58, prevY: 0, facing: -1, attack: null, marks: [] as Marks, enraged: false, awake: false, ...patch } } as never;
}
const make = (g: GuardianLike): GuardianView => new GuardianView(g, { glow: Texture.EMPTY });
const floor = (v: GuardianView): Graphics => v.root.children[0] as Graphics;
const actor = (v: GuardianView): Container => v.root.children[1] as Container;
const strokes = (g: Graphics): number => (g as unknown as { context: { instructions: unknown[] } }).context.instructions.length;
const aura = (v: GuardianView): number => (actor(v).children[0] as Container).alpha;

describe('GuardianView: the column', () => {
  it('stands at its feet, mirrored by the way it faces (view space is y-down)', () => {
    const g = fake({ x: 58, y: 0, facing: -1 });
    const v = make(g);
    v.sync(1, 0);
    expect(actor(v).x).toBe(58);
    expect(actor(v).y).toBeCloseTo(0, 9);
    expect(actor(v).scale.x).toBe(-1);
    g.view.facing = 1;
    g.view.y = 2;
    v.sync(1, 0);
    expect(actor(v).scale.x).toBe(1);
    expect(actor(v).y).toBeCloseTo(-2, 9);
  });

  it('interpolates between ticks like every entity', () => {
    const g = fake({ prevX: 50, x: 60 });
    const v = make(g);
    v.sync(0.5, 0);
    expect(actor(v).x).toBeCloseTo(55, 9);
  });

  it('dormant it is dull; awake it is lit, and the second phase burns hotter than the first', () => {
    const sleeping = make(fake());
    sleeping.sync(1, 0);
    const awake = fake({ awake: true });
    const lit = make(awake);
    lit.sync(1, 0);
    expect(aura(lit)).toBeGreaterThan(aura(sleeping) + 0.1);
    awake.view.enraged = true;
    lit.sync(1, 0);
    expect(aura(lit)).toBeGreaterThan(0.4);
  });

  it('winding up a charge it sinks and leans back, then slides stretched and leaning forward; recovering, it slumps', () => {
    const g = fake({ awake: true, anim: 'telegraph', phase: 'startup', phaseT: 1, attack: 'charge' });
    const v = make(g);
    const shape = (): Container => actor(v).children[1] as Container;
    v.sync(1, 0);
    expect(shape().scale.y).toBeLessThan(0.95);
    expect(shape().skew.x).toBeGreaterThan(0); // back (view space: a lean forward is a negative shear)
    g.view.anim = 'attack';
    g.view.phase = 'active';
    g.view.phaseT = 0.5;
    v.sync(1, 0);
    expect(shape().scale.x).toBeGreaterThan(1.1);
    expect(shape().skew.x).toBeLessThan(0);
    g.view.anim = 'idle';
    g.view.phase = 'recovery';
    g.view.attack = null;
    v.sync(1, 0);
    expect(shape().scale.y).toBeLessThan(1);
    expect(shape().skew.x).toBe(-0);
  });

  it('winding up the rain the crest rises (the more, the closer the strike) and comes down as the ink erupts', () => {
    const g = fake({ awake: true, anim: 'telegraph', phase: 'startup', phaseT: 0, attack: 'rain' });
    const v = make(g);
    const crest = (): number => (actor(v).children[4] as Container).y;
    v.sync(1, 0);
    const low = crest();
    g.view.phaseT = 1;
    v.sync(1, 0);
    const high = crest();
    expect(high, 'view space is y-down: higher is smaller').toBeLessThan(low - 0.3);
    g.view.anim = 'attack';
    g.view.phase = 'active';
    g.view.phaseT = 1;
    v.sync(1, 0);
    expect(crest()).toBeGreaterThan(high + 0.3);
  });

  it('a blow flashes it white; death shrinks it, fades it and puts its light out', () => {
    const g = fake({ awake: true, flash: 1 });
    const v = make(g);
    v.sync(1, 0);
    const flash = (actor(v).children[1] as Container).children[3] as Container;
    expect(flash.alpha).toBe(1);
    g.view.flash = 0;
    g.view.anim = 'death';
    g.view.phaseT = 1;
    g.view.opacity = 0;
    v.sync(1, 0);
    expect(flash.alpha).toBe(0);
    expect((actor(v).children[1] as Container).scale.y).toBeLessThan(0.1);
    expect(actor(v).alpha).toBe(0);
    expect(aura(v)).toBe(0);
  });
});

describe('GuardianView: the telegraph on the floor', () => {
  it('draws nothing when it is not winding up', () => {
    const v = make(fake({ awake: true }));
    v.sync(1, 0);
    expect(strokes(floor(v))).toBe(0);
  });

  it('is in world space, additive, and does not move with the column: the marks stay where the strike will land', () => {
    const v = make(fake({ awake: true }));
    expect(floor(v).blendMode).toBe('add');
    expect(v.root.position.x).toBe(0);
    expect(v.root.scale.x).toBe(1);
  });

  it('a rain draws a disc, its ring and the column of ink for each mark — more as it fills', () => {
    const g = fake({ awake: true, attack: 'rain', anim: 'telegraph', phase: 'startup' });
    const v = make(g);
    g.view.marks.push({ x: 40, w: 1.7, t01: 0.1 }, { x: 43.4, w: 1.7, t01: 0.1 }, { x: 46.8, w: 1.7, t01: 0.1 });
    v.sync(1, 0);
    const three = strokes(floor(v));
    expect(three).toBeGreaterThanOrEqual(9);
    g.view.marks.push({ x: 50.2, w: 1.7, t01: 0.1 });
    v.sync(1, 0);
    expect(strokes(floor(v)), 'a fourth mark of the enraged rain').toBeGreaterThan(three);
    const b = floor(v).getLocalBounds();
    expect(b.minX).toBeLessThan(40);
    expect(b.maxX).toBeGreaterThan(50);
  });

  it('a charge draws one long lane with chevrons that point the way it will slide', () => {
    const g = fake({ awake: true, attack: 'charge', anim: 'telegraph', phase: 'startup', facing: -1 });
    const v = make(g);
    g.view.marks.push({ x: 53.9, w: 8.2, t01: 0.5 });
    v.sync(1, 0);
    expect(strokes(floor(v))).toBeGreaterThan(4);
    const b = floor(v).getLocalBounds();
    expect(b.maxX - b.minX).toBeGreaterThan(8);
    expect(b.minX).toBeCloseTo(53.9 - 4.1, 0);
  });

  it('is cleared when the marks are: nothing of an old warning is left on the floor', () => {
    const g = fake({ awake: true, attack: 'rain', marks: [{ x: 40, w: 1.7, t01: 1 }] });
    const v = make(g);
    v.sync(1, 0);
    expect(strokes(floor(v))).toBeGreaterThan(0);
    g.view.marks.length = 0;
    v.sync(1, 0);
    expect(strokes(floor(v))).toBe(0);
  });

  it('is destroyed with all it holds', () => {
    const v = make(fake());
    v.destroy();
    expect(v.root.destroyed).toBe(true);
  });
});

/**
 * The art takes the boss over (docs/PROMPT8-LOG.md, phase F): its parts — body with its flash, eye, crest in three states, shards, pool — stand where the shapes stood and take the same numbers. The pose is the
 * simulation's state, read the same way: the art changes what the Warden LOOKS like, never what it does.
 */
describe('GuardianView: the art takes the boss over', () => {
  const part = (frames = 1): GuardianArtPart => ({ frames: Array.from({ length: frames }, () => new Texture()), mpp: 0.01, pivot: [0.5, 1] });
  const art = (): GuardianArt => ({ body: part(2), eye: part(), crest: part(3), shard: part(), pool: part() });
  const sprites = (c: Container): Sprite[] => c.children.filter((x): x is Sprite => x instanceof Sprite);
  const shape = (v: GuardianView): Container => actor(v).children.find((c) => c.label === 'guardian-shape') as Container;
  const crest = (v: GuardianView): Container => actor(v).children.find((c) => c.label === 'guardian-crest') as Container;
  const shapes = (v: GuardianView): Graphics[] => [...(shape(v).children as Container[]), ...(crest(v).children as Container[]), ...(actor(v).children as Container[])].filter((c): c is Graphics => c instanceof Graphics);

  it('with art the shapes are not drawn and the parts stand in their place: the pool under everything, the body and its flash, the eye, the crest, a shard at each side', () => {
    const a = art();
    const v = make(fake({ awake: true }));
    const before = shapes(v).filter((g) => g.visible).length;
    expect(before).toBeGreaterThan(5);
    v.dress(a);
    // the Graphics that are the boss's body, eye, shards, crest and flash are hidden; the marks on the floor are not a shape of the body, and are drawn as ever
    expect(shapes(v).filter((g) => g.visible)).toEqual([]);
    expect(floor(v).visible).toBe(true);
    expect(sprites(actor(v))[0]!.texture).toBe(a.pool.frames[0]);
    expect(sprites(shape(v)).map((s) => s.texture)).toEqual(expect.arrayContaining([a.body.frames[0], a.body.frames[1], a.eye.frames[0]]));
    expect(sprites(shape(v)).find((s) => s.texture === a.body.frames[1])!.blendMode).toBe('add');
    expect(sprites(crest(v)).some((s) => a.crest.frames.includes(s.texture))).toBe(true);
    expect(sprites(actor(v)).filter((s) => s.texture === a.shard.frames[0])).toHaveLength(2);
  });

  it('the crest shows the state of the boss: dim while it sleeps, awake, enraged in the second phase', () => {
    const a = art();
    const g = fake();
    const v = make(g);
    v.dress(a);
    const shown = (): Texture => sprites(crest(v)).find((s) => a.crest.frames.includes(s.texture))!.texture;
    v.sync(1, 0);
    expect(shown()).toBe(a.crest.frames[0]);
    g.view.awake = true;
    v.sync(1, 0);
    expect(shown()).toBe(a.crest.frames[1]);
    g.view.enraged = true;
    v.sync(1, 0);
    expect(shown()).toBe(a.crest.frames[2]);
  });

  it('a blow flashes the body white (the second frame of the body, added); the eye burns with what the boss is doing', () => {
    const a = art();
    const g = fake({ awake: true, flash: 1 });
    const v = make(g);
    v.dress(a);
    v.sync(1, 0);
    const flash = sprites(shape(v)).find((s) => s.texture === a.body.frames[1])!;
    const eye = sprites(shape(v)).find((s) => s.texture === a.eye.frames[0])!;
    expect(flash.alpha).toBe(1);
    expect(eye.alpha).toBeGreaterThan(0.8);
    g.view.flash = 0;
    g.view.awake = false;
    v.sync(1, 0);
    expect(flash.alpha).toBe(0);
    expect(eye.alpha, 'asleep, the eye is nearly out').toBeLessThan(0.2);
  });

  it('lies in its pool while it sleeps, and melts into a wider one when it falls', () => {
    const a = art();
    const g = fake();
    const v = make(g);
    v.dress(a);
    const pool = sprites(actor(v))[0]!;
    v.sync(1, 0);
    const asleep = { alpha: pool.alpha, width: pool.scale.x };
    g.view.awake = true;
    v.sync(1, 0);
    expect(pool.alpha, 'thinner while it fights').toBeLessThan(asleep.alpha);
    g.view.anim = 'death';
    g.view.phaseT = 1;
    v.sync(1, 0);
    expect(pool.alpha).toBeGreaterThan(0.95);
    expect(pool.scale.x).toBeGreaterThan(asleep.width * 1.5);
  });

  it('is the same boss: dressed or not, every pose number — where it stands, how it sinks, leans, rises and shakes — is the same', () => {
    const states: Array<Partial<Writable<GuardianLike['view']>>> = [
      { awake: true },
      { awake: true, enraged: true },
      { awake: true, anim: 'alert', phaseT: 0.5 },
      { awake: true, anim: 'telegraph', phase: 'startup', phaseT: 0.7, attack: 'charge' },
      { awake: true, anim: 'telegraph', phase: 'startup', phaseT: 0.7, attack: 'rain' },
      { awake: true, anim: 'attack', phase: 'active', phaseT: 0.4, attack: 'rain' },
      { awake: true, anim: 'hurt', phaseT: 0.3 },
      { awake: true, anim: 'death', phaseT: 0.6, opacity: 0.7 },
    ];
    for (const patch of states) {
      const bare = make(fake(patch));
      const painted = make(fake(patch));
      painted.dress(art());
      bare.sync(1, 0.1);
      painted.sync(1, 0.1);
      for (const [a, b] of [[actor(bare), actor(painted)], [shape(bare), shape(painted)], [crest(bare), crest(painted)]] as const) {
        expect([a.x, a.y, a.scale.x, a.scale.y, a.skew.x, a.rotation, a.alpha]).toEqual([b.x, b.y, b.scale.x, b.scale.y, b.skew.x, b.rotation, b.alpha]);
      }
    }
  });

  it('with no art (or art that was given back) the shapes are the boss again, and the art\'s sprites are gone', () => {
    const v = make(fake({ awake: true }));
    const count = actor(v).children.length + shape(v).children.length + crest(v).children.length;
    v.dress(art());
    expect(actor(v).children.length + shape(v).children.length + crest(v).children.length).toBeGreaterThan(count);
    v.dress(null);
    expect(shapes(v).every((g) => g.visible)).toBe(true);
    expect(actor(v).children.length + shape(v).children.length + crest(v).children.length).toBe(count);
  });

  it('the art may be let go of under it at any time: the shapes draw the boss from the next frame', () => {
    const a = art();
    const v = make(fake({ awake: true }));
    v.dress(a);
    a.body.frames[0]!.destroy();
    v.sync(1, 0);
    expect(shapes(v).every((g) => g.visible)).toBe(true);
    expect(sprites(actor(v)).filter((s) => a.shard.frames.includes(s.texture))).toHaveLength(0);
  });
});
