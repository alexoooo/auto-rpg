import { canonicalIntegrityJson, integrityDigest, type IntegrityValue } from "./integrity.ts";

export const CONSTRUCT_LAB_ROW_VERSION = 3 as const;
export const CONSTRUCT_LAB_REPORT_VERSION = 3 as const;

export type ConstructLabSide = "left" | "right";

export interface ConstructActionProgressSample {
  readonly step: number;
  readonly side: ConstructLabSide;
  readonly action: string;
  readonly group: string;
  readonly phase: string;
  /** Controller-owned monotonic or target-error progress value. */
  readonly progress: number;
  readonly epsilon: number;
  readonly capabilityAvailable: boolean;
}

export interface ConstructStuckInterval {
  readonly side: ConstructLabSide;
  readonly action: string;
  readonly group: string;
  readonly phase: string;
  readonly firstStep: number;
  readonly lastStep: number;
}

export interface ConstructSideLabMetrics {
  readonly damage: number;
  readonly severs: number;
  readonly requests: number;
  readonly admissions: number;
  readonly completions: number;
  readonly refusals: number;
  readonly cancellations: number;
  readonly idleSteps: number;
  readonly stuckSteps: number;
  readonly energyJ: number;
  readonly peakHeatJ: number;
  readonly capabilityLosses: number;
}

export interface ConstructLabRow {
  readonly version: 3;
  readonly job: number;
  readonly matchupDigest: string;
  readonly seed: number;
  readonly mirrored: boolean;
  readonly winner: "left" | "right" | "draw";
  readonly ending: "death" | "time" | "refused";
  readonly steps: number;
  readonly seconds: number;
  readonly range: Readonly<{ minM: number; meanM: number; finalM: number }>;
  readonly left: ConstructSideLabMetrics;
  readonly right: ConstructSideLabMetrics;
  readonly actionTrace: readonly string[];
  readonly refusals: readonly Readonly<{ id: string; reason: string }>[];
  readonly capabilityLosses: readonly Readonly<{ id: string; reason: string }>[];
  readonly progress: readonly ConstructActionProgressSample[];
  readonly stuck: readonly ConstructStuckInterval[];
  /** Empty for a qualified row; a refusal is canonical evidence, not telemetry. */
  readonly limitation: string | null;
}

export interface ConstructLabAggregate {
  readonly bouts: number;
  readonly leftWins: number;
  readonly rightWins: number;
  readonly draws: number;
  readonly timeCaps: number;
  readonly refused: number;
  readonly damage: Readonly<{ left: number; right: number }>;
  readonly severs: Readonly<{ left: number; right: number }>;
  readonly actions: Readonly<{
    requests: number;
    admissions: number;
    completions: number;
    refusals: number;
    cancellations: number;
  }>;
  readonly idleSteps: number;
  readonly stuckSteps: number;
  readonly energyJ: number;
  readonly peakHeatJ: number;
  readonly capabilityLosses: number;
  readonly meanRangeM: number;
}

export interface ConstructLabReport {
  readonly version: 3;
  readonly runDigest: string;
  readonly rowCount: number;
  readonly rowsDigest: string;
  readonly aggregate: ConstructLabAggregate;
}

const finite = (value: number, field: string): void => {
  if (!Number.isFinite(value)) throw new Error(`construct lab ${field} must be finite`);
};

const METRIC_FIELDS = ["damage", "severs", "requests", "admissions", "completions", "refusals",
  "cancellations", "idleSteps", "stuckSteps", "energyJ", "peakHeatJ", "capabilityLosses"] as const;
const INTEGER_METRICS = new Set<keyof ConstructSideLabMetrics>(["severs", "requests", "admissions",
  "completions", "refusals", "cancellations", "idleSteps", "stuckSteps", "capabilityLosses"]);

const validateMetrics = (value: ConstructSideLabMetrics, side: ConstructLabSide): void => {
  const unknown = Object.keys(value).find((field) => !METRIC_FIELDS.includes(field as keyof ConstructSideLabMetrics));
  if (unknown) throw new Error(`construct lab ${side} metrics have unknown field "${unknown}"`);
  for (const field of METRIC_FIELDS) {
    const number = value[field];
    finite(number, `${side}.${field}`);
    if (number < 0) throw new Error(`construct lab ${side}.${field} must be non-negative`);
    if (INTEGER_METRICS.has(field) && !Number.isSafeInteger(number)) {
      throw new Error(`construct lab ${side}.${field} must be a safe integer`);
    }
  }
};

