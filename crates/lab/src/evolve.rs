use crate::fitness::{fitness, Summary};
use fx::{Fx, Rng};
use policy::{run, RunConfig, TeamPolicy, UtilityPolicy, UtilityWeights, GENOME_LEN};
use sim::Scenario;

pub type Genome = [Fx; GENOME_LEN];

pub struct EvolveConfig {
    pub generations: u32,
    pub population: usize,
    /// How many survivors each generation. `(mu + lambda)` with
    /// `mu = elite`, `lambda = population - elite`.
    pub elite: usize,
    /// Scenarios each individual is scored on, per generation.
    pub seeds: usize,
    /// Mutation spread, in gene space (`0..=1`).
    pub sigma: Fx,
    pub threads: usize,
    pub master_seed: u64,
    pub heroes: u32,
    pub monsters: u32,
}

/// Evolves the utility weights against a fixed baseline opponent.
///
/// A `(mu + lambda)` evolution strategy: no gradients, no autodiff, no Python.
/// The point is not that evolution is the best learning algorithm -- it is that
/// this exercises the entire experiment pipeline end to end (batch rollouts,
/// parallelism, fitness, selection) using only the sim, so by the time a neural
/// policy exists, the only new thing is the policy.
///
/// Every individual in a generation is scored on the *same* freshly drawn seed
/// set, which makes the comparison within a generation fair. The seeds change
/// between generations, which stops the population from overfitting to one set
/// of spawn positions. The cost is that fitness is noisy across generations, so
/// "best so far" is genuinely approximate -- an individual can win a generation
/// on a friendly draw.
pub fn evolve(config: &EvolveConfig) -> Genome {
    let mut rng = Rng::new(config.master_seed);
    let elite_count = config.elite.clamp(1, config.population.max(1));

    let mut population: Vec<Genome> = Vec::with_capacity(config.population);
    // Seed the population with the hand-tuned weights, so evolution starts
    // from something competent and any improvement is a real improvement.
    population.push(UtilityWeights::BASELINE.to_genome());
    while population.len() < config.population {
        let mut genome = [Fx::ZERO; GENOME_LEN];
        for gene in genome.iter_mut() {
            *gene = rng.unit();
        }
        population.push(genome);
    }

    let mut best = population[0];
    let mut best_score = Fx::MIN;

    for generation in 0..config.generations {
        let seeds: Vec<u64> = (0..config.seeds).map(|_| rng.next_u64()).collect();
        let scores = evaluate_population(&population, &seeds, config);

        let mut ranking: Vec<usize> = (0..population.len()).collect();
        ranking.sort_by(|&a, &b| scores[b].cmp(&scores[a]).then(a.cmp(&b)));

        let champion = ranking[0];
        if scores[champion] > best_score {
            best_score = scores[champion];
            best = population[champion];
        }

        println!(
            "gen {generation:>3}  best={:<10} {}",
            scores[champion],
            Summary::of(&scores)
        );
        if generation + 1 == config.generations || generation % 10 == 0 {
            println!("            {}", describe(&population[champion]));
        }

        let elites: Vec<Genome> = ranking
            .iter()
            .take(elite_count)
            .map(|&i| population[i])
            .collect();
        let mut next = elites.clone();
        let mut parent = 0;
        while next.len() < config.population {
            next.push(mutate(
                &elites[parent % elites.len()],
                config.sigma,
                &mut rng,
            ));
            parent += 1;
        }
        population = next;
    }

    best
}

/// Scores one genome by averaging fitness over a shared seed set.
///
/// The candidate always plays the heroes and the hand-tuned baseline always
/// plays the monsters, so fitness measures "better than the thing we wrote by
/// hand", which is the question worth asking. Self-play would measure something
/// more interesting and is a natural next step once this works.
pub fn evaluate(genome: &Genome, seeds: &[u64], heroes: u32, monsters: u32) -> Fx {
    let config = RunConfig::default();
    let mut candidate = UtilityPolicy::from_genome(genome);
    let mut incumbent = UtilityPolicy::baseline();
    let mut total: i64 = 0;

    for &seed in seeds {
        let scenario = Scenario::skirmish(seed, heroes, monsters);
        let team = TeamPolicy::new(&mut candidate, &mut incumbent);
        total += fitness(&run(&scenario, seed, team, &config)).raw() as i64;
    }

    if seeds.is_empty() {
        Fx::ZERO
    } else {
        Fx::from_raw((total / seeds.len() as i64) as i32)
    }
}

