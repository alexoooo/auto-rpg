//! v2-19's learning probe: train one small network, then decide whether it
//! earned a roadmap.
//!
//! This is the edge `crates/learn` was written for and did not have. The crate
//! holds the network, the checkpoint and the population; this file holds the
//! command line, the held-out corpus, and the comparison the `expand` / `revise`
//! / `stop` decision is made on.
//!
//! # The gate v2-19 wrote down was passable by a constant
//!
//! The session file asks for a 5% improvement over the scripted baseline with a
//! confidence interval excluding zero. Measured over 400 mirrored trials of the
//! *articulated* corpus against the composed script, the three scripts that
//! existed then scored 64.953 (composed), 75.728 (attack-moves) and 82.225
//! (windmill) -- and **a network with every weight at zero scored about 76.**
//! Argmax over a zeroed head picks index zero, so that network is the constant
//! "advance, weapon low, straight down the line, chamber, guard low", and it
//! beat the composed script by fifteen percent without having learned anything
//! at all. A gate measured against the weakest of four available fighters is a
//! gate a constant passes, and a headline of the form "learning beats the
//! script" off it would be measuring the script's weakness.
//!
//! So the bar this file implements is **beating the best non-learned condition**
//! -- all of them run, on the same held-out seeds, against the same opponent --
//! by five percent, with a *paired* bootstrap interval on the difference
//! excluding zero. Paired because every condition fights the same seed in the
//! same orientation, and the paired interval is both tighter and the honest one
//! for that design.
//!
//! **The four numbers in the paragraph above are history.** Session 05 deleted
//! the articulated model, its corpus and two of those three scripts; nothing in
//! this file can reproduce them and they are kept because the *argument* they
//! bought -- do not measure against one hand-picked baseline -- outlived the
//! measurement. The conditions this command runs now are the surviving registry
//! entries plus the zeroed network, and what they score is whatever the next run
//! of `learn-probe evaluate` prints. `docs/performance/v2-learning-probe.md`
//! records the last full table and is marked historical for the same reason.
//!
//! **The zeroed network is reported as "constant" and never as "the null
//! model".** Which constant it is falls out of the order of the entries in each
//! action head, and that order is arbitrary -- append-only, but arbitrary. A
//! reader who took the floor to be principled would draw a conclusion from it
//! that the number cannot support.
//!
//! # Two opponents, because a fixed script can be beaten by reading its clock
//!
//! `scripted_embodied_command` reads three clocks straight off `obs.tick`: four
//! phases on `tick % 120`, two height selectors on `tick / 90 % 3`, and the cut
//! direction on `tick / 120 % 2`. Features 1 and 2 of the learned policy's input
//! slice are the cosine and sine of `tick % 360`, put there deliberately, and
//! 360 is a multiple of 120 -- so the phase is still exactly readable from the
//! input while the two 270-tick height clocks are not. A policy that learns the
//! opponent's timetable and a policy that learns to fight produce the same mean
//! return, and only one of them is worth a roadmap. So every condition is scored
//! twice: against the frozen policy, and against [`learn::PhaseShiftedScript`],
//! which is the same policy with a per-run constant tick offset drawn from the
//! run seed. **If the learned edge collapses against the second, that is the
//! finding**, and this command says so in the verdict rather than leaving it to
//! a reader.
//!
//! **Three of the five registry entries cannot be that second opponent, and the
//! run is refused rather than doubled.** `neutral` reads no clock and both
//! planners read one only as the interval between two of their own
//! observations, so the wrapper is the identity for all three: the control
//! board comes back byte-identical to the frozen board, the verdict prices the
//! difference between a fight and itself, and it costs twice the wall clock to
//! print. `EmbodiedPolicyKind::reads_the_clock` is where the registry answers
//! the question and [`evaluate_opponents`] is where the answer becomes a
//! sentence. `--frozen-only` scores such an opponent with no control at all,
//! which is the honest version of what the doubled run was doing.

use crate::args::Args;
use learn::{
    band, held_out_seeds, training_seeds, Band, Checkpoint, Corpus, LearnedEmbodiedPolicy,
    Mechanics, Model, Opponent, ProbeConfig, Recorders, Rollout,
};
use policy::{EmbodiedPolicy, EmbodiedPolicyKind};
use sim::{BodyPart, ContactKind, Faction, Outcome, Replay, Scenario};
use std::path::PathBuf;
use std::time::Instant;

/// What `--opponent` accepts: the embodied registry, spelled exactly as
/// `EmbodiedPolicyKind::name` spells it and therefore exactly as
/// `lab embodied --policy` spells it.
///
/// **Built from `EmbodiedPolicyKind::ALL` rather than written out**, which is
/// the whole reason this file stopped carrying its own three-entry list of
/// baselines: a registry entry appended in `crates/policy` becomes selectable
/// here without an edit, and a table of names kept beside a registry is a table
/// that goes stale the first time somebody adds to it. `Args::choice` refuses an
/// unknown string by name and lists these, so the refusal stays legible.
///
/// **What widening this from three baselines to the whole registry cost was one
/// unasked question**, and the answer belongs on the registry rather than here:
/// the three entries it replaced all read `obs.tick`, so the phase-randomised
/// control worked for every one of them and nothing had to check. Only two of
/// the five it selects now do. `EmbodiedPolicyKind::reads_the_clock` makes an
/// appended entry answer that question before it can be selected, and
/// [`opponent_from`] turns a wrong answer into a refusal instead of a
/// duplicated board.
fn opponent_kinds() -> Vec<(&'static str, EmbodiedPolicyKind)> {
    EmbodiedPolicyKind::ALL.iter().map(|&k| (k.name(), k)).collect()
}

/// The one named spec v2-19's command line asks for, and its settings.
///
/// A name rather than eight remembered numbers, because "the v2-19 run" has to
/// mean one thing across a training command, an evaluation command and a plan
/// that quotes both. Every field is still an individual flag; `--spec` chooses
/// the defaults and an explicit flag overrides one.
const SPEC: &str = "v2-probe";
/// Sized to a wall-clock budget rather than to convergence, and the difference
/// matters when the checkpoint is read: measured on this host a full-length
/// articulated fight is about 0.75 core-seconds, so 120 x 32 x 16 trials is
/// roughly 61,000 fights and forty minutes on twenty threads. A run that stops
/// on a budget can stop while still climbing, and a report quoting it has to say
/// which of the two happened.
const SPEC_GENERATIONS: u32 = 120;
const SPEC_POPULATION: usize = 32;
const SPEC_ELITE: usize = 8;
/// Six seeds, mirrored: twelve trials per candidate.
///
/// **A noise-against-generations trade made against the clock and not against a
/// theory.** A trial is about 2.8 core-seconds, so twelve of them across
/// twenty-four fresh candidates is roughly forty seconds a generation, and the
/// budget below buys somewhere near seventy generations of a `(mu + lambda)`
/// strategy in 3,858 dimensions -- which is already few. Halving the trials
/// would double the generations and roughly multiply the per-candidate standard
/// error by 1.4; doubling them would buy a cleaner ranking of a population that
/// barely moves. Six is the middle, and the held-out corpus is what says whether
/// twelve trials was enough to rank on.
const SPEC_SEEDS: usize = 6;
const SPEC_SIGMA_PCT: u32 = 8;
const SPEC_MASTER_SEED: u64 = 20_260_811;
const SPEC_CHECKPOINT: &str = "checkpoints/v2-probe.ckpt";

/// Held-out **trials**, not seeds: 200 seeds in two orientations.
///
/// v2-19 says "400 mirrored held-out seeds" and the phrase is ambiguous between
/// 400 seeds mirrored and 400 mirrored trials. Read as trials, which is what
/// `crates/learn`'s discrimination measurement already used -- so the standard
/// errors this command prints are directly comparable with the ones already
/// recorded in the plan, and a reader is not silently comparing an `n` of 400
/// with an `n` of 800.
const HELD_OUT_SEEDS: usize = 200;

fn default_threads() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
}

