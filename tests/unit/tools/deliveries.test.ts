import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readDelivered } from '../../../tools/assets/heroRepo';
import { manifestAnchors } from '../../../tools/assets/intake';
import { prepareClip } from '../../../tools/assets/intakeRun';
import { encodePng } from '../../../tools/assets/png';

/**
 * THE DELIVERIES REPRODUCE (docs/PROMPT12-LOG.md): every clip the user's drawings entered through `npm run assets:intake` has its sources archived in `art/player/source/delivered/<clip>/` (the sheet or the
 * poses it was cut from, its anchors, its placement, what was accepted on purpose, the report). What is committed in `art/player/hero/` and in the manifest is therefore the PRODUCT of those sources and not of a
 * hand: preparing the archive again, in a copy of the repository whose inbox holds nothing else, must give — byte for byte — the frames of the game and the anchors of the manifest. If a clip's neighbour (the
 * clip its size is matched to) or the tool changes so that it no longer does, this fails and says which clip has to be delivered again.
 */
const root = fileURLToPath(new URL('../../../', import.meta.url));
const sha = (data: Uint8Array): string => createHash('sha256').update(data).digest('hex');
const archiveOf = (clip: string): string => join(root, 'art', 'player', 'source', 'delivered', clip);
const delivered = readDelivered(root);

describe('the archived deliveries give back the frames of the game', () => {
  let tmp = '';
  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'troid-reproduce-'));
    // the repository as it is — links, nothing is copied and nothing is written — except an inbox of its own, which holds one archive at a time
    mkdirSync(join(tmp, 'art', 'player'), { recursive: true });
    for (const e of readdirSync(join(root, 'art'))) if (e !== 'player') symlinkSync(join(root, 'art', e), join(tmp, 'art', e));
    for (const e of readdirSync(join(root, 'art', 'player'))) if (e !== 'inbox') symlinkSync(join(root, 'art', 'player', e), join(tmp, 'art', 'player', e));
    mkdirSync(join(tmp, 'art', 'player', 'inbox'));
  });
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it('has an archive for every clip the rig lists as handed over', () => {
    expect(delivered.length).toBeGreaterThan(0);
    for (const clip of delivered) expect(existsSync(archiveOf(clip)), `${clip}: art/player/source/delivered/${clip}/`).toBe(true);
  });

  it.each(delivered)('%s: its archived sheet, anchors, placement and waivers give exactly its frames and its anchors', (clip) => {
    const inbox = join(tmp, 'art', 'player', 'inbox', clip);
    mkdirSync(inbox, { recursive: true });
    for (const f of readdirSync(archiveOf(clip))) if (f !== 'delivery.json' && f !== 'report.md') copyFileSync(join(archiveOf(clip), f), join(inbox, f));
    const p = prepareClip(tmp, clip);
    expect(p.judgement.level, `${clip}: nothing in the archive is a failure that was not accepted on purpose`).not.toBe('fail');

    const hero = join(root, 'art', 'player', 'hero');
    const fingerprint = JSON.parse(readFileSync(join(archiveOf(clip), 'delivery.json'), 'utf8')) as { frames: Array<{ name: string; sha256: string }> };
    expect(fingerprint.frames.map((f) => f.name)).toEqual(p.names);
    p.names.forEach((name, k) => {
      const mine = sha(encodePng(p.frames[k]!));
      expect(mine, `${name}: the frame the archive gives is the committed one`).toBe(sha(readFileSync(join(hero, `${name}.png`))));
      expect(mine, `${name}: and the one its delivery recorded`).toBe(fingerprint.frames[k]!.sha256);
    });

    if (p.request.sword) {
      const manifest = (JSON.parse(readFileSync(join(root, 'art', 'player', 'player.pack.json'), 'utf8')) as { sprites: Array<{ frames: Record<string, { anchors: Record<string, [number, number]> }> }> }).sprites[0]!.frames;
      for (const name of p.names) expect(manifest[name]!.anchors, `${name}: the anchors of the manifest are the ones read from the archive`).toEqual(manifestAnchors(p.anchors.points.get(name)!, p.canvas));
    }
  }, 120_000);
});
