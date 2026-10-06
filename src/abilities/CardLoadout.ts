/**
 * A card is the way an active skill is equipped (docs/GAME-SPEC-2D.md §10.2). It names a skill and carries what the interface
 * shows (a name key and an icon); it never holds text. Modifiers (`ModifierStack`, §10.3) are not part of the first slice.
 */
export interface CardDefinition {
  id: string;
  nameKey: string;
  iconId: string;
  /** The skill the Ability button runs while this card is equipped (`SkillDefinition.id`). */
  skillId: string;
  /** The ability (`AbilitySystem` id) the player learns the moment the card is acquired, if any. */
  grantsAbility?: string;
}

export interface CardChange {
  type: 'acquired' | 'equipped' | 'unequipped';
  cardId: string | null;
}

/**
 * The cards the player owns and the ONE that is equipped — or none. Ability works only with an equipped card: the button, the
 * HUD slot and the skill all read `equipped`. The architecture allows more cards (the loadout is a list of owned ids and one
 * equipped id); the first slice has one or two and no selector, no inventory, no deck building.
 */
export class CardLoadout {
  private ownedIds: string[] = [];
  private equippedId: string | null = null;

  constructor(
    private readonly defs: Readonly<Record<string, CardDefinition>>,
    private readonly onChange: (change: CardChange) => void = () => {},
  ) {}

  get equipped(): CardDefinition | null {
    return this.equippedId === null ? null : (this.defs[this.equippedId] ?? null);
  }
  get owned(): readonly string[] {
    return this.ownedIds;
  }

  has(id: string): boolean {
    return this.ownedIds.includes(id);
  }

  /** The player gets a card. The first one is equipped at once (there is nothing else to choose). False if unknown or already owned. */
  acquire(id: string): boolean {
    if (!this.defs[id] || this.has(id)) return false;
    this.ownedIds.push(id);
    this.onChange({ type: 'acquired', cardId: id });
    if (this.equippedId === null) this.equip(id);
    return true;
  }

  /** Equips an owned card, or none (`null`). False if the card is not owned. */
  equip(id: string | null): boolean {
    if (id !== null && !this.has(id)) return false;
    if (id === this.equippedId) return true;
    this.equippedId = id;
    this.onChange({ type: id === null ? 'unequipped' : 'equipped', cardId: id });
    return true;
  }

  /** What a save stores. */
  serialize(): { owned: string[]; equipped: string | null } {
    return { owned: [...this.ownedIds], equipped: this.equippedId };
  }

  /** Loads a save: unknown cards are dropped, the equipped card must be one that is owned. No events (a load is not a pickup). */
  restore(data: { owned: readonly string[]; equipped: string | null }): void {
    this.ownedIds = data.owned.filter((id, i, all) => this.defs[id] !== undefined && all.indexOf(id) === i);
    this.equippedId = data.equipped !== null && this.ownedIds.includes(data.equipped) ? data.equipped : null;
  }
}
