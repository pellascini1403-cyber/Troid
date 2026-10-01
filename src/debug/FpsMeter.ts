/** Frames-per-second and frame-time averaged over a short window, so the readout is stable enough to read. */
export class FpsMeter {
  private readonly samples: number[] = [];
  private sum = 0;
  private worst = 0;

  constructor(private readonly window = 60) {}

  push(dtSeconds: number): void {
    if (dtSeconds <= 0 || dtSeconds > 1) return; // ignore pauses / first frame
    this.samples.push(dtSeconds);
    this.sum += dtSeconds;
    if (this.samples.length > this.window) this.sum -= this.samples.shift() as number;
    this.worst = Math.max(...this.samples);
  }

  get fps(): number {
    return this.samples.length === 0 ? 0 : this.samples.length / this.sum;
  }
  get frameMs(): number {
    return this.samples.length === 0 ? 0 : (this.sum / this.samples.length) * 1000;
  }
  get worstMs(): number {
    return this.worst * 1000;
  }
}
