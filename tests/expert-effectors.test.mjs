// Node bout runner and exact forks. Test fixtures start from a live human publication;
// a lost hand or a removed declaration is the only alteration made to that publication.
import test from "node:test";
import assert from "node:assert/strict";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBout, freshHavok } from "./harness/bout-runner.mjs";
import { captureBout, exactFork } from "./harness/fork.mjs";
import { ExpertMind, Program, expertConfig, jitterPlan, poseHash, proposals, runExpertBout } from "./harness/expert.mjs";
import { freshBodyCommand, setChannelFlags } from "../src/body-command.ts";
import { humanSetup } from "../src/golem/humanoid/presets.ts";
import { mulberry32 } from "../src/rng.ts";
import { behaviourReader } from "../research/headroom-worker.mjs";
import { EXPERIMENTS, runFlags } from "../research/headroom.mjs";

Logger.LogLevels = Logger.ErrorLogLevel;
const config = expertConfig("expert-effector@c8,h1");
const plans = (cfg = config, turn = 0, warm = null) => proposals(cfg, { hold: freshBodyCommand(), warm, turn });
const targetPlan = (label = "target-sweep", turn = 0) => plans(config, turn).find(p => p.label === label);
const OPTIONS = { left: "idle", right: "idle", leftGolem: humanSetup("blade", "fist"),
  rightGolem: humanSetup("blade", "plate"), seeds: [11, 22], separation: 2.2, locomotionMode: "supported", maxSeconds: 10 };

test("task proposals fit the short search without changing the ruler or its random stream", () => {
  const ruler = plans(expertConfig("expert@c8,h1"));
  const proposed = plans();
  assert.deepEqual(proposed.slice(0, 6).map(p => p.label),
    ["duelist", "cut-mid", "step-cut", "target-sweep", "target-point", "target-soft"]);
  assert.deepEqual(proposed.filter(p => !p.label.startsWith("target-")), ruler);
  assert.ok(ruler.every(p => p.segs.every(s => s.kind !== "target")));
  assert.equal(targetPlan().segs[0].hand, "primary");
  assert.equal(targetPlan("target-sweep", 1).segs[0].hand, "secondary");
  const combined = plans(expertConfig("expert-effector-step-stance@c8,h1"));
  assert.ok(combined.some(p => p.label === "target-sweep") && combined.some(p => p.label === "step-out"));
  // No new RNG draws for an old plan, even in the channel-enabled search.
  assert.deepEqual(jitterPlan(ruler[1], mulberry32(7), 1, config),
    jitterPlan(ruler[1], mulberry32(7), 1, expertConfig("expert@c8,h1")));
  const original = targetPlan("target-soft");
  const mutations = Array.from({ length: 20 }, (_, seed) => jitterPlan(original, mulberry32(seed), 1, config));
  for (const key of ["speed", "force", "roll", "sweep", "sweepTo", "tilt", "duration", "retract", "extend"]) {
    assert.ok(mutations.some(mutated => mutated.segs[0][key] !== original.segs[0][key]), `${key} never explored`);
  }
  for (let seed = 0; seed < 50; seed++) {
    const seg = jitterPlan(original, mulberry32(seed), 10, config).segs[0];
    assert.ok(seg.speed >= .1 && seg.speed <= 1 && seg.force >= .1 && seg.force <= 1);
    assert.ok(seg.sweepTo >= -.5 && seg.sweepTo <= .8 && seg.tilt >= -1.2 && seg.tilt <= .6);
  }
  const older = structuredClone(original);
  delete older.segs[0].sweepTo; delete older.segs[0].tilt;
  const revised = jitterPlan(older, mulberry32(7), 1, config).segs[0];
  assert.ok(Number.isFinite(revised.sweepTo) && Number.isFinite(revised.tilt));
});

test("the effector pilot schedules supported bodies and measures target use separately from legacy strokes", () => {
  const jobs = EXPERIMENTS.channel({ channel: "effector", pairs: 1 });
  assert.deepEqual([...new Set(jobs.map(j => j.body))], ["human-warrior", "human-unarmed", "human-mace"]);
  assert.equal(jobs.length, 18);
  assert.deepEqual(runFlags("channel", { channel: "effector" }), { effector: true });
  for (const cell of new Set(jobs.map(j => j.cell))) {
    const pair = jobs.filter(j => j.cell === cell);
    assert.deepEqual(pair[0].seeds, [...pair[1].seeds].reverse());
    assert.equal(pair[0].left, pair[1].right);
  }
  const reader = behaviourReader();
  const body = command => ({ control: { driver: { held: command } }, view: {
    self: { ground: { x: 0, z: 0 }, support: "supported", hands: {} },
    opponent: { ground: { x: 0, z: 2 } },
  } });
  const command = freshBodyCommand();
  // Range is deliberately unavailable in this telemetry-only fixture.
  const bout = { left: body(command), right: body(freshBodyCommand()) };
  reader.feed(bout);
  command.effectors.primary.target = { speed: .4, force: .6 };
  command.effectors.secondary.target = { speed: .8, force: 1 };
  reader.feed(bout);
  const seen = reader.result(1);
  assert.equal(seen.left.targetedShare, .5);
  assert.ok(Math.abs(seen.left.targetSpeed - .6) < 1e-12);
  assert.equal(seen.left.targetForce, .8);
  assert.equal(seen.left.committedShare, 0);
  assert.equal(seen.right.targetedShare, 0);
  assert.equal(seen.right.targetSpeed, null);
});

