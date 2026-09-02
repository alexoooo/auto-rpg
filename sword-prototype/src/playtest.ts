import { CONFIG } from "./config.ts";
import type { Matchup, Outcome, SideSetup } from "./bout.ts";
import type { Side } from "./physics.ts";
import { artifactChecksum, canonicalJson } from "./learning/artifact.ts";
import { specialistPolicyName } from "./learning/specialist.ts";
import { ENGAGEMENT_INSTRUMENT_VERSION } from "./recorder.ts";
import type { BehaviourRecord } from "./options.ts";
import { engagementGates, engagementMetrics, formatEngagementGateTable,
  type GateRow, type HumanGateRow } from "./learning/gates.ts";

const STORAGE_KEY = "sword-prototype.session-18b-playtest.v5";
const REPORT_VERSION = 5;
const BOUT_CAP_SECONDS = 45;
const COMPETENCE_VALUES = Object.freeze(["", "comfortable", "learning", "struggling"] as const);

interface Cell {
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  readonly handA: string;
  readonly handB: string;
  readonly actorSeed: number;
  readonly opponentSeed: number;
}

interface Assignment {
  readonly kind: "shakedown" | "human" | "specialist";
  readonly cell: Cell;
  readonly actorSide: Side;
  readonly repeat: number;
  readonly excluded: boolean;
}

export interface PlaytestReading {
  readonly engagementInstrumentVersion: number;
  readonly matchup: Matchup;
  readonly record: BehaviourRecord;
}

interface CapturedRow {
  readonly harness: "page";
  readonly engagementInstrumentVersion: number;
  readonly controller: string;
  readonly controllerClass: Assignment["kind"];
  readonly matchup: Matchup;
  readonly scheduledMatchup: Matchup;
  readonly matchupMatchesSchedule: boolean;
  readonly policySeeds: Readonly<Record<Side, number>>;
  readonly actorPolicy: string;
  readonly humanSpareHandPolicy: string | null;
  readonly cell: string;
  readonly actorSide: Side;
  readonly repeat: number;
  readonly excluded: boolean;
  readonly fpsMean: number | null;
  readonly fpsMin: number | null;
  readonly fpsSamples: number;
  readonly frameTimeMsMedian: number | null;
  readonly frameTimeMsP95: number | null;
  readonly frameTimeMsMax: number | null;
  readonly framesOver33ms: number;
  readonly framesAt50msClamp: number;
  readonly rawFrameSeconds: number;
  readonly simulatedFrameSeconds: number;
  readonly hiddenOrBlurred: boolean;
  readonly integrity: "ok" | "attention";
  readonly boutCapSecondsAtStart: number;
  readonly boutCapSecondsAtVerdict: number;
  readonly outcome: Outcome;
  readonly record: unknown;
  readonly gates: readonly GateRow[];
  readonly gateTable: readonly HumanGateRow[];
  notes: string;
}

interface FeelAnswer {
  verdict: "" | "yes" | "no" | "unsure";
  notes: string;
}

interface ActiveAttempt {
  readonly assignmentIndex: number;
  readonly startedAt: string;
  readonly boutCapSecondsAtStart: number;
}

interface AbortedAttempt {
  readonly assignmentIndex: number;
  readonly controller: Assignment["kind"];
  readonly cell: string;
  readonly actorSide: Side;
  readonly repeat: number;
  readonly excluded: boolean;
  readonly policySeeds: Readonly<Record<Side, number>>;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly reason: "page-reloaded-before-verdict" | "launch-failed";
  readonly detail?: string;
}

interface SavedRun {
  readonly reportVersion: number;
  readonly protocolDigest: string;
  readonly engagementInstrumentVersion: number;
  readonly startedAt: string;
  updatedAt: string;
  next: number;
  rows: CapturedRow[];
  active: ActiveAttempt | null;
  aborts: AbortedAttempt[];
  competence: "" | "comfortable" | "learning" | "struggling";
  generalNotes: string;
  feel: Record<string, FeelAnswer>;
  complete: boolean;
}

export interface PlaytestHooks {
  startBout(matchup: Matchup, policySeeds: Readonly<Record<Side, number>>): void;
  exitToSetup(): void;
}

const CELLS: readonly Cell[] = Object.freeze([
  Object.freeze({ key: "warrior/sword+empty", label: "Warrior -- sword + empty hand", unit: "warrior", handA: "sword", handB: "empty", actorSeed: 164139, opponentSeed: 177624 }),
  Object.freeze({ key: "warrior/sword+buckler", label: "Warrior -- sword + buckler", unit: "warrior", handA: "sword", handB: "buckler", actorSeed: 179850, opponentSeed: 161145 }),
  Object.freeze({ key: "warrior/sword+axe", label: "Warrior -- sword + axe", unit: "warrior", handA: "sword", handB: "axe", actorSeed: 185141, opponentSeed: 191438 }),
  Object.freeze({ key: "warrior/bow+empty", label: "Warrior -- bow", unit: "warrior", handA: "bow", handB: "empty", actorSeed: 130310, opponentSeed: 132733 }),
  Object.freeze({ key: "warrior/empty+empty", label: "Warrior -- bare hands", unit: "warrior", handA: "empty", handB: "empty", actorSeed: 185164, opponentSeed: 152567 }),
  Object.freeze({ key: "broot/sword+empty", label: "Broot -- sword + empty hand", unit: "broot", handA: "sword", handB: "empty", actorSeed: 147967, opponentSeed: 133828 }),
]);

