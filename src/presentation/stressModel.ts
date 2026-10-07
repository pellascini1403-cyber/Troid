/**
 * THE ARITHMETIC OF THE ART STRESS SCENE (`?lab=art-stress`, docs/ART-PIPELINE-2D.md part J): how a crowd of sprites is dealt among the sprite sets, and how the frame times
 * it takes to draw them are summarised. PURE — no Pixi, no clock — so that what the scene reports is tested without a GPU.
 */

export type StressOrder = 'sorted' | 'interleaved';

/**
 * Which of `sets` sprite sets sprite `i` of `n` is drawn from. `sorted`: in blocks — all of set 0, then all of set 1…, so the sprites that share a texture are
 * neighbours in the draw order (what a layer that groups its sprites by set gets). `interleaved`: round robin — set 0, 1, 2, 3, 0, 1… (what a layer gets that sorts by
 * depth and does not care which atlas a sprite is from).
 */
export function assignSet(i: number, n: number, sets: number, order: StressOrder): number {
  if (sets <= 1 || n <= 0) return 0;
  return order === 'interleaved' ? i % sets : Math.min(sets - 1, Math.floor((i * sets) / n));
}

export interface FrameSummary {
  frames: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  /** Standard deviation, ms: how uneven the frames are. */
  stdevMs: number;
  /** Frames that took more than twice the median: the hitches the player would see. */
  hitches: number;
}

const percentile = (sorted: readonly number[], p: number): number => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))] ?? 0;

/** Summarises frame times (ms). An empty list is all zeros. */
export function summarizeFrames(ms: readonly number[]): FrameSummary {
  const n = ms.length;
  if (n === 0) return { frames: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0, stdevMs: 0, hitches: 0 };
  const sorted = [...ms].sort((a, b) => a - b);
  const mean = ms.reduce((s, v) => s + v, 0) / n;
  const p50 = percentile(sorted, 0.5);
  const variance = ms.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  return { frames: n, meanMs: mean, p50Ms: p50, p95Ms: percentile(sorted, 0.95), maxMs: sorted[n - 1] ?? 0, stdevMs: Math.sqrt(variance), hitches: ms.filter((v) => v > 2 * p50).length };
}

/** The median of a list of whole numbers (draw calls per frame). */
export function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

/** Memory of a page of art as the GPU has it (RGBA8). */
export const pageBytes = (width: number, height: number): number => width * height * 4;

export const MIB = 1024 * 1024;

/** The draw-call budget of a frame (docs/GAME-SPEC-2D.md §3.5). */
export const DRAW_CALL_BUDGET = 60;

/** The memory budgets PROPOSED for art, decoded, in MiB (docs/ART-PIPELINE-2D.md part C): design targets, not measurements. */
export const MEMORY_BUDGET_MIB = { boot: 24, zone: 32, resident: 96 } as const;
