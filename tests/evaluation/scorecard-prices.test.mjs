import test from "node:test";
import assert from "node:assert/strict";
import { pricesOf } from "../../src/evaluation/scorecard/read.ts";

/**
 * The scorecard's priced-against-given read a strike at half its price (its whole price scaled by
 * the third of its time it held, its blow already landed), and a walk replaced far off as
 * overpriced (its danger, at its route's end, read only over the span it held): a reading of the
 * Mind's predictions that the reader made. Choices summed by hand, each column of each slice: a
 * strike chosen twice in a row and replaced after a third of its time, a hold replaced after 0.2 s,
 * a walk whose loss comes after it is replaced, a second strike. A bout's reading cannot show it:
 * its truth is not known.
 */
test("priced against given reads a run over its window, a hold over its span, and a blow whole", () => {
  const choice = (t, name, open, duration, dealt, taken, kind) => ({ t, name, open, duration, dealt, taken, slices: ["all", kind] });
  const decisions = [
    choice(0, "strike", false, 1.2, .06, .03, "strike"), choice(.1, "strike", false, 1.2, .06, .03, "strike"),
    choice(.4, "hold", true, 20, 0, .4, "stay"),
    choice(.6, "walk", false, 2, 0, .03, "move"),
    choice(1, "strike", false, 1.2, .06, .03, "strike"),
  ];
  // Each side's losses, [when, life]: the body's in the hold and late in the walk's run, the foe's to each strike's blow.
  const losses = [[[.5, .02], [2.4, .03]], [[.2, .05], [1.3, .04]]];
  const lifeAt = (side, t) => 1 - losses[side].filter(([at]) => at <= t).reduce((sum, [, life]) => sum + life, 0);
  const round = (prices) => Object.fromEntries(Object.entries(prices).map(([slice, p]) => [slice, Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Math.round(v * 1e9) / 1e9]))]));
  assert.deepEqual(round(pricesOf(decisions, lifeAt, 10, false)), {
    // The strikes: taken over each whole run ([0, 1.2] lost .02, [1, 2.2] none); dealt whole, given while each held.
    strike: { n: 2, taken: .06, lost: .02, dealing: 2, dealt: .12, given: .09 },
    // The hold: .4 over 20 s, held 0.2 s.
    stay: { n: 1, taken: .004, lost: .02, dealing: 0, dealt: 0, given: 0 },
    // The walk: replaced at 1 s, its run's window [0.6, 2.6] holds the loss at 2.4.
    move: { n: 1, taken: .03, lost: .03, dealing: 0, dealt: 0, given: 0 },
    all: { n: 4, taken: .094, lost: .07, dealing: 2, dealt: .12, given: .09 },
  });
});
