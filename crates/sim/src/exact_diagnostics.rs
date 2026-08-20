//! Cross-target digest for the retained ordinary exact-contact lifecycle.
//!
//! This is deliberately a feature-only diagnostic, not a second state hash.
//! It reruns one stored-command replay and then fingerprints both authority and
//! the evidence rows needed to review why that authority moved.

use crate::{AnatomyChoice, AnatomyState, ArmTarget, ArticulatedCommandV1, Body, BodyPart,
            CombatHeight, ContactKind, ContactResolution, DuelConfigV1,
            EmbodiedCommandV1, EntityId, EquipmentGeometry, GripRequest, HashDomain, Intent,
            LimbSlot, RecoilExternalEnergy, ReleaseRequest, Replay, ResolutionError, Scenario,
            SubmitEmbodiedOutcome, SubmittedCommand, World,
            ARTICULATED_PAYLOAD_BYTES, SUBMITTED_COMMAND_LAYOUT_VERSION};
use fx::{Angle, Fx, Hash64, Vec2, Vec3};

const TICKS: u32 = 56;

/// [`Scenario::duel_from`], and the second reseat this function was written to
/// make provable.
///
/// **It named the model rather than inheriting it**, which was the whole reason
/// it existed: `duel_from` built the articulated model when this was written and
/// a later step of the same session reseated it, so a fixture that waited would
/// have changed model twice -- once when it was ported and once when the
/// constructor moved under it -- and both pins below would have moved twice with
/// one registry sentence to explain it. Writing the word here meant each pin
/// moved exactly once. The word is gone with the enum and neither pin moved,
/// which is the no-op the plan predicted; the wrapper stays because five call
/// sites read it and collapsing it into them would say nothing.
fn embodied_duel_from(config: &DuelConfigV1) -> Option<Scenario> {
    Scenario::duel_from(config).ok()
}

/// Whether both bodies are still standing exactly as they spawned.
///
/// **The embodied tick runs `P_STANCE` where the articulated one runs
/// `P_BODY_YAW`**, and `drive_stance` turns the torso against the hips under a
/// twist budget and can spend a step to do it. Neither fixture below asks for a
/// turn or a stride, so the legs should be inert -- but "should be inert" is the
/// shape of claim this repository keeps discovering was wrong, and an inert
/// phase that silently stopped being inert would turn a north-wall
/// stored-command transcript into a different experiment while the digest went
/// on looking like a guard. Checked every tick rather than at the end: a hip
/// that turned and turned back would pass an endpoint comparison.
fn legs_are_inert(world: &World, ids: [EntityId; 2], hips: [Angle; 2]) -> bool {
    ids.iter().zip(hips).all(|(id, hip)| {
        matches!(world.stance(*id), Some(stance)
            if stance.step_left == 0 && stance.hip_yaw == hip)
    })
}

/// The arm slew ceiling and acceleration the exact fixtures were captured at.
///
/// It drives both digests below and `replay`'s south-wall live/rerun/replay
/// transcript, a different scenario measured at the same pair, which is why
/// that one can freeze a tick number -- 80 -- for its first exact refusal.
///
/// Frozen here rather than read from `combat::actuator`, for the reason
/// `CAPTURED_ARM_RATES` in `crates/sim/src/world/testkit.rs` gives at length: the slew
/// rate does not appear in either digest, it only decides *which tick of a
/// swing happens to touch*, and all three of these fixtures are transcripts of
/// one named tick sequence. Neither pin's registry row lists the actuator among
/// its owners -- `EXACT_TRAJECTORY_STATE_DIGEST` is owned by the fixture, the
/// stored-command grammar, exact owner/lifecycle state, the resolution grammar
/// or this digest grammar, and `LIFTED_COULOMB_SOLVER_DIGEST` by the lifted
/// law, bounds or score, the source-41 fixture, order or command grammar, or
/// this grammar -- so an actuator move must reach neither.
///
/// Reading the production pair here did not merely re-aim them; it made both
/// **inert**, which is worse, because an inert digest returns the `0` sentinel
/// and a registry pin that has stopped computing looks exactly like a fixture
/// that never ran. Doubling the pair on 2026-08-15 landed the north-wall strike
/// seven ticks early -- the weapon/body witness went from ticks `[45, 46]` to
/// `[38, 39]`, the remainder window opened at 38 instead of 45, and the two
/// rational witnesses keyed to a tick each (the defender's tick-45 wall row and
/// the attacker's tick-54 release row) were never seen -- so `digest_with`
/// refused. The lifted neighbourhood stayed on its feet and lost its mechanics
/// gate instead: the same blade arrived hard enough to dissipate 985 raw where
/// the frozen row then dissipated 278.
///
/// **Those five numbers are the deleted model's, and the experiment is not
/// re-runnable on this tree**; they are kept rather than restated because what
/// they demonstrate -- that this pair decides which tick of a swing touches, and
/// that a wrong pair makes a pin inert rather than red -- is the argument, and
/// it survived the port unchanged. Ported to the embodied body the same fixture
/// witnesses ticks `[44, 45]`, a remainder window opening at 44, a tick-44 wall
/// row and the same tick-54 release row, and the lifted row dissipates 147.
///
/// What still moves these digests is a change to the exact solver, the contact
/// grammar, the stored-command layout or the fixed-point arithmetic under them,
/// which is what they exist to catch.
///
/// **The cross-check this paragraph used to describe has no second half, and the
/// paragraph is corrected rather than deleted because the shape it warns about
/// is the point.** It read: `raw_lifted_command_receipt` is pinned with these
/// rates deliberately, because it is the exported half of a comparison against
/// Lab's policy-owned source-41 schedule whose whole claim is that the two build
/// the *same* schedule byte for byte -- and pinning the digest's constructor
/// while leaving the exported receipt on the production pair would have left
/// that comparison green while it compared two different schedules. That
/// argument was right. Its counterpart, `policy::robust_strike_schedule_command`,
/// went with the articulated policies; the `lab-calibration` seam it pointed at
/// had already gone; and the exported receipt itself had no caller in the
/// workspace, so it went too rather than stand as a `pub` function documented as
/// half of a guarantee nobody performed. What is still folded into
/// `LIFTED_COULOMB_SOLVER_DIGEST` is `command_receipt`, over the schedule
/// `lifted_case_with_provenance` actually submits, and it is pinned to this pair
/// for the reason the paragraphs above give.
pub(crate) const CAPTURED_ARM_RATES: (i32, i32) = (1_092, 182);

#[derive(Clone, Copy, PartialEq, Eq, Default)]
struct DigestMutation {
    command_byte: bool,
    owner_remainder: bool,
    external_reason: bool,
    selected_impulse: bool,
}

fn i128_le_bytes(value: i128) -> [u8; 16] {
    value.to_le_bytes()
}

fn write_i128(hash: &mut Hash64, value: i128) {
    hash.write_bytes(&i128_le_bytes(value));
}

fn write_entity(hash: &mut Hash64, id: EntityId) {
    hash.write_u32(id.index);
    hash.write_u32(id.generation);
}

fn write_vec3(hash: &mut Hash64, value: Vec3) {
    hash.write_i32(value.x.raw());
    hash.write_i32(value.y.raw());
    hash.write_i32(value.z.raw());
}

fn write_resolution_error(hash: &mut Hash64, value: ResolutionError) {
    hash.write_u8(match value {
        ResolutionError::ColliderIndex => 0,
        ResolutionError::EnergyNumerator => 1,
        ResolutionError::ResolutionCount => 2,
        ResolutionError::Mass => 3,
        ResolutionError::Projector => 4,
        ResolutionError::DuplicateIdentity => 5,
        ResolutionError::ExactScan => 6,
        ResolutionError::ExactUnsupportedSweep => 7,
        ResolutionError::ExactResponsePending => 8,
        ResolutionError::ExactLifecyclePending => 9,
        ResolutionError::ExactEnergyEnvelope => 10,
        ResolutionError::ExactSolver => 11,
    });
}

