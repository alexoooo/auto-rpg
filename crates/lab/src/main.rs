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
mod learn_probe;
mod strong_strike;
mod strike_corpus;
mod tactical_mechanics;
mod trace;

use args::Args;
use evolve::{describe, evolve, Arena, EvolveConfig};
use fitness::{fitness, Summary, Tally};
use trace::{FightTrace, TraceRun};
use fx::{Fx, Hash64, Vec2};
use policy::{
    run, script_digest, ArmRoles, ArticulatedPolicy, ClosingAttackControlPolicy, PolicyKind,
    RunConfig, RunResult, ScriptedArticulatedPolicy, TacticalArticulatedPolicy,
    WindmillArticulatedPolicy,
};
use sim::{
    AnatomyChoice, Body, CombatHeight, ContactKind, DuelConfigV1, EntityId, Faction, Intent,
    Outcome, Scenario, StateDigest, SubmitArticulatedOutcome, SubmittedCommand,
    SubmittedCommandRecord, UnitSpec, World,
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
        "strike-corpus" => strike_corpus::strike_corpus(&args),
        "strong-strike" => strong_strike::strong_strike(),
        "tactical-mechanics" => {
            if tactical_mechanics::ordinal_31_tick_46_scan_requested(&args) {
                if let Err(error) = tactical_mechanics::ordinal_31_tick_46_scan_mode(&args) {
                    eprintln!("{error}");
                    std::process::exit(2);
                }
            } else if tactical_mechanics::ordinal_31_provenance_requested(&args) {
                if let Err(error) = tactical_mechanics::ordinal_31_provenance_mode(&args) {
                    eprintln!("{error}");
                    std::process::exit(2);
                }
            } else { tactical_mechanics::tactical_mechanics(&args); }
        }
        "trace" => trace_fight(&args),
        "learn-probe" => learn_probe::learn_probe(&args),
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
              --policy composed|windmill|tactical --attack-moves
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

  strike-corpus --policy neutral|striker --seeds N --mirrored
          Runs nine fixed approach offsets against stationary Fighter and
          Brute targets and writes one CSV evidence row per case. A geometric
          cross is the committed weapon sweep through the region the policy
          named; contact and wound columns are recorded independently.

  strong-strike
          Drives one controlled maximum-effort tip-of-sword hit and a held-arm
          control through the production World, printing raw pose kinematics,
          contact energy channels and before/after anatomy facts.

  tactical-mechanics --quick|--calibration|--held-out|--strike-corpus|--anatomical-mirror-corpus|--noise-free-mirror-corpus|--mirror-trace-1536|--ordinal-31-provenance|--ordinal-31-tick-46-scan
          Brackets the tactical controller between byte-equal strong-strike
          references on their exact fixed scenario. --calibration runs the
          frozen 900-cell matched corpus and --write PATH records its fixed CSV.
          --summary-write PATH records the same deterministic summary printed
          to stdout, without relying on shell redirection.
          --held-out remains guarded by a structurally valid calibration.
          --strike-corpus runs the complete predeclared Smart39 mechanics-only
          grid and every eligible pair's eighteen local orientations.
          --anatomical-mirror-corpus reruns it with Smart40's swapped hands,
          attacking limb, schedule, and contact-key reflection.
          --noise-free-mirror-corpus retains that grammar and derives the
          Smart41 schedule from its declared spawn offset rather than perception.
          --mirror-trace-1536 runs only Smart41 central ordinal 1536 and its
          anatomical mirror, stopping at their first tick/phase/field divergence.
          --ordinal-31-provenance --write PATH runs the fixed Smart130
          reference/held/reference live-rerun-replay trace on one named worker.
          --ordinal-31-tick-46-scan --write PATH runs the fixed Smart131
          reference/held/reference tick-46 segment/body scan-budget transcript.

  trace   --seed N --policy composed|windmill|tactical|learned --attack-moves --mirrored
          --ticks N --out PATH
          --checkpoint PATH --opponent P --phase-random   (--policy learned only)
          --fighter-a fighter|brute            --fighter-b fighter|brute
          --a-left  sword|shield|club|empty    --a-right ...  (and the b twins)
          --a-shield-half-width R --a-shield-half-height R
          --a-weapon-length R --a-weapon-mass R            (and the b twins)
          Writes one articulated fight to JSON so it can be watched frame by
          frame in the browser: every published pose, every regional capsule,
          every resolution row. The run is the identical loop the gate measures
          and the recorder cannot change it -- `a_traced_run_is_the_run_the_gate_
          measured` is what says so. --ticks bounds the recording and never the
          fight, and a truncated file says so in its header. Defaults to
          web/fight.json, which `npm run view` serves to the studio's Battle
          Arena at /#/arena.
          --policy learned puts a checkpoint on the Fighter and a script on the
          Brute, which is the arrangement `learn-probe` measures; the header
          then names both sides and the checkpoint digest. **The three options
          marked `--policy learned only` apply to that arm alone.** A script
          drives both bodies -- one policy, two sides, which is what makes a
          scripted trace a control -- so `--policy windmill --opponent composed`
          is not a mixed fight and never was; it is a windmill mirror, and the
          header's `heroes`/`monsters` pair is what says so rather than this
          paragraph.
          The fourteen keys in the four-line block at the top of this entry
          describe a duel instead of running the pinned one. **Give none of them
          and the fixture runs, byte for byte** --
          `a_traced_run_is_the_run_the_gate_measured` is a claim about that
          path. Give any one and the scenario becomes `configured-duel-v1`,
          whose fingerprint the header and the recorded file both print so a
          recorded fight names the configuration it came from. R is a decimal
          (`0.35`) turned into fixed point once, at the boundary, and refused if
          it rounds to zero at 1/65536. A weapon key edits every
          segment-geometry item that fighter holds and a shield key every plate,
          so two blades come out the same length rather than raising an argument
          about which one \"the\" weapon is. Two ways of asking for nothing exit
          2 rather than quietly running something else: one of these keys
          written without a value, and one aimed at an item that fighter is not
          carrying.

  learn-probe train    --gens N --pop N --elite N --seeds N --sigma-pct N
                       [--action-layout tactical-v2]
                       --threads N --master-seed N --ticks N --plain
                       --opponent composed|windmill|attack-moves --phase-random
                       --spec v2-probe --out PATH --quiet
  learn-probe evaluate --checkpoint PATH --seeds N --threads N --plain
                       [--action-layout tactical-v2]
                       --opponent composed|windmill|attack-moves
                       --frozen-only --no-replay
          v2-19's learning probe. `train` evolves one small network against a
          frozen script and writes the checkpoint atomically. `evaluate` runs
          five conditions -- a constant network, the three scripts, and the
          checkpoint -- over held-out seeds the optimizer never saw, against
          both the frozen opponent and a phase-randomised control, and prints
          the comparison the decision is made on. A held-out run is recorded as
          the ordinary replay envelope and replayed with no model in the room.

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
    Tactical,
}

