/**
 * The load hook that lets a fork take a given Option (`rollout`'s `option`, `rollouts.mjs`). It
 * rewrites the selection (`selectSet`, `src/minds/option/choosers/select-set.ts`) so that each
 * decision made afresh, once its choices are priced, is handed to `globalThis.__optionDecision`:
 *
 * - `side` and `time`: whose decision it is, and when, s;
 * - `offered`: each choice on offer whose claims are free, as [its place in the Mind's Options,
 *   its target (0 where it has none), its name], the best first;
 * - `pick`: the one the selection takes first, the same three, or null where it takes none;
 * - `running`: each choice that ran on to this decision, not ended by it, as [its place, its target,
 *   its status there (`Status`), whether it is open];
 * - `force(index, target)`: take that Option at that target first instead. It is taken only where
 *   the selection priced it at this decision, its claims are free, the target is one the
 *   selection would price it at (`Deciding.keep`) and it is on offer and priced there; it says
 *   whether it was. Refused, it leaves the decision and the Option's aim as the game's.
 *
 * And once that decision has made its set, the set is handed to `globalThis.__optionSet`: `side`,
 * `time` and `running`, each choice that runs from then on, the same three and whether it ran on
 * from before this decision (false where it was begun at it, though it ran before and was over),
 * the first chosen first. A choice that is not in it, or that did not run on, or runs at another
 * target, has ended or been let go.
 *
 * An Option is named by its place in the Mind's Options and its target, as the warm start keys it
 * (`warmStart`, `tree-search.ts`). A chance draw the selection makes is still made, so a forced
 * Option that is the selection's own pick leaves the same stream. With no `__optionDecision` set,
 * no argument is even read, and every decision is the game's; with no `__optionSet`, likewise.
 */
const SELECTION = "/src/minds/option/choosers/select-set.ts";

/** Where the selection takes its first priced choice: drawn by chance where it draws, else the best free. */
const FIRST = `      const best = stream ? order.find(free) : undefined;
      if (stream && best !== undefined) {
        for (const k of order) if (!free(k)) values[k] = -Infinity;
        take(drawn(values, values[best]! - chance.margin, best, stream.next));
      }
`;

/** The same, handed to `__optionDecision` before it is taken. */
const BRANCHED = `      const best = stream ? order.find(free) : undefined;
      let drawnFirst, forced;
      if (stream && best !== undefined) {
        for (const k of order) if (!free(k)) values[k] = -Infinity;
        drawnFirst = drawn(values, values[best]! - chance.margin, best, stream.next);
      }
      const keyOf = (i) => [i, Math.max(0, aimed[i]), choices[i].name], pick = drawnFirst ?? order.find(free);
      globalThis.__optionDecision?.({ side: now.sight.view.senses.side, time: now.time, offered: order.filter(free).map(keyOf),
        pick: pick === undefined ? null : keyOf(pick), running: state.running.map((i) => [i, Math.max(0, state.aims[i]), choices[i].status(now), choices[i].open === true]), force: (i, k) => {
          const choice = choices[i], targets = choice?.targets?.length ?? 0;
          if (!choice || !order.includes(i) || !free(i) || !(Number.isInteger(k) && k >= 0 && k < Math.max(1, targets))) return false;
          // Within the keep of a running choice's target, priced there alone where it has it on offer (\`Deciding.keep\`).
          const kept = targets ? keptTarget(choice, now.time) : -1;
          if (kept >= 0 && aimed[i] === kept && k !== kept) return false;
          if (targets) choice.aim(k);
          if (onOffer(choice, at) && appraise(choice, i, at, k)) { aimed[i] = targets ? k : -1; forced = i; return true; }
          if (targets) choice.aim(aimed[i]);
          return false;
        } });
      if ((forced ?? drawnFirst) !== undefined) take(forced ?? drawnFirst);
`;

/** Where the selection has made its set at a decision afresh. */
const SET = `      state.running = [...chosen];
`;

/** The same, handed to `__optionSet` once made, before it replaces the set that ran. */
const SET_TOLD = `      globalThis.__optionSet?.({ side: now.sight.view.senses.side, time: now.time,
        running: chosen.map((i) => [i, Math.max(0, state.aims[i]), choices[i].name, state.running.includes(i)]) });
      state.running = [...chosen];
`;

/** What the rewritten module sets, so `rollout` knows the hook is in place; and a module already rewritten is left alone. */
const MARK = "\nglobalThis.__optionForkHook = true;\n";

const textOf = (source) => typeof source === "string" ? source : new TextDecoder().decode(source);

export async function load(url, context, next) {
  const out = await next(url, context);
  if (!url.endsWith(SELECTION)) return out;
  const text = textOf(out.source);
  if (text.includes(MARK)) return out;
  if (text.split(FIRST).length !== 2) throw new Error("the selection no longer takes its first choice where the option fork's hook looks");
  if (text.split(SET).length !== 2) throw new Error("the selection no longer makes its set where the option fork's hook looks");
  return { ...out, source: text.replace(FIRST, BRANCHED).replace(SET, SET_TOLD) + MARK };
}
