import { R1_SCENES } from '../scenes/r1';
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
const DRESSED_ROOMS = ['r1_gate'];
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
  scenes: { r1_gate: R1_SCENES.ground },
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
  scenes: { r1_gate: R1_SCENES.back },
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
  scenes: { r1_gate: R1_SCENES.light },
};

export const PACKS: readonly PackSpec[] = [RUINS_GROUND, RUINS_BACK, RUINS_LIGHT];
