import type { Body, BodyView } from "../control/body.ts";
import type { StanceEnvelope } from "../control/stance/stance-envelope.ts";
import type { SkillReport, Skills } from "../skills/framework/skills.ts";
import type { Intent } from "../skills/framework/intent.ts";

/**
 * **A script**: what a screen runs over a body's sight (the Lab's modes), each control step what
 * the body sees becoming what it asks (an `Intent`), given as orders that the body's own mind
 * carries out.
 */
export interface Script {
  decide(sight: Sight, dt: number): Intent;
  /** Its memory, if it has any (`src/core/state.ts`), saved and loaded with its actor's. A script that keeps what it remembers anywhere else does not fork. */
  readonly state?: object;
}

/**
 * **What a Mind's deciding sees**: the body's view, with what it senses of the others
 * (`BodyView.senses`), and its skills: how they are going (`report`), and what it reads and asks
 * of its legs, its navigation and its actions (`Skills`).
 */
export interface Sight {
  readonly view: BodyView;
  /** What the body's plain walk holds (`Body.envelope`): the ceiling of orders to walk, not run (`Intent.walk`). */
  readonly walkEnvelope: StanceEnvelope | null;
  /** How the skills are going, as the last step left them. */
  readonly report: SkillReport;
  /** How fast its legs can go, by each gait (`SkillsLegs`). */
  readonly legs: Skills["legs"];
  /** How its navigation keeps the body clear (`SkillsNavigation`): the navigator's, so replacing the navigator replaces it for whoever decides. */
  readonly navigation: Skills["navigation"];
  /** Whether an action can begin and what it would hold (`SkillsActions`). */
  readonly actions: Skills["actions"];
}

/** **What deciding for `body` sees** with `skills` (`Sight`). */
export const sightOf = (body: Pick<Body, "view" | "envelope">, skills: Pick<Skills, "report" | "legs" | "navigation" | "actions">): Sight =>
  ({ view: body.view, walkEnvelope: body.envelope, report: skills.report, legs: skills.legs, navigation: skills.navigation, actions: skills.actions });
