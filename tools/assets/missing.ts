import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLAYER_VISUAL } from '../../src/content/visuals';
import { artClipFrames, CLIP_ALIASES, parseArtIndex, parseArtPack } from '../../src/presentation/artManifest';
import { ENV_CONTRACT, readEnvTags, slotKey, type EnvSlot } from '../../src/presentation/environment';
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

/** The names of the frames the folder of a sprite set really has: PNG files next to the manifest, and the cells of the sheets the manifest cuts. */
function framesPresent(srcDir: string, manifest: string, spriteId: string, rawSprite: Record<string, unknown> | undefined): Set<string> {
  const setDir = join(srcDir, ...manifest.split('/').slice(0, -1), spriteId);
  const files = new Set(existsSync(setDir) ? readdirSync(setDir).filter((f) => f.toLowerCase().endsWith('.png')).map((f) => f.slice(0, -4)) : []);
  for (const rs of (rawSprite?.['sheets'] as unknown[] | undefined) ?? []) {
    const spec = parseSheetSpec(rs).spec;
    if (spec) for (let i = 0; i < spec.count; i++) files.add(`${spec.prefix}${String(spec.first + i).padStart(2, '0')}`);
  }
  return files;
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
    const files = framesPresent(srcDir, entry.manifest, sprite, rawSprites.find((s) => s['id'] === sprite));
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

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the environment

export interface EnvDeliveryRow {
  slot: EnvSlot;
  delivered: boolean;
  /** `pack/sprite` that draws it. */
  by: string | null;
}

export interface EnvDeliveryReport {
  /** The environment packs the index lists, with their status. */
  packs: Array<{ id: string; status: string }>;
  rows: EnvDeliveryRow[];
  /** Required pieces delivered / asked for. */
  delivered: number;
  total: number;
}

/**
 * WHAT OF THE ENVIRONMENT'S ART HAS BEEN DELIVERED (docs/ART-PIPELINE-2D.md, part I): the pieces the world's rooms ask for (`slots`, read from their data) against
 * the sprites of the environment packs in the folder. A sprite counts when its pack no longer awaits its art, its `idle` frames are there and its tags say what it
 * draws. It only READS.
 */
export function readEnvironmentDelivery(srcDir: string, slots: readonly EnvSlot[]): EnvDeliveryReport {
  const drawn = new Map<string, string>();
  const packs: EnvDeliveryReport['packs'] = [];
  try {
    const index = parseArtIndex(JSON.parse(readFileSync(join(srcDir, 'index.json'), 'utf8')) as unknown).value;
    for (const entry of index?.packs.filter((p) => p.category === 'environment') ?? []) {
      try {
        const raw = JSON.parse(readFileSync(join(srcDir, ...entry.manifest.split('/')), 'utf8')) as Record<string, unknown>;
        const status = typeof raw['status'] === 'string' ? raw['status'] : 'final';
        packs.push({ id: entry.id, status });
        const rawSprites = Array.isArray(raw['sprites']) ? (raw['sprites'] as Array<Record<string, unknown>>) : [];
        const parsed = parseArtPack({ ...raw, status: 'awaiting-art', atlases: [], sprites: rawSprites.map((s) => ({ ...s, atlases: [] })) }).value;
        if (!parsed || status === 'awaiting-art') continue;
        for (const sprite of parsed.sprites) {
          const idle = sprite.clips['idle'];
          if (!idle) continue;
          const files = framesPresent(srcDir, entry.manifest, sprite.id, rawSprites.find((s) => s['id'] === sprite.id));
          if (!artClipFrames(idle).every((n) => files.has(n))) continue;
          const { roles, subject, parts } = readEnvTags(sprite.tags);
          const spec = roles.length === 1 ? ENV_CONTRACT[roles[0] as keyof typeof ENV_CONTRACT] : undefined;
          if (!spec) continue;
          drawn.set(slotKey(roles[0]!, spec.subject ? subject : null, spec.parts.length > 0 ? (parts[0] ?? '') : ''), `${entry.id}/${sprite.id}`);
        }
      } catch {
        packs.push({ id: entry.id, status: 'unreadable' });
      }
    }
  } catch {
    // no art/ folder, no index: nothing delivered
  }
  const rows: EnvDeliveryRow[] = slots.map((slot) => {
    const by = drawn.get(slotKey(slot.role, slot.subject, slot.part)) ?? null;
    return { slot, delivered: by !== null, by };
  });
  const required = rows.filter((r) => r.slot.required);
  return { packs, rows, delivered: required.filter((r) => r.delivered).length, total: required.length };
}

/** The report as text, for a person. */
export function formatEnvironmentDelivery(r: EnvDeliveryReport): string {
  const lines: string[] = [];
  lines.push(`The environment's art — ${r.packs.length === 0 ? 'no pack of it in art/' : r.packs.map((p) => `pack "${p.id}" (${p.status})`).join(', ')}`);
  lines.push(`Delivered: ${r.delivered} of ${r.total} required pieces. ${r.delivered === r.total ? 'The rooms are fully dressed.' : 'The game draws the rest with its blockout.'}`);
  lines.push('');
  const wide = Math.max(7, ...r.rows.map((row) => row.slot.rooms.join(', ').length)) + 2;
  lines.push(`  ${'piece'.padEnd(34)}${'needed'.padEnd(10)}${'used by'.padEnd(wide)}state`);
  for (const row of r.rows) {
    const name = `${row.slot.role}${row.slot.subject ? ` ${row.slot.subject}` : ''}${row.slot.part ? ` · ${row.slot.part}` : ''}`;
    lines.push(`  ${name.padEnd(34)}${(row.slot.required ? 'required' : 'optional').padEnd(10)}${row.slot.rooms.join(', ').padEnd(wide)}${row.delivered ? `delivered (${row.by})` : row.slot.required ? 'NOT DELIVERED' : '—'}`);
  }
  lines.push('');
  lines.push('How to deliver it: docs/guides/deliver-environment-art.md');
  return lines.join('\n');
}
