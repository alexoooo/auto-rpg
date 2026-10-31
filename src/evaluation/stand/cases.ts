/**
 * **The Stand drill's cases**: the subject's body shoved once (`Shove`, `src/arena/shove.ts`), a
 * level impulse of a size, from a way and at a height of its trunk, on each rung from another
 * state: standing in guard facing a still foe (`guard`, rung 0, led by the stand Commander as the
 * Cover drill is), walking at the foe from far off (`walking`, rung 1, the drill Commander walking
 * it in at a pace), and throwing its strike at a still foe (`striking`, rung 2, the Strike drill's
 * still rung with the shove given as the striking limb flies). The subject is a mind and one of its
 * strike actions, as the Strike drill's is (`StrikeSubject`); the strike is thrown only on rung 2.
 * The foe is a Warrior with empty hands that stands in guard and throws nothing (`drill-stand`),
 * the two on the stage's own axis as a bout's spawns are, so the Arena's camera sees them side on.
 * A way is the subject's own: 0 shoves it forward, from behind; 90 toward its right; 180 back; 270
 * toward its left. A trial is a bout world, so the Arena plays it as it was scored.
 *
 * Rung 0 holds the shoves the stance's capabilities read at `2a1b29ac` (`shove`,
 * `research/core-stance-trials.mjs`): the Warrior 8 N s each way, 55 forward, forward right and
 * back, and 60 to each side, at the middle trunk.
 */
import type { MindConfig } from "../../core/mind/config.ts";
import type { BodyModel } from "../../core/models.ts";
import { deepFreeze } from "../../core/state.ts";
import type { Shove } from "../../arena/shove.ts";
import { sideAttributes, type Cases, type Json } from "../evaluation.ts";
import { opponentOf } from "../drill-opponents.ts";
import { faultsOf, loadoutsOf, striker, type StrikeSubject } from "../strike/cases.ts";
import type { Hand, Mark } from "../strike/read.ts";
import { readStand, type StandReading } from "./read.ts";

/** Where on the trunk a shove meets the body: its lower, middle or upper trunk's centre of mass. */
export type Height = "low" | "middle" | "high";

/** The segment each height names. */
const SEGMENT: Readonly<Record<Height, string>> = deepFreeze({ low: "lowerTrunk", middle: "middleTrunk", high: "upperTrunk" });

/** One trial's conditions, the shove's size last: the strip's columns (`Evaluation.outcome`). `hand` is the striking hand's, on rung 2 alone. */
export type StandCondition = { readonly model: BodyModel; readonly hand?: Hand; readonly height: Height; readonly way: number; readonly impulse: number };

/**
 * A rung: what the subject does when shoved (`state`), its bodies, the shoves' ways (degrees, the
 * subject's own), heights and sizes (N s), the striking hands where it strikes; how far ahead the
 * foe stands, m; when the shove comes, s (on rung 2, no sooner than the striking limb moves at
 * `limb` m/s); how long the drill Commander stands the subject before it walks or strikes, s, and
 * the most speed it walks at, m/s, where the Commander is the drill's; how long the reader
 * watches after the shove, and the longest a trial plays, s; and how near its centre of mass's
 * velocity, over the last `window` s, must come back to what it was to be settled, m/s (`aim`: to
 * standing still, or to what it was doing as it was shoved). A change here is a new protocol.
 */
export interface StandRung {
  readonly state: "guard" | "walking" | "striking";
  readonly models: readonly BodyModel[];
  readonly ways: readonly number[];
  readonly heights: readonly Height[];
  readonly impulses: readonly number[];
  readonly hands?: readonly Hand[];
  readonly mark?: Mark;
  readonly gap: number;
  readonly at: number;
  readonly limb?: number;
  readonly after?: number;
  readonly pace?: number;
  readonly watch: number;
  readonly seconds: number;
  readonly aim: "still" | "before";
  readonly within: number;
  readonly window: number;
}

/** Each way a body is shoved, 45 degrees apart. */
const WAYS = [0, 45, 90, 135, 180, 225, 270, 315];

