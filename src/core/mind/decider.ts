import type { Clearance } from "../navigation/clear-step.ts";
import type { Body, BodyView } from "../body.ts";
import type { StanceEnvelope } from "../control/stance-envelope.ts";
import { standingSkills, type SkillReport, type Skills } from "../skills/framework/skills.ts";
import type { Intent } from "../intent/intent.ts";
import type { Engagement } from "./engagement.ts";
import { skillsReport, type MindReport, type Prospect } from "./report.ts";

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
  /** What it expects of each foe it has priced (`Prospect`), where it says, read by its team's Commander, never by the rules. */
  readonly prospects?: readonly Prospect[];
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
 * skills', its decider's and what its aims hold (`MindMade.state`), and its report (`skillsReport`).
 */
export interface Driven {
  readonly skills: Skills;
  readonly state: { readonly skills: object; readonly decider: object | null; readonly pace: object; readonly aims?: readonly object[] };
  readonly report: MindReport;
}

/**
 * **How often a decider decides** (`driveBy`): every `every`th control step, on the steps `phase`
 * of the way through each run of them (`BodyHost.phase`).
 */
export interface Pace {
  readonly every: number;
  readonly phase: number;
}

/** A decider deciding every control step. */
export const EVERY_STEP: Pace = Object.freeze({ every: 1, phase: 0 });

/** **How many control steps apart a mind deciding at `rate` Hz decides** at `hz` (`Pace.every`): the nearest whole number, at least 1; every step where it names no rate. */
export const everyOf = (rate: number | undefined, hz: number): number => rate === undefined ? 1 : Math.max(1, Math.round(hz / rate));

/**
 * Hand `body` to `decider`: on its `pace`'s steps (every step unless given), and every step the
 * body is down or back from another mind, it decides on the body's view and the skills' report,
 * `dt` the time since it last decided; each control step the skills `make` makes (legs and guard
 * with no action, `standingSkills`, unless given) make the command from what it last decided: an
 * action asked again by its id goes on (`Intent.actions`), and an interrupt asked again of an
 * action ended is passed over. Returns the mind so driven (`Driven`). On the step the body is back from another mind
 * (`BodyView.resumed`) the skills are resumed before the decider decides, so the report it reads
 * is of the body as it is.
 */
export function driveBy(body: Body, decider: Decider, make: (body: Body) => Skills = standingSkills, pace: Pace = EVERY_STEP): Driven {
  const { every, phase } = pace;
  if (!Number.isInteger(every) || every < 1 || !(phase >= 0 && phase < 1)) throw new Error(`a decider decides every whole number of steps on a phase in [0, 1), not every ${every} on ${phase}`);
  const skills = make(body), offset = Math.floor(phase * every);
  const sight: Sight = { view: body.view, report: skills.report, get envelope() { return skills.envelope; }, envelopeOf: skills.envelopeOf, instance: skills.instance, readiness: skills.readiness, needs: skills.needs, clearance: skills.clearance };
  /** What it last decided, and the step it decided it on. */
  const state = { held: null as Intent | null, decided: 0 };
  body.drive((view, dt) => {
    if (view.resumed) skills.resume(view);
    if (every === 1) return skills.command(view, decider.decide(sight, dt), dt);
    const step = Math.round(view.time / dt);
    if (state.held === null || view.resumed || view.down || ((step - offset) % every + every) % every === 0) {
      state.held = decider.decide(sight, state.held === null ? dt : (step - state.decided) * dt);
      state.decided = step;
    }
    return skills.command(view, state.held, dt);
  }, skills.release);
  return { skills, state: { skills: skills.state, decider: decider.state ?? null, pace: state }, report: skillsReport(skills, decider) };
}

