//! The experiment lab: the game with the graphics removed and the clock taken
//! off.
//!
//! This is the second of the two frontends the architecture exists to support.
//! It runs the identical [`sim::World`] the browser will, as fast as the
//! machine allows, across as many cores as it has.
//!
//! ```text
//! cargo run --release -p lab -- bench   --seeds 500
//! cargo run --release -p lab -- verify  --seeds 100
//! cargo run --release -p lab -- hash
//! cargo run --release -p lab -- evolve  --gens 30 --pop 24 --seeds 8
//! ```

mod args;
mod evolve;
mod fitness;

use args::Args;
use evolve::{describe, evolve, EvolveConfig};
use fitness::{fitness, Summary, Tally};
use fx::Fx;
use policy::{run, RunConfig, RunResult, UtilityPolicy};
use sim::Scenario;
use std::time::Instant;

fn main() {
    let args = Args::from_env();
    match args.command() {
        "bench" => bench(&args),
        "verify" => verify(&args),
        "hash" => hash(&args),
        "evolve" => evolution(&args),
        "" | "help" => usage(),
        other => {
            eprintln!("unknown command '{other}'\n");
            usage();
            std::process::exit(2);
        }
    }
}

fn usage() {
    println!(
        "auto-rpg experiment lab

  bench   --seeds N --threads N --heroes N --monsters N
          Batch rollouts with the hand-tuned policy. Reports the fitness
          distribution and throughput.

  verify  --seeds N --verbose
          Replays every run and checks it reproduces bit-exactly. This is the
          guarantee the whole architecture rests on. --verbose prints every
          seed's hash, which is what you diff against another platform.

  hash    --seed N --scenario N
          Prints the state fingerprint of a canonical run. The same number must
          come back from a wasm build and from every other architecture.

  evolve  --gens N --pop N --elite N --seeds N --sigma-pct N --threads N
          Evolves the utility weights against the hand-tuned baseline."
    );
}

fn default_threads() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
}

/// Runs one scenario per seed, spread over threads.
///
/// Each thread owns its own policy instance, so nothing is shared and nothing
/// needs locking. Results are written by index, so the output is identical
/// whatever order the threads finish in.
fn parallel_runs(seeds: &[u64], heroes: u32, monsters: u32, threads: usize) -> Vec<RunResult> {
    let mut slots: Vec<Option<RunResult>> = vec![None; seeds.len()];
    if seeds.is_empty() {
        return Vec::new();
    }
    let threads = threads.max(1);
    let chunk = seeds.len().div_ceil(threads);

    std::thread::scope(|scope| {
        for (chunk_seeds, out) in seeds.chunks(chunk).zip(slots.chunks_mut(chunk)) {
            scope.spawn(move || {
                let config = RunConfig::default();
                let mut policy = UtilityPolicy::baseline();
                for (i, &seed) in chunk_seeds.iter().enumerate() {
                    let scenario = Scenario::skirmish(seed, heroes, monsters);
                    out[i] = Some(run(&scenario, seed, &mut policy, &config));
                }
            });
        }
    });

    slots
        .into_iter()
        .map(|slot| slot.expect("every seed should have produced a run"))
        .collect()
}

fn bench(args: &Args) {
    let count = args.usize("seeds", 200);
    let threads = args.usize("threads", default_threads());
    let heroes = args.u32("heroes", 4);
    let monsters = args.u32("monsters", 6);
    let seeds: Vec<u64> = (0..count as u64).collect();

    println!("running {count} rollouts of {heroes}v{monsters} across {threads} threads");
    let started = Instant::now();
    let results = parallel_runs(&seeds, heroes, monsters, threads);
    let elapsed = started.elapsed();

    let mut tally = Tally::default();
    let mut scores = Vec::with_capacity(results.len());
    let mut ticks = 0u64;
    let mut decisions = 0u64;
    for result in &results {
        tally.add(result);
        scores.push(fitness(result));
        ticks += result.ticks as u64;
        decisions += result.decisions;
    }

    let seconds = elapsed.as_secs_f64().max(1e-9);
    println!("fitness  {}", Summary::of(&scores));
    println!("outcomes {tally}");

    // Draws are the failure mode worth understanding: two healthy sides that
    // timed out never found each other, whereas a badly wounded one was in a
    // flee-and-return loop. The distinction points at completely different
    // fixes, so it is worth printing rather than guessing at.
    let drawn: Vec<&RunResult> = results
        .iter()
        .filter(|r| r.outcome == sim::Outcome::Draw)
        .collect();
    if !drawn.is_empty() {
        let health: Vec<Fx> = drawn
            .iter()
            .map(|r| (r.hero_health + r.monster_health) / Fx::from_int(2))
            .collect();
        println!(
            "draws    {} runs, mean surviving health {}",
            drawn.len(),
            Summary::of(&health).mean
        );
    }
    println!(
        "throughput {:.0} rollouts/s, {:.0} ticks/s, {:.0} decisions/s ({:.2}s wall)",
        results.len() as f64 / seconds,
        ticks as f64 / seconds,
        decisions as f64 / seconds,
        seconds
    );
}

