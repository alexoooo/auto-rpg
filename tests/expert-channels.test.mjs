// The reference expert's use of session 06's channels (`-stance`, `-step` in
// `tests/harness/expert.mjs`), on the odd morphology of `tests/expert.test.mjs`: a three-legged,
// one-armed body against a wheeled head-rammer with no hands.
//
// What is held here:
// - **The ruler is untouched.** Without the channel flags the expert proposes exactly session 05's
//   fifteen plans (sixteen with a warm start), with no stance and no step anywhere, so the headroom verdicts measure the
//   channels against the same ruler. (Its bouts are also trajectory-identical to main:
//   `research/command-null.mjs`.)
// - **The step proposals are in the slots a c8 search evaluates**, and not with `-fb`.
// - **A step segment fixes its point where the plan begins**, on the line from them turned about
//   them, and never inside the two bodies.
// - **A channel expert writes its channels and its rollouts still come true**: with both flags on,
//   the live body is handed step targets and stances, and every decision's predicted end state is
//   the live world's at the next decision -- the step's clock and point are world state the fork
//   carries. Beside it, the control: the ruler on the same bout writes neither.
//
// Mutation checks, each run and each red: a stance on every segment kind (follow and hold too), the
// point recomputed every substep, the collision floor dropped, no step proposals, step proposals
// with `-fb`, the stance proposals on the ruler, the point left out of a program's state, a step
// plan not carrying state, the step or the stance computed and not written, and both slips to one
// side. One edit survives and is equivalent today: not resetting the point at a segment switch,
// since no proposal and no jitter puts a step after another segment.
//
// Harness: the Node bout runner and the fork harness; every world in a Havok instance of its own.
import test from "node:test";
import assert from "node:assert/strict";
import { Logger } from "@babylonjs/core/Misc/logger.js";

import { freshHavok } from "./harness/bout-runner.mjs";
import {
  EXPERT_DEFAULTS, ExpertMind, Program, expertConfig, jitterPlan, keysToward, poseHash, proposals, runExpertBout,
} from "./harness/expert.mjs";
import { freshBodyCommand, setChannelFlags } from "../src/body-command.ts";
import { mulberry32 } from "../src/rng.ts";

Logger.LogLevels = Logger.ErrorLogLevel;

const golem = (locomotion, torso, head, [pc, pt], [sc, st]) => ({ family: "golem", locomotion, torso, head,
  primary: { chain: pc, terminal: pt }, secondary: { chain: sc, terminal: st } });
const TRI = golem("locomotion.multileg", "torso.plain", "head.plain", ["reach", "blade"], ["none", "none"]);
const RAM = golem("locomotion.wheel", "torso.plain", "head.ram", ["none", "none"], ["none", "none"]);
const BASE = { left: "golem-duelist", right: "golem-duelist", seeds: [11, 22], locomotionMode: "supported",
  maxSeconds: 150, leftGolem: TRI, rightGolem: RAM, separation: 2.2 };

/** Session 05's proposals, in order: the ruler every channel is measured against. */
const RULER = ["duelist", "cut-mid", "step-cut", "back-off", "cut-high", "press", "walker", "guard", "cut-back",
  "circle-l", "circle-r", "cut-low", "hold", "duelist-cut", "back-cut"];

const segsOf = (list) => list.flatMap((plan) => plan.segs);

test("the_ruler_proposes_session_05_s_plans_with_no_channel_in_them", () => {
  const hold = freshBodyCommand();
  const ruler = proposals(expertConfig("expert@c8,h1"), { hold, warm: null });
  assert.deepEqual(ruler.map((plan) => plan.label), RULER);
  assert.ok(segsOf(ruler).every((seg) => seg.kind !== "step" && !("st" in seg)), "the ruler carries a channel");
  // Its jitter draws what it drew: a ruler plan's noisy copy has no channel field either.
  const rng = mulberry32(3);
  for (const plan of ruler) {
    assert.ok(segsOf([jitterPlan(plan, rng, 1, expertConfig("expert@c8,h1"))]).every((seg) => !("st" in seg)));
  }
  // The control: the channel experts' lists do differ, so the comparison can fail.
  const stance = proposals(expertConfig("expert-stance@c8,h1"), { hold, warm: null });
  assert.deepEqual(stance.map((plan) => plan.label), RULER);
  const posed = segsOf(stance).filter((seg) => seg.kind === "stroke" || seg.kind === "stance");
  assert.ok(posed.length > 0 && posed.every((seg) => seg.st), "a stroke or a stand of the stance expert has no stance");
  assert.ok(segsOf(stance).filter((seg) => seg.kind === "follow" || seg.kind === "hold").every((seg) => !("st" in seg)),
    "the stance expert posed a plan that follows the ladder or holds a command");
});

