import type { Body, BodyCommand, BodyView } from "../body.ts";
import type { Intent } from "../mind/intent.ts";
import type { MusclePush } from "../control/motor.ts";
import { GUARD } from "./guard.ts";
import { locomotion } from "./locomotion.ts";
import { strikeSkill, type StrikeReport } from "./strike.ts";
import { REPERTOIRE, type Repertoire } from "./strikes.ts";

/**
 * **The skills**: the one place the tactics' intent (`src/core/mind/intent.ts`) becomes the command a
 * body takes (`BodyCommand`, `src/core/body.ts`). The tactics state every part's action at once; the
 * skills decide which of them has the body's parts and how each is carried out, and report back
 * (`SkillReport`), which the tactics read the next step. Motor control, under them, coordinates the
 * physics: the stance balances whatever the arms and trunk do.
 *
 * - **Locomotion** (`locomotion.ts`): the walk and the facing, within the body's envelope.
 * - **Strike** (`strike.ts`): a hand's attack, with the recipe for what it holds (`strikes.ts`).
 *   It outranks the walk: while it works it has the legs, and the tactics' walk waits.
 * - **Guard** (`guard.ts`): the arms' posture when nothing owns them.
 */
export interface Skills {
  /** The command for this control step. */
  command(view: BodyView, intent: Intent, dt: number): BodyCommand;
  readonly report: SkillReport;
}

/** How the skills are going, as the last command left them. */
export interface SkillReport {
  /** The heading the stance is asked to face, rad about up. */
  readonly heading: number;
  /** The walk's speed asked, m/s (0 standing). */
  readonly pace: number;
  /** The centre of mass's standing height over the soles, m, read on the first step; null before. */
  readonly reference: number | null;
  /** Whether the body has fallen (its centre of mass well under the stance's height) at any step since. */
  readonly fallen: boolean;
  readonly strike: StrikeReport;
}

export interface SkillOptions {
  /** An experiment's strikes in place of the searched repertoire (`REPERTOIRE`): a search's candidate. */
  readonly repertoire?: Repertoire;
}

export function createSkills(body: Body, { repertoire = REPERTOIRE }: SkillOptions = {}): Skills {
  const legs = locomotion(body.envelope), strikes = strikeSkill(body.built.spec, repertoire);
  const none: readonly MusclePush[] = [];
  const command: { -readonly [K in keyof BodyCommand]: BodyCommand[K] } =
    { posture: GUARD, hands: { left: null, right: null }, pushes: [], stance: null };
  const report: SkillReport = {
    get heading() { return legs.heading; },
    get pace() { return legs.pace; },
    get reference() { return legs.reference; },
    get fallen() { return legs.fallen; },
    strike: strikes.report,
  };
  return {
    report,
    command(view, intent, dt) {
      const strike = strikes.command(view, intent.hands, legs.heading, legs.placed, dt);
      if (!strike) strikes.idle(intent.move !== null, dt);
      const goal = strike?.footing ? legs.place(view, strike.footing, intent.lower)
        : strike ? legs.goal(view, strike.walk, strike.face, dt, intent.lower)
        : legs.goal(view, intent.move, intent.face, dt, intent.lower);
      if (goal) command.stance = goal;
      command.posture = strike?.posture ?? GUARD;
      command.pushes = strike?.pushes ?? none;
      return command;
    },
  };
}