export function validateConstructLabRow(row: ConstructLabRow): ConstructLabRow {
  if (row.version !== CONSTRUCT_LAB_ROW_VERSION) throw new Error(`construct lab row version ${row.version} is unsupported`);
  if (!Number.isSafeInteger(row.job) || row.job < 0) throw new Error("construct lab row job must be a non-negative safe integer");
  if (!/^[a-z0-9][a-z0-9-]{0,95}$/i.test(row.matchupDigest)) throw new Error("construct lab row matchupDigest is invalid");
  if (!Number.isSafeInteger(row.seed) || row.seed < 0 || row.seed > 0xffff_ffff) throw new Error("construct lab row seed is invalid");
  if (typeof row.mirrored !== "boolean") throw new Error("construct lab row mirrored must be boolean");
  if (row.winner !== "left" && row.winner !== "right" && row.winner !== "draw") {
    throw new Error("construct lab row winner is invalid");
  }
  if (row.ending !== "death" && row.ending !== "time" && row.ending !== "refused") {
    throw new Error("construct lab row ending is invalid");
  }
  if (!Number.isSafeInteger(row.steps) || row.steps < 0) throw new Error("construct lab row steps is invalid");
  finite(row.seconds, "seconds");
  if (row.seconds < 0) throw new Error("construct lab row seconds must be non-negative");
  finite(row.range.minM, "range.minM");
  finite(row.range.meanM, "range.meanM");
  finite(row.range.finalM, "range.finalM");
  if (row.range.minM < 0 || row.range.meanM < 0 || row.range.finalM < 0) {
    throw new Error("construct lab row ranges must be non-negative");
  }
  validateMetrics(row.left, "left");
  validateMetrics(row.right, "right");
  for (const [field, values] of [["actionTrace", row.actionTrace], ["refusals", row.refusals],
    ["capabilityLosses", row.capabilityLosses], ["progress", row.progress], ["stuck", row.stuck]] as const) {
    if (!Array.isArray(values)) throw new Error(`construct lab row ${field} must be an array`);
  }
  if (row.actionTrace.some((id) => typeof id !== "string" || id.length === 0)) {
    throw new Error("construct lab actionTrace must contain stable non-empty IDs");
  }
  for (const [field, values] of [["refusals", row.refusals], ["capabilityLosses", row.capabilityLosses]] as const) {
    if (values.some(({ id, reason }) => typeof id !== "string" || id.length === 0 ||
      typeof reason !== "string" || reason.length === 0)) {
      throw new Error(`construct lab ${field} must contain stable IDs and reasons`);
    }
  }
  for (const sample of row.progress) {
    if (!Number.isSafeInteger(sample.step) || sample.step < 0) throw new Error("construct lab progress step is invalid");
    if ((sample.side !== "left" && sample.side !== "right") || typeof sample.action !== "string" ||
        sample.action.length === 0 || typeof sample.group !== "string" || sample.group.length === 0 ||
        typeof sample.phase !== "string" || sample.phase.length === 0 || typeof sample.capabilityAvailable !== "boolean") {
      throw new Error("construct lab progress sample identity is invalid");
    }
    finite(sample.progress, "progress value");
    finite(sample.epsilon, "progress epsilon");
    if (sample.epsilon < 0) throw new Error("construct lab progress epsilon must be non-negative");
  }
  for (const interval of row.stuck) {
    if ((interval.side !== "left" && interval.side !== "right") || typeof interval.action !== "string" ||
        interval.action.length === 0 || typeof interval.group !== "string" || interval.group.length === 0 ||
        typeof interval.phase !== "string" || interval.phase.length === 0 ||
        !Number.isSafeInteger(interval.firstStep) || !Number.isSafeInteger(interval.lastStep) ||
        interval.firstStep < 0 || interval.lastStep < interval.firstStep) {
      throw new Error("construct lab stuck interval is invalid");
    }
  }
  const stuckSteps = (side: ConstructLabSide) => row.stuck
    .filter((interval) => interval.side === side)
    .reduce((sum, interval) => sum + interval.lastStep - interval.firstStep + 1, 0);
  if (row.left.stuckSteps !== stuckSteps("left") || row.right.stuckSteps !== stuckSteps("right")) {
    throw new Error("construct lab stuckSteps must equal the raw stuck intervals");
  }
  if (row.ending === "refused" && (typeof row.limitation !== "string" || row.limitation.length === 0)) {
    throw new Error("a refused construct lab row must name its limitation");
  }
  if (row.ending !== "refused" && row.limitation !== null) {
    throw new Error("a completed construct lab row cannot carry a limitation");
  }
  return row;
}

export function classifyConstructStuck(
  samples: readonly ConstructActionProgressSample[],
  windowSteps: number,
): readonly ConstructStuckInterval[] {
  if (!Number.isSafeInteger(windowSteps) || windowSteps < 2) {
    throw new Error("construct stuck windowSteps must be an integer of at least two");
  }
  const ordered = [...samples].sort((a, b) => a.step - b.step || a.side.localeCompare(b.side) ||
    a.group.localeCompare(b.group) || a.action.localeCompare(b.action));
  const state = new Map<string, { first: ConstructActionProgressSample; last: ConstructActionProgressSample; count: number }>();
  const intervals: ConstructStuckInterval[] = [];
  const finish = (run: { first: ConstructActionProgressSample; last: ConstructActionProgressSample; count: number }): void => {
    if (run.count < windowSteps || !run.first.capabilityAvailable || !run.last.capabilityAvailable ||
        run.first.progress <= run.first.epsilon || run.last.progress <= run.last.epsilon) return;
    intervals.push(Object.freeze({
      side: run.first.side,
      action: run.first.action,
      group: run.first.group,
      phase: run.first.phase,
      firstStep: run.first.step,
      lastStep: run.last.step,
    }));
  };
  for (const sample of ordered) {
    const key = `${sample.side}\0${sample.group}\0${sample.action}`;
    const prior = state.get(key);
    const continued = prior !== undefined && sample.capabilityAvailable && prior.last.capabilityAvailable &&
      sample.progress > sample.epsilon && prior.last.progress > prior.last.epsilon &&
      sample.phase === prior.last.phase && sample.step === prior.last.step + 1 &&
      Math.abs(sample.progress - prior.first.progress) <= Math.max(sample.epsilon, prior.first.epsilon);
    if (!continued && prior) finish(prior);
    const next = continued ? { first: prior.first, last: sample, count: prior.count + 1 } :
      { first: sample, last: sample, count: 1 };
    state.set(key, next);
  }
  for (const run of state.values()) finish(run);
  return Object.freeze(intervals.sort((a, b) => a.firstStep - b.firstStep || a.side.localeCompare(b.side) ||
    a.group.localeCompare(b.group) || a.action.localeCompare(b.action)));
}