test("the_step_proposals_are_in_the_slots_a_c8_search_evaluates_and_not_with_fb", () => {
  const hold = freshBodyCommand();
  const config = expertConfig("expert-step@c8,h1");
  const n1 = config.candidates - Math.floor(config.candidates / 3);
  const head = proposals(config, { hold, warm: null }).slice(0, n1).map((plan) => plan.label);
  assert.deepEqual(head, ["duelist", "cut-mid", "stepin-cut", "step-out", "slip-l", "slip-r"]);
  // Both slips aim at opposite sides of the line.
  const slips = proposals(config, { hold, warm: null }).filter((plan) => plan.label.startsWith("slip"));
  assert.deepEqual(slips.map((plan) => Math.sign(plan.segs[0].a)), [1, -1]);
  // `-fb` keeps its keys: the step expert restricted to forward and back proposes no step.
  const fb = proposals(expertConfig("expert-fb-step@c8,h1"), { hold, warm: null });
  assert.deepEqual(fb.map((plan) => plan.label), RULER);
});

test("the_diagnostic_variants_keep_the_plans_they_claim_to", () => {
  const hold = freshBodyCommand();
  const labels = (name, turn = 0) => proposals(expertConfig(name), { hold, warm: null, turn }).map((plan) => plan.label);
  // `-stepadd` keeps the ruler's head and puts the channel in back-off's and press's slots, one slip a
  // decision, to alternate sides.
  assert.deepEqual(labels("expert-stepadd@c8,h1").slice(0, 6), ["duelist", "cut-mid", "step-cut", "step-out", "cut-high", "slip-l"]);
  assert.deepEqual(labels("expert-stepadd@c8,h1", 1).slice(0, 6), ["duelist", "cut-mid", "step-cut", "step-out", "cut-high", "slip-r"]);
  const sides = [0, 1].map((turn) => proposals(expertConfig("expert-stepadd@c8,h1"), { hold, warm: null, turn })
    .find((plan) => plan.label.startsWith("slip")).segs[0].a);
  assert.ok(sides[0] > 0 && sides[1] < 0, `slips at ${sides}`);
  // `-stepkeys` is `-step`'s list, every step marked for the keys and nothing else changed.
  const step = proposals(expertConfig("expert-step@c8,h1"), { hold, warm: null });
  const keys = proposals(expertConfig("expert-stepkeys@c8,h1"), { hold, warm: null });
  assert.deepEqual(keys.map((plan) => plan.label), step.map((plan) => plan.label));
  assert.deepEqual(keys.map((plan) => plan.segs.map(({ keys: k, ...seg }) => seg)), step.map((plan) => plan.segs));
  assert.ok(segsOf(keys).every((seg) => (seg.kind === "step") === (seg.keys === true)));
  assert.ok(segsOf(step).every((seg) => !("keys" in seg)));
  // `@w` scales every step's time and nothing else.
  const fast = proposals(expertConfig("expert-step@c8,h1,w0.5"), { hold, warm: null });
  const within = (list) => segsOf(list).filter((seg) => seg.kind === "step").map((seg) => seg.within);
  assert.deepEqual(within(fast), within(step).map((w) => 0.5 * w));
});

test("the_keys_control_drives_full_travel_at_the_point_in_the_body_s_frame_and_stops_inside_50_mm", () => {
  const view = (facing) => ({ self: { ground: { x: 1, z: 1 }, facing } });
  const command = freshBodyCommand();
  // Facing +z, a point ahead and to the right: forward and strafe positive, a unit vector.
  keysToward(command, view(0), { x: 2, z: 2 });
  assert.ok(Math.abs(command.gait.forward - Math.SQRT1_2) < 1e-12 && Math.abs(command.gait.strafe - Math.SQRT1_2) < 1e-12);
  // Facing +x the same point is ahead and to the left: both sides of centre.
  keysToward(command, view(Math.PI / 2), { x: 2, z: 2 });
  assert.ok(Math.abs(command.gait.forward - Math.SQRT1_2) < 1e-12 && Math.abs(command.gait.strafe + Math.SQRT1_2) < 1e-12);
  keysToward(command, view(0.3), { x: 1.03, z: 0.97 });
  assert.deepEqual([command.gait.forward, command.gait.strafe], [0, 0]);
});

/** A published view with only what a step point reads. */
const pointView = (self, them, radius = 0.4) => ({
  self: { ground: { x: self[0], z: self[1] }, collisionRadius: radius },
  opponent: { ground: { x: them[0], z: them[1] }, collisionRadius: radius },
});

