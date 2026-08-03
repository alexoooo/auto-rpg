//! Hands, and the attack that gives them a rhythm.
//!
//! A character has two: a sword hand and a shield hand. Both are physical --
//! they accelerate toward a bearing under a torque cap, they carry momentum,
//! and a blade's damage is its *speed* at contact, so where on the arc you meet
//! it matters as much as whether you meet it at all.
//!
//! What separates them is that the shield takes orders directly and the sword
//! does not.
//!
//! ## Why the sword is a state machine
//!
//! The first version of this model let an agent command the blade's bearing
//! every tick. That is a strictly more expressive interface and it produced
//! exactly one strategy: hold the blade at full extension and rotate it as fast
//! as the torque cap allows. Nothing in the sim charged for it, every tick of
//! rotation was a live hitbox, and so the optimal play -- for a policy, for
//! evolution, and for a person with a mouse -- was a windmill. There was no
//! moment at which an attack *began*, which meant there was no moment at which
//! one could be read, dodged, or punished.
//!
//! So the sword hand no longer takes a bearing. It takes a **line** and a
//! **release**, and runs four phases against them:
//!
//! ```text
//!  Guard  -- blade chambered on the commanded line, inert
//!    | strike command, and the hand is armed
//!  Windup -- cocked WINDUP_ARC off the line. Visible. Cancellable.
//!    | the telegraph runs out
//!  Strike -- driving to FOLLOW_THROUGH past the line, at speed.
//!    |        LIVE. The line is frozen; the command cannot recall it.
//!    | spent on its own arc, or STRIKE_TIMEOUT
//! Recover -- bringing the blade back. Inert, and cannot attack.
//!    | the weapon's recovery, plus a penalty if it was stopped
//!  Guard
//! ```
//!
//! Three properties fall out, and they are the whole point:
//!
//! * **An attack announces itself.** The windup is real time on the clock,
//!   scaled by the weapon and by agility, and it is in the defender's
//!   observation. A Brute spends 33 ticks telling you what it is about to do.
//! * **An attack commits.** Once the cut is live the line is frozen. Momentum
//!   was always unreversible; now the *decision* is too.
//! * **A miss costs.** Recovery is a window in which the hand cannot answer
//!   anything, and it is longer when a shield or a blade stopped the cut.
//!
//! ## The two traps, both pinned by tests below
//!
//! [`Hand::track`] brakes as it approaches its bearing and arrives at rest, so a
//! blade aimed *at* a target reaches it with no speed and does no damage. That
//! is why the strike phase aims past the line rather than at it -- the sim now
//! does what every policy used to have to remember to do.
//!
//! And an attack begins only on a strike command that follows a non-strike
//! command ([`Hand::armed`]). A policy that asks to attack forever throws
//! exactly one attack and then stands there. That is deliberate: without it,
//! holding the button down chains attacks back to back, which is the windmill
//! again with extra steps.

use crate::action::{HandCommand, Strike};
use crate::rules::{self, Weapon, REACH_DRAG};
use fx::{Angle, Fx};

/// Hands per character.
pub const HANDS: usize = 2;
/// Index of the sword hand. The only hand that deals blows.
pub const SWORD: usize = 0;
/// Index of the shield hand. The only hand that blocks.
pub const SHIELD: usize = 1;

/// Which phase of an attack a sword hand is in.
///
/// A shield hand is always [`Swing::Guard`]; it has no attack to be in a phase
/// of, and carrying the field anyway keeps one `Hand` type at the boundary.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Default)]
pub enum Swing {
    /// Blade chambered on the commanded line. Inert, cheap, unpunishable.
    #[default]
    Guard,
    /// Cocked back off the line. **The telegraph.** Inert, and cancellable at
    /// no cost, which is what makes a feint a real move rather than a bluff the
    /// rules do not model.
    Windup,
    /// Driving through the line. **Live**, and committed: the line was frozen
    /// when this began.
    Strike,
    /// Bringing a spent blade back. Inert, and cannot start another attack.
    /// **The punish window.**
    Recover,
}

