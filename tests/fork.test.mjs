// A forkable world (skill ceiling session 02, `docs/plans/2026-09-25-skill-ceiling-02-fork.md`).
//
// What is held here, and what each hold is for:
// - **Completeness.** Every closure a world can reach hands over every `let` and every private
//   object it steps on, through `captureState`, or says at its declaration why it need not. Run over
//   builds that between them use every registered module, and over every named golem mind, so a
//   module or a mind that grows a stepping field tomorrow and leaves it out of its record goes red
//   here with its file and its name. A control beside it shows the audit finding one.
// - **Fidelity.** A fork's own capture reads back equal to what it was built from, and two forks of
//   one capture step bit-identically.
// - **Isolation.** A bout with forks taken from it is the same bout, to the bit, as one without.
// - **The floor.** One frame after a teleport fork, the two worlds are apart by the solver's warm
//   start and nothing else; a control shows the same reading on a world that was not restored. A
//   restore written over the very state it was taken from changes nothing at all.
// - **Exactness.** A fork that copies Havok's memory is its original to the bit, pose, result and
//   graph, after a sever as well; a teleport fork beside it shows the test can tell them apart.
//
// Harness: the Node bout runner (`tests/harness/bout-runner.mjs`) and the fork harness beside it
// (`tests/harness/fork.mjs`), one Havok instance per file, and fresh ones for the exact fork. Readings here are comparable with the
// Node figures in `docs/analysis/2026-09-25-fork.md` and with nothing taken on the page.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { createBout, freshHavok } from "./harness/bout-runner.mjs";
import { captureBout, exactFork, forkBout } from "./harness/fork.mjs";
import { auditClosures } from "./harness/closure-audit.mjs";
import { diffGraphs } from "../src/fork/graph.ts";
import { restoreWorld } from "../src/fork/world.ts";
import { restoreMind, snapshotMind } from "../src/fork/mind.ts";
import { policyMind } from "../src/mind.ts";
import { GOLEM_MODULES, EFFECTOR_CHAINS, EFFECTOR_TERMINALS } from "../src/golem/registry.ts";
import { humanSetup } from "../src/golem/humanoid/presets.ts";
import { skeletonSetup } from "../src/golem/skeleton/presets.ts";

Logger.LogLevels = Logger.ErrorLogLevel;
const physics = await freshHavok();
const SEEDS = [2158207037, 3265167439];

const golem = (locomotion, torso, head, [pc, pt], [sc, st]) => ({ family: "golem", locomotion, torso, head,
  primary: { chain: pc, terminal: pt }, secondary: { chain: sc, terminal: st } });

/**
 * Builds that between them put every chain, every terminal and every locomotion, trunk and head on
 * the registry into a world. An effector is one closure over its chain's closure and its
 * terminal's, and neither of those knows what it is paired with, so every chain and every terminal
 * once is every effector's state -- which the coverage test below asserts rather than trusts.
 */
const AUDIT_PAIRS = [
  [golem("locomotion.wheel", "torso.plated", "head.ram", ["pitch", "blade"], ["pitch", "plate"]),
    golem("locomotion.multileg", "torso.plain", "head.plain", ["reach", "mace"], ["wrist", "whip"])],
  [golem("locomotion.biped", "torso.plain", "head.plain", ["reach", "maul"], ["reach", "maul"]),
    golem("locomotion.wheel", "torso.plain", "head.ram", ["wrist", "fist"], ["none", "none"])],
  [humanSetup("maul", "maul"), skeletonSetup("fist", "whip")],
];

/** Two golems nobody would field: three legs and one arm, against a wheeled head-rammer. */
const ODD = {
  leftGolem: golem("locomotion.multileg", "torso.plain", "head.plain", ["reach", "blade"], ["none", "none"]),
  rightGolem: golem("locomotion.wheel", "torso.plain", "head.ram", ["none", "none"], ["none", "none"]),
};

const options = (extra = {}) => ({ left: "idle", right: "idle", seeds: SEEDS, locomotionMode: "supported",
  maxSeconds: 150, physics, ...extra });

const steps = (bout, n) => { for (let i = 0; i < n; i++) bout.step(); };

/** Every part's pose, as the bytes of its doubles. */
function poseBytes(bout) {
  const out = [];
  for (const body of [bout.left, bout.right]) {
    for (const limb of body.limbs) {
      const p = limb.part.mesh.position, q = limb.part.mesh.rotationQuaternion;
      out.push(p.x, p.y, p.z, q.x, q.y, q.z, q.w);
    }
  }
  return Buffer.from(new Float64Array(out).buffer);
}

