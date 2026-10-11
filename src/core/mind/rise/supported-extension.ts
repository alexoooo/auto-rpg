import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { MotionCommand } from "../../control/tasks.ts";
import { atan2 } from "../../math/real.ts";
import { turnAboutToRef, turnBetweenToRef } from "../../math/turn.ts";
import type { BodyObservation } from "../../observation.ts";
import type { Side } from "../../spec/body.ts";
import type { Vec3 } from "../../spec/quantity.ts";
import { deepFreeze } from "../../state.ts";

/** Coordinated boot loading and toe-edge peeling; response times and thresholds are controller choices. */
const T = deepFreeze({ shift: 1.3, settle: .25, rise: 1.3, pointResponse: .2, rootResponse: .3,
  centreResponse: .25, jointResponse: .4, jointWeight: .02, pointWeight: 2, orientationWeight: 3,
  centreWeight: 3, minimumLoad: 20, pointLoad: 1, edgeRadius: .015,
  soleUp: .995, rootUp: .9, speed: .2, hold: .05, peelUp: -.05 });
const ZERO: Vec3 = Object.freeze([0, 0, 0]);
const SIDES = ["left", "right"] as const;
interface Model {
  readonly channels: readonly { readonly name: string; readonly min: number; readonly max: number }[];
  readonly segments: readonly { readonly name: string; readonly mass: number }[];
  readonly rest: readonly [number, number, number, number];
  readonly feet: Readonly<Record<Side, { readonly rest: readonly [number, number, number, number];
    readonly up: Vec3; readonly edge: readonly [Vec3, Vec3] }>>;
}

/** A near-vertical rear toe keeps native extension; a sole tipped farther down first peels onto its edge. */
export function extensionNeedsPeel(o: BodyObservation, side: Side, soleUp: Vec3,
  work = { up: new Vector3(), turn: new Quaternion() }): boolean {
  const foot = o.segments.find(s => s.name === `foot.${side}`);
  return !foot || work.up.set(...soleUp).applyRotationQuaternionToRef(work.turn.set(...foot.rotation), work.up).y < T.peelUp;
}

/** A measured two-boot handover; a tipped boot or an upright pelvis alone cannot qualify. */
export function extensionCanStand(o: BodyObservation, model: Model, dt: number): boolean {
  if (o.down || !(dt > 0) || !Number.isFinite(dt)) return false;
  const up = new Vector3(), turn = new Quaternion();
  for (const side of SIDES) {
    const foot = o.segments.find(s => s.name === `foot.${side}`);
    if (!foot || o.contacts.filter(c => c.segment === foot.name && c.fixed !== null && -c.normal[1] >= T.rootUp)
      .reduce((n, c) => n + c.impulse / dt, 0) <= T.minimumLoad) return false;
    if (up.set(...model.feet[side].up).applyRotationQuaternionToRef(turn.set(...foot.rotation), up).y < T.soleUp) return false;
  }
  const root = o.segments.find(s => s.name === "lowerTrunk");
  if (!root || up.set(0, 1, 0).applyRotationQuaternionToRef(turn.set(...root.rotation)
    .multiply(Quaternion.Inverse(new Quaternion(...model.rest))), up).y < T.rootUp) return false;
  if (o.contacts.some(c => c.fixed !== null && c.impulse > 0 && !/^foot\./.test(c.segment))) return false;
  const mass = model.segments.reduce((n, s) => n + s.mass, 0), velocity = [0, 0, 0];
  for (const part of model.segments) {
    const segment = o.segments.find(s => s.name === part.name);
    if (!segment) return false;
    for (let k = 0; k < 3; k++) velocity[k]! += segment.velocity[k]! * part.mass / mass;
  }
  return velocity.reduce((n, v) => n + v * v, 0) < T.speed * T.speed;
}

