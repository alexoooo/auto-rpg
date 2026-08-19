//! The articulated projectile lifecycle: nock, loose, fly, land, reap.
//!
//! An articulated arrow is not an entity. It occupies a slot in a fixed table
//! and borrows an entity id from a reserved index range, which is what keeps
//! `MAX_ARTICULATED_ENTITIES` a bound on bodies rather than on everything in
//! the air.

use super::*;

const ARTICULATED_ARROW_RADIUS: Fx = Fx::from_ratio(1, 50);

const ARTICULATED_PROJECTILE_INDEX_BASE: u32 = u32::MAX - rules::MAX_SHOTS as u32;

/// `pub(super)` because the contact phase builds an arrow's collider and
/// has to stamp the same slot tag this module reads back.
pub(super) const ARTICULATED_PROJECTILE_SLOT: u8 = 0x80;

impl World {
    fn free_articulated_projectile(&mut self) -> Option<usize> {
        if let Some(slot) = self.articulated_projectile_free.pop() {
            let slot = slot as usize;
            self.articulated_projectile_generation[slot] =
                self.articulated_projectile_generation[slot].wrapping_add(1);
            return Some(slot);
        }
        if self.articulated_projectile_alive.len() >= rules::MAX_SHOTS { return None; }
        self.articulated_projectile_alive.push(false);
        self.articulated_projectile_generation.push(0);
        self.articulated_projectile_pos.push(Vec3::ZERO);
        self.articulated_projectile_vel.push(Vec3::ZERO);
        self.articulated_projectile_range.push(Fx::ZERO);
        self.articulated_projectile_radius.push(Fx::ZERO);
        self.articulated_projectile_mass.push(Fx::ZERO);
        self.articulated_projectile_owner.push(EntityId::NONE);
        self.articulated_projectile_faction.push(Faction::Heroes);
        Some(self.articulated_projectile_alive.len() - 1)
    }

    /// Projectile solver identities occupy the 32 indices immediately below
    /// EntityId::NONE. Articulated bodies are bounded to 64 allocated slots,
    /// so the namespaces cannot alias; generation still changes on slot reuse.
    pub(super) fn articulated_projectile_id(&self, slot: usize) -> EntityId {
        EntityId::new(ARTICULATED_PROJECTILE_INDEX_BASE + slot as u32,
                      self.articulated_projectile_generation[slot])
    }

    pub(super) fn articulated_projectile_slot(&self, entity: EntityId) -> Option<usize> {
        let slot = entity.index.checked_sub(ARTICULATED_PROJECTILE_INDEX_BASE)? as usize;
        (slot < self.articulated_projectile_alive.len()
            && self.articulated_projectile_alive[slot]
            && self.articulated_projectile_generation[slot] == entity.generation)
            .then_some(slot)
    }

    pub(super) fn articulated_projectile_requested(&self, slot: usize) -> (Vec3, bool, EntityId) {
        let previous = self.articulated_projectile_pos[slot];
        let requested = previous + self.articulated_projectile_vel[slot];
        let radius = self.articulated_projectile_radius[slot];
        let mut block = self.dungeon.raycast(
            Vec2::new(previous.x, previous.y), Vec2::new(requested.x, requested.y),
        ).map(|time| (time.raw().max(0) as u32, EntityId::NONE));
        for target in 0..self.alive.len() {
            if !self.alive[target]
                || self.faction[target] == self.articulated_projectile_faction[slot] {
                continue;
            }
            let Some(pose) = self.shield_pose[target] else { continue };
            let body = Vec3::new(self.pos[target].x, self.pos[target].y, Fx::ZERO);
            let face = geometry::shield_face(body, pose);
            let Some(toi) = fx::swept_segment_rectangle(
                previous, previous, requested, requested, radius, face.corners, face.corners,
            ) else { continue };
            let time = toi.get().raw().max(0) as u32;
            let owner = self.id_of(target);
            block = Some(match block {
                None => (time, owner),
                Some((old_time, old_owner)) if time < old_time
                    || (time == old_time && (old_owner.is_none() || owner < old_owner)) =>
                    (time, owner),
                Some(old) => old,
            });
        }
        let Some((block, shielded_body)) = block else {
            return (requested, false, EntityId::NONE);
        };
        let before = Fx::from_raw(block.saturating_sub(1).min(65_536) as i32);
        (Vec3::lerp(previous, requested, before), true, shielded_body)
    }

