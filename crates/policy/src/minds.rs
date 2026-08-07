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
/// Three methods, and the split between the first two is the whole design.
/// [`appraise`] is what the selector reads to decide what should be in hand;
/// [`drive`] is what actually runs, and only ever for the action being held.
/// [`standoff`] is the third and it is a different kind of thing: not a decision
/// at all, but the one number out of `drive` that somebody *outside* the fight
/// needs to know.
///
/// [`appraise`] takes `&self` on purpose: a scorer that mutated would make the
/// selector's answer depend on how many candidates it happened to look at, and
/// on what order it looked at them in.
///
/// [`appraise`]: ActionMind::appraise
/// [`drive`]: ActionMind::drive
/// [`standoff`]: ActionMind::standoff
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

    /// How far out this mind wants to stand from `foe`.
    ///
    /// The distance an [`sim::Order::Focus`] treats as *arrived*. A player who
    /// clicks an enemy has said "fight that one", which is not the same thing as
    /// "walk onto that one" -- so the anchor a focus order pulls toward is a ring
    /// at this radius rather than the body at its centre. Inside the ring the
    /// pursuit lets go and this mind owns the feet, which is what makes an archer
    /// kite instead of closing and a duellist circle instead of standing on top
    /// of somebody.
    ///
    /// **Every implementation must return the same number its own `drive` is
    /// steering toward.** Two answers means a focused fighter is hauled off the
    /// spacing it just chose, once per decision, forever -- and the two forces
    /// would balance somewhere neither of them asked for. That is why
    /// [`BowMind`] computes this here and `drive` reads it back rather than
    /// keeping a second copy of the expression.
    ///
    /// **Required rather than defaulted**, on the same argument [`mind_for`] is
    /// written for: a fifth mind should fail to compile rather than silently
    /// inherit somebody else's idea of where to stand, which is a bug that would
    /// show up as a character loitering at a strange distance and nowhere as a
    /// line of code.
    fn standoff(&self, obs: &Observation, foe: &Contact) -> Fx;
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

    /// The blade's own answer to where to stand, which every stance in
    /// `drive_blade_stance` is already keeping station against through
    /// [`crate::DuelistPolicy::station`]. Nothing is re-derived here and nothing
    /// should be: this is the same call that function makes.
    fn standoff(&self, obs: &Observation, foe: &Contact) -> Fx {
        crate::DuelistPolicy::preferred_range(&self.weights, obs, foe)
    }
}

