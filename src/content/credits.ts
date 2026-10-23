/**
 * THE CREDITS (docs/PROMPT20-LOG.md): what the closing of the adventure rolls. Pure data — a name is a proper name (never translated), a title or a role is a text key.
 *
 * `credits.team` is EMPTY on purpose: the repository does not say who made the game, and the game does not invent them. Whoever publishes it fills that list in (docs/PUBLISHING.md lists it among
 * the things only its owners can do) and the closing shows it; a section with no lines is not shown. What is listed below is what can be checked in the repository: the sound is synthesised by the
 * project's own tools (`tools/audio`), and the picture is drawn by PixiJS (MIT; the notices of everything the build carries are in `THIRD_PARTY_NOTICES.txt`).
 */
import type { CreditSection } from '@/presentation/credits';

export const CREDITS: readonly CreditSection[] = [
  { titleKey: 'credits.team', lines: [] },
  { titleKey: 'credits.sound', lines: [{ name: 'Troid', roleKey: 'credits.roleSound' }] },
  { titleKey: 'credits.software', lines: [{ name: 'PixiJS', roleKey: 'credits.roleRenderer' }] },
];