impl Script {
    /// A fresh instance per faction, which is what the fixture asks for.
    fn policy(self) -> Box<dyn ArticulatedPolicy> {
        match self {
            Script::Composed => Box::new(ScriptedArticulatedPolicy),
            Script::Windmill => Box::new(WindmillArticulatedPolicy),
            Script::ClosingAttacks => Box::new(ClosingAttackControlPolicy),
            Script::Tactical => Box::new(TacticalArticulatedPolicy::default()),
        }
    }

    fn name(self) -> &'static str {
        match self {
            Script::Composed => "the composed script",
            Script::Windmill => "the windmill control",
            Script::ClosingAttacks => "the composed script with closing attacks (control)",
            Script::Tactical => "the tactical policy",
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
            Script::Tactical => "tactical",
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
        &[
            ("composed", Script::Composed),
            ("windmill", Script::Windmill),
            ("tactical", Script::Tactical),
        ],
    ) {
        Script::Composed if args.flag("attack-moves") => Script::ClosingAttacks,
        Script::Windmill if args.flag("attack-moves") => {
            eprintln!("--attack-moves edits the composed script; the windmill already walks");
            std::process::exit(2);
        }
        Script::Tactical if args.flag("attack-moves") => {
            eprintln!("--attack-moves edits the composed script; tactical decides its own feet");
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
    mirror_spawns(&mut scenario);
    scenario
}

/// The reflection itself, so that `trace`'s `--mirrored` means the same thing
/// over a described duel as it does over the pinned one. Reads the height off
/// the scenario rather than writing `8` down a second time.
fn mirror_spawns(scenario: &mut Scenario) {
    let height = scenario.arena().y;
    for unit in scenario.units.iter_mut() {
        unit.spawn.y = height - unit.spawn.y;
    }
}

/// Which of the three ordinary heights this is, or `None`.
///
/// **`None` rather than a fourth bucket**, because the fourth height that
/// exists -- the Dev control's raw `24_576` -- belongs to a command path none of
/// the three scripts here can reach, and a bucket for it would be a column that
/// is always zero and therefore never read. If one ever appears in this corpus
/// the pair is dropped and the table's own total stops matching the tick count,
/// which is a louder signal than a silent fourth column.
fn height_index(height: CombatHeight) -> Option<usize> {
    [CombatHeight::LOW, CombatHeight::MID, CombatHeight::HIGH]
        .iter()
        .position(|candidate| candidate.raw() == height.raw())
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
    /// Resolutions by [`ContactKind`] discriminant: weapon/weapon, then
    /// weapon/shield, then weapon/body.
    ///
    /// **The middle one is what "the plate is beatable" is a claim about.** The
    /// total above says how busy the fight was and cannot distinguish a blade
    /// that was stopped from one that landed, so a shield dimension moves the
    /// total by an amount nobody can read. Split three ways it is one
    /// subtraction: a smaller plate should take a smaller share and hand the
    /// difference to the body column.
    kinds: [u64; 3],
    /// `[attacker weapon height][defender guard height]`, both as
    /// `[LOW, MID, HIGH]` indices, counted once per ordered pair of deciding
    /// bodies per tick where the attacker's intent is `Attack`.
    ///
    /// **The lockstep audit, and it caught something.** Both bodies read the
    /// same tick, so while both height clocks were `(tick / HEIGHT_TICKS) % 3`
    /// this table came back 100.00% diagonal over the mirrored corpus: every
    /// swing meeting a guard at its own height and no other, which is one cell
    /// of a three-by-three table being reported as the shield's behaviour.
    /// `policy::GUARD_LEAD_TICKS` is what that measurement bought, and
    /// off-diagonal mass here is the evidence it is still doing its job.
    guard_pairs: [[u64; 3]; 3],
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
    recorder: Option<&mut FightTrace>,
) -> ArticulatedTrial {
    let mut heroes = script.policy();
    let mut monsters = script.policy();
    measure_articulated_matchup(scenario, seed, heroes.as_mut(), monsters.as_mut(), recorder)
}

/// The same loop with the two sides chosen by the caller.
///
/// **Split out so that `lab trace` can watch a learned fight**, which is a fight
/// with a different policy on each side -- and split rather than duplicated
/// because the paragraph above is about this loop being a copy of
/// `run_articulated`'s, and a fourth copy would be a fourth thing to drift. The
/// gate's own entry points still take a [`Script`] and still put the same script
/// on both sides, so nothing the corpus measures can reach this by accident.
fn measure_articulated_matchup(
    scenario: &Scenario,
    seed: u64,
    hero_policy: &mut dyn ArticulatedPolicy,
    monster_policy: &mut dyn ArticulatedPolicy,
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
    hero_policy.reset();
    monster_policy.reset();

    let mut due: Vec<EntityId> = Vec::new();
    let mut stream: Vec<SubmittedCommandRecord> = Vec::new();
    let mut contacts = 0u64;
    let mut kinds = [0u64; 3];
    let mut guard_pairs = [[0u64; 3]; 3];
    // One row per body that decided this tick: whether it asked to attack, the
    // height its weapon arm was commanded to, and the height its off arm was
    // commanded to. Cleared and refilled rather than allocated, because this
    // runs inside the tick loop of every seed on every thread.
    let mut commanded: Vec<(bool, Option<usize>, Option<usize>)> = Vec::new();
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
        commanded.clear();
        for &id in &due {
            let obs = world.observe_articulated(id);
            let command = if heroes.contains(&id) {
                hero_policy.decide(&obs)
            } else {
                monster_policy.decide(&obs)
            };
            // Read off the *offered* command and the roles the script itself
            // assigned, before the world has had a chance to refuse anything.
            // The lockstep question is about what the two scripts asked for --
            // a refused submission is already counted, loudly, one field down.
            let roles = ArmRoles::of(&obs);
            commanded.push((
                matches!(command.intent, Intent::Attack(_)),
                height_index(command.arms[roles.weapon].height),
                height_index(command.arms[1 - roles.weapon].height),
            ));
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
        // Ordered pairs and not unordered ones: "who was swinging" and "who was
        // holding the plate" are different roles, and on this fixture only one
        // of the two bodies carries a shield at all, so folding the pair would
        // average the interesting cell with a cell that has no plate in it.
        for (attacker, &(attacking, weapon, _)) in commanded.iter().enumerate() {
            let Some(weapon) = weapon.filter(|_| attacking) else { continue };
            for (defender, &(_, _, guard)) in commanded.iter().enumerate() {
                if defender == attacker {
                    continue;
                }
                if let Some(guard) = guard {
                    guard_pairs[weapon][guard] += 1;
                }
            }
        }
        let _ = world.step();
        for row in world.contact_resolutions() {
            contacts += 1;
            kinds[row.fact.key.kind as usize] += 1;
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
        kinds,
        guard_pairs,
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

const TACTICAL_COMPETENCE_SEEDS: u64 = 50;
const TACTICAL_COMPETENCE_TICKS: u32 = 1_800;
const TACTICAL_COMPETENCE_THRESHOLD: usize = 95;

/// The competence receipt is a frozen experiment, not another configurable
/// articulated run. A rejected spelling is named before any world is built so
/// a command that looks like the gate can never silently measure another one.
fn competence_override(args: &Args) -> Option<&'static str> {
    [
        "seed", "seeds", "ticks", "policy", "opponent", "attack-moves",
        "threshold", "mirrored", "threads", "seed-zero-only",
    ]
    .into_iter()
    .find(|key| args.flag(key) || args.text(key).is_some())
}

fn competence_seeds() -> Vec<u64> {
    (0..TACTICAL_COMPETENCE_SEEDS).collect()
}

fn counts_as_body_decision(timed_out: bool) -> bool {
    !timed_out
}

fn competence_passes(body_decisions: usize, refused: u64, solver_rejections: u64) -> bool {
    body_decisions >= TACTICAL_COMPETENCE_THRESHOLD
        && refused == 0
        && solver_rejections == 0
}

fn competence_digest(rows: &[ArticulatedTrial]) -> u64 {
    let mut hash = Hash64::new();
    hash.write_bytes(b"ARPG-TACTICAL-COMPETENCE-V1");
    for row in rows {
        hash.write_u64(row.seed);
        hash.write_u64(row.digest);
    }
    hash.finish()
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Debug)]
struct FirstCompetenceRejection {
    mirrored: bool,
    tick_before: u32, tick_after: u32,
    rejection_before: u32, rejection_after: u32,
    exact: Option<sim::ExactContactRejectionDiagnostic>,
    pair: Option<sim::ExactScanPairRejectionDiagnostic>,
    policy: [Option<policy::StrikeDiagnostics>; 2],
    offered: [Option<sim::ArticulatedCommandV1>; 2],
    stored: [Option<sim::ArticulatedCommandV1>; 2],
    decision_calls: [u32; 2], steps: u32,
    command_digest: u64,
    state: StateDigest,
}

#[cfg(feature = "cartesian-recoil")]
fn first_competence_rejection(mut scenario: Scenario, mirrored: bool)
    -> Option<FirstCompetenceRejection>
{
    scenario.max_ticks = TACTICAL_COMPETENCE_TICKS;
    let mut world = World::new(&scenario, 0);
    let heroes = world.alive_ids(Faction::Heroes);
    let mut policies = [TacticalArticulatedPolicy::default(),
                        TacticalArticulatedPolicy::default()];
    policies[0].reset(); policies[1].reset();
    let mut stream = Vec::new();
    let mut latest_policy = [None; 2];
    let mut latest_offered = [None; 2];
    let mut latest_stored = [None; 2];
    let mut decision_calls = [0u32; 2];
    let mut steps = 0u32;
    while world.outcome().is_none() && world.tick() < TACTICAL_COMPETENCE_TICKS {
        for id in world.pending_decisions().to_vec() {
            let side = usize::from(!heroes.contains(&id));
            let observation = world.observe_articulated(id);
            let command = policies[side].decide(&observation);
            decision_calls[side] += 1;
            latest_policy[side] = Some(policies[side].diagnostics());
            latest_offered[side] = Some(command);
            match world.submit_articulated_v1(id, command) {
                SubmitArticulatedOutcome::Stored { command, rejection } => {
                    assert!(rejection.is_none(), "Smart103 recorded zero command refusals");
                    stream.push(SubmittedCommandRecord { tick: world.tick(), entity: id,
                        command: SubmittedCommand::Articulated(command) });
                    latest_stored[side] = Some(command);
                }
                SubmitArticulatedOutcome::NotStored(rejection) =>
                    panic!("Smart103 command unexpectedly refused: {rejection:?}"),
            }
        }
        let tick_before = world.tick();
        let rejection_before = world.contact_solver_rejections();
        let _ = world.step();
        steps += 1;
        let rejection_after = world.contact_solver_rejections();
        if rejection_after > rejection_before {
            return Some(FirstCompetenceRejection {
                mirrored, tick_before, tick_after: world.tick(),
                rejection_before, rejection_after,
                exact: world.first_exact_contact_rejection(),
                pair: world.exact_scan_pair_rejection(),
                policy: latest_policy, offered: latest_offered, stored: latest_stored,
                decision_calls, steps,
                command_digest: script_digest(&stream), state: world.state_digest(),
            });
        }
    }
    None
}

#[cfg(feature = "cartesian-recoil")]
fn run_competence_rejection_provenance() {
    let canonical = first_competence_rejection(Scenario::articulated_duel(), false);
    let mirrored = first_competence_rejection(mirrored_articulated_duel(), true);
    for row in [canonical, mirrored] {
        match row {
            Some(row) => {
                println!("orientation={} tick={}->{} rejections={}->{}",
                    if row.mirrored { "mirrored" } else { "canonical" },
                    row.tick_before, row.tick_after, row.rejection_before, row.rejection_after);
                println!("exact={:?}", row.exact);
                println!("pair={:?}", row.pair);
                println!("policy={:?}", row.policy);
                println!("offered={:?}", row.offered);
                println!("stored={:?}", row.stored);
                println!("calls decisions={:?} steps={}", row.decision_calls, row.steps);
                println!("receipts command=0x{:016x} state={:?}/{}/0x{:016x}",
                    row.command_digest, row.state.domain, row.state.schema, row.state.value);
            }
            None => println!("orientation=no-rejection"),
        }
    }
}

#[cfg(feature = "cartesian-recoil")]
fn run_tactical_competence_gate() {
    let seeds = competence_seeds();
    let mut canonical_scenario = Scenario::articulated_duel();
    canonical_scenario.max_ticks = TACTICAL_COMPETENCE_TICKS;
    let mut mirrored_scenario = mirrored_articulated_duel();
    mirrored_scenario.max_ticks = TACTICAL_COMPETENCE_TICKS;

    let started = Instant::now();
    let canonical = articulated_trials(
        &canonical_scenario, &seeds, default_threads(), Script::Tactical);
    let mirrored = articulated_trials(
        &mirrored_scenario, &seeds, default_threads(), Script::Tactical);
    let elapsed = started.elapsed();
    let all: Vec<&ArticulatedTrial> = canonical.iter().chain(mirrored.iter()).collect();

    let canonical_body = canonical.iter().filter(|row| counts_as_body_decision(row.timed_out)).count();
    let mirrored_body = mirrored.iter().filter(|row| counts_as_body_decision(row.timed_out)).count();
    let body_decisions = canonical_body + mirrored_body;
    let mut outcomes = [0usize; 5];
    let mut contacts = 0u64;
    let mut kinds = [0u64; 3];
    let mut refused = 0u64;
    let mut solver_rejections = 0u64;
    let mut worst_decision_tick = 0u32;
    for row in all {
        let outcome = match row.outcome {
            Outcome::HeroesWin => 0,
            Outcome::MonstersWin => 1,
            Outcome::MutualDestruction => 2,
            Outcome::Decision(_) => 3,
            Outcome::Draw => 4,
        };
        outcomes[outcome] += 1;
        contacts += row.contacts;
        for kind in 0..kinds.len() {
            kinds[kind] += row.kinds[kind];
        }
        refused += row.rejected as u64;
        solver_rejections += row.solver_rejections as u64;
        if counts_as_body_decision(row.timed_out) {
            worst_decision_tick = worst_decision_tick.max(row.ticks);
        }
    }

    println!(
        "tactical competence: seeds 0..{} x 2 orientations = {} trials, tick cap {}, threshold {}/100",
        TACTICAL_COMPETENCE_SEEDS, canonical.len() + mirrored.len(),
        TACTICAL_COMPETENCE_TICKS, TACTICAL_COMPETENCE_THRESHOLD,
    );
    println!(
        "body decisions: {canonical_body}/50 canonical, {mirrored_body}/50 mirrored, {body_decisions}/100 total"
    );
    println!(
        "outcomes: {} fighter, {} brute, {} mutual, {} points, {} draw",
        outcomes[0], outcomes[1], outcomes[2], outcomes[3], outcomes[4],
    );
    println!(
        "contacts: {contacts} total, {} weapon/weapon, {} weapon/shield, {} weapon/body",
        kinds[ContactKind::WeaponWeapon as usize],
        kinds[ContactKind::WeaponShield as usize],
        kinds[ContactKind::WeaponBody as usize],
    );
    println!(
        "authority: worst body-decision tick {worst_decision_tick}, {refused} refused submissions, {solver_rejections} solver-rejected ticks"
    );
    println!(
        "command receipts: canonical 0x{:016x}, mirrored 0x{:016x}",
        competence_digest(&canonical), competence_digest(&mirrored),
    );
    println!("wall: {} ms", elapsed.as_millis());
    println!(
        "{}",
        if competence_passes(body_decisions, refused, solver_rejections) {
            "pass"
        } else {
            "revise"
        }
    );
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
    if args.flag("competence-rejection-provenance") {
        if let Some(key) = competence_override(args) {
            eprintln!("articulated --competence-rejection-provenance accepts no --{key} override");
            std::process::exit(2);
        }
        #[cfg(feature = "cartesian-recoil")]
        run_competence_rejection_provenance();
        #[cfg(not(feature = "cartesian-recoil"))]
        eprintln!("articulated --competence-rejection-provenance requires --features cartesian-recoil");
        return;
    }
    if args.flag("competence-gate") {
        if let Some(key) = competence_override(args) {
            eprintln!("articulated --competence-gate accepts no --{key} override");
            std::process::exit(2);
        }
        #[cfg(feature = "cartesian-recoil")]
        run_tactical_competence_gate();
        #[cfg(not(feature = "cartesian-recoil"))]
        eprintln!("articulated --competence-gate requires --features cartesian-recoil");
        return;
    }
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
    let mut kinds = [0u64; 3];
    let mut guard_pairs = [[0u64; 3]; 3];
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
        for kind in 0..kinds.len() {
            kinds[kind] += trial.kinds[kind];
        }
        for attack in 0..guard_pairs.len() {
            for guard in 0..guard_pairs[attack].len() {
                guard_pairs[attack][guard] += trial.guard_pairs[attack][guard];
            }
        }
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
        "blocked   {} weapon/shield ({:.2}% of resolutions), {} weapon/body, {} weapon/weapon",
        kinds[ContactKind::WeaponShield as usize],
        100.0 * kinds[ContactKind::WeaponShield as usize] as f64 / contacts.max(1) as f64,
        kinds[ContactKind::WeaponBody as usize],
        kinds[ContactKind::WeaponWeapon as usize],
    );
    let pairs: u64 = guard_pairs.iter().flatten().sum();
    let diagonal: u64 = (0..3).map(|i| guard_pairs[i][i]).sum();
    println!(
        "guard     attack x guard {:?}, diagonal {:.2}% of {pairs} commanded pairs",
        guard_pairs, 100.0 * diagonal as f64 / pairs.max(1) as f64,
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

// ------------------------------------------------------- the described duel

/// The two anatomies a fighter may wear, spelled as the command line spells
/// them.
const ANATOMIES: [(&str, AnatomyChoice); 2] = [
    ("fighter", AnatomyChoice::Fighter),
    ("brute", AnatomyChoice::Brute),
];

/// What may be in a hand. `empty` is a named choice rather than the absence of
/// the flag, because the absence of the flag means "whatever the shipped
/// arrangement had there" and a picker needs to be able to say "nothing".
const HAND_ITEMS: [(&str, Option<sim::ActionKind>); 4] = [
    ("sword", Some(sim::ActionKind::Sword)),
    ("shield", Some(sim::ActionKind::Shield)),
    ("club", Some(sim::ActionKind::Club)),
    ("empty", None),
];

/// Every key that turns `trace` from a run of the pinned fixture into a run of
/// a described duel.
///
/// **The list is the switch, and that is deliberate.** A `trace` invocation with
/// none of these has to produce the fixture and not a reconstruction of it, so
/// that the file it writes is byte-identical to the one the gate's own runs
/// wrote. Reconstructing would be *nearly* right -- `DuelConfigV1::shipped()`
/// builds the same table and the same unit rows -- and nearly right is the
/// failure mode that would be hardest to notice, because only the scenario name
/// and therefore the fingerprint would move.
const DUEL_KEYS: [&str; 14] = [
    "fighter-a", "a-left", "a-right",
    "a-shield-half-width", "a-shield-half-height", "a-weapon-length", "a-weapon-mass",
    "fighter-b", "b-left", "b-right",
    "b-shield-half-width", "b-shield-half-height", "b-weapon-length", "b-weapon-mass",
];

/// The described duel the flags add up to, `Ok(None)` if none of them was given,
/// or the sentence the run should be refused with.
///
/// Every value defaults to the one the shipped arrangement has in that place, so
/// a caller who moves one dimension has moved one dimension. The spawns and the
/// clock come from `DuelConfigV1::shipped()` unchanged: they are the fixture's,
/// which is what makes a configured fight comparable with the gate's.
///
/// **Two refusals, and both exist because the alternative is invisible.** A
/// picker key is a request, so a key that cannot be honoured has to stop the run
/// rather than be dropped from it; see the two blocks below for which mistake
/// each one catches. They are returned rather than printed-and-exited, unlike
/// [`Args::choice`]'s, so that
/// `a_picker_key_that_cannot_be_honoured_refuses_the_run` can name them --
/// a silent refusal path is exactly what these two are here to end.
fn duel_config_from(args: &Args) -> Result<Option<DuelConfigV1>, String> {
    // A picker key with no value is a refusal and never a default. `Args::parse`
    // demotes `--key` to a bare flag when the next token is missing or is
    // another `--key`, so `--a-weapon-length --seed 3` reaches `args.text` as
    // "not given" -- and what came out was a run of the *fixture*, printing and
    // recording the pinned fingerprint under a header the operator read as their
    // configuration. `--a-left --a-right club` is the same bug wearing a
    // disguise: the surviving half renames the scenario, so the file looks
    // configured and the vanished key leaves no trace anywhere.
    if let Some(key) = DUEL_KEYS.iter().find(|key| args.flag(key)) {
        return Err(format!("--{key} describes a duel and needs a value: it was given none"));
    }
    if !DUEL_KEYS.iter().any(|key| args.text(key).is_some()) {
        return Ok(None);
    }
    let mut config = DuelConfigV1::shipped();
    for (index, side) in ["a", "b"].into_iter().enumerate() {
        let fighter = &mut config.fighters[index];
        fighter.anatomy = args.choice(&format!("fighter-{side}"), fighter.anatomy, &ANATOMIES);
        for (hand, key) in ["left", "right"].into_iter().enumerate() {
            let held = args.choice(
                &format!("{side}-{key}"),
                fighter.hands[hand].map(|item| item.action),
                &HAND_ITEMS,
            );
            fighter.hands[hand] = held.map(|action| {
                sim::HandItemV1::shipped(action).expect("every hand item has a shipped row")
            });
        }
        let (mut weapons, mut plates) = (0, 0);
        for item in fighter.hands.iter_mut().flatten() {
            match &mut item.geometry {
                sim::EquipmentGeometry::Segment { length, .. } => {
                    weapons += 1;
                    *length = args.decimal(&format!("{side}-weapon-length"), *length);
                    item.mass = args.decimal(&format!("{side}-weapon-mass"), item.mass);
                }
                sim::EquipmentGeometry::Shield { half_width, half_height, .. } => {
                    plates += 1;
                    *half_width = args.decimal(&format!("{side}-shield-half-width"), *half_width);
                    *half_height = args.decimal(&format!("{side}-shield-half-height"), *half_height);
                }
            }
        }
        // A dimension aimed at an item the fighter is not holding edits nothing,
        // and the loop above cannot tell anyone: the key still counts as given,
        // so the scenario is still renamed and re-fingerprinted and the fight is
        // still the fixture's, tick for tick. `--b-shield-half-width 0.5` is the
        // reachable case -- the Brute carries a club -- and it is the same
        // failure `--policy duellist` would be, an afternoon spent comparing a
        // configuration against itself.
        for (suffix, carried, item) in [
            ("weapon-length", weapons, "a weapon"),
            ("weapon-mass", weapons, "a weapon"),
            ("shield-half-width", plates, "a shield"),
            ("shield-half-height", plates, "a shield"),
        ] {
            let key = format!("{side}-{suffix}");
            if carried == 0 && args.text(&key).is_some() {
                return Err(format!(
                    "--{key} names {item} fighter {side} is not carrying: \
                     put one in a hand with --{side}-left or --{side}-right, or drop the key"
                ));
            }
        }
    }
    Ok(Some(config))
}

/// Refuses a described duel in a sentence rather than in a variant name.
///
/// The four errors below are the ones a person can reach from the command line,
/// and each of them is a mistake somebody will make before a test does. The rest
/// are unreachable from here by construction -- ids are assigned, bindings come
/// from the hand, and the loadout is derived from the hands -- so they fall
/// through to the general sentence rather than being enumerated as if they were
/// live.
fn refuse_duel(error: sim::CombatSpecError) -> ! {
    let sentence = match error {
        sim::CombatSpecError::NoEquipment =>
            "a fighter with both hands empty has no rule to run: give it something in one of them",
        sim::CombatSpecError::GripConflict =>
            "those two items cannot be held at once -- two shields is the usual way to ask for it",
        sim::CombatSpecError::Dimension =>
            "a dimension is off the table's scale: lengths and half-extents in [0, 8], mass in (0, 8]",
        sim::CombatSpecError::UnknownAction =>
            "that action has no shipped equipment row, so there is no measured surface to give it",
        _ => "the described duel is not a valid construction",
    };
    eprintln!("{sentence} ({error:?})");
    std::process::exit(2);
}

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
    let mirrored = args.flag("mirrored");
    // The fixture unless a picker flag was given, and then the fixture's own
    // arrangement under a different name. `duel_config_from` returning `None` is
    // what keeps the untouched command byte-identical to what it wrote before
    // this session.
    let described = duel_config_from(args).unwrap_or_else(|sentence| {
        eprintln!("{sentence}");
        std::process::exit(2);
    });
    let scenario = match described {
        None if mirrored => mirrored_articulated_duel(),
        None => Scenario::articulated_duel(),
        Some(config) => {
            let mut scenario = Scenario::duel_from(&config).unwrap_or_else(|e| refuse_duel(e));
            if mirrored {
                mirror_spawns(&mut scenario);
            }
            scenario
        }
    };
    // The whole fight unless asked otherwise. A `u32::MAX` default rather than
    // `max_ticks` so that a fixture whose limit grows keeps recording all of it.
    let limit = args.u32("ticks", u32::MAX);
    let path = args
        .text("out")
        .unwrap_or("web/fight.json")
        .to_string();

    // **`learned` is a fourth arm of `--policy` and not a flag beside it**, for
    // the reason `script_from` gives about `--attack-moves`: the four are one
    // choice of what drives the Fighter, and a flag would let
    // `--policy windmill --checkpoint x` look like a thing it is not.
    let learned = args.text("policy") == Some("learned");
    let (mut hero_policy, mut monster_policy, hero_token, monster_token, digest, headline);
    if learned {
        let checkpoint = learn_probe::load_checkpoint(args);
        let opponent = learn_probe::opponent_from(args);
        hero_policy = Box::new(learn::LearnedArticulatedPolicy::new(checkpoint.model.clone()))
            as Box<dyn ArticulatedPolicy>;
        monster_policy = opponent.policy_for(seed);
        hero_token = "learned".to_string();
        monster_token = opponent.label().to_string();
        headline = format!(
            "the learned policy against {}",
            learn_probe::opponent_prose(opponent)
        );
        digest = Some(checkpoint.digest());
    } else {
        let script = script_from(args);
        hero_policy = script.policy();
        monster_policy = script.policy();
        hero_token = script.token().to_string();
        monster_token = script.token().to_string();
        headline = script.name().to_string();
        digest = None;
    }

    let mut recorder = FightTrace::new(&scenario, limit);
    let started = Instant::now();
    let trial = measure_articulated_matchup(
        &scenario,
        seed,
        hero_policy.as_mut(),
        monster_policy.as_mut(),
        Some(&mut recorder),
    );
    let json = recorder.finish(&TraceRun {
        scenario: &scenario,
        seed,
        heroes: &hero_token,
        monsters: &monster_token,
        checkpoint: digest.as_deref(),
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
        "seed {seed} of {} under {headline} -- {} tick{}, {}",
        scenario.name,
        trial.ticks,
        if trial.ticks == 1 { "" } else { "s" },
        if trial.timed_out { "the clock decided it" } else { "a body decided it" },
    );
    // **The configuration, named.** A described fight is only reproducible if
    // the recording says which duel it was, and the fingerprint is the one thing
    // that covers the whole table -- both anatomies, every equipment row, every
    // binding and both placements. Printed for the fixture too, where it is the
    // pin, so the two are read the same way. A mirrored run prints the reflected
    // scenario's own number, which is deliberately not the pin, and the JSON
    // header now writes the same number this line does: two channels reporting
    // the same fight disagreeing about its identity is how an operator ends up
    // trusting the wrong one.
    println!("  arena fingerprint {:#018x}", scenario.fingerprint());
    if let Some(digest) = digest.as_deref() {
        println!("  checkpoint {digest}");
    }
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
    println!("  npm run view, then open http://localhost:5173/#/arena");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(feature = "cartesian-recoil")]
    #[derive(Clone, PartialEq, Eq, Debug)]
    struct Smart116ControlReceipt {
        mirrored: bool,
        attempts: u32,
        stored: u32,
        decisions: [u32; 2],
        steps: u32,
        final_tick: u32,
        solver_rejections: u32,
        exact: Option<sim::ExactContactRejectionDiagnostic>,
        pair: Option<sim::ExactScanPairRejectionDiagnostic>,
        command_digest: u64,
        state_domain: sim::HashDomain,
        state_schema: u16,
        state_value: u64,
    }

    #[cfg(feature = "cartesian-recoil")]
    fn smart116_control(mut scenario: Scenario, mirrored: bool) -> Smart116ControlReceipt {
        // These are the two retired Smart103/106 refusal boundaries, not a
        // competence run. Canonical has a separately owned later solver
        // refusal, so extending this receipt to 1,800 would conflate laws.
        let limit = if mirrored { 111 } else { 211 };
        scenario.max_ticks = limit;
        let mut world = World::new(&scenario, 0);
        let heroes = world.alive_ids(Faction::Heroes);
        let mut policies = [TacticalArticulatedPolicy::default(),
                            TacticalArticulatedPolicy::default()];
        policies[0].reset(); policies[1].reset();
        let mut stream = Vec::new();
        let mut attempts = 0u32; let mut stored = 0u32;
        let mut decisions = [0u32; 2]; let mut steps = 0u32;
        while world.outcome().is_none() && world.tick() < limit {
            for id in world.pending_decisions().to_vec() {
                let side = usize::from(!heroes.contains(&id));
                let command = policies[side].decide(&world.observe_articulated(id));
                attempts += 1; decisions[side] += 1;
                match world.submit_articulated_v1(id, command) {
                    SubmitArticulatedOutcome::Stored { command: accepted, rejection } => {
                        assert!(rejection.is_none());
                        assert_eq!(accepted, command);
                        stored += 1;
                        stream.push(SubmittedCommandRecord { tick: world.tick(), entity: id,
                            command: SubmittedCommand::Articulated(accepted) });
                    }
                    SubmitArticulatedOutcome::NotStored(rejection) =>
                        panic!("Smart116 command unexpectedly refused: {rejection:?}"),
                }
            }
            let _ = world.step(); steps += 1;
        }
        let state = world.state_digest();
        Smart116ControlReceipt {
            mirrored, attempts, stored, decisions, steps, final_tick: world.tick(),
            solver_rejections: world.contact_solver_rejections(),
            exact: world.first_exact_contact_rejection(),
            pair: world.exact_scan_pair_rejection(),
            command_digest: script_digest(&stream),
            state_domain: state.domain, state_schema: state.schema, state_value: state.value,
        }
    }

    #[cfg(feature = "cartesian-recoil")]
    fn smart116_serial_controls() -> &'static [Smart116ControlReceipt; 2] {
        static ROWS: std::sync::OnceLock<[Smart116ControlReceipt; 2]> =
            std::sync::OnceLock::new();
        ROWS.get_or_init(|| [
            smart116_control(Scenario::articulated_duel(), false),
            smart116_control(mirrored_articulated_duel(), true),
        ])
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn old_smart103_and_smart106_boundaries_now_complete_without_refusal_or_diagnostics() {
        let rows = smart116_serial_controls();
        assert_eq!((rows[0].steps, rows[1].steps), (211, 111));
        assert!(rows.iter().all(|row| row.solver_rejections == 0
            && row.exact.is_none() && row.pair.is_none()));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn tactical_control_submits_every_command_and_steps_each_tick_once() {
        for row in smart116_serial_controls() {
            assert_eq!(row.attempts, row.stored);
            assert_eq!(row.attempts, row.decisions[0] + row.decisions[1]);
            assert_eq!(row.steps, row.final_tick);
            assert!(row.command_digest != 0 && row.state_value != 0);
        }
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn tactical_control_receipts_ignore_thread_completion_order() {
        let canonical = std::thread::spawn(||
            smart116_control(Scenario::articulated_duel(), false));
        let mirrored = std::thread::spawn(||
            smart116_control(mirrored_articulated_duel(), true));
        assert_eq!([canonical.join().unwrap(), mirrored.join().unwrap()],
                   *smart116_serial_controls());
    }

    #[test]
    fn tactical_competence_is_exactly_fifty_mirrored_seed_pairs() {
        let seeds = competence_seeds();
        assert_eq!(seeds.len(), 50);
        assert_eq!((seeds.first(), seeds.last()), (Some(&0), Some(&49)));
        assert_eq!(seeds.len() * 2, 100);
        assert_eq!(TACTICAL_COMPETENCE_TICKS, 1_800);
    }

    #[test]
    fn a_points_decision_at_tick_1800_does_not_count_as_a_body_decision() {
        // `measure_articulated_matchup` records this bit before `World::timeout`
        // turns the score into `Outcome::Decision`; the outcome name therefore
        // cannot accidentally make a clock decision count as a body decision.
        assert!(!counts_as_body_decision(true));
        assert!(counts_as_body_decision(false));
        assert_eq!(TACTICAL_COMPETENCE_TICKS, 1_800);
    }

    #[test]
    fn competence_gate_refuses_every_measurement_changing_override() {
        for (key, value) in [
            ("seed", Some("3")), ("seeds", Some("50")),
            ("ticks", Some("1800")), ("policy", Some("tactical")),
            ("opponent", Some("brute")), ("attack-moves", None),
            ("threshold", Some("95")), ("mirrored", None),
            ("threads", Some("1")), ("seed-zero-only", None),
        ] {
            let mut tokens = vec!["articulated".to_string(), "--competence-gate".to_string(),
                                  format!("--{key}")];
            if let Some(value) = value {
                tokens.push(value.to_string());
            }
            let args = Args::parse(tokens);
            assert_eq!(competence_override(&args), Some(key), "--{key}");
        }
        let gate = Args::parse(vec!["articulated".into(), "--competence-gate".into()]);
        assert_eq!(competence_override(&gate), None);
    }

    #[test]
    fn competence_gate_threshold_is_95_of_100_and_cannot_round_down() {
        assert!(!competence_passes(94, 0, 0));
        assert!(competence_passes(95, 0, 0));
        assert!(competence_passes(100, 0, 0));
        assert!(!competence_passes(100, 1, 0));
        assert!(!competence_passes(100, 0, 1));
        assert_eq!(TACTICAL_COMPETENCE_THRESHOLD, 95);
    }

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
            scenario: &scenario, seed: 3, heroes: Script::Composed.token(),
            monsters: Script::Composed.token(), checkpoint: None, mirrored: false,
            outcome: traced.outcome, timed_out: traced.timed_out, ticks: traced.ticks,
        });
        assert!(json.contains(&format!("\"frameCount\":{}", plain.ticks + 1)), "frame count");
        assert!(json.contains("\"truncated\":false"), "an unbounded recording is not truncated");
        assert!(json.contains(&format!("\"schema\":\"{}\"", trace::TRACE_SCHEMA)), "schema");
    }

    fn traced_args(line: &str) -> Args {
        Args::parse(line.split_whitespace().map(String::from).collect())
    }

    #[test]
    fn a_trace_with_no_picker_flag_runs_the_pinned_fixture_and_not_a_copy_of_it() {
        // The switch that keeps `a_traced_run_is_the_run_the_gate_measured`
        // true. `DuelConfigV1::shipped()` builds the fixture's table and the
        // fixture's unit rows, so a `trace` that always went through the builder
        // would run the same *fight* under a different scenario name -- and the
        // only visible difference would be the fingerprint in a header nobody
        // reads twice.
        assert_eq!(duel_config_from(&traced_args("trace --seed 3 --mirrored")), Ok(None));
        assert_eq!(duel_config_from(&traced_args("trace --policy windmill --ticks 60")), Ok(None));
        for key in DUEL_KEYS {
            // A dimension key names an item, so the line has to put that item in
            // a hand as well: `--b-shield-half-width` alone is a refusal now and
            // a test that only asked "did this reach the picker" would read the
            // refusal as an answer.
            let line = match key {
                _ if key.starts_with("fighter-") => format!("trace --{key} brute"),
                _ if key.ends_with("-left") || key.ends_with("-right") => {
                    format!("trace --{key} club")
                }
                _ if key.contains("shield") => {
                    let side = &key[..1];
                    format!("trace --{side}-left shield --{key} 0.3")
                }
                _ => {
                    let side = &key[..1];
                    format!("trace --{side}-left sword --{key} 0.3")
                }
            };
            assert!(
                matches!(duel_config_from(&traced_args(&line)), Ok(Some(_))),
                "--{key} did not reach the picker"
            );
        }
    }

    #[test]
    fn a_picker_key_that_cannot_be_honoured_refuses_the_run() {
        // Both halves of "nearly right is the hardest failure to notice", as
        // commands rather than as prose.
        //
        // A key with no value: `Args::parse` demotes it to a bare flag, so it
        // used to arrive as "not given" -- and `--a-weapon-length --seed 3` ran
        // the *fixture* and printed the pin's own fingerprint over a header the
        // operator read as their configuration. `--a-left --a-right club` is the
        // partial form, and it was worse: the surviving key renamed the scenario
        // so the output looked configured.
        for line in ["trace --a-weapon-length --seed 3", "trace --a-left --a-right club"] {
            let refusal = duel_config_from(&traced_args(line)).expect_err(line);
            assert!(refusal.starts_with("--a-"), "the refusal must name the key: {refusal}");
            assert!(refusal.contains("needs a value"), "{refusal}");
        }

        // A well-formed value aimed at an item the fighter is not holding. The
        // Brute carries a club, so `--b-shield-half-width` can only ever have
        // edited nothing -- while still renaming and re-fingerprinting the
        // scenario, which is how it read as a configuration that had been
        // applied.
        let refusal = duel_config_from(&traced_args("trace --b-shield-half-width 0.5"))
            .expect_err("a plate the Brute is not carrying");
        assert!(refusal.contains("--b-shield-half-width"), "{refusal}");
        assert!(refusal.contains("not carrying"), "{refusal}");
        // The Fighter has no segment item once its sword is put down, so the
        // same rule catches a weapon key too, and it is the arrangement the line
        // itself asks for that decides -- not the shipped one.
        assert!(duel_config_from(&traced_args("trace --a-right empty --a-weapon-length 1.5")).is_err());
        // And the cure is to hand the fighter the item the key names.
        assert!(matches!(
            duel_config_from(&traced_args("trace --b-left shield --b-shield-half-width 0.5")),
            Ok(Some(_))
        ));
    }

    #[test]
    fn a_recorded_configuration_names_itself_in_the_file_and_not_only_on_stdout() {
        // The header is the only part of a trace that outlives the terminal it
        // was printed in, and `--mirrored` used to write `null` there for every
        // run -- which was defensible while the only two scenarios a trace could
        // record were the fixture and its reflection, and false the moment a
        // configuration could be one of unboundedly many.
        let config = duel_config_from(&traced_args("trace --a-weapon-length 1.5"))
            .expect("a legal line")
            .expect("a described duel");
        let mut scenario = Scenario::duel_from(&config).expect("a legal duel");
        mirror_spawns(&mut scenario);
        let mut recorder = FightTrace::new(&scenario, 1);
        let trial = measure_articulated_traced(&scenario, 3, Script::Composed, Some(&mut recorder));
        let json = recorder.finish(&TraceRun {
            scenario: &scenario, seed: 3, heroes: Script::Composed.token(),
            monsters: Script::Composed.token(), checkpoint: None, mirrored: true,
            outcome: trial.outcome, timed_out: trial.timed_out, ticks: trial.ticks,
        });
        assert!(
            json.contains(&format!("\"fingerprint\":\"{:#018x}\"", scenario.fingerprint())),
            "a mirrored configured run did not name its own scenario"
        );
        assert!(json.contains("\"mirrored\":true"), "the reflection is still declared");
        // The field is still `string | null` as far as `client/src/fight/trace.ts`
        // is concerned -- a string where a nullable string was expected needs no
        // reader change and no `TRACE_SCHEMA` bump.
        assert!(!json.contains("\"fingerprint\":null"));
    }

    #[test]
    fn a_described_duel_that_moved_nothing_is_the_fixture_fight() {
        // The claim the whole picker rests on: describing the shipped
        // arrangement and running it produces the fight the gate measures, tick
        // for tick and digest for digest. If it ever stops being true, either
        // the builder's id order drifted or a shipped row was edited -- and
        // either way a configured fight has stopped being comparable with the
        // corpus it is meant to be read against.
        let described = Scenario::duel_from(&DuelConfigV1::shipped()).expect("the shipped pair");
        let fixture = Scenario::articulated_duel();
        assert_ne!(described.fingerprint(), fixture.fingerprint(), "a runtime duel wore the pin");

        let a = measure_articulated(&described, 3, Script::Composed);
        let b = measure_articulated(&fixture, 3, Script::Composed);
        assert_eq!(a.state.compare(b.state), Ok(true));
        assert_eq!((a.ticks, a.outcome, a.contacts, a.severances), (b.ticks, b.outcome, b.contacts, b.severances));
        assert_eq!(a.digest, b.digest);
    }

    #[test]
    fn a_dimension_flag_reaches_the_row_it_names_and_no_other() {
        // A decimal on the command line has to arrive in the table as the exact
        // ratio, and it has to arrive in one row: the flag names a side, so the
        // other fighter's plate must be untouched. Both halves have been got
        // wrong by a picker before.
        let config = duel_config_from(&traced_args(
            "trace --a-shield-half-width 0.35 --b-weapon-length 1.75 --b-weapon-mass 3.5",
        )).expect("a legal line").expect("a described duel");
        let scenario = Scenario::duel_from(&config).expect("a legal duel");
        let table = scenario.combat_specs.as_ref().expect("a table");
        let plate = table.equipment.iter().find(|row| row.action == sim::ActionKind::Shield)
            .expect("the Fighter still carries a plate");
        assert_eq!(plate.geometry, sim::EquipmentGeometry::Shield {
            half_width: Fx::from_ratio(7, 20),
            half_height: Fx::from_ratio(1, 4),
            thickness: Fx::from_ratio(1, 20),
        }, "half_height moved with half_width");
        let club = table.equipment.iter().find(|row| row.action == sim::ActionKind::Club)
            .expect("the Brute still carries a club");
        assert_eq!(club.geometry, sim::EquipmentGeometry::Segment {
            length: Fx::from_ratio(7, 4), radius: Fx::from_ratio(3, 50),
        });
        assert_eq!(club.mass, Fx::from_ratio(7, 2));
        // The Fighter's blade is a segment too and lives on the other side of
        // the `--b-` prefix, so it must still be the shipped 19/20.
        let blade = table.equipment.iter().find(|row| row.action == sim::ActionKind::Sword)
            .expect("the Fighter still carries a sword");
        assert_eq!(blade.geometry, sim::EquipmentGeometry::Segment {
            length: Fx::from_ratio(19, 20), radius: Fx::from_ratio(1, 25),
        }, "a --b- key crossed the aisle");
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
            scenario: &scenario, seed: 3, heroes: Script::Composed.token(),
            monsters: Script::Composed.token(), checkpoint: None, mirrored: false,
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

    #[cfg(not(feature = "cartesian-recoil"))]
    #[test]
    fn zero_created_energy_excess_and_intentional_refusals_are_separate_evidence() {
        // **The correction this command exists to record, and it is not
        // hypothetical.** `max_energy_excess` is computed over published rows;
        // a group that creates energy is precisely a group whose rows
        // `World::resolve_contact` deletes before anyone can publish them. So
        // the field cannot report anything but zero, and until this test was
        // written that zero was on its way into a committed evidence artifact
        // as proof of soundness. The rejection cause is therefore pinned beside
        // it instead of treating every refusal as evidence of created energy.
        //
        // Written first as `solver_rejections > 0`, because that was the state
        // of the tree: the fixture refused roughly two hundred of its 3,600
        // ticks under every script, always `ResolutionError::Projector`, the
        // `after > before` arm. Checkpoint B found the cause -- `project`
        // re-derived every equipment row through the joint's inexact inverse
        // map at every alpha including zero, and the drift read as created
        // energy -- and this assertion is its gate, inverted rather than
        // deleted so that the direction it was inverted from stays on the
        // record. Smart102 then separated that law from the windmill's one
        // intentional `EnergyNumerator` refusal: its two-contact group loses one
        // raw unit while both allocation weights are zero, so refusing is the
        // only honest result. Composed and closing do not reach that boundary.
        for script in [Script::Composed, Script::Windmill, Script::ClosingAttacks] {
            let trial = measure_articulated(&Scenario::articulated_duel(), 5, script);
            assert!(trial.contacts > 0, "{}: nothing touched", script.name());
            assert_eq!(trial.max_energy_excess, 0, "{}", script.name());
            let expected = match script {
                Script::Windmill => (1, Some(sim::ResolutionError::EnergyNumerator)),
                Script::Composed | Script::ClosingAttacks => (0, None),
                Script::Tactical => unreachable!("the tactical script is not this control"),
            };
            assert_eq!(
                (trial.solver_rejections, trial.first_rejection), expected,
                "{}: the refusal count and its law changed independently",
                script.name()
            );
        }
    }
}
