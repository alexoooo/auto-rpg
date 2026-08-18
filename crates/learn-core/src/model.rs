//! What the learned policy reads, what it is allowed to say, and the forty-one
//! numbers and two matrices in between.
//!
//! Three contracts live here and each is versioned separately, because they
//! break for different reasons:
//!
//! * [`LEARN_FEATURE_LAYOUT_VERSION`] -- the input slice. Append-only.
//! * [`LEARN_ACTION_LAYOUT_VERSION`] -- the five discrete heads and every entry
//!   in them. Append-only.
//! * [`ModelShape`] -- the layer widths. Not versioned by a number because it
//!   *is* a number, and [`crate::Checkpoint`] compares it directly.
//!
//! # The 954-element vector is not the input, and that is the main decision
//!
//! [`sim::FEATURE_COUNT`] is 954 and [`sim::Observation::write_features`]
//! writes all of it. Handing that to a 64-unit network is 62,290 weights, and
//! the optimizer in `crates/learn` is a `(mu + lambda)` evolution strategy with
//! no gradient at all -- it moves a population of twenty-odd points around by
//! Gaussian perturbation, and 60,000 dimensions is not a space twenty points
//! explore. For scale: the genome optimizer that shipped beside this one sized
//! its whole world at 24 named weights (`policy::MAX_GENOME_LEN`, deleted with
//! the legacy policies in embodied session 10).
//!
//! So the slice below is hand-picked, and being hand-picked is a *claim*: that
//! a fighter needs the bearing and range of the thing in front of it, the
//! height and travel of what that thing is holding, the state of its own arms,
//! and very little else. If the probe fails, "the feature slice was too narrow"
//! is one of the two or three explanations that has to be ruled out before
//! anything is concluded about learning, and it is written down here so it can
//! be.
//!
//! **Everything is relative to the subject's own body and yaw.** Not a
//! normalisation detail: `lab articulated --mirrored` reflects the fixture
//! across `y = 8`, and a policy reading world coordinates would see the mirror
//! as a completely different problem and have to learn it twice. In body frame
//! the two orientations are the same fight, which is what makes the mirrored
//! corpus a doubling of the sample rather than a doubling of the task.
//!
//! # Factored heads, not one flat table
//!
//! The cross product of the five heads is 540 actions. An evolution strategy
//! choosing among 540 unstructured alternatives has to discover independently
//! that "advance while committing high" and "advance while committing low"
//! share a footwork decision; five argmaxes over five small heads have that
//! structure for free, at the cost of being unable to express a preference that
//! genuinely couples two heads. That trade is the right way round here, because
//! the coupling this experiment is about -- guard height against observed
//! threat -- lives inside a single head.
//!
//! # Every entry comes from the script's vocabulary
//!
//! The reach, effort, speed and turn constants below are the ones
//! `policy::articulated_script` already uses, so that a learned policy and the
//! scripted baseline are comparable as *choices* rather than as two different
//! bodies. They are re-declared here rather than imported because the script
//! keeps them private, and the copies are pinned against the script's own
//! output by `the_action_table_is_the_scripts_own_vocabulary` -- so a drift on
//! either side fails a test instead of quietly making the comparison unfair.

use fx::{closest_point_on_segment, Angle, Fx, Rng, Vec2, Vec3};
use policy::{
    ArticulatedPolicy, StrikePlanner, TacticalContextV1, TacticalIntentV1, CYCLE_TICKS,
    EIGHTH_TURN, TACTICAL_INTENT_COUNT,
};
use sim::{
    ArmTarget, ArticulatedCommandV1, ArticulatedObservation, BodyPart, CombatHeight, GripRequest,
    ReleaseRequest,
    Intent, SegmentPose,
};

// ------------------------------------------------------------ the input slice

/// Bumped whenever [`write_features`] changes shape or meaning.
///
/// Version 1 is the first: forty-one scalars, described block by block at
/// [`write_features`]. Append-only on the same argument
/// [`sim::FEATURE_LAYOUT_VERSION`] makes -- a checkpoint is frozen against this
/// number, and a slot inserted rather than appended repoints every weight above
/// it at a quantity it was never fitted to.
pub const LEARN_FEATURE_LAYOUT_VERSION: u32 = 1;

/// Width of the slice [`write_features`] writes.
pub const LEARN_FEATURE_COUNT: usize = 41;

/// The tactical model is append-only over the shipped 41-column slice.
pub const LEARN_V2_FEATURE_LAYOUT_VERSION: u32 = 2;
pub const LEARN_V2_FEATURE_COUNT: usize = 59;

/// Hidden units, fixed by v2-19.
pub const HIDDEN_UNITS: usize = 64;

/// World units that normalise to `1` in a distance feature.
///
/// A Fighter's sight range is 9.6 and the fixture spawns the two bodies 10.8
/// apart, so eight puts an opponent at the edge of vision a little above one
/// and everything inside measure well under it. The point of the divisor is
/// that "in measure" and "across the room" are far apart in the input, not that
/// the input is bounded.
const RANGE_SCALE: f32 = 8.0;

/// Height that normalises to `1`.
///
/// `fighter_anatomy`'s `standing_height`, so `1` is the top of a head and the
/// three [`CombatHeight`] settings land at 0.25, 0.5 and 0.75. A height feature
/// is directly comparable with the setting a head could choose, which is the
/// whole content of "guard where the blade is".
const HEIGHT_SCALE: f32 = 1.8;

/// World units per tick that normalise to `1` in a body-speed feature.
///
/// The same 0.25 [`sim::Observation::write_features`] uses, written as the same
/// number for the same reason: it is comfortably above any archetype's walk, so
/// what approaches the top of the range is a body that has been shoved.
const SPEED_SCALE: f32 = 0.25;

/// World units per tick that normalise to `1` in a hand-speed feature.
///
/// `ARM_LINEAR_MAX_SPEED_RAW` is 1,638 raw, which is exactly this, so a hand
/// travelling flat out reads one before agility scales it down. A hand is an
/// order of magnitude slower than a shoved body and sharing `SPEED_SCALE` would
/// bury the entire signal in the bottom tenth of the range.
const HAND_SPEED_SCALE: f32 = 0.025;

/// Ticks that normalise to `1` in the elapsed-time feature: the fixture's
/// `max_ticks`, so the feature is "how much of the fight is gone".
///
/// A hand copy of `Scenario::articulated_duel().max_ticks`, which cannot be
/// read here -- the number has to be a compile-time constant and the scenario
/// builds a `Dungeon`. `the_fight_clock_is_the_fixtures_own` pins the two
/// together, because a divisor that silently stopped meaning "the whole fight"
/// would make this column a slow ramp to nowhere and nothing would fail.
const FIGHT_TICKS: f32 = 3600.0;

/// The guard rail on every feature.
///
/// Not a normalisation -- the divisors above do that -- but a bound on what a
/// pathological pose can hand the first layer. A body thrown across the arena
/// by a blow it did not survive should saturate a range feature rather than
/// multiply every weight in a column by forty. Four rather than one so that
/// ordinary play never touches it and the clamp stays a guard, which is the
/// distinction `sim::obs`'s `SPIN_SCALE` comment draws about its own.
const FEATURE_CLAMP: f32 = 4.0;

/// Session 02's arena corpus spans the shipped sight distance; the same eight
/// world-unit scale as the V1 opponent range keeps a region in measure below one.
const TACTICAL_REGION_RANGE_SCALE: f32 = 8.0;
/// Session 02's committed sweeps are bounded by the controller's 32-tick threat
/// horizon. A crossing at the edge of that horizon therefore reads one.
const TACTICAL_CROSSING_TICKS_SCALE: f32 = 32.0;
/// The calibrated arm limit used by the competence corpus. Closing faster than
/// one full-speed hand is exceptional but remains representable under the clamp.
const TACTICAL_CLOSING_SPEED_SCALE: f32 = 0.025;

/// One decision's worth of memory, so two features can be rates.
///
/// **The only state the policy carries, and it is why `reset` is not a no-op.**
/// A single observation says where an opponent's weapon hand *is*; whether it
/// is on its way up or on its way down is the difference between a blow that
/// has been thrown and one that has landed, and no column of
/// [`ArticulatedObservation`] carries it. The alternative -- inferring travel
/// from the pose -- is exactly the reverse-engineering
/// [`sim::Contact::limb_line`] exists to spare a policy one model down.
///
/// Held in world units rather than in feature units so that the divisor above
/// can change without changing what was remembered.
///
/// **One instance is one body.** `learn`'s `probe::rollout` gives each side its
/// own policy, which is what this assumes; [`policy::run_articulated`] drives one
/// instance across both, and under that harness the memory of the Fighter's
/// tick and the Brute's tick interleave, so the rate columns read a difference
/// between two different bodies' blades. The `tick <= self.tick` guard turns
/// the second decider of each tick into a pair of zeros rather than a wrong
/// number, which makes it harmless where it happens (the boundary tests, which
/// assert nothing about rates) and wrong anywhere it mattered. If a learned
/// policy is ever driven through `run_articulated` for a measurement, give it
/// two instances.
#[derive(Clone, Copy, PartialEq, Debug, Default)]
pub struct FeatureMemory {
    primed: bool,
    tick: u32,
    hilt_height: f32,
    tip_range: f32,
}

impl FeatureMemory {
    pub const EMPTY: FeatureMemory = FeatureMemory {
        primed: false,
        tick: 0,
        hilt_height: 0.0,
        tip_range: 0.0,
    };

    /// The rate features, and `(0, 0)` on the first decision of a run.
    ///
    /// Zero and not "unknown", because there is no unknown in a fixed-width
    /// vector: the honest reading of the first tick is that nothing has been
    /// seen to move yet, which is what a fighter who has just opened its eyes
    /// also knows.
    fn rates(&self, tick: u32, hilt_height: f32, tip_range: f32) -> (f32, f32) {
        if !self.primed || tick <= self.tick {
            return (0.0, 0.0);
        }
        let dt = (tick - self.tick) as f32;
        (
            (hilt_height - self.hilt_height) / dt,
            (tip_range - self.tip_range) / dt,
        )
    }
}

#[inline]
fn clamped(value: f32) -> f32 {
    value.clamp(-FEATURE_CLAMP, FEATURE_CLAMP)
}

/// A world-space offset rotated into the subject's own frame: forward along its
/// yaw, then left of it.
#[inline]
fn body_frame(cos: f32, sin: f32, dx: f32, dy: f32) -> (f32, f32) {
    (dx * cos + dy * sin, -dx * sin + dy * cos)
}

/// The blade a defender should be watching: the held segment whose **tip** is
/// nearest the subject's own body.
///
/// Nearest tip rather than nearest hilt, because the tip is the end that
/// arrives. On a two-weapon opponent the choice matters and on this roster it
/// never fires -- a Fighter's sword fills the right slot and a Brute's club
/// fills the right slot -- so the rule is written for the case it does not yet
/// meet, and ties go to the lower index so that two identical blades resolve
/// the same way twice.
fn live_blade(opponent: &sim::ObservedOpponent, at: Vec3) -> Option<SegmentPose> {
    let mut best: Option<(Fx, SegmentPose)> = None;
    for pose in opponent.weapons.into_iter().flatten() {
        let reach = Vec2::new(pose.tip.x - at.x, pose.tip.y - at.y).length();
        if best.is_none_or(|(closest, _)| reach < closest) {
            best = Some((reach, pose));
        }
    }
    best.map(|(_, pose)| pose)
}

