import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { heroPaths } from './heroRepo';
import { IntakeError } from './intake';
import { acceptClip, formatStatus, prepareClip, statusOf, summary, writeCutFailure, writeReport } from './intakeRun';
import { buildKit, readKitSources, type Requests } from './kit';
import { readSheetData, sheetProblems, writeClipInbox } from './sheetData';

/**
 * `npm run assets:intake` — the protagonist's missing drawings: the production kit, and the reception of what comes back (docs/PROMPT10-LOG.md).
 *
 *   -- from-sheet [<clip>…]         write `art/player/inbox/<clip>/sheet.png` and `poses.json` from the character sheet (`art/player/source/character-sheet.png`, read by `character-sheet.json`): a plain crop, no pixel changed
 *   -- sheet                        check that the character sheet is the one its data was made for and that every pose of it is accounted for
 *   -- status                       what each clip is made of (a drawing of the sheet, a stand-in, drawn anew), what is asked for, what is in the inbox
 *   -- kit [--check]                write the production kit (`art/player/requests/`: reference boards, briefs with their prompts, canvas templates) from `requests.json`; --check writes nothing
 *   -- <clip> [--scale <k>]         cut, scale, place and judge what is in `art/player/inbox/<clip>/`, and write the report (contact sheet included) to `art/player/inbox/_reports/<clip>/`
 *   -- <clip> --accept [--replace]  hand the frames over through `delivered` — only what the last report showed, and only with no failure
 */
const args = process.argv.slice(2);
const has = (n: string): boolean => args.includes(n);
const value = (n: string): string | undefined => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const root = fileURLToPath(new URL('../../', import.meta.url));
const paths = heroPaths(root);

/** The folders of `art/player/requests/` the kit does not make (a clip handed over, or renamed): leftovers a person would mistake for a request. */
function staleFolders(expected: ReadonlySet<string>): string[] {
  if (!existsSync(paths.requestsDir)) return [];
  return readdirSync(paths.requestsDir)
    .filter((e) => statSync(join(paths.requestsDir, e)).isDirectory() && !e.startsWith('_') && !expected.has(e));
}

function kit(): number {
  const files = buildKit(readKitSources(root));
  const wanted = new Set([...files.keys()].filter((f) => f.includes('/')).map((f) => f.split('/')[0]!));
  const stale = staleFolders(wanted);
  if (has('--check')) {
    let drift = 0;
    for (const [rel, content] of files) {
      const file = join(paths.requestsDir, rel);
      const want = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
      if (!existsSync(file)) {
        console.error(`missing: ${file}`);
        drift++;
      } else if (Buffer.compare(readFileSync(file), want) !== 0) {
        console.error(`differs from what the data produces: ${file}`);
        drift++;
      }
    }
    for (const s of stale) {
      console.error(`left over (no such clip is asked for any more): ${join(paths.requestsDir, s)}`);
      drift++;
    }
    console.log(drift === 0 ? `intake: the kit is what the requests and the sheet produce (${files.size} files)` : `intake: ${drift} difference(s) — run \`npm run assets:intake -- kit\``);
    return drift === 0 ? 0 : 1;
  }
  for (const [rel, content] of files) {
    const file = join(paths.requestsDir, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  for (const s of stale) rmSync(join(paths.requestsDir, s), { recursive: true, force: true });
  console.log(`intake: wrote ${files.size} files to ${paths.requestsDir}${stale.length > 0 ? ` and removed ${stale.length} folder(s) of clips no longer asked for` : ''}`);
  return 0;
}

function sheet(): number {
  const problems = sheetProblems(root);
  for (const p of problems) console.error(`sheet: ${p}`);
  if (problems.length === 0) {
    const d = readSheetData(root);
    console.log(`sheet: character-sheet.png is the sheet its data was made for (${d.size[0]} × ${d.size[1]}, ${Object.keys(d.panels).length} panels, ${Object.keys(d.clips).length} clips)`);
  }
  return problems.length === 0 ? 0 : 1;
}

function fromSheet(clips: string[]): number {
  try {
    const wanted = clips.length > 0 ? clips : Object.keys(readSheetData(root).clips);
    for (const clip of wanted) console.log(`from-sheet: ${clip} → ${relative(root, writeClipInbox(root, clip))}/ (sheet.png, poses.json)`);
    return 0;
  } catch (e) {
    if (e instanceof IntakeError) {
      console.error(`intake: ${e.message}`);
      return 1;
    }
    throw e;
  }
}

function status(): number {
  console.log(formatStatus(statusOf(root)));
  const requests = JSON.parse(readFileSync(paths.requests, 'utf8')) as Requests;
  const todo = Object.entries(requests.clips).filter(([, c]) => c.status === 'requested');
  if (todo.length > 0) console.log(`\nnext: ${todo.sort((a, b) => a[1].priority - b[1].priority || a[1].group.localeCompare(b[1].group)).map(([k, c]) => `${c.group}:${k}`).join('  ')} — each brief is art/player/requests/<clip>/brief.md`);
  return 0;
}

function prepare(clip: string): number {
  const scale = value('--scale');
  try {
    const prepared = prepareClip(root, clip, scale !== undefined ? { scale: Number(scale) } : {});
    const dir = writeReport(root, prepared);
    for (const line of summary(prepared)) console.log(line);
    const anchored = prepared.request.sword || prepared.request.anchors === 'cast';
    console.log(`\nreport: ${relative(root, dir)}/ (contact.png, report.md${anchored ? ', anchors-grid.png' : ''}, frames/)`);
    if (anchored && prepared.anchors.problems.length > 0) {
      console.log(`anchors: ${prepared.anchors.problems.length} problem(s) — read the grip and the tip of each frame off anchors-grid.png and write them in art/player/inbox/${clip}/anchors.json (template: ${relative(root, join(dir, 'anchors.template.json'))})`);
    }
    if (prepared.judgement.level === 'fail') console.log('\nNOT acceptable yet: fix the failures above (or ask for the sheet again).');
    else console.log(`\nlook at contact.png, then: npm run assets:intake -- ${clip} --accept`);
    return prepared.judgement.level === 'fail' ? 1 : 0;
  } catch (e) {
    if (e instanceof IntakeError) {
      console.error(`intake: ${e.message}`);
      const picture = writeCutFailure(root, clip, e);
      if (picture) console.error(`intake: what the cut saw: ${relative(root, picture)}`);
      return 1;
    }
    throw e;
  }
}

function accept(clip: string): number {
  try {
    acceptClip(root, clip, { replace: has('--replace') });
    console.log('\nnext: npm test, npm run assets:check, and look at it in the game (?lab=player&look=art&clip=' + clip + ')');
    return 0;
  } catch (e) {
    if (e instanceof IntakeError) {
      console.error(`intake: ${e.message}`);
      return 1;
    }
    throw e;
  }
}

try {
  const first = args[0];
  if (first === 'kit') process.exit(kit());
  if (first === 'status') process.exit(status());
  if (first === 'sheet') process.exit(sheet());
  if (first === 'from-sheet') process.exit(fromSheet(args.slice(1).filter((a) => !a.startsWith('-'))));
  if (first && !first.startsWith('-')) process.exit(has('--accept') ? accept(first) : prepare(first));
  console.error('usage: npm run assets:intake -- status | sheet | from-sheet [<clip>…] | kit [--check] | <clip> [--scale <k>] | <clip> --accept [--replace]');
  process.exit(2);
} catch (e) {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
}
