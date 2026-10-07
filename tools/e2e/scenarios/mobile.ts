import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import { DEFAULT_TOUCH } from '@/input/gestures/TouchConfig';
import { BOSS_BAR, computeBossBarLayout } from '@/ui/hud/bossBarLayout';
import { computeTouchLayout, type Disc, type Insets, type Placement, type TouchLayout } from '@/ui/touch/layout';
import { reload } from '../bossKit';
import { frames } from '../frames';
import type { Ctx, Scenario } from '../scenario';
import { TouchScreen } from '../touch';

/**
 * THE INTERFACE ON EVERY CLASS OF PHONE AND TABLET (docs/MOBILE-CALIBRATION.md, docs/PROMPT6-LOG.md S31), in the real page: Chromium with `isMobile` and
 * `hasTouch`, a pixel density of 2–3, windows the size of each class of device and the system's margins (a notch, an island, a home indicator) imitated
 * with `?safe=`. Here the numbers the unit tests check on paper (`tests/unit/ui/mobileGeometry.test.ts`) are read off the DOM, as the page laid it out:
 *
 *  - every touch button is at least a finger (44 CSS px), inside the safe area, clear of the others, of the HUD and of the pause button, and the movement zone
 *    is left a usable stretch of screen — nothing out of the window, nothing that scrolls;
 *  - the boss's bar (here from a synthetic `boss:started`: this looks at WHERE the bar is, not at the fight, which is the `boss` scenario's) is inside the safe
 *    area, wide enough to read, never under a button, and exactly where the pure function says;
 *  - what the player saved (the other side, a bigger size, as far in and up as it goes) is what the page lays out from its first frame;
 *  - with REAL multitouch through the DevTools protocol (a finger running, a second one on Attack, then Dash, then the Ability, then the bottle) every
 *    button answers at its real place on the DOM, and nothing is left pressed.
 *
 * What this does NOT say, and docs/MOBILE-CALIBRATION.md says again: nothing about a hand, a thumb or a real screen (the windows are CLASSES of CSS px,
 * not measurements of any device), nothing about the speed of a phone (Chromium draws here in software), nothing about Safari or Chrome for Android.
 */
interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
interface WindowClass {
  name: string;
  width: number;
  height: number;
  dpr: number;
  safe: Insets;
}
const NONE: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
const NOTCH: Insets = { top: 0, right: 47, bottom: 21, left: 47 };
const ISLAND: Insets = { top: 0, right: 59, bottom: 21, left: 59 };
const CLASSES: readonly WindowClass[] = [
  { name: 'small phone', width: 667, height: 375, dpr: 2, safe: NOTCH },
  { name: 'phone', width: 844, height: 390, dpr: 3, safe: NOTCH },
  { name: 'big phone', width: 932, height: 430, dpr: 3, safe: ISLAND },
  { name: 'tall Android', width: 915, height: 412, dpr: 2.625, safe: NONE },
  { name: '21:9 phone', width: 1260, height: 540, dpr: 2, safe: NONE },
  { name: 'small tablet', width: 1133, height: 744, dpr: 2, safe: { top: 24, right: 0, bottom: 20, left: 0 } },
  { name: '4:3 tablet', width: 1024, height: 768, dpr: 2, safe: NONE },
];
const BUTTONS = ['attack', 'dash', 'ability', 'chip'] as const;
type Button = (typeof BUTTONS)[number];
const SETTINGS_KEY = 'troid.settings';
const SLACK = 0.75;

