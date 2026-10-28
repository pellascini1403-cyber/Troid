import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AIR_SLASH, CROUCH_SLASH, SLASH_1, SLASH_2 } from '@/content/attacks';
import { BOSSES, ENEMIES } from '@/content/enemies';
import { PLAYER_PLACEHOLDER } from '@/content/placeholders/playerPlaceholder';
import { INTERACTION_TEST_ROOM } from '@/content/rooms/interactionTest';
import { SKILLS } from '@/content/skills';
import { PLAYER_VISUAL } from '@/content/visuals';
import { DEFAULT_DEATH_FLOW } from '@/gameplay/DeathFlow';
import { MAX_INTERACT_LOCK } from '@/interaction/Interactable';
import { DEFAULT_MOVEMENT } from '@/player/MovementTuning';
import type { PlayerStateId } from '@/player/PlayerController';
import { ActorPresenter } from '@/presentation/ActorPresenter';
import { CLIP_ALIASES, parseArtPack, toSpriteSetDefinition } from '@/presentation/artManifest';
import { clipFrameNames, type SpriteSetDefinition } from '@/presentation/SpriteSetDefinition';
import { chooseSource, standInFor } from '@/presentation/visualSource';
import { ANIM_STATES, type AnimPhase, type AnimState } from '@/presentation/vocabulary';
import { lab, LAB_H } from '../helpers/lab';
import { Driver, makeSession } from '../helpers/sim';

/**
 * THE HERO'S STATES ALWAYS END (docs/PROMPT22-LOG.md §9): no state of the hero can be left holding the animation — not one of the ten states of the controller, not one of the eighteen poses the view can ask for. Three things are proved, with the REAL
 * simulation and the REAL presenters (the placeholder's and the art's, the way `PlayerVisual` runs them every frame):
 *   1. each move, played once with the hands off afterwards, hands the body back to rest — free, on the ground, the idle pose, no phase — in the time its own data says (the blow's ticks, the channel of the bottle, the stun of the heaviest creature…);
 *   2. a hero played AT RANDOM (every control, in any order, with blows landing on them and the defeat flow bringing them back) never stays in a state longer than that, never publishes a pose the vocabulary does not have, and ends at rest;
 *   3. what is drawn follows: the placeholder has a clip of its own for every pose the hero can publish, the real art draws all but the five poses its sheet has no drawing for yet, and the frame shown during a blow is the one the clip says belongs to the phase the simulation is in.
 * The six clips still to be drawn (docs/PROMPT22-LOG.md §9, art/player/requests/) are asserted here too, against the simulation they have to fit: the number of ticks each lasts, the frames each phase will have.
 */
const root = fileURLToPath(new URL('../../', import.meta.url));
const ABILITIES = ['dash', 'air_dash', 'double_jump', 'wall_jump', 'ground_slam'];
const TICK = 1 / 60;

// ---------------------------------------------------------------------------------------------------------------- the art, as the game fetches it
const pack = parseArtPack(JSON.parse(readFileSync(join(root, 'public', 'art', 'player', 'player.pack.json'), 'utf8')) as unknown).value!;
const ART: SpriteSetDefinition = toSpriteSetDefinition(pack.id, pack.sprites.find((s) => s.id === PLAYER_VISUAL.art.sprite)!, { resolution: 1 });
const ART_FRAMES = new Set(Object.keys((JSON.parse(readFileSync(join(root, 'public', 'art', 'player', 'hero_0.json'), 'utf8')) as { frames: Record<string, unknown> }).frames));
const PLACEHOLDER_FRAMES = new Set(Object.values(PLAYER_PLACEHOLDER.def.clips).flatMap((c) => clipFrameNames(c!)));
/** The poses the sheet has no drawing for: the placeholder draws them until the six clips of `art/player/requests/` arrive (the second blow repeats the first, a declared stand-in). */
const NOT_DRAWN_YET: readonly AnimState[] = ['crouch', 'crouchWalk', 'attackAir', 'attackCrouch', 'drink'];