fn write_reject_phase(hash: &mut Hash64, value: crate::ExactContactRejectPhase) {
    hash.write_u8(match value {
        crate::ExactContactRejectPhase::BuildTrajectories => 0,
        crate::ExactContactRejectPhase::Preflight => 1,
        crate::ExactContactRejectPhase::Scan => 2,
        crate::ExactContactRejectPhase::Recompute => 3,
        crate::ExactContactRejectPhase::Closure => 4,
        crate::ExactContactRejectPhase::SolveGroup => 5,
        crate::ExactContactRejectPhase::ApplyGroup => 6,
        crate::ExactContactRejectPhase::Lifecycle => 7,
        crate::ExactContactRejectPhase::Finish => 8,
        crate::ExactContactRejectPhase::StageCommit => 9,
    });
}

fn write_contact_kind(hash: &mut Hash64, value: ContactKind) {
    hash.write_u8(match value {
        ContactKind::WeaponWeapon => 0,
        ContactKind::WeaponShield => 1,
        ContactKind::WeaponBody => 2,
        ContactKind::ProjectileBody => 3,
    });
}

fn write_group_reject(hash: &mut Hash64, value: crate::ExactSolveGroupRejectDetail) {
    hash.write_u8(match value {
        crate::ExactSolveGroupRejectDetail::EmptyDriverSet => 0,
        crate::ExactSolveGroupRejectDetail::LiftedIdentity => 1,
        crate::ExactSolveGroupRejectDetail::LiftedFactEnvelope => 2,
        crate::ExactSolveGroupRejectDetail::LiftedRowEnvelope => 3,
        crate::ExactSolveGroupRejectDetail::LiftedCandidateEnvelope => 4,
        crate::ExactSolveGroupRejectDetail::LiftedImpulseEnvelope => 5,
        crate::ExactSolveGroupRejectDetail::LiftedArithmeticEnvelope => 6,
        crate::ExactSolveGroupRejectDetail::LiftedNoRestitutionCandidate => 7,
        crate::ExactSolveGroupRejectDetail::LiftedNoDissipativeCandidate => 8,
    });
}

fn write_refusal_words(
    hash: &mut Hash64,
    refusal: Option<crate::ExactContactRejectionDiagnostic>,
    group_reject: Option<crate::ExactSolveGroupRejectDetail>,
) {
    hash.write_u8(u8::from(refusal.is_some()));
    if let Some(row) = refusal {
        write_resolution_error(hash, row.cause);
        write_reject_phase(hash, row.phase);
        hash.write_u32(row.tick);
        hash.write_u8(u8::from(row.key.is_some()));
        if let Some((a, a_slot, b, b_slot, kind)) = row.key {
            write_entity(hash, a); hash.write_u8(a_slot);
            write_entity(hash, b); hash.write_u8(b_slot); write_contact_kind(hash, kind);
        }
    }
    hash.write_u8(u8::from(group_reject.is_some()));
    if let Some(detail) = group_reject { write_group_reject(hash, detail); }
}

