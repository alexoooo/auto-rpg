import type { Choice, Status } from "../../core/mind/choice.ts";
import { WHOLE } from "../../core/mind/choice.ts";
import type { OfferTerms } from "../../core/mind/engagement.ts";
import type { SubMind } from "../../core/mind/sub-mind.ts";
import type { OptionPart } from "../../core/option/parts.ts";
import { record } from "../../core/option/value.ts";
import type { KeysOf, PartConfig } from "../../core/parts/parts.ts";
import { STAND_TRAVEL } from "../../core/reptile/crawl.ts";
import type { BiteSelection, QuadrupedLayers } from "../../core/reptile/layers.ts";
import { fitsJaw, fitsPaws, type QuadrupedIntent, type QuadrupedSight } from "../../core/reptile/parts.ts";
import { REPTILE_BITE, REPTILE_TROT } from "../../core/reptile/tuning.ts";
import type { Decider } from "../../core/mind/decider.ts";
import type { Rulebook } from "../../core/rules/rulebook.ts";
import type { Readiness } from "../../core/skills/framework/action.ts";
import type { BodySpec } from "../../core/spec/body.ts";
import { deepFreeze } from "../../core/state.ts";
import { priorRate, type ReptileSituation } from "./situation.ts";

/**
 * **What an option asks in a step**: an intent for the body's layers (`QuadrupedLayers.act`) and
 * the foe's part its bite aims at; or, with no intent, that the righting has the body.
 */
export interface ReptileAsk {
  readonly intent: QuadrupedIntent | null;
  readonly selection: BiteSelection;
}

/**
 * **An Option Reptile's option**: a skill of its body applied to its focus, a choice of the
 * toolkit's set selection (`Choice`, `selectSet`), with its model (`OfferTerms`: its duration, what
 * it deals and takes, the orders it carries out and where it leaves the body) and its step.
 */
export interface ReptileOption extends Choice<ReptileSituation> {
  model(now: ReptileSituation): OfferTerms;
  step(now: ReptileSituation, dt: number): ReptileAsk;
}

/**
 * **What the Option Reptile gives each kind of its options** to make them from: its body's spec,
 * the fight's rules, its layers, its stalk (the quadruped's tactics, which approach, creep and bite
 * at the first exposed surface, and carry out a person's orders), its righting, the limb it bites
 * with (`strikersOf`) and its bite's window (`biteWindow`).
 */
export interface ReptileGiven {
  readonly spec: BodySpec;
  readonly limb: string;
  readonly rules: Rulebook;
  readonly layers: QuadrupedLayers;
  readonly stalk: Decider<QuadrupedSight, QuadrupedIntent> & { readonly state: { pending: number; phase: unknown; target: { foe: string; part: string; tooth: string } | null } };
  readonly righting: SubMind;
  readonly window: number;
}

/** **A kind of the Option Reptile's options** (`OptionPart`): made from what it gives (`ReptileGiven`). */
export type ReptileOptionPart<C extends PartConfig = PartConfig> = OptionPart<C, ReptileGiven, ReptileOption>;

/** What the legs hold, and what the legs and jaw hold. */
const LEGS = Object.freeze(["legs"]), LEGS_AND_JAW = Object.freeze(["legs", "jaw"]);

/** An entry that admits, and one that does not for `reason`. */
const READY: Readiness = Object.freeze({ kind: "ready" });
const blocked = (reason: string): Readiness => Object.freeze({ kind: "blocked", reason });
const DOWN = blocked("down"), NO_FOCUS = blocked("no foe"), FAR = blocked("out of the bite's window"), NEAR = blocked("within the bite's window"),
  NO_ORDERS = blocked("no orders"), UP = blocked("on its paws");

/** No foe's part aimed at. */
const NO_SELECTION: BiteSelection = null;

/** The seconds the righting is taken to run before a drill measures it, the owner's decision: a roll, the paws placed and the rise. */
const RIGHTING_SECONDS = 3;

/** How far a bite under way keeps its window, as a share of it beyond: it is not let go as the foe shifts. */
const KEPT = 2;

/** Where an option that does not move the body leaves it: as it stands, on its paws. */
const standing = (now: ReptileSituation) => ({ range: now.range, down: 0 });

/** The focus's direction across the ground from the body's centre, or null with none. */
function toward(now: ReptileSituation): { readonly x: number; readonly z: number } | null {
  if (!now.focus) return null;
  const dx = now.focus.centre.x - now.view.centre.x, dz = now.focus.centre.z - now.view.centre.z, far = Math.sqrt(dx * dx + dz * dz);
  return far > 0 ? { x: dx / far, z: dz / far } : null;
}

/** A kind of option with no settings of its own, `kind`, labelled `label`, fitting a body by `fits`, made by `make`. */
function kind<K extends string>(kind: K, label: string, fits: ReptileOptionPart["fits"], make: (given: ReptileGiven) => readonly ReptileOption[]): ReptileOptionPart<{ readonly kind: K }> {
  return deepFreeze({ role: "option", label, stage: "game", fields: [], slots: [], defaults: { kind }, keys: { kind: true } as KeysOf<{ readonly kind: K }>,
    fits, faults: () => [], make: (_config: { readonly kind: K }, given: ReptileGiven) => make(given) });
}

/**
 * **Crawl to the focus**: on its gaits, straight at the focus, until its nearest surface is within
 * the bite's window; slowing as it closes, as the stalk does (`REPTILE_BITE.approach`, `braking`).
 * Worth where it leaves the body, in the window.
 */
