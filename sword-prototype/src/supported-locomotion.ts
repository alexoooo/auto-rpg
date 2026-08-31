/** The complete public movement command. It carries no physics or topology authority. */
export * from "./supported-locomotion-state.ts";
import type { SupportState } from "./supported-locomotion-state.ts";

export interface LocomotionRequest {
  readonly localForward: number;
  readonly localRight: number;
  readonly yaw: number;
  readonly recover: boolean;
}

/** One port's value after its installed driver has decided for this control boundary. */
export interface SupportedLocomotionSample {
  readonly request: LocomotionRequest | null;
}

/**
 * Session 20 deliberately resolves to the submitted command. The later carrier runtime may
 * reduce this value symmetrically, but a port never gets to infer its opponent's decision.
 */
export interface LocomotionResolution {
  readonly allowed: LocomotionRequest | null;
  readonly dt: number;
}

export interface SupportedLocomotionPort {
  /** Physical ports publish support state; command-only and legacy ports leave it unknown. */
  readonly state?: SupportState;
  beginControlStep(): void;
  request(value: LocomotionRequest): void;
  sample(): SupportedLocomotionSample;
  commit(resolution: LocomotionResolution): void;
  clear(reason: string): void;
}

export interface SupportedLocomotionPortSnapshot {
  readonly staged: LocomotionRequest | null;
  readonly committed: LocomotionResolution | null;
  readonly lastClearReason: string | null;
  readonly beginCount: number;
  readonly commitCount: number;
  readonly stabilityEvents: readonly import("./supported-locomotion-state.ts").StabilityEvent[];
}

/**
 * Command-buffer half of assisted locomotion. It deliberately performs no movement: Session 22
 * installs the carrier actuator behind `commit`, while this session freezes clear semantics.
 */
export class StagedSupportedLocomotionPort implements SupportedLocomotionPort {
  private staged: LocomotionRequest | null = null;
  private committed: LocomotionResolution | null = null;
  private clearReason: string | null = null;
  private begins = 0;
  private commits = 0;
  private readonly pendingStability: import("./supported-locomotion-state.ts").StabilityEvent[] = [];
  private boundaryStability: readonly import("./supported-locomotion-state.ts").StabilityEvent[] = Object.freeze([]);

  beginControlStep(): void {
    this.staged = null;
    this.clearReason = null;
    this.begins += 1;
    this.boundaryStability = Object.freeze(this.pendingStability.splice(0)
      .map((event) => Object.freeze({ horizontalShoveNs: Object.freeze([...event.horizontalShoveNs]) as
        readonly [number, number] })));
  }

  request(value: LocomotionRequest): void {
    if (this.staged) throw new Error("supported locomotion accepts one request per control boundary");
    // The pair resolver owns the canonical validation and copy. Staging through it here prevents
    // a caller from mutating the object between decision and pair sampling.
    this.staged = resolveSupportedPairSamples({ request: value }, { request: null }, 1).left.allowed;
  }

  sample(): SupportedLocomotionSample { return Object.freeze({ request: this.staged }); }

  commit(resolution: LocomotionResolution): void {
    this.committed = Object.freeze({ allowed: resolution.allowed === null ? null : Object.freeze({ ...resolution.allowed }),
      dt: resolution.dt });
    this.commits += 1;
  }

  clear(reason: string): void {
    this.staged = null;
    this.committed = null;
    this.clearReason = reason;
  }

  /** Collision callbacks queue only; the next safe begin edge owns reconciliation. */
  queueStabilityEvent(event: import("./supported-locomotion-state.ts").StabilityEvent): void {
    if (event.horizontalShoveNs.length !== 2 || event.horizontalShoveNs.some((value) => !Number.isFinite(value))) {
      throw new Error("supported locomotion stability event must have two finite horizontal components");
    }
    this.pendingStability.push(Object.freeze({ horizontalShoveNs: Object.freeze([...event.horizontalShoveNs]) as
      readonly [number, number] }));
  }

