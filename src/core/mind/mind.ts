import type { BodyView, CoreBody } from "../body.ts";
import type { StanceEnvelope } from "../control/stance-envelope.ts";
import { createSkills, type SkillReport, type Skills } from "../skills/skills.ts";
import type { Intent } from "./intent.ts";

/**
 * **A mind**: each control step, what its body sees becomes an `Intent`. Every driver of a core
 * body that is not a test instrument is one: a scenario's script, a person's keys, the arena's AI.
 * It reaches the body only through its intent, which the skills carry out (`createSkills`).
 */
export interface Mind {
  readonly name: string;
  decide(sight: Sight, dt: number): Intent;
}

/** What a mind sees of itself. What it is aimed at is its own: a scenario hands it its target. */
export interface Sight {
  readonly view: BodyView;
  /** How the skills are going, as the last step left them. */
  readonly report: SkillReport;
  /** What the stance holds with this body (`CoreBody.envelope`): its fastest walk, and its turns. */
  readonly envelope: StanceEnvelope | null;
}

/**
 * Hand `body` to `mind`: each control step the mind decides on the body's view and the skills'
 * report, and the skills make the command. Returns the skills, for their report.
 */
export function driveBy(body: CoreBody, mind: Mind): Skills {
  const skills = createSkills(body);
  const sight: Sight = { view: body.view, report: skills.report, envelope: body.envelope };
  body.drive((view, dt) => skills.command(view, mind.decide(sight, dt), dt));
  return skills;
}