// ---------------------------------------------------------------------------------------------------------------- how long each state may last, from the data
const total = (a: { startup: number; active: number; recovery: number }): number => a.startup + a.active + a.recovery;
const heaviestStun = ((): number => {
  const seen = new WeakSet<object>();
  const walk = (x: unknown): number => {
    if (typeof x !== 'object' || x === null || seen.has(x)) return 0;
    seen.add(x);
    return Object.entries(x).reduce((m, [k, v]) => Math.max(m, k === 'stun' && typeof v === 'number' ? v : walk(v)), 0);
  };
  return Math.max(walk(ENEMIES), walk(BOSSES));
})();
const SLAM = DEFAULT_MOVEMENT.slam;
/** Ticks of the SIMULATION (a hit-stop holds the clock): the longest a state may last, with two ticks of margin for the tick it ends on. */
const LONGEST: Readonly<Partial<Record<PlayerStateId, number>>> = {
  attack: total(SLASH_1) + total(SLASH_2) + 2, // the chain
  cast: Math.max(...Object.values(SKILLS).map((s) => s.startup + s.recovery)) + 2,
  drink: 24 + 2,
  interact: MAX_INTERACT_LOCK + 2,
  hurt: heaviestStun + 2,
  dash: Math.ceil(DEFAULT_MOVEMENT.dash.duration * 60) + 2,
  slam: SLAM.windup + Math.ceil((LAB_H / SLAM.speed) * 60) + SLAM.landLag + 2, // the dive lasts as long as the fall: the room's height at most
  dead: DEFAULT_DEATH_FLOW.dying + DEFAULT_DEATH_FLOW.fadeOut + DEFAULT_DEATH_FLOW.hold + 2,
};
/** What the view says for each state of the controller (`Player.publishAnimation`); `free` and `crouch` say the body's own: any pose of the gait, the air or the crouch. */
const POSE_OF: Readonly<Partial<Record<PlayerStateId, readonly AnimState[]>>> = {
  dead: ['death'], hurt: ['hurt'], cast: ['cast'], drink: ['drink'], interact: ['interact'], slam: ['attackAir'],
  attack: ['attack', 'attack2', 'attackAir', 'attackCrouch'],
  dash: ['dash', 'crouchWalk'],
  free: ['idle', 'walk', 'run', 'jump', 'fall', 'land'],
  crouch: ['crouch', 'crouchWalk', 'fall', 'jump', 'land', 'idle'],
};
const GAITS: readonly AnimState[] = ['walk', 'run', 'crouchWalk'];
/** Every pose the simulation can publish for the hero (the engine's names: the sheet calls the first blow `attack1`). */
const HERO_POSES: readonly AnimState[] = ['idle', 'walk', 'run', 'jump', 'fall', 'land', 'crouch', 'crouchWalk', 'dash', 'attack', 'attack2', 'attackAir', 'attackCrouch', 'cast', 'drink', 'hurt', 'death', 'interact'];
const TIMED: readonly PlayerStateId[] = ['attack', 'cast', 'slam'];

// ---------------------------------------------------------------------------------------------------------------- a hero in a room, watched
function labRoom(spawns: boolean) {
  const room = lab();
  return spawns ? room : { ...room, spawns: [] };
}

function hero(entry: string, o: { spawns?: boolean; abilities?: string[] } = {}): Driver {
  const room = labRoom(o.spawns ?? false);
  const d = new Driver(makeSession({ room, unlocked: o.abilities ?? ABILITIES, entry }));
  d.session.loadout.acquire('card_spirit_bolt');
  d.step(30); // the landing at the entry
  return d;
}

/** The two looks of the hero, driven by the view the way `PlayerVisual` drives them every frame. */
class Looks {
  readonly placeholder = new ActorPresenter(PLAYER_PLACEHOLDER.def, PLAYER_PLACEHOLDER.meta);
  readonly art = new ActorPresenter(ART, null, { quietFallbacks: true });
  readonly drawnBy = new Map<AnimState, Set<'art' | 'placeholder'>>();
  sync(d: Driver): void {
    const v = d.p.view;
    this.placeholder.sync(v, 1, TICK);
    this.art.sync(v, 1, TICK);
    const who = chooseSource('auto', ART, v.anim);
    (this.drawnBy.get(v.anim) ?? this.drawnBy.set(v.anim, new Set()).get(v.anim)!).add(who);
  }
}

