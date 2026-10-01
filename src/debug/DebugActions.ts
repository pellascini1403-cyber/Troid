export interface DebugAction {
  id: string;
  group: string;
  label: string;
  run: () => void;
}

/**
 * Registry of debug commands. Systems register their own actions (heal, unlock abilities, kill enemies, reset
 * room…) without knowing whether a panel, a console or a test harness runs them — and the panel never has to
 * know about any system. Registration returns an unregister function, so a room that adds actions removes them on unload.
 */
export class DebugActions {
  private readonly actions = new Map<string, DebugAction>();

  register(group: string, label: string, run: () => void): () => void {
    const id = `${group}/${label}`;
    this.actions.set(id, { id, group, label, run });
    return () => {
      this.actions.delete(id);
    };
  }

  run(id: string): boolean {
    const a = this.actions.get(id);
    if (!a) return false;
    a.run();
    return true;
  }

  list(): readonly DebugAction[] {
    return [...this.actions.values()];
  }

  get size(): number {
    return this.actions.size;
  }
}
