import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Body, BodyView } from "../../body.ts";
import { bodyEffectors } from "../../control/effectors.ts";
import { regionSegments, sensedActionTarget } from "../../mind/action-aim.ts";
import type { ActionRequest, Executor, TargetRef } from "../../skills/action.ts";
import { straightPunchExecutor, type StraightPunch } from "../../skills/straight-punch.ts";
import { STANCE_LOWER } from "../../skills/locomotion.ts";
import type { Vec3 } from "../../spec/quantity.ts";
import { nearSurface } from "../../mind/openings.ts";

type Resolve = (view: BodyView, target: TargetRef, action: string, effector: string) => Vec3 | null;
interface Anchor { body: string; segment: string; local: Vec3 }
/** Predict the chosen surface point 0.12 s ahead, in addition to the age of its sensed frame. */
const LEAD = .12;

/** A punch follows one sensed point through its drive, optionally refreshing the opening while preparing. */
export function committedAim(body: Body, actions: readonly string[], settings: StraightPunch, resolve: Resolve, lowSupport = false, predict = false, anchorAtDrive = false): Executor {
  const state = { base: null as object | null, id: null as number | null, anchor: null as Anchor | null, returning: false, committed: false };
  const arms = new Set(bodyEffectors(body.built).filter(e => e.model.segment.startsWith("hand.")).flatMap(e => e.model.channels));
  const point = new Vector3(), inverse = new Quaternion();
  const follow: Resolve = (view, target, action, effector) => {
    const anchor = state.anchor;
    if (!anchor || target.kind !== "body" || target.body !== anchor.body) return resolve(view, target, action, effector);
    const foe = sensedActionTarget(view, target), segment = foe?.segments.get(anchor.segment);
    if (!segment) return null;
    point.set(...anchor.local).applyRotationQuaternionToRef(segment.rotation, point).addInPlace(segment.position);
    if (predict) {
      const seconds = LEAD + Math.max(0, view.time - (foe?.time ?? view.time));
      const dx = point.x - segment.centre.x, dy = point.y - segment.centre.y, dz = point.z - segment.centre.z;
      point.x += (segment.velocity.x + segment.spin.y * dz - segment.spin.z * dy) * seconds;
      point.y += (segment.velocity.y + segment.spin.z * dx - segment.spin.x * dz) * seconds;
      point.z += (segment.velocity.z + segment.spin.x * dy - segment.spin.y * dx) * seconds;
    }
    return [point.x, point.y, point.z];
  };
  const remember = (view: BodyView, request: ActionRequest, at: Vec3) => {
      const foe = request.target.kind === "body" ? sensedActionTarget(view, request.target) : null;
      if (foe && request.target.kind === "body") {
        let chosen: string | null = null, nearest = Infinity;
        for (const name of regionSegments(foe.spec, request.target.region)) {
          const segment = foe.segments.get(name);
          if (!segment) continue;
          const dx = at[0] - segment.centre.x, dy = at[1] - segment.centre.y, dz = at[2] - segment.centre.z;
          const distance = dx * dx + dy * dy + dz * dz;
          if (distance < nearest) { nearest = distance; chosen = name; }
        }
        if (chosen) {
          const segment = foe.segments.get(chosen)!;
          const chosenPoint = predict ? nearSurface(foe, chosen, at) ?? at : at;
          point.set(...chosenPoint).subtractInPlace(segment.position)
            .applyRotationQuaternionToRef(Quaternion.InverseToRef(segment.rotation, inverse), point);
          state.anchor = { body: foe.id, segment: chosen, local: [point.x, point.y, point.z] };
        }
      }
  };
  const clear = () => { state.id = null; state.anchor = null; state.returning = false; state.committed = false; };
  const base = straightPunchExecutor(body, actions, settings, follow);
  state.base = base.state;
  return {
    ...base, state,
    resume(view) { base.resume(view); clear(); },
    interrupt(view, id) { base.interrupt?.(view, id); if (state.id === id) clear(); },
    start(view, request, around) {
      if (state.id !== null) throw new Error("a committed aim already owns a stroke");
      const at = resolve(view, request.target, request.action, request.effector);
      if (!at) throw new Error("the committed aim has no target");
      remember(view, request, at);
      try { base.start(view, request, around); state.id = request.id; state.returning = false; }
      catch (error) { clear(); throw error; }
    },
    update(view, continued, around, dt) {
      if (anchorAtDrive && !state.committed && !state.returning) {
        const request = continued.find(one => one.id === state.id);
        const at = request && resolve(view, request.target, request.action, request.effector);
        if (request && at) remember(view, request, at);
      }
      const updates = base.update(view, continued, around, dt);
      return updates.map(update => {
        if (update.id !== state.id) return update;
        if ("ending" in update) { clear(); return update; }
        if (update.phase === "commit") state.committed = true;
        state.returning = update.phase === "release";
        return state.returning ? { ...update, holds: ["trunk", "legs"] } : update;
      });
    },
    command(view, id, around) {
      const ordinary = base.command(view, id, around);
      // A low punch keeps the planted fold while it owns the trunk and legs.
      const claim = lowSupport && ordinary.lower !== undefined && ordinary.lower > STANCE_LOWER
        ? { ...ordinary, support: ordinary.lower, pushes: ordinary.pushes?.filter(push => push.channel !== "lumbar flexion") } : ordinary;
      // The continuous guard brings the fist back and can cover with it during recovery.
      return state.returning ? { ...claim, posture: Object.fromEntries(Object.entries(claim.posture ?? {}).filter(([name]) => !arms.has(name))), handPoses: {} } : claim;
    },
  };
}
