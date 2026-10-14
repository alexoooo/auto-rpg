/** Standalone technique trials: no tactic or combat preset participates in the control path. */
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import poses from "../assets/research/posture-holds.json" with { type: "json" };
import { buildBody } from "../src/core/build/build-body.ts";
import { createBody } from "../src/core/body.ts";
import { loadEngine } from "../src/core/engine/engines.ts";
import { humanSpec, humanoidSpec } from "../src/core/human/spec.ts";
import { armedWith } from "../src/core/items/held.ts";
import { createWorld } from "../src/core/world.ts";
import { guardPosture } from "../src/core/skills/guard.ts";
import { groundReading } from "../src/core/mind/ground/reading.ts";
import { plantUp, plantPostures, PLANT_UP } from "../src/core/mind/ground/plant-up.ts";
import { TECHNIQUES } from "../src/core/mind/ground/techniques.ts";
import { groundPlacement } from "../src/lab/ground-starts.ts";
import { deepFreeze } from "../src/core/state.ts";

// Geometry is independent of candidate controls and strength. Each realm validates an identical draw once.
const state = { starts: new Map() };

/** A research-only immutable override: source anatomy and installed gameplay defaults remain untouched. */
/** `spec` with every muscle's peak torques scaled by `factor`: the search's raised ceilings. */
export function strengthSpec(spec, factor) {
  if (factor === 1) return spec;
  return { ...spec, joints: spec.joints.map(joint => ({ ...joint, dofs: joint.dofs.map(dof => ({ ...dof,
    muscle: { ...dof.muscle, peakPositive: { ...dof.muscle.peakPositive, value: dof.muscle.peakPositive.value * factor },
      peakNegative: { ...dof.muscle.peakNegative, value: dof.muscle.peakNegative.value * factor } } })) })) };
}

