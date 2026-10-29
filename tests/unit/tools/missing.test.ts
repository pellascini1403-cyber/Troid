import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BOSSES, ENEMIES, PROCEDURAL_LOOKS, ROOMS, WORLD } from '@/content';
import { PLAYER_VISUAL } from '@/content/visuals';
import { environmentSlots } from '@/presentation/environment';
import { encodePng } from '../../../tools/assets/png';
import { formatDelivery, formatEnvironmentDelivery, formatLookDelivery, looksNeeded, readDelivery, readEnvironmentDelivery, readLookDelivery, type LookNeed } from '../../../tools/assets/missing';
import { json, noiseFrame, put } from '../../helpers/artSource';

/**
 * WHAT OF THE PROTAGONIST'S ART HAS BEEN DELIVERED (docs/guides/deliver-protagonist-art.md): computed from the folder the artist hands over and from the game's
 * own list, so that it changes by itself as frames arrive. The frames here are noise: technical fixtures, never art.
 */
let src: string;
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'troid-missing-'));
  src = join(root, 'art');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const declare = (status: string, clips: Record<string, Record<string, unknown>>, extra: Record<string, unknown> = {}): void => {
  put(join(src, 'index.json'), json({ manifestVersion: 1, packs: [{ id: 'player', category: 'player', load: 'boot', manifest: 'player/player.pack.json' }] }));
  put(join(src, 'player', 'player.pack.json'), json({ manifestVersion: 1, id: 'player', category: 'player', status, atlases: [], sprites: [{ id: 'hero', atlases: [], height: 1.7, clips, ...extra }] }));
};
const frame = (name: string): void => put(join(src, 'player', 'hero', `${name}.png`), encodePng(noiseFrame(1, { x: 2, y: 2, w: 6, h: 6 }, 16, 16)));
const row = (r: ReturnType<typeof readDelivery>, state: string) => r.rows.find((x) => x.state === state)!;

