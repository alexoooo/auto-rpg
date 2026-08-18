//! Orders, objectives, flow fields and the decision clock.
//!
//! `refresh_nav` rebuilds a distance field per (faction, opens_doors) pair and
//! `nav_step` reads a heading out of it. Kept apart from `movement` because a
//! route is a question about the floor plan and a step is a question about
//! momentum, and only one of them is allowed to fail.

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

    /// Which arm of [`World::nav`] answers for this body.
    ///
    /// The second arm exists only while something is still shut, so this is
    /// where "there is nothing to route around" and "this body could not open
    /// it anyway" become the same answer. One rule read by both the builder and
    /// the reader, so the two cannot disagree about which fields exist:
    /// [`World::refresh_nav`] builds the second arm for a side exactly when
    /// some living body on it would land here on `1`.
    ///
    /// A body that came into existence *since* the last refresh is the one gap
    /// in that pairing, and it is not reachable: [`World::refresh_pending`] and
    /// [`World::refresh_nav`] run back to back at the bottom of the same
    /// [`World::step`] over the same alive set, so nothing can be offered a
    /// decision in a tick where the field it reads was not built for it.
    fn nav_arm(&self, i: usize) -> usize {
        usize::from(self.door_shut() && self.kind[i].opens_doors())
    }

    pub(super) fn refresh_pending(&mut self) {
        self.pending.clear();
        for i in 0..self.alive.len() {
            if self.alive[i] && self.next_decision[i] <= self.tick {
                self.pending.push(self.id_of(i));
            }
        }
    }

    /// Rebuilds each faction's route field, if what it was built for has moved.
    ///
    /// Sits beside [`World::refresh_pending`] and runs at the same moment for
    /// the same reason: both are derivations of the state the caller is about
    /// to observe, so computing them together is what makes an observation
    /// taken between two steps describe *one* world rather than a mix of two.
    ///
    /// Costs nothing on a world with no objective -- the seed list comes back
    /// empty, the key is stable, and no search runs. That is every scenario the
    /// lab drives.
    pub(super) fn refresh_nav(&mut self) {
        // Written as one function with no `self` method calls so the borrow
        // checker can see that the scratch buffers and the columns being read
        // are different fields.
        for side in 0..2 {
            // The one thing that cannot be written that way, so it is settled
            // before the scratch buffer is in hand: `resolve` is a method on
            // the whole of `self`, and no amount of field-splitting lets that
            // sit inside a live borrow of `self.nav_seeds`.
            //
            // Both guards live here rather than beside the seeding, because
            // together they are one question -- "is there a body this side is
            // entitled to route at" -- and `None` is the same answer whichever
            // way it fails.
            let quarry = match self.orders[side] {
                Order::Focus(id) => match self.resolve(id) {
                    Some(j) if self.faction[j].index() != side => Some(j),
                    _ => None,
                },
                _ => None,
            };
            let seeds = &mut self.nav_seeds;
            seeds.clear();
            match self.objectives[side] {
                Objective::None => {}
                Objective::Order => match self.orders[side] {
                    // A destination names a place, and so does a quarry -- it
                    // just walks about, which the key below already notices.
                    // Every other order is a statement about how to fight, and
                    // routing toward an `Advance` or a `Regroup` would be
                    // inventing a meaning neither of them has.
                    Order::Goto(dest) => {
                        if let Some(cell) = self.dungeon.goal_cell(dest) {
                            seeds.push(cell);
                        }
                    }
                    // Seeding the named body's cell is the search
                    // `Objective::Hunt` runs just below, narrowed from every
                    // enemy to the one that was pointed at.
                    //
                    // Silent on a handle that does not resolve, on a corpse,
                    // and on one of your own: an empty seed list is an empty
                    // field, `nav_step` reports no route, and no route is a
                    // stop. That is already the answer a `Goto` sealed behind
                    // masonry gets, and it is the answer the policy layer is
                    // written against -- so the three ways a `Focus` can name
                    // nobody need no handling of their own anywhere above here.
                    Order::Focus(_) => {
                        if let Some(j) = quarry {
                            if let Some(cell) = self.dungeon.goal_cell(self.pos[j]) {
                                seeds.push(cell);
                            }
                        }
                    }
                    _ => {}
                },
                Objective::Hunt => {
                    for j in 0..self.alive.len() {
                        if !self.alive[j] || self.faction[j].index() == side {
                            continue;
                        }
                        if let Some(cell) = self.dungeon.goal_cell(self.pos[j]) {
                            seeds.push(cell);
                        }
                    }
                    // Canonical: two quarry in one tile must not seed it twice,
                    // and the search must not depend on which of them was
                    // spawned first.
                    seeds.sort_unstable();
                    seeds.dedup();
                }
            }

            // One arm unless something on the level is still shut. The two
            // searches differ only where a `DOOR` tile is, so on a plan with
            // none -- every duel, every skirmish, and a dungeon level once its
            // last door has been opened -- the second arm is the first one
            // computed twice, and this runs every tick.
            //
            // **And unless somebody on this side can read it**, which is the
            // other half of the same question and is written as the exact
            // mirror of [`World::nav_arm`]: that returns `1` for a body that is
            // resolvable -- so alive -- on this side and holding hands, and a
            // side with no such body never asks for the second field. Building
            // it anyway is a full search over every tile on the floor, every
            // tick, for an answer nobody collects. The shipped floor plan is
            // exactly that case: Monsters hunt, Monsters are Brutes and
            // Skitterers, and none of them opens a door. Worth 14% of a tick on
            // the carved bench with an objective set.
            //
            // The seeding above is outside this loop on purpose: what a faction
            // is trying to reach does not depend on whether it has hands.
            // The door scan first, so the roster scan is not paid on every
            // scenario that has no doors at all -- which is all of them but the
            // dungeon.
            let arms = 1 + usize::from(
                self.doors.iter().any(|d| !d.open)
                    && (0..self.alive.len()).any(|i| {
                        self.alive[i]
                            && self.faction[i].index() == side
                            && self.kind[i].opens_doors()
                    }),
            );
            for arm in 0..arms {
                let opens_doors = arm == 1;
                // **The invalidation is already correct and needs no work**,
                // which is worth saying so nobody adds a second mechanism: this
                // key hashes `dungeon.fingerprint()`, so a door that opens
                // changes the fingerprint, changes the key, and every field
                // rebuilds on its next refresh.
                //
                // The capability has to be in the key too, or the two arms
                // collide on it and the second one silently answers with the
                // first one's field.
                let mut h = Hash64::new();
                h.write_u64(self.dungeon.fingerprint());
                h.write_bool(opens_doors);
                h.write_u8(self.objectives[side].discriminant() as u8);
                for &cell in self.nav_seeds.iter() {
                    h.write_u32(cell);
                }
                let key = h.finish();
                if key == self.nav[side][arm].key && !self.nav[side][arm].dist.is_empty() {
                    continue;
                }
                self.nav[side][arm].key = key;
                self.dungeon.distances_for(
                    &self.nav_seeds,
                    opens_doors,
                    &mut self.nav[side][arm].dist,
                    &mut self.nav_queue,
                );
            }
        }
    }

    /// `at`, moved to the nearest spot a body as wide as `i` could actually
    /// stand.
    ///
    /// **The reachable point, not the raw click.** A destination inside masonry
    /// -- or merely nearer a wall than this body is wide -- is not somewhere
    /// anybody can arrive, and aiming at it leaves the character pressing into
    /// the wall forever, never satisfying an arrival test it cannot satisfy.
    /// This is the clamp the policy layer used to do for itself out of
    /// `wall_clearance`, moved to the one place that holds the floor plan and
    /// generalised from "the arena box" to "the masonry". Per body, because how
    /// close you can get depends on how wide you are.
    ///
    /// The box clamp first, and it is not redundant with the masonry step. A
    /// destination can arrive from the page as a wrapped `i32` -- tens of
    /// thousands of world units out -- and at that magnitude every `Fx`
    /// subtraction inside `nearest_clear` saturates, so its tie-break hands back
    /// whichever tile it scanned first rather than the nearest one. Bringing the
    /// point inside the arena first keeps the arithmetic in range, and the
    /// answer honest: a click off the edge of the world means the edge of the
    /// world.
    ///
    /// A living body is already inside the arena, so that first clamp is dead
    /// weight when the point came off a quarry rather than off a click. It stays
    /// anyway: one rule for both callers is cheaper to hold in the head than an
    /// argument about which of them has earned the shortcut, and the cost is a
    /// pair of comparisons.
    fn reachable_point(&self, i: usize, at: Vec2) -> Vec2 {
        let r = self.radius[i];
        let inside = at.clamp_box(
            Vec2::new(r, r),
            Vec2::new(self.arena.x - r, self.arena.y - r),
        );
        self.dungeon.nearest_clear(inside, r)
    }

    /// The place `i`'s faction is actually trying to get to, if the objective
    /// names one.
    ///
    /// Ground truth and not perception, like [`World::enemy_in_sight`]: this
    /// decides whether the straight line is *walkable*, which is a fact about
    /// the level rather than a judgement the character makes.
    fn nav_goal_point(&self, i: usize) -> Option<Vec2> {
        let side = self.faction[i].index();
        match self.objectives[side] {
            Objective::None => None,
            Objective::Order => match self.orders[side] {
                Order::Goto(dest) => Some(self.reachable_point(i, dest)),
                // A quarry is pulled out of the masonry exactly as a click is,
                // and for the same reason: a body standing in a doorway or hard
                // against a wall is not somewhere a wider hunter can arrive.
                //
                // The two guards repeat `refresh_nav`'s, and they have to. This
                // is a second, independent reading of the same order, and an
                // answer here without seeds there would hand `nav_step`'s
                // shortcut a straight line to a place the field never routed to
                // -- which is worse than either half alone, because it is a
                // route that looks walkable right up until the wall.
                Order::Focus(id) => {
                    let j = self.resolve(id)?;
                    if self.faction[j].index() == side {
                        return None;
                    }
                    Some(self.reachable_point(i, self.pos[j]))
                }
                _ => None,
            },
            // The nearest quarry by straight line, which is what the shortcut
            // below wants to know about: whether this one can simply be walked
            // at. Which quarry the *field* points to may well be another.
            Objective::Hunt => {
                let mut best: Option<(Fx, Vec2)> = None;
                for j in 0..self.alive.len() {
                    if !self.alive[j] || self.faction[j].index() == side {
                        continue;
                    }
                    let d = (self.pos[j] - self.pos[i]).length();
                    match best {
                        Some((seen, _)) if seen <= d => {}
                        _ => best = Some((d, self.pos[j])),
                    }
                }
                best.map(|(_, at)| at)
            }
        }
    }

    /// Which way `i` should walk, and how much ground is left along that route.
    ///
    /// `(Vec2::ZERO, Fx::MAX)` means there is no route -- no objective, or one
    /// sealed off behind masonry. `(Vec2::ZERO, Fx::ZERO)` means arrived.
    pub(super) fn nav_step(&self, i: usize) -> (Vec2, Fx) {
        let side = self.faction[i].index();
        // A body penned behind a shut door it cannot open reads `u16::MAX` at
        // its own cell and falls out three lines below with no route -- which is
        // already what `UtilityPolicy` is written against, being the same answer
        // a `Goto` sealed behind masonry has always got. Nothing new is needed
        // to make a Skitterer wait.
        let dist = &self.nav[side][self.nav_arm(i)].dist;
        let me = self.pos[i];
        let Some(cell) = self.dungeon.cell_of(me) else {
            return (Vec2::ZERO, Fx::MAX);
        };
        let Some(&here) = dist.get(cell as usize) else {
            return (Vec2::ZERO, Fx::MAX);
        };
        if here == u16::MAX {
            return (Vec2::ZERO, Fx::MAX);
        }

        // 1. **Straight there, whenever straight there works.** Without this the
        //    field is followed tile centre to tile centre: a character crosses
        //    an open room like a chess piece, and -- worse -- an open room stops
        //    behaving the way it does today, because a tile centre is half a
        //    unit off the line the click was actually on.
        //
        //    Not gated on sight. The first version of this asked "is it in
        //    view *and* is the way clear", which quietly meant that a walk
        //    longer than sight range fell back to the grid and wandered off the
        //    straight line by up to half a tile. Clear is clear, however far
        //    away it is; and on a floor plan with nothing carved
        //    `is_walk_clear` answers yes without looking, so every scenario
        //    that is not a dungeon takes this branch every time and behaves
        //    exactly as it always did.
        //
        //    `here == 0` is the last tile, where there is nothing left to route
        //    around.
        if let Some(goal) = self.nav_goal_point(i) {
            let to = goal - me;
            if here == 0 || self.dungeon.is_walk_clear(me, goal, self.radius[i]) {
                return if to.is_zero() {
                    (Vec2::ZERO, Fx::ZERO)
                } else {
                    (to.normalize(), to.length())
                };
            }
        }

        // 2. Downhill, aiming at the neighbour's **centre** rather than along a
        //    cardinal: a unit cardinal has the body hug the wall it is
        //    following, and a corridor is exactly where that costs a corner.
        let (tx, ty) = Dungeon::tile_of(me);
        let mut best: Option<(u16, i32, i32)> = None;
        for dir in Cardinal::ALL {
            let (dx, dy) = dir.step();
            let (nx, ny) = (tx + dx, ty + dy);
            let Some(cell) = self.dungeon.cell(nx, ny) else {
                continue;
            };
            let Some(&d) = dist.get(cell as usize) else {
                continue;
            };
            if d >= here {
                continue;
            }
            // Ties keep the earlier neighbour, and `NEIGHBOURS` is a fixed
            // order, so a body in a corridor junction always picks the same way.
            match best {
                Some((seen, _, _)) if seen <= d => {}
                _ => best = Some((d, nx, ny)),
            }
        }
        let Some((d, nx, ny)) = best else {
            return (Vec2::ZERO, Fx::MAX);
        };
        let to = Dungeon::tile_centre(nx, ny) - me;
        let remaining = Fx::from_int(d as i32) + to.length();
        (to.normalize(), remaining)
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

    /// The opponent the note above says to add: a monster standing at `at`.
    ///
    /// A Skitterer because it is the narrowest body on the roster, so a test
    /// that walks a hero up to it is making a claim about the route rather than
    /// about how two circles settle against one another.
    fn monster_at(w: &mut World, at: Vec2) -> EntityId {
        let mut spec = UnitSpec {
            kind: Body::Skitterer,
            faction: Faction::Monsters,
            stats: Body::Skitterer.base_stats(),
            // **Dressed from the spec table, and it cannot keep its claws.** A
            // loadout slot and an equipment row are one fact checked twice, so a
            // body may only name an action the table carries an item for -- and
            // the table has a sword, a shield and a club. Nothing in these tests
            // is a claim about what the monster holds; what matters is that it is
            // a body standing in a tile.
            loadout: Body::Skitterer.default_loadout(),
            articulated: None,
            spawn: at,
        };
        crate::scenario::equip_fixture_body(&mut spec);
        w.spawn(&spec)
    }

    #[test]
    fn the_flow_field_reaches_every_open_tile_and_only_those() {
        let d = crate::dungeon::parse(&[
            "#######", //
            "#.....#",
            "#.###.#",
            "#.....#",
            "#######",
        ]);
        let mut dist = Vec::new();
        let mut queue = Vec::new();
        let seed = d.cell(1, 1).unwrap();
        d.distances(&[seed], &mut dist, &mut queue);

        let mut reached = 0;
        for ty in 0..d.rows() as i32 {
            for tx in 0..d.cols() as i32 {
                let at = dist[d.cell(tx, ty).unwrap() as usize];
                if d.solid(tx, ty) {
                    assert_eq!(at, u16::MAX, "masonry at ({tx}, {ty}) got a distance");
                } else {
                    assert_ne!(at, u16::MAX, "open ({tx}, {ty}) was never reached");
                    reached += 1;
                }
            }
        }
        assert_eq!(reached, d.open_count());
        assert_eq!(dist[seed as usize], 0);
        // Round the ring the long way or the short way, the far corner is five
        // tiles either side of the block.
        assert_eq!(dist[d.cell(5, 1).unwrap() as usize], 4);
        assert_eq!(dist[d.cell(1, 3).unwrap() as usize], 2);
    }

    #[test]
    fn the_flow_field_does_not_depend_on_how_the_world_got_here() {
        let rows = [
            "########", //
            "#..##..#",
            "#..##..#",
            "#......#",
            "########",
        ];
        // Same floor plan, same quarry tile, arrived at two different ways: one
        // world spawned there, the other walked there.
        let build = |walk: bool| {
            let mut scenario = Scenario::articulated_duel();
            scenario.dungeon = crate::dungeon::parse(&rows);
            scenario.units[0].spawn = Vec2::new(Fx::from_ratio(15, 10), Fx::from_ratio(15, 10));
            scenario.units[1].spawn = Vec2::new(Fx::from_ratio(65, 10), Fx::from_ratio(15, 10));
            let mut w = World::new(&scenario, 1);
            w.set_objective(Faction::Monsters, Objective::Hunt);
            let hero = w.alive_ids(Faction::Heroes)[0].index as usize;
            let villain = w.alive_ids(Faction::Monsters)[0].index as usize;
            w.pos[villain] = Vec2::new(Fx::from_ratio(15, 10), Fx::from_ratio(35, 10));
            w.pos[hero] = if walk {
                Vec2::new(Fx::from_ratio(45, 10), Fx::from_ratio(35, 10))
            } else {
                Vec2::new(Fx::from_ratio(65, 10), Fx::from_ratio(15, 10))
            };
            if walk {
                for _ in 0..200 {
                    crate::world::testkit::lean(&mut w, hero, Vec2::new(Fx::ONE, -Fx::ONE).normalize());
                    w.step();
                }
            }
            w.refresh_nav();
            w
        };
        let spawned = build(false);
        let walked = build(true);
        assert_eq!(
            Dungeon::tile_of(spawned.pos[spawned.alive_ids(Faction::Heroes)[0].index as usize]),
            Dungeon::tile_of(walked.pos[walked.alive_ids(Faction::Heroes)[0].index as usize]),
            "the fixture did not put the quarry in the same tile"
        );
        assert_eq!(
            spawned.nav[Faction::Monsters.index()][0].dist,
            walked.nav[Faction::Monsters.index()][0].dist
        );
    }

    #[test]
    fn an_unreachable_objective_reports_no_heading() {
        // A sealed vault in the north-east. Nothing walks into it.
        let mut w = carved_world(&[
            "########", //
            "#....#.#",
            "#....###",
            "#......#",
            "########",
        ]);
        let id = w.alive_ids(Faction::Heroes)[0];
        w.pos[id.index as usize] = Vec2::new(Fx::from_ratio(15, 10), Fx::from_ratio(15, 10));
        w.set_objective(Faction::Heroes, Objective::Order);
        w.set_order(
            Faction::Heroes,
            Order::Goto(Vec2::new(Fx::from_ratio(65, 10), Fx::from_ratio(15, 10))),
        );
        w.refresh_nav();

        // Read off `nav_step` rather than out of an observation: the legacy
        // observation's `nav_dir` and `nav_distance` columns were copies of
        // exactly this pair, and they went with it.
        assert_eq!(w.nav_step(id.index as usize), (Vec2::ZERO, Fx::MAX));
    }

    #[test]
    fn a_skitterer_behind_a_shut_door_has_no_route_to_the_hero() {
        // The engagement the player opens. A Skitterer's field stops at the
        // door, so its own cell reads `u16::MAX`, `nav_step` reports no route,
        // and `UtilityPolicy` falls through to its open-ground drift -- which is
        // the existing, tested answer for a `Goto` sealed behind masonry.
        // Nothing new was needed to make it wait.
        let mut w = penned_world(Body::Skitterer);
        let monster = w.alive_ids(Faction::Monsters)[0];
        let m = monster.index as usize;
        assert!(!Body::Skitterer.opens_doors());
        assert_eq!(w.nav_step(m), (Vec2::ZERO, Fx::MAX));
        assert_eq!(w.nav_step(m).1, Fx::MAX);

        // And it has one the moment the door is floor. Opened through the
        // world's own doorway rather than by writing tiles, so this is the same
        // edit `press_doors` makes.
        let cells = w.doors[0].door.cells().to_vec();
        w.dungeon.open_door(&cells);
        w.doors[0].open = true;
        w.refresh_nav();

        let (dir, left) = w.nav_step(m);
        assert!(left < Fx::MAX, "no route through an open doorway");
        assert!(dir.x < Fx::ZERO, "the route did not head back west: {dir:?}");
    }

    #[test]
    fn a_fighter_behind_a_shut_door_has_a_route_through_it() {
        // The other arm of `World::nav`, on the identical fixture: one field
        // cannot answer for a faction holding both of these, which is why there
        // are two.
        let mut w = penned_world(Body::Fighter);
        let m = w.alive_ids(Faction::Monsters)[0].index as usize;
        assert_eq!(w.nav_arm(m), 1, "a body that opens doors reads the second arm");

        let (dir, left) = w.nav_step(m);
        assert!(left < Fx::MAX, "a Fighter must route through a shut door");
        assert!(dir.x < Fx::ZERO, "the route did not head toward the door: {dir:?}");

        // The Skitterer standing beside it on the same tick still has none, off
        // the same world -- which is the claim "two arms" is making.
        let mut spec = UnitSpec {
            kind: Body::Skitterer,
            faction: Faction::Monsters,
            stats: Body::Skitterer.base_stats(),
            // **Dressed from the spec table, and it cannot keep its claws.** A
            // loadout slot and an equipment row are one fact checked twice, so a
            // body may only name an action the table carries an item for -- and
            // the table has a sword, a shield and a club. Nothing in these tests
            // is a claim about what the monster holds; what matters is that it is
            // a body standing in a tile.
            loadout: Body::Skitterer.default_loadout(),
            articulated: None,
            spawn: at_tile(6, 1),
        };
        crate::scenario::equip_fixture_body(&mut spec);
        let skitterer = w.spawn(&spec);
        w.refresh_nav();
        let s = skitterer.index as usize;
        assert_eq!(w.nav_arm(s), 0);
        assert_eq!(w.nav_step(s), (Vec2::ZERO, Fx::MAX));
        assert!(w.nav_step(m).1 < Fx::MAX, "and the Fighter still has its own");

        // Once the door is open there is nothing to route around, so the second
        // arm stops being built and both bodies read the first.
        let cells = w.doors[0].door.cells().to_vec();
        w.dungeon.open_door(&cells);
        w.doors[0].open = true;
        w.refresh_nav();
        assert_eq!(w.nav_arm(m), 0, "there is nothing left to route around");
        assert_eq!(w.nav_arm(s), 0);
        assert!(w.nav_step(s).1 < Fx::MAX, "and the Skitterer is loose");
    }

    #[test]
    fn a_route_walks_round_a_wall_rather_than_into_it() {
        //   01234567
        let mut w = carved_world(&[
            "########", // 0
            "#..#...#", // 1
            "#..#...#", // 2
            "#......#", // 3   the way round is south
            "########", // 4
        ]);
        let id = w.alive_ids(Faction::Heroes)[0];
        let i = id.index as usize;
        w.pos[i] = Vec2::new(Fx::from_ratio(15, 10), Fx::from_ratio(15, 10));
        let dest = Vec2::new(Fx::from_ratio(55, 10), Fx::from_ratio(15, 10));
        w.set_objective(Faction::Heroes, Objective::Order);
        w.set_order(Faction::Heroes, Order::Goto(dest));
        w.refresh_nav();

        // The route is honestly longer than the straight line, which is the
        // whole reason the straight-line distance could not be reused: at four
        // units of open air the character would think it was nearly there.
        let (_, remaining) = w.nav_step(i);
        assert!(remaining < Fx::MAX, "there is a way round");
        assert!(remaining > (dest - w.pos[i]).length() + Fx::TWO);

        // Asserted by walking it, because that is the claim. A first step due
        // east is perfectly correct here -- the pillar is two tiles away and
        // the way round leaves from the tile next door -- so asserting on the
        // *heading* would be asserting on the shape of this particular map.
        for tick in 0..400 {
            let (dir, left) = w.nav_step(i);
            if left <= w.stats[i].move_speed() {
                assert!(tick > 40, "arrived in {tick} ticks, which is a straight line");
                return;
            }
            crate::world::testkit::lean(&mut w, i, dir);
            w.step();
            assert!(
                w.is_walkable(w.pos[i], w.radius[i]),
                "tick {tick}: the route walked into masonry at {:?}",
                w.pos[i]
            );
        }
        panic!("never arrived; stopped at {:?}", w.pos[i]);
    }

    #[test]
    fn a_route_across_open_ground_is_the_straight_line() {
        // The line-of-walk shortcut. Without it a character crosses a room tile
        // centre to tile centre like a chess piece.
        let mut w = carved_world(&[
            "########", //
            "#......#",
            "#......#",
            "#......#",
            "########",
        ]);
        let id = w.alive_ids(Faction::Heroes)[0];
        let i = id.index as usize;
        w.pos[i] = Vec2::new(Fx::from_ratio(15, 10), Fx::from_ratio(15, 10));
        let dest = Vec2::new(Fx::from_ratio(55, 10), Fx::from_ratio(35, 10));
        w.set_objective(Faction::Heroes, Objective::Order);
        w.set_order(Faction::Heroes, Order::Goto(dest));
        w.refresh_nav();

        let straight = dest - w.pos[i];
        assert_eq!(w.nav_step(i), (straight.normalize(), straight.length()));
    }

    #[test]
    fn a_route_leads_to_the_quarry_a_focus_names() {
        // The same floor plan and the same walk as
        // `a_route_walks_round_a_wall_rather_than_into_it`, with a body
        // standing on the destination instead of a click sitting there. That
        // is the whole of the claim: naming a quarry names a place.
        //   01234567
        let mut w = carved_world(&[
            "########", // 0
            "#..#...#", // 1
            "#..#...#", // 2
            "#......#", // 3   the way round is south
            "########", // 4
        ]);
        let id = w.alive_ids(Faction::Heroes)[0];
        let i = id.index as usize;
        w.pos[i] = Vec2::new(Fx::from_ratio(15, 10), Fx::from_ratio(15, 10));
        let prey = monster_at(&mut w, Vec2::new(Fx::from_ratio(55, 10), Fx::from_ratio(15, 10)));
        let q = prey.index as usize;
        w.set_objective(Faction::Heroes, Objective::Order);
        w.set_order(Faction::Heroes, Order::Focus(prey));

        // Honestly longer than the straight line, so a hero four units of open
        // air from its quarry does not believe it is nearly there.
        let mut left = w.nav_step(i).1;
        assert!(left < Fx::MAX, "there is a way round");
        assert!(left > (w.pos[q] - w.pos[i]).length() + Fx::TWO);

        // Arrival is the width of the pair rather than one tick of travel,
        // because the goal point is a body and `World::separate` will not let
        // the hero stand on it.
        let touching = w.radius[i] + w.radius[q] + w.stats[i].move_speed();
        for tick in 0..400 {
            let (dir, now) = w.nav_step(i);
            if now <= touching {
                assert!(tick > 40, "arrived in {tick} ticks, which is a straight line");
                return;
            }
            // The ground left never grows. A route that grows is a route being
            // rebuilt around a quarry the hero has not actually moved toward,
            // which is how "follow that one" turns into a hero walking in
            // circles behind a wall.
            assert!(now <= left, "tick {tick}: the route got longer, {left} -> {now}");
            left = now;
            crate::world::testkit::lean(&mut w, i, dir);
            w.step();
            assert!(
                w.is_walkable(w.pos[i], w.radius[i]),
                "tick {tick}: the route walked into masonry at {:?}",
                w.pos[i]
            );
        }
        panic!("never reached the quarry; stopped at {:?}", w.pos[i]);
    }

    #[test]
    fn a_focus_on_a_corpse_is_no_route() {
        // Three ways for a `Focus` to name nobody -- a handle whose body has
        // been reaped, a generation that has moved on, and one of your own --
        // and one answer to all three, because they leave the seed list empty
        // by the same door. One test rather than three: what is being pinned
        // is that none of them ever reaches an index, and
        // `feature_vector_has_a_stable_width` already drives every order kind
        // onto both factions at once, so this arm is load-bearing well before
        // anything constructs a `Focus` on purpose.
        let mut w = carved_world(&[
            "########", //
            "#......#",
            "#......#",
            "#......#",
            "########",
        ]);
        let id = w.alive_ids(Faction::Heroes)[0];
        let i = id.index as usize;
        let prey = monster_at(&mut w, Vec2::new(Fx::from_ratio(55, 10), Fx::from_ratio(15, 10)));
        w.set_objective(Faction::Heroes, Objective::Order);
        w.set_order(Faction::Heroes, Order::Focus(prey));

        // The control, so that a failure below is the corpse and not the
        // fixture: while the quarry is standing there is a route to it.
        assert_ne!(
            w.nav_step(i),
            (Vec2::ZERO, Fx::MAX),
            "the fixture never routed to a living quarry"
        );

        // **Bled rather than emptied.** `World::hp` is the legacy health column
        // and the reaper does not read it on a jointed body: a body with an
        // anatomy row dies when `wounds.blood` runs out. Writing `hp` left the
        // quarry in perfect health, which is a silent no-op rather than a
        // failure until the assertion below.
        w.wounds[prey.index as usize].blood = Fx::ZERO;
        w.step();
        assert!(!w.is_alive(prey), "the quarry survived being bled out");
        w.refresh_nav();
        assert_eq!(w.nav_step(i), (Vec2::ZERO, Fx::MAX), "routed at a corpse");

        // A generation that has moved on, aimed at a slot that is very much
        // occupied -- the case a `Goto` can never produce and the one that
        // would index a stranger.
        w.set_order(
            Faction::Heroes,
            Order::Focus(EntityId::new(i as u32, w.generation[i] + 1)),
        );
        assert_eq!(
            w.nav_step(i),
            (Vec2::ZERO, Fx::MAX),
            "routed at a stale handle"
        );

        // And one of your own, alive and resolving perfectly well. Nothing
        // constructs this yet; `World::set_order` is a public door and the
        // sim is total behind it.
        w.set_order(Faction::Heroes, Order::Focus(id));
        assert_eq!(
            w.nav_step(i),
            (Vec2::ZERO, Fx::MAX),
            "routed at its own side"
        );
    }
}
