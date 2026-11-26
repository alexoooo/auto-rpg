import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import type { Position } from "../../../control/ground-reading.ts";
import { deepFreeze } from "../../../core/state.ts";
import { landed } from "../../../skills/framework/action-instances.ts";
import type { Ended } from "../../../skills/framework/action.ts";
import { regionSegments } from "../../../skills/framework/action-aim.ts";
import { readProfile, type ProfileReading } from "../../../skills/framework/profile/reading.ts";
import type { GuessedWay, Guesses, Prior } from "../contract/predictors.ts";
import type { Situation } from "../contract/situation.ts";
import { blowLife, limbReach } from "./damage.ts";
import { REGAIN_TRY } from "../situation/rise-memory.ts";

/**
 * **Every number set by hand that prices something an Option Mind predicts.** There are two sorts.
 *
 * A guess stands in where a measurement is missing: a strike with no profile, a foe's limb with
 * none, a blow coming from such a limb, a way up no drill measured. The guesses are behind one
 * interface (`Guesses`), and a Mind has them only where its predictions part gives them (`BY_HAND`).
 *
 * A number read always has no measurement to fall back from yet: the clinch, the cover, where a
 * fall leaves the body, the brace, how fast a foe with no turn measured turns. Each is a plain
 * export below, read by every kind of predictions.
 */

// The guesses.

/** What an action is taken to do before its body has a record of it: land this share of its blows, each running this long, s; worth `weight` records. */
const PRIOR = Object.freeze({ lands: .3, seconds: .6, weight: 3 });

/**
 * What a body's own record says of an action of its with its limbs, or of every action with none
 * named, from its ledger: the share of its tries at a body that landed, and how long one ran, s;
 * each with its prior (`PRIOR`), so that the first tries move it and none leaves it the prior. A
 * try is a blow committed, or one its executor gave up on by itself (`stalled`), which landed nothing.
 */
export function record(ledger: readonly Ended[], action: { readonly name: string; readonly effectors: readonly string[] } | null): { readonly lands: number; readonly seconds: number } {
  let tries = 0, hits = 0, seconds = 0;
  for (const ended of ledger) {
    if (action !== null && (ended.action !== action.name || !action.effectors.includes(ended.effector))) continue;
    if (!ended.committed && ended.ending.kind !== "stalled" || ended.target.kind !== "body") continue;
    tries += 1; seconds += ended.ended - ended.began;
    if (landed(ended)) hits += 1;
  }
  return { lands: (hits + PRIOR.lands * PRIOR.weight) / (tries + PRIOR.weight), seconds: (seconds + PRIOR.seconds * PRIOR.weight) / (tries + PRIOR.weight) };
}

/**
 * For a foe no strike models: the chance a foe's blow predicted to reach the head lands (`LANDS`);
 * and how many blows a second a standing foe throws within its reach (`RATE`), of which as many
 * land as of the body's own (`record`): two bodies trading blows land alike.
 */
const LANDS = .3, RATE = 1;

/** How fast a limb closes on what it strikes in a blow not under way to measure, m/s. */
const BLOW_SPEED = 5;

/** What a guessed reading is made of: the striker's spec and the struck body's, the range it reaches to, m, and the share of the struck body's life it takes every so many seconds. */
interface Guessed { readonly striker: BodySpec; readonly struck: BodySpec; readonly range: number; readonly life: number; readonly seconds: number }

/** Each reading made by `reading`, by its striker's spec, the struck body's, its range, its life and its seconds. A cache: a reading is made of these alone, and a spec never changes. */
const READINGS = new WeakMap<BodySpec, WeakMap<BodySpec, Map<number, Map<number, Map<number, ProfileReading>>>>>();

/**
 * **A guessed strike as a reading**: what a strike of `striker` is taken to bring before a drill
 * measures it, a profile of one trial read like any measured one (`readProfile`): within `range` m
 * centre to centre, in any phase and at any velocity, `life` of `struck`'s life every `seconds` s,
 * its whole cycle (it records no recovery, `Trial.recovers`). Made anew at each call.
 */
const readingOf = ({ striker, struck, range, life, seconds }: Guessed): ProfileReading =>
  readProfile({ measured: { body: striker.model, stature: striker.stature.value, skill: "by hand", hz: 0, reaction: null },
    trials: [{ start: { range, phase: "clear" }, done: true, dealt: life * struck.wounds.hp.value, taken: 0, seconds, recovers: null, down: false }] }, striker);

/**
 * A guessed strike as a reading (`readingOf`), made once for what it is made of: a caller's
 * numbers come from a few (a limb's reach, a share of its record's blows). A -0 is read as given,
 * since a key takes it for 0.
 */
