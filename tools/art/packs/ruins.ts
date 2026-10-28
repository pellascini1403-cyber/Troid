import { R1_SCENES } from '../scenes/r1';
import { R2_SCENES } from '../scenes/r2';
import { R3_SCENES } from '../scenes/r3';
import { R4_SCENES } from '../scenes/r4';
import { DRESSED_BY_COMPOSER, WORLD_SCENES, zoneOf } from '../scenes/world';
import { ROOMS, WORLD } from '../../../src/content';
import { ROOTS_SCENES_IN_RUINS_ROOTS, SPIKES } from './zones';
import { environmentSlots, slotKey } from '../../../src/presentation/environment';
import { SLIME_EYES, SLIME_SIGIL } from '../painter/slime';
import type { PackSpec, SpriteSpec } from '../spec';

/**
 * «Ancient Forest Ruins»: the scenery of the four rooms of the slice, in three packs by what is drawn where — the GROUND (the pieces that dress the room's own data: earth,
 * stone, timber, the gate, and the props that stand on them; at 96 px/m, the density of the hero's art), the BACK (the three parallax strips, the colossal ruins in the layers
 * behind the action and the leaves in front, each at the density its layer needs) and the LIGHT (additive: the shaft over a way out, glows, beams, mist, motes). Every number
 * here is a decision of art direction, and every piece is made by the painter in `painter/`: nothing in the repository is a hand-drawn picture, and
 * `docs/ART-PIPELINE-2D.md` part M says so.
 */
/**
 * The rooms the packs dress. A room joins the list in the phase that finishes it (docs/PROMPT8-LOG.md): until then it is the blockout it always was, so a room that is not
 * done is never half-dressed with materials that were not composed for it (the boss's telegraph, for one, was drawn over a bare floor and is judged over the scenery that
 * phase gives it).
 */
const SLICE_ROOMS = ['r1_gate', 'r2_hall', 'r3_chamber', 'r4_sanctum'];
/** The rooms of the slice, composed by hand, and the sixty after them, composed by `scenes/world.ts` from their data (docs/PROMPT21-LOG.md): every room of the world is dressed. */
const DRESSED_ROOMS = [...SLICE_ROOMS, ...DRESSED_BY_COMPOSER];
/** The Ruins proper (the slice, the Nave and the rooms around it): the only rooms that keep the backdrop of the ruins — each zone after them has its own (`packs/zones.ts`). */
const RUINS_ROOMS = WORLD.rooms.filter((id) => zoneOf(id) === 'ruins');
const SEED = 7;

/**
 * The rooms past the Sanctum that ask for a piece of the environment which only one of the small packs has — read from their data, the way the contract reads it: the thorns, the shrine and the vial are the roots', the sigil of a
 * seal and the card are the seal's, the rune is the sanctum's. A pack is fetched only for the rooms that need it (the rooms of the slice keep the pack they had).
 */
const roomsAsking = (...pieces: string[]): string[] => {
  const asked = new Set(environmentSlots(WORLD.rooms.map((id) => ROOMS[id]!)).filter((s) => pieces.includes(slotKey(s.role, s.subject, s.part))).flatMap((s) => s.rooms));
  return WORLD.rooms.filter((id) => asked.has(id) && !SLICE_ROOMS.includes(id));
};

const solid = (material: 'earth' | 'stone'): SpriteSpec[] => {
  const style = material;
  return [
    {
      id: `${material}_fill`,
      tags: ['role:solid', `material:${material}`, 'part:fill', 'grid:4x2'],
      piece: material === 'earth' ? 'earthGrid' : 'stoneGrid',
      params: material === 'earth' ? { seed: SEED + 1, cols: 4, rows: 2 } : { seed: SEED + 2, cols: 4, rows: 2, style: 'courses', moss: 0.8, energy: 0.5 },
      cols: 4,
      rows: 2,
      pivot: [0, 0],
    },
    {
      id: `${material}_cap`,
      tags: ['role:solid', `material:${material}`, 'part:cap', 'grid:4x1', `rise:${material === 'earth' ? 0.34 : 0.12}`],
      piece: 'capStrip',
      params: { seed: SEED + 3, cols: 4, style: material === 'earth' ? 'turf' : 'stone' },
      cols: 4,
      rows: 1,
      pivot: [0, 0],
    },
    { id: `${material}_edge_l`, tags: ['role:solid', `material:${material}`, 'part:edge-l', 'grid:1x2', 'reach:0.12'], piece: 'edgeStrip', params: { seed: SEED + 4, rows: 2, style }, cols: 1, rows: 2, pivot: [0, 0] },
    { id: `${material}_edge_r`, tags: ['role:solid', `material:${material}`, 'part:edge-r', 'grid:1x2', 'reach:0.12'], piece: 'edgeStrip', params: { seed: SEED + 4, rows: 2, style }, cols: 1, rows: 2, mirror: true, pivot: [0, 0] },
  ];
};

