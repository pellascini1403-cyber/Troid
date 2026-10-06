import assert from 'node:assert/strict';
import { ROOMS } from '@/content';
import { runBot } from '../../../tests/helpers/bot';
import { driver, type Driver } from '../../../tests/helpers/sim';
import { countPixels, decodePng, isVioletLight } from '../png';
import { record, replay, type Recording } from '../replay';
import type { GameState, Scenario } from '../scenario';

/**
 * THE WHOLE ROOM (S11): R1 played from the entrance to the exit with REAL keyboard events in headless Chromium, and lost
 * to the slime and started over. Both runs are RECORDED in Node on the pure simulation by a scripted player and REPLAYED
 * tick by tick through the browser's keyboard, comparing a digest of the entire simulation (hero, enemy, flags, exits,
 * random generator, defeat flow) every 50 ticks: the browser plays the same game as the simulation, bit for bit.
 *
 *   run A — enter, move, jump (hurdle, steps, pit), dash, crouch (the passage), take the slime's lunge, defeat it with
 *           the sword, watch the door dissolve, walk through it and reach the exit;
 *   run B — walk to the arena, let the slime win, watch the defeat, come back at the entrance with the slime alive and
 *           the door shut.
 *
 * Also: every verb is seen on screen, the console stays clean (the runner fails the scenario otherwise), draw calls stay
 * ≤ 60 through all of it, and 20 rebuilds of the room leave the scene graph exactly as it was.
 */
const R1 = ROOMS.r1_gate!;
const CROUCH = [[60.5, 77.4]] as const;

function fresh(): Driver {
  // right + down is (1, −1) in the recording AND in the browser: digital sources do not normalise (the axis contract of InputFrame)
  return driver({ room: R1, unlocked: ['dash'] });
}
function letGo(d: Driver): void {
  d.release('jump');
  d.release('attack');
  d.release('dash');
  d.stop();
}

/** Run A: the whole room, taking one blow on the way. */
function recordWin(): Recording {
  const d = fresh();
  return record(d, () => {
    // 1 · the entrance to the arena: run, jump, cross the pit, dash on the flat, crawl. No fighting yet.
    runBot(d, { crouchZones: CROUCH, engage: 0, dashAt: 48, until: () => d.body.x >= 86.5, maxTicks: 3000 });
    letGo(d);
    // 2 · stand still: the slime winds up and its lunge lands
    d.until(() => d.p.health.current < 5, 1200);
    d.step(40);
    // 3 · answer with the sword until it is beaten
    runBot(d, { crouchZones: CROUCH, until: () => d.session.flags.has('defeated:r1_slime'), maxTicks: 1500 });
    letGo(d);
    d.step(30);
    // 4 · through the door, to the exit
    runBot(d, { crouchZones: CROUCH, until: () => d.session.exitsReached.has('east'), maxTicks: 1500 });
    letGo(d);
    d.step(10);
  });
}

/** Run B: the slime wins. */
function recordLose(): Recording {
  const d = fresh();
  return record(d, () => {
    runBot(d, { crouchZones: CROUCH, engage: 0, until: () => d.body.x >= 90, maxTicks: 3000 });
    letGo(d);
    d.until(() => d.p.health.dead, 3000); // five lunges, one damage each, 60 ticks of i-frames between them
    d.until(() => d.session.death.phase === 'fadeIn', 600); // dying → fade out → title → the respawn
    d.step(60);
  });
}

