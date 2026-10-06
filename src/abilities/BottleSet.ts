import { secondsToTicks } from '@/core/time';

export type BottleState = 'ready' | 'empty' | 'recharging';

/** What a bottle does when it is drunk. One effect exists in the first slice (GAME-SPEC-2D §11: heal 2); the type is open for more. */
export interface BottleEffect {
  type: 'heal';
  amount: number;
}

export interface BottleDefinition {
  id: string;
  nameKey: string;
  iconId: string;
  effect: BottleEffect;
}

export interface BottleRules {
  /** Seconds one bottle takes to refill, ONE AT A TIME (the first empty one from the left). */
  rechargeSeconds: number;
  /** Most slots the player can ever have: the fourth is a reward. */
  maxSlots: number;
  /** Seconds the hero stands still drinking before the effect lands (GAME-SPEC-2D §11: 24 ticks). A hit during them spends nothing. */
  channelSeconds: number;
}

export interface BottleSlot {
  readonly definitionId: string;
  state: BottleState;
  /** Ticks of recharge done (only while `recharging`). */
  progress: number;
}

export type BottleChangeType = 'used' | 'recharging' | 'recharged' | 'added' | 'refilled';
export interface BottleChange {
  type: BottleChangeType;
  slot: number;
}

/**
 * The energy bottles (docs/GAME-SPEC-2D.md §11): each one is a CHARGE with a slow recovery, independent of the magic. Three at
 * the start, four at most. A used bottle is empty; bottles refill SEQUENTIALLY — only one recharges at a time, the first empty
 * one from the left, `rechargeSeconds` each — and a bottle that is waiting for its turn is just empty. No purchases, no economy.
 *
 * This class is the STATE and its rules (pure, deterministic: it counts simulation ticks). What drinking does (the channel,
 * the interruption, the heal itself) is the player's, in `PlayerController`: the bottle is consumed only when the channel
 * ENDS, so a hit in the middle costs nothing.
 */
export class BottleSet {
  readonly slots: BottleSlot[] = [];
  private readonly rechargeTicks: number;
  private readonly channelTicks: number;

  constructor(
    private readonly defs: Readonly<Record<string, BottleDefinition>>,
    initial: readonly string[],
    private readonly rules: BottleRules,
    private readonly onChange: (change: BottleChange) => void = () => {},
  ) {
    this.rechargeTicks = Math.max(1, secondsToTicks(rules.rechargeSeconds));
    this.channelTicks = Math.max(1, secondsToTicks(rules.channelSeconds));
    for (const id of initial.slice(0, rules.maxSlots)) {
      if (!defs[id]) throw new Error(`unknown bottle definition "${id}"`);
      this.slots.push({ definitionId: id, state: 'ready', progress: 0 });
    }
  }

  get count(): number {
    return this.slots.length;
  }
  get readyCount(): number {
    return this.slots.filter((s) => s.state === 'ready').length;
  }
  get maxSlots(): number {
    return this.rules.maxSlots;
  }
  /** Ticks a full recharge takes. */
  get rechargeLength(): number {
    return this.rechargeTicks;
  }
  /** Ticks the drinking channel lasts: the effect lands on the last one. */
  get channelLength(): number {
    return this.channelTicks;
  }

  definition(slot: number): BottleDefinition | undefined {
    const s = this.slots[slot];
    return s ? this.defs[s.definitionId] : undefined;
  }

  /** 0 … 1: how full the slot is (1 when ready, the recharge progress while recharging, 0 when it waits). */
  fill(slot: number): number {
    const s = this.slots[slot];
    if (!s) return 0;
    return s.state === 'ready' ? 1 : s.state === 'recharging' ? s.progress / this.rechargeTicks : 0;
  }

  /** The slot a request means: −1 is "the first ready one" (the key, the contextual chip), 0.. that slot (a HUD icon). −1 when it is not ready. */
  resolve(request: number): number {
    if (request < 0) return this.slots.findIndex((s) => s.state === 'ready');
    return this.slots[request]?.state === 'ready' ? request : -1;
  }

  /** The bottle was drunk: its slot is empty and the sequential recharge goes on (or starts). False when it was not ready. */
  consume(slot: number): boolean {
    const s = this.slots[slot];
    if (!s || s.state !== 'ready') return false;
    s.state = 'empty';
    s.progress = 0;
    this.onChange({ type: 'used', slot });
    this.startNext();
    return true;
  }

  /** A new slot, full (the fourth bottle is a reward). False when the player already has the most. */
  addSlot(definitionId: string): boolean {
    if (this.slots.length >= this.rules.maxSlots || !this.defs[definitionId]) return false;
    this.slots.push({ definitionId, state: 'ready', progress: 0 });
    this.onChange({ type: 'added', slot: this.slots.length - 1 });
    return true;
  }

  /** Every bottle full again (a save point, Prompt 6; never a death: the recharge is slow on purpose). */
  refillAll(): void {
    this.slots.forEach((s, i) => {
      if (s.state === 'ready') return;
      s.state = 'ready';
      s.progress = 0;
      this.onChange({ type: 'refilled', slot: i });
    });
  }

  /** One simulation tick of the recharge. */
  tick(): void {
    const i = this.slots.findIndex((s) => s.state === 'recharging');
    if (i < 0) return;
    const s = this.slots[i] as BottleSlot;
    if (++s.progress < this.rechargeTicks) return;
    s.state = 'ready';
    s.progress = 0;
    this.onChange({ type: 'recharged', slot: i });
    this.startNext();
  }

  /** Starts the recharge of the first empty slot from the left, unless one is already recharging. */
  private startNext(): void {
    if (this.slots.some((s) => s.state === 'recharging')) return;
    const i = this.slots.findIndex((s) => s.state === 'empty');
    if (i < 0) return;
    const s = this.slots[i] as BottleSlot;
    s.state = 'recharging';
    s.progress = 0;
    this.onChange({ type: 'recharging', slot: i });
  }
}
