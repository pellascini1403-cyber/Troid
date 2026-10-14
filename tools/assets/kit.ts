import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { drawText, FONT_H, textWidth, type Rgba } from './bitmapFont';
import { clipEye, heroPaths } from './heroRepo';
import { decodePng, encodePng, type RgbaImage } from './png';

/**
 * THE PRODUCTION KIT OF THE PROTAGONIST'S MISSING DRAWINGS (docs/PROMPT10-LOG.md): everything a person (or an image generator) needs to draw the poses the sheet does not have, built from DATA
 * (`art/player/requests/requests.json`) and from the user's own pixels — and nothing of it is art:
 *
 *   • a reference board per clip: the user's own poses that matter for it (cut out of `hero-sheet.png` with no change, background and all) and the game's current frames of the neighbouring
 *     clips, side by side and labelled — what to attach to the generator;
 *   • a board of the character (the poses that define the design);
 *   • the canvas template (280 × 230 at 4×: the ground line, the pivot, the height of the standing and of the crouched body, the margin) with and without a faint ghost of the idle;
 *   • one brief per clip: why it is needed, the frames it asks for, the ready-to-paste prompt (English: what the generators read) and its Spanish twin, the negative prompt, the technical requirements.
 *
 * PURE: the same data and the same pixels give the same bytes, so the committed kit is checked against what this produces (`npm run assets:intake -- kit --check`).
 */

export interface ClipFrameRequest {
  role: string;
  phase: 'startup' | 'active' | 'recovery' | null;
  en: string;
  es: string;
}

export interface ClipRequest {
  group: string;
  /** The name the brief of the user gave the clip when the pipeline's is another (`attackAir` for `aerialAttack`): shown, never used as a file name. */
  alias?: string;
  priority: number;
  status: 'requested' | 'delivered';
  title: string;
  titleEs: string;
  why: string;
  gameplay: { seconds: number | null; ticks: number | null; note: string };
  manifest: { fps: number; loop: boolean; tags: string[]; phases: { startup: [number, number]; active: [number, number]; recovery: [number, number] } | null };
  placement: { anchorX: 'mass'; anchorY: 'ground' | 'mass' };
  /** The clip of the game whose frames say how big the eye of this one must be (its neighbour in play), and why. */
  scaleLike: string;
  scaleWhy: string;
  sword: boolean;
  /** What the blow must DO, which the tool checks on the anchors: its tip rises (the second blow) or drops (the blow in the air) by at least this many metres from the wind-up to the active phase. */
  intent?: { tipRises?: number; tipDrops?: number; es: string };
  limits: { heightM: [number, number]; widthM: [number, number] };
  references: { sheet: string[]; frames: string[]; extra?: string[]; note: string };
  frames: ClipFrameRequest[];
}

export interface Requests {
  comment: string;
  version: number;
  canvas: { width: number; height: number; pivot: [number, number]; artPxPerMeter: number; margin: number };
  scale: { tolerance: number; note: string };
  sheetPoses: Record<string, { box: [number, number, number, number]; what: string }>;
  character: {
    designEn: string[];
    designEs: string[];
    rulesEn: string[];
    rulesEs: string[];
    negativeEn: string;
    layoutEn: string[];
    layoutEs: string[];
  };
  clips: Record<string, ClipRequest>;
}

export interface KitSources {
  requests: Requests;
  /** `art/player/source/hero-sheet.png`, decoded: the user's drawing. */
  sheet: RgbaImage;
  /** Reads a frame of the game's protagonist (`idle_00`) or any PNG of the repository (a path relative to `art/`). */
  frame(name: string): RgbaImage;
  /** A PNG of the repository outside the protagonist's folder (the vial), by its path from the repository's root. */
  art(path: string): RgbaImage;
  /** The diameter in pixels of the big eye of the frames of a clip of the game (their median), or `null` when none can be measured. */
  eye(clip: string): number | null;
}

const WHITE: Rgba = [255, 255, 255, 255];
const INK: Rgba = [16, 24, 40, 255];
const MUTED: Rgba = [90, 100, 120, 255];
const WARN: Rgba = [176, 40, 40, 255];
const PAD = 14;

export const blank = (width: number, height: number, color: Rgba = WHITE): RgbaImage => {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(color, i * 4);
  return { width, height, data };
};

