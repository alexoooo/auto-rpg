import { asMeasured, chooseEffector } from "../../src/options.ts";

/**
 * What a research label is, as one list, and a probe that produces a legal one.
 *
 * The same construct as `COMBAT_FIELDS` in `tests/fixtures/intent.mjs`, for the
 * same reason and against the same defect: stage C2b widened `DaggerLabel` from
 * three fields to six, and **four test files held their own three-field
 * literal** as a throwaway labeler for a bout they only needed to *run*. Every
 * one of them became a label that cannot execute -- `handActionOption` throws
 * `unknown effector "undefined"` -- and every one would have had to be found by
 * hand the next time the label moves.
 *
 * `RESEARCH_LABEL_FIELDS` is a hand-maintained mirror of `DaggerLabel` in
 * `src/learning/dagger.ts`, which is exactly the shape this directory has a rule
 * about, so it is not trusted either:
 * `every_producer_of_a_research_label_writes_the_same_six_fields` in
 * `tests/learning.test.mjs` drives the teacher, a trained DAgger model, the NEAT
 * decoder and the PPO decoder through it, so a field added to the type and
 * forgotten here fails there, and one added here and nowhere else fails there
 * too.
 */
export const RESEARCH_LABEL_FIELDS = Object.freeze(
  ["movement", "action", "effector", "target", "stance", "persistence"].sort(),
);

/**
 * A label a probe can return: the caller's movement and action, executed the way
 * the scripted callers execute one.
 *
 * `asMeasured(chooseEffector(view, action))` is not a shortcut -- it is the exact
 * tuple `researchLabelMind` used to default to before a labeler carried one, so
 * a probe written with it drives the body it always drove and no probe's bout
 * moved when the label widened. A probe that wanted to assert something *about*
 * the tuple would name the tuple; these do not, and saying so once is better
 * than four copies each implying it.
 *
 * The effector is asked for rather than written out because a probe that
 * hard-coded `"primary"` would break on a centipede, which is one of the
 * fifteen cells `tests/lookahead.test.mjs` sweeps.
 */
export const probeLabel = (view, movement, action, persistence = 0.4) => {
  const effector = chooseEffector(view, action);
  if (effector === null) throw new Error(`probe label cannot perform "${action}" on unit "${view.self.unit}"`);
  return { movement, action, ...asMeasured(effector), persistence };
};