const GUARD: StandRung = deepFreeze({ state: "guard", models: ["workshop-fighter"] as BodyModel[], ways: WAYS, heights: ["low", "middle", "high"] as Height[],
  impulses: [8, 30, 55, 60], gap: 2.5, at: 2, watch: 5, seconds: 8, aim: "still", within: .05, window: .5 });

/** Walking in from 6 m at 0.5 m/s, shoved 2 s after it may set off, long before the strike it walks to. */
const WALKING: StandRung = deepFreeze({ state: "walking", models: ["workshop-fighter"] as BodyModel[], ways: [0, 90, 180, 270], heights: ["low", "middle", "high"] as Height[],
  impulses: [20, 40], gap: 6, at: 2.5, after: .5, pace: .5, watch: 5, seconds: 8, aim: "before", within: .1, window: .5 });

/** The Strike drill's still rung at 1 m, the middle mark, shoved once the striking hand flies from the chest at 2.5 m/s. */
const STRIKING: StandRung = deepFreeze({ state: "striking", models: ["workshop-fighter"] as BodyModel[], ways: [0, 90, 180, 270], heights: ["middle"] as Height[],
  impulses: [20, 40], hands: ["left", "right"] as Hand[], mark: "middle", gap: 1, at: .5, limb: 2.5, after: .5, pace: 1, watch: 5, seconds: 12,
  aim: "still", within: .05, window: .5 });

/** The Commander that leads a standing subject: stand facing the foe, and strike nothing. */
const STANDING = deepFreeze({ kind: "stand" });

/** The foe on every rung: a Warrior with empty hands that stands in guard and throws nothing. */
const FOE = "drill-stand";

/** The shove of `condition` on `rung`, the subject facing +x: its way, the subject's own, as the world's, from +z toward +x. */
function shoveOf(rung: StandRung, condition: StandCondition): Shove {
  return { side: "left", segment: SEGMENT[condition.height], impulse: condition.impulse, degrees: 90 + condition.way, at: rung.at,
    ...(rung.limb === undefined || condition.hand === undefined ? {} : { limb: { segment: `hand.${condition.hand}`, against: "upperTrunk", speed: rung.limb } }) };
}

function standCases(rung: StandRung): Cases<StandCondition, StandReading> {
  const conditions: StandCondition[] = [];
  for (const model of rung.models) for (const hand of rung.hands ?? [undefined]) for (const height of rung.heights) for (const way of rung.ways) for (const impulse of rung.impulses)
    conditions.push({ model, ...(hand === undefined ? {} : { hand }), height, way, impulse });
  return {
    arity: 1,
    play: rung as unknown as Json,
    conditions,
    seconds: rung.seconds,
    faults: (value, { model }, subject) => faultsOf(value, model, subject),
    world: ([value], condition, engine, [character]) => {
      const subject = value as unknown as StrikeSubject, { model, hand } = condition;
      // The striker's own Commander: the stand, or the drill's, walking it in or striking.
      const led = rung.state === "guard" ? { mind: subject.mind, commander: STANDING }
        : striker(subject, `hand.${hand ?? "right"}`, rung.mark ?? "middle", { after: rung.after ?? 0, ...(rung.pace === undefined ? {} : { pace: rung.pace }) });
      return { kind: "bout", engine, tape: [],
        // A drill, not a fight: nothing ends it but its reader.
        recipe: { left: model, right: "workshop-fighter", capSeconds: rung.seconds + 1, recoverySeconds: null, entry: [], ends: [], ...sideAttributes({ left: character }),
          ...loadoutsOf(subject),
          // Along +x, as the open stage's spawns are: a body facing +x has its right toward -z.
          start: { left: { at: [-rung.gap / 2, 0], heading: Math.PI / 2 }, right: { at: [rung.gap / 2, 0], heading: -Math.PI / 2 } },
          minds: { left: led.mind, right: opponentOf(FOE)!.config as MindConfig }, commanders: { left: led.commander }, shove: shoveOf(rung, condition) } };
    },
    read: (built, condition) => readStand(built, condition, rung),
  };
}

/** Every protocol the Stand drill may be played on, by name: its rungs. */
export const STAND_CASES: Readonly<Record<string, Cases<StandCondition, StandReading>>> = Object.freeze({
  guard: standCases(GUARD), walking: standCases(WALKING), striking: standCases(STRIKING),
});
