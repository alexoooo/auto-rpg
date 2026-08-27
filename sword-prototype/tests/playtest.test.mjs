import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { CONFIG } from "../src/config.ts";
import { GuidedPlaytest, PLAYTEST_PROTOCOL } from "../src/playtest.ts";
import { researchMatrix } from "../src/learning/research-matrix.ts";
import { behaviourRecord } from "../src/options.ts";

const STORAGE_KEY = "sword-prototype.session-18b-playtest.v3";

class FakeTarget {
  listeners = new Map();
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  fire(type, extra = {}) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ currentTarget: this, stopPropagation() {}, ...extra });
    }
  }
}

class FakeClassList {
  constructor(...names) { this.names = new Set(names); }
  add(name) { this.names.add(name); }
  remove(name) { this.names.delete(name); }
  contains(name) { return this.names.has(name); }
}

class FakeElement extends FakeTarget {
  constructor(...classes) {
    super();
    this.classList = new FakeClassList(...classes);
    this.disabled = false;
    this._innerHTML = "";
    this.textContent = "";
    this.children = new Map();
  }
  set innerHTML(value) { this._innerHTML = value; }
  get innerHTML() {
    if (this.tagName !== "SPAN") return this._innerHTML;
    return String(this.textContent)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  }
  querySelector(selector) {
    if (!this.children.has(selector)) this.children.set(selector, new FakeElement());
    return this.children.get(selector);
  }
  querySelectorAll() { return []; }
}

const storage = new Map();
const documentTarget = new FakeTarget();
const windowTarget = new FakeTarget();
const clipboard = { text: "", async writeText(value) { this.text = value; } };
const alerts = [];
let confirmResponse = true;
let confirmCalls = 0;
let storageReadError = null;

Object.assign(documentTarget, {
  visibilityState: "visible",
  createElement(tagName) {
    const element = new FakeElement();
    element.tagName = tagName.toUpperCase();
    element.click = () => {};
    return element;
  },
});
Object.assign(windowTarget, {
  alert(message) { alerts.push(message); },
  confirm() { confirmCalls += 1; return confirmResponse; },
});
Object.defineProperty(globalThis, "document", { configurable: true, value: documentTarget });
Object.defineProperty(globalThis, "window", { configurable: true, value: windowTarget });
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem(key) { if (storageReadError) throw storageReadError; return storage.get(key) ?? null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
  clear() { storage.clear(); },
} });
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard } });

const outcome = () => ({ winner: "left", ending: "exhausted", blow: null, text: "Left wins" });
const defaultMatchup = {
  left: { unit: "warrior", policy: "idle", control: "you", handA: "sword", handB: "empty" },
  right: { unit: "warrior", policy: "swinger", control: "mind", handA: "sword", handB: "empty" },
};
const reading = (matchup = defaultMatchup) => {
  const record = behaviourRecord();
  record.seconds = 2;
  Object.assign(record.engagement, {
    viableOpportunities: 10,
    attacksInWindow: 7,
    damagingContactsInWindow: 2,
    firstAttackSeconds: 0.5,
    nearRangeStallSeconds: 0.1,
  });
  return { engagementInstrumentVersion: 1, matchup, record };
};

const harness = () => {
  const host = new FakeElement("gone");
  const launch = new FakeElement();
  const starts = [];
  let exits = 0;
  const guided = new GuidedPlaytest(host, launch, {
    startBout(matchup, policySeeds) { starts.push({ matchup, policySeeds }); },
    exitToSetup() { exits += 1; },
  });
  return { guided, host, launch, starts, exits: () => exits };
};

const open = (fixture) => fixture.launch.fire("click");
const start = (fixture) => fixture.guided.start();
const report = (fixture) => fixture.guided.report();

