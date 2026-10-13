import measured from "../../../assets/core/stance-envelope.json" with { type: "json" };
import strideMeasured from "../../../assets/core/stride-envelope.json" with { type: "json" };
import simbiconMeasured from "../../../assets/core/simbicon-envelope.json" with { type: "json" };
import { heldBy } from "../items/held.ts";
import type { SourceKey } from "../sources.ts";
import type { BodySpec } from "../spec/body.ts";
import { sourced, type Quantity } from "../spec/quantity.ts";

/**
 * **What the stance can do with a body**, measured, so that a caller asks for "your fastest walk"
 * and not for a number that held on one engine. The numbers are
 * `assets/core/stance-envelope.json`, which `research/core-stance-envelope.mjs --write` writes from
 * the gait battery (`research/core-stance-trials.mjs`' walk, five ways at each speed) and the turn
 * battery (its turn: half round each way at each rate, walking at each of the gait battery's speeds
 * up to the fastest walk, from the walk's setting off and through its first strides as well as
 * under way), and which names the harness and rate it was measured on;
 * `tests/core-stance-envelope.test.mjs` holds this parent-axis Rapier reference to that harness
 * and rate. It does not validate another gameplay engine or a reduced balance allowance.
 *
 * A turn is read at each speed because it depends on it: a body may turn several times faster a
 * little below its fastest walk than at it, so one turn for all speeds would make a run crawl round
 * a bend.
 *
 * Measured on the body as a fight plays it, at the rate the asset names: in the guard, under its
 * character's balance, with each thing a fight puts in its right hand. A body holding one of them
 * reads that loadout's own envelope where the asset measured it, and the least of them where not.
 * Another rate, or another thing held, is a body the table did not see. Unassisted coordinate-engine Warrior turns are
 * separately measured in `docs/reference/combat-locomotion.md`; callers may apply a lower ceiling.
 */
export interface StanceEnvelope {
  /** The fastest walk the stance held, m/s (`fastestHeld`). */
  readonly walk: Quantity<number>;
  /**
   * The fastest walk held each way, m/s: forward, to the right, back and to the left, by the same
   * rule over that way's trials alone (`paceToward` reads between them). Where the asset measured no
   * way by itself, each is `walk`.
   */
  readonly ways: { readonly forward: Quantity<number>; readonly right: Quantity<number>; readonly back: Quantity<number>; readonly left: Quantity<number> };
  /**
   * At each speed of the gait battery up to its fastest walk forward (`ways.forward`), slowest
   * first: the fastest the heading turned while the body walked forward at that speed, and held,
   * rad/s (`fastestHeld`).
   */
  readonly turns: readonly { readonly speed: Quantity<number>; readonly turn: Quantity<number> }[];
}

/**
 * **How a walk must go to have held**, shares of the pace asked: its pace along the way asked at
 * least `along`, and across that way at most `across`. A walk that stands, or goes another way, has
 * not walked at the pace asked however long it stays up. At these shares the stance's walk and the
 * stride hold the speeds they held by their falls alone; the SIMBICON walk backward makes half the
 * pace asked, and does not.
 */
export const WENT = Object.freeze({ along: 0.7, across: 0.35 });

/** Whether a walk asked `asked` m/s that made `along` m/s along the way asked and `across` across it went as asked (`WENT`). */
export function wentAsAsked(along: number, across: number, asked: number): boolean {
  return along >= WENT.along * asked && Math.abs(across) <= WENT.across * asked;
}

/**
 * **How a turn must go to have held**: the body's facing no further than `TURNED` rad behind the
 * heading asked as the turn asked ends. A turn the legs take slower than asked has not turned at
 * the rate asked however long the body stays up: a half turn at a rate the legs take at 0.85 of it
 * lags half a radian.
 */
export const TURNED = 0.5;

/** Whether a turn whose facing lagged the heading asked by `lag` rad as it ended turned as asked (`TURNED`). */
export function turnedAsAsked(lag: number): boolean {
  return lag <= TURNED;
}

/**
 * A battery's trials at each speed (a walk's, or a turn's rate): how many ways of `ways` held (did
 * not fall, a walk went as asked, `wentAsAsked`, and a turn turned as asked, `turnedAsAsked`).
 */
interface GaitTable {
  readonly speeds: readonly number[];
  readonly ways: number;
  readonly held: readonly number[];
}

/**
 * The rule: the fastest speed of the battery at which every way held, as it did at every slower
 * one; 0 if none. A speed that held after a slower one fell does not count.
 */
export function fastestHeld({ speeds, ways, held }: GaitTable): number {
  let fastest = 0;
  for (let i = 0; i < speeds.length; i++) {
    if (held[i]! < ways) break;
    fastest = speeds[i]!;
  }
  return fastest;
}

/**
 * The fastest pace `envelope` holds walking `forward` m/s ahead and `right` m/s to the right, m/s: on
 * the ellipse through the fastest walks of the two ways that walk lies between (`StanceEnvelope.ways`),
 * so a walk asked past it keeps its way at the most that way holds. A way that held no speed holds
 * none, nor does any walk with a share of it.
 */
