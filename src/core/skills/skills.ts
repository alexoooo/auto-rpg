import type { BodyCommand, BodyView, CoreBody } from "../body.ts";
import type { Intent } from "../mind/intent.ts";
import { GUARD } from "./guard.ts";
import { locomotion } from "./locomotion.ts";

/**
 * **The skills**: the one place a mind's intent (`src/core/mind/intent.ts`) becomes the command a
 * body takes (`BodyCommand`, `src/core/body.ts`). A mind states every part's action at once; the
 * skills decide which of them has the body's parts and how each is carried out, and report back
 * (`SkillReport`), which the mind reads the next step. Motor control, under them, coordinates the
 * physics: the stance balances whatever the arms and trunk do.
 *
 * - **Locomotion** (`locomotion.ts`): the walk and the facing, within the body's envelope.
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
}

export function createSkills(body: CoreBody): Skills {
  const legs = locomotion(body.envelope);
  const command: { -readonly [K in keyof BodyCommand]: BodyCommand[K] } =
    { posture: GUARD, hands: { left: null, right: null }, pushes: [], stance: null };
  const report: SkillReport = {
    get heading() { return legs.heading; },
    get pace() { return legs.pace; },
    get reference() { return legs.reference; },
    get fallen() { return legs.fallen; },
  };
  return {
    report,
    command(view, intent, dt) {
      for (const hand of ["left", "right"] as const) {
        const action = intent.hands[hand];
        if (action.kind !== "guard") throw new Error(`the ${hand} hand's ${action.kind} has no skill yet`);
      }
      const goal = legs.goal(view, intent.move, intent.face, dt, intent.lower);
      if (goal) command.stance = goal;
      return command;
    },
  };
}
