import { DEFAULT_TOUCH, type TouchConfig } from '../gestures/TouchConfig';
import { TouchGestureRecognizer, type GestureSink, type GestureState } from '../gestures/TouchGestureRecognizer';
import type { InputManager } from '../InputManager';

/**
 * What a finger can land on (GAME-SPEC-2D §4.3): the invisible movement zone, the three fixed buttons, the contextual
 * interaction icon, the contextual bottle chip and the bottle icons of the HUD (`bottle:<slot>`).
 */
export type TouchTarget = 'zone' | 'attack' | 'dash' | 'ability' | 'interact' | 'bottle' | `bottle:${number}`;

const SOURCE = 'touch';

/**
 * Touch → InputManager, with SINGLE OWNERSHIP of every finger (docs/GAME-SPEC-2D.md §4.3.7): a finger has one owner from
 * the moment it touches down until it lifts (or is cancelled), and it cannot change owner; a movement gesture never cancels
 * an attack or a dash, nor the other way round; a second finger on a button or in the zone that is already taken is ignored.
 *
 * It decides nothing about the game: the buttons become `attack` / `dash` / `ability` actions, the zone feeds the gesture
 * recognizer, the icons become `interact` / bottle requests. The DOM layer (`ui/touch/TouchControls`) only translates its
 * pointer events into `down` / `move` / `up` calls here, so everything below is testable without a browser.
 */
export class TouchSource {
  private readonly owners = new Map<number, TouchTarget>();
  private readonly buttonOwner = new Map<TouchTarget, number>();
  private readonly recognizer: TouchGestureRecognizer;

  constructor(
    private readonly input: InputManager,
    cfg: Readonly<TouchConfig> = DEFAULT_TOUCH,
    scale: () => number = () => 1,
  ) {
    // each axis of a touch drag means something of its own (run speed / crouch): clamp them separately (axis contract)
    input.registerSource(SOURCE, 'touch', 'independent');
    const sink: GestureSink = {
      move: (x, y) => input.setAxis(SOURCE, x, y),
      jump: (down) => input.setAction(SOURCE, 'jump', down),
      drop: () => {
        input.setAction(SOURCE, 'drop', true);
        input.setAction(SOURCE, 'drop', false);
      },
    };
    this.recognizer = new TouchGestureRecognizer(sink, cfg, scale);
  }

  /** Fingers that currently own something. */
  get active(): number {
    return this.owners.size;
  }

  ownerOf(pointerId: number): TouchTarget | undefined {
    return this.owners.get(pointerId);
  }

  /** The movement gesture right now (the debug viewer reads it). */
  get gesture(): Readonly<GestureState> {
    return this.recognizer.state;
  }

  /** A finger touched `target`. True when it now owns it; false when it was ignored (it already owns something, or the target is taken). */
  down(pointerId: number, target: TouchTarget, x: number, y: number, t: number): boolean {
    if (this.owners.has(pointerId)) return false;
    if (target === 'zone') {
      if (!this.recognizer.down(pointerId, x, y, t)) return false;
    } else if (target === 'attack' || target === 'dash' || target === 'ability' || target === 'interact') {
      if (this.buttonOwner.has(target)) return false;
      this.buttonOwner.set(target, pointerId);
      this.input.setAction(SOURCE, target, true);
    } else {
      // a bottle: the contextual chip drinks the next ready one, a HUD icon drinks its own
      this.input.requestBottle(SOURCE, target === 'bottle' ? -1 : Number(target.slice('bottle:'.length)));
    }
    this.owners.set(pointerId, target);
    return true;
  }

  /** A finger moved. Only the movement finger cares: a button keeps its press however far the finger drifts. */
  move(pointerId: number, x: number, y: number, t: number): void {
    if (this.owners.get(pointerId) === 'zone') this.recognizer.move(pointerId, x, y, t);
  }

  /** A finger lifted (or its touch was cancelled): it lets go of whatever it held. */
  up(pointerId: number): void {
    const target = this.owners.get(pointerId);
    if (target === undefined) return;
    this.owners.delete(pointerId);
    if (target === 'zone') this.recognizer.up(pointerId);
    else if (target === 'attack' || target === 'dash' || target === 'ability' || target === 'interact') {
      this.buttonOwner.delete(target);
      this.input.setAction(SOURCE, target, false);
    }
  }

  cancel(pointerId: number): void {
    this.up(pointerId);
  }

  /** Window blur, the app was hidden, the device rotated, the game paused: no finger owns anything any more. Nothing stays pressed. */
  releaseAll(): void {
    this.recognizer.release();
    this.owners.clear();
    this.buttonOwner.clear();
    this.input.releaseSource(SOURCE);
  }
}
