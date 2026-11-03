import type { AssistCeiling } from "../control/assist.ts";
import { CONTACT_STIFFNESS } from "../human/tables/contact-stiffness.ts";
import { derive, si, sourced, type Quantity } from "../spec/quantity.ts";

/**
 * **The fight rules, in one immutable object per mode**: what wounds, what severs, what kills and
 * how a fight ends. A rule reads its numbers from here and nowhere else, and every number says
 * where it came from, as a spec's do. An experiment passes an override
 * in and gets a new rulebook; nothing mutates one.
 *
 * The arena and the dungeon use the same rules (the owner: "The dungeon and the arena use the same
 * rule"); the mode is named so that a rule that comes to differ has a place.
 */
type Mode = "arena" | "dungeon";

/**
 * How a blow wounds: something blunt arriving (a club, a fist), an edge drawn (a sword), an axe's
 * short edge, each with its own price, and a point going in (a sword's tip, a bite), which wounds
 * by its depth (`pointWound`) or its press (`pointLoadDamage`). Which one a contact is comes from
 * its physical surface; a club is `blunt`, a forward tooth is `point`.
 */
export type Mechanism = "blunt" | "edge" | "axe" | "point";

/** The mechanisms priced by the joule (`Rulebook.worth`): all but the point. */
export type Priced = Exclude<Mechanism, "point">;
const PRICED: readonly Priced[] = Object.freeze(["blunt", "edge", "axe"]);

/** The groups a body's segments are in (`WoundSpec`): vital, a limb, or the trunk. */
export type PartGroup = "vital" | "trunk" | "limb";

export interface Rulebook {
  readonly mode: Mode;
  /** **What a blow costs the body's life**, by the struck part's group: the life it takes over its damage (`src/core/rules/pool.ts`). */
  readonly life: Readonly<Record<PartGroup, Quantity<number>>>;
  /** **A cut that takes off a limb**: an edge's or an axe's damage at least this share of the limb's full bar, with the bar left empty. */
  readonly severBlow: Quantity<number>;
  /** **What a cut costs**, a share of the body's full life, beside what the blow took. */
  readonly severLoss: Quantity<number>;
  /** **What a point through a part takes**, a share of the body's full life (`pointWound`), before the part's group's factor. */
  readonly through: Quantity<number>;
  /**
   * **The damage unit**: the energy of a blunt blow worth one hit point, joules. It is a round
   * number, the owner's (`owner-damage-unit`); the Warrior's strongest one-handed blow with the
   * wooden club is a measurement beside it (`CLUB_BEST`), worth 1.38.
   */
  readonly unit: Quantity<number>;
  /**
   * What each mechanism's joule is worth against a blunt one: the blunt price over its own
   * (`MECHANISM_PRICE`), so every weapon keeps its ratio to the club. An edge's is 5.7.
   */
  readonly worth: Readonly<Record<Priced, Quantity<number>>>;
  /**
   * **The fist's threshold**, J: the joules of its share a bare hand or foot meeting a body's own
   * surface takes no wound from; it is wounded by the rest. Against an item it takes its whole share.
   * A foot has the hand's (`owner-foot-threshold`).
   */
  readonly fist: Quantity<number>;
  /**
   * **What lies over every part, outermost first** (the skin today): each layer states the energy
   * that breaches it, J, for each mechanism it stops. A point breaches them in turn and meets as
   * blunt from the first it does not breach (`pointWound`).
   */
  readonly layers: readonly Layer[];
  /** **The force a point goes in against** past the layers, N, the same in every part (`pointWound`). */
  readonly resistance: Quantity<number>;
  /** Piercing injury from normal impulse above a load threshold, N and HP/(N s), shared by every surface. */
  readonly pointLoad: { readonly threshold: Quantity<number>; readonly rate: Quantity<number> };
  /**
   * **What a per cent of balance is** (`AttributeSpec.balance`): the most an assist gives a
   * body for each per cent, a force in the body's own weights, which is a hundredth by the
   * meaning of a per cent, and the moment that goes with it, in its weights times a metre. What
   * each does to how bouts end: `docs/reference/assist.md`.
   */
  readonly balance: { readonly force: Quantity<number>; readonly moment: Quantity<number> };
  /**
   * **Reaction time**, s: how late a mind sees every other body (`createSenses`); its own body at
   * once. The same for both sides, converted to steps at the world's rate (`reactionSteps`).
   */
  readonly reaction: Quantity<number>;
}

/** A layer over the parts: its name and the energy that breaches it, J, for each mechanism it stops. */
export interface Layer {
  readonly name: string;
  readonly breach: Readonly<Partial<Record<Mechanism, Quantity<number>>>>;
}

/** What an experiment may set in place of a mode's rules. */
export type RulebookOverride = Partial<Omit<Rulebook, "mode">>;

/**
 * Each mechanism's price, joules per point of wound: the prices whose ratios the owner keeps
 * (`owner-weapon-ratios`).
 * Only their ratios to the blunt price are read; the unit sets the scale.
 */
