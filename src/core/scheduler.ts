export interface TimerHandle {
  readonly id: number;
}

interface Timer {
  id: number;
  due: number;
  seq: number;
  fn: () => void;
  interval: number; // 0 → one-shot
  owner: object | undefined;
  cancelled: boolean;
}

/**
 * Timers measured in **simulation ticks**, not wall-clock time.
 *
 * Gameplay never uses `setTimeout` / `setInterval` (the architecture test forbids it): real timers keep
 * firing while the game is paused, during hit-stop and after a room is unloaded. Scheduler timers
 * only advance when `tick()` is called, and every timer can be given an *owner* so that
 * `cancelOwner(room)` / `cancelOwner(entity)` removes everything it scheduled.
 *
 * `after(n)` fires `n` ticks from now, at least 1 (a timer can never fire in the tick that created it,
 * which makes `after(0)` inside a callback safe).
 */
export class Scheduler {
  private current = 0;
  private seq = 0;
  private nextId = 1;
  private queue: Timer[] = []; // sorted by (due, seq)
  private readonly byId = new Map<number, Timer>();

  /** Current simulation tick. */
  get now(): number {
    return this.current;
  }
  /** Number of live (not fired, not cancelled) timers — tests assert this returns to baseline. */
  get pending(): number {
    return this.byId.size;
  }

  after(ticks: number, fn: () => void, owner?: object): TimerHandle {
    return this.schedule(ticks, fn, 0, owner);
  }

  /** Repeats every `ticks` ticks until cancelled (via the handle, the owner, or the `stop()` passed to `fn`). */
  every(ticks: number, fn: (stop: () => void) => void, owner?: object): TimerHandle {
    const handle: TimerHandle = this.schedule(ticks, () => fn(() => this.cancel(handle)), Math.max(1, Math.floor(ticks)), owner);
    return handle;
  }

  cancel(handle: TimerHandle | null | undefined): void {
    if (!handle) return;
    const timer = this.byId.get(handle.id);
    if (!timer) return;
    timer.cancelled = true;
    this.byId.delete(handle.id);
  }

  cancelOwner(owner: object): number {
    let n = 0;
    for (const timer of this.byId.values()) {
      if (timer.owner === owner) {
        timer.cancelled = true;
        this.byId.delete(timer.id);
        n++;
      }
    }
    return n;
  }

  clear(): void {
    for (const t of this.queue) t.cancelled = true;
    this.queue = [];
    this.byId.clear();
  }

  /** Advances one tick and runs every timer that has become due, in creation order. */
  tick(): void {
    this.current++;
    while (this.queue.length > 0 && (this.queue[0] as Timer).due <= this.current) {
      const timer = this.queue.shift() as Timer;
      if (timer.cancelled) continue;
      timer.fn();
      if (timer.interval > 0 && !timer.cancelled) {
        timer.due = this.current + timer.interval;
        timer.seq = this.seq++;
        this.insert(timer);
      } else if (!timer.cancelled) {
        this.byId.delete(timer.id);
      }
    }
  }

  private schedule(ticks: number, fn: () => void, interval: number, owner?: object): TimerHandle {
    const timer: Timer = {
      id: this.nextId++,
      due: this.current + Math.max(1, Math.floor(ticks)),
      seq: this.seq++,
      fn,
      interval,
      owner,
      cancelled: false,
    };
    this.byId.set(timer.id, timer);
    this.insert(timer);
    return { id: timer.id };
  }

  private insert(timer: Timer): void {
    // Binary search for the first element that sorts after `timer`.
    let lo = 0;
    let hi = this.queue.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const t = this.queue[mid] as Timer;
      if (t.due < timer.due || (t.due === timer.due && t.seq < timer.seq)) lo = mid + 1;
      else hi = mid;
    }
    this.queue.splice(lo, 0, timer);
  }
}
