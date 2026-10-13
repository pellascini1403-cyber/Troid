import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PLAYER_VISUAL } from '@/content/visuals';
import { parseArtPack } from '@/presentation/artManifest';
import { buildArt } from '../../../tools/assets/build';
import { readDelivery } from '../../../tools/assets/missing';
import { decodePng } from '../../../tools/assets/png';
import { verifyArtFolder } from '../../../tools/assets/verify';

/**
 * THE ART IN THE REPOSITORY (docs/ART-PIPELINE-2D.md, parts E, L and M): whatever `art/` declares must build, and whatever `public/art` ships must verify — the very check
 * `npm run build` runs before a browser is ever opened, held in the unit tests too so that a broken asset cannot be committed unnoticed. What is there today is the
 * protagonist, made from the user's own pose sheet (`art/player/source`), provisional: one frame per clip, eight of the fifteen clips stand-ins that reuse another
 * pose; and the scenery of the first three rooms (the five `ruins-*` packs, painted by `tools/art`). The rest of the rooms' pieces, the enemies, the boss and the effects have no
 * art in the repository yet, and that is said, not hidden: `STILL_THE_BLOCKOUT` lists what the world asks for and the art does not have, and shrinks as the phases deliver it.
 */
const root = fileURLToPath(new URL('../../../', import.meta.url));
/** Packing the art of the repository is real work (a few seconds): the tests that do it say so. */
const PACKING = 120_000;
/** What the rooms of the world ask of the environment and no pack has yet: the blockout draws each of these. Empty when the world is fully dressed. */
const STILL_THE_BLOCKOUT = [
  'warn environment ruins-ground + ruins-back + ruins-light + ruins-roots + ruins-seal: the world asks for the interactive "pickup" of variant "rune" (r4_sanctum) and the pack does not have it: the blockout draws it',
];

/** One dry build of the repository's art, shared by the tests that only read it. */
let dry: ReturnType<typeof buildArt> | undefined;
const dryBuild = (): ReturnType<typeof buildArt> => (dry ??= buildArt({ srcDir: join(root, 'art'), outDir: join(root, 'public', 'art'), write: false }));

describe('the art of the repository', () => {
  it('builds without a single error (nothing is written)', () => {
    const r = dryBuild();
    expect(r.issues.filter((i) => i.level === 'error').map((i) => `${i.path}: ${i.message}`)).toEqual([]);
    expect(r.ok).toBe(true);
  }, PACKING);

  it('declares the protagonist\'s sprite set `player/hero` — the fifteen clips the game asks of it, and the landing — as a provisional pack that ships', () => {
    const raw = JSON.parse(readFileSync(join(root, 'art', 'player', 'player.pack.json'), 'utf8')) as Record<string, unknown>;
    // read the way the packer reads a source manifest: the atlases are what the packer writes
    const sprites = (raw['sprites'] as Array<Record<string, unknown>>).map((sp) => ({ ...sp, atlases: [] }));
    const { value, issues } = parseArtPack({ ...raw, status: 'awaiting-art', atlases: [], sprites });
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(raw['status']).toBe('provisional');
    expect(value).toMatchObject({ id: PLAYER_VISUAL.art.pack, category: 'player' });
    const hero = value!.sprites.find((s) => s.id === PLAYER_VISUAL.art.sprite)!;
    // the clips of the delivery (the manifest says `aerialAttack` and `crouchAttack`; the engine reads them as `attackAir` and `attackCrouch`), plus the landing the sheet has a pose for
    expect(Object.keys(hero.clips).sort()).toEqual([...PLAYER_VISUAL.required, 'land'].sort());
    expect(hero.height).toBe(1.7);
    // the six to validate first are tagged as such in the declaration, and the four blows carry the sword
    expect(Object.entries(hero.clips).filter(([, c]) => c!.tags.includes('first')).map(([s]) => s).sort()).toEqual([...PLAYER_VISUAL.first].sort());
    expect(Object.entries(hero.clips).filter(([, c]) => c!.tags.includes('sword')).map(([s]) => s).sort()).toEqual(['attack1', 'attack2', 'attackAir', 'attackCrouch']);
    // the protagonist and the scenery of the first room: all provisional, all shipped
    expect(dryBuild().packs.map((p) => [p.id, p.status, p.shipped])).toEqual([
      ['player', 'provisional', true],
      ['ruins-ground', 'provisional', true],
      ['ruins-back', 'provisional', true],
      ['ruins-light', 'provisional', true],
      ['ruins-roots', 'provisional', true],
      ['ruins-seal', 'provisional', true],
    ]);
    expect(existsSync(join(root, 'public', 'art', 'index.json')), 'the generated folder is committed: the game fetches it').toBe(true);
  }, PACKING);

  it('says exactly what is missing: of the fifteen clips, seven have art of their own (the sheet\'s poses); the other eight show another clip\'s pose; none is the placeholder', () => {
    const d = readDelivery(join(root, 'art'));
    expect(d).toMatchObject({ pack: 'player', sprite: 'hero', status: 'provisional', delivered: 7, standIns: 8, total: 15 });
    expect(d.rows.filter((row) => row.delivered).map((row) => row.state).sort()).toEqual(['attack1', 'cast', 'fall', 'hurt', 'idle', 'jump', 'walk']);
    expect(d.rows.filter((row) => row.standIn).map((row) => row.state).sort()).toEqual(['attack2', 'attackAir', 'attackCrouch', 'crouch', 'dash', 'death', 'drink', 'interact']);
    expect(d.rows.every((row) => row.prefix !== null && row.missing.length === 0)).toBe(true);
    expect(d.rows.filter((row) => row.standIn).every((row) => (row.standInReason ?? '').length > 0), 'every stand-in says what it reuses and why').toBe(true);
  });

  it('ships what `npm run assets:pack` writes from `art/`: nobody forgot to pack, nobody edited the generated folder', () => {
    const base = mkdtempSync(join(tmpdir(), 'troid-pack-'));
    const tmp = join(base, 'art');
    try {
      const r = buildArt({ srcDir: join(root, 'art'), outDir: tmp, write: true });
      expect(r.issues.filter((i) => i.level === 'error').map((i) => `${i.path}: ${i.message}`)).toEqual([]);
      expect(r.ok).toBe(true);
      const files = (dir: string, base = ''): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f), `${base}${f}/`) : [`${base}${f}`]));
      const wanted = files(tmp).sort();
      expect(files(join(root, 'public', 'art')).sort()).toEqual(wanted);
      for (const f of wanted) {
        const a = readFileSync(join(tmp, f));
        const b = readFileSync(join(root, 'public', 'art', f));
        if (f.endsWith('.png')) {
          const pa = decodePng(a);
          const pb = decodePng(b);
          expect({ f, w: pb.width, h: pb.height }).toEqual({ f, w: pa.width, h: pa.height });
          expect(Buffer.compare(Buffer.from(pa.data), Buffer.from(pb.data)), `${f} is not what the packer writes`).toBe(0);
        } else expect(b.toString('utf8'), `${f} is not what the packer writes`).toBe(a.toString('utf8'));
      }
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  }, PACKING);

  it('verifies: what the game fetches is a valid art folder, with no warning but the pieces of the world that are still the blockout\'s', () => {
    const v = verifyArtFolder(join(root, 'public', 'art'));
    expect(v.issues.filter((i) => i.level !== 'info').map((i) => `${i.level} ${i.path}: ${i.message}`)).toEqual(STILL_THE_BLOCKOUT);
    expect(v.ok).toBe(true);
  });
});
