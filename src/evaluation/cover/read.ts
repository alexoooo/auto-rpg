/**
 * **How the Cover drill reads a trial**: every touch of what the drill opponent strikes with on the
 * subject, by where it met the subject (its head, its guard, the rest of it), the hit points each
 * took, and whether the subject went down.
 */
import { regionSegments } from "../../core/intent/action-aim.ts";
import { strikersOf, type BodySpec } from "../../core/spec/body.ts";
import type { Duel } from "../../arena/duel.ts";
import type { World } from "../../core/world.ts";
import type { Reader } from "../evaluation.ts";

/** Where a touch met the subject: its head (the high mark's segments), its guard (its arms, hand to upper arm, or what a hand holds), or the rest of it. */
export type Met = "head" | "guard" | "body";

/** A touch of the opponent's on the subject: when, by which of the opponent's segments or items, where it met, and the hit points it took. */
type CoverTouch = { readonly time: number; readonly by: string; readonly on: string; readonly met: Met; readonly damage: number };

/**
 * How a trial came out: `fell`, the subject down at any time of the trial; `hit`, a touch on its
 * head; `struck`, on the rest of it but not its head; `covered`, its guard alone met the touches;
 * `untouched`, nothing of the opponent's met it.
 */
type CoverOutcome = "fell" | "hit" | "struck" | "covered" | "untouched";

/** What a trial came to. */
export type CoverReading = {
  readonly outcome: CoverOutcome;
  /** How many touches met it, by where. */
  readonly touches: Readonly<Record<Met, number>>;
  /** The hit points the subject lost in the opponent's touches, all of them, and those on its head. */
  readonly taken: number;
  readonly headTaken: number;
  /** How long it covered with a hand (`SkillReport.covering`), s. */
  readonly covering: number;
  readonly first: CoverTouch | null;
  /** How many of the opponent's blows touched it (`BLOW_GAP`), and how many of those its left hand's item met first. */
  readonly blows: number;
  readonly shielded: number;
  readonly down: boolean;
  readonly seconds: number;
};

/** How long after a touch a touch is the same blow's, s. */
export const BLOW_GAP = .3;

/** The arm of `hand` in `spec`: the hand, its forearm and its upper arm. */
function armOf(spec: BodySpec, hand: string): readonly string[] {
  const arm: string[] = [];
  for (let at: string | undefined = hand, k = 0; k < 3 && at !== undefined; k++) { arm.push(at); at = spec.joints.find((joint) => joint.child === at)?.parent; }
  return arm;
}

/**
 * What a body of `spec` strikes with, by segment: each limb it strikes with (`strikersOf`) and the
 * segment that limb hangs from (a hand's forearm, a foot's shank). What a hand holds strikes too.
 * Nothing else of it touches in a blow: a fallen opponent's head on a foot is none.
 */
function strikesWith(spec: BodySpec): ReadonlySet<string> {
  const segments = new Set<string>();
  for (const limb of strikersOf(spec)) {
    segments.add(limb);
    const parent = spec.joints.find((joint) => joint.child === limb)?.parent;
    if (parent !== undefined) segments.add(parent);
  }
  return segments;
}

/** The reader of a trial in which the subject, the bout's left side, stands and covers against the right side for `seconds` s. */
export function readCover({ world, duel }: { readonly world: World; readonly duel: Duel }, { seconds }: { readonly seconds: number }): Reader<CoverReading> {
  const left = duel.duelists.left, skills = left.minded.skills, striking = strikesWith(duel.duelists.right.built.spec);
  if (!skills) throw new Error("the subject runs no skills");
  const spec = left.built.spec, head = new Set(regionSegments(spec, { kind: "mark", mark: "high" }));
  const guard = new Set(["left", "right"].flatMap((side) => armOf(spec, `hand.${side}`)));
  const shield = spec.held?.find((held) => held.segment === "hand.left")?.item.name ?? null;
  let down = false, covering = 0, last = world.time;
  return {
    afterStep() {
      if (skills.report.covering.length > 0) covering += world.time - last;
      last = world.time;
      down ||= left.body.down;
    },
    get ended() { return world.time >= seconds; },
    reading() {
      const touches: CoverTouch[] = duel.blows.flatMap((blow) => {
        if (blow.kind !== "impact") return [];
        const on = blow.sides.find((side) => side.fighter === "left"), by = blow.sides.find((side) => side.fighter === "right");
        if (!on || !by || by.item === null && !striking.has(by.segment)) return [];
        const met: Met = on.item !== null || guard.has(on.segment) ? "guard" : head.has(on.segment) ? "head" : "body";
        return [{ time: blow.time, by: by.item ?? by.segment, on: on.item ?? on.segment, met, damage: on.damage }];
      });
      const count = (met: Met) => touches.filter((touch) => touch.met === met).length;
      const counts = { head: count("head"), guard: count("guard"), body: count("body") };
      const outcome: CoverOutcome = down ? "fell" : counts.head ? "hit" : counts.body ? "struck" : counts.guard ? "covered" : "untouched";
      const taken = touches.reduce((sum, touch) => sum + touch.damage, 0), headTaken = touches.reduce((sum, touch) => sum + (touch.met === "head" ? touch.damage : 0), 0);
      let blows = 0, shielded = 0;
      touches.forEach((touch, k) => {
        if (k > 0 && touch.time - touches[k - 1]!.time <= BLOW_GAP) return;
        blows++;
        if (shield !== null && touch.on === shield) shielded++;
      });
      return { outcome, touches: counts, taken, headTaken, covering, first: touches[0] ?? null, blows, shielded, down, seconds: world.time };
    },
  };
}
