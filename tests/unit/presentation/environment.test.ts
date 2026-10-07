// @vitest-environment happy-dom
import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { ROOMS, WORLD } from '@/content';
import type { ArtSprite } from '@/presentation/artManifest';
import {
  axisPlan, ENV_CONTRACT, ENV_LAYERS, ENV_ROLES, environmentPackIssues, environmentSlots, HALF_VIEW, layerSpan, PARALLAX_FACTOR, planTiles, readEnvTags, slotKey, stripCover,
  type EnvRoomLike, type EnvSlot,
} from '@/presentation/environment';
import { createLayers } from '@/render/layers';

/**
 * THE ENVIRONMENT'S ART CONTRACT (docs/ART-PIPELINE-2D.md, part I): how the scenery that will replace the blockout is layered, repeated, asked for by the rooms' data
 * and delivered. Pure: no art, no scenery — the rules the day the art arrives.
 */
const worldRooms = (): EnvRoomLike[] => WORLD.rooms.map((id) => ROOMS[id]!);

describe('the scene: layers and parallax', () => {
  it('the layers of the contract ARE the scene graph, back to front: what the renderer builds and what the artist is told cannot drift apart', () => {
    const stage = new Container();
    const layers = createLayers(stage);
    const built = [stage.children[0]!.label, ...layers.world.children.map((c) => c.label), stage.children[2]!.label];
    expect(ENV_LAYERS.map((l) => l.id)).toEqual(built);
    expect(stage.children.map((c) => c.label)).toEqual(['sky', 'world', 'screen']);
    for (const l of ENV_LAYERS) {
      if (l.id === 'sky' || l.id === 'screen') continue;
      const c = layers[l.id as keyof typeof layers] as Container;
      expect(c.blendMode === 'add', `${l.id} blend`).toBe(l.blend === 'add');
    }
  });

  it('screen layers are in pixels and the rest in metres; only the scenery has a parallax of its own', () => {
    for (const l of ENV_LAYERS) {
      expect(l.space === 'screen', l.id).toBe(l.parallax === null);
      if (l.space === 'world') expect(l.parallax, l.id).toBeGreaterThan(0);
    }
    const factors = Object.fromEntries(ENV_LAYERS.filter((l) => l.space === 'world' && l.parallax !== 1).map((l) => [l.id, l.parallax]));
    expect(factors).toEqual(PARALLAX_FACTOR);
  });

  it('what is far moves slowly and what is in front moves faster than the world: 0 < far < mid < near < 1 < foreground', () => {
    const f = PARALLAX_FACTOR;
    expect(0 < f.backdropFar && f.backdropFar < f.backdropMid && f.backdropMid < f.backdropNear && f.backdropNear < 1 && 1 < f.foreground).toBe(true);
  });

  it('every layer an art role lives in is a layer of the scene, and every role a layer lists lives in it', () => {
    const ids = new Set(ENV_LAYERS.map((l) => l.id));
    for (const role of ENV_ROLES) for (const layer of ENV_CONTRACT[role].layers) expect(ids.has(layer), `${role} → ${layer}`).toBe(true);
    for (const l of ENV_LAYERS) for (const role of l.art) expect(ENV_CONTRACT[role].layers, `${l.id} lists ${role}`).toContain(l.id);
    for (const role of ENV_ROLES) for (const layer of ENV_CONTRACT[role].layers) expect(ENV_LAYERS.find((l) => l.id === layer)!.art, `${layer} lists ${role}`).toContain(role);
  });

  it('a layer spans the camera range scaled by its factor, plus the widest view on both sides', () => {
    const bounds = { x0: -1, y0: -12, x1: 114, y1: 18 };
    expect(layerSpan(bounds, 1)).toEqual({ x0: -1 - HALF_VIEW, x1: 114 + HALF_VIEW });
    const far = layerSpan(bounds, PARALLAX_FACTOR.backdropFar);
    expect(far.x1 - far.x0).toBeCloseTo(0.15 * 115 + 2 * HALF_VIEW, 9);
    expect(HALF_VIEW).toBe(24);
  });

  it('a seamless strip covers the span with whole copies, the last one reaching past it', () => {
    const bounds = { x0: -1, y0: 0, x1: 114, y1: 10 };
    for (const f of Object.values(PARALLAX_FACTOR)) {
      const c = stripCover(bounds, f, 16);
      expect(c.count * 16).toBeGreaterThanOrEqual(c.width);
      expect((c.count - 1) * 16).toBeLessThan(c.width);
    }
    expect(stripCover(bounds, 0.4, 0).count).toBe(0);
  });
});

