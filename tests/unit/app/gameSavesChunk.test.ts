import { describe, expect, it, vi } from 'vitest';
import { GameSaves } from '@/app/gameSaves';
import { PlayStats } from '@/gameplay/PlayStats';
import { SaveSlots } from '@/save/SaveSlots';
import { SettingsStore } from '@/save/SettingsStore';
import { MemoryStorage } from '@/save/StorageAdapter';

/**
 * THE CODE OF THE SAVED GAMES' ACTIONS is a chunk of its own, fetched the first time the menu asks (docs/PROMPT14-LOG.md). When it cannot be fetched the page says why, in the log, and the screen says it in
 * words; and what it learned is not kept: asking again asks again (a browser may fail it again until the page is reloaded — the screen says to reload). Here the module cannot be loaded at all, so the file
 * stands alone: no other test is run with that module missing.
 */
vi.mock('@/app/saveActions', () => {
  throw new Error('Failed to fetch dynamically imported module');
});

describe('the code of the saved games\' actions', () => {
  it('a fetch that fails is reported to the log and thrown on — and the next ask tries again: it is not remembered as failed by the page', async () => {
    const storage = new MemoryStorage();
    const settings = new SettingsStore(storage);
    await settings.load();
    const warnings: string[] = [];
    const saves = new GameSaves({
      slots: new SaveSlots(storage),
      settings,
      slot: 1,
      stats: new PlayStats(),
      durable: true,
      platform: { now: () => 0, reload: () => undefined, onLeave: () => () => undefined, every: () => () => undefined },
      notify: () => undefined,
      warn: (message) => void warnings.push(message),
    });
    await expect(saves.actions()).rejects.toThrow();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("the saved games' actions could not be loaded");
    await expect(saves.actions(), 'it asked again').rejects.toThrow();
    expect(warnings).toHaveLength(2);
    saves.dispose();
  });
});
