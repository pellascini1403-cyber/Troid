import { describe, expect, it } from 'vitest';
import { parseArtPack } from '@/presentation/artManifest';
import { parseRoomScene, placementShown, sceneIssues, scenePieces, SCENE_LAYERS, SCENE_VERSION } from '@/presentation/roomScene';

/**
 * THE DRESSING OF A ROOM (docs/ART-PIPELINE-2D.md, part M): a scene is data — which piece of the pack stands where in which layer — read without ever throwing, and
 * checked against the pack it belongs to.
 */
const scene = (layers: Record<string, unknown>, room = 'r1_gate'): unknown => ({ sceneVersion: SCENE_VERSION, room, layers });

describe('parseRoomScene', () => {
  it('reads a scene: the layers, and for each piece where it stands and how it is drawn', () => {
    const { value, issues } = parseRoomScene(
      scene({
        backdropFar: [{ sprite: 'haze', x: -10, y: -2 }],
        terrain: [{ sprite: 'fern', x: 3.5, y: 0, scale: 1.2, flip: true, alpha: 0.8, tint: 0xaabbcc, frame: 1, motion: 'sway' }],
      }),
    );
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(value!.room).toBe('r1_gate');
    expect(value!.layers.terrain![0]).toEqual({ sprite: 'fern', x: 3.5, y: 0, scale: 1.2, flip: true, alpha: 0.8, tint: 0xaabbcc, frame: 1, motion: 'sway' });
    expect(scenePieces(value!)).toBe(2);
  });

  it('refuses what is not a scene, without throwing, and says where', () => {
    expect(parseRoomScene(null).value).toBeNull();
    expect(parseRoomScene({ sceneVersion: 99, room: 'r', layers: {} }).issues[0]!.message).toMatch(/newer game/);
    const bad = parseRoomScene(scene({ sky: [], terrain: [{ sprite: 'a', x: 1e6, y: 0 }, { sprite: 'a', x: 0, y: 0, motion: 'spin' }, { sprite: 'a', x: 0, y: 0, alpha: 3 }] }));
    expect(bad.value).toBeNull();
    const text = bad.issues.map((i) => `${i.path}: ${i.message}`).join('\n');
    expect(text).toMatch(/layers\.sky.*not a layer/);
    expect(text).toMatch(/layers\.terrain\[0\]\.x/);
    expect(text).toMatch(/motion/);
    expect(text).toMatch(/alpha/);
  });

  it('reads the flags a piece answers (`whenSet`, `whenClear`, a volatile one with its `~`) and refuses what is not a flag\'s name', () => {
    const { value, issues } = parseRoomScene(scene({ backdropNear: [{ sprite: 'eye', x: 44, y: 3, whenSet: '~fight:r4_boss', whenClear: 'defeated:r4_boss' }] }));
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(value!.layers.backdropNear![0]).toMatchObject({ whenSet: '~fight:r4_boss', whenClear: 'defeated:r4_boss' });
    const bad = parseRoomScene(scene({ terrain: [{ sprite: 'a', x: 0, y: 0, whenSet: 'Defeated Boss' }, { sprite: 'a', x: 0, y: 0, whenClear: 7 }] }));
    expect(bad.value).toBeNull();
    expect(bad.issues.map((i) => i.path).join(' ')).toMatch(/whenSet.*whenClear|terrain\[0\]\.whenSet[\s\S]*terrain\[1\]\.whenClear/);
  });

  it('knows exactly the layers of the scene graph a piece may be placed in', () => {
    expect([...SCENE_LAYERS]).toEqual(['backdropFar', 'backdropMid', 'backdropNear', 'propsBack', 'terrain', 'foreground', 'lightOverlay']);
  });
});

describe('sceneIssues: against the pack', () => {
  const packOf = (sprites: Array<{ id: string; count: number }>) => ({ sprites: sprites.map((s) => ({ id: s.id, clips: { idle: { count: s.count } } })) });

  it('every piece must be a sprite set of the pack, with the frame it asks for', () => {
    const { value } = parseRoomScene(scene({ terrain: [{ sprite: 'fern', x: 0, y: 0, frame: 2 }, { sprite: 'rock', x: 1, y: 0 }, { sprite: 'ghost', x: 2, y: 0 }] }));
    const issues = sceneIssues(value!, packOf([{ id: 'fern', count: 2 }, { id: 'rock', count: 1 }]));
    expect(issues).toHaveLength(2);
    expect(issues.map((i) => i.message).join('\n')).toMatch(/frame 2 of "fern" does not exist \(it has 2\)/);
    expect(issues.map((i) => i.message).join('\n')).toMatch(/"ghost" is not a sprite set/);
  });
});

describe('a pack declares its scenes and how its frames are stored', () => {
  const base = { manifestVersion: 1, id: 'ruins', category: 'environment', status: 'awaiting-art', atlases: [], sprites: [] };

  it('reads atlasMode and the scene files, with defaults that change nothing for a pack that says neither', () => {
    expect(parseArtPack(base).value).toMatchObject({ atlasMode: 'sprite', scenes: {} });
    const v = parseArtPack({ ...base, atlasMode: 'shared', scenes: { r1_gate: 'scenes/r1_gate.json' } }).value!;
    expect(v.atlasMode).toBe('shared');
    expect(v.scenes).toEqual({ r1_gate: 'scenes/r1_gate.json' });
  });

  it('refuses a scene path that leaves the pack\'s folder or is not JSON, and an unknown mode', () => {
    expect(parseArtPack({ ...base, scenes: { r1_gate: '../x.json' } }).value).toBeNull();
    expect(parseArtPack({ ...base, scenes: { r1_gate: 'scenes/a.txt' } }).value).toBeNull();
    expect(parseArtPack({ ...base, atlasMode: 'huge' }).value).toBeNull();
  });
});

describe('placementShown: a piece that answers the world', () => {
  const flags = (...set: string[]) => (f: string): boolean => set.includes(f);

  it('a piece with no condition is always shown', () => {
    expect(placementShown({}, flags())).toBe(true);
    expect(placementShown({}, flags('anything'))).toBe(true);
  });

  it('`whenSet` shows it while the flag is set; `whenClear`, while it is not; both, only while both hold', () => {
    expect(placementShown({ whenSet: 'defeated:r4_boss' }, flags())).toBe(false);
    expect(placementShown({ whenSet: 'defeated:r4_boss' }, flags('defeated:r4_boss'))).toBe(true);
    expect(placementShown({ whenClear: 'defeated:r4_boss' }, flags())).toBe(true);
    expect(placementShown({ whenClear: 'defeated:r4_boss' }, flags('defeated:r4_boss'))).toBe(false);
    const burning = { whenSet: '~fight:r4_boss', whenClear: 'defeated:r4_boss' };
    expect(placementShown(burning, flags())).toBe(false);
    expect(placementShown(burning, flags('~fight:r4_boss'))).toBe(true);
    expect(placementShown(burning, flags('~fight:r4_boss', 'defeated:r4_boss'))).toBe(false);
  });
});