const ASSIGNMENTS: readonly Assignment[] = Object.freeze([
  { kind: "shakedown", cell: CELLS[0], actorSide: "left", repeat: 0, excluded: true },
  ...CELLS.flatMap((cell) => (["left", "right"] as const).flatMap((actorSide) =>
    [1, 2, 3, 4].map((repeat) => ({ kind: "human" as const, cell, actorSide, repeat, excluded: false })))),
  ...CELLS.flatMap((cell) => (["left", "right"] as const).map((actorSide) =>
    ({ kind: "specialist" as const, cell, actorSide, repeat: 1, excluded: false }))),
]);

const PROTOCOL_BODY = Object.freeze({
  version: REPORT_VERSION,
  engagementInstrumentVersion: ENGAGEMENT_INSTRUMENT_VERSION,
  split: "validation" as const,
  baseSeed: 310013,
  boutCapSeconds: BOUT_CAP_SECONDS,
  humanRepeatsPerSide: 4,
  specialistRepeatsPerSide: 1,
  opponent: Object.freeze({ unit: "warrior", loadout: "sword+empty", policy: "swinger" }),
  cells: CELLS,
  assignments: Object.freeze(ASSIGNMENTS.map((assignment) => Object.freeze({
    controller: assignment.kind,
    cell: assignment.cell.key,
    actorSide: assignment.actorSide,
    repeat: assignment.repeat,
    excluded: assignment.excluded,
    actorSeed: assignment.cell.actorSeed,
    opponentSeed: assignment.cell.opponentSeed,
  }))),
});

export const PLAYTEST_PROTOCOL = Object.freeze({
  ...PROTOCOL_BODY,
  digest: artifactChecksum(canonicalJson(PROTOCOL_BODY)),
});

const FEEL_QUESTIONS: readonly { key: string; label: string }[] = Object.freeze([
  { key: "fixedCamera", label: "Fixed camera: body-relative aim still made sense after V and [ / ]." },
  { key: "zoom", label: "Both zoom extremes kept the fighters and raised blade readable." },
  { key: "bowPressure", label: "Bow draw and release worked under close pressure." },
  { key: "arrowTrace", label: "Arrows were readable in flight." },
  { key: "axeThrust", label: "The axe's lack of a true thrust felt meaningful (describe whether you missed it)." },
  { key: "defence", label: "Buckler/off-hand interception felt understandable and useful." },
  { key: "dualWield", label: "Choosing the attacking hand with sword + axe felt controllable (F swaps hands)." },
  { key: "emptyHands", label: "Bare-hand punches registered naturally." },
  { key: "blood", label: "Blood did not obscure the blow, opponent, or team colours." },
  { key: "materials", label: "Cloth, leather, skin, and steel stayed distinct while walking/crouching." },
  { key: "rig", label: "With G, the sword showed three collision boxes and a pommel beyond them." },
]);

const blankRun = (): SavedRun => ({
  reportVersion: REPORT_VERSION,
  protocolDigest: PLAYTEST_PROTOCOL.digest,
  engagementInstrumentVersion: ENGAGEMENT_INSTRUMENT_VERSION,
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  next: 0,
  rows: [],
  active: null,
  aborts: [],
  competence: "",
  generalNotes: "",
  feel: Object.fromEntries(FEEL_QUESTIONS.map(({ key }) => [key, { verdict: "", notes: "" }])),
  complete: false,
});

const json = (value: unknown): string => JSON.stringify(value, (_key, item) => {
  if (item === Number.POSITIVE_INFINITY) return "Infinity";
  if (item === Number.NEGATIVE_INFINITY) return "-Infinity";
  if (typeof item === "number" && Number.isNaN(item)) return "NaN";
  return item;
}, 2);

const clone = <T>(value: T): T => structuredClone(value);

const sideSetup = (assignment: Assignment): SideSetup => ({
  unit: assignment.cell.unit,
  policy: assignment.kind === "specialist"
    ? specialistPolicyName({ unit: assignment.cell.unit, loadout: assignment.cell.key.split("/")[1] })
    : "idle",
  control: assignment.kind === "human" || assignment.kind === "shakedown" ? "you" : "mind",
  handA: assignment.cell.handA,
  handB: assignment.cell.handB,
});

const opponent = (): SideSetup => ({
  unit: "warrior",
  policy: "swinger",
  control: "mind",
  handA: "sword",
  handB: "empty",
});

const matchupFor = (assignment: Assignment): Matchup => assignment.actorSide === "left"
  ? { left: sideSetup(assignment), right: opponent() }
  : { left: opponent(), right: sideSetup(assignment) };

const seedsFor = (assignment: Assignment): Readonly<Record<Side, number>> => Object.freeze(
  assignment.actorSide === "left"
    ? { left: assignment.cell.actorSeed, right: assignment.cell.opponentSeed }
    : { left: assignment.cell.opponentSeed, right: assignment.cell.actorSeed },
);

