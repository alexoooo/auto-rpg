import type { FightFrame, FightSource } from "../fight/source.js";
import type { Contact, Pose, V3 } from "../fight/trace.js";
import {
  BODY_TURN_INPUT_LEAD_RAW, EXTEND_DRAG_SENSITIVITY, SWING_DRAG_DEAD_ZONE_PX,
  SWING_DRAG_FULL_EFFORT_PX_S, TOUCH_PINCH_SPREAD_RATIO, VIRTUAL_HAND_SENSITIVITY,
  type ArmTargetState, type HumanArm, type WeaponChannel,
} from "./arena-input.js";
import { CURSOR_HAND_SPAN_ARM_LENGTHS } from "./arena-hand-cursor.js";
import type { StageCameraBasis } from "./stage-camera.js";

export const CONTROL_EVIDENCE_MAGIC = "ARPGCTL1";
export const CONTROL_EVIDENCE_HEADER_BYTES = 48;
export const CONTROL_RECEIPT_BYTES = 70;
export const CONTROL_COMMAND_PAYLOAD_BYTES = 57;
const CONTROL_EVIDENCE_MAX_BYTES = 16 * 1024 * 1024;
const CONTROL_EVIDENCE_MAX_ROWS = 262_144;
/** Ten minutes at the preregistered ceiling of 120 presentation samples a second. */
export const CONTROL_INPUT_ROW_CAP = 72_000;
/** A pointer stream is evidence at display-rate resolution, not an event-rate dump. */
export const CONTROL_INPUT_SAMPLE_INTERVAL_MS = 1000 / 120;

/** Preregistered before the first foreground sample. All distances are arm lengths. */
export const CUT_MIN_NET_TRAVEL = 0.30;
export const CUT_MIN_AXIS_TRAVEL = 0.20;
export const CUT_MIN_PATH_EFFICIENCY = 0.65;
export const CUT_AXIS_DOMINANCE = 1.75;
export const CUT_ENDPOINT_TOLERANCE = 0.10;

export const CONTROL_FEEL_CONSTANTS = Object.freeze({
  bodyTurnInputLeadRaw: BODY_TURN_INPUT_LEAD_RAW,
  virtualHandSensitivity: VIRTUAL_HAND_SENSITIVITY,
  cursorHandSpanArmLengths: CURSOR_HAND_SPAN_ARM_LENGTHS,
  extendDragSensitivity: EXTEND_DRAG_SENSITIVITY,
  touchPinchSpreadRatio: TOUCH_PINCH_SPREAD_RATIO,
  swingDragDeadZonePx: SWING_DRAG_DEAD_ZONE_PX,
  swingDragFullEffortPxS: SWING_DRAG_FULL_EFFORT_PX_S,
});

export type CutFamily = "left-to-right" | "right-to-left" | "overhead"
  | "rising-diagonal" | "falling-diagonal" | "unclassified";

export type ControlView = "threeQuarter" | "firstPersonA" | "firstPersonB";
export type ControlInputChannel = WeaponChannel | "camera" | "keyboard" | "wheel"
  | "camera-mode" | "promotion" | "follow" | "refit" | "drawer" | "lifecycle";

export interface CutPoint {
  /** Shoulder-relative displacement along the frozen camera's screen-right axis. */
  readonly right: number;
  /** Shoulder-relative displacement along the frozen camera's screen-up axis. */
  readonly up: number;
}

export interface CutClassification {
  readonly family: CutFamily;
  readonly dx: number;
  readonly dy: number;
  readonly net: number;
  readonly path: number;
  readonly efficiency: number;
}