    fn reap_articulated_projectile(&mut self, slot: usize) {
        if !self.articulated_projectile_alive[slot] { return; }
        self.articulated_projectile_alive[slot] = false;
        self.articulated_projectile_free.push(slot as u32);
    }

    pub(super) fn loose_articulated_projectiles(&mut self) {
        for i in 0..self.alive.len() {
            if !self.alive[i] { continue; }
            let command = self.articulated_command[i].unwrap_or_else(|| self.neutral_articulated(i));
            let previous = self.articulated_release_was[i];
            self.articulated_release_was[i] = command.releases;
            if !ReleaseRequest::looses(previous[1], command.releases[1]) { continue; }
            let Some(item) = self.equipment_in_grip(i, LimbSlot::RightArm as usize) else { continue };
            let both = item.action == ActionKind::Bow && item.binding == crate::GripBinding::Both
                && self.grips[i][0].equipment_slot.is_some()
                && self.grips[i][0].equipment_slot == self.grips[i][1].equipment_slot;
            if !both { continue; }
            let direction = self.arms[i][1].hand.normalized_or_zero();
            if direction == Vec3::ZERO { continue; }
            let Some(slot) = self.free_articulated_projectile() else { continue };
            let arm = rules::Arm::resolve(ActionKind::Bow.spec(), self.stats[i], self.radius[i]);
            let origin =
                Vec3::new(self.pos[i].x, self.pos[i].y, self.ground_z[i]) + self.arms[i][1].hand;
            self.articulated_projectile_alive[slot] = true;
            self.articulated_projectile_pos[slot] = origin;
            self.articulated_projectile_vel[slot] = direction * rules::shot_speed(arm);
            self.articulated_projectile_range[slot] = self.stats[i].sight_range();
            self.articulated_projectile_radius[slot] = ARTICULATED_ARROW_RADIUS;
            self.articulated_projectile_mass[slot] = ActionKind::Bow.spec().mass;
            self.articulated_projectile_owner[slot] = self.id_of(i);
            self.articulated_projectile_faction[slot] = self.faction[i];
            self.events.push(Event::Loose {
                source: self.id_of(i), at: Vec2::new(origin.x, origin.y),
                line: Vec2::new(direction.x, direction.y).angle(),
            });
        }
    }

    pub(super) fn resolve_articulated_projectiles(&mut self) {
        for slot in 0..self.articulated_projectile_alive.len() {
            if !self.articulated_projectile_alive[slot] { continue; }
            let entity = self.articulated_projectile_id(slot);
            let hit = self.contact.as_ref().is_some_and(|contact| contact.resolutions.iter()
                .any(|row| row.fact.key.kind == ContactKind::ProjectileBody
                    && row.fact.key.a == entity));
            if hit {
                self.reap_articulated_projectile(slot);
                continue;
            }
            let step = self.articulated_projectile_vel[slot];
            let (now, blocked, _) = self.articulated_projectile_requested(slot);
            if blocked {
                self.reap_articulated_projectile(slot);
                continue;
            }
            self.articulated_projectile_range[slot] -= step.length();
            if !self.articulated_projectile_range[slot].is_positive() {
                self.reap_articulated_projectile(slot);
            } else {
                self.articulated_projectile_pos[slot] = now;
            }
        }
    }
}

#[cfg(test)]
mod articulated_projectile_tests {
    use super::*;
    use crate::{DuelConfigV1, HandItemV1};

