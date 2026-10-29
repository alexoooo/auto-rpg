import type { BodyView } from "../body.ts";
import type { Pose, MusclePush, EffectorGoal, PointTask } from "../control/motor.ts";
import type { HandPose } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { Around, LegsGoal, Skill } from "./skill.ts";


/** A sensed body's region, or a particular segment of that body. */
export type Region = { readonly kind: "mark"; readonly mark: "high" | "middle" | "legs" | "any" }
  | { readonly kind: "segment"; readonly segment: string };

/** Identity stays attached to an aim through preparation, execution and contact attribution. */
export type TargetRef = { readonly kind: "body"; readonly body: string; readonly region: Region }
  | { readonly kind: "point"; readonly at: Vec3; readonly body?: string; readonly direction?: Vec3 };

/** Where an executor drives at `target` for `action` with `effector` this step, or null where it has no point. */
export type TargetResolver = (view: BodyView, target: TargetRef, action: string, effector: string) => Vec3 | null;

/** A point target's own point; none for a body: the resolver of a kit that aims at points alone. */
export const pointTarget: TargetResolver = (_view, target) => target.kind === "point" ? target.at : null;

/** Named controls; the body's compiled footprints decide which names overlap. */
export type Resource = string;
export type Phase = "prepare" | "commit" | "release";
export type ContactKind = "target" | "block" | "incidental" | "world";

/** The entry geometry an approach controller must satisfy before admission. */
export interface Window {
  readonly at: Vec3;
  readonly along: readonly [number, number];
  readonly across: readonly [number, number];
  readonly facing: number;
  readonly speed: number;
}

/** Admission permits bounded preparation; it never waits for unowned preparation work. */
export type Readiness = { readonly kind: "ready" } | { readonly kind: "position"; readonly window: Window }
  | { readonly kind: "waiting" | "blocked"; readonly reason: string };

/** A request's identity and anatomical choice remain fixed for its lifetime. */
export interface ActionRequest {
  readonly id: number;
  readonly action: string;
  readonly effector: string;
  readonly target: TargetRef;
}

/** Detached target data prevents a producer from changing an issued request by alias. */
export function copyActionTarget(target: TargetRef): TargetRef {
  switch (target.kind) {
    case "body": return { ...target, region: { ...target.region } };
    case "point": return { ...target, at: [...target.at], ...(target.direction ? { direction: [...target.direction] } : {}) };
    default: { const never: never = target; throw new Error(`unknown target ${JSON.stringify(never)}`); }
  }
}

/** Immutable identity excludes only a point's moving coordinates and contact direction. */
export function sameActionIdentity(a: Omit<ActionRequest, "id">, b: Omit<ActionRequest, "id">): boolean {
  if (a.action !== b.action || a.effector !== b.effector || a.target.kind !== b.target.kind || a.target.body !== b.target.body) return false;
  if (a.target.kind === "point" || b.target.kind === "point") return true;
  const left = a.target.region, right = b.target.region;
  return left.kind === right.kind && (left.kind === "mark" && right.kind === "mark" ? left.mark === right.mark
    : left.kind === "segment" && right.kind === "segment" && left.segment === right.segment);
}

/** One newly loaded contact, attributed to the command that produced its physics interval. */
export interface Observation {
  readonly step: number;
  readonly time: number;
  readonly phase: Phase;
  readonly kind: ContactKind;
  readonly struck: { readonly body: string; readonly segment: string } | null;
  readonly by: string;
}

/** Exact aggregates are independent of the bounded inspection history. */
interface ContactSummary {
  readonly counts: Readonly<Record<Phase, Readonly<Record<ContactKind, number>>>>;
  readonly loadedInCommit: boolean;
  readonly blockedSegments: readonly string[];
  readonly lastTarget: number | null;
}

export interface ActionStatus extends ActionRequest {
  readonly phase: Phase;
  readonly stage: string;
  readonly holds: readonly Resource[];
  readonly observations: readonly Observation[];
  readonly contacts: ContactSummary;
}

export interface ActionEnding {
  readonly kind: "completed" | "cancelled" | "refused" | "interrupted" | "lost" | "stalled";
  readonly reason?: string;
}

/** One terminal record, retained in the body's bounded ledger. */
export interface Ended extends ActionRequest {
  readonly sequence: number;
  readonly began: number;
  readonly ended: number;
  readonly ending: ActionEnding;
  readonly committed: boolean;
  readonly contacts: ContactSummary;
  readonly observations: readonly Observation[];
  readonly observed: number;
}

/** An executor can relinquish controls, but never acquire new ones after admission. */
export type LifecycleUpdate = { readonly id: number; readonly phase: Phase; readonly stage: string; readonly holds: readonly Resource[] }
  | { readonly id: number; readonly ending: ActionEnding };

/** Sparse writes owned by one instance; a held control it leaves unwritten is the defaults' (`skillSet`). */
export interface ActionClaim {
  readonly posture?: Pose;
  readonly pushes?: readonly MusclePush[];
  readonly points?: readonly PointTask[];
  readonly effectors?: Readonly<Record<string, EffectorGoal | null>>;
  /** Hand poses by the hand's segment (`BodyCommand.handPoses`). */
  readonly handPoses?: Readonly<Partial<Record<string, HandPose>>>;
  /**
   * With the legs held, the legs goal (`LegsGoal`), which the legs complete; null, no stance at
   * all: the legs' muscles are the claim's own (pushed), and the legs, the guard, low support and
   * navigation resume once no claim holds them so.
   */
  readonly legs?: LegsGoal | null;
}

/** Continuous context at the start of a control step. */
export interface ActionAround extends Around {
  readonly walk: readonly [number, number] | null;
  readonly lower: number;
}

/** Motion belongs to executors; identity, ownership and terminal records belong to their set. */
export interface Executor extends Skill {
  needs(action: string, effector: string): readonly Resource[];
  readiness(view: BodyView, action: string, effector: string, target: TargetRef, around: ActionAround): Readiness;
  update(view: BodyView, continued: readonly ActionRequest[], around: ActionAround, dt: number): readonly LifecycleUpdate[];
  start(view: BodyView, request: ActionRequest, around: ActionAround): void;
  command(view: BodyView, id: number, around: ActionAround): ActionClaim;
  /** Forget instance `id` at once, what it held going back to the defaults; an executor without it lets its actions run their course. */
  interrupt?(view: BodyView, id: number): void;
  readonly state: object;
}
