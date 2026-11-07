import type { KeysOf, Part, PartConfig } from "../../parts/parts.ts";
import type { Body, BodyView } from "../../control/body.ts";
import type { LegsAsked, LegsGoal, Skill } from "./skill.ts";

/** A support service's transition and the posture it asks of each channel's owner. */
export interface LowSupportReport {
  readonly stage: string;
  readonly ready: boolean;
  readonly posture: Readonly<Record<string, number>>;
}

/** A service that carries eligible legs goals through its supported transition. */
export interface LowSupportSkill extends Skill {
  readonly state: object;
  readonly report: LowSupportReport;
  /** Whether this service carries the goal's requested support. */
  carries(goal: LegsGoal): boolean;
  /** Whether the legs may walk while this service carries them. */
  walks(): boolean;
  /** Move toward the requested height, or the legs' own height where omitted. */
  tick(view: BodyView, height: number | undefined, moving: boolean, dt: number): void;
  /** The goal as this service's current supported transition carries it. */
  lay(view: BodyView, goal: LegsAsked): LegsAsked;
}

/** **A kind of low support**: a part of role `support` that makes the skill a body fights from low support by. */
export interface LowSupportPart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "support";
  readonly keys: KeysOf<C>;
  make(body: Body, config: C): LowSupportSkill;
}

declare module "../../parts/lookup.ts" {
  interface RoleParts {
    readonly support: LowSupportPart;
  }
}
