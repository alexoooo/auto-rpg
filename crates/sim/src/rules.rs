//! Tuning constants and the stat -> behaviour mapping.
//!
//! This module is the answer to "levelling intelligence actually makes your
//! character faster". Stats do not scale a neural network or swap a behaviour
//! tree; they change **what an agent perceives and how often it is allowed to
//! think**:
//!
//! | Stat         | Effect                                                       |
//! |--------------|--------------------------------------------------------------|
//! | `intellect`  | ticks between decisions -- literally reaction speed           |
//! | `perception` | sight range, positional noise, how many contacts fit in the observation |
//! | `agility`    | movement speed and attack cadence                             |
//! | `power`      | damage per hit                                                |
//! | `vitality`   | maximum health                                                |
//!
//! The consequence is that one trained policy serves every character build. A
//! dim character is not running a worse network -- it is running the same
//! network on a blurrier picture, less often. That is legible to the player,
//! cheap to balance (these are knobs, not retraining runs), and it gives the
//! experiment lab an obvious axis to sweep.

use fx::Fx;

/// Simulation ticks per second. The sim has no wall clock; this only fixes the
/// meaning of "second" in the tuning constants below.
pub const TICKS_PER_SECOND: u32 = 60;

/// Seconds per tick.
pub const DT: Fx = Fx::from_ratio(1, TICKS_PER_SECOND as i32);

/// Upper bound on how many enemies/allies an observation can carry. Also the
/// width of the neural feature block, so changing it changes the network's
/// input shape.
pub const MAX_CONTACTS: usize = 6;

/// Ticks a unit must go without dealing or taking damage before it starts
/// recovering.
pub const REGEN_DELAY: u32 = 3 * TICKS_PER_SECOND;

/// Fraction of maximum health recovered per tick once out of combat: a full
/// heal takes about thirty seconds.
///
/// This is not flavour. Without it, an agent whose health falls below its
/// caution threshold can never come back -- it flees, loses sight of the
/// enemy, marches back under its standing order, flees again, forever. Every
/// such fight ends in a timeout. Measured over 400 rollouts that was 12% of
/// all runs, with mean surviving health of 0.20: not two sides failing to find
/// each other, but two sides of walking wounded who could neither fight nor
/// finish. Regeneration turns disengaging into a real tactic (retreat, recover,
/// return) instead of a slow-motion draw.
pub const REGEN_PER_TICK: Fx = Fx::from_ratio(1, 1800);

/// A character's attributes. Deliberately `u8` and small: these are meant to
/// be legible on a character sheet, not tuned to three decimal places.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Default)]
pub struct Stats {
    pub power: u8,
    pub agility: u8,
    pub intellect: u8,
    pub perception: u8,
    pub vitality: u8,
}

const fn clamp_i32(v: i32, lo: i32, hi: i32) -> i32 {
    if v < lo {
        lo
    } else if v > hi {
        hi
    } else {
        v
    }
}

impl Stats {
    pub const fn new(power: u8, agility: u8, intellect: u8, perception: u8, vitality: u8) -> Stats {
        Stats {
            power,
            agility,
            intellect,
            perception,
            vitality,
        }
    }

    /// `20 + 8 * vitality`
    pub const fn max_hp(self) -> Fx {
        Fx::from_int(20 + 8 * self.vitality as i32)
    }

    /// `2.0 + 1.2 * power` per hit.
    pub const fn damage(self) -> Fx {
        Fx::from_ratio(20 + 12 * self.power as i32, 10)
    }

    /// World units per tick. Kept per-tick rather than per-second so movement
    /// never pays a rounding tax multiplying by [`DT`].
    pub const fn move_speed(self) -> Fx {
        Fx::from_ratio(
            250 + 12 * self.agility as i32,
            100 * TICKS_PER_SECOND as i32,
        )
    }

    /// Ticks between attacks: `40 - agility`, floored at 8 (7.5 hits/second).
    pub const fn attack_period(self) -> u16 {
        clamp_i32(40 - self.agility as i32, 8, 240) as u16
    }

    /// Reach *beyond* the two colliding radii.
    pub const fn attack_range(self) -> Fx {
        Fx::from_ratio(9, 10)
    }

