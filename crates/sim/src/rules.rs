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

/// Total health a unit may regenerate over one whole fight, as a multiple of
/// its maximum. **The rule that makes attrition monotone.**
///
/// Regeneration without a budget does not merely heal a fighter, it *resets the
/// fight*: withdraw, wait thirty seconds, and the exchange you just lost never
/// happened. Measured at the dim end of the skill range, one duel in five ended
/// with both fighters at full health and the clock stopped -- scored a draw,
/// correctly and uselessly, because by then it genuinely was one. A difficulty
/// ladder cannot be built on top of that: the bottom rung has to *lose*, and it
/// cannot lose a fight that keeps starting over.
///
/// One full bar, spent however the fight demands. Retreating to recover stays a
/// real tactic -- it is the whole reason [`REGEN_PER_TICK`] exists -- and it is
/// now a resource rather than a reset, so a fighter who is being beaten runs out
/// of second chances and dies of the first fight rather than the fifth.
pub const REGEN_BUDGET: Fx = Fx::ONE;

// ------------------------------------------------------------------ the swing

/// A weapon's physical character.
///
/// This is where a Brute stops being a Warrior with bigger numbers and becomes
/// something you have to fight *differently*. Reach, inertia and recovery are
/// separate knobs, so "long and slow" and "short and quick" are genuinely
/// different problems for an opponent rather than two points on one difficulty
/// axis.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Weapon {
    /// Blade length beyond the body surface at full extension, world units.
    pub length: Fx,
    /// Angular acceleration cap, raw angle units per tick squared.
    pub torque: Fx,
    /// Angular speed cap, raw angle units per tick.
    pub max_spin: Fx,
    /// How much `reach` may change per tick.
    pub extend_rate: Fx,
    /// Damage multiplier per unit of impact speed above [`IMPACT_THRESHOLD`].
    pub weight: Fx,
    /// Shield arc half-width at full extension, raw angle units.
    pub shield_arc: u16,
    /// **The telegraph.** Ticks the blade spends cocked back before a cut comes
    /// forward, at agility multiplier 1; see [`phase_ticks`].
    ///
    /// This number *is* the difficulty of the archetype, read from the other
    /// side. It is how long an opponent has to notice, decide and answer, and
    /// it is measured against that opponent's [`Stats::decision_period`]: a
    /// Brute's telegraph is nearly six times a Warrior's reaction and a third
    /// of a dim Skitterer's. Widen it and the archetype becomes a puzzle;
    /// narrow it and it becomes a coin flip.
    pub windup: u16,
    /// Ticks the hand needs to bring a spent blade back to guard, at agility
    /// multiplier 1. The punish window, and the price of missing.
    pub recovery: u16,
}

/// How much a hand's torque, top speed and extension scale with agility.
///
/// The ceiling is not tidiness. Blade-versus-body uses a closest-approach test
/// rather than a swept one, which is only correct while a tip cannot cross a
/// whole body in one tick; see `no_blade_can_outrun_the_smallest_body`. At an
/// unclamped multiplier a high-agility character's tip covers several units per
/// tick and sails straight through a Skitterer. `2.00` keeps the worst case at
/// 0.537 against a 0.60 budget.
pub const fn agility_multiplier(agility: u8) -> Fx {
    let scaled = Fx::from_ratio(70 + 4 * agility as i32, 100);
    scaled.clamp(Fx::from_ratio(55, 100), Fx::TWO)
}

/// The radius inside which no swing of `weapon` at `agility` can reach
/// [`IMPACT_THRESHOLD`], however hard it is thrown. **The dead zone.**
///
/// Impact is `spin x arm`, so the whole speed curve is fixed by one point on
/// it: whatever the blade manages at one unit of reach scales exactly.
/// Inverting that gives the radius at which it reaches the threshold and no
/// further down.
///
/// Public because it is the number a fighter needs about *everyone* and not
/// only about itself -- see [`crate::Contact::min_strike_range`], which is this
/// figure blurred by the observer's perception.
pub fn dead_zone(weapon: Weapon, agility: u8) -> Fx {
    let at_one_unit = fx::tangential_speed(weapon.max_spin * agility_multiplier(agility), Fx::ONE);
    if at_one_unit.is_positive() {
        IMPACT_THRESHOLD / at_one_unit
    } else {
        Fx::MAX
    }
}

/// Damage scaling from the power stat: `0.55 + 0.075 * power`, capped at 3.
pub const fn power_multiplier(power: u8) -> Fx {
    let scaled = Fx::from_ratio(550 + 75 * power as i32, 1000);
    scaled.clamp(Fx::from_ratio(55, 100), Fx::from_int(3))
}