/** `src` laid onto `dst` at (x, y), over the white of the board: opaque pixels replace, soft ones blend. Nothing is resampled. */
export function blit(dst: RgbaImage, src: RgbaImage, x: number, y: number, scale = 1): void {
  for (let sy = 0; sy < src.height * scale; sy++) {
    for (let sx = 0; sx < src.width * scale; sx++) {
      const dx = x + sx;
      const dy = y + sy;
      if (dx < 0 || dy < 0 || dx >= dst.width || dy >= dst.height) continue;
      const s = (((sy / scale) | 0) * src.width + ((sx / scale) | 0)) * 4;
      const a = src.data[s + 3]! / 255;
      if (a === 0) continue;
      const o = (dy * dst.width + dx) * 4;
      for (let c = 0; c < 3; c++) dst.data[o + c] = Math.round(src.data[s + c]! * a + dst.data[o + c]! * (1 - a));
      dst.data[o + 3] = 255;
    }
  }
}

export function crop(img: RgbaImage, [x0, y0, x1, y1]: readonly [number, number, number, number]): RgbaImage {
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) data.set(img.data.subarray(((y0 + y) * img.width + x0) * 4, ((y0 + y) * img.width + x0 + w) * 4), y * w * 4);
  return { width: w, height: h, data };
}

/** `text` broken into lines no wider than `maxWidth` pixels at `scale` (words are kept whole). */
export function wrap(text: string, maxWidth: number, scale: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line === '' ? word : `${line} ${word}`;
    if (textWidth(next, scale) > maxWidth && line !== '') {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line !== '') lines.push(line);
  return lines;
}

export interface BoardItem {
  image: RgbaImage;
  scale: number;
  caption: string;
  warn?: boolean;
}

/** Lays items in a row (wrapping to the next when the row is full), each with its caption below, under a title and a legend. */
export function board(title: string, legend: string[], items: BoardItem[], maxWidth = 2000): RgbaImage {
  const TS = 3;
  const CS = 2;
  const lineH = (FONT_H + 3) * CS;
  // pass 1: positions
  interface Placed { item: BoardItem; x: number; y: number; w: number; h: number; lines: string[] }
  const placed: Placed[] = [];
  let x = PAD;
  let rowTop = PAD * 2 + (FONT_H + 4) * TS + legend.length * lineH;
  let rowH = 0;
  let width = 0;
  for (const item of items) {
    const w = Math.max(item.image.width * item.scale, 220);
    const lines = wrap(item.caption, w, CS);
    const h = item.image.height * item.scale + PAD / 2 + lines.length * lineH;
    if (x + w + PAD > maxWidth && x > PAD) {
      x = PAD;
      rowTop += rowH + PAD * 2;
      rowH = 0;
    }
    placed.push({ item, x, y: rowTop, w, h, lines });
    x += w + PAD * 2;
    rowH = Math.max(rowH, h);
    width = Math.max(width, x - PAD);
  }
  const height = rowTop + rowH + PAD;
  // the legend lines are drawn as they are (no wrapping): the board is at least as wide as the widest of them
  const img = blank(Math.max(width, textWidth(title, TS) + PAD * 2, ...legend.map((l) => textWidth(l, CS) + PAD * 2)), height);
  drawText(img, title, PAD, PAD, INK, TS);
  legend.forEach((l, i) => drawText(img, l, PAD, PAD * 2 + (FONT_H + 4) * TS + i * lineH, MUTED, CS));
  for (const p of placed) {
    blit(img, p.item.image, p.x + Math.floor((p.w - p.item.image.width * p.item.scale) / 2), p.y, p.item.scale);
    p.lines.forEach((l, i) => drawText(img, l, p.x, p.y + p.item.image.height * p.item.scale + PAD / 2 + i * lineH, p.item.warn ? WARN : INK, CS));
  }
  return img;
}

export const sheetItem = (s: KitSources, id: string): BoardItem => {
  const p = s.requests.sheetPoses[id];
  if (!p) throw new Error(`the requests name a pose of the sheet that is not described: ${id}`);
  const attitudeOnly = /ATTITUDE ONLY|not usable/.test(p.what);
  return { image: crop(s.sheet, p.box), scale: 1, caption: `${id.toUpperCase()} (the user's own drawing, untouched): ${p.what}`, warn: attitudeOnly };
};

