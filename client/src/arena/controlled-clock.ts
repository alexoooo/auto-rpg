import { MAX_CONTROL_ELAPSED_MS, MAX_CONTROLLED_BATCH_TICKS, TICKS_PER_SECOND } from "../protocol/messages.js";

/** Hidden time and debugger stalls are stops, not simulation backlog. */
/**
 * The wall-clock half of a controlled arena drive.
 *
 * Time is accumulated independently of display refresh, but a tick is removed
 * only when the caller has no earlier tick in flight. That last rule is what
 * keeps tick N+1 from being simulated before the page has selected input N+1.
 */
export class ControlledClock {
  #lastMs: number;
  #carry = 0;
  #inFlight = false;
  #claimed = 0;
  #paused = false;

  constructor(nowMs: number) { this.#lastMs = nowMs; }

  /** Add visible elapsed time and answer the whole ticks waiting to be sent. */
  advance(nowMs: number): number {
    const elapsed = Math.max(0, nowMs - this.#lastMs);
    this.#lastMs = nowMs;
    if (this.#paused) return 0;
    this.#carry += Math.min(elapsed, MAX_CONTROL_ELAPSED_MS) * TICKS_PER_SECOND / 1_000;
    return Math.floor(this.#carry + 1e-9);
  }

  /** Claim exactly one due tick. False means either no time is due or one is in flight. */
  beginTick(): boolean {
    return this.beginBatch(1) === 1;
  }

  /** Claim due work without consuming it; the acknowledgement commits it. */
  beginBatch(limit = MAX_CONTROLLED_BATCH_TICKS): number {
    if (this.#paused || this.#inFlight) return 0;
    const due = Math.min(Math.floor(this.#carry + 1e-9), limit);
    if (due === 0) return 0;
    this.#claimed = due;
    this.#inFlight = true;
    return due;
  }

  /** Release the backpressure lock after that tick's chunk or refusal arrives. */
  settleTick(): void { this.settleBatch(1); }

  settleBatch(steppedTicks: number): void {
    if (!this.#inFlight) return;
    this.#carry = Math.max(0, this.#carry - Math.min(this.#claimed, steppedTicks));
    this.#claimed = 0;
    this.#inFlight = false;
  }

  /**
   * Stop immediately and forget every fraction accumulated before the stop.
   * Resuming therefore needs a fresh timestamp and can never replay hidden time.
   */
  stop(nowMs: number): void {
    this.#paused = true;
    this.#lastMs = nowMs;
    this.#carry = 0;
    this.#claimed = 0;
  }

  resume(nowMs: number): void {
    this.#paused = false;
    this.#lastMs = nowMs;
    this.#carry = 0;
    this.#claimed = 0;
  }

  get paused(): boolean { return this.#paused; }
  get inFlight(): boolean { return this.#inFlight; }
  get dueTicks(): number { return Math.floor(this.#carry + 1e-9); }
}
