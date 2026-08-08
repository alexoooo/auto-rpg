import type { PresentationSnapshot, PresentationUnit } from "./presentation.js";

const TICK_MS = 1000 / 60;
const TAU = Math.PI * 2;
const frozen = <T extends object>(value: T): Readonly<T> => Object.freeze(value);

export class InterpolationProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InterpolationProtocolError";
  }
}

export function clampInterpolationAlpha(alpha: number): number {
  if (!Number.isFinite(alpha)) throw new InterpolationProtocolError("interpolation alpha is not finite");
  return Math.max(0, Math.min(1, alpha));
}

export function interpolateScalar(from: number, to: number, alpha: number): number {
  return from + (to - from) * clampInterpolationAlpha(alpha);
}

export function interpolateAngle(from: number, to: number, alpha: number): number {
  const a = clampInterpolationAlpha(alpha);
  const delta = ((to - from + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return from + delta * a;
}

export function interpolatePhase(from: number, to: number, alpha: number): number {
  const a = clampInterpolationAlpha(alpha);
  const delta = ((to - from + 0.5) % 1 + 1) % 1 - 0.5;
  return ((from + delta * a) % 1 + 1) % 1;
}

export function interpolateUnit(
  previous: PresentationUnit, current: PresentationUnit, alpha: number,
): PresentationUnit {
  if (previous.key !== current.key || previous.index !== current.index ||
      previous.generation !== current.generation) {
    throw new InterpolationProtocolError("cannot interpolate different unit identities");
  }
  const a = clampInterpolationAlpha(alpha);
  return frozen({
    ...current,
    x: interpolateScalar(previous.x, current.x, a),
    y: interpolateScalar(previous.y, current.y, a),
    vx: interpolateScalar(previous.vx, current.vx, a),
    vy: interpolateScalar(previous.vy, current.vy, a),
    radius: interpolateScalar(previous.radius, current.radius, a),
    hp: interpolateScalar(previous.hp, current.hp, a),
    maxHp: interpolateScalar(previous.maxHp, current.maxHp, a),
    facing: interpolateAngle(previous.facing, current.facing, a),
    limbAngle: interpolateAngle(previous.limbAngle, current.limbAngle, a),
    actionArc: interpolateAngle(previous.actionArc, current.actionArc, a),
    limbLine: interpolateAngle(previous.limbLine, current.limbLine, a),
    stridePhase: interpolatePhase(previous.stridePhase, current.stridePhase, a),
  });
}

export function interpolatePresentation(
  previous: PresentationSnapshot, current: PresentationSnapshot, alpha: number,
): PresentationSnapshot {
  if (previous.epoch !== current.epoch) {
    throw new InterpolationProtocolError("cannot interpolate snapshots from different epochs");
  }
  const a = clampInterpolationAlpha(alpha);
  const oldUnits = new Map(previous.units.map((unit) => [unit.key, unit]));
  const units: PresentationUnit[] = [];
  for (const unit of current.units) {
    const old = oldUnits.get(unit.key);
    if (old !== undefined) units.push(interpolateUnit(old, unit, a));
    else if (a === 1) units.push(unit);
  }
  return frozen({ ...current, units: frozen(units) });
}

export type InterpolationSample = Readonly<{
  alpha: number;
  snapshot: PresentationSnapshot;
}>;

export class PresentationTimeline {
  private previous: PresentationSnapshot | null = null;
  private current: PresentationSnapshot | null = null;
  private currentReceiptMs = 0;
  private durationMs = 0;
  private immediate = true;

  clear(): void {
    this.previous = null;
    this.current = null;
    this.currentReceiptMs = 0;
    this.durationMs = 0;
    this.immediate = true;
  }

  acceptSnapshot(snapshot: PresentationSnapshot, receivedAtMs: number): InterpolationSample {
    if (!Number.isFinite(receivedAtMs)) {
      throw new InterpolationProtocolError("snapshot receipt time is not finite");
    }
    if (this.current === null || snapshot.epoch !== this.current.epoch) {
      this.previous = snapshot;
      this.current = snapshot;
      this.currentReceiptMs = receivedAtMs;
      this.durationMs = 0;
      this.immediate = true;
      return frozen({ alpha: 1, snapshot });
    }
    if (receivedAtMs < this.currentReceiptMs) {
      throw new InterpolationProtocolError("snapshot receipt time moved backwards");
    }
    if (snapshot.tick < this.current.tick) {
      throw new InterpolationProtocolError("snapshot tick moved backwards within an epoch");
    }
    if (snapshot.tick === this.current.tick) {
      this.previous = snapshot;
      this.current = snapshot;
      this.currentReceiptMs = receivedAtMs;
      this.durationMs = 0;
      this.immediate = true;
      return frozen({ alpha: 1, snapshot });
    }
    this.previous = this.current;
    this.current = snapshot;
    this.currentReceiptMs = receivedAtMs;
    this.durationMs = (snapshot.tick - this.previous.tick) * TICK_MS;
    this.immediate = false;
    return frozen({ alpha: 0, snapshot: interpolatePresentation(this.previous, snapshot, 0) });
  }

  sample(nowMs: number): InterpolationSample | null {
    if (this.previous === null || this.current === null) return null;
    if (!Number.isFinite(nowMs)) throw new InterpolationProtocolError("render time is not finite");
    const alpha = this.immediate ? 1 : clampInterpolationAlpha((nowMs - this.currentReceiptMs) / this.durationMs);
    return frozen({ alpha, snapshot: interpolatePresentation(this.previous, this.current, alpha) });
  }
}
