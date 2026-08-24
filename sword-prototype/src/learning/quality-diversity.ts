export const QD_BINS = 5;

export interface QualityDescriptor {
  readonly opportunityConversion: number;
  readonly contactConversion: number;
  readonly nearRangeStallShare: number;
}

export interface QualityResult {
  readonly terminalTier: number;
  readonly safetyTier: number;
  readonly feasible: boolean;
}

export interface QualityElite<T> {
  readonly descriptor: QualityDescriptor;
  readonly result: QualityResult;
  readonly value: T;
}

const bounded = (value: number, label: string): number => {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${label} must be within 0..1`);
  return value;
};

export function qualityCell(descriptor: QualityDescriptor): string {
  const bin = (value: number, label: string): number => Math.min(QD_BINS - 1, Math.floor(bounded(value, label) * QD_BINS));
  return [bin(descriptor.opportunityConversion, "opportunity conversion"),
    bin(descriptor.contactConversion, "contact conversion"),
    bin(descriptor.nearRangeStallShare, "near-range stall share")].join(":");
}

const better = (candidate: QualityResult, incumbent: QualityResult): boolean => {
  if (candidate.feasible !== incumbent.feasible) return candidate.feasible;
  return candidate.terminalTier > incumbent.terminalTier ||
    (candidate.terminalTier === incumbent.terminalTier && candidate.safetyTier > incumbent.safetyTier);
};

export class QualityArchive<T> {
  private readonly cells = new Map<string, QualityElite<T>>();
  offer(elite: QualityElite<T>): boolean {
    const key = qualityCell(elite.descriptor); const incumbent = this.cells.get(key);
    if (incumbent && !better(elite.result, incumbent.result)) return false;
    this.cells.set(key, Object.freeze({ descriptor: Object.freeze({ ...elite.descriptor }),
      result: Object.freeze({ ...elite.result }), value: elite.value }));
    return true;
  }
  get(descriptor: QualityDescriptor): QualityElite<T> | undefined { return this.cells.get(qualityCell(descriptor)); }
  entries(): readonly (readonly [string, QualityElite<T>])[] { return [...this.cells.entries()].sort(([a], [b]) => a.localeCompare(b)); }
}

export function selectValidationChampion<T>(rows: readonly { readonly id: number; readonly macroScore: number;
  readonly worstCellScore: number; readonly value: T }[]): T {
  if (!rows.length || rows.some((row) => !Number.isSafeInteger(row.id) ||
      !Number.isFinite(row.macroScore) || !Number.isFinite(row.worstCellScore))) {
    throw new Error("NEAT-QD validation selection requires finite macro and worst-cell rows");
  }
  return [...rows].sort((a, b) => b.worstCellScore - a.worstCellScore || b.macroScore - a.macroScore || a.id - b.id)[0]!.value;
}
