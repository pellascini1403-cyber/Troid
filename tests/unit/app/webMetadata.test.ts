import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * WHAT THE PAGE SAYS OF ITSELF (docs/PROMPT20-LOG.md, docs/PUBLISHING.md): the manifest, the page's head and the notices a store or a browser reads. A game that says it is a "3D" game when it is a 2D one, that asks for a
 * portrait window or whose theme colour is not the colour of its curtain is a game that was not looked at before it was sent.
 */
const root = resolve(__dirname, '../../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');
const manifest = JSON.parse(read('public/manifest.webmanifest')) as Record<string, unknown> & { icons: Array<{ src: string }> };
const html = read('index.html');

describe('the web manifest', () => {
  it('names the game and describes the game it is — a 2D one', () => {
    expect(manifest['name']).toBe('Troid');
    expect(manifest['short_name']).toBe('Troid');
    const description = String(manifest['description']);
    expect(description).toMatch(/2D/);
    expect(description, 'the first prompts of the project were 3D; the game is not').not.toMatch(/3D/);
  });

  it('is played sideways, in the whole screen, and starts from where it is served (a relative address: a sub-folder, a file, a native shell)', () => {
    expect(manifest['orientation']).toBe('landscape');
    expect(manifest['display']).toBe('fullscreen');
    expect(String(manifest['start_url']).startsWith('.')).toBe(true);
  });

  it('every icon it names is a file of the page', () => {
    for (const icon of manifest.icons) expect(existsSync(resolve(root, 'public', icon.src)), icon.src).toBe(true);
  });

  it('has the colours of the page: the theme and the background are those of the curtain the page shows first', () => {
    expect(manifest['theme_color']).toBe('#0b0d10');
    expect(manifest['background_color']).toBe('#0b0d10');
    expect(html).toContain('<meta name="theme-color" content="#0b0d10"');
    expect(html).toMatch(/background:\s*#0b0d10/);
  });
});

describe('the head of the page', () => {
  it('fits a phone with a notch (the interface keeps clear of it) and does not let the page zoom itself', () => {
    expect(html).toMatch(/<meta\s+name="viewport"[^>]*viewport-fit=cover/);
    expect(html).toMatch(/<meta\s+name="viewport"[^>]*user-scalable=no/);
  });

  it('has a title, a description and a link to its manifest', () => {
    expect(html).toContain('<title>Troid</title>');
    expect(html).toMatch(/<meta name="description" content="[^"]{20,}"/);
    expect(html).toContain('<link rel="manifest" href="./manifest.webmanifest"');
  });

  it('says what it can before the game exists, in both languages (a page that cannot start must not be black)', () => {
    expect(html).toMatch(/class="boot-msg" lang="en"/);
    expect(html).toMatch(/class="boot-msg" lang="es"/);
    expect(html).toContain('role="alert"');
    expect(html).toMatch(/location\.reload\(\)/);
  });
});

describe('the notices that travel with the game', () => {
  it('the third-party notices are in public/ (the build copies them next to the game), and name what the game ships', () => {
    const notices = read('public/THIRD_PARTY_NOTICES.txt');
    expect(notices).toMatch(/pixi\.js \d+\.\d+\.\d+ — MIT/);
    const lock = JSON.parse(read('package.json')) as { dependencies?: Record<string, string> };
    for (const dep of Object.keys(lock.dependencies ?? {})) expect(notices, dep).toContain(dep);
  });
});