/// Closing speed below which a blow does nothing at all, world units per tick.
///
/// It used to have two jobs and now has one, which is why it came down.
///
/// The job it lost: keeping a *stationary* blade carried into someone by
/// walking from being a weapon. That mattered when any moving blade billed
/// damage, and the threshold had to sit above every archetype's
/// [`Stats::move_speed`] to hold the line. Damage is gated on [`Swing::Strike`]
/// now, so a carried blade is not a weapon because it is not attacking, and the
/// threshold does not have to defend that on its own.
///
/// The job it kept is the interesting one: impact is `spin x arm`, so a
/// threshold gives every weapon a **dead zone** -- a radius inside which even a
/// full-speed blade cannot reach it. Getting inside one is the strongest answer
/// to a heavy weapon in the game.
///
/// At 0.09 that dead zone swallowed a Brute out to 1.27 units, which is most of
/// the way to its own tip. It could only hurt anything in the last third of its
/// reach, landed about one blow per fight, and lost to every archetype at every
/// skill level -- including to policies that ignored it completely.
///
/// 0.06 puts a Brute's dead zone at 0.85, which is *inside* the 1.15 at which a
/// Warrior's body and its own stop being able to get closer. That is a
/// deliberate change of kind and not only of degree: crowding a heavy weapon is
/// no longer a magic circle you step into and become immune, it is a steep
/// gradient. Damage is linear in the arm, so a Warrior pressed to body contact
/// still takes about a quarter of what one at the Brute's tip does -- the
/// tactic survives, and the degenerate state it used to lead to (a Skitterer
/// hugging a Brute, immune and harmless, while the fight timed out) does not.
pub const IMPACT_THRESHOLD: Fx = Fx::from_ratio(6, 100);

/// Damage per world-unit-per-tick of impact above [`IMPACT_THRESHOLD`], before
/// weapon weight and the power stat.
///
/// It more than doubled when the sword became a phase machine, and the
/// arithmetic behind that is worth keeping. A windmill billed a blow every nine
/// ticks; a measured attack is a windup, a cut and a recovery, and a Warrior
/// gets through one about every fifty ticks -- so the same constant produced
/// fights that could not finish, and two thirds of duels timed out with both
/// sides walking wounded.
///
/// It came most of the way back down when [`strike_ticks`] let heavy weapons
/// finish their swings, and the reason is **resolution** rather than pace. At
/// 135 a Brute's blow was worth up to 57 against a Warrior's 84 health: a duel
/// was three or four landed blows, so "won with half its health" and "won
/// almost untouched" were one blow apart and read as luck rather than as skill.
/// A difficulty ladder needs more rungs than that. At 60 a duel is a dozen
/// blows a side, one misread is a visible dent rather than a third of the fight,
/// and the health a fighter finishes on means something.
pub const IMPACT_TO_DAMAGE: Fx = Fx::from_int(60);

/// Fraction of a blow that leaks through a shield **that has been planted**.
///
/// Not zero on purpose: a Brute's blow should still be felt through a buckler,
/// so turtling is a discount rather than an off switch and a defender cannot
/// simply park behind its shield forever.
pub const BLOCK_LEAK_BRACED: Fx = Fx::from_ratio(8, 100);

/// Fraction of a blow that leaks through a shield still travelling toward the
/// bearing it was sent to.
///
/// **This is what makes reading an attack worth anything.** Before it, a shield
/// covered an arc or it did not, and covering was instantaneous -- so a policy
/// that read a telegraph gained nothing a policy that flicked its guard across
/// at the last moment did not also get. Measured over 240 seeds, every value of
/// the duellist's `read_ahead` gene above its floor made it strictly worse, and
/// that is a strange thing for a game built around a telegraph to be true of:
/// the whole windup existed to be answered, and answering it was a losing move.
///
/// A guard has mass, and a guard arriving with the blow is barely a guard. Now
/// the telegraph buys something real -- time to *finish* moving -- and reading
/// it late is worse than not reading it at all, which is a much better shape for
/// a skill to have than a free lookup.
pub const BLOCK_LEAK_SNAP: Fx = Fx::from_ratio(45, 100);

/// Ticks a shield must be settled to be fully braced.
///
/// Set against the telegraphs it has to be answered inside: a Brute announces
/// for 33 ticks and a Warrior for 14, so a fighter that commits its guard when
/// the shoulder moves is planted by the time a heavy blow lands and is halfway
/// there against a Warrior's. Answering a Scout's seven-tick declaration is
/// mostly hopeless, which is the correct answer for that archetype.
pub const BRACE_TICKS: u16 = 18;

