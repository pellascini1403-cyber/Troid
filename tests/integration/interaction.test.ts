import { describe, expect, it } from 'vitest';
import { ROOMS } from '@/content';
import { INTERACTION_TEST_ROOM } from '@/content/rooms/interactionTest';
import { createPlayerStatus } from '@/gameplay/PlayerStatus';
import type { GameEvents } from '@/gameplay/events';
import { MAX_INTERACT_LOCK } from '@/interaction/Interactable';
import { strikeOnPlayer } from '../helpers/combat';
import { driver, type Driver } from '../helpers/sim';

/**
 * Contextual interaction end to end through the simulation (docs/GAME-SPEC-2D.md §12): an object in reach has the icon (and
 * only then), Interact performs it, the hero is held in the `interact` pose for at most 12 ticks, a pickup writes the flag that
 * makes it vanish for good, a lever opens the door of its room, and R1's provisional card waits at the end of the crawl tunnel.
 */
const NAMES = [
  'interaction:available', 'interaction:lost', 'interaction:performed', 'card:changed', 'bottle:changed', 'flag:set', 'gate:changed', 'ability:unlocked', 'skill:cast',
] as const;

function setup(room = INTERACTION_TEST_ROOM) {
  const d = driver({ room, unlocked: ['dash'] });
  const log: Array<[string, unknown]> = [];
  for (const k of NAMES) d.session.bus.on(k, (e) => void log.push([k, e]));
  d.settle();
  log.length = 0;
  return { d, s: d.session, log };
}
const events = <K extends keyof GameEvents>(log: Array<[string, unknown]>, k: K): Array<GameEvents[K]> => log.filter(([n]) => n === k).map(([, e]) => e as GameEvents[K]);
const at = (d: Driver, x: number): void => void d.teleport(x, 0).step(2);
const iconOf = (d: Driver): string => {
  const st = createPlayerStatus();
  d.session.status(st);
  return st.interaction.active ? st.interaction.id : '';
};

describe('the icon: only in reach, only when valid', () => {
  it('appears when the hero gets within 1.6 m of the card and not before, announced once, with the verb and the top of the object', () => {
    const { d, s, log } = setup();
    let seenAt = Number.NaN;
    s.bus.on('interaction:available', () => (seenAt = d.body.x));
    d.right();
    d.until(() => iconOf(d) !== '', 400);
    expect(seenAt).toBeGreaterThan(10.3);
    expect(seenAt).toBeLessThan(10.9); // 12 − 1.6 = 10.4, one tick of running later
    d.step(6);
    const available = events(log, 'interaction:available');
    expect(available).toEqual([{ id: 'card_spirit_bolt', kind: 'pickup', verbKey: 'interact.pickUp', x: 12, y: 1.2 }]);
  });

  it('the status carries it for the interface: which object, its verb key and the point its icon is anchored to; nothing when out of reach', () => {
    const { d, s } = setup();
    const st = createPlayerStatus();
    s.status(st);
    expect(st.interaction).toEqual({ active: false, id: '', kind: '', verbKey: '', x: 0, y: 0 });
    at(d, 11);
    s.status(st);
    expect(st.interaction).toEqual({ active: true, id: 'card_spirit_bolt', kind: 'pickup', verbKey: 'interact.pickUp', x: 12, y: 1.2 });
    at(d, 4);
    s.status(st);
    expect(st.interaction.active).toBe(false);
  });

  it('walking away takes it back, announced once', () => {
    const { d, log } = setup();
    at(d, 11);
    at(d, 4);
    expect(log.map(([n]) => n)).toEqual(['interaction:available', 'interaction:lost']);
  });

  it('the dead have no icon', () => {
    const { d, s, log } = setup();
    at(d, 11);
    expect(iconOf(d)).toBe('card_spirit_bolt');
    s.player.health.damage(5);
    s.bus.emit('player:died', { x: 0, y: 0 });
    d.step(2);
    expect(iconOf(d)).toBe('');
    expect(events(log, 'interaction:lost')).toHaveLength(1);
  });
});

describe('Interact with nothing in reach does nothing', () => {
  it('no pose, no events, no change — there is no refusal: the icon is the only cue', () => {
    const { d, s, log } = setup();
    d.tap('interact');
    d.step(30);
    expect(d.p.controller.state).toBe('free');
    expect(log).toEqual([]);
    expect(s.loadout.equipped).toBeNull();
  });
});

