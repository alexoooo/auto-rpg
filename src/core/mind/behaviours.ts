import { commandable } from "../body.ts";
import { hypot } from "../math/real.ts";
import type { BodySpec } from "../spec/body.ts";
import { deepFreeze } from "../state.ts";
import { clearMove } from "./clear-step.ts";
import type { BehaviourConfig } from "./config.ts";
import { choice, number } from "./fields.ts";
import { NO_COVER, type Attack, type Cover, type Intent } from "./intent.ts";
import { kickTactics } from "./kick-tactics.ts";
import { guarding, orderedIntent } from "./ordered.ts";
import type { Orders } from "./orders.ts";
import type { Part } from "./parts.ts";
import { recipeTactics, seekFoe } from "./recipe-tactics.ts";
import { bodyClearance } from "./sensed-bounds.ts";
import type { Abilities, Sight, Tactics } from "./tactics.ts";
import { nearestFoe } from "./targets.ts";
import { THREAT } from "./threat.ts";

/**
 * **What a behaviour wants of the body** this step, by channel: the legs (the walk, the facing and
 * how low), the attack, and what each hand covers. A channel it leaves out is the next behaviour's.
 */
interface Wants {
  readonly legs?: Pick<Intent, "move" | "face" | "lower">;
  readonly attack?: Attack;
  readonly left?: Cover | null;
  readonly right?: Cover | null;
}

/** Which channels a behaviour ranked higher has this step. */
interface Taken { legs: boolean; attack: boolean }

/** **A behaviour**: what it wants each step, given what is `taken` already, or null for nothing; and its memory. */
interface Behaviour {
  want(sight: Sight, dt: number, taken: Readonly<Taken>): Wants | null;
  readonly state?: object;
}

/**
 * Walking clear of the solids: how far past the body's own clearance it keeps from them, m, and
 * how far ahead it looks along its walk, m: the opening tactics' boundary margin and escape probe
 * (`COMBAT` in `path-tactics.ts`).
 */
const CLEAR = Object.freeze({ margin: 0.08, ahead: 0.6 });

/** How far either side of its distance a behaviour that holds one stands still, m, so that it does not walk in and out by turns. */
const DISTANCE_BAND = 0.1;

/**
 * **Tactics made of behaviours** (`BehavioursConfig`): each control step every behaviour of `list`
 * is asked, in rank order, and the first that wants a channel has it. A behaviour is asked even
 * where every channel is had, so that what it remembers stays current. What no behaviour wants
 * stands in guard: no walk, facing as the body faces, each hand in the guard's pose, no attack.
 */
export function behavioursTactics(name: string, list: readonly Behaviour[]): Tactics {
  const state = { list: list.map((behaviour) => behaviour.state ?? null) };
  return {
    name, state,
    decide(sight, dt): Intent {
      let legs: Wants["legs"], attack: Attack | undefined, left: Cover | null | undefined, right: Cover | null | undefined;
      const taken: Taken = { legs: false, attack: false };
      for (const behaviour of list) {
        const wants = behaviour.want(sight, dt, taken);
        if (!wants) continue;
        legs ??= wants.legs; attack ??= wants.attack;
        if (left === undefined) left = wants.left;
        if (right === undefined) right = wants.right;
        taken.legs = legs !== undefined; taken.attack = attack !== undefined;
      }
      return { move: legs?.move ?? null, face: legs?.face ?? sight.report.heading, ...(legs?.lower === undefined ? {} : { lower: legs.lower }),
        guard: { left: left ?? null, right: right ?? null }, attack: attack ?? null };
    },
  };
}

/** The legs `intent` asks for, its walk kept clear of the solids a body of clearance `radius` senses (`clearMove`). */
function clearLegs({ view, report }: Sight, intent: Intent, radius: number): Wants["legs"] {
  return { move: clearMove(view.stance.centre, view.senses.solids, report.heading, intent.move, radius, CLEAR.ahead), face: intent.face };
}

