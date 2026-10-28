import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS } from '@/input/bindings';
import { InputManager } from '@/input/InputManager';
import { DEFAULT_TOUCH } from '@/input/gestures/TouchConfig';
import { attachGamepad } from '@/input/sources/GamepadSource';
import type { GameSession } from '@/gameplay/GameSession';
import { DEFAULT_MOVEMENT } from '@/player/MovementTuning';
import { FakePad, PAD, padList } from '../helpers/gamepad';
import { ground, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { lab } from '../helpers/lab';
import { makeSession } from '../helpers/sim';
import { TouchRig, type Finger } from '../helpers/touch';

/**
 * THE FOUR MOVES THE HERO LEARNS, WITH THE FINGERS AND WITH THE PAD (docs/PROMPT22-LOG.md §6). `movementAbilities.test.ts` proves what the Double Jump, the Wall Jump, the Ground Slam and the Air Dash DO, with the keys; until Prompt 22 nothing proved
 * that a phone or a pad could ASK for them — and the Ground Slam asks for a combination (down, and attack, in the air). Here the same moves are made with each device's own gestures — the thumb dragged up and brought back and dragged up again, held down
 * while the other thumb taps attack; the stick pulled down and X — in the room drawn for them, and must have the effect they have with the keys.
 */
interface Hand {
  /** Everything a person's hands can say, in the terms of the game: run to a side (−1, 0, 1), hold crouch/down, hold jump, tap attack, tap dash. */
  run(dir: -1 | 0 | 1): void;
  down(on: boolean): void;
  jump(on: boolean): void;
  tapAttack(): void;
  tapDash(): void;
  step(n?: number): void;
  readonly session: GameSession;
}

/** Where a hero is put: on the floor at `x`, or in the air at `(x, y)`, with the lab's entry. */
function put(session: GameSession, x: number, y: number): void {
  session.player.respawn(x, y, 1);
  session.collision.probeGround(session.player.body);
}

/** A floor a long way under the hero: three dashes fit in the fall (the Air Dash's room, `airDash.test.ts`). */
const SKY: RoomDefinition = { id: 'sky', regionId: 't', name: 'Sky', bounds: rect(-5, -20, 200, 60), killY: -30, entries: [{ id: 's', x: 10, y: 0 }], solids: [ground('a', -5, 200)] };

function padHand(abilities: string[], entry = 'start', room: RoomDefinition = lab()): Hand {
  const session = makeSession({ room, unlocked: abilities, entry, extra: { rooms: { [room.id]: room } } });
  const input = new InputManager();
  const pad = new FakePad();
  attachGamepad(input, () => structuredClone(DEFAULT_BINDINGS), padList(pad).provider);
  let dir = 0;
  let down = false;
  const stick = (): void => void pad.stick(dir, down ? 1 : 0); // (+y of the stick is DOWN)
  const hand: Hand = {
    session,
    run: (d) => {
      dir = d;
      stick();
    },
    down: (on) => {
      down = on;
      stick();
    },
    jump: (on) => (on ? pad.press(PAD.A) : pad.release(PAD.A)),
    tapAttack: () => {
      pad.press(PAD.X);
      hand.step(1);
      pad.release(PAD.X);
    },
    tapDash: () => {
      pad.press(PAD.B);
      hand.step(1);
      pad.release(PAD.B);
    },
    step: (n = 1) => {
      for (let i = 0; i < n; i++) session.tick(input.sample());
    },
  };
  hand.step(20);
  return hand;
}

/** The thumb on the left half of the screen (drag: run, up: jump, down: crouch) and the other on the buttons at the right. */
const ZONE = { x: 120, y: 300 };
const ATTACK = { x: 700, y: 300 };
const DASH = { x: 640, y: 340 };

function touchHand(abilities: string[], entry = 'start', room: RoomDefinition = lab()): Hand {
  const session = makeSession({ room, unlocked: abilities, entry, extra: { rooms: { [room.id]: room } } });
  const rig = new TouchRig(session);
  const thumb: Finger = rig.finger(1).down('zone', ZONE.x, ZONE.y);
  let dir = 0;
  let down = false;
  let up = false;
  const place = (ticks: number): void => {
    const x = ZONE.x + dir * DEFAULT_TOUCH.rx * 1.2;
    const y = ZONE.y + (down ? 0.85 * DEFAULT_TOUCH.ry : 0) - (up ? 0.9 * DEFAULT_TOUCH.ry : 0);
    // (a drag down that is quick is a flick, which is another gesture: the finger goes there over a few ticks, as a thumb does)
    const here = thumbAt;
    for (let i = 1; i <= ticks; i++) {
      rig.step(1);
      thumb.to(here.x + ((x - here.x) * i) / ticks, here.y + ((y - here.y) * i) / ticks);
    }
    thumbAt = { x, y };
  };
  let thumbAt = { x: ZONE.x, y: ZONE.y };
  let n = 0;
  const hand: Hand = {
    session,
    run: (d) => {
      dir = d;
      place(2);
    },
    down: (on) => {
      down = on;
      place(8);
    },
    jump: (on) => {
      up = on;
      place(3);
    },
    tapAttack: () => {
      const f = rig.finger(10 + n++).down('attack', ATTACK.x, ATTACK.y);
      rig.step(1);
      f.up();
    },
    tapDash: () => {
      const f = rig.finger(10 + n++).down('dash', DASH.x, DASH.y);
      rig.step(1);
      f.up();
    },
    step: (k = 1) => void rig.step(k),
  };
  hand.step(20);
  return hand;
}

const DEVICES: ReadonlyArray<readonly [string, (abilities: string[], entry?: string, room?: RoomDefinition) => Hand]> = [
  ['the pad', padHand],
  ['the fingers', touchHand],
];

describe.each(DEVICES)('the moves of the air, with %s', (_name, make) => {
  it('the Double Jump: a jump from the floor, and — the button let go of, and pressed again at the top — one more in the air, and only one', () => {
    const h = make(['double_jump']);
    const jumps: boolean[] = [];
    h.session.bus.on('player:jumped', (e) => jumps.push(e.air));
    const body = h.session.player.body;
    h.jump(true);
    h.step(14);
    expect(body.vy, 'rising').toBeGreaterThan(0);
    h.jump(false);
    h.step(4);
    h.jump(true); // again, in the air
    let top = body.y;
    for (let i = 0; i < 80; i++) {
      h.step(1);
      top = Math.max(top, body.y);
    }
    expect(jumps, 'a jump from the floor and one in the air').toEqual([false, true]);
    expect(top - 2, 'higher than one jump (3.1 m) can reach').toBeGreaterThan(4.5);
  });

  it('...and a third press in the air has nothing left', () => {
    const h = make(['double_jump']);
    const jumps: boolean[] = [];
    h.session.bus.on('player:jumped', (e) => jumps.push(e.air));
    h.jump(true);
    h.step(14);
    h.jump(false);
    h.step(4);
    h.jump(true);
    h.step(10);
    h.jump(false);
    h.step(3);
    h.jump(true); // a third press, still in the air
    h.step(10);
    expect(h.session.player.body.grounded).toBe(false);
    expect(jumps).toEqual([false, true]);
  });

  it('without it the second press in the air does nothing', () => {
    const h = make(['dash']);
    const jumps: boolean[] = [];
    h.session.bus.on('player:jumped', (e) => jumps.push(e.air));
    h.jump(true);
    h.step(14);
    h.jump(false);
    h.step(4);
    h.jump(true);
    h.step(30);
    expect(jumps).toEqual([false]);
  });

  it('the Wall Jump: leaning on the wall in the air is a slide, and the jump gesture kicks off it — up, and away', () => {
    const h = make(['wall_jump'], 'shaft');
    put(h.session, 20.5, 12);
    const body = h.session.player.body;
    h.run(-1);
    h.step(30);
    expect(h.session.player.controller.wallSliding, 'a slide down the wall').toBe(true);
    expect(body.vy).toBeGreaterThanOrEqual(-3.45);
    h.jump(true);
    h.step(2);
    expect(body.vy, 'thrown upward').toBeGreaterThan(6);
    expect(body.vx, 'and away from the wall').toBeGreaterThan(5);
    expect(h.session.player.facing).toBe(1);
  });

  it('the Ground Slam: in the air, down and attack — a hover, a dive, and the shockwave on the floor', () => {
    const h = make(['ground_slam'], 'slam');
    const slams: number[] = [];
    h.session.bus.on('player:slammed', (e) => slams.push(e.y));
    put(h.session, 14, 8);
    h.step(2);
    h.down(true);
    h.tapAttack();
    h.step(1);
    expect(h.session.player.controller.state, 'the slam, not the plain blow').toBe('slam');
    for (let i = 0; i < 90 && slams.length === 0; i++) h.step(1);
    expect(slams.length, 'the shockwave').toBe(1);
    expect(slams[0]).toBeCloseTo(2, 1);
  });

  it('without it, the same gesture is the plain blow in the air', () => {
    const h = make(['dash'], 'slam');
    put(h.session, 14, 8);
    h.step(2);
    h.down(true);
    h.tapAttack();
    h.step(1);
    expect(h.session.player.controller.state).toBe('attack');
  });

  it('the Air Dash: two dashes in the air, and no third; one only without it', () => {
    const dashes = (abilities: string[]): number => {
      const h = make(abilities, 's', SKY);
      put(h.session, 10, 45);
      h.step(2);
      const air: boolean[] = [];
      h.session.bus.on('player:dashed', (e) => air.push(e.air));
      h.run(1);
      for (let i = 0; i < 3; i++) {
        h.tapDash();
        h.step(Math.ceil((DEFAULT_MOVEMENT.dash.duration + DEFAULT_MOVEMENT.dash.cooldown) * 60) + 2);
      }
      expect(air.every(Boolean), 'all of them in the air').toBe(true);
      return air.length;
    };
    expect(dashes(['dash', 'air_dash'])).toBe(2);
    expect(dashes(['dash'])).toBe(1);
  });
});
