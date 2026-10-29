import { ROOMS, WORLD } from '../../../src/content';
import { environmentSlots, PARALLAX_FACTOR, slotKey } from '../../../src/presentation/environment';
import { planStrip } from '../../../src/presentation/roomPlan';
import { EMBER_ZONE_IDS, type EmberZoneId } from '../painter/ember';
import { ZONE_IDS, type ZoneId } from '../painter/zones';
import { zoneOf } from '../scenes/world';
import { KITS, roomsOfZone, sceneFor, zoneSceneOf, type KitPiece } from '../scenes/zones';
import type { PackSpec, SpriteSpec } from '../spec';

/**
 * THE ZONES PAST THE RUINS, each with a scenery of its own (docs/PROMPT23-LOG.md §5): before this, the sixty rooms after the Sanctum were dressed with the one backdrop the four rooms of the slice were painted
 * for, so the Mines and the Foundry could not be told apart from a screenshot. A pack per zone — `zone-roots`, `zone-mire`, `zone-mines`, `zone-spire`, `zone-foundry`, `zone-heart` — holds what makes the zone that
 * zone and is fetched only for its rooms: the three strips of its backdrop (`backdrop:<zone>`), painted in the hue its mood names; the ground it is built of (stone, earth and timber that are not the ruins' — a
 * material is a piece of art, and the room's data names it); the pieces that stand, lie and hang in its rooms; the spikes of its ditches; and the light, in its colour. Every number here that is not a decision
 * of art direction is READ from the rooms: how tall a strip has to be is what the highest camera range of the zone asks of it (`planStrip`), never a guess, so the sky does not show over a strip in any room.
 */
const SEED = 7;
const FAR_PPM = 20;
const MID_PPM = 25.6;
/** The near strip is painted at 25 px/m, less where the tallest room of the zone asks for so much strip that it would not fit the memory of a zone (a room of 52 m of camera is 43 m of strip): never more than ~900 px tall. */
const NEAR_PPM = 25;
const NEAR_MAX_PX = 900;
/** The strips repeat every 60 m (far, mid) and 40 m (near). */
const FAR_W = 60;
const MID_W = 60;
const NEAR_W = 40;

const roomsOf = (zone: ZoneId): string[] => WORLD.rooms.filter((id) => zoneOf(id) === zone);

/** How tall, in metres, each layer's strip has to be for every room of the zone: the camera ranges decide. */
export function stripNeeds(zone: ZoneId): Record<'far' | 'mid' | 'near', number> {
  const need = { far: 0, mid: 0, near: 0 };
  for (const id of roomsOf(zone)) {
    const room = ROOMS[id]!;
    const camera = room.camera?.bounds ?? room.bounds;
    const viewHeight = Math.max(13.5, ...(room.camera?.zones ?? []).map((z) => z.viewHeight ?? 0));
    for (const [layer, part] of [['backdropFar', 'far'], ['backdropMid', 'mid'], ['backdropNear', 'near']] as const) need[part] = Math.max(need[part], planStrip(camera, PARALLAX_FACTOR[layer], 1, 1, viewHeight).needed);
  }
  return need;
}

const px = (metres: number, ppm: number): number => Math.ceil(metres * ppm) + 2;

/** The three strips of a zone's backdrop. */
function strips(zone: ZoneId): SpriteSpec[] {
  const n = stripNeeds(zone);
  const nearPpm = Math.min(NEAR_PPM, Math.floor(NEAR_MAX_PX / n.near));
  const base = SEED + 200 + ZONE_IDS.indexOf(zone) * 10;
  const tags = (part: string): string[] => ['role:backdrop', `backdrop:${zone}`, `part:${part}`];
  return [
    { id: 'backdrop_far', tags: tags('far'), piece: 'zoneFar', params: { zone, seed: base, w: FAR_W * FAR_PPM, h: px(n.far, FAR_PPM) }, ppm: FAR_PPM, pivot: [0, 1] },
    { id: 'backdrop_mid', tags: tags('mid'), piece: 'zoneMid', params: { zone, seed: base + 1, w: MID_W * MID_PPM, h: px(n.mid, MID_PPM) }, ppm: MID_PPM, pivot: [0, 1] },
    { id: 'backdrop_near', tags: tags('near'), piece: 'zoneNear', params: { zone, seed: base + 2, w: NEAR_W * nearPpm, h: px(n.near, nearPpm) }, ppm: nearPpm, pivot: [0, 1] },
  ];
}

// -------------------------------------------------------------------------------------------------------------------------------- the ground