export const room: Scenario = {
  name: 'room',
  async run(ctx) {
    const win = recordWin();
    const lose = recordLose();
    console.log(`  recorded in Node: run A ${win.total} ticks (${win.runs.length} key changes), run B ${lose.total} ticks (${lose.runs.length})`);
    assert.ok(win.total > 800 && lose.total > 1000);

    let worst = 0;
    const note = (s: GameState): void => {
      worst = Math.max(worst, s.drawsMax ?? 0);
    };
    const violet = async (): Promise<number> => {
      await ctx.page.waitForTimeout(80);
      return countPixels(decodePng(await ctx.page.screenshot()), isVioletLight);
    };

    // =================================================================================================== run A · the win
    await ctx.open('paused=1', { width: 844, height: 390, dpr: 1 });
    let s = await ctx.state();
    assert.equal(s.room, 'r1_gate', 'a new game starts in R1');
    assert.equal(s.now, 0, 'not one tick has run: the replay starts from tick 0');
    const scene0 = { ...s.scene };
    assert.equal(await ctx.page.evaluate('window.__troid.session.abilities.has("dash")'), true, 'the hero starts with the dash');
    await ctx.shot('a-00-entrance');

    const seen = new Set<string>();
    const shot = new Set<string>();
    let violetAtWindUp = 0;
    let maxX = 0;
    await replay(ctx, win, {
      chunk: 4,
      observe: async (st, tick) => {
        note(st);
        const slime = st.enemies?.[0];
        maxX = Math.max(maxX, st.x);
        if (st.crouched) seen.add('crouch');
        if (!st.grounded && st.y > 1.2) seen.add('jump');
        if (st.state === 'dash') seen.add('dash');
        if (st.state === 'attack') seen.add('attack');
        if (st.state === 'hurt') seen.add('hurt');
        if (slime?.state === 'detect') seen.add('slime-notices');
        if (slime?.state === 'telegraph') seen.add('slime-winds-up');
        if (slime?.state === 'attack') seen.add('slime-lunges');
        if (st.flags?.includes('defeated:r1_slime')) seen.add('slime-defeated');
        if (st.exits?.includes('east')) seen.add('exit');
        // a few moments worth a look
        const once = async (name: string, when: boolean, action?: () => Promise<void>): Promise<void> => {
          if (!when || shot.has(name)) return;
          shot.add(name);
          if (action) await action();
          await ctx.shot(name);
        };
        await once('a-01-hurdle', st.x > 15.4 && st.x < 18 && !st.grounded);
        await once('a-02-pit', st.x > 33 && st.x < 36 && !st.grounded);
        await once('a-03-dash', st.state === 'dash');
        await once('a-04-crawl', !!st.crouched && st.x > 68);
        await once('a-05-windup', slime?.state === 'telegraph' && slime.phaseT > 0.7, async () => {
          violetAtWindUp = await violet();
        });
        await once('a-06-hurt', st.state === 'hurt' && slime?.state !== 'dead');
        await once('a-07-slash', st.state === 'attack' && (slime?.state === 'hurt' || slime?.state === 'dead'));
        await once('a-08-defeated', slime?.state === 'dead' && slime.phaseT > 0.25);
        void tick;
      },
    });
    s = await ctx.state();
    note(s);
    for (const verb of ['crouch', 'jump', 'dash', 'attack', 'hurt', 'slime-notices', 'slime-winds-up', 'slime-lunges', 'slime-defeated', 'exit']) {
      assert.ok(seen.has(verb), `the run showed "${verb}" (saw: ${[...seen].join(', ')})`);
    }
    assert.ok(maxX > 106.6, `all the way to the exit zone (x = ${maxX})`);
    assert.ok(violetAtWindUp > 150, `the wind-up showed violet on screen (${violetAtWindUp} px)`);
    assert.deepEqual(s.flags, ['defeated:r1_slime']);
    assert.deepEqual(s.exits, ['east']);
    assert.equal(s.health, 4, 'the one lunge it let land cost one life');
    assert.equal(s.enemies?.length, 0, 'the slime is gone');
    assert.equal(s.gates?.exit_door?.open, true);
    await ctx.page.waitForFunction('window.__troid.state().gates.exit_door.alpha === 0', undefined, { timeout: 10000 });
    await ctx.shot('a-09-exit');
    assert.equal(s.views, 0, 'and so is its view');

    // ================================================================================================== run B · the defeat
    await ctx.open('paused=1', { width: 844, height: 390, dpr: 1 });
    s = await ctx.state();
    assert.equal(s.now, 0);
    let overlayShown = false;
    let dyingSeen = false;
    await replay(ctx, lose, {
      chunk: 4,
      observe: async (st) => {
        note(st);
        if (st.death?.phase === 'dying') dyingSeen = true;
        if (st.death?.phase === 'hold' && !overlayShown) {
          const o = (await ctx.page.evaluate(`(() => { const e = document.querySelector('[data-testid=death-overlay]'); const t = document.querySelector('[data-testid=death-title]'); return { display: getComputedStyle(e).display, text: t.textContent }; })()`)) as { display: string; text: string };
          assert.equal(o.display, 'flex', 'the defeat screen is up');
          assert.ok(o.text.length > 0, 'with its localized title');
          overlayShown = true;
          await ctx.shot('b-00-defeat');
        }
      },
    });
    s = await ctx.state();
    note(s);
    assert.ok(dyingSeen && overlayShown, 'the slime beat the hero and the defeat flow played');
    assert.ok(Math.abs(s.x - 4) < 0.2, `back at the entrance (x = ${s.x})`);
    assert.equal(s.health, 5, 'with full health');
    assert.equal(s.enemies?.length, 1, 'the slime is back');
    assert.equal(s.enemies?.[0]?.hp, 3);
    assert.ok(Math.abs((s.enemies?.[0]?.x ?? 0) - 96) < 3, 'in its arena');
    assert.deepEqual(s.flags, [], 'nothing was won');
    assert.equal(s.gates?.exit_door?.open, false, 'the door is shut');
    assert.equal(await ctx.page.evaluate('window.__troid.session.abilities.has("dash")'), true, 'dying costs nothing: the dash is still there');
    await ctx.shot('b-01-respawned');

    // ============================================================================================ rebuilds leave nothing
    s = await ctx.state();
    const before = { views: s.views, scene: { ...s.scene }, pools: s.vfx?.poolCreated };
    await ctx.page.evaluate('window.__troid.session.death.cancel()');
    for (let i = 0; i < 20; i++) {
      await ctx.page.evaluate('window.__troid.session.loadRoom("r1_gate")');
      await ctx.step(30);
    }
    s = await ctx.state();
    note(s);
    assert.equal(s.views, before.views, 'no view leaked');
    assert.deepEqual(s.scene, before.scene, 'no scene object leaked');
    assert.deepEqual(scene0, { ...scene0, ...s.scene, actors: scene0.actors }, 'and the scene is the same as at the start (except what lives in it)');
    assert.equal(s.vfx?.poolCreated, before.pools, 'the effect pools did not grow');

    assert.ok(worst <= 60, `draw calls peaked at ${worst}`);
    console.log(`  room: ${worst} draw calls at the worst moment of the whole room (budget 60); two replays matched the simulation digest every 50 ticks`);
  },
};
