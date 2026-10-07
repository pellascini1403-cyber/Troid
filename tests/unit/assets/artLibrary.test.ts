import { describe, expect, it } from 'vitest';
import { ArtLibrary } from '@/assets/artLibrary';
import { ArtWorld, ART_BASE, names, simplePack, type FakeSource, type FakeTexture, type WorldPack } from '../../helpers/artWorld';

/**
 * THE ART LIBRARY (docs/ART-PIPELINE-2D.md, part C): files in, textures out, and nothing it meets can fail the game. Everything here runs in Node against a
 * fake world of files — the images are only sizes, the textures only names — so what is asserted is the LOGIC: what is fetched and when, what is shared,
 * what is freed, what is refused and what the game keeps instead.
 */
function setup(world: ArtWorld, options: { drawn?: number } = {}) {
  const notes: string[] = [];
  let drawn = options.drawn ?? 50;
  const lib = new ArtLibrary<FakeSource, FakeTexture>({
    indexUrl: world.indexUrl,
    io: world.io,
    textures: world.textureApi,
    drawnPxPerMetre: () => drawn,
    note: (m) => notes.push(m),
  });
  return { lib, notes, setDrawn: (v: number) => (drawn = v) };
}

const swordFrames = (prefix: string, count: number, grip: [number, number] = [0.3, 1]): Record<string, unknown> =>
  Object.fromEntries(names(prefix, count).map((n) => [n, { anchors: { hand_r: [0.3, 1], weapon_grip: grip, weapon_tip: [1.1, 1.2] } }]));

describe('the index', () => {
  it('no art at all is not an error: no packs, a state that says so, and the sets it is asked for come back null', async () => {
    const world = new ArtWorld();
    const { lib, notes } = setup(world);
    expect(await lib.init()).toEqual([]);
    expect(lib.stats().state).toBe('absent');
    expect(await lib.acquire('player', 'hero')).toBeNull();
    expect(world.requests, 'it asked for the index once and for nothing else').toEqual([world.indexUrl]);
    expect(notes.join('\n')).toMatch(/no art index/);
  });

  it('an index that is not valid is refused whole, and said so', async () => {
    const world = new ArtWorld();
    world.files.set(world.indexUrl, { manifestVersion: 1, packs: [{ id: 'a', category: 'nope', manifest: '../x.json' }] });
    const { lib, notes } = setup(world);
    expect(await lib.init()).toEqual([]);
    expect(lib.stats().state).toBe('invalid');
    expect(notes.join('\n')).toMatch(/category/);
  });

  it('is read once however many ask, and lists what it holds', async () => {
    const world = new ArtWorld().addPack(simplePack({ load: 'boot' })).addPack(simplePack({ id: 'scenery', category: 'environment', load: 'zone', zones: ['r2_hall'] }));
    const { lib } = setup(world);
    const [a, b] = await Promise.all([lib.init(), lib.init()]);
    expect(a).toBe(b);
    expect(a.map((e) => [e.id, e.category, e.load])).toEqual([['enemies', 'enemies', 'boot'], ['scenery', 'environment', 'zone']]);
    expect(world.fetches(world.indexUrl)).toBe(1);
    expect(lib.stats()).toMatchObject({ state: 'ready', packs: 2, packsRead: 0, pages: 0, bytes: 0 });
  });
});