/**
 * The materials of the ground of a zone, by the square of the room canvas each replaces (`#` stone, `G` earth, `-` platform: `materials` of `mapRoom`, in `src/content/rooms/<zone>.ts`). A test holds the two lists
 * together: what a room's data names is what its zone's pack paints. The Sunken Roots keep the ruins' own (the forest is where they were made) and the Mire keeps its stone and timber and has mud for earth.
 */
export interface Ground {
  char: '#' | 'G' | '-';
  material: string;
  skin: string;
  kind: 'stone' | 'earth' | 'platform';
  /** `stone` only: how it is laid and how much grows, cracks, stains and shines in it. */
  style?: 'courses' | 'cyclopean';
  moss?: number;
  energy?: number;
  cracks?: number;
  stains?: number;
  tone?: number;
  /** `earth` only: what the top edge of it is. */
  cap?: 'turf' | 'stone';
}

export const GROUNDS: Readonly<Record<ZoneId, readonly Ground[]>> = {
  roots: [],
  mire: [{ char: 'G', material: 'mud', skin: 'mud', kind: 'earth', cap: 'turf' }],
  mines: [
    { char: '#', material: 'rock', skin: 'rock', kind: 'stone', style: 'cyclopean', moss: 0.1, energy: 0.7, cracks: 0.8 },
    { char: 'G', material: 'gravel', skin: 'rock', kind: 'earth', cap: 'stone' },
    { char: '-', material: 'timber', skin: 'rock', kind: 'platform' },
  ],
  spire: [
    { char: '#', material: 'masonry', skin: 'masonry', kind: 'stone', style: 'courses', moss: 0.05, energy: 0, cracks: 0.4, stains: 0.6, tone: 0.36 },
    { char: 'G', material: 'flagstone', skin: 'masonry', kind: 'earth', cap: 'stone' },
    { char: '-', material: 'beam', skin: 'masonry', kind: 'platform' },
  ],
  foundry: [
    { char: '#', material: 'iron', skin: 'iron', kind: 'stone', style: 'courses', moss: 0.35, energy: 0.35, cracks: 0.5, stains: 1, tone: 0.36 },
    { char: 'G', material: 'slag', skin: 'iron', kind: 'earth', cap: 'stone' },
    { char: '-', material: 'grate', skin: 'iron', kind: 'platform' },
  ],
  heart: [
    { char: '#', material: 'ink', skin: 'ink', kind: 'stone', style: 'cyclopean', moss: 0.3, energy: 0.8, cracks: 0.8 },
    { char: 'G', material: 'inksoil', skin: 'ink', kind: 'earth', cap: 'stone' },
    { char: '-', material: 'bone', skin: 'ink', kind: 'platform' },
  ],
  // the second half (docs/PROMPT23-LOG.md §7). The Verge and the Grove are built of the same: the ruins' dressed stone gone the red-violet of a long dusk, ash with dried red turf on it and charred timber
  dusk: [
    { char: '#', material: 'cinder', skin: 'cinder', kind: 'stone', style: 'courses', moss: 0.25, energy: 0.6, cracks: 0.5, stains: 0.6, tone: 0.34 },
    { char: 'G', material: 'ash', skin: 'cinder', kind: 'earth', cap: 'turf' },
    { char: '-', material: 'charwood', skin: 'cinder', kind: 'platform' },
  ],
  grove: [
    { char: '#', material: 'cinder', skin: 'cinder', kind: 'stone', style: 'courses', moss: 0.35, energy: 0.7, cracks: 0.5, stains: 0.6, tone: 0.32 },
    { char: 'G', material: 'ash', skin: 'cinder', kind: 'earth', cap: 'turf' },
    { char: '-', material: 'charwood', skin: 'cinder', kind: 'platform' },
  ],
  // the Crater and the Throne: black basalt with fire in its cracks, scorched ground that is stone at the top, and a platform of volcanic glass
  crater: [
    { char: '#', material: 'basalt', skin: 'basalt', kind: 'stone', style: 'cyclopean', moss: 0.1, energy: 0.9, cracks: 0.8, stains: 0.6, tone: 0.3 },
    { char: 'G', material: 'scorch', skin: 'basalt', kind: 'earth', cap: 'stone' },
    { char: '-', material: 'obsidian', skin: 'basalt', kind: 'platform' },
  ],
  throne: [
    { char: '#', material: 'basalt', skin: 'basalt', kind: 'stone', style: 'courses', moss: 0.1, energy: 0.8, cracks: 0.7, stains: 0.8, tone: 0.28 },
    { char: 'G', material: 'scorch', skin: 'basalt', kind: 'earth', cap: 'stone' },
    { char: '-', material: 'obsidian', skin: 'basalt', kind: 'platform' },
  ],
};

