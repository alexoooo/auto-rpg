import { hasPoint, type WeaponKind } from "../../hands.ts";
import { mulberry32 } from "../../rng.ts";
import { clamp } from "../tactics.ts";
import type { Pilot, PilotHook } from "../pilot.ts";
import { watchedPilot } from "../pilot.ts";
import {
  COMMAND_RANGES, GOLEM_TACTICS_V4, freshCommand, golemDriven,
  type DrivenTactics, type GolemDriven, type StyleCommand,
} from "../tactics-v4.ts";

/**
 * `golem-driver`: the first mind over the fourth executor, and the argument that the surface works.
 *
 * ## What it is
 *
 * `golem-form` re-expressed as numbers. Every rule is the same rule in the same order -- meet their
 * point, answer their recover, run out of patience, otherwise circle -- and not one of them names
 * an option, because there are no options. Where the style said `cut` this writes a swing of one, a
 * bite of two-thirds and a commit gate; where it said `void` this writes a negative advance and a
 * strafe off the line; where it said `circle` this writes a strafe toward their spare side. The
 * numbers it writes are read off the same table rows the style read, which is the point: if the
 * surface is right then a transcription needs no new constants, and this file has one.
 *
 * ## Why it exists at all
 *
 * Because a command surface is a claim about what is expressible, and a claim like that is worth
 * exactly one measurement: take a style that already works, write it as numbers, and see whether
 * the numbers fight as well as the names did. If they do not, the surface is wrong and no policy
 * fitted to it will be right -- which is the whole reason this session precedes the one that fits
 * a policy rather than following it. What the two rows cost each other is in `docs/measurements.md`
 * under Session 12 of the style set.
 *
 * ## The three places it is not a transcription, written down rather than discovered
 *
 * 1. **It aborts through the commit as well as through the chamber.** `chamberAbort` in v3 can only
 *    take back a stroke that has not started travelling; the fourth executor's abort gate is legal
 *    at any point in the stroke, and this mind uses it whenever their point is committing at it and
 *    the spare hand has something to meet. That is a widening and it is the widening this session
 *    is for, so it is taken rather than suppressed.
 * 2. **There is no combination.** v3 starts the spare hand's stroke as the acting hand's arc ends,
 *    on a roll the executor makes; the fourth executor has no dice. On the default build -- a blade
 *    and a plate -- v3 never rolls one either, because a shield is not offered the combination; on
 *    a two-blade body it does, and that is a difference this mind pays for and the entry reports.
 * 3. **The feint is a stroke and an abort**, which is what a feint is. v3 has a `feint` stance with
 *    `feintHoldSeconds` and `feintBackSeconds` written into the executor; here the mind starts a
 *    stroke, waits `feintHoldSeconds`, and raises the abort gate. The cost is the same half
 *    cooldown, and it is now a thing any mind can do rather than a thing one stance does.
 */
const DRIVER_TABLE = {
  ...GOLEM_TACTICS_V4,
  /** `FORM.standOffFraction`: a hand's breadth further out than v2's 1.00. */
  standOffFraction: 1.06,
  /** `FORM.patience`: seconds of nothing happening before it opens one anyway. */
  patience: 2.2,
  /** `FORM.feintFraction`: how often a stroke is shown and taken back instead of thrown. */
  feintFraction: 0.15,
  /** `FORM.circleDuty`: the fraction of its idle time spent circling rather than standing. */
  circleDuty: 0.40,
  /** `FORM.parryOnCommit`: whether their point is met with the spare hand or only stepped away from. */
  parryOnCommit: true,
  /**
   * The one constant this file has that no style had: how wide an arc it throws.
   *
   * v3 has no such number because the arc was the option -- `cut` meant `COMMITTED_SHAPES` and
   * `strike` meant `STROKE_SHAPES` and there was nothing between them. One is the committed cut, so
   * the shipped value is a transcription of `golem-form` naming `cut`; anything less is a stroke no
   * style in the set could ask for, and that is what a sweep on this row is for.
   */
  strokeSwing: 1,
};

