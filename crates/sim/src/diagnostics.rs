//! Shared construction and command transcripts for registered diagnostics.
//!
//! These are inputs, not encoders. Web retains the byte folds it pins; Lab can
//! drive the same worlds without copying a fixture that would later drift.

use crate::{ArmTarget, CombatHeight, CommandCoreV1, CommandV1, EntityId,
            GripRequest, Intent, ReleaseRequest, Scenario, EMBODIED_PAYLOAD_BYTES};
use fx::{Angle, Fx, Vec2};

/// Non-authoritative evidence for the first owner constraint attempted in a tick.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum SelfCollisionObstacleDiagnostic {
    Body { region: u8 },
    OppositeShape { limb: u8, shape: u8 },
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct SelfCollisionAttemptDiagnostic {
    pub moving_limb: u8,
    /// Upper arm, forearm, held segment and shield are `0..=3`.
    pub moving_shape: u8,
    pub obstacle: SelfCollisionObstacleDiagnostic,
    pub last_clear: Fx,
}

impl SelfCollisionAttemptDiagnostic {
    /// Session-01's stable swept-volume codes: body `0..=6`, held `7..=8`, shield `9`.
    pub fn volume_codes(self) -> (usize, usize) {
        let shape = |limb: u8, kind: u8| match kind {
            0 => 2 + limb as usize,
            1 => 5 + limb as usize,
            2 => 7 + limb as usize,
            3 => 9,
            _ => usize::MAX,
        };
        let moving = shape(self.moving_limb, self.moving_shape);
        let obstacle = match self.obstacle {
            SelfCollisionObstacleDiagnostic::Body { region } => region as usize,
            SelfCollisionObstacleDiagnostic::OppositeShape { limb, shape: kind } =>
                shape(limb, kind),
        };
        (moving, obstacle)
    }
}

pub const STREAM_DIGEST_SEED: u64 = 1;
pub const STREAM_DIGEST_TICKS: u32 = 20;

pub fn stream_digest_scenario() -> Scenario {
    let mut scenario = Scenario::embodied_duel();
    scenario.name = "embodied-stream-v1".to_string();
    scenario.units[0].spawn = Vec2::from_ints(9, 6);
    scenario.units[1].spawn = Vec2::from_ints(7, 6);
    scenario
}

pub fn stream_digest_commands() -> [(EntityId, CommandV1); 2] {
    let fighter = EntityId::new(0, 0);
    let brute = EntityId::new(1, 0);
    let arm = ArmTarget { bearing: Angle::ZERO, height: CombatHeight::MID,
                          reach: Fx::ONE, effort: Fx::ONE };
    let command = |walk, target| CommandV1::new(CommandCoreV1 {
        move_dir: walk, body_yaw: Angle::ZERO, intent: Intent::Attack(target),
        arms: [arm; 2], grips: [GripRequest::Keep; 2],
        releases: [ReleaseRequest::Keep; 2],
    });
    [(fighter, command(Vec2::new(-Fx::ONE, Fx::ZERO), brute)),
     (brute, command(Vec2::ZERO, fighter))]
}

pub const COMMAND_PROBE_PAYLOAD: [u8; EMBODIED_PAYLOAD_BYTES] = [
    0x01,0x00,0x00,0x00, 0xfe,0xff,0xff,0xff, 0x34,0x12,0x01,
    0x44,0x33,0x22,0x11, 0x88,0x77,0x66,0x55, 0x45,0x23,
    0x00,0x40,0x00,0x00, 0x03,0x00,0x00,0x00, 0x04,0x00,0x00,0x00,
    0x56,0x34, 0x00,0xc0,0x00,0x00, 0x05,0x00,0x00,0x00,
    0x06,0x00,0x00,0x00, 0x02,0x01,0x01,0x00, 0x00,0x01,
    0x67,0x45, 0xab,0x89,
];

pub fn command_probe() -> (Scenario, u64, EntityId, CommandV1) {
    let command = CommandV1::from_payload_bytes(&COMMAND_PROBE_PAYLOAD)
        .expect("registered command-probe payload");
    (Scenario::embodied_duel(), 1, EntityId::new(0, 0), command)
}

/// The command transcript registered by `EMBODIED_GOLDEN_DIGEST`.
///
/// The fixture owns how `heading` is observed. Keeping only the command here
/// lets its test and the Lab audit share the exact transcript without moving
/// the fixture's ground-truth/perceived choice out of the test that pins it.
pub fn golden_closing_command(tick: u32, heading: Vec2) -> CommandV1 {
    let side = if (tick / 6) % 2 == 0 { 6_144 } else { -6_144 };
    let arm = ArmTarget { bearing: Angle::from_raw(side as u16),
        height: CombatHeight::HIGH, reach: Fx::ONE, effort: Fx::ONE };
    CommandV1::new(CommandCoreV1 {
        move_dir: Vec2::new(Fx::ONE, Fx::ZERO),
        body_yaw: heading.angle(),
        intent: Intent::Hold, arms: [arm; 2], grips: [GripRequest::Keep; 2],
        releases: [ReleaseRequest::Keep; 2],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registered_command_and_stream_inputs_are_single_shared_values() {
        let (_, seed, id, command) = command_probe();
        assert_eq!((seed, id), (1, EntityId::new(0, 0)));
        assert_eq!(command.payload_bytes(), COMMAND_PROBE_PAYLOAD);
        let scenario = stream_digest_scenario();
        assert_eq!((scenario.name.as_str(), scenario.units[0].spawn, scenario.units[1].spawn),
                   ("embodied-stream-v1", Vec2::from_ints(9, 6), Vec2::from_ints(7, 6)));
        assert_eq!(stream_digest_commands().len(), 2);
    }
}
