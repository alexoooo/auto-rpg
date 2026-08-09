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
use evolve::{describe, evolve, Arena, EvolveConfig};
use fitness::{fitness, Summary, Tally};
use fx::{Fx, Vec2};
use policy::{run, PolicyKind, RunConfig, RunResult};
use sim::{Body, Faction, Scenario, UnitSpec};
use std::time::Instant;

fn main() {
    let args = Args::from_env();
    match args.command() {
        "bench" => bench(&args),
        "verify" => verify(&args),
        "hash" => hash(&args),
        "evolve" => evolution(&args),
        "duel" => duel(&args),
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
          --carved --depth N --ticks N
          Batch rollouts with the hand-tuned policy. Reports the fitness
          distribution and throughput.
          --carved swaps the open rectangle every other scenario stands on for
          a generated dungeon, and then reports throughput and nothing else.
          Sight is a short-circuit on an open plan, so the headline number has
          never paid for a raycast and the browser's floor plan makes it pay
          for one per pair per decision. It runs on one thread unless told
          otherwise, because a browser frame has one core to spend.

  verify  --seeds N --verbose
          Replays every run and checks it reproduces bit-exactly. This is the
          guarantee the whole architecture rests on. --verbose prints every
          seed's hash, which is what you diff against another platform.

  hash    --seed N --scenario N
          Prints the state fingerprint of a canonical run. The same number must
          come back from a wasm build and from every other architecture.

  duel    --seeds N --hero KIND --villain KIND --policy P --opponent P
          One-on-one, repeated across seeds, reporting a win rate and how the
          fight was actually won. This is where a claim like \"a clever policy
          can beat a brute\" stops being an opinion.

  evolve  --gens N --pop N --elite N --seeds N --sigma-pct N --threads N
          --master-seed N --policy P --opponent P
          --arena skirmish|duel|roster --hero KIND --villain KIND
          --cross --cross-with P
          Evolves a policy's weights against a hand-tuned opponent. The arena
          decides what \"better\" means: a genome tuned on crowds keeps a spacing
          no duellist should accept, and vice versa. \"roster\" scores all sixteen
          archetype pairings, which is what a policy shipped to the whole roster
          is actually being asked to do. --cross scores every candidate against a
          second opponent too and keeps the worse of the two, because a duel
          arena will happily evolve a counter to one opponent and call it a
          fighter.

  KIND is one of fighter, rogue, brute, skitterer.
  P    is one of utility, duelist, idle, random."
    );
}

const POLICIES: [(&str, PolicyKind); 4] = [
    ("utility", PolicyKind::Utility),
    ("duelist", PolicyKind::Duelist),
    ("idle", PolicyKind::Idle),
    ("random", PolicyKind::Random),
];

