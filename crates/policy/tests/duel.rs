//! One-on-one regression tests.
//!
//! These pin the claim the swing model exists to support: that fighting well is
//! a thing a policy can *do*, separately from having good stats. A win rate is
//! the only honest way to state that, so these are win-rate tests over a fixed
//! seed set, with floors loose enough to survive tuning and tight enough to
//! catch a policy that has stopped working.

use fx::Fx;
use policy::{run, PolicyKind, RunConfig, TeamPolicy};
use sim::{Faction, Outcome, Scenario, Stats, UnitKind};

/// Seeds are fixed rather than random: a flaky win-rate test is worse than no
/// win-rate test, because it trains people to re-run the suite.
const SEEDS: u64 = 96;

struct Record {
    wins: usize,
    draws: usize,
    blocks: u64,
    parries: u64,
    health: Fx,
    /// Surviving health summed over the fights this side *won*, so a tier's
    /// toll can be read without a loss dragging it to zero.
    won_health: Fx,
    runs: usize,
}

impl Record {
    fn new() -> Record {
        Record {
            wins: 0,
            draws: 0,
            blocks: 0,
            parries: 0,
            health: Fx::ZERO,
            won_health: Fx::ZERO,
            runs: 0,
        }
    }

    fn add(&mut self, result: policy::RunResult) {
        self.runs += 1;
        if result.heroes_won() {
            self.wins += 1;
            self.won_health += result.hero_health;
        }
        if result.outcome == Outcome::Draw {
            self.draws += 1;
        }
        self.blocks += result.blocks as u64;
        self.parries += result.parries as u64;
        self.health += result.hero_health;
    }

    fn win_rate(&self) -> f64 {
        self.wins as f64 / self.runs.max(1) as f64
    }
    fn draw_rate(&self) -> f64 {
        self.draws as f64 / self.runs.max(1) as f64
    }
    /// Mean surviving health across the set.
    ///
    /// The measure that matters once both policies win most of their fights:
    /// "did you win" stops discriminating long before "what did it cost you"
    /// does, and what a fight costs is the whole of what reading it buys.
    fn toll(&self) -> f64 {
        (self.health / Fx::from_int(self.runs.max(1) as i32)).to_f32() as f64
    }
}

