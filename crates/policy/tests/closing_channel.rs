//! **No policy in this simulation can tell an approaching body from a receding
//! one**, measured on the corpus fixture rather than argued from the formula.
//!
//! This is the test behind the session-03 guard's departure 2. The plan for that
//! session spelled rule 1 as three cases -- *receding, stationary, or further
//! away than a stride* -- and only the third landed, as a range gate. The reason
//! is not that `contact_timing` saturates, which was the first answer and is only
//! half of it: the sim's own closing term is a signed projection with no
//! saturating boundary, and recomputing it in a policy from
//! `ObservedOpponent::body_position` and `ObservedOpponent::body_velocity` is a
//! supported operation that `World::observe_articulated`'s own comment invites.
//!
//! It still cannot be read, because the velocity column is blurred by
//! `jitter[3..5] * noise / 4` before the sim ever projects it. At the shipped
//! duel's stats that error is 0.225 world units per tick for the Fighter's eye
//! and 0.300 for the Brute's, against a whole achievable closing range of
//! `move_speed(6) + move_speed(2) = 0.0994`. The signal sits two to three times
//! under its own noise floor.
//!
//! `embodied_guard.rs`'s
//! `the_closing_judgement_rule_1_asks_for_is_under_the_noise_it_would_read`
//! holds that ratio against `sim`'s published stats and costs nothing. This file
//! is the other half: what the ratio does to a real fight, driven, over the
//! fixture the corpus is measured on. Both are wanted -- the arithmetic says why,
//! and this says how much.
//!
//! **The strongest form of the result is the third assertion below**: the
//! recomputed sign is a *worse* predictor than a policy that never believes
//! anything is closing. Bounded from both sides on purpose, because an
//! anti-correlated column would be readable inverted and would not be a dead
//! channel at all.
//!
//! Deliberately no floating point, in a crate that must not gain any: every rate
//! below is an integer comparison of two counts, and the report is in basis
//! points.

use fx::{Fx, Vec2, Vec3};
use policy::{EmbodiedPolicy, TacticalConfig, TacticalEmbodiedPolicy};
use sim::{EntityId, Faction, Scenario, World};

/// How many seeds of the fixture to drive. Twenty is enough that the counts
/// below are in the thousands and few enough that this test stays under ten
/// seconds; the answer is a pure function of the fixture, the seeds and the
/// policy, so there is nothing here to average away by taking more.
const SEEDS: u64 = 20;

/// The velocity noise the Fighter's eye carries, in `Fx` raw: a quarter of
/// `perception_noise()` at perception 6. Written as the ratio it is rather than
/// as a number, so a change to `Stats::perception_noise` moves it here too.
fn fighter_velocity_noise() -> Fx {
    sim::Body::Fighter.base_stats().perception_noise() / Fx::from_int(4)
}

fn planar(v: Vec3) -> Vec2 {
    Vec2::new(v.x, v.y)
}

/// One tally of the same question asked two ways.
#[derive(Default)]
struct Tally {
    ticks: u64,
    /// Ticks on which the observed sign and the true sign agree.
    agree: u64,
    /// Truly closing, and truly not: the two classes, so neither can be empty.
    truly_closing: u64,
    truly_not: u64,
    /// Read as closing while truly closing, and while truly not.
    seen_closing_when_closing: u64,
    seen_closing_when_not: u64,
    /// The same pair at a deadband set to the velocity noise itself, which is the
    /// only threshold that could plausibly filter it.
    admitted_when_closing: u64,
    admitted_when_not: u64,
}

impl Tally {
    fn observe(&mut self, truly_closing: bool, observed: Fx, deadband: Fx) {
        self.ticks += 1;
        let seen = observed.is_positive();
        self.agree += u64::from(seen == truly_closing);
        let admitted = observed > deadband;
        if truly_closing {
            self.truly_closing += 1;
            self.seen_closing_when_closing += u64::from(seen);
            self.admitted_when_closing += u64::from(admitted);
        } else {
            self.truly_not += 1;
            self.seen_closing_when_not += u64::from(seen);
            self.admitted_when_not += u64::from(admitted);
        }
    }
}

/// Basis points of `part` in `whole`, in integers, for the report only.
fn bp(part: u64, whole: u64) -> u64 {
    part * 10_000 / whole.max(1)
}