test("task trajectories use each live socket, retain phase, and obey declarations and hand loss", async () => {
  const previous = setChannelFlags({ effector: true });
  const bout = createBout({ ...OPTIONS, physics: await freshHavok() });
  try {
    bout.step();
    const view = bout.left.view;
    const older = structuredClone(targetPlan());
    delete older.segs[0].sweepTo; delete older.segs[0].tilt;
    const oldTarget = new Program(older).decide(view, .1, {}).effectors.primary.target;
    const oldLine = new Vector3(oldTarget.position.x, oldTarget.position.y, oldTarget.position.z)
      .subtract(view.self.hands.primary.shoulder).normalize();
    const oldOrientation = new Quaternion(...["x", "y", "z", "w"].map(k => oldTarget.orientation[k]));
    assert.ok(Vector3.Distance(oldLine, Vector3.Forward().rotateByQuaternionToRef(oldOrientation, new Vector3())) < 1e-6,
      "an older recorded trajectory must retain its untilted orientation");
    for (const [turn, hand] of [[0, "primary"], [1, "secondary"]]) {
      const program = new Program(targetPlan("target-soft", turn));
      const start = structuredClone(program.decide(view, .2, {}));
      const target = start.effectors[hand].target;
      assert.ok(target, `${hand} did not receive its target`);
      assert.equal(start.actingHand, hand);
      assert.equal(target.speed, .6); assert.equal(target.force, .5);
      const delta = new Vector3(target.position.x, target.position.y, target.position.z).subtract(view.self.hands[hand].shoulder);
      assert.ok(Math.abs(delta.length() - .65 * view.self.hands[hand].reach) < 1e-10);
      const direction = Vector3.Forward().rotateByQuaternionToRef(new Quaternion(...["x", "y", "z", "w"].map(k => target.orientation[k])), new Vector3());
      assert.ok(Math.abs(Vector3.Dot(direction, delta.normalize()) - Math.cos(.6)) < 1e-6,
        "the shaft must tilt relative to the requested line");
      assert.ok(direction.y > delta.y, "the carrying hand must tilt the shaft upward");
      const clone = program.clone();
      const next = structuredClone(program.decide(view, .1, {}));
      assert.deepEqual(clone.decide(view, .1, {}), next, "warm clone restarted a trajectory");
      assert.notDeepEqual(next.effectors[hand].target.position, target.position, "the sweep never advances");
      assert.ok(plans(config, turn, program).some(p => p.label === "warm"));
      const fresh = new Program(program.plan).decide(view, .1, {});
      assert.notDeepEqual(fresh.effectors[hand].target, next.effectors[hand].target, "phase control cannot distinguish a restart");
    }
    const program = new Program(targetPlan());
    // Only the secondary socket still declares a target: select it, without inspecting module IDs.
    const channels = view.self.capabilities.channels.filter(c => c.hand !== "primary");
    const fixture = { ...view, self: { ...view.self, capabilities: { ...view.self.capabilities, channels } } };
    assert.ok(program.decide(fixture, .1, {}).effectors.secondary.target);
    fixture.self.hands = { ...view.self.hands, secondary: { ...view.self.hands.secondary, lost: true } };
    const lost = program.decide(fixture, .1, {});
    assert.ok(lost.effectors.primary.target == null);
    assert.ok(lost.effectors.secondary.target == null, "a lost hand retained its previous target");
  } finally { bout.dispose(); setChannelFlags(previous); }
});

class Witnessed extends ExpertMind {
  constructor(cfg, seed) { super(cfg, seed); this.seen = []; this.contacts = []; }
  prepare(host) {
    const due = super.prepare(host);
    if (due) {
      this.seen.push({ pose: poseHash(host.live), vE: host.live.left.vitality, vO: host.live.right.vitality });
      const { left, right } = host.live.forkWorld().roots.recorder.records;
      this.contacts.push({ contactsE: left.contacts.primary + left.contacts.secondary,
        contactsO: right.contacts.primary + right.contacts.secondary, blocksE: left.blocks, blocksO: right.blocks });
    }
    return due;
  }
}