function crawl(given: ReptileGiven): ReptileOption {
  const state = {};
  const gap = (now: ReptileSituation) => Math.max(0, now.range - given.window);
  return {
    name: "crawl", state, claims: LEGS,
    entry: (now) => now.down ? DOWN : !now.focus ? NO_FOCUS : now.range <= given.window ? NEAR : READY,
    status: (): Status => "yields",
    begin() {}, end() {},
    model: (now) => {
      const duration = gap(now) / REPTILE_TROT.speed;
      return { duration, dealt: 0, taken: now.pressure * duration, orders: 0, exit: { range: given.window, down: 0 } };
    },
    step(now) {
      const way = toward(now), left = gap(now);
      const speed = Math.min(1, left / REPTILE_BITE.approach, Math.sqrt(2 * REPTILE_BITE.braking * left) / REPTILE_TROT.speed);
      return { intent: { move: way ? { x: way.x * speed, z: way.z * speed } : null, face: way, biteAt: null, prepareBite: false, creep: false, travel: true }, selection: NO_SELECTION };
    },
  };
}

/** The stalk's memory forgotten: no target, nothing pending. */
const forget = (given: ReptileGiven): void => { const memory = given.stalk.state; memory.target = null; memory.pending = 0; memory.phase = null; };

/** The stalk's step: its intent, and the foe's part it bites at. */
const stalked = (given: ReptileGiven, dt: number): ReptileAsk => {
  const intent = given.stalk.decide({ view: given.layers.view, bite: given.layers.bite.state.cycle }, dt);
  return { intent, selection: given.stalk.state.target };
};

/**
 * **Bite the focus**: the stalk (the quadruped's tactics) in the bite's window, creeping in and
 * biting at the first exposed surface; kept within twice its window once begun, and committed while
 * the jaw is in its stroke. Its blow is priced by the prior (`priorRate`) at the focus's legs, where
 * a reptile's mouth meets a standing body.
 */
function bite(given: ReptileGiven): ReptileOption {
  const state = { running: false };
  const cycle = given.layers.bite.state.cycle;
  return {
    name: "bite", state, claims: LEGS_AND_JAW,
    entry: (now) => now.down ? DOWN : !now.focus ? NO_FOCUS : now.range <= given.window * (state.running ? KEPT : 1) ? READY : FAR,
    status: (): Status => cycle.phase === "swing" || cycle.phase === "return" ? "committed" : "yields",
    begin() { state.running = true; forget(given); },
    end() { state.running = false; },
    model: (now) => {
      const seconds = record([], null).seconds, focus = now.focus;
      const dealt = focus ? priorRate(given.rules, given.spec, given.limb, focus.spec, focus.spec.marks.legs[0]) * seconds : 0;
      return { duration: seconds, dealt, taken: now.pressure * seconds, orders: 0, exit: standing(now) };
    },
    step: (_now, dt) => stalked(given, dt),
  };
}

/**
 * **Carry out the orders** a person gives: the stalk, which walks where they send the body by its
 * navigation and bites only the foe they name. On offer while they ask a move or a facing.
 */
function orders(given: ReptileGiven): ReptileOption {
  const state = {};
  return {
    name: "orders", state, claims: LEGS_AND_JAW,
    entry: (now) => now.down ? DOWN : now.orders && (now.orders.move || now.orders.face) ? READY : NO_ORDERS,
    status: (): Status => "yields",
    begin() { forget(given); }, end() {},
    model: (now) => ({ duration: 1, dealt: 0, taken: now.pressure, orders: 1, exit: standing(now) }),
    step: (_now, dt) => stalked(given, dt),
  };
}

/**
 * **Right itself**: down, the righting (`recover`) has the body, rolling it over, placing its paws
 * and rising; committed until it hands the body back. Priced by hand until a drill measures it
 * (`RIGHTING_SECONDS`), leaving the body on its paws.
 */
function righting(given: ReptileGiven): ReptileOption {
  const state = {};
  return {
    name: "righting", state, claims: WHOLE,
    entry: (now) => given.righting.wants(now.view.senses) ? READY : UP,
    status: (): Status => "committed",
    begin() {}, end() {},
    model: (now) => ({ duration: RIGHTING_SECONDS, dealt: 0, taken: now.pressure * RIGHTING_SECONDS, orders: 0, exit: { range: now.range, down: 0 } }),
    step: () => ({ intent: null, selection: NO_SELECTION }),
  };
}

/** **Hold the position**, facing the focus: a rest option, worth nothing, on its paws. */
function hold(): ReptileOption {
  const state = {};
  return {
    name: "hold", state, claims: LEGS, rest: true,
    entry: (now) => now.down ? DOWN : READY,
    status: (): Status => "yields",
    begin() {}, end() {},
    model: (now) => ({ duration: 0, dealt: 0, taken: 0, orders: 0, exit: standing(now) }),
    step: (now) => ({ intent: { ...STAND_TRAVEL, face: toward(now), biteAt: null, prepareBite: false, creep: false, travel: false }, selection: NO_SELECTION }),
  };
}

export const CRAWL_OPTION = kind("option-reptile:crawl", "Crawl to the foe", fitsPaws, (given) => [crawl(given)]);
export const BITE_OPTION = kind("option-reptile:bite", "Bite", fitsJaw, (given) => [bite(given)]);
export const ORDERS_OPTION = kind("option-reptile:orders", "Follow orders", fitsPaws, (given) => [orders(given)]);
export const RIGHTING_OPTION = kind("option-reptile:righting", "Right itself", fitsPaws, (given) => [righting(given)]);
export const HOLD_OPTION = kind("option-reptile:hold", "Hold the position", fitsPaws, () => [hold()]);

/** Its options as it starts, in rank order: orders, the bite, the crawl, righting itself, then holding the position. */
export const REPTILE_OPTIONS: readonly PartConfig[] = deepFreeze([ORDERS_OPTION, BITE_OPTION, CRAWL_OPTION, RIGHTING_OPTION, HOLD_OPTION].map((part) => part.defaults));
