import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THE NOTICES OF THE SOFTWARE THE GAME SHIPS (docs/PROMPT20-LOG.md): the licences of everything of other people's that ends up in the distributed JavaScript — PixiJS and what it is made of — written to
 * `public/THIRD_PARTY_NOTICES.txt`, which the build copies next to the game (a web page, and a native shell that bundles it) because the licences ask for their notice to travel with the code. Built from what is
 * really installed (the production dependencies of `package.json` and theirs, never the tools): `npm run licenses` writes it, `npm run licenses:check` (part of the build) fails when it is not up to date, so a
 * dependency cannot be added — or updated — without its notice following.
 *
 *   npx tsx tools/licenses.ts           write public/THIRD_PARTY_NOTICES.txt
 *   npx tsx tools/licenses.ts --check   fail if it is out of date
 */
const OUT = 'public/THIRD_PARTY_NOTICES.txt';

interface Pkg {
  name: string;
  version: string;
  license: string;
  repository: string;
  text: string | null;
  /** Type declarations only (no `main`, `module` or `exports`): they travel with PixiJS's own, and none of their code is in the distributed JavaScript. */
  typesOnly: boolean;
}

function read(dir: string): { json: Record<string, unknown>; dir: string } {
  return { json: JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Record<string, unknown>, dir };
}

/** The production closure: what `package.json` asks for and what those ask for, as installed. */
function closure(): Pkg[] {
  const root = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies?: Record<string, string> };
  const seen = new Map<string, Pkg>();
  const todo = Object.keys(root.dependencies ?? {});
  while (todo.length > 0) {
    const name = todo.shift()!;
    if (seen.has(name)) continue;
    const dir = join('node_modules', name);
    if (!existsSync(join(dir, 'package.json'))) throw new Error(`"${name}" is a dependency of the game but is not installed (run npm ci)`);
    const { json } = read(dir);
    const licenseField = json['license'] ?? (Array.isArray(json['licenses']) ? (json['licenses'] as Array<{ type: string }>).map((l) => l.type).join(' OR ') : null);
    const repo = json['repository'];
    const repository = typeof repo === 'string' ? repo : typeof repo === 'object' && repo !== null ? String((repo as { url?: string }).url ?? '') : String(json['homepage'] ?? '');
    const file = readdirSync(dir).find((f) => /^(licen[sc]e|copying|notice)(\.(md|txt))?$/i.test(f));
    seen.set(name, {
      name,
      version: String(json['version']),
      license: String(licenseField ?? 'UNKNOWN'),
      repository: repository.replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/\.git$/, '').replace(/^([\w.-]+\/[\w.-]+)$/, 'https://github.com/$1'),
      text: file ? readFileSync(join(dir, file), 'utf8').trim() : null,
      typesOnly: !json['main'] && !json['module'] && !json['exports'] && !json['browser'],
    });
    for (const dep of Object.keys((json['dependencies'] as Record<string, string> | undefined) ?? {})) todo.push(dep);
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const RULE = '='.repeat(78);

export function notices(packages: readonly Pkg[] = closure()): string {
  const head = [
    'THIRD-PARTY SOFTWARE NOTICES — Troid',
    '',
    'The game itself, its art and its sound are the project\'s own. The JavaScript it ships includes the software below, each under its own licence, reproduced here as those licences ask.',
    'This file is written by `npm run licenses` from what is installed; do not edit it by hand.',
    '',
    `${packages.length} packages:`,
    ...packages.map((p) => `  - ${p.name} ${p.version} (${p.license})${p.typesOnly ? ' — type definitions only' : ''}`),
    ...(packages.some((p) => p.typesOnly) ? ['', 'A package marked "type definitions only" has no code: it comes with PixiJS\'s declarations, none of it is in the distributed JavaScript, and it is listed here for completeness.'] : []),
  ];
  const body = packages.flatMap((p) => [
    '',
    RULE,
    `${p.name} ${p.version} — ${p.license}${p.typesOnly ? ' (type definitions only)' : ''}`,
    p.repository,
    RULE,
    '',
    p.text ?? `Licensed under ${p.license}. The package ships no licence file; its terms are those of the standard ${p.license} licence, held by the authors named in its repository above.`,
  ]);
  return `${[...head, ...body].join('\n')}\n`;
}

if (process.argv[1]?.endsWith('licenses.ts')) {
  const wanted = notices();
  if (process.argv.includes('--check')) {
    const have = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
    if (have !== wanted) {
      console.error(`${OUT} is out of date: run \`npm run licenses\` and commit it.`);
      process.exit(1);
    }
    console.log(`${OUT} is up to date (${wanted.split('\n').length} lines)`);
  } else {
    writeFileSync(OUT, wanted);
    console.log(`wrote ${OUT}`);
  }
}
