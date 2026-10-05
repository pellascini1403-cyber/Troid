/**
 * Counts GL draw calls per frame by wrapping the `draw*` methods of the WebGL contexts (the same technique the
 * benchmark used ✅). Installed only in dev / `?hooks=1` sessions; it costs nothing otherwise.
 */
const DRAW_FNS = ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements'] as const;
const RING = 120;

export class DrawCallCounter {
  private static installed = false;
  private static active: DrawCallCounter | null = null;

  private current = 0;
  private readonly ring: number[] = [];
  private cursor = 0;

  /** Wraps the GL prototypes once (idempotent) and makes this counter the active one. */
  static install(counter: DrawCallCounter): void {
    DrawCallCounter.active = counter;
    if (DrawCallCounter.installed) return;
    DrawCallCounter.installed = true;
    const protos: object[] = [];
    if (typeof WebGL2RenderingContext !== 'undefined') protos.push(WebGL2RenderingContext.prototype);
    if (typeof WebGLRenderingContext !== 'undefined') protos.push(WebGLRenderingContext.prototype);
    for (const proto of protos) {
      const table = proto as unknown as Record<string, ((...a: unknown[]) => unknown) | undefined>;
      for (const name of DRAW_FNS) {
        const original = table[name];
        if (!original) continue;
        table[name] = function patched(this: unknown, ...args: unknown[]): unknown {
          const c = DrawCallCounter.active;
          if (c) c.current++;
          return original.apply(this, args);
        };
      }
    }
  }

  beginFrame(): void {
    this.current = 0;
  }

  endFrame(): void {
    if (this.ring.length < RING) this.ring.push(this.current);
    else this.ring[this.cursor] = this.current;
    this.cursor = (this.cursor + 1) % RING;
  }

  /** Draw calls of the last completed frame. */
  get last(): number {
    if (this.ring.length === 0) return 0;
    return this.ring[(this.cursor - 1 + this.ring.length) % this.ring.length] as number;
  }

  /** Median over the last frames (robust against one-off frames such as a texture upload). */
  get median(): number {
    if (this.ring.length === 0) return 0;
    const s = [...this.ring].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)] as number;
  }

  get max(): number {
    return this.ring.length ? Math.max(...this.ring) : 0;
  }

  reset(): void {
    this.ring.length = 0;
    this.cursor = 0;
  }
}
