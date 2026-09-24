import type { ArmourByHit } from "../../scoring.ts";
import {
  CHAIN_REACH, CHAIN_WRIST, HEAD_NECK, LOCOMOTION_BIPED, TERMINAL_FIST, TORSO_PLAIN, TORSO_WAIST,
} from "../config.ts";
import { wristChainFrom } from "../effectors/chains/wrist.ts";
import type { ShellLook } from "../effectors/shell.ts";
import { bladeTerminal } from "../effectors/terminals/blade.ts";
import { fistDefinition } from "../effectors/terminals/fist.ts";
import { maceTerminal } from "../effectors/terminals/mace.ts";
import { maulTerminal } from "../effectors/terminals/maul.ts";
import { plateTerminal } from "../effectors/terminals/plate.ts";
import { whipTerminal } from "../effectors/terminals/whip.ts";
import { headModule } from "../head/head.ts";
import { bipedDefinition } from "../locomotion/biped.ts";
import type { ChainLimits, EffectorTerminalDefinition, GolemPart, ModuleBuild, TerminalId } from "../module.ts";
import { torsoModule, type TorsoTuning } from "../torso/torso.ts";

/**
 * The skeleton: the stone golem's builders, handed thin, light bone tables.
 *
 * Every table spreads the stone one and changes only what a skeleton changes, so every field not
 * written here -- joint limits, rates, damping, the gait, `footFriction`, the carrier -- is stone's.
 * Each value has its reason or its measured table beside it. The skeleton plan's session 06 carried
 * the draft arithmetic and session 08 the owner's tuning pass; both were deleted once they landed
 * and read at `git show f40c5f7:docs/plans/2026-09-22-skeleton-06-skeleton-modules.md`.
 *
 * **Masses are kilograms.** `kg()` in `config.ts` scales a stone volume and is not exported; a
 * skeleton is 21.3 kg of trunk, head and legs against stone's 75 (the arms are left out of that
 * comparison because each holds the same terminal in both bodies).
 *
 * **It is a person's shape, 1.62 m to the crown**: the ribcage sits on the waist socket at 0.92 m,
 * the shoulders are at 1.24 m, and the arm is a person's (`SKELETAL_REACH`) rather than stone's,
 * which on this body read as a spear.
 *
 * **Health is set so a clean blade needs about as many hits as it does on stone.** Cut armour 0.5
 * and a light part take about a quarter of the blade's stone damage, so a 20-health forearm takes
 * the same two to three clean cuts at 10 m/s as a stone forearm at 100, and a mace needs about two
 * thirds as many hits as it needs on stone.
 *
 * **Weak joints** are the module rule and nothing here: severing any piece takes its whole module
 * off (`Golem.sever`), and a bone arm's pieces are light and low in health.
 */

/** Bone turns an edge and shatters under a club. A slap and a crush are paid in full. */
export const SKELETON_ARMOUR: ArmourByHit = Object.freeze({ cut: 0.5, thrust: 0.6, slap: 0, crush: 0 });

