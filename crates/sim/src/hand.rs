//! The limb, and the attack that gives it a rhythm.
//!
//! A character has **one**. It is physical -- it accelerates toward a bearing
//! under a torque cap, it carries momentum, and a blade's damage is its *speed*
//! at contact, so where on the arc you meet it matters as much as whether you
//! meet it at all.
//!
//! ## Why one and not two
//!
//! There used to be two: a sword hand running the phase machine below, and a
//! shield hand that took bearings directly. It read as a richer model and it was
//! not one, because nothing charged for the second hand. A shield held at full
//! reach cost no tempo, no attack and no ground, so every policy in the crate
//! held one out permanently -- literally, unconditionally, in all eight stances
//! -- and defending was never an alternative to pressing. It was something you
//! got for free while pressing.
//!
//! One limb makes the guard cost the only thing that was ever scarce: the
//! attack. What a limb *is* on any given tick comes from [`crate::Role`], and
//! the choice between them is a real decision paid for in
//! [`crate::ActionSpec::ready`] ticks.
//!
//! * [`Role::Strike`] runs the four phases below. Live only in
//!   [`Swing::Strike`], and cannot block.
//! * [`Role::Guard`] takes a bearing and an extension directly, exactly as the
//!   shield hand always did, and never leaves [`Swing::Guard`]. Covers an arc;
//!   has no blade.
//! * [`Role::Move`] is neither, and buys footspeed instead.
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

use crate::action::Role;
use crate::command::{LimbCommand, Strike};
use crate::rules::{self, Arm};
use fx::{Angle, Fx};

/// Which phase of an attack the limb is in.
///
/// A limb holding a non-[`Role::Strike`] action is always [`Swing::Guard`]: it
/// has no attack to be in a phase of. Carrying the field anyway is what keeps
/// one `Hand` type at the boundary, and it is a much smaller apology than it
/// used to be now that there is only one limb to carry it.
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
    /// **Changing what is in your hand.**
    ///
    /// Nothing is live: no blade, no guard, no parry. Entered only from
    /// [`Swing::Guard`], so a swap is a decision made while safe rather than a
    /// way out of a cut that has already committed -- see `World::drive_limbs`.
    ///
    /// Deliberately *not* punished by `RECOVERY_EXPOSURE` the way a recovery is.
    /// A limb mid-swap is already helpless, and charging it the exposure
    /// multiplier on top would make changing your mind strictly worse than
    /// standing still with the wrong thing in your hand -- which is the one
    /// outcome that would make the whole loadout pointless.
    Swap,
}

impl Swing {
    pub const ALL: [Swing; 5] = [
        Swing::Guard,
        Swing::Windup,
        Swing::Strike,
        Swing::Recover,
        Swing::Swap,
    ];

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

    /// Whether the limb is out of the fight entirely this tick.
    ///
    /// One phase, and everything that asks the world about a limb checks it:
    /// no blade to hit with, no arc to block with, no steel to parry with. The
    /// price of a loadout, charged in ticks.
    #[inline]
    pub const fn is_dormant(self) -> bool {
        matches!(self, Swing::Swap)
    }

    /// One-hot index for the neural feature encoder. Append-only: the numbers
    /// are part of the feature layout a trained network is frozen against.
    pub const fn discriminant(self) -> usize {
        match self {
            Swing::Guard => 0,
            Swing::Windup => 1,
            Swing::Strike => 2,
            Swing::Recover => 3,
            Swing::Swap => 4,
        }
    }

    /// Number of distinct phases; the width of the one-hot block.
    pub const COUNT: usize = 5;

