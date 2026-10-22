/**
 * The art index the build found (`vite.config.ts`): the path of `public/art/index.json` relative to the page, or an empty string when there is none — and
 * then the game never loads the art code nor asks for a file (docs/ART-PIPELINE-2D.md, part C).
 */
declare const __TROID_ART_INDEX__: string;

/**
 * The audio index the build found (`vite.config.ts`): the path of `public/audio/index.json` relative to the page, or an empty string when there is none — and then the game has no sound files to ask for and plays
 * with none (docs/PROMPT18-LOG.md).
 */
declare const __TROID_AUDIO_INDEX__: string;