/** The largest distance between one part in `a` and the same part in `b`, metres. */
function largestGap(a, b) {
  const pa = [...a.left.limbs, ...a.right.limbs], pb = [...b.left.limbs, ...b.right.limbs];
  assert.equal(pa.length, pb.length);
  let largest = 0;
  pa.forEach((limb, i) => {
    largest = Math.max(largest, Vector3.Distance(limb.part.mesh.position, pb[i].part.mesh.position));
  });
  return largest;
}

function audit(extra) {
  const bout = createBout(options(extra));
  const twin = createBout(options(extra));
  try {
    steps(bout, 30);
    twin.step();
    const report = auditClosures(bout.scene, bout.forkWorld().roots,
      { scene: twin.scene, roots: twin.forkWorld().roots });
    const modules = [bout.left, bout.right].flatMap((body) => body.modules.map((module) => module.id));
    return { report, modules };
  } finally {
    bout.dispose();
    twin.dispose();
  }
}

const describeFindings = (findings) =>
  findings.map((f) => `${f.file} ${f.scope}${f.forkable ? " [has a record]" : ""}: ${f.missing.join(", ")}`).join("\n");

// ---------------------------------------------------------------------------------------------
// Completeness
// ---------------------------------------------------------------------------------------------

/** A closure piece with a let its record leaves out, and the same piece with it in. */
function counter(recorded) {
  let count = 0;
  let spare = 0;
  const piece = { step: () => { count += 1; spare += 1; } };
  if (recorded) {
    piece.captureState = () => ({ count, spare });
    piece.restoreState = (state) => { ({ count, spare } = state); };
  } else {
    piece.captureState = () => ({ count });
    piece.restoreState = (state) => { ({ count } = state); };
  }
  return piece;
}

test("the_closure_audit_names_a_let_that_no_record_hands_over", () => {
  // The control for every audit below: an audit that found nothing because it could not look would
  // pass them all.
  const bout = createBout(options());
  try {
    const roots = { ...bout.forkWorld().roots };
    const leaky = auditClosures(bout.scene, { ...roots, piece: counter(false) });
    const found = leaky.findings.filter((f) => f.file.endsWith("fork.test.mjs"));
    assert.equal(found.length, 1, describeFindings(leaky.findings));
    assert.deepEqual(found[0].missing, ["spare"]);
    const whole = auditClosures(bout.scene, { ...roots, piece: counter(true) });
    assert.deepEqual(whole.findings.filter((f) => f.file.endsWith("fork.test.mjs")), []);
  } finally {
    bout.dispose();
  }
});

test("every_registered_module_hands_its_stepping_state_to_the_fork", () => {
  const built = new Set();
  const findings = [];
  for (const [leftGolem, rightGolem] of AUDIT_PAIRS) {
    const { report, modules } = audit({ leftGolem, rightGolem });
    for (const id of modules) built.add(id);
    findings.push(...report.findings);
  }
  assert.deepEqual(findings, [], describeFindings(findings));

  // Coverage, asserted rather than trusted: every chain, every terminal, and every module that is
  // not an effector was in one of the worlds audited.
  const chains = new Set(), terminals = new Set();
  for (const id of built) {
    const [kind, chain, terminal] = id.split(".");
    if (kind !== "effector") continue;
    chains.add(chain);
    terminals.add(terminal ?? "none");
  }
  assert.deepEqual([...chains].sort(), Object.keys(EFFECTOR_CHAINS).sort());
  assert.deepEqual([...terminals].filter((t) => t !== "none").sort(), Object.keys(EFFECTOR_TERMINALS).sort());
  const others = GOLEM_MODULES.map((entry) => entry.id).filter((id) => !id.startsWith("effector."));
  assert.deepEqual(others.filter((id) => !built.has(id)), []);
});

/** Every mind the expert plays against (the plan's list), and the idle one. */
const MINDS = ["idle", "golem-duelist", "golem-miser", "golem-researched-needle-v1", "golem-champion", "golem-brawler"];

test("every_named_golem_mind_hands_its_stepping_state_to_the_fork", () => {
  const findings = [];
  for (const [left, right] of [[MINDS[1], MINDS[2]], [MINDS[3], MINDS[4]], [MINDS[5], MINDS[0]]]) {
    findings.push(...audit({ left, right }).report.findings);
  }
  assert.deepEqual(findings, [], describeFindings(findings));
});

