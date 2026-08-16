//! The composed script, the windmill it is measured against, and the digest
//! that fingerprints what either of them actually submitted.
//!
//! **Nothing in here decides anything, and that is the point.** The phase is
//! `tick % 360`, the striking height is `tick / 90`, the guard height is
//! `(tick + 45) / 90` and the cut side is
//! `tick / 360`; the observation supplies geometry and nothing else -- where the
//! opponent is, which hand holds the shield, whether anybody is visible at all.
//! v2-17 has to answer "does the contact model produce decisive, legible
//! swordplay", and an answer from a policy that was *tuned* until it did would
//! be measuring the tuning. A fixed script can be reproduced from the phase
//! table in `docs/reference/articulated-mechanical-gate.md` with a pencil, so a
//! disagreement between that table and this file is a bug in one of them rather
//! than a matter of taste -- which is what
//! `the_twelve_phases_are_the_reference_table_written_out_by_hand` exists to
//! catch.
//!
//! Three things, and each exists because of the next:
//!
//! * [`ScriptedArticulatedPolicy`] -- the twelve phases composed: approach,
//!   guard, chamber, commit, rest, guard high, chamber, thrust, withdraw, turn,
//!   reface.
//! * [`WindmillArticulatedPolicy`] -- the control condition. It commits
//!   forever, alternating endpoints every thirty ticks, and never chambers,
//!   guards, withdraws or rests. If the composed script cannot beat it on
//!   damage per unit of actuator work then the phases are decoration, which is
//!   a thing worth being able to find out.
//! * [`ClosingAttackControlPolicy`] -- the second control, and the one that
//!   exists because checkpoint A's corpus turned out to be measuring
//!   [`AttackFootwork::Planted`] rather than measuring the physics. Read that
//!   enum before believing any number this file produced.
//! * [`script_digest`] -- the command stream reduced to eight bytes, so that
//!   two runs claiming to be the same run can be compared without keeping
//!   either of them.
//!
//! # What the reference table does not say, and what this file decided
//!
//! The table names one arm per phase and leaves the other to the standing tuck
//! rule, which is unambiguous -- until phases 5, 9, 10 and 11, which name a
//! column for one arm and leave the rest of that arm's row unstated, and until
//! a Brute, whose guard arm and weapon arm are the same arm. Every gap is
//! resolved at the phase it belongs to and argued there. Two rules run through
//! all of them:
//!
//! * **An unstated column is the one phase 0 established**, not a fresh
//!   default. The table is written as a sequence of edits to a posture, so
//!   "guard selected height" in phase 10 means the phase-0 guard with its height
//!   re-stated, not a guard with reach and effort invented.
//! * **A clause that names a piece of equipment applies to that equipment or to
//!   nobody.** Phase 5's "shield remains guard" has no referent on a body with
//!   no shield, so on a Brute the weapon clause is the whole phase.
//!
//! # The off arm stopped moving (2026-08-10)
//!
//! Everything above is the reference table and how it was read, and it is left
//! standing because it is still the reading. What sits on top of it is one
//! override: **the arm that is not the weapon arm holds a single fixed pose in
//! body frame for the whole fight**, applied last by [`off_hand`] in all three
//! policies here. It is a control-surface decision -- the game is aimed at
//! first-person human control of one hero, and a human cannot drive two
//! independently articulated hands -- and the argument for the particular pose,
//! including the shield-coherence defect it exists to dissolve, is on
//! [`off_hand`] rather than repeated here.
//!
//! **Corrected the same day: the pose is one of two, chosen by what the hand
//! holds.** The first version of the override put *every* off hand at three
//! quarters of reach, which is a guard on a hand carrying a plate and a shove
//! on an empty one -- `geometry::body_region_volumes` builds an arm region as
//! the capsule from shoulder to hand, so it lengthened the Brute's empty
//! `LeftArm` collider forward by half an arm length, and on this roster an arm
//! region holds the same integrity maximum as the torso. The arm is still
//! static, still in body frame, still the same bearing rule, and still the
//! same for every phase; only the reach is conditional. [`off_hand`] carries
//! the measurement.
//!
//! Two consequences for the reading above, and both are subtractions:
//!
//! * **The guard column is now only reachable on a body with no shield.** A
//!   Fighter's guard clause lands on the shield arm and is overwritten; a
//!   Brute's lands on the club arm, which *is* its weapon arm, and survives. So
//!   phases 0, 1, 2, 6, 9, 10 and 11 still say what they said -- they just only
//!   say it to the Brute now, which is why the phase-table test transcribes
//!   both bodies rather than one.
//! * **The open question about phases 5, 9, 10 and 11 is retired rather than
//!   answered.** Those rows named a rule for one arm and left the other's height
//!   or reach unstated, and the resolutions above filled each gap. There is no
//!   longer a second arm to underspecify: whatever the table declines to say
//!   about the off arm, [`off_hand`] has already said.
//!
//! # The guard got its height back (v2-20)
//!
//! **One column of the four, and it is the only one that could be spent.** The
//! control-surface argument above bounds the *number* of live columns on the off
//! arm and says nothing about which; [`off_hand`] argues that the one worth
//! having is height, that the reference this fight is modelled on had it in the
//! legs and this model has no legs to put it in, and that `bearing` cannot be
//! the one because freeing it walks back into the `derive_shield_pose`
//! normal-versus-centre defect that the same doc comment measures. Read it
//! there.
//!
//! # The guard got its bearing back too (2026-08-16)
//!
//! **Two columns now, because the blocker was removed rather than accepted.**
//! The paragraph above is kept as written because its reasoning was correct
//! about the model it was written against; what changed is the model.
//! `World::derive_shield_pose` now takes the plate's normal from the carrying
//! arm's own bearing, so centre and facing cannot come apart, and the reason
//! `bearing` was the one column that could not be spent no longer holds. The
//! guard tracks the threat inside [`GUARD_ARC`] of the commanded yaw and falls
//! back to the yaw exactly when nothing is visible.
//!
//! Two consequences for the reading above, and both are corrections to the
//! subtractions it lists:
//!
//! * **Phase 6 is still inert on a Fighter and the shield still moves.** The
//!   phase that steps a guard to `next_height` still lands on the overwritten
//!   arm, so the *phase* does nothing; the plate steps LOW/MID/HIGH on its own
//!   clock instead, which is a different schedule reaching the same motion.
//!   "The one phase written to step a shield between two heights is inert" is
//!   still true and "a Fighter's shield never changes height" is no longer
//!   true, and those were the same sentence before this session.
//!
//! * **The off arm is no longer twelve identical rows.** Its height column
//!   walks a ninety-tick clock that is offset from the phase grid, so four of
//!   the twelve rows step in the middle of themselves -- which is what
//!   `the_twelve_phases_are_the_reference_table_written_out_by_hand` now
//!   transcribes tick by tick. Still one *pose rule*; no longer one pose.
//!
//! And one addition to the module summary at the top, which said the guard
//! height is `tick / 90` and is now half right: the *weapon's* height is, and
//! the guard's is `(tick + 45) / 90`. [`GUARD_LEAD_TICKS`] carries the
//! measurement that forced it -- with one clock for both arms of both bodies
//! the corpus's (attack height, guard height) table was 100.00% diagonal, which
//! is a fight in which no guard was ever tested against anything but its own
//! height. It is still a clock and the script still decides nothing.
//!
//! [`ScriptedArticulatedPolicy`] and [`WindmillArticulatedPolicy`] are both pure
//! functions of the observation, so neither implements `reset` -- there is no
//! per-run memory for the harness to clear.

use crate::ArticulatedPolicy;
use fx::{Angle, Fx, Hash64, Vec2};
use sim::{
    ArmTarget, ArticulatedCommandV1, ArticulatedObservation, CombatHeight, GripRequest, Intent,
    ReleaseRequest,
    SubmittedCommand, SubmittedCommandRecord,
};

/// Ticks in one phase.
pub const PHASE_TICKS: u32 = 30;
/// Ticks in the full twelve-phase script.
pub const CYCLE_TICKS: u32 = PHASE_TICKS * 12;
/// Ticks the selected guard height holds before it steps.
pub const HEIGHT_TICKS: u32 = 90;

/// How far ahead of the weapon's height clock the *guard's* height clock runs.
///
/// **This constant exists because the corpus was measured and came back
/// degenerate.** Both bodies read the same `obs.tick` and both height clocks
/// were `(tick / HEIGHT_TICKS) % 3`, so over `lab articulated --seeds 400
/// --mirrored` the joint distribution of (attacker weapon height, defender
/// guard height) was **100.00% diagonal over 62,668 commanded pairs, every
/// off-diagonal cell exactly zero** -- a HIGH guard met a HIGH swing and never
/// met anything else, on every trial, by construction. Whatever such a corpus
/// says about a shield, it is saying it about one cell of a three-by-three
/// table.
///
/// **Half a step and not a whole one, and that is arithmetic rather than
/// taste.** The obvious fix -- phase the two sides apart by a whole
/// `HEIGHT_TICKS` -- does not mix anything, it relabels: with one side's clock
/// a whole step ahead the distribution becomes 0.00% diagonal, every pair
/// mismatched, which biases a blocked-contact rate exactly as hard in the other
/// direction. Any whole multiple of `HEIGHT_TICKS` does the same, because both
/// clocks then step at the same instants and only their labels differ. An
/// offset that is *not* a multiple is the only kind that can put mass in more
/// than one relation.
///
/// **It mixes partially, and the missing half has to be written down here.**
/// This paragraph originally read "a half is the one that splits it evenly";
/// that is true of the *diagonal* and false of the table. Both clocks still
/// have period `HEIGHT_TICKS`, so the index difference `g - w` takes only two
/// values however the offset is chosen -- over one 270-tick supercycle, `0` on
/// `[0,45)`, `[90,135)` and `[180,225)`, and `+1` on the three complements.
/// Six of the nine cells are reachable, three of them diagonal, and **three are
/// unreachable by construction**: a LOW attack never meets a HIGH guard, a MID
/// attack never meets a LOW guard, and a HIGH attack never meets a MID guard.
/// Measured, they are exactly zero rather than merely rare -- `[[9382, 9375,
/// 0], [0, 10934, 10913], [10930, 0, 10939]]` on the composed corpus, and the
/// same three cells zero on both controls.
///
/// **No offset closes them**, this one included: equal periods make the index
/// difference constant, so only *unequal* periods would, and that is a bigger
/// change to a script whose whole claim is that it can be reproduced from a
/// table with a pencil. Anyone reading a blocked-contact rate off this corpus
/// should read it as "half the swings met a guard one step high", not as "the
/// guard was tested against every height it could face". The last third is not
/// paid for and is not claimed.
///
/// **A per-run phase offset belongs to the evaluation harness, not to this
/// policy.** [`ScriptedArticulatedPolicy`] is a pure function of the
/// observation with no per-run memory to hold a phase in, and that contract is
/// worth more than the three cells -- a control opponent whose clock is
/// randomised per run is the harness's job, and v2-19 is carrying one precisely
/// so that a learned policy cannot bank a win on reading this clock and have it
/// scored as swordsmanship.
///
/// **Uniform, and not keyed on the side.** The plan this session implements
/// asked for a faction-keyed offset; there is no faction to key on.
/// [`ArticulatedObservation`] has no faction column by design --
/// `crate::ArticulatedPolicy`'s own doc comment argues at length why -- and the
/// only stable per-body key it publishes is the subject's slot index, which is
/// not the same thing: on a roster where one faction owns two adjacent slots,
/// parity splits that faction instead of splitting the sides. Leading the guard
/// against the weapon rather than one body against the other needs no key at
/// all, keeps this script a pure function of `tick` -- which is the property
/// the module header rests on and the reason the phase table can be checked
/// with a pencil -- and reaches six cells where the keyed version reaches six
/// *without* the three diagonal ones.
///
/// The cost is that the guard clock no longer lines up with the thirty-tick
/// phase boundaries: it steps mid-phase in four of the twelve phases, which is
/// what `the_twelve_phases_are_the_reference_table_written_out_by_hand` now
/// transcribes tick by tick rather than phase by phase for that one column.
pub const GUARD_LEAD_TICKS: u32 = HEIGHT_TICKS / 2;

