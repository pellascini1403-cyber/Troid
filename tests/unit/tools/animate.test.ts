import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { animate } from '../../../tools/assets/animate';
import { buildHeroAnimation, keptFrom, type RigFile, type SheetSpec } from '../../../tools/assets/heroAnimation';
import { decodePng, encodePng } from '../../../tools/assets/png';

/**
 * `npm run assets:animate`, run on a COPY of the sources (docs/ART-PIPELINE-2D.md part N): it writes what the sheet, the rig and the clips produce, `--check` says whether that is what is
 * there, and — the day a stand-in gets a drawing of its own — a clip the rig lists as `delivered` is the artist's: not made, not deleted, its entry of the manifest carried over as written.
 */
const root = fileURLToPath(new URL('../../../', import.meta.url));
const source = join(root, 'art', 'player', 'source');
let dir = '';
let specPath = '';
const out = (...p: string[]): string => join(dir, 'hero', ...p);
const manifestFile = (): string => join(dir, 'player.pack.json');
const readManifest = (): { comment: string; sprites: Array<{ clips: Record<string, { frames: string; count: number; fps: number; loop: boolean; tags: string[]; comment: string }>; frames: Record<string, unknown> }> } => JSON.parse(readFileSync(manifestFile(), 'utf8')) as never;
const quiet = { log: () => undefined, error: () => undefined };
const errors: string[] = [];
const noisy = { log: () => undefined, error: (line: string) => void errors.push(line) };

