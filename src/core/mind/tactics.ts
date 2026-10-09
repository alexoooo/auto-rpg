import type { Body, BodyView } from "../body.ts";
import type { StanceEnvelope } from "../control/stance-envelope.ts";
import type { AttackTuning } from "../skills/attack-path.ts";
import type { KickTuning } from "../skills/kick.ts";
import { recipeSkills, type SkillReport, type Skills } from "../skills/skills.ts";
import type { Intent } from "./intent.ts";

/**
 * **Tactics**: each control step, what a body sees becomes an `Intent`. The top layer of a mind
 * made of layers (`driveBy`): a scenario's script, a person's keys, the arena's AI. They reach the
 * body only through their intent, which the skills carry out (`Skills`).
 */
export interface Tactics<S = Sight, I = Intent> {
  readonly name: string;
  decide(sight: S, dt: number): I;
  /**
   * Their memory, if they have any (`src/core/state.ts`), saved and loaded with their body's skills'
   * (`Skills.state`). Tactics that keep what they remember anywhere else do not fork.
   */
  readonly state?: object;
  /** Current engagement decision, read by gameplay status displays. */
  readonly engagement?: { readonly phase: string };
}

/**
 * **What a fighter's skills can do**, as its tactics plan by it: read from the skills' configs,
 * never from the tactics' own.
 */
export interface Abilities {
  /** The timings of the blow's hand paths: the path strike's, or `ATTACK_PATH` for a blow of none. */
  readonly paths: AttackTuning;
  /** Its kick, or null with no kick skill. */
  readonly kick: KickTuning | null;
  /** Whether it has a skill to fight from low support. */
  readonly ground: boolean;
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
 * report, and the skills `make` makes (the recipe strike's set, `recipeSkills`, unless given) make the command.
 * Returns the skills, for their report. On the step the body is back from another mind
 * (`BodyView.resumed`) the skills are resumed before the tactics decide, so the report they read
 * is of the body as it is.
 */
export function driveBy(body: Body, tactics: Tactics, make: (body: Body, tactics: Tactics) => Skills = recipeSkills): Skills {
  const skills = make(body, tactics);
  const sight: Sight = { view: body.view, report: skills.report, envelope: body.envelope };
  body.drive((view, dt) => {
    if (view.resumed) skills.resume(view);
    return skills.command(view, tactics.decide(sight, dt), dt);
  }, skills.release);
  return skills;
}