const expectedCells = [
  { key: "warrior/sword+empty", label: "Warrior -- sword + empty hand", unit: "warrior", handA: "sword", handB: "empty", actorSeed: 164139, opponentSeed: 177624 },
  { key: "warrior/sword+buckler", label: "Warrior -- sword + buckler", unit: "warrior", handA: "sword", handB: "buckler", actorSeed: 179850, opponentSeed: 161145 },
  { key: "warrior/sword+axe", label: "Warrior -- sword + axe", unit: "warrior", handA: "sword", handB: "axe", actorSeed: 185141, opponentSeed: 191438 },
  { key: "warrior/bow+empty", label: "Warrior -- bow", unit: "warrior", handA: "bow", handB: "empty", actorSeed: 130310, opponentSeed: 132733 },
  { key: "warrior/empty+empty", label: "Warrior -- bare hands", unit: "warrior", handA: "empty", handB: "empty", actorSeed: 185164, opponentSeed: 152567 },
  { key: "broot/sword+empty", label: "Broot -- sword + empty hand", unit: "broot", handA: "sword", handB: "empty", actorSeed: 147967, opponentSeed: 133828 },
];

const expectedAssignments = [
  { controller: "shakedown", cell: expectedCells[0].key, actorSide: "left", repeat: 0, excluded: true,
    actorSeed: expectedCells[0].actorSeed, opponentSeed: expectedCells[0].opponentSeed },
  ...expectedCells.flatMap((cell) => ["left", "right"].flatMap((actorSide) =>
    [1, 2, 3, 4].map((repeat) => ({ controller: "human", cell: cell.key, actorSide, repeat,
      excluded: false, actorSeed: cell.actorSeed, opponentSeed: cell.opponentSeed })))),
  ...expectedCells.flatMap((cell) => ["left", "right"].map((actorSide) =>
    ({ controller: "specialist", cell: cell.key, actorSide, repeat: 1, excluded: false,
      actorSeed: cell.actorSeed, opponentSeed: cell.opponentSeed }))),
];

test.beforeEach(() => {
  storage.clear();
  clipboard.text = "";
  alerts.length = 0;
  confirmResponse = true;
  confirmCalls = 0;
  storageReadError = null;
  documentTarget.visibilityState = "visible";
  CONFIG.bout.capSeconds = 30;
});

test("the_guided_protocol_pins_the_exact_61_assignment_manifest", () => {
  assert.deepEqual(PLAYTEST_PROTOCOL, {
    version: 3,
    engagementInstrumentVersion: 1,
    split: "validation",
    baseSeed: 310013,
    boutCapSeconds: 45,
    humanRepeatsPerSide: 4,
    specialistRepeatsPerSide: 1,
    opponent: { unit: "warrior", loadout: "sword+empty", policy: "swinger" },
    cells: expectedCells,
    assignments: expectedAssignments,
    digest: "5d3dea04",
  });
  assert.equal(PLAYTEST_PROTOCOL.assignments.length, 61);
  assert.equal(PLAYTEST_PROTOCOL.assignments.filter(({ excluded }) => !excluded).length, 60);
  assert.equal(Object.isFrozen(PLAYTEST_PROTOCOL), true);
  assert.equal(Object.isFrozen(PLAYTEST_PROTOCOL.cells[0]), true);
  assert.equal(Object.isFrozen(PLAYTEST_PROTOCOL.assignments[0]), true);
});

test("the_guided_cells_use_the_validation_matrix_specialist_seeds", () => {
  const jobs = researchMatrix(PLAYTEST_PROTOCOL.split, PLAYTEST_PROTOCOL.baseSeed)
    .filter(({ opponent, actorSide }) => opponent === "specialist" && actorSide === "left");
  for (const cell of PLAYTEST_PROTOCOL.cells) {
    const job = jobs.find(({ unit, loadout }) => `${unit}/${loadout}` === cell.key);
    assert.ok(job, `${cell.key} exists in the declared research matrix`);
    assert.deepEqual([cell.actorSeed, cell.opponentSeed], [job.actorSeed, job.opponentSeed]);
  }
});