/** A prop: a piece of decor placed by a scene, in the layer its tags name. Its pivot is where it stands (bottom centre). */
const prop = (id: string, piece: string, seed: number, sizeM: [number, number], layer: string, ppm?: number, extra: string[] = []): SpriteSpec => ({
  id,
  tags: ['role:decor', `layer:${layer}`, ...extra],
  piece,
  params: { seed },
  sizeM,
  ...(ppm ? { ppm } : {}),
  pivot: [0.5, 1],
});

/** A light: a picture whose alpha is its intensity, in pixels (a light needs no more density than its softness). */
const lightPiece = (id: string, piece: string, wPx: number, hPx: number, ppm: number, role: 'decor' | 'light', params: Record<string, unknown> = {}, layer = 'light-overlay'): SpriteSpec => ({
  id,
  tags: role === 'light' ? ['role:light', 'blend:add'] : ['role:decor', `layer:${layer}`, 'blend:add'],
  piece,
  params: { w: wPx, h: hPx, ...params },
  sizeM: [wPx / ppm, hPx / ppm],
  ppm,
  pivot: [0.5, 1],
});

const CYAN: [number, number, number] = [0.45, 0.92, 1];
const VIOLET: [number, number, number] = [0.62, 0.36, 1];

export const RUINS_GROUND: PackSpec = {
  id: 'ruins-ground',
  zones: DRESSED_ROOMS,
  ppm: 96,
  comment:
    'THE GROUND of the ruins: the pieces that dress the room\'s own data (docs/ART-PIPELINE-2D.md part M) — earth, stone, timber platforms and the gate — and the props that stand on them. ' +
    'Painted by the generator in tools/art (npm run art:build), not by a person: provisional until an artist reviews or replaces it.',
  sprites: [
    ...solid('earth'),
    ...solid('stone'),
    { id: 'wood_body', tags: ['role:platform', 'material:wood', 'part:body', 'grid:4x1', 'rise:0.1'], piece: 'platformPiece', params: { seed: SEED + 5, kind: 'body', cols: 4 }, cols: 4, rows: 1, pivot: [0, 0] },
    { id: 'wood_cap_l', tags: ['role:platform', 'material:wood', 'part:cap-l', 'reach:0.05', 'rise:0.1'], piece: 'platformPiece', params: { seed: SEED + 6, kind: 'end' }, pivot: [0, 0] },
    { id: 'wood_cap_r', tags: ['role:platform', 'material:wood', 'part:cap-r', 'reach:0.05', 'rise:0.1'], piece: 'platformPiece', params: { seed: SEED + 6, kind: 'end' }, mirror: true, pivot: [0, 0] },
    { id: 'gate_body', tags: ['role:door', 'material:gate', 'part:body'], piece: 'doorPiece', params: { seed: SEED + 7, part: 'body' }, pivot: [0, 1] },
    { id: 'gate_top', tags: ['role:door', 'material:gate', 'part:top', 'rise:0.1'], piece: 'doorPiece', params: { seed: SEED + 7, part: 'top' }, pivot: [0, 1] },
    { id: 'gate_bottom', tags: ['role:door', 'material:gate', 'part:bottom'], piece: 'doorPiece', params: { seed: SEED + 7, part: 'bottom' }, pivot: [0, 1] },
    { id: 'gate_glow', tags: ['role:door', 'material:gate', 'part:glow', 'blend:add', 'reach:0.9'], piece: 'lightGlow', params: { w: 128, h: 256, tint: VIOLET }, ppm: 32, pivot: [0, 1] },
    // the ground sinks into the dark: a veil stretched along every stretch of it
    { id: 'ground_veil', tags: ['role:decor', 'layer:terrain'], piece: 'groundVeil', params: { w: 16, h: 256 }, sizeM: [16 / 96, 256 / 96], pivot: [0.5, 1] },
    // what grows and lies on the ground
    prop('fern_a', 'ferns', 1, [1.6, 1.3], 'terrain'),
    prop('fern_b', 'ferns', 2, [1.6, 1.3], 'terrain'),
    prop('fern_c', 'ferns', 3, [1.6, 1.3], 'terrain'),
    prop('grass_a', 'grass', 3, [1.0, 0.55], 'terrain'),
    prop('grass_b', 'grass', 4, [1.0, 0.55], 'terrain'),
    prop('rubble_a', 'rubble', 4, [2.0, 0.9], 'terrain'),
    prop('rubble_b', 'rubble', 12, [2.0, 0.9], 'terrain'),
    prop('rubble_c', 'rubble', 15, [2.0, 0.9], 'terrain'),
    prop('crystals_a', 'crystals', 5, [1.1, 1.3], 'terrain'),
    prop('crystals_b', 'crystals', 25, [1.1, 1.3], 'terrain'),
    prop('mushrooms_a', 'mushrooms', 6, [1.0, 0.6], 'terrain'),
    prop('mushrooms_b', 'mushrooms', 16, [1.0, 0.6], 'terrain'),
    prop('roots_a', 'hangingRoots', 8, [1.6, 2.2], 'terrain'),
    prop('roots_b', 'hangingRoots', 18, [1.6, 2.2], 'terrain'),
    // what stands behind the action
    prop('column_whole_a', 'columnWhole', 10, [1.6, 5.2], 'props-back'),
    prop('column_broken_a', 'columnBroken', 11, [1.6, 3.7], 'props-back'),
    prop('column_broken_b', 'columnBroken', 21, [1.6, 3.7], 'props-back'),
    prop('rune_stone_a', 'runeStone', 7, [1.3, 3.2], 'props-back'),
    prop('effigy_a', 'effigy', 9, [1.6, 3.6], 'props-back'),
  ],
  scenes: { r1_gate: R1_SCENES.ground, r2_hall: R2_SCENES.ground, r3_chamber: R3_SCENES.ground, r4_sanctum: R4_SCENES.ground, ...WORLD_SCENES.ground },
};

