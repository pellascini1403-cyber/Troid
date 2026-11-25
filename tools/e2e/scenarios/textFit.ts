import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import '@/content/beyond';
import { BOSSES } from '@/content/core';
import { ABILITY_TEXT } from '@/ui/overlays/AbilityNotice';
import { describeCut, fitAudit } from '../fit';
import type { Scenario } from '../scenario';

/**
 * EVERY TEXT THAT APPEARS OVER THE GAME FITS (docs/PROMPT25-LOG.md): `readable` looks at the menu, screen by screen; this looks at what is drawn over the world while it is played — the HUD, the bar of each guardian with ITS
 * name, the notice of each ability the hero learns — in both languages and in the windows where a long word is hardest to place: the smallest phone the game is held to, an ordinary one, and a desktop. A guardian's name
 * is the longest text the game shows on a phone («Soberano del Corazón de Tinta»): if any text is cut, it is that one.
 */
const WINDOWS = [
  { name: 'small phone', width: 667, height: 375, dpr: 2, touch: true },
  { name: 'phone', width: 844, height: 390, dpr: 3, touch: true },
  { name: 'desktop', width: 1280, height: 720, dpr: 1 },
] as const;

const sess = (page: Page, code: string): Promise<unknown> => page.evaluate(`(() => { const s = window.__troid.session; ${code} })()`);

async function waitFor(page: Page, expr: string, what: string, tries = 300): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (await page.evaluate(expr)) return;
    await page.waitForTimeout(50);
  }
  assert.fail(`${what} (${expr})`);
}

export const textFit: Scenario = {
  name: 'textFit',
  async run(ctx) {
    const guardians = Object.values(BOSSES) as Array<{ id: string; nameKey: string }>;
    // (the ones the page has words for: for the rest the game says nothing, on purpose)
    const abilities = Object.keys(ABILITY_TEXT);
    const seen: string[] = [];
    for (const lang of ['es', 'en']) {
      for (const w of WINDOWS) {
        const label = `${lang} · ${w.name}`;
        await ctx.open(`new=1&lang=${lang}${'touch' in w ? '&touch=1' : ''}`, { width: w.width, height: w.height, dpr: w.dpr, ...('touch' in w ? { touch: true } : {}) });
        const page = ctx.page;
        let texts = 0;
        const audit = async (root: string, what: string): Promise<void> => {
          const fit = await fitAudit(page, root);
          texts += fit.checked;
          assert.deepEqual(fit.failures.map(describeCut), [], `${label} · ${what}: every text fits its box`);
        };

        // the HUD
        await audit('[data-testid="hud"]', 'HUD');

        // the bar of each guardian, with its own name
        for (const g of guardians) {
          await sess(page, `s.bus.emit("boss:defeated", { id: "e2e_fit", defId: ${JSON.stringify(g.id)} }); s.bus.emit("boss:started", { id: "e2e_fit", defId: ${JSON.stringify(g.id)}, nameKey: ${JSON.stringify(g.nameKey)}, health: 30, maxHealth: 30, x: 0, y: 0 });`);
          await waitFor(page, `(() => { const e = document.querySelector('[data-testid="boss-bar"]'); return !!e && getComputedStyle(e).display === 'block' && Number(getComputedStyle(e).opacity) > 0.99; })()`, `${label}: the bar of ${g.id} is up`);
          const name = await page.locator('[data-testid="boss-bar-name"]').textContent();
          assert.ok(name && name.trim().length > 0 && !/^[a-z]+(\.[a-z0-9_]+)+$/i.test(name.trim()), `${label}: ${g.id} has a name, not a key (${JSON.stringify(name)})`);
          await audit('[data-testid="boss-bar"]', `bar of ${g.id} ("${name}")`);
        }

        // the notice of each ability the hero learns: each one replaces the one before (the notice is one line at a time)
        await page.evaluate('window.__troid.resume()');
        for (const id of abilities) {
          await sess(page, `s.bus.emit("ability:unlocked", { id: ${JSON.stringify(id)} });`);
          await waitFor(page, `(() => { const e = document.querySelector('[data-testid="ability-notice"]'); return !!e && e.dataset.open === '1' && Number(getComputedStyle(e).opacity) > 0.99; })()`, `${label}: the notice of ${id} is up`, 200);
          const name = await page.locator('[data-testid="ability-notice-name"]').textContent();
          assert.ok(name && !/^[a-z]+(\.[a-z0-9_]+)+$/i.test(name.trim()), `${label}: the notice of ${id} has words, not a key (${JSON.stringify(name)})`);
          await audit('[data-testid="ability-notice"]', `notice of ${id}`);
        }
        await page.evaluate('window.__troid.pause()');
        seen.push(`${label} ${texts}`);
        console.log(`    textFit ${label}: ${texts} texts fit`);
      }
    }
    console.log(`  textFit: ${guardians.length} guardians and ${abilities.length} abilities, both languages, three windows — texts checked: ${seen.join(' · ')}`);
  },
};
