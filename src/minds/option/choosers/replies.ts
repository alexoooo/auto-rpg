import type { Situation } from "../contract/situation.ts";
import { bodyOf } from "../predictions/value/fitted-value.ts";
import { hypot } from "../../../core/math/real.ts";
import type { PricedLine } from "./search.ts";
import { COLD, treeSearch, type TreeSearched } from "./tree-search.ts";
import { byHand } from "../../../skills/framework/profile/source.ts";

/** A line priced against a reply has the foe making the body's own moves back at it: a rule written by hand, asked only of a foe of the body's own build. */
const FOE_REPLIES = byHand([], "the foe is imagined making the body's own moves back at it, a foe of the body's own build alone");

/**
 * **The tree's search against the foe's replies** (`TreeConfig.replies`, `against`): each line at
 * `root` worth its worst (`worst`) or the mean (`mean`) of what a tree search prices it at with the
 * foe standing (`treeSearch`) and with the foe running each of `replies` replies over the line's
 * first step, a joint step; past it the foe stands, as in any line. It asks a reply only of a foe
 * of the body's own build (`body`, `bodyOf`), one reply a line (`ExchangePredictor.reply`). Its replies are those moves that go furthest each way
 * (`DIRECTIONS`): closing on the body, backing off, and to either side, the first `replies` of
 * them, so the worst of them is the foe's best reply whatever it prefers. Elsewhere, and where
 * none moves, the foe stands.
 */
export function repliedSearch(root: Situation, searched: TreeSearched & { readonly replies: number; readonly against: AgainstName; readonly body: string }): PricedLine[] {
  const own = treeSearch(root, searched), focus = root.focus, where = root.where;
  if (searched.replies === 0 || !focus || !where || bodyOf(focus.spec) !== searched.body) return own;
  const apart = hypot(where.x - focus.centre.x, where.z - focus.centre.z);
  if (!(apart > 0)) return own;
  // From the foe toward the body, and across.
  const ux = (where.x - focus.centre.x) / apart, uz = (where.z - focus.centre.z) / apart;
  const moves = own.map((line) => searched.exchange.reply(root, line.terms)), worths = own.map((line) => [line.worth]), chosen = new Set<number>();
  for (const [along, across] of DIRECTIONS.slice(0, searched.replies)) {
    let best = -1, most = 0;
    moves.forEach((move, i) => {
      if (!move || chosen.has(i)) return;
      const toward = (move.x * ux + move.z * uz) * along + (move.z * ux - move.x * uz) * across;
      if (toward > most) { most = toward; best = i; }
    });
    if (best < 0) continue;
    chosen.add(best);
    const reply = moves[best]!, moved = Object.create(root, { focus: { value: Object.create(focus, { velocity: { value: { x: reply.x, y: 0, z: reply.z } } }) } }) as Situation;
    const replied = treeSearch(moved, { ...searched, carry: reply.seconds, start: COLD });
    own.forEach((line, i) => {
      const same = replied.find((other) => other.pair.option === line.pair.option && other.pair.target === line.pair.target);
      if (same) worths[i]!.push(same.worth);
    });
  }
  return own.map((line, i) => {
    const all = worths[i]!;
    return { ...line, worth: searched.against === "mean" ? all.reduce((sum, worth) => sum + worth, 0) / all.length : Math.min(...all), foe: all.length > 1 ? FOE_REPLIES : line.foe };
  });
}

/** **The ways a foe's replies go** (`repliedSearch`), in order, as [toward the body, across it]: closing, backing off, to one side, to the other. */
export const DIRECTIONS: readonly (readonly [number, number])[] = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1]]);

/**
 * **What a line is worth against the foe's replies** (`TreeConfig.against`): `worst`, the least of
 * its worths with the foe standing and replying; `mean`, their mean.
 */
export const AGAINST = Object.freeze({
  worst: Object.freeze({ label: "Its worst" }),
  mean: Object.freeze({ label: "Their mean" }),
});
export type AgainstName = keyof typeof AGAINST;