/** A view as data, so a mind can be handed the same one twice. */
function cloneView(value, memo = new Map()) {
  if (value === null || typeof value !== "object") return value;
  if (memo.has(value)) return memo.get(value);
  if (value instanceof Vector3) return value.clone();
  if (Array.isArray(value)) {
    const out = [];
    memo.set(value, out);
    for (const v of value) out.push(cloneView(v, memo));
    return out;
  }
  const out = {};
  memo.set(value, out);
  for (const key of Object.keys(value)) out[key] = typeof value[key] === "function" ? value[key] : cloneView(value[key], memo);
  return out;
}

test("a_restored_mind_decides_bit_identically_and_a_reseeded_one_draws_new_dice", () => {
  const firstDifference = (mind, tail) => tail.findIndex((r) => JSON.stringify(mind.decide(r.view, r.dt)) !== r.out);
  for (const name of MINDS) {
    const inner = policyMind(name, SEEDS[0]);
    const record = [];
    const recorder = { name: inner.name, decide(view, dt) {
      const out = inner.decide(view, dt);
      record.push({ view: cloneView(view), dt, out: JSON.stringify(out) });
      return out;
    } };
    const bout = createBout(options({ left: name, right: "golem-duelist", leftMind: recorder }));
    let snapshot = null, at = -1;
    try {
      for (let f = 0; f < 480; f += 1) {
        if (f === 120) { snapshot = snapshotMind(inner); at = record.length; }
        bout.step();
      }
    } finally {
      bout.dispose();
    }
    const tail = record.slice(at);
    assert.ok(tail.length > 400, `${name}: the mind was asked`);
    // The same mind, restored after it has run on; and a fresh one from another seed.
    restoreMind(inner, snapshot);
    assert.equal(firstDifference(inner, tail), -1, `${name}: restored in place`);
    const fresh = policyMind(name, SEEDS[0] ^ 0x1234);
    restoreMind(fresh, snapshot);
    assert.equal(firstDifference(fresh, tail), -1, `${name}: restored into a fresh mind`);
    if (name === "idle") continue;
    // The controls: a mind with nothing restored does not replay the tail, and a reseeded one keeps
    // its moment and draws different dice. Measured over this tail (Node bout runner), the duelist,
    // miser, needle and champion part from their own replay 189 to 353 decisions after a reseed;
    // the brawler draws nothing in these four seconds, so a reseed cannot show on it.
    assert.notEqual(firstDifference(policyMind(name, SEEDS[0]), tail), -1, `${name}: the control replays too`);
    if (name !== "golem-brawler") {
      const reseeded = policyMind(name, SEEDS[0]);
      restoreMind(reseeded, snapshot, { reseed: 7 });
      assert.notEqual(firstDifference(reseeded, tail), -1, `${name}: a reseeded mind draws the same dice`);
    }
  }
});

