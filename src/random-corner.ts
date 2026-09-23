import { withGolemBuild, withPolicy, type GolemSetup, type Matchup } from "./bout.ts";
import { randomGolemSetup } from "./golem/build.ts";
import { FAMILY_POLICY, bodyFamily } from "./golem/family.ts";
import { randomViableGolemSetup, randomViableOpponent } from "./golem/viability.ts";
import { POLICIES } from "./mind.ts";
import type { Side } from "./physics.ts";
import { assessPolicy } from "./policy-applicability.ts";
import { mulberry32 } from "./rng.ts";

/**
 * A fresh body for one golem corner, drawn from `seed`, and the seed kept on the corner.
 *
 * The one draw behind the setup screen's Randomize and the arena's Random replay, so the two cannot
 * come to disagree about what a random body is. The corner keeps its family and its attributes;
 * the other corner is read and never written.
 *
 * **It draws an opponent, not a body**, whenever the other corner is a golem, for the reason
 * `SetupScreen.randomize` gives: `viableBuild` accepts every class on the shelf, so only
 * `randomViableOpponent`'s pair test keeps a drawn pair from being two things that cannot finish
 * each other. Human and skeleton bodies are drawn plainly, because the viability draws were
 * measured on stone bodies only (`src/golem/viability.ts`). A corner that is not a golem is handed
 * back unchanged: making one a golem is the setup screen's business, through `withUnit`.
 */
export function randomCorner(matchup: Matchup, side: Side, seed: number): Matchup {
  const mine = matchup[side].golem;
  if (!mine) return matchup;
  const other = matchup[side === "left" ? "right" : "left"].golem;
  const family = bodyFamily(mine);
  // Exhaustive, so a new family is a compile error here rather than a stone draw.
  const draw = (rng: () => number): GolemSetup => {
    switch (family) {
      case "golem": return other ? randomViableOpponent(rng, other) : randomViableGolemSetup(rng);
      case "human": return randomGolemSetup(rng, family);
      case "skeleton": return randomGolemSetup(rng, family);
      default: { const unhandled: never = family; throw new Error(`no random draw for ${String(unhandled)}`); }
    }
  };
  // **A seed whose draw runs out of tries is followed by the next one**, and the corner keeps the
  // seed that drew it, so the number shown still draws this body again. `randomViableOpponent`
  // throws past its bound rather than hand back a pair it refused, and against a plate-armed
  // primary, whose one viable partner is a maul, that bound is reached on about one seed in a
  // thousand (6 of 8,000 drawn opponents, measured in Node) -- a Random replay click that did
  // nothing but leave an exception in the console. Bounded, and the last refusal is rethrown.
  for (let next = seed; ; next += 1) {
    try {
      return withGolemBuild(matchup, side, draw(mulberry32(next)), next);
    } catch (error) {
      if (next - seed >= SEEDS_TRIED - 1) throw error;
    }
  }
}

/** How many consecutive seeds `randomCorner` tries before it gives the draw's own refusal back. */
const SEEDS_TRIED = 8;

/**
 * The corner's policy if it can drive the corner's body, and otherwise the family's own duelist
 * (`FAMILY_POLICY`), which is what picking the family's button on the setup screen hands it.
 *
 * A drawn body is a body nobody chose a mind for, and the setup screen refuses Fight on a policy
 * `assessPolicy` does not call applicable. Random replay has no screen to refuse from, so it asks
 * here instead. Not "the first applicable policy": `POLICIES` opens with the researched variants
 * and carries `idle`, and a random opponent that stands still is not an opponent. A golem corner is
 * admitted to every golem mind.
 */
export function fittedPolicy(matchup: Matchup, side: Side): Matchup {
  const build = matchup[side].golem;
  if (!build) return matchup;
  const policy = POLICIES.find((candidate) => candidate.name === matchup[side].policy);
  if (assessPolicy(policy, true, build).status === "applicable") return matchup;
  return withPolicy(matchup, side, FAMILY_POLICY[bodyFamily(build)]);
}