const queryFor = (safe: Insets): string => `touch=1&room=movement_test&unlock=dash&safe=${safe.top},${safe.right},${safe.bottom},${safe.left}`;
const sess = (page: Page, code: string): Promise<unknown> => page.evaluate(`(() => { const s = window.__troid.session; ${code} })()`);
const rectOf = async (page: Page, id: string): Promise<Rect> => {
  const r = (await page.evaluate(
    `(() => { const e = document.querySelector('[data-testid="${id}"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; })()`,
  )) as Rect | null;
  assert.ok(r, `${id} is in the page`);
  return r;
};
const centre = (r: Rect): { x: number; y: number } => ({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 });
const side = (r: Rect): number => r.x1 - r.x0;
const inside = (r: Rect, safe: Rect): boolean => r.x0 >= safe.x0 - SLACK && r.y0 >= safe.y0 - SLACK && r.x1 <= safe.x1 + SLACK && r.y1 <= safe.y1 + SLACK;
const rectsOverlap = (a: Rect, b: Rect): boolean => a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.y0 < b.y1 - 1e-6 && b.y0 < a.y1 - 1e-6;
/** A round touch area (the square of its box, a circle in it) against a rectangle: does the circle reach it? */
function circleHits(d: Rect, r: Rect): boolean {
  const c = centre(d);
  const nx = Math.max(r.x0, Math.min(c.x, r.x1));
  const ny = Math.max(r.y0, Math.min(c.y, r.y1));
  return Math.hypot(c.x - nx, c.y - ny) < side(d) / 2 - 1e-6;
}
const asRect = (d: Disc): Rect => ({ x0: d.cx - d.hit / 2, y0: d.cy - d.hit / 2, x1: d.cx + d.hit / 2, y1: d.cy + d.hit / 2 });

interface Audit {
  layout: TouchLayout;
  buttons: Record<Button, Rect>;
  hud: Rect;
  pause: Rect;
  bar: Rect;
  summary: string;
}