describe('performing a pickup', () => {
  it('the press performs it: the card is acquired AND equipped, the ability it teaches unlocks, the flag is written, the icon is gone', () => {
    const { d, s, log } = setup();
    at(d, 11);
    log.length = 0;
    d.tap('interact');
    expect(d.p.controller.state).toBe('interact');
    expect(s.loadout.equipped?.id).toBe('card_spirit_bolt');
    expect(s.abilities.has('magic_attack')).toBe(true);
    expect(s.flags.has('taken:card_spirit_bolt')).toBe(true);
    expect(events(log, 'card:changed')).toEqual([
      { type: 'acquired', cardId: 'card_spirit_bolt' },
      { type: 'equipped', cardId: 'card_spirit_bolt' },
    ]);
    expect(events(log, 'interaction:performed')).toEqual([{ id: 'card_spirit_bolt', kind: 'pickup', verbKey: 'interact.pickUp', x: 12, y: 1.2 }]);
    // the order of the world: performed first, then the icon is lost (the flag it reads is set)
    const order = log.map(([n]) => n).filter((n) => n.startsWith('interaction:'));
    expect(order).toEqual(['interaction:performed', 'interaction:lost']);
    expect(iconOf(d)).toBe('');
  });

  it('the pose holds the control for 12 ticks and then the hero is free: the stick and the jump cannot change it', () => {
    expect(MAX_INTERACT_LOCK).toBe(12);
    const { d } = setup();
    at(d, 11);
    d.tap('interact');
    const x0 = d.body.x;
    d.right();
    d.step(5);
    d.tap('jump');
    d.tap('dash');
    d.step(4); // 11 ticks after the press tick
    expect(d.p.controller.state).toBe('interact');
    expect(d.body.x).toBe(x0);
    expect(d.body.grounded).toBe(true);
    d.step(1);
    expect(d.p.controller.state).toBe('free');
  });

  it('the hero turns to face the object he took', () => {
    const { d } = setup();
    d.teleport(11, 0);
    d.p.facing = -1;
    d.step(2);
    d.tap('interact');
    expect(d.p.facing).toBe(1); // the card is at x = 12
  });

  it('it is taken once: a second press, and a second visit, find nothing; the card is not duplicated', () => {
    const { d, s, log } = setup();
    at(d, 11);
    d.tap('interact');
    d.step(20);
    d.tap('interact');
    d.step(20);
    at(d, 4);
    at(d, 11);
    expect(iconOf(d)).toBe('');
    d.tap('interact');
    d.step(20);
    expect(s.loadout.owned).toEqual(['card_spirit_bolt']);
    expect(events(log, 'interaction:performed')).toHaveLength(1);
  });

  it('the Ability works the moment the pose is over: the Spirit Bolt is cast and costs 30', () => {
    const { d, s, log } = setup();
    at(d, 11);
    d.tap('interact');
    d.step(12);
    expect(d.p.controller.state).toBe('free');
    d.tap('ability');
    d.step(8);
    expect(s.magic.current).toBe(70);
    expect(events(log, 'skill:cast')).toHaveLength(1);
  });

  it('what was taken is kept through a death: the flag stays, the card stays, and the pickup does not come back', () => {
    const { d, s } = setup();
    at(d, 11);
    d.tap('interact');
    d.step(12);
    strikeOnPlayer(d, { damage: 5 });
    d.step(2);
    expect(s.player.health.dead).toBe(true);
    d.until(() => s.death.phase === 'none' && !s.player.health.dead, 600);
    expect(s.loadout.equipped?.id).toBe('card_spirit_bolt');
    expect(s.flags.has('taken:card_spirit_bolt')).toBe(true);
    at(d, 11);
    expect(iconOf(d)).toBe('');
  });

  it('a hit during the pose ends it at once, and what was performed stays performed', () => {
    const { d, s } = setup();
    at(d, 11);
    d.tap('interact');
    d.step(4);
    strikeOnPlayer(d);
    d.step(1);
    expect(d.p.controller.state).toBe('hurt');
    expect(s.loadout.equipped?.id).toBe('card_spirit_bolt');
  });

  it('it can be done crouched, and the hero is crouched again afterwards', () => {
    const { d, s } = setup();
    d.teleport(11, 0);
    d.moveY = -1;
    d.step(8);
    expect(d.p.controller.state).toBe('crouch');
    d.tap('interact');
    expect(d.p.controller.state).toBe('interact');
    d.step(12);
    expect(d.p.controller.state).toBe('crouch');
    expect(d.p.controller.crouched).toBe(true);
    expect(s.loadout.equipped?.id).toBe('card_spirit_bolt');
  });

  it('it needs the ground: a press in mid-air waits for the landing inside the buffer and otherwise expires, leaving the object there', () => {
    const { d, s } = setup();
    at(d, 11);
    d.tap('jump');
    d.step(6);
    expect(d.body.grounded).toBe(false);
    d.tap('interact'); // rising: the landing is far beyond the 0.12 s of the buffer
    d.step(80);
    expect(s.loadout.equipped).toBeNull();
    expect(iconOf(d)).toBe('card_spirit_bolt');
    d.tap('interact');
    expect(s.loadout.equipped?.id).toBe('card_spirit_bolt');
  });

  it('a press made just before reaching the object is not lost: it is answered when the icon appears, inside the buffer', () => {
    const { d, s } = setup();
    d.teleport(10.2, 0);
    d.step(2);
    expect(iconOf(d)).toBe('');
    d.right();
    d.press('interact'); // 0.2 m short of the edge of the reach
    d.step(1);
    d.release('interact');
    d.step(8);
    expect(s.loadout.equipped?.id).toBe('card_spirit_bolt');
  });
});

