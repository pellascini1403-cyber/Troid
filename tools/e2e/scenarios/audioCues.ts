import assert from 'node:assert/strict';
import type { Ctx, GameState, Scenario } from '../scenario';

/**
 * THE CUES OF THE SOUND TO COME in a real browser (docs/ART-PIPELINE-2D.md, part H). The game has no sound; what is proved here is the SEAM: that in the real game, with
 * the real keyboard, every moment a sound will be made for raises its cue — from the simulation's own event, on the tick it happens, with where it happened and which
 * kind — into the sink a sound engine will take over (`state().cues` shows what it would have been told).
 *
 *   A · R1, a new game: a dash, a jump and its landing, a blow and the hit it lands (on the tick the hitbox appears and the tick the damage lands), being hurt, dying,
 *       the Spirit Bolt and its impact, a bottle, an enemy's wind-up and its death, a change of room
 *   B · the room of interactions: taking an object
 *   C · the boss: its wind-up, its strike, its fall
 */
const SIZE = { width: 844, height: 390, dpr: 1 };
type Cues = NonNullable<GameState['cues']>;
type Cue = Cues['recent'][number];

export const audioCues: Scenario = {
  name: 'audio-cues',
  async run(ctx: Ctx) {
    const cues = async (): Promise<Cues> => {
      const s = await ctx.state();
      assert.ok(s.cues, 'the effects have arrived, so the cues are being written down');
      return s.cues;
    };
    const clear = (): Promise<unknown> => ctx.page.evaluate('window.__troid.clearCues()');
    const sess = (code: string): Promise<unknown> => ctx.page.evaluate(`(() => { const s = window.__troid.session; ${code} })()`);
    const tap = async (code: string, hold = 1): Promise<void> => {
      await ctx.page.keyboard.down(code);
      await ctx.step(hold);
      await ctx.page.keyboard.up(code);
    };
    const names = (c: Cues): string[] => c.recent.map((e) => e.cue);
    const only = (c: Cues, cue: string): Cue[] => c.recent.filter((e) => e.cue === cue);
    const one = (c: Cues, cue: string): Cue => {
      const found = only(c, cue);
      assert.ok(found.length >= 1, `the cue "${cue}" was raised (it raised ${names(c).join(', ') || 'nothing'})`);
      return found[0]!;
    };
    /** Steps (in small bites) until `cond` holds on the written-down cues. */
    const until = async (what: string, cond: (c: Cues) => boolean, max: number, bite = 2): Promise<Cues> => {
      for (let i = 0; i < max; i += bite) {
        const c = await cues();
        if (cond(c)) return c;
        await ctx.step(bite);
      }
      throw new Error(`${what}: not within ${max} ticks (${names(await cues()).join(', ')})`);
    };
    const placed = (e: Cue): void => assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y), `${e.cue} has a place`);
    const godMode = (on: boolean): Promise<unknown> => ctx.page.evaluate(`window.__troid.game.debug.set("godMode", ${on})`);

    // ===================================================================================================== A · R1, a new game
    await ctx.open('', SIZE);
    await ctx.step(30);
    let c = await cues();
    assert.deepEqual(typeof c.total, 'number');
    await clear();

    // ---- a dash on foot, a jump, its landing
    await tap('ShiftLeft', 2);
    await ctx.step(30);
    c = await cues();
    const dash = one(c, 'dash');
    assert.deepEqual([dash.variant, dash.intensity], ['ground', 1]);
    placed(dash);
    await clear();
    await tap('Space', 2);
    await ctx.step(80);
    c = await cues();
    const jump = one(c, 'jump');
    const land = one(c, 'land');
    assert.equal(jump.variant, 'ground');
    assert.ok(land.tick > jump.tick, 'the landing is after the jump');
    assert.ok(land.intensity > 0 && land.intensity <= 1);
    placed(jump);
    placed(land);

    // ---- a blow, and the hit it lands: the cue is the tick the hitbox appears and the tick the damage lands, not the tick of the button
    await ctx.page.evaluate('window.__troid.spawnDummy(window.__troid.session.player.body.x + 1.3, 0, 99)');
    await ctx.step(2);
    await clear();
    const hp0 = (await ctx.state()).dummies![0]!.hp;
    const pressed = (await ctx.state()).tick;
    let hitboxAt = -1;
    let damagedAt = -1;
    await tap('KeyJ');
    for (let i = 0; i < 40; i++) {
      await ctx.step(1);
      const s = await ctx.state();
      if (hitboxAt < 0 && s.boxes?.hitbox) hitboxAt = s.tick;
      if (damagedAt < 0 && s.dummies![0]!.hp < hp0) damagedAt = s.tick;
    }
    c = await cues();
    const attack = one(c, 'attack');
    const hit = one(c, 'hit');
    assert.equal(attack.tick, hitboxAt, 'the blow\'s cue is the tick its hitbox appears…');
    assert.ok(attack.tick > pressed, '…which is after the button: the blow has a wind-up');
    assert.equal(hit.tick, damagedAt, '…and the hit\'s is the tick the damage is done');
    assert.deepEqual([attack.variant, attack.intensity, hit.variant], ['slash_1', 0.7, 'slash_1']);
    assert.ok(hit.intensity > 0, 'the hit has a strength');
    placed(attack);
    placed(hit);
    assert.ok(hit.x! > attack.x!, 'the hit is out in front of the blow (the contact point), not at the hero');

    // ---- being hurt, and dying: once each, the hit that hurt the hero is not also a `hit`
    await clear();
    await ctx.page.evaluate('window.__troid.strikePlayer(1)');
    await ctx.step(2);
    c = await cues();
    const hurt = one(c, 'hurt');
    assert.equal(hurt.intensity, 0.5);
    placed(hurt);
    assert.equal(only(c, 'hit').length, 0, 'the blow that hurt the hero is `hurt`, not `hit`');
    for (let i = 0; i < 200 && (await ctx.state()).invulnerable; i++) await ctx.step(2);
    await sess('s.player.health.damage(s.player.health.current - 1);');
    await ctx.page.evaluate('window.__troid.strikePlayer(1)');
    c = await until('the hero falls', (x) => only(x, 'death').length >= 1, 40);
    assert.equal(only(c, 'death').length, 1);
    placed(one(c, 'death'));
    for (let i = 0; i < 600 && (await ctx.state()).death?.phase !== 'none'; i++) await ctx.step(2);
    await ctx.step(10);

    // ---- the Spirit Bolt: cast, and its impact is the bolt's, not the sword's
    await sess('s.loadout.acquire("card_spirit_bolt");');
    await ctx.page.evaluate('window.__troid.spawnDummy(window.__troid.session.player.body.x + 6, 0, 99)');
    await ctx.step(2);
    await clear();
    await tap('KeyK');
    c = await until('the bolt reaches the dummy', (x) => only(x, 'boltImpact').length >= 1, 120);
    const cast = one(c, 'boltCast');
    const impact = one(c, 'boltImpact');
    assert.equal(cast.variant, 'spirit_bolt');
    assert.equal(impact.variant, 'spirit_bolt');
    assert.ok(impact.tick > cast.tick, 'the impact is after the cast');
    assert.ok(impact.x! > cast.x!, 'and farther along the way');
    assert.equal(only(c, 'hit').length, 0, 'the bolt\'s hit is not a sword hit');

    // ---- a bottle: it starts, and the drink lands when the channel ends
    await ctx.step(30);
    await sess('s.player.health.damage(2);');
    await ctx.step(2);
    await clear();
    await tap('KeyL');
    c = await until('the drink lands', (x) => only(x, 'bottleDrunk').length >= 1, 80);
    const start = one(c, 'bottleStart');
    const drunk = one(c, 'bottleDrunk');
    assert.ok(drunk.tick - start.tick >= 20, `the channel is ${drunk.tick - start.tick} ticks`);
    assert.equal(drunk.intensity, 1);

    // ---- an enemy winds up (and says which), and falls
    await godMode(true); // this part is about the slime, not about the hero's life
    await ctx.teleport(44, 0); // flat ground, past the pit: a slime 7 m ahead has room to come
    await ctx.step(20);
    const slime = (await ctx.page.evaluate('window.__troid.spawnSlime(window.__troid.session.player.body.x + 7, 0, -1)')) as string; // (R1 has its own, far away in its arena)
    await ctx.step(2);
    await clear();
    c = await until('the slime winds up', (x) => only(x, 'enemyTelegraph').length >= 1, 400, 4);
    const windUp = one(c, 'enemyTelegraph');
    assert.equal(windUp.variant, 'ink_slime');
    placed(windUp);
    const pull = (): Promise<unknown> =>
      ctx.page.evaluate(`(() => { const t = window.__troid; const e = t.session.entities.find((x) => x.id === ${JSON.stringify(slime)}); const p = t.session.player.body; e.body.x = p.x + 1.6; e.body.vx = 0; })()`);
    for (let blow = 1; blow <= 3; blow++) {
      await pull();
      await ctx.step(1);
      await tap('KeyJ');
      for (let i = 0; i < 40 && ((await ctx.state()).enemies?.find((e) => e.id === slime)?.hp ?? 0) > 3 - blow; i++) await ctx.step(1);
      await ctx.step(30);
    }
    c = await cues();
    assert.equal(only(c, 'enemyDeath').length, 1, 'the slime fell once');
    assert.ok(only(c, 'hit').length >= 3, 'three blows landed');
    await godMode(false);

    // ---- a change of room: no place, and the room it leads to
    await sess('s.flags.set("defeated:r1_slime")');
    await ctx.step(2);
    await clear();
    await ctx.teleport(110, 0);
    c = await until('the transition starts', (x) => only(x, 'roomTransition').length >= 1, 20, 1);
    const room = one(c, 'roomTransition');
    assert.deepEqual([room.variant, room.x, room.y, room.intensity], ['r2_hall', null, null, 1]);
    assert.equal(only(c, 'roomTransition').length, 1, 'one change of room, one cue');

    // ===================================================================================================== B · taking an object
    await ctx.open('room=interaction_test&unlock=dash', SIZE);
    await ctx.teleport(11, 0);
    await ctx.step(30);
    await clear();
    await tap('KeyE');
    c = await until('the card is taken', (x) => only(x, 'interact').length >= 1, 40);
    const taken = one(c, 'interact');
    assert.equal(taken.variant, 'pickup');
    placed(taken);
    assert.ok(Math.abs(taken.x! - 12) < 0.5, `where the card lay (${taken.x})`);
    assert.equal(only(c, 'interact').length, 1, 'once');

    // ===================================================================================================== C · the boss
    await ctx.open('room=r4_sanctum&unlock=dash', SIZE);
    await ctx.step(20);
    await godMode(true); // this part is about the boss, not about the hero's life
    await clear();
    await ctx.teleport(30, 0); // the feet cross x = 27.5: the Warden wakes
    c = await until('the Warden strikes', (x) => only(x, 'bossAttack').length >= 1, 2400, 5);
    const windUpBoss = c.recent.find((e) => e.cue === 'enemyTelegraph' && e.variant === 'ink_warden');
    const strike = one(c, 'bossAttack');
    assert.ok(windUpBoss, 'it winded up first, and said who');
    assert.ok(windUpBoss.tick < strike.tick, `the wind-up (${windUpBoss.tick}) is before the strike (${strike.tick})`);
    assert.ok(['warden_charge', 'warden_rain'].includes(strike.variant), strike.variant);
    placed(strike);
    assert.ok(strike.x! > 20 && strike.x! < 60, `in the arena (${strike.x})`);
    assert.equal(only(c, 'bossDeath').length, 0, 'it has not fallen');
    // the last blow: the Warden at one point of life, and a blow over it (a hitbox of the hero\'s, as a sword\'s would be)
    await clear();
    await sess(
      `const g = s.entities.find((e) => e.kind === 'guardian'); g.health.damage(g.health.current - 1);
       s.combat.submit({ ownerId: s.player.id, team: 'player', rect: { x0: g.body.x - 1, x1: g.body.x + 1, y0: g.body.y, y1: g.body.y + 3 }, attackId: 'e2e_blow', damage: 1,
         knockback: { x: 0, y: 0 }, stun: 0, hitStop: 0, shake: 0, facing: 1, alreadyHit: new Set() });`,
    );
    c = await until('the Warden falls', (x) => only(x, 'bossDeath').length >= 1, 20, 1);
    const fall = one(c, 'bossDeath');
    assert.equal(fall.variant, 'ink_warden');
    placed(fall);
    assert.equal(only(c, 'bossDeath').length, 1, 'once');
    assert.ok(only(c, 'enemyDeath').some((e) => e.tick === fall.tick), 'a fall is also the death of an enemy, on the same tick');
    assert.equal(ctx.errors.length, 0);
  },
};
