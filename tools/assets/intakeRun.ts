import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { animate } from './animate';
import { buildArt, formatReport } from './build';
import { clipFrameNames, clipHead, heroPaths, readClips, readDelivered, readHeroFrame } from './heroRepo';
import { applyWaivers, chooseScale, cutLoose, cutSheet, IntakeError, judgeFrames, manifestAnchors, parseAnchors, parseWaivers, placeFrame, type Canvas, type ClipJudgement, type Cut, type Level, type Placed, type Scaling, type SwordPoints, type Waived } from './intake';
import { anchorsGrid, contactSheet, reportMarkdown, segmentationPicture, type ReportInput, type ReportMeta } from './intakeReport';
import { buildKit, readKitSources, referenceItems, type ClipRequest, type Requests } from './kit';
import { decodePng, encodePng, type RgbaImage } from './png';

/**
 * THE RECEPTION OF THE PROTAGONIST'S NEW DRAWINGS, the half that touches files (docs/PROMPT10-LOG.md): read what was dropped in `art/player/inbox/<clip>/`, prepare the frames, judge them and
 * write the report a person looks at (`prepareClip` + `writeReport`); and, only on that person's word, hand the frames over through the `delivered` mechanism the pipeline already has
 * (`acceptClip`). Nothing here decides that a drawing is good: it measures what can be measured, shows the rest, and refuses what is measurably broken.
 */

const pad2 = (n: number): string => String(n).padStart(2, '0');
const sha = (data: Uint8Array | string): string => createHash('sha256').update(data).digest('hex');
const natural = (a: string, b: string): number => a.localeCompare(b, 'en', { numeric: true });

export const reportDir = (root: string, clip: string): string => join(heroPaths(root).inbox, '_reports', clip);

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ the inbox

export interface Inbox {
  mode: 'sheet' | 'poses';
  /** Names, in order, relative to the clip's inbox folder. */
  files: string[];
  bytes: Buffer[];
  /** PNG files in the folder that are not read (there is a `sheet.png`, which wins). */
  ignored: string[];
}

const IGNORED = new Set(['anchors.json', 'placement.json', 'waivers.json', 'anchors.template.json']);

/** What is in `art/player/inbox/<clip>/`: `sheet.png` (one sheet), or one PNG per pose in natural order. `null` when there is nothing. Anything that is not a PNG is refused with the way out. */
export function readInbox(dir: string): Inbox | null {
  if (!existsSync(dir)) return null;
  const names = readdirSync(dir)
    .filter((f) => !f.startsWith('.') && !f.startsWith('_') && !IGNORED.has(f) && statSync(join(dir, f)).isFile())
    .sort(natural);
  if (names.length === 0) return null;
  const notPng = names.filter((n) => !/\.png$/i.test(n));
  if (notPng.length > 0) throw new IntakeError(`only PNG is read: convert ${notPng.join(', ')} (for example \`magick ${notPng[0]} ${notPng[0]!.replace(/\.[^.]+$/, '')}.png\`) and drop the PNG instead`);
  const sheet = names.find((n) => n.toLowerCase() === 'sheet.png');
  const use = sheet ? [sheet] : names;
  return { mode: sheet ? 'sheet' : 'poses', files: use, bytes: use.map((n) => readFileSync(join(dir, n))), ignored: sheet ? names.filter((n) => n !== sheet) : [] };
}

