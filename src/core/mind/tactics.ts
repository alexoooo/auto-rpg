import type { Clearance } from "./clear-step.ts";
import type { Body, BodyView } from "../body.ts";
import type { Offer } from "./options/meta.ts";
import type { StanceEnvelope } from "../control/stance-envelope.ts";
import { recipeSkills, type SkillReport, type Skills } from "../skills/skills.ts";
import type { Intent } from "./intent.ts";
import type { ActionEngagement } from "./action-tactics.ts";

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
  /** What they report doing (`Engagement`), read by status displays and inspection, never by the rules. */
  readonly engagement?: Engagement;
  /** Adapt the constructed skills once, before driving; composed planners prepare from the innermost out. */
  prepareSkills?(skills: Skills): Skills;
}

/** A planner's own fact, which a readout shows as it is: a label and its value, in words. */
export interface EngagementDetail {
  readonly label: string;
  readonly value: string;
}

/**
 * **What a planner reports doing** (`Tactics.engagement`): what every planner may say, its phase
 * (shown by its part's label, `Part.phases`), its focus and whether it lost it, and its own
 * details, which any planner publishes as it likes and a readout shows as they are (`details`).
 * The stock planners add what is theirs: the options controller the offers it chose among
 * (`offers`), the action controller its candidates and the one it pursues (`candidates`, `pending`).
 */
export interface Engagement {
  readonly phase: string;
  readonly focus?: string | null;
  readonly lost?: boolean;
  readonly details?: readonly EngagementDetail[];
  readonly offers?: readonly Offer[];
  readonly candidates?: ActionEngagement["candidates"];
  readonly pending?: ActionEngagement["pending"];
}

/** A live report with a layer's lazy details appended; reading it changes no decision state. */
export function engagementWithDetails(base: () => Engagement | undefined, details: () => readonly EngagementDetail[]): Engagement {
  return {
    get phase() { return base()?.phase ?? "unreported"; },
    get focus() { return base()?.focus; },
    get lost() { return base()?.lost; },
    get candidates() { return base()?.candidates; },
    get pending() { return base()?.pending; },
    get offers() { return base()?.offers; },
    get details() { return [...base()?.details ?? [], ...details()]; },
  };
}

/**
 * What tactics see: the body's view, with what it senses of the others (`BodyView.senses`), how
 * its skills are going, and what its stance holds.
 */
export interface Sight {
  readonly instance: Skills["instance"];
  readonly readiness: Skills["readiness"];
  readonly view: BodyView;
  /** How the skills are going, as the last step left them. */
  readonly report: SkillReport;
  /** What the skills' locomotion was measured to hold with this body (`Locomotion.envelope`), as it is now: its fastest walk, and its turns. */
  readonly envelope: StanceEnvelope | null;
  /** How the body keeps clear of the solids sensed (`Skills.clearance`): its navigator's, so replacing the navigator replaces it for the planner. */
  readonly clearance: Clearance;
}

/**
 * Hand `body` to `tactics`: each control step they decide on the body's view and the skills'
 * report, and the skills `make` makes (the recipe strike's set, `recipeSkills`, unless given) make the command.
 * Returns the skills, for their report. On the step the body is back from another mind
 * (`BodyView.resumed`) the skills are resumed before the tactics decide, so the report they read
 * is of the body as it is.
 */
export function driveBy(body: Body, tactics: Tactics, make: (body: Body, tactics: Tactics) => Skills = recipeSkills): Skills {
  const made = make(body, tactics), skills = tactics.prepareSkills ? tactics.prepareSkills(made) : made;
  const sight: Sight = { view: body.view, report: skills.report, get envelope() { return skills.envelope; }, instance: skills.instance, readiness: skills.readiness, clearance: skills.clearance };
  body.drive((view, dt) => {
    if (view.resumed) skills.resume(view);
    return skills.command(view, tactics.decide(sight, dt), dt);
  }, skills.release);
  return skills;
}
