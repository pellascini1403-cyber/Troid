import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PLAYER_VISUAL } from '@/content/visuals';
import { buildArt } from '../../../tools/assets/build';
import { decodePng, encodePng } from '../../../tools/assets/png';
import { verifyArt, verifyArtFolder, type VerifyResult } from '../../../tools/assets/verify';
import { H, put, swordAnchors, W, writeSourceArt, type SourcePack } from '../../helpers/artSource';
import { rawPng } from '../../helpers/png';

/**
 * THE CHECK OF WHAT SHIPS (docs/ART-PIPELINE-2D.md, part E): a folder of art is verified without a browser — so that a build fails on a broken asset, naming the
 * file, long before anybody sees a wrong picture. Each test builds a GOOD folder with the real packer, breaks ONE thing in it, and asks the checker what it says.
 */
let root: string;
let src: string;
let out: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'troid-verify-'));
  src = join(root, 'art');
  out = join(root, 'public', 'art');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const PHASES = { startup: [0, 0], active: [1, 1], recovery: [2, 2] };
const REQUIRED_CLIPS = Object.fromEntries(PLAYER_VISUAL.required.map((s) => [s, s.startsWith('attack') ? { count: 3, extra: { phases: PHASES } } : { count: 2 }]));
const clipsWithSword = (): Record<string, unknown> => Object.assign({}, ...['attack1', 'attack2', 'attackAir', 'attackCrouch'].map((s) => swordAnchors(s, 3))) as Record<string, unknown>;
/** The manifest of a good build, changed in place in what ships (a hand-made change of the folder the game fetches). */
const setFrames = (frames: Record<string, unknown>): void => editJson('player/player.pack.json', (m) => void (m['sprites'][0].frames = frames));

/** A hero pack as the game wants it: all the required clips, the sword in the hand. */
const hero = (over: Partial<SourcePack> = {}): SourcePack => ({
  id: 'player',
  category: 'player',
  load: 'boot',
  status: 'final',
  sprites: [{ id: 'hero', clips: REQUIRED_CLIPS, extra: { frames: clipsWithSword() } }],
  ...over,
});
const simple = (over: Partial<SourcePack> = {}): SourcePack => ({ id: 'blob', category: 'enemies', sprites: [{ id: 'blob', clips: { idle: { count: 2 }, walk: { count: 2 } } }], ...over });

const build = (...packs: SourcePack[]): void => {
  writeSourceArt(src, packs);
  const r = buildArt({ srcDir: src, outDir: out, write: true });
  if (!r.ok) throw new Error(r.issues.map((i) => `${i.level} ${i.path}: ${i.message}`).join('\n'));
};
const errors = (v: VerifyResult): string[] => v.issues.filter((i) => i.level === 'error').map((i) => `${i.path}: ${i.message}`);
const warnings = (v: VerifyResult): string[] => v.issues.filter((i) => i.level === 'warn').map((i) => `${i.path}: ${i.message}`);
const editJson = (rel: string, change: (v: Record<string, any>) => void): void => {
  const file = join(out, ...rel.split('/'));
  const v = JSON.parse(readFileSync(file, 'utf8')) as Record<string, any>;
  change(v);
  writeFileSync(file, JSON.stringify(v, null, 2));
};

describe('a good folder', () => {
  it('verifies clean: nothing to say, the protagonist has all fifteen clips, nothing would be left out', () => {
    build(hero(), simple());
    const v = verifyArtFolder(out);
    expect(errors(v)).toEqual([]);
    expect(warnings(v)).toEqual([]);
    expect(v.ok).toBe(true);
    expect(v.packs.map((p) => [p.id, p.status, p.lacking, p.dropped])).toEqual([['player', 'final', [], { hero: [] }], ['blob', 'provisional', [], { blob: [] }]]);
  });

  it('no art at all is not an error: there is nothing to look at', () => {
    expect(verifyArt(() => null)).toEqual({ issues: [], packs: [], ok: true });
    expect(verifyArtFolder(join(root, 'nowhere')).ok).toBe(true);
  });
});

