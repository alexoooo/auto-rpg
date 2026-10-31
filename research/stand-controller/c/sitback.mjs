/**
 * The redo: from the game's own hands and knees (the drill's placed `fours`), on a body variant, a
 * sequence that moves on only when the body has done each step:
 *   sit:     hands planted, the hips back toward the heels (shins and hands bear, the weight driven toward the feet);
 *   up:      the knees lifted, the weight onto the feet (front edge while the heels are up), the heels let down, the hands still touching;
 *   release: the hands' share to none, the arms forward, the squat held on the feet;
 *   climb:   Stand up (step-up's steady and climb) once quiet on both flat feet.
 * Postures are written here by hand, from each freedom's own zero. Node stand, core world, Rapier, 120 Hz, calm, no assist.
 *
 *   node sitback.mjs [--variant dorsi0.8] [--seeds 1-4] [--trace] [--record view/sitback]
 */
import "../../../tests/harness/preload-data.mjs";
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { commandedBody } from "../../../src/core/mind/host.ts";
import { buildBody } from "../../../src/core/build/build-body.ts";
import { loadEngine } from "../../../src/core/engine/engines.ts";
import { armedWith } from "../../../src/core/items/held.ts";
import { createWorld } from "../../../src/core/world.ts";
import { recoveryMeasurement } from "../../../src/core/control/recovery-measurement.ts";
import { observeBody } from "../../../src/core/observation.ts";
import { clockSenses } from "../../../src/core/mind/senses.ts";
import { kitOf } from "../../../src/core/mind/kit.ts";
import { partLookup } from "../../../src/entrants/game.ts";
import { PUNCHER } from "../../../src/entrants/classic/presets.ts";
import { STAND_CHECK } from "../../../src/lab/ground-mode.ts";
import { standUp } from "../../../src/core/recovery/ground/stand-up.ts";
import { groundReading, quietOnFeet } from "../../../src/core/recovery/ground/reading.ts";
import { placement } from "../../../research/rise-witness.mjs";
import { variantSpec } from "../bodies.mjs";
import { phasedRun } from "../phased-rise.ts";
import { turnOfToRef } from "../../../src/core/read-motion.ts";
import { poseDrive } from "../../../src/core/recovery/ground/technique.ts";

const both = (p) => Object.fromEntries(Object.entries(p).flatMap(([k, v]) => (k.includes("@") ? ["left", "right"].map((s) => [k.replace("@", s), v]) : [[k, v]])));
/** Child's pose on tucked toes: the hips back over the heels, the arms reaching forward to the planted hands, palms flat. */
export const SIT_BACK = both({ "lumbar flexion": 0.5, "thoracic flexion": 0.3, "neck flexion": 0.2, "shoulder.@ flexion": 2.5, "shoulder.@ abduction": 0.2, "shoulder.@ internal rotation": -0.4,
  "elbow.@ flexion": 0.1, "wrist.@ flexion": -1.0, "hip.@ flexion": 2.3, "hip.@ abduction": 0.1, "knee.@ flexion": 2.55, "ankle.@ dorsiflexion": 0.75 });
/** Sat upright on the heels on tucked toes, hands off, the arms forward: the weight over the feet. */
export const TUCK_SIT = both({ "lumbar flexion": 0, "thoracic flexion": 0.1, "neck flexion": 0, "shoulder.@ flexion": 0.9, "shoulder.@ abduction": 0.15, "shoulder.@ internal rotation": 0,
  "elbow.@ flexion": 0.3, "wrist.@ flexion": 0, "hip.@ flexion": 1.2, "hip.@ abduction": 0.15, "knee.@ flexion": 2.55, "ankle.@ dorsiflexion": 0.75 });
/** The game's own sit (`SIT`, `src/core/recovery/rise/stages.ts`): sat back on the heels, hands off, toes let out. */
export const GAME_SIT = both({ "lumbar flexion": -0.2, "shoulder.@ flexion": 0.6, "shoulder.@ abduction": 0.2, "wrist.@ flexion": -1, "hip.@ flexion": 2, "knee.@ flexion": 2.55, "ankle.@ dorsiflexion": -0.4 });
/** A deep squat with the hands still touching the floor ahead of the feet, palms flat, feet about hip-width. */
export const SQUAT_HANDS = both({ "lumbar flexion": 0.6, "thoracic flexion": 0.3, "neck flexion": 0, "shoulder.@ flexion": 1.6, "shoulder.@ abduction": 0.2, "shoulder.@ internal rotation": -0.3,
  "elbow.@ flexion": 0.2, "wrist.@ flexion": -0.9, "hip.@ flexion": 2.1, "hip.@ abduction": 0.2, "knee.@ flexion": 2.4, "ankle.@ dorsiflexion": 0.75 });
/** The deep squat, the hands off, the arms reaching forward as a counterweight. */
export const SQUAT = both({ "lumbar flexion": 0.5, "thoracic flexion": 0.2, "neck flexion": -0.3, "shoulder.@ flexion": 1.4, "shoulder.@ abduction": 0.15, "shoulder.@ internal rotation": 0,
  "elbow.@ flexion": 0.4, "wrist.@ flexion": 0, "hip.@ flexion": 2.0, "hip.@ abduction": 0.2, "knee.@ flexion": 2.4, "ankle.@ dorsiflexion": 0.75 });

/** The game's hands and knees (`FOURS`, `src/core/recovery/rise/stages.ts`). */
export const FOURS = both({ "lumbar flexion": 0.3, "thoracic flexion": 0.2, "shoulder.@ flexion": 1.9, "shoulder.@ abduction": 0.3, "shoulder.@ internal rotation": -0.4,
  "elbow.@ flexion": 0.3, "wrist.@ flexion": -0.8, "hip.@ flexion": 1.9, "knee.@ flexion": 2.4, "ankle.@ dorsiflexion": 0.38 });

