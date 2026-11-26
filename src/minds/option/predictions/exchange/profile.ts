import { turnAt } from "../../../../control/stance/stance-envelope.ts";
import { stanceEnvelopeOf } from "../../../../skills/locomotion/shared/stance/envelope.ts";
import { hypot } from "../../../../core/math/real.ts";
import type { BodySpec } from "../../../../core/bodies/spec/body.ts";
import { handSet } from "../../../../core/hand-set.ts";
import { defaultStrikeLimbs } from "../../../../skills/perception/default-strike-limbs.ts";
import { profilesOn } from "../../../../skills/framework/profile/lookup.ts";
import { STANDING, type Postures, type Profile } from "../../../../skills/framework/profile/profile.ts";
import { profileAgainst } from "../../../../skills/framework/profile/across.ts";
import { startVelocity } from "../../../../skills/framework/profile/numbers.ts";
import type { BodySense } from "../../../../core/bodies/senses.ts";
import { foePhase, sensedPosture } from "../../../../skills/perception/threat.ts";
import { turned } from "../../../../skills/perception/stance-numbers.ts";
import type { Position } from "../../../../control/ground-reading.ts";
import type { ExchangePredictor, FoeMove, Guesses, Placing } from "../../contract/predictors.ts";
import type { Coming, DownCost, ModelledStrike, Seen, Situation } from "../../contract/situation.ts";
import type { Terms } from "../../contract/terms.ts";
import { pressureTable, tableSource, type PressureTable } from "./pressure-table.ts";
import { UNMEASURED_TURN } from "../by-hand.ts";
import { blowLife } from "../damage.ts";
import { reactionOf, carriedStances } from "../../situation/percepts.ts";
import { type Model, modelOf, strikesOf, pooled } from "./model.ts";
import { pressureBy, type PressureFields, ProfilePressure, NO_PRESSURE, weakestOf } from "./pressure.ts";
import { foundBy, given, notPriced, type Source } from "../../../../skills/framework/profile/source.ts";
import { remembered } from "../../../../core/remembered.ts";

/** A measured strike's source with its rows said to be picked by a rule (`foundBy`); made once a source. */
const BY_RULE = remembered((source: Source): Source => foundBy(source, "rule"));

/**
 * **What the profile predictor is built with** (`ProfileExchange`): the body's own strikes, each
 * with its profiles measured as the body reads it (`ModelledStrike`); every striker's measured
 * strikes, which model a foe's (`ProfileExchange.foeModel`); and what bouts measured a foe's fighting took from a
 * body (`PressureTable`), null to read the foe's strikes' rate alone.
 */
interface ProfileTables {
  readonly strikes: readonly ModelledStrike[];
  readonly measured: readonly Profile[];
  readonly pressures: readonly PressureTable[] | null;
}

/** Each spec's turn standing measured on its body, rad/s, found once; where none was measured, what it is taken for (`UNMEASURED_TURN`). A cache: a spec never changes. */
const TURNS = new WeakMap<BodySpec, number>();

/** **How fast a body of `spec` turns to face**, rad/s: its measured turn walking slowest (`turnAt`, `stanceEnvelopeOf`); where none was measured, what it is taken for (`UNMEASURED_TURN`). */
function turnOf(spec: BodySpec): number {
  const known = TURNS.get(spec);
  if (known !== undefined) return known;
  const envelope = stanceEnvelopeOf(spec), turn = envelope ? turnAt(envelope, 0) : 0, rate = turn > 0 ? turn : UNMEASURED_TURN;
  TURNS.set(spec, rate);
  return rate;
}

/** This body's phase as a foe's strike meets it (`FoePhase`'s): striking while a blow of its own is under way, else clear. */
const ownPhase = ({ sight }: Seen): string => sight.report.actions.length > 0 ? "striking" : "clear";

/** Where a guess puts the limbs of a body striking one whose posture is `posture` (`Placing`): within their reach of a body standing; null of one lying, which no guess is of. */
const placingAt = (posture: string): Placing | null => posture === "standing" ? "reach" : null;

/** The least a reply moves the foe, m (`ProfileExchange.reply`): a line moving the body less is the foe standing. */
const REPLY_LEAST = handSet({
  name: "REPLY_LEAST", sort: "own",
  says: "The least a line must move the body, m, for the foe's reply to it to move the foe: below it the foe is taken to stand.",
  value: .01,
});

/** The blow coming where there is none; where the focus's fighting measured in bouts counts it already, for a body on its feet; where those bouts are read and the body lies, which they do not price; and where nothing is read of the limb it comes from (`Coming`). */
const NONE_COMING: Coming = Object.freeze({ life: 0, source: given("no blow is coming") });
const COUNTED: Coming = Object.freeze({ life: 0, source: given("the focus's fighting measured in bouts counts the blow coming") });
const UNCOUNTED: Coming = Object.freeze({ life: 0, source: notPriced("the bouts measured price a body on its feet, and nothing else prices the blow coming at one lying") });
const BLOW_UNREAD: Coming = Object.freeze({ life: 0, source: notPriced("nothing is read of the limb the blow comes from") });

