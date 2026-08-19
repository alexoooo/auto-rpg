//! Where a body ends the tick.
//!
//! One door in -- `apply_articulated_movement` -- and then `separate`,
//! `move_body` and the tile and prop collision beneath it. There were two:
//! `apply_movement` steered a body from the legacy `command` column, and it
//! left with that column, taking `dungeon_slow_at` with it because nothing
//! else ever called one. Everything here is planar: a body has no vertical
//! degree of freedom.

use super::*;

impl World {
    /// Circle push-apart. O(n^2) and deliberately so for now: at a few dozen
    /// entities a spatial hash is slower and much easier to get subtly wrong.
    /// Revisit when a scenario needs hundreds.
    pub(super) fn separate(&mut self) {
        let n = self.alive.len();
        for i in 0..n {
            if !self.alive[i] {
                continue;
            }
            for j in (i + 1)..n {
                if !self.alive[j] {
                    continue;
                }
                let delta = self.pos[j] - self.pos[i];
                let overlap = self.radius[i] + self.radius[j];
                let distance = delta.length();
                if distance >= overlap {
                    continue;
                }
                // Split by inverse mass, which is to say each body yields the
                // share of the overlap the *other* one's weight accounts for.
                // A 50/50 split was the old rule and it made a Skitterer able to
                // shoulder a Brute off its feet -- which quietly made crowding a
                // heavy weapon the strongest answer in the game, because getting
                // inside its dead zone cost nothing to hold.
                //
                // Each share is computed independently rather than one being
                // `total - other`, so a mirrored pair gets mirrored shoves. The
                // two may fail to close the last raw unit of overlap between
                // them; the old rule did not close it either, and the next tick
                // takes another bite.
                let gap = overlap - distance;
                let total = self.mass[i] + self.mass[j];
                let (share_i, share_j) = if total.is_positive() {
                    (
                        fx::mul_div(gap, self.mass[j], total),
                        fx::mul_div(gap, self.mass[i], total),
                    )
                } else {
                    (gap * Fx::HALF, gap * Fx::HALF)
                };
                let dir = if distance.is_zero() {
                    // Exactly coincident. Pick a direction from the index pair
                    // so the pair unsticks deterministically instead of
                    // freezing or needing an RNG.
                    Vec2::from_angle(Angle::from_raw(
                        (i as u32)
                            .wrapping_mul(40_503)
                            .wrapping_add((j as u32).wrapping_mul(7))
                            as u16,
                    ))
                } else {
                    delta.normalize()
                };
                self.move_body(i, self.pos[i] - dir * share_i);
                self.move_body(j, self.pos[j] + dir * share_j);

                // Un-overlapping them is not the whole of a collision. Without
                // an impulse the positional fix is undone next tick by the same
                // velocities that caused it, and two bodies grind against each
                // other at full walking speed forever -- which is also a free
                // way to hold ground you have no business holding.
                //
                // Standard normal impulse against the reduced mass. Only for a
                // pair that is *closing*: two bodies already separating have
                // been dealt with, and reflecting them again would pull them
                // back together.
                let closing = (self.vel[j] - self.vel[i]).dot(dir);
                if closing.is_positive() || !total.is_positive() {
                    continue;
                }
                let reduced = fx::mul_div(self.mass[i], self.mass[j], total);
                let impulse = -(Fx::ONE + rules::BODY_RESTITUTION) * closing * reduced;
                self.vel[i] = self.vel[i] - dir * (impulse / self.mass[i]);
                self.vel[j] = self.vel[j] + dir * (impulse / self.mass[j]);
            }
        }
    }

