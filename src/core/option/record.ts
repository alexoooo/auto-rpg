/**
 * **What an Option is taken to bring where no drill measured it**, set by hand: the seconds it runs,
 * and the share of its tries that do what it does.
 */
export interface Prior {
  readonly seconds: number;
  readonly done: number;
}

/** How many tries a prior, or a measured profile, counts as against an Option's record of them (`recorded`). */
const WEIGHT = 2;

/** One Option's tries from one situation in the bout: how many were begun, and how many did what it does. */
export interface Tried {
  readonly name: string;
  readonly from: string;
  tries: number;
  done: number;
}

/** **The share of tries done that `done` is taken at once `tried` moves it**: its tries counted against `WEIGHT` of its own. */
export const recorded = (done: number, tried: Tried | undefined): number =>
  !tried || tried.tries === 0 ? done : (done * WEIGHT + tried.done) / (WEIGHT + tried.tries);

/** **Every Option's record of its tries** in the bout (`Tried`), by its name and the situation it was begun from. */
export interface OptionRecord {
  /** Its memory: the tries, and how many have been noted, which a reader of it compares to see a try end. */
  readonly state: { readonly tried: Tried[]; version: number };
  /** The tries of `name` from `from`, none where it was never tried there. */
  of(name: string, from: string): Tried | undefined;
  /** Note a try of `name` from `from` ended, and whether it did what it does. */
  note(name: string, from: string, done: boolean): void;
}

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
