import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { compareRecords } from "../src/evaluation/record-comparison.ts";
import { recordIdentity, recordedSubject, recordText, readRecord } from "../src/evaluation/record.ts";
import { CONTEST_FIGURES } from "../src/evaluation/contest.ts";
import { sourceContext } from "../scripts/compare-evaluations.mjs";

test("the combat field expands and constructs legal loadouts beyond the representative set", async () => {
  const { SKELETON_COMBAT } = await import("../src/evaluation/skeleton-combat/index.ts");
  const { entrantSubjects } = await import("../src/evaluation/tournament/entrants.ts");
  const { LOADOUTS, REPRESENTATIVE, loadoutKey } = await import("../src/core/items/held.ts");
  const { MINDS } = await import("../src/core/mind/controllers.ts");
  const { modelRefusal } = await import("../src/core/models.ts");
  const { FIGHT_ENTRY } = await import("../src/core/mind/catalog.ts");
  const { subjectIdsOf } = await import("../scripts/evaluation-subjects.mjs");
  const preset = MINDS["vanguard-warrior"], model = preset.models[0];
  const expected = LOADOUTS.filter((loadout) => modelRefusal(model, preset.config, loadout, FIGHT_ENTRY, preset.character) === null);
  const rated = new Set(REPRESENTATIVE.map(loadoutKey));
  assert.ok(expected.some((loadout) => !rated.has(loadoutKey(loadout))), "fixture admits no unrated loadout");
  const entrants = SKELETON_COMBAT.subjects(["vanguard-warrior"]);
  assert.deepEqual(entrants.map((one) => one.value.loadout), expected);
  assert.deepEqual(entrantSubjects(["vanguard-warrior"]).map((one) => one.value.loadout),
    REPRESENTATIVE.filter((loadout) => modelRefusal(model, preset.config, loadout, FIGHT_ENTRY, preset.character) === null));
  const own = SKELETON_COMBAT.subjects(["option-skeleton"])[0];
  for (const foe of entrants) {
    assert.deepEqual(subjectIdsOf(`puncher,${foe.id},duellist`), ["puncher", foe.id, "duellist"]);
    assert.deepEqual(SKELETON_COMBAT.subjects(subjectIdsOf(foe.id)), [foe]);
    const world = SKELETON_COMBAT.protocols.standard.world([own.value, foe.value], { gap: 4 }, "rapier-coordinate", [own.character ?? {}, foe.character ?? {}]);
    assert.deepEqual(world.recipe.loadouts, { left: own.value.loadout, right: foe.value.loadout });
    assert.deepEqual(world.recipe.minds, { left: own.value.mind, right: foe.value.mind });
    assert.deepEqual([world.recipe.left, world.recipe.right], [own.value.model, foe.value.model]);
  }
});

const hash = digit => `sha256:${digit.repeat(64)}`;
const commit = digit => digit.repeat(40);
const suffix = "/workshop-fighter/empty,empty";
const play = { gap: 4, capSeconds: 120 }, environment = hash("e");

/** Synthetic recorded outcomes isolate evidence matching from physics and performance. */
function fixture({ id = "vanguard-warrior", code = hash("1"), config = 1, score = 0, opponentCode = hash("3"), battery = false } = {}) {
  const own = { kind: "vanguard", experiment: config }, value = { mind: own, model: "workshop-fighter", loadout: { left: "empty", right: "empty" } };
  const subject = recordedSubject({ id: id + suffix, label: id, value,
    parts: [{ id: `mind:${id}`, value: own }, { id: "model:workshop-fighter", value: { mass: 80 } }] }, play, environment, null,
  parts => parts.some(part => part.id.startsWith("mind:")) ? code : null);
  const foe = recordedSubject({ id: "counter" + suffix, label: "counter", value: { kind: "fighter" },
    parts: [{ id: "mind:counter", value: { kind: "fighter" } }] }, play, environment, null, () => opponentCode);
  const header = { identity: recordIdentity(hash("a"), "rapier-coordinate", "Node 120 Hz", play), evaluation: "tournament", protocol: "standard",
    play, engine: "rapier-coordinate", harness: "Node 120 Hz", commit: commit("a"), date: "2026-10-23", schedule: "fixture",
    pool: { protocol: subject.version.protocol, environment }, subjects: battery ? [subject] : [subject, foe] };
  const lines = (battery ? [0] : [0, 1]).map(seat => ({ key: `${id}/${code}/${config}/${seat}`, code, condition: { gap: 4 },
    subjects: battery ? [subject.id] : seat === 0 ? [subject.id, foe.id] : [foe.id, subject.id],
    world: { kind: "bout", engine: "rapier-coordinate", tape: [], recipe: { level: "open", gap: 4,
      left: "workshop-fighter", right: "workshop-fighter", minds: seat === 0 ? { left: own, right: foe.value } : { left: foe.value, right: own } } },
    reading: { score: seat === 0 ? score : 1 - score, margin: 0, winner: score === .5 ? null : (score === 1) === (seat === 0) ? "left" : "right",
      ending: "time", seconds: 120, blows: 0, bars: [1, 1] }, digest: `${id}/${seat}`, fault: null }));
  return { name: `${id}.jsonl`, header, lines };
}

