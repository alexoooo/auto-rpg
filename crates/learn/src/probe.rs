//! The corpus, the scalar return, and the population that climbs it.
//!
//! # Why this file has its own decision loop
//!
//! [`policy::run_articulated`] drives **one** policy instance across both sides
//! of a fight, and there is no articulated `TeamPolicy` -- `policy`'s module
//! header argues at length why there cannot be one, and the argument is good:
//! `ArticulatedObservation` has no faction column, so a wrapper cannot route on
//! it without publishing a fact no fighter perceives. Per-side routing belongs
//! to whoever drives the run.
//!
//! This crate is whoever drives the run, and it has to route: the entire
//! measurement is *candidate against frozen baseline*, and a loop that put the
//! candidate on both sides would be measuring self-play. So [`rollout`] is the
//! third copy of that loop in the repository -- the runner's, `lab`'s
//! `measure_articulated_traced`, and this one -- and it is a copy for the same
//! reason `lab`'s is: it needs something the runner does not carry. Two copies
//! drift, so `the_rollout_is_the_run_the_harness_would_have_driven` pins this
//! one against `run_articulated` on the one configuration where the two agree,
//! which is the same guard `lab` uses.
//!
//! # The return function is the experiment
//!
//! v2-17 closed with 99% of fights reaching the tick limit and neither body
//! meaningfully damaged. A win/loss return over that corpus is very nearly a
//! constant, and a policy trained against a constant optimises whatever noise
//! is left -- which is a training curve that goes up and a fighter that has
//! learned nothing. So the return below is shaped, in the spirit of
//! `lab::fitness::fitness`, and **the shaping is only worth having if it
//! discriminates**. `crates/learn/tests/return_discrimination.rs` measures
//! exactly that, against the three scripted policies, and the honest outcome of
//! this session is "it does not" if that is what the numbers say.
//!
//! It is not what they say. Measured 2026-08-10 over 400 mirrored trials each,
//! every candidate on the heroes against the composed script on the monsters:
//!
//! | policy | mean return | standard error | bootstrap 95% CI |
//! |---|---|---|---|
//! | composed | 64.953 | 1.277 | [62.465, 67.348] |
//! | windmill | 82.225 | 0.864 | [80.652, 83.917] |
//! | attack-moves | 75.728 | 1.191 | [73.546, 78.131] |
//!
//! All three pairs are separated by three to eight times their combined
//! standard error and the three intervals are disjoint. Two things follow, and
//! the second is the more interesting: the return has something in it to train
//! against, and **the composed script is the weakest of the three fighters by a
//! wide margin** -- the windmill wins 399 of 400 against the same opponent the
//! composed script beats 330 times. A learned policy is being asked to beat a
//! baseline that a control condition already beats by seventeen points.

use learn_core::checkpoint::{Checkpoint, TrainingRecord};
use learn_core::model::{uniform, LearnedArticulatedPolicy, Model};
use fx::{Fx, Rng};
use policy::{
    ArticulatedPolicy, ArmRoles, ClosingAttackControlPolicy, RunConfig, ScriptedArticulatedPolicy,
    WindmillArticulatedPolicy,
};
use sim::{
    ArticulatedCommandV1, ArticulatedObservation, BodyPart, CombatHeight, ContactKind, EntityId,
    Faction, Intent, Outcome, Replay, ResolutionError, Scenario, SubmitArticulatedOutcome,
    SubmittedCommand, World, BODY_SLOT, NO_REGION,
};
use std::time::Instant;

// ------------------------------------------------------------------ the corpus

/// The scripted opponents a candidate can be measured against.
///
/// Named for what `lab articulated --policy` already calls them, so a figure
/// quoted out of this crate and a figure quoted out of that command are talking
/// about the same fighter.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum Baseline {
    /// The twelve-phase composed script: the reference.
    #[default]
    Composed,
    /// Commit forever, alternating endpoints. The control that says whether the
    /// phases are decoration.
    Windmill,
    /// The composed script with its attack phases' feet put back. The control
    /// that exists because checkpoint A's corpus turned out to be measuring
    /// `AttackFootwork::Planted`.
    ClosingAttack,
}

impl Baseline {
    pub const ALL: [Baseline; 3] = [
        Baseline::Composed,
        Baseline::Windmill,
        Baseline::ClosingAttack,
    ];

    pub fn policy(self) -> Box<dyn ArticulatedPolicy> {
        match self {
            Baseline::Composed => Box::new(ScriptedArticulatedPolicy),
            Baseline::Windmill => Box::new(WindmillArticulatedPolicy),
            Baseline::ClosingAttack => Box::new(ClosingAttackControlPolicy),
        }
    }

    pub const fn name(self) -> &'static str {
        match self {
            Baseline::Composed => "composed",
            Baseline::Windmill => "windmill",
            Baseline::ClosingAttack => "attack-moves",
        }
    }

    pub fn from_name(name: &str) -> Option<Baseline> {
        Baseline::ALL.into_iter().find(|b| b.name() == name)
    }
}

// ------------------------------------------- the phase-randomised control

/// One period of the composed script's whole clock.
///
/// Three clocks run inside `scripted_articulated_command` and they do not share
/// a period: the twelve phases are `tick % 360`, both height selectors are
/// `tick / 90 % 3` (270), and the cut reverses on `tick / 360 % 2` (720). The
/// least common multiple of 270 and 720 is `2^4 * 3^3 * 5`, and an offset drawn
/// uniformly below it is uniform over the script's whole state rather than over
/// one of its three cycles. `the_phase_offsets_cover_the_scripts_whole_period`
/// checks the number against the constants rather than trusting this paragraph.
pub const SCRIPT_PERIOD_TICKS: u32 = 2_160;

/// Mixed into the run seed before drawing an offset.
///
/// So that the offset and the world's own RNG stream are not the same number
/// wearing two hats: `World::new(scenario, seed)` seeds the simulation from the
/// same value, and an opponent whose phase moved in lockstep with the sim's
/// noise would be a second variable nobody asked for.
const PHASE_SALT: u64 = 0x5048_4153_4531_3931;

/// Where this run's opponent starts its clock.
pub fn phase_offset(seed: u64) -> u32 {
    Rng::new(seed ^ PHASE_SALT).below(SCRIPT_PERIOD_TICKS)
}

/// A scripted opponent whose clock starts somewhere the candidate cannot know.
///
/// **This exists because a fixed script can be beaten by reading its clock
/// rather than by fighting it.** `ScriptedArticulatedPolicy` is a pure function
/// of the observation: its phase is `tick % 360` and its guard is
/// `(tick + GUARD_LEAD_TICKS) / 90 % 3`, both of which the candidate can read
/// straight off `obs.tick` -- features 1 and 2 of [`crate::write_features`] are
/// literally the cosine and sine of that phase, put there on purpose. A policy
/// that learns "at phase 3 a chamber is coming" has learned the opponent's
/// timetable and not swordsmanship, and the two are indistinguishable from a
/// mean return.
///
/// The wrapper is the cheapest control that tells them apart: one constant
/// offset per run, drawn from the run seed, added to the tick the delegate
/// reads. The candidate's own observation is untouched, so its phase columns
/// still say where the *world* is in a 360-tick cycle -- they have simply
/// stopped predicting the opponent. An edge that survives this is an edge
/// against a fighter; an edge that collapses was a clock reading.
///
/// **It lives here and not in `policy`.** `ScriptedArticulatedPolicy` is a pure
/// function of the observation with no per-run memory, `script_digest` is
/// defined over what it submits, and the reference script must stay the thing
/// `ARPG-SCRIPT-V1` describes. Per-run state belongs to whoever drives the run,
/// which is this crate -- the same argument `policy`'s module header makes about
/// why there is no articulated `TeamPolicy`.
pub struct PhaseShiftedScript {
    inner: Box<dyn ArticulatedPolicy>,
    offset: u32,
}

impl PhaseShiftedScript {
    pub fn new(baseline: Baseline, seed: u64) -> PhaseShiftedScript {
        PhaseShiftedScript {
            inner: baseline.policy(),
            offset: phase_offset(seed),
        }
    }

    pub fn offset(&self) -> u32 {
        self.offset
    }
}

impl ArticulatedPolicy for PhaseShiftedScript {
    fn decide(&mut self, obs: &ArticulatedObservation) -> ArticulatedCommandV1 {
        // The tick and nothing else. `ArticulatedObservation` is `Copy`, so the
        // shifted view is a stack value that dies at the end of this call and
        // cannot leak into what the world is told; the delegate reads no other
        // column that the tick participates in.
        //
        // Wrapping rather than saturating, because a `u32` tick plus an offset
        // under 2,160 cannot reach `u32::MAX` from any fight this fixture runs
        // and a saturating add would silently freeze the script's clock if one
        // ever did.
        let mut shifted = *obs;
        shifted.tick = obs.tick.wrapping_add(self.offset);
        self.inner.decide(&shifted)
    }