/// Drives `SEEDS` seeds of `embodied-duel-v1` and tallies, on every decision
/// tick, whether a closing judgement recomputed from the published columns
/// agrees with the one taken from ground truth.
///
/// The observed side uses exactly what a policy has: the subject's own exact
/// `body_position` and `body_velocity`, and the opponent's measured ones. The
/// true side reads `World::articulated_pose`, which is documented as ground
/// truth with no perception noise and no visibility filtering, for both bodies.
/// The two differ in the noise and in nothing else.
fn drive() -> Tally {
    let scenario = Scenario::embodied_duel();
    let deadband = fighter_velocity_noise();
    let mut tally = Tally::default();
    for seed in 0..SEEDS {
        let mut world = World::new(&scenario, seed);
        let mut hero = TacticalEmbodiedPolicy::new(TacticalConfig::READING);
        let mut monster = TacticalEmbodiedPolicy::new(TacticalConfig::READING);
        let heroes = world.alive_ids(Faction::Heroes);
        let mut due: Vec<EntityId> = Vec::new();
        while world.outcome().is_none() && world.tick() < scenario.max_ticks {
            due.clear();
            due.extend_from_slice(world.pending_decisions());
            for &id in &due {
                let obs = world.observe_articulated(id);
                if obs.opponent_count > 0 {
                    let foe = obs.opponents[0];
                    // Both poses, or neither: a body that has just died has no
                    // pose and there is nothing to compare.
                    if let (Some(me), Some(them)) =
                        (world.articulated_pose(id), world.articulated_pose(foe.id))
                    {
                        let truth = planar(me.body_velocity - them.body_velocity)
                            .dot(planar(them.body - me.body).normalize());
                        let observed = planar(obs.body_velocity - foe.body_velocity)
                            .dot(planar(foe.body_position - obs.body_position).normalize());
                        tally.observe(truth.is_positive(), observed, deadband);
                    }
                }
                // The fight is driven whatever the tally saw, or the two bodies
                // never close and the measurement is about an empty room.
                let command = if heroes.contains(&id) {
                    hero.decide(&obs)
                } else {
                    monster.decide(&obs)
                };
                world.submit_embodied_v1(id, command);
            }
            let _ = world.step();
        }
    }
    tally
}

#[test]
fn no_published_column_separates_an_approach_from_a_retreat() {
    let tally = drive();
    // The fixture ran and both classes are populated. Without this the rates
    // below are satisfied by a fight that never happened -- the first of the two
    // shapes `AGENTS.md` names, a setup that already satisfies its assertion.
    assert!(tally.ticks > 5_000, "the fixture produced almost no decisions: {}", tally.ticks);
    assert!(tally.truly_closing > 500, "nothing ever closed, so there is nothing to read");
    assert!(tally.truly_not > 500, "nothing was ever still or receding");

    // Bounded from both sides. Above: the sign carries no usable information.
    // Below: it is not usable *inverted* either, which an anti-correlated column
    // would be -- a channel that is reliably wrong is a channel.
    let agreement = bp(tally.agree, tally.ticks);
    assert!(
        (4_500..=6_000).contains(&agreement),
        "the recomputed closing sign is no longer a coin flip: {agreement} basis points \
         agreement over {} ticks",
        tally.ticks,
    );

    // The strongest form, and the one that settles it: believing the column is
    // worse than never believing anything is closing at all.
    assert!(
        tally.agree < tally.truly_not,
        "the column now beats the constant answer: {} agreements against {} ticks that were \
         simply not closing",
        tally.agree,
        tally.truly_not,
    );

    // The plan's own two cases, which are the ones that had to be dropped: a body
    // that is genuinely receding or standing still reads as closing about half
    // the time.
    let false_closing = bp(tally.seen_closing_when_not, tally.truly_not);
    assert!(
        (4_000..=6_000).contains(&false_closing),
        "a receding or stationary body no longer reads as closing at chance: {false_closing} \
         basis points",
    );

    // And no deadband rescues it. At a threshold set to the velocity noise
    // itself, the gate refuses most genuine approaches and still admits
    // retreats, so it is not separating them -- it is thinning both.
    let admitted_closing = bp(tally.admitted_when_closing, tally.truly_closing);
    let admitted_not = bp(tally.admitted_when_not, tally.truly_not);
    assert!(
        admitted_closing < 2_000,
        "a deadband at the noise now admits most real approaches: {admitted_closing} basis points",
    );
    assert!(
        admitted_not > 200,
        "a deadband at the noise now refuses retreats outright: {admitted_not} basis points",
    );
    assert!(
        admitted_closing < 3 * admitted_not,
        "the deadband has become a discriminator: {admitted_closing} against {admitted_not}",
    );
}