/** The page with the whole interface on it at its widest — a card (the Ability button), a fourth bottle, a hero who is hurt (the chip) — and every claim about where it is. */
async function audit(ctx: Ctx, label: string, c: WindowClass, placement?: { scale: number; placement: Placement }): Promise<Audit> {
  const { page } = ctx;
  const { width, height, safe } = c;
  await sess(page, 's.loadout.acquire("card_spirit_bolt"); s.bottles.addSlot("energy_bottle"); s.player.health.damage(2);');
  await ctx.step(3);
  await page.waitForFunction(
    `['touch-ability', 'touch-chip', 'hud-bottle-3'].every((id) => { const e = document.querySelector('[data-testid="' + id + '"]'); return e && getComputedStyle(e).display !== 'none'; })`,
    undefined,
    { timeout: 20000 },
  );
  await frames(page, 4);
  const hooks = (await page.evaluate('window.__troid.touch()')) as { visible: boolean; layout: TouchLayout };
  assert.equal(hooks.visible, true, `${label}: the touch layer is on`);
  const layout = hooks.layout;
  const window_: Rect = { x0: 0, y0: 0, x1: width, y1: height };
  const safeRect: Rect = { x0: safe.left, y0: safe.top, x1: width - safe.right, y1: height - safe.bottom };

  // the page is the size asked, does not scroll and is not zoomed
  const view = (await page.evaluate(
    '[innerWidth, innerHeight, devicePixelRatio, scrollX, scrollY, document.documentElement.scrollWidth, document.documentElement.scrollHeight, window.visualViewport ? window.visualViewport.scale : 1]',
  )) as number[];
  assert.deepEqual([view[0], view[1]], [width, height], `${label}: the window is the size of its class`);
  assert.equal(view[2], c.dpr, `${label}: the density is the one asked`);
  assert.deepEqual([view[3], view[4]], [0, 0], `${label}: the page is not scrolled`);
  assert.ok(view[5]! <= width && view[6]! <= height, `${label}: and cannot scroll (${view[5]}×${view[6]})`);
  assert.equal(view[7], 1, `${label}: and is not zoomed`);

  // the buttons, as the DOM has them
  const buttons = {} as Record<Button, Rect>;
  for (const b of BUTTONS) {
    const r = await rectOf(page, `touch-${b}`);
    buttons[b] = r;
    assert.ok(side(r) >= 44 - 1e-6, `${label}: ${b} is a finger (${side(r).toFixed(1)} px)`);
    assert.ok(inside(r, safeRect), `${label}: ${b} is inside the safe area (${JSON.stringify(r)})`);
    const d = layout[b];
    assert.ok(Math.hypot(centre(r).x - d.cx, centre(r).y - d.cy) < 1 && Math.abs(side(r) - d.hit) < 1, `${label}: ${b} is where the layout says`);
  }
  for (let i = 0; i < BUTTONS.length; i++) {
    for (let j = i + 1; j < BUTTONS.length; j++) {
      const a = buttons[BUTTONS[i]!];
      const b = buttons[BUTTONS[j]!];
      const ca = centre(a);
      const cb = centre(b);
      assert.ok(Math.hypot(ca.x - cb.x, ca.y - cb.y) >= (side(a) + side(b)) / 2 - 0.5, `${label}: ${BUTTONS[i]} and ${BUTTONS[j]} do not share a pixel`);
    }
  }
  const zone = await rectOf(page, 'touch-zone');
  assert.ok(inside(zone, window_), `${label}: the movement zone is in the window`);
  assert.ok(side(zone) >= (width - safe.left - safe.right) * 0.25 - 1, `${label}: and a usable stretch (${side(zone).toFixed(0)} px)`);
  for (const b of BUTTONS) assert.ok(!circleHits(buttons[b], zone), `${label}: ${b} is not in the movement zone`);

  // the HUD and the pause button
  const hud = await rectOf(page, 'hud-block');
  assert.ok(inside(hud, safeRect), `${label}: the HUD is inside the safe area (${JSON.stringify(hud)})`);
  assert.ok(hud.x0 - safe.left > 0 && hud.y0 - safe.top > 0, `${label}: with a margin`);
  assert.ok(hud.x0 < width * 0.25 && hud.y0 < height * 0.25, `${label}: at the top left`);
  const bottle = await rectOf(page, 'hud-bottle-0');
  assert.ok(bottle.y1 - bottle.y0 >= 44 - 0.5, `${label}: a bottle icon is a finger tall (${(bottle.y1 - bottle.y0).toFixed(1)} px)`);
  const pause = await rectOf(page, 'pause-button');
  assert.ok(inside(pause, safeRect), `${label}: the pause button is inside the safe area (${JSON.stringify(pause)})`);
  assert.ok(side(pause) >= 44 - 0.5, `${label}: and a finger (${side(pause).toFixed(1)} px)`);
  if (width >= height) assert.ok(Math.abs(centre(pause).x - (safe.left + (width - safe.left - safe.right) / 2)) < 1.5, `${label}: at the top centre`);
  else assert.ok(pause.x0 >= hud.x1 - 0.5, `${label}: held upright the window is narrower than the HUD is wide: the pause button is beside the HUD, not over it`);
  assert.ok(!rectsOverlap(pause, hud), `${label}: clear of the HUD`);
  for (const b of BUTTONS) {
    assert.ok(!circleHits(buttons[b], hud), `${label}: ${b} is clear of the HUD`);
    assert.ok(!circleHits(buttons[b], pause), `${label}: ${b} is clear of the pause button`);
  }

  // what is saved is what is laid out
  if (placement) {
    const expected = computeTouchLayout(width, height, safe, placement.scale, DEFAULT_TOUCH, placement.placement);
    for (const b of BUTTONS) {
      assert.ok(Math.hypot(expected[b].cx - layout[b].cx, expected[b].cy - layout[b].cy) < 0.01, `${label}: ${b} is where the saved placement puts it from the first frame`);
    }
  } else {
    const expected = computeTouchLayout(width, height, safe);
    for (const b of BUTTONS) assert.ok(Math.hypot(expected[b].cx - layout[b].cx, expected[b].cy - layout[b].cy) < 0.01, `${label}: ${b} is where the pure function puts it`);
  }

  // the boss's bar, from a boss that wakes (synthetic: where the bar IS is what is looked at here)
  await sess(page, 's.bus.emit("boss:started", { id: "e2e_mobile", defId: "ink_warden", nameKey: "enemy.warden.name", health: 36, maxHealth: 36, x: 0, y: 0 });');
  await page.waitForFunction(
    `(() => { const e = document.querySelector('[data-testid="boss-bar"]'); return !!e && getComputedStyle(e).display === 'block' && Number(getComputedStyle(e).opacity) > 0.99; })()`,
    undefined,
    { timeout: 20000 },
  );
  const bar = await rectOf(page, 'boss-bar');
  assert.ok(inside(bar, safeRect), `${label}: the boss's bar is inside the safe area (${JSON.stringify(bar)})`);
  assert.ok(side(bar) >= BOSS_BAR.minWidth - 0.5, `${label}: wide enough to read (${side(bar).toFixed(0)} px)`);
  for (const b of BUTTONS) assert.ok(!circleHits(buttons[b], bar), `${label}: the bar is not under ${b}`);
  assert.ok(!rectsOverlap(bar, hud) && !rectsOverlap(bar, pause), `${label}: nor on the HUD or the pause button`);
  const want = computeBossBarLayout(width, height, safe, BUTTONS.map((b) => asRect(layout[b])).map((r) => ({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 })));
  assert.ok(
    Math.abs(bar.x0 - want.x) < 1 && Math.abs(bar.y0 - want.y) < 1 && Math.abs(side(bar) - want.width) < 1 && Math.abs(bar.y1 - bar.y0 - want.height) < 1,
    `${label}: the bar is where the pure function puts it (${JSON.stringify(bar)} vs ${JSON.stringify(want)})`,
  );
  const barText = await page.locator('[data-testid="boss-bar-name"]').textContent();
  assert.ok(barText && barText.length > 0, `${label}: with its name`);

  return {
    layout,
    buttons,
    hud,
    pause,
    bar,
    summary: `${width}×${height} @${view[2]}: buttons ×${layout.controlScale.toFixed(2)}, HUD ${side(hud).toFixed(0)}×${(hud.y1 - hud.y0).toFixed(0)}, bar ${side(bar).toFixed(0)} px at x ${bar.x0.toFixed(0)}`,
  };
}

