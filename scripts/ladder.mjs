/**
 * The ladder, in one place, because two instruments that disagree about it cannot be read together.
 *
 * The owner's ask was *"a dummy, and then some kind of intermediate AI, and then the good hand-coded
 * policy"*, and this phase now has three scripts that each have to turn one of those names into a
 * body: the duel that rates a mind, the collector that records one, and the search that scores one.
 * Two of them have already got it wrong -- `clone-policy.mjs` fell through to the fencer for any
 * name it did not know and mislabelled a whole round -- and the failure is invisible precisely
 * because a wrong opponent still produces a full table of numbers.
 *
 * So the names live here, the order is the ladder's order, and a script that takes one **refuses**
 * anything not on this list rather than choosing for the caller.
 */
export const LADDER = Object.freeze(["golem-idle", "golem-brawler", "golem-driver", "golem-fencer"]);

/** The rung's name as given, refusing anything the ladder does not have. `idle` is an old alias. */
export function rungOf(name) {
  const full = name === "idle" ? "golem-idle" : name;
  if (!LADDER.includes(full)) {
    throw new Error(`there is no rung called "${name}"; the ladder is ${LADDER.join(", ")}`);
  }
  return full;
}