/** The materials of the ground a zone paints (the ones a room's data may name). */
export const groundMaterials = (zone: ZoneId): string[] => GROUNDS[zone].map((g) => g.material);

function groundSprites(zone: ZoneId): SpriteSpec[] {
  const out: SpriteSpec[] = [];
  GROUNDS[zone].forEach((g, i) => {
    const seed = SEED + 500 + ZONE_IDS.indexOf(zone) * 30 + i * 6;
    const tag = (role: string, part: string, extra: string[] = []): string[] => [`role:${role}`, `material:${g.material}`, `part:${part}`, ...extra];
    if (g.kind === 'platform') {
      out.push(
        { id: `${g.material}_body`, tags: tag('platform', 'body', ['grid:4x1', 'rise:0.1']), piece: 'platformPiece', params: { skin: g.skin, seed, kind: 'body', cols: 4 }, cols: 4, rows: 1, pivot: [0, 0] },
        { id: `${g.material}_cap_l`, tags: tag('platform', 'cap-l', ['reach:0.05', 'rise:0.1']), piece: 'platformPiece', params: { skin: g.skin, seed: seed + 1, kind: 'end' }, pivot: [0, 0] },
        { id: `${g.material}_cap_r`, tags: tag('platform', 'cap-r', ['reach:0.05', 'rise:0.1']), piece: 'platformPiece', params: { skin: g.skin, seed: seed + 1, kind: 'end' }, mirror: true, pivot: [0, 0] },
      );
      return;
    }
    const capStyle = g.kind === 'earth' ? (g.cap ?? 'turf') : 'stone';
    out.push(
      {
        id: `${g.material}_fill`,
        tags: tag('solid', 'fill', ['grid:4x2']),
        piece: g.kind === 'stone' ? 'stoneGrid' : 'earthGrid',
        params: g.kind === 'stone' ? { skin: g.skin, seed, cols: 4, rows: 2, style: g.style ?? 'courses', moss: g.moss ?? 0.7, energy: g.energy ?? 0.6, cracks: g.cracks ?? 0.6, stains: g.stains ?? 0.8, tone: g.tone ?? 0.34 } : { skin: g.skin, seed, cols: 4, rows: 2 },
        cols: 4,
        rows: 2,
        pivot: [0, 0],
      },
      { id: `${g.material}_cap`, tags: tag('solid', 'cap', ['grid:4x1', `rise:${capStyle === 'turf' ? 0.34 : 0.12}`]), piece: 'capStrip', params: { skin: g.skin, seed: seed + 2, cols: 4, style: capStyle }, cols: 4, rows: 1, pivot: [0, 0] },
      { id: `${g.material}_edge_l`, tags: tag('solid', 'edge-l', ['grid:1x2', 'reach:0.12']), piece: 'edgeStrip', params: { skin: g.skin, seed: seed + 3, rows: 2, style: g.kind === 'stone' ? 'stone' : 'earth' }, cols: 1, rows: 2, pivot: [0, 0] },
      { id: `${g.material}_edge_r`, tags: tag('solid', 'edge-r', ['grid:1x2', 'reach:0.12']), piece: 'edgeStrip', params: { skin: g.skin, seed: seed + 3, rows: 2, style: g.kind === 'stone' ? 'stone' : 'earth' }, cols: 1, rows: 2, mirror: true, pivot: [0, 0] },
    );
  });
  return out;
}

/**
 * The spikes of the ditches, in the zones where they are not thorns: shards of crystal in the Mines, iron in the Spire and the Foundry, the thorns of the ink in the Heart, brambles with a rose point in the Verge and the Grove and
 * black glass with a hot tip in the Crater and the Throne. The forest's own (`ruins-roots`) stay for the Ruins, the Roots and the Mire — two packs never claim the same piece for the same room.
 */
export const SPIKES: Readonly<Partial<Record<ZoneId, 'crystal' | 'iron' | 'ink' | 'bramble' | 'obsidian'>>> = { mines: 'crystal', spire: 'iron', foundry: 'iron', heart: 'ink', dusk: 'bramble', grove: 'bramble', crater: 'obsidian', throne: 'obsidian' };

const spikeSprites = (zone: ZoneId): SpriteSpec[] => {
  const kind = SPIKES[zone];
  return kind ? [{ id: 'spikes_cell', tags: ['role:hazard', 'kind:spikes', 'part:cell', 'grid:4x1'], piece: 'spikeStrip', params: { kind, cols: 4, seed: SEED + 600 + ZONE_IDS.indexOf(zone) }, cols: 4, rows: 1, pivot: [0, 1] }] : [];
};