const compare = (a, b, previous = "vanguard-warrior") => compareRecords(a, b, "vanguard-warrior", previous, CONTEST_FIGURES, []);

test("historical configuration and source changes compare saved complete pairs without modifying either record", () => {
  for (const change of [{ config: 2 }, { code: hash("2") }]) {
    const baseline = fixture(), candidate = fixture({ ...change, score: 1 }), before = structuredClone([baseline, candidate]);
    const result = compare(baseline, candidate);
    assert.deepEqual(result.context, []);
    assert.deepEqual(result.figures.find(figure => figure.figure === "score"), { figure: "score", unit: "a win 1, a draw a half", better: "higher", pairs: 1,
      baseline: { value: 0, low: 0, high: 0 }, candidate: { value: 1, low: 1, high: 1 }, difference: { value: 1, low: 1, high: 1 } });
    assert.deepEqual(result.pairs, [{ baseline: { subject: baseline.header.subjects[0].id, opponent: baseline.header.subjects[1].id,
      version: baseline.header.subjects[0].version.version, opponentVersion: baseline.header.subjects[1].version.version,
      condition: { gap: 4 }, keys: baseline.lines.map(line => line.key) }, candidate: { subject: candidate.header.subjects[0].id,
      version: candidate.header.subjects[0].version.version, opponentVersion: candidate.header.subjects[1].version.version,
      opponent: candidate.header.subjects[1].id, condition: { gap: 4 }, keys: candidate.lines.map(line => line.key) } }]);
    assert.deepEqual([baseline, candidate], before);
  }
  const renamed = fixture({ id: "old-vanguard" });
  assert.equal(compare(renamed, fixture({ score: 1 }), "old-vanguard").coverage.paired, 1);
});

test("missing sides, faults, changed opponents and fixed parts cannot silently contribute paired evidence", () => {
  const baseline = fixture(), candidate = fixture({ score: 1 });
  candidate.lines.pop();
  const partial = compare(baseline, candidate);
  assert.equal(partial.coverage.paired, 0);
  assert.deepEqual(partial.coverage.candidate.incomplete, partial.coverage.candidate.unmatched);
  assert.deepEqual(partial.figures.map(figure => figure.difference), [null, null, null]);
  const faulted = fixture(); faulted.lines[1] = { ...faulted.lines[1], reading: null, fault: { kind: "error", message: "fixture failed" } };
  const faults = compare(baseline, faulted);
  assert.equal(faults.coverage.paired, 0);
  assert.deepEqual(faults.coverage.candidate.faults[0].faults, [{ key: faulted.lines[1].key, kind: "error", message: "fixture failed" }]);
  for (const changed of [fixture({ opponentCode: hash("4") }), fixture()]) {
    if (changed.header.subjects[1].version.code === hash("3")) changed.header.subjects[0].parts[1].version.own = "another-body";
    const result = compare(baseline, changed);
    assert.equal(result.coverage.paired, 0);
    assert.equal(result.coverage.baseline.unmatched.length, 1);
    assert.equal(result.coverage.candidate.unmatched.length, 1);
  }
  const duplicate = fixture(); duplicate.lines.push({ ...duplicate.lines[0], key: "conflicting-key" });
  assert.throws(() => compare(baseline, duplicate), /duplicate evidence differs/);
  const internal = fixture();
  const otherEntrant = { ...internal.header.subjects[0], id: "vanguard-warrior/workshop-rogue/empty,empty" };
  internal.header.subjects.push(otherEntrant);
  internal.lines.push({ ...internal.lines[0], key: "within-family", subjects: [internal.header.subjects[0].id, otherEntrant.id] });
  const withoutInternal = compare(internal, fixture());
  assert.equal(withoutInternal.coverage.paired, 1);
  assert.deepEqual(withoutInternal.coverage.baseline.withinSubject, ["within-family"], "a changing family is not its own fixed opponent");
});

