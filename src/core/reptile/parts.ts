import type { SupportedCommand } from "../control/supported-motor.ts";
import type { Part, PartConfig } from "../parts/parts.ts";
import type { ReadBody, ReadSegment } from "../read-body.ts";
import type { Skill } from "../skills/framework/skill.ts";
import type { BodySpec } from "../spec/body.ts";
import { fitsWhen } from "../parts/parts.ts";
import type { TravelOrders } from "./crawl.ts";
import type { PawReading, PawView } from "./paws.ts";
import { pawsOf, segmentOf } from "../spec/body.ts";

/** What a quadruped reads of a gait beside its command: how high it carries the body and how its paws lift, swing and plant. */
interface GaitSettings {
  readonly crawlHeight: number;
  readonly lift: number;
  readonly plantSpeed: number;
  readonly plant: number;
  readonly swing: number;
  /**
   * Where the gait keeps its swings on the ground: each swinging paw's path held where it left the
   * floor, driven firm (`EffectorGoal.firm`) at this tracking response, s.
   */
  readonly swingResponse?: number;
}

/**
 * **How far and how fast a gait carries the body**: its fastest travel forward at its full travel
 * asked, m/s; the share of that it goes to a side or back; and its fastest turn, rad/s. What its
 * legs state of it to the speed rule and the walks that price it (`StanceEnvelope`).
 */
export interface GaitReach {
  readonly forward: number;
  readonly aside: number;
  readonly turn: number;
}

/**
 * **A gait over support chains**: where the body and each paw go this step for the travel asked
 * (`SupportedCommand`), at `height` of its standing height where it takes one. Its state says the
 * phase it is in (`settle` between steps), the steps it has made (paws that cleared the floor),
 * its placements (paws that landed, cleared or dragged), its count of paths (`sequence`) and
 * whether it stands.
 */
export interface Gait extends Skill<PawView> {
  readonly state: { readonly phase: string; readonly steps: number; readonly placed: number; readonly sequence: number; readonly standing: boolean };
  readonly settings: GaitSettings;
  readonly reach: GaitReach;
  command(view: PawView, orders: TravelOrders, dt: number, height?: number): SupportedCommand;
}

/**
 * **A kind of paw gait**: a part of role `paw-gait`, made over the body `built`, its trunk `root`
 * and the paws it stands on (`names`, in the order it lifts them) as `paws` reads them.
 */
export interface PawGaitPart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "paw-gait";
  make(built: ReadBody, root: ReadSegment, paws: PawReading, names: readonly string[], config: C): Gait;
}

/** The joint `name` hangs from, if any. */
const above = (spec: BodySpec, name: string) => spec.joints.find((joint) => joint.child === name);

/** How many joints from the root `name` is. */
const depth = (spec: BodySpec, name: string): number => { const joint = above(spec, name); return joint ? 1 + depth(spec, joint.parent) : 0; };

/** A part's `fits` for a body on three paws or more, each the end of a hip, a knee and an ankle from the root, so two stay down while one steps. */
export const fitsPaws = fitsWhen((spec: BodySpec) => pawsOf(spec).length >= 3 && pawsOf(spec).every((paw) => depth(spec, paw.segment) === 3),
  "needs three paws or more, each at the end of a hip, a knee and an ankle");

/** A part's `fits` for a body with a jaw: a segment with a bite point hinged to a head with a mouth (`mouthOf`). */
export const fitsJaw = fitsWhen((spec: BodySpec) => {
  const jaw = spec.segments.find((s) => s.points?.bite), parent = jaw && above(spec, jaw.name)?.parent, head = parent === undefined ? undefined : segmentOf(spec, parent);
  return !!head?.points?.mouth && above(spec, head.name) !== undefined;
}, "needs a jaw with a bite point, hinged to a head with a mouth");

// The paw gaits' role, added to the roles the part lookup knows (`RoleParts`).
declare module "../parts/lookup.ts" {
  interface RoleParts {
    readonly "paw-gait": PawGaitPart;
  }
}