describe('the files are what the manifest says they are', () => {
  it('the size of the image\'s own header against the declared one', () => {
    build(simple());
    editJson('blob/blob.pack.json', (m) => void (m['atlases'][0].width += 4));
    expect(errors(verifyArtFolder(out)).join('\n')).toMatch(/blob atlases\.blob_0: the image file blob_0\.png is \d+ × \d+ but the manifest declares \d+ × \d+/);
  });

  it('a file that is not there: the image, the JSON, the manifest', () => {
    build(simple());
    rmSync(join(out, 'blob', 'blob_0.png'));
    expect(errors(verifyArtFolder(out)).join('\n')).toMatch(/atlases\.blob_0: the image blob_0\.png is not there/);
    build(simple());
    rmSync(join(out, 'blob', 'blob_0.json'));
    expect(errors(verifyArtFolder(out)).join('\n')).toMatch(/atlases\.blob_0: the data blob_0\.json is not there/);
    build(simple());
    rmSync(join(out, 'blob', 'blob.pack.json'));
    expect(errors(verifyArtFolder(out)).join('\n')).toMatch(/blob: its manifest blob\/blob\.pack\.json is not there/);
  });

  it('an image that is damaged (its checksum fails) or not a PNG at all, naming the file', () => {
    build(simple());
    const file = join(out, 'blob', 'blob_0.png');
    const bytes = readFileSync(file);
    bytes[bytes.length - 20] ^= 0xff;
    writeFileSync(file, bytes);
    expect(errors(verifyArtFolder(out)).join('\n')).toMatch(/blob_0\.png: the PNG is corrupt/);
    writeFileSync(file, 'not a picture');
    expect(errors(verifyArtFolder(out)).join('\n')).toMatch(/blob_0\.png: not a PNG file/);
  });

  it('JSON that cannot be read, or an atlas JSON the engine would refuse, naming the file', () => {
    build(simple());
    writeFileSync(join(out, 'blob', 'blob_0.json'), '{ broken');
    expect(errors(verifyArtFolder(out)).join('\n')).toMatch(/blob_0\.json: cannot be read as JSON/);
    build(simple());
    editJson('blob/blob_0.json', (a) => void (a['frames']['idle_00'].rotated = true));
    expect(errors(verifyArtFolder(out)).join('\n')).toMatch(/rotated frames are not supported/);
    writeFileSync(join(out, 'index.json'), 'nope');
    expect(errors(verifyArtFolder(out)).join('\n')).toMatch(/index\.json: cannot be read as JSON/);
  });

  it('a manifest the game would refuse, and a manifest that is not the pack the index says', () => {
    build(simple());
    editJson('blob/blob.pack.json', (m) => void (m['sprites'][0].pivot = [0.5, 3]));
    expect(errors(verifyArtFolder(out)).join('\n')).toMatch(/blob sprites\[0\]\.pivot/);
    build(simple());
    editJson('blob/blob.pack.json', (m) => void (m['id'] = 'someone-else'));
    expect(errors(verifyArtFolder(out)).join('\n')).toMatch(/the manifest says it is "someone-else"/);
  });
});

describe('the pictures: transparency', () => {
  const rgbAtlas = (): Buffer => {
    const info = decodePng(readFileSync(join(out, 'blob', 'blob_0.png')));
    return rawPng({ width: info.width, height: info.height, bitDepth: 8, colorType: 2, samples: Array.from({ length: info.height }, () => new Array<number>(info.width * 3).fill(90)) });
  };

  it('an atlas with no alpha channel, for what is drawn over the world: an error (it would be a rectangle)', () => {
    build(simple());
    writeFileSync(join(out, 'blob', 'blob_0.png'), rgbAtlas());
    expect(errors(verifyArtFolder(out)).join('\n')).toMatch(/has no alpha channel \(it is an RGB picture\)/);
  });

  it('…but only a note for scenery, which may fill its canvas', () => {
    build(simple({ id: 'cave', category: 'environment', sprites: [{ id: 'cave', clips: { idle: { count: 2 } } }] }));
    writeFileSync(join(out, 'cave', 'cave_0.png'), (() => {
      const info = decodePng(readFileSync(join(out, 'cave', 'cave_0.png')));
      return rawPng({ width: info.width, height: info.height, bitDepth: 8, colorType: 2, samples: Array.from({ length: info.height }, () => new Array<number>(info.width * 3).fill(90)) });
    })());
    const v = verifyArtFolder(out);
    expect(errors(v)).toEqual([]);
    expect(v.issues.some((i) => i.level === 'info')).toBe(false); // notes are not even reported: only errors and warnings travel
  });

  it('an atlas that is opaque from edge to edge: was the background removed?', () => {
    build(simple());
    const info = decodePng(readFileSync(join(out, 'blob', 'blob_0.png')));
    writeFileSync(join(out, 'blob', 'blob_0.png'), encodePng({ width: info.width, height: info.height, data: new Uint8Array(info.width * info.height * 4).fill(255) }));
    expect(warnings(verifyArtFolder(out)).join('\n')).toMatch(/every pixel is opaque: was the background removed/);
  });

  it('a 16-bit image or one with a colour profile is said so (the GPU has 8 bits; the browser would convert a profile, the packer does not)', () => {
    build(simple());
    const info = decodePng(readFileSync(join(out, 'blob', 'blob_0.png')));
    writeFileSync(join(out, 'blob', 'blob_0.png'), rawPng({ width: info.width, height: info.height, bitDepth: 16, colorType: 6, samples: Array.from({ length: info.height }, () => new Array<number>(info.width * 4).fill(0x4000)), extra: [{ type: 'iCCP', body: [80, 0, 0] }] }));
    const w = warnings(verifyArtFolder(out)).join('\n');
    expect(w).toMatch(/is 16 bits per channel/);
    expect(w).toMatch(/embedded colour profile/);
  });
});

