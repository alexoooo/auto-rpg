//! The feet: where they hold, and when they cross.
//!
//! Session 02 brought [`StrikePlanner`] across the embodied seam untuned, and
//! session 04 measured what that cost. Over 800 trials of `embodied-duel-v1`
//! two tactical bodies produce **970,095 weapon-on-body contact resolutions**,
//! 1,213 per trial, and finish 794 of 800 fights on the clock with the Brute
//! still holding 85% of the health it started with. The bodies are not failing
//! to reach each other. They stand inside each other and rub: damage in this
//! simulation is kinetic energy, `CONTACT_ENERGY_FLOOR` withholds 144 raw of
//! every share, and a blade at nearly zero relative speed clears that floor by
//! nothing however many times it touches.
//!
//! The arithmetic of the rub is geometric and needs no corpus to see. A
//! retracted arm is not retracted to the shoulder: `neutral_world_command`
//! asks for `reach: Fx::ZERO` and the actuator clamps that up to
//! `ARM_MIN_REACH_RAW`, a quarter of the arm. So a body doing nothing at all
//! holds its blade `arm_length / 4 + blade` in front of it, which on the
//! fixture's Brute is **1.66 world units** -- and the old measure floor let it
//! stand `MEASURE_MIN_FRACTION * (arm_length + blade)` away, three fifths of
//! 2.30, which is **1.38**. The club was a quarter of a world unit inside the
//! Fighter's chest before either body had decided to do anything.
//!
//! # What the corpus said back, which is not what the session plan predicted
//!
//! The plan predicted that stopping the rub would convert "1,566 worthless facts
//! into a handful of expensive ones", and named the test: weapon-on-body per
//! trial falling by an order of magnitude **while severances hold or rise**.
//! Swept, the two halves are anti-correlated over most of the range. Measure
//! discipline on its own does not buy the order of magnitude: the shipped
//! standoff and floor with the feet still planted take weapon/body from 1,213
//! per trial to 1,020 and leave severances at 107 against 133 -- below the
//! proviso rather than above it. Pushing the floor out to full reach does
//! quieten the fight -- 435 per trial -- and takes severances down to 75 with
//! it, and the pooled win rate against the script down to 36.13%. **Quieter and
//! less decisive is the shape of the whole curve**, and it is what makes the
//! plan's severance proviso load-bearing rather than decorative: it is the
//! clause that stops the objective being satisfied by a fighter that simply
//! stops touching.
//!
//! What converted rubs into blows at all was [`Footwork::lunge`], which the plan
//! did not enumerate and which is its own thesis sentence: **the feet cross
//! measure during the commit instead of standing in it.** Against the same
//! standoff and floor with the feet planted it takes weapon/body from 1,020 per
//! trial to 908 and severances from 107 to 162, which is the only place in this
//! space where both halves of the plan's conjunction move the right way at
//! once. It is not close to the preregistered acceptance, and the record says
//! so rather than saying it is a step towards it.
//!
//! # The objective these four values were chosen on, which was got wrong once
//!
//! **The session that landed this file swept on a ratio the plan never names**
//! -- severances per ten thousand weapon-on-body contacts -- and shipped the
//! peak of it. The plan's declared metric is a conjunction on two *absolute*
//! quantities: *"the number to watch is not the win rate, it is `weapon/body`
//! per trial; if that falls by an order of magnitude while severances hold or
//! rise, the fight has become a fight."* A ratio can be raised by a fighter
//! that stops touching, which is exactly the failure the sentence's second
//! clause exists to exclude, and the two objectives disagree: the ratio peaks
//! at a floor of three quarters and the plan's own reading picks four fifths.
//!
//! The values here are the ones the plan's reading picks, evaluated over the
//! **complete admissible grid** -- every swept value that lies inside its own
//! derived band -- rather than over a coordinate path. That is one margin, one
//! lunge, two floors and three unwinds, six points, all six measured. The
//! working is in `docs/performance/embodied-tactical-policy.md`; what belongs
//! here is the rule, because a constant whose objective is not written down
//! beside it is a constant the next session will re-tune against a memory.
//!
//! # Why a configuration and not an edit
//!
//! `guard.rs` copies three of `script.rs`'s constants rather
//! than importing them, because the script is the frozen control of this topic
//! and a control that moves with its subject measures nothing. The same argument
//! runs the other way here. [`StrikePlanner`] was also driven by
//! `TacticalArticulatedPolicy`, which is what `#/arena` rendered and what
//! `docs/performance/` records under `articulated-duel-v1`; retuning the
//! constants in place would have retuned that policy too, silently, on a corpus
//! nobody was going to re-run. [`Footwork::ARTICULATED`] is therefore that
//! file's own two numbers exactly, [`Footwork::EMBODIED`] is what session 04
//! swept, and `StrikePlanner::default()` still answers the articulated row.
//!
//! **Session 05 deleted that second driver and the row stays**, which is worth
//! saying because the obvious cleanup is to fold it back into constants now that
//! one policy reads it. What it buys is no longer isolation from a second
//! policy: it is that every sweep table in `docs/performance/` is reproducible
//! from `lab embodied --footwork` rather than from an edit to a constant and a
//! rebuild, which is how session 04 produced them and why the review that
//! followed could not check one of them.
//!
//! **Every table is reproducible from a shipped command.** `lab embodied
//! --footwork margin,floor,lunge,unwind` replaces this row for the two registry
//! entries that drive a planner, so a sweep is one process and not a rebuild.
//! It did not exist while the sweeps were being run, and the review that
//! followed could not check a single published row without editing a constant
//! and rebuilding; that is why it exists now.
//!
//! **The isolation was proven by re-running the articulated corpus rather than
//! argued from the type.** Ten `lab trace --policy tactical` fights, the striker
//! strike corpus, `tactical-mechanics --quick` and the frozen 900-cell
//! calibration corpus were run at `44b05d4` and against this tree, and every
//! byte agreed. That is the claim that matters, and it is not the same claim as
//! the one an earlier draft of this header made: setting [`Footwork::EMBODIED`]
//! byte-equal to [`Footwork::ARTICULATED`] does **not** reproduce the embodied
//! policy session 03 landed, because [`Footwork::unwind_twist`] is reachable on
//! a body that has hips and unreachable on one that does not. Held unreachable
//! as well, the reproduction is exact to every counted column.
//!
//! # The constant that is named by the plan and is not here
//!
//! `COMMIT_MIN_OPENING_RAW` was named by the embodied fight's plan set as the
//! smallest opening the planner will spend a commit on, and **that topic did
//! not land it.** The plan set was deleted when the topic closed, so
//! `docs/performance/embodied-tactical-policy.md` now carries the name and this
//! paragraph is the only other place it appears. What it landed instead is the evidence that the lever it sits
//! on points the wrong way on this fixture: every swept change that made a body
//! commit *less* -- the floor at full reach, the standoff at zero -- lowered
//! both severances and the pooled win rate against the script, and no swept
//! point that reduced weapon-on-body contact raised decisiveness with it.
//! Waiting for a better opening is a way of committing less. A session that
//! wants to rescue the idea should expect to have to change what "opening"
//! means -- a plate clearance rather than a depth -- or what "wait" means --
//! circling rather than holding ground -- because the plain reading of both was
//! measured here as a cost.
//!
//! [`StrikePlanner`]: crate::StrikePlanner