/** Carry out a person's orders while there are any, by the recipe tactics: their walk, their facing and their attack. */
function followOrders(name: string, orders: (sight: Sight) => Orders | null): Behaviour {
  let given: Orders | null = null;
  const carry = recipeTactics(name, () => given!);
  return {
    state: carry.state,
    want(sight, dt) {
      given = orders(sight);
      if (!given) return null;
      const intent = carry.decide(sight, dt);
      return { legs: { move: intent.move, face: intent.face }, ...(intent.attack ? { attack: intent.attack } : {}) };
    },
  };
}

/** Walk away from the nearest standing foe, facing the walk, around what is in the way. */
function flee(spec: BodySpec): Behaviour {
  const radius = bodyClearance(spec) + CLEAR.margin;
  return {
    want(sight) {
      const c = sight.view.stance.centre, foe = nearestFoe(sight.view.senses, c, "standing");
      if (!foe) return null;
      return { legs: clearLegs(sight, orderedIntent(sight, { move: { x: c.x - foe.centre.x, z: c.z - foe.centre.z }, face: null }, NO_COVER), radius) };
    },
  };
}

/**
 * Hold `metres` from the nearest standing foe, centre of mass to centre of mass across the ground:
 * walk in, facing the walk, from further; where it may `back`, back away facing the foe from
 * nearer; and otherwise stand facing it. Either side of `metres` by `DISTANCE_BAND` it stands.
 */
function distance(spec: BodySpec, metres: number, back: boolean): Behaviour {
  const radius = bodyClearance(spec) + CLEAR.margin;
  return {
    want(sight) {
      const c = sight.view.stance.centre, foe = nearestFoe(sight.view.senses, c, "standing");
      if (!foe) return null;
      const d = Math.max(0.001, hypot(foe.centre.x - c.x, foe.centre.z - c.z));
      const toward = { x: (foe.centre.x - c.x) / d, z: (foe.centre.z - c.z) / d };
      const given = d > metres + DISTANCE_BAND ? { move: toward, face: null }
        : back && d < metres - DISTANCE_BAND ? { move: { x: -toward.x, z: -toward.z }, face: toward }
        : { move: null, face: toward };
      return { legs: clearLegs(sight, orderedIntent(sight, given, NO_COVER), radius) };
    },
  };
}

/**
 * Strike the nearest foe with the blow by the seeking tactics (`seekFoe`, walking in), with the hand
 * `hands` names or each in turn: the attack and the legs while it attacks, the walk in before.
 */
function strike(name: string, config: Extract<BehaviourConfig, { kind: "strike" }>): Behaviour {
  const tactics = recipeTactics(name, (sight) => seekFoe(sight, config.aim, "close"), undefined, "pose", THREAT, config.hands);
  return {
    ...(tactics.state ? { state: tactics.state } : {}),
    want(sight, dt) {
      const intent = tactics.decide(sight, dt);
      const legs = { move: intent.move, face: intent.face };
      return intent.attack ? { legs, attack: intent.attack } : intent.move ? { legs } : null;
    },
  };
}

/**
 * How near a foe a kick behaviour steps to where it can kick, m, centre of mass to centre of mass
 * across the ground: past the kick's own reach (`KICK_SELECTION.ahead` in `kick-tactics.ts`, from
 * the sole) by a step, so that from further a behaviour ranked after it walks the body in.
 */
const KICK_NEAR = 1.2;

/**
 * Kick the nearest standing foe's legs with the kick, as the opening tactics' kick does
 * (`kickTactics`): a kick under way, or one admitted, or, within `KICK_NEAR`, the slow step to
 * where one can be. A higher-ranked attack holds it back.
 */
function kick(abilities: Abilities, config: Extract<BehaviourConfig, { kind: "kick" }>): Behaviour {
  if (!abilities.kick) throw new Error("a kick behaviour needs a kick skill");
  const kicks = kickTactics(abilities.kick, config.feet);
  return {
    state: kicks.state,
    want(sight, dt, taken) {
      const c = sight.view.stance.centre, foe = nearestFoe(sight.view.senses, c, "standing");
      const near = foe !== null && hypot(foe.centre.x - c.x, foe.centre.z - c.z) <= KICK_NEAR;
      const going = kicks.during(sight, taken.attack) ?? (near ? kicks.after(sight, dt, "kick", taken.attack) : null);
      if (!going) return null;
      const { intent } = going;
      return { legs: { move: intent.move, face: intent.face }, ...(intent.attack ? { attack: intent.attack } : {}) };
    },
  };
}