    fn bow_world() -> World {
        let mut config = DuelConfigV1::shipped();
        config.fighters[0].hands = [None, HandItemV1::shipped(ActionKind::Bow)];
        config.fighters[0].two_handed = true;
        World::new(&Scenario::duel_from(&config).unwrap(), 9)
    }

    fn seed_arrow(world: &mut World, owner: usize, position: Vec3, velocity: Vec3) -> usize {
        let slot = world.free_articulated_projectile().unwrap();
        world.articulated_projectile_alive[slot] = true;
        world.articulated_projectile_pos[slot] = position;
        world.articulated_projectile_vel[slot] = velocity;
        world.articulated_projectile_range[slot] = Fx::from_int(20);
        world.articulated_projectile_radius[slot] = ARTICULATED_ARROW_RADIUS;
        world.articulated_projectile_mass[slot] = ActionKind::Bow.spec().mass;
        world.articulated_projectile_owner[slot] = world.id_of(owner);
        world.articulated_projectile_faction[slot] = world.faction[owner];
        slot
    }

    #[test]
    fn a_held_right_arm_loose_fires_one_articulated_arrow() {
        let mut world = bow_world();
        let legacy = world.state_hash();
        let articulated = world.state_digest().value;
        let mut command = world.neutral_articulated(0);
        command.releases[1] = ReleaseRequest::Loose;
        world.articulated_command[0] = Some(command);
        world.loose_articulated_projectiles();
        assert_eq!(world.articulated_projectiles().count(), 1);
        let first = world.articulated_projectiles().next().unwrap();
        assert!(first.velocity.z.is_positive());
        assert_eq!(world.state_hash(), legacy);
        assert_ne!(world.state_digest().value, articulated);

        world.loose_articulated_projectiles();
        assert_eq!(world.articulated_projectiles().count(), 1);
        command.releases[1] = ReleaseRequest::Keep;
        world.articulated_command[0] = Some(command);
        world.loose_articulated_projectiles();
        command.releases[1] = ReleaseRequest::Loose;
        world.articulated_command[0] = Some(command);
        world.loose_articulated_projectiles();
        assert_eq!(world.articulated_projectiles().count(), 2);
    }

    #[test]
    fn an_articulated_arrow_cannot_tunnel_and_names_the_region_it_hit() {
        for (part, z) in [(BodyPart::Head as usize, Fx::from_ratio(19, 10)),
                          (BodyPart::Legs as usize, Fx::from_ratio(2, 5))] {
            let mut world = bow_world();
            let target = 1;
            let centre = world.pos[target];
            let before = world.wounds[target].parts[part].integrity;
            seed_arrow(&mut world, 0,
                Vec3::new(centre.x - Fx::ONE, centre.y, z),
                Vec3::new(Fx::from_int(2), Fx::ZERO, Fx::ZERO));
            world.retain_contact_entry();
            world.resolve_contact();
            world.resolve_articulated_projectiles();
            let row = world.contact_resolutions().iter()
                .find(|row| row.fact.key.kind == ContactKind::ProjectileBody)
                .expect("shared solver omitted projectile/body fact");
            assert_eq!(row.fact.volume as usize, part);
            assert!(world.wounds[target].parts[part].integrity < before);
            assert_eq!(world.articulated_projectiles().count(), 0);
        }
    }

