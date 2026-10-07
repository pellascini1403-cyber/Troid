import { describe, expect, it } from 'vitest';
import {
  artAtlasRef,
  artClipFrames,
  artSetId,
  ART_CATEGORIES,
  atlasVariants,
  chooseAtlasVariant,
  CLIP_ALIASES,
  isSafeRelativePath,
  metresPerPixel,
  missingClips,
  parseArtAtlasRef,
  parseArtIndex,
  parseArtPack,
  toSpriteSetDefinition,
  type ArtAtlas,
} from '@/presentation/artManifest';
import { ANIM_STATES } from '@/presentation/vocabulary';
import { Rng } from '@/core/rng';

/**
 * THE ASSET CONTRACT (docs/ART-PIPELINE-2D.md, part B): what a manifest may say and what the reader refuses. The fixtures here are TECHNICAL — numbers and
 * names, never art — and describe no real character.
 */
const valid = (): Record<string, unknown> => ({
  manifestVersion: 1,
  id: 'hero',
  category: 'player',
  status: 'final',
  tags: ['hero'],
  atlases: [
    { id: 'hero_2x', source: 'hero_2x.png', data: 'hero_2x.json', width: 1024, height: 512, resolution: 1 },
    { id: 'hero_1x', source: 'hero_1x.png', data: 'hero_1x.json', width: 512, height: 256, resolution: 0.5 },
  ],
  sprites: [
    {
      id: 'hero',
      atlases: ['hero_1x', 'hero_2x'],
      artPxPerMeter: 160,
      pivot: [0.5, 0.95],
      frameSize: [200, 300],
      height: 1.7,
      clips: {
        idle: { frames: 'idle_', count: 4, fps: 8 },
        attack1: { frames: 'atk1_', count: 6, frameDuration: 80, phases: { startup: [0, 1], active: [2, 3], recovery: [4, 5] } },
        aerialAttack: { frames: 'air_', count: 6, fps: 12 },
        crouchAttack: { frames: 'cat_', count: 4 },
      },
      tags: ['sword'],
    },
  ],
});
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const errors = (raw: unknown): string[] => parseArtPack(raw).issues.filter((i) => i.level === 'error').map((i) => `${i.path}: ${i.message}`);
const warnings = (raw: unknown): string[] => parseArtPack(raw).issues.filter((i) => i.level === 'warn').map((i) => `${i.path}: ${i.message}`);