    fn reset(&mut self) {
        self.inner.reset();
    }
}

/// A baseline script, and whether its clock is where the script would put it.
///
/// Two orthogonal facts rather than a fourth [`Baseline`], because they are not
/// four points on one axis: the baseline says *which* script the candidate is
/// fighting and the flag says whether that script is predictable. Folding them
/// would make "the windmill, phase-randomised" unspellable, and the windmill is
/// the control that currently sets the bar.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct Opponent {
    pub baseline: Baseline,
    pub phase_randomised: bool,
}

impl Opponent {
    pub const fn frozen(baseline: Baseline) -> Opponent {
        Opponent { baseline, phase_randomised: false }
    }

    pub const fn randomised(baseline: Baseline) -> Opponent {
        Opponent { baseline, phase_randomised: true }
    }

    /// A fresh opponent for one run, with this run's phase already chosen.
    ///
    /// Per seed rather than per corpus, which is what "per-run constant" means
    /// and is the whole content of the control. It costs one boxed policy per
    /// trial against a fight that runs three thousand six hundred ticks.
    pub fn policy_for(self, seed: u64) -> Box<dyn ArticulatedPolicy> {
        if self.phase_randomised {
            Box::new(PhaseShiftedScript::new(self.baseline, seed))
        } else {
            self.baseline.policy()
        }
    }

    /// The name a table column carries. `+phase` rather than a second column,
    /// so a figure quoted out of a report says which opponent produced it.
    pub const fn label(self) -> &'static str {
        match (self.baseline, self.phase_randomised) {
            (Baseline::Composed, false) => "composed",
            (Baseline::Composed, true) => "composed+phase",
            (Baseline::Windmill, false) => "windmill",
            (Baseline::Windmill, true) => "windmill+phase",
            (Baseline::ClosingAttack, false) => "attack-moves",
            (Baseline::ClosingAttack, true) => "attack-moves+phase",
        }
    }
}

impl From<Baseline> for Opponent {
    fn from(baseline: Baseline) -> Opponent {
        Opponent::frozen(baseline)
    }
}

/// The first seed the optimizer is allowed to score on.
pub const TRAINING_SEED_BASE: u64 = 0;

/// The first held-out seed.
///
/// A million apart rather than adjacent, so that "did the ranges overlap" is
/// answerable by looking at two numbers rather than by arithmetic on a count
/// somebody may have changed. v2-19 freezes 400 mirrored held-out seeds and the
/// whole value of that freeze is that training never saw them;
/// `held_out_seeds_are_disjoint_from_training` is what keeps it true when
/// somebody widens the training set.
pub const HELD_OUT_SEED_BASE: u64 = 1_000_000;

pub fn training_seeds(count: usize) -> Vec<u64> {
    (0..count as u64).map(|i| TRAINING_SEED_BASE + i).collect()
}

pub fn held_out_seeds(count: usize) -> Vec<u64> {
    (0..count as u64).map(|i| HELD_OUT_SEED_BASE + i).collect()
}

/// The pinned fixture reflected across `y = 8`.
///
/// `lab`'s `mirrored_articulated_duel`, re-derived because it is private there,
/// and identical for the reason it gives: the spawn yaws are faction-derived --
/// zero for Heroes, `HALF` for Monsters -- and both are their own negations, so
/// a Y reflection needs no yaw column. The mirror keeps the fixture's name and
/// therefore not its fingerprint; nothing measured on it is the canonical pin.
pub fn mirrored_articulated_duel() -> Scenario {
    let mut scenario = Scenario::articulated_duel();
    let height = scenario.arena().y;
    for unit in scenario.units.iter_mut() {
        unit.spawn.y = height - unit.spawn.y;
    }
    scenario
}

// ----------------------------------------------------------------- one rollout

/// What one candidate-versus-baseline fight produced.
///
/// A narrower [`policy::RunResult`]: the columns the return function reads, the
/// two that say whether the run is trustworthy at all, and the damage pair,
/// which the return does **not** read. It is a separate struct rather than the
/// runner's because the runner's cannot be produced by a loop that routes two
/// policies, and widening `RunResult` with a second policy slot would put an
/// articulated-only concern on the hot path of every legacy rollout in `lab`.
///
/// The damage pair is carried because v2-19's comparison table asks for damage
/// dealt beside the health fractions and reading it off a `World` after the
/// fact is not possible -- the world is gone. It is deliberately not a term in
/// [`shaped_return`]; see [`RETURN_SURVIVAL`] for why a duel's damage and its
/// health fractions are the same axis.
#[derive(Clone, Copy, PartialEq, Debug)]
pub struct Rollout {
    pub outcome: Outcome,
    /// Whether the clock and not a body ended it. Carried separately from the
    /// outcome because `World::timeout` scores on points, so `Decision(Heroes)`
    /// is both a win and a fight nobody finished.
    pub timed_out: bool,
    pub ticks: u32,
    pub hero_health: Fx,
    pub monster_health: Fx,
    pub hero_damage: Fx,
    pub monster_damage: Fx,
    /// Submissions the world did not take as offered. **A non-zero count voids
    /// the run as evidence**: a refused command stores the neutral one, so the
    /// fight that happened is not the fight the policy asked for.
    pub rejected: u32,
    pub state_hash: u64,
}

/// Which of the three ordinary heights this is, or `None`.
///
/// `lab`'s `height_index`, re-derived for the reason every other copy in this
/// crate is: the function is private there. `None` rather than a fourth bucket
/// for the same reason it gives -- the fourth height that exists belongs to a
/// command path no policy in this comparison can reach, and a column that is
/// always zero is a column nobody reads.
fn height_index(height: CombatHeight) -> Option<usize> {
    [CombatHeight::LOW, CombatHeight::MID, CombatHeight::HIGH]
        .iter()
        .position(|candidate| candidate.raw() == height.raw())
}

/// What the mechanics did during a rollout, for the comparison table.
///
/// **Deliberately not fields of [`Rollout`].** Nothing here is read by
/// [`shaped_return`], so nothing here is on the optimizer's path: training
/// passes `None` and pays for none of it, and only the held-out evaluation --
/// which runs a few thousand fights once rather than a few hundred thousand --
/// asks for the columns v2-19's comparison names. The split is the same one
/// `lab`'s `measure_articulated_traced` makes about its frame recorder, and for
/// the same reason: an observer that costs the measured path nothing cannot
/// change what it measures.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Mechanics {
    /// Resolutions by [`ContactKind`]: weapon/weapon, weapon/shield,
    /// weapon/body. **The middle one is "defended contacts"** -- a blade that
    /// met a plate instead of a body.
    pub kinds: [u64; 3],
    /// Weapon/body resolutions by the region they landed in, in [`BodyPart`]
    /// order, with a final bucket for [`sim::NO_REGION`].
    ///
    /// **A zero in the head column is not evidence that a policy chose not to
    /// aim there**, and anything reporting this table has to say so: the three
    /// heights the action vocabulary can command put a blade nowhere near a
    /// Fighter's head, so the column is unreachable rather than unchosen. See
    /// `docs/plans/v2-19-learning-probe.md`.
    pub regions: [u64; BodyPart::COUNT + 1],
    /// Weapon/body resolutions by the height the *attacking* arm was commanded
    /// to on the tick that produced them, plus a bucket for a height that is
    /// none of the three.
    ///
    /// Attributed through the collider slot: a weapon/body fact has exactly one
    /// side holding a limb slot rather than [`sim::BODY_SLOT`], and that side is
    /// the one that swung.
    pub heights: [u64; 4],
    /// `[attacker weapon height][defender guard height]`, ordered pairs of
    /// *commanded* heights, counted once per attacking body per other deciding
    /// body per tick. `lab articulated`'s lockstep audit, on this corpus.
    pub guard_pairs: [[u64; 3]; 3],
    pub severances: u64,
    /// The largest cut-plus-thrust any single weapon/body row carried.
    pub max_blow_raw: u64,
    /// `max(0, after - before)` over every published resolution row.
    ///
    /// **It cannot be anything but zero and `solver_rejections` is why it is
    /// still worth printing** -- `World::resolve_contact` clears the row list
    /// for exactly the condition this measures, so the rows a violation would
    /// appear in are the rows a violation deletes. The pair says "no row created
    /// energy *and* no row went unobserved"; either alone says nothing. `lab`'s
    /// `a_zero_energy_excess_is_only_evidence_while_the_solver_refuses_nothing`
    /// is where that correction is recorded.
    pub max_energy_excess: u64,
    pub solver_rejections: u32,
    pub first_rejection: Option<ResolutionError>,
    pub cap_hits: u32,
    /// Decisions the candidate made, and the nanoseconds its `decide` spent
    /// making them. Inference time, measured where inference happens rather than
    /// in a microbenchmark against a fixture that never moves.
    pub candidate_decisions: u64,
    pub candidate_nanos: u128,
}