/// Angular speed, raw units per tick, below which a hand counts as settled
/// rather than travelling.
///
/// Loose enough that a guard tracking a walking enemy stays braced -- being
/// unable to hold a guard on someone who is merely moving would make the whole
/// mechanic a flat nerf to blocking -- and far below the thousand-odd a hand
/// runs at while being swung to a new bearing.
pub const BRACE_SPIN: Fx = Fx::from_int(400);

/// How much of a blow gets past a shield braced for `settled` ticks.
pub fn block_leak(settled: u16) -> Fx {
    let braced = Fx::from_ratio(settled.min(BRACE_TICKS) as i32, BRACE_TICKS as i32);
    BLOCK_LEAK_SNAP + (BLOCK_LEAK_BRACED - BLOCK_LEAK_SNAP) * braced
}

/// Fraction of its spin an attacker keeps, reversed, when a shield stops it.
/// This plus the torque cap *is* the punish window.
pub const BLOCK_REBOUND: Fx = Fx::from_ratio(35, 100);

/// Fraction of a blocked blow's speed that shoves the blocking shield hand.
/// A shield stops a blow; it does not stop it for free.
pub const BLOCK_SHIELD_KNOCK: Fx = Fx::from_ratio(40, 100);

/// Restitution on a blade-on-blade crossing. Higher than [`BLOCK_REBOUND`]:
/// meeting steel with steel throws a swing further off line than catching it on
/// a braced shield does.
pub const PARRY_REBOUND: Fx = Fx::from_ratio(60, 100);

// ------------------------------------------------------------- the attack

/// How far back from the line a blade cocks before a cut, raw angle units
/// (67.5 degrees).
///
/// The whole telegraph is here: a blade held at the line is ambiguous, and a
/// blade pulled a clear two-thirds of a right angle off it is a declaration.
/// It also sets how much runway the cut has to build speed on, so it is the
/// same knob twice -- shorten it and attacks become both harder to read and
/// weaker, which is the wrong trade in both directions at once.
pub const WINDUP_ARC: i32 = 12_288;

/// How far past the line a cut drives before it is spent (78.75 degrees).
///
/// Larger than [`WINDUP_ARC`] on purpose. The blade must still be travelling
/// when it crosses the line -- a cut that decelerates onto its target arrives
/// at rest and does nothing, which is the trap `hand::tests` has pinned since
/// the first version of this model. Aiming the far end past the target is what
/// keeps the crossing fast.
pub const FOLLOW_THROUGH: i32 = 14_336;

/// How far past the line a cut must travel before it counts as spent and the
/// hand starts recovering. Three quarters of the follow-through, so a cut ends
/// on its own arc rather than waiting out [`STRIKE_TIMEOUT`].
pub const STRIKE_SPENT_ARC: i32 = FOLLOW_THROUGH * 3 / 4;

/// Absolute ceiling on how long a cut may stay live, whatever the weapon.
///
/// The backstop for a swing that cannot finish its arc: a blade jammed against
/// a body it cannot push through, or one whose spin was reversed by a parry
/// into an angle it will never reach. Without it such a hand stays live
/// forever, which is the windmill coming back through the side door.
///
/// It used to be 45 for everybody, and that was a bug wearing a constant's
/// clothes. A Brute's arm accelerates at 20.6 raw units per tick squared once
/// [`REACH_DRAG`] has taken its cut, and the cut has 23,040 units of arc to
/// cover, so it needs about sixty ticks: **every heavy attack in the game was
/// being cut off eight degrees short of its own line**, mid-acceleration, having
/// never crossed the point it was aimed at. A Brute could only hurt what it met
/// on the *approach* side of its swing, which is why damage taken barely varied
/// with skill and why the archetype the whole telegraph model was built around
/// was the easiest thing in the game to stand in front of.
///
/// The limit is [`strike_ticks`] now, computed per weapon, and this is only the
/// stop of last resort.
pub const STRIKE_TIMEOUT: u16 = 120;

