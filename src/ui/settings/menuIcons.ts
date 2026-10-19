import { drawStrokes, type IconStroke } from '../icons';

/**
 * The marks of the pause menu's entries (docs/PROMPT14-LOG.md), in the same 24 × 24 box and the same hand as the rest of the interface's glyphs: abstract lines, none of them depicts the protagonist.
 * They live with the menu, not with the HUD: a player's first load does not carry them.
 */
export const MENU_ICONS = {
  resume: [{ d: 'M-5 -8 L8 0 L-5 8 Z', fill: true }],
  settings: [{ d: 'M-9 -5 H9', width: 1.8 }, { d: 'M-9 5 H9', width: 1.8 }, { d: 'M-3 -8 V-2 H1 V-8 Z', fill: true }, { d: 'M3 2 V8 H7 V2 Z', fill: true }],
  controls: [{ d: 'M-9 -5 H9 V5 H-9 Z', width: 1.7 }, { d: 'M-5 -2 V2 M-7 0 H-3', width: 1.7 }, { d: 'M4 -1.5 L5.5 0 L4 1.5 L2.5 0 Z', fill: true }],
  saves: [{ d: 'M0 -9 L9 0 L0 9 L-9 0 Z', width: 1.7 }, { d: 'M0 -3.5 L3.5 0 L0 3.5 L-3.5 0 Z', fill: true }],
  profile: [{ d: 'M0 -9 a4 4 0 1 1 0 8 a4 4 0 1 1 0 -8', width: 1.7 }, { d: 'M-8 10 Q0 0 8 10', width: 1.7 }],
  back: [{ d: 'M5 -8 L-4 0 L5 8', width: 2.2 }],
} as const satisfies Record<string, readonly IconStroke[]>;

export type MenuIconId = keyof typeof MENU_ICONS;

export function createMenuIcon(doc: Document, id: MenuIconId, size: number): SVGSVGElement {
  return drawStrokes(doc, MENU_ICONS[id], size);
}
