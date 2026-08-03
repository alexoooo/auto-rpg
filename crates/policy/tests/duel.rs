//! One-on-one regression tests.
//!
//! These pin the claim the swing model exists to support: that fighting well is
//! a thing a policy can *do*, separately from having good stats. A win rate is
//! the only honest way to state that, so these are win-rate tests over a fixed
//! seed set, with floors loose enough to survive tuning and tight enough to
//! catch a policy that has stopped working.

use fx::Fx;
use policy::{run, PolicyKind, RunConfig, TeamPolicy};
use sim::{Outcome, Scenario, UnitKind};

/// Seeds are fixed rather than random: a flaky win-rate test is worse than no
/// win-rate test, because it trains people to re-run the suite.
const SEEDS: u64 = 96;

struct Record {
    wins: usize,
    draws: usize,
    blocks: u64,
    parries: u64,
    runs: usize,
}

impl Record {
    fn win_rate(&self) -> f64 {
        self.wins as f64 / self.runs.max(1) as f64
    }
    fn draw_rate(&self) -> f64 {
        self.draws as f64 / self.runs.max(1) as f64
    }
}

fn duel(hero: (PolicyKind, UnitKind), villain: (PolicyKind, UnitKind)) -> Record {
    let config = RunConfig::default();
    let mut hero_policy = hero.0.baseline();
    let mut villain_policy = villain.0.baseline();
    let mut record = Record {
        wins: 0,
        draws: 0,
        blocks: 0,
        parries: 0,
        runs: SEEDS as usize,
    };
    for seed in 0..SEEDS {
        let scenario = Scenario::duel_of(hero.1, villain.1, seed);
        let team = TeamPolicy::new(&mut hero_policy, &mut villain_policy);
        let result = run(&scenario, seed, team, &config);
        if result.heroes_won() {
            record.wins += 1;
        }
        if result.outcome == Outcome::Draw {
            record.draws += 1;
        }
        record.blocks += result.blocks as u64;
        record.parries += result.parries as u64;
    }
    record
}

#[test]
fn a_duellist_beats_a_brute_more_often_than_not() {
    // The headline claim, stated as a measurement. The floor is well under what
    // it currently scores, because the number that matters is "reliably better
    // than a coin flip", not any particular percentage.
    let record = duel(
        (PolicyKind::Duelist, UnitKind::Scout),
        (PolicyKind::Utility, UnitKind::Brute),
    );
    assert!(
        record.win_rate() > 0.6,
        "a duelling Scout won only {:.0}% against a Brute",
        record.win_rate() * 100.0
    );
}

#[test]
fn a_duellist_out_fights_the_baseline_where_the_weapon_is_the_problem() {
    // The test that stops "clever" from meaning "worse", stated on the matchup
    // the extra machinery exists for: a Warrior against a weapon with twice its
    // reach and twice its weight, where standing in the right place is the
    // whole fight. The baseline wins that around 79% of the time and spends a
    // sixth of its fights failing to resolve at all.
    //
    // Deliberately *not* asserted of the Scout, which the baseline takes to 98%
    // by charging: against an opponent this weak, caution is a tax. The
    // duellist gives up about fifteen points there to gain them here, and
    // pretending otherwise would be pinning a number nobody measured.
    let clever = duel(
        (PolicyKind::Duelist, UnitKind::Warrior),
        (PolicyKind::Utility, UnitKind::Brute),
    );
    let simple = duel(
        (PolicyKind::Utility, UnitKind::Warrior),
        (PolicyKind::Utility, UnitKind::Brute),
    );
    assert!(
        clever.win_rate() > simple.win_rate(),
        "the duellist won {:.0}% where the baseline wins {:.0}%",
        clever.win_rate() * 100.0,
        simple.win_rate() * 100.0
    );
    assert!(
        clever.draw_rate() < simple.draw_rate(),
        "the duellist drew {:.0}% against the baseline's {:.0}%; \
         reading a fight is supposed to make it end",
        clever.draw_rate() * 100.0,
        simple.draw_rate() * 100.0
    );
}

#[test]
fn a_duellist_actually_uses_its_shield() {
    // A win rate alone cannot tell swordsmanship from stats. If a policy that
    // scores blocking at 1.8 never blocks anything, the stance is decorative.
    let record = duel(
        (PolicyKind::Duelist, UnitKind::Scout),
        (PolicyKind::Utility, UnitKind::Brute),
    );
    assert!(
        record.blocks > SEEDS,
        "only {} blocks across {SEEDS} fights",
        record.blocks
    );
}

#[test]
fn fights_end() {
    // A draw scores zero, teaches evolution nothing and costs a full tick limit
    // of compute -- the most expensive possible way to learn nothing. Both
    // policies have to converge.
    for (hero, villain) in [
        (PolicyKind::Duelist, PolicyKind::Utility),
        (PolicyKind::Utility, PolicyKind::Duelist),
        (PolicyKind::Duelist, PolicyKind::Duelist),
    ] {
        let record = duel((hero, UnitKind::Scout), (villain, UnitKind::Brute));
        assert!(
            record.draw_rate() < 0.2,
            "{}v{} drew {:.0}% of the time",
            hero.name(),
            villain.name(),
            record.draw_rate() * 100.0
        );
    }
}

#[test]
fn every_matchup_resolves_and_nothing_panics() {
    // Coverage rather than balance: every archetype pairing under every policy,
    // once, to catch a geometry or perception combination that only one of them
    // can reach.
    let config = RunConfig::default();
    for kind in PolicyKind::ALL {
        for hero in UnitKind::ALL {
            for villain in UnitKind::ALL {
                let scenario = Scenario::duel_of(hero, villain, 7);
                let team = TeamPolicy::new(kind.baseline(), PolicyKind::Duelist.baseline());
                let result = run(&scenario, 7, team, &config);
                assert!(result.hero_health >= Fx::ZERO);
                assert!(result.ticks > 0);
            }
        }
    }
}

/// Not a test: a sweep, for tuning by measurement rather than by opinion.
///
/// ```text
/// cargo test --release -p policy --test duel -- --ignored --nocapture sweep
/// ```
#[test]
#[ignore = "a tuning aid, not an assertion"]
fn sweep_the_matchup_table() {
    println!(
        "\n{:<10} {:<10} {:>8} {:>8} {:>8} {:>8}",
        "hero", "villain", "win%", "draw%", "blocks", "parries"
    );
    for hero_policy in [PolicyKind::Utility, PolicyKind::Duelist] {
        for hero in UnitKind::ALL {
            for villain in UnitKind::ALL {
                let record = duel((hero_policy, hero), (PolicyKind::Utility, villain));
                println!(
                    "{:<10} {:<10} {:>7.0}% {:>7.0}% {:>8} {:>8}   ({})",
                    hero.name(),
                    villain.name(),
                    record.win_rate() * 100.0,
                    record.draw_rate() * 100.0,
                    record.blocks,
                    record.parries,
                    hero_policy.name()
                );
            }
        }
    }
}
