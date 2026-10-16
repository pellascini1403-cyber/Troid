import { drawText, FONT_H, textWidth, type Rgba } from './bitmapFont';
import type { Erased } from './erase';
import { boundsOf } from './figure';
import { crop, type ClipJudgement, type Canvas, type Check, type Level, type Scaling, type SwordPoints, type Waived } from './intake';
import { board, blank, blit, type BoardItem } from './kit';
import type { ClipRequest } from './kit';
import type { RgbaImage } from './png';
import type { Box } from './poses';
import { renderFrame, toDrawing } from './warp';

/**
 * WHAT A PERSON LOOKS AT BEFORE ACCEPTING (docs/PROMPT10-LOG.md): the comparative contact sheet of a delivery — the originals it stands on, the new poses with their verdicts, the sequence
 * against the one the game has today, and the real game size — the grid that lets the anchors of a sword be read off, and the written summary. Drawn with the 5 × 7 font of the kit: no font
 * file, no image program, the same bytes on every machine.
 */

const DARK: Rgba = [22, 28, 40, 255];
const GROUND: Rgba = [60, 78, 104, 255];
const FAINT: Rgba = [48, 60, 80, 255];
const STRONG: Rgba = [86, 108, 140, 255];
const OK: Rgba = [40, 130, 80, 255];
const WARN: Rgba = [190, 130, 20, 255];
const FAIL: Rgba = [190, 40, 40, 255];
const GRIP: Rgba = [255, 220, 40, 255];
const TIP: Rgba = [255, 80, 220, 255];

const levelColor = (l: Level): Rgba => (l === 'ok' ? OK : l === 'warn' ? WARN : FAIL);
const LEVEL_WORD: Record<Level, string> = { ok: 'OK', warn: 'WARN', fail: 'FAIL' };

function fill(img: RgbaImage, x0: number, y0: number, x1: number, y1: number, c: Rgba): void {
  for (let y = Math.max(0, y0); y <= Math.min(img.height - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(img.width - 1, x1); x++) img.data.set(c, (y * img.width + x) * 4);
}

/** A cross of arm `r` centred on (x, y), 3 px thick, so it reads over the dark figure. */
function cross(img: RgbaImage, x: number, y: number, r: number, c: Rgba): void {
  fill(img, x - r, y - 1, x + r, y + 1, c);
  fill(img, x - 1, y - r, x + 1, y + r, c);
}

function line(img: RgbaImage, x0: number, y0: number, x1: number, y1: number, c: Rgba): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n);
    const y = Math.round(y0 + ((y1 - y0) * i) / n);
    if (x >= 0 && y >= 0 && x < img.width && y < img.height) img.data.set(c, (y * img.width + x) * 4);
  }
}

/** `src` enlarged by an integer `k` (nearest: every pixel becomes a k × k block). */
export function enlarge(src: RgbaImage, k: number): RgbaImage {
  if (k === 1) return src;
  const out = new Uint8Array(src.width * k * src.height * k * 4);
  for (let y = 0; y < src.height * k; y++) {
    for (let x = 0; x < src.width * k; x++) {
      const s = (((y / k) | 0) * src.width + ((x / k) | 0)) * 4;
      out.set(src.data.subarray(s, s + 4), (y * src.width * k + x) * 4);
    }
  }
  return { width: src.width * k, height: src.height * k, data: out };
}

/** The frame laid over a dark ground, so a pale fringe or a hole shows. The whole canvas, or the figure's own rectangle with `pad` pixels. */
function onDark(frame: RgbaImage, area: Box | null): RgbaImage {
  const box = area ?? { x0: 0, y0: 0, x1: frame.width - 1, y1: frame.height - 1 };
  const w = box.x1 - box.x0 + 1;
  const h = box.y1 - box.y0 + 1;
  const out = blank(w, h, DARK);
  blit(out, crop(frame, box), 0, 0, 1);
  return out;
}