function decodeAll(inbox: Inbox): RgbaImage[] {
  return inbox.files.map((name, i) => {
    try {
      return decodePng(inbox.bytes[i]!);
    } catch (e) {
      throw new IntakeError(`${name} is not a PNG this tool can read (${e instanceof Error ? e.message : String(e)}): re-export it as an 8-bit RGBA PNG without interlacing`);
    }
  });
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ preparing

export interface Prepared {
  clip: string;
  request: ClipRequest;
  requests: Requests;
  canvas: Canvas;
  inbox: Inbox;
  cut: Cut;
  scaling: Scaling;
  names: string[];
  frames: RgbaImage[];
  placed: Placed[];
  anchors: { points: Map<string, SwordPoints>; problems: string[]; text: string | null };
  nudges: Record<string, { dx: number; dy: number }>;
  judgement: ClipJudgement;
  /** The failures a person accepted on purpose (`waivers.json`), already turned into warnings in `judgement`. */
  waived: Waived[];
  /** Every file of the report, by path relative to `art/player/inbox/_reports/<clip>/`. */
  files: Map<string, Buffer | string>;
  /** What `report.json` carries: the fingerprint `acceptClip` checks. */
  fingerprint: Fingerprint;
}

export interface Fingerprint {
  clip: string;
  level: Level;
  inputs: Array<{ file: string; sha256: string }>;
  scale: { factor: number; how: string; proxy: string; target: number | null; headTarget: number | null };
  anchors: string | null;
  placement: string | null;
  /** The hash of `waivers.json` (the failures accepted on purpose), or `null` when there is none. */
  waivers?: string | null;
  frames: Array<{ name: string; sha256: string; level: Level }>;
}

const readText = (file: string): string | null => (existsSync(file) ? readFileSync(file, 'utf8') : null);

function readNudges(text: string | null, names: readonly string[]): Record<string, { dx: number; dy: number }> {
  if (text === null) return {};
  let raw: Record<string, { dx?: unknown; dy?: unknown }>;
  try {
    raw = JSON.parse(text) as Record<string, { dx?: unknown; dy?: unknown }>;
  } catch (e) {
    throw new IntakeError(`placement.json is not valid JSON (${e instanceof Error ? e.message : String(e)})`);
  }
  const out: Record<string, { dx: number; dy: number }> = {};
  for (const [name, v] of Object.entries(raw)) {
    if (!names.includes(name)) throw new IntakeError(`placement.json: "${name}" is not a frame of this clip (${names.join(', ')})`);
    const dx = v.dx ?? 0;
    const dy = v.dy ?? 0;
    if (typeof dx !== 'number' || typeof dy !== 'number' || !Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) > 80 || Math.abs(dy) > 80) throw new IntakeError(`placement.json: "${name}" needs numbers dx and dy (canvas pixels, at most 80)`);
    out[name] = { dx, dy };
  }
  return out;
}

