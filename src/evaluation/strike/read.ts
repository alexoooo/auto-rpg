/**
 * **How the Strike drill reads a trial**: the striker's one action from its request to its end, and
 * each touch of the asked hand on the target, judged by the bar a person's punch sets (`BAR`).
 * Every rung reads its trials so.
 */
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { pointOfToRef } from "../../core/control/support.ts";
import { rigidPoints } from "../../core/build/rigid.ts";
import { regionSegments } from "../../core/mind/action-aim.ts";
import type { DrillPhase } from "../../core/mind/drill-tactics.ts";
import { aimOf } from "../../core/skills/strikes.ts";
import { cos } from "../../core/math/real.ts";
import type { Duel } from "../../arena/duel.ts";
import type { World } from "../../core/world.ts";
import type { Reader } from "../evaluation.ts";

export type Mark = "high" | "middle" | "legs";
export type Hand = "left" | "right";

/**
 * **The bar a blow meets to land**, the untrained adult man's fist less one SD (Adamec et al. 2021,
 * Table 3, male, fist; [human strike reference](../../../docs/reference/human-strike-reference.md#1-punches-straight-jabcross-hook)):
 * its speed over its last `run` m before contact, m/s, and the effective mass it meets on its own
 * side, kg, by hand: the right is the guard's rear hand (dominant 8.0 ± 1.2 m/s, 2.93 ± 0.81 kg),
 * the left its lead (non-dominant 6.2 ± 0.9 m/s, 3.27 ± 0.93 kg). Its last `run` m come in within
 * `cone` degrees of the surface's normal, as the punch competency's straight blow does, and it
 * meets the target within `within` s of the action's start
 * ([thresholds](../../../docs/reference/competencies.md#thresholds)).
 */
export const BAR = Object.freeze({
  speed: Object.freeze({ right: 6.8, left: 5.3 }),
  mass: Object.freeze({ right: 2.12, left: 2.34 }),
  run: .1, cone: 20, within: .5,
});
export type Bar = typeof BAR;

/** A touch of the striker's on the target: when, by which of its segments on which of the target's, and in the rules' units. */
export type StrikeContact = {
  readonly time: number; readonly by: string; readonly on: string; readonly closing: number; readonly energy: number; readonly damage: number;
  /** The effective mass the striking segment met on its own side, kg. */
  readonly kg: number;
};

/** How the asked hand's touch on the mark measured against the bar. */
export type StrikeHit = StrikeContact & {
  /** Its strike point's speed over its last `run` m, m/s; null where it travelled less. */
  readonly speed: number | null;
  /** The cosine between that travel and the surface's normal; null where it travelled less. */
  readonly straight: number | null;
  /** Which of the bar's tests it met. */
  readonly fast: boolean; readonly heavy: boolean; readonly square: boolean; readonly soon: boolean;
};

/**
 * How a trial came out: `landed`, a touch of the hand on the mark that meets the bar while its
 * action ran, the striker up and its action ended; `weak`, on the mark short of the bar;
 * `elsewhere`, the hand on the target but not the mark; `missed`, committed and nothing of the
 * hand's on the target; `abandoned`, begun and ended before committing; `outside`, never in its
 * window; `refused` or `waiting`, never admitted for the reason its readiness gave; `fell`, the
 * striker down at any time of the trial; `unreached`, a fight that never came to its moment.
 */
export type StrikeOutcome = "landed" | "weak" | "elsewhere" | "missed" | "abandoned" | "outside" | "refused" | "waiting" | "fell" | "unreached";

/** What a trial came to. */
export type StrikeReading = {
  readonly outcome: StrikeOutcome;
  /** The drill's last phase before its action, and the reason its readiness last gave. */
  readonly phase: DrillPhase;
  readonly reason: string;
  /** When the drill had the body, s: the bout's start, or the moment its fight was handed to it; null where it never was. */
  readonly handed: number | null;
  /** When the action began, committed, released and ended, s; null where it did not. */
  readonly began: number | null; readonly committed: number | null; readonly released: number | null; readonly ended: number | null;
  readonly ending: string | null;
  /** The hand's first touch on the mark that meets the bar, or else its fastest; null where none. */
  readonly hit: StrikeHit | null;
  /** Every touch of the striker's on the target. */
  readonly contacts: readonly StrikeContact[];
  readonly down: boolean;
  readonly seconds: number;
};

/** When a trial ends: the protocol's longest, how long it runs on after the action's end, and how long the striker may wait to be admitted `settled` s after the drill has the body. */
export interface Ending { readonly seconds: number; readonly settle: number; readonly settled: number; readonly patience: number }

/**
 * The reader of a trial in which the striker, the bout's left side, asks one action with `hand` at
 * the right side's `mark`, ending as `ending` says and judged by `bar`. The striker's actions while
 * its drill is fighting (`DrillPhase`) are the fight's, not the drill's.
 */