describe('parseArtPack: what a good manifest becomes', () => {
  it('reads a complete pack, orders the variants master-first and normalises names, rates and pivots', () => {
    const { value, issues } = parseArtPack(valid());
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(value).not.toBeNull();
    const hero = value!.sprites[0]!;
    expect(hero.atlases, 'the master first, however the file listed them').toEqual(['hero_2x', 'hero_1x']);
    // the artist's names are the engine's: aerialAttack → attackAir, crouchAttack → attackCrouch, attack1 stays
    expect(Object.keys(hero.clips).sort()).toEqual(['attack1', 'attackAir', 'attackCrouch', 'idle']);
    expect(hero.clips.attack1!.fps).toBeCloseTo(12.5, 9); // frameDuration 80 ms → 12.5 frames per second
    expect(hero.clips.attack1!.phases).toEqual({ startup: [0, 1], active: [2, 3], recovery: [4, 5] });
    expect(hero.scale).toBe(1);
    expect(hero.missingClips).toBe('placeholder');
    expect(hero.tags).toEqual(['sword']);
    expect(value!.tags).toEqual(['hero']);
  });

  it('a pivot may be given in pixels of the frame: it is normalised against frameSize', () => {
    const raw = valid() as { sprites: Array<Record<string, unknown>> };
    delete raw.sprites[0]!['pivot'];
    raw.sprites[0]!['pivotPx'] = [100, 285];
    const { value } = parseArtPack(raw);
    expect(value!.sprites[0]!.pivot).toEqual([0.5, 0.95]);
  });

  it('a pack that is still waiting for its art can declare everything but the images (what the art MUST become)', () => {
    const raw = valid() as Record<string, unknown> & { sprites: Array<Record<string, unknown>> };
    raw['status'] = 'awaiting-art';
    raw['atlases'] = [];
    raw.sprites[0]!['atlases'] = [];
    delete raw.sprites[0]!['clips'];
    raw.sprites[0]!['clips'] = { walk: { frames: 'walk_', count: 8, fps: 10 } }; // not even an idle yet
    expect(errors(raw)).toEqual([]);
    // the same pack claiming to be final is refused: nothing to draw
    raw['status'] = 'final';
    expect(errors(raw).join('\n')).toMatch(/needs at least one atlas/);
  });

  it('unknown keys are reported, never silently ignored — and never an error (a newer tool may write more)', () => {
    const raw = valid() as { sprites: Array<Record<string, unknown>> };
    raw.sprites[0]!['pivotX'] = 1;
    (raw as Record<string, unknown>)['author'] = 'someone';
    expect(errors(raw)).toEqual([]);
    expect(warnings(raw).join('\n')).toMatch(/unknown key "pivotX"/);
    expect(warnings(raw).join('\n')).toMatch(/unknown key "author"/);
    // $schema and comment are for humans and tools
    const ok = valid();
    ok['$schema'] = './schema.json';
    ok['comment'] = 'hi';
    expect(warnings(ok)).toEqual([]);
  });

  it('a big atlas is allowed with a warning (a phone may not take it); a huge one is refused', () => {
    const raw = valid() as { atlases: Array<Record<string, unknown>> };
    raw.atlases[0]!['width'] = 3000;
    expect(errors(raw)).toEqual([]);
    expect(warnings(raw).join('\n')).toMatch(/over 2048 px/);
    raw.atlases[0]!['width'] = 9000;
    expect(errors(raw).join('\n')).toMatch(/atlases\[0\]\.width: must be at most 4096/);
  });
});