export const RUINS_BACK: PackSpec = {
  id: 'ruins-back',
  zones: RUINS_ROOMS,
  ppm: 32,
  comment:
    'THE BACK of the ruins: the three seamless strips of the parallax layers (far haze, middle trunks, near colonnade), the colossal ruins that stand in the layers behind the action ' +
    'and the leaves in front of it. Painted by the generator in tools/art (npm run art:build), not by a person: provisional until an artist reviews or replaces it.',
  sprites: [
    { id: 'backdrop_far', tags: ['role:backdrop', 'backdrop:ruins', 'part:far'], piece: 'farStrip', params: { seed: SEED + 20 }, ppm: 20, pivot: [0, 1] },
    { id: 'backdrop_mid', tags: ['role:backdrop', 'backdrop:ruins', 'part:mid'], piece: 'midStrip', params: { seed: SEED + 21, w: 1536, h: 448 }, ppm: 25.6, pivot: [0, 1] },
    { id: 'backdrop_near', tags: ['role:backdrop', 'backdrop:ruins', 'part:near'], piece: 'nearStrip', params: { seed: SEED + 22, w: 1536, h: 691 }, ppm: 38.4, pivot: [0, 1] },
    prop('arch_grand_a', 'ruinedArch', 31, [12, 9], 'backdrop-near', 48),
    prop('arch_grand_b', 'ruinedArch', 32, [12, 9], 'backdrop-near', 48),
    prop('fore_leaves_a', 'foreLeaves', 41, [5, 3.4], 'foreground', 48),
    prop('fore_leaves_b', 'foreLeaves', 42, [5, 3.4], 'foreground', 48),
    prop('fore_leaves_c', 'foreLeaves', 43, [5, 3.4], 'foreground', 48),
  ],
  scenes: { r1_gate: R1_SCENES.back, r2_hall: R2_SCENES.back, r3_chamber: R3_SCENES.back, r4_sanctum: R4_SCENES.back, ...WORLD_SCENES.back },
};

