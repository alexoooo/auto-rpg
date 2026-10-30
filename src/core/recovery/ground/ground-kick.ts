import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BodyView } from "../../body.ts";
import { intoFrameToRef } from "../../control/kinematics.ts";
import { pointOfToRef } from "../../read-motion.ts";
import { atan2, hypot } from "../../math/real.ts";
import { copyActionTarget, type ActionRequest, type Executor, type LifecycleUpdate } from "../../skills/framework/action.ts";
import { effectorStrike, type StrikeCourse } from "../../skills/strikes/effector-strike.ts";
import { KICK_PATH } from "../../skills/strikes/kick.ts";
import { STRIKE_EVENT } from "../../skills/strikes/strike-cycle.ts";
import type { Side } from "../../spec/body.ts";
import type { Vec3 } from "../../spec/quantity.ts";
import { deepFreeze } from "../../state.ts";
import { CENTRE_AIM } from "../../skills/framework/aims.ts";
import type { OwnBody } from "../../mind/mind.ts";
import { segmentOf } from "../../spec/body.ts";

/** Bent knees leave the feet available while the forearms' ordinary guard protects the head. */
export const GROUND_LEGS = deepFreeze({ "hip.left flexion": .8, "hip.right flexion": .8,
  "knee.left flexion": 1.4, "knee.right flexion": 1.4, "ankle.left dorsiflexion": .1, "ankle.right dorsiflexion": .1 });
/** Ground strokes have bounded preparation and return; contact alone never proves completion. */
const T = Object.freeze({ ...KICK_PATH, prepareLimit: 2, returnLimit: 2, chamberSeconds: .4, returnSeconds: .5,
  swingSeconds: .65, near: .09, slow: .5, contactSpeed: 1.5 });