impl Swing {
    pub const ALL: [Swing; 4] = [Swing::Guard, Swing::Windup, Swing::Strike, Swing::Recover];

    /// Whether a blade in this phase can deal damage. Exactly one phase can,
    /// and that single fact is what killed the windmill: a blade rotating
    /// outside its strike window is furniture.
    #[inline]
    pub const fn is_live(self) -> bool {
        matches!(self, Swing::Strike)
    }

    /// Whether the hand is mid-attack at all -- committed or about to be.
    #[inline]
    pub const fn is_attacking(self) -> bool {
        matches!(self, Swing::Windup | Swing::Strike)
    }

    /// One-hot index for the neural feature encoder. Append-only: the numbers
    /// are part of the feature layout a trained network is frozen against.
    pub const fn discriminant(self) -> usize {
        match self {
            Swing::Guard => 0,
            Swing::Windup => 1,
            Swing::Strike => 2,
            Swing::Recover => 3,
        }
    }

    /// Number of distinct phases; the width of the one-hot block.
    pub const COUNT: usize = 4;

    pub const fn name(self) -> &'static str {
        match self {
            Swing::Guard => "guard",
            Swing::Windup => "windup",
            Swing::Strike => "strike",
            Swing::Recover => "recover",
        }
    }
}

/// One hand's live physical state.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
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
    /// worlds differing only in `residue` diverge one tick later, so it is
    /// hashed like everything else.
    pub residue: Fx,
    /// Extension, `0..=1`, from tucked against the body to fully committed.
    ///
    /// Driven by [`Hand::swing`] on the sword hand and commanded directly on
    /// the shield.
    pub reach: Fx,
    /// Which phase of an attack this hand is in.
    pub swing: Swing,
    /// Ticks left in [`Hand::swing`]. Counts down; meaningless in
    /// [`Swing::Guard`].
    ///
    /// In a windup this is how long the defender has left to answer, and in a
    /// recovery it is how long the attacker is helpless. Both numbers reach the
    /// opponent's observation, blurred by perception -- reading them is most of
    /// what separates a good fighter from a fast one.
    pub swing_left: u16,
    /// The line the running attack was thrown along, frozen when it began.
    ///
    /// Frozen and not tracked: a cut that could be re-aimed after it committed
    /// would make overcommitting free, and the punish window is the load-bearing
    /// half of the whole model.
    pub line: Angle,
    /// Which way the running attack wound up: `+1` counter-clockwise, `-1`
    /// clockwise. The cut travels the other way.
    pub side: i8,
    /// Whether a strike command would be honoured.
    ///
    /// Cleared when an attack begins and set by any command that is not asking
    /// to attack. **A policy that asks to attack forever throws one attack**,
    /// and this bit is why; see the module docs. Cheap to satisfy -- one
    /// decision spent on [`Strike::None`] re-arms -- and expensive to ignore,
    /// which is the correct shape for the difference between a swordsman and
    /// someone holding a button down.
    pub armed: bool,
}

impl Default for Hand {
    fn default() -> Hand {
        Hand::resting(Angle::ZERO)
    }
}

impl Hand {
    /// A hand at rest, pointing along `bearing`, ready to attack.
    pub const fn resting(bearing: Angle) -> Hand {
        Hand {
            angle: bearing,
            spin: Fx::ZERO,
            residue: Fx::ZERO,
            reach: Fx::ZERO,
            swing: Swing::Guard,
            swing_left: 0,
            line: bearing,
            side: 1,
            armed: true,
        }
    }

    /// How far through the current phase this hand is, `0..=1`, where `1` is
    /// "about to end". [`Swing::Guard`] is always `1`.
    ///
    /// Reported against the phase's *nominal* length rather than against what
    /// is left of it, so it means the same thing to a fast character and a slow
    /// one.
    pub fn phase_progress(self, weapon: Weapon, agility: Fx) -> Fx {
        let full = match self.swing {
            Swing::Guard => return Fx::ONE,
            Swing::Windup => rules::phase_ticks(weapon.windup, agility),
            Swing::Strike => rules::STRIKE_TIMEOUT,
            Swing::Recover => rules::phase_ticks(weapon.recovery, agility),
        };
        if full == 0 {
            return Fx::ONE;
        }
        Fx::ONE - Fx::from_ratio(self.swing_left.min(full) as i32, full as i32)
    }

