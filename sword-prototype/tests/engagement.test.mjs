import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJson } from "../src/learning/artifact.ts";
import { GATE_CONTRACT, RESEARCH_GATE_NAMES, engagementGates, engagementMetrics,
  formatEngagementGateTable, gatePassed } from "../src/learning/gates.ts";
import { assessTournamentCandidate } from "../src/learning/tournament.ts";
import { tacticCountKey } from "../src/options.ts";
import { engagementGates as ledgerEngagementGates } from "../scripts/research-ledger.mjs";
import { measureEngagement, parseEngagementArgs, runMeasureEngagementCli } from "../scripts/measure-engagement.mjs";

const key = (movement, action, effector = "primary", target = "vital", stance = "action-default") =>
  tacticCountKey({ movement, action, effector, target, stance });
const safety = { finiteAnatomical: true, capabilities: true, postVerdict: true, stuckActions: true, lifecycle: true };
const candidate = (opportunityAttackRate) => ({ name: "gate-probe", algorithm: "dagger", artifactBytes: 1,
  meanScore: 1, confidenceLow: 1, scriptedScore: 0, randomScore: 0, safety,
  cells: [{ name: "warrior/sword+empty", meaningfulEngagement: 1, opportunityAttackRate,
    attackContactRate: 1, nearRangeStallShare: 0, firstAttackP90Seconds: 1,
    symmetricTimeCapRate: 0, score: 1, specialistScore: 1 }],
  tacticCounts: { [key("close", "cut")]: 10, [key("hold", "cover", "secondary", "threat")]: 10,
    [key("circle-left", "thrust", "primary", "high", "slip-left")]: 10 },
  freeChoiceCounts: { effector: {} }, persistenceCounts: { bins: { "0.40": 30 }, freeBins: {} } });

test("the_gate_table_formatter_is_shared_by_page_and_report", () => {
  assert.equal(ledgerEngagementGates, engagementGates, "the ledger re-exports the browser-safe formatter");
  const rows = engagementGates({ opportunityAttackRate: 0.649, attackContactRate: 0.201,
    nearRangeStallShare: 0.1, firstAttackP90Seconds: 2, symmetricTimeCapRate: 0.05,
    specialistGap: 0.1, minimumActionShare: 0.09, diverseActions: 3 });
  assert.deepEqual(rows.map((row) => row.name), [...RESEARCH_GATE_NAMES]);
  assert.deepEqual(rows.map((row) => row.status === "measured" ? [row.threshold, row.comparison] : null),
    RESEARCH_GATE_NAMES.map((name) => [...GATE_CONTRACT[name]]));
  const missed = rows.find((row) => row.name === "opportunityAttackRate");
  assert.ok(Math.abs(missed.margin - (-0.001)) < 1e-12, `signed margin was ${missed.margin}`);
  const display = formatEngagementGateTable(rows);
  assert.equal(display[0].margin, "-0.001");
  assert.equal(display[1].margin, "+0.001");
  const neverAttacked = engagementGates(engagementMetrics({ viableOpportunities: 1, attacksInWindow: 0,
    damagingContactsInWindow: 0, firstAttackSeconds: null, nearRangeStallSeconds: 0,
    longestProgressDroughtSeconds: 0, radialClosingMetres: 0, tangentialTravelMetres: 0,
    accumulatedBearingRadians: 0, retreatOutsideReachSeconds: 0 }, 10));
  assert.equal(neverAttacked[3].value, "Infinity", "the wire sentinel remains stable");
  assert.equal(neverAttacked[3].margin, "-Infinity", "the wire margin remains stable");
  const humanNeverAttacked = formatEngagementGateTable(neverAttacked);
  assert.equal(humanNeverAttacked[3].achieved, "never attacked");
  assert.equal(humanNeverAttacked[3].margin, "fails: never attacked");
  assert.doesNotMatch(canonicalJson(humanNeverAttacked), /Infinity/);
  assert.deepEqual(assessTournamentCandidate(candidate(0.649)).failures,
    ["warrior/sword+empty: opportunity attack rate below 0.65"]);
  assert.deepEqual(assessTournamentCandidate(candidate(0.651)).failures, []);
  const specialistBoundary = engagementGates({ specialistGap: 1 - 0.85 })
    .find((row) => row.name === "specialistGap");
  assert.equal(specialistBoundary.margin, -2.7755575615628914e-17);
  assert.equal(gatePassed(specialistBoundary), true);
  assert.equal(formatEngagementGateTable([specialistBoundary])[0].passed, true);
  const boundaryCandidate = candidate(0.651);
  boundaryCandidate.cells[0].score = 0.85;
  boundaryCandidate.cells[0].specialistScore = 1;
  assert.deepEqual(assessTournamentCandidate(boundaryCandidate).failures, []);
});

