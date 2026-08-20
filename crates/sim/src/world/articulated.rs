//! The articulated body: yaw, grips, arms, shield and anatomy.
//!
//! The phases here are the ones that decide *where the body is* before contact
//! reads it. The order they run in is fixed by
//! [the actuator contract](../../../../docs/reference/articulated-actuators.md)
//! and proved by the `#[cfg(test)]` phase trace rather than argued from the
//! reading order of `step_with_arm_rates`.

use super::*;
#[cfg(all(test, feature = "cartesian-recoil"))]
use super::contact_phase::scale_contact_vector;

impl World {
    /// The embodied body's yaw phase: hips first, then the torso the hips will
    /// allow, then the pelvis both of them decide.
    ///
    /// It stands where `body yaw` stands for an articulated body and does both
    /// jobs, because the two constrain each other inside one tick: the torso's
    /// reachable target depends on where the hips ended up, and whether a step
    /// is forced depends on what the torso was asking for. Splitting them into
    /// two phases would put an ordering between them that neither wants.
    ///
    /// The four rules, in the order they are applied:
    ///
    /// 1. **Hips chase, and what they chase depends on whether the body is
    ///    moving.** A translating body turns its hips toward `move_dir`; a
    ///    stationary one turns them toward the torso, more slowly. That
    ///    asymmetry is the mechanic -- a body already committing its feet
    ///    reorients for free, and a planted one pays.
    /// 2. **The torso's target is clamped into the twist budget**, around the
    ///    hips as they now are. Clamping the *target* rather than the step is
    ///    what stops the torso saturating and sitting at the limit with a
    ///    permanent error: the integrator converges on a reachable angle and
    ///    stops, exactly as it does when the request was inside the budget all
    ///    along.
    /// 3. **A request the budget refused arms a step.** During one the hips turn
    ///    at the full rate and `move_authority` is reduced, so the cost of
    ///    bringing a weapon round is paid in ground rather than in time only.
    /// 4. **The pelvis is derived, never commanded**: the standing height less a
    ///    speed term less a twist term, each clamped, evaluated left to right.
    ///    The grouping is written out because `Fx` truncates and a reordering is
    ///    a different number.
    pub(super) fn drive_stance(&mut self) {
        for i in 0..self.alive.len() {
            if !self.alive[i] { continue; }
            let command = self.command_core[i];
            let requested_yaw = command.map_or(self.body_yaw[i].angle, |c| c.body_yaw);
            // World frame, because the hips point somewhere on the floor plan
            // and `move_dir` arrives measured from the torso.
            let move_dir = self.world_move_dir(i, command.map_or(Vec2::ZERO, |c| c.move_dir))
                .clamp_length(Fx::ONE);

            let stepping = self.stance[i].step_left > 0;
            let translating = !move_dir.is_zero();
            // 1. Where the feet want to point, and how fast they may.
            let hip_target = if translating { move_dir.angle() } else { self.body_yaw[i].angle };
            let hip_speed = if translating || stepping {
                actuator::STANCE_HIP_MOVING_SPEED_RAW
            } else {
                actuator::STANCE_HIP_STANDING_SPEED_RAW
            };
            let mut hips = BodyYawState {
                angle: self.stance[i].hip_yaw,
                speed_turns: self.stance[i].hip_yaw_speed_turns,
                authority_residue: self.stance[i].hip_authority_residue,
            };
            actuator::integrate_yaw_with_rates(
                &mut hips, hip_target, self.turn_authority[i],
                hip_speed, actuator::STANCE_HIP_ACCEL_RAW,
            );
            self.stance[i].hip_yaw = hips.angle;
            self.stance[i].hip_yaw_speed_turns = hips.speed_turns;
            self.stance[i].hip_authority_residue = hips.authority_residue;

            // 2. The torso, inside the budget the hips leave it.
            let want = requested_yaw.delta(hips.angle);
            let limit = actuator::STANCE_TWIST_LIMIT_RAW;
            let held = want.clamp(-limit, limit);
            let reachable = Angle::from_raw(hips.angle.raw().wrapping_add(held as u16));
            actuator::integrate_yaw(&mut self.body_yaw[i], reachable, self.turn_authority[i]);

            // 3. A refused request arms a step; an armed one runs down.
            if want != held {
                self.stance[i].step_left = actuator::STANCE_STEP_TICKS;
            } else if self.stance[i].step_left > 0 {
                self.stance[i].step_left -= 1;
            }

            // 4. The pelvis, from the speed and the twist the tick ended with.
            let speed = self.vel[i].length().clamp(Fx::ZERO, Fx::ONE);
            let twist = self.stance[i].twist(self.body_yaw[i].angle).abs();
            let twist_fraction = Fx::from_ratio(twist, limit).clamp(Fx::ZERO, Fx::ONE);
            let base = Fx::from_raw(actuator::PELVIS_HEIGHT_RAW);
            let speed_drop = Fx::from_raw(actuator::PELVIS_SPEED_DROP_RAW) * speed;
            let twist_drop = Fx::from_raw(actuator::PELVIS_TWIST_DROP_RAW) * twist_fraction;
            self.stance[i].pelvis = ((base - speed_drop) - twist_drop).clamp(Fx::ZERO, Fx::ONE);
        }
    }

    /// The anatomy as the stance leaves it: the same body with its shoulders and
    /// its standing height lowered by however far the pelvis has sunk.
    ///
    /// **Threading the drop into the *spec* rather than into four signatures is
    /// what keeps `limb.rs` unchanged.** `shoulder`, `hand_position`,
    /// `inverse_hand` and `arm_polyline` all read those two numbers already, so
    /// a lowered copy moves the shoulder, the hand and the arm's collision
    /// volume together and cannot move one without the others. A model with no
    /// stance gets its own anatomy back, byte for byte.
    ///
    /// **The region volumes are deliberately not lowered**, and the limit is
    /// worth stating: this is a pelvis that shifts weight, not one that changes
    /// what a blow can reach. A crouch that also shrank the torso capsule would
    /// change which region a sweep selects, which is a much heavier mechanic
    /// than the one the twist budget is asking for, and it is not what these
    /// constants were bounded against.
    /// Slot `i`'s anatomy as its stance leaves it.
    ///
    /// **The one door.** Every consumer that computes a shoulder -- the arm
    /// integrator, the contact phase's arm capsule and the observation's
    /// opponent regions -- reads this rather than the table, so a lowered pelvis
    /// cannot move one of the three and leave the other two where they were.
    /// That is the same failure `limb::arm_polyline` was created to close, one
    /// layer up.
    pub(super) fn posed_anatomy(&self, i: usize) -> BodyAnatomySpec {
        let table = self.combat_specs.as_ref().expect("articulated combat specs");
        let anatomy = table
            .anatomy(self.body_anatomy[i].expect("articulated anatomy"))
            .expect("validated articulated anatomy");
        self.stance_anatomy(i, anatomy)
    }

    /// Where this slot's two elbows are, in the **body frame**, or `None` each.
    ///
    /// **Derived on demand and never stored, which is the same decision the
    /// shield pose made and the opposite of the one the swing plane made.** An
    /// elbow is a function of three columns the world already holds -- the
    /// anatomy, the hand, and the held plane -- so a stored copy would be a
    /// fourth thing that can disagree with them, and it would have to be written
    /// by every phase that moves a hand: the actuator, the contact commit, the
    /// entry clamp and the severance path. The plane is *state* because nothing
    /// else in the world implies it; the elbow is not.
    ///
    /// The frame is the body's, matching [`ArmState::hand`], because the one
    /// consumer that needs world space is the published pose and
    /// `body_region_volumes` adds the origin itself. Handing back world
    /// coordinates here would put the single conversion `combat::geometry` is
    /// arranged around in two places.
    ///
    /// Guarded on the anatomy rather than on `alive`, because
    /// `retain_contact_entry` walks dead rows on purpose -- keeping the row index
    /// equal to the slot index is what removes the need for a second mapping --
    /// and [`World::posed_anatomy`] panics on a slot that has none.
    pub(super) fn arm_elbows(&self, i: usize) -> [Option<Vec3>; 2] {
        if self.anatomy_spec(i).is_none() { return [None; 2]; }
        // The *posed* anatomy, so a crouched body's elbow is solved against the
        // shoulder the collider builder and the sweep will use. Reading the
        // immutable row would put the joint a pelvis-drop above the arm it
        // belongs to, on exactly the model that has a pelvis to drop.
        let anatomy = self.posed_anatomy(i);
        let links = crate::combat::limb::Elbow::of(&anatomy);
        let yaw = self.body_yaw[i].angle;
        core::array::from_fn(|limb| crate::combat::limb::elbow_point(
            crate::combat::limb::shoulder(&anatomy, yaw, limb),
            self.arms[i][limb].hand,
            links,
            self.elbow_plane[i][limb].held,
        ))
    }

    fn stance_anatomy(&self, i: usize, anatomy: &BodyAnatomySpec) -> BodyAnatomySpec {
        let standing = Fx::from_raw(actuator::PELVIS_HEIGHT_RAW);
        let drop = ((standing - self.stance[i].pelvis).max(Fx::ZERO)) * anatomy.standing_height;
        let mut lowered = anatomy.clone();
        lowered.shoulder_height = anatomy.shoulder_height - drop;
        lowered.standing_height = anatomy.standing_height - drop;
        lowered
    }


    pub(super) fn initialize_pose(&mut self, i: usize) {
        let table = self.combat_specs.as_ref().expect("articulated combat specs");
        let anatomy = table.anatomy(self.body_anatomy[i].expect("articulated anatomy"))
            .expect("validated articulated anatomy");
        let yaw = self.facing[i];
        self.body_yaw[i] = BodyYawState { angle: yaw, speed_turns: Fx::ZERO, authority_residue: Fx::ZERO };
        // Feet under the torso, square: a body starts settled, so the twist
        // begins at zero and the first step it takes is one it chose.
        self.stance[i] = StanceState::squared(yaw);
        // Both halves, because a reused slot must not inherit the last
        // occupant's elbow: a fresh body is one nobody has commanded, and the
        // neutral plane is the one the elbow hung in before the field existed.
        self.elbow_plane[i] = [ElbowPlaneState::NEUTRAL; 2];
        let mut arms = [actuator::tucked_arm(Vec3::ZERO); 2];
        let mut grips = [GripState { equipment_slot: None }; 2];
        for limb in 0..2 {
            let hand = actuator::hand_position(
                anatomy, yaw, limb, Angle::ZERO, crate::CombatHeight::MID,
                Fx::from_raw(actuator::ARM_MIN_REACH_RAW),
            );
            arms[limb] = actuator::tucked_arm(hand);
            grips[limb].equipment_slot = self.body_equipment[i][limb].and_then(|id| {
                self.body_carried[i].iter().position(|item| *item == Some(id)).map(|slot| slot as u8)
            });
        }
        self.arms[i] = arms;
        self.grips[i] = grips;
        self.articulated_release_was[i] = [ReleaseRequest::Keep; 2];
        self.move_authority[i] = Fx::ONE;
        self.turn_authority[i] = Fx::ONE;
        self.arm_authority[i] = [Fx::ONE; 2];
        self.wounds[i] = AnatomyState::new(anatomy);
        self.shield_pose[i] = self.derive_shield_pose(i);
    }

    /// The once-per-tick half of anatomy: bleed, shed shock, and republish the
    /// impairment factors the next tick's actuator reads.
    ///
    /// It runs after every contact group rather than between them, and that is
    /// the contract rather than convenience: bleeding between two simultaneous
    /// facts would make the second read a body the first had already drained,
    /// which is exactly the asymmetry the group snapshot exists to prevent.
    pub(super) fn settle_anatomy(&mut self) {
        for i in 0..self.alive.len() {
            if !self.alive[i] { continue; }
            let Some(spec) = self.anatomy_spec(i).cloned() else { continue };
            let before = self.wounds[i].health(&spec);
            anatomy::bleed_and_decay(&mut self.wounds[i], &spec);
            // Credited against what the query lost, not against the blood: a
            // body whose regional fraction is already the smaller of the two
            // terms bleeds without its health moving, and crediting the blood
            // there would pay an attacker for damage nobody took.
            let lost = (before - self.wounds[i].health(&spec)).max(Fx::ZERO);
            let source = self.resolve(self.wounds[i].last_attacker);
            if let (true, Some(source)) = (lost.is_positive(), source) {
                self.damage_dealt[source] += lost;
            }
            let state = self.wounds[i];
            self.arm_authority[i] = [
                anatomy::authority(&state, &spec, BodyPart::LeftArm),
                anatomy::authority(&state, &spec, BodyPart::RightArm),
            ];
            // One factor, written twice. Translation and turning share the legs
            // and share the shock, and the contract deliberately does not give
            // them separate pools in this slice.
            let legs = anatomy::authority(&state, &spec, BodyPart::Legs);
            self.move_authority[i] = legs;
            self.turn_authority[i] = legs;
        }
    }

    /// The articulated reaper. Same removal as the legacy one -- and it has to
    /// be, because `outcome` counts the living and nothing else -- but the
    /// predicate is the anatomy query and the killer comes off the anatomy's own
    /// `last_attacker` rather than the legacy column.
    ///
    /// Positioned after every contact group and after the anatomy phase, so two
    /// fighters whose fatal blows land on one mapped time both die.
    pub(super) fn reap_dead_bodies(&mut self) {
        for i in 0..self.alive.len() {
            if !self.alive[i] { continue; }
            if !self.wounds.get(i).is_some_and(|state| state.is_dead()) { continue; }
            let entity = self.id_of(i);
            let killer = self.wounds[i].last_attacker;
            self.alive[i] = false;
            #[cfg(feature = "cartesian-recoil")]
            {
                self.exact_owners[i] = None;
            }
            self.generation[i] = self.generation[i].wrapping_add(1);
            self.free.push(i as u32);
            self.events.push(Event::Death { entity, killer });
        }
    }

