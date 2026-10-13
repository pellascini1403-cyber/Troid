// @vitest-environment happy-dom
import { Container, Rectangle, Sprite, Texture, TextureSource } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { createVfxAtlas, PROCEDURAL_SHAPES } from '@/assets/vfxAtlas';
import { createArtVfxAtlas, type VfxArtLibrary } from '@/assets/vfxArtAtlas';
import { AMBIENT, VFX, VFX_BINDINGS } from '@/content/vfx';
import { EventBus } from '@/core/events';
import { Rng } from '@/core/rng';
import type { GameEvents } from '@/gameplay/events';
import { PALETTE } from '@/presentation/palette';
import {
  createParticleMotion, initParticle, paintedArcPose,
  type ArcPose, type ArcVfx, type FlipbookVfx, type ParticleVfx, type VfxDefinition,
} from '@/presentation/vfx';
import { VFX_SEQUENCE_NAMES, VFX_SHAPE_NAMES, type VfxSequenceName } from '@/presentation/vfxArt';
import { AMBIENT_CONTRACT, ambientIssues, checkVfxContract } from '@/presentation/vfxContract';
import { ProjectileView } from '@/render/ProjectileView';
import { VfxDirector } from '@/vfx/VfxDirector';
import { VfxSystem } from '@/vfx/VfxSystem';
import { fakeVfxAtlas } from '../../helpers/vfx';

/**
 * THE LIGHT THE ART PAINTED (docs/PROMPT8-LOG.md, phase H; docs/ART-PIPELINE-2D.md §M.14): the effects are drawn from an atlas that is the game's own with the art's shapes and sequences on top; some effects play a
 * SEQUENCE the art painted (and are simply not played when it has none); some light stands BEHIND the actors; the cut of the sword is the art's when it has both of its sequences; the bolt in flight is the art's;
 * and the hero's own light is a mote the director lets go as often as their magic is high. Everything here runs in Node, with textures that hold no pixels.
 */
const at = { x: 0, y: 1, facing: 1 as const };
function stage(sequences: readonly VfxSequenceName[] | 'all' = 'all', options: Partial<ConstructorParameters<typeof VfxSystem>[3]> = {}, defs: Readonly<Record<string, VfxDefinition>> = VFX, withBack = true) {
  const layers = { add: new Container(), normal: new Container(), back: withBack ? new Container() : undefined };
  const atlas = fakeVfxAtlas(sequences, 6);
  const system = new VfxSystem(layers.back ? { add: layers.add, normal: layers.normal, back: layers.back } : { add: layers.add, normal: layers.normal }, atlas, defs, { particleBudget: 300, spriteBudget: 40, seed: 11, ...options });
  return { system, layers, atlas };
}
const live = (c: Container): Sprite[] => (c.children as Sprite[]).filter((s) => s.visible && 'texture' in s && !('particleChildren' in s));

describe('the game draws every shape itself, and the art may paint the same ten', () => {
  it('the shapes of the atlas, the shapes the art names and the shapes the effects use are one list', () => {
    expect([...PROCEDURAL_SHAPES].sort()).toEqual([...VFX_SHAPE_NAMES].sort());
    const used = new Set<string>();
    for (const d of Object.values(VFX)) if (d.kind === 'particles' || d.kind === 'flash') used.add(d.shape);
    for (const s of used) expect(VFX_SHAPE_NAMES as readonly string[], s).toContain(s);
  });

  it('every sequence the art paints is played by an effect — or by the view of the bolt, which draws the two of its own', () => {
    const played = new Set<string>();
    for (const d of Object.values(VFX)) {
      if (d.kind === 'flipbook') played.add(d.sequence);
      if (d.kind === 'arc' && d.sequences) {
        played.add(d.sequences.core);
        played.add(d.sequences.hot);
      }
    }
    for (const name of ['bolt_body', 'bolt_core']) played.add(name); // `render/ProjectileView`
    expect([...played].sort()).toEqual([...VFX_SEQUENCE_NAMES].sort());
  });
});

