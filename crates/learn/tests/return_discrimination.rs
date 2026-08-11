//! Does the shaped return tell three different fighters apart?
//!
//! **This is the measurement v2-19 turns on.** The plan asks for a learned
//! policy that beats the scripted one by at least 5% of mean return with a
//! confidence interval excluding zero. That question is unanswerable -- worse,
//! it is answerable *wrongly* -- if the return itself does not discriminate:
//! v2-17 closed with 99% of fights reaching the tick limit and neither body
//! meaningfully damaged, so a win/loss return over that corpus is nearly a
//! constant, and a training curve climbing a constant is a curve climbing
//! noise.
//!
//! So before anything is trained, the return is pointed at three fighters that
//! are known to be different -- the composed script, the windmill control, and
//! the closing-attack control -- and asked whether it can see the difference.
//! If the three means are not separated by more than their own seed-to-seed
//! noise, **that finding is the result of this session** and no checkpoint
//! trained against this return means anything.
//!
//! Ignored by default because a full pass is thousands of sixty-second fights.
//!
//! ```powershell
//! cargo test -p learn --release --test return_discrimination -- --ignored --nocapture
//! ```

#![forbid(unsafe_code)]

use learn::{band, shaped_return, Band, Baseline, Corpus, Rollout};
use sim::{Faction, Outcome};

/// Seeds per orientation. Both orientations are always run, so the sample is
/// twice this.
///
/// Two hundred against v2-19's held-out four hundred: the question here is
/// whether the *return* separates three fixed policies, which is a much easier
/// estimate than the effect size the plan gates on, and the answer has to be
/// available before a training run rather than after one.
const SEEDS: usize = 200;

/// Everything one policy's pass produced, beyond the returns themselves.
#[derive(Default)]
struct Corpse {
    returns: Vec<f32>,
    /// The outcome term of each run, kept rather than reconstructed.
    ///
    /// **The first version of this file reconstructed it** as "wins times
    /// `RETURN_DECISION`", on the reasoning that nothing but a decision occurs
    /// on this corpus. Four fights in four hundred settle before the clock and
    /// a settled kill is worth 100, so the published component table was short
    /// by exactly `45 * kills / n` in every row and did not add up to the mean
    /// printed beside it. Recording the term the return actually used is the
    /// fix, and it is the only version that cannot drift from `shaped_return`.
    outcome_term: Vec<f32>,
    hero_health: Vec<f32>,
    monster_health: Vec<f32>,
    ticks: Vec<f32>,
    timed_out: usize,
    kills: usize,
    wins: usize,
    losses: usize,
    draws: usize,
    rejected: u32,
}

impl Corpse {
    fn add(&mut self, result: &Rollout) {
        self.returns.push(shaped_return(result));
        self.outcome_term.push(match result.outcome {
            Outcome::HeroesWin => learn::RETURN_WIN,
            Outcome::Decision(Faction::Heroes) => learn::RETURN_DECISION,
            Outcome::MutualDestruction => learn::RETURN_MUTUAL,
            _ => 0.0,
        });
        self.hero_health.push(result.hero_health.to_f32());
        self.monster_health.push(result.monster_health.to_f32());
        self.ticks.push(result.ticks as f32);
        self.timed_out += usize::from(result.timed_out);
        self.kills += usize::from(result.outcome.is_decisive());
        match result.outcome.winner() {
            Some(Faction::Heroes) => self.wins += 1,
            Some(Faction::Monsters) => self.losses += 1,
            None => self.draws += 1,
        }
        self.rejected += result.rejected;
    }

    /// The four terms, averaged, and the identity that says they are the four
    /// terms: their sum has to be the mean return.
    fn components(&self) -> (f32, f32, f32, f32) {
        (
            mean(&self.outcome_term),
            learn::RETURN_SURVIVAL * mean(&self.hero_health),
            learn::RETURN_ATTRITION * (1.0 - mean(&self.monster_health)),
            -mean(&self.ticks) / learn::RETURN_TICK_DIVISOR,
        )
    }
}

fn mean(values: &[f32]) -> f32 {
    if values.is_empty() {
        0.0
    } else {
        values.iter().sum::<f32>() / values.len() as f32
    }
}