const savedRowMatchesAssignment = (row: CapturedRow, index: number): boolean => {
  try {
    const assignment = ASSIGNMENTS[index];
    if (!assignment) return false;
    const scheduledMatchup = matchupFor(assignment);
    const expectedController = assignment.kind === "human" ? "human+idle-spare"
      : assignment.kind === "shakedown" ? "shakedown-excluded+idle-spare"
      : specialistPolicyName({ unit: assignment.cell.unit, loadout: assignment.cell.key.split("/")[1] });
    const expectedActorPolicy = assignment.kind === "specialist" ? expectedController : "idle";
    const expectedSpare = assignment.kind === "specialist" ? null : "idle";
    const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object";
    const finiteOrNull = (value: unknown): boolean => value === null
      || (typeof value === "number" && Number.isFinite(value) && value >= 0);
    if (!object(row) || !object(row.record) || !object(row.record.engagement)) return false;
    const engagement = row.record.engagement as Record<string, unknown>;
    const counts = ["viableOpportunities", "attacksInWindow", "damagingContactsInWindow"];
    const durations = ["nearRangeStallSeconds", "longestProgressDroughtSeconds", "radialClosingMetres",
      "tangentialTravelMetres", "accumulatedBearingRadians", "retreatOutsideReachSeconds"];
    const seconds = row.record.seconds;
    if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return false;
    const engagementIsComplete = counts.every((key) => Number.isInteger(engagement[key]) && Number(engagement[key]) >= 0)
      && durations.every((key) => typeof engagement[key] === "number" && Number.isFinite(engagement[key]) && Number(engagement[key]) >= 0)
      && finiteOrNull(engagement.firstAttackSeconds);
    if (!engagementIsComplete) return false;
    const derivedGates = engagementGates(engagementMetrics(
      engagement as unknown as BehaviourRecord["engagement"], seconds));
    const derivedTable = formatEngagementGateTable(derivedGates);
    const frameNumbers = [row.frameTimeMsMedian, row.frameTimeMsP95, row.frameTimeMsMax];
    const timingIsComplete = finiteOrNull(row.fpsMean) && finiteOrNull(row.fpsMin)
      && Number.isInteger(row.fpsSamples) && row.fpsSamples >= 0
      && frameNumbers.every(finiteOrNull)
      && Number.isInteger(row.framesOver33ms) && row.framesOver33ms >= 0 && row.framesOver33ms <= row.fpsSamples
      && Number.isInteger(row.framesAt50msClamp) && row.framesAt50msClamp >= 0 && row.framesAt50msClamp <= row.fpsSamples
      && typeof row.rawFrameSeconds === "number" && Number.isFinite(row.rawFrameSeconds) && row.rawFrameSeconds >= 0
      && typeof row.simulatedFrameSeconds === "number" && Number.isFinite(row.simulatedFrameSeconds) && row.simulatedFrameSeconds >= 0
      && typeof row.hiddenOrBlurred === "boolean"
      && (row.fpsSamples === 0
        ? row.fpsMean === null && row.fpsMin === null && frameNumbers.every((value) => value === null)
        : row.fpsMean !== null && row.fpsMin !== null && frameNumbers.every((value) => value !== null));
    const matchupMatches = canonicalJson(row.matchup) === canonicalJson(scheduledMatchup);
    const attention = row.hiddenOrBlurred || row.fpsMin === null || row.fpsMin < 45 || !matchupMatches
      || row.boutCapSecondsAtStart !== BOUT_CAP_SECONDS || row.boutCapSecondsAtVerdict !== BOUT_CAP_SECONDS;
    return timingIsComplete && row.harness === "page"
      && row.engagementInstrumentVersion === ENGAGEMENT_INSTRUMENT_VERSION
      && row.controller === expectedController && row.actorPolicy === expectedActorPolicy
      && row.humanSpareHandPolicy === expectedSpare
      && row.controllerClass === assignment.kind && row.cell === assignment.cell.key
      && row.actorSide === assignment.actorSide && row.repeat === assignment.repeat
      && row.excluded === assignment.excluded
      && canonicalJson(row.policySeeds) === canonicalJson(seedsFor(assignment))
      && canonicalJson(row.scheduledMatchup) === canonicalJson(scheduledMatchup)
      && row.matchupMatchesSchedule === matchupMatches
      && row.boutCapSecondsAtStart === BOUT_CAP_SECONDS
      && typeof row.boutCapSecondsAtVerdict === "number" && Number.isFinite(row.boutCapSecondsAtVerdict)
      && object(row.outcome) && typeof row.outcome.text === "string"
      && (row.outcome.winner === null || row.outcome.winner === "left" || row.outcome.winner === "right")
      && (row.outcome.ending === "exhausted" || row.outcome.ending === "time")
      && Array.isArray(row.gates) && canonicalJson(row.gates) === canonicalJson(derivedGates)
      && Array.isArray(row.gateTable) && canonicalJson(row.gateTable) === canonicalJson(derivedTable)
      && row.integrity === (attention ? "attention" : "ok") && typeof row.notes === "string";
  } catch {
    return false;
  }
};