/** A supine foot uses the same admission, strike cycle, attribution and verified return as standing actions. */
export function groundKick(own: OwnBody): Executor {
  const aim = CENTRE_AIM.make(own.spec, CENTRE_AIM.defaults, null);
  const vector = new Vector3(), hip = new Vector3();
  const strikes = Object.fromEntries((["left", "right"] as const).map(side => [side, effectorStrike({ effector: `foot.${side}`, point: "strike",
    limits: { ...T, impact: T }, chamberSeconds: T.chamberSeconds, returnSeconds: T.returnSeconds, response: T.response })])) as Record<Side, ReturnType<typeof effectorStrike>>;
  type Live = { request: ActionRequest; side: Side; home: Vec3; chamber: Vec3; target: Vec3; committed: boolean; withdrawn: boolean; aborted: boolean; failed: boolean; lost: boolean };
  const state = { live: null as Live | null, cycles: { left: strikes.left.state, right: strikes.right.state } };
  const sideOf = (effector: string): Side => { if (effector === "foot.left") return "left"; if (effector === "foot.right") return "right"; throw new Error("ground kick needs a foot"); };
  const hipAt = (side: Side) => pointOfToRef(own.built.segments.get(`thigh.${side}`)!, own.spec.joints.find(joint => joint.name === `hip.${side}`)!.centre.value, hip);
  const coordinates = (point: Vector3): Vec3 => [point.x, point.y, point.z];
  const course = (view: BodyView, live: Live): StrikeCourse => {
    const home = live.home, chamber = live.chamber;
    const target = coordinates(intoFrameToRef(view.root, live.target, vector)), length = hypot(target[0] - chamber[0], target[1] - chamber[1], target[2] - chamber[2]);
    return { home, chamber, target, seconds: T.swingSeconds, contactVelocity: length > 0 ? target.map((v, k) => (v - chamber[k]!) * T.contactSpeed / length) as unknown as Vec3 : [0, 0, 0] };
  };
  const finish = (kind: "completed" | "cancelled" | "lost" | "stalled" | "interrupted", reason?: string): LifecycleUpdate => {
    const live = state.live!; strikes[live.side].reset(); state.live = null;
    return { id: live.request.id, ending: { kind, ...(reason ? { reason } : {}) } };
  };
  return { state, needs(_action, effector) { sideOf(effector); return ["legs", "trunk", effector]; },
    readiness(view, _action, effector, target) {
      const side = sideOf(effector), g = view.ground;
      if (!g || g.position !== "back" && g.position !== "sitting") return { kind: "blocked", reason: "ground kick needs back or sitting support" };
      if (state.live) return { kind: "waiting", reason: "ground kick returning" };
      const selected = aim(view, target, effector, []);
      if (!selected) return { kind: "blocked", reason: "target lost" };
      const proximal = own.spec.joints.find(joint => joint.name === `hip.${side}`)!.centre.value;
      const distal = segmentOf(own.spec, effector)!.distal.value;
      const reach = hypot(proximal[0] - distal[0], proximal[1] - distal[1], proximal[2] - distal[2]);
      hipAt(side);
      if (hypot(selected.at[0] - hip.x, selected.at[1] - hip.y, selected.at[2] - hip.z) > reach + T.near) return { kind: "blocked", reason: "target outside leg reach" };
      return { kind: "ready" };
    },
    start(view, request) {
      const side = sideOf(request.effector), selected = aim(view, request.target, request.effector, []);
      if (!selected) throw new Error("admitted ground kick lost its target");
      const at = view.effectors[request.effector]!.points.strike!;
      const home = coordinates(at);
      const chamber: Vec3 = [...home];
      state.live = { request: { ...request, target: copyActionTarget(request.target) }, side, home, chamber, target: [...selected.at], committed: false, withdrawn: false, aborted: false, failed: false, lost: false };
      strikes[side].reset(); strikes[side].begin("chamber", [0, 0, 0]);
    },
    update(view, continued, _around, dt) {
      const live = state.live; if (!live) return [];
      live.withdrawn ||= !continued.some(request => request.id === live.request.id);
      const strike = strikes[live.side], velocity = strike.read(view, dt);
      if (!live.committed && !live.withdrawn) {
        const selected = aim(view, live.request.target, live.request.effector, []);
        if (!selected) { live.lost = true; live.withdrawn = true; }
        else live.target = [...selected.at];
      }
      const event = strike.step(view, velocity, course(view, live), { requested: live.committed || !live.withdrawn, down: false,
        supported: !!view.ground, prepared: true, free: true, targetId: live.request.target.body }, dt);
      live.committed ||= strike.state.phase === "swing";
      live.aborted ||= !!(event & STRIKE_EVENT.aborted); live.failed ||= !!(event & STRIKE_EVENT.failed);
      if (event & STRIKE_EVENT.failed && strike.state.phase === null) return [finish("stalled", "ground kick return deadline")];
      if (event & STRIKE_EVENT.returned) return [live.failed ? finish("stalled", "ground kick preparation deadline")
        : live.lost ? finish("lost") : live.aborted ? finish("interrupted", "ground stroke met blocking contact")
        : finish(live.committed ? "completed" : "cancelled")];
      const phase = strike.state.phase === "swing" ? "commit" : strike.state.phase === "return" ? "release" : "prepare";
      return [{ id: live.request.id, phase, stage: strike.state.phase ?? "admitting", holds: ["legs", "trunk", live.request.effector] }];
    },
    command(view, id) {
      const live = state.live; if (!live || live.request.id !== id) throw new Error("unknown ground kick");
      const feet = [view.effectors["foot.left"]!.points.strike!, view.effectors["foot.right"]!.points.strike!];
      vector.copyFrom(feet[0]!).addInPlace(feet[1]!).scaleInPlace(.5).applyRotationQuaternionToRef(view.root.rotation, vector).addInPlace(view.root.position);
      hipAt(live.side);
      const ax = vector.x - hip.x, az = vector.z - hip.z, bx = live.target[0] - hip.x, bz = live.target[2] - hip.z;
      const error = atan2(az * bx - ax * bz, ax * bx + az * bz);
      const posture = GROUND_LEGS;
      return { posture: { ...posture, "lumbar lateral flexion right": Math.max(-.6, Math.min(.6, error)),
        "thoracic lateral flexion right": Math.max(-.5, Math.min(.5, error)) },
        effectors: { [live.request.effector]: strikes[live.side].goal(course(view, live)) } };
    },
    resume() { if (state.live) strikes[state.live.side].reset(); state.live = null; },
  };
}