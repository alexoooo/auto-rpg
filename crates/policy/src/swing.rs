//! Swordsmanship primitives shared by every hand-authored policy.
//!
//! All of it exists to answer questions the sim poses geometrically and that a
//! policy therefore has to answer geometrically too: when a blow will arrive,
//! where it will arrive, which side of someone their shield is not on, and
//! whether the fighter opposite is currently able to do anything about you.
//!
//! ## What moved into the sim
//!
//! The previous version of this module owned the *shape* of a swing: an
//! `OVERSHOOT` constant, a `swing_side` that read which way the blade was
//! already going, and a `swing` that aimed past the target so the blade would
//! cross it at speed. All three are gone, because the sim now runs the attack
//! itself -- a policy names a line and asks, and the phases do the rest.
//!
//! That was not a refactor for tidiness. Those three pieces were a *convention*
//! that every policy had to reimplement identically and that nothing enforced,
//! and the one strategy they made available was to sweep back and forth forever.
//! What is left here is the half that is genuinely a policy's job: reading the
//! other fighter.

use fx::{Angle, Fx, Vec2};
use sim::{Contact, HandCommand, Observation, Strike, Swing};

/// Holds the attack command down on `line`.
///
/// **Use this rather than building a [`HandCommand`] by hand.** The rhythm has
/// three states and two of them are traps:
///
/// * At guard and armed, asking to attack starts a cut.
/// * Mid-windup or mid-cut, the command has to *keep* asking. Letting it lapse
///   there cancels the windup, which is [`feint`] and is not what a fighter
///   pressing an attack wants.
/// * Mid-recovery, the command has to *stop* asking, or the hand comes back to
///   guard disarmed and the fighter throws one cut and never another.
///
/// The recovery arm points the guard at `line` while it waits, so the blade
/// comes back to somewhere useful rather than to wherever the last cut ended.
pub fn press(obs: &Observation, line: Angle, side: Strike) -> HandCommand {
    let sword = obs.sword();
    match sword.swing {
        Swing::Guard if sword.armed => HandCommand::attack(line, side),
        Swing::Windup | Swing::Strike => HandCommand::attack(line, side),
        // Guard-but-disarmed and Recover both want the same thing: a command
        // that is not an attack, which is what re-arms the hand.
        _ => guard(line),
    }
}

/// Holds the blade chambered on `line`, attacking nothing.
///
/// Costs nothing, cannot be punished, and re-arms the hand for the next cut. A
/// guarding blade is still a segment, so it can catch an incoming one.
pub fn guard(line: Angle) -> HandCommand {
    HandCommand::new(line, Fx::ZERO)
}

/// Shows a cut on `line` and takes it back.
///
/// A windup is free to cancel, which is the whole mechanic: the blade goes
/// visibly back, the defender commits a guard or a sidestep to the line it can
/// see, and nothing arrives. What it costs the feinter is tempo, and what it
/// buys is a defender whose shield is now in the wrong place.
///
/// `commit_within` is how few ticks of telegraph may be left before the feint is
/// called off -- pull out too early and nobody believed it, too late and it
/// stops being a feint and becomes an attack.
pub fn feint(obs: &Observation, line: Angle, side: Strike, commit_within: u16) -> HandCommand {
    let sword = obs.sword();
    match sword.swing {
        Swing::Windup if sword.swing_left <= commit_within => guard(line),
        _ => press(obs, line, side),
    }
}