describe('parseArtPack: what the reader refuses, with the path of the field', () => {
  it('only reads the version it knows, and says when the file belongs to a newer game', () => {
    const newer = valid();
    newer['manifestVersion'] = 2;
    expect(errors(newer).join('\n')).toMatch(/belongs to a newer game/);
    const none = valid();
    delete none['manifestVersion'];
    expect(errors(none).join('\n')).toMatch(/manifestVersion: must be 1/);
  });

  it.each([
    ['a category that does not exist', (r: Record<string, unknown>) => (r['category'] = 'weapons'), /category: must be one of/],
    ['an id with capitals and spaces', (r: Record<string, unknown>) => (r['id'] = 'The Hero'), /id: "The Hero" is not a valid id/],
    ['no atlases list', (r: Record<string, unknown>) => delete r['atlases'], /atlases: must be a list/],
    ['no sprites list', (r: Record<string, unknown>) => delete r['sprites'], /sprites: must be a list/],
    ['a status that does not exist', (r: Record<string, unknown>) => (r['status'] = 'done'), /status: must be one of/],
  ])('refuses %s', (_name, mutate, expected) => {
    const raw = valid();
    mutate(raw);
    expect(errors(raw).join('\n')).toMatch(expected);
  });

  it.each([
    ['an image outside the pack folder', '../elsewhere.png'],
    ['an absolute path', '/etc/hero.png'],
    ['a URL', 'https://example.com/hero.png'],
    ['a backslash path', 'art\\hero.png'],
    ['a path with an empty segment', 'a//b.png'],
    ['not an image', 'hero.gif'],
  ])('refuses %s as an atlas source', (_name, source) => {
    const raw = valid() as { atlases: Array<Record<string, unknown>> };
    raw.atlases[0]!['source'] = source;
    expect(errors(raw).length).toBeGreaterThan(0);
  });

  it('refuses atlas sizes that are not whole positive numbers, and resolutions that are not positive', () => {
    for (const [key, v] of [['width', 0], ['width', 100.5], ['height', -3], ['width', '1024'], ['resolution', 0], ['resolution', 9]] as const) {
      const raw = valid() as { atlases: Array<Record<string, unknown>> };
      raw.atlases[0]![key] = v;
      expect(errors(raw).length, `${key} = ${String(v)}`).toBeGreaterThan(0);
    }
  });

  it('refuses two atlases with the same id; two atlases of the same resolution are not an error: they are the pages of one variant', () => {
    const dup = valid() as { atlases: Array<Record<string, unknown>> };
    dup.atlases[1]!['id'] = 'hero_2x';
    expect(errors(dup).join('\n')).toMatch(/declared twice/);
    const pages = valid() as { atlases: Array<Record<string, unknown>> };
    pages.atlases[1]!['resolution'] = 1;
    expect(errors(pages)).toEqual([]);
    const { value } = parseArtPack(pages);
    const hero = value!.sprites[0]!;
    const variants = atlasVariants(hero, new Map(value!.atlases.map((a) => [a.id, a])));
    expect(variants.map((v) => ({ resolution: v.resolution, pages: v.pages.map((a) => a.id) }))).toEqual([{ resolution: 1, pages: ['hero_1x', 'hero_2x'] }]); // the pages keep the order the sprite set lists them in
  });

  it('an atlas of a pack that carries art needs its JSON: an image alone does not say where the frames are — a pack that awaits its art needs nothing', () => {
    const raw = valid() as { atlases: Array<Record<string, unknown>> };
    delete raw.atlases[0]!['data'];
    expect(errors(raw).join('\n')).toMatch(/atlases\[0\]\.data: atlas "hero_2x" needs its "data"/);
    const awaiting = valid() as { status: string; atlases: unknown[]; sprites: Array<Record<string, unknown>> };
    awaiting.status = 'awaiting-art';
    awaiting.atlases = [];
    awaiting.sprites[0]!['atlases'] = [];
    expect(errors(awaiting)).toEqual([]);
  });

  it('anchors in pixels (a hundred metres from the feet) are refused with a message that says what is wrong', () => {
    const raw = valid() as { sprites: Array<Record<string, unknown>> };
    raw.sprites[0]!['frames'] = { idle_00: { anchors: { hand_r: [120, 150] } } };
    expect(errors(raw).join('\n')).toMatch(/frames\.idle_00\.anchors\.hand_r: \[120,150\] is not in metres.*is it in pixels\?/);
    raw.sprites[0]!['frames'] = { idle_00: { anchors: { hand_r: [0.4, 1.1] } } };
    expect(errors(raw)).toEqual([]);
  });

  it('refuses a sprite set that names an atlas the pack does not declare (a broken reference)', () => {
    const raw = valid() as { sprites: Array<Record<string, unknown>> };
    raw.sprites[0]!['atlases'] = ['hero_2x', 'nowhere'];
    expect(errors(raw).join('\n')).toMatch(/unknown atlas "nowhere"/);
  });

  it('needs the scale, the pivot and the height: the numbers that put the art in the world', () => {
    for (const key of ['artPxPerMeter', 'height'] as const) {
      const raw = valid() as { sprites: Array<Record<string, unknown>> };
      delete raw.sprites[0]![key];
      expect(errors(raw).join('\n'), key).toMatch(new RegExp(`${key}: must be a number`));
    }
    const noPivot = valid() as { sprites: Array<Record<string, unknown>> };
    delete noPivot.sprites[0]!['pivot'];
    expect(errors(noPivot).join('\n')).toMatch(/the feet pivot is required/);
  });

  it('refuses a pivot outside the frame, a pivot given twice, a pixel pivot without a frame size and one outside the frame', () => {
    const out = valid() as { sprites: Array<Record<string, unknown>> };
    out.sprites[0]!['pivot'] = [0.5, 1.4];
    expect(errors(out).join('\n')).toMatch(/pivot/);
    const both = valid() as { sprites: Array<Record<string, unknown>> };
    both.sprites[0]!['pivotPx'] = [100, 285];
    expect(errors(both).join('\n')).toMatch(/not both/);
    const noSize = valid() as { sprites: Array<Record<string, unknown>> };
    delete noSize.sprites[0]!['pivot'];
    delete noSize.sprites[0]!['frameSize'];
    noSize.sprites[0]!['pivotPx'] = [100, 285];
    expect(errors(noSize).join('\n')).toMatch(/needs "frameSize"/);
    const far = valid() as { sprites: Array<Record<string, unknown>> };
    delete far.sprites[0]!['pivot'];
    far.sprites[0]!['pivotPx'] = [100, 900];
    expect(errors(far).join('\n')).toMatch(/outside the 200 × 300 frame/);
  });

  it('the art faces right: the engine mirrors it by the facing', () => {
    const raw = valid() as { sprites: Array<Record<string, unknown>> };
    raw.sprites[0]!['facing'] = 'left';
    expect(errors(raw).join('\n')).toMatch(/must face right/);
    raw.sprites[0]!['facing'] = 'right';
    expect(errors(raw)).toEqual([]);
  });

  it('a clip needs a frame prefix and a count; rate is "fps" or "frameDuration", never both; phases must fit the clip', () => {
    const cases: Array<[string, (c: Record<string, unknown>) => void, RegExp]> = [
      ['no prefix', (c) => delete c['frames'], /frames: must be a non-empty string/],
      ['a prefix with a space', (c) => (c['frames'] = 'idle 0'), /frames: "idle 0" is not a frame-name prefix/],
      ['no count', (c) => delete c['count'], /count: must be a number/],
      ['a count of zero', (c) => (c['count'] = 0), /count: must be at least 1/],
      ['a fractional count', (c) => (c['count'] = 2.5), /whole number/],
      ['a rate and a duration', (c) => (c['frameDuration'] = 100), /not both/],
      ['a negative rate', (c) => (c['fps'] = -4), /fps: must be at least/],
      ['a loop that is not a boolean', (c) => (c['loop'] = 'yes'), /loop: must be true or false/],
    ];
    for (const [name, mutate, expected] of cases) {
      const raw = valid() as { sprites: Array<{ clips: { idle: Record<string, unknown> } }> };
      mutate(raw.sprites[0]!.clips.idle);
      expect(errors(raw).join('\n'), name).toMatch(expected);
    }
    const phases = valid() as { sprites: Array<{ clips: { attack1: { phases: Record<string, unknown> } } }> };
    phases.sprites[0]!.clips.attack1.phases['recovery'] = [4, 9];
    expect(errors(phases).join('\n')).toMatch(/phases\.recovery: \[4, 9\] is not inside the clip's 6 frames/);
    const order = valid() as { sprites: Array<{ clips: { attack1: { phases: Record<string, unknown> } } }> };
    order.sprites[0]!.clips.attack1.phases['active'] = [1, 3];
    expect(errors(order)).toEqual([]);
    expect(warnings(order).join('\n')).toMatch(/overlap or are out of order/);
  });

  it('names the clips the engine knows, lists them when the name is wrong, and refuses a state declared twice (an alias and its state)', () => {
    const typo = valid() as { sprites: Array<{ clips: Record<string, unknown> }> };
    typo.sprites[0]!.clips['atack'] = { frames: 'x_', count: 1 };
    expect(errors(typo).join('\n')).toMatch(/"atack" is not an animation state \(known: idle, walk/);
    const twice = valid() as { sprites: Array<{ clips: Record<string, unknown> }> };
    twice.sprites[0]!.clips['attackAir'] = { frames: 'y_', count: 1 };
    expect(errors(twice).join('\n')).toMatch(/declares "attackAir" twice/);
  });

  it('a final pack must have an idle clip: it is the last resort of every state', () => {
    const raw = valid() as { sprites: Array<{ clips: Record<string, unknown> }> };
    delete raw.sprites[0]!.clips['idle'];
    expect(errors(raw).join('\n')).toMatch(/no "idle" clip/);
  });

  it('anchors: only known ids, as numbers [x, y] in metres; the same for the per-frame data', () => {
    const raw = valid() as { sprites: Array<Record<string, unknown>> };
    raw.sprites[0]!['anchors'] = { hand_r: [0.3, 0.9], elbow: [0, 0] };
    expect(errors(raw).join('\n')).toMatch(/unknown anchor "elbow"/);
    raw.sprites[0]!['anchors'] = { hand_r: [0.3, 'x'] };
    expect(errors(raw).join('\n')).toMatch(/pair of numbers/);
    raw.sprites[0]!['anchors'] = { hand_r: [0.3, 0.9], weapon_grip: [0.3, 0.9], weapon_tip: [0.9, 1.1] };
    raw.sprites[0]!['frames'] = { idle_00: { heightPx: 270, anchors: { head: [0, 1.6] } }, 'bad name!': {} };
    expect(errors(raw).join('\n')).toMatch(/"bad name!" is not a valid frame name/);
    delete (raw.sprites[0]!['frames'] as Record<string, unknown>)['bad name!'];
    expect(errors(raw)).toEqual([]);
    expect(parseArtPack(raw).value!.sprites[0]!.frames!['idle_00']).toEqual({ heightPx: 270, anchors: { head: [0, 1.6] } });
  });

  it('collects EVERY problem in one pass (a person fixes them together), and never returns a half-read pack', () => {
    const raw = valid() as { atlases: Array<Record<string, unknown>>; sprites: Array<{ clips: Record<string, unknown> }> };
    raw.atlases[0]!['width'] = 0;
    raw.atlases[1]!['source'] = '../x.png';
    raw.sprites[0]!.clips['idle'] = { count: 'many' };
    const { value, issues } = parseArtPack(raw);
    expect(value).toBeNull();
    expect(issues.filter((i) => i.level === 'error').length).toBeGreaterThanOrEqual(4);
  });

  it('NEVER throws, whatever it is given — and a mutated pack is either refused with an error or read without one', () => {
    for (const junk of [null, undefined, 0, 'pack', [], [1, 2], true, {}, { manifestVersion: 1 }, { manifestVersion: 1, id: 5 }]) {
      expect(() => parseArtPack(junk)).not.toThrow();
      expect(parseArtPack(junk).value).toBeNull();
    }
    const rng = new Rng(7);
    const junkValues: unknown[] = [null, undefined, -1, 0, 1e9, NaN, 'x', '../y', [], {}, [1], [1, 2, 3], true, false, 'idle_', 1.5];
    for (let n = 0; n < 600; n++) {
      const raw = clone(valid());
      // mutate a random leaf at a random depth
      let node: Record<string, unknown> | unknown[] = raw;
      for (let depth = 0; depth < 4; depth++) {
        const keys = Object.keys(node as Record<string, unknown>);
        const key = keys[Math.floor(rng.next() * keys.length)]!;
        const child = (node as Record<string, unknown>)[key];
        if (typeof child === 'object' && child !== null && rng.chance(0.65)) node = child as Record<string, unknown>;
        else {
          (node as Record<string, unknown>)[key] = junkValues[Math.floor(rng.next() * junkValues.length)];
          break;
        }
      }
      const out = parseArtPack(raw);
      const failed = out.issues.some((i) => i.level === 'error');
      expect(out.value === null, JSON.stringify(out.issues)).toBe(failed);
    }
  });
});

describe('the index: which packs exist and when each is fetched', () => {
  const index = (): Record<string, unknown> => ({
    manifestVersion: 1,
    packs: [
      { id: 'hero', category: 'player', load: 'boot', manifest: 'player/hero.pack.json' },
      { id: 'r2_art', category: 'environment', load: 'zone', zones: ['r2_hall'], manifest: 'r2/r2.pack.json', tags: ['forest'] },
      { id: 'labs', category: 'vfx', load: 'lazy', manifest: 'labs/labs.pack.json' },
    ],
  });
  const indexErrors = (raw: unknown): string[] => parseArtIndex(raw).issues.filter((i) => i.level === 'error').map((i) => `${i.path}: ${i.message}`);

  it('reads the three policies', () => {
    const { value, issues } = parseArtIndex(index());
    expect(issues).toEqual([]);
    expect(value!.packs.map((p) => [p.id, p.category, p.load, p.zones])).toEqual([
      ['hero', 'player', 'boot', []],
      ['r2_art', 'environment', 'zone', ['r2_hall']],
      ['labs', 'vfx', 'lazy', []],
    ]);
  });

  it('a zone pack needs its rooms; a path never leaves the art folder; an id is listed once', () => {
    const noZones = index() as { packs: Array<Record<string, unknown>> };
    delete noZones.packs[1]!['zones'];
    expect(indexErrors(noZones).join('\n')).toMatch(/needs the rooms it belongs to/);
    const out = index() as { packs: Array<Record<string, unknown>> };
    out.packs[0]!['manifest'] = '../outside.json';
    expect(indexErrors(out).join('\n')).toMatch(/must be a relative .json path/);
    const twice = index() as { packs: Array<Record<string, unknown>> };
    twice.packs[2]!['id'] = 'hero';
    expect(indexErrors(twice).join('\n')).toMatch(/listed twice/);
    const bad = index() as { packs: Array<Record<string, unknown>> };
    bad.packs[0]!['load'] = 'now';
    expect(indexErrors(bad).join('\n')).toMatch(/load: must be one of boot \| zone \| lazy/);
  });

  it('never throws and an empty index is a valid index (no art at all)', () => {
    for (const junk of [null, 1, 'x', [], {}, { manifestVersion: 1 }, { manifestVersion: 1, packs: 'no' }]) expect(() => parseArtIndex(junk)).not.toThrow();
    expect(parseArtIndex({ manifestVersion: 1, packs: [] }).value).toEqual({ manifestVersion: 1, packs: [] });
  });
});

describe('the bridge to the engine: the resolution of the art never reaches gameplay', () => {
  const pack = parseArtPack(valid()).value!;
  const hero = pack.sprites[0]!;
  const atlases = new Map<string, ArtAtlas>(pack.atlases.map((a) => [a.id, a]));
  const variants = atlasVariants(hero, atlases);
  const master = variants[0]!;
  const half = variants[1]!;

  it('groups the atlases into variants, the master first', () => {
    expect(variants.map((v) => [v.resolution, v.pages.map((a) => a.id)])).toEqual([[1, ['hero_2x']], [0.5, ['hero_1x']]]);
  });

  it('the two variants are the SAME set measured in metres: only the density of the image differs', () => {
    const a = toSpriteSetDefinition(pack.id, hero, master);
    const b = toSpriteSetDefinition(pack.id, hero, half);
    expect(a.artPxPerMeter).toBe(160);
    expect(b.artPxPerMeter).toBe(80);
    // everything gameplay (and the validator) reads is identical
    for (const key of ['id', 'pivot', 'height', 'clips', 'anchors', 'visualScale'] as const) expect(b[key], key).toEqual(a[key]);
    // and on screen they are the same size: a frame of the half atlas has half the pixels and is drawn twice as big
    expect(metresPerPixel(hero, half)).toBeCloseTo(2 * metresPerPixel(hero, master), 12);
    expect(256 * metresPerPixel(hero, half)).toBeCloseTo(512 * metresPerPixel(hero, master), 9);
  });

  it('the visual scale is a multiplier on the drawn size and nothing else: it goes in `visualScale`, never in the density', () => {
    const big = { ...hero, scale: 1.25 };
    expect(metresPerPixel(big, master)).toBeCloseTo(1.25 * metresPerPixel(hero, master), 12);
    const def = toSpriteSetDefinition(pack.id, big, master);
    expect(def.visualScale).toBe(1.25);
    expect(def.artPxPerMeter).toBe(160);
    expect(toSpriteSetDefinition(pack.id, hero, master).visualScale, 'a scale of 1 writes nothing').toBeUndefined();
  });

  it('keeps the clips in the engine\'s own vocabulary and keeps the phases and rates', () => {
    const def = toSpriteSetDefinition(pack.id, hero, master);
    expect(def.clips.attack!).toBeUndefined();
    expect(def.clips.attack1).toEqual({ frames: 'atk1_', count: 6, fps: 12.5, phases: { startup: [0, 1], active: [2, 3], recovery: [4, 5] } });
    expect(def.clips.attackAir).toEqual({ frames: 'air_', count: 6, fps: 12 });
    expect(def.clips.attackCrouch).toEqual({ frames: 'cat_', count: 4 });
  });

  it('names the set by pack and sprite, and points at its images with a reference the library can read back', () => {
    const def = toSpriteSetDefinition(pack.id, hero, half);
    expect(def.id, 'two packs may each have a "hero": the manager caches by this').toBe(artSetId('hero', 'hero'));
    expect(def.atlas).toBe('art:hero/hero@0.5');
    expect(parseArtAtlasRef(def.atlas)).toEqual({ packId: 'hero', spriteId: 'hero', resolution: 0.5 });
    expect(parseArtAtlasRef(artAtlasRef('enemies', 'slime', 1))).toEqual({ packId: 'enemies', spriteId: 'slime', resolution: 1 });
    for (const junk of ['', 'procedural:player', 'art:hero', 'art:hero/hero', 'art:hero/hero@', 'art:hero/hero@0', 'art:hero/hero@x', 'art:/hero@1', 'art:a/b/c@1', 'sprites/hero']) {
      expect(parseArtAtlasRef(junk), JSON.stringify(junk)).toBeNull();
    }
  });

  it('chooses the smallest image that still has the pixels the screen will draw — and the largest when none does', () => {
    // render pixels per metre = css px per metre × resolution (docs/ART-PIPELINE-2D.md §A.4)
    const pick = (sprite: typeof hero, drawn: number): number | undefined => chooseAtlasVariant(sprite, atlases, drawn)?.resolution;
    expect(pick(hero, 28.9 * 1.75), 'a phone: 51 px/m → the half-size image (80 px/m) is enough').toBe(0.5);
    expect(pick(hero, 60.7 * 1.75), 'a tablet: 106 px/m → the master').toBe(1);
    expect(pick(hero, 160), 'a 4K monitor: 160 px/m → the master').toBe(1);
    expect(pick(hero, 400), 'more than any image has: the largest there is').toBe(1);
    expect(pick({ ...hero, scale: 2 }, 28.9 * 1.75), 'drawn twice as big it needs twice the pixels').toBe(1);
    expect(chooseAtlasVariant({ ...hero, atlases: [] }, atlases, 50)).toBeNull();
  });

  it('knows what is still to be drawn', () => {
    expect(missingClips(hero, ['idle', 'walk', 'attack1', 'attackAir', 'cast'])).toEqual(['walk', 'cast']);
    expect(artClipFrames({ frames: 'idle_', count: 3 })).toEqual(['idle_00', 'idle_01', 'idle_02']);
  });
});

describe('the contract in numbers', () => {
  it('every alias points at a real state, and no alias hides a state of its own', () => {
    for (const [alias, state] of Object.entries(CLIP_ALIASES)) {
      expect(ANIM_STATES as readonly string[], alias).toContain(state);
      expect(ANIM_STATES as readonly string[], `${alias} is not itself a state`).not.toContain(alias);
    }
  });

  it('knows the five categories the art is split into', () => {
    expect([...ART_CATEGORIES]).toEqual(['player', 'enemies', 'environment', 'vfx', 'ui']);
  });

  it('a path inside a pack never reaches outside it', () => {
    for (const ok of ['a.png', 'sub/a.png', 'a-b_c.json', 'x/y/z.webp']) expect(isSafeRelativePath(ok), ok).toBe(true);
    for (const bad of ['', '/a.png', '../a.png', 'a/../b.png', './a.png', 'a//b.png', 'C:/a.png', 'file:///a.png', 'data:image/png;base64,AAAA', 'a\\b.png', 'a\0b.png']) expect(isSafeRelativePath(bad), JSON.stringify(bad)).toBe(false);
  });
});