export const RUINS_LIGHT: PackSpec = {
  id: 'ruins-light',
  zones: DRESSED_ROOMS,
  ppm: 32,
  comment:
    'THE LIGHT of the ruins: pictures whose alpha is intensity, drawn additively in a layer of their own (a shaft over a way out, glows, beams, mist, motes). ' +
    'Painted by the generator in tools/art (npm run art:build), not by a person: provisional until an artist reviews or replaces it.',
  sprites: [
    lightPiece('exit_shaft', 'lightShaft', 116, 320, 32, 'light'),
    lightPiece('glow_cyan', 'lightGlow', 128, 128, 32, 'decor', { tint: CYAN }),
    lightPiece('glow_violet', 'lightGlow', 128, 128, 32, 'decor', { tint: VIOLET }),
    lightPiece('beam_a', 'lightBeam', 256, 512, 32, 'decor', { seed: 5 }, 'backdrop-mid'),
    lightPiece('beam_b', 'lightBeam', 256, 512, 32, 'decor', { seed: 6 }, 'backdrop-mid'),
    lightPiece('mist_bank', 'lightMist', 1024, 192, 32, 'decor', { seed: 3 }),
    lightPiece('motes_a', 'lightMotes', 512, 384, 32, 'decor', { seed: 8 }),
  ],
  scenes: { r1_gate: R1_SCENES.light, r2_hall: R2_SCENES.light, r3_chamber: R3_SCENES.light, r4_sanctum: R4_SCENES.light, ...WORLD_SCENES.light },
};

/**
 * THE ROOTS of the Root Gallery (R2): what the forest has done to the ruins there — an arch of roots over the hall, curtains hanging in the dark, columns wound round by them, roots that
 * crawl on the ground, tendrils close to the eye — and the three small things that live in that room: the thorns of the ditch (the hazard `spikes`), the shrine where the hero rests
 * (the interactive `rest`, two frames: resting and lit) and the vial of the fourth bottle (the pickup that gives a bottle). Only R2 fetches it.
 */
export const RUINS_ROOTS: PackSpec = {
  id: 'ruins-roots',
  // the Root Gallery, every room that asks for one of its small pieces, and the rooms of the Sunken Roots, whose zone is made of what this pack holds (docs/PROMPT23-LOG.md §5)
  zones: [...new Set(['r2_hall', ...roomsAsking('hazard:spikes:cell').filter((id) => !(zoneOf(id) in SPIKES)), ...roomsAsking('interactive:rest:', 'interactive:pickup:bottle'), ...WORLD.rooms.filter((id) => zoneOf(id) === 'roots')])],
  ppm: 96,
  comment:
    'THE ROOTS of the Root Gallery: root arches, curtains, wound columns, roots on the ground, tendrils in the foreground, and the thorns, the shrine and the vial of that room. ' +
    'Painted by the generator in tools/art (npm run art:build), not by a person: provisional until an artist reviews or replaces it.',
  sprites: [
    prop('root_arch_a', 'rootArch', 51, [14, 10], 'backdrop-near', 48),
    prop('root_arch_b', 'rootArch', 52, [14, 10], 'backdrop-near', 48),
    prop('root_curtain_a', 'rootCurtain', 61, [4, 9], 'backdrop-mid', 32),
    prop('root_curtain_b', 'rootCurtain', 62, [4, 9], 'backdrop-mid', 32),
    prop('root_pillar_a', 'rootPillar', 71, [2.4, 6.6], 'props-back'),
    prop('root_pillar_b', 'rootPillar', 72, [2.4, 6.6], 'props-back'),
    prop('root_crawl_a', 'rootCrawl', 81, [3.4, 1.1], 'terrain'),
    prop('root_crawl_b', 'rootCrawl', 82, [3.4, 1.1], 'terrain'),
    prop('root_crawl_c', 'rootCrawl', 83, [3.4, 1.1], 'terrain'),
    prop('fore_roots_a', 'rootCurtainFore', 91, [5, 4], 'foreground', 48),
    prop('fore_roots_b', 'rootCurtainFore', 92, [5, 4], 'foreground', 48),
    prop('fore_roots_c', 'rootCurtainFore', 93, [5, 4], 'foreground', 48),
    // the thorns of the ditch: a periodic strip of four half-metre cells, from the floor of the zone up
    { id: 'thorns_cell', tags: ['role:hazard', 'kind:spikes', 'part:cell', 'grid:4x1'], piece: 'thorns', params: { seed: SEED + 40, cols: 4 }, cols: 4, rows: 1, pivot: [0, 1] },
    // the shrine of the hero's rest: two frames, resting and lit (the crystal burning), standing on the spot its data names
    { id: 'shrine_rest', tags: ['role:interactive', 'kind:rest'], piece: 'shrine', params: { seed: SEED + 41 }, cols: 2, rows: 1, pivot: [0.5, 1] },
    // the fourth bottle: a vial of light that floats over the spot its data names (the layer that draws it is additive)
    { id: 'vial_bottle', tags: ['role:interactive', 'kind:pickup', 'variant:bottle'], piece: 'vial', params: { seed: SEED + 42 }, sizeM: [0.7, 1.2], pivot: [0.5, 1] },
  ],
  scenes: { r2_hall: R2_SCENES.roots, ...ROOTS_SCENES_IN_RUINS_ROOTS },
};

