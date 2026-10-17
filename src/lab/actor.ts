import { createBody, type Body, type BodyOptions } from "../core/body.ts";
import type { BuiltBody } from "../core/build/build-body.ts";
import type { AssistCeiling } from "../core/control/assist.ts";
import type { StanceTuning } from "../core/control/stance-tuning.ts";
import { treeFaults } from "../core/mind/catalog.ts";
import type { FighterConfig } from "../core/mind/config.ts";
import { driveFighter, fighterBody } from "../core/mind/fighter.ts";
import type { MindWiring } from "../core/mind/minds.ts";
import { clockSenses } from "../core/mind/senses.ts";
import type { Sight, Tactics } from "../core/mind/tactics.ts";
import type { RecipeOptions, Skills } from "../core/skills/skills.ts";
import { heldIn } from "../core/skills/strikes.ts";
import type { World } from "../core/world.ts";
import type { Side } from "../core/spec/body.ts";
import { supportRecovery } from "../core/mind/rise/support-recovery.ts";
import type { Recipe } from "../core/mind/rise/stages.ts";
import { LAB_PRESETS } from "./scenarios.ts";

/** A mode's instrument: it reads what the mind sees, before the mind decides, and changes nothing. */
type Watch = (sight: Sight, dt: number) => void;

/** A mode's orders and senses, or its script, and optional instruments. */
interface Driving {
  readonly orders?: MindWiring["orders"];
  readonly senses?: MindWiring["senses"];
  readonly contactIdentity?: MindWiring["contactIdentity"];
  /** What its recipe strike and guard are made with, in place of their defaults: their `tuning` in the mind's config. */
  readonly skills?: RecipeOptions;
  /** Read each step, whatever the mind is. */
  readonly watch?: Watch;
}

/**
 * **A lab body and what drives it.** Every mode stands its body through an actor, so what a page
 * or an experiment gives a body is given here, and a mode knows none of it. Its mind is a fighter's
 * config (`ActorOptions.mind`), carrying out game orders or a mode's script. A mode takes its
 * actor over: it disposes it with itself.
 */
export interface Actor {
  readonly body: Body;
  readonly world: World;
  /** Whether each hand may attack: what it holds is not barred (`ActorOptions.allows`). A mode asks no strike of a hand that may not. */
  readonly strikes: Readonly<Record<Side, boolean>>;
  /** Hand the body to its mind with orders and senses, or a scenario script. Returns the skills for their report. */
  drive(script?: Tactics, driving?: Driving): Skills;
  /** The skills its mind last drove it with (`drive`), for their report; null before it is driven. */
  readonly skills: Skills | null;
  dispose(): void;
}

interface ActorOptions {
  /** An explicit experiment's pre-created sub-minds, in place of the selected fighter's. */
  readonly subs?: BodyOptions["subs"];
  /** A Lab experiment's immutable recovery recipe in place of the mind's recovery choices. */
  readonly recoveryRecipe?: Recipe;
  /** Its mind: the script on the game's recipe skills, lying still once down (`LAB_PRESETS.script`), unless given. */
  readonly mind?: FighterConfig;
  /** The most its assist gives it (`balanceCeiling`); none unless given. */
  readonly assist?: AssistCeiling;
  /** An experiment's stance tuning in place of the stance's constants. */
  readonly stance?: StanceTuning;
  /** A body being measured (`BodyOptions.measuring`): no envelope caps its walk or turn. */
  readonly measuring?: boolean;
  /** Whether its motor control is the whole-body solve (`MindWiring.solve`); the bearing solve's unless given. */
  readonly solve?: boolean;
  /**
   * What its mind may strike with, by what a hand holds (`heldIn`); anything unless given. A hand
   * that holds what is barred guards, whatever its mind asks of it.
   */
  readonly allows?: (held: string) => boolean;
  /** What reads the mind's tactics as they decide, in their place: a page's log (`logged`, `mind-log.ts`). */
  readonly around?: (tactics: Tactics) => Tactics;
}

/**
 * `tactics` in all but what they decide, which is `decide`'s to say. Everything else of theirs is
 * read through to them, and none of it is the result's own: a spread of it copies nothing.
 */
export function deciding<T extends Tactics>(tactics: T, decide: Tactics["decide"]): T {
  return Object.create(tactics, { decide: { value: decide } }) as T;
}

/** `tactics`, read by `watch` each step before they decide. */
function watched(tactics: Tactics, watch: Watch): Tactics {
  return deciding(tactics, (sight, dt) => { watch(sight, dt); return tactics.decide(sight, dt); });
}

/** `tactics`, each hand that may not strike (`strikes`) holding the guard's pose, and attacking nothing. */
function barred(tactics: Tactics, strikes: Readonly<Record<Side, boolean>>): Tactics {
  if (strikes.left && strikes.right) return tactics;
  return deciding(tactics, (sight, dt) => {
    const intent = tactics.decide(sight, dt), { guard, actions } = intent;
    return { ...intent, guard: { left: strikes.left ? guard.left : null, right: strikes.right ? guard.right : null },
      actions: actions.filter(action => action.effector !== "hand.left" || strikes.left).filter(action => action.effector !== "hand.right" || strikes.right) };
  });
}

/**
 * `config` with a mode's recipe options (`skills`) as its parts' `tuning`: the cover the guard's,
 * the rest the recipe strike's, where its blow is the recipe strike.
 */
function tuned(config: FighterConfig, skills: RecipeOptions | undefined): FighterConfig {
  if (!skills) return config;
  const { cover, ...strike } = skills;
  return {
    ...config,
    guard: cover === undefined ? config.guard : { ...config.guard, tuning: { ...config.guard.tuning, covering: cover } },
    executors: config.executors.map(executor => executor.kind === "recipe-strike" && Object.keys(strike).length > 0
      ? { ...executor, tuning: { ...executor.tuning, ...strike } } : executor),
  };
}

/** `built`, a human in its reference pose on the ground of `world`, as a mode's actor; a mind with a fault in its tree (`treeFaults`, given a script) is refused. */
export function labActor(built: BuiltBody, world: World, { mind = LAB_PRESETS.script.config, assist, stance, measuring, solve, allows = () => true, around = (tactics) => tactics, recoveryRecipe, subs }: ActorOptions = {}): Actor {
  const fault = treeFaults(mind, ["script"])[0];
  if (fault) throw new Error(fault);
  let input: Driving = {};
  const clock = clockSenses(world);
  const wiring: MindWiring = { name: "lab", orders: (senses) => input.orders?.(senses) ?? null, assist, solve,
    senses: () => (input.senses ?? clock)(), contactIdentity: (other) => input.contactIdentity?.(other) ?? null };
  const body = createBody(built, world, { ...fighterBody(mind, wiring), stance, measuring,
    ...(recoveryRecipe ? { subs: [(own, view, into) => supportRecovery(own, view, into, recoveryRecipe)] } : {}), ...(subs ? { subs } : {}) });
  const strikes = { left: allows(heldIn(built.spec, "left")), right: allows(heldIn(built.spec, "right")) };
  let driven: Skills | null = null;
  return {
    body, world, strikes,
    drive(script, driving = {}) {
      input = driving;
      const { skills, watch } = driving;
      return driven = driveFighter(body, world, tuned(mind, skills), { ...wiring, script }, (tactics) => {
        const made = barred(around(tactics), strikes);
        return watch ? watched(made, watch) : made;
      });
    },
    get skills() { return driven; },
    dispose: () => body.dispose(),
  };
}