pub fn learn_probe(args: &Args) {
    match args.subcommand() {
        "train" if tactical_v2(args) => train_tactical_v2(args),
        "train" => train(args),
        "evaluate" if tactical_v2(args) => evaluate_tactical_v2(args),
        "evaluate" => evaluate(args),
        other => {
            if !other.is_empty() {
                eprintln!("unknown learn-probe arm '{other}'");
            }
            eprintln!(
                "usage: learn-probe train|evaluate  (see `lab help` for the flags)"
            );
            std::process::exit(2);
        }
    }
}

fn tactical_v2(args: &Args) -> bool {
    match args.text("action-layout") {
        None => false,
        Some("tactical-v2") => true,
        Some(other) => {
            eprintln!("--action-layout expects tactical-v2, got '{other}'");
            std::process::exit(2);
        }
    }
}

/// `--spec` names a preset and there is exactly one, so a typo is an exit.
fn check_spec(args: &Args) {
    if let Some(spec) = args.text("spec") {
        if spec != SPEC {
            eprintln!("--spec expects {SPEC}, got '{spec}'");
            std::process::exit(2);
        }
    }
}

/// The opponent the candidate is measured against, script and clock together,
/// or the sentence the run should be refused with.
///
/// Returned rather than printed-and-exited, on `embodied_matchup_from`'s
/// discipline and for AGENTS.md's reason: a refusal a test cannot read is half
/// the rule, and it is the half that has already shipped ten instances of this
/// bug. `a_phase_shift_is_refused_by_name_for_an_opponent_with_no_clock` reads
/// the sentence.
pub fn opponent_from(args: &Args) -> Result<Opponent, String> {
    // `Scripted` and **not** the registry's own default, which is `Neutral` -- a
    // body that stands there with its arms slack. A corpus fought against a
    // statue is a full table of finite numbers about nothing.
    //
    // **It is a default and not a guard**, which is the correction this comment
    // used to get wrong: it claimed the command was "written to refuse rather
    // than to print" a fight against a statue, and `--opponent neutral` printed
    // exactly that. Nothing here refuses a weak opponent and nothing should --
    // a control condition is a legitimate thing to score against. What is
    // refused below is narrower and is a real impossibility: asking for a
    // phase-randomised opponent that has no phase to randomise.
    let kind = args.choice("opponent", EmbodiedPolicyKind::Scripted, &opponent_kinds());
    if args.flag("phase-random") {
        if !kind.reads_the_clock() {
            return Err(phase_refusal(
                kind,
                "--phase-random asks for an opponent whose clock starts somewhere the \
                 candidate cannot know",
            ));
        }
        return Ok(Opponent::randomised(kind));
    }
    Ok(Opponent::frozen(kind))
}

/// Why a phase-shifted opponent of this kind would not be one, as a sentence.
///
/// One wording behind both callers, because the two inputs that reach it --
/// `--phase-random` on `train` and the control board `evaluate` scores by
/// default -- are the same impossibility and a reader who saw two different
/// explanations would go looking for two different bugs.
fn phase_refusal(kind: EmbodiedPolicyKind, asked: &str) -> String {
    let clocked: Vec<&str> = EmbodiedPolicyKind::ALL
        .iter()
        .filter(|kind| kind.reads_the_clock())
        .map(|kind| kind.name())
        .collect();
    format!(
        "{asked}, and {} has no clock to start: its behaviour does not depend on the \
         tick it is handed, so the phase-shifted wrapper is the identity and the control \
         would be a second copy of the frozen run scored at twice the cost. Name {} \
         with --opponent, or drop the control.",
        kind.name(),
        clocked.join(" or "),
    )
}

/// The boards `evaluate` scores, or the sentence the run should be refused with.
///
/// **The phase-randomised board is not behind a flag**, which is why this
/// refusal exists at all and why `opponent_from`'s is not enough: `evaluate`
/// runs the control on every condition unless told `--frozen-only`, so an
/// opponent that cannot honour it turns the second board into a duplicate of
/// the first without anybody having typed `--phase-random`. That is what
/// `--opponent neutral` and `--opponent tactical` did -- two byte-identical
/// boards, the second labelled the control, and a verdict computed over a
/// structural zero.
fn evaluate_opponents(args: &Args) -> Result<Vec<Opponent>, String> {
    let frozen = opponent_from(args)?;
    if args.flag("frozen-only") {
        // `--frozen-only --phase-random` is the one pair that reaches here
        // asking for both a control and no control. Refused rather than
        // resolved by precedence, on `embodied`'s rule for two frozen
        // measurements on one line: the operator gets a number either way and
        // it is the other request's.
        if frozen.phase_randomised {
            return Err(
                "--frozen-only scores no control and --phase-random asks for one: name one"
                    .to_string(),
            );
        }
        return Ok(vec![Opponent::frozen(frozen.kind)]);
    }
    if !frozen.kind.reads_the_clock() {
        return Err(phase_refusal(
            frozen.kind,
            "learn-probe evaluate scores every condition against the phase-randomised \
             control as well as the frozen opponent",
        ));
    }
    Ok(vec![
        Opponent::frozen(frozen.kind),
        Opponent::randomised(frozen.kind),
    ])
}

/// A refusal on the way out of one of this command's arms.
///
/// The sentences are returned so that a test can read them, and something still
/// has to print one and stop -- this is that something, in one place rather
/// than at each of the four arms. Exit 2 is `lab`'s code for "the command line
/// asked for a thing it cannot have", which every refusal reaching here is.
fn refuse(sentence: String) -> ! {
    eprintln!("{sentence}");
    std::process::exit(2);
}

/// An opponent as a sentence, for a headline rather than a table column.
pub fn opponent_prose(opponent: Opponent) -> String {
    let policy = match opponent.kind {
        EmbodiedPolicyKind::Neutral => "a body with its arms slack",
        EmbodiedPolicyKind::Scripted => "the scripted body",
        EmbodiedPolicyKind::ScriptedLevel => "the scripted body with the elevation term off",
        EmbodiedPolicyKind::Tactical => "the strike planner",
        EmbodiedPolicyKind::TacticalFixedGuard => "the strike planner with a fixed guard",
    };
    if opponent.phase_randomised {
        format!("{policy} started at a per-run phase")
    } else {
        policy.to_string()
    }
}

/// Where `evaluate` and `trace` read a checkpoint from.
fn checkpoint_path(args: &Args) -> PathBuf {
    PathBuf::from(args.text("checkpoint").unwrap_or(SPEC_CHECKPOINT))
}

/// Where `train` writes one.
///
/// **`--out` first and `--checkpoint` behind it**, so that the two commands
/// share a flag when somebody wants them to and the writing one keeps the name
/// every other writing command in this lab uses. Reading the wrong one of these
/// is not a crash: it is a training run that silently overwrites the checkpoint
/// somebody is in the middle of evaluating, which is how this was first written
/// and what `--out checkpoints/smoke.ckpt` writing to `checkpoints/v2-probe.ckpt`
/// looked like from the outside.
fn output_path(args: &Args) -> PathBuf {
    PathBuf::from(
        args.text("out")
            .or_else(|| args.text("checkpoint"))
            .unwrap_or(SPEC_CHECKPOINT),
    )
}

/// Reads a checkpoint or exits, printing what the reader refused and why.
///
/// **Exit rather than fall back to the scripted policy**, and the distinction is
/// worth stating because v2-19 names
/// `a_failed_or_nan_evaluator_falls_back_to_the_scripted_policy` as one of its
/// tests. That fallback belongs to *inference inside a fight*, where a policy
/// that cannot answer must still produce a legal command -- and
/// `crates/learn`'s checkpoint reader makes it unreachable by refusing a NaN
/// weight at load, which is the earlier and better place. What a **measurement**
/// must never do is quietly substitute one condition for another: a comparison
/// that silently scored the composed script in the learned row would report a
/// dead heat and be believed.
pub fn load_checkpoint(args: &Args) -> Checkpoint {
    let path = checkpoint_path(args);
    match Checkpoint::read(&path) {
        Err(error) => {
            eprintln!("could not read {}: {error}", path.display());
            eprintln!("train one first: cargo run --release -p lab -- learn-probe train --spec {SPEC}");
            std::process::exit(1);
        }
        Ok(Err(refusal)) => {
            eprintln!("{} is not a checkpoint this build can use: {refusal}", path.display());
            std::process::exit(1);
        }
        Ok(Ok(checkpoint)) => checkpoint,
    }
}

