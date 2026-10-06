import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOGS, FALLBACK_LOCALE, SUPPORTED_LOCALES } from '@/i18n/catalogs';

const SRC = resolve(__dirname, '../../../src');
const params = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string).sort();

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('catalogs: every language has the same keys and the same parameters (GAME-SPEC-2D §18)', () => {
  const keys = (l: string): string[] => Object.keys(CATALOGS[l] ?? {}).sort();
  const reference = FALLBACK_LOCALE;

  it('ships Spanish and English, and English is the fallback', () => {
    expect(SUPPORTED_LOCALES).toEqual(expect.arrayContaining(['es', 'en']));
    expect(FALLBACK_LOCALE).toBe('en');
  });

  for (const lang of Object.keys(CATALOGS)) {
    it(`"${lang}" has exactly the keys of "${reference}"`, () => {
      expect(keys(lang)).toEqual(keys(reference));
    });

    it(`"${lang}" uses the same {parameters} as "${reference}" in every key`, () => {
      for (const key of keys(reference)) expect(params(CATALOGS[lang]![key]!), `${lang}:${key}`).toEqual(params(CATALOGS[reference]![key]!));
    });

    it(`"${lang}" has no empty or placeholder texts`, () => {
      for (const [key, text] of Object.entries(CATALOGS[lang]!)) {
        expect(text.trim().length, `${lang}:${key}`).toBeGreaterThan(0);
        expect(/todo|xxx|lorem/i.test(text), `${lang}:${key}`).toBe(false);
      }
    });
  }

  it('keys follow the `area.entity.field` convention (lower snake / camel, at least two segments)', () => {
    for (const key of keys(reference)) expect(key, key).toMatch(/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/);
  });

  it('the two languages are really translated (the same text in both is suspicious)', () => {
    const same = keys(reference).filter((k) => CATALOGS['es']![k] === CATALOGS['en']![k]);
    expect(same).toEqual([]);
  });
});

describe('every key the code asks for exists in every language', () => {
  // `translator.t('key')` / `tr.t('key')` anywhere, and bare `t('key')` inside ui/ (the HUD and overlays)
  const calls = (): Array<{ file: string; key: string }> => {
    const out: Array<{ file: string; key: string }> = [];
    for (const file of walk(SRC)) {
      const code = readFileSync(file, 'utf8');
      const rel = file.slice(SRC.length + 1);
      const patterns = [/\b(?:translator|tr|i18n)\.t\(\s*['"]([^'"]+)['"]/g];
      if (rel.startsWith('ui/')) patterns.push(/(?<![.\w])t\(\s*['"]([^'"]+)['"]/g);
      for (const re of patterns) for (const m of code.matchAll(re)) out.push({ file: rel, key: m[1] as string });
    }
    return out;
  };

  it('finds the keys the defeat overlay uses (the scan is not vacuous)', () => {
    const keys = calls().map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(['death.title', 'death.hint']));
  });

  it('none is missing in any language', () => {
    const missing = calls().flatMap(({ file, key }) => Object.keys(CATALOGS).filter((l) => CATALOGS[l]![key] === undefined).map((l) => `${file}: "${key}" missing in ${l}`));
    expect(missing).toEqual([]);
  });

  it('and no key of the catalog is orphaned from the game (every key is used by code or by a `nameKey`/`descKey`-style field)', () => {
    const used = new Set(calls().map((c) => c.key));
    const text = walk(SRC).map((f) => readFileSync(f, 'utf8')).join('\n');
    const orphans = Object.keys(CATALOGS['en']!).filter((k) => !used.has(k) && !text.includes(`'${k}'`) && !text.includes(`"${k}"`));
    expect(orphans).toEqual([]);
  });
});
