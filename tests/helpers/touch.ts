import { InputManager } from '@/input/InputManager';
import type { InputFrame } from '@/input/InputFrame';
import { DEFAULT_TOUCH, type TouchConfig } from '@/input/gestures/TouchConfig';
import { TouchSource, type TouchTarget } from '@/input/sources/TouchSource';
import type { GameSession } from '@/gameplay/GameSession';
import { TICK_SECONDS } from '@/core/time';

/**
 * An ABSTRACT touch driver: fingers that touch, drag and lift on the touch layer, producing exactly what the DOM layer
 * would feed `TouchSource` — no browser, no events. Time is the simulation's: one tick is 1/60 s, and a pointer event is
 * stamped with the tick it happens in, so a flick that takes 5 ticks took 83 ms (the drop gesture depends on it).
 */
export class TouchRig {
  readonly input = new InputManager();
  readonly touch: TouchSource;
  private ticks = 0;

  constructor(
    readonly session: GameSession | null = null,
    cfg: Readonly<TouchConfig> = DEFAULT_TOUCH,
    scale = 1,
  ) {
    this.touch = new TouchSource(this.input, cfg, () => scale);
  }

  /** Milliseconds of simulated time (pointer events carry it). */
  get now(): number {
    return this.ticks * TICK_SECONDS * 1000;
  }

  finger(id: number): Finger {
    return new Finger(this, id);
  }

  /** One input frame, as the game loop would sample it for the next tick (the manager reuses the object: read it at once). */
  frame(): Readonly<InputFrame> {
    return this.input.sample();
  }

  /** Advances time by `n` ticks. With a session, the simulation consumes the frames; without, they are only sampled. */
  step(n = 1): this {
    for (let i = 0; i < n; i++) {
      const f = this.input.sample();
      this.session?.tick(f);
      this.ticks++;
    }
    return this;
  }
}

export class Finger {
  private x = 0;
  private y = 0;

  constructor(
    private readonly rig: TouchRig,
    readonly id: number,
  ) {}

  down(target: TouchTarget, x: number, y: number): this {
    this.x = x;
    this.y = y;
    this.rig.touch.down(this.id, target, x, y, this.rig.now);
    return this;
  }

  /** Drags to an absolute position now. */
  to(x: number, y: number): this {
    this.x = x;
    this.y = y;
    this.rig.touch.move(this.id, x, y, this.rig.now);
    return this;
  }

  /** Drags by `(dx, dy)` from where the finger is, spread evenly over `ticks` ticks of simulated time (a slow drag or a flick). */
  drag(dx: number, dy: number, ticks = 1): this {
    const x0 = this.x;
    const y0 = this.y;
    for (let i = 1; i <= ticks; i++) {
      this.rig.step(1);
      this.to(x0 + (dx * i) / ticks, y0 + (dy * i) / ticks);
    }
    return this;
  }

  up(): this {
    this.rig.touch.up(this.id);
    return this;
  }

  cancel(): this {
    this.rig.touch.cancel(this.id);
    return this;
  }
}