  snapshot(): SupportedLocomotionPortSnapshot {
    return Object.freeze({ staged: this.staged, committed: this.committed,
      lastClearReason: this.clearReason, beginCount: this.begins, commitCount: this.commits,
      stabilityEvents: this.boundaryStability });
  }
}

export interface SupportedPairResolution {
  readonly left: LocomotionResolution;
  readonly right: LocomotionResolution;
}

const finiteUnit = (value: number, field: string): number => {
  if (!Number.isFinite(value) || value < -1 || value > 1) {
    throw new Error(`supported locomotion ${field} must be finite and within -1..1`);
  }
  return value;
};

const copyRequest = (value: LocomotionRequest | null): LocomotionRequest | null => {
  if (value === null) return null;
  if (typeof value.recover !== "boolean") throw new Error("supported locomotion recover must be boolean");
  return {
    localForward: finiteUnit(value.localForward, "localForward"),
    localRight: finiteUnit(value.localRight, "localRight"),
    yaw: finiteUnit(value.yaw, "yaw"),
    recover: value.recover,
  };
};

/** Pure pair calculation. Both inputs exist before either result can be committed. */
export function resolveSupportedPairSamples(
  left: SupportedLocomotionSample,
  right: SupportedLocomotionSample,
  dt: number,
): SupportedPairResolution {
  if (!Number.isFinite(dt) || dt <= 0) throw new Error("supported locomotion dt must be finite and positive");
  return {
    left: { allowed: copyRequest(left.request), dt },
    right: { allowed: copyRequest(right.request), dt },
  };
}

/**
 * A lone port cannot form a pair authority boundary. Clearing it prevents an earlier staged
 * request from surviving a mixed or partially constructed bout.
 */
export function resolveSupportedPair(
  left: SupportedLocomotionPort | null | undefined,
  right: SupportedLocomotionPort | null | undefined,
  dt: number,
): void {
  const leftPort = left ?? null;
  const rightPort = right ?? null;
  if (leftPort === null || rightPort === null) {
    leftPort?.clear("supported locomotion requires two compatible ports");
    rightPort?.clear("supported locomotion requires two compatible ports");
    return;
  }

  // Sampling both before resolving is as important as deciding both before sampling: a port
  // must not be able to observe a resolution committed to its opponent in this boundary.
  const leftSample = leftPort.sample();
  const rightSample = rightPort.sample();
  const resolution = resolveSupportedPairSamples(leftSample, rightSample, dt);
  leftPort.commit(resolution.left);
  rightPort.commit(resolution.right);
}

export interface SupportedClosureSample {
  readonly step: number;
  readonly separationM: number;
  readonly inwardRequested: boolean;
  readonly compositePosture: boolean;
  readonly penetrationM: number;
  readonly maxPartSpeedMps: number;
  readonly maxJointFrameErrorM: number;
}

export interface SupportedClosureSummary {
  readonly sampleCount: number;
  readonly minSeparationM: number;
  readonly enteredEnvelope: boolean;
  readonly inwardEnvelopeDwellSamples: number;
  readonly postureLossSamples: number;
  readonly penetrationDwellSamples: number;
  readonly maxPenetrationM: number;
  readonly maxPartSpeedMps: number;
  readonly maxJointFrameErrorM: number;
}

export interface SupportedClosureCell {
  readonly scenario: string;
  readonly side: string;
  readonly samples: readonly SupportedClosureSample[];
  readonly summary: SupportedClosureSummary;
}

export interface SupportedClosureEvidence {
  readonly cells: readonly SupportedClosureCell[];
}

export interface SupportedClosureContract {
  readonly expectedCells: readonly { readonly scenario: string; readonly side: string }[];
  readonly expectedSampleCount: number;
  readonly separationEnvelopeM: number;
  readonly requiredInwardEnvelopeDwellSamples: number;
  readonly maxPenetrationM: number;
  readonly maxPenetrationDwellSamples: number;
  readonly maxPartSpeedMps: number;
  readonly maxJointFrameErrorM: number;
}

export interface ClassifiedSupportedClosureCell extends SupportedClosureSummary {
  readonly scenario: string;
  readonly side: string;
}