/// How long a cut with this weapon stays live: long enough to carry the blade
/// through its whole arc, and no longer.
///
/// Derived from the same physics [`crate::Hand::track`] runs -- accelerate at
/// the torque cap, subject to a top speed -- rather than picked, because the
/// four weapons differ by a factor of five in how fast they can move a blade and
/// one number cannot be right for all of them. A cut must reach
/// [`STRIKE_SPENT_ARC`] past its line, from [`WINDUP_ARC`] behind it, at the
/// torque an *extended* blade has.
///
/// [`STRIKE_SLACK`] covers what the closed form leaves out: a hand entering the
/// strike still carries the windup's momentum the wrong way and has to pay it
/// off first.
pub fn strike_ticks(weapon: Weapon, agility: Fx) -> u16 {
    let arc = Fx::from_int(WINDUP_ARC + STRIKE_SPENT_ARC);
    let floor = Fx::from_ratio(1, 100);
    let accel = (weapon.torque * agility * (Fx::ONE - REACH_DRAG)).max(floor);
    let cap = (weapon.max_spin * agility).max(floor);

    let to_cap = cap / accel;
    // `cap * cap / (2 * accel)`, grouped so the intermediate stays inside `Fx`.
    // A weapon quick enough to overflow it is one whose cap never binds, and
    // saturating high picks the un-capped branch below, which is that answer.
    let while_accelerating = cap * to_cap * Fx::HALF;
    let ticks = if arc <= while_accelerating {
        fx::sqrt_product(arc / accel * Fx::TWO, Fx::ONE)
    } else {
        to_cap + (arc - while_accelerating) / cap
    };
    (ticks * STRIKE_SLACK).round_int().clamp(1, STRIKE_TIMEOUT as i32) as u16
}

/// Margin on [`strike_ticks`], for everything the closed form leaves out.
///
/// A hand does not enter the strike at rest. It arrives at the cocked bearing
/// still travelling *away* from the line, overshoots it, and has to pay that
/// momentum off before it covers a single unit of useful arc -- and the blade is
/// extending as it goes, so [`REACH_DRAG`] is taking a growing bite out of the
/// torque the whole time.
///
/// Measured rather than guessed, because guessing it is what produced the bug in
/// the first place. Ticks each archetype actually needs against what the closed
/// form predicts:
///
/// | archetype | predicted | needs | ratio |
/// |-----------|-----------|-------|-------|
/// | brute     |        49 |    64 |  1.30 |
/// | warrior   |        22 |    30 |  1.34 |
/// | scout     |        15 |    23 |  1.49 |
/// | skitterer |        17 |    28 |  1.66 |
///
/// The *lightest* weapons need the most slack, which is the opposite of the
/// intuition and worth keeping: a quick hand overshoots its windup further
/// relative to the arc it then has to cover. 1.90 clears the worst case with
/// room for the agility range to move underneath it, and
/// `every_weapon_can_finish_the_swing_it_starts` sweeps all four to keep it
/// honest.
pub const STRIKE_SLACK: Fx = Fx::from_ratio(19, 10);

/// Extension a blade is held at between attacks.
///
/// Above [`MIN_STRIKE_REACH`], so a guarding blade is still a *segment* and can
/// be crossed -- catching a cut on your own blade is a real answer, and it is
/// the one available to a fighter whose shield is on the wrong side. It deals
/// no damage regardless, because damage is gated on the strike phase and not on
/// extension.
pub const GUARD_REACH: Fx = Fx::from_ratio(30, 100);

/// Extension a blade is drawn back to during a windup.
///
/// Halfway out: far enough that a cocked blade is unmistakable at a glance and
/// has somewhere to be caught, short enough that [`REACH_DRAG`] does not stop
/// the hand from getting there inside the telegraph.
pub const WINDUP_REACH: Fx = Fx::from_ratio(50, 100);

/// Extra recovery ticks when a cut is stopped by a shield. This plus the
/// weapon's own recovery *is* the reward for blocking.
pub const BLOCK_RECOVERY: u16 = 14;

/// Extra recovery ticks when two blades cross.
pub const PARRY_RECOVERY: u16 = 12;

/// Extra recovery ticks for a cut that finishes its arc having touched nothing
/// at all. **The price of a miss, and the reward for a dodge.**
///
/// Larger than either of the above, and it should be: a blow stopped by a
/// shield at least arrived somewhere and spent its speed on something, while a
/// cut thrown at empty air has to be hauled back from the full end of its
/// follow-through by a fighter who is now badly out of shape.
///
/// This is the other half of what stepping off a line is worth. Blocking was
/// already paid for -- [`BLOCK_RECOVERY`] opens a window -- and evading was not,
/// which is most of why the duellist's `evasion` gene evolved to zero while
/// `guard` went to nearly two. A cut you are not there for should cost more than
/// one you caught, not less.
pub const WHIFF_RECOVERY: u16 = 20;

