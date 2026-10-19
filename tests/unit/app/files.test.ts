// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadText, pickTextFile } from '@/app/files';

/**
 * THE TWO FILE THINGS THE SAVED-GAMES SCREEN ASKS OF THE BROWSER (docs/PROMPT14-LOG.md): handing the player a copy of a game as a download, and reading the copy they choose. Both go through the document's
 * own elements and need no permission and no dependency.
 */
describe('downloadText', () => {
  let created: Array<{ blob: Blob; url: string }>;
  let revoked: string[];
  let clicked: Array<{ href: string; download: string }>;

  beforeEach(() => {
    document.body.innerHTML = '';
    created = [];
    revoked = [];
    clicked = [];
    vi.useFakeTimers();
    vi.spyOn(window.URL, 'createObjectURL').mockImplementation((blob) => {
      const url = `blob:test/${created.length}`;
      created.push({ blob: blob as Blob, url });
      return url;
    });
    vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation((url) => void revoked.push(url));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download });
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('makes a file of the text with the name it was given, presses an invisible link to it, and takes the link away', async () => {
    expect(downloadText(document, 'troid-partida-1-2026-10-19.json', '{"saveVersion":2}')).toBe(true);
    expect(clicked).toEqual([{ href: 'blob:test/0', download: 'troid-partida-1-2026-10-19.json' }]);
    expect(created[0]?.blob.type).toBe('application/json');
    expect(await created[0]?.blob.text()).toBe('{"saveVersion":2}');
    expect(document.querySelector('a')).toBeNull();
  });

  it('gives the address back to the browser later, not before it has had time to begin the download', () => {
    downloadText(document, 'x.json', '{}');
    expect(revoked).toEqual([]);
    vi.advanceTimersByTime(29_000);
    expect(revoked).toEqual([]);
    vi.advanceTimersByTime(2_000);
    expect(revoked).toEqual(['blob:test/0']);
  });

  it('a browser that cannot make the file answers false instead of throwing', () => {
    vi.spyOn(window.URL, 'createObjectURL').mockImplementation(() => {
      throw new Error('no blobs here');
    });
    expect(downloadText(document, 'x.json', '{}')).toBe(false);
    expect(document.querySelector('a')).toBeNull();
  });
});

describe('pickTextFile', () => {
  let opened: number;

  beforeEach(() => {
    document.body.innerHTML = '';
    opened = 0;
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => void opened++);
  });
  afterEach(() => vi.restoreAllMocks());

  const input = (): HTMLInputElement => document.querySelector('input[type="file"]') as HTMLInputElement;
  /** What the browser does when the player chooses a file: the input holds it and says it changed. */
  const choose = (file: File | null): void => {
    const el = input();
    Object.defineProperty(el, 'files', { value: file ? [file] : [], configurable: true });
    el.dispatchEvent(new Event('change'));
  };
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 4; i++) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  };

  it('opens the dialog at once (it is called from the press: a browser only opens one for a gesture), asking for JSON', () => {
    void pickTextFile(document, 1000);
    expect(opened).toBe(1);
    expect(input().accept).toContain('.json');
    expect(input().hidden).toBe(true);
    expect(input().dataset['testid']).toBe('saves-file');
  });

  it('resolves to the text of the file the player chose, and takes the input away', async () => {
    const picked = pickTextFile(document, 1000);
    choose(new File(['{"saveVersion":2}'], 'partida.json', { type: 'application/json' }));
    expect(await picked).toEqual({ kind: 'text', text: '{"saveVersion":2}' });
    expect(document.querySelector('input')).toBeNull();
  });

  it('a file over the limit is not read at all: it is "too big"', async () => {
    const picked = pickTextFile(document, 10);
    const big = new File(['x'.repeat(11)], 'big.json');
    const read = vi.spyOn(big, 'text');
    choose(big);
    expect(await picked).toEqual({ kind: 'tooBig' });
    expect(read).not.toHaveBeenCalled();
  });

  it('a file exactly at the limit is read', async () => {
    const picked = pickTextFile(document, 4);
    choose(new File(['abcd'], 'a.json'));
    expect(await picked).toEqual({ kind: 'text', text: 'abcd' });
  });

  it('a dialog that is cancelled resolves to null (and so does a change with no file)', async () => {
    const a = pickTextFile(document, 1000);
    input().dispatchEvent(new Event('cancel'));
    expect(await a).toBeNull();
    const b = pickTextFile(document, 1000);
    choose(null);
    expect(await b).toBeNull();
    expect(document.querySelector('input')).toBeNull();
  });

  it('a file the browser cannot read is "unreadable"', async () => {
    const picked = pickTextFile(document, 1000);
    const broken = new File(['{}'], 'a.json');
    vi.spyOn(broken, 'text').mockRejectedValue(new Error('denied'));
    choose(broken);
    expect(await picked).toEqual({ kind: 'unreadable' });
  });

  it('an input left open by a dialog that never answered is replaced by the next one (they do not pile up)', async () => {
    void pickTextFile(document, 1000);
    void pickTextFile(document, 1000);
    expect(document.querySelectorAll('input[type="file"]')).toHaveLength(1);
    choose(new File(['a'], 'a.json'));
    await settle();
    expect(document.querySelectorAll('input[type="file"]')).toHaveLength(0);
  });
});