const unionBounds = (frames: readonly RgbaImage[], pad: number, canvas: Canvas): Box => {
  let u: Box | null = null;
  for (const f of frames) {
    const b = boundsOf(f, 8);
    if (!b) continue;
    u = u ? { x0: Math.min(u.x0, b.x0), y0: Math.min(u.y0, b.y0), x1: Math.max(u.x1, b.x1), y1: Math.max(u.y1, b.y1) } : b;
  }
  const base = u ?? { x0: 0, y0: 0, x1: canvas.width - 1, y1: canvas.height - 1 };
  return { x0: Math.max(0, base.x0 - pad), y0: Math.max(0, base.y0 - pad), x1: Math.min(canvas.width - 1, base.x1 + pad), y1: Math.min(canvas.height - 1, base.y1 + pad) };
};

export interface ReportInput {
  clip: string;
  request: ClipRequest;
  canvas: Canvas;
  names: string[];
  frames: RgbaImage[];
  judgement: ClipJudgement;
  scaling: Scaling;
  anchors: Map<string, SwordPoints>;
  /** The clip's frames in the game today (what the delivery would replace), possibly none. */
  before: Array<{ name: string; image: RgbaImage }>;
  /** A frame of the clip this one sits next to in play, for the size comparison. */
  neighbour: { name: string; image: RgbaImage } | null;
  /** The user's own drawings and the game's neighbouring frames that the brief points to. */
  originals: BoardItem[];
}

/** The picture of one frame as it goes on the contact sheet: the figure over the dark ground at x2, with the sword's anchors if the clip has them. */
function poseItem(r: ReportInput, k: number): BoardItem {
  const name = r.names[k]!;
  const j = r.judgement.frames[k]!;
  const area = unionBounds([r.frames[k]!], 6, r.canvas);
  let img = enlarge(onDark(r.frames[k]!, area), 2);
  const p = r.anchors.get(name);
  if (p) {
    const gx = Math.round((p.grip[0] - area.x0) * 2 + 1);
    const gy = Math.round((p.grip[1] - area.y0) * 2 + 1);
    const tx = Math.round((p.tip[0] - area.x0) * 2 + 1);
    const ty = Math.round((p.tip[1] - area.y0) * 2 + 1);
    line(img, gx, gy, tx, ty, [255, 255, 255, 255]);
    cross(img, gx, gy, 6, GRIP);
    cross(img, tx, ty, 6, TIP);
  }
  const ids = [...new Set(j.checks.filter((c) => c.level !== 'ok').map((c) => c.id))];
  // a coloured band along the bottom: the verdict, readable from a distance
  img = { ...img, data: new Uint8Array(img.data) };
  fill(img, 0, img.height - 5, img.width - 1, img.height - 1, levelColor(j.level));
  const caption = [`${name.toUpperCase()}  ${LEVEL_WORD[j.level]}`, `${j.role.toUpperCase()} ${j.phase ? `(${j.phase.toUpperCase()})` : ''}`, `EYE ${j.eye === null ? '-' : j.eye.toFixed(1)}  HEAD ${j.head === null ? '-' : j.head.toFixed(1)}  EDGE ${(j.clean.paleEdge * 100).toFixed(1)}%  RED ${(j.clean.red * 100).toFixed(1)}%`, ids.length > 0 ? ids.join(' ').toUpperCase() : 'NO NOTES'].join(' ');
  return { image: img, scale: 1, caption, warn: j.level !== 'ok' };
}

/** One cell of a sequence strip: the frame at 1:1 over the dark ground with the ground line and the pivot column marked. */
export function stripCell(frame: RgbaImage, area: Box, canvas: Canvas, label: string): RgbaImage {
  const cell = onDark(frame, area);
  const gy = canvas.pivot[1] + 1 - area.y0;
  const px = canvas.pivot[0] - area.x0;
  const withGuides = blank(cell.width, cell.height, DARK);
  fill(withGuides, 0, gy, cell.width - 1, gy, GROUND);
  fill(withGuides, px, 0, px, cell.height - 1, FAINT);
  blit(withGuides, crop(frame, area), 0, 0, 1);
  drawText(withGuides, label, 3, 3, [150, 170, 200, 255], 1);
  return withGuides;
}

