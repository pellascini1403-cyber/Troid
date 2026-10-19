import type { PickedFile } from '@/ui/settings/SavesScreen';

/**
 * The two things the saved-games screen asks of the browser that are about FILES (docs/PROMPT14-LOG.md): handing the player a copy of a game as a download, and reading the copy they choose. Both go
 * through the document's own elements — an anchor with `download`, an `<input type="file">` — so they work wherever the page does, with no dependency and no permission asked. They live in a chunk with
 * the menu: a player's first load carries neither.
 */

/** Hands `text` to the player as a file called `filename`. Resolves to whether the browser took it (it can still refuse to save it: that is the player's browser, not ours). Never throws. */
export function downloadText(doc: Document, filename: string, text: string): boolean {
  const win = doc.defaultView;
  if (!win) return false;
  try {
    const url = win.URL.createObjectURL(new win.Blob([text], { type: 'application/json' }));
    const link = doc.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    link.hidden = true;
    doc.body.appendChild(link);
    link.click();
    link.remove();
    // the browser needs the address for a moment to begin the download
    win.setTimeout(() => win.URL.revokeObjectURL(url), 30_000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Asks the player for a file and reads it as text. Must be called straight from the press that asked (a browser opens the dialog only for a gesture). Resolves to `null` if the dialog is cancelled; a
 * file over `maxBytes` is not read at all (`tooBig`: a saved game is a kilobyte, and what is bigger is not one). A browser that never says the dialog was cancelled leaves the promise unresolved, which
 * costs nothing: the caller does not wait on it.
 */
export function pickTextFile(doc: Document, maxBytes: number): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    doc.querySelector('input[data-troid-file]')?.remove(); // one that was left open and never answered
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json,text/plain';
    input.hidden = true;
    input.dataset['troidFile'] = '';
    input.dataset['testid'] = 'saves-file';
    doc.body.appendChild(input);
    const finish = (picked: PickedFile | null): void => {
      input.remove();
      resolve(picked);
    };
    input.addEventListener('cancel', () => finish(null), { once: true });
    input.addEventListener(
      'change',
      () => {
        const file = input.files?.[0];
        if (!file) return finish(null);
        if (file.size > maxBytes) return finish({ kind: 'tooBig' });
        file.text().then(
          (text) => finish({ kind: 'text', text }),
          () => finish({ kind: 'unreadable' }),
        );
      },
      { once: true },
    );
    input.click();
  });
}
