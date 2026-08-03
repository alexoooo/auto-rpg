//! Hands, and the momentum that makes them interesting.
//!
//! A character has two: a sword hand and a shield hand. An agent does not swing
//! -- it *commands a bearing*, and the hand accelerates toward it under a
//! torque cap. Everything the combat model is built on falls out of that one
//! choice:
//!
//! * A swing takes time, so it can be read and answered.
//! * A swing cannot be reversed instantly, so overcommitting is punishable.
//! * A blade's damage is its *speed* at contact, so where on the arc you meet
//!   it matters as much as whether you meet it at all.
//!
//! ## The trap
//!
//! [`Hand::drive`] brakes as it approaches its commanded bearing, and arrives
//! at rest. A policy that commands `angle = bearing_to_enemy` therefore lands a
//! blade on its target with **zero spin and zero damage**. That is not a bug to
//! fix here -- it is what "swinging" means. A policy must command *past* its
//! target and let the blade cross it at speed. `world::tests` pins this
//! explicitly so the next person to write a policy meets it as a test name
//! rather than as a fight that will not end.

use crate::action::HandCommand;
use crate::rules::{Weapon, REACH_DRAG};
use fx::{Angle, Fx};

/// Hands per character.
pub const HANDS: usize = 2;
/// Index of the sword hand. The only hand that deals blows.
pub const SWORD: usize = 0;
/// Index of the shield hand. The only hand that blocks.
pub const SHIELD: usize = 1;

/// One hand's live physical state.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct Hand {
    /// Absolute world bearing of the hand from the body's centre.
    ///
    /// An [`Angle`] and not an [`Fx`], for the same reason `facing` is: the
    /// full turn is exactly 65536 units, so it wraps for free and never
    /// accumulates representation error over a fight's worth of rotation.
    pub angle: Angle,
    /// Signed angular velocity, in **raw angle units per tick**.
    ///
    /// [`Fx`] rather than an integer of the same units because acceleration has
    /// to accumulate below one unit per tick -- a shield held gently at a
    /// bearing corrects with torques well under 1, which an integer would
    /// truncate to zero, freezing the hand. Keeping it in the *same units as
    /// the angle* rather than in radians makes integration a plain addition
    /// with no scale factor to round twice.
    pub spin: Fx,
    /// Sub-unit integration residue, in `(-1, 1)` raw angle units.
    ///
    /// Without it, `angle += trunc(spin)` throws away the fraction every tick
    /// and a hand at spin 0.6 never moves at all. This is genuine state: two
    /// worlds differing only in `phase` diverge one tick later, so it is
    /// hashed like everything else.
    pub phase: Fx,
    /// Extension, `0..=1`, from tucked against the body to fully committed.
    pub reach: Fx,
    /// Ticks until this hand may deal a blow again. Stops one continuous swing
    /// from billing damage on every tick it spends inside a body.
    pub refractory: u16,
}

impl Hand {
    /// A hand at rest, pointing along `bearing`.
    pub const fn resting(bearing: Angle) -> Hand {
        Hand {
            angle: bearing,
            spin: Fx::ZERO,
            phase: Fx::ZERO,
            reach: Fx::ZERO,
            refractory: 0,
        }
    }

