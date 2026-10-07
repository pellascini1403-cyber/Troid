import assert from 'node:assert/strict';
import { frames } from '../frames';
import type { Scenario } from '../scenario';
import { centreOf, TouchScreen } from '../touch';

/**
 * The touch controls with REAL touches (docs/PROMPT5-LOG.md S13, GAME-SPEC-2D §4.3): the invisible movement zone and three
 * fixed buttons — no joystick, no jump button — driven through the DevTools touch protocol, several fingers at once.
 *
 *  - what is on screen (and what is NOT), where, and that nothing overlaps;
 *  - run (drag), walk (gentle drag), dead zone, jump (flick up, held and tapped), crouch (drag down), drop (flick down);
 *  - multitouch: move + attack, move + dash, attack + dash, a second finger in the zone, fingers that never change owner;
 *  - nothing stays pressed: a cancelled touch, a rotation, a hidden layer;
 *  - the layer is for touch screens (hidden on a desktop) and honours the safe area (a notch pushes the buttons in).
 */
export const touch: Scenario = {
  name: 'touch',
  async run(ctx) {
    await ctx.open('room=movement_test&unlock=dash&touch=1', { width: 844, height: 390, touch: true });
    const { page } = ctx;
    const screen = await new TouchScreen(page).init();
    await ctx.step(30);

    // ================================================================== what is there, and what is not
    const hooks = (await page.evaluate('window.__troid.touch()')) as { visible: boolean; active: number; layout: { zone: { x: number; w: number; h: number }; attack: { cx: number; cy: number; hit: number; visual: number } } };
    assert.equal(hooks.visible, true, 'the touch layer is on');
    const ids = await page.$$eval('[data-testid^="touch-"]', (els) => els.map((e) => ({ id: e.getAttribute('data-testid'), shown: (e as HTMLElement).offsetParent !== null || getComputedStyle(e).position === 'fixed' })));
    const shown = ids.filter((e) => e.shown).map((e) => e.id).sort();
    assert.deepEqual(shown, ['touch-attack', 'touch-dash', 'touch-layer', 'touch-zone'], 'only the zone, Attack and Dash are on screen (no card yet: no Ability; no bottle to drink: no chip)');
    assert.equal(await page.locator('[data-testid*="joystick"], [data-testid*="jump"]').count(), 0, 'no joystick, no jump button');
    const zone = await page.locator('[data-testid="touch-zone"]').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, border: cs.borderTopWidth, children: el.children.length, text: el.textContent };
    });
    assert.ok(zone.bg === 'rgba(0, 0, 0, 0)' || zone.bg === 'transparent', `the zone is invisible (${zone.bg})`);
    assert.equal(zone.children, 0);
    assert.equal(zone.border, '0px');

    const attack = await centreOf(page, 'touch-attack');
    const dash = await centreOf(page, 'touch-dash');
    assert.ok(Math.hypot(attack.x - hooks.layout.attack.cx, attack.y - hooks.layout.attack.cy) < 1, 'Attack is where the layout says');
    assert.ok(attack.x > 844 - 160 && attack.y > 390 - 160, `Attack sits in the bottom-right corner (${attack.x}, ${attack.y})`);
    assert.ok(Math.hypot(attack.x - dash.x, attack.y - dash.y) > (attack.w + dash.w) / 2, 'the touch areas of Attack and Dash do not overlap');
    await ctx.shot('01-controls');

    // ================================================================== running, walking, the dead zone
    const ZX = 100;
    const ZY = 300;
    // the playground's stretch from x = 88.5 to 121 is clear floor: 30 m to run in each direction without meeting anything
    await ctx.teleport(95, 0);
    await ctx.step(20);
    await screen.touch(1, ZX, ZY); // the origin is wherever the finger lands
    await screen.drag(1, 6, 0, 2); // inside the dead zone (12 % of 56 dp)
    await ctx.step(20);
    let s = await ctx.state();
    assert.ok(Math.abs(s.vx) < 0.05, `the dead zone holds the hero still (vx ${s.vx})`);
    assert.equal(s.device, 'touch', 'the last device is touch');
    await screen.drag(1, 14, 0, 2); // 20 dp: a gentle tilt walks
    await ctx.step(40);
    s = await ctx.state();
    assert.ok(s.vx > 1 && s.vx < 4.2, `a gentle drag walks (${s.vx})`);
    assert.equal(s.anim, 'walk');
    await screen.drag(1, 60, 0, 4, 8); // well past the radius: a full run, the origin follows the finger
    await ctx.step(40);
    s = await ctx.state();
    assert.ok(s.vx > 8, `a firm drag runs (${s.vx})`);
    await ctx.shot('02-run');
    const t = (await page.evaluate('window.__troid.touch()')) as { active: number; gesture: { originX: number } };
    assert.equal(t.active, 1);
    assert.ok(t.gesture.originX > ZX + 10, `the floating origin followed the finger (${t.gesture.originX})`);
    // reversing takes 2 × Rx (112 dp) from the full-run position, however far the finger had travelled to the right (it travelled 80)
    await screen.drag(1, -120, 0, 6, 8);
    await ctx.step(50);
    s = await ctx.state();
    assert.ok(s.vx < -5, `reversed direction (${s.vx})`);
    await screen.lift(1);
    await ctx.step(40);
    s = await ctx.state();
    assert.ok(Math.abs(s.vx) < 0.1, 'lifting the finger stops the hero');

    // ================================================================== jump: flick up, held and tapped
    await ctx.teleport(20, 0);
    await ctx.step(20);
    await screen.touch(1, ZX, ZY);
    await screen.drag(1, 0, -45, 3); // a flick up past 0.55 × Ry
    let top = 0;
    for (let i = 0; i < 40; i++) {
      await ctx.step(2);
      top = Math.max(top, (await ctx.state()).y);
    }
    assert.ok(top > 2.9, `holding the thumb up gives the full jump (${top.toFixed(2)} m)`);
    await screen.lift(1);
    await ctx.step(60);

    await screen.touch(1, ZX, ZY);
    await screen.drag(1, 0, -45, 3);
    await screen.lift(1); // a flick released at once
    let hop = 0;
    for (let i = 0; i < 30; i++) {
      await ctx.step(2);
      hop = Math.max(hop, (await ctx.state()).y);
    }
    assert.ok(hop > 0.3 && hop < 2.4, `a flick that is let go is a short hop (${hop.toFixed(2)} m)`);
    await ctx.step(40);
    await ctx.shot('03-after-jumps');

    // ================================================================== crouch: drag down (and the hysteresis on the way up)
    await screen.touch(1, ZX, 250);
    await screen.drag(1, 0, 34, 6, 30); // slow: a crouch, never a drop
    await ctx.step(8);
    s = await ctx.state();
    assert.equal(s.crouched, true, 'dragging down crouches');
    assert.equal(s.bodyHeight, 1.0);
    await ctx.shot('04-crouch');
    await screen.drag(1, 0, -20, 4, 20); // 14 dp below the origin: ay -0.32, past the -0.4 of the hysteresis
    await ctx.step(8);
    s = await ctx.state();
    assert.equal(s.crouched, false, 'bringing the finger back up stands again');
    await screen.lift(1);
    await ctx.step(20);

    // ================================================================== drop: a flick down on a one-way platform
    await ctx.teleport(64, 2.7);
    await ctx.step(15);
    s = await ctx.state();
    assert.ok(Math.abs(s.y - 2.7) < 0.05 && s.grounded, `standing on the one-way platform (${s.y})`);
    await screen.touch(1, ZX, 240);
    await screen.drag(1, 0, 40, 3); // 40 dp in a few milliseconds
    await ctx.step(4);
    s = await ctx.state();
    assert.equal(s.grounded, false, 'a flick down drops through the platform');
    await ctx.step(60);
    s = await ctx.state();
    assert.ok(s.y < 0.5, `fell to the floor (${s.y})`);
    await screen.lift(1);
    // the same flick on solid ground is only a crouch
    await ctx.step(10);
    const y0 = (await ctx.state()).y;
    await screen.touch(1, ZX, 240);
    await screen.drag(1, 0, 40, 3);
    await ctx.step(20);
    s = await ctx.state();
    assert.equal(s.y, y0, 'on solid ground the flick does not move the hero off the floor');
    await screen.lift(1);
    await ctx.step(20);

    // ================================================================== multitouch
    // (every sub-test starts at the left end of the clear stretch of floor)
    await ctx.teleport(90, 0);
    await ctx.step(20);
    await screen.touch(1, ZX, ZY);
    await screen.drag(1, 70, 0, 4);
    await ctx.step(15);
    const x0 = (await ctx.state()).x;
    // move + attack: the attack starts and the run does not stop
    await screen.touch(2, attack.x, attack.y);
    await ctx.step(4);
    s = await ctx.state();
    assert.equal(s.state, 'attack', 'a second finger on Attack attacks while the first runs');
    assert.equal(await page.evaluate('window.__troid.touch().active'), 2, 'two fingers, two owners');
    await ctx.step(20);
    await screen.lift(2);
    await ctx.step(30);
    s = await ctx.state();
    assert.ok(s.x > x0 + 2, `the run went on through the attack (${x0.toFixed(1)} → ${s.x.toFixed(1)}; an attack only lets the stick steer a little)`);
    assert.ok(s.vx > 8, `and the hero is running again (${s.vx})`);
    assert.equal(await page.evaluate('window.__troid.touch().active'), 1, 'the movement finger never let go');
    await ctx.shot('05-move-and-attack');
    // move + dash
    await screen.touch(2, dash.x, dash.y);
    await ctx.step(4);
    s = await ctx.state();
    assert.equal(s.state, 'dash', 'a second finger on Dash dashes while the first runs');
    await screen.lift(2);
    await ctx.step(20);
    s = await ctx.state();
    assert.ok(s.vx > 8, `back to running (${s.vx})`);
    // a finger in the zone while another is already moving: ignored
    await screen.touch(2, 40, 200);
    await screen.drag(2, -30, 0, 3);
    assert.equal(await page.evaluate('window.__troid.touch().active'), 1, 'a second finger in the zone is ignored');
    await screen.lift(2);
    // a finger never changes owner: the movement finger slides over Attack and nothing is pressed
    await screen.slide(1, attack.x, attack.y);
    await ctx.step(6);
    s = await ctx.state();
    assert.notEqual(s.state, 'attack', 'the movement finger over the Attack button does not attack');
    await screen.lift(1);
    await ctx.step(40);
    // attack + dash with two fingers, no movement finger
    await ctx.teleport(90, 0);
    await ctx.step(20);
    await screen.touch(1, attack.x, attack.y);
    await screen.touch(2, dash.x, dash.y);
    await ctx.step(4);
    s = await ctx.state();
    assert.ok(s.state === 'dash' || s.state === 'attack', `attack + dash together are both heard (${s.state})`);
    assert.equal(await page.evaluate('window.__troid.touch().active'), 2);
    await screen.lift(1);
    await screen.lift(2);
    await ctx.step(40);

    // ================================================================== nothing stays pressed
    await ctx.teleport(90, 0);
    await ctx.step(20);
    await screen.touch(1, ZX, ZY);
    await screen.drag(1, 70, 0, 4, 8);
    await ctx.step(20);
    assert.ok((await ctx.state()).vx > 8);
    await screen.cancelAll(); // the system takes the touches
    await frames(page, 3); // …and the page has them (the cancel is delivered on the page's own frames: stepping before it arrives would run the old finger)
    await ctx.step(40);
    s = await ctx.state();
    assert.ok(Math.abs(s.vx) < 0.1, `a cancelled touch stops the hero (${s.vx})`);
    assert.equal(await page.evaluate('window.__troid.touch().active'), 0);

    // a rotation (the window changes size) lets go of the fingers and lays the controls out again
    await screen.touch(1, ZX, ZY);
    await screen.drag(1, 70, 0, 4, 8);
    await ctx.step(10);
    await page.setViewportSize({ width: 932, height: 430 });
    await page.waitForTimeout(150);
    await ctx.step(40);
    s = await ctx.state();
    assert.equal(await page.evaluate('window.__troid.touch().active'), 0, 'a resize releases every finger');
    assert.ok(Math.abs(s.vx) < 0.1, 'and the hero is still');
    const attack2 = await centreOf(page, 'touch-attack');
    assert.ok(attack2.x > attack.x + 40, `the controls followed the bigger window (${attack.x} → ${attack2.x})`);
    await screen.lift(1);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(150);

    // ================================================================== a desktop never sees the layer
    await ctx.open('room=movement_test&unlock=dash', { width: 844, height: 390 });
    assert.equal(await ctx.page.locator('[data-testid="touch-layer"]').isVisible(), false, 'no touch layer without a touch screen');
    await ctx.page.keyboard.down('KeyD');
    await ctx.step(30);
    assert.ok((await ctx.state()).vx > 8, 'the keyboard still plays');
    await ctx.page.keyboard.up('KeyD');

    // ================================================================== the safe area: a notch pushes the controls in
    await ctx.open('room=movement_test&unlock=dash&touch=1', { width: 844, height: 390, touch: true });
    const plain = await centreOf(ctx.page, 'touch-attack');
    await ctx.open('room=movement_test&unlock=dash&touch=1&safe=0,47,21,47', { width: 844, height: 390, touch: true });
    const notch = await centreOf(ctx.page, 'touch-attack');
    assert.ok(Math.abs(plain.x - notch.x - 47) < 1.5, `47 px of notch on the right moves Attack in by 47 px (${plain.x} → ${notch.x})`);
    assert.ok(Math.abs(plain.y - notch.y - 21) < 1.5, `21 px of home indicator moves it up by 21 px (${plain.y} → ${notch.y})`);
    await ctx.shot('06-notch');
  },
};
