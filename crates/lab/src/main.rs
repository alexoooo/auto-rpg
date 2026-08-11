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
mod trace;

use args::Args;
use evolve::{describe, evolve, Arena, EvolveConfig};
use fitness::{fitness, Summary, Tally};
use trace::{FightTrace, TraceRun};
use fx::{Fx, Vec2};
use policy::{
    run, script_digest, ArticulatedPolicy, ClosingAttackControlPolicy, PolicyKind, RunConfig,
    RunResult, ScriptedArticulatedPolicy, WindmillArticulatedPolicy,
};
use sim::{
    Body, EntityId, Faction, Outcome, Scenario, StateDigest, SubmitArticulatedOutcome,
    SubmittedCommand, SubmittedCommandRecord, UnitSpec, World,
};
use std::time::Instant;

fn main() {
    let args = Args::from_env();
    match args.command() {
        "bench" => bench(&args),
        "verify" => verify(&args),
        "hash" => hash(&args),
        "evolve" => evolution(&args),
        "duel" => duel(&args),
        "articulated" => articulated(&args),
        "trace" => trace_fight(&args),
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

  articulated --seeds N --threads N --mirrored --seed-zero-only
              --policy composed|windmill --attack-moves
          Runs the pinned articulated duel fixture under the twelve-phase
          scripted policy, stopping at the first outcome or at tick 3600, and
          reports what the mechanics did with it. --mirrored adds the exact
          spatial mirror of every seed, reflected across y=8, which measures
          north/south geometry rather than Fighter/Brute balance. It asserts no
          threshold: the number it exists to produce is how many fights ended.
          --policy windmill runs the control that never stops walking or
          swinging. --attack-moves is the second control: the composed script
          with the feet of phases 3, 4, 7 and 8 closing instead of planted,
          which is the cell the reference table leaves unstated. Neither
          control is the reference script and neither may be pinned.

  trace   --seed N --policy composed|windmill|attack-moves --mirrored
          --ticks N --out PATH
          Writes one articulated fight to JSON so it can be watched frame by
          frame in the browser: every published pose, every regional capsule,
          every resolution row. The run is the identical loop the gate measures
          and the recorder cannot change it -- `a_traced_run_is_the_run_the_gate_
          measured` is what says so. --ticks bounds the recording and never the
          fight, and a truncated file says so in its header. Defaults to
          web/fight.json, which `npm run view` serves at /fight.html.

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

// ------------------------------------------------------------- articulated gate

/// Which script drives both sides of the fixture.
///
/// **One of these is the reference and two are controls**, and the naming says
/// so on purpose: `Composed` is the twelve-phase script the `ARPG-SCRIPT-V1`
/// digest is defined over, and nothing recorded under either other arm may be
/// offered as evidence for it.
///
/// The controls exist because checkpoint A's 800/800 tick-limit corpus turned
/// out to be a property of the script rather than of the physics: phases 3, 4,
/// 7 and 8 command `move_dir: Vec2::ZERO`, both bodies coast to a standstill
/// inside every attack, and the arm term alone cannot reach
/// `CONTACT_ENERGY_FLOOR`. Both controls put the feet back -- the windmill
/// because it always walked, the closing script because that is the single
/// cell under evaluation -- so between them they say whether the floor is
/// binding for this physics or only for that reading of the table.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Script {
    Composed,
    Windmill,
    ClosingAttacks,
}

impl Script {
    /// A fresh instance per faction, which is what the fixture asks for.
    fn policy(self) -> Box<dyn ArticulatedPolicy> {
        match self {
            Script::Composed => Box::new(ScriptedArticulatedPolicy),
            Script::Windmill => Box::new(WindmillArticulatedPolicy),
            Script::ClosingAttacks => Box::new(ClosingAttackControlPolicy),
        }
    }

    fn name(self) -> &'static str {
        match self {
            Script::Composed => "the composed script",
            Script::Windmill => "the windmill control",
            Script::ClosingAttacks => "the composed script with closing attacks (control)",
        }
    }

    /// The same three arms as the command line spells them, for a machine
    /// reader. Separate from [`Script::name`] because that one is a sentence
    /// fragment and this one is an identifier, and a trace header that carried
    /// "the composed script" would make its consumer parse English.
    fn token(self) -> &'static str {
        match self {
            Script::Composed => "composed",
            Script::Windmill => "windmill",
            Script::ClosingAttacks => "attack-moves",
        }
    }
}