fn verify(args: &Args) {
    let count = args.u32("seeds", 50) as u64;
    let heroes = args.u32("heroes", 4);
    let monsters = args.u32("monsters", 6);
    let config = RunConfig {
        record: true,
        ..RunConfig::default()
    };

    let verbose = args.flag("verbose");
    let mut failures = 0;
    for seed in 0..count {
        let scenario = Scenario::skirmish(seed, heroes, monsters);
        let first = run(&scenario, seed, &mut UtilityPolicy::baseline(), &config);
        let again = run(&scenario, seed, &mut UtilityPolicy::baseline(), &config);

        if verbose {
            println!(
                "seed {seed:<5} 0x{:016x}  {:>5} ticks  {:?}",
                first.state_hash, first.ticks, first.outcome
            );
        }

        if first.state_hash != again.state_hash {
            println!("seed {seed}: re-running the same inputs gave a different result");
            failures += 1;
            continue;
        }

        let replay = match first.replay.as_ref() {
            Some(replay) => replay,
            None => {
                println!("seed {seed}: no replay was recorded");
                failures += 1;
                continue;
            }
        };
        let played = replay.play();
        if played.state_hash() != first.state_hash {
            println!(
                "seed {seed}: replay diverged (live 0x{:016x}, replay 0x{:016x})",
                first.state_hash,
                played.state_hash()
            );
            failures += 1;
        }
    }

    if failures == 0 {
        println!("{count} runs verified: identical on re-run and exact on replay");
    } else {
        eprintln!("{failures}/{count} runs failed verification");
        std::process::exit(1);
    }
}

fn hash(args: &Args) {
    let seed = args.number("seed", 99);
    let scenario_seed = args.number("scenario", 1234);
    let heroes = args.u32("heroes", 4);
    let monsters = args.u32("monsters", 6);

    let scenario = Scenario::skirmish(scenario_seed, heroes, monsters);
    let result = run(
        &scenario,
        seed,
        &mut UtilityPolicy::baseline(),
        &RunConfig::default(),
    );

    println!("scenario     skirmish({scenario_seed}, {heroes}, {monsters})");
    println!("fingerprint  0x{:016x}", scenario.fingerprint());
    println!("seed         {seed}");
    println!("ticks        {}", result.ticks);
    println!("outcome      {:?}", result.outcome);
    println!("state hash   0x{:016x}", result.state_hash);
    println!();
    println!("This number must match on every platform the sim is built for.");
    println!("If a wasm build disagrees, something in the stack is not portable.");
}

fn evolution(args: &Args) {
    let config = EvolveConfig {
        generations: args.u32("gens", 20),
        population: args.usize("pop", 24).max(2),
        elite: args.usize("elite", 6),
        seeds: args.usize("seeds", 8).max(1),
        // Percent, because the argument parser only speaks integers and
        // `--sigma 0.15` would be a lie.
        sigma: Fx::from_ratio(args.u32("sigma-pct", 12) as i32, 100),
        threads: args.usize("threads", default_threads()),
        master_seed: args.number("master-seed", 1),
        heroes: args.u32("heroes", 4),
        monsters: args.u32("monsters", 6),
    };

    println!(
        "evolving {} genomes for {} generations, {} scenarios each, sigma {}",
        config.population, config.generations, config.seeds, config.sigma
    );
    println!("opponent: the hand-tuned baseline\n");

    let started = Instant::now();
    let best = evolve(&config);
    println!(
        "\nbest genome after {:.1}s",
        started.elapsed().as_secs_f64()
    );
    println!("  {}", describe(&best));

    // Score the winner and the incumbent on a fresh seed set neither has seen,
    // because a genome that only wins on its training seeds has learned the
    // seeds, not the game.
    let holdout: Vec<u64> = (900_000..900_016).collect();
    let baseline = policy::UtilityWeights::BASELINE.to_genome();
    let best_score = crate::evolve::evaluate(&best, &holdout, config.heroes, config.monsters);
    let baseline_score =
        crate::evolve::evaluate(&baseline, &holdout, config.heroes, config.monsters);
    println!("\nheld-out fitness over {} fresh scenarios:", holdout.len());
    println!("  evolved   {best_score}");
    println!("  baseline  {baseline_score}");
    if best_score > baseline_score {
        println!("  evolution beat the hand-tuned weights");
    } else {
        println!("  the hand-tuned weights still win; try more generations or seeds");
    }
}
