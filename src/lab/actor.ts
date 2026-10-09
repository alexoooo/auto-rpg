import { createBody, type Body } from "../core/body.ts";
import type { BuiltBody } from "../core/build/build-body.ts";
import type { AssistCeiling } from "../core/control/assist.ts";
import type { StanceTuning } from "../core/control/stance-tuning.ts";
import { treeFaults } from "../core/mind/catalog.ts";
import type { FighterConfig } from "../core/mind/config.ts";
import { driveFighter, fighterBody } from "../core/mind/fighter.ts";
import type { MindWiring } from "../core/mind/minds.ts";
import type { Sight, Tactics } from "../core/mind/tactics.ts";
import type { RecipeOptions, Skills } from "../core/skills/skills.ts";
import { heldIn } from "../core/skills/strikes.ts";
import type { World } from "../core/world.ts";
import type { Side } from "../core/spec/body.ts";
import { LAB_PRESETS } from "./scenarios.ts";

/** A mode's instrument: it reads what the mind sees, before the mind decides, and changes nothing. */
type Watch = (sight: Sight, dt: number) => void;

/** What a mode drives its body with, beside its script. */
interface Driving {
  /** What its recipe strike and guard are made with, in place of their defaults: their `tuning` in the mind's config. */
  readonly skills?: RecipeOptions;
  /** Read each step, whatever the mind is. */
  readonly watch?: Watch;
}

/**
 * **A lab body and what drives it.** Every mode stands its body through an actor, so what a page
 * or an experiment gives a body is given here, and a mode knows none of it. Its mind is a fighter's
 * config (`ActorOptions.mind`), whose scripted tactics carry out a mode's script. A mode takes its
 * actor over: it disposes it with itself.
 */
export interface Actor {
  readonly body: Body;
  readonly world: World;
  /** Whether each hand may attack: what it holds is not barred (`ActorOptions.allows`). A mode asks no strike of a hand that may not. */
  readonly strikes: Readonly<Record<Side, boolean>>;
  /** Hand the body to its mind, given `script`, a mode's, to carry out (`MindWiring.script`). Returns the skills, for their report. */
  drive(script: Tactics, driving?: Driving): Skills;
  /** The skills its mind last drove it with (`drive`), for their report; null before it is driven. */
  readonly skills: Skills | null;
  dispose(): void;
}

interface ActorOptions {
  /** Its mind: the script on the game's recipe skills, lying still once down (`LAB_PRESETS.script`), unless given. */
  readonly mind?: FighterConfig;
  /** The most its assist gives it (`balanceCeiling`); none unless given. */
  readonly assist?: AssistCeiling;
  /** An experiment's stance tuning in place of the stance's constants. */
  readonly stance?: StanceTuning;
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
    const intent = tactics.decide(sight, dt), { guard, attack } = intent;
    return { ...intent, guard: { left: strikes.left ? guard.left : null, right: strikes.right ? guard.right : null },
      attack: attack?.kind === "blow" && !strikes[attack.hand] ? null : attack };
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
    blow: config.blow?.kind === "recipe-strike" && Object.keys(strike).length > 0 ? { ...config.blow, tuning: { ...config.blow.tuning, ...strike } } : config.blow,
  };
}

/** `built`, a human in its reference pose on the ground of `world`, as a mode's actor; a mind with a fault in its tree (`treeFaults`, given a script) is refused. */
export function labActor(built: BuiltBody, world: World, { mind = LAB_PRESETS.script.config, assist, stance, allows = () => true, around = (tactics) => tactics }: ActorOptions = {}): Actor {
  const fault = treeFaults(mind, ["script"])[0];
  if (fault) throw new Error(fault);
  const wiring: MindWiring = { name: "lab", orders: () => null, assist };
  const body = createBody(built, world, { ...fighterBody(mind, wiring), stance });
  const strikes = { left: allows(heldIn(built.spec, "left")), right: allows(heldIn(built.spec, "right")) };
  let driven: Skills | null = null;
  return {
    body, world, strikes,
    drive(script, { skills, watch } = {}) {
      return driven = driveFighter(body, world, tuned(mind, skills), { ...wiring, script }, (tactics) => {
        const made = barred(around(tactics), strikes);
        return watch ? watched(made, watch) : made;
      });
    },
    get skills() { return driven; },
    dispose: () => body.dispose(),
  };
}