describe('the frames, the clips and the contract', () => {
  it('a clip with a frame that is not in any page: the game would leave the clip out (an error in a final pack, a warning in a provisional one)', () => {
    build(hero());
    editJson('player/hero_0.json', (a) => void delete a['frames']['walk_01']);
    const v = verifyArtFolder(out);
    expect(errors(v).join('\n')).toMatch(/player sprites\.hero\.clips\.walk: missing frame walk_01/);
    expect(errors(v).join('\n')).toMatch(/the game would leave this clip out \(missing frame walk_01[^)]*\).*a "final" pack must not need that/);
    expect(v.packs[0]!.dropped['hero']).toEqual(['walk']);
    build(hero({ status: 'provisional' }));
    editJson('player/hero_0.json', (a) => void delete a['frames']['walk_01']);
    const p = verifyArtFolder(out);
    expect(p.issues.filter((i) => i.level === 'error' && /leave this clip out/.test(i.message))).toEqual([]);
    expect(warnings(p).join('\n')).toMatch(/the game would leave this clip out/);
  });

  it('the game would REFUSE a set whose idle is broken, or whose frames are not all one size', () => {
    build(simple());
    editJson('blob/blob_0.json', (a) => void delete a['frames']['idle_00']);
    expect(errors(verifyArtFolder(out)).join('\n')).toMatch(/the game would REFUSE this set: clip "idle": missing frame idle_00/);
    build(simple());
    editJson('blob/blob_0.json', (a) => {
      const f = a['frames']['idle_01'];
      f.trimmed = true;
      f.sourceSize = { w: W + 2, h: H };
      f.spriteSourceSize = { x: 0, y: 0, w: f.frame.w, h: f.frame.h };
    });
    expect(errors(verifyArtFolder(out)).join('\n')).toMatch(/do not share one original size/);
  });

  it('the sword has to be in the right hand in every frame of a blow: a grip away from the hand is a clip the game would leave out', () => {
    build(hero());
    setFrames({ ...clipsWithSword(), ...swordAnchors('attack1', 3, [0.9, 1.0]) });
    const v = verifyArtFolder(out);
    expect(errors(v).join('\n')).toMatch(/clips\.attack1: the game would leave this clip out \(clip "attack1": the sword grip is not on the right hand/);
    expect(v.packs[0]!.dropped['hero']).toEqual(['attack1']);
  });

  it('a blow with no sword anchors at all says which anchor is missing', () => {
    build(hero());
    const frames = clipsWithSword();
    delete frames['attack2_01'];
    setFrames(frames);
    expect(errors(verifyArtFolder(out)).join('\n')).toMatch(/clips\.attack2: .*frame "attack2_01" has no "weapon_tip" anchor/);
  });

  it('anchors that are pixels instead of metres are an error; anchors off the picture, a warning', () => {
    build(hero());
    setFrames({ ...clipsWithSword(), attack1_00: { anchors: { hand_r: [12, 9], weapon_grip: [12, 9], weapon_tip: [14, 9] } } });
    expect(errors(verifyArtFolder(out)).join('\n')).toMatch(/anchors that look like PIXELS, not metres from the feet.*attack1_00\.hand_r = \[12, 9\]/);
    build(hero());
    setFrames({ ...clipsWithSword(), attack1_00: { anchors: { hand_r: [3, 1], weapon_grip: [3, 1], weapon_tip: [3.9, 1.2] } } });
    const w = warnings(verifyArtFolder(out)).join('\n');
    expect(w).toMatch(/anchors outside the picture.*attack1_00\.hand_r = \[3, 1\].*are they metres FROM THE FEET/);
  });

  it('a canvas shorter than the character it holds does not fit: usually a wrong artPxPerMeter', () => {
    build(simple());
    editJson('blob/blob.pack.json', (m) => void (m['sprites'][0].height = 3));
    expect(errors(verifyArtFolder(out)).join('\n')).toMatch(/the canvas is 2\.00 m tall at 40 px\/m but the character is 3 m/);
  });
});