/**
 * Thin legs on a light pelvis. The pelvis is fatal (the biped says so), so losing a leg ends a
 * skeleton the way it ends a stone golem.
 *
 * **At stone's brace of 1.5, a light body is knocked down by almost any blow.** The fall ledger
 * divides each blow's shove by the supported mass. Straddled on a standing idle pair by a
 * queued shove, the skeleton (28.30 kg supported, blade and plate) staggers at 0.565 N s and falls
 * at 0.624, around its own threshold of 0.594; stone (89.09 kg) staggers at 1.777 and falls at
 * 1.964, around 1.871. In two 20 s skeleton-duelist mirrors (Node bout runner, seed pairs
 * 0x57010001/2 and 0x57010003/4) the median landed blow added 0.018 m/s of specific impulse against
 * a fall threshold of 0.021, 37 of 88 shoves were a knockdown on their own, there were 27 falls, and
 * neither bout ended before the cap; the same two golem-duelist mirrors of stone read a median of
 * 0.0048, no single-blow knockdown in 41 shoves, and 3 falls in 18.3 s.
 *
 * **So its brace is 2.0, a little over stone's 1.5**, chosen together with a rise that hits did not
 * interrupt (`riseHoldsThroughHits`, removed by physical contact session 02 on 2026-09-23, when every
 * rise became as hard to put down as a standing body; the table below predates that). The owner asked for slightly stronger footing, and
 * found a brace of 5.7 -- the blade's time down from 71.7 % to 10.1 % -- too much. Node bout runner
 * (`createBout`, driven by a working script that is not committed), supported, fresh Havok and a child process per bout, cap 60 s,
 * the stone attacker on `golem-duelist` against this skeleton on `skeleton-duelist`, 8 seed pairs a
 * cell (0x5ce1e800 + 2i / 0x5ce1e801 + 2i), first 0.6 s excluded, 2026-09-22. Time the skeleton
 * spent fallen or rising, then its falls a bout and the 90th-percentile knockdown, fall to standing:
 *
 * | brace, rise | blade | mace | maul | whip | fists | knockdown p90, blade / whip |
 * | --- | --- | --- | --- | --- | --- | --- |
 * | 1.5, struck back down | 71.7 %, 3.4 | 96.0 %, 2.1 | 44.0 %, 5.5 | 89.5 %, 5.9 | 95.5 %, 3.4 | 9.93 / 16.90 s |
 * | 2.6, struck back down | 59.2 %, 3.6 | 96.1 %, 2.6 | 28.1 %, 4.4 | 84.2 %, 5.8 | 87.0 %, 5.9 | 9.15 / 18.37 s |
 * | 4, struck back down | 35.5 %, 1.8 | 79.0 %, 4.5 | 7.9 %, 1.3 | 86.1 %, 5.6 | 69.9 %, 7.1 | 7.00 / 18.78 s |
 * | 5.7, struck back down | 10.1 %, 1.0 | 69.0 %, 3.5 | 5.6 %, 0.8 | 71.6 %, 8.1 | 62.6 %, 7.9 | 3.65 / 10.00 s |
 * | 1.5, holds | 61.9 %, 6.3 | 83.9 %, 5.0 | 36.6 %, 6.9 | 70.7 %, 14.0 | 73.9 %, 10.3 | 3.72 / 3.62 s |
 * | **2.0, holds** | **56.9 %, 4.8** | **79.5 %, 4.1** | **37.8 %, 6.9** | **73.8 %, 14.6** | **73.0 %, 11.0** | **3.75 / 3.63 s** |
 * | 2.6, holds | 45.3 %, 3.6 | 80.0 %, 3.6 | 23.9 %, 3.4 | 73.7 %, 12.6 | 67.5 %, 11.1 | 3.67 / 3.60 s |
 * | 3.3, holds | 32.1 %, 2.9 | 69.6 %, 4.3 | 28.7 %, 3.8 | 73.4 %, 15.6 | 64.7 %, 8.8 | 3.70 / 3.60 s |
 *
 * Holding the rise ends the long knockdowns, which were rises struck back down, but a skeleton
 * that stands is soon floored again: at 2.0 it falls from 1.25 times as often as built against the
 * maul to 3.2 times against the fists. With the rise held, brace hardly moves the whip's time down
 * (70.7 to 73.8 %) and moves the fists' from 73.9 only to 64.7 %, because what floors it there is
 * mostly the slap -- a blunt contact under its energy floor, which scores nothing and still shoves
 * (`Combat`). At 2.0 the skeleton lost all 8 to the blade and to the mace; as built it lost 7 of 8
 * to the blade with a tie, and all 8 to the mace. Against the fists it won 5 of 8, where as built
 * it won none.
 *
 * **Leg ceilings are half of stone's, because lighter legs buzz at stone's.** Node locomotion bench
 * (`runGolemLocomotion`, stone's 57.8 kg ride block on each), over the walk, the side-step, the spin
 * and the scripted shove-and-rise:
 *
 * | legs, hip / knee / ankle Nm | walk slip | walk flight | strafe slip | turn slip | support gap |
 * | --- | --- | --- | --- | --- | --- |
 * | stone biped, 900 / 500 / 220 | 99.1 mm/s | 8 / 1919 | 1163.9 | 369.8 | 0.071 s |
 * | skeleton, 900 / 500 / 220 | 270.2 mm/s | 12 / 1919 | 1275.0 | 207.7 | 0.229 s |
 * | skeleton, 675 / 375 / 165 | 118.9 mm/s | 8 / 1919 | - | - | 0.142 s |
 * | skeleton, 540 / 300 / 132 | 95.5 mm/s | 8 / 1919 | - | - | 0 s |
 * | **skeleton, 450 / 250 / 110** | **95.6 mm/s** | **8 / 1919** | **1275.0** | **207.7** | **0 s** |
 * | skeleton, 360 / 200 / 88 | 97.1 mm/s | 8 / 1919 | - | - | 0.117 s |
 * | skeleton, 225 / 125 / 55 | 150.3 mm/s | 34 / 1919 | 1275.3 | 207.7 | 0 s |
 * | skeleton, 90 / 50 / 22 | 379.2 mm/s | 174 / 1919 | 1247.9 | 207.7 | 0 s |
 *
 * Every row but the last is inside the biped's own budgets (slip 300, strafe 1399, turn 267 for a
 * 0.09 m hip). The walk does not read the ride mass, because the root is keyframed while it is
 * supported; carrying the skeleton's own 22.4 kg upper body instead changes only the knockdown.
 *
 * **A knockdown runs its course** (`Knockdown` in `../config.ts`): the whole body goes limp, the
 * rise waits for the fall to come to rest, and the lift is slowed to `risePeakMps`. Traced every
 * 0.1 s, a released skeleton's pelvis and ribcage fall at 1 to 2.5 m/s for the first 1 to 1.2 s and
 * most are still between 1.2 and 2.5 s, which is where the cap sits. Node bout runner, supported,
 * 20 s cap, skeleton-duelist mirrors, four seed pairs 0x57010001 to 0x57010008, 159.8
 * corner-seconds; a lie is one stretch spent fallen, and "at cap" counts the lies the cap ended:
 *
 * | knockdown: rest m/s, rest s, cap s | fallen / rising s | lies | lie median / p90 s | at cap | pelvis at rise | rise lift, max |
 * | --- | --- | --- | --- | --- | --- | --- |
 * | none (stone's) | 17.4 / 18.4 | 49 | 0.35 / 0.35 | - | 0.81 m | 2.41 m/s |
 * | 0.2, 0.2, 3 | 61.2 / 22.7 | 27 | 2.23 / 3.00 | 5 | 0.19 m | 0.90 m/s |
 * | 0.2, 0.2, 2.5 | 45.6 / 21.3 | 24 | 1.86 / 2.50 | 5 | 0.18 m | 0.90 m/s |
 * | **0.3, 0.2, 2.5** | **53.7 / 27.0** | **30** | **1.57 / 2.50** | **3** | **0.19 m** | **0.90 m/s** |
 *
 * 0.3 m/s is far under the collapse and over a limp body's settling. That table was taken under the
 * shared rise rule and stone's brace, and a skeleton then spent about half of a mirror bout down,
 * against a fifth before. Part of that was the rise: a blow that lands during one sent the body back
 * to fallen, and a 1.1 s rise is a longer window for it than a 0.45 s one. In the same four mirrors
 * 11 of 30 rises were struck back down and 3 were refused for room, against 13 of 49 struck under
 * stone's knockdown. That is why a skeleton's rise was made to hold through hits
 * (`riseHoldsThroughHits`, since removed: see the brace above) and its brace is 2.0, the table above.
 *
 * **So its `riseBudgetSeconds` is its own.** The rise is keyframed and the leg ceilings above do
 * not move it: under stone's knockdown every row rose in 1.158 s on the bench's scripted shove, and
 * under this one the chosen row takes 1.996 s from the fall to supported. The budget is that and
 * about the half second stone's leaves over its own. It cannot be the worst case, a lie to the cap
 * and then a lift of the whole stand height, 2.5 + 1.43 s: the bench's sequence ends 3.0 s after
 * its shove (`LOCOMOTION_SEQUENCE`), so a rise that long reads as none at all.
 */
