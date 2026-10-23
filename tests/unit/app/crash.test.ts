// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { showCrash } from '@/app/crash';

/**
 * THE PAGE WHEN THE GAME CANNOT GO ON (docs/PROMPT20-LOG.md): it says so in the player's language, once, over everything, with the one thing they can do — and it needs nothing of the game that has just failed.
 */
describe('the crash page', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.lang = 'en';
  });
  const text = (id: string): string => document.querySelector(`[data-testid="${id}"], #${id}`)?.textContent ?? '';

  it('says it in English and in Spanish, as the page is', () => {
    showCrash();
    expect(text('crash-title')).toBe('Something went wrong');
    expect(text('crash-reload')).toBe('Reload');
    document.body.innerHTML = '';
    document.documentElement.lang = 'es';
    showCrash();
    expect(text('crash-title')).toBe('Algo ha fallado');
    expect(text('crash-reload')).toBe('Recargar');
    document.body.innerHTML = '';
    document.documentElement.lang = 'es-MX';
    showCrash();
    expect(text('crash-title'), 'a regional Spanish is Spanish').toBe('Algo ha fallado');
    document.body.innerHTML = '';
    document.documentElement.lang = 'fr';
    showCrash();
    expect(text('crash-title'), 'any other language gets the fallback, English').toBe('Something went wrong');
  });

  it('is a modal alert over the whole page that the game\'s input leaves alone, and its button has the focus', () => {
    const root = showCrash();
    expect(root.getAttribute('role')).toBe('alertdialog');
    expect(root.getAttribute('aria-modal')).toBe('true');
    expect(root.getAttribute('aria-labelledby')).toBe('crash-title');
    expect(root.hasAttribute('data-ui-block')).toBe(true);
    expect(root.style.position).toBe('fixed');
    expect(Number(root.style.zIndex), 'above the curtain, the menu and the overlays').toBeGreaterThan(1000);
    expect(document.activeElement).toBe(document.querySelector('[data-testid="crash-reload"]'));
  });

  it('is shown once: asking again gives the one there is', () => {
    const a = showCrash();
    const b = showCrash();
    expect(b).toBe(a);
    expect(document.querySelectorAll('[data-testid="crash"]')).toHaveLength(1);
  });

  it('reloads the page when the button is pressed — and only then', () => {
    let reloads = 0;
    showCrash(document, () => void reloads++);
    expect(reloads).toBe(0);
    (document.querySelector('[data-testid="crash-reload"]') as HTMLButtonElement).click();
    expect(reloads).toBe(1);
  });
});
