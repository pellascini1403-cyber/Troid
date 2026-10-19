import { describe, expect, it } from 'vitest';
import { arrivalWaitFromQuery, artIndexUrl, optionsFromQuery } from '@/app/options';

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

describe('?light=off (the game as it was before the light of the world)', () => {
  it('takes away the light the energy casts and the atmosphere of the screen; anything else keeps them', () => {
    expect(optionsFromQuery(new URLSearchParams('light=off')).light).toBe('off');
    expect(optionsFromQuery(new URLSearchParams('')).light).toBe('auto');
    expect(optionsFromQuery(new URLSearchParams('light=on')).light).toBe('auto');
    expect(optionsFromQuery(new URLSearchParams('light=')).light).toBe('auto');
  });

  it('is independent of the other looks: the art of the effects and the visual of the hero ignore it', () => {
    const o = optionsFromQuery(new URLSearchParams('light=off&vfx=procedural&visual=art'));
    expect([o.light, o.vfx, o.visual]).toEqual(['off', 'procedural', 'art']);
  });
});

describe('?arrival=<ms> (how long the world waits at the black of a change of zone before it gives up on the art)', () => {
  it('is a whole number of milliseconds between 100 and 60 000; anything else is ignored (the default of ten seconds stands)', () => {
    const wait = (v: string): number | undefined => arrivalWaitFromQuery(new URLSearchParams(`arrival=${v}`));
    expect(wait('1500')).toBe(1500);
    expect(wait('100')).toBe(100);
    expect(wait('60000')).toBe(60000);
    for (const bad of ['', '99', '60001', '-5', '1.5', 'abc', '12 00', '1e3', '0x10']) expect(wait(bad), JSON.stringify(bad)).toBeUndefined();
    expect(arrivalWaitFromQuery(new URLSearchParams(''))).toBeUndefined();
    expect(optionsFromQuery(new URLSearchParams('arrival=2500')).arrivalWait).toBe(2500);
  });
});