/// Writes the forty-one scalars, in the order the layout version freezes.
///
/// Returns the memory the next call should be handed. Splitting it out rather
/// than taking `&mut FeatureMemory` keeps this a function of its inputs, which
/// is what lets a test assert that the same observation twice writes the same
/// slice.
///
/// **Every feature says what it is and why a fighter would care.** The blocks:
///
/// | index | block |
/// |---|---|
/// | 0..4 | is anything in sight, and where the fight is in time |
/// | 4..13 | the subject's own condition and travel |
/// | 13..21 | the subject's two hands |
/// | 21..30 | the nearest opponent's body |
/// | 30..39 | the blade that opponent is carrying |
/// | 39..41 | the plate it is carrying |
///
/// # What is deliberately left out
///
/// * **Opponents past the first.** `ArticulatedObservation` carries six rows and
///   the fixture fills one. Six rows would be 54 more columns describing a
///   melee that v2-19 does not run; the layout is append-only, so a session that
///   needs them can have them.
/// * **Every capsule of the opponent's silhouette.** The observation publishes
///   five [`sim::RegionVolume`]s per opponent -- 45 numbers -- and they are
///   almost entirely a rigid function of the body position and yaw, which are
///   already here. What they add that position does not is *which region is
///   exposed*, and the action head that would use it does not exist: this
///   policy chooses a weapon height, not a target region.
/// * **The opponent's health.** Not an omission -- there is no such column.
///   `ObservedOpponent` publishes geometry, identity and severance and nothing
///   about integrity, so feature 29 (how much of it has come off) is the only
///   damage signal a fighter has about the other body, and it is a much coarser
///   one than the plan that asked for "the opponent's per-region integrity"
///   assumed.
/// * **Own wound fractions.** Five more columns for a quantity whose whole
///   effect on the fight is already summarised by `blood_fraction` (feature 4)
///   and the integrity block beside it.
/// * **Own arm equipment ids.** Categorical, exact, and constant for the whole
///   of a fixture that never swaps grips. A one-hot over a constant is a
///   column of ones.
///
/// # Which of these are dead on the shipped fixture
///
/// Worth writing down rather than discovering later, because "the slice was too
/// narrow" is one of the explanations a failed probe has to rule out and a dead
/// column is narrower than it looks. `Scenario::articulated_duel` is a Fighter
/// against a Brute and the probe always puts the candidate on the Fighter, so:
///
/// * **Features 39 and 40 are identically zero, always.** The Brute carries no
///   plate, so `ObservedShield::BLANK` is the only shield this policy ever
///   observes. They are kept because the layout is append-only and the day
///   anything gives the Brute a shield -- or a session runs Fighter against
///   Fighter -- they become the columns a weapon-height decision is made
///   against. `the_opponent_shield_columns_are_dead_on_the_shipped_fixture`
///   asserts the fact so that it stops being true loudly.
/// * Features 4, 5, 6..11 and 29 are constant *within* most fights, because
///   nothing damages either body enough to move them. They are not structurally
///   dead: the fights that do settle early move all of them.
/// * Features 24 and 25 are near-constant, because both bodies command
///   `body_yaw: toward` in eleven phases of twelve. They carry an eighth-turn
///   wobble for thirty ticks in three hundred and sixty.
///
/// So a typical fight shows the network about thirty live columns out of
/// forty-one.
pub fn write_features(
    obs: &ArticulatedObservation,
    memory: FeatureMemory,
    out: &mut [f32; LEARN_FEATURE_COUNT],
) -> FeatureMemory {
    out.fill(0.0);

    let yaw_cos = obs.body_yaw.cos().to_f32();
    let yaw_sin = obs.body_yaw.sin().to_f32();
    let origin = obs.body_position;
    let opponent = obs.opponents().first();

    // ---- 0..4: is there a fight, and how far into it are we
    //
    // 0: anything in sight at all. Without it, "the opponent is exactly on top
    // of me" and "the rows are blank" are the same thirty-six zeros, and those
    // are the two situations that most need different answers.
    out[0] = if opponent.is_some() { 1.0 } else { 0.0 };
    // 1, 2: where the fight is in the scripted opponent's 360-tick cycle, as a
    // (cos, sin) pair. A pair and not a number for the reason `sim::obs` gives
    // about every angle it writes: a raw phase is discontinuous at the wrap, and
    // tick 359 is not maximally unlike tick 0. Worth reading because the
    // baseline this policy is measured against *is* a clock -- its chamber
    // arrives at the same offset every cycle -- so a learned policy that can
    // find the phase can anticipate a blow the observation has not shown it yet.
    // Read through `Angle` rather than through `f32::cos`, so no libm call
    // enters the inference path; see `Model::forward`.
    let phase = Angle::from_raw(
        (((obs.tick % CYCLE_TICKS) as u64 * 65_536) / CYCLE_TICKS as u64) as u16,
    );
    out[1] = phase.cos().to_f32();
    out[2] = phase.sin().to_f32();
    // 3: how much of the clock is gone. The fixture is scored on points at the
    // limit, so "there is time to be patient" and "this is the last exchange"
    // are different decisions and nothing else in the slice separates them.
    out[3] = clamped(obs.tick as f32 / FIGHT_TICKS);

    // ---- 4..13: the subject's own condition
    //
    // 4: blood lost. The one number that says the fight is being lost slowly.
    out[4] = clamped(obs.blood_fraction.to_f32());
    // 5: shock. Multiplies into movement and turning authority, so it is how
    // much of a commanded step actually happens.
    out[5] = clamped(obs.shock.to_f32());
    // 6..11: structural integrity per region, in `BodyPart` order -- head,
    // torso, left arm, right arm, legs. A fighter whose right arm is going
    // should stop swinging with it, and a fighter whose legs are going cannot
    // withdraw out of measure however much it would like to.
    for part in 0..BodyPart::COUNT {
        out[6 + part] = clamped(obs.integrity_fraction[part].to_f32());
    }
    // 11, 12: own travel, in body frame. Momentum is real since v2-7 and a
    // commanded step is not a step -- what a fighter can afford to do next
    // depends on where it is already going.
    let (own_forward, own_lateral) = body_frame(
        yaw_cos,
        yaw_sin,
        obs.body_velocity.x.to_f32(),
        obs.body_velocity.y.to_f32(),
    );
    out[11] = clamped(own_forward / SPEED_SCALE);
    out[12] = clamped(own_lateral / SPEED_SCALE);

    // ---- 13..21: the subject's two hands, four columns each, left then right
    //
    // Position in body frame rather than bearing-and-reach, because the two
    // decisions a hand is for are "is it out in front of me" and "how high is
    // it", and forward/lateral/height answers both without an angle in it.
    // Fatigue rides along because `integrate_arm` scales acceleration by
    // effort against it: a tired arm answers a commit slower than a fresh one,
    // and nothing else in the slice says so.
    for (arm, at) in obs.arms.iter().zip([13usize, 17]) {
        let (forward, lateral) = body_frame(
            yaw_cos,
            yaw_sin,
            (arm.hand.x - origin.x).to_f32(),
            (arm.hand.y - origin.y).to_f32(),
        );
        out[at] = clamped(forward / HEIGHT_SCALE);
        out[at + 1] = clamped(lateral / HEIGHT_SCALE);
        out[at + 2] = clamped((arm.hand.z - origin.z).to_f32() / HEIGHT_SCALE);
        out[at + 3] = clamped(arm.fatigue.to_f32());
    }

    let mut hilt_height = memory.hilt_height;
    let mut tip_range = memory.tip_range;

    if let Some(other) = opponent {
        // ---- 21..30: the nearest opponent's body
        let offset = Vec2::new(
            other.body_position.x - origin.x,
            other.body_position.y - origin.y,
        );
        // 21: range. The single number a spacing decision is about.
        out[21] = clamped(offset.length().to_f32() / RANGE_SCALE);
        // 22, 23: which way it is, relative to the way this body is already
        // facing. Relative and not absolute so that the mirrored fixture is the
        // same problem; see the module header.
        let bearing = offset.angle() - obs.body_yaw;
        out[22] = bearing.cos().to_f32();
        out[23] = bearing.sin().to_f32();
        // 24, 25: which way *it* is facing, relative to this body. A fighter
        // turned away is a fighter whose blade has to travel before it arrives.
        let facing = other.body_yaw - obs.body_yaw;
        out[24] = facing.cos().to_f32();
        out[25] = facing.sin().to_f32();
        // 26, 27: its travel in this body's frame. Positive forward is an
        // opponent coming at you, which is the sign that decides whether a
        // withdrawal opens the distance or merely walks backwards.
        let (closing, drifting) = body_frame(
            yaw_cos,
            yaw_sin,
            other.body_velocity.x.to_f32(),
            other.body_velocity.y.to_f32(),
        );
        out[26] = clamped(closing / SPEED_SCALE);
        out[27] = clamped(drifting / SPEED_SCALE);
        // 28: the sim's own one-tick imminence signal, already in `[0,1]`.
        out[28] = clamped(other.contact_timing.to_f32());
        // 29: how much of that body has come off, as a fraction of its five
        // regions. The only damage signal about an opponent that the
        // observation carries at all.
        out[29] = clamped(other.severed_mask.count_ones() as f32 / BodyPart::COUNT as f32);

        // ---- 30..39: the blade that is coming
        if let Some(blade) = live_blade(other, origin) {
            // 30: there is one. A disarmed opponent writes zeros below and this
            // is what tells the difference between that and a blade at the
            // origin.
            out[30] = 1.0;
            let (tip_forward, tip_lateral) = body_frame(
                yaw_cos,
                yaw_sin,
                (blade.tip.x - origin.x).to_f32(),
                (blade.tip.y - origin.y).to_f32(),
            );
            // 31..34: where the point is. The thing that has to be somewhere
            // else in a few ticks.
            out[31] = clamped(tip_forward / RANGE_SCALE);
            out[32] = clamped(tip_lateral / RANGE_SCALE);
            out[33] = clamped((blade.tip.z - origin.z).to_f32() / HEIGHT_SCALE);
            let (hilt_forward, hilt_lateral) = body_frame(
                yaw_cos,
                yaw_sin,
                (blade.hilt.x - origin.x).to_f32(),
                (blade.hilt.y - origin.y).to_f32(),
            );
            // 34..37: where the hand is. Its distance from this body is the
            // magnitude of the pair, and its height is the column a guard head
            // is supposed to be answering.
            out[34] = clamped(hilt_forward / RANGE_SCALE);
            out[35] = clamped(hilt_lateral / RANGE_SCALE);
            hilt_height = (blade.hilt.z - origin.z).to_f32();
            out[36] = clamped(hilt_height / HEIGHT_SCALE);
            tip_range =
                Vec2::new(blade.tip.x - origin.x, blade.tip.y - origin.y).length().to_f32();
            // 37, 38: and where both of those are *going*. The pair
            // `FeatureMemory` exists for: a weapon hand rising is a blow being
            // loaded and a weapon hand falling is one already spent, and one
            // frame cannot tell them apart.
            let (height_rate, range_rate) = memory.rates(obs.tick, hilt_height, tip_range);
            out[37] = clamped(height_rate / HAND_SPEED_SCALE);
            out[38] = clamped(range_rate / SPEED_SCALE);
        }

        // ---- 39..41: the plate
        //
        // 39: whether there is one, and 40: how high it is being held. Together
        // they are what a fighter choosing a weapon height is choosing against
        // -- v2-20 shrinks the plate precisely so that no single height answers
        // everything, and a policy that could not see where it was would be
        // guessing.
        if other.shield.present {
            out[39] = 1.0;
            out[40] = clamped((other.shield.centre.z - origin.z).to_f32() / HEIGHT_SCALE);
        }
    }

    FeatureMemory {
        primed: true,
        tick: obs.tick,
        hilt_height,
        tip_range,
    }
}

