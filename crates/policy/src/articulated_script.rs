//! The composed script, the windmill it is measured against, and the digest
//! that fingerprints what either of them actually submitted.
//!
//! **Nothing in here decides anything, and that is the point.** The phase is
//! `tick % 360`, the guard height is `tick / 90` and the cut side is
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
//! [`ScriptedArticulatedPolicy`] and [`WindmillArticulatedPolicy`] are both pure
//! functions of the observation, so neither implements `reset` -- there is no
//! per-run memory for the harness to clear.

use crate::ArticulatedPolicy;
use fx::{Angle, Fx, Hash64, Vec2};
use sim::{
    ArmTarget, ArticulatedCommandV1, ArticulatedObservation, CombatHeight, GripRequest, Intent,
    SubmittedCommand, SubmittedCommandRecord,
};

/// Ticks in one phase.
pub const PHASE_TICKS: u32 = 30;
/// Ticks in the full twelve-phase script.
pub const CYCLE_TICKS: u32 = PHASE_TICKS * 12;
/// Ticks the selected guard height holds before it steps.
pub const HEIGHT_TICKS: u32 = 90;

/// An eighth of a turn, raw.
///
/// Spelled out because [`Angle`] names [`Angle::QUARTER`] and [`Angle::HALF`]
/// and stops there, and the cut chamber offset is half a quarter. Written as a
/// constant rather than `Angle::QUARTER` halved so that the number in the
/// reference table and the number here are the same literal.
pub const EIGHTH_TURN: Angle = Angle::from_raw(8_192);

/// The three ordinary heights, in the order `(tick / 90) % 3` walks them.
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
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct ArmRoles {
    guard: usize,
    weapon: usize,
}