/// Which side to cut from so the blow arrives away from `c`'s guard.
///
/// The chain is short and every link is easy to get backwards, so it is worth
/// spelling out. A [`Strike::Widdershins`] cut winds up counter-clockwise and
/// therefore *travels* clockwise, and a blade sweeping clockwise across a body
/// touches it on the side it is coming from -- which is the clockwise flank, as
/// measured from that body's centre. So:
///
/// ```text
///   Widdershins  ->  lands clockwise of the line between us
///   Sunwise      ->  lands counter-clockwise of it
/// ```
///
/// Pick the one whose landing flank the shield is not already on. Getting it
/// wrong is not neutral: it throws every attack into the middle of the guard.
pub fn open_side(c: &Contact) -> Strike {
    // Bearing from the enemy back to us: the line the cut travels along.
    let toward_me = (-c.offset).angle();
    if c.shield_angle.delta(toward_me) > 0 {
        // Guard sits counter-clockwise of that line, so land the blow on the
        // clockwise flank.
        Strike::Widdershins
    } else {
        Strike::Sunwise
    }
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

/// Which way a declared cut wound up: `+1` counter-clockwise, `-1` clockwise.
///
/// Read off the pose rather than told: a cocked blade sits on the side it was
/// drawn back to, so where it is relative to the line it is aimed along says
/// which way it is about to travel. Both numbers are perceived, so this is the
/// first thing a dim fighter gets wrong.
fn declared_side(c: &Contact) -> i32 {
    if c.sword_angle.delta(c.sword_line) >= 0 {
        1
    } else {
        -1
    }
}

/// **Where a declared cut will actually touch this fighter, if it touches at
/// all.** Relative to the observer, so `.angle()` is the bearing to cover.
///
/// This is the single most useful thing a defender can compute, and it answers
/// two questions that look like one:
///
/// * *Will it hit me?* A cut is thrown along a line, and a line can miss. A
///   fighter that treats every declared attack as an emergency spends the fight
///   defending against blows that were never going to land. `None` is a
///   perfectly good answer and it means "keep fighting".
/// * *Where?* Not at the enemy, and emphatically not at the blade. A cut sweeps
///   in and first touches a body well round from where its wielder stands, and
///   during a windup the blade is cocked *away* from the line -- so covering
///   the blade covers the one bearing the blow cannot come from.
///
/// The cut is replayed rather than extrapolated. Under the old free-spinning
/// model the only way to guess where a blade was going was to project its
/// perceived spin forward, which was a bet on a noisy number and could not tell
/// an attack from a blade that happened to be moving. A declared cut has a
/// *plan* -- a line, a side, a fixed follow-through -- and the plan is in the
/// observation. What is left uncertain is exactly what should be: the line and
/// the pose are both blurred by perception, so a dim fighter replays the wrong
/// cut and covers the wrong bearing with complete confidence.
pub fn landing(obs: &Observation, c: &Contact) -> Option<Vec2> {
    if !c.sword_swing.is_attacking() {
        return None;
    }
    let side = declared_side(c);
    // Where the cut ends, and therefore how much arc it has left to travel.
    let end = c.sword_line - Angle::from_raw((side * sim::FOLLOW_THROUGH) as u16);
    let travel = (end.delta(c.sword_angle) * -side).max(0);

    // Eight steps along the remaining arc, three points along the blade. The
    // blade is a segment and not a point: a cut can arrive hilt-first at close
    // quarters, which is the whole reason a heavy weapon has a dead zone.
    for step in 0..=8 {
        let at = c.sword_angle - Angle::from_raw((side * travel * step / 8) as u16);
        let out = Vec2::from_angle(at);
        for k in 1..=3 {
            let along = c.radius + c.weapon_length * Fx::from_ratio(k, 3);
            let point = c.offset + out * along;
            if point.length() <= obs.radius {
                return Some(point);
            }
        }
    }
    None
}

/// How much of a threat `c` is *right now*, `0..=1`, and how many ticks are left
/// before it lands.
///
/// This replaced an extrapolation of spin, and the replacement is the point of
/// the whole redesign. Guessing where a freely-rotating blade would be in twenty
/// ticks was a bet on a number that was itself perceived through noise, and it
/// could not distinguish a fighter who was about to attack from one whose blade
/// merely happened to be moving. The phase says which it is outright.
///
/// The reading:
///
/// * [`Swing::Windup`] -- a cut is coming, and the danger *rises* as the
///   telegraph runs out. Early in a windup there is time to do something better
///   than defend; late in one there is not.
/// * [`Swing::Strike`] -- it is already here. Full danger, no argument.
/// * [`Swing::Guard`] and [`Swing::Recover`] -- nothing is arriving. A blade
///   parked next to you is not a threat, it is furniture, and one on its way
///   back to guard is an opportunity.
///
/// [`landing`] gates all of it: a cut thrown wide, or from out of reach, is
/// somebody else's problem. That gate is worth as much as the phase itself --
/// without it a fighter treats every attack in its vicinity as aimed at it, and
/// a fighter that is always defending never wins anything.
pub fn incoming(obs: &Observation, c: &Contact) -> (Fx, u16) {
    if landing(obs, c).is_none() {
        return (Fx::ZERO, 0);
    }
    match c.sword_swing {
        Swing::Strike => (Fx::ONE, 0),
        Swing::Windup => {
            let left = c.sword_left.max(Fx::ZERO);
            // A telegraph a full second out is barely a threat; one about to
            // finish is the whole of one. Scaled against a fixed second rather
            // than against the weapon's own windup, because a defender reading a
            // blade it has never fought before still knows how long half a
            // second is.
            let urgency = Fx::ONE - (left / Fx::from_int(45)).min(Fx::ONE);
            (urgency, left.round_int().clamp(0, 600) as u16)
        }
        Swing::Guard | Swing::Recover => (Fx::ZERO, 0),
    }
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

/// How badly `c` is out of position, `0..=1`. **The punish signal.**
///
/// A recovering hand cannot attack, cannot parry, and cannot be made to do
/// anything about what happens next, and it says so in the observation. The
/// measure is how much of that recovery is left, so a Brute that has just missed
/// scores near one for the better part of a second and a Scout scores briefly.
///
/// Note what this no longer has to do. The previous version inferred the same
/// thing from geometry -- how far past you the blade had swept, gated on it
/// still travelling -- and it needed a careful argument about why *angle* rather
/// than *speed* was the right term, because a heavy weapon crawls away slowly
/// and is the most punishable thing in the game. That argument is still true and
/// no longer needs making: recovery is measured in ticks, and a Brute's is
/// nearly three times a Scout's because its weapon says so.
pub fn overcommitted(c: &Contact) -> Fx {
    if c.sword_swing != Swing::Recover {
        return Fx::ZERO;
    }
    (c.sword_left / Fx::from_int(45)).clamp(Fx::ZERO, Fx::ONE)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sim::{EntityId, Faction, Order, UnitKind};

    fn contact(x: i32, y: i32) -> Contact {
        Contact {
            id: EntityId::new(1, 0),
            offset: Vec2::from_ints(x, y),
            distance: Vec2::from_ints(x, y).length(),
            hp_frac: Fx::ONE,
            radius: Fx::from_ratio(45, 100),
            weapon_length: Fx::from_ratio(95, 100),
            min_strike_range: sim::dead_zone(sim::Arm::resolve(
                UnitKind::Warrior.weapon(),
                UnitKind::Warrior.base_stats(),
                UnitKind::Warrior.radius(),
            )),
            // A Warrior seen by the Scout in `observer`, both ways round.
            threat: Fx::from_ratio(277, 1000),
            frailty: Fx::from_ratio(126, 1000),
            velocity: Vec2::ZERO,
            facing: Angle::ZERO,
            sword_angle: Angle::ZERO,
            sword_reach: Fx::ONE,
            sword_spin: Fx::ZERO,
            sword_swing: Swing::Guard,
            sword_left: Fx::ZERO,
            sword_line: Angle::ZERO,
            shield_angle: Angle::ZERO,
            shield_reach: Fx::ONE,
        }
    }

    fn observer() -> Observation {
        let mut obs = Observation::blank(
            0,
            EntityId::new(0, 0),
            Faction::Heroes,
            Vec2::from_ints(20, 14),
            Order::Hold,
        );
        obs.radius = UnitKind::Scout.radius();
        obs.weapon_length = UnitKind::Scout.weapon().length;
        obs.sight_range = Fx::from_int(14);
        obs
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
    fn a_recovering_blade_is_the_opening_and_nothing_else_is() {
        let mut c = contact(2, 0);

        // Guard, however fast the hand happens to be moving: not an opening.
        c.sword_spin = Fx::from_int(2400);
        assert_eq!(overcommitted(&c), Fx::ZERO);

        // Mid-cut: emphatically not an opening.
        c.sword_swing = Swing::Strike;
        c.sword_left = Fx::from_int(20);
        assert_eq!(overcommitted(&c), Fx::ZERO);

        // Recovering: the whole point.
        c.sword_swing = Swing::Recover;
        c.sword_left = Fx::from_int(30);
        assert!(overcommitted(&c) > Fx::HALF);

        // ...and it closes as the recovery runs out.
        c.sword_left = Fx::from_int(3);
        assert!(overcommitted(&c) < Fx::from_ratio(2, 10));
    }

    #[test]
    fn a_ponderous_weapon_offers_a_bigger_opening_than_a_quick_one() {
        // The property the old geometric version had to argue for and this one
        // gets from the clock: a Brute that has just missed is helpless for
        // three times as long as a Scout that has.
        let ticks = |kind: UnitKind| {
            let w = kind.weapon();
            sim::phase_ticks(w.recovery, sim::agility_multiplier(kind.base_stats().agility))
        };
        let mut brute = contact(2, 0);
        brute.sword_swing = Swing::Recover;
        brute.sword_left = Fx::from_int(ticks(UnitKind::Brute) as i32);
        let mut scout = contact(2, 0);
        scout.sword_swing = Swing::Recover;
        scout.sword_left = Fx::from_int(ticks(UnitKind::Scout) as i32);

        assert!(
            overcommitted(&brute) > overcommitted(&scout) * Fx::TWO,
            "brute {} vs scout {}",
            overcommitted(&brute),
            overcommitted(&scout)
        );
        assert!(overcommitted(&brute) > Fx::HALF);
    }

    /// A contact at `(x, y)` mid-windup, with the cut declared straight back
    /// along the line between us -- which is the one that actually arrives.
    fn declared_at_me(x: i32, y: i32) -> Contact {
        let mut c = contact(x, y);
        c.sword_swing = Swing::Windup;
        c.sword_line = (-c.offset).angle();
        c.sword_angle = c.sword_line + Angle::from_raw(sim::WINDUP_ARC as u16);
        c.sword_left = Fx::from_int(10);
        c
    }

    #[test]
    fn danger_rises_as_the_telegraph_runs_out() {
        let obs = observer();
        let mut c = declared_at_me(1, 0);

        c.sword_swing = Swing::Guard;
        assert_eq!(incoming(&obs, &c).0, Fx::ZERO, "a guard is not an attack");

        c.sword_swing = Swing::Windup;
        c.sword_left = Fx::from_int(40);
        let early = incoming(&obs, &c).0;
        c.sword_left = Fx::from_int(4);
        let late = incoming(&obs, &c).0;
        assert!(late > early, "early {early} vs late {late}");
        assert!(early < Fx::HALF, "a distant telegraph already read as urgent");

        c.sword_swing = Swing::Strike;
        assert_eq!(incoming(&obs, &c).0, Fx::ONE);

        c.sword_swing = Swing::Recover;
        assert_eq!(incoming(&obs, &c).0, Fx::ZERO, "a spent cut still frightened");
    }

    #[test]
    fn a_cut_thrown_from_out_of_range_is_somebody_elses_problem() {
        let obs = observer();
        let mut far = declared_at_me(9, 0);
        far.sword_swing = Swing::Strike;
        assert_eq!(incoming(&obs, &far).0, Fx::ZERO);
        assert!(landing(&obs, &far).is_none());
    }

    #[test]
    fn a_cut_aimed_elsewhere_is_not_a_reason_to_stop_fighting() {
        // The gate that decides whether a duellist ever wins anything. An enemy
        // at arm's length swinging at *something else* is not an emergency, and
        // a fighter that cannot tell the difference spends every fight behind
        // its shield.
        let obs = observer();
        let mut wide = declared_at_me(1, 0);
        // Turned well off the line between us. It has to be *well* off: a cut
        // sweeps 146 degrees of arc, and a body at arm's length subtends
        // another twenty, so at close quarters the bearings a cut does not
        // cover are the minority. That is not a flaw in the test -- it is why
        // spacing is worth anything, and why stepping *across* a swing beats
        // backing away from one.
        wide.sword_line = wide.sword_line + Angle::from_degrees(150);
        wide.sword_angle = wide.sword_line + Angle::from_raw(sim::WINDUP_ARC as u16);
        assert!(landing(&obs, &wide).is_none(), "a cut thrown wide still read as incoming");
        assert_eq!(incoming(&obs, &wide).0, Fx::ZERO);

        // ...and a quarter turn off is *not* enough to be safe at this range.
        let mut near_miss = declared_at_me(1, 0);
        near_miss.sword_line = near_miss.sword_line + Angle::QUARTER;
        near_miss.sword_angle = near_miss.sword_line + Angle::from_raw(sim::WINDUP_ARC as u16);
        assert!(landing(&obs, &near_miss).is_some());
    }

    #[test]
    fn a_declared_cut_lands_somewhere_other_than_where_its_wielder_stands() {
        // The read the whole shield mechanic rests on. A cut sweeps in and
        // touches the body round from the line between the two fighters, so
        // covering the bearing of the swordsman is not the same as covering the
        // blow -- and covering the *blade* during a windup is worse than either,
        // because a cocked blade points at the one place the cut cannot come
        // from.
        let obs = observer();
        let c = declared_at_me(1, 0);
        let at = landing(&obs, &c).expect("a cut aimed straight at me missed");
        let toward_enemy = c.offset.angle();
        let off = at.angle().delta(toward_enemy).abs();
        assert!(off > 1_000, "the blow landed dead on the line between us");
        assert!(
            at.angle().delta(c.sword_angle).abs() > 8_000,
            "the landing point and the cocked blade are the same bearing"
        );
    }

    #[test]
    fn pressing_an_attack_holds_through_the_cut_and_releases_to_recover() {
        // The four-state rhythm, pinned. Two of these arms are the difference
        // between a swordsman and a statue.
        let mut obs = observer();
        let line = Angle::from_degrees(30);

        obs.hands[sim::SWORD].swing = Swing::Guard;
        obs.hands[sim::SWORD].armed = true;
        assert!(press(&obs, line, Strike::Nearest).strike.is_attack());

        obs.hands[sim::SWORD].swing = Swing::Windup;
        assert!(
            press(&obs, line, Strike::Nearest).strike.is_attack(),
            "let go mid-windup, which cancels the attack"
        );

        obs.hands[sim::SWORD].swing = Swing::Strike;
        assert!(press(&obs, line, Strike::Nearest).strike.is_attack());

        obs.hands[sim::SWORD].swing = Swing::Recover;
        assert!(
            !press(&obs, line, Strike::Nearest).strike.is_attack(),
            "kept asking through the recovery, which leaves the hand disarmed"
        );

        // And the trap in its purest form: at guard but not re-armed.
        obs.hands[sim::SWORD].swing = Swing::Guard;
        obs.hands[sim::SWORD].armed = false;
        assert!(!press(&obs, line, Strike::Nearest).strike.is_attack());
    }

    #[test]
    fn a_feint_shows_the_blade_and_takes_it_back() {
        let mut obs = observer();
        let line = Angle::ZERO;
        obs.hands[sim::SWORD].swing = Swing::Guard;
        obs.hands[sim::SWORD].armed = true;
        assert!(feint(&obs, line, Strike::Nearest, 4).strike.is_attack());

        // Early in the windup it is still selling the lie.
        obs.hands[sim::SWORD].swing = Swing::Windup;
        obs.hands[sim::SWORD].swing_left = 12;
        assert!(feint(&obs, line, Strike::Nearest, 4).strike.is_attack());

        // On the brink of committing, it pulls out.
        obs.hands[sim::SWORD].swing_left = 3;
        assert!(!feint(&obs, line, Strike::Nearest, 4).strike.is_attack());
    }

    #[test]
    fn a_cut_is_aimed_at_the_flank_the_guard_is_not_on() {
        // The enemy is due east and its shield is swung to one side of the line
        // between us. The cut should land on the other.
        //
        // Enemy due east, so the line between us runs along its 180 degree
        // bearing. A guard at 135 degrees is *clockwise* of that line, so the
        // cut has to land counter-clockwise, which is a Sunwise windup.
        let mut c = contact(3, 0);
        c.shield_angle = Angle::from_degrees(135);
        assert_eq!(open_side(&c), Strike::Sunwise);
        c.shield_angle = Angle::from_degrees(-135);
        assert_eq!(open_side(&c), Strike::Widdershins);
    }
}
