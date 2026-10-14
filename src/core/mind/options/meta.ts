import type { Option, Situation } from "./option.ts";

/**
 * When a meta-controller decides afresh: every `rethink` s, and at once on an event; the running
 * option is worth `keep` more than its value while it goes on, so that two near alike do not trade
 * places each decision.
 */
export const DECIDING = Object.freeze({ rethink: .2, keep: .5 });

/** What changes the situation enough to decide at once: the body going down or getting up, a threat or a blow coming, another focus, other orders. */
const eventOf = (now: Situation): string =>
  JSON.stringify([now.down, now.threat !== null, now.incoming !== null, now.focus?.id ?? null, now.orders]);

/**
 * **A meta-controller**: of `options`, the one the body carries out, by `values` (the option's
 * worth, in the order of `options`). Once a control step (`decide`), on an event, when the running
 * option is over or unavailable, or `rethink` s on, it takes the available option of the highest
 * worth, the running one's raised by `keep`; a running option that does not yield is kept while it
 * goes on. Its memory is which option runs (its place in `options`, or -1), when it decided, and
 * the event it decided on.
 */
export function metaController(options: readonly Option[], values: readonly number[], deciding = DECIDING) {
  if (values.length !== options.length || values.some((value) => !Number.isFinite(value))) throw new Error("a meta-controller needs a finite value for every option");
  const state = { running: -1, decided: -Infinity, next: -Infinity, event: "" };
  return {
    state,
    /** The running option, after deciding at `now` if it has not yet: null with none. */
    decide(now: Situation): Option | null {
      if (state.decided === now.time) return state.running < 0 ? null : options[state.running]!;
      state.decided = now.time;
      const event = eventOf(now), current = state.running < 0 ? null : options[state.running]!;
      const over = current !== null && (current.ended(now) || !current.available(now));
      if (!over && event === state.event && now.time < state.next) return current;
      state.event = event;
      state.next = now.time + deciding.rethink;
      if (current && !over && !current.yields(now)) return current;
      if (current && over) { current.end(); state.running = -1; }
      let best = -1, worth = -Infinity;
      options.forEach((option, i) => {
        if (!option.available(now)) return;
        const value = values[i]! + (i === state.running ? deciding.keep : 0);
        if (value > worth) { best = i; worth = value; }
      });
      if (best !== state.running) {
        if (state.running >= 0) options[state.running]!.end();
        state.running = best;
        if (best >= 0) options[best]!.begin(now);
      }
      return best < 0 ? null : options[best]!;
    },
  };
}
