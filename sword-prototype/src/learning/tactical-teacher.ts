import { blankThreat, selectThreat } from "../action-primitives.ts";
import { isHeldStriker, isShield, isStriking, type WeaponKind } from "../hands.ts";
import type { FighterView } from "../mind.ts";
import { tacticEffectors, type EffectorName, type HandActionName, type StanceName, type TargetName } from "../options.ts";
import { attackOpportunity, type AttackOpportunity } from "./engagement.ts";

/**
 * Bumped to 2 by stage C2b, which is the first change to what this file *says*
 * since the number was introduced -- and the number had three writers and no
 * reader at all until `validateDaggerRow` started comparing it. A row labelled
 * by the three-field teacher and a row labelled by the six-field one are
 * otherwise indistinguishable to every consumer once the feature version
 * matches, so authoring a real aiming rule and closing that hole are one change.
 *
 * **The remediation pass that gave `cover` a real hand preference rides on the
 * same bump, and that is a decision rather than an omission.** The version
 * exists to tell a row labelled by the teacher *as it shipped* from a row
 * labelled by this one, and the last shipped teacher is `1`: C2b is one
 * uncommitted change, so every label this stage has ever produced outside the
 * working tree carries `1`. Bumping to `3` for a second edit inside the same
 * unlanded stage would refuse rows that no run ever wrote and claim a boundary
 * that does not exist. Whoever edits the teacher after C2b lands bumps it then.
 */
export const TACTICAL_TEACHER_VERSION = 2;

/**
 * What the teacher decides, which is now the whole tactic rather than a third of
 * one.
 *
 * The three new fields are typed as the frozen unions rather than as `string`,
 * which `DaggerLabel` still is: a row arrives from JSON and is checked, and this
 * is authored, so a misspelled region here should be a compile error rather than
 * a label the executor refuses at the far end of a training run.
 */
export interface TacticalLabel {
  readonly movement: string;
  readonly action: HandActionName;
  readonly effector: EffectorName;
  readonly target: TargetName;
  readonly stance: StanceName;
  readonly persistence: number;
}

const incomingThreat = (view: FighterView): boolean => Object.values(view.opponent.hands).some((hand) =>
  !hand.lost && isStriking(hand.weapon) && hand.tipSpeed >= 4);

/**
 * The last tenth of the reach, as a fraction rather than a distance.
 *
 * A fraction for exactly the reason `TARGET_SPAN_FRACTION` is one: the rule has
 * to hold on a broot, which is a 1.18x scale of the same skeleton, and on a
 * centipede, which has no arm at all. On a warrior with an arming sword the
 * teacher's own `ownReach` comes to about 1.45 m, so this names the band from
 * 1.31 m of measure out to the limit -- the part of the envelope where the arm
 * is straight and the nearest thing to the point is the lead leg rather than the
 * chest.
 *
 * `crowded` is the other end of the same quantity and is checked separately,
 * because `AttackOpportunity.rangeMargin` is `min(measure - minimum, maximum -
 * measure)` -- small at *both* ends of the window. Without the `!crowded` guard
 * a fighter at contact range would be labelled `low` for the reason that only
 * holds at full extension.
 */
const THRUST_EDGE_FRACTION = 0.10;

/**
 * How far an opponent has to have dropped before a thrust aims at the chest
 * rather than over it.
 *
 * `crouch` is the solver-achieved squat normalized from standing to full depth.
 * `applyTacticStance` commands 0.55 for `compact` and 0.25 for a slip, and
 * `applyActionPosture` commands 0.58 for a cover against a high threat and 0.22
 * against a low one -- so 0.5 separates a body that has genuinely gone down from
 * one that has merely settled into a guard. Bounded from both sides by
 * `the_thrust_aim_rule_is_low_at_full_extension_and_high_against_a_standing_body`.
 */
const CROUCHED_OPPONENT = 0.50;

