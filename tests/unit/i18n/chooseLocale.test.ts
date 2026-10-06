import { describe, expect, it } from 'vitest';
import { chooseLocale } from '@/i18n/translator';

/**
 * Which language the game starts in (docs/GAME-SPEC-2D.md §18): `?lang=` (a one-off) > what the player chose and saved > the
 * device's own > English. Only languages we have a catalog for count; a saved one that is gone is skipped, never an error.
 */
const SUPPORTED = ['es', 'en'];

describe('chooseLocale', () => {
  it('the URL beats the saved choice, which beats the device', () => {
    expect(chooseLocale({ url: 'en', saved: 'es', device: ['es-MX'] }, SUPPORTED)).toBe('en');
    expect(chooseLocale({ saved: 'en', device: ['es-ES'] }, SUPPORTED)).toBe('en');
    expect(chooseLocale({ device: ['es-ES', 'en-US'] }, SUPPORTED)).toBe('es');
  });

  it('with nothing chosen, the first of the device\'s languages we speak; none → English', () => {
    expect(chooseLocale({ device: ['fr-FR', 'es-AR'] }, SUPPORTED)).toBe('es');
    expect(chooseLocale({ device: ['fr-FR', 'ja'] }, SUPPORTED)).toBe('en');
    expect(chooseLocale({ device: [] }, SUPPORTED)).toBe('en');
  });

  it('a language we do not have is skipped, wherever it comes from', () => {
    expect(chooseLocale({ url: 'fr', saved: 'es', device: ['en'] }, SUPPORTED)).toBe('es');
    expect(chooseLocale({ saved: 'fr', device: ['es'] }, SUPPORTED)).toBe('es');
    expect(chooseLocale({ url: 'xx', saved: 'yy', device: ['zz'] }, SUPPORTED, 'en')).toBe('en');
  });

  it('null and empty sources are the same as none', () => {
    expect(chooseLocale({ url: null, saved: null, device: ['es'] }, SUPPORTED)).toBe('es');
    expect(chooseLocale({ url: '', saved: '', device: ['es'] }, SUPPORTED)).toBe('es');
  });

  it('case and region do not matter (es-MX, ES, en_GB)', () => {
    expect(chooseLocale({ url: 'ES', device: [] }, SUPPORTED)).toBe('es');
    expect(chooseLocale({ saved: 'en_GB', device: ['es'] }, SUPPORTED)).toBe('en');
  });
});