/** Eight-second technique cap, followed by an independent two-second standing check on success. */
export async function techniqueTrial(job) {
  const model = job.model ?? "workshop-fighter", factor = job.factor ?? 1, cap = Math.min(8, job.cap ?? 8);
  if (!Number.isFinite(factor) || factor < 1 || factor > 1.5) throw new Error("research strength factor stays between 1 and 1.5");
  const technique = job.technique ?? "plant-up";
  if (!TECHNIQUES[technique]) throw new Error(`unknown technique ${technique}`);
  const destination = TECHNIQUES[technique].edges[0].to;
  if (!["workshop-fighter", "workshop-rogue", "crypt-skeleton"].includes(model)) throw new Error(`unsupported humanoid technique model ${model}`);
  const spec = strengthSpec(armedWith(humanoidSpec(model), "right", job.held ?? "empty"), factor);
  const start = job.start ?? "placed", posture = job.posture ?? "squat", seed = job.seed ?? 1;
  const waypoint = job.waypoint ? (() => {
    const source = poses.find(pose => pose.model === "workshop-fighter" && pose.id === posture);
    if (!source) throw new Error(`no ${posture} waypoint`);
    const reference = humanSpec("workshop-fighter");
    const targets = job.waypoint === "installed" ? Object.fromEntries(reference.joints.flatMap(joint => joint.dofs.map((dof, k) =>
      [`${joint.name} ${dof.positive}`, source.placement.joints[joint.name][k] + dof.bind.value]))) : plantPostures(spec)[job.waypoint];
    return { ...source.placement, joints: Object.fromEntries(spec.joints.map(joint => [joint.name,
      joint.dofs.map(dof => (targets[`${joint.name} ${dof.positive}`] ?? 0) - dof.bind.value)])) };
  })() : undefined;
  const key = JSON.stringify([model, job.held ?? "empty", start, posture, seed, job.waypoint ?? null]);
  let fixture = state.starts.get(key);
  if (!fixture) {
    try { fixture = { placement: deepFreeze(groundPlacement(spec, { seed, ground: { start, posture, degrees: null, impulse: null, foe: 0, gusts: false } }, waypoint)), error: null }; }
    catch (error) { fixture = { placement: null, error: String(error.message) }; }
    state.starts.set(key, fixture);
  }
  if (fixture.error) return { ...job, factor, reached: false, survived: false, end: "rejected start", phase: null, seconds: cap, error: fixture.error, trail: [], saturation: {} };
  const placement = fixture.placement;
  const engine = new NullEngine(), scene = new Scene(engine), world = createWorld(scene, await loadEngine("rapier"));
  world.physics.addFixedBox([0, -.5, 0], [40, 1, 40]);
  const built = buildBody(spec, world, placement), reader = groundReading(built, world.dt);
  let run, predecessor;
  const control = { active: start !== "shoved", end: null, from: null, ended: null, predecessor: job.after ? "running" : null,
    predecessorSeconds: 0, candidateFrom: null, shoved: false };
  const body = createBody(built, world, { servoSeconds: .1, subs: [(own, view, into) => {
    run = technique === "plant-up" ? plantUp(own, view, into, job.tuning ?? PLANT_UP) : TECHNIQUES[technique].make(own, view, into);
    predecessor = job.after ? TECHNIQUES[job.after]?.make(own, view, into) : null;
    if (job.after && !predecessor) throw new Error(`unknown predecessor ${job.after}`);
    return { name: `technique:${technique}`, state: { control, run: run.state, predecessor: predecessor?.state ?? null },
      wants: () => control.active,
      begin() {
        (predecessor ?? run).begin(TECHNIQUES[job.after ?? technique].sides[0]); control.from = into.time;
        if (!predecessor) control.candidateFrom = into.time;
      },
      end() { if (!control.end) run.end(); },
      step(senses, dt) {
        if (!view.ground) return;
        if (control.predecessor === "running") {
          let end = predecessor.step(view.ground, senses, dt);
          if (!end && into.time - control.from >= 8) { predecessor.end(); end = "timed-out"; }
          if (end) {
            control.predecessor = end; control.predecessorSeconds = into.time - control.from;
            run.begin(TECHNIQUES[technique].sides[0]); control.candidateFrom = into.time;
          }
          return;
        }
        control.end = run.step(view.ground, senses, dt);
        if (control.end) { control.active = false; control.ended = into.time; }
      } };
  }] });
  body.drive(view => ({ posture: guardPosture(spec), pushes: [], stance: { feet: ["left", "right"], centre: null, height: view.standing - .03, heading: 0 } }));
  const trail = [], saturation = {}, last = { phase: "", position: "" };
  let survived = false, verified = false;
  try {
    while (world.time < cap + 2.1 + (predecessor ? 8 : 0) + 4) {
      if (start === "shoved" && !control.shoved && world.time >= 1) {
        const radians = (job.degrees ?? 0) * Math.PI / 180, mass = [...built.segments.values()].reduce((sum, part) => sum + part.rigid.mass, 0);
        const trunk = built.segments.get("middleTrunk");
        trunk.body.applyImpulse(new Vector3(1.5 * mass * Math.sin(radians), 0, 1.5 * mass * Math.cos(radians)), trunk.node.position);
        control.shoved = true;
      }
      world.step();
      if (start === "shoved" && control.shoved && body.view.down && control.from === null) control.active = true;
      const g = body.view.ground ?? reader.read();
      const phase = control.predecessor === "running" ? `predecessor:${predecessor.phase}` : run.phase;
      if (last.phase !== phase || last.position !== g.position) {
        trail.push({ at: world.time, phase, position: g.position, height: g.height, feet: [...g.footLoad], hands: spec.segments.map((s, i) => s.name.startsWith("hand.") ? g.load[i] : 0).reduce((a, b) => a + b, 0) });
        last.phase = phase; last.position = g.position;
      }
      for (let i = 0; i < body.muscles.channels.length; i++) {
        const channel = body.muscles.channels[i], torque = body.muscles.pulled[i];
        const bound = body.muscles.strength(i, torque >= 0 ? 1 : -1), fraction = Math.abs(torque) / Math.max(1e-9, bound);
        const key = `${phase}/${channel.name}`;
        const reading = saturation[key] ??= { peak: 0, saturatedSeconds: 0 };
        reading.peak = Math.max(reading.peak, fraction);
        if (fraction >= .95) reading.saturatedSeconds += world.dt;
      }
      if (control.end) {
        if (control.end !== "done") break;
        verified ||= run.reached(g, destination);
        if (destination === "standing" ? body.view.down : g.spin > 15) break;
        if (world.time - control.ended >= 2) { survived = true; break; }
      } else if (control.candidateFrom !== null && world.time - control.candidateFrom >= cap
        || control.from === null && world.time >= cap) { control.end = "timed-out"; run.end(); break; }
    }
    return { ...job, factor, destination, reached: control.end === "done" && verified, survived, end: control.end ?? "timed-out", phase: run.phase,
      seconds: control.ended === null ? cap : control.ended - control.candidateFrom,
      endedAt: control.ended ?? world.time, candidateBegun: control.candidateFrom !== null, trail, saturation,
      predecessor: control.predecessor, predecessorSeconds: control.predecessorSeconds,
      balance: 0, assist: { force: body.assist.given.force.length(), moment: body.assist.given.moment.length() } };
  } finally { body.dispose(); built.dispose(); world.dispose(); scene.dispose(); engine.dispose(); }
}