describe('repetition: the rectangle is the truth and the art is cut to it', () => {
  it('whole cells and what is left over, which is clipped and never scaled', () => {
    expect(axisPlan(1.4, 1)).toEqual({ whole: 1, rest: expect.closeTo(0.4, 9), count: 2 });
    expect(axisPlan(3, 1)).toEqual({ whole: 3, rest: 0, count: 3 });
    expect(axisPlan(0.5, 1)).toEqual({ whole: 0, rest: 0.5, count: 1 });
    expect(axisPlan(113, 0.5)).toEqual({ whole: 226, rest: 0, count: 226 });
  });

  it('a length a hair under a whole number of cells is that number, not one more clipped to nothing', () => {
    expect(axisPlan(2.9999999, 1)).toEqual({ whole: 3, rest: 0, count: 3 });
    expect(axisPlan(3.0000001, 1)).toEqual({ whole: 3, rest: 0, count: 3 });
  });

  it('nothing to draw for nothing: no length, no cell', () => {
    expect(axisPlan(0, 1).count).toBe(0);
    expect(axisPlan(-1, 1).count).toBe(0);
    expect(axisPlan(5, 0).count).toBe(0);
  });

  it('a tile fills a rectangle from its TOP-LEFT corner', () => {
    const p = planTiles({ x0: 16, y0: 0, x1: 17.4, y1: 1.1 }, { w: 1, h: 1 });
    expect([p.originX, p.originY]).toEqual([16, 1.1]);
    expect(p.cols).toMatchObject({ whole: 1, count: 2 });
    expect(p.rows).toMatchObject({ whole: 1, count: 2 });
    expect(p.cols.rest).toBeCloseTo(0.4, 9);
    expect(p.rows.rest).toBeCloseTo(0.1, 9);
  });

  it('covers EXACTLY the rectangle of every solid of every room of the game: the cells plus the clipped rest are its length, whatever the cell', () => {
    for (const room of Object.values(ROOMS)) {
      for (const s of room.solids) {
        for (const cell of [0.5, 1, 1.5, 2.25]) {
          const p = planTiles(s.rect, { w: cell, h: cell });
          expect(p.cols.whole * cell + p.cols.rest, `${room.id} ${s.id} across`).toBeCloseTo(s.rect.x1 - s.rect.x0, 6);
          expect(p.rows.whole * cell + p.rows.rest, `${room.id} ${s.id} down`).toBeCloseTo(s.rect.y1 - s.rect.y0, 6);
          expect(p.cols.rest, `${room.id} ${s.id}`).toBeLessThan(cell);
        }
      }
    }
  });
});

