/**
 * One golem attribute over levels, on the Node benches (NullEngine, real Havok, no rendering).
 * Written for the size stat and able to sweep any; checked in by skill ceiling session 01 (it
 * lived in the git-ignored `.review/` through the attributes set).
 *
 *     node research/size-bench.mjs arm  [--modules a,b] [--levels 0.75,1,1.5] [--attr size]
 *     node research/size-bench.mjs move [--modules biped,skeleton] [--levels ...] [--sequence clear|walk|full]
 *     node research/size-bench.mjs body [--builds default,skeleton-warrior] [--levels ...]
 *
 * - `arm`: each effector on the stand (`runGolemBench`), its sequence's worst mark -- arrival
 *   seconds, overshoot, rest wander (mm), peak anchor stray (mm), peak driven tip speed (m/s), the
 *   held grip's stray (mm) -- then the shipped stroke (`runStrokeBench`): peak driven tip speed,
 *   speed at the mark, miss (m), and the two readings the range is set on, the stroke's peak stray
 *   from its own anchor and its tip-to-command lag (mm).
 * - `move`: each carrier through a walk (`runGolemLocomotion`): top root speed, mean planted-sole
 *   slip (mm/s) against the module's own `meanFootSlipBudgetMps` at the level, carrier lag, joint
 *   lag, the longest support gap, the peak upright lean, whether it fell, and how far the carried
 *   block got from where it stood (m). The default walk is `clear`: two seconds, because the
 *   harness's own walks (`--sequence walk`, which is `walkSequenceFor`) were cut for carriers of
 *   1.2 and 2.0 m/s, and every carrier but the multileg has done 3.2 since 2026-09-18. The wheel's
 *   three seconds end at 9.2 m, against the headless arena's ring of posts at 9.5, and the biped's
 *   six reach 12.6. A body wrapped round a post reads as slip and joint lag that belong to the
 *   arena and not the body, which is what made the small wheel look broken under the biological
 *   size law. The distance column is there so that a reading taken near the posts says so.
 * - `body`: whole golems of named builds, stood idle for a second: solver mass, the carrier's
 *   supported mass, the impulse its stability diagnostic says staggers and fells it along its weakest
 *   way (the lines are the body's live geometry, so a stance leaning over its base reads low), and
 *   the primary hand's swing inertia. A level the attribute's row refuses is printed as refused: a
 *   whole golem is built through `golemSetupRefusal`, where the stand benches above are not.
 *
 * Every figure is the Node bench's; a page reading is not comparable (AGENTS.md). One module per
 * process is the cheap way to run it in parallel: each process is its own Havok realm.
 */
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { parseArgs } from "node:util";

Logger.LogLevels = Logger.ErrorLogLevel;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    attr: { type: "string", default: "size" },
    levels: { type: "string", default: "0.75,0.8,0.9,1,1.1,1.25,1.5" },
    modules: { type: "string" },
    builds: { type: "string" },
    sequence: { type: "string", default: "clear" },
  },
});
const mode = positionals[0];
const attr = values.attr;
const levels = values.levels.split(",").map(Number);
const attributesAt = (level) => (level === 1 ? null : { [attr]: level });
const f = (v, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? "--" : Number(v).toFixed(d));
const cell = (v, d, w) => f(v, d).padStart(w);

const ARM_MODULES = [
  "effector.wrist.blade", "effector.skeletal.blade", "effector.reach.blade", "effector.pitch.blade",
  "effector.wrist.mace", "effector.wrist.maul", "effector.wrist.whip", "effector.wrist.fist",
  "effector.wrist.plate",
];

