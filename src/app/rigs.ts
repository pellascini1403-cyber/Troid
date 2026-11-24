/**
 * What the player SEES of a creature that has its own anatomy (docs/PROMPT24-LOG.md): the kit that draws it, and every species' rig. Like the guardians' views it is cosmetic and has no business in the first frame, so it travels in
 * a chunk of its own — fetched with the effects, once the first frame is up — and the cold start of R1 does not carry it. The creature itself (its simulation) never waits for its picture.
 */
export { createRigAssets, ensureMeshPipe, RIGS, RigActor, seedOf, type RigAssets, type RigDef } from '@/rigs';
