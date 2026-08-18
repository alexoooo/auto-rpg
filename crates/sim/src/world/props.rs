//! Doors and destructible dungeon props.
//!
//! A door is pressure, not a switch: a body leaning on one accumulates against
//! its resistance and the door opens when the accumulation wins. That is why
//! `press_doors` is a phase of the tick and not a call on the way past.

use super::*;

impl World {
    /// Applies legacy weapon damage to physical props. The body-damage pass is
    /// intentionally left unchanged: props are a separate energy sink, not a
    /// fourth combat contact kind.
    pub(super) fn resolve_dungeon_prop_swings(&mut self) {
        if self.dungeon_props.is_empty() { return; }
        self.prop_impacts.clear();
        for i in 0..self.alive.len() {
            if !self.alive[i] || !self.limb[i].swing.is_live() { continue; }
            let (base, tip) = match self.blade(i) { Some(segment) => segment, None => continue };
            let (was_base, was_tip) = self.blade_was[i].unwrap_or((base, tip));
            let action = self.action_of(i).spec();
            let speed = self.arm(i).spec.length * self.limb[i].spin.abs() + self.vel[i].length();
            let amount = rules::blow_damage(
                action.mass,
                speed,
                rules::power_multiplier(self.stats[i].power),
            );
            if !amount.is_positive() { continue; }
            let mut first: Option<(Fx, usize)> = None;
            for (prop_index, prop) in self.dungeon_props.iter().enumerate() {
                if prop.broken || !prop.max_hp.is_positive() { continue; }
                let radius = prop.half_extents.x.max(prop.half_extents.y);
                let Some(hit) = fx::swept_segment_circle(
                    was_base, was_tip, base, tip,
                    prop.position, prop.position, radius,
                ) else { continue; };
                if first.is_none_or(|(toi, best)| (hit.t, prop.identity) <
                    (toi, self.dungeon_props[best].identity)) {
                    first = Some((hit.t, prop_index));
                }
            }
            if let Some((toi, prop)) = first {
                self.prop_impacts.push(PropImpact {
                    toi, prop, attacker: self.id_of(i), amount,
                });
            }
        }
        sort_prop_impacts(&mut self.prop_impacts, &self.dungeon_props);
        for impact in &self.prop_impacts {
            let prop = &mut self.dungeon_props[impact.prop];
            if prop.broken { continue; }
            prop.hp -= impact.amount;
            if !prop.hp.is_positive() {
                prop.hp = Fx::ZERO;
                prop.broken = true;
            }
        }
        self.prop_impacts.clear();
    }

    /// Leans on doors, and opens whichever has been leant on long enough.
    ///
    /// Runs after movement has resolved -- so the positions it measures are the
    /// ones the tick ended at -- and before the dead are reaped, so a body that
    /// was standing on a door when the blow landed still spent that tick
    /// pushing it.
    ///
    /// **Two passes rather than one**, which is the shape
    /// [`World::resolve_swings`] uses and for the same reason: the first pass
    /// only reads and marks, the second decides. Folded into one, the answer
    /// would depend on which unit was visited first -- the door would open under
    /// whichever body happened to hold the lower index, and a second body
    /// leaning on the same door in the same tick would find it already floor.
    ///
    /// Two conditions to be leaning, and neither is sufficient alone. Being
    /// *near* a door is where every route on the level converges, so proximity
    /// alone would have a corridor's worth of traffic opening every door it
    /// walked past; asking only about the commanded direction would have a body
    /// across the room opening one by facing it.
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
            let dir = self.command[i].move_dir.clamp_length(Fx::ONE);
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
                // Nothing invalidates the route fields here and nothing needs
                // to. `refresh_nav`'s key hashes `dungeon.fingerprint()`, which
                // `open_door` has just moved, so every field rebuilds on the
                // refresh at the bottom of this tick. A second mechanism would
                // be a second thing to keep in step.
                self.dungeon.open_door(self.doors[k].door.cells());
            }
        }

        self.door_pushed = pushed;
    }

    /// Whether any door on this level is still shut. See [`World::nav_arm`].
    pub(super) fn door_shut(&self) -> bool {
        self.doors.iter().any(|d| !d.open)
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
        w.command[i] = Command::moving(EAST);

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
        w.command[i] = Command::moving(EAST);

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
            w.command[i] = Command::moving(EAST);
            for _ in 0..10 {
                w.press_doors();
            }
            assert_eq!(w.doors[0].pressed, 10);
            w.command[i] = Command::HOLD;
            for _ in 0..10 {
                w.press_doors();
            }
            assert_eq!(w.doors[0].pressed, 0);
        }
        assert!(w.dungeon.solid(4, 2), "a door opened by accident");

        // Standing in the doorway facing away from it is not leaning on it
        // either: proximity alone would have every route on the level opening
        // every door it converged on.
        w.command[i] = Command::moving(Vec2::new(-Fx::ONE, Fx::ZERO));
        for _ in 0..rules::DOOR_TICKS * 2 {
            w.press_doors();
        }
        assert_eq!(w.doors[0].pressed, 0);

        // And so is leaning on it from across the room.
        w.pos[i] = at_tile(1, 2);
        w.command[i] = Command::moving(EAST);
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
        // is the wiring: a walk into a door, through `World::step`, opens it and
        // the route field on the far side notices.
        let mut w = penned_world(Body::Skitterer);
        let hero = w.alive_ids(Faction::Heroes)[0];
        let i = hero.index as usize;
        w.set_objective(Faction::Heroes, Objective::Order);
        w.set_order(Faction::Heroes, Order::Goto(at_tile(6, 2)));
        for tick in 0..240 {
            let (dir, _) = w.nav_step(i);
            w.command[i] = Command::moving(if dir.is_zero() { EAST } else { dir });
            w.step();
            if w.doors[0].open {
                assert!(tick >= rules::DOOR_TICKS as u32, "opened in {tick} ticks");
                assert!(!w.dungeon.solid(4, 2));
                // The route field is keyed on the floor plan's digest, so the
                // rebuild is already done by the bottom of the tick that opened
                // it. Nothing invalidates it by hand and nothing should.
                let m = w.alive_ids(Faction::Monsters)[0].index as usize;
                assert!(w.nav_step(m).1 < Fx::MAX, "the Skitterer is still penned");
                return;
            }
        }
        panic!("a Fighter walked into a door for four seconds and it held");
    }
}
