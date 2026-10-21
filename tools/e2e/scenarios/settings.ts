import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import { frames } from '../frames';
import type { Ctx, GameState, Scenario } from '../scenario';
import { TouchScreen } from '../touch';

/**
 * THE SETTINGS in a real browser (docs/PROMPT6-LOG.md S30, docs/PROMPT14-LOG.md): the volume (prepared: there is no sound yet), the quality profile (Auto / Low / High — which
 * measures nothing), the keys of the main actions and the side and position of the touch controls. Each one is changed through the pause menu the way a person
 * does — the pause button, the entry of the list, a slider, a click, a real key — and then three things are looked at: it is IN FORCE at once (the game answers to it), it is
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

/** What a device's list of controls says an action is on: the inputs of its row, as the screen shows them. */
const reference = (page: Page, device: 'keyboard' | 'gamepad', action: string): Promise<string[]> =>
  q(page, `settings-reference-${device}`)
    .locator('.settings-reference-rows')
    .evaluate((grid, name) => {
      const names = [...grid.querySelectorAll('.settings-keyname')];
      const at = names.findIndex((n) => n.textContent === name);
      return at < 0 ? [] : [...(names[at]?.nextElementSibling?.querySelectorAll('kbd') ?? [])].map((k) => k.textContent ?? '');
    }, action);

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
/** The screens of the pause menu that hold settings, and what their way back is called. */
type MenuScreen = 'settings' | 'controls';
const BACK: Record<MenuScreen, string> = { settings: 'settings-back', controls: 'controls-back' };
/** The pause button, as a person presses it: the menu opens on its list. */
async function openMenu(page: Page): Promise<void> {
  await q(page, 'pause-button').click();
  await page.waitForSelector('[data-testid="pause-menu"][data-open="1"]', { timeout: 15000 });
}
/** An entry of the list, as a person presses it: its screen opens. */
async function enterScreen(page: Page, which: MenuScreen): Promise<void> {
  await q(page, `pause-${which}`).click();
  await page.waitForSelector(`[data-testid="${which}-screen"][data-open="1"]`, { timeout: 15000 });
}
/** The pause button and one of its screens. */
async function openScreen(page: Page, which: MenuScreen): Promise<void> {
  await openMenu(page);
  await enterScreen(page, which);
}
/** From one screen to the list and into another. */
async function changeScreen(page: Page, from: MenuScreen, to: MenuScreen): Promise<void> {
  await q(page, BACK[from]).click();
  await enterScreen(page, to);
}
/** Out of the menu: back from the screen it is on (if any), and Continue. */
async function closeMenu(ctx: Ctx, from?: MenuScreen): Promise<void> {
  if (from) await q(ctx.page, BACK[from]).click();
  await q(ctx.page, 'pause-resume').click();
  await ctx.page.waitForSelector('[data-testid="pause-menu"][data-open="0"]', { state: 'attached' });
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

    // ================================================================================================ the menu: its list, and the settings screen
    await openMenu(page);
    s = await state();
    assert.equal(s.menuOpen, true, 'the pause button opens it and pauses the game');
    for (const id of ['pause-resume', 'pause-settings', 'pause-controls', 'pause-saves', 'pause-profile']) assert.equal(await q(page, id).isVisible(), true, `${id} is on the list`);
    await ctx.shot('a-01-the-menu');
    await enterScreen(page, 'settings');
    for (const id of ['settings-volume-section', 'settings-quality', 'settings-accessibility']) assert.equal(await q(page, id).isVisible(), true, `${id} is there`);
    assert.equal(await q(page, 'settings-controls').count(), 0, 'the keys are on the controls screen, not on this one');
    assert.equal(await text(page, 'settings-volume-note'), 'Sound arrives in a later version. Your choice is saved.', 'it says there is no sound yet');
    assert.match(await text(page, 'settings-quality-note'), /does not measure your device yet/, 'and that Auto measures nothing');
    assert.equal(await attr(page, 'settings-quality-auto', 'aria-pressed'), 'true');

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
    await changeScreen(page, 'settings', 'controls');
    assert.equal(await q(page, 'settings-touch').isVisible(), false, 'no touch layer on a desktop: no touch settings');
    const rows = await page.locator('[data-testid="settings-controls"] button[data-action]').evaluateAll((els) => els.map((e) => [(e as HTMLElement).dataset['action'], e.textContent]));
    assert.deepEqual(rows, [['jump', 'Space'], ['attack', 'J'], ['dash', 'Shift'], ['ability', 'K'], ['bottle', 'L'], ['interact', 'E'], ['down', 'S']], 'a row per action, with its key');
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
    await press('Escape'); // cancels the wait — it is NOT the pause: the menu stays open, on the same screen
    assert.equal(await attr(page, 'settings-key-dash', 'data-listening'), '0');
    assert.equal(await attr(page, 'controls-screen', 'data-open'), '1', 'Escape while waiting for a key cancels it and leaves the screen open');
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
    // the list of controls above them says what each one is NOW: the same keys, and what has no key of its own
    assert.deepEqual(await reference(page, 'keyboard', 'Jump'), ['H'], 'the list follows the remap: jump is H');
    assert.deepEqual(await reference(page, 'keyboard', 'Attack'), ['Space', 'Left click'], 'attack is Space, and the mouse still attacks');
    assert.deepEqual(await reference(page, 'keyboard', 'Drop through a platform'), ['S', '+', 'H'], 'dropping through a platform is crouch + the jump key: it follows too');
    assert.deepEqual(await reference(page, 'keyboard', 'Pause'), ['Escape', 'P']);
    assert.deepEqual(await reference(page, 'gamepad', 'Attack'), ['X'], 'the pad has its own buttons, which are not the keyboard\'s');
    assert.equal(await text(page, 'controls.padNote-text'), 'The buttons of the gamepad cannot be remapped.', 'and the screen does not pretend they can be changed');
    assert.equal(await q(page, 'settings-reference-touch').locator('.settings-touchline').count(), 0, 'a desktop with no touch layer lists no touch controls');
    await ctx.shot('a-03-keys');
    await closeMenu(ctx, 'controls');

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
    await openScreen(page, 'settings');
    assert.equal((await q(page, 'settings-volume').inputValue()), '0.35', 'the menu shows what was saved');
    assert.equal(await attr(page, 'settings-quality-low', 'aria-pressed'), 'true');
    await changeScreen(page, 'settings', 'controls');
    assert.deepEqual([await text(page, 'settings-key-jump'), await text(page, 'settings-key-attack')], ['H', 'Space']);

    // ================================================================================================ the keys back to the designed ones
    await q(page, 'settings-keys-reset').click();
    assert.deepEqual((await state()).keys, { jump: 'Space', attack: 'KeyJ', dash: 'ShiftLeft', ability: 'KeyK', bottle: 'KeyL', interact: 'KeyE', down: 'KeyS' });
    await savedWhere(page, (f) => Object.keys(f['keys']).length === 0, 'the defaults are the empty map');
    await changeScreen(page, 'controls', 'settings');
    await q(page, 'settings-quality-auto').click();
    await closeMenu(ctx, 'settings');
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
    assert.equal(await text(page, 'pause-title'), 'Pausa', 'the menu speaks the language that was saved, words included');
    await enterScreen(page, 'settings');
    assert.equal(await text(page, 'settings-volume-section').then((t) => t.includes('Volumen')), true);
    await setRange(page, 'settings-volume', 0.5);
    const upgraded = await savedWhere(page, (f) => f['version'] === 4, 'the file is version 4 from the first change (1 → 2 → 3 → 4)');
    assert.equal(upgraded['slot'], 1, 'the game it was playing is the first, where every save made so far lives');
    assert.deepEqual(upgraded['accessibility'], { reduceFlashes: false, reduceShake: false, hudScale: 1 }, 'and no accessibility choice is on');
    assert.deepEqual(upgraded['volume'], { master: 0.5 });
    assert.equal(upgraded['language'], 'es');
    assert.deepEqual([upgraded['touch'].scale, upgraded['touch'].opacity], [1.2, 0.8], 'and what version 1 held is still in it');
    assert.deepEqual(upgraded['touch'].buttons, {}, 'and no button was placed: each is where the design has it');
    await closeMenu(ctx, 'settings');

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
 * The touch controls in the settings, on a touch screen with real touches (docs/PROMPT15-LOG.md): the section of the controls screen — a small picture of where the three buttons are (the artist's
 * PNGs), the size and the opacity, the way into the editor and the way back to the design — each in force at once, saved, and back after a reload; the editor reached from it (its own scenario, `touchEditor`,
 * looks at it closely); and the keyboard's keys are not offered there.
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

  await openScreen(page, 'controls');
  assert.equal(await q(page, 'settings-touch').isVisible(), true, 'a touch layer: the touch settings are offered');
  assert.equal(await q(page, 'settings-controls').isVisible(), false, 'and no keyboard keys: nobody here has seen a keyboard');
  const order = await q(page, 'settings-controls-body').evaluate((e) => [...e.children].map((c) => (c as HTMLElement).dataset['testid']));
  assert.equal(order[0], 'settings-reference-touch', 'on a touch screen the touch controls come first');
  assert.deepEqual(
    await q(page, 'settings-reference-touch').locator('.settings-touchline > b').allTextContents(),
    ['Move', 'Jump', 'Crouch', 'Drop through a platform', 'Attack, dash and ability', 'Drink a bottle', 'Interact', 'Pause'],
    'the touch controls, each a gesture or a button that exists',
  );
  assert.equal(await q(page, 'settings-reference-keyboard').locator('.settings-reference-rows').count(), 0, 'and no keyboard list: nobody here has seen a keyboard');
  // no side and no offsets any more: the editor replaces them
  for (const gone of ['settings-touch-side-right', 'settings-touch-side-left', 'settings-touch-offset-x', 'settings-touch-offset-y']) assert.equal(await q(page, gone).count(), 0, `${gone} is gone`);

  // ================================================================================================ the small picture of the screen: the three PNGs, where the layout has them
  await q(page, 'settings-touch').scrollIntoViewIfNeeded();
  const preview = await box('settings-touch-preview');
  assert.ok(preview.w > 100 && preview.h > 40, `the picture has a size (${preview.w}×${preview.h})`);
  const previewLayout = async (): Promise<Record<string, { x: number; y: number; h: number }>> => {
    const out: Record<string, { x: number; y: number; h: number }> = {};
    for (const id of ['attack', 'dash', 'ability']) {
      const b = await box(`settings-touch-preview-${id}`);
      out[id] = { x: (b.cx - preview.x) / preview.w, y: (b.cy - preview.y) / preview.h, h: b.h / preview.h };
    }
    return out;
  };
  const picture = await previewLayout();
  const real = (await page.evaluate('window.__troid.touch().layout')) as { attack: { cx: number; cy: number; visual: number }; dash: { cx: number; cy: number }; ability: { cx: number; cy: number } };
  for (const id of ['attack', 'dash', 'ability'] as const) {
    assert.ok(Math.abs(picture[id]!.x - real[id].cx / 844) < 0.01 && Math.abs(picture[id]!.y - real[id].cy / 390) < 0.01, `${id} is in the picture where it is on the screen (${JSON.stringify(picture[id])})`);
  }
  assert.ok(Math.abs(picture['attack']!.h - real.attack.visual / 390) < 0.01, 'at the same proportion');
  const sources = await q(page, 'settings-touch-preview').locator('img').evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).currentSrc));
  const gameSources = await page.locator('[data-testid^="touch-"] img').evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).currentSrc));
  assert.deepEqual([...new Set(sources)].sort(), [...new Set(gameSources)].sort(), 'the picture shows the very files the game\'s buttons show');
  await ctx.shot('b-00-touch-controls');

  // ================================================================================================ bigger and fainter: in force at once
  const before = await box('touch-attack');
  await setRange(page, 'settings-touch-size', 1.2);
  await setRange(page, 'settings-touch-opacity', 0.7);
  await frames(page, 2);
  const big = await box('touch-attack');
  assert.ok(big.w > before.w * 1.1, `bigger (${before.w} → ${big.w})`);
  assert.equal(await q(page, 'touch-layer').evaluate((e) => getComputedStyle(e).opacity), '0.7', 'fainter');
  const bigPicture = await previewLayout();
  assert.ok(bigPicture['attack']!.h > picture['attack']!.h * 1.1, `the small picture grows with the size slider (${picture['attack']!.h.toFixed(3)} → ${bigPicture['attack']!.h.toFixed(3)})`);
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

  // ================================================================================================ the way into the editor: a real finger on "Edit layout", a button dragged, Save
  await q(page, 'settings-touch-edit').scrollIntoViewIfNeeded();
  await q(page, 'settings-touch-edit').tap();
  await page.waitForSelector('[data-testid="touch-editor"][data-open="1"]', { timeout: 15000 });
  assert.equal(await q(page, 'pause-menu').evaluate((e) => getComputedStyle(e).display), 'none', 'the menu steps aside');
  assert.equal(await q(page, 'touch-layer').evaluate((e) => getComputedStyle(e).visibility), 'hidden', 'and so does the touch layer of the game');
  const editorAttack = await box('touch-editor-attack');
  await screen.touch(1, editorAttack.cx, editorAttack.cy);
  await screen.drag(1, -420, -90, 8, 16);
  await screen.lift(1);
  await frames(page, 2);
  const moved = await box('touch-editor-attack');
  assert.ok(moved.cx < editorAttack.cx - 300, `the finger took Attack across the screen (${editorAttack.cx} → ${moved.cx})`);
  assert.equal(await page.evaluate('window.__troid.touch().active'), 0, 'and no finger owns a button of the game');
  await q(page, 'touch-editor-save').tap();
  await page.waitForSelector('[data-testid="touch-editor"][data-open="0"]', { state: 'attached', timeout: 15000 });
  assert.equal(await q(page, 'pause-menu').getAttribute('data-aside'), '0', 'the menu is back');
  const file = await savedWhere(page, (f) => f['version'] === 4 && f['touch']?.buttons?.attack !== undefined && f['touch']?.scale === 1.2, 'the place was saved');
  assert.deepEqual(Object.keys(file['touch'].buttons), ['attack'], 'only the button that was moved');
  assert.equal(file['touch'].opacity, 0.7);
  assert.ok(Math.abs(file['touch'].buttons.attack.x * 844 - moved.cx) < 1.5, `at the place it was left (${file['touch'].buttons.attack.x * 844} ≈ ${moved.cx})`);
  const afterSave = await previewLayout();
  assert.ok(afterSave['attack']!.x < 0.5, `the small picture shows it (${afterSave['attack']!.x.toFixed(2)})`);
  await ctx.shot('b-01-edited');
  await closeMenu(ctx, 'controls');
  const placed = await box('touch-attack');
  assert.ok(Math.abs(placed.cx - moved.cx) < 1.5 && Math.abs(placed.cy - moved.cy) < 1.5, `the real button is where the editor left it (${moved.cx}, ${moved.cy}) → (${placed.cx}, ${placed.cy})`);

  // ================================================================================================ it works where it is now
  await ctx.teleport(10, 0);
  await ctx.step(40);
  await screen.touch(1, placed.cx, placed.cy);
  await ctx.step(4);
  s = await ctx.state();
  assert.ok(s.combat?.attack !== null, 'a finger on Attack, where it is now, attacks');
  await screen.lift(1);
  await ctx.step(60);

  // ================================================================================================ saved, and back after a reload
  await page.reload();
  await ready(page);
  const again = await box('touch-attack');
  assert.ok(Math.abs(again.cx - placed.cx) < 1 && Math.abs(again.cy - placed.cy) < 1, `the buttons are where they were left (${placed.cx}, ${placed.cy}) → (${again.cx}, ${again.cy})`);
  assert.equal(await q(page, 'touch-layer').evaluate((e) => getComputedStyle(e).opacity), '0.7');

  // ================================================================================================ the design again, in one click
  await openScreen(page, 'controls');
  await q(page, 'settings-touch-reset').scrollIntoViewIfNeeded();
  await q(page, 'settings-touch-reset').click();
  await frames(page, 2);
  const back = await box('touch-attack');
  assert.ok(Math.abs(back.cx - designed.x) < 1 && Math.abs(back.cy - designed.y) < 1, `back at the design (${designed.x}, ${designed.y}) → (${back.cx}, ${back.cy})`);
  assert.equal(await q(page, 'touch-layer').evaluate((e) => getComputedStyle(e).opacity), '1');
  await savedWhere(page, (f) => Object.keys(f['touch']?.buttons ?? { x: 1 }).length === 0 && f['touch']?.scale === 1, 'the reset was saved: no button placed, the designed size');
}