const savedAbortMatchesAssignment = (abort: AbortedAttempt): boolean => {
  const assignment = ASSIGNMENTS[abort?.assignmentIndex];
  if (!assignment) return false;
  return abort.controller === assignment.kind && abort.cell === assignment.cell.key
    && abort.actorSide === assignment.actorSide && abort.repeat === assignment.repeat
    && abort.excluded === assignment.excluded
    && (abort.reason === "page-reloaded-before-verdict" || abort.reason === "launch-failed")
    && (abort.detail === undefined || typeof abort.detail === "string")
    && typeof abort.startedAt === "string" && typeof abort.endedAt === "string"
    && canonicalJson(abort.policySeeds) === canonicalJson(seedsFor(assignment));
};

/**
 * The Session 18b sitting as a game screen rather than a console recipe.
 *
 * This class knows the declared matrix and the evidence envelope, while the
 * host remains the only owner of bouts. A normal game never constructs a row:
 * recording begins only after the player explicitly starts or resumes here.
 */
export class GuidedPlaytest {
  private readonly host: HTMLElement;
  private readonly launch: HTMLButtonElement;
  private readonly hooks: PlaytestHooks;
  private capBeforeWorkflow: number | null = null;
  private run: SavedRun | null = null;
  private assignment: Assignment | null = null;
  private rawFrameMs: number[] = [];
  private simulatedFrameSeconds = 0;
  private hiddenOrBlurred = false;
  private running = false;
  private loadIssue = "";
  private resumeNotice = "";
  private recoverySource: string | null = null;

  constructor(
    host: HTMLElement,
    launch: HTMLButtonElement,
    hooks: PlaytestHooks,
  ) {
    this.host = host;
    this.launch = launch;
    this.hooks = hooks;
    launch.addEventListener("click", this.open);
    // The game listens on window. UI gestures must end here or clicking a note
    // field becomes a thrust and typing "R" throws away the bout behind it.
    for (const event of ["pointerdown", "pointerup", "pointermove", "keydown", "keyup"] as const) {
      host.addEventListener(event, (edge) => edge.stopPropagation());
    }
    document.addEventListener("visibilitychange", this.noteVisibility);
    window.addEventListener("blur", this.noteBlur);
  }

  get boutIsRunning(): boolean { return this.running; }
  get workflowIsOpen(): boolean { return !this.host.classList.contains("gone"); }
  get recordingSide(): Side | null { return this.running ? this.assignment?.actorSide ?? null : null; }

  refuseAbandon(): void {
    window.alert("This guided bout is still being recorded. Finish it through the verdict or 45-second cap before leaving or restarting.");
  }

  refuseWorkflowNavigation(): void {
    window.alert("The guided playtest is open. Use Start next bout, or Exit to normal setup from its panel.");
  }

  /** One guard for the R key and the pause overlay's restart route. */
  permitRestart(): boolean {
    if (!this.workflowIsOpen) return true;
    if (this.running) this.refuseAbandon();
    else this.refuseWorkflowNavigation();
    return false;
  }

  permitManualPause(): boolean {
    if (!this.running) return true;
    window.alert("This guided bout records one continuous fight. Play through the verdict or 45-second cap; pause is available again between bouts.");
    return false;
  }

  refuseTakeover(): void {
    const side = this.assignment?.actorSide?.toUpperCase() ?? "scheduled";
    window.alert(`Takeover is unavailable during a guided bout: the ${side} actor is pinned for this measurement.`);
  }

  frame(rawDeltaMs: number, simulatedDeltaSeconds: number): void {
    if (!this.running) return;
    if (Number.isFinite(rawDeltaMs) && rawDeltaMs > 0) {
      this.rawFrameMs.push(rawDeltaMs);
    }
    if (Number.isFinite(simulatedDeltaSeconds) && simulatedDeltaSeconds >= 0) {
      this.simulatedFrameSeconds += simulatedDeltaSeconds;
    }
    if (document.visibilityState !== "visible") this.hiddenOrBlurred = true;
  }