const MECHANISM_PRICE: Readonly<Record<Priced, Quantity<number>>> = Object.freeze({
  blunt: sourced(1134.99, "J", "owner-weapon-ratios", "blunt 1134.99 (crushJoulesPerDamage)"),
  edge: sourced(197.96, "J", "owner-weapon-ratios", "an edge 197.96 (cutJoulesPerDamage)"),
  axe: sourced(147.45, "J", "owner-weapon-ratios", "an axe's edge 147.45 (chopJoulesPerDamage)"),
});

/** The Warrior's strongest one-handed blow with the wooden club, J: a blow to price things against. */
export const CLUB_BEST = sourced(138.23, "J", "core-club-unit", "the best blow at 1920 Hz, mean of 8 throws: 138.23 J");

/** A knuckle's load with an even chance of injury, N. */
const KNUCKLE_INJURY = sourced(3.0, "kN", "carpanen-2019", "abstract, the metacarpophalangeal joints' axial force at 50 % risk");

const RULES: Omit<Rulebook, "mode"> = Object.freeze({
  life: Object.freeze({
    vital: sourced(2, "1", "owner-life", "a blow on a vital part takes twice its damage from life"),
    trunk: sourced(1, "1", "owner-life", "a blow on the trunk takes its damage from life"),
    limb: sourced(0.5, "1", "owner-life", "a blow on a limb takes half its damage from life"),
  }),
  severBlow: sourced(0.5, "1", "owner-life", "a cut worth half a limb's bar that empties it takes the limb off"),
  severLoss: sourced(0.15, "1", "owner-life", "a cut costs 0.15 of full life"),
  through: sourced(0.25, "1", "owner-life", "a point through a part takes a quarter of full life"),
  unit: sourced(100, "J/HP", "owner-damage-unit", "one hit point is 100 J of blunt blow"),
  fist: derive("J", "the energy a hand stores loaded to a knuckle's injury, F^2 / 2k on the hand's stiffness, all of it the threshold",
    [si(KNUCKLE_INJURY), si(CONTACT_STIFFNESS.hand), sourced(1, "1", "owner-fist-threshold", "the whole of it")],
    (force, stiffness, whole) => whole * force * force / (2 * stiffness)),
  worth: Object.freeze(Object.fromEntries(PRICED.map((mechanism) => [mechanism,
    derive("1", "the blunt price over this mechanism's", [MECHANISM_PRICE.blunt, MECHANISM_PRICE[mechanism]], (blunt, own) => blunt / own)],
  )) as Record<Priced, Quantity<number>>),
  layers: Object.freeze([Object.freeze({ name: "skin", breach: Object.freeze({
    point: sourced(.25, "J", "gilchrist-2008", "the energy for a knife to penetrate the skin simulant, approximately 0.25 J (0.17 to 0.56 J)") }) })]),
  resistance: sourced(20, "N", "gilchrist-2008", "the force for a knife to penetrate the skin simulant, in the order of 20 N (18 to 36 N): "
    + "past the skin the tissue resists no more (negligible, Knight 1975, as Horsfall et al. 1999 read it)"),
  pointLoad: Object.freeze({
    threshold: sourced(1, "N", "owner-point-load", "the shared minimum piercing load"),
    rate: sourced(.2, "HP/(N s)", "owner-point-load", "shared calibration for the 30 s reptile injury target"),
  }),
  balance: Object.freeze({
    force: sourced(0.01, "1", "owner-balance", "a per cent of the body's weight"),
    moment: sourced(0.0026, "m", "owner-balance", "and 0.0026 weight-metres with each per cent"),
  }),
  reaction: sourced(0.15, "s", "owner-reaction-time", "every other body seen 0.15 s late"),
});

/** A reaction time of `seconds` in whole steps of a world stepping `hz` times a second, the nearest. */
export function reactionSteps(seconds: number, hz: number): number {
  if (!(seconds >= 0) || !Number.isFinite(seconds)) throw new Error(`a reaction time is finite seconds >= 0, not ${seconds}`);
  return Math.round(seconds * hz);
}

/**
 * **What a blow is worth**, hit points: its energy (`impactEnergy` in `src/core/rules/impact.ts`)
 * in the rulebook's unit, times what its mechanism's joule is worth. Every blow is priced; the
 * floors under which a blow only shoves come with the edges that need them.
 */
export function blowDamage(rules: Rulebook, mechanism: Priced, energy: number): number {
  if (!(energy >= 0) || !Number.isFinite(energy)) throw new Error(`a blow's energy is a finite joules >= 0, not ${energy}`);
  return energy * rules.worth[mechanism].value / rules.unit.value;
}

/**
 * **What a blow takes from one of its sides**, hit points: the share of its `energy` that side
 * stores (`energyShares`, `src/core/rules/share.ts`), less what it spares (`fist`, for a bare hand
 * or foot meeting a body's own surface), priced at the `mechanism` it meets (`blowDamage`); none for no
 * share.
 */
