import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { MotionCommand } from "../../control/tasks.ts";
import type { BodyObservation } from "../../observation.ts";
import type { Side } from "../../spec/body.ts";
import type { Vec3 } from "../../spec/quantity.ts";
import { deepFreeze } from "../../state.ts";

/** Contact stabilization, pressure ramp and arm lift choices for a supported human rise. */
export const HAND_TRANSFER = deepFreeze({ hold: 1, unload: 1.5, quiet: .1, unloaded: 2, liftSeconds: 1.2, lift: .35,
  jointSeconds: .4, jointWeight: .02, pointSeconds: .2, pointWeight: 1, handSeconds: .15, handWeight: 2,
  rootSeconds: .3, rootWeight: 3, centreSeconds: .25, centreWeight: 3, toeLoad: 1,
  capacity: 8, jointStops: { margin: .001, forceTolerance: 1e-5, accelerationTolerance: 1e-4,
    iterations: 2048, absoluteTolerance: 1e-7, relativeTolerance: 1e-6 } });
const ZERO: Vec3 = Object.freeze([0, 0, 0]);
type Stage = "inactive" | "hold" | "unload" | "lift";
interface Model {
  readonly channels: readonly { readonly name: string; readonly min: number; readonly max: number }[];
  readonly segments: readonly { readonly name: string; readonly mass: number; readonly localCentre?: Vec3 }[];
}

