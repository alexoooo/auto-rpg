// The reference expert (skill ceiling session 04, `docs/plans/2026-09-25-skill-ceiling-04-expert.md`),
// on the odd morphology: a three-legged, one-armed body against a wheeled head-rammer with no hands.
//
// What is held here:
// - **A rollout is the future it predicts.** With the opponent's dice left alone, every decision's
//   predicted end state (both bars and every part's pose, hashed from its bytes) is the live world's
//   state at the next decision, in a bout and in a drill's rung world. It is the property the whole
//   search rests on: a plan scored in a fork is the plan the live body then plays. Beside it, the
//   control: with the persistence model in the opponent's place, the predictions do not all come
//   true, so the comparison can fail. (Restarting the duelist's dice is not a control: it draws
//   only on a few state changes, and over these seconds it drew nothing that changed a pose.)
// - **A reused fork is a fresh fork.** One kept fork world restored for every candidate chooses and
//   predicts exactly what a fresh exact fork per candidate does.
// - **Names parse to searches** and a bad name is refused rather than run as a default.
// - **The expert beats idle** on the odd pair: it empties the idle body's bar and loses none.
//
// Mutation checks, each run and each red: the shadows not restored into a rollout, a capture
// without Havok's heap (the teleport fork), a reused fork not restored, and the search keeping the
// worst plan. Two edits survive and are equivalent here: not cloning a warm plan (the moment already
// holds a clone, and only one rollout of a fresh moment plays it) and the drill host's range feed
// (no drill reads it inside a rung; see `drillHost`).
//
// Harness: the Node bout runner, the fork harness and the drill runner; every world in a Havok
// instance of its own.
import test from "node:test";
import assert from "node:assert/strict";
import { Logger } from "@babylonjs/core/Misc/logger.js";

import { createBout, freshHavok } from "./harness/bout-runner.mjs";
import { runDrill } from "./harness/drills.mjs";
import {
  EXPERT_DEFAULTS, ExpertMind, boutHost, expertConfig, poseHash, runExpertBout,
} from "./harness/expert.mjs";

Logger.LogLevels = Logger.ErrorLogLevel;

const golem = (locomotion, torso, head, [pc, pt], [sc, st]) => ({ family: "golem", locomotion, torso, head,
  primary: { chain: pc, terminal: pt }, secondary: { chain: sc, terminal: st } });
/** Three legs and one bladed arm (as in `tests/drills.test.mjs`). */
const TRI = golem("locomotion.multileg", "torso.plain", "head.plain", ["reach", "blade"], ["none", "none"]);
/** A wheeled head-rammer with no hands. */
const RAM = golem("locomotion.wheel", "torso.plain", "head.ram", ["none", "none"], ["none", "none"]);

/** A small, cheap search that keeps its predictions, over the opponent's actual dice unless told. */
const PLUMB = { ...EXPERT_DEFAULTS, candidates: 3, rounds: 1, horizon: 0.5, decisionHz: 2, reseed: false, trace: true };

/** An expert that also notes the live world's pose and bars each time a decision falls due. */
class Witnessed extends ExpertMind {
  constructor(config, seed) { super(config, seed); this.seen = []; }
  async beforeFrame(host) {
    if (host.live.clock + 1e-9 >= this.next) {
      const E = host.side, O = E === "left" ? "right" : "left";
      this.seen.push({ pose: poseHash(host.live), vE: host.live[E].vitality, vO: host.live[O].vitality });
    }
    return super.beforeFrame(host);
  }
  /** Each decision's prediction against what the live world then held, one row a decision. */
  checks() {
    const rows = [];
    for (let k = 0; k + 1 < this.seen.length && k < this.log.length; k += 1) {
      const predicted = this.log[k].predicted, seen = this.seen[k + 1];
      rows.push({ pose: predicted.pose === seen.pose, bars: predicted.vE === seen.vE && predicted.vO === seen.vO });
    }
    return rows;
  }
}

const BASE = { left: "golem-duelist", right: "golem-duelist", seeds: [11, 22], locomotionMode: "supported",
  maxSeconds: 150, leftGolem: TRI, rightGolem: RAM, separation: 2.2 };

