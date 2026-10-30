import type { effectorTracker } from "../control/effector-tracker.ts";
import type { EffectorFeedback } from "../control/effector-feedback.ts";
import type { supportedMotor, SupportedCommand, SupportEndpoint } from "../control/supported-motor.ts";
import type { OwnBody } from "../mind/mind.ts";
import type { Navigator } from "../mind/navigator.ts";
import type { Orders } from "../mind/orders.ts";
import type { Part, PartConfig } from "../mind/parts.ts";
import type { Tactics } from "../mind/tactics.ts";
import type { Skill } from "../skills/skill.ts";
import type { StrikeCycleState } from "../skills/strike-cycle.ts";
import type { BodySpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { fitsAll, fitsWhen } from "../mind/parts.ts";
import type { QuadrupedView, TravelOrders } from "./crawl.ts";
import type { REPTILE_BITE } from "./tuning.ts";

/** How fast a support motor answers, s (`supportedMotor`'s timing). */
type Response = Pick<Parameters<typeof supportedMotor>[2], "centre" | "endpoint" | "turn" | "posture">;

/** **A motor over a body's support chains** (`supportedMotor`), and the responses it holds still and travels at. */
export interface SupportMotor {
  readonly motor: ReturnType<typeof supportedMotor>;
  readonly hold: Response;
  readonly travel: Response;
}

/** **A kind of support motor**: a part of role `support-motor`, made over the paws a body stands on. */
export interface SupportMotorPart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "support-motor";
  make(own: OwnBody, paws: readonly SupportEndpoint[], config: C): SupportMotor;
}

/** What a quadruped reads of a gait beside its command: how high it carries the body and how its paws lift, swing and plant. */
export interface GaitSettings {
  readonly crawlHeight: number;
  readonly lift: number;
  readonly plantSpeed: number;
  readonly plant: number;
  readonly swing: number;
}

/**
 * **A gait over support chains**: where the body and each paw go this step for the travel asked
 * (`SupportedCommand`), at `height` of its standing height where it takes one. Its state says the
 * phase it is in (`settle` between steps), the steps and placements it has made, and whether it
 * stands; a gait that turns in place says by how much it is still turning (`align`).
 */
export interface Gait extends Skill<QuadrupedView> {
  readonly state: { readonly phase: string; readonly steps: number; readonly sequence: number; readonly standing: boolean; readonly align?: number };
  readonly settings: GaitSettings;
  command(view: QuadrupedView, orders: TravelOrders, dt: number, height?: number): SupportedCommand;
}

/** **A kind of gait**: a part of role `gait`, made over the paws a body stands on, in the order it lifts them. */
export interface GaitPart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "gait";
  make(own: OwnBody, motor: SupportMotor["motor"], paws: readonly string[], config: C): Gait;
}

/** The bite's settings (`REPTILE_BITE`): what a bite and the tactics that aim it share. */
export type BiteTuning = typeof REPTILE_BITE;

/** **A jaw's bite**: the stroke at a point, on the strike cycle (`StrikeCycleState`), written into the gait's command. */
export interface Bite extends Skill<QuadrupedView> {
  readonly state: { readonly cycle: StrikeCycleState };
  withdraw(): boolean;
  tracked(channel: number): readonly [number, number, number] | undefined;
  response(channel: number): number | undefined;
  command(view: QuadrupedView, target: Vec3 | null, ready: boolean, dt: number, command: SupportedCommand, prepare: boolean,
    selection?: { foe: string; part: string; tooth?: string } | null): void;
}

/** **A kind of bite**: a part of role `bite`, made with the body's effector tracker and the jaw's and head's contact feedback. */
export interface BitePart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "bite";
  make(own: OwnBody, tracker: ReturnType<typeof effectorTracker>, tuning: BiteTuning, feedback: { readonly jaw: EffectorFeedback; readonly head: EffectorFeedback }, config: C): Bite;
}

/** What a quadruped's tactics ask: the travel, and where and whether to bite. */
export interface QuadrupedIntent extends TravelOrders {
  readonly biteAt: Vec3 | null;
  readonly prepareBite: boolean;
  readonly creep: boolean;
  readonly travel: boolean;
}

/** What a quadruped's tactics see: the body's view and where its bite is. */
export interface QuadrupedSight { readonly view: QuadrupedView; readonly bite: Pick<StrikeCycleState, "phase"> }

/** **A quadruped's tactics**: its memory names the target it bites at (a foe's part, a point there and the tooth), which its body forgets when it is taken over. */
export interface QuadrupedTactics extends Tactics<QuadrupedSight, QuadrupedIntent> {
  readonly state: { pending: number; phase: StrikeCycleState["phase"]; target: { foe: string; part: string; local: Vec3; tooth: string } | null };
}

/** What a quadruped's tactics are made with beside their config: its orders, its navigation, the bite's settings and a study's fixed bite point. */
export interface QuadrupedTacticsMaking {
  readonly own: OwnBody;
  readonly orders: (view: QuadrupedView) => Orders | null;
  readonly navigation: Navigator;
  readonly bite: BiteTuning;
  readonly biteTarget?: (view: QuadrupedView) => Vec3 | null;
}

/** **A kind of quadruped tactics**: a part of role `quadruped-tactics`. */
export interface QuadrupedTacticsPart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "quadruped-tactics";
  make(making: QuadrupedTacticsMaking, config: C): QuadrupedTactics;
}

/** The effectors a body of `spec` stands on. */
const supportsOf = (spec: BodySpec) => (spec.effectors ?? []).filter((effector) => effector.support);

/** The joint `name` hangs from, if any. */
const above = (spec: BodySpec, name: string) => spec.joints.find((joint) => joint.child === name);

/** How many joints from the root `name` is. */
const depth = (spec: BodySpec, name: string): number => { const joint = above(spec, name); return joint ? 1 + depth(spec, joint.parent) : 0; };

/** A part's `fits` for a body on three paws or more, each the end of a hip, a knee and an ankle from the root, so two stay down while one steps. */
export const fitsPaws = fitsWhen((spec: BodySpec) => supportsOf(spec).length >= 3 && supportsOf(spec).every((paw) => depth(spec, paw.segment) === 3),
  "needs three paws or more, each at the end of a hip, a knee and an ankle");

/** A part's `fits` for a body with a jaw: a segment with a bite point hinged to a head with a mouth (`mouthOf`). */
export const fitsJaw = fitsWhen((spec: BodySpec) => {
  const jaw = spec.segments.find((s) => s.points?.bite), parent = jaw && above(spec, jaw.name)?.parent, head = spec.segments.find((s) => s.name === parent);
  return !!head?.points?.mouth && above(spec, head.name) !== undefined;
}, "needs a jaw with a bite point, hinged to a head with a mouth");

/** The quadruped's `fits`: its paws and its jaw. */
export const fitsQuadruped = fitsAll(fitsPaws, fitsJaw);

// The quadruped's roles, added to the roles the part lookup knows (`RoleParts`).
declare module "../mind/lookup.ts" {
  interface RoleParts {
    readonly "support-motor": SupportMotorPart;
    readonly gait: GaitPart;
    readonly bite: BitePart;
    readonly "quadruped-tactics": QuadrupedTacticsPart;
  }
}