fn digest_with(mutation: DigestMutation) -> Option<u64> {
    let verify_reproduction = mutation == DigestMutation::default();
    // The north wall was selected by the measured response direction. Moving
    // the old east-wall premise until it happened to collide would have made
    // this a searched corpus rather than the ordinary source-41 strike.
    //
    // **The range closed to exactly three quarters when the fixture was ported
    // to the embodied body, and the bearing did not move at all.** Both
    // components of `(-163_840, -65_536)` divide by four exactly, so
    // `(-offset).angle()` -- and with it the chamber and strike bearings the
    // schedule below is written in -- is bit-identical to the one the deleted
    // model's fixture used. What changed is the *reach the arm can hold*:
    // `World::world_arm_target` clamps an embodied arm through
    // `combat::limb::reachable_extent`, and this fixture's `CombatHeight` of
    // `16_384` sits 0.95 of a metre below a 0.75-metre arm's shoulder, so the
    // commanded reach of `Fx::ONE` is held at the elbow's minimum instead. The
    // blade starts that much closer to the body, and the strike fell short of a
    // body it used to reach. Closing the range by a fixed exact ratio is the
    // opposite of searching for a collision: one number, chosen so the line of
    // attack is arithmetically the same one.
    let mut config = DuelConfigV1::shipped();
    let target = Vec2::new(Fx::from_int(12), Fx::from_int(16) - Body::Brute.radius());
    if target.y.raw() != 1_002_701 { return None; }
    let offset = Vec2::new(Fx::from_raw(-122_880), Fx::from_raw(-49_152));
    config.fighters[1].spawn = target;
    config.fighters[0].spawn = target + offset;
    config.fighters[0].hands[1].as_mut()?.geometry = EquipmentGeometry::Segment {
        length: Fx::from_int(2), radius: Fx::from_ratio(1, 25),
    };
    config.max_ticks = TICKS;
    let scenario = embodied_duel_from(&config)?;
    let mut first = World::new(&scenario, 0);
    let mut second = World::new(&scenario, 0);
    let mut replay = Replay::new(&scenario, 0);
    let attacker = EntityId::new(0, 0);
    let defender = EntityId::new(1, 0);
    let bodies = [attacker, defender];
    let yaws = [first.articulated_pose(attacker)?.body_yaw,
                first.articulated_pose(defender)?.body_yaw];
    let hips = [first.stance(attacker)?.hip_yaw, first.stance(defender)?.hip_yaw];
    let toward = (-offset).angle();
    let chamber = toward - Angle::from_raw(8_192);
    let strike = toward + Angle::from_raw(8_192);
    let strike_height = CombatHeight::try_from_raw(16_384)?;
    // **`body_yaw` is absolute under both frames and every arm bearing is not.**
    // The world re-adds the yaw the body is holding in `World::world_arm_target`,
    // so a fixture that kept writing world bearings would aim every arm a whole
    // facing away from where it aimed under the deleted model. An idle arm is
    // therefore `Angle::ZERO` -- along the torso -- and not the yaw it used to
    // repeat, and `move_dir` is the one field that ports by luck, because zero
    // rotates to zero.
    let neutral = |yaw| {
        let arm = ArmTarget { bearing: Angle::ZERO, height: CombatHeight::MID,
                              reach: Fx::ZERO, effort: Fx::ZERO };
        ArticulatedCommandV1 { move_dir: Vec2::ZERO, body_yaw: yaw,
            intent: Intent::Hold, arms: [arm; 2], grips: [GripRequest::Keep; 2],
            releases: [ReleaseRequest::Keep; 2] }
    };
    // `held` is the yaw read off the body at submission and **not** the yaw the
    // command requests: `body_yaw` is a request the actuator chases at a bounded
    // rate, so subtracting it would land the arm short by the whole turn on any
    // tick that asked for one. `policy::embodied_tactics::into_torso_frame` is
    // the same subtraction for the same reason and says so at length.
    let command_at = |tick, id, held: Angle| {
        if id == defender { return neutral(yaws[1]); }
        let mut command = neutral(yaws[0]);
        if tick < 53 {
            command.intent = Intent::Attack(defender);
            command.arms[1] = ArmTarget {
                bearing: (if tick < 28 { chamber } else { strike }) - held,
                height: strike_height,
                reach: if tick < 28 { Fx::ONE } else { Fx::from_raw(61_440) },
                effort: Fx::ONE,
            };
        } else if tick == 53 {
            command.grips[1] = GripRequest::Release;
        }
        command
    };

    let mut hash = Hash64::new();
    hash.write_bytes(b"ARPG-EXACT-TRAJECTORY-V1");
    hash.write_u16(1);
    hash.write_u64(scenario.fingerprint());
    hash.write_u64(0);
    hash.write_u32(TICKS);
    let mut accepted_groups = 0u32;
    let mut momentum_remainder = false;
    let mut position_remainder = false;
    let mut wall = false;
    let mut release = false;
    let mut changed_command = false;
    let mut changed_external = false;
    let mut changed_impulse = false;
    #[cfg(test)]
    let mut changed_owner = false;
    let mut weapon_body_ticks = Vec::new();
    let mut momentum_ticks = Vec::new();
    let mut position_ticks = Vec::new();
    let (max_speed, accel) = CAPTURED_ARM_RATES;

    for tick in 0..TICKS {
        for id in bodies {
            let requested = command_at(tick, id, first.articulated_pose(id)?.body_yaw);
            let stored = match first.submit_embodied_v1(id, EmbodiedCommandV1::new(requested)) {
                SubmitEmbodiedOutcome::Stored { command, rejection: None } => command,
                _ => return None,
            };
            let rerun = if verify_reproduction {
                // Framed against `second`'s own body rather than handed
                // `first`'s command, so that the rerun proves the torso
                // conversion reproduces as well as the submission does.
                let rerun_requested =
                    command_at(tick, id, second.articulated_pose(id)?.body_yaw);
                match second.submit_embodied_v1(id, EmbodiedCommandV1::new(rerun_requested)) {
                    SubmitEmbodiedOutcome::Stored { command, rejection: None } => command,
                    _ => return None,
                }
            } else { stored };
            if rerun != stored { return None; }
            replay.record_submitted(tick, id, SubmittedCommand::Embodied(stored));
        }
        first.step_with_arm_rates(max_speed, accel);
        if verify_reproduction { second.step_with_arm_rates(max_speed, accel); }
        replay.finish(tick + 1);
        let mut played = if verify_reproduction {
            replay.play_until_with_arm_rates(tick + 1, max_speed, accel)
        } else {
            first.clone()
        };
        #[cfg(test)]
        if mutation.owner_remainder && !changed_owner {
            let a = first.mutate_exact_owner_remainder_for_test();
            let b = played.mutate_exact_owner_remainder_for_test();
            if a != b { return None; }
            changed_owner = a;
        }
        let state = played.state_digest();
        let live_state = first.state_digest();
        let rerun_state = second.state_digest();
        let replay_state = state;
        if verify_reproduction && ((rerun_state.domain, rerun_state.schema, rerun_state.value)
                != (live_state.domain, live_state.schema, live_state.value)
            || (replay_state.domain, replay_state.schema, replay_state.value)
                != (live_state.domain, live_state.schema, live_state.value)
            || second.contact_resolutions() != first.contact_resolutions()
            || played.contact_resolutions() != first.contact_resolutions()
            || second.exact_contact_group_diagnostics() != first.exact_contact_group_diagnostics()
            || played.exact_contact_group_diagnostics() != first.exact_contact_group_diagnostics()
            || second.exact_external_energy() != first.exact_external_energy()
            || played.exact_external_energy() != first.exact_external_energy()
            || second.first_exact_contact_rejection() != first.first_exact_contact_rejection()
            || played.first_exact_contact_rejection() != first.first_exact_contact_rejection()
            || second.contact_cap_hits() != first.contact_cap_hits()
            || played.contact_cap_hits() != first.contact_cap_hits()) {
            return None;
        }
        if played.contact_cap_hits() != 0
            || played.first_exact_contact_rejection().is_some()
            || played.exact_contact_group_diagnostics().iter().any(|row| row.reject.is_some()) {
            return None;
        }
        if !legs_are_inert(&first, bodies, hips) || !legs_are_inert(&played, bodies, hips) {
            return None;
        }

        hash.write_u32(tick + 1);
        let commands = replay.submitted_entries.iter().filter(|row| row.tick == tick)
            .collect::<Vec<_>>();
        if commands.len() != 2 || commands[0].entity != attacker || commands[1].entity != defender {
            return None;
        }
        hash.write_u32(commands.len() as u32);
        for row in commands {
            write_entity(&mut hash, row.entity);
            hash.write_u16(SUBMITTED_COMMAND_LAYOUT_VERSION);
            hash.write_u8(1);
            hash.write_u8(0);
            hash.write_u16(ARTICULATED_PAYLOAD_BYTES as u16);
            // Irrefutable now: the retired grammar is out of the enum, so the
            // `else { return None }` that stood here was an unreachable arm
            // rather than a refusal a caller could see.
            let SubmittedCommand::Embodied(command) = row.command;
            let mut payload = command.articulated.payload_bytes();
            if mutation.command_byte && !changed_command {
                payload[0] ^= 1;
                changed_command = true;
            }
            hash.write_bytes(&payload);
        }
        hash.write_u8(match state.domain {
            HashDomain::LegacyV1 => 0,
            HashDomain::ArticulatedV1 => 1,
            HashDomain::EmbodiedV1 => 2,
        });
        hash.write_u16(state.schema);
        hash.write_u64(state.value);
        hash.write_u32(played.contact_cap_hits());
        let refusal = played.first_exact_contact_rejection();
        let group_reject = played.exact_contact_group_diagnostics().iter()
            .find_map(|row| row.reject);
        write_refusal_words(&mut hash, refusal, group_reject);
        hash.write_u32(played.contact_resolutions().len() as u32);
        let diagnostic_groups = played.exact_contact_group_diagnostics().len() as u32;
        let resolved_groups = played.contact_resolutions().iter()
            .map(|row| u32::from(row.group_ordinal) + 1).max().unwrap_or(0);
        if diagnostic_groups != resolved_groups { return None; }
        accepted_groups += diagnostic_groups;
        for row in played.contact_resolutions() {
            // **A volume compared against a region discriminant, and it is exact
            // rather than lucky.** Volumes `0..5` are the five regions in their
            // own order, so the Torso *volume* is the Torso *region*'s number,
            // and volumes 5 and 6 -- the two forearms an embodied arm presents
            // -- are appended after them rather than renumbering anything.
            //
            // **It was the Legs until this fixture was ported, and the region
            // moved for a reason worth keeping.** An embodied arm cannot hold a
            // hand 0.95 metres below its own shoulder, so the clamp lifts this
            // strike from a thrust at a leg to a cut across the chest, and the
            // defender's forearm -- which the deleted model did not present to
            // the solver at all -- now hangs between the blade and the leg it
            // used to reach. The old model's freedom to command the pose this
            // one refuses was recorded by
            // `an_articulated_arm_target_is_still_unclamped`, deleted with the
            // model on 2026-08-19 -- so the clamp is now guarded from the other
            // side only, by `reachable_extent`'s own tests in `combat::limb`.
            if row.fact.key.kind == ContactKind::WeaponBody
                && row.fact.key.a == attacker && row.fact.key.a_slot == 1
                && row.fact.key.b == defender && row.fact.volume == BodyPart::Torso as u8 {
                if weapon_body_ticks.last() != Some(&(tick + 1)) {
                    weapon_body_ticks.push(tick + 1);
                }
            }
            hash.write_u8(row.group_ordinal);
            hash.write_u32(row.group_alpha_raw);
            let key = row.fact.key;
            write_entity(&mut hash, key.a); hash.write_u8(key.a_slot);
            write_entity(&mut hash, key.b); hash.write_u8(key.b_slot); write_contact_kind(&mut hash, key.kind);
            hash.write_u8(row.fact.volume);
            hash.write_u32(row.fact.toi.get().raw() as u32);
            write_vec3(&mut hash, row.fact.point); write_vec3(&mut hash, row.fact.normal);
            write_vec3(&mut hash, row.fact.velocity_a); write_vec3(&mut hash, row.fact.velocity_b);
            if row.impulse.key != key { return None; }
            let mut impulse_a = row.impulse.on_a;
            if mutation.selected_impulse && !changed_impulse {
                impulse_a.x = Fx::from_raw(impulse_a.x.raw() ^ 1);
                changed_impulse = true;
            }
            write_vec3(&mut hash, impulse_a); write_vec3(&mut hash, row.impulse.on_b);
            hash.write_u64(row.energy.before_raw); hash.write_u64(row.energy.after_raw);
            hash.write_u64(row.energy.dissipated_raw); hash.write_u64(row.cut_raw);
            hash.write_u64(row.thrust_raw); hash.write_u64(row.pressure_raw);
            hash.write_u64(row.deflected_raw); hash.write_bool(row.severed);
        }
        hash.write_u32(played.exact_external_energy().len() as u32);
        for row in played.exact_external_energy() {
            write_entity(&mut hash, row.entity); hash.write_u8(row.lane);
            let reason = if mutation.external_reason && !changed_external {
                changed_external = true; row.reason ^ RecoilExternalEnergy::CAP
            } else { row.reason };
            hash.write_u8(reason); write_i128(&mut hash, row.signed_numerator);
            write_i128(&mut hash, row.denominator);
            // Both witnesses are keyed to a tick and to an exact rational, and
            // both were re-read when the range closed -- the wall row on the
            // tick the blade lands, which is now 44, and the release row on the
            // tick after the grip lets go, which is still 54 because the grip
            // schedule did not move.
            wall |= row.entity == defender && row.lane == 0
                && row.reason == RecoilExternalEnergy::WALL
                && tick + 1 == 44 && row.signed_numerator == -12_045_818_473
                && row.denominator == 8_589_934_592;
            release |= row.entity == attacker && row.lane == 2
                && row.reason == RecoilExternalEnergy::RELEASE
                && tick + 1 == 54 && row.signed_numerator == -503_974_948_800
                && row.denominator == 8_589_934_592;
        }
        for id in [attacker, defender] {
            let (momentum, position) = played.exact_trajectory_remainder_view(id)?;
            momentum_remainder |= momentum;
            position_remainder |= position;
            if momentum && momentum_ticks.last() != Some(&(tick + 1)) {
                momentum_ticks.push(tick + 1);
            }
            if position && position_ticks.last() != Some(&(tick + 1)) {
                position_ticks.push(tick + 1);
            }
        }
    }
    if accepted_groups != 2 || weapon_body_ticks != [44, 45]
        || momentum_ticks != (44..=56).collect::<Vec<_>>()
        || position_ticks != (44..=56).collect::<Vec<_>>()
        || !momentum_remainder || !position_remainder || !wall || !release {
        return None;
    }
    hash.write_u32(accepted_groups);
    hash.write_bool(momentum_remainder);
    hash.write_bool(position_remainder);
    hash.write_bool(wall);
    hash.write_bool(release);
    Some(hash.finish())
}

