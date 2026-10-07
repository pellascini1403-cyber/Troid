import { describe, expect, it } from 'vitest';
import { artIndexUrl, optionsFromQuery } from '@/app/options';

describe('where the art is (?art= and the build)', () => {
  const base = 'https://troid.example/play/index.html';

  it('a page the build found no art for asks for none: nothing is fetched, nothing can fail', () => {
    expect(artIndexUrl(undefined, '', base)).toBeNull();
  });

  it('the art the build found sits next to the page, wherever the page is served from', () => {
    expect(artIndexUrl(undefined, 'art/index.json', base)).toBe('https://troid.example/play/art/index.json');
    expect(artIndexUrl(undefined, 'art/index.json', 'capacitor://localhost/')).toBe('capacitor://localhost/art/index.json');
    expect(artIndexUrl(undefined, 'art/index.json', 'file:///game/index.html')).toBe('file:///game/art/index.json');
  });

  it('?art=<folder> wins over the build, and may be given with or without a closing slash', () => {
    expect(artIndexUrl('art-test', 'art/index.json', base)).toBe('https://troid.example/play/art-test/index.json');
    expect(artIndexUrl('art-test/', '', base)).toBe('https://troid.example/play/art-test/index.json');
    expect(artIndexUrl('a/b.c/d_e-f', '', base)).toBe('https://troid.example/play/a/b.c/d_e-f/index.json');
  });

  it('?art= can never point at another site or outside the page\'s folder', () => {
    for (const bad of ['', '/', '//evil.example/art', 'https://evil.example/art', 'http:/x', '../art', 'a/../b', '..', 'a//b', '/abs', 'a b', 'a\\b', 'a?b=1', 'a#b', 'data:text/json,{}', 'javascript:alert(1)']) {
      expect(artIndexUrl(bad, 'art/index.json', base), JSON.stringify(bad)).toBeNull();
    }
  });

  it('is read from the URL like every other option', () => {
    expect(optionsFromQuery(new URLSearchParams('art=art-test')).art).toBe('art-test');
    expect(optionsFromQuery(new URLSearchParams('hooks=1')).art).toBeUndefined();
  });
});
