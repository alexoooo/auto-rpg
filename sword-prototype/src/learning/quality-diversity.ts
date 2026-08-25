export const QD_BINS = 5;

/**
 * What a controller *achieved*, in three numbers, and deliberately not what it
 * chose.
 *
 * **Stage C2b widened the output contract and did not widen this. The decision
 * stands; one of its two reasons does not, and the correction is worth more than
 * the conclusion.** The arithmetic reason was written as `125 x 72 = 9,000`
 * cells against a full-budget run of `populationSize` 128 x `generations` 80 =
 * **10,240 genome evaluations**, and therefore "fewer than one elite per cell
 * before a single cell is ever revisited". **The 72 was wrong.** It is
 * `3 effectors x 4 targets x 6 stances`, the nominal per-action multiplier that
 * `dagger.ts` uses correctly for "grew about seventy-twofold", and it is not a
 * count of legal tuples. Measured: `|deployableTactics|` peaks at **21** on any
 * body at all (`sword+sword+bite`), the union over the whole body space is 33,
 * and the union over the thirteen research cells -- which is the space an
 * archive built from `researchMatrix` would actually index -- is **24**. So the
 * true figure is `125 x 24` = 3,000 cells against 10,240 evaluations, which is
 * **3.4 evaluations per cell, not 0.9**, and the sentence it was carrying is
 * simply false.
 *
 * Re-taken on the true numbers: 3.4 is thin for MAP-Elites, whose whole
 * mechanism is competition inside a cell, but "thin" is a tuning objection and
 * not a refusal. **The arithmetic no longer decides this, and the outcome
 * argument below is now the only reason.**
 *
 * It survives any budget, which is why it is enough on its own: these are
 * **outcome** measures and the chosen tuple is an input to them.
 * `opportunityConversion` asks what fraction of the openings a controller took,
 * not which hand it took them with. Bolting one onto the other changes what the
 * archive is a map *of*, which is a different experiment rather than a
 * finer-grained one -- and the thing somebody actually wants from a tuple
 * dimension, an archive that keeps a controller which fights one-handed beside
 * one that uses both, is what the **descriptor** would have to be redefined to
 * measure rather than what a fourth key would give them. A "chosen tuple"
 * dimension also has to answer which of a bout's hundreds of tuples it means,
 * and no answer to that is an outcome either.
 *
 * `the_quality_archive_stays_a_125_cell_outcome_map_keyed_on_nothing_a_controller_chose`
 * pins the cell count, so widening it silently is a failure rather than a
 * decision nobody re-took.
 */
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
