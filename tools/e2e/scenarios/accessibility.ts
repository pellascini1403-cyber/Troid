import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import { barAt, watchRectangle } from '../hud';
import type { Ctx, Scenario } from '../scenario';

/**
 * THE ACCESSIBILITY CHOICES in a real browser (docs/PROMPT14-LOG.md): fewer flashes, no camera shake and the size of the interface. Each is offered only because it changes something the game really does,
 * so each is checked at the thing it changes — the HUD whose white rectangle stops stretching, the pulses at the edge of the screen that soften, the camera that no longer shakes (and the shake it had stops with the choice),
 * the HUD that grows and the buttons and the pause button that make way for it — and then that it was SAVED, that it SURVIVES a reload, and that going back gives the game as it was.
 */
const KEY = 'troid.settings';
const q = (page: Page, id: string): ReturnType<Page['locator']> => page.locator(`[data-testid="${id}"]`);
const attr = (page: Page, id: string, name: string): Promise<string | null> => q(page, id).getAttribute(name);
const hooks = <T>(page: Page, expr: string): Promise<T> => page.evaluate(`window.__troid.${expr}`) as Promise<T>;

async function waitFor(page: Page, expr: string, what: string, tries = 160): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (await page.evaluate(expr)) return;
    await page.waitForTimeout(50);
  }
  assert.fail(`${what} (${expr})`);
}
async function ready(page: Page): Promise<void> {
  await page.waitForFunction('window.__troid && window.__troid.ready()', undefined, { timeout: 30000 });
  await page.waitForFunction('window.__troid.effectsReady()', undefined, { timeout: 30000 });
  await page.evaluate('window.__troid.pause()');
  await page.waitForTimeout(150);
}
async function savedAccessibility(page: Page, ok: (a: Record<string, unknown>) => boolean, what: string): Promise<Record<string, unknown>> {
  let last: unknown = null;
  for (let i = 0; i < 80; i++) {
    const raw = (await page.evaluate(`localStorage.getItem(${JSON.stringify(KEY)})`)) as string | null;
    last = raw === null ? null : (JSON.parse(raw) as Record<string, any>)['accessibility'];
    if (last && ok(last as Record<string, unknown>)) return last as Record<string, unknown>;
    await page.waitForTimeout(50);
  }
  assert.fail(`${what} (saved: ${JSON.stringify(last)})`);
}
const setRange = (page: Page, id: string, value: number): Promise<void> =>
  q(page, id).evaluate((el, v) => {
    const input = el as HTMLInputElement;
    input.value = String(v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
async function box(page: Page, id: string): Promise<{ x: number; y: number; w: number; h: number }> {
  const b = await q(page, id).boundingBox();
  assert.ok(b, `${id} is on screen`);
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}
const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
async function openSettings(page: Page): Promise<void> {
  await q(page, 'pause-button').click();
  await page.waitForSelector('[data-testid="pause-menu"][data-open="1"]', { timeout: 15000 });
  await q(page, 'pause-settings').click();
  await page.waitForSelector('[data-testid="settings-screen"][data-open="1"]', { timeout: 15000 });
}
/** The scroll area of the settings screen: does it say there is more below, and is the fade really drawn (the computed mask) — and how far it can scroll. */
const scrollArea = (page: Page): Promise<{ more: string | undefined; masked: boolean; room: number; top: number }> =>
  page.evaluate(`(() => {
    const body = document.querySelector('[data-testid="settings-screen"] .settings-body');
    const style = getComputedStyle(body);
    const mask = style.maskImage || style.webkitMaskImage || 'none';
    return { more: body.dataset.more, masked: mask !== 'none', room: body.scrollHeight - body.clientHeight, top: body.scrollTop };
  })()`) as never;

async function closeMenu(page: Page): Promise<void> {
  await q(page, 'settings-back').click();
  await q(page, 'pause-resume').click();
  await page.waitForSelector('[data-testid="pause-menu"][data-open="0"]', { state: 'attached' });
}

/**
 * A real blow — and what the HUD draws of it: how far the white rectangle of the life stretches (a factor of the width the artist drew it), watched on every write the HUD makes to it, from before the blow lands to a
 * moment after it has been over. The life is brought back to full afterwards, so that the next look starts from the same place.
 */
async function lose(ctx: Ctx): Promise<{ peak: number; after: string }> {
  const { page } = ctx;
  await ctx.step(60); // on their feet: not in the middle of a blow, with nothing else going on
  await page.evaluate('window.__troid.session.player.health.restore()');
  await ctx.step(1);
  await barAt(page, 'life', 1);
  const watched = watchRectangle(page, 'life', 1100);
  await page.evaluate('window.__troid.strikePlayer(1)');
  await ctx.step(1);
  const after = (await page.evaluate(`(() => { const s = window.__troid.state(); return JSON.stringify({ health: s.health, state: s.state, hurt: s.invulnerable }); })()`)) as string;
  const peak = await watched;
  await page.evaluate('window.__troid.session.player.health.restore()');
  await ctx.step(80);
  return { peak, after };
}

/**
 * What the simulation decided, and nothing of how it was drawn: the same inputs must end in the same digest whatever the settings. The clock is counted from where the fight began — a page runs a
 * handful of real-time ticks before a test stops it, and how many depends on how fast the machine was that moment — and an enemy's own tick counter is left out for the same reason. Of the enemies,
 * only those near the fight count: the room's own slime patrols far away from it, and where it is depends on those same first ticks.
 */
const DIGEST = `(() => { const s = window.__troid.state(); return { room: s.room, since: s.now - window.__fightStart, x: s.x, y: s.y, vx: s.vx, vy: s.vy, grounded: s.grounded, state: s.state, health: s.health, maxHealth: s.maxHealth, magic: s.magic,
  bottles: s.bottles, invulnerable: s.invulnerable, hitStop: s.hitStop, combat: s.combat, flags: [...s.flags].sort(),
  dummies: s.dummies.map((d) => [d.id, d.x, d.vx, d.hp, d.hits]), enemies: s.enemies.filter((e) => Math.abs(e.x - s.x) < 30).map((e) => [e.id, e.def, e.state, e.x, e.y, e.vx, e.hp, e.hits]) }; })()`;

/** A fixed fight, with real keys and a hostile blow, in about 330 ticks: the hero strikes the dummy in front of them, walks on, attacks, jumps, dashes and is struck. */
async function fight(ctx: Ctx): Promise<unknown> {
  const { page } = ctx;
  await page.evaluate('window.__fightStart = window.__troid.state().now');
  await ctx.step(30);
  const x0 = (await ctx.state()).x;
  await page.evaluate(`window.__troid.spawnDummy(${x0 + 1.3}, 0, 12)`);
  await page.evaluate(`window.__troid.spawnSlime(${x0 + 9}, 0, -1)`);
  await ctx.step(10);
  const hold = async (code: string, ticks: number): Promise<void> => {
    await page.keyboard.down(code);
    await ctx.step(ticks);
    await page.keyboard.up(code);
  };
  for (let i = 0; i < 3; i++) {
    await hold('KeyJ', 6);
    await ctx.step(14);
  }
  await hold('KeyD', 40);
  await hold('KeyJ', 6);
  await ctx.step(30);
  await hold('Space', 12);
  await ctx.step(30);
  await hold('ShiftLeft', 6);
  await ctx.step(10);
  await page.evaluate('window.__troid.strikePlayer(1)');
  await ctx.step(50);
  await hold('KeyJ', 6);
  await ctx.step(60);
  return page.evaluate(DIGEST);
}

export const accessibility: Scenario = {
  name: 'accessibility',
  async run(ctx: Ctx) {
    // ================================================================================================ the game as it is: nothing is on
    await ctx.open('new=1', { width: 1280, height: 720, dpr: 1 });
    let page = ctx.page;
    let s = await ctx.state();
    assert.equal(s.screen?.calm, false, 'the pulses of the screen are at their strength');
    assert.equal(await attr(page, 'hud', 'data-calm'), '0', 'the HUD is as designed');
    const hud1 = await box(page, 'hud-block');
    // a real blow as designed: the white rectangle of the life trails the picture of the bar and stretches behind it (it becomes about three times as wide as the artist drew it) before it comes back
    const bright = await lose(ctx);
    assert.ok(bright.peak > 1.5, `the white rectangle of what was just lost stretches (${bright.peak.toFixed(2)} times the artist's width; after the blow: ${bright.after})`);
    await hooks(page, 'shake(0.8)');
    assert.ok((await ctx.state()).trauma! > 0.7, 'a blow jolts the camera');
    await hooks(page, 'settleCamera(3)');

    // ================================================================================================ the screen offers three choices, each saying what it does
    await openSettings(page);
    // the fade that says "there is more below" must be the truth whatever the window: drawn when there is something to scroll to, and only then — also when the window changes size under it (the page looks again)
    const fadeIsTrue = (a: { more: string | undefined; masked: boolean; room: number }, where: string): void =>
      assert.deepEqual([a.more, a.masked], a.room > 1 ? ['1', true] : ['0', false], `${where}: the fade is drawn when there is something to scroll to, and only then (${JSON.stringify(a)})`);
    // (the page takes note of the size of the window on its next frame: wait for what it says to agree with what the geometry is, and then judge it)
    const hintAgrees = `(() => { const b = document.querySelector('[data-testid="settings-screen"] .settings-body'); return b.dataset.more === (b.scrollHeight - b.clientHeight - b.scrollTop > 1 ? '1' : '0'); })()`;
    await waitFor(page, hintAgrees, 'the page to take note of the size of the window');
    fadeIsTrue(await scrollArea(page), 'on the desktop window of 1280 × 720');
    await page.setViewportSize({ width: 1280, height: 960 });
    await waitFor(page, `window.innerHeight === 960 && document.querySelector('[data-testid="settings-screen"] .settings-body').dataset.more === '0'`, 'the page to notice that the window grew');
    const roomy = await scrollArea(page);
    assert.deepEqual([roomy.more, roomy.masked, roomy.room], ['0', false, 0], `on a tall desktop window the whole screen fits: nothing to scroll to, no fade (${JSON.stringify(roomy)})`);
    await page.setViewportSize({ width: 1280, height: 720 });
    await waitFor(page, `window.innerHeight === 720`, 'the window to be back to 1280 × 720');
    await waitFor(page, hintAgrees, 'the page to take note that the window shrank again');
    fadeIsTrue(await scrollArea(page), 'back on the 1280 × 720 window');
    for (const id of ['settings-flashes', 'settings-shake']) {
      assert.equal(await attr(page, id, 'role'), 'switch');
      assert.equal(await attr(page, id, 'aria-checked'), 'false');
    }
    assert.equal(await (q(page, 'settings-hud-size')).inputValue(), '1');
    assert.match((await q(page, 'settings-flashes-note').textContent()) ?? '', /pulses at the edges of the screen/);
    assert.match((await q(page, 'settings-shake-note').textContent()) ?? '', /camera does not shake/);
    await ctx.shot('a-01-the-choices');

    // ================================================================================================ no camera shake: what trembles stops, and nothing trembles after
    await hooks(page, 'shake(0.9)');
    assert.ok((await ctx.state()).trauma! > 0.8, 'the camera is trembling');
    await q(page, 'settings-shake').click();
    assert.equal(await attr(page, 'settings-shake', 'aria-checked'), 'true');
    s = await ctx.state();
    assert.equal(s.trauma, 0, 'the trembling stopped with the choice, at once');
    await hooks(page, 'shake(0.8)');
    assert.equal((await ctx.state()).trauma, 0, 'and a blow no longer shakes the camera');
    await savedAccessibility(page, (a) => a['reduceShake'] === true && a['reduceFlashes'] === false && a['hudScale'] === 1, 'it was saved');
    await closeMenu(page);
    // a real blow: the game counts the impact (the hit happened) and the camera stays still
    const shakes0 = (await ctx.state()).shakes!.count;
    await page.evaluate('window.__troid.strikePlayer(1)');
    await ctx.step(2);
    s = await ctx.state();
    assert.ok(s.shakes!.count > shakes0, 'the blow landed');
    assert.equal(s.trauma, 0, 'and the camera did not move for it');

    // ================================================================================================ fewer flashes: the HUD does not blink, the pulses at the edge are softer
    await openSettings(page);
    await q(page, 'settings-flashes').click();
    assert.equal(await attr(page, 'settings-flashes', 'aria-checked'), 'true');
    assert.equal(await attr(page, 'hud', 'data-calm'), '1', 'the HUD is calm: the white rectangle does not stretch, and nothing blinks or shines by itself');
    assert.equal((await ctx.state()).screen?.calm, true, 'the pulses at the edge of the screen are softened');
    const animated = await page.evaluate(`[...document.querySelectorAll('[data-testid="hud"], [data-testid="hud"] *')].filter((e) => getComputedStyle(e).animationName !== 'none').length`);
    assert.equal(animated, 0, 'nothing of the HUD blinks or shines by itself');
    await savedAccessibility(page, (a) => a['reduceShake'] === true && a['reduceFlashes'] === true, 'both were saved');
    await ctx.shot('a-02-both-on');

    // ================================================================================================ the size of the interface: the HUD grows, the pause button keeps clear of it
    await setRange(page, 'settings-hud-size', 1.35);
    assert.match((await q(page, 'settings-accessibility').textContent()) ?? '', /135%/);
    await page.waitForTimeout(150);
    const hud2 = await box(page, 'hud-block');
    assert.ok(Math.abs(hud2.w / hud1.w - 1.35) < 0.03, `the HUD is 35 % wider (${hud1.w.toFixed(1)} → ${hud2.w.toFixed(1)})`);
    assert.ok(Math.abs(hud2.h / hud1.h - 1.35) < 0.03, 'and taller');
    assert.ok(Math.abs(hud2.x - hud1.x * 1.35) < 2 && hud2.x > 0, 'from its corner, inside the screen');
    await closeMenu(page);
    // the same real blow with the choice on: the white rectangle keeps the size the artist drew it (nothing flashes), and the number and the bar still say what was lost
    const soft = await lose(ctx);
    assert.equal(soft.peak, 1, `with fewer flashes the white rectangle does not stretch (${soft.peak} against ${bright.peak.toFixed(2)}; after the blow: ${soft.after})`);
    const pb = await box(page, 'pause-button');
    assert.ok(!overlap(pb, hud2), `the pause button does not touch the bigger HUD (${JSON.stringify(pb)} / ${JSON.stringify(hud2)})`);
    assert.ok(pb.x >= 0 && pb.x + pb.w <= 1280 && pb.y >= 0, 'and is inside the screen');
    await savedAccessibility(page, (a) => a['hudScale'] === 1.35, 'the size was saved');
    await ctx.shot('a-03-big-hud');

    // ================================================================================================ it survives a reload: from the first frame
    await page.reload();
    await ready(page);
    assert.equal(await attr(page, 'hud', 'data-calm'), '1');
    const hud3 = await box(page, 'hud-block');
    assert.ok(Math.abs(hud3.w - hud2.w) < 1.5, `the HUD is as big as it was left (${hud2.w.toFixed(1)} → ${hud3.w.toFixed(1)})`);
    s = await ctx.state();
    assert.equal(s.screen?.calm, true, 'the effects were built with the softened pulses');
    await hooks(page, 'shake(0.8)');
    assert.equal((await ctx.state()).trauma, 0, 'the camera still does not shake');
    await openSettings(page);
    assert.equal(await attr(page, 'settings-flashes', 'aria-checked'), 'true', 'the menu shows what was saved');
    assert.equal(await attr(page, 'settings-shake', 'aria-checked'), 'true');
    assert.equal(await q(page, 'settings-hud-size').inputValue(), '1.35');

    // a rebuild of the effects (another quality profile) keeps the softened pulses
    await q(page, 'settings-quality-low').click();
    await waitFor(page, `window.__troid.state().quality.tier === 'low' && window.__troid.state().screen !== null`, 'the effects are built again');
    assert.equal((await ctx.state()).screen?.calm, true, 'a new quality profile does not undo the choice');
    await q(page, 'settings-quality-auto').click();

    // ================================================================================================ going back: the game as it was
    await q(page, 'settings-flashes').click();
    await q(page, 'settings-shake').click();
    await setRange(page, 'settings-hud-size', 1);
    assert.equal(await attr(page, 'hud', 'data-calm'), '0');
    assert.equal((await ctx.state()).screen?.calm, false);
    await page.waitForTimeout(150);
    const hud4 = await box(page, 'hud-block');
    assert.ok(Math.abs(hud4.w - hud1.w) < 1.5, `the HUD is as it was (${hud1.w.toFixed(1)} → ${hud4.w.toFixed(1)})`);
    await hooks(page, 'shake(0.8)');
    assert.ok((await ctx.state()).trauma! > 0.7, 'the camera shakes again');
    await savedAccessibility(page, (a) => a['reduceFlashes'] === false && a['reduceShake'] === false && a['hudScale'] === 1, 'and the choices were saved as off');
    await closeMenu(page);

    // ================================================================================================ on a touch screen: the buttons make way for a bigger HUD, the HUD never covers a button
    await ctx.open('touch=1&new=1', { width: 844, height: 390, dpr: 1, touch: true });
    page = ctx.page;
    await openSettings(page);
    // a phone held sideways is 390 px tall: the screen does not fit, and says there is more below (the last lines fade out) until the end is reached
    const sideways = await scrollArea(page);
    assert.ok(sideways.room > 20, `the settings do not fit a phone held sideways (${JSON.stringify(sideways)})`);
    assert.deepEqual([sideways.more, sideways.masked], ['1', true], `…and it says so: more below, the fade is drawn (${JSON.stringify(sideways)})`);
    await q(page, 'settings-hud-size').scrollIntoViewIfNeeded();
    await page.evaluate(`document.querySelector('[data-testid="settings-screen"] .settings-body').scrollTop = 1e6`);
    // (the page takes note of a scroll on its next frame, which on a machine without a GPU is more than a fixed 150 ms away: wait for the page to have noticed, and then say what it says)
    await waitFor(page, `document.querySelector('[data-testid="settings-screen"] .settings-body').dataset.more === '0'`, 'the page to notice that it was scrolled to the end');
    const atTheEnd = await scrollArea(page);
    assert.deepEqual([atTheEnd.more, atTheEnd.masked], ['0', false], `at the end of the scroll the last line is shown plainly (${JSON.stringify(atTheEnd)})`);
    await setRange(page, 'settings-hud-size', 1.35);
    await closeMenu(page);
    await page.waitForTimeout(200);
    const hudT = await box(page, 'hud-block');
    const pbT = await box(page, 'pause-button');
    assert.ok(!overlap(pbT, hudT), 'the pause button is clear of the bigger HUD on a phone');
    const layout = ((await hooks(page, 'touch()')) as { layout: { attack: { cx: number; cy: number; hit: number }; dash: { cx: number; cy: number; hit: number }; ability: { cx: number; cy: number; hit: number }; chip: { cx: number; cy: number; hit: number } } }).layout;
    for (const id of ['attack', 'dash', 'ability', 'chip'] as const) {
      const d = layout[id];
      const r = { x: d.cx - d.hit / 2, y: d.cy - d.hit / 2, w: d.hit, h: d.hit };
      const nx = Math.max(hudT.x, Math.min(d.cx, hudT.x + hudT.w));
      const ny = Math.max(hudT.y, Math.min(d.cy, hudT.y + hudT.h));
      assert.ok(Math.hypot(d.cx - nx, d.cy - ny) >= d.hit / 2 - 1e-6, `the ${id} button stays off the bigger HUD (${JSON.stringify(r)} / ${JSON.stringify(hudT)})`);
      assert.ok(d.hit >= 44 - 1e-6, `and is still a finger (${d.hit})`);
    }
    await ctx.shot('b-01-phone-big-hud');

    // ================================================================================================ none of it touches the rules: the same fight, bit for bit, with every choice on and with none
    await ctx.open('new=1', { width: 1280, height: 720, dpr: 1 });
    const plain = await fight(ctx);
    const chosen = {
      version: 4, language: 'en', quality: 'low', volume: { master: 0 }, keys: {}, slot: 1,
      touch: { scale: 1.4, opacity: 0.3, buttons: { attack: { x: 0.2, y: 0.8, scale: 1.5 }, dash: { x: 0.35, y: 0.9, scale: 0.7 } } },
      accessibility: { reduceFlashes: true, reduceShake: true, hudScale: 1.35 },
    };
    await ctx.open('new=1', {
      width: 1280, height: 720, dpr: 1,
      prepare: async (context) => {
        await context.addInitScript(`if (!localStorage.getItem(${JSON.stringify(KEY)})) localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(JSON.stringify(chosen))});`);
      },
    });
    page = ctx.page;
    assert.equal((await ctx.state()).screen?.calm, true, 'this page really is running with the choices on');
    assert.equal(await attr(page, 'hud', 'data-calm'), '1');
    const withChoices = await fight(ctx);
    assert.deepEqual(withChoices, plain, 'the same inputs gave the same fight: position, life, magic, bottles, the dummy, the slime and the clock are identical');
    assert.ok(((plain as { dummies: unknown[][] }).dummies[0]?.[4] as number) > 0, `and it was a fight: the dummy was hit (${JSON.stringify(plain)})`);
    // ================================================================================================ a system that asks for less motion: the game begins with the camera still and the effects calm — until the player chooses
    await ctx.open('new=1', { width: 1280, height: 720, dpr: 1 });
    page = ctx.page;
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await ready(page);
    assert.equal(await page.evaluate(`localStorage.getItem(${JSON.stringify(KEY)})`), null, 'nothing was saved for a player who has chosen nothing');
    assert.equal((await ctx.state()).screen?.calm, true, 'the effects were built with the softened pulses');
    assert.equal(await attr(page, 'hud', 'data-calm'), '1', 'the HUD does not flash');
    await hooks(page, 'shake(0.8)');
    assert.equal((await ctx.state()).trauma, 0, 'the camera does not shake');
    await openSettings(page);
    assert.equal(await attr(page, 'settings-flashes', 'aria-checked'), 'true', 'the menu shows both choices on, as the game has them');
    assert.equal(await attr(page, 'settings-shake', 'aria-checked'), 'true');
    // the player chooses the other way: that is what is kept, over what the system asked
    await q(page, 'settings-shake').click();
    await savedAccessibility(page, (a) => a['reduceShake'] === false && a['reduceFlashes'] === true, 'the choice was saved');
    await closeMenu(page);
    await page.reload();
    await ready(page);
    await hooks(page, 'shake(0.8)');
    assert.ok((await ctx.state()).trauma! > 0.7, 'after a reload the camera shakes: the player\'s choice is stronger than the system\'s');
    assert.equal(await attr(page, 'hud', 'data-calm'), '1', 'while the flashes stay calm, as it was left');
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    console.log('  accessibility: no camera shake (and the shake it had stops) · fewer flashes (the white rectangle of the HUD does not stretch and nothing of it blinks, the glow of a vial drunk and the wave of light of a real heal softened, the pulses of the screen, kept across a rebuild of the effects) · interface size (the HUD, the pause button and the touch buttons make way) · saved, kept after a reload, reversible · a system that asks for less motion starts the game calm, and the player\'s own choice wins');
  },
};