export function canonicalConstructLabRowJson(row: ConstructLabRow): string {
  validateConstructLabRow(row);
  return canonicalIntegrityJson(row as unknown as IntegrityValue);
}

const sumSide = (rows: readonly ConstructLabRow[], side: ConstructLabSide, field: keyof ConstructSideLabMetrics): number =>
  rows.reduce((sum, row) => sum + row[side][field], 0);

export function recomputeConstructLabReport(rowsValue: readonly ConstructLabRow[], runDigest: string): ConstructLabReport {
  if (rowsValue.length === 0) throw new Error("construct lab report requires at least one row");
  if (!/^[a-z0-9][a-z0-9-]{0,95}$/i.test(runDigest)) throw new Error("construct lab report runDigest is invalid");
  const rows = [...rowsValue].sort((a, b) => a.job - b.job);
  rows.forEach((row, index) => {
    validateConstructLabRow(row);
    if (row.job !== index) throw new Error(`construct lab rows are missing or duplicate at job ${index}`);
  });
  const action = (field: "requests" | "admissions" | "completions" | "refusals" | "cancellations") =>
    sumSide(rows, "left", field) + sumSide(rows, "right", field);
  const aggregate: ConstructLabAggregate = Object.freeze({
    bouts: rows.length,
    leftWins: rows.filter((row) => row.winner === "left").length,
    rightWins: rows.filter((row) => row.winner === "right").length,
    draws: rows.filter((row) => row.winner === "draw").length,
    timeCaps: rows.filter((row) => row.ending === "time").length,
    refused: rows.filter((row) => row.ending === "refused").length,
    damage: Object.freeze({ left: sumSide(rows, "left", "damage"), right: sumSide(rows, "right", "damage") }),
    severs: Object.freeze({ left: sumSide(rows, "left", "severs"), right: sumSide(rows, "right", "severs") }),
    actions: Object.freeze({
      requests: action("requests"), admissions: action("admissions"), completions: action("completions"),
      refusals: action("refusals"), cancellations: action("cancellations"),
    }),
    idleSteps: sumSide(rows, "left", "idleSteps") + sumSide(rows, "right", "idleSteps"),
    stuckSteps: sumSide(rows, "left", "stuckSteps") + sumSide(rows, "right", "stuckSteps"),
    energyJ: sumSide(rows, "left", "energyJ") + sumSide(rows, "right", "energyJ"),
    peakHeatJ: Math.max(...rows.flatMap((row) => [row.left.peakHeatJ, row.right.peakHeatJ])),
    capabilityLosses: sumSide(rows, "left", "capabilityLosses") + sumSide(rows, "right", "capabilityLosses"),
    meanRangeM: rows.reduce((sum, row) => sum + row.range.meanM, 0) / rows.length,
  });
  const rowBytes = rows.map(canonicalConstructLabRowJson).join("\n") + "\n";
  return Object.freeze({
    version: CONSTRUCT_LAB_REPORT_VERSION,
    runDigest,
    rowCount: rows.length,
    rowsDigest: integrityDigest(rowBytes),
    aggregate,
  });
}

export const canonicalConstructLabReportJson = (report: ConstructLabReport): string =>
  canonicalIntegrityJson(report as unknown as IntegrityValue);

export function explainConstructLabRow(row: ConstructLabRow): string {
  validateConstructLabRow(row);
  const refusals = row.refusals.map(({ id, reason }) => `${id}: ${reason}`).join("; ") || "no action refusals";
  const losses = row.capabilityLosses.map(({ id, reason }) => `${id}: ${reason}`).join("; ") || "no capability losses";
  const stuck = row.stuck.map((value) => `${value.side}/${value.group}/${value.action}:${value.phase}`).join("; ") || "no proven stuck interval";
  const limitation = row.limitation ? ` Limitation: ${row.limitation}` : "";
  return `Job ${row.job} -- seed ${row.seed} -- ${row.winner}. Actions: ${row.actionTrace.join(" -> ") || "none"}. ` +
    `Refusals: ${refusals}. Capability: ${losses}. Stuck: ${stuck}.${limitation}`;
}