export const SKELETON_BIPED = {
  ...LOCOMOTION_BIPED, look: "bone" as ShellLook,
  pelvisWidth: 0.28, pelvisHeight: 0.12, pelvisDepth: 0.16, pelvisMass: 3.0, pelvisHealth: 90,
  hipSide: 0.09, hipInset: 0.02,
  thighRadius: 0.028, thighMass: 1.2, thighHealth: 35,
  shinLength: 0.39, shinRadius: 0.024, shinMass: 0.8, shinHealth: 30,
  footLength: 0.24, footWidth: 0.09, footHeight: 0.05, footMass: 0.5, footHealth: 25,
  footprintRadius: 0.28,
  braceCapacityMultiplier: 2.0,
  // The skeleton's mass did not move when stone's took its body density, so it holds nothing.
  stabilityMassRatio: 1,
  hipTorque: 450, kneeTorque: 250, ankleTorque: 110,
  knockdown: { restSpeedMps: 0.3, restSeconds: 0.2, maxLyingSeconds: 2.5, risePeakMps: 0.9 },
  riseBudgetSeconds: 2.50,
  // The bench's knockdown, stone's from before stone took its own body density (2026-09-24).
  shoveImpulseNs: 200,
};

/**
 * The waist: one vertebra standing for the lumbar spine.
 *
 * Its health is the ribcage's own. The waist is part of the torso module, so severing it severs
 * the ribcage with it, and the ribcage is fatal; with the stone waist's share, the spine would be
 * an easier kill than the ribcage it carries.
 *
 * **`leanTorque` 100 and `twistTorque` 60, a sixth of stone's 600 and 360, because at stone's
 * ceilings an idle skeleton never stops moving.** A waist servo is a velocity motor whose stiffness
 * is its ceiling, and against a trunk this light stone's ceiling is stiff enough to trade energy
 * with the arms hanging off it: the idle pair of `tests/golem-idle-stability.test.mjs`, standing
 * still with nothing commanded, moved the blade 98 mm and strayed its anchor 25 mm with the ribcage
 * at 5 kg. Two changes were needed together, the ribcage's mass (below) and this. Node idle pair
 * (that test's world, `RIBCAGE.coreMass` 10), worst part movement over 3 s after 4 s of settling:
 *
 * | lean / twist | blade | maul | mace + blade |
 * | --- | --- | --- | --- |
 * | 60 / 36 | 0.35 mm | 0.00 mm | 3.95 mm |
 * | **100 / 60** | **0.00 mm** | **0.67 mm** | **0.00 mm** |
 * | 180 / 108 | 0.00 mm | 10.79 mm | 6.77 mm |
 * | 600 / 360 (stone) | 0.00 mm | 66.32 mm | 17.30 mm |
 *
 * The stone golem's maul reads 5.55 mm in the same world. The lower ceiling costs a person nothing
 * on the Node torso bench (ribcage and skull, `coreMass` 10): the lean arrives in 0.521 s with
 * 0.005 rad of overshoot and the twist in 0.629 s with none, against the stone plated torso's 0.571
 * s, 0.021 rad and 0.625 s. Every row of the sweep above passes the waist test's bars.
 */