/**
 * THE SEAL of the Seal Chamber (R3): the door of the ward and its sigil, the card of the Spirit Bolt and the altar it lies on, the carved walls, the portal of stone the ward is set in,
 * the paving of the ritual road and the circles of light on its stones. Only R3 fetches it.
 */
export const RUINS_SEAL: PackSpec = {
  id: 'ruins-seal',
  zones: ['r3_chamber', ...roomsAsking('door:seal:body', 'seal::', 'interactive:pickup:card')],
  ppm: 96,
  comment:
    'THE SEAL of the Seal Chamber: the door of the ward (the material "seal") and its sigil, the card of the Spirit Bolt, the altar, the carved walls, the portal, the paving and the circles of light. ' +
    'Painted by the generator in tools/art (npm run art:build), not by a person: provisional until an artist reviews or replaces it.',
  sprites: [
    // the door of the ward: 1.2 m wide, a column of cells 3 m tall (it repeats up the 9 m of the door), a cap with the diamond of the ward, a foot, and the violet light it gives
    { id: 'seal_body', tags: ['role:door', 'material:seal', 'part:body'], piece: 'sealDoor', params: { seed: SEED + 60, part: 'body' }, pivot: [0, 1] },
    { id: 'seal_top', tags: ['role:door', 'material:seal', 'part:top', 'rise:0.1'], piece: 'sealDoor', params: { seed: SEED + 60, part: 'top' }, pivot: [0, 1] },
    { id: 'seal_bottom', tags: ['role:door', 'material:seal', 'part:bottom'], piece: 'sealDoor', params: { seed: SEED + 60, part: 'bottom' }, pivot: [0, 1] },
    { id: 'seal_glow', tags: ['role:door', 'material:seal', 'part:glow', 'blend:add', 'reach:0.9'], piece: 'lightGlow', params: { w: 128, h: 256, tint: VIOLET }, ppm: 96, pivot: [0, 1] },
    // the sigil of the ward (the seal the Spirit Bolt breaks): two frames, hanging and flashing; it is light (a family of its own: the light of this pack is all drawn at 96 px/m)
    { id: 'seal_sigil', tags: ['role:seal', 'blend:add'], piece: 'sealSigil', params: { seed: SEED + 61 }, cols: 2, rows: 1, ppm: 96, pivot: [0.5, 0.5] },
    // the card of the Spirit Bolt: a pickup that gives a card, drawn as light over the ledge
    { id: 'card_spirit', tags: ['role:interactive', 'kind:pickup', 'variant:card'], piece: 'cardSpirit', params: { seed: SEED + 62 }, sizeM: [0.7, 1.1], pivot: [0.5, 1] },
    // what stands behind the action: the altar of the card, the carved walls and the portal
    prop('altar_card', 'pedestal', SEED + 63, [1.7, 1.3], 'props-back'),
    { id: 'relief_a', tags: ['role:decor', 'layer:props-back'], piece: 'relief', params: { seed: SEED + 64, variant: 0 }, sizeM: [3.2, 5], pivot: [0.5, 1] },
    { id: 'relief_b', tags: ['role:decor', 'layer:props-back'], piece: 'relief', params: { seed: SEED + 65, variant: 1 }, sizeM: [3.2, 5], pivot: [0.5, 1] },
    prop('portal_flank', 'pilaster', SEED + 66, [1.2, 9.6], 'props-back'),
    prop('portal_lintel', 'lintel', SEED + 67, [7.2, 1.5], 'props-back'),
    // the road: three strips of paving of 4 m, over the ground
    ...(['a', 'b', 'c'] as const).map(
      (v, i): SpriteSpec => ({ id: `paving_${v}`, tags: ['role:decor', 'layer:terrain'], piece: 'paving', params: { seed: SEED + 70 + i, cols: 4 }, sizeM: [4, 0.3], pivot: [0.5, 1] }),
    ),
    // the circles and the line of light on the stones: additive, in the layer of the light
    lightPiece('rune_circle', 'runeCircle', 288, 96, 96, 'decor', { seed: 2 }),
    lightPiece('rune_path', 'runePath', 576, 29, 96, 'decor', { seed: 3 }),
  ],
  scenes: { r3_chamber: R3_SCENES.seal },
};

