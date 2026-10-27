/**
 * **Stand up's steady from the combat fold**: the body built standing, held 1.5 s, lowered into the
 * combat fold (`COMBAT_FOLD`, `src/core/skills/support-fold.ts`: the centre of mass `depth` of 0.5 m
 * down, the pelvis pitched 0.9 rad, the lumbar and thoracic spine flexed 0.89 and 0.368 rad, each
 * times `depth`, on planted feet at a 0.5 s response) over 2 s and held 1 s, then given to the
 * steady (`research/climb.mjs`) as `variant` changes it; timed from the steady's start to verified
 * standing (`STAND_CHECK`), 5 s cap. Node stand, core world, Rapier, 120 Hz, calm, no assist.
 *
 * With `--core`, the game's Stand up (`standUp`, step-up its technique) takes the body from the fold instead.
 *
 *   node research/fold-rise.mjs [--model workshop-fighter] [--held empty] [--depth 1] [--variant '<json>' | --core] [--trace]
 */
import { parseArgs } from "node:util";
import "../tests/harness/preload-data.mjs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { loadEngine } from "../src/core/engine/engines.ts";
import { humanoidSpec } from "../src/core/human/spec.ts";
import { armedWith } from "../src/core/items/held.ts";
import { guardPosture } from "../src/core/skills/guard.ts";
import { createWorld } from "../src/core/world.ts";
import { recoveryMeasurement } from "../src/core/control/recovery-measurement.ts";
import { observeBody } from "../src/core/observation.ts";
import { clockSenses } from "../src/core/mind/senses.ts";
import { carrying } from "../src/core/control/motor.ts";
import { kitOf } from "../src/core/mind/kit.ts";
import { partLookup } from "../src/core/mind/catalog.ts";
import { PUNCHER } from "../src/core/mind/config.ts";
import { STAND_CHECK } from "../src/lab/ground-mode.ts";
import { crouchSteady, traceRow } from "./climb.mjs";
import { standUp } from "../src/core/mind/ground/stand-up.ts";

/** The stand before the fold, the fold, and the hold in it, s; the cap from the steady's start, s. */
const STAND = 1.5, FOLDING = 2, HOLD = 1, CAP = 5;
/** The combat fold (`COMBAT_FOLD`): its lowering, pitch and spine's flexion, and its response; the stance's own lowering, m. */
const FOLD = { lower: .5, pitch: .9, lumbar: .89, thoracic: .368, response: .5 }, LOWER = .03;
const smooth = u => u * u * (3 - 2 * u);

/** One rise from the fold at `depth` (1 the combat fold's whole lowering): the steady's start, hand-back and verified standing, s from its start. */
export async function foldRise({ model = "workshop-fighter", held = "empty", depth = 1, variant = {}, core = false, trace = false }) {
  const spec = armedWith(humanoidSpec(model), "right", held);
  const engine = new NullEngine(), scene = new Scene(engine), world = createWorld(scene, await loadEngine("rapier"));
  world.physics.addFixedBox([0, -.5, 0], [40, 1, 40]);
  const built = buildBody(spec, world, { position: [0, 0, 0] });
  const start = STAND + FOLDING + HOLD;
  let control = null;
  const body = createBody(built, world, { servoSeconds: .1, subs: [(own, view, clock) => {
    const kit = kitOf(partLookup, own.spec, PUNCHER), steadying = core ? gameSteady(own, view, clock, kit) : crouchSteady(own, view, variant);
    const motor = carrying(kit.motor(own.built, SERVO_SECONDS, kit.posture, undefined, own.assist), ["stance"], "the fold");
    const clamp = (name, v) => { const d = own.muscles.channels.find(c => c.name === name).dof.spec; return Math.max(d.min.value, Math.min(d.max.value, v)); };
    control = steadying.control;
    return { name: "fold rise", state: { motor: motor.state, steady: steadying.state }, wants: () => control.on, begin() {}, end() {},
      step(_senses, dt) {
        if (view.time >= start) { steadying.step(dt); return; }
        const k = depth * smooth(Math.min(1, Math.max(0, (view.time - STAND) / FOLDING)));
        motor.setPosture({ ...kit.posture, "lumbar flexion": clamp("lumbar flexion", (kit.posture["lumbar flexion"] ?? 0) + FOLD.lumbar * k),
          "thoracic flexion": clamp("thoracic flexion", (kit.posture["thoracic flexion"] ?? 0) + FOLD.thoracic * k) });
        motor.stance.read();
        const height = view.standing - LOWER - (FOLD.lower - LOWER) * k;
        motor.setStance(k > 0 ? { feet: ["left", "right"], centre: null, heading: 0, height, pose: { pitch: FOLD.pitch * k, seconds: FOLD.response } }
          : { feet: ["left", "right"], centre: null, heading: 0, height });
        motor.control(own.muscles, dt);
      } };
  }] });
  body.drive(view => ({ posture: guardPosture(spec), pushes: [], stance: { feet: ["left", "right"], centre: null, height: view.standing - LOWER, heading: 0 } }));
  const measure = recoveryMeasurement(built, observeBody(built, body.muscles, world, clockSenses(world), { contactPatches: true }));
  const rows = [];
  let quiet = 0, verified = null, fell = false, folded = null;
  try {
    while (world.time < start + CAP && (verified === null || world.time - verified < 1)) {
      world.step();
      const m = measure();
      if (world.time < start) { if (m.observation.down) { fell = true; break; } continue; }
      folded ??= { height: +(m.observation.centre[1] / body.view.standing).toFixed(2), pelvisUp: +m.rootUp.toFixed(2) };
      if (verified === null) { quiet = m.ready ? quiet + world.dt : 0; if (quiet + 1e-9 >= STAND_CHECK.quiet) verified = world.time - start; }
      else if (m.observation.down) fell = true;
      if (trace && Math.round(world.time / world.dt) % 6 === 0) rows.push(traceRow(m, body, control, world));
    }
  } finally { world.dispose(); scene.dispose(); engine.dispose(); }
  return { folded, handBack: control.handBack === null ? null : control.handBack - start, verified: fell ? null : verified, fell, ...(trace ? { rows } : {}) };
}

/** The game's Stand up as the steady's stand-in: begun at its first step, `control.on` while it is active. */
function gameSteady(own, view, clock, kit) {
  const stand = standUp(own, view, clock, { kind: "stand-up", techniques: [{ kind: "step-up" }] }, kit);
  const control = { on: true, handBack: null, lead: 0, steps: 0, asked: null, at: 0, short: 0, begun: false };
  return { control, state: stand.state, step(dt) {
    if (!control.begun) { control.begun = true; stand.begin(); }
    stand.step(null, dt);
    if (!stand.state.active && control.on) { control.on = false; control.handBack = view.time; control.end = stand.state.log.at(-1); }
  } };
}

if (process.argv[1]?.endsWith("fold-rise.mjs")) {
  const { values } = parseArgs({ options: { model: { type: "string" }, held: { type: "string" }, depth: { type: "string" }, variant: { type: "string" }, trace: { type: "boolean" }, core: { type: "boolean" } } });
  const r = await foldRise({ model: values.model, held: values.held, depth: Number(values.depth ?? 1), variant: JSON.parse(values.variant ?? "{}"), core: values.core, trace: values.trace });
  if (r.rows) console.table(r.rows);
  const fmt = v => v === null ? "-" : v.toFixed(2);
  console.log(`folded at ${JSON.stringify(r.folded)}; handed back ${fmt(r.handBack)} s, verified ${fmt(r.verified)} s${r.fell ? ", fell" : ""}`);
}