/// Gives ground, and holds a guard on the line a blow is actually going to
/// arrive on.
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
///
/// ## Why the feet moved
///
/// This mind planted them, on the reading that a walking guard is a guard
/// somewhere else by the time the blow lands, and that [`sim::BRACE_SPIN`]
/// charges twice for the motion. **The second half of that was simply wrong
/// about the sim.** `Hand::settle` gates the brace on the *hand's* angular
/// speed, not on the body's -- `spin.abs() <= BRACE_SPIN` -- so a fighter
/// backing straight away from an enemy holds its bearing constant, keeps every
/// tick of its brace, and is asserted to by `hand.rs`'s
/// `a_guard_tracking_a_walking_enemy_stays_braced`. Standing still bought
/// nothing that walking away did not also buy.
///
/// What planting really produced was a defender that met every cut it could not
/// avoid, and then a *charge* the moment the selector handed the blade back. A
/// guard that costs the attack should be buying distance with it.
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
        // Being thrown about is the other thing a settled guard buys, through
        // `BRACE_ANCHOR` -- and it survives the retreat in `drive`, because the
        // brace is a fact about the hand rather than about the feet.
        let footing = foe.knockback_taken.min(Fx::ONE) * self.weights.anchor;
        urgency * self.weights.read_ahead * (self.weights.guard + stakes + footing)
    }

    fn drive(
        &self,
        obs: &Observation,
        foe: &Contact,
        memory: &mut MindMemory,
    ) -> (Vec2, LimbCommand) {
        // Cover the *blow*, not the man. A cut sweeps in and first bites well
        // round the body from where its wielder is standing, so a guard pointed
        // at the swordsman covers the one bearing the blow cannot arrive from.
        let line = match swing::landing(obs, foe) {
            Some(at) if !at.is_zero() => at.angle(),
            _ => foe.offset.angle(),
        };
        // Recorded for the same reason `RunMind` records its own: the page reads
        // the stance back and a HUD that says "trade" while the character
        // backs off behind a shield is a HUD describing the blade it put down.
        memory.stance = Some(Stance::Guard);

        // **Where their blade stops** -- the only distance a guard's footwork is
        // about, and the same figure `BowMind` stands off. Not `full_reach()`,
        // which for a shield is a 0.45-unit plank and says nothing about what is
        // being defended against.
        let theirs = obs.radius + foe.radius + foe.action_length;

        // **Step off the cut, but only when the step actually clears it.**
        //
        // This is the whole of the footwork, and the gate is not caution -- it
        // is the damage law. A blow is worth `1/2 m v^2` at the radius it
        // connects at and the speed comes out of `spin * arm`, so a blade hits
        // **hardest at the tip**. Giving ground therefore slides the contact
        // point outward: a retreat that does not finish is a retreat that made
        // the blow *worse*. There is no gradient to walk down here and no safe
        // half-measure, which is the opposite of how backing away reads.
        //
        // So the question asked is binary and quantitative: is there enough
        // ground between here and the far edge of their arc to cover before the
        // cut arrives? `ticks_left` is the telegraph alone, which is the
        // conservative reading -- the real window is that plus however far the
        // blade still has to travel, about 1.9x for a club and 3.4x for a knife
        // -- so a retreat this accepts is one there is comfortably time for.
        // Everything else stands its ground and catches the blow on the shield,
        // which is what the shield is *for*.
        //
        // **Measured over 96 duels against a Brute** (`control_what_a_guard_does
        // _with_its_feet`), against the planted version this replaces:
        //
        // ```text
        //                    planted            steps off
        //   Rogue    wins       68%                  69%
        //            blocks     133                  141
        //   Fighter  wins       73%                  67%
        //            blocks     133                  121
        // ```
        //
        // The Fighter's six points is the honest cost of the change and it is
        // recorded rather than tuned away: it is the slower body, so more of its
        // retreats are the marginal ones, and a marginal retreat is the case the
        // paragraph above says is worst. Requiring a body-radius of clearance on
        // top was tried and bought nothing -- 67% either way. Nothing else in
        // the roster sweep moves by a single point, because nothing else in it
        // ever has a guard in its hand.
        let (urgency, ticks_left) = swing::incoming(obs, foe);
        let gap = theirs - foe.distance;
        let ground = obs.move_speed * Fx::from_int(i32::from(ticks_left));
        let feet = if urgency.is_positive() && gap.is_positive() && ground > gap {
            // Straight back, and flat out. Not a `station`: a station brakes to
            // arrive at rest *on* the mark, and the mark here is the tip of the
            // arc -- the one place in the fight worth least standing at.
            -foe.offset.normalize() + crate::DuelistPolicy::open_ground(&self.weights, obs)
        } else {
            // **And never in.** A guard cannot cut, so there is nothing on the
            // other side of that walk to collect: closing behind a shield is
            // handing away the ground for free and arriving with the one thing
            // in hand that cannot spend it. Pressing is what the blade in the
            // other slot is for, and the selector will reach for it.
            Vec2::ZERO
        };

        (feet.clamp_length(Fx::ONE), LimbCommand::new(line, Fx::ONE))
    }

    /// **The blade's range, not the shield's**, and the exception that the
    /// contract on [`ActionMind::standoff`] is worth reading against.
    ///
    /// A guard is not keeping a station at all: the footwork above either clears
    /// the arc outright or stands its ground, and neither of those is a distance
    /// it is steering *to*. So there is no number of its own to return, and the
    /// honest one is the fight's -- a shield is a hand held for a window of ticks
    /// in the middle of a sword fight, and the fighter goes back to the sword.
    ///
    /// Answering with `theirs`, the tip of the arc this mind's feet are measured
    /// against, was the alternative and it is worse in the one way that matters:
    /// the ring would then grow and shrink every time the selector reached for
    /// the shield and put it down again, so a pursued quarry would find the
    /// fighter chasing it in and letting it go in time with its own swings.
    /// A ring that flinches is not a ring.
    fn standoff(&self, obs: &Observation, foe: &Contact) -> Fx {
        crate::DuelistPolicy::preferred_range(&self.weights, obs, foe)
    }
}