test("every_assignment_launches_the_declared_matchup_seed_and_mirror", () => {
  CONFIG.bout.capSeconds = 73;
  const fixture = harness();
  open(fixture);

  for (const [index, assignment] of expectedAssignments.entries()) {
    start(fixture);
    assert.equal(fixture.guided.recordingSide, assignment.actorSide,
      `assignment ${index} publishes its actor as the camera subject`);
    assert.equal(fixture.starts.length, index + 1, `assignment ${index} launches exactly once`);
    const launched = fixture.starts[index];
    const cell = expectedCells.find(({ key }) => key === assignment.cell);
    const specialist = cell.handA === "bow" ? "archer" : "duelist";
    const actor = {
      unit: cell.unit,
      policy: assignment.controller === "specialist" ? specialist : "idle",
      control: assignment.controller === "specialist" ? "mind" : "you",
      handA: cell.handA,
      handB: cell.handB,
    };
    const opponent = { unit: "warrior", policy: "swinger", control: "mind", handA: "sword", handB: "empty" };
    assert.deepEqual(launched.matchup, assignment.actorSide === "left"
      ? { left: actor, right: opponent } : { left: opponent, right: actor });
    assert.deepEqual(launched.policySeeds, assignment.actorSide === "left"
      ? { left: assignment.actorSeed, right: assignment.opponentSeed }
      : { left: assignment.opponentSeed, right: assignment.actorSeed });
    fixture.guided.frame(16, 0.016);
    fixture.guided.completeBout(outcome(), reading(launched.matchup));
  }

  const captured = report(fixture);
  assert.deepEqual(captured.progress, { completed: 61, aborted: 0, total: 61 });
  assert.equal(captured.rows.length, 61);
  assert.equal(captured.rows.filter(({ excluded }) => !excluded).length, 60);
  assert.deepEqual(captured.missingAssignments, []);
  assert.equal(captured.completed, true);
  assert.match(fixture.host.innerHTML, /Captured bout:.*AI control.*Broot.*RIGHT side.*Verdict:.*Left wins/s);
  assert.match(fixture.host.innerHTML, /class="playtest-gates"/);
  assert.match(fixture.host.innerHTML, /data-row-note="60"/);
  assert.equal(CONFIG.bout.capSeconds, 73, "the final capture returns the leased cap");
});

test("human_capture_names_the_idle_spare_and_is_one_shot_and_immutable", () => {
  const fixture = harness();
  open(fixture);
  start(fixture);
  fixture.guided.completeBout(outcome(), reading(fixture.starts.at(-1).matchup));
  start(fixture);

  const mutableOutcome = outcome();
  const mutableReading = reading(fixture.starts.at(-1).matchup);
  fixture.guided.completeBout(mutableOutcome, mutableReading);
  mutableOutcome.text = "mutated";
  mutableReading.record.seconds = 99;
  mutableReading.record.engagement.attacksInWindow = 0;
  fixture.guided.completeBout(outcome(), reading(fixture.starts.at(-1).matchup));

  const row = report(fixture).rows[1];
  assert.equal(report(fixture).rows.length, 2, "a second fight-to-over edge cannot duplicate the capture");
  assert.equal(row.controller, "human+idle-spare");
  assert.equal(row.controllerClass, "human");
  assert.equal(row.actorPolicy, "idle");
  assert.equal(row.humanSpareHandPolicy, "idle");
  assert.equal(row.matchup.left.control, "you");
  assert.equal(row.matchup.left.policy, "idle");
  assert.equal(row.outcome.text, "Left wins");
  assert.equal(row.record.seconds, 2);
  assert.equal(row.gates[0].margin, 0.04999999999999993);
  assert.equal(row.gateTable[0].margin, "+0.05");
});

test("capture_retains_auditable_fps_frame_time_and_focus_evidence", () => {
  const fixture = harness();
  open(fixture);
  start(fixture);
  for (const [raw, simulated] of [[10, 0.01], [20, 0.02], [40, 0.04], [50, 0.05]]) {
    fixture.guided.frame(raw, simulated);
  }
  fixture.guided.frame(Number.NaN, -1);
  fixture.guided.completeBout(outcome(), reading(fixture.starts.at(-1).matchup));

  const row = report(fixture).rows[0];
  assert.equal(row.fpsMean, 100 / 3);
  assert.equal(row.fpsMin, 20);
  assert.equal(row.fpsSamples, 4);
  assert.equal(row.frameTimeMsMedian, 20);
  assert.equal(row.frameTimeMsP95, 40);
  assert.equal(row.frameTimeMsMax, 50);
  assert.equal(row.framesOver33ms, 2);
  assert.equal(row.framesAt50msClamp, 1);
  assert.equal(row.rawFrameSeconds, 0.12);
  assert.ok(Math.abs(row.simulatedFrameSeconds - 0.12) < 1e-12);
  assert.equal(row.integrity, "attention");
  assert.equal(row.boutCapSecondsAtStart, 45);
  assert.equal(row.boutCapSecondsAtVerdict, 45);
  assert.equal(row.matchupMatchesSchedule, true);
});