/** A strip: the cells side by side with a gap, one image. */
export function strip(cells: RgbaImage[], gap = 4): RgbaImage {
  const h = Math.max(...cells.map((c) => c.height));
  const w = cells.reduce((s, c) => s + c.width + gap, gap);
  const out = blank(w, h + gap * 2, [12, 16, 26, 255]);
  let x = gap;
  for (const c of cells) {
    blit(out, c, x, gap, 1);
    x += c.width + gap;
  }
  return out;
}

/** The real size of the game: the new frames at 1:1 (65 px to the metre) beside the neighbour clip's frame and 1 m ticks on the floor. */
function realSize(r: ReportInput): RgbaImage {
  const { canvas } = r;
  const all = [...r.frames, ...(r.neighbour ? [r.neighbour.image] : [])];
  const area = unionBounds(all, 8, canvas);
  const cells: RgbaImage[] = [];
  if (r.neighbour) cells.push(stripCell(r.neighbour.image, area, canvas, r.neighbour.name.toUpperCase()));
  r.frames.forEach((f, i) => cells.push(stripCell(f, area, canvas, String(i))));
  const s = strip(cells, 10);
  // metre ticks along the floor under the whole strip
  const gy = canvas.pivot[1] + 1 - area.y0 + 4;
  for (let x = 4; x < s.width; x += canvas.artPxPerMeter) fill(s, x, gy, x, gy + 5, STRONG);
  return s;
}

/** The comparative contact sheet: 1 the originals · 2 the new poses (x2) · 3 the sequence against today's · 4 the real size. */
export function contactSheet(r: ReportInput): RgbaImage {
  const j = r.judgement;
  const head = `${r.clip.toUpperCase()} - CONTACT SHEET - ${LEVEL_WORD[j.level]}`;
  const legend = [
    `${r.frames.length} NEW FRAMES. SCALE X${r.scaling.factor.toFixed(3)} (${r.scaling.how === 'eye' ? 'BY THE BIG EYE' : r.scaling.how === 'head' ? 'BY THE HEAD: IT TURNS, SO THE EYE IS NO FAIR MEASURE' : r.scaling.how === 'given' ? 'GIVEN' : 'FRAMES ALREADY ON THE CANVAS'}); ${r.scaling.proxy === 'head' ? `THE CLIP'S HEAD ${j.head === null ? 'NOT MEASURED' : `${j.head.toFixed(1)} PX`}${r.scaling.headTarget !== null ? ` VS ${r.scaling.headTarget.toFixed(1)} PX OF ITS NEIGHBOUR` : ''}` : `THE CLIP'S EYE ${j.eye === null ? 'NOT MEASURED' : `${j.eye.toFixed(1)} PX`}${r.scaling.target !== null ? ` VS ${r.scaling.target.toFixed(1)} PX OF ITS NEIGHBOUR` : ''}`}.`,
    ...j.checks.filter((c) => c.level !== 'ok').map((c: Check) => `${LEVEL_WORD[c.level]}: ${c.text}`.slice(0, 190)),
  ];
  const sections: RgbaImage[] = [];
  sections.push(board(`${head}`, legend, []));
  sections.push(board('1 - THE ORIGINALS THIS STANDS ON (THE USER\'S OWN DRAWINGS, UNTOUCHED, AND THE GAME\'S NEIGHBOURING FRAMES)', [], r.originals));
  sections.push(board('2 - THE NEW POSES (X2, OVER A DARK GROUND SO A PALE FRINGE SHOWS)', ['THE BAND UNDER EACH IS ITS VERDICT: GREEN OK, AMBER WARN, RED FAIL.' + (r.request.sword ? ' YELLOW = GRIP, MAGENTA = TIP.' : '')], r.frames.map((_, k) => poseItem(r, k))));
  const area = unionBounds([...r.frames, ...r.before.map((b) => b.image)], 6, r.canvas);
  const seqItems: BoardItem[] = [];
  if (r.before.length > 0) seqItems.push({ image: strip(r.before.map((b, i) => stripCell(b.image, area, r.canvas, String(i)))), scale: 1, caption: `BEFORE - THE GAME TODAY: ${r.before.length} FRAMES OF ${r.before[0]!.name.replace(/_\d+$/, '').toUpperCase()}` });
  seqItems.push({ image: strip(r.frames.map((f, i) => stripCell(f, area, r.canvas, String(i)))), scale: 1, caption: `AFTER - THE NEW SEQUENCE: ${r.frames.length} FRAMES AT ${r.request.manifest.fps} FPS${r.request.manifest.loop ? ' LOOPING' : ''}` });
  sections.push(board('3 - THE SEQUENCE AT 1:1 (THE LINE IS THE GROUND, THE FAINT COLUMN THE PIVOT)', [], seqItems));
  sections.push(board('4 - REAL GAME SIZE (1 M = 65 PX; THE LEFTMOST CELL IS THE NEIGHBOUR CLIP FOR SIZE)', [], [{ image: realSize(r), scale: 1, caption: `${r.neighbour ? r.neighbour.name.toUpperCase() + ' THEN ' : ''}${r.names[0]!.toUpperCase()} ... ${r.names[r.names.length - 1]!.toUpperCase()}` }]));
  return stackVertical(sections);
}