/// **Legs are for leaving.**
///
/// The one loadout in the game that cannot answer anything at all: no blade, no
/// guard, no parry. So its whole case has to be made out of distance -- and out
/// of the *one* direction of it that a fighter holding nothing can profit from.
///
/// ## Why it no longer closes
///
/// This mind used to read the gap both ways: far from the enemy, legs were worth
/// holding because there was ground to cover, and it sprinted *at* whatever it
/// could see. That is coherent on paper and it is the wrong thing to watch, for
/// two reasons that turned out to be the same reason.
///
/// A charge with empty hands ends in the worst position in the game. The runner
/// arrives inside a blade with nothing in its own hand and then stands there for
/// the whole of its weapon's `ready` -- 10 ticks for a sword, 18 for a club --
/// which is a punish window it walked into deliberately. The old appraisal knew
/// this and tried to price it, by pushing the mark out by `move_speed *
/// swap_ticks` so the legs went away slightly early. That is a correction to a
/// plan that should not have been made: the fighter that wants to close should
/// close *holding the blade*, which is exactly what [`Stance::Close`] already
/// does, at a footspeed cost of 26% and with something in its hand on arrival.
///
/// And it read as nonsense. Put "run" in a character's hand and watch it sprint
/// at the thing trying to kill it -- there is no reading of the word under which
/// that is what was asked for.
///
/// So closing belongs to the blade, and this keeps the half nothing else can
/// do. What it costs: a fighter can no longer buy the approach with its second
/// slot. That is the trade, and it is the right way round -- the approach was
/// never the part that needed a dedicated action.
///
/// **And here is the price, measured.** `sword+run` against a sword-and-board
/// mirror now scores **47%** -- which is exactly what `sword+sword`,
/// `sword+punch` and a bare `sword` all score against the same opponent. In a
/// duel the legs have become indistinguishable from carrying nothing, because
/// the only case they are held for is breaking off and a duel has nowhere to
/// break off *to*: `caution` is 0.32 blows and the clock is scored against you.
/// `legs_are_an_option_and_not_a_free_win` still passes, and it passes for a
/// weaker reason than it used to.
///
/// That is a fact about the *arena* rather than about this mind -- the same one
/// `DuelistWeights::caution` has a paragraph about -- and it is the shape to
/// expect: a retreat is worth something when there is somewhere to retreat to
/// and somebody to retreat toward, which is a skirmish, not a fenced pair. The
/// honest way to make legs pay in a duel would be to give them something to do
/// there, and the honest way to measure them is `--arena roster`.
pub struct RunMind {
    pub weights: DuelistWeights,
}

