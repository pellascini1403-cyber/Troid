/**
 * Regenerates every placeholder model under public/assets/models/.
 *   npm run gen:models
 * The .glb files are committed so the app never needs to run this; it exists so the placeholders (and the
 * naming conventions they demonstrate) stay reproducible and editable.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { exportGlb } from './exportGlb';
import { buildMannequin } from './mannequin';
import { MANNEQUIN_CLIPS } from './mannequinClips';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../../public/assets/models');

const mannequin = buildMannequin(MANNEQUIN_CLIPS);
const bytes = await exportGlb(mannequin.scene, mannequin.clips, resolve(out, 'mannequin.glb'));
console.log(`mannequin.glb  ${(bytes / 1024).toFixed(1)} KB  (${mannequin.clips.length} clips)`);
