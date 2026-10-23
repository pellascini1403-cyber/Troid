import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import { contrastAudit, type LowContrast } from '../contrast';
import type { Scenario } from '../scenario';

/**
 * CAN IT BE READ (docs/PROMPT20-LOG.md): the text of every screen of the menu, of the closing of the adventure and of the notice that asks to turn the device, in both languages, measured in the browser — the colour the
 * browser draws each text with against what it is drawn on, as the WCAG contrast ratio (4.5 : 1, and 3 : 1 for large text) — and the smallest letter on any of them. A text that cannot be read is not an accessible
 * game, however many options it has.
 */
const DESKTOP = { width: 1280, height: 720, dpr: 1 };
const PHONE = { width: 844, height: 390, dpr: 2, touch: true };
const PORTRAIT = { width: 390, height: 844, dpr: 2, touch: true };
const q = (page: Page, id: string): ReturnType<Page['locator']> => page.locator(`[data-testid="${id}"]`);
/** The smallest letter a person is asked to read, in CSS px: below it a phone held at arm's length is a guess. */
const SMALLEST = 11;

async function waitFor(page: Page, expr: string, what: string, tries = 200): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (await page.evaluate(expr)) return;
    await page.waitForTimeout(50);
  }
  assert.fail(`${what} (${expr})`);
}
const screenIs = (page: Page, screen: string): Promise<void> =>
  waitFor(page, `document.querySelector('[data-testid="pause-menu"]')?.dataset.screen === '${screen}' && document.querySelector('[data-testid="pause-menu"]')?.dataset.open === '1'`, `the menu is on its ${screen} screen`);

/** The smallest font size among the visible text under `root`, and what it is. */
async function smallest(page: Page, root: string): Promise<{ size: number; text: string }> {
  return (await page.evaluate(`(() => {
    let best = { size: 1e9, text: '' };
    const base = document.querySelector(${JSON.stringify(root)});
    for (const el of [base, ...base.querySelectorAll('*')]) {
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent || '').join('').trim();
      if (!own) continue;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || el.closest('[hidden]')) continue;
      const size = parseFloat(s.fontSize);
      if (size < best.size) best = { size, text: own.slice(0, 40) };
    }
    return best;
  })()`)) as { size: number; text: string };
}

const describe = (f: LowContrast): string => `"${f.text}" (${f.path}) ${f.ratio}:1 < ${f.need}:1 at ${f.size}px, ${f.color} on ${f.background}`;

export const readable: Scenario = {
  name: 'readable',
  async run(ctx) {
    const seen: string[] = [];
    const audit = async (page: Page, label: string, root: string): Promise<void> => {
      const { checked, failures } = await contrastAudit(page, root);
      assert.ok(checked > 0, `${label}: there is text to read`);
      assert.deepEqual(failures.map(describe), [], `${label}: every text reaches its contrast`);
      const small = await smallest(page, root);
      assert.ok(small.size >= SMALLEST, `${label}: the smallest letter is ${small.size}px ("${small.text}")`);
      seen.push(`${label} ${checked} (≥${small.size}px)`);
    };

    // ================================================================================================ the menu, screen by screen, in both languages
    for (const lang of ['en', 'es']) {
      await ctx.open(`new=1&lang=${lang}`, DESKTOP);
      const page = ctx.page;
      await q(page, 'pause-button').click();
      await page.waitForSelector('[data-testid="pause-menu"][data-open="1"]', { timeout: 15000 });
      await audit(page, `${lang} · map`, '[data-testid="pause-menu"]');
      for (const [entry, screen] of [['pause-controls', 'controls'], ['pause-sound', 'sound'], ['pause-settings', 'settings'], ['pause-saves', 'saves'], ['pause-profile', 'profile']] as const) {
        await q(page, entry).click();
        await screenIs(page, screen);
        await page.waitForTimeout(250);
        await audit(page, `${lang} · ${screen}`, '[data-testid="pause-menu"]');
      }
    }

    // ================================================================================================ the closing of the adventure
    await ctx.open('new=1&lang=en', DESKTOP);
    let page = ctx.page;
    await page.evaluate(`window.__troid.session.bus.emit('adventure:ended', { roomId: 'r4_sanctum', exitId: 'east' })`);
    await screenIs(page, 'ending');
    await page.waitForTimeout(400);
    await audit(page, 'en · ending', '[data-testid="pause-menu"]');

    // ================================================================================================ a phone held sideways (the menu's own layout) and the notice to turn it
    await ctx.open('touch=1&new=1&lang=es', PHONE);
    page = ctx.page;
    await q(page, 'pause-button').click();
    await page.waitForSelector('[data-testid="pause-menu"][data-open="1"]', { timeout: 15000 });
    await audit(page, 'es · phone · map', '[data-testid="pause-menu"]');
    await q(page, 'pause-settings').click();
    await screenIs(page, 'settings');
    await page.waitForTimeout(250);
    await audit(page, 'es · phone · settings', '[data-testid="pause-menu"]');
    await ctx.open('touch=1&new=1&lang=en&safe=47,0,34,0', PORTRAIT);
    page = ctx.page;
    await waitFor(page, `document.querySelector('[data-testid="rotate-notice"]')?.dataset.open === '1'`, 'the notice is up');
    await audit(page, 'en · portrait · notice', '[data-testid="rotate-notice"]');

    console.log(`  readable: ${seen.join(' · ')}`);
  },
};
