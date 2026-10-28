import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLAYER_VISUAL } from '../../src/content/visuals';
import type { EnemyDefinition } from '../../src/enemies/EnemyDefinition';
import type { GuardianDefinition } from '../../src/enemies/GuardianDefinition';
import type { BossDefinition } from '../../src/enemies/boss/BossDefinition';
import type { RoomDefinition } from '../../src/world/RoomDefinition';
import { artClipFrames, CLIP_ALIASES, parseArtIndex, parseArtPack } from '../../src/presentation/artManifest';
import { bossParts, GUARDIAN_PARTS } from '../../src/presentation/bossArt';
import { ENEMY_PARTS, enemyParts } from '../../src/presentation/enemyArt';
import { ENV_CONTRACT, readEnvLook, readEnvTags, slotKey, type EnvSlot } from '../../src/presentation/environment';
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
  /** The clip is made by moving another clip's drawing (tag `stand-in`): it has frames, so the game draws it with the art, but they are not a drawing OF ITS OWN — it is not delivered. */
  standIn: boolean;
  /** What the manifest says about the stand-in (which pose it reuses and why), or `null`. */
  standInReason: string | null;
  delivered: boolean;
}

export interface DeliveryReport {
  pack: string;
  sprite: string;
  /** The status of the pack in the manifest, or `none` when there is no `art/` declaration of it at all. */
  status: string;
  rows: DeliveryRow[];
  /** Clips with art of their own. */
  delivered: number;
  /** Clips drawn with another clip's pose: not delivered, but not the placeholder either. */
  standIns: number;
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
      state, alsoCalled: aliasesOf(state), first: PLAYER_VISUAL.first.includes(state), sword: SWORD_STATES.includes(state), once: ONE_SHOT_STATES.has(state), prefix: null, wanted: 0, missing: [], standIn: false, standInReason: null, delivered: false,
    })),
    delivered: 0,
    standIns: 0,
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
    const rawClips = (rawSprites.find((s) => s['id'] === sprite)?.['clips'] ?? {}) as Record<string, { comment?: unknown }>;
    const reasonOf = (state: AnimState): string | null => {
      for (const [key, v] of Object.entries(rawClips)) if ((CLIP_ALIASES[key] ?? key) === state && typeof v?.comment === 'string') return v.comment;
      return null;
    };
    const rows: DeliveryRow[] = PLAYER_VISUAL.required.map((state) => {
      const clip = declared.clips[state];
      const names = clip ? artClipFrames(clip) : [];
      const missing = names.filter((n) => !files.has(n));
      const standIn = clip?.tags.includes('stand-in') ?? false;
      return {
        state, alsoCalled: aliasesOf(state), first: PLAYER_VISUAL.first.includes(state), sword: SWORD_STATES.includes(state), once: ONE_SHOT_STATES.has(state),
        prefix: clip?.frames ?? null, wanted: names.length, missing, standIn, standInReason: standIn ? reasonOf(state) : null,
        delivered: status !== 'awaiting-art' && clip !== undefined && missing.length === 0 && !standIn,
      };
    });
    return { pack, sprite, status, rows, delivered: rows.filter((r) => r.delivered).length, standIns: rows.filter((r) => r.standIn && r.missing.length === 0).length, total: rows.length };
  } catch {
    return empty('none');
  }
}