const KINDS: [(&str, Body); 4] = [
    ("fighter", Body::Fighter),
    ("rogue", Body::Rogue),
    ("brute", Body::Brute),
    ("skitterer", Body::Skitterer),
];

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
fn parallel_runs(
    seeds: &[u64],
    heroes: u32,
    monsters: u32,
    threads: usize,
    kind: PolicyKind,
) -> Vec<RunResult> {
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
                let mut policy = kind.baseline();
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

/// The same fan-out as [`parallel_runs`], on a generated dungeon.
///
/// A sibling rather than a scenario-kind parameter threaded through the one
/// above: the two differ in a single line, and that one is the line every
/// throughput and fitness number ever recorded in this repository came off.
/// A dozen duplicated lines are cheaper than making the measured path
/// conditional on anything.
///
/// `max_ticks` is a parameter and not an `Option` because a cap is not
/// optional here. [`Scenario::dungeon`] carries `u32::MAX` deliberately -- it
/// describes somewhere a player stands around in, not a fight on a clock -- so
/// a batch pointed at it uncapped ends only when a side is wiped out, and any
/// seed where the hero and the monsters never meet does not end at all.
fn carved_runs(
    seeds: &[u64],
    depth: u32,
    max_ticks: u32,
    threads: usize,
    kind: PolicyKind,
) -> Vec<RunResult> {
    let mut slots: Vec<Option<RunResult>> = vec![None; seeds.len()];
    if seeds.is_empty() {
        return Vec::new();
    }
    let threads = threads.max(1);
    let chunk = seeds.len().div_ceil(threads);

    // What the browser opens its first floor with (`Sim::new`): a plain
    // Fighter carrying its own stat sheet and its own weapons. Matching it
    // matters -- a body implies neither any more, and benching a Fighter
    // holding a Skitterer's knife would be measuring a character nobody plays.
    // The faction and the spawn are placeholders; `Scenario::dungeon`
    // overwrites both, because where you stand is the level's business.
    let hero = UnitSpec {
        kind: Body::Fighter,
        faction: Faction::Heroes,
        stats: Body::Fighter.base_stats(),
        loadout: Body::Fighter.default_loadout(),
        articulated: None,
        spawn: Vec2::ZERO,
    };

    std::thread::scope(|scope| {
        for (chunk_seeds, out) in seeds.chunks(chunk).zip(slots.chunks_mut(chunk)) {
            scope.spawn(move || {
                // The runner's own override of the scenario's limit, which is
                // the knob built for exactly this. Editing the returned
                // scenario would work too and would quietly change its
                // fingerprint, so the thing being benched would no longer be
                // the level the browser generates from the same seed.
                let config = RunConfig {
                    max_ticks: Some(max_ticks),
                    ..RunConfig::default()
                };
                let mut policy = kind.baseline();
                for (i, &seed) in chunk_seeds.iter().enumerate() {
                    let scenario = Scenario::dungeon(seed, depth, hero);
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

/// The bench with the walls put back in.
///
/// **Why this exists at all.** `Dungeon::sees` is `!self.carved ||
/// raycast(..).is_none()`, and every scenario the lab iterates stands on
/// `Dungeon::open`. So on the measured path line of sight is a boolean read
/// and the raycast is never reached: the throughput in the README is a figure
/// for a sim that has never walked a single DDA. The build people actually
/// play carves rooms and corridors, where that short-circuit is false and the
/// cost is one raycast per entity pair per decision, plus a fan of them per
/// visibility rebuild. Whether "the sim is orders of magnitude faster than it
/// needs to be" survives contact with a wall was an inference until this flag;
/// now it is a number.
///
/// **Throughput and nothing else, on purpose.** The fitness distribution, the
/// outcome tally and the draw breakdown all read a balanced two-sided fight,
/// and this is one hero against whatever the floor rolled -- a win rate off it
/// would describe the difficulty curve rather than the policy. `Scenario::room`
/// and `Scenario::dungeon` both say outright that nothing the lab iterates
/// should be pointed at them, and this deliberately points at one; printing
/// only the number that is meaningful is how it stays honest about that.
fn carved_bench(args: &Args) {
    let count = args.usize("seeds", 200);
    // One thread, where the skirmish bench takes the whole machine. The
    // question being asked is whether a tick that pays for line of sight still
    // fits in a browser frame, and a browser frame gets one core -- so a
    // per-core figure is the only one that compares against the 60 ticks/s a
    // 60 Hz budget needs. An explicit `--threads N` still wins, for whoever
    // wants the batch to finish faster than it wants the comparison.
    let threads = args.usize("threads", 1);
    // Floor zero: the one `init` opens, all Skitterers, the level the judder
    // is actually being complained about on.
    let depth = args.u32("depth", 0);
    // A minute of play per seed. Long enough that the floor gets walked rather
    // than merely entered -- the raycasts this exists to measure are paid for
    // by the walking -- and short enough that a seed where nobody finds anybody
    // costs a minute of game time rather than the rest of the afternoon.
    let tick_limit = args.u32("ticks", 60 * 60);
    let kind = args.choice("policy", PolicyKind::Utility, &POLICIES);
    let seeds: Vec<u64> = (0..count as u64).collect();

    println!(
        "running {count} rollouts of a carved depth-{depth} dungeon, \
         {tick_limit} ticks each, across {threads} threads ({})",
        kind.name()
    );
    let started = Instant::now();
    let results = carved_runs(&seeds, depth, tick_limit, threads, kind);
    let elapsed = started.elapsed();

    let mut ticks = 0u64;
    let mut decisions = 0u64;
    for result in &results {
        ticks += result.ticks as u64;
        decisions += result.decisions;
    }

    let seconds = elapsed.as_secs_f64().max(1e-9);
    println!(
        "throughput {:.0} rollouts/s, {:.0} ticks/s, {:.0} decisions/s ({:.2}s wall)",
        results.len() as f64 / seconds,
        ticks as f64 / seconds,
        decisions as f64 / seconds,
        seconds
    );
}

fn bench(args: &Args) {
    // Forked here rather than branched through, for the reason `carved_runs`
    // gives: everything below this line is the measurement every recorded
    // number came from, and it should read exactly as it did before the flag
    // existed.
    if args.flag("carved") {
        carved_bench(args);
        return;
    }

    let count = args.usize("seeds", 200);
    let threads = args.usize("threads", default_threads());
    let heroes = args.u32("heroes", 4);
    let monsters = args.u32("monsters", 6);
    let kind = args.choice("policy", PolicyKind::Utility, &POLICIES);
    let seeds: Vec<u64> = (0..count as u64).collect();

    println!(
        "running {count} rollouts of {heroes}v{monsters} across {threads} threads ({})",
        kind.name()
    );
    let started = Instant::now();
    let results = parallel_runs(&seeds, heroes, monsters, threads, kind);
    let elapsed = started.elapsed();

    let mut tally = Tally::default();
    let mut scores = Vec::with_capacity(results.len());
    let mut ticks = 0u64;
    let mut decisions = 0u64;
    let (mut blows, mut blocks, mut parries) = (0u64, 0u64, 0u64);
    for result in &results {
        tally.add(result);
        scores.push(fitness(result));
        ticks += result.ticks as u64;
        decisions += result.decisions;
        blows += result.blows as u64;
        blocks += result.blocks as u64;
        parries += result.parries as u64;
    }

    let seconds = elapsed.as_secs_f64().max(1e-9);
    let runs = results.len().max(1) as f64;
    println!("fitness  {}", Summary::of(&scores));
    println!("outcomes {tally}");
    println!(
        "swordplay {:.1} blows, {:.1} blocks, {:.1} parries per fight",
        blows as f64 / runs,
        blocks as f64 / runs,
        parries as f64 / runs
    );

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
    let kind = args.choice("policy", PolicyKind::Utility, &POLICIES);
    let config = RunConfig {
        record: true,
        ..RunConfig::default()
    };

    let verbose = args.flag("verbose");
    let mut failures = 0;
    for seed in 0..count {
        let scenario = Scenario::skirmish(seed, heroes, monsters);
        let first = run(&scenario, seed, &mut kind.baseline(), &config);
        let again = run(&scenario, seed, &mut kind.baseline(), &config);

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
        &mut PolicyKind::Utility.baseline(),
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

/// One-on-one across many seeds.
///
/// The point of this command is that "a clever policy can beat a brute" is a
/// *measurement*, not a design intention. It also reports how the fight was
/// won, because two policies can post the same win rate for completely
/// different reasons -- one out-trading and one refusing every trade -- and
/// only the second is swordsmanship.
fn duel(args: &Args) {
    let count = args.u32("seeds", 200) as u64;
    let threads = args.usize("threads", default_threads());
    let hero_kind = args.choice("hero", Body::Rogue, &KINDS);
    let villain_kind = args.choice("villain", Body::Brute, &KINDS);
    let hero_policy = args.choice("policy", PolicyKind::Duelist, &POLICIES);
    let villain_policy = args.choice("opponent", PolicyKind::Utility, &POLICIES);

    println!(
        "{count} duels: {} {} vs {} {}",
        hero_policy.name(),
        hero_kind.name(),
        villain_policy.name(),
        villain_kind.name()
    );

    let seeds: Vec<u64> = (0..count).collect();
    let mut slots: Vec<Option<RunResult>> = vec![None; seeds.len()];
    let chunk = seeds.len().div_ceil(threads.max(1)).max(1);
    let started = Instant::now();

    std::thread::scope(|scope| {
        for (chunk_seeds, out) in seeds.chunks(chunk).zip(slots.chunks_mut(chunk)) {
            scope.spawn(move || {
                let config = RunConfig::default();
                let mut hero = hero_policy.baseline();
                let mut villain = villain_policy.baseline();
                for (i, &seed) in chunk_seeds.iter().enumerate() {
                    let scenario = Scenario::duel_of(hero_kind, villain_kind, seed);
                    let team = policy::TeamPolicy::new(&mut hero, &mut villain);
                    out[i] = Some(run(&scenario, seed, team, &config));
                }
            });
        }
    });

    let results: Vec<RunResult> = slots.into_iter().flatten().collect();
    let runs = results.len().max(1);
    let mut tally = Tally::default();
    let (mut wins, mut draws, mut ticks) = (0usize, 0usize, 0u64);
    let (mut blows, mut blocks, mut parries) = (0u64, 0u64, 0u64);
    let mut surviving = Vec::with_capacity(runs);
    for result in &results {
        tally.add(result);
        if result.heroes_won() {
            wins += 1;
        }
        if result.outcome == sim::Outcome::Draw {
            draws += 1;
        }
        ticks += result.ticks as u64;
        blows += result.blows as u64;
        blocks += result.blocks as u64;
        parries += result.parries as u64;
        surviving.push(result.hero_health);
    }

    let pct = |n: usize| 100.0 * n as f64 / runs as f64;
    println!("outcomes  {tally}");
    println!(
        "win rate  {:.1}%  (draws {:.1}%)",
        pct(wins),
        pct(draws)
    );
    println!(
        "fights    {:.0} ticks mean, hero ends on {} health",
        ticks as f64 / runs as f64,
        Summary::of(&surviving).mean
    );
    println!(
        "swordplay {:.1} blows, {:.1} blocks, {:.1} parries per fight",
        blows as f64 / runs as f64,
        blocks as f64 / runs as f64,
        parries as f64 / runs as f64
    );
    println!("          {:.2}s wall", started.elapsed().as_secs_f64());
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
        // Skirmish by default, because that is what every genome in the
        // repository was measured on; `--arena duel` scores the fight the swing
        // model was actually built for.
        arena: match args.choice("arena", 0u32, &[("skirmish", 0), ("duel", 1), ("roster", 2)]) {
            1 => Arena::Duel {
                hero: args.choice("hero", Body::Fighter, &KINDS),
                villain: args.choice("villain", Body::Brute, &KINDS),
            },
            2 => Arena::Roster,
            _ => Arena::Skirmish {
                heroes: args.u32("heroes", 4),
                monsters: args.u32("monsters", 6),
            },
        },
        kind: args.choice("policy", PolicyKind::Utility, &POLICIES),
        opponent: args.choice("opponent", PolicyKind::Utility, &POLICIES),
        // Off unless asked for: it doubles the rollouts, and a run that is
        // deliberately measuring one opponent should not silently pay for two.
        cross: if args.flag("cross") {
            Some(args.choice("cross-with", PolicyKind::Duelist, &POLICIES))
        } else {
            None
        },
    };

    println!(
        "evolving {} {} genomes for {} generations, {} {} each, sigma {}",
        config.population,
        config.kind.name(),
        config.generations,
        config.seeds,
        config.arena.describe(),
        config.sigma
    );
    println!("opponent: the hand-tuned {}\n", config.opponent.name());

    let started = Instant::now();
    let best = evolve(&config);
    println!(
        "\nbest genome after {:.1}s",
        started.elapsed().as_secs_f64()
    );
    println!("  {}", describe(config.kind, &best));

    // Score the winner and the incumbent on a fresh seed set neither has seen,
    // because a genome that only wins on its training seeds has learned the
    // seeds, not the game.
    let holdout: Vec<u64> = (900_000..900_016).collect();
    let baseline = config.kind.spec().baseline_genome();
    let best_score = crate::evolve::evaluate(&best, &holdout, &config);
    let baseline_score = crate::evolve::evaluate(&baseline, &holdout, &config);
    println!("\nheld-out fitness over {} fresh scenarios:", holdout.len());
    println!("  evolved   {best_score}");
    println!("  baseline  {baseline_score}");
    if best_score > baseline_score {
        println!("  evolution beat the hand-tuned weights");
    } else {
        println!("  the hand-tuned weights still win; try more generations or seeds");
    }
}