/**
 * THE SANCTUM (R4): the hall where the hero rests one last time and the Ink Warden sleeps. Columns taller than the view, guardians of stone for the layers behind the action, the wall with an
 * eye cut into it, the shrine of the last rest, the dais and the rune of the Air Dash, the ink on the floor, banners, the portals at either end and the floor itself. Only R4 fetches it.
 */
const grand = (id: string, piece: string, seed: number, sizeM: [number, number], layer: string, ppm: number, params: Record<string, unknown> = {}): SpriteSpec => ({
  id,
  tags: ['role:decor', `layer:${layer}`],
  piece,
  params: { seed, ...params },
  sizeM,
  ppm,
  pivot: [0.5, 1],
});

export const RUINS_SANCTUM: PackSpec = {
  id: 'ruins-sanctum',
  zones: ['r4_sanctum', ...roomsAsking('interactive:pickup:rune')],
  ppm: 96,
  comment:
    'THE SANCTUM of the Ink Warden: columns taller than the view, guardians of stone, the wall with an eye cut into it, the shrine of the last rest, the rune of the Air Dash, the ink on the floor, banners, the portals and the floor. ' +
    'Painted by the generator in tools/art (npm run art:build), not by a person: provisional until an artist reviews or replaces it.',
  sprites: [
    // the hall: columns that leave the screen, guardians that watch from the haze, the wall with an eye, banners, the portals at the two ends — all in the layer behind the action (a single density, 40 px/m:
    // they are bigger than the screen, and a column does not need the hero's 96 to be a column)
    grand('column_grand_a', 'colossalColumn', SEED + 80, [2.6, 12], 'backdrop-near', 40, { variant: 0 }),
    grand('column_grand_b', 'colossalColumn', SEED + 81, [2.6, 12], 'backdrop-near', 40, { variant: 1 }),
    grand('portal_grand', 'portalGrand', SEED + 82, [7.4, 13], 'backdrop-near', 40),
    grand('colossus_a', 'colossus', SEED + 84, [5, 15], 'backdrop-near', 40, { variant: 0 }),
    grand('colossus_b', 'colossus', SEED + 85, [5, 15], 'backdrop-near', 40, { variant: 1 }),
    grand('eye_wall', 'eyeWall', SEED + 86, [10, 13], 'backdrop-near', 40),
    grand('banner_a', 'banner', SEED + 87, [2.4, 8], 'backdrop-near', 40, { variant: 0 }),
    grand('banner_b', 'banner', SEED + 88, [2.4, 8], 'backdrop-near', 40, { variant: 1 }),
    // at the depth of the hero: the dais of the reward
    grand('dais_reward', 'dais', SEED + 83, [2.6, 0.8], 'props-back', 96),
    // on the floor: the ink of the Warden, and the paving of the three stretches (cyan dashes, cold ticks, a double line)
    grand('ink_pool_a', 'inkPool', SEED + 89, [3.2, 0.8], 'terrain', 96),
    grand('ink_pool_b', 'inkPool', SEED + 90, [3.2, 0.8], 'terrain', 96),
    grand('ink_pool_c', 'inkPool', SEED + 91, [3.2, 0.8], 'terrain', 96),
    grand('paving_dashes', 'sanctumPaving', SEED + 92, [4, 0.3], 'terrain', 96, { cols: 4, style: 'dashes' }),
    grand('paving_ticks', 'sanctumPaving', SEED + 93, [4, 0.3], 'terrain', 96, { cols: 4, style: 'ticks' }),
    grand('paving_double', 'sanctumPaving', SEED + 94, [4, 0.3], 'terrain', 96, { cols: 4, style: 'double' }),
    // the shrine of the last rest: two frames, resting and lit
    { id: 'shrine_sanctum', tags: ['role:interactive', 'kind:rest'], piece: 'sanctumShrine', params: { seed: SEED + 95 }, cols: 2, rows: 1, pivot: [0.5, 1] },
    // the eye of the wall answers the fight: it burns while the Warden is awake (light, over the carved wall) and closes once it has fallen (a darkness over it). Their centre is the eye's
    { id: 'eye_awake', tags: ['role:decor', 'layer:backdrop-near', 'blend:add'], piece: 'eyeAwake', params: { seed: SEED + 97 }, sizeM: [8.4, 8.4], ppm: 32, pivot: [0.5, 1] },
    // (a soft darkness: painted small and fitted to the eye by the scene — it holds no detail to keep)
    grand('eye_dead', 'eyeDead', SEED + 98, [1.6, 1.6], 'backdrop-near', 40),
    // the ring on the floor of the arena: cold light, flattened (the one piece of light of this pack: its own family, at the density a soft light needs)
    lightPiece('ring_arena', 'arenaRing', 704, 35, 32, 'decor', { seed: 9 }),
    // the rune of the Air Dash: light that floats over the dais
    { id: 'rune_air', tags: ['role:interactive', 'kind:pickup', 'variant:rune'], piece: 'airRune', params: { seed: SEED + 96 }, sizeM: [1.9, 1.3], pivot: [0.5, 1] },
  ],
  scenes: { r4_sanctum: R4_SCENES.sanctum },
};

