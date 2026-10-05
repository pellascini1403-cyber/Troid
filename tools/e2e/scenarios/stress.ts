import assert from 'node:assert/strict';
import type { Scenario } from '../scenario';

/** Render budget (S1 criterion): ≥ 800 animated sprites + 4 parallax layers + 1 filter + ≥ 200 particles ≤ 60 draw calls. */
export const stress: Scenario = {
  name: 'stress-2d',
  async run(ctx) {
    await ctx.open('view=2d&lab=stress&n=800&particles=240');
    await ctx.page.waitForTimeout(2500);
    const s = (await ctx.page.evaluate('window.__troid.state()')) as { draws: number; drawsMax: number; sprites: number; particles: number; filter: boolean };
    console.log(`  stress: ${s.sprites} sprites, ${s.particles} particles, filter=${s.filter} → ${s.draws} draw calls (worst ${s.drawsMax})`);
    assert.ok(s.sprites >= 800 && s.particles >= 200 && s.filter, 'the stress scene has the full load');
    assert.ok(s.draws > 0, 'frames are being drawn');
    assert.ok(s.draws <= 60, `median draw calls ${s.draws} must be ≤ 60`);
    assert.ok(s.drawsMax <= 60, `worst-frame draw calls ${s.drawsMax} must be ≤ 60`);
    await ctx.shot('01-stress');
  },
};