    pub(super) fn apply_articulated_movement(&mut self) {
        for i in 0..self.alive.len() {
            if !self.alive[i] {
                self.vel[i] = Vec2::ZERO;
                continue;
            }
            self.start_pos[i] = self.pos[i];
            // Clamped *after* the frame conversion, not before: a rotation
            // preserves length exactly in real arithmetic and only to within a
            // raw unit in `Fx`, so clamping first would let a rounded-up vector
            // out at 65_537 raw.
            let requested = self.articulated_command[i].map_or(Vec2::ZERO, |command| command.move_dir);
            let dir = self.world_move_dir(i, requested).clamp_length(Fx::ONE);
            let want = dir * self.stats[i].move_speed() * self.action_of(i).spec().move_bonus;
            let traction = actuator::movement_traction(self.stats[i], self.moving_authority(i));
            let change = (want - self.vel[i]).clamp_length(traction);
            self.vel[i] += change;
            self.move_body(i, self.pos[i] + self.vel[i]);
            if !dir.is_zero() { self.facing[i] = dir.angle(); }
        }
    }

    pub(super) fn clamp_to_arena(&self, p: Vec2, radius: Fx) -> Vec2 {
        p.clamp_box(
            Vec2::new(radius, radius),
            Vec2::new(self.arena.x - radius, self.arena.y - radius),
        )
    }

    /// Walks `i` to `to`, stopping it against whatever is in the way.
    ///
    /// Takes a **destination** rather than a point, because with masonry inside
    /// the level a displacement can be large enough to pass clean through a
    /// wall. A wall can be one tile thick where a corridor was carved up to a
    /// room's face, and while walking is 0.05 units a tick, a knockback is
    /// bounded by nothing of the sort. So the move is swept in steps no longer
    /// than half a tile.
    ///
    /// On a floor plan with nothing carved there is nothing to tunnel through
    /// and the sweep is skipped outright -- which is not an optimisation but
    /// the thing that makes every pre-existing scenario *provably* unchanged
    /// rather than argued to be.
    pub(super) fn move_body(&mut self, i: usize, to: Vec2) {
        if !self.dungeon.carved() {
            self.settle(i, to);
            return;
        }
        // The ceiling is a sanity bound, not a rule: nothing in the game moves
        // a body two units in a tick, and if something ever does, four
        // sub-steps is where the cost stops growing.
        let delta = (to - self.pos[i]).clamp_length(MAX_STEP);
        let steps = 1 + (delta.length() / HALF_TILE).floor_int().clamp(0, 3);
        let stride = delta * Fx::from_ratio(1, steps);
        // **Each stride runs from where the last one ended, not from where the
        // move began.** Interpolating the original line instead is the obvious
        // spelling and it silently defeats the whole sweep: a sub-step that a
        // wall stopped is undone by the next one, which teleports the body
        // further along a line the wall was supposed to have interrupted. It
        // reads as tunnelling, which is exactly the bug being prevented.
        for _ in 0..steps {
            self.settle(i, self.pos[i] + stride);
        }
    }

    /// Puts `i` somewhere legal and takes the momentum the wall absorbed.
    ///
    /// Position alone is not enough now that velocity persists. A body walking
    /// into a wall used to stop because its *displacement* was clipped every
    /// tick; with integrated velocity it stops moving but stays convinced it is
    /// travelling at full speed, and that phantom velocity is read by
    /// [`World::impact_speed`] as a closing speed and by [`World::separate`] as
    /// something to bounce a neighbour off. A fighter pinned against a wall
    /// would shove anyone who came near it, forever, without moving an inch.
    ///
    /// Only the clipped axis is zeroed, so a body sliding *along* a wall keeps
    /// doing so.
    fn settle(&mut self, i: usize, p: Vec2) {
        let clamped = self.clamp_to_arena(p, self.radius[i]);
        if clamped.x != p.x {
            self.vel[i].x = Fx::ZERO;
        }
        if clamped.y != p.y {
            self.vel[i].y = Fx::ZERO;
        }
        self.pos[i] = clamped;
        if self.dungeon.carved() {
            self.resolve_tiles(i);
            self.resolve_dungeon_props(i);
        }
        // After the tile and prop passes, not before: those two can still move
        // the body, and a height sampled at a position the body did not end on
        // is the disagreement this column exists to prevent. `height_at`
        // answers zero immediately on a flat dungeon, so this costs a branch.
        self.ground_z[i] = self.dungeon.height_at(self.pos[i]);
    }