/** The sheet, cut, scaled, placed and judged — and the whole report built in memory. Writes nothing. */
export function prepareClip(root: string, clip: string, options: { scale?: number } = {}): Prepared {
  const paths = heroPaths(root);
  const src = readKitSources(root);
  const requests = src.requests;
  const request = requests.clips[clip];
  if (!request) throw new IntakeError(`there is no clip "${clip}" in requests.json (the clips are ${Object.keys(requests.clips).join(', ')})`);
  const canvas: Canvas = { ...requests.canvas };
  const inboxDir = join(paths.inbox, clip);
  const inbox = readInbox(inboxDir);
  if (!inbox) throw new IntakeError(`nothing in art/player/inbox/${clip}/: drop the sheet there as sheet.png (or one PNG per pose, in order) — the brief is art/player/requests/${clip}/brief.md`);
  const images = decodeAll(inbox);
  const expected = request.frames.length;
  if (inbox.mode === 'poses' && images.length !== expected) throw new IntakeError(`${images.length} PNG file(s) in art/player/inbox/${clip}/, ${expected} are asked for (${clip}_00 … ${clip}_${pad2(expected - 1)}); or drop the whole sheet as sheet.png`);

  const cut = inbox.mode === 'sheet' ? cutSheet(images[0]!, expected) : cutLoose(images, canvas);
  if (inbox.ignored.length > 0) cut.notes.push(`hay más PNG en la carpeta (${inbox.ignored.join(', ')}): se lee solo sheet.png`);
  const scaling = chooseScale(cut, src.eye(request.scaleLike), options.scale, { headTarget: clipHead(root, request.scaleLike), tolerance: requests.scale.tolerance });
  const names = request.frames.map((_, k) => `${clip}_${pad2(k)}`);
  const placementText = readText(join(inboxDir, 'placement.json'));
  const nudges = readNudges(placementText, names);
  const none = { dx: 0, dy: 0 };
  const placed: Placed[] = cut.poses.map((pose, k) =>
    cut.final[k] ? { image: pose, clipped: { left: 0, right: 0, top: 0, bottom: 0 }, groundGap: 0, nudge: none } : placeFrame(pose, scaling.factor, request.placement, canvas, nudges[names[k]!] ?? none),
  );
  const frames = placed.map((p) => p.image);

  const anchorText = request.sword ? readText(join(inboxDir, 'anchors.json')) : null;
  const parsed = request.sword ? parseAnchors(anchorText, names, canvas) : { points: new Map<string, SwordPoints>(), problems: [] };
  const judged = judgeFrames({ names, frames, clipped: placed.map((p) => p.clipped), groundGap: placed.map((p) => p.groundGap), request, canvas, scaling, tolerance: requests.scale.tolerance, rawRed: cut.rawRed, anchors: parsed.points, anchorProblems: parsed.problems });
  const waiversText = readText(join(inboxDir, 'waivers.json'));
  const { judgement, waived } = applyWaivers(judged, parseWaivers(waiversText));

  // what the contact sheet compares with
  const current = readClips(root)[clip];
  const before: ReportInput['before'] = [];
  if (current) for (const name of clipFrameNames(current)) if (existsSync(join(paths.hero, `${name}.png`))) before.push({ name, image: readHeroFrame(root, name) });
  const like = readClips(root)[request.scaleLike];
  const neighbour = like && like.count > 0 && existsSync(join(paths.hero, `${clipFrameNames(like)[0]}.png`)) ? { name: clipFrameNames(like)[0]!, image: readHeroFrame(root, clipFrameNames(like)[0]!) } : null;
  const input: ReportInput = { clip, request, canvas, names, frames, judgement, scaling, anchors: parsed.points, before, neighbour, originals: referenceItems(src, clip) };
  const meta: ReportMeta = { inputs: inbox.files.map((f, i) => ({ file: f, sha256: sha(inbox.bytes[i]!) })), mode: inbox.mode, notes: cut.notes, nudges, anchorProblems: parsed.problems, waived };

  const files = new Map<string, Buffer | string>();
  files.set('contact.png', encodePng(contactSheet(input)));
  if (request.sword) {
    files.set('anchors-grid.png', encodePng(anchorsGrid(input)));
    if (parsed.problems.length > 0 && anchorText === null) {
      files.set('anchors.template.json', `${JSON.stringify(Object.fromEntries(names.map((n) => [n, { grip: [0, 0], tip: [0, 0] }])), null, 2)}\n`);
    }
  }
  const frameBytes = frames.map((f) => encodePng(f));
  frames.forEach((_, k) => files.set(`frames/${names[k]}.png`, frameBytes[k]!));
  files.set('report.md', reportMarkdown(input, meta));
  const fingerprint: Fingerprint = {
    clip,
    level: judgement.level,
    inputs: meta.inputs,
    scale: { factor: Math.round(scaling.factor * 1e6) / 1e6, how: scaling.how, proxy: scaling.proxy, target: scaling.target === null ? null : Math.round(scaling.target * 100) / 100, headTarget: scaling.headTarget === null ? null : Math.round(scaling.headTarget * 100) / 100 },
    anchors: anchorText === null ? null : sha(anchorText),
    placement: placementText === null ? null : sha(placementText),
    waivers: waiversText === null ? null : sha(waiversText),
    frames: names.map((name, k) => ({ name, sha256: sha(frameBytes[k]!), level: judgement.frames[k]!.level })),
  };
  files.set('report.json', `${JSON.stringify(fingerprint, null, 2)}\n`);
  return { clip, request, requests, canvas, inbox, cut, scaling, names, frames, placed, anchors: { ...parsed, text: anchorText }, nudges, judgement, waived, files, fingerprint };
}