describe('the atlas the art makes (assets/vfxArtAtlas)', () => {
  /** A library whose `vfx` packs hold the sets asked for. A set is named `shape_<name>` or `seq_<name>`; `onePage: false` puts the shapes on two pages. */
  function library(opts: { shapes?: readonly string[]; sequences?: readonly string[]; onePage?: boolean; hole?: string; frames?: number } = {}) {
    const shapes = opts.shapes ?? VFX_SHAPE_NAMES;
    const sequences = opts.sequences ?? VFX_SEQUENCE_NAMES;
    const frames = opts.frames ?? 4;
    const pageA = new TextureSource({ width: 512, height: 512 });
    const pageB = new TextureSource({ width: 512, height: 512 });
    const sprites = [
      ...shapes.map((n) => ({ id: `shape_${n}`, tags: ['vfx:shape', `shape:${n}`] })),
      ...sequences.map((n) => ({ id: `seq_${n}`, tags: ['vfx:seq', `seq:${n}`] })),
    ];
    const taken: string[] = [];
    const released: string[] = [];
    const lib: VfxArtLibrary = {
      heldPacks: () => [{ pack: { id: 'vfx-test', sprites } }] as never,
      acquireLoaded: (_pack, id) => {
        taken.push(id);
        const isShape = id.startsWith('shape_');
        const n = isShape ? 1 : frames;
        const textures = new Map<string, Texture>();
        for (let i = 0; i < n; i++) {
          if (id === opts.hole && i === 1) continue;
          const source = isShape && opts.onePage === false && id.endsWith('rune') ? pageB : pageA;
          textures.set(`${id}_${String(i).padStart(2, '0')}`, new Texture({ source, frame: new Rectangle(i * 4, 0, isShape ? 40 : 96, isShape ? 40 : 48), orig: new Rectangle(0, 0, isShape ? 40 : 96, isShape ? 40 : 48) }));
        }
        return { def: { id: `vfx-test/${id}`, clips: { idle: { frames: `${id}_`, count: n } }, pivot: [0.25, 0.75] }, textures } as never;
      },
      release: (def) => void released.push(def.id),
    };
    return { lib, taken, released };
  }

  it('is nothing at all when the art painted none of it: the game keeps its own atlas', () => {
    const base = createFakeBase();
    const { lib, released } = library({ shapes: [], sequences: [] });
    expect(createArtVfxAtlas(lib, base)).toBeNull();
    expect(released).toEqual([]);
  });

  it('takes the art\'s shapes when it has all ten on one page, and the sequences it has', () => {
    const base = createFakeBase();
    const { lib } = library();
    const made = createArtVfxAtlas(lib, base)!;
    expect(made.shapes).toBe(true);
    expect(made.atlas.origin).toBe('art');
    expect(made.sequences.slice().sort()).toEqual([...VFX_SEQUENCE_NAMES].sort());
    for (const n of VFX_SHAPE_NAMES) {
      expect(made.atlas.frames[n]).not.toBe(base.frames[n]);
      // the effects scale a picture by its ORIGINAL width (the packer trims the clear border of a frame and says where it was)
      expect(made.atlas.widthPx[n]).toBe(40);
      expect(made.atlas.heightPx[n]).toBe(40);
    }
    expect(made.atlas.source.source).toBe(made.atlas.frames.glow.source);
    const slash = made.atlas.sequences.slash_body!;
    expect(slash.frames).toHaveLength(4);
    expect([slash.width, slash.height]).toEqual([96, 48]);
    expect(slash.pivot).toEqual([0.25, 0.75]);
  });

  it('keeps the game\'s own shapes when the art lacks one, or has them on two pages — and still takes its sequences', () => {
    for (const opts of [{ shapes: VFX_SHAPE_NAMES.filter((n) => n !== 'chevron') }, { onePage: false }]) {
      const base = createFakeBase();
      const made = createArtVfxAtlas(library(opts).lib, base)!;
      expect(made.shapes).toBe(false);
      expect(made.atlas.origin).toBe('procedural');
      for (const n of VFX_SHAPE_NAMES) expect(made.atlas.frames[n]).toBe(base.frames[n]);
      expect(made.atlas.source).toBe(base.source);
      expect(made.sequences).toHaveLength(VFX_SEQUENCE_NAMES.length);
    }
  });

  it('skips a sequence with a frame missing (a picture with a hole in it is not played), and the others are not affected', () => {
    const made = createArtVfxAtlas(library({ hole: 'seq_impact' }).lib, createFakeBase())!;
    expect(made.atlas.sequences.impact).toBeUndefined();
    expect(made.sequences).not.toContain('impact');
    expect(made.atlas.sequences.slash_body).toBeDefined();
  });

  it('gives every set it took back to the library, once', () => {
    const { lib, taken, released } = library();
    const made = createArtVfxAtlas(lib, createFakeBase())!;
    expect(taken.length).toBe(VFX_SHAPE_NAMES.length + VFX_SEQUENCE_NAMES.length);
    made.dispose();
    expect(released.length).toBe(taken.length);
    made.atlas.destroy();
    made.dispose();
    expect(released.length).toBe(taken.length);
  });

  it('the first set that claims a name keeps it: a second pack that paints the same shape is not taken', () => {
    const { lib, taken } = library();
    const twice: VfxArtLibrary = { ...lib, heldPacks: () => [...lib.heldPacks('vfx'), ...lib.heldPacks('vfx')] };
    createArtVfxAtlas(twice, createFakeBase());
    expect(taken.length).toBe(VFX_SHAPE_NAMES.length + VFX_SEQUENCE_NAMES.length);
  });

  function createFakeBase() {
    return fakeVfxAtlas();
  }
});

