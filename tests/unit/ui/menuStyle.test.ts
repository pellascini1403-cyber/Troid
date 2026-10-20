// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { ensureMenuStyle } from '@/ui/settings/menuStyle';

/**
 * THE LOOK OF THE MENU's rules that are about being used (docs/PROMPT14-LOG.md §8): a screen that does not fit — a phone held sideways is 390 px tall — scrolls in the middle while its title and its way
 * back stay where they are, and says so. The rules are read from the sheet the screens write; what a browser draws of them is photographed by the E2E.
 */
const sheet = (): string => document.getElementById('troid-menu-style')?.textContent ?? '';

describe('the stylesheet of the menu', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('is written once, however many screens ask for it', () => {
    ensureMenuStyle(document);
    ensureMenuStyle(document);
    expect(document.querySelectorAll('#troid-menu-style')).toHaveLength(1);
  });

  it('what does not fit scrolls in the middle of the panel and never pulls the page or the game behind it', () => {
    ensureMenuStyle(document);
    expect(sheet()).toMatch(/\.troid-settings \.settings-body \{[^}]*overflow-y:auto[^}]*overscroll-behavior:contain/);
    expect(sheet()).toMatch(/\.troid-settings \.settings-panel \{[^}]*max-height:90vh/);
  });

  it('says there is more below only while there is: the last lines fade out under data-more="1" — and a focused control is kept clear of that fade', () => {
    ensureMenuStyle(document);
    expect(sheet()).toMatch(/\.troid-settings \.settings-body\[data-more="1"\] \{[^}]*mask-image:linear-gradient\(180deg, #000 calc\(100% - 26px\), transparent\)/);
    expect(sheet(), 'older WebKit needs its prefix').toMatch(/\.settings-body\[data-more="1"\] \{[^}]*-webkit-mask-image:/);
    // the fade is not drawn for a screen that fits or one that is at its end: there is no rule that applies it to every body
    expect(sheet()).not.toMatch(/\.troid-settings \.settings-body \{[^}]*mask-image/);
    expect(sheet()).not.toContain('.settings-body::after');
    expect(sheet()).toMatch(/\.troid-settings \.settings-body \{[^}]*scroll-padding:[^;}]*28px/);
  });
});
