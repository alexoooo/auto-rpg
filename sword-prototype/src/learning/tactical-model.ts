export const TACTICAL_MODEL_VERSION = 1;
export const TACTICAL_STATE_COLUMNS = Object.freeze([
  "reachMargin", "facingError", "threatAlignment", "contactProbability", "vitalityPotential",
] as const);
export type TacticalStateColumn = typeof TACTICAL_STATE_COLUMNS[number];

export interface TacticalState {
  readonly reachMargin: number;
  readonly facingError: number;
  readonly threatAlignment: number;
  readonly contactProbability: number;
  readonly vitalityPotential: number;
}

export interface TacticalTraceRow {
  readonly tactic: string;
  readonly before: TacticalState;
  readonly after: TacticalState;
  readonly contact: boolean;
  readonly bodyLoadout?: string;
  readonly split?: "train" | "validation" | "test";
  readonly traceIndex?: number;
}

export interface TacticalDelta extends TacticalState {}
export interface TacticalCalibration { readonly signedReachError: number; readonly contactBrier: number; readonly vitalityDeltaError: number }
export interface FittedTactic { readonly delta: TacticalDelta; readonly calibration: TacticalCalibration; readonly samples: number }
export interface TacticalModel { readonly version: number; readonly featureNames: readonly TacticalStateColumn[];
  readonly tactics: Readonly<Record<string, FittedTactic>>; readonly cells: Readonly<Record<string, Readonly<Record<string, FittedTactic>>>>;
  readonly digest: string }

const finiteState = (state: TacticalState, label: string): void => {
  for (const name of TACTICAL_STATE_COLUMNS) if (!Number.isFinite(state[name])) throw new Error(`${label}.${name} is non-finite`);
};

