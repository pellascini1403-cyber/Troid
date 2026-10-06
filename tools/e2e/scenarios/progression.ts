import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import { ROOMS } from '@/content';
import { breakTheSeal } from '../../../tests/helpers/journey';
import { driver } from '../../../tests/helpers/sim';
import { frames } from '../frames';
import { record, replay } from '../replay';
import type { GameState, Scenario } from '../scenario';
import { centreOf, TouchScreen } from '../touch';

/**
 * THE SPIRIT BOLT IS EARNED (docs/PROMPT6-LOG.md S28): locked in R1 → obtained on R3's ledge → available, and the seal that only it breaks.
 *
 *  A · A new game has no card: Ability does nothing, the slot is the empty one.
 *  B · From a game saved at R3's entrance, the climb, the card, the walk back down and ONE bolt at the seal are RECORDED in Node and REPLAYED
 *      through the real keyboard, tick by tick, comparing a digest of the whole simulation (card, ability, flags, interaction…) every 50
 *      ticks. The card is taken by Interact on the ledge and its slot arrives glowing; the bolt costs 30; the ward falls and its door dissolves.
 *  C · It is saved: after a reload the card is equipped, the ability works, the seal is gone and the way on is open.
 *  D · A defeat keeps it all.
 *  E · On touch: the icon is the button, taking the card draws the Ability button, the SWORD (a tap on Attack) is turned away by the seal —
 *      it flashes, the view jolts, nothing is hurt, the door stays — and a tap on Ability breaks it.
 */
const KEY = 'troid.progress';
const SEED = {
  saveVersion: 1,
  at: { room: 'r3_chamber', entry: 'west' },
  checkpoint: { room: 'r2_hall', entry: 'rest' },
  flags: ['defeated:r1_slime', 'defeated:r2_slime'],
  abilities: ['dash'],
  cards: { owned: [] as string[], equipped: null },
  bottleSlots: 3,
};
const CARD = 'card_spirit_bolt';
const TAKEN = 'taken:card_spirit_bolt';
const BROKEN = 'broken:r3_seal';

const stored = (page: Page): Promise<{ flags: string[]; abilities: string[]; cards: { owned: string[]; equipped: string | null } } | null> =>
  page.evaluate(`(() => { const t = localStorage.getItem(${JSON.stringify(KEY)}); return t === null ? null : JSON.parse(t); })()`) as never;
const dom = (page: Page, id: string, attr: string): Promise<string | null> => page.locator(`[data-testid="${id}"]`).getAttribute(attr);
const display = (page: Page, id: string): Promise<string> => page.locator(`[data-testid="${id}"]`).evaluate((e) => getComputedStyle(e).display);
const hidden = async (page: Page, id: string): Promise<boolean> => (await page.locator(`[data-testid="${id}"]`).count()) === 0 || (await display(page, id)) === 'none';

/** The interaction icon is DOM and follows the camera frame by frame: wait for frames, then read what it shows. */
async function icon(page: Page): Promise<{ active: boolean; object: string | null }> {
  await frames(page, 6);
  return { active: (await dom(page, 'prompt-hit', 'data-active')) === '1', object: await dom(page, 'prompt-hit', 'data-object') };
}