/** Kneeling upright on the heels, toes tucked: the trunk over the hips, the arms forward as a counterweight. */
export const UPRIGHT = both({ "lumbar flexion": 0, "thoracic flexion": 0.1, "neck flexion": 0, "shoulder.@ flexion": 1.2, "shoulder.@ abduction": 0.15, "shoulder.@ internal rotation": 0,
  "elbow.@ flexion": 0.3, "wrist.@ flexion": 0, "hip.@ flexion": 0.6, "hip.@ abduction": 0.15, "knee.@ flexion": 2.57, "ankle.@ dorsiflexion": 0.7 });

/** Each stage's bear aims (as phasedRun takes a phase), its exit test, and the most time it gets, s. */
/**
 * The rise that watches the weight: from wherever the sit left the body (hips on the heels, toes
 * tucked, trunk forward) toward kneeling upright (`UPRIGHT`, the elbows straight so the hands push),
 * along a progress `s` from 0 to 1 that advances only while both feet carry at least `foot` of the
 * weight and the body moves slower than `speed`, and otherwise holds (or backs off at `back`/s);
 * a foot carrying less than `press` of the weight has its hip bent by `gain` per unit short, which
 * turns that leg down onto its toes. Done kneeling upright and still on both feet.
 */
export function watchStage(o = {}) {
  const target = { ...UPRIGHT, ...both({ "elbow.@ flexion": 0 }), ...both(o.watchPosture ?? {}) };
  const foot = o.watchFoot ?? .08, press = o.watchPress ?? .12, gain = o.watchGain ?? 2, speed = o.watchSpeed ?? .3;
  let from = null, s = 0, rate = 0;
  const smooth = (u) => u * u * (3 - 2 * u);
  return { name: "rise", pose: true, top: o.watchTop ?? 2, phase: { posture: target },
    postureOf(read, g, _r, dt, control) {
      from ??= Object.fromEntries(Object.keys(target).map((k) => [k, read(k)]));
      const up = o.watchByHeight ? Math.max(_r.ball[0], _r.ball[1]) : 0;
      const ok = (o.watchByHeight ? up < (o.watchLift ?? .015) : Math.min(g.footLoad[0], g.footLoad[1]) > foot) && g.velocity.length() < speed;
      if (!ok) { const k = up >= (o.watchLift ?? .015) ? "lift" : "speed"; control.paused ??= { lift: 0, speed: 0 }; control.paused[k] += dt; }
      // With `watchEase`, the rate is eased toward its aim (time constant `watchEase` s), so the rise slows and resumes rather than stopping dead.
      // With `watchGraded`, the rate falls with the higher ball, from full at the floor to none at `watchLift`.
      const lift = o.watchLift ?? .015, aim = o.watchGraded && g.velocity.length() < speed ? (o.watchRate ?? .6) * Math.max(0, Math.min(1, (lift - up) / (lift - (o.watchGraded === true ? 0 : o.watchGraded)))) : ok ? (o.watchRate ?? .6) : -(o.watchBack ?? 0);
      rate = o.watchEase ? rate + (aim - rate) * Math.min(1, dt / o.watchEase) : aim;
      control.slowed = (control.slowed ?? 0) + Math.max(0, 1 - rate / (o.watchRate ?? .6)) * dt;
      s = Math.min(1, Math.max(0, s + rate * dt));
      control.progress = s;
      const p = {};
      const u = o.watchSmooth ? smooth(s) : s;
      for (const k of Object.keys(target)) p[k] = from[k] + (target[k] - from[k]) * u;
      ["left", "right"].forEach((side, i) => {
        const over = Math.max(0, _r.ball[i] - (o.watchPressFrom ?? (o.watchLift ?? .015) / 2));
        p[`hip.${side} flexion`] += o.watchByHeight ? (o.watchHeightGain ?? 8) * over : gain * Math.max(0, press - g.footLoad[i]);
        // A lifting foot's ankle bends further (`watchAnkleGain` rad a metre), turning its ball down.
        p[`ankle.${side} dorsiflexion`] += (o.watchAnkleGain ?? 0) * over;
      });
      return p;
    },
    done: (r, g) => s >= (o.watchEnd ?? 1) && g.upright >= (o.watchUpright ?? 0) && g.footLoad[0] > (o.watchEach ?? .05) && g.footLoad[1] > (o.watchEach ?? .05) && g.velocity.length() < (o.watchStill ?? .1) && r.hipsToFeet < (o.watchDone ?? .35), hold: o.watchHold ?? .2, most: o.watchMost ?? 4 };
}

