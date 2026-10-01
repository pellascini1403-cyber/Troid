import { log } from './log';

export interface StateHooks<C, Id extends string> {
  enter?(ctx: C, from: Id | null): void;
  /** `ticksInState` is 0 on the first update after entering the state. */
  update?(ctx: C, ticksInState: number): void;
  exit?(ctx: C, to: Id): void;
}

const MAX_CHAINED_TRANSITIONS = 8;

/**
 * Small, explicit finite-state machine shared by the player, enemies, bosses and arenas.
 *
 * - `go()` outside `update()` transitions immediately; inside `update()` (or inside enter/exit) it is
 *   deferred until the hook returns, so a state's code always finishes under the state that started it.
 *   Write `go(...); return;` in hooks.
 * - `go(current)` is ignored unless `force` is set (re-entering the same state restarts it).
 * - `onChange` is the single hook the animation / event layers use to observe the machine.
 *
 * The constructor runs `enter` of the initial state.
 */
export class StateMachine<C, Id extends string> {
  private _current: Id;
  private _previous: Id | null = null;
  private _ticks = 0;
  private pending: { id: Id; force: boolean } | null = null;
  private busy = false;
  /** Incremented on every transition. */
  private generation = 0;

  onChange: ((from: Id | null, to: Id) => void) | null = null;

  constructor(
    private readonly ctx: C,
    private readonly states: Readonly<Record<Id, StateHooks<C, Id>>>,
    initial: Id,
  ) {
    this._current = initial;
    this.busy = true;
    this.states[initial].enter?.(ctx, null);
    this.busy = false;
    this.flush();
  }

  get current(): Id {
    return this._current;
  }
  get previous(): Id | null {
    return this._previous;
  }
  get ticksInState(): number {
    return this._ticks;
  }
  is(...ids: Id[]): boolean {
    return ids.includes(this._current);
  }

  go(id: Id, force = false): void {
    if (this.busy) {
      this.pending = { id, force };
      return;
    }
    this.transition(id, force);
    this.flush();
  }

  update(): void {
    const generation = this.generation;
    this.busy = true;
    this.states[this._current].update?.(this.ctx, this._ticks);
    this.busy = false;
    this.flush();
    // Count this tick only if no transition happened (even an A → B → A chain restarts the counter).
    if (this.generation === generation) this._ticks++;
  }

  private flush(): void {
    let guard = 0;
    while (this.pending) {
      const { id, force } = this.pending;
      this.pending = null;
      if (++guard > MAX_CHAINED_TRANSITIONS) {
        log.scope('fsm').warn(`more than ${MAX_CHAINED_TRANSITIONS} chained transitions; stopped at "${this._current}"`);
        return;
      }
      this.transition(id, force);
    }
  }

  private transition(to: Id, force: boolean): void {
    if (to === this._current && !force) return;
    const from = this._current;
    this.busy = true;
    this.states[from].exit?.(this.ctx, to);
    this._previous = from;
    this._current = to;
    this._ticks = 0;
    this.generation++;
    this.states[to].enter?.(this.ctx, from);
    this.busy = false;
    this.onChange?.(from, to);
  }
}