fn evaluate_population(population: &[Genome], seeds: &[u64], config: &EvolveConfig) -> Vec<Fx> {
    let mut scores = vec![Fx::ZERO; population.len()];
    if population.is_empty() {
        return scores;
    }
    let threads = config.threads.max(1);
    let chunk = population.len().div_ceil(threads);
    let (heroes, monsters) = (config.heroes, config.monsters);

    // Chunked rather than one thread per individual: rollouts are milliseconds
    // and thread spawn is not free. Results land in index order regardless of
    // which thread finished first, so the run stays reproducible.
    std::thread::scope(|scope| {
        for (genomes, out) in population.chunks(chunk).zip(scores.chunks_mut(chunk)) {
            scope.spawn(move || {
                for (i, genome) in genomes.iter().enumerate() {
                    out[i] = evaluate(genome, seeds, heroes, monsters);
                }
            });
        }
    });

    scores
}

fn mutate(genome: &Genome, sigma: Fx, rng: &mut Rng) -> Genome {
    let mut child = *genome;
    for gene in child.iter_mut() {
        *gene = (*gene + rng.gaussian(sigma)).clamp(Fx::ZERO, Fx::ONE);
    }
    child
}

pub fn describe(genome: &Genome) -> String {
    let weights = UtilityWeights::from_genome(genome);
    UtilityWeights::labels()
        .iter()
        .zip(weights.values())
        .map(|(label, value)| format!("{label}={value}"))
        .collect::<Vec<_>>()
        .join("  ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn evolution_is_reproducible_across_thread_counts() {
        // The whole experiment lab is worthless if the answer depends on how
        // many cores happened to be free.
        let base = EvolveConfig {
            generations: 2,
            population: 6,
            elite: 2,
            seeds: 2,
            sigma: Fx::from_ratio(2, 10),
            threads: 1,
            master_seed: 4242,
            heroes: 2,
            monsters: 2,
        };
        let single = evolve(&base);
        let many = evolve(&EvolveConfig { threads: 4, ..base });
        assert_eq!(single, many);
    }

    #[test]
    fn identical_genomes_score_identically() {
        let genome = UtilityWeights::BASELINE.to_genome();
        let seeds = [1u64, 2, 3];
        assert_eq!(
            evaluate(&genome, &seeds, 3, 3),
            evaluate(&genome, &seeds, 3, 3)
        );
    }

    #[test]
    fn fitness_discriminates_between_policies() {
        // The floor test for the whole experiment pipeline. If random genomes
        // all score the same, selection has nothing to select on and every
        // "evolved" result above this is noise.
        //
        // Note what this deliberately does *not* assert: that the hand-tuned
        // baseline beats random genomes. It frequently does not -- a random
        // draw beat it in generation 0 of the first run of `lab evolve`, which
        // is a fact about how good eight hand-picked numbers are, not a bug.
        let seeds: Vec<u64> = (0..6).collect();
        let mut rng = Rng::new(90210);
        let mut scores = Vec::new();
        for _ in 0..8 {
            let mut genome = [Fx::ZERO; GENOME_LEN];
            for gene in genome.iter_mut() {
                *gene = rng.unit();
            }
            scores.push(evaluate(&genome, &seeds, 4, 4));
        }
        scores.push(evaluate(
            &UtilityWeights::BASELINE.to_genome(),
            &seeds,
            4,
            4,
        ));

        let best = scores.iter().copied().fold(Fx::MIN, Fx::max);
        let worst = scores.iter().copied().fold(Fx::MAX, Fx::min);
        assert!(
            best - worst > Fx::from_int(5),
            "fitness barely varies across policies (worst {worst}, best {best}); \
             selection would have nothing to work with"
        );
    }

    #[test]
    fn evolution_improves_on_what_it_started_from() {
        // Two generations is not enough to prove evolution works, but it is
        // enough to prove the loop is wired up: selection, mutation and
        // re-evaluation must at minimum not make things worse.
        let config = EvolveConfig {
            generations: 4,
            population: 10,
            elite: 3,
            seeds: 4,
            sigma: Fx::from_ratio(15, 100),
            threads: 2,
            master_seed: 7,
            heroes: 4,
            monsters: 4,
        };
        let evolved = evolve(&config);
        let holdout: Vec<u64> = (5000..5008).collect();
        let start = UtilityWeights::BASELINE.to_genome();
        let evolved_score = evaluate(&evolved, &holdout, 4, 4);
        let start_score = evaluate(&start, &holdout, 4, 4);
        assert!(
            evolved_score >= start_score - Fx::from_int(25),
            "four generations left us far behind the starting point \
             (evolved {evolved_score}, baseline {start_score})"
        );
    }
}
