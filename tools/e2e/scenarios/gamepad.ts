import assert from 'node:assert/strict';
import type { Scenario } from '../scenario';
import { frames } from '../frames';

/**
 * The gamepad in the browser through the ABSTRACT pad of the test hook (`__troid.pad`, no physical device): the stick with
 * its radial dead zone, the buttons mapped to logical actions, the D-pad, dropping through a one-way platform with down + A,
 * unplugging mid-run, and the keyboard still playing afterwards; and, on top of that, the player systems of Prompt 5 through the same pad:
 * LT interacts (and the icon says "LT"), Y casts the Spirit Bolt, LB drinks a bottle, Start opens and closes the pause menu. Same
 * simulation, same rules, a different device.
 */
export const gamepad: Scenario = {
  name: 'gamepad',
  async run(ctx) {
    await ctx.open('room=movement_test&unlock=dash');
    const { page } = ctx;
    /** The pad's own terms: the stick's +y is DOWN; `pressed` are standard-mapping button indices (A 0, B 1, X 2, Y 3, D-pad down 13…). */
    const pad = (x: number, y: number, pressed: number[] = []): Promise<unknown> => ctx.page.evaluate(`window.__troid.pad.set(${x}, ${y}, ${JSON.stringify(pressed)})`);

    await ctx.teleport(95, 0); // the clear stretch of floor of the playground
    await ctx.step(30);
    let s = await ctx.state();
    assert.equal(s.device, 'keyboard', 'before anything is touched the device is the keyboard');

    // ================================================================== the stick: dead zone, walk, run, direction
    await pad(0.2, 0); // inside the radial dead zone (0.22): drift never moves the hero
    await ctx.step(30);
    s = await ctx.state();
    assert.ok(Math.abs(s.vx) < 0.05, `the dead zone holds the hero still (${s.vx})`);
    await pad(0.55, 0); // a gentle tilt
    await ctx.step(40);
    s = await ctx.state();
    assert.ok(s.vx > 1 && s.vx < 4.2, `a gentle tilt walks (${s.vx})`);
    assert.equal(s.device, 'gamepad', 'using the pad makes it the current device');
    await pad(1, 0);
    await ctx.step(40);
    s = await ctx.state();
    assert.ok(s.vx > 8, `a firm push runs (${s.vx})`);
    assert.equal(s.anim, 'run');
    await ctx.shot('01-run');
    await pad(-1, 0);
    await ctx.step(50);
    s = await ctx.state();
    assert.ok(s.vx < -8, `and to the left (${s.vx})`);
    await pad(0, 0);
    await ctx.step(30);

    // ================================================================== buttons: A jump, X attack, B dash, Y ability
    await pad(0, 0, [0]); // A held: the full jump
    await ctx.step(14);
    s = await ctx.state();
    assert.equal(s.grounded, false, 'A jumps');
    await pad(0, 0);
    await ctx.step(50);
    await pad(0, 0, [2]); // X
    await ctx.step(3);
    await pad(0, 0);
    s = await ctx.state();
    assert.equal(s.state, 'attack', 'X attacks');
    await ctx.step(40);
    await pad(1, 0);
    await ctx.step(10);
    await pad(1, 0, [1]); // B
    await ctx.step(2);
    await pad(1, 0);
    s = await ctx.state();
    assert.equal(s.state, 'dash', 'B dashes (RB does too)');
    await ctx.step(30);
    await pad(0, 0);
    await ctx.step(30);
    const before = await ctx.state();
    await pad(0, 0, [3]); // Y: the ability needs a card, which the hero does not have yet: nothing happens, nothing breaks
    await ctx.step(10);
    await pad(0, 0);
    s = await ctx.state();
    assert.equal(s.state, before.state);
    assert.equal(s.x, before.x);

    // ================================================================== crouch: D-pad down and stick down
    await pad(0, 0, [13]);
    await ctx.step(6);
    s = await ctx.state();
    assert.equal(s.crouched, true, 'D-pad down crouches');
    await pad(0, 0);
    await ctx.step(8);
    assert.equal((await ctx.state()).crouched, false);
    await pad(0, 1); // stick pulled down
    await ctx.step(6);
    assert.equal((await ctx.state()).crouched, true, 'stick down crouches too');
    await pad(0, 0);
    await ctx.step(8);

    // ================================================================== down + A drops through a one-way platform
    await ctx.teleport(64, 2.7);
    await ctx.step(15);
    s = await ctx.state();
    assert.ok(s.grounded && Math.abs(s.y - 2.7) < 0.05, `on the one-way platform (${s.y})`);
    await pad(0, 0, [13, 0]); // down + A
    await ctx.step(3);
    await pad(0, 0);
    s = await ctx.state();
    assert.equal(s.grounded, false, 'down + A drops through');
    await ctx.step(60);
    assert.ok((await ctx.state()).y < 0.5, 'fell to the floor');

    // ================================================================== unplugging mid-run: nothing stays pressed
    await ctx.teleport(90, 0);
    await ctx.step(20);
    await pad(1, 0);
    await ctx.step(30);
    assert.ok((await ctx.state()).vx > 8);
    await page.evaluate('window.__troid.pad.disconnect()');
    await ctx.step(40);
    s = await ctx.state();
    assert.ok(Math.abs(s.vx) < 0.1, `a pad that is pulled out stops the hero (${s.vx})`);

    // ================================================================== the keyboard is still there
    await page.evaluate('window.__troid.pad.remove()');
    await page.keyboard.down('KeyD');
    await ctx.step(30);
    s = await ctx.state();
    assert.ok(s.vx > 8, 'the keyboard plays after the pad');
    assert.equal(s.device, 'keyboard', 'and the device is the keyboard again');
    await page.keyboard.up('KeyD');
    await ctx.step(30);

    // ================================================================== the player systems on the pad: Interact (LT), Ability (Y), Bottle (LB), Start
    await ctx.open('room=interaction_test&unlock=dash', { width: 844, height: 390 });
    const p2 = ctx.page;
    await ctx.teleport(11, 0); // 1 m from the card
    await ctx.step(3);
    await pad(0.6, 0); // touch the pad: from now on it is the device in use (a tilt that moves the hero a few centimetres)
    await ctx.step(2);
    await pad(0, 0);
    await ctx.step(20);
    s = await ctx.state();
    assert.equal(s.device, 'gamepad');
    await frames(p2, 6);
    assert.equal(await p2.locator('[data-testid="prompt-hit"]').getAttribute('data-object'), 'card_spirit_bolt', 'the icon is over the card');
    assert.equal((await p2.locator('[data-testid="prompt-glyph"]').textContent()) ?? '', 'LT', 'and it names the button of the pad in use');
    await pad(0, 0, [6]); // LT
    await ctx.step(1);
    await pad(0, 0);
    s = await ctx.state();
    assert.equal(s.state, 'interact', 'LT interacts');
    assert.equal(s.card, 'card_spirit_bolt', 'and the card is his');
    await ctx.step(14);
    await pad(0, 0, [3]); // Y
    await ctx.step(1);
    await pad(0, 0);
    await ctx.step(8);
    s = await ctx.state();
    assert.equal(s.magic, 70, 'Y casts the Spirit Bolt with the card just taken');
    await ctx.step(60);
    await p2.evaluate('window.__troid.strikePlayer(1)');
    await ctx.step(40);
    assert.ok((await ctx.state()).health! < 5, 'hurt');
    await pad(0, 0, [4]); // LB
    await ctx.step(1);
    await pad(0, 0);
    assert.equal((await ctx.state()).state, 'drink', 'LB drinks a bottle');
    await ctx.step(26);
    s = await ctx.state();
    assert.equal(s.health, 5, 'and it heals');
    assert.deepEqual(s.bottles, ['recharging', 'ready', 'ready']);
    await ctx.shot('02-pad-systems');

    // Start opens the pause menu and Start closes it (the menu is code that is only downloaded when asked for: wait for it in real time)
    const menuIs = async (open: '0' | '1'): Promise<void> => {
      for (let i = 0; i < 80; i++) {
        if ((await p2.locator('[data-testid="settings-menu"]').getAttribute('data-open').catch(() => null)) === open) return;
        await p2.waitForTimeout(50);
      }
      assert.equal(await p2.locator('[data-testid="settings-menu"]').getAttribute('data-open').catch(() => null), open, `the menu is ${open === '1' ? 'open' : 'closed'}`);
    };
    await p2.evaluate('window.__troid.resume()'); // the loop must run for a real-time press to be seen
    await pad(0, 0, [9]);
    await p2.waitForTimeout(150);
    await pad(0, 0);
    await menuIs('1');
    const frozen = (await ctx.state()).now;
    await p2.waitForTimeout(300);
    assert.equal((await ctx.state()).now, frozen, 'Start paused the game');
    await pad(0, 0, [9]);
    await p2.waitForTimeout(150);
    await pad(0, 0);
    await menuIs('0');
  },
};