impl Mechanics {
    pub fn merge(&mut self, other: &Mechanics) {
        for kind in 0..self.kinds.len() {
            self.kinds[kind] += other.kinds[kind];
        }
        for region in 0..self.regions.len() {
            self.regions[region] += other.regions[region];
        }
        for height in 0..self.heights.len() {
            self.heights[height] += other.heights[height];
        }
        for attack in 0..self.guard_pairs.len() {
            for guard in 0..self.guard_pairs[attack].len() {
                self.guard_pairs[attack][guard] += other.guard_pairs[attack][guard];
            }
        }
        self.severances += other.severances;
        self.max_blow_raw = self.max_blow_raw.max(other.max_blow_raw);
        self.max_energy_excess = self.max_energy_excess.max(other.max_energy_excess);
        self.solver_rejections += other.solver_rejections;
        self.first_rejection = self.first_rejection.or(other.first_rejection);
        self.cap_hits += other.cap_hits;
        self.candidate_decisions += other.candidate_decisions;
        self.candidate_nanos += other.candidate_nanos;
    }

    /// Mean nanoseconds per candidate decision, or zero if it never decided.
    pub fn nanos_per_decision(&self) -> f64 {
        if self.candidate_decisions == 0 {
            0.0
        } else {
            self.candidate_nanos as f64 / self.candidate_decisions as f64
        }
    }
}

/// What a rollout should write down beyond the result it returns.
///
/// A struct rather than two more positional parameters, on the argument
/// `lab::trace::TraceRun` already makes: two same-shaped `Option`s in an
/// argument list are one careless edit away from being silently transposable,
/// and these two are `Option<&mut _>` of unrelated types only by luck.
#[derive(Default)]
pub struct Recorders<'a> {
    pub mechanics: Option<&'a mut Mechanics>,
    /// The normal replay envelope, recorded exactly as
    /// [`policy::run_articulated`] records it: the orders at tick zero and the
    /// **stored** command per decision, never the offered one.
    ///
    /// v2-19 asks for held-out runs to be recorded as replays and for a replay
    /// never to load the checkpoint, and this is the half that makes the second
    /// half true by construction: what lands in the envelope is an
    /// `ArticulatedCommandV1`, so playback needs no model, no weights and no
    /// `learn` at all. `recorded_learned_replays_do_not_load_the_model` is the
    /// value-level assertion.
    pub replay: Option<&'a mut Replay>,
}

/// Drives one fight with a different policy on each side.
///
/// The candidate is always the **heroes** -- the Fighter, with the sword and the
/// shield -- and the baseline is always the monsters, which is `evolve.rs`'s
/// arrangement exactly: fitness then measures "better than the thing we wrote by
/// hand" rather than "better at a symmetric game".
pub fn rollout(
    scenario: &Scenario,
    seed: u64,
    heroes: &mut dyn ArticulatedPolicy,
    monsters: &mut dyn ArticulatedPolicy,
    max_ticks: Option<u32>,
) -> Rollout {
    rollout_with(
        scenario,
        seed,
        heroes,
        monsters,
        max_ticks,
        &mut Recorders::default(),
    )
}

/// The same fight with observers hung off it.
pub fn rollout_with(
    scenario: &Scenario,
    seed: u64,
    heroes: &mut dyn ArticulatedPolicy,
    monsters: &mut dyn ArticulatedPolicy,
    max_ticks: Option<u32>,
    recorders: &mut Recorders,
) -> Rollout {
    heroes.reset();
    monsters.reset();

    let config = RunConfig::default();
    let mut world = World::new(scenario, seed);
    // Set for the reason `run_articulated` sets them: an articulated
    // observation has no order column so nothing reads these, and they reach the
    // state hash anyway -- a driver that skipped them would fingerprint a
    // different world from the one the runner fingerprints for the same seed.
    for (faction, order) in [
        (Faction::Heroes, config.orders[0]),
        (Faction::Monsters, config.orders[1]),
    ] {
        world.set_order(faction, order);
        if let Some(replay) = recorders.replay.as_deref_mut() {
            replay.record_order(0, faction, order);
        }
    }

    // Read once, at spawn. `alive_ids` allocates, and a body that dies mid-fight
    // stops appearing in `pending_decisions` anyway -- so the only thing a
    // per-tick re-read would buy is a slot reuse that this fixture cannot
    // produce, at the cost of an allocation per tick.
    let hero_ids = world.alive_ids(Faction::Heroes);
    let limit = max_ticks.unwrap_or(scenario.max_ticks);
    let mut due: Vec<EntityId> = Vec::new();
    let mut rejected = 0u32;
    // One row per body that decided this tick, cleared and refilled rather than
    // allocated. Only built when somebody is auditing; the optimizer's path
    // leaves it empty forever.
    let mut commanded: Vec<(bool, Option<usize>, Option<usize>)> = Vec::new();
    // And the height each body's weapon arm is *currently* holding, which is not
    // the same list. **A body does not decide every tick** -- `pending_decisions`
    // is periodic and the world keeps the last stored command in between -- so a
    // contact on a tick nobody decided has to be attributed to the command that
    // is still in force, not dropped. Keyed by entity and never cleared.
    let mut standing: Vec<(EntityId, Option<usize>)> = Vec::new();

    while world.outcome().is_none() && world.tick() < limit {
        due.clear();
        due.extend_from_slice(world.pending_decisions());
        commanded.clear();
        for &id in &due {
            let obs = world.observe_articulated(id);
            let candidate = hero_ids.contains(&id);
            let command = if candidate {
                // Timed only for the candidate, and only when asked. The clock
                // read is two calls into the OS around a few thousand multiply
                // -- adds; it is measurable overhead on the thing being measured
                // and the honest place to pay it is the evaluation that reports
                // the number, not the training loop that does not.
                match recorders.mechanics.as_deref_mut() {
                    Some(audit) => {
                        let started = Instant::now();
                        let command = heroes.decide(&obs);
                        audit.candidate_nanos += started.elapsed().as_nanos();
                        audit.candidate_decisions += 1;
                        command
                    }
                    None => heroes.decide(&obs),
                }
            } else {
                monsters.decide(&obs)
            };
            if recorders.mechanics.is_some() {
                // The *offered* command and the roles the policy itself was
                // working from, read before the world has had a chance to refuse
                // anything -- `lab articulated`'s rule, for its reason: the
                // lockstep question is what the two sides asked for, and a
                // refused submission is already counted one field down.
                let roles = ArmRoles::of(&obs);
                let weapon = height_index(command.arms[roles.weapon].height);
                commanded.push((
                    matches!(command.intent, Intent::Attack(_)),
                    weapon,
                    height_index(command.arms[1 - roles.weapon].height),
                ));
                match standing.iter_mut().find(|row| row.0 == id) {
                    Some(row) => row.1 = weapon,
                    None => standing.push((id, weapon)),
                }
            }
            match world.submit_articulated_v1(id, command) {
                SubmitArticulatedOutcome::Stored { command, rejection } => {
                    if rejection.is_some() {
                        rejected += 1;
                    }
                    // The stored command and never the offered one: a refused
                    // submission stores the neutral one, so a replay carrying
                    // the offer would reproduce a fight that did not happen.
                    if let Some(replay) = recorders.replay.as_deref_mut() {
                        replay.record_submitted(
                            world.tick(),
                            id,
                            SubmittedCommand::Articulated(command),
                        );
                    }
                }
                SubmitArticulatedOutcome::NotStored(_) => rejected += 1,
            }
        }
        if let Some(audit) = recorders.mechanics.as_deref_mut() {
            // Ordered pairs, and a body is never its own defender. `lab
            // articulated`'s shape exactly, for its reason: on this fixture only
            // one of the two bodies carries a plate at all, so folding the pair
            // would average the interesting cell with a cell that has no shield
            // in it.
            for (attacker, &(attacking, weapon, _)) in commanded.iter().enumerate() {
                let Some(weapon) = weapon.filter(|_| attacking) else { continue };
                for (defender, &(_, _, guard)) in commanded.iter().enumerate() {
                    if defender == attacker {
                        continue;
                    }
                    if let Some(guard) = guard {
                        audit.guard_pairs[weapon][guard] += 1;
                    }
                }
            }
        }
        let _ = world.step();
        if let Some(audit) = recorders.mechanics.as_deref_mut() {
            for row in world.contact_resolutions() {
                audit.kinds[row.fact.key.kind as usize] += 1;
                audit.max_energy_excess = audit
                    .max_energy_excess
                    .max(row.energy.after_raw.saturating_sub(row.energy.before_raw));
                if row.fact.key.kind != ContactKind::WeaponBody {
                    continue;
                }
                audit.severances += u64::from(row.severed);
                audit.max_blow_raw = audit
                    .max_blow_raw
                    .max(row.cut_raw.saturating_add(row.thrust_raw));
                let region = if row.fact.region == NO_REGION {
                    BodyPart::COUNT
                } else {
                    (row.fact.region as usize).min(BodyPart::COUNT)
                };
                audit.regions[region] += 1;
                // Whichever side of the fact is holding something is the side
                // that swung; the other carries `BODY_SLOT`.
                let swinger = if row.fact.key.a_slot != BODY_SLOT {
                    Some(row.fact.key.a)
                } else if row.fact.key.b_slot != BODY_SLOT {
                    Some(row.fact.key.b)
                } else {
                    None
                };
                let height = swinger
                    .and_then(|id| standing.iter().find(|row| row.0 == id))
                    .and_then(|row| row.1)
                    .unwrap_or(3);
                audit.heights[height] += 1;
            }
        }
    }

    if let Some(audit) = recorders.mechanics.as_deref_mut() {
        audit.cap_hits += world.contact_cap_hits();
        audit.solver_rejections += world.contact_solver_rejections();
        audit.first_rejection = audit.first_rejection.or(world.first_contact_rejection());
    }
    if let Some(replay) = recorders.replay.as_deref_mut() {
        replay.finish(world.tick());
    }

    let settled = world.outcome();
    Rollout {
        outcome: settled.unwrap_or_else(|| world.timeout()),
        timed_out: settled.is_none(),
        ticks: world.tick(),
        hero_health: world.health_fraction(Faction::Heroes),
        monster_health: world.health_fraction(Faction::Monsters),
        hero_damage: world.damage_dealt(Faction::Heroes),
        monster_damage: world.damage_dealt(Faction::Monsters),
        rejected,
        state_hash: world.state_hash(),
    }
}

