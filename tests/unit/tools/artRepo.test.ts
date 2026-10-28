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
 * THE ART IN THE REPOSITORY (docs/ART-PIPELINE-2D.md, parts E, L and M; docs/PROMPT16-LOG.md): whatever `art/` declares must build, and whatever `public/art` ships must verify — the very check
 * `npm run build` runs before a browser is ever opened, held in the unit tests too so that a broken asset cannot be committed unnoticed. What is there today is the
 * protagonist, made from the user's character sheet (`art/player/source/character-sheet.png`), provisional: 44 frames in twelve clips, every pixel one of the user's drawings (the background taken off, one scale per clip,
 * a translation: nothing redrawn); the sheet has no drawing for five of the fifteen clips the game asks of it (and one more the pipeline makes), and those are NOT declared, said by name below — the game draws their
 * states with its placeholder, never with a stand-in; and the scenery of the four rooms (the six `ruins-*` packs, painted by `tools/art`: every piece of the environment the world asks for is delivered). The enemies, the boss and the effects have no
 * art in the repository yet, and that is said, not hidden: `STILL_THE_BLOCKOUT` lists what the world asks for of the ENVIRONMENT and the art does not have (empty since the phase that dressed R4), and
 * `NOT_IN_THE_SHEET` lists the clips of the protagonist the sheet has no drawing for.
 */
const root = fileURLToPath(new URL('../../../', import.meta.url));
/** Packing the art of the repository is real work (a minute on a slow machine, with eighteen packs): the tests that do it say so. */
const PACKING = 120_000;
/** Verifying it decodes every page of every atlas the game fetches (3 s here, twice that on the CI runner): its limit is not the default five seconds. */
const VERIFYING = 60_000;
/**
 * What the rooms of the world ask of the environment and no pack has yet: the blockout draws each of these. EMPTY: the wall of split stone and the lever of a shortcut — the two things the 56 rooms of Prompt 21 asked for that nothing
 * painted — are delivered by `ruins-parts` (docs/PROMPT23-LOG.md §5), and every zone has the backdrop and the ground of its own.
 */
const STILL_THE_BLOCKOUT: string[] = [];
/** The states the game asks of the protagonist that the character sheet has no drawing for (in the engine's names: the manifest would say `aerialAttack` and `crouchAttack`): not declared, drawn with the placeholder. */
const NOT_IN_THE_SHEET = ['attack2', 'attackAir', 'crouch', 'attackCrouch', 'drink'] as const;
/** What the game asks of the protagonist and the sheet has: the other ten of the fifteen. */
const IN_THE_SHEET = PLAYER_VISUAL.required.filter((state) => !(NOT_IN_THE_SHEET as readonly string[]).includes(state));

/** One dry build of the repository's art, shared by the tests that only read it. */
let dry: ReturnType<typeof buildArt> | undefined;
const dryBuild = (): ReturnType<typeof buildArt> => (dry ??= buildArt({ srcDir: join(root, 'art'), outDir: join(root, 'public', 'art'), write: false }));