/** The light of lava: the orange of a pool, whatever the colour of the sky above it. */
export const LAVA_LIGHT: readonly [number, number, number] = [1, 0.52, 0.14];

/**
 * LAVA (docs/PROMPT23-LOG.md §6): the cell of a pool (`hazard:lava:cell`, four frames of one metre: a metre of lava and a third of a metre of heat over it), the fall the scene stretches over the columns of lava, the glow that lights the air
 * above both and the embers that rise from a pool. Only the zones of the second half have it: it is what the Cinder Throne's road is made of, and the Verge and the Grove, where it first shows, are the places the hero learns to read it.
 */
const lavaSprites = (zone: ZoneId): SpriteSpec[] => {
  if (!EMBER_ZONE_IDS.includes(zone as EmberZoneId)) return [];
  const seed = SEED + 640 + ZONE_IDS.indexOf(zone);
  return [
    { id: 'lava_cell', tags: ['role:hazard', 'kind:lava', 'part:cell', 'grid:4x1'], piece: 'lavaCell', params: { cols: 4, seed }, cols: 4, rows: 1, pivot: [0, 1] },
    { id: 'lava_fall', tags: ['role:decor', 'layer:terrain'], piece: 'lavaFall', params: { seed: seed + 1 }, sizeM: [1.2, 6], pivot: [0.5, 1] },
    lightPiece('glow_lava', 'lightGlow', 128, 128, LAVA_LIGHT, 'light-overlay', 2),
    lightPiece('embers', 'lightMotes', 512, 384, LAVA_LIGHT, 'light-overlay', 12),
  ];
};

// -------------------------------------------------------------------------------------------------------------------------------- the kit and the light

const TITLE: Readonly<Record<ZoneId, string>> = {
  roots: 'THE SUNKEN ROOTS: the green-black dark under the forest — trunks as wide as halls, the great roots that arch over the way and the curtains that hang from the roof of the world',
  mire: 'THE GLOWMIRE: black water and teal fog — dead trees, stilts, lanterns on posts and giant mushrooms that shine under their caps',
  mines: 'THE CRYSTAL MINES: the cold blue of a lamp in a mine — rock that goes up into the dark, the roof with its teeth, timber that holds the galleries up and crystals that shine',
  spire: 'THE BELL SPIRE: the bronze of old metal in the wind — towers and pinnacles in a warm dusk, the buttresses that hold them, bells on their yokes and the arcades of the stair',
  foundry: 'THE INK FOUNDRY: the red-black of a furnace gone cold — stacks, tanks, pipes, trusses and gears in a smoky haze, a few furnaces still warm',
  heart: 'THE HEART OF THE INK: violet-black — ribs that curl over the dark, veins that shine, cysts that hang and crystals at the foot of everything',
  dusk: 'THE DUSK VERGE: the dusk of the reference image — a sky that goes from violet to crimson, thin crooked trees that stand on their own roots and hold a sphere of red light, a pink mist over the ground and the first pools of lava',
  grove: 'THE ORB GROVE: the same dusk, deeper and denser — trees in clusters, spheres in bunches and drops of light that hang from the roof, with lava between the roots',
  crater: 'THE EMBER CRATER: the spheres are dying and the light comes from below — an orange sky over the rim, black basalt cracked with fire, ash, embers and lava in pools and falls',
  throne: 'THE CINDER THRONE: black crimson — broken arches and towers against a red sky, cages of thorn around dim spheres, chains, and the one great sphere low in the sky',
};

/** A piece of the zone's kit as sprites: two of each, painted from different seeds. */
function kitSprites(zone: ZoneId, pieces: readonly KitPiece[], layer: 'props-back' | 'terrain' | 'foreground', base: number): SpriteSpec[] {
  const ppm = layer === 'foreground' ? 48 : 96;
  return pieces
    .filter((p) => p.pack === undefined)
    .flatMap((p, i) =>
      (['a', 'b'] as const).map(
        (v, vi): SpriteSpec => ({
          id: `${p.kind}_${v}`,
          tags: ['role:decor', `layer:${layer}`],
          piece: layer === 'foreground' ? 'zoneHanging' : 'zoneProp',
          params: { zone, kind: p.kind, seed: base + i * 7 + vi * 3 },
          sizeM: [p.w, p.h],
          ppm,
          pivot: [0.5, 1],
        }),
      ),
    );
}

