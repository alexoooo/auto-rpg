import type { KickReport } from "./kick.ts";
import type { SupportReport } from "./support-fold.ts";
import type { Body, BodyCommand, BodyView } from "../body.ts";
import type { Intent } from "../mind/intent.ts";
import type { Tactics } from "../mind/tactics.ts";
import { skillSet, type Holders, type SkillParts } from "./arbiter.ts";
import { guardPosture, guardSkill, type Covering } from "./guard.ts";
import { locomotion } from "./locomotion.ts";
import type { Skill } from "./skill.ts";
import { recipeStrike, type Placed, type StrikeReport } from "./strike.ts";
import { REPERTOIRE, type Repertoire } from "./strikes.ts";

/**
 * **The skills**: the one place the tactics' intent (`src/core/mind/intent.ts`) becomes the command a
 * body takes (`BodyCommand`, `src/core/body.ts`). The tactics state every part's action at once; the
 * skills decide which of them has the body's parts and how each is carried out, and report back
 * (`SkillReport`), which the tactics read the next step. Motor control, under them, coordinates the
 * physics: the stance balances whatever the arms and trunk do.
 *
 * - **Locomotion** (`locomotion.ts`): the walk and the facing, within the body's envelope.
 * - **Strike** (`strike.ts`): a hand's attack, thrown with the recipe for what it holds
 *   (`strikes.ts`) or placed, its point carried to the target by a hand goal. It outranks the
 *   walk: while it works it has the legs, and the tactics' walk waits.
 * - **Guard** (`guard.ts`): the arms' posture when nothing owns them (`guardPosture`), and a guarding hand's
 *   cover of what its tactics name. It has the hands the strike has not.
 *
 * A bare hand closes into its fist for its blow and opens in the guard (`closesToStrike`), in both.
 *
 * Every skill answers `Skill.resume`, and the skills tell every one of them from one list: a
 * skill added to it cannot be left out. One arbiter gives the body's parts to the skills of a set,
 * one a role (`skillSet`, `arbiter.ts`): a fighter's are the skills its slots name
 * (`src/core/mind/fighter.ts`); the recipe strike's usual set is here (`recipeParts`), the path
 * strike's on the strike cycle (`pathParts`, `combat.ts`).
 */
export interface Skills extends Skill {
  /** The command for this control step. */
  command(view: BodyView, intent: Intent, dt: number): BodyCommand;
  readonly report: SkillReport;
  /**
   * Their memory (`src/core/state.ts`): the one command they write again each step, which the
   * body's state shares; the legs' and the strike's; and their tactics' (`Tactics.state`), or null.
   */
  readonly state: object;
  /** What they do when a sub-mind takes the body (`Body.drive`); nothing unless given. */
  readonly release?: (view: BodyView) => void;
}

/** How the skills are going, as the last command left them. */
export interface SkillReport {
  /** The heading the stance is asked to face, rad about up. */
  readonly heading: number;
  /** The walk's speed asked, m/s (0 standing). */
  readonly pace: number;
  /** The centre of mass's standing height over the soles, m, read on the first step; null before. */
  readonly reference: number | null;
  readonly strike: StrikeReport;
  readonly engagement?: { readonly phase: string };
  readonly support?: SupportReport;
  readonly kick?: KickReport;
  /** Which skill had each part of the body (`skillSet`). */
  readonly holders?: Holders;
}

/** An experiment's recipe skills, in place of the ones set. */
export interface RecipeOptions {
  /** An experiment's strikes in place of the searched repertoire (`REPERTOIRE`): a search's candidate. */
  readonly repertoire?: Repertoire;
  /** An experiment's placed blow in place of the one set (`PLACED`): a sweep's cell. */
  readonly placed?: Placed;
  /** An experiment's most a blow turns the pelvis in place of the one set (`STEER`): a sweep's cell. */
  readonly steer?: number;
  /** An experiment's cover in place of the one set (`GUARD_COVER`): a sweep's cell. */
  readonly cover?: Covering;
}

/** The recipe strike's usual skills of `body`: the walk, the recipe strike (`recipeStrike`) and the guard. */
export function recipeParts(body: Body, { repertoire = REPERTOIRE, placed, steer, cover }: RecipeOptions = {}): SkillParts {
  const spec = body.built.spec;
  return { legs: locomotion(body.envelope), guard: guardSkill(spec, cover), blow: recipeStrike(spec, repertoire, placed, steer, guardPosture(spec)) };
}

/** The recipe strike's usual skill set of `body` (`recipeParts`), which `tactics` will hand their intent. */
export const recipeSkills = (body: Body, tactics: Pick<Tactics, "state" | "engagement"> = {}, options: RecipeOptions = {}): Skills =>
  skillSet(body, tactics, recipeParts(body, options));
