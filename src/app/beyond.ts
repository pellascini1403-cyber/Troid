/**
 * THE REST OF THE WORLD, ON ITS WAY (docs/PROMPT21-LOG.md): the sixty rooms past the Sanctum, the thirteen creatures and the six guardians that live in them are a chunk of their own (`content/beyond.ts`), because the budget of the cold
 * start is about what a hero standing in R1 has to download, and R1 needs none of it. The game asks for the chunk once its first frame is up, with the effects and the art; it adds itself to the registries of `content/core.ts`, which the
 * session reads from — so the first time anything asks for a room that is not there, this is the question that is answered. One request, kept: asking again gives the same promise, and a request that failed is forgotten, so the next ask is a new try.
 */
let request: Promise<void> | null = null;

export function loadBeyond(): Promise<void> {
  return (request ??= import('@/content/beyond').then(
    () => undefined,
    (err: unknown) => {
      request = null;
      throw err;
    },
  ));
}
