import { mulberry32 } from "../../rng.ts";
import {
  GOLEM_TACTICS_V3, golemStyled, watchedDirector,
  type GolemStyled, type StyleAskHook, type StyleDirector, type StyleOption, type StyleTactics,
} from "../tactics-v3.ts";

/**
 * `golem-brawler`: the inside direction, and the only mind in the set that closes on purpose.
 *
 * ## What it fights like
 *
 * It has no stand-off at all and its hold floors at its own inner radius, so the distance every
 * other mind defends is the distance this one is trying to get past. It walks in, and once it is
 * inside it shoves, strikes short with either hand, and puts the point in when the head is the
 * softest thing it can reach. A ram head charges. Their point committing is stepped off the line
 * only when it is still outside their reach; inside it, there is nothing to step back to and it
 * keeps coming. It never names `withdraw` and it never names `retreat`.
 *
 * ## What the executor already does for it
 *
 * Three of the plan's rules turned out to be rules the executor keeps: the spare hand's bash is
 * `comboFraction`, which is already 1.0 for everybody, and it is already skipped for a paired
 * grip; a paired shove is already both channels; and `crowdedSeconds` -- the plan asked for it to
 * be set high so the crowding withdrawal is never taken -- is a v1 reflex that `src/golem/tactics-v3.ts`
 * does not read at all. The one thing that had to be added is `thrustByHealth`: every thrust was
 * aimed at the trunk whatever `targetByHealth` said, so "thrust at the head" had nowhere to land.
 *
 * ## The number this style is most exposed to
 *
 * Session 01's one-claim rule stopped a stroke billing the same part twice inside 0.25 s, and what
 * survives of raking is a short drawn stroke that touches several *different* parts. That is
 * exactly what this style throws, so `blows` per stroke is the column to read it on rather than
 * damage a bout, and the Session 07 entry puts it beside the fencer's.
 */
const BRAWLER_TABLE = {
  ...GOLEM_TACTICS_V3,
  /** No stand-off: the whole style is the refusal to keep the distance every other mind keeps. */
  standOffFraction: 0,
  /**
   * Low enough that the hold falls through to its floor, which is the inner radius plus slack.
   *
   * `styleRanges` takes the largest of `reach * holdFraction`, `near + slack` and the stand-off,
   * and the inner radius is a floor on the hold by construction rather than by tuning -- so this
   * is not "hold at 0.40 of reach", it is "hold as close as this executor will let anybody hold".
   * Getting inside that floor is what `close` is for, and it is why this director names `close`
   * when it has nothing better to do rather than `hold`.
   */
  holdFraction: 0.40,
  /**
   * How much of the weapon's overhang a strike's commanded reach accounts for.
   *
   * The plan asked for 0.80 and glossed it "the arm stays drawn", and the row's own note in
   * `src/golem/tactics.ts` says the opposite is true: the subtraction is `overhang * (1 - bite)`,
   * so a *larger* bite extends the arm further, and below the inner radius 0.66 goes on drawing
   * the arm in where 0.80 does not. The plan's number ships because it is the plan's number and
   * the sweep is where a disagreement like this gets settled; Session 07's entry has the rows.
   */
  strikeBite: 0.80,
  /** On, with no margin: the sever-hunter, because an arm that comes off is loot in the parts bin. */
  targetByHealth: true,
  targetMargin: 0,
  /** On: the half of "thrust at the head" that the executor had to be taught. */
  thrustByHealth: true,
};

/** Every constant this style has: the executor's table with this style's rows over it. */
export type BrawlerTactics = StyleTactics & { closesAlways: boolean };

export const BRAWLER: BrawlerTactics = { ...BRAWLER_TABLE, closesAlways: true };

/**
 * The style itself: six rules, and every one of them faces the same way.
 *
 * There is no rule here about leaving, which is the point of it. The order is the order of what
 * is worth doing at the range it is worth doing it at -- the charge, the shove, the one evasion
 * this style allows itself, the walk in, and then the two strokes -- and the last line is a walk
 * in as well.
 */
export function brawlerDirector(seed: number, T: BrawlerTactics = BRAWLER): StyleDirector {
  const random = mulberry32(seed);
  // Drawn and unused unless a future row wants a roll; the seed is taken so that the signature
  // matches the other three styles and a decision log can be replayed the same way.
  void random;

  return (available, reading): StyleOption => {
    // The abort ask, which this style is not configured to receive -- `chamberAbort` is off -- and
    // would answer by finishing the stroke. A brawler does not take a stroke back.
    if (!available.includes("hold")) return available[0];

    // The charge. The offer already carries v2's two ranges, the wider of which is their recover,
    // so a `ram` on the table is a `ram` worth taking and a headfirst body has nothing else.
    if (available.includes("ram")) return "ram";

    // Inside the inner radius there is no stroke with room to work, and a shove is the act that
    // does not need any. The offer is wider than this -- `near + 0.15 * reach` -- and the rule is
    // deliberately not: outside the radius the arm can still swing, and it should.
    if (reading.gap <= reading.near && available.includes("shove")) return "shove";

    // The one evasion this style allows itself, and the condition is the whole of its temperament:
    // a point committing from outside their reach can be stepped off the line of, because there is
    // ground behind me to step into. Inside it there is not, and going backwards from there is how
    // a body gets hit in the back of the hand.
    if (reading.theirs === "commit" && reading.gap > reading.theirReach
      && available.includes("void")) {
      return "void";
    }

    // Everything else waits until it is inside.
    if (reading.gap > reading.near + reading.slack) return "close";

    if (reading.weakestSlot === "head" && available.includes("thrust")) return "thrust";
    if (available.includes("strike")) return "strike";

    return T.closesAlways ? "close" : "hold";
  };
}

/** The style over the executor, with an optional hook on the ask for a decision log. */
export function golemBrawler(
  seed: number, T: BrawlerTactics = BRAWLER, onAsk: StyleAskHook | null = null,
): GolemStyled {
  const director = brawlerDirector(seed, T);
  return golemStyled(seed, T, onAsk === null ? director : watchedDirector(director, onAsk));
}
