/**
 * THE TWO PNGs OF THE HUD AS THE ARTIST DELIVERED THEM (docs/PROMPT17-LOG.md): the file names, the sizes in bytes and the SHA-256 of both. They are in `src/ui/hud/png/original/` byte for byte; nothing in the game reads
 * them — the pieces next to them (`src/ui/hud/png/*.png`) are cut from them by `tools/hud/pieces.ts` — but they are the source of truth, and `npm run hud:check` and `tests/unit/ui/hudArt.test.ts` hold the pieces to them.
 */
export const HUD_ORIGINALS_DIR = 'src/ui/hud/png/original';
export const HUD_PIECES_DIR = 'src/ui/hud/png';

export const HUD_ORIGINALS = {
  complete: { file: 'hud-complete.png', bytes: 134858, sha256: '6cd823f2288a3c934b30108cedae9fa4902fafa923949f09c6422e161dede2be' },
  worn: { file: 'hud-worn.png', bytes: 130695, sha256: 'a717b3066fbf5e4589baa55fd8c0f77448b81b54d1a6283e095751e48717d037' },
} as const;