test("capture_flags_a_matchup_or_cap_that_changed_under_the_workflow", () => {
  const fixture = harness();
  open(fixture);
  start(fixture);
  const wrong = structuredClone(fixture.starts[0].matchup);
  wrong.right.policy = "idle";
  CONFIG.bout.capSeconds = 44;
  fixture.guided.frame(16, 0.016);
  fixture.guided.completeBout(outcome(), reading(wrong));

  const row = report(fixture).rows[0];
  assert.equal(row.integrity, "attention");
  assert.equal(row.matchupMatchesSchedule, false);
  assert.equal(row.matchup.right.policy, "idle");
  assert.equal(row.scheduledMatchup.right.policy, "swinger");
  assert.equal(row.boutCapSecondsAtStart, 45);
  assert.equal(row.boutCapSecondsAtVerdict, 44);
});

test("local_storage_resumes_at_the_first_missing_assignment", () => {
  const first = harness();
  open(first);
  start(first);
  first.guided.frame(16, 0.016);
  first.guided.completeBout(outcome(), reading(first.starts.at(-1).matchup));

  const resumed = harness();
  open(resumed);
  assert.deepEqual(report(resumed).progress, { completed: 1, aborted: 0, total: 61 });
  assert.equal(report(resumed).missingAssignments.length, 60);
  assert.deepEqual(report(resumed).missingAssignments[0], {
    controller: "human", cell: "warrior/sword+empty", actorSide: "left", repeat: 1,
    excluded: false, policySeeds: { left: 164139, right: 177624 },
  });
  start(resumed);
  assert.equal(resumed.starts[0].matchup.left.control, "you");
  assert.equal(resumed.starts[0].matchup.left.policy, "idle");
});

test("an_incompatible_saved_run_is_refused_without_overwriting_it", () => {
  const stale = JSON.stringify({ reportVersion: 0, next: 0, rows: [], sentinel: "retain me" });
  storage.set(STORAGE_KEY, stale);
  const fixture = harness();
  open(fixture);
  start(fixture);
  assert.equal(fixture.starts.length, 0);
  assert.equal(storage.get(STORAGE_KEY), stale);
  assert.match(fixture.host.innerHTML, /incompatible or incomplete format/);
});

const savedActiveRun = () => {
  const first = harness();
  open(first);
  start(first);
  return JSON.parse(storage.get(STORAGE_KEY));
};

test("a_stale_protocol_digest_is_refused_before_resume", () => {
  const saved = savedActiveRun();
  saved.protocolDigest = "deadbeef";
  const source = JSON.stringify(saved);
  storage.set(STORAGE_KEY, source);

  const resumed = harness();
  open(resumed);
  start(resumed);
  assert.equal(resumed.starts.length, 0);
  assert.equal(storage.get(STORAGE_KEY), source);
  assert.match(resumed.host.innerHTML, /incompatible or incomplete format/);
  assert.match(resumed.host.innerHTML, /Download incompatible saved data/);
});

test("a_stale_engagement_instrument_is_refused_before_resume", () => {
  const saved = savedActiveRun();
  saved.engagementInstrumentVersion += 1;
  const source = JSON.stringify(saved);
  storage.set(STORAGE_KEY, source);

  const resumed = harness();
  open(resumed);
  start(resumed);
  assert.equal(resumed.starts.length, 0);
  assert.equal(storage.get(STORAGE_KEY), source);
  assert.match(resumed.host.innerHTML, /incompatible or incomplete format/);
});

