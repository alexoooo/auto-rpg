/**
 * One sentence per policy: what it fights like, for somebody choosing one on the setup screen.
 *
 * Prose drawn from each mind's own doc comment (the file named beside each row), cut to the one
 * thing a person can see it do. The screen shows the line under the picker and the rating's long
 * note in a tooltip; the help overlay lists every line.
 *
 * **A table, not a field on `Policy`**, because nothing in the game reads it: a mind is chosen by
 * `name` and driven by `create`, and a sentence on the registry would be a field every producer of
 * a policy had to fill for a reader that is only ever a person. It is total over `POLICIES` anyway
 * -- `every_registered_policy_has_one_short_line` in `tests/policy-lines.test.mjs` -- so a
 * hand-written policy added without a sentence is a red test, not a blank row on the screen.
 */
const POLICY_LINES: Readonly<Record<string, string>> = Object.freeze({
  "humanoid-archer": "Keeps bow range, turns side-on to draw and shoot, and retreats when an opponent closes.",
  // src/mind.ts, idleMind
  "idle": "Stands still with its weapon held out and never attacks, a do-nothing baseline.",
  // src/golem/golem-policies.ts and src/golem/tactics.ts
  "golem-duelist": "Baseline fighter: circles and strikes when your guard drifts or after a short wait.",
  // src/golem/humanoid/policy.ts
  "humanoid-duelist": "The golem duelist's tactics on a human body, with less sidestepping.",
  // src/golem/skeleton/policy.ts
  "skeleton-duelist": "The golem duelist's tactics on a skeleton body, not yet tuned for it.",
  // src/golem/walker.ts
  "golem-walker": "Walks straight at you and swings on a steady beat, never guarding, a naive baseline.",
});

/** The policy's one sentence, or null for a name nobody knows. */
export const policyLine = (name: string): string | null =>
  Object.hasOwn(POLICY_LINES, name) ? POLICY_LINES[name] : null;