/// The script knobs, resolved once for every command that takes them.
///
/// Two knobs rather than one three-way choice, because they are not three points
/// on one axis: `--policy` picks which script runs, and `--attack-moves` edits
/// one cell of the composed one. Folding the control into the policy list would
/// let `--policy windmill --attack-moves` look like a thing, and it is not --
/// the windmill never plants its feet.
fn script_from(args: &Args) -> Script {
    match args.choice(
        "policy",
        Script::Composed,
        &[("composed", Script::Composed), ("windmill", Script::Windmill)],
    ) {
        Script::Composed if args.flag("attack-moves") => Script::ClosingAttacks,
        Script::Windmill if args.flag("attack-moves") => {
            eprintln!("--attack-moves edits the composed script; the windmill already walks");
            std::process::exit(2);
        }
        chosen => chosen,
    }
}

/// The pinned fixture reflected across `y = 8`.
///
/// **Chosen because it is the only reflection that costs the scenario nothing.**
/// The spawn yaws are derived from the faction -- zero for Heroes, `HALF` for
/// Monsters -- and both are their own negations, so a Y reflection leaves both
/// bodies facing exactly where a mirrored fighter should face without the
/// scenario growing a yaw column to be told about it. An X reflection would need
/// one.
///
/// The mirror keeps the fixture's name and therefore *does not* keep its
/// fingerprint, which is correct and worth saying out loud: a mirrored run is a
/// run of a different scenario, it is never the pin, and nothing recorded from
/// it may be offered as the canonical seed-zero replay.
fn mirrored_articulated_duel() -> Scenario {
    let mut scenario = Scenario::articulated_duel();
    let height = scenario.arena().y;
    for unit in scenario.units.iter_mut() {
        unit.spawn.y = height - unit.spawn.y;
    }
    scenario
}

/// One measured run of the fixture.
///
/// A sibling of [`RunResult`] rather than an extension of it, and the reason is
/// the same one that keeps this command from simply calling
/// `policy::run_articulated`: three of the numbers the mechanical gate turns on
/// -- how many contacts resolved, `contact_cap_hits`, and the worst per-tick
/// energy-ledger excess -- are read off the **world** immediately after each
/// step, and `RunResult` deliberately carries none of them. Widening
/// `RunResult` would hang four articulated-only columns off the struct every
/// legacy rollout in this lab allocates, on the hot path of the numbers that
/// must not move. Two copies of a loop is a thing that drifts, so
/// `the_measured_run_is_the_run_the_harness_would_have_driven` pins this one
/// against the runner's.
#[derive(Clone, Debug)]
struct ArticulatedTrial {
    seed: u64,
    outcome: Outcome,
    /// Whether the clock and not a body decided this fight. Carried separately
    /// from the outcome because `World::timeout` scores a run that ran out of
    /// clock on points, so `Decision(Heroes)` is both a Fighter win and a fight
    /// nobody finished, and the gate counts it under both headings.
    timed_out: bool,
    ticks: u32,
    hero_health: Fx,
    monster_health: Fx,
    contacts: u64,
    cap_hits: u32,
    /// `max(0, after - before)` over every resolution row in the run.
    ///
    /// **It cannot be anything but zero, and that is why `solver_rejections`
    /// sits beside it.** `resolve_group_into` returns
    /// `Err(ResolutionError::Projector)` for exactly the condition
    /// `after > before`, and `World::resolve_contact`'s error arm then *clears*
    /// the resolution list -- so the rows a violation would appear in are the
    /// rows a violation deletes. Read alone this field says "no observed row
    /// created energy", which is a tautology; read with the rejection count it
    /// says "no row created energy and no row went unobserved", which is the
    /// claim the evidence artifact means to make.
    max_energy_excess: u64,
    /// Ticks whose whole contact phase the solver refused, cumulative, and why
    /// the first of them was. The blind spot the field above cannot see into,
    /// and the one signal that can actually fail -- which, the first time it
    /// was measured, it did: 6.5% of the composed corpus. It reads zero on all
    /// three corpora since checkpoint B stopped the contact projector
    /// re-deriving an unmoved hand, so the excess above finally audits the
    /// whole fight rather than the part of it that survived.
    solver_rejections: u32,
    first_rejection: Option<sim::ResolutionError>,
    /// Resolution rows that took a region off, and the largest weapon-body
    /// energy any single row carried into one. Both are read off the published
    /// rows rather than off the anatomy, so they answer per blow rather than
    /// per tick.
    severances: u64,
    max_blow_raw: u64,
    /// The most health credited to attackers in any one tick. The per-blow
    /// figure the rows cannot give -- integrity loss is not published per
    /// fact -- read at its cheapest honest granularity instead.
    max_tick_damage: Fx,
    rejected: u32,
    digest: u64,
    state: StateDigest,
}