/**
 * **The exchange as measured profiles predict it** (`ExchangePredictor`), built with its tables
 * (`ProfileTables`). The focus's pressure is its strikes' rate (`ratePressure`): the focus
 * throwing its strikes back to back from wherever it stands, each as its profile reads it. Where
 * the tables hold what bouts measured of a standing focus's body fighting this one
 * (`measuredAgainst`), the rate is read by that (`ProfilePressure.measured`), the focus doing as it is
 * now (`foePhase`): its moments carry how soon its blows came, so no grace is kept of it (its
 * latency none), and what a blow under way took, so the blow coming is priced at none beside it
 * (`danger`). A body lying is not priced by those bouts (`down`), so there the blow coming is
 * priced at none and is not priced by anything.
 */
export class ProfileExchange implements ExchangePredictor {
  private readonly tables: ProfileTables;
  /** What it guesses where nothing is measured; null where it guesses nothing. */
  private readonly guesses: Guesses | null;

  constructor({ guesses, ...tables }: ProfileTables & { readonly guesses: Guesses | null }) { this.tables = tables; this.guesses = guesses; }

  danger(seen: Seen): Coming {
    if (this.measuredAgainst(seen)) return !seen.blow ? NONE_COMING : seen.sight.view.down ? UNCOUNTED : COUNTED;
    return seen.blow ? this.coming(seen, seen.blow) : NONE_COMING;
  }

  pressure(seen: Seen): ProfilePressure {
    const focus = seen.focus;
    if (!focus) return NO_PRESSURE;
    const rate = this.ratePressure(seen, focus), table = this.measuredAgainst(seen);
    if (!table) return new ProfilePressure(rate, null);
    const reads = [...rate.reads, { what: "fighting, in bouts", source: tableSource(table)(focus.spec)(seen.spec) }];
    return new ProfilePressure({ ...rate, latency: 0, reads, source: weakestOf(reads), measured: { table, doing: foePhase(focus, seen.blow) } }, null);
  }

  /** What a second down costs in each posture (`downCostOf`) against the focus, and with none one of its own kind; each found once a posture. */
  down(seen: Seen): (posture: Position) => DownCost {
    const foe = seen.focus?.spec ?? seen.spec, costs = new Map<Position, DownCost>();
    return (posture) => {
      let cost = costs.get(posture);
      if (cost === undefined) costs.set(posture, cost = this.downCostOf(seen, foe, posture));
      return cost;
    };
  }

  /** The focus's measured turn (`turnOf`). */
  turns({ focus }: Seen): number { return focus ? turnOf(focus.spec) : Infinity; }

  /** A blow by the rules (`blowLife`). */
  blows({ focus, spec, rules }: Seen): (limb: string, segment: string, closing: number) => number {
    return (limb, segment, closing) => focus ? blowLife(rules, spec, limb, focus.spec, closing, segment) : 0;
  }

  /** The foe carried on its velocity for `seconds` s and stopped there. */
  later(foe: BodySense, seconds: number): BodySense {
    const v = foe.velocity;
    if (!(seconds > 0) || (v.x === 0 && v.z === 0)) return foe;
    const c = foe.centre;
    return Object.create(foe, { centre: { value: { x: c.x + v.x * seconds, y: c.y, z: c.z + v.z * seconds } }, velocity: { value: { x: 0, y: 0, z: 0 } } }) as BodySense;
  }

  /**
   * A foe that can do what the body's own lines do, roles swapped: the velocity that moves the
   * foe by the line's first step reversed (each way it ends by its chance, `Leaves.where`), over
   * that step's seconds; none where the line does not move the body (`REPLY_LEAST`).
   */
  reply(root: Situation, line: Terms): FoeMove | null {
    const from = root.where!;
    let x = 0, z = 0;
    for (const outcome of line.outcomes) { const where = outcome.leaves.where ?? from; x += outcome.chance * (where.x - from.x); z += outcome.chance * (where.z - from.z); }
    if (!(line.duration > 0) || hypot(x, z) < REPLY_LEAST) return null;
    return { x: -x / line.duration, z: -z / line.duration, seconds: line.duration };
  }

  /** What bouts measured of a standing focus's body fighting this one (`pressureTable`); null where its tables hold none. */
  private measuredAgainst(seen: Seen): PressureTable | null {
    const focus = seen.focus, pressures = this.tables.pressures;
    return pressures && focus && sensedPosture(focus) === "standing" ? pressureTable(pressures, focus.spec, seen.spec) : null;
  }