export function sideDamage(rules: Rulebook, mechanism: Priced, energy: number, share: number, spared: number): number {
  return share > 0 ? blowDamage(rules, mechanism, Math.max(0, share * energy - spared)) : 0;
}

/**
 * **How deep a point goes and what it wounds** (`owner-point-depth`): its side's share of the
 * blow, `energy` J, breaches the layers (`Rulebook.layers`) in turn; past them it goes in against
 * the tissue's resistance (`Rulebook.resistance`) as deep as the energy left drives it, no deeper
 * than the point's own `length`, m, and does the rules' share (`Rulebook.through`) of the body's
 * full life `life`, HP, in proportion to that depth over the part's `thickness`, m, all of it for
 * a point through. Stopped by a layer, it meets as blunt with the energy that reached it
 * (`blowDamage`).
 */
export function pointWound(rules: Rulebook, energy: number, length: number, thickness: number, life: number):
  { readonly kind: "pierced"; readonly depth: number; readonly damage: number } | { readonly kind: "stopped"; readonly layer: string; readonly damage: number } {
  if (!(energy >= 0) || !Number.isFinite(energy)) throw new Error(`a point's energy is a finite joules >= 0, not ${energy}`);
  if (!(length > 0 && Number.isFinite(length) && thickness > 0 && Number.isFinite(thickness) && life >= 0 && Number.isFinite(life))) throw new Error("a point wound needs a positive length and thickness and a finite life");
  let left = energy;
  for (const layer of rules.layers) {
    const breach = layer.breach.point?.value ?? 0;
    if (left < breach) return { kind: "stopped", layer: layer.name, damage: blowDamage(rules, "blunt", left) };
    left -= breach;
  }
  const depth = Math.min(length, left / rules.resistance.value);
  return { kind: "pierced", depth, damage: rules.through.value * life * Math.min(1, depth / thickness) };
}

/** Piercing injury, HP, from the interval's summed aligned normal impulse, N s. */
export function pointLoadDamage(rules: Rulebook, impulse: number, seconds: number): number {
  if (!(impulse >= 0) || !Number.isFinite(impulse) || !(seconds > 0) || !Number.isFinite(seconds)) throw new Error("a point load needs finite nonnegative impulse and positive duration");
  return rules.pointLoad.rate.value * Math.max(0, impulse - rules.pointLoad.threshold.value * seconds);
}

/** What a per cent of balance is under `rules`, as a ceiling. */
export function balancePercent(rules: Rulebook): AssistCeiling {
  return { force: rules.balance.force.value, moment: rules.balance.moment.value };
}

/** A balance is a finite per cent, none or more. */
export function isBalance(balance: number): boolean {
  return Number.isFinite(balance) && balance >= 0;
}

/** The balance `text` writes, per cent: plain decimal digits with nothing about them but spaces; null for anything else. */
export function balanceFrom(text: string): number | null {
  const balance = /^\d+(\.\d+)?$/.test(text.trim()) ? Number(text) : NaN;
  return isBalance(balance) ? balance : null;
}

/** The most an assist gives a body whose balance is `balance` per cent of its weight, each per cent being `percent`. */
export function balanceCeiling(balance: number, percent: AssistCeiling): AssistCeiling {
  if (!isBalance(balance)) throw new Error(`a balance is a finite per cent >= 0, not ${balance}`);
  return { force: balance * percent.force, moment: balance * percent.moment };
}

/** The rules of `mode`, with `override` in place of any of them. */
export function rulebook(mode: Mode, override: RulebookOverride = {}): Rulebook {
  const load = override.pointLoad ?? RULES.pointLoad;
  if (load.threshold.unit !== "N" || load.rate.unit !== "HP/(N s)"
    || !Number.isFinite(load.threshold.value) || load.threshold.value < 0
    || !Number.isFinite(load.rate.value) || load.rate.value < 0) throw new Error("point-load rules need finite nonnegative N and HP/(N s)");
  const pointLoad = Object.freeze({ threshold: Object.freeze({ ...load.threshold }), rate: Object.freeze({ ...load.rate }) });
  const resistance = override.resistance ?? RULES.resistance, layers = override.layers ?? RULES.layers;
  if (resistance.unit !== "N" || !(resistance.value > 0 && Number.isFinite(resistance.value))) throw new Error("a point's resistance is a finite N over 0");
  if (!layers.every((layer) => Object.values(layer.breach).every((q) => q !== undefined && q.unit === "J" && q.value >= 0 && Number.isFinite(q.value)))) throw new Error("a layer's breach is finite J, none or more");
  switch (mode) {
    case "arena":
    case "dungeon":
      return Object.freeze({ ...RULES, ...override, pointLoad, mode });
    default: {
      const never: never = mode;
      throw new Error(`no rulebook for ${String(never)}`);
    }
  }
}
