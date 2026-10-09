import type { Body, BodyCommand } from "../body.ts";
import type { EffectorGoal, MusclePush } from "../control/motor.ts";
import type { StanceGoal } from "../control/stance.ts";
import type { BlowAttack, KickAttack } from "../mind/intent.ts";
import type { Tactics } from "../mind/tactics.ts";
import type { HandPose, Side } from "../spec/body.ts";
import { guardPosture, type GuardSkill } from "./guard.ts";
import type { KickSkill } from "./kick.ts";
import { STANCE_LOWER, type Locomotion } from "./locomotion.ts";
import type { Around, BlowSkill, LegsAsk, Skill } from "./skill.ts";
import type { SkillReport, Skills } from "./skills.ts";
import { closesToStrike } from "./strikes.ts";
import type { SupportSkill } from "./support-fold.ts";

/** **The skills a set is made of**, one a role: the legs, the guard and a blow, and a kick and a support skill if it has them. */
export interface SkillParts {
  readonly legs: Locomotion;
  readonly guard: GuardSkill;
  readonly blow: BlowSkill;
  readonly kick?: KickSkill | null;
  readonly support?: SupportSkill | null;
}

/** What decides what a part of the body does: the tactics, or the skill of a role. */
type Holder = "tactics" | "guard" | "blow" | "kick" | "support";

/** Which skill had each part of the body, the last command made. */
export interface Holders {
  readonly legs: Holder;
  readonly trunk: Holder;
  readonly left: Holder;
  readonly right: Holder;
}

const FREE: LegsAsk = Object.freeze({ kind: "free" });
const NO_HANDS: Readonly<Record<Side, EffectorGoal | null>> = Object.freeze({ left: null, right: null });

/**
 * **A skill set**: the skills of `parts` under one arbiter, which gives each part of the body to
 * one of them each step. In order:
 *
 * 1. the support skill moves toward the stance the blow under way keeps, or the tactics ask;
 * 2. a kick asked for, or under way, leaves the blow none to begin;
 * 3. the blow claims what it uses; a blow that drives every freedom itself (`Claim.whole`) is
 *    given the body whole, and the steps after this one stand aside;
 * 4. the guard covers with each hand the blow does not hold;
 * 5. the legs carry out the blow's `LegsAsk`, or the tactics' walk while it asks none; a kick, or
 *    the support lowering, rising or low, holds the walk;
 * 6. the support skill lays its stance and trunk over the command;
 * 7. the kick's stance and foot goals are laid over it last, a kick beginning only while no blow
 *    is under way and the body stands.
 *
 * Every skill answers `Skill.resume`, from one list: a skill added to it cannot be left out.
 * `tactics` will hand the set its intent; their memory (`Tactics.state`) is kept with the skills'.
 */
