//! Cross-target digest for the retained ordinary exact-contact lifecycle.
//!
//! This is deliberately a feature-only diagnostic, not a second state hash.
//! It reruns one stored-command replay and then fingerprints both authority and
//! the evidence rows needed to review why that authority moved.

use crate::{ArmTarget, ArticulatedCommandV1, Body, BodyPart, CombatHeight,
            ContactKind, DuelConfigV1, EntityId, EquipmentGeometry, GripRequest,
            HashDomain, Intent, RecoilExternalEnergy, Replay, ResolutionError,
            Scenario, SubmitArticulatedOutcome, SubmittedCommand, World,
            ARTICULATED_PAYLOAD_BYTES, SUBMITTED_COMMAND_LAYOUT_VERSION};
use fx::{Angle, Fx, Hash64, Vec2, Vec3};

const TICKS: u32 = 56;

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
    let mut config = DuelConfigV1::shipped();
    let target = Vec2::new(Fx::from_int(12), Fx::from_int(16) - Body::Brute.radius());
    if target.y.raw() != 1_002_701 { return None; }
    let offset = Vec2::new(Fx::from_raw(-163_840), Fx::from_raw(-65_536));
    config.fighters[1].spawn = target;
    config.fighters[0].spawn = target + offset;
    config.fighters[0].hands[1].as_mut()?.geometry = EquipmentGeometry::Segment {
        length: Fx::from_int(2), radius: Fx::from_ratio(1, 25),
    };
    config.max_ticks = TICKS;
    let scenario = Scenario::duel_from(&config).ok()?;
    let mut first = World::new(&scenario, 0);
    let mut second = World::new(&scenario, 0);
    let mut replay = Replay::new(&scenario, 0);
    let attacker = EntityId::new(0, 0);
    let defender = EntityId::new(1, 0);
    let yaws = [first.articulated_pose(attacker)?.body_yaw,
                first.articulated_pose(defender)?.body_yaw];
    let toward = (-offset).angle();
    let chamber = toward - Angle::from_raw(8_192);
    let strike = toward + Angle::from_raw(8_192);
    let strike_height = CombatHeight::try_from_raw(16_384)?;
    let neutral = |yaw| {
        let arm = ArmTarget { bearing: yaw, height: CombatHeight::MID,
                              reach: Fx::ZERO, effort: Fx::ZERO };
        ArticulatedCommandV1 { move_dir: Vec2::ZERO, body_yaw: yaw,
            intent: Intent::Hold, arms: [arm; 2], grips: [GripRequest::Keep; 2] }
    };
    let command_at = |tick, id| {
        if id == defender { return neutral(yaws[1]); }
        let mut command = neutral(yaws[0]);
        if tick < 53 {
            command.intent = Intent::Attack(defender);
            command.arms[1] = ArmTarget {
                bearing: if tick < 28 { chamber } else { strike },
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

    for tick in 0..TICKS {
        for id in [attacker, defender] {
            let requested = command_at(tick, id);
            let stored = match first.submit_articulated_v1(id, requested) {
                SubmitArticulatedOutcome::Stored { command, rejection: None } => command,
                _ => return None,
            };
            let rerun = if verify_reproduction {
                match second.submit_articulated_v1(id, requested) {
                    SubmitArticulatedOutcome::Stored { command, rejection: None } => command,
                    _ => return None,
                }
            } else { stored };
            if rerun != stored { return None; }
            replay.record_submitted(tick, id, SubmittedCommand::Articulated(stored));
        }
        first.step();
        if verify_reproduction { second.step(); }
        replay.finish(tick + 1);
        let mut played = if verify_reproduction {
            replay.play_until(tick + 1)
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
            let SubmittedCommand::Articulated(command) = row.command else { return None };
            let mut payload = command.payload_bytes();
            if mutation.command_byte && !changed_command {
                payload[0] ^= 1;
                changed_command = true;
            }
            hash.write_bytes(&payload);
        }
        hash.write_u8(match state.domain { HashDomain::LegacyV1 => 0, HashDomain::ArticulatedV1 => 1 });
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
            if row.fact.key.kind == ContactKind::WeaponBody
                && row.fact.key.a == attacker && row.fact.key.a_slot == 1
                && row.fact.key.b == defender && row.fact.region == BodyPart::Legs as u8 {
                if weapon_body_ticks.last() != Some(&(tick + 1)) {
                    weapon_body_ticks.push(tick + 1);
                }
            }
            hash.write_u8(row.group_ordinal);
            hash.write_u32(row.group_alpha_raw);
            let key = row.fact.key;
            write_entity(&mut hash, key.a); hash.write_u8(key.a_slot);
            write_entity(&mut hash, key.b); hash.write_u8(key.b_slot); write_contact_kind(&mut hash, key.kind);
            hash.write_u8(row.fact.region);
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
            wall |= row.entity == defender && row.lane == 0
                && row.reason == RecoilExternalEnergy::WALL
                && tick + 1 == 45 && row.signed_numerator == -9_986_235_012
                && row.denominator == 8_589_934_592;
            release |= row.entity == attacker && row.lane == 2
                && row.reason == RecoilExternalEnergy::RELEASE
                && tick + 1 == 54 && row.signed_numerator == -1_073_625_268_272
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
    if accepted_groups != 2 || weapon_body_ticks != [45, 46]
        || momentum_ticks != (45..=56).collect::<Vec<_>>()
        || position_ticks != (45..=56).collect::<Vec<_>>()
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
        assert_eq!(i128_le_bytes(-9_986_235_012),
            [0x7c, 0x25, 0xc6, 0xac, 0xfd, 0xff, 0xff, 0xff,
             0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
    }

    #[test]
    #[ignore]
    fn print_the_exact_trajectory_state_digest() {
        println!("EXACT_TRAJECTORY_STATE_DIGEST: {:#018x}", exact_trajectory_state_digest());
    }
}
