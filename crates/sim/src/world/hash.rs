//! The hash domains: `state_hash`, `state_digest` and the legacy core hash.
//!
//! Every byte written here is a pinned contract. The
//! [golden registry](../../../../docs/reference/hashes.md#golden-registry) names
//! what each domain owns; a change to the order or the width of anything below
//! moves a pin, and a moved pin is normally a bug rather than a number to
//! re-record.

use super::*;

/// Append the feature-only exact response grammar. Every allocated slot has
/// the same width: an inactive slot emits the all-zero row instead of changing
/// where the next entity begins.
#[cfg(feature = "cartesian-recoil")]
pub(super) fn hash_exact_owners(h: &mut Hash64, owners: &[Option<ExactOwnerTrajectory>]) {
    let write_i128 = |h: &mut Hash64, value: i128| {
        h.write_u64(value as u128 as u64);
        h.write_u64((value as u128 >> 64) as u64);
    };
    let write_affine = |h: &mut Hash64, affine: Option<&ExactAffine3>| {
        for axis in 0..3 {
            let (velocity_raw, momentum_remainder, position_raw, position_remainder) =
                affine.map_or((0, 0, 0, 0), |row| (
                    row.momentum[axis].velocity_raw,
                    row.momentum[axis].remainder,
                    row.at_group[axis].raw,
                    row.at_group[axis].remainder,
            ));
            h.write_i32(velocity_raw);
            write_i128(h, momentum_remainder);
            h.write_i32(position_raw);
            write_i128(h, position_remainder);
        }
    };
    for owner in owners {
        write_i128(h, owner.map_or(0, |row| row.common_scale));
        h.write_i32(owner.map_or(0, |row| row.common_response.mass_raw));
        write_affine(h, owner.as_ref().map(|row| &row.common_response));
        for limb in 0..2 {
            let held = owner.as_ref().and_then(|row| row.held_response[limb].as_ref());
            h.write_bool(held.is_some());
            h.write_u16(held.map_or(0, |row| row.spec_id));
            write_affine(h, held.map(|row| &row.affine));
        }
    }
}

#[cfg(feature = "cartesian-recoil")]
fn hash_exact_external_energy(h: &mut Hash64, rows: &[ExactExternalEnergyRow]) {
    let write_i128 = |h: &mut Hash64, value: i128| {
        h.write_u64(value as u128 as u64);
        h.write_u64((value as u128 >> 64) as u64);
    };
    h.write_u32(rows.len() as u32);
    for row in rows {
        row.entity.hash_into(h);
        h.write_u8(row.lane);
        h.write_u8(row.reason);
        write_i128(h, row.signed_numerator);
        write_i128(h, row.denominator);
    }
}

#[cfg(feature = "cartesian-recoil")]
fn post_contact_hash_bytes(arm: ArmState) -> [u8; 13] {
    let mut bytes = [0u8; 13];
    bytes[0] = u8::from(arm.post_contact_active);
    bytes[1..5].copy_from_slice(&arm.post_contact_com_velocity.x.raw().to_le_bytes());
    bytes[5..9].copy_from_slice(&arm.post_contact_com_velocity.y.raw().to_le_bytes());
    bytes[9..13].copy_from_slice(&arm.post_contact_com_velocity.z.raw().to_le_bytes());
    bytes
}

impl World {
    /// Fingerprint of the complete simulation state.
    ///
    /// The legacy-domain state value.
    ///
    /// New domain-aware code uses [`World::state_digest`]. Keeping this entry
    /// point is what preserves every existing native and browser golden, but an
    /// articulated world's returned legacy-core value has no meaningful bare
    /// `u64` comparison.
    pub fn state_hash(&self) -> u64 {
        self.legacy_core_hash()
    }

    /// The pre-v2 byte writer, kept whole so both domains can reuse it without
    /// making their values comparable.
    fn legacy_core_hash(&self) -> u64 {
        let mut h = Hash64::new();
        h.write_u64(self.seed);
        h.write_u32(self.tick);
        h.write_i32(self.arena.x.raw());
        h.write_i32(self.arena.y.raw());
        // The floor plan, as its digest rather than as 3060 bytes. Written
        // **unconditionally**, including for a floor plan with nothing carved,
        // on exactly the argument the empty shot block below makes: a
        // fingerprint that only looks at the grid once something is standing
        // behind a wall cannot catch a broken tile column until it is too late
        // to say which tick broke it.
        h.write_u64(self.dungeon.fingerprint());
        // And the doorways. Whether one is *open* is a tile value and therefore
        // already in the digest above; how hard somebody is leaning on it is
        // not, and a door one tick from opening is not the same world as an
        // untouched one. Written in ascending door index, with the length first
        // so that two worlds cannot line up one's pressures against another's.
        //
        // **Skipped entirely on a plan with no doorway in it**, which is the one
        // place this departs from the argument the empty shot block below makes
        // -- and the departure is sound because the two are not the same shape.
        // An arrow can be loosed into a world that has never held one, so a shot
        // column that is only fingerprinted once something is flying is a column
        // nothing checks until it is too late to say which tick broke it. A door
        // cannot be built: the list is read off the floor plan when the world is
        // constructed and is fixed in length for its life, so "no doors" is a
        // permanent fact about this world rather than a state it is passing
        // through. Writing a zero for it would have moved `GOLDEN_STATE_HASH`
        // and every lab golden to record that nothing had changed.
        if !self.doors.is_empty() {
            h.write_u32(self.doors.len() as u32);
            for door in &self.doors {
                h.write_u16(door.pressed);
            }
        }
        if !self.dungeon_props.is_empty() {
            h.write_u32(self.dungeon_props.len() as u32);
            for prop in &self.dungeon_props {
                h.write_u32(prop.identity);
                h.write_u32(prop.kind as u32);
                h.write_i32(prop.position.x.raw());
                h.write_i32(prop.position.y.raw());
                h.write_u16(prop.yaw.raw());
                h.write_i32(prop.half_extents.x.raw());
                h.write_i32(prop.half_extents.y.raw());
                h.write_i32(prop.hp.raw());
                h.write_i32(prop.max_hp.raw());
                h.write_bool(prop.broken);
            }
        }
        for order in self.orders {
            order.hash_into(&mut h);
        }
        // Beside the orders because it is the same kind of thing: an input the
        // page can change, and two runs that differ in it are two runs.
        for objective in self.objectives {
            objective.hash_into(&mut h);
        }
        h.write_u32(self.alive.len() as u32);
        for i in 0..self.alive.len() {
            h.write_bool(self.alive[i]);
            h.write_u32(self.generation[i]);
            h.write_i32(self.pos[i].x.raw());
            h.write_i32(self.pos[i].y.raw());
            h.write_u16(self.facing[i].raw());
            h.write_i32(self.hp[i].raw());
            h.write_i32(self.vel[i].x.raw());
            h.write_i32(self.vel[i].y.raw());
            // Every field of every hand, `phase` included. It looks like a
            // rounding residue and it is real state: two worlds differing only
            // in phase produce different angles one tick later, and a replay
            // that did not fingerprint it would diverge with nothing to point
            // at.
            self.limb[i].hash_into(&mut h);
            // The loadout and the slot are state the sim acts on, and the page
            // can change both -- so a run in which a fighter swapped and one in
            // which it did not must not fingerprint alike. The same argument
            // `Order::hash_into` makes for a destination.
            self.loadout[i].hash_into(&mut h);
            h.write_u8(self.slot[i]);
            // And so are the body and the stat sheet, for exactly the same
            // reason and only since `World::set_body` and `World::set_stats`
            // landed. While these were fixed at spawn they were a fact about the
            // *scenario*, already fingerprinted by `Scenario::fingerprint`, and
            // hashing them here would have bought nothing. They are inputs now,
            // so a run in which the page raised a fighter's vitality and one in
            // which it did not must not fingerprint alike.
            //
            // `radius`, `mass` and `max_hp` are written even though all three
            // are derived -- the first two from `kind` and the third from
            // `stats` -- because they are *cached* derivations sitting in their
            // own columns, and a mutator that updated one and forgot another is
            // precisely the half-change `UnitSpec::set_body` exists to warn
            // about. A fingerprint that cannot see the halves apart cannot catch
            // it.
            self.stats[i].hash_into(&mut h);
            self.kind[i].hash_into(&mut h);
            h.write_i32(self.radius[i].raw());
            h.write_i32(self.mass[i].raw());
            h.write_i32(self.max_hp[i].raw());
            h.write_u32(self.next_decision[i]);
            h.write_u32(self.last_combat[i]);
            h.write_i32(self.regen_left[i].raw());
            h.write_i32(self.damage_dealt[i].raw());
            self.command[i].hash_into(&mut h);
        }
        // Arrows. State the sim acts on like any other: two worlds identical but
        // for one having a shot in the air diverge the moment it arrives.
        //
        // Written **unconditionally**, including the length when there are no
        // arrows anywhere. Hashing the block only when it is non-empty would
        // have spared a golden re-record and left a fingerprint that cannot see
        // a broken projectile column until something is already flying -- which
        // is precisely when a replay is hardest to reason about.
        //
        // `shot_free` is not hashed, following `World::free`'s precedent: the
        // free list is reachable-state bookkeeping, and any two worlds with the
        // same history have the same one.
        h.write_u32(self.shot_alive.len() as u32);
        for k in 0..self.shot_alive.len() {
            h.write_bool(self.shot_alive[k]);
            h.write_i32(self.shot_pos[k].x.raw());
            h.write_i32(self.shot_pos[k].y.raw());
            h.write_i32(self.shot_vel[k].x.raw());
            h.write_i32(self.shot_vel[k].y.raw());
            h.write_i32(self.shot_range[k].raw());
            h.write_i32(self.shot_mass[k].raw());
            h.write_i32(self.shot_power[k].raw());
            h.write_u8(self.shot_faction[k].index() as u8);
            self.shot_owner[k].hash_into(&mut h);
        }
        h.finish()
    }