/// Writes the V2 tactical slice. Columns 0..41 are produced by the V1 writer
/// unchanged; the controller context and targetable regions are appended.
pub fn write_features_v2(
    obs: &ArticulatedObservation,
    memory: FeatureMemory,
    context: TacticalContextV1,
    out: &mut [f32; LEARN_V2_FEATURE_COUNT],
) -> FeatureMemory {
    let mut old = [0.0; LEARN_FEATURE_COUNT];
    let next = write_features(obs, memory, &mut old);
    out.fill(0.0);
    out[..LEARN_FEATURE_COUNT].copy_from_slice(&old);

    if let Some(foe) = obs.opponents().first() {
        for (part, region) in foe.regions.iter().enumerate() {
            if !region.present {
                continue;
            }
            let lower = Vec2::new(region.lower.x, region.lower.y);
            let upper = Vec2::new(region.upper.x, region.upper.y);
            let subject = Vec2::new(obs.body_position.x, obs.body_position.y);
            let nearest = closest_point_on_segment(lower, upper, subject);
            let delta = nearest.point - subject;
            let relative = delta.angle() - obs.body_yaw;
            // A signed half-turn maps to +/-1. Reflection across the subject's
            // forward axis negates this column and no range column.
            out[LEARN_FEATURE_COUNT + part * 2] =
                clamped((relative.raw() as i16) as f32 / 32_768.0);
            let surface = (nearest.distance - region.radius).max(Fx::ZERO);
            out[LEARN_FEATURE_COUNT + part * 2 + 1] =
                clamped(surface.to_f32() / TACTICAL_REGION_RANGE_SCALE);
        }
    }

    if let Some(threat) = context.threat {
        out[51] = clamped(threat.closing_speed.to_f32() / TACTICAL_CLOSING_SPEED_SCALE);
        out[52] = clamped(threat.ticks_to_crossing.to_f32() / TACTICAL_CROSSING_TICKS_SCALE);
        out[53] = if threat.crossing_height == CombatHeight::LOW {
            0.25
        } else if threat.crossing_height == CombatHeight::MID {
            0.5
        } else if threat.crossing_height == CombatHeight::HIGH {
            0.75
        } else {
            0.0
        };
    }
    out[54 + context.phase.index()] = 1.0;
    next
}

// ----------------------------------------------------------- the action heads

/// Bumped whenever a head changes width or an entry changes meaning.
///
/// Append-only: an entry may be added at the end of a head, and an existing one
/// may never be re-pointed, because a checkpoint's argmax is an *index* and a
/// reordered table turns a trained preference into a different action with no
/// error anywhere.
pub const LEARN_ACTION_LAYOUT_VERSION: u32 = 1;
pub const LEARN_V2_ACTION_LAYOUT_VERSION: u32 = 2;

/// The magnitude of an approach step.
///
/// **Fifteen sixteenths and not one**, and the reason is not aesthetic:
/// `Vec2::with_length` normalises by dividing and then multiplying, so a unit
/// answer can land one raw tick above the magnitude
/// `World::submit_articulated_v1` validates -- and a refused command is not a
/// slow fighter, it is the neutral command stored in place of the one that was
/// asked for. `articulated_script::APPROACH_SPEED` is the same number for the
/// same reason and `the_action_table_is_the_scripts_own_vocabulary` pins the
/// two together.
const APPROACH_SPEED: Fx = Fx::from_ratio(15, 16);

/// The magnitude of a withdrawal, and of a lateral step.
///
/// A half has none of the edge above -- the risk is entirely at the top of the
/// range -- which is why the two head entries the script does *not* supply a
/// number for (strafe left, strafe right) take this one rather than
/// [`APPROACH_SPEED`]. A sidestep is a step off the line and not a charge, so
/// the conservative magnitude is also the right one.
const WITHDRAW_SPEED: Fx = Fx::HALF;

const QUARTER: Fx = Fx::from_ratio(1, 4);
const THREE_QUARTERS: Fx = Fx::from_ratio(3, 4);

/// Where the feet go. Head 0.
///
/// Five entries and not four: `Hold` earns its place because the script's own
/// attack phases plant the feet, and a policy with no way to stop moving could
/// not reproduce the baseline it is being compared with.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Footwork {
    Advance = 0,
    Hold = 1,
    Withdraw = 2,
    /// A step to the subject's left of the line to the opponent.
    StrafeLeft = 3,
    StrafeRight = 4,
}

/// What the weapon arm is doing. Head 3.
///
/// The first three are the script's three named weapon postures, lifted whole.
/// The fourth is an addition, and it is here because without it the learned
/// policy has no way to hold a guard at all: `Rest` is a quarter reach at zero
/// effort, which is an arm hanging, and the script spends phases 0, 1 and 2
/// braced at half reach and half effort. Appending it rather than replacing
/// `Rest` keeps the first three indices where a v2-19 checkpoint expects them.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Posture {
    /// Phase 3: cocked, three quarters out, full effort, attacking.
    Chamber = 0,
    /// Phase 4: through the line, fully extended, full effort, attacking.
    Commit = 1,
    /// Phase 5: stood down, a quarter out, no effort, not attacking.
    Rest = 2,
    /// Phase 0: braced, half out, half effort, not attacking.
    Guard = 3,
}

pub const FOOTWORK_COUNT: usize = 5;
pub const WEAPON_HEIGHT_COUNT: usize = 3;
pub const WEAPON_BEARING_COUNT: usize = 3;
pub const POSTURE_COUNT: usize = 4;
pub const GUARD_HEIGHT_COUNT: usize = 3;

/// Where each head starts in the logit vector. Heads are contiguous and in this
/// order, and the order is part of the layout version.
pub const HEAD_OFFSETS: [usize; 5] = [
    0,
    FOOTWORK_COUNT,
    FOOTWORK_COUNT + WEAPON_HEIGHT_COUNT,
    FOOTWORK_COUNT + WEAPON_HEIGHT_COUNT + WEAPON_BEARING_COUNT,
    FOOTWORK_COUNT + WEAPON_HEIGHT_COUNT + WEAPON_BEARING_COUNT + POSTURE_COUNT,
];

pub const HEAD_WIDTHS: [usize; 5] = [
    FOOTWORK_COUNT,
    WEAPON_HEIGHT_COUNT,
    WEAPON_BEARING_COUNT,
    POSTURE_COUNT,
    GUARD_HEIGHT_COUNT,
];

/// Total logits the network emits.
pub const LEARN_ACTION_LOGITS: usize =
    FOOTWORK_COUNT + WEAPON_HEIGHT_COUNT + WEAPON_BEARING_COUNT + POSTURE_COUNT + GUARD_HEIGHT_COUNT;
pub const LEARN_V2_ACTION_LOGITS: usize = LEARN_ACTION_LOGITS + TACTICAL_INTENT_COUNT;

/// The three ordinary heights, in the order both height heads index them.
///
/// Public across the v2-ui-08 split rather than `pub(crate)`: `learn`'s probe
/// reports which height a checkpoint favoured, and a second copy of a
/// three-element table is exactly the drift
/// `the_action_table_is_the_scripts_own_vocabulary` exists to refuse.
pub const HEIGHTS: [CombatHeight; 3] =
    [CombatHeight::LOW, CombatHeight::MID, CombatHeight::HIGH];

const FOOTWORKS: [Footwork; FOOTWORK_COUNT] = [
    Footwork::Advance,
    Footwork::Hold,
    Footwork::Withdraw,
    Footwork::StrafeLeft,
    Footwork::StrafeRight,
];

const POSTURES: [Posture; POSTURE_COUNT] = [
    Posture::Chamber,
    Posture::Commit,
    Posture::Rest,
    Posture::Guard,
];

/// The weapon bearing offsets, indexed by head 2.
///
/// The third is minus an eighth, written as `65,536 - 8,192` evaluated by hand
/// because [`Angle`] has no negation and `from_raw` takes a `u16` that the
/// subtraction would underflow at compile time. `the_action_table_is_the_scripts_own_vocabulary`
/// checks the two are actually opposite rather than trusting the arithmetic.
const BEARING_OFFSETS: [Angle; WEAPON_BEARING_COUNT] =
    [Angle::ZERO, EIGHTH_TURN, Angle::from_raw(57_344)];

impl Posture {
    /// The `(reach, effort, attacking)` triple, exactly as the script's phases
    /// spell it.
    pub const fn triple(self) -> (Fx, Fx, bool) {
        match self {
            Posture::Chamber => (THREE_QUARTERS, Fx::ONE, true),
            Posture::Commit => (Fx::ONE, Fx::ONE, true),
            Posture::Rest => (QUARTER, Fx::ZERO, false),
            Posture::Guard => (Fx::HALF, Fx::HALF, false),
        }
    }
}

/// One decision, as five head indices.
///
/// **This is the type that must not reach the world**, and it is a separate
/// type from [`ArticulatedCommandV1`] for exactly that reason: it names a row in
/// a table this crate owns, it is meaningless without
/// [`LEARN_ACTION_LAYOUT_VERSION`], and [`sim::World::submit_articulated_v1`]
/// cannot be handed one. See the doctest pair on [`crate`].
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct LearnedActionV1 {
    pub footwork: u8,
    pub weapon_height: u8,
    pub weapon_bearing: u8,
    pub posture: u8,
    pub guard_height: u8,
}

impl LearnedActionV1 {
    /// Reads the five argmaxes out of a logit vector.
    ///
    /// **Ties resolve to the lowest index**, which is what `>` and not `>=`
    /// buys: the first entry of a head that is a run of equal logits wins, so a
    /// zeroed network is `Advance / LOW / straight / Chamber / LOW` rather than
    /// something that depends on iteration order. A NaN logit compares false
    /// against everything and therefore also loses to whatever came first --
    /// which is deterministic, and is still a checkpoint
    /// [`crate::CheckpointError::NotFinite`] refuses to load.
    pub fn from_logits(logits: &[f32; LEARN_ACTION_LOGITS]) -> LearnedActionV1 {
        let pick = |head: usize| -> u8 {
            let at = HEAD_OFFSETS[head];
            let width = HEAD_WIDTHS[head];
            let mut best = 0usize;
            for i in 1..width {
                if logits[at + i] > logits[at + best] {
                    best = i;
                }
            }
            best as u8
        };
        LearnedActionV1 {
            footwork: pick(0),
            weapon_height: pick(1),
            weapon_bearing: pick(2),
            posture: pick(3),
            guard_height: pick(4),
        }
    }

    pub fn footwork(self) -> Footwork {
        FOOTWORKS[self.footwork as usize % FOOTWORK_COUNT]
    }

    pub fn weapon_height(self) -> CombatHeight {
        HEIGHTS[self.weapon_height as usize % WEAPON_HEIGHT_COUNT]
    }

    pub fn weapon_bearing(self) -> Angle {
        BEARING_OFFSETS[self.weapon_bearing as usize % WEAPON_BEARING_COUNT]
    }

    pub fn posture(self) -> Posture {
        POSTURES[self.posture as usize % POSTURE_COUNT]
    }

    pub fn guard_height(self) -> CombatHeight {
        HEIGHTS[self.guard_height as usize % GUARD_HEIGHT_COUNT]
    }
}

/// The V2 decoder preserves all eighteen V1 output positions and appends one
/// tactical-intent head. The low-level positions remain present in the model
/// artifact for append-only compatibility, but the V2 controller owns motors.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct LearnedActionV2 {
    pub tactical_intent: u8,
}

impl LearnedActionV2 {
    pub fn from_logits(logits: &[f32; LEARN_V2_ACTION_LOGITS]) -> LearnedActionV2 {
        let mut best = 0usize;
        for i in 1..TACTICAL_INTENT_COUNT {
            if logits[LEARN_ACTION_LOGITS + i] > logits[LEARN_ACTION_LOGITS + best] {
                best = i;
            }
        }
        LearnedActionV2 { tactical_intent: best as u8 }
    }

    pub fn intent(self) -> TacticalIntentV1 {
        match self.tactical_intent as usize % TACTICAL_INTENT_COUNT {
            0 => TacticalIntentV1::Close,
            1 => TacticalIntentV1::StrikeBest,
            2 => TacticalIntentV1::StrikeWeaponArm,
            3 => TacticalIntentV1::StrikeShieldArm,
            4 => TacticalIntentV1::Guard,
            5 => TacticalIntentV1::EvadeLeft,
            6 => TacticalIntentV1::EvadeRight,
            _ => TacticalIntentV1::Disengage,
        }
    }
}