/**
 * THE INK WARDEN (docs/PROMPT8-LOG.md phase F): the boss of the Sanctum, painted in PARTS because the game moves them — the pose is the simulation's state, read by the view: the body, the eye, the crest in three
 * states (dim, awake, enraged), a shard of the two that hang at its sides, and the pool it melts into. A pack of the `enemies` category (drawn over the world, with a transparent background), fetched with R4 and let go
 * when the hero leaves it. Painted by the generator, not by a person: provisional until an artist reviews or replaces it.
 */
export const INK_WARDEN: PackSpec = {
  id: 'ink-warden',
  category: 'enemies',
  tags: ['boss'],
  zones: ['r4_sanctum'],
  ppm: 112,
  comment:
    'THE INK WARDEN, in parts: the body (a cloak of wet ink with its hood up, and its white flash), the eye, the crest in three states, a shard and the pool it melts into. Original and abstract: no face, no limbs. ' +
    'Painted by the generator in tools/art (npm run art:build), not by a person: provisional until an artist reviews or replaces it.',
  sprites: [
    { id: 'warden_body', tags: ['boss:ink_warden', 'part:body'], piece: 'wardenBody', params: { seed: SEED + 100 }, cols: 2, rows: 1, pivot: [0.5, 1] },
    { id: 'warden_eye', tags: ['boss:ink_warden', 'part:eye', 'blend:add'], piece: 'wardenEye', params: { seed: SEED + 101 }, sizeM: [1.4, 0.7], pivot: [0.5, 0.5] },
    { id: 'warden_crest', tags: ['boss:ink_warden', 'part:crest', 'blend:add'], piece: 'wardenCrest', params: { seed: SEED + 102 }, cols: 3, rows: 1, pivot: [0.5, 0.5] },
    { id: 'warden_shard', tags: ['boss:ink_warden', 'part:shard'], piece: 'wardenShard', params: { seed: SEED + 103 }, sizeM: [0.9, 1.2], pivot: [0.5, 0.5] },
    { id: 'warden_pool', tags: ['boss:ink_warden', 'part:pool'], piece: 'wardenPool', params: { seed: SEED + 104 }, sizeM: [4.6, 0.8], pivot: [0.5, 1] },
  ],
};

/**
 * THE INK SLIME (docs/PROMPT8-LOG.md phase G): the ordinary enemy of the slice, painted in PARTS because the game moves them — the pose is the simulation's state, read by the view: the body in four frames that "boil" (the
 * surface of the ink never rests), its white flash, the eyes, the sigil in its chest, the bristle that rises along its back as it winds up (three states) and the pool it rides in. A pack of the `enemies` category (drawn over the world,
 * with a transparent background), fetched with R1 and R2 — the two rooms where one lives — and let go when the hero leaves them. The body says where its eyes and its sigil stand with its `head` and `vfx_origin` anchors.
 * Painted by the generator, not by a person: provisional until an artist reviews or replaces it.
 */
