import { beforeEach, describe, expect, it } from 'vitest';
import { log, type LogEntry } from '@/core/log';
import { createTranslator, detectLocale, type Catalog } from '@/i18n/translator';

const es: Catalog = {
  'greet.hello': 'Hola, {name}',
  'greet.only_es': 'Solo en español',
  'enemies.defeated.one': '{count} enemigo derrotado',
  'enemies.defeated.other': '{count} enemigos derrotados',
  'plain.count': 'Total: {count}',
};
const en: Catalog = {
  'greet.hello': 'Hello, {name}',
  'greet.only_en': 'English only',
  'enemies.defeated.one': '{count} enemy defeated',
  'enemies.defeated.other': '{count} enemies defeated',
  'plain.count': 'Total: {count}',
};
const CATALOGS = { es, en } as const;

let warnings: LogEntry[];
beforeEach(() => {
  warnings = [];
  log.setSink((e) => {
    if (e.level === 'warn' || e.level === 'error') warnings.push(e);
  });
});

describe('Translator', () => {
  it('translates by key and interpolates {params}', () => {
    expect(createTranslator(CATALOGS, 'es').t('greet.hello', { name: 'Troid' })).toBe('Hola, Troid');
    expect(createTranslator(CATALOGS, 'en').t('greet.hello', { name: 'Troid' })).toBe('Hello, Troid');
  });

  it('falls back es → en for a key missing in the current language, and never returns an empty string', () => {
    const t = createTranslator(CATALOGS, 'es');
    expect(t.t('greet.only_en')).toBe('English only');
    expect(t.t('greet.only_es')).toBe('Solo en español');
    expect(t.has('greet.only_en')).toBe(true);
  });

  it('a key missing everywhere returns the KEY itself (visible, not blank) and is logged once', () => {
    const t = createTranslator(CATALOGS, 'es');
    expect(t.t('nope.nothing')).toBe('nope.nothing');
    expect(t.t('nope.nothing')).toBe('nope.nothing');
    expect(t.has('nope.nothing')).toBe(false);
    expect(warnings.filter((w) => w.message.includes('nope.nothing'))).toHaveLength(1);
  });

  it('a missing parameter leaves the placeholder visible and warns once', () => {
    const t = createTranslator(CATALOGS, 'en');
    expect(t.t('greet.hello')).toBe('Hello, {name}');
    expect(t.t('greet.hello', {})).toBe('Hello, {name}');
    expect(warnings.filter((w) => w.message.includes('"name"'))).toHaveLength(1);
  });

  it('plurals follow the language\'s rules (Intl.PluralRules): one / other', () => {
    const t = createTranslator(CATALOGS, 'es');
    expect(t.t('enemies.defeated', { count: 1 })).toBe('1 enemigo derrotado');
    expect(t.t('enemies.defeated', { count: 0 })).toBe('0 enemigos derrotados');
    expect(t.t('enemies.defeated', { count: 5 })).toBe('5 enemigos derrotados');
    t.setLocale('en');
    expect(t.t('enemies.defeated', { count: 1 })).toBe('1 enemy defeated');
    expect(t.t('enemies.defeated', { count: 2 })).toBe('2 enemies defeated');
  });

  it('a numeric count on a key without plural variants is just a parameter', () => {
    expect(createTranslator(CATALOGS, 'en').t('plain.count', { count: 7 })).toBe('Total: 7');
  });

  it('switches language at runtime and notifies listeners; an unknown language keeps the current one', () => {
    const t = createTranslator(CATALOGS, 'es');
    const seen: string[] = [];
    t.changed.subscribe((l) => void seen.push(l));
    expect(t.setLocale('en')).toBe('en');
    expect(t.t('greet.hello', { name: 'A' })).toBe('Hello, A');
    expect(t.setLocale('fr')).toBe('en'); // no French catalog: stays
    expect(t.setLocale('en')).toBe('en');
    expect(t.setLocale('es-MX')).toBe('es'); // a regional variant resolves to its language
    expect(seen).toEqual(['en', 'es']); // only real changes are announced
  });

  it('starts in the fallback language when the requested one has no catalog', () => {
    expect(createTranslator(CATALOGS, 'de').locale).toBe('en');
    expect(createTranslator(CATALOGS, 'ES').locale).toBe('es');
  });

  it('supports a third language by data only (no code involved)', () => {
    const t = createTranslator({ ...CATALOGS, fr: { 'greet.hello': 'Bonjour, {name}' } }, 'fr');
    expect(t.t('greet.hello', { name: 'Troid' })).toBe('Bonjour, Troid');
    expect(t.t('greet.only_en')).toBe('English only'); // and still falls back
    expect(t.languages.sort()).toEqual(['en', 'es', 'fr']);
  });
});

describe('detectLocale (GAME-SPEC-2D §18: the device language if es-* / en-*, English otherwise)', () => {
  const supported = ['es', 'en'];
  it('picks the first preferred language we have, ignoring the region', () => {
    expect(detectLocale(['es-MX', 'en-US'], supported)).toBe('es');
    expect(detectLocale(['fr-FR', 'en-GB'], supported)).toBe('en');
    expect(detectLocale(['EN'], supported)).toBe('en');
    expect(detectLocale(['es_ES'], supported)).toBe('es');
  });
  it('falls back to English when nothing matches or nothing is declared', () => {
    expect(detectLocale(['ja-JP', 'zh-CN'], supported)).toBe('en');
    expect(detectLocale([], supported)).toBe('en');
    expect(detectLocale([], supported, 'es')).toBe('es');
  });
});

describe('extend: a part of the interface that loads later brings its own words (docs/PROMPT6-LOG.md S30)', () => {
  const catalogs = { en: { 'a.one': 'One' }, es: { 'a.one': 'Uno' } };

  it('adds texts to a language the translator has: they are found at once, in that language, with their parameters', () => {
    const t = createTranslator(catalogs, 'es');
    expect(t.has('b.two')).toBe(false);
    t.extend('es', { 'b.two': 'Dos {n}' });
    t.extend('en', { 'b.two': 'Two {n}' });
    expect(t.t('b.two', { n: 2 })).toBe('Dos 2');
    t.setLocale('en');
    expect(t.t('b.two', { n: 2 })).toBe('Two 2');
    expect(t.t('a.one'), 'what was there is still there').toBe('One');
  });

  it('the same key again replaces it; extending does not touch the catalogs it was built from', () => {
    const t = createTranslator(catalogs, 'en');
    t.extend('en', { 'a.one': 'Uno!' });
    expect(t.t('a.one')).toBe('Uno!');
    expect(catalogs.en['a.one']).toBe('One');
    expect(createTranslator(catalogs, 'en').t('a.one')).toBe('One');
  });

  it('a language it does not have is ignored (the translator never grows a language by being extended), and extending announces no change', () => {
    const t = createTranslator(catalogs, 'en');
    const seen: string[] = [];
    t.changed.subscribe((l) => void seen.push(l));
    t.extend('fr', { 'a.one': 'Un' });
    expect(t.languages.sort()).toEqual(['en', 'es']);
    t.extend('en', { 'c.three': 'Three' });
    expect(seen).toEqual([]);
  });

  it('the fallback language still catches what the current one lacks', () => {
    const t = createTranslator(catalogs, 'es');
    t.extend('en', { 'only.en': 'Only English' });
    expect(t.t('only.en')).toBe('Only English');
  });
});

