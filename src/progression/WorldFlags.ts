/** The narrow slice of the event bus the flags need (keeps `progression/` independent of `gameplay/`). */
export interface FlagEmitter {
  emit(type: 'flag:set' | 'flag:cleared', payload: { flag: string }): void;
}

/**
 * World state that outlives a visit to a room and outlives a death (docs/GAME-SPEC-2D.md §14.3): "that guardian is
 * defeated", "this door is open". Rooms are BUILT by reading flags, which is what makes a room reset, a respawn and (in
 * Prompt 6) a loaded save come out the same: the flags are the only memory.
 *
 * Plain names (`defeated:r1_slime`); `has` is the only question gameplay asks. Events announce changes, once: setting
 * a flag that is already set is a no-op, so listeners never see a repeat.
 */
export class WorldFlags {
  private readonly flags = new Set<string>();

  constructor(private readonly events: FlagEmitter | null = null) {}

  has(flag: string): boolean {
    return this.flags.has(flag);
  }

  /** Returns true when the flag was newly set. */
  set(flag: string): boolean {
    if (this.flags.has(flag)) return false;
    this.flags.add(flag);
    this.events?.emit('flag:set', { flag });
    return true;
  }

  /** Returns true when the flag was set and is now cleared. Debug / tests: normal gameplay never takes a flag away. */
  clear(flag: string): boolean {
    if (!this.flags.delete(flag)) return false;
    this.events?.emit('flag:cleared', { flag });
    return true;
  }

  /** Every flag, sorted: a stable snapshot for saves, tests and the debug panel. */
  list(): string[] {
    return [...this.flags].sort();
  }

  /** Replaces the whole state without announcing it (loading a save). */
  restore(flags: Iterable<string>): void {
    this.flags.clear();
    for (const f of flags) this.flags.add(f);
  }
}