// ---------------------------------------------------------- the scalar return

/// A settled win, from the heroes' side.
pub const RETURN_WIN: f32 = 100.0;
/// The tick limit reached with the heroes ahead on health.
///
/// Priced where `lab::fitness` prices it and for the same argument: it has to be
/// worth more than a defeat or there is no gradient between fighting badly and
/// dying, and clearly less than a kill or "chip once and run out the clock"
/// becomes the strategy. What is different here is that on the v2-17 corpus
/// **almost every fight ends this way**, so this term is close to a constant
/// offset -- which is exactly why the terms below have to carry the signal.
pub const RETURN_DECISION: f32 = 55.0;
pub const RETURN_MUTUAL: f32 = 20.0;

/// Points per unit of surviving health, and per unit of the opponent's health
/// removed.
///
/// **They are two terms and one axis, and that is a property of the model
/// rather than a choice.** `World::health_fraction` publishes each side's health
/// as a fraction of its own bar, so on a one-against-one fixture "how much of me
/// is left" and "how much of them is gone" are `h` and `1 - m`, and any pair of
/// weights on them is a linear function of `h - m` plus a constant. The plan
/// this session was written against asked for a health differential *and then* a
/// damage-dealt term as separate tiers; they cannot be separate while the only
/// two columns available are two health fractions.
///
/// What the split still buys is the *ratio*. Attrition is weighted above
/// survival, so a policy that trades a point of its own health for a point of
/// the Brute's is rewarded -- which is the direction v2-17's corpus most needs,
/// since the failure mode there is two bodies that never damage each other at
/// all rather than two that trade too eagerly.
///
/// **Measured, and the measurement changes what these two are for.** Over 400
/// mirrored trials of each scripted policy against the composed script
/// (`the_return_components_over_the_corpus`, 2026-08-10), the four terms
/// average -- and sum, exactly, to the mean return, which is what the test
/// asserts rather than prints:
///
/// | policy | outcome | survival | attrition | time | sum |
/// |---|---|---|---|---|---|
/// | composed | 45.825 | 39.533 | 3.482 | -23.887 | 64.953 |
/// | windmill | 55.875 | 39.956 | 10.136 | -23.743 | 82.225 |
/// | attack-moves | 54.150 | 39.872 | 5.235 | -23.528 | 75.729 |
///
/// So **survival is very nearly a constant** -- the Fighter ends between 0.988
/// and 0.999 whatever it does -- and so is the time penalty, because 97-99% of
/// fights reach the clock. The whole of the discrimination is carried by the
/// outcome term, whose span is 10.05 points, and the attrition term, whose span
/// is 6.65. Sixty is therefore the number that makes attrition comparable with
/// the outcome rather than a rounding error beside it, and that is what it is
/// chosen for. Forty on survival buys almost nothing today and is kept because
/// the day a policy learns to lose health is the day it stops being a constant,
/// and a return with no term for it would reward that policy exactly as much.
pub const RETURN_SURVIVAL: f32 = 40.0;
pub const RETURN_ATTRITION: f32 = 60.0;

/// Ticks per point of return lost.
///
/// `lab::fitness::TICK_PENALTY_DIVISOR`, unchanged, and on this corpus it is a
/// constant: essentially every articulated fight reaches the clock, so every run
/// pays exactly `3600 / 150 = 24`. It is kept anyway, because the shape is the
/// part that has to survive the day a fight can end early -- a return with no
/// time term rewards a policy that discovers how to stall, and evolution will
/// find that out long before anybody reads the corpus.
pub const RETURN_TICK_DIVISOR: f32 = 150.0;

/// How good was this fight, from the candidate's point of view?
///
/// Outcome dominates, then the health axis, then a mild time penalty. Written in
/// `f32` because the whole of this crate is outside the determinism contract;
/// the values it reads are `Fx` and the value it produces never becomes one.
pub fn shaped_return(result: &Rollout) -> f32 {
    let outcome = match result.outcome {
        Outcome::HeroesWin => RETURN_WIN,
        Outcome::Decision(Faction::Heroes) => RETURN_DECISION,
        Outcome::MutualDestruction => RETURN_MUTUAL,
        Outcome::Decision(Faction::Monsters) | Outcome::Draw | Outcome::MonstersWin => 0.0,
    };
    let survival = RETURN_SURVIVAL * result.hero_health.to_f32();
    let attrition = RETURN_ATTRITION * (1.0 - result.monster_health.to_f32());
    let dithering = result.ticks as f32 / RETURN_TICK_DIVISOR;
    outcome + survival + attrition - dithering
}

// ----------------------------------------------------------------- statistics

/// A mean with an idea of how much to trust it.
#[derive(Clone, Copy, PartialEq, Debug, Default)]
pub struct Band {
    pub count: usize,
    pub mean: f32,
    /// Sample standard deviation.
    pub sd: f32,
    /// Standard error of the mean, `sd / sqrt(n)`.
    pub stderr: f32,
    /// Percentile bootstrap 95% interval on the mean.
    pub low: f32,
    pub high: f32,
}

impl std::fmt::Display for Band {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "n={:<5} mean={:>8.3} +/- {:>6.3} (sd {:>6.3})  95% CI [{:>8.3}, {:>8.3}]",
            self.count, self.mean, self.stderr, self.sd, self.low, self.high
        )
    }
}

/// Mean, standard error, and a percentile bootstrap interval.
///
/// **Both, not one.** The standard error is what answers "is the gap between
/// two of these bigger than their own noise", which is the question this
/// session owes an answer to; the bootstrap is what stays honest if the return
/// distribution turns out to be two spikes rather than a bell, which on an
/// outcome-dominated return is exactly what it might be. If the two disagree,
/// believe the bootstrap and say so.
///
/// Resampled through [`fx::Rng`] from a caller-supplied seed, so a reported
/// interval can be reproduced.
pub fn band(values: &[f32], seed: u64) -> Band {
    const RESAMPLES: usize = 2_000;
    if values.is_empty() {
        return Band::default();
    }
    let n = values.len();
    let mean = values.iter().sum::<f32>() / n as f32;
    let variance = if n > 1 {
        values.iter().map(|v| (v - mean) * (v - mean)).sum::<f32>() / (n - 1) as f32
    } else {
        0.0
    };
    let sd = variance.sqrt();
    let stderr = sd / (n as f32).sqrt();

    let mut rng = Rng::new(seed);
    let mut means = Vec::with_capacity(RESAMPLES);
    for _ in 0..RESAMPLES {
        let mut sum = 0.0f32;
        for _ in 0..n {
            sum += values[rng.below(n as u32) as usize];
        }
        means.push(sum / n as f32);
    }
    means.sort_by(|a, b| a.partial_cmp(b).expect("returns are finite"));
    Band {
        count: n,
        mean,
        sd,
        stderr,
        low: means[RESAMPLES / 40],
        high: means[RESAMPLES - 1 - RESAMPLES / 40],
    }
}

// ------------------------------------------------------------- the corpus run