/// Runs one candidate over the mirrored corpus against a fixed opponent.
///
/// The candidate is always the heroes and the opponent is always the composed
/// script, which is `evolve.rs`'s arrangement: the question is "better than the
/// thing we wrote by hand", not "better at a symmetric game".
///
/// Fanned out across seeds because one fight is about half a second of wall
/// clock and this is twelve hundred of them. Results are reassembled in seed
/// order regardless of which thread finished first, so the printed numbers are
/// the same numbers whatever the machine is doing -- the same property
/// `evolve.rs` gets out of chunked scoring, and it matters more here, because
/// these numbers are going into a plan.
fn measure(candidate: Baseline, opponent: Baseline) -> Corpse {
    let corpus = Corpus::new(true);
    let seeds: Vec<u64> = (0..SEEDS as u64).collect();
    let scenarios = [
        sim::Scenario::articulated_duel(),
        learn::mirrored_articulated_duel(),
    ];
    let threads = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);

    let mut out = Corpse::default();
    for scenario in &scenarios {
        let chunk = seeds.len().div_ceil(threads).max(1);
        let mut slots: Vec<Vec<Rollout>> = vec![Vec::new(); seeds.len().div_ceil(chunk)];
        std::thread::scope(|scope| {
            for (chunk_seeds, slot) in seeds.chunks(chunk).zip(slots.iter_mut()) {
                scope.spawn(move || {
                    let mut policy = candidate.policy();
                    let mut baseline = opponent.policy();
                    for &seed in chunk_seeds {
                        slot.push(learn::rollout(
                            scenario,
                            seed,
                            policy.as_mut(),
                            baseline.as_mut(),
                            None,
                        ));
                    }
                });
            }
        });
        for result in slots.iter().flatten() {
            out.add(result);
        }
    }
    // `corpus` is built so that the trial count this file walks and the trial
    // count the optimizer walks are the same expression rather than two.
    assert_eq!(out.returns.len(), corpus.trials(&seeds));
    out
}

fn report(name: &str, corpse: &Corpse, seed: u64) -> Band {
    let band = band(&corpse.returns, seed);
    println!("{name:>14}  {band}");
    println!(
        "{:>14}  hero health {:.4}  monster health {:.4}  ticks {:.0}  tick-limit {:.1}%",
        "",
        mean(&corpse.hero_health),
        mean(&corpse.monster_health),
        mean(&corpse.ticks),
        100.0 * corpse.timed_out as f32 / corpse.returns.len() as f32
    );
    println!(
        "{:>14}  {} wins, {} losses, {} draws, {} rejected submissions",
        "", corpse.wins, corpse.losses, corpse.draws, corpse.rejected
    );
    band
}

#[test]
#[ignore = "a full pass is 1,200 sixty-second fights"]
fn the_shaped_return_separates_the_three_scripted_policies() {
    println!(
        "\n{} seeds x 2 orientations = {} trials per policy, all against the composed script\n",
        SEEDS,
        SEEDS * 2
    );
    let mut bands = Vec::new();
    for (i, candidate) in Baseline::ALL.into_iter().enumerate() {
        let corpse = measure(candidate, Baseline::Composed);
        assert_eq!(corpse.rejected, 0, "{} submitted a refused command", candidate.name());
        bands.push((candidate, report(candidate.name(), &corpse, 0xA11CE + i as u64)));
        println!();
    }

    // The verdict, spelled out rather than left to a reader. Two means are
    // separated if the gap between them is larger than the two standard errors
    // added -- a deliberately conservative test, since the correct combination
    // is the root of the sum of squares, and a gap that clears the sum clears
    // that too.
    println!("pairwise separation (gap against summed standard error):");
    println!(
        "  the standard errors below understate by about 6.5%: the two orientations of\n  \
         one seed correlate at rho = 0.135, so the pooled sd/sqrt(2n) wants a factor of\n  \
         sqrt(1+rho). See `ProbeConfig::mirrored`."
    );
    let mut separated = 0;
    let mut pairs = 0;
    for i in 0..bands.len() {
        for j in i + 1..bands.len() {
            let (a, ba) = &bands[i];
            let (b, bb) = &bands[j];
            let gap = (ba.mean - bb.mean).abs();
            let noise = ba.stderr + bb.stderr;
            let clear = gap > noise;
            pairs += 1;
            separated += usize::from(clear);
            println!(
                "  {:>13} vs {:<13} gap {:>8.3}  noise {:>7.3}  {}",
                a.name(),
                b.name(),
                gap,
                noise,
                if clear { "separated" } else { "INDISTINGUISHABLE" }
            );
        }
    }
    println!();

    // The assertion is deliberately not "all three pairs separate". Two of the
    // three fighters could genuinely be equally good, and a return that could
    // not admit that would be a return with a thumb on the scale. What the
    // return must not be is blind to *every* difference between a twelve-phase
    // script, a windmill, and a script whose feet move -- those three do
    // visibly different things, and a scalar that ranks them all the same is a
    // scalar with nothing in it to train against.
    assert!(
        separated > 0,
        "the shaped return did not separate any of the {pairs} pairs: it does not \
         discriminate, and no checkpoint trained against it means anything"
    );
}

