import { readFileSync } from 'node:fs';
import { WORLD, BOSSES, ROOMS } from '@/content';
import { CATALOGS } from '@/i18n/catalogs';
import { MENU_CATALOGS } from '@/i18n/menuCatalogs';
import { REGION_KEYS } from '@/ui/map/MapView';
import { COMPLETED_FLAG } from '@/progression/adventure';
import { parseProgress, type ProgressData } from '@/save/ProgressData';

/**
 * THE REPORT OF A SESSION (docs/PROMPT22-LOG.md §8). A person who plays the game leaves, in the saved game the page keeps, everything the game counted: the time played, the time in each zone, the falls in each zone, and how long it took to get to each
 * guardian (the same numbers the Profile screen shows). The saved game can be exported from "Saved games" (a `.json` file with nothing but the game in it: no account, no server), and this reads one or several of them and prints what they say — the real
 * length of the game for the people who played it, which no simulation can give.
 *
 *   npx tsx tools/sessionReport.ts troid-partida-1-2026-11-02.json [more.json …]
 *
 * With several files it adds what they have in common: for each zone, the shortest, the median and the longest time spent in it. It prints what was COUNTED and nothing more: a game saved before the time was counted by zone has no zone table, and the report says so.
 */
const EN = { ...CATALOGS['en'], ...MENU_CATALOGS['en'] } as Record<string, string>;
const zoneName = (region: string): string => EN[REGION_KEYS[region] ?? ''] ?? region;
const WORLD_ZONES = [...new Set(WORLD.rooms.map((id) => ROOMS[id]?.regionId ?? ''))].filter((z) => z !== '');
const clock = (ticks: number): string => {
  const s = Math.floor(ticks / 60);
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? 0 : s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};

export interface Session {
  name: string;
  data: ProgressData;
}

/** One session, in words. */
export function describe(s: Session): string {
  const { data } = s;
  const lines = [`${s.name}`];
  lines.push(`  ${data.flags.includes(COMPLETED_FLAG) ? 'COMPLETED' : 'in progress'} · time played ${clock(data.stats.ticks)} · ${data.stats.deaths} defeats · ${data.stats.kills} enemies · ${data.stats.rooms.length} of ${WORLD.rooms.length} rooms seen`);
  const zones = data.stats.zones;
  if (!zones) lines.push('  (no time by zone: this game was saved before it was counted)');
  else {
    for (const z of WORLD_ZONES) if (zones[z] || data.stats.falls?.[z]) lines.push(`  ${zoneName(z).padEnd(28)} ${clock(zones[z] ?? 0)}${data.stats.falls?.[z] ? `  ${data.stats.falls[z]} defeats` : ''}`);
  }
  const g = Object.entries(data.stats.guardians ?? {}).sort((a, b) => a[1] - b[1]);
  if (g.length > 0) {
    lines.push('  guardians, by the time played when each first fell:');
    for (const [id, t] of g) lines.push(`    ${(EN[BOSSES[id]?.nameKey ?? ''] ?? id).padEnd(26)} ${clock(t)}`);
  }
  return lines.join('\n');
}

/** What several sessions have in common: for each zone, how long the people who played it spent there. */
export function summarize(sessions: readonly Session[]): string {
  if (sessions.length < 2) return '';
  const lines = [`${sessions.length} sessions`];
  const done = sessions.filter((s) => s.data.flags.includes(COMPLETED_FLAG));
  lines.push(`  completed: ${done.length} of ${sessions.length}${done.length ? ` · time played ${clock(Math.min(...done.map((s) => s.data.stats.ticks)))} – ${clock(Math.max(...done.map((s) => s.data.stats.ticks)))} (median ${clock(median(done.map((s) => s.data.stats.ticks)))})` : ''}`);
  lines.push(`  ${'zone'.padEnd(28)} ${'shortest'.padStart(9)} ${'median'.padStart(9)} ${'longest'.padStart(9)}  (people)`);
  for (const z of WORLD_ZONES) {
    const times = sessions.flatMap((s) => (s.data.stats.zones?.[z] ? [s.data.stats.zones[z]!] : []));
    if (times.length > 0) lines.push(`  ${zoneName(z).padEnd(28)} ${clock(Math.min(...times)).padStart(9)} ${clock(median(times)).padStart(9)} ${clock(Math.max(...times)).padStart(9)}  (${times.length})`);
  }
  return lines.join('\n');
}

export function report(sessions: readonly Session[]): string {
  return [...sessions.map(describe), summarize(sessions)].filter((x) => x !== '').join('\n\n');
}

/** Reads the saved games named on the command line (each one the way the game reads it: damaged or foreign files are refused by name). */
export function load(files: readonly string[]): Session[] {
  return files.map((name) => {
    const data = parseProgress(readFileSync(name, 'utf8'));
    if (!data) throw new Error(`${name}: not a saved game of this game`);
    return { name, data };
  });
}

const main = process.argv[1] ?? '';
if (main.endsWith('sessionReport.ts')) {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('usage: npx tsx tools/sessionReport.ts <saved game.json> [more…]   (a saved game is exported from the pause menu: Saved games → Export)');
    process.exit(2);
  }
  console.log(report(load(files)));
}
