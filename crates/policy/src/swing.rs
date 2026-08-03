//! Swordsmanship primitives shared by every hand-authored policy.
//!
//! All of it exists to answer questions the sim poses geometrically and that a
//! policy therefore has to answer geometrically too: which way to swing, where
//! a blade will be shortly, and which side of someone their shield is not on.

use fx::{Angle, Fx, Vec2};
use sim::{Contact, HandCommand, Observation};

/// How far past a target a swing aims, in raw angle units (67.5 degrees).
///
/// **This constant is why anyone gets hurt.** A hand brakes onto its commanded
/// bearing and arrives at rest, so a blade commanded straight at an enemy
/// touches them at walking pace and is turned away by the impact threshold. A
/// swing has to be aimed somewhere the enemy is not, so that the enemy is
/// merely somewhere the blade passes through at speed.
pub const OVERSHOOT: i32 = 12_288;

/// How far a blade must travel past its target before the swing reverses.
///
/// The deadband is not a tuning detail. Reversing as soon as the blade crosses
/// its target produces a swordsman that hunts around the enemy at walking pace
/// and never lands anything: decisions arrive every several ticks, so the
/// command flips again mid-return, over and over. Three quarters of the
/// overshoot lets the swing commit.
const REVERSE_AT: i32 = OVERSHOOT * 3 / 4;

/// Which side of `bearing` to swing from, read out of the blade's own state.
///
/// Deliberately memoryless. The blade's angle and spin *are* the memory, and
/// they live in the observation, so a policy does not need a per-entity swing
/// phase and cannot get one out of step with the hand it is driving.
pub fn swing_side(obs: &Observation, bearing: Angle) -> i32 {
    let sword = obs.sword();
    let delta = sword.angle.delta(bearing);
    if delta > REVERSE_AT {
        -1
    } else if delta < -REVERSE_AT || sword.spin.is_positive() {
        // Past the far end of the arc the other way, or already travelling
        // positive and not yet at the end of it. Both mean "keep going".
        1
    } else {
        -1
    }
}

/// A sword command that sweeps through `bearing` at speed.
pub fn swing(obs: &Observation, bearing: Angle, reach: Fx) -> HandCommand {
    let side = swing_side(obs, bearing);
    HandCommand::new(
        bearing + Angle::from_raw((side * OVERSHOOT) as u16),
        reach,
    )
}

/// A sword command that holds still, tucked in. Costs nothing and cannot be
/// punished, because a stationary blade is not a hitbox worth parrying.
pub fn guard_low(bearing: Angle) -> HandCommand {
    HandCommand::new(bearing, Fx::ZERO)
}

/// Where `c`'s blade will be in `ticks` ticks, as a bearing.
///
/// The multiply is staged through `i64` because it overflows [`Fx`] readily:
/// a Scout spins at up to 3540 raw units per tick, and thirty ticks of that is
/// 106,200 against a ceiling of 32,768. Folding the result straight into an
/// [`Angle`] is free -- angles wrap.
pub fn blade_bearing_in(c: &Contact, ticks: u16) -> Angle {
    let advance = (c.sword_spin.raw() as i64 * ticks as i64) >> 16;
    c.sword_angle + Angle::from_raw(advance as i32 as u16)
}

/// Where `c`'s blade tip will be in `ticks` ticks, relative to the observer.
pub fn blade_tip_in(c: &Contact, ticks: u16) -> Vec2 {
    let bearing = blade_bearing_in(c, ticks);
    c.offset + Vec2::from_angle(bearing) * (c.radius + c.weapon_length * c.sword_reach)
}

/// How close `c`'s blade tip will come to the observer within `horizon` ticks,
/// and when.
///
/// Sampled rather than solved. The closed form is a transcendental in the swing
/// angle, and five samples over a horizon of a few dozen ticks is both cheaper
/// and more honest about how much the observer actually knows -- the spin it is
/// extrapolating from was itself perceived through noise.
pub fn incoming(c: &Contact, horizon: u16) -> (Fx, u16) {
    let mut best = Fx::MAX;
    let mut when = 0;
    for step in 0..=4u16 {
        let t = horizon * step / 4;
        let range = blade_tip_in(c, t).length();
        if range < best {
            best = range;
            when = t;
        }
    }
    (best, when)
}

/// The perpendicular of `offset` that leads away from `c`'s shield.
///
/// One sign test, no trigonometry. Orbiting counter-clockwise about the enemy
/// *increases* the observer's bearing as seen from the enemy, and the direction
/// that does so is the perpendicular of the enemy-to-observer vector -- note
/// that is `(-offset).perp()`, not `offset.perp()`, which is the same line and
/// the opposite way round. So: if the shield sits clockwise of where the
/// observer stands, orbit counter-clockwise, and the guard falls further behind.
pub fn shield_free_side(c: &Contact) -> Vec2 {
    // Counter-clockwise about the enemy, expressed in the observer's frame.
    let widdershins = (-c.offset).perp().normalize();
    // Bearing from the enemy back to the observer.
    let toward_me = (-c.offset).angle();
    if c.shield_angle.delta(toward_me) > 0 {
        // Shield already counter-clockwise of us: go the other way.
        -widdershins
    } else {
        widdershins
    }
}

