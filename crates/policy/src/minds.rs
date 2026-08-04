//! One opinion per action, and a selector that chooses between them.
//!
//! A fighter carries up to two actions and holds one. Deciding *which* is a
//! different question from deciding what to do with it, and this module is the
//! seam between them:
//!
//! * an [`ActionMind`] knows how to use one thing and how much it wants to be
//!   holding it;
//! * [`crate::DuelistPolicy`] scores every filled slot, picks a winner, and
//!   drives the mind of whatever is **actually in hand**.
//!
//! ## Why `drive` runs the held action and not the winner
//!
//! Those differ for the whole length of a swap -- fifteen ticks on a Fighter
//! reaching for a shield -- and a policy that drove the winner would spend that
//! window issuing sword commands to a guard. The limb would take them, too:
//! `LimbCommand` is one type and a guard reads `reach` off it happily. The
//! symptom would be a fighter that appears to change its mind and then fights
//! badly for a quarter of a second, which is not something anyone would find by
//! reading a scoreboard.
//!
//! ## Why there are two minds and not five
//!
//! The plan called for one mind per action -- a `SwordMind`, a `ClubMind`, a
//! `KnifeMind`, a `PunchMind`. Written out, four of them were the same code
//! reading different rows of [`sim::ACTIONS`]: the reach a fighter wants, the
//! moment it commits and the side it cuts from are already derived from the
//! spec through [`sim::Observation::full_reach`], [`sim::Contact::min_strike_range`]
//! and [`swing::open_side`]. Four copies would be four places for those to drift
//! apart, which is the exact failure `rules::MUSCLE_SPIN` has a three-paragraph
//! post-mortem about.
//!
//! So there is one [`BladeMind`] that fights with whatever it is holding, and
//! one [`GuardMind`] that does the thing a blade cannot. A weapon that wants
//! genuinely different footwork should get its own mind then -- not in advance.

use crate::duelist::{DuelistWeights, Stance};
use crate::swing;
use fx::{Fx, Vec2};
use sim::{Contact, LimbCommand, Observation, Role};

/// What a mind remembers about one fighter between decisions.
///
/// Owned by the policy rather than by the mind, because it has to survive a
/// swap: a fighter that reached for its shield and then went back to the sword
/// should still be fighting the same enemy.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct MindMemory {
    pub stance: Option<Stance>,
}

/// One action's opinion of the fight.
///
/// Two methods, and the split between them is the whole design. [`appraise`] is
/// what the selector reads to decide what should be in hand; [`drive`] is what
/// actually runs, and only ever for the action being held.
///
/// [`appraise`] takes `&self` on purpose: a scorer that mutated would make the
/// selector's answer depend on how many candidates it happened to look at, and
/// on what order it looked at them in.
///
/// [`appraise`]: ActionMind::appraise
/// [`drive`]: ActionMind::drive
pub trait ActionMind {
    /// How much this action wants to be in hand right now, on roughly the same
    /// `0..=3` scale the stance scores use so the two can be reasoned about
    /// together.
    ///
    /// **Never negative, and never exactly zero for something usable.** The
    /// selector takes an argmax over filled slots, so an action that scored zero
    /// in every situation would be a slot the fighter had thrown away.
    fn appraise(&self, obs: &Observation, foe: &Contact) -> Fx;

    /// Footwork and one limb command, for a tick on which this mind is holding
    /// the limb.
    fn drive(&self, obs: &Observation, foe: &Contact, memory: &mut MindMemory)
        -> (Vec2, LimbCommand);
}

/// Fights with whatever blade is in hand.
///
/// The stance machine, unchanged in substance from the one that was measured
/// into the difficulty ladder -- minus `Stance::Guard`, which has moved to
/// [`GuardMind`] where it can finally do something. Every number it needs about
/// the weapon comes from the observation rather than from a table here, so this
/// is a knife-fighter and a club-fighter and a boxer depending only on what it
/// was handed.
pub struct BladeMind {
    pub weights: DuelistWeights,
}

impl ActionMind for BladeMind {
    fn appraise(&self, obs: &Observation, foe: &Contact) -> Fx {
        // A blade with nothing to hit is worth holding anyway -- it is the only
        // thing that ends a fight. This is the floor that stops a fighter
        // standing behind a shield until the clock runs out.
        let mut want = Fx::ONE;

        // In reach, and able to open: the case for holding a weapon is that it
        // can be used *now*.
        let reach = obs.full_reach() + foe.radius;
        if foe.distance <= reach {
            want += Fx::HALF;
        }
        // Something helpless in front of you is the strongest argument there is
        // for holding the thing that hurts it.
        want += swing::overcommitted(foe) * self.weights.punish;
        // And the weaker they are relative to you, the more an exchange is worth
        // taking rather than avoiding.
        want += foe.frailty.min(Fx::ONE) * self.weights.aggression * Fx::HALF;

        // What argues against it: a blow on its way that this cannot answer.
        let (urgency, _) = swing::incoming(obs, foe);
        want -= urgency * self.weights.guard;
        want.max(Fx::from_ratio(1, 10))
    }

