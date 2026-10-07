import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ROOMS, WORLD } from '@/content';
import { PLAYER_VISUAL } from '@/content/visuals';
import { environmentSlots } from '@/presentation/environment';
import { encodePng } from '../../../tools/assets/png';
import { formatDelivery, formatEnvironmentDelivery, readDelivery, readEnvironmentDelivery } from '../../../tools/assets/missing';
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
    expect(text).toMatch(/Delivered: 1 of 15 clips\. The game draws the rest with its placeholder\./);
    expect(text).toMatch(/idle .*delivered \(2 frames\)/);
    expect(text).toMatch(/walk .*MISSING 1 of 3: walk_01/);
    expect(text).toMatch(/jump .*NOT DECLARED in the manifest/);
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
    expect(done).toMatchObject({ delivered: 15, total: 15 });
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

  it('with no art folder at all, none of the twelve required pieces is delivered, and it says so without throwing', () => {
    const r = readEnvironmentDelivery(join(root, 'nowhere'), slots);
    expect(r).toMatchObject({ packs: [], delivered: 0, total: REQUIRED });
    expect(REQUIRED).toBe(12);
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

  it('says it all in words for a person, and where to read how to deliver it', () => {
    declareScenery('provisional', [{ id: 'stone_fill', tags: ['role:solid', 'material:stone', 'part:fill'] }]);
    const text = formatEnvironmentDelivery(readEnvironmentDelivery(src, slots));
    expect(text).toMatch(/pack "forest" \(provisional\)/);
    expect(text).toMatch(/Delivered: 1 of 12 required pieces\. The game draws the rest with its blockout\./);
    expect(text).toMatch(/solid stone · fill .*required .*delivered \(forest\/stone_fill\)/);
    expect(text).toMatch(/solid earth · fill .*required .*NOT DELIVERED/);
    expect(text).toMatch(/solid stone · cap .*optional/);
    expect(text).toMatch(/deliver-environment-art\.md/);
    expect(formatEnvironmentDelivery(readEnvironmentDelivery(join(root, 'nowhere'), slots))).toMatch(/no pack of it in art\//);
  });
});