// ------------------------------------------------------------------- training

fn train(args: &Args) {
    check_spec(args);
    let config = ProbeConfig {
        generations: args.u32("gens", SPEC_GENERATIONS),
        population: args.usize("pop", SPEC_POPULATION).max(2),
        elite: args.usize("elite", SPEC_ELITE),
        seeds: training_seeds(args.usize("seeds", SPEC_SEEDS).max(1)),
        // Mirrored unless told otherwise, which is the opposite default from
        // `embodied`. There the mirror is a second measurement; here it is
        // the only evidence a candidate is not overfitting to one orientation,
        // and a training run that skipped it would produce a checkpoint whose
        // held-out number nobody could interpret.
        mirrored: !args.flag("plain"),
        // Percent, because the parser speaks integers and `--sigma 0.08` would
        // be a lie. The retired `evolve`'s convention, kept.
        sigma: args.u32("sigma-pct", SPEC_SIGMA_PCT) as f32 / 100.0,
        threads: args.usize("threads", default_threads()),
        master_seed: args.number("master-seed", SPEC_MASTER_SEED),
        max_ticks: match args.u32("ticks", 0) {
            0 => None,
            ticks => Some(ticks),
        },
        opponent: opponent_from(args).unwrap_or_else(|sentence| refuse(sentence)),
        verbose: !args.flag("quiet"),
    };
    let path = output_path(args);
    let corpus = Corpus::new(config.mirrored);

    println!(
        "training {} candidates for {} generations, elite {}, sigma {:.3}",
        config.population, config.generations, config.elite, config.sigma
    );
    println!(
        "  {} trials per candidate ({} seed{} x {} orientation{}), {} ticks each",
        corpus.trials(&config.seeds),
        config.seeds.len(),
        if config.seeds.len() == 1 { "" } else { "s" },
        corpus.scenarios().len(),
        if corpus.scenarios().len() == 1 { "" } else { "s" },
        match config.max_ticks {
            None => "up to 3600".to_string(),
            Some(ticks) => format!("up to {ticks}"),
        },
    );
    println!("  opponent {}", opponent_prose(config.opponent));
    println!(
        "  {} threads, master seed {}, training seeds {}..{}\n",
        config.threads,
        config.master_seed,
        config.seeds.first().copied().unwrap_or(0),
        config.seeds.last().copied().unwrap_or(0) + 1,
    );

    if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
        if let Err(error) = std::fs::create_dir_all(parent) {
            eprintln!("could not create {}: {error}", parent.display());
            std::process::exit(1);
        }
    }

    // A wall-clock cap rather than a generation count chosen by arithmetic,
    // because the arithmetic is wrong in a direction that matters: a fight gets
    // slower as the population learns to engage, so the per-generation cost that
    // sizes a run at the start is an underestimate by the end. A budget stops
    // where it stops and the checkpoint records how far it got.
    let budget = std::time::Duration::from_secs(args.number("budget-seconds", 45 * 60));
    let started = Instant::now();
    let mut stopped_early = false;
    let checkpoint = learn::train_with(&config, &mut |generation, best| {
        // Written every generation. It is fifteen kilobytes and a rename, and
        // the alternative is that a forty-minute run interrupted at generation
        // ninety produced nothing at all.
        if let Err(error) = best.write_atomically(&path) {
            eprintln!("could not write {}: {error}", path.display());
            std::process::exit(1);
        }
        let spent = started.elapsed();
        if config.verbose {
            println!(
                "         {:>6.1}s spent, {:.1}s per generation, {} of {} done",
                spent.as_secs_f64(),
                spent.as_secs_f64() / generation.max(1) as f64,
                generation,
                config.generations,
            );
        }
        stopped_early = spent >= budget && generation < config.generations;
        !stopped_early
    });
    let elapsed = started.elapsed();

    if let Err(error) = checkpoint.write_atomically(&path) {
        eprintln!("could not write {}: {error}", path.display());
        std::process::exit(1);
    }

    println!("\ntrained in {:.1}s", elapsed.as_secs_f64());
    println!(
        "  {} of {} generations{}",
        checkpoint.training.generations,
        config.generations,
        if stopped_early {
            " -- the budget stopped it, so this checkpoint may still have been climbing"
        } else {
            ""
        },
    );
    println!("  best training return {:.3}", checkpoint.training.training_return);
    println!("  wrote {} ({})", path.display(), checkpoint.digest());
    println!(
        "\nevaluate it:\n  cargo run --release -p lab -- learn-probe evaluate --checkpoint {}",
        path.display()
    );
    println!(
        "watch it:\n  cargo run --release -p lab -- trace --policy learned --checkpoint {} --seed 3",
        path.display()
    );
}

/// The session-07 path is opt-in until session 08 has trained and promoted an
/// artifact. It deliberately writes only `CheckpointV2`; the default path and
/// its checkpoint bytes remain V1.
fn train_tactical_v2(args: &Args) {
    check_spec(args);
    let config = ProbeConfig {
        generations: args.u32("gens", SPEC_GENERATIONS),
        population: args.usize("pop", SPEC_POPULATION).max(2),
        elite: args.usize("elite", SPEC_ELITE),
        seeds: training_seeds(args.usize("seeds", SPEC_SEEDS).max(1)),
        mirrored: !args.flag("plain"),
        sigma: args.u32("sigma-pct", SPEC_SIGMA_PCT) as f32 / 100.0,
        threads: args.usize("threads", default_threads()),
        master_seed: args.number("master-seed", SPEC_MASTER_SEED),
        max_ticks: match args.u32("ticks", 0) { 0 => None, ticks => Some(ticks) },
        opponent: opponent_from(args).unwrap_or_else(|sentence| refuse(sentence)),
        verbose: !args.flag("quiet"),
    };
    let path = output_path(args);
    if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
        if let Err(error) = std::fs::create_dir_all(parent) {
            eprintln!("could not create {}: {error}", parent.display()); std::process::exit(1);
        }
    }
    println!("learn-probe train --action-layout tactical-v2");
    println!("  {}x64x{} model, {} candidates, {} generations",
        learn::LEARN_V2_FEATURE_COUNT, learn::LEARN_V2_ACTION_LOGITS,
        config.population, config.generations);
    let budget = std::time::Duration::from_secs(args.number("budget-seconds", 45 * 60));
    let started = Instant::now();
    let checkpoint = learn::train_with_v2(&config, &mut |generation, best| {
        if let Err(error) = best.write_atomically(&path) {
            eprintln!("could not write {}: {error}", path.display()); std::process::exit(1);
        }
        started.elapsed() < budget || generation >= config.generations
    });
    if let Err(error) = checkpoint.write_atomically(&path) {
        eprintln!("could not write {}: {error}", path.display()); std::process::exit(1);
    }
    println!("  wrote {} ({})", path.display(), checkpoint.digest());
    println!("  tactical V2 remains native-only and is not the shipped browser checkpoint");
}

fn load_checkpoint_v2(args: &Args) -> learn::CheckpointV2 {
    let path = checkpoint_path(args);
    match learn::CheckpointV2::read(&path) {
        Err(error) => { eprintln!("could not read {}: {error}", path.display()); std::process::exit(1); }
        Ok(Err(refusal)) => { eprintln!("{} is not a tactical V2 checkpoint: {refusal}", path.display()); std::process::exit(1); }
        Ok(Ok(checkpoint)) => checkpoint,
    }
}

fn evaluate_tactical_v2(args: &Args) {
    check_spec(args);
    let checkpoint = load_checkpoint_v2(args);
    let seeds = held_out_seeds(args.usize("seeds", HELD_OUT_SEEDS).max(1));
    let config = ProbeConfig {
        generations: 0, population: 1, elite: 1, seeds,
        mirrored: !args.flag("plain"), sigma: 0.0,
        threads: args.usize("threads", default_threads()), master_seed: SPEC_MASTER_SEED,
        max_ticks: match args.u32("ticks", 0) { 0 => None, ticks => Some(ticks) },
        opponent: opponent_from(args).unwrap_or_else(|sentence| refuse(sentence)),
        verbose: false,
    };
    let corpus = Corpus::new(config.mirrored);
    let score = learn::score_v2(&checkpoint.model, &corpus, &config);
    println!("learn-probe evaluate --action-layout tactical-v2");
    println!("  checkpoint  {}", checkpoint_path(args).display());
    println!("              sha256 {}", checkpoint.digest());
    println!("  held out    {} tactical trials", corpus.trials(&config.seeds));
    println!("  mean return {score:.3}");
    println!("  promotion is session 08 work; the browser and unsuffixed runtime remain V1");
}