/** Real fingers: one runs, a second one presses each button where the DOM has it, and when they lift nothing is left pressed. */
async function fingers(ctx: Ctx, label: string, a: Audit): Promise<void> {
  const { page } = ctx;
  const screen = await new TouchScreen(page).init();
  const state = (): ReturnType<Ctx['state']> => ctx.state();
  const active = (): Promise<number> => page.evaluate('window.__troid.touch().active') as Promise<number>;
  await ctx.teleport(95, 0);
  await ctx.step(25);
  // the finger that runs: in the middle of the zone, a full run of drag (the radius is in dp: it grows with the window)
  const z = a.layout.zone;
  await screen.touch(1, z.x + z.w * 0.4, (page.viewportSize()?.height ?? 390) * 0.5);
  await screen.drag(1, DEFAULT_TOUCH.rx * a.layout.gestureScale * 1.6, 0, 4, 8);
  await ctx.step(25);
  let s = await state();
  assert.ok(s.vx > 8, `${label}: the first finger runs (${s.vx})`);
  // …and presses each button while it goes on
  const press = async (b: Button, ticks: number): Promise<void> => {
    const c = centre(a.buttons[b]);
    await screen.touch(2, c.x, c.y);
    await ctx.step(ticks);
  };
  await press('attack', 4);
  s = await state();
  assert.equal(s.state, 'attack', `${label}: a second finger on Attack attacks while the first runs`);
  assert.equal(await active(), 2, `${label}: two fingers, two owners`);
  await ctx.step(20);
  await screen.lift(2);
  await ctx.step(30);
  await press('dash', 4);
  s = await state();
  assert.equal(s.state, 'dash', `${label}: Dash dashes`);
  await screen.lift(2);
  await ctx.step(40);
  await ctx.teleport(95, 0);
  await ctx.step(10);
  await press('ability', 3);
  s = await state();
  assert.equal(s.state, 'cast', `${label}: the Ability casts the Spirit Bolt`);
  await screen.lift(2);
  await ctx.step(40);
  const before = ((await state()).bottles ?? []).filter((b) => b === 'ready').length;
  await press('chip', 1);
  s = await state();
  assert.equal(s.state, 'drink', `${label}: the chip drinks a bottle`);
  await screen.lift(2);
  await ctx.step(26); // the channel is 24 ticks long: the bottle is spent on the last one
  const after = ((await state()).bottles ?? []).filter((b) => b === 'ready').length;
  assert.equal(after, before - 1, `${label}: and one bottle is spent (${before} → ${after})`);
  // lifting every finger leaves nothing pressed and the hero stops
  await screen.lift(1);
  await ctx.step(60);
  s = await state();
  assert.equal(await active(), 0, `${label}: no finger is left owning anything`);
  assert.ok(Math.abs(s.vx) < 0.2, `${label}: and the hero stops (${s.vx})`);
  const stuck = await page.$$eval('[data-testid^="touch-"] > div', (els) => els.filter((e) => (e as HTMLElement).dataset['pressed'] === '1').length);
  assert.equal(stuck, 0, `${label}: no button is drawn pressed`);
  const after2 = (await page.evaluate('[scrollX, scrollY, window.visualViewport ? window.visualViewport.scale : 1]')) as number[];
  assert.deepEqual(after2, [0, 0, 1], `${label}: the fingers neither scrolled nor zoomed the page`);
}