/// A blade that has swept past the observer and is still travelling away is an
/// opening; this is how big one, `0..=1`.
///
/// The measure is **how far past it has gone**, and deliberately not how fast.
/// Speed looks like the right term and is exactly backwards: recovery time is
/// roughly `spin / torque`, and a heavy weapon is slow in both, so a Brute
/// crawling away at a fifth of a Scout's speed still takes three times as long
/// to bring its blade back. Scaling by speed would rate the most punishable
/// opening in the game as the least. Angle travelled is what both fighters can
/// see and what the recovery is actually proportional to.
///
/// Speed survives only as a gate: a blade that has stopped is not recovering
/// from anything and can start back the instant it likes.
pub fn overcommitted(c: &Contact) -> Fx {
    let toward_me = (-c.offset).angle();
    let past = c.sword_angle.delta(toward_me);
    let travelling = c.sword_spin.abs() > Fx::from_int(100);
    if !travelling || past.signum() != c.sword_spin.signum().round_int() || past.abs() < 8192 {
        return Fx::ZERO;
    }
    Fx::from_ratio(past.abs(), 32_768)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sim::EntityId;

    fn contact(x: i32, y: i32) -> Contact {
        Contact {
            id: EntityId::new(1, 0),
            offset: Vec2::from_ints(x, y),
            distance: Vec2::from_ints(x, y).length(),
            hp_frac: Fx::ONE,
            radius: Fx::from_ratio(45, 100),
            weapon_length: Fx::from_ratio(95, 100),
            facing: Angle::ZERO,
            sword_angle: Angle::ZERO,
            sword_reach: Fx::ONE,
            sword_spin: Fx::ZERO,
            shield_angle: Angle::ZERO,
            shield_reach: Fx::ONE,
        }
    }

    #[test]
    fn a_blade_is_extrapolated_forward_without_overflowing() {
        let mut c = contact(3, 0);
        // A Scout's top speed for thirty ticks: 106,200 raw units, which is
        // three and a half times what `Fx` can hold.
        c.sword_spin = Fx::from_int(3540);
        let soon = blade_bearing_in(&c, 30);
        let expected = Angle::from_raw(((3540i64 * 30) & 0xFFFF) as u16);
        assert!(soon.delta(expected).abs() <= 1, "{soon:?}");

        // And it runs backwards for a backswing.
        c.sword_spin = Fx::from_int(-3540);
        assert_eq!(blade_bearing_in(&c, 30), -expected);
    }

    #[test]
    fn circling_leads_away_from_the_guard() {
        // Enemy due east, its shield pointing west -- straight at the observer.
        // Either way round is equally bad, so this only has to be consistent.
        let mut c = contact(3, 0);
        c.shield_angle = Angle::HALF;
        let away = shield_free_side(&c);
        assert!(!away.is_zero());

        // Now swing its guard to the north-west. Circling south takes the
        // observer further from what the shield covers.
        c.shield_angle = Angle::from_degrees(135);
        assert!(
            shield_free_side(&c).y < Fx::ZERO,
            "circled into the shield: {:?}",
            shield_free_side(&c)
        );
        c.shield_angle = Angle::from_degrees(-135);
        assert!(shield_free_side(&c).y > Fx::ZERO);
    }

    #[test]
    fn overcommitment_needs_the_blade_past_you_and_still_going() {
        let mut c = contact(3, 0);
        // Blade pointing straight at the observer, travelling: not past yet.
        c.sword_angle = Angle::HALF;
        c.sword_spin = Fx::from_int(2000);
        assert_eq!(overcommitted(&c), Fx::ZERO);

        // Well past, still travelling away: punishable.
        c.sword_angle = Angle::HALF + Angle::from_raw(16_384);
        assert!(overcommitted(&c).is_positive());

        // Past, but on its way back: not punishable.
        c.sword_spin = Fx::from_int(-2000);
        assert_eq!(overcommitted(&c), Fx::ZERO);

        // Past and stationary: nothing to punish and nothing to fear.
        c.sword_spin = Fx::ZERO;
        assert_eq!(overcommitted(&c), Fx::ZERO);
    }

    #[test]
    fn a_swing_further_past_is_a_bigger_opening_and_speed_does_not_enter_it() {
        let mut slow = contact(3, 0);
        slow.sword_angle = Angle::HALF + Angle::from_raw(12_288);
        slow.sword_spin = Fx::from_int(600);
        let mut fast = slow;
        fast.sword_spin = Fx::from_int(2400);
        assert_eq!(
            overcommitted(&fast),
            overcommitted(&slow),
            "speed leaked into the measure, which would rate a Brute's \
             three-quarter-second recovery below a Scout's quarter-second one"
        );

        let mut further = fast;
        further.sword_angle = Angle::HALF + Angle::from_raw(24_000);
        assert!(overcommitted(&further) > overcommitted(&fast));
    }

    #[test]
    fn a_ponderous_weapon_offers_a_real_opening_not_a_token_one() {
        // The case the previous formulation got wrong. A Brute crawling away at
        // 700 units per tick is the most punishable thing in the game.
        let mut brute = contact(2, 0);
        brute.sword_angle = Angle::HALF + Angle::from_raw(20_000);
        brute.sword_spin = Fx::from_int(700);
        assert!(
            overcommitted(&brute) > Fx::HALF,
            "a fully committed heavy swing scored only {}",
            overcommitted(&brute)
        );
    }
}