/// Drives one seed to its stop and records what the mechanics did.
fn measure_articulated(scenario: &Scenario, seed: u64, script: Script) -> ArticulatedTrial {
    measure_articulated_traced(scenario, seed, script, None)
}

/// The same run with a frame recorder optionally hung off it.
///
/// **A parameter rather than a second loop**, for the reason the struct above
/// already gives: this loop is a copy of `run_articulated`'s and a third copy is
/// a third thing to drift. A recorder observes and returns nothing to the world,
/// so the traced and untraced runs are the same fight by construction --
/// `a_traced_run_is_the_run_the_gate_measured` is the assertion that keeps it
/// true if that ever stops being obvious.
fn measure_articulated_traced(
    scenario: &Scenario,
    seed: u64,
    script: Script,
    mut recorder: Option<&mut FightTrace>,
) -> ArticulatedTrial {
    let config = RunConfig::default();
    let mut world = World::new(scenario, seed);
    // Set for the reason `run_articulated` sets them: an articulated
    // observation has no order column so nothing reads these, and they reach
    // the state hash anyway, so a driver that skipped them would fingerprint a
    // different world from the one the runner fingerprints for the same seed.
    for (faction, order) in [
        (Faction::Heroes, config.orders[0]),
        (Faction::Monsters, config.orders[1]),
    ] {
        world.set_order(faction, order);
    }

    // **One fresh policy per faction**, which the fixture specifies and
    // `run_articulated` deliberately does not do -- it drives one instance
    // across both sides. Both are the same stateless script today so the two
    // shapes cannot be told apart, and the split is still the right one: the day
    // one side gets a different script, the thing that has to change must not be
    // the shape of this loop. Routed on the alive set rather than on the
    // observation, which has no faction column by design.
    //
    // Reset anyway, on `ArticulatedPolicy::reset`'s contract. It is a no-op on
    // an instance built one line above and on a policy with no state, and it is
    // what stops "fresh" from quietly meaning "whatever a stateful successor
    // happens to construct itself with".
    let heroes = world.alive_ids(Faction::Heroes);
    let mut hero_policy = script.policy();
    let mut monster_policy = script.policy();
    hero_policy.reset();
    monster_policy.reset();

    let mut due: Vec<EntityId> = Vec::new();
    let mut stream: Vec<SubmittedCommandRecord> = Vec::new();
    let mut contacts = 0u64;
    let mut max_energy_excess = 0u64;
    let mut severances = 0u64;
    let mut max_blow_raw = 0u64;
    let mut max_tick_damage = Fx::ZERO;
    let mut dealt = Fx::ZERO;
    let mut rejected = 0u32;

    // The runner's expression, character for character, rather than
    // `scenario.max_ticks` -- which is the same number today only because
    // `RunConfig::default` leaves the override unset.
    let limit = config.max_ticks.unwrap_or(scenario.max_ticks);
    // Frame zero is the fixture as it spawned, before anybody has decided
    // anything. It is the only frame that shows the starting geometry, which is
    // half of what a first look at this fight is for.
    if let Some(trace) = recorder.as_deref_mut() {
        trace.record(&world);
    }
    while world.outcome().is_none() && world.tick() < limit {
        due.clear();
        due.extend_from_slice(world.pending_decisions());
        for &id in &due {
            let obs = world.observe_articulated(id);
            let command = if heroes.contains(&id) {
                hero_policy.decide(&obs)
            } else {
                monster_policy.decide(&obs)
            };
            match world.submit_articulated_v1(id, command) {
                SubmitArticulatedOutcome::Stored { command, rejection } => {
                    if rejection.is_some() {
                        rejected += 1;
                    }
                    // The stored command and never the offered one, which is
                    // what `ARPG-SCRIPT-V1` is defined over: a refused
                    // submission stores the neutral command, and the digest has
                    // to describe the fight that happened.
                    stream.push(SubmittedCommandRecord {
                        tick: world.tick(),
                        entity: id,
                        command: SubmittedCommand::Articulated(command),
                    });
                }
                SubmitArticulatedOutcome::NotStored(_) => rejected += 1,
            }
        }
        let _ = world.step();
        for row in world.contact_resolutions() {
            contacts += 1;
            max_energy_excess = max_energy_excess
                .max(row.energy.after_raw.saturating_sub(row.energy.before_raw));
            severances += u64::from(row.severed);
            // Cut plus thrust and not pressure: the two channels a weapon-body
            // fact bills a wound out of. Pressure is the leaning term, which is
            // where all of checkpoint A's attrition came from and is exactly
            // what a "blow" has to be measured apart from.
            max_blow_raw = max_blow_raw.max(row.cut_raw.saturating_add(row.thrust_raw));
        }
        let total = world.damage_dealt(Faction::Heroes) + world.damage_dealt(Faction::Monsters);
        max_tick_damage = max_tick_damage.max(total - dealt);
        dealt = total;
        if let Some(trace) = recorder.as_deref_mut() {
            trace.record(&world);
        }
    }

    let settled = world.outcome();
    ArticulatedTrial {
        seed,
        outcome: settled.unwrap_or_else(|| world.timeout()),
        timed_out: settled.is_none(),
        ticks: world.tick(),
        hero_health: world.health_fraction(Faction::Heroes),
        monster_health: world.health_fraction(Faction::Monsters),
        contacts,
        cap_hits: world.contact_cap_hits(),
        max_energy_excess,
        solver_rejections: world.contact_solver_rejections(),
        first_rejection: world.first_contact_rejection(),
        severances,
        max_blow_raw,
        max_tick_damage,
        rejected,
        digest: script_digest(&stream),
        state: world.state_digest(),
    }
}