/// How to score a candidate.
#[derive(Clone, Debug)]
pub struct ProbeConfig {
    pub generations: u32,
    pub population: usize,
    /// Survivors per generation. `(mu + lambda)` with `mu = elite`.
    pub elite: usize,
    /// **Fixed**, not redrawn per generation.
    ///
    /// `evolve.rs` redraws its seed set every generation, to stop a population
    /// overfitting to one set of spawn positions. That argument does not
    /// transfer: `Scenario::articulated_duel` is hand-placed and the only thing
    /// a seed varies is the sim's RNG stream, so redrawing would buy noise
    /// between generations rather than coverage -- and v2-19 needs a training
    /// seed set a checkpoint can *record*, which a per-generation redraw cannot
    /// give it.
    pub seeds: Vec<u64>,
    /// Score each seed in both orientations.
    ///
    /// **Not two independent samples, and any interval computed over the pooled
    /// set understates itself.** Measured with the composed script on both
    /// sides over sixty seeds, the two orientations of one seed correlate at
    /// rho = 0.135, so a pooled `sd / sqrt(2n)` should be multiplied by
    /// `sqrt(1 + rho)`, about 1.065. Six and a half percent, which does not
    /// overturn a gap that clears its noise three times over, and which every
    /// number this crate reports is nonetheless understating. The orientations
    /// are also not the same distribution -- plain and mirrored differ in spread
    /// by a third -- so a pooled standard deviation is a mixture and not a
    /// spread anybody can interpret.
    ///
    /// Kept because the alternative is halving the sample, and because a policy
    /// that only ever saw one orientation would have no evidence it was not
    /// overfitting to it.
    pub mirrored: bool,
    pub sigma: f32,
    pub threads: usize,
    pub master_seed: u64,
    pub max_ticks: Option<u32>,
    /// Which script the candidate trains against, and whether that script's
    /// clock is predictable.
    ///
    /// **Not recorded in the checkpoint**, which carries the seed set and the
    /// optimizer settings and not this. That is a real gap and it is written
    /// down rather than fixed here: bumping [`crate::CHECKPOINT_FORMAT_VERSION`]
    /// for one column is a change to a format with its own test battery, and the
    /// v2-19 report names the opponent beside every number it prints. A session
    /// that trains more than one checkpoint against more than one opponent
    /// should add the column before it trains the second.
    pub opponent: Opponent,
    pub verbose: bool,
}

impl Default for ProbeConfig {
    fn default() -> ProbeConfig {
        ProbeConfig {
            generations: 20,
            population: 24,
            elite: 6,
            seeds: training_seeds(8),
            mirrored: true,
            sigma: 0.08,
            threads: 4,
            master_seed: 1,
            max_ticks: None,
            opponent: Opponent::frozen(Baseline::Composed),
            verbose: false,
        }
    }
}

/// The scenarios one scoring pass walks, built once.
///
/// A `Scenario` owns a `Dungeon` and a unit vector, so rebuilding it per seed
/// would allocate a level per fight. Two of them cover the mirrored corpus.
pub struct Corpus {
    scenarios: Vec<Scenario>,
}

impl Corpus {
    pub fn new(mirrored: bool) -> Corpus {
        let mut scenarios = vec![Scenario::articulated_duel()];
        if mirrored {
            scenarios.push(mirrored_articulated_duel());
        }
        Corpus { scenarios }
    }

    pub fn trials(&self, seeds: &[u64]) -> usize {
        self.scenarios.len() * seeds.len()
    }

    /// The orientations, in the order every corpus walk visits them.
    ///
    /// Exposed so that a caller needing more than a return per trial -- the
    /// held-out evaluation needs the outcome, the clock, a replay and a contact
    /// audit -- can drive [`rollout_with`] over the same fixtures in the same
    /// order rather than rebuilding two `Scenario`s of its own and hoping they
    /// match.
    pub fn scenarios(&self) -> &[Scenario] {
        &self.scenarios
    }

    /// Every return this policy produced, one per trial, in a fixed order.
    ///
    /// Returns the individual values rather than their mean because the
    /// discrimination measurement needs the distribution, and a caller that
    /// only wants the mean can have it for one line.
    pub fn returns(
        &self,
        seeds: &[u64],
        candidate: &mut dyn ArticulatedPolicy,
        opponent: Opponent,
        max_ticks: Option<u32>,
        out: &mut Vec<f32>,
    ) {
        out.clear();
        for scenario in &self.scenarios {
            for &seed in seeds {
                // Built per seed, because a phase-randomised opponent's whole
                // content is that its clock offset is a property of the run. It
                // is one boxed policy against a fight of three thousand six
                // hundred ticks, and hoisting it would silently turn the control
                // back into a frozen script with an unusual starting phase.
                let mut baseline = opponent.policy_for(seed);
                let result = rollout(scenario, seed, candidate, baseline.as_mut(), max_ticks);
                out.push(shaped_return(&result));
            }
        }
    }
}

/// Mean return of one model over the configured corpus.
pub fn score(model: &Model, corpus: &Corpus, config: &ProbeConfig) -> f32 {
    let mut policy = LearnedArticulatedPolicy::new(model.clone());
    let mut returns = Vec::with_capacity(corpus.trials(&config.seeds));
    corpus.returns(
        &config.seeds,
        &mut policy,
        config.opponent,
        config.max_ticks,
        &mut returns,
    );
    if returns.is_empty() {
        0.0
    } else {
        returns.iter().sum::<f32>() / returns.len() as f32
    }
}

/// Scores every candidate whose score is not already known.
///
/// **The elites' scores are already known and re-scoring them is pure waste.**
/// [`ProbeConfig::seeds`] is fixed rather than redrawn per generation -- which
/// is the whole reason a checkpoint can record it -- so a survivor's score is a
/// deterministic function of a model that did not change. At the shipped elite
/// of 8 in 32 that is a quarter of every generation spent recomputing numbers
/// the previous generation already printed, and on this fixture a quarter of a
/// generation is eighteen seconds.
///
/// It is an optimization that changes no number, and the assertion under
/// `debug_assertions` is what says so: a debug build re-scores every carried
/// value and panics if it disagrees. That is a measurement of the claim rather
/// than a comment making it, and it costs release builds nothing.
///
/// Chunked over the *indices that need work* rather than over the population,
/// because chunking the population would hand one thread the block that holds
/// all the elites and nothing to do. Results still land in index order, so a
/// chunk that finished first cannot reorder the ranking --
/// `training_is_reproducible_across_thread_counts` is what pins that.
fn score_population(population: &[Model], known: &[Option<f32>], config: &ProbeConfig) -> Vec<f32> {
    let mut scores = vec![0.0f32; population.len()];
    if population.is_empty() {
        return scores;
    }
    let pending: Vec<usize> = (0..population.len())
        .filter(|&i| known.get(i).copied().flatten().is_none())
        .collect();
    let mut computed = vec![0.0f32; pending.len()];
    let chunk = pending.len().div_ceil(config.threads.max(1)).max(1);

    std::thread::scope(|scope| {
        for (indices, out) in pending.chunks(chunk).zip(computed.chunks_mut(chunk)) {
            let config = config;
            scope.spawn(move || {
                let corpus = Corpus::new(config.mirrored);
                for (slot, &i) in indices.iter().enumerate() {
                    out[slot] = score(&population[i], &corpus, config);
                }
            });
        }
    });

    for (slot, &i) in pending.iter().enumerate() {
        scores[i] = computed[slot];
    }
    for (i, carried) in known.iter().enumerate().take(population.len()) {
        if let Some(carried) = *carried {
            scores[i] = carried;
            debug_assert_eq!(
                score(&population[i], &Corpus::new(config.mirrored), config),
                carried,
                "a carried elite score is not the score its model produces"
            );
        }
    }
    scores
}

/// A Gaussian draw, by the central limit theorem on twelve uniforms.
///
/// `fx::Rng::gaussian` answers an `Fx`, whose 1/65,536 resolution is coarse
/// enough to quantise a mutation at the sigmas this optimizer uses, so the same
/// Irwin-Hall construction is done in `f32` instead. Twelve because the sum of
/// twelve uniforms on `[0,1)` has variance exactly one, which is what makes the
/// subtraction of six a unit normal without a scale factor to get wrong.
fn gaussian(rng: &mut Rng, sigma: f32) -> f32 {
    let mut sum = 0.0f32;
    for _ in 0..12 {
        sum += (uniform(rng) + 1.0) * 0.5;
    }
    (sum - 6.0) * sigma
}

fn mutate(parent: &Model, sigma: f32, rng: &mut Rng) -> Model {
    let mut child = parent.clone();
    for weight in child.weights_mut() {
        *weight += gaussian(rng, sigma);
    }
    child
}

/// Evolves a network against a frozen scripted opponent.
///
/// `evolve.rs`'s algorithm over `f32` vectors rather than over its `Genome`
/// type: a bounded population, elitism, a fixed scoring seed set, and
/// `std::thread::scope` for the fan-out. What is deliberately **not** carried
/// over is the baseline seeding -- `evolve` starts its population from the
/// hand-tuned genome so that any improvement is a real improvement, and there is
/// no hand-tuned network to start from. Generation zero is random, so the first
/// number this prints is what an untrained network scores and is worth reading
/// as such.
pub fn train(config: &ProbeConfig) -> Checkpoint {
    train_with(config, &mut |_, _| true)
}