test("batteries pair individual conditions and changed or unknown context labels historical differences", () => {
  const baseline = fixture({ battery: true }), candidate = fixture({ battery: true, score: 1 });
  const result = compare(baseline, candidate);
  assert.equal(result.coverage.paired, 1);
  assert.deepEqual(result.figures[0].difference, { value: 1, low: 1, high: 1 });
  for (const [change, reason] of [
    [record => { record.header.engine = "another-engine"; }, "engine differs"],
    [record => { record.header.play = { capSeconds: 60 }; }, "physical protocol differs"],
    [record => { record.header.pool.environment = hash("f"); }, "protocol or shared environment identity differs"],
    [record => { delete record.header.subjects[0].version.code; }, "a selected subject or opponent has no recorded configuration or code identity"],
    [record => { record.header.imported = {}; }, "imported evidence has incomplete provenance"],
    [record => { record.lines[0].world.recipe.gap = 8; }, `physical recipe differs: vanguard-warrior${suffix}, {"gap":4}, seat 0`],
  ]) {
    const changed = structuredClone(candidate); change(changed);
    const report = compare(baseline, changed);
    assert.ok(report.context.includes(reason));
    assert.equal(report.coverage.paired, 1, "available descriptive evidence is retained with its context qualification");
  }
  const invalid = fixture({ battery: true }); invalid.lines[0].reading.score = "not a number";
  assert.throws(() => compare(baseline, invalid), /has no finite figure/);
  const tuning = [fixture({ battery: true }), fixture({ battery: true, score: 1 })];
  tuning.forEach((record, index) => {
    const subject = record.header.subjects[0];
    subject.value = index ? { gain: 2 } : {};
    subject.parts = [{ ...subject.parts[0], id: "tuning:settings" }];
    delete subject.version.code;
    record.lines[0].world.recipe.minds.left = { kind: "fighter", executors: [{ kind: "blade-cut", ...(index ? { tuning: subject.value } : {}) }] };
  });
  assert.deepEqual(compare(...tuning).context, [], "a data-only tuning has no independent policy code identity");
});

test("Git provenance classifies entrant changes and shared inputs without checking out source", () => {
  const baseline = fixture(), candidate = fixture({ code: hash("2") }); candidate.header.commit = commit("b");
  const calls = [], runGit = (...args) => { calls.push(args); return args[0] === "diff" ? [
    "src/core/entrants/vanguard/plan.ts", "assets/entrants/vanguard/weights.json", "docs/reference/vanguard.md", "assets/evaluations/tournament/kept.jsonl",
  ].join("\0") + "\0" : ""; };
  assert.deepEqual(sourceContext(baseline, candidate, "vanguard-warrior", "vanguard-warrior", runGit), []);
  assert.deepEqual(calls.map(call => call[0]), ["cat-file", "cat-file", "diff"]);
  assert.deepEqual(sourceContext(baseline, candidate, "vanguard-warrior", "vanguard-warrior",
    (...args) => args[0] === "diff" ? "src/core/world.ts\0vendor/rapier/old.wasm\0" : ""),
  ["shared runtime input changed: src/core/world.ts", "shared runtime input changed: vendor/rapier/old.wasm"]);
  assert.match(sourceContext(baseline, candidate, "vanguard-warrior", "vanguard-warrior", () => { throw new Error("missing"); })[0], /unavailable/);
  candidate.header.commit = "unknown";
  assert.deepEqual(sourceContext(baseline, candidate, "vanguard-warrior", "vanguard-warrior", () => assert.fail("unknown commits cannot reach Git")), ["recorded Git provenance is unknown"]);
});

test("the CLI reads kept records, emits the comparison and leaves its inputs and directory unchanged", () => {
  const base = resolve(".tmp/vanguard-safeguards"); mkdirSync(base, { recursive: true });
  const directory = mkdtempSync(join(base, "records-"));
  try {
    const files = ["baseline.jsonl", "candidate.jsonl"].map(name => join(directory, name));
    const records = [fixture(), fixture({ score: 1, code: hash("2") })];
    const texts = records.map(record => recordText(record.header, record.lines));
    files.forEach((file, index) => writeFileSync(file, texts[index]));
    const before = readdirSync(directory);
    const output = execFileSync(process.execPath, ["scripts/compare-evaluations.mjs", ...files, "--subject", "vanguard-warrior", "--json"], { encoding: "utf8" });
    const report = JSON.parse(output);
    assert.equal(report.coverage.paired, 1);
    assert.equal(report.figures[0].difference.value, 1);
    assert.ok(report.context.some(reason => reason.includes("unavailable")));
    assert.deepEqual(files.map(file => readFileSync(file, "utf8")), texts);
    assert.deepEqual(readdirSync(directory), before);
    assert.deepEqual(records.map((record, index) => readRecord(texts[index], record.name)), records.map(({ header, lines }) => ({ header, lines })));
  } finally {
    assert.ok(directory.startsWith(base + "\\") || directory.startsWith(base + "/"));
    rmSync(directory, { recursive: true, force: true });
  }
});