/** Writes the report of a prepared clip to `art/player/inbox/_reports/<clip>/` (replacing the last one) and returns the folder. */
export function writeReport(root: string, prepared: Prepared): string {
  const dir = reportDir(root, prepared.clip);
  rmSync(dir, { recursive: true, force: true });
  for (const [rel, content] of prepared.files) {
    const file = join(dir, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return dir;
}

/** For a delivery that could not even be cut: the picture of what the cut saw, so the person can see why. */
export function writeCutFailure(root: string, clip: string, error: IntakeError): string | null {
  if (!error.boxes) return null;
  const inbox = readInbox(join(heroPaths(root).inbox, clip));
  if (!inbox || inbox.mode !== 'sheet') return null;
  const dir = reportDir(root, clip);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'segmentation.png'), encodePng(segmentationPicture(decodePng(inbox.bytes[0]!), error.boxes)));
  return join(dir, 'segmentation.png');
}

/** One line per frame and the notes, for the terminal. */
export function summary(p: Prepared): string[] {
  const j = p.judgement;
  const measure = p.scaling.proxy === 'head'
    ? `the clip's head ${j.head === null ? '—' : `${j.head.toFixed(1)} px`}${p.scaling.headTarget === null ? '' : ` (neighbour ${p.scaling.headTarget.toFixed(1)} px)`} — the head turns, so the eyes (${j.eye === null ? '—' : `${j.eye.toFixed(1)} px`}) are not what it is scaled by`
    : `the clip's big eye ${j.eye === null ? '—' : `${j.eye.toFixed(1)} px`}${p.scaling.target === null ? '' : ` (neighbour ${p.scaling.target.toFixed(1)} px)`}`;
  const out = [`${p.clip}: ${p.frames.length} frames from ${p.inbox.mode === 'sheet' ? 'the sheet' : `${p.inbox.files.length} files`}, scale x${p.scaling.factor.toFixed(4)} (${p.scaling.how}), ${measure}`];
  for (const f of j.frames) out.push(`  ${f.level === 'ok' ? 'ok  ' : f.level === 'warn' ? 'warn' : 'FAIL'}  ${f.name}  ${f.role}${f.phase ? ` (${f.phase})` : ''}  ${f.heightM.toFixed(2)} × ${f.widthM.toFixed(2)} m`);
  for (const c of j.checks) out.push(`  ${c.level.toUpperCase()}  ${c.id}: ${c.text}`);
  for (const f of j.frames) for (const c of f.checks) if (c.level !== 'ok') out.push(`  ${c.level.toUpperCase()}  ${f.name} · ${c.id}: ${c.text}`);
  for (const n of p.cut.notes) out.push(`  note  ${n}`);
  if (p.waived.length > 0) out.push(`  waived  ${p.waived.length} failure(s) accepted on purpose (waivers.json): ${p.waived.map((w) => w.key).join(', ')}`);
  return out;
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ accepting

/** Every file under `targets` (files or folders), remembered as bytes, so a delivery that fails half way can put the repository back exactly. */
class Snapshot {
  private readonly seen = new Map<string, Buffer>();
  private readonly roots: string[];

  constructor(targets: readonly string[]) {
    this.roots = [...targets];
    for (const t of targets) this.walk(t, (f) => this.seen.set(f, readFileSync(f)));
  }

  private walk(path: string, visit: (file: string) => void): void {
    if (!existsSync(path)) return;
    if (statSync(path).isDirectory()) for (const e of readdirSync(path)) this.walk(join(path, e), visit);
    else visit(path);
  }

  restore(): void {
    const now = new Set<string>();
    for (const t of this.roots) this.walk(t, (f) => now.add(f));
    for (const f of now) if (!this.seen.has(f)) rmSync(f, { force: true });
    for (const [f, bytes] of this.seen) {
      mkdirSync(dirname(f), { recursive: true });
      writeFileSync(f, bytes);
    }
    for (const t of this.roots) this.prune(t);
  }

  /** Folders the delivery created and the restore emptied go too (a folder that held something before is never removed). */
  private prune(path: string): void {
    if (!existsSync(path) || !statSync(path).isDirectory()) return;
    for (const e of readdirSync(path)) this.prune(join(path, e));
    if (readdirSync(path).length === 0 && ![...this.seen.keys()].some((f) => f.startsWith(`${path}${sep}`))) rmSync(path, { recursive: true, force: true });
  }
}

/** `"delivered": [...]` with `clip` added, the rest of the file (which is hand-formatted) left exactly as it was. */
export function addDelivered(rigText: string, clip: string): string {
  const m = /("delivered"\s*:\s*\[)([^\]]*)(\])/.exec(rigText);
  if (!m) throw new IntakeError('hero.rig.json has no "delivered" list to add the clip to');
  const items = m[2]!.split(',').map((x) => x.trim()).filter((x) => x !== '');
  const mine = JSON.stringify(clip);
  if (items.includes(mine)) return rigText;
  return rigText.replace(m[0], `${m[1]}${[...items, mine].join(', ')}${m[3]}`);
}

