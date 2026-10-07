import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PLAYER_VISUAL } from '@/content/visuals';
import { encodePng } from '../../../tools/assets/png';
import { formatDelivery, readDelivery } from '../../../tools/assets/missing';
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