/// Portable digest of the exact north-wall lifecycle fixture, or zero if any
/// live/rerun/replay or witness assertion fails.
pub fn exact_trajectory_state_digest() -> u64 {
    digest_with(DigestMutation::default()).unwrap_or(0)
}

/// Three quarters of the frozen `(-2.5, -1.0)`, and the same value
/// `digest_with` spawns its attacker at -- see the argument there for why the
/// range closed and the bearing did not. Both components divide by four exactly,
/// so `(-LIFTED_OFFSET).angle()` is the bearing the deleted model's fixture
/// struck along, to the raw unit.
const LIFTED_OFFSET: Vec2 = Vec2::new(Fx::from_raw(-122_880), Fx::from_raw(-49_152));
const LIFTED_STRIKE_DELTAS: [i32; 3] = [-1, 0, 1];
const LIFTED_REACH_DELTAS: [i32; 3] = [-256, 0, 256];

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum LiftedStrikeProvenance { OrdinarySubmittedCommands, DirectPoseOrExactState }

fn require_ordinary_strike_provenance(source: LiftedStrikeProvenance)
    -> Result<(), &'static str>
{
    if source != LiftedStrikeProvenance::OrdinarySubmittedCommands {
        return Err("the lifted solver gate refuses direct pose or exact-state strike fixtures");
    }
    Ok(())
}

#[derive(Clone, PartialEq, Eq)]
struct LiftedReceipt {
    strike_delta: i32,
    reach_delta: i32,
    mirrored: bool,
    fingerprint: u64,
    command_receipt: u64,
    contact_tick: u32,
    row: ContactResolution,
    post_state: (HashDomain, u16, u64),
    external: Vec<crate::ExactExternalEnergyRow>,
    post_anatomy: AnatomyState,
    cap_hits: u32,
    refusal: Option<crate::ExactContactRejectionDiagnostic>,
}

fn lifted_config(strike_delta: i32, reach_delta: i32, mirrored: bool) -> Option<DuelConfigV1> {
    if !LIFTED_STRIKE_DELTAS.contains(&strike_delta)
        || !LIFTED_REACH_DELTAS.contains(&reach_delta) { return None; }
    let mut config = DuelConfigV1::shipped();
    let centre = Vec2::from_ints(12, 8);
    let offset = if mirrored { Vec2::new(LIFTED_OFFSET.x, -LIFTED_OFFSET.y) }
        else { LIFTED_OFFSET };
    config.fighters[0].spawn = centre + offset;
    if mirrored {
        for fighter in &mut config.fighters { fighter.hands.swap(0, 1); }
    }
    let limb = if mirrored { LimbSlot::LeftArm } else { LimbSlot::RightArm };
    config.fighters[0].hands[limb as usize].as_mut()?.geometry = EquipmentGeometry::Segment {
        length: Fx::from_int(2), radius: Fx::from_ratio(1, 25),
    };
    config.fighters[1].spawn = centre;
    config.fighters[1].anatomy = AnatomyChoice::Brute;
    config.max_ticks = (56i32 + strike_delta) as u32;
    Some(config)
}

fn neutral_command(obs: &crate::ArticulatedObservation) -> ArticulatedCommandV1 {
    // Zero is "along the torso", which is what an
    // idle arm means; the world adds `obs.body_yaw` back in `world_arm_target`.
    let arm = ArmTarget { bearing: Angle::ZERO, height: CombatHeight::MID,
                          reach: Fx::ZERO, effort: Fx::ZERO };
    ArticulatedCommandV1 { move_dir: Vec2::ZERO, body_yaw: obs.body_yaw,
        intent: Intent::Hold, arms: [arm; 2], grips: [GripRequest::Keep; 2],
        releases: [ReleaseRequest::Keep; 2] }
}

fn lifted_command(world: &World, id: EntityId, attacker: EntityId, defender: EntityId,
                  tick: u32, reach_delta: i32, mirrored: bool) -> ArticulatedCommandV1 {
    let obs = world.observe_articulated(id);
    if id != attacker { return neutral_command(&obs); }
    lifted_coulomb_diagnostic_command(&obs, defender, tick, reach_delta, mirrored)
}

