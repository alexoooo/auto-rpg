import type { BodySpec } from "../../core/bodies/spec/body.ts";
import { measuredOn, type Expected } from "../../skills/framework/profile.ts";
import type { OutcomeModel } from "../../skills/framework/outcomes.ts";
import { legsReadiness } from "../../skills/locomotion/shared/locomotion.ts";
import { swayStance } from "../../skills/locomotion/move/gaits.ts";
import type { Status } from "../choice.ts";
import { blocked, exitOutcomes, LEGS, READY, standing, type Option, type Situation } from "./option.ts";
import { startOf } from "./percepts.ts";
import { STILL, type Terms } from "./value.ts";
import type { Walker } from "./walk.ts";

/** How long the back step is ordered at most, s: its sway out and back and its step in (`BACK_STEP_GAIT`). */
const HELD = 1.65;

/** How long it is held before another Option may take the body, s: its sway out and back (the gait's `out` and `back`), so a counter may follow from where it left the two. */
const SWAYED = 1.2;

/** The gait it orders (`BACK_STEP_GAIT`). */
const GAIT = "back-step";

/**
 * **The back step**: the legs ordered the gait `back-step` for `HELD` s, facing the focus, as a
 * body of `spec` sways back over its rear foot out of a punch's way and in again. On offer where
 * what `outcomes` answers of it (measured as a body of `spec` at `hz` whose mind decides at `rate`
 * Hz and whose command is `delay` steps late, against the focus's body) reads the focus at the
 * range it stands at (`ProfileReading.reach`), the body
 * standing in the back step's carriage (`swayStance`, as the Mind reads its stance), its legs ready;
 * none for a body with no such profile, or whose legs do not go by the gait (`goes`). Once begun it
 * is held through its sway out and back (`committed`, `SWAYED`): an order let go mid-sway leaves the
 * stance to catch a body over its rear foot; then, to `HELD`, it yields to what the Mind would
 * rather (a counter from where the sway left the two). Its trials are its own as a Mind took it
 * (`spar-chosen`), so they run as long as it did.
 *
 * Its model is its profile's, read where it stands (the range, its velocity against the focus's,
 * `startOf`, the focus's phase and how the two stand): no life dealt, the life its trials lost
 * while they swayed, for their seconds; it leaves the body up where its trials ended, centre to
 * centre (`exitOutcomes`), still, in its carriage; and down in the share of its trials that fell.
 */
export function backStepping(spec: BodySpec, outcomes: OutcomeModel, walk: Walker, hz: number, rate: number, delay: number, goes: boolean): readonly Option[] {
  const act = outcomes.act("steps", measuredOn(spec, GAIT, null, hz, null, rate, delay)), read = act?.read ?? [];
  const carriage = swayStance(spec.model);
  if (!goes || !read.length || !carriage) return [];
  const state = { since: null as number | null };
  /** What its profile against the focus expects from `at`; null where none reads it there. */
  const expected = (at: Situation): Expected | null => {
    const focus = at.focus, reading = focus && act?.reading(focus.spec, spec, { own: "standing", target: at.foePosture });
    if (!focus || !reading) return null;
    if (at.apart > reading.reach(at.phase)) return null;
    return reading.expect({ range: at.apart, phase: at.phase, velocity: startOf(at), stance: at.stances }, focus.spec);
  };
  const NO_FOE = blocked("no foe within the back step's measured range"), CARRIAGE = blocked("not standing in the back step's carriage");
  return [{
    name: "back step", state, claims: LEGS,
    entry: (now) => {
      const legs = legsReadiness(now.sight.view);
      if (legs.kind !== "ready") return legs;
      // Begun, it goes on wherever the sway takes the two.
      if (state.since !== null) return READY;
      if (!standing(now) || now.stances.own !== carriage) return CARRIAGE;
      return expected(now) ? READY : NO_FOE;
    },
    status: (now): Status => state.since === null || now.time < state.since + SWAYED ? "committed" : now.time < state.since + HELD ? "yields" : "over",
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
      return { duration: expect.seconds, dealt: 0, taken: expect.taken, orders: 0, outcomes: exitOutcomes(at, expect.exit, expect.down, { velocity: STILL, stance: carriage }) };
    },
    step: (now) => ({ asked: { ...walk.kept(now, { move: null, face: walk.facing(now), actions: [] }, null), gait: GAIT }, holds: LEGS }),
  }];
}
