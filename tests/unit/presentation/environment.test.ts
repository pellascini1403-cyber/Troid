// @vitest-environment happy-dom
import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { ROOMS, WORLD } from '@/content';
import type { ArtSprite } from '@/presentation/artManifest';
import {
  axisPlan, ENV_CONTRACT, ENV_LAYERS, ENV_ROLES, environmentCoverageIssues, environmentPackIssues, environmentSlots, HALF_VIEW, interactiveVariant, layerSpan, PARALLAX_FACTOR, PICKUP_FLOAT, planTiles, readEnvLook, readEnvTags, slotKey, stripCover,
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

  it('the forty-seven pieces without which the 64 rooms are not dressed — and no more: the sixteen the ruins asked for, the three strips of each of the six zones after them (a backdrop is the zone\'s own) and the thirteen materials of the ground those zones are built of (a pickup is asked for by what it gives: a bottle, a card, a rune; a split stone is a door of stone; a lever is the one new thing to touch)', () => {
    const ruins = [
      'solid:stone:fill', 'solid:earth:fill', 'platform:wood:body', 'door:gate:body', 'door:seal:body', 'door:stone:body', 'hazard:spikes:cell',
      'backdrop:ruins:far', 'backdrop:ruins:mid', 'backdrop:ruins:near', 'interactive:pickup:bottle', 'interactive:pickup:card', 'interactive:pickup:rune', 'interactive:rest:', 'interactive:activate:', 'seal::',
    ];
    const zones = ['roots', 'mire', 'mines', 'spire', 'foundry', 'heart'].flatMap((z) => ['far', 'mid', 'near'].map((p) => `backdrop:${z}:${p}`));
    // what the ground of a zone is made of: the mire has mud for earth; the others a stone, an earth and a platform of their own
    const ground = ['solid:mud:fill', 'solid:rock:fill', 'solid:gravel:fill', 'platform:timber:body', 'solid:masonry:fill', 'solid:flagstone:fill', 'platform:beam:body', 'solid:iron:fill', 'solid:slag:fill', 'platform:grate:body', 'solid:ink:fill', 'solid:inksoil:fill', 'platform:bone:body'];
    expect(required.sort()).toEqual([...ruins, ...zones, ...ground].sort());
  });

  it('the optional pieces: the cap and the edges of the ground, the ends of a platform, the top and bottom of a door, the foreground and the light of the exits', () => {
    for (const [role, subject, part] of [['solid', 'stone', 'cap'], ['solid', 'earth', 'edge-l'], ['platform', 'wood', 'cap-r'], ['door', 'gate', 'top'], ['door', 'seal', 'bottom'], ['foreground', 'ruins', 'strip'], ['light', null, '']] as const) {
      expect(find(role, subject, part)?.required, `${role} ${subject} ${part}`).toBe(false);
    }
  });

  it('says which rooms use each piece, and how many pieces of data it draws', () => {
    const roomsOf = (role: string, subject: string | null, part: string): string[] => find(role, subject, part)?.rooms ?? [];
    expect(find('door', 'seal', 'body')).toMatchObject({ rooms: ['r3_chamber'], uses: 1 });
    // the spikes of R2 and of thirteen rooms of the zones after it
    expect(roomsOf('hazard', 'spikes', 'cell')).toHaveLength(14);
    expect(roomsOf('hazard', 'spikes', 'cell')[0]).toBe('r2_hall');
    // the doors that a flag opens: the stone door of R1, the wall of R4 and every arena and shortcut door of the rest
    expect(roomsOf('door', 'gate', 'body')).toHaveLength(18);
    expect(roomsOf('door', 'gate', 'body').slice(0, 2)).toEqual(['r1_gate', 'r4_sanctum']);
    // split stone, which has no piece of its own yet (the blockout draws it)
    expect(roomsOf('door', 'stone', 'body')).toEqual(['ru_nave', 'rt_tangle', 'mr_stilts', 'mn_hall', 'mn_forge', 'mn_descent', 'sp_bridge', 'fd_line']);
    expect(find('solid', 'stone', 'fill')!.uses).toBeGreaterThan(100);
    // the fifteen shrines, and the seven levers of the six shortcuts (the Belfry has two)
    expect(roomsOf('interactive', 'rest', '')).toHaveLength(15);
    expect(roomsOf('interactive', 'rest', '').slice(0, 2)).toEqual(['r2_hall', 'r4_sanctum']);
    expect(roomsOf('interactive', 'activate', '')).toEqual(['rt_cellar', 'mr_approach', 'mn_approach', 'sp_belfry', 'sp_approach', 'fd_control', 'ih_approach']);
    expect(find('interactive', 'activate', '')!.uses).toBe(8);
    // what is picked up: the card of the Spirit Bolt in R3 alone; a bottle is the fourth slot of R2 and the eight vessels; a rune is an ability or a relic
    expect(roomsOf('interactive', 'pickup', 'card')).toEqual(['r3_chamber']);
    expect(roomsOf('interactive', 'pickup', 'bottle')).toEqual(['r2_hall', 'ru_archive', 'ru_cistern', 'rt_tangle', 'rt_arena', 'mr_lair', 'mr_den', 'mn_vault', 'fd_scrap']);
    expect(roomsOf('interactive', 'pickup', 'rune')).toEqual(['r4_sanctum', 'ru_reliquary', 'rt_echo', 'rt_hideout', 'mr_sink', 'mn_forge', 'mn_arena', 'sp_arena', 'sp_loft', 'fd_arena']);
  });

  it('a pickup\'s variant is read from what it GIVES in the room\'s data, and nothing else has one', () => {
    expect(interactiveVariant({ kind: 'pickup', actions: [{ type: 'addBottleSlot' }, { type: 'setFlag' }] })).toBe('bottle');
    expect(interactiveVariant({ kind: 'pickup', actions: [{ type: 'unlockAbility' }, { type: 'setFlag' }] })).toBe('rune');
    expect(interactiveVariant({ kind: 'pickup', actions: [{ type: 'acquireCard' }] })).toBe('card');
    expect(interactiveVariant({ kind: 'pickup' })).toBe('card');
    expect(interactiveVariant({ kind: 'rest', actions: [{ type: 'addBottleSlot' }] })).toBe('');
    expect(PICKUP_FLOAT).toBeGreaterThan(0);
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
      // an interactive's part is the variant of its picture
      const tags = [`role:${s.role}`, ...(spec.subject ? [`${spec.subject}:${s.subject}`] : []), ...(s.part ? [s.role === 'interactive' ? `variant:${s.part}` : `part:${s.part}`] : [])];
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
    expect(messages(pack([a, b]))).toEqual([expect.stringMatching(/^warn forest: the ground pieces are drawn at 64 and 128 pixels per metre/)]);
  });

  it('what the world asks for and the pack lacks: an ERROR in a final pack, a warning in a provisional one (the blockout draws what is missing)', () => {
    const only = [sprite('a', ['role:solid', 'material:stone', 'part:fill'])];
    const final = environmentPackIssues(pack(only, 'final'), slots);
    const provisional = environmentPackIssues(pack(only, 'provisional'), slots);
    expect(final.length).toBe(provisional.length);
    expect(final.length).toBe(46); // the forty-seven required, less the one it has
    expect(final.every((i) => i.level === 'error')).toBe(true);
    expect(provisional.every((i) => i.level === 'warn')).toBe(true);
    expect(final.some((i) => /the world asks for the "cell" of hazard "spikes" \(r2_hall, ru_cistern[^)]*\) and the pack does not have it$/.test(i.message))).toBe(true);
    expect(provisional.some((i) => /the blockout draws it$/.test(i.message))).toBe(true);
  });

  it('optional pieces are never asked for', () => {
    const asked = environmentPackIssues(pack([], 'final'), slots).map((i) => i.message).join('\n');
    expect(asked).not.toMatch(/"cap"|"edge-l"|"strip"|light/);
  });
});