  /** Called once, on the host's fight-to-over edge, before anything can rebuild. */
  completeBout(outcome: Outcome, reading: PlaytestReading): void {
    if (!this.running || !this.run || !this.assignment) return;
    if (this.run.active?.assignmentIndex !== this.run.next) {
      throw new Error("guided playtest verdict has no matching active attempt");
    }
    if (reading.engagementInstrumentVersion !== ENGAGEMENT_INSTRUMENT_VERSION) {
      throw new Error(`guided playtest expected engagement instrument ${ENGAGEMENT_INSTRUMENT_VERSION}, got ${reading.engagementInstrumentVersion}`);
    }
    this.running = false;
    const orderedFrames = [...this.rawFrameMs].sort((a, b) => a - b);
    const rawFrameMsTotal = this.rawFrameMs.reduce((sum, value) => sum + value, 0);
    const fpsMean = rawFrameMsTotal > 0 ? this.rawFrameMs.length * 1000 / rawFrameMsTotal : null;
    const fpsMin = orderedFrames.length > 0 ? 1000 / orderedFrames[orderedFrames.length - 1] : null;
    const percentile = (fraction: number): number | null => orderedFrames.length === 0 ? null
      : orderedFrames[Math.min(orderedFrames.length - 1, Math.floor((orderedFrames.length - 1) * fraction))];
    const scheduledMatchup = matchupFor(this.assignment);
    const matchupMatchesSchedule = canonicalJson(reading.matchup) === canonicalJson(scheduledMatchup);
    const capAtStart = this.run.active.boutCapSecondsAtStart;
    const capAtVerdict = CONFIG.bout.capSeconds;
    const gates = engagementGates(engagementMetrics(reading.record.engagement, reading.record.seconds));
    const gateTable = formatEngagementGateTable(gates);
    const attention = this.hiddenOrBlurred || fpsMin === null || fpsMin < 45 || !matchupMatchesSchedule
      || capAtStart !== BOUT_CAP_SECONDS || capAtVerdict !== BOUT_CAP_SECONDS;
    this.run.rows.push({
      harness: "page",
      engagementInstrumentVersion: reading.engagementInstrumentVersion,
      controller: this.assignment.kind === "human" ? "human+idle-spare"
        : this.assignment.kind === "shakedown" ? "shakedown-excluded+idle-spare"
        : specialistPolicyName({ unit: this.assignment.cell.unit, loadout: this.assignment.cell.key.split("/")[1] }),
      controllerClass: this.assignment.kind,
      matchup: clone(reading.matchup),
      scheduledMatchup: clone(scheduledMatchup),
      matchupMatchesSchedule,
      policySeeds: seedsFor(this.assignment),
      actorPolicy: this.assignment.kind === "specialist"
        ? specialistPolicyName({ unit: this.assignment.cell.unit, loadout: this.assignment.cell.key.split("/")[1] })
        : "idle",
      humanSpareHandPolicy: this.assignment.kind === "human" || this.assignment.kind === "shakedown" ? "idle" : null,
      cell: this.assignment.cell.key,
      actorSide: this.assignment.actorSide,
      repeat: this.assignment.repeat,
      excluded: this.assignment.excluded,
      fpsMean,
      fpsMin,
      fpsSamples: this.rawFrameMs.length,
      frameTimeMsMedian: percentile(0.5),
      frameTimeMsP95: percentile(0.95),
      frameTimeMsMax: orderedFrames.length > 0 ? orderedFrames[orderedFrames.length - 1] : null,
      framesOver33ms: this.rawFrameMs.filter((value) => value > 1000 / 30).length,
      framesAt50msClamp: this.rawFrameMs.filter((value) => value >= 50).length,
      rawFrameSeconds: rawFrameMsTotal / 1000,
      simulatedFrameSeconds: this.simulatedFrameSeconds,
      hiddenOrBlurred: this.hiddenOrBlurred,
      integrity: attention ? "attention" : "ok",
      boutCapSecondsAtStart: capAtStart,
      boutCapSecondsAtVerdict: capAtVerdict,
      outcome: clone(outcome),
      record: clone(reading.record),
      gates: clone(gates),
      gateTable: clone(gateTable),
      notes: "",
    });
    this.run.active = null;
    this.run.next += 1;
    this.run.complete = this.run.next >= ASSIGNMENTS.length;
    if (this.run.complete) this.restoreCap();
    this.save();
    this.render();
  }

  private readonly open = (): void => {
    this.capBeforeWorkflow = CONFIG.bout.capSeconds;
    this.loadIssue = "";
    this.resumeNotice = "";
    this.recoverySource = null;
    const saved = this.load();
    this.run = saved;
    if (saved.active) {
      const assignment = ASSIGNMENTS[saved.active.assignmentIndex];
      saved.aborts.push({
        assignmentIndex: saved.active.assignmentIndex,
        controller: assignment.kind,
        cell: assignment.cell.key,
        actorSide: assignment.actorSide,
        repeat: assignment.repeat,
        excluded: assignment.excluded,
        policySeeds: seedsFor(assignment),
        startedAt: saved.active.startedAt,
        endedAt: new Date().toISOString(),
        reason: "page-reloaded-before-verdict",
      });
      saved.active = null;
      this.resumeNotice = "The previous bout ended before a verdict when the page closed. It is recorded as aborted; the same matchup will be retried.";
      this.save();
    }
    this.host.classList.remove("gone");
    this.launch.disabled = true;
    this.render();
  };

  private start = (): void => {
    if (!this.run || this.run.complete || this.loadIssue) return;
    this.assignment = ASSIGNMENTS[this.run.next];
    if (this.capBeforeWorkflow === null) this.capBeforeWorkflow = CONFIG.bout.capSeconds;
    CONFIG.bout.capSeconds = BOUT_CAP_SECONDS;
    this.rawFrameMs = [];
    this.simulatedFrameSeconds = 0;
    this.hiddenOrBlurred = document.visibilityState !== "visible";
    this.running = true;
    this.run.active = {
      assignmentIndex: this.run.next,
      startedAt: new Date().toISOString(),
      boutCapSecondsAtStart: CONFIG.bout.capSeconds,
    };
    if (!this.save()) {
      this.run.active = null;
      this.running = false;
      this.restoreCap();
      this.render();
      return;
    }
    try {
      this.hooks.startBout(matchupFor(this.assignment), seedsFor(this.assignment));
    } catch (error) {
      const active = this.run.active;
      this.run.aborts.push({
        assignmentIndex: active.assignmentIndex,
        controller: this.assignment.kind,
        cell: this.assignment.cell.key,
        actorSide: this.assignment.actorSide,
        repeat: this.assignment.repeat,
        excluded: this.assignment.excluded,
        policySeeds: seedsFor(this.assignment),
        startedAt: active.startedAt,
        endedAt: new Date().toISOString(),
        reason: "launch-failed",
        detail: error instanceof Error ? error.message : String(error),
      });
      this.run.active = null;
      this.running = false;
      this.assignment = null;
      this.restoreCap();
      this.loadIssue = `The bout could not start (${error instanceof Error ? error.message : String(error)}). It was recorded as aborted and the same matchup was retained.`;
      this.save();
    }
    this.render();
  };

