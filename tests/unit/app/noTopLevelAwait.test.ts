import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * NO MODULE OF THE GAME WAITS AT ITS TOP LEVEL (docs/PROMPT20-LOG.md §7). A module that is stopped on a top-level `await` has not finished evaluating, and a chunk loaded on demand that imports from it cannot run until it has. Since the
 * modules of the first screen are bundled into ONE file (`vite.config.ts`, the group `$initial`), every part of the game that arrives later is such a chunk — the labs, the effects, the sound, the menu. `main.ts` used to
 * `await import('./labs/…')` at its top level: in the production build the lab's files arrived and then waited, for ever, for the file that was waiting for them. No error is reported — the page just never starts — and the development server,
 * which serves every module apart, never shows it. (It also keeps the build out of Safari 14, which has no top-level `await`.)
 */
const SRC = resolve(__dirname, '../../../src');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if ((p.endsWith('.ts') || p.endsWith('.tsx')) && !p.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/** The lines (1-based) of the `await` expressions and `for await` loops that are not inside any function, method, accessor, constructor or static block. */
function topLevelAwaits(code: string, name = 'source.ts'): number[] {
  const file = ts.createSourceFile(name, code, ts.ScriptTarget.ESNext, true);
  const lines: number[] = [];
  const visit = (node: ts.Node, inside: boolean): void => {
    if (!inside && (ts.isAwaitExpression(node) || (ts.isForOfStatement(node) && node.awaitModifier !== undefined))) {
      lines.push(file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1);
    }
    const opens = ts.isFunctionLike(node) || ts.isClassStaticBlockDeclaration(node);
    ts.forEachChild(node, (child) => visit(child, inside || opens));
  };
  visit(file, false);
  return lines;
}

describe('no top-level await in the game', () => {
  it('nothing in src/ waits at the top of a module', () => {
    const offenders = walk(SRC).flatMap((file) => topLevelAwaits(readFileSync(file, 'utf8'), file).map((line) => `${relative(SRC, file)}:${line}`));
    expect(offenders).toEqual([]);
  });

  it('the detector works: it finds a wait at the top of a module (also inside a block or a branch) and lets the ones in functions through', () => {
    expect(topLevelAwaits('const x = await import("./a");\n')).toEqual([1]);
    expect(topLevelAwaits('if (a) {\n  const { b } = await import("./b");\n  await b();\n}\n')).toEqual([2, 3]);
    expect(topLevelAwaits('for await (const c of source) use(c);\n')).toEqual([1]);
    expect(topLevelAwaits('async function f() { await g(); }\nconst h = async () => { await g(); };\nclass K { async m() { await g(); } static { void 0; } }\n')).toEqual([]);
    expect(topLevelAwaits('void (async () => { await g(); })();\n')).toEqual([]);
  });

  it('the start-up of the page is where it was: main.ts exists and starts the game from a function', () => {
    const main = readFileSync(join(SRC, 'app/main.ts'), 'utf8');
    expect(main).toMatch(/async function start\(/);
    expect(main).toMatch(/void start\(/);
  });
});