// ----------------------------------------------------------------- evaluation

/// The five things that can be on the Fighter.
///
/// **Five and not two.** v2-19 compares "learned" with "scripted" and the plan's
/// own measurement showed that is not one comparison but four: on the deleted
/// articulated corpus the three scripts were seventeen points apart and a
/// constant network sat in the middle of them. A table with two rows in it
/// cannot say which of those a learned policy actually beat.
///
/// **Five again after session 05, and it is not the same five.** `Composed`,
/// `AttackMoves` and `Windmill` were articulated scripts and all three are gone;
/// `policy::EmbodiedPolicyKind` has no windmill and no closing-attack entry, and
/// inventing one would be shipping a policy out of a deletion session. What
/// replaced them is the three surviving registry entries that are distinct
/// fighters on `embodied-duel-v1`. **Two of the registry's five are deliberately
/// not rows**: `Neutral` never commands a weapon height, so it cannot be a row
/// in a table about aiming and would only widen the gap the bar is measured
/// across; and `ScriptedLevel` is byte for byte `Scripted` on a flat fixture,
/// which this one is, so a row for it would print the same fighter twice.
/// `every_registry_entry_names_itself_and_fights_this_corpus` in `crates/learn`
/// asserts that identity rather than assuming it, so the day this corpus grows a
/// hill the omission fails there.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Condition {
    /// A network of zeros. Argmax ties to the lowest index in every head, so it
    /// is the fixed command "advance, weapon LOW, straight down the line,
    /// chamber, guard LOW" -- **an arbitrary constant and not a principled
    /// floor**, because which constant it is falls out of the order of the
    /// entries in each head.
    Constant,
    Scripted,
    Tactical,
    TacticalFixedGuard,
    Learned,
}

impl Condition {
    /// Learned last, so a reader meets the four things it has to beat first.
    const ALL: [Condition; 5] = [
        Condition::Constant,
        Condition::Scripted,
        Condition::Tactical,
        Condition::TacticalFixedGuard,
        Condition::Learned,
    ];

    /// The registry entry behind this row, or `None` for the two that are
    /// networks. Named rather than matched twice, so the name and the policy
    /// cannot disagree about which fighter a row is.
    fn kind(self) -> Option<EmbodiedPolicyKind> {
        match self {
            Condition::Scripted => Some(EmbodiedPolicyKind::Scripted),
            Condition::Tactical => Some(EmbodiedPolicyKind::Tactical),
            Condition::TacticalFixedGuard => Some(EmbodiedPolicyKind::TacticalFixedGuard),
            Condition::Constant | Condition::Learned => None,
        }
    }

    /// A registry row is named by the registry, so a table column and a
    /// `--policy` string cannot disagree about which fighter a number is about.
    /// The two network rows name themselves, and they are spelled out rather
    /// than caught by a wildcard: a variant appended here would otherwise be
    /// silently labelled `learned` and land in the row the comparison is drawn
    /// against.
    fn name(self) -> &'static str {
        match self {
            Condition::Constant => "constant",
            Condition::Learned => "learned",
            Condition::Scripted | Condition::Tactical | Condition::TacticalFixedGuard => {
                self.kind().expect("a registry row names a kind").name()
            }
        }
    }

    fn policy(self, model: &Model) -> Box<dyn EmbodiedPolicy> {
        match self {
            Condition::Constant => Box::new(LearnedEmbodiedPolicy::new(Model::zeros())),
            Condition::Learned => Box::new(LearnedEmbodiedPolicy::new(model.clone())),
            Condition::Scripted | Condition::Tactical | Condition::TacticalFixedGuard => {
                self.kind().expect("a registry row names a kind").build()
            }
        }
    }
}

/// One held-out fight, reduced to the columns the comparison reads.
#[derive(Clone, Copy, Debug)]
struct Trial {
    shaped: f32,
    outcome: Outcome,
    timed_out: bool,
    ticks: u32,
    rejected: u32,
    /// `None` when this condition's replays were not recorded; `Some(false)` is
    /// a replay that did not reproduce its run, which voids the whole row.
    replayed: Option<bool>,
}

/// Everything one condition produced against one opponent.
struct Row {
    condition: Condition,
    trials: Vec<Trial>,
    returns: Vec<f32>,
    mechanics: Mechanics,
    band: Band,
}

impl Row {
    fn wins(&self) -> usize {
        self.trials
            .iter()
            .filter(|t| t.outcome == Outcome::HeroesWin)
            .count()
    }

    fn decisions(&self) -> usize {
        self.trials
            .iter()
            .filter(|t| t.outcome == Outcome::Decision(Faction::Heroes))
            .count()
    }

    fn losses(&self) -> usize {
        self.trials
            .iter()
            .filter(|t| {
                matches!(
                    t.outcome,
                    Outcome::MonstersWin | Outcome::Decision(Faction::Monsters) | Outcome::Draw
                )
            })
            .count()
    }

    /// Trials the clock ended, as a percentage. v2-17's headline number, and
    /// v2-19's second gate condition.
    fn tick_limit_rate(&self) -> f64 {
        let n = self.trials.len().max(1) as f64;
        100.0 * self.trials.iter().filter(|t| t.timed_out).count() as f64 / n
    }

    fn rejected(&self) -> u64 {
        self.trials.iter().map(|t| t.rejected as u64).sum()
    }

    /// Mean ticks. **The column that stops being a constant the day this works.**
    /// On the v2-17 corpus essentially every fight reaches 3,600 and this reads
    /// as the limit for every row; a policy that ends fights is the one thing
    /// that moves it, and reading it beside a mean return is how "won more" is
    /// told apart from "won sooner".
    fn mean_ticks(&self) -> f64 {
        let n = self.trials.len().max(1) as f64;
        self.trials.iter().map(|t| t.ticks as f64).sum::<f64>() / n
    }

    fn replay_failures(&self) -> usize {
        self.trials
            .iter()
            .filter(|t| t.replayed == Some(false))
            .count()
    }

    fn replays_checked(&self) -> usize {
        self.trials.iter().filter(|t| t.replayed.is_some()).count()
    }
}

/// A paired difference between two conditions on the same trials.
///
/// **Paired, and the pairing is the whole design.** Every condition fights the
/// same seed in the same orientation against the same opponent, so trial `i` of
/// two rows differs in exactly one thing. Bootstrapping the per-trial difference
/// removes the seed variance that both rows share; bootstrapping the two means
/// separately and subtracting would leave it in and report an interval two or
/// three times too wide.
struct Comparison {
    reference: &'static str,
    reference_mean: f32,
    difference: Band,
    /// The improvement as a fraction of the reference mean.
    relative: f32,
    /// Five percent of the reference mean, in return points.
    bar: f32,
}

impl Comparison {
    fn of(learned: &Row, reference: &Row, seed: u64) -> Comparison {
        let differences: Vec<f32> = learned
            .returns
            .iter()
            .zip(reference.returns.iter())
            .map(|(a, b)| a - b)
            .collect();
        let difference = band(&differences, seed);
        let reference_mean = reference.band.mean;
        Comparison {
            reference: reference.condition.name(),
            reference_mean,
            difference,
            relative: if reference_mean.abs() > f32::EPSILON {
                difference.mean / reference_mean
            } else {
                0.0
            },
            bar: 0.05 * reference_mean,
        }
    }

    /// v2-19's bar as written: at least five percent, with an interval that
    /// excludes zero. Reported beside the stricter reading -- an interval whose
    /// **lower bound** clears five percent -- because the two disagree exactly
    /// when the result is marginal, which is when the difference matters.
    fn passes(&self) -> bool {
        self.difference.mean >= self.bar && self.difference.low > 0.0
    }

