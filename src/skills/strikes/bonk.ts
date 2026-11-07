import { Vector3, Quaternion } from "../../core/math/vector.ts";
import { acos } from "../../core/math/real.ts";
import { isRefused } from "../../core/refusal.ts";
import { deepFreeze } from "../../core/state.ts";
import { rootSegment } from "../../core/bodies/read-body.ts";
import { pointOfToRef, turnOfToRef } from "../../core/bodies/read-motion.ts";
import { rigidPoints } from "../../core/bodies/build/rigid.ts";
import { type Pose } from "../../core/bodies/spec/pose.ts";
import { type Vec3 } from "../../core/quantity.ts";
import { type Body, type BodyView } from "../../control/body.ts";
import { supportHeight } from "../../control/support-reference.ts";
import { bodyAhead } from "../locomotion/navigation/held-clearance.ts";
import { sensedActionTarget } from "../framework/action-aim.ts";
import { LEG_RESOURCE, TRUNK_RESOURCE, segmentResource, type ActionEnding, type ActionRequest, type Executor, type LifecycleUpdate, type TargetResolver } from "../framework/action.ts";
import { handConfiguration } from "./held-strike.ts";
import { clearAhead, quietToStrike, strikeWindow } from "./strike-window.ts";
import { BONK_LIMITS, bonkModel, validBonkTechnique, type BonkCourse, type BonkFrame, type BonkPath, type BonkPose, type BonkReturn, type BonkTechnique, type BonkTurn } from "./bonk-course.ts";

/** Immutable body record: entry, tracking response and each hand's declared technique. */
export interface BonkSettings {
  readonly reach: number; readonly band: number; readonly aside: number; readonly pace: number;
  readonly response: number;
  readonly techniques: { readonly left: BonkTechnique; readonly right: BonkTechnique };
}

export const BONK_KEYS = Object.freeze(["reach", "band", "aside", "pace", "response", "techniques"] as const);

/** Whether a partial body record names only finite, positive settings and valid bilateral techniques. */
export function validBonkPart(settings: Partial<BonkSettings>): boolean {
  return !!settings && typeof settings === "object" && !Array.isArray(settings)
    && (["reach", "band", "aside", "pace", "response"] as const).every(key => settings[key] === undefined || Number.isFinite(settings[key]) && settings[key]! > 0)
    && (settings.techniques === undefined || !!settings.techniques && typeof settings.techniques === "object" && !Array.isArray(settings.techniques)
      && validBonkTechnique(settings.techniques.left) && validBonkTechnique(settings.techniques.right));
}

/** Whether a body record supplies the complete bonk settings. */
export const validBonk = (settings: Partial<BonkSettings>): settings is BonkSettings =>
  validBonkPart(settings) && BONK_KEYS.every(key => settings[key] !== undefined);

const xyz = (v: Vector3): Vec3 => [v.x, v.y, v.z];
const xyzw = (q: Quaternion): BonkTurn => [q.x, q.y, q.z, q.w];
const distance = (a: Vec3, b: Vec3): number => {
  const x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2];
  return Math.sqrt(x * x + y * y + z * z);
};
const angle = (a: BonkTurn, b: BonkTurn): number => 2 * acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])));
type Relative = { hand: Vec3; swell: Vec3; club: BonkTurn };

/**
 * A descending arc driven by the existing freedom tracker. Preparation follows the sensed aim;
 * commitment freezes its world course. A measured endpoint or impact stop starts return.
 * The hand, trunk and support remain reserved through the physical guard hold, even after yield.
 */