const THREAT_SCRATCH = blankThreat();

/**
 * Which side of the fighter's own facing the threat is on, positive to its right.
 *
 * The same quantity as the `threat_local_right` feature column, spelled the same
 * way: `features.ts`'s `toLocal` builds right as `(cos f, 0, -sin f)` and takes
 * the threat's tip relative to the observer's own shoulder. Written out here
 * rather than by calling `writeFeatures` because a teacher that had to build a
 * 133-column vector to find out which side a blade is on would be paying for the
 * whole perception to answer one question -- and because `FeatureWriter` carries
 * per-mind history, which a teacher does not have.
 */
const threatLocalRight = (view: FighterView): number => {
  const threat = selectThreat(view, THREAT_SCRATCH);
  const dx = threat.tip.x - view.self.shoulder.x;
  const dz = threat.tip.z - view.self.shoulder.z;
  return dx * Math.cos(view.self.facing) - dz * Math.sin(view.self.facing);
};

/**
 * The aim, which varies only where stage B measured that varying it works.
 *
 * The four tables behind this are in `docs/measurements.md` under "Session 17
 * Stage B", and they are the whole argument:
 *
 * - **`thrust` obeys its aim.** Head share on the contacted limb goes 0.090 ->
 *   0.484 when `high` is named, and the low share 0.118 -> 0.818 for `low`. A
 *   thrust is a *point*: `actionAimAt` sends the tip where the aim says. So this
 *   is the one action worth branching, and it branches three ways.
 * - **`cut` and `punch` do not.** A cut aimed `high` takes a 0.045 head share
 *   against the measured aim's 0.071, and a punch 0.121 against 0.200 -- both
 *   *lower* than the aim they replace. They share a stroke branch where the aim
 *   seeds only the centre of an arc sweeping +-0.62 and +-0.50 in cursor units,
 *   which is far wider than the gap between two named heights, so a varying label
 *   would teach a correlation the body does not produce. They get the constant
 *   `vital` and this note beside it. Session 23 revisits it if the stroke
 *   envelope moves, which is the change that would make a named region point a
 *   cut rather than merely drop it.
 * - **`shoot` is directionally right and far too thin to branch on** -- two to
 *   four body contacts a bout. At range the angular error dominates and the
 *   torso is the largest region, so `vital`.
 * - **`bite` has one legal region.** `tacticTargets("bite")` is `["vital"]`, so
 *   the label is forced whatever a bout says. Measured anyway rather than
 *   assumed, over one centipede bout against an idle warrior: the numbers are in
 *   `docs/measurements.md` under "Session 17 Stage C2b".
 * - **`cover` answers the threat.** A guard placed at head height while a blade
 *   comes in low is not a guard, and `threat` is the only aim in the table that
 *   is a moving point rather than a height. `tacticTargets("cover")` is
 *   `["threat", "vital"]`, so it is legal here.
 * - **`recover` is the inert one.** It points at nobody; `vital` is the chest
 *   line and the first name in the frozen table.
 *
 * **Exported, and only the `thrust` branch needs it: `tacticalTeacher` cannot
 * emit `thrust`.** Its action rule is
 * `weapon === "bow" ? "shoot" : weapon === "empty" ? "punch" : "cut"` in
 * `actionableRow` below, which has no arm for a point -- so the three branches
 * this stage's brief asks for are branches nothing in this file reaches, and
 * making them reachable means turning every sword `cut` into a `thrust`, which is
 * a change to what the teacher *does* rather than to where it aims. That was not
 * this stage's to take. The rule is still worth having in the tree -- a learned
 * controller can emit `thrust`, `deployableTactics` offers it three heights, and
 * this is the measured opinion about which -- and a branch nothing can watch fail
 * is the worst defect this directory produces, so
 * `the_thrust_aim_rule_is_low_at_full_extension_and_high_against_a_standing_body`
 * drives it directly. Whoever gives the teacher a `thrust` deletes this
 * paragraph, not the branch.
 */