/// The bearing from the subject to the selected opponent, or the yaw it already
/// holds.
///
/// `articulated_script::bearing_to`, re-derived rather than imported because it
/// is private. Keeping the fallback identical matters more than it looks: the
/// fixture spawns the two bodies 10.8 apart against a 9.6 sight range, so the
/// opening seconds of every fight are spent walking along a bearing nobody can
/// see, and a policy that fell back to `Angle::ZERO` would walk east.
fn bearing_to(obs: &ArticulatedObservation) -> Angle {
    match obs.opponents().first() {
        Some(opponent) => Vec2::new(
            opponent.body_position.x - obs.body_position.x,
            opponent.body_position.y - obs.body_position.y,
        )
        .angle(),
        None => obs.body_yaw,
    }
}

/// A world XY step of `magnitude` along `bearing`.
fn heading(bearing: Angle, magnitude: Fx) -> Vec2 {
    Vec2::new(bearing.cos(), bearing.sin()).with_length(magnitude)
}

/// Which arm swings.
///
/// `articulated_script::ArmRoles`'s weapon rule, re-derived for the same reason
/// [`bearing_to`] is, and pinned against the script's own behaviour by
/// `the_weapon_arm_is_the_one_the_script_swings`. The guard half of that struct
/// is deliberately not reproduced: this policy drives the off arm from its own
/// head rather than from a table clause, so "which arm holds the shield" is not
/// a question it has to answer -- the off arm is whichever one is not swinging.
fn weapon_arm(obs: &ArticulatedObservation) -> usize {
    if obs.can(ArticulatedObservation::RIGHT_WEAPON) {
        1
    } else if obs.can(ArticulatedObservation::LEFT_WEAPON) {
        0
    } else if obs.arms[1].severed && !obs.arms[0].severed {
        0
    } else {
        1
    }
}

/// The off arm's pose: the script's static hand with its height freed.
///
/// **This is the experiment.** `articulated_script::off_hand` welds the off arm
/// to `CombatHeight::MID` and drives nothing; v2-20 gives it a height column and
/// the scripted baseline will drive that column from `(tick / 90) % 3`. Here it
/// comes from a head, which means it can come from the observed threat -- which
/// is the one place a learned policy has an edge available to it that the script
/// structurally cannot have.
///
/// The effort is a half because a zero-effort arm cannot return to a pose
/// contact took it out of; and the reach is three quarters with something in the
/// hand and a quarter without, because an empty hand held out lengthens the arm
/// capsule rather than parking a guard in front of anything. Both reasons are
/// that function's and both still hold.
///
/// **The bearing is welded here and is no longer welded there, and that
/// divergence is deliberate.** It used to be welded on both sides for one shared
/// reason: `World::derive_shield_pose` took the plate's normal from body yaw and
/// its centre from the hand, so a free bearing presented the plate edge-on to
/// the attack its position implied it covered. That defect was fixed on
/// 2026-08-16 -- the normal now comes off the carrying arm's own bearing -- and
/// `articulated_script::off_hand` accordingly lets the guard track the threat
/// inside a bounded arc.
///
/// This copy does **not** follow it, because this one is not a style choice: the
/// off arm's four columns are part of the frozen learned action vocabulary that
/// `LEARNED_INFERENCE_DIGEST` is taken over, and the shipped checkpoint was
/// scored against a guard that held the body's facing. Freeing it here would not
/// be a re-record of that pin but a re-score of the checkpoint behind it, which
/// is a training decision and not a mechanical one. Whoever takes that decision
/// should free this column and re-score in the same change, and
/// `the_action_table_is_the_scripts_own_vocabulary` states in its own body which
/// columns the two functions still share.
///
/// Built here rather than by calling into `policy` because that function is
/// private. A local copy pinned by a test is cheaper than widening `policy`'s
/// surface for one caller.
///
/// **The parameter order is `policy::articulated_script::off_hand`'s, deliberately.**
/// It was written the other way round while that function's signature was still
/// mid-flight in a concurrent session, and two same-named functions taking the
/// same two arguments in opposite orders is a trap that only stays harmless
/// while `CombatHeight` and `bool` remain different types. They agree now, and
/// `the_action_table_is_the_scripts_own_vocabulary` is what notices if the far
/// side moves.
fn off_hand(body_yaw: Angle, guard: CombatHeight, holding: bool) -> ArmTarget {
    ArmTarget {
        bearing: body_yaw,
        height: guard,
        reach: if holding { THREE_QUARTERS } else { QUARTER },
        effort: Fx::HALF,
    }
}

/// Turns five head indices into a complete [`ArticulatedCommandV1`].
///
/// **The only way anything this crate computes reaches the world.** Every field
/// is a table entry or a bearing derived from the observation; no float in the
/// network is ever converted into an `Fx` that a body acts on, which is the
/// whole of why v2-19 can let this crate use floating point at all.
///
/// One rule is borrowed wholesale from the script: **with nobody in sight the
/// weapon arm rests and the intent is Hold**, whatever the posture and bearing
/// heads said. The geometry those two heads would otherwise invent is an eighth
/// of a turn either side of a line to nobody, and the honest answer is the one
/// `scripted_articulated_command` already gives. It costs two heads their
/// expression in that state and `learned_output_uses_only_the_versioned_action_table`
/// is written to allow for it.
pub fn compose(obs: &ArticulatedObservation, action: LearnedActionV1) -> ArticulatedCommandV1 {
    let toward = bearing_to(obs);
    let visible = obs.opponents().first();
    let weapon = weapon_arm(obs);
    let off = 1 - weapon;

    let move_dir = match action.footwork() {
        Footwork::Advance => heading(toward, APPROACH_SPEED),
        Footwork::Hold => Vec2::ZERO,
        Footwork::Withdraw => heading(toward + Angle::HALF, WITHDRAW_SPEED),
        Footwork::StrafeLeft => heading(toward + Angle::QUARTER, WITHDRAW_SPEED),
        Footwork::StrafeRight => heading(toward - Angle::QUARTER, WITHDRAW_SPEED),
    };

    let (reach, effort, attacking) = action.posture().triple();
    let height = action.weapon_height();
    let (weapon_target, intent) = match visible {
        Some(other) if attacking => (
            ArmTarget {
                bearing: toward + action.weapon_bearing(),
                height,
                reach,
                effort,
            },
            Intent::Attack(other.id),
        ),
        Some(_) => (
            ArmTarget {
                bearing: toward + action.weapon_bearing(),
                height,
                reach,
                effort,
            },
            Intent::Hold,
        ),
        // Nobody in sight: the script's rest, at the height the clock -- here,
        // the head -- selected.
        None => {
            let (reach, effort, _) = Posture::Rest.triple();
            (
                ArmTarget {
                    bearing: toward,
                    height,
                    reach,
                    effort,
                },
                Intent::Hold,
            )
        }
    };

    let mut arms = [weapon_target; 2];
    arms[off] = off_hand(
        toward,
        action.guard_height(),
        obs.arms[off].equipment.is_some(),
    );
    arms[weapon] = weapon_target;

    ArticulatedCommandV1 {
        move_dir,
        // The body always faces the fight. The script turns off the line in
        // exactly one phase of twelve, and that phase exists to swing a shield
        // normal without moving a body -- a trick that belongs to a fixed pose,
        // not to a policy whose guard is already a free column. One fewer head.
        body_yaw: toward,
        intent,
        arms,
        grips: [GripRequest::Keep; 2],
        // **Not an action head, and this is the line that says so.** The frozen
        // action layout is what `LEARNED_INFERENCE_DIGEST` is taken over, and
        // the shipped checkpoint was scored against it. Giving the network a
        // release verb to choose is a re-score, not a re-record; until some
        // session pays for that, the learned policy holds like every other
        // command builder in the tree.
        releases: [ReleaseRequest::Keep; 2],
    }
}

// ------------------------------------------------------------------ the model

/// The layer widths, which a checkpoint compares directly.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ModelShape {
    pub inputs: usize,
    pub hidden: usize,
    pub outputs: usize,
}

impl ModelShape {
    pub const CURRENT: ModelShape = ModelShape {
        inputs: LEARN_FEATURE_COUNT,
        hidden: HIDDEN_UNITS,
        outputs: LEARN_ACTION_LOGITS,
    };

    pub const fn weight_count(&self) -> usize {
        self.inputs * self.hidden + self.hidden + self.hidden * self.outputs + self.outputs
    }
}

impl std::fmt::Display for ModelShape {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}x{}x{}", self.inputs, self.hidden, self.outputs)
    }
}

/// One two-layer perceptron, as a flat weight vector.
///
/// Flat rather than four named matrices because the optimizer's whole job is to
/// perturb it: a `(mu + lambda)` strategy mutates a point in R^n and does not
/// care which coordinate is a bias. The slicing happens once, in
/// [`Model::forward`].
#[derive(Clone, PartialEq, Debug)]
pub struct Model {
    weights: Vec<f32>,
}

impl Model {
    pub fn zeros() -> Model {
        Model {
            weights: vec![0.0; ModelShape::CURRENT.weight_count()],
        }
    }

    /// A fresh network, uniform in `+/- 1/sqrt(fan_in)` per layer.
    ///
    /// The usual scaling, and it matters more here than under gradient descent:
    /// a `(mu + lambda)` strategy never renormalises anything, so a population
    /// initialised too wide starts saturated -- every head's argmax pinned by
    /// one enormous logit -- and mutation at any sane sigma cannot walk it back.
    ///
    /// Drawn through [`fx::Rng`], which is the repository's PCG32, so a seed
    /// reproduces a population exactly.
    pub fn random(rng: &mut Rng) -> Model {
        let shape = ModelShape::CURRENT;
        let mut weights = vec![0.0f32; shape.weight_count()];
        let first = shape.inputs * shape.hidden;
        let hidden_end = first + shape.hidden;
        let input_limit = 1.0 / (shape.inputs as f32).sqrt();
        let hidden_limit = 1.0 / (shape.hidden as f32).sqrt();
        for (i, weight) in weights.iter_mut().enumerate() {
            // Biases start at zero. A bias is a preference held before any
            // evidence arrives, and a random one is a network that has already
            // decided which action it likes.
            let limit = if i < first {
                input_limit
            } else if i < hidden_end {
                continue;
            } else if i < hidden_end + shape.hidden * shape.outputs {
                hidden_limit
            } else {
                continue;
            };
            *weight = uniform(rng) * limit;
        }
        Model { weights }
    }

    /// Wraps a weight vector, or hands back the count it turned out to be.
    ///
    /// A count and not a [`ModelShape`], because a flat vector of the wrong
    /// length does not *have* a shape -- there are many that would produce it,
    /// and reporting one of them invents a fact.
    pub fn from_weights(weights: Vec<f32>) -> Result<Model, usize> {
        if weights.len() == ModelShape::CURRENT.weight_count() {
            Ok(Model { weights })
        } else {
            Err(weights.len())
        }
    }

    pub fn shape(&self) -> ModelShape {
        ModelShape::CURRENT
    }

    pub fn weights(&self) -> &[f32] {
        &self.weights
    }

    pub fn weights_mut(&mut self) -> &mut [f32] {
        &mut self.weights
    }

    pub fn len(&self) -> usize {
        self.weights.len()
    }

    pub fn is_empty(&self) -> bool {
        self.weights.is_empty()
    }