/// The same index-ordered fan-out [`parallel_runs`] uses, on the fixture.
fn articulated_trials(
    scenario: &Scenario,
    seeds: &[u64],
    threads: usize,
    script: Script,
) -> Vec<ArticulatedTrial> {
    let mut slots: Vec<Option<ArticulatedTrial>> = vec![None; seeds.len()];
    if seeds.is_empty() {
        return Vec::new();
    }
    let chunk = seeds.len().div_ceil(threads.max(1)).max(1);

    std::thread::scope(|scope| {
        for (chunk_seeds, out) in seeds.chunks(chunk).zip(slots.chunks_mut(chunk)) {
            scope.spawn(move || {
                for (i, &seed) in chunk_seeds.iter().enumerate() {
                    out[i] = Some(measure_articulated(scenario, seed, script));
                }
            });
        }
    });

    slots
        .into_iter()
        .map(|slot| slot.expect("every seed should have produced a trial"))
        .collect()
}

/// The scripted mechanical measurement, and **only** the measurement.
///
/// It prints no verdict and asserts no threshold, which is the whole design of
/// v2-17 checkpoint A: the gate's thresholds are chosen against a physics that
/// checkpoint B may still change, and a command that failed here today would be
/// reporting a decision nobody has made yet. What it produces is the one number
/// that decides B -- how many of these fights end.
///
/// **Which is why it takes a script rather than owning one.** The first corpus
/// it produced said 800 of 800 fights reached the clock, and that turned out to
/// be a fact about `Vec2::ZERO` in four phases rather than about the contact
/// model. A measurement that can only be taken one way cannot tell those two
/// apart, so both controls run through this same loop and print the same
/// columns.
fn articulated(args: &Args) {
    let count = args.u32("seeds", 400) as u64;
    let threads = args.usize("threads", default_threads());
    let seeds: Vec<u64> = if args.flag("seed-zero-only") {
        vec![0]
    } else {
        (0..count).collect()
    };

    let original = Scenario::articulated_duel();
    let mirror = mirrored_articulated_duel();
    let mirrored = args.flag("mirrored");

    let script = script_from(args);

    println!(
        "{} seeds x {} orientation{} = {} trials of {} under {}",
        seeds.len(),
        if mirrored { 2 } else { 1 },
        if mirrored { "s" } else { "" },
        seeds.len() * if mirrored { 2 } else { 1 },
        original.name,
        script.name()
    );
    println!(
        "fixture   0x{:016x} canonical, 0x{:016x} mirrored across y={}",
        original.fingerprint(),
        mirror.fingerprint(),
        original.arena().y / Fx::from_int(2)
    );

    let started = Instant::now();
    let canonical = articulated_trials(&original, &seeds, threads, script);
    let reflected = if mirrored {
        articulated_trials(&mirror, &seeds, threads, script)
    } else {
        Vec::new()
    };
    let elapsed = started.elapsed();

    let all: Vec<&ArticulatedTrial> = canonical.iter().chain(reflected.iter()).collect();
    let trials = all.len().max(1);
    let fighter_wins = |set: &[ArticulatedTrial]| {
        set.iter()
            .filter(|t| t.outcome.winner() == Some(Faction::Heroes))
            .count()
    };

    let mut heroes_win = 0usize;
    let mut monsters_win = 0usize;
    let mut mutual = 0usize;
    let mut draws = 0usize;
    let mut decisions = 0usize;
    let mut limits = 0usize;
    let mut contacts = 0u64;
    let mut cap_hits = 0u64;
    let mut rejected = 0u64;
    let mut excess = 0u64;
    let mut solver_rejections = 0u64;
    let mut first_rejection: Option<sim::ResolutionError> = None;
    let mut severances = 0u64;
    let mut max_blow_raw = 0u64;
    let mut max_tick_damage = Fx::ZERO;
    let mut decisive = 0usize;
    let mut lengths = Vec::with_capacity(all.len());
    let mut hero_health = Vec::with_capacity(all.len());
    let mut monster_health = Vec::with_capacity(all.len());
    for trial in &all {
        match trial.outcome {
            Outcome::HeroesWin => heroes_win += 1,
            Outcome::MonstersWin => monsters_win += 1,
            Outcome::MutualDestruction => mutual += 1,
            Outcome::Decision(_) => decisions += 1,
            Outcome::Draw => draws += 1,
        }
        if trial.timed_out {
            limits += 1;
        } else {
            // A body decided it. The complement of `timed_out` and printed as
            // its own number anyway, because "how many fights ended" is the
            // question the command exists to answer and a reader should not
            // have to subtract to find it.
            decisive += 1;
        }
        contacts += trial.contacts;
        cap_hits += trial.cap_hits as u64;
        rejected += trial.rejected as u64;
        excess = excess.max(trial.max_energy_excess);
        solver_rejections += trial.solver_rejections as u64;
        first_rejection = first_rejection.or(trial.first_rejection);
        severances += trial.severances;
        max_blow_raw = max_blow_raw.max(trial.max_blow_raw);
        max_tick_damage = max_tick_damage.max(trial.max_tick_damage);
        lengths.push(Fx::from_int(trial.ticks as i32));
        hero_health.push(trial.hero_health);
        monster_health.push(trial.monster_health);
    }

    let length = Summary::of(&lengths);
    println!(
        "outcomes  {heroes_win} fighter kills, {monsters_win} brute kills, {mutual} mutual, \
         {decisions} on points, {draws} drawn"
    );
    println!(
        "clock     {decisive}/{trials} decided by a body ({:.1}%), \
         {limits} reached tick {} ({:.1}%)",
        100.0 * decisive as f64 / trials as f64,
        original.max_ticks,
        100.0 * limits as f64 / trials as f64
    );
    let (won, mirrored_won) = (fighter_wins(&canonical), fighter_wins(&reflected));
    if mirrored {
        let side = won.abs_diff(mirrored_won);
        println!(
            "sides     fighter wins {won} canonical, {mirrored_won} mirrored, \
             difference {side} ({:.2} percentage points)",
            100.0 * side as f64 / seeds.len().max(1) as f64
        );
    } else {
        println!("sides     fighter wins {won} canonical (no mirror was run)");
    }
    println!(
        "fights    {} ticks mean, {} median",
        length.mean, length.median
    );
    println!(
        "health    fighter ends on {} mean, brute on {} mean",
        Summary::of(&hero_health).mean,
        Summary::of(&monster_health).mean
    );
    println!(
        "contacts  {contacts} resolutions, {cap_hits} cap hits, \
         max energy excess raw {excess} over {solver_rejections} refused ticks{}",
        match first_rejection {
            Some(cause) => format!(" (first {cause:?})"),
            None => String::new(),
        }
    );
    println!(
        "blows     {severances} severances, max weapon-body energy raw {max_blow_raw}, \
         worst tick took {max_tick_damage} health"
    );
    println!("commands  {rejected} refused submissions");

    // The two fingerprints of the canonical pin run, printed and deliberately
    // **not** recorded anywhere. `ARTICULATED_HASH` is created once, at the very
    // end of v2-17, after both gates pass; a constant pinned here would be a
    // promise about a physics that checkpoint B is still allowed to change, and
    // `docs/reference/hashes.md` forbids exactly that.
    if let Some(pin) = canonical.first().filter(|t| t.seed == 0) {
        println!(
            "seed 0    {:?}/{} 0x{:016x}  script 0x{:016x}",
            pin.state.domain, pin.state.schema, pin.state.value, pin.digest
        );
        println!(
            "          {} ticks, {:?}, {} contacts",
            pin.ticks, pin.outcome, pin.contacts
        );
    }
    println!("          {:.2}s wall", elapsed.as_secs_f64());
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

// ------------------------------------------------------------------ the trace

/// One fight, written out to be looked at.
///
/// **The one command in this lab that produces no number.** Everything else here
/// reduces a corpus to a statistic, and v2-17 closed with three of those
/// statistics having been read confidently and wrongly -- a floor that was not
/// binding, a lengthened capsule that was not the mechanism, a pin that could not
/// move. The closure's first instruction to a successor is to go and watch a
/// fight before calibrating anything else, and this is the command that makes
/// that possible.
///
/// It takes one seed, because a fight is a thing you watch and not a thing you
/// aggregate.
fn trace_fight(args: &Args) {
    let seed = args.number("seed", 3);
    let script = script_from(args);
    let mirrored = args.flag("mirrored");
    let scenario = if mirrored {
        mirrored_articulated_duel()
    } else {
        Scenario::articulated_duel()
    };
    // The whole fight unless asked otherwise. A `u32::MAX` default rather than
    // `max_ticks` so that a fixture whose limit grows keeps recording all of it.
    let limit = args.u32("ticks", u32::MAX);
    let path = args
        .text("out")
        .unwrap_or("web/fight.json")
        .to_string();

    let mut recorder = FightTrace::new(&scenario, limit);
    let started = Instant::now();
    let trial = measure_articulated_traced(&scenario, seed, script, Some(&mut recorder));
    let json = recorder.finish(&TraceRun {
        scenario: &scenario,
        seed,
        script: script.token(),
        mirrored,
        outcome: trial.outcome,
        timed_out: trial.timed_out,
        ticks: trial.ticks,
    });

    if let Err(error) = std::fs::write(&path, json.as_bytes()) {
        eprintln!("could not write {path}: {error}");
        std::process::exit(1);
    }

    println!(
        "seed {seed} of {} under {} -- {} tick{}, {}",
        scenario.name,
        script.name(),
        trial.ticks,
        if trial.ticks == 1 { "" } else { "s" },
        if trial.timed_out { "the clock decided it" } else { "a body decided it" },
    );
    println!(
        "  {:?}, hero {} monster {}, {} contact{}, {} severance{}",
        trial.outcome,
        trial.hero_health,
        trial.monster_health,
        trial.contacts,
        if trial.contacts == 1 { "" } else { "s" },
        trial.severances,
        if trial.severances == 1 { "" } else { "s" },
    );
    println!(
        "  wrote {path} -- {:.1} MB in {:.1}s",
        json.len() as f64 / (1024.0 * 1024.0),
        started.elapsed().as_secs_f64(),
    );
    println!("  npm run view, then open http://localhost:5173/fight.html");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_traced_run_is_the_run_the_gate_measured() {
        // The recorder is an observer and the fight must not be able to tell it
        // is there. That is obvious from the code today and it is exactly the
        // kind of obvious that a later `record` reading something it has to
        // compute -- a region volume, a spec lookup, a scratch buffer -- could
        // quietly stop being. Every column of the trial, including the state
        // digest, which is the one that would notice a single changed bit.
        let scenario = Scenario::articulated_duel();
        let mut recorder = FightTrace::new(&scenario, u32::MAX);
        let traced = measure_articulated_traced(&scenario, 3, Script::Composed, Some(&mut recorder));
        let plain = measure_articulated(&scenario, 3, Script::Composed);

        // Through `compare` rather than `==`: `StateDigest` has no `PartialEq`
        // on purpose, because a domain or schema mismatch is an error and not a
        // `false`.
        assert_eq!(traced.state.compare(plain.state), Ok(true));
        assert_eq!(traced.digest, plain.digest);
        assert_eq!(traced.ticks, plain.ticks);
        assert_eq!(traced.outcome, plain.outcome);
        assert_eq!(traced.contacts, plain.contacts);
        assert_eq!(traced.severances, plain.severances);
        assert_eq!(traced.hero_health, plain.hero_health);
        assert_eq!(traced.monster_health, plain.monster_health);

        // And the artifact covers the whole fight: one frame per tick plus the
        // spawn. A recorder that silently dropped the last frame would still
        // pass every assertion above.
        let json = recorder.finish(&TraceRun {
            scenario: &scenario, seed: 3, script: Script::Composed.token(), mirrored: false,
            outcome: traced.outcome, timed_out: traced.timed_out, ticks: traced.ticks,
        });
        assert!(json.contains(&format!("\"frameCount\":{}", plain.ticks + 1)), "frame count");
        assert!(json.contains("\"truncated\":false"), "an unbounded recording is not truncated");
        assert!(json.contains(&format!("\"schema\":\"{}\"", trace::TRACE_SCHEMA)), "schema");
    }

    #[test]
    fn a_bounded_recording_says_it_stopped_early() {
        // The bound is on the file and never on the fight: the trial has to be
        // the one the gate would have reported, and the header has to admit that
        // what a viewer is showing is a prefix. Getting this backwards would put
        // a fight that "ended at tick 60" on the screen.
        let scenario = Scenario::articulated_duel();
        let mut recorder = FightTrace::new(&scenario, 60);
        let trial = measure_articulated_traced(&scenario, 3, Script::Composed, Some(&mut recorder));
        let unbounded = measure_articulated(&scenario, 3, Script::Composed);
        assert_eq!(trial.state.compare(unbounded.state), Ok(true));
        assert!(trial.ticks > 60, "the fixture runs past the recording bound");

        let json = recorder.finish(&TraceRun {
            scenario: &scenario, seed: 3, script: Script::Composed.token(), mirrored: false,
            outcome: trial.outcome, timed_out: trial.timed_out, ticks: trial.ticks,
        });
        assert!(json.contains("\"frameCount\":60"), "the recording stopped at its bound");
        assert!(json.contains("\"truncated\":true"), "and the header says so");
    }

    #[test]
    fn the_measured_run_is_the_run_the_harness_would_have_driven() {
        // `measure_articulated` is a second copy of `run_articulated`'s decision
        // loop, carrying the contact evidence `RunResult` does not. Two copies
        // of a loop drift, and the way this one would drift is silent: a
        // different order, a decision taken a tick late, a command recorded
        // before the world stored it, and the digest and the pin would describe
        // a run the runner never produced. So every column the two both carry
        // has to agree, including the command stream reduced to eight bytes.
        //
        // **What it cannot catch, stated so nobody trusts it further than it
        // goes.** The two loops genuinely differ in three places, and all three
        // are invisible against this policy: one instance per faction rather
        // than one across both (the fixture asks for the split, and a stateless
        // script cannot tell), the tick limit taken from `RunConfig` rather than
        // straight off the scenario (the same number while the override is
        // `None`), and `reset` (a no-op on a policy with no state). A stateful
        // articulated policy would need a stronger comparison than this one.
        let scenario = Scenario::articulated_duel();
        let trial = measure_articulated(&scenario, 3, Script::Composed);
        let config = RunConfig {
            record: true,
            ..RunConfig::default()
        };
        let harness =
            policy::run_articulated(&scenario, 3, ScriptedArticulatedPolicy, &config);
        assert_eq!(trial.ticks, harness.ticks);
        assert_eq!(trial.outcome, harness.outcome);
        assert_eq!(trial.hero_health, harness.hero_health);
        assert_eq!(trial.monster_health, harness.monster_health);
        assert_eq!(trial.rejected, harness.rejected);
        let replay = harness.replay.as_ref().expect("recording was requested");
        assert_eq!(trial.digest, script_digest(&replay.submitted_entries));
        // And the typed digest, which `RunResult` does not carry: replaying the
        // runner's own recording has to land on the exact state this loop
        // reported. Through `compare` rather than `==`, because `StateDigest`
        // has no `PartialEq` on purpose -- a domain or schema mismatch is an
        // error and not a `false`.
        assert_eq!(replay.play().state_digest().compare(trial.state), Ok(true));
    }

    #[test]
    fn the_mirror_reflects_the_spawn_row_and_nothing_else() {
        // The mirror measures north/south geometry, so it has to be a pure
        // reflection: anything else it changed would be a second variable in a
        // comparison built to have one.
        let original = Scenario::articulated_duel();
        let mirror = mirrored_articulated_duel();
        assert_eq!(mirror.units[0].spawn, Vec2::from_ints(7, 10));
        assert_eq!(mirror.units[1].spawn, Vec2::from_ints(17, 6));
        assert_ne!(
            mirror.fingerprint(),
            original.fingerprint(),
            "a mirrored run must never be mistakable for the pin"
        );
        let height = mirror.arena().y;
        let mut back = mirror.clone();
        for unit in back.units.iter_mut() {
            unit.spawn.y = height - unit.spawn.y;
        }
        assert_eq!(back, original, "the reflection moved something that is not a spawn");
    }

    #[test]
    fn results_do_not_depend_on_the_thread_that_computed_them() {
        // The same claim the focus and goto batteries make, and it has the same
        // shape here: results are written into index-ordered slots, so a chunk
        // that finished first cannot reorder the corpus the summary is computed
        // from.
        let scenario = Scenario::articulated_duel();
        let seeds: Vec<u64> = (0..4).collect();
        let one: Vec<u64> = articulated_trials(&scenario, &seeds, 1, Script::Composed)
            .iter()
            .map(|t| t.digest)
            .collect();
        let many: Vec<u64> = articulated_trials(&scenario, &seeds, 4, Script::Composed)
            .iter()
            .map(|t| t.digest)
            .collect();
        assert_eq!(one, many);
    }

    #[test]
    fn each_script_is_a_different_fight_and_only_one_of_them_is_the_reference() {
        // The controls have to be reachable *and* distinguishable, or the
        // comparison they exist for is a comparison of one thing with itself.
        // The digest is the right witness: it is the stored command stream, so
        // two scripts sharing it would mean the flag reached nothing.
        let scenario = Scenario::articulated_duel();
        let composed = measure_articulated(&scenario, 3, Script::Composed);
        let windmill = measure_articulated(&scenario, 3, Script::Windmill);
        let closing = measure_articulated(&scenario, 3, Script::ClosingAttacks);
        assert_ne!(composed.digest, windmill.digest);
        assert_ne!(composed.digest, closing.digest);
        assert_ne!(windmill.digest, closing.digest);

        // And the reference arm is still bit-for-bit the run the harness drives
        // with the reference policy, which is what stops a control from
        // becoming the pin by way of a default.
        let harness = policy::run_articulated(
            &scenario,
            3,
            ScriptedArticulatedPolicy,
            &RunConfig {
                record: true,
                ..RunConfig::default()
            },
        );
        let replay = harness.replay.as_ref().expect("recording was requested");
        assert_eq!(composed.digest, script_digest(&replay.submitted_entries));
    }

    #[test]
    fn a_zero_energy_excess_is_only_evidence_while_the_solver_refuses_nothing() {
        // **The correction this command exists to record, and it is not
        // hypothetical.** `max_energy_excess` is computed over published rows;
        // a group that creates energy is precisely a group whose rows
        // `World::resolve_contact` deletes before anyone can publish them. So
        // the field cannot report anything but zero, and until this test was
        // written that zero was on its way into a committed evidence artifact
        // as proof of soundness. The two numbers only mean anything together,
        // which is why they are asserted together and reported side by side.
        //
        // Written first as `solver_rejections > 0`, because that was the state
        // of the tree: the fixture refused roughly two hundred of its 3,600
        // ticks under every script, always `ResolutionError::Projector`, the
        // `after > before` arm. Checkpoint B found the cause -- `project`
        // re-derived every equipment row through the joint's inexact inverse
        // map at every alpha including zero, and the drift read as created
        // energy -- and this assertion is its gate, inverted rather than
        // deleted so that the direction it was inverted from stays on the
        // record. A refusal reappearing here is a projector defect and not a
        // threshold to relax.
        for script in [Script::Composed, Script::Windmill, Script::ClosingAttacks] {
            let trial = measure_articulated(&Scenario::articulated_duel(), 5, script);
            assert!(trial.contacts > 0, "{}: nothing touched", script.name());
            assert_eq!(trial.max_energy_excess, 0, "{}", script.name());
            assert_eq!(
                trial.solver_rejections, 0,
                "{}: the solver refused a tick, so the zero above audits nothing",
                script.name()
            );
            assert_eq!(trial.first_rejection, None, "{}", script.name());
        }
    }
}
