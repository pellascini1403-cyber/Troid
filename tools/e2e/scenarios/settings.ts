import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import { frames } from '../frames';
import type { Ctx, GameState, Scenario } from '../scenario';
import { TouchScreen } from '../touch';

/**
 * THE SETTINGS in a real browser (docs/PROMPT6-LOG.md S30): the volume (prepared: there is no sound yet), the quality profile (Auto / Low / High — which
 * measures nothing), the keys of the main actions and the side and position of the touch controls. Each one is changed through the menu the way a person
 * does — the pause button, a slider, a click, a real key — and then three things are looked at: it is IN FORCE at once (the game answers to it), it is
 * SAVED (the file the game writes), and it SURVIVES a reload (the first frame after it is already right). Also: a game saved by the first version of
 * the settings still loads (and keeps what it held), a damaged file is repaired and never stops the game, and the console stays clean.
 */
const KEY = 'troid.settings';
const SIZE = { width: 844, height: 390, dpr: 2 };

const saved = async (page: Page): Promise<Record<string, any> | null> => {
  const raw = (await page.evaluate(`localStorage.getItem(${JSON.stringify(KEY)})`)) as string | null;
  return raw === null ? null : (JSON.parse(raw) as Record<string, any>);
};
/** The settings are written a moment after the click (a few async steps): wait for what is asked of them. */
async function savedWhere(page: Page, ok: (s: Record<string, any>) => boolean, what: string): Promise<Record<string, any>> {
  let last: Record<string, any> | null = null;
  for (let i = 0; i < 60; i++) {
    last = await saved(page);
    if (last && ok(last)) return last;
    await page.waitForTimeout(50);
  }
  assert.fail(`${what} (saved: ${JSON.stringify(last)})`);
}
const q = (page: Page, id: string): ReturnType<Page['locator']> => page.locator(`[data-testid="${id}"]`);
const attr = (page: Page, id: string, name: string): Promise<string | null> => q(page, id).getAttribute(name);
const text = async (page: Page, id: string): Promise<string> => (await q(page, id).textContent()) ?? '';
/** A slider as a finger leaves it: its value set and its `input` event sent (what dragging does, every step of the way). */
const setRange = (page: Page, id: string, value: number): Promise<void> =>
  q(page, id).evaluate((el, v) => {
    const input = el as HTMLInputElement;
    input.value = String(v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

/** The volume as the game reports it: the level exactly, the gain (its curve) to a hair — 0.8 × 0.8 is not exactly 0.64 in floating point. */
function assertVolume(v: GameState['volume'], level: number, what: string): void {
  assert.ok(v, `${what}: there is a volume`);
  assert.equal(v.level, level, `${what}: the level`);
  assert.ok(Math.abs(v.gain - level * level) < 1e-12, `${what}: the gain is the curve of the level (${v.gain})`);
}

/** A page that was just loaded (or reloaded): wait for the game and for every cosmetic chunk, and stop its clock, as `ctx.open` does. */
async function ready(page: Page): Promise<void> {
  await page.waitForFunction('window.__troid && window.__troid.ready()', undefined, { timeout: 30000 });
  await page.waitForFunction('window.__troid.effectsReady()', undefined, { timeout: 30000 });
  await page.evaluate('window.__troid.pause()');
  await page.waitForTimeout(150);
}
async function reload(ctx: Ctx): Promise<GameState> {
  await ctx.page.reload();
  await ready(ctx.page);
  return ctx.state();
}
async function openMenu(page: Page): Promise<void> {
  await q(page, 'pause-button').click();
  await page.waitForSelector('[data-testid="settings-menu"][data-open="1"]', { timeout: 15000 });
}
async function closeMenu(ctx: Ctx): Promise<void> {
  await q(ctx.page, 'settings-resume').click();
  await ctx.page.waitForSelector('[data-testid="settings-menu"][data-open="0"]', { state: 'attached' });
  assert.equal((await ctx.state()).menuOpen, false, 'the game is out of its menu');
}

export const settings: Scenario = {
  name: 'settings',
  async run(ctx) {
    let worst = 0;
    const state = async (): Promise<GameState> => {
      const s = await ctx.state();
      worst = Math.max(worst, s.drawsMax ?? 0);
      return s;
    };

    // ================================================================================================ a new player: the defaults, and nothing saved
    await ctx.open('', SIZE);
    const { page } = ctx;
    let s = await state();
    assert.equal(s.room, 'r1_gate');
    assertVolume(s.volume, 0.8, 'the volume starts at 80 %');
    assert.deepEqual(s.quality, { setting: 'auto', tier: 'medium', resolution: 1.75, particleBudget: 300, spriteBudget: 40 }, 'Auto is the balanced profile: a screen of density 2 is drawn at 1.75');
    assert.deepEqual(s.keys, { jump: 'Space', attack: 'KeyJ', dash: 'ShiftLeft', ability: 'KeyK', bottle: 'KeyL', interact: 'KeyE', down: 'KeyS' }, 'the keys are the designed ones');
    assert.equal(s.menuOpen, false);
    assert.equal(await saved(page), null, 'a new player leaves nothing behind until they change something');
    assert.equal(s.canvas?.width, Math.round(844 * 1.75), 'the canvas is drawn at that resolution');

    // ================================================================================================ the menu: what it offers where there is a keyboard and no touch layer
    await openMenu(page);
    s = await state();
    assert.equal(s.menuOpen, true, 'the pause button opens it and pauses the game');
    for (const id of ['settings-volume-section', 'settings-quality', 'settings-controls']) assert.equal(await q(page, id).isVisible(), true, `${id} is there`);
    assert.equal(await q(page, 'settings-touch').isVisible(), false, 'no touch layer on a desktop: no touch settings');
    assert.equal(await text(page, 'settings-volume-note'), 'Sound arrives in a later version. Your choice is saved.', 'it says there is no sound yet');
    assert.match(await text(page, 'settings-quality-note'), /does not measure your device yet/, 'and that Auto measures nothing');
    assert.equal(await attr(page, 'settings-quality-auto', 'aria-pressed'), 'true');
    const rows = await page.locator('[data-testid="settings-controls"] button[data-action]').evaluateAll((els) => els.map((e) => [(e as HTMLElement).dataset['action'], e.textContent]));
    assert.deepEqual(rows, [['jump', 'Space'], ['attack', 'J'], ['dash', 'Shift'], ['ability', 'K'], ['bottle', 'L'], ['interact', 'E'], ['down', 'S']], 'a row per action, with its key');
    await ctx.shot('a-01-the-menu');

    // ================================================================================================ the volume: in force at once, saved
    await setRange(page, 'settings-volume', 0.35);
    s = await state();
    assertVolume(s.volume, 0.35, 'the slider');
    assert.match(await text(page, 'settings-volume-section'), /35%/, 'the slider says what it is at');
    await savedWhere(page, (f) => f['volume']?.master === 0.35, 'the volume was saved');
    // a key on the slider moves it by a step, like any slider
    await q(page, 'settings-volume').focus();
    await page.keyboard.press('Home');
    assert.equal((await state()).volume?.level, 0, 'Home is silence');
    await page.keyboard.press('End');
    assert.equal((await state()).volume?.level, 1, 'End is full');
    await setRange(page, 'settings-volume', 0.35);
    assert.equal((await state()).volume?.level, 0.35);

    // ================================================================================================ the quality: the picture and the effects follow, and nothing is measured
    const profile = async (name: 'low' | 'high' | 'auto', want: { tier: string; resolution: number; particles: number; sprites: number }): Promise<void> => {
      await q(page, `settings-quality-${name}`).click();
      const t = await state();
      assert.deepEqual(
        [t.quality?.setting, t.quality?.tier, t.quality?.resolution, t.quality?.particleBudget, t.quality?.spriteBudget],
        [name, want.tier, want.resolution, want.particles, want.sprites],
        `${name}: the profile in force`,
      );
      assert.equal(t.canvas?.width, Math.round(844 * want.resolution), `${name}: the picture is drawn at ${want.resolution}`);
      assert.equal(await attr(page, `settings-quality-${name}`, 'aria-pressed'), 'true');
    };
    await profile('low', { tier: 'low', resolution: 1.25, particles: 150, sprites: 24 });
    await ctx.shot('a-02-low');
    await profile('high', { tier: 'high', resolution: 2, particles: 400, sprites: 64 });
    await profile('auto', { tier: 'medium', resolution: 1.75, particles: 300, sprites: 40 });
    await profile('low', { tier: 'low', resolution: 1.25, particles: 150, sprites: 24 });
    await savedWhere(page, (f) => f['quality'] === 'low', 'the quality was saved');
    assert.ok((await state()).vfx !== undefined, 'the effects are there after the change (they were built again with the new budgets)');

    // ================================================================================================ the keys: waiting, refusal, swap, free — with real keys
    const press = async (code: string): Promise<void> => {
      await page.keyboard.press(code);
    };
    await q(page, 'settings-key-attack').click();
    assert.equal(await attr(page, 'settings-key-attack', 'data-listening'), '1', 'the action waits for its key');
    assert.equal(await text(page, 'settings-key-attack'), 'Press a key…');
    await press('KeyF');
    assert.equal(await text(page, 'settings-key-attack'), 'F', 'attack is F');
    assert.equal((await state()).keys?.['attack'], 'KeyF');

    await q(page, 'settings-key-dash').click();
    await press('KeyD'); // movement: refused
    assert.equal(await attr(page, 'settings-key-dash', 'data-listening'), '1', 'a reserved key is refused and the action keeps waiting');
    assert.equal(await text(page, 'settings-keys-message'), 'That key is reserved. Try another one.');
    assert.equal((await state()).keys?.['dash'], 'ShiftLeft', 'the dash did not move');
    await press('Escape'); // cancels the wait — it is NOT the pause: the menu stays open
    assert.equal(await attr(page, 'settings-key-dash', 'data-listening'), '0');
    assert.equal(await attr(page, 'settings-menu', 'data-open'), '1', 'Escape while waiting for a key cancels it and leaves the menu open');
    assert.equal((await state()).menuOpen, true);

    await q(page, 'settings-key-jump').click();
    await press('KeyF'); // the attack's: they swap
    assert.deepEqual([await text(page, 'settings-key-jump'), await text(page, 'settings-key-attack')], ['F', 'Space'], 'jump took the attack\'s key and the attack took the jump\'s');
    assert.equal(await text(page, 'settings-keys-message'), 'F was used by Attack: they swap keys.');
    await q(page, 'settings-key-jump').click();
    await press('KeyH');
    assert.deepEqual([await text(page, 'settings-key-jump'), await text(page, 'settings-key-attack')], ['H', 'Space']);
    s = await state();
    assert.deepEqual(s.keys, { jump: 'KeyH', attack: 'Space', dash: 'ShiftLeft', ability: 'KeyK', bottle: 'KeyL', interact: 'KeyE', down: 'KeyS' });
    await savedWhere(page, (f) => f['keys']?.attack === 'Space' && f['keys']?.jump === 'KeyH' && Object.keys(f['keys']).length === 2, 'only what differs from the defaults was saved');
    await ctx.shot('a-03-keys');
    await closeMenu(ctx);

    // ================================================================================================ the keys, in the game
    /** What a key does: pressed for `ticks` ticks, then let go. */
    const tryKey = async (code: string, ticks = 5): Promise<GameState> => {
      await ctx.step(40); // standing, settled
      await page.keyboard.down(code);
      await ctx.step(ticks);
      const t = await state();
      await page.keyboard.up(code);
      await ctx.step(60);
      return t;
    };
    s = await tryKey('KeyH');
    assert.ok(!s.grounded && s.vy > 0, `H jumps (grounded ${s.grounded}, vy ${s.vy})`);
    s = await tryKey('Space');
    assert.ok(s.grounded && s.combat?.attack !== null, `Space attacks and does not jump (${s.combat?.attack}, grounded ${s.grounded})`);
    s = await tryKey('KeyF');
    assert.ok(s.grounded && s.combat?.attack === null, 'F, which was the attack for a moment, does nothing now');
    s = await tryKey('KeyJ');
    assert.ok(s.grounded && s.combat?.attack === null, 'J, the designed attack key, does nothing now');
    s = await tryKey('ShiftRight', 3);
    assert.ok(Math.abs(s.vx) > 8 || s.state === 'dash', 'the extra key of the dash still dashes');

    // ================================================================================================ a reload: all of it is as it was from the first frame
    s = await reload(ctx);
    assertVolume(s.volume, 0.35, 'after the reload');
    assert.deepEqual([s.quality?.setting, s.quality?.tier, s.quality?.resolution], ['low', 'low', 1.25], 'the quality: the renderer was built with it');
    assert.equal(s.canvas?.width, Math.round(844 * 1.25), 'the very first picture is already at that resolution');
    assert.deepEqual(s.keys, { jump: 'KeyH', attack: 'Space', dash: 'ShiftLeft', ability: 'KeyK', bottle: 'KeyL', interact: 'KeyE', down: 'KeyS' }, 'the keys');
    s = await tryKey('KeyH');
    assert.ok(!s.grounded && s.vy > 0, 'H jumps after the reload');
    s = await tryKey('Space');
    assert.ok(s.combat?.attack !== null, 'and Space attacks');
    await openMenu(page);
    assert.equal((await q(page, 'settings-volume').inputValue()), '0.35', 'the menu shows what was saved');
    assert.equal(await attr(page, 'settings-quality-low', 'aria-pressed'), 'true');
    assert.deepEqual([await text(page, 'settings-key-jump'), await text(page, 'settings-key-attack')], ['H', 'Space']);

    // ================================================================================================ the keys back to the designed ones
    await q(page, 'settings-keys-reset').click();
    assert.deepEqual((await state()).keys, { jump: 'Space', attack: 'KeyJ', dash: 'ShiftLeft', ability: 'KeyK', bottle: 'KeyL', interact: 'KeyE', down: 'KeyS' });
    await savedWhere(page, (f) => Object.keys(f['keys']).length === 0, 'the defaults are the empty map');
    await q(page, 'settings-quality-auto').click();
    await closeMenu(ctx);
    s = await tryKey('KeyJ');
    assert.ok(s.combat?.attack !== null, 'J attacks again');
    s = await tryKey('Space');
    assert.ok(!s.grounded && s.vy > 0, 'and Space jumps');
    await ctx.shot('a-04-back-to-the-defaults');

    // ================================================================================================ a game saved by the first version of the settings (v1) loads and keeps what it held
    await page.evaluate(`localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(JSON.stringify({ version: 1, language: 'es', touch: { scale: 1.2, opacity: 0.8 } }))})`);
    s = await reload(ctx);
    assert.equal(s.lang, 'es', 'the language it held');
    assertVolume(s.volume, 0.8, 'what is new arrives with its defaults');
    assert.equal(s.quality?.setting, 'auto');
    const layout = ((await page.evaluate('window.__troid.touch()')) as { layout: { controlScale: number; gestureScale: number; side: string } }).layout;
    assert.ok(Math.abs(layout.controlScale / layout.gestureScale - 1.2) < 1e-9, 'and the size of the touch controls it held');
    assert.equal(layout.side, 'right');
    assert.equal((await saved(page))?.['version'], 1, 'loading rewrites nothing: the old file stays as it is until something changes');
    await openMenu(page);
    assert.equal(await text(page, 'settings-title'), 'Pausa', 'the menu speaks the language that was saved, words included');
    assert.equal(await text(page, 'settings-volume-section').then((t) => t.includes('Volumen')), true);
    await setRange(page, 'settings-volume', 0.5);
    const upgraded = await savedWhere(page, (f) => f['version'] === 2, 'the file is version 2 from the first change');
    assert.deepEqual(upgraded['volume'], { master: 0.5 });
    assert.equal(upgraded['language'], 'es');
    assert.deepEqual([upgraded['touch'].scale, upgraded['touch'].opacity], [1.2, 0.8], 'and what version 1 held is still in it');
    await closeMenu(ctx);

    // ================================================================================================ a damaged file is repaired, never fatal
    const damaged = { version: 2, language: 'xx-YY', volume: { master: 'loud' }, quality: 'ultra', keys: { attack: 'KeyD', dash: 'Escape', jump: 'KeyH', bogus: 'KeyZ' }, touch: { side: 'up', offsetX: 9, offsetY: -3, scale: 'big' } };
    await page.evaluate(`localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(JSON.stringify(damaged))})`);
    s = await reload(ctx);
    assertVolume(s.volume, 0.8, 'a volume that is not a number is the default');
    assert.equal(s.quality?.setting, 'auto', 'a quality nobody offers is Auto');
    assert.deepEqual(s.keys?.['attack'], 'KeyJ', 'a movement key is not the attack');
    assert.equal(s.keys?.['dash'], 'ShiftLeft', 'the pause key is not the dash');
    assert.equal(s.keys?.['jump'], 'KeyH', 'what is valid in the same file is kept');
    const l2 = ((await page.evaluate('window.__troid.touch()')) as { layout: { side: string; controlScale: number; gestureScale: number } }).layout;
    assert.equal(l2.side, 'right');
    assert.equal(l2.controlScale / l2.gestureScale, 1, 'a size that is not a number is the designed one');
    await frames(page, 4);

    assert.ok(worst <= 60, `draw calls peaked at ${worst}`);
    await settingsTouch(ctx);
    console.log(`  settings: volume, quality, keys and touch layout — in force at once, saved, and back after a reload · a v1 file migrates, a damaged one is repaired · ${worst} draw calls (budget 60)`);
  },
};

/**
 * The touch controls' placement, on a touch screen with real touches: the side, how far in and up, the size and the opacity — in force at once (the
 * buttons and the movement zone are where the layout says), inside the screen and apart from each other, working (a tap on the button where it is now,
 * a drag in the zone where it is now), saved and back after a reload; and the keyboard's keys are not offered there.
 */
async function settingsTouch(ctx: Ctx): Promise<void> {
  await ctx.open('touch=1', { width: 844, height: 390, dpr: 1, touch: true });
  const { page } = ctx;
  const screen = await new TouchScreen(page).init();
  const box = async (id: string): Promise<{ x: number; y: number; w: number; h: number; cx: number; cy: number }> => {
    const b = await q(page, id).boundingBox();
    assert.ok(b, `${id} is on screen`);
    return { x: b.x, y: b.y, w: b.width, h: b.height, cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
  };
  let s = await ctx.state();
  assert.equal(s.device, 'touch');
  const hooks = async (): Promise<{ side: string; zone: { x: number; w: number }; controlScale: number; gestureScale: number }> =>
    ((await page.evaluate('window.__troid.touch()')) as { layout: { side: string; zone: { x: number; w: number }; controlScale: number; gestureScale: number } }).layout;

  // ================================================================================================ as designed: the buttons on the right, the movement zone on the left
  let attack = await box('touch-attack');
  assert.ok(attack.cx > 844 * 0.75, `Attack is on the right (${attack.cx})`);
  let l = await hooks();
  assert.equal(l.side, 'right');
  assert.ok(l.zone.x + l.zone.w < 844 / 2 + 1, 'the zone is on the left');
  const designed = { x: attack.cx, y: attack.cy };

  await openMenu(page);
  assert.equal(await q(page, 'settings-touch').isVisible(), true, 'a touch layer: the touch settings are offered');
  assert.equal(await q(page, 'settings-controls').isVisible(), false, 'and no keyboard keys: nobody here has seen a keyboard');
  assert.equal(await attr(page, 'settings-touch-side-right', 'aria-pressed'), 'true');

  // ================================================================================================ the other hand: the buttons go left, the zone comes right
  await q(page, 'settings-touch-side-left').click();
  await frames(page, 2);
  attack = await box('touch-attack');
  assert.ok(attack.cx < 844 * 0.25, `Attack is on the left (${attack.cx})`);
  l = await hooks();
  assert.equal(l.side, 'left');
  assert.ok(l.zone.x > 844 / 2 - 1 && Math.abs(l.zone.x + l.zone.w - 844) < 1, 'and the zone is on the right, to the edge');
  assert.ok(Math.abs(attack.cy - designed.y) < 1, 'at the same height');
  await ctx.shot('b-01-left');

  // ================================================================================================ in and up, bigger and fainter
  const before = await box('touch-attack');
  await setRange(page, 'settings-touch-offset-x', 1);
  await setRange(page, 'settings-touch-offset-y', 1);
  await frames(page, 2);
  const moved = await box('touch-attack');
  assert.ok(moved.cx > before.cx + 30, `moved in (${before.cx} → ${moved.cx})`);
  assert.ok(moved.cy < before.cy - 20, `and up (${before.cy} → ${moved.cy})`);
  await setRange(page, 'settings-touch-size', 1.2);
  await setRange(page, 'settings-touch-opacity', 0.7);
  await frames(page, 2);
  const big = await box('touch-attack');
  assert.ok(big.w > moved.w * 1.1, `bigger (${moved.w} → ${big.w})`);
  assert.equal(await q(page, 'touch-layer').evaluate((e) => getComputedStyle(e).opacity), '0.7', 'fainter');
  // …and all of it inside the screen and apart
  const a = await box('touch-attack');
  const d = await box('touch-dash');
  for (const [name, b] of [['attack', a], ['dash', d]] as const) {
    assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 844 && b.y + b.h <= 390, `${name} is inside the screen (${JSON.stringify(b)})`);
  }
  assert.ok(Math.hypot(a.cx - d.cx, a.cy - d.cy) > (a.w + d.w) / 2, 'and the two touch areas do not overlap');
  const hud = await q(page, 'hud-block').boundingBox();
  assert.ok(hud, 'the HUD (its block: the card, the life, the magic and the bottles) is on screen');
  assert.ok(a.y >= hud.y + hud.height - 1 || a.x >= hud.x + hud.width, `and the buttons do not reach into the HUD (attack ${JSON.stringify(a)} · dash ${JSON.stringify(d)} · hud ${JSON.stringify(hud)})`);
  await ctx.shot('b-02-left-in-and-up');
  await q(page, 'settings-resume').click();
  await page.waitForSelector('[data-testid="settings-menu"][data-open="0"]', { state: 'attached' });

  // ================================================================================================ they work where they are now
  await ctx.teleport(10, 0);
  await ctx.step(40);
  const at = await box('touch-attack');
  await screen.touch(1, at.cx, at.cy);
  await ctx.step(4);
  s = await ctx.state();
  assert.ok(s.combat?.attack !== null, 'a finger on Attack, on the left now, attacks');
  await screen.lift(1);
  await ctx.step(60);
  const z = await hooks();
  const zx = z.zone.x + z.zone.w / 2;
  await screen.touch(2, zx, 300);
  await screen.drag(2, 70, 0, 4, 8); // a firm drag to the right, in the zone on the right
  await ctx.step(40);
  s = await ctx.state();
  assert.ok(s.vx > 5, `a drag in the zone, now on the right, runs (${s.vx})`);
  await screen.lift(2);
  await ctx.step(40);

  // ================================================================================================ saved, and back after a reload
  const file = await savedWhere(page, (f) => f['touch']?.side === 'left' && f['touch']?.offsetX === 1 && f['touch']?.scale === 1.2, 'the placement was saved');
  assert.deepEqual(file['touch'], { scale: 1.2, opacity: 0.7, side: 'left', offsetX: 1, offsetY: 1 });
  await page.reload();
  await ready(page);
  const again = await box('touch-attack');
  assert.ok(Math.abs(again.cx - big.cx) < 1 && Math.abs(again.cy - big.cy) < 1, `the buttons are where they were left (${big.cx}, ${big.cy}) → (${again.cx}, ${again.cy})`);
  assert.equal(await q(page, 'touch-layer').evaluate((e) => getComputedStyle(e).opacity), '0.7');
  assert.equal((await hooks()).side, 'left');

  // ================================================================================================ the design again, in one click
  await openMenu(page);
  assert.equal(await attr(page, 'settings-touch-side-left', 'aria-pressed'), 'true', 'the menu shows the side that was saved');
  await q(page, 'settings-touch-reset').click();
  await frames(page, 2);
  const back = await box('touch-attack');
  assert.ok(Math.abs(back.cx - designed.x) < 1 && Math.abs(back.cy - designed.y) < 1, `back at the design (${designed.x}, ${designed.y}) → (${back.cx}, ${back.cy})`);
  assert.equal(await q(page, 'touch-layer').evaluate((e) => getComputedStyle(e).opacity), '1');
  await savedWhere(page, (f) => f['touch']?.side === 'right' && f['touch']?.offsetX === 0 && f['touch']?.scale === 1, 'the reset was saved');
}
