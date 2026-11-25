import type { OptionRecord, Tried } from "../contract/context.ts";

/** How many tries a prior, or a measured profile, counts as against an Option's record of them (`recorded`). */
const WEIGHT = 2;

/** **The share of tries done that `done` is taken at once `tried` moves it**: its tries counted against `WEIGHT` of its own. */
export const recorded = (done: number, tried: Tried | undefined): number =>
  !tried || tried.tries === 0 ? done : (done * WEIGHT + tried.done) / (WEIGHT + tried.tries);

/** **An Option record** (`OptionRecord`), empty. */
export function optionRecord(): OptionRecord {
  const state = { tried: [] as Tried[], version: 0 };
  const of = (name: string, from: string): Tried | undefined => state.tried.find((one) => one.name === name && one.from === from);
  return {
    state, of,
    note(name, from, done) {
      let tried = of(name, from);
      if (!tried) state.tried.push(tried = { name, from, tries: 0, done: 0 });
      tried.tries += 1;
      if (done) tried.done += 1;
      state.version += 1;
    },
  };
}