/** The part of `img` that holds anything (alpha > 0) with `pad` pixels around it: only the empty margin of a frame's canvas is dropped, so the board does not show a figure floating in a big blank. */
export function trim(img: RgbaImage, pad: number): RgbaImage {
  let x0 = img.width;
  let y0 = img.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3]! === 0) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) return img;
  return crop(img, [Math.max(0, x0 - pad), Math.max(0, y0 - pad), Math.min(img.width - 1, x1 + pad), Math.min(img.height - 1, y1 + pad)]);
}

export const frameItem = (s: KitSources, name: string): BoardItem => ({ image: trim(s.frame(name), 6), scale: 2, caption: `${name} (the game's current frame, x2: the same figure at half the drawing's size)` });

/** The items of the reference board of one clip: the user's own poses that matter for it and the game's current frames of the neighbouring clips. */
export function referenceItems(s: KitSources, clip: string): BoardItem[] {
  const c = s.requests.clips[clip];
  if (!c) throw new Error(`there is no clip "${clip}" in the requests`);
  const items: BoardItem[] = [...c.references.sheet.map((id) => sheetItem(s, id)), ...c.references.frames.map((n) => frameItem(s, n))];
  for (const path of c.references.extra ?? []) items.push({ image: trim(s.art(path), 6), scale: 2, caption: `${path} (the game's own pickup, x2: a provisional drawing, its silhouette and colour only)` });
  return items;
}

/** The reference board of one clip: the poses to attach to the generator. */
export function referenceBoard(s: KitSources, clip: string): RgbaImage {
  return board(
    `${clip.toUpperCase()} - REFERENCE BOARD`,
    [
      'ATTACH THIS TO THE IMAGE GENERATOR WITH THE CHARACTER BOARD. THE USER\'S DRAWINGS ARE THE ONLY SOURCE OF THE DESIGN.',
      'WHERE A CAPTION SAYS ATTITUDE ONLY: TAKE THE POSE AND NOTHING ELSE - NO RED, NO EFFECTS, NO STREAKS.',
    ],
    referenceItems(s, clip),
  );
}

/** The poses that define the character: what to attach to every request. */
export function characterBoard(s: KitSources): RgbaImage {
  const ids = ['pose1', 'pose2', 'pose7', 'pose12'];
  return board(
    'THE CHARACTER - ATTACH THIS TO EVERY REQUEST',
    [
      'THE EYES (THREE WHITE HIGHLIGHTS), THE ANTENNAE, THE DARK DOME HEAD WITH ITS CREST, THE ARMOUR WITH CYAN LINES AND THE SWORD ARE THE DESIGN: DO NOT CHANGE ANY OF IT.',
      'ALSO ATTACH art/player/source/hero-portrait.jpg (THE USER\'S PORTRAIT) DIRECTLY.',
    ],
    ids.map((id) => sheetItem(s, id)),
  );
}

