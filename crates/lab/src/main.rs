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
    run, script_digest, ArmRoles, ArticulatedPolicy, ClosingAttackControlPolicy,
    EmbodiedPolicy, EmbodiedPolicyKind, OpeningsArticulatedPolicy, PolicyKind,
    RunConfig, RunResult, ScriptedArticulatedPolicy, TacticalArticulatedPolicy,
    WindmillArticulatedPolicy,
};
use sim::{
    AnatomyChoice, Body, CombatHeight, ContactKind, DuelConfigV1, EntityId, Faction, Intent,
    Outcome, Replay, Scenario, StateDigest, SubmitArticulatedOutcome, SubmitEmbodiedOutcome,
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
        "embodied" => embodied(&args),
        "strike-corpus" => strike_corpus::strike_corpus(&args),
        "strong-strike" => strong_strike::strong_strike(),
        "tactical-mechanics" => {
            if tactical_mechanics::ordinal_31_tick_46_segment_hilt_start_x_requested(&args) {
                if let Err(error) = tactical_mechanics::ordinal_31_tick_46_segment_hilt_start_x_mode(&args) {
                    eprintln!("{error}");
                    std::process::exit(2);
                }
            } else if tactical_mechanics::ordinal_31_tick_46_pair_aabb_requested(&args) {
                if let Err(error) = tactical_mechanics::ordinal_31_tick_46_pair_aabb_mode(&args) {
                    eprintln!("{error}");
                    std::process::exit(2);
                }
            } else if tactical_mechanics::ordinal_31_tick_46_scan_requested(&args) {
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
          --embodied --slope --policy neutral|scripted|scripted-level
          Replays every run and checks it reproduces bit-exactly. This is the
          guarantee the whole architecture rests on. --verbose prints every
          seed's hash, which is what you diff against another platform.
          Without --embodied it drives the Legacy skirmish, which is the only
          model this command has ever spoken. **Run, re-run and replay agreement
          is a property of the codec and not of a body model**, so --embodied
          makes the identical claim over `embodied-duel-v1` -- and --slope over
          the sculpted fixture, whose floor is the one thing no other replay
          corpus in this repository has ever carried into a state hash.

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

  embodied --seeds N --threads N --mirrored --seed-zero-only --slope
           --policy neutral|scripted|scripted-level
           --hero-policy P --monster-policy P
           --corpus-digest --high-ground
          `articulated`'s sibling under the embodied model, reporting the same
          fixed labels so the two corpora read side by side. It runs
          `embodied-duel-v1` unless --slope names the sculpted fixture, and
          --mirrored adds the reflection across y=8 for the same reason it does
          there: one orientation measures the spawn as well as the policy.
          --corpus-digest is the frozen pin corpus and refuses every override
          that would change what it measures; the number it prints is the one
          `docs/reference/hashes.md` registers.
          --high-ground is the elevation measurement: the embodied script
          against itself with the high-ground term switched off on one side,
          on the sculpted fixture, over both orientations and both side
          assignments. It refuses overrides for the same reason.

  strike-corpus --policy neutral|striker --seeds N --mirrored
          Runs nine fixed approach offsets against stationary Fighter and
          Brute targets and writes one CSV evidence row per case. A geometric
          cross is the committed weapon sweep through the region the policy
          named; contact and wound columns are recorded independently.

  strong-strike
          Drives one controlled maximum-effort tip-of-sword hit and a held-arm
          control through the production World, printing raw pose kinematics,
          contact energy channels and before/after anatomy facts.

  tactical-mechanics --quick|--calibration|--held-out|--strike-corpus|--anatomical-mirror-corpus|--noise-free-mirror-corpus|--mirror-trace-1536|--ordinal-31-provenance|--ordinal-31-tick-46-scan|--ordinal-31-tick-46-pair-aabb|--ordinal-31-tick-46-segment-hilt-start-x
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
          --ordinal-31-tick-46-pair-aabb --write PATH runs the fixed Smart132
          reference/held/reference tick-46 exact swept-pair-AABB transcript.
          --ordinal-31-tick-46-segment-hilt-start-x --write PATH runs the fixed
          Smart133 reference/held/reference point-X operand transcript.

  trace   --seed N --policy composed|windmill|tactical|learned --attack-moves --mirrored
          --ticks N --out PATH
          --checkpoint PATH --opponent P --phase-random   (--policy learned only)
          --fighter-a fighter|brute            --fighter-b fighter|brute
          --a-left  sword|shield|club|empty    --a-right ...  (and the b twins)
          --a-two-handed on|off                (and the b twin; needs a full
          right hand and an empty left one)
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
    // **The claim is about the codec, so it outlives the model it was written
    // against.** This command has only ever driven `Scenario::skirmish` through
    // a Legacy policy, and the session that retires the Legacy model retires the
    // measurement with it -- taking with it the only thing in the repository
    // that says run, re-run and replay agree *over seeds* rather than at one.
    // `crates/sim/tests/determinism.rs` holds the embodied property at a single
    // seed on each fixture; this arm is the broader claim, and it exists so that
    // the broader claim is not the one that gets deleted.
    if args.flag("embodied") {
        return verify_embodied(args);
    }
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

/// Run, re-run and replay agreement over seeds, under the embodied model.
///
/// **The reason this exists is that the property is the codec's and the command
/// that holds it is Legacy's.** `crates/sim/tests/determinism.rs` already drives
/// both embodied fixtures through run, re-run and replay, including at every
/// intermediate tick -- at *one* seed each, with a hand-written script. The
/// claim `lab verify` makes is the broader one: over a range of seeds, driven by
/// the policy a corpus is actually measured with, whose commands are a function
/// of the observation and therefore reach parts of the command space no
/// hand-written script visits on purpose. That is the claim session 10 would
/// otherwise delete along with the model it happens to be written against.
///
/// Fanned out across threads where the Legacy arm is serial, and the reason is
/// arithmetic rather than taste: an embodied fixture runs to 3,600 ticks with
/// two articulated bodies in contact, so 200 seeds is 600 fights and a serial
/// pass takes minutes. The fan-out is `articulated_trials`' own -- index-ordered
/// slots, so no chunk boundary can reorder what is reported, which is the
/// property `results_do_not_depend_on_the_thread_that_computed_them` holds.
fn verify_embodied(args: &Args) {
    let count = args.u32("seeds", 50) as u64;
    let threads = args.usize("threads", default_threads());
    let scenario = embodied_fixture(args);
    let matchup = embodied_matchup_from(args).unwrap_or_else(|sentence| {
        eprintln!("{sentence}");
        std::process::exit(2);
    });
    let verbose = args.flag("verbose");

    println!(
        "{count} embodied runs of {} (0x{:016x}) under {}",
        scenario.name,
        scenario.fingerprint(),
        matchup.name()
    );

    let seeds: Vec<u64> = (0..count).collect();
    let mut slots: Vec<Option<Result<(u32, Outcome, StateDigest), String>>> =
        vec![None; seeds.len()];
    if !seeds.is_empty() {
        let chunk = seeds.len().div_ceil(threads.max(1)).max(1);
        std::thread::scope(|scope| {
            for (chunk_seeds, out) in seeds.chunks(chunk).zip(slots.chunks_mut(chunk)) {
                let scenario = &scenario;
                scope.spawn(move || {
                    for (i, &seed) in chunk_seeds.iter().enumerate() {
                        out[i] = Some(verify_one_embodied(scenario, seed, matchup, None));
                    }
                });
            }
        });
    }

    let mut failures = 0;
    for (seed, slot) in slots.into_iter().enumerate() {
        match slot.expect("every seed should have produced a verdict") {
            Ok((ticks, outcome, state)) => {
                if verbose {
                    println!(
                        "seed {seed:<5} {:?}/{} 0x{:016x}  {ticks:>5} ticks  {outcome:?}",
                        state.domain, state.schema, state.value
                    );
                }
            }
            Err(sentence) => {
                println!("seed {seed}: {sentence}");
                failures += 1;
            }
        }
    }

    if failures == 0 {
        println!("{count} embodied runs verified: identical on re-run and exact on replay");
    } else {
        eprintln!("{failures}/{count} embodied runs failed verification");
        std::process::exit(1);
    }
}

/// One seed's three passes, as a verdict a thread can hand back.
///
/// The failing sentences are the Legacy arm's, said about an embodied digest:
/// a re-run that disagrees, a replay that diverges. The third one has no Legacy
/// counterpart -- `Replay::is_intact` recomputes the scenario fingerprint, and a
/// recording that could not name the fixture it came from is not a replay of it.
/// `limit` is [`measure_embodied_matchup`]'s own tick bound and the command line
/// always passes `None`. It is a parameter so that
/// `an_embodied_run_is_identical_on_re_run_and_exact_on_replay` can assert
/// against *this* function rather than against a copy of its three comparisons:
/// a fixture fight is 3,600 ticks and a debug build cannot afford three of them,
/// and a test that re-derived the comparisons here would be reading the thing it
/// is supposed to be checking.
fn verify_one_embodied(
    scenario: &Scenario,
    seed: u64,
    matchup: EmbodiedMatchup,
    limit: Option<u32>,
) -> Result<(u32, Outcome, StateDigest), String> {
    let mut replay = Replay::new(scenario, seed);
    let mut heroes = matchup.heroes.build();
    let mut monsters = matchup.monsters.build();
    let first = measure_embodied_matchup(
        scenario,
        seed,
        heroes.as_mut(),
        monsters.as_mut(),
        limit,
        Some(&mut replay),
        None,
    );
    let again = measure_embodied(scenario, seed, matchup, limit);

    // Through `compare` rather than `==`, because `StateDigest` has no
    // `PartialEq` on purpose: a domain or a schema mismatch is an error and not
    // a `false`. On this path a mismatch would mean one of the two runs was not
    // the embodied model at all, which is worth a different sentence.
    match first.state.compare(again.state) {
        Ok(true) => {}
        Ok(false) => {
            return Err(format!(
                "re-running the same inputs gave a different result \
                 (0x{:016x} then 0x{:016x})",
                first.state.value, again.state.value
            ))
        }
        Err(error) => return Err(format!("the two runs are not the same grammar: {error:?}")),
    }
    if first.digest != again.digest {
        return Err(format!(
            "re-running the same inputs submitted a different command stream \
             (0x{:016x} then 0x{:016x})",
            first.digest, again.digest
        ));
    }
    if !replay.is_intact() {
        return Err("the recording does not name the scenario it was taken from".to_string());
    }
    let played = replay.play().state_digest();
    match played.compare(first.state) {
        Ok(true) => Ok((first.ticks, first.outcome, first.state)),
        Ok(false) => Err(format!(
            "replay diverged (live 0x{:016x}, replay 0x{:016x})",
            first.state.value, played.value
        )),
        Err(error) => Err(format!("the replay is not the same grammar: {error:?}")),
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
    Openings,
}

impl Script {
    /// A fresh instance per faction, which is what the fixture asks for.
    fn policy(self) -> Box<dyn ArticulatedPolicy> {
        match self {
            Script::Composed => Box::new(ScriptedArticulatedPolicy),
            Script::Windmill => Box::new(WindmillArticulatedPolicy),
            Script::ClosingAttacks => Box::new(ClosingAttackControlPolicy),
            Script::Tactical => Box::new(TacticalArticulatedPolicy::default()),
            Script::Openings => Box::new(OpeningsArticulatedPolicy::default()),
        }
    }

    fn name(self) -> &'static str {
        match self {
            Script::Composed => "the composed script",
            Script::Windmill => "the windmill control",
            Script::ClosingAttacks => "the composed script with closing attacks (control)",
            Script::Tactical => "the tactical policy",
            Script::Openings => "the openings policy",
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
            Script::Openings => "openings",
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
            ("openings", Script::Openings),
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
        Script::Openings if args.flag("attack-moves") => {
            eprintln!("--attack-moves edits the composed script; openings decides its own feet");
            std::process::exit(2);
        }
        chosen => chosen,
    }
}

/// The two asymmetric keys, spelled once.
///
/// Separate from [`DUEL_KEYS`] because they describe *who is driving* rather than
/// what is being driven: a matchup is legal over the pinned fixture, which no
/// duel key is.
const MATCHUP_KEYS: [&str; 2] = ["hero-policy", "monster-policy"];

/// The script vocabulary the asymmetric keys accept, which is
/// [`Script::token`]'s own list rather than `--policy`'s.
///
/// `--policy` cannot spell `attack-moves` -- it is reached by `--attack-moves`
/// editing the composed script, because for that flag the two really are one
/// choice. Here they are not: a matchup names a driver per side, and a side
/// wanting the closing-attack control has no second flag to reach it with.
const MATCHUP_SCRIPTS: [(&str, Script); 5] = [
    ("composed", Script::Composed),
    ("windmill", Script::Windmill),
    ("attack-moves", Script::ClosingAttacks),
    ("tactical", Script::Tactical),
    ("openings", Script::Openings),
];

/// Which script drives each side.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct Matchup {
    heroes: Script,
    monsters: Script,
}

/// A bare script *is* the symmetric matchup, so every caller that always ran one
/// control on both sides keeps saying so in one word.
impl From<Script> for Matchup {
    fn from(script: Script) -> Matchup {
        Matchup::symmetric(script)
    }
}

impl Matchup {
    /// One script on both sides, which is what every symmetric corpus is.
    fn symmetric(script: Script) -> Matchup {
        Matchup { heroes: script, monsters: script }
    }

    fn is_symmetric(self) -> bool {
        self.heroes == self.monsters
    }

    /// The headline, which says "x" once when both sides are the same and
    /// "x against y" when they are not -- so that a symmetric run's output is
    /// unchanged from before this existed and a reader never has to notice the
    /// feature to read the old corpus.
    fn name(self) -> String {
        if self.is_symmetric() {
            self.heroes.name().to_string()
        } else {
            format!("{} against {}", self.heroes.name(), self.monsters.name())
        }
    }
}

/// The matchup the flags add up to, or the sentence the run should be refused
/// with.
///
/// **Returned rather than printed-and-exited**, on exactly the discipline
/// [`duel_config_from`] states: a key that cannot be honoured has to stop the run
/// rather than be dropped from it, and a test can only assert a refusal it can
/// hold. `an_asymmetric_matchup_runs_a_different_policy_on_each_side` and
/// `a_valueless_matchup_key_is_refused_rather_than_running_one_script_on_both`
/// are what hold these.
///
/// The two refusals every matchup reader owes, spelled once.
///
/// **Shared rather than copied because both of them are traps and not rules.** A
/// second reader that re-derived them would be a second chance to get one
/// subtly wrong, and the failure mode of getting one wrong is silence: a
/// symmetric corpus wearing an asymmetric header. Nothing here reads the script
/// vocabulary, which is what makes it usable by a reader whose vocabulary is a
/// different model's.
fn matchup_key_refusal(args: &Args) -> Option<String> {
    // The `Args::parse` trap `duel_config_from` documents at length, and it bites
    // harder here: a demoted `--hero-policy` leaves a *symmetric* run wearing the
    // header of an asymmetric one, which is the corpus silently answering a
    // different question than the operator asked.
    if let Some(key) = MATCHUP_KEYS.iter().find(|key| args.flag(key)) {
        return Some(format!(
            "--{key} names the script driving one side and needs a value: it was given none"
        ));
    }
    // `--matchup a:b` is the spelling the plan that asked for this feature
    // offered as an alternative, and `Args` drops a key it does not know rather
    // than complaining. Dropping this one leaves a symmetric run wearing an
    // asymmetric header -- the same failure the demotion above is refused for --
    // so the spelling that was never implemented is refused by name instead of
    // being ignored. It is named here rather than in a general unknown-key rule
    // because only this key silently changes what is being measured.
    if args.flag("matchup") || args.text("matchup").is_some() {
        return Some(format!(
            "--matchup is not a key this build has: name each side with {}",
            MATCHUP_KEYS.map(|key| format!("--{key}")).join(" and ")
        ));
    }
    None
}

fn matchup_from(args: &Args) -> Result<Matchup, String> {
    if let Some(sentence) = matchup_key_refusal(args) {
        return Err(sentence);
    }
    let base = script_from(args);
    let mut matchup = Matchup::symmetric(base);
    for (key, side) in MATCHUP_KEYS.into_iter().zip([true, false]) {
        let Some(name) = args.text(key) else { continue };
        let Some((_, script)) = MATCHUP_SCRIPTS.iter().find(|(token, _)| *token == name) else {
            let vocabulary: Vec<&str> = MATCHUP_SCRIPTS.iter().map(|(token, _)| *token).collect();
            return Err(format!(
                "--{key} does not know the script \"{name}\": it takes {}",
                vocabulary.join(", ")
            ));
        };
        if side { matchup.heroes = *script } else { matchup.monsters = *script }
    }
    Ok(matchup)
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
    kinds: [u64; 4],
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
fn measure_articulated(
    scenario: &Scenario,
    seed: u64,
    matchup: impl Into<Matchup>,
) -> ArticulatedTrial {
    measure_articulated_traced(scenario, seed, matchup, None)
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
    matchup: impl Into<Matchup>,
    recorder: Option<&mut FightTrace>,
) -> ArticulatedTrial {
    let matchup = matchup.into();
    let mut heroes = matchup.heroes.policy();
    let mut monsters = matchup.monsters.policy();
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
    let mut kinds = [0u64; 4];
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
        // `expect` and not a fallback: this arm drives an articulated world, so
        // every record is an articulated one and a refusal here would mean the
        // fixture had changed model underneath the harness -- which is a thing
        // to stop on rather than to report a number for.
        digest: script_digest(&stream).expect("an articulated run stores articulated commands"),
        state: world.state_digest(),
    }
}

/// The same index-ordered fan-out [`parallel_runs`] uses, on the fixture.
fn articulated_trials(
    scenario: &Scenario,
    seeds: &[u64],
    threads: usize,
    matchup: impl Into<Matchup>,
) -> Vec<ArticulatedTrial> {
    let matchup = matchup.into();
    let mut slots: Vec<Option<ArticulatedTrial>> = vec![None; seeds.len()];
    if seeds.is_empty() {
        return Vec::new();
    }
    let chunk = seeds.len().div_ceil(threads.max(1)).max(1);

    std::thread::scope(|scope| {
        for (chunk_seeds, out) in seeds.chunks(chunk).zip(slots.chunks_mut(chunk)) {
            scope.spawn(move || {
                for (i, &seed) in chunk_seeds.iter().enumerate() {
                    out[i] = Some(measure_articulated(scenario, seed, matchup));
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
    // The asymmetric keys join this list for exactly the reason the rest are on
    // it: the receipt is a frozen experiment over one script on both sides, and
    // a matchup is a measurement-changing override however legal it is elsewhere.
    [
        "seed", "seeds", "ticks", "policy", "opponent", "attack-moves",
        "threshold", "mirrored", "threads", "seed-zero-only",
        "hero-policy", "monster-policy",
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
                command_digest: script_digest(&stream)
                    .expect("an articulated run stores articulated commands"),
                state: world.state_digest(),
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
    let mut kinds = [0u64; 4];
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

    // The fixture unless a picker flag was given, on exactly `trace`'s terms and
    // through exactly its refusals -- combat arms 02 predeclared a corpus
    // measurement of a two-handed Brute and `articulated` had no way to describe
    // one, so the corpus could not answer the question the session was asked.
    // `duel_config_from` returning `None` keeps an unflagged run byte-identical
    // to what it produced before, which is what lets the pinned baselines in
    // `docs/reference/articulated-mechanical-gate.md` still be compared against.
    let described = duel_config_from(args).unwrap_or_else(|sentence| {
        eprintln!("{sentence}");
        std::process::exit(2);
    });
    let (original, mirror) = match &described {
        None => (Scenario::articulated_duel(), mirrored_articulated_duel()),
        Some(config) => {
            let built = Scenario::duel_from(config).unwrap_or_else(|error| {
                eprintln!("the described duel is not a legal one: {error:?}");
                std::process::exit(2);
            });
            let mut reflected = built.clone();
            mirror_spawns(&mut reflected);
            (built, reflected)
        }
    };
    let mirrored = args.flag("mirrored");

    // The matchup, on `duel_config_from`'s terms: returned rather than
    // printed-and-exited, and refused by name. An unflagged run resolves to one
    // script on both sides, which is what every pinned baseline in
    // `docs/reference/articulated-mechanical-gate.md` was measured under.
    let matchup = matchup_from(args).unwrap_or_else(|sentence| {
        eprintln!("{sentence}");
        std::process::exit(2);
    });

    println!(
        "{} seeds x {} orientation{} = {} trials of {} under {}",
        seeds.len(),
        if mirrored { 2 } else { 1 },
        if mirrored { "s" } else { "" },
        seeds.len() * if mirrored { 2 } else { 1 },
        original.name,
        matchup.name()
    );
    println!(
        "fixture   0x{:016x} canonical, 0x{:016x} mirrored across y={}",
        original.fingerprint(),
        mirror.fingerprint(),
        original.arena().y / Fx::from_int(2)
    );

    let started = Instant::now();
    let canonical = articulated_trials(&original, &seeds, threads, matchup);
    let reflected = if mirrored {
        articulated_trials(&mirror, &seeds, threads, matchup)
    } else {
        Vec::new()
    };
    let elapsed = started.elapsed();
    report_trials(&canonical, &reflected, mirrored, &original, elapsed);
}

/// The fixed-label report both corpora print.
///
/// **One summariser and two callers rather than two summarisers**, because the
/// point of the embodied corpus wearing this report is that the two can be read
/// side by side -- and a column that drifted apart would be worse than a column
/// that was never there. Nothing in it is articulated-only: every field it
/// touches is one [`ArticulatedTrial`] carries, and that struct is the embodied
/// corpus's row too, under the alias that says so.
///
/// `canonical` is the unreflected orientation and its length is the seed count,
/// which is what the `sides` percentage is a fraction of; `reflected` is empty
/// when no mirror was run.
fn report_trials(
    canonical: &[ArticulatedTrial],
    reflected: &[ArticulatedTrial],
    mirrored: bool,
    scenario: &Scenario,
    elapsed: std::time::Duration,
) {
    let seeds = canonical.len();
    let original = scenario;
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
    let mut kinds = [0u64; 4];
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
    let (won, mirrored_won) = (fighter_wins(canonical), fighter_wins(reflected));
    if mirrored {
        let side = won.abs_diff(mirrored_won);
        println!(
            "sides     fighter wins {won} canonical, {mirrored_won} mirrored, \
             difference {side} ({:.2} percentage points)",
            100.0 * side as f64 / seeds.max(1) as f64
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

    // The two fingerprints of the canonical seed-zero run, printed and
    // deliberately **not** recorded anywhere. `ARTICULATED_HASH` is created
    // once, at the very end of v2-17, after both gates pass; a constant pinned
    // here would be a promise about a physics that checkpoint B is still allowed
    // to change, and `docs/reference/hashes.md` forbids exactly that. The
    // embodied corpus prints the same line and is under the same rule: its pin
    // is `EMBODIED_CORPUS_DIGEST`, which is a fold over a frozen corpus reached
    // by its own flag, and is not this line under another name.
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

// ---- the embodied corpus

/// The embodied corpus's row, which **is** [`ArticulatedTrial`] rather than a
/// copy of it.
///
/// Every column that struct carries is read off the `World` immediately after a
/// step -- resolutions by kind, cap hits, the energy-ledger excess, severances,
/// health -- and not one of them is articulated-only. What names the model is
/// the `domain` word inside `state`, which an embodied run answers
/// `HashDomain::EmbodiedV1` to and an articulated one `ArticulatedV1`; that is
/// exactly why `StateDigest` carries a domain instead of being a bare `u64`, and
/// it makes a digest from one corpus offered as the other's a type error rather
/// than two numbers that differ.
///
/// A second struct with the same twenty fields would be a second thing to keep
/// in step with the summariser below, and the summariser is the whole reason
/// either of them exists: the two reports are meant to be read side by side, so
/// a column that drifted apart would be worse than no column.
type EmbodiedTrial = ArticulatedTrial;

/// The ASCII domain prefix of [`embodied_script_digest`], on
/// `policy::SCRIPT_DIGEST_DOMAIN`'s own precedent: a bare FNV of a byte stream
/// is a number any other byte stream can collide with, and a domain prefix is
/// the cheapest way to make "this is an *embodied* command stream" part of what
/// was hashed. A different prefix from the articulated one, deliberately, since
/// the two grammars differ by four bytes and a shared prefix would invite the
/// comparison.
const EMBODIED_SCRIPT_DIGEST_DOMAIN: &[u8] = b"ARPG-EMBODIED-SCRIPT-V1";

/// One embodied run's stored command stream, as eight bytes.
///
/// **This exists because `policy::script_digest` answers the empty-stream
/// constant for every embodied fight, and does it silently.** Its loop is
/// `let SubmittedCommand::Articulated(command) = record.command else { continue }`,
/// and its doc comment accounts for the skipped arm as
/// `SubmittedCommand::Legacy`, which "cannot occur". `SubmittedCommand::Embodied`
/// occurs on every record of every embodied run, so the digest counts zero
/// records and finishes at `0x89b684347e2caedd` -- the same number for the
/// script, the control, and a matchup with a different policy on each side.
/// Three tests in this file were written against it and all three failed on the
/// first run, which is the only reason it was found: an embodied corpus reported
/// a `script` column that looked like a fingerprint and was a constant.
///
/// **The fix belongs in `crates/policy` and is not taken here.** Teaching
/// `script_digest` the third arm is a one-line change to a function that feeds
/// `ARTICULATED_STREAM_DIGEST`'s neighbours and every pinned articulated
/// `script` column, and this session's whole job is to record numbers that hold
/// still. So the embodied corpus digests its own stream, under its own domain,
/// and the day `script_digest` grows the arm this function is what it has to
/// agree with -- or be deleted in favour of.
///
/// The grammar is `script_digest`'s, byte for byte, over
/// `EmbodiedCommandV1::payload_bytes` instead of the articulated 53: the tick,
/// the subject's full identity, the payload, and the record count last so that a
/// stream cannot be extended by a record whose bytes happen to be zero.
fn embodied_script_digest(records: &[SubmittedCommandRecord]) -> u64 {
    let mut h = Hash64::new();
    h.write_bytes(EMBODIED_SCRIPT_DIGEST_DOMAIN);
    let mut counted = 0u32;
    for record in records {
        let SubmittedCommand::Embodied(command) = record.command else {
            continue;
        };
        h.write_u32(record.tick);
        h.write_u32(record.entity.index);
        h.write_u32(record.entity.generation);
        h.write_bytes(&command.payload_bytes());
        counted += 1;
    }
    h.write_u32(counted);
    h.finish()
}

/// The sentence fragment naming an embodied policy in a report headline, on
/// [`Script::name`]'s terms exactly.
///
/// Separate from [`EmbodiedPolicyKind::name`] for the reason [`Script::token`]
/// is separate from [`Script::name`]: that one is the identifier a command line
/// and a trace header spell, this one is English. The vocabulary itself is *not*
/// duplicated -- `--policy` parses through `EmbodiedPolicyKind::from_name`, so
/// there is one list of embodied policy names in the repository and this
/// function does not add a second.
fn embodied_name(kind: EmbodiedPolicyKind) -> &'static str {
    match kind {
        EmbodiedPolicyKind::Neutral => "the neutral control",
        EmbodiedPolicyKind::Scripted => "the embodied script",
        EmbodiedPolicyKind::ScriptedLevel => "the embodied script with the ground term off (control)",
    }
}

/// Which embodied policy drives each side.
///
/// [`Matchup`]'s sibling and deliberately not a widening of it. The two hold
/// different enums because the two enums build different traits --
/// `Box<dyn ArticulatedPolicy>` and `Box<dyn EmbodiedPolicy>` -- returning
/// different command types, and a single matchup over a runtime-tagged script
/// would make "which model is this fight" a question answered at the submission
/// call rather than at the type. That is the argument `embodied_script.rs`
/// exists as a separate file for, one layer down.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct EmbodiedMatchup {
    heroes: EmbodiedPolicyKind,
    monsters: EmbodiedPolicyKind,
}

/// A bare kind *is* the symmetric matchup, exactly as a bare [`Script`] is.
impl From<EmbodiedPolicyKind> for EmbodiedMatchup {
    fn from(kind: EmbodiedPolicyKind) -> EmbodiedMatchup {
        EmbodiedMatchup::symmetric(kind)
    }
}

impl EmbodiedMatchup {
    fn symmetric(kind: EmbodiedPolicyKind) -> EmbodiedMatchup {
        EmbodiedMatchup { heroes: kind, monsters: kind }
    }

    fn is_symmetric(self) -> bool {
        self.heroes == self.monsters
    }

    /// One name when both sides are the same and "x against y" when they are
    /// not, which is [`Matchup::name`]'s rule and is what lets a symmetric
    /// embodied corpus be read without noticing the feature.
    fn name(self) -> String {
        if self.is_symmetric() {
            embodied_name(self.heroes).to_string()
        } else {
            format!("{} against {}", embodied_name(self.heroes), embodied_name(self.monsters))
        }
    }
}

/// The embodied matchup the flags add up to, or the sentence the run should be
/// refused with.
///
/// Returned rather than printed-and-exited, on [`matchup_from`]'s discipline and
/// through [`matchup_key_refusal`]'s two shared traps. The vocabulary is
/// `EmbodiedPolicyKind`'s own and is not written down a second time here: an
/// embodied fight named `scripted-level` in the studio, in a report and on a
/// command line is one word everywhere.
fn embodied_matchup_from(args: &Args) -> Result<EmbodiedMatchup, String> {
    if let Some(sentence) = matchup_key_refusal(args) {
        return Err(sentence);
    }
    let read = |key: &str| -> Result<Option<EmbodiedPolicyKind>, String> {
        let Some(name) = args.text(key) else { return Ok(None) };
        EmbodiedPolicyKind::from_name(name).map(Some).ok_or_else(|| {
            let vocabulary: Vec<&str> =
                EmbodiedPolicyKind::ALL.iter().map(|kind| kind.name()).collect();
            format!(
                "--{key} does not know the policy \"{name}\": it takes {}",
                vocabulary.join(", ")
            )
        })
    };
    // `--policy` sets both, so a bare `--policy` with no value would silently
    // resolve to the default and run a corpus nobody asked for. It is the same
    // demotion the two asymmetric keys are refused for, and it is refused here
    // rather than in the shared helper because the shared helper is used by a
    // reader whose `--policy` is [`script_from`]'s, which has its own arms.
    if args.flag("policy") {
        return Err(
            "--policy names the embodied policy driving both sides and needs a value: \
             it was given none"
                .to_string(),
        );
    }
    let base = read("policy")?.unwrap_or(EmbodiedPolicyKind::Scripted);
    let mut matchup = EmbodiedMatchup::symmetric(base);
    if let Some(kind) = read("hero-policy")? {
        matchup.heroes = kind;
    }
    if let Some(kind) = read("monster-policy")? {
        matchup.monsters = kind;
    }
    Ok(matchup)
}

/// The pinned fixture reflected across `y = 8`, embodied.
///
/// [`mirror_spawns`] rather than a second reflection, so `--mirrored` means the
/// same thing in both corpora, and for the reason that function records: the
/// spawn yaws are their own negations under a Y reflection, so nothing but the
/// spawn row moves. On the sculpted fixture it is more than a convenience --
/// the hill is centred so that all four spawn tiles are the same 29 squared
/// units from the top, which is what makes the reflected half a control on the
/// arena rather than a second sample of it.
fn mirrored_embodied(scenario: &Scenario) -> Scenario {
    let mut mirror = scenario.clone();
    mirror_spawns(&mut mirror);
    mirror
}

/// The same fixture with the two spawns exchanged.
///
/// **Not the mirror, and it answers a question the mirror cannot.** Mirroring
/// reflects both spawns about `y = 8` and leaves each body on its own side of
/// the arena; this puts the Fighter where the Brute was. On a fixture whose two
/// spawns stand on different ground -- `embodied_ledge` -- that is the only way
/// to get each anatomy onto each ground, which is what divides the anatomy out
/// of a measurement about the ground.
fn swapped_embodied(scenario: &Scenario) -> Scenario {
    let mut swapped = scenario.clone();
    assert!(swapped.units.len() >= 2, "a duel fixture has two bodies");
    let first = swapped.units[0].spawn;
    swapped.units[0].spawn = swapped.units[1].spawn;
    swapped.units[1].spawn = first;
    swapped
}

/// The two shipped embodied fixtures, chosen by `--slope`.
fn embodied_fixture(args: &Args) -> Scenario {
    if args.flag("slope") {
        Scenario::embodied_slope()
    } else {
        Scenario::embodied_duel()
    }
}

/// Where the two sides actually stood, accumulated over a run.
///
/// **The diagnostic that separates "the term is wrong" from "the criterion is
/// wrong", and it is needed because the measurement came out against the term.**
/// A win rate alone cannot tell a policy that failed to take the high ground
/// from one that took it and gained nothing by it, and those are two different
/// findings with two different owners.
///
/// An optional observer on the ordinary loop rather than a second loop, on
/// [`measure_articulated_traced`]'s precedent exactly: a third copy of the
/// decision loop is a third thing to drift, and an observer that returns nothing
/// to the world cannot change the fight it is watching.
///
/// It reads `articulated_pose(..).body.z`, which is the floor the body is
/// standing on -- `a_body_on_the_hill_stands_on_the_hill` in the determinism
/// suite is what says that column is the terrain and not a number of its own.
#[derive(Clone, Copy, Default, Debug)]
struct ElevationProbe {
    /// Per faction, Heroes then Monsters: the summed floor height under every
    /// live body at every tick, how many samples that is, and the highest floor
    /// any of them reached.
    ///
    /// **The sum is raw `i64` and not `Fx`, and the first version of this was
    /// wrong for exactly that reason.** `Fx` is 16.16, so its integer range
    /// stops at 32,767: sixty-four trials of 3,600 ticks is a quarter of a
    /// million samples, and a divisor built with `Fx::from_int` wrapped. It
    /// printed a mean floor of exactly `1.0000` for both sides -- a number this
    /// fixture cannot produce, since its summit is `0.75` -- and it read as a
    /// plausible-looking tie. Nothing here reaches authoritative state, so the
    /// accumulator is free to be wider than the quantity it accumulates.
    sum_raw: [i64; 2],
    samples: [u64; 2],
    peak: [Fx; 2],
    /// Samples taken above the flat.
    ///
    /// A mean alone cannot separate "climbed a little, everywhere" from
    /// "climbed a lot, briefly", and on this fixture the two have opposite
    /// readings: the hill is centred between the spawns, so *closing* is
    /// climbing whether a policy meant it or not.
    above: [u64; 2],
}

impl ElevationProbe {
    fn mean(&self, faction: Faction) -> Fx {
        let at = faction as usize;
        if self.samples[at] == 0 {
            return Fx::ZERO;
        }
        Fx::from_raw((self.sum_raw[at] / self.samples[at] as i64) as i32)
    }

    /// What share of the run this side spent off the flat, as a percentage.
    fn uphill(&self, faction: Faction) -> f64 {
        let at = faction as usize;
        100.0 * self.above[at] as f64 / self.samples[at].max(1) as f64
    }

    fn absorb(&mut self, other: &ElevationProbe) {
        for at in 0..2 {
            self.sum_raw[at] += other.sum_raw[at];
            self.samples[at] += other.samples[at];
            self.peak[at] = self.peak[at].max(other.peak[at]);
            self.above[at] += other.above[at];
        }
    }
}

/// Drives one seed of an embodied fixture to its stop and records what the
/// mechanics did.
///
/// A second copy of [`measure_articulated_matchup`]'s loop and **not** a
/// generalisation of it. The two differ in the one place a generalisation would
/// have had to hide: the command type. `submit_embodied_v1` takes an
/// `EmbodiedCommandV1`, whose `swing_plane` has no articulated counterpart, and
/// a loop that took both through a runtime tag would put the model behind a
/// branch at exactly the call that decides which grammar the world is speaking.
/// `World::submit_embodied_v1` already refuses the wrong model by name, and the
/// value of that refusal is that nothing ever reaches it.
///
/// `limit` is the tick bound, `None` meaning the scenario's own. **A parameter
/// rather than an edited `Scenario::max_ticks`**, because `max_ticks` is in the
/// fingerprint: a corpus that shortened the fight by editing the scenario would
/// stop being a corpus of `embodied-duel-v1` and the pin naming that fixture
/// would be naming something else.
fn measure_embodied_matchup(
    scenario: &Scenario,
    seed: u64,
    hero_policy: &mut dyn EmbodiedPolicy,
    monster_policy: &mut dyn EmbodiedPolicy,
    limit: Option<u32>,
    mut replay: Option<&mut Replay>,
    mut elevation: Option<&mut ElevationProbe>,
) -> EmbodiedTrial {
    let config = RunConfig::default();
    let mut world = World::new(scenario, seed);
    // Set *and recorded*, on `run_articulated`'s reasoning exactly: no embodied
    // observation has an order column, so nothing reads these, and they reach
    // the state hash anyway. A replay that recorded only the inputs somebody
    // currently reads would stop reproducing its run the day the embodied model
    // grows a standing order, and it would do it silently.
    for (faction, order) in [
        (Faction::Heroes, config.orders[0]),
        (Faction::Monsters, config.orders[1]),
    ] {
        world.set_order(faction, order);
        if let Some(replay) = replay.as_deref_mut() {
            replay.record_order(0, faction, order);
        }
    }

    let heroes = world.alive_ids(Faction::Heroes);
    // Both rosters read once, before anybody has died. `articulated_pose`
    // answers `None` for a slot that is no longer live, which is what keeps a
    // stale handle out of the probe's mean rather than a second liveness query
    // per tick.
    let monsters = world.alive_ids(Faction::Monsters);
    // **`reset` is load-bearing here in a way it is not on the articulated
    // side.** `ScriptedEmbodiedPolicy` carries `GroundSense`, which is a row of
    // per-run memory: the floor it started on and the highest it has reached. A
    // corpus that reused an instance across seeds without this would carry seed
    // n-1's hill into seed n, and the symptom would be a win rate that depended
    // on the order the seeds were chunked into threads.
    hero_policy.reset();
    monster_policy.reset();

    let mut due: Vec<EntityId> = Vec::new();
    let mut stream: Vec<SubmittedCommandRecord> = Vec::new();
    let mut contacts = 0u64;
    let mut kinds = [0u64; 4];
    let mut guard_pairs = [[0u64; 3]; 3];
    let mut commanded: Vec<(bool, Option<usize>, Option<usize>)> = Vec::new();
    let mut max_energy_excess = 0u64;
    let mut severances = 0u64;
    let mut max_blow_raw = 0u64;
    let mut max_tick_damage = Fx::ZERO;
    let mut dealt = Fx::ZERO;
    let mut rejected = 0u32;

    let limit = limit.unwrap_or(scenario.max_ticks);
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
            let roles = ArmRoles::of(&obs);
            commanded.push((
                matches!(command.articulated.intent, Intent::Attack(_)),
                height_index(command.articulated.arms[roles.weapon].height),
                height_index(command.articulated.arms[1 - roles.weapon].height),
            ));
            match world.submit_embodied_v1(id, command) {
                SubmitEmbodiedOutcome::Stored { command, rejection } => {
                    if rejection.is_some() {
                        rejected += 1;
                    }
                    // The stored command and never the offered one, for
                    // `ARPG-SCRIPT-V1`'s reason and for the replay's: a refused
                    // submission stores the neutral command, and a recording
                    // that carried the refused one would replay a fight the live
                    // run never had.
                    let record = SubmittedCommandRecord {
                        tick: world.tick(),
                        entity: id,
                        command: SubmittedCommand::Embodied(command),
                    };
                    if let Some(replay) = replay.as_deref_mut() {
                        replay.record_submitted(record.tick, record.entity, record.command);
                    }
                    stream.push(record);
                }
                SubmitEmbodiedOutcome::NotStored(_) => rejected += 1,
            }
        }
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
            max_blow_raw = max_blow_raw.max(row.cut_raw.saturating_add(row.thrust_raw));
        }
        let total = world.damage_dealt(Faction::Heroes) + world.damage_dealt(Faction::Monsters);
        max_tick_damage = max_tick_damage.max(total - dealt);
        dealt = total;
        if let Some(probe) = elevation.as_deref_mut() {
            for (at, roster) in [&heroes, &monsters].into_iter().enumerate() {
                for &id in roster {
                    let Some(pose) = world.articulated_pose(id) else { continue };
                    probe.sum_raw[at] += i64::from(pose.body.z.raw());
                    probe.samples[at] += 1;
                    probe.peak[at] = probe.peak[at].max(pose.body.z);
                    probe.above[at] += u64::from(pose.body.z > Fx::ZERO);
                }
            }
        }
    }

    if let Some(replay) = replay.as_deref_mut() {
        replay.finish(world.tick());
    }
    let settled = world.outcome();
    EmbodiedTrial {
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
        digest: embodied_script_digest(&stream),
        state: world.state_digest(),
    }
}

/// One seed, one matchup, fresh policies, no recording.
fn measure_embodied(
    scenario: &Scenario,
    seed: u64,
    matchup: impl Into<EmbodiedMatchup>,
    limit: Option<u32>,
) -> EmbodiedTrial {
    let matchup = matchup.into();
    let mut heroes = matchup.heroes.build();
    let mut monsters = matchup.monsters.build();
    measure_embodied_matchup(scenario, seed, heroes.as_mut(), monsters.as_mut(), limit, None, None)
}

/// The same index-ordered fan-out [`articulated_trials`] uses, embodied.
///
/// `limit` is [`measure_embodied_matchup`]'s tick bound, `None` meaning the
/// fixture's own -- carried through rather than fixed here so that a bounded
/// corpus is one call and never a second loop.
fn embodied_trials(
    scenario: &Scenario,
    seeds: &[u64],
    threads: usize,
    matchup: impl Into<EmbodiedMatchup>,
    limit: Option<u32>,
) -> Vec<EmbodiedTrial> {
    let matchup = matchup.into();
    let mut slots: Vec<Option<EmbodiedTrial>> = vec![None; seeds.len()];
    if seeds.is_empty() {
        return Vec::new();
    }
    let chunk = seeds.len().div_ceil(threads.max(1)).max(1);

    std::thread::scope(|scope| {
        for (chunk_seeds, out) in seeds.chunks(chunk).zip(slots.chunks_mut(chunk)) {
            scope.spawn(move || {
                for (i, &seed) in chunk_seeds.iter().enumerate() {
                    out[i] = Some(measure_embodied(scenario, seed, matchup, limit));
                }
            });
        }
    });

    slots
        .into_iter()
        .map(|slot| slot.expect("every seed should have produced a trial"))
        .collect()
}

/// The registered embodied pin: one number over a fixed corpus of embodied
/// state digests.
///
/// **This is what session 10 checks itself against.** `bench`, `verify`, `hash`,
/// `duel` and `evolve` are Legacy-only and `articulated` drives a model that
/// session is deleting, so on the day those pins go there is nothing left in the
/// repository that would notice an embodied fight changing. The registry row in
/// [`docs/reference/hashes.md`] says so in those words.
///
/// The corpus is deliberately small and deliberately truncated. It is
/// [`EMBODIED_CORPUS_SEEDS`] seeds of **both** shipped embodied fixtures in
/// **both** orientations, each stopped at [`EMBODIED_CORPUS_TICKS`], with the
/// embodied script on both sides. Two properties are worth stating because both
/// were choices:
///
/// * **The slope is in it.** A pin over the flat fixture alone could not see
///   `ground_z`, terrain routing or the elevation term at all -- `Dungeon::digest`
///   short-circuits on `sculpted`, which is exactly why adding elevation to the
///   engine moved no golden hash and exactly why one that can see it has to name
///   the sculpted fixture.
/// * **It is bounded by ticks and not by a shortened scenario.** `max_ticks` is
///   in `Scenario::fingerprint`, so editing it would produce a fixture that is
///   not `embodied-duel-v1`, and this row's claim is about that fixture by
///   fingerprint. The bound is passed to the loop instead.
///
/// What it folds is the typed digest and nothing else: the domain word, the
/// schema, and the value, per trial, after the fixture's own fingerprint. The
/// command stream is *not* folded, on purpose -- a pin that moved when the
/// policy moved would be reporting two independent things through one number,
/// and the policy has its own witness in the corpus report's `script` column.
const EMBODIED_CORPUS_SEEDS: u64 = 8;

/// The tick bound of the pin corpus.
///
/// 600 rather than the fixture's 3,600 because of what those ticks contain: the
/// articulated corpus reaches its clock in 95% of trials, so the last five sixths
/// of a fight are two bodies that have already stopped deciding anything new,
/// while the first 600 are the whole approach -- the closing, the climb, the
/// first exchanges, and on the sculpted fixture the terrain sampling that no
/// other pinned corpus in this repository reaches. It also makes the constant's
/// own test affordable in a debug build, which is the difference between a pin a
/// gate checks and a pin a reader is asked to trust.
const EMBODIED_CORPUS_TICKS: u32 = 600;

/// The pinned value. Re-record with
/// `cargo run --release -p lab -- embodied --corpus-digest`.
const EMBODIED_CORPUS_DIGEST: u64 = 0x1488_2fb0_e0f8_51e5;

/// The four arenas of the pin corpus, in the order the fold writes them.
///
/// Flat then sculpted, canonical then mirrored. **The order is part of the
/// grammar**: a fold is not a set, and two corpora differing only in which
/// fixture came first are two different numbers.
fn embodied_corpus_arenas() -> Vec<Scenario> {
    let mut arenas = Vec::with_capacity(4);
    for scenario in [Scenario::embodied_duel(), Scenario::embodied_slope()] {
        let mirror = mirrored_embodied(&scenario);
        arenas.push(scenario);
        arenas.push(mirror);
    }
    arenas
}

/// The corpus itself, as one number.
///
/// Computed across threads and folded in a fixed order afterwards, which are two
/// separate statements and both are needed: the trials are independent, so the
/// fan-out is free, and the fold is over index-ordered slots, so no chunk
/// boundary can reach the number. It is fanned out because a pin nothing can
/// afford to check is not a pin -- `the_embodied_corpus_digest_is_the_pinned_one`
/// runs this in a debug build.
fn embodied_corpus_digest() -> u64 {
    let arenas = embodied_corpus_arenas();
    let mut slots: Vec<Option<StateDigest>> =
        vec![None; arenas.len() * EMBODIED_CORPUS_SEEDS as usize];
    let threads = default_threads();
    let chunk = slots.len().div_ceil(threads.max(1)).max(1);
    let arenas_ref = &arenas;
    std::thread::scope(|scope| {
        for (index, out) in slots.chunks_mut(chunk).enumerate() {
            let base = index * chunk;
            scope.spawn(move || {
                for (offset, slot) in out.iter_mut().enumerate() {
                    let at = base + offset;
                    let arena = &arenas_ref[at / EMBODIED_CORPUS_SEEDS as usize];
                    let seed = (at % EMBODIED_CORPUS_SEEDS as usize) as u64;
                    *slot = Some(
                        measure_embodied(
                            arena,
                            seed,
                            EmbodiedPolicyKind::Scripted,
                            Some(EMBODIED_CORPUS_TICKS),
                        )
                        .state,
                    );
                }
            });
        }
    });

    let mut h = Hash64::new();
    h.write_bytes(b"ARPG-EMBODIED-CORPUS-V1");
    h.write_u32(EMBODIED_CORPUS_TICKS);
    h.write_u64(EMBODIED_CORPUS_SEEDS);
    for (at, digest) in slots.into_iter().enumerate() {
        if at % EMBODIED_CORPUS_SEEDS as usize == 0 {
            h.write_u64(arenas[at / EMBODIED_CORPUS_SEEDS as usize].fingerprint());
        }
        let digest = digest.expect("every corpus cell should have produced a digest");
        // The domain and the schema and not only the value, because the three
        // are what a `StateDigest` is: a value read under the wrong grammar is
        // not a smaller mistake than a wrong value.
        h.write_u8(digest.domain as u8);
        h.write_u16(digest.schema);
        h.write_u64(digest.value);
    }
    h.finish()
}

/// Every key that would change what a frozen embodied mode measures, refused by
/// name before any world is built.
///
/// [`competence_override`]'s rule and its reason: a command that looks like the
/// pin corpus must never quietly measure a different one. `--threads` is on the
/// list even though the fan-out is index-ordered, because a frozen mode that
/// accepted it would be inviting a reader to believe the number depends on it.
fn embodied_override(args: &Args) -> Option<&'static str> {
    ["seeds", "threads", "seed-zero-only", "mirrored", "slope", "policy",
     "hero-policy", "monster-policy", "ticks"]
        .into_iter()
        .find(|key| args.flag(key) || args.text(key).is_some())
}

/// `articulated`'s sibling: the same corpus shape, the same report labels, under
/// the embodied model.
fn embodied(args: &Args) {
    // Named together rather than tested one after the other, so that asking for
    // both is a refusal instead of a silent precedence rule. Two frozen
    // measurements on one line is exactly the shape of input where "nearly
    // right" survives review: the operator gets a number, and it is the other
    // measurement's.
    let frozen: Vec<&str> = ["corpus-digest", "high-ground"]
        .into_iter()
        .filter(|key| args.flag(key))
        .collect();
    if frozen.len() > 1 {
        eprintln!(
            "embodied --corpus-digest and --high-ground are two frozen measurements: name one"
        );
        std::process::exit(2);
    }
    if let Some(&mode) = frozen.first() {
        if let Some(key) = embodied_override(args) {
            eprintln!("embodied --{mode} accepts no --{key} override");
            std::process::exit(2);
        }
        return match mode {
            "corpus-digest" => embodied_corpus_report(),
            _ => high_ground_report(),
        };
    }
    let count = args.u32("seeds", 400) as u64;
    let threads = args.usize("threads", default_threads());
    let seeds: Vec<u64> = if args.flag("seed-zero-only") {
        vec![0]
    } else {
        (0..count).collect()
    };
    let original = embodied_fixture(args);
    let mirror = mirrored_embodied(&original);
    let mirrored = args.flag("mirrored");

    let matchup = embodied_matchup_from(args).unwrap_or_else(|sentence| {
        eprintln!("{sentence}");
        std::process::exit(2);
    });

    println!(
        "{} seeds x {} orientation{} = {} trials of {} under {}",
        seeds.len(),
        if mirrored { 2 } else { 1 },
        if mirrored { "s" } else { "" },
        seeds.len() * if mirrored { 2 } else { 1 },
        original.name,
        matchup.name()
    );
    println!(
        "fixture   0x{:016x} canonical, 0x{:016x} mirrored across y={}",
        original.fingerprint(),
        mirror.fingerprint(),
        original.arena().y / Fx::from_int(2)
    );

    let started = Instant::now();
    let canonical = embodied_trials(&original, &seeds, threads, matchup, None);
    let reflected = if mirrored {
        embodied_trials(&mirror, &seeds, threads, matchup, None)
    } else {
        Vec::new()
    };
    let elapsed = started.elapsed();
    report_trials(&canonical, &reflected, mirrored, &original, elapsed);
}

/// The pin corpus, printed with everything a reader needs to re-record it.
fn embodied_corpus_report() {
    let started = Instant::now();
    let digest = embodied_corpus_digest();
    let elapsed = started.elapsed();
    println!(
        "corpus    {EMBODIED_CORPUS_SEEDS} seeds x 2 fixtures x 2 orientations = {} trials, \
         {EMBODIED_CORPUS_TICKS} ticks each, under the embodied script",
        EMBODIED_CORPUS_SEEDS * 4
    );
    // The arenas the fold actually walked, in the order it walked them, rather
    // than a second list built the same way: a header that named a fixture the
    // corpus did not run would be the one error nobody re-reads a header to
    // catch.
    for (at, arena) in embodied_corpus_arenas().into_iter().enumerate() {
        // The mirror keeps the fixture's name and therefore not its
        // fingerprint, which `mirrored_articulated_duel` records at length. So
        // the orientation is printed beside the name rather than read off it.
        let orientation = if at % 2 == 0 {
            "canonical".to_string()
        } else {
            format!("mirrored across y={}", arena.arena().y / Fx::from_int(2))
        };
        println!("fixture   0x{:016x}  {} {orientation}", arena.fingerprint(), arena.name);
    }
    println!("digest    0x{digest:016x}");
    println!(
        "pinned    0x{EMBODIED_CORPUS_DIGEST:016x}  {}",
        if digest == EMBODIED_CORPUS_DIGEST { "agrees" } else { "MOVED" }
    );
    println!("          {:.2}s wall", elapsed.as_secs_f64());
    if digest != EMBODIED_CORPUS_DIGEST {
        std::process::exit(1);
    }
}

/// The number of seeds each arm of the high-ground measurement runs.
const HIGH_GROUND_SEEDS: u64 = 400;

/// One arm of the high-ground measurement: which policy sat on which side, and
/// what the corpus did with it.
struct HighGroundArm {
    label: &'static str,
    /// The faction carrying the seeking configuration, or `None` when both
    /// sides carry the same one.
    seeking: Option<Faction>,
    trials: Vec<EmbodiedTrial>,
}

impl HighGroundArm {
    fn wins(&self, faction: Faction) -> usize {
        self.wins_in(faction, 0, self.trials.len())
    }

    /// Wins over the seeds `[from, to)` of **both** orientations, for the
    /// split-half below.
    ///
    /// The trials arrive in seed order, canonical block then mirrored, so a
    /// range of seed indices has to be taken from both blocks rather than from
    /// the front of the vector: a first half taken naively would be the whole
    /// canonical orientation and none of the mirror, which is a different
    /// question with a plausible-looking answer.
    fn wins_in(&self, faction: Faction, from: usize, to: usize) -> usize {
        let block = self.trials.len() / 2;
        self.trials
            .iter()
            .enumerate()
            .filter(|(at, _)| {
                let seed = at % block;
                seed >= from && seed < to
            })
            .filter(|(_, t)| t.outcome.winner() == Some(faction))
            .count()
    }

    fn kills(&self, faction: Faction) -> usize {
        self.trials
            .iter()
            .filter(|t| !t.timed_out && t.outcome.winner() == Some(faction))
            .count()
    }
}

/// **The elevation measurement, and the whole acceptance criterion for session
/// 04 having been worth doing.**
///
/// The embodied script against itself with the high-ground term switched off on
/// one side, on the sculpted fixture, over `HIGH_GROUND_SEEDS` seeds by two
/// orientations by two side assignments.
///
/// **It is not bracketed and must not be.** Bracketing `control -> subject ->
/// control` inside a round and quoting a range across pinned processes is the
/// protocol for a wall-clock number that swings two to three times run to run.
/// A win rate over a fixed seed set is a pure function of the two policies and
/// the fixture: three pinned processes would print the same number three times
/// and imply a variance that does not exist. Copying a benchmark protocol onto a
/// deterministic measurement makes it look more careful and makes it say less.
///
/// What it does need is two controls, and each one is a control on a *different*
/// thing the corpus would otherwise measure alongside the term:
///
/// * **The mirror**, on the arena. The two policies sit at different spawns, so
///   a single orientation measures the spawn. `embodied_slope` is centred so
///   that all four spawn tiles are the same 29 squared units from the top, which
///   is what makes the reflected half a control rather than a second sample.
/// * **The side swap**, on the bodies. The Fighter carries a sword and a plate
///   and the Brute a club, and they are not equal fighters -- `lab articulated`
///   reports 285/299 over 800 trials of the same pair. A single assignment would
///   therefore measure the anatomy as well as the term. Running both, and
///   pooling the seeking side's wins across them, cancels it *exactly*: if the
///   term did nothing, both assignments would reproduce the both-seeking control
///   below and the pooled counts would be equal by construction.
///
/// That third arm -- the same corpus with the term on both sides -- is not part
/// of the comparison and is printed anyway, because it is what tells a reader
/// whether a gap of n duels is large or small on this fixture.
fn high_ground_report() {
    // **Both sculpted fixtures, and the pair is the result.** `embodied_slope`
    // puts its hill on the midpoint, which is fair and is the wrong experiment:
    // a hill between two closing bodies is not a choice, because closing *is*
    // climbing. Its own elevation line says so -- both sides spend more than
    // half the fight off the flat whether or not they are trying to -- and a
    // margin measured there is a fact about the fixture. `embodied_knolls` puts
    // the high ground perpendicular to the approach, where taking it costs
    // something. Printing only the second would hide why the first is not the
    // answer; printing only the first is what this report did before the second
    // existed.
    for (scenario, summit) in [
        (Scenario::embodied_slope(), Vec2::from_ints(12, 8)),
        (Scenario::embodied_knolls(), Vec2::from_ints(10, 13)),
    ] {
        high_ground_on(&scenario, summit);
        println!();
    }
    elevation_advantage_report();
}

/// Whether standing higher wins fights at all, with the policy divided out.
///
/// **The measurement above cannot answer this and it took two fixtures to see
/// why.** It runs a policy that *seeks* height against one that ignores it, so
/// a loss is consistent with two different worlds: one where the term is bad,
/// and one where height is worth nothing and no term could have paid for it.
/// The elevation diagnostic separates "did it go up" from "did going up help",
/// and it says the seeking side barely goes up -- which leaves the second world
/// entirely unmeasured.
///
/// So this one takes the choice away. `embodied_ledge` stands one body on a
/// plateau and the other on the floor; both run the **same** policy, so the only
/// difference between them is the ground under their feet. Wins are counted by
/// the spawn a body started on rather than by its faction, and the two spawns
/// are exchanged as well as mirrored, so each anatomy fights from each side.
///
/// A margin here is elevation's own effect. A margin in the report above, given
/// this one, is the term's.
fn elevation_advantage_report() {
    let ledge = Scenario::embodied_ledge();
    let flat = Scenario::embodied_duel();
    let started = Instant::now();

    println!(
        "advantage    {} seeds x 2 orientations x 2 spawn assignments = {} trials of {}",
        HIGH_GROUND_SEEDS,
        HIGH_GROUND_SEEDS * 4,
        ledge.name,
    );
    println!(
        "fixture      0x{:016x} canonical, 0x{:016x} spawns exchanged",
        ledge.fingerprint(),
        swapped_embodied(&ledge).fingerprint(),
    );
    let raised = west_east_margin(&ledge);
    println!(
        "term         plateau {} wins, floor {} wins over {} trials, margin {:+} ({:+.2} points)",
        raised.west, raised.east, raised.trials, raised.margin(), raised.points(),
    );

    // **The control that says "higher" and not "west".** The ledge runs down
    // `x`, so the body on the plateau is also the body on the left, and the two
    // spawns are not symmetric about the arena in `x`: `(7, 6)` and `(17, 10)`
    // sit five either side of `x = 12` as points, but in tiles whose centres are
    // 7.5 and 17.5. The same count on the flat fixture -- same policy, same
    // seeds, same two exchanges -- is what separates the height from the side of
    // the room it happens to be on.
    let level = west_east_margin(&flat);
    println!(
        "control      0x{:016x} {} -- west {} wins, east {} wins, margin {:+} ({:+.2} points)",
        flat.fingerprint(), flat.name,
        level.west, level.east, level.margin(), level.points(),
    );
    println!(
        "verdict      standing higher is worth {:+} duels ({:+.2} points) once the side of \
         the room is taken off",
        raised.margin() - level.margin(),
        raised.points() - level.points(),
    );
    println!(
        "sampling     plateau split-half {:+} and {:+}, flat {:+} and {:+} -- {}",
        raised.halves[0], raised.halves[1], level.halves[0], level.halves[1],
        if raised.halves[0].signum() * raised.halves[1].signum() < 0 {
            "THE TWO HALVES DISAGREE IN SIGN, so the margin is inside its own sampling spread"
        } else {
            "both halves of the measurement agree in sign"
        }
    );
    println!("             {:.2}s wall", started.elapsed().as_secs_f64());
}

/// Wins for the body that spawned west of the arena's middle against the one
/// east of it, over both orientations and both spawn assignments.
struct SideMargin {
    west: usize,
    east: usize,
    trials: usize,
    halves: [i64; 2],
}

impl SideMargin {
    fn margin(&self) -> i64 {
        self.west as i64 - self.east as i64
    }

    fn points(&self) -> f64 {
        100.0 * self.margin() as f64 / self.trials.max(1) as f64
    }
}

fn west_east_margin(scenario: &Scenario) -> SideMargin {
    let seeds: Vec<u64> = (0..HIGH_GROUND_SEEDS).collect();
    let threads = default_threads();
    let both = EmbodiedMatchup::symmetric(EmbodiedPolicyKind::Scripted);
    let mut out = SideMargin { west: 0, east: 0, trials: 0, halves: [0; 2] };
    for arrangement in [scenario.clone(), swapped_embodied(scenario)] {
        for arena in [arrangement.clone(), mirrored_embodied(&arrangement)] {
            // Read off the arena rather than assumed, so exchanging the spawns
            // cannot silently keep counting the same faction.
            let west = arena.units.iter()
                .find(|unit| unit.spawn.x < Fx::from_int(12))
                .map(|unit| unit.faction)
                .expect("one body stands west of the middle");
            let east = match west {
                Faction::Heroes => Faction::Monsters,
                Faction::Monsters => Faction::Heroes,
            };
            let rows = embodied_trials(&arena, &seeds, threads, both, None);
            for (at, row) in rows.iter().enumerate() {
                let half = usize::from(at >= seeds.len() / 2);
                match row.outcome.winner() {
                    Some(w) if w == west => { out.west += 1; out.halves[half] += 1; }
                    Some(w) if w == east => { out.east += 1; out.halves[half] -= 1; }
                    _ => {}
                }
            }
            out.trials += rows.len();
        }
    }
    out
}

/// One sculpted fixture's arms, margin, elevation diagnostic and attribution.
fn high_ground_on(scenario: &Scenario, summit: Vec2) {
    let mirror = mirrored_embodied(scenario);
    let seeds: Vec<u64> = (0..HIGH_GROUND_SEEDS).collect();
    let threads = default_threads();
    let flat = Scenario::embodied_duel();

    println!(
        "high ground  {} seeds x 2 orientations x 3 arms = {} trials of {}",
        seeds.len(),
        seeds.len() * 6,
        scenario.name
    );
    println!(
        "fixture      0x{:016x} canonical, 0x{:016x} mirrored across y={}",
        scenario.fingerprint(),
        mirror.fingerprint(),
        scenario.arena().y / Fx::from_int(2)
    );
    println!(
        "control      0x{:016x} {} -- where the term has to be inert",
        flat.fingerprint(),
        flat.name
    );

    let started = Instant::now();
    let arms: Vec<HighGroundArm> = [
        (
            "fighter seeks",
            Some(Faction::Heroes),
            EmbodiedMatchup {
                heroes: EmbodiedPolicyKind::Scripted,
                monsters: EmbodiedPolicyKind::ScriptedLevel,
            },
        ),
        (
            "brute seeks",
            Some(Faction::Monsters),
            EmbodiedMatchup {
                heroes: EmbodiedPolicyKind::ScriptedLevel,
                monsters: EmbodiedPolicyKind::Scripted,
            },
        ),
        (
            "both seek",
            None,
            EmbodiedMatchup::symmetric(EmbodiedPolicyKind::Scripted),
        ),
    ]
    .into_iter()
    .map(|(label, seeking, matchup)| {
        let mut trials = embodied_trials(scenario, &seeds, threads, matchup, None);
        trials.extend(embodied_trials(&mirror, &seeds, threads, matchup, None));
        HighGroundArm { label, seeking, trials }
    })
    .collect();
    let elapsed = started.elapsed();

    for arm in &arms {
        println!(
            "{:<12} fighter {} wins ({} kills), brute {} wins ({} kills), {} trials",
            arm.label,
            arm.wins(Faction::Heroes),
            arm.kills(Faction::Heroes),
            arm.wins(Faction::Monsters),
            arm.kills(Faction::Monsters),
            arm.trials.len(),
        );
    }

    // The two assignments pooled, which is the measurement. The both-seeking arm
    // is excluded by its own `seeking: None` rather than by position, so a
    // fourth arm cannot be added into the headline by accident.
    let (mut seeking_wins, mut level_wins) = (0usize, 0usize);
    let mut pooled = 0usize;
    for arm in arms.iter().filter(|arm| arm.seeking.is_some()) {
        let seeking = arm.seeking.expect("filtered");
        let level = match seeking {
            Faction::Heroes => Faction::Monsters,
            Faction::Monsters => Faction::Heroes,
        };
        seeking_wins += arm.wins(seeking);
        level_wins += arm.wins(level);
        pooled += arm.trials.len();
    }
    let margin = seeking_wins as i64 - level_wins as i64;
    println!(
        "term         seeking {seeking_wins} wins, level {level_wins} wins over {pooled} trials, \
         margin {margin:+} ({:+.2} percentage points)",
        100.0 * margin as f64 / pooled.max(1) as f64
    );
    println!(
        "verdict      the high-ground term {}",
        match margin {
            0 => "wins exactly as many duels as it loses".to_string(),
            m if m > 0 => format!("wins {m} more duels than it loses"),
            m => format!("loses {} more duels than it wins", -m),
        }
    );

    // **Determinism buys exactness, not significance, and the split is what
    // says which one the margin above is.** The plan corrected this measurement
    // away from wall-clock bracketing on the ground that a win rate over a fixed
    // seed set is a pure function of the policies and the fixture -- which is
    // true and answers the wrong objection. Nothing here varies between runs;
    // what varies is the *sample*, because four hundred seeds are four hundred
    // fights out of the space of all of them. A margin whose two halves disagree
    // in sign is a margin inside its own sampling spread, and printing only the
    // pooled number would let that pass as a result.
    //
    // Split by seed and not by orientation, and each half carries both -- see
    // `wins_in`. Halving the orientations instead would measure the mirror.
    let half = HIGH_GROUND_SEEDS as usize / 2;
    let mut halves = [0i64; 2];
    for (at, (from, to)) in [(0, half), (half, HIGH_GROUND_SEEDS as usize)].into_iter().enumerate() {
        let (mut up, mut level) = (0usize, 0usize);
        for arm in arms.iter().filter(|arm| arm.seeking.is_some()) {
            let seeking = arm.seeking.expect("filtered");
            let flatly = match seeking {
                Faction::Heroes => Faction::Monsters,
                Faction::Monsters => Faction::Heroes,
            };
            up += arm.wins_in(seeking, from, to);
            level += arm.wins_in(flatly, from, to);
        }
        halves[at] = up as i64 - level as i64;
    }
    println!(
        "sampling     split-half margins {:+} and {:+} over {} seeds each -- {}",
        halves[0],
        halves[1],
        half,
        if halves[0].signum() * halves[1].signum() < 0 {
            "THE TWO HALVES DISAGREE IN SIGN, so the pooled margin is inside its own sampling spread"
        } else if halves[0] == 0 || halves[1] == 0 {
            "one half is exactly even, so the pooled margin rests on the other"
        } else {
            "both halves agree in sign"
        }
    );

    // **Whichever way the margin came out, the next question is whether the
    // term did the thing it names.** A win rate cannot tell a policy that failed
    // to take the high ground from one that took it and gained nothing, and the
    // two findings belong to different owners: the first is the term's, the
    // second is the criterion's.
    let probe = high_ground_elevation(scenario, &mirror);
    println!(
        "elevation    {HIGH_GROUND_PROBE_SEEDS} seeds x 2 orientations x 2 assignments, \
         mean floor: seeking {}, level {}",
        probe.mean(Faction::Heroes),
        probe.mean(Faction::Monsters),
    );
    println!(
        "             peak floor reached: seeking {}, level {}  (the summit is {})",
        probe.peak[0],
        probe.peak[1],
        scenario.dungeon.height_at(summit),
    );
    println!(
        "             ticks spent off the flat: seeking {:.1}%, level {:.1}%",
        probe.uphill(Faction::Heroes),
        probe.uphill(Faction::Monsters),
    );

    // **The attribution, measured rather than asserted.** The whole reading of
    // the margin above is that a difference on the hill is the elevation term
    // and cannot be anything else, and this is the run that says so: the same
    // two arms on the flat fixture, where the term is meant to be a policy that
    // never so much as stores an elevation. `policy`'s own
    // `the_two_configurations_agree_on_flat_ground` asserts it against the
    // observation; a line in this report that only *claimed* it would be the
    // shape of guard this repository has been burned by three times.
    let (identical, compared) = flat_control_agreement(&flat, threads);
    println!(
        "attribution  {identical}/{compared} flat trials byte-identical with the term on and off{}",
        if identical == compared { "" } else { "  -- THE TERM IS NOT INERT ON FLAT GROUND" }
    );
    // The corpus and the diagnostic reported separately, because they are two
    // different amounts of work and a single number would invite a reader to
    // divide it by the wrong trial count.
    println!(
        "             {:.2}s wall over the corpus, {:.2}s over the diagnostic",
        elapsed.as_secs_f64(),
        started.elapsed().as_secs_f64() - elapsed.as_secs_f64(),
    );
}

/// The control that makes the margin attributable: on flat ground the two
/// configurations must be the same fight.
///
/// Returns how many of the trials agreed and how many were compared, rather
/// than a `bool`, so the report can print a fraction and a reader can tell "all
/// of them" from "the loop ran zero times" -- which is the failure a boolean
/// guard cannot distinguish from a pass.
fn flat_control_agreement(flat: &Scenario, threads: usize) -> (usize, usize) {
    let seeds: Vec<u64> = (0..HIGH_GROUND_PROBE_SEEDS).collect();
    let asymmetric = EmbodiedMatchup {
        heroes: EmbodiedPolicyKind::Scripted,
        monsters: EmbodiedPolicyKind::ScriptedLevel,
    };
    let symmetric = EmbodiedMatchup::symmetric(EmbodiedPolicyKind::Scripted);
    let (mut identical, mut compared) = (0usize, 0usize);
    for arena in [flat.clone(), mirrored_embodied(flat)] {
        let with = embodied_trials(&arena, &seeds, threads, asymmetric, None);
        let without = embodied_trials(&arena, &seeds, threads, symmetric, None);
        for (a, b) in with.iter().zip(without.iter()) {
            compared += 1;
            // The state and the command stream both: a term that moved a
            // command the world then clamped back would agree on the state and
            // still not be inert.
            if a.state.compare(b.state) == Ok(true) && a.digest == b.digest {
                identical += 1;
            }
        }
    }
    (identical, compared)
}

/// How many seeds the elevation diagnostic samples.
///
/// Far fewer than the win-rate corpus and deliberately so: it answers "does the
/// term climb", which is a per-tick fact about every body in every trial rather
/// than one bit per trial, so a small corpus already carries hundreds of
/// thousands of samples. Sampling the whole 1,600 would multiply the command's
/// wall time for a decimal place nobody would read differently.
const HIGH_GROUND_PROBE_SEEDS: u64 = 16;

/// The floor the two configurations actually stood on, pooled so that index 0 is
/// always the seeking side and index 1 always the level one.
///
/// **The pooling is what makes the two columns comparable.** Each assignment is
/// run and then read off the faction that carried the term, so the Fighter's own
/// habits appear in both columns exactly once and cannot be mistaken for the
/// term.
fn high_ground_elevation(scenario: &Scenario, mirror: &Scenario) -> ElevationProbe {
    let mut pooled = ElevationProbe::default();
    for (seeking, matchup) in [
        (
            Faction::Heroes,
            EmbodiedMatchup {
                heroes: EmbodiedPolicyKind::Scripted,
                monsters: EmbodiedPolicyKind::ScriptedLevel,
            },
        ),
        (
            Faction::Monsters,
            EmbodiedMatchup {
                heroes: EmbodiedPolicyKind::ScriptedLevel,
                monsters: EmbodiedPolicyKind::Scripted,
            },
        ),
    ] {
        for arena in [scenario, mirror] {
            for seed in 0..HIGH_GROUND_PROBE_SEEDS {
                let mut probe = ElevationProbe::default();
                let mut heroes = matchup.heroes.build();
                let mut monsters = matchup.monsters.build();
                measure_embodied_matchup(
                    arena,
                    seed,
                    heroes.as_mut(),
                    monsters.as_mut(),
                    None,
                    None,
                    Some(&mut probe),
                );
                // Re-indexed onto (seeking, level) rather than (Heroes,
                // Monsters), which is the whole point of running both
                // assignments.
                if seeking == Faction::Monsters {
                    probe = ElevationProbe {
                        sum_raw: [probe.sum_raw[1], probe.sum_raw[0]],
                        samples: [probe.samples[1], probe.samples[0]],
                        peak: [probe.peak[1], probe.peak[0]],
                        above: [probe.above[1], probe.above[0]],
                    };
                }
                pooled.absorb(&probe);
            }
        }
    }
    pooled
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
const HAND_ITEMS: [(&str, Option<sim::ActionKind>); 5] = [
    ("sword", Some(sim::ActionKind::Sword)),
    ("shield", Some(sim::ActionKind::Shield)),
    ("club", Some(sim::ActionKind::Club)),
    ("bow", Some(sim::ActionKind::Bow)),
    ("empty", None),
];

/// Whether the right-hand item is gripped by both hands.
///
/// `on`/`off` rather than a bare flag, because a bare `--a-two-handed` is
/// exactly the valueless trap `duel_config_from`'s first refusal exists for --
/// a boolean spelled as a flag could never be told apart from a key that lost
/// its value.
const TWO_HANDED: [(&str, bool); 2] = [("on", true), ("off", false)];

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
const DUEL_KEYS: [&str; 16] = [
    "fighter-a", "a-left", "a-right", "a-two-handed",
    "a-shield-half-width", "a-shield-half-height", "a-weapon-length", "a-weapon-mass",
    "fighter-b", "b-left", "b-right", "b-two-handed",
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
        // The grip, honoured or refused before any binding is written. Both
        // refusals exist for the same reason the dimension ones below do: `on`
        // over an empty right hand or a full left one edits nothing the sim
        // will accept, and dropping it silently would run a fight other than
        // the one the flag described.
        let grip_key = format!("{side}-two-handed");
        let two_handed = args.choice(&grip_key, fighter.two_handed, &TWO_HANDED);
        let left_action = fighter.hands[0].map(|item| item.action);
        let right_action = fighter.hands[1].map(|item| item.action);
        let carries_bow = left_action == Some(sim::ActionKind::Bow)
            || right_action == Some(sim::ActionKind::Bow);
        if carries_bow && !(left_action.is_none()
                && right_action == Some(sim::ActionKind::Bow) && two_handed) {
            return Err(format!(
                "fighter {side}'s bow must be the only carried item, in the right hand, with \
                 --{grip_key} on for its two-handed grip"
            ));
        }
        if two_handed && fighter.hands[1].is_none() {
            return Err(format!(
                "--{grip_key} grips the right-hand item with both hands, and fighter {side}'s \
                 right hand is empty: put a weapon in it with --{side}-right, or drop the key"
            ));
        }
        if two_handed && fighter.hands[0].is_some() {
            return Err(format!(
                "--{grip_key} is one item occupying two hands, and fighter {side}'s left hand \
                 is full: empty it with --{side}-left empty, or drop the key"
            ));
        }
        fighter.two_handed = two_handed;

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
        sim::CombatSpecError::BowGrip =>
            "bow must be the only carried item, in the right hand, with the two-handed grip enabled",
        sim::CombatSpecError::GripConflict =>
            "those two items cannot be held at once -- two shields, or a two-handed grip on a \
             shield, are the usual ways to ask for it",
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
        // The same matchup `articulated` resolves, so that a corpus row and the
        // trace a reader opens to look at it are the same fight. A trace is the
        // one place an asymmetric fight was already watchable -- through
        // `--policy learned --opponent` -- and this is that door widened to the
        // scripts rather than a second one cut beside it.
        let matchup = matchup_from(args).unwrap_or_else(|sentence| {
            eprintln!("{sentence}");
            std::process::exit(2);
        });
        hero_policy = matchup.heroes.policy();
        monster_policy = matchup.monsters.policy();
        hero_token = matchup.heroes.token().to_string();
        monster_token = matchup.monsters.token().to_string();
        headline = matchup.name();
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
            command_digest: script_digest(&stream)
                .expect("an articulated run stores articulated commands"),
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
                // The grip needs a full right hand and an empty left one, and
                // fighter a's shipped left hand carries the plate.
                _ if key.ends_with("-two-handed") => {
                    let side = &key[..1];
                    format!("trace --{side}-left empty --{key} on")
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
    fn a_valueless_two_handed_flag_is_refused_rather_than_running_the_fixture() {
        // The `Args::parse` trap, asserted by sentence: a bare `--a-two-handed`
        // is demoted to a flag, and the run it would silently produce is the
        // pinned fixture wearing the operator's intent.
        for line in ["trace --a-two-handed --seed 3", "trace --b-two-handed"] {
            let refusal = duel_config_from(&traced_args(line)).expect_err(line);
            assert!(refusal.contains("-two-handed"), "the refusal must name the key: {refusal}");
            assert!(refusal.contains("needs a value"), "{refusal}");
        }

        // The honoured form, bounding the refusal from the other side: the
        // Brute's right hand holds the club and its left is empty, so `on` is
        // legal, lands on that side alone, and reaches the table as `Both`.
        let config = duel_config_from(&traced_args("trace --b-two-handed on"))
            .expect("a legal line").expect("a described duel");
        assert!(config.fighters[1].two_handed, "the grip did not land");
        assert!(!config.fighters[0].two_handed, "the grip leaked across sides");
        let scenario = Scenario::duel_from(&config).expect("a legal duel");
        let club = scenario.combat_specs.as_ref().expect("a table").equipment.iter()
            .find(|row| row.action == sim::ActionKind::Club).expect("the club row");
        assert_eq!(club.binding, sim::GripBinding::Both);

        // And the two grips that cannot be honoured, refused by name.
        let empty_right = duel_config_from(
            &traced_args("trace --a-right empty --a-two-handed on"),
        ).expect_err("a grip on an empty right hand");
        assert!(empty_right.contains("--a-two-handed"), "{empty_right}");
        assert!(empty_right.contains("right hand is empty"), "{empty_right}");
        let full_left = duel_config_from(&traced_args("trace --a-two-handed on"))
            .expect_err("a grip beside a carried plate");
        assert!(full_left.contains("--a-two-handed"), "{full_left}");
        assert!(full_left.contains("left hand is full"), "{full_left}");
        // `off` is a value, not a request: the shipped arrangement stays legal.
        assert!(matches!(
            duel_config_from(&traced_args("trace --a-two-handed off")),
            Ok(Some(_))
        ));
    }

    #[test]
    fn bow_is_public_only_as_the_canonical_right_hand_two_handed_item() {
        let config = duel_config_from(&traced_args(
            "trace --a-left empty --a-right bow --a-two-handed on",
        )).expect("a legal line").expect("a described duel");
        assert_eq!(config.fighters[0].hands[0], None);
        assert_eq!(config.fighters[0].hands[1].map(|item| item.action),
                   Some(sim::ActionKind::Bow));
        assert!(config.fighters[0].two_handed);
        Scenario::duel_from(&config).expect("the public Bow configuration must install");

        for line in [
            "trace --a-left bow --a-right empty --a-two-handed on",
            "trace --a-left empty --a-right bow --a-two-handed off",
            "trace --a-right bow --a-two-handed on",
        ] {
            let refusal = duel_config_from(&traced_args(line)).expect_err(line);
            assert!(refusal.contains("bow"), "the refusal must name Bow: {refusal}");
            assert!(refusal.contains("right hand"), "{refusal}");
            assert!(refusal.contains("two-handed"), "{refusal}");
        }
    }

    #[test]
    fn an_asymmetric_matchup_runs_a_different_policy_on_each_side() {
        // **The claim is about the fight, not about the parse.** A flag that
        // resolved correctly and then installed one script on both sides anyway
        // is precisely the harness gap this exists to close, and it would pass
        // any assertion about `matchup.heroes`. So the two sides' submitted
        // command streams are compared instead: if a different policy really is
        // driving each side, they cannot agree.
        let matchup = matchup_from(&traced_args(
            "articulated --hero-policy attack-moves --monster-policy openings",
        )).expect("a legal matchup");
        assert_eq!(matchup.heroes, Script::ClosingAttacks);
        assert_eq!(matchup.monsters, Script::Openings);
        assert!(!matchup.is_symmetric());

        let scenario = Scenario::articulated_duel();
        let asymmetric = measure_articulated(&scenario, 3, matchup);
        let symmetric = measure_articulated(&scenario, 3, Script::ClosingAttacks);
        assert_ne!(
            asymmetric.digest, symmetric.digest,
            "the asymmetric matchup produced the same command stream as one script on both sides",
        );

        // And a run with neither key is exactly the symmetric one, which is what
        // lets every pinned baseline still be compared against. `--policy`'s own
        // vocabulary cannot spell `attack-moves` -- it is reached by the flag
        // that edits the composed script -- so this is the pairing that says an
        // unflagged line still resolves to one script on both sides.
        let unflagged = matchup_from(&traced_args("articulated --policy windmill"))
            .expect("a legal line");
        assert!(unflagged.is_symmetric());
        assert_eq!(
            measure_articulated(&scenario, 3, unflagged).digest,
            measure_articulated(&scenario, 3, Script::Windmill).digest,
            "an unflagged run stopped reproducing the corpus it was pinned against",
        );
    }

    #[test]
    fn a_valueless_matchup_key_is_refused_rather_than_running_one_script_on_both() {
        // The `Args::parse` trap again, and it bites harder here than on a duel
        // key: a demoted `--hero-policy` leaves a *symmetric* corpus wearing the
        // header of an asymmetric one, so the run answers a different question
        // than the operator asked and nothing in the output says so.
        for line in [
            "articulated --hero-policy --seeds 4",
            "articulated --monster-policy",
        ] {
            let refusal = matchup_from(&traced_args(line)).expect_err(line);
            assert!(refusal.contains("-policy"), "the refusal must name the key: {refusal}");
            assert!(refusal.contains("needs a value"), "{refusal}");
        }

        // A well-formed value that names no script, refused with the vocabulary
        // rather than with a number.
        let unknown = matchup_from(&traced_args("articulated --hero-policy neutral"))
            .expect_err("neutral is not a lab script");
        assert!(unknown.contains("--hero-policy"), "{unknown}");
        assert!(unknown.contains("neutral"), "{unknown}");
        assert!(unknown.contains("openings"), "the refusal must list what it takes: {unknown}");

        // The frozen competence receipt refuses both keys by name, on the same
        // ground it refuses `--policy`: a matchup is a measurement-changing
        // override however legal it is elsewhere.
        for key in MATCHUP_KEYS {
            let args = traced_args(&format!("articulated --competence-gate --{key} openings"));
            assert_eq!(competence_override(&args), Some(key));
        }

        // `--matchup a:b` is a spelling this build never had. `Args` drops an
        // unknown key silently, so without a refusal it runs symmetrically and
        // says nothing -- the same failure as the demotion above, reached by a
        // different route. Both the valued and the bare form are refused, and
        // the refusal names the keys that do exist rather than only complaining.
        for line in ["articulated --matchup openings:attack-moves", "articulated --matchup"] {
            let refusal = matchup_from(&traced_args(line)).expect_err(line);
            assert!(refusal.contains("--matchup"), "the refusal must name the key: {refusal}");
            assert!(refusal.contains("--hero-policy") && refusal.contains("--monster-policy"),
                    "the refusal must name what to use instead: {refusal}");
        }

        // And the control: a run with no matchup key at all is still the
        // symmetric one, so the refusal above cannot be firing on everything.
        assert!(matchup_from(&traced_args("articulated --seeds 4")).is_ok());
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
        assert_eq!(Some(trial.digest), script_digest(&replay.submitted_entries));
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
        assert_eq!(Some(composed.digest), script_digest(&replay.submitted_entries));
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
        // Smart134's doubled arm bearing rates moved the intentional refusal off
        // this seed. It is not gone -- across 100 mirrored seeds the windmill
        // still refuses 12 ticks and the composed script 14, every one of them
        // `EnergyNumerator` -- but seed 5 no longer reaches the degenerate group
        // on any script, so pinning `(1, EnergyNumerator)` here would now pin the
        // absence of the thing this assertion exists to describe.
        //
        // So it is pinned in two places instead of one, because the two halves
        // are different claims. Seed 5 says the ordinary case refuses nothing.
        // Seed 14 keeps an actual refusal under the assertion, and keeping one
        // is the point: the inverted gate below is only meaningful while some
        // fixture still exercises a refusal it could get wrong.
        // **2026-08-16 brought the windmill's refusal back onto seed 5.**
        // Freeing the guard bearing, and taking the plate's normal from the arm
        // that carries it, put that script back onto the degenerate two-contact
        // group Smart134 had moved it off -- one tick, `EnergyNumerator`, the
        // same law and the same count Smart102 described. So seed 5 now pins
        // both halves directly: two scripts that never reach the boundary and
        // one that reaches it exactly once. That is a stronger statement than
        // the uniform zero it replaces, and it is the shape this assertion had
        // before Smart134, not a new one.
        for script in [Script::Composed, Script::ClosingAttacks] {
            let trial = measure_articulated(&Scenario::articulated_duel(), 5, script);
            assert!(trial.contacts > 0, "{}: nothing touched", script.name());
            assert_eq!(trial.max_energy_excess, 0, "{}", script.name());
            assert_eq!(
                (trial.solver_rejections, trial.first_rejection), (0, None),
                "{}: the refusal count and its law changed independently",
                script.name()
            );
        }
        let windmill = measure_articulated(&Scenario::articulated_duel(), 5, Script::Windmill);
        assert!(windmill.contacts > 0, "windmill: nothing touched");
        assert_eq!(windmill.max_energy_excess, 0, "windmill");
        assert_eq!(
            (windmill.solver_rejections, windmill.first_rejection),
            (1, Some(sim::ResolutionError::EnergyNumerator)),
            "the windmill's intentional refusal changed count or law",
        );
        // **Seed 14 and seed 5 swapped roles on 2026-08-16.** This seed was
        // added by Smart134 because its doubled arm rates moved the intentional
        // refusal off seed 5 and something still had to exercise one. Freeing
        // the guard bearing moved a refusal back onto seed 5's windmill and off
        // this one, so the duty has returned to where Smart102 left it and this
        // seed is now the ordinary case.
        //
        // It is kept rather than deleted, because "a second seed also refuses
        // nothing" is a weaker claim than the one above but not a worthless one:
        // the pair is what says the zero is a property of the solver and not of
        // one seed. The retained-refusal half is the windmill assertion above,
        // and the inverted gate stays meaningful only while that one stands.
        let refusing = measure_articulated(&Scenario::articulated_duel(), 14, Script::Composed);
        assert_eq!(refusing.max_energy_excess, 0, "a refused tick still created energy");
        assert_eq!(
            (refusing.solver_rejections, refusing.first_rejection),
            (0, None),
            "the second ordinary seed changed count or law",
        );
    }

    /// The bound every embodied test in this module runs under.
    ///
    /// A fixture fight is 3,600 ticks and reaches its clock, so a debug build
    /// pays for the whole of it to learn something the first few hundred ticks
    /// already say. 300 is the determinism suite's own bound, chosen there for
    /// the same reason, and it is past the approach on both fixtures -- which is
    /// what these tests are about.
    const TEST_TICKS: Option<u32> = Some(300);

    #[test]
    fn the_embodied_corpus_digest_is_the_pinned_one() {
        // **The pin session 10 checks itself against.** `bench`, `verify`,
        // `hash`, `duel` and `evolve` are Legacy-only and `articulated` drives a
        // model that session deletes, so without this number the day the older
        // pins go is a day nothing in the repository would notice an embodied
        // fight changing.
        assert_eq!(
            embodied_corpus_digest(),
            EMBODIED_CORPUS_DIGEST,
            "the embodied corpus moved; see its row in docs/reference/hashes.md",
        );

        // And the corpus is the two registered fixtures and their reflections,
        // in the order the fold writes them. Without this the constant above
        // could be re-recorded over a corpus that had quietly stopped containing
        // the sculpted fixture -- which is the half that reads `ground_z` at
        // all, and therefore the half a flat-only corpus cannot miss noticing
        // the loss of.
        let arenas = embodied_corpus_arenas();
        let names: Vec<&str> = arenas.iter().map(|arena| arena.name.as_str()).collect();
        assert_eq!(
            names,
            ["embodied-duel-v1", "embodied-duel-v1", "embodied-slope-v1", "embodied-slope-v1"],
        );
        assert_eq!(arenas[0].fingerprint(), 0x1a1e_8e74_eecd_55d5);
        assert_eq!(arenas[2].fingerprint(), 0xf49d_e9a6_1f93_9163);
        // A mirror is a different scenario and must never wear the pin.
        assert_ne!(arenas[1].fingerprint(), arenas[0].fingerprint());
        assert_ne!(arenas[3].fingerprint(), arenas[2].fingerprint());
    }

    #[test]
    fn an_embodied_run_is_identical_on_re_run_and_exact_on_replay() {
        // The claim `lab verify --embodied` makes, on the function that makes
        // it. `crates/sim/tests/determinism.rs` holds the same property under a
        // hand-written script; what this adds is the policy a corpus is measured
        // with, whose commands are a function of the observation -- and the
        // sculpted fixture, whose floor is the only thing in the repository that
        // reaches a state hash through `Dungeon::digest`'s `sculpted` arm.
        for scenario in embodied_corpus_arenas() {
            let verdict = verify_one_embodied(
                &scenario,
                3,
                EmbodiedMatchup::symmetric(EmbodiedPolicyKind::Scripted),
                TEST_TICKS,
            );
            let (ticks, _, state) = verdict.unwrap_or_else(|sentence| {
                panic!("{}: {sentence}", scenario.name);
            });
            assert_eq!(ticks, 300, "{}", scenario.name);
            assert_eq!(state.domain, sim::HashDomain::EmbodiedV1, "{}", scenario.name);
        }
    }

    #[test]
    fn the_ground_term_is_inert_on_the_flat_fixture_and_not_on_the_sculpted_one() {
        // **The property the whole high-ground measurement rests on.** If the
        // two configurations were different policies rather than one policy with
        // a term switched off, a difference measured on the hill would say
        // nothing about elevation. `policy`'s own
        // `the_two_configurations_agree_on_flat_ground` asserts the first half
        // against the observation; this asserts it through the corpus loop the
        // measurement actually runs, which is where a difference would have to
        // appear to matter.
        let seeking = EmbodiedMatchup::symmetric(EmbodiedPolicyKind::Scripted);
        let level = EmbodiedMatchup::symmetric(EmbodiedPolicyKind::ScriptedLevel);

        let flat = Scenario::embodied_duel();
        let a = measure_embodied(&flat, 3, seeking, TEST_TICKS);
        let b = measure_embodied(&flat, 3, level, TEST_TICKS);
        assert_eq!(a.state.compare(b.state), Ok(true), "the term moved a flat fight");
        assert_eq!(a.digest, b.digest, "the term moved a flat command stream");

        // And it is not inert everywhere, or the assertion above would be
        // satisfied by a term that had been deleted.
        let slope = Scenario::embodied_slope();
        let up = measure_embodied(&slope, 3, seeking, TEST_TICKS);
        let flatly = measure_embodied(&slope, 3, level, TEST_TICKS);
        assert_eq!(
            up.state.compare(flatly.state),
            Ok(false),
            "the term changed nothing on a hill",
        );
        assert_ne!(up.digest, flatly.digest, "the term commanded nothing different on a hill");
    }

    #[test]
    fn an_asymmetric_embodied_matchup_runs_a_different_policy_on_each_side() {
        // The claim is about the fight and not about the parse, on
        // `an_asymmetric_matchup_runs_a_different_policy_on_each_side`'s
        // reasoning: a flag that resolved correctly and then installed one
        // policy on both sides anyway would pass every assertion about
        // `matchup.heroes`.
        let matchup = embodied_matchup_from(&traced_args(
            "embodied --hero-policy scripted --monster-policy scripted-level",
        ))
        .expect("a legal matchup");
        assert_eq!(matchup.heroes, EmbodiedPolicyKind::Scripted);
        assert_eq!(matchup.monsters, EmbodiedPolicyKind::ScriptedLevel);
        assert!(!matchup.is_symmetric());

        // On the sculpted fixture, because that is the only place the two
        // configurations are different policies at all -- on the flat one this
        // assertion would be false and the feature would still work.
        let slope = Scenario::embodied_slope();
        let asymmetric = measure_embodied(&slope, 3, matchup, TEST_TICKS);
        let symmetric = measure_embodied(&slope, 3, EmbodiedPolicyKind::Scripted, TEST_TICKS);
        assert_ne!(
            asymmetric.digest, symmetric.digest,
            "the asymmetric matchup produced the same command stream as one policy on both sides",
        );

        // And an unflagged run is the symmetric scripted one, which is what the
        // registered corpus is measured under.
        let unflagged = embodied_matchup_from(&traced_args("embodied --seeds 4"))
            .expect("a legal line");
        assert!(unflagged.is_symmetric());
        assert_eq!(unflagged.heroes, EmbodiedPolicyKind::Scripted);
    }

    #[test]
    fn a_valueless_embodied_policy_key_is_refused_rather_than_running_the_default() {
        // The `Args::parse` demotion, three times over. `--policy` is on the
        // list because it sets *both* sides: a demoted one leaves the corpus
        // running the default script under a header the operator reads as their
        // own choice, which is the same failure as the two asymmetric keys and
        // is reached the same way.
        for line in [
            "embodied --policy --seeds 4",
            "embodied --hero-policy --seeds 4",
            "embodied --monster-policy",
        ] {
            let refusal = embodied_matchup_from(&traced_args(line)).expect_err(line);
            assert!(refusal.contains("-policy"), "the refusal must name the key: {refusal}");
            assert!(refusal.contains("needs a value"), "{refusal}");
        }

        // A well-formed value naming no policy, refused with the vocabulary --
        // and the vocabulary is `EmbodiedPolicyKind`'s own, so a policy added
        // there appears here without this file being edited.
        let unknown = embodied_matchup_from(&traced_args("embodied --policy composed"))
            .expect_err("composed is an articulated script");
        assert!(unknown.contains("composed"), "{unknown}");
        for kind in EmbodiedPolicyKind::ALL {
            assert!(unknown.contains(kind.name()), "the refusal must list {}: {unknown}", kind.name());
        }

        // `--matchup a:b` is a spelling this build never had, refused here by
        // the same shared helper that refuses it for the articulated corpus.
        let matchup = embodied_matchup_from(&traced_args("embodied --matchup scripted:neutral"))
            .expect_err("a spelling this build does not have");
        assert!(matchup.contains("--matchup"), "{matchup}");
        assert!(matchup.contains("--hero-policy"), "{matchup}");

        // And the control: every legal spelling still resolves.
        for kind in EmbodiedPolicyKind::ALL {
            let line = format!("embodied --policy {}", kind.name());
            assert_eq!(
                embodied_matchup_from(&traced_args(&line)),
                Ok(EmbodiedMatchup::symmetric(kind)),
                "{line}",
            );
        }
    }

    #[test]
    fn the_frozen_embodied_modes_refuse_every_measurement_changing_override() {
        // `competence_override`'s rule, and its reason: a command line that
        // looks like the pin corpus must never quietly measure a different one.
        for (key, value) in [
            ("seeds", Some("8")), ("threads", Some("1")), ("seed-zero-only", None),
            ("mirrored", None), ("slope", None), ("policy", Some("neutral")),
            ("hero-policy", Some("scripted")), ("monster-policy", Some("neutral")),
            ("ticks", Some("600")),
        ] {
            for mode in ["corpus-digest", "high-ground"] {
                let mut tokens =
                    vec!["embodied".to_string(), format!("--{mode}"), format!("--{key}")];
                if let Some(value) = value {
                    tokens.push(value.to_string());
                }
                let args = Args::parse(tokens);
                assert_eq!(embodied_override(&args), Some(key), "--{mode} --{key}");
            }
        }
        for mode in ["corpus-digest", "high-ground"] {
            let frozen = Args::parse(vec!["embodied".into(), format!("--{mode}")]);
            assert_eq!(embodied_override(&frozen), None, "--{mode}");
        }
    }

    #[test]
    fn embodied_results_do_not_depend_on_the_thread_that_computed_them() {
        // The same claim `articulated_trials` makes, and it is worth making
        // again rather than inherited: `ScriptedEmbodiedPolicy` carries a row of
        // per-run ground memory, so a chunking that reused an instance across
        // seeds would carry one seed's hill into the next -- and the symptom
        // would be a corpus that depended on the thread count.
        let scenario = Scenario::embodied_slope();
        let seeds: Vec<u64> = (0..4).collect();
        let one: Vec<u64> =
            embodied_trials(&scenario, &seeds, 1, EmbodiedPolicyKind::Scripted, TEST_TICKS)
                .iter()
                .map(|t| t.digest)
                .collect();
        let many: Vec<u64> =
            embodied_trials(&scenario, &seeds, 4, EmbodiedPolicyKind::Scripted, TEST_TICKS)
                .iter()
                .map(|t| t.digest)
                .collect();
        assert_eq!(one, many);
    }
}