impl ActionMind for RunMind {
    fn appraise(&self, obs: &Observation, foe: &Contact) -> Fx {
        // A floor, like `BladeMind`'s and for the same reason: a slot that
        // scores zero in every situation is a slot the fighter threw away.
        let mut want = Fx::from_ratio(2, 10);

        // **Breaking off**, read exactly the way `Stance::Retreat` reads it so
        // the two cannot come to different conclusions about whether this fight
        // is worth having. This is the case legs are *for*: a fighter that has
        // decided not to fight has nothing to do with a blade, and outrunning
        // the pursuit is the whole plan.
        if self.breaking_off(obs, foe) {
            want += Fx::TWO;
        }

        // And what argues against it, which is everything else. The urgency term
        // is strictly heavier than `BladeMind`'s -- that mind subtracts
        // `urgency * guard` and this one subtracts more -- so a blade always
        // outranks legs while something is actually arriving. Turning your back
        // on a declared cut is how the ground you bought gets charged to you at
        // the tip of the arc, where a blow is worth most.
        let (urgency, _) = swing::incoming(obs, foe);
        want -= urgency * (self.weights.guard + Fx::ONE);

        // Already inside reach: leaving is no longer something the legs can do
        // faster than the blade can be swung, so this is the one place they are
        // worth less than nothing.
        let reach = obs.full_reach() + foe.radius;
        if foe.distance <= reach {
            want -= Fx::ONE;
        }
        want.max(Fx::from_ratio(1, 20))
    }

    fn drive(
        &self,
        obs: &Observation,
        foe: &Contact,
        memory: &mut MindMemory,
    ) -> (Vec2, LimbCommand) {
        let toward = foe.offset.normalize();
        // Recorded so `DuelistPolicy::decide` reports `Intent::Flee` and the page
        // labels it honestly. A runner that shows "attack" while sprinting for
        // the far wall is a HUD that lies about the one thing it can see.
        //
        // Unconditional now, where it used to depend on `breaking_off`. The two
        // legs of that branch went in opposite directions, and the one that has
        // survived is the one the word means.
        memory.stance = Some(Stance::Retreat);

        // Away, always, and flat out -- there is no station to keep on the far
        // side of a fight you have left. `cohesion` is what stops that being a
        // straight line into the loneliest corner of the arena: running toward
        // your own side is the difference between a withdrawal and a rout, and
        // `open_ground` keeps it off the walls.
        //
        // Nothing here is conditioned on whether the retreat can succeed. A
        // fighter that cannot outrun its pursuer should not be *holding* these
        // -- and it is `appraise` that says so, one level up, which is the whole
        // point of the two methods being separate.
        let feet = (-toward
            + crate::DuelistPolicy::cohesion(&self.weights, obs)
            + crate::DuelistPolicy::open_ground(&self.weights, obs))
        .clamp_length(Fx::ONE);

        // **Parked where it already is -- not `LimbCommand::TUCKED`.**
        //
        // `TUCKED` pins the bearing at zero, which would haul the arm right round
        // the compass every time the fighter happened to be facing elsewhere.
        // That is not free: `World::blade_momentum` has no role gate, so a limb
        // with mass being spun costs footing through `apply_recoil` whether or
        // not it is a blade. A runner shoving itself sideways with its own empty
        // hand would read as physics and be a bug.
        (feet, LimbCommand::new(obs.limb.angle, Fx::ZERO))
    }

    /// **The blade's range, from the one mind that is walking the other way.**
    ///
    /// Legs have no station either -- "away, always, and flat out" is not a
    /// distance -- so this is [`GuardMind`]'s answer for [`GuardMind`]'s reason:
    /// the ring belongs to the fight the fighter is in, and that fight is its
    /// blade's.
    ///
    /// It is also what keeps the compromise this mind makes under an order an
    /// honest one. A player who clicks an enemy while these are in hand has asked
    /// for two opposite things at once and gets both: the leash pulls forward at
    /// full strength while the legs push back at `LEASH_LANE`, so the fighter
    /// gives ground while being dragged after its quarry. That tension is the
    /// answer rather than a case to special-case away -- but it is only
    /// defensible while the ring the pull relaxes at is a real fighting distance.
    /// A runner that reported a standoff of its own -- whatever distance it felt
    /// safe at -- would let go of the quarry somewhere no blade could reach, and
    /// the order would quietly have meant nothing.
    fn standoff(&self, obs: &Observation, foe: &Contact) -> Fx {
        crate::DuelistPolicy::preferred_range(&self.weights, obs, foe)
    }
}

