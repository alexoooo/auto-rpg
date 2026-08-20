//! The decision clock: who is offered a decision this tick, and what happens to
//! one nobody answers.
//!
//! **This file was the navigation flow field and no longer is.** `refresh_nav`
//! rebuilt a distance field per (faction, opens_doors) pair in the epilogue of
//! every tick, and `nav_arm`, `reachable_point`, `nav_goal_point` and `nav_step`
//! read headings out of it. All five had zero production callers by the time
//! they were deleted -- the policy adapters that consumed a heading went with
//! the legacy seam, `Observation` carries no navigation column, and
//! the browser's route exports were already gone -- so the search ran on every
//! fight and nothing collected the answer. [`World::set_order`] holds the note
//! about what that costs and what giving the channel a reader again would take;
//! `docs/design/navigation-visibility.md` holds the design.
//!
//! What is left is the half `movement` was always kept apart from: a route was a
//! question about the floor plan and a step is a question about momentum, and
//! this is neither -- it is the clock that decides *when* a body is asked.

use super::*;

impl World {
    /// An agent that was offered a decision and given none keeps its standing
    /// command, but its clock still advances -- otherwise it would be re-offered
    /// every tick forever.
    pub(super) fn expire_unanswered_decisions(&mut self) {
        for k in 0..self.pending.len() {
            let id = self.pending[k];
            if let Some(i) = self.resolve(id) {
                if self.next_decision[i] <= self.tick {
                    self.next_decision[i] = self.tick + self.stats[i].decision_period() as u32;
                }
            }
        }
    }

    pub(super) fn refresh_pending(&mut self) {
        self.pending.clear();
        for i in 0..self.alive.len() {
            if self.alive[i] && self.next_decision[i] <= self.tick {
                self.pending.push(self.id_of(i));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world::testkit::*;

    #[test]
    fn everyone_wants_to_decide_on_tick_zero() {
        let w = duel_world();
        assert_eq!(w.pending_decisions().len(), 2);
        assert_eq!(w.tick(), 0);
        assert_eq!(w.outcome(), None);
    }

    #[test]
    fn decision_cadence_follows_intellect() {
        let mut w = duel_world();
        let hero = w.alive_ids(Faction::Heroes)[0];
        let brute = w.alive_ids(Faction::Monsters)[0];
        let hero_period = Stats::decision_period(w.view(hero).unwrap().stats) as u32;
        let brute_period = Stats::decision_period(w.view(brute).unwrap().stats) as u32;
        assert!(
            hero_period < brute_period,
            "the fighter should out-think the brute"
        );

        let mut hero_decisions = 0;
        let mut brute_decisions = 0;
        for _ in 0..600 {
            for id in w.pending_decisions().to_vec() {
                if id == hero {
                    hero_decisions += 1;
                } else {
                    brute_decisions += 1;
                }
            }
            w.step();
        }
        assert!(
            hero_decisions > brute_decisions,
            "hero {hero_decisions} vs brute {brute_decisions}"
        );
    }

    #[test]
    fn an_unanswered_decision_does_not_spin() {
        let mut w = duel_world();
        let before = w.pending_decisions().len();
        assert!(before > 0);
        w.step(); // submit nothing at all
        assert!(
            w.pending_decisions().is_empty(),
            "entities were re-offered a decision immediately"
        );
    }
}