/** A contact-preserving extension from an actual half-kneel, before native standing takes the body. */
export function supportedExtension(input: Model) {
  const model = deepFreeze(structuredClone(input));
  const mass = model.segments.reduce((n, s) => n + s.mass, 0);
  if (!(mass > 0) || !Number.isFinite(mass)) throw new Error("invalid supported extension model");
  const state = { phase: "inactive" as "inactive" | "shift" | "rise" | "ready", time: 0, quiet: 0,
    lead: "left" as Side, height: 0, from: [0, 0, 0] as Vec3, target: [0, 0, 0] as Vec3, riseFrom: [0, 0, 0] as Vec3,
    rootFrom: [0, 0, 0, 1] as [number, number, number, number], rootTo: [0, 0, 0, 1] as [number, number, number, number],
    rearFrom: [0, 0, 0, 1] as [number, number, number, number], rearTo: [0, 0, 0, 1] as [number, number, number, number],
    anchors: [] as NonNullable<MotionCommand["frames"]>[number][], joints: [] as MotionCommand["joints"][number][] };
  const turn = new Quaternion(), inverse = new Quaternion(), yaw = new Quaternion(), up = new Vector3(), local = new Vector3(), measuredCentre = new Vector3();
  const other = () => state.lead === "left" ? "right" : "left";
  const segment = (o: BodyObservation, name: string) => {
    const part = o.segments.find(s => s.name === name);
    if (!part) throw new Error(`supported extension lacks ${name}`);
    return part;
  };
  const centre = (o: BodyObservation): Vec3 => {
    measuredCentre.setAll(0);
    for (const part of model.segments) measuredCentre.addInPlace(local.set(...segment(o, part.name).centre).scaleInPlace(part.mass / mass));
    return [measuredCentre.x, measuredCentre.y, measuredCentre.z];
  };
  const curve = (time: number, seconds: number) => {
    const u = Math.min(1, time / seconds);
    return { u, s: u * u * (3 - 2 * u), v: u < 1 ? 6 * u * (1 - u) / seconds : 0,
      a: u < 1 ? (6 - 12 * u) / (seconds * seconds) : 0 };
  };
  return { state, reset() { state.phase = "inactive"; state.time = 0; state.quiet = 0; state.anchors.length = 0; state.joints.length = 0; },
    begin(o: BodyObservation, lead: Side, height: number) {
      if (!(height > 0) || !Number.isFinite(height)) throw new Error("invalid extension height");
      state.lead = lead; state.height = height; state.phase = "shift"; state.time = 0; state.quiet = 0;
      state.from = centre(o); state.riseFrom = [...state.from];
      state.anchors = [`shank.${other()}`, `foot.${lead}`, `foot.${other()}`].map(name => {
        const part = segment(o, name), contact = o.contacts.find(c => c.segment === name && c.fixed !== null && c.impulse > 0 && -c.normal[1] >= T.rootUp);
        if (!contact) throw new Error(`supported extension lacks loaded ${name}`);
        Quaternion.InverseToRef(inverse.set(...part.rotation), inverse);
        local.set(...contact.point).subtractInPlace(up.set(...part.position)).applyRotationQuaternionToRef(inverse, local);
        return { id: name, frame: { kind: "segment", name }, at: [local.x, local.y, local.z],
          translation: { target: [...contact.point], velocity: ZERO, acceleration: ZERO, seconds: T.pointResponse, weight: T.pointWeight },
          ...(name.startsWith("foot.") ? { orientation: { target: [...part.rotation] as [number, number, number, number],
            velocity: ZERO, acceleration: ZERO, seconds: T.rootResponse, weight: T.orientationWeight } } : {}) };
      });
      const boots = state.anchors.filter(a => a.id.startsWith("foot."));
      state.target = [boots.reduce((n, a) => n + a.translation!.target[0] / 2, 0), state.from[1],
        boots.reduce((n, a) => n + a.translation!.target[2] / 2, 0)];
      const root = segment(o, "lowerTrunk"); state.rootFrom = [...root.rotation];
      turn.set(...root.rotation).multiplyToRef(Quaternion.Inverse(inverse.set(...model.rest)), turn);
      up.set(1, 0, 0).applyRotationQuaternionToRef(turn, up);
      turnAboutToRef(Vector3.UpReadOnly, atan2(-up.z, up.x), yaw);
      yaw.multiplyToRef(inverse.set(...model.rest), turn); state.rootTo = [turn.x, turn.y, turn.z, turn.w];
      state.rearFrom = [...segment(o, `foot.${other()}`).rotation];
      yaw.multiplyToRef(inverse.set(...model.feet[other()].rest), turn); state.rearTo = [turn.x, turn.y, turn.z, turn.w];
      state.joints = model.channels.map((c, i) => ({ channel: c.name,
        angle: Math.max(c.min, Math.min(c.max, o.joints[i]!.angle)), rate: 0, acceleration: 0, seconds: T.jointResponse, weight: T.jointWeight }));
    },
    step(o: BodyObservation, dt: number, nearby: readonly string[]): MotionCommand {
      if (!(dt > 0) || !Number.isFinite(dt) || state.phase === "inactive") throw new Error("invalid supported extension step");
      const measured = centre(o);
      if (state.phase === "shift" && state.time >= T.shift + T.settle) { state.phase = "rise"; state.time = 0; state.riseFrom = measured; }
      const rising = state.phase !== "shift", m = curve(state.time, rising ? T.rise : T.shift);
      const target: Vec3 = rising ? [state.target[0], state.riseFrom[1] + (state.height - state.riseFrom[1]) * m.s, state.target[2]]
        : [state.from[0] + (state.target[0] - state.from[0]) * m.s, measured[1], state.from[2] + (state.target[2] - state.from[2]) * m.s];
      const velocity: Vec3 = rising ? [0, (state.height - state.riseFrom[1]) * m.v, 0]
        : [(state.target[0] - state.from[0]) * m.v, 0, (state.target[2] - state.from[2]) * m.v];
      const acceleration: Vec3 = rising ? [0, (state.height - state.riseFrom[1]) * m.a, 0]
        : [(state.target[0] - state.from[0]) * m.a, 0, (state.target[2] - state.from[2]) * m.a];
      const orientation = (from: readonly number[], to: readonly number[]) => {
        const amount = rising ? m.s : 0;
        if (amount === 0 || amount === 1) { const at = amount === 0 ? from : to; turn.set(at[0]!, at[1]!, at[2]!, at[3]!); }
        else turnBetweenToRef(inverse.set(from[0]!, from[1]!, from[2]!, from[3]!), turn.set(to[0]!, to[1]!, to[2]!, to[3]!), amount, turn);
        return { target: [turn.x, turn.y, turn.z, turn.w] as [number, number, number, number],
          velocity: ZERO, acceleration: ZERO, seconds: T.rootResponse, weight: T.orientationWeight };
      };
      const frames: MotionCommand["frames"][number][] = [{ id: "root", frame: { kind: "segment", name: "lowerTrunk" }, at: ZERO,
        orientation: orientation(state.rootFrom, state.rootTo) }, ...state.anchors.filter(a => !rising || a.id.startsWith("foot.")).map(a =>
          a.id === `foot.${other()}` ? { ...a, orientation: orientation(state.rearFrom, state.rearTo) } : a)];
      const supports: NonNullable<MotionCommand["supports"]>[number][] = state.anchors.map(a => {
        if (rising && a.id.startsWith("shank.")) return { frame: a.frame, mode: "auto" };
        const touching = nearby.includes(a.id);
        return { frame: a.frame, mode: "auto", normalLoad: { ...(touching ? { min: T.minimumLoad } : {}), pointMin: T.pointLoad },
          ...(rising && a.id === `foot.${other()}` ? { edge: { from: model.feet[other()].edge[0], to: model.feet[other()].edge[1], radius: T.edgeRadius } } : {}) };
      });
      state.quiet = rising && extensionCanStand(o, model, dt) ? state.quiet + dt : 0;
      if (state.quiet >= T.hold) state.phase = "ready";
      state.time += dt;
      return { joints: state.joints, frames, centres: [{ id: "centre", frames: model.segments.map(s => ({ kind: "segment", name: s.name })),
        translation: { target, velocity, acceleration, seconds: T.centreResponse, weight: T.centreWeight } }], supports, grips: [] };
    } };
}
