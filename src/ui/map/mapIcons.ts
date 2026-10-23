import type { IconStroke } from '../icons';

/**
 * The marks of the map (docs/PROMPT19-LOG.md), in the same 24 × 24 box and the same hand as the rest of the interface's glyphs: abstract lines and shapes, none of them depicts the protagonist and none of them is
 * a picture. They are drawn straight into the map's own SVG (a `<g>` of paths) so they stay the same size on the screen however far the map is zoomed.
 */
export const MAP_ICONS = {
  /** A shrine to rest at: a brazier with its flame. */
  rest: [{ d: 'M-6 3 H6 L4.5 8.5 H-4.5 Z', fill: true }, { d: 'M0 -9 C4.5 -5 4.5 -1 0 2 C-4.5 -1 -4.5 -5 0 -9', width: 1.7 }],
  /** A ward that only a skill breaks: a ring struck through. */
  seal: [{ d: 'M0 -8 a8 8 0 1 1 0 16 a8 8 0 1 1 0 -16', width: 1.7 }, { d: 'M-4.5 -4.5 L4.5 4.5 M4.5 -4.5 L-4.5 4.5', width: 1.7 }],
  /** A guardian: a crown of points. */
  boss: [{ d: 'M-9 6.5 L-7.5 -6 L-3 -1 L0 -8.5 L3 -1 L7.5 -6 L9 6.5 Z', fill: true }],
  /** A way that is shut. */
  lock: [{ d: 'M-5.5 -1 H5.5 V8.5 H-5.5 Z', fill: true }, { d: 'M-3 -1 V-4 a3 3 0 0 1 6 0 V-1', width: 1.8 }],
  /** The way out of the world as it stands: an arrow leaving. */
  leave: [{ d: 'M-8 0 H6 M1.5 -4.5 L6.5 0 L1.5 4.5', width: 2 }],
  zoomIn: [{ d: 'M-6 0 H6 M0 -6 V6', width: 2 }],
  zoomOut: [{ d: 'M-6 0 H6', width: 2 }],
  /** Centre on where the hero is. */
  centre: [{ d: 'M0 -10 V-5 M0 5 V10 M-10 0 H-5 M5 0 H10', width: 1.8 }, { d: 'M0 -3 a3 3 0 1 1 0 6 a3 3 0 1 1 0 -6', width: 1.8 }],
} as const satisfies Record<string, readonly IconStroke[]>;

export type MapIconId = keyof typeof MAP_ICONS;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The strokes of an icon as a `<g>` of paths, `size` px wide, centred on the origin (colours come from the style sheet: `currentColor`). For use INSIDE an `<svg>`. */
export function mapGlyph(doc: Document, id: MapIconId, size: number): SVGGElement {
  const g = doc.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', `map-glyph map-glyph-${id}`);
  g.setAttribute('aria-hidden', 'true');
  const inner = doc.createElementNS(SVG_NS, 'g');
  inner.setAttribute('transform', `scale(${(size / 24).toFixed(4)})`);
  for (const s of MAP_ICONS[id] as readonly IconStroke[]) {
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
    inner.appendChild(path);
  }
  g.appendChild(inner);
  return g;
}

/** The same icon as a stand-alone `<svg>` (for a button or a line of the legend). */
export function mapIconSvg(doc: Document, id: MapIconId, size: number): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '-12 -12 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `map-icon map-icon-${id}`);
  svg.style.display = 'block';
  svg.style.overflow = 'visible';
  const g = mapGlyph(doc, id, 24);
  svg.appendChild(g);
  return svg;
}