use fx::Fx;

/// How far past its own reach a body will still chamber, in `Fx` raw. A half.
///
/// `reach` is `arm_length + blade`, the distance from a body's own origin to a
/// fully extended tip. The margin is the standoff it will hold **outside** that
/// and still commit from, which is what makes the commit a crossing rather than
/// a poke: with [`LUNGE_SPEED_RAW`] the feet close the gap while the arm sweeps.
///
/// **Bounded above by the ground that lunge can actually cover.** A commit runs
/// `COMMIT_TICKS` = 28 ticks, and at half of `Stats::move_speed` that is 0.751
/// world units for the Fighter (agility 6) and 0.639 for the Brute (agility 2)
/// before acceleration is charged for -- so a standoff past about 0.64 is ground
/// the slower body's own commit cannot cross, and its blade arrives where its
/// body is not.
///
/// **Bounded below by the same inequality read from the other end**: a lunge
/// that carries a body further than the whole measure band is wide ends the
/// commit out the near side of it, and the margin is one of the two terms in
/// that width. At the shipped floor and lunge the pair admits
/// `[0.4113, 0.6391]`, and a half sits inside with room at both ends. **The
/// band moves with the floor** -- it was `[0.3263, 0.6391]` at the floor of
/// three quarters this file shipped with first, because a lower floor is a
/// wider measure band -- and it is the *shipped* combination that has to sit
/// inside, which is what `Footwork::EMBODIED` is passed to the test for.
///
/// **The corpus chose the value from inside that band**, on the plan's own
/// metric: weapon-on-body resolutions per trial, 800 trials of
/// `embodied-duel-v1`, with severances beside it because the plan's proviso is
/// that they hold at or above the before state's 133. At `min_fraction` 4/5,
/// `lunge` 1/2 and `unwind` 7/8: **0 -> 866.7 at 115 severances, 1/10 -> 904.4
/// at 131, 1/5 -> 913.0 at 142, 1/2 -> 907.8 at 162, 3/4 -> 908.9 at 163,
/// 1 -> 910.1 at 161.** The two quietest rows are the two that fail the
/// proviso, which is the whole curve's shape in one line; of the four that pass
/// it a half is the quietest. The rows at 3/4 and 1 are outside the derived
/// band anyway, and the curve is flat across them because the gate stops
/// binding -- `choose_plan` produces no candidate from further out, so
/// `in_measure`'s upper bound is no longer what decides.
///
/// `the_measure_margin_is_the_ground_one_commit_can_cross` bounds it from both
/// sides.
pub const MEASURE_MARGIN_RAW: i32 = 32_768;

