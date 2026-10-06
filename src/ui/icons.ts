/**
 * The few glyphs the interface draws, as SVG path data in a 24 × 24 box centred on the origin (−12 … 12). Abstract marks —
 * a slash, a chevron pair, a spark — in the colours of the closed palette; none of them depicts the protagonist. They are
 * built with `createElementNS` (never `innerHTML`), and they hold no text.
 */
export interface IconStroke {
  /** Path data. */
  d: string;
  /** Filled shape (true) or a line of `width` (false). */
  fill?: boolean;
  width?: number;
}

export const ICONS = {
  attack: [{ d: 'M-8 9 L9 -8', width: 2.6 }, { d: 'M-2 11 L11 -2', width: 1.6 }],
  dash: [{ d: 'M-10 -8 L-2 0 L-10 8', width: 2.4 }, { d: 'M0 -8 L8 0 L0 8', width: 2.4 }],
  /** Spirit Bolt: a spark of energy. */
  spirit_bolt: [{ d: 'M1 -11 L-6 1 L-1 1 L-3 11 L6 -2 L1 -2 Z', fill: true }],
  /** An energy bottle (a flask). */
  bottle: [{ d: 'M-3 -10 L3 -10 M-2.5 -10 L-2.5 -6 L-7 0 L-7 8 Q-7 11 -4 11 L4 11 Q7 11 7 8 L7 0 L2.5 -6 L2.5 -10', width: 1.9 }],
} as const satisfies Record<string, readonly IconStroke[]>;

export type IconId = keyof typeof ICONS;

const SVG_NS = 'http://www.w3.org/2000/svg';

export function isIconId(id: string): id is IconId {
  return Object.prototype.hasOwnProperty.call(ICONS, id);
}

/** An `<svg>` for the icon, `size` px wide, drawn with `currentColor`. An unknown id gives an empty box (never a throw). */
export function createIcon(doc: Document, id: string, size: number): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '-12 -12 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.style.display = 'block';
  svg.style.overflow = 'visible';
  const strokes: readonly IconStroke[] = isIconId(id) ? ICONS[id] : [];
  for (const s of strokes) {
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', s.d);
    if (s.fill) {
      path.setAttribute('fill', 'currentColor');
    } else {
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', String(s.width ?? 2));
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
    }
    svg.appendChild(path);
  }
  return svg;
}