    /// Features in, logits out, through preallocated buffers.
    ///
    /// **Rectified linear and not tanh, and the reason is portability rather
    /// than accuracy.** `tanh` is libm, and the libm compiled into one target
    /// is not the one in another -- the argument `fx` opens with. A max against
    /// zero is not a function call at all, and `f32` multiply and add are
    /// IEEE-754 exact everywhere, so with the summation order fixed by the loop
    /// below and no fast-math anywhere in the profile, a frozen checkpoint's
    /// argmax is reproducible on any host and not merely on the one v2-19 asks
    /// about. That is a stronger claim than the plan needs and it is free.
    ///
    /// **It was only a *claim* about hosts other than this one until v2-ui-08,
    /// and it is not any more.** This paragraph used to end "because this
    /// repository has no second host to check it on", which was true while
    /// nothing but native `lab` could reach this function. `crates/web` now
    /// depends on this crate, wasm32 is the second host, and
    /// [`crate::learned_inference_digest`] holds the two to the same logits
    /// rather than merely to the same five argmaxes -- an agreeing argmax hides
    /// a divergence that has not yet crossed a decision boundary, which is
    /// exactly the divergence worth catching early. The number is
    /// `LEARNED_INFERENCE_DIGEST`, pinned in `crates/web/src/lib.rs` and again
    /// in `tools/wasm_check.js`, and the two agreed on the first run.
    ///
    /// **The claim is bounded and the bound is real.** It holds for the
    /// repository's baseline targets, because neither baseline x86-64 nor the
    /// wasm MVP has an FMA instruction and that is what closes contraction;
    /// `-C target-cpu=native` on a host that has one re-opens it, and a fused
    /// multiply-add rounds once where the loop below rounds twice. See
    /// [`crate::digest`], which carries the caveat with the pin.
    ///
    /// What is tested locally is still that the same checkpoint and the same
    /// observation give the same answer twice, in
    /// `frozen_inference_is_a_function_of_its_inputs`.
    pub fn forward(
        &self,
        features: &[f32; LEARN_FEATURE_COUNT],
        hidden: &mut [f32; HIDDEN_UNITS],
        logits: &mut [f32; LEARN_ACTION_LOGITS],
    ) {
        let shape = ModelShape::CURRENT;
        let first = shape.inputs * shape.hidden;
        let hidden_end = first + shape.hidden;
        let second = hidden_end + shape.hidden * shape.outputs;
        let (w1, rest) = self.weights.split_at(first);
        let (b1, rest) = rest.split_at(shape.hidden);
        let (w2, b2) = rest.split_at(second - hidden_end);

        for (unit, slot) in hidden.iter_mut().enumerate() {
            let row = &w1[unit * shape.inputs..(unit + 1) * shape.inputs];
            let mut sum = b1[unit];
            for (weight, feature) in row.iter().zip(features.iter()) {
                sum += weight * feature;
            }
            *slot = if sum > 0.0 { sum } else { 0.0 };
        }
        for (out, slot) in logits.iter_mut().enumerate() {
            let row = &w2[out * shape.hidden..(out + 1) * shape.hidden];
            let mut sum = b2[out];
            for (weight, activation) in row.iter().zip(hidden.iter()) {
                sum += weight * activation;
            }
            *slot = sum;
        }
    }
}

/// The V2 shape is a distinct type so no unsuffixed checkpoint or browser call
/// can accidentally begin validating against the tactical model.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ModelShapeV2 {
    pub inputs: usize,
    pub hidden: usize,
    pub outputs: usize,
}

impl ModelShapeV2 {
    pub const CURRENT: ModelShapeV2 = ModelShapeV2 {
        inputs: LEARN_V2_FEATURE_COUNT,
        hidden: HIDDEN_UNITS,
        outputs: LEARN_V2_ACTION_LOGITS,
    };

    pub const fn weight_count(&self) -> usize {
        self.inputs * self.hidden + self.hidden + self.hidden * self.outputs + self.outputs
    }
}

impl std::fmt::Display for ModelShapeV2 {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}x{}x{}", self.inputs, self.hidden, self.outputs)
    }
}

#[derive(Clone, PartialEq, Debug)]
pub struct ModelV2 {
    weights: Vec<f32>,
}

impl ModelV2 {
    pub fn zeros() -> ModelV2 {
        ModelV2 { weights: vec![0.0; ModelShapeV2::CURRENT.weight_count()] }
    }

    pub fn random(rng: &mut Rng) -> ModelV2 {
        let shape = ModelShapeV2::CURRENT;
        let mut weights = vec![0.0f32; shape.weight_count()];
        let first = shape.inputs * shape.hidden;
        let hidden_end = first + shape.hidden;
        let input_limit = 1.0 / (shape.inputs as f32).sqrt();
        let hidden_limit = 1.0 / (shape.hidden as f32).sqrt();
        for (i, weight) in weights.iter_mut().enumerate() {
            let limit = if i < first {
                input_limit
            } else if i < hidden_end {
                continue;
            } else if i < hidden_end + shape.hidden * shape.outputs {
                hidden_limit
            } else {
                continue;
            };
            *weight = uniform(rng) * limit;
        }
        ModelV2 { weights }
    }

    pub fn from_weights(weights: Vec<f32>) -> Result<ModelV2, usize> {
        if weights.len() == ModelShapeV2::CURRENT.weight_count() {
            Ok(ModelV2 { weights })
        } else {
            Err(weights.len())
        }
    }

    pub fn shape(&self) -> ModelShapeV2 { ModelShapeV2::CURRENT }
    pub fn weights(&self) -> &[f32] { &self.weights }
    pub fn weights_mut(&mut self) -> &mut [f32] { &mut self.weights }
    pub fn len(&self) -> usize { self.weights.len() }
    pub fn is_empty(&self) -> bool { self.weights.is_empty() }

    pub fn forward(
        &self,
        features: &[f32; LEARN_V2_FEATURE_COUNT],
        hidden: &mut [f32; HIDDEN_UNITS],
        logits: &mut [f32; LEARN_V2_ACTION_LOGITS],
    ) {
        let shape = ModelShapeV2::CURRENT;
        let first = shape.inputs * shape.hidden;
        let hidden_end = first + shape.hidden;
        let second = hidden_end + shape.hidden * shape.outputs;
        let (w1, rest) = self.weights.split_at(first);
        let (b1, rest) = rest.split_at(shape.hidden);
        let (w2, b2) = rest.split_at(second - hidden_end);
        for (unit, slot) in hidden.iter_mut().enumerate() {
            let row = &w1[unit * shape.inputs..(unit + 1) * shape.inputs];
            let mut sum = b1[unit];
            for (weight, feature) in row.iter().zip(features.iter()) { sum += weight * feature; }
            *slot = if sum > 0.0 { sum } else { 0.0 };
        }
        for (out, slot) in logits.iter_mut().enumerate() {
            let row = &w2[out * shape.hidden..(out + 1) * shape.hidden];
            let mut sum = b2[out];
            for (weight, activation) in row.iter().zip(hidden.iter()) { sum += weight * activation; }
            *slot = sum;
        }
    }
}

/// A uniform draw in `[-1, 1)` from the repository's integer RNG.
///
/// Built from `next_u32` rather than from [`fx::Rng::signed_unit`] because that
/// one answers an `Fx`, whose resolution is 1/65,536 -- coarse enough that a
/// mutation sigma of a few hundredths quantises visibly. Twenty-four bits
/// survive the shift and `2^24` is exactly representable in `f32`, so the
/// division is exact and this is deterministic in the same way the integer
/// stream underneath it is.
///
/// **The divisor was `2^23` when this was first written**, which made the range
/// `[-1, 3)` with a mean of one -- so [`Model::random`] initialised a network
/// biased hard positive and `probe::gaussian` was not a Gaussian at all but a
/// march along the all-ones direction at `6 * sigma` per generation. Nothing
/// failed: training was still reproducible, checkpoints still loaded, and the
/// population still climbed, because a monotone drift up a shaped return looks
/// exactly like learning from the outside. `a_uniform_draw_is_centred_and_bounded`
/// and `a_gaussian_draw_has_the_moments_it_claims` exist because that is the
/// class of bug this crate cannot detect from its behaviour.
///
/// Public across the v2-ui-08 split rather than `pub(crate)`, because `learn`'s
/// `probe::gaussian` is twelve of these summed and the whole value of the
/// paragraph above is that there is one draw in the repository and not two.
pub fn uniform(rng: &mut Rng) -> f32 {
    (rng.next_u32() >> 8) as f32 / (1u32 << 24) as f32 * 2.0 - 1.0
}

/// A frozen model, driving a body.
///
/// Holds its own buffers so that [`ArticulatedPolicy::decide`] allocates
/// nothing: the feature slice, the hidden layer and the logits are fixed-width
/// arrays and the only heap in the struct is the weight vector, which is filled
/// once at construction. `frozen_inference_allocates_nothing_after_warmup`
/// checks this against a counting allocator rather than against the source.
#[derive(Clone, Debug)]
pub struct LearnedArticulatedPolicy {
    model: Model,
    features: [f32; LEARN_FEATURE_COUNT],
    hidden: [f32; HIDDEN_UNITS],
    logits: [f32; LEARN_ACTION_LOGITS],
    memory: FeatureMemory,
}

impl LearnedArticulatedPolicy {
    pub fn new(model: Model) -> LearnedArticulatedPolicy {
        LearnedArticulatedPolicy {
            model,
            features: [0.0; LEARN_FEATURE_COUNT],
            hidden: [0.0; HIDDEN_UNITS],
            logits: [0.0; LEARN_ACTION_LOGITS],
            memory: FeatureMemory::EMPTY,
        }
    }

    pub fn model(&self) -> &Model {
        &self.model
    }

    /// The head indices, before they become a command.
    ///
    /// Exposed so that a diagnostic can report *which action* a checkpoint
    /// chose rather than reverse-engineering it out of an `ArmTarget`, and so
    /// that the doctest pair on [`crate`] has a training-side value to try to
    /// hand the world.
    pub fn action(&mut self, obs: &ArticulatedObservation) -> LearnedActionV1 {
        self.memory = write_features(obs, self.memory, &mut self.features);
        self.model
            .forward(&self.features, &mut self.hidden, &mut self.logits);
        LearnedActionV1::from_logits(&self.logits)
    }

    /// The feature slice as it stood at the last decision. Diagnostics only.
    pub fn last_features(&self) -> &[f32; LEARN_FEATURE_COUNT] {
        &self.features
    }
}

impl ArticulatedPolicy for LearnedArticulatedPolicy {
    fn decide(&mut self, obs: &ArticulatedObservation) -> ArticulatedCommandV1 {
        let action = self.action(obs);
        compose(obs, action)
    }

    /// Clears the one thing that accumulates: the previous decision's blade
    /// reading. Without it the first two rate features of a run would be
    /// computed against the last tick of the previous one, which is a fight
    /// this body was not in.
    fn reset(&mut self) {
        self.memory = FeatureMemory::EMPTY;
    }
}

/// Frozen tactical inference wrapped around the fixed-point strike controller.
#[derive(Clone, Debug)]
pub struct LearnedTacticalPolicyV2 {
    model: ModelV2,
    features: [f32; LEARN_V2_FEATURE_COUNT],
    hidden: [f32; HIDDEN_UNITS],
    logits: [f32; LEARN_V2_ACTION_LOGITS],
    memory: FeatureMemory,
    planner: StrikePlanner,
    selected: TacticalIntentV1,
}

impl LearnedTacticalPolicyV2 {
    pub fn new(model: ModelV2) -> LearnedTacticalPolicyV2 {
        LearnedTacticalPolicyV2 {
            model,
            features: [0.0; LEARN_V2_FEATURE_COUNT],
            hidden: [0.0; HIDDEN_UNITS],
            logits: [0.0; LEARN_V2_ACTION_LOGITS],
            memory: FeatureMemory::EMPTY,
            planner: StrikePlanner::default(),
            selected: TacticalIntentV1::Close,
        }
    }

    pub fn model(&self) -> &ModelV2 { &self.model }
    pub fn planner(&self) -> &StrikePlanner { &self.planner }
    pub fn last_features(&self) -> &[f32; LEARN_V2_FEATURE_COUNT] { &self.features }