fn lifted_coulomb_diagnostic_command(obs: &crate::ArticulatedObservation,
    defender: EntityId, tick: u32, reach_delta: i32, mirrored: bool) -> ArticulatedCommandV1
{
    let mut command = neutral_command(obs);
    if tick >= 56 { return command; }
    let offset = if mirrored { Vec2::new(LIFTED_OFFSET.x, -LIFTED_OFFSET.y) }
        else { LIFTED_OFFSET };
    let bearing = (-offset).angle();
    let eighth = Angle::QUARTER.raw() / 2;
    let (chamber, strike) = if mirrored {
        (Angle::from_raw(bearing.raw().wrapping_add(eighth)),
         Angle::from_raw(bearing.raw().wrapping_sub(eighth)))
    } else {
        (Angle::from_raw(bearing.raw().wrapping_sub(eighth)),
         Angle::from_raw(bearing.raw().wrapping_add(eighth)))
    };
    let limb = if mirrored { LimbSlot::LeftArm } else { LimbSlot::RightArm };
    command.intent = Intent::Attack(defender);
    command.arms[limb as usize] = ArmTarget {
        // Both are world bearings above and the command frame is the torso, so
        // the yaw the body is **holding** comes off here -- `obs.body_yaw` and
        // never `command.body_yaw`, which is only what the actuator is chasing.
        bearing: (if tick < 28 { chamber } else { strike }) - obs.body_yaw,
        height: CombatHeight::try_from_raw(16_384).expect("fixed source-41 height"),
        reach: if tick < 28 { Fx::ONE } else { Fx::from_raw(61_440 + reach_delta) },
        effort: Fx::ONE,
    };
    command
}

fn command_receipt(fingerprint: u64, records: &[crate::SubmittedCommandRecord]) -> Option<u64> {
    let mut hash = Hash64::new();
    hash.write_bytes(b"ARPG-LIFTED-COMMANDS-V1");
    hash.write_u16(1); hash.write_u64(fingerprint); hash.write_u32(records.len() as u32);
    for record in records {
        hash.write_u32(record.tick); write_entity(&mut hash, record.entity);
        hash.write_u16(SUBMITTED_COMMAND_LAYOUT_VERSION);
        hash.write_u8(1); hash.write_u8(0); hash.write_u16(ARTICULATED_PAYLOAD_BYTES as u16);
        let SubmittedCommand::Embodied(command) = record.command;
        hash.write_bytes(&command.articulated.payload_bytes());
    }
    Some(hash.finish())
}


fn state_words(world: &World) -> (HashDomain, u16, u64) {
    let row = world.state_digest(); (row.domain, row.schema, row.value)
}

fn lifted_case_with_provenance(strike_delta: i32, reach_delta: i32, mirrored: bool,
                               source: LiftedStrikeProvenance) -> Option<LiftedReceipt> {
    require_ordinary_strike_provenance(source).ok()?;
    let config = lifted_config(strike_delta, reach_delta, mirrored)?;
    let scenario = embodied_duel_from(&config)?;
    let mut first = World::new(&scenario, 0);
    let mut second = World::new(&scenario, 0);
    let mut replay = Replay::new(&scenario, 0);
    let (attacker, defender) = (EntityId::new(0, 0), EntityId::new(1, 0));
    let bodies = [attacker, defender];
    let hips = [first.stance(attacker)?.hip_yaw, first.stance(defender)?.hip_yaw];
    let limb = if mirrored { LimbSlot::LeftArm } else { LimbSlot::RightArm };
    let mut contact_tick = None;
    let mut selected_row = None;
    let mut post = None;
    'ticks: for tick in 0..config.max_ticks {
        let pending = first.pending_decisions().to_vec();
        if pending != second.pending_decisions() {
            #[cfg(test)] eprintln!("lifted ({strike_delta},{reach_delta}) mirror={mirrored}: pending mismatch tick {tick}");
            return None;
        }
        for id in pending {
            let requested = lifted_command(&first, id, attacker, defender, tick, reach_delta, mirrored);
            let stored = match first.submit_embodied_v1(id, EmbodiedCommandV1::new(requested)) {
                SubmitEmbodiedOutcome::Stored { command, rejection: None } => command,
                _ => { #[cfg(test)] eprintln!("lifted stored first failed tick {tick} id {:?}", id); return None },
            };
            let rerun_requested = lifted_command(&second, id, attacker, defender, tick,
                                                  reach_delta, mirrored);
            let rerun = match second.submit_embodied_v1(id, EmbodiedCommandV1::new(rerun_requested)) {
                SubmitEmbodiedOutcome::Stored { command, rejection: None } => command,
                _ => { #[cfg(test)] eprintln!("lifted stored rerun failed tick {tick} id {:?}", id); return None },
            };
            if stored != rerun { #[cfg(test)] eprintln!("lifted command mismatch tick {tick}"); return None; }
            replay.record_submitted(tick, id, SubmittedCommand::Embodied(stored));
        }
        first.step_with_arm_rates(CAPTURED_ARM_RATES.0, CAPTURED_ARM_RATES.1);
        second.step_with_arm_rates(CAPTURED_ARM_RATES.0, CAPTURED_ARM_RATES.1);
        replay.finish(tick + 1);
        if state_words(&first) != state_words(&second)
            || first.contact_resolutions() != second.contact_resolutions()
            || first.exact_contact_group_diagnostics() != second.exact_contact_group_diagnostics()
            || first.exact_external_energy() != second.exact_external_energy()
            || first.first_exact_contact_rejection() != second.first_exact_contact_rejection()
            || first.contact_cap_hits() != second.contact_cap_hits() {
            #[cfg(test)] eprintln!("lifted ({strike_delta},{reach_delta}) mirror={mirrored}: rerun mismatch tick {tick}");
            return None;
        }
        if !legs_are_inert(&first, bodies, hips) {
            #[cfg(test)] eprintln!("lifted ({strike_delta},{reach_delta}) mirror={mirrored}: legs moved by tick {tick}");
            return None;
        }
        let attributed = first.contact_resolutions().iter().filter(|row| {
            row.fact.key.kind == ContactKind::WeaponBody
                && row.fact.key.a == attacker && row.fact.key.a_slot == limb as u8
                && row.fact.key.b == defender && row.fact.key.b_slot == crate::BODY_SLOT
                // Torso rather than Legs since the port, for the reason
                // `digest_with`'s own predicate gives at length -- and it is the
                // region that keeps the mirror comparison below meaningful:
                // Head, Torso and Legs are invariant under the reflection this
                // corpus takes, and the four arm volumes are not.
                && row.fact.volume == BodyPart::Torso as u8
        }).count();
        if attributed != 0 && selected_row.is_none() {
            if attributed != 1 || first.contact_resolutions().len() != 1 {
                #[cfg(test)] eprintln!("lifted ({strike_delta},{reach_delta}) mirror={mirrored}: contact count tick {tick}: {attributed}/{}", first.contact_resolutions().len());
                return None;
            }
            contact_tick = Some(tick + 1);
            selected_row = first.contact_resolutions().first().copied();
            post = Some((first.clone(), second.clone()));
            break 'ticks;
        }
    }
    let Some(contact_tick) = contact_tick else {
        #[cfg(test)] eprintln!("lifted ({strike_delta},{reach_delta}) mirror={mirrored}: no contact");
        return None;
    };
    let Some((direct_post, rerun_post)) = post else { return None };
    let played_post = replay.play_until_with_arm_rates(contact_tick,
        CAPTURED_ARM_RATES.0, CAPTURED_ARM_RATES.1);
    for live in [&direct_post, &rerun_post] {
        let played = &played_post;
        if state_words(live) != state_words(played)
            || live.contact_resolutions() != played.contact_resolutions()
            || live.exact_contact_group_diagnostics() != played.exact_contact_group_diagnostics()
            || live.exact_external_energy() != played.exact_external_energy()
            || live.first_exact_contact_rejection() != played.first_exact_contact_rejection()
            || live.contact_solver_rejections() != played.contact_solver_rejections()
            || live.contact_cap_hits() != played.contact_cap_hits() {
            #[cfg(test)] eprintln!("lifted ({strike_delta},{reach_delta}) mirror={mirrored}: post replay mismatch state={:?}/{:?} rows={}/{} groups={}/{} external={}/{} refusal={:?}/{:?} caps={}/{}",
                state_words(live), state_words(played), live.contact_resolutions().len(), played.contact_resolutions().len(),
                live.exact_contact_group_diagnostics().len(), played.exact_contact_group_diagnostics().len(),
                live.exact_external_energy().len(), played.exact_external_energy().len(),
                live.first_exact_contact_rejection(), played.first_exact_contact_rejection(),
                live.contact_cap_hits(), played.contact_cap_hits());
            return None;
        }
    }
    let row = *played_post.contact_resolutions().first()?;
    if selected_row != Some(row) { return None; }
    if row.fact.toi.get() <= Fx::ZERO || row.fact.toi.get() >= Fx::ONE
        || row.impulse.key != row.fact.key || row.impulse.on_a == Vec3::ZERO
        || row.impulse.on_b != -row.impulse.on_a
        || row.group_alpha_raw != 65_536 || row.energy.dissipated_raw != 147
        || row.energy.before_raw.checked_sub(row.energy.after_raw) != Some(147)
        || played_post.contact_cap_hits() != 0 || played_post.contact_solver_rejections() != 0
        || played_post.first_exact_contact_rejection().is_some()
        || played_post.exact_contact_group_diagnostics().iter().any(|group| group.reject.is_some()) {
        #[cfg(test)] eprintln!("lifted ({strike_delta},{reach_delta}) mirror={mirrored}: mechanics row {:?}; on_b_inverse={} post cap/solver/refusal/groups={}/{}/{:?}/{}",
            row, row.impulse.on_b == -row.impulse.on_a,
            played_post.contact_cap_hits(), played_post.contact_solver_rejections(),
            played_post.first_exact_contact_rejection(), played_post.exact_contact_group_diagnostics().iter().filter(|g| g.reject.is_some()).count());
        return None;
    }
    let post_anatomy = played_post.anatomy_diagnostic_view(defender)?;
    if (row.cut_raw == 0 && row.thrust_raw == 0)
        || post_anatomy == AnatomyState::new(&crate::combat::spec::brute_anatomy()) {
        #[cfg(test)] eprintln!("lifted ({strike_delta},{reach_delta}) mirror={mirrored}: no wound");
        return None;
    }
    if direct_post.anatomy_diagnostic_view(defender) != Some(post_anatomy)
        || rerun_post.anatomy_diagnostic_view(defender) != Some(post_anatomy)
        {
        #[cfg(test)] eprintln!("lifted ({strike_delta},{reach_delta}) mirror={mirrored}: anatomy mismatch");
        return None;
    }
    let post_remainders = played_post.exact_trajectory_remainder_view(attacker)?;
    if post_remainders != (true, true) {
        #[cfg(test)] eprintln!("lifted ({strike_delta},{reach_delta}) mirror={mirrored}: remainders {post_remainders:?}");
        return None;
    }
    Some(LiftedReceipt { strike_delta, reach_delta, mirrored,
        fingerprint: scenario.fingerprint(),
        command_receipt: command_receipt(scenario.fingerprint(), &replay.submitted_entries)?,
        contact_tick, row, post_state: state_words(&played_post),
        external: played_post.exact_external_energy().to_vec(),
        post_anatomy,
        cap_hits: played_post.contact_cap_hits(),
        refusal: played_post.first_exact_contact_rejection(),
    })
}

