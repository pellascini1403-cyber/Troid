/**
 * THE THREE PNGs OF THE TOUCH BUTTONS, as the artist delivered them (docs/PROMPT15-LOG.md): the file names, the sizes in bytes and the SHA-256 of every file. They are in `src/ui/touch/buttons/` byte for byte;
 * the unit test (`tests/unit/ui/touchArt.test.ts`) holds the files to these numbers, and the E2E asks the browser for the files the page really shows and holds THEM to the same ones — so that a button
 * that is retouched, re-exported, recompressed, recoloured or redrawn, anywhere between the repository and the screen, is found.
 */
export const TOUCH_ART_DIR = 'src/ui/touch/buttons';

export const TOUCH_ART_ORIGINALS = {
  attack: { file: 'touch-attack.png', bytes: 40885, sha256: '0be2c04f9382e8373aa11a5be29077a0df8ee3ad4696c8761684693b793cd5bc' },
  dash: { file: 'touch-dash.png', bytes: 47664, sha256: '15f3a2a7c4cf1275f46f1217802643517cd677380b02eb8dd2c5a4f9a01afcf7' },
  ability: { file: 'touch-magic.png', bytes: 55182, sha256: 'dbb1f02a10be8cc88b5cf5122ae483171357020926688b18756b186e2fa36298' },
} as const;
