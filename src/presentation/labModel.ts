/**
 * THE TIME OF THE PLAYER LAB (`?lab=player`, docs/ART-PIPELINE-2D.md part G): which frame of a clip is on screen. PURE — no Pixi, no DOM — so that what the lab shows
 * is tested without a GPU. Where the picture sits in metres is `pictureBounds`, which the game itself uses.
 */

/**
 * A clip played by hand: play, pause, step a frame at a time, change the speed. Unlike the game's animator — which is driven by the simulation — this one is driven
 * by a person looking at the art, so it can stop on any frame and walk through them one by one.
 */
export class ClipTimeline {
  playing = true;
  speed = 1;
  private t = 0;

  constructor(
    readonly count: number,
    readonly fps: number,
    readonly loops: boolean,
  ) {}

  /** The frame on screen. */
  get index(): number {
    if (this.count <= 1 || !(this.fps > 0)) return 0;
    const i = Math.floor(this.t * this.fps + 1e-9);
    return this.loops ? i % this.count : Math.min(i, this.count - 1);
  }

  /** Plays on from the frame it stands on — or from the first one when a clip that plays once has already reached its end (pressing play on a finished clip plays it again). */
  play(): void {
    this.playing = true;
    if (this.finished) this.t = 0;
  }

  /** `dt` real seconds. Does nothing while paused. */
  advance(dt: number): void {
    if (!this.playing || !(dt > 0)) return;
    this.t += dt * this.speed;
    // a loop only needs the time inside one turn; a clip that plays once stops where it ends
    if (this.loops && this.count > 0 && this.fps > 0) this.t %= this.count / this.fps;
    else if (this.fps > 0) this.t = Math.min(this.t, this.count / this.fps);
  }

  /** Pauses and moves `delta` whole frames, wrapping around the clip (the way a person looks through it). */
  step(delta: number): void {
    this.playing = false;
    this.seek(this.index + delta);
  }

  /** Pauses on the frame `i` (wrapped into the clip). */
  seek(i: number): void {
    const n = Math.max(1, this.count);
    const frame = ((Math.round(i) % n) + n) % n;
    this.t = this.fps > 0 ? (frame + 0.5) / this.fps : 0;
    this.playing = false;
  }

  restart(): void {
    this.t = 0;
  }

  get finished(): boolean {
    return !this.loops && this.count > 0 && this.index >= this.count - 1 && this.fps > 0 && this.t >= (this.count - 1) / this.fps;
  }
}
