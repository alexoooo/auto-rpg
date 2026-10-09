import type { BodySpec, Side } from "../spec/body.ts";
import type { BlowSkill } from "./skill.ts";
import { rangeOf, type StrikeReport } from "./strike.ts";

/**
 * **The blow of a fighter that has none**: it refuses every attack, claims nothing and is never
 * under way, so the guard keeps both hands and the legs the tactics' walk. Its report throws
 * nothing and reads the range `rangeOf` gives the bare reach of `spec`.
 */
export function noBlow(spec: BodySpec): BlowSkill {
  const report: StrikeReport = Object.freeze({ hand: null, phase: null, blow: null, since: 0, still: 0,
    thrown: Object.freeze({ left: 0, right: 0 }), rangeAt: (hand: Side, up: number) => rangeOf(spec, hand, up) });
  return {
    report, holds: null, busy: false, lower: null, releases: false, state: Object.freeze({}),
    accepts: () => false,
    command: () => null,
    resume() {},
  };
}