function stackVertical(images: RgbaImage[]): RgbaImage {
  const w = Math.max(...images.map((i) => i.width));
  const h = images.reduce((s, i) => s + i.height, 0);
  const out = blank(w, h);
  let y = 0;
  for (const i of images) {
    blit(out, i, 0, y, 1);
    y += i.height;
  }
  return out;
}

/** Every frame at 4x with a grid in canvas pixels (a line every 10, stronger every 50, numbers every 20) so the anchors can be read off; the ones already given are drawn. */
export function anchorsGrid(r: ReportInput): RgbaImage {
  const Z = 4;
  const items: BoardItem[] = r.frames.map((f, k) => {
    const name = r.names[k]!;
    const area = unionBounds([f], 10, r.canvas);
    const base = enlarge(onDark(f, area), Z);
    const img = { ...base, data: new Uint8Array(base.data) };
    // the grid goes UNDER nothing: it is drawn over the figure in a faint line, so the figure stays readable
    for (let cx = Math.ceil(area.x0 / 10) * 10; cx <= area.x1; cx += 10) {
      const x = (cx - area.x0) * Z;
      for (let y = 0; y < img.height; y += cx % 50 === 0 ? 1 : 3) img.data.set(cx % 50 === 0 ? STRONG : FAINT, (y * img.width + x) * 4);
      if (cx % 20 === 0) drawText(img, String(cx), x + 2, 2, [210, 220, 240, 255], 1);
    }
    for (let cy = Math.ceil(area.y0 / 10) * 10; cy <= area.y1; cy += 10) {
      const y = (cy - area.y0) * Z;
      for (let x = 0; x < img.width; x += cy % 50 === 0 ? 1 : 3) img.data.set(cy % 50 === 0 ? STRONG : FAINT, (y * img.width + x) * 4);
      if (cy % 20 === 0) drawText(img, String(cy), 2, y + 2, [210, 220, 240, 255], 1);
    }
    const p = r.anchors.get(name);
    if (p) {
      const g = [(p.grip[0] - area.x0) * Z + Z / 2, (p.grip[1] - area.y0) * Z + Z / 2] as const;
      const t = [(p.tip[0] - area.x0) * Z + Z / 2, (p.tip[1] - area.y0) * Z + Z / 2] as const;
      line(img, g[0], g[1], t[0], t[1], [255, 255, 255, 255]);
      cross(img, g[0], g[1], 8, GRIP);
      cross(img, t[0], t[1], 8, TIP);
    }
    return { image: img, scale: 1, caption: `${name.toUpperCase()} - X ${area.x0}..${area.x1}  Y ${area.y0}..${area.y1}${p ? `  GRIP ${p.grip.join(',')}  TIP ${p.tip.join(',')}` : '  NO ANCHORS YET'}` };
  });
  return board(`${r.clip.toUpperCase()} - ANCHORS GRID (CANVAS PIXELS)`, ['READ THE GRIP (WHERE THE RIGHT HAND HOLDS THE BLADE) AND THE TIP OF EACH FRAME OFF THE GRID, AND WRITE THEM IN art/player/inbox/' + r.clip + '/anchors.json AS "FRAME": {"grip": [X, Y], "tip": [X, Y]}.'], items);
}

