export const FRAME_METER_WINDOW_MS = 500;

export type FrameMeterReading = Readonly<{ fps: number; worstMs: number }>;

export type ArenaWaitState = "ready" | "producer" | "input-ack" | "paused" | "hidden";

export type ArenaFrameReading = Readonly<{
  displayFps: number;
  renderFps: number;
  /**
   * Simulation ticks the screen actually advanced through, per second.
   *
   * **This is the one a watcher is complaining about when they say the fight
   * looks like a slide show.** The other two clocks can both be healthy while
   * this one is on the floor: the compositor keeps calling back at the display
   * rate, the arena honestly declines to redraw a frame nothing changed in,
   * and the fight in front of the reader crawls. Reporting only the first two
   * made a starving playhead read as a sound 58 FPS.
   *
   * It is fight time, not wall time, so `Speed` scales it: 60 at 1x on a
   * healthy machine, 240 at 4x, and the shortfall from `60 * rate` is the
   * measure of the stall.
   */
  fightFps: number;
  worstMs: number;
  budgetMs: number;
  wait: ArenaWaitState;
}>;

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

/**
 * The arena's two presentation clocks, sampled by its one display owner.
 *
 * `renderCount` is cumulative so a callback which did no Babylon work remains
 * visible instead of being silently renamed a rendered frame. Refresh is an
 * optional foreground observation; automation and ordinary use fall back to
 * the median callback interval from the same window.
 */
export class ArenaFrameMeter {
  #windowStart: number | null = null;
  #previous: number | null = null;
  #previousRenderCount = 0;
  #previousTick: number | null = null;
  #callbacks = 0;
  #renders = 0;
  #ticks = 0;
  #worstMs = 0;
  #intervals: number[] = [];
  #reading: ArenaFrameReading | null = null;

  get reading(): ArenaFrameReading | null { return this.#reading; }
  get label(): string {
    const reading = this.#reading;
    return reading === null ? "-- display / -- 3D / -- fight / -- ms worst / -- ms budget"
      : `${reading.displayFps} display / ${reading.renderFps} 3D / ${reading.fightFps} fight / `
        + `${reading.worstMs} ms worst / ${reading.budgetMs.toFixed(1)} ms budget / ${reading.wait}`;
  }
  get ariaLabel(): string {
    const reading = this.#reading;
    return reading === null
      ? "Arena display and three dimensional render cadence have not been measured yet"
      : `Arena display ${reading.displayFps} callbacks per second, `
        + `${reading.renderFps} three dimensional renders per second, `
        + `${reading.fightFps} fight ticks per second of a nominal sixty, `
        + `worst callback interval ${reading.worstMs} milliseconds, `
        + `frame budget ${reading.budgetMs.toFixed(1)} milliseconds, waiting ${reading.wait}`;
  }

  /**
   * `shownTick` is the simulation tick the caller has just put on the screen.
   *
   * Forward motion is credited; a scrub backwards or a fight swap re-bases
   * without crediting anything, so a jump to tick 0 cannot be read as the fight
   * having advanced. `null` -- no fight loaded -- simply contributes nothing.
   */
  advance(now: number, renderCount: number, wait: ArenaWaitState,
    refreshHz: number | null = null, shownTick: number | null = null): ArenaFrameReading | null {
    if (!Number.isFinite(now)) throw new RangeError("frame time must be finite");
    if (!Number.isSafeInteger(renderCount) || renderCount < 0) {
      throw new RangeError("render count must be a non-negative safe integer");
    }
    if (refreshHz !== null && (!Number.isFinite(refreshHz) || refreshHz <= 0)) {
      throw new RangeError("refresh rate must be positive when supplied");
    }
    if (shownTick !== null && (!Number.isSafeInteger(shownTick) || shownTick < 0)) {
      throw new RangeError("shown tick must be a non-negative safe integer");
    }
    if (this.#windowStart === null || this.#previous === null) {
      this.#windowStart = now;
      this.#previous = now;
      this.#previousRenderCount = renderCount;
      this.#previousTick = shownTick;
      return null;
    }
    const interval = Math.max(0, now - this.#previous);
    this.#previous = now;
    this.#callbacks += 1;
    this.#renders += Math.max(0, renderCount - this.#previousRenderCount);
    this.#previousRenderCount = renderCount;
    if (shownTick !== null) {
      if (this.#previousTick !== null) this.#ticks += Math.max(0, shownTick - this.#previousTick);
      this.#previousTick = shownTick;
    }
    this.#worstMs = Math.max(this.#worstMs, interval);
    this.#intervals.push(interval);
    const elapsed = now - this.#windowStart;
    if (elapsed < FRAME_METER_WINDOW_MS) return null;
    const ordered = [...this.#intervals].sort((a, b) => a - b);
    const median = ordered[Math.floor(ordered.length / 2)] ?? 0;
    this.#reading = Object.freeze({
      displayFps: Math.round(this.#callbacks * 1000 / Math.max(1, elapsed)),
      renderFps: Math.round(this.#renders * 1000 / Math.max(1, elapsed)),
      fightFps: Math.round(this.#ticks * 1000 / Math.max(1, elapsed)),
      worstMs: Math.round(this.#worstMs),
      budgetMs: refreshHz === null ? median : 1000 / refreshHz,
      wait,
    });
    this.#windowStart = now;
    this.#callbacks = 0;
    this.#renders = 0;
    this.#ticks = 0;
    this.#worstMs = 0;
    this.#intervals = [];
    return this.#reading;
  }

  reset(now?: number, renderCount = 0, shownTick: number | null = null): void {
    if (now !== undefined && !Number.isFinite(now)) throw new RangeError("frame time must be finite");
    if (!Number.isSafeInteger(renderCount) || renderCount < 0) {
      throw new RangeError("render count must be a non-negative safe integer");
    }
    if (shownTick !== null && (!Number.isSafeInteger(shownTick) || shownTick < 0)) {
      throw new RangeError("shown tick must be a non-negative safe integer");
    }
    this.#windowStart = now ?? null;
    this.#previous = now ?? null;
    this.#previousRenderCount = renderCount;
    this.#previousTick = shownTick;
    this.#callbacks = 0;
    this.#renders = 0;
    this.#ticks = 0;
    this.#worstMs = 0;
    this.#intervals = [];
    this.#reading = null;
  }
}
