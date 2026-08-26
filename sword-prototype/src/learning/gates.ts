import type { EngagementRecord } from "./engagement.ts";

export const MAX_NEAR_RANGE_STALL_SHARE = 0.15;
export const MIN_OPPORTUNITY_ATTACK_RATE = 0.65;
export const MIN_ATTACK_CONTACT_RATE = 0.20;
export const MAX_FIRST_ATTACK_P90_SECONDS = 6.0;
export const MAX_SYMMETRIC_TIME_CAP_RATE = 0.10;
export const MAX_SPECIALIST_GAP = 0.15;
export const MIN_ACTION_SHARE = 0.08;
export const MIN_DIVERSE_ACTIONS = 3;

export const RESEARCH_GATE_NAMES = Object.freeze(["opportunityAttackRate", "attackContactRate",
  "nearRangeStallShare", "firstAttackP90Seconds", "symmetricTimeCapRate", "specialistGap",
  "minimumActionShare", "diverseActions"] as const);
export type ResearchGateName = typeof RESEARCH_GATE_NAMES[number];
export type GateComparison = "at-least" | "at-most";
export type GateNumber = number | "Infinity" | "-Infinity";

/** The eight promotion thresholds, in the one order every consumer prints. */
export const GATE_CONTRACT: Readonly<Record<ResearchGateName, readonly [number, GateComparison]>> = Object.freeze({
  opportunityAttackRate: [MIN_OPPORTUNITY_ATTACK_RATE, "at-least"] as const,
  attackContactRate: [MIN_ATTACK_CONTACT_RATE, "at-least"] as const,
  nearRangeStallShare: [MAX_NEAR_RANGE_STALL_SHARE, "at-most"] as const,
  firstAttackP90Seconds: [MAX_FIRST_ATTACK_P90_SECONDS, "at-most"] as const,
  symmetricTimeCapRate: [MAX_SYMMETRIC_TIME_CAP_RATE, "at-most"] as const,
  specialistGap: [MAX_SPECIALIST_GAP, "at-most"] as const,
  minimumActionShare: [MIN_ACTION_SHARE, "at-least"] as const,
  diverseActions: [MIN_DIVERSE_ACTIONS, "at-least"] as const,
});

export interface MeasuredGate {
  readonly name: ResearchGateName;
  readonly status: "measured";
  readonly value: GateNumber;
  readonly threshold: number;
  readonly comparison: GateComparison;
  readonly margin: GateNumber;
}
export interface UnavailableGate {
  readonly name: ResearchGateName;
  readonly status: "unavailable";
  readonly value: null;
  readonly threshold: null;
  readonly comparison: null;
  readonly margin: null;
  readonly reason: string;
}
export type GateRow = MeasuredGate | UnavailableGate;

/** One verdict rule for every gate consumer, including the specialist subtraction tolerance. */
export function gatePassed(row: GateRow): boolean | null {
  if (row.status === "unavailable") return null;
  if (row.margin === "Infinity") return true;
  if (row.margin === "-Infinity") return false;
  const tolerance = row.name === "specialistGap" ? Number.EPSILON : 0;
  return row.margin >= -tolerance;
}

export interface EngagementGateMetrics {
  readonly opportunities?: number;
  readonly attacksInWindow?: number;
  readonly contactsInWindow?: number;
  readonly nearRangeStallSeconds?: number;
  readonly seconds?: number;
  readonly firstAttackSeconds?: readonly (number | null)[];
  readonly opportunityAttackRate?: number;
  readonly attackContactRate?: number;
  readonly nearRangeStallShare?: number;
  readonly firstAttackP90Seconds?: number;
  readonly symmetricTimeCapRate?: number;
  readonly specialistGap?: number;
  readonly minimumActionShare?: number;
  readonly diverseActions?: number;
}

/** One adapter for the scalar page record and a bench collection of records. */
export function engagementMetrics(records: EngagementRecord | readonly EngagementRecord[],
  seconds: number | readonly number[]): EngagementGateMetrics {
  const list = Array.isArray(records) ? records : [records];
  const durations = Array.isArray(seconds) ? seconds : [seconds];
  if (durations.length !== list.length || durations.some((duration) => !Number.isFinite(duration) || duration < 0)) {
    throw new Error("engagement gate records require one finite non-negative duration each");
  }
  return Object.freeze({
    opportunities: list.reduce((sum, record) => sum + record.viableOpportunities, 0),
    attacksInWindow: list.reduce((sum, record) => sum + record.attacksInWindow, 0),
    contactsInWindow: list.reduce((sum, record) => sum + record.damagingContactsInWindow, 0),
    nearRangeStallSeconds: list.reduce((sum, record) => sum + record.nearRangeStallSeconds, 0),
    seconds: durations.reduce((sum, duration) => sum + duration, 0),
    firstAttackSeconds: Object.freeze(list.map((record) => record.firstAttackSeconds)),
  });
}

const finite = (value: number, label: string): number => {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
};