describe('the nearest object has the icon', () => {
  it('between the card (12) and the bottle slot (14) the closer one; taking it hands the icon to the other', () => {
    const { d, s, log } = setup();
    at(d, 13.4); // card 1.4 away, bottle 0.6 away
    expect(iconOf(d)).toBe('bottle_slot');
    d.tap('interact');
    expect(s.bottles.count).toBe(4); // the reward: a fourth slot
    expect(events(log, 'bottle:changed')[0]).toMatchObject({ type: 'added', slot: 3 });
    d.step(12);
    expect(iconOf(d)).toBe('card_spirit_bolt'); // still within 1.6 m of it
    // and standing exactly between them, the first of the room (equal distance, equal priority)
    at(d, 13);
    expect(iconOf(d)).toBe('card_spirit_bolt');
  });
});

describe('a lever opens the door of its room', () => {
  it('the door is shut, the lever opens it (`gate:changed`), and the hero can walk through; the lever is spent', () => {
    const closed = setup();
    closed.d.teleport(36, 0);
    closed.d.right().step(140);
    expect(closed.d.body.x).toBeLessThan(40); // stopped by the door

    const { d, s, log } = setup();
    at(d, 29);
    expect(iconOf(d)).toBe('lever');
    expect(s.gateOpen('door')).toBe(false);
    d.tap('interact');
    expect(s.flags.has('lever:interaction_test')).toBe(true);
    expect(s.gateOpen('door')).toBe(true);
    expect(events(log, 'gate:changed')).toEqual([{ roomId: 'interaction_test', gateId: 'door', open: true }]);
    d.step(12);
    expect(iconOf(d)).toBe(''); // spent
    d.teleport(36, 0);
    d.right().step(140);
    expect(d.body.x).toBeGreaterThan(42);
  });

  it('a door opens when you interact with IT (kind `open`): shut before, open after, and it stays open', () => {
    const shut = setup();
    shut.d.teleport(42, 0);
    shut.d.right().step(100);
    expect(shut.d.body.x).toBeLessThan(46); // the leaf stops him

    const { d, s, log } = setup();
    at(d, 44);
    expect(iconOf(d)).toBe('door_b');
    expect(s.interaction.current?.kind).toBe('open');
    expect(s.gateOpen('door_b')).toBe(false);
    d.tap('interact');
    expect(s.gateOpen('door_b')).toBe(true);
    expect(events(log, 'gate:changed')).toEqual([{ roomId: 'interaction_test', gateId: 'door_b', open: true }]);
    d.step(12);
    d.right().step(100);
    expect(d.body.x).toBeGreaterThan(48); // through it
    expect(s.flags.has('opened:door_b')).toBe(true);
  });

  it('the lever stays pulled after a death (the flag is the memory)', () => {
    const { d, s } = setup();
    at(d, 29);
    d.tap('interact');
    d.step(12);
    strikeOnPlayer(d, { damage: 5 });
    d.step(2);
    d.until(() => s.death.phase === 'none' && !s.player.health.dead, 600);
    expect(s.gateOpen('door')).toBe(true);
  });
});

describe('R1: nothing to pick up (S28 moved the Spirit Bolt card to R3)', () => {
  const R1 = ROOMS.r1_gate!;

  it('R1 has no interactables at all, and its own door still opens only with the slime\'s defeat', () => {
    const { s } = setup(R1);
    expect(R1.interactables ?? []).toEqual([]);
    expect(s.gateOpen('exit_door')).toBe(false);
    expect(s.flags.has('defeated:r1_slime')).toBe(false);
    expect(R1.gates?.[0]?.openWhen).toBe('defeated:r1_slime');
  });

  it('where the card used to lie — the end of the crawl tunnel — there is no icon, and Interact does nothing: no card, no flag, no pose', () => {
    const { d, s } = setup(R1);
    d.teleport(73.4, 0); // inside the 12 m tunnel, where the card was
    d.moveY = -1;
    d.step(8);
    expect(d.p.controller.state).toBe('crouch');
    expect(s.interaction.current).toBeNull();
    d.tap('interact');
    d.step(12);
    expect(d.p.controller.state).toBe('crouch');
    expect(s.loadout.equipped).toBeNull();
    expect(s.flags.has('taken:card_spirit_bolt')).toBe(false);
    d.tap('ability');
    d.step(10);
    expect(s.magic.current, 'without the card the Ability does nothing').toBe(100);
  });
});

describe('determinism', () => {
  it('the same script of presses gives the same events and the same world, twice', () => {
    const run = (): string => {
      const { d, s, log } = setup();
      const trace: unknown[] = [];
      for (let i = 0; i < 500; i++) {
        if (i === 5) d.right();
        if (i === 60) d.stop();
        if (i === 70) d.tap('interact');
        if (i === 120) d.right();
        if (i === 130) d.tap('interact');
        if (i === 200) d.stop();
        if (i === 260) d.tap('jump');
        if (i === 280) d.tap('interact');
        d.step(1);
        trace.push([d.body.x, d.body.y, d.p.controller.state, s.loadout.equipped?.id ?? null, s.flags.list().join(',')]);
      }
      return JSON.stringify([trace, log]);
    };
    expect(run()).toBe(run());
  });
});