impl RunMind {
    /// Whether this fight is worth leaving, on the same reading
    /// [`Stance::Retreat`] uses.
    fn breaking_off(&self, obs: &Observation, foe: &Contact) -> bool {
        let mine = crate::duelist::blows_left(obs.hp_frac, foe.threat);
        let theirs = crate::duelist::blows_left(foe.hp_frac, foe.frailty);
        mine < self.weights.caution && mine < theirs
    }
}

/// How far outside a blade an archer tries to stand.
///
/// Far enough that closing on it costs a decision or two, near enough that the
/// flight is short -- a bow aims at where its target *is*, not where it will be,
/// so every unit of standoff is another unit the arrow can be walked out of.
const KEEP_OUT: Fx = Fx::from_ratio(16, 10);

/// Reach without a blade, paid for in telegraph.
///
/// A bow is worth exactly what standing outside somebody's sword is worth, and
/// nothing at all once they have arrived: thirty ticks of draw with no guard, no
/// parry and no edge is the most punishable thing in the game to be caught
/// holding. So its whole case is the one distance a blade cannot argue for.
pub struct BowMind {
    pub weights: DuelistWeights,
}

impl ActionMind for BowMind {
    fn appraise(&self, obs: &Observation, foe: &Contact) -> Fx {
        let mut want = Fx::from_ratio(2, 10);

        // **Where *their* blade stops** -- not `obs.full_reach()`, which for a
        // bow is the draw and would claim this thing reaches 0.75 units. The
        // only distance a bow's case is made of is the one it is safe at.
        let theirs = obs.radius + foe.radius + foe.action_length;
        if foe.distance > theirs {
            // They cannot reach and this can. There is no range test on the far
            // side, and there does not need to be one: an arrow carries the
            // archer's own sight range, and a `Contact` exists only inside it.
            want += Fx::ONE + foe.frailty.min(Fx::ONE) * self.weights.aggression * Fx::HALF;
        } else {
            // Inside a sword's length a bow is a stick.
            want -= Fx::ONE;
        }

        // And nothing here can answer a blow that is already coming.
        let (urgency, _) = swing::incoming(obs, foe);
        want -= urgency * self.weights.guard;
        want.max(Fx::from_ratio(1, 20))
    }

    fn drive(
        &self,
        obs: &Observation,
        foe: &Contact,
        memory: &mut MindMemory,
    ) -> (Vec2, LimbCommand) {
        memory.stance = Some(Stance::Trade);

        // Where to stand, asked of `standoff` rather than worked out again here.
        // **One expression, one reader.** This used to be two lines of arithmetic
        // in this function and the ring a focus order pulls to would have been a
        // second transcription of them -- which is exactly the drift this
        // module's own header warns about, and the reason `station` was lifted
        // out of `drive_blade_stance` in the first place. The consequence of the
        // two copies parting company is specific and would be hard to see: the
        // pursuit would let go at one distance while the feet steered to another,
        // and the archer would settle wherever the two balanced.
        let ideal = self.standoff(obs, foe);

        // **You cannot draw a bow and run at the same time**, and this line is
        // the whole price of the row.
        //
        // It is the rule `GuardMind` already keeps -- feet still while the thing
        // in your hands is doing its job -- and a bow needs it far more badly. An
        // archer that repositions *while* drawing simply backs away at its
        // pursuer's own speed and can never be caught: measured, that won 80%
        // where every sword loadout in the game wins 47%.
        //
        // Slowing the row down instead was tried and is a cliff rather than a
        // slope, because outrunning someone is a threshold -- see the `Bow` row
        // in `sim::ACTIONS`. Planting is the honest cost: closing the ground is
        // now something an archer *spends a shot* to undo, so reach and tempo
        // trade against each other the way the telegraph always meant them to.
        let drawing = obs.limb.swing.is_attacking();
        let feet = if drawing {
            Vec2::ZERO
        } else {
            crate::DuelistPolicy::station(obs, foe, ideal)
                + crate::DuelistPolicy::open_ground(&self.weights, obs) * Fx::HALF
        };

        // Aimed at the man. `Strike::Nearest` because the side decides only
        // which shoulder the draw comes over -- the arrow leaves along the line
        // either way, so the shortest telegraph is free to take. And `press`
        // rather than a hand-built command: it is what keeps the attack held
        // down through the draw and released during the recovery, and it is the
        // one call site that needed `Role::can_attack` to exist.
        let limb = swing::press(obs, foe.offset.angle(), sim::Strike::Nearest);
        (feet.clamp_length(Fx::ONE), limb)
    }