    pub(super) fn derive_shield_pose(&self, i: usize) -> Option<ShieldPose> {
        let table = self.combat_specs.as_ref()?;
        for limb in 0..2 {
            let Some(slot) = self.grips[i][limb].equipment_slot else { continue };
            let Some(id) = self.body_carried[i].get(slot as usize).copied().flatten() else { continue };
            let Some(item) = table.equipment(id) else { continue };
            if let crate::EquipmentGeometry::Shield { half_width, half_height, thickness } = item.geometry {
                // **Centre and normal are two readings of one arm.** The bearing
                // here is the same one `actuator::hand_position` used to place
                // the hand this pose is centred on, so `normal` and
                // `hand - shoulder` are parallel by construction and a plate can
                // no longer face somewhere its position does not imply.
                //
                // It read `body_yaw` until 2026-08-16, and the disagreement that
                // produced was measured rather than assumed: over the composed
                // corpus's 2.86M shield samples the angle between the normal and
                // the hand's offset from the body origin ran the whole 0..180
                // degree range, median 32 degrees, with 1.84% of ticks edge-on.
                // `crates/policy/src/articulated_script.rs` answered that by
                // welding the commanded guard bearing to body yaw, which made
                // the two agree by never letting the arm move; this makes them
                // agree by construction instead, which is what lets the guard
                // arm have its bearing back.
                //
                // Inert wherever `bearing == body_yaw`, which is every pose the
                // old rule already agreed with -- including both bodies at
                // spawn, where `initialize_pose` tucks each arm at
                // `Angle::ZERO`.
                let bearing = self.arms[i][limb].bearing;
                return Some(ShieldPose {
                    centre: self.arms[i][limb].hand,
                    normal: Vec3::new(bearing.cos(), bearing.sin(), Fx::ZERO),
                    half_width, half_height, thickness,
                });
            }
        }
        None
    }

    /// The response state of a newly allocated identity. The owner rule is the
    /// same one geometry uses: a two-handed item has one physical row, owned by
    /// the right limb, rather than two copies of one mass and remainder.
    #[cfg(feature = "cartesian-recoil")]
    pub(super) fn initial_exact_owner(&self, i: usize, common_scale: i128) -> ExactOwnerTrajectory {
        let grips = self.grips[i].map(|grip| grip.equipment_slot);
        self.exact_owner_for_grips(i, grips, common_scale)
    }

    #[cfg(feature = "cartesian-recoil")]
    pub(super) fn exact_owner_for_grips(
        &self, i: usize, grips: [Option<u8>; 2], common_scale: i128,
    ) -> ExactOwnerTrajectory {
        let zero_affine = |mass_raw| ExactAffine3 {
            mass_raw,
            at_group: [ExactPosition::default(); 3],
            momentum: [ExactMomentum::default(); 3],
            group_time_raw: 0,
        };
        let mut common_mass_raw = self.mass[i].raw();
        let mut held_response = [None; 2];
        for limb in 0..2 {
            let Some(slot) = grips[limb] else { continue };
            let Some(id) = self.body_carried[i].get(slot as usize).copied().flatten()
                else { continue };
            let Some(item) = self.combat_specs.as_ref().and_then(|table| table.equipment(id)).copied()
                else { continue };
            if item.binding == crate::GripBinding::Both && limb == LimbSlot::LeftArm as usize {
                continue;
            }
            common_mass_raw = common_mass_raw.checked_add(item.mass.raw())
                .expect("validated body plus held masses fit one exact word");
            held_response[limb] = Some(ExactHeldResponse {
                slot: limb as u8,
                spec_id: item.id,
                affine: zero_affine(item.mass.raw()),
            });
        }
        ExactOwnerTrajectory {
            entity: self.id_of(i), projectile: false,
            body_mass_raw: self.mass[i].raw(),
            common_scale,
            common_response: zero_affine(common_mass_raw),
            held_response,
        }
    }

    /// Prepare a complete grip-identity replacement without touching either
    /// column. Once contact has put a real response in this row, only the
    /// energy-accounting lifecycle checkpoint may clear it.
    #[cfg(feature = "cartesian-recoil")]
    pub(super) fn prepare_zero_response_grip_transition(
        &self, i: usize, grips: [Option<u8>; 2],
    ) -> Result<ExactOwnerTrajectory, ExactTrajectoryReject> {
        let current = self.exact_owners.get(i).copied().flatten()
            .ok_or(ExactTrajectoryReject::InactiveState)?;
        if current.entity != self.id_of(i) {
            return Err(ExactTrajectoryReject::WrongIdentity);
        }
        let current_grips = self.grips[i].map(|grip| grip.equipment_slot);
        let expected = self.exact_owner_for_grips(i, current_grips, current.common_scale);
        if current.common_scale != expected.common_scale
            || current.body_mass_raw != expected.body_mass_raw
            || current.common_response.mass_raw != expected.common_response.mass_raw
            || current.held_response.iter().zip(expected.held_response).any(|(got, want)|
                got.map(|row| (row.slot, row.spec_id, row.affine.mass_raw))
                    != want.map(|row| (row.slot, row.spec_id, row.affine.mass_raw))) {
            return Err(ExactTrajectoryReject::SpecIdentity);
        }
        let next = self.exact_owner_for_grips(i, grips, current.common_scale);
        Self::preserve_exact_common_transition(current, next)
    }

    #[cfg(feature = "cartesian-recoil")]
    fn preserve_exact_common_transition(
        current: ExactOwnerTrajectory, mut next: ExactOwnerTrajectory,
    ) -> Result<ExactOwnerTrajectory, ExactTrajectoryReject> {
        if (current.entity, current.body_mass_raw, current.common_scale)
            != (next.entity, next.body_mass_raw, next.common_scale)
            || current.common_scale <= 0
            || current.common_scale % next.common_response.mass_raw as i128 != 0 {
            return Err(ExactTrajectoryReject::Mass);
        }
        next.common_response.at_group = current.common_response.at_group;
        next.common_response.momentum = current.common_response.momentum;
        next.common_response.group_time_raw = current.common_response.group_time_raw;
        for limb in 0..2 {
            let Some(old) = current.held_response[limb] else { continue };
            let Some(new) = next.held_response[limb].as_mut() else { continue };
            if (old.spec_id, old.slot, old.affine.mass_raw)
                == (new.spec_id, new.slot, new.affine.mass_raw) {
                *new = old;
            } else {
                new.affine.group_time_raw = current.common_response.group_time_raw;
            }
        }
        for held in next.held_response.iter_mut().flatten() {
            held.affine.group_time_raw = current.common_response.group_time_raw;
        }
        Ok(next)
    }

    pub(super) fn resulting_grips(
        &self,
        i: usize,
        requests: [GripRequest; 2],
    ) -> Result<[Option<u8>; 2], CommandReject> {
        let limb = |arm| if arm == 0 { LimbSlot::LeftArm } else { LimbSlot::RightArm };
        let reject = |arm, slot| CommandReject::MissingEquipment { arm: limb(arm), slot };
        let mut result = [None; 2];
        for arm in 0..2 {
            result[arm] = match requests[arm] {
                GripRequest::Keep => self.grips[i][arm].equipment_slot,
                GripRequest::Release => None,
                GripRequest::EquipSlot(slot) => {
                    if self.body_carried[i].get(slot as usize).copied().flatten().is_none() {
                        return Err(reject(arm, slot));
                    }
                    Some(slot)
                }
            };
        }
        let table = self.combat_specs.as_ref().expect("articulated combat specs");
        canonical_grip_pair(table, self.body_carried[i], result)
            .map(|_| result).map_err(|(arm, slot)| reject(arm, slot))
    }

    pub(super) fn apply_grips(&mut self) {
        for i in 0..self.alive.len() {
            if !self.alive[i] { continue; }
            let requests = self.command_core[i]
                .map_or([GripRequest::Keep; 2], |command| command.grips);
            let mut pair = self.resulting_grips(i, requests)
                .expect("stored articulated grip transaction was validated");
            // An arm that is gone cannot take hold of anything, whatever the
            // stored command still asks for. Without this an `EquipSlot`
            // submitted before the severance re-acquires the weapon every tick
            // -- the contact phase drops it again at group end and no collider
            // is ever built from it, so nothing downstream sees the weapon, but
            // the grip and the shield pose are hashed state and would flip
            // twice a tick for the rest of the fight.
            for limb in 0..2 {
                let part = limb_body_part(limb as u8).expect("a limb slot");
                if self.wounds.get(i).is_some_and(|state| !state.present(part)) {
                    pair[limb] = None;
                }
            }
            #[cfg(feature = "cartesian-recoil")]
            let next_exact = if (0..2).any(|limb|
                self.grips[i][limb].equipment_slot != pair[limb]) {
                Some(self.prepare_zero_response_grip_transition(i, pair)
                    .expect("nonzero exact response reached the pre-contact grip phase"))
            } else {
                None
            };
            #[cfg(feature = "cartesian-recoil")]
            for limb in 0..2 {
                if self.grips[i][limb].equipment_slot != pair[limb] {
                    let reason = if pair[limb].is_some() {
                        RecoilExternalEnergy::REPLACEMENT
                    } else {
                        RecoilExternalEnergy::RELEASE
                    };
                    if let Some(item) = self.equipment_in_grip(i, limb) {
                        self.clear_recoil_with_energy(i, limb, reason, item);
                    } else {
                        actuator::clear_post_contact(&mut self.arms[i][limb]);
                    }
                }
            }
            self.grips[i] = pair.map(|equipment_slot| GripState { equipment_slot });
            #[cfg(feature = "cartesian-recoil")]
            if let Some(owner) = next_exact { self.exact_owners[i] = Some(owner); }
        }
    }

    pub(super) fn drive_arms(&mut self, bearing_max_speed_raw: i32, bearing_accel_raw: i32) {
        for i in 0..self.alive.len() {
            if !self.alive[i] { continue; }
            let command = self.command_core[i].unwrap_or_else(|| self.neutral_core(i));
            // **The elbow plane is chased, never snapped**, and the rate bound
            // is required rather than polish. Once the forearm is a swept
            // collider, a commanded plane that jumped half a turn in one tick
            // would sweep the forearm bodily across the body inside that tick
            // and hand the contact solver a closing energy no arm can produce --
            // an absurd blow out of a command that only changed a number. It
            // runs here, at the head of the arms phase, because the plane is
            // part of where the arm *is* and everything downstream of this phase
            // reads the pose.
            for slot in 0..2 {
                self.elbow_plane[i][slot] = self.elbow_plane[i][slot].chase();
            }
            // The one frame conversion in the arm driver. Everything below reads
            // `targets` and never `command.arms`, so an embodied bearing cannot
            // reach the actuator still measured from the torso.
            let targets = [
                self.world_arm_target(i, 0, command.arms[0]),
                self.world_arm_target(i, 1, command.arms[1]),
            ];
            // The stance-adjusted body, because the shoulder this integrates
            // from has to be the one every other consumer of the arm sees.
            let anatomy = self.posed_anatomy(i);
            let yaw = self.body_yaw[i].angle;
            let left_item = self.equipment_in_grip(i, 0);
            let right_item = self.equipment_in_grip(i, 1);
            let both = self.grips[i][0].equipment_slot.is_some()
                && self.grips[i][0].equipment_slot == self.grips[i][1].equipment_slot
                && right_item.is_some_and(|item| item.binding == crate::GripBinding::Both);
            #[cfg(feature = "cartesian-recoil")]
            let drive = |arm: &mut ArmState, limb: usize, target: ArmTarget,
                         item: Option<crate::EquipmentSpec>, authority: Fx| {
                actuator::integrate_arm_with_recoil(arm, &anatomy, yaw, limb, target, item,
                    self.stats[i], authority, bearing_max_speed_raw, bearing_accel_raw)
            };
            if both {
                self.arms[i][0].previous_hand = self.arms[i][0].hand;
                #[cfg(not(feature = "cartesian-recoil"))]
                let step = actuator::integrate_arm_for_grip(
                    &mut self.arms[i][1], &anatomy, yaw, 1, targets[1], right_item,
                    self.stats[i], self.arm_authority[i][1], bearing_max_speed_raw, bearing_accel_raw,
                    actuator::Grip::TwoHanded,
                );
                #[cfg(feature = "cartesian-recoil")]
                let step = actuator::integrate_arm_with_recoil_for_grip(
                    &mut self.arms[i][1], &anatomy, yaw, 1, targets[1], right_item,
                    self.stats[i], self.arm_authority[i][1], bearing_max_speed_raw, bearing_accel_raw,
                    actuator::Grip::TwoHanded,
                );
                // The off arm is billed the same work from the same right-arm
                // deltas, and both bills are halves: one item's work, split
                // across the two arms that share it, rather than charged whole
                // to each. Equal halves also keep the two accounts identical,
                // which `a_two_handed_target_mirrors_the_off_hand` asserts.
                actuator::bill_fatigue_for_grip(
                    &mut self.arms[i][0], actuator::equipment_inertia(right_item),
                    targets[1].effort, step, actuator::Grip::TwoHanded,
                );
                let right = self.arms[i][1];
                actuator::mirror_two_handed(&mut self.arms[i][0], right, &anatomy, yaw);
            } else {
                #[cfg(not(feature = "cartesian-recoil"))]
                {
                actuator::integrate_arm_with_rates(
                    &mut self.arms[i][0], &anatomy, yaw, 0, targets[0], left_item,
                    self.stats[i], self.arm_authority[i][0], bearing_max_speed_raw, bearing_accel_raw,
                );
                actuator::integrate_arm_with_rates(
                    &mut self.arms[i][1], &anatomy, yaw, 1, targets[1], right_item,
                    self.stats[i], self.arm_authority[i][1], bearing_max_speed_raw, bearing_accel_raw,
                );
                }
                #[cfg(feature = "cartesian-recoil")]
                {
                    drive(&mut self.arms[i][0], 0, targets[0], left_item,
                          self.arm_authority[i][0]);
                    drive(&mut self.arms[i][1], 1, targets[1], right_item,
                          self.arm_authority[i][1]);
                }
            }
        }
    }