/** A bout with the expert on the left for `seconds`, its search awaited before every frame. */
async function witnessBout(config, seconds) {
  const expert = new Witnessed(config, 5);
  const bout = createBout({ ...BASE, leftMind: expert, physics: await freshHavok() });
  try {
    const host = boutHost(bout, BASE, "left");
    while (bout.active && bout.clock < seconds) {
      await expert.beforeFrame(host);
      bout.step();
    }
    return { checks: expert.checks(), log: expert.log, builds: expert.pool?.builds ?? 0 };
  } finally {
    expert.dispose();
    bout.dispose();
  }
}

test("a_rollout_is_the_future_it_predicts_in_a_bout", async () => {
  const { checks } = await witnessBout(PLUMB, 2.6);
  assert.ok(checks.length >= 4, `only ${checks.length} decisions were checked`);
  assert.deepEqual(checks, checks.map(() => ({ pose: true, bars: true })), "a predicted state did not come true");

  // The control: put the persistence model in the opponent's place and the predictions are of a
  // future the live world does not play, so the same comparison reports it.
  const control = await witnessBout({ ...PLUMB, opponent: "persistence" }, 2.6);
  assert.ok(control.checks.some((row) => !row.pose), "a modelled opponent still predicted every pose: the check cannot fail");
});

test("a_rollout_is_the_future_it_predicts_in_a_drill_rung", async () => {
  // The rammer as the subject of survive-cut, against the one-armed body cutting: the rung is one
  // second long, so the decisions come four times a second over a quarter-second horizon.
  let expert = null;
  const config = { ...PLUMB, decisionHz: 4, horizon: 0.25 };
  const run = await runDrill({ drill: "survive-cut", subjectSetup: RAM, opponentSetup: TRI, seed: 500,
    rungs: ["plumb"], rungFactory: (rung, seed) => (rung === "plumb" ? (expert = new Witnessed(config, seed)) : null) });
  assert.ok(run.rungs?.plumb, `the drill did not play the rung: ${JSON.stringify(run)}`);
  const checks = expert.checks();
  assert.ok(checks.length >= 3, `only ${checks.length} decisions were checked`);
  assert.deepEqual(checks, checks.map(() => ({ pose: true, bars: true })), "a predicted state did not come true");
  assert.equal(run.rungs.plumb.planner.decisions, expert.log.length, "the rung did not keep the planner's summary");
});

test("a_reused_fork_is_a_fresh_fork", async () => {
  const reused = await witnessBout(PLUMB, 2.1);
  const fresh = await witnessBout({ ...PLUMB, reuse: false }, 2.1);
  const strip = (log) => log.map(({ ms, ...entry }) => entry);
  assert.deepEqual(strip(reused.log), strip(fresh.log));
  assert.ok(reused.builds < fresh.builds, `reuse built ${reused.builds} worlds and fresh ${fresh.builds}`);
});

test("an_expert_name_parses_to_its_search_and_a_bad_one_is_refused", () => {
  assert.equal(expertConfig("golem-duelist"), null);
  assert.deepEqual(expertConfig("expert"), { ...EXPERT_DEFAULTS, weights: { ...EXPERT_DEFAULTS.weights } });
  const named = expertConfig("expert-persist-blind-fresh@c8,h0.5,r1,d2,s3");
  assert.deepEqual(
    { ...named, weights: undefined },
    { ...EXPERT_DEFAULTS, weights: undefined, opponent: "persistence", stale: 3, reuse: false,
      candidates: 8, horizon: 0.5, rounds: 1, decisionHz: 2 });
  assert.equal(expertConfig("expert-blind").stale, 4);
  for (const bad of ["expert-psychic", "expert@c", "expert@x3", "expert@c0", "expert@h0"]) {
    assert.throws(() => expertConfig(bad), /expert:/, bad);
  }
});

test("the_expert_beats_idle_on_the_odd_pair", async () => {
  const config = { ...EXPERT_DEFAULTS, candidates: 4, rounds: 1, horizon: 0.75, decisionHz: 2 };
  const { vitality, result, expert } = await runExpertBout(
    { ...BASE, right: "idle", maxSeconds: 8, physics: await freshHavok() },
    { side: "left", expert: new ExpertMind(config, 9) });
  const [mine, theirs] = vitality;
  assert.equal(mine, 1, "the expert lost bar to an idle body");
  assert.equal(result.winner, "left", `the idle body kept ${theirs} of its bar through 8 s`);
  assert.ok(expert.decisions >= 4, `only ${expert.decisions} decisions`);
});