describe('the game\'s own atlas can be built, with its ten shapes', () => {
  it('createVfxAtlas is a function of the page (it needs a canvas): the E2E draws it; here it is the list that is checked', () => {
    expect(typeof createVfxAtlas).toBe('function');
    expect(PROCEDURAL_SHAPES).toContain('rune');
    expect(PROCEDURAL_SHAPES).toContain('chevron');
  });
});

describe('a sequence is played over the life of the effect', () => {
  const bookId = 'impact_burst';

  it('shows each picture in its turn and holds the last one to the end; then it is gone', () => {
    const { system, layers, atlas } = stage();
    const frames = atlas.sequences.impact!.frames;
    expect(system.spawn(bookId, at)).toBe(true);
    const sprite = live(layers.add)[0]!;
    expect(sprite.texture).toBe(frames[0]);
    const life = (VFX[bookId] as FlipbookVfx).life;
    system.update(life * 0.5);
    expect(sprite.texture).toBe(frames[3]);
    system.update(life * 0.45);
    expect(sprite.texture).toBe(frames[5]);
    system.update(life * 0.2);
    expect(system.stats.sprites).toBe(0);
    expect(live(layers.add)).toHaveLength(0);
  });

  it('is sized by the width of its whole picture, on the art\'s own pivot, tinted by its palette slot', () => {
    const { system, layers, atlas } = stage();
    system.spawn(bookId, at);
    const sprite = live(layers.add)[0]!;
    const seq = atlas.sequences.impact!;
    const def = VFX[bookId] as FlipbookVfx;
    expect(sprite.anchor.x).toBe(seq.pivot[0]);
    expect(sprite.anchor.y).toBe(seq.pivot[1]);
    expect(Math.abs(sprite.scale.x) * seq.width).toBeCloseTo(def.size[0], 6);
    expect(Math.abs(sprite.scale.y) * seq.height).toBeCloseTo(def.size[0] * (seq.height / seq.width), 6);
    expect(sprite.tint).toBe(PALETTE.whiteHot);
  });

  it('is NOT played when the art has no such sequence — and that is not the budget dropping it', () => {
    const { system } = stage([]);
    expect(system.spawn(bookId, at)).toBe(false);
    expect(system.stats).toMatchObject({ unplayed: 1, dropped: 0, spawned: 0, sprites: 0 });
    // the effects bound beside it are what is seen: the trigger is whole without it
    for (const id of VFX_BINDINGS.hitLanded) if (id !== bookId) expect(system.spawn(id, at)).toBe(true);
    expect(system.stats.unplayed).toBe(1);
  });

  it('turns along the way a blow went, mirrored by the facing', () => {
    const { system, layers } = stage();
    system.spawn(bookId, { ...at, facing: -1, dirX: -1, dirY: 0.5 });
    const sprite = live(layers.add)[0]!;
    expect(sprite.scale.x).toBeLessThan(0);
    // pointing up-left: clockwise in the view's convention (the picture points to −x once mirrored)
    expect(sprite.rotation).toBeGreaterThan(0);
    system.clear();
    system.spawn(bookId, { ...at, dirX: 1, dirY: 0.5 });
    const right = live(layers.add)[0]!;
    expect(right.scale.x).toBeGreaterThan(0);
    expect(right.rotation).toBeLessThan(0);
  });

  it('puts ink in the layer of the normal blend (it is dark: it cannot be added) and the light behind the actors in the layer behind them', () => {
    const { system, layers } = stage();
    system.spawn('death_splash', at);
    expect(live(layers.normal)).toHaveLength(1);
    expect(live(layers.add)).toHaveLength(0);
    system.spawn('checkpoint_pillar', at);
    expect(live(layers.back!)).toHaveLength(1);
    expect(live(layers.add)).toHaveLength(0);
    system.spawn('checkpoint_rune', at); // a flash can stand behind too
    expect(live(layers.back!)).toHaveLength(2);
    expect(live(layers.back!)[0]!.blendMode).toBe('add');
  });

  it('with no layer behind, what is meant for it is drawn in front (a lab, a test)', () => {
    const { system, layers } = stage('all', {}, VFX, false);
    system.spawn('checkpoint_pillar', at);
    expect(live(layers.add)).toHaveLength(1);
  });

  it('the budget counts them all together: the three places share the sprite budget, and the pools stop growing', () => {
    const { system } = stage('all', { spriteBudget: 8 });
    for (let i = 0; i < 40; i++) {
      system.spawn('death_splash', at);
      system.spawn('checkpoint_pillar', at);
      system.spawn('impact_burst', at);
      system.update(1 / 60);
      expect(system.stats.sprites).toBeLessThanOrEqual(8);
    }
    const created = system.stats.poolCreated;
    for (let i = 0; i < 80; i++) {
      system.spawn('death_splash', at);
      system.spawn('checkpoint_pillar', at);
      system.update(1 / 30);
    }
    expect(system.stats.poolCreated).toBeLessThanOrEqual(created + 2);
  });
});

