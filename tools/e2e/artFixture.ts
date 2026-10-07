import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { BrowserContext } from 'playwright-core';
import { Rng } from '@/core/rng';
import { buildArt } from '../assets/build';
import { encodePng, type RgbaImage } from '../assets/png';

/**
 * SYNTHETIC ART for the E2E that load art (docs/ART-PIPELINE-2D.md, part C): packs of noise on a transparent canvas — not a character, not a scene, no art
 * at all — written as PNG frames in a temp folder, built by the REAL packer (`buildArt`) and served to the page by `context.route`. Nothing is committed and
 * nothing is generated into `public/`: the game under test finds, through `?art=<folder>`, exactly what a real build of real art would give it.
 */
export interface FixtureSprite {
  id: string;
  /** The canvas every frame of the set is drawn on, in pixels. */
  canvas: [number, number];
  /** State → number of frames (the frame prefix is `<state>_`, `idle_00`…). */
  clips: Record<string, number>;
  /** Extra keys of a clip (`phases`, `fps`…), by state. */
  clipExtra?: Record<string, Record<string, unknown>>;
  /** The clips that hold the sword (the blows): each of their frames gets the anchors of the sword contract, the hand and the grip together and the tip ahead of them. */
  sword?: string[];
  /** Extra keys of the sprite set in the manifest (`anchors`, `scale`, `missingClips`…). */
  extra?: Record<string, unknown>;
}

export interface FixturePack {
  id: string;
  category: 'player' | 'enemies' | 'environment' | 'vfx' | 'ui';
  load: 'boot' | 'zone' | 'lazy';
  zones?: string[];
  sprites: FixtureSprite[];
}

export type Fault = 'corrupt' | 'abort';

export interface Fixture {
  /** The folder the packer wrote (what the game fetches). */
  dir: string;
  /** What the pages asked for, relative to the fixture's folder, in order (all pages of all contexts that were served by it). */
  requests: string[];
  /** Files to break: `corrupt` answers 200 with garbage, `abort` cuts the request. Set before the page opens. */
  faults: Map<string, Fault>;
  /** Decoded memory of the pages of each pack (RGBA8), as the packer wrote them. */
  decodedBytes: Record<string, number>;
  /** Serves the folder under `**&#47;<prefix>&#47;**` to every page of a context. */
  serve(context: BrowserContext, prefix: string): Promise<void>;
  cleanup(): void;
}

/** A frame of noise: a solid block (random colours, alpha never 0) somewhere on a transparent canvas, so that the packer has something to trim. */
function noise(canvas: [number, number], seed: number): RgbaImage {
  const [w, h] = canvas;
  const rng = new Rng(seed);
  const data = new Uint8Array(w * h * 4);
  const bw = Math.max(4, Math.floor(w * 0.5));
  const bh = Math.max(4, Math.floor(h * 0.7));
  const x0 = rng.int(1, Math.max(2, w - bw - 1));
  const y0 = rng.int(1, Math.max(2, h - bh - 1));
  for (let y = y0; y < y0 + bh; y++) for (let x = x0; x < x0 + bw; x++) data.set([rng.int(0, 256), rng.int(0, 256), rng.int(0, 256), 255], (y * w + x) * 4);
  return { width: w, height: h, data };
}

const json = (v: unknown): string => JSON.stringify(v, null, 2);

/** The sword contract for the blows of a set: hand and grip on each other, the tip ahead, all moving forward through the swing (metres from the feet). */
function swordFrames(s: FixtureSprite): Record<string, unknown> {
  const frames: Record<string, unknown> = {};
  for (const state of s.sword ?? []) {
    const count = s.clips[state] ?? 0;
    for (let i = 0; i < count; i++) {
      const hand: [number, number] = [0.25 + 0.15 * i, 1.05];
      frames[`${state}_${String(i).padStart(2, '0')}`] = { anchors: { hand_r: hand, weapon_grip: hand, weapon_tip: [hand[0] + 0.9, 1.25] } };
    }
  }
  return frames;
}

export function createArtFixture(packs: readonly FixturePack[]): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'troid-e2e-art-'));
  const src = join(root, 'art');
  const out = join(root, 'served');
  const put = (file: string, data: Buffer | string): void => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, data);
  };
  let seed = 1;
  put(join(src, 'index.json'), json({ manifestVersion: 1, packs: packs.map((p) => ({ id: p.id, category: p.category, load: p.load, ...(p.zones ? { zones: p.zones } : {}), manifest: `${p.id}/${p.id}.pack.json` })) }));
  for (const p of packs) {
    put(
      join(src, p.id, `${p.id}.pack.json`),
      json({
        manifestVersion: 1,
        id: p.id,
        category: p.category,
        status: 'provisional',
        atlases: [],
        sprites: p.sprites.map((s) => ({
          id: s.id,
          artPxPerMeter: 60,
          pivot: [0.5, 1],
          height: Math.round((s.canvas[1] / 60) * 0.85 * 100) / 100, // the figure fills most of its canvas, as a drawn one would
          clips: Object.fromEntries(Object.entries(s.clips).map(([state, count]) => [state, { frames: `${state}_`, count, fps: 8, ...s.clipExtra?.[state] }])),
          ...(s.sword ? { frames: swordFrames(s) } : {}),
          ...s.extra,
        })),
      }),
    );
    for (const s of p.sprites) {
      for (const [state, count] of Object.entries(s.clips)) {
        for (let i = 0; i < count; i++) put(join(src, p.id, s.id, `${state}_${String(i).padStart(2, '0')}.png`), encodePng(noise(s.canvas, seed++)));
      }
    }
  }
  const built = buildArt({ srcDir: src, outDir: out, write: true });
  if (!built.ok) throw new Error(`the fixture art does not build:\n${built.issues.map((i) => `${i.path}: ${i.message}`).join('\n')}`);

  const requests: string[] = [];
  const faults = new Map<string, Fault>();
  const decodedBytes: Record<string, number> = {};
  for (const p of packs) {
    let total = 0;
    for (const rel of built.written.filter((f) => f.startsWith(`${p.id}/`) && f.endsWith('.png'))) {
      const png = readFileSync(join(out, ...rel.split('/')));
      total += png.readUInt32BE(16) * png.readUInt32BE(20) * 4; // IHDR: width, height
    }
    decodedBytes[p.id] = total;
  }

  return {
    dir: out,
    requests,
    faults,
    decodedBytes,
    async serve(context, prefix) {
      await context.route(`**/${prefix}/**`, async (route) => {
        const path = new URL(route.request().url()).pathname;
        const rel = decodeURIComponent(path.slice(path.indexOf(`/${prefix}/`) + prefix.length + 2));
        requests.push(rel);
        const fault = faults.get(rel);
        if (fault === 'abort') return route.abort('aborted');
        const file = join(out, ...rel.split('/'));
        if (!existsSync(file)) return route.fulfill({ status: 404, body: 'not here' });
        if (fault === 'corrupt') return route.fulfill({ status: 200, contentType: rel.endsWith('.png') ? 'image/png' : 'application/json', body: 'this is not what it says it is' });
        return route.fulfill({ status: 200, contentType: rel.endsWith('.png') ? 'image/png' : 'application/json', body: readFileSync(file) });
      });
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