    fn passes_strictly(&self) -> bool {
        self.difference.low > self.bar
    }
}

/// What one opponent condition produced, across all five candidates.
struct Board {
    opponent: Opponent,
    rows: Vec<Row>,
}

impl Board {
    fn row(&self, condition: Condition) -> &Row {
        self.rows
            .iter()
            .find(|row| row.condition == condition)
            .expect("every condition was scored")
    }

    /// The best of the four things a learned policy has to beat.
    fn best_non_learned(&self) -> &Row {
        self.rows
            .iter()
            .filter(|row| row.condition != Condition::Learned)
            .max_by(|a, b| {
                a.band
                    .mean
                    .partial_cmp(&b.band.mean)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .expect("four non-learned conditions were scored")
    }
}

fn evaluate(args: &Args) {
    check_spec(args);
    let checkpoint = load_checkpoint(args);
    let path = checkpoint_path(args);
    let seeds = held_out_seeds(args.usize("seeds", HELD_OUT_SEEDS).max(1));
    let mirrored = !args.flag("plain");
    let threads = args.usize("threads", default_threads());
    let corpus = Corpus::new(mirrored);
    let opponents = evaluate_opponents(args).unwrap_or_else(|sentence| refuse(sentence));
    let frozen = opponents[0];
    let replays = !args.flag("no-replay");

    let original = Scenario::embodied_duel();
    let mirror = learn::mirrored_embodied_duel();

    println!("learn-probe evaluate");
    println!("  checkpoint  {}", path.display());
    println!("              sha256 {}", checkpoint.digest());
    println!(
        "              {} generations x {}, elite {}, sigma {:.3}, master seed {}",
        checkpoint.training.generations,
        checkpoint.training.population,
        checkpoint.training.elite,
        checkpoint.training.sigma,
        checkpoint.training.master_seed,
    );
    println!(
        "              trained on {} seed{} {:?}, training return {:.3}",
        checkpoint.training.seeds.len(),
        if checkpoint.training.seeds.len() == 1 { "" } else { "s" },
        checkpoint.training.seeds,
        checkpoint.training.training_return,
    );
    println!(
        "  held out    {} seed{} x {} orientation{} = {} trials, {}..{}",
        seeds.len(),
        if seeds.len() == 1 { "" } else { "s" },
        corpus.scenarios().len(),
        if corpus.scenarios().len() == 1 { "" } else { "s" },
        corpus.trials(&seeds),
        seeds.first().copied().unwrap_or(0),
        seeds.last().copied().unwrap_or(0) + 1,
    );
    // Stated as an arithmetic fact rather than as an assurance. The disjointness
    // holds because two constants are a million apart, and
    // `held_out_seeds_are_disjoint_from_training` is what keeps it true when
    // somebody widens the training set -- but a reader of a printed table should
    // not have to go and find that test.
    let overlap: Vec<u64> = checkpoint
        .training
        .seeds
        .iter()
        .copied()
        .filter(|seed| seeds.contains(seed))
        .collect();
    if overlap.is_empty() {
        println!(
            "              disjoint from the {} training seed{} this checkpoint records",
            checkpoint.training.seeds.len(),
            if checkpoint.training.seeds.len() == 1 { "" } else { "s" },
        );
    } else {
        eprintln!(
            "\nthis checkpoint was trained on {} of the held-out seeds ({overlap:?}); \
             nothing measured below would be held out",
            overlap.len()
        );
        std::process::exit(1);
    }
    println!(
        "  fixture     0x{:016x} canonical, 0x{:016x} mirrored",
        original.fingerprint(),
        mirror.fingerprint()
    );
    // **Said out loud because the file cannot say it.** `TrainingRecord` carries
    // the seed set and the optimizer settings and not the opponent, so a reader
    // of this table has no way to check that the checkpoint in front of it was
    // trained against the script it is now being scored against. Until the
    // format grows the column, the honest thing is to print the assumption
    // rather than to let the table imply it was verified.
    println!(
        "  opponent    {} -- and the checkpoint format does not record which\n  \
         \\            opponent it was trained against, so this is an assumption",
        opponent_prose(Opponent::frozen(frozen.kind)),
    );

    let started = Instant::now();
    let boards: Vec<Board> = opponents
        .iter()
        .map(|&opponent| Board {
            opponent,
            rows: Condition::ALL
                .iter()
                .map(|&condition| {
                    score_condition(
                        condition,
                        &checkpoint.model,
                        &corpus,
                        &seeds,
                        opponent,
                        threads,
                        replays && condition == Condition::Learned,
                    )
                })
                .collect(),
        })
        .collect();
    let elapsed = started.elapsed();

    for board in &boards {
        report(board);
    }
    verdict(&boards);
    println!("\n  {:.1}s wall", elapsed.as_secs_f64());
}

/// Runs one condition over the whole held-out corpus, fanned out by trial.
///
/// The same index-ordered chunking every other command in this lab uses, and it
/// matters more here: the returns vector is the input to a **paired** bootstrap,
/// so trial `i` of two conditions has to be the same seed in the same
/// orientation, and a corpus reassembled in completion order would silently pair
/// unrelated fights.
fn score_condition(
    condition: Condition,
    model: &Model,
    corpus: &Corpus,
    seeds: &[u64],
    opponent: Opponent,
    threads: usize,
    record_replays: bool,
) -> Row {
    let scenarios = corpus.scenarios();
    let plan: Vec<(usize, u64)> = scenarios
        .iter()
        .enumerate()
        .flat_map(|(index, _)| seeds.iter().map(move |&seed| (index, seed)))
        .collect();
    let mut slots: Vec<Option<Trial>> = vec![None; plan.len()];
    let mut audits: Vec<Mechanics> = Vec::new();
    let chunk = plan.len().div_ceil(threads.max(1)).max(1);
    audits.resize_with(plan.len().div_ceil(chunk), Mechanics::default);

    std::thread::scope(|scope| {
        for ((work, out), audit) in plan
            .chunks(chunk)
            .zip(slots.chunks_mut(chunk))
            .zip(audits.iter_mut())
        {
            scope.spawn(move || {
                let mut candidate = condition.policy(model);
                for (i, &(index, seed)) in work.iter().enumerate() {
                    let scenario = &scenarios[index];
                    let mut baseline = opponent.policy_for(seed);
                    let mut replay = record_replays.then(|| Replay::new(scenario, seed));
                    let result = learn::rollout_with(
                        scenario,
                        seed,
                        candidate.as_mut(),
                        baseline.as_mut(),
                        None,
                        &mut Recorders {
                            mechanics: Some(audit),
                            replay: replay.as_mut(),
                        },
                    );
                    out[i] = Some(trial_of(&result, replay.as_ref()));
                }
            });
        }
    });

    let trials: Vec<Trial> = slots
        .into_iter()
        .map(|slot| slot.expect("every held-out trial produced a result"))
        .collect();
    let returns: Vec<f32> = trials.iter().map(|t| t.shaped).collect();
    let mut mechanics = Mechanics::default();
    for audit in &audits {
        mechanics.merge(audit);
    }
    Row {
        condition,
        // Seeded from the condition rather than from a clock, so that two runs
        // of this command print the same interval.
        band: band(&returns, 19_000 + condition as u64),
        trials,
        returns,
        mechanics,
    }
}

/// Reduces a rollout, and checks its replay if one was recorded.
///
/// **The replay is played here, in the worker, and thrown away.** A `Replay`
/// carries a whole `Scenario` -- which owns a `Dungeon` -- so keeping four
/// hundred of them to verify at the end would hold four hundred levels in
/// memory to answer a question that is answerable one fight at a time. What
/// survives is the boolean, which is the evidence v2-19 asks for.
///
/// And the playback is the value-level half of "a replay never loads the
/// checkpoint": `Replay::play` takes a world and a recorded
/// `SubmittedCommand::Articulated` stream and consults no policy of any kind.
fn trial_of(result: &Rollout, replay: Option<&Replay>) -> Trial {
    Trial {
        shaped: learn::shaped_return(result),
        outcome: result.outcome,
        timed_out: result.timed_out,
        ticks: result.ticks,
        rejected: result.rejected,
        replayed: replay.map(|replay| {
            replay.is_intact() && replay.play().state_hash() == result.state_hash
        }),
    }
}

fn report(board: &Board) {
    println!(
        "\nopponent: {}{}",
        opponent_prose(board.opponent),
        if board.opponent.phase_randomised {
            "  <- the control"
        } else {
            ""
        }
    );
    println!(
        "  {:<13}{:>9} {:>7}  {:>18}  {:>5}{:>5}{:>6}  {:>10}  {:>8}  {:>8}",
        "condition", "mean", "s.e.", "95% CI", "kill", "pts", "lost", "tick-limit", "ticks",
        "refused"
    );
    for row in &board.rows {
        println!(
            "  {:<13}{:>9.3} {:>7.3}  [{:>7.3},{:>8.3}]  {:>5}{:>5}{:>6}  {:>9.1}%  {:>8.0}  {:>8}",
            row.condition.name(),
            row.band.mean,
            row.band.stderr,
            row.band.low,
            row.band.high,
            row.wins(),
            row.decisions(),
            row.losses(),
            row.tick_limit_rate(),
            row.mean_ticks(),
            row.rejected(),
        );
    }

    println!(
        "\n  {:<13}{:>8}{:>9}{:>8}   {:>5}{:>6}{:>6}{:>6}{:>6}{:>6}   {:>6}{:>6}{:>6}  {:>5}",
        "contacts", "w/w", "w/shield", "w/body", "head", "torso", "lArm", "rArm", "legs", "none",
        "LOW", "MID", "HIGH", "sever"
    );
    for row in &board.rows {
        let m = &row.mechanics;
        println!(
            "  {:<13}{:>8}{:>9}{:>8}   {:>5}{:>6}{:>6}{:>6}{:>6}{:>6}   {:>6}{:>6}{:>6}  {:>5}",
            row.condition.name(),
            m.kinds[ContactKind::WeaponWeapon as usize],
            m.kinds[ContactKind::WeaponShield as usize],
            m.kinds[ContactKind::WeaponBody as usize],
            m.regions[0],
            m.regions[1],
            m.regions[2],
            m.regions[3],
            m.regions[4],
            m.regions[BodyPart::COUNT],
            m.heights[0],
            m.heights[1],
            m.heights[2],
            m.severances,
        );
    }
    // **Said every time the table is printed, because the zero is the number a
    // reader will reach for**, and the two directions it pools are zero for two
    // different reasons -- one geometric and one about the attribution rule.
    // `no_attack_in_the_vocabulary_can_be_credited_to_a_head` in `crates/learn`
    // is the arithmetic; this is the line that stops the column being read as a
    // choice anybody made.
    println!(
        "  head is 0 because it is unreachable, not unchosen. The Fighter's HIGH puts its\n  \
         blade axis at z 1.35 and the Brute's head admits a sword only from z 1.61 up. The\n  \
         Brute's club does touch a Fighter's head at z 1.50, but the torso capsule reaches\n  \
         0.35 out where the head sphere reaches 0.20, so the torso always has the earlier\n  \
         time of impact and wins the (toi, medial distance, index) region key."
    );

    let learned = board.row(Condition::Learned);
    let reference = board.best_non_learned();
    let comparison = Comparison::of(learned, reference, 19_907);
    println!(
        "\n  learned vs {} (the best non-learned condition, {:.3})",
        comparison.reference, comparison.reference_mean
    );
    println!(
        "    {:+.3} paired, {:+.1}% relative, bootstrap 95% CI [{:+.3}, {:+.3}]",
        comparison.difference.mean,
        100.0 * comparison.relative,
        comparison.difference.low,
        comparison.difference.high,
    );
    println!(
        "    the 5% bar is {:+.3}: {}, and the interval's lower bound {} it",
        comparison.bar,
        if comparison.difference.mean >= comparison.bar { "cleared" } else { "NOT cleared" },
        if comparison.passes_strictly() { "also clears" } else { "does not clear" },
    );
    println!(
        "    tick limit  learned {:.1}% against {} {:.1}%, {:+.1} points (v2-19 allows +2.0)",
        learned.tick_limit_rate(),
        comparison.reference,
        reference.tick_limit_rate(),
        learned.tick_limit_rate() - reference.tick_limit_rate(),
    );

    // The safety block, over every condition and not only the learned one: a
    // solver refusal under the windmill would void the corpus this comparison
    // is drawn on just as surely.
    let mut refused = 0u64;
    let mut rejections = 0u32;
    let mut excess = 0u64;
    let mut cap_hits = 0u32;
    let mut first_rejection = None;
    for row in &board.rows {
        refused += row.rejected();
        rejections += row.mechanics.solver_rejections;
        excess = excess.max(row.mechanics.max_energy_excess);
        cap_hits += row.mechanics.cap_hits;
        first_rejection = first_rejection.or(row.mechanics.first_rejection);
    }
    println!(
        "    safety      {refused} refused submissions, {rejections} refused contact ticks{}, \
         max energy excess raw {excess}, {cap_hits} cap hits",
        match first_rejection {
            Some(cause) => format!(" (first {cause:?})"),
            None => String::new(),
        }
    );
    let checked = learned.replays_checked();
    println!(
        "    replays     {}/{} reproduced exactly, no model loaded",
        checked - learned.replay_failures(),
        checked,
    );
    println!(
        "    inference   {:.2} us per decision over {} decisions",
        learned.mechanics.nanos_per_decision() / 1000.0,
        learned.mechanics.candidate_decisions,
    );
}

/// Did phase randomisation actually change the edge?
///
/// **The question two verdicts cannot answer, and the trap this exists to
/// avoid.** A run that reads PASS against the frozen script and FAIL against the
/// control invites exactly one sentence -- "the edge is a clock reading" -- and
/// that sentence is only true if the two edges *differ*. They can perfectly well
/// straddle a fixed bar while being the same number: an edge of 5.1% and an edge
/// of 4.3% against a bar of 5.0% produce opposite verdicts and a difference of
/// 0.7 points, which is nothing beside either interval.
///
/// So the honest test is the difference of the differences, paired trial by
/// trial: the same seed and the same orientation, fought twice, once against a
/// predictable opponent and once against an unpredictable one. If that interval
/// excludes zero, the clock was worth something and the headline is earned. If
/// it contains zero, the two verdicts differ because of where the bar sits and
/// **not** because of the clock, and saying otherwise would be inventing a
/// finding out of a threshold.
fn collapse(boards: &[Board], reference: Condition) -> Option<Band> {
    let frozen = boards.iter().find(|b| !b.opponent.phase_randomised)?;
    let randomised = boards.iter().find(|b| b.opponent.phase_randomised)?;
    let edge = |board: &Board| -> Vec<f32> {
        board
            .row(Condition::Learned)
            .returns
            .iter()
            .zip(board.row(reference).returns.iter())
            .map(|(a, b)| a - b)
            .collect()
    };
    let (before, after) = (edge(frozen), edge(randomised));
    if before.len() != after.len() {
        return None;
    }
    let lost: Vec<f32> = before
        .iter()
        .zip(after.iter())
        .map(|(a, b)| a - b)
        .collect();
    Some(band(&lost, 19_919))
}

/// The decision, said out loud rather than left to a reader of two tables.
fn verdict(boards: &[Board]) {
    println!("\nverdict");
    let mut frozen_passed = false;
    let mut randomised_passed = false;
    let mut randomised_ran = false;
    let mut safe = true;
    // Counted rather than folded into `safe`, and that is a correction the
    // reseat forced rather than a relaxation anybody wanted. **The articulated
    // corpus refused zero contact ticks and this one does not.** `lab embodied
    // --seeds 8 --mirrored` reports two refusals on the shipped script, and
    // every sweep row in `docs/performance/embodied-tactical-policy.md` records
    // between 28 and 91; a refusal is a property of the embodied fixture, not a
    // broken harness, and a verdict that read "the corpus above is not evidence"
    // on every run would be a headline nobody could act on.
    //
    // What a refusal actually costs is one specific claim, and only that one:
    // `World::resolve_contact` clears the row list for exactly the condition
    // `max_energy_excess` measures, so a zero excess **read beside a nonzero
    // refusal count audits nothing**. That is the correction
    // `docs/performance/v2-articulated-contact-research.md` records under
    // Smart102 -- a windmill regression froze exactly one `EnergyNumerator`
    // refusal and was told it "may not call zero excess evidence" -- and this is
    // the same rule applied to a corpus where refusals are ordinary.
    //
    // A **refused submission** is still a hard failure and is still inside
    // `safe`. That one voids the run outright: the world stores the neutral
    // command, so the fight that happened is not the fight the policy asked for.
    let mut refused_ticks = 0u32;
    let mut replayed = true;

    for board in boards {
        let learned = board.row(Condition::Learned);
        let reference = board.best_non_learned();
        let comparison = Comparison::of(learned, reference, 19_907);
        let passes = comparison.passes()
            && learned.tick_limit_rate() - reference.tick_limit_rate() <= 2.0;
        println!(
            "  {:<22} {}  {:+.1}% over {} (CI [{:+.3}, {:+.3}])",
            if board.opponent.phase_randomised {
                "phase-randomised"
            } else {
                "frozen clock"
            },
            if passes { "PASS" } else { "FAIL" },
            100.0 * comparison.relative,
            comparison.reference,
            comparison.difference.low,
            comparison.difference.high,
        );
        if board.opponent.phase_randomised {
            randomised_ran = true;
            randomised_passed = passes;
        } else {
            frozen_passed = passes;
        }
        for row in &board.rows {
            safe &= row.rejected() == 0 && row.mechanics.max_energy_excess == 0;
            refused_ticks += row.mechanics.solver_rejections;
        }
        replayed &= learned.replay_failures() == 0;
    }

    println!(
        "  {:<22} {}",
        "v2-17 safety",
        if safe { "green" } else { "BROKEN -- the corpus above is not evidence" }
    );
    println!(
        "  {:<22} {}",
        "energy audit",
        match refused_ticks {
            0 => "zero excess over zero refused contact ticks -- the excess is evidence"
                .to_string(),
            n => format!(
                "zero excess over {n} refused contact ticks -- the excess audits nothing, \n  \
                 \\                     because a refusal clears the rows a violation would \n  \
                 \\                     appear in. Ordinary on this fixture; see \n  \
                 \\                     docs/performance/embodied-tactical-policy.md"
            ),
        }
    );
    println!(
        "  {:<22} {}",
        "replays reproduce",
        if replayed { "yes" } else { "NO -- the corpus above is not evidence" }
    );

    // The reference is taken off the frozen board and used on both, so the two
    // edges being differenced are edges over the same condition. Letting each
    // board pick its own best would difference an edge over the windmill against
    // an edge over something else and call the result a phase effect.
    let reference = boards
        .iter()
        .find(|b| !b.opponent.phase_randomised)
        .map(|b| b.best_non_learned().condition)
        .unwrap_or(Condition::Tactical);
    let lost = collapse(boards, reference);
    let clock_read = match &lost {
        Some(lost) => {
            println!(
                "  {:<22} {:+.3} of the edge over {} (paired 95% CI [{:+.3}, {:+.3}])",
                "phase costs", lost.mean, reference.name(), lost.low, lost.high,
            );
            lost.low > 0.0
        }
        None => false,
    };

    let decision = if !safe || !replayed {
        "stop and fix the harness: a corpus with a refused submission or a divergent \
         replay in it is not evidence either way"
    } else if !randomised_ran {
        "no control was run, so no decision can be read off this table -- drop --frozen-only"
    } else if frozen_passed && randomised_passed {
        "the learned policy beats the best non-learned condition against both a \
         predictable opponent and an unpredictable one"
    } else if frozen_passed && clock_read {
        "**the edge is a clock reading, not swordsmanship**: it survives against a \
         script whose phase the policy can see in its own input, and the paired \
         interval above says randomising that phase measurably takes it away"
    } else if frozen_passed {
        "**the result straddles the bar and the clock is not what decides it**: the \
         edge is statistically the same size against both opponents -- the interval \
         on what phase randomisation costs contains zero -- so the two verdicts \
         differ because of where the bar sits, and no clock-reading claim is earned \
         in either direction"
    // **The mirror of the arm above, and it was missing until it fired.** This
    // ladder ran with no arm for "passes against the unpredictable opponent and
    // not the predictable one", on the unstated assumption that the frozen board
    // is always the easier of the two -- so a run fell through to the last arm
    // and printed "does not beat the best non-learned condition" two lines under
    // a board line reading PASS. A conclusion that contradicts the table above it
    // is worse than no conclusion, which is why this arm exists rather than being
    // left to a reader who would have to notice.
    //
    // The assumption is wrong twice over. `phase costs` can come back *negative*
    // -- randomising the opponent's clock can help the candidate, if what the
    // frozen clock gave it was a timetable it had overfitted the wrong way -- and
    // the reference is the best non-learned condition on each board separately,
    // so the two edges are not always over the same fighter. What settles it is
    // the paired interval, exactly as in the arm above.
    } else if randomised_passed {
        "**the result straddles the bar from the other side, and the clock is not \
         what decides it either**: the edge clears the bar against the \
         unpredictable opponent and not against the predictable one, which is the \
         opposite shape from a clock reading. Read the paired interval above and \
         the two board lines rather than this sentence -- a policy has not beaten \
         a baseline it failed to beat on one of the two boards"
    } else {
        "the learned policy does not beat the best non-learned condition"
    };
    println!("\n  {decision}");
    println!(
        "  the decision this command does not make: `expand`, `revise` or `stop` is recorded\n  \
         in docs/performance/v2-learning-probe.md beside this corpus."
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn tiny_corpus() -> (Corpus, Vec<u64>) {
        (Corpus::new(false), held_out_seeds(1))
    }

    fn probe_args(line: &str) -> crate::args::Args {
        crate::args::Args::parse(line.split_whitespace().map(String::from).collect())
    }

    #[test]
    fn a_phase_shift_is_refused_by_name_for_an_opponent_with_no_clock() {
        // The sentence and not the exit code, which is the half of AGENTS.md's
        // rule the previous version of this refusal skipped: an `eprintln!` and
        // an `exit(2)` refuse correctly and are unreadable from a test, so
        // nothing catches the refusal disappearing.
        //
        // Every clockless entry, walked out of the registry rather than named,
        // so an appended one that answers `reads_the_clock` wrongly arrives here
        // rather than in a table of duplicated numbers.
        for kind in EmbodiedPolicyKind::ALL.iter().filter(|k| !k.reads_the_clock()) {
            let line = format!("learn-probe train --opponent {} --phase-random", kind.name());
            let refusal = opponent_from(&probe_args(&line))
                .expect_err("a clockless opponent cannot honour --phase-random");
            assert!(refusal.contains("--phase-random"), "{refusal}");
            assert!(refusal.contains(kind.name()), "the refusal does not name the opponent: {refusal}");
            assert!(
                refusal.contains(EmbodiedPolicyKind::Scripted.name()),
                "the refusal does not name an opponent that would work: {refusal}"
            );

            // And `evaluate` refuses the same run with no flag typed at all,
            // because its control board is not behind one.
            let line = format!("learn-probe evaluate --opponent {}", kind.name());
            let refusal = evaluate_opponents(&probe_args(&line))
                .expect_err("evaluate scores a control it cannot build");
            assert!(refusal.contains(kind.name()), "{refusal}");

            // `--frozen-only` is the way to score it, and it is not refused.
            let line = format!("learn-probe evaluate --opponent {} --frozen-only", kind.name());
            assert_eq!(
                evaluate_opponents(&probe_args(&line)),
                Ok(vec![Opponent::frozen(*kind)]),
                "--frozen-only is the arm that has no control to disable"
            );
        }
    }

    #[test]
    fn a_clock_reading_opponent_still_gets_both_boards() {
        // The other direction, which is what stops the refusal above from being
        // satisfied by refusing everything. `scripted` is what the command runs
        // by default and the phase-randomised board is the reason the command
        // has a verdict ladder at all.
        assert_eq!(
            opponent_from(&probe_args("learn-probe train --phase-random")),
            Ok(Opponent::randomised(EmbodiedPolicyKind::Scripted)),
        );
        assert_eq!(
            evaluate_opponents(&probe_args("learn-probe evaluate")),
            Ok(vec![
                Opponent::frozen(EmbodiedPolicyKind::Scripted),
                Opponent::randomised(EmbodiedPolicyKind::Scripted),
            ]),
        );
        // Two requests that contradict each other, named rather than resolved
        // by precedence.
        assert!(evaluate_opponents(&probe_args(
            "learn-probe evaluate --frozen-only --phase-random"
        ))
        .is_err());
    }

    #[test]
    fn held_out_seeds_are_disjoint_from_training() {
        // v2-19 names this test and `crates/learn` owns the constants it turns
        // on; what this copy adds is the thing the crate cannot check, which is
        // that **the command actually uses those constants**. A `learn-probe
        // evaluate` that scored `(0..400)` would be perfectly reproducible,
        // report a wonderful number, and be measuring the training set.
        let training: std::collections::HashSet<u64> =
            training_seeds(100_000).into_iter().collect();
        for seed in held_out_seeds(HELD_OUT_SEEDS * 4) {
            assert!(!training.contains(&seed), "held-out seed {seed} was trained on");
        }
        // And a spec-sized training run stays clear of a spec-sized evaluation
        // by six orders of magnitude, so widening either by a plausible factor
        // cannot close the gap silently.
        let widest_training = *training_seeds(SPEC_SEEDS * 1000).last().expect("seeds");
        let first_held_out = held_out_seeds(1)[0];
        assert!(widest_training < first_held_out);
    }

    #[test]
    fn recorded_learned_replays_do_not_load_the_model() {
        // The claim is structural -- a replay carries `SubmittedCommand`s and
        // `Replay::play` consults no policy -- and this is the value-level half
        // of it: a learned run is recorded, the checkpoint is *dropped*, and the
        // replay still reproduces the state hash of the fight it recorded.
        //
        // Dropping the model rather than merely not using it is the point. A
        // test that kept it in scope would pass identically if playback grew a
        // model parameter tomorrow.
        let (corpus, seeds) = tiny_corpus();
        let scenario = &corpus.scenarios()[0];
        let mut replay = Replay::new(scenario, seeds[0]);
        let (hash, ticks) = {
            let mut rng = fx::Rng::new(4);
            let mut learned = LearnedEmbodiedPolicy::new(Model::random(&mut rng));
            let mut opponent = Opponent::frozen(EmbodiedPolicyKind::Scripted).policy_for(seeds[0]);
            let result = learn::rollout_with(
                scenario,
                seeds[0],
                &mut learned,
                opponent.as_mut(),
                Some(400),
                &mut Recorders {
                    mechanics: None,
                    replay: Some(&mut replay),
                },
            );
            assert_eq!(result.rejected, 0);
            (result.state_hash, result.ticks)
        };
        assert!(replay.is_intact());
        assert_eq!(replay.ticks, ticks);
        assert!(!replay.submitted_entries.is_empty(), "nothing was recorded");
        assert_eq!(replay.play().state_hash(), hash);
    }

    #[test]
    fn the_constant_condition_is_the_zeroed_network_and_says_which_constant() {
        // The row this table's floor is, asserted rather than described --
        // because the sentence "a zeroed network advances, chambers low and
        // guards low" is a claim about the *order of the entries* in five action
        // heads, and that order is append-only and arbitrary. If somebody
        // appends an entry at the front of a head the sentence in the module
        // header becomes false silently, and this is what notices.
        let mut constant = Condition::Constant.policy(&Model::zeros());
        let mut obs = sim::ArticulatedObservation::BLANK;
        obs.subject = sim::EntityId::new(0, 0);
        obs.capabilities = sim::ArticulatedObservation::MOVEMENT
            | sim::ArticulatedObservation::TURNING
            | sim::ArticulatedObservation::RIGHT_GRIP
            | sim::ArticulatedObservation::RIGHT_WEAPON;
        obs.arms[1].equipment = Some(1);
        obs.opponent_count = 1;
        obs.opponents[0].id = sim::EntityId::new(1, 0);
        obs.opponents[0].body_position = fx::Vec3::new(fx::Fx::from_int(4), fx::Fx::ZERO, fx::Fx::ZERO);

        let command = constant.decide(&obs);
        // Through the frame adapter, because that is what the row is: the
        // condition builds a `LearnedEmbodiedPolicy`, and comparing against
        // `compose` alone would assert about a command this table never runs.
        // The fixture faces due east with a zero body yaw, so the conversion is
        // the identity here -- which is why the columns below can still be read
        // as world quantities, and why that is stated rather than assumed.
        assert_eq!(obs.body_yaw, fx::Angle::ZERO, "the columns below are read in the world frame");
        let zeroed = policy::into_torso_frame(&obs, learn::compose(&obs, learn::LearnedActionV1::default()));
        assert_eq!(command, zeroed, "the constant is not the all-zero action");
        let command = command.articulated;
        // Advance: a step of the approach magnitude straight at the opponent.
        assert!(command.move_dir.x > fx::Fx::ZERO && command.move_dir.y == fx::Fx::ZERO);
        // LOW on both arms, and the weapon arm chambered rather than resting.
        assert_eq!(command.arms[0].height, sim::CombatHeight::LOW);
        assert_eq!(command.arms[1].height, sim::CombatHeight::LOW);
        assert_eq!(command.arms[1].reach, fx::Fx::from_ratio(3, 4));
        assert!(matches!(command.intent, sim::Intent::Attack(_)));
    }

    #[test]
    fn a_paired_comparison_is_tighter_than_two_unpaired_ones() {
        // The design claim behind `Comparison`, measured. Two conditions that
        // differ by a constant on every trial, over a corpus with real spread:
        // the paired interval has to collapse onto that constant, and the two
        // separate intervals have to be far wider. If this ever stops being
        // true the pairing has been broken -- which is what happens if the
        // corpus is reassembled in completion order.
        let base: Vec<f32> = (0..400).map(|i| (i % 71) as f32).collect();
        let shifted: Vec<f32> = base.iter().map(|v| v + 3.0).collect();
        let rows = |returns: Vec<f32>, condition: Condition| Row {
            condition,
            band: band(&returns, 1),
            trials: Vec::new(),
            returns,
            mechanics: Mechanics::default(),
        };
        let reference = rows(base, Condition::Tactical);
        let learned = rows(shifted, Condition::Learned);
        let comparison = Comparison::of(&learned, &reference, 5);
        assert!((comparison.difference.mean - 3.0).abs() < 1e-4);
        assert!(comparison.difference.sd < 1e-4, "a constant shift has no spread");
        assert!(
            comparison.difference.high - comparison.difference.low
                < (reference.band.high - reference.band.low) / 10.0,
            "the paired interval is not tighter than the unpaired one"
        );
        assert!(comparison.difference.low > 0.0);
    }

    #[test]
    fn a_checkpoint_this_build_cannot_read_is_never_scored_as_a_policy() {
        // The failure this command must not have: a measurement that quietly
        // substitutes one condition for another reports a dead heat and is
        // believed. Checked at the reader, which is where the refusal has to
        // happen -- `load_checkpoint` exits, and there is no arm in which a
        // scripted policy ends up in the learned row.
        let mut bytes = Checkpoint {
            training: Default::default(),
            model: Model::zeros(),
        }
        .to_bytes();
        let last = bytes.len() - 1;
        bytes[last] ^= 0xff;
        assert!(Checkpoint::from_bytes(&bytes).is_err());

        // And a valid one round-trips into a condition that is not any script.
        let good = Checkpoint {
            training: Default::default(),
            model: Model::zeros(),
        };
        let loaded = Checkpoint::from_bytes(&good.to_bytes()).expect("a fresh checkpoint loads");
        assert_eq!(loaded.digest(), good.digest());
    }

    #[test]
    fn the_spec_names_one_preset_and_its_paths_are_relative() {
        // A checkpoint path that escaped the repository would put the artifact
        // somewhere a reader of the plan cannot find it, and an absolute default
        // would differ per machine.
        assert!(!Path::new(SPEC_CHECKPOINT).is_absolute());
        assert_eq!(SPEC, "v2-probe");
        assert!(SPEC_ELITE < SPEC_POPULATION);
    }
}