    pub(super) fn resolve_dungeon_props(&mut self, i: usize) {
        for prop in &self.dungeon_props {
            if prop.broken || !matches!(prop.kind, DungeonObjectKind::Barrel | DungeonObjectKind::Pottery) {
                continue;
            }
            let combined = self.radius[i] + prop.half_extents.x.max(prop.half_extents.y);
            let delta = self.pos[i] - prop.position;
            let distance = delta.length();
            if distance >= combined {
                continue;
            }
            let normal = if distance.is_zero() {
                Vec2::from_angle(Angle::from_raw(prop.identity as u16))
            } else {
                delta.normalize()
            };
            self.pos[i] = prop.position + normal * combined;
            let inward = self.vel[i].dot(normal);
            if inward < Fx::ZERO {
                self.vel[i] -= normal * inward;
            }
        }
    }

    /// Pushes `i` out of any masonry it is standing in.
    ///
    /// The tile span is taken from where the body arrived and not recomputed as
    /// the pushes land. At the roster's widest radius that span is three columns
    /// by three rows -- nine reads -- and a push only ever moves a body *away*
    /// from the tile that produced it, so the tile it could newly reach is one
    /// it was already being pushed toward. Anything left over is a fraction of a
    /// unit and is resolved by the next sub-step or the next tick, which is the
    /// same slack the body-versus-body pass at [`World::separate`] runs on.
    fn resolve_tiles(&mut self, i: usize) {
        let r = self.radius[i];
        let p = self.pos[i];
        let lo_x = (p.x - r).floor_int();
        let hi_x = (p.x + r).floor_int();
        let lo_y = (p.y - r).floor_int();
        let hi_y = (p.y + r).floor_int();
        for ty in lo_y..=hi_y {
            for tx in lo_x..=hi_x {
                if self.dungeon.solid(tx, ty) {
                    self.push_out_of(i, tx, ty);
                }
            }
        }
    }