  private exit = (): void => {
    this.running = false;
    this.assignment = null;
    this.restoreCap();
    this.host.classList.add("gone");
    this.launch.disabled = false;
    this.hooks.exitToSetup();
  };

  private startOver = (): void => {
    if (this.running) return;
    let source: string | null;
    try {
      source = localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      this.loadIssue = `Saved playtest data could not be read (${error instanceof Error ? error.message : String(error)}). It was not overwritten.`;
      this.render();
      return;
    }
    const hasEvidence = Boolean(source && (this.loadIssue || (this.run
      && (this.run.rows.length > 0 || this.run.aborts.length > 0 || this.run.active !== null))));
    if (hasEvidence && !window.confirm("Archive the saved playtest and start again?")) return;
    if (source && hasEvidence) {
      try {
        localStorage.setItem(`${STORAGE_KEY}.archive.${Date.now()}`, source);
      } catch (error) {
        this.loadIssue = `The old playtest could not be archived (${error instanceof Error ? error.message : String(error)}). It was not overwritten.`;
        this.render();
        return;
      }
    }
    this.run = blankRun();
    this.loadIssue = "";
    this.resumeNotice = "";
    this.recoverySource = null;
    this.assignment = null;
    this.running = false;
    this.restoreCap();
    this.save();
    this.render();
  };

  private restoreCap(): void {
    if (this.capBeforeWorkflow === null) return;
    CONFIG.bout.capSeconds = this.capBeforeWorkflow;
    this.capBeforeWorkflow = null;
  }