describe('the cut of the sword, as the art paints it', () => {
  const arc = VFX['slash_arc'] as ArcVfx;
  const rect = { x0: 10.2, y0: 0.3, x1: 11.6, y1: 1.4 };
  const slash = (variant: string) => ({ x: 10, y: 0.8, facing: 1 as const, rect, variant });

  it('is the art\'s when it has both of its sequences: three layers, the body twice (a halo) and the edge, all of the art\'s frames', () => {
    const { system, layers, atlas } = stage();
    expect(system.spawn('slash_arc', slash('slash_1'))).toBe(true);
    const sprites = live(layers.add);
    expect(sprites).toHaveLength(3);
    expect(sprites.map((s) => s.texture)).toEqual([atlas.sequences.slash_body!.frames[0], atlas.sequences.slash_body!.frames[0], atlas.sequences.slash_edge!.frames[0]]);
  });

  it('the edge lies ON the body (the crescent\'s inner line is smaller; the painted one is not), and the whole is bigger than the crescent\'s box by the art\'s factor', () => {
    const { system, layers } = stage();
    system.spawn('slash_arc', slash('slash_1'));
    const [halo, body, edge] = live(layers.add);
    expect(edge!.scale.x).toBeCloseTo(body!.scale.x, 9);
    expect(halo!.scale.x).toBeGreaterThan(body!.scale.x);
    const pose = paintedArcPose(arc, slash('slash_1'), { x: 0, y: 0, width: 0, height: 0, rotation0: 0, rotation1: 0, flip: 1, flipY: 1 });
    const k = arc.sequences!.scale!;
    expect(pose.width).toBeCloseTo(1.4 * arc.variants['slash_1']!.width * k[0], 9);
    expect(pose.height).toBeCloseTo(1.1 * arc.variants['slash_1']!.height * k[1], 9);
  });

  it('does not turn over its life (it sweeps by itself): the tilt is held, and the cut that RISES is turned upside down', () => {
    const pose = (variant: string): ArcPose => paintedArcPose(arc, slash(variant), { x: 0, y: 0, width: 0, height: 0, rotation0: 0, rotation1: 0, flip: 1, flipY: 1 });
    expect(pose('slash_1').rotation0).toBe(pose('slash_1').rotation1);
    expect(pose('slash_1').flipY).toBe(1);
    expect(pose('slash_2').flipY).toBe(-1); // the finisher rises
    expect(pose('air_slash').flipY).toBe(1);
    expect(pose('crouch_slash').flipY).toBe(1);
    const { system, layers } = stage();
    system.spawn('slash_arc_finisher', { ...slash('slash_2'), x: 10 });
    expect(live(layers.add)[0]!.scale.y).toBeLessThan(0);
  });

  it('is the crescent when the art lacks either sequence (all or none: the cut is never half-painted)', () => {
    for (const present of [[], ['slash_body'], ['slash_edge']] as const) {
      const { system, layers, atlas } = stage(present);
      system.spawn('slash_arc', slash('slash_1'));
      expect(live(layers.add).every((s) => s.texture === atlas.frames.arc), present.join()).toBe(true);
      expect(live(layers.add)).toHaveLength(3);
    }
  });
});

