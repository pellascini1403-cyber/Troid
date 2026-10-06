import { describe, expect, it } from 'vitest';
import { CardLoadout, type CardChange, type CardDefinition } from '@/abilities/CardLoadout';
import { CARDS } from '@/content/resources';

/**
 * Cards (docs/GAME-SPEC-2D.md §10.2): one card equipped, or none; the Ability button works only with a card; the loadout
 * is built to hold more cards later without a selector, an inventory or deck building today.
 */
function make(defs: Readonly<Record<string, CardDefinition>> = CARDS) {
  const log: CardChange[] = [];
  return { l: new CardLoadout(defs, (c) => log.push(c)), log };
}
const SECOND: CardDefinition = { id: 'card_other', nameKey: 'card.spiritBolt.name', iconId: 'spirit_bolt', skillId: 'other' };

describe('card loadout', () => {
  it('starts with no card at all: nothing equipped, nothing owned (there is no initial ability)', () => {
    const { l } = make();
    expect(l.equipped).toBeNull();
    expect(l.owned).toEqual([]);
  });

  it('the first card acquired is equipped at once, and the skill it runs is the card\'s, not a fixed one', () => {
    const { l, log } = make();
    expect(l.acquire('card_spirit_bolt')).toBe(true);
    expect(l.equipped?.id).toBe('card_spirit_bolt');
    expect(l.equipped?.skillId).toBe('spirit_bolt');
    expect(l.owned).toEqual(['card_spirit_bolt']);
    expect(log).toEqual([{ type: 'acquired', cardId: 'card_spirit_bolt' }, { type: 'equipped', cardId: 'card_spirit_bolt' }]);
  });

  it('an unknown card or one already owned is refused and changes nothing', () => {
    const { l, log } = make();
    expect(l.acquire('nope')).toBe(false);
    l.acquire('card_spirit_bolt');
    const events = log.length;
    expect(l.acquire('card_spirit_bolt')).toBe(false);
    expect(log).toHaveLength(events);
  });

  it('only one card is equipped at a time: acquiring a second keeps the first, equipping switches', () => {
    const { l } = make({ ...CARDS, card_other: SECOND });
    l.acquire('card_spirit_bolt');
    l.acquire('card_other');
    expect(l.owned).toEqual(['card_spirit_bolt', 'card_other']);
    expect(l.equipped?.id).toBe('card_spirit_bolt');
    expect(l.equip('card_other')).toBe(true);
    expect(l.equipped?.id).toBe('card_other');
  });

  it('a card that is not owned cannot be equipped', () => {
    const { l } = make({ ...CARDS, card_other: SECOND });
    l.acquire('card_spirit_bolt');
    expect(l.equip('card_other')).toBe(false);
    expect(l.equipped?.id).toBe('card_spirit_bolt');
  });

  it('the card can be taken off (none equipped again) and put back', () => {
    const { l, log } = make();
    l.acquire('card_spirit_bolt');
    expect(l.equip(null)).toBe(true);
    expect(l.equipped).toBeNull();
    expect(l.has('card_spirit_bolt')).toBe(true); // still owned
    expect(log.at(-1)).toEqual({ type: 'unequipped', cardId: null });
    l.equip('card_spirit_bolt');
    expect(l.equipped?.id).toBe('card_spirit_bolt');
  });

  it('equipping what is already equipped is a success that says nothing', () => {
    const { l, log } = make();
    l.acquire('card_spirit_bolt');
    const events = log.length;
    expect(l.equip('card_spirit_bolt')).toBe(true);
    expect(log).toHaveLength(events);
  });

  it('serialises and restores (the save of Prompt 6): unknown and duplicate cards are dropped, the equipped one must be owned', () => {
    const { l } = make();
    l.acquire('card_spirit_bolt');
    const saved = l.serialize();
    expect(saved).toEqual({ owned: ['card_spirit_bolt'], equipped: 'card_spirit_bolt' });
    const { l: loaded, log } = make();
    loaded.restore({ owned: ['card_spirit_bolt', 'ghost', 'card_spirit_bolt'], equipped: 'card_spirit_bolt' });
    expect(loaded.owned).toEqual(['card_spirit_bolt']);
    expect(loaded.equipped?.id).toBe('card_spirit_bolt');
    expect(log).toEqual([]); // a load is not a pickup
    loaded.restore({ owned: [], equipped: 'card_spirit_bolt' });
    expect(loaded.equipped).toBeNull();
  });

  it('a card holds keys and ids, never text (the interface translates the name key)', () => {
    for (const c of Object.values(CARDS)) {
      expect(c.nameKey).toMatch(/^card\./);
      expect(typeof c.skillId).toBe('string');
    }
  });
});
