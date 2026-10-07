import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOGS, FALLBACK_LOCALE, SUPPORTED_LOCALES } from '@/i18n/catalogs';
import { MENU_CATALOGS } from '@/i18n/menuCatalogs';
import { ALL_CATALOGS } from '../../helpers/catalogs';

const SRC = resolve(__dirname, '../../../src');
const params = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string).sort();

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('catalogs: every language has the same keys and the same parameters (GAME-SPEC-2D §18)', () => {
  const keys = (l: string): string[] => Object.keys(ALL_CATALOGS[l] ?? {}).sort();
  const reference = FALLBACK_LOCALE;

  it('ships Spanish and English, and English is the fallback', () => {
    expect(SUPPORTED_LOCALES).toEqual(expect.arrayContaining(['es', 'en']));
    expect(FALLBACK_LOCALE).toBe('en');
  });

  for (const lang of Object.keys(ALL_CATALOGS)) {
    it(`"${lang}" has exactly the keys of "${reference}"`, () => {
      expect(keys(lang)).toEqual(keys(reference));
    });

    it(`"${lang}" uses the same {parameters} as "${reference}" in every key`, () => {
      for (const key of keys(reference)) expect(params(ALL_CATALOGS[lang]![key]!), `${lang}:${key}`).toEqual(params(ALL_CATALOGS[reference]![key]!));
    });

    it(`"${lang}" has no empty or placeholder texts`, () => {
      for (const [key, text] of Object.entries(ALL_CATALOGS[lang]!)) {
        expect(text.trim().length, `${lang}:${key}`).toBeGreaterThan(0);
        expect(/todo|xxx|lorem/i.test(text), `${lang}:${key}`).toBe(false);
      }
    });
  }

  it('keys follow the `area.entity.field` convention (lower snake / camel, at least two segments)', () => {
    for (const key of keys(reference)) expect(key, key).toMatch(/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/);
  });

  it('the two languages are really translated (the same text in both is suspicious)', () => {
    const same = keys(reference).filter((k) => ALL_CATALOGS['es']![k] === ALL_CATALOGS['en']![k]);
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
    const missing = calls().flatMap(({ file, key }) => Object.keys(ALL_CATALOGS).filter((l) => ALL_CATALOGS[l]![key] === undefined).map((l) => `${file}: "${key}" missing in ${l}`));
    expect(missing).toEqual([]);
  });

  it('and no key of the catalog is orphaned from the game (every key is used by code or by a `nameKey`/`descKey`-style field)', () => {
    const used = new Set(calls().map((c) => c.key));
    const text = walk(SRC).map((f) => readFileSync(f, 'utf8')).join('\n');
    const orphans = Object.keys(ALL_CATALOGS['en']!).filter((k) => !used.has(k) && !text.includes(`'${k}'`) && !text.includes(`"${k}"`));
    expect(orphans).toEqual([]);
  });
});

describe('the words of the settings menu travel apart (docs/PROMPT6-LOG.md S30: the bundle budget)', () => {
  it('the menu has the same languages as the game, and the game\'s own catalogs do not carry the menu\'s keys (but the pause button\'s)', () => {
    expect(Object.keys(MENU_CATALOGS).sort()).toEqual(Object.keys(CATALOGS).sort());
    for (const lang of Object.keys(CATALOGS)) {
      const core = Object.keys(CATALOGS[lang]!);
      expect(core.filter((k) => k.startsWith('action.')), lang).toEqual([]);
      expect(core.filter((k) => k.startsWith('settings.')), lang).toEqual(['settings.open']);
    }
  });

  it('what the menu brings is only its own: settings.* and action.* — and no key is in both halves', () => {
    for (const lang of Object.keys(MENU_CATALOGS)) {
      for (const key of Object.keys(MENU_CATALOGS[lang]!)) {
        expect(/^(settings|action)\./.test(key), `${lang}:${key}`).toBe(true);
        expect(CATALOGS[lang]![key], `${lang}:${key} is in the game's catalog too`).toBeUndefined();
      }
    }
  });
});