describe('readDelivery', () => {
  it('with nothing declared at all, every one of the fifteen clips is missing and none is declared', () => {
    const r = readDelivery(src);
    expect(r).toMatchObject({ pack: 'player', sprite: 'hero', status: 'none', delivered: 0, total: 15 });
    expect(r.rows.map((x) => x.state)).toEqual([...PLAYER_VISUAL.required]);
    expect(r.rows.every((x) => !x.delivered && x.prefix === null)).toBe(true);
  });

  it('knows each clip: the names an artist may use for it, the six to validate first, the blows that need the sword, what loops', () => {
    const r = readDelivery(src);
    expect(row(r, 'attackAir').alsoCalled).toEqual(['aerialAttack', 'airAttack']);
    expect(row(r, 'attackCrouch').alsoCalled).toEqual(['crouchAttack']);
    expect(r.rows.filter((x) => x.first).map((x) => x.state)).toEqual(['idle', 'walk', 'jump', 'dash', 'attack1', 'hurt']);
    expect(r.rows.filter((x) => x.sword).map((x) => x.state)).toEqual(['attack1', 'attack2', 'attackAir', 'attackCrouch']);
    expect(r.rows.filter((x) => !x.once).map((x) => x.state)).toEqual(['idle', 'walk', 'fall', 'crouch']);
  });

  it('while the pack awaits its art nothing is delivered — even with frame files already in the folder', () => {
    declare('awaiting-art', { idle: { frames: 'idle_' }, aerialAttack: { frames: 'aerialAttack_' } });
    frame('idle_00');
    const r = readDelivery(src);
    expect(r.status).toBe('awaiting-art');
    expect(row(r, 'idle')).toMatchObject({ prefix: 'idle_', wanted: 1, missing: [], delivered: false });
    expect(row(r, 'attackAir')).toMatchObject({ prefix: 'aerialAttack_', missing: ['aerialAttack_00'], delivered: false });
    expect(row(r, 'walk').prefix).toBeNull();
    expect(r.delivered).toBe(0);
    expect(formatDelivery(r)).toMatch(/idle .*frames are there but the manifest still says awaiting-art/);
  });

  it('a clip is delivered when it is declared and every frame it names is there; one frame short is a clip that is missing', () => {
    declare('provisional', { idle: { frames: 'idle_', count: 2 }, walk: { frames: 'walk_', count: 3 } });
    for (const f of ['idle_00', 'idle_01', 'walk_00', 'walk_02']) frame(f);
    const r = readDelivery(src);
    expect(row(r, 'idle')).toMatchObject({ delivered: true, wanted: 2, missing: [] });
    expect(row(r, 'walk')).toMatchObject({ delivered: false, wanted: 3, missing: ['walk_01'] });
    expect(r.delivered).toBe(1);
    const text = formatDelivery(r);
    expect(text).toMatch(/Delivered: 1 of 15 clips of its own\. The game draws the other 14 with its placeholder\./);
    expect(text).toMatch(/idle .*delivered \(2 frames\)/);
    expect(text).toMatch(/walk .*MISSING 1 of 3: walk_01/);
    expect(text).toMatch(/jump .*NOT DECLARED in the manifest/);
  });

  it('a clip tagged `stand-in` has frames and the game draws its state with the art — but it is NOT delivered: it shows another clip\'s pose, and the report says so and why', () => {
    declare('provisional', {
      idle: { frames: 'idle_' },
      crouch: { frames: 'crouch_', tags: ['stand-in'], comment: 'reuses the landing crouch' },
      aerialAttack: { frames: 'aerialAttack_', tags: ['sword', 'stand-in'] },
    });
    for (const f of ['idle_00', 'crouch_00', 'aerialAttack_00']) frame(f);
    const r = readDelivery(src);
    expect(row(r, 'idle')).toMatchObject({ delivered: true, standIn: false, standInReason: null });
    expect(row(r, 'crouch')).toMatchObject({ delivered: false, standIn: true, standInReason: 'reuses the landing crouch', missing: [] });
    expect(row(r, 'attackAir')).toMatchObject({ delivered: false, standIn: true, standInReason: null });
    expect(r).toMatchObject({ delivered: 1, standIns: 2, total: 15 });
    const text = formatDelivery(r);
    expect(text).toMatch(/Delivered: 1 of 15 clips of its own\. 2 more are made by moving ANOTHER action's drawing/);
    expect(text).toMatch(/The game draws the other 12 with its placeholder/);
    expect(text).toMatch(/crouch .*STAND-IN, no drawing of its own: reuses the landing crouch/);
    expect(text).toMatch(/attackAir .*STAND-IN, no drawing of its own: it moves another clip's drawing/);
  });

  it('a stand-in with a frame missing is a missing clip, not a stand-in: nothing is hidden by the tag', () => {
    declare('provisional', { idle: { frames: 'idle_' }, crouch: { frames: 'crouch_', tags: ['stand-in'] } });
    frame('idle_00');
    const r = readDelivery(src);
    expect(row(r, 'crouch')).toMatchObject({ delivered: false, standIn: true, missing: ['crouch_00'] });
    expect(r.standIns).toBe(0);
    expect(formatDelivery(r)).toMatch(/crouch .*MISSING 1 of 1: crouch_00/);
  });

  it('the cells of a sheet the manifest cuts count as frames', () => {
    declare('provisional', { idle: { frames: 'idle_', count: 4 } }, { sheets: [{ file: 'idle.png', prefix: 'idle_', frameSize: [16, 16], columns: 2, count: 4 }] });
    expect(row(readDelivery(src), 'idle')).toMatchObject({ delivered: true, wanted: 4 });
  });

  it('under its alternative names a clip is the same clip: `aerialAttack` is `attackAir`', () => {
    declare('final', { aerialAttack: { frames: 'air_', count: 1 }, crouchAttack: { frames: 'cat_', count: 1 } });
    frame('air_00');
    const r = readDelivery(src);
    expect(row(r, 'attackAir')).toMatchObject({ prefix: 'air_', delivered: true });
    expect(row(r, 'attackCrouch')).toMatchObject({ prefix: 'cat_', delivered: false, missing: ['cat_00'] });
  });

  it('says all of it when everything is there, and never throws on a damaged declaration', () => {
    declare('final', Object.fromEntries(PLAYER_VISUAL.required.map((s) => [s, { frames: `${s}_`, count: 1 }])));
    for (const s of PLAYER_VISUAL.required) frame(`${s}_00`);
    const done = readDelivery(src);
    expect(done).toMatchObject({ delivered: 15, standIns: 0, total: 15 });
    expect(formatDelivery(done)).toMatch(/The game draws the protagonist entirely with it\./);
    put(join(src, 'player', 'player.pack.json'), '{ broken');
    expect(() => readDelivery(src)).not.toThrow();
    expect(readDelivery(src).status).toBe('none');
  });
});

/**
 * WHAT OF THE ENVIRONMENT'S ART HAS BEEN DELIVERED (docs/ART-PIPELINE-2D.md, part I): the pieces the four rooms ask for, read from their data, against the sprites of the
 * environment packs in the folder. The frames are noise: technical fixtures, never art.
 */
describe('readEnvironmentDelivery', () => {
  const slots = environmentSlots(WORLD.rooms.map((id) => ROOMS[id]!));
  const REQUIRED = slots.filter((s) => s.required).length;
  const declareScenery = (status: string, sprites: Array<{ id: string; tags: string[] }>, files = true): void => {
    rmSync(join(src, 'forest'), { recursive: true, force: true }); // (each declaration is the whole of the folder)
    put(join(src, 'index.json'), json({ manifestVersion: 1, packs: [{ id: 'forest', category: 'environment', load: 'zone', zones: ['r1_gate'], manifest: 'forest/forest.pack.json' }] }));
    put(
      join(src, 'forest', 'forest.pack.json'),
      json({ manifestVersion: 1, id: 'forest', category: 'environment', status, atlases: [], sprites: sprites.map((x) => ({ id: x.id, atlases: [], height: 1, pivot: [0, 0], tags: x.tags, clips: { idle: { frames: `${x.id}_`, count: 1 } } })) }),
    );
    if (files) for (const x of sprites) put(join(src, 'forest', x.id, `${x.id}_00.png`), encodePng(noiseFrame(1, { x: 2, y: 2, w: 6, h: 6 }, 16, 16)));
  };

  it('with no art folder at all, none of the sixty-six required pieces is delivered, and it says so without throwing', () => {
    const r = readEnvironmentDelivery(join(root, 'nowhere'), slots);
    expect(r).toMatchObject({ packs: [], delivered: 0, total: REQUIRED });
    expect(REQUIRED).toBe(66);
    expect(r.rows.every((x) => !x.delivered)).toBe(true);
  });

  it('a piece is delivered when its sprite says what it draws, its frame is there and its pack no longer awaits its art', () => {
    declareScenery('provisional', [{ id: 'stone_fill', tags: ['role:solid', 'material:stone', 'part:fill'] }, { id: 'stone_cap', tags: ['role:solid', 'material:stone', 'part:cap'] }]);
    const r = readEnvironmentDelivery(src, slots);
    expect(r.packs).toEqual([{ id: 'forest', status: 'provisional' }]);
    expect(r.delivered).toBe(1); // (the cap is delivered too, but it is optional: only required pieces are counted)
    expect(r.rows.find((x) => x.slot.role === 'solid' && x.slot.subject === 'stone' && x.slot.part === 'fill')).toMatchObject({ delivered: true, by: 'forest/stone_fill' });
    expect(r.rows.find((x) => x.slot.role === 'solid' && x.slot.subject === 'stone' && x.slot.part === 'cap')?.delivered).toBe(true);
    expect(r.rows.find((x) => x.slot.role === 'solid' && x.slot.subject === 'earth' && x.slot.part === 'fill')?.delivered).toBe(false);
  });

  it('nothing is delivered while the pack awaits its art, or when the frame is not there, or when the sprite does not say what it draws', () => {
    declareScenery('awaiting-art', [{ id: 'stone_fill', tags: ['role:solid', 'material:stone', 'part:fill'] }]);
    expect(readEnvironmentDelivery(src, slots).delivered).toBe(0);
    declareScenery('provisional', [{ id: 'stone_fill', tags: ['role:solid', 'material:stone', 'part:fill'] }], false);
    expect(readEnvironmentDelivery(src, slots).delivered).toBe(0);
    declareScenery('provisional', [{ id: 'stone_fill', tags: [] }, { id: 'odd', tags: ['role:tree'] }]);
    expect(readEnvironmentDelivery(src, slots).delivered).toBe(0);
  });

  it('a pickup is delivered by the variant it says it is (the bottle, the card, the rune), and one with no variant serves them all', () => {
    const pickup = (id: string, variant: string | null) => ({ id, tags: ['role:interactive', 'kind:pickup', ...(variant ? [`variant:${variant}`] : [])] });
    const row = (r: ReturnType<typeof readEnvironmentDelivery>, variant: string) => r.rows.find((x) => x.slot.role === 'interactive' && x.slot.subject === 'pickup' && x.slot.part === variant);
    declareScenery('provisional', [pickup('vial', 'bottle'), pickup('card', 'card')]);
    const some = readEnvironmentDelivery(src, slots);
    expect(row(some, 'bottle')).toMatchObject({ delivered: true, by: 'forest/vial' });
    expect(row(some, 'card')).toMatchObject({ delivered: true, by: 'forest/card' });
    expect(row(some, 'rune')?.delivered).toBe(false);
    declareScenery('provisional', [pickup('anything', null)]);
    const all = readEnvironmentDelivery(src, slots);
    expect(['bottle', 'card', 'rune'].map((v) => row(all, v)?.by)).toEqual(['forest/anything', 'forest/anything', 'forest/anything']);
  });

  it('says it all in words for a person, and where to read how to deliver it', () => {
    declareScenery('provisional', [{ id: 'stone_fill', tags: ['role:solid', 'material:stone', 'part:fill'] }]);
    const text = formatEnvironmentDelivery(readEnvironmentDelivery(src, slots));
    expect(text).toMatch(/pack "forest" \(provisional\)/);
    expect(text).toMatch(/Delivered: 1 of 66 required pieces\. The game draws the rest with its blockout\./);
    expect(text).toMatch(/solid stone · fill .*required .*delivered \(forest\/stone_fill\)/);
    expect(text).toMatch(/solid earth · fill .*required .*NOT DELIVERED/);
    expect(text).toMatch(/solid stone · cap .*optional/);
    expect(text).toMatch(/deliver-environment-art\.md/);
    expect(formatEnvironmentDelivery(readEnvironmentDelivery(join(root, 'nowhere'), slots))).toMatch(/no pack of it in art\//);
  });
});


/**
 * WHAT OF THE CREATURES' AND THE GUARDIANS' ART HAS BEEN DELIVERED (docs/PROMPT22-LOG.md §10): the looks the world's rooms place, read from the game's own data, against the packs of the `enemies` category. Until art comes the game draws all of them with shapes
 * (a silhouette by code) — and the report says so, with where each one stands and how big it is, so that the day someone paints one the request is exactly what it needs.
 */
describe('looksNeeded', () => {
  const needs = looksNeeded({ enemies: ENEMIES, bosses: BOSSES, rooms: ROOMS, order: WORLD.rooms, looks: PROCEDURAL_LOOKS });
  const byKind = (k: LookNeed['kind']) => needs.filter((n) => n.kind === k);

  it('lists every creature of the game, the ten guardians of the engine (six of the first half, four of the second) and the Warden — and nothing else', () => {
    expect(byKind('creature').map((n) => n.id).sort()).toEqual(Object.values(ENEMIES).map((e) => ('proceduralId' in e.view ? e.view.proceduralId : '')).sort());
    expect(byKind('engine-boss').map((n) => n.id).sort()).toEqual(['boss_behemoth', 'boss_bell_warden', 'boss_cinder_sovereign', 'boss_colossus', 'boss_engine', 'boss_gardener', 'boss_mire_matriarch', 'boss_root_tyrant', 'boss_shepherd', 'boss_sovereign']);
    expect(byKind('warden').map((n) => n.id)).toEqual(['ink_warden']);
    expect(byKind('creature')).toHaveLength(25);
    expect(needs).toHaveLength(36);
  });

  it('says where each one is placed — in the order of the world — and the placements add up to every spawn and every boss of every room', () => {
    const total = WORLD.rooms.reduce((n, id) => n + (ROOMS[id]!.spawns?.length ?? 0) + (ROOMS[id]!.bosses?.length ?? 0), 0);
    expect(needs.reduce((n, x) => n + x.placements, 0)).toBe(total);
    for (const need of needs) {
      expect(need.rooms.every((r) => WORLD.rooms.includes(r)), need.id).toBe(true);
      expect(need.rooms.map((r) => WORLD.rooms.indexOf(r)), `${need.id}: in the order of the world`).toEqual([...need.rooms.map((r) => WORLD.rooms.indexOf(r))].sort((a, b) => a - b));
    }
    expect(needs.find((n) => n.id === 'ink_slime')).toMatchObject({ rooms: ['r1_gate', 'r2_hall'], placements: 2 });
    expect(needs.find((n) => n.id === 'ink_warden')).toMatchObject({ rooms: ['r4_sanctum'], placements: 1 });
    // a boss is placed once, in its own arena; the crystal shard is made by another creature when it breaks, so it is placed nowhere
    for (const boss of byKind('engine-boss')) expect(boss, boss.id).toMatchObject({ placements: 1 });
    expect(needs.find((n) => n.id === 'crystal_shard')).toMatchObject({ rooms: [], placements: 0 });
  });

  it('gives each one the size its shapes have today (what the body of the art should fill) and the contract of its art', () => {
    for (const need of byKind('creature')) expect(need.size, need.id).toEqual({ width: PROCEDURAL_LOOKS[need.id]!.width, height: PROCEDURAL_LOOKS[need.id]!.height });
    expect(needs.find((n) => n.id === 'boss_root_tyrant')!.size).toEqual({ width: 3, height: 4.2 });
    expect(byKind('creature')[0]!.parts).toEqual(['body', 'flash', 'eyes', 'sigil', 'spines', 'pool']);
    expect(byKind('creature')[0]!.anchors).toEqual(['head', 'vfx_origin']);
    expect(byKind('engine-boss')[0]!.parts).toEqual(['body', 'flash', 'eyes', 'sigil', 'spines', 'pool']); // (an ink creature's body at the size of a room)
    expect(byKind('warden')[0]).toMatchObject({ parts: ['body', 'eye', 'crest', 'shard', 'pool'], anchors: [] });
  });
});

describe('readLookDelivery', () => {
  const need = (id: string, kind: LookNeed['kind'] = 'creature', rooms = ['r1_gate']): LookNeed => ({
    id, kind, parts: kind === 'warden' ? ['body', 'eye', 'crest', 'shard', 'pool'] : ['body', 'flash', 'eyes', 'sigil', 'spines', 'pool'], anchors: kind === 'warden' ? [] : ['head', 'vfx_origin'], size: { width: 1, height: 1 }, rooms, placements: rooms.length,
  });
  const CREATURE = ['body', 'flash', 'eyes', 'sigil', 'spines', 'pool'];
  const WARDEN = ['body', 'eye', 'crest', 'shard', 'pool'];
  interface Set { part: string; tag: 'enemy' | 'boss'; look: string; anchors?: Record<string, [number, number]>; frames?: boolean }
  const declareLooks = (status: string, zones: string[], sets: Set[]): void => {
    rmSync(join(src, 'beasts'), { recursive: true, force: true });
    put(join(src, 'index.json'), json({ manifestVersion: 1, packs: [{ id: 'beasts', category: 'enemies', load: 'zone', zones, manifest: 'beasts/beasts.pack.json' }] }));
    put(
      join(src, 'beasts', 'beasts.pack.json'),
      json({ manifestVersion: 1, id: 'beasts', category: 'enemies', status, atlases: [], sprites: sets.map((x) => ({ id: `${x.look}_${x.part}`, atlases: [], height: 1, tags: [`${x.tag}:${x.look}`, `part:${x.part}`], ...(x.anchors ? { anchors: x.anchors } : {}), clips: { idle: { frames: `${x.look}_${x.part}_`, count: 1 } } })) }),
    );
    for (const x of sets) if (x.frames !== false) put(join(src, 'beasts', `${x.look}_${x.part}`, `${x.look}_${x.part}_00.png`), encodePng(noiseFrame(1, { x: 2, y: 2, w: 6, h: 6 }, 16, 16)));
  };
  const whole = (look: string, tag: 'enemy' | 'boss' = 'enemy'): Set[] =>
    (tag === 'enemy' ? CREATURE : WARDEN).map((part) => ({ part, tag, look, ...(part === 'body' && tag === 'enemy' ? { anchors: { head: [0.3, 0.6] as [number, number], vfx_origin: [0, 0.4] as [number, number] } } : {}) }));

  it('with no art folder at all, nobody is delivered, and it says so without throwing', () => {
    const r = readLookDelivery(join(root, 'nowhere'), [need('a'), need('b', 'warden')]);
    expect(r).toMatchObject({ packs: [], delivered: 0, total: 2 });
    expect(r.rows.every((x) => !x.delivered && x.pack === null && x.lacking.length > 0)).toBe(true);
    expect(formatLookDelivery(r)).toMatch(/no pack of it in art\//);
  });

  it('a creature is delivered when every part of it is drawn, the body says both anchors, the pack does not await its art and its zones cover the rooms it stands in', () => {
    declareLooks('provisional', ['r1_gate'], whole('ember'));
    const r = readLookDelivery(src, [need('ember'), need('other')]);
    expect(r.rows[0]).toMatchObject({ delivered: true, lacking: [], anchorsLacking: [], outsideZones: [], pack: 'beasts', status: 'provisional' });
    expect(r.rows[0]!.drawn['pool']).toBe('beasts/ember_pool');
    expect(r.rows[1]).toMatchObject({ delivered: false, pack: null });
    expect(r.delivered).toBe(1);
  });

  it('a part short, a frame not there, a body that says no anchor, a pack that awaits its art, a room outside the pack\'s zones: each one keeps it from being delivered, and the report says which', () => {
    declareLooks('provisional', ['r1_gate'], whole('ember').filter((x) => x.part !== 'sigil'));
    expect(readLookDelivery(src, [need('ember')]).rows[0]).toMatchObject({ delivered: false, lacking: ['sigil'] });
    declareLooks('provisional', ['r1_gate'], whole('ember').map((x) => (x.part === 'eyes' ? { ...x, frames: false } : x)));
    expect(readLookDelivery(src, [need('ember')]).rows[0]).toMatchObject({ delivered: false, lacking: ['eyes'] });
    declareLooks('provisional', ['r1_gate'], whole('ember').map((x) => (x.part === 'body' ? { part: 'body', tag: 'enemy' as const, look: 'ember', anchors: { head: [0.3, 0.6] as [number, number] } } : x)));
    expect(readLookDelivery(src, [need('ember')]).rows[0]).toMatchObject({ delivered: false, lacking: [], anchorsLacking: ['vfx_origin'] });
    declareLooks('awaiting-art', ['r1_gate'], whole('ember'));
    expect(readLookDelivery(src, [need('ember')]).rows[0]).toMatchObject({ delivered: false, pack: null });
    declareLooks('provisional', ['r1_gate'], whole('ember'));
    const far = readLookDelivery(src, [need('ember', 'creature', ['r1_gate', 'ru_nave', 'mn_hall'])]).rows[0]!;
    expect(far).toMatchObject({ delivered: false, lacking: [], outsideZones: ['ru_nave', 'mn_hall'] });
    expect(formatLookDelivery(readLookDelivery(src, [need('ember', 'creature', ['r1_gate', 'ru_nave'])]))).toMatch(/zones of "beasts" miss ru_nave/);
  });

  it('a creature\'s art does not stand for a guardian\'s and the other way round: each is read under its own tags (`enemy:` for creatures and guardians of the engine, `boss:` for the Warden)', () => {
    declareLooks('provisional', ['r1_gate'], [...whole('ember'), ...whole('warden_like', 'boss')]);
    const r = readLookDelivery(src, [need('ember'), need('warden_like', 'warden'), need('warden_like'), need('ember', 'warden')]);
    expect(r.rows.map((x) => x.delivered)).toEqual([true, true, false, false]);
  });

  it('says it all in words for a person: how many are drawn by art, where each one stands, how big it is, and where to read how to deliver it', () => {
    declareLooks('provisional', ['r1_gate'], whole('ember'));
    const text = formatLookDelivery(readLookDelivery(src, [need('ember'), need('plain', 'engine-boss', ['rt_arena']), need('shard', 'creature', [])]));
    expect(text).toMatch(/pack "beasts" \(provisional\)/);
    expect(text).toMatch(/Delivered: 1 of 3 looks\. The game draws the other 2 with shapes/);
    expect(text).toMatch(/ember .*creature .*delivered \(beasts, provisional\)/);
    expect(text).toMatch(/plain .*guardian \(engine\) .*rt_arena .*shapes only — NOT DELIVERED/);
    expect(text).toMatch(/shard .*\(made in a fight\)/);
    expect(text).toMatch(/deliver-environment-art\.md/);
  });

  it('the repository\'s own art draws only looks the game really places: no pack paints a creature that does not exist', () => {
    const needs = looksNeeded({ enemies: ENEMIES, bosses: BOSSES, rooms: ROOMS, order: WORLD.rooms, looks: PROCEDURAL_LOOKS });
    const real = readLookDelivery(join(fileURLToPath(new URL('../../../', import.meta.url)), 'art'), needs);
    expect(real.packs.map((p) => p.id).sort()).toEqual(['ink-slime', 'ink-warden']);
    for (const p of real.packs) expect(p.status, `${p.id} is made by the repository's generator, not by a person`).toBe('provisional');
    expect(real.rows.filter((r) => r.pack !== null).map((r) => r.need.id).sort()).toEqual(['ink_slime', 'ink_warden']);
    // every look the game places has a row, and every one that has art is complete
    for (const r of real.rows.filter((x) => x.pack !== null)) expect(r, r.need.id).toMatchObject({ delivered: true });
  });
});