describe('light that gathers: particles that fly INTO the point of the effect', () => {
  const gather: ParticleVfx = {
    kind: 'particles', id: 'gather', priority: 1, palette: 'energy', blend: 'add', shape: 'spark', count: [6, 6], speed: [4, 4], life: [0.2, 0.2], aim: 'any', spread: Math.PI * 2,
    size: [0.1, 0.1], sizeEnd: 1, gravity: 0, drag: 0, alpha: [1, 0], colors: ['core'], radius: 0.8, inward: true,
  };

  it('every one is born away from the point and moves toward it, at its speed', () => {
    const rng = new Rng(3);
    let far = 0;
    for (let i = 0; i < 40; i++) {
      const m = initParticle(gather, { x: 5, y: 2, facing: 1 }, rng, false, createParticleMotion());
      const dx = 5 - m.x;
      const dy = 2 - m.y;
      const d = Math.hypot(dx, dy);
      if (d < 1e-6) continue;
      far++;
      expect(Math.hypot(m.vx, m.vy)).toBeCloseTo(4, 6);
      // the velocity points at the point (cosine of the angle between the way to it and the way it goes is 1)
      expect((m.vx * dx + m.vy * dy) / (4 * d)).toBeCloseTo(1, 6);
    }
    expect(far).toBeGreaterThan(30);
  });

  it('without `inward` the same burst flies OUT (nothing of what already ships changed)', () => {
    const rng = new Rng(3);
    const out = { ...gather, inward: false };
    let inward = 0;
    for (let i = 0; i < 60; i++) {
      const m = initParticle(out, { x: 5, y: 2, facing: 1 }, rng, false, createParticleMotion());
      if ((m.vx * (5 - m.x) + m.vy * (2 - m.y)) > 0.0001) inward++;
    }
    expect(inward).toBeLessThan(40);
  });

  it('the charge of the bolt is such a burst, and its life is about the time it takes them to arrive', () => {
    const motes = VFX['bolt_charge_motes'] as ParticleVfx;
    expect(motes.inward).toBe(true);
    const arrives = ((motes.radius ?? 0) / motes.speed[1]);
    expect(motes.life[0]).toBeGreaterThanOrEqual(arrives * 0.8);
    expect(motes.life[1]).toBeLessThanOrEqual(arrives * 1.6);
  });
});