/** The report as text, for a person. */
export function formatDelivery(r: DeliveryReport): string {
  const lines: string[] = [];
  lines.push(`The protagonist's art — pack "${r.pack}", sprite set "${r.sprite}" (${r.status === 'none' ? 'not declared in art/' : `status: ${r.status}`})`);
  const rest = r.total - r.delivered - r.standIns;
  lines.push(
    `Delivered: ${r.delivered} of ${r.total} clips of its own.` +
      (r.standIns > 0 ? ` ${r.standIns} more are made by moving ANOTHER action's drawing (stand-ins: the sheet has none of their own, so drawn art is still to be delivered for them).` : '') +
      (rest > 0 ? ` The game draws the other ${rest} with its placeholder.` : r.delivered === r.total ? ' The game draws the protagonist entirely with it.' : ' Nothing is drawn with the placeholder.'),
  );
  lines.push('');
  lines.push(`  ${'clip'.padEnd(14)}${'also called'.padEnd(25)}${'kind'.padEnd(6)}${'sword'.padEnd(7)}${'first'.padEnd(7)}state`);
  for (const row of r.rows) {
    const state = row.delivered
      ? `delivered (${row.wanted} frame${row.wanted === 1 ? '' : 's'})`
      : row.standIn && row.missing.length === 0
        ? `STAND-IN, no drawing of its own: ${row.standInReason ?? 'it moves another clip\'s drawing'}`
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
          // an interactive's piece is its variant (the bottle, the card or the rune of a pickup); the others are named by their part
          const part = roles[0] === 'interactive' ? (readEnvLook(sprite.tags).variant ?? '') : spec.parts.length > 0 ? (parts[0] ?? '') : '';
          drawn.set(slotKey(roles[0]!, spec.subject ? subject : null, part), `${entry.id}/${sprite.id}`);
        }
      } catch {
        packs.push({ id: entry.id, status: 'unreadable' });
      }
    }
  } catch {
    // no art/ folder, no index: nothing delivered
  }
  const rows: EnvDeliveryRow[] = slots.map((slot) => {
    // (a pickup with no variant serves every variant: the same rule the pack check and the game follow)
    const by = drawn.get(slotKey(slot.role, slot.subject, slot.part)) ?? (slot.role === 'interactive' && slot.part !== '' ? drawn.get(slotKey(slot.role, slot.subject, '')) : undefined) ?? null;
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


// ------------------------------------------------------------------------------------------------------------------------------------------------------- the creatures and the guardians

/** What the game draws with shapes until art arrives: an ink creature, a guardian of the engine (an ink creature at the size of a room) or the Ink Warden (a column of ink drawn by parts of its own). */
export type LookKind = 'creature' | 'engine-boss' | 'warden';

export interface LookNeed {
  /** The look: what the tags of the art name (`enemy:<id>`, or `boss:<id>` for the Warden). */
  id: string;
  kind: LookKind;
  /** The parts its art brings, each a sprite set of the pack (`presentation/enemyArt`, `presentation/bossArt`). */
  parts: readonly string[];
  /** The anchors the body of its art says: where the eyes (`head`) and the sigil (`vfx_origin`) stand. Only the creature contract has them. */
  anchors: readonly string[];
  /** Its size on the screen in metres, as the shapes draw it today: what the body of its art should fill. */
  size: { width: number; height: number };
  /** The rooms it is placed in, in the order of the world, and how many times in all (a creature that only exists when another breaks — the crystal shard — is placed nowhere). */
  rooms: string[];
  placements: number;
}

/** What the game itself says about its creatures and guardians: the registries, the rooms in the order of the world and the shapes that draw each look. */
export interface LookSources {
  enemies: Readonly<Record<string, EnemyDefinition>>;
  bosses: Readonly<Record<string, GuardianDefinition | BossDefinition>>;
  rooms: Readonly<Record<string, Pick<RoomDefinition, 'spawns' | 'bosses'>>>;
  order: readonly string[];
  looks: Readonly<Record<string, { width: number; height: number }>>;
}

const CREATURE_ANCHORS = ['head', 'vfx_origin'] as const;

/** Every look the game draws with shapes that art could replace, read from the game's own data: so the list changes by itself when a creature is added. */
export function looksNeeded(src: LookSources): LookNeed[] {
  const placed = new Map<string, { rooms: string[]; n: number }>();
  const place = (look: string, room: string): void => {
    const p = placed.get(look) ?? { rooms: [], n: 0 };
    p.n++;
    if (!p.rooms.includes(room)) p.rooms.push(room);
    placed.set(look, p);
  };
  for (const id of src.order) {
    const room = src.rooms[id];
    for (const sp of room?.spawns ?? []) {
      const def = src.enemies[sp.enemy];
      if (def && 'proceduralId' in def.view) place(def.view.proceduralId, id);
    }
    for (const b of room?.bosses ?? []) {
      const def = src.bosses[b.guardian];
      if (def) place(def.view.lookId, id);
    }
  }
  const out: LookNeed[] = [];
  const add = (id: string, kind: LookKind, size: { width: number; height: number }): void =>
    void out.push({ id, kind, parts: kind === 'warden' ? GUARDIAN_PARTS : ENEMY_PARTS, anchors: kind === 'warden' ? [] : CREATURE_ANCHORS, size, rooms: placed.get(id)?.rooms ?? [], placements: placed.get(id)?.n ?? 0 });
  for (const def of Object.values(src.enemies)) {
    if (!('proceduralId' in def.view)) continue;
    const look = src.looks[def.view.proceduralId];
    if (look) add(def.view.proceduralId, 'creature', { width: look.width, height: look.height });
  }
  for (const def of Object.values(src.bosses)) {
    if ('phases' in def) {
      const look = src.looks[def.view.lookId];
      if (look) add(def.view.lookId, 'engine-boss', { width: look.width, height: look.height });
    } else {
      add(def.view.lookId, 'warden', { width: def.body.halfWidth * 2, height: def.body.height });
    }
  }
  return out;
}

export interface LookDeliveryRow {
  need: LookNeed;
  /** `pack/sprite` that draws each part (`null`: nobody does). */
  drawn: Record<string, string | null>;
  lacking: string[];
  /** The anchors of the body that its art does not say. */
  anchorsLacking: string[];
  /** The pack that holds the most parts of it, and that pack's status (`provisional`: made by the repository's generator, not by a person). */
  pack: string | null;
  status: string | null;
  /** The rooms where the look is placed that the pack does not list in its `zones`: the art would not be loaded there and the creature would be drawn with shapes. */
  outsideZones: string[];
  delivered: boolean;
}

export interface LookDeliveryReport {
  packs: Array<{ id: string; status: string }>;
  rows: LookDeliveryRow[];
  delivered: number;
  total: number;
}

/**
 * WHAT OF THE CREATURES' AND THE GUARDIANS' ART HAS BEEN DELIVERED (docs/guides/deliver-environment-art.md, §8 and §9): the looks the world's rooms place (`needs`) against the sprite sets of the packs of the `enemies` category in the folder. A look
 * is DELIVERED when every part of its contract is drawn (a sprite set whose `idle` frames are there and whose tags say whose part it is), its body says both anchors (the creature contract), its pack no longer awaits its art and its zones cover every room it
 * stands in. It only READS.
 */
export function readLookDelivery(srcDir: string, needs: readonly LookNeed[], zonesOf: (look: string) => readonly string[] = () => []): LookDeliveryReport {
  type Held = { pack: string; status: string; zones: string[]; creature: Map<string, Map<string, string>>; guardian: Map<string, Map<string, string>>; anchors: Map<string, Set<string>> };
  const held: Held[] = [];
  const packs: LookDeliveryReport['packs'] = [];
  try {
    const index = parseArtIndex(JSON.parse(readFileSync(join(srcDir, 'index.json'), 'utf8')) as unknown).value;
    for (const entry of index?.packs.filter((p) => p.category === 'enemies') ?? []) {
      try {
        const raw = JSON.parse(readFileSync(join(srcDir, ...entry.manifest.split('/')), 'utf8')) as Record<string, unknown>;
        const status = typeof raw['status'] === 'string' ? raw['status'] : 'final';
        packs.push({ id: entry.id, status });
        const rawSprites = Array.isArray(raw['sprites']) ? (raw['sprites'] as Array<Record<string, unknown>>) : [];
        const parsed = parseArtPack({ ...raw, status: 'awaiting-art', atlases: [], sprites: rawSprites.map((s) => ({ ...s, atlases: [] })) }).value;
        if (!parsed || status === 'awaiting-art') continue;
        // a sprite set counts when its `idle` frames are in the folder
        const present = parsed.sprites.filter((sprite) => {
          const idle = sprite.clips['idle'];
          return idle !== undefined && artClipFrames(idle).every((n) => framesPresent(srcDir, entry.manifest, sprite.id, rawSprites.find((r) => r['id'] === sprite.id)).has(n));
        });
        const anchors = new Map<string, Set<string>>();
        for (const sprite of present) anchors.set(sprite.id, new Set(Object.keys(sprite.anchors ?? {})));
        const named = (m: Map<string, Map<string, string>>): Map<string, Map<string, string>> => new Map([...m].map(([look, parts]) => [look, new Map([...parts].map(([part, id]) => [part, id]))]));
        held.push({ pack: entry.id, status, zones: entry.zones, creature: named(enemyParts(present)), guardian: named(bossParts(present)), anchors });
      } catch {
        packs.push({ id: entry.id, status: 'unreadable' });
      }
    }
  } catch {
    // no art/ folder, no index: nothing delivered
  }
  const rows: LookDeliveryRow[] = needs.map((need) => {
    const candidates = held.map((h) => ({ h, parts: (need.kind === 'warden' ? h.guardian : h.creature).get(need.id) ?? new Map<string, string>() }));
    const best = candidates.sort((a, b) => b.parts.size - a.parts.size)[0];
    const drawn: Record<string, string | null> = {};
    for (const part of need.parts) drawn[part] = best?.parts.has(part) ? `${best.h.pack}/${best.parts.get(part)}` : null;
    const lacking = need.parts.filter((part) => drawn[part] === null);
    const body = best?.parts.get('body');
    const said = body !== undefined && best ? (best.h.anchors.get(body) ?? new Set<string>()) : new Set<string>();
    const anchorsLacking = lacking.includes('body') ? [...need.anchors] : need.anchors.filter((a) => !said.has(a));
    const outsideZones = best && best.parts.size > 0 ? need.rooms.filter((r) => !best.h.zones.includes(r) && !zonesOf(need.id).includes(r)) : [];
    const delivered = best !== undefined && best.parts.size > 0 && lacking.length === 0 && anchorsLacking.length === 0 && outsideZones.length === 0;
    return { need, drawn, lacking, anchorsLacking, pack: best && best.parts.size > 0 ? best.h.pack : null, status: best && best.parts.size > 0 ? best.h.status : null, outsideZones, delivered };
  });
  return { packs, rows, delivered: rows.filter((r) => r.delivered).length, total: rows.length };
}

const KIND_NAME: Record<LookKind, string> = { creature: 'creature', 'engine-boss': 'guardian (engine)', warden: 'guardian (Warden)' };

/** The report as text, for a person. */
export function formatLookDelivery(r: LookDeliveryReport): string {
  const lines: string[] = [];
  lines.push(`The creatures' and the guardians' art — ${r.packs.length === 0 ? 'no pack of it in art/' : r.packs.map((p) => `pack "${p.id}" (${p.status})`).join(', ')}`);
  const plain = r.rows.filter((x) => !x.delivered).length;
  lines.push(`Delivered: ${r.delivered} of ${r.total} looks. ${plain === 0 ? 'Every creature and every guardian is drawn by art.' : `The game draws the other ${plain} with shapes (a silhouette by code, deformed by what the creature is doing): not final art.`}`);
  lines.push('');
  const wide = Math.max(7, ...r.rows.map((row) => `${row.need.rooms.join(', ')}`.length)) + 2;
  lines.push(`  ${'look'.padEnd(22)}${'kind'.padEnd(20)}${'size (m)'.padEnd(11)}${'placed'.padEnd(8)}${'where'.padEnd(wide)}state`);
  for (const row of r.rows) {
    const n = row.need;
    const size = `${n.size.width}x${n.size.height}`;
    const state = row.delivered
      ? `delivered (${row.pack}, ${row.status})`
      : row.pack === null
        ? 'shapes only — NOT DELIVERED'
        : [row.lacking.length > 0 ? `lacks ${row.lacking.join(', ')}` : '', row.anchorsLacking.length > 0 ? `the body says no ${row.anchorsLacking.join(' / ')} anchor` : '', row.outsideZones.length > 0 ? `zones of "${row.pack}" miss ${row.outsideZones.join(', ')}` : ''].filter(Boolean).join('; ');
    lines.push(`  ${n.id.padEnd(22)}${KIND_NAME[n.kind].padEnd(20)}${size.padEnd(11)}${String(n.placements).padEnd(8)}${(n.rooms.join(', ') || '(made in a fight)').padEnd(wide)}${state}`);
  }
  lines.push('');
  lines.push('How to deliver it: docs/guides/deliver-environment-art.md §8 (the Warden) and §9 (a creature, and a guardian of the engine: the same six parts)');
  return lines.join('\n');
}