export const SPINE = {
  ...TORSO_WAIST, look: "bone" as ShellLook,
  ballLength: 0.22, ballRadius: 0.035, ballMass: 1.5, ballHealth: 110,
  leanTorque: 100, twistTorque: 60,
};

/**
 * The ribcage: the skeleton's one fatal trunk, and a solid box for now.
 *
 * `coreArmour` is 0 because the bone wrapper below replaces every part's armour with
 * `SKELETON_ARMOUR`; the field is the stone number's slot and is not read for a skeleton.
 *
 * **`coreMass` is 10 kg, twice the draft, because the trunk has to outweigh what hangs from it.**
 * The arms carry stone's terminals, and the ring and wrist link are each cast to `carryRatio` of
 * the terminal, so a bone arm holding a sword is heavier than the draft's 5 kg ribcage it hangs
 * from. Node idle pair, stone waist ceilings, blade and plate, worst part movement: 5 kg 98 mm,
 * 6 kg 109 mm, and 0.00 mm at every mass from 7 to 22.5 kg. 10 is chosen rather than 7 because the
 * maul and the mace need the margin (table on `SPINE`); the mass is raised and the box is not,
 * because the owner wants thin colliders rather than light ones.
 */
export const RIBCAGE: TorsoTuning = {
  ...TORSO_PLAIN, look: "bone",
  coreWidth: 0.30, coreHeight: 0.38, coreDepth: 0.20, coreMass: 10, coreHealth: 110,
  coreFatal: true,
  coreArmour: 0,
  socketSide: 0.19, socketHeight: 0.13, neckHeight: 0.21,
};