describe('how a piece says it is drawn (readEnvLook)', () => {
  it('reads the grid of cells, the rise above the line it stands on, the reach past an edge, the blend and the layer', () => {
    expect(readEnvLook(['role:solid', 'grid:4x2', 'rise:0.34', 'reach:0.2', 'blend:add', 'layer:props-back'])).toEqual({ grid: { cols: 4, rows: 2 }, rise: 0.34, reach: 0.2, blend: 'add', layer: 'props-back', variant: null, problems: [] });
    expect(readEnvLook(['role:solid'])).toEqual({ grid: null, rise: 0, reach: 0, blend: 'normal', layer: null, variant: null, problems: [] });
  });

  it('says what a tag got wrong instead of guessing', () => {
    expect(readEnvLook(['grid:4by2', 'rise:lots', 'blend:multiply']).problems).toHaveLength(3);
    expect(readEnvLook(['variant:potion']).problems).toEqual([expect.stringMatching(/"variant:potion" is not a variant of a picture/)]);
  });

  it('reads the variant of a picture of an interactive', () => {
    expect(readEnvLook(['role:interactive', 'kind:pickup', 'variant:bottle']).variant).toBe('bottle');
  });
});

describe('environmentPackIssues: pieces drawn by cells, and the scenery of a place split in packs', () => {
  const tile = (id: string, tags: string[], count: number, ppm = 96, pivot: [number, number] = [0, 0]): ArtSprite => sprite(id, tags, { artPxPerMeter: ppm, pivot, clips: { idle: { frames: `${id}_`, count, tags: [] } } });

  it('a grid must have as many cells as the idle clip has frames, and a row piece has one row', () => {
    const ok = pack([tile('f', ['role:solid', 'material:stone', 'part:fill', 'grid:4x2'], 8)]);
    expect(messages(ok)).toEqual([]);
    const wrong = messages(pack([tile('f', ['role:solid', 'material:stone', 'part:fill', 'grid:4x2'], 6)]));
    expect(wrong).toEqual([expect.stringMatching(/^error sprites\.f: "grid:4x2" is 8 cells but the idle clip has 6 frames/)]);
    const rows = messages(pack([tile('c', ['role:solid', 'material:stone', 'part:cap', 'grid:4x2'], 8)]));
    expect(rows).toEqual([expect.stringMatching(/^warn sprites\.c: a solid piece repeats along one row/)]);
  });

  it('a parallax layer meets no other layer: the far haze and the near columns may be drawn at different densities, the ground\'s pieces may not', () => {
    const far = tile('far', ['role:backdrop', 'backdrop:ruins', 'part:far'], 1, 24, [0, 1]);
    const mid = tile('mid', ['role:backdrop', 'backdrop:ruins', 'part:mid'], 1, 48, [0, 1]);
    const near = tile('near', ['role:backdrop', 'backdrop:ruins', 'part:near'], 1, 64, [0, 1]);
    expect(messages(pack([far, mid, near]))).toEqual([]);
    const a = tile('a', ['role:solid', 'material:stone', 'part:fill'], 1, 96);
    const b = tile('b', ['role:platform', 'material:wood', 'part:body'], 1, 64);
    expect(messages(pack([a, b]))).toEqual([expect.stringMatching(/the ground pieces are drawn at 96 and 64/)]);
  });

  it('a decor piece is made for the layers the scene may put it in, and two of them never "claim the same piece"', () => {
    const arch = tile('arch', ['role:decor', 'layer:backdrop-near'], 1, 48, [0.5, 1]);
    const arch2 = tile('arch2', ['role:decor', 'layer:backdrop-near'], 1, 48, [0.5, 1]);
    expect(messages(pack([arch, arch2]))).toEqual([]);
    const wrong = messages(pack([tile('x', ['role:decor', 'layer:terrain-x'], 1, 48, [0.5, 1])]));
    expect(wrong).toEqual([expect.stringMatching(/error sprites\.x: a decor is drawn in/)]);
  });

  it('what the world asks for is judged over ALL the environment packs together: a pack of backdrops and a pack of ground make one dressing', () => {
    const slots = environmentSlots(worldRooms()).filter((s) => s.required);
    const spec = (s: (typeof slots)[number]): ArtSprite => {
      const c = ENV_CONTRACT[s.role];
      const tags = [`role:${s.role}`, ...(c.subject ? [`${c.subject}:${s.subject}`] : []), ...(s.part ? [s.role === 'interactive' ? `variant:${s.part}` : `part:${s.part}`] : [])];
      return sprite(`${s.role}_${s.subject ?? 'x'}_${s.part || 'x'}`.replace(/[^a-z0-9_]/g, '_'), tags, { pivot: [...c.pivot] as [number, number] });
    };
    const backdrops = slots.filter((s) => s.role === 'backdrop').map(spec);
    const rest = slots.filter((s) => s.role !== 'backdrop').map(spec);
    const a = { id: 'ruins-back', status: 'final' as const, sprites: backdrops };
    const b = { id: 'ruins-ground', status: 'final' as const, sprites: rest };
    expect(environmentCoverageIssues([a, b], slots)).toEqual([]);
    expect(environmentCoverageIssues([a], slots).length).toBeGreaterThan(0);
    expect(environmentCoverageIssues([a], slots).every((i) => i.level === 'error')).toBe(true);
    expect(environmentCoverageIssues([{ ...a, status: 'provisional' }], slots).every((i) => i.level === 'warn')).toBe(true);
  });
});