    /// **The line that makes a bow behave**, and the reason this method exists
    /// on the trait at all.
    ///
    /// Stand off *their* blade. Not off this fighter's own dead zone, which
    /// `rules::dead_zone` now reports as zero for a bow precisely because an
    /// arrow does not care how far from the shoulder it lands, and not off
    /// `full_reach`, which for a bow is the draw and would claim this thing
    /// reaches three quarters of a unit. [`KEEP_OUT`] is applied to *their*
    /// reach; the argument for that is at [`BowMind::appraise`] and the ring a
    /// focus order builds from this inherits it for free, which is the whole
    /// point of the ring being the mind's own number.
    ///
    /// Capped inside sight, because an arrow that runs out of flight is a draw
    /// thrown away -- and the cap is why an archer told to fight something does
    /// not simply refuse to approach anything with long arms.
    fn standoff(&self, obs: &Observation, foe: &Contact) -> Fx {
        let theirs = obs.radius + foe.radius + foe.action_length;
        (theirs * KEEP_OUT).min(obs.sight_range * Fx::from_ratio(9, 10))
    }
}

// `IdleMind` lived here: an inert fallback that appraised to `Fx::ZERO` and kept
// the limb tucked, so that a fighter handed one of the reserved rows produced
// something harmless rather than a panic. Both reserved rows have landed and
// every role now has a mind that means something, so the fallback is gone rather
// than kept as a fifth arm nothing can reach.
//
// The property it was really protecting is not lost: `mind_for` matches every
// variant explicitly, so a fifth `Role` fails to compile there rather than
// silently inheriting a do-nothing.

