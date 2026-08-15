import { performanceProgressLabel } from "./performance.js";

export const FALLBACK_BROWSER_CAPTURE_LABEL = "Chrome 151.0.7922.72";

export const browserCaptureLabel = (
  userAgent: string,
  brands: readonly Readonly<{ brand: string; version: string }>[] = [],
): string => {
  const meaningful = (version: string): boolean => {
    const parts = version.split(".");
    if (parts.length < 3 || parts.some((part) => !/^\d+$/.test(part))) return false;
    return parts.slice(2).some((part) => Number(part) !== 0);
  };
  const match = /(?:Chrome|Chromium)\/([0-9]+(?:\.[0-9]+)+)/.exec(userAgent);
  if (match?.[1] && meaningful(match[1])) return `Chrome ${match[1]}`;
  const brand = brands.find((item) => /Chrom(?:e|ium)/i.test(item.brand) && meaningful(item.version));
  return brand === undefined ? FALLBACK_BROWSER_CAPTURE_LABEL : `Chrome ${brand.version}`;
};

export type CaptureControlView = Readonly<{
  startDisabled: boolean;
  downloadDisabled: boolean;
  metadataLocked: boolean;
  progress: number;
  progressLabel: string | null;
}>;

export type CaptureControlRuntime = Readonly<{
  now: () => number;
  schedule: (callback: () => void, intervalMs: number) => number;
  cancel: (handle: number) => void;
  render: (view: CaptureControlView) => void;
}>;

export class CaptureControls {
  readonly #runtime: CaptureControlRuntime;
  #ready = false;
  #active = false;
  #accepted = false;
  #terminal = false;
  #startedAt = 0;
  #timer: number | null = null;
  #reject: ((reason: string) => void) | null = null;

  constructor(runtime: CaptureControlRuntime) {
    this.#runtime = runtime;
    this.#render();
  }

  get active(): boolean { return this.#active; }

  updateReadiness(ready: boolean): void {
    this.#ready = ready && !this.#terminal;
    this.#render();
  }

  begin(reject: (reason: string) => void): boolean {
    if (!this.#ready || this.#active || this.#accepted || this.#terminal) return false;
    this.#active = true;
    this.#accepted = false;
    this.#reject = reject;
    this.#startedAt = this.#runtime.now();
    this.#tick();
    this.#timer = this.#runtime.schedule(() => this.#tick(), 1000);
    return true;
  }

  settle(status: "complete" | "rejected"): boolean {
    if (!this.#active || this.#terminal) return false;
    this.#clearTimer();
    this.#active = false;
    this.#reject = null;
    this.#accepted = status === "complete";
    this.#render();
    return true;
  }

  terminate(reason: string): void {
    if (this.#terminal) return;
    this.#terminal = true;
    this.#ready = false;
    this.#accepted = false;
    const reject = this.#reject;
    this.#reject = null;
    this.#active = false;
    this.#clearTimer();
    this.#render();
    reject?.(reason);
  }

  #tick(): void {
    if (!this.#active) return;
    this.#render(this.#runtime.now() - this.#startedAt);
  }

  #clearTimer(): void {
    if (this.#timer !== null) this.#runtime.cancel(this.#timer);
    this.#timer = null;
  }

  #render(elapsedMs: number | null = null): void {
    this.#runtime.render(Object.freeze({
      startDisabled: !this.#ready || this.#active || this.#accepted || this.#terminal,
      downloadDisabled: !this.#accepted,
      metadataLocked: this.#active,
      progress: this.#accepted ? 150
        : elapsedMs === null ? 0 : Math.min(150, Math.floor(Math.max(0, elapsedMs) / 1000)),
      progressLabel: elapsedMs === null ? null : performanceProgressLabel(elapsedMs),
    }));
  }
}