    /// **The intellect stat.** Ticks between decisions: `20 - intellect`,
    /// floored at 1. At 60 Hz that spans 3 decisions/second at `intellect 0`
    /// to 60/second at `intellect 19` -- the difference between a lumbering
    /// brute and something that reacts before you do.
    pub const fn decision_period(self) -> u16 {
        clamp_i32(20 - self.intellect as i32, 1, 120) as u16
    }

    /// `6.0 + 0.6 * perception` world units.
    pub const fn sight_range(self) -> Fx {
        Fx::from_ratio(60 + 6 * self.perception as i32, 10)
    }

    /// Standard deviation of the positional error applied to every contact in
    /// an observation. `1.5` units at `perception 0`, clean by `perception 15`.
    pub const fn perception_noise(self) -> Fx {
        Fx::from_ratio(clamp_i32(15 - self.perception as i32, 0, 15), 10)
    }

    /// How many enemies (and allies) fit in an observation: `2 + perception/3`,
    /// capped at [`MAX_CONTACTS`]. A low-perception character does not merely
    /// see less far -- it cannot hold as much of the battlefield in mind.
    pub const fn tracked_contacts(self) -> usize {
        clamp_i32(2 + self.perception as i32 / 3, 1, MAX_CONTACTS as i32) as usize
    }

    /// Sum of all attributes; a crude "level" for scenario generation.
    pub const fn total(self) -> u32 {
        self.power as u32
            + self.agility as u32
            + self.intellect as u32
            + self.perception as u32
            + self.vitality as u32
    }

    pub(crate) fn hash_into(self, h: &mut fx::Hash64) {
        h.write_u8(self.power);
        h.write_u8(self.agility);
        h.write_u8(self.intellect);
        h.write_u8(self.perception);
        h.write_u8(self.vitality);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn intellect_monotonically_speeds_up_decisions() {
        let mut previous = u16::MAX;
        for intellect in 0..=25u8 {
            let period = Stats::new(5, 5, intellect, 5, 5).decision_period();
            assert!(period <= previous, "intellect {intellect} got slower");
            previous = period;
        }
        assert_eq!(Stats::new(0, 0, 0, 0, 0).decision_period(), 20);
        assert_eq!(Stats::new(0, 0, 19, 0, 0).decision_period(), 1);
        assert_eq!(Stats::new(0, 0, 200, 0, 0).decision_period(), 1);
    }

    #[test]
    fn perception_widens_and_sharpens_the_picture() {
        let dim = Stats::new(0, 0, 0, 0, 0);
        let sharp = Stats::new(0, 0, 0, 18, 0);
        assert!(sharp.sight_range() > dim.sight_range());
        assert!(sharp.perception_noise() < dim.perception_noise());
        assert!(sharp.tracked_contacts() > dim.tracked_contacts());
        assert_eq!(sharp.perception_noise(), Fx::ZERO);
        assert_eq!(sharp.tracked_contacts(), MAX_CONTACTS);
        assert_eq!(dim.tracked_contacts(), 2);
    }

    #[test]
    fn derived_values_never_go_degenerate() {
        for v in [0u8, 1, 7, 20, 100, 255] {
            let s = Stats::new(v, v, v, v, v);
            assert!(s.max_hp() > Fx::ZERO);
            assert!(s.damage() > Fx::ZERO);
            assert!(s.move_speed() > Fx::ZERO);
            assert!(s.attack_period() >= 8);
            assert!(s.decision_period() >= 1);
            assert!(s.sight_range() > Fx::ZERO);
            assert!(s.perception_noise() >= Fx::ZERO);
            assert!((1..=MAX_CONTACTS).contains(&s.tracked_contacts()));
        }
    }

    #[test]
    fn a_fast_character_covers_ground_in_a_reasonable_time() {
        // 10 world units at agility 10 should take a couple of seconds, not
        // a couple of frames or a couple of minutes.
        let speed = Stats::new(0, 10, 0, 0, 0).move_speed();
        let ticks = (Fx::from_int(10) / speed).round_int();
        assert!(
            (60..600).contains(&ticks),
            "10 units took {ticks} ticks at speed {speed}"
        );
    }
}