export function bonkExecutor(body: Body, guard: Pose, actions: readonly string[], settings: BonkSettings, resolve: TargetResolver): Executor {
  const spec = body.built.spec, ahead = bodyAhead(spec), root = rootSegment(body.built);
  const p = new Vector3(), q = new Quaternion(), inv = new Quaternion(), relative = new Vector3();
  const hands = (["left", "right"] as const).map(hand => {
    const effector = `hand.${hand}`, model = bonkModel(spec, effector);
    if (isRefused(model)) return null;
    const limb = body.built.segments.get(effector)!, description = spec.effectors!.find(one => one.segment === effector)!;
    const chest = body.built.segments.get(description.base)!, swell = rigidPoints(spec, limb.spec).get("swell")!.value;
    const paths: (BonkPath & { seconds: number })[][] = model.channels.map(row => row.map(() => ({ angle: 0, rate: 0, acceleration: 0, seconds: settings.response })));
    const channels = Object.fromEntries(model.channels.flatMap((row, j) => row.map((name, k) => [name, paths[j]![k]!] as const)));
    return { hand, effector, model, limb, chest, swell, paths, channels, grip: handConfiguration(spec, effector, "grip"),
      holds: deepFreeze([segmentResource(effector), TRUNK_RESOURCE, LEG_RESOURCE]) };
  });
  const handOf = (effector: string) => hands.find(one => one?.effector === effector) ?? null;
  type Hand = NonNullable<ReturnType<typeof handOf>>;
  type Live = { request: ActionRequest; hand: "left" | "right"; phase: "prepare" | "commit" | "release";
    course: BonkCourse; returning: BonkReturn | null; returnSince: number | null;
    began: number; since: number; heldSince: number | null; lower: number; face: number;
    withdrawn: boolean; ending: ActionEnding; target: Vec3;
    previous: { relative: Relative; swell: Vec3 } | null;
    guard: Relative; contact: number | null; stopped: boolean };
  const state = { live: null as Live | null };
  const frame = (): BonkFrame => ({ origin: root.frame.origin, at: xyz(root.pose.position), turn: xyzw(turnOfToRef(root, q)) });
  const relativeToChest = (pose: Pick<BonkPose, "hand" | "swell" | "club" | "chest" | "chestAt">): Relative => {
    Quaternion.InverseToRef(q.copyFromFloats(...pose.chest), inv);
    const at = (point: Vec3): Vec3 => xyz(relative.set(point[0] - pose.chestAt[0], point[1] - pose.chestAt[1], point[2] - pose.chestAt[2]).applyRotationQuaternionToRef(inv, relative));
    return { hand: at(pose.hand), swell: at(pose.swell), club: xyzw(inv.multiply(q.copyFromFloats(...pose.club))) };
  };
  const physical = (one: Hand, view: BodyView): BonkPose => ({ hand: xyz(pointOfToRef(one.limb, one.limb.frame.origin, p)), swell: xyz(pointOfToRef(one.limb, one.swell, p)),
    club: xyzw(turnOfToRef(one.limb, q)), chest: xyzw(turnOfToRef(one.chest, q)), chestAt: xyz(pointOfToRef(one.chest, one.chest.frame.origin, p)),
    shaft: [0, 0, 0], joints: one.model.channels.map(row => row.map(name => view.angles[name]!)) });
  const elapsed = (now: number, since: number): number => (Math.round(now / body.dt) - Math.round(since / body.dt)) * body.dt;
  const returnPlan = (live: Live, now: BonkPose): BonkReturn => {
    const one = handOf(live.request.effector)!;
    return one.model.returnPlan(live.course, now.joints, one.model.channels.map(row => row.map(name => body.muscles.rate(body.muscles.channel(name)))));
  };
  const beginReturn = (live: Live, now: BonkPose, time: number, ending: ActionEnding) => {
    live.phase = "release"; live.since = time; live.heldSince = null; live.returning ??= returnPlan(live, now); live.returnSince ??= time;
    live.ending = live.returning.refusal ? { kind: "stalled", reason: live.returning.refusal } : ending;
    live.course = deepFreeze({ ...live.course, frame: frame() });
  };
  return {
    state,
    needs(_action, effector) { const hand = handOf(effector); if (!hand) throw new Error(`bonk has no effector ${effector}`); return hand.holds; },
    readiness(view, action, effector, target, around) {
      const one = handOf(effector);
      if (!actions.includes(action) || !one) return { kind: "blocked", reason: "no held bonk for this action and effector" };
      if (view.down) return { kind: "blocked", reason: "body is down" };
      if (state.live) return { kind: "waiting", reason: "a bonk is under way or returning" };
      const targetAt = resolve(view, target, action, effector);
      if (!targetAt) return { kind: "blocked", reason: "target has no aim" };
      const ready = strikeWindow(view, targetAt, around.heading, { standOff: settings.reach, band: settings.band, aside: settings.aside, across: 0, pace: settings.pace, poised: true,
        clear: clearAhead(view, targetAt, around.heading, sensedActionTarget(view, target), ahead), ...(target.kind === "body" ? { on: target.body } : {}) });
      if (ready.kind !== "ready") return ready;
      const course = one.model.make(frame(), guard, targetAt, settings.techniques[one.hand]);
      return isRefused(course) ? { kind: "blocked", reason: course.refused } : ready;
    },
    start(view, request, around) {
      if (state.live) throw new Error("a bonk already owns an instance");
      const one = handOf(request.effector), at = resolve(view, request.target, request.action, request.effector);
      if (!one || !at) throw new Error("an admitted bonk has no hand or target");
      const entry = frame(), course = one.model.make(entry, guard, at, settings.techniques[one.hand]);
      if (isRefused(course)) throw new Error(`an admitted bonk has no course: ${course.refused}`);
      state.live = { request: structuredClone(request), hand: one.hand, phase: "prepare", course, returning: null, returnSince: null, began: view.time, since: view.time,
        heldSince: null, lower: around.lower, face: view.stance.facing, withdrawn: false, ending: { kind: "completed" }, target: [...at], previous: null,
        guard: relativeToChest(one.model.pose(course, course.guard)), contact: null, stopped: false };
    },
    resume() { state.live = null; },
    interrupt(_view, id) { if (state.live?.request.id === id) state.live = null; },
    update(view, continued, _around, dt) {
      const live = state.live;
      if (!live) return [];
      if (view.down) { state.live = null; return [{ id: live.request.id, ending: { kind: "interrupted", reason: "body is down" } }]; }
      const one = handOf(live.request.effector)!;
      const request = continued.find(one => one.id === live.request.id);
      live.withdrawn ||= !request;
      const now = physical(one, view), relative = relativeToChest(now), previous = live.previous;
      const handSpeed = previous ? distance(relative.hand, previous.relative.hand) / dt : Infinity;
      const swellSpeed = previous ? distance(relative.swell, previous.relative.swell) / dt : Infinity;
      const quiet = handSpeed <= BONK_LIMITS.still && swellSpeed <= BONK_LIMITS.still;
      if (live.phase === "prepare") {
        const source = request ?? live.request, at = resolve(view, source.target, source.action, source.effector);
        if (live.withdrawn || !at) beginReturn(live, now, view.time, at ? { kind: "cancelled" } : { kind: "lost", reason: "target is no longer sensed" });
        else {
          const course = one.model.make(frame(), guard, at, settings.techniques[live.hand]);
          if (isRefused(course)) beginReturn(live, now, view.time, { kind: "lost", reason: course.refused });
          else {
            live.course = course; live.target = [...at];
            const chamber = one.model.pose(course, course.chamber);
            const held = distance(now.hand, chamber.hand) <= BONK_LIMITS.chamberNear && distance(now.swell, chamber.swell) <= BONK_LIMITS.chamberNear
              && angle(now.club, chamber.club) <= BONK_LIMITS.settledAngle && quiet && quietToStrike(view);
            live.heldSince = held ? live.heldSince ?? view.time : null;
            if (live.heldSince !== null && elapsed(view.time, live.heldSince) >= BONK_LIMITS.chamberHold) {
              live.phase = "commit"; live.since = view.time; live.heldSince = null;
            } else if (elapsed(view.time, live.began) >= BONK_LIMITS.prepare) beginReturn(live, now, view.time, { kind: "stalled", reason: "chamber settling deadline" });
          }
        }
      } else if (live.phase === "commit") {
        const near = one.model.nearest(live.course, now.swell);
        const touch = view.effectors[one.effector]?.feedback;
        if (touch) for (const pair of touch.pairs ?? []) if (pair.loaded) {
          live.contact ??= view.time;
          if (touch.velocity[0] * pair.normal[0] + touch.velocity[1] * pair.normal[1] + touch.velocity[2] * pair.normal[2] <= 0) live.stopped = true;
        }
        const end = one.model.pose(live.course, live.course.follow);
        const endpoint = near.progress === 1
          && distance(now.swell, end.swell) <= BONK_LIMITS.swellError && distance(now.hand, end.hand) <= BONK_LIMITS.handError;
        if (live.stopped && live.returning === null) { live.returning = returnPlan(live, now); live.returnSince = view.time; }
        // Predictive contact pairs can persist across a positive gap; physical release reads signed gaps.
        const withdrawal = live.stopped && previous && live.contact !== null
          && !body.built.physics.contactManifoldsOf(one.limb.body).some(manifold => manifold.points.some(point => point.distance <= 0))
          && distance(relative.swell, live.guard.swell) < distance(previous.relative.swell, live.guard.swell) && distance(now.swell, previous.swell) > 0;
        if (endpoint || withdrawal) beginReturn(live, now, view.time, { kind: "completed" });
        else if (elapsed(view.time, live.since) >= BONK_LIMITS.stroke) beginReturn(live, now, view.time, { kind: "stalled", reason: "physical stroke deadline" });
      } else {
        const held = distance(relative.hand, live.guard.hand) <= BONK_LIMITS.chamberNear && distance(relative.swell, live.guard.swell) <= BONK_LIMITS.chamberNear
          && angle(relative.club, live.guard.club) <= BONK_LIMITS.settledAngle && quiet;
        live.heldSince = held ? live.heldSince ?? view.time : null;
        if (live.heldSince !== null && elapsed(view.time, live.heldSince) >= BONK_LIMITS.guardHold) {
          const ending = live.ending; state.live = null; return [{ id: live.request.id, ending }];
        }
        if (elapsed(view.time, live.since) >= BONK_LIMITS.return) live.ending = { kind: "stalled", reason: "guard settling deadline" };
      }
      live.previous = { relative, swell: now.swell };
      const updates: LifecycleUpdate[] = [{ id: live.request.id, phase: live.phase, stage: live.phase === "prepare" ? "chamber" : live.phase === "commit"
        ? live.returning === null ? "stroke" : "withdrawal" : "guard hold", holds: one.holds, aim: live.target }];
      return updates;
    },
    command(view, id) {
      const live = state.live;
      if (!live || live.request.id !== id) throw new Error(`a bonk has no instance ${id}`);
      const one = handOf(live.request.effector)!;
      // The continuous command is carried on the current body view; only the decision is delayed.
      one.model.paths(live.course, live.returning !== null ? "return" : live.phase === "commit" ? "stroke" : "prepare",
        elapsed(view.time, live.returnSince ?? live.since), one.paths, live.returning ?? undefined);
      return { paths: one.channels, ...(one.grip ? { configurations: { [one.effector]: one.grip } } : {}),
        legs: { walk: null, face: live.face, heading: live.face, halt: true, height: supportHeight(view) - live.lower } };
    },
  };
}