test("a_reload_records_the_active_attempt_as_aborted_and_retries_the_same_assignment", () => {
  const interrupted = harness();
  open(interrupted);
  start(interrupted);
  const firstLaunch = structuredClone(interrupted.starts[0]);

  const resumed = harness();
  open(resumed);
  const recovered = report(resumed);
  assert.deepEqual(recovered.progress, { completed: 0, aborted: 1, total: 61 });
  assert.equal(recovered.missingAssignments.length, 61);
  assert.deepEqual(recovered.abortedAttempts[0], {
    assignmentIndex: 0,
    controller: "shakedown",
    cell: "warrior/sword+empty",
    actorSide: "left",
    repeat: 0,
    excluded: true,
    policySeeds: { left: 164139, right: 177624 },
    startedAt: recovered.abortedAttempts[0].startedAt,
    endedAt: recovered.abortedAttempts[0].endedAt,
    reason: "page-reloaded-before-verdict",
  });
  assert.match(resumed.host.innerHTML, /same matchup will be retried/);
  start(resumed);
  assert.deepEqual(resumed.starts[0], firstLaunch);
});

test("a_saved_row_for_the_wrong_assignment_is_refused", () => {
  const first = harness();
  open(first);
  start(first);
  first.guided.frame(16, 0.016);
  first.guided.completeBout(outcome(), reading(first.starts[0].matchup));
  const corrupted = JSON.parse(storage.get(STORAGE_KEY));
  corrupted.rows[0].cell = "warrior/bow+empty";
  const source = JSON.stringify(corrupted);
  storage.set(STORAGE_KEY, source);

  const resumed = harness();
  open(resumed);
  start(resumed);
  assert.equal(resumed.starts.length, 0);
  assert.equal(storage.get(STORAGE_KEY), source);
  assert.match(resumed.host.innerHTML, /incompatible or incomplete format/);
});

test("a_structurally_incomplete_timing_row_is_refused", () => {
  const first = harness();
  open(first);
  start(first);
  first.guided.frame(16, 0.016);
  first.guided.completeBout(outcome(), reading(first.starts[0].matchup));
  const corrupted = JSON.parse(storage.get(STORAGE_KEY));
  delete corrupted.rows[0].fpsMean;
  const source = JSON.stringify(corrupted);
  storage.set(STORAGE_KEY, source);

  const resumed = harness();
  open(resumed);
  start(resumed);
  assert.equal(resumed.starts.length, 0);
  assert.equal(storage.get(STORAGE_KEY), source);
  assert.match(resumed.host.innerHTML, /incompatible or incomplete format/);
});

test("a_saved_abort_for_the_wrong_assignment_is_refused", () => {
  const interrupted = harness();
  open(interrupted);
  start(interrupted);
  const recovered = harness();
  open(recovered);

  const corrupted = JSON.parse(storage.get(STORAGE_KEY));
  corrupted.aborts[0].actorSide = "right";
  const source = JSON.stringify(corrupted);
  storage.set(STORAGE_KEY, source);

  const resumed = harness();
  open(resumed);
  start(resumed);
  assert.equal(resumed.starts.length, 0);
  assert.equal(storage.get(STORAGE_KEY), source);
  assert.match(resumed.host.innerHTML, /incompatible or incomplete format/);
});

test("a_saved_abort_cannot_claim_a_future_assignment_the_run_never_reached", () => {
  const first = harness(); open(first); start(first);
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  saved.active = null;
  saved.aborts = [{ assignmentIndex: 60, controller: "specialist", cell: "broot/sword+empty",
    actorSide: "right", repeat: 1, excluded: false,
    policySeeds: { left: 133828, right: 147967 }, startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(), reason: "page-reloaded-before-verdict" }];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  const recovered = harness(); open(recovered);
  assert.match(recovered.host.innerHTML, /incompatible or incomplete format/);
  assert.deepEqual(report(recovered).progress, { completed: 0, aborted: 0, total: 61 });
});

test("a_saved_run_refuses_a_competence_label_the_player_could_not_choose", () => {
  const first = harness(); open(first); start(first);
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  saved.active = null;
  saved.competence = "expert-by-corruption";
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  const recovered = harness(); open(recovered);
  assert.match(recovered.host.innerHTML, /incompatible or incomplete format/);
  assert.equal(report(recovered).competence, "");
});

