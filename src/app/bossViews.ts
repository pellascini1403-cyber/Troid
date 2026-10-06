/**
 * What the player SEES of a boss (docs/PROMPT6-LOG.md S29): the column of the Ink Warden with the warnings of its attacks, and its bar. They are
 * cosmetic and the first room has no boss, so they travel in a chunk of their own — fetched with the effects, once the first frame is up — and
 * the cold start of R1 does not carry them. The boss itself (its simulation) is in the main chunk: it never waits for its picture.
 */
export { GuardianView, type GuardianLike } from '@/render/GuardianView';
export { BossBarView } from '@/ui/hud/BossBarView';