/// Damage multiplier on a blow that lands while the target's sword hand is
/// still recovering. **The punish.**
///
/// The one edit here that gives *offence* a skill gradient. Damage dealt was
/// flat across every level of play measured -- a Brute is large, slow and never
/// steps aside, so landing a blow on one was never the hard part and timing was
/// worth nothing. A fighter that waits for the recovery now out-damages one that
/// swings on every beat, rather than merely out-surviving it.
///
/// Physical rather than arbitrary: a body committed to a spent swing is turned
/// into the blow and cannot give ground with it. The shield still covers what it
/// covers, so a punish is not a guaranteed exchange -- it is the *best* one
/// available, which is what a read should buy.
pub const RECOVERY_EXPOSURE: Fx = Fx::from_ratio(160, 100);

/// How long a phase lasts for a wielder of the given agility multiplier.
///
/// Agility already scales torque, top speed and extension, so a nimble fighter
/// swings a faster blade. Scaling the phases by it as well is what makes the
/// stat mean *cadence* rather than only speed: a quick Brute does not merely
/// move its axe faster, it spends less time announcing the blow and less time
/// picking it back up. Floored at one tick, because a zero-length phase would
/// let an attack skip its own telegraph.
pub fn phase_ticks(base: u16, agility: Fx) -> u16 {
    if base == 0 {
        return 0;
    }
    let scaled = Fx::from_int(base as i32) / agility.max(Fx::from_ratio(1, 4));
    scaled.round_int().clamp(1, 600) as u16
}

/// Combined spin, raw angle units per tick, below which two crossed blades are
/// merely touching rather than parrying. Without a floor, a pair that happens to
/// line up reports a parry on every tick it stays lined up.
pub const PARRY_MIN_SPIN: Fx = Fx::from_int(200);

/// Extension below which a blade is not a hitbox at all. Makes "tucked" mean
/// something mechanically rather than only visually, and doubles as the early
/// out that keeps the geometry off the hot path.
pub const MIN_STRIKE_REACH: Fx = Fx::from_ratio(15, 100);

/// Extension below which a shield covers nothing.
pub const MIN_BLOCK_REACH: Fx = Fx::from_ratio(20, 100);

/// How much of a hand's torque a full extension costs it: a committed blade
/// corrects at `1 - REACH_DRAG` of a tucked one. This is what makes "tuck to
/// reposition, extend to strike" a decision instead of flavour text.
pub const REACH_DRAG: Fx = Fx::from_ratio(45, 100);

/// Proportional error in a fighter's read of *someone else's* dead zone, per
/// unit of [`Stats::perception_noise`].
///
/// At `perception 0` that is a standard deviation of about 45% of the true
/// figure -- a Brute's 0.85 read as anything from half a unit to one and a
/// quarter -- and exact by `perception 15`. Set where it is because the band
/// worth finding is narrow: a Warrior's own blade needs 1.32 units to bite and
/// a Brute's stops biting at 1.30, so the two nearly coincide, and an error of a
/// tenth of a unit is the difference between crowding a heavy weapon and
/// standing in the worst place on its arc.
pub const DEAD_ZONE_JUDGEMENT: Fx = Fx::from_ratio(20, 100);

/// Intellect at or below which [`Stats::decision_period`] degrades faster.
///
/// Set at the dimmest archetype in the game (a Brute), so the steep stretch is
/// entirely below anything already balanced.
pub const DIM_INTELLECT: u8 = 2;

