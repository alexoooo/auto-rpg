import type { BuiltSegment } from "../build/build-body.ts";
import { colliderOf } from "../build/build-body.ts";
import type { BodySpec, HandPose } from "../spec/body.ts";
import { handShapeAt } from "../spec/body.ts";
import { deepFreeze } from "../state.ts";
import type { World } from "../world.ts";

export interface HandPoseRequest { readonly hand: "left" | "right"; readonly pose: HandPose }

/** Detached requests; an applied pose changes only at an unloaded, clear world-step boundary. */
export interface HandPoses {
  readonly model: readonly { readonly hand: "left" | "right"; readonly poses: readonly HandPose[] }[];
  readonly state: Record<string, { applied: HandPose; requested: HandPose }>;
  check(requests: readonly HandPoseRequest[]): readonly HandPoseRequest[];
  request(requests: readonly HandPoseRequest[]): void;
  dispose(): void;
}

/** Rigid-hand articulation uses the body's existing mass properties, never a shape's inferred mass. */
export function createHandPoses(spec: BodySpec, segments: ReadonlyMap<string, BuiltSegment>, world: World): HandPoses {
  const state: HandPoses["state"] = {};
  const hands = (["left", "right"] as const).flatMap(hand => {
    const part = segments.get(`hand.${hand}`);
    if (!part?.handPose || !part.spec.handPoses) return [];
    state[hand] = part.handPose;
    const shapes = { open: colliderOf(part.frame, handShapeAt(spec, part.spec, "open")),
      fist: colliderOf(part.frame, handShapeAt(spec, part.spec, "fist")), grip: colliderOf(part.frame, handShapeAt(spec, part.spec, "grip")) };
    return [{ hand, part, shapes, held: !!spec.held?.some(item => item.segment === part.spec.name) }];
  });
  const check: HandPoses["check"] = requests => {
    if (!Array.isArray(requests)) throw new Error("hand pose requests must be an array");
    const seen = new Set<string>();
    return deepFreeze(requests.map(request => {
      if (!request || !hands.some(h => h.hand === request.hand) || seen.has(request.hand)
        || !["open", "fist", "grip"].includes(request.pose)) throw new Error("invalid or duplicate hand pose request");
      seen.add(request.hand); return { ...request };
    }));
  };
  const hook = world.beforeStep(() => {
    for (const hand of hands) {
      const pose = state[hand.hand]!;
      const attached = hand.part.body.gripping();
      const desired = hand.held ? "grip" : attached ? (pose.requested === "open" ? pose.applied : "grip") : pose.requested;
      if (desired === pose.applied) continue;
      if (world.physics.contactsOf(hand.part.body).some(contact => contact.impulse > 0)) continue;
      if (!hand.part.body.canChangeShape(0, hand.shapes[desired])) continue;
      hand.part.body.changeShape(0, hand.shapes[desired]); pose.applied = desired;
    }
  });
  return { model: deepFreeze(hands.map(h => ({ hand: h.hand, poses: ["open", "fist", "grip"] as HandPose[] }))), state, check,
    request(requests) { for (const request of check(requests)) state[request.hand]!.requested = request.pose; }, dispose: () => hook.dispose() };
}