/**
 * A piece of the light: a picture whose alpha is its intensity, in the colour of the zone. Painted at the density of the ruins' light and kept at half of it (`scale`): a light needs no more than its softness, and the sixty rooms past the
 * Ruins each hold a set of their own, so what a zone costs in memory is mostly decided here (docs/PROMPT23-LOG.md §5.5).
 */
const lightPiece = (id: string, piece: string, wPx: number, hPx: number, tint: readonly [number, number, number], layer: string, seed: number): SpriteSpec => ({
  id,
  tags: ['role:decor', `layer:${layer}`, 'blend:add'],
  piece,
  params: { w: wPx, h: hPx, seed, tint: [...tint] },
  sizeM: [wPx / 32, hPx / 32],
  ppm: 32,
  scale: 0.5,
  pivot: [0.5, 1],
});

const CYAN: readonly [number, number, number] = [0.45, 0.92, 1];
const VIOLET: readonly [number, number, number] = [0.62, 0.36, 1];

export function zonePack(zone: ZoneId): PackSpec {
  const kit = KITS[zone];
  const base = SEED + 300 + ZONE_IDS.indexOf(zone) * 40;
  const id = `zone-${zone}`;
  return {
    id,
    zones: roomsOf(zone),
    tags: [zone],
    ppm: 96,
    comment: `${TITLE[zone]}. What makes the zone that zone: the three seamless strips of its backdrop, tall enough for the camera of every room of it; the ground its rooms are built of; the pieces that stand, lie and hang in them; ${SPIKES[zone] ? 'the spikes of its ditches; ' : ''}${lavaSprites(zone).length > 0 ? 'the lava, its fall and its embers; ' : ''}and the light in its colour. Painted by the generator in tools/art (npm run art:build), not by a person: provisional until an artist reviews or replaces it.`,
    sprites: [
      ...strips(zone),
      ...groundSprites(zone),
      ...spikeSprites(zone),
      ...lavaSprites(zone),
      ...kitSprites(zone, kit.landmarks, 'props-back', base),
      ...kitSprites(zone, kit.ground, 'terrain', base + 20),
      ...kitSprites(zone, kit.hanging, 'foreground', base + 30),
      lightPiece('beam_a', 'lightBeam', 256, 512, kit.light, 'backdrop-mid', 5),
      lightPiece('beam_b', 'lightBeam', 256, 512, kit.light, 'backdrop-mid', 6),
      lightPiece('mist_bank', 'lightMist', 1024, 192, kit.light, 'light-overlay', 3),
      lightPiece('motes_zone', 'lightMotes', 512, 384, kit.light, 'light-overlay', 8),
      lightPiece('glow_zone', 'lightGlow', 128, 128, kit.light, 'light-overlay', 1),
      lightPiece('glow_rest', 'lightGlow', 128, 128, CYAN, 'light-overlay', 1),
      lightPiece('glow_boss', 'lightGlow', 128, 128, VIOLET, 'light-overlay', 1),
      // the shaft of light over a way out is the same in every zone (a way out is a way out), and it is the zone's own now: the pack of the ruins' light is only for the ruins
      { id: 'exit_shaft', tags: ['role:light', 'blend:add'], piece: 'lightShaft', params: { w: 116, h: 320 }, sizeM: [116 / 32, 320 / 32], ppm: 32, scale: 0.5, pivot: [0.5, 1] },
    ],
    scenes: Object.fromEntries(roomsOf(zone).map((room) => [room, () => zoneSceneOf(ROOMS[room]!, id)])),
  };
}

/** A zone pack is made for the rooms that name it: a zone with none (the zones of the second half before their rooms are written) has no pack. */
export const ZONE_PACKS: readonly PackSpec[] = ZONE_IDS.map(zonePack).filter((p) => (p.zones?.length ?? 0) > 0);

/** The scenes of the roots' own pieces that live in the pack of the ruins' roots (`ruins-roots`): the pillars, the crawling roots and the roots in front. */
export const ROOTS_SCENES_IN_RUINS_ROOTS: Record<string, () => ReturnType<typeof sceneFor>> = Object.fromEntries(roomsOfZone('roots').map((room) => [room, () => sceneFor(ROOMS[room]!, 'ruins-roots')]));

/** The rooms of the world that ask for one of the given pieces (`role:subject:part`), as the contract reads them from the data. */
export const roomsAskingFor = (...pieces: string[]): string[] => {
  const asked = new Set(environmentSlots(WORLD.rooms.map((id) => ROOMS[id]!)).filter((s) => pieces.includes(slotKey(s.role, s.subject, s.part))).flatMap((s) => s.rooms));
  return WORLD.rooms.filter((id) => asked.has(id));
};
