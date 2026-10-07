import { log } from '@/core/log';
import { Observable } from '@/core/observable';

/** One language: flat keys `area.entity.field` → text with `{param}` placeholders. */
export type Catalog = Readonly<Record<string, string>>;
export type Params = Readonly<Record<string, string | number>>;

/**
 * The translator (docs/ARCHITECTURE-2D.md §9, GAME-SPEC-2D §18). PURE: no DOM, no storage. The interface never holds a
 * literal text, only keys; definitions keep `nameKey`/`descKey`; adding a language is adding a catalog file.
 *
 *  - `{name}` placeholders are interpolated from `params`;
 *  - `t(key, { count })` picks the plural variant `key.<category>` (`one`, `other`…) with `Intl.PluralRules` of the
 *    current language, falling back to `key.other` and then to `key`;
 *  - a key missing in the current language falls back to the fallback language (English), and a key missing everywhere
 *    returns the key itself (visible, never an empty UI) and is logged once.
 */
export class Translator {
  /** Notifies the new language when it changes (the HUD re-reads its texts). */
  readonly changed: Observable<string>;
  private readonly rules = new Map<string, Intl.PluralRules>();
  private readonly warn = log.scope('i18n');

  constructor(
    private catalogs: Readonly<Record<string, Catalog>>,
    locale: string,
    private readonly fallback = 'en',
  ) {
    const initial = this.resolve(locale);
    this.changed = new Observable<string>(initial);
  }

  get locale(): string {
    return this.changed.get();
  }

  get languages(): string[] {
    return Object.keys(this.catalogs);
  }

  /** Switches language (hot). An unknown language keeps the current one. Returns the language now in use. */
  setLocale(locale: string): string {
    const next = this.resolve(locale, this.changed.get());
    this.changed.set(next);
    return next;
  }

  /**
   * Adds texts to a language that is already there (a part of the interface that loads later brings its own words). The same key again replaces it;
   * a language the translator does not have is ignored. It announces nothing: whoever extends it is about to read what it added.
   */
  extend(locale: string, entries: Catalog): void {
    const current = this.catalogs[locale];
    if (!current) return;
    this.catalogs = { ...this.catalogs, [locale]: { ...current, ...entries } };
  }

  has(key: string): boolean {
    return this.catalogs[this.locale]?.[key] !== undefined || this.catalogs[this.fallback]?.[key] !== undefined;
  }

  t(key: string, params?: Params): string {
    let template = this.lookup(key, params);
    if (template === undefined) {
      this.warn.warnOnce(`missing:${key}`, `missing translation key "${key}"`);
      return key;
    }
    if (params) {
      template = template.replace(/\{(\w+)\}/g, (whole, name: string) => {
        const v = params[name];
        if (v === undefined) {
          this.warn.warnOnce(`param:${key}:${name}`, `translation "${key}" needs the parameter "${name}"`);
          return whole;
        }
        return String(v);
      });
    }
    return template;
  }

  private lookup(key: string, params?: Params): string | undefined {
    for (const lang of this.chain()) {
      const c = this.catalogs[lang];
      if (!c) continue;
      const count = params?.['count'];
      if (typeof count === 'number') {
        const plural = c[`${key}.${this.pluralRules(lang).select(count)}`] ?? c[`${key}.other`];
        if (plural !== undefined) return plural;
      }
      const plain = c[key];
      if (plain !== undefined) return plain;
    }
    return undefined;
  }

  private pluralRules(lang: string): Intl.PluralRules {
    let r = this.rules.get(lang);
    if (!r) {
      r = new Intl.PluralRules(lang);
      this.rules.set(lang, r);
    }
    return r;
  }

  private chain(): string[] {
    const cur = this.locale;
    return cur === this.fallback ? [cur] : [cur, this.fallback];
  }

  /** `es-MX` → `es`; a language without a catalog keeps `current` (or, at start-up, the fallback). */
  private resolve(locale: string, current?: string): string {
    const lang = locale.toLowerCase().split(/[-_]/)[0] ?? '';
    if (this.catalogs[lang]) return lang;
    if (current) return current;
    return this.catalogs[this.fallback] ? this.fallback : (Object.keys(this.catalogs)[0] ?? this.fallback);
  }
}

export function createTranslator(catalogs: Readonly<Record<string, Catalog>>, locale: string, fallback = 'en'): Translator {
  return new Translator(catalogs, locale, fallback);
}

/**
 * The language to start in: the first of the user's preferred languages that we have a catalog for (`es-MX` → `es`),
 * otherwise the fallback (docs/GAME-SPEC-2D.md §18: the device's language if Spanish or English, English otherwise).
 */
export function detectLocale(preferred: readonly string[], supported: readonly string[], fallback = 'en'): string {
  for (const p of preferred) {
    const lang = p.toLowerCase().split(/[-_]/)[0] ?? '';
    if (supported.includes(lang)) return lang;
  }
  return fallback;
}

/** Where a language preference can come from, strongest first. */
export interface LocaleSources {
  /** `?lang=`: a one-off override for this session (a test, a shared link); it is never saved. */
  url?: string | null;
  /** The language the player chose in the settings and the game saved. */
  saved?: string | null;
  /** The device's preferred languages, in order. */
  device: readonly string[];
}

/**
 * The language to start in: the URL's, else the one the player chose, else the device's, else the fallback — the first of them that
 * we have a catalog for (docs/GAME-SPEC-2D.md §18). A saved language that is no longer supported (a catalog was removed) is simply
 * skipped, never an error.
 */
export function chooseLocale(sources: LocaleSources, supported: readonly string[], fallback = 'en'): string {
  const preferred = [...(sources.url ? [sources.url] : []), ...(sources.saved ? [sources.saved] : []), ...sources.device];
  return detectLocale(preferred, supported, fallback);
}