/// An eighth of a turn, raw.
///
/// Spelled out because [`Angle`] names [`Angle::QUARTER`] and [`Angle::HALF`]
/// and stops there, and the cut chamber offset is half a quarter. Written as a
/// constant rather than `Angle::QUARTER` halved so that the number in the
/// reference table and the number here are the same literal.
pub const EIGHTH_TURN: Angle = Angle::from_raw(8_192);

/// The three ordinary heights, in the order `(tick / 90) % 3` walks them.
/// How far the guard bearing may leave the body's own facing, either way.
///
/// **Chosen on the plate's geometry, not on a corpus.** Since 2026-08-16
/// `World::derive_shield_pose` takes the normal from this bearing, so the arc is
/// exactly how far the plate may turn away from the direction the body faces.
/// At a quarter turn the plate would be edge-on to a frontal attack -- which is
/// the 1.84%-of-ticks defect the old weld existed to prevent -- and past a
/// quarter it would face behind the body. So the arc must be strictly less than
/// a quarter, and an eighth is where this file already puts an arc it has to
/// choose: it keeps `cos(45 deg)`, about 0.707, of the plate's width projected
/// against a frontal attack, and it can never be edge-on.
///
/// `a_bodiless_guard_arc_is_clamped_rather_than_wrapped` bounds both ends.
const GUARD_ARC: Angle = EIGHTH_TURN;

const HEIGHTS: [CombatHeight; 3] = [CombatHeight::LOW, CombatHeight::MID, CombatHeight::HIGH];

const QUARTER: Fx = Fx::from_ratio(1, 4);
const THREE_QUARTERS: Fx = Fx::from_ratio(3, 4);

/// The magnitude of an approach or withdrawal step.
///
/// **Fifteen sixteenths and not one**, for the reason
/// `runner::tests::advance_and_strike` records: [`Vec2::with_length`]
/// normalises by dividing and then multiplying, so a unit answer can land a raw
/// tick over the magnitude [`sim::World::submit_articulated_v1`] validates. A
/// refused command is not a slow fighter, it is the *neutral* command stored in
/// place of the one the script asked for -- the whole run silently becomes a
/// different run, and the gate would be measuring a body standing still.
/// `the_duel_never_submits_a_command_the_world_refuses` is what keeps this
/// honest.
///
/// The withdraw is exactly a half because the table says a half and a half has
/// no such edge: the risk is entirely at the top of the range.
const APPROACH_SPEED: Fx = Fx::from_ratio(15, 16);
const WITHDRAW_SPEED: Fx = Fx::HALF;

/// Which arm guards and which arm strikes.
///
/// Both are read out of the capability mask and the published grips rather than
/// out of the scenario, because a policy has no scenario -- and because the
/// answer changes mid-fight when an arm comes off.
///
/// **Public because a measurement of this script cannot attribute a height
/// without it.** `lab articulated` reports the joint distribution of (attacker
/// weapon height, defender guard height), and "which of the two commanded arms
/// is the weapon" is a fact about the script rather than about the fixture: it
/// moves when an arm is severed, so a lab that re-derived it from the
/// capability mask would be a second copy of the rule below, free to drift from
/// it exactly when a fight got interesting.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ArmRoles {
    pub guard: usize,
    pub weapon: usize,
}

impl ArmRoles {
    pub fn of(obs: &ArticulatedObservation) -> ArmRoles {
        let weapon_bit = [
            ArticulatedObservation::LEFT_WEAPON,
            ArticulatedObservation::RIGHT_WEAPON,
        ];
        // The right hand when both are armed. That is the sim's own ownership
        // rule -- a two-handed item fills the right slot and clears the left
        // weapon bit -- so following it here keeps "the weapon arm" meaning the
        // arm that owns the collider.
        //
        // **A disarmed body still has to name one**, because the script is total
        // and the four attack phases have to point somewhere. The reference does
        // not cover this cell at all, so the fallback is a resolution: the right
        // arm, unless the right arm is the one that came off. A Fighter that has
        // lost its sword arm would otherwise spend a third of every cycle
        // swinging a stump *and* tucking the live shield the tuck rule takes
        // away from it -- defenceless and harmless at once -- which cannot be
        // what the table means by "the weapon arm" on a body that has none.
        //
        // Half of that stopped being true on 2026-08-10: the off arm now holds
        // [`off_hand`] rather than the tuck, so the wrong answer here would
        // leave that Fighter guarded and merely harmless instead of both. The
        // resolution does not change -- swinging a stump for a third of every
        // cycle is still the thing being avoided -- but the second clause of
        // the argument for it is gone and should not be quoted.
        let weapon = if obs.can(weapon_bit[1]) {
            1
        } else if obs.can(weapon_bit[0]) {
            0
        } else if obs.arms[1].severed && !obs.arms[0].severed {
            0
        } else {
            1
        };
        // The occupied hand that is not holding a weapon, which is the shield
        // hand without needing to know which side the shield binds to. Reading
        // `SHIELD` alone would not say *where* it is, and reading the equipment
        // id alone would need the spec table this side of the seam cannot see.
        let shield = if obs.can(ArticulatedObservation::SHIELD) {
            (0..2).find(|&i| obs.arms[i].equipment.is_some() && !obs.can(weapon_bit[i]))
        } else {
            None
        };
        ArmRoles {
            guard: shield.unwrap_or(weapon),
            weapon,
        }
    }
}

/// One phase's answer, before the two arm rows are placed on a particular body.
///
/// `guard` and `weapon` are options rather than values so that "this phase does
/// not name that arm" is a state the assembly step can see: an unnamed arm
/// tucks, and an unnamed arm that had been given a default here would tuck
/// nowhere.
struct Phase {
    move_dir: Vec2,
    body_yaw: Angle,
    attack: bool,
    guard: Option<ArmTarget>,
    weapon: Option<ArmTarget>,
}

/// An arm no action named: at the command's own yaw, mid, barely out, slack.
///
/// The bearing is the yaw **this command asks for** and not the one the body
/// currently holds, which matters in exactly one phase: phase 10 turns the body
/// an eighth off the line, and a tuck anchored to the observed yaw would leave
/// the idle arm trailing a phase behind the shoulders it hangs from.
///
/// Since 2026-08-10 this only ever lands on the **weapon** arm, in the seven
/// phases that name no weapon clause: the off arm is overwritten by
/// [`off_hand`] after the table has had its say. The two poses are deliberately
/// different, and the difference is the whole content of "this arm is resting
/// between actions" against "this arm is not being driven at all": the tuck is
/// slack at zero effort, so contact can carry it anywhere and it will not come
/// back, while a static hand keeps half an effort to hold the station it was
/// given. On an *empty* off hand the two agree about where -- both sit at a
/// quarter, which is `ARM_MIN_REACH_RAW` exactly -- and still disagree about
/// whether anything is holding it there.
fn tucked(body_yaw: Angle) -> ArmTarget {
    ArmTarget {
        bearing: body_yaw,
        height: CombatHeight::MID,
        reach: QUARTER,
        effort: Fx::ZERO,
    }
}

/// The off hand's pose, in body frame, with exactly one column free: `guard`.
///
/// **A control-surface decision and not a physics one.** The design target is
/// first-person human control of a single hero, and two independently
/// articulated hands is more than one player can drive: four degrees of freedom
/// per arm, both live, both mattering. So the off arm stops being *driven*. The
/// right arm keeps every degree of freedom it had; this one keeps one.
///
/// **And the one it keeps is height, on the Die By The Sword argument.** The
/// reference for this fight let the player jump, duck and pitch the body, so a
/// shield held in one fixed place still covered a varying part of a varying
/// silhouette -- the height channel existed, it just lived in the legs and the
/// spine. This model has none of that: feet are planar, there is no crouch, and
/// the torso does not pitch. A plate welded to `CombatHeight::MID` is therefore
/// fixed against the body's own regions as well as against the world, which is
/// strictly less control than the reference had rather than a simplification of
/// it. One scalar -- shield up, shield down -- puts it back for one axis of the
/// four, and `spec::the_plate_leaves_a_different_hole_at_every_guard_height`
/// is what says the three settings answer three different attacks rather than
/// being three spellings of one.
///
/// **Height came back in v2-20; bearing came back on 2026-08-16, and only
/// because the defect that blocked it was fixed at its source.** This paragraph
/// used to argue that `bearing` could never be freed, because the plate's normal
/// was read off body yaw while its centre was read off the hand -- so a hand free
/// to swing came apart from its own facing, median 32 degrees, 1.84% of ticks
/// edge-on. That argument was sound about the model it described and is now
/// obsolete about this one: `World::derive_shield_pose` takes the normal from
/// the carrying arm's own bearing, so `centre` and `normal` are two readings of
/// one arm and cannot disagree.
///
/// The height argument below is untouched and still stands on its own terms;
/// what has gone is the claim that the two columns carry different risk. They no
/// longer do, so the off arm now spends two.
///
/// **The wire format does not move.** [`ArticulatedCommandV1`] still carries
/// both arms, `CommandField` still names its Left columns, the payload is still
/// 51 bytes inside 55 of framing, and the ABI is where it was. What changed is
/// what the script chooses to put in the left slot, which makes this reversible
/// by editing one function -- and the slot has to keep existing anyway, because
/// a two-handed grip mirrors the right arm into it.
///
/// **Body frame, so the arc is measured from the yaw this command asks for.**
/// The same rule [`tucked`] follows and for a stronger version of the same
/// reason: a pose anchored to a world bearing would swing across the chest every
/// time the body turned, which is exactly the motion the player is being
/// relieved of. The *centre* of the arc is the commanded yaw, so the hand is
/// still rigid to the torso whenever the threat is straight ahead, and phase
/// 10's eighth-turn still takes it around with the shoulders.
///
/// **The bearing tracks the threat inside [`GUARD_ARC`], and that choice is the
/// shield's.** It was welded to `body_yaw` until 2026-08-16, for a reason worth
/// keeping on the page rather than deleting: `World::derive_shield_pose` used to
/// take the plate's `centre` from the holding arm's hand and its `normal` from
/// `self.body_yaw[i].angle`, with nothing tying the two together, so an arm
/// reaching sideways left the plate edge-on to the attack its position implied
/// it covered. The defect was never hypothetical -- over the composed corpus's
/// 2.86M shield samples the angle between the plate normal and the hand's offset
/// from the body origin ran the entire 0..180 degree range, median 32, 1.84% of
/// ticks at 90 degrees or worse -- and welding was the cheap half of the cure:
/// at `bearing == body_yaw` the angle collapses to `atan(1/4 / (3/4 * 3/4))`,
/// 23.96 degrees for a Fighter, a constant, and never edge-on.
///
/// The expensive half is done now. The normal comes off this same bearing, so
/// the plate faces where its arm points at every offset in the arc, and the
/// residual against the *body origin* is only the shoulder's fixed lateral
/// half-width -- the same 23.96 degrees, no longer a special case of standing
/// still. That is what makes a moving guard coherent rather than merely wider,
/// and it is why the two halves are one change.
///
/// **Effort one half either way, chosen to hold station without leaning on a
/// limit.** `integrate_arm` scales acceleration by effort, so a zero-effort arm
/// cannot return to a pose contact took it out of -- the same mechanism the
/// plan blames for phases 5 and 6's cap hits, and the reason a static hand is
/// not simply [`tucked`] with a different reach. A half is enough authority to
/// recover and little enough that a converged arm is `idle_at_entry` on every
/// tick, shedding fatigue rather than billing work for standing still.
///
/// **Reach is the one column that reads the hand, and it is a correction.** The
/// first version of this override put three quarters in both cases. That is
/// right for a hand carrying a plate -- reach lives in `[ARM_MIN_REACH_RAW, 1]`,
/// so three quarters is clear of both ends, a shoved hand is chased back rather
/// than clamped, and full extension would be a joint limit and a straight arm
/// rather than a guard -- and it is wrong for an empty one, because an empty
/// hand is not carrying anything to the place it is being held out to.
///
/// What it *is* carrying is the arm. `geometry::body_region_volumes` builds an
/// arm region as the capsule from the yaw-rotated shoulder to the hand, so
/// reach is that capsule's length, and on this roster
/// `integrity_maxima` gives an arm region the same maximum as the torso.
/// Extending an empty off hand from a quarter to three quarters therefore does
/// not park a guard in front of anything; it grows a torso-grade interceptor
/// out of the shoulder and into the line. On a Brute at MID the capsule goes
/// 35,604 raw to 53,096 -- **1.49x**, half an arm length, pinned exactly by
/// `an_empty_off_hand_does_not_lengthen_the_arm_it_hangs_from`.
///
/// **The corpus does not care much, and that is worth writing down rather than
/// hiding.** Holding effort at a half and moving only this reach, the composed
/// corpus's 800 trials give the Brute 0.9424 mean end health at a quarter and
/// 0.9410 at three quarters -- nothing -- while facts at or above 65,536 raw go
/// 101 to 123 here, 264 to 209 on the windmill and 185 to 165 on the closing
/// control: 1.5, 2.5 and 1.1 Poisson sigma, disagreeing in sign. The plan once
/// read the Brute's recovery off this reach; the configuration that removes the
/// reach and keeps the effort recovers it anyway, so the credit belongs to the
/// effort column above. **The reach is chosen on the model and not on the
/// corpus**, which is the honest statement and the only one the numbers
/// support.
///
/// So an empty hand rests at a quarter, which is `ARM_MIN_REACH_RAW` exactly
/// and is where [`tucked`] and `actuator::tucked_arm` both already put an arm
/// nothing is asking anything of. **A quarter is a resting reach and not a
/// pose choice**: the number is the joint's own floor, so the collider is as
/// short as this anatomy can make it and no smaller number is available to
/// argue about.
///
/// **`guard` reaches an empty hand too, and that is deliberate.** Nothing hangs
/// on where a Brute's left hand sits vertically -- there is no plate on it --
/// and taking the height away from the empty branch would make this function
/// two poses that differ in two columns instead of one. It would also mean a
/// body that dropped its shield stopped answering the guard channel at all,
/// which is a silent behaviour change on exactly the tick a fight gets
/// interesting. The empty hand carries the height for the same reason it
/// carries the effort: the pose is one rule, and the hand only chooses the
/// reach.
fn off_hand(
    body_yaw: Angle, threat: Option<Angle>, guard: CombatHeight, holding: bool,
) -> ArmTarget {
    ArmTarget {
        bearing: guard_bearing(body_yaw, threat),
        height: guard,
        reach: if holding { THREE_QUARTERS } else { QUARTER },
        effort: Fx::HALF,
    }
}