export const tacticalTarget = (view: FighterView, action: HandActionName,
  row: Readonly<{ rangeMargin: number }> | null, ownReach: number, crowded: boolean): TargetName => {
  if (action === "cover") return "threat";
  if (action !== "thrust") return "vital";
  if (row && !crowded && row.rangeMargin <= ownReach * THRUST_EDGE_FRACTION) return "low";
  return view.opponent.crouch >= CROUCHED_OPPONENT ? "vital" : "high";
};

/**
 * The stance, and the one place in this file where a *side* is decided.
 *
 * `slip-left` means slipping to the left, away from a blade arriving on the
 * right, so the sign is `threat_local_right > 0 -> slip-left`. Reversing it
 * teaches a fighter to move toward the thing being swung at it, and nothing
 * downstream would say so -- `applyTacticStance` accepts either name and both
 * produce a bounded, legal posture. `the_teacher_slips_away_from_the_side_the_threat_is_on`
 * builds the same world twice with the threatening hand on either side and
 * fails if the two answers swap.
 *
 * **What a slip physically is here is a rotation, and that is worth stating
 * rather than implying.** `applyTacticStance` gives both names crouch 0.25 and
 * lean -0.10 and differs only in `trunkTwist`, which `Fighter.applyPosture`
 * drives onto the waist's ANGULAR_Y motor at `trunkTwistMax` 0.70 rad. So the
 * head and the vitals barely translate; what moves is which shoulder is
 * forward. Whether that is worth anything against a real blade is a bout
 * measurement and it is session 23's, which is the session that decides whether
 * the six stances earn their place at all.
 *
 * **`extended` is deliberately never emitted.** Stage B measured it as very
 * nearly the existing commit posture -- 0.10/+0.30/0.55 x outboard against
 * `commit`'s 0.12/0.30/0.68 x outboard -- so during any committing action
 * labelling it teaches a near-no-op, and every action this teacher emits that
 * could use it is committing. Six names, five of them distinguishable here.
 */
const tacticalStance = (view: FighterView, threatened: boolean, crowded: boolean): StanceName => {
  if (threatened) return threatLocalRight(view) > 0 ? "slip-left" : "slip-right";
  return crowded ? "compact" : "action-default";
};

/**
 * The effector, recovered from the row the teacher already chose rather than
 * invented beside it.
 *
 * `attackOpportunity` keys its rows `hand:${hand}:${weapon}` and
 * `natural:${name}`, so the hand that produced the opportunity is in the key and
 * parsing it is reading the decision back rather than taking it twice.
 */
const rowEffector = (row: AttackOpportunity): EffectorName =>
  row.key.startsWith("natural:") ? "natural" : row.key.split(":")[1] as EffectorName;

/**
 * How well the thing in a hand covers, smaller being better.
 *
 * Three tiers, and the argument is what a guard *is*. A shield or a buckler is
 * a board built to be interposed and is the one implement here that scores
 * nothing when it arrives -- `isShield` is exactly that row of `GRIPS`. A
 * sword, an axe or a club is a bar of steel on the end of an arm and will turn
 * a blade, which is worse than a board and a great deal better than the third
 * tier: a bare forearm, which stops a cut with the forearm.
 *
 * Asked of `hands.ts` rather than written out as five weapon names, so a kind
 * added to `GRIPS` is ranked by what its row says instead of dropping silently
 * into the bottom tier -- the same direction of derivation `WEAPON_KINDS` and
 * `STRIKER_KINDS` are built in, and for the same reason.
 *
 * **A bow lands in the bottom tier and it never matters**, which is worth
 * stating rather than leaving to be rediscovered: a bow takes two hands, so
 * `twoHandedHolder` leaves the bow hand as the *only* legal effector for any
 * action on that body and there is nothing to rank it against. If a one-handed
 * shooting weapon is ever added, this is the line that has to decide whether a
 * stave covers better than a fist.
 */