test("the task expert evaluates targets and its exact rollouts predict the live body", async () => {
  const previous = setChannelFlags({ effector: true });
  try {
    const run = async effector => {
      const expert = new Witnessed({ ...config, effector, candidates: 6, rounds: 1, horizon: 1,
        decisionHz: 1, reseed: false, trace: true }, 5);
      let targetFrames = 0;
      await runExpertBout({ ...OPTIONS, right: "humanoid-duelist", maxSeconds: 3.1, physics: await freshHavok() }, { experts: { left: expert },
        onFrame: bout => {
          const held = bout.left.control.driver.held;
          if (["primary", "secondary"].some(h => held?.effectors[h].target)) targetFrames++;
        } });
      for (let i = 0; i + 1 < expert.seen.length; i++) {
        const prediction = expert.log[i].predicted;
        assert.deepEqual(expert.seen[i + 1], { pose: prediction.pose, vE: prediction.vE, vO: prediction.vO });
        assert.deepEqual(prediction.contacts, Object.fromEntries(Object.entries(expert.contacts[i + 1])
          .map(([key, value]) => [key, value - expert.contacts[i][key]])));
      }
      assert.ok(expert.seen.length >= 4);
      for (const entry of expert.log) {
        const chosen = entry.candidates.find(c => c.label === entry.label && c.total === entry.terms.total);
        assert.ok(chosen, "chosen rollout is absent from candidate scores");
        assert.equal(chosen.total, Math.max(...entry.candidates.map(c => c.total)));
        const { label, vE, vO, contacts, reports, ...terms } = chosen;
        assert.deepEqual(terms, entry.terms);
        assert.equal(vE, entry.predicted.vE);
        assert.equal(vO, entry.predicted.vO);
        assert.deepEqual(contacts, entry.predicted.contacts);
        assert.deepEqual(reports, entry.predicted.reports);
        for (const candidate of entry.candidates) {
          const own = candidate.reports.filter(r => r.side === "left" && r.hand !== null);
          const other = candidate.reports.filter(r => r.side === "right" && r.hand !== null);
          assert.equal(own.length, candidate.contacts.contactsE);
          assert.equal(other.length, candidate.contacts.contactsO);
          assert.equal(other.filter(r => r.blocked || r.guarded).length, candidate.contacts.blocksE);
          assert.equal(own.filter(r => r.blocked || r.guarded).length, candidate.contacts.blocksO);
          let total = 0;
          for (const key of ["damage", "end", "down", "position", "stall", "retreat"]) {
            assert.ok(Number.isFinite(candidate[key]), `missing candidate ${key}`);
            total += expert.config.weights[key] * candidate[key];
          }
          assert.equal(candidate.total, total);
        }
      }
      if (effector) assert.ok(expert.log[0].candidates.some(c => c.label === "target-soft"), "targets were never evaluated");
      return { targetFrames, labels: expert.log.map(e => e.label) };
    };
    await run(true);
    assert.equal((await run(false)).targetFrames, 0);
  } finally { setChannelFlags(previous); }
});

test("a selected task trajectory reaches the motors and continues identically after a mid-sweep fork", async () => {
  class TaskMind {
    constructor() { this.name = "task-test"; this.program = new Program(targetPlan("target-soft")); }
    command(view, dt) { return this.program.decide(view, dt, {}); }
    captureState() { return this.program.state(); }
    restoreState(state) { this.program = new Program(targetPlan("target-soft"), state); }
  }
  const previous = setChannelFlags({ effector: true });
  const live = createBout({ ...OPTIONS, physics: await freshHavok(), leftMind: new TaskMind() });
  let fork;
  try {
    for (let i = 0; i < 12; i++) live.step();
    fork = await exactFork(OPTIONS, captureBout(live, { heap: true }), { leftMind: new TaskMind() });
    const read = body => body.effectorModules[0].module.captureState().built.captureState();
    assert.equal(read(live.left).taskSpeed, .6);
    assert.equal(read(live.left).taskForce, .5);
    assert.equal(read(live.left).exactTask, true);
    const start = live.left.view.self.hands.primary.tip.clone();
    for (let i = 0; i < 36; i++) {
      live.step(); fork.step();
      assert.deepEqual(fork.left.control.driver.held, live.left.control.driver.held);
      assert.equal(poseHash(fork), poseHash(live));
    }
    assert.ok(Vector3.Distance(start, live.left.view.self.hands.primary.tip) > .05, "the real endpoint never moved");
  } finally { fork?.dispose(); live.dispose(); setChannelFlags(previous); }
});