    /// A state fingerprint carrying the byte grammar needed to compare it.
    pub fn state_digest(&self) -> crate::StateDigest {
        match self.combat_model {
            crate::CombatModel::Articulated => crate::StateDigest {
                domain: crate::HashDomain::ArticulatedV1,
                schema: 1,
                value: self.articulated_state_digest(crate::CombatModel::Articulated, 1),
            },
            crate::CombatModel::Embodied => crate::StateDigest {
                domain: crate::HashDomain::EmbodiedV1,
                schema: 1,
                value: self.articulated_state_digest(crate::CombatModel::Embodied, 2),
            },
        }
    }

    /// The articulated body's state stream, tagged by the model that owns it.
    ///
    /// One implementation for two models rather than a second copy of a
    /// hundred-line byte grammar, because an embodied body is an articulated one
    /// plus a tail, and a copy is a second place for a column to be forgotten.
    /// Two bytes differ before that tail, and both are tags rather than state:
    /// the model byte in the prefix, and `payload_tag`, which says which payload
    /// contract each stored command arrived under.
    ///
    /// **It stayed shared when the embodied body grew columns of its own, and
    /// the shape of the tail is why.** This comment used to say the first such
    /// column would end the sharing; what actually happened is that the floor,
    /// the legs and now the elbow plane all went *behind the model guard at the
    /// end*, after every byte the articulated grammar writes. That keeps the
    /// property the warning was protecting -- an articulated digest answers
    /// exactly what it answered before any of them existed -- without a second
    /// copy of the hundred lines above, and it is checked rather than asserted:
    /// `an_embodied_only_column_cannot_move_an_articulated_digest` mutates each
    /// one and watches only `EmbodiedV1` move.
    ///
    /// A `Legacy` world never reaches here; its digest is
    /// [`World::legacy_core_hash`] and it allocates none of the columns below.
    fn articulated_state_digest(&self, model: crate::CombatModel, payload_tag: u8) -> u64 {
        let mut h = Hash64::new();
        h.write_bytes(b"ARPG-STATE");
        h.write_u16(1);
        h.write_u8(model as u8);
        // Reserved now so v2-11 can activate the submitted-command
        // grammar without changing the prefix that declares it.
        h.write_u16(1);
        h.write_u64(self.legacy_core_hash());
        h.write_u32(self.articulated_command.len() as u32);
        for command in &self.articulated_command {
            match command {
                None => h.write_u8(0),
                Some(command) => {
                    h.write_u8(1);
                    h.write_u8(payload_tag);
                    h.write_bytes(&command.payload_bytes());
                }
            }
        }
        self.combat_specs.as_ref().expect("articulated combat specs")
            .rows_into(&self.combat_units, &mut h);
        for i in 0..self.articulated_command.len() {
            h.write_u16(self.articulated_anatomy[i].expect("articulated slot anatomy"));
            for item in self.articulated_carried[i] {
                match item {
                    None => h.write_u8(0),
                    Some(id) => { h.write_u8(1); h.write_u16(id); }
                }
            }
            for item in self.articulated_equipment[i] {
                match item {
                    None => h.write_u8(0),
                    Some(id) => { h.write_u8(1); h.write_u16(id); }
                }
            }
        }
        for i in 0..self.articulated_command.len() {
            let yaw = self.body_yaw[i];
            h.write_u16(yaw.angle.raw());
            h.write_i32(yaw.speed_turns.raw());
            h.write_i32(yaw.authority_residue.raw());
            for arm in self.arms[i] {
                h.write_u16(arm.bearing.raw());
                h.write_i32(arm.bearing_speed_turns.raw());
                h.write_i32(arm.height.raw());
                h.write_i32(arm.height_speed.raw());
                h.write_i32(arm.reach.raw());
                h.write_i32(arm.reach_speed.raw());
                for point in [arm.previous_hand, arm.hand, arm.linear_velocity] {
                    h.write_i32(point.x.raw()); h.write_i32(point.y.raw()); h.write_i32(point.z.raw());
                }
                h.write_i32(arm.fatigue.raw());
                h.write_i32(arm.work_residue.raw());
                #[cfg(feature = "cartesian-recoil")]
                {
                    h.write_bytes(&post_contact_hash_bytes(arm));
                }
            }
            for grip in self.grips[i] {
                match grip.equipment_slot {
                    None => h.write_u8(0),
                    Some(slot) => { h.write_u8(1); h.write_u8(slot); }
                }
            }
            match self.shield_pose[i] {
                None => h.write_u8(0),
                Some(shield) => {
                    h.write_u8(1);
                    for point in [shield.centre, shield.normal] {
                        h.write_i32(point.x.raw()); h.write_i32(point.y.raw()); h.write_i32(point.z.raw());
                    }
                    h.write_i32(shield.half_width.raw());
                    h.write_i32(shield.half_height.raw());
                    h.write_i32(shield.thickness.raw());
                }
            }
            h.write_i32(self.move_authority[i].raw());
            h.write_i32(self.turn_authority[i].raw());
            h.write_i32(self.arm_authority[i][0].raw());
            h.write_i32(self.arm_authority[i][1].raw());
        }
        for releases in &self.articulated_release_was {
            h.write_u8(releases[0] as u8);
            h.write_u8(releases[1] as u8);
        }
        h.write_u32(self.articulated_projectile_alive.len() as u32);
        for k in 0..self.articulated_projectile_alive.len() {
            h.write_bool(self.articulated_projectile_alive[k]);
            h.write_u32(self.articulated_projectile_generation[k]);
            for point in [self.articulated_projectile_pos[k], self.articulated_projectile_vel[k]] {
                h.write_i32(point.x.raw()); h.write_i32(point.y.raw()); h.write_i32(point.z.raw());
            }
            h.write_i32(self.articulated_projectile_range[k].raw());
            h.write_i32(self.articulated_projectile_radius[k].raw());
            h.write_i32(self.articulated_projectile_mass[k].raw());
            self.articulated_projectile_owner[k].hash_into(&mut h);
            h.write_u8(self.articulated_projectile_faction[k].index() as u8);
        }
        // One global counter, after the complete actuator loop and
        // before the anatomy rows. Not per slot: the iteration cap
        // is a property of the tick, not of any entity in it, and a
        // per-slot copy would be four bytes of the same number sixty-
        // four times over. It is the only contact byte in this digest --
        // the resolutions and the scratch are evidence, and hashing
        // evidence would make an observation into authoritative state.
        h.write_u32(self.contact_cap_hits());
        // One 61-byte anatomy row per allocated slot, with no second
        // slot count: the actuator loop above has already established
        // the length, and a repeated count is a second thing that can
        // disagree. Dead slots keep their final row -- a later bleed
        // reads `last_attacker` off a body that has stopped moving, so
        // it is authoritative after death as well as before it.
        for i in 0..self.articulated_command.len() {
            self.wounds.get(i).copied().unwrap_or(AnatomyState::EMPTY).hash_into(&mut h);
        }
        #[cfg(feature = "cartesian-recoil")]
        {
            hash_exact_owners(&mut h, &self.exact_owners);
            hash_exact_external_energy(&mut h, self.exact_external_energy());
        }
        // The floor each body is standing on, and **only for the model that has
        // one**. This is the first byte the two grammars do not share, so it is
        // appended last and behind the model rather than woven in: an
        // articulated digest must answer exactly what it answered before terrain
        // existed, and the guard is what makes that a property rather than a
        // hope. `ground_z` is derived from position, so hashing it cannot make a
        // digest disagree with the state -- it can only catch the column
        // drifting away from the position it is supposed to follow.
        if matches!(model, crate::CombatModel::Embodied) {
            for z in &self.ground_z {
                h.write_i32(z.raw());
            }
            // The legs, after the floor they stand on and in declaration order.
            // **Twist is absent on purpose**: it is `body_yaw.delta(hip_yaw)`,
            // and both are already in this stream, so hashing it would be
            // hashing the same fact twice and would let a future derivation
            // change disagree with itself.
            for stance in &self.stance {
                h.write_u16(stance.hip_yaw.raw());
                h.write_i32(stance.hip_yaw_speed_turns.raw());
                h.write_i32(stance.hip_authority_residue.raw());
                h.write_i32(stance.pelvis.raw());
                h.write_u8(stance.step_left);
            }
            // The elbow planes, after the legs and in declaration order.
            // **Both halves**, unlike `twist` above, because neither is derived
            // from the other: `commanded` is what the last accepted command
            // asked for and survives until the next decision, `held` is where
            // the chase has got to, and a replay that reproduced only one of
            // them would either forget the request between ticks or resume the
            // chase from the wrong place. They are only equal once the arm has
            // arrived.
            for planes in &self.elbow_plane {
                for plane in planes {
                    h.write_u16(plane.commanded.raw());
                    h.write_u16(plane.held.raw());
                }
            }
        }
        h.finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world::testkit::*;

    fn assert_actuator_hash_mutation(mutate: impl FnOnce(&mut World)) {
        let scenario = Scenario::articulated_duel();
        let base = World::new(&scenario, 1);
        let legacy = base.state_hash();
        let digest = base.state_digest().value;
        let mut changed = base.clone();
        mutate(&mut changed);
        assert_eq!(changed.state_hash(), legacy, "actuator state leaked into LegacyV1");
        assert_ne!(changed.state_digest().value, digest, "actuator field was omitted from ArticulatedV1");
    }

    #[test]
    fn every_actuator_field_changes_only_the_articulated_hash_domain() {
        assert_actuator_hash_mutation(|w| w.body_yaw[0].angle = Angle::from_raw(1));
        assert_actuator_hash_mutation(|w| w.body_yaw[0].speed_turns = Fx::from_raw(1));
        assert_actuator_hash_mutation(|w| w.body_yaw[0].authority_residue = Fx::from_raw(1));
        // Not an actuator row, but it rides in the same digest and answers to
        // the same rule: ArticulatedV1 sees it, LegacyV1 must not.
        assert_actuator_hash_mutation(|w| {
            w.contact.as_mut().expect("articulated contact state").state.cap_hits = 1;
        });
        for limb in 0..2 {
            assert_actuator_hash_mutation(|w| w.arms[0][limb].bearing = Angle::from_raw(1));
            assert_actuator_hash_mutation(|w| w.arms[0][limb].bearing_speed_turns = Fx::from_raw(1));
            assert_actuator_hash_mutation(|w| w.arms[0][limb].height = crate::CombatHeight::LOW);
            assert_actuator_hash_mutation(|w| w.arms[0][limb].height_speed = Fx::from_raw(1));
            assert_actuator_hash_mutation(|w| w.arms[0][limb].reach = Fx::from_raw(actuator::ARM_MIN_REACH_RAW + 1));
            assert_actuator_hash_mutation(|w| w.arms[0][limb].reach_speed = Fx::from_raw(1));
            for axis in 0..3 {
                assert_actuator_hash_mutation(|w| match axis {
                    0 => w.arms[0][limb].previous_hand.x += Fx::from_raw(1),
                    1 => w.arms[0][limb].previous_hand.y += Fx::from_raw(1),
                    _ => w.arms[0][limb].previous_hand.z += Fx::from_raw(1),
                });
                assert_actuator_hash_mutation(|w| match axis {
                    0 => w.arms[0][limb].hand.x += Fx::from_raw(1),
                    1 => w.arms[0][limb].hand.y += Fx::from_raw(1),
                    _ => w.arms[0][limb].hand.z += Fx::from_raw(1),
                });
                assert_actuator_hash_mutation(|w| match axis {
                    0 => w.arms[0][limb].linear_velocity.x = Fx::from_raw(1),
                    1 => w.arms[0][limb].linear_velocity.y = Fx::from_raw(1),
                    _ => w.arms[0][limb].linear_velocity.z = Fx::from_raw(1),
                });
                #[cfg(feature = "cartesian-recoil")]
                assert_actuator_hash_mutation(|w| match axis {
                    0 => w.arms[0][limb].post_contact_com_velocity.x = Fx::from_raw(1),
                    1 => w.arms[0][limb].post_contact_com_velocity.y = Fx::from_raw(1),
                    _ => w.arms[0][limb].post_contact_com_velocity.z = Fx::from_raw(1),
                });
            }
            #[cfg(feature = "cartesian-recoil")]
            assert_actuator_hash_mutation(|w| w.arms[0][limb].post_contact_active = true);
            assert_actuator_hash_mutation(|w| w.arms[0][limb].fatigue = Fx::from_raw(1));
            assert_actuator_hash_mutation(|w| w.arms[0][limb].work_residue = Fx::from_raw(1));
            assert_actuator_hash_mutation(|w| w.grips[0][limb].equipment_slot = None);
            assert_actuator_hash_mutation(|w| w.grips[0][limb].equipment_slot =
                Some(w.grips[0][limb].equipment_slot.unwrap_or(0) ^ 1));
        }
        assert_actuator_hash_mutation(|w| w.shield_pose[0] = None);
        for axis in 0..3 {
            assert_actuator_hash_mutation(|w| match axis {
                0 => w.shield_pose[0].as_mut().unwrap().centre.x += Fx::from_raw(1),
                1 => w.shield_pose[0].as_mut().unwrap().centre.y += Fx::from_raw(1),
                _ => w.shield_pose[0].as_mut().unwrap().centre.z += Fx::from_raw(1),
            });
            assert_actuator_hash_mutation(|w| match axis {
                0 => w.shield_pose[0].as_mut().unwrap().normal.x += Fx::from_raw(1),
                1 => w.shield_pose[0].as_mut().unwrap().normal.y += Fx::from_raw(1),
                _ => w.shield_pose[0].as_mut().unwrap().normal.z += Fx::from_raw(1),
            });
        }
        assert_actuator_hash_mutation(|w| w.shield_pose[0].as_mut().unwrap().half_width += Fx::from_raw(1));
        assert_actuator_hash_mutation(|w| w.shield_pose[0].as_mut().unwrap().half_height += Fx::from_raw(1));
        assert_actuator_hash_mutation(|w| w.shield_pose[0].as_mut().unwrap().thickness += Fx::from_raw(1));
        assert_actuator_hash_mutation(|w| w.move_authority[0] = Fx::HALF);
        assert_actuator_hash_mutation(|w| w.turn_authority[0] = Fx::HALF);
        assert_actuator_hash_mutation(|w| w.arm_authority[0][0] = Fx::HALF);
        assert_actuator_hash_mutation(|w| w.arm_authority[0][1] = Fx::HALF);
    }

    #[test]
    fn move_turn_and_arm_impairment_factors_are_one_and_already_hashed() {
        let scenario = Scenario::articulated_duel();
        let world = World::new(&scenario, 1);
        for id in [EntityId::new(0, 0), EntityId::new(1, 0)] {
            let pose = world.articulated_pose_test_view(id).unwrap();
            assert_eq!((pose.move_authority, pose.turn_authority, pose.arm_authority),
                (Fx::ONE, Fx::ONE, [Fx::ONE; 2]));
        }
        assert_actuator_hash_mutation(|w| w.move_authority[0] = Fx::HALF);
        assert_actuator_hash_mutation(|w| w.turn_authority[0] = Fx::HALF);
        assert_actuator_hash_mutation(|w| w.arm_authority[0] = [Fx::HALF, Fx::ONE]);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn every_exact_trajectory_hash_word_is_load_bearing_in_fixed_entity_limb_xyz_order() {
        let scenario = Scenario::articulated_duel();
        let baseline = exact_owner_rows_hash(&World::new(&scenario, 1));
        let mut scale = World::new(&scenario, 1);
        scale.exact_owners[0].as_mut().unwrap().common_scale += 1;
        assert_ne!(exact_owner_rows_hash(&scale), baseline,
                   "the immutable common lattice scale was not hashed");
        let mut active_mass = World::new(&scenario, 1);
        active_mass.exact_owners[0].as_mut().unwrap().common_response.mass_raw -= 1;
        assert_ne!(exact_owner_rows_hash(&active_mass), baseline,
                   "active common mass was not hashed beside its lattice");
        for axis in 0..3 {
            for word in 0..4 {
                let mut world = World::new(&scenario, 1);
                let affine = &mut world.exact_owners[0].as_mut().unwrap().common_response;
                match word {
                    0 => affine.momentum[axis].velocity_raw = 1,
                    1 => affine.momentum[axis].remainder = -1,
                    2 => affine.at_group[axis].raw = 1,
                    _ => affine.at_group[axis].remainder = -1,
                }
                assert_ne!(exact_owner_rows_hash(&world), baseline,
                           "common axis {axis} word {word} was not hashed");
            }
        }
        for limb in 0..2 {
            for axis in 0..3 {
                for word in 0..4 {
                    let mut world = World::new(&scenario, 1);
                    let affine = &mut world.exact_owners[0].as_mut().unwrap()
                        .held_response[limb].as_mut().unwrap().affine;
                    match word {
                        0 => affine.momentum[axis].velocity_raw = 1,
                        1 => affine.momentum[axis].remainder = -1,
                        2 => affine.at_group[axis].raw = 1,
                        _ => affine.at_group[axis].remainder = -1,
                    }
                    assert_ne!(exact_owner_rows_hash(&world), baseline,
                               "limb {limb} axis {axis} word {word} was not hashed");
                }
            }
            let mut spec = World::new(&scenario, 1);
            spec.exact_owners[0].as_mut().unwrap().held_response[limb]
                .as_mut().unwrap().spec_id = u16::MAX;
            assert_ne!(exact_owner_rows_hash(&spec), baseline,
                       "limb {limb} immutable spec tag was not hashed");
            let mut absent = World::new(&scenario, 1);
            absent.exact_owners[0].as_mut().unwrap().held_response[limb] = None;
            assert_ne!(exact_owner_rows_hash(&absent), baseline,
                       "limb {limb} presence tag was not hashed");
        }
        let mut swapped = World::new(&scenario, 1);
        swapped.exact_owners[0].as_mut().unwrap().held_response.swap(0, 1);
        assert_ne!(exact_owner_rows_hash(&swapped), baseline,
                   "left and right occupied one unordered hash bucket");
        let mut entity_swapped = World::new(&scenario, 1);
        entity_swapped.exact_owners.swap(0, 1);
        assert_ne!(exact_owner_rows_hash(&entity_swapped), baseline,
                   "entity rows occupied one unordered hash bucket");
        let mut positive = World::new(&scenario, 1);
        positive.exact_owners[0].as_mut().unwrap()
            .common_response.at_group[1].remainder = 1;
        let mut negative = World::new(&scenario, 1);
        negative.exact_owners[0].as_mut().unwrap()
            .common_response.at_group[1].remainder = -1;
        assert_ne!(exact_owner_rows_hash(&positive), exact_owner_rows_hash(&negative),
                   "a sign mirror erased the signed remainder word");
    }

    #[test]
    fn immutable_armor_and_dimensions_cannot_drift_from_scenario_identity() {
        use crate::combat::spec::Material;
        let scenario = fragile_scenario(&[]);
        let base = scenario.fingerprint();
        let base_digest = World::new(&scenario, 1).state_digest().value;
        let changes: [(&str, fn(&mut crate::BodyAnatomySpec)); 7] = [
            ("coverage", |a| a.armor[BodyPart::Torso as usize].coverage = Fx::HALF),
            ("hardness", |a| a.armor[BodyPart::Torso as usize].hardness = Fx::HALF),
            ("absorption", |a| a.armor[BodyPart::Torso as usize].absorption = Fx::HALF),
            ("armor material", |a| a.armor[BodyPart::Head as usize].material = Material::Steel),
            ("integrity maximum", |a| a.integrity_maxima[BodyPart::Head as usize] += Fx::from_raw(1)),
            ("blood maximum", |a| a.blood_max += Fx::from_raw(1)),
            ("region radius", |a| a.regions[BodyPart::Legs as usize].radius += Fx::from_raw(1)),
        ];
        for (name, change) in changes {
            let mut moved = scenario.clone();
            change(&mut moved.combat_specs.as_mut().unwrap().anatomies[0]);
            assert_ne!(moved.fingerprint(), base, "{name} left scenario identity");
            assert_ne!(World::new(&moved, 1).state_digest().value, base_digest,
                       "{name} left replay construction");
        }
        // And the traffic runs one way. Armour is immutable, so changing it may
        // not move a single byte of the mutable anatomy rows -- if it did, the
        // same fact would be recorded in two places and could disagree.
        let mut armoured = scenario.clone();
        armoured.combat_specs.as_mut().unwrap().anatomies[0].armor[BodyPart::Torso as usize]
            .coverage = Fx::HALF;
        assert_eq!(anatomy_suffix_bytes(&World::new(&armoured, 1)),
                   anatomy_suffix_bytes(&World::new(&scenario, 1)),
                   "an immutable armour field reached the mutable anatomy row");
    }

    #[test]
    fn last_attacker_identity_is_hashed_and_owns_later_bleed_credit() {
        let scenario = fragile_scenario(&[]);
        let mut world = World::new(&scenario, 1);
        world.wounds[1].parts[BodyPart::Torso as usize].wound = Fx::from_int(3);
        world.wounds[1].last_attacker = EntityId::new(0, 0);
        let digest = world.state_digest().value;

        // The generation is part of it. A handle naming the same row at a
        // generation that has moved on resolves to nobody, so its credit stops
        // -- which is the whole reason the identity is hashed rather than
        // treated as a diagnostic.
        let mut stale = world.clone();
        stale.wounds[1].last_attacker = EntityId::new(0, 1);
        assert_ne!(stale.state_digest().value, digest, "the generation word is not hashed");
        assert_eq!(stale.state_hash(), world.state_hash());
        for _ in 0..600 {
            world.step();
            stale.step();
        }
        assert!(world.damage_dealt[0].is_positive());
        assert_eq!(stale.damage_dealt[0], Fx::ZERO, "a stale handle collected credit");
        assert_eq!(world.health_of(1), stale.health_of(1),
                   "credit routing changed how much the body lost");
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn post_contact_hash_words_are_tag_xyz_in_entity_and_limb_order() {
        let mut first = actuator::tucked_arm(Vec3::ZERO);
        first.post_contact_active = true;
        first.post_contact_com_velocity = Vec3::new(
            Fx::from_raw(0x0102_0304), Fx::from_raw(-2), Fx::MIN);
        let second = actuator::tucked_arm(Vec3::ZERO);
        let first_bytes = post_contact_hash_bytes(first);
        let second_bytes = post_contact_hash_bytes(second);
        assert_eq!(first_bytes,
            [1, 4, 3, 2, 1, 254, 255, 255, 255, 0, 0, 0, 128]);
        assert_eq!(second_bytes, [0; 13]);
        let mut h = Hash64::new();
        // This is the exact tail grammar used while walking entities, then
        // limbs, in their stable Vec/array order.
        h.write_bytes(&first_bytes); h.write_bytes(&second_bytes);
        assert_eq!(h.finish(), 0x01f8_00b0_9ec8_89cf);
    }

    /// One slot's anatomy row, written out by hand in the order the reference
    /// specifies. A hand mirror rather than a call to `hash_into`, because a
    /// mirror that reused the writer would agree with a drifted writer.
    fn anatomy_row_bytes(world: &World, i: usize) -> Vec<u8> {
        let state = world.wounds[i];
        let mut bytes = Vec::new();
        for part in state.parts {
            bytes.extend_from_slice(&part.integrity.raw().to_le_bytes());
            bytes.extend_from_slice(&part.wound.raw().to_le_bytes());
            bytes.push(part.severed as u8);
        }
        bytes.extend_from_slice(&state.blood.raw().to_le_bytes());
        bytes.extend_from_slice(&state.shock.raw().to_le_bytes());
        bytes.extend_from_slice(&state.last_attacker.index.to_le_bytes());
        bytes.extend_from_slice(&state.last_attacker.generation.to_le_bytes());
        assert_eq!(bytes.len(), crate::anatomy::ANATOMY_HASH_ROW_BYTES);
        bytes
    }

    fn anatomy_suffix_bytes(world: &World) -> Vec<u8> {
        (0..world.alive.len()).flat_map(|i| anatomy_row_bytes(world, i)).collect()
    }

    fn articulated_suffix_bytes(world: &World) -> Vec<u8> {
        #[allow(unused_mut)]
        let mut bytes = anatomy_suffix_bytes(world);
        #[cfg(feature = "cartesian-recoil")]
        for owner in &world.exact_owners {
            bytes.extend_from_slice(&owner.map_or(0, |row| row.common_scale).to_le_bytes());
            bytes.extend_from_slice(&owner.map_or(0, |row| row.common_response.mass_raw).to_le_bytes());
            let append_affine = |bytes: &mut Vec<u8>, affine: Option<&ExactAffine3>| {
                for axis in 0..3 {
                    let (velocity_raw, momentum_remainder, position_raw, position_remainder) =
                        affine.map_or((0, 0, 0, 0), |row| (
                            row.momentum[axis].velocity_raw,
                            row.momentum[axis].remainder,
                            row.at_group[axis].raw,
                            row.at_group[axis].remainder,
                        ));
                    bytes.extend_from_slice(&velocity_raw.to_le_bytes());
                    bytes.extend_from_slice(&momentum_remainder.to_le_bytes());
                    bytes.extend_from_slice(&position_raw.to_le_bytes());
                    bytes.extend_from_slice(&position_remainder.to_le_bytes());
                }
            };
            append_affine(&mut bytes, owner.as_ref().map(|row| &row.common_response));
            for limb in 0..2 {
                let held = owner.as_ref().and_then(|row| row.held_response[limb].as_ref());
                bytes.push(held.is_some() as u8);
                bytes.extend_from_slice(&held.map_or(0, |row| row.spec_id).to_le_bytes());
                append_affine(&mut bytes, held.map(|row| &row.affine));
            }
        }
        #[cfg(feature = "cartesian-recoil")]
        {
            let external = world.exact_external_energy();
            bytes.extend_from_slice(&(external.len() as u32).to_le_bytes());
            for row in external {
                bytes.extend_from_slice(&row.entity.index.to_le_bytes());
                bytes.extend_from_slice(&row.entity.generation.to_le_bytes());
                bytes.push(row.lane); bytes.push(row.reason);
                bytes.extend_from_slice(&row.signed_numerator.to_le_bytes());
                bytes.extend_from_slice(&row.denominator.to_le_bytes());
            }
        }
        bytes
    }

    #[test]
    fn contact_cap_hashes_once_after_all_actuator_rows() {
        let scenario = Scenario::articulated_duel();
        let base = World::new(&scenario, 1);
        let mut bumped = base.clone();
        bumped.contact.as_mut().expect("articulated contact state").state.cap_hits = 1;
        assert_eq!(bumped.state_hash(), base.state_hash(), "cap_hits leaked into LegacyV1");
        assert_ne!(bumped.state_digest().value, base.state_digest().value);

        // Where the suffix rows sit is the part worth proving rather than
        // asserting, because the positions are what the contract froze and a
        // reader cannot see them from the digest. FNV-1a multiplies by an odd
        // prime, so every step is invertible: winding a known digest back over
        // the authoritative suffix and then over four counter bytes recovers exactly
        // the state the actuator loop left behind. Anything else written after
        // that loop -- a per-slot copy of the counter, a placeholder, an
        // anatomy row on the wrong side of it -- makes the two disagree.
        let prime = 0x100_0000_01b3u64;
        let mut inverse = prime;
        for _ in 0..6 {
            inverse = inverse.wrapping_mul(2u64.wrapping_sub(prime.wrapping_mul(inverse)));
        }
        assert_eq!(prime.wrapping_mul(inverse), 1, "the prime is not invertible mod 2^64");
        let unwind = |digest: u64, cap: u32, rows: &[u8]| {
            let mut state = digest;
            for byte in rows.iter().rev().copied().chain(cap.to_le_bytes().into_iter().rev()) {
                state = state.wrapping_mul(inverse) ^ u64::from(byte);
            }
            state
        };
        let rows = articulated_suffix_bytes(&base);
        #[cfg(not(feature = "cartesian-recoil"))]
        assert_eq!(rows.len(), base.alive.len() * crate::anatomy::ANATOMY_HASH_ROW_BYTES);
        #[cfg(feature = "cartesian-recoil")]
        assert_eq!(rows.len(), base.alive.len() * (crate::anatomy::ANATOMY_HASH_ROW_BYTES + 386) + 4);
        let actuator_tail = unwind(base.state_digest().value, 0, &rows);
        assert_eq!(unwind(bumped.state_digest().value, 1, &rows), actuator_tail,
                   "cap_hits and the authoritative rows are not the digest's tail");

        // And the counter is one global value rather than one per slot. A third
        // allocated row changes the actuator prefix, so the recovered state
        // must differ -- but the single four-byte unwind must still reconcile
        // the pair, which it could not if the counter were written per slot.
        let mut wider = base.clone();
        wider.try_spawn(&scenario.units[1]).expect("a third row");
        let mut wider_bumped = wider.clone();
        wider_bumped.contact.as_mut().expect("articulated contact state").state.cap_hits = 1;
        let wider_rows = articulated_suffix_bytes(&wider);
        let wider_tail = unwind(wider.state_digest().value, 0, &wider_rows);
        assert_ne!(wider_tail, actuator_tail, "a third actuator row hashed nothing");
        assert_eq!(unwind(wider_bumped.state_digest().value, 1, &wider_rows), wider_tail,
                   "cap_hits was written once per slot");
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn rejection_provenance_changes_no_hash_publication_or_retained_capacity() {
        let scenario = Scenario::articulated_duel();
        let base = World::new(&scenario, 1);
        let mut witnessed = base.clone();
        let capacities = witnessed.contact_capacities();
        let key = (witnessed.id_of(0), LimbSlot::RightArm as u8,
                   witnessed.id_of(1), BODY_SLOT, ContactKind::WeaponBody);
        witnessed.contact.as_mut().unwrap().first_exact_rejection = Some(
            ExactContactRejectionDiagnostic { tick: 17,
                phase: ExactContactRejectPhase::SolveGroup,
                cause: ResolutionError::ExactSolver, key: Some(key) });
        assert_eq!(witnessed.state_hash(), base.state_hash());
        assert_eq!((witnessed.state_digest().domain, witnessed.state_digest().schema,
                    witnessed.state_digest().value),
                   (base.state_digest().domain, base.state_digest().schema,
                    base.state_digest().value));
        assert_eq!(witnessed.contact_resolutions(), base.contact_resolutions());
        assert_eq!(witnessed.exact_external_energy(), base.exact_external_energy());
        assert_eq!(witnessed.contact_capacities(), capacities);
        assert_eq!(witnessed.first_exact_contact_rejection().unwrap().key, Some(key));

        let later = ExactContactRejectionDiagnostic { tick: 18,
            phase: ExactContactRejectPhase::StageCommit,
            cause: ResolutionError::ExactScan, key: None };
        witnessed.contact.as_mut().unwrap().first_exact_rejection.get_or_insert(later);
        assert_ne!(witnessed.first_exact_contact_rejection(), Some(later),
                   "a later distinct refusal replaced the first diagnostic");
    }

    #[test]
    fn a_refused_contact_tick_is_counted_and_never_hashed() {
        // The counter exists so that "no row ever showed energy creation" can
        // be told apart from "no row was ever published". `cap_hits` sits one
        // field away and *is* hashed, so the pairing worth pinning is that the
        // two answer differently: a capped tick truncated the physics and a
        // refused one rolled it back, and only the first is state.
        let scenario = Scenario::articulated_duel();
        let base = World::new(&scenario, 1);
        assert_eq!(base.contact_solver_rejections(), 0);
        let mut refused = base.clone();
        refused.contact.as_mut().expect("articulated contact state").rejections = 3;
        assert_eq!(refused.contact_solver_rejections(), 3);
        assert_eq!(refused.state_hash(), base.state_hash());
        assert_eq!(refused.state_digest().value, base.state_digest().value,
                   "a diagnostic counter reached the ArticulatedV1 digest");

        // A Legacy world has no contact runtime to count with and must answer
        // zero rather than reaching into an `Option` that is not there.
        let legacy = World::new(&Scenario::articulated_duel(), 1);
        assert_eq!(legacy.contact_solver_rejections(), 0);
    }

    #[test]
    fn every_mutable_anatomy_field_changes_only_articulated_hashing() {
        let scenario = Scenario::articulated_duel();
        let base = World::new(&scenario, 1);
        let mutate: [(&str, fn(&mut World)); 6] = [
            ("integrity", |w| w.wounds[0].parts[BodyPart::Torso as usize].integrity -= Fx::from_raw(1)),
            ("wound", |w| w.wounds[0].parts[BodyPart::Legs as usize].wound += Fx::from_raw(1)),
            ("severed", |w| w.wounds[0].parts[BodyPart::LeftArm as usize].severed = true),
            ("blood", |w| w.wounds[0].blood -= Fx::from_raw(1)),
            ("shock", |w| w.wounds[0].shock += Fx::from_raw(1)),
            ("last_attacker", |w| w.wounds[0].last_attacker = EntityId::new(1, 0)),
        ];
        for (name, change) in mutate {
            let mut moved = base.clone();
            change(&mut moved);
            assert_eq!(moved.state_hash(), base.state_hash(), "{name} leaked into LegacyV1");
            assert_ne!(moved.state_digest().value, base.state_digest().value,
                       "{name} is not in the ArticulatedV1 digest");
            assert_eq!(moved.state_digest().domain, crate::HashDomain::ArticulatedV1);
        }
        // Every part is hashed, not just the ones a fixture happens to wound.
        for part in 0..BodyPart::COUNT {
            let mut moved = base.clone();
            moved.wounds[1].parts[part].wound += Fx::from_raw(1);
            assert_ne!(moved.state_digest().value, base.state_digest().value,
                       "part {part} is missing from the anatomy row");
        }
        // And a dead slot keeps hashing its final row, because a later bleed
        // credit reads `last_attacker` off it.
        let mut dead = base.clone();
        dead.alive[1] = false;
        let before = dead.state_digest().value;
        dead.wounds[1].last_attacker = EntityId::new(0, 0);
        assert_ne!(dead.state_digest().value, before, "a dead slot stopped hashing its anatomy");
    }

    #[test]
    fn every_articulated_command_field_changes_only_the_articulated_hash_domain() {
        let digest = |command: ArticulatedCommandV1| {
            let scenario = Scenario::articulated_duel();
            let mut world = World::new(&scenario, 1);
            assert!(matches!(
                world.submit_articulated_v1(EntityId::new(0, 0), command),
                SubmitArticulatedOutcome::Stored { rejection: None, .. }
            ));
            (world.state_hash(), world.state_digest().value)
        };
        let base = articulated_command();
        let (legacy_core, base_digest) = digest(base);
        let mut variants = Vec::new();
        let mut changed = base; changed.move_dir.x = Fx::from_raw(1); variants.push(changed);
        let mut changed = base; changed.move_dir.y = Fx::from_raw(1); variants.push(changed);
        let mut changed = base; changed.body_yaw = Angle::HALF; variants.push(changed);
        let mut changed = base; changed.intent = Intent::Attack(EntityId::new(1, 0)); variants.push(changed);
        let mut changed = base; changed.arms[0].bearing = Angle::HALF; variants.push(changed);
        let mut changed = base; changed.arms[0].height = crate::CombatHeight::LOW; variants.push(changed);
        let mut changed = base; changed.arms[0].reach = Fx::HALF; variants.push(changed);
        let mut changed = base; changed.arms[0].effort = Fx::ONE; variants.push(changed);
        let mut changed = base; changed.arms[1].bearing = Angle::HALF; variants.push(changed);
        let mut changed = base; changed.arms[1].height = crate::CombatHeight::HIGH; variants.push(changed);
        let mut changed = base; changed.arms[1].reach = Fx::HALF; variants.push(changed);
        let mut changed = base; changed.arms[1].effort = Fx::ONE; variants.push(changed);
        let mut changed = base; changed.grips[0] = GripRequest::EquipSlot(1); variants.push(changed);
        let mut changed = base; changed.grips[1] = GripRequest::Release; variants.push(changed);
        for changed in variants {
            let (changed_core, changed_digest) = digest(changed);
            assert_eq!(changed_core, legacy_core, "new command payload leaked into legacy core");
            assert_ne!(changed_digest, base_digest, "an articulated command field was omitted");
        }

        let mut attack = base;
        attack.intent = Intent::Attack(EntityId::new(7, 11));
        let (attack_core, attack_digest) = digest(attack);
        assert_eq!(attack_core, legacy_core);
        assert_ne!(attack_digest, base_digest, "intent tag was omitted");
        let mut changed = attack;
        changed.intent = Intent::Attack(EntityId::new(8, 11));
        let (core, value) = digest(changed);
        assert_eq!(core, legacy_core);
        assert_ne!(value, attack_digest, "intent target index was omitted");
        let mut changed = attack;
        changed.intent = Intent::Attack(EntityId::new(7, 12));
        let (core, value) = digest(changed);
        assert_eq!(core, legacy_core);
        assert_ne!(value, attack_digest, "intent target generation was omitted");

        let mut left_slot_one = base;
        left_slot_one.grips[0] = GripRequest::EquipSlot(1);
        let (_, left_one_digest) = digest(left_slot_one);
        assert_ne!(left_one_digest, base_digest, "left grip tag was omitted");

        let mut right_slot_zero = base;
        right_slot_zero.grips[1] = GripRequest::EquipSlot(0);
        let (_, right_zero_digest) = digest(right_slot_zero);
        assert_ne!(right_zero_digest, base_digest, "right grip tag was omitted");
    }

    /// The embodied tail is embodied-only, measured rather than argued.
    ///
    /// Every column behind the model guard is perturbed by one raw unit on an
    /// embodied world; `EmbodiedV1` must move and `LegacyV1` must not. Two of the
    /// three are not even *allocated* on an articulated world, which is a
    /// stronger statement than a digest that happened not to move, so for those
    /// the measurement is the empty column; `ground_z` is allocated for every
    /// model and is therefore the one that has to be perturbed over there and
    /// watched not to land.
    ///
    /// **Both halves of the elbow plane are driven separately.** A digest that
    /// wrote `commanded` twice, or `held` twice, would pass a check that only
    /// moved the pair together.
    #[test]
    fn an_embodied_only_column_cannot_move_an_articulated_digest() {
        let embodied = World::new(&Scenario::embodied_duel(), 7);
        let mut articulated = World::new(&Scenario::articulated_duel(), 7);
        assert!(articulated.stance.is_empty() && articulated.elbow_plane.is_empty(),
                "an articulated world allocated an embodied-only column");
        assert!(!embodied.elbow_plane.is_empty(), "the embodied world has no elbow-plane column");

        let before = articulated.state_digest().value;
        articulated.ground_z[0] = Fx::from_raw(1);
        assert_eq!(articulated.state_digest().value, before, "the floor reached ArticulatedV1");

        let mutations: [fn(&mut World); 6] = [
            |w| w.ground_z[0] = Fx::from_raw(1),
            |w| w.stance[0].pelvis = Fx::from_raw(1),
            |w| w.elbow_plane[0][0].commanded = Angle::from_raw(1),
            |w| w.elbow_plane[0][1].commanded = Angle::from_raw(1),
            |w| w.elbow_plane[0][0].held = Angle::from_raw(1),
            |w| w.elbow_plane[0][1].held = Angle::from_raw(1),
        ];
        for (at, mutate) in mutations.into_iter().enumerate() {
            let mut changed = embodied.clone();
            let (legacy, digest) = (changed.state_hash(), changed.state_digest().value);
            mutate(&mut changed);
            assert_ne!(changed.state_digest().value, digest,
                       "embodied column {at} was omitted from EmbodiedV1");
            assert_eq!(changed.state_hash(), legacy,
                       "embodied column {at} leaked into LegacyV1");
        }
    }

    #[test]
    fn each_equip_slot_payload_byte_reaches_the_articulated_hash_independently() {
        let scenario = Scenario::articulated_duel();
        let mut world = World::new(&scenario, 1);
        let legacy_core = world.state_hash();
        let mut command = articulated_command();

        command.grips[0] = GripRequest::EquipSlot(0);
        world.articulated_command[0] = Some(command);
        let left_zero = world.state_digest().value;
        command.grips[0] = GripRequest::EquipSlot(1);
        world.articulated_command[0] = Some(command);
        let left_one = world.state_digest().value;
        assert_ne!(left_zero, left_one, "left EquipSlot payload was omitted");

        command = articulated_command();
        command.grips[1] = GripRequest::EquipSlot(0);
        world.articulated_command[0] = Some(command);
        let right_zero = world.state_digest().value;
        command.grips[1] = GripRequest::EquipSlot(1);
        world.articulated_command[0] = Some(command);
        let right_one = world.state_digest().value;
        assert_ne!(right_zero, right_one, "right EquipSlot payload was omitted");
        assert_ne!(left_zero, right_zero, "left and right grip columns collided");
        assert_eq!(world.state_hash(), legacy_core);
    }

    #[test]
    fn immutable_spec_binding_and_resolved_columns_reach_only_the_articulated_digest() {
        let base_scenario = Scenario::articulated_duel();
        let base = World::new(&base_scenario, 1);
        let legacy_core = base.state_hash();
        let digest = base.state_digest().value;

        let mut changed = base_scenario.clone();
        // This probe is about immutable spec bytes, not construction refusal.
        // A one-raw mass perturbation makes the exact ownership totals coprime
        // enough to leave the deliberate 96-bit lattice envelope.
        changed.combat_specs.as_mut().unwrap().equipment[0].balance += Fx::from_raw(1);
        let changed_world = World::new(&changed, 1);
        assert_eq!(changed_world.state_hash(), legacy_core);
        assert_ne!(changed_world.state_digest().value, digest);

        let mut changed = base_scenario.clone();
        changed.units[0].articulated.as_mut().unwrap().anatomy = 2;
        let changed_world = World::new(&changed, 1);
        assert_eq!(changed_world.state_hash(), legacy_core);
        assert_ne!(changed_world.state_digest().value, digest);

        let mut changed_world = base.clone();
        changed_world.articulated_carried[0].swap(0, 1);
        assert_eq!(changed_world.state_hash(), legacy_core);
        assert_ne!(changed_world.state_digest().value, digest, "carrying-slot order was omitted");
        let mut changed_world = base.clone();
        changed_world.articulated_equipment[0].swap(0, 1);
        assert_eq!(changed_world.state_hash(), legacy_core);
        assert_ne!(changed_world.state_digest().value, digest, "resolved arm order was omitted");
    }

    #[test]
    fn swapped_carrying_slots_cannot_collide_when_the_actions_and_resolved_arms_match() {
        let mut scenario = Scenario::articulated_duel();
        scenario.combat_specs.as_mut().unwrap().equipment[1].action = ActionKind::Sword;
        scenario.units[0].loadout = Loadout::pair(ActionKind::Sword, ActionKind::Sword);
        let mut first = World::new(&scenario, 1);
        let mut second = first.clone();
        let common = UnitSpec {
            kind: Body::Fighter,
            faction: Faction::Heroes,
            stats: Body::Fighter.base_stats(),
            loadout: Loadout::pair(ActionKind::Sword, ActionKind::Sword),
            articulated: Some(ArticulatedUnitSpecV1 { anatomy: 1, equipment: [Some(1), Some(2)] }),
            spawn: Vec2::from_ints(12, 8),
        };
        first.spawn(&common);
        let mut swapped = common;
        swapped.articulated.as_mut().unwrap().equipment.swap(0, 1);
        second.spawn(&swapped);
        assert_eq!(first.state_hash(), second.state_hash());
        assert_eq!(first.articulated_equipment[2], second.articulated_equipment[2]);
        assert_ne!(first.state_digest().value, second.state_digest().value);
    }

    #[test]
    fn a_door_half_pushed_open_is_in_the_hash() {
        // `open` is a tile value and therefore already in the dungeon's digest.
        // `pressed` is not, and a door one tick from opening is not the same
        // world as an untouched one: step both on and they diverge.
        let mut a = door_world(Body::Fighter);
        let mut b = door_world(Body::Fighter);
        let i = a.alive_ids(Faction::Heroes)[0].index as usize;
        for w in [&mut a, &mut b] {
            w.pos[i] = against_the_jamb(w, i);
            crate::world::testkit::lean(w, i, EAST);
        }
        assert_eq!(
            a.state_hash(),
            b.state_hash(),
            "two identical worlds must fingerprint alike before anything happens"
        );

        a.press_doors();
        assert_eq!(a.doors[0].pressed, 1);
        assert_eq!(b.doors[0].pressed, 0);
        assert_eq!(
            a.dungeon.fingerprint(),
            b.dungeon.fingerprint(),
            "nothing has opened yet, so the grids are still the same grid"
        );
        assert_ne!(
            a.state_hash(),
            b.state_hash(),
            "a door under pressure fingerprints like an untouched one"
        );
    }

    #[test]
    fn two_worlds_differing_only_in_stats_do_not_fingerprint_alike() {
        let base = duel_world();
        let hero = base.alive_ids(Faction::Heroes)[0];

        // A single point of power moves nothing else at all -- not the bar, not
        // the body, not a position -- so this is the narrowest the claim gets.
        let mut sharper = base.clone();
        let mut stats = sharper.stats(hero).unwrap();
        stats.power += 1;
        assert!(sharper.set_stats(hero, stats));
        assert_ne!(
            base.state_hash(),
            sharper.state_hash(),
            "a fighter given a point of power fingerprints as the fighter it was"
        );

        // **The body half of this claim is gone with `World::set_body`.** It
        // promoted the fighter to a Rogue and asserted that the new frame moved
        // the fingerprint and moved it somewhere other than a point of power
        // would. A jointed body's frame is construction now -- the anatomy row is
        // in the spec table and hashed there -- so there is no mutator left to
        // make the comparison with. The stat half below is the whole of it.

        // The other half of the claim: a rewrite that changes nothing must move
        // no fingerprint either, or every one of these is merely noise.
        let mut same = base.clone();
        assert!(same.set_stats(hero, base.stats(hero).unwrap()));
        assert_eq!(base.state_hash(), same.state_hash());
    }
}
