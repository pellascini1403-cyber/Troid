import assert from 'node:assert/strict';
import { captureProgress } from '@/gameplay/progress';
import { DEFAULT_TOUCH } from '@/input/gestures/TouchConfig';
import type { TouchLayout } from '@/ui/touch/layout';
import { arriveIn, freshWorld, playWorld } from '../../../tests/helpers/journey';
import { PROGRESS_KEY, reload, stored, type Saved } from '../bossKit';
import { frames } from '../frames';
import { cardState } from '../hud';
import { record, replay, type Device } from '../replay';
import type { GameState, Scenario } from '../scenario';
import { TouchScreen } from '../touch';

/**
 * THE FIRST CHAPTER FROM A NEW GAME, ON THREE DEVICES (docs/PROMPT6-LOG.md S32; docs/PROMPT21-LOG.md): the final integration of the chapter, in a real browser, in one sitting.
 *
 *  - **A new game** (no saved progress, R1) is played by the KEYBOARD through R1 and R2 and by the GAMEPAD from the middle of the walk to R3 to the way on — R3's
 *    climb, the card, the Spirit Bolt that breaks the seal, R4, the Ink Warden, the Air Dash it leaves and the way on to the Collapsed Nave, the first room of the rest of the world. The journey is
 *    RECORDED in Node on the pure simulation (`tests/helpers/journey.ts`, the same one `worldJourney.test.ts` and the `world` scenario use) and
 *    REPLAYED tick by tick, comparing a digest of the whole simulation every 50 ticks: whatever the device, the browser plays the same game, bit for bit,
 *    through four room transitions and a boss.
 *  - **What the page SAVED** on the way is, field by field, what the simulation knows (flags, abilities, the card, the bottles, the checkpoint and where the
 *    hero is): the saved game is the one that was played — in the Nave, a room the first frame of the page did not carry.
 *  - **A reload** continues that game where the game puts the hero: in the Nave (the page asks for the rest of the world BEFORE it builds the session when the saved game is there), with the Warden gone for good, the Air Dash taken, the Spirit
 *    Bolt equipped and the checkpoint still the start of the world (nobody rested) — and **the TOUCH screen** (real touches by the DevTools protocol) takes the
 *    hero across the Nave to its way on, into the Sealed Archive.
 *
 * Along the way: the interface follows (the card slot, the Ability button), the console stays clean (the runner fails the scenario otherwise) and the draw
 * calls stay ≤ 60.
 */
const WANT_FLAGS = ['broken:r3_seal', 'defeated:r1_slime', 'defeated:r2_slime', 'defeated:r4_boss', 'taken:air_dash', 'taken:card_spirit_bolt'];
const ROOM_ORDER = ['r1_gate', 'r2_hall', 'r3_chamber', 'r4_sanctum', 'ru_nave'];

/** What a save says that the simulation also knows, in one comparable text (the lists in order: they are sets). */
const essence = (p: Pick<Saved, 'at' | 'checkpoint' | 'flags' | 'abilities' | 'bottleSlots' | 'cards'>): string =>
  JSON.stringify({ at: p.at, checkpoint: p.checkpoint, flags: [...p.flags].sort(), abilities: [...p.abilities].sort(), bottleSlots: p.bottleSlots, cards: p.cards });

