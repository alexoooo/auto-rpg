import { footOn } from "../../../../../src/control/support.ts";
/**
 * **The sit-back's reproduction**: the technique
 * (`sit-back`, `src/skills/recovery/implementations/staged/techniques.ts`) played alone from hands and knees at rest on
 * toes, the start the toes' stand-up was measured from (`placement("push-off-bear")`,
 * `research/skills/recovery/witness/rise-witness.mjs`), and the body watched to verified standing (`STAND_CHECK`): quiet on
 * its feet `STAND_CHECK.quiet` s. A seed moves the start's joints; the technique runs in the motor part, as the game's ground actions do. Node stand, core world, Rapier,
 * 120 Hz, calm, no assist; the stance holds the body once the technique is done.
 *
 *   node research/skills/recovery/implementations/staged/sit-back.mjs [--model workshop-fighter] [--held empty] [--seeds 1-32] [--each] [--delay <steps, at least 1>]
 *
 * Prints how many stood within 6 s and the median time to verified standing, failures counted
 * last; `--each` a line a seed.
 */
import "../../../../../tests/harness/preload-data.mjs";
import { parseArgs } from "node:util";
import { Quaternion, Vector3 } from "../../../../../src/core/math/vector.ts";
import { commandedBody } from "../../../../../src/app/commanded-body.ts";
import { buildBody } from "../../../../../src/core/bodies/build/build-body.ts";
import { loadEngine } from "../../../../../src/core/physics/engines.ts";
import { humanoidSpec } from "../../../../../src/core/bodies/human/spec.ts";
import { armedWith } from "../../../../../src/core/bodies/items/held.ts";
import { createWorld } from "../../../../../src/core/world/world.ts";
import { recoveryMeasurement } from "../../../../../src/game/lab/recovery-measurement.ts";
import { turnOfToRef } from "../../../../../src/core/bodies/read-motion.ts";
import { observeBody } from "../../../../../src/control/observation.ts";
import { clockSenses } from "../../../../../src/core/world/senses.ts";
import { kitOf } from "../../../../../src/skills/assembly/kit.ts";
import { partLookup } from "../../../../../src/app/catalog.ts";
import { groundReading } from "../../../../../src/control/ground-reading.ts";
import { TECHNIQUES } from "../../../../../src/app/registration/techniques.ts";
import { STAND_CHECK } from "../../../../../src/game/lab/ground-mode.ts";
import { placement } from "../../witness/rise-witness.mjs";
import { SIDES } from "../../../../../src/core/bodies/bilateral.ts";

/** How soon a trial must stand to count, s, and the most a trial is watched, s. */
const WITHIN = 6, CAP = 12;

/** One seed: when the technique ended and how, and when the body was verified standing, s from the start; null where it was not. */
export async function sitBackTrial({ model = "workshop-fighter", held = "empty", seed = 1, technique = "sit-back", delay = undefined }) {
  const spec = armedWith(humanoidSpec(model), "right", held), placed = placement("push-off-bear", spec, seed);
  if ("refused" in placed) return { seed, refused: placed.refused };
  const world = createWorld(await loadEngine("rapier"), delay === undefined ? {} : { delay });
  world.physics.addFixedBox([0, -.5, 0], [40, 1, 40]);
  const built = buildBody(spec, world, placed);
  const trial = { end: null, at: null, heading: 0, stage: [] };
  const body = commandedBody(built, world, { servoSeconds: .1 }, [(own, view, clock, afterPhysics) => {
    const part = TECHNIQUES[technique];
    const run = part.make(own, view, clock, kitOf(partLookup, own.spec), part.defaults, afterPhysics);
    const reader = groundReading(own.built, own.dt), state = { trial, run: run.state, reader: reader.state, begun: false };
    return { name: technique, has: () => technique, dispose() {}, mind: { state, wants: () => trial.end === null, begin() {}, end() {}, interrupt() {},
      // The technique runs in the motor part, on the body as it is, as the game's ground actions do.
      think() {},
      act(control) {
        const dt = own.dt;
        const senses = view.senses;
        const g = reader.read();
        if (!state.begun) { run.begin("left"); state.begun = true; }
        const end = run.step(g, senses, control, dt);
        if (trial.stage.at(-1) !== run.phase) trial.stage.push(run.phase);
        if (end === null) return;
        trial.end = end; trial.at = view.time;
        const turn = turnOfToRef(own.muscles.dynamics.root.segment, new Quaternion()), across = new Vector3(1, 0, 0).applyRotationQuaternionToRef(turn, new Vector3());
        trial.heading = Math.atan2(-across.z, across.x);
      } } };
  }]);
  body.drive((view) => ({ posture: {}, pushes: [], stance: { feet: SIDES.map(side => footOn(spec, side)), centre: null, height: view.standing - .03, heading: trial.heading } }));
  const measure = recoveryMeasurement(built, observeBody(built, body.muscles, world, clockSenses(world), { contactPatches: true }));
  let quiet = 0, verified = null, fell = false;
  try {
    while (world.time < CAP && (verified === null || world.time - verified < 1)) {
      world.step();
      const m = measure();
      if (verified === null && trial.end === "done") { quiet = m.ready ? quiet + world.dt : 0; if (quiet + 1e-9 >= STAND_CHECK.quiet) verified = world.time; }
      if (verified !== null && m.observation.down) { fell = true; break; }
      if (trial.end !== null && trial.end !== "done") break;
    }
  } finally { body.dispose?.(); world.dispose(); }
  const r = (v) => (v === null ? null : +v.toFixed(2));
  return { seed, end: trial.end, at: r(trial.at), verified: fell ? null : r(verified), fell, stages: trial.stage.join(" > ") };
}

if (process.argv[1]?.endsWith("sit-back.mjs")) {
  const { values } = parseArgs({ options: { model: { type: "string" }, held: { type: "string" }, seeds: { type: "string" },
    each: { type: "boolean" }, technique: { type: "string" }, delay: { type: "string" } } });
  const [lo, hi] = (values.seeds ?? "1-32").split("-").map(Number);
  const rows = [];
  for (let seed = lo; seed <= (hi ?? lo); seed++) {
    const row = await sitBackTrial({ model: values.model, held: values.held, seed, technique: values.technique, delay: values.delay === undefined ? undefined : Number(values.delay) });
    rows.push(row);
    if (values.each) console.log(JSON.stringify(row));
  }
  const played = rows.filter((row) => !row.refused), times = played.map((row) => row.verified ?? Infinity).sort((a, b) => a - b), n = times.length;
  const median = (times[(n - 1) >> 1] + times[n >> 1]) / 2;
  console.log(`${values.model ?? "workshop-fighter"} ${values.held ?? "empty"}: stood within ${WITHIN} s ${times.filter((t) => t <= WITHIN).length} of ${n}, median ${Number.isFinite(median) ? median.toFixed(2) : "none"} s`
    + `; not standing: ${played.filter((row) => row.verified === null).map((row) => `${row.seed} (${row.end ?? "running"} at ${row.at}, ${row.stages})`).join(", ") || "none"}`);
}
