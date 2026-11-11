import type { Body, BodyView } from "../control/body.ts";
import type { StanceEnvelope } from "../control/stance/stance-envelope.ts";
import type { SkillReport, Skills } from "../skills/framework/skills.ts";
import type { Intent } from "../skills/framework/intent.ts";
import { sameOrders, type Orders } from "./orders.ts";
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
 * **A script**: a decider a screen runs over a body's sight (the Lab's modes), whose intent is
 * given as orders that the body's own mind carries out. It publishes no decision (`Decider.decision`):
 * what the skills read of a decision is the mind's own decider's to publish.
 */
export type Script = Decider<Sight, Intent, never>;

/**
 * **What a decider sees**: the body's view, with what it senses of the others
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
  /** How its navigation keeps the body clear (`SkillsNavigation`): the navigator's, so replacing the navigator replaces it for the decider. */
  readonly navigation: Skills["navigation"];
  /** Whether an action can begin and what it would hold (`SkillsActions`). */
  readonly actions: Skills["actions"];
}

/** **What `body`'s decider sees** with `skills` (`Sight`). */
export const sightOf = (body: Pick<Body, "view" | "envelope">, skills: Pick<Skills, "report" | "legs" | "navigation" | "actions">): Sight =>
  ({ view: body.view, walkEnvelope: body.envelope, report: skills.report, legs: skills.legs, navigation: skills.navigation, actions: skills.actions });

/**
 * **A mind driven by its decider over its skills** (`driveBy`): the mind's memory, its
 * skills', its decider's and what its aims hold (`MindMade.state`), and its report (`skillsReport`).
 */
export interface Driven {
  readonly state: { readonly skills: object; readonly decider: object | null; readonly pace: object; readonly aims?: readonly object[] };
  readonly report: MindReport;
}

/**
 * **How often a decider decides** (`driveBy`): every `every`th control step, on the steps `phase`
 * of the way through each run of them (`BodyHost.phase`); and at once on a step its `orders` (a
 * person's, `Orders`) are not those it last decided on (`sameOrders`), or an action of its
 * skills has ended since (`SkillReport.ledger`).
 */
interface Pace {
  readonly every: number;
  readonly phase: number;
  readonly orders?: (sight: Sight) => Orders | null;
}

/** A decider deciding every control step. */
const EVERY_STEP: Pace = Object.freeze({ every: 1, phase: 0 });

/** **How many control steps apart a mind deciding at `rate` Hz decides** at `hz` (`Pace.every`): the nearest whole number, at least 1; every step where it names no rate. */
export const everyOf = (rate: number | undefined, hz: number): number => rate === undefined ? 1 : Math.max(1, Math.round(hz / rate));

/**
 * Hand `body` to `decider`: on its `pace`'s steps (every step unless given), and on the step the
 * body is back from another mind, its orders change or an action ends, it decides on the body's view and the skills' report,
 * `dt` the time since it last decided; each control step `skills` turn its
 * last decision into a command, on
 * the body as it is when the body carries the decision out (`SplitDriver`): an
 * action asked again by its id goes on (`Intent.actions`), and an interrupt asked again of an
 * action ended is passed over; what its `aims` hold (`Aim.state`) is the mind's too. It becomes the body's driver (`Body.drive`), and returns the mind so driven (`Driven`). On the step the body is back from another mind
 * (`BodyView.resumed`) the skills are resumed before the decider decides, so the report it reads
 * is of the body as it is.
 */
export function driveBy(body: Body, decider: Decider, skills: Skills, pace: Pace = EVERY_STEP, aims?: readonly object[]): Driven {
  const { every, phase, orders } = pace;
  if (!Number.isInteger(every) || every < 1 || !(phase >= 0 && phase < 1)) throw new Error(`a decider decides every whole number of steps on a phase in [0, 1), not every ${every} on ${phase}`);
  const offset = Math.floor(phase * every);
  const sight = sightOf(body, skills);
  /** What it last decided, the step it decided it on, the orders it decided on and the last action ended then (`Ended.sequence`). */
  const state = { held: null as Intent | null, decided: 0, orders: null as Orders | null, ended: 0 };
  const decide = (view: BodyView, dt: number): Intent => {
    if (view.resumed) skills.resume(view);
    if (every === 1) return decider.decide(sight, dt);
    const step = Math.round(view.time / dt), ordered = orders?.(sight) ?? null, ledger = skills.report.ledger, ended = ledger.length ? ledger[ledger.length - 1]!.sequence : 0;
    if (state.held === null || view.resumed || ((step - offset) % every + every) % every === 0 || ended !== state.ended || !sameOrders(ordered, state.orders)) {
      state.held = decider.decide(sight, state.held === null ? dt : (step - state.decided) * dt);
      state.decided = step;
      state.orders = ordered === null ? null : structuredClone(ordered);
      state.ended = ended;
    }
    return state.held;
  };
  const carry = (view: BodyView, intent: Intent, dt: number) => skills.command(view, intent, dt);
  const whole = { skills: skills.state, decider: decider.state ?? null, pace: state, ...(aims ? { aims } : {}) };
  body.drive({ state: whole, decide, carry }, skills.release);
  return { state: whole, report: skillsReport(skills, decider, whole) };
}
