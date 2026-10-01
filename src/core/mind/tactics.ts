import type { Body, BodyView } from "../body.ts";
import type { StanceEnvelope } from "../control/stance-envelope.ts";
import { createSkills, type SkillOptions, type SkillReport, type Skills } from "../skills/skills.ts";
import type { Intent } from "./intent.ts";

/**
 * **Tactics**: each control step, what a body sees becomes an `Intent`. The top layer of a mind
 * made of layers (`driveBy`): a scenario's script, a person's keys, the arena's AI. They reach the
 * body only through their intent, which the skills carry out (`createSkills`).
 */
export interface Tactics {
  readonly name: string;
  decide(sight: Sight, dt: number): Intent;
}

/**
 * What tactics see: the body's view, with what it senses of the others (`BodyView.senses`), how
 * its skills are going, and what its stance holds.
 */
export interface Sight {
  readonly view: BodyView;
  /** How the skills are going, as the last step left them. */
  readonly report: SkillReport;
  /** What the stance holds with this body (`Body.envelope`): its fastest walk, and its turns. */
  readonly envelope: StanceEnvelope | null;
}

/**
 * Hand `body` to `tactics`: each control step they decide on the body's view and the skills'
 * report, and the skills make the command; `options` are an experiment's. Returns the skills, for
 * their report.
 */
export function driveBy(body: Body, tactics: Tactics, options?: SkillOptions): Skills {
  const skills = createSkills(body, options);
  const sight: Sight = { view: body.view, report: skills.report, envelope: body.envelope };
  body.drive((view, dt) => skills.command(view, tactics.decide(sight, dt), dt));
  return skills;
}