const coverRank = (weapon: WeaponKind): number => isShield(weapon) ? 0 : isHeldStriker(weapon) ? 1 : 2;

/**
 * The effector for an action that chose no row: the hand the guard belongs in.
 *
 * `cover` and `recover` have no opportunity behind them -- they are what a
 * fighter does when there is nothing to attack, or when something is arriving --
 * so there is no key to parse, and both skills do the same thing with the hand
 * they are given: `handActionOption` interposes it (`actionCoverAt`, `guard =
 * true`) and covers with whatever is left over.
 *
 * **This was `tacticEffectors(view, action)[0]` and that was a real rule defect,
 * not a preference nobody had opinions about.** `tacticEffectors` returns hands
 * in `HANDS` order -- `primary` first -- regardless of what they hold, and
 * `accepts("cover")` is `() => true`, so *every* attached hand is legal for a
 * cover and the first-legal rule named the primary on every humanoid body in
 * existence. Measured over the 268-decision histogram below: `secondary` was a
 * legal effector for the action the teacher itself named on **133 of 268
 * decisions**, 121 of them `cover`, and was taken on none. On `sword+shield` and
 * `sword+buckler` -- two of the six humanoid `RESEARCH_STRATA` loadouts -- that
 * put the guard in the sword hand and left the shield hanging, which is not a
 * schedule fact and could not have been fixed by a reversed-loadout stratum: the
 * hand order does not depend on what the strata contain.
 *
 * The ranking is a stable minimum rather than a sort, so two hands of equal
 * standing keep `HANDS` order and a `sword+empty` or `empty+empty` body answers
 * `primary` exactly as before. `natural` is never ranked: `tacticEffectors`
 * answers `["natural"]` for `recover` only on a body with no attached hand at
 * all, where there is nothing to prefer it over.
 *
 * **Exported for the same reason `tacticalTarget` is, and the same paragraph
 * applies: `tacticalTeacher` cannot emit `recover`.** Reaching the `recover`
 * branch needs `hasHand` false and `declaredBite` false, and the guard at the
 * top of `tacticalTeacher` has already thrown for any body in that state -- a
 * body with no hand and no natural attack is refused by name, and a body with a
 * natural attack that is not `bite` is refused one line above that. So `recover`
 * is reachable only by a *learned* controller, which is exactly the reader this
 * rule is written for, and driving it here is what keeps it from being a branch
 * nothing can watch fail. Whoever gives the teacher a `recover` deletes this
 * paragraph, not the branch.
 */
export const coveringEffector = (view: FighterView, action: HandActionName): EffectorName | null => {
  const legal = tacticEffectors(view, action);
  let best: EffectorName | null = null; let bestRank = Number.POSITIVE_INFINITY;
  for (const effector of legal) {
    const hand = effector === "natural" ? null : view.self.hands[effector];
    const rank = hand ? coverRank(hand.weapon) : Number.POSITIVE_INFINITY;
    if (best === null || rank < bestRank) { best = effector; bestRank = rank; }
  }
  return best;
};

/**
 * A hand opportunity, the action it implies, and the effector that would perform
 * it -- or null when the executor would refuse that pair.
 *
 * **The legality check here is not decoration and it closes a live hole.** The
 * teacher used to take the first hand opportunity and name an action from the
 * weapon in it, with nothing asking whether that hand may perform that action.
 * `tacticEffectors` refuses a hand that is not the two-handed holder, and
 * `attackOpportunity` knows nothing about the weld -- so on a body carrying a
 * sword in the primary and a bow in the secondary the old rule labelled
 * `cut`, `composeTactic` refused it by name (`hand action "cut" requires a held
 * striking weapon in the secondary hand...`), and the bout died. No
 * `RESEARCH_STRATA` row carries that loadout, which is why it had never fired;
 * `the_teacher_only_ever_labels_a_tuple_the_body_can_execute` sweeps every
 * ordered pair and would.
 */