/** What `erase.json` took out, frame by frame: on the left the frame as it was handed in with the pixels that go in magenta, on the right the frame as it is delivered. */
export function erasedPicture(r: ReportInput, erased: readonly Erased[]): RgbaImage {
  const items: BoardItem[] = erased.map((e) => {
    const k = r.names.indexOf(e.name);
    const area = unionBounds([e.before], 6, r.canvas);
    const tinted = { width: e.before.width, height: e.before.height, data: new Uint8Array(e.before.data) };
    for (let i = 0; i < e.mask.length; i++) if (e.mask[i]) tinted.data.set([255, 0, 200, 255], i * 4);
    return { image: strip([enlarge(onDark(tinted, area), 2), enlarge(onDark(r.frames[k]!, area), 2)], 8), scale: 1, caption: `${e.name.toUpperCase()} - ${e.pixels} PX TAKEN OUT (MAGENTA, LEFT); THE FRAME AS DELIVERED, RIGHT` };
  });
  return board(`${r.clip.toUpperCase()} - WHAT erase.json TOOK OUT`, ['THE PIXELS INSIDE THE POLYGONS BECOME TRANSPARENT AND NOTHING ELSE CHANGES. THE DRAWING AS HANDED IN STAYS ARCHIVED, UNTOUCHED.'], items);
}

