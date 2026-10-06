import type { Page } from 'playwright-core';
import { CATALOGS } from '@/i18n';
import { ROOMS, WORLD } from '@/content';
import { restoreFromProgress } from '@/gameplay/progress';
import { driver, type Driver } from '../../tests/helpers/sim';
import type { Ctx, GameState } from './scenario';

/**
 * What the two boss scenarios (`boss`, `boss-death`; docs/PROMPT6-LOG.md S29) share: a game SAVED at the shrine of R4 — the place a hero comes to
 * the Ink Warden from — loaded by the browser from `localStorage`, and the same game built in Node on the pure simulation, so that a fight
 * RECORDED there can be REPLAYED through the real keyboard from tick 0 and compared with a digest every 50 ticks.
 */
export const PROGRESS_KEY = 'troid.progress';

/** A hero who has done everything before the arena: both slimes down, the Spirit Bolt taken and the seal of R3 broken. Resting at the shrine of R4. */
export const AT_THE_SHRINE = {
  saveVersion: 1,
  at: { room: 'r4_sanctum', entry: 'rest' },
  checkpoint: { room: 'r4_sanctum', entry: 'rest' },
  flags: ['broken:r3_seal', 'defeated:r1_slime', 'defeated:r2_slime', 'taken:card_spirit_bolt'],
  abilities: ['dash'],
  cards: { owned: ['card_spirit_bolt'], equipped: 'card_spirit_bolt' },
  bottleSlots: 3,
};

export const WARDEN_FLAG = 'defeated:r4_boss';
export const FIGHT_FLAG = '~fight:r4_boss';
export const AIR_DASH_FLAG = 'taken:air_dash';

/** The game of `AT_THE_SHRINE`, in Node: what the browser builds when it loads that save (same options, same seed). */
export function shrineDriver(seed = 1): Driver {
  const restored = restoreFromProgress(AT_THE_SHRINE, ROOMS, WORLD.start);
  return driver({ room: ROOMS.r4_sanctum!, entry: restored.startEntry, unlocked: restored.unlocked, seed, extra: { rooms: ROOMS, ...restored } });
}

/** Reloads the page (the URL keeps its query) and waits for the game and for every cosmetic chunk. */
export async function reload(page: Page): Promise<void> {
  await page.reload();
  await page.waitForFunction('window.__troid && window.__troid.ready()', undefined, { timeout: 30000 });
  await page.waitForFunction('window.__troid.effectsReady()', undefined, { timeout: 30000 });
  await page.waitForTimeout(150);
}

/** Puts `progress` where the game saves its own, and reloads: the game loads it. */
export async function seed(ctx: Ctx, progress: unknown = AT_THE_SHRINE): Promise<void> {
  await ctx.page.evaluate(`localStorage.setItem(${JSON.stringify(PROGRESS_KEY)}, ${JSON.stringify(JSON.stringify(progress))})`);
  await reload(ctx.page);
}

export interface Saved {
  at: { room: string; entry: string };
  checkpoint: { room: string; entry: string };
  flags: string[];
  abilities: string[];
  bottleSlots: number;
  cards: { owned: string[]; equipped: string | null };
}

/** What the game has saved, as the next load will read it. */
export const stored = (page: Page): Promise<Saved | null> =>
  page.evaluate(`(() => { const t = localStorage.getItem(${JSON.stringify(PROGRESS_KEY)}); return t === null ? null : JSON.parse(t); })()`) as never;

/** The boss's bar, as the DOM shows it. */
export interface Bar {
  display: string;
  opacity: number;
  name: string;
  /** 0–100 */
  value: number | null;
  enraged: boolean;
}

export async function bar(page: Page): Promise<Bar> {
  return (await page.evaluate(`(() => {
    const el = document.querySelector('[data-testid="boss-bar"]');
    if (!el) return null;
    const n = el.getAttribute('aria-valuenow');
    return {
      display: getComputedStyle(el).display,
      opacity: Number(getComputedStyle(el).opacity),
      name: (document.querySelector('[data-testid="boss-bar-name"]') || {}).textContent || '',
      value: n === null ? null : Number(n),
      enraged: el.dataset.enraged === '1',
    };
  })()`)) as Bar;
}

/** The name of the Warden in the language the page speaks (the bar must say it, and only it). */
export const wardenName = (lang: string | undefined): string => (CATALOGS as Record<string, Record<string, string>>)[lang ?? 'en']!['enemy.warden.name']!;

/** The doors of the arena, as the page draws and the simulation holds them: `true` = shut. */
export const shut = (s: GameState): { w: boolean; e: boolean } => ({ w: s.gates?.['arena_door_w']?.open === false, e: s.gates?.['arena_door_e']?.open === false });

/** The sim's own event log from the page: `window.__w` holds one line per event the scenario subscribed to. */
export async function watch(page: Page): Promise<void> {
  await page.evaluate(`(() => {
    const s = window.__troid.session;
    const w = (window.__w = []);
    const on = (t, f) => s.bus.on(t, (e) => w.push(f(e)));
    on('boss:started', (e) => 'started ' + e.defId + ' ' + e.health + '/' + e.maxHealth);
    on('boss:strike', (e) => 'strike ' + e.attack);
    on('boss:phase', (e) => 'phase ' + e.phase);
    on('boss:defeated', () => 'defeated');
    on('gate:changed', (e) => 'gate ' + e.gateId + ' ' + (e.open ? 'open' : 'shut'));
    on('player:died', () => 'player died');
    on('player:hurt', () => 'player hurt');
    on('player:dashed', (e) => 'dash ' + (e.air ? 'air' : 'ground'));
    on('ability:unlocked', (e) => 'ability ' + e.id);
    on('interaction:performed', (e) => 'did ' + e.id);
    on('death:respawned', () => 'respawned');
    on('checkpoint:set', () => 'checkpoint');
  })()`);
}

export const log = (page: Page): Promise<string[]> => page.evaluate('window.__w') as Promise<string[]>;
