import { R1_SCENES } from '../scenes/r1';
import { R2_SCENES } from '../scenes/r2';
import { R3_SCENES } from '../scenes/r3';
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
const DRESSED_ROOMS = ['r1_gate', 'r2_hall', 'r3_chamber'];
const SEED = 7;

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
  scenes: { r1_gate: R1_SCENES.ground, r2_hall: R2_SCENES.ground, r3_chamber: R3_SCENES.ground },
};

export const RUINS_BACK: PackSpec = {
  id: 'ruins-back',
  zones: DRESSED_ROOMS,
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
  scenes: { r1_gate: R1_SCENES.back, r2_hall: R2_SCENES.back, r3_chamber: R3_SCENES.back },
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
  scenes: { r1_gate: R1_SCENES.light, r2_hall: R2_SCENES.light, r3_chamber: R3_SCENES.light },
};

/**
 * THE ROOTS of the Root Gallery (R2): what the forest has done to the ruins there — an arch of roots over the hall, curtains hanging in the dark, columns wound round by them, roots that
 * crawl on the ground, tendrils close to the eye — and the three small things that live in that room: the thorns of the ditch (the hazard `spikes`), the shrine where the hero rests
 * (the interactive `rest`, two frames: resting and lit) and the vial of the fourth bottle (the pickup that gives a bottle). Only R2 fetches it.
 */
export const RUINS_ROOTS: PackSpec = {
  id: 'ruins-roots',
  zones: ['r2_hall'],
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
  scenes: { r2_hall: R2_SCENES.roots },
};

/**
 * THE SEAL of the Seal Chamber (R3): the door of the ward and its sigil, the card of the Spirit Bolt and the altar it lies on, the carved walls, the portal of stone the ward is set in,
 * the paving of the ritual road and the circles of light on its stones. Only R3 fetches it.
 */
export const RUINS_SEAL: PackSpec = {
  id: 'ruins-seal',
  zones: ['r3_chamber'],
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

export const PACKS: readonly PackSpec[] = [RUINS_GROUND, RUINS_BACK, RUINS_LIGHT, RUINS_ROOTS, RUINS_SEAL];
