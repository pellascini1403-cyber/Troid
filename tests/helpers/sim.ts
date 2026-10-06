import { createInputFrame, type InputFrame } from '@/input/InputFrame';
import { GameSession, type SessionOptions } from '@/gameplay/GameSession';
import { ABILITIES } from '@/content/abilities';
import { ENEMIES } from '@/content/enemies';
import { PLAYER } from '@/content/player';
import { MOVEMENT_TEST_ROOM } from '@/content/rooms/movementTest';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { log } from '@/core/log';

log.setSink(() => {}); // the simulation logs warnings by design (fallbacks, unknown ids); keep test output readable

export type Button = 'jump' | 'attack' | 'dash' | 'ability';

export interface MakeOptions {
  room?: RoomDefinition;
  unlocked?: string[];
  entry?: string;
  seed?: number;
  extra?: Partial<SessionOptions>;
}

export function makeSession(opts: MakeOptions = {}): GameSession {
  const room = opts.room ?? MOVEMENT_TEST_ROOM;
  const session = new GameSession({
    rooms: { [room.id]: room },
    player: PLAYER,
    abilities: ABILITIES,
    startRoom: room.id,
    startEntry: opts.entry,
    seed: opts.seed ?? 1,
    unlocked: opts.unlocked ?? [],
    enemies: ENEMIES,
    ...opts.extra,
  });
  session.bus.onError = (e) => {
    throw e; // a throwing event handler must fail the test, not be swallowed
  };
  return session;
}

/**
 * Scripted player: holds buttons / axes and advances the session tick by tick, producing exactly the
 * InputFrame a real device would (edges only on the tick they happen).
 */
export class Driver {
  moveX = 0;
  moveY = 0;
  private held: Record<Button, boolean> = { jump: false, attack: false, dash: false, ability: false };
  private pressed: Record<Button, boolean> = { jump: false, attack: false, dash: false, ability: false };
  private released: Record<Button, boolean> = { jump: false, attack: false, dash: false, ability: false };
  private readonly frame: InputFrame = createInputFrame();
  /** Sees every frame just before the session does: how a playthrough is RECORDED (tools/e2e replays it in a browser). */
  onFrame: ((frame: Readonly<InputFrame>) => void) | null = null;
  /**
   * Make the frames exactly what a KEYBOARD produces: `InputManager` clamps the stick to the unit circle, so holding right and
   * down together is (0.707, −0.707), not (1, −1). Off by default (the movement and crouch tests were written against raw
   * axes); on for the recordings that a browser replays with real key presses.
   */
  keyboardLike = false;

  constructor(readonly session: GameSession) {}

  get p() {
    return this.session.player;
  }
  get body() {
    return this.session.player.body;
  }

  press(b: Button): this {
    if (!this.held[b]) this.pressed[b] = true;
    this.held[b] = true;
    return this;
  }
  release(b: Button): this {
    if (this.held[b]) this.released[b] = true;
    this.held[b] = false;
    return this;
  }
  /** Press for exactly one tick, then release. */
  tap(b: Button): this {
    this.press(b);
    this.step(1);
    this.release(b);
    return this;
  }
  right(): this {
    this.moveX = 1;
    return this;
  }
  left(): this {
    this.moveX = -1;
    return this;
  }
  stop(): this {
    this.moveX = 0;
    this.moveY = 0;
    return this;
  }

  step(n = 1): this {
    for (let i = 0; i < n; i++) {
      const f = this.frame;
      f.move.x = this.moveX;
      f.move.y = this.moveY;
      if (this.keyboardLike) {
        const len = Math.hypot(f.move.x, f.move.y);
        if (len > 1) {
          f.move.x /= len;
          f.move.y /= len;
        }
      }
      f.jumpPressed = this.pressed.jump;
      f.jumpHeld = this.held.jump;
      f.jumpReleased = this.released.jump;
      f.attackPressed = this.pressed.attack;
      f.attackHeld = this.held.attack;
      f.dashPressed = this.pressed.dash;
      f.dashHeld = this.held.dash;
      f.abilityPressed = this.pressed.ability;
      f.abilityHeld = this.held.ability;
      f.pausePressed = false;
      this.onFrame?.(f);
      this.session.tick(f);
      for (const k of Object.keys(this.pressed) as Button[]) {
        this.pressed[k] = false;
        this.released[k] = false;
      }
    }
    return this;
  }

  /** Steps until `cond` is true (checked after every tick). Returns the ticks used; throws if it never happens. */
  until(cond: () => boolean, max = 600): number {
    for (let i = 0; i < max; i++) {
      if (cond()) return i;
      this.step(1);
    }
    if (cond()) return max;
    throw new Error(`condition not reached within ${max} ticks (x=${this.body.x.toFixed(2)}, y=${this.body.y.toFixed(2)})`);
  }

  /** Lets the player settle on the ground. */
  settle(): this {
    this.until(() => this.body.grounded, 120);
    return this;
  }

  teleport(x: number, y: number): this {
    this.session.player.respawn(x, y, this.session.player.facing);
    this.session.collision.probeGround(this.body);
    return this;
  }
}

export function driver(opts: MakeOptions = {}): Driver {
  return new Driver(makeSession(opts));
}
