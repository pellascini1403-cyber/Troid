import { SWORD_HITS } from '@/content/attacks';
import type { InteractableDef } from '@/interaction/Interactable';
import type { RoomMap } from '@/world/roomMap';

/**
 * THE THINGS THE ROOMS OF THE WORLD HAND OUT, in one place (docs/PROMPT21-LOG.md). A room says "a vessel of life lies here"; this says what that is made of — an interactable that sets the flag the bars are DERIVED from
 * (`content/upgrades.ts`), and that hides itself with the same flag once it is taken — so that a vessel is the same thing in every room and a test can hold all of them to one shape.
 */

/** A vessel of life or of magic (`life_1` … `life_5`, `mana_1` … `mana_3`): a vial that sets `taken:<id>` and makes the bar bigger for good. */
export function vessel(m: RoomMap, id: string, mark: string): InteractableDef {
  return { ...m.pickup(`vessel_${id}`, mark, [{ type: 'setFlag', flag: `taken:${id}` }], { whenClear: `taken:${id}` }), variant: 'bottle' };
}

/** An ability or a relic on a pedestal: the hero learns it (it is saved with the game) and the flag that hides it is set, in the same tick. */
export function teach(m: RoomMap, abilityId: string, mark: string): InteractableDef {
  return m.pickup(`teach_${abilityId}`, mark, [{ type: 'unlockAbility', abilityId }, { type: 'setFlag', flag: `taken:${abilityId}` }], { whenClear: `taken:${abilityId}` });
}

/** A lever: it can be used once, and the flag it sets is what a door of the world opens with. */
export function lever(m: RoomMap, id: string, mark: string, flag: string): InteractableDef {
  const at = m.at(mark);
  return { id, kind: 'activate', verbKey: 'interact.activate', x: at.x, y: at.y, whenClear: flag, actions: [{ type: 'setFlag', flag }] };
}

/** Everything that breaks a wall of split stone: any blow of the sword, the slam and the bolt (a floor asks for the slam alone). */
export const ANY_BLOW: readonly string[] = [...SWORD_HITS, 'slam', 'slam_dive', 'spirit_bolt'];