const actionableRow = (view: FighterView, row: AttackOpportunity):
Readonly<{ action: HandActionName; effector: EffectorName; row: AttackOpportunity }> | null => {
  const weapon = row.striker;
  const action: HandActionName = weapon === "bow" ? "shoot" : weapon === "empty" ? "punch" : "cut";
  const effector = rowEffector(row);
  return tacticEffectors(view, action).includes(effector) ? Object.freeze({ action, effector, row }) : null;
};

export function tacticalTeacher(view: FighterView): TacticalLabel {
  const naturalNames = Object.keys(view.self.naturalAttacks ?? {});
  const unknownNatural = naturalNames.find((name) => name !== "bite");
  if (unknownNatural) throw new Error(`tactical teacher does not know natural attack "${unknownNatural}"`);
  const hasHand = Object.values(view.self.hands).some((candidate) => !candidate.lost);
  if (!hasHand && naturalNames.length === 0) throw new Error(`tactical teacher cannot label unit "${view.self.unit}" with no published attack capability`);
  // A fist's published reach already ends at the contact surface. Adding the
  // opponent radius again teaches attacks while the shoulder is still outside
  // its anatomical range -- the exact orbiting label this teacher exists to avoid.
  const opportunities = attackOpportunity(view).filter((row) => row.viable && (row.striker !== "empty" ||
    view.measure <= Math.max(0, ...Object.values(view.self.hands).filter((candidate) => candidate.weapon === "empty" && !candidate.lost)
      .map((candidate) => candidate.reach))));
  const natural = opportunities.find((row) => row.key.startsWith("natural:"));
  const hand = opportunities.filter((row) => row.key.startsWith("hand:"))
    .map((row) => actionableRow(view, row)).find((entry) => entry !== null) ?? null;
  const declaredBite = naturalNames.includes("bite");
  const ownReach = Math.max(0, ...Object.values(view.self.hands).filter((candidate) => !candidate.lost)
    .map((candidate) => candidate.reach), ...opportunities.map((row) => view.measure + row.rangeMargin));
  const crowded = view.measure < Math.max(0.28, ownReach * 0.36);
  const movement = crowded ? "disengage" : opportunities.length ? "hold" : "close";
  const threatened = incomingThreat(view);
  const label = (action: HandActionName, effector: EffectorName | null, persistence: number,
    row: AttackOpportunity | null): TacticalLabel => {
    // Every branch below names an effector the legality rule already answered
    // yes to, so this cannot fire today -- and it is a refusal rather than a
    // substitution because the alternative is labelling a tuple the executor
    // will decline three hundred solver steps later, in a worker, with a message
    // about the option rather than about the teacher.
    if (effector === null) throw new Error(`tactical teacher chose "${action}", which unit "${view.self.unit}" has no legal effector for`);
    return Object.freeze({ movement, action, effector,
      target: tacticalTarget(view, action, row, ownReach, crowded),
      stance: tacticalStance(view, threatened, crowded), persistence });
  };
  if (threatened) {
    // The threatened branch used to spell its movement `crowded ? "disengage" :
    // movement`, which is `movement`: the expression above already answers
    // `disengage` for a crowded fighter. Collapsed rather than kept, because a
    // redundant ternary reads as a second rule.
    const action: HandActionName = hasHand ? "cover" : "bite";
    return label(action, coveringEffector(view, action), 0.24, null);
  }
  if (natural) return label("bite", "natural", 0.40, natural);
  if (hand) return label(hand.action, hand.effector, hand.action === "shoot" ? 0.70 : 0.42, hand.row);
  const action: HandActionName = hasHand ? "cover" : declaredBite ? "bite" : "recover";
  return label(action, action === "bite" ? "natural" : coveringEffector(view, action), 0.24, null);
}