export const STAGES = (o = {}) => [
  ...(o.plant ? [{ name: "plant", pose: true, top: o.plantTop ?? 2, phase: { posture: { ...FOURS, ...both({ "ankle.@ dorsiflexion": o.plantAnkle ?? .7 }) } },
    // A foot still over the floor bends its ankle further, by `plantGain` rad a metre, until it touches.
    ...(o.plantWatch ? { postureOf(read, _g, r) { const p = { ...FOURS, ...both({ "ankle.@ dorsiflexion": o.plantAnkle ?? .7 }) };
      ["left", "right"].forEach((side, i) => { p[`ankle.${side} dorsiflexion`] += (o.plantGain ?? 10) * Math.max(0, r.ball[i] - .002); // An ankle already at its stop (`plantStop`, rad) has the hip bend in its place.
      if (read(`ankle.${side} dorsiflexion`) >= (o.plantStop ?? .8)) p[`hip.${side} flexion`] += (o.plantHipGain ?? 0) * Math.max(0, r.ball[i] - .002); }); return p; } } : {}),
    done: (r, g) => [0, 1].every((i) => g.footLoad[i] > (o.plantLoad ?? .05) || (o.plantTouch !== undefined && r.ball[i] < o.plantTouch)), hold: o.plantHold ?? .1, most: 1 }] : []),
  ...(o.noSit ? [] : [{ name: "sit", pose: o.sitPose ?? true, top: o.sitTop ?? 3, phase: { posture: o.sitPosture ? { ...TUCK_SIT, ...both(o.sitPosture) } : o.tuckSit ? TUCK_SIT : o.gameSit ? GAME_SIT : SIT_BACK, response: o.sitResponse ?? .35, pitch: o.sitPitch ?? 1.1, toward: o.sitToward ?? .15, height: o.sitHeight ?? .3, along: 0, up: 0, shin: o.sitShin ?? .4, hand: o.sitHand ?? .1, foot: o.sitFoot ?? 0 },
    done: (r) => o.sitDoneKnee ? r.knee > o.sitDoneKnee : r.hipsToFeet < (o.sitDone ?? .2) && (o.sitOnFeet ? r.feet > .5 : r.shins > .5), hold: o.sitDoneKnee ? (o.sitHold ?? .3) : .05, most: o.sitMost ?? 1.5 }]),
  ...(o.watch ? [watchStage(o)] : []),
  ...(o.upright ? [{ name: "upright", pose: true, top: o.uprightRate ?? .8, phase: { posture: { ...UPRIGHT, ...both(o.uprightPosture ?? {}) } },
    done: (r, g) => o.uprightStill ? g.footLoad[0] > .1 && g.footLoad[1] > .1 && r.feet > (o.uprightFeet ?? .4) && g.velocity.length() < .1 && r.hipsToFeet < (o.uprightDone ?? .35)
      : r.hipsToFeet < (o.uprightDone ?? .2) && r.feet > .5, hold: .2, most: o.uprightMost ?? 3 }] : []),
  { name: "up", phase: { posture: SQUAT_HANDS, response: o.upResponse ?? .3, pitch: o.upPitch ?? .9, toward: o.upToward ?? .05, height: o.upHeight ?? .42, along: 0, up: 0, shin: 0, hand: o.upHand ?? .15, foot: .5 },
    done: (r) => r.flat === 2 && r.feet > (o.upFeet ?? .7), most: 1.5 },
  { name: "release", phase: { posture: SQUAT, response: o.relResponse ?? .3, pitch: o.relPitch ?? .7, toward: 0, height: o.relHeight ?? .45, along: 0, up: 0, shin: 0, hand: 0, foot: .5 },
    done: (r, g) => quietOnFeet(g) && g.height < .9, hold: .1, most: 2 },
];