test("nothing_in_src_sets_a_joint_property_havok_cannot_read_back", async () => {
  // `src/fork/native.ts` captures a joint through Havok's getters. Stiffness, damping and the
  // anchors have setters and no getters, so a fork is exact only while nothing changes them after a
  // joint is built -- and nothing does, because nothing calls them at all.
  const files = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (/\.ts$/.test(entry.name)) files.push(path);
    }
  };
  await walk(new URL("../src", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"));
  assert.ok(files.length > 100, "the source walk found the source");
  // A call, which is a member access: the doc comment in `src/golem/config.ts` that names
  // `HP_Constraint_SetAxisDamping(...)` while explaining a constructor is not one.
  const unreadable = /\.(setAxisStiffness|setAxisDamping|setPivotA|setPivotB|setAxisA|setAxisB|setPerpAxisA|setPerpAxisB|HP_Constraint_SetAxisStiffness|HP_Constraint_SetAxisDamping|HP_Constraint_SetAnchor\w*)\s*\(/;
  assert.match("joint.setAxisStiffness(PhysicsConstraintAxis.ANGULAR_X, 40)", unreadable);
  assert.match("this._hknp.HP_Constraint_SetAnchorInChild(id, pivot)", unreadable);
  const offenders = [];
  for (const file of files) {
    if (/[\\/]fork[\\/]/.test(file)) continue;
    const text = await readFile(file, "utf8");
    if (unreadable.test(text)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

// ---------------------------------------------------------------------------------------------
// Fidelity and isolation
// ---------------------------------------------------------------------------------------------

test("a_fork_reads_back_what_it_was_built_from_even_after_a_sever", () => {
  const bout = createBout(options(ODD));
  try {
    steps(bout, 60);
    const hit = [...bout.left.moduleOfLimb].find(([, module]) => module.slot === "primary");
    assert.ok(hit, "the odd build has an arm to lose");
    bout.left.sever(hit[0], new Vector3(1, 0, 0));
    steps(bout, 60);
    const capture = captureBout(bout);
    const fork = forkBout(options(ODD), capture);
    try {
      assert.deepEqual(fork.forkReport.unpairedStructure, []);
      assert.deepEqual(diffGraphs(capture.graph, captureBout(fork).graph), []);
      // And the sever is in the fork: the module is gone from it as from the original.
      const severed = (b) => b.left.modules.filter((m) => m.severed).map((m) => m.id);
      assert.deepEqual(severed(fork), severed(bout));
      assert.equal(severed(fork).length, 1);
    } finally {
      fork.dispose();
    }
  } finally {
    bout.dispose();
  }
});

test("two_forks_of_one_capture_step_bit_identically", () => {
  const bout = createBout(options({ leftGolem: AUDIT_PAIRS[1][0], rightGolem: AUDIT_PAIRS[0][1] }));
  try {
    steps(bout, 90);
    const capture = captureBout(bout);
    const one = forkBout(options({ leftGolem: AUDIT_PAIRS[1][0], rightGolem: AUDIT_PAIRS[0][1] }), capture);
    const two = forkBout(options({ leftGolem: AUDIT_PAIRS[1][0], rightGolem: AUDIT_PAIRS[0][1] }), capture);
    try {
      for (let i = 0; i < 60; i++) {
        one.step();
        two.step();
        assert.ok(poseBytes(one).equals(poseBytes(two)), `forks part at frame ${i + 1}`);
      }
    } finally {
      one.dispose();
      two.dispose();
    }
  } finally {
    bout.dispose();
  }
});

/** A bout's pose history, with forks taken from it at `forkAt` frames and each stepped a second. */
function history(extra, frames, forkAt) {
  const bout = createBout(options(extra));
  const hash = createHash("sha256");
  let forks = 0;
  try {
    for (let i = 0; i < frames; i++) {
      bout.step();
      hash.update(poseBytes(bout));
      if (forkAt.includes(i)) {
        const fork = forkBout(options(extra), captureBout(bout));
        steps(fork, 60);
        fork.dispose();
        forks += 1;
      }
    }
    return { hash: hash.digest("hex"), result: JSON.stringify(bout.result()), graph: captureBout(bout).graph, forks };
  } finally {
    bout.dispose();
  }
}

test("forking_an_odd_build_leaves_the_original_bit_identical", () => {
  const plain = history(ODD, 150, []);
  const forked = history(ODD, 150, [30, 75, 120]);
  assert.equal(forked.forks, 3);
  assert.equal(forked.hash, plain.hash);
  assert.equal(forked.result, plain.result);
  assert.deepEqual(diffGraphs(plain.graph, forked.graph), []);
});

test("forking_a_fought_bout_leaves_it_bit_identical", () => {
  const minds = { left: "golem-brawler", right: "golem-champion" };
  const plain = history(minds, 240, []);
  const forked = history(minds, 240, [40, 100, 170]);
  assert.equal(forked.hash, plain.hash);
  assert.equal(forked.result, plain.result);
  assert.deepEqual(diffGraphs(plain.graph, forked.graph), []);
  // The control: the history hash can tell two bouts apart at all.
  const other = history({ ...minds, seeds: [SEEDS[1], SEEDS[0]] }, 240, []);
  assert.notEqual(other.hash, plain.hash);
});

test("a_fork_starts_within_the_solver_floor_of_its_original", () => {
  // One frame after a teleport fork the two worlds are apart by the solver's cold contact and
  // warm-start caches, and by how much depends on the instant: a blade in contact at the fork reads
  // far more than one in the air. Measured on the merged release 120 (Node bout runner, brawler
  // against miser, forks at frames 120 to 330 every 30): 16.7, 28.3, 24.5, 25.2, 95.1, 31.5, 6.5 and
  // 43.0 mm, a median of 26.7. A single instant was this test's reading until then, at a 25 mm
  // bound, and the frame it forked at went from 7-13 mm to 95 mm with no state missing, because the
  // trajectory had moved to put that frame in a clinch. So it reads the median of eight.
  //
  // What it can see: a fork that loses the bodies' linear velocity reads a median of 52.1 mm. What
  // it cannot: one that loses their angular velocity reads 35.1, inside the spread. That is held
  // by the fidelity tests above, which read a fork's own capture back, and the fork a search trusts
  // is the exact one, which is its original to the bit.
  const minds = { left: "golem-brawler", right: "golem-miser" };
  const bout = createBout(options(minds));
  const gaps = [];
  try {
    let at = 0;
    for (const frame of [120, 150, 180, 210, 240, 270, 300, 330]) {
      steps(bout, frame - at);
      const fork = forkBout(options(minds), captureBout(bout));
      try {
        bout.step();
        fork.step();
        at = frame + 1;
        gaps.push(largestGap(bout, fork));
      } finally {
        fork.dispose();
      }
    }
    // The control: a world built the same way and not restored, stepped to the same clock.
    const cold = createBout(options({ ...minds, seeds: [SEEDS[0] + 1, SEEDS[1] + 1] }));
    try {
      steps(cold, at);
      assert.ok(largestGap(bout, cold) > 0.1, "a world that was not restored is not within the floor");
    } finally {
      cold.dispose();
    }
  } finally {
    bout.dispose();
  }
  const sorted = [...gaps].sort((x, y) => x - y);
  const median = (sorted[3] + sorted[4]) / 2;
  assert.ok(median < 0.04, `one frame after a fork its parts are a median ${(median * 1000).toFixed(3)} mm `
    + `from the original's (${gaps.map((g) => (g * 1000).toFixed(1)).join(", ")})`);
});

test("a_capture_restored_over_the_same_world_changes_nothing", () => {
  // Havok does not treat a write of the value already there as a no-op: rewriting a body's mass
  // properties moved parts 3.21 mm within three frames, its transform 5.32 mm, a motor's stiffness
  // or velocity target 0.18 mm (Node bout runner, brawler against miser at frame 240). The restore
  // therefore writes only what differs, and this holds it: a capture written back over a world in
  // exactly that state leaves it stepping bit-identically with a twin nobody touched.
  const minds = { left: "golem-brawler", right: "golem-miser" };
  const bout = createBout(options(minds));
  const twin = createBout(options(minds));
  try {
    for (let i = 0; i < 240; i++) {
      bout.step();
      twin.step();
    }
    assert.ok(poseBytes(bout).equals(poseBytes(twin)), "two bouts built alike in one instance step alike");
    restoreWorld(bout.scene, bout.forkWorld(), captureBout(bout));
    for (let i = 0; i < 60; i++) {
      bout.step();
      twin.step();
      assert.ok(poseBytes(bout).equals(poseBytes(twin)), `a restore in place moved the world by frame ${i + 1}`);
    }
  } finally {
    bout.dispose();
    twin.dispose();
  }
});

test("an_exact_fork_is_its_original_to_the_bit_even_after_a_sever", async () => {
  // A fork that copies Havok's memory: the original in an instance of its own, the fork built into
  // another and the heap copied over, so the solver's caches go across with everything else. Poses,
  // the bout's whole result and the JavaScript graph then agree to the bit for as long as both run --
  // which also catches, behaviourally, any stepping state the graph failed to carry (a
  // non-enumerable engagement tracker was found this way).
  //
  // Two builds: the shipped golems under two minds, and two mauls against a fist, whose second hand
  // closes on the haft mid-bout -- a joint the fork replays at a moment of its own, so Havok hands it
  // another address, which the copy has to point back at the original's.
  const builds = [
    { left: "golem-brawler", right: "golem-champion" },
    { left: "golem-duelist", right: "golem-brawler", leftGolem: AUDIT_PAIRS[1][0], rightGolem: AUDIT_PAIRS[1][1] },
  ];
  for (const build of builds) {
    const minds = { ...build, physics: await freshHavok() };
    const bout = createBout(options(minds));
    try {
      steps(bout, 120);
      const [limb] = [...bout.left.moduleOfLimb].find(([, module]) => module.slot === "primary");
      bout.left.sever(limb, new Vector3(1, 0, 0));
      steps(bout, 120);
      const capture = captureBout(bout, { heap: true });
      const fork = await exactFork(options(minds), capture);
      // The control: a teleport fork of the same moment, whose cold solver the same test can see.
      const teleport = forkBout(options(minds), { ...capture, native: { ...capture.native, heap: null } },
        { physics: await freshHavok() });
      try {
        let teleportParted = false;
        for (let i = 0; i < 180 && bout.active; i++) {
          bout.step();
          fork.step();
          teleport.step();
          assert.ok(poseBytes(bout).equals(poseBytes(fork)), `${build.left}: an exact fork parted from its original at frame ${i + 1}`);
          if (!poseBytes(bout).equals(poseBytes(teleport))) teleportParted = true;
        }
        assert.ok(teleportParted, `${build.left}: a teleport fork is told apart from its original`);
        assert.ok(JSON.stringify(fork.result()) === JSON.stringify(bout.result()), `${build.left}: the results differ`);
        assert.deepEqual(diffGraphs(captureBout(bout).graph, captureBout(fork).graph), []);
      } finally {
        fork.dispose();
        teleport.dispose();
      }
    } finally {
      bout.dispose();
    }
  }
});