/** The sheet as the cut saw it: scaled to fit 1600 px, each pose boxed and numbered in reading order (for when the cut did not find the number of poses it was asked for). */
export function segmentationPicture(sheet: RgbaImage, boxes: readonly Box[]): RgbaImage {
  const k = Math.min(1, 1600 / sheet.width);
  const w = Math.max(1, Math.round(sheet.width * k));
  const h = Math.max(1, Math.round(sheet.height * k));
  const small = k === 1 ? { ...sheet, data: new Uint8Array(sheet.data) } : renderFrame(toDrawing(sheet), { width: w, height: h, scale: k, origin: { x: 0, y: 0 } }, { warp: null, samples: Math.max(3, Math.ceil(1 / k) + 1) });
  const out = blank(w, h, [255, 255, 255, 255]);
  blit(out, small, 0, 0, 1);
  boxes.forEach((b, i) => {
    const x0 = Math.round(b.x0 * k);
    const y0 = Math.round(b.y0 * k);
    const x1 = Math.round(b.x1 * k);
    const y1 = Math.round(b.y1 * k);
    fill(out, x0, y0, x1, y0 + 1, FAIL);
    fill(out, x0, y1 - 1, x1, y1, FAIL);
    fill(out, x0, y0, x0 + 1, y1, FAIL);
    fill(out, x1 - 1, y0, x1, y1, FAIL);
    const tag = String(i + 1);
    fill(out, x0, y0 - FONT_H * 2 - 4, x0 + textWidth(tag, 2) + 6, y0, FAIL);
    drawText(out, tag, x0 + 3, y0 - FONT_H * 2 - 2, [255, 255, 255, 255], 2);
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- the written report

export interface ReportMeta {
  inputs: Array<{ file: string; sha256: string }>;
  mode: 'sheet' | 'poses';
  notes: string[];
  nudges: Record<string, { dx: number; dy: number }>;
  anchorProblems: string[];
  /** The failures a person accepted on purpose (`waivers.json`): listed with their reasons, never hidden. */
  waived: Waived[];
  /** What a person took out of the drawing (`erase.json`): the painted effects, listed with their reasons, never hidden. */
  erased: Erased[];
}

const LEVEL_ES: Record<Level, string> = { ok: 'correcto', warn: 'aviso', fail: 'FALLO' };

export function reportMarkdown(r: ReportInput, meta: ReportMeta): string {
  const j = r.judgement;
  const row = (f: ClipJudgement['frames'][number]): string =>
    `| \`${f.name}\` | ${f.role} | ${f.phase ?? '—'} | **${LEVEL_ES[f.level]}** | ${f.eye === null ? '—' : f.eye.toFixed(1)} | ${f.head === null ? '—' : f.head.toFixed(1)} | ${(f.clean.paleEdge * 100).toFixed(1)} % | ${(f.clean.loose * 100).toFixed(2)} % | ${(f.clean.red * 100).toFixed(2)} % | ${f.massStep === null ? '—' : f.massStep.toFixed(2)} | ${f.heightM.toFixed(2)} × ${f.widthM.toFixed(2)} |`;
  const notes = j.frames.flatMap((f) => f.checks.filter((c) => c.level !== 'ok').map((c) => `- \`${f.name}\` · **${LEVEL_ES[c.level]}** · ${c.id}: ${c.text}`));
  const clipNotes = j.checks.map((c) => `- **${LEVEL_ES[c.level]}** · ${c.id}: ${c.text}`);
  return [
    `# Informe de recepción — \`${r.clip}\``,
    '',
    `> Lo escribe \`npm run assets:intake -- ${r.clip}\`. **Veredicto: ${LEVEL_ES[j.level]}.** ${j.level === 'fail' ? 'No se puede aceptar: hay fallos.' : j.level === 'warn' ? 'Se puede aceptar, pero mira primero los avisos en la hoja de contacto.' : 'Sin avisos: aun así, mira la hoja de contacto antes de aceptar (lo que no se puede medir —que es el MISMO personaje, que la espada está en la mano derecha, que la acción se lee— lo juzga una persona).'}`,
    '',
    `- **Entrada:** ${meta.mode === 'sheet' ? 'una hoja' : 'un PNG por pose'} — ${meta.inputs.map((i) => `\`${i.file}\``).join(', ')}.`,
    `- **Escala:** ×${r.scaling.factor.toFixed(4)} (${r.scaling.how === 'eye' ? 'por el ojo grande' : r.scaling.how === 'head' ? 'por el tamaño de la cabeza: la cabeza gira y el ojo se ve más pequeño o desaparece, así que no mide el tamaño de la pose' : r.scaling.how === 'given' ? 'dada con --scale' : 'fotogramas ya en el lienzo'}). Ojo de las poses de la hoja: ${r.scaling.eyes.map((e) => (e === null ? '—' : e.toFixed(1))).join(' · ')} px; mediana ${r.scaling.median === null ? '—' : r.scaling.median.toFixed(1)} px${r.scaling.proxy === 'head' ? '' : ` → ${r.scaling.target === null ? '—' : r.scaling.target.toFixed(1)} px en el lienzo`}. Cabeza de las poses de la hoja (el círculo más grande que cabe en la figura): ${r.scaling.heads.map((h) => (h === null ? '—' : h.toFixed(1))).join(' · ')} px; mediana ${r.scaling.headMedian === null ? '—' : r.scaling.headMedian.toFixed(1)} px${r.scaling.proxy === 'head' ? ` → ${r.scaling.headTarget === null ? '—' : r.scaling.headTarget.toFixed(1)} px en el lienzo` : ''}.`,
    `- **Fotogramas:** ${r.frames.length} de ${r.request.frames.length} pedidos, ${r.canvas.width} × ${r.canvas.height}, pivote (${r.canvas.pivot.join(', ')}).`,
    ...r.request.delivery ? [`- **Lo entregado frente a lo pedido:** ${r.request.delivery.asked ? `se pedían ${r.request.delivery.asked.frames} dibujos a ${r.request.delivery.asked.fps} fps; ` : ''}${r.request.delivery.note}`] : [],
    ...Object.keys(meta.nudges).length > 0 ? [`- **Ajustes de colocación (placement.json):** ${Object.entries(meta.nudges).map(([k, v]) => `\`${k}\` dx ${v.dx} dy ${v.dy}`).join(', ')}.`] : [],
    ...meta.notes.map((n) => `- ${n}`),
    '',
    '| Fotograma | Papel | Fase | Veredicto | Ojo (px) | Cabeza (px) | Halo | Sueltos | Rojo | Salto de masa (m) | Alto × ancho (m) |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...j.frames.map(row),
    '',
    '## Avisos y fallos',
    '',
    ...(notes.length + clipNotes.length > 0 ? [...clipNotes, ...notes] : ['Ninguno.']),
    ...(meta.waived.length > 0
      ? ['', '## Fallos aceptados a propósito (`waivers.json`)', '', 'La herramienta los daba por FALLO; una persona los acepta con el motivo que se lee aquí (el archivo se archiva con la entrega). En las tablas figuran como avisos.', '', ...meta.waived.flatMap((w) => [`- \`${w.key}\` — ${w.reason}`, ...w.was.map((t) => `  - la herramienta decía: ${t}`)])]
      : []),
    ...(meta.erased.length > 0
      ? [
          '',
          '## Píxeles borrados a propósito (`erase.json`)',
          '',
          'El dibujo traía efectos pintados dentro de la propia figura (arcos y estelas del tajo), donde el motor pone los suyos. Una persona marcó con polígonos —en píxeles del lienzo, como las anclas— lo que se quita: los píxeles de dentro pasan a transparentes y **nada más cambia** (ningún píxel se mueve, se recolorea ni se rehace). La herramienta se niega a borrar un píxel del cuerpo o un punto de la hoja de la espada. El dibujo entregado sigue archivado sin tocar: quitar `erase.json` y volver a entregar el clip lo devuelve entero. Lo quitado, en magenta, está en `erased.png`.',
          '',
          ...meta.erased.map((e) => `- \`${e.name}\` — ${e.pixels.toLocaleString('es-ES')} píxeles, ${e.polygons.length} ${e.polygons.length === 1 ? 'polígono' : 'polígonos'} — ${e.why}`),
        ]
      : []),
    ...(meta.anchorProblems.length > 0 ? ['', '## Anclas de la espada', '', ...meta.anchorProblems.map((p) => `- ${p}`)] : []),
    '',
    '## Qué mirar en `contact.png`',
    '',
    '1. Fila 1: los dibujos originales del usuario (intactos) y los fotogramas vecinos del juego.',
    '2. Fila 2: cada pose nueva sobre fondo oscuro, con su veredicto.',
    '3. Fila 3: la secuencia nueva a tamaño 1:1 sobre la línea del suelo, contra la de hoy.',
    '4. Fila 4: el tamaño real de juego junto al clip vecino.',
    ...(meta.erased.length > 0 ? ['5. `erased.png`: lo que quitó `erase.json` (en magenta) y el fotograma como se entrega.'] : []),
    '',
  ].join('\n');
}