    /// Advances one tick toward `cmd`.
    ///
    /// `agility` is the wielder's [`crate::rules::agility_multiplier`], already
    /// resolved, so this stays a pure function of the hand and its weapon.
    pub(crate) fn drive(&mut self, cmd: HandCommand, weapon: Weapon, agility: Fx) {
        let want_reach = cmd.reach.clamp(Fx::ZERO, Fx::ONE);

        // An extended blade resists being turned. This is what makes "tuck to
        // reposition, extend to strike" a real decision rather than flavour:
        // a fully committed blade corrects at 55% of a tucked one, so a swing
        // thrown early cannot be quietly re-aimed on the way in.
        let drag = Fx::ONE - REACH_DRAG * self.reach;
        let torque = weapon.torque * agility * drag;
        let ceiling = weapon.max_spin * agility;

        // Bang-bang with a braking cap: run at the ceiling while there is room,
        // then decelerate onto the mark. `sqrt(2 * torque * |error|)` is the
        // fastest approach speed from which a stop is still possible, and
        // `sqrt_product` exists because that product saturates `Fx` well before
        // the square root would run.
        let error = cmd.angle.delta(self.angle);
        let magnitude = Fx::from_int(error.abs());
        let brake = fx::sqrt_product(weapon.torque * agility * Fx::TWO, magnitude);
        let target = brake.min(ceiling);
        let target = if error < 0 { -target } else { target };

        let delta = (target - self.spin).clamp(-torque, torque);
        self.spin = (self.spin + delta).clamp(-ceiling, ceiling);

        // Integrate, carrying the fraction. `trunc_int` and not `floor_int`:
        // truncation toward zero is odd, so a mirrored pair of fighters
        // accumulates mirrored angles instead of drifting apart by one raw unit
        // per tick on whichever side happens to be turning negative.
        let advance = self.phase + self.spin;
        let whole = advance.trunc_int();
        self.angle = self.angle + Angle::from_raw(whole as u16);
        self.phase = advance - Fx::from_int(whole);

        let rate = weapon.extend_rate * agility;
        let gap = want_reach - self.reach;
        self.reach = (self.reach + gap.clamp(-rate, rate)).clamp(Fx::ZERO, Fx::ONE);
    }

