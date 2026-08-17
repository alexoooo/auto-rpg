export const FRAME_METER_WINDOW_MS = 500;

export type FrameMeterReading = Readonly<{ fps: number; worstMs: number }>;

/** Player-facing rAF cadence. It deliberately knows nothing about renderer work. */
export class GameFrameMeter {
  #windowStart: number | null = null;
  #previous: number | null = null;
  #frames = 0;
  #worstMs = 0;
  #reading: FrameMeterReading | null = null;

  get reading(): FrameMeterReading | null { return this.#reading; }
  get label(): string {
    return this.#reading === null
      ? "-- FPS / -- ms worst"
      : `${this.#reading.fps} FPS / ${this.#reading.worstMs} ms worst`;
  }

  advance(now: number): FrameMeterReading | null {
    if (!Number.isFinite(now)) throw new RangeError("frame time must be finite");
    if (this.#windowStart === null || this.#previous === null) {
      this.#windowStart = now;
      this.#previous = now;
      return null;
    }
    const interval = Math.max(0, now - this.#previous);
    this.#previous = now;
    this.#frames += 1;
    this.#worstMs = Math.max(this.#worstMs, interval);
    const elapsed = now - this.#windowStart;
    if (elapsed < FRAME_METER_WINDOW_MS) return null;
    this.#reading = Object.freeze({
      fps: Math.round(this.#frames * 1000 / Math.max(1, elapsed)),
      worstMs: Math.round(this.#worstMs),
    });
    this.#windowStart = now;
    this.#frames = 0;
    this.#worstMs = 0;
    return this.#reading;
  }

  reset(now?: number): void {
    if (now !== undefined && !Number.isFinite(now)) throw new RangeError("frame time must be finite");
    this.#windowStart = now ?? null;
    this.#previous = now ?? null;
    this.#frames = 0;
    this.#worstMs = 0;
    this.#reading = null;
  }
}
