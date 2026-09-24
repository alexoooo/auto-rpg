/**
 * What a striker arrives with: effective-mass ground truth from the solver.
 *
 *     node tests/harness/impact-bench.mjs
 *     node tests/harness/impact-bench.mjs --modules effector.wrist.blade,effector.wrist.fist --json
 *
 * `docs/plans/2026-09-23-physical-contact-01-measure.md` section 4, and the ground truth session 05's
 * computed effective mass is validated against. Two instruments, both on the effector bench stand
 * (`buildGolemStand`, NullEngine, real Havok, no rendering):
 *
 * **The tap** (`tapProbe`). The module is driven to a pose and held there, then gravity is turned
 * off and every motor the module built -- the chain's joint motors and the anchor drive's -- has its
 * ceiling set to zero, so the joints are free, which is the honest reading of an instant of impact:
 * a motor cannot respond inside a contact. A known impulse `J` is applied at the striker's contact
 * point along a normal `n`, solver substeps run until the reading settles (a Havok weld takes a
 * few to carry the tap through -- `firstSubstepKg` is the one-substep reading session 01 took), and
 * the point's velocity change along `n` gives `m_eff = J / (dv . n)`. That is exactly the operational-space mass `1 / (n^T J M^-1 J^T n)` the
 * model computes, measured through Havok's own articulation -- **with the stand as the base, and the
 * stand is keyframed, so the base is infinitely heavy.** A chain in a body stands on a trunk of
 * finite mass; the model computes both and this bench can only check the first.
 *
 * Also reported: the striker body's own response before the substep (`freeKg`, the body alone, no
 * constraint yet), so the share of the chain behind it is visible.
 *
 * **The stroke** (`strokeProbe`). The module's own stroke, the script `runStrokeBench` plays, into a
 * free, gravity-free sphere hung at the stroke's mark. The sphere's velocity change is read **at
 * separation** -- the first substep with no contact after the contact began -- because the anchor
 * keeps driving through a contact and a later reading adds the motor's push. The striker's closing
 * speed is its point velocity on the substep *before* the contact, from the body's own velocities
 * (the collision event arrives after the solver has already resolved it). The implied plastic
 * effective mass is `M dv / (v - dv)`, and the pair's restitution `e = (u_sphere - u_striker) / v`
 * along the normal. The contact's length in substeps is reported beside each: a contact long enough
 * for the drive to matter is not an impulsive one.
 */
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { PhysicsConstraintAxis, PhysicsConstraintAxisLimitMode, PhysicsMotionType, PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin.js";
import { pathToFileURL } from "node:url";
import { Logger } from "@babylonjs/core/Misc/logger.js";

import { BUTTON_REACH } from "../../src/buttons.ts";
import { CONFIG } from "../../src/config.ts";
import { resolveAttributes } from "../../src/golem/attributes.ts";
import { GOLEM_MODULES, golemModule } from "../../src/golem/registry.ts";
import { buildGolemStand, golemLayers } from "../../src/golem/stand.ts";
import { COLLIDES, LAYER } from "../../src/physics.ts";
import { effectiveMassAt } from "../../src/body-inertia.ts";
import { jointsOf } from "../../src/rig.ts";
import { createHeadlessArena } from "./golem-headless-arena.mjs";
import { weaponOf } from "./golem-bench.mjs";

export const HARNESS = "the Node impact bench (tests/harness/impact-bench.mjs, bench stand, NullEngine, real Havok)";
const FRAME = 1 / 60;
const SUBSTEP = 1 / CONFIG.world.physicsHz;

/** The strikers of the plan's list, by the module that carries them on the stand. */
export const IMPACT_MODULES = Object.freeze([
  "effector.wrist.blade", "effector.wrist.fist", "effector.wrist.mace", "effector.wrist.maul",
  "effector.wrist.whip", "effector.wrist.plate", "effector.none", "effector.anatomical.fist",
  "effector.skeletal.blade", "effector.pitch.blade", "effector.anatomical.blade",
]);

const blankHand = () => ({ pointerX: 0, pointerY: 0, reach: BUTTON_REACH.neutral, roll: 0, wristBend: 0,
  thrust: false, guard: false });
const benchIntent = () => ({ forward: 0, strafe: 0, turn: 0, actingHand: "primary",
  natural: { thrust: false, guard: false }, posture: { trunkLean: 0, trunkTwist: 0, crouch: 0 },
  primary: blankHand(), secondary: blankHand() });

/** Stand one module up and capture every constraint it builds, so its motors can be released. */
export async function standUp(moduleId, attributes) {
  const option = golemModule(moduleId);
  if (!option) throw new Error(`no registered golem module "${moduleId}"; known: ${GOLEM_MODULES.map((o) => o.id).join(", ")}`);
  const arena = await createHeadlessArena();
  const scene = arena.scene;
  const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
  const constraints = [];
  const init = plugin.initConstraint.bind(plugin);
  plugin.initConstraint = (constraint, ...rest) => { constraints.push(constraint); return init(constraint, ...rest); };
  const stand = buildGolemStand(scene, { side: "left", ground: Vector3.Zero(), facing: Quaternion.Identity() });
  const module = option.build({ scene, side: "left", name: "golem.left.primary", socket: stand.socket("primary"),
    companion: stand.socket("secondary"), layers: golemLayers("left"), materials: stand.materials,
    ...(attributes ? { attributes: resolveAttributes({ attributes }) } : {}) });
  plugin.initConstraint = init;
  for (const part of module.parts) plugin.setActivationControl(part.part.body, 1);
  const intent = benchIntent();
  let driving = true;
  const control = scene.onBeforePhysicsObservable.add(() => { if (driving) module.step(SUBSTEP); });
  const frames = (seconds) => {
    for (let i = 0; i < Math.round(seconds / FRAME); i++) {
      module.command(intent);
      scene._renderId += 1;
      scene._advancePhysicsEngineStep(1000 * FRAME);
    }
  };
  const release = () => {
    driving = false;
    scene.getPhysicsEngine().setGravity(new Vector3(0, 0, 0));
    const axes = [PhysicsConstraintAxis.LINEAR_X, PhysicsConstraintAxis.LINEAR_Y, PhysicsConstraintAxis.LINEAR_Z,
      PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintAxis.ANGULAR_Y, PhysicsConstraintAxis.ANGULAR_Z];
    for (const constraint of constraints) {
      for (const axis of axes) {
        try { plugin.setAxisMotorMaxForce(constraint, axis, 0); } catch { /* an axis with no motor */ }
      }
    }
  };
  const dispose = () => {
    scene.onBeforePhysicsObservable.remove(control);
    module.dispose(); stand.dispose(); arena.dispose();
  };
  return { option, scene, plugin, module, intent, frames, release, dispose, constraints, socket: stand.socket("primary").world.clone(),
    standBody: stand.socket("primary").mount.body };
}

const AXES = [PhysicsConstraintAxis.LINEAR_X, PhysicsConstraintAxis.LINEAR_Y, PhysicsConstraintAxis.LINEAR_Z,
  PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintAxis.ANGULAR_Y, PhysicsConstraintAxis.ANGULAR_Z];
const unit = (v) => v.scale(1 / Math.max(1e-12, v.length()));

/**
 * Session 05's model at a contact, three ways: with the stand pinned, which is what the tap measures
 * and so checks the chain walk; floating, the reading a bout uses; and floating through the parts' own
 * solids rather than the solver's conditioned properties, which is what the stroke ruled out.
 */
export function modelReadings(pinned, body, point, n) {
  return {
    modelPinnedKg: effectiveMassAt(body, point, n, { pinned }),
    modelFloatingKg: effectiveMassAt(body, point, n),
    modelSolidFloatingKg: effectiveMassAt(body, point, n, { inertia: "geometric" }),
  };
}

/**
 * One tap: the module held at `pose` (a hand's command fields), then released and struck.
 * `normal` is `"edge"` (across the blade, a cut or a swing) or `"axis"` (along it, a thrust).
 */
export async function tapProbe({ moduleId, pose = {}, normal = "edge", attributes = null, settleSeconds = 1.5,
  targetDv = 0.3 }) {
  const bench = await standUp(moduleId, attributes);
  try {
    Object.assign(bench.intent.primary, pose);
    bench.frames(settleSeconds);
    const striker = bench.module.strikers[0];
    if (!striker) throw new Error(`${moduleId} has no striker`);
    const point = striker.tipPosition().clone();
    const n = unit((normal === "axis" ? striker.bladeDirection() : striker.edgeDirection()).clone());
    bench.release();
    // One quiet substep with nothing applied, so the reading below is a difference from a body at
    // rest rather than from one still carrying the drive's last correction.
    bench.scene._renderId += 1;
    bench.scene._advancePhysicsEngineStep(1000 * SUBSTEP);
    const model = modelReadings(new Set([bench.standBody]), striker.body, point, n);
    const before = Vector3.Dot(striker.velocityAt(point), n);
    const bodyMass = striker.body.getMassProperties().mass;
    const impulse = targetDv * Math.max(0.2, bench.option.massKg ?? bodyMass);
    striker.body.applyImpulse(n.scale(impulse), point);
    const free = Vector3.Dot(striker.velocityAt(point), n) - before;
    // **The chain's reading is taken once it stops ringing, not after one substep.** A weld is soft
    // in Havok and takes a few substeps to carry the tap through: on the pitch blade the reading
    // after one substep was 0.795 kg and then 0.621, 0.659, 0.650, against a rigid pair's 0.645
    // (physical contact session 05, this bench). Step until two readings agree to 2 %, at most eight
    // substeps -- 33 ms, in which a chain coasting at a few tenths of a metre a second barely moves.
    const reading = () => { const dv = Vector3.Dot(striker.velocityAt(point), n) - before; return dv > 1e-9 ? impulse / dv : Infinity; };
    let firstSubstepKg = null, chainKg = Infinity, substeps = 0;
    for (let previous = null; substeps < 8; previous = chainKg) {
      bench.scene._renderId += 1;
      bench.scene._advancePhysicsEngineStep(1000 * SUBSTEP);
      substeps += 1;
      chainKg = reading();
      firstSubstepKg ??= chainKg;
      if (previous !== null && Math.abs(chainKg - previous) <= 0.02 * Math.abs(chainKg)) break;
    }
    return {
      moduleId, pose, normal, impulseNs: impulse, strikerBodyKg: bodyMass, tipFromSocketM: Vector3.Distance(point, bench.socket),
      freeKg: free > 1e-9 ? impulse / free : Infinity,
      chainKg, firstSubstepKg, settleSubsteps: substeps,
      ...model,
      point: point.asArray(), normalVector: n.asArray(),
    };
  } finally { bench.dispose(); }
}

/**
 * One stroke into a hanging sphere of `massKg`. `touched: false` where the stroke never reached it.
 *
 * Two passes of the same deterministic stroke. The first, with nothing in the way, finds the substep
 * of peak tip speed inside the stroke phase and where the tip and the blade were then. The second
 * hangs the sphere there -- its centre one radius back along the blade from the tip, so the edge
 * near the tip is what meets it -- at the end of the chamber, the pose the stroke leaves from and so
 * the one furthest from where it arrives, and reads the collision. The guard hold is lengthened to
 * 1.5 s so the arm is settled first; what the stroke does after the guard does not depend on how
 * long the guard lasted. A sphere that is touched within two substeps of appearing was hung inside
 * the arm, and its row says `overlapped` rather than reporting a collision nothing swung.
 */
export async function strokeProbe({ moduleId, massKg = 20, radiusM = 0.15, attributes = null, guardSeconds = 1.5,
  releaseOnContact = false, freeStopsOnContact = false }) {
  const { runGolemBench, strokeSequence, capabilityOf, markFor } = await import("./golem-bench.mjs");
  const { GOLEM_TACTICS, STROKE_SHAPES } = await import("../../src/golem/tactics.ts");
  const kind = weaponOf(moduleId);
  let window = null;
  const sequence = ({ module, socket }) => {
    const cap = capabilityOf(module);
    const envelope = module.envelope();
    const mark = markFor(socket, envelope, cap, {});
    const script = strokeSequence({ shape: STROKE_SHAPES[kind], cap, socket: socket.world, mark, reach: envelope.reach,
      outboard: socket.outboard, guardSeconds, guardReach: kind === "shield" || kind === "buckler"
        ? GOLEM_TACTICS.shieldReach : GOLEM_TACTICS.guardReach });
    const at = (name) => script.find((phase) => phase.name === name)?.until;
    window = { from: at("chamber") ?? guardSeconds, to: at("follow") ?? at("stroke") ?? script[script.length - 1].until,
      hang: (at("chamber") ?? guardSeconds) - 0.05 };
    return script;
  };
  // Pass one: the peak of the stroke, unobstructed.
  let peak = null;
  await runGolemBench({ moduleId, attributes, sequence, probe: ({ t, module }) => {
    if (t < window.from || t > window.to) return;
    const striker = module.strikers[0];
    const tip = striker.tipPosition();
    const speed = striker.velocityAt(tip).length();
    if (!peak || speed > peak.speed) peak = { t, speed, tip: tip.clone(), blade: unit(striker.bladeDirection().clone()) };
  } });
  if (!peak) return { moduleId, massKg, touched: false };
  const centre = peak.tip.subtract(peak.blade.scale(radiusM));
  // Pass two: the same stroke into the sphere.
  let sphere = null, strikerBody = null, strikeOf = null;
  let model = null, struck = null;
  const built = [];
  const init = HavokPlugin.prototype.initConstraint;
  if (releaseOnContact || freeStopsOnContact) HavokPlugin.prototype.initConstraint = function (constraint, ...rest) { built.push(constraint); return init.call(this, constraint, ...rest); };
  let state = "waiting", contacts = 0, contactSubsteps = 0, normal = null, point = null, result = null, touchedAt = null, now = 0;
  const pre = { lin: new Vector3(), ang: new Vector3(), com: new Vector3() };
  const velocityAt = (lin, ang, com, at) => lin.add(Vector3.Cross(ang, at.subtract(com)));
  try { await runGolemBench({ moduleId, attributes, sequence, probe: ({ t, module }) => {
    now = t;
    if (!sphere) {
      if (t < window.hang) return;
      const scene = module.parts[0].part.mesh.getScene();
      if (releaseOnContact) {
        // From the first contact every motor ceiling is zero and stays zero whatever the control loop
        // writes: the stroke then arrives with the chain's momentum and no drive behind it, which is
        // what the model computes. The constraints themselves were captured as they were built.
        const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
        const write = plugin.setAxisMotorMaxForce.bind(plugin);
        plugin.setAxisMotorMaxForce = (constraint, axis, force) => write(constraint, axis, state === "waiting" ? force : 0);
      }
      strikeOf = module.strikers[0];
      strikerBody = strikeOf.body;
      const mesh = MeshBuilder.CreateSphere("impact.target", { diameter: 2 * radiusM, segments: 8 }, scene);
      mesh.position.copyFrom(centre);
      sphere = new PhysicsAggregate(mesh, PhysicsShapeType.SPHERE, { mass: massKg, friction: 0.5, restitution: 0 }, scene);
      sphere.shape.filterMembershipMask = LAYER.RIGHT_TRUNK;
      sphere.shape.filterCollideMask = COLLIDES.RIGHT_TRUNK;
      sphere.body.setGravityFactor(0);
      sphere.body.setCollisionCallbackEnabled(true);
      scene.getPhysicsEngine().getPhysicsPlugin().setActivationControl(sphere.body, 1);
      sphere.body.getCollisionObservable().add((event) => {
        contacts += 1;
        if (state === "waiting") {
          state = "touching"; touchedAt = now;
          if (releaseOnContact) for (const constraint of built) for (const axis of AXES) {
            try { scene.getPhysicsEngine().getPhysicsPlugin().setAxisMotorMaxForce(constraint, axis, 0); } catch { /* no motor */ }
          }
          // A diagnostic: every joint stop opened, so a joint that was resting on one is free too.
          if (freeStopsOnContact) for (const constraint of built) for (const axis of AXES.slice(3)) {
            const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
            if (plugin.getAxisMode(constraint, axis) === PhysicsConstraintAxisLimitMode.LIMITED) plugin.setAxisMode(constraint, axis, PhysicsConstraintAxisLimitMode.FREE);
          }
          normal = event.normal?.clone() ?? null; point = event.point?.clone() ?? null;
          struck = event.collidedAgainst === sphere.body ? event.collider : event.collidedAgainst;
        }
      });
    }
    if (state === "waiting") {
      strikerBody.getLinearVelocityToRef(pre.lin);
      strikerBody.getAngularVelocityToRef(pre.ang);
      // From the centre of mass, which is where Havok's linear velocity belongs (`RigidStrike.centreOfMass`).
      pre.com.copyFrom(strikeOf.centreOfMass());
      return;
    }
    if (state !== "touching") return;
    // The model at the first contact, along the line to the sphere's centre, which is the contact
    // normal of a sphere; the stand is whatever in the striker's joint graph the solver does not move.
    if (!model && point) {
      const pinned = new Set();
      const seen = new Set([strikerBody]);
      for (const queue = [strikerBody]; queue.length > 0;) {
        const next = queue.pop();
        if (next.getMotionType() !== PhysicsMotionType.DYNAMIC) pinned.add(next);
        for (const j of jointsOf(next)) for (const other of [j.parent.body, j.child.body]) {
          if (!seen.has(other)) { seen.add(other); queue.push(other); }
        }
      }
      model = modelReadings(pinned, strikerBody, point, unit(sphere.body.transformNode.position.subtract(point)));
    }
    // The last substep either still had the sphere in contact or it did not.
    if (contacts > 0) { contactSubsteps += 1; contacts = 0; return; }
    const sphereCentre = sphere.body.transformNode.position;
    const sphereVelocity = new Vector3();
    sphere.body.getLinearVelocityToRef(sphereVelocity);
    // The normal is the direction the sphere was sent: exact for a sphere, whose contact normal
    // passes through its centre, and free of the event's sign convention.
    const n = unit(sphereVelocity.lengthSquared() > 1e-12 ? sphereVelocity.clone()
      : (point ? sphereCentre.subtract(point) : (normal ?? new Vector3(0, 0, 1))));
    const at = point ?? sphereCentre;
    const v = Vector3.Dot(velocityAt(pre.lin, pre.ang, pre.com, at), n);
    const u = Vector3.Dot(sphereVelocity, n);
    const lin = new Vector3(), ang = new Vector3();
    strikerBody.getLinearVelocityToRef(lin);
    strikerBody.getAngularVelocityToRef(ang);
    const after = Vector3.Dot(velocityAt(lin, ang, strikeOf.centreOfMass(), at), n);
    if (touchedAt - window.hang < 2.5 * SUBSTEP) { result = { overlapped: true, peakTipMps: peak.speed }; state = "done"; return; }
    result = { touchedAt: touchedAt - window.from, peakTipMps: peak.speed, closingMps: v, sphereDvMps: u,
      strikerAfterMps: after, contactSubsteps,
      plasticKg: v - u > 1e-6 ? massKg * u / (v - u) : Infinity,
      // The momentum the striker gave up for what the sphere took, which is the effective mass
      // whether or not the pair stuck together.
      momentumKg: v - after > 1e-6 ? massKg * u / (v - after) : Infinity,
      struckPart: struck?.transformNode?.name ?? null,
      restitution: v > 1e-6 ? (u - after) / v : null, ...(model ?? {}) };
    state = "done";
  } }); } finally { HavokPlugin.prototype.initConstraint = init; }
  return { moduleId, massKg, releaseOnContact, ...(result ?? { touched: false }) };
}

const kgText = (kg) => kg === undefined ? "--" : Number.isFinite(kg) ? kg.toFixed(2) : "inf";

async function main() {
  Logger.LogLevels = Logger.ErrorLogLevel;
  const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
  const modules = args.modules ? args.modules.split(",") : IMPACT_MODULES;
  const presets = { x1: null, max: (await import("../../research/stat-sweep.mjs")).ATTRIBUTE_PRESETS.max() };
  const rows = [];
  for (const moduleId of modules) {
    for (const [level, attributes] of Object.entries(presets)) {
      for (const [poseName, pose] of Object.entries({ guard: { reach: BUTTON_REACH.guard }, extended: { reach: BUTTON_REACH.thrust } })) {
        for (const normal of ["edge", "axis"]) {
          const tap = await tapProbe({ moduleId, pose, normal, attributes });
          rows.push({ kind: "tap", level, ...tap, pose: poseName });
        }
      }
      for (const massKg of [5, 20, 90, 500]) {
        rows.push({ kind: "stroke", level, ...(await strokeProbe({ moduleId, massKg, attributes })) });
      }
    }
  }
  if ("json" in args) { console.log(JSON.stringify({ harness: HARNESS, rows }, null, 2)); return; }
  console.log(`${HARNESS}\n`);
  console.log("Tap: the effective mass at the striker's tip with the joints free, stand base (infinite).\n");
  console.log("| Module | Level | Pose | Tip from socket m | Normal | Striker body kg | Free kg | Chain kg |");
  console.log("| --- | --- | --- | ---: | --- | ---: | ---: | ---: |");
  for (const r of rows.filter((row) => row.kind === "tap")) {
    console.log(`| ${r.moduleId} | ${r.level} | ${r.pose} | ${r.tipFromSocketM.toFixed(2)} | ${r.normal} | ${r.strikerBodyKg.toFixed(2)} | ${r.freeKg.toFixed(2)} | ${Number.isFinite(r.chainKg) ? r.chainKg.toFixed(2) : "inf"} |`);
  }
  console.log("\nStroke into a free sphere, read at separation.\n");
  console.log("| Module | Level | Sphere kg | Peak tip m/s | Touch s | Closing m/s | Sphere dv m/s | Implied plastic kg | Restitution | Contact substeps | Model, stand kg | Model, floating kg | Model, own solids, floating kg |");
  console.log("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const r of rows.filter((row) => row.kind === "stroke")) {
    if (r.overlapped) { console.log(`| ${r.moduleId} | ${r.level} | ${r.massKg} | ${r.peakTipMps.toFixed(1)} | overlapped the arm when hung | | | | | |`); continue; }
    if (r.touched === false) { console.log(`| ${r.moduleId} | ${r.level} | ${r.massKg} | no contact | | | | | | |`); continue; }
    console.log(`| ${r.moduleId} | ${r.level} | ${r.massKg} | ${r.peakTipMps.toFixed(1)} | ${r.touchedAt.toFixed(3)} | ${r.closingMps.toFixed(2)} | ${r.sphereDvMps.toFixed(3)} | ${Number.isFinite(r.plasticKg) ? r.plasticKg.toFixed(2) : "inf"} | ${r.restitution === null ? "--" : r.restitution.toFixed(2)} | ${r.contactSubsteps} | ${kgText(r.modelPinnedKg)} | ${kgText(r.modelFloatingKg)} | ${kgText(r.modelSolidFloatingKg)} |`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