describe('what the game asks of the protagonist', () => {
  const partial = { idle: { count: 2 }, walk: { count: 2 }, attack1: { count: 3, extra: { phases: PHASES } } };
  const partialHero = (status: string): SourcePack => hero({ status, sprites: [{ id: 'hero', clips: partial, extra: { frames: swordAnchors('attack1', 3) } }] });

  it('a FINAL pack of the protagonist must bring all fifteen clips: the missing ones are an error that names them', () => {
    build(partialHero('provisional'));
    editJson('player/player.pack.json', (m) => void (m['status'] = 'final'));
    const v = verifyArtFolder(out);
    expect(v.packs[0]!.lacking).toEqual(PLAYER_VISUAL.required.filter((s) => !(s in partial)));
    expect(errors(v).join('\n')).toMatch(/the protagonist's art lacks 12 of the 15 clips the game asks of it: jump, fall, dash, attack2, attackAir, crouch, attackCrouch, hurt, death, cast, drink, interact.*a "final" pack must have them all/);
  });

  it('…and in a provisional pack it is a warning: the placeholder draws those states', () => {
    build(partialHero('provisional'));
    const v = verifyArtFolder(out);
    expect(errors(v)).toEqual([]);
    expect(warnings(v).join('\n')).toMatch(/lacks 12 of the 15 clips.*the placeholder draws those states/);
    expect(v.ok).toBe(true);
  });

  it('other sprite sets are not asked for them', () => {
    build(simple({ status: 'final' }));
    expect(warnings(verifyArtFolder(out))).toEqual([]);
  });
});

describe('the build runs the same questions on what is about to ship', () => {
  it('a source with a frame that is not transparent fails the build once per set, not once per frame, and writes nothing', () => {
    writeSourceArt(src, [hero({ status: 'provisional' })]);
    for (const state of ['idle', 'walk']) for (let i = 0; i < 2; i++) put(join(src, 'player', 'hero', `${state}_0${i}.png`), rawPng({ width: W, height: H, bitDepth: 8, colorType: 2, samples: Array.from({ length: H }, () => new Array<number>(W * 3).fill(60)) }));
    const r = buildArt({ srcDir: src, outDir: out, write: true });
    expect(r.ok).toBe(false);
    const msgs = r.issues.filter((i) => i.level === 'error').map((i) => i.message);
    expect(msgs.filter((m) => /has no alpha channel/.test(m))).toHaveLength(1);
    expect(msgs.join('\n')).toMatch(/4 frames \(idle_00\.png, idle_01\.png, walk_00\.png, walk_01\.png\) has no alpha channel/);
  });

  it('art that touches the left, right or top edge of its canvas may be cut off there; a blink (fully clear) is said too', () => {
    writeSourceArt(src, [simple({ sprites: [{ id: 'blob', clips: { idle: { count: 2 }, walk: { count: 1 } }, box: { x: 0, y: 4, w: W, h: 50 } }] })]);
    put(join(src, 'blob', 'blob', 'walk_00.png'), encodePng({ width: W, height: H, data: new Uint8Array(W * H * 4) }));
    const r = buildArt({ srcDir: src, outDir: out, write: false });
    const w = r.issues.filter((i) => i.level === 'warn').map((i) => i.message).join('\n');
    expect(w).toMatch(/pixels touch the left and right edge of the canvas: the art may be cut off there/);
    expect(w).toMatch(/is fully transparent: a blink between two poses may be meant/);
    expect(r.ok).toBe(true);
  });

  it('art put by hand in the folder the game fetches is checked too', () => {
    build(simple());
    rmSync(src, { recursive: true, force: true });
    // somebody else's art: nothing says it was generated
    rmSync(join(out, 'README.txt'));
    editJson('blob/blob.pack.json', (m) => void (m['atlases'][0].width += 1));
    const r = buildArt({ srcDir: src, outDir: out, write: false });
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.message).join('\n')).toMatch(/the image file blob_0\.png is/);
  });

  it('a clean source builds with no errors, and the checker agrees with the packer about the folder it wrote', () => {
    build(hero(), simple());
    const r = buildArt({ srcDir: src, outDir: out, write: false });
    expect(r.ok).toBe(true);
    expect(r.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(verifyArtFolder(out).ok).toBe(true);
  });
});
