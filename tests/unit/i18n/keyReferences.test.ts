import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOGS } from '@/i18n/catalogs';

/**
 * Keys that the code names in DATA (`nameKey: 'room.r1.name'`, `labelKey: 'touch.attack'`, …) rather than in a `t('…')` call
 * cannot be found by the call scan of catalogs.test.ts, so a typo there would show the raw key in the game. This test reads
 * every `…Key: '<area.entity.field>'` in the source and checks that it exists in every language.
 */
const SRC = resolve(__dirname, '../../../src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}

const refs = (): Array<{ file: string; key: string }> => {
  const out: Array<{ file: string; key: string }> = [];
  for (const file of walk(SRC)) {
    const code = readFileSync(file, 'utf8');
    for (const m of code.matchAll(/\b\w*Key\s*:\s*['"]([a-z][\w]*(?:\.[\w]+)+)['"]/g)) out.push({ file: file.slice(SRC.length + 1), key: m[1] as string });
  }
  return out;
};

describe('keys named in data exist in every language', () => {
  it('finds the data keys (the scan is not vacuous)', () => {
    const keys = refs().map((r) => r.key);
    expect(keys).toEqual(expect.arrayContaining(['room.r1.name', 'enemy.inkSlime.name', 'touch.attack']));
  });

  it('none is missing in any language', () => {
    const missing = refs().flatMap(({ file, key }) => Object.keys(CATALOGS).filter((l) => CATALOGS[l]![key] === undefined).map((l) => `${file}: "${key}" missing in ${l}`));
    expect(missing).toEqual([]);
  });
});