function reading(guessed: Guessed): ProfileReading {
  const { striker, struck, range, life, seconds } = guessed;
  if (Object.is(range, -0) || Object.is(life, -0) || Object.is(seconds, -0)) return readingOf(guessed);
  let byStruck = READINGS.get(striker);
  if (!byStruck) READINGS.set(striker, byStruck = new WeakMap());
  let byRange = byStruck.get(struck);
  if (!byRange) byStruck.set(struck, byRange = new Map());
  let byLife = byRange.get(range);
  if (!byLife) byRange.set(range, byLife = new Map());
  let bySeconds = byLife.get(life);
  if (!bySeconds) byLife.set(life, bySeconds = new Map());
  let made = bySeconds.get(seconds);
  if (!made) bySeconds.set(seconds, made = readingOf(guessed));
  return made;
}

/** What each of the ground's Options is taken to do where no drill measured it: a way up runs 5 s and stands the body seven times in ten; the regain stands a body on its feet ready in its try (`REGAIN_TRY`) nine times in ten; a brace holds a quarter second until a way up admits the body, after which one does. */
const WAYS: Readonly<Record<GuessedWay, Prior>> = deepFreeze({
  way: { seconds: 5, done: .7 }, regain: { seconds: REGAIN_TRY, done: .9 }, settle: { seconds: .25, done: 1 },
});

/**
 * **The guesses, set by hand** (`Guesses`).
 *
 * A strike: `throws` blows from its stronger limb at the segment its region strikes
 * (`Predictions.blows` at `BLOW_SPEED`), each landing as often as its record says (`record`, of its action with its
 * limbs), as long as its record says it runs; and down as often as a clinch takes it down in the
 * time it has left (`clinched`).
 *
 * A limb: within its reach (`limbReach`) or over the struck body, `RATE` blows a second, landing
 * as this body's own do (`record`), each that limb's blow (`blowLife` at `BLOW_SPEED`).
 *
 * A blow coming: its energy at the speed it closes, landing as often as `LANDS`.
 *
 * A way up, a regain or a brace: `WAYS`.
 */
export const BY_HAND: Guesses = Object.freeze<Guesses>({
  strike(at, { action, throws, target }, progress) {
    const { lands, seconds } = record(at.sight.report.ledger, action);
    const aimed = target(at), segment = aimed?.kind === "body" && at.focus ? regionSegments(at.focus.spec, aimed.region)[0] : undefined;
    const struck = segment ?? at.focus?.spec.marks.high ?? "";
    let blow = -Infinity;
    for (let i = 0; i < action.effectors.length; i++) blow = Math.max(blow, at.predictions.blows(action.effectors[i]!, struck, BLOW_SPEED));
    return { done: lands, dealt: throws * lands * blow, taken: 0, seconds, recovers: 0, down: clinched(at, Math.max(0, seconds - progress)), ends: [] };
  },
  limb(seen, { striker, struck, limb, placing }) {
    const lands = record(seen.sight.report.ledger, null).lands;
    return reading({ striker, struck, range: placing === "over" ? 0 : limbReach(striker, limb), life: lands * blowLife(seen.rules, striker, limb, struck, BLOW_SPEED), seconds: 1 / RATE });
  },
  blow: (seen, blow, range) => readingOf({ striker: blow.foe.spec, struck: seen.spec, range, life: LANDS * blowLife(seen.rules, blow.foe.spec, blow.limb, seen.spec, blow.closing), seconds: 1 }),
  way: (kind) => WAYS[kind],
});

/** **How what no measurement prices is priced**, the words a `priced` sentence begins with: by hand where the Mind has `guesses`, else not at all. */
export const pricedBy = (guesses: Guesses | null): string => guesses ? "by hand" : "not measured here";

// The numbers read always.

/**
 * A clinch, until a drill measures one: a focus within `within` m, centre to centre, where a body
 * goes down `falls` times a second, standing (tangled with it) or lying (its limbs underfoot).
 */
export const CLINCH = deepFreeze({ within: .65, falls: .2 });

/** The chance of going down in `seconds` s of a clinch, if the body is in one `apart` m centre to centre from the focus (as it stands at `now` unless given). */
export const clinched = (now: Situation, seconds: number, apart = now.apart): number => now.focus && apart < CLINCH.within ? Math.min(1, CLINCH.falls * seconds) : 0;

/** The share of a blow's life on the head a cover keeps off. */
export const STOPS = .6;

/** Where a fall leaves the body where nothing measured where it comes to rest: on its back. */
export const FALLEN: Position = "back";

/** What a brace saves a tumbling body, s: its first second tumbling, before a way up is begun on it moving. */
export const BRACED = 1;

/** How fast a foe with no turn measured on its body is taken to turn to face, rad/s: at once, so going round it is worth nothing. */
export const UNMEASURED_TURN = Infinity;