  /**
   * **The strikes a foe of `foe` is modelled by**: every one measured on its body, whatever its
   * character holds, which is not sensed (`profilesOn`, each skill's profiles with a limb one
   * strike, `strikesOf`; its pressure reads them pooled, `pooled`), else this body's own measured
   * (`ProfileTables.strikes`), each read by its profile against this body (`modelOf`), fresh at the
   * senses' reaction time and this mind's rate (`Seen.rate`: a foe's mind is taken for one like
   * it) and thrown with the limb it names (`Measured.limb`); and each other limb the foe strikes
   * with (`defaultStrikeLimbs`), left to its guess. A foe's strikes are not sensed, so its limbs
   * stand for them: a limb no measured strike throws is priced by hand while the others are
   * measured, or not priced where the Mind has no guesses (`standIn`). A foe with no strike
   * measured on its body is read throwing this body's own strikes: a rule picked those rows, not
   * the foe's numbers, and each such reading's source says so (`foundBy`).
   */
  private foeModel(seen: Seen, foe: BodySpec, postures: Postures): Model {
    const on = profilesOn(this.tables.measured, foe, { hz: seen.hz, reaction: reactionOf(seen), rate: seen.rate, delay: seen.delay });
    const strikes: readonly ModelledStrike[] = on.length ? strikesOf(on)
      : this.tables.strikes.filter((strike) => profileAgainst(strike.profiles, seen.spec) !== null);
    const thrown = new Set(strikes.flatMap((strike) => strike.limbs)), limbs = defaultStrikeLimbs(foe).filter((limb) => !thrown.has(limb));
    const model = modelOf(seen, { strikes: [...strikes, ...limbs.map((limb) => ({ name: limb, limbs: [limb], profiles: [] }))], striker: foe, struck: seen.spec, postures, guesses: this.guesses });
    return on.length ? model : { ...model, measured: model.measured.map((one) => ({ ...one, source: BY_RULE(one.source) })), reads: model.reads.map((read) => ({ what: read.what, source: BY_RULE(read.source) })) };
  }

  /**
   * **What makes the pressure `focus` puts on the body by its strikes' rate** (`PressureFields`):
   * its model read at the focus's posture (`sensedPosture`), pooled (`pooled`), the body struck
   * as standing.
   */
  private ratePressure(seen: Seen, focus: BodySense): PressureFields {
    const spec = seen.spec, posture = sensedPosture(focus), postures = { own: posture, target: "standing" };
    return { ...pressureBy(seen, { model: pooled(this.foeModel(seen, focus.spec, postures), focus.spec, postures), phase: ownPhase(seen), striker: focus.spec, struck: spec, placing: placingAt(posture), guesses: this.guesses }),
      stance: turned(carriedStances(spec, seen.sight.view, focus)) };
  }

  /**
   * **The own life `blow` is expected to take** (`Coming`): the most its striker's measured strikes
   * thrown with its limb (`foeModel`) are expected to take at the striker's range, the two bodies'
   * velocities (`startVelocity`) and this body's phase, to their reach (a blow predicted to reach
   * the head is in reach), from the source of the strike that takes the most, the first of them
   * where none takes any; with none, its guess where the Mind has guesses (`Guesses.blow`). No
   * life with neither, and that is not priced.
   */
  private coming(seen: Seen, blow: NonNullable<Seen["blow"]>): Coming {
    const { spec, sight } = seen;
    const centre = sight.view.stance.centre, foe = blow.foe, range = hypot(foe.centre.x - centre.x, foe.centre.z - centre.z), phase = ownPhase(seen);
    const own = sight.view.stance.velocity, velocity = startVelocity({ x: foe.centre.x - centre.x, z: foe.centre.z - centre.z }, { x: own.x - foe.velocity.x, z: own.z - foe.velocity.z });
    const measured = this.foeModel(seen, blow.foe.spec, STANDING).measured.filter((one) => one.limbs.includes(blow.limb));
    const guessed = measured.length ? null : this.guesses?.blow(seen, blow, range) ?? null, model = guessed ? [{ reading: guessed, source: guessed.source(spec) }] : measured;
    if (!model.length) return BLOW_UNREAD;
    let life = 0, source = model[0]!.source;
    const stance = turned(carriedStances(spec, sight.view, foe));
    for (const one of model) {
      const dealt = one.reading.expect({ range: Math.min(range, one.reading.reach(phase)), phase, velocity, stance }, spec)?.dealt ?? 0;
      if (dealt > life) source = one.source;
      life = Math.max(life, dealt);
    }
    return { life, source };
  }

  /**
   * **What a second costs the body down in `posture`**, own life, against a foe of `foe` as it is
   * (`sensedPosture`; standing with no focus), as the foe's pressure reads it: the blows of the foe
   * over it (`PressureFields.peak`: the foe's strikes read at its posture and a target lying in that
   * posture, in the phase down; a foe lying deals none by a guess, `placingAt`). What a second on its
   * feet brings is priced by the Options that begin there, as the search reaches them.
   */
  private downCostOf(seen: Seen, foe: BodySpec, posture: Position): DownCost {
    const foeAt = seen.focus ? sensedPosture(seen.focus) : "standing", postures = { own: foeAt, target: posture };
    const over = pressureBy(seen, { model: pooled(this.foeModel(seen, foe, postures), foe, postures), phase: "down", striker: foe, struck: seen.spec, placing: placingAt(foeAt) && "over", guesses: this.guesses });
    return { rate: over.peak, source: over.source };
  }
}