/** The canvas of the frames at 4x with its guides — layout lines, not art. With `ghost`, the idle's first frame behind them at 35%. */
export function canvasTemplate(s: KitSources, ghost: boolean): RgbaImage {
  const { width, height, pivot, artPxPerMeter, margin } = s.requests.canvas;
  const Z = 4;
  const img = blank(width * Z, height * Z + 40, [250, 250, 250, 255]);
  if (ghost) {
    const idle = s.frame('idle_00');
    for (let y = 0; y < idle.height * Z; y++) {
      for (let x = 0; x < idle.width * Z; x++) {
        const k = (((y / Z) | 0) * idle.width + ((x / Z) | 0)) * 4;
        const a = (idle.data[k + 3]! / 255) * 0.35;
        if (a === 0) continue;
        const o = (y * img.width + x) * 4;
        for (let c = 0; c < 3; c++) img.data[o + c] = Math.round(idle.data[k + c]! * a + img.data[o + c]! * (1 - a));
      }
    }
  }
  const line = (x0: number, y0: number, x1: number, y1: number, color: Rgba): void => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < img.width && y < height * Z) img.data.set(color, (y * img.width + x) * 4);
  };
  const px = (m: number): number => Math.round(m * artPxPerMeter) * Z;
  // 0.5 m grid, faint
  for (let m = 0; m * artPxPerMeter < width; m += 0.5) line(pivot[0] * Z + px(m), 0, pivot[0] * Z + px(m), height * Z - 1, [228, 232, 240, 255]);
  for (let m = 0; m * artPxPerMeter < width; m += 0.5) line(pivot[0] * Z - px(m), 0, pivot[0] * Z - px(m), height * Z - 1, [228, 232, 240, 255]);
  for (let m = 0; m * artPxPerMeter < height; m += 0.5) line(0, pivot[1] * Z - px(m), width * Z - 1, pivot[1] * Z - px(m), [228, 232, 240, 255]);
  // margin box
  line(margin * Z, margin * Z, width * Z - margin * Z, margin * Z + 1, [230, 160, 160, 255]);
  line(margin * Z, (height - margin) * Z, width * Z - margin * Z, (height - margin) * Z + 1, [230, 160, 160, 255]);
  line(margin * Z, margin * Z, margin * Z + 1, (height - margin) * Z, [230, 160, 160, 255]);
  line((width - margin) * Z, margin * Z, (width - margin) * Z + 1, (height - margin) * Z, [230, 160, 160, 255]);
  // standing 1.7 m and crouched 1.0 m body heights, the ground and the pivot
  line(0, pivot[1] * Z - px(1.7), width * Z - 1, pivot[1] * Z - px(1.7) + 1, [90, 140, 220, 255]);
  line(0, pivot[1] * Z - px(1.0), width * Z - 1, pivot[1] * Z - px(1.0) + 1, [90, 190, 150, 255]);
  line(0, pivot[1] * Z, width * Z - 1, pivot[1] * Z + 2, [40, 60, 90, 255]);
  line(pivot[0] * Z - 14, pivot[1] * Z - 1, pivot[0] * Z + 14, pivot[1] * Z + 1, [200, 40, 40, 255]);
  line(pivot[0] * Z - 1, pivot[1] * Z - 14, pivot[0] * Z + 1, pivot[1] * Z + 14, [200, 40, 40, 255]);
  drawText(img, 'GROUND / FEET ROW 192', 6, pivot[1] * Z + 8, [40, 60, 90, 255], 2);
  drawText(img, 'STANDING BODY 1.7 M', 6, pivot[1] * Z - px(1.7) - 18, [60, 100, 180, 255], 2);
  drawText(img, 'CROUCHED BODY 1.0 M', 6, pivot[1] * Z - px(1.0) - 18, [40, 140, 100, 255], 2);
  drawText(img, 'PIVOT (120,192)', pivot[0] * Z + 20, pivot[1] * Z - 40, [200, 40, 40, 255], 2);
  drawText(img, `${width} X ${height} PX, ${artPxPerMeter} PX PER METRE, 4X. GRID 0.5 M. LAYOUT GUIDES, NOT ART.`, 6, height * Z + 12, MUTED, 2);
  return img;
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ text

const bullets = (lines: readonly string[]): string => lines.map((l, i) => `${i + 1}. ${l}`).join('\n');