/// The closest a body will stand before its feet give ground, as a fraction of
/// that same reach. Four fifths.
///
/// **The lower end is derived off `sim`'s own published actuator floor**, on
/// `GUARD_READ_DEADBAND_RAW`'s precedent. `ARM_MIN_REACH_RAW` is a quarter, so a
/// body doing nothing holds its tip at `arm_length / 4 + blade`; as a fraction
/// of `arm_length + blade` that is **0.669 on the Fighter and 0.723 on the
/// Brute**. Below that fraction a body stands with its own resting blade past
/// its opponent's origin, which is the rub, and it is there before either body
/// has decided anything.
///
/// **The upper end is not the one an earlier draft named.** That draft gave the
/// arm's other extension -- `STRIKE_COMMIT_REACH * arm_length + blade` over
/// `arm_length + blade`, **0.972 and 0.977** -- and it is real and it does not
/// bind. What binds is the measure band: `reach * (1 - min_fraction) + margin`
/// has to be at least the ground one commit covers, or the commit ends out the
/// near side of the band it chambered from. At the shipped margin and lunge
/// that caps the floor at **0.8521**, so the admissible interval is
/// `(0.7228, 0.8521]` and the swept row at seven eighths was outside it rather
/// than merely worse inside it.
///
/// **Four fifths is what the plan's own metric picks from inside that band.**
/// Weapon-on-body resolutions per trial with severances beside them, 800 trials,
/// at `margin` 1/2, `lunge` 1/2 and `unwind` 7/8: **1/2 -> 1083.8 at 214,
/// 3/5 -> 1051.2 at 213, 7/10 -> 992.2 at 191, 3/4 -> 941.5 at 219,
/// 4/5 -> 907.8 at 162, 7/8 -> 828.2 at 120, 1 -> 435.2 at 75.** The last two
/// fall through the plan's proviso -- severances below the before state's 133 --
/// and seven eighths is outside the derived band besides. Of the five that
/// pass, four fifths is the quietest, and the full-reach row is the whole
/// argument in one line: a body held a full reach out rubs 435 times a trial
/// instead of 908 and lands **less than half** the blows.
///
/// **This is the constant the review moved**, and it moved because the session
/// that landed it swept on severances per ten thousand contacts -- a ratio the
/// plan never names -- where three quarters is the peak. The ratio and the
/// plan's conjunction disagree here and nowhere else in this file.
///
/// `the_measure_floor_clears_a_resting_blade` bounds it from both sides.
pub const MEASURE_MIN_FRACTION_RAW: i32 = 52_428;