export async function sitbackTrial({ variant = "dorsi0.8", held = "empty", seed = 1, options = {}, trace = false, record = false, cap = 7 }) {
  const spec = armedWith(variantSpec("workshop-fighter", variant), "right", held), placed = placement("push-off-bear", spec, seed);
  if ("refused" in placed) return { seed, refused: placed.refused };
  const engine = new NullEngine(), scene = new Scene(engine), world = createWorld(scene, await loadEngine("rapier"));
  world.physics.addFixedBox([0, -.5, 0], [40, 1, 40]);
  const built = buildBody(spec, world, placed);
  const all = STAGES(options), stages = options.stopAfter ? all.slice(0, all.findIndex((x) => x.name === options.stopAfter) + 1) : all;
  const control = { progress: null, k: 0, since: 0, held: 0, stage: stages[0].name, log: [], ended: null, climbAt: null, handBack: null };
  const index = (name) => spec.segments.findIndex((s) => s.name === name);
  const SHANK = [index("shank.left"), index("shank.right")], HAND = [index("hand.left"), index("hand.right"), index("forearm.left"), index("forearm.right")];
  let reader = null, readout = null;
  let own0 = null;
  const body = commandedBody(built, world, { servoSeconds: .1, subs: [(own, view, clock) => {
    const kit = kitOf(partLookup, own.spec, PUNCHER); own0 = own;
    let run = null, stand = null; const drive = poseDrive(own.muscles);
    // The ball of a foot (the sole box's front edge at its middle): its height above the floor, m.
    const ballHeight = (side) => { const f = own.built.segments.get(`foot.${side}`), sh = f.spec.shape, d = sh.centre.value.map((v, k) => v - f.frame.origin[k]);
      const c = [f.frame.x, f.frame.y, f.frame.z].map((a) => d[0] * a[0] + d[1] * a[1] + d[2] * a[2]);
      return new Vector3(c[0], c[1] + sh.size.value[1] / 2, c[2] + sh.size.value[2] / 2).applyRotationQuaternion(f.node.rotationQuaternion).y + f.node.position.y; };
    const kneeIndex = own.muscles.channels.findIndex((c) => c.name === "knee.left flexion");
    const kneeAngle = () => own.muscles.angle(kneeIndex) + own.muscles.channels[kneeIndex].dof.spec.bind.value;
    return { name: "sitback", state: { control }, wants: () => control.ended === null, begin() {}, end() {},
      step(_s, dt) {
        reader ??= groundReading(own.built, dt);
        const g = reader.read();
        const fl = own.built.segments.get("foot.left").node.position, fr = own.built.segments.get("foot.right").node.position;
        const fx = (fl.x + fr.x) / 2, fz = (fl.z + fr.z) / 2;
        readout = { hipsToFeet: Math.hypot(g.centre.x - fx, g.centre.z - fz), shins: SHANK.reduce((a, i) => a + g.load[i], 0), hands: HAND.reduce((a, i) => a + g.load[i], 0),
          feet: g.footLoad[0] + g.footLoad[1], flat: g.flat[0] + g.flat[1], knee: kneeAngle(), ball: [ballHeight("left"), ballHeight("right")] };
        if (control.stage === "climb" && options.toStance) {
          // The stance is asked to face the way the pelvis faces now (as `phasedRun` reads a heading), not the reference pose's way.
          if (options.keepHeading) { const q = new Quaternion(); turnOfToRef(own.muscles.dynamics.root.segment, q); const a = new Vector3(1, 0, 0).applyRotationQuaternion(q); control.heading = Math.atan2(-a.z, a.x); }
          control.ended = "handed back"; control.climbAt = view.time; control.handBack = view.time; return; }
        if (control.stage === "climb") {
          if (!stand) { stand = standUp(own, view, clock, { kind: "stand-up", techniques: [{ kind: "step-up" }] }, kit); stand.begin(); control.climbAt = view.time; }
          stand.step(null, dt);
          if (!stand.state.active) { control.ended = "handed back"; control.handBack = view.time; }
          return;
        }
        const stage = stages[control.k];
        if (stage.pose) {
          drive(stage.postureOf ? stage.postureOf((name) => { const i = own.muscles.channels.findIndex((c) => c.name === name); return own.muscles.angle(i) + own.muscles.channels[i].dof.spec.bind.value; }, g, readout, dt, control) : stage.phase.posture, .2, stage.top, 1);
          control.since += dt;
          if (g.position === "back" || g.position === "left" || g.position === "right") { control.ended = `${stage.name}: down (${g.position}) at ${view.time.toFixed(2)}`; return; }
          control.held = stage.done(readout, g) ? control.held + dt : 0;
          if (control.held + 1e-9 >= (stage.hold ?? .05)) { control.log.push(`${stage.name} ${view.time.toFixed(2)}${stage.name === "rise" ? ` (s ${control.progress.toFixed(2)}, feet ${g.footLoad.map((x) => x.toFixed(2))}, upright ${g.upright.toFixed(2)}, hips ${readout.hipsToFeet.toFixed(2)})` : ""}`); control.k++; control.since = 0; control.held = 0; run = null; control.stage = control.k < stages.length ? stages[control.k].name : "climb"; }
          else if (control.since > stage.most) control.ended = `${stage.name}: timed out at ${view.time.toFixed(2)}, progress ${control.progress?.toFixed(2)}, each foot ${g.footLoad.map((x) => x.toFixed(2))}, speed ${g.velocity.length().toFixed(2)} (${JSON.stringify(Object.fromEntries(Object.entries(readout).map(([k, v]) => [k, Array.isArray(v) ? v.map((x) => +x.toFixed(3)) : +v.toFixed(2)])))})`;
          return;
        }
        if (!run) { run = phasedRun(own, view, { from: "fours", phases: [{ kind: "bear", duration: 100, ...stage.phase }], hold: { kind: "bear", duration: 100, ...stage.phase } }, () => true); run.begin("left"); }
        const end = run.step(g, null, dt);
        control.since += dt;
        if (end === "failed" || g.position === "back" || g.position === "left" || g.position === "right") { control.ended = `${stage.name}: down (${g.position}) at ${view.time.toFixed(2)}`; return; }
        control.held = stage.done(readout, g) ? control.held + dt : 0;
        if (control.held + 1e-9 >= (stage.hold ?? .05)) {
          control.log.push(`${stage.name} ${view.time.toFixed(2)}`);
          control.k++; control.since = 0; control.held = 0; run = null;
          control.stage = control.k < stages.length ? stages[control.k].name : "climb";
        } else if (control.since > stage.most) control.ended = `${stage.name}: timed out at ${view.time.toFixed(2)}, progress ${control.progress?.toFixed(2)}, each foot ${g.footLoad.map((x) => x.toFixed(2))}, speed ${g.velocity.length().toFixed(2)} (${JSON.stringify(Object.fromEntries(Object.entries(readout).map(([k, v]) => [k, Array.isArray(v) ? v.map((x) => +x.toFixed(3)) : +v.toFixed(2)])))})`;
      } };
  }] });
  const standPosture = both(options.standPosture ?? {});
  // A sole's middle, world (x, z): the foot box's plantar face's centre.
  const soleMiddle = (side) => { const f = built.segments.get(`foot.${side}`), sh = f.spec.shape, d = sh.centre.value.map((v, k) => v - f.frame.origin[k]);
    const c = [f.frame.x, f.frame.y, f.frame.z].map((a) => d[0] * a[0] + d[1] * a[1] + d[2] * a[2]);
    const w = new Vector3(c[0], c[1], c[2] + sh.size.value[2] / 2).applyRotationQuaternion(f.node.rotationQuaternion).addInPlace(f.node.position); return [w.x, w.z]; };
  /**
   * With `closeStep`: once the stance has the body on both flat feet after taking over, the back foot
   * (the one that did not step) is carried up beside the front one, `closeWidth` m apart across the
   * pelvis, over `closeSeconds`, the weight shifted onto the front foot first; then both feet again.
   */
  /**
   * With `firstStep`: on taking over, the foot carrying less is carried forward to land `firstAhead` m
   * ahead of the centre of mass (along the way from the soles to it) and half `closeWidth` to its own
   * side, over `firstSeconds`, lifted `firstLift`, lifting at once (the body is on its knees, not its feet).
   */
  const first = { phase: options.firstStep ? "start" : "done", foot: null, to: null, at: 0 };
  const firstStance = (view, g) => {
    if (first.phase === "start") {
      const L = soleMiddle("left"), R = soleMiddle("right"), mx = (L[0] + R[0]) / 2, mz = (L[1] + R[1]) / 2;
      let fx = g.centre.x - mx, fz = g.centre.z - mz; const n = Math.hypot(fx, fz); fx /= n; fz /= n;
      first.foot = options.firstFoot ?? (g.footLoad[0] < g.footLoad[1] ? "left" : "right"); first.stand = first.foot === "left" ? "right" : "left";
      // Across, to the body's right: the forward way turned a quarter about up (x right, z forward: right = (fz, -fx)).
      const side = first.foot === "right" ? 1 : -1, w = (options.closeWidth ?? .2) / 2, d = options.firstAhead ?? 0;
      first.to = [g.centre.x + fx * d + side * w * fz, g.centre.z + fz * d - side * w * fx];
      first.phase = "swing"; first.at = view.time; control.firstAt = view.time;
    }
    if (first.phase === "swing") {
      const i = first.foot === "left" ? 0 : 1, m = soleMiddle(first.foot);
      if (options.closeLog && Math.round(view.time * 120) % 6 === 0) console.log(view.time.toFixed(2), "first", first.foot, "to", first.to.map((v) => v.toFixed(2)).join(","), "at", m.map((v) => v.toFixed(2)).join(","), "loads", g.footLoad.map((v) => v.toFixed(2)).join("/"), "centre", g.centre.x.toFixed(2), g.centre.z.toFixed(2), "phase", view.stance?.phase, "h", g.height.toFixed(2));
      if (view.time - first.at > (options.firstSeconds ?? .4) && g.footLoad[i] > .1 || view.time - first.at > 1.5) { first.phase = "done"; control.firstLanded = view.time; return null; }
      return { feet: [first.stand], centre: null, height: options.firstHeight === undefined ? view.standing - .03 : g.height * view.standing, heading: control.heading ?? 0,
        swing: { foot: first.foot, to: first.to, seconds: options.firstSeconds ?? .4, lift: options.firstLift ?? .08, shift: false } };
    }
    return null;
  };
  const close = { phase: "wait", foot: null, to: null, at: 0, from: null };
  const closeStance = (view, g) => {
    if (close.phase === "wait") {
      close.from ??= { left: soleMiddle("left"), right: soleMiddle("right") };
      if (!(g.flat[0] && g.flat[1] && g.footLoad[0] + g.footLoad[1] > .9) || view.time - control.climbAt < (options.closeAfter ?? 0)) return null;
      const moved = (side) => Math.hypot(soleMiddle(side)[0] - close.from[side][0], soleMiddle(side)[1] - close.from[side][1]);
      const front = moved("left") > moved("right") ? "left" : "right", back = front === "left" ? "right" : "left";
      const q = new Quaternion(); turnOfToRef(own0.muscles.dynamics.root.segment, q); const a = new Vector3(1, 0, 0).applyRotationQuaternion(q);
      const across = [a.x, a.z], n = Math.hypot(...across), sign = back === "right" ? 1 : -1, w = options.closeWidth ?? .2, fm = soleMiddle(front);
      close.to = [fm[0] + sign * w * across[0] / n, fm[1] + sign * w * across[1] / n];
      // Only a back foot further than `closeGap` m from its place is moved.
      const bm = soleMiddle(back);
      if (Math.hypot(bm[0] - close.to[0], bm[1] - close.to[1]) < (options.closeGap ?? .12)) { close.phase = "done"; return null; }
      close.phase = options.closeShift ? "shift" : "swing"; close.foot = back; close.front = front; close.at = view.time; control.closeAt = view.time;
    }
    // With `closeShift`: first the centre of mass is carried over the front sole's middle (`closeOver` of the way, from the soles' middle) and allowed to quiet, both feet bearing.
    if (close.phase === "shift") {
      const fm = soleMiddle(close.front), bm = soleMiddle(close.foot), k = options.closeOver ?? 1;
      const aim = [bm[0] + (fm[0] - bm[0]) * (.5 + .5 * k), bm[1] + (fm[1] - bm[1]) * (.5 + .5 * k)];
      if (options.closeLog && Math.round(view.time * 120) % 6 === 0) console.log(view.time.toFixed(2), "shift", "aim", aim.map((v) => v.toFixed(2)).join(","), "centre", g.centre.x.toFixed(2), g.centre.z.toFixed(2), "v", g.velocity.length().toFixed(2), "loads", g.footLoad.map((v) => v.toFixed(2)).join("/"));
      const near = Math.hypot(g.centre.x - aim[0], g.centre.z - aim[1]) < (options.closeNear ?? .04) && g.velocity.length() < (options.closeStill ?? .15);
      if (near || view.time - close.at > (options.closeShiftMost ?? 1.2)) { close.phase = "swing"; close.at = view.time; control.shifted = view.time; }
      else return { feet: ["left", "right"], centre: aim, height: view.standing - (options.closeDrop ?? .03), heading: control.heading ?? 0 };
    }
    if (close.phase === "swing") {
      const i = close.foot === "left" ? 0 : 1, bm = soleMiddle(close.foot);
      if (options.closeLog && Math.round(view.time * 120) % 6 === 0) console.log(view.time.toFixed(2), "close", close.foot, "to", close.to.map((v) => v.toFixed(2)).join(","), "back at", bm.map((v) => v.toFixed(2)).join(","), "front at", soleMiddle(close.front).map((v) => v.toFixed(2)).join(","), "loads", g.footLoad.map((v) => v.toFixed(2)).join("/"), "centre", g.centre.x.toFixed(2), g.centre.z.toFixed(2), "phase", own0.muscles && view.stance?.phase, "h", g.height.toFixed(2));
      if (view.time - close.at > (options.closeSeconds ?? .4) + (options.closePush ?? 0) && (g.footLoad[i] > .1 || view.stance?.phase === "stand") && Math.hypot(bm[0] - close.to[0], bm[1] - close.to[1]) < .05 || view.time - close.at > 1.5 + (options.closePush ?? 0)) { close.phase = "done"; control.closedAt = view.time; return null; }
      // With `closePush` s: a walk's double support first (`SwingGoal.transfer`), both feet bearing while the back one drives the
      // capture point to `closeHandover` of the way from the back sole's middle to the front's as it lifts.
      close.handover ??= (() => { const fm = soleMiddle(close.front), b0 = soleMiddle(close.foot), k = options.closeHandover ?? 1, e = options.closeToward ?? 0, mid = [(fm[0] + close.to[0]) / 2, (fm[1] + close.to[1]) / 2];
        const h = [b0[0] + (fm[0] - b0[0]) * k, b0[1] + (fm[1] - b0[1]) * k]; return [h[0] + (mid[0] - h[0]) * e, h[1] + (mid[1] - h[1]) * e]; })();
      const push = options.closePush ? { transfer: options.closePush, handover: close.handover } : {};
      return { feet: options.closeBoth ? ["left", "right"] : [close.front], centre: null, height: view.standing - .03, heading: control.heading ?? 0,
        swing: { foot: close.foot, to: close.to, seconds: options.closeSeconds ?? .4, lift: options.closeLift ?? .05, ...push } };
    }
    return null;
  };
  const standCommand = (view) => {
    const g = reader?.read(), swing = control.climbAt === null || !g ? null : firstStance(view, g) ?? (options.closeStep ? closeStance(view, g) : null);
    // With `rampHeight` s: the height asked rises from the body's own at the takeover to standing's, smoothly over that time.
    let height = view.standing - .03;
    if (options.rampHeight && control.climbAt !== null && g) { control.h0 ??= g.height * view.standing; const u = Math.min(1, (view.time - control.climbAt) / options.rampHeight); height = control.h0 + (height - control.h0) * u * u * (3 - 2 * u); }
    return { posture: standPosture, pushes: [], stance: swing ?? { feet: ["left", "right"], centre: null, height, heading: control.heading ?? 0 } };
  };
  body.drive(standCommand);
  const measure = recoveryMeasurement(built, observeBody(built, body.muscles, world, clockSenses(world), { contactPatches: true }));
  const rows = [], frames = [];
  let ballsSeen = null;
  let quiet = 0, verified = null, fell = false, steps = 0;
  try {
    while (world.time < (options.cap ?? cap) && (verified === null || world.time - verified < 1)) {
      world.step(); steps++;
      const m = measure();
      if (verified === null && control.climbAt !== null) { quiet = m.ready ? quiet + world.dt : 0; if (quiet + 1e-9 >= STAND_CHECK.quiet) verified = world.time; }
      if (verified !== null && m.observation.down) { fell = true; break; }
      if (control.climbAt !== null) { const g3 = reader.read(); if (control.bothFlat == null && g3.flat[0] && g3.flat[1] && g3.footLoad[0] + g3.footLoad[1] > .9) { control.bothFlat = world.time; } if (verified !== null && control.spread == null) { const a = built.segments.get("foot.left").node.position, b = built.segments.get("foot.right").node.position; control.spread = Math.hypot(a.x - b.x, a.z - b.z); } if (control.firstReady == null && m.ready) control.firstReady = world.time; }
      if (options.standLog && control.climbAt !== null && steps % 6 === 0) { const o = m.observation; let fast = null, top = 0;
        for (const sg of o.segments) { const v = Math.sqrt(sg.velocity.reduce((a, x) => a + x * x, 0)); if (v > top) { top = v; fast = sg.name ?? sg.segment; } }
        const touch = [...new Set(o.contacts.filter((c) => c.fixed !== null && c.impulse > 0).map((c) => c.segment))].join("+");
        const sp = (n) => { const sg = o.segments.find((x) => (x.name ?? x.segment) === n); return sg ? `${n} v${Math.sqrt(sg.velocity.reduce((a, x) => a + x * x, 0)).toFixed(2)} w${sg.spin.map((x) => x.toFixed(1)).join("/")}` : n; };
        if (options.standLog === 2) console.log(world.time.toFixed(2), ["upperTrunk", "lowerTrunk", "upperArm.left", "hand.left"].map(sp).join(" | ")); else console.log(world.time.toFixed(2), "ready", m.ready, "rootUp", m.rootUp.toFixed(2), "soleUp", m.soleUp.map((v) => v.toFixed(2)).join("/"), "fastest", fast, top.toFixed(2), "touching", touch, "centre", o.centre.map((v) => v.toFixed(2)).join(",")); }
      // Hesitation: time after the first 0.3 s, before the stance takes over, with the centre of mass slower than 5 cm/s.
      if (reader && control.climbAt === null && world.time > .3 && reader.read().velocity.length() < .05) control.still = (control.still ?? 0) + world.dt;
      if (readout?.ball && control.stage === "rise") { control.maxBall = Math.max(control.maxBall ?? 0, ...readout.ball); }
      if (options.afterLog && control.ended && steps % 24 === 0) { const g2 = reader.read(); console.log(`after ${world.time.toFixed(2)}: height ${(g2.height * 100).toFixed(0)}% of standing, feet carry ${((g2.footLoad[0] + g2.footLoad[1]) * 100).toFixed(0)}%, soles flat ${g2.flat[0] && g2.flat[1] ? "both" : "not both"}, speed ${g2.velocity.length().toFixed(2)} m/s, ready (the stand check) ${m.ready}, down ${m.observation.down}`); }
      if (control.ended && control.ended !== "handed back" && world.time > (control.endAt ??= world.time) + (options.after ?? 1)) break;
      const g = reader?.read();
      if (record && steps % 2 === 0 && g) {
        const parts = {};
        for (const [name, s] of built.segments) parts[name] = [...s.node.position.asArray().map((v) => +v.toFixed(4)), ...s.node.rotationQuaternion.asArray().map((v) => +v.toFixed(5))];
        frames.push({ t: +world.time.toFixed(3), progress: control.progress, phase: control.ended && control.ended !== "handed back" ? `${control.stage}, stopped: nothing drives the body` : control.stage, ...(built.toes["foot.left"] ? { toes: ["left", "right"].map((side) => built.toes[`foot.${side}`].bend) } : {}), feet: +(g.footLoad[0] + g.footLoad[1]).toFixed(2), flat: `${+g.flat[0]}${+g.flat[1]}`, h: +g.height.toFixed(2), parts });
      }
      const L = built.segments.get("foot.left").node.position, R = built.segments.get("foot.right").node.position;
      const realToFeet = g ? Math.hypot(g.centre.x - (L.x + R.x) / 2, g.centre.z - (L.z + R.z) / 2) : null;
      // Each foot: its long axis's angle from upright, deg, and its floor contact's points: how many, and their spread across and along the foot, cm.
      const footRead = (side) => {
        const f = built.segments.get(`foot.${side}`), turn = f.node.rotationQuaternion.multiply(Quaternion.Inverse(f.rest));
        const along = new Vector3(0, 0, 1).applyRotationQuaternion(turn), across = new Vector3(1, 0, 0).applyRotationQuaternion(turn);
        const pts = world.physics.contactManifoldsOf(f.body, (o) => o === null).flatMap((m) => m.points.filter((q) => q.distance <= .002).map((q) => q.point));
        const spread = (ax) => { const v = pts.map((q) => q[0] * ax.x + q[1] * ax.y + q[2] * ax.z); return v.length ? Math.round((Math.max(...v) - Math.min(...v)) * 100) : null; };
        return `${Math.round(Math.acos(Math.min(1, Math.abs(along.y))) * 180 / Math.PI)}° ${pts.length}pt ${spread(across)}x${spread(along)}cm`;
      };
      // Each foot's collision box as the physics has it (tucked or flat), its lowest corner's height, cm: below zero is in the floor.
      const lowest = (side) => {
        const f = built.segments.get(`foot.${side}`), sh = f.rigid.shapes[0], d = sh.centre.value.map((v, k) => v - f.frame.origin[k]);
        const box = { centre: [d[0] * f.frame.x[0] + d[1] * f.frame.x[1] + d[2] * f.frame.x[2], d[0] * f.frame.y[0] + d[1] * f.frame.y[1] + d[2] * f.frame.y[2], d[0] * f.frame.z[0] + d[1] * f.frame.z[1] + d[2] * f.frame.z[2]], size: sh.size.value };
        let low = Infinity; const v = new Vector3(), w = new Vector3();
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
          v.set(box.centre[0] + sx * box.size[0] / 2, box.centre[1] + sy * box.size[1] / 2, box.centre[2] + sz * box.size[2] / 2);
          v.applyRotationQuaternionToRef(f.node.rotationQuaternion, w); low = Math.min(low, w.y + f.node.position.y);
        }
        return +(low * 100).toFixed(1);
      };
      // What touches the body's own parts, with how hard (impulse, N s, summed over the step's pairs): names the pairs.
      const touching = () => { const names = new Map([...built.segments].map(([n, sg]) => [sg.body, n])), out = [];
        for (const [n, sg] of built.segments) for (const c of world.physics.contactsOf(sg.body)) if (c.other && names.get(c.other) > n && c.impulse > 0) out.push(`${n}~${names.get(c.other)} ${c.impulse.toFixed(2)}`);
        return out.join(", "); };
      const ang = (name) => { const i = body.muscles.channels.findIndex((c) => c.name === name); return +(body.muscles.angle(i) + body.muscles.channels[i].dof.spec.bind.value).toFixed(2); };
      // Each foot on the floor: the parts pressing (0 sole, 1 toes, 2 instep) with their force, N; the ball's height, cm, and its speed along the floor, cm/s.
      const ballOf = (side) => { const f = built.segments.get(`foot.${side}`), sh = f.spec.shape, d = sh.centre.value.map((v, k) => v - f.frame.origin[k]);
        const c = [f.frame.x, f.frame.y, f.frame.z].map((a) => d[0] * a[0] + d[1] * a[1] + d[2] * a[2]);
        const w = new Vector3(c[0], c[1] + sh.size.value[1] / 2, c[2] + sh.size.value[2] / 2).applyRotationQuaternion(f.node.rotationQuaternion).addInPlace(f.node.position); return w; };
      ballsSeen ??= {};
      const footFloor = (side) => { const f = built.segments.get(`foot.${side}`), by = [0, 0, 0];
        for (const m of world.physics.contactManifoldsOf(f.body, (o) => o === null)) by[m.mine] = (by[m.mine] ?? 0) + m.impulse / world.dt;
        const b = ballOf(side), last = ballsSeen[side]; ballsSeen[side] = b.clone();
        const slip = last ? Math.sqrt((b.x - last.x) ** 2 + (b.z - last.z) ** 2) / world.dt * 100 : 0;
        const t = built.toes[`foot.${side}`];
        return `${side[0]}: toes bent ${((t?.bend ?? 0) * 57.3).toFixed(0)}° sole ${by[0].toFixed(0)} toes ${by[1].toFixed(0)} instep ${(by[2] ?? 0).toFixed(0)} N, ball ${(b.y * 100).toFixed(1)} cm up, sliding ${slip.toFixed(0)} cm/s`; };
      const floorLine = `${footFloor("left")} | ${footFloor("right")}`;
      const legs = () => ["left", "right"].map((sd) => `${sd[0]} hip ${ang(`hip.${sd} flexion`)} abd ${ang(`hip.${sd} abduction`)} rot ${ang(`hip.${sd} internal rotation`)} knee ${ang(`knee.${sd} flexion`)} ank ${ang(`ankle.${sd} dorsiflexion`)}`).join(" | ");
      if (options.feetFloor && steps % 12 === 0 && readout) console.log(world.time.toFixed(2), control.stage, floorLine, options.legs ? `
      ${legs()}` : "");
      if (options.selfTouch && steps % 24 === 0 && readout) console.log(world.time.toFixed(2), control.stage, touching());
      if (options.motion && steps % 6 === 0 && readout && control.climbAt === null) { const pv = built.segments.get("lowerTrunk"), ut = built.segments.get("upperTrunk"), w = new Vector3(), w2 = new Vector3(); pv.body.angularVelocityToRef(w); ut.body.angularVelocityToRef(w2);
        console.log(world.time.toFixed(2), control.stage.padEnd(5), "s", (control.progress ?? 0).toFixed(2), "h", g.height.toFixed(2), "v", g.velocity.length().toFixed(2), "pelvis spin", w.length().toFixed(2), "chest spin", w2.length().toFixed(2), "hip", ang("hip.left flexion"), "knee", ang("knee.left flexion"), "lum", ang("lumbar flexion"), "sh", ang("shoulder.left flexion"), "hands", readout.hands.toFixed(2), "shins", readout.shins.toFixed(2)); }
      if (trace && steps % 12 === 0 && readout) rows.push({ t: +world.time.toFixed(2), hip: ang("hip.left flexion"), knee: ang("knee.left flexion"), ankle: ang("ankle.left dorsiflexion"), lum: ang("lumbar flexion"), toes: ["left", "right"].map((side) => Math.round((built.toes[`foot.${side}`]?.bend ?? 0) * 180 / Math.PI)).join("/"), lowL: lowest("left"), lowR: lowest("right"), footL: footRead("left"), footR: footRead("right"), real: +realToFeet.toFixed(2), cx: +g.centre.x.toFixed(2), cz: +g.centre.z.toFixed(2), fz: +((L.z + R.z) / 2).toFixed(2), stage: control.stage, pos: g?.raw, h: +g.height.toFixed(2), toFeet: +readout.hipsToFeet.toFixed(2),
        shins: +readout.shins.toFixed(2), hands: +readout.hands.toFixed(2), feet: +readout.feet.toFixed(2), flat: readout.flat, v: +g.velocity.length().toFixed(2) });
    }
  } finally { body.dispose?.(); world.dispose(); scene.dispose(); engine.dispose(); }
  const r = (v) => (v === null || v === undefined ? null : +v.toFixed(2));
  return { seed, feetApartStanding: r(control.spread ?? null), first: control.firstAt != null ? { at: r(control.firstAt), landed: r(control.firstLanded ?? null) } : null, closed: control.closeAt != null ? { at: r(control.closeAt), shifted: r(control.shifted ?? null), landed: r(control.closedAt ?? null) } : null, afterHandover: control.climbAt == null ? null : { feetDown: r((control.bothFlat ?? NaN) - control.climbAt), stillEnough: r((control.firstReady ?? NaN) - control.climbAt), checked: r(verified - control.climbAt) }, stillBeforeStance: r(control.still ?? 0), riseSlowed: r(control.slowed ?? 0), pausedInRise: control.paused ? { lift: r(control.paused.lift), speed: r(control.paused.speed) } : null, highestBallInRiseCm: control.maxBall == null ? null : +(control.maxBall * 100).toFixed(1), steps: control.log, ended: control.ended, climbAt: r(control.climbAt), verified: fell ? null : r(verified), fell, ...(trace ? { rows } : {}), ...(record ? { frames } : {}) };
}

if (process.argv[1]?.endsWith("sitback.mjs")) {
  const { values } = parseArgs({ options: { variant: { type: "string" }, held: { type: "string" }, seeds: { type: "string" }, trace: { type: "boolean" }, record: { type: "string" }, options: { type: "string" } } });
  const [lo, hi] = (values.seeds ?? "1-4").split("-").map(Number);
  for (let seed = lo; seed <= hi; seed++) {
    const out = await sitbackTrial({ variant: values.variant ?? "dorsi0.8", held: values.held ?? "empty", seed, options: JSON.parse(values.options ?? "{}"), trace: values.trace, record: !!values.record });
    if (out.rows) console.table(out.rows);
    if (out.frames) writeFileSync(`${values.record}-${seed}.json`, JSON.stringify({ variant: values.variant ?? "dorsi0.8", model: "workshop-fighter", label: `game's hands and knees → sit back → up → release, seed ${seed}`, frames: out.frames }));
    const { rows: _r, frames: _f, ...rest } = out; console.log(JSON.stringify(rest));
  }
}