/** The prompt of a clip, in English (what the generators read) or Spanish (the same, for the person who reads it first). */
export function buildPrompt(r: Requests, clip: string, lang: 'en' | 'es'): string {
  const c = r.clips[clip];
  if (!c) throw new Error(`there is no clip "${clip}" in the requests`);
  const n = c.frames.length;
  if (lang === 'es') {
    return [
      `Crea UNA hoja de sprites para un juego de plataformas 2D de scroll lateral: ${n} poses del MISMO personaje ya existente, en una sola fila de izquierda a derecha y en el orden indicado.`,
      '',
      'EL PERSONAJE — copia exactamente las imágenes de referencia adjuntas. Ya existe: NO lo rediseñes, no lo restilices ni lo reinterpretes:',
      bullets(r.character.designEs),
      '',
      'REGLAS ESTRICTAS',
      bullets(r.character.rulesEs),
      '',
      `ESTA HOJA: ${c.titleEs}.`,
      `POSES (de izquierda a derecha, TODAS exactamente a la misma escala):`,
      ...c.frames.map((f, i) => `${i + 1}. ${f.es}`),
      '',
      'DISPOSICIÓN',
      bullets(r.character.layoutEs),
    ].join('\n');
  }
  return [
    `Create ONE sprite sheet for a 2D side-scrolling platformer: ${n} poses of the SAME existing character, in a single row from left to right in the order given.`,
    '',
    'THE CHARACTER — copy the attached reference images exactly. It already exists: do NOT redesign, restyle or reinterpret it:',
    bullets(r.character.designEn),
    '',
    'STRICT RULES',
    bullets(r.character.rulesEn),
    '',
    `THIS SHEET: ${c.title}.`,
    'POSES (left to right, ALL at exactly the same scale):',
    ...c.frames.map((f, i) => `${i + 1}. ${f.en}`),
    '',
    'LAYOUT',
    bullets(r.character.layoutEn),
  ].join('\n');
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** What the brief says about the size of the figure: one factor per sheet, set by the big eye, against the frames of the clip the new one sits next to in play. */
export function scaleLine(r: Requests, clip: string, eye: number | null): string {
  const c = r.clips[clip]!;
  const target = eye === null ? 'el del clip vecino' : `${(Math.round(eye * 10) / 10).toFixed(1)} px de diámetro`;
  return `la herramienta mide el ojo grande de la figura en cada pose de la hoja y lleva la hoja ENTERA, con un único factor (las poses conservan los tamaños relativos que les dio quien las dibujó), a que su mediana mida ${target} —lo que miden los fotogramas del clip \`${c.scaleLike}\` del juego, ${c.scaleWhy}—. ${r.scale.note} Por eso no importa el tamaño en píxeles de lo que devuelva el generador, pero SÍ que todas las poses de la hoja estén a la misma escala entre sí: la herramienta avisa cuando el ojo de una pose se aparta más de ±${Math.round(r.scale.tolerance * 100)} % de la mediana de la hoja y la rechaza cuando se aparta más del doble. Una excepción, para las poses en las que la cabeza se gira o cae (el ojo se ve más pequeño o desaparece): si los ojos de la hoja discrepan pero sus CABEZAS (el círculo más grande que cabe en la figura) coinciden entre sí dentro de esa misma tolerancia, la hoja se escala y se juzga por el tamaño de la cabeza y no por el ojo; si las cabezas también discrepan, es una diferencia de escala real y se rechaza como siempre.`;
}

/** The brief of a clip (Spanish, with the English prompt the generators read). `eye`: the big eye of the clip it must match, in pixels (see `scaleLine`). */
export function buildBrief(r: Requests, clip: string, eye: number | null = null): string {
  const c = r.clips[clip]!;
  const n = c.frames.length;
  const ph = c.manifest.phases;
  const rows = c.frames.map((f, i) => `| ${i} | \`${clip}_${pad2(i)}.png\` | ${f.role} | ${f.phase ?? '—'} | ${f.es} |`);
  const dur = c.gameplay.seconds !== null ? `${c.gameplay.seconds.toFixed(3)} s (${n} fotogramas a ${c.manifest.fps} fps)` : c.manifest.loop ? `bucle: ${n} fotogramas a ${c.manifest.fps} fps = ${(n / c.manifest.fps).toFixed(2)} s por vuelta` : `lo marcan las fases de la simulación (${n} fotogramas)`;
  return [
    `# ${c.titleEs} — \`${clip}\`${c.alias ? ` (en el encargo: \`${c.alias}\`)` : ''} (grupo ${c.group} · prioridad ${c.priority})`,
    '',
    `> **Estado: ${c.status === 'requested' ? 'PEDIDO — los dibujos no existen todavía' : 'ENTREGADO'}.** Este archivo lo escribe \`npm run assets:intake -- kit\` a partir de \`../requests.json\`: no se edita a mano.`,
    '',
    '## Por qué hace falta',
    '',
    c.why,
    '',
    `## Lo que hay que entregar: ${n} dibujos`,
    '',
    '| # | Archivo final | Papel | Fase del golpe | Qué muestra |',
    '|---|---|---|---|---|',
    ...rows,
    '',
    `- **Cuánto dura:** ${dur}.`,
    ph ? `- **Fases** (índices de fotograma, inclusivos): preparación ${ph.startup[0]}–${ph.startup[1]} · activa ${ph.active[0]}–${ph.active[1]} · recuperación ${ph.recovery[0]}–${ph.recovery[1]}.` : '- **Fases:** ninguna (no es un golpe).',
    `- **Lo que fija el juego:** ${c.gameplay.note}`,
    `- **Colocación:** ${c.placement.anchorY === 'ground' ? 'lo más bajo de la figura (los pies; la hoja de la espada solo si es lo que toca el suelo) en la fila 192, el suelo' : 'el cuerpo en el aire: el centro de masa a 1.0 m sobre el pivote (a la altura de la fila 127)'}; el centro del cuerpo (torso y cabeza, sin la espada, las antenas ni la capa) en la columna 120, donde está centrada la caja del jugador. Lo hace la herramienta; si un fotograma queda mal, se corrige con \`placement.json\` (ver la guía).`,
    `- **Espada:** ${c.sword ? 'sí, en la mano derecha en TODOS los fotogramas. Cada fotograma necesita dos anclas, la empuñadura (`grip`: donde la mano agarra la hoja) y la punta (`tip`); las lee quien integra sobre la cuadrícula que dibuja la herramienta (`anchors-grid.png`) y las escribe en `art/player/inbox/' + clip + '/anchors.json`' : 'no hace falta ninguna ancla'}.`,
    ...(c.intent ? [`- **Intención del golpe** (la herramienta lo comprueba con las anclas): ${c.intent.es}.`] : []),
    `- **Tamaño de la figura** (con las antenas): ${c.limits.heightM[0]}–${c.limits.heightM[1]} m de alto y ${c.limits.widthM[0]}–${c.limits.widthM[1]} m de ancho a ${r.canvas.artPxPerMeter} px por metro.`,
    `- **Referencias:** ${c.references.note}`,
    '',
    '## Cómo producirlo',
    '',
    `1. Adjunta al generador de imágenes **\`art/player/requests/${clip}/reference.png\`**, **\`art/player/requests/character-reference.png\`** y **\`art/player/source/hero-portrait.jpg\`** (el retrato del usuario). El generador tiene que ver los dibujos del usuario: sin ellos inventa otro personaje.`,
    '2. Pega el **prompt en inglés** de abajo (los generadores lo leen mejor; el gemelo en español está debajo). **Una hoja por clip**: todas las poses en una fila sobre fondo blanco.',
    `3. Guarda lo que salga en **\`art/player/inbox/${clip}/\`**: la hoja entera como \`sheet.png\`, o un PNG por pose (\`${clip}_00.png\` …, en orden). Solo PNG: si el generador devuelve JPEG o WebP, conviértelo (\`magick in.webp out.png\`). Si la hoja trae fondo transparente, se usa tal cual; si trae fondo blanco liso, la herramienta lo quita (solo operaciones técnicas, no se pinta nada).`,
    `4. \`npm run assets:intake -- ${clip}\` recorta las ${n} poses, las escala, las coloca y las **comprueba** (transparencia, halos, piezas sueltas, escala, centro de masa, paleta${c.sword ? ', la espada' : ''}) y escribe la **hoja de contacto comparativa** en \`art/player/inbox/_reports/${clip}/contact.png\`${c.sword ? ' y la cuadrícula para leer las anclas (`anchors-grid.png`)' : ''}. **Nada se integra solo**: \`npm run assets:intake -- ${clip} --accept\`, y solo si no hay ningún fallo y lo aceptado es exactamente lo que enseña la hoja de contacto, lo integra por el mecanismo \`delivered\` de \`hero.rig.json\`.`,
    '',
    '## Prompt (copiar y pegar)',
    '',
    '```text',
    buildPrompt(r, clip, 'en'),
    '```',
    '',
    '### Prompt negativo (si el generador lo admite)',
    '',
    '```text',
    r.character.negativeEn,
    '```',
    '',
    '### El mismo prompt en español',
    '',
    '```text',
    buildPrompt(r, clip, 'es'),
    '```',
    '',
    '## Requisitos técnicos de integración',
    '',
    `- **Lienzo final:** ${r.canvas.width} × ${r.canvas.height} px, PNG RGBA de 8 bits, fondo **transparente**, pivote (${r.canvas.pivot[0]}, ${r.canvas.pivot[1]}), ${r.canvas.artPxPerMeter} px de arte por metro, margen ≥ ${r.canvas.margin} px por todos los lados. La herramienta de recepción lo consigue desde una hoja sobre fondo blanco con **solo operaciones técnicas** (fondo transparente, un único factor de escala por hoja, una traslación): no se pinta nada.`,
    `- **Escala:** ${scaleLine(r, clip, eye)}`,
    '- **Nombres:** `<clip>_NN.png` con dos dígitos, desde `00`, sin huecos.',
    '- **Sin efectos, sin sombra, sin suelo, sin rojo**: el juego pinta sus propios efectos (cian) sobre la figura.',
    '- **Mirando a la derecha**: el motor la espeja al mirar a la izquierda.',
    `- **Entrada en el manifiesto** (la escribe la herramienta): \`{ "frames": "${clip}_", "count": ${n}, "fps": ${c.manifest.fps}, "loop": ${c.manifest.loop}, "tags": ${JSON.stringify(c.manifest.tags)}${ph ? `, "phases": ${JSON.stringify(ph)}` : ''} }\` y se añade \`"${clip}"\` a \`delivered\` de \`art/player/source/hero.rig.json\`. Sin la etiqueta \`stand-in\`: \`npm run assets:missing\` deja de contarlo como pendiente.`,
    '',
    '## Antes de darla por buena (lo que comprueba la herramienta y lo que no puede)',
    '',
    '- [ ] Transparencia correcta, sin halo claro en el borde ni píxeles sueltos (la herramienta lo mide).',
    '- [ ] Tamaño y centro de masa coherentes con los clips vecinos (la herramienta lo mide).',
    '- [ ] Paleta del personaje: casi negro, azul marino, cian y blanco en los ojos; **ningún rojo de efecto** (la herramienta lo mide).',
    '- [ ] **Mirando la hoja de contacto**: es el MISMO personaje (los ojos con sus tres reflejos, las antenas finas, la cresta, la armadura), sin partes duplicadas ni extremidades imposibles, y la acción se lee a tamaño de juego (lo mira una persona: no se automatiza).',
    c.sword ? '- [ ] **La espada, en la mano derecha, en todos los fotogramas**, con la misma hoja que la referencia (se comprueba con las anclas dibujadas sobre cada fotograma).' : '- [ ] Si lleva la espada, es la misma de la referencia y está en la mano derecha.',
    '',
  ].join('\n');
}

export function buildReadme(r: Requests): string {
  const byOrder = (a: [string, ClipRequest], b: [string, ClipRequest]): number => a[1].priority - b[1].priority || a[1].group.localeCompare(b[1].group);
  const clips = Object.entries(r.clips).filter(([, c]) => c.status === 'requested').sort(byOrder);
  const done = Object.entries(r.clips).filter(([, c]) => c.status === 'delivered').sort(byOrder);
  const total = clips.reduce((n, [, c]) => n + c.frames.length, 0);
  return [
    '# Los dibujos que faltan del protagonista — kit de producción',
    '',
    '> **Lo que es esto.** El Prompt 9 animó al protagonista moviendo los dibujos de tu hoja; **los clips de esta lista siguen siendo *stand-ins*** (o, en el caso de `walk`, un único dibujo deformado): el movimiento es real, pero el dibujo es el de otra acción, porque la hoja no tiene uno para ella. Un dibujo solo se puede deformar, **no mirar desde otro lado**: esos clips necesitan DIBUJOS NUEVOS del mismo personaje. En el Prompt 10 **no había ninguna herramienta de generación de imágenes** en el entorno (ni de edición que pudiera hacerlo sin inventar), así que **no se ha dibujado nada**: este kit es lo que hace falta para que alguien (tú, un artista o un generador de imágenes) los dibuje sin ambigüedad, y la herramienta que los recibe, comprueba e integra.',
    '>',
    `> **Cuánto es:** ${clips.length} clips y **${total} dibujos** en total (sin contar los clips que ya tienen dibujo propio). Cada clip es **una hoja** (todas sus poses en una fila, sobre fondo blanco, como tu hoja de poses): ${clips.length} generaciones. Este archivo y los \`brief.md\` los escribe \`npm run assets:intake -- kit\` desde \`requests.json\`.${done.length > 0 ? ` Ya entregados y aceptados (ya no se piden): ${done.map(([k]) => `\`${k}\``).join(', ')}.` : ''}`,
    '',
    '## Los tres pasos',
    '',
    '1. **Genera** una hoja por clip (en este orden: A, B, C, luego D–G, luego H–J). De cada clip: `<clip>/brief.md` tiene el *prompt* listo para pegar; `<clip>/reference.png` y `character-reference.png` (y `../source/hero-portrait.jpg`) son lo que se adjunta al generador.',
    '2. **Suelta** el resultado en `art/player/inbox/<clip>/` (la hoja entera como `sheet.png`, o un PNG por pose `<clip>_00.png` …).',
    '3. **`npm run assets:intake -- <clip>`**: recorta, escala, coloca y comprueba, y escribe la hoja de contacto comparativa (el dibujo original · la pose nueva · la secuencia · el tamaño real de juego) en `art/player/inbox/_reports/<clip>/`. Cuando la hoja se vea bien: **`npm run assets:intake -- <clip> --accept`** la integra por el mecanismo `delivered`. **`npm run assets:intake -- status`** dice, clip por clip, qué tiene dibujo propio, qué es *stand-in* y qué hay en la bandeja.',
    '',
    '## Los clips, por orden de producción',
    '',
    '| Grupo | Clip | Dibujos | Qué sustituye | Brief |',
    '|---|---|---|---|---|',
    ...clips.map(([k, c]) => `| ${c.group} | \`${k}\` | ${c.frames.length} | ${c.why.split('. ')[0]}. | [\`${k}/brief.md\`](${k}/brief.md) |`),
    '',
    '## Lo que NO se hace (reglas del encargo)',
    '',
    '- No se rediseña al protagonista: nada humano, ni pelo, ni máscara nueva, ni ropa inventada; la cabeza, la silueta, las proporciones y la paleta son las de tus dibujos.',
    '- No se pinta rojo: los efectos (el arco del tajo, la estela del *dash*) los pone el juego, en cian. Los dibujos 8, 9 y 10 de tu hoja (con el rojo fundido) **no se usan**: solo se enseñan como actitud.',
    '- `hero-sheet.png` y `hero-portrait.jpg` no se tocan jamás.',
    '- La espada, en la mano derecha, es **la misma hoja de tus dibujos**.',
    '',
    '## Guías',
    '',
    '- `canvas-template.png` y `canvas-template-idle.png`: el lienzo a 4× con el suelo, el pivote, las alturas del cuerpo de pie (1.7 m) y agachado (1.0 m) y el margen: **guías de composición, no arte**.',
    '- Cómo se entrega y por qué no se sobrescribe lo ya aprobado: [`docs/guides/deliver-protagonist-art.md`](../../../docs/guides/deliver-protagonist-art.md) §4.',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- assembling

/** Every file of the kit, by path relative to `art/player/requests/`: `string` for text, a PNG `Buffer` for images. */
export function buildKit(s: KitSources): Map<string, string | Buffer> {
  const out = new Map<string, string | Buffer>();
  out.set('README.md', buildReadme(s.requests));
  out.set('character-reference.png', encodePng(characterBoard(s)));
  out.set('canvas-template.png', encodePng(canvasTemplate(s, false)));
  out.set('canvas-template-idle.png', encodePng(canvasTemplate(s, true)));
  for (const [clip, c] of Object.entries(s.requests.clips)) {
    if (c.status !== 'requested') continue;
    out.set(`${clip}/brief.md`, buildBrief(s.requests, clip, s.eye(c.scaleLike)));
    out.set(`${clip}/reference.png`, encodePng(referenceBoard(s, clip)));
  }
  return out;
}

/** The sources of the real repository. */
export function readKitSources(root: string): KitSources {
  const paths = heroPaths(root);
  const requests = JSON.parse(readFileSync(paths.requests, 'utf8')) as Requests;
  const sheet = decodePng(readFileSync(paths.sheet));
  const eyes = new Map<string, number | null>();
  return {
    requests,
    sheet,
    frame: (name) => decodePng(readFileSync(join(paths.hero, `${name}.png`))),
    art: (path) => decodePng(readFileSync(join(root, path))),
    eye: (clip) => {
      if (!eyes.has(clip)) eyes.set(clip, clipEye(root, clip));
      return eyes.get(clip)!;
    },
  };
}