export function skillSet(body: Body, { state: tactics, engagement }: Pick<Tactics, "state" | "engagement">, parts: SkillParts): Skills {
  const { legs, guard, blow } = parts, kick = parts.kick ?? null, support = parts.support ?? null;
  const spec = body.built.spec, guarding = guardPosture(spec);
  const closes = { left: closesToStrike(spec, "left"), right: closesToStrike(spec, "right") }, closing = closes.left || closes.right;
  const none: readonly MusclePush[] = Object.freeze([]);
  const holders: { -readonly [K in keyof Holders]: Holder } = { legs: "tactics", trunk: "guard", left: "guard", right: "guard" };
  const state = {
    command: { posture: guarding, pushes: none, stance: null } as BodyCommand, holders,
    legs: legs.state, blow: blow.state, ...(kick ? { kick: kick.state } : {}), ...(support ? { support: support.state } : {}), tactics: tactics ?? null,
  };
  const all: readonly Skill[] = [blow, legs, guard, ...(support ? [support] : []), ...(kick ? [kick] : [])];
  const around: Around = { get heading() { return legs.heading; }, get placed() { return legs.placed; }, support: support?.report ?? null };
  const report: SkillReport = {
    get heading() { return legs.heading; },
    get pace() { return legs.pace; },
    get reference() { return legs.reference; },
    strike: blow.report, holders,
    ...(support ? { support: support.report } : {}), ...(kick ? { kick: kick.report } : {}), ...(engagement ? { engagement } : {}),
  };
  const resume = (view: Parameters<Skill["resume"]>[0]) => { for (const skill of all) skill.resume(view); };
  return {
    report, state, resume,
    ...(blow.releases ? { release: resume } : {}),
    command(view, intent, dt) {
      const attack = intent.attack;
      let asked: BlowAttack | null = null, kicked: KickAttack | null = null;
      if (attack) switch (attack.kind) {
        case "blow": asked = attack; break;
        case "kick":
          if (!kick) throw new Error("these skills carry out no kick");
          kicked = attack; break;
        default: { const never: never = attack; throw new Error(`unknown attack ${JSON.stringify(never)}`); }
      }
      const kicking = kick !== null && (kicked !== null || kick.report.foot !== null);
      support?.tick(view, blow.lower ?? intent.lower ?? STANCE_LOWER, !!intent.move, dt);
      const claim = blow.command(view, kicking ? null : asked, intent, around, dt);
      const covers = guard.command(view, intent.guard, blow.holds);
      if (claim?.whole) {
        // A blow that drives every freedom by its pushes (`Claim.whole`) leaves the stance, the guard and the posture nothing.
        const whole: BodyCommand = { posture: guarding, pushes: claim.pushes, effectors: { "hand.left": null, "hand.right": null }, stance: null,
          ...(closing ? { handPoses: poses(closes, claim.closed) } : {}) };
        holders.legs = "blow"; holders.trunk = "blow"; holders.left = "blow"; holders.right = "blow";
        state.command = whole;
        return whole;
      }
      const lower = support ? STANCE_LOWER : intent.lower;
      const supporting = support !== null && support.report.stage !== "stand" && support.report.stage !== "wait";
      const ask = kicking || supporting ? null : claim?.legs ?? FREE;
      let goal: StanceGoal | null;
      if (!ask) goal = legs.goal(view, null, intent.face, dt, lower);
      else switch (ask.kind) {
        case "free": goal = legs.goal(view, intent.move, intent.face, dt, lower); break;
        case "hold": goal = legs.goal(view, null, intent.face, dt, lower); break;
        case "walk": goal = legs.goal(view, ask.walk, ask.face, dt, lower); break;
        case "place": goal = legs.place(view, ask.footing, lower); break;
        default: { const never: never = ask; throw new Error(`unknown legs ask ${JSON.stringify(never)}`); }
      }
      // A blow under way turns the heading to follow its target.
      const stance = goal && claim?.steer ? { ...goal, heading: goal.heading + claim.steer } : goal;
      const posture = claim?.posture ?? guarding, laid = support?.apply(stance, posture) ?? null;
      const hands = claim?.hands ?? NO_HANDS;
      let command: BodyCommand = {
        posture: laid ? laid.posture : posture, pushes: claim?.pushes ?? none,
        effectors: { "hand.left": hands.left ?? covers.left, "hand.right": hands.right ?? covers.right }, stance: laid ? laid.stance : stance,
        ...(closing ? { handPoses: poses(closes, claim?.closed ?? null) } : {}),
      };
      const motion = kick?.command(view, kicked, command.stance, !blow.busy && !view.down && (!support || support.report.stage === "stand"), dt);
      if (motion) command = { ...command, ...motion, effectors: { ...command.effectors, ...motion.effectors } };
      holders.legs = motion ? "kick" : laid && laid.stance !== stance ? "support" : !claim || claim.legs.kind === "free" ? "tactics" : "blow";
      holders.trunk = laid && laid.posture !== posture ? "support" : claim?.posture ? "blow" : "guard";
      // A blow has a hand it moves by its goal, or by its posture where the guard leaves that hand alone (`BlowSkill.holds`).
      holders.left = hands.left || blow.holds === "left" ? "blow" : "guard";
      holders.right = hands.right || blow.holds === "right" ? "blow" : "guard";
      state.command = command;
      return command;
    },
  };
}

/** Each hand that closes to strike, closed as `closed` holds it, or open. */
function poses(closes: Readonly<Record<Side, boolean>>, closed: Readonly<Record<Side, boolean>> | null): Partial<Record<Side, HandPose>> {
  return {
    ...(closes.left ? { left: closed?.left ? "fist" : "open" } : {}),
    ...(closes.right ? { right: closed?.right ? "fist" : "open" } : {}),
  };
}