/// The guard's bearing: the threat, held inside [`GUARD_ARC`] of the body.
///
/// **Clamped and never wrapped.** `Angle::delta` answers the shortest signed
/// difference in `-32768..=32767`, so a threat directly behind arrives as a
/// half turn and is clamped to one arc end rather than folded back to a small
/// offset that would point the plate at nothing. A guard that wrapped would
/// swing across the chest to cover an attack coming from behind it, which is
/// worse than not covering it.
///
/// **Nothing visible means the body's own facing, exactly.** Not "the arc
/// centred on a bearing to nobody": with no opponent there is no threat to
/// track, and the honest pose is the one this function returned unconditionally
/// before the bearing was freed -- which also makes the change provably inert on
/// a body with no opponent.
fn guard_bearing(body_yaw: Angle, threat: Option<Angle>) -> Angle {
    let Some(threat) = threat else { return body_yaw };
    let arc = GUARD_ARC.raw() as i32;
    let offset = threat.delta(body_yaw).clamp(-arc, arc);
    body_yaw + Angle::from_raw(offset as u16)
}

/// A world XY step of `magnitude` along `bearing`.
///
/// Built from the bearing rather than from the position delta so that the two
/// answer the same thing when nothing is visible: `toward` is then the body's
/// own yaw, there is no delta to normalise, and the fixture's faction-derived
/// spawn yaws already point the two bodies at each other -- which is the whole
/// of why phase 0 closes a 10.8-unit gap against a 9.6-unit sight range instead
/// of standing still waiting to be seen.
fn heading(bearing: Angle, magnitude: Fx) -> Vec2 {
    Vec2::new(bearing.cos(), bearing.sin()).with_length(magnitude)
}

/// The bearing from the subject to the selected opponent, or the yaw it already
/// holds.
fn bearing_to(obs: &ArticulatedObservation) -> Angle {
    match obs.opponents().first() {
        // The x/y of the difference of two world points, which is the only
        // bearing idiom in the crate. Z is the floor and a bearing has no
        // vertical part; the arm's vertical is `CombatHeight`.
        Some(opponent) => Vec2::new(
            opponent.body_position.x - obs.body_position.x,
            opponent.body_position.y - obs.body_position.y,
        )
        .angle(),
        None => obs.body_yaw,
    }
}

/// What the four attack phases do with the feet.
///
/// **`Closing` is a control under evaluation and not a second reading of the
/// reference.** The twelve-phase table names a move column for the approach,
/// the withdrawal and nothing else, and [`AttackFootwork::Planted`] is how
/// checkpoint A resolved that silence: `Vec2::ZERO`, feet stopped, for phases
/// 3, 4, 7 and 8.
///
/// That resolution turned out to decide the whole corpus.
/// `apply_articulated_movement` decays a body to a standstill in about
/// fourteen ticks when `move_dir` is zero, an equipment collider's velocity was
/// `body_velocity + arm.linear_velocity`, and the arm term alone -- 546 raw
/// per tick for a Fighter, 389 for a Brute, after `stat_factor` -- cannot
/// reach `CONTACT_ENERGY_FLOOR`. So a planted attack is provably incapable of
/// billing a single raw unit of damage, and 800/800 trials reaching the tick
/// limit measured that and not the physics.
///
/// **The velocity in that arithmetic changed under it** (v2-17 checkpoint B,
/// 2026-08-10): a held segment's collider is now sampled at the blade's centre
/// of mass, so its velocity carries `balance * swing` on top of the hand term.
/// The conclusion is unaffected and the paragraph is left standing because the
/// *reason* is what matters here -- a planted attack still gives up the body
/// term, which is the larger of the two, and the extra term is the arm's own
/// motion rescaled rather than a new source of closure. What it is no longer
/// safe to quote is the formula.
///
/// The same reference's fixture DSL defines `BT(h,m)` as "Brute
/// **Attack**(F), move `m`" and passes `m = (-1,0)` in several rows, so
/// attacking while closing is established vocabulary in the document that is
/// silent here -- which is the argument for measuring `Closing` before
/// changing any constant in the contact solver. Until the reference says which
/// it means, `Planted` is the script `ARPG-SCRIPT-V1` is defined over and
/// [`scripted_articulated_command`] is the only entry point that speaks for
/// it.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum AttackFootwork {
    /// The reference script: feet stopped for the whole of every attack.
    #[default]
    Planted,
    /// The control: the approach step, held through the attack.
    Closing,
}

/// The composed script's command for this observation.
///
/// Exposed as a function beside the policy for the same reason
/// [`crate::neutral_articulated_command`] is: a test that wants to know what
/// the script says at tick 137 should not have to build a policy and drive a
/// world to find out.
pub fn scripted_articulated_command(obs: &ArticulatedObservation) -> ArticulatedCommandV1 {
    scripted_articulated_command_with(obs, AttackFootwork::Planted)
}

