import { windowSpotFinder } from "../skills/intent/action-window.ts";
import type { Body } from "../control/body.ts";
import type { SplitDriver } from "../minds/scripted-mind.ts";
import { standingFooting } from "../control/support.ts";
import { skillSet } from "../skills/framework/arbiter.ts";
import { stanceFeetOf, stanceSegmentsOf } from "../skills/locomotion/shared/stance-feet.ts";
import type { Skills } from "../skills/framework/skills.ts";
import { standIntent, type Intent } from "../skills/framework/intent.ts";
import { guardSkill } from "../skills/guard/shared/guard.ts";
import { locomotion } from "../skills/locomotion/shared/locomotion.ts";
import { stockClearance } from "../skills/locomotion/shared/navigation/clear-step.ts";

/** Continuous locomotion and the guard, with no action, for stock standing probes. */
export const standingSkills = (body: Body): Skills =>
  skillSet(body, { legs: locomotion(stanceFeetOf(body.built.spec), body.envelope, { segments: stanceSegmentsOf(body.built.spec), builtFooting: standingFooting(body.built) }), navigation: null, clearance: stockClearance(body.built.spec), spot: windowSpotFinder, guard: guardSkill(body.built.spec), executors: [], actions: [] });

/** A driver that has `skills` carry out an order to stand, decided anew each step. */
export const standingDriver = (skills: Skills): SplitDriver<Intent> => ({
  state: { skills: skills.state },
  decide(view) { if (view.resumed) skills.resume(view); return standIntent(0); },
  carry: (view, intent, dt) => skills.command(view, intent, dt),
});