fn lifted_case(strike_delta: i32, reach_delta: i32, mirrored: bool) -> Option<LiftedReceipt> {
    lifted_case_with_provenance(strike_delta, reach_delta, mirrored,
                                LiftedStrikeProvenance::OrdinarySubmittedCommands)
}

fn lifted_receipts() -> Option<Vec<LiftedReceipt>> {
    let mut rows = Vec::with_capacity(18);
    for strike_delta in LIFTED_STRIKE_DELTAS {
        for reach_delta in LIFTED_REACH_DELTAS {
            for mirrored in [false, true] {
                rows.push(lifted_case(strike_delta, reach_delta, mirrored)?);
            }
            let pair = &rows[rows.len() - 2..];
            let (plain, mirror) = (&pair[0], &pair[1]);
            if plain.row.fact.key.a != mirror.row.fact.key.a
                || plain.row.fact.key.b != mirror.row.fact.key.b
                || plain.row.fact.key.a_slot != LimbSlot::RightArm as u8
                || mirror.row.fact.key.a_slot != LimbSlot::LeftArm as u8
                || plain.row.fact.key.b_slot != mirror.row.fact.key.b_slot
                || plain.row.fact.key.kind != mirror.row.fact.key.kind
                || plain.row.fact.volume != mirror.row.fact.volume
                || (plain.row.fact.toi.get().raw() - mirror.row.fact.toi.get().raw()).abs() > 1
                || (plain.row.fact.point.x.raw() - mirror.row.fact.point.x.raw()).abs() > 1
                || (plain.row.fact.point.y.raw() + mirror.row.fact.point.y.raw()
                    - 16 * Fx::ONE.raw()).abs() > 1
                || (plain.row.fact.point.z.raw() - mirror.row.fact.point.z.raw()).abs() > 1
                || plain.row.energy != mirror.row.energy
                || plain.post_anatomy != mirror.post_anatomy { return None; }
            for (a, b) in [(plain.row.fact.normal, mirror.row.fact.normal),
                           (plain.row.fact.velocity_a, mirror.row.fact.velocity_a),
                           (plain.row.fact.velocity_b, mirror.row.fact.velocity_b),
                           (plain.row.impulse.on_a, mirror.row.impulse.on_a),
                           (plain.row.impulse.on_b, mirror.row.impulse.on_b)] {
                if (a.x.raw() - b.x.raw()).abs() > 1 || (a.y.raw() + b.y.raw()).abs() > 1
                    || (a.z.raw() - b.z.raw()).abs() > 1 { return None; }
            }
        }
    }
    Some(rows)
}

#[derive(Clone, Copy, PartialEq, Eq, Default)]
enum LiftedMutation {
    #[default] None, Header, Bounds, CaseOrder, CommandReceipt, Key, Region, Toi,
    Geometry, Velocity, Impulse, Energy, State, External, Anatomy, Cap, Refusal,
    RefusalCauseTable, RefusalPhaseTable, GroupRejectTable, Damage,
}

fn write_state(hash: &mut Hash64, state: (HashDomain, u16, u64)) {
    hash.write_u8(match state.0 {
        HashDomain::LegacyV1 => 0,
        HashDomain::ArticulatedV1 => 1,
        HashDomain::EmbodiedV1 => 2,
    });
    hash.write_u16(state.1); hash.write_u64(state.2);
}

