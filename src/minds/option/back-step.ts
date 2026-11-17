import type { BodySpec } from "../../core/bodies/spec/body.ts";
import { measuredOn, profileAgainst, profilesFor, readProfile, type Expected, type Profile } from "../../skills/framework/profile.ts";
import { legsReadiness } from "../../skills/locomotion/shared/locomotion.ts";
import { swayStance } from "../../skills/locomotion/move/gaits.ts";
import type { Status } from "../choice.ts";
import { along, blocked, LEGS, READY, standing, type Option, type Situation } from "./option.ts";
import { startOf } from "./percepts.ts";
import { STILL, upOrDown, type Terms } from "./value.ts";
import type { Walker } from "./walk.ts";

/** How long the back step is ordered, s: its sway out and back and its step in, as its profile's trials were (the back step's evaluation's `spar`). */
const HELD = 1.65;

/** The gait it orders (`BACK_STEP_GAIT`). */
const GAIT = "back-step";

/**
 * **The back step**: the legs ordered the gait `back-step` for `HELD` s, facing the focus, as a
 * body of `spec` sways back over its rear foot out of a punch's way and in again. On offer where
 * its profile (among `profiles`, measured as a body of `spec` at `hz` whose mind decides at `rate`
 * Hz and whose command is `delay` steps late; `profilesFor`, the one against the focus's body,
 * `profileAgainst`) reads the focus at the range it stands at (`ProfileReading.reach`), the body
 * standing in the back step's carriage (`swayStance`, as the Mind reads its stance), its legs ready;
 * none for a body with no such profile, or whose legs do not go by the gait (`goes`). Once begun it runs its time through (`committed`): an
 * order let go mid-sway leaves the stance to catch a body over its rear foot.
 *
 * Its model is its profile's, read where it stands (the range, its velocity against the focus's,
 * `startOf`, the focus's phase and how the two stand): no life dealt, the life its trials lost
 * while they swayed, for their seconds; it leaves the body up at the range its trials ended at
 * (`Expected.exit`), else where it stood, on the line from the focus through it (`along`), still,
 * in its carriage; and down in the share of its trials that fell.
 */
export function backStepping(spec: BodySpec, profiles: readonly Profile[], walk: Walker, hz: number, rate: number, delay: number, goes: boolean): readonly Option[] {
  const read = profilesFor(profiles, measuredOn(spec, GAIT, null, hz, null, rate, delay))?.read ?? [];
  const carriage = swayStance(spec.model);
  if (!goes || !read.length || !carriage) return [];
  const state = { since: null as number | null };
  /** What its profile against the focus expects from `at`; null where none reads it there. */
  const expected = (at: Situation): Expected | null => {
    const focus = at.focus, profile = focus && profileAgainst(read, focus.spec);
    if (!focus || !profile) return null;
    const reading = readProfile(profile, spec, { own: "standing", target: at.foePosture });
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
    status: (now): Status => state.since === null || now.time < state.since + HELD ? "committed" : "over",
    begin(now) { state.since = now.time; },
    end() { state.since = null; },
    priced: (now) => {
      const focus = now.focus, profile = focus && profileAgainst(read, focus.spec);
      return profile ? "measured" : "no profile against its focus";
    },
    model(at): Terms | null {
      if (!standing(at) || at.stances.own !== carriage) return null;
      const expect = expected(at);
      if (!expect) return null;
      return { duration: expect.seconds, dealt: 0, taken: expect.taken, orders: 0, outcomes: upOrDown({ where: along(at, expect.exit?.range ?? at.range), velocity: STILL, stance: carriage }, expect.down) };
    },
    step: (now) => ({ asked: { ...walk.kept(now, { move: null, face: walk.facing(now), actions: [] }, null), gait: GAIT }, holds: LEGS }),
  }];
}
