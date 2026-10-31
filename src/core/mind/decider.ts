import type { Clearance } from "../navigation/clear-step.ts";
import type { Body, BodyView } from "../body.ts";
import type { StanceEnvelope } from "../control/stance-envelope.ts";
import { standingSkills, type SkillReport, type Skills } from "../skills/framework/skills.ts";
import type { Intent } from "../intent/intent.ts";
import type { Engagement } from "./engagement.ts";
import { skillsReport, type MindReport } from "./report.ts";

/**
 * **A decider**: each control step, what a body sees (`S`) becomes what it asks (`I`, an `Intent`
 * for the skills). The top layer of a mind made of layers (`driveBy`): a scenario's script, a
 * person's keys, a planner, a chooser over options. It reaches the body only through what it asks,
 * which the skills carry out (`Skills`).
 */
export interface Decider<S = Sight, I = Intent, D = unknown> {
  readonly name: string;
  decide(sight: S, dt: number): I;
  /**
   * Its memory, if it has any (`src/core/state.ts`), saved and loaded with its mind's
   * (`Driven.state`). A decider that keeps what it remembers anywhere else does not fork.
   */
  readonly state?: object;
  /** What it reports doing (`Engagement`), read by status displays and inspection, never by the rules. */
  readonly engagement?: Engagement;
  /** What it decided this step that the skills prepared for it read live (`D`), where it publishes one. */
  readonly decision?: D;
}

/**
 * **A script**: a decider a screen gives a mind in place of its own (`MindWiring.script`: the Lab's
 * modes), which publishes no decision (`Decider.decision`): what the skills read of a decision is
 * its mind's own decider's to publish.
 */
export type Script = Decider<Sight, Intent, never>;

/** A decider in `decider`'s place that reads through to it: a screen's instrument, which changes what it decides and nothing else. */
export type AroundDecider = <T extends Decider>(decider: T) => T;

/**
 * What a decider sees: the body's view, with what it senses of the others (`BodyView.senses`), how
 * its skills are going, and what its stance holds.
 */
export interface Sight {
  readonly instance: Skills["instance"];
  readonly readiness: Skills["readiness"];
  readonly needs: Skills["needs"];
  readonly view: BodyView;
  /** How the skills are going, as the last step left them. */
  readonly report: SkillReport;
  /** What the skills' locomotion was measured to hold with this body (`Locomotion.envelope`), as it is now: its fastest walk, and its turns. */
  readonly envelope: StanceEnvelope | null;
  /** What it holds going by a gait (`Skills.envelopeOf`). */
  readonly envelopeOf: Skills["envelopeOf"];
  /** How the body keeps clear of the solids sensed (`Skills.clearance`): its navigator's, so replacing the navigator replaces it for the decider. */
  readonly clearance: Clearance;
}

/**
 * **A mind driven by its decider over its skills** (`driveBy`): the skills, the mind's memory, its
 * skills' and its decider's (`MindMade.state`), and its report (`skillsReport`).
 */
export interface Driven {
  readonly skills: Skills;
  readonly state: { readonly skills: object; readonly decider: object | null };
  readonly report: MindReport;
}

/**
 * Hand `body` to `decider`: each control step it decides on the body's view and the skills'
 * report, and the skills `make` makes (legs and guard with no action, `standingSkills`, unless given) make the command.
 * Returns the mind so driven (`Driven`). On the step the body is back from another mind
 * (`BodyView.resumed`) the skills are resumed before the decider decides, so the report it reads
 * is of the body as it is.
 */
export function driveBy(body: Body, decider: Decider, make: (body: Body) => Skills = standingSkills): Driven {
  const skills = make(body);
  const sight: Sight = { view: body.view, report: skills.report, get envelope() { return skills.envelope; }, envelopeOf: skills.envelopeOf, instance: skills.instance, readiness: skills.readiness, needs: skills.needs, clearance: skills.clearance };
  body.drive((view, dt) => {
    if (view.resumed) skills.resume(view);
    return skills.command(view, decider.decide(sight, dt), dt);
  }, skills.release);
  return { skills, state: { skills: skills.state, decider: decider.state ?? null }, report: skillsReport(skills, decider) };
}