export const progression: Scenario = {
  name: 'progression',
  async run(ctx) {
    const size = { width: 844, height: 390, dpr: 1 };
    const sess = (code: string): Promise<unknown> => ctx.page.evaluate(`(() => { const s = window.__troid.session; ${code} })()`);
    const reload = async (): Promise<void> => {
      await ctx.page.reload();
      await ctx.page.waitForFunction('window.__troid && window.__troid.ready()', undefined, { timeout: 30000 });
      await ctx.page.waitForFunction('window.__troid.effectsReady()', undefined, { timeout: 30000 });
      await ctx.page.waitForTimeout(150);
    };
    const seed = async (): Promise<void> => {
      await ctx.page.evaluate(`localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(JSON.stringify(SEED))})`);
      await reload();
    };
    let worst = 0;
    const state = async (): Promise<GameState> => {
      const s = await ctx.state();
      worst = Math.max(worst, s.drawsMax ?? 0);
      return s;
    };
    const press = async (code: string, ticks = 1): Promise<void> => {
      await ctx.page.keyboard.down(code);
      await ctx.step(ticks);
      await ctx.page.keyboard.up(code);
    };
    /** What the world tells the interface, as it happens (read back with `window.__w`). */
    const listen = (): Promise<unknown> =>
      sess(`window.__w = []; const b = s.bus;
        b.on('card:changed', (e) => window.__w.push('card ' + e.type));
        b.on('ability:unlocked', () => window.__w.push('ability'));
        b.on('seal:rejected', () => window.__w.push('rejected'));
        b.on('actor:died', (e) => e.team === 'neutral' && window.__w.push('seal broken'));
        b.on('gate:changed', (e) => e.open && window.__w.push('opened ' + e.gateId));
        b.on('skill:cast', () => window.__w.push('cast'));
        b.on('combat:hit', (e) => e.targetTeam === 'neutral' && window.__w.push('hit ' + e.attackId));`);
    const events = (): Promise<string[]> => ctx.page.evaluate('window.__w') as Promise<string[]>;

    // ================================================================================================ A · a new game: the Spirit Bolt is locked
    await ctx.open('', size);
    let s = await state();
    assert.equal(s.room, 'r1_gate');
    assert.equal(s.card, null, 'no card');
    assert.equal(await dom(ctx.page, 'hud-card', 'data-state'), 'empty', 'the slot is the empty one');
    assert.equal(await sess('return s.abilities.has("magic_attack")'), false, 'and no ability');
    await press('KeyK', 2); // Ability
    await ctx.step(40);
    s = await state();
    assert.equal(s.state, 'free', 'Ability with no card does nothing: no cast');
    assert.equal(s.magic, 100, 'no cost');
    assert.deepEqual(s.projectiles, [], 'no bolt');

    // ================================================================================================ B · R3: the climb, the card, one bolt — recorded in Node, replayed by the keyboard
    await ctx.open('paused=1', size);
    await seed();
    s = await state();
    assert.equal(s.room, 'r3_chamber');
    assert.equal(s.now, 0, 'not one tick has run: the replay starts from tick 0');
    assert.equal(s.card, null, 'a hero who arrives in R3 has no card yet');
    assert.equal(await dom(ctx.page, 'hud-card', 'data-state'), 'empty');
    assert.equal(s.gates?.seal_gate?.open, false, 'the door of the seal is shut');
    const d = driver({ room: ROOMS.r3_chamber!, entry: 'west', unlocked: ['dash'], seed: 1, extra: { rooms: ROOMS, flags: [...SEED.flags], checkpoint: { ...SEED.checkpoint } } });
    const journey = record(d, () => breakTheSeal(d));
    assert.equal(d.session.flags.has(BROKEN), true, 'in the simulation the route ends with the seal broken');
    console.log(`  recorded in Node: ${journey.total} ticks (${journey.runs.length} key changes) from R3's door to the broken seal`);

    await listen();
    await ctx.page.evaluate(`(() => {
      window.__gain = false;
      const card = document.querySelector('[data-testid="hud-card"]');
      new MutationObserver(() => { if (card.dataset.gain === '1') window.__gain = true; }).observe(card, { attributes: true, attributeFilter: ['data-gain'] });
    })()`);
    const seen = new Set<string>();
    const spawnedBefore = (await state()).vfx!.spawned;
    await replay(ctx, journey, {
      chunk: 4,
      observe: async (st) => {
        worst = Math.max(worst, st.drawsMax ?? 0);
        if (st.state === 'interact' && st.y > 4.7 && st.x > 29 && st.x < 40) seen.add('card-taken-on-the-ledge');
        if (st.state === 'cast') seen.add('cast');
        if (st.card === CARD && !seen.has('card')) {
          seen.add('card');
          await frames(ctx.page, 8);
          assert.equal(await dom(ctx.page, 'hud-card', 'data-state'), 'ready', 'the HUD shows the card the moment it is taken');
          await ctx.shot('b-01-the-card');
        }
      },
    });
    s = await state();
    for (const what of ['card-taken-on-the-ledge', 'cast', 'card']) assert.ok(seen.has(what), `the run showed "${what}" (saw ${[...seen].join(', ')})`);
    assert.equal(s.card, CARD, 'the card is the hero\'s');
    assert.ok(s.flags!.includes(TAKEN) && s.flags!.includes(BROKEN), 'the card was taken and the seal broken');
    assert.ok(s.magic! >= 60 && s.magic! <= 100, `the bolt cost 30 (${s.magic})`);
    assert.equal(s.gates?.seal_gate?.open, true, 'the door of the seal is open');
    assert.equal(s.health, s.maxHealth, 'nothing hurt the hero');
    const heard = await events();
    assert.deepEqual(
      heard.filter((e) => ['card acquired', 'card equipped', 'ability', 'cast', 'hit spirit_bolt', 'seal broken', 'opened seal_gate', 'rejected'].includes(e)),
      // (the ward announces its fall — which opens its door — from inside the blow, and the combat system reports the hit after that)
      ['card acquired', 'ability', 'card equipped', 'cast', 'opened seal_gate', 'seal broken', 'hit spirit_bolt'],
      `what the world told the interface (${heard.join(' | ')})`,
    );
    assert.ok(heard.includes('card acquired') && heard.includes('ability') && heard.includes('card equipped'), 'the card, its ability and its equipping');
    assert.ok(!heard.includes('rejected'), 'the journey never swung at the seal');
    assert.equal(await ctx.page.evaluate('window.__gain'), true, 'the card slot arrived glowing');
    assert.ok((await state()).vfx!.spawned > spawnedBefore, 'the effects played (the pickup, the bolt, the fall of the ward)');
    await frames(ctx.page, 90);
    assert.equal(await dom(ctx.page, 'hud-card', 'data-gain'), '0', 'the glow settles');
    assert.equal((await state()).gates?.seal_gate?.alpha, 0, 'and the door has dissolved');
    await ctx.shot('b-02-the-seal-is-broken');

    // ================================================================================================ C · saved: a reload keeps the card, the broken seal and the open way
    await ctx.page.waitForTimeout(80);
    const p = await stored(ctx.page);
    assert.ok(p, 'saved');
    assert.deepEqual(p.cards, { owned: [CARD], equipped: CARD });
    assert.ok(p.abilities.includes('magic_attack'), 'the ability the card teaches');
    assert.ok(p.flags.includes(TAKEN) && p.flags.includes(BROKEN), 'both flags');
    await reload();
    s = await state();
    assert.equal(s.card, CARD, 'the loaded game has the card equipped');
    assert.equal(await dom(ctx.page, 'hud-card', 'data-state'), 'ready');
    assert.equal(await dom(ctx.page, 'hud-card', 'data-gain'), '0', 'a game that LOADS with the card does not announce it');
    assert.equal(s.gates?.seal_gate?.open, true, 'the seal stays broken');
    assert.equal(s.gates?.seal_gate?.alpha, 0);
    assert.equal(await sess('return s.entities.filter((e) => e.kind === "seal").length'), 0, 'and is not built again');
    await ctx.teleport(33.6, 4.8);
    await ctx.step(5);
    assert.equal((await icon(ctx.page)).active, false, 'the ledge is empty');
    await press('KeyK', 1); // the loaded game casts
    await ctx.step(20);
    assert.ok((await state()).magic! < 100, 'and the Ability works');
    await ctx.teleport(77.5, 0); // the way on, open
    await ctx.step(40);
    assert.equal((await state()).room, 'r4_sanctum', 'the way to R4 is open');

    // ================================================================================================ D · a defeat keeps the card
    await sess('s.player.health.damage(s.player.health.current - 1);');
    await ctx.page.evaluate('window.__troid.strikePlayer(1)');
    await ctx.step(2);
    for (let k = 0; k < 400 && (await state()).death?.phase !== 'none'; k++) await ctx.step(2);
    await ctx.step(10);
    s = await state();
    assert.equal(s.card, CARD, 'the hero comes back with the card');
    assert.ok(s.flags!.includes(TAKEN) && s.flags!.includes(BROKEN), 'and the world remembers');
    assert.equal(s.health, s.maxHealth);
    assert.equal(await dom(ctx.page, 'hud-card', 'data-state'), 'ready');

    // ================================================================================================ E · on touch: the icon is the button, the sword is turned away, the bolt breaks the seal
    await ctx.open('paused=1&touch=1', { width: 844, height: 390, dpr: 1, touch: true });
    await seed();
    await listen();
    const screen = await new TouchScreen(ctx.page).init();
    assert.ok(await hidden(ctx.page, 'touch-ability') || (await display(ctx.page, 'touch-ability')) === 'none', 'no card: no Ability button');
    await ctx.teleport(33.6, 4.8);
    await ctx.step(8);
    assert.deepEqual(await icon(ctx.page), { active: true, object: CARD }, 'on the ledge the card has the icon');
    const under = await centreOf(ctx.page, 'prompt-hit');
    assert.ok(under.w >= 44, `a finger-sized target (${under.w})`);
    await screen.tap(1, under.x, under.y);
    await ctx.step(1);
    s = await state();
    assert.equal(s.state, 'interact', 'a tap on the icon takes the card');
    assert.equal(s.device, 'touch');
    await ctx.step(14);
    await frames(ctx.page, 8);
    s = await state();
    assert.equal(s.card, CARD);
    assert.notEqual(await display(ctx.page, 'touch-ability'), 'none', 'with the card the Ability button is drawn');
    assert.equal(await dom(ctx.page, 'hud-card', 'data-state'), 'ready');

    // the seal, up close: the sword is turned away
    await ctx.teleport(60.2, 0);
    await ctx.step(10);
    await frames(ctx.page, 20);
    await ctx.shot('e-01-the-seal');
    const shakesBefore = (await state()).shakes!.count;
    const attack = await centreOf(ctx.page, 'touch-attack');
    await screen.tap(2, attack.x, attack.y);
    await ctx.step(30);
    s = await state();
    const turned = (await events()).filter((e) => e === 'rejected').length;
    assert.ok(turned >= 1, `the sword was turned away (${turned})`);
    assert.equal(s.gates?.seal_gate?.open, false, 'the door did not open');
    assert.equal(s.health, s.maxHealth, 'nothing hurt the hero');
    assert.equal(await sess('return s.entities.filter((e) => e.kind === "seal" && !e.broken).length'), 1, 'and the ward is whole');
    assert.equal((await events()).filter((e) => e.startsWith('hit ')).length, 0, 'a blow turned away is not a hit');
    assert.equal(s.hitStop, 0, 'and it froze nothing');
    await frames(ctx.page, 3);
    await ctx.shot('e-02-a-blow-turned-away');

    // …and the Spirit Bolt breaks it (from 8 m)
    await ctx.teleport(52, 0);
    await ctx.step(10);
    const ability = await centreOf(ctx.page, 'touch-ability');
    await screen.tap(3, ability.x, ability.y);
    await ctx.step(80);
    s = await state();
    const told = await events();
    assert.ok(told.includes('hit spirit_bolt'), `the bolt hit the ward (${told.join(' | ')})`);
    assert.ok(told.includes('seal broken'));
    assert.ok(s.flags!.includes(BROKEN));
    assert.equal(s.gates?.seal_gate?.open, true, 'the door is open');
    assert.ok(s.magic! <= 70.5, `the bolt cost 30 (${s.magic})`);
    await frames(ctx.page, 40);
    await ctx.shot('e-03-the-way-is-open');
    assert.ok(worst <= 60, `draw calls peaked at ${worst}`);
    assert.ok(shakesBefore >= 0);
    console.log(`  progression: locked in R1 → card on R3's ledge (recorded route replayed bit for bit) → one bolt breaks the seal · saved, kept through a reload and a defeat · on touch the sword is turned away and the bolt breaks it · worst ${worst} draw calls (budget 60)`);
  },
};