export function fitTacticalModel(rows: readonly TacticalTraceRow[]): TacticalModel {
  if (rows.some((row) => row.split !== undefined && row.split !== "train")) {
    const split = rows.find((row) => row.split !== undefined && row.split !== "train")!.split;
    throw new Error(`tactical model fitting cannot read ${split} rows`);
  }
  const groups = new Map<string, TacticalTraceRow[]>();
  for (const row of rows) {
    finiteState(row.before, "trace before"); finiteState(row.after, "trace after");
    const group = groups.get(row.tactic) ?? []; group.push(row); groups.set(row.tactic, group);
  }
  const tactics: Record<string, FittedTactic> = {};
  for (const [tactic, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const delta = Object.fromEntries(TACTICAL_STATE_COLUMNS.map((name) => [name,
      group.reduce((sum, row) => sum + row.after[name] - row.before[name], 0) / group.length])) as unknown as TacticalDelta;
    const signedReachError = group.reduce((sum, row) => sum +
      (row.before.reachMargin + delta.reachMargin - row.after.reachMargin), 0) / group.length;
    const contactBrier = group.reduce((sum, row) => sum +
      (Math.max(0, Math.min(1, row.before.contactProbability + delta.contactProbability)) - (row.contact ? 1 : 0)) ** 2, 0) / group.length;
    const vitalityDeltaError = group.reduce((sum, row) => sum + Math.abs(
      delta.vitalityPotential - (row.after.vitalityPotential - row.before.vitalityPotential)), 0) / group.length;
    tactics[tactic] = Object.freeze({ delta: Object.freeze(delta), samples: group.length,
      calibration: Object.freeze({ signedReachError, contactBrier, vitalityDeltaError }) });
  }
  const cells: Record<string, Record<string, FittedTactic>> = {};
  for (const row of rows) {
    const cell = row.bodyLoadout ?? "default"; (cells[cell] ??= {});
  }
  for (const cell of Object.keys(cells).sort()) {
    const cellRows = rows.filter((row) => (row.bodyLoadout ?? "default") === cell);
    const model = fitGroups(cellRows); cells[cell] = model;
  }
  const body = { version: TACTICAL_MODEL_VERSION, featureNames: TACTICAL_STATE_COLUMNS,
    tactics, cells };
  return Object.freeze({ ...body, tactics: Object.freeze(tactics),
    cells: Object.freeze(Object.fromEntries(Object.entries(cells).map(([cell, fitted]) => [cell, Object.freeze(fitted)]))),
    digest: digest(body) });
}

const fitGroups = (rows: readonly TacticalTraceRow[]): Record<string, FittedTactic> => {
  const groups = new Map<string, TacticalTraceRow[]>();
  for (const row of rows) { const group = groups.get(row.tactic) ?? []; group.push(row); groups.set(row.tactic, group); }
  const tactics: Record<string, FittedTactic> = {};
  for (const [tactic, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const delta = Object.fromEntries(TACTICAL_STATE_COLUMNS.map((name) => [name,
      group.reduce((sum, row) => sum + row.after[name] - row.before[name], 0) / group.length])) as unknown as TacticalDelta;
    const calibration = calibrationFor(group, delta);
    tactics[tactic] = Object.freeze({ delta: Object.freeze(delta), samples: group.length, calibration: Object.freeze(calibration) });
  }
  return tactics;
};

const calibrationFor = (rows: readonly TacticalTraceRow[], delta: TacticalDelta): TacticalCalibration => ({
  signedReachError: rows.reduce((sum, row) => sum + row.before.reachMargin + delta.reachMargin - row.after.reachMargin, 0) / rows.length,
  contactBrier: rows.reduce((sum, row) => sum +
    (Math.max(0, Math.min(1, row.before.contactProbability + delta.contactProbability)) - (row.contact ? 1 : 0)) ** 2, 0) / rows.length,
  vitalityDeltaError: rows.reduce((sum, row) => sum + Math.abs(delta.vitalityPotential -
    (row.after.vitalityPotential - row.before.vitalityPotential)), 0) / rows.length,
});

const stable = (value: unknown): string => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ?
  `[${value.map(stable).join(",")}]` : `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(",")}}`;
const digest = (value: unknown): string => { let hash = 0x811c9dc5; for (const byte of new TextEncoder().encode(stable(value))) {
  hash ^= byte; hash = Math.imul(hash, 0x01000193) >>> 0; } return hash.toString(16).padStart(8, "0"); };

/** Replaces only calibration fields from frozen validation traces; coefficients remain train-only. */
export function calibrateTacticalModel(model: TacticalModel, rows: readonly TacticalTraceRow[]): TacticalModel {
  if (rows.some((row) => row.split !== "validation")) throw new Error("tactical calibration can read validation rows only");
  const tactics = { ...model.tactics }; const cells: Record<string, Record<string, FittedTactic>> = {};
  for (const [cell, fitted] of Object.entries(model.cells)) cells[cell] = { ...fitted };
  for (const cell of Object.keys(cells)) for (const [tactic, fitted] of Object.entries(cells[cell]!)) {
    const sample = rows.filter((row) => row.bodyLoadout === cell && row.tactic === tactic);
    if (sample.length) cells[cell]![tactic] = Object.freeze({ ...fitted, calibration: Object.freeze(calibrationFor(sample, fitted.delta)) });
  }
  const body = { version: model.version, featureNames: model.featureNames, tactics, cells };
  return Object.freeze({ ...body, digest: digest(body) });
}

export function predictTactical(model: TacticalModel, tactic: string, state: TacticalState): TacticalState {
  finiteState(state, "tactical state"); const fitted = model.tactics[tactic];
  if (!fitted) throw new Error(`tactical model has no coefficients for "${tactic}"`);
  return Object.freeze(Object.fromEntries(TACTICAL_STATE_COLUMNS.map((name) => [name, state[name] + fitted.delta[name]])) as unknown as TacticalState);
}

export function predictTacticalCell(model: TacticalModel, bodyLoadout: string, tactic: string, state: TacticalState): TacticalState {
  finiteState(state, "tactical state"); const fitted = model.cells[bodyLoadout]?.[tactic];
  if (!fitted) throw new Error(`lookahead refuses ${bodyLoadout}: tactic "${tactic}" has no fitted model`);
  return Object.freeze(Object.fromEntries(TACTICAL_STATE_COLUMNS.map((name) =>
    [name, state[name] + fitted.delta[name]])) as unknown as TacticalState);
}

export interface CalibrationLimits { readonly signedReachError: number; readonly contactBrier: number; readonly vitalityDeltaError: number }
export function requireCalibration(model: TacticalModel, tactic: string, bodyLoadout: string, limits: CalibrationLimits): void {
  const calibration = model.cells[bodyLoadout]?.[tactic]?.calibration ?? (bodyLoadout === "default" ? model.tactics[tactic]?.calibration : undefined);
  if (!calibration) throw new Error(`lookahead refuses ${bodyLoadout}: tactic "${tactic}" has no calibrated model`);
  if (Math.abs(calibration.signedReachError) > limits.signedReachError || calibration.contactBrier > limits.contactBrier ||
      calibration.vitalityDeltaError > limits.vitalityDeltaError) {
    throw new Error(`lookahead refuses ${bodyLoadout}: calibration failed for tactic "${tactic}"`);
  }
}
