import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLAYER_VISUAL } from '../../src/content/visuals';
import { artClipFrames, CLIP_ALIASES, parseArtIndex, parseArtPack } from '../../src/presentation/artManifest';
import { SWORD_STATES } from '../../src/presentation/validateSpriteSet';
import { ONE_SHOT_STATES, type AnimState } from '../../src/presentation/vocabulary';
import { parseSheetSpec } from './sheet';

/**
 * WHAT OF THE PROTAGONIST'S ART HAS BEEN DELIVERED, AND WHAT HAS NOT (docs/guides/deliver-protagonist-art.md): the answer, computed from the folder the artist
 * hands over (`art/`) and from the game's own list of what it asks for (`content/visuals.ts`), so that it can never go out of date — as frames arrive it
 * changes by itself. It only READS: it writes nothing and never decides anything about the art.
 *
 * A clip is DELIVERED when the manifest declares it, every frame it names is there (as a file or as a cell of a sheet the manifest cuts), and the pack is no
 * longer `awaiting-art`.
 */
export interface DeliveryRow {
  state: AnimState;
  /** Other names an artist may use for it in the manifest (`aerialAttack` for `attackAir`). */
  alsoCalled: string[];
  /** One of the six to validate first. */
  first: boolean;
  /** A blow: every frame needs the sword anchors (`hand_r`, `weapon_grip`, `weapon_tip`) and the phases. */
  sword: boolean;
  /** Plays once and holds its last frame (a loop otherwise). */
  once: boolean;
  /** The frame-name prefix the manifest declares for it, or `null` when it is not declared. */
  prefix: string | null;
  /** Frames the manifest says it has (nominal 1 while the pack awaits its art), and the names of those that are not there. */
  wanted: number;
  missing: string[];
  delivered: boolean;
}

export interface DeliveryReport {
  pack: string;
  sprite: string;
  /** The status of the pack in the manifest, or `none` when there is no `art/` declaration of it at all. */
  status: string;
  rows: DeliveryRow[];
  delivered: number;
  total: number;
}

const aliasesOf = (state: AnimState): string[] => Object.entries(CLIP_ALIASES).filter(([, s]) => s === state).map(([a]) => a);

/** Reads what has been handed over. Never throws: a missing or broken declaration is `status: "none"` with every clip missing. */
export function readDelivery(srcDir: string): DeliveryReport {
  const { pack, sprite } = PLAYER_VISUAL.art;
  const empty = (status: string): DeliveryReport => ({
    pack,
    sprite,
    status,
    rows: PLAYER_VISUAL.required.map((state) => ({
      state, alsoCalled: aliasesOf(state), first: PLAYER_VISUAL.first.includes(state), sword: SWORD_STATES.includes(state), once: ONE_SHOT_STATES.has(state), prefix: null, wanted: 0, missing: [], delivered: false,
    })),
    delivered: 0,
    total: PLAYER_VISUAL.required.length,
  });
  try {
    const index = parseArtIndex(JSON.parse(readFileSync(join(srcDir, 'index.json'), 'utf8')) as unknown).value;
    const entry = index?.packs.find((p) => p.id === pack);
    if (!entry) return empty('none');
    const raw = JSON.parse(readFileSync(join(srcDir, ...entry.manifest.split('/')), 'utf8')) as Record<string, unknown>;
    const status = typeof raw['status'] === 'string' ? raw['status'] : 'final';
    const rawSprites = Array.isArray(raw['sprites']) ? (raw['sprites'] as Array<Record<string, unknown>>) : [];
    // the sprite sets as declared, read the way the packer reads them (the atlases are what the packer fills in)
    const parsed = parseArtPack({ ...raw, status: 'awaiting-art', atlases: [], sprites: rawSprites.map((s) => ({ ...s, atlases: [] })) }).value;
    const declared = parsed?.sprites.find((s) => s.id === sprite);
    if (!declared) return empty(status);
    const setDir = join(srcDir, ...entry.manifest.split('/').slice(0, -1), sprite);
    const files = new Set(existsSync(setDir) ? readdirSync(setDir).filter((f) => f.toLowerCase().endsWith('.png')).map((f) => f.slice(0, -4)) : []);
    for (const rs of (rawSprites.find((s) => s['id'] === sprite)?.['sheets'] as unknown[] | undefined) ?? []) {
      const spec = parseSheetSpec(rs).spec;
      if (spec) for (let i = 0; i < spec.count; i++) files.add(`${spec.prefix}${String(spec.first + i).padStart(2, '0')}`);
    }
    const rows: DeliveryRow[] = PLAYER_VISUAL.required.map((state) => {
      const clip = declared.clips[state];
      const names = clip ? artClipFrames(clip) : [];
      const missing = names.filter((n) => !files.has(n));
      return {
        state, alsoCalled: aliasesOf(state), first: PLAYER_VISUAL.first.includes(state), sword: SWORD_STATES.includes(state), once: ONE_SHOT_STATES.has(state),
        prefix: clip?.frames ?? null, wanted: names.length, missing, delivered: status !== 'awaiting-art' && clip !== undefined && missing.length === 0,
      };
    });
    return { pack, sprite, status, rows, delivered: rows.filter((r) => r.delivered).length, total: rows.length };
  } catch {
    return empty('none');
  }
}

/** The report as text, for a person. */
export function formatDelivery(r: DeliveryReport): string {
  const lines: string[] = [];
  lines.push(`The protagonist's art — pack "${r.pack}", sprite set "${r.sprite}" (${r.status === 'none' ? 'not declared in art/' : `status: ${r.status}`})`);
  lines.push(`Delivered: ${r.delivered} of ${r.total} clips. ${r.delivered === r.total ? 'The game draws the protagonist entirely with it.' : 'The game draws the rest with its placeholder.'}`);
  lines.push('');
  lines.push(`  ${'clip'.padEnd(14)}${'also called'.padEnd(25)}${'kind'.padEnd(6)}${'sword'.padEnd(7)}${'first'.padEnd(7)}state`);
  for (const row of r.rows) {
    const state = row.delivered
      ? `delivered (${row.wanted} frame${row.wanted === 1 ? '' : 's'})`
      : row.prefix === null
        ? 'NOT DECLARED in the manifest'
        : row.missing.length === 0 && r.status === 'awaiting-art'
          ? 'frames are there but the manifest still says awaiting-art'
          : r.status === 'awaiting-art' && row.missing.length === row.wanted
            ? 'NOT DELIVERED: no frame files yet'
            : `MISSING ${row.missing.length} of ${row.wanted}: ${row.missing.slice(0, 3).join(', ')}${row.missing.length > 3 ? ', …' : ''}`;
    lines.push(`  ${row.state.padEnd(14)}${(row.alsoCalled.join(', ') || '—').padEnd(25)}${(row.once ? 'once' : 'loop').padEnd(6)}${(row.sword ? 'yes' : '—').padEnd(7)}${(row.first ? 'first' : '').padEnd(7)}${state}`);
  }
  lines.push('');
  lines.push('How to deliver it: docs/guides/deliver-protagonist-art.md');
  return lines.join('\n');
}