/// The composed script with the attack phases' feet chosen by the caller.
///
/// Separate from [`scripted_articulated_command`] rather than a defaulted
/// argument it does not have, so that every reference path -- the digest, the
/// fixtures, the phase-table test -- names the reference script by calling a
/// function that cannot be handed the control by accident.
pub fn scripted_articulated_command_with(
    obs: &ArticulatedObservation,
    footwork: AttackFootwork,
) -> ArticulatedCommandV1 {
    let toward = bearing_to(obs);
    let roles = ArmRoles::of(obs);
    let index = ((obs.tick / HEIGHT_TICKS) % 3) as usize;
    let height = HEIGHTS[index];
    let next_height = HEIGHTS[(index + 1) % 3];
    // The same clock read half a step early, for the reason
    // [`GUARD_LEAD_TICKS`] gives: with both bodies reading one tick and one
    // clock, every swing met a guard at its own height and no other, so the
    // corpus could not say whether the height mattered.
    let guard_height = HEIGHTS[(((obs.tick + GUARD_LEAD_TICKS) / HEIGHT_TICKS) % 3) as usize];
    // Even cycles cut left, odd cycles right. The chamber is on the far side of
    // the line from the commit, because a cut has to start somewhere the target
    // is not in order to arrive somewhere it is at speed -- the argument
    // `sim::Strike` already makes about which way a windup goes.
    let left_cut = (obs.tick / CYCLE_TICKS) % 2 == 0;
    let chamber = if left_cut { toward - EIGHTH_TURN } else { toward + EIGHTH_TURN };
    let commit = if left_cut { toward + EIGHTH_TURN } else { toward - EIGHTH_TURN };

    let guard = |reach, effort| ArmTarget { bearing: toward, height, reach, effort };
    let rest = ArmTarget { bearing: toward, height, reach: QUARTER, effort: Fx::ZERO };
    // **A resolution: an attacking arm swings at the selected height too.** The
    // four attack rows of the table name a bearing, a reach and an effort and no
    // height at all, and only the guard rows say "selected height" out loud. The
    // gate settles it from the other end: its coverage table demands eight
    // weapon/body contacts at each of LOW, MID and HIGH, and a guard is a Hold,
    // so a script whose blade always swung at one height could not produce them.
    let strike = |bearing, reach| ArmTarget { bearing, height, reach, effort: Fx::ONE };
    // The one cell the control changes, spelled once so the four attack phases
    // below cannot drift apart from each other.
    let attack_feet = match footwork {
        AttackFootwork::Planted => Vec2::ZERO,
        AttackFootwork::Closing => heading(toward, APPROACH_SPEED),
    };

    let phase = match (obs.tick % CYCLE_TICKS) / PHASE_TICKS {
        // 0, 1: approach behind the guard. The only two phases that walk in.
        0 | 1 => Phase {
            move_dir: heading(toward, APPROACH_SPEED),
            body_yaw: toward,
            attack: false,
            guard: Some(guard(Fx::HALF, Fx::HALF)),
            weapon: None,
        },
        // 2: the same guard braced harder, feet planted.
        2 => Phase {
            move_dir: Vec2::ZERO,
            body_yaw: toward,
            attack: false,
            guard: Some(guard(Fx::HALF, THREE_QUARTERS)),
            weapon: None,
        },
        // 3, 4: chamber and commit the cut. **The guard arm is not named, so it
        // tucks** -- a Fighter drops its shield to swing, which reads as a
        // strange thing for a swordsman to do and is what the table says twice
        // over: the standing rule in "Script semantics", and the `FC` fixture
        // command, whose left arm is literally `Z(0)`.
        //
        // Superseded 2026-08-10 and left standing because it is still what the
        // reference says: the off-arm override reaches these two phases like
        // every other, so a Fighter now carries its shield through the cut. The
        // strange thing the table asked for is no longer done, and it was the
        // table asking.
        3 => Phase {
            move_dir: attack_feet,
            body_yaw: toward,
            attack: true,
            guard: None,
            // **Three quarters, and it is not free to change.** Measured on
            // 2026-08-15: full reach here takes the planted script from 2.0% to
            // 5.0% of duels decided and severances from 76 to 108, and is
            // neutral once the feet close. It was tried and reverted anyway,
            // because this reach is not only a script value -- `Posture::Chamber`
            // in `learn-core`'s model is *defined* as "three quarters out" and is
            // one of the five learned action heads. Raising it either moves
            // `LEARNED_INFERENCE_DIGEST` and owes a re-score of the probe
            // checkpoint, or collapses `Chamber` and `Commit` into the same
            // `(reach, effort, attack)` triple and leaves the model two actions
            // it cannot tell apart. See the tactical policy record for the full
            // dose-response sweep and for why phase length -- the larger lever --
            // is coupled the same way through `CYCLE_TICKS`.
            weapon: Some(strike(chamber, THREE_QUARTERS)),
        },
        4 => Phase {
            move_dir: attack_feet,
            body_yaw: toward,
            attack: true,
            guard: None,
            weapon: Some(strike(commit, Fx::ONE)),
        },
        // 5: rest. **Two resolutions here, and a Brute forces both.**
        //
        // The table says "weapon reach 1/4, effort zero; shield remains guard at
        // effort 1/2", which leaves the resting weapon's bearing and height
        // unstated and, on a body whose shield arm *is* its weapon arm, says two
        // contradictory things about one arm.
        //
        // The rest is at `toward` and the selected height: the tuck posture is
        // reserved by name for an arm no action named, and this arm is named, so
        // it keeps pointing at the opponent at the height the clock chose and
        // simply stops pressing. The guard keeps phase 0's reach because
        // "remains" is a word about continuity -- effort is restated only
        // because phase 2 had raised it.
        //
        // And on a Brute the weapon rule wins, because it is written below the
        // guard and therefore overwrites it. That is the intended reading rather
        // than an accident of ordering: "shield remains guard" names a shield,
        // a Brute has none, and applying it to the club would turn the phase
        // named Rest into a second guard phase.
        5 => Phase {
            move_dir: Vec2::ZERO,
            body_yaw: toward,
            attack: false,
            guard: Some(guard(Fx::HALF, Fx::HALF)),
            weapon: Some(rest),
        },
        // 6: guard one height up, hard. The phase that made the shield move --
        // and, since 2026-08-10, the phase that moves a Brute's club and
        // nothing else. A Fighter's guard clause lands on the off arm and is
        // overwritten, so the one phase written to step a shield between two
        // heights is still inert on the only body that carries one.
        //
        // v2-20 does not repair that and does not need to: the plate steps
        // heights on its own clock now, so the motion this phase was written to
        // produce happens -- on a different schedule, from `off_hand` rather
        // than from here. And [`GUARD_LEAD_TICKS`] recovers the *contrast* this
        // phase was for as well, though not where the table put it: for half of
        // every ninety ticks the guard is one step off the height the weapon is
        // working at, rather than for one phase in twelve. What is genuinely
        // gone is the phase's ability to say so at a place a reader can point
        // at, and that is worth leaving stated for whoever comes looking.
        6 => Phase {
            move_dir: Vec2::ZERO,
            body_yaw: toward,
            attack: false,
            guard: Some(ArmTarget {
                bearing: toward,
                height: next_height,
                reach: THREE_QUARTERS,
                effort: Fx::ONE,
            }),
            weapon: None,
        },
        // 7, 8: chamber and commit the thrust, straight down the line. Same
        // tuck consequence as the cut.
        7 => Phase {
            move_dir: attack_feet,
            body_yaw: toward,
            attack: true,
            guard: None,
            weapon: Some(strike(toward, QUARTER)),
        },
        8 => Phase {
            move_dir: attack_feet,
            body_yaw: toward,
            attack: true,
            guard: None,
            weapon: Some(strike(toward, Fx::ONE)),
        },
        // 9: withdraw. **"effort zero" is the guard's effort column**, in the
        // slot every other phase fills with "effort 1/2" or "effort 1", so the
        // guard keeps its bearing, its height and its reach and goes slack. The
        // alternative reading -- everything tucks -- would throw away the guard
        // height, which is the one channel a body backing out of measure is
        // still protecting, and would make this the only phase in the table
        // that tucks an arm it named.
        9 => Phase {
            move_dir: heading(toward + Angle::HALF, WITHDRAW_SPEED),
            body_yaw: toward,
            attack: false,
            guard: Some(guard(Fx::HALF, Fx::ZERO)),
            weapon: None,
        },
        // 10: turn the shoulders an eighth off the line while the guard stays
        // on it. The guard's unstated reach and effort are phase 0's, and the
        // divergence between `body_yaw` and the guard bearing is the point of
        // the phase -- it is what moves a shield normal without moving a body,
        // which is exactly what the `turn-shield` fixture asserts.
        //
        // The divergence survives 2026-08-10's override and the *shield's* half
        // of it does not. [`off_hand`] rides `phase.body_yaw`, so a Fighter's
        // plate now turns with the shoulders instead of staying on the line --
        // which is the whole point of a body-frame pose and is why the shield
        // normal and the shield's own position no longer come apart here. The
        // `turn-shield` fixture is unaffected: it drives its own commands from
        // the reference's DSL and never calls this script.
        10 => Phase {
            move_dir: Vec2::ZERO,
            body_yaw: toward + EIGHTH_TURN,
            attack: false,
            guard: Some(guard(Fx::HALF, Fx::HALF)),
            weapon: None,
        },
        // 11: reface and rest. **"reach 1/4, effort zero" is the guard arm**:
        // it is the only arm the table ever addresses without a noun (phases 0,
        // 1, 2, 6 and 10 all say "guard"), and phase 5 shows what naming the
        // other one looks like. So the guard stands down where it stands, and
        // the weapon arm, unnamed, tucks. The two differ only in height here --
        // the guard keeps the selected one, the tuck is always MID -- so on the
        // one cycle in three where the clock has selected MID this phase emits
        // two identical arm rows. That is a coincidence of the two clocks and
        // not a collapse of the rule, which is why
        // `the_script_tucks_the_arm_no_action_named` asserts only that an
        // unnamed arm *is* the tuck and never that a named one is not.
        _ => Phase {
            move_dir: Vec2::ZERO,
            body_yaw: toward,
            attack: false,
            guard: Some(guard(QUARTER, Fx::ZERO)),
            weapon: None,
        },
    };

    // "If no opponent is visible, attack phases become Hold/rest without
    // inventing geometry." The geometry that would be invented is the eighth
    // turn either side of a line to nobody; `toward` has already degenerated to
    // the body's own yaw, so the honest answer is the phase-5 rest and a Hold
    // whose payload target is the canonical zero identity.
    let (intent, weapon) = match (phase.attack, obs.opponents().first()) {
        (true, Some(opponent)) => (Intent::Attack(opponent.id), phase.weapon),
        (true, None) => (Intent::Hold, Some(rest)),
        (false, _) => (Intent::Hold, phase.weapon),
    };

    // Guard first, weapon second, so that the one body where the two roles
    // collide resolves the way phase 5 argues it should.
    let mut arms = [tucked(phase.body_yaw); 2];
    if let Some(target) = phase.guard {
        arms[roles.guard] = target;
    }
    if let Some(target) = weapon {
        arms[roles.weapon] = target;
    }
    // And the off arm last, unconditionally, overwriting whatever the table
    // just said about it. Written as an override rather than as a condition
    // threaded through the twelve phases above so that the phase table stays a
    // transcription of the reference and the whole of the departure from it is
    // one line -- which is also what makes it one line to undo.
    //
    // **The arm that is not the weapon arm**, read off [`ArmRoles`] rather than
    // hardcoded to index 0. On the shipped roster those are the same thing: a
    // Fighter's off arm is its left shield hand, a Brute's is its empty left.
    // They part company on a body that has lost its right arm, where the script
    // moves the weapon to the left -- and there the stump is what should be
    // holding still, not the one live hand.
    //
    // The one thing the pose reads is whether that hand holds anything, which
    // is a published observation column and not a scenario fact -- so it
    // answers a severed stump and a dropped shield the same way it answers a
    // Brute, without this side of the seam knowing what any of them are.
    //
    // **The guard height is the same clock and no new input.** The script
    // already walks the three heights on the ninety-tick clock for the arm that
    // strikes; the arm that guards reads that clock half a step early, so the
    // off arm gains a column without the script gaining a decision. A guard
    // that read the opponent's hand would be a reaction, and this file measures
    // the physics rather than the tuning -- reading the threat is exactly the
    // edge v2-19 hands to a learned policy, and it is why that session is
    // blocked on this one.
    let off = 1 - roles.weapon;
    // The threat is read from the same selected opponent every other bearing in
    // this file reads, and it is `None` exactly when the phase table above also
    // declined to invent geometry for a fight with nobody in it.
    let threat = obs.opponents().first().is_some().then(|| bearing_to(obs));
    arms[off] = off_hand(
        phase.body_yaw, threat, guard_height, obs.arms[off].equipment.is_some(),
    );

    ArticulatedCommandV1 {
        move_dir: phase.move_dir,
        body_yaw: phase.body_yaw,
        intent,
        arms,
        grips: [GripRequest::Keep; 2],
        // None of the scripts in this file carries a bow, and a script that
        // asked to loose while holding a blade would be asking for nothing.
        // The verb belongs to whichever policy gets a ranged loadout first.
        releases: [ReleaseRequest::Keep; 2],
    }
}

/// The control condition's command: commit, alternate, repeat.
///
/// Everything the composed script spends ticks on that is not a commit -- the
/// chamber that puts the blade somewhere it can accelerate from, the guard, the
/// withdrawal, the rest that lets an actuator shed fatigue -- is gone, and the
/// blade simply swings between the two endpoints phase 4 commits to, thirty
/// ticks apart, at full effort forever.
///
/// **Two things the reference leaves to be decided, and both are decided in the
/// direction that keeps the comparison about the arms.** It says the windmill
/// "otherwise uses the same target/yaw and grips as the composed script", which
/// names neither the feet nor the height. The feet approach at the same speed
/// phase 0 approaches at, every tick -- a windmill that never closed would never
/// touch anybody, its damage would be zero by geometry rather than by
/// technique, and the efficiency ratio the gate computes would be measuring the
/// walk. The height follows the same `(tick / 90) % 3` clock, so the only thing
/// that differs between the two corpora is what the arm does with the thirty
/// ticks it is given.
pub fn windmill_articulated_command(obs: &ArticulatedObservation) -> ArticulatedCommandV1 {
    let toward = bearing_to(obs);
    let roles = ArmRoles::of(obs);
    let height = HEIGHTS[((obs.tick / HEIGHT_TICKS) % 3) as usize];
    let guard_height = HEIGHTS[(((obs.tick + GUARD_LEAD_TICKS) / HEIGHT_TICKS) % 3) as usize];
    let endpoint = if (obs.tick / PHASE_TICKS) % 2 == 0 {
        toward + EIGHTH_TURN
    } else {
        toward - EIGHTH_TURN
    };

    let (intent, weapon) = match obs.opponents().first() {
        Some(opponent) => (
            Intent::Attack(opponent.id),
            ArmTarget { bearing: endpoint, height, reach: Fx::ONE, effort: Fx::ONE },
        ),
        // The same "no geometry out of nothing" rule the script follows. A
        // windmill with nobody to swing at is still a windmill the moment
        // somebody walks into sight, which is all this arm has to preserve.
        None => (
            Intent::Hold,
            ArmTarget { bearing: toward, height, reach: QUARTER, effort: Fx::ZERO },
        ),
    };

    // The same off-hand override the composed script applies, so that the two
    // corpora still differ only in what the *weapon* arm does with its thirty
    // ticks. A windmill that kept a swinging shield while the script parked one
    // would be a comparison of two changes.
    //
    // **The guard height is the composed script's guard height**, half a step
    // ahead of the swing beside it, for exactly that reason: the control's
    // whole claim is that it edits the weapon arm and nothing else, so its
    // guard has to read the clock the script's guard reads, lead included. A
    // windmill guarding on a different schedule would make the difference
    // between the two corpora a difference of two things.
    let mut arms = [tucked(toward); 2];
    arms[roles.weapon] = weapon;
    let off = 1 - roles.weapon;
    // Same guard rule as the composed script's, threat included, for the reason
    // above: the control's claim is that it edits the weapon arm and nothing
    // else. Here `toward` is already the bearing to the opponent, so the arc
    // offset is zero and this is the body's own facing anyway -- but reading it
    // through the same function keeps that a fact about the geometry rather than
    // a second guard rule that happens to agree today.
    let threat = obs.opponents().first().is_some().then(|| bearing_to(obs));
    arms[off] = off_hand(toward, threat, guard_height, obs.arms[off].equipment.is_some());

    ArticulatedCommandV1 {
        move_dir: heading(toward, APPROACH_SPEED),
        body_yaw: toward,
        intent,
        arms,
        grips: [GripRequest::Keep; 2],
        releases: [ReleaseRequest::Keep; 2],
    }
}

/// The twelve-phase script, as an [`ArticulatedPolicy`].
#[derive(Clone, Copy, Debug, Default)]
pub struct ScriptedArticulatedPolicy;

impl ArticulatedPolicy for ScriptedArticulatedPolicy {
    fn decide(&mut self, obs: &ArticulatedObservation) -> ArticulatedCommandV1 {
        scripted_articulated_command(obs)
    }
}

/// The control condition, as an [`ArticulatedPolicy`].
#[derive(Clone, Copy, Debug, Default)]
pub struct WindmillArticulatedPolicy;

impl ArticulatedPolicy for WindmillArticulatedPolicy {
    fn decide(&mut self, obs: &ArticulatedObservation) -> ArticulatedCommandV1 {
        windmill_articulated_command(obs)
    }
}