  private save(): boolean {
    if (!this.run) return false;
    this.run.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, json(this.run));
      return true;
    } catch (error) {
      this.loadIssue = `Autosave failed: ${error instanceof Error ? error.message : String(error)}. Download the report before leaving.`;
      return false;
    }
  }

  private load(): SavedRun {
    let source: string | null = null;
    try {
      source = localStorage.getItem(STORAGE_KEY);
      if (!source) return blankRun();
      const parsed = JSON.parse(source) as SavedRun;
      const activeIsValid = parsed.active === null || (typeof parsed.active === "object"
        && Number.isInteger(parsed.active.assignmentIndex) && parsed.active.assignmentIndex === parsed.next
        && typeof parsed.active.startedAt === "string" && parsed.next < ASSIGNMENTS.length
        && parsed.active.boutCapSecondsAtStart === BOUT_CAP_SECONDS);
      if (parsed.reportVersion !== REPORT_VERSION || parsed.protocolDigest !== PLAYTEST_PROTOCOL.digest
          || parsed.engagementInstrumentVersion !== ENGAGEMENT_INSTRUMENT_VERSION
          || typeof parsed.startedAt !== "string" || typeof parsed.updatedAt !== "string"
          || !COMPETENCE_VALUES.includes(parsed.competence) || typeof parsed.generalNotes !== "string"
          || !Array.isArray(parsed.rows) || !Array.isArray(parsed.aborts)
          || !parsed.feel || typeof parsed.feel !== "object" || !Number.isInteger(parsed.next)
          || parsed.next < 0 || parsed.next > ASSIGNMENTS.length || parsed.rows.length !== parsed.next
          || parsed.complete !== (parsed.next === ASSIGNMENTS.length) || !activeIsValid
          || FEEL_QUESTIONS.some(({ key }) => !parsed.feel[key]
            || !["", "yes", "no", "unsure"].includes(parsed.feel[key].verdict)
            || typeof parsed.feel[key].notes !== "string")
          || parsed.aborts.some((abort) => !savedAbortMatchesAssignment(abort)
            || abort.assignmentIndex > parsed.next)
          || parsed.rows.some((row, index) => !savedRowMatchesAssignment(row, index))) {
        this.loadIssue = "Saved playtest data uses an incompatible or incomplete format. It was not overwritten; Start over will archive it first.";
        this.recoverySource = source;
        return blankRun();
      }
      return parsed;
    } catch (error) {
      this.recoverySource = source;
      this.loadIssue = `Saved playtest data could not be read (${error instanceof Error ? error.message : String(error)}). It was not overwritten; Start over will archive it first.`;
      return blankRun();
    }
  }

  private report(): object {
    if (!this.run) return {};
    return {
      reportVersion: this.run.reportVersion,
      protocolDigest: this.run.protocolDigest,
      engagementInstrumentVersion: this.run.engagementInstrumentVersion,
      purpose: "combat-followups Session 18b human gate feasibility",
      protocol: PLAYTEST_PROTOCOL,
      startedAt: this.run.startedAt,
      updatedAt: this.run.updatedAt,
      completed: this.run.complete,
      progress: { completed: this.run.next, aborted: this.run.aborts.length, total: ASSIGNMENTS.length },
      missingAssignments: ASSIGNMENTS.slice(this.run.next).map((assignment) => ({
        controller: assignment.kind,
        cell: assignment.cell.key,
        actorSide: assignment.actorSide,
        repeat: assignment.repeat,
        excluded: assignment.excluded,
        policySeeds: seedsFor(assignment),
      })),
      competence: this.run.competence,
      generalNotes: this.run.generalNotes,
      feel: this.run.feel,
      abortedAttempts: this.run.aborts,
      rows: this.run.rows,
    };
  }

  private copy = async (): Promise<void> => {
    const status = this.host.querySelector<HTMLElement>("[data-copy-status]");
    try {
      await navigator.clipboard.writeText(json(this.report()));
      if (status) status.textContent = "Copied.";
    } catch (error) {
      if (status) status.textContent = `Copy failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  };

  private download = (): void => {
    const blob = new Blob([json(this.report())], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `sword-playtest-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  private downloadRecovery = (): void => {
    if (this.recoverySource === null) return;
    const blob = new Blob([this.recoverySource], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `sword-playtest-incompatible-save-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  private readonly noteVisibility = (): void => {
    if (this.running && document.visibilityState !== "visible") this.hiddenOrBlurred = true;
  };

  private readonly noteBlur = (): void => {
    if (this.running) this.hiddenOrBlurred = true;
  };

  private render(): void {
    if (!this.run) return;
    const next = ASSIGNMENTS[this.run.next];
    const last = this.run.rows[this.run.rows.length - 1];
    const officialDone = this.run.rows.filter((row) => !row.excluded).length;
    const phase = this.running ? "running" : this.run.complete ? "complete" : last ? "between" : "ready";
    const title = next
      ? `${this.running ? "Current" : "Up next"} -- ${next.kind === "shakedown" ? "Practice" : next.kind === "human" ? "You play" : "AI control"}: ${next.cell.label}`
      : "Playtest complete";
    const side = next?.actorSide === "right" ? "RIGHT" : "LEFT";
    const task = next
      ? `${side} side${next.repeat > 0 ? `, repeat ${next.repeat}` : ""}. Opponent: Warrior, sword, Swinger.`
      : "All 60 official bouts are safely recorded.";
    const lastIndex = this.run.rows.length - 1;
    const lastCellLabel = last ? CELLS.find((cell) => cell.key === last.cell)?.label ?? last.cell : "";
    const lastController = last?.controllerClass === "shakedown" ? "Practice (excluded)"
      : last?.controllerClass === "human" ? "You played" : "AI control";

    this.host.innerHTML = `
      <aside class="playtest-panel ${this.running ? "running" : ""}" aria-label="Guided playtest">
        <div class="playtest-topline"><b>GUIDED PLAYTEST</b><button type="button" data-exit ${this.running ? "disabled" : ""}>Exit to normal setup</button></div>
        <div class="playtest-progress"><span style="width:${(this.run.next / ASSIGNMENTS.length) * 100}%"></span></div>
        <p class="playtest-count">${officialDone} / 60 official bouts &middot; autosaved on this browser</p>
        <h2>${title}</h2>
        <p>${task}</p>
        ${phase === "ready" ? `<div class="playtest-live">One practice bout, then 48 played bouts and 12 hands-off AI controls. Allow about an hour; you can exit between bouts and resume later.</div>` : ""}
        ${this.loadIssue ? `<div class="playtest-result attention">${this.escape(this.loadIssue)}</div>` : ""}
        ${this.resumeNotice ? `<div class="playtest-result attention">${this.escape(this.resumeNotice)}</div>` : ""}
        ${next?.kind === "human" || next?.kind === "shakedown" ? `<p class="playtest-count">Your unused hand uses the Idle assist policy. Press F when you want to change which hand you drive.</p>` : ""}
        ${phase === "running" ? `<div class="playtest-live">Recording automatically &middot; play through the verdict or 45-second cap.</div>` : ""}
        ${phase === "running" ? "" : `
        ${last ? `
          <div class="playtest-result ${last.integrity}">
            <b>Captured bout:</b> ${lastController}, ${this.escape(lastCellLabel)}, ${last.actorSide.toUpperCase()} side${last.repeat > 0 ? `, repeat ${last.repeat}` : ""}<br />
            <b>Verdict:</b> ${last.outcome.text}<br />
            FPS ${last.fpsMean?.toFixed(1) ?? "unavailable"} mean / ${last.fpsMin?.toFixed(1) ?? "unavailable"} min
            ${last.integrity === "attention" ? " &middot; retained, but marked for frame-rate/focus review" : " &middot; integrity OK"}
          </div>
          <table class="playtest-gates">
            <thead><tr><th>Actor gate</th><th>Achieved</th><th>Threshold</th><th>Margin</th><th>Result</th></tr></thead>
            <tbody>${last.gateTable.map((row) => `<tr>
              <td>${this.escape(row.name.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`))}</td>
              <td>${this.escape(row.achieved)}</td><td>${this.escape(row.threshold)}</td><td>${this.escape(row.margin)}</td>
              <td>${row.passed === null ? "&mdash;" : row.passed ? "PASS" : "FAIL"}</td>
            </tr>`).join("")}</tbody>
          </table>
          <label class="playtest-notes">Notes for that bout
            <textarea data-row-note="${lastIndex}" placeholder="Optional: awkward controls, visible stutter, unusual play...">${this.escape(last.notes)}</textarea>
          </label>` : ""}
        ${!this.run.complete && !this.loadIssue ? `<button class="action" type="button" data-next>${this.run.next === 0 ? "Start practice bout" : "Start next bout"}</button>` : ""}
        ${this.run.complete ? `<div class="playtest-live">Done. Please add any final observations, then copy or download the report.</div>` : ""}
        <details class="playtest-feel" ${this.run.complete ? "open" : ""}>
          <summary>Feel checklist (${Object.values(this.run.feel).filter((answer) => answer.verdict !== "").length}/${FEEL_QUESTIONS.length})</summary>
          ${FEEL_QUESTIONS.map(({ key, label }) => {
            const answer = this.run!.feel[key];
            return `<div class="feel-row"><label>${label}</label>
              <select data-feel-verdict="${key}">
                <option value="" ${answer.verdict === "" ? "selected" : ""}>Not tested</option>
                <option value="yes" ${answer.verdict === "yes" ? "selected" : ""}>Yes</option>
                <option value="no" ${answer.verdict === "no" ? "selected" : ""}>No</option>
                <option value="unsure" ${answer.verdict === "unsure" ? "selected" : ""}>Not sure</option>
              </select>
              <input type="text" data-feel-note="${key}" value="${this.escape(answer.notes)}" placeholder="Short observation" /></div>`;
          }).join("")}
          <label class="playtest-notes">Overall notes<textarea data-general>${this.escape(this.run.generalNotes)}</textarea></label>
          <label>How comfortable were the controls?
            <select data-competence>
              <option value="" ${this.run.competence === "" ? "selected" : ""}>Choose at the end</option>
              <option value="comfortable" ${this.run.competence === "comfortable" ? "selected" : ""}>Comfortable</option>
              <option value="learning" ${this.run.competence === "learning" ? "selected" : ""}>Still learning</option>
              <option value="struggling" ${this.run.competence === "struggling" ? "selected" : ""}>Struggling with controls</option>
            </select>
          </label>
        </details>
        <div class="playtest-actions">
          <button type="button" data-copy>Copy results for Codex</button>
          <button type="button" data-download>Download report</button>
          ${this.recoverySource !== null ? `<button type="button" data-download-recovery>Download incompatible saved data</button>` : ""}
          <button type="button" data-start-over ${this.running ? "disabled" : ""}>Start over</button>
          <span data-copy-status></span>
        </div>
        `}
      </aside>`;

    this.host.querySelector<HTMLButtonElement>("[data-next]")?.addEventListener("click", this.start);
    this.host.querySelector<HTMLButtonElement>("[data-exit]")?.addEventListener("click", this.exit);
    this.host.querySelector<HTMLButtonElement>("[data-start-over]")?.addEventListener("click", this.startOver);
    this.host.querySelector<HTMLButtonElement>("[data-copy]")?.addEventListener("click", () => void this.copy());
    this.host.querySelector<HTMLButtonElement>("[data-download]")?.addEventListener("click", this.download);
    this.host.querySelector<HTMLButtonElement>("[data-download-recovery]")?.addEventListener("click", this.downloadRecovery);
    this.host.querySelector<HTMLTextAreaElement>("[data-row-note]")?.addEventListener("input", (event) => {
      const field = event.currentTarget as HTMLTextAreaElement;
      const row = this.run!.rows[Number(field.dataset.rowNote)];
      if (row) row.notes = field.value;
      this.save();
    });
    this.host.querySelector<HTMLTextAreaElement>("[data-general]")?.addEventListener("input", (event) => {
      this.run!.generalNotes = (event.currentTarget as HTMLTextAreaElement).value;
      this.save();
    });
    this.host.querySelector<HTMLSelectElement>("[data-competence]")?.addEventListener("change", (event) => {
      this.run!.competence = (event.currentTarget as HTMLSelectElement).value as SavedRun["competence"];
      this.save();
    });
    for (const field of this.host.querySelectorAll<HTMLSelectElement>("[data-feel-verdict]")) {
      field.addEventListener("change", () => {
        this.run!.feel[field.dataset.feelVerdict!].verdict = field.value as FeelAnswer["verdict"];
        this.save();
      });
    }
    for (const field of this.host.querySelectorAll<HTMLInputElement>("[data-feel-note]")) {
      field.addEventListener("input", () => { this.run!.feel[field.dataset.feelNote!].notes = field.value; this.save(); });
    }
  }

  private escape(value: string): string {
    const span = document.createElement("span");
    span.textContent = value;
    return span.innerHTML.replaceAll('"', "&quot;");
  }
}