/** Detached support geometry is retained while outgoing hand pressure falls, before its lift. */
export function handTransfer(input: Model) {
  const model = deepFreeze(structuredClone(input));
  const state = { stage: "inactive" as Stage, time: 0, quiet: 0, initialLoad: 0, maxLoad: 0, liftEnd: false,
    outgoing: "", required: [] as string[], hand: [0, 0, 0] as Vec3, command: null as MotionCommand | null };
  const contacts = (o: BodyObservation, name: string) => o.contacts.filter(c => c.segment === name && c.fixed !== null
    && c.impulse > 0 && Math.abs(c.normal[1]) >= .9);
  const load = (o: BodyObservation, name: string, dt: number) => contacts(o, name).reduce((sum, c) => sum + c.impulse / dt, 0);
  const reset = () => {
    state.stage = "inactive"; state.command = null; state.time = 0; state.quiet = 0; state.liftEnd = false;
    state.initialLoad = 0; state.maxLoad = 0; state.outgoing = ""; state.required = []; state.hand = [0, 0, 0];
  };
  return { state, reset,
    begin(o: BodyObservation, lead: Side, outgoing: Side): boolean {
      reset();
      const rear = lead === "left" ? "right" : "left", otherHand = outgoing === "left" ? "right" : "left";
      const required = [`shank.${rear}`, `foot.${rear}`, `foot.${lead}`], hand = `hand.${outgoing}`;
      if (![...required, hand].every(name => contacts(o, name).length)) return false;
      const root = o.segments.find(s => s.name === "lowerTrunk")!, part = o.segments.find(s => s.name === hand)!;
      const anchors = [...(contacts(o, `hand.${otherHand}`).length ? [`hand.${otherHand}`] : []), ...required];
      const frames: MotionCommand["frames"][number][] = [{ id: "root", frame: { kind: "segment", name: "lowerTrunk" }, at: ZERO,
        orientation: { target: [...root.rotation], velocity: ZERO, acceleration: ZERO, seconds: HAND_TRANSFER.rootSeconds, weight: HAND_TRANSFER.rootWeight } }];
      for (const name of anchors) {
        const segment = o.segments.find(s => s.name === name)!, point = contacts(o, name)[0]!.point;
        const local = new Vector3(...point).subtractInPlace(new Vector3(...segment.position))
          .applyRotationQuaternionToRef(Quaternion.Inverse(new Quaternion(...segment.rotation)), new Vector3());
        frames.push({ id: name, frame: { kind: "segment", name }, at: [local.x, local.y, local.z],
          translation: { target: [...point], velocity: ZERO, acceleration: ZERO, seconds: HAND_TRANSFER.pointSeconds, weight: HAND_TRANSFER.pointWeight },
          ...(name === `foot.${lead}` ? { orientation: { target: [...segment.rotation] as [number, number, number, number],
            velocity: ZERO, acceleration: ZERO, seconds: HAND_TRANSFER.rootSeconds, weight: HAND_TRANSFER.handWeight } } : {}) });
      }
      frames.push({ id: hand, frame: { kind: "segment", name: hand }, at: ZERO,
        translation: { target: [...part.position], velocity: ZERO, acceleration: ZERO, seconds: HAND_TRANSFER.handSeconds, weight: HAND_TRANSFER.handWeight } });
      state.outgoing = hand; state.required = anchors; state.hand = [...part.position]; state.time = 0; state.quiet = 0;
      state.initialLoad = 0; state.maxLoad = 0; state.liftEnd = false; state.stage = "hold";
      let centre: Vec3 = [...o.centre];
      if (model.segments.every(s => s.localCentre !== undefined)) {
        // Transform each physical local centre directly, as the dynamics does; composing a reference turn adds quaternion normalization error.
        const mass = model.segments.reduce((sum, s) => sum + s.mass, 0), total = new Vector3();
        for (const s of model.segments) {
          const segment = o.segments.find(part => part.name === s.name)!;
          total.addInPlace(new Vector3(...s.localCentre!).applyRotationQuaternionToRef(new Quaternion(...segment.rotation), new Vector3())
            .addInPlace(new Vector3(...segment.position)).scaleInPlace(s.mass / mass));
        }
        centre = [total.x, total.y, total.z];
      }
      state.command = { joints: model.channels.map(c => ({ channel: c.name,
        angle: Math.max(c.min, Math.min(c.max, o.joints.find(j => j.name === c.name)!.angle)), rate: 0, acceleration: 0,
        seconds: HAND_TRANSFER.jointSeconds, weight: HAND_TRANSFER.jointWeight })), frames,
        centres: [{ id: "centre", frames: model.segments.map(s => ({ kind: "segment", name: s.name })),
          translation: { target: centre, velocity: ZERO, acceleration: ZERO, seconds: HAND_TRANSFER.centreSeconds, weight: HAND_TRANSFER.centreWeight } }],
        supports: [{ frame: { kind: "segment", name: hand }, mode: "auto" },
          { frame: { kind: "segment", name: `foot.${rear}` }, mode: "auto", normalLoad: { pointMin: HAND_TRANSFER.toeLoad } }], grips: [] };
      return true;
    },
    step(o: BodyObservation, dt: number): MotionCommand {
      if (!(dt > 0) || !Number.isFinite(dt) || !state.command) throw new Error("invalid hand transfer step");
      let command = state.command;
      switch (state.stage) {
        case "hold":
          if (state.time >= HAND_TRANSFER.hold) {
            state.stage = "unload"; state.time = 0; state.initialLoad = load(o, state.outgoing, dt);
          }
          break;
        case "unload": case "lift": break;
        case "inactive": throw new Error("inactive hand transfer");
        default: { const never: never = state.stage; throw new Error(`unknown hand transfer stage ${never}`); }
      }
      if (state.stage === "unload") {
        const u = Math.min(1, state.time / HAND_TRANSFER.unload), p = u * u * (3 - 2 * u);
        state.maxLoad = Math.max(0, state.initialLoad * (1 - p));
        command = { ...command, supports: command.supports!.map(s => s.frame.kind === "segment" && s.frame.name === state.outgoing
          ? { ...s, normalLoad: { max: state.maxLoad } } : s) };
        state.quiet = u === 1 && load(o, state.outgoing, dt) < HAND_TRANSFER.unloaded
          && state.required.every(name => load(o, name, dt) > 0) ? state.quiet + dt : 0;
        if (state.quiet >= HAND_TRANSFER.quiet) { state.stage = "lift"; state.time = 0; }
      }
      if (state.stage === "lift") {
        const u = Math.min(1, state.time / HAND_TRANSFER.liftSeconds), p = u * u * (3 - 2 * u),
          v = u < 1 ? 6 * u * (1 - u) / HAND_TRANSFER.liftSeconds : 0,
          a = u < 1 ? (6 - 12 * u) / (HAND_TRANSFER.liftSeconds * HAND_TRANSFER.liftSeconds) : 0;
        command = { ...command, supports: command.supports!.map(s => s.frame.kind === "segment" && s.frame.name === state.outgoing
          ? { frame: s.frame, mode: "free" } : s), frames: command.frames.map(f => f.id === state.outgoing
          ? { ...f, translation: { ...f.translation!, target: [state.hand[0], state.hand[1] + HAND_TRANSFER.lift * p, state.hand[2]],
            velocity: [0, HAND_TRANSFER.lift * v, 0], acceleration: [0, HAND_TRANSFER.lift * a, 0] } } : f) };
        state.liftEnd = u === 1;
      }
      state.command = command; state.time += dt;
      return command;
    },
  };
}