/** A tiny frame of the artist's own: any picture will do, it is never decoded as the protagonist. */
const handDrawn = (shade: number): Buffer => {
  const data = new Uint8Array(16 * 16 * 4);
  for (let i = 0; i < 16 * 16; i++) data.set([shade, 40, 90, 255], i * 4);
  return encodePng({ width: 16, height: 16, data });
};

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'troid-animate-'));
  mkdirSync(join(dir, 'source'), { recursive: true });
  for (const f of ['hero-sheet.png', 'hero.poses.json', 'hero.rig.json']) copyFileSync(join(source, f), join(dir, 'source', f));
  specPath = join(dir, 'source', 'hero.poses.json');
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('assets:animate', () => {
  it('writes every frame and the manifest; a stray file, a missing frame and a changed manifest are each drift', () => {
    const made = animate({ specPath, check: false, ...quiet });
    expect(made.written).toBe(114);
    expect(readdirSync(out()).filter((f) => f.endsWith('.png'))).toHaveLength(114);
    const sprite = readManifest().sprites[0]!;
    expect(Object.keys(sprite.clips)).toHaveLength(18);
    expect(sprite.clips['dash']!.tags).toContain('stand-in');

    // one of each kind of drift, and exactly those three: what was just written is what the sources produce
    const idle3 = readFileSync(out('idle_03.png'));
    const manifestText = readFileSync(manifestFile(), 'utf8');
    writeFileSync(out('stray_00.png'), handDrawn(10));
    rmSync(out('idle_03.png'));
    writeFileSync(manifestFile(), `${manifestText}\n`);
    expect(animate({ specPath, check: true, ...noisy }).drift).toBe(3);
    expect(errors.join('\n')).toMatch(/not made by the rig: .*stray_00\.png/);
    expect(errors.join('\n')).toMatch(/missing: .*idle_03\.png/);
    expect(errors.join('\n')).toMatch(/manifest is not what the rig produces/);
    rmSync(out('stray_00.png'));
    writeFileSync(out('idle_03.png'), idle3);
    writeFileSync(manifestFile(), manifestText);
  }, 240_000);

  it('a clip the artist drew and handed over is left alone: not made, not deleted, its entry kept as written — and nothing else changes', () => {
    const before = new Map<string, Buffer>();
    for (const f of readdirSync(out())) if (f.endsWith('.png') && !f.startsWith('dash_')) before.set(f, readFileSync(out(f)));
    const manifestBefore = readManifest();

    // the artist's three frames of the dash replace the four that were made (they delete those: they are theirs to delete)
    for (const f of readdirSync(out())) if (f.startsWith('dash_')) rmSync(out(f));
    const mine = [handDrawn(200), handDrawn(120), handDrawn(60)];
    mine.forEach((b, k) => writeFileSync(out(`dash_0${k}.png`), b));
    writeFileSync(out('dash_07.png'), handDrawn(33)); // a file of the artist's the manifest does not count: not the generator's to delete
    const entry = { frames: 'dash_', count: 3, fps: 12, loop: false, tags: ['first'], comment: 'drawn by hand' };
    const hand = readManifest();
    hand.sprites[0]!.clips['dash'] = entry;
    hand.sprites[0]!.frames['dash_01'] = { anchors: { hand_r: [0.2, 1.0] } };
    writeFileSync(manifestFile(), `${JSON.stringify(hand, null, 2)}\n`);
    const rig = JSON.parse(readFileSync(join(dir, 'source', 'hero.rig.json'), 'utf8')) as RigFile;
    rig.delivered = ['dash'];
    writeFileSync(join(dir, 'source', 'hero.rig.json'), `${JSON.stringify(rig, null, 2)}\n`);

    const made = animate({ specPath, check: false, ...quiet });
    expect(made.written, 'the dash is not made: 114 frames less its four').toBe(110);
    // the artist's frames are still theirs, byte for byte
    mine.forEach((b, k) => expect(Buffer.compare(readFileSync(out(`dash_0${k}.png`)), b), `dash_0${k}.png`).toBe(0));
    expect(existsSync(out('dash_07.png')), 'writing is not allowed to delete what is the artist\'s, counted or not').toBe(true);
    rmSync(out('dash_07.png'));
    // every other frame is exactly what it was
    for (const [f, bytes] of before) expect(Buffer.compare(readFileSync(out(f)), bytes), f).toBe(0);
    // the manifest: the dash is theirs, with its anchors; every other clip is as it was; it no longer says the dash is a stand-in
    const after = readManifest();
    const sprite = after.sprites[0]!;
    expect(sprite.clips['dash']).toEqual(entry);
    expect(sprite.frames['dash_01']).toEqual({ anchors: { hand_r: [0.2, 1.0] } });
    for (const [id, clip] of Object.entries(manifestBefore.sprites[0]!.clips)) if (id !== 'dash') expect(sprite.clips[id], id).toEqual(clip);
    expect(Object.keys(sprite.clips)).toEqual(Object.keys(manifestBefore.sprites[0]!.clips));
    expect(Object.entries(sprite.clips).filter(([, c]) => c.tags.includes('stand-in')).map(([id]) => id)).not.toContain('dash');
    expect(after.comment).toMatch(/handed over \(dash\)/);
    expect(after.comment).toMatch(/8 clips are STAND-INS/);
    expect(animate({ specPath, check: true, ...quiet }).drift, 'and a look says nothing has drifted').toBe(0);
  }, 240_000);

  it('a clip handed over that is not all there is drift, and so is a frame of it the manifest does not count', () => {
    rmSync(out('dash_01.png'));
    writeFileSync(out('dash_07.png'), handDrawn(33));
    errors.length = 0;
    expect(animate({ specPath, check: true, ...noisy }).drift).toBe(2);
    expect(errors.join('\n')).toMatch(/was handed over, but this frame is missing: .*dash_01\.png/);
    expect(errors.join('\n')).toMatch(/does not count: .*dash_07\.png/);
  }, 240_000);

  it('a clip that is not a clip, or that has no entry in the manifest, is refused before anything is made', () => {
    const spec = JSON.parse(readFileSync(specPath, 'utf8')) as SheetSpec;
    const rig = JSON.parse(readFileSync(join(dir, 'source', 'hero.rig.json'), 'utf8')) as RigFile;
    const sheet = decodePng(readFileSync(join(dir, 'source', 'hero-sheet.png')));
    const kept = keptFrom(readManifest());
    expect(() => buildHeroAnimation(spec, { ...rig, delivered: ['moonwalk'] }, sheet, kept)).toThrow(/no such clip/);
    expect(() => buildHeroAnimation(spec, { ...rig, delivered: ['dash', 'death'] }, sheet, { clips: { dash: kept.clips['dash']! }, frames: {} })).toThrow(/"death" is handed over by hand, but the manifest has no entry/);
    expect(() => buildHeroAnimation(spec, { ...rig, delivered: ['dash'] }, sheet)).toThrow(/"dash" is handed over by hand, but the manifest has no entry/);
  }, 240_000);
});