    pub const fn name(self) -> &'static str {
        match self {
            Swing::Guard => "guard",
            Swing::Windup => "windup",
            Swing::Strike => "strike",
            Swing::Recover => "recover",
            Swing::Swap => "swap",
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
    /// Consecutive ticks this limb has been settled: extended, and turning
    /// slower than [`crate::BRACE_SPIN`].
    ///
    /// Only a [`Role::Guard`] limb reads it, and it is what makes a guard
    /// something you *place* rather than something you have. A guard still
    /// travelling toward the bearing a blow is about to arrive on leaks
    /// [`crate::BLOCK_LEAK_SNAP`] of it; one planted for [`crate::BRACE_TICKS`]
    /// leaks [`crate::BLOCK_LEAK_BRACED`]. The whole value of reading a
    /// telegraph early is here -- see [`crate::block_leak`].
    ///
    /// Accumulated on every limb regardless of role, because the counter is a
    /// fact about motion rather than about intent, and a limb that changes what
    /// it is holding should not also have to rebuild a history.
    pub braced: u16,
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
            // A fresh character is on guard rather than caught mid-movement, so
            // its shield starts planted. Spawning everyone with a snap-block
            // penalty would charge the first exchange of every fight for a
            // motion nobody made.
            braced: rules::BRACE_TICKS,
            armed: true,
        }
    }

    /// How braced this hand is, `0..=1`. What [`crate::block_leak`] interpolates
    /// over, and what the feature vector carries.
    #[inline]
    pub fn brace_fraction(self) -> Fx {
        Fx::from_ratio(
            self.braced.min(rules::BRACE_TICKS) as i32,
            rules::BRACE_TICKS as i32,
        )
    }

    /// How far through the current phase this hand is, `0..=1`, where `1` is
    /// "about to end". [`Swing::Guard`] is always `1`.
    ///
    /// Reported against the phase's *nominal* length rather than against what
    /// is left of it, so it means the same thing to a fast character and a slow
    /// one.
    pub fn phase_progress(self, arm: Arm) -> Fx {
        let full = match self.swing {
            Swing::Guard => return Fx::ONE,
            Swing::Windup => rules::phase_ticks(arm.spec.windup, arm.agility),
            Swing::Strike => rules::strike_ticks(arm),
            Swing::Recover => rules::phase_ticks(arm.spec.recovery, arm.agility),
            // The slot flips when the swap *begins*, so `arm` here is already
            // the action being drawn -- which makes its `ready` exactly the
            // nominal length of the phase being measured.
            Swing::Swap => rules::phase_ticks(arm.spec.ready, arm.agility),
        };
        if full == 0 {
            return Fx::ONE;
        }
        Fx::ONE - Fx::from_ratio(self.swing_left.min(full) as i32, full as i32)
    }

    /// Advances the limb one tick against whatever it is holding.
    ///
    /// The single entry point, and the only place [`Role`] decides anything
    /// about the physics. Everything below `track` is shared: a guard and a
    /// blade are the same arm, with the same torque, inertia and momentum. What
    /// differs is only who chooses the bearing.
    pub(crate) fn drive(&mut self, cmd: LimbCommand, arm: Arm) {
        // A swap outranks the role: whatever is arriving, it is not in hand yet.
        // Checked before the role match rather than inside each arm, so a new
        // role cannot forget to honour it.
        let (bearing, reach) = if self.swing.is_dormant() {
            self.step_swap(cmd)
        } else {
            match arm.spec.role {
                // Step the attack, then chase whatever bearing and extension
                // that phase asks for.
                Role::Strike | Role::Shoot => self.step_attack(cmd, arm),
                // The unchanged half of the model. A guard is held wherever it
                // is pointed, and the skill in it was never a matter of timing:
                // a blow lands somewhere other than where its wielder is
                // standing, so covering the swordsman and covering the cut are
                // different bets.
                //
                // A limb holding one of these has no phases to run, so it stays
                // in `Swing::Guard` and simply tracks.
                Role::Guard | Role::Move => (cmd.angle, cmd.reach),
            }
        };
        self.track(bearing, reach, arm);
    }

    /// Begins bringing `incoming` into the hand.
    ///
    /// Only ever called from [`Swing::Guard`]; the world owns the slot and
    /// enforces that, because the world is what knows whether the request named
    /// a slot this fighter actually has.
    ///
    /// The cost is charged against the **incoming** action, not the outgoing
    /// one: you drop what you are holding for free and pay for what you are
    /// drawing. That is why a club is slow to bring up and instant to abandon,
    /// and it is what makes reaching for a shield a decision with a price rather
    /// than a reflex.
    pub(crate) fn begin_swap(&mut self, incoming: Arm) {
        self.swing = Swing::Swap;
        self.swing_left = rules::phase_ticks(incoming.spec.ready, incoming.agility)
            .clamp(1, rules::SWAP_MAX_TICKS);
    }

    /// Runs the swap clock down and reports what the limb should chase.
    fn step_swap(&mut self, cmd: LimbCommand) -> (Angle, Fx) {
        self.swing_left = self.swing_left.saturating_sub(1);
        if self.swing_left == 0 {
            self.swing = Swing::Guard;
            // **Armed on arrival.** A fresh thing in your hand is ready to use,
            // and the anti-mash rule has already been paid for -- in `ready`
            // ticks, which is a great deal more than the one decision a release
            // costs. Charging both would put a whole decision period on top of
            // every swap and break the counter-attack the tuning is set against.
            self.armed = true;
        }
        // Tucked, all the way in. This is what makes "nothing is live" fall out
        // of the geometry rather than out of a flag: reach drops under
        // `MIN_STRIKE_REACH` so there is no blade, under `MIN_BLOCK_REACH` so
        // `braced` resets and there is no guard, and the limb is furniture for
        // as long as the swap runs. The bearing still tracks the command, so a
        // fighter arrives pointing where it meant to.
        (cmd.angle, Fx::ZERO)
    }

    /// Runs the phase machine one tick and reports what the hand should chase.
    fn step_attack(&mut self, cmd: LimbCommand, arm: Arm) -> (Angle, Fx) {
        // The release. Any command that is not asking to attack re-arms the
        // hand, in any phase -- including mid-cut, so a policy can queue the
        // next attack by releasing while the current one is still travelling.
        if !cmd.strike.is_attack() {
            self.armed = true;
        }

        match self.swing {
            Swing::Guard => {
                if self.armed && cmd.strike.is_attack() {
                    self.begin(cmd.angle, cmd.strike, arm);
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
                // which a Fighter walks 1.8 units -- further than the Brute's
                // entire blade -- so every heavy attack in the game missed by
                // simple ambient movement, and the archetype lost to everything
                // at every skill level.
                //
                // Tracking also turns the telegraph into a second place the
                // intellect stat is spent, which is the best argument for it. An
                // command persists until its owner's next decision, so a Brute
                // re-aims twice inside its own windup and a Rogue thirty times.
                // Dodging a sharp fighter means beating a cut that is following
                // you; dodging a dim one means beating one that is not.
                // The *side* stays fixed: swapping shoulders mid-windup is a
                // different attack, not a correction, and it should cost a
                // fresh telegraph.
                self.line = cmd.angle;
                self.swing_left = self.swing_left.saturating_sub(1);
                if self.swing_left == 0 {
                    self.swing = Swing::Strike;
                    self.swing_left = rules::strike_ticks(arm);
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
                    // **Reaching here at all means the cut touched nothing.** A
                    // blow, a block and a parry all end the strike from
                    // `World::apply_impulses` on the tick they land, so a swing
                    // that survives to run out its own arc is by construction a
                    // swing that met no one -- no flag needed to know it.
                    self.recover(arm, rules::WHIFF_RECOVERY);
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
            // Unreachable: `drive` checks `is_dormant` before it ever gets here,
            // so a swapping limb never enters the attack machine. Spelled out
            // rather than left to a catch-all so that adding a phase fails to
            // compile here instead of silently landing in someone else's arm.
            Swing::Swap => (cmd.angle, Fx::ZERO),
        }
    }

    /// Commits to a cut through `line`.
    fn begin(&mut self, line: Angle, strike: Strike, arm: Arm) {
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
        self.swing_left = rules::phase_ticks(arm.spec.windup, arm.agility).max(1);
        self.armed = false;
    }

    /// Ends the running cut and starts bringing the blade back. `extra` is the
    /// penalty for having been stopped rather than having simply finished.
    pub(crate) fn recover(&mut self, arm: Arm, extra: u16) {
        self.swing = Swing::Recover;
        // The penalty is scaled with the weapon's own recovery rather than added
        // flat afterwards, so agility buys back a share of the punishment for
        // being blocked exactly as it buys back the rest of the recovery.
        self.swing_left = rules::phase_ticks(arm.spec.recovery.saturating_add(extra), arm.agility).max(1);
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
    /// `arm` is the weapon already resolved against the body swinging it, so
    /// this stays a pure function of the hand and what is in it.
    fn track(&mut self, bearing: Angle, want_reach: Fx, arm: Arm) {
        let want_reach = want_reach.clamp(Fx::ZERO, Fx::ONE);

        // An extended blade resists being turned. This is what makes the phases
        // physical rather than scripted: a cut is slower to place *because* it
        // is committed, so the windup's half extension is not a cosmetic pose --
        // it is what lets the blade get cocked inside the telegraph at all.
        //
        // It falls out of the lever arm now rather than out of a constant:
        // extending moves the weapon's mass away from the shoulder, inertia
        // goes as the square of that, and `torque / I` drops accordingly. The
        // old `REACH_DRAG` was a linear approximation of exactly this.
        let torque = arm.accel(self.reach);
        let ceiling = arm.cap;

        // Bang-bang with a braking cap: run at the ceiling while there is room,
        // then decelerate onto the mark. `sqrt(2 * torque * |error|)` is the
        // fastest approach speed from which a stop is still possible, and
        // `sqrt_product` exists because that product saturates `Fx` well before
        // the square root would run.
        let error = bearing.delta(self.angle);
        let magnitude = Fx::from_int(error.abs());
        let brake = fx::sqrt_product(torque * Fx::TWO, magnitude);
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

        let rate = arm.extend_rate;
        let gap = want_reach - self.reach;
        self.reach = (self.reach + gap.clamp(-rate, rate)).clamp(Fx::ZERO, Fx::ONE);

        // Settled, or travelling. Read off the state *after* this tick's motion,
        // so a hand that has just been given a new bearing is unbraced on the
        // same tick the command arrived rather than one tick later -- the whole
        // mechanic is about a blow that lands during the move, and a tick of
        // grace at the front is a tick of free cover.
        self.braced = if self.spin.abs() <= rules::BRACE_SPIN && self.reach >= rules::MIN_BLOCK_REACH
        {
            self.braced.saturating_add(1)
        } else {
            0
        };
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
        h.write_u16(self.braced);
        h.write_u8(self.armed as u8);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::entity::Body;
    use crate::action::ActionKind;

    fn guard(degrees: i32) -> LimbCommand {
        LimbCommand::new(Angle::from_degrees(degrees), Fx::ONE)
    }

    fn cut(degrees: i32) -> LimbCommand {
        LimbCommand::attack(Angle::from_degrees(degrees), Strike::Nearest)
    }

    fn agility_of(kind: Body) -> Fx {
        rules::agility_multiplier(kind.base_stats().agility)
    }

    fn arm_of(kind: Body) -> Arm {
        Arm::resolve(kind.legacy_weapon(), kind.base_stats(), kind.radius())
    }

    /// The same body holding a guard instead of a blade. What the bracing tests
    /// need now that "shield" is an action rather than a second hand.
    fn guard_arm_of(kind: Body) -> Arm {
        Arm::resolve(
            crate::action::ActionKind::Shield.spec(),
            kind.base_stats(),
            kind.radius(),
        )
    }

    /// Runs a blade for `ticks` under one standing command.
    fn wield(kind: Body, cmd: LimbCommand, ticks: u32) -> Hand {
        let mut hand = Hand::resting(Angle::ZERO);
        for _ in 0..ticks {
            hand.drive(cmd, arm_of(kind));
        }
        hand
    }

    /// Runs a guard for `ticks` under one standing command.
    fn brace(kind: Body, cmd: LimbCommand, ticks: u32) -> Hand {
        let mut hand = Hand::resting(Angle::ZERO);
        for _ in 0..ticks {
            hand.drive(cmd, guard_arm_of(kind));
        }
        hand
    }

    #[test]
    fn a_shield_arrives_at_the_bearing_it_was_commanded() {
        let hand = brace(Body::Fighter, guard(90), 120);
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
        let hand = brace(Body::Fighter, guard(90), 120);
        let arm = Body::Fighter.radius() + Body::Fighter.legacy_weapon().length;
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
        let kind = Body::Brute;
        let arm = arm_of(kind);
        let telegraph = rules::phase_ticks(arm.spec.windup, arm.agility);
        assert!(telegraph > 20, "a Brute's telegraph is only {telegraph} ticks");

        let mut hand = Hand::resting(Angle::ZERO);
        for tick in 0..telegraph {
            hand.drive(cut(0), arm);
            assert_eq!(hand.swing, Swing::Windup, "tick {tick}");
            assert!(!hand.swing.is_live(), "the cut went live during its windup");
        }
        hand.drive(cut(0), arm);
        assert_eq!(hand.swing, Swing::Strike);
        assert!(hand.swing.is_live());
    }

    #[test]
    fn a_windup_draws_the_blade_off_the_line_and_the_cut_crosses_it_at_speed() {
        let kind = Body::Fighter;
        let arm = arm_of(kind);
        let mut hand = Hand::resting(Angle::ZERO);

        // Wind up: the blade goes *away* from the line, which is the read.
        for _ in 0..rules::phase_ticks(arm.spec.windup, arm.agility) {
            hand.drive(cut(0), arm);
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
        for _ in 0..rules::strike_ticks(arm) {
            hand.drive(cut(0), arm);
            if hand.angle.delta(Angle::ZERO).signum() != cocked.signum() {
                crossed = true;
            }
            if hand.swing.is_live() && hand.angle.delta(Angle::ZERO).abs() < 4_000 {
                fastest = fastest.max(hand.spin.abs());
            }
        }
        assert!(crossed, "the cut never reached the line");
        let arm = kind.radius() + arm.spec.length;
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
        let kind = Body::Rogue;
        let arm = arm_of(kind);

        let mut hand = Hand::resting(Angle::ZERO);
        let mut lives = 0;
        let mut was_live = false;
        for _ in 0..600 {
            hand.drive(cut(0), arm);
            if hand.swing.is_live() && !was_live {
                lives += 1;
            }
            was_live = hand.swing.is_live();
        }
        assert_eq!(lives, 1, "holding the command down threw {lives} attacks");

        // Release for one tick and it is a swordsman again.
        hand.drive(guard(0), arm);
        assert!(hand.armed);
        for _ in 0..600 {
            hand.drive(cut(0), arm);
            if hand.swing.is_live() && !was_live {
                lives += 1;
            }
            was_live = hand.swing.is_live();
        }
        assert_eq!(lives, 2, "the release did not re-arm the hand");
    }

    #[test]
    fn a_windup_can_be_cancelled_which_is_what_a_feint_is() {
        let kind = Body::Brute;
        let arm = arm_of(kind);
        let mut hand = Hand::resting(Angle::ZERO);

        for _ in 0..4 {
            hand.drive(cut(0), arm);
        }
        assert_eq!(hand.swing, Swing::Windup);

        hand.drive(guard(0), arm);
        assert_eq!(hand.swing, Swing::Guard, "a windup could not be called off");
        assert!(hand.armed, "calling off a windup left the hand unable to attack");
    }

    #[test]
    fn a_committed_cut_cannot_be_called_off() {
        // The other half of the same rule, and the one that makes the punish
        // window exist: past the telegraph, the decision is spent.
        let kind = Body::Brute;
        let arm = arm_of(kind);
        let mut hand = Hand::resting(Angle::ZERO);
        for _ in 0..=rules::phase_ticks(arm.spec.windup, arm.agility) {
            hand.drive(cut(0), arm);
        }
        assert_eq!(hand.swing, Swing::Strike);

        // Ask for the opposite line, and to stop attacking, and neither lands.
        let frozen = hand.line;
        hand.drive(guard(180), arm);
        assert_eq!(hand.swing, Swing::Strike, "a live cut was recalled");
        assert_eq!(hand.line, frozen, "a live cut was re-aimed");
    }

    #[test]
    fn a_spent_cut_recovers_and_is_helpless_while_it_does() {
        let kind = Body::Brute;
        let arm = arm_of(kind);
        let mut hand = Hand::resting(Angle::ZERO);

        // Throw one cut and let it run itself out.
        let mut spent_at = None;
        for tick in 0..400 {
            hand.drive(cut(0), arm);
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
            hand.drive(guard(0), arm);
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
    fn every_weapon_can_finish_the_swing_it_starts() {
        // **The invariant `strike_ticks` exists to hold**, and the bug it was
        // written to fix. A flat 45-tick strike window is fine for a Fighter and
        // nowhere near enough for a Brute: an extended blade turns at
        // `torque * agility * (1 - REACH_DRAG)`, which is 20.6 raw units per
        // tick squared for a Brute against 23,040 units of arc to cover, so
        // every heavy cut in the game was cut off eight degrees short of its own
        // line, mid-acceleration, having never crossed the point it was aimed
        // at. The archetype could only hurt what it met on the *approach* side
        // of its arc -- which is why standing in front of one was safe, and why
        // the whole difficulty range sat above 60%.
        for kind in Body::ALL {
            let arm = arm_of(kind);
            let mut hand = Hand::resting(Angle::ZERO);
            for _ in 0..rules::phase_ticks(arm.spec.windup, arm.agility) {
                hand.drive(cut(0), arm);
            }
            assert_eq!(hand.swing, Swing::Windup, "{}", kind.name());

            // Run the cut out. It must end because it is *spent* -- it reached
            // `STRIKE_SPENT_ARC` past its own line -- and not because the clock
            // on it ran out, which is what the flat constant used to guarantee
            // for the two heavy archetypes.
            let window = rules::strike_ticks(arm);
            let mut ticks = 0;
            let mut furthest = 0;
            while hand.swing != Swing::Recover && ticks < 400 {
                hand.drive(cut(0), arm);
                furthest = furthest.max(hand.angle.delta(Angle::ZERO) * -(hand.side as i32));
                ticks += 1;
            }
            assert_eq!(hand.swing, Swing::Recover, "{} never finished", kind.name());
            assert!(
                ticks < window as i32,
                "a {} cut used all {window} ticks of its window, which means it \
                 was stopped by the clock rather than by finishing",
                kind.name()
            );
            assert!(
                furthest >= rules::STRIKE_SPENT_ARC,
                "a {} cut reached {furthest} raw units past its line, short of \
                 the {} it is supposed to travel",
                kind.name(),
                rules::STRIKE_SPENT_ARC
            );
        }
    }

    #[test]
    fn a_cut_that_touches_nothing_pays_for_it() {
        // The price of a miss and the reward for a dodge, and the two are the
        // same rule read from opposite sides. A swing that runs its whole arc
        // has by construction met no one -- a blow, a block and a parry all end
        // it early from `World::apply_impulses` -- so the recovery it earns is
        // the weapon's own plus `WHIFF_RECOVERY`.
        let kind = Body::Fighter;
        let arm = arm_of(kind);

        let mut hand = Hand::resting(Angle::ZERO);
        while hand.swing != Swing::Recover {
            hand.drive(cut(0), arm);
        }
        let whiffed = hand.swing_left;

        // Against a cut stopped on contact, which is what the world hands back.
        let mut connected = Hand::resting(Angle::ZERO);
        while connected.swing != Swing::Strike {
            connected.drive(cut(0), arm);
        }
        connected.recover(arm, 0);

        assert!(
            whiffed > connected.swing_left,
            "a cut that hit nothing recovered in {whiffed} ticks against {} for \
             one that landed -- missing is supposed to cost more than hitting",
            connected.swing_left
        );
    }

    #[test]
    fn a_guard_has_to_be_planted_before_it_is_worth_anything() {
        // What makes reading a telegraph pay. A shield still travelling toward
        // the bearing a blow arrives on leaks `BLOCK_LEAK_SNAP`; one that has
        // been there for `BRACE_TICKS` leaks `BLOCK_LEAK_BRACED`. Without this
        // the two are the same shield and answering a windup early buys nothing
        // that flicking the guard across at the last instant does not.
        let kind = Body::Fighter;
        let arm = arm_of(kind);

        // Settled on a bearing, extended, for a good while.
        let planted = brace(kind, guard(0), 120);
        assert_eq!(planted.braced.min(rules::BRACE_TICKS), rules::BRACE_TICKS);
        assert_eq!(rules::block_leak(planted.braced), rules::BLOCK_LEAK_BRACED);

        // Now fling it a quarter turn. A hand has mass, so it takes a few ticks
        // to get up to speed -- and once it is moving it is not a guard.
        let mut swinging = planted;
        for _ in 0..6 {
            swinging.drive(guard(90), arm);
        }
        assert_eq!(swinging.braced, 0, "a hand thrown across counted as braced");
        assert_eq!(rules::block_leak(swinging.braced), rules::BLOCK_LEAK_SNAP);
        assert!(rules::BLOCK_LEAK_SNAP > rules::BLOCK_LEAK_BRACED * Fx::TWO);

        // ...and it plants again once it arrives.
        for _ in 0..200 {
            swinging.drive(guard(90), arm);
        }
        assert!(swinging.braced >= rules::BRACE_TICKS);
        assert_eq!(rules::block_leak(swinging.braced), rules::BLOCK_LEAK_BRACED);

        // The whole point, stated as the number a defender actually pays: a
        // guard that arrives with the blow lets through more than five times
        // what a planted one does.
        assert!(
            rules::block_leak(0) > rules::block_leak(rules::BRACE_TICKS) * Fx::from_int(5),
            "bracing barely matters, so reading a telegraph early buys nothing"
        );
    }

    #[test]
    fn a_guard_tracking_a_walking_enemy_stays_braced() {
        // The other half of the bracing rule, and the one that keeps it from
        // being a flat nerf to blocking. A fighter whose enemy is merely moving
        // has to turn its guard a little every tick, and if that counted as
        // "still travelling" then nobody would ever be braced and the mechanic
        // would say nothing about skill. `BRACE_SPIN` is loose enough to cover
        // ordinary tracking and far below the thousand-odd a re-aim runs at.
        let kind = Body::Fighter;
        let arm = arm_of(kind);
        let mut hand = brace(kind, guard(0), 120);

        // Two degrees a tick is a brisk orbit at close quarters.
        let mut bearing = 0;
        for _ in 0..200 {
            bearing += 2;
            hand.drive(guard(bearing), arm);
        }
        assert!(
            hand.braced >= rules::BRACE_TICKS,
            "a guard following a walking enemy lost its brace ({} ticks)",
            hand.braced
        );
    }

    #[test]
    fn a_swing_cannot_be_reversed_instantly() {
        let kind = Body::Fighter;
        let arm = arm_of(kind);

        // Wind it up to speed the long way round.
        let mut hand = Hand::resting(Angle::ZERO);
        for _ in 0..20 {
            hand.drive(guard(180), arm);
        }
        let travelling = hand.spin;
        assert!(travelling.abs() > Fx::from_int(100), "never got moving");

        // Now demand the opposite. Momentum has to be paid off first.
        hand.drive(guard(0), arm);
        assert_eq!(
            hand.spin.signum(),
            travelling.signum(),
            "the swing reversed inside a single tick"
        );
        assert!(hand.spin.abs() < travelling.abs(), "it did not even slow");
    }

    #[test]
    fn a_heavier_weapon_announces_for_longer_and_recovers_for_longer() {
        let phases = |kind: Body| {
            let w = kind.legacy_weapon();
            let a = agility_of(kind);
            (
                rules::phase_ticks(w.windup, a),
                rules::phase_ticks(w.recovery, a),
            )
        };
        let (scout_up, scout_down) = phases(Body::Rogue);
        let (brute_up, brute_down) = phases(Body::Brute);
        assert!(brute_up > scout_up * 3, "{brute_up} vs {scout_up}");
        assert!(brute_down > scout_down * 3, "{brute_down} vs {scout_down}");

        // The number that decides whether a heavy weapon is a puzzle or a coin
        // flip: a Brute's telegraph has to buy its opponent more than one
        // decision, or there is nothing for skill to do with it.
        let watcher = Body::Fighter.base_stats().decision_period();
        assert!(
            brute_up > watcher * 2,
            "a Brute announces for {brute_up} ticks against a Fighter that thinks \
             every {watcher} -- too few chances to answer for the read to matter"
        );
    }

    #[test]
    fn a_heavier_weapon_turns_slower() {
        let rogue = brace(Body::Rogue, guard(180), 12);
        let brute = brace(Body::Brute, guard(180), 12);
        assert!(
            rogue.angle.delta(Angle::ZERO).abs() > brute.angle.delta(Angle::ZERO).abs(),
            "rogue {:?} vs brute {:?}",
            rogue.angle,
            brute.angle
        );
    }

    #[test]
    fn a_sub_unit_spin_still_turns_the_hand() {
        // The reason `residue` exists. A hand whose top speed is below one raw
        // angle unit per tick must still rotate: without the carried fraction,
        // `angle += trunc(spin)` discards the whole motion every tick and the
        // hand is frozen while claiming to be moving.
        // Built directly rather than resolved from a weapon, because what is
        // under test is the integrator and not the roster: a hand that can
        // barely move, however it came to be that way.
        let feeble = Arm {
            spec: crate::action::ActionSpec {
                role: crate::action::Role::Strike,
                length: Fx::ONE,
                mass: Fx::ONE,
                balance: Fx::HALF,
                arc: 8192,
                windup: 10,
                recovery: 10,
                ready: 8,
                move_bonus: Fx::ONE,
            },
            agility: Fx::ONE,
            muscle: Fx::from_ratio(1, 10),
            cap: Fx::from_ratio(6, 10),
            extend_rate: Fx::from_ratio(1, 10),
            pivot: Fx::HALF,
            span: Fx::HALF,
        };
        let mut hand = Hand::resting(Angle::ZERO);
        for _ in 0..200 {
            hand.drive(LimbCommand::new(Angle::from_degrees(90), Fx::ZERO), feeble);
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
        let kind = Body::Fighter;
        let arm = arm_of(kind);
        let mut left = Hand::resting(Angle::ZERO);
        let mut right = Hand::resting(Angle::ZERO);
        for _ in 0..200 {
            left.drive(
                LimbCommand::attack(Angle::from_degrees(120), Strike::Widdershins),
                arm,
            );
            right.drive(
                LimbCommand::attack(Angle::from_degrees(-120), Strike::Sunwise),
                arm,
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
        let kind = Body::Fighter;
        let arm = arm_of(kind);

        // Blade sitting counter-clockwise of the line: cock further that way.
        let mut hand = Hand::resting(Angle::from_degrees(40));
        hand.drive(cut(0), arm);
        assert_eq!(hand.side, 1);

        let mut hand = Hand::resting(Angle::from_degrees(-40));
        hand.drive(cut(0), arm);
        assert_eq!(hand.side, -1);

        // And a named side is honoured whatever the blade is doing.
        let mut hand = Hand::resting(Angle::from_degrees(40));
        hand.drive(
            LimbCommand::attack(Angle::ZERO, Strike::Sunwise),
            arm,
        );
        assert_eq!(hand.side, -1);
    }

    #[test]
    fn a_guarding_blade_is_short_but_not_gone() {
        // `GUARD_REACH` sits above `MIN_STRIKE_REACH` on purpose: a chambered
        // blade is still a segment, so it can catch a cut. It is inert all the
        // same, because damage is gated on the phase and not on extension.
        let hand = wield(Body::Fighter, guard(0), 200);
        assert_eq!(hand.swing, Swing::Guard);
        assert_eq!(hand.reach, rules::GUARD_REACH);
        assert!(rules::GUARD_REACH > rules::MIN_STRIKE_REACH);
        assert!(!hand.swing.is_live());
    }

    #[test]
    fn a_nonsense_command_is_clamped_rather_than_trusted() {
        let hand = brace(Body::Fighter, LimbCommand::new(Angle::ZERO, Fx::from_int(50)), 100);
        assert_eq!(hand.reach, Fx::ONE);
        let hand = brace(Body::Fighter, LimbCommand::new(Angle::ZERO, Fx::from_int(-50)), 100);
        assert_eq!(hand.reach, Fx::ZERO);
    }

    // ---------------------------------------------------------------- the swap

    #[test]
    fn a_swap_takes_the_incoming_actions_ready_ticks() {
        // Charged against what is being drawn, not what is being dropped: a club
        // is slow to bring up and free to abandon.
        for (kind, ticks) in [
            (ActionKind::Punch, 2u16),
            (ActionKind::Shield, 15),
            (ActionKind::Sword, 11),
            (ActionKind::Club, 19),
        ] {
            let mut hand = Hand::resting(Angle::ZERO);
            let incoming = Arm::resolve(
                kind.spec(),
                Body::Fighter.base_stats(),
                Body::Fighter.radius(),
            );
            hand.begin_swap(incoming);
            assert_eq!(
                hand.swing_left,
                ticks,
                "a Fighter draws a {} in {} ticks, not {ticks}",
                kind.name(),
                hand.swing_left
            );
            assert_eq!(hand.swing, Swing::Swap);
        }
    }

    #[test]
    fn nothing_is_live_during_a_swap_and_the_limb_arrives_armed() {
        let incoming = Arm::resolve(
            ActionKind::Shield.spec(),
            Body::Fighter.base_stats(),
            Body::Fighter.radius(),
        );
        let mut hand = Hand::resting(Angle::ZERO);
        // Start it out at full extension so the tuck is something the swap has
        // to actually do rather than something it inherited.
        hand.reach = Fx::ONE;
        hand.braced = rules::BRACE_TICKS;
        hand.begin_swap(incoming);

        let mut ticks = 0;
        while hand.swing.is_dormant() {
            hand.drive(LimbCommand::new(Angle::ZERO, Fx::ONE), incoming);
            ticks += 1;
            assert!(ticks < 200, "the swap never finished");
            if hand.swing.is_dormant() {
                assert!(
                    !hand.swing.is_live(),
                    "a swapping limb dealt damage on tick {ticks}"
                );
            }
        }
        // Tucked all the way in, so `blade_from` and `block_leak` both refuse it
        // on geometry rather than on a flag.
        assert!(
            hand.reach < rules::MIN_BLOCK_REACH,
            "a limb finished a swap still holding something out at {}",
            hand.reach
        );
        assert_eq!(hand.braced, 0, "a swap kept its brace across the change");
        assert_eq!(hand.swing, Swing::Guard);
        // Armed on arrival: the anti-mash rule was already paid for in `ready`.
        assert!(hand.armed, "a fresh action arrived unusable");
    }

    #[test]
    fn a_guard_role_limb_never_leaves_guard() {
        // A shield has no attack to be in a phase of, so no command should be
        // able to talk it into one -- including one that is asking to strike.
        let guard_arm = guard_arm_of(Body::Fighter);
        let mut hand = Hand::resting(Angle::ZERO);
        for _ in 0..300 {
            hand.drive(
                LimbCommand::attack(Angle::from_degrees(90), Strike::Widdershins),
                guard_arm,
            );
            assert_eq!(
                hand.swing,
                Swing::Guard,
                "a guard was talked into a {}",
                hand.swing.name()
            );
        }
    }
}