test("the_bout_cap_is_a_workflow_lease_and_is_restored_on_exit", () => {
  CONFIG.bout.capSeconds = 81;
  const fixture = harness();
  open(fixture);
  assert.equal(CONFIG.bout.capSeconds, 81);
  start(fixture);
  assert.equal(CONFIG.bout.capSeconds, 45);
  fixture.guided.completeBout(outcome(), reading(fixture.starts.at(-1).matchup));
  assert.equal(CONFIG.bout.capSeconds, 45, "the lease spans the gaps between assignments");
  fixture.guided.exit();
  assert.equal(CONFIG.bout.capSeconds, 81);
  assert.equal(fixture.exits(), 1);
});

test("manual_pause_is_refused_during_a_guided_bout_and_available_after_it", () => {
  const fixture = harness();
  open(fixture);
  start(fixture);
  assert.equal(fixture.guided.permitManualPause(), false);
  assert.match(alerts.at(-1), /continuous fight/i);
  fixture.guided.completeBout(outcome(), reading(fixture.starts[0].matchup));
  assert.equal(fixture.guided.permitManualPause(), true);
});

test("a_launch_failure_is_an_explicit_abort_and_releases_the_cap", () => {
  CONFIG.bout.capSeconds = 88;
  const host = new FakeElement("gone");
  const launch = new FakeElement();
  const guided = new GuidedPlaytest(host, launch, {
    startBout() { throw new Error("rebuild exploded"); },
    exitToSetup() {},
  });
  launch.fire("click");
  guided.start();
  const captured = guided.report();
  assert.equal(guided.boutIsRunning, false);
  assert.equal(CONFIG.bout.capSeconds, 88);
  assert.deepEqual(captured.progress, { completed: 0, aborted: 1, total: 61 });
  assert.equal(captured.abortedAttempts[0].reason, "launch-failed");
  assert.equal(captured.abortedAttempts[0].detail, "rebuild exploded");
  assert.match(host.innerHTML, /could not start/);
});

test("a_storage_read_failure_opens_a_recoverable_error_panel", () => {
  storageReadError = new Error("storage denied");
  const fixture = harness();
  assert.doesNotThrow(() => open(fixture));
  assert.match(fixture.host.innerHTML, /storage denied/);
  assert.match(fixture.host.innerHTML, /not overwritten/);
  assert.equal(fixture.host.classList.contains("gone"), false);
});

test("every_restart_route_is_refused_while_the_guided_workflow_owns_the_bout", () => {
  const fixture = harness();
  open(fixture);
  assert.equal(fixture.guided.permitRestart(), false);
  assert.match(alerts.at(-1), /Guided playtest is open/i);
  start(fixture);
  assert.equal(fixture.guided.permitRestart(), false);
  assert.match(alerts.at(-1), /still being recorded/i);
  fixture.guided.completeBout(outcome(), reading(fixture.starts[0].matchup));
  fixture.guided.exit();
  assert.equal(fixture.guided.permitRestart(), true);
});

test("an_abort_only_run_is_confirmed_and_archived_before_start_over", () => {
  const interrupted = harness();
  open(interrupted);
  start(interrupted);
  const recovered = harness();
  open(recovered);
  const evidence = storage.get(STORAGE_KEY);

  confirmResponse = false;
  recovered.guided.startOver();
  assert.equal(confirmCalls, 1);
  assert.equal(storage.get(STORAGE_KEY), evidence);
  assert.equal(report(recovered).progress.aborted, 1);

  confirmResponse = true;
  recovered.guided.startOver();
  assert.equal(confirmCalls, 2);
  const archive = [...storage.entries()].find(([key]) => key.startsWith(`${STORAGE_KEY}.archive.`));
  assert.ok(archive);
  assert.equal(archive[1], evidence);
  assert.deepEqual(report(recovered).progress, { completed: 0, aborted: 0, total: 61 });
});