/// Perception at or below which [`Stats::perception_noise`] degrades faster.
/// Likewise the dimmest eye in the roster.
pub const DIM_PERCEPTION: u8 = 3;

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

    /// **The intellect stat.** Ticks between decisions, floored at 1: from 30
    /// at `intellect 0` -- two decisions a second -- to 1 at `intellect 19`,
    /// which is a character that re-plans on every frame.
    ///
    /// Linear above [`DIM_INTELLECT`] and steeper below it, and the kink is the
    /// point rather than an artefact. The straight line `20 - intellect` gave
    /// the dimmest character in the game three decisions a second, which is
    /// plenty: measured over 240 seeds, a Warrior at `intellect 0` and
    /// `perception 0` still beat a Brute two fights in three under the *naive*
    /// policy. A difficulty range whose bottom rung wins is not a range.
    ///
    /// The extension sits entirely below the dimmest archetype, so it is new
    /// headroom rather than a rebalance: every unit in [`crate::UnitKind`] keeps
    /// the cadence it was tuned with, and what changes is only what a character
    /// *built* below them can be.
    pub const fn decision_period(self) -> u16 {
        let period = if self.intellect >= DIM_INTELLECT {
            20 - self.intellect as i32
        } else {
            // Continuous at the join -- `20 - DIM_INTELLECT` is 18 -- and three
            // times the slope below it: 24 at intellect 1, 30 at intellect 0.
            18 + 6 * (DIM_INTELLECT as i32 - self.intellect as i32)
        };
        clamp_i32(period, 1, 120) as u16
    }

    /// `6.0 + 0.6 * perception` world units.
    pub const fn sight_range(self) -> Fx {
        Fx::from_ratio(60 + 6 * self.perception as i32, 10)
    }

    /// Standard deviation of the positional error applied to every contact in
    /// an observation. `2.25` units at `perception 0`, clean by `perception 15`.
    ///
    /// Kinked at [`DIM_PERCEPTION`] for the same reason
    /// [`Stats::decision_period`] is, and it is the more effective half of the
    /// pair. Reaction speed degrades into *disengagement* -- a character too
    /// slow to hold station drifts out of the fight and the run times out --
    /// while blur degrades into losing, which is what a difficulty setting
    /// wants. Measured, a duelling Warrior against a Brute falls from 65% at
    /// noise 1.5 to 32% at 2.5, along a smooth curve with no cliff in it.
    ///
    /// Like the intellect extension this sits below every archetype (a Brute's
    /// `perception 3` is the dimmest eye in the game), so nothing already tuned
    /// moves.
    pub const fn perception_noise(self) -> Fx {
        if self.perception >= DIM_PERCEPTION {
            Fx::from_ratio(clamp_i32(15 - self.perception as i32, 0, 15), 10)
        } else {
            // Continuous at the join -- `(15 - DIM_PERCEPTION) / 10` is 1.20 --
            // and three and a half times the slope below it.
            Fx::from_ratio(
                120 + 35 * (DIM_PERCEPTION as i32 - self.perception as i32),
                100,
            )
        }
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
        assert_eq!(Stats::new(0, 0, 0, 0, 0).decision_period(), 30);
        assert_eq!(Stats::new(0, 0, 19, 0, 0).decision_period(), 1);
        assert_eq!(Stats::new(0, 0, 200, 0, 0).decision_period(), 1);
    }

    #[test]
    fn the_dim_end_extends_below_every_archetype_without_moving_one() {
        // The whole point of the kink. A difficulty ladder needs a bottom rung
        // that loses, and the straight line did not have one -- but buying that
        // range by making the existing roster dumber would have re-tuned every
        // fight in the repository. The join sits at the dimmest archetype, so
        // the steep stretch is reachable only by a character built below them.
        for kind in crate::UnitKind::ALL {
            let stats = kind.base_stats();
            assert!(
                stats.intellect >= DIM_INTELLECT,
                "{} sits inside the steep stretch of the intellect curve",
                kind.name()
            );
            assert!(
                stats.perception >= DIM_PERCEPTION,
                "{} sits inside the steep stretch of the perception curve",
                kind.name()
            );
            assert_eq!(
                stats.decision_period(),
                (20 - stats.intellect as i32).clamp(1, 120) as u16,
                "{} changed cadence",
                kind.name()
            );
            assert_eq!(
                stats.perception_noise(),
                Fx::from_ratio((15 - stats.perception as i32).clamp(0, 15), 10),
                "{} changed acuity",
                kind.name()
            );
        }

        // Continuous at the join, so neither curve has a step in it.
        let at_join = Stats::new(0, 0, DIM_INTELLECT, DIM_PERCEPTION, 0);
        assert_eq!(at_join.decision_period(), 18);
        assert_eq!(at_join.perception_noise(), Fx::from_ratio(12, 10));

        // ...and genuinely wider below it.
        let below = Stats::new(0, 0, 0, 0, 0);
        assert_eq!(below.decision_period(), 30);
        assert_eq!(below.perception_noise(), Fx::from_ratio(225, 100));
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
        assert_eq!(dim.perception_noise(), Fx::from_ratio(225, 100));
    }

    #[test]
    fn derived_values_never_go_degenerate() {
        for v in [0u8, 1, 7, 20, 100, 255] {
            let s = Stats::new(v, v, v, v, v);
            assert!(s.max_hp() > Fx::ZERO);
            assert!(s.damage() > Fx::ZERO);
            assert!(s.move_speed() > Fx::ZERO);
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