export function readStrike({ world, duel }: { readonly world: World; readonly duel: Duel }, { mark, hand }: { readonly mark: Mark; readonly hand: Hand },
  ending: Ending, bar: Bar = BAR): Reader<StrikeReading> {
  const left = duel.duelists.left, skills = left.minded.skills;
  if (!skills) throw new Error("the striker runs no skills");
  const marked = new Set(regionSegments(duel.duelists.right.built.spec, { kind: "mark", mark })), effector = `hand.${hand}`;
  const limb = left.built.segments.get(effector);
  if (!limb) throw new Error(`the striker has no ${effector}`);
  const aim = rigidPoints(left.built.spec, limb.spec).get(aimOf(left.built.spec, hand))!.value, point = new Vector3();
  /** The strike point's path, world, a step at a time: time, x, y, z. */
  const path: number[] = [];
  const times = { began: null as number | null, committed: null as number | null, released: null as number | null, ended: null as number | null };
  const coneCosine = cos(bar.cone * Math.PI / 180);
  let id: number | null = null, phase: DrillPhase = "lost", reason = "", down = false, handed: number | null = null, fought = false;
  /** The actions the fight asked before the drill had the body. */
  const before = new Set<number>();
  /** The strike point's travel over its last `bar.run` m before `time`: its speed and its direction, or null where it travelled less. */
  const approach = (time: number): { speed: number; direction: [number, number, number] } | null => {
    let end = path.length - 4;
    while (end >= 0 && path[end]! >= time) end -= 4;
    if (end < 0) return null;
    const ex = path[end + 1]!, ey = path[end + 2]!, ez = path[end + 3]!;
    for (let k = end - 4; k >= 0; k -= 4) {
      const dx = ex - path[k + 1]!, dy = ey - path[k + 2]!, dz = ez - path[k + 3]!, far = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (far < bar.run) continue;
      const next = k + 4, nx = ex - path[next + 1]!, ny = ey - path[next + 2]!, nz = ez - path[next + 3]!, near = Math.sqrt(nx * nx + ny * ny + nz * nz);
      const f = far === near ? 0 : (far - bar.run) / (far - near), at = path[k]! + f * (path[next]! - path[k]!);
      const sx = path[k + 1]! + f * (path[next + 1]! - path[k + 1]!), sy = path[k + 2]! + f * (path[next + 2]! - path[k + 2]!), sz = path[k + 3]! + f * (path[next + 3]! - path[k + 3]!);
      const tx = ex - sx, ty = ey - sy, tz = ez - sz, length = Math.sqrt(tx * tx + ty * ty + tz * tz);
      return { speed: bar.run / (path[end]! - at), direction: [tx / length, ty / length, tz / length] };
    }
    return null;
  };
  return {
    afterStep() {
      if (skills.report.engagement?.phase === "fighting") {
        fought = true;
        for (const one of skills.report.actions) before.add(one.id);
        return;
      }
      handed ??= fought ? world.time : 0;
      const action = skills.report.actions.find((one) => !before.has(one.id));
      if (action && id === null) { id = action.id; times.began = world.time; }
      if (action && action.id === id) {
        if (action.phase === "commit" && times.committed === null) times.committed = world.time;
        if (action.phase === "release" && times.released === null) times.released = world.time;
      }
      if (id !== null && times.ended === null && !skills.report.actions.some((one) => one.id === id)) times.ended = world.time;
      if (id === null) {
        const engagement = skills.report.engagement;
        phase = (engagement?.phase ?? "lost") as DrillPhase;
        reason = engagement?.details?.find((detail) => detail.label === "readiness")?.value ?? "";
      }
      if (id !== null && times.ended === null) {
        pointOfToRef(limb, aim, point);
        path.push(world.time, point.x, point.y, point.z);
      }
      down ||= left.body.down;
    },
    get ended() {
      return world.time >= ending.seconds || times.ended !== null && world.time >= times.ended + ending.settle
        || id === null && handed !== null && world.time >= handed + ending.settled + ending.patience;
    },
    reading() {
      const touches = duel.blows.flatMap((blow) => {
        if (blow.kind !== "impact") return [];
        const k = blow.sides.findIndex((side) => side.fighter === "left"), by = blow.sides[k], on = blow.sides[1 - k];
        if (!by || !on || on.fighter !== "right" || on.item !== null) return [];
        const sign = k === 0 ? 1 : -1, normal = [blow.normal[0] * sign, blow.normal[1] * sign, blow.normal[2] * sign] as const;
        return [{ contact: { time: blow.time, by: by.segment, on: on.segment, closing: blow.closing, energy: blow.energy, damage: on.damage, kg: by.kg }, normal }];
      });
      const live = (time: number) => times.began !== null && time >= times.began && time <= (times.ended ?? world.time);
      const byHand = touches.filter(({ contact }) => contact.by === effector && live(contact.time));
      const hits = byHand.filter(({ contact }) => marked.has(contact.on)).map(({ contact, normal }): StrikeHit => {
        const travel = approach(contact.time);
        const straight = travel && travel.direction[0] * normal[0] + travel.direction[1] * normal[1] + travel.direction[2] * normal[2];
        return { ...contact, speed: travel?.speed ?? null, straight,
          fast: travel !== null && travel.speed >= bar.speed[hand], heavy: contact.kg >= bar.mass[hand], square: straight !== null && straight >= coneCosine,
          soon: times.began !== null && contact.time - times.began <= bar.within };
      });
      const meets = (hit: StrikeHit) => hit.fast && hit.heavy && hit.square && hit.soon;
      const hit = hits.find(meets) ?? hits.reduce<StrikeHit | null>((best, one) => best === null || (one.speed ?? 0) > (best.speed ?? 0) ? one : best, null);
      const ledger = id === null ? undefined : skills.report.ledger.find((record) => record.id === id);
      const outcome: StrikeOutcome = handed === null ? "unreached" : down ? "fell" : hit ? meets(hit) && times.ended !== null ? "landed" : "weak" : byHand.length ? "elsewhere"
        : times.committed !== null ? "missed" : id !== null ? "abandoned" : phase === "position" ? "outside" : phase === "waiting" ? "waiting" : "refused";
      return { outcome, phase, reason, handed, ...times, ending: ledger?.ending.kind ?? null, hit, contacts: touches.map(({ contact }) => contact), down, seconds: world.time };
    },
  };
}