/** Each hand covers as `guard` says (`guarding`): a hand an attack has does not guard. */
function cover(config: Extract<BehaviourConfig, { kind: "cover" }>): Behaviour {
  const rest = guarding(config.guard, THREAT);
  return { want(sight) { const covers = rest(sight); return { left: covers, right: covers }; } };
}

/**
 * **The behaviour `config` names**, for a body of `spec` (its name `name`) whose skills can do what
 * `abilities` says, carrying out `orders` where it follows them.
 */
export function behaviourOf(config: BehaviourConfig, spec: BodySpec, name: string, abilities: Abilities, orders: (sight: Sight) => Orders | null): Behaviour {
  switch (config.kind) {
    case "follow-orders": return followOrders(name, orders);
    case "flee": return flee(spec);
    case "close-in": return distance(spec, config.metres, false);
    case "keep-distance": return distance(spec, config.metres, true);
    case "strike": return strike(name, config);
    case "kick": return kick(abilities, config);
    case "cover": return cover(config);
    default: { const never: never = config; throw new Error(`no behaviour of kind ${JSON.stringify((never as { kind?: unknown }).kind)}`); }
  }
}

/** What is wrong with a distance of `metres`. */
const metresFaults = ({ metres }: { readonly metres: number }): readonly string[] => Number.isFinite(metres) && metres >= 0 ? [] : ["a distance must be finite and not negative"];

/** A behaviour part: its label, the config it starts from, its settings and what is wrong with one. */
const behaviour = <C extends BehaviourConfig>(label: string, defaults: C, fields: Part<C>["fields"] = [], faults: (config: C) => readonly string[] = () => []): Part<C> =>
  ({ role: "behaviour", label, stage: "game", fields, slots: [], defaults, fits: commandable, faults });

type Of<K extends BehaviourConfig["kind"]> = Extract<BehaviourConfig, { kind: K }>;

/** **Every behaviour, by its kind** (`Part`): what the behaviours tactics' list holds. */
export const BEHAVIOUR_PARTS: { readonly [K in BehaviourConfig["kind"]]: Part<Of<K>> } = deepFreeze({
  "follow-orders": behaviour<Of<"follow-orders">>("Follow orders", { kind: "follow-orders" }),
  flee: behaviour<Of<"flee">>("Run away", { kind: "flee" }),
  "close-in": behaviour<Of<"close-in">>("Close in", { kind: "close-in", metres: 0.6 },
    [number<Of<"close-in">, "metres">("metres", "To within", 0, 5, 0.1, "m")], metresFaults),
  "keep-distance": behaviour<Of<"keep-distance">>("Keep a distance", { kind: "keep-distance", metres: 2.5 },
    [number<Of<"keep-distance">, "metres">("metres", "Distance", 0, 10, 0.1, "m")], metresFaults),
  strike: behaviour<Of<"strike">>("Strike", { kind: "strike", hands: "alternate", aim: "head" }, [
    choice<Of<"strike">, "hands">("hands", "Hands", [["alternate", "Both in turn"], ["right", "Right"], ["left", "Left"]]),
    choice<Of<"strike">, "aim">("aim", "Aim", [["head", "The head"], ["pays", "What pays"]]),
  ]),
  kick: behaviour<Of<"kick">>("Kick", { kind: "kick", feet: "alternate" },
    [choice<Of<"kick">, "feet">("feet", "Feet", [["alternate", "Both in turn"], ["right", "Right"], ["left", "Left"]])]),
  cover: behaviour<Of<"cover">>("Guard", { kind: "cover", guard: "cover" },
    [choice<Of<"cover">, "guard">("guard", "Guard", [["cover", "Cover the threat"], ["pose", "Hold the pose"]])]),
});
