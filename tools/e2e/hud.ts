import type { Page } from 'playwright-core';

/**
 * What the scenarios read of the HUD of the artist (docs/PROMPT17-LOG.md): the two numbers it writes, where the picture of each bar is, the state of each bottle, and — because the HUD has no slot for it — the state of
 * the equipped power as the status the touch button reads says it. The HUD plays its short transients (the picture of a bar on its way, the fade of a bottle) in REAL time, like the page does while the simulation is held
 * by a test: `barAt` and `vialsAre` wait for the picture to have arrived instead of sleeping for a guess.
 */
export type Bar = 'life' | 'magic';

/** The number a bar writes. */
export const numberOf = async (page: Page, bar: Bar): Promise<string> => (await page.locator(`[data-testid="hud-${bar}-number"]`).textContent()) ?? '';

export const dataOf = (page: Page, id: string, name: string): Promise<string | null> => page.locator(`[data-testid="${id}"]`).getAttribute(name);

/** Waits until the bright picture of a bar ends at `edge` (0 … 1) and the white rectangle of what was just lost has gone back to its size. */
export async function barAt(page: Page, bar: Bar, edge: number): Promise<void> {
  await page.waitForFunction(
    `(() => { const e = document.querySelector('[data-testid="hud-${bar}"]'); return !!e && Math.abs(Number(e.dataset.edge) - ${edge}) < 1e-3 && Math.abs(Number(e.dataset.wear) - ${edge}) < 1e-3; })()`,
    undefined,
    { timeout: 20000 },
  );
}

/** What each bottle shows: its state and how dark its picture is (0 bright … 1 dark). */
export const vials = (page: Page): Promise<Array<{ state: string; dark: string }>> =>
  page.locator('[data-testid^="hud-bottle-"]').evaluateAll((els) => els.map((e) => ({ state: (e as HTMLElement).dataset['state'] ?? '', dark: (e as HTMLElement).dataset['dark'] ?? '' })));

/** Waits until the pictures of the bottles have arrived at what their slots say (the fade between the bright bottle and the dark one is over): `['0', '1', '0']`, one per bottle. */
export async function vialsAre(page: Page, dark: Array<'0' | '1'>): Promise<void> {
  await page.waitForFunction(
    `(() => { const v = [...document.querySelectorAll('[data-testid^="hud-bottle-"]')].map((e) => e.dataset.dark); return JSON.stringify(v) === ${JSON.stringify(JSON.stringify(dark))}; })()`,
    undefined,
    { timeout: 20000 },
  );
}

/**
 * What the HUD writes against what the simulation says at this moment (the status the HUD itself reads): the two numbers (the whole percentage of each bar, with the rule `percentOf` has — written out here again, as the
 * oracle) and the state of each bottle. `null` when they agree, or what differs. For a game the test holds: after `ctx.step` the HUD is made up to date with the simulation, so a difference is the HUD's.
 */
export const outOfSync = (page: Page): Promise<string | null> =>
  page.evaluate(`(() => {
    const st = window.__troid.session.status();
    const pct = (c, m) => (!(m > 0) || !(c > 0) ? 0 : c >= m ? 100 : Math.min(99, Math.max(1, Math.floor((c / m) * 100 + 1e-9))));
    const text = (id) => document.querySelector('[data-testid="' + id + '"]').textContent;
    const bad = [];
    const life = [text('hud-life-number'), String(pct(st.life.current, st.life.max))];
    const magic = [text('hud-magic-number'), String(pct(st.magic.current, st.magic.max))];
    if (life[0] !== life[1]) bad.push('life: the HUD writes ' + life[0] + ', the game has ' + st.life.current + ' of ' + st.life.max + ' (' + life[1] + ')');
    if (magic[0] !== magic[1]) bad.push('magic: the HUD writes ' + magic[0] + ', the game has ' + st.magic.current + ' of ' + st.magic.max + ' (' + magic[1] + ')');
    const vials = [...document.querySelectorAll('[data-testid^="hud-bottle-"]')];
    if (vials.length !== st.bottles.length) bad.push('bottles: the HUD shows ' + vials.length + ', the game has ' + st.bottles.length);
    st.bottles.forEach((b, i) => { const shown = vials[i] && vials[i].dataset.state; if (shown !== b.state) bad.push('bottle ' + i + ': the HUD shows ' + shown + ', the game has ' + b.state); });
    return bad.length ? bad.join('; ') : null;
  })()`) as Promise<string | null>;

/** The equipped power, as the status the touch button reads has it: 'empty' (none), 'ready', 'noMagic' or 'cooldown'. */
export const cardState = (page: Page): Promise<string> => page.evaluate(`(() => { const c = window.__troid.session.status().card; return c.equipped ? c.state : 'empty'; })()`) as Promise<string>;

/** Runs a piece of code on the session the page exposes to the tests. */
export const sess = (page: Page, code: string): Promise<unknown> => page.evaluate(`(() => { const s = window.__troid.session; ${code} })()`);

/** The strongest the white rectangle of a bar gets (a factor of the width the artist drew it) over `ms` of real time, looked at on every write the HUD makes to it. */
export const watchRectangle = (page: Page, bar: Bar, ms: number): Promise<number> =>
  page.evaluate(`new Promise((resolve) => {
    const mark = document.querySelector('[data-testid="hud-${bar}-mark"]');
    let peak = 0;
    const read = () => { const m = /scaleX\\(([\\d.]+)\\)/.exec(mark.style.transform); if (m) peak = Math.max(peak, Number(m[1])); };
    const writes = new MutationObserver(read);
    writes.observe(mark, { attributes: true, attributeFilter: ['style'] });
    read();
    setTimeout(() => { read(); writes.disconnect(); resolve(peak); }, ${ms});
  })`) as Promise<number>;