/// The same optimizer, reporting the champion after every generation.
///
/// **Two things the plain [`train`] cannot do, and both of them are about a
/// forty-minute run.** The first is that a run which dies at generation 90 of
/// 120 should not lose ninety generations of work, and a caller holding a
/// checkpoint after every generation can write one atomically as it goes. The
/// second is the budget: `watch` returns `false` to stop, so a caller can cap
/// wall clock rather than guessing a generation count that fits it -- and the
/// record the checkpoint carries then says how many generations actually ran,
/// which is the number a reader of the result needs.
///
/// The callback is handed a whole [`Checkpoint`] rather than a `&Model` and a
/// score, so that what a caller writes to disk mid-run is byte-identical to what
/// it would have got at the end. A "progress" artifact in a different shape from
/// the final one is an artifact somebody eventually quotes as the final one.
pub fn train_with(
    config: &ProbeConfig,
    watch: &mut dyn FnMut(u32, &Checkpoint) -> bool,
) -> Checkpoint {
    let mut rng = Rng::new(config.master_seed);
    let elite = config.elite.clamp(1, config.population.max(1));

    let mut population: Vec<Model> = (0..config.population.max(1))
        .map(|_| Model::random(&mut rng))
        .collect();
    let mut best = population[0].clone();
    let mut best_score = f32::NEG_INFINITY;
    let mut ran = 0u32;
    // Generation zero is entirely fresh, so nothing is carried into it.
    let mut known: Vec<Option<f32>> = vec![None; population.len()];

    for generation in 0..config.generations {
        let scores = score_population(&population, &known, config);

        let mut ranking: Vec<usize> = (0..population.len()).collect();
        // Descending by score, ties by index. `partial_cmp` cannot fail here --
        // a return is a sum of finite terms -- and the `unwrap_or` arm is
        // written to keep a NaN from silently reordering the population rather
        // than to handle a case that occurs.
        ranking.sort_by(|&a, &b| {
            scores[b]
                .partial_cmp(&scores[a])
                .unwrap_or(std::cmp::Ordering::Equal)
                .then(a.cmp(&b))
        });

        let champion = ranking[0];
        if scores[champion] > best_score {
            best_score = scores[champion];
            best = population[champion].clone();
        }
        if config.verbose {
            let band = band(&scores, config.master_seed ^ u64::from(generation));
            println!("gen {generation:>3}  best={:>8.3}  {band}", scores[champion]);
        }

        ran = generation + 1;
        // Handed the champion *including* this generation, which is why `ran` is
        // set above rather than after the loop: a checkpoint written here has to
        // describe itself honestly, and "120 generations" on a file that saw 90
        // is the one field a later reader has no way to check.
        if !watch(ran, &record(config, elite, ran, best_score, best.clone())) {
            break;
        }

        let elites: Vec<Model> = ranking.iter().take(elite).map(|&i| population[i].clone()).collect();
        let mut next = elites.clone();
        let mut carried: Vec<Option<f32>> =
            ranking.iter().take(elite).map(|&i| Some(scores[i])).collect();
        let mut parent = 0usize;
        while next.len() < config.population {
            next.push(mutate(&elites[parent % elites.len()], config.sigma, &mut rng));
            carried.push(None);
            parent += 1;
        }
        population = next;
        known = carried;
    }

    record(config, elite, ran, best_score, best)
}