test("a_step_point_is_fixed_on_the_turned_line_about_them_and_never_inside_them", () => {
  const program = new Program({ label: "t", segs: [], switchAt: 1 });
  const at = (spec, view) => { program.px = Number.NaN; return { ...program.stepTarget(spec, view) }; };
  const close = (a, b) => Math.abs(a - b) < 1e-12;
  // Straight in, to three quarters of 2 m, and the time is the segment's.
  let p = at({ r: 0.75, a: 0, within: 0.4 }, pointView([0, 0], [0, 2]));
  assert.ok(close(p.x, 0) && close(p.z, 0.5) && p.within === 0.4, JSON.stringify(p));
  // A quarter turn either way about them, at the present distance: both sides of centre.
  p = at({ r: 1, a: Math.PI / 2, within: 0.4 }, pointView([0, 0], [0, 2]));
  assert.ok(close(Math.hypot(p.x, p.z - 2), 2) && close(Math.abs(p.x), 2) && close(p.z, 2), JSON.stringify(p));
  const q = at({ r: 1, a: -Math.PI / 2, within: 0.4 }, pointView([0, 0], [0, 2]));
  assert.ok(close(q.x, -p.x) && close(q.z, p.z), `${JSON.stringify(p)} against ${JSON.stringify(q)}`);
  // Never closer than both radii and 0.1 m, off the axes as well.
  p = at({ r: 0.1, a: 0.3, within: 0.4 }, pointView([1, -1], [2.5, 0.2], 0.5));
  assert.ok(close(Math.hypot(p.x - 2.5, p.z - 0.2), 1.1), JSON.stringify(p));
  // Fixed once: the same segment keeps its point while the bodies move.
  program.px = Number.NaN;
  const first = { ...program.stepTarget({ r: 0.75, a: 0, within: 0.4 }, pointView([0, 0], [0, 2])) };
  const later = program.stepTarget({ r: 0.75, a: 0, within: 0.4 }, pointView([0.3, 0.2], [0.5, 2.4]));
  assert.deepEqual({ ...later }, first);
  // And a clone carries it, which is what a warm start's rollout plays: the live program keeps its
  // point, so a clone that fixed a new one would predict a step the live body does not take.
  const clone = program.clone();
  assert.deepEqual({ ...clone.stepTarget({ r: 0.75, a: 0, within: 0.4 }, pointView([0.9, 0.9], [0.5, 2.4])) }, first);
});

test("a_step_plan_under_way_is_offered_as_a_warm_start", () => {
  // A single step segment carries state (its fixed point), so the plan in hand is proposed as it
  // stands; begun afresh it would fix a new point. The control: a plain stand is not.
  const config = expertConfig("expert-step@c8,h1");
  const stepOut = proposals(config, { hold: freshBodyCommand(), warm: null }).find((plan) => plan.label === "step-out");
  const warm = proposals(config, { hold: freshBodyCommand(), warm: new Program(stepOut) });
  assert.equal(warm[1].label, "warm");
  const guard = proposals(config, { hold: freshBodyCommand(), warm: null }).find((plan) => plan.label === "guard");
  assert.ok(!proposals(config, { hold: freshBodyCommand(), warm: new Program(guard) }).some((plan) => plan.label === "warm"));
});

/** An expert that also notes the live world's pose and bars each time a decision falls due. */
class Witnessed extends ExpertMind {
  constructor(config, seed) { super(config, seed); this.seen = []; }
  prepare(host) {
    const due = super.prepare(host);
    if (due) {
      const E = host.side, O = E === "left" ? "right" : "left";
      this.seen.push({ pose: poseHash(host.live), vE: host.live[E].vitality, vO: host.live[O].vitality });
    }
    return due;
  }
  checks() {
    const rows = [];
    for (let k = 0; k + 1 < this.seen.length && k < this.log.length; k += 1) {
      const predicted = this.log[k].predicted, seen = this.seen[k + 1];
      rows.push({ pose: predicted.pose === seen.pose, bars: predicted.vE === seen.vE && predicted.vO === seen.vO });
    }
    return rows;
  }
}

/** A small search that keeps its predictions: six candidates, so the step plans are all in the round. */
const PLUMB = { ...EXPERT_DEFAULTS, candidates: 6, rounds: 1, horizon: 0.5, decisionHz: 2, reseed: false, trace: true };

async function channelBout(config) {
  const expert = new Witnessed(config, 5);
  const applied = { steps: 0, stances: 0, frames: 0 };
  await runExpertBout({ ...BASE, maxSeconds: 3.1, physics: await freshHavok() }, { experts: { left: expert },
    onFrame: (bout) => {
      const held = bout.left.control.driver.held;
      applied.frames += 1;
      if (held?.gait.step) applied.steps += 1;
      const s = held?.gait.stance;
      if (s && (s.width !== 0 || s.lead !== 0 || s.weight !== 0)) applied.stances += 1;
    } });
  return { applied, checks: expert.checks(), labels: expert.log.map((entry) => entry.label) };
}

test("a_channel_expert_writes_its_channels_and_its_rollouts_come_true", async () => {
  const previous = setChannelFlags({ stance: true, step: true });
  try {
    const channel = await channelBout({ ...PLUMB, stance: true, step: true });
    assert.ok(channel.checks.length >= 4, `only ${channel.checks.length} decisions were checked`);
    assert.deepEqual(channel.checks, channel.checks.map(() => ({ pose: true, bars: true })),
      `a predicted state did not come true (${channel.labels.join(", ")})`);
    assert.ok(channel.applied.steps > 0, `no step target was applied (${channel.labels.join(", ")})`);
    assert.ok(channel.applied.stances > 0, `no stance was applied (${channel.labels.join(", ")})`);
    // The control: the ruler on the same bodies, flags and bout writes neither channel.
    const ruler = await channelBout(PLUMB);
    assert.deepEqual([ruler.applied.steps, ruler.applied.stances], [0, 0]);
    assert.ok(ruler.applied.frames > 0);
  } finally { setChannelFlags(previous); }
});