    /// Advances a **shield** hand one tick toward `cmd`.
    ///
    /// The unchanged half of the model. A shield is a braced guard held
    /// wherever it is pointed, and the skill in it was never a matter of timing:
    /// a blow lands somewhere other than where its wielder is standing, so
    /// covering the swordsman and covering the cut are different bets.
    pub(crate) fn brace(&mut self, cmd: HandCommand, weapon: Weapon, agility: Fx) {
        self.track(cmd.angle, cmd.reach, weapon, agility);
    }

    /// Advances a **sword** hand one tick: step the attack, then chase whatever
    /// bearing and extension that phase asks for.
    pub(crate) fn wield(&mut self, cmd: HandCommand, weapon: Weapon, agility: Fx) {
        let (bearing, reach) = self.step_attack(cmd, weapon, agility);
        self.track(bearing, reach, weapon, agility);
    }

    /// Runs the phase machine one tick and reports what the hand should chase.
    fn step_attack(&mut self, cmd: HandCommand, weapon: Weapon, agility: Fx) -> (Angle, Fx) {
        // The release. Any command that is not asking to attack re-arms the
        // hand, in any phase -- including mid-cut, so a policy can queue the
        // next attack by releasing while the current one is still travelling.
        if !cmd.strike.is_attack() {
            self.armed = true;
        }

        match self.swing {
            Swing::Guard => {
                if self.armed && cmd.strike.is_attack() {
                    self.begin(cmd.angle, cmd.strike, weapon, agility);
                    self.windup_target()
                } else {
                    (cmd.angle, rules::GUARD_REACH)
                }
            }
            Swing::Windup => {
                // Cancelling is free, and that is the feint. Nothing has
                // committed yet, so there is nothing to punish -- what a
                // cancelled windup costs is the tempo already spent on it, and
                // what it buys is a defender who moved a guard for nothing.
                if !cmd.strike.is_attack() {
                    self.swing = Swing::Guard;
                    self.swing_left = 0;
                    return (cmd.angle, rules::GUARD_REACH);
                }
                // **The line still tracks.** A windup declares that a cut is
                // coming and which shoulder it is coming over; it does not yet
                // declare where. Freezing the line here instead makes a long
                // telegraph worthless: a Brute announces for 33 ticks, over
                // which a Warrior walks 1.8 units -- further than the Brute's
                // entire blade -- so every heavy attack in the game missed by
                // simple ambient movement, and the archetype lost to everything
                // at every skill level.
                //
                // Tracking also turns the telegraph into a second place the
                // intellect stat is spent, which is the best argument for it. An
                // action persists until its owner's next decision, so a Brute
                // re-aims twice inside its own windup and a Scout thirty times.
                // Dodging a sharp fighter means beating a cut that is following
                // you; dodging a dim one means beating one that is not.
                // The *side* stays fixed: swapping shoulders mid-windup is a
                // different attack, not a correction, and it should cost a
                // fresh telegraph.
                self.line = cmd.angle;
                self.swing_left = self.swing_left.saturating_sub(1);
                if self.swing_left == 0 {
                    self.swing = Swing::Strike;
                    self.swing_left = rules::STRIKE_TIMEOUT;
                    self.strike_target()
                } else {
                    self.windup_target()
                }
            }
            Swing::Strike => {
                // The one place in the agent boundary where the sim declines to
                // listen. `cmd` is read for nothing here: the line was frozen
                // when the cut began, and a cut that could be re-aimed after
                // committing would make overcommitting free.
                self.swing_left = self.swing_left.saturating_sub(1);
                if self.swing_left == 0 || self.is_spent() {
                    self.recover(weapon, agility, 0);
                    (cmd.angle, rules::GUARD_REACH)
                } else {
                    self.strike_target()
                }
            }
            Swing::Recover => {
                self.swing_left = self.swing_left.saturating_sub(1);
                if self.swing_left == 0 {
                    self.swing = Swing::Guard;
                }
                // Recovering toward the *live* command rather than the frozen
                // line: a fighter bringing its blade back is bringing it back to
                // where it wants it now, not to where the last cut went.
                (cmd.angle, rules::GUARD_REACH)
            }
        }
    }