export interface SupportedClosureClassification {
  readonly status: "qualified" | "rejected";
  readonly reasons: readonly string[];
  readonly cells: readonly ClassifiedSupportedClosureCell[];
}

const cellKey = ({ scenario, side }: { readonly scenario: string; readonly side: string }): string =>
  `${scenario}/${side}`;

const finiteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const longestRun = <T>(values: readonly T[], accepts: (value: T) => boolean): number => {
  let longest = 0;
  let current = 0;
  for (const value of values) {
    current = accepts(value) ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
};

const recomputeSummary = (
  samples: readonly SupportedClosureSample[],
  contract: SupportedClosureContract,
): SupportedClosureSummary => ({
  sampleCount: samples.length,
  minSeparationM: Math.min(...samples.map(({ separationM }) => separationM)),
  enteredEnvelope: samples.some(({ separationM }) => separationM <= contract.separationEnvelopeM),
  inwardEnvelopeDwellSamples: longestRun(samples,
    ({ inwardRequested, separationM }) => inwardRequested && separationM <= contract.separationEnvelopeM),
  postureLossSamples: samples.filter(({ compositePosture }) => !compositePosture).length,
  penetrationDwellSamples: longestRun(samples,
    ({ penetrationM }) => penetrationM > contract.maxPenetrationM),
  maxPenetrationM: Math.max(...samples.map(({ penetrationM }) => penetrationM)),
  maxPartSpeedMps: Math.max(...samples.map(({ maxPartSpeedMps }) => maxPartSpeedMps)),
  maxJointFrameErrorM: Math.max(...samples.map(({ maxJointFrameErrorM }) => maxJointFrameErrorM)),
});

const SUMMARY_FIELDS: readonly (keyof SupportedClosureSummary)[] = [
  "sampleCount", "minSeparationM", "enteredEnvelope", "inwardEnvelopeDwellSamples",
  "postureLossSamples", "penetrationDwellSamples", "maxPenetrationM", "maxPartSpeedMps",
  "maxJointFrameErrorM",
];

const contractReasons = (contract: SupportedClosureContract): string[] => {
  const reasons: string[] = [];
  for (const [field, value] of [
    ["separationEnvelopeM", contract.separationEnvelopeM],
    ["maxPenetrationM", contract.maxPenetrationM],
    ["maxPartSpeedMps", contract.maxPartSpeedMps],
    ["maxJointFrameErrorM", contract.maxJointFrameErrorM],
  ] as const) {
    if (!finiteNumber(value) || value < 0) reasons.push(`closure contract ${field} must be finite and non-negative`);
  }
  for (const [field, value] of [
    ["expectedSampleCount", contract.expectedSampleCount],
    ["requiredInwardEnvelopeDwellSamples", contract.requiredInwardEnvelopeDwellSamples],
    ["maxPenetrationDwellSamples", contract.maxPenetrationDwellSamples],
  ] as const) {
    const minimum = field === "maxPenetrationDwellSamples" ? 0 : 1;
    if (!Number.isSafeInteger(value) || value < minimum) {
      reasons.push(`closure contract ${field} must be an integer at least ${minimum}`);
    }
  }
  const keys = contract.expectedCells.map(cellKey);
  if (keys.length === 0) reasons.push("closure contract expectedCells must not be empty");
  if (new Set(keys).size !== keys.length) reasons.push("closure contract expectedCells must be unique");
  return reasons;
};

/**
 * Recompute every qualifier from retained rows. The supplied summaries are audit witnesses, not
 * authority: disagreement rejects the cell, as do missing, duplicate, relabelled or reordered
 * cells. This prevents a clean terminal pose from hiding the clinch heap that preceded it.
 */
export function classifySupportedClosure(
  evidence: SupportedClosureEvidence,
  contract: SupportedClosureContract,
): SupportedClosureClassification {
  const reasons = contractReasons(contract);
  const classified: ClassifiedSupportedClosureCell[] = [];
  const expected = contract.expectedCells.map(cellKey);
  const expectedSet = new Set(expected);
  const actual = Array.isArray(evidence.cells) ? evidence.cells.map(cellKey) : [];

  const seen = new Set<string>();
  for (const key of actual) {
    if (seen.has(key)) reasons.push(`duplicate cell ${key}`);
    seen.add(key);
    if (!expectedSet.has(key)) reasons.push(`unexpected cell ${key}`);
  }
  for (const key of expected) if (!seen.has(key)) reasons.push(`missing cell ${key}`);
  if (actual.length === expected.length && actual.some((key, index) => key !== expected[index])) {
    reasons.push("closure cells are not in frozen scenario/side order");
  }

  for (const cell of Array.isArray(evidence.cells) ? evidence.cells : []) {
    const key = cellKey(cell);
    if (!Array.isArray(cell.samples) || cell.samples.length === 0) {
      reasons.push(`${key} has no retained samples`);
      continue;
    }
    let rowsAreFinite = true;
    let previousStep = -1;
    for (const row of cell.samples) {
      const numeric = [row.step, row.separationM, row.penetrationM,
        row.maxPartSpeedMps, row.maxJointFrameErrorM];
      if (numeric.some((value) => !finiteNumber(value))) {
        reasons.push(`${key} retained samples must contain only finite numbers`);
        rowsAreFinite = false;
        break;
      }
      if (!Number.isSafeInteger(row.step) || row.step < 0 || row.step <= previousStep) {
        reasons.push(`${key} retained sample steps must be unique and strictly increasing`);
        rowsAreFinite = false;
        break;
      }
      if (row.separationM < 0 || row.penetrationM < 0 || row.maxPartSpeedMps < 0 || row.maxJointFrameErrorM < 0) {
        reasons.push(`${key} retained distances, speed and error must be non-negative`);
        rowsAreFinite = false;
        break;
      }
      if (typeof row.inwardRequested !== "boolean" || typeof row.compositePosture !== "boolean") {
        reasons.push(`${key} request and posture samples must be boolean`);
        rowsAreFinite = false;
        break;
      }
      previousStep = row.step;
    }
    if (!rowsAreFinite || reasons.some((reason) => reason.startsWith("closure contract "))) continue;

    const summary = recomputeSummary(cell.samples, contract);
    const reported = cell.summary as unknown as Record<string, unknown>;
    const mismatch = SUMMARY_FIELDS.find((field) => reported[field] !== summary[field]);
    if (mismatch !== undefined) reasons.push(`${key} summary disagrees with retained samples at ${mismatch}`);
    if (summary.sampleCount !== contract.expectedSampleCount) {
      reasons.push(`${key} retained ${summary.sampleCount} samples instead of ${contract.expectedSampleCount}`);
    }
    if (!summary.enteredEnvelope) reasons.push(`${key} never entered the separation envelope`);
    if (summary.inwardEnvelopeDwellSamples < contract.requiredInwardEnvelopeDwellSamples) {
      reasons.push(`${key} inward dwell ${summary.inwardEnvelopeDwellSamples} is below ` +
        `${contract.requiredInwardEnvelopeDwellSamples}`);
    }
    if (summary.postureLossSamples > 0) reasons.push(`${key} lost composite posture`);
    if (summary.penetrationDwellSamples > contract.maxPenetrationDwellSamples) {
      reasons.push(`${key} penetration dwell ${summary.penetrationDwellSamples} exceeds ` +
        `${contract.maxPenetrationDwellSamples}`);
    }
    if (summary.maxPartSpeedMps > contract.maxPartSpeedMps) {
      reasons.push(`${key} part speed ${summary.maxPartSpeedMps} exceeds ${contract.maxPartSpeedMps}`);
    }
    if (summary.maxJointFrameErrorM > contract.maxJointFrameErrorM) {
      reasons.push(`${key} joint-frame error ${summary.maxJointFrameErrorM} exceeds ${contract.maxJointFrameErrorM}`);
    }
    classified.push({ scenario: cell.scenario, side: cell.side, ...summary });
  }

  return { status: reasons.length === 0 ? "qualified" : "rejected", reasons, cells: classified };
}