export interface AcceptOptions {
  /** Replace a clip that was already handed over (its approved drawings are overwritten). */
  replace?: boolean;
  /** Pack `art/` into `public/art/` after the delivery (default true). */
  pack?: boolean;
  /** Rebuild the production kit after the delivery (default true). */
  kit?: boolean;
  /** Run the checks every art file gets (`assets:check`) over the whole of `art/` before packing (default true; it takes about 20 s). */
  verify?: boolean;
  log?: (line: string) => void;
}

/** The manifest's entry of a clip handed over, as `npm run assets:animate` carries it over verbatim. */
export function deliveredEntry(clip: string, request: ClipRequest, count: number, how: Scaling['how'] = 'eye'): Record<string, unknown> {
  const scaledBy = { eye: 'the big eye', head: 'the size of the head (it turns, so the eye is no fair measure of it)', given: 'a factor given by hand', final: 'nothing (the frames arrived at the size of the game)' }[how];
  const m = request.manifest;
  return {
    frames: `${clip}_`,
    count,
    fps: m.fps,
    loop: m.loop,
    ...(m.phases ? { phases: m.phases } : {}),
    tags: [...m.tags],
    comment: `DRAWN ANEW and handed over through \`npm run assets:intake\` (${request.title}): ${count} frames of the same character from a delivered sheet, every pixel the sheet's — scaled once by ${scaledBy}, placed by a translation, nothing redrawn`,
  };
}

/**
 * Hands the prepared frames of `clip` over, through the mechanism the pipeline already has: the frames go to `art/player/hero/`, the clip's entry (and, for a sword, its anchors) to the manifest,
 * the clip to `delivered` in the rig; then the generator re-runs (it leaves the delivered clip alone and must find nothing to correct), the result is checked like any art, and `art/` is packed.
 * Refuses: a delivery with a failure; one that is not exactly what the last report showed; a clip already handed over (unless `replace`). If anything fails after the first file is written,
 * every file touched is put back.
 */