/** What a driver went through: every state and pose, the longest stay in each state, and the first thing that was wrong. */
class Watch {
  readonly states = new Set<PlayerStateId>();
  readonly poses = new Set<AnimState>();
  readonly longest: Partial<Record<PlayerStateId, number>> = {};
  readonly looks = new Looks();
  readonly wrong: string[] = [];
  private state: PlayerStateId;
  private since: number;
  private last: number;

  constructor(readonly d: Driver) {
    this.state = d.p.controller.state;
    this.since = this.last = d.session.now;
    const step = d.step.bind(d);
    d.step = (n = 1) => {
      for (let i = 0; i < n; i++) {
        step(1);
        this.look();
      }
      return d;
    };
  }

  private bad(what: string): void {
    if (this.wrong.length < 8) this.wrong.push(`tick ${this.d.session.now}: ${what}`);
  }

  private look(): void {
    const d = this.d;
    const v = d.p.view;
    const state = d.p.controller.state;
    const now = d.session.now;
    this.states.add(state);
    this.poses.add(v.anim);
    if (state !== this.state) {
      this.state = state;
      this.since = now;
    }
    if (now !== this.last) {
      // (a tick held by a hit-stop does not move the clock of the simulation: the stay is counted in ticks that were played)
      this.last = now;
      const stay = now - this.since;
      if (stay > (this.longest[state] ?? 0)) this.longest[state] = stay;
    }

    if (!ANIM_STATES.includes(v.anim)) this.bad(`the pose "${v.anim}" is not in the vocabulary`);
    const allowed = POSE_OF[state];
    if (allowed && !allowed.includes(v.anim)) this.bad(`state ${state} shows "${v.anim}"`);
    if (!TIMED.includes(state) && v.phase !== 'none') this.bad(`state ${state} has the phase ${v.phase}`);
    if (!(v.phaseT >= 0 && v.phaseT <= 1)) this.bad(`phaseT ${v.phaseT}`);
    const speed = v.animSpeed;
    if (GAITS.includes(v.anim) ? !(speed >= 0.5 && speed <= 1.5) : v.anim !== 'dash' && speed !== 1) this.bad(`${v.anim} plays at ${speed}`);

    this.looks.sync(d);
    const { placeholder, art } = this.looks;
    if (placeholder.animator.state !== v.anim) this.bad(`the placeholder has no clip of its own for "${v.anim}" (it plays "${placeholder.animator.state}")`);
    if (!placeholder.pose.frame || !PLACEHOLDER_FRAMES.has(placeholder.pose.frame)) this.bad(`the placeholder shows the frame ${placeholder.pose.frame}`);
    if (!art.pose.frame || !ART_FRAMES.has(art.pose.frame)) this.bad(`the art shows the frame ${art.pose.frame}`);
    if (chooseSource('auto', ART, v.anim) === 'art' && standInFor(ART, v.anim) === null) this.bad(`the art is asked for "${v.anim}" and has nothing to draw it with`);
  }

  /** What went wrong, if anything: a stay longer than the bound its data gives, or a pose the checks above did not like. */
  problems(): string[] {
    const long = (Object.entries(this.longest) as Array<[PlayerStateId, number]>)
      .filter(([state, stay]) => LONGEST[state] !== undefined && stay > LONGEST[state]!)
      .map(([state, stay]) => `${state} lasted ${stay} ticks (at most ${LONGEST[state]})`);
    return [...long, ...this.wrong];
  }
}

/** The hero is at rest: free, on the ground, the idle pose, no phase, no flash. */
function atRest(d: Driver): boolean {
  const v = d.p.view;
  return d.p.controller.state === 'free' && d.body.grounded && v.anim === 'idle' && v.phase === 'none' && v.flash === 0;
}

/** Lets go of everything and waits for the rest, for at most `bound` ticks; the ticks it took. */
function toRest(d: Driver, bound: number, what: string): number {
  d.stop();
  for (const b of ['jump', 'attack', 'dash', 'ability', 'bottle', 'interact', 'drop'] as const) d.release(b);
  for (let i = 0; i <= bound; i++) {
    if (atRest(d)) return i;
    d.step(1);
  }
  throw new Error(`${what}: not at rest ${bound} ticks after the hands were lifted (state ${d.p.controller.state}, pose ${d.p.view.anim}, phase ${d.p.view.phase}, grounded ${d.body.grounded})`);
}