    pub(super) fn derive_geometry(&mut self) {
        for i in 0..self.alive.len() {
            if self.alive[i] { self.shield_pose[i] = self.derive_shield_pose(i); }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world::testkit::*;
    use crate::{CommandV1, SubmitOutcome};

    /// Submit one command and insist the world stored it.
    ///
    /// **Every submission in this module goes through here, and the reason is
    /// the reseat's own hazard.** `submit` answers
    /// `NotStored(WrongModel)` rather than panicking when the world's grammar
    /// disagrees, so a fixture that dropped the outcome would go on stepping a
    /// world nobody had commanded, and every assertion below it would measure
    /// the neutral pose instead of the commanded one -- green, and about
    /// nothing. A `let _ =` here is that defect waiting to happen.
    ///
    /// The neutral swing plane is the plane the elbow hung in before the field
    /// existed, so a fixture with no opinion about the plane asks for exactly
    /// what it used to get.
    fn submit(world: &mut World, id: EntityId, command: CommandCoreV1) {
        assert!(matches!(world.submit(id, CommandV1::new(command)),
                         SubmitOutcome::Stored { rejection: None, .. }),
                "the fixture's command was refused rather than stored");
    }

    /// **Reseated onto the embodied fixture, and not one hand word moved.**
    ///
    /// That is a claim rather than luck, and the three added blocks below are
    /// what make it checkable. A spawned stance is `squared` at exactly
    /// `PELVIS_HEIGHT_RAW`, so `stance_anatomy`'s drop is zero and the shoulders
    /// every tuck is measured from are the anatomy row's own; a spawn pelvis
    /// anywhere else would lower all four hands at once. So the pelvis is
    /// asserted through `posed_anatomy` rather than only as a number, which is
    /// the form that ties it to the coordinates above it.
    #[test]
    fn an_embodied_spawn_initializes_yaw_arms_grips_shield_stance_and_elbows_exactly() {
        let scenario = Scenario::embodied_duel();
        let world = World::new(&scenario, 1);
        let fighter = world.pose_test_view(EntityId::new(0, 0)).unwrap();
        assert_eq!(fighter.body_yaw, BodyYawState {
            angle: Angle::ZERO,
            speed_turns: Fx::ZERO,
            authority_residue: Fx::ZERO,
        });
        assert_eq!(fighter.grips, [
            GripState { equipment_slot: Some(1) },
            GripState { equipment_slot: Some(0) },
        ]);
        for (limb, side) in [Fx::from_ratio(1, 4), Fx::from_ratio(-1, 4)].into_iter().enumerate() {
            let hand = Vec3::new(Fx::from_ratio(3, 16), side, Fx::from_ratio(9, 10));
            assert_eq!(fighter.arms[limb], actuator::tucked_arm(hand));
        }
        assert_eq!(fighter.move_authority, Fx::ONE);
        assert_eq!(fighter.turn_authority, Fx::ONE);
        assert_eq!(fighter.arm_authority, [Fx::ONE; 2]);
        let shield = fighter.shield_pose.expect("fighter starts with the left shield");
        assert_eq!(shield.centre, fighter.arms[0].hand);
        assert_eq!(shield.normal, Vec3::X);
        // The plate's extents are the equipment row's, copied and not derived,
        // which is why v2-20's shrink lands here as well as in the spec table's
        // own digest: `derive_shield_pose` reads `half_width` and `half_height`
        // straight off `spec::shield()` at spawn, before any tick.
        assert_eq!((shield.half_width, shield.half_height, shield.thickness),
            (Fx::from_ratio(1, 4), Fx::from_ratio(1, 4), Fx::from_ratio(1, 20)));

        let brute = world.pose_test_view(EntityId::new(1, 0)).unwrap();
        assert_eq!(brute.body_yaw.angle, Angle::HALF);
        assert_eq!(brute.grips, [
            GripState { equipment_slot: None },
            GripState { equipment_slot: Some(0) },
        ]);
        assert_eq!(brute.shield_pose, None);
        assert_eq!(brute.body_yaw, BodyYawState {
            angle: Angle::HALF,
            speed_turns: Fx::ZERO,
            authority_residue: Fx::ZERO,
        });
        for (limb, side) in [Fx::from_ratio(-3, 10), Fx::from_ratio(3, 10)].into_iter().enumerate() {
            let hand = Vec3::new(Fx::from_ratio(17, 80), side, Fx::ONE);
            assert_eq!(brute.arms[limb], actuator::tucked_arm(hand));
        }
        assert_eq!((brute.move_authority, brute.turn_authority, brute.arm_authority),
            (Fx::ONE, Fx::ONE, [Fx::ONE; 2]));

        // The three columns an embodied spawn adds. A row apiece, square under
        // its own facing at full height, both elbows in the neutral plane, and
        // both arms actually jointed -- `arm_elbows` answers `[None; 2]` on a
        // model without them, so `is_some` is the difference between a forearm
        // the contact phase sweeps and one that is not there.
        assert_eq!(world.stance.len(), world.alive.len());
        assert_eq!(world.elbow_plane.len(), world.alive.len());
        for (i, facing) in [Angle::ZERO, Angle::HALF].into_iter().enumerate() {
            assert_eq!(world.stance[i], StanceState::squared(facing));
            assert_eq!(&world.posed_anatomy(i), world.anatomy_spec(i).unwrap(),
                "a spawn pelvis off `PELVIS_HEIGHT_RAW` would move every hand above");
            assert_eq!(world.elbow_plane[i], [ElbowPlaneState::NEUTRAL; 2]);
            assert!(world.arm_elbows(i).iter().all(Option::is_some),
                "an embodied arm spawned without an elbow");
        }
    }

    #[test]
    fn set_stats_changes_next_tick_arm_caps_without_changing_construction() {
        let scenario = Scenario::embodied_duel();
        let fighter = EntityId::new(0, 0);
        let mut slow = World::new(&scenario, 1);
        let mut fast = slow.clone();
        let construction = (fast.body_anatomy[0], fast.body_carried[0],
            fast.body_equipment[0], fast.grips[0]);
        assert!(slow.set_stats(fighter, Stats::new(0, 0, 0, 0, 5)));
        assert!(fast.set_stats(fighter, Stats::new(20, 20, 0, 0, 5)));
        let mut command = slow.neutral_core(0);
        command.arms[1] = ArmTarget {
            bearing: Angle::QUARTER, height: crate::CombatHeight::HIGH,
            reach: Fx::ONE, effort: Fx::ONE,
        };
        for world in [&mut slow, &mut fast] {
            submit(world, fighter, command);
            world.step();
        }
        assert!(fast.arms[0][1].bearing_speed_turns > slow.arms[0][1].bearing_speed_turns);
        assert!(fast.arms[0][1].height_speed > slow.arms[0][1].height_speed);
        assert_eq!((fast.body_anatomy[0], fast.body_carried[0],
            fast.body_equipment[0], fast.grips[0]), construction);
    }

    #[test]
    fn a_stationary_body_turns_toward_its_requested_yaw() {
        let scenario = Scenario::embodied_duel();
        let mut world = World::new(&scenario, 1);
        let fighter = EntityId::new(0, 0);
        let at = world.view(fighter).unwrap().position;
        let mut command = command_core();
        command.body_yaw = Angle::QUARTER;
        submit(&mut world, fighter, command);
        world.step();
        let pose = world.pose_test_view(fighter).unwrap();
        assert_eq!(world.view(fighter).unwrap().position, at);
        assert_eq!(world.view(fighter).unwrap().facing, Angle::ZERO);
        assert_eq!((pose.body_yaw.angle.raw(), pose.body_yaw.speed_turns.raw()), (91, 91));
    }

    #[test]
    fn body_yaw_obeys_acceleration_speed_and_half_turn_tie() {
        let scenario = Scenario::embodied_duel();
        let mut world = World::new(&scenario, 1);
        let fighter = EntityId::new(0, 0);
        let mut command = command_core();
        command.body_yaw = Angle::HALF;
        submit(&mut world, fighter, command);
        let mut speeds = Vec::new();
        for _ in 0..6 {
            world.step();
            speeds.push(world.pose_test_view(fighter).unwrap().body_yaw.speed_turns.raw());
        }
        assert_eq!(speeds, [-91, -182, -273, -364, -455, -546]);
        assert_eq!(world.pose_test_view(fighter).unwrap().body_yaw.angle.raw(), 63_625);
    }

    #[test]
    fn body_yaw_snaps_without_overshoot_or_residual_speed() {
        let scenario = Scenario::embodied_duel();
        let mut world = World::new(&scenario, 1);
        let fighter = EntityId::new(0, 0);
        let mut command = command_core();
        command.body_yaw = Angle::from_raw(100);
        submit(&mut world, fighter, command);
        world.step();
        assert_eq!((world.body_yaw[0].angle.raw(), world.body_yaw[0].speed_turns.raw()), (91, 91));
        world.step();
        assert_eq!((world.body_yaw[0].angle.raw(), world.body_yaw[0].speed_turns.raw()), (100, 0));
        world.step();
        assert_eq!((world.body_yaw[0].angle.raw(), world.body_yaw[0].speed_turns.raw()), (100, 0));
    }

    /// **The embodied stance ties the feet to the turn, and the turn still does
    /// not spend the legs' effort.** That is a stronger claim than the one this
    /// test made under the articulated model, where nothing about moving could
    /// have reached the yaw at all; the hip assertion at the end is what keeps
    /// it from being an empty one, because without a divergence to survive the
    /// equality in the loop is satisfied by two identical worlds.
    ///
    /// The two worlds do diverge, and **not for the reason the constants
    /// advertise** -- this was measured rather than argued. Both have a forced
    /// step armed for the whole window, because a quarter turn is outside the
    /// twist budget and re-arms it every tick, so both sets of hips turn at the
    /// *moving* rate and the standing/moving asymmetry never gets to bite. What
    /// differs is what they chase. A standing body chases its own torso angle
    /// and lands on it exactly, which zeroes its hip speed every tick; a
    /// translating one chases `move_dir`, and "straight ahead" pushed through
    /// `world_move_dir`'s rotation and back out through `Vec2::angle` comes back
    /// a few raw units past the torso -- 94 against 91 on tick 2, 280 against
    /// 273 on tick 3 -- so those hips never arrive, never reset, and run one
    /// acceleration step ahead from there on.
    ///
    /// The torso is what survives it, and that is the test's subject. Its target
    /// is the hips plus the twist budget, and while the budget is saturated the
    /// torso is against its own speed ceiling in both worlds, so where the hips
    /// have got to cannot move it. Over the first 40 ticks of this fixture the
    /// two yaws agree on every one of them, and the hips part company on tick 3.
    #[test]
    fn translation_and_turning_do_not_share_effort() {
        let scenario = Scenario::embodied_duel();
        let mut stationary = World::new(&scenario, 1);
        let mut moving = stationary.clone();
        let fighter = EntityId::new(0, 0);
        let mut turn = command_core();
        turn.body_yaw = Angle::QUARTER;
        submit(&mut stationary, fighter, turn);
        // World `+x` under the articulated model and "straight ahead" under the
        // embodied one; the body spawns facing `Angle::ZERO`, so it is the same
        // request on the tick it is submitted and the fixture keeps its meaning.
        turn.move_dir = Vec2::X;
        submit(&mut moving, fighter, turn);
        for _ in 0..8 {
            stationary.step();
            moving.step();
            assert_eq!(stationary.body_yaw[0], moving.body_yaw[0]);
        }
        assert_eq!(stationary.vel[0], Vec2::ZERO);
        assert!(!moving.vel[0].is_zero());
        assert_ne!(stationary.stance[0].hip_yaw, moving.stance[0].hip_yaw,
                   "the legs never diverged, so the yaws agreed about nothing");
    }

    #[test]
    fn a_right_bound_shield_is_found_past_an_empty_or_nonshield_left_grip() {
        let mut scenario = Scenario::embodied_duel();
        let mut right_shield = crate::shield();
        right_shield.id = 4;
        right_shield.binding = crate::GripBinding::Right;
        scenario.combat_specs.as_mut().unwrap().equipment.push(right_shield);
        scenario.units[0].combat_spec.as_mut().unwrap().equipment = [Some(4), None];
        scenario.units[0].loadout = Loadout::single(ActionKind::Shield);
        let world = World::new(&scenario, 1);
        let fighter = world.pose_test_view(EntityId::new(0, 0)).unwrap();
        assert_eq!(fighter.grips, [
            GripState { equipment_slot: None },
            GripState { equipment_slot: Some(0) },
        ]);
        let shield = fighter.shield_pose.expect("right hand shield was skipped");
        assert_eq!(shield.centre, fighter.arms[1].hand);
        assert_eq!(shield.normal, Vec3::X);

        let mut left_sword = crate::sword();
        left_sword.id = 5;
        left_sword.binding = crate::GripBinding::Left;
        scenario.combat_specs.as_mut().unwrap().equipment.push(left_sword);
        scenario.units[0].combat_spec.as_mut().unwrap().equipment = [Some(5), Some(4)];
        scenario.units[0].loadout = Loadout::pair(ActionKind::Sword, ActionKind::Shield);
        let world = World::new(&scenario, 1);
        let fighter = world.pose_test_view(EntityId::new(0, 0)).unwrap();
        assert_eq!(fighter.grips, [
            GripState { equipment_slot: Some(0) },
            GripState { equipment_slot: Some(1) },
        ]);
        let shield = fighter.shield_pose.expect("non-shield left hand stopped the shield search");
        assert_eq!(shield.centre, fighter.arms[1].hand);
        assert_eq!(shield.normal, Vec3::X);
    }

    fn release_both_hands(world: &mut World, id: EntityId) {
        let mut command = world.neutral_core(id.index as usize);
        command.grips = [GripRequest::Release; 2];
        submit(world, id, command);
        world.step();
        assert_eq!(world.grips[id.index as usize], [GripState { equipment_slot: None }; 2]);
    }

    #[test]
    fn both_arms_chase_targets_independently() {
        let scenario = Scenario::embodied_duel();
        let mut world = World::new(&scenario, 1);
        let fighter = EntityId::new(0, 0);
        release_both_hands(&mut world, fighter);
        let mut command = world.neutral_core(0);
        command.arms[0] = ArmTarget {
            bearing: Angle::QUARTER, height: crate::CombatHeight::HIGH,
            reach: Fx::ONE, effort: Fx::ONE,
        };
        command.arms[1] = ArmTarget {
            bearing: Angle::HALF, height: crate::CombatHeight::LOW,
            reach: Fx::HALF, effort: Fx::ONE,
        };
        submit(&mut world, fighter, command);
        world.step();
        let arms = world.arms[0];
        assert!(arms[0].bearing_speed_turns.raw() > 0);
        assert!(arms[1].bearing_speed_turns.raw() < 0);
        assert!(arms[0].height_speed.raw() > 0);
        assert!(arms[1].height_speed.raw() < 0);
        assert!(arms[0].reach_speed.raw() > arms[1].reach_speed.raw() - 1);
        assert_ne!(arms[0].hand, arms[1].hand);
    }

    #[test]
    fn an_intermediate_height_uses_the_same_actuator() {
        let scenario = Scenario::embodied_duel();
        let mut world = World::new(&scenario, 1);
        let fighter = EntityId::new(0, 0);
        release_both_hands(&mut world, fighter);
        let mut command = world.neutral_core(0);
        command.arms[0].height = crate::CombatHeight::try_from_raw(40_000).unwrap();
        command.arms[0].effort = Fx::ONE;
        submit(&mut world, fighter, command);
        world.step();
        assert!(world.arms[0][0].height.raw() > crate::CombatHeight::MID.raw());
        assert!(world.arms[0][0].height.raw() < 40_000);
    }

    #[test]
    fn changing_height_and_reach_takes_more_than_one_tick() {
        let scenario = Scenario::embodied_duel();
        let mut world = World::new(&scenario, 1);
        let fighter = EntityId::new(0, 0);
        release_both_hands(&mut world, fighter);
        let mut command = world.neutral_core(0);
        command.arms[0].height = crate::CombatHeight::HIGH;
        command.arms[0].reach = Fx::ONE;
        command.arms[0].effort = Fx::ONE;
        submit(&mut world, fighter, command);
        world.step();
        assert!(world.arms[0][0].height.raw() > crate::CombatHeight::MID.raw());
        assert!(world.arms[0][0].height.raw() <= crate::CombatHeight::MID.raw() + actuator::ARM_LINEAR_ACCEL_RAW);
        assert!(world.arms[0][0].reach > Fx::from_raw(actuator::ARM_MIN_REACH_RAW));
        assert!(world.arms[0][0].reach < Fx::ONE);
    }

    #[test]
    fn requested_effort_scales_torque_and_not_position() {
        let scenario = Scenario::embodied_duel();
        let mut low = World::new(&scenario, 1);
        let fighter = EntityId::new(0, 0);
        release_both_hands(&mut low, fighter);
        let mut high = low.clone();
        let mut command = low.neutral_core(0);
        command.arms[0] = ArmTarget {
            bearing: Angle::QUARTER, height: crate::CombatHeight::HIGH,
            reach: Fx::ONE, effort: Fx::from_ratio(1, 4),
        };
        submit(&mut low, fighter, command);
        command.arms[0].effort = Fx::ONE;
        submit(&mut high, fighter, command);
        low.step();
        high.step();
        assert!(high.arms[0][0].bearing_speed_turns > low.arms[0][0].bearing_speed_turns);
        assert!(high.arms[0][0].height_speed > low.arms[0][0].height_speed);
        assert!(high.arms[0][0].reach_speed > low.arms[0][0].reach_speed);
        assert_eq!(low.command_core[0].unwrap().arms[0].bearing,
            high.command_core[0].unwrap().arms[0].bearing);
        assert_eq!(low.command_core[0].unwrap().arms[0].height,
            high.command_core[0].unwrap().arms[0].height);
        assert_eq!(low.command_core[0].unwrap().arms[0].reach,
            high.command_core[0].unwrap().arms[0].reach);
    }

    #[test]
    fn a_heavy_weapon_fatigues_its_arm_sooner() {
        let mut sword_scenario = Scenario::embodied_duel();
        sword_scenario.units[0].combat_spec.as_mut().unwrap().equipment = [Some(1), None];
        sword_scenario.units[0].loadout = Loadout::single(ActionKind::Sword);
        let mut club_scenario = sword_scenario.clone();
        club_scenario.units[0].combat_spec.as_mut().unwrap().equipment = [Some(3), None];
        club_scenario.units[0].loadout = Loadout::single(ActionKind::Club);
        let mut sword_world = World::new(&sword_scenario, 1);
        let mut club_world = World::new(&club_scenario, 1);
        let fighter = EntityId::new(0, 0);
        for tick in 0..120 {
            let outward = (tick / 20) % 2 == 0;
            let target = if outward {
                ArmTarget { bearing: Angle::HALF, height: crate::CombatHeight::HIGH, reach: Fx::ONE, effort: Fx::ONE }
            } else {
                ArmTarget { bearing: Angle::ZERO, height: crate::CombatHeight::MID,
                    reach: Fx::from_raw(actuator::ARM_MIN_REACH_RAW), effort: Fx::ONE }
            };
            for world in [&mut sword_world, &mut club_world] {
                let mut command = world.neutral_core(0);
                command.arms[1] = target;
                submit(world, fighter, command);
                world.step();
            }
        }
        // Recorded under the shipped arm rates on purpose, unlike
        // `directional_captured_strike`: what this test is about is the work
        // the *production* actuator bills, so a rate pinned here would stop it
        // measuring the thing it names. Doubling the bearing pair on
        // 2026-08-15 moved both rows -- sword `(92, 76)` and club `(302, 138)`
        // -- which is what the actuator contract's speed-driven work term says
        // a higher ceiling should do over the same 120 ticks. The claim
        // survives the move and gets wider, not narrower: the fatigue gap went
        // from 210 to 262 raw. Both sides are pinned exactly so that a
        // change which raised sword fatigue to meet the club's would be caught
        // by the recordings even though the inequality below still held.
        //
        // **The embodied reseat did not move either row, and that is a
        // measurement rather than an assumption.** `reachable_extent` does clamp
        // this fixture's outward target -- `(HIGH, Fx::ONE)` is held as
        // `(HIGH, 65_390)` -- but the clamp never binds, because the arm
        // reverses every twenty ticks and its reach gets no further than about
        // a third of the way out before it is asked back. The inward target
        // `(MID, ARM_MIN_REACH_RAW)` comes back unclamped, and the two bearings
        // are byte identical under both frames because this body never leaves
        // `Angle::ZERO`. So the work billed is the same work.
        assert_eq!((sword_world.arms[0][1].fatigue.raw(), sword_world.arms[0][1].work_residue.raw()), (115, 67));
        assert_eq!((club_world.arms[0][1].fatigue.raw(), club_world.arms[0][1].work_residue.raw()), (377, 119));
        assert!(club_world.arms[0][1].fatigue > sword_world.arms[0][1].fatigue);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[derive(Clone, Copy)]
    struct Tick34Probe {
        entry: ArmState,
        forward: ArmState,
        actual: ArmState,
        old_direction: Vec3,
        new_direction: Vec3,
        old_offset: Vec3,
        new_offset: Vec3,
        offset_floor: Vec3,
        offset_exact: Vec3,
        length: Fx,
        balance: Fx,
        published_hand_y: Fx,
        com_accel: i32,
        com_max: i32,
    }

    #[cfg(feature = "cartesian-recoil")]
    fn smart_60_probe(fixture: Smart60Entry) -> Tick34Probe {
        let i = 0; let limb = fixture.limb;
        let entry = fixture.world.arms[i][limb];
        // **The posed anatomy and the world-frame target, because those are the
        // two the arms phase itself integrates with.** The probe's whole job is
        // to reproduce one tick of `drive_arms` outside the world so
        // its intermediate vectors can be read, and it can only do that from the
        // same inputs: an embodied torso carries a pelvis that has already sunk
        // by tick 33, and an embodied `ArmTarget::bearing` is measured from the
        // torso. Reading the immutable anatomy row and the unconverted command
        // would model a world this fixture is not, and the published hand below
        // -- which comes back out of a real step -- is what would disagree.
        let anatomy = fixture.world.posed_anatomy(i);
        let target = fixture.world.world_arm_target(i, limb, fixture.target);
        let yaw = fixture.world.body_yaw[i].angle;
        let item = fixture.world.equipment_in_grip(i, limb).expect("the attacking sword");
        let EquipmentGeometry::Segment { length, .. } = item.geometry else { unreachable!() };
        let args = (fixture.world.stats[i], fixture.world.arm_authority[i][limb]);
        let mut forward = entry;
        forward.post_contact_active = false;
        forward.post_contact_com_velocity = Vec3::ZERO;
        actuator::integrate_arm_with_recoil(&mut forward, &anatomy, yaw, limb, target,
            Some(item), args.0, args.1, CAPTURED_ARM_RATES.0, CAPTURED_ARM_RATES.1);
        let old_direction = Vec3::new(entry.bearing.cos(), entry.bearing.sin(), Fx::ZERO);
        let new_direction = Vec3::new(forward.bearing.cos(), forward.bearing.sin(), Fx::ZERO);
        let old_offset = old_direction * length;
        let new_offset = new_direction * length;
        let offset_floor = (new_offset - old_offset) * item.balance;
        let offset_exact = scale_contact_vector(new_offset - old_offset, item.balance);

        let factor = |value: u8| Fx::from_ratio(8 + value as i32, 28)
            .clamp(Fx::from_ratio(1, 4), Fx::ONE);
        let inertia = actuator::equipment_inertia(Some(item));
        let available = ((((target.effort * args.1) * (Fx::ONE - entry.fatigue))
            * factor(args.0.power)) / inertia).clamp(Fx::ZERO, Fx::ONE);
        let linear_accel = (Fx::from_raw(actuator::ARM_LINEAR_ACCEL_RAW) * available).raw().abs();
        let linear_max = (Fx::from_raw(actuator::ARM_LINEAR_MAX_SPEED_RAW)
            * factor(args.0.agility)).raw().abs();
        let com_accel = (Fx::from_raw(linear_accel) * anatomy.arm_length).raw().abs();
        let com_max = (Fx::from_raw(linear_max) * anatomy.arm_length).raw().abs();
        let mut actual = entry;
        actuator::integrate_arm_with_recoil(&mut actual, &anatomy, yaw, limb, target,
            Some(item), args.0, args.1, CAPTURED_ARM_RATES.0, CAPTURED_ARM_RATES.1);
        let mut stepped = fixture.world.clone();
        let mut command = stepped.neutral_core(i);
        command.intent = Intent::Attack(stepped.id_of(1));
        command.arms[limb] = fixture.target;
        let (attacker, defender) = (stepped.id_of(i), stepped.id_of(1));
        submit(&mut stepped, attacker, command);
        let held = stepped.neutral_core(1);
        submit(&mut stepped, defender, held);
        stepped.step_with_arm_rates(CAPTURED_ARM_RATES.0, CAPTURED_ARM_RATES.1);
        let published_hand_y = stepped.pose(stepped.id_of(i)).unwrap().arms[limb].hand.y;
        Tick34Probe { entry, forward, actual, old_direction, new_direction, old_offset,
            new_offset, offset_floor, offset_exact, length, balance: item.balance,
            published_hand_y, com_accel, com_max }
    }

    #[cfg(feature = "cartesian-recoil")]
    fn smart_60_choice(probe: Tick34Probe, next_offset: Vec3) -> (Vec3, Vec3, bool) {
        let update = |error: Fx, offset: Fx, current: Fx| {
            let desired_hand = error.raw();
            let desired_com = desired_hand.saturating_add(offset.raw())
                .clamp(-probe.com_max, probe.com_max);
            Fx::from_raw(current.raw()
                + (desired_com - current.raw()).clamp(-probe.com_accel, probe.com_accel))
        };
        let next_com = Vec3::new(
            update(probe.forward.hand.x - probe.entry.hand.x, next_offset.x,
                   probe.entry.post_contact_com_velocity.x),
            update(probe.forward.hand.y - probe.entry.hand.y, next_offset.y,
                   probe.entry.post_contact_com_velocity.y),
            update(probe.forward.hand.z - probe.entry.hand.z, next_offset.z,
                   probe.entry.post_contact_com_velocity.z));
        let requested = probe.entry.hand + (next_com - next_offset);
        let crosses = |entry: Fx, target: Fx, next: Fx| {
            let error = target.raw() as i64 - entry.raw() as i64;
            let delta = next.raw() as i64 - entry.raw() as i64;
            error == 0 || (delta.signum() == error.signum()
                && delta.unsigned_abs() >= error.unsigned_abs())
        };
        let hand = if crosses(probe.entry.hand.x, probe.forward.hand.x, requested.x)
            && crosses(probe.entry.hand.y, probe.forward.hand.y, requested.y)
            && crosses(probe.entry.hand.z, probe.forward.hand.z, requested.z) {
            probe.forward.hand
        } else { requested };
        let desired_com = (hand - probe.entry.hand) + next_offset;
        (hand, next_com, hand != probe.forward.hand || next_com != desired_com)
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn tick_34_recoil_offset_balance_is_odd_under_reflection() {
        let p = smart_60_probe(smart_60_entry(false));
        let m = smart_60_probe(smart_60_entry(true));
        assert!(mapped_arm_words(p.entry, m.entry));
        assert_eq!((p.length, p.balance), (m.length, m.balance));
        assert_eq!(p.old_direction.y, -m.old_direction.y);
        assert_eq!(p.new_direction.y, -m.new_direction.y);
        assert_eq!(p.old_offset.y, -m.old_offset.y);
        assert_eq!(p.new_offset.y, -m.new_offset.y);
        eprintln!("tick34 old_dir_y={}|{} new_dir_y={}|{} old_offset_y={}|{} new_offset_y={}|{} delta_balance_y={}|{} exact={}|{} com_accel={} com_max={} hand_y={}|{}",
            p.old_direction.y.raw(), m.old_direction.y.raw(), p.new_direction.y.raw(),
            m.new_direction.y.raw(), p.old_offset.y.raw(), m.old_offset.y.raw(),
            p.new_offset.y.raw(), m.new_offset.y.raw(), p.offset_floor.y.raw(),
            m.offset_floor.y.raw(), p.offset_exact.y.raw(), m.offset_exact.y.raw(),
            p.com_accel, p.com_max, p.actual.hand.y.raw(), m.actual.hand.y.raw());
        assert_ne!(p.offset_floor.y, -m.offset_floor.y,
                   "ordinary balance scaling unexpectedly remained odd");
        assert_eq!(p.offset_exact.y, -m.offset_exact.y);
        // **Re-recorded with the embodied reseat, for exactly one of the four
        // reasons the reseat has: `reachable_extent`.** An embodied arm may not
        // be commanded past the annulus its elbow permits, and this fixture's
        // target is outside it -- `World::world_arm_target` holds the commanded
        // `(height 14_563, reach 32_768)` as `(24_532, 16_384)` on the tick-33
        // world. So the tick-33 entry hand moved from `(0.3492, -0.1130,
        // 0.3999)` to `(0.1773, -0.1974, 0.6727)`, shorter and higher, which is
        // what a clamp onto the annulus does, and every word downstream of that
        // pose moved with it.
        //
        // The other three differences the model makes were measured here rather
        // than assumed, and all three are inert: the commanded bearing is byte
        // identical at `4_546` under both models, because this attacker never
        // leaves `Angle::ZERO` and the torso frame therefore names the same
        // world bearing; the stance's pelvis is still exactly
        // `PELVIS_HEIGHT_RAW`, so `posed_anatomy` hands back the anatomy row
        // unlowered; and tick 33 still retains exactly one resolution, so this
        // is still a probe of a captured strike rather than of an empty tick.
        //
        // **What did not move is the point.** Every reflection in this module
        // survived byte for byte, which is what says the solver is unchanged and
        // only the pose it was handed differs. Both re-recorded words are still
        // exact reflections -- `-19_151` against `19_151`, and a published hand
        // that mirrors about the fixture's `y = 8` -- and that oddness is
        // asserted independently below and in
        // `tick_34_recoil_hand_maps_after_only_offset_scaling_changes`, so
        // neither number is a value read back off a compiler and pasted.
        assert_eq!((p.actual.hand.y.raw(), m.actual.hand.y.raw()), (-19_151, 19_151));
        assert_eq!((p.published_hand_y.raw(),
                    Fx::from_int(16).raw() - m.published_hand_y.raw()),
                   (436_667, 436_667));
        let repaired = (smart_60_choice(p, p.offset_exact), smart_60_choice(m, m.offset_exact));
        assert_eq!((repaired.0.0.y.raw(), repaired.1.0.y.raw()), (-19_151, 19_151));
        assert_eq!(repaired.0.0.y, -repaired.1.0.y);
        // The ordering guard: corrupting the retained recoil changes the
        // downstream answer before offset scaling is considered, so the
        // clean entry assertions above are load-bearing rather than ceremony.
        let mut retained_mutation = p;
        retained_mutation.entry.post_contact_com_velocity.y += Fx::from_raw(1);
        assert_ne!(smart_60_choice(retained_mutation, retained_mutation.offset_exact).0,
                   repaired.0.0);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn tick_34_direction_length_products_remain_byte_identical() {
        let p = smart_60_probe(smart_60_entry(false));
        let m = smart_60_probe(smart_60_entry(true));
        assert_eq!(p.old_direction.y, -m.old_direction.y);
        assert_eq!(p.new_direction.y, -m.new_direction.y);
        assert_eq!(p.old_offset.y, -m.old_offset.y);
        assert_eq!(p.new_offset.y, -m.new_offset.y);
        assert_eq!(p.offset_exact.y, -m.offset_exact.y);
        assert_eq!((p.offset_floor.y.raw(), m.offset_floor.y.raw()),
                   (p.offset_exact.y.raw(), -p.offset_exact.y.raw() - 1));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn recoil_clamp_crossing_lifetime_and_fatigue_are_unchanged() {
        let p = smart_60_probe(smart_60_entry(false));
        let m = smart_60_probe(smart_60_entry(true));
        let legacy = (smart_60_choice(p, p.offset_floor), smart_60_choice(m, m.offset_floor));
        assert_ne!(legacy.0.0, p.actual.hand); assert_ne!(legacy.1.0, m.actual.hand);
        assert_eq!(legacy.0.2, legacy.1.2);
        let exact = (smart_60_choice(p, p.offset_exact), smart_60_choice(m, m.offset_exact));
        assert_eq!(exact.0.0.x, exact.1.0.x);
        assert_eq!(exact.0.0.y, -exact.1.0.y);
        assert_eq!(exact.0.0.z, exact.1.0.z);
        assert_eq!(exact.0.2, exact.1.2);
        assert_eq!(exact.0.0, p.actual.hand); assert_eq!(exact.1.0, m.actual.hand);
        assert_eq!((p.actual.post_contact_active, p.actual.fatigue, p.actual.work_residue),
                   (m.actual.post_contact_active, m.actual.fatigue, m.actual.work_residue));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn tick_34_recoil_hand_maps_after_only_offset_scaling_changes() {
        let p = smart_60_probe(smart_60_entry(false));
        let m = smart_60_probe(smart_60_entry(true));
        assert_eq!(p.actual.hand.x, m.actual.hand.x);
        assert_eq!(p.actual.hand.y, -m.actual.hand.y);
        assert_eq!(p.actual.hand.z, m.actual.hand.z);
        assert_eq!(p.actual.linear_velocity.x, m.actual.linear_velocity.x);
        assert_eq!(p.actual.linear_velocity.y, -m.actual.linear_velocity.y);
        assert_eq!(p.actual.linear_velocity.z, m.actual.linear_velocity.z);
        // Re-recorded with the reseat; the reason is written out beside its twin
        // in `tick_34_recoil_offset_balance_is_odd_under_reflection`. The two
        // components being equal *is* the reflection -- the mirrored hand about
        // the fixture's `y = 8` -- so the property this line is here for is
        // unchanged and only the pose behind it moved.
        assert_eq!((p.published_hand_y.raw(), Fx::from_int(16).raw() - m.published_hand_y.raw()),
                   (436_667, 436_667));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn first_authoritative_exact_field_and_its_hash_land_in_the_same_transition() {
        // The control that opened this test is gone with the model: a Legacy world
        // allocated no exact-owner column at all, which was the strongest way to
        // say the column follows the model rather than the build. Every surviving
        // world allocates it under this feature, so what is left is the claim
        // below -- that when it is allocated, every slot carries an owner whose
        // fields agree with the body's.
        let scenario = Scenario::embodied_duel();
        let mut world = World::new(&scenario, 1);
        assert_eq!(world.exact_owners.len(), world.alive.len());
        for i in 0..world.alive.len() {
            let owner = world.exact_owners[i].expect("an active exact owner");
            assert_eq!(owner.entity, world.id_of(i));
            assert_eq!(owner.body_mass_raw, world.mass[i].raw());
            let mut expected_common_mass = world.mass[i].raw();
            for limb in 0..2 {
                let item = world.equipment_in_grip(i, limb);
                let owned = item.filter(|item| {
                    item.binding != crate::GripBinding::Both
                        || limb == LimbSlot::RightArm as usize
                });
                assert_eq!(owner.held_response[limb].map(|held| held.spec_id),
                           owned.map(|item| item.id));
                if let Some(item) = owned {
                    let held = owner.held_response[limb].unwrap();
                    assert_eq!(held.slot, limb as u8);
                    assert_eq!(held.affine.mass_raw, item.mass.raw());
                    assert!(exact_affine_is_zero(held.affine));
                    expected_common_mass += item.mass.raw();
                }
            }
            assert_eq!(owner.common_response.mass_raw, expected_common_mass);
            assert!(exact_affine_is_zero(owner.common_response));
        }

        let before = world.state_digest().value;
        world.exact_owners[0].as_mut().unwrap()
            .common_response.momentum[0].remainder = 1;
        assert_ne!(world.state_digest().value, before,
                   "World acquired an exact word which its authoritative hash omitted");

        let both = World::new(&both_scenario(), 1);
        let owner = both.exact_owners[1].expect("the two-handed owner");
        assert!(owner.held_response[0].is_none(), "Both was counted on the left");
        let right = owner.held_response[1].expect("Both is right-owned");
        let item = both.equipment_in_grip(1, 1).unwrap();
        assert_eq!(right.spec_id, item.id);
        assert_eq!(owner.common_response.mass_raw,
                   both.mass[1].raw() + item.mass.raw(), "Both mass was counted twice");
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn ordinary_actuation_changes_motor_coefficients_without_erasing_response() {
        let scenario = Scenario::embodied_duel();
        let mut world = World::new(&scenario, 1);
        let before_arm = world.arms[0];
        let before_exact = world.exact_owners[0];
        let mut command = world.neutral_core(0);
        command.arms[1].bearing = Angle::QUARTER;
        command.arms[1].reach = Fx::ONE;
        command.arms[1].effort = Fx::ONE;
        submit(&mut world, EntityId::new(0, 0), command);
        world.step();
        assert_ne!(world.arms[0], before_arm, "the fixture did not actuate an arm");
        assert_eq!(world.exact_owners[0], before_exact,
                   "ordinary motor motion rebuilt exact response state");
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn equip_release_and_severance_replace_exact_tags_and_mass_atomically() {
        let scenario = Scenario::embodied_duel();
        let mut world = World::new(&scenario, 1);
        let body_mass = world.mass[0].raw();
        let sword = world.equipment_in_grip(0, 1).unwrap();
        let shield = world.equipment_in_grip(0, 0).unwrap();

        let mut release = world.neutral_core(0);
        release.grips = [GripRequest::Release, GripRequest::Keep];
        world.command_core[0] = Some(release);
        world.apply_grips();
        let owner = world.exact_owners[0].unwrap();
        assert_eq!(world.grips[0][0].equipment_slot, None);
        assert_eq!(owner.held_response[0], None);
        assert_eq!(owner.held_response[1].unwrap().spec_id, sword.id);
        assert_eq!(owner.common_response.mass_raw, body_mass + sword.mass.raw());

        let mut equip = world.neutral_core(0);
        equip.grips = [GripRequest::EquipSlot(1), GripRequest::Keep];
        world.command_core[0] = Some(equip);
        world.apply_grips();
        let owner = world.exact_owners[0].unwrap();
        assert_eq!(world.grips[0][0].equipment_slot, Some(1));
        assert_eq!(owner.held_response[0].unwrap().spec_id, shield.id);
        assert_eq!(owner.common_response.mass_raw,
                   body_mass + shield.mass.raw() + sword.mass.raw());

        world.wounds[0].parts[BodyPart::LeftArm as usize].severed = true;
        world.release_severed_grips();
        let owner = world.exact_owners[0].unwrap();
        assert_eq!(world.grips[0][0].equipment_slot, None);
        assert_eq!(owner.held_response[0], None);
        assert_eq!(owner.held_response[1].unwrap().spec_id, sword.id);
        assert_eq!(owner.common_response.mass_raw, body_mass + sword.mass.raw());
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn release_and_unequal_replacement_preserve_the_common_lattice_exactly() {
        let scenario = Scenario::embodied_duel();
        let mut world = World::new(&scenario, 1);
        let owner = world.exact_owners[0].as_mut().unwrap();
        owner.common_response.group_time_raw = 1_234;
        owner.common_response.at_group[0] = ExactPosition { raw: 2, remainder: 7 };
        owner.common_response.momentum[1] = ExactMomentum { velocity_raw: -3, remainder: -5 };
        for held in owner.held_response.iter_mut().flatten() {
            held.affine.group_time_raw = 1_234;
        }
        owner.held_response[1].as_mut().unwrap().affine.momentum[0] =
            ExactMomentum { velocity_raw: 1, remainder: 3 };
        let original = *owner;

        let released = world.prepare_zero_response_grip_transition(0, [None, Some(0)]).unwrap();
        assert_ne!(released.common_response.mass_raw, original.common_response.mass_raw,
                   "the unequal-mass transition fixture did not change active mass");
        assert_eq!((released.common_scale, released.common_response.at_group,
                    released.common_response.momentum, released.common_response.group_time_raw),
                   (original.common_scale, original.common_response.at_group,
                    original.common_response.momentum, original.common_response.group_time_raw));
        assert_eq!(released.held_response[1], original.held_response[1],
                   "the surviving sword row was rebuilt");
        assert_eq!(released.held_response[0], None, "the released shield row survived");

        world.exact_owners[0] = Some(released);
        world.grips[0] = [GripState { equipment_slot: None },
                          GripState { equipment_slot: Some(0) }];
        let restored = world.prepare_zero_response_grip_transition(0, [Some(1), Some(0)]).unwrap();
        let new_held = restored.held_response[0].unwrap().affine;
        assert_eq!((new_held.at_group, new_held.momentum, new_held.group_time_raw),
                   ([ExactPosition::default(); 3], [ExactMomentum::default(); 3], 1_234),
                   "newly held equipment inherited the released row's motion");
        assert_eq!(restored, original,
                   "A -> B -> A changed words other than the shared transition time");
        assert_ne!(restored.common_scale, restored.common_response.mass_raw as i128,
                   "the immutable lattice was derived from active mass");
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn two_handed_release_and_reacquire_keep_one_right_owned_common_lattice() {
        let mut world = World::new(&both_scenario(), 1);
        let owner = world.exact_owners[1].as_mut().unwrap();
        owner.common_response.at_group[1] = ExactPosition { raw: -1, remainder: -9 };
        owner.common_response.momentum[0] = ExactMomentum { velocity_raw: 2, remainder: 11 };
        let original = *owner;
        let released = world.prepare_zero_response_grip_transition(1, [None, None]).unwrap();
        assert_eq!((released.common_scale, released.common_response.at_group,
                    released.common_response.momentum),
                   (original.common_scale, original.common_response.at_group,
                    original.common_response.momentum));
        assert_eq!(released.held_response, [None, None]);
        world.exact_owners[1] = Some(released);
        world.grips[1] = [GripState { equipment_slot: None }; 2];
        let reacquired = world.prepare_zero_response_grip_transition(1, [Some(0), Some(0)]).unwrap();
        assert!(reacquired.held_response[0].is_none(), "Both acquired a left owner");
        assert!(reacquired.held_response[1].is_some(), "Both lost its right owner");
        assert_eq!((reacquired.common_scale, reacquired.common_response.at_group,
                    reacquired.common_response.momentum),
                   (original.common_scale, original.common_response.at_group,
                    original.common_response.momentum));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn inactive_and_reused_slots_are_canonical_before_their_first_scan() {
        let scenario = Scenario::embodied_duel();
        let mut world = World::new(&scenario, 1);
        let dead = world.exact_owners[1].unwrap();
        world.exact_owners[1].as_mut().unwrap()
            .held_response[1].as_mut().unwrap().affine.at_group[2].remainder = -7;
        world.wounds[1].blood = Fx::ZERO;
        world.reap_dead_bodies();
        assert_eq!(world.exact_owners[1], None, "death retained exact response poison");

        let inactive_hash = exact_owner_rows_hash(&world);
        world.exact_owners[1] = Some(dead);
        assert_ne!(exact_owner_rows_hash(&world), inactive_hash,
                   "an inactive poison row was invisible to the fixed grammar");
        world.exact_owners[1] = None;

        let reborn = world.try_spawn(&scenario.units[1]).expect("reuse dead slot");
        assert_eq!(reborn, EntityId::new(1, 1));
        let owner = world.exact_owners[1].expect("reuse installed an exact owner");
        assert_eq!(owner, world.initial_exact_owner(1, owner.common_scale));
        assert!(exact_affine_is_zero(owner.common_response));
        assert!(owner.held_response.iter().flatten()
            .all(|held| exact_affine_is_zero(held.affine)));
    }

    #[test]
    fn grip_transactions_validate_the_resulting_current_pair() {
        let scenario = Scenario::embodied_duel();
        let world = World::new(&scenario, 1);
        assert_eq!(world.resulting_grips(0, [GripRequest::Keep; 2]).unwrap(), [Some(1), Some(0)]);
        assert_eq!(world.resulting_grips(0, [GripRequest::Release; 2]).unwrap(), [None, None]);
        assert_eq!(world.resulting_grips(0, [GripRequest::Keep, GripRequest::Release]).unwrap(), [Some(1), None]);
        assert_eq!(world.resulting_grips(0, [GripRequest::Release, GripRequest::Keep]).unwrap(), [None, Some(0)]);
        assert!(world.resulting_grips(0, [GripRequest::EquipSlot(0), GripRequest::Keep]).is_err());
        assert!(world.resulting_grips(0, [GripRequest::Keep, GripRequest::EquipSlot(1)]).is_err());

        let both_scenario = both_scenario();
        let both = World::new(&both_scenario, 1);
        assert_eq!(both.resulting_grips(1, [GripRequest::Keep; 2]).unwrap(), [Some(0), Some(0)]);
        assert!(both.resulting_grips(1, [GripRequest::Release, GripRequest::Keep]).is_err());
        assert!(both.resulting_grips(1, [GripRequest::Keep, GripRequest::Release]).is_err());
        assert_eq!(both.resulting_grips(1, [GripRequest::Release; 2]).unwrap(), [None, None]);

        let mut duplicate_single = World::new(&scenario, 1);
        assert!(duplicate_single.resulting_grips(0, [GripRequest::EquipSlot(0); 2]).is_err());
        duplicate_single.combat_specs.as_mut().unwrap().equipment[0].binding = crate::GripBinding::Both;
        assert!(duplicate_single.resulting_grips(0,
            [GripRequest::EquipSlot(0), GripRequest::EquipSlot(1)]).is_err(), "Both plus another item was accepted");
        duplicate_single.combat_specs.as_mut().unwrap().equipment[1].binding = crate::GripBinding::Both;
        assert!(duplicate_single.resulting_grips(0,
            [GripRequest::EquipSlot(0), GripRequest::EquipSlot(1)]).is_err(), "two different Both items were accepted");
    }

    #[test]
    fn a_two_handed_target_mirrors_the_off_hand() {
        let scenario = both_scenario();
        let mut world = World::new(&scenario, 1);
        let brute = EntityId::new(1, 0);
        let old_left = world.arms[1][0].hand;
        let mut command = world.neutral_core(1);
        command.body_yaw = Angle::HALF;
        command.arms[0] = ArmTarget {
            bearing: Angle::QUARTER, height: crate::CombatHeight::LOW,
            reach: Fx::from_raw(actuator::ARM_MIN_REACH_RAW), effort: Fx::ZERO,
        };
        command.arms[1] = ArmTarget {
            bearing: Angle::QUARTER, height: crate::CombatHeight::HIGH,
            reach: Fx::ONE, effort: Fx::ONE,
        };
        submit(&mut world, brute, command);
        world.step();
        let [left, right] = world.arms[1];
        assert_eq!(left.bearing.raw(), world.body_yaw[1].angle.raw().wrapping_mul(2).wrapping_sub(right.bearing.raw()));
        assert_eq!(left.bearing_speed_turns, -right.bearing_speed_turns);
        assert_eq!((left.height, left.height_speed, left.reach, left.reach_speed),
            (right.height, right.height_speed, right.reach, right.reach_speed));
        assert_eq!(left.previous_hand, old_left);
        assert_eq!(left.linear_velocity, left.hand - old_left);
        assert_eq!(left.fatigue, right.fatigue);
        assert_ne!(left.height, command.arms[0].height, "ignored left target drove the shared item");
    }

    #[test]
    fn a_two_handed_trajectory_uses_right_authority_effort_and_target_only() {
        let scenario = both_scenario();
        let brute = EntityId::new(1, 0);
        let mut full = World::new(&scenario, 1);
        let mut left_impaired = full.clone();
        let mut right_impaired = full.clone();
        left_impaired.arm_authority[1][0] = Fx::HALF;
        right_impaired.arm_authority[1][1] = Fx::HALF;
        let mut command = full.neutral_core(1);
        command.body_yaw = Angle::HALF;
        command.arms[1] = ArmTarget {
            bearing: Angle::QUARTER, height: crate::CombatHeight::HIGH,
            reach: Fx::ONE, effort: Fx::ONE,
        };
        for world in [&mut full, &mut left_impaired, &mut right_impaired] {
            submit(world, brute, command);
            world.step();
        }
        assert_eq!(full.arms[1], left_impaired.arms[1]);
        assert_ne!(full.arms[1], right_impaired.arms[1]);

        let mut full_effort = World::new(&scenario, 1);
        let mut low_effort = full_effort.clone();
        let mut full_command = command;
        let mut low_command = command;
        low_command.arms[1].effort = Fx::HALF;
        submit(&mut full_effort, brute, full_command);
        submit(&mut low_effort, brute, low_command);
        full_effort.step();
        low_effort.step();
        assert_ne!(full_effort.arms[1], low_effort.arms[1]);

        let mut ignored_a = World::new(&scenario, 1);
        let mut ignored_b = ignored_a.clone();
        full_command.arms[0] = ArmTarget {
            bearing: Angle::ZERO, height: crate::CombatHeight::LOW,
            reach: Fx::from_raw(actuator::ARM_MIN_REACH_RAW), effort: Fx::ZERO,
        };
        let mut changed_left = full_command;
        changed_left.arms[0] = ArmTarget {
            bearing: Angle::HALF, height: crate::CombatHeight::HIGH,
            reach: Fx::ONE, effort: Fx::ONE,
        };
        submit(&mut ignored_a, brute, full_command);
        submit(&mut ignored_b, brute, changed_left);
        ignored_a.step();
        ignored_b.step();
        assert_eq!(ignored_a.arms[1], ignored_b.arms[1]);

        let independent_scenario = Scenario::embodied_duel();
        let fighter = EntityId::new(0, 0);
        let mut independent = World::new(&independent_scenario, 1);
        let mut independent_impaired = independent.clone();
        independent_impaired.arm_authority[0][0] = Fx::HALF;
        let mut command = independent.neutral_core(0);
        command.arms[0] = ArmTarget {
            bearing: Angle::QUARTER, height: crate::CombatHeight::HIGH,
            reach: Fx::ONE, effort: Fx::ONE,
        };
        for world in [&mut independent, &mut independent_impaired] {
            submit(world, fighter, command);
            world.step();
        }
        assert!(independent.arms[0][0].bearing_speed_turns
            > independent_impaired.arms[0][0].bearing_speed_turns);
    }

    /// A commanded elbow plane is **chased, not snapped**, and it arrives
    /// exactly.
    ///
    /// Half a turn is the worst case the command space has, and it is the case
    /// the bound exists for: once the forearm is a swept collider, a plane that
    /// jumped half a turn in one tick would sweep the forearm bodily across the
    /// body inside that tick and hand the contact solver a closing energy no arm
    /// can produce.
    ///
    /// Bounded from **both** sides, because either half alone is satisfied by a
    /// defect. "No further than the budget" alone is satisfied by an elbow that
    /// never moves; "arrives" alone is satisfied by a snap. So every tick of the
    /// approach is asserted to move by exactly the budget, the arrival tick is
    /// asserted to land exactly on the command, and the ticks after it are
    /// asserted to move by nothing -- which is what rules out an overshoot that
    /// oscillates back, the failure a clamp on the *command* rather than on the
    /// step would produce.
    #[test]
    fn an_elbow_plane_cannot_cross_the_arm_in_one_tick() {
        use crate::combat::actuator::ELBOW_PLANE_MAX_SPEED_RAW;

        let mut world = World::new(&Scenario::embodied_duel(), 1);
        let id = world.alive_ids(Faction::Heroes)[0];
        let i = world.resolve(id).expect("a live hero");
        let mut command = crate::CommandV1::new(world.neutral_core(i));
        // Half a turn, on both arms, and the two arms are commanded together on
        // purpose: an integrator that drove slot 0 twice would leave slot 1 at
        // zero and every assertion below would name it.
        command.swing_plane = [Angle::HALF; 2];
        assert!(matches!(world.submit(id, command),
                         crate::SubmitOutcome::Stored { rejection: None, .. }));
        for slot in 0..2 {
            assert_eq!(world.elbow_plane[i][slot],
                       ElbowPlaneState { commanded: Angle::HALF, held: Angle::ZERO },
                       "submission moved the held plane instead of the commanded one");
        }

        // 32,768 raw units to cover at 2,184 a tick: fifteen full steps and a
        // remainder of eight. Written as arithmetic rather than as a literal
        // sixteen, so this still measures the right thing if the budget moves.
        let budget = ELBOW_PLANE_MAX_SPEED_RAW;
        let full_steps = 32_768 / budget;
        let mut arrived = None;
        for tick in 1..=(full_steps + 8) {
            let before = [world.elbow_plane[i][0].held, world.elbow_plane[i][1].held];
            world.step();
            for slot in 0..2 {
                let plane = world.elbow_plane[i][slot];
                assert_eq!(plane.commanded, Angle::HALF, "the request was forgotten");
                let step = plane.held.delta(before[slot]).abs();
                if tick <= full_steps {
                    assert_eq!(step, budget,
                               "arm {slot} moved {step} raw units on tick {tick}, not the budget");
                    assert_ne!(plane.held, Angle::HALF,
                               "arm {slot} arrived early on tick {tick}");
                } else if arrived.is_none() {
                    assert_eq!(step, 32_768 - full_steps * budget,
                               "arm {slot} did not spend exactly the remainder");
                } else {
                    assert_eq!(step, 0, "arm {slot} kept moving after it arrived");
                }
                assert_eq!(plane.held == Angle::HALF, tick > full_steps,
                           "arm {slot} settled off the commanded plane on tick {tick}");
            }
            if world.elbow_plane[i][0].held == Angle::HALF && arrived.is_none() {
                arrived = Some(tick);
            }
        }
        assert_eq!(arrived, Some(full_steps + 1), "the arrival tick moved");
    }

    /// Replaces `a_shield_normal_follows_body_yaw_and_cannot_orbit`, which
    /// asserted the opposite of this and was the standing proof of the defect
    /// rather than of a rule. Bounded from both sides on purpose: re-recording
    /// the old assertion's expected vector would have left a test that passes
    /// whether or not the normal tracks anything.
    ///
    /// **The two bearings below are the reseat's whole edit, and they are not a
    /// re-record.** An embodied `ArmTarget::bearing` is measured from the torso,
    /// so "agrees with its body" is `Angle::ZERO` here where it was `QUARTER`,
    /// and "disagrees by a quarter turn" is a quarter turn *back* where it was
    /// an absolute zero. The world bearings both arms end up holding -- and
    /// therefore every normal asserted below -- are the ones this test always
    /// measured. Written as `body_yaw` arithmetic rather than as two literals,
    /// so a reader can see that only the frame moved.
    #[test]
    fn the_shield_normal_follows_the_arm_that_holds_it() {
        let scenario = Scenario::embodied_duel();
        let fighter = EntityId::new(0, 0);

        // Side one: an arm that agrees with its body is EXACTLY body yaw, so
        // every pose the old rule got right is untouched.
        let mut agreed = World::new(&scenario, 1);
        let mut command = agreed.neutral_core(0);
        command.body_yaw = Angle::QUARTER;
        command.arms[0].bearing = Angle::ZERO;
        command.arms[0].effort = Fx::ONE;
        submit(&mut agreed, fighter, command);
        for _ in 0..200 {
            agreed.step();
            if agreed.body_yaw[0].angle == Angle::QUARTER
                && agreed.arms[0][0].bearing == Angle::QUARTER { break; }
        }
        assert_eq!(agreed.body_yaw[0].angle, Angle::QUARTER);
        assert_eq!(agreed.arms[0][0].bearing, Angle::QUARTER);
        assert_eq!(agreed.shield_pose[0].unwrap().normal,
            Vec3::new(Fx::ZERO, Fx::ONE, Fx::ZERO),
            "a guard that agrees with its body must derive the body's own normal");

        // Side two: an arm that disagrees derives the ARM's normal, not the
        // body's and not something between them. The old rule answered
        // `(0,1,0)` here; the midpoint of the two bearings would answer a
        // diagonal. Both are excluded by an exact equality against the arm.
        let mut swung = World::new(&scenario, 1);
        let mut command = swung.neutral_core(0);
        command.body_yaw = Angle::QUARTER;
        // A quarter turn back from a torso a quarter turn round: world east,
        // which is the bearing the assertions below are written at.
        command.arms[0].bearing = Angle::from_raw(Angle::QUARTER.raw().wrapping_neg());
        command.arms[0].effort = Fx::ONE;
        submit(&mut swung, fighter, command);
        for _ in 0..200 {
            swung.step();
            if swung.body_yaw[0].angle == Angle::QUARTER
                && swung.arms[0][0].bearing == Angle::ZERO { break; }
        }
        assert_eq!(swung.body_yaw[0].angle, Angle::QUARTER);
        assert_eq!(swung.arms[0][0].bearing, Angle::ZERO,
            "the guard arm did not reach the commanded bearing to be measured at");
        let normal = swung.shield_pose[0].unwrap().normal;
        assert_eq!(normal, Vec3::new(Fx::ONE, Fx::ZERO, Fx::ZERO),
            "the plate must face along its own arm, not along the torso");
        assert_ne!(normal, agreed.shield_pose[0].unwrap().normal,
            "two guards at one body yaw and different bearings must not share a normal");
    }

    /// The mechanical claim behind freeing the guard bearing: the plate the
    /// contact phase actually sweeps moves when the bearing does.
    ///
    /// Asserted on the swept **face** rather than on `ShieldPose`, because the
    /// face is what `segment_shield_candidate` takes and a pose that moved
    /// without moving its corners would be a publication change dressed up as a
    /// mechanical one. Under the old rule the two faces here were identical.
    #[test]
    fn a_freed_guard_bearing_moves_the_plate_the_solver_sweeps() {
        let scenario = Scenario::embodied_duel();
        let fighter = EntityId::new(0, 0);
        let face_at = |bearing: Angle| {
            let mut world = World::new(&scenario, 1);
            let mut command = world.neutral_core(0);
            command.arms[0].bearing = bearing;
            command.arms[0].effort = Fx::ONE;
            submit(&mut world, fighter, command);
            for _ in 0..200 {
                world.step();
                if world.arms[0][0].bearing == bearing { break; }
            }
            assert_eq!(world.arms[0][0].bearing, bearing,
                "the guard never reached the commanded bearing");
            let pose = world.shield_pose[0].expect("the fighter carries the plate");
            (pose, crate::combat::geometry::shield_face(
                Vec3::new(world.pos[0].x, world.pos[0].y, Fx::ZERO), pose))
        };

        let (straight_pose, straight) = face_at(Angle::ZERO);
        let (turned_pose, turned) = face_at(Angle::QUARTER);

        assert_ne!(straight_pose.normal, turned_pose.normal,
            "the plate's facing did not follow its arm");
        assert_ne!(straight.corners, turned.corners,
            "the solver would sweep the same four corners at two guard bearings");
        // And it is the facing that moved them, not only the hand: the normals
        // are the two exact cardinals, so this cannot pass on a rounding
        // difference in the centre alone.
        assert_eq!(straight_pose.normal, Vec3::new(Fx::ONE, Fx::ZERO, Fx::ZERO));
        assert_eq!(turned_pose.normal, Vec3::new(Fx::ZERO, Fx::ONE, Fx::ZERO));
        assert_eq!(straight.normal, straight_pose.normal);
        assert_eq!(turned.normal, turned_pose.normal);
    }

    #[test]
    fn changing_shield_height_takes_more_than_one_tick() {
        let scenario = Scenario::embodied_duel();
        let mut world = World::new(&scenario, 1);
        let fighter = EntityId::new(0, 0);
        let before = world.shield_pose[0].unwrap().centre.z;
        let mut command = world.neutral_core(0);
        command.arms[0].height = crate::CombatHeight::HIGH;
        command.arms[0].effort = Fx::ONE;
        submit(&mut world, fighter, command);
        world.step();
        let arm = world.arms[0][0];
        assert!(arm.height.raw() > crate::CombatHeight::MID.raw());
        assert!(arm.height.raw() <= crate::CombatHeight::MID.raw() + actuator::ARM_LINEAR_ACCEL_RAW);
        assert!(arm.height.raw() < crate::CombatHeight::HIGH.raw());
        assert!(world.shield_pose[0].unwrap().centre.z > before);
    }

    #[test]
    fn a_severed_right_arm_cannot_drive_its_weapon() {
        let mut world = World::new(&fragile_scenario(&[]), 1);
        assert!(world.grips[0][LimbSlot::RightArm as usize].equipment_slot.is_some(),
                "the fixture's fighter holds no sword");
        sever_arm(&mut world, 0, BodyPart::RightArm);

        // The three consequences the contract names.
        assert_eq!(world.arm_authority[0][LimbSlot::RightArm as usize], Fx::ZERO);
        assert_eq!(world.grips[0][LimbSlot::RightArm as usize],
                   GripState { equipment_slot: None }, "a severed arm kept hold of its sword");
        assert!(world.grips[0][LimbSlot::LeftArm as usize].equipment_slot.is_some(),
                "the shield arm was released along with the sword arm");
        let contact = world.contact.as_ref().expect("articulated contact state");
        assert!(!contact.colliders.iter().any(|row| row.entity == EntityId::new(0, 0)
            && row.slot == LimbSlot::RightArm as u8),
            "a severed arm still built an equipment collider");

        // And zero authority is zero acceleration, not merely a zero column:
        // the arm is commanded hard and does not move.
        let swing = CommandCoreV1 {
            move_dir: Vec2::ZERO, body_yaw: world.body_yaw[0].angle, intent: Intent::Hold,
            arms: [ArmTarget { bearing: Angle::QUARTER, height: crate::CombatHeight::HIGH,
                               reach: Fx::ONE, effort: Fx::ONE }; 2],
            grips: [GripRequest::Keep; 2],
            releases: [ReleaseRequest::Keep; 2],
        };
        let before = world.arms[0][1];
        let wounded = world.id_of(0);
        submit(&mut world, wounded, swing);
        world.step();
        assert_eq!(world.arms[0][1].bearing, before.bearing,
                   "a severed arm accelerated toward a commanded bearing");
        assert_eq!(world.arms[0][1].reach, before.reach);
        // The sound arm answered the same command, which is what makes the
        // frozen one a statement about the limb rather than about the tick.
        assert_ne!(world.arms[0][0].bearing, Angle::ZERO);

        // And it cannot pick the sword back up. The command that asks for it is
        // accepted -- grip validation is about bindings, not about injuries --
        // and the grip phase refuses it anyway, on every tick, rather than
        // re-acquiring a weapon the contact phase would only drop again.
        let mut retake = world.neutral_core(0);
        retake.grips = [GripRequest::Keep, GripRequest::EquipSlot(0)];
        submit(&mut world, wounded, retake);
        for _ in 0..3 { world.step(); }
        assert_eq!(world.grips[0][LimbSlot::RightArm as usize],
                   GripState { equipment_slot: None }, "a severed arm took its sword back");
    }

    #[test]
    fn a_severed_left_arm_cannot_hold_its_shield() {
        let mut world = World::new(&fragile_scenario(&[]), 1);
        assert!(world.shield_pose[0].is_some(), "the fixture's fighter carries no shield");
        sever_arm(&mut world, 0, BodyPart::LeftArm);

        assert_eq!(world.grips[0][LimbSlot::LeftArm as usize],
                   GripState { equipment_slot: None });
        assert_eq!(world.shield_pose[0], None, "a severed arm kept a shield pose");
        assert_eq!(world.arm_authority[0][LimbSlot::LeftArm as usize], Fx::ZERO);
        // The sword arm is untouched, which is what makes this a statement
        // about one limb rather than about the body.
        assert!(world.grips[0][LimbSlot::RightArm as usize].equipment_slot.is_some());
        assert!(world.arm_authority[0][LimbSlot::RightArm as usize].is_positive());

        world.retain_contact_entry();
        world.record_contact_locomotion();
        world.resolve_contact();
        let contact = world.contact.as_ref().expect("articulated contact state");
        assert!(!contact.colliders.iter().any(|row| matches!(row.shape, ContactShape::Shield { .. })),
                "a released shield still built a collider");
        // The shield does not come back when the next command says `Keep`:
        // `Keep` reads the grip the release left behind.
        let (wounded, neutral) = (world.id_of(0), world.neutral_core(0));
        submit(&mut world, wounded, neutral);
        world.step();
        assert_eq!(world.shield_pose[0], None, "a dropped shield re-attached itself");
    }

    #[test]
    fn bleeding_can_end_a_fight_after_contact() {
        // A cut that will not close. The wound is written directly because the
        // braced fixture's relative motion is purely along the blade and cuts
        // nothing -- what is under test here is the bleed clock, and the blow
        // that starts it has its own test above.
        let mut world = World::new(&fragile_scenario(&[]), 1);
        world.wounds[1].parts[BodyPart::Torso as usize].wound = Fx::from_int(3);
        world.wounds[1].blood = Fx::from_int(1);
        world.wounds[1].last_attacker = EntityId::new(0, 0);
        assert_eq!(world.outcome(), None);

        let mut blood = world.wounds[1].blood;
        let mut ticks = 0;
        while world.outcome().is_none() {
            world.step();
            ticks += 1;
            assert!(ticks < 5_000, "a bleeding body never finished bleeding");
            if world.alive[1] {
                assert!(world.wounds[1].blood < blood, "a wounded body stopped bleeding");
                blood = world.wounds[1].blood;
            }
        }
        assert_eq!(world.outcome(), Some(Outcome::HeroesWin));
        assert_eq!(world.wounds[1].blood, Fx::ZERO);
        // 1 unit of blood at 3*18 raw a tick, and the tick it reaches zero is
        // the tick it dies on: 65,536/54 rounds up to 1,214.
        assert_eq!(ticks, 1_214);
    }

    #[test]
    fn bleeding_damage_is_credited_to_the_recorded_wound_source() {
        let mut world = World::new(&fragile_scenario(&[]), 1);
        world.wounds[1].parts[BodyPart::Torso as usize].wound = Fx::from_int(3);
        world.wounds[1].last_attacker = EntityId::new(0, 0);
        let before = world.health_of(1);
        for _ in 0..600 { world.step(); }
        let lost = before - world.health_of(1);
        assert!(lost.is_positive(), "600 ticks of bleeding cost no health");
        // Exactly what the query lost, and to the recorded source alone.
        assert_eq!(world.damage_dealt[0], lost);
        assert_eq!(world.damage_dealt[1], Fx::ZERO);

        // `EntityId::NONE` receives no credit, and neither does a stale handle:
        // the source is an identity, not a row.
        let mut orphan = World::new(&fragile_scenario(&[]), 1);
        orphan.wounds[1].parts[BodyPart::Torso as usize].wound = Fx::from_int(3);
        orphan.wounds[1].last_attacker = EntityId::NONE;
        for _ in 0..600 { orphan.step(); }
        assert!(orphan.health_of(1) < before, "the orphaned body stopped bleeding");
        assert_eq!(orphan.damage_dealt, vec![Fx::ZERO; orphan.alive.len()]);
    }

    #[test]
    fn simultaneous_fatal_contacts_kill_both_fighters() {
        // Two mirrored fighters, blades level with each other's torso, both
        // facts landing in one time group off one pre-group anatomy.
        //
        // Only one of the two blows carries energy, and the reason is v2-14's
        // and worth writing down here because it is a hard constraint on any
        // future mutual-kill fixture: a pair that already overlaps at tick
        // start resolves at time zero, where there is no geometric side and the
        // normal rule answers world +X unconditionally. Closing is measured
        // along that normal, so of two mirrored blows exactly one closes and
        // the other separates. The other fighter is therefore killed by the
        // same tick's bleeding, which is the point either way: **death is
        // derived once, after everything the tick did**, so two bodies can die
        // together and neither reaping suppresses the other's blow.
        // Two mirrored fighters: the same geometry both sides, so the pair of
        // facts is symmetric, but a third anatomy row for the far one so only
        // it is scaled down. Both fragile would clamp the near one's open wound
        // to a raw unit and it could no longer bleed at all.
        let mut scenario = fragile_scenario(&[]);
        let mut fragile = crate::fighter_anatomy();
        fragile.id = 3;
        fragile.integrity_maxima = [Fx::from_raw(1); BodyPart::COUNT];
        scenario.combat_specs.as_mut().unwrap().anatomies.push(fragile);
        scenario.units[0].combat_spec.as_mut().unwrap().equipment = [Some(1), None];
        scenario.units[0].loadout = Loadout::single(ActionKind::Sword);
        scenario.units[0].spawn = Vec2::new(Fx::from_int(10), Fx::from_ratio(33, 4));
        scenario.units[1] = UnitSpec {
            faction: Faction::Monsters, spawn: Vec2::from_ints(11, 8),
            combat_spec: Some(UnitSpecV1 { anatomy: 3, equipment: [Some(1), None] }),
            ..scenario.units[0].clone()
        };
        let mut world = World::new(&scenario, 1000);
        brace_weapon(&mut world, 0);
        brace_weapon(&mut world, 1);
        // One raw unit of blood behind a full-depth torso wound: this tick's
        // bleed is 36 raw and empties it, so the near fighter dies of the fight
        // it is already in rather than of an injury invented for the test.
        world.wounds[0].blood = Fx::from_raw(1);
        world.wounds[0].parts[BodyPart::Torso as usize].wound = Fx::from_int(2);
        world.wounds[0].last_attacker = EntityId::new(1, 0);
        resolve_closing(&mut world, &[(0, Fx::ONE), (1, -Fx::ONE)]);

        // Both facts are in one group, and both name a body.
        let bodies: Vec<_> = world.contact_resolutions().iter()
            .filter(|row| row.fact.key.kind == ContactKind::WeaponBody)
            .map(|row| (row.fact.key.a.index, row.group_ordinal)).collect();
        assert_eq!(bodies, vec![(0, 0), (1, 0)], "the fixture stopped being simultaneous");
        assert_eq!(world.wounds[1].parts[BodyPart::Torso as usize].integrity, Fx::ZERO,
                   "the closing blow did not destroy a torso");
        assert_eq!(world.wounds[0].blood, Fx::ZERO, "the bleeding body did not empty");

        assert!(!world.alive[0] && !world.alive[1], "one of two simultaneous deaths survived");
        assert_eq!(world.outcome(), Some(Outcome::MutualDestruction));
        // Both deaths carry their killer, which is the evidence that neither
        // body was reaped before the other's fate was measured.
        let killers: Vec<_> = world.events.iter().filter_map(|event| match event {
            Event::Death { entity, killer } => Some((entity.index, killer.index)),
            _ => None,
        }).collect();
        assert_eq!(killers, vec![(0, 1), (1, 0)]);
    }

    fn cartesian_transport(
        anatomy: &BodyAnatomySpec, limb: usize, entry: ArmState, entry_yaw: Angle,
        next: ArmState, next_yaw: Angle,
    ) -> Result<Vec3, CartesianReject> {
        let old_forward = actuator::hand_position(anatomy, entry_yaw, limb,
            entry.bearing, entry.height, entry.reach);
        let new_forward = actuator::hand_position(anatomy, next_yaw, limb,
            next.bearing, next.height, next.reach);
        let component = |hand: Fx, new: Fx, old: Fx| -> Result<Fx, CartesianReject> {
            let raw = hand.raw() as i64 + new.raw() as i64 - old.raw() as i64;
            if raw < i32::MIN as i64 || raw > i32::MAX as i64 {
                Err(CartesianReject::Overflow)
            } else { Ok(Fx::from_raw(raw as i32)) }
        };
        let requested = Vec3::new(component(entry.hand.x, new_forward.x, old_forward.x)?,
            component(entry.hand.y, new_forward.y, old_forward.y)?,
            component(entry.hand.z, new_forward.z, old_forward.z)?);
        cartesian_hand_clamp(anatomy, next_yaw, limb, requested)
    }

    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    struct CartesianVelocityState { com_velocity: Vec3, active: bool }

    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    enum CartesianMotorReject { NonCanonical, Overflow }

    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    struct CartesianMotorWork {
        before_numerator: i128,
        after_numerator: i128,
        signed_work: i128,
        supplied: i128,
        absorbed: i128,
    }

    fn cartesian_motor_step(
        hand: Vec3, target: Vec3, next_offset: Vec3, body_velocity: Vec3,
        mass_raw: i64, state: CartesianVelocityState,
        max_speed: i32, acceleration: i32,
    ) -> Result<(Vec3, CartesianVelocityState, CartesianMotorWork), CartesianMotorReject> {
        if mass_raw <= 0 { return Err(CartesianMotorReject::NonCanonical); }
        if !state.active {
            return if state.com_velocity == Vec3::ZERO { Ok((hand, state, CartesianMotorWork {
                before_numerator: 0, after_numerator: 0, signed_work: 0,
                supplied: 0, absorbed: 0,
            })) }
                   else { Err(CartesianMotorReject::NonCanonical) };
        }
        if max_speed < 0 || acceleration < 0 { return Err(CartesianMotorReject::NonCanonical); }
        let component = |position: Fx, target: Fx, offset: Fx, com_velocity: Fx|
            -> Result<(Fx, Fx), CartesianMotorReject>
        {
            let error_i64 = target.raw() as i64 - position.raw() as i64;
            if error_i64 < i32::MIN as i64 || error_i64 > i32::MAX as i64 {
                return Err(CartesianMotorReject::Overflow);
            }
            let error = error_i64 as i32;
            let desired_hand = error.clamp(-max_speed, max_speed);
            let desired_com = (desired_hand as i64).checked_add(offset.raw() as i64)
                .ok_or(CartesianMotorReject::Overflow)?;
            let delta_i64 = desired_com - com_velocity.raw() as i64;
            let delta = delta_i64.clamp(-(acceleration as i64), acceleration as i64);
            let next_i64 = com_velocity.raw() as i64 + delta;
            if next_i64 < i32::MIN as i64 || next_i64 > i32::MAX as i64 {
                return Err(CartesianMotorReject::Overflow);
            }
            let free_hand = next_i64.checked_sub(offset.raw() as i64)
                .ok_or(CartesianMotorReject::Overflow)?;
            let position_i64 = position.raw() as i64 + free_hand;
            if position_i64 < i32::MIN as i64 || position_i64 > i32::MAX as i64 {
                Err(CartesianMotorReject::Overflow)
            } else {
                Ok((Fx::from_raw(position_i64 as i32), Fx::from_raw(next_i64 as i32)))
            }
        };
        let (x, vx) = component(hand.x, target.x, next_offset.x, state.com_velocity.x)?;
        let (y, vy) = component(hand.y, target.y, next_offset.y, state.com_velocity.y)?;
        let (z, vz) = component(hand.z, target.z, next_offset.z, state.com_velocity.z)?;
        let next_hand = Vec3::new(x, y, z); let com_velocity = Vec3::new(vx, vy, vz);
        let active = next_hand != target;
        let numerator = |com: Vec3| -> Result<i128, CartesianMotorReject> {
            let mut square = 0i128;
            for (body, relative) in [(body_velocity.x, com.x), (body_velocity.y, com.y),
                                     (body_velocity.z, com.z)] {
                let v = (body.raw() as i128).checked_add(relative.raw() as i128)
                    .ok_or(CartesianMotorReject::Overflow)?;
                square = square.checked_add(v.checked_mul(v)
                    .ok_or(CartesianMotorReject::Overflow)?)
                    .ok_or(CartesianMotorReject::Overflow)?;
            }
            (mass_raw as i128).checked_mul(square).ok_or(CartesianMotorReject::Overflow)
        };
        let before = numerator(state.com_velocity)?; let after = numerator(com_velocity)?;
        let signed = after.checked_sub(before).ok_or(CartesianMotorReject::Overflow)?;
        let mut dot = 0i128;
        for (body, before_component, after_component) in [
            (body_velocity.x, state.com_velocity.x, com_velocity.x),
            (body_velocity.y, state.com_velocity.y, com_velocity.y),
            (body_velocity.z, state.com_velocity.z, com_velocity.z),
        ] {
            let delta = (after_component.raw() as i128)
                .checked_sub(before_component.raw() as i128)
                .ok_or(CartesianMotorReject::Overflow)?;
            let sum = (body.raw() as i128).checked_mul(2)
                .and_then(|value| value.checked_add(after_component.raw() as i128))
                .and_then(|value| value.checked_add(before_component.raw() as i128))
                .ok_or(CartesianMotorReject::Overflow)?;
            dot = dot.checked_add(delta.checked_mul(sum)
                .ok_or(CartesianMotorReject::Overflow)?)
                .ok_or(CartesianMotorReject::Overflow)?;
        }
        let identity = (mass_raw as i128).checked_mul(dot)
            .ok_or(CartesianMotorReject::Overflow)?;
        if identity != signed { return Err(CartesianMotorReject::Overflow); }
        let stored_com_velocity = if active { com_velocity } else { Vec3::ZERO };
        Ok((next_hand, CartesianVelocityState { com_velocity: stored_com_velocity, active }, CartesianMotorWork {
            before_numerator: before, after_numerator: after, signed_work: signed,
            supplied: signed.max(0), absorbed: (-signed).max(0),
        }))
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn grip_change_and_severance_clear_owned_recoil_without_touching_the_other_arm() {
        let mut world = World::new(&Scenario::embodied_duel(), 0);
        world.retain_contact_entry();
        world.arms[0][0].post_contact_active = true;
        world.arms[0][0].post_contact_com_velocity = Vec3::new(
            Fx::from_raw(5), Fx::from_raw(7), Fx::from_raw(-11));
        world.arms[0][1].post_contact_active = true;
        world.arms[0][1].post_contact_com_velocity = Vec3::new(
            Fx::from_raw(2), Fx::from_raw(-1), Fx::from_raw(3));
        let left = world.arms[0][0];
        let mut command = world.neutral_core(0);
        command.grips = [GripRequest::Keep, GripRequest::Release];
        world.command_core[0] = Some(command);
        world.apply_grips();
        assert_eq!(world.arms[0][0], left);
        assert_eq!((world.arms[0][1].post_contact_active,
                    world.arms[0][1].post_contact_com_velocity), (false, Vec3::ZERO));

        world.grips[0][1].equipment_slot = Some(0);
        let scale = world.exact_owners[0].unwrap().common_scale;
        world.exact_owners[0] = Some(world.initial_exact_owner(0, scale));
        world.arms[0][1].post_contact_active = true;
        world.arms[0][1].post_contact_com_velocity = Vec3::X;
        world.wounds[0].parts[BodyPart::RightArm as usize].severed = true;
        world.release_severed_grips();
        assert_eq!((world.grips[0][1].equipment_slot, world.arms[0][1].post_contact_active,
                    world.arms[0][1].post_contact_com_velocity), (None, false, Vec3::ZERO));
    }

    #[test]
    fn cartesian_hand_clamp_is_identity_interior_and_projects_exact_boundaries() {
        let world = World::new(&Scenario::embodied_duel(), 0);
        let anatomy = world.anatomy_spec(0).unwrap(); let yaw = Angle::ZERO;
        let shoulder = actuator::shoulder(anatomy, yaw, 1);
        assert_eq!((shoulder.x.raw(), shoulder.y.raw(), shoulder.z.raw()), (0, -16_384, 91_750));
        assert_eq!((anatomy.arm_length.raw(), anatomy.standing_height.raw()), (49_152, 117_964));
        let interior = Vec3::new(Fx::from_raw(32_768), Fx::from_raw(-16_384), Fx::from_raw(49_152));
        assert_eq!(cartesian_hand_clamp(anatomy, yaw, 1, interior), Ok(interior));
        let beyond = Vec3::new(Fx::from_raw(49_153), Fx::from_raw(-16_384), Fx::from_raw(117_965));
        let outer = Vec3::new(Fx::from_raw(49_152), Fx::from_raw(-16_384), Fx::from_raw(117_964));
        assert_eq!(cartesian_hand_clamp(anatomy, yaw, 1, beyond), Ok(outer));
        assert_eq!(cartesian_hand_clamp(anatomy, yaw, 1, outer), Ok(outer));
        let centre = Vec3::new(Fx::ZERO, Fx::from_raw(-16_384), Fx::from_raw(49_152));
        assert_eq!(cartesian_hand_clamp(anatomy, yaw, 1, centre),
                   Err(CartesianReject::AmbiguousDirection));
        assert_eq!(cartesian_hand_clamp(anatomy, yaw, 1,
            Vec3::new(Fx::MAX, Fx::MAX, Fx::ZERO)), Err(CartesianReject::Overflow));
        let inside = Vec3::new(Fx::from_raw(12_287), Fx::from_raw(-16_384), Fx::from_raw(-1));
        let inner = Vec3::new(Fx::from_raw(12_288), Fx::from_raw(-16_384), Fx::ZERO);
        assert_eq!(cartesian_hand_clamp(anatomy, yaw, 1, inside), Ok(inner));
        assert_eq!(cartesian_hand_clamp(anatomy, yaw, 1, inner), Ok(inner));
        let diagonal = Vec3::new(Fx::from_raw(32), Fx::from_raw(-16_352), Fx::ZERO);
        assert_eq!(cartesian_hand_clamp(anatomy, yaw, 1, diagonal),
                   Err(CartesianReject::UnrepresentableBoundary));
        assert_ne!(anatomy.arm_length, Fx::ONE,
                   "a unit arm would not distinguish physical radius from reach fraction");
    }

    #[test]
    fn cartesian_transport_preserves_residual_at_idle_and_moves_yaw_once() {
        let world = World::new(&Scenario::embodied_duel(), 0);
        let anatomy = world.anatomy_spec(0).unwrap(); let mut contacted = world.arms[0][1];
        contacted.bearing = Angle::ZERO; contacted.height = crate::CombatHeight::MID;
        contacted.reach = Fx::from_ratio(1, 2);
        let old_forward = actuator::hand_position(anatomy, Angle::ZERO, 1,
            contacted.bearing, contacted.height, contacted.reach);
        assert_eq!((old_forward.x.raw(), old_forward.y.raw(), old_forward.z.raw()),
                   (24_576, -16_384, 58_982));
        let residual = Vec3::new(Fx::from_raw(97), Fx::from_raw(41), Fx::from_raw(13));
        contacted.hand = old_forward + residual;
        assert_eq!(cartesian_transport(anatomy, 1, contacted, Angle::ZERO,
            contacted, Angle::ZERO), Ok(contacted.hand));
        let next_yaw = Angle::QUARTER;
        let moved = cartesian_transport(anatomy, 1, contacted, Angle::ZERO,
            contacted, next_yaw).unwrap();
        let new_forward = actuator::hand_position(anatomy, next_yaw, 1,
            contacted.bearing, contacted.height, contacted.reach);
        assert_eq!((new_forward.x.raw(), new_forward.y.raw(), new_forward.z.raw()),
                   (40_960, 0, 58_982));
        assert_eq!((moved.x.raw(), moved.y.raw(), moved.z.raw()), (41_057, 41, 58_995));
        assert_eq!(moved - new_forward, contacted.hand - old_forward,
                   "yaw transport changed the Cartesian contact residual");
        let velocity = moved - contacted.hand;
        assert_eq!((velocity.x.raw(), velocity.y.raw(), velocity.z.raw()),
                   (16_384, 16_384, 0));
    }

    #[test]
    fn explicit_post_contact_com_velocity_reconciles_with_exact_work() {
        let hand = Vec3::ZERO;
        let target = Vec3::new(Fx::from_raw(1_000), Fx::ZERO, Fx::ZERO);
        let offset = Vec3::new(Fx::from_raw(197), Fx::from_raw(3_768), Fx::ZERO);
        let state = CartesianVelocityState {
            com_velocity: Vec3::new(Fx::from_raw(2), Fx::from_raw(-1), Fx::ZERO), active: true,
        };
        let (hand, state, work) = cartesian_motor_step(hand, target, offset, Vec3::ZERO,
            81_264, state, 2_000, 100).unwrap();
        assert_eq!((hand.x.raw(), hand.y.raw(), state.com_velocity.x.raw(),
                    state.com_velocity.y.raw(), state.active), (-95, -3_669, 102, 99, true));
        assert_eq!(work, CartesianMotorWork {
            before_numerator: 406_320, after_numerator: 1_641_939_120,
            signed_work: 1_641_532_800, supplied: 1_641_532_800, absorbed: 0,
        });
        let (_, unchanged, zero_work) = cartesian_motor_step(hand, target, offset, Vec3::ZERO,
            81_264, state, 2_000, 0).unwrap();
        assert_eq!(unchanged.com_velocity, state.com_velocity,
                   "zero effort/acceleration changed equipment COM momentum");
        assert_eq!(zero_work.signed_work, 0);
        let (captured, cleared, capture_work) = cartesian_motor_step(Vec3::ZERO,
            Vec3::new(Fx::from_raw(10), Fx::ZERO, Fx::ZERO),
            Vec3::new(Fx::from_raw(3), Fx::ZERO, Fx::ZERO), Vec3::ZERO, 1,
            CartesianVelocityState { com_velocity: Vec3::ZERO, active: true }, 100, 20).unwrap();
        assert_eq!(captured, Vec3::new(Fx::from_raw(10), Fx::ZERO, Fx::ZERO));
        assert_eq!(cleared, CartesianVelocityState { com_velocity: Vec3::ZERO, active: false });
        assert_eq!(capture_work.signed_work, 169,
                   "clearing hid the final motor interval's supplied work");
    }

    #[test]
    fn explicit_post_contact_com_velocity_is_axis_permutation_equivariant() {
        let solve = |swap: bool| {
            let swap_vec = |v: Vec3| if swap { Vec3::new(v.y, v.x, v.z) } else { v };
            let hand = swap_vec(Vec3::new(Fx::from_raw(300), Fx::from_raw(-700), Fx::ZERO));
            let target = swap_vec(Vec3::new(Fx::from_raw(-100), Fx::from_raw(200), Fx::ZERO));
            let offset = swap_vec(Vec3::new(Fx::from_raw(17), Fx::from_raw(-31), Fx::ZERO));
            let state = CartesianVelocityState { com_velocity:
                swap_vec(Vec3::new(Fx::from_raw(500), Fx::from_raw(-200), Fx::ZERO)), active: true };
            let (next, state, work) = cartesian_motor_step(hand, target, offset, Vec3::ZERO,
                81_264, state, 600, 75).unwrap();
            (swap_vec(next), CartesianVelocityState { com_velocity: swap_vec(state.com_velocity),
                                                       active: state.active }, work)
        };
        assert_eq!(solve(false), solve(true));
    }

    #[test]
    fn inactive_post_contact_state_is_canonical_and_never_moves_the_hand() {
        let hand = Vec3::new(Fx::from_raw(7), Fx::from_raw(-9), Fx::from_raw(11));
        let target = Vec3::ZERO;
        assert_eq!(cartesian_motor_step(hand, target, CartesianVelocityState {
            com_velocity: Vec3::ZERO, active: false,
        }.com_velocity, Vec3::ZERO, 1, CartesianVelocityState {
            com_velocity: Vec3::ZERO, active: false,
        }, 100, 10), Ok((hand, CartesianVelocityState {
            com_velocity: Vec3::ZERO, active: false,
        }, CartesianMotorWork { before_numerator: 0, after_numerator: 0,
             signed_work: 0, supplied: 0, absorbed: 0 })));
        assert_eq!(cartesian_motor_step(hand, target, Vec3::ZERO, Vec3::ZERO, 1,
            CartesianVelocityState { com_velocity: Vec3::X, active: false }, 100, 10),
            Err(CartesianMotorReject::NonCanonical));
        assert_eq!(cartesian_motor_step(Vec3::new(Fx::MIN, Fx::ZERO, Fx::ZERO),
            Vec3::new(Fx::MAX, Fx::ZERO, Fx::ZERO), Vec3::ZERO, Vec3::ZERO, 1,
            CartesianVelocityState { com_velocity: Vec3::ZERO, active: true }, 100, 10),
            Err(CartesianMotorReject::Overflow));
    }
}