test("capture_refuses_an_instrument_version_other_than_the_pinned_one", () => {
  const fixture = harness();
  open(fixture);
  start(fixture);
  const stale = reading(fixture.starts[0].matchup);
  stale.engagementInstrumentVersion = 2;
  assert.throws(() => fixture.guided.completeBout(outcome(), stale), /expected engagement instrument 1, got 2/);
  assert.equal(fixture.guided.boutIsRunning, true);
  assert.equal(report(fixture).rows.length, 0);
});

test("report_json_preserves_the_never_attacked_gate_sentinel", async () => {
  const fixture = harness();
  open(fixture);
  start(fixture);
  const nonFinite = reading(fixture.starts.at(-1).matchup);
  nonFinite.record.engagement.firstAttackSeconds = null;
  fixture.guided.completeBout(outcome(), nonFinite);
  await fixture.guided.copy();
  const copied = JSON.parse(clipboard.text);
  assert.equal(copied.rows[0].record.engagement.firstAttackSeconds, null);
  const firstAttack = copied.rows[0].gates.find(({ name }) => name === "firstAttackP90Seconds");
  assert.equal(firstAttack.margin, "-Infinity");
  assert.equal(copied.rows[0].gateTable.find(({ name }) => name === "firstAttackP90Seconds").margin,
    "fails: never attacked");
});

test("the_captured_record_derives_the_visible_actor_gate_table", () => {
  const fixture = harness();
  open(fixture);
  start(fixture);
  fixture.guided.frame(16, 0.016);
  fixture.guided.completeBout(outcome(), reading(fixture.starts[0].matchup));
  assert.match(fixture.host.innerHTML, /Actor gate/);
  assert.match(fixture.host.innerHTML, /opportunity attack rate/);
  assert.match(fixture.host.innerHTML, /&gt;= 0\.65/);
  assert.match(fixture.host.innerHTML, /\+0\.05/);
  assert.match(fixture.host.innerHTML, /PASS/);
});

test("a_captured_boundary_row_is_labelled_separately_from_the_next_assignment", () => {
  const fixture = harness();
  open(fixture);
  for (let index = 0; index < 5; index += 1) {
    start(fixture);
    fixture.guided.frame(16, 0.016);
    fixture.guided.completeBout(outcome(), reading(fixture.starts.at(-1).matchup));
  }
  assert.match(fixture.host.innerHTML, /Up next -- You play: Warrior -- sword \+ empty hand/);
  assert.match(fixture.host.innerHTML, /RIGHT side, repeat 1/);
  assert.match(fixture.host.innerHTML, /Captured bout:<\/b> You played, Warrior -- sword \+ empty hand, LEFT side, repeat 4/);
});

test("takeover_is_refused_by_name_while_the_actor_side_is_pinned", () => {
  const fixture = harness();
  open(fixture);
  start(fixture);
  fixture.guided.refuseTakeover();
  assert.match(alerts.at(-1), /Takeover is unavailable.*LEFT actor is pinned/i);
});

test("the_page_wires_the_guided_flow_at_the_real_host_boundaries", async () => {
  const [main, page, style] = await Promise.all([
    readFile(new URL("../src/main.ts", import.meta.url), "utf8"),
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/style.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /id="guided-playtest"/);
  assert.match(page, /id="playtest" class="gone"/);
  assert.match(main, /new GuidedPlaytest\(playtestHost, playtestLaunch,/);
  assert.match(main, /playtest\?\.frame\(rawDeltaMs, dt\)/);
  assert.match(main, /const actorSide = playtest\?\.recordingSide;/);
  assert.match(main, /playtest\.completeBout\(state\.outcome,/);
  assert.match(main, /playtest\.refuseAbandon\(\)/);
  assert.match(main, /const restartBout =[^]*playtest && !playtest\.permitRestart\(\)[^]*restartHost/);
  assert.match(main, /playtest\?\.recordingSide \?\? humanSide\(state\.matchup\) \?\? "left"/);
  assert.match(main, /action === "pause" && playtest && !playtest\.permitManualPause\(\)/);
  assert.match(main, /playtest\.refuseTakeover\(\)/);
  assert.match(main, /beginButton\.addEventListener\("click",[^]*playtest\.refuseWorkflowNavigation\(\)/);
  assert.match(style, /\.playtest-panel\.running\s*{[^}]*pointer-events:\s*none;/);
});