function magnitude2(x: number, y: number): number { return Math.hypot(x, y); }
function dot(a: V3, b: readonly [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function minus(a: V3, b: V3): V3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }

/**
 * Put a desired point in the coordinate system the gesture began in.
 *
 * Subtracting the shoulder is load-bearing: otherwise W/S translation would
 * be counted as hand authorship. The camera basis is captured on primary-down
 * and never replaced halfway through an attempt.
 */
export function cutPoint(
  desired: V3, shoulder: V3, armLength: number, basis: StageCameraBasis,
): CutPoint | null {
  if (![...desired, ...shoulder, armLength, ...basis.right, ...basis.up].every(Number.isFinite)
    || armLength <= 0) return null;
  const relative = minus(desired, shoulder);
  return Object.freeze({
    right: dot(relative, basis.right) / armLength,
    up: dot(relative, basis.up) / armLength,
  });
}

/** Classify only declared shapes; a short, returning or ambiguous path stays unnamed. */
export function classifyCut(points: readonly CutPoint[]): CutClassification {
  if (points.length < 2 || points.some((point) => !Number.isFinite(point.right)
    || !Number.isFinite(point.up))) {
    return Object.freeze({ family: "unclassified", dx: 0, dy: 0, net: 0, path: 0, efficiency: 0 });
  }
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const dx = last.right - first.right;
  const dy = last.up - first.up;
  const net = magnitude2(dx, dy);
  let path = 0;
  for (let index = 1; index < points.length; index += 1) {
    path += magnitude2(points[index]!.right - points[index - 1]!.right,
      points[index]!.up - points[index - 1]!.up);
  }
  const efficiency = path === 0 ? 0 : net / path;
  let family: CutFamily = "unclassified";
  if (net >= CUT_MIN_NET_TRAVEL && efficiency >= CUT_MIN_PATH_EFFICIENCY) {
    const horizontal = Math.abs(dx) >= CUT_MIN_NET_TRAVEL
      && Math.abs(dx) >= CUT_AXIS_DOMINANCE * Math.abs(dy);
    const overhead = dy <= -CUT_MIN_NET_TRAVEL
      && Math.abs(dy) >= CUT_AXIS_DOMINANCE * Math.abs(dx);
    const diagonal = Math.abs(dx) >= CUT_MIN_AXIS_TRAVEL && Math.abs(dy) >= CUT_MIN_AXIS_TRAVEL
      && Math.abs(dy / dx) >= 1 / CUT_AXIS_DOMINANCE
      && Math.abs(dy / dx) <= CUT_AXIS_DOMINANCE;
    if (horizontal) family = dx > 0 ? "left-to-right" : "right-to-left";
    else if (overhead) family = "overhead";
    else if (diagonal) family = dy > 0 ? "rising-diagonal" : "falling-diagonal";
  }
  return Object.freeze({ family, dx, dy, net, path, efficiency });
}

export interface ControlInputSample {
  readonly attemptId: number;
  readonly sampleMs: number;
  readonly tickSeen: number;
  readonly view: ControlView;
  readonly channel: ControlInputChannel;
  readonly inputDevice: "mouse" | "touch" | null;
  readonly captureActive: boolean;
  readonly action?: string;
  readonly qx?: number;
  readonly qy?: number;
  readonly clientXCss?: number;
  readonly clientYCss?: number;
  readonly saturated: boolean;
  readonly powered: boolean;
  readonly travelCss: number;
  readonly desired: V3 | null;
  readonly shoulder: V3 | null;
  readonly armLength: number | null;
  readonly target: ArmTargetState | null;
  readonly bodyYaw: number | null;
  readonly basis: StageCameraBasis;
}

export interface ControlAttemptManifest {
  readonly requestedFamily: CutFamily | null;
  readonly drillLabel: string | null;
  readonly pairId: string | null;
}

export interface ControlLatencyRow {
  readonly sampleMs: number;
  readonly submittedMs: number;
  readonly settledMs: number | null;
  readonly receiptTick: number;
  /** Exact primary-arm row encoded by this request, with ABI angles wrapped to u16. */
  readonly submittedTarget: ArmTargetState;
  readonly publishedTick: number | null;
  readonly publicationMs: number | null;
  readonly displayedTick: number | null;
  readonly displayMs: number | null;
}

function sameTarget(a: ArmTargetState, b: ArmTargetState): boolean {
  return a.bearing === b.bearing && a.height === b.height && a.reach === b.reach
    && a.effort === b.effort && a.plane === b.plane;
}

type MutableControlLatencyRow = {
  sampleMs: number; submittedMs: number; settledMs: number | null; receiptTick: number;
  publishedTick: number | null; publicationMs: number | null;
  displayedTick: number | null; displayMs: number | null; submittedTarget: ArmTargetState;
};

function encodedTarget(target: ArmTargetState): ArmTargetState {
  return Object.freeze({ ...target, bearing: target.bearing & 0xffff, plane: target.plane & 0xffff });
}

/** Host presentation clocks beside receipts; none enters the replay or trace grammar. */
export class ControlLatencyLog {
  #sample: Readonly<{ at: number; target: ArmTargetState }> | null = null;
  readonly #publicationArrivals = new Map<number, number>();
  #publishedThrough = -1;
  #samplePending = false;
  readonly #rows: MutableControlLatencyRow[] = [];

  sample(at: number, target: ArmTargetState): void {
    if (!Number.isFinite(at)) throw new RangeError("control sample time must be finite");
    this.#sample = Object.freeze({ at, target: Object.freeze({ ...target }) });
    this.#samplePending = true;
  }
  submit(receiptTick: number, at: number, target: ArmTargetState): void {
    const sample = this.#sample;
    if (sample === null || !sameTarget(sample.target, target)) return;
    if (!Number.isInteger(receiptTick) || receiptTick < 0 || !Number.isFinite(at) || at < sample.at) {
      throw new RangeError("control submission clock is invalid");
    }
    const row: MutableControlLatencyRow = { sampleMs: sample.at, submittedMs: at,
      settledMs: null, receiptTick,
      publishedTick: null, publicationMs: null, displayedTick: null, displayMs: null,
      submittedTarget: encodedTarget(target) };
    this.#rows.push(row);
    this.#samplePending = false;
    const arrival = this.#publicationArrivals.get(receiptTick + 1);
    if (arrival !== undefined) { row.publishedTick = receiptTick + 1; row.publicationMs = arrival; }
  }
  settle(receiptTick: number, at: number): void {
    const row = this.#rows.find((candidate) => candidate.receiptTick === receiptTick
      && candidate.settledMs === null);
    if (row === undefined || !Number.isFinite(at) || at < row.submittedMs) return;
    row.settledMs = at;
  }
  publication(receiptTick: number, at: number): void {
    this.observePublishedThrough(receiptTick + 1, at);
  }
  observePublishedThrough(publishedTick: number, at: number): void {
    if (!Number.isInteger(publishedTick) || publishedTick < 0 || !Number.isFinite(at)) return;
    for (let tick = this.#publishedThrough + 1; tick <= publishedTick; tick += 1) {
      this.#publicationArrivals.set(tick, at);
    }
    this.#publishedThrough = Math.max(this.#publishedThrough, publishedTick);
    for (const row of this.#rows) {
      if (row.receiptTick + 1 > publishedTick || row.publicationMs !== null) continue;
      row.publishedTick = row.receiptTick + 1;
      row.publicationMs = this.#publicationArrivals.get(row.publishedTick) ?? at;
    }
  }
  display(publishedThrough: number, at: number): void {
    for (const row of this.#rows) {
      if (row.publishedTick === null || row.publishedTick > publishedThrough || row.displayMs !== null) continue;
      if (!Number.isFinite(at) || at < row.publicationMs!) continue;
      row.displayedTick = publishedThrough;
      row.displayMs = at;
    }
  }
  rows(): readonly ControlLatencyRow[] {
    return this.#rows.map((row) => Object.freeze({ ...row }));
  }
  pendingReceiptTicks(): readonly number[] {
    return this.#rows.filter((row) => row.publicationMs === null).map((row) => row.receiptTick);
  }
  get complete(): boolean {
    return !this.#samplePending
      && this.#rows.every((row) => row.settledMs !== null && row.publicationMs !== null
      && row.displayMs !== null);
  }
  refusal(): string | null {
    if (this.#samplePending) {
      return "CONTROL_LATENCY_JOIN_REFUSED: latest eligible sample was never submitted";
    }
    const row = this.#rows.find((candidate) => candidate.settledMs === null
      || candidate.publicationMs === null || candidate.displayMs === null);
    return row === undefined ? null
      : `CONTROL_LATENCY_JOIN_REFUSED: receipt ${row.receiptTick} is missing settlement, publication, or display`;
  }
  clear(): void {
    this.#sample = null; this.#rows.length = 0; this.#publicationArrivals.clear();
    this.#publishedThrough = -1; this.#samplePending = false;
  }
}