    /// Returns the newly sampled action, or `None` while the controller owns a
    /// chamber/commit/recovery sequence.
    pub fn action(&mut self, obs: &ArticulatedObservation) -> Option<LearnedActionV2> {
        let context = self.planner.observe(obs);
        self.memory = write_features_v2(obs, self.memory, context, &mut self.features);
        if !self.planner.can_sample_intent() {
            return None;
        }
        self.model.forward(&self.features, &mut self.hidden, &mut self.logits);
        let action = LearnedActionV2::from_logits(&self.logits);
        self.selected = action.intent();
        Some(action)
    }
}

impl ArticulatedPolicy for LearnedTacticalPolicyV2 {
    fn decide(&mut self, obs: &ArticulatedObservation) -> ArticulatedCommandV1 {
        self.action(obs);
        self.planner.decide_with_intent(obs, self.selected)
    }

    fn reset(&mut self) {
        self.memory = FeatureMemory::EMPTY;
        self.planner.reset();
        self.selected = TacticalIntentV1::Close;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use policy::{scripted_articulated_command, TacticalPhase, GUARD_LEAD_TICKS, HEIGHT_TICKS, PHASE_TICKS};
    use sim::{EntityId, RegionVolume};

    /// A Fighter looking east with a Brute four units due east: shield left,
    /// sword right. The same fixture `articulated_script`'s tests use, so the
    /// pins below compare like with like.
    fn fighter_facing(tick: u32) -> ArticulatedObservation {
        let mut obs = ArticulatedObservation::BLANK;
        obs.tick = tick;
        obs.subject = EntityId::new(0, 0);
        obs.body_yaw = Angle::ZERO;
        obs.capabilities = ArticulatedObservation::MOVEMENT
            | ArticulatedObservation::TURNING
            | ArticulatedObservation::LEFT_GRIP
            | ArticulatedObservation::RIGHT_GRIP
            | ArticulatedObservation::RIGHT_WEAPON
            | ArticulatedObservation::SHIELD;
        obs.arms[0].equipment = Some(2);
        obs.arms[1].equipment = Some(1);
        obs.opponent_count = 1;
        obs.opponents[0].id = EntityId::new(1, 0);
        obs.opponents[0].body_position = Vec3::new(Fx::from_int(4), Fx::ZERO, Fx::ZERO);
        obs
    }

    fn brute_facing(tick: u32) -> ArticulatedObservation {
        let mut obs = fighter_facing(tick);
        obs.capabilities = ArticulatedObservation::MOVEMENT
            | ArticulatedObservation::TURNING
            | ArticulatedObservation::RIGHT_GRIP
            | ArticulatedObservation::RIGHT_WEAPON;
        obs.arms[0].equipment = None;
        obs.arms[1].equipment = Some(3);
        obs
    }

    #[test]
    fn the_action_table_is_the_scripts_own_vocabulary() {
        // Four constants in this file are copies of four private constants in
        // `policy::articulated_script`, and a copy that nobody checks is a
        // number that drifts. Every one of them is pinned here against what the
        // script actually submits, so that a change on either side fails at the
        // line that moved rather than turning the learned-versus-scripted
        // comparison into a comparison of two different bodies.
        //
        // Due east has exact sines and cosines, so the feet come back as exact
        // vectors and the assertion can be an equality.
        let advance = scripted_articulated_command(&fighter_facing(0)).move_dir;
        assert_eq!(advance, Vec2::new(APPROACH_SPEED, Fx::ZERO));
        let retreat = scripted_articulated_command(&fighter_facing(9 * PHASE_TICKS)).move_dir;
        assert_eq!(retreat, Vec2::new(-WITHDRAW_SPEED, Fx::ZERO));

        // The three postures the script names, read off the arm it swings. A
        // Brute is the subject for the guard row because a Fighter's guard
        // clause lands on its shield arm and is overwritten by the static-hand
        // override.
        let chamber = scripted_articulated_command(&fighter_facing(3 * PHASE_TICKS)).arms[1];
        assert_eq!((chamber.reach, chamber.effort), (THREE_QUARTERS, Fx::ONE));
        let commit = scripted_articulated_command(&fighter_facing(4 * PHASE_TICKS)).arms[1];
        assert_eq!((commit.reach, commit.effort), (Fx::ONE, Fx::ONE));
        let rest = scripted_articulated_command(&brute_facing(CYCLE_TICKS + 5 * PHASE_TICKS)).arms[1];
        assert_eq!((rest.reach, rest.effort), (QUARTER, Fx::ZERO));
        let guard = scripted_articulated_command(&brute_facing(0)).arms[1];
        assert_eq!((guard.reach, guard.effort), (Fx::HALF, Fx::HALF));
        assert_eq!(Posture::Chamber.triple(), (chamber.reach, chamber.effort, true));
        assert_eq!(Posture::Commit.triple(), (commit.reach, commit.effort, true));
        assert_eq!(Posture::Rest.triple(), (rest.reach, rest.effort, false));
        assert_eq!(Posture::Guard.triple(), (guard.reach, guard.effort, false));

        // The off hand's two reaches and its effort, which this crate copies
        // wholesale out of `off_hand`.
        //
        // **The height is not one of the copies, and pinning it as one is what
        // broke.** This read `CombatHeight::MID` on both rows, which was true
        // only while `off_hand` hardcoded it; v2-20 put the script's off hand on
        // a clock -- `(tick + GUARD_LEAD_TICKS) / HEIGHT_TICKS` -- and made that
        // same height this crate's fifth action head. So the expectation is
        // computed from the clock rather than named, and it is sampled at one
        // tick per height so the coupling is proved instead of spot-checked. A
        // literal here would break again at the next change to the lead, and it
        // would break as a stale constant rather than as a real disagreement.
        let guard_clock = |tick: u32| {
            [CombatHeight::LOW, CombatHeight::MID, CombatHeight::HIGH]
                [(((tick + GUARD_LEAD_TICKS) / HEIGHT_TICKS) % 3) as usize]
        };
        let samples = [0, HEIGHT_TICKS, 2 * HEIGHT_TICKS];
        assert_eq!(
            samples.map(guard_clock),
            [CombatHeight::LOW, CombatHeight::MID, CombatHeight::HIGH],
            "the sample ticks stopped covering all three guard heights",
        );
        // **Three of the four columns are shared; the bearing is not, since
        // 2026-08-16.** The script's guard now tracks the threat inside a
        // bounded arc while this copy stays welded to the commanded yaw,
        // because this one is the frozen learned action vocabulary and freeing
        // it is a re-score rather than a re-record -- `off_hand`'s doc comment
        // above argues that at length.
        //
        // These fixtures put the opponent due east of a body facing east, so
        // the threat offset is zero and the two functions still agree on all
        // four columns here. That agreement is a property of the fixture and
        // not of the code, so it is asserted as a whole-target equality *and*
        // the divergence is proved separately below -- otherwise an off-axis
        // fixture would one day break this line and read as drift when it is
        // the intended difference.
        for tick in samples {
            let held = scripted_articulated_command(&fighter_facing(tick)).arms[0];
            assert_eq!(held, off_hand(Angle::ZERO, guard_clock(tick), true), "tick {tick}");
            let empty = scripted_articulated_command(&brute_facing(tick)).arms[0];
            assert_eq!(empty, off_hand(Angle::ZERO, guard_clock(tick), false), "tick {tick}");
        }
        // The threat is straight ahead in these fixtures, which is what makes
        // the four-column equality above hold. Stated as an assertion so that
        // moving the fixture opponent fails here, at the reason, rather than
        // there, at the symptom.
        let ahead = fighter_facing(0);
        assert_eq!(
            Vec2::new(
                ahead.opponents[0].body_position.x - ahead.body_position.x,
                ahead.opponents[0].body_position.y - ahead.body_position.y,
            ).angle(),
            Angle::ZERO,
            "the shared-column equality above holds only while the threat is due east",
        );
        // ...and the height is free, which is the whole experiment.
        assert_ne!(
            off_hand(Angle::ZERO, CombatHeight::HIGH, true),
            off_hand(Angle::ZERO, CombatHeight::MID, true)
        );

        // The eighth turn, both ways. The negative offset is written as a raw
        // complement because `Angle` has no negation, and this is what says the
        // two are actually opposite.
        assert_eq!(BEARING_OFFSETS[1], EIGHTH_TURN);
        assert_eq!(BEARING_OFFSETS[2] + EIGHTH_TURN, Angle::ZERO);
    }

    #[test]
    fn the_weapon_arm_is_the_one_the_script_swings() {
        // `weapon_arm` is a copy of a private rule, and the observable
        // consequence of getting it wrong is a policy that swings a shield. The
        // script's commit phase extends its weapon arm to full reach at full
        // effort, so "which arm did the script move" is a decidable question.
        let commit = 4 * PHASE_TICKS;
        for (name, obs) in [
            ("fighter", fighter_facing(commit)),
            ("brute", brute_facing(commit)),
        ] {
            let command = scripted_articulated_command(&obs);
            let swung = command
                .arms
                .iter()
                .position(|arm| arm.reach == Fx::ONE && arm.effort == Fx::ONE)
                .unwrap_or_else(|| panic!("{name}: the script committed with neither arm"));
            assert_eq!(weapon_arm(&obs), swung, "{name}");
        }

        // A Fighter that has lost its sword arm swings with the other one, and
        // a body holding nothing still names an arm, because a total policy has
        // to point somewhere.
        let mut maimed = fighter_facing(commit);
        maimed.capabilities = ArticulatedObservation::MOVEMENT
            | ArticulatedObservation::TURNING
            | ArticulatedObservation::LEFT_GRIP
            | ArticulatedObservation::SHIELD;
        maimed.arms[1].equipment = None;
        maimed.arms[1].severed = true;
        assert_eq!(weapon_arm(&maimed), 0);
        assert_eq!(weapon_arm(&ArticulatedObservation::BLANK), 1);
    }

    #[test]
    fn the_feature_slice_is_the_width_its_comments_describe() {
        // The constant and the writer have to agree, and the blocks in the doc
        // comment have to agree with both. Written as the block boundaries so
        // that adding a feature without extending the table fails here.
        assert_eq!(LEARN_FEATURE_COUNT, 41);
        assert_eq!(4 + 9 + 8 + 9 + 9 + 2, LEARN_FEATURE_COUNT);
        assert_eq!(LEARN_ACTION_LOGITS, 18);
        assert_eq!(HEAD_OFFSETS, [0, 5, 8, 11, 15]);
        assert_eq!(
            HEAD_OFFSETS[4] + HEAD_WIDTHS[4],
            LEARN_ACTION_LOGITS,
            "the heads do not tile the logit vector"
        );
        // 41 x 64 + 64 + 64 x 18 + 18. Spelled out because it is the number
        // that decides whether the optimizer has a chance. The alternative the
        // plan proposed -- the whole 954-column vector -- is computed here from
        // the same expression rather than written down, because it is quoted in
        // the module header and in `docs/performance/v2-learning-probe.md`, and a
        // number quoted in three places is a number that drifts. It was wrong
        // in two of them until this line existed.
        assert_eq!(ModelShape::CURRENT.weight_count(), 3_858);
        let whole_vector = ModelShape {
            inputs: sim::FEATURE_COUNT,
            hidden: HIDDEN_UNITS,
            outputs: LEARN_ACTION_LOGITS,
        };
        // **A documentation cross-check and not a pin.** It moved 922 -> 954
        // when the embodied block was appended, and the move costs this crate
        // nothing: `write_features` here reads named fields of
        // `ArticulatedObservation` and never the flattened vector, so the
        // 41-column slice, `ModelShape::CURRENT` and `LEARNED_INFERENCE_DIGEST`
        // are all untouched by a column added to the other one. What this line
        // is for is the sentence above it: the header quotes both numbers, and
        // this is what makes a stale quotation fail rather than mislead.
        assert_eq!(sim::FEATURE_COUNT, 954);
        assert_eq!(whole_vector.weight_count(), 62_290);
    }

    #[test]
    fn a_blank_observation_writes_a_blank_slice() {
        // Every policy has to survive one, and the network sees the blank
        // observation on the first tick of every legacy world. Nothing in the
        // slice may be a NaN, and the visibility flag has to be the thing that
        // distinguishes it from an opponent standing at the origin.
        let mut out = [7.0f32; LEARN_FEATURE_COUNT];
        let memory = write_features(&ArticulatedObservation::BLANK, FeatureMemory::EMPTY, &mut out);
        assert!(memory.primed);
        // Feature 1 is `cos` of a phase of zero and is therefore one, which is
        // the only non-zero column a blank observation writes. Spelled out
        // rather than allowed for with a range, because "the clock runs even
        // when nothing is in sight" is a real property: the fixture spawns
        // outside sight range and the clock is what a blind body has instead
        // of an opponent.
        assert_eq!(out[1], 1.0);
        for (i, feature) in out.iter().enumerate() {
            if i != 1 {
                assert_eq!(*feature, 0.0, "feature {i} of a blank observation");
            }
        }

        let mut live = [0.0f32; LEARN_FEATURE_COUNT];
        write_features(&fighter_facing(0), FeatureMemory::EMPTY, &mut live);
        assert_eq!(live[0], 1.0, "somebody is in sight");
        assert!(live.iter().all(|f| f.is_finite() && f.abs() <= FEATURE_CLAMP));
        // Due east at four units, in a body frame that is also due east.
        assert_eq!(live[21], 4.0 / RANGE_SCALE);
        assert_eq!(live[22], 1.0, "dead ahead");
        assert_eq!(live[23], 0.0);
    }

    #[test]
    fn the_rate_features_read_the_previous_decision_and_nothing_else() {
        // The two columns `FeatureMemory` exists for. A hand held still writes
        // zero; the same hand a tick later and a tenth of a unit higher writes
        // a positive rate; and a fresh memory writes zero again, which is what
        // `reset` restores.
        let mut obs = fighter_facing(100);
        obs.opponents[0].weapons[1] = Some(SegmentPose {
            hilt: Vec3::new(Fx::from_int(4), Fx::ZERO, Fx::from_ratio(9, 10)),
            tip: Vec3::new(Fx::from_int(3), Fx::ZERO, Fx::from_ratio(9, 10)),
            radius: Fx::from_ratio(1, 20),
        });
        let mut first = [0.0f32; LEARN_FEATURE_COUNT];
        let memory = write_features(&obs, FeatureMemory::EMPTY, &mut first);
        assert_eq!(first[30], 1.0, "there is a blade");
        assert_eq!((first[37], first[38]), (0.0, 0.0), "nothing has moved yet");

        let mut raised = obs;
        raised.tick = 101;
        raised.opponents[0].weapons[1].as_mut().expect("a blade").hilt.z =
            Fx::from_ratio(9, 10) + Fx::from_ratio(1, 100);
        let mut second = [0.0f32; LEARN_FEATURE_COUNT];
        write_features(&raised, memory, &mut second);
        assert!(second[37] > 0.0, "a rising hand reads as rising");

        let mut fresh = [0.0f32; LEARN_FEATURE_COUNT];
        write_features(&raised, FeatureMemory::EMPTY, &mut fresh);
        assert_eq!(fresh[37], 0.0, "a cleared memory has seen nothing move");
    }

    #[test]
    fn a_mirrored_fight_writes_the_same_slice() {
        // The claim the body frame is for. Reflecting the whole geometry across
        // `y = 0` and negating every yaw is the mirror `lab articulated
        // --mirrored` builds, and a policy reading world coordinates would see
        // two different problems. Everything here is either a length, a
        // fraction, or a component along a mirrored axis -- so the two slices
        // agree except in the lateral columns, which flip sign.
        //
        // **The fixture has to carry a blade and a plate**, and the first
        // version of this test did not. `fighter_facing` leaves
        // `opponents[0].weapons` empty, which makes features 30..41 zero on both
        // sides -- so eleven of the forty-one columns were being compared as
        // `0 == -0`, including the two lateral blade columns named below, which
        // are the ones the body frame most has to get right.
        let mut obs = fighter_facing(60);
        obs.body_yaw = Angle::from_degrees(30);
        obs.opponents[0].body_position = Vec3::new(Fx::from_int(3), Fx::from_int(2), Fx::ZERO);
        obs.opponents[0].body_yaw = Angle::from_degrees(200);
        obs.arms[1].hand = Vec3::new(Fx::from_ratio(1, 2), Fx::from_ratio(1, 4), Fx::ONE);
        // Placed well off the body's own axis, so that both lateral columns
        // carry something the sign assertion can actually see: at a yaw of
        // thirty degrees a hilt at (2.5, 1.5) lands within a hundredth of the
        // centre line, which is a zero wearing a decimal point.
        obs.opponents[0].weapons[1] = Some(SegmentPose {
            hilt: Vec3::new(Fx::from_ratio(5, 2), Fx::from_ratio(5, 2), Fx::ONE),
            tip: Vec3::new(Fx::from_ratio(3, 2), Fx::from_int(3), Fx::from_ratio(11, 10)),
            radius: Fx::from_ratio(1, 20),
        });
        obs.opponents[0].shield.present = true;
        obs.opponents[0].shield.centre =
            Vec3::new(Fx::from_int(3), Fx::from_ratio(5, 2), Fx::from_ratio(9, 10));

        let mut mirrored = obs;
        mirrored.body_yaw = Angle::from_raw(0u16.wrapping_sub(obs.body_yaw.raw()));
        mirrored.opponents[0].body_position.y = -obs.opponents[0].body_position.y;
        mirrored.opponents[0].body_yaw =
            Angle::from_raw(0u16.wrapping_sub(obs.opponents[0].body_yaw.raw()));
        mirrored.arms[1].hand.y = -obs.arms[1].hand.y;
        let blade = mirrored.opponents[0].weapons[1].as_mut().expect("a blade");
        blade.hilt.y = -blade.hilt.y;
        blade.tip.y = -blade.tip.y;
        mirrored.opponents[0].shield.centre.y = -obs.opponents[0].shield.centre.y;

        let mut a = [0.0f32; LEARN_FEATURE_COUNT];
        let mut b = [0.0f32; LEARN_FEATURE_COUNT];
        write_features(&obs, FeatureMemory::EMPTY, &mut a);
        write_features(&mirrored, FeatureMemory::EMPTY, &mut b);
        // The fixture has to actually reach the blade and plate blocks, or the
        // sign assertions below are about zeros.
        assert_eq!(a[30], 1.0, "the blade block is unexercised");
        assert_eq!(a[39], 1.0, "the shield block is unexercised");
        for i in [32usize, 35] {
            assert!(a[i].abs() > 1.0 / 64.0, "lateral column {i} is zero in the fixture");
        }
        // The lateral columns: own drift, both hands, the bearing sine, the
        // opponent's facing sine, its drift, and the blade's tip and hilt.
        let flipped = [12usize, 14, 18, 23, 25, 27, 32, 35];
        for i in 0..LEARN_FEATURE_COUNT {
            let want = if flipped.contains(&i) { -a[i] } else { a[i] };
            assert!(
                (b[i] - want).abs() < 1.0 / 1024.0,
                "feature {i}: {} against {want} (fixed-point rounding aside)",
                b[i]
            );
        }
    }

    #[test]
    fn the_fight_clock_is_the_fixtures_own() {
        assert_eq!(
            FIGHT_TICKS,
            sim::Scenario::articulated_duel().max_ticks as f32,
            "feature 3 divides by a clock the fixture no longer runs on"
        );
        // And the cycle the phase pair reads is the script's, not a second 360.
        assert_eq!(CYCLE_TICKS, 360);
    }

    #[test]
    fn the_opponent_shield_columns_are_dead_on_the_shipped_fixture() {
        // Two of forty-one columns are structurally zero for the whole of every
        // fight this crate runs, because the probe puts the candidate on the
        // Fighter and the Fighter's only opponent is a Brute with no plate.
        //
        // **This test failing is good news**: it means the fixture grew a second
        // shield, the columns became live, and the paragraph in
        // `write_features` that calls them dead should be deleted rather than
        // the test.
        let scenario = sim::Scenario::articulated_duel();
        let mut world = sim::World::new(&scenario, 0);
        let hero = world.alive_ids(sim::Faction::Heroes)[0];
        let mut features = [0.0f32; LEARN_FEATURE_COUNT];
        let mut memory = FeatureMemory::EMPTY;
        let mut policy = LearnedArticulatedPolicy::new(Model::zeros());
        for _ in 0..600 {
            for id in world.pending_decisions().to_vec() {
                let obs = world.observe_articulated(id);
                if id == hero {
                    memory = write_features(&obs, memory, &mut features);
                    assert_eq!(features[39], 0.0, "tick {}: a plate appeared", obs.tick);
                    assert_eq!(features[40], 0.0, "tick {}: a plate appeared", obs.tick);
                }
                let command = policy.decide(&obs);
                world.submit_articulated_v1(id, command);
            }
            world.step();
        }
    }

    #[test]
    fn ties_in_a_head_resolve_to_its_lowest_index() {
        // A zeroed network is a real state -- it is what `Model::zeros` builds
        // and what a generation-zero population is perturbed from -- and its
        // answer has to be a decision rather than whatever the comparison
        // happened to do.
        let logits = [0.0f32; LEARN_ACTION_LOGITS];
        assert_eq!(LearnedActionV1::from_logits(&logits), LearnedActionV1::default());
        let mut one = [0.0f32; LEARN_ACTION_LOGITS];
        // The last entry of each head, so a head that read its neighbour's
        // slice would pick the wrong one.
        for head in 0..5 {
            one[HEAD_OFFSETS[head] + HEAD_WIDTHS[head] - 1] = 1.0;
        }
        assert_eq!(
            LearnedActionV1::from_logits(&one),
            LearnedActionV1 {
                footwork: 4,
                weapon_height: 2,
                weapon_bearing: 2,
                posture: 3,
                guard_height: 2,
            }
        );
    }

    #[test]
    fn a_uniform_draw_is_centred_and_bounded() {
        // The distribution nothing else in this crate can see. Every number the
        // optimizer moves comes through here, and a wrong divisor produces a
        // population that still trains, still reproduces and still climbs --
        // it simply climbs in one direction. Asserted on the moments rather
        // than on the arithmetic, because the arithmetic is what was wrong.
        let mut rng = Rng::new(1);
        let n = 200_000;
        let mut sum = 0.0f64;
        let mut low = f32::MAX;
        let mut high = f32::MIN;
        for _ in 0..n {
            let value = uniform(&mut rng);
            sum += value as f64;
            low = low.min(value);
            high = high.max(value);
        }
        let mean = sum / n as f64;
        assert!(mean.abs() < 0.01, "mean {mean}");
        assert!(low >= -1.0 && low < -0.99, "low {low}");
        assert!(high < 1.0 && high > 0.99, "high {high}");
    }

    #[test]
    fn a_fresh_network_is_centred_on_zero() {
        // The other half of the same claim, read off the thing the optimizer
        // actually starts from. `Model::random`'s doc argues that a population
        // initialised too wide starts saturated and mutation cannot walk it
        // back; that argument is only worth having if the initialisation is
        // the one it describes.
        let mut rng = Rng::new(11);
        let model = Model::random(&mut rng);
        let inputs = ModelShape::CURRENT.inputs;
        let first = inputs * ModelShape::CURRENT.hidden;
        let limit = 1.0 / (inputs as f32).sqrt();
        let layer = &model.weights()[..first];
        let mean = layer.iter().sum::<f32>() / layer.len() as f32;
        assert!(mean.abs() < limit / 10.0, "mean {mean} against a limit of {limit}");
        assert!(layer.iter().all(|w| w.abs() <= limit), "a weight outside the limit");
        assert!(
            layer.iter().any(|w| *w < -limit * 0.9) && layer.iter().any(|w| *w > limit * 0.9),
            "the initialisation does not reach both ends of its range"
        );
        // Biases start at zero, which is what the constructor claims.
        let biases = &model.weights()[first..first + ModelShape::CURRENT.hidden];
        assert!(biases.iter().all(|b| *b == 0.0));
    }

    #[test]
    fn frozen_inference_is_a_function_of_its_inputs() {
        let mut rng = Rng::new(7);
        let model = Model::random(&mut rng);
        let obs = fighter_facing(137);
        let mut a = LearnedArticulatedPolicy::new(model.clone());
        let mut b = LearnedArticulatedPolicy::new(model);
        assert_eq!(a.decide(&obs), b.decide(&obs));
        // And again after the memory has been primed differently on one of
        // them, once both have been reset -- which is the property `reset` is
        // for.
        a.decide(&fighter_facing(1));
        a.decide(&fighter_facing(2));
        a.reset();
        b.reset();
        assert_eq!(a.decide(&obs), b.decide(&obs));
    }

    #[test]
    fn a_composed_command_is_one_the_world_accepts() {
        // Every entry of every head, against a body that can be commanded. The
        // arm ranges and the move magnitude are validated by
        // `World::submit_articulated_v1`, and a refused command is the neutral
        // one -- so a table entry that is one raw unit out of range would not
        // fail loudly, it would quietly delete a third of the action space.
        for bearing_degrees in [0i32, 37, 90, 145, 180, 271, 359] {
            let mut obs = fighter_facing(0);
            obs.body_yaw = Angle::from_degrees(bearing_degrees);
            obs.opponents[0].body_position = Vec3::new(
                Fx::from_int(4) * obs.body_yaw.cos(),
                Fx::from_int(4) * obs.body_yaw.sin(),
                Fx::ZERO,
            );
            for footwork in 0..FOOTWORK_COUNT as u8 {
                for posture in 0..POSTURE_COUNT as u8 {
                    for weapon_bearing in 0..WEAPON_BEARING_COUNT as u8 {
                        let action = LearnedActionV1 {
                            footwork,
                            weapon_height: 2,
                            weapon_bearing,
                            posture,
                            guard_height: 1,
                        };
                        let command = compose(&obs, action);
                        let payload = command.payload_bytes();
                        assert_eq!(
                            ArticulatedCommandV1::from_payload_bytes(&payload),
                            Ok(command),
                            "{action:?} at {bearing_degrees} degrees is not a legal command"
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn nothing_in_sight_costs_two_heads_their_expression_and_no_more() {
        // The script's rule, adopted: with nobody visible the weapon arm rests
        // and the intent is Hold, whatever the posture head asked for. What
        // must survive is the footwork -- the fixture spawns outside sight
        // range, so a policy that could not walk while blind would never reach
        // the fight at all.
        let blind = ArticulatedObservation {
            body_yaw: Angle::from_degrees(90),
            ..ArticulatedObservation::BLANK
        };
        let commit = LearnedActionV1 {
            footwork: 0,
            weapon_height: 0,
            weapon_bearing: 1,
            posture: 1,
            guard_height: 2,
        };
        let command = compose(&blind, commit);
        assert_eq!(command.intent, Intent::Hold);
        let (reach, effort, _) = Posture::Rest.triple();
        assert_eq!(command.arms[1].reach, reach);
        assert_eq!(command.arms[1].effort, effort);
        assert_eq!(command.arms[1].bearing, blind.body_yaw, "no invented geometry");
        assert_ne!(command.move_dir, Vec2::ZERO, "a blind body still walks");
        // The two heads that do survive: the weapon height and the guard.
        assert_eq!(command.arms[1].height, CombatHeight::LOW);
        assert_eq!(command.arms[0].height, CombatHeight::HIGH);
    }

    #[test]
    fn version_two_appends_without_repointing_a_version_one_feature() {
        let mut obs = fighter_facing(17);
        obs.body_yaw = Angle::from_degrees(30);
        obs.blood_fraction = Fx::from_ratio(1, 8);
        obs.shock = Fx::from_ratio(1, 4);
        obs.integrity_fraction = [
            Fx::from_ratio(1, 5), Fx::from_ratio(2, 5), Fx::from_ratio(3, 5),
            Fx::from_ratio(4, 5), Fx::ONE,
        ];
        obs.body_velocity = Vec3::new(Fx::from_ratio(1, 8), Fx::from_ratio(1, 16), Fx::ZERO);
        obs.arms[0].hand = Vec3::new(Fx::from_ratio(1, 2), Fx::from_ratio(1, 4), Fx::from_ratio(3, 4));
        obs.arms[0].fatigue = Fx::from_ratio(1, 3);
        obs.arms[1].hand = Vec3::new(Fx::from_ratio(3, 4), -Fx::from_ratio(1, 4), Fx::ONE);
        obs.arms[1].fatigue = Fx::from_ratio(2, 3);
        obs.opponents[0].body_position = Vec3::new(Fx::from_int(3), Fx::from_int(2), Fx::ZERO);
        obs.opponents[0].body_yaw = Angle::from_degrees(200);
        obs.opponents[0].body_velocity = Vec3::new(Fx::from_ratio(1, 10), -Fx::from_ratio(1, 20), Fx::ZERO);
        obs.opponents[0].contact_timing = Fx::from_ratio(3, 7);
        obs.opponents[0].severed_mask = 0b00101;
        obs.opponents[0].weapons[1] = Some(SegmentPose {
            hilt: Vec3::new(Fx::from_ratio(5, 2), Fx::from_ratio(5, 2), Fx::ONE),
            tip: Vec3::new(Fx::from_ratio(3, 2), Fx::from_int(3), Fx::from_ratio(11, 10)),
            radius: Fx::from_ratio(1, 20),
        });
        obs.opponents[0].shield.present = true;
        obs.opponents[0].shield.centre = Vec3::new(Fx::from_int(3), Fx::from_ratio(5, 2), Fx::from_ratio(9, 10));
        let mut v2 = [0.0; LEARN_V2_FEATURE_COUNT];
        let memory = FeatureMemory {
            primed: true, tick: 16, hilt_height: 0.75, tip_range: 2.0,
        };
        let context = TacticalContextV1 { phase: TacticalPhase::Measure, plan: None, threat: None, opponent_recovering: false };
        write_features_v2(&obs, memory, context, &mut v2);
        // Independently frozen IEEE-754 words, not a comparison with
        // `write_features`: both V2 and V1 use that function, so comparing its
        // output with itself would stay green if two old columns traded places.
        // This fixture makes all 41 columns nonzero, including both memory
        // rates, and every value is sourced from a different observation field
        // wherever the layout permits. A moved assignment therefore names its
        // displaced index rather than merely changing an aggregate digest.
        let expected_v1_bits = [
            1065353216, 1064620288, 1049995264, 999996639, 1040187392,
            1048576000, 1045220352, 1053608960, 1058642176, 1061997568,
            1065353216, 1057937920, 3171490816, 1050589526, 3164100608,
            1054168406, 1051372032, 1049965526, 3198697174, 1057896676,
            1059760640, 1055310144, 1065318656, 1032026112, 3212581632,
            1043454976, 1048335484, 3200191400, 1054567424, 1053609165,
            1065353216, 1051927136, 1047302400, 1058828658, 1054511072,
            1038764416, 1057896676, 1082130432, 1082130432, 1065353216,
            1056964495,
        ];
        for (index, (&found, &expected)) in v2[..LEARN_FEATURE_COUNT]
            .iter().zip(expected_v1_bits.iter()).enumerate()
        {
            assert_eq!(found.to_bits(), expected, "V1 feature {index} was repointed");
        }
        assert_eq!(LEARN_V2_FEATURE_COUNT, LEARN_FEATURE_COUNT + 10 + 3 + 5);
        assert_eq!(ModelShapeV2::CURRENT, ModelShapeV2 { inputs: 59, hidden: 64, outputs: 26 });
    }

    #[test]
    fn version_two_appends_intents_after_all_eighteen_old_logits() {
        assert_eq!(LEARN_ACTION_LOGITS, 18);
        assert_eq!(LEARN_V2_ACTION_LOGITS, LEARN_ACTION_LOGITS + TACTICAL_INTENT_COUNT);
        for intent in 0..TACTICAL_INTENT_COUNT {
            let mut logits = [0.0; LEARN_V2_ACTION_LOGITS];
            logits[LEARN_ACTION_LOGITS + intent] = 1.0;
            assert_eq!(LearnedActionV2::from_logits(&logits).tactical_intent, intent as u8);
        }
    }

    #[test]
    fn one_intent_runs_to_a_motor_boundary_before_the_next_is_sampled() {
        let mut obs = fighter_facing(0);
        obs.standing_height = Fx::from_ratio(9, 5);
        obs.arm_length = Fx::ONE;
        obs.hand_radius = Fx::from_ratio(1, 10);
        obs.weapons[1] = Some(SegmentPose {
            hilt: obs.body_position,
            tip: Vec3::new(Fx::from_int(2), Fx::ZERO, Fx::from_ratio(9, 10)),
            radius: Fx::from_ratio(1, 20),
        });
        obs.opponents[0].body_position = Vec3::new(Fx::from_ratio(5, 2), Fx::ZERO, Fx::ZERO);
        obs.opponents[0].regions[BodyPart::Torso as usize] = RegionVolume {
            lower: Vec3::new(Fx::from_ratio(5, 2), Fx::ZERO, Fx::from_ratio(1, 2)),
            upper: Vec3::new(Fx::from_ratio(5, 2), Fx::ZERO, Fx::from_ratio(13, 10)),
            radius: Fx::from_ratio(1, 2), present: true,
        };
        let mut model = ModelV2::zeros();
        let bias = model.len() - LEARN_V2_ACTION_LOGITS;
        model.weights_mut()[bias + LEARN_ACTION_LOGITS + TacticalIntentV1::StrikeBest.index()] = 1.0;
        let mut policy = LearnedTacticalPolicyV2::new(model);
        policy.decide(&obs);
        assert_eq!(policy.planner().phase(), TacticalPhase::Chamber);
        obs.tick += 1;
        assert_eq!(policy.action(&obs), None, "a chamber sampled a contradictory intent");
    }

    #[test]
    fn mirrored_tactical_features_have_only_the_documented_sign_changes() {
        let mut left = fighter_facing(9);
        for (i, region) in left.opponents[0].regions.iter_mut().enumerate() {
            *region = RegionVolume {
                lower: Vec3::new(Fx::from_int(3 + i as i32), Fx::from_int(1), Fx::ZERO),
                upper: Vec3::new(Fx::from_int(3 + i as i32), Fx::from_int(1), Fx::ONE),
                radius: Fx::from_ratio(1, 4), present: true,
            };
        }
        let mut right = left;
        right.opponents[0].body_position.y = -right.opponents[0].body_position.y;
        for region in &mut right.opponents[0].regions {
            region.lower.y = -region.lower.y; region.upper.y = -region.upper.y;
        }
        let context = TacticalContextV1 { phase: TacticalPhase::Commit, plan: None, threat: None, opponent_recovering: false };
        let mut a = [0.0; LEARN_V2_FEATURE_COUNT]; let mut b = [0.0; LEARN_V2_FEATURE_COUNT];
        write_features_v2(&left, FeatureMemory::EMPTY, context, &mut a);
        write_features_v2(&right, FeatureMemory::EMPTY, context, &mut b);
        for part in 0..BodyPart::COUNT {
            assert_eq!(a[41 + part * 2].to_bits(), (-b[41 + part * 2]).to_bits());
            assert_eq!(a[42 + part * 2].to_bits(), b[42 + part * 2].to_bits());
        }
        assert_eq!(&a[51..], &b[51..]);
    }
}
