import { deepFreeze } from "../../../../core/state.ts";
import { handSet } from "../../../../core/hand-set.ts";
import { hypot } from "../../../../core/math/real.ts";
import type { Followed, FollowedBy, Offered, Valued, ValuePredictor, ValueReader } from "../../contract/predictors.ts";
import { measuredFrom, type Side } from "../../../../skills/framework/profile/source.ts";
import { remembered } from "../../../../core/remembered.ts";
import type { Situation } from "../../contract/situation.ts";
import type { Terms } from "../../contract/terms.ts";
import { treesAt, validTrees, type Trees } from "./boosted-trees.ts";
import type { BodySpec } from "../../../../core/bodies/spec/body.ts";
import type { Origin } from "../../../../skills/framework/profile/profile.ts";

/**
 * **What a state is read as for a value fitted to what followed it** (`featuresOf`): how the two
 * stand and move, what each is doing, their lives, the reach's grace, and the Options on offer
 * there as their models price one try (`Offered`). Plain numbers and names, so a research script
 * reads a recorded state as the leaf reads one (`research/minds/fitted-value.mjs`).
 */
export interface Reading {
  readonly range: number;
  readonly apart: number;
  readonly down: boolean;
  readonly posture: string;
  readonly foePosture: string;
  readonly phase: string;
  readonly incoming: boolean;
  readonly ward: boolean;
  /** The seconds to contact, at most `LONGEST`. */
  readonly contact: number;
  readonly rising: boolean;
  readonly tumbled: number;
  readonly regained: number;
  readonly around: number;
  readonly lead: number;
  readonly lateness: number;
  readonly life: number;
  readonly foeLife: number;
  /** The seconds before the focus's pressure reaches the body (`graceAt`), at most `LONGEST`. */
  readonly grace: number;
  /** Its stance's stagger, width and height (`StanceNumbers`), and the focus's; zeros where unknown. */
  readonly stance: readonly [number, number, number];
  readonly foeStance: readonly [number, number, number];
  /** Over the ground: the body's velocity and the focus's, m/s; where each stands, m. */
  readonly velocity: readonly [number, number];
  readonly foeVelocity: readonly [number, number];
  readonly at: readonly [number, number];
  readonly foeAt: readonly [number, number];
  readonly offered: readonly Offered[];
}

/** The longest a reading's seconds are read, s: past it, as long; so a reading is finite throughout. */
const LONGEST = handSet({
  name: "LONGEST", sort: "own",
  says: "The longest a time is read as by the fitted value, s: a longer one reads as this long.",
  value: 5,
});

/** The farthest a distance is read as by the fitted value, m: past it, as far. */
const FARTHEST = handSet({
  name: "FARTHEST", sort: "own",
  says: "The farthest a distance is read as by the fitted value, m: a farther one reads as this far.",
  value: 8,
});

/**
 * How much more the life an Option deals counts than the life it takes, where the fitted value
 * ranks the Options on offer by what each trades a second. The value was fitted with it at the
 * aggression the Mind then had, and it does not follow the aggression a player sets.
 */
const TRADE = handSet({
  name: "TRADE", sort: "own",
  says: "How much more the life an Option deals counts than the life it takes, where the fitted value ranks the Options on offer.",
  value: 2,
});

/** `at` as it is read (`Reading`), `grace` its reach's (`graceAt`, read by the caller), `offered` its Options' models; null without a focus. */
export function readingAt(at: Situation, grace: number, offered: readonly Offered[]): Reading | null {
  const focus = at.focus;
  if (!focus) return null;
  const stance = (s: { readonly stagger: number; readonly width: number; readonly height: number } | null | undefined) => s ? [s.stagger, s.width, s.height] as const : [0, 0, 0] as const;
  return {
    range: at.range, apart: at.apart, down: at.down, posture: at.posture, foePosture: at.foePosture, phase: at.phase, incoming: !!at.incoming, ward: !!at.ward,
    contact: Math.min(at.contact, LONGEST), rising: !!at.rising, tumbled: at.tumbled, regained: at.regained, around: at.around, lead: at.lead, lateness: at.lateness,
    life: at.sight.view.senses.life, foeLife: focus.life, grace: Math.min(grace, LONGEST), stance: stance(at.stances?.own), foeStance: stance(at.stances?.target),
    velocity: [at.velocity.x, at.velocity.z], foeVelocity: [focus.velocity.x, focus.velocity.z], at: [at.where.x, at.where.z], foeAt: [focus.centre.x, focus.centre.z], offered,
  };
}

/** An Option's kind and its model at a state, as offered (`Offered`). */
export const offeredOf = (kind: string, open: boolean, terms: Terms): Offered => ({ kind, open, duration: terms.duration, dealt: terms.dealt, taken: terms.taken });

