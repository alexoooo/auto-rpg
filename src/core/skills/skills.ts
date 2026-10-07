import type { KickReport, KickTuning } from "./kick.ts";
import type { SupportReport } from "./support-fold.ts";
import { combatSkills, type CombatExecution } from "./combat.ts";
import type { AttackTuning } from "./attack-path.ts";
import type { Body, BodyCommand, BodyView } from "../body.ts";
import type { Intent } from "../mind/intent.ts";
import type { EffectorGoal, MusclePush } from "../control/motor.ts";
import { GUARD, guardSkill, type Covering } from "./guard.ts";
import { locomotion, type TurnStartup } from "./locomotion.ts";
import type { Skill } from "./skill.ts";
import { strikeSkill, type Placed, type StrikeReport } from "./strike.ts";
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
 * - **Guard** (`guard.ts`): the arms' posture when nothing owns them, and a guarding hand's
 *   cover of what its tactics name. It has the hands the strike has not.
 *
 * Every skill answers `Skill.resume`, and the skills tell every one of them from one list: a
 * skill added to it cannot be left out.
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
}

export interface SkillOptions {
  /** Shared combat trajectories in place of the reference strike skill. */
  readonly combat?: AttackTuning;
  readonly combatExecution?: CombatExecution;
  /** Either-foot support transfer, front strike, withdrawal and verified landing. */
  readonly kicks?: KickTuning;
  /** Enable supported low-combat transitions behind the neutral lowering intent. */
  readonly lowCombat?: boolean;
  /** Carry one returning hand independently while the other performs a bounded follow-up. */
  readonly combatOverlap?: boolean;
  /** Additional heading-speed ceiling, rad/s, applied by the shared locomotion skill. */
  readonly turnLimit?: number;
  /** Optional brief ceiling at the beginning of each requested walk. */
  readonly turnStartup?: TurnStartup;
  /** Use measured point trajectories for placed blows. */
  readonly pointMotion?: boolean;
  /** Point placement offset, in metres; supplied by a measured engagement policy. */
  readonly pointSpacing?: number;
  /** Retract on a new external hand contact and verify the target window before release. */
  readonly pointResponse?: boolean;
  /** An experiment's strikes in place of the searched repertoire (`REPERTOIRE`): a search's candidate. */
  readonly repertoire?: Repertoire;
  /** An experiment's placed blow in place of the one set (`PLACED`): a sweep's cell. */
  readonly placed?: Placed;
  /** An experiment's most a blow turns the pelvis in place of the one set (`STEER`): a sweep's cell. */
  readonly steer?: number;
  /** An experiment's cover in place of the one set (`GUARD_COVER`): a sweep's cell. */
  readonly cover?: Covering;
}

/** The skills of `body`; `tactics` is the memory of the tactics that will hand them their intent (`Tactics.state`), kept with theirs. */
export function createSkills(body: Body, { repertoire = REPERTOIRE, placed, steer, cover, pointMotion, pointSpacing, pointResponse, combat, combatExecution, lowCombat, turnLimit, turnStartup, combatOverlap, kicks }: SkillOptions = {}, tactics: object | null = null, engagement?: { readonly phase: string }): Skills {
  if (combat) return combatSkills(body, combat, tactics, engagement, lowCombat, turnLimit, turnStartup, combatOverlap, combatExecution, kicks);
  if (kicks) throw new Error("kicks require the shared combat executor");
  const legs = locomotion(body.envelope, turnLimit, turnStartup), strikes = strikeSkill(body.built.spec, repertoire, placed, steer, pointMotion, pointSpacing, pointResponse), guard = guardSkill(body.built.spec, cover);
  const none: readonly MusclePush[] = Object.freeze([]);
  const effectors: Record<string, EffectorGoal | null> = { "hand.left": null, "hand.right": null };
  const command: { -readonly [K in keyof BodyCommand]: BodyCommand[K] } =
    { posture: GUARD, effectors, pushes: none, stance: null };
  const state = { command, legs: legs.state, strikes: strikes.state, tactics };
  const all: readonly Skill[] = [legs, strikes, guard];
  const report: SkillReport = {
    get heading() { return legs.heading; },
    get pace() { return legs.pace; },
    get reference() { return legs.reference; },
    strike: strikes.report,
    ...(engagement ? { engagement } : {}),
  };
  return {
    report, state,
    resume(view) { for (const skill of all) skill.resume(view); },
    command(view, intent, dt) {
      const strike = strikes.command(view, intent.hands, legs.heading, legs.placed, dt);
      if (!strike) strikes.idle(intent.move !== null, dt);
      const retreat = pointResponse && strikes.report.phase === "return" && intent.move !== null;
      const goal = retreat ? legs.goal(view, intent.move, intent.face, dt, intent.lower)
        : strike?.footing ? legs.place(view, strike.footing, intent.lower)
        : strike ? legs.goal(view, strike.walk, strike.face, dt, intent.lower)
        : legs.goal(view, intent.move, intent.face, dt, intent.lower);
      // A blow under way turns the heading to follow its target (`STEER`).
      if (goal) command.stance = strike?.steer ? { ...goal, heading: goal.heading + strike.steer } : goal;
      command.posture = strike?.posture ?? GUARD;
      command.pushes = strike?.pushes ?? none;
      // The strike's goal for the hand it has; the guard's for a hand it has not.
      const thrown = strike?.hands, covers = guard.command(view, intent.hands, strikes.report.hand);
      const either = !!thrown && (!!thrown.left || !!thrown.right);
      effectors["hand.left"] = either ? thrown!.left ?? covers.left : covers.left;
      effectors["hand.right"] = either ? thrown!.right ?? covers.right : covers.right;
      return command;
    },
  };
}
