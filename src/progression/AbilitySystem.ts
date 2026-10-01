import { log } from '@/core/log';

export type AbilityKind = 'movement' | 'attack' | 'active' | 'passive';

/**
 * Static description of an ability. `implemented: false` marks abilities that are declared (so content and
 * saves can reference them) but have no behaviour yet: normal progression never grants them.
 */
export interface AbilityDefinition {
  id: string;
  name: string;
  description: string;
  kind: AbilityKind;
  implemented: boolean;
}

/** The narrow slice of the event bus the system needs (keeps `progression/` independent of `gameplay/`). */
export interface AbilityEmitter {
  emit(type: 'ability:unlocked' | 'ability:locked', payload: { id: string }): void;
}

/**
 * THE place that answers "can the player do X?". Gameplay asks `abilities.has('dash')`; nothing else in the
 * codebase checks progression flags directly, so a new ability is a data entry + one handler, never a scatter of
 * `if (hasItem…)` conditions.
 */
export class AbilitySystem {
  private readonly defs = new Map<string, AbilityDefinition>();
  private readonly owned = new Set<string>();
  private readonly warn = log.scope('abilities');

  constructor(
    definitions: readonly AbilityDefinition[],
    private readonly events: AbilityEmitter | null = null,
    initial: readonly string[] = [],
  ) {
    for (const def of definitions) this.defs.set(def.id, def);
    for (const id of initial) this.owned.add(id);
  }

  has(id: string): boolean {
    if (!this.defs.has(id)) this.warn.warnOnce(`unknown:${id}`, `has("${id}"): no such ability is defined`);
    return this.owned.has(id);
  }

  /** Returns true if the ability was newly granted. */
  unlock(id: string): boolean {
    const def = this.defs.get(id);
    if (!def) {
      this.warn.warn(`unlock("${id}"): no such ability is defined`);
      return false;
    }
    if (this.owned.has(id)) return false;
    this.owned.add(id);
    this.events?.emit('ability:unlocked', { id });
    return true;
  }

  /** Debug / tests only: abilities are never taken away by normal gameplay. */
  lock(id: string): boolean {
    if (!this.owned.delete(id)) return false;
    this.events?.emit('ability:locked', { id });
    return true;
  }

  definition(id: string): AbilityDefinition | undefined {
    return this.defs.get(id);
  }

  list(): readonly AbilityDefinition[] {
    return [...this.defs.values()];
  }

  /** Ids currently owned (stable order) — what the save system stores. */
  serialize(): string[] {
    return [...this.owned].sort();
  }

  /** Replaces the owned set (loading a save). Unknown ids are dropped with a warning, never trusted blindly. */
  restore(ids: readonly string[]): void {
    this.owned.clear();
    for (const id of ids) {
      if (this.defs.has(id)) this.owned.add(id);
      else this.warn.warn(`restore: dropping unknown ability "${id}"`);
    }
  }
}