    /// One body against one solid tile.
    ///
    /// The geometry belongs to [`Dungeon::push_out`] -- one implementation of
    /// "a body may not be inside masonry", shared with the placement helpers so
    /// that where a body *can* stand and where it gets *pushed to* cannot come
    /// apart. What is left here is the half that needs the body: its momentum.
    fn push_out_of(&mut self, i: usize, tx: i32, ty: i32) {
        let Some((to, n)) = self
            .dungeon
            .push_out(self.pos[i], self.radius[i], tx, ty)
        else {
            return;
        };
        self.pos[i] = to;
        // Only the component heading *into* the wall. The rest is the body
        // travelling along the face, and taking that would be a wall with
        // friction -- a different game from this one. Same argument as the
        // arena clamp zeroing only the axis it clipped.
        let along = self.vel[i].dot(n);
        if !along.is_positive() {
            self.vel[i] -= n * along;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world::testkit::*;

    #[test]
    fn move_authority_scales_acceleration_without_changing_requested_velocity() {
        let scenario = Scenario::embodied_duel();
        let mut full = World::new(&scenario, 1);
        let mut impaired = full.clone();
        impaired.move_authority[0] = Fx::HALF;
        let fighter = EntityId::new(0, 0);
        let mut command = articulated_command();
        command.move_dir = Vec2::X;
        // **The yaw the body already holds, which is what keeps `move_dir` a
        // world vector.** `CommandFrame::Torso` reads it in the body frame, so
        // `Vec2::X` is "forward" rather than "east" and a body that is turning is
        // a body whose world request rotates under it. The shared fixture asks
        // for `Angle::QUARTER` and the fighter spawns at `Angle::ZERO`, so the
        // heading below drifted a quarter turn across the settling run -- which
        // is a fact about the frame and not about move authority, and this test
        // is about move authority. Held square, the two frames name the same
        // vector at every tick and every equality below is the one it always
        // made.
        command.body_yaw = Angle::ZERO;
        // Stored, and stored without a per-field rejection. A submission the
        // world refuses is not a quiet no-op -- it leaves the body holding
        // nothing and every equality below then measures two idle worlds
        // agreeing, which is the shape this reseat has to be proof against.
        for world in [&mut full, &mut impaired] {
            assert!(matches!(
                world.submit_embodied_v1(fighter, crate::EmbodiedCommandV1::new(command)),
                crate::SubmitEmbodiedOutcome::Stored { rejection: None, .. }));
        }
        let requested = full.stats[0].move_speed() * full.action_of(0).spec().move_bonus;
        full.step();
        impaired.step();
        assert_eq!(full.vel[0], Vec2::X * full.stats[0].traction());
        assert_eq!(impaired.vel[0], Vec2::X * (impaired.stats[0].traction() * Fx::HALF));
        assert!(requested > full.vel[0].length());
        assert!(requested > impaired.vel[0].length());
        for _ in 0..60 {
            full.step();
            impaired.step();
        }
        assert_eq!(full.vel[0], Vec2::X * requested);
        assert_eq!(impaired.vel[0], Vec2::X * requested);
    }

    #[test]
    fn leg_injury_reduces_acceleration_not_requested_direction() {
        // This is a locomotion law, so use the ordinary embodied duel and
        // stop before either body can make contact. The former fragile fixture
        // reached combat under the exact feature and measured settlement.
        let scenario = Scenario::embodied_duel();
        let mut hurt = World::new(&scenario, 1);
        let sound = World::new(&scenario, 1);
        // Half the legs, no shock: the factor the actuator reads is exactly a
        // half, and the tick that publishes it is the anatomy phase.
        hurt.wounds[0].parts[BodyPart::Legs as usize].integrity = Fx::ONE;
        hurt.settle_anatomy();
        assert_eq!(hurt.move_authority[0], Fx::HALF);
        assert_eq!(hurt.turn_authority[0], Fx::HALF);

        let command = |dir| ArticulatedCommandV1 {
            move_dir: dir, body_yaw: Angle::QUARTER, intent: Intent::Hold,
            arms: [ArmTarget { bearing: Angle::ZERO, height: crate::CombatHeight::MID,
                               reach: Fx::from_ratio(1, 4), effort: Fx::ZERO }; 2],
            grips: [GripRequest::Keep; 2],
            releases: [ReleaseRequest::Keep; 2],
        };
        let mut sound = sound;
        // Along an axis first, where the arithmetic is exact and the claim can
        // be an equality rather than an inequality: half the authority is
        // exactly half the acceleration, and the acceleration is the only thing
        // it touches.
        for world in [&mut hurt, &mut sound] {
            // Asserted rather than discarded: `submit_embodied_v1` refuses by
            // returning, so a fixture that ignores the outcome measures two
            // bodies standing still and calls it a locomotion law.
            assert!(matches!(
                world.submit_embodied_v1(EntityId::new(0, 0),
                                         crate::EmbodiedCommandV1::new(command(Vec2::X))),
                crate::SubmitEmbodiedOutcome::Stored { rejection: None, .. }));
            world.step();
            assert!(world.contact_resolutions().is_empty());
            assert_eq!(world.contact_solver_rejections(), 0);
        }
        assert_eq!((sound.vel[0].x.raw(), sound.vel[0].y.raw()), (251, 0));
        assert_eq!((hurt.vel[0].x.raw(), hurt.vel[0].y.raw()), (125, 0));
        assert_eq!((sound.body_yaw[0].angle.raw(), hurt.body_yaw[0].angle.raw(),
                    hurt.body_yaw[0].authority_residue.raw()), (91, 45, 32_768));
        // And turning: the same factor, on the angular acceleration alone.
        assert!(hurt.body_yaw[0].angle.raw() < sound.body_yaw[0].angle.raw(),
                "leg injury cost no angular acceleration");

        // The *requested* velocity is untouched -- impairment is a traction
        // term, not a steering one -- so given enough ticks the impaired body
        // arrives at exactly the same velocity on an off-axis heading, just
        // later. Three-four-five, so the request is exactly unit length and
        // survives `validate_move`'s magnitude check; a diagonal of two ones
        // does not, and is silently swapped for the neutral command.
        //
        // **Seventy ticks rather than thirty-five, and the settled heading is
        // the request turned a quarter, because `move_dir` is read in the body
        // frame now.** Under `CommandFrame::Torso` a body that is still turning
        // is a body whose *world* request rotates under it -- and the impaired
        // body turns at half the rate, so at thirty-five ticks the two were
        // chasing different world directions and this equality measured the yaw
        // gap rather than the traction law. Both bodies do arrive at
        // `Angle::QUARTER`, and only then does the world request stand still:
        // the sound one settles at forty-one ticks and the impaired one at
        // fifty-eight, while the sound one reaches the west wall at a hundred
        // and ninety, where the arena clamp takes its x component and this stops
        // being a locomotion measurement. Seventy is clear of both ends.
        let diagonal = command(Vec2::new(Fx::from_ratio(3, 5), Fx::from_ratio(4, 5)));
        for _ in 0..70 {
            for world in [&mut hurt, &mut sound] {
                assert!(matches!(
                    world.submit_embodied_v1(EntityId::new(0, 0),
                                             crate::EmbodiedCommandV1::new(diagonal)),
                    crate::SubmitEmbodiedOutcome::Stored { rejection: None, .. }));
                world.step();
                assert!(world.contact_resolutions().is_empty());
                assert_eq!(world.contact_solver_rejections(), 0);
            }
        }
        // `(3/5, 4/5)` turned a quarter is `(-4/5, 3/5)`, and exactly so: the
        // sine table is exact at `Angle::QUARTER`, so the settled speed is the
        // one the world frame gave -- 3_516 raw -- with its components swapped
        // and one negated. Previously `(2_110, 2_813)`, when `Vec2::X` in a
        // command meant east rather than forward.
        assert_eq!((sound.vel[0].x.raw(), sound.vel[0].y.raw()), (-2_813, 2_110));
        assert_eq!(hurt.vel[0], sound.vel[0], "impairment changed the requested velocity");
        assert_eq!(sound.body_yaw[0].angle.raw(), 16_384);
        assert_eq!(hurt.body_yaw[0].angle, sound.body_yaw[0].angle,
                   "impairment changed the target yaw");
        assert_eq!(hurt.move_authority[0], Fx::HALF, "the impairment did not survive the run");
    }

    // **Two tests went with `apply_movement`, and neither claim went with
    // them.** `getting_going_and_stopping_both_take_time` measured that a body
    // takes time to reach its top speed and time to shed it; that is a
    // `Stats::traction` claim and
    // `move_authority_scales_acceleration_without_changing_requested_velocity`
    // above makes it on the surviving path, from a standing start to a settled
    // cruise. `a_wall_takes_the_momentum_it_stops` measured that a clipped step
    // banks the momentum it stopped rather than leaving the body convinced it is
    // still running -- the bug behind a 4v6 whose survivors shoved each other
    // off a wall forever -- and both `a_shove_cannot_push_a_body_through_a_wall`
    // and `on_an_open_floor_plan_a_move_is_the_arena_clamp_it_always_was` assert
    // exactly that about `move_body`, which is where the banking lives.

    #[test]
    fn on_an_open_floor_plan_a_move_is_the_arena_clamp_it_always_was() {
        // The bit-identity claim, made mechanical rather than argued. Every
        // scenario in the repository but a generated one is `Dungeon::open`, so
        // if this holds then none of them moved.
        let mut w = duel_world();
        let i = w.alive_ids(Faction::Heroes)[0].index as usize;
        for radius in [Fx::from_ratio(30, 100), Fx::from_ratio(45, 100), Fx::from_ratio(70, 100)] {
            w.radius[i] = radius;
            for x in [-3, 0, 1, 12, 23, 24, 27] {
                for y in [-3, 0, 1, 8, 15, 16, 19] {
                    let to = Vec2::from_ints(x, y);
                    w.pos[i] = Vec2::from_ints(12, 8);
                    w.vel[i] = Vec2::new(Fx::ONE, Fx::ONE);
                    w.move_body(i, to);

                    let want = w.clamp_to_arena(to, radius);
                    assert_eq!(w.pos[i], want, "radius {radius} to {to:?}");
                    assert_eq!(w.vel[i].x.is_zero(), want.x != to.x, "x at {to:?}");
                    assert_eq!(w.vel[i].y.is_zero(), want.y != to.y, "y at {to:?}");
                }
            }
        }
    }

    #[test]
    fn a_shove_cannot_push_a_body_through_a_wall() {
        //  A one-tile-thick wall down the middle. Under a rule that clipped the
        //  end point and nothing between, a shove of three units a tick steps
        //  clean over it and comes out the far side.
        let mut w = carved_world(&[
            "#######", //
            "#..#..#",
            "#..#..#",
            "#..#..#",
            "#######",
        ]);
        let i = w.alive_ids(Faction::Heroes)[0].index as usize;
        w.pos[i] = Vec2::new(Fx::from_ratio(25, 10), Fx::from_ratio(25, 10));
        let start = w.pos[i];
        w.vel[i] = Vec2::new(Fx::from_int(3), Fx::ZERO);
        w.move_body(i, w.pos[i] + w.vel[i]);

        assert!(
            w.is_walkable(w.pos[i], w.radius[i]),
            "ended up inside masonry at {:?}",
            w.pos[i]
        );
        assert!(
            w.pos[i].x < Fx::from_int(3),
            "tunnelled from {start:?} to {:?}",
            w.pos[i]
        );
        assert_eq!(w.vel[i].x, Fx::ZERO, "the wall banked the momentum");
    }

    #[test]
    fn a_body_slides_along_a_wall_instead_of_catching_at_a_seam() {
        // Every tile of the north wall presents a face, and adjacent tiles share
        // one down their seam. Without the internal-edge cull the body is shoved
        // out of each seam as it crosses it, which shows up as the along-wall
        // travel stalling -- or, at speed, as the body being flung south.
        //
        // **Driven through `move_body` rather than through a movement phase**,
        // since `apply_movement` went with the legacy command column. The claim
        // is about `resolve_tiles` and the internal-edge cull inside it, so the
        // acceleration rule that used to sit on top was scaffolding: writing the
        // velocity is what the pure fixtures in `combat::resolution` do for the
        // same reason, and it keeps this from quietly becoming a test of
        // whatever `Stats::traction` happens to be.
        let mut w = carved_world(&[
            "##########", //
            "#........#",
            "#........#",
            "##########",
        ]);
        let i = w.alive_ids(Faction::Heroes)[0].index as usize;
        let r = w.radius[i];
        // Hard against the north wall's inner face, pressed into it and walking
        // east along it.
        w.pos[i] = Vec2::new(Fx::from_ratio(15, 10), Fx::ONE + r);
        let step = Vec2::new(Fx::ONE, -Fx::ONE).normalize() * w.stats[i].move_speed();

        let mut previous = w.pos[i].x;
        for tick in 0..120 {
            w.vel[i] = step;
            w.move_body(i, w.pos[i] + w.vel[i]);
            assert!(
                w.is_walkable(w.pos[i], r),
                "tick {tick}: pushed into the wall at {:?}",
                w.pos[i]
            );
            assert!(
                w.pos[i].y <= Fx::ONE + r + Fx::from_ratio(1, 100),
                "tick {tick}: flung off the wall to {:?}",
                w.pos[i]
            );
            // Crossing a seam must not cost the body its eastward travel.
            if tick > 4 {
                assert!(
                    w.pos[i].x > previous,
                    "tick {tick}: caught at a seam at {:?}",
                    w.pos[i]
                );
            }
            previous = w.pos[i].x;
        }
        assert!(
            w.pos[i].x > Fx::from_int(4),
            "barely moved: {:?}",
            w.pos[i]
        );
    }

    #[test]
    fn a_body_ejected_from_masonry_comes_out_the_shallow_side() {
        let mut w = carved_world(&[
            "#####", //
            "#...#",
            "#...#",
            "#####",
        ]);
        let i = w.alive_ids(Faction::Heroes)[0].index as usize;
        // Buried in the north wall, barely: a tenth of a unit above the face.
        w.pos[i] = Vec2::new(Fx::from_ratio(25, 10), Fx::from_ratio(9, 10));
        w.settle(i, w.pos[i]);
        assert!(w.is_walkable(w.pos[i], w.radius[i]), "still buried at {:?}", w.pos[i]);
        assert!(w.pos[i].y > Fx::ONE, "came out the wrong side: {:?}", w.pos[i]);
    }

    /// A two-body arena with the pair chosen, for the shove tests.
    ///
    /// **`Scenario::duel_of` is gone with the legacy model** and it is not much
    /// missed here: what these three tests need is two bodies of chosen mass on
    /// open ground, and the seeded ring placement `duel_of` rolled was noise they
    /// immediately overwrote anyway -- every one of them assigns `pos` by hand.
    /// So the fixture is the embodied duel with both bodies swapped to the
    /// kinds under test and dressed for a world that has articulated columns.
    fn shove_pair(hero: Body, villain: Body) -> Scenario {
        let mut scenario = Scenario::embodied_duel();
        for (unit, kind) in scenario.units.iter_mut().zip([hero, villain]) {
            unit.set_body(kind);
            crate::scenario::equip_fixture_body(unit);
        }
        scenario
    }

    #[test]
    fn charging_a_heavier_body_costs_the_charger_more() {
        // Barging is now a decision with a price, and the price scales with who
        // you barge. Both are thrown, and the light one is thrown further.
        let mut w = World::new(&shove_pair(Body::Skitterer, Body::Brute), 1);
        let light = w.alive_ids(Faction::Heroes)[0].index as usize;
        let heavy = w.alive_ids(Faction::Monsters)[0].index as usize;

        let middle = Vec2::new(w.arena.x * Fx::HALF, w.arena.y * Fx::HALF);
        w.pos[light] = middle;
        w.pos[heavy] = middle + Vec2::new(w.radius[light] + w.radius[heavy], Fx::ZERO);
        // Both walking into each other at their own top speeds.
        w.vel[light] = Vec2::new(w.stats[light].move_speed(), Fx::ZERO);
        w.vel[heavy] = Vec2::new(-w.stats[heavy].move_speed(), Fx::ZERO);
        // Just overlapping, so `separate` engages.
        w.pos[heavy] -= Vec2::new(Fx::from_ratio(1, 100), Fx::ZERO);

        w.separate();

        assert!(
            !w.vel[light].x.is_positive(),
            "the Skitterer kept driving through a Brute at {}",
            w.vel[light].x
        );
        // Momentum is conserved along the normal: what one side loses the other
        // gains, in proportion to mass.
        let before = w.stats[light].move_speed() * w.mass[light]
            - w.stats[heavy].move_speed() * w.mass[heavy];
        let after = w.vel[light].x * w.mass[light] + w.vel[heavy].x * w.mass[heavy];
        assert!(
            (before - after).abs() < Fx::from_ratio(1, 1000),
            "momentum along the normal went from {before} to {after}"
        );
    }

    #[test]
    fn the_lighter_body_gives_more_ground() {
        // Crowding a heavy weapon is the strongest answer to one, and it used
        // to be free to hold: the overlap was split down the middle, so a
        // Skitterer pressed against a Brute shoved exactly as hard as it was
        // shoved. Now the ground each yields is the *other* one's weight.
        let mut w = World::new(&shove_pair(Body::Skitterer, Body::Brute), 1);
        let light = w.alive_ids(Faction::Heroes)[0].index as usize;
        let heavy = w.alive_ids(Faction::Monsters)[0].index as usize;
        assert!(w.mass[heavy] > w.mass[light], "premise");

        // Overlapping by a quarter of a unit, along the x axis so the shove is
        // one component and the arena walls are nowhere near.
        let touching = w.radius[light] + w.radius[heavy];
        let middle = Vec2::new(w.arena.x * Fx::HALF, w.arena.y * Fx::HALF);
        w.pos[light] = middle;
        w.pos[heavy] = middle + Vec2::new(touching - Fx::from_ratio(25, 100), Fx::ZERO);
        let (was_light, was_heavy) = (w.pos[light], w.pos[heavy]);

        w.separate();

        let moved_light = (w.pos[light] - was_light).length();
        let moved_heavy = (w.pos[heavy] - was_heavy).length();
        assert!(moved_light.is_positive() && moved_heavy.is_positive());
        assert!(
            moved_light > moved_heavy * Fx::TWO,
            "the Skitterer gave {moved_light} and the Brute {moved_heavy}"
        );
        // Momentum, in the only sense a positional correction has one: the
        // shoves are in inverse proportion to the masses, so mass times
        // displacement matches on both sides.
        let a = moved_light * w.mass[light];
        let b = moved_heavy * w.mass[heavy];
        assert!(
            (a - b).abs() < Fx::from_ratio(1, 1000),
            "mass-weighted displacement did not balance: {a} vs {b}"
        );
    }

    #[test]
    fn equal_bodies_still_split_a_shove_evenly() {
        // The mirror case the old rule got right and the new one must not
        // break: two identical fighters must each give exactly half, or a
        // symmetric duel picks a winner out of the collision solver.
        let mut w = World::new(&shove_pair(Body::Fighter, Body::Fighter), 1);
        let (a, b) = (
            w.alive_ids(Faction::Heroes)[0].index as usize,
            w.alive_ids(Faction::Monsters)[0].index as usize,
        );
        let middle = Vec2::new(w.arena.x * Fx::HALF, w.arena.y * Fx::HALF);
        w.pos[a] = middle;
        w.pos[b] = middle + Vec2::new(Fx::from_ratio(60, 100), Fx::ZERO);
        let (was_a, was_b) = (w.pos[a], w.pos[b]);

        w.separate();

        assert_eq!((w.pos[a] - was_a).length(), (w.pos[b] - was_b).length());
    }

    #[test]
    fn bodies_are_pushed_apart_and_stay_in_the_arena() {
        let mut scenario = Scenario::embodied_duel();
        // Spawn both units on the exact same spot: the degenerate case.
        scenario.units[1].spawn = scenario.units[0].spawn;
        let mut w = World::new(&scenario, 1);
        for _ in 0..120 {
            w.step();
        }
        let snap = w.snapshot();
        let a = snap.units[0].position;
        let b = snap.units[1].position;
        let separation = (a - b).length();
        assert!(
            separation > Fx::ZERO,
            "coincident units never separated: {a:?} {b:?}"
        );
        for u in &snap.units {
            assert!(u.position.x >= Fx::ZERO && u.position.x <= w.arena().x);
            assert!(u.position.y >= Fx::ZERO && u.position.y <= w.arena().y);
        }
    }

    // **`a_running_fighter_actually_runs_faster` is gone, and the reason is a
    // finding rather than a tidy-up: no body the surviving model can construct
    // can hold `ActionKind::Run` at all.**
    //
    // The test measured what `Run` buys -- `move_bonus` is 1.35 against a
    // sword's 1.0 -- through a live world rather than off the registry, because a
    // multiply by one proves nothing about a multiply by 1.35. `move_bonus` is
    // still read by `apply_articulated_movement`, so the *mechanic* survives.
    // What does not survive is any way to put `Run` in a hand: construction ties
    // every loadout slot to an equipment row (`validate_rows`, `LoadoutMismatch`),
    // and the shipped spec table has three items -- a sword, a shield and a club
    // -- none of which carries a move bonus. A body with empty hands has no
    // loadout slot to name `Run` in either.
    //
    // So this is a mechanic with no reachable subject, and the honest next step is
    // an equipment row that grants footspeed rather than a test that pretends one
    // exists.

}
