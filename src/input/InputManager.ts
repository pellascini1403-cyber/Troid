import { clamp } from '@/core/math';
import { createInputFrame, type Action, type InputDevice, type InputFrame } from './InputFrame';

/**
 * Aggregates any number of devices into one `InputFrame` per simulation tick.
 *
 * Devices never talk to gameplay; they call `setAction` / `setAxis` with their own `source` id. The manager:
 *  - ORs the held state across sources (releasing a key does not cancel a touch button still held),
 *  - latches press / release edges until the next `sample()` so short taps survive between ticks,
 *  - takes the strongest analog axis across sources,
 *  - remembers the last device used (prompts adapt: "Shift" vs "B" vs a touch icon).
 */
export class InputManager {
  private readonly held = new Map<Action, Set<string>>();
  private readonly pressedLatch = new Set<Action>();
  private readonly releasedLatch = new Set<Action>();
  private readonly axes = new Map<string, { x: number; y: number }>();
  private readonly deviceOf = new Map<string, InputDevice>();
  private lastDevice: InputDevice = 'keyboard';
  private readonly frame: InputFrame = createInputFrame();

  /** Polled devices (gamepad) register a callback that runs at the start of every `sample()`. */
  private readonly pollers: Array<() => void> = [];

  registerSource(source: string, device: InputDevice): void {
    this.deviceOf.set(source, device);
  }

  addPoller(poll: () => void): void {
    this.pollers.push(poll);
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

  setAxis(source: string, x: number, y: number): void {
    const a = this.axes.get(source);
    if (a) {
      a.x = x;
      a.y = y;
    } else {
      this.axes.set(source, { x, y });
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
    for (const a of this.axes.values()) a.x = a.y = 0;
  }

  /**
   * Builds the frame for ONE simulation tick. The returned object is reused (no per-tick allocation):
   * read it immediately, do not keep it.
   */
  sample(): InputFrame {
    for (const poll of this.pollers) poll();
    const f = this.frame;

    // movement: digital directions + analog axes, strongest wins, then clamped to the unit circle
    let dx = (this.isHeld('right') ? 1 : 0) - (this.isHeld('left') ? 1 : 0);
    let dy = (this.isHeld('up') ? 1 : 0) - (this.isHeld('down') ? 1 : 0);
    if (this.isHeld('walk') && dx !== 0) dx *= 0.5;
    for (const a of this.axes.values()) {
      if (Math.abs(a.x) > Math.abs(dx)) dx = a.x;
      if (Math.abs(a.y) > Math.abs(dy)) dy = a.y;
    }
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
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
    f.pausePressed = this.pressedLatch.has('pause');
    f.device = this.lastDevice;

    this.pressedLatch.clear();
    this.releasedLatch.clear();
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