describe('the bolt in flight, as the art paints it', () => {
  const bolt = (): { x: number; y: number; prevX: number; prevY: number; facing: 1 | -1 } => ({ x: 6, y: 1.2, prevX: 5, prevY: 1.2, facing: 1 });

  it('is a bloom under the art\'s body (cyan) and heart (white-hot), over a soft core: all additive', () => {
    const v = new ProjectileView(bolt(), fakeVfxAtlas(['bolt_body', 'bolt_core'], 4));
    const [bloom, body, heart, core] = v.root.children as Sprite[];
    expect(v.root.children).toHaveLength(4);
    expect([bloom, body, heart, core].every((s) => s!.blendMode === 'add')).toBe(true);
    expect(body!.tint).toBe(PALETTE.energyCore);
    expect(heart!.tint).toBe(PALETTE.whiteHot);
    expect(body!.anchor.x).toBeCloseTo(0.66, 9); // the art's pivot: the head of the bolt stands on the point
  });

  it('burns in a loop (its four frames) and swells to its size as it leaves the hand', () => {
    const atlas = fakeVfxAtlas(['bolt_body', 'bolt_core'], 4);
    const v = new ProjectileView(bolt(), atlas);
    const body = v.root.children[1] as Sprite;
    v.sync(1, 0);
    const first = body.scale.x;
    const seen = new Set<Texture>();
    for (let i = 0; i < 30; i++) {
      v.sync(1, 1 / 60);
      seen.add(body.texture);
    }
    expect(seen.size).toBe(4);
    expect(body.scale.x).toBeGreaterThan(first);
    // full size after a tenth of a second, and no bigger after that
    const full = body.scale.x;
    for (let i = 0; i < 20; i++) v.sync(1, 1 / 60);
    expect(body.scale.x).toBeCloseTo(full, 6);
    // a hit-stop gives dt = 0: it holds
    const held = body.texture;
    v.sync(1, 0);
    expect(body.texture).toBe(held);
  });

  it('is the shapes\' bolt without the art\'s sequences (nothing of what it was changed)', () => {
    for (const present of [[], ['bolt_body']] as const) {
      const v = new ProjectileView(bolt(), fakeVfxAtlas(present, 4));
      expect(v.root.children).toHaveLength(4);
      const [tail] = v.root.children as Sprite[];
      expect(tail!.anchor.x).toBe(1); // the streak
    }
  });
});