    /// Commits to a cut through `line`.
    fn begin(&mut self, line: Angle, strike: Strike, weapon: Weapon, agility: Fx) {
        self.line = line;
        self.side = match strike.side() {
            0 => {
                // `Strike::Nearest`: cock to whichever side the blade is already
                // on, which is the shortest telegraph available.
                //
                // The spin tie-break is not decoration. Both terms are
                // mirror-antisymmetric, so a mirrored pair of fighters picks
                // mirrored sides and stays mirrored. The one state this cannot
                // resolve is a blade dead still exactly on its line, where the
                // situation is genuinely symmetric and no function of it could
                // answer differently for the two -- a scenario that needs exact
                // mirror symmetry should name a side rather than ask for the
                // nearest one.
                let delta = self.angle.delta(line);
                if delta > 0 || (delta == 0 && self.spin.is_positive()) {
                    1
                } else {
                    -1
                }
            }
            s => s as i8,
        };
        self.swing = Swing::Windup;
        self.swing_left = rules::phase_ticks(weapon.windup, agility).max(1);
        self.armed = false;
    }

    /// Ends the running cut and starts bringing the blade back. `extra` is the
    /// penalty for having been stopped rather than having simply finished.
    pub(crate) fn recover(&mut self, weapon: Weapon, agility: Fx, extra: u16) {
        self.swing = Swing::Recover;
        // The penalty is scaled with the weapon's own recovery rather than added
        // flat afterwards, so agility buys back a share of the punishment for
        // being blocked exactly as it buys back the rest of the recovery.
        self.swing_left = rules::phase_ticks(weapon.recovery.saturating_add(extra), agility).max(1);
    }

    /// Whether the running cut has travelled far enough past its line to be
    /// spent.
    fn is_spent(&self) -> bool {
        // The cut travels *opposite* to the side it wound up from, so "past the
        // line" is a negative delta for a counter-clockwise windup.
        self.angle.delta(self.line) * -(self.side as i32) >= rules::STRIKE_SPENT_ARC
    }

    fn windup_target(&self) -> (Angle, Fx) {
        (
            self.line + Angle::from_raw((self.side as i32 * rules::WINDUP_ARC) as u16),
            rules::WINDUP_REACH,
        )
    }

    fn strike_target(&self) -> (Angle, Fx) {
        (
            self.line - Angle::from_raw((self.side as i32 * rules::FOLLOW_THROUGH) as u16),
            Fx::ONE,
        )
    }

    /// The physics: accelerate toward `bearing` under a torque cap, braking so
    /// as to arrive at rest, and rate-limit the extension toward `want_reach`.
    ///
    /// `agility` is the wielder's [`crate::rules::agility_multiplier`], already
    /// resolved, so this stays a pure function of the hand and its weapon.
    fn track(&mut self, bearing: Angle, want_reach: Fx, weapon: Weapon, agility: Fx) {
        let want_reach = want_reach.clamp(Fx::ZERO, Fx::ONE);

        // An extended blade resists being turned. This is what makes the phases
        // physical rather than scripted: a cut is slower to place *because* it
        // is committed, so the windup's half extension is not a cosmetic pose --
        // it is what lets the blade get cocked inside the telegraph at all.
        let drag = Fx::ONE - REACH_DRAG * self.reach;
        let torque = weapon.torque * agility * drag;
        let ceiling = weapon.max_spin * agility;

        // Bang-bang with a braking cap: run at the ceiling while there is room,
        // then decelerate onto the mark. `sqrt(2 * torque * |error|)` is the
        // fastest approach speed from which a stop is still possible, and
        // `sqrt_product` exists because that product saturates `Fx` well before
        // the square root would run.
        let error = bearing.delta(self.angle);
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
        let advance = self.residue + self.spin;
        let whole = advance.trunc_int();
        self.angle = self.angle + Angle::from_raw(whole as u16);
        self.residue = advance - Fx::from_int(whole);

        let rate = weapon.extend_rate * agility;
        let gap = want_reach - self.reach;
        self.reach = (self.reach + gap.clamp(-rate, rate)).clamp(Fx::ZERO, Fx::ONE);
    }

