import { sourcesOf, type AudioFormat, type AudioIndex } from './manifest';

/**
 * THE LOADER OF THE SOUNDS (docs/PROMPT18-LOG.md): fetches the files of a GROUP — `core`, `boss`, `music.ruins`… — decodes them, keeps them while somebody needs the group and lets them go a little after nobody does. A game never
 * holds all its music in memory (a minute of stereo is 23 MiB once decoded): the music of a place is fetched when the hero comes near it and let go when the hero has left it.
 *
 * It NEVER fails the game. A file that cannot be fetched or decoded is tried in the next format and, failing that, left out: the sound that had only that file simply does not play, and the report of the load says which.
 * Nothing here waits for a person, a context or a gesture: the bytes are fetched and decoded by the browser off the main thread.
 */
export interface LoaderIO {
  /** The bytes of a file, `url` absolute. Rejects on a bad status, a network error or when `signal` aborts. */
  fetchBytes(url: string, signal: AbortSignal): Promise<ArrayBuffer>;
  /** The audio in `bytes`. Rejects when it cannot be decoded. */
  decode(bytes: ArrayBuffer): Promise<AudioBuffer>;
}

export interface LoaderOptions {
  index: AudioIndex;
  /** The URL the manifest's paths are relative to (the folder of `index.json`). */
  baseUrl: string;
  io: LoaderIO;
  /** The formats this browser can play, best first. */
  formats: readonly AudioFormat[];
  /** Files fetched at the same time (default 6). */
  concurrency?: number;
  /** How long a group nobody needs any more is kept before it is let go (ms, default 20 000): a hero who steps back through a door finds the room's music still there. */
  graceMs?: number;
  /** A file that has not arrived by now is given up on (ms, default 20 000). */
  timeoutMs?: number;
  /** After a failure the file is not asked for again until this long has passed (ms, default 15 000). */
  retryAfterMs?: number;
  now?: () => number;
  /** Timers, injected so that a test does not wait. */
  timers?: { set(fn: () => void, ms: number): unknown; clear(handle: unknown): void };
  warn?: (message: string) => void;
}

export interface GroupReport {
  group: string;
  /** The sounds of the group and how many of their variations were decoded. */
  sounds: number;
  loaded: number;
  failed: string[];
}

interface Group {
  name: string;
  ids: string[];
  refs: number;
  state: 'idle' | 'loading' | 'ready';
  promise: Promise<GroupReport> | null;
  report: GroupReport | null;
  bytes: number;
  releaseTimer: unknown;
}

const BYTES_PER_SAMPLE = 4;

export class SoundLoader {
  private readonly groups = new Map<string, Group>();
  private readonly buffers = new Map<string, AudioBuffer[]>();
  /** The last failure of each file (path → time), so that a dead link is not hammered. */
  private readonly failedAt = new Map<string, number>();
  private readonly opts: Required<Pick<LoaderOptions, 'concurrency' | 'graceMs' | 'timeoutMs' | 'retryAfterMs'>> & LoaderOptions;
  private inFlight = 0;
  private readonly queue: Array<() => void> = [];
  private disposed = false;
  private fetched = 0;

  constructor(options: LoaderOptions) {
    this.opts = { concurrency: 6, graceMs: 20_000, timeoutMs: 20_000, retryAfterMs: 15_000, ...options };
    for (const [id, s] of Object.entries(options.index.sounds)) {
      let g = this.groups.get(s.group);
      if (!g) this.groups.set(s.group, (g = { name: s.group, ids: [], refs: 0, state: 'idle', promise: null, report: null, bytes: 0, releaseTimer: null }));
      g.ids.push(id);
    }
  }

  /** The decoded variations of a sound (empty when it is not loaded, or none of its files could be). */
  get(id: string): readonly AudioBuffer[] {
    return this.buffers.get(id) ?? EMPTY;
  }

  has(id: string): boolean {
    return this.get(id).length > 0;
  }

  /** Whether the group is known to the manifest. */
  knows(group: string): boolean {
    return this.groups.has(group);
  }

  /** Whether the group's files are in memory now. */
  isReady(group: string): boolean {
    return this.groups.get(group)?.state === 'ready';
  }

  /**
   * Asks for a group: it is fetched (if it is not in memory) and kept until it has been `release`d as many times as it was `retain`ed. Resolves when the group is in — never rejects: what could not be loaded is in
   * the report.
   */
  retain(group: string): Promise<GroupReport> {
    const g = this.groups.get(group);
    if (!g || this.disposed) return Promise.resolve({ group, sounds: 0, loaded: 0, failed: [] });
    g.refs++;
    this.cancelRelease(g);
    if (g.state === 'ready' && g.report) {
      // a group that was ready but lost some file (a network blip): ask for those again, the rest is there
      if (g.report.failed.length > 0 && this.canRetry(g)) return this.load(g);
      return Promise.resolve(g.report);
    }
    return this.load(g);
  }

