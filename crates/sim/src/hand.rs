//! The limb: a spawn-time pose, a hash word and a published row.
//!
//! **The phase machine that this file was is gone, and what is left is the
//! shape of what it left behind.** `drive`, `begin_swap`, `step_swap`,
//! `step_attack`, `begin`, `recover`, `is_spent`, `windup_target`,
//! `strike_target` and `track` ran a blade through Guard/Windup/Strike/Recover
//! under a torque cap; they had **no production caller** by the time they were
//! deleted, and that is not an oversight anybody made. An arm is driven by
//! `combat/actuator.rs` under both surviving models -- a bearing, a height, a
//! reach and an effort, integrated against a real arm length and swept by the
//! contact solver as a capsule -- and `World::limb` is a spawn-time constant
//! for exactly that reason. `world/hash.rs` says why the constant is still
//! hashed, and it is published on `UnitView` as `view.limb.swing`.
//!
//! What survives here is [`Hand::resting`], [`Hand::default`] and
//! [`Hand::hash_into`], which the spawn and the hash need.
//!
//! **[`Hand::brace_fraction`] and [`Hand::phase_progress`] survive on weaker
//! grounds and it is worth being exact about which.** Neither has a caller
//! anywhere in the workspace. They do not warn because `lib.rs` re-exports
//! `Hand`, and a `pub` method on a re-exported type is reachable as far as the
//! compiler is concerned -- so the zero-warning bar this session was measured
//! against cannot see them, and cannot see the swing tuning constants in
//! `rules.rs` that are re-exported the same way (`STRIKE_SLACK`,
//! `STRIKE_TIMEOUT`, `WHIFF_RECOVERY`, `BLOCK_RECOVERY`, `RECOVERY_EXPOSURE`,
//! `WINDUP_ARC`, `FOLLOW_THROUGH`, `STRIKE_SPENT_ARC`, `BRACE_SPIN` and the
//! `BLOCK_LEAK_*` pair all read only from prose now). Removing them is a public
//! API change and a separate decision; naming them is what stops the next
//! reader mistaking "no warning" for "in use".
//!
//! ## What the phase machine argued, kept because the argument is still true
//!
//! The first version of this model let an agent command the blade's bearing
//! every tick. That is a strictly more expressive interface and it produced
//! exactly one strategy: hold the blade at full extension and rotate it as fast
//! as the torque cap allows. Nothing in the sim charged for it, every tick of
//! rotation was a live hitbox, and so the optimal play -- for a policy, for
//! evolution, and for a person with a mouse -- was a windmill. There was no
//! moment at which an attack *began*, which meant there was no moment at which
//! one could be read, dodged, or punished. The four phases were the answer:
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
//! Three properties fell out, and they are the reason a future session should
//! read this before deciding the jointed arm needs none of them: **an attack
//! announces itself** (the windup was real time on the clock, in the defender's
//! observation, and a Brute spent 33 ticks saying what it was about to do);
//! **an attack commits** (once the cut was live the line was frozen, so the
//! decision was as unreversible as the momentum); and **a miss costs**
//! (recovery was a window in which the hand could answer nothing). The eight
//! tuning constants those phases read are named, with their values and the
//! arguments for them, in `rules.rs` where they stood.
//!
//! Two traps came with it and are worth carrying forward whole, because both
//! are properties of *any* limb integrator and not of the phases. `track`
//! braked as it approached its bearing and arrived at rest, so a blade aimed
//! *at* a target reached it with no speed and did no damage -- which is why the
//! strike phase aimed past the line rather than at it. And an attack began only
//! on a strike command that followed a non-strike one ([`Hand::armed`]), so a
//! policy that asked to attack forever threw exactly one attack; without that,
//! holding the button down chains attacks back to back, which is the windmill
//! again with extra steps.

use crate::rules::{self, Arm};
use fx::{Angle, Fx};

/// Which phase of an attack the limb is in.
///
/// **Nothing moves between these any more.** The machine that did is described
/// in this module's header and was deleted with it, so every variant below the
/// first is unreachable in a running fight; the field is still hashed and still
/// published, and the variants are kept whole because a one-hot index is part of
/// a frozen feature layout and because a mechanic that restores the phases
/// should not have to re-derive their order.
///
/// A limb holding a non-[`crate::Role::Strike`] action is always
/// [`Swing::Guard`]: it has no attack to be in a phase of. Carrying the field
/// anyway is what keeps one `Hand` type at the boundary, and it is a much
/// smaller apology than it used to be now that there is only one limb to carry
/// it.
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
    /// Only a [`crate::Role::Guard`] limb reads it, and it is what makes a guard
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
    /// decision spent on [`crate::Strike::None`] re-arms -- and expensive to ignore,
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

    pub(crate) fn hash_into(self, h: &mut fx::Hash64) {
        h.write_u16(self.angle.raw());
        h.write_i32(self.spin.raw());
        h.write_i32(self.residue.raw());
        h.write_i32(self.reach.raw());
        // The phase fields are hashed too, and since the phase machine went
        // they are hashed as *published* state rather than as state the sim acts
        // on -- see the note at the call site in `world/hash.rs`. Writing the
        // whole value keeps this function's rule "every field", which is the
        // only rule that cannot go stale one field at a time.
        h.write_u8(self.swing.discriminant() as u8);
        h.write_u16(self.swing_left);
        h.write_u16(self.line.raw());
        h.write_u8(self.side as u8);
        h.write_u16(self.braced);
        h.write_u8(self.armed as u8);
    }
}