export const INK_SLIME: PackSpec = {
  id: 'ink-slime',
  category: 'enemies',
  tags: ['enemy'],
  zones: ['r1_gate', 'r2_hall'],
  ppm: 96,
  comment:
    'THE INK SLIME, in parts: a low hunched creature of wet ink with its hood-peak thrown back and its cloak dragging behind it, a splinter of the seal burning in its chest, two slanted slits for eyes and a bristle that rises as it winds up to strike. ' +
    'Original: the same ink as the Warden it leaked from. Painted by the generator in tools/art (npm run art:build), not by a person: provisional until an artist reviews or replaces it.',
  sprites: [
    // where the eyes (`head`) and the sigil (`vfx_origin`) stand on the body: the numbers the painter draws them for (`painter/slime.ts`)
    { id: 'slime_body', tags: ['enemy:ink_slime', 'part:body'], piece: 'slimeBody', params: { seed: SEED + 110 }, cols: 4, rows: 1, pivot: [0.5, 1], anchors: { head: SLIME_EYES, vfx_origin: SLIME_SIGIL } },
    { id: 'slime_flash', tags: ['enemy:ink_slime', 'part:flash', 'blend:add'], piece: 'slimeFlash', params: { seed: SEED + 110 }, pivot: [0.5, 1] },
    { id: 'slime_eyes', tags: ['enemy:ink_slime', 'part:eyes', 'blend:add'], piece: 'slimeEyes', params: { seed: SEED + 111 }, sizeM: [1.0, 0.5], pivot: [0.5, 0.5] },
    { id: 'slime_sigil', tags: ['enemy:ink_slime', 'part:sigil', 'blend:add'], piece: 'slimeSigil', params: { seed: SEED + 112 }, sizeM: [0.9, 0.9], pivot: [0.5, 0.5] },
    { id: 'slime_spines', tags: ['enemy:ink_slime', 'part:spines'], piece: 'slimeSpines', params: { seed: SEED + 113 }, cols: 3, rows: 1, pivot: [0.5, 1] },
    { id: 'slime_pool', tags: ['enemy:ink_slime', 'part:pool'], piece: 'slimePool', params: { seed: SEED + 114 }, sizeM: [2.0, 0.3], pivot: [0.5, 1] },
  ],
};

/**
 * THE PARTS the rooms past the Sanctum ask for that no room of the slice did (docs/PROMPT23-LOG.md §5): the wall of split stone that the Ground Slam brings down — a door of the material `stone`, paler than the stone
 * around it and lit from inside by its cracks, so that it reads as the part that will break in a wall of any zone — and the lever of a shortcut, lit while it can still be pulled. The two pieces the contract listed as
 * "the blockout draws it" since Prompt 21. Fetched only for the rooms that ask.
 */
export const RUINS_PARTS: PackSpec = {
  id: 'ruins-parts',
  zones: roomsAsking('door:stone:body', 'interactive:activate:'),
  ppm: 96,
  comment:
    'THE PARTS of the shortcuts: the wall of split stone (the door of the material "stone": a column 1.5 m wide that glows from its cracks) and the lever (two frames: at rest, lit). ' +
    'Painted by the generator in tools/art (npm run art:build), not by a person: provisional until an artist reviews or replaces it.',
  sprites: [
    { id: 'stone_body', tags: ['role:door', 'material:stone', 'part:body'], piece: 'crackedDoor', params: { seed: SEED + 700 }, pivot: [0, 1] },
    { id: 'stone_glow', tags: ['role:door', 'material:stone', 'part:glow', 'blend:add', 'reach:0.4'], piece: 'lightGlow', params: { w: 128, h: 256, tint: CYAN }, ppm: 32, pivot: [0, 1] },
    { id: 'lever_activate', tags: ['role:interactive', 'kind:activate'], piece: 'lever', params: { seed: SEED + 701 }, cols: 2, rows: 1, pivot: [0.5, 1] },
  ],
};

export const PACKS: readonly PackSpec[] = [RUINS_GROUND, RUINS_BACK, RUINS_LIGHT, RUINS_ROOTS, RUINS_SEAL, RUINS_SANCTUM, RUINS_PARTS, INK_WARDEN, INK_SLIME];