describe('a sprite set from a pack', () => {
  it('is made of the pages of the pack, with a texture for each frame its clips draw and no others', async () => {
    const world = new ArtWorld().addPack(simplePack({ atlases: [{ id: 'main', frames: [...names('idle_', 3), ...names('walk_', 2), ...names('unused_', 4)] }] }));
    const { lib, notes } = setup(world);
    const set = await lib.acquire('enemies', 'hero');
    expect(set).not.toBeNull();
    expect(set!.def.id).toBe('enemies/hero');
    expect([...set!.textures.keys()].sort()).toEqual([...names('idle_', 3), ...names('walk_', 2)].sort());
    expect(set!.textures.get('idle_00')!.url).toBe(world.urls('enemies', 'main').image);
    expect(Object.keys(set!.def.clips).sort()).toEqual(['idle', 'walk']);
    expect(notes, 'nothing to complain about').toEqual([]);
    expect(lib.stats()).toMatchObject({ packsRead: 1, pages: 1, sets: 1, bytes: 90 * 16 * 4 });
    // 1 index + 1 manifest + 1 JSON + 1 image
    expect(world.requests.length).toBe(4);
  });

  it('is counted: the same set asked twice is one set, and its textures are freed with the last release', async () => {
    const world = new ArtWorld().addPack(simplePack());
    const { lib } = setup(world);
    const [a, b] = await Promise.all([lib.acquire('enemies', 'hero'), lib.acquire('enemies', 'hero')]);
    expect(a).toBe(b);
    expect(world.fetches(world.urls('enemies', 'main').image)).toBe(1);
    lib.release(a!.def);
    expect(world.textures.every((t) => !t.destroyed)).toBe(true);
    expect(lib.acquireLoaded('enemies', 'hero'), 'the synchronous ask takes a count too').toBe(a);
    lib.release(a!.def);
    lib.release(a!.def);
    expect(world.textures.every((t) => t.destroyed)).toBe(true);
    expect([...world.live], 'the image goes with its last set').toEqual([]);
    expect(lib.stats()).toMatchObject({ sets: 0, pages: 0, bytes: 0 });
    expect(lib.acquireLoaded('enemies', 'hero')).toBeNull();
  });

  it('can be loaded again after it was let go — fresh textures, a fresh upload, never a destroyed one (the audit\'s H3: Pixi\'s URL cache could hand one back)', async () => {
    const world = new ArtWorld().addPack(simplePack());
    const { lib } = setup(world);
    const first = await lib.acquire('enemies', 'hero');
    const firstTexture = first!.textures.get('idle_00')!;
    lib.release(first!.def);
    expect(firstTexture.destroyed).toBe(true);
    expect([...world.live]).toEqual([]);
    const again = await lib.acquire('enemies', 'hero');
    expect(again).not.toBeNull();
    const texture = again!.textures.get('idle_00')!;
    expect(texture).not.toBe(firstTexture);
    expect(texture.destroyed).toBe(false);
    expect(world.fetches(world.urls('enemies', 'main').image), 'it really went to the network again').toBe(2);
    expect([...world.live]).toHaveLength(1);
  });

  it('two sets drawn from one atlas share it: one fetch, one upload, freed with the last of them', async () => {
    const world = new ArtWorld().addPack({
      id: 'enemies',
      atlases: [{ id: 'main', frames: [...names('a_', 2), ...names('b_', 2)] }],
      sprites: [
        { id: 'one', atlases: ['main'], clips: { idle: ['a_', 2] } },
        { id: 'two', atlases: ['main'], clips: { idle: ['b_', 2] } },
      ],
    });
    const { lib } = setup(world);
    const one = await lib.acquire('enemies', 'one');
    const two = await lib.acquire('enemies', 'two');
    expect(world.fetches(world.urls('enemies', 'main').image)).toBe(1);
    expect(lib.snapshot().pageList).toEqual([{ url: world.urls('enemies', 'main').image, bytes: 40 * 16 * 4, refs: 2 }]);
    lib.release(one!.def);
    expect([...world.live], 'still needed by the other').toHaveLength(1);
    lib.release(two!.def);
    expect([...world.live]).toEqual([]);
  });

  it('spreads over several pages of one resolution: the frames come from whichever page holds them', async () => {
    const world = new ArtWorld().addPack({
      id: 'enemies',
      atlases: [{ id: 'p0', frames: names('idle_', 2) }, { id: 'p1', frames: names('walk_', 2) }],
      sprites: [{ id: 'hero', atlases: ['p0', 'p1'], clips: { idle: ['idle_', 2], walk: ['walk_', 2] } }],
    });
    const { lib, notes } = setup(world);
    const set = await lib.acquire('enemies', 'hero');
    expect(notes).toEqual([]);
    expect(set!.textures.get('idle_01')!.url).toBe(world.urls('enemies', 'p0').image);
    expect(set!.textures.get('walk_01')!.url).toBe(world.urls('enemies', 'p1').image);
    expect(lib.stats().pages).toBe(2);
    lib.release(set!.def);
    expect([...world.live]).toEqual([]);
  });

  it('gives the half-size atlas to a small screen and the master to a big one — and the set is the same size in metres either way', async () => {
    const pack = (): WorldPack => ({
      id: 'enemies',
      atlases: [
        { id: 'master', resolution: 1, width: 100, height: 20, frames: names('idle_', 2) },
        { id: 'half', resolution: 0.5, width: 50, height: 10, frames: names('idle_', 2) },
      ],
      sprites: [{ id: 'hero', atlases: ['master', 'half'], clips: { idle: ['idle_', 2] }, extra: { artPxPerMeter: 20, height: 1, frames: { idle_00: { heightPx: 20 }, idle_01: { heightPx: 20 } } } }],
    });
    const phone = setup(new ArtWorld().addPack(pack()), { drawn: 10 });
    const small = await phone.lib.acquire('enemies', 'hero');
    expect(small!.def.atlas).toBe('art:enemies/hero@0.5');
    expect(small!.def.artPxPerMeter, 'the density of the image that was loaded').toBe(10);
    expect(phone.notes, 'the height in pixels was scaled with the variant: no scale warning').toEqual([]);
    expect(small!.meta.frames['idle_00']!.heightPx).toBe(10);

    const worldBig = new ArtWorld().addPack(pack());
    const desk = setup(worldBig, { drawn: 40 });
    const big = await desk.lib.acquire('enemies', 'hero');
    expect(big!.def.atlas).toBe('art:enemies/hero@1');
    expect(big!.def.artPxPerMeter).toBe(20);
    expect(worldBig.requests.some((r) => r.includes('half')), 'the variant it does not need is never fetched').toBe(false);
    // gameplay reads: the same in both
    for (const key of ['id', 'pivot', 'height', 'clips'] as const) expect(small!.def[key]).toEqual(big!.def[key]);
  });

  it('a pack that awaits its art gives no set, fetches no image, and says nothing: the placeholder simply stays', async () => {
    const world = new ArtWorld().addPack({ id: 'player', category: 'player', status: 'awaiting-art', atlases: [], sprites: [{ id: 'hero', atlases: [], clips: { idle: ['idle_', 4] } }] });
    const { lib, notes } = setup(world);
    expect(await lib.acquire('player', 'hero')).toBeNull();
    expect(notes).toEqual([]);
    expect(world.requests.filter((r) => r.endsWith('.png'))).toEqual([]);
  });

  it('refuses a manifest that is not the pack the index says it is', async () => {
    const world = new ArtWorld().addPack(simplePack());
    const url = world.urls('enemies', 'main').manifest;
    world.files.set(url, { ...(world.files.get(url) as object), id: 'someone-else' });
    const { lib, notes } = setup(world);
    expect(await lib.acquire('enemies', 'hero')).toBeNull();
    expect(notes.join('\n')).toMatch(/the manifest says it is "someone-else"/);
  });

  it('knows no pack and no set by a name it was not given', async () => {
    const world = new ArtWorld().addPack(simplePack());
    const { lib, notes } = setup(world);
    expect(await lib.acquire('nowhere', 'hero')).toBeNull();
    expect(await lib.acquire('enemies', 'nobody')).toBeNull();
    expect(notes.join('\n')).toMatch(/pack "nowhere" is not in the art index[\s\S]*has no sprite set "nobody"/);
  });
});