const PHASES = ["clear", "striking", "down", "rising"], POSTURES = ["standing", "between", "lying", "sitting", "kneeling"];
const code = (list: readonly string[], value: string) => { const i = list.indexOf(value); return i < 0 ? list.length : i; };
const finite = (x: number) => Number.isFinite(x) ? x : 0;

/** **The features a fitted value reads**, by name, in `featuresOf`'s order: what its asset is checked against. */
export const FEATURES = deepFreeze(["range", "apart", "closing", "across", "ownSpeed", "foeSpeed", "down", "posture", "foePosture", "phase", "striking",
  "incoming", "ward", "contact", "rising", "around", "life", "foeLife", "lead", "lateness", "ownStagger", "ownWidth", "ownHeight", "foeStagger", "foeWidth", "foeHeight",
  "bestRate", "bestStrikeDealt", "bestStrikeRate", "bestWalkRate", "offers", "strikeOffers", "openTakenMax", "runTakenMin", "runTakenMax",
  "bestStrikeDur", "bestRateDur", "tumbled", "regained", "grace"]);

/**
 * **A reading as numbers** (`FEATURES`): the two's closing and crossing speeds along the line
 * between them, and of the Options on offer that run (not open) the best rate of 2 dealt less taken
 * a second, of any and of strikes and walks, the strike that deals most, and the least and most a run
 * one takes; ranges past 8 m read as 8.
 */
export function featuresOf(r: Reading): number[] {
  const dx = r.foeAt[0] - r.at[0], dz = r.foeAt[1] - r.at[1], d = hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
  const rvx = r.velocity[0] - r.foeVelocity[0], rvz = r.velocity[1] - r.foeVelocity[1];
  let bestRate = -Infinity, bestRateDur = 0, bestStrikeDealt = 0, bestStrikeRate = -Infinity, bestStrikeDur = 0, bestWalkRate = -Infinity;
  let strikes = 0, openTakenMax = 0, runTakenMin = Infinity, runTakenMax = 0;
  for (const { kind, open, duration, dealt, taken } of r.offered) {
    if (kind === "strike") strikes++;
    if (open) { openTakenMax = Math.max(openTakenMax, taken); continue; }
    if (!(duration > 0)) continue;
    const rate = (TRADE * dealt - taken) / duration;
    if (rate > bestRate) { bestRate = rate; bestRateDur = duration; }
    runTakenMin = Math.min(runTakenMin, taken); runTakenMax = Math.max(runTakenMax, taken);
    if (kind === "strike") { if (dealt > bestStrikeDealt) { bestStrikeDealt = dealt; bestStrikeDur = duration; } bestStrikeRate = Math.max(bestStrikeRate, rate); }
    if (kind === "walk") bestWalkRate = Math.max(bestWalkRate, rate);
  }
  return [Math.min(r.range, FARTHEST), Math.min(r.apart, FARTHEST), rvx * ux + rvz * uz, Math.abs(-rvx * uz + rvz * ux), hypot(...r.velocity), hypot(...r.foeVelocity),
    r.down ? 1 : 0, code(POSTURES, r.posture), code(POSTURES, r.foePosture), code(PHASES, r.phase), r.phase === "striking" ? 1 : 0,
    r.incoming ? 1 : 0, r.ward ? 1 : 0, r.contact, r.rising ? 1 : 0, r.around, r.life, r.foeLife, r.lead, r.lateness, ...r.stance, ...r.foeStance,
    finite(bestRate), bestStrikeDealt, finite(bestStrikeRate), finite(bestWalkRate), r.offered.length, strikes, openTakenMax, finite(runTakenMin), runTakenMax,
    bestStrikeDur, bestRateDur, r.tumbled, r.regained, r.grace];
}

/**
 * **A value fitted to what followed a state** (`assets/minds/fitted-value.json`, made by
 * `research/minds/fitted-value.mjs`): for each of its horizons, s, boosted regression trees over
 * `FEATURES` that read the life a body dealt and the life it took over that many seconds after it,
 * each its own (`Followed`), so its objective prices them as it prices a path (`Trees`).
 */
export interface FittedValue {
  readonly origin: string;
  /** The Minds that played the bouts it was fitted to (`Origin.minds`), where its tool wrote them. */
  readonly from?: Origin;
  /** The bodies its bouts played, each its model and what it held (`bodyOf`): it reads a state between two of them alone (`fittedOn`). */
  readonly bodies: readonly string[];
  readonly features: readonly string[];
  readonly horizons: readonly number[];
  readonly models: readonly { readonly dealt: Trees; readonly taken: Trees }[];
}