impl ArmRoles {
    fn of(obs: &ArticulatedObservation) -> ArmRoles {
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
fn tucked(body_yaw: Angle) -> ArmTarget {
    ArmTarget {
        bearing: body_yaw,
        height: CombatHeight::MID,
        reach: QUARTER,
        effort: Fx::ZERO,
    }
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
/// fourteen ticks when `move_dir` is zero, an equipment collider's velocity is
/// `body_velocity + arm.linear_velocity`, and the arm term alone -- 546 raw
/// per tick for a Fighter, 389 for a Brute, after `stat_factor` -- cannot
/// reach `CONTACT_ENERGY_FLOOR`. So a planted attack is provably incapable of
/// billing a single raw unit of damage, and 800/800 trials reaching the tick
/// limit measured that and not the physics.
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
        3 => Phase {
            move_dir: attack_feet,
            body_yaw: toward,
            attack: true,
            guard: None,
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
        // 6: guard one height up, hard. The phase that makes the shield move.
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

    ArticulatedCommandV1 {
        move_dir: phase.move_dir,
        body_yaw: phase.body_yaw,
        intent,
        arms,
        grips: [GripRequest::Keep; 2],
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

    let mut arms = [tucked(toward); 2];
    arms[roles.weapon] = weapon;

    ArticulatedCommandV1 {
        move_dir: heading(toward, APPROACH_SPEED),
        body_yaw: toward,
        intent,
        arms,
        grips: [GripRequest::Keep; 2],
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
        assert_eq!(cutting.arms[1], tucked(cutting.body_yaw));

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

        // (phase, move, yaw, attacks, left arm, right arm)
        let table: [(u32, Vec2, Angle, bool, ArmTarget, ArmTarget); 12] = [
            (0, advance, east, false, arm(east, low, half, half), tuck),
            (1, advance, east, false, arm(east, low, half, half), tuck),
            (2, planted, east, false, arm(east, low, half, THREE_QUARTERS), tuck),
            (3, planted, east, true, tuck, arm(east - EIGHTH_TURN, mid, THREE_QUARTERS, one)),
            (4, planted, east, true, tuck, arm(east + EIGHTH_TURN, mid, one, one)),
            // The one place the rest and the tuck coincide, because this phase
            // of this cycle is at MID and the tuck is always at MID. They part
            // company next cycle; `a_brute_resting_stands_its_club_down...`
            // pins the rest where the two are distinguishable.
            (5, planted, east, false, arm(east, mid, half, half), arm(east, mid, QUARTER, zero)),
            // Guard one step *past* HIGH, which wraps to LOW.
            (6, planted, east, false, arm(east, low, THREE_QUARTERS, one), tuck),
            (7, planted, east, true, tuck, arm(east, high, QUARTER, one)),
            (8, planted, east, true, tuck, arm(east, high, one, one)),
            (9, retreat, east, false, arm(east, low, half, zero), tuck),
            (10, planted, east + EIGHTH_TURN, false, arm(east, low, half, half),
                 arm(east + EIGHTH_TURN, mid, QUARTER, zero)),
            (11, planted, east, false, arm(east, low, QUARTER, zero), tuck),
        ];

        for (phase, move_dir, yaw, attacks, left, right) in table {
            // The first tick of the phase and the last, so a boundary off by one
            // shows up as two failures rather than none.
            for tick in [phase * PHASE_TICKS, phase * PHASE_TICKS + PHASE_TICKS - 1] {
                let command = scripted_articulated_command(&fighter_facing(tick));
                let at = format!("phase {phase} tick {tick}");
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
                if matches!(phase, 3 | 4 | 7 | 8) {
                    assert_eq!(command.arms[0], tuck, "tick {tick}: the shield arm mid-attack");
                }
                if !matches!(phase, 3 | 4 | 5 | 7 | 8) {
                    assert_eq!(command.arms[1], tuck, "tick {tick}: the weapon arm");
                }
            }
        }
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
                assert_eq!(
                    command.arms[0],
                    tucked(command.body_yaw),
                    "tick {tick}: a Brute has nothing in its left hand to name"
                );
            }
        }
    }

    #[test]
    fn the_guard_height_walks_low_mid_high_every_ninety_ticks() {
        // Read off whichever arm the phase at that tick names, avoiding phase 6
        // -- the one phase that deliberately names the *next* height instead.
        for (tick, arm_index, height) in [
            (0u32, 0usize, CombatHeight::LOW),
            (60, 0, CombatHeight::LOW),
            (90, 1, CombatHeight::MID),
            (150, 0, CombatHeight::MID),
            (210, 1, CombatHeight::HIGH),
            (269, 1, CombatHeight::HIGH),
            (270, 0, CombatHeight::LOW),
            (330, 0, CombatHeight::LOW),
        ] {
            let command = scripted_articulated_command(&fighter_facing(tick));
            assert_eq!(command.arms[arm_index].height, height, "tick {tick}");
        }
        // Phase 6 is the exception and the reason the clock is worth having:
        // the guard steps one height past the selected one, which is what makes
        // a shield move between two commands rather than sitting where it was.
        // At tick 180 the selection is HIGH, so the guard wraps to LOW.
        let stepped = scripted_articulated_command(&fighter_facing(6 * PHASE_TICKS));
        assert_eq!(stepped.arms[0].height, CombatHeight::LOW);
        // Every ordinary height the script emits is one of the three raw
        // constants -- the intermediate 24,576 belongs to the Dev control and
        // never to this script.
        for tick in 0..CYCLE_TICKS * 3 {
            for target in scripted_articulated_command(&fighter_facing(tick)).arms {
                assert!(
                    HEIGHTS.contains(&target.height),
                    "tick {tick} emitted height raw {}",
                    target.height.raw()
                );
            }
        }
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
            assert_eq!(command.arms[0], tucked(command.body_yaw), "tick {tick}");
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
        let records = &result.replay.as_ref().expect("recording was requested").submitted_entries;
        assert!(records.len() > 100, "too few records to be worth hashing");

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