export const finale: Scenario = {
  name: 'finale',
  async run(ctx) {
    // ================================================================================================ the journey, in Node
    const d = freshWorld();
    const enteredAt: Record<string, number> = {};
    d.session.bus.on('room:entered', (e) => void (enteredAt[e.roomId] ??= d.session.now));
    const journey = record(d, () => {
      playWorld(d);
      arriveIn(d, 'ru_nave');
    });
    const want = captureProgress(d.session);
    assert.deepEqual([...want.flags].sort(), WANT_FLAGS, 'in the simulation the journey wins everything the chapter gives');
    assert.equal(d.session.room.id, 'ru_nave', '…and ends in the Collapsed Nave');
    // the gamepad takes over where one run ends and the next begins with NOTHING held: the first such pause after the hero has arrived in R3 — as a
    // person would, setting one controller down and picking the other up while the hero stands still
    let t = 0;
    let handOver = -1;
    for (const run of journey.runs) {
      if (t >= enteredAt['r3_chamber']! && Object.values(run.held).every((v) => !v)) {
        handOver = t;
        break;
      }
      t += run.ticks;
    }
    assert.ok(handOver >= enteredAt['r3_chamber']! && handOver < enteredAt['r4_sanctum']!, `the hand-over to the gamepad is in R3 (tick ${handOver})`);
    console.log(`  recorded in Node: ${journey.total} ticks (${journey.runs.length} key changes) · keyboard to tick ${handOver}, then the gamepad`);

    // ================================================================================================ a new game, paused at tick 0
    await ctx.open('paused=1&touch=1', { width: 844, height: 390, dpr: 1, touch: true });
    const { page } = ctx;
    let s = await ctx.state();
    assert.equal(s.room, 'r1_gate', 'a new game starts in R1');
    assert.equal(s.now, 0, 'not one tick has run: the replay starts from tick 0');
    assert.equal(await stored(page), null, 'and there is no saved progress: it is a NEW game');
    assert.deepEqual(s.respawnPoint, { room: 'r1_gate', entry: 'start' });

    // ================================================================================================ the keyboard, then the gamepad
    const devices = new Set<string>();
    const rooms: string[] = [];
    let worst = 0;
    await replay(ctx, journey, {
      chunk: 4,
      device: (tick): Device => (tick >= handOver ? 'gamepad' : 'keyboard'),
      observe: async (st: GameState, tick: number) => {
        worst = Math.max(worst, st.drawsMax ?? 0);
        if (st.device) devices.add(`${tick >= handOver ? 'after' : 'before'}:${st.device}`);
        if (st.room && rooms[rooms.length - 1] !== st.room) rooms.push(st.room);
      },
    });
    assert.deepEqual(rooms, ROOM_ORDER, 'R1 → R2 → R3 → R4 → the Nave, in order');
    assert.ok(devices.has('before:keyboard'), `the keyboard played the first half (${[...devices]})`);
    assert.ok(devices.has('after:gamepad'), `and the gamepad the second (${[...devices]})`);
    s = await ctx.state();
    assert.equal(s.room, 'ru_nave', 'the journey ends in the Collapsed Nave');
    assert.deepEqual([...(s.flags ?? [])].sort(), WANT_FLAGS, 'every flag the chapter gives, and no volatile one');
    assert.equal(s.menuOpen, false, 'the Sanctum is not the end of the world: nothing holds the world at a closing');
    assert.equal(s.card, 'card_spirit_bolt', 'the Spirit Bolt is equipped');
    assert.ok((s.health ?? 0) > 0, 'alive');
    assert.equal(s.device, 'gamepad', 'the last device is the gamepad');
    assert.equal(await page.evaluate('window.__troid.touch().active'), 0, 'and no finger ever touched the screen');
    assert.equal(await cardState(page), 'ready', 'the card is ready (the status the Ability button reads)');
    assert.notEqual(await page.locator('[data-testid="touch-ability"]').evaluate((e) => getComputedStyle(e).display), 'none', 'and the Ability button is on the touch layer');
    await frames(page, 40); // the camera follows in real time while the replay runs ahead of it: let it catch up before looking
    await ctx.shot('a-the-nave');

    // ================================================================================================ what the page saved is what was played
    let got: Saved | null = null;
    for (let i = 0; i < 200; i++) {
      got = await stored(page);
      if (got && essence(got) === essence(want)) break;
      await page.waitForTimeout(50);
    }
    assert.ok(got, 'the page saved the progress');
    assert.equal(essence(got), essence(want), 'and it is exactly what the simulation knows');
    assert.deepEqual(got.checkpoint, { room: 'r1_gate', entry: 'start' }, 'nobody rested: the checkpoint is still the start of the world');
    assert.ok(!got.flags.some((f) => f.startsWith('~')), 'no volatile flag is in the file');
    assert.equal(await page.evaluate(`Object.keys(localStorage).filter((k) => k.startsWith(${JSON.stringify(PROGRESS_KEY)})).sort().join()`), PROGRESS_KEY, 'and the progress is that one key (no backup left over, no corrupt copy)');

    // ================================================================================================ a reload continues that game
    await reload(page);
    s = await ctx.state();
    assert.equal(s.now, 0, 'the reloaded game is paused at its first tick');
    assert.equal(s.room, 'ru_nave', 'the game continues where the game puts the hero: the Nave…');
    assert.ok(s.x < 8, `…at its west door (${s.x})`);
    assert.deepEqual([...(s.flags ?? [])].sort(), WANT_FLAGS, 'with everything that was won');
    assert.equal(s.boss, null, 'the Warden is gone for good');
    assert.equal(s.card, 'card_spirit_bolt', 'the card is equipped');
    assert.deepEqual(s.respawnPoint, { room: 'r1_gate', entry: 'start' }, 'and a defeat would still bring the hero to the start of the world');
    assert.deepEqual(s.exits, [], 'no exit has been touched in this session');
    await frames(page, 40);
    await ctx.shot('b-continued');

    // ================================================================================================ the touch screen takes the hero across the Nave
    await page.evaluate('window.__troid.session.godMode = true'); // (the crawlers and the spitters of the Nave are not what is being asked)
    await ctx.teleport(55, 2); // the Nave is a room of ledges and pits that a finger on the run zone does not cross: the last stretch, the flat floor before its way on, is what the touch screen is asked
    await ctx.step(10);
    const screen = await new TouchScreen(page).init();
    const layout = ((await page.evaluate('window.__troid.touch()')) as { layout: TouchLayout }).layout;
    await screen.touch(1, layout.zone.x + layout.zone.w * 0.4, 250);
    await screen.drag(1, DEFAULT_TOUCH.rx * layout.gestureScale * 1.6, 0, 4, 8); // a firm drag: a full run
    let ticks = 0;
    for (; ticks < 1500; ticks += 10) {
      await ctx.step(10);
      s = await ctx.state();
      worst = Math.max(worst, s.drawsMax ?? 0);
      if (s.exits?.includes('east')) break;
    }
    await screen.lift(1);
    assert.ok(s.exits?.includes('east'), `the touch screen reached the way on of the Nave (${s.exits}, x ${s.x.toFixed(1)}, ${ticks} ticks)`);
    assert.equal(s.device, 'touch', 'by touch');
    assert.ok(s.x > 66 && (s.health ?? 0) > 0, `alive at the east end of the Nave, where its way on begins (x ${s.x.toFixed(2)})`);
    // the way on is the next room: the Sealed Archive, which the same chunk of the game holds
    for (let i = 0; i < 40 && (await ctx.state()).room !== 'ru_archive'; i++) await ctx.step(10);
    s = await ctx.state();
    assert.equal(s.room, 'ru_archive', 'the touch screen took the hero from the Nave into the Archive');
    await frames(page, 40);
    await ctx.shot('c-the-archive-by-touch');
    const resumedAt = s.now!;
    await ctx.step(10);
    assert.ok(((await ctx.state()).now ?? 0) > resumedAt, 'the world runs');

    assert.ok(worst <= 60, `draw calls stay within the budget (worst ${worst})`);
    console.log(`  finale: new game → keyboard (R1, R2) → gamepad (R3, R4, the Warden, the Air Dash, the Nave) → saved exactly as played → reloaded in the Nave → touch into the Archive · worst ${worst} draw calls (budget 60)`);
  },
};
