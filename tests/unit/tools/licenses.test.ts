import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { notices } from '../../../tools/licenses';

/**
 * THE NOTICES OF THE SOFTWARE THE GAME SHIPS (docs/PROMPT20-LOG.md §9): `public/THIRD_PARTY_NOTICES.txt` is written from what is installed, and `npm run build` fails when it is out of date — these are the same
 * promises, made to `npm test` too, so that a dependency cannot be added or updated, nor a licence file change, without its notice following.
 */
const root = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
const committed = readFileSync('public/THIRD_PARTY_NOTICES.txt', 'utf8');

type Pkg = NonNullable<Parameters<typeof notices>[0]>[number];
const pkg = (over: Partial<Pkg> = {}): Pkg => ({
  name: 'some-lib',
  version: '1.2.3',
  license: 'MIT',
  repository: 'https://example.test/some-lib',
  text: 'MIT License\n\nCopyright (c) Somebody',
  typesOnly: false,
  ...over,
});

describe('what is written', () => {
  it('is up to date: the committed file is what the installed packages produce', () => {
    expect(committed).toBe(notices());
  });

  it('names every production dependency of the game, and what theirs ask for, each with its licence', () => {
    for (const dep of Object.keys(root.dependencies ?? {})) expect(committed, dep).toContain(`  - ${dep} `);
    expect(committed).not.toMatch(/\(UNKNOWN\)/);
    // every package has either its own licence text or the plain statement that it ships none (never a heading with nothing under it)
    const sections = committed.split(/^={78}$/m).slice(1);
    expect(sections.length).toBeGreaterThan(0);
    for (let i = 0; i < sections.length; i += 2) {
      const heading = sections[i]!.trim().split('\n')[0]!;
      const body = (sections[i + 1] ?? '').trim();
      expect(body.length, heading).toBeGreaterThan(40);
    }
  });

  it('leaves the tools out: nothing that only builds or tests the game is in the notice of what it ships', () => {
    for (const tool of Object.keys(root.devDependencies ?? {})) expect(committed, tool).not.toContain(`  - ${tool} `);
  });

  it('says which of its packages are only type definitions (they have no code in the build)', () => {
    expect(committed).toMatch(/@types\/earcut .*type definitions only/);
    expect(committed).toMatch(/@webgpu\/types .*type definitions only/);
    expect(committed).not.toMatch(/pixi\.js [\d.]+ \(MIT\) — type definitions only/);
  });
});

describe('how it is written', () => {
  it('lists the packages, then gives each one its licence text, its repository and the licence it is under', () => {
    const text = notices([pkg({ name: 'a-lib' }), pkg({ name: 'b-lib', license: 'ISC', text: 'ISC License\n\nCopyright (c) Another' })]);
    expect(text).toMatch(/^THIRD-PARTY SOFTWARE NOTICES — Troid/);
    expect(text).toContain('2 packages:');
    expect(text).toContain('  - a-lib 1.2.3 (MIT)');
    expect(text).toContain('  - b-lib 1.2.3 (ISC)');
    expect(text).toContain('a-lib 1.2.3 — MIT\nhttps://example.test/some-lib');
    expect(text).toContain('Copyright (c) Somebody');
    expect(text).toContain('Copyright (c) Another');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('is the same text every time it is written (the build compares it with the file)', () => {
    const list = [pkg({ name: 'a-lib' }), pkg({ name: 'b-lib' })];
    expect(notices(list)).toBe(notices(list));
  });

  it('a package that ships no licence file says so, and which standard licence it is under, rather than inventing a text', () => {
    const text = notices([pkg({ text: null, license: 'BSD-3-Clause' })]);
    expect(text).toContain('The package ships no licence file');
    expect(text).toContain('standard BSD-3-Clause licence');
    expect(text).not.toContain('Copyright (c)');
  });

  it('a type-definitions package is marked in the list and in its heading, with the sentence that explains it', () => {
    const text = notices([pkg({ name: '@types/some-lib', typesOnly: true }), pkg({ name: 'real-lib' })]);
    expect(text).toContain('  - @types/some-lib 1.2.3 (MIT) — type definitions only');
    expect(text).toContain('@types/some-lib 1.2.3 — MIT (type definitions only)');
    expect(text).toContain('none of it is in the distributed JavaScript');
    expect(text).not.toContain('real-lib 1.2.3 — MIT (type definitions only)');
    expect(notices([pkg()])).not.toContain('type definitions only');
  });
});
