//! Doors and dungeon props.
//!
//! **Props are no longer destructible and difficult ground no longer slows
//! anybody. Both are gaps rather than designs.** Breaking one was
//! `resolve_dungeon_prop_swings`, which swept the *legacy* blade --
//! `limb[i].swing`, `blade(i)`, `blade_was[i]` -- against a prop circle, and no
//! other path in the repository damages a prop; it went with the legacy model in
//! embodied session 10. Slowing was `World::dungeon_slow_at`, a factor of 0.65
//! through a web and 0.80 through water, and **the only caller it ever had was
//! `apply_movement`**: `apply_articulated_movement` never asked it anything, so
//! from the tick a body became jointed a web slowed nothing. It went with that
//! phase and the legacy command column the phase read.
//!
//! What survives works on any body: barrels and pottery push a body out of them
//! through [`World::settle`]. A barrel is still an obstacle; a web is scenery.
//! Restoring either means the contact solver seeing a prop as a collider, which
//! is a mechanic and not a repair.
//!
//! A door is pressure, not a switch: a body leaning on one accumulates against
//! its resistance and the door opens when the accumulation wins. That is why
//! `press_doors` is a phase of the tick and not a call on the way past.

use super::*;

impl World {
    pub(super) fn press_doors(&mut self) {
        if self.doors.is_empty() {
            return;
        }
        // Taken out and put back so the borrow checker can see that the mark
        // buffer and the columns being read are different fields; the same
        // trick `web::Sim::advance` uses on its scratch.
        let mut pushed = std::mem::take(&mut self.door_pushed);
        pushed.clear();
        pushed.resize(self.doors.len(), false);

        for i in 0..self.alive.len() {
            if !self.alive[i] || !self.kind[i].opens_doors() {
                continue;
            }
            // **The submitted movement vector, read through the same helper the
            // movement phase reads it through.** This used to be
            // `self.command[i].move_dir` -- the *legacy* command column, which
            // nothing writes on a world that has articulated columns. So from
            // the moment a body was jointed, no door in the repository could be
            // opened: `Dungeon::open_door` was unreachable from the browser, and
            // the test that would have caught it was written against a Legacy
            // fixture and deleted for want of one.
            //
            // `world_move_dir` and not the raw field, because an embodied
            // command's vector is torso-relative: leaning on a door is a
            // question about where the body is pushing in the world, and reading
            // the raw column would have a body facing south open the door to its
            // east.
            let requested = self.articulated_command[i].map_or(Vec2::ZERO, |c| c.move_dir);
            let dir = self.world_move_dir(i, requested).clamp_length(Fx::ONE);
            if dir.is_zero() {
                continue;
            }
            let (me, reach) = (self.pos[i], self.radius[i] + rules::DOOR_REACH);
            for (k, slot) in pushed.iter_mut().enumerate() {
                if self.doors[k].open || *slot {
                    continue;
                }
                *slot = self.doors[k].door.cells().iter().any(|&cell| {
                    let (tx, ty) = self.dungeon.tile_at(cell);
                    // Closest point on the tile block, which is the same test
                    // `Dungeon::push_out` makes -- so "near enough to lean on"
                    // and "near enough to be stopped by" are measured off one
                    // shape rather than two.
                    let closest = Vec2::new(
                        me.x.clamp(Fx::from_int(tx), Fx::from_int(tx + 1)),
                        me.y.clamp(Fx::from_int(ty), Fx::from_int(ty + 1)),
                    );
                    let to = closest - me;
                    // **The rejection that makes this loop affordable**, and it
                    // is exact rather than an approximation -- which is what
                    // lets it sit in front of a rule the state hash depends on.
                    //
                    // Every doorway on the level is measured against every body
                    // that has hands, every tick, and `Vec2::length` is
                    // `isqrt64`: a restoring bit-search, some sixty iterations
                    // of a branchy loop. A generated floor carries around
                    // seventeen doorways of three tiles each, so the honest test
                    // spends fifty of those square roots a tick discovering that
                    // all but one doorway is across the map. Measured on the
                    // carved bench that was 22% of the whole tick.
                    //
                    // A length is never shorter than either of its components:
                    // `x*x <= x*x + y*y`, and `isqrt64` floors, so it holds in
                    // raw units too. One component past `reach` therefore
                    // settles it without the root. `Fx::abs` saturates rather
                    // than wrapping at `i32::MIN`, so a subtraction that
                    // saturated is rejected rather than mistaken for zero.
                    if to.x.abs() > reach || to.y.abs() > reach {
                        return false;
                    }
                    to.length() <= reach && dir.dot(to).is_positive()
                });
            }
        }

        for (k, &leant_on) in pushed.iter().enumerate() {
            if self.doors[k].open {
                continue;
            }
            self.doors[k].pressed = if leant_on {
                self.doors[k].pressed.saturating_add(1)
            } else {
                self.doors[k].pressed.saturating_sub(1)
            };
            if self.doors[k].pressed >= rules::DOOR_TICKS {
                self.doors[k].open = true;
                // The whole run at once: a doorway is `CORRIDOR` tiles wide
                // because anything narrower plugs, and opening it a tile at a
                // time would produce exactly the gap that argument rules out.
                //
                // **This used to say that nothing invalidates the route fields
                // here and nothing needs to**, because `refresh_nav`'s key
                // hashed `dungeon.fingerprint()`, which `open_door` moves. There
                // are no route fields: the flow field was deleted for having no
                // reader, and `World::door_shut` -- whose one caller was the
                // field's `nav_arm` -- went with it. What `open_door` still
                // moves is the fingerprint every *other* derivation is keyed on,
                // which is why it is one call and not two.
                self.dungeon.open_door(self.doors[k].door.cells());
            }
        }

        self.door_pushed = pushed;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world::testkit::*;

    #[test]
    fn a_fighter_leaning_on_a_door_opens_it() {
        let mut w = door_world(Body::Fighter);
        assert_eq!(w.doors.len(), 1, "the fixture has one doorway");
        assert!(Body::Fighter.opens_doors());
        let i = w.alive_ids(Faction::Heroes)[0].index as usize;
        w.pos[i] = against_the_jamb(&w, i);
        lean(&mut w, i, EAST);

        assert!(w.dungeon.solid(4, 2), "the door starts shut");
        for _ in 0..rules::DOOR_TICKS - 1 {
            w.press_doors();
        }
        assert!(
            w.dungeon.solid(4, 2),
            "a door opened in fewer than DOOR_TICKS: half a second is the whole \
             difference between a beat in the fight and a doorway that swings \
             open as you brush past it"
        );
        assert_eq!(w.doors[0].pressed, rules::DOOR_TICKS - 1);

        w.press_doors();
        assert!(w.doors[0].open, "the door never opened");
        assert!(!w.dungeon.solid(4, 2), "the tiles did not follow the door");
        assert_eq!(w.dungeon.open_count(), 19, "the doorway became floor");
    }

    #[test]
    fn a_brute_leaning_on_a_door_does_not() {
        // Anatomy, not intelligence, and not effort either: four times the
        // pressure that opens a door for a Fighter does nothing at all here.
        let mut w = door_world(Body::Brute);
        assert!(!Body::Brute.opens_doors());
        let i = w.alive_ids(Faction::Heroes)[0].index as usize;
        w.pos[i] = against_the_jamb(&w, i);
        lean(&mut w, i, EAST);

        for _ in 0..rules::DOOR_TICKS * 4 {
            w.press_doors();
        }
        assert!(w.dungeon.solid(4, 2), "a Brute opened a door");
        assert_eq!(w.doors[0].pressed, 0, "and it did not even lean on it");
    }

    #[test]
    fn pressure_decays_when_nobody_is_pushing() {
        let mut w = door_world(Body::Fighter);
        let i = w.alive_ids(Faction::Heroes)[0].index as usize;
        w.pos[i] = against_the_jamb(&w, i);

        // Twenty separate brushes of ten ticks each, which is six hundred and
        // sixty ticks of contact -- twenty-two times what opens a door. None of
        // it accumulates, because the decay is symmetric with the gain and the
        // gap between brushes is as long as the brush.
        for _ in 0..20 {
            lean(&mut w, i, EAST);
            for _ in 0..10 {
                w.press_doors();
            }
            assert_eq!(w.doors[0].pressed, 10);
            lean(&mut w, i, Vec2::ZERO);
            for _ in 0..10 {
                w.press_doors();
            }
            assert_eq!(w.doors[0].pressed, 0);
        }
        assert!(w.dungeon.solid(4, 2), "a door opened by accident");

        // Standing in the doorway facing away from it is not leaning on it
        // either: proximity alone would have every route on the level opening
        // every door it converged on.
        lean(&mut w, i, Vec2::new(-Fx::ONE, Fx::ZERO));
        for _ in 0..rules::DOOR_TICKS * 2 {
            w.press_doors();
        }
        assert_eq!(w.doors[0].pressed, 0);

        // And so is leaning on it from across the room.
        w.pos[i] = at_tile(1, 2);
        lean(&mut w, i, EAST);
        for _ in 0..rules::DOOR_TICKS * 2 {
            w.press_doors();
        }
        assert_eq!(w.doors[0].pressed, 0);
        assert!(w.dungeon.solid(4, 2));
    }

    #[test]
    fn a_door_opens_inside_the_tick_loop() {
        // The three tests above drive `press_doors` directly, which is the only
        // way to hold a body against a jamb for exactly `DOOR_TICKS`. This one
        // is the wiring: a walk into a door, through `World::step`, opens it.
        //
        // **It used to steer by `World::nav_step` and assert that the Skitterer
        // on the far side gained a route on the same tick**, which was the one
        // test in the repository that exercised the flow field's rebuild-on-a-
        // moved-fingerprint. The field is gone; the wiring claim is not, and it
        // is the half that was about doors. Leaning east is what the route
        // answered here anyway -- the hero starts at tile (2, 2) and the doorway
        // is at (4, 2) -- so the fixture drives the same walk with one fewer
        // subsystem in it.
        let mut w = penned_world(Body::Skitterer);
        let hero = w.alive_ids(Faction::Heroes)[0];
        let i = hero.index as usize;
        for tick in 0..240 {
            lean(&mut w, i, EAST);
            w.step();
            if w.doors[0].open {
                assert!(tick >= rules::DOOR_TICKS as u32, "opened in {tick} ticks");
                assert!(!w.dungeon.solid(4, 2));
                return;
            }
        }
        panic!("a Fighter walked into a door for four seconds and it held");
    }
}