test("the_engagement_bench_uses_the_tournament_specialist_for_each_named_cell", async () => {
  const config = parseEngagementArgs(["--cells", "warrior/bow+empty,centipede/natural:bite", "--split", "validation"]);
  const calls = [];
  const run = async (job, makeMind, solverSteps) => { calls.push({ job, mind: makeMind().name, solverSteps });
    return { result: { seconds: 10 }, engagement: { viableOpportunities: 10, attacksInWindow: 7,
      damagingContactsInWindow: 2, firstAttackSeconds: job.actorSide === "left" ? 1 : null,
      nearRangeStallSeconds: 0.5 } }; };
  const report = await measureEngagement(config, run);
  assert.equal(report.harness, "bench/runResearchBout");
  assert.equal(report.engagementInstrumentVersion, 1);
  assert.deepEqual(report.provenance, { harness: "bench/runResearchBout", instrument: "engagement-gates",
    engagementInstrumentVersion: 1, controller: "specialist", split: "validation", seed: 310013 });
  assert.equal(report.rows.length, 4, "two named cells run both mirrors and only the specialist opponent");
  assert.deepEqual(calls.map((call) => [call.job.unit, call.job.loadout, call.job.opponent, call.mind]), [
    ["warrior", "bow+empty", "specialist", "archer"], ["warrior", "bow+empty", "specialist", "archer"],
    ["centipede", "natural:bite", "specialist", "crawler"], ["centipede", "natural:bite", "specialist", "crawler"],
  ]);
  assert.ok(calls.every((call) => call.solverSteps === 45 * 240));
  assert.deepEqual(report.engagement, { opportunities: 40, attacksInWindow: 28, contactsInWindow: 8,
    nearRangeStallSeconds: 2, seconds: 40, firstAttackSeconds: [1, null, 1, null] });
  assert.deepEqual(report.gates.slice(0, 4).map((gate) => [gate.name, gate.value]), [
    ["opportunityAttackRate", 0.7], ["attackContactRate", 8 / 28],
    ["nearRangeStallShare", 0.05], ["firstAttackP90Seconds", "Infinity"],
  ]);
  assert.equal(report.gateTable[3].achieved, "never attacked");
  assert.doesNotMatch(canonicalJson(report.gateTable), /Infinity/);
  const written = []; const fromCli = await runMeasureEngagementCli(
    ["--cells", "centipede/natural:bite", "--mirror", "left", "--seed", "777"],
    { write: (text) => written.push(text) }, run);
  assert.deepEqual(written, [`${canonicalJson(fromCli)}\n`]);
  assert.equal(fromCli.seed, 777);
  assert.equal(fromCli.rows.length, 1);
  assert.equal(fromCli.rows[0].actorSide, "left");
  assert.equal(fromCli.rows[0].policy, "crawler");
});

test("the_engagement_bench_refuses_to_open_the_held_out_split_or_substitute_a_cell", async () => {
  assert.throws(() => parseEngagementArgs(["--cells", "warrior/sword+empty", "--split", "test"]),
    /held-out test split stays closed/);
  assert.throws(() => parseEngagementArgs([]), /requires --cells/);
  const config = parseEngagementArgs(["--cells", "warrior/not-a-loadout"]);
  await assert.rejects(() => measureEngagement(config, async () => null),
    /has no research cell "warrior\/not-a-loadout"/);
});