    pub(crate) fn hash_into(self, h: &mut fx::Hash64) {
        h.write_u16(self.angle.raw());
        h.write_i32(self.spin.raw());
        h.write_i32(self.phase.raw());
        h.write_i32(self.reach.raw());
        h.write_u16(self.refractory);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::entity::UnitKind;

    fn command(degrees: i32, reach: Fx) -> HandCommand {
        HandCommand {
            angle: Angle::from_degrees(degrees),
            reach,
        }
    }

    /// Runs a hand for `ticks` under one standing command.
    fn settle(kind: UnitKind, cmd: HandCommand, ticks: u32) -> Hand {
        let mut hand = Hand::resting(Angle::ZERO);
        let weapon = kind.weapon();
        let agility = crate::rules::agility_multiplier(kind.base_stats().agility);
        for _ in 0..ticks {
            hand.drive(cmd, weapon, agility);
        }
        hand
    }

    #[test]
    fn a_hand_arrives_at_the_bearing_it_was_commanded() {
        let hand = settle(UnitKind::Warrior, command(90, Fx::ONE), 120);
        assert!(
            hand.angle.delta(Angle::from_degrees(90)).abs() < 200,
            "settled at {:?}",
            hand.angle
        );
        assert_eq!(hand.reach, Fx::ONE);
    }

    #[test]
    fn a_hand_arrives_at_rest_which_is_why_policies_must_overshoot() {
        // The trap, pinned. A blade commanded *at* something reaches it with no
        // useful speed left, and a blade with no speed does no damage.
        //
        // "At rest" is stated in the units that decide the fight rather than in
        // spin: a discrete bang-bang controller hunts by a few angle units
        // around its mark forever, and what matters is that the residue is far
        // below the speed at which a blow registers at all.
        let hand = settle(UnitKind::Warrior, command(90, Fx::ONE), 120);
        let arm = UnitKind::Warrior.radius() + UnitKind::Warrior.weapon().length;
        let speed = fx::tangential_speed(hand.spin, arm);
        assert!(
            speed < crate::rules::IMPACT_THRESHOLD,
            "arrived at {speed} per tick (spin {}), which would still hurt",
            hand.spin
        );
    }

    #[test]
    fn a_swing_cannot_be_reversed_instantly() {
        let weapon = UnitKind::Warrior.weapon();
        let agility = crate::rules::agility_multiplier(UnitKind::Warrior.base_stats().agility);

        // Wind it up to speed the long way round.
        let mut hand = Hand::resting(Angle::ZERO);
        for _ in 0..20 {
            hand.drive(command(180, Fx::ONE), weapon, agility);
        }
        let travelling = hand.spin;
        assert!(travelling.abs() > Fx::from_int(100), "never got moving");

        // Now demand the opposite. Momentum has to be paid off first.
        hand.drive(command(0, Fx::ONE), weapon, agility);
        assert_eq!(
            hand.spin.signum(),
            travelling.signum(),
            "the swing reversed inside a single tick"
        );
        assert!(hand.spin.abs() < travelling.abs(), "it did not even slow");
    }

    #[test]
    fn a_heavier_weapon_turns_slower() {
        let cmd = command(180, Fx::ONE);
        let scout = settle(UnitKind::Scout, cmd, 12);
        let brute = settle(UnitKind::Brute, cmd, 12);
        assert!(
            scout.angle.delta(Angle::ZERO).abs() > brute.angle.delta(Angle::ZERO).abs(),
            "scout {:?} vs brute {:?}",
            scout.angle,
            brute.angle
        );
    }

    #[test]
    fn a_sub_unit_spin_still_turns_the_hand() {
        // The reason `phase` exists. A hand whose top speed is below one raw
        // angle unit per tick must still rotate: without the carried fraction,
        // `angle += trunc(spin)` discards the whole motion every tick and the
        // hand is frozen while claiming to be moving.
        let feeble = Weapon {
            length: Fx::ONE,
            torque: Fx::from_ratio(1, 10),
            max_spin: Fx::from_ratio(6, 10),
            extend_rate: Fx::from_ratio(1, 10),
            weight: Fx::ONE,
            shield_arc: 8192,
        };
        let mut hand = Hand::resting(Angle::ZERO);
        for _ in 0..200 {
            hand.drive(command(90, Fx::ZERO), feeble, Fx::ONE);
        }
        assert!(hand.spin.abs() < Fx::ONE, "not a sub-unit spin: {}", hand.spin);
        assert!(
            hand.angle.delta(Angle::ZERO) > 50,
            "a sub-unit spin never turned the hand: {:?}",
            hand.angle
        );
    }

    #[test]
    fn driving_is_mirror_symmetric() {
        // A mirrored pair must accumulate mirrored angles exactly. This is what
        // `trunc_int` buys over `floor_int`.
        let weapon = UnitKind::Warrior.weapon();
        let mut left = Hand::resting(Angle::ZERO);
        let mut right = Hand::resting(Angle::ZERO);
        for _ in 0..90 {
            left.drive(command(120, Fx::ONE), weapon, Fx::ONE);
            right.drive(command(-120, Fx::ONE), weapon, Fx::ONE);
        }
        assert_eq!(left.angle.delta(Angle::ZERO), -right.angle.delta(Angle::ZERO));
        assert_eq!(left.spin, -right.spin);
        assert_eq!(left.phase, -right.phase);
    }

    #[test]
    fn extension_is_rate_limited() {
        let hand = settle(UnitKind::Brute, command(0, Fx::ONE), 1);
        assert!(hand.reach > Fx::ZERO && hand.reach < Fx::ONE, "{}", hand.reach);
        // And it comes back in too.
        let mut hand = settle(UnitKind::Brute, command(0, Fx::ONE), 200);
        assert_eq!(hand.reach, Fx::ONE);
        let weapon = UnitKind::Brute.weapon();
        let agility = crate::rules::agility_multiplier(UnitKind::Brute.base_stats().agility);
        for _ in 0..200 {
            hand.drive(command(0, Fx::ZERO), weapon, agility);
        }
        assert_eq!(hand.reach, Fx::ZERO);
    }

    #[test]
    fn a_nonsense_command_is_clamped_rather_than_trusted() {
        let hand = settle(UnitKind::Warrior, command(0, Fx::from_int(50)), 100);
        assert_eq!(hand.reach, Fx::ONE);
        let hand = settle(UnitKind::Warrior, command(0, Fx::from_int(-50)), 100);
        assert_eq!(hand.reach, Fx::ZERO);
    }
}