async function load(ctx: Ctx, c: WindowClass, saved?: unknown): Promise<void> {
  await ctx.open(queryFor(c.safe), { width: c.width, height: c.height, dpr: c.dpr, touch: true });
  if (saved !== undefined) {
    await ctx.page.evaluate(`localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, ${JSON.stringify(JSON.stringify(saved))})`);
    await reload(ctx.page);
    await ctx.page.evaluate('window.__troid.pause()');
    await ctx.step(5);
  } else {
    await ctx.step(5);
  }
}

export const mobile: Scenario = {
  name: 'mobile',
  async run(ctx) {
    // ================================================================================================ every class of window, as it comes
    for (const c of CLASSES) {
      await load(ctx, c);
      const a = await audit(ctx, c.name, c);
      await fingers(ctx, c.name, a);
      await ctx.shot(c.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
      console.log(`  ${c.name.padEnd(13)} ${a.summary}`);
    }

    // ================================================================================================ what the player saved, from the first frame
    const phone = CLASSES[1]!;
    const left: Placement = { side: 'left', offsetX: 1, offsetY: 1 };
    await load(ctx, phone, { version: 2, touch: { scale: 1.4, opacity: 1, ...left } });
    let a = await audit(ctx, 'phone · left, in and up, ×1.4', phone, { scale: 1.4, placement: left });
    assert.equal(a.layout.side, 'left');
    assert.ok(a.layout.attack.cx < phone.width / 2, 'the buttons are on the left now');
    // the window cannot hold that size, so far in and so far up, next to the HUD: the size gives way to what fits, and a finger is still a finger
    assert.ok(a.layout.controlScale < 1.4 * a.layout.gestureScale - 1e-6, `the size asked (×1.4) did not fit this window: the buttons are ×${a.layout.controlScale.toFixed(2)}`);
    assert.ok(a.layout.controlScale >= 0.72 - 1e-6, 'but never smaller than the floor');
    await fingers(ctx, 'phone · left', a);
    await ctx.shot('phone-left-in-up');
    console.log(`  phone, left     ${a.summary}`);

    const small = CLASSES[0]!;
    const right: Placement = { side: 'right', offsetX: 1, offsetY: 1 };
    await load(ctx, small, { version: 2, touch: { scale: 1.4, opacity: 1, ...right } });
    a = await audit(ctx, 'small phone · right, in and up, ×1.4', small, { scale: 1.4, placement: right });
    await ctx.shot('small-phone-right-in-up');
    console.log(`  small, right    ${a.summary}`);

    // ================================================================================================ a window held upright: nothing falls out (the game is meant to be played sideways)
    const portrait: WindowClass = { name: 'phone, portrait', width: 390, height: 844, dpr: 3, safe: { top: 47, right: 0, bottom: 34, left: 0 } };
    await load(ctx, portrait);
    a = await audit(ctx, portrait.name, portrait);
    const s = await ctx.state();
    assert.equal(s.view?.rotateDevice, true, 'the window is flagged as one to rotate');
    await ctx.shot('phone-portrait');
    console.log(`  portrait        ${a.summary}`);
  },
};