/**
 * The skull, which is not fatal.
 *
 * Its vitality weights are a fraction of stone's (neck 0.3 against 0.8, skull 0.6 against 2), so a
 * decapitation costs about a tenth of the bar rather than the stone head's 0.44. That is what makes
 * "not fatal" true at the vitality bar as well as at `fatal`: a severed module zeroes only the
 * piece that was struck (`Golem.sever`).
 *
 * **The neck's ceilings are stone's scaled by the head masses, 1.5 / 13.12, because no ceiling in
 * that range binds on a 1.5 kg skull.** Node torso bench, head alone on the stand:
 *
 * | head, pitch / yaw Nm | pitch arrival | overshoot | settle | wander | yaw wander | shove bob, settle |
 * | --- | --- | --- | --- | --- | --- | --- |
 * | stone plain, 100 / 10 | 0.304 s | 0.020 rad | 0 s | 4.25 mm | 4.76 mm | 50.5 mm, 0.229 s |
 * | skull, 100 / 10 | 0.100 s | 0.007 rad | 0 s | 2.09 mm | 1.49 mm | 83.1 mm, 0.229 s |
 * | skull, 60 / 6 | 0.100 s | 0.007 rad | 0 s | 2.12 mm | 1.45 mm | 84.5 mm, 0.225 s |
 * | skull, 30 / 3 | 0.100 s | 0.007 rad | 0 s | 2.17 mm | 1.42 mm | 85.5 mm, 0.221 s |
 * | **skull, 11.4 / 1.14** | **0.100 s** | **0.007 rad** | **0 s** | **2.20 mm** | **1.38 mm** | **86.1 mm, 0.217 s** |
 *
 * The smallest is no worse than stone on any column but the bob's peak, and that column does not
 * move with the ceiling: it is the bench's 84 N s shove landing on a head a ninth of stone's.
 */
export const SKULL = {
  ...HEAD_NECK, look: "bone" as ShellLook, headFatal: false,
  neckLength: 0.10, neckRadius: 0.02, neckMass: 0.3, neckHealth: 20, neckVitalityWeight: 0.3,
  headWidth: 0.16, headHeight: 0.20, headDepth: 0.20, headMass: 1.5, headHealth: 40,
  headVitalityWeight: 0.6, headArmour: 0, browOffset: 0.09,
  pitchTorque: 11.4, yawTorque: 1.14,
};

/** A person's humerus and forearm at the skeleton's height of about 1.62 m, metres. */
const UPPER_ARM = 0.30;
const FOREARM = 0.25;

/**
 * What one metre of stone's arm is on the skeleton's: the two bones over stone's two links, 0.705.
 * Every limit a table states in metres of arm -- the chain's reach and carry, and a terminal's
 * narrowing of them -- is scaled by it. Radians and weapon dimensions are not, because a joint
 * turns as far on a short arm as on a long one and a sword is the same sword in either hand.
 */
export const ARM_SCALE = (UPPER_ARM + FOREARM) / (CHAIN_REACH.upperLength + CHAIN_REACH.foreLength);

/** The two-bone reach at an elbow bend, the same law stone's `reachMin` and `reachMax` are. */
const reachAtBend = (bend: number): number =>
  Math.sqrt(UPPER_ARM ** 2 + FOREARM ** 2 + 2 * UPPER_ARM * FOREARM * Math.cos(bend));

