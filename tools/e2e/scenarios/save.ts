import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import type { GameState, Scenario } from '../scenario';

/**
 * SAVE AND RESTORE in a real browser (docs/PROMPT6-LOG.md S24): what the hero wins is written to the browser's storage as it happens;
 * reloading the page gives the same game back — the room they were in, the flags, the card, the abilities, the bottles and the
 * checkpoint a defeat uses — and `?new=1` starts over. A damaged save never ruins the next start: it is kept aside and the game begins
 * fresh (or from the backup). Playgrounds never read or write it. The console stays clean (the runner fails the scenario otherwise).
 */
const KEY = 'troid.progress';

const stored = (page: Page, key = KEY): Promise<{ saveVersion: number; at: { room: string; entry: string }; checkpoint: { room: string; entry: string }; flags: string[]; abilities: string[]; cards: { owned: string[]; equipped: string | null }; bottleSlots: number } | null> =>
  page.evaluate(`(() => { const t = localStorage.getItem(${JSON.stringify(key)}); return t === null ? null : JSON.parse(t); })()`) as never;

export const save: Scenario = {
  name: 'save',
  async run(ctx) {
    const size = { width: 844, height: 390, dpr: 1 };
    const sess = (code: string): Promise<unknown> => ctx.page.evaluate(`(() => { const s = window.__troid.session; ${code} })()`);
    const reload = async (): Promise<void> => {
      await ctx.page.reload();
      await ctx.page.waitForFunction('window.__troid && window.__troid.ready()', undefined, { timeout: 30000 });
      await ctx.page.waitForFunction('window.__troid.effectsReady()', undefined, { timeout: 30000 });
      await ctx.page.evaluate('window.__troid.pause()');
      await ctx.page.waitForTimeout(150);
    };
    const dom = (id: string, attr: string): Promise<string | null> => ctx.page.locator(`[data-testid="${id}"]`).getAttribute(attr);
    const through = async (x: number): Promise<void> => {
      await ctx.teleport(x, 0);
      await ctx.step(40);
    };
    let worst = 0;
    const state = async (): Promise<GameState> => {
      const s = await ctx.state();
      worst = Math.max(worst, s.drawsMax ?? 0);
      return s;
    };

    // ================================================================================================ a new game leaves no trace until something is won
    await ctx.open('', size);
    await ctx.step(60);
    let s = await state();
    assert.equal(s.room, 'r1_gate');
    assert.equal(await stored(ctx.page), null, 'nothing is saved before anything changes');

    // ================================================================================================ playing: the guardian, a rest, a card, a bottle, a new room
    await sess('s.flags.set("defeated:r1_slime")'); // (the slime is beaten: the way opens)
    await ctx.step(2);
    await through(110);
    assert.equal((await state()).room, 'r2_hall');
    await ctx.page.waitForTimeout(50);
    let p = await stored(ctx.page);
    assert.ok(p, 'the first change wrote a save');
    assert.equal(p.saveVersion, 1);
    assert.deepEqual(p.at, { room: 'r2_hall', entry: 'west' }, 'where the hero came into a room');
    assert.deepEqual(p.checkpoint, { room: 'r1_gate', entry: 'start' });
    assert.deepEqual(p.flags, ['defeated:r1_slime']);
    assert.deepEqual(p.abilities, ['dash']);
    assert.deepEqual(p.cards, { owned: [], equipped: null });
    assert.equal(p.bottleSlots, 3);

    await ctx.teleport(11.2, 0); // the shrine, with the real keyboard
    await ctx.step(8);
    await ctx.page.keyboard.down('KeyE');
    await ctx.step(1);
    await ctx.page.keyboard.up('KeyE');
    await ctx.step(14);
    await sess('s.loadout.acquire("card_spirit_bolt"); s.flags.set("defeated:r2_slime");'); // (taken, and the second guardian down)
    await ctx.step(2);
    await through(89.5);
    s = await state();
    assert.equal(s.room, 'r3_chamber');
    await ctx.page.waitForTimeout(50);
    p = await stored(ctx.page);
    assert.deepEqual(p!.at, { room: 'r3_chamber', entry: 'west' });
    assert.deepEqual(p!.checkpoint, { room: 'r2_hall', entry: 'rest' }, 'the shrine was a checkpoint, and it was saved');
    assert.deepEqual(p!.flags, ['defeated:r1_slime', 'defeated:r2_slime']);
    assert.deepEqual(p!.abilities, ['dash', 'magic_attack'], 'the card taught the Spirit Bolt');
    assert.deepEqual(p!.cards, { owned: ['card_spirit_bolt'], equipped: 'card_spirit_bolt' });
    assert.equal(await ctx.page.evaluate(`Object.keys(localStorage).filter((k) => k.startsWith('troid.')).sort().join()`), 'troid.progress', 'one key, no leftovers: the backup is removed once the new copy is known good');
    await ctx.shot('a-01-before-the-reload');

    // ================================================================================================ reload: the same game
    await reload();
    s = await state();
    assert.equal(s.room, 'r3_chamber', 'the room the hero was in');
    assert.ok(Math.abs(s.x - 4) < 0.1, `at the entry they came in by (x = ${s.x})`);
    assert.deepEqual(s.flags, ['defeated:r1_slime', 'defeated:r2_slime'], 'what was won');
    assert.equal(s.card, 'card_spirit_bolt', 'the card, equipped');
    assert.equal(await dom('hud-card', 'data-state'), 'ready', 'the HUD shows it');
    assert.equal(await sess('return s.abilities.has("magic_attack") && s.abilities.has("dash")'), true, 'and the abilities');
    assert.deepEqual(s.bottles, ['ready', 'ready', 'ready']);
    assert.deepEqual(s.respawnPoint, { room: 'r2_hall', entry: 'rest' }, 'and the checkpoint a defeat uses');
    assert.equal(s.health, s.maxHealth);
    assert.equal(s.magic, 100);
    assert.equal(s.transition?.phase, 'none');
    await ctx.shot('a-02-after-the-reload');
    // the loaded game works: the Spirit Bolt can be cast (30 magic), the guardians are not back, and a defeat goes to the shrine
    await ctx.page.keyboard.down('KeyK');
    await ctx.step(1);
    await ctx.page.keyboard.up('KeyK');
    await ctx.step(24);
    assert.ok((await state()).magic! <= 71, 'the Spirit Bolt was cast after the reload (30 magic)');
    await ctx.teleport(1.2, 0);
    await ctx.step(40);
    s = await state();
    assert.equal(s.room, 'r2_hall');
    assert.equal(s.enemies?.length, 0, 'R2\'s guardian is not back');
    await ctx.teleport(1.2, 0);
    await ctx.step(40);
    assert.equal((await state()).room, 'r1_gate');
    assert.equal((await state()).enemies?.length, 0, 'nor is R1\'s');
    assert.equal((await state()).gates?.exit_door?.open, true, 'and its door is open');
    await through(110);
    await through(89.5);
    await ctx.teleport(40, 0);
    await sess('s.player.health.damage(s.player.health.current - 1);');
    await ctx.page.evaluate('window.__troid.strikePlayer(1)');
    await ctx.step(2);
    assert.notEqual((await state()).death?.phase, 'none', 'the hero fell');
    for (let i = 0; i < 400 && (await state()).death?.phase !== 'none'; i++) await ctx.step(2);
    await ctx.step(10);
    s = await state();
    assert.equal(s.room, 'r2_hall', 'a defeat in the loaded game goes to the saved checkpoint');
    assert.ok(Math.abs(s.x - 12.8) < 0.3);

    // ================================================================================================ a second reload changes nothing (and writes nothing new)
    const before = await ctx.page.evaluate(`localStorage.getItem(${JSON.stringify(KEY)})`);
    await reload();
    await ctx.step(60);
    assert.equal(await ctx.page.evaluate(`localStorage.getItem(${JSON.stringify(KEY)})`), before, 'reloading and playing a minute without winning anything leaves the save as it was');
    assert.equal((await state()).room, 'r2_hall', 'it picks up where the last room was entered');

    // ================================================================================================ a damaged save: kept aside, a fresh game; with a backup: the backup
    const good = before as string;
    await ctx.page.evaluate(`localStorage.setItem(${JSON.stringify(KEY)}, '{"saveVersion":1,"flags":["defeated:r1_sl')`);
    await reload();
    s = await state();
    assert.equal(s.room, 'r1_gate', 'an unreadable save: a new game');
    assert.deepEqual(s.flags, []);
    assert.equal(await ctx.page.evaluate(`localStorage.getItem(${JSON.stringify(KEY + '.corrupt')})`), '{"saveVersion":1,"flags":["defeated:r1_sl', 'the damaged text is KEPT, not overwritten');
    await ctx.page.evaluate(`localStorage.setItem(${JSON.stringify(KEY)}, 'broken'); localStorage.setItem(${JSON.stringify(KEY + '.bak')}, ${JSON.stringify(good)});`);
    await reload();
    s = await state();
    assert.equal(s.room, 'r2_hall', 'an unreadable save with a good backup: the backup');
    assert.deepEqual(s.flags, ['defeated:r1_slime', 'defeated:r2_slime']);
    assert.equal(await ctx.page.evaluate(`localStorage.getItem(${JSON.stringify(KEY)})`), good, 'and it is put back where it belongs');
    // a save from a later game is not read and not overwritten
    const future = '{"saveVersion":99,"hello":"from the future"}';
    await ctx.page.evaluate(`localStorage.removeItem(${JSON.stringify(KEY + '.bak')}); localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(future)});`);
    await reload();
    assert.equal((await state()).room, 'r1_gate');
    assert.equal(await ctx.page.evaluate(`localStorage.getItem(${JSON.stringify(KEY + '.corrupt')})`), future, 'kept aside');
    // and a save that names a room the game does not have starts at the start of the world, with what it had won
    await ctx.page.evaluate(`localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(JSON.stringify({ saveVersion: 1, at: { room: 'ghost', entry: 'x' }, checkpoint: { room: 'ghost', entry: 'y' }, flags: ['defeated:r1_slime'], abilities: ['dash'], cards: { owned: [], equipped: null }, bottleSlots: 3 }))})`);
    await reload();
    s = await state();
    assert.equal(s.room, 'r1_gate', 'a place the world does not have is never trusted');
    assert.deepEqual(s.flags, ['defeated:r1_slime'], 'but what was won is kept');
    assert.deepEqual(s.respawnPoint, { room: 'r1_gate', entry: 'start' });

    // ================================================================================================ a playground never touches the save
    await ctx.page.evaluate(`localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(good)})`);
    await ctx.open('room=movement_test&unlock=dash', size);
    s = await state();
    assert.equal(s.room, 'movement_test');
    assert.deepEqual(s.flags, [], 'a playground has none of the game\'s memory');
    await sess('s.flags.set("zzz"); s.loadout.acquire("card_spirit_bolt");');
    await ctx.step(10);
    assert.equal(await stored(ctx.page), null, 'and writes none (this context is a fresh one: nothing was there to be disturbed)');

    // ================================================================================================ ?new=1 starts over
    await ctx.open('', size);
    await sess('s.flags.set("defeated:r1_slime"); s.loadout.acquire("card_spirit_bolt");');
    await ctx.step(2);
    await ctx.page.waitForTimeout(50);
    assert.ok(await stored(ctx.page), 'a game in progress');
    const url = new URL(ctx.page.url());
    url.searchParams.set('new', '1');
    await ctx.page.goto(url.toString());
    await ctx.page.waitForFunction('window.__troid && window.__troid.ready() && window.__troid.effectsReady()', undefined, { timeout: 30000 });
    await ctx.page.evaluate('window.__troid.pause()');
    s = await state();
    assert.equal(s.room, 'r1_gate');
    assert.deepEqual(s.flags, [], '`?new=1` starts over');
    assert.equal(s.card, null);
    assert.equal(await stored(ctx.page), null, 'and the old save is gone');
    assert.equal(await ctx.page.evaluate(`Object.keys(localStorage).filter((k) => k.startsWith('troid.progress')).length`), 0, 'with its copies');

    assert.ok(worst <= 60, `draw calls peaked at ${worst}`);
    console.log(`  save: written as it happens, one key; reload restores room, flags, card, abilities, bottles and checkpoint; damaged, backup, future and ghost-room saves handled; playgrounds untouched; ?new=1 · worst ${worst} draw calls (budget 60)`);
  },
};
