import { measuredOn } from "../../../skills/framework/profile/lookup.ts";
import { type Expected, type ProfileReading } from "../../../skills/framework/profile/reading.ts";
import { notPriced, staler, type Source } from "../../../skills/framework/profile/source.ts";
import { remembered } from "../../../core/remembered.ts";
import { legsReadiness } from "../../../skills/locomotion/shared/locomotion.ts";
import { gaitStance } from "../../../skills/locomotion/move/gaits.ts";
import { BACK_STEP_GAIT, BACK_STEP_SECONDS, SWAYS_FROM } from "../../../skills/locomotion/back-step/index.ts";
import type { Status, Option } from "../contract/option.ts";
import { blocked, READY, standing } from "./readiness.ts";
import { exitOutcomes, NO_BLOW, STILL } from "./outcomes.ts";
import type { Situation } from "../contract/situation.ts";
import { LEGS } from "../../../skills/framework/action.ts";
import { startOf } from "../situation/start.ts";
import type { Outcome, Terms, TermSources } from "../contract/terms.ts";
import type { FoePhase } from "../../../skills/perception/threat.ts";
import type { OptionContext } from "../contract/context.ts";

/**
 * **The ways a sway ends, split by what the focus is doing as it ends**: `striking` of them with
 * the focus striking, the rest with it clear, each as `outcomes` gives them; as `outcomes` gives
 * them alone, the focus as at the decision, where its trials record none.
 */
function phased(striking: number | undefined, outcomes: (phase: FoePhase | null) => readonly Outcome[]): readonly Outcome[] {
  if (striking === undefined) return outcomes(null);
  const share = Math.min(1, Math.max(0, striking));
  return [...(share > 0 ? outcomes("striking").map((one) => ({ ...one, chance: one.chance * share })) : []),
    ...(share < 1 ? outcomes("clear").map((one) => ({ ...one, chance: one.chance * (1 - share) })) : [])];
}

/**
 * **The back step**: the legs ordered its gait (`BACK_STEP_GAIT`) for `held` s (`BACK_STEP_SECONDS`), facing the focus, as a
 * body of `spec` sways back over its rear foot out of a punch's way and in again. On offer where
 * what `outcomes` answers of it (measured as a body of `spec` at `hz` whose mind decides at `rate`
 * Hz, its world's unless given, and whose command is `delay` steps late, against the focus's body)
 * reads the focus at the range it stands at (`ProfileReading.reach`), the body
 * standing in the back step's carriage (`gaitStance` of `SWAYS_FROM`, as the Mind reads its stance), its legs ready;
 * none for a body with no such profile (its Option, too, none for legs that do not go by the gait: `goesBy`). Once begun it
 * is held through its sway out and back (`committed`, `swayed`): an order let go mid-sway leaves the
 * stance to catch a body over its rear foot; then, to `held`, it yields to what the Mind would
 * rather (a counter from where the sway left the two). Its trials are its own as a Mind took it
 * (`spar-chosen`), so they run as long as it did.
 *
 * Its model is its profile's, read where it stands (the range, its velocity against the focus's,
 * `startOf`, the focus's phase and how the two stand): no life dealt, the life its trials lost
 * while they swayed, for their seconds; it leaves the body up where its trials ended, centre to
 * centre (`exitOutcomes`), still, in its carriage; and down in the share of its trials that fell.
 */
export function backStepping({ spec, outcomes, walk, hz, rate, delay }: Pick<OptionContext, "spec" | "outcomes" | "walk" | "hz" | "rate" | "delay">): readonly Option[] {
  const act = outcomes.act("steps", measuredOn(spec, { skill: BACK_STEP_GAIT.name, limb: null }, { hz, reaction: null, rate, delay })), read = act?.read ?? [];
  const carriage = gaitStance(SWAYS_FROM, spec.model);
  if (!read.length || !carriage) return [];
  const state = { since: null as number | null };
  /** Its profile's reading against the focus as the two stand at `at`; null with no focus, or where none reads so. */
  const readingAt = (at: Situation): ProfileReading | null => at.focus ? act?.reading(at.focus.spec, spec, { own: "standing", target: at.foePosture }) ?? null : null;
  /** What `reading` (`readingAt` of `at`) expects from there; null where the focus is past its reach. */
  const expectedBy = (reading: ProfileReading, at: Situation): Expected | null =>
    at.apart > reading.reach(at.phase) ? null : reading.expect({ range: at.apart, phase: at.phase, velocity: startOf(at), stance: at.stances }, at.focus?.spec ?? null);
  /** What its profile against the focus expects from `at`; null where none reads it there. */
  const expected = (at: Situation): Expected | null => { const reading = readingAt(at); return reading && expectedBy(reading, at); };
  const NO_PROFILE = notPriced("no profile against its focus"), stale = act?.stale ?? [];
  /** A reading's source with what has changed since its profiles were measured (`ActOutcomes.stale`); made once a source. */
  const staled = remembered((source: Source): Source => staler(source, stale));
  /**
   * Where each answer of its price comes from (`Terms.from`), by its reading's source. Its
   * seconds, the life it loses and where it leaves the body are all its trials'. It throws no
   * blow. Made once a source.
   */
  const fromOf = remembered((source: Source): TermSources => Object.freeze({ duration: source, dealt: NO_BLOW, taken: source, leaves: source }));
  const NO_FOE = blocked("no foe within the back step's measured range"), CARRIAGE = blocked("not standing in the back step's carriage");
  return [{
    name: "back step", kind: "back step", state, claims: LEGS,
    entry: (now) => {
      const legs = legsReadiness(now.sight.view);
      if (legs.kind !== "ready") return legs;
      // Begun, it goes on wherever the sway takes the two.
      if (state.since !== null) return READY;
      if (!standing(now) || now.stances.own !== carriage) return CARRIAGE;
      return expected(now) ? READY : NO_FOE;
    },
    status: (now): Status => state.since === null || now.time < state.since + BACK_STEP_SECONDS.swayed ? "committed" : now.time < state.since + BACK_STEP_SECONDS.held ? "yields" : "over",
    begin(now) { state.since = now.time; },
    end() { state.since = null; },
    reads: (now) => {
      const focus = now.focus, reading = focus && act?.reading(focus.spec, spec);
      return [{ what: "back step", source: focus && reading ? staled(reading.source(focus.spec)) : NO_PROFILE }];
    },
    model(at): Terms | null {
      if (!standing(at) || at.stances.own !== carriage) return null;
      const focus = at.focus, reading = readingAt(at), expect = reading && expectedBy(reading, at);
      if (!focus || !reading || !expect) return null;
      return { duration: expect.seconds, dealt: 0, taken: expect.taken, orders: 0, outcomes: phased(expect.exit?.striking, (phase) => exitOutcomes(at, expect.exit, expect.down, { velocity: STILL, stance: carriage, ...(phase ? { phase } : {}) })), from: fromOf(staled(reading.source(focus.spec))) };
    },
    step: (now) => ({ asked: { ...walk.kept(now, { move: null, face: walk.facing(now), actions: [] }, null), gait: BACK_STEP_GAIT.name }, holds: LEGS }),
  }];
}
