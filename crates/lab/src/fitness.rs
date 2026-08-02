use fx::Fx;
use policy::RunResult;
use sim::Outcome;

/// How good was this run, from the heroes' point of view?
///
/// The shape matters more than the constants. Winning dominates everything, so
/// search cannot trade a loss for a prettier margin; surviving health comes
/// second, which is what distinguishes a clean win from a pyrrhic one; damage
/// dealt is a small term that gives a gradient to policies that lose, so a
/// generation of losers can still be ranked; and a mild time penalty stops
/// stalling from being a viable strategy.
///
/// That last one is the important one. Without it, "run away and survive to the
/// tick limit" scores better than "attack and sometimes die", and evolution
/// will find that out long before you do.
pub fn fitness(result: &RunResult) -> Fx {
    let win = match result.outcome {
        Outcome::HeroesWin => Fx::from_int(100),
        Outcome::MutualDestruction => Fx::from_int(20),
        Outcome::Draw => Fx::ZERO,
        Outcome::MonstersWin => Fx::ZERO,
    };
    let survival = result.hero_health * Fx::from_int(50);
    let aggression = result.hero_damage / Fx::from_int(20);
    let dithering = Fx::from_ratio(result.ticks.min(100_000) as i32, 600);
    win + survival + aggression - dithering
}

/// Distribution of a batch of fitness values.
///
/// Accumulated in `i64` raw units: a thousand runs at a fitness of 150 would
/// overflow a 16.16 sum long before the mean was computed.
#[derive(Clone, Debug, Default)]
pub struct Summary {
    pub count: usize,
    pub mean: Fx,
    pub min: Fx,
    pub p25: Fx,
    pub median: Fx,
    pub p75: Fx,
    pub max: Fx,
}

impl Summary {
    pub fn of(values: &[Fx]) -> Summary {
        if values.is_empty() {
            return Summary::default();
        }
        let mut sorted: Vec<Fx> = values.to_vec();
        sorted.sort();
        let sum: i64 = sorted.iter().map(|v| v.raw() as i64).sum();
        let at = |fraction: usize| -> Fx {
            let index = (sorted.len() - 1) * fraction / 100;
            sorted[index]
        };
        Summary {
            count: sorted.len(),
            mean: Fx::from_raw((sum / sorted.len() as i64) as i32),
            min: sorted[0],
            p25: at(25),
            median: at(50),
            p75: at(75),
            max: sorted[sorted.len() - 1],
        }
    }
}

impl std::fmt::Display for Summary {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "n={:<6} mean={:<10} min={:<10} p25={:<10} med={:<10} p75={:<10} max={}",
            self.count, self.mean, self.min, self.p25, self.median, self.p75, self.max
        )
    }
}

/// Win/loss/draw tally.
#[derive(Clone, Copy, Debug, Default)]
pub struct Tally {
    pub wins: usize,
    pub losses: usize,
    pub draws: usize,
    pub mutual: usize,
    pub total_ticks: u64,
    pub runs: usize,
}

impl Tally {
    pub fn add(&mut self, result: &RunResult) {
        match result.outcome {
            Outcome::HeroesWin => self.wins += 1,
            Outcome::MonstersWin => self.losses += 1,
            Outcome::Draw => self.draws += 1,
            Outcome::MutualDestruction => self.mutual += 1,
        }
        self.total_ticks += result.ticks as u64;
        self.runs += 1;
    }

    pub fn mean_ticks(&self) -> u64 {
        if self.runs == 0 {
            0
        } else {
            self.total_ticks / self.runs as u64
        }
    }

    /// Win rate in percent, integer.
    pub fn win_rate(&self) -> u64 {
        if self.runs == 0 {
            0
        } else {
            self.wins as u64 * 100 / self.runs as u64
        }
    }
}

impl std::fmt::Display for Tally {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{} wins, {} losses, {} draws, {} mutual ({}% win rate, {} ticks avg)",
            self.wins,
            self.losses,
            self.draws,
            self.mutual,
            self.win_rate(),
            self.mean_ticks()
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn summary_of_a_known_set() {
        let values: Vec<Fx> = (1..=101).map(Fx::from_int).collect();
        let s = Summary::of(&values);
        assert_eq!(s.count, 101);
        assert_eq!(s.min, Fx::from_int(1));
        assert_eq!(s.max, Fx::from_int(101));
        assert_eq!(s.median, Fx::from_int(51));
        assert_eq!(s.mean, Fx::from_int(51));
        assert_eq!(s.p25, Fx::from_int(26));
        assert_eq!(s.p75, Fx::from_int(76));
    }

    #[test]
    fn summary_of_nothing_does_not_panic() {
        let s = Summary::of(&[]);
        assert_eq!(s.count, 0);
    }

    #[test]
    fn the_mean_survives_more_runs_than_a_fixed_point_sum_could() {
        // 5000 runs at 150 would overflow a 16.16 accumulator.
        let values = vec![Fx::from_int(150); 5000];
        assert_eq!(Summary::of(&values).mean, Fx::from_int(150));
    }
}