fn duel(hero: (PolicyKind, UnitKind), villain: (PolicyKind, UnitKind)) -> Record {
    let config = RunConfig::default();
    let mut hero_policy = hero.0.baseline();
    let mut villain_policy = villain.0.baseline();
    let mut record = Record::new();
    for seed in 0..SEEDS {
        let scenario = Scenario::duel_of(hero.1, villain.1, seed);
        let team = TeamPolicy::new(&mut hero_policy, &mut villain_policy);
        record.add(run(&scenario, seed, team, &config));
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
    // reach and twice its weight, where standing in the right place and reading
    // a telegraph are the whole fight.
    //
    // Two assertions, and the second is the one that will keep discriminating.
    // Once both policies win most of their duels a win rate saturates and stops
    // saying anything; what a fight *costs* does not. The claim the phased swing
    // exists to make good on is that a fighter who reads an attack takes fewer
    // of them, so that is what gets pinned.
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
        clever.toll() > simple.toll(),
        "the duellist finished on {:.2} health against the baseline's {:.2}; \
         reading a fight is supposed to make it cheaper",
        clever.toll(),
        simple.toll()
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

/// Health each tier finishes on, averaged over the fights it won.
fn toll_when_winning(record: &Record) -> f64 {
    if record.wins == 0 {
        return 0.0;
    }
    (record.won_health / Fx::from_int(record.wins as i32)).to_f32() as f64
}

/// One archetype, one policy, three character sheets, against the same Brute.
fn tier(intellect: u8, perception: u8) -> Record {
    let base = UnitKind::Warrior.base_stats();
    let stats = Stats::new(
        base.power,
        base.agility,
        intellect,
        perception,
        base.vitality,
    );
    let config = RunConfig::default();
    let mut hero_policy = PolicyKind::Duelist.baseline();
    let mut villain_policy = PolicyKind::Utility.baseline();
    let mut record = Record::new();
    for seed in 0..SEEDS {
        let mut scenario = Scenario::duel_of(UnitKind::Warrior, UnitKind::Brute, seed);
        for unit in &mut scenario.units {
            if unit.faction == Faction::Heroes {
                unit.stats = stats;
            }
        }
        let team = TeamPolicy::new(&mut hero_policy, &mut villain_policy);
        record.add(run(&scenario, seed, team, &config));
    }
    record
}

#[test]
fn the_same_swordsman_on_three_character_sheets_spans_a_real_difficulty_range() {
    // **The claim this whole milestone exists to make good on**, and it is a
    // claim about the *sim* rather than about the AI: one `DuelistPolicy`, one
    // set of weights, one Warrior body, three values of intellect and
    // perception, against an unchanged Brute.
    //
    // Measured over 240 seeds (this test runs 96, so it asserts bands rather
    // than these numbers), every rung monotone and not one draw anywhere on it:
    //
    // | wits            | wins | health it finishes on |
    // |-----------------|------|-----------------------|
    // | int 0  / per 0  |  29% |                  0.08 |
    // | int 1  / per 2  |  53% |                  0.15 |
    // | int 2  / per 2  |  73% |                  0.22 |
    // | int 3  / per 3  |  88% |                  0.36 |
    // | int 8  / per 6  |  99% |                  0.57 |
    // | int 12 / per 10 | 100% |                  0.70 |
    // | int 19 / per 18 | 100% |                  0.73 |
    //
    // Re-measured when bodies gained momentum, and the top of the range paid
    // for it: the sharp sheet used to finish on 0.82 and now finishes on 0.73.
    // That is the physics rather than a regression to chase. Being nearly
    // untouchable depended on stepping out of an arc after reading it, and a
    // body that needs fourteen ticks to reach its own top speed cannot -- swept
    // at the sharp sheet, `evasion` is *identical* from 0.0 to 0.76 (the stance
    // is never chosen) and collapses the fight to 20% at 1.2. Dodging lost to
    // blocking and out-tempoing, which is both realistic and a live question
    // for the next evolution run rather than a settled one.
    //
    // Re-measured again when weapons became physical. Wins rose at every rung
    // and health fell at the dim end, so the spread now lives mostly in the
    // health column: the dull sheet scrapes through on 0.15 where it used to win
    // comfortably on 0.33. The bounds below still pin ordering and spread rather
    // than these numbers, but note that `dull.win_rate() < 0.55` is the tightest
    // of them -- it measured 53% over 240 seeds and this test runs 96. If it
    // starts flapping, the fix is a stronger Brute (knockback is what its reach
    // is waiting on), not a looser bound.
    //
    // Dull loses more often than it wins, capable wins on about half its
    // health, and sharp wins every time and barely gets touched. None of that
    // was reachable before: the dim end of the range used to *win* two fights in
    // three, because a Brute's cut was cut off short of its own line every time
    // it swung, and because the health axis had only three or four blows of
    // resolution on it.
    //
    // Bounds are loose on purpose -- these are win rates over 96 seeds, not
    // constants -- and what they pin is the *ordering and the spread*, which is
    // the thing that took work and the thing that will silently rot.
    let dull = tier(1, 2);
    let capable = tier(8, 6);
    let sharp = tier(19, 18);

    assert!(
        dull.win_rate() < 0.55,
        "the dull sheet won {:.0}%, which is not losing",
        dull.win_rate() * 100.0
    );
    assert!(
        dull.win_rate() > 0.25,
        "the dull sheet won {:.0}% -- that is hopeless rather than outmatched, \
         and a bottom rung nobody can reach is not a rung",
        dull.win_rate() * 100.0
    );
    assert!(
        capable.win_rate() > 0.85,
        "the capable sheet won only {:.0}%",
        capable.win_rate() * 100.0
    );
    assert!(
        sharp.win_rate() > 0.95,
        "the sharp sheet won only {:.0}%",
        sharp.win_rate() * 100.0
    );

    // And the health axis, which is the half that stopped being noise when a
    // duel became a dozen landed blows instead of three.
    let (dull_toll, capable_toll, sharp_toll) = (
        toll_when_winning(&dull),
        toll_when_winning(&capable),
        toll_when_winning(&sharp),
    );
    assert!(
        capable_toll > dull_toll && sharp_toll > capable_toll,
        "surviving health did not rise with wits: {dull_toll:.2} / \
         {capable_toll:.2} / {sharp_toll:.2}"
    );
    assert!(
        (0.40..0.70).contains(&capable_toll),
        "the capable sheet finished on {capable_toll:.2}; it is supposed to win \
         at about the cost of half of itself"
    );
    assert!(
        sharp_toll > 0.62,
        "the sharp sheet finished on {sharp_toll:.2}; reading a fight properly \
         is supposed to make it cheap"
    );

    // Every rung has to *resolve*. A difficulty setting whose bottom end wanders
    // off and runs out the clock is not a difficulty setting, and that failure
    // is exactly what the bottom of this range used to look like.
    for (name, record) in [("dull", &dull), ("capable", &capable), ("sharp", &sharp)] {
        assert!(
            record.draw_rate() < 0.05,
            "the {name} sheet drew {:.0}% of its fights",
            record.draw_rate() * 100.0
        );
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