export function paceToward(envelope: StanceEnvelope, forward: number, right: number): number {
  const { ways } = envelope, along = (forward >= 0 ? ways.forward : ways.back).value, across = (right >= 0 ? ways.right : ways.left).value;
  if (along === across) return along;
  const speed = Math.sqrt(forward * forward + right * right);
  if (speed === 0) return Math.min(along, across);
  const u = forward / along, v = right / across;
  return speed / Math.sqrt((forward === 0 ? 0 : u * u) + (right === 0 ? 0 : v * v));
}

/**
 * The fastest turn `envelope` holds walking at `speed`, rad/s: that of the slowest speed of its table
 * at or above `speed`, taking a turn held at a walk as held at any slower one; past its fastest walk
 * forward, that walk's; with no walk forward held, none.
 */
export function turnAt(envelope: StanceEnvelope, speed: number): number {
  const turns = envelope.turns;
  if (turns.length === 0) return 0;
  return (turns.find((t) => t.speed.value >= speed) ?? turns[turns.length - 1]!).turn.value;
}

/**
 * The fastest pace at which `envelope`'s turns carry the body round a bend of `radius` m, m/s: over
 * its table, the most of each speed or what its turn carries round the bend, whichever is less
 * (walking no faster than a speed, the body turns as fast as it turned there: `turnAt`). A straight
 * (`radius` Infinity) asks no turn, so even a speed that held none carries the body along it.
 */
export function paceRound(envelope: StanceEnvelope, radius: number): number {
  return Math.max(0, ...envelope.turns.map((t) => Math.min(t.speed.value, carried(t.turn.value, radius))));
}

/** The pace a turn of `turn` rad/s carries round a bend of `radius` m, m/s: on a straight, any. */
export function carried(turn: number, radius: number): number {
  return radius === Infinity ? Infinity : turn * radius;
}

/** A body's readings in an envelope's asset: its fastest walk, its fastest each way where the asset measured them (`byWay`, in the order of `ways`), and its turns. */
interface EnvelopeEntry {
  readonly walk: number;
  readonly byWay?: readonly number[];
  readonly turns: readonly number[];
}

/**
 * An envelope's asset, as `research/core-stance-envelope.mjs` writes it: its speeds and ways (degrees
 * to the right of forward), and each model's readings over every thing its right hand held, the
 * least of them, with each one's own where it measured them (`holds`).
 */
interface EnvelopeTable {
  readonly speeds: readonly number[];
  readonly ways: readonly number[];
  readonly models: Readonly<Record<string, EnvelopeEntry & { readonly holds?: Readonly<Record<string, EnvelopeEntry>> }>>;
}

/** The ways `StanceEnvelope.ways` names, by their degrees to the right of forward. */
const CARDINAL = { forward: 0, right: 90, back: 180, left: 270 } as const;

/**
 * The envelope of `spec`'s model in `table`, the asset `source` names, with what its right hand
 * holds (`heldBy`) where the asset measured that apart, and over everything it measured held where
 * not: `what` walks, for an error.
 */
function envelopeIn(table: EnvelopeTable, source: SourceKey, spec: BodySpec, what: string): StanceEnvelope {
  const model = table.models[spec.model];
  if (!model) throw new Error(`${what}'s envelope was not measured on ${spec.model}`);
  const held = heldBy(spec, "right"), own = held === null ? undefined : model.holds?.[held];
  const entry = own ?? model, at = own ? `/models/${spec.model}/holds/${held}` : `/models/${spec.model}`;
  const walk = sourced(entry.walk, "m/s", source, `${at}/walk`), byWay = entry.byWay;
  const way = (degrees: number): Quantity<number> => {
    if (!byWay) return walk;
    const i = table.ways.indexOf(degrees);
    if (i < 0) throw new Error(`${what}'s envelope measured no walk ${degrees} degrees round`);
    return sourced(byWay[i]!, "m/s", source, `${at}/byWay/${i}`);
  };
  return {
    walk,
    ways: { forward: way(CARDINAL.forward), right: way(CARDINAL.right), back: way(CARDINAL.back), left: way(CARDINAL.left) },
    turns: entry.turns.map((turn, i) => ({
      speed: sourced(table.speeds[i]!, "m/s", source, `/speeds/${i}`),
      turn: sourced(turn, "rad/s", source, `${at}/turns/${i}`),
    })),
  };
}

/** The measured envelope of `spec`'s model, walking by the stance's own walk (`stance-walk`). */
export function stanceEnvelope(spec: BodySpec): StanceEnvelope {
  return envelopeIn(measured, "core-stance-envelope", spec, "the stance");
}

/**
 * The measured envelope of `spec`'s model walking by the stride (`src/core/skills/stride.ts`):
 * `assets/core/stride-envelope.json`, the same batteries by the same rule at the stride's speeds
 * (`research/core-stance-envelope.mjs --legs stride`).
 */
export function strideEnvelope(spec: BodySpec): StanceEnvelope {
  return envelopeIn(strideMeasured, "stride-envelope", spec, "the stride");
}

/**
 * The measured envelope of `spec`'s model walking by the SIMBICON walk (`src/core/skills/simbicon.ts`):
 * `assets/core/simbicon-envelope.json`, the same batteries by the same rule at its walk's speeds
 * (`research/core-stance-envelope.mjs --legs simbicon`).
 */
export function simbiconEnvelope(spec: BodySpec): StanceEnvelope {
  return envelopeIn(simbiconMeasured, "simbicon-envelope", spec, "the SIMBICON walk");
}