/// The composed script with [`AttackFootwork::Closing`] feet.
///
/// **A second control and not a second script.** It exists so that `lab
/// articulated --attack-moves` can measure the one cell the reference leaves
/// unstated without anything that speaks for `ARPG-SCRIPT-V1` changing by a
/// byte, and it should be deleted the moment the reference says which reading
/// it meant -- either because `Planted` was right and there is nothing left to
/// measure, or because `Closing` was, and then this becomes the script rather
/// than staying a policy beside it.
///
/// **Its guard height is the script's, and it has no call site of its own to
/// choose one at.** That is the control's defining property rather than an
/// omission: it calls [`scripted_articulated_command_with`], so every column
/// except the four move cells is the composed script's by construction, and
/// `the_closing_control_changes_four_move_columns_and_nothing_else` is what
/// keeps a future edit from quietly giving it a second difference.
#[derive(Clone, Copy, Debug, Default)]
pub struct ClosingAttackControlPolicy;

impl ArticulatedPolicy for ClosingAttackControlPolicy {
    fn decide(&mut self, obs: &ArticulatedObservation) -> ArticulatedCommandV1 {
        scripted_articulated_command_with(obs, AttackFootwork::Closing)
    }
}

/// The ASCII domain prefix of [`script_digest`], on the precedent
/// `ARPG-CONTACT-V1` and `ARPG-STATE` set: a bare FNV of a byte stream is a
/// number that any other byte stream can collide with by accident, and a domain
/// prefix is the cheapest way to make "this is a command stream" part of what
/// was hashed.
pub const SCRIPT_DIGEST_DOMAIN: &[u8] = b"ARPG-SCRIPT-V1";

