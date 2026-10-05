import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

/**
 * Enforces the layering described in docs/ARCHITECTURE.md §2.
 *
 *  - "sim" files (pure TypeScript) never touch three / the DOM / wall-clock time / Math.random
 *    and never import view or platform modules.
 *  - "view" files may use anything.
 *  - `content/` (concrete game data) is injected into the simulation, never imported by it.
 */

const SRC = resolve(__dirname, '../../src');

/** Modules that are pure by default. */
const PURE_MODULES = new Set([
  'core', 'models', 'presentation', 'gameplay', 'player', 'combat', 'enemies', 'bosses', 'world', 'progression', 'save', 'input',
  'camera', 'content',
]);
/** Modules that are view / platform by default. */
const VIEW_MODULES = new Set(['render', 'vfx', 'ui', 'audio', 'assets', 'debug', 'app']);

/** Files inside otherwise-pure modules that belong to the view / platform layer. */
function isViewFile(rel: string): boolean {
  const parts = rel.split('/');
  const base = parts[parts.length - 1] ?? '';
  return (
    parts.includes('view') ||
    /(Visual|View)\.ts$/.test(base) ||
    rel.startsWith('input/sources/') ||
    rel === 'input/InputManager.ts'
  );
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

interface SourceFile {
  rel: string; // posix path relative to src
  module: string;
  layer: 'pure' | 'view';
  code: string;
  imports: string[]; // resolved: 'three' | '<module>/<rest>'
}

function resolveImport(fromRel: string, spec: string): string {
  if (spec.startsWith('@/')) return spec.slice(2);
  if (spec.startsWith('.')) {
    const abs = resolve(SRC, dirname(fromRel), spec);
    return relative(SRC, abs).split(sep).join('/');
  }
  return spec; // bare package
}

function load(): SourceFile[] {
  return walk(SRC).map((abs) => {
    const rel = relative(SRC, abs).split(sep).join('/');
    const module = rel.split('/')[0] ?? '';
    const code = stripComments(readFileSync(abs, 'utf8'));
    const imports: string[] = [];
    const re = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
    for (let m = re.exec(code); m; m = re.exec(code)) imports.push(resolveImport(rel, m[1] as string));
    const layer: SourceFile['layer'] =
      VIEW_MODULES.has(module) || isViewFile(rel) ? 'view' : 'pure';
    return { rel, module, layer, code, imports };
  });
}

const files = load();
const pure = files.filter((f) => f.layer === 'pure');

describe('architecture: layering', () => {
  it('every top-level folder in src/ is a known module', () => {
    const known = new Set([...PURE_MODULES, ...VIEW_MODULES]);
    const unknown = [...new Set(files.map((f) => f.module))].filter((m) => !known.has(m) && !m.endsWith('.ts'));
    expect(unknown, `Unknown module folders: declare them in tests/unit/architecture.test.ts and docs/ARCHITECTURE.md`).toEqual([]);
  });

  it('pure (simulation) files never import three or view modules', () => {
    const offenders = pure.flatMap((f) =>
      f.imports
        .filter((i) => i === 'three' || i.startsWith('three/') || VIEW_MODULES.has(i.split('/')[0] ?? ''))
        .map((i) => `${f.rel} → ${i}`),
    );
    expect(offenders).toEqual([]);
  });

  it('pure files never import view files of their own module (…Visual.ts, …View.ts, view/, input sources)', () => {
    const offenders = pure.flatMap((f) =>
      f.imports.filter((i) => PURE_MODULES.has(i.split('/')[0] ?? '') && isViewFile(`${i}.ts`)).map((i) => `${f.rel} → ${i}`),
    );
    expect(offenders).toEqual([]);
  });

  it('core imports nothing from other project modules', () => {
    const offenders = files
      .filter((f) => f.module === 'core')
      .flatMap((f) => f.imports.filter((i) => !i.startsWith('three') && i.split('/')[0] !== 'core' && !i.startsWith('node:') && /^[a-z]+\//.test(i) && (PURE_MODULES.has(i.split('/')[0] ?? '') || VIEW_MODULES.has(i.split('/')[0] ?? ''))).map((i) => `${f.rel} → ${i}`));
    expect(offenders).toEqual([]);
  });

  it('only app/ and content/ itself import content/ (game data is injected into the simulation)', () => {
    const offenders = files
      .filter((f) => f.module !== 'app' && f.module !== 'content')
      .flatMap((f) => f.imports.filter((i) => i.split('/')[0] === 'content').map((i) => `${f.rel} → ${i}`));
    expect(offenders).toEqual([]);
  });
});

describe('architecture: simulation determinism & hygiene', () => {
  const FORBIDDEN: Array<[RegExp, string]> = [
    [/\bsetTimeout\s*\(/, 'setTimeout (use Scheduler)'],
    [/\bsetInterval\s*\(/, 'setInterval (use Scheduler)'],
    [/\brequestAnimationFrame\s*\(/, 'requestAnimationFrame'],
    [/\bMath\.random\s*\(/, 'Math.random (use Rng)'],
    [/\bDate\.now\s*\(/, 'Date.now (inject a clock)'],
    [/\bperformance\.now\s*\(/, 'performance.now'],
    [/\bwindow\./, 'window'],
    [/\bdocument\./, 'document'],
    [/\bnavigator\./, 'navigator'],
    [/\blocalStorage\b/, 'localStorage (use a StorageAdapter)'],
    [/\baddEventListener\s*\(/, 'addEventListener (use EventBus / DisposableStore)'],
  ];

  for (const [re, label] of FORBIDDEN) {
    it(`pure files do not use ${label}`, () => {
      const offenders = pure.filter((f) => re.test(f.code)).map((f) => f.rel);
      expect(offenders).toEqual([]);
    });
  }
});
