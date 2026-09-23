import variants from "./golem/researched-variants.json" with { type: "json" };
import labEntries from "./golem/researched-lab.json" with { type: "json" };

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
 *
 * **A researched policy has a line without a row**, because nobody writes one: `promote` in
 * `research/promotion.mjs` and `research/admit-lab.mjs` append to the two published JSON files
 * unattended, and a table that had to be edited after them would turn the suite red on every
 * admission. A variant's line comes from its parent, a lab entry's is generic, and a row here
 * overrides either with something better.
 */
const POLICY_LINES: Readonly<Record<string, string>> = Object.freeze({
  // src/mind.ts, idleMind
  "idle": "Stands still with its weapon held out and never attacks, a do-nothing baseline.",
  // src/golem/golem-policies.ts and src/golem/tactics.ts
  "golem-duelist": "Baseline fighter: circles and strikes when your guard drifts or after a short wait.",
  // src/golem/humanoid/policy.ts
  "humanoid-duelist": "The golem duelist's tactics on a human body, with less sidestepping and twisting.",
  // src/golem/skeleton/policy.ts
  "skeleton-duelist": "The golem duelist's tactics on a skeleton body, not yet tuned for it.",
  // src/golem/tactics-v2.ts
  "golem-fencer": "Reads your swings, steps off your attack and counters while you recover.",
  // src/golem/planner.ts
  "golem-planner": "A fencer that plans a few moves ahead, guarding when ahead and chasing when behind.",
  // src/golem/champion.ts
  "golem-champion": "The planner with settings tuned by tournament for the weapon it carries.",
  // src/golem/styles/form.ts
  "golem-form": "Circles just outside reach, parries or sidesteps, and cuts as you recover.",
  // src/golem/styles/skirmisher.ts
  "golem-skirmisher": "Hit and run: waits just outside your reach, darts in for one cut, then backs off.",
  // src/golem/styles/guardian.ts
  "golem-guardian": "Stands at your reach, blocks as you wind up, counters, and shoves if you close.",
  // src/golem/styles/brawler.ts
  "golem-brawler": "Walks straight in and fights up close with shoves, short strikes and head thrusts.",
  // src/golem/tactician.ts
  "golem-tactician": "Plans each move from every style's tricks: cuts, parries, shoves, ducks and retreats.",
  // src/golem/styles/driver.ts
  "golem-driver": "A test rebuild of Golem form: circles, parries or sidesteps, cuts as you recover.",
  // src/golem/styles/reaper.ts
  "golem-reaper": "Hangs at the very tip of its reach, cuts often from there, and parries when it can.",
  // src/golem/styles/miser.ts
  "golem-miser": "A search-tuned reaper that wastes nothing: stands close and recovers fast.",
  // src/golem/researched-variants.json, against the parent's table
  "golem-researched-form-3-5": "Tuned Golem form: stands farther out, attacks sooner and cuts deeper.",
  "golem-researched-guardian-3-4": "Tuned Golem guardian: the same blocking, but starts its own attacks sooner.",
  // src/golem/researched-lab.json, with src/golem/lab-bespoke.ts, lab-needle.ts and lab-policy.ts
  "golem-researched-paired-v1": "Duelist whose off hand stabs on its own rhythm, for two-weapon or fist builds.",
  "golem-researched-needle-v1": "Duelist that keeps jabbing its point at your head, for pointed main weapons.",
  "golem-researched-student-v1": "Duelist with learned corrections for twin blades, plain duelist on other builds.",
  "golem-researched-ppo-v1": "Duelist with learned corrections layered on top, trained across several builds.",
});

/** What a researched record carries that its line can be built from. */
interface Researched {
  readonly name: string;
  readonly parent?: string;
}

/**
 * The line for a researched policy the table has no row for. A variant names the parent the same
 * way `promote` names it in its label, `Golem ${parent.slice(6)}`, and says only what a search can
 * change: six numbers of distance and timing, never a move.
 */
const researchedLine = ({ parent }: Researched): string => parent === undefined
  ? "A lab-trained duelist, admitted on league evidence."
  : `A search-tuned Golem ${parent.slice(6)}: its moves, at retuned distances and timings.`;

/**
 * The policy's one sentence, or null for a name nobody knows. `researched` is the two published
 * lists, and a test hands it a longer one to stand for the next admission.
 */
export const policyLine = (
  name: string,
  researched: readonly Researched[] = [...variants, ...labEntries],
): string | null => {
  if (Object.hasOwn(POLICY_LINES, name)) return POLICY_LINES[name];
  const record = researched.find((entry) => entry.name === name);
  return record ? researchedLine(record) : null;
};