/** Every constant this mind has: the fourth executor's table with this mind's rows over it. */
export type DriverTactics = DrivenTactics & {
  circleDuty: number;
  parryOnCommit: boolean;
  strokeSwing: number;
};

export const DRIVER: DriverTactics = DRIVER_TABLE;

/**
 * The mind itself: five rules in the order they are asked, and no sixth.
 *
 * The order is the style, and it is `formDirector`'s order line for line. What has changed is that
 * each rule now ends by *writing* rather than by returning a name, so two rules can both have their
 * say in one ask -- the lean a stroke is thrown with and the strafe the feet are still taking are
 * no longer the same decision. That is the whole of what a vector buys over a partition.
 */
export function driverPilot(seed: number, T: DriverTactics = DRIVER): Pilot {
  const random = mulberry32(seed);
  const command = freshCommand();

  /** The clock at which the last stroke was opened, and how long patience runs this time. */
  let opened = 0;
  let patience = T.patience * (0.8 + random() * 0.4);
  /** The circling duty's two phases, alternating on the bout's own clock. */
  let circling = true;
  let phaseUntil = Number.NEGATIVE_INFINITY;
  /** What the stroke in flight was opened as, so that it is not re-decided six times inside itself. */
  let strokeHeight = 0.5;
  let strokeLateral = 0;
  let strokeSwing = T.strokeSwing;
  let strokeBite = T.strikeBite;
  /** Whether the stroke in flight is one it means to take back, and when it may be taken back. */
  let feinting = false;
  let feintAt = Number.POSITIVE_INFINITY;

  return (reading, view): StyleCommand => {
    const them = view.opponent;
    const clock = view.clock;
    const rise = them.crownHeight - them.ground.y;
    /** Where `slotMark` puts a trunk mark, as a height command. The mind's own arithmetic. */
    const trunkHeight = rise > 1e-6 ? clamp((them.shoulder.y - them.ground.y) / rise, 0, 1) : 0.5;

    // ---- the stand-off, the guard and the mark: what it does when nothing is happening --------
    // `styleRanges` in v3, written as a command. The three terms of that maximum are still the
    // three terms, and the last of them is still the only one that is about the body in front.
    const standFrac = reading.inside ? 0 : reading.longer ? T.longStandOff : T.standOffFraction;
    // v3's two range rules and not one, because a body whose only weapon is its head has no use for
    // the third term of the maximum: standing a hand's breadth outside *their* reach is where an
    // arm wants to be and is exactly where a ram can never arrive. v3 writes this as a whole
    // separate `ranges` object in the executor; here it is the mind's, which is where it belongs.
    const wantHold = reading.headfirst
      ? reading.myReach * T.holdFraction
      : Math.max(
        reading.myReach * T.holdFraction, reading.near + reading.slack,
        reading.theirReach * standFrac);
    command.standOff = reading.theirReach > 1e-3
      ? Math.min(COMMAND_RANGES.standOff[1], wantHold / reading.theirReach)
      : COMMAND_RANGES.standOff[1];
    command.reach = T.guardByTheirs
      ? (T.guardReachVs[reading.theirWeapon as WeaponKind] ?? T.guardReach) : T.guardReach;
    command.strafe = 0;
    command.lean = 0;
    command.advance = 0;
    command.targetHeight = trunkHeight;
    command.targetLateral = 0;
    command.swing = T.strokeSwing;
    command.bite = T.strikeBite;
    command.commit = 0;
    command.abort = 0;
    command.parry = 0;

    const meets = T.parryOnCommit && reading.spareCanCover && reading.intercept !== null;
    const threatening = reading.theirs === "commit" && reading.gap <= reading.theirReach + reading.slack;
    const striking = reading.mine === "exchange";

    // ---- a stroke in flight: hold what it was opened as, and decide whether to keep it --------
    if (striking) {
      command.targetHeight = strokeHeight;
      command.targetLateral = strokeLateral;
      command.swing = strokeSwing;
      command.bite = strokeBite;
      command.lean = T.cutLean;
      command.advance = strokeSwing > 0 ? 1 : 0;
      // The feint: the stroke this mind opened meaning to take it back, taken back once it has been
      // shown for as long as v3's `feint` stance shows one.
      if (feinting && reading.mineSeconds >= feintAt) {
        command.abort = 1;
        feinting = false;
      }
      // Rule one, and it comes first here as it comes first there: this style would rather meet a
      // point than finish a stroke into it.
      if (threatening && meets) {
        command.parry = 1;
        command.abort = 1;
        feinting = false;
      }
      return command;
    }

    // ---- rule one, with the arm free: meet their point, or step off its line ------------------
    if (threatening) {
      if (meets) {
        command.parry = 1;
        return command;
      }
      command.advance = -clamp(T.voidStep, 0, 1);
      command.strafe = clamp(reading.voidAxis * T.voidStrafe, -1, 1);
      command.lean = T.withdrawLean;
      return command;
    }

    /** Open a stroke: latch what it is, roll for whether it is one this mind means to throw. */
    const open = (height: number, lateral: number, swing: number, bite: number): StyleCommand => {
      opened = clock;
      patience = T.patience * (0.8 + random() * 0.4);
      strokeHeight = height;
      strokeLateral = lateral;
      strokeSwing = swing;
      strokeBite = bite;
      feinting = random() < T.feintFraction;
      feintAt = T.feintHoldSeconds;
      command.targetHeight = height;
      command.targetLateral = lateral;
      command.swing = swing;
      command.bite = bite;
      command.lean = T.cutLean;
      command.advance = swing > 0 ? 1 : 0;
      command.commit = 1;
      return command;
    };

    // A stroke is thrown from where v3 offered `cut` from, and not from further: the executor no
    // longer has that gate, so the mind carries it. `cutReachMetres` is the step-in's own metre,
    // and a charge does not get it: `ramLunge` is already inside a headfirst body's `strike`, and
    // v3's `ramCould` is that range and nothing added to it.
    const canOpen = reading.armed && reading.gap <= reading.strike
      + (reading.headfirst ? 0 : T.cutReachMetres);

    // ---- rule two: their arm on its way back is the opening this style waits for --------------
    if (reading.theirs === "recover" && canOpen) return open(trunkHeight, 0, T.strokeSwing, T.strikeBite);

    // ---- rule three: patience, and the point that is worth more than an edge -------------------
    // The point is offered where v3 offers `thrust` and not where it offers `cut`: inside `strike`
    // rather than inside `strike + cutReachMetres`, and only with something that has a point on it.
    // Neither gate is the executor's any more -- a swing of zero is legal with a maul and out of
    // range as well -- so the mind carries both, which is what makes this a transcription.
    const canPoint = reading.armed && reading.gap <= reading.strike
      && (hasPoint(reading.myWeapon as WeaponKind) || reading.myWeapon === "empty");
    if (clock - opened > patience) {
      if (reading.weakestSlot === "head" && canPoint) {
        return open(reading.weakestHeight, reading.weakestLateral, 0, 0);
      }
      if (canOpen) return open(trunkHeight, 0, T.strokeSwing, T.strikeBite);
    }

    // ---- rule four: circle for the fraction of the time this style circles --------------------
    if (clock >= phaseUntil) {
      circling = !circling;
      const span = circling ? T.circleSeconds : T.circleSeconds * (1 - T.circleDuty) / T.circleDuty;
      phaseUntil = clock + span * (0.6 + random() * 0.8);
    }
    if (circling) command.strafe = clamp(reading.circleSide * T.circleStrafe, -1, 1);
    return command;
  };
}

/** The mind over the executor, with an optional hook on the ask for a command log. */
export function golemDriver(
  seed: number, T: DriverTactics = DRIVER, onAsk: PilotHook | null = null,
): GolemDriven {
  const pilot = driverPilot(seed, T);
  return golemDriven(seed, T, onAsk === null ? pilot : watchedPilot(pilot, onAsk));
}