    pub(crate) fn hash_into(self, h: &mut fx::Hash64) {
        h.write_u16(self.angle.raw());
        h.write_i32(self.spin.raw());
        h.write_i32(self.residue.raw());
        h.write_i32(self.reach.raw());
        // The phase machine is state the sim acts on, so all of it is hashed --
        // two worlds identical but for one being mid-windup diverge the moment
        // the telegraph runs out.
        h.write_u8(self.swing.discriminant() as u8);
        h.write_u16(self.swing_left);
        h.write_u16(self.line.raw());
        h.write_u8(self.side as u8);
        h.write_u8(self.armed as u8);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::entity::UnitKind;

    fn guard(degrees: i32) -> HandCommand {
        HandCommand::new(Angle::from_degrees(degrees), Fx::ONE)
    }

    fn cut(degrees: i32) -> HandCommand {
        HandCommand::attack(Angle::from_degrees(degrees), Strike::Nearest)
    }

    fn agility_of(kind: UnitKind) -> Fx {
        rules::agility_multiplier(kind.base_stats().agility)
    }

    /// Runs a sword hand for `ticks` under one standing command.
    fn wield(kind: UnitKind, cmd: HandCommand, ticks: u32) -> Hand {
        let mut hand = Hand::resting(Angle::ZERO);
        for _ in 0..ticks {
            hand.wield(cmd, kind.weapon(), agility_of(kind));
        }
        hand
    }

    /// Runs a shield hand for `ticks` under one standing command.
    fn brace(kind: UnitKind, cmd: HandCommand, ticks: u32) -> Hand {
        let mut hand = Hand::resting(Angle::ZERO);
        for _ in 0..ticks {
            hand.brace(cmd, kind.weapon(), agility_of(kind));
        }
        hand
    }

    #[test]
    fn a_shield_arrives_at_the_bearing_it_was_commanded() {
        let hand = brace(UnitKind::Warrior, guard(90), 120);
        assert!(
            hand.angle.delta(Angle::from_degrees(90)).abs() < 200,
            "settled at {:?}",
            hand.angle
        );
        assert_eq!(hand.reach, Fx::ONE);
    }

    #[test]
    fn a_hand_arrives_at_rest_which_is_why_the_cut_aims_past_the_line() {
        // The original trap, still here and now answered by the sim rather than
        // by every policy remembering to overshoot. A hand commanded *at*
        // something reaches it with no useful speed left, and a blade with no
        // speed does no damage -- so `strike_target` aims a full
        // FOLLOW_THROUGH beyond the line.
        let hand = brace(UnitKind::Warrior, guard(90), 120);
        let arm = UnitKind::Warrior.radius() + UnitKind::Warrior.weapon().length;
        let speed = fx::tangential_speed(hand.spin, arm);
        assert!(
            speed < rules::IMPACT_THRESHOLD,
            "arrived at {speed} per tick (spin {}), which would still hurt",
            hand.spin
        );
    }

    #[test]
    fn an_attack_announces_itself_before_it_goes_live() {
        // The property the whole redesign exists for: there is a stretch of
        // real time between "he has decided to hit me" and "the blade is
        // dangerous", and it is long enough to answer.
        let kind = UnitKind::Brute;
        let weapon = kind.weapon();
        let agility = agility_of(kind);
        let telegraph = rules::phase_ticks(weapon.windup, agility);
        assert!(telegraph > 20, "a Brute's telegraph is only {telegraph} ticks");

        let mut hand = Hand::resting(Angle::ZERO);
        for tick in 0..telegraph {
            hand.wield(cut(0), weapon, agility);
            assert_eq!(hand.swing, Swing::Windup, "tick {tick}");
            assert!(!hand.swing.is_live(), "the cut went live during its windup");
        }
        hand.wield(cut(0), weapon, agility);
        assert_eq!(hand.swing, Swing::Strike);
        assert!(hand.swing.is_live());
    }

    #[test]
    fn a_windup_draws_the_blade_off_the_line_and_the_cut_crosses_it_at_speed() {
        let kind = UnitKind::Warrior;
        let weapon = kind.weapon();
        let agility = agility_of(kind);
        let mut hand = Hand::resting(Angle::ZERO);

        // Wind up: the blade goes *away* from the line, which is the read.
        for _ in 0..rules::phase_ticks(weapon.windup, agility) {
            hand.wield(cut(0), weapon, agility);
        }
        let cocked = hand.angle.delta(Angle::ZERO);
        assert!(
            cocked.abs() > rules::WINDUP_ARC / 2,
            "barely cocked: {cocked} raw units off the line"
        );
        assert_eq!(hand.side, cocked.signum() as i8);

        // Now the cut. Catch the tick the blade is nearest the line and check
        // it is moving hard as it goes through.
        let mut fastest = Fx::ZERO;
        let mut crossed = false;
        for _ in 0..rules::STRIKE_TIMEOUT {
            hand.wield(cut(0), weapon, agility);
            if hand.angle.delta(Angle::ZERO).signum() != cocked.signum() {
                crossed = true;
            }
            if hand.swing.is_live() && hand.angle.delta(Angle::ZERO).abs() < 4_000 {
                fastest = fastest.max(hand.spin.abs());
            }
        }
        assert!(crossed, "the cut never reached the line");
        let arm = kind.radius() + weapon.length;
        assert!(
            fx::tangential_speed(fastest, arm) > rules::IMPACT_THRESHOLD * Fx::TWO,
            "crossed the line at {fastest} raw units per tick, which barely registers"
        );
    }

    #[test]
    fn holding_the_command_down_throws_one_attack_and_not_a_windmill() {
        // The anti-mash rule, pinned. This is a trap for policy authors and it
        // is meant to be met as a failing test rather than as a fight that will
        // not end: an agent that never releases attacks exactly once.
        let kind = UnitKind::Scout;
        let weapon = kind.weapon();
        let agility = agility_of(kind);

        let mut hand = Hand::resting(Angle::ZERO);
        let mut lives = 0;
        let mut was_live = false;
        for _ in 0..600 {
            hand.wield(cut(0), weapon, agility);
            if hand.swing.is_live() && !was_live {
                lives += 1;
            }
            was_live = hand.swing.is_live();
        }
        assert_eq!(lives, 1, "holding the command down threw {lives} attacks");

        // Release for one tick and it is a swordsman again.
        hand.wield(guard(0), weapon, agility);
        assert!(hand.armed);
        for _ in 0..600 {
            hand.wield(cut(0), weapon, agility);
            if hand.swing.is_live() && !was_live {
                lives += 1;
            }
            was_live = hand.swing.is_live();
        }
        assert_eq!(lives, 2, "the release did not re-arm the hand");
    }

    #[test]
    fn a_windup_can_be_cancelled_which_is_what_a_feint_is() {
        let kind = UnitKind::Brute;
        let weapon = kind.weapon();
        let agility = agility_of(kind);
        let mut hand = Hand::resting(Angle::ZERO);

        for _ in 0..4 {
            hand.wield(cut(0), weapon, agility);
        }
        assert_eq!(hand.swing, Swing::Windup);

        hand.wield(guard(0), weapon, agility);
        assert_eq!(hand.swing, Swing::Guard, "a windup could not be called off");
        assert!(hand.armed, "calling off a windup left the hand unable to attack");
    }

    #[test]
    fn a_committed_cut_cannot_be_called_off() {
        // The other half of the same rule, and the one that makes the punish
        // window exist: past the telegraph, the decision is spent.
        let kind = UnitKind::Brute;
        let weapon = kind.weapon();
        let agility = agility_of(kind);
        let mut hand = Hand::resting(Angle::ZERO);
        for _ in 0..=rules::phase_ticks(weapon.windup, agility) {
            hand.wield(cut(0), weapon, agility);
        }
        assert_eq!(hand.swing, Swing::Strike);

        // Ask for the opposite line, and to stop attacking, and neither lands.
        let frozen = hand.line;
        hand.wield(guard(180), weapon, agility);
        assert_eq!(hand.swing, Swing::Strike, "a live cut was recalled");
        assert_eq!(hand.line, frozen, "a live cut was re-aimed");
    }

    #[test]
    fn a_spent_cut_recovers_and_is_helpless_while_it_does() {
        let kind = UnitKind::Brute;
        let weapon = kind.weapon();
        let agility = agility_of(kind);
        let mut hand = Hand::resting(Angle::ZERO);

        // Throw one cut and let it run itself out.
        let mut spent_at = None;
        for tick in 0..400 {
            hand.wield(cut(0), weapon, agility);
            if hand.swing == Swing::Recover {
                spent_at = Some(tick);
                break;
            }
        }
        assert!(spent_at.is_some(), "the cut never finished");

        // Now release, so the hand is armed and the only thing standing between
        // it and another attack is the recovery itself.
        let mut recovering = 0;
        let mut reached_guard = false;
        for _ in 0..400 {
            hand.wield(guard(0), weapon, agility);
            match hand.swing {
                Swing::Recover => {
                    recovering += 1;
                    assert!(!hand.swing.is_live(), "a recovering blade was live");
                }
                Swing::Guard => {
                    reached_guard = true;
                    break;
                }
                other => panic!("recovered into {other:?}"),
            }
        }
        assert!(reached_guard, "never came back to guard");
        assert!(
            recovering >= 30,
            "a Brute recovered from a spent cut in {recovering} ticks, \
             which is no punish window at all"
        );
    }

    #[test]
    fn a_swing_cannot_be_reversed_instantly() {
        let kind = UnitKind::Warrior;
        let weapon = kind.weapon();
        let agility = agility_of(kind);

        // Wind it up to speed the long way round.
        let mut hand = Hand::resting(Angle::ZERO);
        for _ in 0..20 {
            hand.brace(guard(180), weapon, agility);
        }
        let travelling = hand.spin;
        assert!(travelling.abs() > Fx::from_int(100), "never got moving");

        // Now demand the opposite. Momentum has to be paid off first.
        hand.brace(guard(0), weapon, agility);
        assert_eq!(
            hand.spin.signum(),
            travelling.signum(),
            "the swing reversed inside a single tick"
        );
        assert!(hand.spin.abs() < travelling.abs(), "it did not even slow");
    }

    #[test]
    fn a_heavier_weapon_announces_for_longer_and_recovers_for_longer() {
        let phases = |kind: UnitKind| {
            let w = kind.weapon();
            let a = agility_of(kind);
            (
                rules::phase_ticks(w.windup, a),
                rules::phase_ticks(w.recovery, a),
            )
        };
        let (scout_up, scout_down) = phases(UnitKind::Scout);
        let (brute_up, brute_down) = phases(UnitKind::Brute);
        assert!(brute_up > scout_up * 3, "{brute_up} vs {scout_up}");
        assert!(brute_down > scout_down * 3, "{brute_down} vs {scout_down}");

        // The number that decides whether a heavy weapon is a puzzle or a coin
        // flip: a Brute's telegraph has to buy its opponent more than one
        // decision, or there is nothing for skill to do with it.
        let watcher = UnitKind::Warrior.base_stats().decision_period();
        assert!(
            brute_up > watcher * 2,
            "a Brute announces for {brute_up} ticks against a Warrior that thinks \
             every {watcher} -- too few chances to answer for the read to matter"
        );
    }

    #[test]
    fn a_heavier_weapon_turns_slower() {
        let scout = brace(UnitKind::Scout, guard(180), 12);
        let brute = brace(UnitKind::Brute, guard(180), 12);
        assert!(
            scout.angle.delta(Angle::ZERO).abs() > brute.angle.delta(Angle::ZERO).abs(),
            "scout {:?} vs brute {:?}",
            scout.angle,
            brute.angle
        );
    }

    #[test]
    fn a_sub_unit_spin_still_turns_the_hand() {
        // The reason `residue` exists. A hand whose top speed is below one raw
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
            windup: 10,
            recovery: 10,
        };
        let mut hand = Hand::resting(Angle::ZERO);
        for _ in 0..200 {
            hand.brace(HandCommand::new(Angle::from_degrees(90), Fx::ZERO), feeble, Fx::ONE);
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
        // `trunc_int` buys over `floor_int`, and it has to survive the phase
        // machine: mirrored sides, mirrored windups, mirrored cuts.
        let kind = UnitKind::Warrior;
        let weapon = kind.weapon();
        let agility = agility_of(kind);
        let mut left = Hand::resting(Angle::ZERO);
        let mut right = Hand::resting(Angle::ZERO);
        for _ in 0..200 {
            left.wield(
                HandCommand::attack(Angle::from_degrees(120), Strike::Widdershins),
                weapon,
                agility,
            );
            right.wield(
                HandCommand::attack(Angle::from_degrees(-120), Strike::Sunwise),
                weapon,
                agility,
            );
            assert_eq!(left.angle.delta(Angle::ZERO), -right.angle.delta(Angle::ZERO));
            assert_eq!(left.spin, -right.spin);
            assert_eq!(left.residue, -right.residue);
            assert_eq!(left.swing, right.swing);
            assert_eq!(left.side, -right.side);
        }
    }

    #[test]
    fn the_nearest_side_is_the_short_way_round() {
        let kind = UnitKind::Warrior;
        let weapon = kind.weapon();
        let agility = agility_of(kind);

        // Blade sitting counter-clockwise of the line: cock further that way.
        let mut hand = Hand::resting(Angle::from_degrees(40));
        hand.wield(cut(0), weapon, agility);
        assert_eq!(hand.side, 1);

        let mut hand = Hand::resting(Angle::from_degrees(-40));
        hand.wield(cut(0), weapon, agility);
        assert_eq!(hand.side, -1);

        // And a named side is honoured whatever the blade is doing.
        let mut hand = Hand::resting(Angle::from_degrees(40));
        hand.wield(
            HandCommand::attack(Angle::ZERO, Strike::Sunwise),
            weapon,
            agility,
        );
        assert_eq!(hand.side, -1);
    }

    #[test]
    fn a_guarding_blade_is_short_but_not_gone() {
        // `GUARD_REACH` sits above `MIN_STRIKE_REACH` on purpose: a chambered
        // blade is still a segment, so it can catch a cut. It is inert all the
        // same, because damage is gated on the phase and not on extension.
        let hand = wield(UnitKind::Warrior, guard(0), 200);
        assert_eq!(hand.swing, Swing::Guard);
        assert_eq!(hand.reach, rules::GUARD_REACH);
        assert!(rules::GUARD_REACH > rules::MIN_STRIKE_REACH);
        assert!(!hand.swing.is_live());
    }

    #[test]
    fn a_nonsense_command_is_clamped_rather_than_trusted() {
        let hand = brace(UnitKind::Warrior, HandCommand::new(Angle::ZERO, Fx::from_int(50)), 100);
        assert_eq!(hand.reach, Fx::ONE);
        let hand = brace(UnitKind::Warrior, HandCommand::new(Angle::ZERO, Fx::from_int(-50)), 100);
        assert_eq!(hand.reach, Fx::ZERO);
    }
}