fn hash_lifted(rows: &[LiftedReceipt], mutation: LiftedMutation) -> u64 {
    let mut hash = Hash64::new();
    hash.write_bytes(if mutation == LiftedMutation::Header {
        b"ARPG-LIFTED-COULOMB-V0"
    } else { b"ARPG-LIFTED-COULOMB-V1" });
    hash.write_u16(1);
    let bounds = [crate::combat::lifted_solver::MAX_LIFTED_SOLVER_FACTS as u32,
        crate::combat::lifted_solver::MAX_LIFTED_SOLVER_ROWS as u32,
        crate::combat::lifted_solver::LIFTED_SOLVER_SWEEPS as u32,
        crate::combat::lifted_solver::LIFTED_LIFTS_PER_VISIT as u32];
    for (at, bound) in bounds.into_iter().enumerate() {
        hash.write_u32(if mutation == LiftedMutation::Bounds && at == 0 { bound + 1 } else { bound });
    }
    hash.write_u16(41); hash.write_u32(3_144);
    hash.write_u8(match AnatomyChoice::Brute { AnatomyChoice::Fighter => 0, AnatomyChoice::Brute => 1 });
    hash.write_i32(LIFTED_OFFSET.x.raw()); hash.write_i32(LIFTED_OFFSET.y.raw());
    hash.write_u32(28); hash.write_u32(28); hash.write_i32(61_440);
    hash.write_u32(LIFTED_STRIKE_DELTAS.len() as u32);
    for delta in LIFTED_STRIKE_DELTAS { hash.write_i32(delta); }
    hash.write_u32(LIFTED_REACH_DELTAS.len() as u32);
    for delta in LIFTED_REACH_DELTAS { hash.write_i32(delta); }
    hash.write_u32(2); hash.write_bool(false); hash.write_bool(true);
    hash.write_u32(rows.len() as u32);
    let mut order = (0..rows.len()).collect::<Vec<_>>();
    if mutation == LiftedMutation::CaseOrder { order.swap(0, 1); }
    for (at, row_at) in order.into_iter().enumerate() {
        let receipt = &rows[row_at];
        hash.write_i32(receipt.strike_delta); hash.write_i32(receipt.reach_delta);
        hash.write_bool(receipt.mirrored); hash.write_u64(receipt.fingerprint);
        hash.write_u64(if mutation == LiftedMutation::CommandReceipt && at == 0 {
            receipt.command_receipt ^ 1
        } else { receipt.command_receipt });
        hash.write_u32(receipt.contact_tick);
        let row = receipt.row; let key = row.fact.key;
        write_entity(&mut hash, key.a); hash.write_u8(if mutation == LiftedMutation::Key && at == 0 { key.a_slot ^ 1 } else { key.a_slot });
        write_entity(&mut hash, key.b); hash.write_u8(key.b_slot); write_contact_kind(&mut hash, key.kind);
        hash.write_u8(if mutation == LiftedMutation::Region && at == 0 { row.fact.volume ^ 1 } else { row.fact.volume });
        hash.write_u32(if mutation == LiftedMutation::Toi && at == 0 { row.fact.toi.get().raw() as u32 ^ 1 } else { row.fact.toi.get().raw() as u32 });
        let mut point = row.fact.point;
        if mutation == LiftedMutation::Geometry && at == 0 { point.x = Fx::from_raw(point.x.raw() ^ 1); }
        write_vec3(&mut hash, point); write_vec3(&mut hash, row.fact.normal);
        let mut velocity_a = row.fact.velocity_a;
        if mutation == LiftedMutation::Velocity && at == 0 { velocity_a.x = Fx::from_raw(velocity_a.x.raw() ^ 1); }
        write_vec3(&mut hash, velocity_a); write_vec3(&mut hash, row.fact.velocity_b);
        let mut impulse = row.impulse.on_a;
        if mutation == LiftedMutation::Impulse && at == 0 { impulse.x = Fx::from_raw(impulse.x.raw() ^ 1); }
        write_vec3(&mut hash, impulse); write_vec3(&mut hash, row.impulse.on_b);
        hash.write_u32(row.group_alpha_raw);
        hash.write_u64(if mutation == LiftedMutation::Energy && at == 0 { row.energy.before_raw ^ 1 } else { row.energy.before_raw });
        hash.write_u64(row.energy.after_raw); hash.write_u64(row.energy.dissipated_raw);
        let state = if mutation == LiftedMutation::State && at == 0 {
            (receipt.post_state.0, receipt.post_state.1, receipt.post_state.2 ^ 1)
        } else { receipt.post_state };
        write_state(&mut hash, state);
        hash.write_u32(receipt.external.len() as u32
            + u32::from(mutation == LiftedMutation::External && at == 0 && receipt.external.is_empty()));
        for external in &receipt.external {
            write_entity(&mut hash, external.entity); hash.write_u8(external.lane);
            hash.write_u8(external.reason); write_i128(&mut hash, external.signed_numerator);
            write_i128(&mut hash, external.denominator);
        }
        if mutation == LiftedMutation::External && at == 0 && receipt.external.is_empty() {
            write_entity(&mut hash, EntityId::NONE); hash.write_u8(0); hash.write_u8(0);
            write_i128(&mut hash, 0); write_i128(&mut hash, 1);
        }
        let mut anatomy = receipt.post_anatomy;
        if mutation == LiftedMutation::Anatomy && at == 0 { anatomy.parts[0].wound = Fx::from_raw(anatomy.parts[0].wound.raw() ^ 1); }
        anatomy.hash_into(&mut hash);
        hash.write_u32(if mutation == LiftedMutation::Cap && at == 0 { receipt.cap_hits + 1 } else { receipt.cap_hits });
        let refusal = if mutation == LiftedMutation::Refusal && at == 0 {
            Some(crate::ExactContactRejectionDiagnostic { tick: receipt.contact_tick,
                cause: ResolutionError::ExactSolver,
                phase: crate::ExactContactRejectPhase::SolveGroup, key: None })
        } else { receipt.refusal };
        write_refusal_words(&mut hash, refusal, None);
        hash.write_u64(if mutation == LiftedMutation::Damage && at == 0 { row.cut_raw ^ 1 } else { row.cut_raw });
        hash.write_u64(row.thrust_raw); hash.write_u64(row.pressure_raw);
        hash.write_u64(row.deflected_raw); hash.write_bool(row.severed);
    }
    let refusal_codes = [ResolutionError::ColliderIndex, ResolutionError::EnergyNumerator,
        ResolutionError::ResolutionCount, ResolutionError::Mass, ResolutionError::Projector,
        ResolutionError::DuplicateIdentity, ResolutionError::ExactScan,
        ResolutionError::ExactUnsupportedSweep, ResolutionError::ExactResponsePending,
        ResolutionError::ExactLifecyclePending, ResolutionError::ExactEnergyEnvelope,
        ResolutionError::ExactSolver];
    hash.write_u32(refusal_codes.len() as u32);
    for (at, code) in refusal_codes.into_iter().enumerate() {
        if mutation == LiftedMutation::RefusalCauseTable && at == 0 { write_resolution_error(&mut hash, ResolutionError::Mass); }
        else { write_resolution_error(&mut hash, code); }
    }
    let phases = [crate::ExactContactRejectPhase::BuildTrajectories,
        crate::ExactContactRejectPhase::Preflight, crate::ExactContactRejectPhase::Scan,
        crate::ExactContactRejectPhase::Recompute, crate::ExactContactRejectPhase::Closure,
        crate::ExactContactRejectPhase::SolveGroup, crate::ExactContactRejectPhase::ApplyGroup,
        crate::ExactContactRejectPhase::Lifecycle, crate::ExactContactRejectPhase::Finish,
        crate::ExactContactRejectPhase::StageCommit];
    hash.write_u32(phases.len() as u32);
    for (at, phase) in phases.into_iter().enumerate() {
        if mutation == LiftedMutation::RefusalPhaseTable && at == 0 {
            write_reject_phase(&mut hash, crate::ExactContactRejectPhase::Scan);
        } else { write_reject_phase(&mut hash, phase); }
    }
    let details = [crate::ExactSolveGroupRejectDetail::EmptyDriverSet,
        crate::ExactSolveGroupRejectDetail::LiftedIdentity,
        crate::ExactSolveGroupRejectDetail::LiftedFactEnvelope,
        crate::ExactSolveGroupRejectDetail::LiftedRowEnvelope,
        crate::ExactSolveGroupRejectDetail::LiftedCandidateEnvelope,
        crate::ExactSolveGroupRejectDetail::LiftedImpulseEnvelope,
        crate::ExactSolveGroupRejectDetail::LiftedArithmeticEnvelope,
        crate::ExactSolveGroupRejectDetail::LiftedNoRestitutionCandidate,
        crate::ExactSolveGroupRejectDetail::LiftedNoDissipativeCandidate];
    hash.write_u32(details.len() as u32);
    for (at, detail) in details.into_iter().enumerate() {
        if mutation == LiftedMutation::GroupRejectTable && at == 0 {
            write_group_reject(&mut hash, crate::ExactSolveGroupRejectDetail::LiftedFactEnvelope);
        } else { write_group_reject(&mut hash, detail); }
    }
    hash.finish()
}