/** A blow from a creature on the hero, as the combat step receives it: `damage` hit points, `stun` ticks of stun, knocked back to the right. */
function blow(d: Driver, damage = 1, stun = 14, id = 'script_enemy'): void {
  d.session.combat.submit({
    ownerId: 'script_enemy', team: 'enemy', rect: { x0: d.body.x - 0.5, x1: d.body.x + 0.5, y0: d.body.y + 0.2, y1: d.body.y + 1.2 }, attackId: id,
    damage, knockback: { x: 5.5, y: 4 }, stun, hitStop: 6, shake: 0.2, facing: 1, alreadyHit: new Set(),
  });
}

// ---------------------------------------------------------------------------------------------------------------- 1. each move ends
describe('each move the hero has gives the body back to rest', () => {
  it('the first slash, the second slash in its window and a slash with nothing after: idle again within the blows\' own ticks', () => {
    const d = hero('start');
    const w = new Watch(d);
    d.tap('attack');
    expect(d.p.controller.state).toBe('attack');
    expect(toRest(d, total(SLASH_1) + 4, 'one slash')).toBeLessThanOrEqual(total(SLASH_1) + 4);
    // the chain: a press inside the window of the first blow runs the second
    d.tap('attack').step(8);
    d.tap('attack');
    d.step(1);
    expect(d.p.view.anim, 'the second blow').toBe('attack2');
    expect(toRest(d, total(SLASH_2) + 4, 'the second slash')).toBeLessThanOrEqual(total(SLASH_2) + 4);
    // a third press does not exist: after the second blow the chain is over
    d.tap('attack').step(1);
    d.tap('attack');
    toRest(d, total(SLASH_1) + total(SLASH_2) + 6, 'a press after the chain');
    expect(w.problems()).toEqual([]);
  });

  it('the air slash ends when the blow does, and its pose is gone when the feet touch the ground', () => {
    const d = hero('start');
    const w = new Watch(d);
    d.tap('jump').step(10);
    expect(d.body.grounded).toBe(false);
    d.tap('attack').step(1);
    expect(d.p.view.anim).toBe('attackAir');
    expect(toRest(d, total(AIR_SLASH) + 80, 'the air slash')).toBeGreaterThan(0);
    // and one that ends on the ground: the landing cuts its recovery short
    d.tap('jump').step(30);
    d.tap('attack');
    toRest(d, 160, 'the air slash that lands');
    expect(w.problems()).toEqual([]);
  });

  it('the crouch slash returns to the crouch, and the crouch to the stand when the control is let go', () => {
    const d = hero('start');
    const w = new Watch(d);
    d.moveY = -1;
    d.step(12);
    expect(d.p.view.anim).toBe('crouch');
    d.tap('attack').step(1);
    expect(d.p.view.anim).toBe('attackCrouch');
    d.step(total(CROUCH_SLASH) + 2);
    expect(d.p.view.anim, 'the blow is over and the hero is still crouched').toBe('crouch');
    expect(toRest(d, 8, 'standing up')).toBeLessThanOrEqual(8);
    expect(w.problems()).toEqual([]);
  });

  it('the Spirit Bolt: the cast ends in the skill\'s own preparation and recovery, and in the air it ends on the ground', () => {
    const d = hero('start');
    const w = new Watch(d);
    d.tap('ability').step(1);
    expect(d.p.view.anim).toBe('cast');
    expect(toRest(d, LONGEST.cast!, 'the cast')).toBeLessThanOrEqual(LONGEST.cast!);
    d.step(70); // (the magic and the skill's cooldown)
    d.tap('jump').step(10);
    d.tap('ability').step(1);
    expect(d.p.controller.state).toBe('cast');
    toRest(d, 160, 'the cast in the air');
    expect(w.problems()).toEqual([]);
  });

  it('the bottle: the channel ends in its 24 ticks with the life back; a blow in the middle of it ends it without spending the bottle', () => {
    const d = hero('start');
    const w = new Watch(d);
    d.p.health.damage(3);
    const before = d.p.health.current;
    d.tap('bottle').step(1);
    expect(d.p.view.anim).toBe('drink');
    expect(toRest(d, LONGEST.drink!, 'the drink')).toBeLessThanOrEqual(LONGEST.drink!);
    expect(d.p.health.current, 'the drink healed').toBeGreaterThan(before);
    // the interrupted one
    d.p.health.damage(1);
    const heal = d.p.health.current;
    d.step(2);
    d.tap('bottle').step(8);
    expect(d.p.view.anim).toBe('drink');
    d.until(() => !d.p.invulnerable, 120);
    blow(d, 1, 14, 'script_in_the_drink');
    d.step(2);
    expect(d.p.view.anim).toBe('hurt');
    expect(d.p.health.current, 'the blow, and no healing').toBeLessThan(heal);
    toRest(d, 14 + 12, 'the blow in the middle of the drink');
    expect(w.problems()).toEqual([]);
  });

  it('an interaction holds the control for its lock and gives it back', () => {
    const d = new Driver(makeSession({ room: INTERACTION_TEST_ROOM, unlocked: ABILITIES }));
    const w = new Watch(d);
    d.step(10);
    d.teleport(11, 0).step(20);
    d.tap('interact').step(1);
    expect(d.p.view.anim).toBe('interact');
    expect(toRest(d, LONGEST.interact!, 'the interaction')).toBeLessThanOrEqual(LONGEST.interact!);
    expect(w.problems()).toEqual([]);
  });

  it('a blow stuns for what it says — the heaviest in the game included — and the hero is free again after, with the flash gone', () => {
    const d = hero('start');
    const w = new Watch(d);
    for (const stun of [6, 14, heaviestStun]) {
      d.until(() => !d.p.invulnerable, 300);
      blow(d, 1, stun, `script_stun_${stun}`);
      d.step(1);
      expect(d.p.view.anim, `stun ${stun}`).toBe('hurt');
      expect(d.p.view.flash).toBeGreaterThan(0);
      toRest(d, stun + 40, `a stun of ${stun}`);
    }
    expect(w.problems()).toEqual([]);
    expect(w.longest.hurt, 'the longest stay in `hurt`').toBeLessThanOrEqual(heaviestStun + 2);
  });

  it('the dash on foot, the air dash and the crouched dash all end: the body is free again, or crouched if it started crouched', () => {
    const d = hero('slam'); // (eight metres of floor between the ledge and the shaft: the dashes go back and forth in them)
    const w = new Watch(d);
    d.right().tap('dash').step(1);
    expect(d.p.view.anim).toBe('dash');
    toRest(d, 80, 'the dash on foot');
    d.step(40); // (the dash needs its breath)
    d.tap('jump').step(14);
    d.left().tap('dash').step(1);
    expect(d.p.controller.state, 'the dash in the air').toBe('dash');
    toRest(d, 200, 'the dash in the air');
    d.step(40);
    d.moveY = -1;
    d.step(14);
    d.right().tap('dash').step(1);
    expect(d.p.controller.state).toBe('dash');
    expect(d.p.view.anim, 'the crouched dash is the crouch walked fast').toBe('crouchWalk');
    d.step(LONGEST.dash!);
    expect(d.p.controller.state, 'the dash is over and the body is crouched').toBe('crouch');
    toRest(d, 60, 'standing up after the crouched dash');
    expect(w.problems()).toEqual([]);
  });

  it('the Double Jump restarts the jump pose, and the Wall Jump slides in the fall pose, and both end on the floor', () => {
    const d = hero('start');
    const w = new Watch(d);
    d.press('jump').step(12);
    const serial = d.p.view.animSerial;
    d.release('jump').tap('jump').step(1);
    expect(d.p.view.animSerial, 'the second jump restarts the clip').toBeGreaterThan(serial);
    expect(d.p.view.anim).toBe('jump');
    toRest(d, 200, 'the double jump');

    const s = hero('shaft');
    const ws = new Watch(s);
    s.left().step(40); // against the wall of the shaft
    s.press('jump').step(24);
    s.release('jump');
    s.until(() => s.p.controller.wallSliding, 120);
    expect(s.p.view.anim, 'sliding down a wall is the fall').toBe('fall');
    s.step(10);
    expect(s.p.controller.wallSliding, 'still sliding').toBe(true);
    expect(s.p.view.anim).toBe('fall');
    toRest(s, 400, 'the wall slide');
    expect(ws.problems()).toEqual([]);
    expect(w.problems()).toEqual([]);
  });

  it('the Ground Slam: the hover, the dive and the lag are all `attackAir` with a phase of their own, and the hero is free after the wave', () => {
    const d = hero('slam');
    const w = new Watch(d);
    d.press('jump').step(20);
    d.release('jump').step(10);
    d.moveY = -1;
    d.tap('attack').step(1);
    expect(d.p.controller.state).toBe('slam');
    const phases = new Set<AnimPhase>();
    for (let i = 0; i < LONGEST.slam! && d.p.controller.state === 'slam'; i++) {
      phases.add(d.p.view.phase);
      d.step(1);
    }
    expect([...phases].sort(), 'the three parts of the slam draw three phases of the blow').toEqual(['active', 'recovery', 'startup']);
    toRest(d, 40, 'after the slam');
    expect(w.problems()).toEqual([]);
  });

  it('a defeat: the death pose is held until the defeat flow brings the hero back, and what comes back is the idle hero, whole, with nothing left of the death', () => {
    const d = hero('start');
    const w = new Watch(d);
    const max = d.p.health.max;
    d.p.health.damage(max - 1);
    d.step(2);
    d.until(() => !d.p.invulnerable, 300);
    blow(d, 1, 14, 'script_the_last');
    d.step(2);
    expect(d.p.controller.state).toBe('dead');
    d.step(60);
    expect(d.p.controller.state, 'still down while it dies').toBe('dead');
    expect(d.p.view.anim).toBe('death');
    d.step(LONGEST.dead! + DEFAULT_DEATH_FLOW.fadeIn + 4);
    expect(d.session.deathSnapshot.phase).toBe('none');
    expect(d.p.health.current, 'whole again').toBe(max);
    expect(d.p.view.opacity).toBe(1);
    toRest(d, 60, 'after the defeat');
    expect(d.p.view.blink || d.p.view.flash > 0, 'no blink, no flash').toBe(false);
    expect(w.longest.dead, 'the time spent dead').toBeLessThanOrEqual(LONGEST.dead!);
    expect(w.problems()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------- 2. a hero played at random
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

interface Soaked {
  watch: Watch;
  deaths: number;
  hits: number;
  /** Why the hero did not come to rest after the hands were lifted, if they did not. */
  failure: string | null;
}

/** Every control at random for `ticks` ticks, with the creature of the room about and blows landing on the hero, then the hands off: the hero must come to rest. */
function soak(seed: number, entry: string, ticks: number): Soaked {
  const rnd = lcg(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
  const d = hero(entry, { spawns: true });
  const w = new Watch(d);
  let jumpLeft = 0;
  let deaths = 0;
  let hits = 0;
  let wasDead = false;
  const taps: Array<['attack' | 'dash' | 'ability' | 'bottle' | 'interact' | 'drop', number]> = [['attack', 0.06], ['dash', 0.025], ['ability', 0.02], ['bottle', 0.012], ['interact', 0.01], ['drop', 0.01]];
  for (let t = 0; t < ticks; t++) {
    if (rnd() < 0.04) d.moveX = pick([-1, 0, 1]);
    if (rnd() < 0.02) d.moveY = d.moveY === 0 ? -1 : 0;
    if (jumpLeft > 0) {
      if (--jumpLeft === 0) d.release('jump');
    } else if (rnd() < 0.03) {
      d.press('jump');
      jumpLeft = 1 + Math.floor(rnd() * 30);
    }
    for (const [b, p] of taps) {
      d.release(b);
      if (rnd() < p) d.press(b);
    }
    if (rnd() < 0.004 && !d.p.health.dead) {
      blow(d, 1, pick([8, 14, 18]), `script_${seed}_${t}`);
      hits++;
    }
    d.step(1);
    const dead = d.p.controller.state === 'dead';
    if (dead && !wasDead) deaths++;
    wasDead = dead;
  }
  // hands off, and the world at peace (the creature is a source of blows, not of the question)
  d.session.godMode = true;
  let failure: string | null = null;
  try {
    toRest(d, 700, 'after the soak');
  } catch (e) {
    failure = (e as Error).message;
  }
  return { watch: w, deaths, hits, failure };
}

describe('a hero played at random', () => {
  const RUNS = [1, 2, 3, 4, 5, 6].flatMap((seed) => ['start', 'shaft', 'slam', 'top'].map((entry) => ({ seed: seed * 7919 + entry.length, entry })));
  const results = RUNS.map((r) => soak(r.seed, r.entry, 2400));

  it('never stays in a state longer than its data says, never publishes a pose the vocabulary lacks, and ends every run at rest', () => {
    const problems = results.flatMap((r, i) => [...r.watch.problems(), ...(r.failure ? [r.failure] : [])].map((p) => `seed ${RUNS[i]!.seed} at ${RUNS[i]!.entry}: ${p}`));
    expect(problems).toEqual([]);
  });

  it('really plays: hits landed, the hero fell in battle and came back, and the soak went through all but a few of the poses', () => {
    const states = new Set(results.flatMap((r) => [...r.watch.states]));
    const poses = new Set(results.flatMap((r) => [...r.watch.poses]));
    expect(results.reduce((n, r) => n + r.hits, 0), 'blows thrown at the hero').toBeGreaterThan(60);
    expect(results.reduce((n, r) => n + r.deaths, 0), 'defeats').toBeGreaterThan(3);
    for (const s of ['free', 'crouch', 'dash', 'attack', 'slam', 'cast', 'hurt', 'dead'] as PlayerStateId[]) expect(states.has(s), `the soak reached ${s}`).toBe(true);
    for (const p of ['idle', 'walk', 'run', 'jump', 'fall', 'dash', 'attack', 'attack2', 'attackAir', 'crouch', 'hurt', 'death', 'cast'] as AnimState[]) expect(poses.has(p), `the soak showed ${p}`).toBe(true);
  });

  it('draws every pose with the art but the five it has no drawing for — and those with the placeholder, which has a clip for each of them', () => {
    const drawn = new Map<AnimState, Set<string>>();
    for (const r of results) for (const [pose, by] of r.watch.looks.drawnBy) for (const b of by) (drawn.get(pose) ?? drawn.set(pose, new Set()).get(pose)!).add(b);
    for (const [pose, by] of drawn) {
      if (NOT_DRAWN_YET.includes(pose)) expect([...by], pose).toEqual(['placeholder']);
      else expect([...by], pose).toEqual(['art']);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------- 3. what is drawn follows
describe('what is drawn follows the simulation', () => {
  it('the frame shown during a blow is one the clip gives to the phase the simulation is in, and the frames never go back', () => {
    const d = hero('start');
    const looks = new Looks();
    const seen: Array<{ anim: AnimState; phase: AnimPhase; frame: number }> = [];
    const watch = (): void => {
      looks.sync(d);
      const v = d.p.view;
      if (v.phase !== 'none') seen.push({ anim: v.anim, phase: v.phase, frame: looks.art.animator.frameIndex });
    };
    for (const act of [() => d.tap('attack'), () => { d.tap('attack').step(8); d.tap('attack'); }, () => d.tap('ability')]) {
      seen.length = 0;
      act();
      for (let i = 0; i < 40; i++) {
        watch();
        d.step(1);
      }
      watch();
      expect(seen.length).toBeGreaterThan(6);
      for (const s of seen) {
        const clip = ART.clips[standInFor(ART, s.anim)!]!;
        const [lo, hi] = clip.phases![s.phase as 'startup' | 'active' | 'recovery'];
        expect(s.frame, `${s.anim} in ${s.phase}`).toBeGreaterThanOrEqual(lo);
        expect(s.frame, `${s.anim} in ${s.phase}`).toBeLessThanOrEqual(hi);
      }
      expect(seen.map((s) => s.frame).every((f, i, all) => i === 0 || f >= all[i - 1]!), 'the frames of a blow in order').toBe(true);
      toRest(d, 80, 'between the blows');
      d.step(70);
    }
  });

  it('the hero\'s own states, one by one, are drawn by a clip of the placeholder with no fallback: the six pending clips never leave a hole', () => {
    for (const state of HERO_POSES) expect(PLAYER_PLACEHOLDER.def.clips[state], `the placeholder draws ${state}`).toBeDefined();
  });
});

// ---------------------------------------------------------------------------------------------------------------- the six clips still to be drawn
interface Request {
  status: string;
  gameplay: { ticks: number | null };
  manifest: { fps: number; loop: boolean; phases: Record<'startup' | 'active' | 'recovery', [number, number]> | null };
  frames: unknown[];
}

describe('the six clips still to be drawn fit the simulation they will be played by', () => {
  const requests = (JSON.parse(readFileSync(join(root, 'art', 'player', 'requests', 'requests.json'), 'utf8')) as { clips: Record<string, Request> }).clips;
  const asked = Object.entries(requests).filter(([, r]) => r.status === 'requested');
  const stateOf = (clip: string): AnimState => (CLIP_ALIASES[clip] ?? clip) as AnimState;

  it('are exactly the poses the art cannot draw yet — the five of the placeholder and the second blow, which repeats the first — and 26 drawings in all', () => {
    expect(asked.map(([clip]) => stateOf(clip)).sort()).toEqual([...NOT_DRAWN_YET, 'attack2'].sort());
    expect(asked.reduce((n, [, r]) => n + r.frames.length, 0)).toBe(26);
    for (const [clip] of asked) {
      expect(ART.clips[stateOf(clip)], `${clip} has no drawing in the committed art`).toBeUndefined();
      expect(chooseSource('auto', ART, stateOf(clip)), clip).toBe(stateOf(clip) === 'attack2' ? 'art' : 'placeholder');
    }
  });

  it('last the ticks the simulation spends on them, so the drawn action and the real one end together', () => {
    const sim: Record<string, number> = { attack2: total(SLASH_2), aerialAttack: total(AIR_SLASH), crouchAttack: total(CROUCH_SLASH), drink: LONGEST.drink! - 2 };
    for (const [clip, ticks] of Object.entries(sim)) expect(requests[clip]!.gameplay.ticks, clip).toBe(ticks);
    // the bottle's clip is timed, not phase-driven: its frames at its rate last the channel
    const drink = requests['drink']!;
    expect(Math.round((drink.frames.length / drink.manifest.fps) * 60)).toBe(sim['drink']);
  });

  it('give every phase of a blow at least one frame and no more frames than the simulation has ticks for it (none would be skipped), and cover every frame', () => {
    const blows: Array<[string, { startup: number; active: number; recovery: number }]> = [['attack2', SLASH_2], ['aerialAttack', AIR_SLASH], ['crouchAttack', CROUCH_SLASH]];
    for (const [clip, attack] of blows) {
      const r = requests[clip]!;
      const phases = r.manifest.phases!;
      const covered: number[] = [];
      for (const phase of ['startup', 'active', 'recovery'] as const) {
        const [lo, hi] = phases[phase];
        expect(hi, `${clip} ${phase}`).toBeGreaterThanOrEqual(lo);
        expect(hi - lo + 1, `${clip}: frames in ${phase} against its ${attack[phase]} ticks`).toBeLessThanOrEqual(attack[phase]);
        for (let f = lo; f <= hi; f++) covered.push(f);
      }
      expect(covered, `${clip}: the phases cover the frames in order`).toEqual([...Array(r.frames.length).keys()]);
    }
  });

  it('the loops are loops and the one-shots are not: the crouch and the crawl hold the pose, the drink and the blows play once', () => {
    for (const clip of ['crouch', 'crouchWalk']) expect(requests[clip]!.manifest.loop, clip).toBe(true);
    for (const clip of ['attack2', 'aerialAttack', 'crouchAttack', 'drink']) expect(requests[clip]!.manifest.loop, clip).toBe(false);
  });
});
