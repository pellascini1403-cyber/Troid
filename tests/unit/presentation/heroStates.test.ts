import { describe, expect, it } from 'vitest';
import { PLAYER_VISUAL } from '@/content/visuals';
import { INTERACTION_TEST_ROOM } from '@/content/rooms/interactionTest';
import { chooseSource, standInFor, type VisualSet } from '@/presentation/visualSource';
import type { AnimState } from '@/presentation/vocabulary';
import { driver, type Driver } from '../../helpers/sim';

/**
 * THE STATES OF THE HERO, as the simulation really shows them (docs/ART-PIPELINE-2D.md, part G.3): a scripted play in the headless game — every move the hero has,
 * the first room's included — collects every animation state it ever publishes, and the real art is asked for each one. What this protects: the day the art arrives
 * with its fifteen clips, NOT ONE state of the hero falls to the placeholder in the middle of it (a capsule crawling through the tunnel of a hero drawn by hand), and not
 * one of the fifteen is a clip nothing can ever ask for.
 */
const clip = { frames: 'x_', count: 2 };
/** A set of real art with exactly the clips `PLAYER_VISUAL` asks for — the contract of the delivery, nothing more. */
const COMPLETE: VisualSet = { clips: Object.fromEntries(PLAYER_VISUAL.required.map((s) => [s, clip])) };

/** Plays everything the hero can do and records the state the view says after every tick. */
function scriptedPlay(): Set<AnimState> {
  const seen = new Set<AnimState>();
  const watch = (d: Driver) => {
    const step = d.step.bind(d);
    d.step = (n = 1) => {
      for (let i = 0; i < n; i++) {
        step(1);
        seen.add(d.p.view.anim);
      }
      return d;
    };
    return d;
  };

  // ------------------------------------------------------------------------------------------------ the first room's moves, on flat ground
  const d = watch(driver({ unlocked: ['dash'] }));
  d.step(40); // idle
  d.right().step(60); // from standing to the full gait: walk, then run
  d.stop().step(40);
  d.tap('jump').step(60); // jump, fall, land
  d.moveY = -1;
  d.step(30); // crouch
  d.right().step(30); // crawl
  d.tap('dash').step(30); // the slide under a passage
  d.stop().step(30);
  d.moveY = 0;
  d.step(40);
  d.tap('dash').step(40); // the dash on foot
  d.stop().step(40);
  // the blows: the first, the second in its window, the air blow, the crouch blow
  d.tap('attack').step(6);
  d.tap('attack').step(40);
  d.step(40);
  d.tap('jump').step(8);
  d.tap('attack').step(40);
  d.settle().step(30);
  d.moveY = -1;
  d.step(20);
  d.tap('attack').step(40);
  d.moveY = 0;
  d.step(30);
  // the cast, the drink, the hurt and the death
  d.session.loadout.acquire('card_spirit_bolt');
  d.tap('ability').step(60);
  d.session.player.health.damage(2);
  d.step(2);
  d.tap('bottle').step(40);
  d.session.combat.submit({
    ownerId: 'script_enemy', team: 'enemy', rect: { x0: d.body.x - 0.5, x1: d.body.x + 0.5, y0: d.body.y + 0.2, y1: d.body.y + 1.2 }, attackId: 'script_strike',
    damage: 1, knockback: { x: 5.5, y: 4 }, stun: 14, hitStop: 6, shake: 0.2, facing: 1, alreadyHit: new Set(),
  });
  d.step(40); // the hurt pose
  d.until(() => !d.session.player.invulnerable, 300); // the i-frames of the first hit must be over for the last one to land
  d.session.player.health.damage(d.session.player.health.current - 1);
  d.session.combat.submit({
    ownerId: 'script_enemy', team: 'enemy', rect: { x0: d.body.x - 0.5, x1: d.body.x + 0.5, y0: d.body.y + 0.2, y1: d.body.y + 1.2 }, attackId: 'script_strike_2',
    damage: 1, knockback: { x: 5.5, y: 4 }, stun: 14, hitStop: 6, shake: 0.2, facing: 1, alreadyHit: new Set(),
  });
  d.step(60);

  // ------------------------------------------------------------------------------------------------ the interaction, in the room that has something to take
  const i = watch(driver({ room: INTERACTION_TEST_ROOM, unlocked: ['dash'] }));
  i.step(10);
  i.teleport(11, 0).step(20);
  i.tap('interact').step(30);
  return seen;
}

describe('the states the hero shows', () => {
  const seen = scriptedPlay();

  it('the play reaches every state the game has for the hero (so the checks below mean something)', () => {
    const expected: AnimState[] = ['idle', 'walk', 'run', 'jump', 'fall', 'land', 'crouch', 'crouchWalk', 'dash', 'attack', 'attack2', 'attackAir', 'attackCrouch', 'cast', 'drink', 'hurt', 'death', 'interact'];
    expect([...seen].sort(), 'the states the simulation published').toEqual(expected.sort());
  });

  it('a set with the fifteen clips the delivery asks for draws ALL of them — no state of the hero falls to the placeholder', () => {
    for (const state of seen) expect(chooseSource('auto', COMPLETE, state), state).toBe('art');
  });

  it('…with the clip it should: the gaits borrow the walk, the landing the idle, the crawl the crouch, the first blow the first swing', () => {
    const drawnBy = Object.fromEntries([...seen].map((s) => [s, standInFor(COMPLETE, s)]));
    expect(drawnBy).toEqual({
      idle: 'idle', walk: 'walk', run: 'walk', jump: 'jump', fall: 'fall', land: 'idle', crouch: 'crouch', crouchWalk: 'crouch', dash: 'dash',
      attack: 'attack1', attack2: 'attack2', attackAir: 'attackAir', attackCrouch: 'attackCrouch', cast: 'cast', drink: 'drink', hurt: 'hurt', death: 'death', interact: 'interact',
    });
  });

  it('each of the fifteen clips is the one some state of the hero is drawn with: the list of what the art owes is neither too long nor too short', () => {
    const used = new Set([...seen].map((s) => standInFor(COMPLETE, s)));
    for (const required of PLAYER_VISUAL.required) expect(used.has(required), `nothing asks for "${required}"`).toBe(true);
    expect([...used].filter((s) => s !== null && !PLAYER_VISUAL.required.includes(s))).toEqual([]);
  });

  it('a set that lacks one of the fifteen lets the placeholder draw exactly the states that need it — never more', () => {
    for (const lacking of PLAYER_VISUAL.required) {
      const set: VisualSet = { clips: Object.fromEntries(PLAYER_VISUAL.required.filter((s) => s !== lacking).map((s) => [s, clip])) };
      const placeholder = [...seen].filter((s) => chooseSource('auto', set, s) === 'placeholder');
      const needing = [...seen].filter((s) => standInFor(COMPLETE, s) === lacking && standInFor(set, s) === null);
      expect(placeholder.sort(), `without "${lacking}"`).toEqual(needing.sort());
    }
  });
});
