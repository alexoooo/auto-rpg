import { derive, type Quantity } from "../core/bodies/spec/quantity.ts";
import { atan2 } from "../core/math/real.ts";

/**
 * Measured walking and turning limits supplied by a locomotion's calibration provider.
 * Control asks for a pace or heading within these limits; the provider owns the body,
 * loadout, assistance and harness conditions under which the measurements apply.
 */
export interface StanceEnvelope {
  /**
   * The fastest walk held each way, m/s: forward, to the right, back and to the left, the fastest
   * speed at which every one of that way's trials held (`fastestEvery`; `paceToward` reads between
   * them). Where the asset measured no way by itself, each is its one fastest walk.
   */
  readonly ways: { readonly forward: Quantity<number>; readonly right: Quantity<number>; readonly back: Quantity<number>; readonly left: Quantity<number> };
  /** Optional operating limits at eight headings, forward then clockwise every 45 degrees.
   * Cardinal entries equal `ways`; intermediate headings interpolate between adjacent limits.
   * These explicit operating limits are not raised by a caller accepting trial failures.
   */
  readonly directions?: readonly Quantity<number>[];
  /**
   * At each speed of the gait battery up to its fastest walk forward (`ways.forward`), slowest
   * first: the fastest the heading turned while the body walked forward at that speed, and held,
   * rad/s (the asset's, by `fastestHeld`), and no faster than it turned at every slower speed: a
   * turn held at a speed a slower one did not hold does not count.
   */
  readonly turns: readonly { readonly speed: Quantity<number>; readonly turn: Quantity<number> }[];
  /**
   * Each way's trials, where the asset measured each way by itself: at each speed of the gait
   * battery, slowest first, how many of that way's walks held of how many it walked. `ways` reads
   * them by the rule; a caller that would go faster than that reads what it risks (`paceToward`'s
   * share). Null where the asset did not keep them.
   */
  readonly tried: {
    readonly speeds: readonly Quantity<number>[];
    readonly trials: Quantity<number>;
    readonly held: { readonly forward: readonly Quantity<number>[]; readonly right: readonly Quantity<number>[]; readonly back: readonly Quantity<number>[]; readonly left: readonly Quantity<number>[] };
  } | null;
}

/** Admission for an explicitly supplied calibration: finite nonnegative limits and ordered turn speeds. */
export function validStanceEnvelope(value: unknown): value is StanceEnvelope {
  if (!value || typeof value !== "object") return false;
  const envelope = value as StanceEnvelope;
  const quantity = (q: unknown, unit: string): boolean => !!q && typeof q === "object"
    && (q as Quantity<number>).unit === unit && Number.isFinite((q as Quantity<number>).value) && (q as Quantity<number>).value >= 0;
  if (!envelope.ways || !["forward", "right", "back", "left"].every(way => quantity(envelope.ways[way as keyof StanceEnvelope["ways"]], "m/s"))) return false;
  const directions = envelope.directions;
  if (directions !== undefined && (!Array.isArray(directions) || directions.length !== 8 || !directions.every(q => quantity(q, "m/s"))
    || ["forward", "right", "back", "left"].some((way, i) => directions[i * 2]!.value !== envelope.ways[way as keyof StanceEnvelope["ways"]].value))) return false;
  if (!Array.isArray(envelope.turns) || !envelope.turns.every((row, i) => row && quantity(row.speed, "m/s") && quantity(row.turn, "rad/s")
    && (i === 0 || row.speed.value > envelope.turns[i - 1]!.speed.value))) return false;
  const tried = envelope.tried;
  return tried === null || !!tried && Array.isArray(tried.speeds) && quantity(tried.trials, "1") && tried.trials.value > 0
    && tried.speeds.every(speed => quantity(speed, "m/s")) && !!tried.held
    && ["forward", "right", "back", "left"].every(way => {
      const counts = tried.held[way as keyof StanceEnvelope["ways"]];
      return Array.isArray(counts) && counts.length === tried.speeds.length && counts.every(count => quantity(count, "1") && count.value <= tried.trials.value);
    });
}

/**
 * The fastest pace `envelope` holds walking `forward` m/s ahead and `right` m/s to the right, m/s: on
 * the eight-heading operating table where supplied, else the ellipse through the fastest walks
 * of the two ways that walk lies between (`StanceEnvelope.ways`),
 * so a walk asked past it keeps its way at the most that way holds. A way that held no speed holds
 * none, nor does any walk with a share of it. Given a `share` under 1, each way's fastest is the
 * fastest speed at which at least that share of its trials held (`StanceEnvelope.tried`), where it
 * is faster than the rule's: the pace a caller asks that accepts the rest falling.
 */
export function paceToward(envelope: StanceEnvelope, forward: number, right: number, share = 1): number {
  if (envelope.directions && (forward !== 0 || right !== 0)) {
    const angle = atan2(right, forward), sector = (angle < 0 ? angle + 2 * Math.PI : angle) * 4 / Math.PI;
    const cell = Math.floor(sector), fraction = sector - cell, limits = envelope.directions;
    return limits[cell % 8]!.value * (1 - fraction) + limits[(cell + 1) % 8]!.value * fraction;
  }
  const along = risked(envelope, forward >= 0 ? "forward" : "back", share), across = risked(envelope, right >= 0 ? "right" : "left", share);
  if (along === across) return along;
  const speed = Math.sqrt(forward * forward + right * right);
  if (speed === 0) return Math.min(along, across);
  const u = forward / along, v = right / across;
  return speed / Math.sqrt((forward === 0 ? 0 : u * u) + (right === 0 ? 0 : v * v));
}

/** The fastest walk `way` that held at least `share` of its trials at its speed, or by the rule (`StanceEnvelope.ways`) where that is faster, m/s. */
function risked({ ways, tried }: StanceEnvelope, way: keyof StanceEnvelope["ways"], share: number): number {
  let fastest = ways[way].value;
  if (share >= 1 || !tried) return fastest;
  const held = tried.held[way], trials = tried.trials.value;
  for (let i = 0; i < held.length; i++) if (held[i]!.value >= share * trials) fastest = Math.max(fastest, tried.speeds[i]!.value);
  return fastest;
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

/** The fastest speed of `envelope`'s table at which it held a turn, m/s; 0 if it held none. */
export function fastestTurning(envelope: StanceEnvelope): number {
  let fastest = 0;
  for (const t of envelope.turns) if (t.turn.value > 0) fastest = Math.max(fastest, t.speed.value);
  return fastest;
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

/**
 * `envelope` for a gait `quick` times as quick as the one it was measured on (a hasted body's,
 * `quickness`, `src/skills/locomotion/gait-scale.ts`): every speed and turn it holds, and every pace it
 * tried, that many times as fast; `envelope` itself at 1.
 */
export function quickened(envelope: StanceEnvelope, quick: number): StanceEnvelope {
  if (quick === 1) return envelope;
  const faster = (q: Quantity<number>): Quantity<number> => derive(q.unit, "quickened as the gait is by the body's haste", [q], (v) => v * quick);
  const { ways, tried, turns, directions } = envelope;
  return {
    ways: { forward: faster(ways.forward), right: faster(ways.right), back: faster(ways.back), left: faster(ways.left) },
    ...(directions ? { directions: directions.map(faster) } : {}),
    tried: tried && { ...tried, speeds: tried.speeds.map(faster) },
    turns: turns.map(({ speed, turn }) => ({ speed: faster(speed), turn: faster(turn) })),
  };
}
