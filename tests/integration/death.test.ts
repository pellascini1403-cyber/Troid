import { describe, expect, it } from 'vitest';
import { driver, type Driver } from '../helpers/sim';
import { spawnDummy, strikeOnPlayer } from '../helpers/combat';
import { DEFAULT_DEATH_FLOW, type DeathPhase } from '@/gameplay/DeathFlow';
import type { GameEvents } from '@/gameplay/events';
import { block, ground, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';

/**
 * The defeat flow (docs/GAME-SPEC-2D.md §9.2): dying (72) → fade out (30) → title (60) → respawn → fade in (30), all as
 * simulation ticks. Dying costs nothing: the room is reloaded at the entrance, health is full again, abilities stay.
 */
const D = DEFAULT_DEATH_FLOW;

function arena(): RoomDefinition {
  return {
    id: 'arena', regionId: 't', name: 'arena', bounds: rect(-5, -20, 200, 40), killY: -30,
    entries: [{ id: 's', x: 40, y: 0 }, { id: 'b', x: 90, y: 0, facing: -1 }],
    solids: [ground('g', -5, 200), block('wl', -7, -20, -5, 40)],
  };
}
const fighter = (unlocked: string[] = ['dash']): Driver => driver({ room: arena(), unlocked }).settle();

/** Takes the player to 1 HP and delivers the last blow. */
function die(d: Driver): void {
  d.p.health.damage(d.p.health.current - 1);
  strikeOnPlayer(d);
  d.step(1);
  expect(d.p.health.dead).toBe(true);
}

/** Runs the simulation until `cond`, returning how many SIMULATED ticks passed (frozen hit-stop ticks do not count). */
function simTicksUntil(d: Driver, cond: () => boolean, max = 1000): number {
  const t0 = d.session.now;
  for (let i = 0; i < max; i++) {
    if (cond()) return d.session.now - t0;
    d.step(1);
  }
  throw new Error('condition not reached');
}

const phase = (d: Driver): DeathPhase => d.session.death.phase;

/** Runs the whole flow to its end (hit-stop included). */
const finish = (d: Driver): void => void simTicksUntil(d, () => phase(d) === 'none', 2000);
/** Runs until the respawn has happened (the title screen is over). */
const untilRespawned = (d: Driver): void => void simTicksUntil(d, () => phase(d) === 'fadeIn' || phase(d) === 'none', 2000);

const eventLog = (d: Driver) => {
  const log: Array<{ type: string; now: number; payload: unknown }> = [];
  for (const k of ['death:started', 'death:fadeOut', 'death:respawned', 'death:fadeIn', 'room:loaded', 'player:died'] as const) {
    d.session.bus.on(k, (payload) => void log.push({ type: k, now: d.session.now, payload }));
  }
  return log;
};

describe('defeat flow: phases and timing', () => {
  it('runs dying 72 → fade out 30 → title 60 → fade in 30, in simulated ticks, then ends', () => {
    const d = fighter();
    // the tick in which the player dies is the FIRST tick of `dying`; measure every phase from the tick it began
    const startedAt: Partial<Record<DeathPhase, number>> = {};
    d.session.bus.on('death:started', () => (startedAt.dying = d.session.now));
    {
      d.p.health.damage(d.p.health.current - 1);
      strikeOnPlayer(d);
      d.step(1);
    }
    expect(phase(d)).toBe('dying');
    for (const next of ['fadeOut', 'hold', 'fadeIn', 'none'] as const) {
      simTicksUntil(d, () => phase(d) === next);
      startedAt[next] = d.session.now;
    }
    const length = (from: DeathPhase, to: DeathPhase): number => startedAt[to]! - startedAt[from]!;
    // (the phase flips in the scheduler step at the end of the tick, so "began at tick N" = N − 1 ticks of the previous one)
    expect([length('dying', 'fadeOut'), length('fadeOut', 'hold'), length('hold', 'fadeIn'), length('fadeIn', 'none')]).toEqual([
      D.dying - 1, D.fadeOut, D.hold, D.fadeIn,
    ]);
  });

  it('the whole flow, from the death to the respawn, is dying + fade out + title = 162 ticks counting the tick of the death itself', () => {
    const d = fighter();
    const log = eventLog(d);
    die(d);
    finish(d);
    const started = log.find((l) => l.type === 'death:started')!.now;
    const respawned = log.find((l) => l.type === 'death:respawned')!.now;
    const faded = log.find((l) => l.type === 'death:fadeIn')!.now;
    // the tick in which the blow lands is the first tick of `dying`, so the respawn comes 161 ticks after it
    expect(respawned - started).toBe(D.dying + D.fadeOut + D.hold - 1);
    expect(faded).toBe(respawned);
    expect(D.dying + D.fadeOut + D.hold).toBe(162);
  });

  it('the death hit-stop (8 ticks) does NOT count toward the dying phase: the flow is paced by simulated time', () => {
    const d = fighter();
    die(d);
    expect(d.session.hitStopLeft).toBe(8);
    const snapshots: number[] = [];
    for (let i = 0; i < 12; i++) {
      snapshots.push(d.session.death.snapshot().ticks);
      d.step(1);
    }
    expect(new Set(snapshots.slice(0, 9)).size).toBe(1); // frozen: the flow did not move for the 8 ticks of hit-stop
    expect(snapshots[11]!).toBeGreaterThan(snapshots[0]!);
  });

  it('announces each phase with its event, in order, with the durations the overlay needs', () => {
    const d = fighter();
    const log = eventLog(d);
    die(d);
    d.step(D.dying + D.fadeOut + D.hold + D.fadeIn + 20);
    // (the session's own `player:died` listener starts the flow before later listeners see the event)
    const kinds = log.map((l) => l.type).filter((k) => k !== 'player:died');
    expect(kinds).toEqual(['death:started', 'death:fadeOut', 'room:loaded', 'death:respawned', 'death:fadeIn']);
    expect(log.filter((l) => l.type === 'player:died')).toHaveLength(1);
    expect(log.find((l) => l.type === 'death:fadeOut')!.payload).toEqual({ ticks: D.fadeOut });
    expect(log.find((l) => l.type === 'death:fadeIn')!.payload).toEqual({ ticks: D.fadeIn });
    expect(log.find((l) => l.type === 'death:respawned')!.payload).toEqual({ roomId: 'arena', entryId: 's' });
    // the respawn happens at the END of the title screen, in the tick the hold timer fires
    const started = log.find((l) => l.type === 'death:started')!.now;
    const respawned = log.find((l) => l.type === 'death:respawned')!.now;
    expect(respawned - started).toBe(D.dying + D.fadeOut + D.hold - 1);
  });

  it('exposes the flow to the overlay as a snapshot: phase, progress and whether a press would skip', () => {
    const d = fighter();
    die(d);
    d.step(D.dying + D.fadeOut + 1 + 8);
    const hold = d.session.death.snapshot();
    expect(hold.phase).toBe('hold');
    expect(hold.length).toBe(D.hold);
    expect(hold.canSkip).toBe(false);
    d.step(D.skipAfter);
    expect(d.session.death.snapshot().canSkip).toBe(true);
  });

  it('while dying the world keeps running and the dead player ignores every input', () => {
    const d = fighter();
    const dummy = spawnDummy(d, { x: 50, y: 5 }); // falls to the ground while the hero is dying
    die(d);
    d.right().tap('jump').tap('attack').tap('dash');
    d.step(40);
    expect(d.p.controller.state).toBe('dead');
    expect(dummy.body.grounded).toBe(true); // the world did not stop
    expect(d.p.health.current).toBe(0);
  });
});

describe('defeat flow: skipping the wait', () => {
  const atHold = (): Driver => {
    const d = fighter();
    die(d);
    simTicksUntil(d, () => phase(d) === 'hold');
    return d;
  };

  it('a press BEFORE 30 ticks of the title is ignored (the player sees the screen)', () => {
    const d = atHold();
    d.step(D.skipAfter - 3);
    d.tap('jump');
    d.tap('attack');
    expect(phase(d)).toBe('hold');
  });

  it('ANY button press after 30 ticks skips the rest of the wait and respawns on the spot', () => {
    for (const button of ['jump', 'attack', 'dash', 'ability'] as const) {
      const d = atHold();
      d.step(D.skipAfter + 1);
      expect(phase(d)).toBe('hold');
      d.tap(button);
      expect(phase(d), button).toBe('fadeIn');
      expect(d.p.health.current).toBe(5);
    }
  });

  it('the press that skips the wait is SPENT there: it does not also jump, swing or dash the player who just came back', () => {
    for (const button of ['jump', 'attack', 'dash'] as const) {
      const d = atHold();
      d.step(D.skipAfter + 1);
      d.tap(button);
      d.step(3);
      expect(d.p.controller.state, button).toBe('free');
      expect(d.body.grounded, button).toBe(true);
      expect(d.p.combat.attacking, button).toBe(false);
    }
  });

  it('moving the stick is not a button press and does not skip', () => {
    const d = atHold();
    d.step(D.skipAfter + 1);
    d.right().step(10);
    d.moveY = -1;
    d.step(10);
    expect(phase(d)).toBe('hold');
  });

  it('skipping leaves no timer behind: the rest of the flow does not fire a second respawn', () => {
    const d = atHold();
    d.step(D.skipAfter + 1);
    const log = eventLog(d);
    d.tap('jump');
    d.step(D.fadeIn + D.hold + 20);
    expect(log.filter((l) => l.type === 'death:respawned')).toHaveLength(1);
    expect(d.session.scheduler.pending).toBe(0);
    expect(phase(d)).toBe('none');
  });
});

describe('defeat flow: respawn costs nothing', () => {
  it('puts the player back at the room entrance with full health and control', () => {
    const d = fighter();
    d.teleport(120, 0).settle();
    die(d);
    untilRespawned(d);
    d.step(2);
    expect(d.body.x).toBeCloseTo(40, 5);
    expect(d.body.y).toBeCloseTo(0, 5);
    expect(d.p.health.current).toBe(d.p.health.max);
    expect(d.p.controller.state).toBe('free');
    expect(d.p.controller.crouched).toBe(false);
    expect(d.body.height).toBe(1.7);
    d.right().step(30);
    expect(d.body.vx).toBeGreaterThan(5); // it answers the input again
  });

  it('keeps every ability: dying loses nothing', () => {
    const d = fighter(['dash']);
    expect(d.session.abilities.has('dash')).toBe(true);
    die(d);
    d.step(D.dying + D.fadeOut + D.hold + D.fadeIn + 10);
    expect(d.session.abilities.has('dash')).toBe(true);
    d.right().tap('dash');
    expect(d.p.controller.dashing).toBe(true);
  });

  it('reloads the room: whatever lived in it is gone and the collision is rebuilt without leaks', () => {
    const d = fighter();
    spawnDummy(d, { x: 60, y: 0 });
    spawnDummy(d, { x: 62, y: 0 });
    const solids = d.session.collision.count;
    expect(d.session.entities).toHaveLength(2);
    die(d);
    untilRespawned(d);
    expect(d.session.entities).toHaveLength(0);
    expect(d.session.combat.count).toBe(1);
    expect(d.session.collision.count).toBe(solids);
  });

  it('leaves no residue: no timers, no listeners growing, no pending hitboxes (3 deaths in a row)', () => {
    const d = fighter();
    const listeners = d.session.bus.listenerCount();
    for (let i = 0; i < 3; i++) {
      die(d);
      d.step(D.dying + D.fadeOut + D.hold + D.fadeIn + 10);
      expect(d.p.health.current).toBe(5);
      expect(phase(d)).toBe('none');
    }
    expect(d.session.scheduler.pending).toBe(0);
    expect(d.session.bus.listenerCount()).toBe(listeners);
    expect(d.session.combat.pendingHitboxes).toHaveLength(0);
  });

  it('the respawn point is the entrance the room was entered by (a later room transition will move it)', () => {
    const d = fighter();
    expect(d.session.respawnPoint).toEqual({ room: 'arena', entry: 's' });
    d.session.loadRoom('arena', 'b');
    expect(d.session.respawnPoint).toEqual({ room: 'arena', entry: 'b' });
    d.settle();
    die(d);
    untilRespawned(d);
    d.step(2);
    expect(d.body.x).toBeCloseTo(90, 5);
    expect(d.p.facing).toBe(-1);
  });

  it('the god mode of the debug panel makes death impossible', () => {
    const d = fighter();
    d.session.godMode = true;
    d.step(1);
    for (let i = 0; i < 8; i++) {
      strikeOnPlayer(d);
      d.step(70);
    }
    expect(d.p.health.current).toBe(5);
    expect(phase(d)).toBe('none');
  });

  it('a room loaded from outside while dying cancels the flow and always yields a LIVING player', () => {
    const d = fighter();
    die(d);
    d.step(20);
    expect(phase(d)).toBe('dying');
    d.session.loadRoom('arena');
    expect(phase(d)).toBe('none');
    expect(d.p.health.dead).toBe(false);
    expect(d.session.scheduler.pending).toBe(0);
    d.step(D.dying + D.fadeOut + D.hold + 10); // nothing fires afterwards
    expect(d.p.health.current).toBe(5);
    expect(d.p.controller.state).toBe('free');
  });

  it('works with custom durations (they are data)', () => {
    const d = driver({ room: arena(), extra: { death: { dying: 5, fadeOut: 4, hold: 6, fadeIn: 3, skipAfter: 2 } } }).settle();
    die(d);
    const total = simTicksUntil(d, () => phase(d) === 'none');
    expect(total).toBe(5 + 4 + 6 + 3 - 1); // the tick of the death itself is the first one of the flow
  });
});

describe('defeat flow: a heavy blow while the screen is still coming back (found by the S20 soak)', () => {
  /** Respawned, alive, and a few ticks into the fade-in. */
  function intoTheFadeIn(): Driver {
    const d = fighter();
    die(d);
    untilRespawned(d);
    d.step(5);
    expect(phase(d)).toBe('fadeIn');
    expect(d.p.health.dead).toBe(false);
    return d;
  }

  it('starts the defeat over: the hero is never left dead with no flow to bring them back', () => {
    const d = intoTheFadeIn();
    const log = eventLog(d);
    die(d);
    expect(phase(d)).toBe('dying');
    expect(log.filter((l) => l.type === 'death:started')).toHaveLength(1);
    finish(d);
    expect(d.p.health.dead).toBe(false);
    expect(d.p.health.current).toBe(d.p.health.max);
    expect(d.p.controller.state).toBe('free');
    expect(log.filter((l) => l.type === 'death:respawned')).toHaveLength(1);
    expect(d.session.scheduler.pending).toBe(0);
  });

  it('the end of the old fade-in does not fire in the middle of the new defeat', () => {
    const d = intoTheFadeIn(); // 25 ticks of the fade-in were still to run
    die(d);
    d.step(D.dying - 12); // far more than 25 ticks, still inside `dying`
    expect(phase(d)).toBe('dying');
    expect(d.p.health.dead).toBe(true);
  });

  it('is the same defeat as the first one: the same phases in the same order, a respawn at the end', () => {
    const d = intoTheFadeIn();
    const seen: DeathPhase[] = [];
    die(d);
    while (phase(d) !== 'none') {
      if (seen[seen.length - 1] !== phase(d)) seen.push(phase(d));
      d.step(1);
    }
    expect(seen).toEqual(['dying', 'fadeOut', 'hold', 'fadeIn']);
  });
});

describe('defeat flow: a hero who falls out of the world while dying (found by the S20 soak)', () => {
  it('is put back on solid ground but stays dead: the rescue does not hand the control back to a hero with no life', () => {
    const d = fighter();
    d.teleport(120, 0).settle();
    die(d);
    expect(d.p.controller.state).toBe('dead');
    d.body.y = -31; // below the floor of the world
    d.step(12); // (the first ticks are the hit-stop of the death: the world is frozen and nothing is rescued yet)
    expect(d.body.y).toBeGreaterThan(-1); // back on the ground…
    expect(d.p.health.dead).toBe(true);
    expect(d.p.controller.state).toBe('dead'); // …but it is a body, not a player
    d.right().tap('attack');
    d.tap('ability');
    d.tap('dash');
    d.step(20);
    expect(d.p.controller.state).toBe('dead');
    expect(d.body.x).toBeCloseTo(120, 3);
    expect(d.session.magic.current).toBe(d.session.magic.max); // nothing was cast
    finish(d);
    expect(d.p.health.dead).toBe(false); // the flow brings the hero back as always
    expect(d.p.health.current).toBe(d.p.health.max);
  });

  it('a living hero who falls out of the world is still rescued with a clean slate (unchanged)', () => {
    const d = fighter();
    d.teleport(120, 0).settle();
    d.body.y = -31;
    d.step(1);
    expect(d.body.y).toBeGreaterThan(-1);
    expect(d.p.health.dead).toBe(false);
    expect(d.p.controller.state).toBe('free');
  });
});

describe('defeat flow: determinism', () => {
  it('is bit-for-bit reproducible, including the skip', () => {
    const run = (): string[] => {
      const d = fighter();
      const trace: string[] = [];
      let seed = 4;
      const rnd = (): number => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      die(d);
      for (let i = 0; i < 260; i++) {
        if (rnd() < 0.05) d.tap('jump');
        if (rnd() < 0.05) d.tap('attack');
        d.moveX = rnd() < 0.3 ? 1 : 0;
        d.step(1);
        const s = d.session.death.snapshot();
        trace.push([d.session.now, s.phase, s.ticks, d.body.x.toFixed(4), d.p.health.current, d.p.controller.state].join(','));
      }
      return trace;
    };
    const a = run();
    expect(a).toEqual(run());
    expect(new Set(a.map((l) => l.split(',')[1])).size).toBeGreaterThanOrEqual(4); // dying, fadeOut, hold/fadeIn, none
  });
});

describe('events', () => {
  it('player:died is emitted ONCE per death', () => {
    const d = fighter();
    const log: Array<keyof GameEvents> = [];
    d.session.bus.on('player:died', () => void log.push('player:died'));
    die(d);
    strikeOnPlayer(d);
    d.step(30);
    expect(log).toEqual(['player:died']);
  });
});