/// How fast the feet cross measure while the commit sweeps, as a fraction of the
/// body's own `move_speed`. A half.
///
/// See [`Footwork::lunge`] for what it is and why it is one number and not two.
///
/// **Bounded by the same two inequalities [`MEASURE_MARGIN_RAW`] is, solved for
/// the speed instead of the standoff**: too slow and the commit never crosses
/// the margin it chambered from, too fast and it carries the body clean through
/// the measure band. At the shipped floor that admits `[0.3911, 0.5590]`, and a
/// half is the only swept value inside it. The band was `[0.3911, 0.6155]` at
/// the floor of three quarters this file first shipped: a higher floor is a
/// narrower measure band, so raising the floor lowers the ceiling on the lunge.
///
/// **Swept at the shipped margin, floor and unwind, over 800 trials**, as
/// weapon-on-body resolutions per trial with severances beside them:
/// **0 -> 1020.1 at 107, 1/4 -> 896.4 at 148, 3/8 -> 927.1 at 154,
/// 1/2 -> 907.8 at 162, 5/8 -> 908.6 at 170, 3/4 -> 923.3 at 161,
/// 15/16 -> 917.4 at 166, 1 -> 1062.1 at 191.** The two ends of the curve are
/// the two failures a half sits between: at zero the body plants and rubs, at
/// one it walks through its opponent and rubs again. The quieter row at a
/// quarter is **outside the derived band** -- a commit at that speed never
/// crosses the standoff it chambered from -- which is the case for deriving the
/// band before reading the corpus rather than after.
///
/// `the_lunge_is_bounded_by_the_two_ways_a_commit_wastes_itself` holds both
/// ends.
pub const LUNGE_SPEED_RAW: i32 = 32_768;