describe('the art of the repository', () => {
  it('builds without a single error (nothing is written)', () => {
    const r = dryBuild();
    expect(r.issues.filter((i) => i.level === 'error').map((i) => `${i.path}: ${i.message}`)).toEqual([]);
    expect(r.ok).toBe(true);
  }, PACKING);

  it('declares the protagonist\'s sprite set `player/hero` — the ten clips of the fifteen the sheet has a drawing for, plus the landing and the run — as a provisional pack that ships; the clips it has no drawing for are NOT declared', () => {
    const raw = JSON.parse(readFileSync(join(root, 'art', 'player', 'player.pack.json'), 'utf8')) as Record<string, unknown>;
    // read the way the packer reads a source manifest: the atlases are what the packer writes
    const sprites = (raw['sprites'] as Array<Record<string, unknown>>).map((sp) => ({ ...sp, atlases: [] }));
    const { value, issues } = parseArtPack({ ...raw, status: 'awaiting-art', atlases: [], sprites });
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(raw['status']).toBe('provisional');
    expect(value).toMatchObject({ id: PLAYER_VISUAL.art.pack, category: 'player' });
    const hero = value!.sprites.find((s) => s.id === PLAYER_VISUAL.art.sprite)!;
    expect(Object.keys(hero.clips).sort()).toEqual([...IN_THE_SHEET, 'land', 'run'].sort());
    for (const state of NOT_IN_THE_SHEET) expect(hero.clips[state], `${state} is not declared: the sheet has no drawing for it`).toBeUndefined();
    // nothing in the manifest is a stand-in (a clip made by moving another action's drawing): what the art has is the sheet's own
    expect(Object.values(hero.clips).filter((c) => c!.tags.includes('stand-in'))).toEqual([]);
    expect(hero.height).toBe(1.7);
    expect(hero.missingClips, 'what the art lacks is drawn with the placeholder, not by chaining to the idle').toBe('placeholder');
    // the six to validate first are tagged as such in the declaration, and the blow carries the sword
    expect(Object.entries(hero.clips).filter(([, c]) => c!.tags.includes('first')).map(([s]) => s).sort()).toEqual([...PLAYER_VISUAL.first].sort());
    expect(Object.entries(hero.clips).filter(([, c]) => c!.tags.includes('sword')).map(([s]) => s).sort()).toEqual(['attack1']);
    // 44 frames in all, every one of them a file of the folder, and the folder has nothing else
    const files = readdirSync(join(root, 'art', 'player', 'hero')).filter((f) => f.endsWith('.png'));
    expect(files).toHaveLength(44);
    expect(Object.values(hero.clips).reduce((n, c) => n + c!.count, 0)).toBe(44);
    // the protagonist, the scenery of the Ruins and the parts of the shortcuts, the boss, the Ink Slime, the light of the effects (shapes and flipbooks) and the set of each of the six zones after the Ruins: all provisional, all shipped
    expect(dryBuild().packs.map((p) => [p.id, p.status, p.shipped])).toEqual([
      ['player', 'provisional', true],
      ['ruins-ground', 'provisional', true],
      ['ruins-back', 'provisional', true],
      ['ruins-light', 'provisional', true],
      ['ruins-roots', 'provisional', true],
      ['ruins-seal', 'provisional', true],
      ['ruins-sanctum', 'provisional', true],
      ['ink-warden', 'provisional', true],
      ['ink-slime', 'provisional', true],
      ['vfx-shapes', 'provisional', true],
      ['vfx-flipbooks', 'provisional', true],
      ['ruins-parts', 'provisional', true],
      ['zone-roots', 'provisional', true],
      ['zone-mire', 'provisional', true],
      ['zone-mines', 'provisional', true],
      ['zone-spire', 'provisional', true],
      ['zone-foundry', 'provisional', true],
      ['zone-heart', 'provisional', true],
    ]);
    expect(existsSync(join(root, 'public', 'art', 'index.json')), 'the generated folder is committed: the game fetches it').toBe(true);
  }, PACKING);

  it('says exactly what is missing: of the fifteen clips, ten have a drawing of their own (the sheet\'s poses) and five do not — none is a stand-in, none is faked: the game draws those states with the placeholder', () => {
    const d = readDelivery(join(root, 'art'));
    expect(d).toMatchObject({ pack: 'player', sprite: 'hero', status: 'provisional', delivered: 10, standIns: 0, total: 15 });
    expect(d.rows.filter((row) => row.delivered).map((row) => row.state).sort()).toEqual([...IN_THE_SHEET].sort());
    expect(d.rows.filter((row) => !row.delivered).map((row) => row.state).sort()).toEqual([...NOT_IN_THE_SHEET].sort());
    // the ones that are not delivered are not declared at all (no stand-in, no frame): that is what `assets:missing` says, and what the placeholder is for
    for (const row of d.rows.filter((r) => !r.delivered)) expect({ state: row.state, prefix: row.prefix, standIn: row.standIn }, 'not declared, not a stand-in').toEqual({ state: row.state, prefix: null, standIn: false });
    for (const row of d.rows.filter((r) => r.delivered)) expect(row.missing, `${row.state}: every frame it names is there`).toEqual([]);
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

  it('verifies: what the game fetches is a valid art folder, with no warning but the one that says which clips of the protagonist the sheet does not have: every piece of the environment the world asks for is delivered', () => {
    const v = verifyArtFolder(join(root, 'public', 'art'));
    const lacking = `warn player sprites.hero: the protagonist's art lacks ${NOT_IN_THE_SHEET.length} of the 15 clips the game asks of it: ${NOT_IN_THE_SHEET.join(', ')} — the placeholder draws those states`;
    expect(v.issues.filter((i) => i.level !== 'info').map((i) => `${i.level} ${i.path}: ${i.message}`)).toEqual([lacking, ...STILL_THE_BLOCKOUT]);
    expect(v.ok).toBe(true);
  }, VERIFYING);
});