/// Portable digest of source-41 ordinal 3144's lifted solver neighbourhood.
pub fn lifted_coulomb_solver_digest() -> u64 {
    lifted_receipts().map(|rows| hash_lifted(&rows, LiftedMutation::default())).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_trajectory_state_digest_is_stable_and_every_named_class_is_load_bearing() {
        let base = exact_trajectory_state_digest();
        assert_ne!(base, 0);
        assert_eq!(exact_trajectory_state_digest(), base);
        for (name, mutation) in [
            ("stored command byte", DigestMutation { command_byte: true, ..DigestMutation::default() }),
            ("owner remainder", DigestMutation { owner_remainder: true, ..DigestMutation::default() }),
            ("external reason", DigestMutation { external_reason: true, ..DigestMutation::default() }),
            ("selected impulse", DigestMutation { selected_impulse: true, ..DigestMutation::default() }),
        ] {
            let changed = digest_with(mutation).unwrap_or_else(||
                panic!("{name} mutation broke the fixture instead of changing the transcript"));
            assert_ne!(changed, base, "{name} was absent from the grammar");
        }
    }

    fn refusal_digest(
        cause: ResolutionError,
        phase: crate::ExactContactRejectPhase,
        key: Option<(EntityId, u8, EntityId, u8, ContactKind)>,
        detail: Option<crate::ExactSolveGroupRejectDetail>,
    ) -> u64 {
        let mut hash = Hash64::new();
        write_refusal_words(&mut hash, Some(crate::ExactContactRejectionDiagnostic {
            tick: 45, cause, phase, key,
        }), detail);
        hash.finish()
    }

    #[test]
    fn every_exact_refusal_word_is_load_bearing() {
        let key = Some((EntityId::new(0, 0), 1, EntityId::new(1, 0), 255,
                        ContactKind::WeaponBody));
        let base = refusal_digest(ResolutionError::ExactSolver,
            crate::ExactContactRejectPhase::SolveGroup, key,
            Some(crate::ExactSolveGroupRejectDetail::LiftedIdentity));
        assert_ne!(refusal_digest(ResolutionError::ExactEnergyEnvelope,
            crate::ExactContactRejectPhase::SolveGroup, key,
            Some(crate::ExactSolveGroupRejectDetail::LiftedIdentity)), base);
        assert_ne!(refusal_digest(ResolutionError::ExactSolver,
            crate::ExactContactRejectPhase::ApplyGroup, key,
            Some(crate::ExactSolveGroupRejectDetail::LiftedIdentity)), base);
        assert_ne!(refusal_digest(ResolutionError::ExactSolver,
            crate::ExactContactRejectPhase::SolveGroup, key,
            Some(crate::ExactSolveGroupRejectDetail::LiftedFactEnvelope)), base);
        assert_ne!(refusal_digest(ResolutionError::ExactSolver,
            crate::ExactContactRejectPhase::SolveGroup,
            Some((EntityId::new(0, 0), 2, EntityId::new(1, 0), 255,
                  ContactKind::WeaponBody)),
            Some(crate::ExactSolveGroupRejectDetail::LiftedIdentity)), base);
    }

    #[test]
    fn signed_i128_words_are_sixteen_little_endian_twos_complement_bytes() {
        assert_eq!(i128_le_bytes(-1), [0xff; 16]);
        assert_eq!(i128_le_bytes(-12_045_818_473),
            [0x97, 0x65, 0x03, 0x32, 0xfd, 0xff, 0xff, 0xff,
             0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
    }

    #[test]
    fn lifted_coulomb_solver_digest_is_stable_and_every_named_class_is_load_bearing() {
        let rows = lifted_receipts().expect("source-41 ordinal 3144 must satisfy its live gate");
        assert_eq!(rows.len(), 18);
        assert!(rows.iter().all(|row| row.external.is_empty()),
            "the source-41 grammar must name any newly nonempty external row");
        let base = hash_lifted(&rows, LiftedMutation::None);
        assert_ne!(base, 0);
        assert_eq!(hash_lifted(&rows, LiftedMutation::None), base);
        for (name, mutation) in [
            ("header", LiftedMutation::Header), ("solver bounds", LiftedMutation::Bounds),
            ("case order", LiftedMutation::CaseOrder),
            ("stored command receipt", LiftedMutation::CommandReceipt),
            ("mapped key", LiftedMutation::Key), ("region", LiftedMutation::Region),
            ("TOI", LiftedMutation::Toi), ("geometry", LiftedMutation::Geometry),
            ("velocity", LiftedMutation::Velocity), ("selected impulse", LiftedMutation::Impulse),
            ("energy", LiftedMutation::Energy), ("state digest", LiftedMutation::State),
            ("empty external-row presence", LiftedMutation::External),
            ("anatomy", LiftedMutation::Anatomy), ("cap", LiftedMutation::Cap),
            ("refusal", LiftedMutation::Refusal),
            ("refusal-cause table", LiftedMutation::RefusalCauseTable),
            ("refusal-phase table", LiftedMutation::RefusalPhaseTable),
            ("group-reject table", LiftedMutation::GroupRejectTable),
            ("damage", LiftedMutation::Damage),
        ] {
            let changed = hash_lifted(&rows, mutation);
            assert_ne!(changed, 0, "{name} mutation produced the invariant sentinel");
            assert_ne!(changed, base, "{name} was absent from the grammar");
        }
    }

    #[test]
    fn lifted_gate_accepts_only_ordinary_submitted_command_provenance() {
        assert_eq!(require_ordinary_strike_provenance(
            LiftedStrikeProvenance::OrdinarySubmittedCommands), Ok(()));
        assert_eq!(require_ordinary_strike_provenance(
            LiftedStrikeProvenance::DirectPoseOrExactState),
            Err("the lifted solver gate refuses direct pose or exact-state strike fixtures"));
        assert!(lifted_case_with_provenance(-1, -256, false,
            LiftedStrikeProvenance::DirectPoseOrExactState).is_none());
        assert!(lifted_case(-1, -256, false).is_some());
    }


    #[test]
    #[ignore]
    fn print_the_lifted_coulomb_solver_digest() {
        println!("LIFTED_COULOMB_SOLVER_DIGEST: {:#018x}", lifted_coulomb_solver_digest());
    }

    #[test]
    #[ignore]
    fn print_the_exact_trajectory_state_digest() {
        println!("EXACT_TRAJECTORY_STATE_DIGEST: {:#018x}", exact_trajectory_state_digest());
    }
}