/// The twist fraction at or past which a planted body puts a foot down. Seven
/// eighths.
///
/// `script.rs`'s `UNWIND_TWIST`, copied for this file's own reason and
/// with the script's argument unchanged: below about a half an ordinary guard
/// change would step, so footwork would become a tax on aiming; at one the step
/// would only begin after the torso had already stopped turning, so the policy
/// would react to the constraint instead of spending it.
///
/// **It is a copied constant and it still owed its own sweep**, because the
/// policy it is copied into is not the policy it was chosen for. Weapon-on-body
/// resolutions per trial with severances beside them, 800 trials, at the shipped
/// margin, floor and lunge: **never fires -> 906.6 at 162, 1/2 -> 924.0 at 186,
/// 3/4 -> 926.1 at 151, 7/8 -> 907.8 at 162, 15/16 -> 905.1 at 164,
/// 1 -> 909.9 at 150.** "Never fires" is a real row rather than a missing one --
/// it is what the planner did before this session, and it is what
/// [`Footwork::ARTICULATED`] still does, because `ObservedStance::present` is
/// false on a body with no legs. Both `1` and "never fires" are outside the
/// derived band `(0.5, 1.0)`.
///
/// **The whole admissible curve spans 905.1 to 926.1 -- two per cent** -- which
/// is worth writing down beside the value: this constant is the least
/// load-bearing of the four, and a session that finds a reason to move it is not
/// contradicting a strong measurement.
///
/// **Fifteen sixteenths measures lower and is not shipped, and the reason is a
/// control rather than a preference.** At 400 seeds it reads 905.1 per trial at
/// 164 severances against seven eighths' 907.8 at 162 -- better on both halves
/// of the plan's conjunction, by 0.3% and two severances. Doubling the corpus to
/// 800 seeds reverses it: 908.1 at 339 against 903.7 at 345, so seven eighths is
/// now the better row on both halves. A margin that changes sign when the seed
/// set doubles is a fact about the seed set. It also races 38.63% against the
/// script where seven eighths races 39.69%. Recorded rather than buried, because
/// the next session to sweep this constant will find the same 0.3% and should
/// know it has already been chased.
///
/// See [`Footwork::unwind_twist`] for why the *request* is deliberately not
/// backed off to match, and
/// `the_unwind_threshold_is_the_scripts_and_never_fires_without_hips` for the
/// bound and the gate.
pub const UNWIND_TWIST_RAW: i32 = 57_344;

/// What a planner's feet are told to do, as configuration rather than as four
/// module constants.
///
/// A struct rather than four `static`s, on `ScriptConfig`'s and
/// `TacticalConfig`'s argument: two builds of one library that differ by a
/// `static` cannot be raced against each other in one process at all, and every
/// number in this topic is a race.
///
/// **That argument was made before anything could carry a row, and for a while
/// it was an argument for a shape nothing used.** The session that introduced
/// this struct swept its four values by editing the constants above and
/// rebuilding, exactly as a `static` would have required, and published sweep
/// tables that no command in this repository could reproduce. `lab embodied
/// --footwork margin,floor,lunge,unwind` is what closes that:
/// `PolicyKind::build_with_footwork` hands the row to the two registry
/// entries that drive a [`StrikePlanner`], and refuses -- by name, with both
/// policies in the sentence -- when neither side has feet to tell.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Footwork {
    /// How far past `arm_length + blade` a body will still chamber.
    pub margin: Fx,
    /// The fraction of `arm_length + blade` at which the feet give ground.
    pub min_fraction: Fx,
    /// How fast the feet cross measure while the commit sweeps, and leave it
    /// again while the arm recovers.
    ///
    /// **This is the one session-04 change the session plan did not enumerate,
    /// and it is the plan's own thesis sentence** -- *"a fighter that holds
    /// measure, then crosses it once at speed, converts 1,566 worthless facts
    /// into a handful of expensive ones"*. Crossing measure is something feet
    /// do, and until this field existed the planner planted them for all 80
    /// ticks of chamber, commit and recovery: its blade carried the arm's sweep
    /// and nothing else. `script.rs` records the identical correction,
    /// made the same way and paid for by the articulated corpus --
    /// `AttackFootwork::Planted` decayed a body to a standstill in about
    /// fourteen ticks and "the arm term alone could not reach
    /// `CONTACT_ENERGY_FLOOR`", so 800 of 800 trials measured the tick limit
    /// instead of the physics.
    ///
    /// **One number and not two**, spent forward on the commit and taken back on
    /// the recovery, because the lunge and its recovery are one decision: a step
    /// worth making into an exchange is worth unmaking out of it, and a second
    /// constant would be a second sweep for something the first one already
    /// fixes. The chamber is deliberately outside it -- that is the wind-up, and
    /// stepping through it is closing before the blade is loaded.
    ///
    /// Zero is the articulated row, and it is a real setting rather than a
    /// disabled one: it is what the planner has always done.
    pub lunge: Fx,
    /// The twist fraction at or past which the feet unwind the torso.
    ///
    /// **The commanded yaw is deliberately left asking for the full turn**, and
    /// the reason is `script.rs`'s, measured before this file existed:
    /// `World::drive_stance` arms a step precisely when the request exceeds the
    /// budget, and re-arms it for as long as the demand persists. A planner that
    /// "asked for the turn it can have" by clamping its own request would end
    /// the step early and leave the twist exactly where it was.
    ///
    /// **What the read buys is the hips' rate, and not a step**, which an
    /// earlier draft of this comment had wrong. `drive_stance` arms a step from
    /// `want != held` alone -- a refused turn -- and no `move_dir` a planner
    /// writes can reach that flag. What a non-zero `move_dir` does reach is
    /// `translating`, which takes the hips from
    /// `STANCE_HIP_STANDING_SPEED_RAW` to `STANCE_HIP_MOVING_SPEED_RAW`, twice
    /// the rate. `hip_target` is the achieved body yaw in both cases, so the
    /// movement vector changes only how quickly the hips chase it. The planner's
    /// answer to a saturated twist is therefore *walking while it unwinds*, not
    /// a smaller ask -- which is also why it costs ground and is spent on the
    /// chamber alone.
    ///
    /// **It is spent on the chamber alone, and that is an ordering rather than a
    /// rule.** `strike_command` writes the unwinding step first and then lets
    /// the commit and the recovery overwrite it, because during those two the
    /// feet already have a job -- see [`Footwork::lunge`] -- and a body cannot
    /// step two ways at once. The chamber is the phase with feet to spare.
    ///
    /// The articulated row carries the same number and never reaches the rule,
    /// because `ObservedStance::present` is false on a body with no legs and the
    /// read is gated on it.
    pub unwind_twist: Fx,
}