  /** One holder of the group lets go of it. With nobody left, the group is kept `graceMs` more and then dropped from memory. */
  release(group: string): void {
    const g = this.groups.get(group);
    if (!g || g.refs === 0) return;
    g.refs--;
    if (g.refs > 0 || g.state === 'idle') return;
    this.cancelRelease(g);
    const timers = this.opts.timers ?? { set: (fn: () => void, ms: number) => setTimeout(fn, ms), clear: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
    g.releaseTimer = timers.set(() => {
      g.releaseTimer = null;
      if (g.refs === 0) this.unload(g);
    }, this.opts.graceMs);
  }

  /** The memory the decoded sounds take, in bytes. */
  get bytes(): number {
    let total = 0;
    for (const list of this.buffers.values()) for (const b of list) total += b.length * b.numberOfChannels * BYTES_PER_SAMPLE;
    return total;
  }

  stats(): { bytes: number; fetched: number; groups: Record<string, { state: string; refs: number; loaded: number; failed: number; bytes: number }> } {
    const groups: Record<string, { state: string; refs: number; loaded: number; failed: number; bytes: number }> = {};
    for (const g of this.groups.values()) groups[g.name] = { state: g.state, refs: g.refs, loaded: g.report?.loaded ?? 0, failed: g.report?.failed.length ?? 0, bytes: g.bytes };
    return { bytes: this.bytes, fetched: this.fetched, groups };
  }

  dispose(): void {
    this.disposed = true;
    const timers = this.opts.timers;
    for (const g of this.groups.values()) {
      if (g.releaseTimer !== null) (timers ? timers.clear(g.releaseTimer) : clearTimeout(g.releaseTimer as ReturnType<typeof setTimeout>));
      g.releaseTimer = null;
    }
    this.buffers.clear();
    this.queue.length = 0;
  }

  // ---------------------------------------------------------------------------------------------------------------

  private canRetry(g: Group): boolean {
    const now = this.now();
    return (g.report?.failed ?? []).some((path) => now - (this.failedAt.get(path) ?? -Infinity) >= this.opts.retryAfterMs);
  }

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  private cancelRelease(g: Group): void {
    if (g.releaseTimer === null) return;
    const timers = this.opts.timers;
    if (timers) timers.clear(g.releaseTimer);
    else clearTimeout(g.releaseTimer as ReturnType<typeof setTimeout>);
    g.releaseTimer = null;
  }

  private unload(g: Group): void {
    for (const id of g.ids) this.buffers.delete(id);
    g.state = 'idle';
    g.promise = null;
    g.report = null;
    g.bytes = 0;
  }

  private load(g: Group): Promise<GroupReport> {
    if (g.state === 'loading' && g.promise) return g.promise;
    g.state = 'loading';
    g.promise = this.loadGroup(g).then((report) => {
      g.report = report;
      g.bytes = 0;
      for (const id of g.ids) for (const b of this.get(id)) g.bytes += b.length * b.numberOfChannels * BYTES_PER_SAMPLE;
      // nobody wants it any more (it was released while it was still arriving): do not keep it
      if (this.disposed || g.refs === 0) {
        if (!this.disposed) this.unload(g);
        return report;
      }
      g.state = 'ready';
      return report;
    });
    return g.promise;
  }

  private async loadGroup(g: Group): Promise<GroupReport> {
    const failed: string[] = [];
    let loaded = 0;
    await Promise.all(
      g.ids.map(async (id) => {
        const def = this.opts.index.sounds[id];
        if (!def) return;
        const have = this.buffers.get(id) ?? [];
        // variations already in memory (a retry after some failed) are kept; only the missing ones are asked for
        const slots: Array<AudioBuffer | null> = def.variants.map((_, k) => have[k] ?? null);
        await Promise.all(
          def.variants.map(async (variant, k) => {
            if (slots[k]) return;
            const paths = sourcesOf(variant, this.opts.formats);
            for (const path of paths) {
              const since = this.failedAt.get(path);
              if (since !== undefined && this.now() - since < this.opts.retryAfterMs) continue;
              try {
                slots[k] = await this.fetchAndDecode(path);
                this.failedAt.delete(path);
                return;
              } catch (err) {
                this.failedAt.set(path, this.now());
                this.opts.warn?.(`audio: ${path} could not be loaded (${err instanceof Error ? err.message : String(err)})`);
              }
            }
            failed.push(paths[0] ?? `${id}#${k}`);
          }),
        );
        // the variations that are there, in order; a sound with none has no entry (it does not play)
        const there = slots.filter((b): b is AudioBuffer => b !== null);
        if (there.length > 0) this.buffers.set(id, there);
        else this.buffers.delete(id);
        loaded += there.length;
      }),
    );
    return { group: g.name, sounds: g.ids.length, loaded, failed };
  }

  private async fetchAndDecode(path: string): Promise<AudioBuffer> {
    const url = new URL(path, this.opts.baseUrl).href;
    await this.slot();
    let bytes: ArrayBuffer;
    try {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), this.opts.timeoutMs);
      try {
        bytes = await this.opts.io.fetchBytes(url, abort.signal);
        this.fetched++;
      } finally {
        clearTimeout(timer);
      }
    } finally {
      this.free();
    }
    return this.opts.io.decode(bytes);
  }

  /** At most `concurrency` files are being fetched at once. */
  private slot(): Promise<void> {
    if (this.inFlight < this.opts.concurrency) {
      this.inFlight++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.queue.push(() => { this.inFlight++; resolve(); }));
  }

  private free(): void {
    this.inFlight--;
    this.queue.shift()?.();
  }
}

const EMPTY: readonly AudioBuffer[] = [];

/** The default way to fetch bytes: the browser's `fetch`, an aborted one rejects. */
export async function fetchBytes(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.arrayBuffer();
}

/** `decodeAudioData` in either of its two forms (older Safari knows only the callbacks). */
export function decodeWith(ctx: BaseAudioContext, bytes: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    try {
      const result = ctx.decodeAudioData(bytes, resolve, (err) => reject(err instanceof Error ? err : new Error('the audio could not be decoded')));
      if (result && typeof result.then === 'function') result.then(resolve, (err: unknown) => reject(err instanceof Error ? err : new Error('the audio could not be decoded')));
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