    #[test]
    fn a_shield_stops_an_articulated_arrow_before_anatomy() {
        let mut world = bow_world();
        let target = 0;
        let owner = 1;
        let pose = world.shield_pose[target];
        assert_eq!(pose, None);
        let mut config = DuelConfigV1::shipped();
        config.fighters[1].hands = [None, HandItemV1::shipped(ActionKind::Bow)];
        config.fighters[1].two_handed = true;
        world = World::new(&Scenario::duel_from(&config).unwrap(), 10);
        let body = world.pos[target];
        let shield = world.shield_pose[target].unwrap();
        let face = geometry::shield_face(
            Vec3::new(body.x, body.y, Fx::ZERO), shield);
        let face_centre = midpoint3(face.corners[0], face.corners[2]);
        let before = world.wounds[target];
        let slot = seed_arrow(&mut world, owner,
            face_centre + face.normal * Fx::from_int(2),
            -face.normal * Fx::from_int(4));
        assert!(world.articulated_projectile_requested(slot).1,
            "front-to-back shield sweep was not blocked: face={:?}", face);
        world.retain_contact_entry();
        world.resolve_contact();
        world.resolve_articulated_projectiles();
        assert_eq!(world.wounds[target], before);
        assert!(world.contact_resolutions().iter()
            .all(|row| row.fact.key.kind != ContactKind::ProjectileBody));
    }

    #[test]
    fn an_articulated_arrow_outlives_its_owner_without_reassigning_credit() {
        let mut world = bow_world();
        let owner = 0;
        let target = 1;
        let stale_owner = world.id_of(owner);
        let centre = world.pos[target];
        let before = world.wounds[target].parts[BodyPart::Head as usize].integrity;
        seed_arrow(&mut world, owner,
            Vec3::new(centre.x - Fx::ONE, centre.y, Fx::from_ratio(19, 10)),
            Vec3::new(Fx::from_int(2), Fx::ZERO, Fx::ZERO));

        world.wounds[owner].parts[BodyPart::Head as usize].integrity = Fx::ZERO;
        world.wounds[owner].parts[BodyPart::Head as usize].severed = true;
        world.reap_dead_articulated();
        assert_eq!(world.resolve(stale_owner), None);

        world.retain_contact_entry();
        world.resolve_contact();
        world.resolve_articulated_projectiles();
        assert!(world.contact_resolutions().iter()
            .any(|row| row.fact.key.kind == ContactKind::ProjectileBody));
        assert!(world.wounds[target].parts[BodyPart::Head as usize].integrity < before);
        assert_eq!(world.wounds[target].last_attacker, stale_owner);
        assert_eq!(world.damage_dealt[owner], Fx::ZERO);
        assert_eq!(world.articulated_projectiles().count(), 0);
    }

    #[test]
    fn projectile_identity_is_disjoint_and_generation_stable_across_slot_reuse() {
        let mut world = bow_world();
        let first_slot = seed_arrow(&mut world, 0, Vec3::from_ints(8, 8, 1), Vec3::X);
        let first_id = world.articulated_projectile_id(first_slot);
        let first_view = world.articulated_projectiles().next().unwrap();
        assert_eq!(first_view.slot, first_slot as u32);
        assert_eq!(first_view.generation, first_id.generation);
        assert!(world.alive_ids(Faction::Heroes).into_iter()
            .chain(world.alive_ids(Faction::Monsters))
            .all(|body| body.index < ARTICULATED_PROJECTILE_INDEX_BASE));
        assert!(first_id.index >= ARTICULATED_PROJECTILE_INDEX_BASE);
        assert!(first_id.index < EntityId::NONE.index);

        world.reap_articulated_projectile(first_slot);
        let reused_slot = seed_arrow(&mut world, 0, Vec3::from_ints(9, 8, 1), Vec3::X);
        let reused_id = world.articulated_projectile_id(reused_slot);
        let reused_view = world.articulated_projectiles().next().unwrap();
        assert_eq!(reused_slot, first_slot);
        assert_eq!(reused_id.index, first_id.index);
        assert_ne!(reused_id.generation, first_id.generation);
        assert_eq!(world.articulated_projectile_slot(first_id), None);
        assert_eq!(world.articulated_projectile_slot(reused_id), Some(reused_slot));
        assert_eq!(reused_view.generation, reused_id.generation);
    }