/** Whether `bodies` names bodies (`FittedValue.bodies`). */
const validBodies = (bodies: unknown): boolean => Array.isArray(bodies) && bodies.every((body) => typeof body === "string");

/** **A body as a fitted model names it**: its model, and what it holds by name where it holds anything ("man", "man holding sword"). */
export const bodyOf = (spec: Pick<BodySpec, "model" | "held">): string =>
  spec.held?.length ? `${spec.model} holding ${spec.held.map((held) => held.item.name).sort().join(" and ")}` : spec.model;

/**
 * **Whether a model fitted on `bodies`' bouts reads a search** for the body `own` (`bodyOf`)
 * against `focus`: both bodies it was fitted on. Elsewhere what it reads was never seen.
 */
export const fittedOn = (bodies: readonly string[], own: string, focus: Situation["focus"]): boolean =>
  !!focus && bodies.includes(own) && bodies.includes(bodyOf(focus.spec));

/** Whether `value` is a fitted value over today's `FEATURES`, its horizons rising and dealt and taken fitted at each. */
const validFitted = (value: unknown): value is FittedValue => {
  const v = value as FittedValue | null;
  return !!v && typeof v === "object" && validBodies(v.bodies) && Array.isArray(v.features) && v.features.length === FEATURES.length && v.features.every((name, i) => name === FEATURES[i])
    && Array.isArray(v.horizons) && v.horizons.length > 0 && v.horizons.every((h, i) => Number.isFinite(h) && h > (v.horizons[i - 1] ?? 0))
    && Array.isArray(v.models) && v.models.length === v.horizons.length && v.models.every((m) => validTrees(m?.dealt) && validTrees(m?.taken));
};

/** A horizon's dealt and taken at features `x`, by `share`. */
const fittedAt = (model: FittedValue["models"][number], x: readonly number[], share: number): Followed =>
  ({ dealt: share * treesAt(model.dealt, x), taken: share * treesAt(model.taken, x) });

/**
 * **What `value` reads followed features `x` over `seconds`**: nothing over none; within its
 * first horizon that horizon's by the share of it; between two, the two weighed by where it falls;
 * past the last, the last's.
 */
export function fittedOver(value: FittedValue, x: readonly number[], seconds: number): Followed {
  if (!(seconds > 0)) return { dealt: 0, taken: 0 };
  const { horizons, models } = value, k = horizons.findIndex((h) => h >= seconds);
  if (k === 0) return fittedAt(models[0]!, x, seconds / horizons[0]!);
  if (k < 0) return fittedAt(models[models.length - 1]!, x, 1);
  const a = horizons[k - 1]!, b = horizons[k]!, t = (seconds - a) / (b - a), low = fittedAt(models[k - 1]!, x, 1 - t), high = fittedAt(models[k]!, x, t);
  return { dealt: low.dealt + high.dealt, taken: low.taken + high.taken };
}

/**
 * **What `value` reads followed features `x` by each of its horizons short of `seconds`, and by
 * `seconds`** (`fittedOver`), rising: what it tells apart of when the life comes. None over none.
 */
export function fittedBy(value: FittedValue, x: readonly number[], seconds: number): FollowedBy[] {
  const read: FollowedBy[] = [];
  for (const by of value.horizons) if (by < seconds) read.push({ by, ...fittedOver(value, x, by) });
  if (seconds > 0) read.push({ by: seconds, ...fittedOver(value, x, seconds) });
  return read;
}

/**
 * **A fitted value as a search asks it** (`ValuePredictor`), for the body `body` (`bodyOf`):
 * `value` read at a state as its features (`readingAt`, `featuresOf`) over the seconds asked
 * (`fittedBy`). It has a reader for a search whose body and focus are both bodies it was
 * fitted on (`fittedOn`), and no reading of a state without a focus. An error where `value` is
 * no fitted value over today's features (`validFitted`).
 */
export function fittedValue(value: unknown, body: string): ValuePredictor {
  if (!validFitted(value)) throw new Error("fitted-value: not a value over today's features");
  const read: ValueReader = (at, grace, offered, seconds) => {
    const reading = readingAt(at, grace, offered);
    return reading ? fittedBy(value, featuresOf(reading), seconds) : null;
  };
  // Each body was found by its name among those the value was fitted on, in bouts of the two together.
  const side = (name: string): Side => ({ own: true, of: name, by: "name", gaps: [] });
  /** What it gives a search against a foe of the body `foe` (`bodyOf`); made once a foe's body. */
  const against = remembered((foe: string): Valued => ({ read, source: measuredFrom({ body: side(body), target: side(foe), pairing: true }) }));
  return { from: (root) => root.focus && fittedOn(value.bodies, body, root.focus) ? against(bodyOf(root.focus.spec)) : null };
}