describe('what the world asks of the art, read from the rooms\' data', () => {
  const slots = environmentSlots(worldRooms());
  const find = (role: string, subject: string | null, part: string): EnvSlot | undefined => slots.find((s) => s.role === role && s.subject === subject && s.part === part);
  const required = slots.filter((s) => s.required).map((s) => slotKey(s.role, s.subject, s.part));

  it('the twelve pieces without which the four rooms are not dressed — and no more', () => {
    expect(required.sort()).toEqual(
      [
        'solid:stone:fill', 'solid:earth:fill', 'platform:wood:body', 'door:gate:body', 'door:seal:body', 'hazard:spikes:cell',
        'backdrop:ruins:far', 'backdrop:ruins:mid', 'backdrop:ruins:near', 'interactive:pickup:', 'interactive:rest:', 'seal::',
      ].sort(),
    );
  });

  it('the optional pieces: the cap and the edges of the ground, the ends of a platform, the top and bottom of a door, the foreground and the light of the exits', () => {
    for (const [role, subject, part] of [['solid', 'stone', 'cap'], ['solid', 'earth', 'edge-l'], ['platform', 'wood', 'cap-r'], ['door', 'gate', 'top'], ['door', 'seal', 'bottom'], ['foreground', 'ruins', 'strip'], ['light', null, '']] as const) {
      expect(find(role, subject, part)?.required, `${role} ${subject} ${part}`).toBe(false);
    }
  });

  it('says which rooms use each piece, and how many pieces of data it draws', () => {
    expect(find('hazard', 'spikes', 'cell')).toMatchObject({ rooms: ['r2_hall'], uses: 1 });
    expect(find('door', 'seal', 'body')).toMatchObject({ rooms: ['r3_chamber'], uses: 1 });
    expect(find('door', 'gate', 'body')?.rooms).toEqual(['r1_gate', 'r4_sanctum']);
    expect(find('solid', 'stone', 'fill')!.uses).toBeGreaterThan(10);
    expect(find('interactive', 'rest', '')?.rooms).toEqual(['r2_hall', 'r4_sanctum']);
  });

  it('a gate is a door, not ground: the solid a gate holds is asked for as a door of its material', () => {
    expect(find('solid', 'gate', 'fill')).toBeUndefined();
    expect(find('solid', 'seal', 'fill')).toBeUndefined();
  });

  it('is DATA: a room with a new material, a new hazard and a new interactable asks for new pieces', () => {
    const room: EnvRoomLike = {
      id: 'x',
      solids: [{ id: 'a', material: 'ice' }, { id: 'b', kind: 'oneway', material: 'glass' }, { id: 'c' }],
      hazards: [{ kind: 'lava' }],
      interactables: [{ kind: 'lever' }],
      art: { backdrop: 'cave' },
    };
    const keys = environmentSlots([room]).filter((s) => s.required).map((s) => slotKey(s.role, s.subject, s.part));
    expect(keys).toEqual(expect.arrayContaining(['solid:ice:fill', 'platform:glass:body', 'solid:stone:fill', 'hazard:lava:cell', 'interactive:lever:', 'backdrop:cave:far']));
    expect(environmentSlots([])).toEqual([]);
  });

  it('the test rooms are not part of the world: their materials (moss) are not asked for', () => {
    expect(environmentSlots(worldRooms()).some((s) => s.subject === 'moss')).toBe(false);
    expect(environmentSlots(Object.values(ROOMS)).some((s) => s.subject === 'moss')).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------- a pack of art

const sprite = (id: string, tags: string[], over: Partial<ArtSprite> = {}): ArtSprite => ({
  id, atlases: [], artPxPerMeter: 64, scale: 1, pivot: [0, 0], height: 1, missingClips: 'placeholder', clips: { idle: { frames: `${id}_`, count: 1, tags: [] } }, tags, ...over,
});
const pack = (sprites: ArtSprite[], status: 'final' | 'provisional' | 'awaiting-art' = 'provisional') => ({ id: 'forest', status, sprites });
const messages = (p: ReturnType<typeof pack>, slots: readonly EnvSlot[] = []): string[] => environmentPackIssues(p, slots).map((i) => `${i.level} ${i.path}: ${i.message}`);

/** A pack with every piece the four rooms ask for, each at the pivot its role starts from. */
function completePack(): ReturnType<typeof pack> {
  const slots = environmentSlots(worldRooms()).filter((s) => s.required);
  return pack(
    slots.map((s) => {
      const spec = ENV_CONTRACT[s.role];
      const tags = [`role:${s.role}`, ...(spec.subject ? [`${spec.subject}:${s.subject}`] : []), ...(s.part ? [`part:${s.part}`] : [])];
      return sprite(`${s.role}_${s.subject ?? 'x'}_${s.part || 'x'}`.replace(/[^a-z0-9_]/g, '_'), tags, { pivot: [...spec.pivot] as [number, number] });
    }),
    'final',
  );
}

describe('readEnvTags', () => {
  it('splits the tags of a sprite by what they say: its role, what it is for and which piece it is', () => {
    expect(readEnvTags(['role:solid', 'material:stone', 'part:cap'])).toEqual({ roles: ['solid'], subject: 'stone', parts: ['cap'] });
    expect(readEnvTags(['role:hazard', 'kind:spikes', 'part:cell']).subject).toBe('spikes');
    expect(readEnvTags(['role:backdrop', 'backdrop:ruins', 'part:far']).subject).toBe('ruins');
    expect(readEnvTags(['forest'])).toEqual({ roles: [], subject: null, parts: [] });
  });

  it('reads the subject by the key its role uses: a "material" on a hazard says nothing', () => {
    expect(readEnvTags(['role:hazard', 'material:stone']).subject).toBeNull();
  });
});

describe('environmentPackIssues: does a pack say what it draws, the way the contract asks?', () => {
  const slots = environmentSlots(worldRooms());

  it('a pack with every required piece, each at its role\'s pivot, has nothing to say — as a final pack', () => {
    expect(messages(completePack(), slots)).toEqual([]);
  });

  it('a pack that awaits its art is not looked at', () => {
    expect(messages(pack([sprite('mystery', [])], 'awaiting-art'), slots)).toEqual([]);
  });

  it('a sprite that says nothing of what it draws, or too much, or something that does not exist', () => {
    expect(messages(pack([sprite('a', [])]))).toEqual([expect.stringMatching(/^error sprites\.a: says nothing of what it draws/)]);
    expect(messages(pack([sprite('a', ['role:solid', 'role:door'])]))).toEqual([expect.stringMatching(/names 2 roles \(solid, door\)/)]);
    expect(messages(pack([sprite('a', ['role:tree'])]))).toEqual([expect.stringMatching(/"role:tree" is not a role of the environment/)]);
  });

  it('a role that needs a subject or a piece and does not say it, or says one it does not have', () => {
    const m = messages(pack([sprite('a', ['role:solid', 'part:fill']), sprite('b', ['role:solid', 'material:stone']), sprite('c', ['role:solid', 'material:stone', 'part:roof'])]));
    expect(m.some((x) => /sprites\.a: a solid must say what it is for with a "material:<name>" tag/.test(x))).toBe(true);
    expect(m.some((x) => /sprites\.b: a solid must name which piece it is with ONE "part:<piece>" tag \(fill, cap, edge-l, edge-r\)/.test(x))).toBe(true);
    expect(m.some((x) => /sprites\.c: "part:roof" is not a piece of a solid/.test(x))).toBe(true);
  });

  it('a role with no pieces that names one is told it is ignored', () => {
    expect(messages(pack([sprite('a', ['role:seal', 'part:body'], { pivot: [0.5, 0.5] })]))).toEqual([expect.stringMatching(/^warn sprites\.a: a seal has no pieces/)]);
  });

  it('a pivot that is not where the role\'s repetition starts: tiles from the top-left, strips and thorns from the bottom-left, what stands from its feet', () => {
    const m = messages(pack([sprite('a', ['role:solid', 'material:stone', 'part:fill'], { pivot: [0.5, 1] }), sprite('b', ['role:decor'], { pivot: [0, 0] })]));
    expect(m.some((x) => /sprites\.a: its pivot is \[0\.5, 1\] but a solid is placed from \[0, 0\] \(where its repetition starts\)/.test(x))).toBe(true);
    expect(m.some((x) => /sprites\.b: its pivot is \[0, 0\] but a decor is placed from \[0\.5, 1\] \(where it stands\)/.test(x))).toBe(true);
  });

  it('a sprite with no idle clip: a still picture is an idle clip of one frame', () => {
    const noIdle = sprite('a', ['role:decor'], { pivot: [0.5, 1], clips: { walk: { frames: 'w_', count: 1, tags: [] } } });
    expect(messages(pack([noIdle]))).toEqual([expect.stringMatching(/has no "idle" clip/)]);
  });

  it('two sprites for the same piece: only one can be drawn', () => {
    const one = sprite('one', ['role:solid', 'material:stone', 'part:fill']);
    const two = sprite('two', ['role:solid', 'material:stone', 'part:fill']);
    expect(messages(pack([one, two]))).toEqual([expect.stringMatching(/^warn sprites\.two: claims the same piece as one/)]);
  });

  it('pieces of one place at different pixel densities do not meet at the seams', () => {
    const a = sprite('a', ['role:solid', 'material:stone', 'part:fill']);
    const b = sprite('b', ['role:solid', 'material:earth', 'part:fill'], { artPxPerMeter: 128 });
    expect(messages(pack([a, b]))).toEqual([expect.stringMatching(/^warn forest: its sprites are drawn at 64 and 128 pixels per metre/)]);
  });

  it('what the world asks for and the pack lacks: an ERROR in a final pack, a warning in a provisional one (the blockout draws what is missing)', () => {
    const only = [sprite('a', ['role:solid', 'material:stone', 'part:fill'])];
    const final = environmentPackIssues(pack(only, 'final'), slots);
    const provisional = environmentPackIssues(pack(only, 'provisional'), slots);
    expect(final.length).toBe(provisional.length);
    expect(final.length).toBe(11); // the twelve required, less the one it has
    expect(final.every((i) => i.level === 'error')).toBe(true);
    expect(provisional.every((i) => i.level === 'warn')).toBe(true);
    expect(final.some((i) => /the world asks for the "cell" of hazard "spikes" \(r2_hall\) and the pack does not have it$/.test(i.message))).toBe(true);
    expect(provisional.some((i) => /the blockout draws it$/.test(i.message))).toBe(true);
  });

  it('optional pieces are never asked for', () => {
    const asked = environmentPackIssues(pack([], 'final'), slots).map((i) => i.message).join('\n');
    expect(asked).not.toMatch(/"cap"|"edge-l"|"strip"|light/);
  });
});