export function measuredGate(name: ResearchGateName, value: GateNumber, threshold: number,
  comparison: GateComparison): MeasuredGate {
  const unbounded = value === "Infinity" || value === "-Infinity";
  if (!unbounded) finite(value, `${name} gate value`);
  finite(threshold, `${name} gate threshold`);
  if (comparison !== "at-least" && comparison !== "at-most") {
    throw new Error(`${name} gate comparison must be at-least or at-most`);
  }
  const margin = value === "Infinity" ? (comparison === "at-least" ? "Infinity" : "-Infinity")
    : value === "-Infinity" ? (comparison === "at-least" ? "-Infinity" : "Infinity")
    : comparison === "at-least" ? value - threshold : threshold - value;
  return Object.freeze({ name, status: "measured", value, threshold, comparison, margin });
}

export function unavailableGate(name: ResearchGateName, reason: string): UnavailableGate {
  if (!reason) throw new Error(`${name} unavailable gate must say why`);
  return Object.freeze({ name, status: "unavailable", value: null, threshold: null,
    comparison: null, margin: null, reason });
}

const percentile = (values: readonly number[], fraction: number): number | null => {
  if (values.length === 0) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)]!;
};

const directOrRatio = (direct: number | undefined, numerator: number | undefined,
  denominator: number | undefined): number | null => Number.isFinite(direct) ? direct! :
  Number.isFinite(numerator) && Number.isFinite(denominator) ? (denominator ? numerator! / denominator : 0) : null;

/** Promotion rows shared by the page, bench, tournament verdict and research ledger. */
export function engagementGates(metrics: EngagementGateMetrics): readonly GateRow[] {
  const values: Partial<Record<ResearchGateName, GateNumber>> = {};
  const opportunityRate = directOrRatio(metrics?.opportunityAttackRate, metrics?.attacksInWindow, metrics?.opportunities);
  const contactRate = directOrRatio(metrics?.attackContactRate, metrics?.contactsInWindow, metrics?.attacksInWindow);
  const stallShare = Number.isFinite(metrics?.nearRangeStallShare) ? metrics.nearRangeStallShare! :
    Number.isFinite(metrics?.nearRangeStallSeconds) && Number.isFinite(metrics?.seconds)
      ? Math.min(1, metrics.nearRangeStallSeconds! / Math.max(0.001, metrics.seconds!)) : null;
  const directFirstAttack = typeof metrics?.firstAttackP90Seconds === "number" ? metrics.firstAttackP90Seconds : null;
  const firstAttackP90 = directFirstAttack !== null ? directFirstAttack :
    Array.isArray(metrics?.firstAttackSeconds) && metrics.firstAttackSeconds.length > 0
      ? percentile(metrics.firstAttackSeconds.map((value) => value === null ? Number.POSITIVE_INFINITY : value), 0.90) : null;
  if (opportunityRate !== null) values.opportunityAttackRate = opportunityRate;
  if (contactRate !== null) values.attackContactRate = contactRate;
  if (stallShare !== null) values.nearRangeStallShare = stallShare;
  if (firstAttackP90 !== null) values.firstAttackP90Seconds = Number.isFinite(firstAttackP90) ? firstAttackP90 : "Infinity";
  for (const name of ["symmetricTimeCapRate", "specialistGap", "minimumActionShare", "diverseActions"] as const) {
    if (Number.isFinite(metrics?.[name])) values[name] = metrics[name]!;
  }
  const unavailable: Record<ResearchGateName, string> = {
    opportunityAttackRate: "this direction did not retain engagement opportunities",
    attackContactRate: "this direction did not retain engagement contacts",
    nearRangeStallShare: "this direction did not retain bout duration and stall time",
    firstAttackP90Seconds: "no finite first attack was observed in this checkpoint",
    symmetricTimeCapRate: "research rollouts do not run mirrored tournament pairs",
    specialistGap: "research rollouts do not execute the specialist control on the same cells",
    minimumActionShare: "research checkpoints do not retain the tournament tactic marginal",
    diverseActions: "research checkpoints do not retain the tournament tactic marginal",
  };
  return Object.freeze(RESEARCH_GATE_NAMES.map((name) => Object.hasOwn(values, name)
    ? measuredGate(name, values[name]!, ...GATE_CONTRACT[name]) : unavailableGate(name, unavailable[name])));
}

export interface HumanGateRow {
  readonly name: ResearchGateName;
  readonly status: "measured" | "unavailable";
  readonly achieved: string;
  readonly threshold: string;
  readonly margin: string;
  readonly passed: boolean | null;
}

const decimal = (value: number): string => Number(value.toFixed(6)).toString();
const signed = (value: number): string => `${value >= 0 ? "+" : ""}${decimal(value)}`;

/** DOM-free human rendering. Wire sentinels remain exact and are never printed as literals. */
export function formatEngagementGateTable(rows: readonly GateRow[]): readonly HumanGateRow[] {
  return Object.freeze(rows.map((row) => row.status === "unavailable"
    ? Object.freeze({ name: row.name, status: row.status, achieved: "unavailable",
      threshold: "unavailable", margin: row.reason, passed: null })
    : Object.freeze({ name: row.name, status: row.status,
      achieved: row.value === "Infinity" ? "never attacked" : row.value === "-Infinity" ? "below measurable range" : decimal(row.value),
      threshold: `${row.comparison === "at-least" ? ">=" : "<="} ${decimal(row.threshold)}`,
      margin: row.margin === "-Infinity" ? "fails: never attacked" : row.margin === "Infinity" ? "passes: unbounded" : signed(row.margin),
      passed: gatePassed(row),
    })));
}
