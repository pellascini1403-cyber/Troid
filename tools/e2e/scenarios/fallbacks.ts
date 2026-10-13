import assert from 'node:assert/strict';
import { decodePng } from '../png';
import type { Ctx, GameState, Scenario } from '../scenario';

/**
 * THE GAME WITHOUT ITS SKIN (docs/PROMPT8-LOG.md, phase J). Everything the Prompt 8 made — the painted rooms, the hero's pose sheet, the light of the effects, the light of the world and the atmosphere of the
 * screen — is a SKIN on a simulation that does not know it exists, and each part has a switch that takes it off (`?art=`, `?visual=placeholder`, `?vfx=procedural`, `?light=off`). This is the proof of both
 * halves of that promise, in the four rooms of the slice and with the same hand on the keyboard each time (run, jump, swing the sword):
 *   · with less and less of the skin — the game without ANY art of files, and with nothing at all (the game as it was before the Prompt 8) — every room still loads, still shows a picture, still plays, stays within
 *     the draw-call budget and keeps the console clean;
 *   · and what HAPPENS is the same in all of them, to the last digit: where the hero ends up, how fast, what the enemies did. No skin changes what a play does.
 */
const SIZE = { width: 844, height: 390, dpr: 1 };

const ROOMS: ReadonlyArray<readonly [room: string, x: number]> = [['r1_gate', 6], ['r2_hall', 8], ['r3_chamber', 28], ['r4_sanctum', 15]];

interface Look {
  name: string;
  query: string;
  /** What the page must be drawing with. */
  roomArt: boolean;
  hero: 'art' | 'placeholder';
  vfx: 'art' | 'procedural';
  lights: boolean;
}

const LOOKS: readonly Look[] = [
  { name: 'everything', query: '', roomArt: true, hero: 'art', vfx: 'art', lights: true },
  // `?art=` points the game at no art at all: the blockout rooms, the placeholder hero and the effects' own shapes (the light of the world is not art of files: it stays)
  { name: 'no art of files', query: '&art=', roomArt: false, hero: 'placeholder', vfx: 'procedural', lights: true },
  { name: 'nothing at all', query: '&art=&visual=placeholder&vfx=procedural&light=off', roomArt: false, hero: 'placeholder', vfx: 'procedural', lights: false },
];

async function until(ctx: Ctx, what: string, ok: (s: GameState) => boolean, ms = 20000): Promise<GameState> {
  const t0 = Date.now();
  let s = await ctx.state();
  while (!ok(s)) {
    if (Date.now() - t0 > ms) assert.fail(`timed out waiting for ${what}`);
    await ctx.page.waitForTimeout(80);
    s = await ctx.state();
  }
  return s;
}

/** Standard deviation of the luminance (0–1) of the picture: zero is a blank screen. */
function spread(png: Buffer): number {
  const img = decodePng(png);
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  for (let i = 0; i < img.data.length; i += 4 * 7) {
    const l = (0.2126 * img.data[i]! + 0.7152 * img.data[i + 1]! + 0.0722 * img.data[i + 2]!) / 255;
    sum += l;
    sum2 += l * l;
    n++;
  }
  return Math.sqrt(Math.max(0, sum2 / n - (sum / n) ** 2));
}

/** What a play did, in the numbers of the simulation (no picture in it): it must be the same whatever the skin. */
function outcome(s: GameState): string {
  return JSON.stringify({
    x: s.x, y: s.y, vx: s.vx, vy: s.vy, grounded: s.grounded, state: s.state, health: s.health, now: s.now, magic: s.magic,
    enemies: s.enemies?.map((e) => [e.id, e.state, e.x, e.y, e.hp]),
    boss: s.boss ? [s.boss.state, s.boss.x, s.boss.hp] : null,
  });
}

export const fallbacks: Scenario = {
  name: 'fallbacks',
  async run(ctx) {
    let worst = 0;
    const reference = new Map<string, string>();
    for (const look of LOOKS) {
      for (const [room, x] of ROOMS) {
        await ctx.open(`room=${room}&unlock=dash&paused=1${look.query}`, SIZE);
        // the effects come after the first frame; the art of the room a moment later (when there is any)
        let s = await until(ctx, `the effects${look.roomArt ? ' and the room dressed' : ''}`, (g) => g.vfxLook !== null && g.vfxLook !== undefined && (!look.roomArt || !!g.roomArt));
        const at = `${room} with ${look.name}`;
        assert.equal(!!s.roomArt, look.roomArt, `${at}: the art of the room is ${look.roomArt ? 'there' : 'not there'}`);
        assert.equal(s.vfxLook!.origin, look.vfx, `${at}: the effects draw with ${look.vfx === 'art' ? 'the art' : 'their own shapes'}`);
        assert.equal(s.lights !== null && s.lights !== undefined, look.lights, `${at}: the light of the world is ${look.lights ? 'on' : 'off'}`);
        assert.equal(s.screen !== null && s.screen !== undefined, look.lights, `${at}: and so is the atmosphere of the screen`);
        // the same hand each time: run, jump, swing
        await ctx.page.evaluate('window.__troid.game.debug.set("godMode", true)');
        await ctx.teleport(x, 0);
        await ctx.page.evaluate('window.__troid.settleCamera(4)');
        await ctx.page.keyboard.down('KeyD');
        await ctx.step(90);
        await ctx.page.keyboard.down('Space');
        await ctx.step(10);
        await ctx.page.keyboard.up('Space');
        await ctx.page.keyboard.down('KeyJ');
        await ctx.step(2);
        await ctx.page.keyboard.up('KeyJ');
        await ctx.step(30);
        await ctx.page.keyboard.up('KeyD');
        await ctx.page.evaluate('window.__troid.advanceEffects(2)');
        await ctx.page.waitForTimeout(250);
        s = await ctx.state();
        worst = Math.max(worst, s.drawsMax ?? 0);
        if (look.hero === 'placeholder') assert.match(s.sprite!.set, /placeholder/, `${at}: the hero is the placeholder`);
        else assert.ok(!/placeholder/.test(s.sprite!.set), `${at}: the hero is drawn with the art (${s.sprite!.set})`);
        assert.ok(s.x > x + 3, `${at}: the hero ran (x ${x} → ${s.x.toFixed(2)})`);
        assert.ok((s.drawsMax ?? 0) <= 60, `${at}: draw calls ${s.drawsMax}`);
        const picture = await ctx.page.screenshot();
        assert.ok(spread(picture) > 0.03, `${at}: there is a picture, not a blank screen`);
        if (look.name === 'nothing at all') await ctx.shot(`nothing-${room}`);
        assert.deepEqual(ctx.errors, [], `${at}: the console stays clean`);
        // and what happened is what happens
        const mine = outcome(s);
        const first = reference.get(room);
        if (first === undefined) reference.set(room, mine);
        else assert.equal(mine, first, `${at}: what the play did is what it did with everything on (the skin changes what is SEEN, never what HAPPENS)`);
      }
    }
    console.log(`  fallbacks: ${ROOMS.length} rooms × ${LOOKS.length} looks (${LOOKS.map((l) => l.name).join(' · ')}): every room plays, draws a picture, keeps the console clean and ends the same play in the same place · worst frame ${worst} draw calls (budget 60)`);
  },
};