impl Footwork {
    /// The articulated planner's own two numbers, unchanged since it was
    /// written, and a lunge of zero -- which is what "the feet are not commanded
    /// during a strike" already meant.
    ///
    /// **This row is a frozen control and not a default worth improving.** Every
    /// measurement in `docs/performance/` taken under `articulated-duel-v1` was
    /// taken with these values, and `#/arena` renders a fight driven by them.
    ///
    /// **Its name and [`Footwork::EMBODIED`]'s survived session 06's rename
    /// sweep, and they are provenance rather than a model qualifier.** A row is
    /// named for the fixture it was swept against; those two fixtures are
    /// `articulated-duel-v1` and `embodied-duel-v1`, and the second of those is
    /// still the name of a live scenario whose fingerprint is pinned. Renaming
    /// these would cost the reader the link between a constant and the sweep
    /// table in `docs/performance/` that produced it, which is the only thing
    /// either name is for.
    pub const ARTICULATED: Footwork = Footwork {
        margin: Fx::from_ratio(1, 10),
        min_fraction: Fx::from_ratio(3, 5),
        lunge: Fx::ZERO,
        unwind_twist: Fx::from_raw(UNWIND_TWIST_RAW),
    };

    /// What session 04 swept against `embodied-duel-v1`.
    ///
    /// `margin` and `lunge` carry the same raw number and that is a coincidence
    /// rather than a shared derivation: the first is a distance in world units
    /// and the second a fraction of a speed, and they were swept on separate
    /// axes. The tests bound them separately for that reason.
    pub const EMBODIED: Footwork = Footwork {
        margin: Fx::from_raw(MEASURE_MARGIN_RAW),
        min_fraction: Fx::from_raw(MEASURE_MIN_FRACTION_RAW),
        lunge: Fx::from_raw(LUNGE_SPEED_RAW),
        unwind_twist: Fx::from_raw(UNWIND_TWIST_RAW),
    };
}

impl Default for Footwork {
    /// The articulated row, so that `StrikePlanner::default()` is the planner
    /// every pinned articulated measurement was taken with.
    fn default() -> Footwork { Footwork::ARTICULATED }
}