/** Presentation/input evidence. It is deliberately not part of ARPGCTL1. */
export class ControlInputLog {
  readonly #rows: ControlInputSample[] = [];
  readonly #manifests = new Map<number, ControlAttemptManifest>();
  readonly #pointerAnchors = new Map<string, { sampleMs: number; index: number }>();
  #attempt = 0;
  #dropped = 0;

  beginAttempt(manifest: ControlAttemptManifest = {
    requestedFamily: null, drillLabel: null, pairId: null,
  }): number {
    if (!this.reportEligible) return 0;
    const attempt = ++this.#attempt;
    this.#manifests.set(attempt, Object.freeze({ ...manifest }));
    return attempt;
  }
  append(row: Omit<ControlInputSample, "attemptId">, attemptId = this.#attempt,
    coalescePointer = false): void {
    if (coalescePointer) {
      const key = `${attemptId}:${row.channel}`;
      const anchor = this.#pointerAnchors.get(key);
      const previous = anchor === undefined ? undefined : this.#rows[anchor.index];
      if (anchor !== undefined && row.sampleMs >= anchor.sampleMs
        && row.sampleMs - anchor.sampleMs < CONTROL_INPUT_SAMPLE_INTERVAL_MS
        && anchor.index === this.#rows.length - 1
        && previous?.attemptId === attemptId && previous.channel === row.channel
        && previous.action === row.action && previous.powered === row.powered
        && previous.inputDevice === row.inputDevice
        && previous.captureActive === row.captureActive) {
        this.#rows[anchor.index] = Object.freeze({ ...row, attemptId });
        return;
      }
    } else this.#pointerAnchors.clear();
    if (this.#rows.length >= CONTROL_INPUT_ROW_CAP) { this.#dropped += 1; return; }
    if (coalescePointer) {
      this.#pointerAnchors.set(`${attemptId}:${row.channel}`, {
        sampleMs: row.sampleMs, index: this.#rows.length,
      });
    }
    this.#rows.push(Object.freeze({ ...row, attemptId }));
  }
  clear(): void {
    this.#rows.length = 0; this.#manifests.clear(); this.#pointerAnchors.clear();
    this.#attempt = 0; this.#dropped = 0;
  }
  rows(): readonly ControlInputSample[] { return this.#rows.slice(); }
  manifest(attemptId: number): ControlAttemptManifest | null {
    return this.#manifests.get(attemptId) ?? null;
  }
  manifests(): ReadonlyMap<number, ControlAttemptManifest> { return new Map(this.#manifests); }
  get dropped(): number { return this.#dropped; }
  get reportEligible(): boolean { return this.#dropped === 0; }
}

export interface AcceptedControlCommand {
  readonly tick: number;
  readonly id: readonly [number, number];
  readonly moveX: number;
  readonly moveY: number;
  readonly bodyYaw: number;
  readonly target: ArmTargetState;
}

export interface ParsedControlEvidence {
  readonly controlledFaction: 0 | 1;
  readonly finalTick: number;
  readonly baselineBytes: number;
  readonly stateDigest: string;
  readonly commands: readonly AcceptedControlCommand[];
}

function signed(view: DataView, at: number): number { return view.getInt32(at, true); }

/** Parse only the fixed receipt grammar; ReplayEnvelope remains opaque to TypeScript. */
export function parseControlEvidence(bytes: Uint8Array, limb: HumanArm): ParsedControlEvidence {
  if (bytes.length < CONTROL_EVIDENCE_HEADER_BYTES || bytes.length > CONTROL_EVIDENCE_MAX_BYTES
    || new TextDecoder().decode(bytes.subarray(0, 8)) !== CONTROL_EVIDENCE_MAGIC) {
    throw new RangeError("control evidence does not begin with ARPGCTL1");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const stride = view.getUint16(12, true);
  const payloadBytes = view.getUint16(14, true);
  const baselineBytes = view.getUint32(20, true);
  const finalTick = view.getUint32(24, true);
  const rows = view.getUint32(28, true);
  const controlledFaction = view.getUint8(32);
  if (view.getUint16(8, true) !== 3 || view.getUint8(10) !== 2 || view.getUint8(11) !== 0
    || stride !== CONTROL_RECEIPT_BYTES || payloadBytes !== CONTROL_COMMAND_PAYLOAD_BYTES
    || view.getUint16(16, true) !== 2 || view.getUint16(18, true) !== 0
    || (view.getUint8(33) & ~1) !== 0 || view.getUint8(34) !== 2 || view.getUint8(35) !== 0
    || view.getUint16(36, true) !== 1 || view.getUint16(38, true) !== 0
    || (controlledFaction !== 0 && controlledFaction !== 1)
    || finalTick === 0 || rows > CONTROL_EVIDENCE_MAX_ROWS || rows > finalTick * 2
    || CONTROL_EVIDENCE_HEADER_BYTES + baselineBytes + rows * stride !== bytes.length) {
    throw new RangeError("control evidence header does not describe its bytes");
  }
  const commands: AcceptedControlCommand[] = [];
  const controlledTicks = new Set<number>();
  const identities = new Set<string>();
  let previousTick = 0;
  let rowsAtTick = 0;
  let at = CONTROL_EVIDENCE_HEADER_BYTES + baselineBytes;
  for (let row = 0; row < rows; row += 1, at += stride) {
    const tick = view.getUint32(at, true);
    const index = view.getUint32(at + 4, true);
    const generation = view.getUint32(at + 8, true);
    rowsAtTick = row > 0 && tick === previousTick ? rowsAtTick + 1 : 1;
    const identity = `${tick}:${index}:${generation}`;
    if (tick >= finalTick || (row > 0 && tick < previousTick) || rowsAtTick > 2
      || index > 1 || generation !== 0 || identities.has(identity)
      || view.getUint8(at + 12) !== 2) {
      throw new RangeError(`control receipt ${row} violates tick, identity, or command grammar`);
    }
    identities.add(identity);
    if (index === controlledFaction) controlledTicks.add(tick);
    const payload = at + 13;
    const arm = payload + (limb === 0 ? 19 : 33);
    const plane = payload + (limb === 0 ? 53 : 55);
    commands.push(Object.freeze({
      tick,
      id: Object.freeze([index, generation] as const),
      moveX: signed(view, payload), moveY: signed(view, payload + 4),
      bodyYaw: view.getUint16(payload + 8, true),
      target: Object.freeze({
        bearing: view.getUint16(arm, true), height: signed(view, arm + 2),
        reach: signed(view, arm + 6), effort: signed(view, arm + 10),
        plane: view.getUint16(plane, true),
      }),
    }));
    previousTick = tick;
  }
  if (controlledTicks.size !== finalTick) {
    throw new RangeError("control evidence is missing a controlled command tick");
  }
  const digest = view.getUint32(44, true).toString(16).padStart(8, "0")
    + view.getUint32(40, true).toString(16).padStart(8, "0");
  return Object.freeze({ controlledFaction, finalTick, baselineBytes,
    stateDigest: `0x${digest}`, commands });
}

export interface ControlTickRow {
  readonly receiptTick: number;
  readonly publishedTick: number;
  readonly desired: V3 | null;
  readonly achieved: V3 | null;
  readonly errorArmLengths: number | null;
  readonly command: AcceptedControlCommand;
  readonly bodyYaw: number | null;
  readonly hipYaw: number | null;
  readonly pelvis: number | null;
  readonly twist: number | null;
  readonly forcedStepTicks: number | null;
  readonly health: readonly [number, number];
  readonly contacts: readonly Contact[];
  readonly severedMasks: readonly [number | null, number | null];
  readonly missing: "controlled-body-absent" | null;
}

function poseAt(frame: FightFrame, id: readonly [number, number]): Pose | undefined {
  return frame.poses.find((pose) => pose.id[0] === id[0] && pose.id[1] === id[1]);
}

/**
 * Join a receipt stamped before solving tick t to publication t+1.
 * That next frame is the first one containing both the accepted target and the
 * hand that chased it; frame t still describes the state before acceptance.
 */
export function joinControlReceipt(
  evidence: ParsedControlEvidence, source: FightSource, limb: HumanArm,
): readonly ControlTickRow[] {
  const frames = new Map<number, FightFrame>();
  for (let index = 0; index < source.frameCount(); index += 1) {
    const frame = source.frameAt(index);
    frames.set(frame.t, frame);
  }
  const anatomy = source.header.bodies[evidence.controlledFaction]?.anatomy;
  if (anatomy == null || !Number.isFinite(anatomy.armLength) || anatomy.armLength <= 0) {
    throw new RangeError("CONTROL_REPORT_REFUSED: controlled fighter anatomy is missing or invalid");
  }
  const rows: ControlTickRow[] = [];
  for (const command of evidence.commands) {
    if (command.id[0] !== evidence.controlledFaction) continue;
    const frame = frames.get(command.tick + 1);
    if (frame === undefined) {
      throw new RangeError(`control receipt ${command.tick} has no publication ${command.tick + 1}`);
    }
    const pose = poseAt(frame, command.id);
    const desired = pose?.arms[limb].target ?? null;
    const achieved = pose?.arms[limb].hand ?? null;
    const stance = frame.stances?.find((candidate) => candidate?.id[0] === command.id[0]
      && candidate.id[1] === command.id[1]) ?? null;
    rows.push(Object.freeze({
      receiptTick: command.tick, publishedTick: frame.t, desired, achieved,
      errorArmLengths: desired === null || achieved === null ? null
        : Math.hypot(desired[0] - achieved[0], desired[1] - achieved[1],
          desired[2] - achieved[2]) / anatomy.armLength,
      command, bodyYaw: pose?.yaw ?? null, hipYaw: stance?.hipYaw ?? null,
      pelvis: stance?.pelvis ?? null, twist: stance?.twist ?? null,
      forcedStepTicks: stance?.stepLeft ?? null, health: frame.health,
      contacts: frame.contacts,
      severedMasks: Object.freeze([0, 1].map((faction) =>
        frame.poses.find((candidate) => candidate.id[0] === faction)?.severed ?? null) as
        [number | null, number | null]),
      missing: pose === undefined ? "controlled-body-absent" : null,
    }));
  }
  if (rows.length !== evidence.finalTick) {
    throw new RangeError(`CONTROL_REPORT_REFUSED: ${rows.length} controlled rows do not cover final tick ${evidence.finalTick}`);
  }
  return rows;
}

export interface ControlReportContext {
  readonly sourceIdentity: string | null;
  readonly createdAt: string;
  readonly operator: string | null;
  readonly environment: Readonly<{
    userAgent: string | null; platform: string | null;
    hardwareConcurrency: number | null; timeZone: string | null;
    viewportCss: readonly [number, number] | null; devicePixelRatio: number | null;
    screenPixels: readonly [number, number] | null; refreshHz: number | null;
    pageZoom: number | null; graphicsBackend: string | null;
    inputDevice: "mouse" | "touch" | null;
    inputDevices: readonly ("mouse" | "touch")[];
    pointerCaptureActive: boolean; pointerCaptureEver: boolean;
    arenaView: ControlView;
  }>;
}

interface Distribution {
  readonly count: number;
  readonly min: number | null;
  readonly median: number | null;
  readonly p90: number | null;
  readonly max: number | null;
}

function distribution(values: readonly number[]): Distribution {
  if (values.length === 0) {
    return Object.freeze({ count: 0, min: null, median: null, p90: null, max: null });
  }
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number): number => sorted[Math.ceil((sorted.length - 1) * p)]!;
  return Object.freeze({ count: sorted.length, min: sorted[0]!, median: percentile(0.5),
    p90: percentile(0.9), max: sorted[sorted.length - 1]! });
}

export interface ControlLabReport {
  readonly schema: "arpg-arena-control-report-1";
  readonly status: "foreground-calibration-owed";
  readonly fingerprint: string | null;
  readonly seed: number;
  readonly controlledFaction: 0 | 1;
  readonly stateDigest: string;
  readonly metadata: ControlReportContext;
  readonly config: Readonly<{
    scenario: string; fingerprint: string | null; seed: number; maxTicks: number;
    arena: readonly [number, number]; heroes: string; monsters: string;
    controlledFaction: 0 | 1; primaryArm: HumanArm;
    decisionPeriodTicks: number;
    bodies: FightSource["header"]["bodies"];
  }>;
  readonly constants: typeof CONTROL_FEEL_CONSTANTS;
  readonly outcome: string | null;
  readonly finalTick: number;
  readonly summary: Readonly<{
    contacts: number; weaponBodyContacts: number; severances: number | null;
    summaryComplete: boolean;
    effortRaw: Distribution; errorArmLengths: Distribution;
    restingEffortFraction: number | null; fullEffortFraction: number | null;
  }>;
  readonly latency: Readonly<{
    rows: readonly ControlLatencyRow[];
    sampleToSubmissionMs: Distribution;
    submissionToPublicationMs: Distribution;
    publicationToAcknowledgementMs: Distribution;
    publicationToDisplayMs: Distribution;
    targetToAchievedArmLengths: Distribution;
  }>;
  readonly inputRows: readonly ControlInputSample[];
  readonly tickRows: readonly ControlTickRow[];
  readonly attempts: readonly Readonly<{ attemptId: number; valid: boolean;
    manifest: ControlAttemptManifest | null; classification: CutClassification }>[];
  readonly classifier: Readonly<{
    minNetTravel: number; minAxisTravel: number; minPathEfficiency: number;
    axisDominance: number; endpointTolerance: number;
  }>;
}

export function controlLabReport(
  source: FightSource, evidenceBytes: Uint8Array, limb: HumanArm,
  inputRows: readonly ControlInputSample[], metadata: ControlReportContext,
  manifests: ReadonlyMap<number, ControlAttemptManifest> = new Map(),
  latencyRows: readonly ControlLatencyRow[] = [],
): ControlLabReport {
  const evidence = parseControlEvidence(evidenceBytes, limb);
  const decisionPeriodTicks = source.decisionPeriods?.[evidence.controlledFaction];
  if (!Number.isInteger(decisionPeriodTicks) || decisionPeriodTicks! <= 0) {
    throw new RangeError("CONTROL_REPORT_REFUSED: authoritative decision period is missing or invalid");
  }
  const tickRows = joinControlReceipt(evidence, source, limb);
  if (tickRows.length !== evidence.finalTick || tickRows.at(-1)?.publishedTick !== evidence.finalTick) {
    throw new RangeError("CONTROL_REPORT_REFUSED: receipt rows do not reach the terminal publication");
  }
  const attemptIds = [...new Set(inputRows.filter((row) => row.channel === "cut" && row.powered)
    .map((row) => row.attemptId))];
  const attempts = attemptIds.map((attemptId) => {
    const rows = inputRows.filter((row) => row.attemptId === attemptId && row.channel === "cut"
      && row.powered);
    const first = rows[0];
    const sameFrame = first !== undefined && rows.every((row) => row.view === first.view
      && row.basis.right.every((value, index) => value === first.basis.right[index])
      && row.basis.up.every((value, index) => value === first.basis.up[index]));
    const points = sameFrame ? rows.map((row) => row.desired === null || row.shoulder === null
      || row.armLength === null ? null : cutPoint(row.desired, row.shoulder, row.armLength, first!.basis)) : [];
    const valid = sameFrame && points.length >= 2 && points.every((point) => point !== null);
    return Object.freeze({ attemptId, valid, manifest: manifests.get(attemptId) ?? null,
      classification: valid ? classifyCut(points as CutPoint[]) : classifyCut([]) });
  });
  const efforts = tickRows.map((row) => row.command.target.effort);
  const weaponBodyKind = source.header.contactKinds.indexOf("weaponBody");
  const severances = tickRows.reduce((count, row, index) => {
    const before = index === 0 ? [0, 0] : tickRows[index - 1]!.severedMasks;
    let added = 0;
    for (const faction of [0, 1] as const) {
      const mask = row.severedMasks[faction];
      if (mask !== null) {
        added += (((mask & ~(before[faction] ?? 0)) >>> 0).toString(2).match(/1/g)?.length ?? 0);
      }
    }
    return count + added;
  }, 0);
  const summaryComplete = tickRows.every((row) => row.severedMasks.every((mask) => mask !== null));
  for (const row of latencyRows) {
    if (row.publishedTick !== row.receiptTick + 1 || row.publicationMs === null
      || row.settledMs === null || row.displayedTick === null || row.displayMs === null) {
      throw new RangeError(`CONTROL_LATENCY_JOIN_REFUSED: receipt ${row.receiptTick} is missing settlement, publication, or display`);
    }
    if (row.submittedMs < row.sampleMs || row.settledMs < row.publicationMs
      || row.displayMs < row.publicationMs) {
      throw new RangeError(`CONTROL_LATENCY_JOIN_REFUSED: receipt ${row.receiptTick} clocks are not ordered`);
    }
    const receipt = tickRows.find((tick) => tick.receiptTick === row.receiptTick);
    if (receipt === undefined || !sameTarget(row.submittedTarget, receipt.command.target)) {
      throw new RangeError(`CONTROL_LATENCY_JOIN_REFUSED: receipt ${row.receiptTick} does not contain its submitted target`);
    }
  }
  const latencyErrors = latencyRows.map((row) => tickRows.find((tick) =>
    tick.receiptTick === row.receiptTick)?.errorArmLengths ?? null);
  if (latencyErrors.some((value) => value === null)) {
    throw new RangeError("CONTROL_LATENCY_JOIN_REFUSED: a presentation row has no achieved-hand receipt");
  }
  return Object.freeze({
    schema: "arpg-arena-control-report-1", status: "foreground-calibration-owed",
    fingerprint: source.header.fingerprint, seed: source.header.seed,
    controlledFaction: evidence.controlledFaction, stateDigest: evidence.stateDigest,
    metadata, config: Object.freeze({ scenario: source.header.scenario,
      fingerprint: source.header.fingerprint, seed: source.header.seed,
      maxTicks: source.header.maxTicks, arena: source.header.arena,
      heroes: source.header.heroes, monsters: source.header.monsters,
      controlledFaction: evidence.controlledFaction, primaryArm: limb,
      decisionPeriodTicks: decisionPeriodTicks!, bodies: source.header.bodies }),
    constants: CONTROL_FEEL_CONSTANTS, outcome: source.header.outcome,
    finalTick: evidence.finalTick,
    summary: Object.freeze({
      contacts: tickRows.reduce((sum, row) => sum + row.contacts.length, 0),
      weaponBodyContacts: weaponBodyKind < 0 ? 0 : tickRows.reduce((sum, row) =>
        sum + row.contacts.filter((contact) => contact.kind === weaponBodyKind).length, 0),
      severances: summaryComplete ? severances : null, summaryComplete,
      effortRaw: distribution(efforts),
      errorArmLengths: distribution(tickRows.flatMap((row) => row.errorArmLengths === null
        ? [] : [row.errorArmLengths])),
      restingEffortFraction: efforts.length === 0 ? null
        : efforts.filter((effort) => effort === 32_768).length / efforts.length,
      fullEffortFraction: efforts.length === 0 ? null
        : efforts.filter((effort) => effort === 65_536).length / efforts.length,
    }),
    latency: Object.freeze({ rows: latencyRows.slice(),
      sampleToSubmissionMs: distribution(latencyRows.map((row) => row.submittedMs - row.sampleMs)),
      submissionToPublicationMs: distribution(latencyRows.map((row) => row.publicationMs! - row.submittedMs)),
      publicationToAcknowledgementMs: distribution(latencyRows.map((row) => row.settledMs! - row.publicationMs!)),
      publicationToDisplayMs: distribution(latencyRows.map((row) => row.displayMs! - row.publicationMs!)),
      targetToAchievedArmLengths: distribution(latencyErrors as number[]) }),
    inputRows: inputRows.slice(), tickRows, attempts,
    classifier: Object.freeze({ minNetTravel: CUT_MIN_NET_TRAVEL,
      minAxisTravel: CUT_MIN_AXIS_TRAVEL, minPathEfficiency: CUT_MIN_PATH_EFFICIENCY,
      axisDominance: CUT_AXIS_DOMINANCE, endpointTolerance: CUT_ENDPOINT_TOLERANCE }),
  });
}