describe('interactives: a picture per kind, and per thing a pickup gives', () => {
  const pickup = (id: string, tags: string[] = []): ArtSprite => sprite(id, ['role:interactive', 'kind:pickup', ...tags], { pivot: [0.5, 1] });
  const slots = environmentSlots(worldRooms()).filter((s) => s.required && s.role === 'interactive');

  it('a picture with a variant covers that variant only; one without a variant serves every variant of its kind', () => {
    const bottle = environmentCoverageIssues([{ id: 'a', status: 'provisional', sprites: [pickup('vial', ['variant:bottle'])] }], slots).map((i) => i.message);
    expect(bottle.join('\n')).not.toMatch(/variant "bottle"/);
    expect(bottle.join('\n')).toMatch(/variant "card"/);
    expect(bottle.join('\n')).toMatch(/variant "rune"/);
    const any = environmentCoverageIssues([{ id: 'a', status: 'provisional', sprites: [pickup('thing')] }], slots).map((i) => i.message);
    expect(any.join('\n')).not.toMatch(/pickup/);
  });

  it('a variant belongs to a pickup: anywhere else it is ignored, and said so', () => {
    const msgs = messages(pack([sprite('shrine', ['role:interactive', 'kind:rest', 'variant:bottle'], { pivot: [0.5, 1] })]));
    expect(msgs).toEqual([expect.stringMatching(/^warn sprites\.shrine: only a pickup has variants/)]);
    expect(messages(pack([pickup('vial', ['variant:bottle'])]))).toEqual([]);
  });

  it('two pictures for the same variant of a pickup claim the same piece; two variants do not', () => {
    expect(messages(pack([pickup('a', ['variant:bottle']), pickup('b', ['variant:bottle'])]))).toEqual([expect.stringMatching(/claims the same piece as a/)]);
    expect(messages(pack([pickup('a', ['variant:bottle']), pickup('b', ['variant:rune'])]))).toEqual([]);
  });
});