describe('the light the hero carries (the ambient mote)', () => {
  function rig(level: () => number, every = AMBIENT.every) {
    const calls: Array<{ id: string; at: { x: number; y: number } }> = [];
    const system = { spawn: (id: string, a: { x: number; y: number }) => (calls.push({ id, at: a }), true) } as unknown as VfxSystem;
    const player = { x: 4, y: 1 };
    const director = new VfxDirector(new EventBus<GameEvents>(), system, VFX_BINDINGS, VFX, () => ({ ...player }), new Set(), { effect: AMBIENT.effect, level, every });
    return { calls, director, player };
  }

  it('lets one go every `every` seconds at full magic, at the hero\'s chest', () => {
    const { calls, director } = rig(() => 1);
    for (let i = 0; i < 60; i++) director.update(1 / 60);
    expect(calls.length).toBe(Math.floor(1 / AMBIENT.every));
    expect(calls.every((c) => c.id === AMBIENT.effect)).toBe(true);
    expect(calls[0]!.at).toEqual(expect.objectContaining({ x: 4, y: 1.9 }));
  });

  it('is rarer as the magic falls (the level squared), and none at all when it is spent or the hero is down', () => {
    const full = rig(() => 1);
    const half = rig(() => 0.5);
    const none = rig(() => 0);
    for (let i = 0; i < 600; i++) for (const r of [full, half, none]) r.director.update(1 / 60);
    expect(none.calls).toHaveLength(0);
    expect(half.calls.length).toBeGreaterThan(0);
    expect(half.calls.length).toBeLessThan(full.calls.length / 3);
    expect(half.calls.length).toBeGreaterThan(full.calls.length / 6);
  });

  it('a frame that comes late does not let a burst of them go, and a game that gives no light has none', () => {
    const late = rig(() => 1);
    late.director.update(30);
    late.director.update(0);
    expect(late.calls.length).toBeLessThanOrEqual(Math.ceil(1.5 / AMBIENT.every));
    const system = { spawn: () => true } as unknown as VfxSystem;
    const bare = new VfxDirector(new EventBus<GameEvents>(), system, VFX_BINDINGS, VFX, () => ({ x: 0, y: 0 }));
    expect(() => bare.update(1)).not.toThrow();
  });

  it('is quiet by contract: one particle, the hero\'s own colour, the first thing the budget drops, never many alive', () => {
    expect(ambientIssues(VFX, AMBIENT)).toEqual([]);
    const loud = (over: Partial<ParticleVfx>, every: number = AMBIENT.every): string[] => ambientIssues({ ...VFX, [AMBIENT.effect]: { ...(VFX[AMBIENT.effect] as ParticleVfx), ...over } }, { effect: AMBIENT.effect, every });
    expect(loud({ count: [3, 3] }).join(' ')).toMatch(/3 particles at a time/);
    expect(loud({ palette: 'enemy' }).join(' ')).toMatch(/hero's/);
    expect(loud({ blend: 'normal' }).join(' ')).toMatch(/added/);
    expect(loud({ life: [1, 5] }).join(' ')).toMatch(/ceiling/);
    expect(loud({ priority: 7 }).join(' ')).toMatch(/first the budget drops/);
    expect(loud({}, 0.05).join(' ')).toMatch(/alive at once/);
    expect(ambientIssues({}, AMBIENT).join(' ')).toMatch(/not defined/);
    expect(ambientIssues({ ...VFX, [AMBIENT.effect]: VFX['impact_flash']! }, AMBIENT).join(' ')).toMatch(/burst of particles/);
    expect(AMBIENT_CONTRACT.maxAlive).toBeLessThan(12);
  });
});

describe('the contract keeps what the new effects bring', () => {
  const clone = <T,>(v: T): T => structuredClone(v);
  const messages = (defs: Record<string, VfxDefinition>): string[] => checkVfxContract(defs, VFX_BINDINGS).map((i) => i.message);

  it('a flipbook that plays a sequence the art does not paint is stopped, and so is a painted cut that names one', () => {
    const defs = clone(VFX) as Record<string, VfxDefinition>;
    Object.assign(defs['impact_burst']!, { sequence: 'no_such_sequence' });
    Object.assign(defs['slash_arc']!, { sequences: { core: 'slash_body', hot: 'nope' } });
    const m = messages(defs);
    expect(m.some((x) => /impact_burst.*"no_such_sequence" is not one the art paints/.test(x))).toBe(true);
    expect(m.some((x) => /slash_arc.*"nope" is not one the art paints/.test(x))).toBe(true);
  });

  it('numbers that are not numbers in a flipbook are stopped before they reach the screen', () => {
    const defs = clone(VFX) as Record<string, VfxDefinition>;
    Object.assign(defs['death_splash']!, { life: 0, size: [Number.NaN, 1], alpha: [0, 3] });
    const m = messages(defs).join('\n');
    expect(m).toMatch(/death_splash.*life 0 must be above 0/);
    expect(m).toMatch(/death_splash.*size .* must be two numbers above 0/);
    expect(m).toMatch(/death_splash.*alpha \[0,3\] must stay within 0–1/);
  });

  it('light behind the actors is additive: a normal-blend flipbook cannot stand there', () => {
    const defs = clone(VFX) as Record<string, VfxDefinition>;
    Object.assign(defs['death_splash']!, { layer: 'back' });
    expect(messages(defs).some((x) => /"back" needs blend "add"/.test(x))).toBe(true);
  });

  it('a flipbook costs one sprite effect and lives for its life, like a flash', () => {
    // the cost of the trigger that has one is counted: (hitLanded = flash + ring + the painted burst)
    const defs = clone(VFX) as Record<string, VfxDefinition>;
    Object.assign(defs['impact_burst']!, { life: 0.9 });
    expect(messages(defs).some((x) => /"hitLanded" lives 0\.9 s, over its 0\.5 s ceiling/.test(x))).toBe(true);
  });
});