fn record(
    config: &ProbeConfig,
    elite: usize,
    generations: u32,
    best_score: f32,
    model: Model,
) -> Checkpoint {
    Checkpoint {
        training: TrainingRecord {
            generations,
            population: config.population as u32,
            elite: elite as u32,
            sigma: config.sigma,
            master_seed: config.master_seed,
            seeds: config.seeds.clone(),
            training_return: if best_score.is_finite() { best_score } else { 0.0 },
        },
        model,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use learn_core::model::{LearnedArticulatedPolicy, HEIGHTS};
    use policy::{run_articulated, CYCLE_TICKS, HEIGHT_TICKS};

    /// The fixture with the two bodies moved inside each other's sight.
    ///
    /// `runner.rs`'s `duel_in_sight`, for the reason it gives: the shipped
    /// placement is 10.8 apart against a 9.6 sight range, so a test about the
    /// seam rather than about search has to start in contact.
    fn duel_in_sight() -> Scenario {
        let mut scenario = Scenario::articulated_duel();
        scenario.units[0].spawn = fx::Vec2::from_ints(10, 8);
        scenario.units[1].spawn = fx::Vec2::from_ints(14, 8);
        scenario
    }

    #[test]
    fn the_rollout_is_the_run_the_harness_would_have_driven() {
        // The third copy of the decision loop in this repository, pinned
        // against the first. With the *same* policy on both sides the two loops
        // are asking the same question, so they have to produce the same fight
        // down to the state hash -- which is the only thing that can catch this
        // copy drifting from `run_articulated`.
        let scenario = duel_in_sight();
        let config = RunConfig {
            max_ticks: Some(240),
            ..RunConfig::default()
        };
        let harness = run_articulated(&scenario, 3, ScriptedArticulatedPolicy, &config);
        let mine = rollout(
            &scenario,
            3,
            &mut ScriptedArticulatedPolicy,
            &mut ScriptedArticulatedPolicy,
            Some(240),
        );
        assert_eq!(mine.state_hash, harness.state_hash);
        assert_eq!(mine.ticks, harness.ticks);
        assert_eq!(mine.outcome, harness.outcome);
        assert_eq!(mine.hero_health, harness.hero_health);
        assert_eq!(mine.monster_health, harness.monster_health);
        assert_eq!(mine.rejected, harness.rejected);
    }

    #[test]
    fn a_learned_policy_never_submits_a_command_the_world_refuses() {
        // The property that makes every number this crate produces mean
        // anything: a refused command stores the *neutral* one, so a policy
        // whose action table left the legal range would be measured as a body
        // standing still and would look like a policy that is not very good.
        // Random weights rather than trained ones, because it is the table and
        // not the training that is under test.
        for seed in 0..4u64 {
            let mut rng = Rng::new(seed * 7 + 1);
            let mut learned = LearnedArticulatedPolicy::new(Model::random(&mut rng));
            let result = rollout(
                &duel_in_sight(),
                seed,
                &mut learned,
                &mut ScriptedArticulatedPolicy,
                Some(300),
            );
            assert_eq!(result.rejected, 0, "seed {seed}");
        }
    }

    #[test]
    fn held_out_seeds_are_disjoint_from_training() {
        // v2-19's whole comparison rests on this and nothing enforces it except
        // two constants a million apart. Checked at a training set far larger
        // than any this session runs, so that widening the training set is what
        // fails rather than the evaluation quietly scoring on seeds the
        // optimizer had already seen.
        let training: std::collections::HashSet<u64> = training_seeds(100_000).into_iter().collect();
        for seed in held_out_seeds(4_000) {
            assert!(!training.contains(&seed), "held-out seed {seed} was trained on");
        }
        assert!(HELD_OUT_SEED_BASE > TRAINING_SEED_BASE);
    }

    #[test]
    fn the_phase_offsets_cover_the_scripts_whole_period() {
        // 2,160 is a claim about three constants in `policy`, and a claim about
        // somebody else's constants is exactly the kind that stops being true
        // quietly. Recomputed from them rather than pinned as a literal.
        fn gcd(a: u32, b: u32) -> u32 {
            if b == 0 { a } else { gcd(b, a % b) }
        }
        let lcm = |a: u32, b: u32| a / gcd(a, b) * b;
        // The three clocks: twelve phases of `PHASE_TICKS` (which is
        // `CYCLE_TICKS`), the height selector's `HEIGHT_TICKS * 3`, and the cut
        // reversal's `CYCLE_TICKS * 2`.
        let period = lcm(lcm(CYCLE_TICKS, HEIGHT_TICKS * 3), CYCLE_TICKS * 2);
        assert_eq!(period, SCRIPT_PERIOD_TICKS);

        // And the draw actually spreads over it. Sixteen buckets, a thousand
        // seeds: a constant offset -- the failure that would make the control
        // silently useless -- puts everything in one.
        let mut buckets = [0u32; 16];
        for seed in 0..1_000u64 {
            let offset = phase_offset(seed);
            assert!(offset < SCRIPT_PERIOD_TICKS);
            buckets[(offset * 16 / SCRIPT_PERIOD_TICKS) as usize] += 1;
        }
        assert!(
            buckets.iter().all(|&n| n > 20),
            "phase offsets are not spread over the period: {buckets:?}"
        );
        // Deterministic, because a control that moved between two runs of the
        // same evaluation would make the comparison unreproducible.
        assert_eq!(phase_offset(7), phase_offset(7));
    }

    #[test]
    fn a_phase_shifted_opponent_is_the_script_reading_a_different_clock() {
        // Two claims, and the second is the one that makes the control a
        // control. First: the wrapper is the script -- at an offset the wrapper
        // itself chose, it submits exactly what the script submits at the
        // shifted tick, so nothing about the fighter has changed except when it
        // is in its cycle. Second: it is a *different fight*, so the wrapper
        // reached the world at all.
        let mut wrapped = PhaseShiftedScript::new(Baseline::Composed, 11);
        let offset = wrapped.offset();
        assert!(offset > 0, "seed 11 drew a zero offset; pick another seed");

        let scenario = duel_in_sight();
        let mut obs = ArticulatedObservation::BLANK;
        obs.tick = 137;
        obs.subject = EntityId::new(0, 0);
        obs.capabilities = ArticulatedObservation::MOVEMENT
            | ArticulatedObservation::TURNING
            | ArticulatedObservation::RIGHT_GRIP
            | ArticulatedObservation::RIGHT_WEAPON;
        obs.arms[1].equipment = Some(1);
        let mut shifted = obs;
        shifted.tick = 137 + offset;
        assert_eq!(
            wrapped.decide(&obs),
            ScriptedArticulatedPolicy.decide(&shifted),
            "the wrapper is not the script it wraps"
        );

        let frozen = rollout(
            &scenario,
            11,
            &mut ScriptedArticulatedPolicy,
            &mut ScriptedArticulatedPolicy,
            Some(600),
        );
        let randomised = rollout(
            &scenario,
            11,
            &mut ScriptedArticulatedPolicy,
            &mut PhaseShiftedScript::new(Baseline::Composed, 11),
            Some(600),
        );
        assert_ne!(
            frozen.state_hash, randomised.state_hash,
            "the offset never reached the world"
        );
        assert_eq!(randomised.rejected, 0, "a shifted clock submitted an illegal command");

        // And the candidate's side is untouched: only the monsters were
        // wrapped, so the heroes' commands are still the frozen script's.
        // Checked by wrapping *nothing* and getting the frozen fight back.
        let again = rollout(
            &scenario,
            11,
            &mut ScriptedArticulatedPolicy,
            &mut PhaseShiftedScript::new(Baseline::Composed, 11),
            Some(600),
        );
        assert_eq!(again.state_hash, randomised.state_hash, "the control is not reproducible");
    }

    #[test]
    fn an_audited_rollout_is_the_rollout_it_audits() {
        // The recorder is an observer and the fight must not be able to tell it
        // is there -- `lab`'s `a_traced_run_is_the_run_the_gate_measured`, on
        // this loop. It is obvious from the code today and it is exactly the
        // kind of obvious that a later audit reading something it has to compute
        // could quietly stop being.
        let scenario = duel_in_sight();
        let plain = rollout(
            &scenario,
            5,
            &mut ScriptedArticulatedPolicy,
            &mut ScriptedArticulatedPolicy,
            Some(600),
        );
        let mut mechanics = Mechanics::default();
        let mut replay = sim::Replay::new(&scenario, 5);
        let audited = rollout_with(
            &scenario,
            5,
            &mut ScriptedArticulatedPolicy,
            &mut ScriptedArticulatedPolicy,
            Some(600),
            &mut Recorders {
                mechanics: Some(&mut mechanics),
                replay: Some(&mut replay),
            },
        );
        assert_eq!(audited, plain);

        // The audit saw the fight, and the totals are internally consistent:
        // every weapon/body row lands in exactly one region bucket and exactly
        // one height bucket.
        let contacts: u64 = mechanics.kinds.iter().sum();
        assert!(contacts > 0, "nothing touched in six hundred ticks");
        let body = mechanics.kinds[sim::ContactKind::WeaponBody as usize];
        assert_eq!(mechanics.regions.iter().sum::<u64>(), body);
        assert_eq!(mechanics.heights.iter().sum::<u64>(), body);
        assert_eq!(mechanics.heights[3], 0, "a script commanded a fourth height");

        // And the replay reproduces the run it recorded, which is the property
        // v2-19 asks the held-out corpus for.
        assert!(replay.is_intact());
        assert_eq!(replay.play().state_hash(), plain.state_hash);
    }

    #[test]
    fn no_attack_in_the_vocabulary_can_be_credited_to_a_head() {
        // **A zero in the head column of [`Mechanics::regions`] means
        // "unreachable", not "the policy chose otherwise"**, and the two are
        // opposite conclusions about the same number. Recorded as a test rather
        // than as prose because the arithmetic is over four published constants
        // that other sessions are free to move, and the day one of them moves
        // this comment becomes the most misleading paragraph in the crate.
        //
        // It is two different facts in the two directions, and both are needed:
        // the candidate is always the Fighter, but the region table pools every
        // weapon/body row, so the Brute's swings are in the same column.
        let scenario = Scenario::articulated_duel();
        let table = scenario.combat_specs.as_ref().expect("an articulated fixture");
        let spec = |unit: usize| {
            let row = scenario.units[unit].articulated.expect("an articulated unit");
            (
                table.anatomy(row.anatomy).expect("a validated anatomy").clone(),
                row.equipment
                    .iter()
                    .flatten()
                    .filter_map(|&id| table.equipment(id))
                    .find_map(|item| match item.geometry {
                        sim::EquipmentGeometry::Segment { radius, .. } => Some(radius),
                        sim::EquipmentGeometry::Shield { .. } => None,
                    })
                    .expect("a blade"),
            )
        };
        let (fighter, sword) = spec(0);
        let (brute, club) = spec(1);
        let head = |anatomy: &sim::BodyAnatomySpec| {
            let row = anatomy
                .regions
                .iter()
                .find(|row| row.region == sim::AnatomyRegion::Head)
                .copied()
                .expect("every body has a head row");
            // `body_region_volumes` builds the head as a **degenerate capsule**
            // -- `lower == upper == centre_z` -- so `half_height` is dead for
            // this region and the volume is a sphere of `radius` about
            // `centre_z`. Reading the band off `centre_z +/- half_height`
            // instead is the mistake this closure exists to not make: it gives
            // 1.60..1.80 on a Fighter where the collider is 1.50..1.90.
            (row.centre_z, row.radius)
        };

        // ---- the Fighter's sword against the Brute's head: unreachable.
        //
        // `actuator` puts a commanded hand at `standing_height * height`, and
        // `HIGH` is the highest entry the weapon-height head can select, so the
        // highest hand this vocabulary can ask for is 0.75 of a Fighter. The
        // blade is horizontal from it -- `segment_pose` sets the tip to the
        // hilt plus the length rotated in XY only -- so the blade's axis is the
        // hand's own height and its surface is one blade radius above that.
        let highest = HEIGHTS
            .iter()
            .map(|h| fighter.standing_height * Fx::from_raw(h.raw()))
            .max()
            .expect("three heights");
        assert_eq!(highest, fighter.standing_height * Fx::from_ratio(3, 4));
        let (brute_head_z, brute_head_r) = head(&brute);
        let needed = brute_head_z - brute_head_r - sword;
        assert!(
            highest < needed,
            "a Fighter's HIGH puts its blade axis at {highest}, and the Brute's head \
             admits a blade of radius {sword} only from {needed} up"
        );

        // ---- the Brute's club against the Fighter's head: touchable, and
        // never credited, because the torso is always struck first.
        //
        // The region key is `(time of impact, medial distance, index)` and the
        // earliest impact wins outright. At the club's highest commandable
        // height the torso capsule's top cap and the head sphere are both in
        // reach, and the torso admits contact from further away in every
        // direction -- so its time of impact is strictly smaller and the head
        // never wins the tuple.
        let club_axis = brute.standing_height * Fx::from_ratio(3, 4);
        let (head_z, head_r) = head(&fighter);
        let torso = fighter
            .regions
            .iter()
            .find(|row| row.region == sim::AnatomyRegion::Torso)
            .copied()
            .expect("a torso row");
        let torso_top = torso.centre_z + torso.half_height;
        // The club *can* reach the head: within one club-plus-head radius of
        // the sphere's centre. Stated as a positive assertion because "the head
        // is out of reach in both directions" would be a stronger claim than
        // this fixture supports, and a test that overclaims is worse than none.
        let head_admits = head_r + club;
        assert!(
            (club_axis - head_z).abs() < head_admits,
            "the Brute's club cannot reach a Fighter's head at all, so the reason \
             the head column is empty is simpler than this test says"
        );
        // And the torso admits it from strictly further out at the same height,
        // which is what makes the torso's time of impact the smaller one.
        let torso_admits = torso.radius + club;
        let head_reach = head_admits * head_admits - (club_axis - head_z) * (club_axis - head_z);
        let torso_reach =
            torso_admits * torso_admits - (club_axis - torso_top) * (club_axis - torso_top);
        assert!(
            torso_reach > head_reach,
            "the torso no longer shadows the head: torso {torso_reach}, head {head_reach}"
        );

        // ---- and the corpus agrees. Three hundred ticks of two bodies inside
        // each other's measure, under the script that swings at all three
        // heights, with every weapon/body row bucketed.
        let mut mechanics = Mechanics::default();
        let plain = rollout_with(
            &duel_in_sight(),
            9,
            &mut ScriptedArticulatedPolicy,
            &mut ScriptedArticulatedPolicy,
            Some(300),
            &mut Recorders { mechanics: Some(&mut mechanics), replay: None },
        );
        assert_eq!(plain.rejected, 0);
        assert!(
            mechanics.kinds[sim::ContactKind::WeaponBody as usize] > 0,
            "no blade reached a body, so the head column proves nothing"
        );
        assert_eq!(
            mechanics.regions[sim::AnatomyRegion::Head as usize],
            0,
            "a contact was credited to a head, which the arithmetic above says cannot happen"
        );
    }

    #[test]
    fn the_return_prefers_winning_then_attrition_then_speed() {
        // The ordering the shape is supposed to have, asserted rather than
        // described. Each pair differs in exactly one term.
        let base = Rollout {
            outcome: Outcome::Decision(Faction::Heroes),
            timed_out: true,
            ticks: 3600,
            hero_health: Fx::ONE,
            monster_health: Fx::ONE,
            hero_damage: Fx::ZERO,
            monster_damage: Fx::ZERO,
            rejected: 0,
            state_hash: 0,
        };
        let killed = Rollout { outcome: Outcome::HeroesWin, ..base };
        let lost = Rollout { outcome: Outcome::Decision(Faction::Monsters), ..base };
        let hurt_them = Rollout { monster_health: Fx::HALF, ..base };
        let hurt_me = Rollout { hero_health: Fx::HALF, ..base };
        let quick = Rollout { ticks: 600, ..base };

        assert!(shaped_return(&killed) > shaped_return(&base));
        assert!(shaped_return(&base) > shaped_return(&lost));
        assert!(shaped_return(&hurt_them) > shaped_return(&base));
        assert!(shaped_return(&base) > shaped_return(&hurt_me));
        assert!(shaped_return(&quick) > shaped_return(&base));

        // **"Outcome dominates" stated over states the sim can produce, and not
        // over the whole product space.** The naive version of this assertion
        // -- that a decision beats a loss however bloody the loss -- is false at
        // these constants, because the health axis spans 100 points and the
        // decision step is 55. It is also unreachable: `World::timeout` awards
        // the decision to whichever side holds more health, so "behind on
        // points and losing" and "ahead on points and winning" are not
        // independent, and there is no run in which the search buys a loss by
        // dealing damage. Dealing damage past the crossing point *wins* the
        // decision.
        //
        // What the constants do have to guarantee is that the crossing itself
        // is worth more than the hair's breadth of health that causes it, or
        // the return would be continuous through the one place the fight is
        // actually decided. One raw unit of health is the tightest version of
        // that there is.
        let level = Rollout {
            outcome: Outcome::Draw,
            hero_health: Fx::HALF,
            monster_health: Fx::HALF,
            ..base
        };
        let ahead = Rollout {
            outcome: Outcome::Decision(Faction::Heroes),
            hero_health: Fx::from_raw(Fx::HALF.raw() + 1),
            ..level
        };
        assert!(shaped_return(&ahead) - shaped_return(&level) > 50.0);

        // **The step is on one side of the crossing only**, because the ladder
        // this borrows from collapses every non-win into zero: a draw, a
        // decision against, and a death all score the same outcome term. So
        // there is no outcome gradient at all between losing narrowly and being
        // taken apart, and the health axis is the *only* thing ranking a
        // generation of losers -- which is exactly the job `lab::fitness` gives
        // its aggression term, and it matters more here, because on the v2-17
        // corpus a large fraction of a random population loses.
        let behind = Rollout {
            outcome: Outcome::Decision(Faction::Monsters),
            monster_health: Fx::from_raw(Fx::HALF.raw() + 1),
            ..level
        };
        let routed = Rollout {
            outcome: Outcome::Decision(Faction::Monsters),
            hero_health: Fx::from_ratio(1, 10),
            monster_health: Fx::from_ratio(9, 10),
            ..level
        };
        assert!(
            (shaped_return(&level) - shaped_return(&behind)).abs() < 0.01,
            "the ladder is flat below zero: crossing from a draw into a defeat costs \
             one raw unit of health and nothing else"
        );
        assert!(shaped_return(&behind) > shaped_return(&routed));

        // And trading is worth it: a point of theirs is worth more than a point
        // of mine, which is the ratio `RETURN_ATTRITION` above `RETURN_SURVIVAL`
        // exists to state.
        let trade = Rollout {
            hero_health: Fx::from_ratio(9, 10),
            monster_health: Fx::from_ratio(9, 10),
            ..base
        };
        assert!(shaped_return(&trade) > shaped_return(&base));
    }

    #[test]
    fn a_gaussian_draw_has_the_moments_it_claims() {
        // The mutation operator, measured. Its doc says mean zero and standard
        // deviation sigma, and for one revision of `uniform` it was mean
        // `6 * sigma` and standard deviation `2 * sigma` -- which turned every
        // generation into a fixed march along the all-ones direction. That was
        // invisible in every other test in this crate, because a march up a
        // shaped return climbs.
        let mut rng = Rng::new(3);
        let sigma = 0.08f32;
        let n = 200_000;
        let mut sum = 0.0f64;
        let mut squares = 0.0f64;
        for _ in 0..n {
            let value = gaussian(&mut rng, sigma) as f64;
            sum += value;
            squares += value * value;
        }
        let mean = sum / n as f64;
        let sd = (squares / n as f64 - mean * mean).sqrt();
        assert!(mean.abs() < sigma as f64 / 20.0, "mean {mean}, sigma {sigma}");
        assert!(
            (sd - sigma as f64).abs() < sigma as f64 / 20.0,
            "sd {sd}, sigma {sigma}"
        );
        // And a mutation moves a parent without dragging it: the mean weight of
        // a zeroed model stays at zero however many times it is mutated.
        let mut child = Model::zeros();
        for _ in 0..20 {
            child = mutate(&child, sigma, &mut rng);
        }
        let mean = child.weights().iter().sum::<f32>() / child.len() as f32;
        assert!(mean.abs() < 0.05, "twenty mutations moved the mean weight to {mean}");
    }

    #[test]
    fn a_band_reports_the_spread_it_was_given() {
        // A degenerate set has no spread and must not report one, which is the
        // case the discrimination measurement is most likely to meet.
        let flat = band(&vec![55.0f32; 64], 1);
        assert_eq!(flat.mean, 55.0);
        assert_eq!(flat.sd, 0.0);
        assert_eq!(flat.stderr, 0.0);
        assert_eq!((flat.low, flat.high), (55.0, 55.0));

        // And a spread one reports an interval that contains the mean and is
        // narrower than the sample.
        let values: Vec<f32> = (0..400).map(|i| (i % 21) as f32).collect();
        let spread = band(&values, 2);
        assert!(spread.low < spread.mean && spread.mean < spread.high);
        assert!(spread.high - spread.low < spread.sd);
    }

    #[test]
    fn training_is_reproducible_across_thread_counts() {
        // v2-19 allows training to be nondeterministic across thread counts and
        // this arrangement does not need the allowance. Kept small -- two
        // generations of four candidates over one seed and a short clock -- so
        // it is a wiring test and not a training run.
        let base = ProbeConfig {
            generations: 2,
            population: 4,
            elite: 2,
            seeds: training_seeds(1),
            mirrored: false,
            sigma: 0.1,
            threads: 1,
            master_seed: 99,
            max_ticks: Some(180),
            opponent: Opponent::frozen(Baseline::Composed),
            verbose: false,
        };
        let one = train(&base);
        let many = train(&ProbeConfig { threads: 4, ..base.clone() });
        assert_eq!(one.model, many.model);
        assert_eq!(one.training, many.training);
        // And the checkpoint it produced is one the reader accepts.
        let bytes = one.to_bytes();
        assert_eq!(Checkpoint::from_bytes(&bytes), Ok(one));
    }

    #[test]
    fn every_baseline_names_itself_and_fights() {
        for baseline in Baseline::ALL {
            assert_eq!(Baseline::from_name(baseline.name()), Some(baseline));
            let mut candidate = baseline.policy();
            let result = rollout(
                &duel_in_sight(),
                5,
                candidate.as_mut(),
                &mut ScriptedArticulatedPolicy,
                Some(180),
            );
            assert_eq!(result.rejected, 0, "{}", baseline.name());
            assert!(shaped_return(&result).is_finite());
        }
        assert_eq!(Baseline::from_name("nonesuch"), None);
    }
}
