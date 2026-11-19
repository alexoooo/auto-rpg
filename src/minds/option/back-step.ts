import type { BodySpec } from "../../core/bodies/spec/body.ts";
import { measuredOn, type Expected } from "../../skills/framework/profile.ts";
import type { OutcomeModel } from "../../skills/framework/outcomes.ts";
import { legsReadiness } from "../../skills/locomotion/shared/locomotion.ts";
import { gaitStance } from "../../skills/locomotion/move/gaits.ts";
import { BACK_STEP_GAIT, BACK_STEP_SECONDS, SWAYS_FROM } from "../../skills/locomotion/back-step/index.ts";
import type { Status } from "../choice.ts";
import { blocked, exitOutcomes, LEGS, READY, standing, type Option, type Situation } from "./option.ts";
import { startOf } from "./percepts.ts";
import { STILL, type Outcome, type Terms } from "./value.ts";
import type { FoePhase } from "../../skills/perception/threat.ts";

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
import type { Walker } from "./walk.ts";

/**
 * **The back step**: the legs ordered its gait (`BACK_STEP_GAIT`) for `held` s (`BACK_STEP_SECONDS`), facing the focus, as a
 * body of `spec` sways back over its rear foot out of a punch's way and in again. On offer where
 * what `outcomes` answers of it (measured as a body of `spec` at `hz` whose mind decides at `rate`
 * Hz and whose command is `delay` steps late, against the focus's body) reads the focus at the
 * range it stands at (`ProfileReading.reach`), the body
 * standing in the back step's carriage (`gaitStance` of `SWAYS_FROM`, as the Mind reads its stance), its legs ready;
 * none for a body with no such profile, or whose legs do not go by the gait (`goes`). Once begun it
 * is held through its sway out and back (`committed`, `swayed`): an order let go mid-sway leaves the
 * stance to catch a body over its rear foot; then, to `held`, it yields to what the Mind would
 * rather (a counter from where the sway left the two). Its trials are its own as a Mind took it
 * (`spar-chosen`), so they run as long as it did.
 *
 * Its model is its profile's, read where it stands (the range, its velocity against the focus's,
 * `startOf`, the focus's phase and how the two stand): no life dealt, the life its trials lost
 * while they swayed, for their seconds; it leaves the body up where its trials ended, centre to
 * centre (`exitOutcomes`), or by its own change apart and the focus's steps where the others' model
 * says them (`Predictions.steps`), still, in its carriage; and down in the share of its trials that fell.
 */
export function backStepping(spec: BodySpec, outcomes: OutcomeModel, walk: Walker, hz: number, rate: number, delay: number, goes: boolean): readonly Option[] {
  const act = outcomes.act("steps", measuredOn(spec, BACK_STEP_GAIT.name, null, hz, null, rate, delay)), read = act?.read ?? [];
  const carriage = gaitStance(SWAYS_FROM, spec.model);
  if (!goes || !read.length || !carriage) return [];
  const state = { since: null as number | null };
  /** What its profile against the focus expects from `at`; null where none reads it there. */
  const expected = (at: Situation): Expected | null => {
    const focus = at.focus, reading = focus && act?.reading(focus.spec, spec, { own: "standing", target: at.foePosture });
    if (!focus || !reading) return null;
    if (at.apart > reading.reach(at.phase)) return null;
    return reading.expect({ range: at.apart, phase: at.phase, velocity: startOf(at), stance: at.stances }, focus.spec);
  };
  /**
   * Where it leaves the two: its trials' exit as they ended; or, where the others' model says where
   * the focus steps (`Predictions.steps`) and its trials record their own change apart (`own`),
   * that change and the focus's steps meanwhile, away from the body, together.
   */
  const apartOf = (at: Situation, expect: Expected): Expected["exit"] => {
    const own = expect.exit?.own, steps = at.predictions.steps, focus = at.focus;
    if (own === undefined || !steps || !focus || !(at.apart > 0)) return expect.exit;
    const came = steps(expect.seconds, "back step"), ux = (at.where.x - focus.centre.x) / at.apart, uz = (at.where.z - focus.centre.z) / at.apart;
    return { ...expect.exit, stays: 0, moved: own - (came.x * ux + came.z * uz) };
  };
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
    priced: (now) => {
      const focus = now.focus;
      return focus && act?.reading(focus.spec, spec) ? "measured" : "no profile against its focus";
    },
    model(at): Terms | null {
      if (!standing(at) || at.stances.own !== carriage) return null;
      const expect = expected(at);
      if (!expect) return null;
      return { duration: expect.seconds, dealt: 0, taken: expect.taken, orders: 0, outcomes: phased(expect.exit?.striking, (phase) => exitOutcomes(at, apartOf(at, expect), expect.down, { velocity: STILL, stance: carriage, ...(phase ? { phase } : {}) })) };
    },
    step: (now) => ({ asked: { ...walk.kept(now, { move: null, face: walk.facing(now), actions: [] }, null), gait: BACK_STEP_GAIT.name }, holds: LEGS }),
  }];
}