/// One run's stored articulated command stream, as eight bytes.
///
/// **The stream is what the world *stored*, not what a policy offered**, which
/// is the same distinction [`crate::run_articulated`] draws for the replay it
/// records: a refused submission stores the neutral command, and the run that
/// happened is the one built out of stored commands. Feeding this the offered
/// commands would produce a digest for a fight nobody had.
///
/// Each record contributes the tick, the subject's index and generation, and
/// then the canonical 51-byte payload -- little-endian throughout, because
/// [`Hash64`] writes integers little-endian and the payload is little-endian by
/// its own contract. The full identity and not just the index: a replay
/// outliving a slot reuse would otherwise hash two different fighters the same.
/// The record count goes in last so that a stream cannot be extended by a
/// record whose bytes happen to be zero.
///
/// A [`SubmittedCommand::Legacy`] record contributes nothing and is not counted.
/// It cannot occur -- a persisted replay has exactly one active command vector,
/// selected by the scenario's combat model -- and the alternative to skipping it
/// is a panic in a measurement path, which trades an impossible wrong number for
/// an impossible dead lab.
pub fn script_digest(records: &[SubmittedCommandRecord]) -> u64 {
    let mut h = Hash64::new();
    h.write_bytes(SCRIPT_DIGEST_DOMAIN);
    let mut counted = 0u32;
    for record in records {
        let SubmittedCommand::Articulated(command) = record.command else {
            continue;
        };
        h.write_u32(record.tick);
        h.write_u32(record.entity.index);
        h.write_u32(record.entity.generation);
        h.write_bytes(&command.payload_bytes());
        counted += 1;
    }
    h.write_u32(counted);
    h.finish()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{run_articulated, RunConfig};
    use fx::Vec3;
    use sim::{EntityId, Replay, Scenario, World};

    /// A Fighter looking east with a Brute four units due east of it: shield
    /// left, sword right, and a `toward` of exactly [`Angle::ZERO`] so that a
    /// hand-written expectation can be spelled with raw constants.
    fn fighter_facing(tick: u32) -> ArticulatedObservation {
        let mut obs = ArticulatedObservation::BLANK;
        obs.tick = tick;
        obs.subject = EntityId::new(0, 0);
        obs.body_yaw = Angle::ZERO;
        obs.capabilities = ArticulatedObservation::MOVEMENT
            | ArticulatedObservation::TURNING
            | ArticulatedObservation::LEFT_GRIP
            | ArticulatedObservation::RIGHT_GRIP
            | ArticulatedObservation::RIGHT_WEAPON
            | ArticulatedObservation::SHIELD;
        obs.arms[0].equipment = Some(2);
        obs.arms[1].equipment = Some(1);
        obs.opponent_count = 1;
        obs.opponents[0].id = EntityId::new(1, 0);
        obs.opponents[0].body_position = Vec3::new(Fx::from_int(4), Fx::ZERO, Fx::ZERO);
        obs
    }

    /// The same geometry with a Brute as the subject: club right, empty left,
    /// no shield, so guard and weapon are one arm.
    fn brute_facing(tick: u32) -> ArticulatedObservation {
        let mut obs = fighter_facing(tick);
        obs.capabilities = ArticulatedObservation::MOVEMENT
            | ArticulatedObservation::TURNING
            | ArticulatedObservation::RIGHT_GRIP
            | ArticulatedObservation::RIGHT_WEAPON;
        obs.arms[0].equipment = None;
        obs.arms[1].equipment = Some(3);
        obs
    }

    fn arm(bearing: Angle, height: CombatHeight, reach: Fx, effort: Fx) -> ArmTarget {
        ArmTarget { bearing, height, reach, effort }
    }

    /// The guard's clock, for the tests whose subject is *which* pose lands on
    /// the off arm rather than which height it holds.
    ///
    /// Written once here and never inlined, and it is deliberately the same
    /// expression the script uses: the hand-written witness for this formula is
    /// `the_twelve_phases_are_the_reference_table_written_out_by_hand`'s
    /// `guards` table, and a second hand transcription in every test that
    /// happens to need a height would be four more places to get it wrong.
    fn guard_clock(tick: u32) -> CombatHeight {
        HEIGHTS[(((tick + GUARD_LEAD_TICKS) / HEIGHT_TICKS) % 3) as usize]
    }

    #[test]
    fn a_fighter_guards_with_its_shield_and_a_brute_with_its_club() {
        // The role assignment is read out of the capability mask, so it has to
        // survive a body that has no shield at all -- and on that body the two
        // roles land on the same arm, which is the collision phase 5 resolves.
        assert_eq!(ArmRoles::of(&fighter_facing(0)), ArmRoles { guard: 0, weapon: 1 });
        assert_eq!(ArmRoles::of(&brute_facing(0)), ArmRoles { guard: 1, weapon: 1 });
        // And a body holding nothing still answers, because the script is total.
        assert_eq!(
            ArmRoles::of(&ArticulatedObservation::BLANK),
            ArmRoles { guard: 1, weapon: 1 }
        );

        // A Fighter that has lost the arm its sword was in. The shield is still
        // bound, so it still guards with it -- and the attack phases name the
        // *left* arm rather than the stump, which is the one thing that stops
        // this body from tucking its only working arm a third of every cycle to
        // swing something that is not there.
        let mut maimed = fighter_facing(0);
        maimed.capabilities = ArticulatedObservation::MOVEMENT
            | ArticulatedObservation::TURNING
            | ArticulatedObservation::LEFT_GRIP
            | ArticulatedObservation::SHIELD;
        maimed.arms[1].equipment = None;
        maimed.arms[1].severed = true;
        assert_eq!(ArmRoles::of(&maimed), ArmRoles { guard: 0, weapon: 0 });
        let cutting = scripted_articulated_command(&{
            let mut obs = maimed;
            obs.tick = 4 * PHASE_TICKS;
            obs
        });
        assert_ne!(cutting.arms[0], tucked(cutting.body_yaw));
        // The stump, and therefore the off arm, so it holds the pose rather
        // than the tuck. Reading `off_hand` and not `tucked` here is the one
        // place the override's use of [`ArmRoles::weapon`] rather than a
        // hardcoded index is observable -- and `holding` is false, because a
        // severed arm holds nothing, so a stump rests at the resting reach
        // rather than held out at a guard's. Phase 4 of cycle 0 selects MID,
        // which is the guard height a stump is given here for the same reason
        // it is given a reach: the rule is one rule and the hand only chooses
        // the reach.
        assert_eq!(cutting.arms[1],
            off_hand(cutting.body_yaw, threat_of(&maimed), CombatHeight::MID, false));
        assert_eq!(cutting.arms[1].reach, QUARTER);

        // Losing the shield arm instead leaves the ordinary answer: no shield to
        // guard with, so the sword arm does both jobs, exactly as a Brute does.
        let mut shieldless = fighter_facing(0);
        shieldless.capabilities = ArticulatedObservation::MOVEMENT
            | ArticulatedObservation::TURNING
            | ArticulatedObservation::RIGHT_GRIP
            | ArticulatedObservation::RIGHT_WEAPON;
        shieldless.arms[0].equipment = None;
        shieldless.arms[0].severed = true;
        assert_eq!(ArmRoles::of(&shieldless), ArmRoles { guard: 1, weapon: 1 });
    }

    #[test]
    fn the_twelve_phases_are_the_reference_table_written_out_by_hand() {
        // The expectation is spelled out rather than computed, because a test
        // that rebuilt the command from the same helpers would agree with any
        // mistake they contained. This is the reference table transcribed:
        // Fighter, `toward` due east, first cycle (so left cuts).
        //
        // The heights are hand-resolved too. Ninety ticks is exactly three
        // phases, so within the first cycle phases 0-2 are LOW, 3-5 MID, 6-8
        // HIGH and 9-11 LOW again -- and because 360 is not a multiple of 270
        // the alignment slides by one height every cycle, which is what stops
        // the script from only ever cutting at one height.
        let low = CombatHeight::LOW;
        let mid = CombatHeight::MID;
        let high = CombatHeight::HIGH;
        let east = Angle::ZERO;
        let tuck = arm(east, mid, QUARTER, Fx::ZERO);
        let half = Fx::HALF;
        let one = Fx::ONE;
        let zero = Fx::ZERO;
        // The off arm's two poses, spelled out here rather than called for, on
        // the same principle as everything else in this table: a transcription
        // that reached for the helper would agree with any mistake in it. Both
        // take the commanded yaw as well as the height, because phase 10 is the
        // one row whose yaw is not `east` and a body-frame pose goes with it.
        //
        // A Fighter's off hand carries the shield and holds a guard; a Brute's
        // is empty and rests where an arm nothing is driving hangs. Everything
        // in the pose except the height is still one value for the whole fight,
        // which is the sense in which the arm is still not being driven.
        let held = |yaw, height| arm(yaw, height, THREE_QUARTERS, half);
        let empty = |yaw, height| arm(yaw, height, QUARTER, half);
        // All three heights on both branches, so a pose that quietly ignored
        // its argument would fail here rather than only in a corpus.
        // `None` threat throughout: this table is the *pose* transcription, and
        // with nothing visible the bearing is the commanded yaw exactly, which
        // is what these rows were written against. The bearing column's own
        // behaviour is `a_bodiless_guard_arc_is_clamped_rather_than_wrapped`.
        assert_eq!(held(east, low), off_hand(east, None, low, true));
        assert_eq!(held(east, mid), off_hand(east, None, mid, true));
        assert_eq!(held(east + EIGHTH_TURN, high),
            off_hand(east + EIGHTH_TURN, None, high, true));
        assert_eq!(empty(east, high), off_hand(east, None, high, false));
        assert_eq!(empty(east, mid), off_hand(east, None, mid, false));
        assert_eq!(empty(east + EIGHTH_TURN, low),
            off_hand(east + EIGHTH_TURN, None, low, false));
        // The empty pose is the tuck's reach at the static hand's effort, and
        // that reach is the joint's own floor. Both halves are load-bearing:
        // the first is what keeps an idle arm's collider the length the
        // reference table always gave it, the second is what says no shorter
        // resting reach was available to choose.
        assert_eq!(empty(east, mid).reach, tuck.reach);
        assert_eq!(empty(east, mid).reach, Fx::from_raw(sim::ARM_MIN_REACH_RAW));
        assert_ne!(empty(east, mid).effort, tuck.effort);

        // **The guard's height column, hand-resolved per tick and not per
        // phase**, because [`GUARD_LEAD_TICKS`] puts the guard clock half a
        // step ahead of the phase grid: `(tick + 45) / 90` steps at ticks 45,
        // 135, 225 and 315, which fall in the middle of phases 1, 4, 7 and 10.
        // Those four rows therefore carry two different heights across the two
        // ticks this table checks, and the eight others carry one twice. That
        // asymmetry is the whole visible consequence of the lead, and writing
        // it out is cheaper than a reader deriving it.
        let guards: [(CombatHeight, CombatHeight); 12] = [
            (low, low),  (low, mid),  (mid, mid),
            (mid, mid),  (mid, high), (high, high),
            (high, high),(high, low), (low, low),
            (low, low),  (low, mid),  (mid, mid),
        ];

        // The three feet. Written as exact vectors and not as "it moved",
        // because a direction is half of what the table states and the half that
        // a weaker assertion hides: a phase 9 that withdrew *toward* the
        // opponent would satisfy "nonzero" perfectly. Exact is available here
        // because due east and due west have exact sines and cosines, so
        // `with_length` sees a length of exactly one and rescales without
        // rounding.
        let advance = Vec2::new(APPROACH_SPEED, Fx::ZERO);
        let retreat = Vec2::new(-WITHDRAW_SPEED, Fx::ZERO);
        let planted = Vec2::ZERO;

        // (phase, move, yaw, attacks, right arm)
        //
        // **Two transcriptions and not one, since the off arm stopped moving.**
        // A Fighter's guard clause lands on its shield arm and is overwritten,
        // so its left arm is the pose and not the table's guard rows, which are
        // unobservable on this body. They land on the club of a Brute, whose
        // guard arm *is* its weapon arm -- so the second table is where phases
        // 0, 1, 2, 6, 9, 10 and 11 are actually checked against the reference,
        // and the first is where the attack rows and the tuck rule are.
        //
        // The left column is gone from both tables and lives in `guards` above,
        // because the off arm's height no longer holds for a whole phase: it is
        // built per tick in the loop from that hand-written pair and the row's
        // own yaw, and its reach is the one constant that separates the two
        // bodies.
        let fighter: [(u32, Vec2, Angle, bool, ArmTarget); 12] = [
            (0, advance, east, false, tuck),
            (1, advance, east, false, tuck),
            (2, planted, east, false, tuck),
            (3, planted, east, true, arm(east - EIGHTH_TURN, mid, THREE_QUARTERS, one)),
            (4, planted, east, true, arm(east + EIGHTH_TURN, mid, one, one)),
            // The one place the rest and the tuck coincide, because this phase
            // of this cycle is at MID and the tuck is always at MID. They part
            // company next cycle; `a_brute_resting_stands_its_club_down...`
            // pins the rest where the two are distinguishable.
            (5, planted, east, false, arm(east, mid, QUARTER, zero)),
            (6, planted, east, false, tuck),
            (7, planted, east, true, arm(east, high, QUARTER, one)),
            (8, planted, east, true, arm(east, high, one, one)),
            (9, retreat, east, false, tuck),
            (10, planted, east + EIGHTH_TURN, false,
                 arm(east + EIGHTH_TURN, mid, QUARTER, zero)),
            (11, planted, east, false, tuck),
        ];
        let brute: [(u32, Vec2, Angle, bool, ArmTarget); 12] = [
            (0, advance, east, false, arm(east, low, half, half)),
            (1, advance, east, false, arm(east, low, half, half)),
            (2, planted, east, false, arm(east, low, half, THREE_QUARTERS)),
            (3, planted, east, true, arm(east - EIGHTH_TURN, mid, THREE_QUARTERS, one)),
            (4, planted, east, true, arm(east + EIGHTH_TURN, mid, one, one)),
            // Phase 5's collision: the weapon clause is written below the guard
            // clause and therefore wins, so the club rests rather than guarding.
            (5, planted, east, false, arm(east, mid, QUARTER, zero)),
            // Guard one step *past* HIGH, which wraps to LOW.
            (6, planted, east, false, arm(east, low, THREE_QUARTERS, one)),
            (7, planted, east, true, arm(east, high, QUARTER, one)),
            (8, planted, east, true, arm(east, high, one, one)),
            (9, retreat, east, false, arm(east, low, half, zero)),
            // The guard stays on the line while the shoulders turn off it, so
            // this is the one row whose two arms disagree about the yaw.
            (10, planted, east + EIGHTH_TURN, false, arm(east, low, half, half)),
            (11, planted, east, false, arm(east, low, QUARTER, zero)),
        ];

        for (body, table) in [("fighter", fighter), ("brute", brute)] {
            for (phase, move_dir, yaw, attacks, right) in table {
                // The first tick of the phase and the last, so a boundary off by
                // one shows up as two failures rather than none -- and, since
                // the guard clock steps mid-phase, the pair that shows a lead
                // that stopped leading.
                for (at_end, tick) in
                    [(false, phase * PHASE_TICKS), (true, phase * PHASE_TICKS + PHASE_TICKS - 1)]
                {
                    let obs = if body == "fighter" { fighter_facing(tick) } else { brute_facing(tick) };
                    let command = scripted_articulated_command(&obs);
                    let at = format!("{body} phase {phase} tick {tick}");
                    let guard = if at_end { guards[phase as usize].1 } else { guards[phase as usize].0 };
                    // **The off arm bears `east` in every row, including phase
                    // 10 where the body yaw does not.** Written as the literal
                    // rather than from `yaw`, because that one divergence is
                    // the whole of what freeing the guard bearing did: these
                    // fixtures put the opponent due east, phase 10 turns the
                    // body by an eighth and `GUARD_ARC` is an eighth, so the
                    // guard sits exactly on its arc end and stays on the
                    // opponent instead of riding the shoulders around. Before
                    // 2026-08-16 this read `yaw` and phase 10 was the only row
                    // that changed when it stopped.
                    let left =
                        if body == "fighter" { held(east, guard) } else { empty(east, guard) };
                    assert_eq!(command.body_yaw, yaw, "{at}: yaw");
                    assert_eq!(command.arms[0], left, "{at}: left arm");
                    assert_eq!(command.arms[1], right, "{at}: right arm");
                    assert_eq!(command.grips, [GripRequest::Keep; 2], "{at}: grips");
                    assert_eq!(
                        command.intent,
                        if attacks { Intent::Attack(EntityId::new(1, 0)) } else { Intent::Hold },
                        "{at}: intent"
                    );
                    assert_eq!(command.move_dir, move_dir, "{at}: feet");
                }
            }
        }
    }

    #[test]
    fn the_script_tucks_the_arm_no_action_named() {
        // Stated as its own claim rather than left implicit in the table above,
        // because it is the rule the table's four attack phases lean on: a
        // Fighter mid-cut has nothing holding its shield up, and that is the
        // reference's answer and not an oversight in the transcription.
        //
        // Only the positive half is asserted -- "an unnamed arm is exactly the
        // tuck" -- and deliberately not its converse. A named arm can coincide
        // with the tuck when the clock happens to have selected MID and the
        // phase happens to ask for a quarter reach at no effort, so "differs
        // from the tuck" is not a test of naming, it is a test of the height
        // clock's phase. Three cycles, because that is the period over which
        // the phase and height clocks realign.
        for cycle in 0..3u32 {
            for phase in 0..12u32 {
                let tick = cycle * CYCLE_TICKS + phase * PHASE_TICKS;
                let command = scripted_articulated_command(&fighter_facing(tick));
                let tuck = tucked(command.body_yaw);
                // The shield arm mid-attack was the sharpest case of the rule
                // and is no longer a case of it at all: the off-arm override
                // reaches every phase, so on a Fighter the tuck now only ever
                // appears on the weapon arm. Asserted rather than dropped,
                // because "the off arm is never the tuck" is the property that
                // says the override actually runs last.
                //
                // The height is read off the clock rather than hand-resolved
                // here, deliberately: this test is about *which* pose lands on
                // the off arm, and the twelve-phase transcription above is
                // where the clock itself is checked against a table somebody
                // wrote by hand.
                assert_eq!(
                    command.arms[0],
                    off_hand(command.body_yaw, threat_of(&fighter_facing(tick)),
                        guard_clock(tick), true),
                    "tick {tick}: the off arm"
                );
                if !matches!(phase, 3 | 4 | 5 | 7 | 8) {
                    assert_eq!(command.arms[1], tuck, "tick {tick}: the weapon arm");
                }
            }
        }
    }

    /// The threat the production path feeds [`off_hand`], recomputed from an
    /// observation so an expectation cannot quietly assume the welded bearing.
    ///
    /// Load-bearing at phase 10, whose commanded yaw is an eighth turn off the
    /// line to the opponent -- exactly [`GUARD_ARC`] -- so that is the one row
    /// where a guard that tracked nothing and a guard that tracks the threat
    /// give different answers.
    fn threat_of(obs: &ArticulatedObservation) -> Option<Angle> {
        obs.opponents().first().is_some().then(|| bearing_to(obs))
    }

    /// [`GUARD_ARC`] bounded at both ends, and clamped rather than wrapped.
    ///
    /// "Bodiless" is the no-opponent case: with nothing visible there is no
    /// threat to track and the guard must return the body's own facing
    /// **exactly**, which is what makes freeing the bearing provably inert on a
    /// body fighting nobody.
    #[test]
    fn a_bodiless_guard_arc_is_clamped_rather_than_wrapped() {
        let yaw = Angle::from_raw(10_000);
        let arc = GUARD_ARC.raw() as i32;

        // Bodiless: exactly the yaw, not an arc centred on a bearing to nobody.
        assert_eq!(guard_bearing(yaw, None), yaw);

        // Inside the arc, the threat is tracked exactly, both ways.
        let near_left = yaw + Angle::from_raw(4_096);
        assert_eq!(guard_bearing(yaw, Some(near_left)), near_left);
        let near_right = yaw - Angle::from_raw(4_096);
        assert_eq!(guard_bearing(yaw, Some(near_right)), near_right);

        // Both ends clamp, to opposite arc ends rather than to one shared
        // answer -- which is what a wrap or a sign error would give.
        let clamped_left = guard_bearing(yaw, Some(yaw + Angle::QUARTER));
        let clamped_right = guard_bearing(yaw, Some(yaw - Angle::QUARTER));
        assert_eq!(clamped_left.delta(yaw), arc);
        assert_eq!(clamped_right.delta(yaw), -arc);
        assert_ne!(clamped_left, clamped_right);

        // A threat directly behind is the wrap trap: it must clamp to an arc
        // end, never fold back to a small offset near the body's own facing.
        assert_eq!(guard_bearing(yaw, Some(yaw + Angle::HALF)).delta(yaw).abs(), arc,
            "a threat behind the body folded back inside the arc instead of clamping");

        // The arc is strictly inside a quarter turn, which is the property that
        // keeps the plate off edge-on now that the normal follows this bearing.
        assert!(GUARD_ARC.raw() < Angle::QUARTER.raw(),
            "an arc at or past a quarter turn puts the plate edge-on to a frontal attack");
    }

    #[test]
    fn a_brute_resting_stands_its_club_down_rather_than_guarding_with_it() {
        // Phase 5's collision, resolved. On a body with no shield the "shield
        // remains guard" clause names nobody, so the arm that is both roles
        // takes the rest -- and the empty hand tucks, because nothing named it.
        //
        // Read one cycle in, at tick 510: phase 5 of cycle 1 selects HIGH, so
        // the rest and the tuck are different values and "it rested" is not the
        // same observation as "it was never named". At tick 150 the two agree,
        // which is exactly why that tick would prove nothing here.
        let command = scripted_articulated_command(&brute_facing(CYCLE_TICKS + 5 * PHASE_TICKS));
        assert_eq!(command.arms[1], arm(Angle::ZERO, CombatHeight::HIGH, QUARTER, Fx::ZERO));
        assert_ne!(command.arms[1], tucked(command.body_yaw));
        // Every other phase names at most one of the two roles, so the club is
        // whatever that single clause said and the left hand never holds
        // anything at all.
        for phase in 0..12u32 {
            for cycle in 0..3u32 {
                let tick = cycle * CYCLE_TICKS + phase * PHASE_TICKS;
                let command = scripted_articulated_command(&brute_facing(tick));
                let selected = guard_clock(tick);
                assert_eq!(
                    command.arms[0],
                    off_hand(command.body_yaw, threat_of(&brute_facing(tick)), selected, false),
                    "tick {tick}: a Brute has nothing in its left hand to name"
                );
                // And "nothing to name" is the whole of why it rests where it
                // does. The empty pose and the shield's differ in exactly one
                // column -- the reach, at the same height -- so a Brute reading
                // the Fighter's would carry an arm-length capsule it has no
                // reason to carry.
                assert_ne!(
                    command.arms[0],
                    off_hand(command.body_yaw, threat_of(&brute_facing(tick)), selected, true),
                    "tick {tick}: an empty hand held a guard's reach"
                );
            }
        }
    }

    #[test]
    fn an_empty_off_hand_does_not_lengthen_the_arm_it_hangs_from() {
        // **The mechanism the conditional reach exists for, measured rather
        // than argued.** `geometry::body_region_volumes` builds an arm region
        // as the capsule from the yaw-rotated shoulder to the hand, so the off
        // hand's reach *is* that capsule's length -- and on this roster
        // `integrity_maxima` gives an arm region the same maximum as the torso.
        // An empty hand held out at a guard's reach is therefore not a guard;
        // it is a torso-grade interceptor grown into the line, which is what
        // the corpus caught and what this pins.
        //
        // Both runs are the same script on the same fixture and the same seed,
        // differing in one commanded column. Read off the *observation* rather
        // than the anatomy, because the perception blur cancels in
        // `upper - lower` -- both endpoints carry the same measured origin --
        // so the length is exact even though the position it sits at is not.
        let brute_left_arm = |holding: bool| {
            let scenario = Scenario::articulated_duel();
            let mut world = World::new(&scenario, 0);
            let mut due: Vec<EntityId> = Vec::new();
            // Sixty ticks: long enough for a reach chase to cover the whole
            // quarter-to-three-quarters travel and settle, and short enough
            // that the two bodies are still closing a 10.8-unit gap, so no
            // contact has written a hand and the number is the pose's alone.
            for _ in 0..60 {
                due.clear();
                due.extend_from_slice(world.pending_decisions());
                for &id in &due {
                    let obs = world.observe_articulated(id);
                    let mut command = scripted_articulated_command(&obs);
                    if obs.arms[0].equipment.is_none() {
                        // MID and not the clock's selection, because this
                        // measurement is about the *reach* column and sixty
                        // ticks is not a whole height period: letting the
                        // height walk would put the two runs' capsules at
                        // different z values on the tick the number is read
                        // and confound the one column under test. The pinned
                        // pair below is therefore both arms at MID, which is
                        // also what they were before v2-20 gave the pose a
                        // height at all.
                        // `None` threat, so the guard holds the body's facing:
                        // this measurement is about the reach column, and a
                        // bearing that tracked the opponent would put the two
                        // runs' capsules at different bearings on the tick the
                        // number is read -- the same confound the height note
                        // above avoids.
                        command.arms[0] =
                            off_hand(command.body_yaw, None, CombatHeight::MID, holding);
                    }
                    let _ = world.submit_articulated_v1(id, command);
                }
                let _ = world.step();
            }
            let obs = world.observe_articulated(EntityId::new(0, 0));
            let brute = *obs.opponents().first().expect("the fixture spawns two bodies");
            let region = brute.regions[sim::BodyPart::LeftArm as usize];
            (region.upper - region.lower).length()
        };

        // A Brute stands two units tall with a 1.5-unit shoulder and a
        // 0.85-unit arm, and the static pose is at MID -- half of standing
        // height -- so the capsule drops half a unit and reaches
        // `0.85 * reach` forward. Spelled as raw fixed point because that is
        // what the assertion compares and because a decimal would round.
        let resting = brute_left_arm(false);
        let extended = brute_left_arm(true);
        assert_eq!(resting, Fx::from_raw(35_604), "the empty hand's capsule");
        // Smart51's odd-symmetric hand projection moves only this measured
        // endpoint by one raw unit; the empty-hand control above is unchanged.
        assert_eq!(extended, Fx::from_raw(53_095), "a guard's reach on the same hand");
        // Half an arm length of extra capsule, which is the whole finding: the
        // collider is 1.49x longer for nothing carried.
        assert!(extended - resting > Fx::from_ratio(1, 4));
    }

    #[test]
    fn the_guard_height_walks_low_mid_high_every_ninety_ticks() {
        // **Read off a Brute for the guard phases and a Fighter for the attack
        // phases**, because the reference table's *guard clause* is only
        // observable there. A Fighter's guard clause lands on the overwritten
        // arm, so only its weapon phases -- 3, 4, 5, 7 and 8 -- report the
        // clause's selected height; a Brute guards with the arm it strikes
        // with, so every phase of that body reports one.
        //
        // Since v2-20 the *pose* on the overwritten arm reports the same clock
        // too, which is a second witness and not a replacement for this one:
        // it is [`off_hand`] reading the clock rather than the table's guard
        // row doing it, and the block at the end of this test is where that is
        // checked on both arms of both bodies.
        for (tick, height) in [
            (0u32, CombatHeight::LOW),
            (60, CombatHeight::LOW),
            (150, CombatHeight::MID),
            (270, CombatHeight::LOW),
            (330, CombatHeight::LOW),
        ] {
            let command = scripted_articulated_command(&brute_facing(tick));
            assert_eq!(command.arms[1].height, height, "brute tick {tick}");
        }
        for (tick, height) in [
            (90u32, CombatHeight::MID),
            (210, CombatHeight::HIGH),
            (269, CombatHeight::HIGH),
        ] {
            let command = scripted_articulated_command(&fighter_facing(tick));
            assert_eq!(command.arms[1].height, height, "fighter tick {tick}");
        }
        // Phase 6 is the exception and the reason the clock is worth having:
        // the guard steps one height past the selected one, which is what makes
        // a guarding arm move between two commands rather than sitting where it
        // was. At tick 180 the selection is HIGH, so the guard wraps to LOW.
        // Read on the Brute for the reason above -- this phase was written to
        // step a Fighter's shield and no longer reaches it.
        let stepped = scripted_articulated_command(&brute_facing(6 * PHASE_TICKS));
        assert_eq!(stepped.arms[1].height, CombatHeight::LOW);
        // Every ordinary height the script emits is one of the three raw
        // constants -- the intermediate 24,576 belongs to the Dev control and
        // never to this script. Both bodies and both arms.
        //
        // **And the off arm walks the same clock half a step early**, which is
        // the v2-20 claim and the one a Fighter's shield turns on: the plate is
        // the only thing on this roster whose height an opponent has to beat,
        // and it hangs on the arm the table's guard clause cannot reach. Phase
        // 6 is not an exception on that arm -- the pose ignores the phase
        // table, so the off arm is on its clock there as everywhere, while a
        // Brute's club steps one past the weapon's. That divergence is the
        // point of asserting the two separately.
        let mut led = 0;
        for tick in 0..CYCLE_TICKS * 3 {
            for obs in [fighter_facing(tick), brute_facing(tick)] {
                let command = scripted_articulated_command(&obs);
                for target in command.arms {
                    assert!(
                        HEIGHTS.contains(&target.height),
                        "tick {tick} emitted height raw {}",
                        target.height.raw()
                    );
                }
                let off = 1 - ArmRoles::of(&obs).weapon;
                assert_eq!(
                    command.arms[off].height, guard_clock(tick),
                    "tick {tick}: the off arm left the guard clock"
                );
            }
            if guard_clock(tick) != HEIGHTS[((tick / HEIGHT_TICKS) % 3) as usize] {
                led += 1;
            }
        }
        // **Exactly half the ticks, and that is the whole reason the lead is
        // half a step.** A lead of a whole `HEIGHT_TICKS` would put this at
        // 1080 -- the guard never at the swing's height rather than always at
        // it -- which is the same degenerate corpus relabelled and is why
        // `GUARD_LEAD_TICKS` is not 90.
        assert_eq!(led, (CYCLE_TICKS * 3 / 2) as i32, "the guard stopped leading by half a step");
        // The counterexample the assertions above need to mean anything: a
        // guard welded to MID would satisfy the weapon row of every
        // MID-selecting tick and this one nowhere.
        assert_eq!(
            scripted_articulated_command(&fighter_facing(2 * HEIGHT_TICKS)).arms[0].height,
            CombatHeight::HIGH,
            "the shield stayed at MID while its clock said HIGH"
        );
    }

    #[test]
    fn the_guard_lead_reaches_six_of_the_nine_height_pairs_and_never_the_other_three() {
        // **The honest half of [`GUARD_LEAD_TICKS`], asserted rather than left
        // to the corpus to reveal.** The lead breaks the lockstep and does not
        // finish the job: both clocks still have period `HEIGHT_TICKS`, so the
        // index difference `g - w` takes exactly two values however large the
        // offset is, and three of the nine (attack, guard) cells are therefore
        // unreachable *by construction* rather than merely unobserved.
        //
        // This runs on the arithmetic and not on a fight, so it is the claim
        // itself and not a sample of it -- and it is what should fail if
        // somebody "improves" the lead without giving the two clocks different
        // periods, which is the only thing that would actually close the gap.
        let mut cells = [[0u32; 3]; 3];
        for tick in 0..HEIGHT_TICKS * 3 {
            let weapon = ((tick / HEIGHT_TICKS) % 3) as usize;
            let guard = HEIGHTS
                .iter()
                .position(|h| *h == guard_clock(tick))
                .expect("the guard clock emits one of the three heights");
            cells[weapon][guard] += 1;
        }
        // Half aligned, half one step high, and the supercycle is 270 ticks.
        assert_eq!(cells, [[45, 45, 0], [0, 45, 45], [45, 0, 45]]);
        let occupied = cells.iter().flatten().filter(|count| **count > 0).count();
        let diagonal: u32 = (0..3).map(|i| cells[i][i]).sum();
        assert_eq!(occupied, 6, "the lead stopped reaching six of the nine cells");
        assert_eq!(diagonal * 2, HEIGHT_TICKS * 3, "the diagonal stopped being half");
        // Named individually, because "three cells are zero" is a fact a reader
        // has to translate and these three sentences are what it translates to:
        // a LOW attack never meets a HIGH guard, a MID attack never meets a LOW
        // guard, and a HIGH attack never meets a MID guard. The corpus reports
        // exactly zero in each, on all three scripts.
        assert_eq!(cells[0][2], 0, "a LOW attack met a HIGH guard");
        assert_eq!(cells[1][0], 0, "a MID attack met a LOW guard");
        assert_eq!(cells[2][1], 0, "a HIGH attack met a MID guard");
    }

    #[test]
    fn the_cut_reverses_on_every_second_cycle() {
        let east = Angle::ZERO;
        let commit = |tick| scripted_articulated_command(&fighter_facing(tick)).arms[1].bearing;
        // Phase 4 of cycle 0 and of cycle 1, and back again on cycle 2.
        assert_eq!(commit(4 * PHASE_TICKS), east + EIGHTH_TURN);
        assert_eq!(commit(CYCLE_TICKS + 4 * PHASE_TICKS), east - EIGHTH_TURN);
        assert_eq!(commit(2 * CYCLE_TICKS + 4 * PHASE_TICKS), east + EIGHTH_TURN);
        // And the chamber is always on the far side of the line from the commit,
        // which is the property that makes it a windup rather than a second cut.
        let chamber = |tick| scripted_articulated_command(&fighter_facing(tick)).arms[1].bearing;
        assert_eq!(chamber(3 * PHASE_TICKS), east - EIGHTH_TURN);
        assert_eq!(chamber(CYCLE_TICKS + 3 * PHASE_TICKS), east + EIGHTH_TURN);
    }

    #[test]
    fn every_bearing_is_the_line_to_the_opponent_and_not_the_body_facing() {
        // Every other fixture in this module stands a Fighter at `Angle::ZERO`
        // looking at an opponent due east, which makes `toward` and
        // `obs.body_yaw` the same number -- so a script that read the facing and
        // ignored the opponent entirely would pass all of them. This is the one
        // observation where the two disagree: the opponent is due *north* and
        // the body is still turned west.
        let mut obs = fighter_facing(0);
        obs.body_yaw = Angle::HALF;
        obs.opponents[0].body_position = Vec3::new(Fx::ZERO, Fx::from_int(4), Fx::ZERO);
        let north = Angle::QUARTER;

        let command = scripted_articulated_command(&obs);
        assert_eq!(command.body_yaw, north, "the script yaws at the opponent");
        assert_eq!(command.arms[0].bearing, north, "the guard points at the opponent");
        // The tuck rides the *commanded* yaw, so it turns with the shoulders
        // rather than staying where the body happened to be looking.
        assert_eq!(command.arms[1], tucked(north));
        // And the feet walk north, not west. Exact: north has an exact sine and
        // cosine, so `with_length` rescales a unit vector without rounding.
        assert_eq!(command.move_dir, Vec2::new(Fx::ZERO, APPROACH_SPEED));

        // The withdraw is the reverse of the same line and not of the facing.
        let mut withdrawing = obs;
        withdrawing.tick = 9 * PHASE_TICKS;
        let command = scripted_articulated_command(&withdrawing);
        assert_eq!(command.move_dir, Vec2::new(Fx::ZERO, -WITHDRAW_SPEED));
        assert_eq!(command.body_yaw, north);
    }

    #[test]
    fn nothing_in_sight_invents_no_geometry() {
        // The blank observation a Legacy world, a corpse and a stale handle all
        // answer, plus a live body that simply cannot see anybody yet -- which
        // is the fixture's own first second.
        for tick in 0..CYCLE_TICKS {
            let mut obs = fighter_facing(tick);
            obs.opponent_count = 0;
            obs.body_yaw = Angle::from_raw(9_001);
            let command = scripted_articulated_command(&obs);
            assert_eq!(command.intent, Intent::Hold, "tick {tick}");
            // Every bearing the command names is either the retained yaw or a
            // phase's own offset from it; none of them is a line to a body that
            // is not there.
            let offsets = [Angle::ZERO, EIGHTH_TURN];
            for target in command.arms {
                assert!(
                    offsets.iter().any(|&o| target.bearing == obs.body_yaw + o),
                    "tick {tick}: bearing {:?} came from nowhere",
                    target.bearing
                );
            }
            assert_eq!(
                scripted_articulated_command(&ArticulatedObservation::BLANK).intent,
                Intent::Hold
            );
        }
    }

    #[test]
    fn the_windmill_only_ever_commits() {
        // The control condition's whole claim: no chamber, no guard, no
        // withdrawal, no rest. So over a full script cycle the weapon arm is at
        // full reach and full effort on every single tick, the guard arm is
        // never anything but tucked, and the feet never reverse.
        for tick in 0..CYCLE_TICKS * 2 {
            let obs = fighter_facing(tick);
            let command = windmill_articulated_command(&obs);
            assert_eq!(command.arms[1].reach, Fx::ONE, "tick {tick}");
            assert_eq!(command.arms[1].effort, Fx::ONE, "tick {tick}");
            // The control's off arm is the script's off arm, which is what
            // keeps the two corpora a comparison of one thing -- including the
            // guard's half-step lead over the swing beside it. A windmill
            // guarding on a different schedule would make the difference
            // between the corpora a difference of two things.
            let selected = guard_clock(tick);
            assert_eq!(command.arms[0],
                off_hand(command.body_yaw, threat_of(&fighter_facing(tick)), selected, true),
                "tick {tick}");
            // Height, reach and effort and not the bearing: both poses ride
            // their own command's yaw, and the windmill never turns off the
            // line while the script's phase 10 does. That divergence is phase
            // 10's and not the pose's.
            let scripted = scripted_articulated_command(&obs).arms[0];
            assert_eq!(
                (command.arms[0].height, command.arms[0].reach, command.arms[0].effort),
                (scripted.height, scripted.reach, scripted.effort),
                "tick {tick}: the control's off arm parted from the script's"
            );
            // And the control reads the hand for the same reason the script
            // does: a windmill whose empty off arm stayed out while the
            // script's tucked would be a comparison of two changes.
            let brute = windmill_articulated_command(&brute_facing(tick));
            assert_eq!(brute.arms[0],
                off_hand(brute.body_yaw, threat_of(&brute_facing(tick)), selected, false),
                "brute tick {tick}");
            assert_eq!(command.intent, Intent::Attack(EntityId::new(1, 0)), "tick {tick}");
            assert!(command.move_dir.x > Fx::ZERO, "tick {tick}: the windmill backed off");
        }
        // And it alternates on the thirty-tick clock, between exactly the two
        // endpoints the composed script's commit uses.
        let bearing = |tick| windmill_articulated_command(&fighter_facing(tick)).arms[1].bearing;
        assert_eq!(bearing(0), Angle::ZERO + EIGHTH_TURN);
        assert_eq!(bearing(29), Angle::ZERO + EIGHTH_TURN);
        assert_eq!(bearing(30), Angle::ZERO - EIGHTH_TURN);
        assert_eq!(bearing(59), Angle::ZERO - EIGHTH_TURN);
        assert_eq!(bearing(60), Angle::ZERO + EIGHTH_TURN);
    }

    #[test]
    fn the_closing_control_changes_four_move_columns_and_nothing_else() {
        // The claim a control has to earn: it is one edit to one cell, so a
        // difference in the corpus it produces is attributable to that cell.
        // Asserted over three cycles and over both bodies, because the phase
        // and height clocks realign on three and because a Brute resolves
        // phase 5 differently and could hide a leak there.
        for tick in 0..CYCLE_TICKS * 3 {
            for obs in [fighter_facing(tick), brute_facing(tick)] {
                let planted = scripted_articulated_command(&obs);
                let closing = scripted_articulated_command_with(&obs, AttackFootwork::Closing);
                assert_eq!(planted.body_yaw, closing.body_yaw, "tick {tick}");
                assert_eq!(planted.intent, closing.intent, "tick {tick}");
                assert_eq!(planted.arms, closing.arms, "tick {tick}");
                assert_eq!(planted.grips, closing.grips, "tick {tick}");
                let attacking = matches!((tick % CYCLE_TICKS) / PHASE_TICKS, 3 | 4 | 7 | 8);
                if attacking {
                    assert_eq!(planted.move_dir, Vec2::ZERO, "tick {tick}");
                    assert_eq!(
                        closing.move_dir,
                        Vec2::new(APPROACH_SPEED, Fx::ZERO),
                        "tick {tick}: the control stopped closing"
                    );
                } else {
                    assert_eq!(planted.move_dir, closing.move_dir, "tick {tick}");
                }
            }
        }
        // And the default is the reference, so a caller that reaches for the
        // enum without choosing gets the script and not the control.
        assert_eq!(AttackFootwork::default(), AttackFootwork::Planted);
    }

    #[test]
    fn the_duel_never_submits_a_command_the_world_refuses() {
        // The load-bearing test for the whole checkpoint. A refused command is
        // replaced by the *neutral* one atomically, so a script that overreached
        // by a raw unit would quietly become a script for a body standing still
        // and every number the gate reports would describe that instead. Both
        // policies, both factions, and the full clock.
        for (name, mut policy) in [
            ("scripted", Box::new(ScriptedArticulatedPolicy) as Box<dyn ArticulatedPolicy>),
            ("windmill", Box::new(WindmillArticulatedPolicy)),
            ("closing", Box::new(ClosingAttackControlPolicy)),
        ] {
            let result = run_articulated(
                &Scenario::articulated_duel(),
                0,
                &mut policy,
                &RunConfig::default(),
            );
            assert_eq!(
                (result.rejected, result.first_rejection),
                (0, None),
                "{name} had a command refused"
            );
            assert!(result.decisions > 0, "{name} was never asked");
        }
    }

    #[test]
    fn a_scripted_run_is_reproducible_and_replays_exactly() {
        let scenario = Scenario::articulated_duel();
        let config = RunConfig { record: true, ..RunConfig::default() };
        let a = run_articulated(&scenario, 7, ScriptedArticulatedPolicy, &config);
        let b = run_articulated(&scenario, 7, ScriptedArticulatedPolicy, &config);
        assert_eq!(a.state_hash, b.state_hash);
        assert_eq!(a.ticks, b.ticks);
        let replay = a.replay.as_ref().expect("recording was requested");
        assert_eq!(replay.play().state_hash(), a.state_hash);

        // And the digest separates runs rather than merely agreeing with
        // itself. Two runs of one seed are provably the same byte stream, so
        // comparing *those* digests could only fail if `script_digest` were
        // nondeterministic; comparing two seeds is the claim worth making.
        let other = run_articulated(&scenario, 8, ScriptedArticulatedPolicy, &config);
        let other_replay = other.replay.as_ref().expect("recording was requested");
        assert_ne!(
            script_digest(&replay.submitted_entries),
            script_digest(&other_replay.submitted_entries),
            "two different fights share a command-stream digest"
        );
    }

    #[test]
    fn the_digest_is_the_byte_layout_the_reference_specifies() {
        // The expectation is transcribed from
        // `articulated-mechanical-gate.md` by hand, one byte at a time, and
        // never through `Hash64::write_u32` -- so the little-endian order, the
        // fourteen domain bytes, the fifty-one payload bytes and the trailing
        // record count are each asserted rather than assumed to agree with
        // whatever the implementation happened to call.
        //
        // The trailing count in particular has no other witness: any test that
        // changes the number of records also changes the payload stream, so an
        // implementation that dropped the final `u32` altogether passes every
        // mutation test and fails only this one.
        let scenario = Scenario::articulated_duel();
        let config = RunConfig { record: true, ..RunConfig::default() };
        let result = run_articulated(&scenario, 2, ScriptedArticulatedPolicy, &config);
        let all = &result.replay.as_ref().expect("recording was requested").submitted_entries;
        assert!(all.len() >= 2, "the byte-layout oracle needs two distinct records");
        let records = &all[..2];

        let mut expected = Hash64::new();
        for byte in b"ARPG-SCRIPT-V1" {
            expected.write_u8(*byte);
        }
        for record in records {
            let SubmittedCommand::Articulated(command) = record.command else {
                panic!("an articulated run records articulated commands");
            };
            for byte in record.tick.to_le_bytes() {
                expected.write_u8(byte);
            }
            for byte in record.entity.index.to_le_bytes() {
                expected.write_u8(byte);
            }
            for byte in record.entity.generation.to_le_bytes() {
                expected.write_u8(byte);
            }
            for byte in command.payload_bytes() {
                expected.write_u8(byte);
            }
        }
        for byte in (records.len() as u32).to_le_bytes() {
            expected.write_u8(byte);
        }
        assert_eq!(script_digest(records), expected.finish());
        assert_eq!(SCRIPT_DIGEST_DOMAIN, b"ARPG-SCRIPT-V1");
    }

    #[test]
    fn the_command_digest_reads_every_column_it_claims_to() {
        // A digest that ignored a column would let two different runs -- a
        // different tick, a different fighter, a different blade angle, a
        // truncated stream -- claim to be the same run, which is the one thing
        // it exists to prevent.
        let scenario = Scenario::articulated_duel();
        let mut replay = Replay::new(&scenario, 0);
        let world = World::new(&scenario, 0);
        let base = scripted_articulated_command(&world.observe_articulated(EntityId::new(0, 0)));
        replay.record_submitted(4, EntityId::new(0, 0), SubmittedCommand::Articulated(base));
        replay.record_submitted(9, EntityId::new(1, 0), SubmittedCommand::Articulated(base));
        let digest = script_digest(&replay.submitted_entries);

        let variants: [(&str, Box<dyn Fn(&mut Vec<SubmittedCommandRecord>)>); 5] = [
            ("tick", Box::new(|rows: &mut Vec<SubmittedCommandRecord>| rows[0].tick = 5)),
            ("index", Box::new(|rows: &mut Vec<SubmittedCommandRecord>| {
                rows[0].entity = EntityId::new(2, 0)
            })),
            ("generation", Box::new(|rows: &mut Vec<SubmittedCommandRecord>| {
                rows[0].entity = EntityId::new(0, 1)
            })),
            ("payload", Box::new(|rows: &mut Vec<SubmittedCommandRecord>| {
                let mut changed = base;
                changed.arms[1].bearing = changed.arms[1].bearing + Angle::from_raw(1);
                rows[0].command = SubmittedCommand::Articulated(changed);
            })),
            // Dropping a record removes its bytes as well as decrementing the
            // count, so this variant alone would pass an implementation that
            // never wrote the trailing `u32` at all.
            // `the_digest_is_the_byte_layout_the_reference_specifies` is what
            // covers the count itself.
            ("record", Box::new(|rows: &mut Vec<SubmittedCommandRecord>| {
                rows.truncate(1);
            })),
        ];
        for (column, mutate) in variants {
            let mut rows = replay.submitted_entries.clone();
            mutate(&mut rows);
            assert_ne!(digest, script_digest(&rows), "the digest ignores the {column}");
        }

        // And the domain is in it: an empty stream is not the empty FNV.
        let mut bare = Hash64::new();
        bare.write_u32(0);
        assert_ne!(script_digest(&[]), bare.finish());
    }
}
