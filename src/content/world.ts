import type { WorldDefinition } from '@/world/WorldDefinition';

/**
 * The mini-world of the first slice (docs/PROMPT6-LOG.md S22): four rooms in a line, each connected to the next and back.
 *
 *   R1 «Puerta de las Ruinas» ⇄ R2 «Galería de Raíces» ⇄ R3 «Cámara del Sello» ⇄ R4 «Santuario» → (the end of the slice)
 *
 * Only the rooms and the starting point are written here: the connections are the `exits` of the rooms themselves
 * (`exit.to = { room, entry }`), which is what `world/worldGraph` reads to build the graph and to prove that the whole world can
 * be finished.
 */
export const WORLD: WorldDefinition = {
  id: 'ancient_forest',
  start: { room: 'r1_gate', entry: 'start' },
  rooms: ['r1_gate', 'r2_hall', 'r3_chamber', 'r4_sanctum'],
};