#[test]
#[ignore = "prints the raw terms behind the return's constants"]
fn the_return_components_over_the_corpus() {
    // Provenance for the weights in `probe.rs`. Every constant there is a
    // choice about how much of the return one of these columns is allowed to
    // carry, and choosing them without looking at their range is how a term
    // ends up contributing nothing.
    println!();
    for candidate in Baseline::ALL {
        let corpse = measure(candidate, Baseline::Composed);
        let (outcome, survival, attrition, time) = corpse.components();
        println!(
            "{:>14}  n={}  outcome {outcome:.3}  survival {survival:.3}  \
             attrition {attrition:.3}  time {time:.3}  sum {:.3}",
            candidate.name(),
            corpse.returns.len(),
            outcome + survival + attrition + time,
        );
        // The identity that says the four numbers above are the return and not
        // four numbers beside it. The health terms are means of a product, so
        // they are exact; the sum has only float rounding in it.
        let sum = outcome + survival + attrition + time;
        let mean_return = mean(&corpse.returns);
        assert!(
            (sum - mean_return).abs() < 0.01,
            "{}: the components sum to {sum} and the mean return is {mean_return}",
            candidate.name()
        );
        println!(
            "{:>14}  hero health min/mean {:.4}/{:.4}  monster health min/mean {:.4}/{:.4}",
            "",
            corpse.hero_health.iter().copied().fold(f32::MAX, f32::min),
            mean(&corpse.hero_health),
            corpse.monster_health.iter().copied().fold(f32::MAX, f32::min),
            mean(&corpse.monster_health),
        );
        println!(
            "{:>14}  {} settled before the clock, {} on points",
            "", corpse.kills, corpse.timed_out
        );
    }
    println!();
}

#[test]
#[ignore = "one fight, to time the corpus before committing to it"]
fn one_fight_is_fast_enough_to_run_a_corpus_of() {
    let started = std::time::Instant::now();
    let mut composed = Baseline::Composed.policy();
    let mut opponent = Baseline::Composed.policy();
    let result = learn::rollout(
        &sim::Scenario::articulated_duel(),
        0,
        composed.as_mut(),
        opponent.as_mut(),
        None,
    );
    let elapsed = started.elapsed();
    println!(
        "\none {}-tick fight in {:?}; {} trials would take about {:?} on one thread\n",
        result.ticks,
        elapsed,
        SEEDS * 2 * 3,
        elapsed * (SEEDS * 2 * 3) as u32
    );
    // The clock and not a body, which is what v2-17 measured and what makes
    // the discrimination question worth asking at all. Which *side* takes the
    // decision is a fact about the fixture rather than about this crate --
    // seed zero of the shipped placement goes to the Brute -- so the assertion
    // is about the tick limit and not about the winner.
    assert!(result.timed_out, "the fixture no longer runs out the clock");
    assert!(matches!(result.outcome, Outcome::Decision(_) | Outcome::Draw));
    assert_eq!(result.ticks, 3600);
}