/// The mind for whatever `role` describes.
///
/// Dispatch on the role rather than on the action, so a new row in
/// [`sim::ACTIONS`] is playable the moment it is priced -- and so the choice of
/// which mind runs is the same choice `World` makes about which limb rule runs.
pub fn mind_for(role: Role, weights: DuelistWeights) -> Box<dyn ActionMind> {
    match role {
        Role::Strike => Box::new(BladeMind { weights }),
        Role::Guard => Box::new(GuardMind { weights }),
        Role::Move => Box::new(RunMind { weights }),
        Role::Shoot => Box::new(BowMind { weights }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sim::{ActionKind, Body, Dungeon, Faction, Loadout, Scenario, UnitSpec, World};

    /// One archer and one Brute, `apart` units of open ground between them.
    ///
    /// Driven through a real `World` rather than assembled field by field. Every
    /// number these tests are about -- a Brute's club length, a Rogue's radius,
    /// the sight range the cap is measured against -- is a column of the stat
    /// sheet or of the action registry, and a hand-built fixture is a place for
    /// those to go quietly wrong while the assertions carry on passing.
    ///
    /// The pair stands east and west of the arena's centre, so `wall_clearance`
    /// cancels along y and `open_ground` contributes nothing to the axis the
    /// fight is on. That is what lets a claim about the archer's footwork below
    /// be made one component at a time.
    fn archer_facing(apart: Fx, held: ActionKind) -> (Observation, Contact) {
        let dungeon = Dungeon::open(24, 16);
        let centre = dungeon.extent() * Fx::HALF;
        let unit = |kind: Body, faction, loadout, spawn| UnitSpec {
            kind,
            faction,
            stats: kind.base_stats(),
            loadout,
            spawn,
        };
        let scenario = Scenario {
            name: "standoff".to_string(),
            dungeon,
            portal: None,
            torches: Vec::new(),
            max_ticks: u32::MAX,
            units: vec![
                unit(
                    Body::Rogue,
                    Faction::Heroes,
                    Loadout::pair(held, ActionKind::Sword),
                    centre - Vec2::new(apart * Fx::HALF, Fx::ZERO),
                ),
                unit(
                    Body::Brute,
                    Faction::Monsters,
                    Body::Brute.default_loadout(),
                    centre + Vec2::new(apart * Fx::HALF, Fx::ZERO),
                ),
            ],
        };
        let world = World::new(&scenario, 1);
        let hero = world.alive_ids(Faction::Heroes)[0];
        let obs = world.observe(hero);
        let foe = obs.enemies()[0];
        (obs, foe)
    }

    fn weights() -> DuelistWeights {
        DuelistWeights::BASELINE
    }

    /// **The lift, as an equation.**
    ///
    /// `BowMind::drive` used to work out where to stand inline, in the two lines
    /// transcribed verbatim below, and the ring an `Order::Focus` anchors at
    /// needed the same number. Copying it would have been the drift this module's
    /// header warns about, so it moved into `standoff` and `drive` reads it back
    /// -- and this is the test that the move was a *move* rather than an edit. If
    /// these ever stop agreeing, an archer's spacing has changed; the duel win
    /// rates three files away are the measurement that would notice second, and
    /// much less specifically.
    ///
    /// Asked at four distances, though the answer must not depend on where the
    /// quarry is standing: what varies with distance in `drive` is the *pace*, and
    /// a `standoff` that had picked up a dependence on `foe.distance` would be a
    /// ring that moved as it was approached.
    #[test]
    fn a_bows_standoff_is_the_expression_its_drive_used_to_hold() {
        let mind = BowMind { weights: weights() };
        for apart in [2, 4, 8, 12] {
            let (obs, foe) = archer_facing(Fx::from_int(apart), ActionKind::Bow);

            let theirs = obs.radius + foe.radius + foe.action_length;
            let ideal = (theirs * KEEP_OUT).min(obs.sight_range * Fx::from_ratio(9, 10));

            assert_eq!(
                mind.standoff(&obs, &foe).raw(),
                ideal.raw(),
                "the archer's standing distance moved at {apart} units apart"
            );
        }
    }

    /// The cap is not decoration -- it is what stops an archer refusing to
    /// approach anything with long enough arms -- but it has to be reachable to
    /// be doing anything. A Brute's club through a Rogue's eyes asks for about
    /// 2.7 units of standoff against 12.6 of sight, so the sight term never binds
    /// anywhere in the roster as it stands. That is a fact about today's numbers
    /// rather than a property of the rule, so the rule is exercised by blinding
    /// the archer instead of by hoping a body turns up with long enough arms.
    #[test]
    fn an_archer_will_not_stand_off_further_than_it_can_see() {
        let mind = BowMind { weights: weights() };
        let (mut obs, foe) = archer_facing(Fx::from_int(4), ActionKind::Bow);
        let roomy = mind.standoff(&obs, &foe);
        assert!(
            roomy < obs.sight_range * Fx::from_ratio(9, 10),
            "the fixture is already sight-capped, so it cannot show the cap biting"
        );

        obs.sight_range = Fx::from_int(2);
        let blinkered = mind.standoff(&obs, &foe);
        assert_eq!(blinkered, Fx::from_ratio(9, 5), "the cap did not bind");
        assert!(blinkered < roomy);
    }

    /// **`drive` really does read `standoff`**, which is the half of "one
    /// expression, one reader" that an equality against a transcription cannot
    /// reach on its own.
    ///
    /// Stated as the crossover rather than by re-deriving the footwork: an archer
    /// inside its standoff gives ground, one outside it closes, and the sign of
    /// that turns over at the distance `standoff` reports. A `drive` that had kept
    /// a second copy of the expression would pass the equality above and fail here
    /// the moment the two copies differed by anything at all.
    ///
    /// The probes sit a fifth of the range either side of the mark, which clears
    /// `station`'s own deadband of a tenth -- inside it the answer is deliberately
    /// nothing, and a question with no answer is not a test.
    #[test]
    fn an_archers_feet_turn_round_at_the_distance_its_standoff_names() {
        let mind = BowMind { weights: weights() };
        let mut memory = MindMemory::default();
        let (probe, foe) = archer_facing(Fx::from_int(4), ActionKind::Bow);
        let ring = mind.standoff(&probe, &foe);
        let band = ring * Fx::from_ratio(2, 10);

        let (inside, near) = archer_facing(ring - band, ActionKind::Bow);
        let (out, _) = mind.drive(&inside, &near, &mut memory);
        assert!(
            out.x < Fx::ZERO,
            "crowded rather than backing off {band} inside the ring: {out:?}"
        );

        let (outside, far) = archer_facing(ring + band, ActionKind::Bow);
        let (back, _) = mind.drive(&outside, &far, &mut memory);
        assert!(
            back.x > Fx::ZERO,
            "held off rather than closing {band} outside the ring: {back:?}"
        );
    }

    /// The three minds with a blade to answer for report the blade's range, and
    /// report it *exactly* -- `preferred_range` itself, not something derived
    /// from it.
    ///
    /// `GuardMind` and `RunMind` are the interesting two, and they are here for
    /// the reason their own doc comments give: neither is keeping a station at
    /// all, so neither has a distance of its own to report, and the honest answer
    /// is the fight's. A shield and a pair of legs are both things a fighter holds
    /// for a window in the middle of a sword fight.
    #[test]
    fn the_minds_that_have_no_station_of_their_own_report_the_blades() {
        let (obs, foe) = archer_facing(Fx::from_int(4), ActionKind::Sword);
        let want = crate::DuelistPolicy::preferred_range(&weights(), &obs, &foe);
        for (name, mind) in [
            ("blade", mind_for(Role::Strike, weights())),
            ("guard", mind_for(Role::Guard, weights())),
            ("legs", mind_for(Role::Move, weights())),
        ] {
            assert_eq!(
                mind.standoff(&obs, &foe).raw(),
                want.raw(),
                "the {name} mind stands somewhere the blade does not"
            );
        }
    }

    /// **What the whole ring mechanism is for, in one inequality.**
    ///
    /// A bow's standoff is outside the distance at which the quarry's own weapon
    /// starts to bite, and a blade's is inside it. That is not a coincidence of
    /// the current numbers, it is the difference between the two kinds of mind: a
    /// blade measures out from the reach it means to fight with, and a bow
    /// measures out from the reach it means to stay clear of. A focus order
    /// inherits whichever is in hand, which is how the same click means "close"
    /// to a swordsman and "stop here" to an archer without either of them being
    /// told anything about orders.
    #[test]
    fn a_bow_stands_outside_the_quarrys_reach_and_a_blade_inside_it() {
        let (blade_obs, foe) = archer_facing(Fx::from_int(4), ActionKind::Sword);
        let (bow_obs, _) = archer_facing(Fx::from_int(4), ActionKind::Bow);
        // Where their club stops: the same figure `GuardMind` measures its
        // retreats against, and the one a bow's whole case is made of.
        let theirs = bow_obs.radius + foe.radius + foe.action_length;

        let bow = BowMind { weights: weights() }.standoff(&bow_obs, &foe);
        let blade = BladeMind { weights: weights() }.standoff(&blade_obs, &foe);
        println!("their reach {theirs}, bow stands at {bow}, blade at {blade}");
        assert!(
            bow > theirs,
            "an archer set up inside a Brute's club: {bow} against {theirs}"
        );
        assert!(
            blade < theirs,
            "a swordsman refused to come inside a Brute's club: {blade} against {theirs}"
        );
    }
}