    #[test]
    fn generated_dungeon_objects_are_deterministic_clear_and_bounded() {
        let scenario = Scenario::dungeon(17, 0, UnitSpec {
            kind: Body::Fighter,
            faction: Faction::Heroes,
            stats: Body::Fighter.base_stats(),
            loadout: Body::Fighter.default_loadout(),
            articulated: None,
            spawn: Vec2::ZERO,
        });
        let a = World::new(&scenario, 17);
        let b = World::new(&scenario, 17);
        assert_eq!(a.dungeon_props, b.dungeon_props);
        // **Twenty-one props became none, and that is the model rather than the
        // seed.** Prop generation was gated on `CombatModel::Legacy` and this
        // floor is embodied, so nothing is dressed -- see
        // `crates/sim/src/world/props.rs` for what a prop still does (block a
        // body, slow one) and what it no longer does (break). The determinism and
        // clearance sweeps below are kept: they cost nothing on an empty list and
        // are what would catch a regression the day the gate opens.
        assert!(a.dungeon_props.is_empty(), "an embodied floor was dressed");
        for prop in &a.dungeon_props {
            let (tx, ty) = Dungeon::tile_of(prop.position);
            for dy in -1..=1 {
                for dx in -1..=1 {
                    assert_eq!(a.dungeon.tile(tx + dx, ty + dy), crate::OPEN,
                        "blocking dressing at identity {} cut the route", prop.identity);
                }
            }
        }
    }

    #[test]
    fn flat_fights_allocate_and_hash_no_dungeon_object_state() {
        let a = World::new(&Scenario::articulated_duel(), 1);
        let mut b = a.clone();
        assert!(a.dungeon_props.is_empty());
        assert_eq!(a.state_hash(), b.state_hash());
        b.dungeon_props.clear();
        assert_eq!(a.state_hash(), b.state_hash());
    }

    fn test_prop(kind: DungeonObjectKind, at: Vec2, half: Fx, hp: Fx) -> DungeonPropState {
        DungeonPropState {
            identity: 7,
            kind,
            position: at,
            yaw: Angle::ZERO,
            half_extents: Vec2::new(half, half),
            hp,
            max_hp: hp,
            broken: false,
        }
    }

    // **`web_and_water_slow_by_their_exact_authored_fractions` went with the
    // function it pinned.** It asserted 0.80 through water, 0.65 through a web,
    // and 0.80 again once the web was broken -- the numbers `World::dungeon_slow_at`
    // authored. `apply_movement` was that function's only caller, so the factor
    // had reached no body since bodies became jointed, and both went together;
    // `world/props.rs` records what that leaves a web being. The fractions are
    // written down there so the next person to want difficult ground is choosing
    // to re-author them rather than inventing them from nothing.

    #[test]
    fn broken_blocking_props_leave_a_stable_non_colliding_tombstone() {
        let mut world = World::new(&Scenario::articulated_duel(), 1);
        let start = world.pos[0];
        world.dungeon_props = vec![test_prop(
            DungeonObjectKind::Barrel, start, Fx::from_ratio(38, 100), Fx::from_int(3),
        )];
        let before = world.state_hash();
        world.resolve_dungeon_props(0);
        assert_ne!(world.pos[0], start);
        world.dungeon_props[0].hp = Fx::ZERO;
        world.dungeon_props[0].broken = true;
        assert_ne!(world.state_hash(), before);
        world.pos[0] = start;
        world.resolve_dungeon_props(0);
        assert_eq!(world.pos[0], start);
        assert_eq!(world.dungeon_objects().count(), 1, "destruction removed stable identity");
    }

    // **`simultaneous_prop_hits_sort_by_time_identity_then_attacker` went with
    // `sort_prop_impacts`.** It pinned the canonical order -- time of impact,
    // then prop identity, then attacker -- that stopped destruction depending on
    // entity allocation order. Nothing had produced a `PropImpact` since the
    // legacy swing resolver was deleted, so the sort was ordering a list that
    // could only be empty, and the ordering rule it defended is worth restating
    // rather than re-deriving the day props become breakable again.
}