/**
 * A person's arm, thin and light.
 *
 * **Anatomical lengths, not stone's.** Stone's 0.42 m and 0.36 m links, with the roll ring and the
 * wrist link beyond them, put the grip 1.04 m from the shoulder of a body 1.62 m tall, and with a
 * 0.8 m sword on the end the arm read as a spear. At 0.30 and 0.25 the elbow hangs at the bottom of
 * the ribcage and the grip sits 0.68 m out, as on a person. `reachMin` and `reachMax` are solved at
 * stone's two elbow bends (2.50 and 0.12 rad) because the joint limits are stone's; `reachNeutral`
 * and `carryMin` are stone's scaled by `ARM_SCALE`.
 *
 * **The joint ceilings are stone's**, and the Node bench says the lighter arm needs no other.
 * Each pair's scripted sequence beside its `effector.wrist.*` twin (no pair stuck, touched anything
 * or touched itself):
 *
 * | terminal | stone mass, peak / idle stray, tip | skeletal mass, peak / idle stray, tip |
 * | --- | --- | --- |
 * | blade | 6.53 kg, 110.8 / 3.05 mm, 27.9 m/s | 3.00 kg, 96.0 / 10.00 mm, 30.3 m/s |
 * | plate | 7.53 kg, 127.1 / 2.23 mm, 9.3 m/s | 4.00 kg, 83.4 / 6.00 mm, 9.2 m/s |
 * | mace | 8.15 kg, 208.0 / 12.71 mm, 20.7 m/s | 4.62 kg, 141.9 / 18.56 mm, 20.9 m/s |
 * | whip | 5.97 kg, 68.8 / 1.16 mm, 25.3 m/s | 2.44 kg, 24.9 / 2.01 mm, 23.1 m/s |
 * | maul | 18.24 kg, 106.3 / 23.05 mm, 8.5 m/s | 11.18 kg, 75.1 / 30.48 mm, 7.8 m/s |
 * | fist | 6.53 kg, 103.3 / 1.97 mm, 15.2 m/s | 2.10 kg, 65.1 / 1.43 mm, 16.4 m/s |
 *
 * The maul's second hand takes its grip at 0.313 s against stone's 0.387, latched 43.8 mm out
 * (the join allows 50), cleared in 0.050 s and held to 0.055 mm. Halving the three ceilings slowed
 * every weapon (blade 23.4 m/s, mace 14.6, maul 6.1), raised every peak stray (blade 152.4 mm, mace
 * 160.5, maul 106.4) and doubled the mace's idle stray to 40.2 mm; only the maul's idle stray
 * improved, to 14.5 mm. The long arm this table replaced strayed 18.8 mm at rest on blade and plate.
 *
 * The shipped sword stroke on the stroke bench misses its mark by 0.050 m at 11.85 m/s with 46.5 mm
 * of stray, against stone's 0.101 m, 15.46 m/s and 37.9 mm. `COMMITTED_SHAPE_CANDIDATES.sword`,
 * which is stone's bench optimum and says it is valid only at stone's operating point, misses by
 * 0.228 m at 2.52 m/s on this arm with 16.2 mm of stray.
 */
export const SKELETAL_REACH = {
  ...CHAIN_REACH, look: "bone" as ShellLook,
  collarLength: 0.10, collarRadius: 0.035, collarMass: 0.3, collarHealth: 20,
  upperLength: UPPER_ARM, upperRadius: 0.022, upperMass: 0.6, upperHealth: 25,
  foreLength: FOREARM, foreRadius: 0.018, foreMass: 0.4, foreHealth: 20,
  reachMin: reachAtBend(2.50),
  reachMax: reachAtBend(0.12),
  reachNeutral: CHAIN_REACH.reachNeutral * ARM_SCALE,
  carryMin: CHAIN_REACH.carryMin * ARM_SCALE,
};

/**
 * The roll ring and the wrist link: the end of the forearm and the hand, 0.05 m and 0.08 m against
 * stone's 0.12 and 0.14. Each is still cast to `carryRatio` of what the hand holds.
 */
