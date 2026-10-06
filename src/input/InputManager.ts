import { clamp } from '@/core/math';
import { createInputFrame, type Action, type InputDevice, type InputFrame } from './InputFrame';

/**
 * How a source's analog axes are clamped (the axis contract of `InputFrame`):
 *  - `radial`: the pair is ONE vector (a thumb-stick) and never leaves the unit disc;
 *  - `independent`: each axis means something different (a touch drag: run speed / crouch) and is clamped on its own, so a
 *    firm push right never slows down because a finger is also pointing down.
 * Digital actions (keys, D-pad) are always independent: they are exactly −1 / 0 / 1 per axis.
 */
export type AxisMode = 'radial' | 'independent';

interface AxisState {
  source: string;
  x: number;
  y: number;
}

/**
 * Aggregates any number of devices into one `InputFrame` per simulation tick.
 *
 * Devices never talk to gameplay; they call `setAction` / `setAxis` with their own `source` id. The manager:
 *  - ORs the held state across sources (releasing a key does not cancel a touch button still held),
 *  - latches press / release edges until the next `sample()` so short taps survive between ticks,
 *  - takes the strongest analog axis across sources (clamped per the source's `AxisMode`),
 *  - remembers the last device used (prompts adapt: "Shift" vs "B" vs a touch icon).
 */
export class InputManager {
  private readonly held = new Map<Action, Set<string>>();
  private readonly pressedLatch = new Set<Action>();
  private readonly releasedLatch = new Set<Action>();
  private readonly axes = new Map<string, AxisState>();
  /** The same states as `axes`, in an array: `sample()` walks it every tick without allocating an iterator. */
  private readonly axisList: AxisState[] = [];
  private readonly deviceOf = new Map<string, InputDevice>();
  private readonly modeOf = new Map<string, AxisMode>();
  private lastDevice: InputDevice = 'keyboard';
  private readonly frame: InputFrame = createInputFrame();
  /** The slot a HUD icon asked for (−1: none, "the next ready one"); read and cleared by the next `sample()`. */
  private bottleSlotRequest = -1;

  /** Polled devices (gamepad) register a callback that runs at the start of every `sample()`. */
  private readonly pollers: Array<() => void> = [];

  registerSource(source: string, device: InputDevice, axes: AxisMode = 'radial'): void {
    this.deviceOf.set(source, device);
    this.modeOf.set(source, axes);
  }

  addPoller(poll: () => void): () => void {
    this.pollers.push(poll);
    return () => {
      const i = this.pollers.indexOf(poll);
      if (i >= 0) this.pollers.splice(i, 1);
    };
  }

  setAction(source: string, action: Action, down: boolean): void {
    let set = this.held.get(action);
    if (!set) this.held.set(action, (set = new Set()));
    const wasDown = set.size > 0;
    if (down) set.add(source);
    else set.delete(source);
    const isDown = set.size > 0;
    if (isDown && !wasDown) this.pressedLatch.add(action);
    if (!isDown && wasDown) this.releasedLatch.add(action);
    if (down) this.lastDevice = this.deviceOf.get(source) ?? this.lastDevice;
  }

  /**
   * Drink a bottle on behalf of `source` (a tap on a HUD icon): `slot` −1 is "the next one that is ready", 0.. a specific
   * slot. The request is an edge like any other press: it survives until the next `sample()`.
   */
  requestBottle(source: string, slot = -1): void {
    this.bottleSlotRequest = slot;
    this.pressedLatch.add('bottle');
    this.lastDevice = this.deviceOf.get(source) ?? this.lastDevice;
  }

  /** `source` was just used without pressing anything (a finger resting on the screen): the prompts follow it. */
  noteUse(source: string): void {
    this.lastDevice = this.deviceOf.get(source) ?? this.lastDevice;
  }

  setAxis(source: string, x: number, y: number): void {
    let a = this.axes.get(source);
    if (a) {
      a.x = x;
      a.y = y;
    } else {
      a = { source, x, y };
      this.axes.set(source, a);
      this.axisList.push(a);
    }
    if ((x !== 0 || y !== 0) && this.deviceOf.has(source)) this.lastDevice = this.deviceOf.get(source) as InputDevice;
  }

  isHeld(action: Action): boolean {
    return (this.held.get(action)?.size ?? 0) > 0;
  }

  /** Releases everything held by `source` (window blur, pointer cancel, pad disconnected): no stuck inputs. */
  releaseSource(source: string): void {
    for (const action of [...this.held.keys()]) this.setAction(source, action, false);
    const a = this.axes.get(source);
    if (a) a.x = a.y = 0;
  }

  releaseAll(): void {
    for (const source of new Set([...this.held.values()].flatMap((s) => [...s]))) this.releaseSource(source);
    for (const a of this.axisList) a.x = a.y = 0;
  }

  /**
   * Builds the frame for ONE simulation tick. The returned object is reused (no per-tick allocation):
   * read it immediately, do not keep it.
   */
  sample(): InputFrame {
    for (const poll of this.pollers) poll();
    const f = this.frame;

    // movement: digital directions (independent axes) + analog axes (clamped per source), the strongest of each axis wins
    let dx = (this.isHeld('right') ? 1 : 0) - (this.isHeld('left') ? 1 : 0);
    let dy = (this.isHeld('up') ? 1 : 0) - (this.isHeld('down') ? 1 : 0);
    if (this.isHeld('walk') && dx !== 0) dx *= 0.5;
    for (const a of this.axisList) {
      let ax = a.x;
      let ay = a.y;
      if (this.modeOf.get(a.source) !== 'independent') {
        const len = Math.hypot(ax, ay);
        if (len > 1) {
          ax /= len;
          ay /= len;
        }
      }
      if (Math.abs(ax) > Math.abs(dx)) dx = ax;
      if (Math.abs(ay) > Math.abs(dy)) dy = ay;
    }
    f.move.x = clamp(dx, -1, 1);
    f.move.y = clamp(dy, -1, 1);

    f.jumpHeld = this.isHeld('jump');
    f.jumpPressed = this.pressedLatch.has('jump');
    f.jumpReleased = this.releasedLatch.has('jump');
    f.attackHeld = this.isHeld('attack');
    f.attackPressed = this.pressedLatch.has('attack');
    f.dashHeld = this.isHeld('dash');
    f.dashPressed = this.pressedLatch.has('dash');
    f.abilityHeld = this.isHeld('ability');
    f.abilityPressed = this.pressedLatch.has('ability');
    f.bottlePressed = this.pressedLatch.has('bottle');
    f.bottleSlot = f.bottlePressed ? this.bottleSlotRequest : -1;
    f.interactPressed = this.pressedLatch.has('interact');
    f.dropPressed = this.pressedLatch.has('drop');
    f.pausePressed = this.pressedLatch.has('pause');
    f.device = this.lastDevice;

    this.pressedLatch.clear();
    this.releasedLatch.clear();
    this.bottleSlotRequest = -1;
    return f;
  }

  // Convenience accessors for non-simulation code (UI, debug). They reflect the LAST sampled frame.
  get move() {
    return this.frame.move;
  }
  get jumpPressed() {
    return this.frame.jumpPressed;
  }
  get attackPressed() {
    return this.frame.attackPressed;
  }
  get dashPressed() {
    return this.frame.dashPressed;
  }
  get abilityPressed() {
    return this.frame.abilityPressed;
  }
  get device(): InputDevice {
    return this.lastDevice;
  }
}