    fn drive(
        &self,
        obs: &Observation,
        foe: &Contact,
        memory: &mut MindMemory,
    ) -> (Vec2, LimbCommand) {
        let stance = crate::DuelistPolicy::choose_blade_stance(&self.weights, obs, foe, memory.stance);
        memory.stance = Some(stance);
        crate::DuelistPolicy::drive_blade_stance(&self.weights, obs, foe, stance)
    }
}

/// Holds a guard on the line a blow is actually going to arrive on.
///
/// **This is `Stance::Guard` with the content it always should have had.** In
/// the old model that stance stopped the feet and cancelled a windup, and did
/// nothing whatever about the shield -- because the shield was braced in all
/// eight stances regardless, so there was nothing left for it to do. A test in
/// `duel.rs` recorded the consequence as a measurement: answering a telegraph
/// was a *losing* strategy, because defending was never an alternative to
/// pressing. It was something you got for free while pressing.
///
/// Now it costs the attack, and it is a real bet.
pub struct GuardMind {
    pub weights: DuelistWeights,
}

impl ActionMind for GuardMind {
    fn appraise(&self, obs: &Observation, foe: &Contact) -> Fx {
        // A guard is worth exactly what the blow it stops is worth, and worth
        // nothing at all the rest of the time. This is the one appraisal in the
        // crate that is allowed near zero: an idle shield genuinely is a wasted
        // hand, and a fighter that cannot bring itself to put one down is the
        // failure mode this whole model exists to price.
        let (urgency, ticks_left) = swing::incoming(obs, foe);
        if urgency.is_zero() {
            return Fx::ZERO;
        }

        // **Can the guard actually arrive?**
        //
        // The gate that made this mind worth having. Without it a fighter
        // reaches for its shield at every telegraph, including the ones it
        // cannot possibly beat, and spends the fight holding the wrong thing:
        // measured at 33% against a Brute where simply never swapping won 80%.
        // Reaching late is worse than not reaching -- the blow lands either way,
        // and at least a blade could have answered it.
        //
        // `ticks_left` is the telegraph alone, and the window a defender really
        // gets is the telegraph *plus* however far the cut still has to travel
        // before it bites. Measured through a live world, that ratio is about
        // 1.9 for a club and 3.4 for a knife, so doubling is the conservative
        // reading -- generous enough to let the heavy telegraph through, mean
        // enough to keep refusing the ones that cannot be beaten.
        //
        // Skipped when a guard is already in hand: `swap_ticks` is then the cost
        // of going *back* to the blade, which says nothing about whether to keep
        // covering.
        let window = u32::from(ticks_left) * 2;
        if !obs.role().blocks() && u32::from(obs.swap_ticks) > window {
            return Fx::ZERO;
        }

        // How bad is what is coming, and how little can this fighter afford it?
        // `threat` is already a fraction of the observer's own health, so a
        // Skitterer's knife and a Brute's club are not the same emergency even
        // when they are equally imminent.
        let stakes = foe.threat.min(Fx::ONE) + (Fx::ONE - obs.hp_frac) * self.weights.caution;
        // Being thrown about is the other thing a planted guard buys, through
        // `BRACE_ANCHOR`.
        let footing = foe.knockback_taken.min(Fx::ONE) * self.weights.anchor;
        urgency * self.weights.read_ahead * (self.weights.guard + stakes + footing)
    }

    fn drive(
        &self,
        obs: &Observation,
        foe: &Contact,
        _memory: &mut MindMemory,
    ) -> (Vec2, LimbCommand) {
        // Cover the *blow*, not the man. A cut sweeps in and first bites well
        // round the body from where its wielder is standing, so a guard pointed
        // at the swordsman covers the one bearing the blow cannot arrive from.
        let line = match swing::landing(obs, foe) {
            Some(at) if !at.is_zero() => at.angle(),
            _ => foe.offset.angle(),
        };
        // Feet still. A guard that is walking is a guard somewhere else by the
        // time the blow lands, and `BRACE_SPIN` charges for the motion twice --
        // once in where it ends up, once in how planted it is when it gets
        // there.
        (Vec2::ZERO, LimbCommand::new(line, Fx::ONE))
    }
}

/// Neither cuts nor covers: keeps the limb tucked and the feet moving.
///
/// The fallback for a role the crate has no real opinion about yet, so that
/// handing a fighter a reserved action produces something inert rather than a
/// panic or a fighter frozen mid-stride.
pub struct IdleMind;

impl ActionMind for IdleMind {
    fn appraise(&self, _obs: &Observation, _foe: &Contact) -> Fx {
        Fx::ZERO
    }

    fn drive(
        &self,
        _obs: &Observation,
        foe: &Contact,
        _memory: &mut MindMemory,
    ) -> (Vec2, LimbCommand) {
        (foe.offset.normalize(), LimbCommand::TUCKED)
    }
}

/// The mind for whatever `role` describes.
///
/// Dispatch on the role rather than on the action, so a new row in
/// [`sim::ACTIONS`] is playable the moment it is priced -- and so the choice of
/// which mind runs is the same choice `World` makes about which limb rule runs.
pub fn mind_for(role: Role, weights: DuelistWeights) -> Box<dyn ActionMind> {
    match role {
        Role::Strike => Box::new(BladeMind { weights }),
        Role::Guard => Box::new(GuardMind { weights }),
        Role::Move | Role::Shoot => Box::new(IdleMind),
    }
}
