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

use crate::checkpoint::{Checkpoint, TrainingRecord};
use crate::model::{uniform, LearnedArticulatedPolicy, Model};
use fx::{Fx, Rng};
use policy::{
    ArticulatedPolicy, ClosingAttackControlPolicy, RunConfig, ScriptedArticulatedPolicy,
    WindmillArticulatedPolicy,
};
use sim::{
    EntityId, Faction, Outcome, Scenario, SubmitArticulatedOutcome, World,
};

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
    }

    // Read once, at spawn. `alive_ids` allocates, and a body that dies mid-fight
    // stops appearing in `pending_decisions` anyway -- so the only thing a
    // per-tick re-read would buy is a slot reuse that this fixture cannot
    // produce, at the cost of an allocation per tick.
    let hero_ids = world.alive_ids(Faction::Heroes);
    let limit = max_ticks.unwrap_or(scenario.max_ticks);
    let mut due: Vec<EntityId> = Vec::new();
    let mut rejected = 0u32;

    while world.outcome().is_none() && world.tick() < limit {
        due.clear();
        due.extend_from_slice(world.pending_decisions());
        for &id in &due {
            let obs = world.observe_articulated(id);
            let command = if hero_ids.contains(&id) {
                heroes.decide(&obs)
            } else {
                monsters.decide(&obs)
            };
            match world.submit_articulated_v1(id, command) {
                SubmitArticulatedOutcome::Stored { rejection, .. } => {
                    if rejection.is_some() {
                        rejected += 1;
                    }
                }
                SubmitArticulatedOutcome::NotStored(_) => rejected += 1,
            }
        }
        let _ = world.step();
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
    pub opponent: Baseline,
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
            opponent: Baseline::Composed,
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

    /// Every return this policy produced, one per trial, in a fixed order.
    ///
    /// Returns the individual values rather than their mean because the
    /// discrimination measurement needs the distribution, and a caller that
    /// only wants the mean can have it for one line.
    pub fn returns(
        &self,
        seeds: &[u64],
        candidate: &mut dyn ArticulatedPolicy,
        opponent: Baseline,
        max_ticks: Option<u32>,
        out: &mut Vec<f32>,
    ) {
        out.clear();
        let mut baseline = opponent.policy();
        for scenario in &self.scenarios {
            for &seed in seeds {
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

fn score_population(population: &[Model], config: &ProbeConfig) -> Vec<f32> {
    let mut scores = vec![0.0f32; population.len()];
    if population.is_empty() {
        return scores;
    }
    let chunk = population.len().div_ceil(config.threads.max(1)).max(1);

    // Chunked rather than one thread per candidate, and results land in index
    // order regardless of which thread finished first -- `evolve.rs`'s shape
    // exactly. v2-19 permits training to be nondeterministic across thread
    // counts; this arrangement does not need the permission, and
    // `training_is_reproducible_across_thread_counts` says so.
    std::thread::scope(|scope| {
        for (models, out) in population.chunks(chunk).zip(scores.chunks_mut(chunk)) {
            let config = config;
            scope.spawn(move || {
                let corpus = Corpus::new(config.mirrored);
                for (i, model) in models.iter().enumerate() {
                    out[i] = score(model, &corpus, config);
                }
            });
        }
    });

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
    let mut rng = Rng::new(config.master_seed);
    let elite = config.elite.clamp(1, config.population.max(1));

    let mut population: Vec<Model> = (0..config.population.max(1))
        .map(|_| Model::random(&mut rng))
        .collect();
    let mut best = population[0].clone();
    let mut best_score = f32::NEG_INFINITY;

    for generation in 0..config.generations {
        let scores = score_population(&population, config);

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

        let elites: Vec<Model> = ranking.iter().take(elite).map(|&i| population[i].clone()).collect();
        let mut next = elites.clone();
        let mut parent = 0usize;
        while next.len() < config.population {
            next.push(mutate(&elites[parent % elites.len()], config.sigma, &mut rng));
            parent += 1;
        }
        population = next;
    }

    Checkpoint {
        training: TrainingRecord {
            generations: config.generations,
            population: config.population as u32,
            elite: elite as u32,
            sigma: config.sigma,
            master_seed: config.master_seed,
            seeds: config.seeds.clone(),
            training_return: if best_score.is_finite() { best_score } else { 0.0 },
        },
        model: best,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::LearnedArticulatedPolicy;
    use policy::run_articulated;

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
            opponent: Baseline::Composed,
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