describe('what breaks leaves the game with its placeholder and nothing in memory', () => {
  type Break = [name: string, apply: (w: ArtWorld) => void, note: RegExp];
  const breaks: Break[] = [
    ['the manifest is not there', (w) => w.failing.add(w.urls('enemies', 'main').manifest), /could not be fetched/],
    ['the manifest is corrupt', (w) => w.files.set(w.urls('enemies', 'main').manifest, { manifestVersion: 1, id: 'enemies', category: 'enemies', sprites: 3 }), /atlases: must be a list|sprites: must be a list/],
    ['the image is not there', (w) => w.failing.add(w.urls('enemies', 'main').image), /404/],
    ['the JSON is not there (and the image that arrived is freed)', (w) => w.failing.add(w.urls('enemies', 'main').data), /404/],
    ['the JSON is not valid', (w) => w.files.set(w.urls('enemies', 'main').data, { frames: { idle_00: { frame: { x: 0, y: 0, w: 0, h: 0 } } } }), /not valid/],
    ['the image is not the size the manifest declares', (w) => w.images.set(w.urls('enemies', 'main').image, { width: 64, height: 64 }), /the image is 64 × 64 but the manifest declares 50 × 16/],
  ];
  for (const [name, apply, note] of breaks) {
    it(`${name}`, async () => {
      const world = new ArtWorld().addPack(simplePack());
      apply(world);
      const { lib, notes } = setup(world);
      expect(await lib.acquire('enemies', 'hero')).toBeNull();
      expect(notes.join('\n')).toMatch(note);
      expect([...world.live], 'no image is left behind').toEqual([]);
      expect(world.textures.filter((t) => !t.destroyed), 'no texture is left behind').toEqual([]);
      expect(lib.stats()).toMatchObject({ pages: 0, sets: 0, bytes: 0 });
    });
  }

  it('a failure is not remembered: when the file comes back, the next ask works', async () => {
    const world = new ArtWorld().addPack(simplePack());
    const { lib } = setup(world);
    world.failing.add(world.urls('enemies', 'main').image);
    expect(await lib.acquire('enemies', 'hero')).toBeNull();
    world.failing.delete(world.urls('enemies', 'main').image);
    const set = await lib.acquire('enemies', 'hero');
    expect(set).not.toBeNull();
    expect(lib.stats().failures).toBe(1);
  });

  it('a page that fails takes nothing with it: the page of the same set that did arrive is given back', async () => {
    const world = new ArtWorld().addPack({
      id: 'enemies',
      atlases: [{ id: 'p0', frames: names('idle_', 2) }, { id: 'p1', frames: names('walk_', 2) }],
      sprites: [{ id: 'hero', atlases: ['p0', 'p1'], clips: { idle: ['idle_', 2], walk: ['walk_', 2] } }],
    });
    world.failing.add(world.urls('enemies', 'p1').image);
    const { lib } = setup(world);
    expect(await lib.acquire('enemies', 'hero')).toBeNull();
    expect([...world.live]).toEqual([]);
    expect(lib.snapshot().pageList).toEqual([]);
  });

  it('leaves out the clip whose frame is not in the atlas — and only that clip: the state falls back, the rest is real', async () => {
    const world = new ArtWorld().addPack(simplePack({ atlases: [{ id: 'main', frames: [...names('idle_', 3), 'walk_00'] }] }));
    const { lib, notes } = setup(world);
    const set = await lib.acquire('enemies', 'hero');
    expect(Object.keys(set!.def.clips)).toEqual(['idle']);
    expect(lib.dropped('enemies', 'hero')).toEqual([{ state: 'walk', reason: expect.stringMatching(/missing frame walk_01/) }]);
    expect(notes.join('\n')).toMatch(/clip "walk" is left out/);
    expect([...set!.textures.keys()].sort(), 'no texture for a clip that is not used').toEqual(names('idle_', 3));
    expect(lib.snapshot().packList[0]!.dropped).toEqual([{ set: 'enemies/hero', state: 'walk', reason: expect.any(String) }]);
  });

  it('leaves out an attack whose sword is not in the hand, and keeps the clips that do not hold one', async () => {
    const world = new ArtWorld().addPack({
      id: 'player',
      category: 'player',
      atlases: [{ id: 'main', frames: [...names('idle_', 2), ...names('atk_', 3), ...names('air_', 2)] }],
      sprites: [
        {
          id: 'hero',
          atlases: ['main'],
          clips: { idle: ['idle_', 2], attack1: ['atk_', 3], attackAir: ['air_', 2] },
          extra: { frames: { ...swordFrames('atk_', 3), ...swordFrames('air_', 2, [0.9, 1]) } },
        },
      ],
    });
    const { lib, notes } = setup(world);
    const set = await lib.acquire('player', 'hero');
    expect(set).not.toBeNull();
    expect(Object.keys(set!.def.clips).sort(), 'the blow whose sword is out of the hand is not used').toEqual(['attack1', 'idle']);
    expect(lib.dropped('player', 'hero').map((d) => d.state)).toEqual(['attackAir']);
    expect(notes.join('\n')).toMatch(/clip "attackAir" is left out \(clip "attackAir": the sword grip is not on the right hand/);
  });

  it('leaves out an attack that has no sword anchors at all', async () => {
    const world = new ArtWorld().addPack({
      id: 'player',
      category: 'player',
      atlases: [{ id: 'main', frames: [...names('idle_', 2), ...names('atk_', 2)] }],
      sprites: [{ id: 'hero', atlases: ['main'], clips: { idle: ['idle_', 2], attack1: ['atk_', 2] } }],
    });
    const { lib } = setup(world);
    const set = await lib.acquire('player', 'hero');
    expect(Object.keys(set!.def.clips)).toEqual(['idle']);
    expect(lib.dropped('player', 'hero')[0]!.reason).toMatch(/no "weapon_tip" anchor/);
  });

  it('refuses the whole set when idle (the last resort of every state) is broken', async () => {
    const world = new ArtWorld().addPack(simplePack({ atlases: [{ id: 'main', frames: [...names('idle_', 2), ...names('walk_', 2)] }] }));
    const { lib, notes } = setup(world);
    expect(await lib.acquire('enemies', 'hero')).toBeNull();
    expect(notes.join('\n')).toMatch(/missing frame idle_02/);
    expect([...world.live]).toEqual([]);
  });

  it('refuses a set whose frames do not share one original size: the pivot is a fraction of it', async () => {
    const world = new ArtWorld().addPack(
      simplePack({
        atlases: [
          {
            id: 'main',
            frames: [...names('idle_', 3), ...names('walk_', 2)],
            json: (d) => {
              const frames = d['frames'] as Record<string, Record<string, unknown>>;
              frames['idle_01'] = { frame: { x: 10, y: 0, w: 10, h: 10 }, trimmed: true, spriteSourceSize: { x: 1, y: 1, w: 10, h: 10 }, sourceSize: { w: 12, h: 12 } };
              return d;
            },
          },
        ],
      }),
    );
    const { lib, notes } = setup(world);
    expect(await lib.acquire('enemies', 'hero')).toBeNull();
    expect(notes.join('\n')).toMatch(/do not share one original size/);
  });
});

describe('when the art is in memory: the zone policy', () => {
  const world = (): ArtWorld =>
    new ArtWorld()
      .addPack(simplePack({ id: 'player', category: 'player', load: 'boot' }))
      .addPack(simplePack({ id: 'cave', category: 'environment', load: 'zone', zones: ['r2_hall', 'r3_chamber'] }))
      .addPack(simplePack({ id: 'forest', category: 'environment', load: 'zone', zones: ['r1_gate'] }))
      .addPack(simplePack({ id: 'lab', category: 'vfx', load: 'lazy' }));
  const held = (lib: ArtLibrary<FakeSource, FakeTexture>): string[] => lib.snapshot().packList.filter((p) => p.held).map((p) => p.id).sort();
  const resident = (w: ArtWorld): string[] => [...w.live].map((u) => u.slice(ART_BASE.length).split('/')[0]!).sort();

  it('loads what boots with the game after the first frame, and nothing that is for a zone or for a lab', async () => {
    const w = world();
    const { lib } = setup(w);
    await lib.start();
    expect(held(lib)).toEqual(['player']);
    expect(resident(w)).toEqual(['player']);
    expect(w.requests.some((r) => r.includes('/lab/') || r.includes('/cave/') || r.includes('/forest/'))).toBe(false);
  });

  it('brings in the packs of the zone the hero enters, and lets go of the ones the zone does not need — after the new ones are in', async () => {
    const w = world();
    const { lib } = setup(w);
    await lib.start();
    await lib.enterZone('r1_gate');
    expect(held(lib)).toEqual(['forest', 'player']);
    // while the next zone loads, the old one is still there
    const open = w.hold(w.urls('cave', 'main').image);
    const entering = lib.enterZone('r2_hall');
    await new Promise((r) => setTimeout(r, 5));
    expect(resident(w), 'the old zone stays until the new one is ready').toContain('forest');
    open();
    await entering;
    expect(held(lib)).toEqual(['cave', 'player']);
    expect(resident(w)).toEqual(['cave', 'player']);
    expect(lib.stats().zone).toBe('r2_hall');
  });

  it('a pack two zones share is not fetched twice when the hero walks from one to the other', async () => {
    const w = world();
    const { lib } = setup(w);
    await lib.enterZone('r2_hall');
    const before = w.requests.length;
    await lib.enterZone('r3_chamber');
    expect(w.requests.length, 'not one request more').toBe(before);
    expect(held(lib), 'what boots with the game is wanted in every zone').toEqual(['cave', 'player']);
  });

  it('a zone left behind before its packs arrived frees them when they do: nothing leaks', async () => {
    const w = world();
    const { lib } = setup(w);
    await lib.init();
    const open = w.hold(w.urls('forest', 'main').image);
    const first = lib.enterZone('r1_gate'); // its pack is slow…
    await new Promise((r) => setTimeout(r, 5));
    await lib.enterZone('r2_hall'); // …and the hero is already in R2
    open();
    await first;
    expect(held(lib)).toEqual(['cave', 'player']);
    expect(resident(w)).toEqual(['cave', 'player']);
    expect(lib.stats().sets).toBe(2);
  });

  it('keeps a set that someone still uses when the zone lets go of its pack', async () => {
    const w = world();
    const { lib } = setup(w);
    await lib.enterZone('r1_gate');
    const mine = lib.acquireLoaded('forest', 'hero');
    expect(mine).not.toBeNull();
    await lib.enterZone('r2_hall');
    expect(resident(w)).toContain('forest');
    expect(mine!.textures.get('idle_00')!.destroyed).toBe(false);
    lib.release(mine!.def);
    expect(resident(w)).toEqual(['cave', 'player']);
  });

  it('a lazy pack loads when it is asked for by name, and only then', async () => {
    const w = world();
    const { lib } = setup(w);
    await lib.start();
    expect(await lib.acquire('lab', 'hero')).not.toBeNull();
    expect(resident(w)).toEqual(['lab', 'player']);
  });
});

describe('numbers and the end', () => {
  it('counts what is resident, its peak, the files asked for and how many failed', async () => {
    const w = new ArtWorld().addPack(simplePack());
    const { lib } = setup(w);
    const set = await lib.acquire('enemies', 'hero');
    const before = lib.stats();
    expect(before).toMatchObject({ pages: 1, bytes: 3200, peakBytes: 3200, requests: 4, failures: 0, sets: 1 });
    lib.release(set!.def);
    const after = lib.stats();
    expect(after).toMatchObject({ pages: 0, bytes: 0, peakBytes: 3200 });
  });

  it('dispose frees every image and texture, and what is still on its way is freed when it arrives', async () => {
    const w = new ArtWorld().addPack(simplePack()).addPack(simplePack({ id: 'slow' }));
    const { lib } = setup(w);
    await lib.acquire('enemies', 'hero');
    expect([...w.live]).toHaveLength(1);
    // a second pack is still on its way when the library is disposed
    const open = w.hold(w.urls('slow', 'main').image);
    const pending = lib.acquire('slow', 'hero');
    await new Promise((r) => setTimeout(r, 5));
    lib.dispose();
    open();
    expect(await pending).toBeNull();
    expect([...w.live], 'nothing stays resident').toEqual([]);
    expect(w.textures.every((t) => t.destroyed)).toBe(true);
  });
});