export const SKELETAL_WRIST = {
  ...CHAIN_WRIST, look: "bone" as ShellLook,
  ringLength: 0.05, ringRadius: 0.02, ringMass: 0.2, ringHealth: 12,
  wristLength: 0.08, wristRadius: 0.016, wristMass: 0.2, wristHealth: 12,
};

/** A bone fist: the one terminal a skeleton refits, because it is part of the body. */
export const SKELETAL_FIST = {
  ...TERMINAL_FIST, look: "bone" as ShellLook, armour: SKELETON_ARMOUR,
  radius: 0.05, mass: 0.4, health: 20,
};

/** Stamp bone armour on every part a definition builds. */
function boneDefinition<T extends { parts: readonly GolemPart[] }, D extends { build(ctx: ModuleBuild): T }>(
  definition: D,
): D {
  return { ...definition, build(ctx: ModuleBuild) {
    const built = definition.build(ctx);
    return { ...built, parts: built.parts.map((part) => ({ ...part, armour: SKELETON_ARMOUR })) };
  } } as D;
}

export const skeletonBiped = boneDefinition(
  bipedDefinition("locomotion.skeleton", "skeleton legs", SKELETON_BIPED));
export const ribcageTorso = boneDefinition(torsoModule("torso.ribcage", "ribcage", RIBCAGE, SPINE));
export const skullHead = boneDefinition(
  headModule("head.skull", "skull", { guardPitch: 0.25, ram: null }, SKULL));

/** A terminal's narrowing of the chain, with its metres of arm scaled onto the bone arm. */
const onBoneArm = (limits: ChainLimits | null): ChainLimits | null => limits && Object.freeze({
  ...limits,
  reachMin: limits.reachMin === null ? null : limits.reachMin * ARM_SCALE,
  reachMax: limits.reachMax === null ? null : limits.reachMax * ARM_SCALE,
  carryMin: limits.carryMin === null ? null : limits.carryMin * ARM_SCALE,
});

/**
 * What a skeleton's hand holds, for each terminal on the shelf.
 *
 * A total record rather than a `fist ? ... : terminal` ternary, so a terminal added to the shelf is
 * a compile error here instead of a stone one in a bone hand. Every weapon is the stone one: a
 * sword in a skeleton's hand is the same sword, and its parts carry no armour. What changes is the
 * narrowing each asks of the arm, which is in metres of stone's arm -- the plate's 0.45 m floor on
 * reach and the maul's 0.50 to 0.56 m window -- and is scaled onto the bone arm for every terminal
 * rather than the two that have one today, so a narrowing added later cannot come across unscaled.
 * The maul's `crossing` is the one figure in metres left as stone states it: it widens the trailing
 * chain's inboard floors rather than narrowing them, and the grip it serves is taken and held on
 * this arm (the maul row beside `SKELETAL_REACH`).
 */
const SKELETAL_TERMINALS: Readonly<Record<TerminalId, EffectorTerminalDefinition>> = Object.freeze({
  blade: bladeTerminal, plate: plateTerminal, mace: maceTerminal,
  whip: whipTerminal, maul: maulTerminal, fist: fistDefinition(SKELETAL_FIST),
});
const SKELETAL_FITS: Readonly<Record<TerminalId, EffectorTerminalDefinition>> = Object.freeze(
  Object.fromEntries(Object.entries(SKELETAL_TERMINALS).map(([id, terminal]) =>
    [id, Object.freeze({ ...terminal, limits: onBoneArm(terminal.limits) })])) as
    Record<TerminalId, EffectorTerminalDefinition>,
);

export const skeletalEquipment = (terminal: EffectorTerminalDefinition): EffectorTerminalDefinition =>
  SKELETAL_FITS[terminal.id];

export const skeletalChain = wristChainFrom("skeletal", "skeletal arm - reach plus roll and bend",
  SKELETAL_REACH, SKELETAL_WRIST, { fitTerminal: skeletalEquipment, armour: SKELETON_ARMOUR });