if (mode === "arm") {
  const { runGolemBench, runStrokeBench } = await import("../tests/harness/golem-bench.mjs");
  const modules = values.modules ? values.modules.split(",") : ARM_MODULES;
  console.log(`${attr} | rest: arrival s, overshoot, wander mm, stray mm, tip m/s, grip mm`
    + ` | stroke: tip m/s, at mark m/s, miss m | stray mm, lag mm`);
  for (const moduleId of modules) {
    for (const level of levels) {
      const attributes = attributesAt(level);
      const g = await runGolemBench({ moduleId, attributes });
      const marks = g.marks.map((m) => m.state);
      const max = (k) => Math.max(...marks.map((s) => s[k] ?? -Infinity));
      const s = await runStrokeBench({ moduleId, attributes });
      console.log([
        moduleId.replace("effector.", "").padEnd(14), String(level).padEnd(5), "|",
        cell(max("arrivalSeconds"), 3, 7), cell(max("overshoot"), 4, 7), cell(max("tipWanderMm"), 3, 8),
        cell(max("peakAnchorStrayMm"), 1, 7), cell(max("peakTipSpeedDriven"), 2, 6), cell(g.peakGripStrayMm, 1, 6), "|",
        cell(s.peakTipSpeedDriven, 1, 5), cell(s.speedAtMark, 1, 5), cell(s.missMetres, 3, 6), "|",
        cell(s.peakAnchorStrayMm, 1, 6), cell(s.state.peakTipErrorMm, 0, 5),
      ].join(" "));
    }
  }
} else if (mode === "move") {
  const { runGolemLocomotion, walkSequenceFor, LOCOMOTION_SEQUENCE } = await import("../tests/harness/golem-bench.mjs");
  const config = await import("../src/golem/config.ts");
  const { SKELETON_BIPED } = await import("../src/golem/skeleton/body.ts");
  const { SIZE_LAW_POWER } = await import("../src/golem/attributes.ts");
  const tables = {
    biped: config.LOCOMOTION_BIPED, skeleton: SKELETON_BIPED,
    multileg: config.LOCOMOTION_MULTILEG, wheel: config.LOCOMOTION_WHEEL,
  };
  const laws = {
    biped: config.LOCOMOTION_BIPED_SIZE, skeleton: config.LOCOMOTION_BIPED_SIZE,
    multileg: config.LOCOMOTION_MULTILEG_SIZE, wheel: config.LOCOMOTION_WHEEL_SIZE,
  };
  const modules = values.modules ? values.modules.split(",") : ["biped", "skeleton", "multileg", "wheel"];
  // Two seconds of walking is 6.4 m at 3.2 m/s, which stops about 3 m inside the posts.
  const CLEAR_WALK = Object.freeze([
    { name: "stand", until: 1.00, forward: 0, strafe: 0, turn: 0, crouch: 0 },
    { name: "walk", until: 3.00, forward: 1, strafe: 0, turn: 0, crouch: 0 },
    { name: "stop", until: 4.00, forward: 0, strafe: 0, turn: 0, crouch: 0 },
  ]);
  const sequenceFor = (moduleId) => {
    const sequence = { clear: CLEAR_WALK, full: LOCOMOTION_SEQUENCE, walk: walkSequenceFor(moduleId) }[values.sequence];
    if (!sequence) throw new Error(`no sequence "${values.sequence}"; known: clear, walk, full`);
    return sequence;
  };
  console.log(`${attr} | top m/s | slip mm/s (budget) | carrier lag m/s | joint lag rad | gap s | lean rad | unsupported | fell s | reach m`);
  for (const moduleId of modules) {
    for (const level of levels) {
      const sequence = sequenceFor(moduleId);
      let top = 0, notSupported = 0, frames = 0, start = null, reach = 0;
      const run = await runGolemLocomotion({
        moduleId, sequence, attributes: attributesAt(level),
        watch: ({ module, phase, stand }) => {
          const at = stand.block.mesh.position;
          start ??= { x: at.x, z: at.z };
          reach = Math.max(reach, Math.hypot(at.x - start.x, at.z - start.z));
          if (phase !== "walk") return;
          const live = module.evidence();
          frames += 1;
          if (live.state !== "supported") notSupported += 1;
          top = Math.max(top, live.rootSpeedMps);
        },
      });
      const s = run.state;
      const table = tables[moduleId];
      const budgetKey = "meanFootSlipBudgetMps" in table ? "meanFootSlipBudgetMps" : "meanContactSlipBudgetMps";
      const law = laws[moduleId][budgetKey];
      const budget = table[budgetKey] * (attr === "size" ? level ** SIZE_LAW_POWER[law] : 1);
      console.log([
        moduleId.padEnd(9), String(level).padEnd(5), "|", cell(top, 3, 6), "|",
        cell(s.meanFootSlipMps * 1000, 1, 6), `(${f(budget * 1000, 0)})`, "|", cell(s.peakCarrierLagMps, 3, 6), "|",
        cell(s.peakJointErrorRad, 3, 6), "|", cell(s.longestSupportGapSeconds, 3, 6), "|",
        cell(s.peakUprightLeanRad, 3, 6), "|", `${notSupported}/${frames}`.padStart(8), "|", String(s.firstFallenSeconds).padEnd(4), "|", cell(reach, 2, 5),
      ].join(" "));
    }
  }
} else if (mode === "body") {
  const { Vector3 } = await import("@babylonjs/core/Maths/math.vector.js");
  const { Golem } = await import("../src/golem/golem.ts");
  const { idleMind } = await import("../src/mind.ts");
  const { PLAYABLE_BUILDS } = await import("../src/golem/roster.ts");
  const { golemSetupRefusal } = await import("../src/golem/build.ts");
  const { flatSupportedWorldRegistry } = await import("../src/supported-locomotion-production.ts");
  const { createHeadlessArena } = await import("../tests/harness/golem-headless-arena.mjs");
  const { stepPair } = await import("../src/fighter.ts");
  const { CONFIG } = await import("../src/config.ts");
  const names = (values.builds ?? "default,skeleton-warrior,wheel,multileg,ram-capped").split(",");
  const FIXED = 1 / CONFIG.world.physicsHz;
  console.log(`build ${attr} | body kg  supported kg | stagger N.s  fall N.s (weakest way, after 1 s standing)`
    + ` | swing kg m2 | state`);
  for (const name of names) {
    const { setup } = PLAYABLE_BUILDS.find((b) => b.name === name);
    for (const level of levels) {
      // A fresh arena a row: the lines are read off the live tipping geometry, which a body has only
      // once it has stood through a boundary, so an idle pair stands a second first.
      const arena = await createHeadlessArena();
      const { scene } = arena;
      const world = flatSupportedWorldRegistry();
      const sized = level === 1 ? setup : { ...setup, attributes: { ...setup.attributes, [attr]: level } };
      const refusal = golemSetupRefusal(sized);
      if (refusal) {
        console.log(`${name.padEnd(16)} ${String(level).padEnd(5)} | refused: ${refusal}`);
        arena.dispose?.();
        continue;
      }
      const pair = ["left", "right"].map((side, i) => new Golem(scene, {
        side, origin: new Vector3(0, 0, i * 8), facing: i * Math.PI, setup: sized,
        mind: idleMind(), controlPolicies: [], locomotionWorld: world,
      }));
      let clock = 0;
      scene.onBeforePhysicsObservable.add(() => { stepPair(...pair, FIXED, clock); clock += FIXED; });
      while (clock < 1) { scene._renderId += 1; scene._advancePhysicsEngineStep(1000 / 60); }
      const g = pair[0];
      const body = g.limbs.reduce((sum, l) => sum + l.part.body.getMassProperties().mass, 0);
      const d = g.locomotion.diagnostic().stability;
      const swing = g.view.self.capabilities.effectors.primary?.swingInertia;
      console.log([
        name.padEnd(16), String(level).padEnd(5), "|", cell(body, 1, 6), cell(d.supportedMassKg, 1, 6), "|",
        cell(d.staggerAtMps * d.supportedMassKg, 2, 6), cell(d.fallAtMps * d.supportedMassKg, 2, 6), "|",
        cell(swing, 3, 6), "|", g.locomotion.state,
      ].join(" "));
      for (const golem of pair) golem.dispose();
      arena.dispose?.();
    }
  }
} else {
  console.error("usage: node research/size-bench.mjs arm|move|body [--modules ...] [--builds ...] [--levels ...] [--attr size]");
  process.exit(2);
}
