//! Can this optimizer move 3,858 weights at all?
//!
//! A short run of the real thing -- real fixture, real clock, real corpus -- to
//! find out whether the population climbs. It is a **smoke test and not the
//! v2-19 comparison**: the seed set is tiny, the generation count is small, the
//! held-out set is a fraction of the four hundred the plan freezes, and nothing
//! it prints may be quoted as evidence for or against learning. What it can say
//! is whether the loop is wired up and whether a `(mu + lambda)` strategy has
//! any traction on a search space this size, which is the thing worth knowing
//! before a real training run is commissioned.
//!
//! Ignored by default; a pass is a few hundred sixty-second fights.
//!
//! ```powershell
//! cargo test -p learn --release --test training_smoke -- --ignored --nocapture
//! ```

#![forbid(unsafe_code)]

use learn::{band, held_out_seeds, score, training_seeds, Corpus, Model, ProbeConfig};
use learn::LearnedPolicy;
use policy::PolicyKind;

#[test]
#[ignore = "a few hundred sixty-second fights"]
fn a_short_training_run_climbs_and_writes_a_loadable_checkpoint() {
    let threads = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    let config = ProbeConfig {
        generations: 10,
        population: 16,
        elite: 4,
        seeds: training_seeds(4),
        mirrored: true,
        sigma: 0.08,
        threads,
        master_seed: 20_260_810,
        max_ticks: None,
        opponent: learn::Opponent::frozen(PolicyKind::Scripted),
        roster: Vec::new(),
        verbose: true,
    };
    println!(
        "\n{} generations x {} candidates x {} trials on {threads} threads\n",
        config.generations,
        config.population,
        Corpus::new(config.mirrored).trials(&config.seeds),
    );

    let started = std::time::Instant::now();
    let checkpoint = learn::train(&config);
    println!("\ntrained in {:?}\n", started.elapsed());

    // The artifact first: a checkpoint that will not reload is a training run
    // that produced nothing, however good the curve looked.
    let bytes = checkpoint.to_bytes();
    assert_eq!(learn::Checkpoint::from_bytes(&bytes), Ok(checkpoint.clone()));
    println!("checkpoint {}  {} bytes", checkpoint.digest(), bytes.len());
    println!(
        "  {} generations, population {}, elite {}, sigma {}, seeds {:?}, training return {:.3}",
        checkpoint.training.generations,
        checkpoint.training.population,
        checkpoint.training.elite,
        checkpoint.training.sigma,
        checkpoint.training.seeds,
        checkpoint.training.training_return,
    );

    // And then the only number that means anything: what it scores on seeds
    // the optimizer never saw, beside the baseline it is meant to beat, on the
    // same seeds and the same opponent.
    let held_out = held_out_seeds(20);
    let evaluation = ProbeConfig {
        seeds: held_out.clone(),
        ..config.clone()
    };
    let corpus = Corpus::new(true);
    let learned = score(&checkpoint.model, &corpus, &evaluation);

    let mut scripted = PolicyKind::Scripted.build();
    let mut returns = Vec::new();
    corpus.returns(
        &held_out,
        scripted.as_mut(),
        learn::Opponent::frozen(PolicyKind::Scripted),
        None,
        &mut returns,
    );
    let baseline = band(&returns, 7);

    let mut untrained_returns = Vec::new();
    let mut untrained = LearnedPolicy::new(Model::zeros());
    corpus.returns(
        &held_out,
        &mut untrained,
        learn::Opponent::frozen(PolicyKind::Scripted),
        None,
        &mut untrained_returns,
    );
    let untrained = band(&untrained_returns, 8);

    println!("\nheld out on {} seeds x 2 orientations:", held_out.len());
    println!("  scripted body    {baseline}");
    println!("  zeroed network   {untrained}");
    println!("  trained network  mean={learned:>8.3}");
    println!(
        "  trained vs scripted: {:+.3} ({:+.1}%)\n",
        learned - baseline.mean,
        100.0 * (learned - baseline.mean) / baseline.mean.abs()
    );

    // Nothing about the *result* is asserted, deliberately. A smoke test that
    // demanded an improvement would fail on a true negative, which is exactly
    // the finding this session most needs to be able to report. What is
    // asserted is that every number above is a number.
    assert!(learned.is_finite());
    assert!(baseline.mean.is_finite());
    assert!(untrained.mean.is_finite());
    assert!(!returns.is_empty());
    assert!(returns.iter().all(|r| r.is_finite()));
}
