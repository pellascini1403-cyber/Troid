import type { PackSpec } from '../spec';
import { PACKS as RUINS_PACKS } from './ruins';
import { VFX_PACKS } from './vfx';
import { ZONE_PACKS } from './zones';

/** Every pack the painter makes: the scenery and the creatures of the ruins, the scenery of each zone after them, and the light of the effects (what `npm run art:build` paints, and what the tests ask whether `art/` is up to date with). */
export const PACKS: readonly PackSpec[] = [...RUINS_PACKS, ...ZONE_PACKS, ...VFX_PACKS];
