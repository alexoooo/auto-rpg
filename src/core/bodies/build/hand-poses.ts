import type { BuiltSegment } from "./build-body.ts";
import type { BodySpec, HandPose, SegmentSpec } from "../spec/body.ts";
import { deepFreeze } from "../../world/state.ts";
import type { ColliderShape } from "../../physics/engine.ts";
import type { World } from "../../world/world.ts";

/**
 * **A hand's collision shape by pose**: open, fist or grip, each the hand segment's
 * (`SegmentSpec.handPoses`). A request waits for an unloaded hand whose new shape overlaps nothing;
 * the collider keeps its handle, filters, transform, velocity and mass. Requested and applied poses
 * are state, so a fork or a load keeps a pending change. A closure the skin draws carries no
 * collision.
 */
export interface HandPoseRequest { readonly hand: "left" | "right"; readonly pose: HandPose }

/** Hand-pose names in their command and mirror encoding order. */
const HAND_POSES: readonly HandPose[] = Object.freeze(["open", "fist", "grip"]);

/** A hand's code in an actuator command. */
export const handCode = (hand: "left" | "right"): number => hand === "left" ? 0 : 1;

/** The hand named by an actuator command's code. */
export const handAt = (code: number): "left" | "right" => code === 0 ? "left" : "right";

/** A pose's command code; an observation without a hand pose uses -1. */
export const handPoseCode = (pose: HandPose | undefined): number => pose === undefined ? -1 : HAND_POSES.indexOf(pose);

/** The pose named by a command or observation's code. */
export const handPoseAt = (code: number): HandPose => HAND_POSES[code]!;

/** Detached requests; an applied pose changes only at an unloaded, clear world-step boundary. */
export interface HandPoses {
  /** Each posable hand: its name in a request, the segment it is, and its poses. */
  readonly model: readonly { readonly hand: "left" | "right"; readonly segment: string; readonly poses: readonly HandPose[] }[];
  readonly state: Record<string, { applied: HandPose; requested: HandPose }>;
  requestOne(hand: "left" | "right", pose: HandPose): void;
  dispose(): void;
}

/**
 * Whether a hand's change of pose to `collider` is blocked this step: a contact pushes on the hand,
 * or the new shape would overlap something.
 */
function poseBlocked(world: World, part: BuiltSegment, collider: ColliderShape): boolean {
  return world.physics.contactsOf(part.body).some(contact => contact.impulse > 0) || !part.body.canChangeShape(0, collider);
}

/** **Each posable hand of a body of `segments`**, as a hand pose request names it, the segment it is and its poses (`HandPoses.model`): a hand segment with poses. */
export function handPoseModel(segments: readonly SegmentSpec[]): HandPoses["model"] {
  return deepFreeze((["left", "right"] as const).flatMap((hand) => segments.some((segment) => segment.name === `hand.${hand}` && segment.handPoses)
    ? [{ hand, segment: `hand.${hand}`, poses: HAND_POSES }] : []));
}

/** A hand and pose admitted by the body's model, checked without constructing a request. */
export function checkHandPose(model: HandPoses["model"], hand: "left" | "right", pose: HandPose): void {
  let known = false;
  for (let i = 0; i < model.length; i++) if (model[i]!.hand === hand) { known = true; break; }
  if (!known || (pose !== "open" && pose !== "fist" && pose !== "grip")) throw new Error("invalid or duplicate hand pose request");
}

/** Rigid-hand articulation uses the body's existing mass properties, never a shape's inferred mass. */
export function createHandPoses(spec: BodySpec, segments: ReadonlyMap<string, BuiltSegment>, world: World): HandPoses {
  const state: HandPoses["state"] = {};
  const hands = (["left", "right"] as const).flatMap(hand => {
    const part = segments.get(`hand.${hand}`);
    if (!part?.handPose || !part.poses) return [];
    state[hand] = part.handPose;
    return [{ hand, part, poses: part.poses, held: !!spec.held?.some(item => item.segment === part.spec.name) }];
  });
  const model = handPoseModel([...segments.values()].filter((segment) => segment.handPose && segment.poses).map((segment) => segment.spec));
  const hook = hands.length === 0 ? null : world.prepare(() => {
    for (const hand of hands) {
      const pose = state[hand.hand]!;
      const attached = hand.part.body.gripping();
      const desired = hand.held ? "grip" : attached ? (pose.requested === "open" ? pose.applied : "grip") : pose.requested;
      if (desired === pose.applied) continue;
      const collider = hand.poses[desired].collider;
      if (poseBlocked(world, hand.part, collider)) continue;
      hand.part.body.changeShape(0, collider); pose.applied = desired;
    }
  });
  return { model, state,
    requestOne(hand, pose) { checkHandPose(model, hand, pose); state[hand]!.requested = pose; },
    dispose: () => hook?.dispose() };
}