export function acceptClip(root: string, clip: string, options: AcceptOptions = {}): { frames: number; warnings: number } {
  const log = options.log ?? ((line: string) => console.log(line));
  const paths = heroPaths(root);
  const delivered = readDelivered(root);
  if (delivered.includes(clip) && !options.replace) throw new IntakeError(`"${clip}" was already handed over: its drawings are approved and are not overwritten. To replace them on purpose: npm run assets:intake -- ${clip} --accept --replace`);

  const prepared = prepareClip(root, clip);
  if (prepared.judgement.level === 'fail') throw new IntakeError(`"${clip}" has failures (see art/player/inbox/_reports/${clip}/report.md): nothing is accepted until they are gone`);
  const reportFile = join(reportDir(root, clip), 'report.json');
  if (!existsSync(reportFile)) throw new IntakeError(`there is no report of "${clip}" yet: run \`npm run assets:intake -- ${clip}\` and look at its contact.png first — nothing is accepted that was not shown`);
  const shown = JSON.parse(readFileSync(reportFile, 'utf8')) as Fingerprint;
  const now = prepared.fingerprint;
  const same = shown.frames.length === now.frames.length && shown.frames.every((f, i) => f.sha256 === now.frames[i]!.sha256) && shown.anchors === now.anchors && (shown.waivers ?? null) === (now.waivers ?? null);
  if (!same) throw new IntakeError(`the delivery changed since the report was written (the frames, the anchors or the waivers are not the ones contact.png and report.md show): run \`npm run assets:intake -- ${clip}\` again, look at it, then accept`);

  const request = prepared.request;
  const existing = readClips(root)[clip];
  const archive = join(paths.source, 'delivered', clip);
  const backup = new Snapshot([paths.hero, paths.manifest, paths.rig, paths.requestsDir, archive]);
  try {
    // 1 · the frames: the old files of the clip (the generator's) go, the new ones come
    mkdirSync(paths.hero, { recursive: true });
    const prefix = existing?.frames ?? `${clip}_`;
    for (const f of readdirSync(paths.hero)) if (f.startsWith(prefix) && /^\d+\.png$/.test(f.slice(prefix.length))) rmSync(join(paths.hero, f));
    prepared.frames.forEach((img, k) => writeFileSync(join(paths.hero, `${prepared.names[k]}.png`), encodePng(img)));

    // 2 · the manifest: the clip's entry and the anchors of its frames (the generator carries both over as they are)
    const manifest = JSON.parse(readFileSync(paths.manifest, 'utf8')) as { sprites: Array<{ clips: Record<string, unknown>; frames: Record<string, unknown> }> };
    const sprite = manifest.sprites[0]!;
    sprite.clips[clip] = deliveredEntry(clip, request, prepared.frames.length, prepared.scaling.how);
    for (const key of Object.keys(sprite.frames)) if (key.startsWith(prefix) && /^\d+$/.test(key.slice(prefix.length))) delete sprite.frames[key];
    if (request.sword) for (const name of prepared.names) sprite.frames[name] = { anchors: manifestAnchors(prepared.anchors.points.get(name)!, prepared.canvas) };
    writeFileSync(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`);

    // 3 · the rig: the clip is handed over
    writeFileSync(paths.rig, addDelivered(readFileSync(paths.rig, 'utf8'), clip));

    // 4 · the generator, which leaves the clip alone, and the check that it has nothing to correct
    animate({ specPath: paths.poses, check: false, log: () => undefined });
    const check = animate({ specPath: paths.poses, check: true, log: () => undefined, error: (l) => log(`  ${l}`) });
    if (check.drift > 0) throw new IntakeError('assets:animate --check finds differences after the delivery (above): the delivery was not applied');

    // 5 · the same checks every art file gets, before anything is packed
    if (options.verify !== false) {
      const verdict = buildArt({ srcDir: join(root, 'art'), outDir: join(root, 'public', 'art'), write: false });
      if (!verdict.ok) throw new IntakeError(`the art checks fail after the delivery:\n${formatReport(verdict, false)}`);
    }

    // 6 · the clip is no longer requested: the kit loses its folder and the README its row
    if (options.kit !== false) {
      const data = JSON.parse(readFileSync(paths.requests, 'utf8')) as Requests;
      data.clips[clip]!.status = 'delivered';
      writeFileSync(paths.requests, `${JSON.stringify(data, null, 2)}\n`);
      rmSync(join(paths.requestsDir, clip), { recursive: true, force: true });
      for (const [rel, content] of buildKit(readKitSources(root))) {
        const file = join(paths.requestsDir, rel);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, content);
      }
    }

    // 7 · the sheet the frames came from stays with them (art/player/source/delivered/<clip>/): the same sheet, anchors and placement give the same frames, so what is committed is not a hand's work
    rmSync(archive, { recursive: true, force: true });
    mkdirSync(archive, { recursive: true });
    prepared.inbox.files.forEach((f, i) => writeFileSync(join(archive, f), prepared.inbox.bytes[i]!));
    for (const extra of ['anchors.json', 'placement.json', 'waivers.json']) {
      const text = readText(join(paths.inbox, clip, extra));
      if (text !== null) writeFileSync(join(archive, extra), text);
    }
    writeFileSync(join(archive, 'delivery.json'), prepared.files.get('report.json')!);
    writeFileSync(join(archive, 'report.md'), prepared.files.get('report.md')!);
  } catch (e) {
    backup.restore();
    log(`the delivery was NOT applied: every file touched was put back (${relative(root, paths.hero)}, the manifest, the rig, the kit)`);
    throw e;
  }
  if (options.pack !== false) {
    const packed = buildArt({ srcDir: join(root, 'art'), outDir: join(root, 'public', 'art'), write: true });
    log(formatReport(packed, true));
    if (!packed.ok) throw new IntakeError('packing failed after the delivery: the files of art/ are in place; fix the report above and run `npm run assets:pack`');
  }
  const warnings = prepared.judgement.frames.reduce((n, f) => n + f.checks.filter((c) => c.level === 'warn').length, 0) + prepared.judgement.checks.filter((c) => c.level === 'warn').length;
  log(`"${clip}" handed over: ${prepared.frames.length} frames in art/player/hero/, its entry in the manifest${request.sword ? ' with the anchors of the sword' : ''}, and "${clip}" in "delivered" of hero.rig.json${warnings > 0 ? ` (${warnings} warning(s) accepted)` : ''}`);
  return { frames: prepared.frames.length, warnings };
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ status

export interface StatusRow {
  clip: string;
  frames: number;
  /** `own`: the clip is made of a drawing the sheet has. `stand-in`: of another action's drawing. `delivered`: drawn anew and handed over. */
  kind: 'own' | 'stand-in' | 'delivered';
  requested: boolean;
  inbox: string;
  report: Level | null;
}

export function statusOf(root: string): StatusRow[] {
  const paths = heroPaths(root);
  const clips = readClips(root);
  const delivered = new Set(readDelivered(root));
  const requests = existsSync(paths.requests) ? (JSON.parse(readFileSync(paths.requests, 'utf8')) as Requests).clips : {};
  return Object.entries(clips).map(([clip, c]) => {
    const dir = join(paths.inbox, clip);
    let inbox = 'empty';
    try {
      const i = readInbox(dir);
      if (i) inbox = i.mode === 'sheet' ? 'sheet.png' : `${i.files.length} PNG`;
    } catch (e) {
      inbox = e instanceof IntakeError ? 'not PNG' : 'unreadable';
    }
    const rep = readText(join(reportDir(root, clip), 'report.json'));
    return {
      clip,
      frames: c.count,
      kind: delivered.has(clip) ? 'delivered' : (c.tags ?? []).includes('stand-in') ? 'stand-in' : 'own',
      requested: requests[clip]?.status === 'requested',
      inbox,
      report: rep ? (JSON.parse(rep) as Fingerprint).level : null,
    };
  });
}

export function formatStatus(rows: readonly StatusRow[]): string {
  const lines = ['clip           frames  drawing      still asked for  inbox       last report'];
  for (const r of rows) lines.push(`${r.clip.padEnd(14)} ${String(r.frames).padStart(6)}  ${r.kind.padEnd(11)}  ${(r.requested ? 'yes' : '—').padEnd(15)}  ${r.inbox.padEnd(10)}  ${r.report ?? '—'}`);
  const stand = rows.filter((r) => r.kind === 'stand-in').length;
  const own = rows.filter((r) => r.kind === 'own').length;
  const hand = rows.filter((r) => r.kind === 'delivered').length;
  lines.push('', `${rows.length} clips: ${own} made of a drawing of the sheet, ${hand} drawn anew and handed over, ${stand} still stand-ins (the motion is real, the drawing is another action's); ${rows.filter((r) => r.requested).length} are asked for in art/player/requests/`);
  return lines.join('\n');
}
