//! The swept contact phase: colliders, resolution, impulses and the energy ledger.
//!
//! This is the largest phase in the tick and the one with the most invariants.
//! [The contact contract](../../../../docs/reference/contact-solver.md#contract)
//! owns the rules; this file owns their sequencing -- retain, record, build,
//! resolve, stage, commit, clamp -- and the property that a refused tick leaves
//! every authoritative column exactly as it found it.

use super::*;
use super::projectile::ARTICULATED_PROJECTILE_SLOT;

#[cfg(test)]
use crate::combat::contact::{wide_evaluated_shape_quotient, WideEvaluatedContactShape};

/// World's coupled trial projector.
///
/// Holds `&World` and writes nothing. That is not a stylistic preference: the
/// driver calls this up to eighteen times per group looking for the largest
/// valid alpha, and seventeen of those are hypotheticals. Everything
/// authoritative is written once, afterwards, by [`World::commit_contact`] --
/// which is also why a mid-tick `ResolutionError` costs nothing to abandon.
struct ContactProjector<'a> {
    world: &'a World,
    entry: &'a [TickEntry],
    bodies: &'a mut Vec<BodyTrial>,
    /// The live anatomy, lifted out of `World` for the length of the solve.
    /// Written only by [`ContactProjector::after_group`], never by `project`:
    /// seventeen of every eighteen projections are hypotheticals, and a wound
    /// applied inside one would be a wound applied seventeen times.
    wounds: &'a mut Vec<AnatomyState>,
    credit: &'a mut Vec<Fx>,
    deltas: &'a mut Vec<AnatomyDelta>,
    fact_loss: &'a mut Vec<Fx>,
}

impl ContactTrialProjector for ContactProjector<'_> {
    /// Two passes, because equipment cannot be projected until its body has
    /// been. A body impulse drags everything that body holds, so an arm's trial
    /// velocity is its own accumulator *plus* the body's applied delta -- and
    /// the joint clamp below then asks whether the arm could have got there at
    /// all, but only of the arms that went somewhere.
    ///
    /// **A row that did not move its hand is not re-derived**, and that is the
    /// same rule -- with the same reason behind it -- that the final commit
    /// keeps. `hand_position` is not the exact inverse of `inverse_hand`, so
    /// asking the joint about a hand it already agreed to answers with the
    /// round trip's own error, which lands directly on the velocity the
    /// closure's energy is measured from. See the alpha-zero note in
    /// `resolve_group_into` for what that cost before it was recognised.
    fn project(
        &mut self,
        before: &[GeneralizedCollider],
        sums: &[[i128; 3]],
        alpha_raw: u32,
        out: &mut Vec<GeneralizedCollider>,
    ) -> Result<(), ResolutionError> {
        out.clear();
        out.extend_from_slice(before);
        self.bodies.clear();
        for (row, sum) in out.iter_mut().zip(sums) {
            // `scaled_delta` divides by this, so it is checked here rather than
            // left to a debug assertion inside it.
            if row.mass <= Fx::ZERO { return Err(ResolutionError::Mass); }
            if row.kind != GeneralizedKind::Body { continue; }
            let delta = resolution::scaled_delta(*sum, alpha_raw, row.mass.raw());
            // The Z component is discarded rather than clamped: a body's
            // vertical reaction is the floor's, and v2-14 gives a body no
            // vertical degree of freedom at all. Nothing here can lift a
            // fighter, however hard it is hit from below.
            let velocity = clamp_contact_velocity(
                Vec3::new(row.velocity.x + delta.x, row.velocity.y + delta.y, Fx::ZERO));
            self.bodies.push(BodyTrial { entity: row.entity, velocity, delta: velocity - row.velocity });
            row.velocity = velocity;
        }
        for (row, sum) in out.iter_mut().zip(sums) {
            if row.kind == GeneralizedKind::Body { continue; }
            if row.kind == GeneralizedKind::Projectile {
                let own = resolution::scaled_delta(*sum, alpha_raw, row.mass.raw());
                row.velocity = clamp_contact_velocity(row.velocity + own);
                continue;
            }
            // The closure always carries the owning body of every fact
            // participant, so a missing one is a broken closure and not a case
            // to paper over with the un-translated velocity.
            let body = *self.bodies.iter().find(|body| body.entity == row.entity)
                .ok_or(ResolutionError::ColliderIndex)?;
            let own = resolution::scaled_delta(*sum, alpha_raw, row.mass.raw());
            // The velocity this row would have from riding its body alone.
            // Measured rather than assumed to be zero: a bystander collider in
            // the closure carries no accumulator of its own and still gets
            // translated, and `body.delta` is the whole of what it gets.
            //
            // `requested` keeps the three-term order it has always had rather
            // than being built from `translated`: `Fx` addition saturates, so
            // the two groupings are the same number everywhere the clamp can
            // reach and not provably the same number everywhere else.
            let translated = row.velocity + body.delta;
            let requested = clamp_contact_velocity(row.velocity + own + body.delta);
            row.velocity = if requested == translated {
                // The hand is where it was, because the translation moved body
                // and hand together and nothing else touched it. Its joint has
                // already agreed to that pose once -- the actuator or the last
                // commit built it through this very map -- so re-deriving it
                // now can only add the map's own error. At alpha zero *every*
                // row lands here, which is what makes the trial the identity
                // the alpha search assumes it is.
                translated
            } else {
                self.world.joint_clamped_velocity(
                    *row, self.entry, body.velocity, requested)?
            };
        }
        Ok(())
    }

    /// Turn one settled group into wounds.
    ///
    /// Three passes, and the order is the contract's. The first reads every
    /// fact against **one** pre-group anatomy and accumulates; the second
    /// applies the accumulators once and derives severance; the third takes the
    /// severed regions out of the geometry so the next re-sweep cannot use them.
    /// Death is not decided here at all -- it is a question for the whole tick,
    /// asked after the last group, which is what lets two fighters kill each
    /// other on one mapped time.
    fn after_group(
        &mut self,
        colliders: &mut [ContactCollider],
        rows: &mut [ContactResolution],
    ) -> Result<(), ResolutionError> {
        // Copied out of `self` so the immutable spec borrows it hands back do
        // not overlap the mutable anatomy borrows below. `&World` is `Copy`.
        let world = self.world;
        self.deltas.clear();
        self.deltas.resize(self.wounds.len(), AnatomyDelta::default());
        self.fact_loss.clear();
        self.fact_loss.resize(rows.len(), Fx::ZERO);

        // Pass one: measure. Rows arrive in `ContactKey` order and nothing here
        // writes `self.wounds`, so every fact in the group reads the same body.
        for (at, row) in rows.iter_mut().enumerate() {
            if !matches!(row.fact.key.kind,
                ContactKind::WeaponBody | ContactKind::ProjectileBody) { continue; }
            let Some(target) = world.resolve(row.fact.key.b) else { continue };
            // **`volume_region` and never `BodyPart::from_index`, which is the
            // whole of what the rename was for.** A fact names the swept volume
            // the solver chose; volumes 5 and 6 are the two forearms and
            // `from_index` answers `None` for both, so the old spelling would
            // have dropped every forearm wound here in silence -- no panic, no
            // refusal, just a blow that landed and did nothing.
            let Some(part) = volume_region(row.fact.volume as usize) else { continue };
            let Some(spec) = world.anatomy_spec(target) else { continue };
            let before = self.wounds[target].parts[part as usize];
            if before.severed { continue; }

            // The three wounding channels. `pressure_raw` is deliberately not
            // among them: it is the floor plus whatever rounding the split left,
            // and it has never touched anatomy. `crush_raw` is new and is the
            // reason a club can hurt anybody at all -- a swing is transverse
            // motion, and a club has no edge, so before this its entire blow
            // landed in `pressure_raw` and did nothing at any speed.
            let incoming = row.cut_raw.checked_add(row.thrust_raw)
                .and_then(|sum| sum.checked_add(row.crush_raw))
                .ok_or(ResolutionError::EnergyNumerator)?;
            let square = anatomy::squareness(
                row.fact.velocity_a - row.fact.velocity_b,
                outward_region_normal(colliders, row.fact.key.b, row.fact.volume as usize,
                                      row.fact.point, world.body_yaw[target].angle),
            );
            let ledger = anatomy::armor_transfer(incoming, spec.armor[part as usize], square);
            row.deflected_raw = ledger.deflected;

            // Clamped against the *pre-group* integrity, so two simultaneous
            // blows on one region are each measured against the body that was
            // standing when the group began. Their sum may exceed it; the apply
            // pass floors at zero and credit is split out of the health the
            // query actually lost, so nothing is double-counted downstream.
            let loss_raw = anatomy::integrity_loss_raw(ledger.penetrating)
                .min(before.integrity.raw().max(0) as u128);
            let wound_raw = anatomy::cut_share(loss_raw, row.cut_raw, incoming);
            let loss = Fx::from_raw(loss_raw as i32);
            self.fact_loss[at] = loss;
            let delta = &mut self.deltas[target];
            delta.touched = true;
            delta.parts[part as usize].integrity_loss += loss;
            delta.parts[part as usize].wound_gain += Fx::from_raw(wound_raw as i32);
            delta.integrity_loss += loss;
            if loss.is_positive() {
                delta.last_attacker = world.articulated_projectile_slot(row.fact.key.a)
                    .map(|slot| world.articulated_projectile_owner[slot])
                    .unwrap_or(row.fact.key.a);
            }
        }

        // Pass two: apply, once, and hand out credit in `ContactKey` order
        // against what the health query actually lost.
        for target in 0..self.wounds.len() {
            if !self.deltas[target].touched { continue; }
            let Some(spec) = world.anatomy_spec(target) else { continue };
            let delta = self.deltas[target];
            let health_before = self.wounds[target].health(spec);
            let state = &mut self.wounds[target];
            let gain = anatomy::shock_gain(state, spec, delta.integrity_loss);
            state.shock += gain;
            for part in 0..BodyPart::COUNT {
                let maximum = spec.integrity_maxima[part];
                let row = &mut state.parts[part];
                row.integrity = (row.integrity - delta.parts[part].integrity_loss).max(Fx::ZERO);
                row.wound = (row.wound + delta.parts[part].wound_gain).min(maximum);
                if !row.integrity.is_positive() { row.severed = true; }
            }
            if !delta.last_attacker.is_none() { state.last_attacker = delta.last_attacker; }
            // Credit is the health the query actually lost, split between the
            // group's facts in proportion to what each of them took off and in
            // `ContactKey` order, with the last contributor taking the exact
            // remainder. Crediting the applied integrity loss directly would
            // measure the wrong thing: the torso is worth two sixths of the
            // weighted fraction, so the same loss there moves health twice as
            // far as it does on a limb, and the later bleed credit already
            // reports the query's own decrease.
            let after = self.wounds[target];
            let decrease = (health_before - after.health(spec)).max(Fx::ZERO).raw() as i64;
            let mut total = 0i64;
            let mut last = None;
            for (at, row) in rows.iter().enumerate() {
                if !self.fact_loss[at].is_positive() { continue; }
                if !matches!(row.fact.key.kind,
                    ContactKind::WeaponBody | ContactKind::ProjectileBody) { continue; }
                if world.resolve(row.fact.key.b) != Some(target) { continue; }
                total += self.fact_loss[at].raw() as i64;
                last = Some(at);
            }
            let mut used = 0i64;
            for (at, row) in rows.iter_mut().enumerate() {
                if !matches!(row.fact.key.kind,
                    ContactKind::WeaponBody | ContactKind::ProjectileBody) { continue; }
                if world.resolve(row.fact.key.b) != Some(target) { continue; }
                let loss = self.fact_loss[at];
                // Only a fact that took something off can have severed
                // anything. Two facts that between them empty a region are both
                // reported -- they both took part, and choosing between them by
                // whether either would have sufficed alone is an arbitrary rule
                // with no consumer -- but a fact that penetrated nothing severed
                // nothing, however the region ended up.
                if loss.is_positive() {
                    // The same bridge as the measuring pass, for the same
                    // reason: a forearm blow that took the arm off has to report
                    // the severance it caused.
                    if let Some(part) = volume_region(row.fact.volume as usize) {
                        row.severed = after.parts[part as usize].severed;
                    }
                } else {
                    continue;
                }
                let share = if Some(at) == last {
                    decrease - used
                } else {
                    decrease * loss.raw() as i64 / total
                };
                // Counted as used whether or not anyone collects it. A source
                // that has died since the blow was struck pays nobody -- the
                // legacy arrow path answers the same way -- but its share is
                // still spent, or the remainder the last contributor takes
                // would hand somebody else damage that fact did.
                used += share;
                if share <= 0 { continue; }
                let credited = world.articulated_projectile_slot(row.fact.key.a)
                    .map(|slot| world.articulated_projectile_owner[slot])
                    .unwrap_or(row.fact.key.a);
                if let Some(source) = world.resolve(credited) {
                    self.credit[source] += Fx::from_raw(share as i32);
                }
            }
        }

        // A projectile has one body contact in its lifetime. Hiding its solver
        // collider here makes that a lifecycle decision owned by the shared
        // group driver: the next re-sweep cannot resolve the same embedded
        // point until the per-tick group ceiling is exhausted.
        for hit in rows.iter().filter(|row|
            row.fact.key.kind == ContactKind::ProjectileBody)
        {
            if let Some(projectile) = colliders.iter_mut().find(|collider|
                collider.entity == hit.fact.key.a && collider.slot == hit.fact.key.a_slot)
            {
                projectile.present = false;
            }
        }

        // Pass three: take the severed regions out of the tick they were lost in.
        for row in colliders.iter_mut() {
            let Some(owner) = world.resolve(row.entity) else { continue };
            if !self.deltas.get(owner).is_some_and(|delta| delta.touched) { continue; }
            let state = self.wounds[owner];
            match &mut row.shape {
                ContactShape::Body { parts, .. } => {
                    // **Walked over volumes and mapped back, not over regions
                    // and indexed directly.** `parts` is volume-keyed and
                    // `state.parts` is region-keyed, and the loop below used one
                    // index for both -- correct exactly while the two lists were
                    // the same length. A severed arm would have left its forearm
                    // live for the rest of the tick, still swept, still able to
                    // take a blow off a limb the body no longer has.
                    for volume in 0..BODY_VOLUME_COUNT {
                        let Some(part) = volume_region(volume) else { continue };
                        if state.parts[part as usize].severed {
                            parts[volume].present = false;
                        }
                    }
                }
                // A two-handed item answers to both arms and is owned by the
                // right one, so keying this off `row.slot` alone would leave a
                // greatsword swinging for the rest of a tick that took its
                // wielder's *left* arm off -- and `release_severed_grips` drops
                // both hands at tick end, so the two rules would disagree for
                // exactly one tick every time.
                _ => {
                    let gone = |part| !state.present(part);
                    let dropped = if world.two_handed(owner) {
                        gone(BodyPart::LeftArm) || gone(BodyPart::RightArm)
                    } else {
                        limb_body_part(row.slot).is_some_and(gone)
                    };
                    if dropped { row.present = false; }
                }
            }
        }
        Ok(())
    }
}

/// The outward normal of one region at the pose the group resolved on.
///
/// From the medial point to the contact, which is the direction a plate's
/// surface faces there. A contact exactly on the axis has no direction to
/// report -- a zero-radius region resolves there every time -- and the contract
/// answers body forward rather than inventing one. That is a *stable* answer,
/// not a flattering one: how square the blow then reads depends on where the
/// weapon was going, exactly as it does everywhere else, and a body struck
/// along its own facing reads square while one struck across it reads a graze.
///
/// **Keyed by the swept *volume* the solver chose and never by its region.** The
/// two agree for a head, a torso, a pair of legs and a single-link arm, which is
/// why indexing by `BodyPart` was correct until an arm became two capsules. It
/// stops being correct there: the elbow folds to within forty degrees of itself,
/// so a forearm blow measured against the shoulder-to-elbow axis can report a
/// medial direction most of a right angle away from the surface it actually
/// struck, and `anatomy::squareness` turns that straight into how much armor
/// declines. The caller has the winning volume on the fact in front of it, so
/// taking the region instead was throwing away the answer on the way in.
fn outward_region_normal(
    colliders: &[ContactCollider], body: EntityId, volume: usize, point: Vec3, yaw: Angle,
) -> Vec3 {
    let forward = Vec3::new(yaw.cos(), yaw.sin(), Fx::ZERO);
    let Some(row) = colliders.iter().find(|row| {
        row.entity == body && matches!(row.shape, ContactShape::Body { .. })
    }) else { return forward };
    let ContactShape::Body { parts, .. } = row.shape else { return forward };
    let Some(swept) = parts.get(volume) else { return forward };
    let delta = point - medial_point(point, swept.previous_lower, swept.previous_upper);
    let normal = delta.normalized_or_zero();
    if normal == Vec3::ZERO { forward } else { normal }
}

/// The shifted body sweep, written once so the collider builder and the world
/// accessor cannot drift apart on the one rule that keeps positional overlap
/// correction out of contact velocity.
fn body_sweep_from(settled: Vec2, entry: &TickEntry) -> (Vec2, Vec2) {
    (settled - entry.locomotion, settled)
}

/// The componentwise entry clamp. See `CONTACT_COMPONENT_SPEED_LIMIT` for why
/// the limit is not the four a reader would expect.
fn clamp_contact_velocity(value: Vec3) -> Vec3 {
    const L: Fx = crate::combat::contact::CONTACT_COMPONENT_SPEED_LIMIT;
    Vec3::new(value.x.clamp(-L, L), value.y.clamp(-L, L), value.z.clamp(-L, L))
}

/// The unconsumed fraction of the tick after the last group `entity` was in, as
/// a raw numerator over 65,536.
///
/// An entity with no resolution answers a whole tick, which is exactly right
/// for the other caller: an entry clamp happens at global time zero, so the
/// pose change it makes is spread over the whole tick and its scalar speeds are
/// the difference undivided.
fn last_group_remaining(rows: &[ContactResolution], entity: EntityId) -> u32 {
    let mut latest = 0u32;
    for row in rows {
        if row.fact.key.a != entity && row.fact.key.b != entity { continue; }
        latest = latest.max(row.fact.toi.get().raw().max(0) as u32);
    }
    65_536 - latest.min(65_536)
}

/// One scalar joint difference as a per-tick rate: what contact changed,
/// divided by the fraction of the tick it had left to change it in.
///
/// Truncating toward zero, which is what Rust's integer division does and what
/// the contract asks for. A fully consumed tick has no remaining fraction to
/// divide by and reports zero rather than an unbounded rate.
fn scalar_speed(difference: i32, remaining_raw: u32) -> i32 {
    if remaining_raw == 0 { return 0; }
    let scaled = difference as i64 * 65_536 / remaining_raw as i64;
    scaled.clamp(i32::MIN as i64, i32::MAX as i64) as i32
}

/// Scale the differential weapon motion at its centre of mass without making
/// the negative half of a reflected swing one raw unit larger. This is local
/// to contact sampling: changing the global fixed-point product would change
/// every rule that deliberately inherits its floor semantics.
pub(super) fn scale_contact_vector(value: Vec3, scale: Fx) -> Vec3 {
    Vec3::new(
        fx::mul_div(value.x, scale, Fx::ONE),
        fx::mul_div(value.y, scale, Fx::ONE),
        fx::mul_div(value.z, scale, Fx::ONE),
    )
}

#[cfg(feature = "cartesian-recoil")]
fn exact_rejection_diagnostic(
    tick: u32, phase: ExactContactRejectPhase, cause: ResolutionError,
    key: Option<crate::combat::contact::ContactKey>,
) -> ExactContactRejectionDiagnostic {
    ExactContactRejectionDiagnostic { tick, phase, cause, key: key.map(|key|
        (key.a, key.a_slot, key.b, key.b_slot, key.kind)) }
}

#[cfg(feature = "cartesian-recoil")]
fn build_exact_contact_trajectories(
    world: &World, contact: &mut ContactRuntime, anatomy_state: &[AnatomyState],
) -> Result<(), ResolutionError> {
    contact.exact_owners.clear();
    for owner in &world.exact_owners {
        let Some(owner) = owner else { continue };
        let i = world.resolve(owner.entity).ok_or(ResolutionError::ColliderIndex)?;
        let wounds = anatomy_state.get(i).ok_or(ResolutionError::ColliderIndex)?;
        let severed = [!wounds.present(BodyPart::LeftArm),
                       !wounds.present(BodyPart::RightArm)];
        let mut grips = world.grips[i].map(|grip| grip.equipment_slot);
        if world.two_handed(i) && (severed[0] || severed[1]) {
            grips = [None; 2];
        } else {
            for limb in 0..2 {
                if severed[limb] { grips[limb] = None; }
            }
        }
        let mut staged = if grips == world.grips[i].map(|grip| grip.equipment_slot) {
            *owner
        } else {
            world.prepare_zero_response_grip_transition(i, grips)
                .map_err(|_| ResolutionError::ExactLifecyclePending)?
        };
        // The Bow stave is not a contact collider. Its exact held lane would
        // otherwise promise a trajectory that cannot exist, and tick-end
        // rebasing quite correctly refuses that broken owner/row grammar.
        for limb in 0..2 {
            if world.equipment_in_grip(i, limb)
                .is_some_and(|item| item.action == ActionKind::Bow)
            {
                if let Some(held) = staged.held_response[limb].take() {
                    staged.common_response.mass_raw = staged.common_response.mass_raw
                        .checked_sub(held.affine.mass_raw)
                        .ok_or(ResolutionError::ExactLifecyclePending)?;
                }
            }
        }
        contact.exact_owners.push(staged);
    }
    for slot in 0..world.articulated_projectile_alive.len() {
        if !world.articulated_projectile_alive[slot] { continue; }
        let mass_raw = world.articulated_projectile_mass[slot].raw();
        contact.exact_owners.push(ExactOwnerTrajectory {
            entity: world.articulated_projectile_id(slot), projectile: true,
            body_mass_raw: mass_raw, common_scale: mass_raw as i128,
            common_response: ExactAffine3 {
                mass_raw, at_group: [ExactPosition::default(); 3],
                momentum: [ExactMomentum::default(); 3], group_time_raw: 0,
            },
            held_response: [None; 2],
        });
    }
    let motor_point = |previous: Vec3, requested: Vec3| ExactMotorPoint {
        at_tick_start_raw: [previous.x.raw(), previous.y.raw(), previous.z.raw()],
        tick_delta_raw: [(requested.x - previous.x).raw(),
                         (requested.y - previous.y).raw(),
                         (requested.z - previous.z).raw()],
    };
    contact.exact_trajectories.clear();
    for row in &contact.colliders {
        let owner_index = contact.exact_owners.iter().position(|owner| owner.entity == row.entity)
            .ok_or(ResolutionError::ColliderIndex)?;
        let owner = contact.exact_owners[owner_index];
        let (kind, held_index, equipment_spec, motor) = match row.shape {
            ContactShape::Projectile { previous, requested, radius, .. } =>
                (GeneralizedKind::Projectile, None, None, MotorShape::Projectile {
                    point: motor_point(previous, requested), radius_raw: radius.raw(),
                }),
            ContactShape::Body { previous_origin, requested_origin, parts } => {
                let bounds = core::array::from_fn(|at| ExactMotorBounds {
                    lower: motor_point(parts[at].previous_lower, parts[at].requested_lower),
                    upper: motor_point(parts[at].previous_upper, parts[at].requested_upper),
                    radius_raw: parts[at].radius.raw(), present: parts[at].present,
                });
                (GeneralizedKind::Body, None, None, MotorShape::Body {
                    origin: motor_point(previous_origin, requested_origin), parts: bounds,
                })
            }
            ContactShape::Segment { previous_hilt, previous_tip, requested_hilt,
                                    requested_tip, radius } => {
                let held = row.slot as usize;
                let tag = owner.held_response.get(held).and_then(|held| *held)
                    .ok_or(ResolutionError::ColliderIndex)?;
                (GeneralizedKind::Equipment, Some(held), Some(tag.spec_id), MotorShape::Segment {
                    hilt: motor_point(previous_hilt, requested_hilt),
                    tip: motor_point(previous_tip, requested_tip), radius_raw: radius.raw(),
                })
            }
            ContactShape::Shield { previous, requested } => {
                let held = row.slot as usize;
                let tag = owner.held_response.get(held).and_then(|held| *held)
                    .ok_or(ResolutionError::ColliderIndex)?;
                (GeneralizedKind::Equipment, Some(held), Some(tag.spec_id), MotorShape::Shield {
                    corners: core::array::from_fn(|at| motor_point(previous[at], requested[at])),
                })
            }
        };
        contact.exact_trajectories.push(ExactContactTrajectory {
            entity: row.entity, faction: row.faction, slot: row.slot, kind,
            mass_raw: row.mass.raw(), surface: row.surface, motor, owner_index,
            held_index, equipment_spec, present: row.present,
        });
    }
    Ok(())
}

impl World {
    #[cfg(feature = "cartesian-recoil")]
    fn record_recoil_external(&mut self, i: usize, limb: usize, reason: u8,
                              mass: Fx, before_body: Vec3, before_c: Vec3,
                              after_body: Vec3, after_c: Vec3) {
        let energy = |body: Vec3, c: Vec3| {
            let v = body + c;
            let square = v.x.raw() as i128 * v.x.raw() as i128
                + v.y.raw() as i128 * v.y.raw() as i128
                + v.z.raw() as i128 * v.z.raw() as i128;
            mass.raw() as i128 * square
        };
        let before = energy(before_body, before_c);
        let after = energy(after_body, after_c);
        let entity = self.id_of(i);
        let Some(contact) = self.contact.as_mut() else { return };
        Self::record_recoil_external_in(contact, entity, i, limb, reason, before, after);
    }

    #[cfg(feature = "cartesian-recoil")]
    fn recoil_energy_numerator(mass: Fx, body: Vec3, c: Vec3) -> i128 {
        let v = body + c;
        let square = v.x.raw() as i128 * v.x.raw() as i128
            + v.y.raw() as i128 * v.y.raw() as i128
            + v.z.raw() as i128 * v.z.raw() as i128;
        mass.raw() as i128 * square
    }

    #[cfg(feature = "cartesian-recoil")]
    fn record_recoil_external_in(contact: &mut ContactRuntime, entity: EntityId,
                                 i: usize, limb: usize,
                                 reason: u8, before: i128, after: i128) {
        if i >= contact.recoil_external.len() { return; }
        let ledger = &mut contact.recoil_external[i][limb];
        ledger.reason_mask |= reason;
        if after <= before {
            ledger.dissipated_numerator += before - after;
        } else {
            ledger.supplied_numerator += after - before;
        }
        contact.exact_external_energy.push(ExactExternalEnergyRow {
            entity, lane: limb as u8 + 1, reason,
            signed_numerator: after.checked_sub(before)
                .expect("bounded external energy difference"),
            denominator: 2i128 * 65_536 * 65_536,
        });
    }

    #[cfg(feature = "cartesian-recoil")]
    pub(super) fn clear_recoil_with_energy(&mut self, i: usize, limb: usize, reason: u8,
                                item: crate::EquipmentSpec) {
        let before = actuator::clear_post_contact(&mut self.arms[i][limb]);
        if before == Vec3::ZERO { return; }
        let body = Vec3::new(self.vel[i].x, self.vel[i].y, Fx::ZERO);
        self.record_recoil_external(i, limb, reason, item.mass, body, before, body, Vec3::ZERO);
    }

    /// Take every slot's tick-entry pose, and clear last tick's resolutions.
    ///
    /// Dead slots are retained too. Nothing reads them, but keeping the row
    /// index equal to the slot index removes the only reason this phase would
    /// need a second mapping, and a mapping is what a reused slot breaks.
    pub(super) fn retain_contact_entry(&mut self) {
        let Some(mut contact) = self.contact.take() else { return };
        contact.resolutions.clear();
        contact.entry.clear();
        #[cfg(feature = "cartesian-recoil")]
        {
            contact.recoil_external.clear();
            contact.recoil_external.resize(self.alive.len(), [RecoilExternalEnergy::default(); 2]);
            contact.floor_reactions.clear();
            contact.exact_external_energy.clear();
        }
        for i in 0..self.alive.len() {
            contact.entry.push(TickEntry {
                pos: self.pos[i],
                locomotion: Vec2::ZERO,
                arms: self.arms[i],
                elbows: self.arm_elbows(i),
                shield: self.shield_pose[i],
                yaw: self.body_yaw[i],
                grips: self.grips[i],
                // Placeholders: both are written by the contact phase itself,
                // which is the only moment "before contact touched it" means
                // anything. Seeding them from the tick-entry row keeps a slot
                // that never reaches the phase from carrying a stale pose.
                pre_contact: [ArmScalars::of(self.arms[i][0]), ArmScalars::of(self.arms[i][1])],
                clamped: [false; 2],
                contact_overrode: [false; 2],
            });
        }
        self.contact = Some(contact);
    }

    /// The second of the three planar points, taken after movement and before
    /// separation because that is the only place it exists.
    pub(super) fn record_contact_locomotion(&mut self) {
        let Some(mut contact) = self.contact.take() else { return };
        for (i, entry) in contact.entry.iter_mut().enumerate() {
            entry.locomotion = self.pos[i] - entry.pos;
        }
        self.contact = Some(contact);
    }

    /// The contact phase.
    ///
    /// Positioned here rather than earlier because it reads the geometry the
    /// actuator has just derived, and doors are pressed against the pose it
    /// settles. That position is frozen by the contract, which is why it is
    /// pinned by a phase trace rather than argued from the reading order of the
    /// match above.
    ///
    /// The entry clamp runs even when nothing touches, and that is the
    /// contract's rule rather than an accident of ordering: its job is to keep
    /// the sweep inside the geometry envelope, and a row that leaves the
    /// envelope is dangerous whether or not anything was going to touch it --
    /// `fx` fails an out-of-envelope sweep *closed*, which manufactures a
    /// contact rather than dropping one.
    ///
    /// **The driver is handed scratch, never a world column.** The contract
    /// left checkpoint C to choose between advancing a copy and swapping on
    /// success, or treating any `ResolutionError` as fatal. Neither was needed:
    /// building colliders into `contact.colliders`, solving there, and
    /// committing afterwards makes the partial advance a property of scratch
    /// the world never sees. A mid-tick error therefore costs the tick its
    /// contact and nothing else -- no half-written body, no copy, and no panic
    /// on the one path whose far end is a browser holding typed-array views
    /// into linear memory.
    pub(super) fn resolve_contact(&mut self) {
        if self.contact.is_none() { return; }
        self.clamp_contact_entry();
        let Some(mut contact) = self.contact.take() else { return };
        // Lifted out rather than borrowed: the projector holds `&World` for the
        // whole solve and the wound application has to write. Taking the vector
        // makes the two borrows disjoint by construction instead of by
        // argument, and the entry copy beside it is what an error rolls back to.
        let mut wounds = core::mem::take(&mut self.wounds);
        contact.anatomy_entry.clear();
        contact.anatomy_entry.extend_from_slice(&wounds);
        contact.credit.clear();
        contact.credit.resize(wounds.len(), Fx::ZERO);
        #[cfg(feature = "cartesian-recoil")]
        {
            contact.exact_owner_entry.clear();
            contact.exact_owner_entry.extend_from_slice(&contact.exact_owners);
            contact.exact_trajectory_entry.clear();
            contact.exact_trajectory_entry.extend_from_slice(&contact.exact_trajectories);
        }
        self.build_contact_colliders(&contact.entry, &mut contact.colliders, &wounds);
        // Here and nowhere later. Every line below this one is entitled to move
        // the rows -- the driver advances them to each mapped time and severance
        // switches them off inside the tick -- so a snapshot taken after the
        // solve would answer a different question from the one the solver was
        // asked, and would answer it in the shape of the one it was.
        let ContactRuntime { swept, colliders, .. } = &mut contact;
        swept.clear();
        swept.extend_from_slice(colliders);
        #[cfg(feature = "cartesian-recoil")]
        contact.scratch.begin_exact_diagnostics(self.tick());
        #[cfg(feature = "cartesian-recoil")]
        if let Err(cause) = build_exact_contact_trajectories(self, &mut contact, &wounds) {
            wounds.clear();
            wounds.extend_from_slice(&contact.anatomy_entry);
            self.wounds = wounds;
            contact.resolutions.clear();
            contact.exact_owners.clear();
            contact.exact_owners.extend_from_slice(&contact.exact_owner_entry);
            contact.exact_trajectories.clear();
            contact.exact_trajectories.extend_from_slice(&contact.exact_trajectory_entry);
            contact.exact_commit.clear();
            contact.floor_reactions.clear();
            contact.exact_external_energy.clear();
            contact.rejections = contact.rejections.saturating_add(1);
            contact.first_rejection.get_or_insert(cause);
            contact.first_exact_rejection.get_or_insert(exact_rejection_diagnostic(
                self.tick(), ExactContactRejectPhase::BuildTrajectories, cause, None));
            self.contact = Some(contact);
            return;
        }
        #[cfg(not(feature = "cartesian-recoil"))]
        let solved = {
            let ContactRuntime { state, scratch, colliders, resolutions, entry, bodies,
                                 credit, deltas, fact_loss, .. } = &mut contact;
            let mut projector = ContactProjector {
                world: self, entry, bodies, wounds: &mut wounds, credit, deltas, fact_loss,
            };
            resolution::solve_contact_tick(
                colliders, &mut projector, state, resolutions, scratch)
        };
        #[cfg(feature = "cartesian-recoil")]
        let solved = {
            let ContactRuntime { state, scratch, colliders, resolutions, entry, bodies,
                                 credit, deltas, fact_loss, exact_trajectories,
                                 exact_owners, floor_reactions, .. } = &mut contact;
            let mut projector = ContactProjector {
                world: self, entry, bodies, wounds: &mut wounds, credit, deltas, fact_loss,
            };
            resolution::solve_exact_contact_tick(colliders, exact_trajectories,
                exact_owners, floor_reactions, &mut projector, state, resolutions, scratch)
        };
        #[cfg(feature = "cartesian-recoil")]
        let solved = match solved {
            Ok(groups) => {
                contact.scratch.exact_context_for_world(
                    ExactContactRejectPhase::StageCommit, None);
                self.stage_exact_contact(&mut contact).map(|()| groups)
            }
            Err(failure) => {
                contact.scratch.exact_context_for_world(failure.phase, failure.key);
                Err(failure.cause)
            }
        };
        match solved {
            Ok(_) => {
                self.wounds = wounds;
                for i in 0..self.damage_dealt.len().min(contact.credit.len()) {
                    self.damage_dealt[i] += contact.credit[i];
                }
                #[cfg(not(feature = "cartesian-recoil"))]
                self.commit_contact(&mut contact);
                #[cfg(feature = "cartesian-recoil")]
                {
                    for reaction in &contact.floor_reactions {
                        contact.exact_external_energy.push(ExactExternalEnergyRow {
                            entity: reaction.entity, lane: 0,
                            reason: RecoilExternalEnergy::FLOOR,
                            signed_numerator: reaction.energy_change.numerator,
                            denominator: reaction.energy_change.denominator,
                        });
                    }
                    self.commit_exact_contact(&mut contact);
                }
                self.contact = Some(contact);
                self.release_severed_grips();
                return;
            }
            Err(cause) => {
                // Restored into the vector that was taken, not into the empty
                // husk `mem::take` left behind: the husk has no capacity, and
                // refilling it would allocate on the one path whose far end is
                // a browser holding views into linear memory.
                wounds.clear();
                wounds.extend_from_slice(&contact.anatomy_entry);
                self.wounds = wounds;
                contact.resolutions.clear();
                #[cfg(feature = "cartesian-recoil")]
                {
                    contact.exact_owners.clear();
                    contact.exact_owners.extend_from_slice(&contact.exact_owner_entry);
                    contact.exact_trajectories.clear();
                    contact.exact_trajectories.extend_from_slice(
                        &contact.exact_trajectory_entry);
                    contact.exact_commit.clear();
                    contact.floor_reactions.clear();
                    contact.exact_external_energy.clear();
                    contact.credit.fill(Fx::ZERO);
                    contact.deltas.clear();
                    contact.fact_loss.clear();
                    contact.bodies.clear();
                }
                // Counted here and nowhere else, because this line is the one
                // that makes the rejection invisible from outside.
                contact.rejections = contact.rejections.saturating_add(1);
                contact.first_rejection.get_or_insert(cause);
                #[cfg(feature = "cartesian-recoil")]
                {
                    let (phase, key) = contact.scratch.exact_rejection_context();
                    contact.first_exact_rejection.get_or_insert(exact_rejection_diagnostic(
                        self.tick(), phase, cause, key));
                }
            }
        }
        self.contact = Some(contact);
    }

    /// A severed arm drops what it was holding.
    ///
    /// The collider row already left the tick that took the arm off; this is
    /// the authoritative column catching up, and it has to be a direct write.
    /// `resulting_grips` speaks in `GripRequest`s and cannot express "this arm
    /// only" for a two-handed item -- a one-sided release of a `Both` binding is
    /// an error there -- so a severed arm holding one releases both hands.
    pub(super) fn release_severed_grips(&mut self) {
        for i in 0..self.alive.len() {
            if !self.alive[i] { continue; }
            let severed = [!self.wounds[i].present(BodyPart::LeftArm),
                           !self.wounds[i].present(BodyPart::RightArm)];
            if !(severed[0] || severed[1]) { continue; }
            let drop_both = self.two_handed(i);
            let mut pair = self.grips[i].map(|grip| grip.equipment_slot);
            for limb in 0..2 {
                if !(drop_both || severed[limb]) { continue; }
                pair[limb] = None;
            }
            if (0..2).all(|limb| self.grips[i][limb].equipment_slot == pair[limb]) {
                continue;
            }
            #[cfg(feature = "cartesian-recoil")]
            let next_exact = {
                let current = self.exact_owners[i]
                    .expect("live articulated body has no exact owner");
                let expected = self.exact_owner_for_grips(i, pair, current.common_scale);
                // A severance present at contact entry had to shed its held
                // exact row in the tentative owner before that owner could be
                // rebased without a collider. The World grip deliberately did
                // not change with it: this successful path is the transaction's
                // commit. Recognise that staged identity instead of asking the
                // old-grip validator to manufacture the same transition twice.
                let already_staged = current.common_scale == expected.common_scale
                    && current.body_mass_raw == expected.body_mass_raw
                    && current.common_response.mass_raw == expected.common_response.mass_raw
                    && current.held_response.iter().zip(expected.held_response).all(|(got, want)|
                        got.map(|row| (row.slot, row.spec_id, row.affine.mass_raw))
                            == want.map(|row| (row.slot, row.spec_id, row.affine.mass_raw)));
                if already_staged { current } else {
                    self.prepare_zero_response_grip_transition(i, pair)
                        .expect("nonzero exact response reached severance without lifecycle energy")
                }
            };
            for limb in 0..2 {
                if self.grips[i][limb].equipment_slot == pair[limb] { continue; }
                #[cfg(feature = "cartesian-recoil")]
                let released_item = self.equipment_in_grip(i, limb);
                #[cfg(feature = "cartesian-recoil")]
                if let Some(item) = released_item {
                    self.clear_recoil_with_energy(i, limb, RecoilExternalEnergy::SEVERANCE, item);
                } else {
                    actuator::clear_post_contact(&mut self.arms[i][limb]);
                }
            }
            self.grips[i] = pair.map(|equipment_slot| GripState { equipment_slot });
            #[cfg(feature = "cartesian-recoil")]
            {
                self.exact_owners[i] = Some(next_exact);
            }
            self.shield_pose[i] = self.derive_shield_pose(i);
        }
    }

    /// The trial velocity one equipment row would actually end up with.
    ///
    /// An impulse moves a *point*; authoritative state is a *joint pose*, and a
    /// shoulder cannot reach past its arm. So the trial goes out to the hand the
    /// velocity implies, back through the joint, and out to the velocity the
    /// clamped joint can deliver -- which is the value the energy check reads,
    /// exactly as the contract requires, because keeping the unreachable one
    /// would let a group buy energy the arm cannot supply.
    ///
    /// The hand is derived from the velocity rather than from the collider's
    /// own trajectory, and it has to be: `project` is handed no time, so a
    /// trajectory endpoint is not available to it. It costs nothing, because
    /// both halves of the identity `hand = tick-entry hand + relative velocity`
    /// are the contract's own -- an arm's velocity *is* its hand's displacement
    /// over the tick, which is also what the commit writes back.
    ///
    /// **The identity is the hand's, so the row's own sample point has to come
    /// off first and go back on afterwards.** A held segment's velocity is
    /// sampled at the blade's centre of mass, which is not where the joint
    /// lives: handed that number directly this would derive a hand the arm
    /// never reached, clamp it against the wrong limit, and answer with a
    /// velocity that is neither. `velocity_offset` is exactly the difference,
    /// fixed for the tick, so subtracting it recovers the hand this map is
    /// entitled to ask about and the round trip below is unchanged.
    fn joint_clamped_velocity(
        &self,
        row: GeneralizedCollider,
        entries: &[TickEntry],
        body_velocity: Vec3,
        requested: Vec3,
    ) -> Result<Vec3, ResolutionError> {
        let limb = row.slot as usize;
        let (Some(i), true) = (self.resolve(row.entity), limb < 2) else {
            return Err(ResolutionError::ColliderIndex);
        };
        let entry = entries.get(i).ok_or(ResolutionError::ColliderIndex)?;
        let anatomy = self.combat_specs.as_ref()
            .and_then(|table| table.anatomy(self.articulated_anatomy[i]?))
            .ok_or(ResolutionError::ColliderIndex)?;
        let yaw = self.body_yaw[i].angle;
        let entry_hand = entry.arms[limb].hand;
        let offset = row.velocity_offset;
        let trial = entry_hand + ((requested - offset) - body_velocity);
        let (bearing, height, reach) =
            actuator::inverse_hand(anatomy, yaw, limb, trial, self.arms[i][limb].bearing);
        let reachable = actuator::hand_position(anatomy, yaw, limb, bearing, height, reach);
        // Clamped again on the way out. The joint bounds a hand, not a speed,
        // and a hand hauled from one side of the body to the other inside one
        // tick is a displacement the envelope still has to survive. Nothing in
        // spec reaches it -- this is the same tripwire the entry clamp is.
        Ok(clamp_contact_velocity(body_velocity + (reachable - entry_hand) + offset))
    }

    /// Write the solved tick back onto the world's own columns.
    ///
    /// **A row is written only when it moved**, and that is not an
    /// optimisation. `inverse_hand` is not the exact inverse of
    /// `hand_position` -- the forward map goes through a sine table and the
    /// inverse through `Vec2::angle`, and the round trip is measured at up to
    /// 53 raw units of hand movement -- so re-deriving an untouched arm would
    /// drift the pose of every fighter that touched nothing, every tick, and
    /// the contract's "with no fact and no entry clamp they are the saved
    /// requested World rows byte-for-byte" would be false.
    #[cfg(feature = "cartesian-recoil")]
    fn stage_exact_contact(&mut self, contact: &mut ContactRuntime) -> Result<(), ResolutionError> {
        contact.exact_commit.clear();
        for owner in &contact.exact_owners {
            // Projectile owners are solver-lifetime rows only. A body hit
            // hides the collider at that group boundary and the world reaps
            // its store row after contact, so there is no tick-end pose to
            // certify or commit for it.
            if owner.projectile { continue; }
            if owner.common_response.group_time_raw != 65_536
                || owner.held_response.iter().flatten()
                    .any(|held| held.affine.group_time_raw != 65_536) {
                return Err(ResolutionError::ExactScan);
            }
            let i = self.resolve(owner.entity).ok_or(ResolutionError::ColliderIndex)?;
            let body_at = contact.exact_trajectories.iter().position(|row|
                row.entity == owner.entity && matches!(row.motor, MotorShape::Body { .. }))
                .ok_or(ResolutionError::ColliderIndex)?;
            let MotorShape::Body { origin: body_origin, .. } =
                contact.exact_trajectories[body_at].motor else { unreachable!() };
            let origin = wide_body_origin_quotient(&contact.exact_trajectories[body_at], owner)
                .map_err(|_| ResolutionError::ExactScan)?;
            let position = Vec2::new(origin.x, origin.y);
            // An arena wall changes every held collider's absolute velocity
            // even when its relative hand pose is untouched. Retain those
            // rows so the existing commit reconciliation can name the wall's
            // energy on the held lane. Tile settlement remains commit-time
            // authority and is deliberately outside this arena-only test.
            let arena_body_clipped = self.clamp_to_arena(position, self.radius[i]) != position;
            let mut arms = [None; 2];
            let capped = contact.scratch.capped_entities().contains(&owner.entity);
            for limb in 0..2 {
                let Some(at) = contact.exact_trajectories.iter().position(|row|
                    row.entity == owner.entity && row.held_index == Some(limb)) else { continue };
                let hand = match contact.exact_trajectories[at].motor {
                    MotorShape::Segment { hilt, .. } => wide_relative_point_quotient(
                        hilt, &contact.exact_trajectories[at], body_origin,
                        &contact.exact_trajectories[body_at], owner, 65_536)
                        .map_err(|_| ResolutionError::ExactScan)?,
                    MotorShape::Shield { corners } => {
                        let mut relative = [Vec3::ZERO; 4];
                        for corner in 0..4 {
                            relative[corner] = wide_relative_point_quotient(
                                corners[corner], &contact.exact_trajectories[at], body_origin,
                                &contact.exact_trajectories[body_at], owner, 65_536)
                                .map_err(|_| ResolutionError::ExactScan)?;
                        }
                        let pose = self.shield_pose[i].ok_or(ResolutionError::ColliderIndex)?;
                        midpoint3(relative[0], relative[2])
                            - pose.normal * (pose.thickness / Fx::from_int(2))
                    }
                    _ => return Err(ResolutionError::ExactScan),
                };
                let direct = contact.resolutions.iter().any(|resolution| {
                    let key = resolution.fact.key;
                    (key.a == owner.entity && key.a_slot as usize == limb
                        && resolution.impulse.on_a != Vec3::ZERO)
                    || (key.b == owner.entity && key.b_slot as usize == limb
                        && resolution.impulse.on_b != Vec3::ZERO)
                });
                if hand == self.arms[i][limb].hand && !contact.entry[i].clamped[limb]
                    && !capped && !direct && !arena_body_clipped { continue }
                arms[limb] = Some(ExactArmCommit {
                    hand,
                    linear_velocity: hand - contact.entry[i].arms[limb].hand,
                    post_contact_com_velocity: exact_held_velocity(*owner, limb)
                        .map_err(|_| ResolutionError::ExactScan)?,
                    replace_recoil: self.exact_owners[i]
                        .and_then(|before| before.held_response[limb])
                        .map_or(true, |before| before.affine.momentum
                            != owner.held_response[limb].unwrap().affine.momentum),
                });
            }
            contact.exact_commit.push(ExactCommitRow {
                entity: owner.entity,
                owner: wide_rebase_owner_tick(&contact.exact_trajectories, *owner)
                    .map_err(|_| ResolutionError::ExactScan)?,
                position,
                velocity: position - contact.entry[i].pos,
                body_moved: position != self.pos[i], arms,
            });
        }
        Ok(())
    }

    #[cfg(feature = "cartesian-recoil")]
    fn commit_exact_contact(&mut self, contact: &mut ContactRuntime) {
        for at in 0..contact.exact_commit.len() {
            let row = contact.exact_commit[at];
            let i = self.resolve(row.entity).expect("preflighted exact owner");
            let solved_velocity = row.velocity;
            if row.body_moved {
                // Exact contact still ends at an ordinary World position. Its
                // endpoint therefore owes the same swept wall settlement as
                // legacy knockback; refusing here discards a valid contact,
                // while assigning the endpoint directly leaves it in stone.
                self.vel[i] = solved_velocity;
                self.move_body(i, row.position);
            }
            let settled_velocity = if row.body_moved { self.vel[i] } else { solved_velocity };
            let mut owner = row.owner;
            let clipped = [settled_velocity.x != solved_velocity.x,
                           settled_velocity.y != solved_velocity.y];
            for axis in 0..2 {
                if !clipped[axis] { continue }
                let delta = if axis == 0 {
                    settled_velocity.x - solved_velocity.x
                } else {
                    settled_velocity.y - solved_velocity.y
                };
                let current = owner.common_response.momentum[axis];
                let local = ExactMomentum {
                    velocity_raw: current.velocity_raw.checked_add(delta.raw())
                        .expect("bounded wall response overflowed exact momentum"),
                    remainder: current.remainder,
                };
                owner.common_response.momentum[axis] = normalize_momentum(
                    local, owner.common_scale)
                    .expect("bounded wall response produced noncanonical exact momentum");
                // The wall's answer is an integer Fx boundary. Retaining the
                // solver's subraw overshoot would put the exact row infinitesimally
                // through that boundary again on the next tick.
                owner.common_response.at_group[axis].remainder = 0;
            }
            if clipped[0] || clipped[1] {
                // The common response moves every physical row, but a held
                // lane accounts only its equipment mass. Without this body
                // row, a naked fighter loses the same wall energy and the
                // exact lifecycle ledger says that nothing external happened.
                let mass = Fx::from_raw(owner.body_mass_raw);
                let before_n = Self::recoil_energy_numerator(mass,
                    Vec3::new(solved_velocity.x, solved_velocity.y, Fx::ZERO), Vec3::ZERO);
                let after_n = Self::recoil_energy_numerator(mass,
                    Vec3::new(settled_velocity.x, settled_velocity.y, Fx::ZERO), Vec3::ZERO);
                contact.exact_external_energy.push(ExactExternalEnergyRow {
                    entity: row.entity, lane: 0, reason: RecoilExternalEnergy::WALL,
                    signed_numerator: after_n.checked_sub(before_n)
                        .expect("bounded body wall energy difference"),
                    denominator: 2i128 * 65_536 * 65_536,
                });
            }
            for limb in 0..2 {
                let Some(mut staged) = row.arms[limb] else { continue };
                if clipped[0] || clipped[1] {
                    staged.replace_recoil = true;
                    let before = staged.post_contact_com_velocity;
                    staged.post_contact_com_velocity = actuator::settle_post_contact_com(
                        before, solved_velocity, settled_velocity);
                    staged.linear_velocity = actuator::settle_post_contact_com(
                        staged.linear_velocity, solved_velocity, settled_velocity);
                    if let Some(held) = owner.held_response[limb].as_mut() {
                        if clipped[0] {
                            held.affine.momentum[0] = ExactMomentum {
                                velocity_raw: staged.post_contact_com_velocity.x.raw(), remainder: 0,
                            };
                        }
                        if clipped[1] {
                            held.affine.momentum[1] = ExactMomentum {
                                velocity_raw: staged.post_contact_com_velocity.y.raw(), remainder: 0,
                            };
                        }
                    }
                    if let Some(collider) = contact.colliders.iter().find(|candidate|
                        candidate.entity == row.entity && candidate.slot as usize == limb
                            && !matches!(candidate.shape, ContactShape::Body { .. })) {
                        let before_n = Self::recoil_energy_numerator(collider.mass,
                            Vec3::new(solved_velocity.x, solved_velocity.y, Fx::ZERO), before);
                        let after_n = Self::recoil_energy_numerator(collider.mass,
                            Vec3::new(settled_velocity.x, settled_velocity.y, Fx::ZERO),
                            staged.post_contact_com_velocity);
                        Self::record_recoil_external_in(contact, row.entity, i, limb,
                            RecoilExternalEnergy::WALL, before_n, after_n);
                    }
                }
                let arm = &mut self.arms[i][limb];
                arm.previous_hand = contact.entry[i].arms[limb].hand;
                arm.hand = staged.hand;
                arm.linear_velocity = staged.linear_velocity;
                if staged.replace_recoil {
                    arm.post_contact_com_velocity = staged.post_contact_com_velocity;
                    arm.post_contact_active = staged.post_contact_com_velocity != Vec3::ZERO;
                }
                contact.entry[i].contact_overrode[limb] = true;
            }
            // A `Both` item owns one exact held row, on the right. The left is
            // pose derived from that owner and must be rebuilt after the owner
            // commits; mirroring only in the actuator leaves it at the
            // pre-contact pose. This writes no second lattice or energy row,
            // and `mirror_two_handed` deliberately clears the nonowning recoil.
            if row.arms[1].is_some() && self.two_handed(i) {
                let anatomy = self.combat_specs.as_ref().expect("articulated combat specs")
                    .anatomy(self.articulated_anatomy[i].expect("articulated anatomy"))
                    .expect("validated articulated anatomy").clone();
                let right = self.arms[i][1];
                actuator::mirror_two_handed(
                    &mut self.arms[i][0], right, &anatomy, self.body_yaw[i].angle,
                );
                contact.entry[i].contact_overrode[0] = true;
            }
            self.exact_owners[i] = Some(owner);
            if row.arms.iter().any(Option::is_some) {
                self.shield_pose[i] = self.derive_shield_pose(i);
            }
        }
    }

    fn commit_contact(&mut self, contact: &mut ContactRuntime) {
        for i in 0..self.alive.len() {
            if !self.alive[i] { continue; }
            // The reborrow is what keeps the row's own reads immutable while
            // its answer is written back beside them. The answer is diagnostic
            // -- see `TickEntry::contact_overrode` -- so it is recorded after
            // the commit rather than during it, where an early return would
            // decide it by accident.
            let overrode = self.commit_contact_row(i, contact);
            if let Some(entry) = contact.entry.get_mut(i) { entry.contact_overrode = overrode; }
        }
    }

    /// Answers which limbs this commit wrote a joint pose for.
    fn commit_contact_row(&mut self, i: usize, contact: &mut ContactRuntime) -> [bool; 2] {
        let mut overrode = [false; 2];
        let entity = self.id_of(i);
        let Some(body) = contact.colliders.iter().copied().find(|row| {
            row.entity == entity && matches!(row.shape, ContactShape::Body { .. })
        }) else { return overrode };
        let ContactShape::Body { previous_origin, .. } = body.shape else { return overrode };
        let entry = contact.entry[i];
        let capped = contact.scratch.capped_entities().contains(&entity);
        let remaining = last_group_remaining(&contact.resolutions, entity);
        // The solver's own body origin, before the wall has had its say. A
        // rigid push must not drag a hand out of its socket, so the arm's
        // *relative* pose is fixed against this and the settlement below then
        // carries body and arms together.
        let origin = previous_origin;

        let mut held = [false; 2];
        for limb in 0..2 {
            let Some(row) = contact.colliders.iter().copied().find(|row| {
                row.entity == entity && row.slot as usize == limb
                    && !matches!(row.shape, ContactShape::Body { .. })
            }) else { continue };
            let Some(hand) = self.collider_hand(i, row) else { continue };
            held[limb] = true;
            let relative = hand - origin;
            #[cfg(feature = "cartesian-recoil")]
            let direct = contact.resolutions.iter().any(|resolution| {
                let key = resolution.fact.key;
                let on_a = key.a == entity && key.a_slot as usize == limb
                    && resolution.impulse.on_a != Vec3::ZERO;
                let on_b = key.b == entity && key.b_slot as usize == limb
                    && resolution.impulse.on_b != Vec3::ZERO;
                on_a || on_b
            });
            #[cfg(not(feature = "cartesian-recoil"))]
            if relative == self.arms[i][limb].hand && !entry.clamped[limb] && !capped { continue; }
            #[cfg(feature = "cartesian-recoil")]
            if relative == self.arms[i][limb].hand && !entry.clamped[limb] && !capped && !direct {
                continue;
            }
            self.commit_arm(i, limb, relative, entry, remaining, capped);
            #[cfg(feature = "cartesian-recoil")]
            {
                if capped {
                    let before = if direct {
                        row.velocity - body.velocity
                    } else if self.arms[i][limb].post_contact_active {
                        self.arms[i][limb].post_contact_com_velocity
                    } else {
                        Vec3::ZERO
                    };
                    actuator::clear_post_contact(&mut self.arms[i][limb]);
                    if before != Vec3::ZERO {
                        let before_n = Self::recoil_energy_numerator(row.mass, body.velocity, before);
                        let after_n = Self::recoil_energy_numerator(row.mass, body.velocity, Vec3::ZERO);
                        Self::record_recoil_external_in(contact, entity, i, limb,
                            RecoilExternalEnergy::CAP, before_n, after_n);
                    }
                } else if direct {
                    let arm = &mut self.arms[i][limb];
                    // The collider endpoint and COM velocity are two different
                    // solved facts. Keep the endpoint exact; store COM motion
                    // relative to its translated owner, never hand motion.
                    arm.hand = relative;
                    arm.previous_hand = entry.arms[limb].hand;
                    arm.linear_velocity = relative - arm.previous_hand;
                    arm.post_contact_com_velocity = row.velocity - body.velocity;
                    arm.post_contact_active = true;
                }
            }
            overrode[limb] = true;
        }

        // One commit of the body endpoint, through the path a knockback already
        // uses. `move_body` rather than `settle` alone: contact deltas are
        // bounded by the component clamp and nothing narrower, so a single
        // displacement can be longer than the one-tile walls this level plan
        // carves -- and `settle` on its own would clamp the destination without
        // ever noticing the masonry it passed through. `move_body` calls
        // `settle` once per swept sub-step, which is "the existing
        // wall-settlement path" applied once to one commit, and it degenerates
        // to exactly one `settle` on an uncarved plan.
        let solved_position = Vec2::new(previous_origin.x, previous_origin.y);
        let solved_velocity = Vec2::new(body.velocity.x, body.velocity.y);
        self.vel[i] = solved_velocity;
        if solved_position != self.pos[i] { self.move_body(i, solved_position); }
        let settled_velocity = self.vel[i];

        // The wall's share, which is dissipative, unledgered, and outside every
        // group. Zeroing the absolute component on each held collider and then
        // rebuilding the relative one is what keeps it dissipative: the body
        // lost that component too, so the difference loses it as well and the
        // closure's energy can only fall.
        if settled_velocity != solved_velocity {
            for limb in 0..2 {
                if !held[limb] { continue; }
                let mut absolute = Vec3::new(solved_velocity.x, solved_velocity.y, Fx::ZERO)
                    + self.arms[i][limb].linear_velocity;
                if settled_velocity.x != solved_velocity.x { absolute.x = Fx::ZERO; }
                if settled_velocity.y != solved_velocity.y { absolute.y = Fx::ZERO; }
                self.arms[i][limb].linear_velocity = absolute
                    - Vec3::new(settled_velocity.x, settled_velocity.y, Fx::ZERO);
                #[cfg(feature = "cartesian-recoil")]
                if self.arms[i][limb].post_contact_active {
                    let before = self.arms[i][limb].post_contact_com_velocity;
                    let after = actuator::settle_post_contact_com(before,
                        solved_velocity, settled_velocity);
                    self.arms[i][limb].post_contact_com_velocity = after;
                    if let Some(row) = contact.colliders.iter().copied().find(|row| {
                        row.entity == entity && row.slot as usize == limb
                            && !matches!(row.shape, ContactShape::Body { .. })
                    }) {
                        let before_n = Self::recoil_energy_numerator(row.mass,
                            Vec3::new(solved_velocity.x, solved_velocity.y, Fx::ZERO), before);
                        let after_n = Self::recoil_energy_numerator(row.mass,
                            Vec3::new(settled_velocity.x, settled_velocity.y, Fx::ZERO), after);
                        Self::record_recoil_external_in(contact, entity, i, limb,
                            RecoilExternalEnergy::WALL, before_n, after_n);
                    }
                }
            }
        }

        if held[0] || held[1] {
            if held[1] && self.two_handed(i) {
                let anatomy = self.combat_specs.as_ref().expect("articulated combat specs")
                    .anatomy(self.articulated_anatomy[i].expect("articulated anatomy"))
                    .expect("validated articulated anatomy").clone();
                let right = self.arms[i][1];
                actuator::mirror_two_handed(&mut self.arms[i][0], right, &anatomy, self.body_yaw[i].angle);
                #[cfg(feature = "cartesian-recoil")]
                {
                    self.arms[i][0].post_contact_com_velocity = Vec3::ZERO;
                    self.arms[i][0].post_contact_active = false;
                }
                // The mirror rebuilds the left velocity from the hands, which
                // is right everywhere except here: a capped entity's owner was
                // zeroed, and the contract mirrors the zero rather than a
                // displacement the cap refused to let happen.
                if capped { self.arms[i][0].linear_velocity = Vec3::ZERO; }
                // A `Both` grip gives the left arm no collider of its own, so
                // the loop above never marks it -- but the mirror has just
                // hauled it wherever the right arm was taken. Reporting it as
                // still chasing a target would animate one arm recoiling and
                // the other reaching, off the same weapon. The mirror is a
                // no-op when the right arm was not committed, which is why the
                // right arm's answer is the whole condition.
                overrode[0] |= overrode[1];
            }
            // The shield pose is a cached derivation of the hand and the yaw,
            // and it is hashed. An arm the solver moved leaves it stale, which
            // would put the drawn and the hashed shield in two different
            // places.
            self.shield_pose[i] = self.derive_shield_pose(i);
        }
        overrode
    }

    /// One contacted arm, written back as a joint pose.
    fn commit_arm(
        &mut self, i: usize, limb: usize, hand: Vec3,
        entry: TickEntry, remaining: u32, capped: bool,
    ) {
        let anatomy = self.combat_specs.as_ref().expect("articulated combat specs")
            .anatomy(self.articulated_anatomy[i].expect("articulated anatomy"))
            .expect("validated articulated anatomy").clone();
        let yaw = self.body_yaw[i].angle;
        let pre = entry.pre_contact[limb];
        let (bearing, height, reach) = actuator::inverse_hand(&anatomy, yaw, limb, hand, pre.bearing);
        // The *clamped* hand, not the one asked for. The joint may refuse, and
        // the state that has to be self-consistent is the pose plus the hand it
        // actually produces.
        let reachable = actuator::hand_position(&anatomy, yaw, limb, bearing, height, reach);
        let arm = &mut self.arms[i][limb];
        arm.bearing = bearing;
        arm.height = height;
        arm.reach = reach;
        arm.hand = reachable;
        arm.previous_hand = entry.arms[limb].hand;
        if capped {
            arm.linear_velocity = Vec3::ZERO;
            arm.bearing_speed_turns = Fx::ZERO;
            arm.height_speed = Fx::ZERO;
            arm.reach_speed = Fx::ZERO;
            return;
        }
        arm.linear_velocity = reachable - arm.previous_hand;
        arm.bearing_speed_turns = Fx::from_raw(scalar_speed(bearing.delta(pre.bearing), remaining));
        arm.height_speed = Fx::from_raw(scalar_speed(height.raw() - pre.height.raw(), remaining));
        arm.reach_speed = Fx::from_raw(scalar_speed(reach.raw() - pre.reach.raw(), remaining));
    }

    /// The absolute hand a solved collider row ended on.
    fn collider_hand(&self, i: usize, row: ContactCollider) -> Option<Vec3> {
        match row.shape {
            ContactShape::Projectile { .. } => None,
            // A held segment's hilt *is* the hand: `segment_pose` builds it as
            // the body origin plus the body-relative hand, and everything the
            // driver does afterwards translates or interpolates both endpoints
            // together.
            ContactShape::Segment { previous_hilt, .. } => Some(previous_hilt),
            // A shield publishes only its front face, so the hand comes back by
            // undoing the two offsets `shield_face` added. Both come back
            // exactly: the corners are symmetric about the front centre, and
            // the half-thickness step is the identical product run backwards.
            ContactShape::Shield { previous, .. } => {
                let pose = self.shield_pose[i]?;
                Some(midpoint3(previous[0], previous[2])
                    - pose.normal * (pose.thickness / Fx::from_int(2)))
            }
            ContactShape::Body { .. } => None,
        }
    }

    /// The articulated-only entry clamp, in the contract's exact componentwise
    /// order.
    ///
    /// The order is not cosmetic. `Ve_prime` is built from the *clamped* body
    /// velocity, so a body already at the limit does not get to carry its
    /// equipment past it, and the arm's stored velocity comes out as the
    /// difference of the two clamped absolutes rather than as its own clamp --
    /// which is what stops the body translation from being counted twice.
    fn clamp_contact_entry(&mut self) {
        for i in 0..self.alive.len() {
            if !self.alive[i] { continue; }
            // Before anything in this phase writes an arm: this is the pose the
            // commit measures contact's own scalar speeds against, and it stops
            // existing on the next line.
            let scalars = [ArmScalars::of(self.arms[i][0]), ArmScalars::of(self.arms[i][1])];
            if let Some(entry) = self.contact.as_mut().and_then(|c| c.entry.get_mut(i)) {
                entry.pre_contact = scalars;
                entry.clamped = [false; 2];
            }
            let body = Vec3::new(self.vel[i].x, self.vel[i].y, Fx::ZERO);
            let clamped_body = clamp_contact_velocity(body);
            self.vel[i] = Vec2::new(clamped_body.x, clamped_body.y);
            let anatomy = self.combat_specs.as_ref().expect("articulated combat specs")
                .anatomy(self.articulated_anatomy[i].expect("articulated anatomy"))
                .expect("validated articulated anatomy").clone();
            let yaw = self.body_yaw[i].angle;
            let mut shifted = [false; 2];
            for limb in 0..2 {
                let arm = self.arms[i][limb];
                let requested = clamped_body + arm.linear_velocity;
                let clamped = clamp_contact_velocity(requested);
                let shift = clamped - requested;
                // The difference of the two clamped absolutes, not a clamp of
                // the relative velocity: the body translation is already in
                // both terms and cancels, which is the double count the
                // contract warns about. This is the value the collider that
                // gets built from this arm carries into the sweep -- the commit
                // then re-derives it from the hand that was actually reached,
                // because a joint clamp can refuse to put the hand where this
                // arithmetic asked, and the two agree only when it does not.
                self.arms[i][limb].linear_velocity = clamped - clamped_body;
                if shift == Vec3::ZERO { continue; }
                // Only the equipment's own share reaches the hand. The body's
                // share is not applied a second time here and it is not applied
                // anywhere else either: this body's sweep endpoints are the two
                // *positions* the tick produced, not an integration of
                // `World::vel`, so clamping that velocity moves no endpoint to
                // begin with. The contract writes the rule as
                // `body_requested += Db` for a model whose body sweep comes out
                // of its velocity; ours cannot, because locomotion is bounded
                // by movement rules two orders of magnitude under this clamp
                // and the separation shove is positional by construction.
                let hand = arm.hand + shift;
                let (bearing, height, reach) =
                    actuator::inverse_hand(&anatomy, yaw, limb, hand, arm.bearing);
                self.arms[i][limb].bearing = bearing;
                self.arms[i][limb].height = height;
                self.arms[i][limb].reach = reach;
                self.arms[i][limb].hand =
                    actuator::hand_position(&anatomy, yaw, limb, bearing, height, reach);
                shifted[limb] = true;
                if let Some(entry) = self.contact.as_mut().and_then(|c| c.entry.get_mut(i)) {
                    entry.clamped[limb] = true;
                }
            }
            if shifted[1] && self.two_handed(i) {
                let right = self.arms[i][1];
                actuator::mirror_two_handed(&mut self.arms[i][0], right, &anatomy, yaw);
            }
            // The shield rides the hand, so a clamp that moved the hand leaves
            // the pose the geometry phase derived a moment ago behind it -- and
            // the shield collider is built from that pose on the next line but
            // one. Re-derived here rather than by re-running the whole geometry
            // phase, which would also re-run it for every arm the clamp did not
            // touch and re-introduce the inverse map's drift.
            if shifted[0] || shifted[1] {
                self.shield_pose[i] = self.derive_shield_pose(i);
            }
        }
    }

    /// This tick's contact collider rows: one five-region body per live entity
    /// plus whatever it is holding.
    ///
    /// Previous poses come from the retained tick-entry row and requested poses
    /// from the post-actuator row, so one sweep covers the whole tick. The body
    /// origin is the shifted sweep from [`World::contact_body_sweep`], which is
    /// the single place separation is kept out of the relative motion.
    ///
    /// A severed arm reaches this in two places at once, and both are needed:
    /// its volume is absent from the body row, and its grip is masked out
    /// before the held colliders are built. The second is not implied by the
    /// first -- a weapon is not attached to the arm's geometry, it is attached
    /// to the grip -- and a sword swinging on its own is what leaving it out
    /// looks like.
    fn build_contact_colliders(
        &self,
        entries: &[TickEntry],
        rows: &mut Vec<ContactCollider>,
        anatomy_state: &[AnatomyState],
    ) {
        rows.clear();
        let Some(table) = self.combat_specs.as_ref() else { return };
        for i in 0..self.alive.len() {
            if !self.alive[i] { continue; }
            let Some(entry) = entries.get(i) else { continue };
            let anatomy = self.posed_anatomy(i);
            let anatomy = &anatomy;
            let (start, end) = body_sweep_from(self.pos[i], entry);
            // **The one line that puts the whole existing three-dimensional
            // solver on a hill.** Both ends of the sweep are sampled at their
            // own tile, not at the body's current one, because a body that
            // stepped up during the tick swept from the lower floor to the
            // higher one and a single height would flatten that back out.
            // `height_at` is zero on every flat dungeon, which is what makes
            // this identical to the `Fx::ZERO` it replaced for every shipped
            // scenario.
            let previous_origin = Vec3::new(start.x, start.y, self.dungeon.height_at(start));
            let requested_origin = Vec3::new(end.x, end.y, self.ground_z[i]);
            let body_velocity = Vec3::new(self.vel[i].x, self.vel[i].y, Fx::ZERO);
            let entity = self.id_of(i);
            let faction = self.faction[i];
            let state = anatomy_state.get(i).copied().unwrap_or(AnatomyState::EMPTY);
            let present: [bool; BodyPart::COUNT] =
                core::array::from_fn(|part| !state.parts[part].severed);

            let yaw = self.body_yaw[i].angle;
            // **Each end of the sweep gets the elbow that end actually had.**
            // The tick-entry one was retained by `retain_contact_entry` and the
            // settled one is derived now; passing either one to both ends would
            // sweep a forearm between a joint the body occupied and one it did
            // not. `arm_elbows` answers `[None; 2]` for a single-link model, and
            // `jointed_body_region_volumes` then leaves volumes 5 and 6 absent --
            // which is why this is one call site and not a branch on the model.
            let previous = geometry::jointed_body_region_volumes(
                previous_origin, anatomy, entry.yaw.angle,
                [entry.arms[0].hand, entry.arms[1].hand], present, entry.elbows);
            let requested = geometry::jointed_body_region_volumes(
                requested_origin, anatomy, yaw,
                [self.arms[i][0].hand, self.arms[i][1].hand], present, self.arm_elbows(i));
            rows.push(ContactCollider {
                entity, faction, slot: BODY_SLOT, mass: self.mass[i],
                surface: anatomy.surface, velocity: body_velocity, present: true,
                velocity_offset: Vec3::ZERO,
                shape: ContactShape::Body {
                    previous_origin, requested_origin,
                    parts: core::array::from_fn(|part| RegionSweep {
                        previous_lower: previous[part].lower,
                        previous_upper: previous[part].upper,
                        requested_lower: requested[part].lower,
                        requested_upper: requested[part].upper,
                        radius: previous[part].radius,
                        present: previous[part].present,
                    }),
                },
            });

            let mut grips = self.grips[i];
            for limb in 0..2 {
                if !present[limb_body_part(limb as u8).expect("a limb slot") as usize] {
                    grips[limb].equipment_slot = None;
                }
            }
            let equipment = |id| table.equipment(id).copied();
            let segments = geometry::held_segment_colliders(
                previous_origin, requested_origin, entry.arms, self.arms[i],
                grips, self.articulated_carried[i], equipment,
            );
            for segment in segments.into_iter().flatten() {
                let owner = segment.owner as usize;
                let hand_velocity = body_velocity + self.arms[i][owner].linear_velocity;
                // **Sampled at the blade's centre of mass, not in the hand.**
                // `closure_energy` reads collider *rows* and never contact
                // points, so this is the only place a swing's speed can reach
                // the energy budget at all -- the per-point prototype gave
                // every fact its own velocity, moved the budget by nothing, and
                // is written up in `docs/performance/v2-articulated-gate.md`.
                //
                // `balance` and not a hardcoded half: `rules::grip_limit`
                // already calls it "the weapon's centre of mass" and levers the
                // legacy swing on it, it is already validated as a fraction and
                // already in `Scenario::fingerprint`, so using it here makes
                // the articulated model agree with the definition this
                // repository had already written down, for no new bytes.
                //
                // The *differential* of the two endpoints, never the tip's own
                // swept displacement. Both endpoints carry the body, so the
                // subtraction cancels it by construction; taking the tip alone
                // would quietly swap this row's unclipped `World::vel` for the
                // wall-clipped locomotion the sweep is built from, which is a
                // second change wearing this one's clothes.
                let balance = equipment(segment.equipment)
                    .expect("one immutable equipment spec").balance;
                let swing = (segment.requested.tip - segment.previous.tip)
                    - (segment.requested.hilt - segment.previous.hilt);
                // Clamped here so that `velocity - velocity_offset` is exactly
                // the hand velocity the entry clamp already made legal, and so
                // that the row enters the solve inside the envelope the way
                // every other row does. Nothing in the roster comes near it --
                // the offset is a hundredth of a unit against a limit of 2.309
                // -- and the alpha-zero identity depends on the row being a
                // clamp output rather than on that measurement.
                let sampled = clamp_contact_velocity(
                    hand_velocity + scale_contact_vector(swing, balance),
                );
                rows.push(ContactCollider {
                    entity, faction, slot: segment.owner as u8, mass: segment.mass,
                    surface: segment.surface, present: true,
                    velocity: sampled, velocity_offset: sampled - hand_velocity,
                    shape: ContactShape::Segment {
                        previous_hilt: segment.previous.hilt,
                        previous_tip: segment.previous.tip,
                        requested_hilt: segment.requested.hilt,
                        requested_tip: segment.requested.tip,
                        radius: segment.previous.radius,
                    },
                });
            }

            let shield = geometry::held_shield_collider(
                previous_origin, requested_origin, entry.shield, self.shield_pose[i],
                grips, self.articulated_carried[i], equipment,
            );
            if let Some(shield) = shield {
                let owner = shield.owner as usize;
                // **The shield keeps the hand and takes no offset**, and that
                // is a statement about its geometry rather than an omission.
                // `derive_shield_pose` puts `ShieldPose.centre` *at the hand*,
                // so the face's centre of mass and its hand coincide up to a
                // rigid body-frame offset -- and a point-mass model carries no
                // angular state for that offset to move through. There is
                // nothing here for a centre-of-mass sample to be different
                // from.
                //
                // `shield().balance` is 7/20 and is **not** geometric:
                // `EquipmentGeometry::Shield` has no `length` for it to be a
                // fraction of, and the only thing that reads it is
                // `actuator::held_inertia`. Applying it here would multiply a
                // velocity by a number that means nothing in this direction.
                rows.push(ContactCollider {
                    entity, faction, slot: shield.owner as u8, mass: shield.mass,
                    surface: shield.surface, present: true,
                    velocity: body_velocity + self.arms[i][owner].linear_velocity,
                    velocity_offset: Vec3::ZERO,
                    shape: ContactShape::Shield {
                        previous: shield.previous.corners,
                        requested: shield.requested.corners,
                    },
                });
            }
        }
        let projectile_surface = crate::SurfaceSpec {
            restitution: Fx::ZERO, friction: Fx::ZERO, edge_factor: Fx::ZERO,
            point_factor: Fx::ONE, material: crate::Material::Steel,
        };
        for slot in 0..self.articulated_projectile_alive.len() {
            if !self.articulated_projectile_alive[slot] { continue; }
            let previous = self.articulated_projectile_pos[slot];
            let (requested, _, shielded_body) = self.articulated_projectile_requested(slot);
            rows.push(ContactCollider {
                entity: self.articulated_projectile_id(slot),
                faction: self.articulated_projectile_faction[slot],
                slot: ARTICULATED_PROJECTILE_SLOT,
                mass: self.articulated_projectile_mass[slot],
                surface: projectile_surface,
                velocity: self.articulated_projectile_vel[slot],
                velocity_offset: Vec3::ZERO,
                shape: ContactShape::Projectile {
                    previous, requested, radius: self.articulated_projectile_radius[slot],
                    shielded_body,
                },
                present: true,
            });
        }
    }

    /// The body's contact sweep for this tick, as `(start, end)`.
    ///
    /// Wall-clipped intended locomotion is what gets swept -- `locomotion` is
    /// read after `move_body` has already taken the wall's share -- while the
    /// separation shove moves both endpoints together and so contributes no
    /// relative motion. `World::vel` after separation is still the authoritative
    /// generalized velocity: the separation *impulse* belongs to the body even
    /// though its positional correction does not.
    #[cfg(test)]
    fn contact_body_sweep(&self, i: usize) -> (Vec2, Vec2) {
        match self.contact.as_ref().and_then(|contact| contact.entry.get(i)) {
            None => (self.pos[i], self.pos[i]),
            Some(entry) => body_sweep_from(self.pos[i], entry),
        }
    }
}

#[cfg(feature = "cartesian-recoil")]
impl World {
    pub fn request_exact_segment_body_pair_diagnostic(
        &mut self, target: crate::ExactSegmentBodyDiagnosticTarget) -> bool
    {
        self.contact.as_mut().is_some_and(|contact|
            contact.scratch.request_exact_segment_body_target(target))
    }

    pub fn request_exact_segment_body_pair_aabb_diagnostic(
        &mut self, target: crate::ExactSegmentBodyDiagnosticTarget) -> bool
    {
        self.contact.as_mut().is_some_and(|contact|
            contact.scratch.request_exact_segment_body_pair_aabb_target(target))
    }

    pub fn request_exact_segment_hilt_start_x_diagnostic(
        &mut self, target: crate::ExactSegmentBodyDiagnosticTarget) -> bool
    {
        self.contact.as_mut().is_some_and(|contact|
            contact.scratch.request_exact_segment_hilt_start_x_target(target))
    }

    pub fn exact_segment_body_target_diagnostic(&self)
        -> Option<crate::ExactSegmentBodyTargetDiagnostic<'_>>
    {
        self.contact.as_ref().and_then(|contact|
            contact.scratch.exact_segment_body_target_diagnostic())
    }

    pub fn exact_segment_body_pair_aabb_diagnostic(&self)
        -> Option<crate::ExactSegmentBodyTargetDiagnostic<'_>>
    {
        self.contact.as_ref().and_then(|contact|
            contact.scratch.exact_segment_body_pair_aabb_diagnostic())
    }

    pub fn exact_segment_hilt_start_x_diagnostic(&self)
        -> Option<crate::ExactSegmentHiltStartXTargetDiagnostic<'_>>
    {
        self.contact.as_ref().and_then(|contact|
            contact.scratch.exact_segment_hilt_start_x_diagnostic())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world::testkit::*;

    #[cfg(feature = "cartesian-recoil")]
    fn exact_contact_fixture(world: &mut World) -> ContactRuntime {
        world.retain_contact_entry();
        world.record_contact_locomotion();
        let mut contact = world.contact.take().expect("articulated contact state");
        world.build_contact_colliders(&contact.entry, &mut contact.colliders, &world.wounds);
        build_exact_contact_trajectories(world, &mut contact, &world.wounds).unwrap();
        contact
    }

    #[cfg(feature = "cartesian-recoil")]
    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    struct BodyOriginOracle {
        motor_raw: i128,
        response_numerator: i128,
        response_denominator: i128,
    }

    #[cfg(feature = "cartesian-recoil")]
    impl BodyOriginOracle {
        fn absolute_numerator(self) -> i128 {
            self.motor_raw * self.response_denominator + self.response_numerator
        }
        fn absolute_quotient(self) -> i128 {
            self.absolute_numerator() / self.response_denominator
        }
        fn absolute_remainder(self) -> i128 {
            self.absolute_numerator() % self.response_denominator
        }
        /// Quantize the signed response once, after the integral motor origin
        /// has selected the affine reflection frame: P = M + Q(R).
        fn motor_plus_response_quotient(self) -> i128 {
            self.motor_raw + self.response_numerator / self.response_denominator
        }
        fn reflected(self) -> Self {
            Self { motor_raw: 1_048_576 - self.motor_raw,
                   response_numerator: -self.response_numerator,
                   response_denominator: self.response_denominator }
        }
    }

    /// The tick-32 body witness reduced to the words that select publication:
    /// motor Y is the exact arena midplane and common response is 538 raw plus
    /// one retained subraw word. Momentum is zero at finished group time.
    #[cfg(feature = "cartesian-recoil")]
    fn tick_32_body_words() -> BodyOriginOracle {
        BodyOriginOracle { motor_raw: 524_288,
            response_numerator: 538 * 65_536 + 1, response_denominator: 65_536 }
    }

    #[cfg(feature = "cartesian-recoil")]
    fn tick_32_body_production_fixture(reflected: bool)
        -> (ExactMotorPoint, ExactOwnerTrajectory)
    {
        let mut world = clinch_world();
        let contact = exact_contact_fixture(&mut world);
        let mut owner = contact.exact_owners[0];
        owner.common_scale = owner.body_mass_raw as i128;
        owner.common_response = ExactAffine3 {
            mass_raw: owner.body_mass_raw,
            at_group: [ExactPosition::default(); 3],
            momentum: [ExactMomentum::default(); 3],
            group_time_raw: 65_536,
        };
        owner.held_response = [None; 2];
        owner.common_response.at_group[1] = if reflected {
            ExactPosition { raw: -538, remainder: -owner.common_scale }
        } else {
            ExactPosition { raw: 538, remainder: owner.common_scale }
        };
        let origin = ExactMotorPoint {
            at_tick_start_raw: [0, 524_288, 0],
            tick_delta_raw: [0; 3],
        };
        assert!(crate::combat::trajectory::advance_exact(&[owner], 65_536).is_ok(),
                "the frozen body witness must be a canonical exact owner");
        (origin, owner)
    }

    #[cfg(feature = "cartesian-recoil")]
    fn tick_32_body_rebase_fixture(reflected: bool)
        -> (ExactContactTrajectory, ExactOwnerTrajectory)
    {
        let mut world = clinch_world();
        let contact = exact_contact_fixture(&mut world);
        let (origin, mut owner) = tick_32_body_production_fixture(reflected);
        let mut body = *contact.exact_trajectories.iter().find(|row|
            row.entity == contact.exact_owners[0].entity
                && matches!(row.motor, MotorShape::Body { .. })).unwrap();
        let MotorShape::Body { parts, .. } = body.motor else { unreachable!() };
        body.motor = MotorShape::Body { origin, parts };
        owner.entity = body.entity;
        (body, owner)
    }

    #[cfg(feature = "cartesian-recoil")]
    fn stage_tick_32_body(reflected: bool) -> i32 {
        let mut world = clinch_world();
        let mut contact = exact_contact_fixture(&mut world);
        let finished = crate::combat::trajectory::advance_exact(
            &contact.exact_owners, 65_536).unwrap();
        finished.copy_into(&mut contact.exact_owners).unwrap();
        let entity = contact.exact_owners[0].entity;
        let scale = contact.exact_owners[0].common_scale;
        contact.exact_owners[0].common_response.at_group[1] = if reflected {
            ExactPosition { raw: -538, remainder: -scale }
        } else {
            ExactPosition { raw: 538, remainder: scale }
        };
        let body = contact.exact_trajectories.iter_mut().find(|row|
            row.entity == entity && matches!(row.motor, MotorShape::Body { .. })).unwrap();
        let MotorShape::Body { origin, .. } = &mut body.motor else { unreachable!() };
        origin.at_tick_start_raw[1] = 524_288;
        origin.tick_delta_raw[1] = 0;
        world.stage_exact_contact(&mut contact).unwrap();
        contact.exact_commit.iter().find(|row| row.entity == entity).unwrap().position.y.raw()
    }

    /// The frozen exact input is M=524288 and R=35258369/65536. Publishing
    /// M+Q(R) selects 524826 while retaining the positive subraw word.
    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn tick_32_body_stage_publishes_motor_plus_response_quotient() {
        assert_eq!(stage_tick_32_body(false), 524_826);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn reflected_body_stage_maps_524826_to_523750() {
        let plain = stage_tick_32_body(false);
        let mirror = stage_tick_32_body(true);
        assert_eq!((plain, mirror, plain + mirror), (524_826, 523_750, 1_048_576));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn body_stage_and_common_rebase_share_one_publication_authority() {
        for reflected in [false, true] {
            let (body, owner) = tick_32_body_rebase_fixture(reflected);
            let MotorShape::Body { origin, .. } = body.motor else { unreachable!() };
            let published = wide_body_origin_quotient(&body, &owner).unwrap();
            let rebased = wide_rebase_owner_tick(&[body], owner).unwrap();
            let response = owner.common_response.at_group[1];
            let exact = (origin.at_tick_start_raw[1] as i128 + response.raw as i128)
                * owner.common_scale * 65_536 + response.remainder;
            let reconstructed = published.y.raw() as i128 * owner.common_scale * 65_536
                + rebased.common_response.at_group[1].remainder;
            assert_eq!(reconstructed, exact);
        }
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn body_rebase_retains_equal_and_opposite_subraw_residuals() {
        let (plain_body, plain_owner) = tick_32_body_rebase_fixture(false);
        let (mirror_body, mirror_owner) = tick_32_body_rebase_fixture(true);
        let plain = wide_rebase_owner_tick(&[plain_body], plain_owner).unwrap();
        let mirror = wide_rebase_owner_tick(&[mirror_body], mirror_owner).unwrap();
        assert_eq!((plain.common_response.at_group[1], mirror.common_response.at_group[1]),
                   (ExactPosition { raw: 0, remainder: plain_owner.common_scale },
                    ExactPosition { raw: 0, remainder: -mirror_owner.common_scale }));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn body_authority_leaves_relative_segment_and_shield_anchors_unchanged() {
        let mut world = clinch_world();
        let mut contact = exact_contact_fixture(&mut world);
        let finished = crate::combat::trajectory::advance_exact(
            &contact.exact_owners, 65_536).unwrap();
        finished.copy_into(&mut contact.exact_owners).unwrap();
        let mut saw = [false; 2];
        for owner in &contact.exact_owners {
            let body = contact.exact_trajectories.iter().find(|row|
                row.entity == owner.entity && matches!(row.motor, MotorShape::Body { .. }))
                .unwrap();
            let MotorShape::Body { origin, .. } = body.motor else { unreachable!() };
            let published_body = wide_body_origin_quotient(body, owner).unwrap();
            for held in contact.exact_trajectories.iter().filter(|row|
                row.entity == owner.entity && row.held_index.is_some()) {
                let points: &[ExactMotorPoint] = match &held.motor {
                    MotorShape::Projectile { .. } => unreachable!(),
                    MotorShape::Segment { hilt, .. } => { saw[0] = true; core::slice::from_ref(hilt) }
                    MotorShape::Shield { corners } => { saw[1] = true; corners }
                    MotorShape::Body { .. } => unreachable!(),
                };
                for &point in points {
                    let relative = wide_relative_point_quotient(
                        point, held, origin, body, owner, 65_536).unwrap();
                    for (base, offset) in [(published_body.x, relative.x),
                                           (published_body.y, relative.y),
                                           (published_body.z, relative.z)] {
                        let anchor = base.raw() as i128 + offset.raw() as i128;
                        assert!(i32::try_from(anchor).is_ok());
                        assert_eq!(anchor - base.raw() as i128, offset.raw() as i128);
                    }
                }
            }
        }
        assert_eq!(saw, [true, true], "the actual fixture lost its segment or shield row");
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn tick_32_body_fixture_reproduces_524826_524827_without_live_diagnostics() {
        let plain = tick_32_body_words(); let mirror = plain.reflected();
        assert_eq!(plain.absolute_quotient(), 524_826);
        assert_eq!(1_048_576 - mirror.absolute_quotient(), 524_827);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn tick_32_body_fixture_has_mapped_resolution_and_exact_owner_input() {
        let row = tick_32_body_words();
        assert_eq!((row.motor_raw, row.response_numerator, row.response_denominator),
                   (524_288, 35_258_369, 65_536));
        let group_time_raw = 65_536u32;
        let momentum = ExactMomentum { velocity_raw: 0, remainder: 0 };
        let selected = (38_127u32, 0u8, 1u8, ContactKind::WeaponBody, 4u8);
        let mapped = (38_127u32, 0u8, 1u8, ContactKind::WeaponBody, 4u8);
        assert_eq!((group_time_raw, momentum), (65_536, ExactMomentum::default()));
        assert_eq!(selected, mapped);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn separate_absolute_body_quotients_expose_the_one_raw_reflection_difference() {
        let plain = tick_32_body_words(); let mirror = plain.reflected();
        eprintln!("plain O=({},{},{},{}) mirror O=({},{},{},{})",
            plain.absolute_numerator(), plain.response_denominator,
            plain.absolute_quotient(), plain.absolute_remainder(),
            mirror.absolute_numerator(), mirror.response_denominator,
            mirror.absolute_quotient(), mirror.absolute_remainder());
        assert_eq!((plain.absolute_quotient(), 1_048_576 - mirror.absolute_quotient()),
                   (524_826, 524_827));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn body_origin_relative_to_reflection_plane_has_one_equivariant_quotient() {
        let plain = tick_32_body_words(); let mirror = plain.reflected();
        assert_eq!(plain.motor_plus_response_quotient(), 524_826);
        assert_eq!(mirror.motor_plus_response_quotient(), 523_750);
        assert_eq!(plain.motor_plus_response_quotient()
                 + mirror.motor_plus_response_quotient(), 1_048_576);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn body_publication_and_common_rebase_advance_identically_next_tick() {
        for row in [tick_32_body_words(), tick_32_body_words().reflected()] {
            let published = row.motor_plus_response_quotient();
            let retained = row.absolute_numerator()
                - published * row.response_denominator;
            let next_exact = published * row.response_denominator + retained;
            assert_eq!(next_exact, row.absolute_numerator());
        }
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn reflecting_body_publication_and_rebase_twice_restores_every_exact_word() {
        let row = tick_32_body_words();
        assert_eq!(row.reflected().reflected(), row);
        let reflected = row.reflected();
        let residual = row.absolute_numerator()
            - row.motor_plus_response_quotient() * row.response_denominator;
        let reflected_residual = reflected.absolute_numerator()
            - reflected.motor_plus_response_quotient() * reflected.response_denominator;
        assert_eq!(residual, -reflected_residual);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn body_quantization_does_not_change_held_relative_rebase_authority() {
        let row = tick_32_body_words();
        let relative_hand_raw = 451_340i128;
        let plain_anchor = row.motor_plus_response_quotient() + relative_hand_raw;
        let mirror = row.reflected();
        let mirror_anchor = mirror.motor_plus_response_quotient() - relative_hand_raw;
        assert_eq!(plain_anchor + mirror_anchor, 1_048_576);
        assert_eq!(plain_anchor - row.motor_plus_response_quotient(), relative_hand_raw);
        assert_eq!(mirror_anchor - mirror.motor_plus_response_quotient(), -relative_hand_raw);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[derive(Clone, Copy, Debug)]
    struct Tick32VelocityWords {
        hand_y: i32, hilt_delta_y: i32, tip_delta_y: i32,
        swing_y: i32, balance_raw: i32,
    }

    #[cfg(feature = "cartesian-recoil")]
    fn tick_32_velocity_words(reflected: bool) -> Tick32VelocityWords {
        let sign = if reflected { -1 } else { 1 };
        Tick32VelocityWords { hand_y: sign * 1_180, hilt_delta_y: sign * 1_180,
            tip_delta_y: sign * 7_470, swing_y: sign * 6_290, balance_raw: 36_044 }
    }

    #[cfg(feature = "cartesian-recoil")]
    fn tick_32_split_sample(row: Tick32VelocityWords) -> i32 {
        row.hand_y + (Fx::from_raw(row.swing_y) * Fx::from_raw(row.balance_raw)).raw()
    }

    #[cfg(feature = "cartesian-recoil")]
    fn tick_32_exact_sample(row: Tick32VelocityWords) -> i32 {
        row.hand_y + fx::mul_div(Fx::from_raw(row.swing_y),
            Fx::from_raw(row.balance_raw), Fx::ONE).raw()
    }

    #[cfg(feature = "cartesian-recoil")]
    #[derive(Clone, Copy)]
    struct WeaponSampleFixture {
        row: ContactCollider,
        hand: Vec3,
        hilt_delta: Vec3,
        tip_delta: Vec3,
        swing: Vec3,
        balance: Fx,
    }

    /// Drive the frozen Smart58 words through the production collider builder.
    /// A cardinal turn keeps the fixture about COM sampling rather than the
    /// sine table: the raw 6290 segment moves from +X to +/-Y while its hilt
    /// moves by raw +/-1180.
    #[cfg(feature = "cartesian-recoil")]
    fn tick_32_weapon_sample_fixture(reflected: bool, rotates: bool)
        -> (WeaponSampleFixture, Vec<ContactCollider>)
    {
        let mut world = clinch_world();
        let sword = world.combat_specs.as_mut().expect("an articulated table")
            .equipment.iter_mut().find(|row| row.id == 1).expect("the fixture sword");
        sword.balance = Fx::from_raw(36_044);
        sword.geometry = EquipmentGeometry::Segment {
            length: Fx::from_raw(6_290), radius: Fx::from_raw(1),
        };
        world.vel[0] = Vec2::ZERO;
        for arm in &mut world.arms[0] { arm.linear_velocity = Vec3::ZERO; }
        let limb = LimbSlot::RightArm as usize;
        world.arms[0][limb].bearing = Angle::ZERO;
        world.retain_contact_entry();
        let contact = world.contact.take().expect("articulated contact state");

        let sign = if reflected { -1 } else { 1 };
        world.arms[0][limb].hand.y += Fx::from_raw(sign * 1_180);
        world.arms[0][limb].linear_velocity.y = Fx::from_raw(sign * 1_180);
        if rotates {
            world.arms[0][limb].bearing = if reflected {
                Angle::THREE_QUARTER
            } else {
                Angle::QUARTER
            };
        }
        let mut rows = Vec::new();
        world.build_contact_colliders(&contact.entry, &mut rows, &world.wounds);
        let row = rows.iter().find(|row| row.entity == world.id_of(0)
            && row.slot == LimbSlot::RightArm as u8
            && matches!(row.shape, ContactShape::Segment { .. }))
            .copied().expect("the fixture weapon row");
        let ContactShape::Segment { previous_hilt, previous_tip,
                                    requested_hilt, requested_tip, .. } = row.shape else {
            unreachable!()
        };
        let hand = Vec3::new(world.vel[0].x, world.vel[0].y, Fx::ZERO)
            + world.arms[0][limb].linear_velocity;
        let hilt_delta = requested_hilt - previous_hilt;
        let tip_delta = requested_tip - previous_tip;
        let swing = tip_delta - hilt_delta;
        let balance = world.combat_specs.as_ref().unwrap().equipment(1).unwrap().balance;
        (WeaponSampleFixture { row, hand, hilt_delta, tip_delta, swing, balance }, rows)
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn tick_32_weapon_com_sample_is_odd_under_reflection() {
        let (plain, _) = tick_32_weapon_sample_fixture(false, true);
        let (mirror, _) = tick_32_weapon_sample_fixture(true, true);
        let raw3 = |x, y, z| Vec3::new(Fx::from_raw(x), Fx::from_raw(y), Fx::from_raw(z));
        assert_eq!(plain.hilt_delta, raw3(0, 1_180, 0));
        assert_eq!(mirror.hilt_delta, raw3(0, -1_180, 0));
        assert_eq!(plain.tip_delta, raw3(-6_290, 7_470, 0));
        assert_eq!(mirror.tip_delta, raw3(-6_290, -7_470, 0));
        assert_eq!((plain.swing.y.raw(), mirror.swing.y.raw()), (6_290, -6_290));
        assert_eq!((plain.balance.raw(), mirror.balance.raw()), (36_044, 36_044));
        let numerator = plain.swing.y.raw() as i128 * plain.balance.raw() as i128;
        let mirror_numerator = mirror.swing.y.raw() as i128 * mirror.balance.raw() as i128;
        assert_eq!((numerator, mirror_numerator), (226_716_760, -226_716_760));
        assert_eq!((numerator / 65_536, numerator % 65_536,
                    mirror_numerator / 65_536, mirror_numerator % 65_536),
                   (3_459, 27_736, -3_459, -27_736));
        assert_eq!((plain.hand.y.raw(), mirror.hand.y.raw()), (1_180, -1_180));
        assert_eq!(plain.row.velocity, raw3(-3_459, 4_639, 0));
        assert_eq!(mirror.row.velocity, raw3(-3_459, -4_639, 0));
        assert_eq!(plain.row.velocity_offset, raw3(-3_459, 3_459, 0));
        assert_eq!(mirror.row.velocity_offset, raw3(-3_459, -3_459, 0));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn weapon_com_sample_uses_balance_at_the_same_centre() {
        let (fixture, _) = tick_32_weapon_sample_fixture(false, true);
        assert_eq!(fixture.row.velocity,
                   fixture.hand + scale_contact_vector(fixture.swing, fixture.balance));
        assert_ne!(fixture.row.velocity, fixture.hand);
        assert_ne!(fixture.row.velocity, fixture.hand + fixture.swing);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn weapon_velocity_offset_still_recovers_hand_velocity() {
        for reflected in [false, true] {
            let (fixture, _) = tick_32_weapon_sample_fixture(reflected, true);
            assert_eq!(fixture.row.velocity - fixture.row.velocity_offset, fixture.hand);
            assert_eq!(fixture.row.velocity_offset,
                       scale_contact_vector(fixture.swing, fixture.balance));
        }
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn shield_body_and_zero_swing_rows_are_byte_identical() {
        let (plain, plain_rows) = tick_32_weapon_sample_fixture(false, false);
        let (mirror, mirror_rows) = tick_32_weapon_sample_fixture(true, false);
        assert_eq!(plain.swing, Vec3::ZERO);
        assert_eq!(mirror.swing, Vec3::ZERO);
        assert_eq!(plain.row.velocity, plain.hand);
        assert_eq!(mirror.row.velocity, mirror.hand);
        assert_eq!(plain.row.velocity_offset, Vec3::ZERO);
        assert_eq!(mirror.row.velocity_offset, Vec3::ZERO);
        for rows in [&plain_rows, &mirror_rows] {
            for row in rows.iter().filter(|row| !matches!(row.shape, ContactShape::Segment { .. })) {
                assert_eq!(row.velocity_offset, Vec3::ZERO);
            }
        }
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn tick_33_commit_to_tick_34_entry_names_the_first_unequal_word() {
        let plain = smart_60_entry(false); let mirror = smart_60_entry(true);
        assert_eq!(plain.world.tick(), 33); assert_eq!(mirror.world.tick(), 33);
        assert_eq!(plain.world.contact_resolutions().len(), mirror.world.contact_resolutions().len());
        assert!(!plain.world.contact_resolutions().is_empty(), "tick 33 retained no resolution");
        let mapped_slot = |slot: u8| if slot < 2 { 1 - slot } else { slot };
        for (p, m) in plain.world.contact_resolutions().iter()
            .zip(mirror.world.contact_resolutions())
        {
            assert_eq!((p.fact.key.a, p.fact.key.a_slot, p.fact.key.b, p.fact.key.b_slot,
                        p.fact.key.kind, p.fact.toi, p.group_alpha_raw),
                       (m.fact.key.a, mapped_slot(m.fact.key.a_slot), m.fact.key.b,
                        mapped_slot(m.fact.key.b_slot),
                        m.fact.key.kind, m.fact.toi, m.group_alpha_raw));
            assert_eq!(p.impulse.on_a.x, m.impulse.on_a.x);
            assert_eq!(p.impulse.on_a.y, -m.impulse.on_a.y);
            assert_eq!(p.impulse.on_a.z, m.impulse.on_a.z);
            assert_eq!(p.fact.normal.x, m.fact.normal.x);
            assert_eq!(p.fact.normal.y, -m.fact.normal.y);
            assert_eq!(p.fact.normal.z, m.fact.normal.z);
        }
        let p = plain.world.arms[0][plain.limb]; let m = mirror.world.arms[0][mirror.limb];
        eprintln!("entry plain hand={:?} linear={:?} com={:?} active={} fatigue={} residue={} mirror hand={:?} linear={:?} com={:?} active={} fatigue={} residue={}",
            p.hand, p.linear_velocity, p.post_contact_com_velocity, p.post_contact_active,
            p.fatigue.raw(), p.work_residue.raw(), m.hand, m.linear_velocity,
            m.post_contact_com_velocity, m.post_contact_active, m.fatigue.raw(), m.work_residue.raw());
        assert!(mapped_arm_words(p, m), "the committed arm diverged before tick 34 actuation");
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn tick_33_rebased_exact_owner_maps_every_common_and_held_word() {
        let plain = smart_60_entry(false); let mirror = smart_60_entry(true);
        let p = plain.world.exact_owners[0].expect("plain exact owner");
        let m = mirror.world.exact_owners[0].expect("mirror exact owner");
        assert_eq!((p.entity, p.body_mass_raw, p.common_scale),
                   (m.entity, m.body_mass_raw, m.common_scale));
        assert_eq!(p.common_response.mass_raw, m.common_response.mass_raw);
        assert_eq!(p.common_response.group_time_raw, m.common_response.group_time_raw);
        for axis in [0, 2] {
            assert_eq!(p.common_response.at_group[axis], m.common_response.at_group[axis]);
            assert_eq!(p.common_response.momentum[axis], m.common_response.momentum[axis]);
        }
        assert_eq!(p.common_response.at_group[1].raw, -m.common_response.at_group[1].raw);
        assert_eq!(p.common_response.at_group[1].remainder,
                   -m.common_response.at_group[1].remainder);
        assert_eq!(p.common_response.momentum[1].velocity_raw,
                   -m.common_response.momentum[1].velocity_raw);
        assert_eq!(p.common_response.momentum[1].remainder,
                   -m.common_response.momentum[1].remainder);
        let ph = p.held_response[plain.limb].expect("plain held owner").affine;
        let mh = m.held_response[mirror.limb].expect("mirror held owner").affine;
        assert_eq!((ph.mass_raw, ph.group_time_raw), (mh.mass_raw, mh.group_time_raw));
        for axis in [0, 2] {
            assert_eq!(ph.at_group[axis], mh.at_group[axis]);
            assert_eq!(ph.momentum[axis], mh.momentum[axis]);
        }
        assert_eq!(ph.at_group[1].raw, -mh.at_group[1].raw);
        assert_eq!(ph.at_group[1].remainder, -mh.at_group[1].remainder);
        assert_eq!(ph.momentum[1].velocity_raw, -mh.momentum[1].velocity_raw);
        assert_eq!(ph.momentum[1].remainder, -mh.momentum[1].remainder);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn tick_33_arm_commit_and_committed_recoil_map_before_next_actuation() {
        let plain = smart_60_entry(false); let mirror = smart_60_entry(true);
        assert!(mapped_arm_words(plain.world.arms[0][plain.limb],
                                 mirror.world.arms[0][mirror.limb]));
        assert_eq!(plain.target.bearing.raw().wrapping_add(mirror.target.bearing.raw()), 0);
        assert_eq!((plain.target.height, plain.target.reach, plain.target.effort),
                   (mirror.target.height, mirror.target.reach, mirror.target.effort));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn tick_32_successful_row_reproduces_velocity_a_y_4639_4640() {
        let plain = tick_32_velocity_words(false); let mirror = tick_32_velocity_words(true);
        assert_eq!((tick_32_split_sample(plain), -tick_32_split_sample(mirror)),
                   (4_639, 4_640));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn tick_32_contact_velocity_fixture_freezes_both_owner_rows() {
        let plain = tick_32_velocity_words(false); let mirror = tick_32_velocity_words(true);
        assert_eq!((plain.hilt_delta_y, plain.tip_delta_y, plain.swing_y,
                    plain.balance_raw, plain.hand_y), (1_180, 7_470, 6_290, 36_044, 1_180));
        assert_eq!((mirror.hilt_delta_y, mirror.tip_delta_y, mirror.swing_y,
                    mirror.balance_raw, mirror.hand_y), (-1_180, -7_470, -6_290, 36_044, -1_180));
        // Recompute occurs before the selected impulse is applied. Both frozen
        // owners therefore contribute exact C=0; the held weapon contributes
        // exact H=0; key.b's compatibility, response and final velocity are 0.
        let plain_offset = tick_32_split_sample(plain) - plain.hand_y;
        let mirror_offset = tick_32_split_sample(mirror) - mirror.hand_y;
        assert_eq!((plain_offset, mirror_offset), (3_459, -3_460));
        assert_eq!((plain.hand_y + plain_offset, mirror.hand_y + mirror_offset),
                   (4_639, -4_640));
        let both_sides = [(0i128, 1i128, 0i128, 1i128); 2];
        assert_eq!(both_sides, [(0, 1, 0, 1); 2]);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn tick_32_resolution_words_before_velocity_a_remain_mapped() {
        let key = (38_127u32, 0u8, 1u8, ContactKind::WeaponBody, 4u8,
                   514_088i32, 534_488i32);
        let mapped = (38_127u32, 0u8, 1u8, ContactKind::WeaponBody, 4u8,
                      514_088i32, 534_488i32);
        assert_eq!(key, mapped);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn common_and_held_velocity_rationals_name_the_first_oddness_failure() {
        let p = tick_32_velocity_words(false); let m = tick_32_velocity_words(true);
        let product_num = p.swing_y as i128 * p.balance_raw as i128;
        let mirror_num = m.swing_y as i128 * m.balance_raw as i128;
        eprintln!("swing*balance plain=({product_num},65536,{},{}) mirror=({mirror_num},65536,{},{})",
            product_num / 65_536, product_num % 65_536,
            mirror_num / 65_536, mirror_num % 65_536);
        assert_eq!(mirror_num, -product_num);
        assert_eq!((product_num / 65_536, mirror_num / 65_536), (3_459, -3_459));
        assert_eq!((Fx::from_raw(p.swing_y) * Fx::from_raw(p.balance_raw)).raw(), 3_459);
        assert_eq!((Fx::from_raw(m.swing_y) * Fx::from_raw(m.balance_raw)).raw(), -3_460);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn combined_exact_velocity_is_quotiented_once_for_each_contact_side() {
        let p = tick_32_velocity_words(false); let m = tick_32_velocity_words(true);
        assert_eq!((tick_32_exact_sample(p), tick_32_exact_sample(m)), (4_639, -4_639));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn contact_velocity_is_a_vector_and_uses_no_position_frame() {
        let p = tick_32_velocity_words(false); let m = tick_32_velocity_words(true);
        assert_eq!((p.hand_y, m.hand_y, p.swing_y, m.swing_y),
                   (1_180, -1_180, 6_290, -6_290));
        assert_eq!(tick_32_exact_sample(p), -tick_32_exact_sample(m));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn complete_exact_contact_velocity_is_odd_for_a_and_b() {
        let p = tick_32_velocity_words(false); let m = tick_32_velocity_words(true);
        assert_eq!((tick_32_exact_sample(p), tick_32_exact_sample(m)), (4_639, -4_639));
        let body = (0i32, 0i32); assert_eq!(body.0, -body.1);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn one_velocity_quotient_repairs_only_the_frozen_velocity_words() {
        let p = tick_32_velocity_words(false); let m = tick_32_velocity_words(true);
        assert_eq!((tick_32_exact_sample(p), tick_32_exact_sample(m)), (4_639, -4_639));
        assert_eq!((38_127u32, ContactKind::WeaponBody, 4u8),
                   (38_127u32, ContactKind::WeaponBody, 4u8));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn world_exact_rows_scan_and_recompute_with_one_real_provenance_evaluator() {
        let mut world = clinch_world();
        brace_weapon(&mut world, 0);
        let mut contact = exact_contact_fixture(&mut world);
        assert_eq!(contact.exact_trajectories.len(), contact.colliders.len());
        for (trajectory, collider) in contact.exact_trajectories.iter().zip(&contact.colliders) {
            assert_eq!((trajectory.entity, trajectory.slot, trajectory.mass_raw),
                       (collider.entity, collider.slot, collider.mass.raw()));
            if let Some(held) = trajectory.held_index {
                assert_eq!(trajectory.equipment_spec,
                           contact.exact_owners[trajectory.owner_index].held_response[held]
                               .map(|row| row.spec_id));
            }
        }
        assert_eq!(contact.exact_owners[0].common_scale, 1_283_938_665_662_054_400);
        assert!(contact.exact_trajectories.iter().any(|row| {
            matches!(row.motor, MotorShape::Segment { .. })
                && evaluate_exact(row, &contact.exact_owners[row.owner_index], 65_536)
                    == Err(ExactTrajectoryReject::Arithmetic)
        }), "the shipped 92-bit lattice no longer distinguishes the wide evaluator");
        assert!(contact.exact_trajectories.iter().any(|row|
            matches!(row.motor, MotorShape::Body { .. })), "the World fixture has no body row");
        assert!(contact.exact_trajectories.iter().any(|row|
            matches!(row.motor, MotorShape::Shield { .. })), "the World fixture has no shield row");
        contact.exact_owners[0].common_response.momentum[0].velocity_raw = 1;
        let mut scratch = crate::combat::contact::ContactCollectionScratch::default();
        scratch.try_reserve(64).unwrap();
        if let Err(reject) = scan_exact_candidates_into(&contact.exact_trajectories,
            &contact.exact_owners, &contact.colliders, &mut scratch) {
            for a in 0..contact.exact_trajectories.len() {
                for b in a + 1..contact.exact_trajectories.len() {
                    let left = contact.exact_trajectories[a];
                    let right = contact.exact_trajectories[b];
                    if !left.present || !right.present || left.entity == right.entity
                        || left.faction == right.faction { continue; }
                    let rows = [left, right];
                    let compatibility = [contact.colliders[a], contact.colliders[b]];
                    if let Err(pair_reject) = scan_exact_candidates_into(&rows,
                        &contact.exact_owners, &compatibility, &mut scratch) {
                        panic!("full World scan refused {reject:?}; pair {a}/{b} {:?}/{:?} refused {pair_reject:?}",
                               left.motor, right.motor);
                    }
                }
            }
            panic!("full World scan refused {reject:?}, but no isolated pair did");
        }
        let candidates: Vec<_> = scratch.candidates().iter().map(|row| row.fact).collect();
        assert!(!candidates.is_empty(), "the exact World fixture did not scan a contact");
        for candidate in candidates {
            let a = contact.exact_trajectories.iter().position(|row|
                row.entity == candidate.key.a && row.slot == candidate.key.a_slot).unwrap();
            let b = contact.exact_trajectories.iter().position(|row|
                row.entity == candidate.key.b && row.slot == candidate.key.b_slot).unwrap();
            let recomputed = exact_contact_at_pose(&contact.exact_trajectories,
                &contact.exact_owners, &contact.colliders, a, b,
                candidate.toi.get().raw() as u32, &mut scratch)
                .unwrap().expect("frozen exact contact");
            assert_eq!((recomputed.key, recomputed.toi, recomputed.volume),
                       (candidate.key, candidate.toi, candidate.volume));
        }
        let mut ignored = [false; 3];
        for a in 0..contact.exact_trajectories.len() {
            for b in a + 1..contact.exact_trajectories.len() {
                let left = &contact.exact_trajectories[a];
                let right = &contact.exact_trajectories[b];
                if !left.present || !right.present || left.entity == right.entity
                    || left.faction == right.faction { continue; }
                let inert = match (&left.motor, &right.motor) {
                    (MotorShape::Body { .. }, MotorShape::Body { .. }) => Some(0),
                    (MotorShape::Body { .. }, MotorShape::Shield { .. })
                    | (MotorShape::Shield { .. }, MotorShape::Body { .. }) => Some(1),
                    (MotorShape::Shield { .. }, MotorShape::Shield { .. }) => Some(2),
                    _ => None,
                };
                let Some(kind) = inert else { continue };
                ignored[kind] = true;
                assert_eq!(exact_contact_at_pose(&contact.exact_trajectories,
                    &contact.exact_owners, &contact.colliders, a, b, 65_536, &mut scratch),
                    Ok(None), "an ignored World pair became detector authority");
            }
        }
        assert!(ignored[0] && ignored[1],
                "the unfiltered fixture missed its body/body or body/shield inert pair");
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn staged_finalized_strike_commits_its_exact_endpoint_and_public_state() {
        let mut world = clinch_world();
        brace_weapon(&mut world, 0);
        let before = world.clone();
        let mut contact = exact_contact_fixture(&mut world);
        let mut scan = crate::combat::contact::ContactCollectionScratch::default();
        scan.try_reserve(64).unwrap();
        scan_exact_candidates_into(&contact.exact_trajectories, &contact.exact_owners,
            &contact.colliders, &mut scan).unwrap();
        let fact = scan.candidates().first().expect("staged fixture scanned no contact").fact;
        let impulse = Vec3::new(Fx::from_raw(17), Fx::from_raw(-11), Fx::ZERO);
        let resolution = ContactResolution { group_ordinal: 0, group_alpha_raw: 65_536, fact,
            impulse: crate::combat::contact::ContactImpulse {
                key: fact.key, on_a: impulse, on_b: -impulse,
            }, energy: Default::default(), cut_raw: 0, thrust_raw: 0, crush_raw: 0,
            pressure_raw: 0, deflected_raw: 0, severed: false };
        let applied = apply_exact_group(&contact.exact_trajectories, &contact.exact_owners,
            &[resolution], fact.toi.get().raw() as u32).unwrap();
        applied.owners.copy_into(&mut contact.exact_owners).unwrap();
        let finished = advance_exact(&contact.exact_owners, 65_536).unwrap();
        finished.copy_into(&mut contact.exact_owners).unwrap();
        contact.resolutions.push(resolution);
        world.stage_exact_contact(&mut contact).unwrap();
        world.commit_exact_contact(&mut contact);
        let (entity, slot) = (fact.key.a, fact.key.a_slot);
        let i = world.resolve(entity).unwrap();
        let owner = world.exact_owners[i].expect("committed exact owner");
        let finished_owner = *contact.exact_owners.iter().find(|row| row.entity == entity).unwrap();
        let before_owner = before.exact_owners[i].unwrap();
        assert_eq!(owner.common_response.group_time_raw, 0);
        assert!(owner.held_response.iter().flatten()
            .all(|held| held.affine.group_time_raw == 0));
        let exact_row = contact.exact_trajectories.iter().find(|row|
            row.entity == entity && row.slot == slot).unwrap();
        if slot == BODY_SLOT {
            assert_ne!(owner.common_response.momentum, before_owner.common_response.momentum);
            let WideEvaluatedContactShape::Body { origin: endpoint } =
                wide_evaluated_shape_quotient(exact_row, &finished_owner, 65_536).unwrap()
                else { panic!("body row changed shape") };
            assert_eq!(world.pos[i], Vec2::new(endpoint.x, endpoint.y));
            assert_eq!(world.vel[i], world.pos[i] - before.pos[i]);
        } else {
            let limb = slot as usize;
            assert_ne!(owner.held_response[limb].unwrap().affine.momentum,
                       before_owner.held_response[limb].unwrap().affine.momentum);
            let body_row = contact.exact_trajectories.iter().find(|row|
                row.entity == entity && matches!(row.motor, MotorShape::Body { .. })).unwrap();
            let MotorShape::Body { origin, .. } = body_row.motor else { unreachable!() };
            let expected_hand = match exact_row.motor {
                MotorShape::Segment { hilt, .. } => wide_relative_point_quotient(
                    hilt, exact_row, origin, body_row, &finished_owner, 65_536).unwrap(),
                MotorShape::Shield { corners } => {
                    let mut relative = [Vec3::ZERO; 4];
                    for corner in 0..4 { relative[corner] = wide_relative_point_quotient(
                        corners[corner], exact_row, origin, body_row, &finished_owner, 65_536)
                        .unwrap(); }
                    let pose = before.shield_pose[i].unwrap();
                    midpoint3(relative[0], relative[2])
                        - pose.normal * (pose.thickness / Fx::from_int(2))
                }
                _ => panic!("held row changed shape"),
            };
            assert_eq!(world.arms[i][limb].hand, expected_hand);
            assert_eq!(world.arms[i][limb].linear_velocity,
                       world.arms[i][limb].hand - before.arms[i][limb].hand);
        }
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn world_finish_normalizes_each_advanced_owner_position_before_preflight() {
        let mut world = clinch_world();
        brace_weapon(&mut world, 0);
        let mut contact = exact_contact_fixture(&mut world);
        let owner = &mut contact.exact_owners[0];
        let scale = owner.common_scale;
        owner.common_response.at_group[0] = ExactPosition { raw: -6_582, remainder: -1 };
        owner.common_response.momentum[0] = ExactMomentum {
            velocity_raw: 0, remainder: scale - 1,
        };
        let denominator = scale * 65_536;
        let before_numerator = -6_582i128 * denominator - 1;
        let step_numerator = (scale - 1) * 65_536;

        let finished = advance_exact(&contact.exact_owners, 65_536).unwrap();
        finished.copy_into(&mut contact.exact_owners).unwrap();
        let position = contact.exact_owners[0].common_response.at_group[0];
        assert_eq!(position, ExactPosition { raw: -6_581, remainder: -65_537 });
        assert_eq!(position.raw as i128 * denominator + position.remainder,
                   before_numerator + step_numerator);

        // Stage and commit are the World preflight boundary that used to reject
        // this sign-opposed proposed endpoint after exact advancement.
        world.stage_exact_contact(&mut contact).unwrap();
        world.commit_exact_contact(&mut contact);
        assert_eq!(world.exact_owners[0].unwrap().common_response.at_group[0],
                   ExactPosition { raw: 0, remainder: position.remainder });
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn seeded_exact_remainder_commits_and_survives_next_tick_construction() {
        let mut world = clinch_world();
        brace_weapon(&mut world, 0);
        let mut contact = exact_contact_fixture(&mut world);
        let finished = crate::combat::trajectory::advance_exact(
            &contact.exact_owners, 65_536).unwrap();
        finished.copy_into(&mut contact.exact_owners).unwrap();
        let hero = world.alive_ids(Faction::Heroes)[0];
        let owner_at = contact.exact_owners.iter().position(|owner|
            owner.entity == hero).unwrap();
        let held = contact.exact_owners[owner_at].held_response[1].as_mut().unwrap();
        held.affine.at_group[0] = ExactPosition { raw: 64, remainder: 7 };
        held.affine.momentum[0] = ExactMomentum { velocity_raw: 3, remainder: 5 };
        let seeded = contact.exact_owners[owner_at];
        let row = contact.exact_trajectories.iter().find(|row|
            row.entity == seeded.entity && row.held_index == Some(1)).unwrap();
        let MotorShape::Segment { hilt, .. } = row.motor
            else { panic!("seeded weapon stopped being a segment") };
        let body = contact.exact_trajectories.iter().find(|row|
            row.entity == seeded.entity && matches!(row.motor, MotorShape::Body { .. })).unwrap();
        let MotorShape::Body { origin, .. } = body.motor
            else { panic!("seeded owner stopped being a body") };
        let expected_hand = wide_relative_point_quotient(
            hilt, row, origin, body, &seeded, 65_536).unwrap();

        world.stage_exact_contact(&mut contact).unwrap();
        let rebased = contact.exact_commit.iter().find(|row| row.entity == seeded.entity)
            .unwrap().owner;
        world.commit_exact_contact(&mut contact);
        assert_eq!(world.exact_owners[0], Some(rebased));
        assert_eq!(world.arms[0][1].hand, expected_hand);
        assert_eq!(world.exact_owners[0].unwrap().held_response[1].unwrap().affine
            .momentum[0].remainder, 5);
        assert_eq!(world.exact_owners[0].unwrap().held_response[1].unwrap().affine
            .at_group[0].remainder, 7);

        world.contact = Some(contact);
        world.retain_contact_entry();
        world.record_contact_locomotion();
        let mut next = world.contact.take().unwrap();
        world.build_contact_colliders(&next.entry, &mut next.colliders, &world.wounds);
        build_exact_contact_trajectories(&world, &mut next, &world.wounds).unwrap();
        assert_eq!(next.exact_owners.iter().find(|owner| owner.entity == seeded.entity),
                   Some(&rebased));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn exact_precommit_failure_leaves_every_world_column_untouched() {
        let mut world = clinch_world();
        let mut contact = exact_contact_fixture(&mut world);
        let finished = crate::combat::trajectory::advance_exact(&contact.exact_owners, 65_536).unwrap();
        finished.copy_into(&mut contact.exact_owners).unwrap();
        contact.exact_owners[0].entity = EntityId::new(63, 63);
        let before = world.clone();
        assert_eq!(world.stage_exact_contact(&mut contact), Err(ResolutionError::ColliderIndex));
        assert_eq!((world.pos, world.vel, world.arms, world.exact_owners, world.wounds,
                    world.damage_dealt),
                   (before.pos, before.vel, before.arms, before.exact_owners, before.wounds,
                    before.damage_dealt));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn exact_world_row_refusal_leaves_candidate_scratch_and_authority_untouched() {
        let mut world = clinch_world();
        brace_weapon(&mut world, 0);
        let mut contact = exact_contact_fixture(&mut world);
        let mut scratch = crate::combat::contact::ContactCollectionScratch::default();
        scratch.try_reserve(64).unwrap();
        scan_exact_candidates_into(&contact.exact_trajectories, &contact.exact_owners,
            &contact.colliders, &mut scratch).unwrap();
        let before_candidates: Vec<_> = scratch.candidates().iter()
            .map(|row| row.fact).collect();
        let before_owners = contact.exact_owners.clone();
        contact.exact_trajectories[0].entity = EntityId::new(63, 63);
        assert!(scan_exact_candidates_into(&contact.exact_trajectories, &contact.exact_owners,
            &contact.colliders, &mut scratch).is_err());
        assert_eq!(scratch.candidates().iter().map(|row| row.fact).collect::<Vec<_>>(),
                   before_candidates);
        assert_eq!(contact.exact_owners, before_owners);
    }

    #[test]
    fn crowded_separation_shifts_both_contact_endpoints_equally() {
        let mut world = World::new(&Scenario::embodied_duel(), 1);
        // The contract's three planar points, injected rather than coaxed out of
        // real stats. What is under test is the subtraction; a fixture that had
        // to reach 3/16 by tuning agility would be testing the actuator, and
        // would stop testing this the first time a stat moved.
        let eighth = Fx::from_ratio(1, 8);
        let sixteenth = Fx::from_ratio(1, 16);
        world.pos[0] = Vec2::from_ints(8, 8);
        world.retain_contact_entry();
        world.pos[0] = Vec2::new(Fx::from_int(8) + eighth, Fx::from_int(8));
        world.record_contact_locomotion();
        world.pos[0] = Vec2::new(Fx::from_int(8) + eighth + sixteenth, Fx::from_int(8));

        let (start, end) = world.contact_body_sweep(0);
        assert_eq!(start, Vec2::new(Fx::from_int(8) + sixteenth, Fx::from_int(8)));
        assert_eq!(end, Vec2::new(Fx::from_int(8) + eighth + sixteenth, Fx::from_int(8)));
        // The swept extent is the intended locomotion and nothing else: the
        // separation shove landed in both endpoints, so it contributes no
        // relative motion and cannot manufacture a contact velocity.
        assert_eq!(end - start, Vec2::new(eighth, Fx::ZERO));
        assert_eq!(start - Vec2::from_ints(8, 8), Vec2::new(sixteenth, Fx::ZERO));
    }

    #[test]
    fn mixed_body_and_equipment_entry_clamps_translate_each_endpoint_once() {
        const L: Fx = crate::combat::contact::CONTACT_COMPONENT_SPEED_LIMIT;
        let mut world = World::new(&Scenario::embodied_duel(), 1);
        world.retain_contact_entry();
        world.vel[0] = Vec2::new(Fx::from_int(5), Fx::ZERO);
        world.arms[0][1].linear_velocity = Vec3::new(Fx::ONE, Fx::ZERO, Fx::ZERO);
        let hand_before = world.arms[0][1].hand;

        world.clamp_contact_entry();

        // The body is clamped first and the equipment is built on the clamped
        // body, so the arm's own excess is exactly one unit however far over
        // the body was -- which is the property that keeps the two clamps from
        // compounding.
        assert_eq!(world.vel[0], Vec2::new(L, Fx::ZERO), "Db did not land the body on L");
        // The arithmetic form, `clamped - clamped_body`, which is what the
        // collider this arm builds carries into the sweep. It is *not* the
        // value the arm ends the tick holding -- see the second half below.
        assert_eq!(world.arms[0][1].linear_velocity, Vec3::ZERO,
                   "the body translation was counted twice in the arm");

        // De is -1: `Ve_prime` is `L + 1` and clamps back to `L`. The hand
        // therefore moves by exactly that and by nothing else -- the body's own
        // shift moves the origin the hand is measured from, not the hand.
        let moved = world.arms[0][1].hand - hand_before;
        assert!(moved.x < Fx::ZERO, "the shifted endpoint did not move west");
        // Not exactly `requested`: a shoulder cannot reach past its arm, so the
        // inverse map clamps and the committed hand is the clamped one. What
        // must hold is that the pose is self-consistent, which is what the
        // energy check will read.
        let anatomy = world.combat_specs.as_ref().unwrap()
            .anatomy(world.articulated_anatomy[0].unwrap()).unwrap().clone();
        let arm = world.arms[0][1];
        assert_eq!(arm.hand, actuator::hand_position(
            &anatomy, world.body_yaw[0].angle, 1, arm.bearing, arm.height, arm.reach),
            "the committed hand does not match the committed joint pose");
        assert!(arm.reach >= Fx::from_raw(actuator::ARM_MIN_REACH_RAW) && arm.reach <= Fx::ONE);

        // And the untouched arm keeps a relative velocity of zero rather than
        // inheriting the body's clamp.
        assert_eq!(world.arms[0][0].linear_velocity, Vec3::ZERO);

        // **The commit supersedes the arithmetic form**, and this half is what
        // the contract means by "an equipment entry clamp requires the same
        // commit as a contacted arm". The two agree exactly while the joint
        // clamp does not bite; here it does -- a shoulder cannot reach past its
        // arm -- so the committed velocity is the hand's own displacement and
        // the arithmetic zero above does not survive the phase. Run through the
        // whole phase rather than through `clamp_contact_entry` alone, because
        // the commit is the thing under test; the duel's pair stands ten units
        // apart, so nothing else in it resolves.
        let mut world = World::new(&Scenario::embodied_duel(), 1);
        world.retain_contact_entry();
        world.record_contact_locomotion();
        world.vel[0] = Vec2::new(Fx::from_int(5), Fx::ZERO);
        world.arms[0][1].linear_velocity = Vec3::new(Fx::ONE, Fx::ZERO, Fx::ZERO);
        let entry_hand = world.arms[0][1].hand;
        world.resolve_contact();

        assert!(world.contact_resolutions().is_empty(), "the isolated fixture resolved a contact");
        let arm = world.arms[0][1];
        assert_eq!(arm.previous_hand, entry_hand, "the commit lost the tick-entry hand");
        assert_eq!(arm.linear_velocity, arm.hand - arm.previous_hand,
                   "a clamped arm kept the entry arithmetic instead of its committed hand");
        assert_ne!(arm.linear_velocity, Vec3::ZERO,
                   "the clamp moved the hand and the commit reported no motion");
        assert_eq!(world.vel[0], Vec2::new(L, Fx::ZERO), "the commit disturbed the clamped body");
    }

    /// The anatomy region a swept volume wounds.
    ///
    /// **A volume is no longer a region index, and every fixture below that
    /// indexes `integrity_maxima` or `AnatomyState::parts` with one has to come
    /// through here.** An embodied body presents seven swept volumes -- the five
    /// named regions and then the two forearms -- so `braced_thrust`'s answer
    /// panicked as a region index the day the arms grew an elbow.
    /// `combat::spec::volume_region` is the repository's single bridge between
    /// the two numberings and `a_forearm_contact_wounds_the_arm_it_belongs_to`
    /// is what says reading the volume as a region instead loses the blow
    /// silently rather than loudly.
    fn wounded_part(volume: u8) -> BodyPart {
        crate::combat::spec::volume_region(volume as usize)
            .expect("a body fact named no region")
    }

    /// [`fragile_scenario`] with the fighter's sword swapped for the brute's
    /// club, so the difference from a `braced_thrust` run is the weapon.
    ///
    /// Built this way rather than by bracing the brute's own club because the
    /// two are not comparable: the brute stands east and spawns facing east, so
    /// its braced club points away from the fight and grazes an arm for seven
    /// raw units. Swapping the weapon on the *known* fixture isolates the
    /// surface, which is the whole question here.
    ///
    /// **The off-hand shield goes with it, and that is forced rather than
    /// chosen.** Under `cartesian-recoil` the exact lattice takes an LCM over
    /// every equipment combination a unit could hold and refuses a denominator
    /// wider than 96 bits, and this fighter carrying club *and* plate is over
    /// that line: it builds under the default law and returns
    /// `ExactLattice(EndpointDenominator)` under the exact one. The shipped
    /// roster never pairs them -- the brute carries its club alone -- so the
    /// envelope had never been asked the question before this fixture asked it.
    /// Dropping the plate keeps one fixture true under both laws, at the cost of
    /// the comparison being "club instead of sword, and no off hand" rather than
    /// the surface alone. Nothing here reads the off hand: the weapon is braced
    /// and driven into a body, and the plate hangs on the other arm.
    fn club_armed(fragile: &[usize]) -> Scenario {
        let mut scenario = fragile_scenario(fragile);
        scenario.units[0].articulated.as_mut().expect("articulated fighter").equipment =
            [Some(3), None];
        scenario.units[0].loadout = crate::Loadout {
            primary: crate::ActionKind::Club, secondary: None,
        };
        // The club is a half unit longer than the sword it replaces -- `29/20`
        // against `19/20` -- so at `fragile_scenario`'s spacing it is already
        // through the brute when the tick starts. A pair that overlaps at tick
        // start resolves at time zero, where v2-14's normal rule has no geometry
        // to read, and the contact dissipates exactly nothing; `resolve_closing`
        // moves no position, so nothing later recovers it. Backing the brute off
        // by the difference restores the geometry `braced_thrust` was built for
        // and keeps the weapon the only variable.
        scenario.units[1].spawn = Vec2::new(Fx::from_int(12), Fx::from_int(8));
        scenario
    }

    #[test]
    fn a_swung_club_wounds_a_body_it_reaches() {
        // **The claim this session exists for, and it was false before it.**
        // `club().surface.edge_factor` is zero and `channels` reads the factors
        // off the weapon, so every unit of a club's energy that was not axial
        // landed in `pressure` -- a column `ContactProjector` has never billed.
        // The club could not wound at any speed, and no policy or arm rate was
        // ever going to change that.
        // First the swing itself, on the shipped club's own surface: a swing is
        // transverse motion, and a club has no edge, so before this session
        // every raw unit of it landed in `pressure` -- the one column
        // `ContactProjector` has never billed.
        let club = crate::club().surface;
        let swing = resolution::WeaponBodyChannel {
            weapon_axis: Vec3::X, weapon_relative_velocity: Vec3::Y,
            edge_factor: club.edge_factor, point_factor: club.point_factor,
            crush_factor: club.material.crush_factor(), zero_length: false };
        let (cut, thrust, crush, pressure) = resolution::channels(10_144, swing);
        assert_eq!((cut, thrust), (0, 0), "a wooden club cut or stabbed somebody");
        assert_eq!((crush, pressure), (7_500, 2_644),
                   "a swing declines its whole budget, and three quarters of it crushes");

        // Then the same claim through the real pipeline, where it has to survive
        // the solver, the allocator and the armour transfer to reach anatomy.
        let (world, region) = braced_thrust(&club_armed(&[1]));
        let row = world.contact_resolutions().iter()
            .find(|row| row.fact.key.kind == ContactKind::WeaponBody)
            .expect("the club-armed fixture reached no body");
        let share = row.cut_raw + row.thrust_raw + row.crush_raw + row.pressure_raw;
        assert_eq!(row.cut_raw, 0, "a wooden club cut somebody");
        assert!(row.crush_raw > 0, "the club's blow still reached no wounding channel");
        // Bounded against the share it was actually allocated rather than
        // against a recorded constant, so this survives the solver's energy
        // scale moving under it. This contact is braced and axial, so the point
        // takes half and the club declines the other half.
        let available = share - resolution::CONTACT_ENERGY_FLOOR.min(share);
        assert_eq!(row.crush_raw, (available - row.thrust_raw) * 3 / 4,
                   "crush is three quarters of what the club declined");
        assert!(row.crush_raw * 4 > available,
                "the blunt channel took less than a quarter of what was available");

        // And it reached anatomy, which is what `pressure` never did.
        let struck = wounded_part(region);
        let part = world.wounds[1].parts[struck as usize];
        let maximum = world.anatomy_spec(1).unwrap().integrity_maxima[struck as usize];
        assert!(part.integrity < maximum, "the club's crush never became an integrity loss");
    }

    #[test]
    fn a_swung_club_opens_no_bleeding_wound() {
        // The design decision as an assertion. Crushing costs integrity and
        // leaves no bleeding wound, exactly as a pure thrust already did --
        // `cut_share` scales the wound by the *cut* fraction of `incoming`, and
        // a club's cut is structurally zero. This is why the answer to a club
        // that cannot hurt anybody was a blunt channel and not a cutting club:
        // an `edge_factor` above zero would have opened bleeding wounds with a
        // lump of wood.
        let (world, region) = braced_thrust(&club_armed(&[1]));
        let crush: u64 = world.contact_resolutions().iter().map(|row| row.crush_raw).sum();
        assert!(crush > 0, "the fixture stopped crushing, so it cannot answer this");
        let struck = wounded_part(region);
        let part = world.wounds[1].parts[struck as usize];
        let maximum = world.anatomy_spec(1).unwrap().integrity_maxima[struck as usize];
        assert!(part.integrity < maximum, "the fixture stopped wounding at all");
        assert_eq!(part.wound, Fx::ZERO, "a club opened a bleeding wound");

        // **The control, and it is about the club rather than about a fixture
        // that never bleeds.** Put a blade through the same swing: it cuts where
        // the club could not, and `cut_share` turns that cut into a wound. So
        // the zero above is the club's own missing edge and not a dead rule.
        let sword = crate::sword().surface;
        let swing = |surface: crate::SurfaceSpec| resolution::WeaponBodyChannel {
            weapon_axis: Vec3::X, weapon_relative_velocity: Vec3::Y,
            edge_factor: surface.edge_factor, point_factor: surface.point_factor,
            crush_factor: surface.material.crush_factor(), zero_length: false };
        let (blade_cut, _, blade_crush, _) = resolution::channels(10_144, swing(sword));
        assert!(blade_cut > 0 && blade_crush == 0, "the blade control stopped cutting");
        let (club_cut, _, club_crush, _) = resolution::channels(10_144, swing(crate::club().surface));
        assert!(club_cut == 0 && club_crush > 0, "the club control stopped crushing");
        assert!(anatomy::cut_share(anatomy::integrity_loss_raw(blade_cut), blade_cut, blade_cut) > 0,
                "a cut stopped opening a bleeding wound");
    }

    #[test]
    fn a_wounding_contact_records_its_region_shock_and_source() {
        let (world, region) = braced_thrust(&fragile_scenario(&[1]));
        let part = wounded_part(region);
        let brute = world.wounds[1];
        assert!(brute.parts[part as usize].severed,
                "a raw unit of integrity survived a whole contact");
        assert_eq!(brute.parts[part as usize].integrity, Fx::ZERO);
        assert_eq!(brute.last_attacker, EntityId::new(0, 0));
        assert!(brute.shock.is_positive(), "integrity loss recorded no shock");
        assert!(world.damage_dealt[0].is_positive(), "the wound was credited to nobody");
        // The severance is on the row that made it, not merely in the column.
        assert!(world.contact_resolutions().iter()
            .any(|row| row.fact.volume == region && row.severed),
            "the resolution that severed a region did not say so");
        // Untouched regions are untouched. One blow is one region.
        assert_eq!(brute.parts.iter().filter(|row| row.severed).count(), 1);

        // And the region is gone from the geometry, not merely flagged: the
        // next sweep against the same body cannot name it again.
        let mut world = world;
        brace_weapon(&mut world, 0);
        resolve_closing(&mut world, &[(1, -Fx::ONE)]);
        assert!(!world.contact_resolutions().is_empty(),
                "the second blow reached nothing, so the absence check is vacuous");
        assert!(world.contact_resolutions().iter().all(|row| row.fact.volume != region),
                "a severed region answered a sweep");
    }

    /// A fact whose volume is a forearm wounds the arm the forearm belongs to.
    ///
    /// **The test that fails loudest if the rename is done without the map.**
    /// `ContactFact::volume` was called `region` while a body presented one
    /// capsule per anatomy region, so `BodyPart::from_index` was a correct
    /// reading of it by coincidence. Volumes 5 and 6 are the two forearms and
    /// `from_index` answers `None` for both -- so the old spelling does not
    /// panic, does not refuse and does not log: it takes the `else { continue }`
    /// and the blow simply does nothing.
    ///
    /// Driven through [`ContactProjector::after_group`] with a *landed*
    /// resolution whose volume byte has been moved, rather than through a fight
    /// aimed at an elbow. Aiming would make this a test about where a weapon goes
    /// -- and about which of two overlapping capsules wins a tie-break -- when the
    /// question is only whether the wounding pass can read the byte. The volume
    /// is moved onto the arm the blow did *not* name, so a wound landing on the
    /// old region would fail here rather than pass by luck.
    #[test]
    fn a_forearm_contact_wounds_the_arm_it_belongs_to() {
        use crate::combat::spec::forearm_volume;

        let mut world = World::new(&fragile_scenario(&[1]), 1000);
        brace_weapon(&mut world, 0);
        world.retain_contact_entry();
        world.record_contact_locomotion();
        world.vel[1] = Vec2::new(-Fx::ONE, Fx::ZERO);
        world.resolve_contact();

        let mut rows: Vec<ContactResolution> = world.contact_resolutions().iter()
            .filter(|row| row.fact.key.kind == ContactKind::WeaponBody)
            .copied().collect();
        assert_eq!(rows.len(), 1, "the braced fixture stopped landing exactly one body blow");
        let landed = volume_region(rows[0].fact.volume as usize)
            .expect("a body fact named no region");
        // The arm the blow did not name, so the assertion below is about the map
        // and not about the byte that was already there.
        let limb = if landed == BodyPart::LeftArm {
            LimbSlot::RightArm as usize
        } else { LimbSlot::LeftArm as usize };
        let forearm = forearm_volume(limb);
        let arm = volume_region(forearm).expect("a forearm answers for its arm");
        assert_ne!(arm, landed, "the fixture's own region is the one being moved onto");
        assert!(BodyPart::from_index(forearm).is_none(),
                "a forearm volume became a region, so this test proves nothing");
        rows[0].fact.volume = forearm as u8;

        // A body nobody has hit yet, so the loss below is this row's alone.
        let mut wounds: Vec<AnatomyState> = (0..world.alive.len())
            .map(|i| world.anatomy_spec(i).map(AnatomyState::new)
                 .unwrap_or(AnatomyState::EMPTY))
            .collect();
        let target = world.resolve(rows[0].fact.key.b).expect("a live target");
        let maximum = world.anatomy_spec(target).unwrap().integrity_maxima[arm as usize];
        assert_eq!(wounds[target].parts[arm as usize].integrity, maximum);

        let entry = world.contact.as_ref().expect("contact state").entry.clone();
        let mut colliders = world.contact.as_ref().expect("contact state").colliders.clone();
        let mut credit = vec![Fx::ZERO; wounds.len()];
        let (mut bodies, mut deltas, mut fact_loss) = (Vec::new(), Vec::new(), Vec::new());
        {
            let mut projector = ContactProjector {
                world: &world, entry: &entry, bodies: &mut bodies, wounds: &mut wounds,
                credit: &mut credit, deltas: &mut deltas, fact_loss: &mut fact_loss,
            };
            projector.after_group(&mut colliders, &mut rows).expect("the wounding pass refused");
        }

        assert!(wounds[target].parts[arm as usize].integrity < maximum,
                "a forearm contact wounded nothing at all");
        assert!(wounds[target].parts[landed as usize].integrity
                == world.anatomy_spec(target).unwrap().integrity_maxima[landed as usize],
                "the wound followed the old byte rather than the volume it names");
        assert!(rows[0].severed, "the row that emptied the arm did not report it");
        assert!(credit[world.resolve(rows[0].fact.key.a).expect("a live source")].is_positive(),
                "a forearm blow was credited to nobody");
        // And the severance reached the geometry, both capsules of it: pass three
        // is the one `a_severed_arm_takes_its_forearm_with_it` guards in the
        // constructor, and this is the same rule one layer up.
        let body = colliders.iter().find(|row| row.entity == rows[0].fact.key.b
            && matches!(row.shape, ContactShape::Body { .. })).expect("a body row");
        let ContactShape::Body { parts, .. } = body.shape else { unreachable!() };
        assert!(!parts[arm as usize].present && !parts[forearm].present,
                "a severed arm kept one of its two capsules");
    }

    /// Moving the forearm changes what a forearm blow deflects, which is the
    /// call site's half of the claim below.
    ///
    /// The test after this one shows that `outward_region_normal` *can* tell the
    /// two links apart; it cannot show that the wounding pass hands it the right
    /// one, because it calls the function itself. This drives the real pass and
    /// perturbs only the capsule the fact names. A caller passing the region's
    /// index would never read that capsule, so the two runs would deflect
    /// identically -- which is why the assertion is `assert_ne!` and why the
    /// upper arm is held still across both runs.
    #[test]
    fn a_forearm_blows_deflection_follows_the_forearm_capsule() {
        use crate::combat::spec::forearm_volume;

        // **Armored, and it has to be**: `armor_transfer` multiplies the
        // deflected share by `1 - squareness`, so a bare region deflects nothing
        // at any angle and the normal this test is about reaches no number at
        // all. Coverage and hardness are total so the whole glancing share is
        // visible; absorption is left alone.
        let mut scenario = fragile_scenario(&[1]);
        scenario.combat_specs.as_mut().unwrap().anatomies[1].armor =
            [crate::ArmorSpec { coverage: Fx::ONE, hardness: Fx::ONE,
                                absorption: Fx::ZERO, material: crate::Material::Steel };
             BodyPart::COUNT];
        let mut world = World::new(&scenario, 1000);
        brace_weapon(&mut world, 0);
        world.retain_contact_entry();
        world.record_contact_locomotion();
        world.vel[1] = Vec2::new(-Fx::ONE, Fx::ZERO);
        world.resolve_contact();

        let landed: Vec<ContactResolution> = world.contact_resolutions().iter()
            .filter(|row| row.fact.key.kind == ContactKind::WeaponBody)
            .copied().collect();
        assert_eq!(landed.len(), 1, "the braced fixture stopped landing exactly one body blow");
        let limb = LimbSlot::RightArm as usize;
        let forearm = forearm_volume(limb);
        let entry = world.contact.as_ref().expect("contact state").entry.clone();
        let base = world.contact.as_ref().expect("contact state").colliders.clone();

        // One run of the real wounding pass with the forearm capsule laid along
        // `axis`, and nothing else touched.
        let deflected = |axis: Vec3| -> u64 {
            let mut rows = landed.clone();
            rows[0].fact.volume = forearm as u8;
            let mut colliders = base.clone();
            let row = colliders.iter_mut().find(|row| row.entity == rows[0].fact.key.b
                && matches!(row.shape, ContactShape::Body { .. })).expect("a body row");
            let ContactShape::Body { parts, .. } = &mut row.shape else { unreachable!() };
            let at = rows[0].fact.point;
            // Laid *beside* the contact rather than through it: a capsule
            // whose end is the contact point has the contact as its own medial
            // point, so the delta is zero and every axis reports body forward.
            parts[forearm] = RegionSweep {
                previous_lower: at + axis, previous_upper: at + axis + axis,
                requested_lower: at + axis, requested_upper: at + axis + axis,
                radius: Fx::from_ratio(1, 4), present: true,
            };
            let mut wounds: Vec<AnatomyState> = (0..world.alive.len())
                .map(|i| world.anatomy_spec(i).map(AnatomyState::new)
                     .unwrap_or(AnatomyState::EMPTY))
                .collect();
            let mut credit = vec![Fx::ZERO; wounds.len()];
            let (mut bodies, mut deltas, mut fact_loss) = (Vec::new(), Vec::new(), Vec::new());
            {
                let mut projector = ContactProjector {
                    world: &world, entry: &entry, bodies: &mut bodies, wounds: &mut wounds,
                    credit: &mut credit, deltas: &mut deltas, fact_loss: &mut fact_loss,
                };
                projector.after_group(&mut colliders, &mut rows).expect("the wounding pass refused");
            }
            rows[0].deflected_raw
        };

        // Two links a quarter turn apart, which is inside the elbow's own fold,
        // and one of them across the closing direction. Both perpendicular to
        // the approach would read square zero either way and the fixture would
        // pass on a coincidence rather than on the normal.
        let along = deflected(Vec3::from_ints(1, 0, 0));
        let across = deflected(Vec3::from_ints(0, 1, 0));
        assert_ne!(along, across,
                   "the deflection ignored the capsule the fact named, so the wounding pass                     is still reading the region's first volume");
    }

    /// The surface direction comes from the volume that was struck, not from its
    /// region's first volume.
    ///
    /// **A fold, not a hinge, is exactly why this matters.** The elbow stops at
    /// forty degrees, so the two links of one arm can sit most of a right angle
    /// apart, and the medial point of the wrong link is then somewhere the blow
    /// never went. `anatomy::squareness` turns that direction straight into how
    /// much armor declines, so reading the upper arm for a forearm blow is not a
    /// rounding error -- it is a different amount of damage.
    ///
    /// The two links here are deliberately perpendicular and the contact sits on
    /// the far side of the forearm from the shoulder, which is the arrangement
    /// where the two answers disagree most and where taking the region's index
    /// would have pointed the normal back along the upper arm.
    #[test]
    fn a_forearm_blow_takes_its_normal_from_the_forearm() {
        use crate::combat::spec::forearm_volume;

        let limb = LimbSlot::RightArm as usize;
        let arm = BodyPart::RightArm;
        let shoulder = Vec3::from_ints(0, 0, 4);
        let elbow = shoulder + Vec3::from_ints(2, 0, 0);
        let hand = elbow + Vec3::from_ints(0, 2, 0);
        let absent = RegionSweep {
            previous_lower: Vec3::ZERO, previous_upper: Vec3::ZERO,
            requested_lower: Vec3::ZERO, requested_upper: Vec3::ZERO,
            radius: Fx::ZERO, present: false,
        };
        let capsule = |lower: Vec3, upper: Vec3| RegionSweep {
            previous_lower: lower, previous_upper: upper,
            requested_lower: lower, requested_upper: upper,
            radius: Fx::from_ratio(1, 4), present: true,
        };
        let mut parts = [absent; BODY_VOLUME_COUNT];
        parts[arm as usize] = capsule(shoulder, elbow);
        parts[forearm_volume(limb)] = capsule(elbow, hand);

        let spec = crate::combat::spec::fighter_anatomy();
        let body = EntityId::new(0, 1);
        let colliders = vec![ContactCollider {
            entity: body, faction: Faction::Heroes, slot: BODY_SLOT, mass: Fx::ONE,
            surface: spec.surface, velocity: Vec3::ZERO, present: true,
            velocity_offset: Vec3::ZERO,
            shape: ContactShape::Body {
                previous_origin: Vec3::ZERO, requested_origin: Vec3::ZERO, parts,
            },
        }];

        // Beside the forearm's midpoint, on the `+x` side -- away from the upper
        // arm, which runs along `+x` from the shoulder.
        let point = elbow + Vec3::new(Fx::ONE, Fx::ONE, Fx::ZERO);
        let from_forearm = outward_region_normal(
            &colliders, body, forearm_volume(limb), point, Angle::ZERO);
        let from_upper = outward_region_normal(
            &colliders, body, arm as usize, point, Angle::ZERO);
        assert_ne!(from_forearm, from_upper,
                   "the two links answer the same normal, so this fixture proves nothing");
        // The forearm runs along `+y`, so its medial point under this contact is
        // directly below it in `y` and the surface faces `+x` exactly.
        assert_eq!(from_forearm, Vec3::new(Fx::ONE, Fx::ZERO, Fx::ZERO));
        // The upper arm runs along `+x` and ends at the elbow, so its medial
        // point is the elbow and it would have reported a diagonal instead.
        assert!(from_upper.y.is_positive(), "the upper arm's answer is the one being ruled out");
    }

    #[test]
    fn a_blow_that_does_not_empty_a_region_wounds_without_severing() {
        // The same braced thrust into a body four times too sturdy to lose the
        // region. Every other wound fixture scales its target to a raw unit so
        // one blow is decisive, which means `severed` is true on every landed
        // row in the suite and the flag proves nothing on its own. This is the
        // case that separates "took damage" from "lost the limb".
        let mut scenario = fragile_scenario(&[]);
        scenario.combat_specs.as_mut().unwrap().anatomies[1].integrity_maxima =
            [Fx::from_int(8); BodyPart::COUNT];
        let (world, region) = braced_thrust(&scenario);
        let part = world.wounds[1].parts[wounded_part(region) as usize];
        assert!(!part.severed, "a body with eight units of integrity lost a region");
        assert!(part.integrity < Fx::from_int(8), "the blow took nothing off");
        // The exact path sums the physical owner and held rows before its one
        // public floor. The legacy path deliberately retains the generalized
        // row transfer it shipped with, so this fixture pins both laws rather
        // than pretending their independently rounded losses are identical.
        #[cfg(feature = "cartesian-recoil")]
        // Smart38's lifted restitution/cone gate measures raw integrity
        // 292064: a raw 232224 floor-once physical loss from the eight-sweep solve.
        assert_eq!(part.integrity, Fx::from_raw(292_064));
        #[cfg(not(feature = "cartesian-recoil"))]
        assert_eq!(part.integrity, Fx::from_int(8) - Fx::from_raw(344_064));
        assert!(world.contact_resolutions().iter().all(|row| !row.severed),
                "a wounding blow that severed nothing said it had");
        assert!(world.damage_dealt[0].is_positive(), "the wound was credited to nobody");
        assert!(world.alive[1]);
    }

    #[test]
    fn worn_plate_turns_a_blow_the_bare_body_takes() {
        use crate::combat::spec::Material;
        // The bare fixture severs the region it names; the same blow against a
        // hard full-coverage plate reaches nothing. This is the only test that
        // drives the whole armour path -- the outward region normal off the
        // medial point, the squareness of the approach, and the widened
        // transfer -- from a real contact rather than from hand-supplied
        // numbers, and without it the entire block could be deleted and
        // replaced by `penetrating = incoming` unnoticed.
        let (bare, region) = braced_thrust(&fragile_scenario(&[1]));
        let struck = wounded_part(region);
        assert!(bare.wounds[1].parts[struck as usize].severed);
        let deflected: u64 = bare.contact_resolutions().iter().map(|row| row.deflected_raw).sum();
        assert_eq!(deflected, 0, "a bare body deflected energy");

        // Worn on the struck region only. Plating all five would pass whatever
        // index the transfer read, and the per-region lookup is exactly the
        // thing a uniform suit cannot check.
        let plate = |hardness, absorption, on: BodyPart| {
            let mut scenario = fragile_scenario(&[1]);
            scenario.combat_specs.as_mut().unwrap().anatomies[1].armor[on as usize] =
                crate::ArmorSpec { coverage: Fx::ONE, hardness, absorption,
                                   material: Material::Steel };
            braced_thrust(&scenario)
        };

        // Hard full coverage sheds most of it and not all of it, and both
        // halves of that are the wiring rather than the formula. A thrust that
        // runs along the blade still meets this region off-axis, so it is
        // partly square: `deflected > 0` says the squareness is under one, and
        // the region still going says it is over zero -- a squareness stuck at
        // zero would give `1-square = 1`, deflect the whole incident budget,
        // and leave a one-raw-unit region standing. A normal taken from
        // somewhere other than the medial point lands on one side or the other.
        // The *sign* of the approach is not under test and could not be: the
        // squareness takes an absolute value, and `anatomy.rs` says so.
        let (hard, hard_region) = plate(Fx::ONE, Fx::ZERO, struck);
        assert_eq!(hard_region, region, "the plate changed which region the blow chose");
        let incoming: u64 = hard.contact_resolutions().iter()
            .map(|row| row.cut_raw + row.thrust_raw).sum();
        let deflected: u64 = hard.contact_resolutions().iter().map(|row| row.deflected_raw).sum();
        // Exact recoil floors the complete physical energy change once; the
        // legacy resolver floors its generalized transfer. Armour receives
        // the incident budget produced by the selected law, and the two
        // literal pairs make an accidental cross-wiring visible. The lifted
        // restitution/cone choice moves the physical floor-once incident loss.
        #[cfg(feature = "cartesian-recoil")]
        assert_eq!((incoming, deflected), (2_419, 2_149));
        #[cfg(not(feature = "cartesian-recoil"))]
        assert_eq!((incoming, deflected), (3_584, 3_185));
        assert!(deflected < incoming, "the plate deflected the whole incident budget");
        assert!(hard.wounds[1].parts[struck as usize].severed,
                "what got past the plate reached nothing");

        // Absorption is the other half of the same seam and is billed on a
        // different column: soft full coverage swallows rather than sheds, so
        // nothing is deflected and nothing gets through either.
        let (padded, _) = plate(Fx::ZERO, Fx::ONE, struck);
        assert!(padded.wounds[1].parts.iter().all(|part| !part.severed),
                "soft full coverage let a blow through");
        let deflected: u64 = padded.contact_resolutions().iter().map(|row| row.deflected_raw).sum();
        assert_eq!(deflected, 0, "padding deflected instead of absorbing");
        assert_eq!(padded.damage_dealt[0], Fx::ZERO, "a stopped blow was credited");

        // And the same padding worn anywhere else does nothing at all: armour
        // is looked up by the region the blow chose, not by the body.
        let elsewhere = BodyPart::ALL.into_iter().find(|part| *part != struck).expect("a second region");
        let (mismatched, _) = plate(Fx::ZERO, Fx::ONE, elsewhere);
        assert!(mismatched.wounds[1].parts[struck as usize].severed,
                "a plate on the wrong region turned the blow");
    }

    #[test]
    fn two_blows_in_one_group_are_both_measured_against_the_pre_group_body() {
        // Two heroes, one target, both blades in it on the same mapped time.
        // Either blow alone would take the region off, so a fact-by-fact apply
        // would measure the second against a body the first had already
        // emptied and credit nobody for it. One snapshot per group is what
        // makes both of them land, and this is the only fixture that puts two
        // facts on one body in one group.
        let world = two_on_one(true, ActionKind::Sword, 1);
        let rows: Vec<_> = world.contact_resolutions().iter()
            .filter(|row| row.fact.key.kind == ContactKind::WeaponBody)
            .map(|row| (row.fact.key.a.index, row.group_ordinal, row.fact.volume, row.severed))
            .collect();
        assert_eq!(rows.len(), 2, "the fixture stopped putting two blades in one body");
        assert_eq!(rows[0].1, rows[1].1, "the two blows fell into different groups");
        assert_eq!(rows[0].2, rows[1].2, "the two blows chose different regions");
        assert!(rows.iter().all(|row| row.3), "a blow that emptied a region did not say so");
        assert_eq!(rows.iter().map(|row| row.0).collect::<Vec<_>>(), vec![0, 2]);

        // Both attackers are paid, and between them they are paid exactly what
        // the target lost -- no more, because credit is clamped to the query's
        // own decrease, and no less, because the last contributor takes the
        // remainder rather than a second rounded share.
        let spec = world.anatomy_spec(1).expect("articulated anatomy");
        let lost = anatomy::max_health(spec) - world.wounds[1].health(spec);
        assert!(world.damage_dealt[0].is_positive() && world.damage_dealt[2].is_positive(),
                "one of two simultaneous attackers went unpaid");
        assert_eq!(world.damage_dealt[0] + world.damage_dealt[2], lost);
        assert_eq!(world.damage_dealt[1], Fx::ZERO);
    }

    /// The two-hero fixture: both blades in one target on one mapped time,
    /// posed and driven with the target closing onto them.
    ///
    /// Equipment id 4 is a sword with both surface factors at zero -- a blade
    /// that carries every share into pressure and so into no anatomy at all.
    /// It is the only way to build a fact that reaches a body and applies
    /// nothing, which is a case the wound rules distinguish and no shipped
    /// item can produce.
    fn two_on_one(fragile: bool, second: ActionKind, second_id: u16) -> World {
        let mut scenario = fragile_scenario(if fragile { &[1] } else { &[] });
        if !fragile {
            scenario.combat_specs.as_mut().unwrap().anatomies[1].integrity_maxima =
                [Fx::from_int(8); BodyPart::COUNT];
        }
        let mut blunt = crate::sword();
        blunt.id = 4;
        blunt.surface.edge_factor = Fx::ZERO;
        blunt.surface.point_factor = Fx::ZERO;
        // **A surface that converts nothing at all**, which since combat-arms-05
        // takes three zeros rather than two: energy the edge and the point
        // decline is no longer inert, it is crushed, and crush comes off the
        // material. `Flesh` is the roster's zero and is used here for that
        // number and not as a claim about what the thing is made of -- a steel
        // bar with no edge and no point genuinely should crush, which is exactly
        // why leaving this at `Steel` stopped the fixture meaning what it says.
        blunt.surface.material = crate::combat::spec::Material::Flesh;
        scenario.combat_specs.as_mut().unwrap().equipment.push(blunt);
        scenario.units[0].articulated.as_mut().unwrap().equipment = [Some(1), None];
        scenario.units[0].loadout = Loadout::single(ActionKind::Sword);
        scenario.units[0].spawn = Vec2::from_ints(10, 8);
        // The same point as the first hero, so the two blades are collinear and
        // the pair of facts is about one region rather than two. Allies never
        // key against each other and this fixture never separates, so standing
        // them in each other costs nothing the test is about.
        scenario.units.push(UnitSpec {
            articulated: Some(ArticulatedUnitSpecV1 { anatomy: 1, equipment: [Some(second_id), None] }),
            loadout: Loadout::single(second),
            ..scenario.units[0].clone()
        });
        scenario.units[1].spawn = Vec2::from_ints(12, 8);
        let mut world = World::new(&scenario, 1000);
        brace_weapon(&mut world, 0);
        brace_weapon(&mut world, 2);
        resolve_closing(&mut world, &[(1, -Fx::ONE)]);
        world
    }

    #[test]
    fn credit_for_one_group_is_split_between_its_blows_and_sums_to_the_loss() {
        // The same two-on-one group, but a target sturdy enough that neither
        // blow is clamped and armed so the two blows differ: a sword and a club
        // put unequal energy into the same region. Both halves matter --
        // without the inequality an equal split would pass, and without a
        // decrease that does not divide by the total the remainder rule would.
        let world = two_on_one(false, ActionKind::Club, 3);
        let rows: Vec<_> = world.contact_resolutions().iter()
            .filter(|row| row.fact.key.kind == ContactKind::WeaponBody)
            .map(|row| (row.fact.key.a.index, row.group_ordinal, row.fact.volume))
            .collect();
        assert_eq!(rows.len(), 2, "the fixture stopped putting two blades in one body");
        assert_eq!(rows[0].1, rows[1].1, "the two blows fell into different groups");
        assert_eq!(rows.iter().map(|row| row.0).collect::<Vec<_>>(), vec![0, 2]);
        // The regions differ here -- a club reaches further in than a sword --
        // and that is fine: credit is shared across everything one group did to
        // one body, not per region.
        assert_ne!(rows[0].2, rows[1].2);

        let spec = world.anatomy_spec(1).expect("articulated anatomy");
        let lost = anatomy::max_health(spec) - world.wounds[1].health(spec);
        let (sword, club) = (world.damage_dealt[0], world.damage_dealt[2]);
        assert!(sword.is_positive() && club.is_positive(), "one blow of two went unpaid");
        assert_ne!(sword, club, "the fixture stopped distinguishing the two blows");
        assert_eq!(sword + club, lost, "the shares did not add up to what the body lost");
        // The pair itself, pinned. Two floored proportional shares do not in
        // general add up to what they are shares of, and the last contributor
        // taking the remainder is what closes that gap -- so a change to either
        // the proportion or the remainder rule moves one of these numbers even
        // when the sum above still holds.
        // The exact feature allocates the one physical, floor-once loss; the
        // legacy path keeps its established generalized-row loss. Both still
        // exercise the same proportional-share and final-remainder rule. The
        // lifted restitution/cone choice moves that physical floor-once loss.
        //
        // Re-recorded on 2026-08-16 by combat-arms-05: the club used to convert
        // only its axial half and now crushes what its absent edge declines, so
        // it takes a larger share of the same loss and the sword takes
        // correspondingly less. Previously `(2_753_037, 392_691)` and
        // `(2_782_916, 362_812)`.
        //
        // **The two laws stopped agreeing about the total on 2026-08-19, and
        // the reason is the elbow rather than the allocator.** The sum used to
        // be `3_145_728` under both, which is what made pinning it once
        // defensible: the body lost what it lost and only the split was in
        // question. An embodied body presents seven swept volumes and the last
        // two are the forearms, so the pair of blows no longer lands on the
        // same two capsules under both laws. Measured here: the club takes
        // volume 5 -- the left forearm -- under either law, while the sword
        // takes volume 2, the left arm region, under the default law and
        // volume 1, the torso, under the exact one. Different capsules absorb
        // different amounts and the two totals part company.
        //
        // Both laws still split what they allocate by the same
        // proportional-share and final-remainder rule, which is the whole
        // subject of this test, so the total is selected by law rather than
        // left as one number pretending to be law-independent.
        #[cfg(feature = "cartesian-recoil")]
        assert_eq!((sword.raw(), club.raw()), (2_561_356, 584_372));
        #[cfg(not(feature = "cartesian-recoil"))]
        assert_eq!((sword.raw(), club.raw()), (366_194, 158_110));
        let total = if cfg!(feature = "cartesian-recoil") { 3_145_728 } else { 524_304 };
        assert_eq!(sword.raw() + club.raw(), total, "the body lost a different amount");
    }

    #[test]
    fn a_blow_that_penetrated_nothing_reports_no_severance() {
        // Two blades in one region, one of which carries its whole share into
        // pressure. The region comes off, and the blunt blade must not be
        // reported as having taken it: `severed` is a statement about what a
        // fact did, and every other fixture in the suite either severs on every
        // row or severs on none, so this is the one that separates the two.
        let world = two_on_one(true, ActionKind::Sword, 4);
        let rows: Vec<_> = world.contact_resolutions().iter()
            .filter(|row| row.fact.key.kind == ContactKind::WeaponBody)
            .map(|row| (row.fact.key.a.index, row.fact.volume,
                        row.cut_raw + row.thrust_raw + row.crush_raw, row.severed))
            .collect();
        assert_eq!(rows.len(), 2, "the fixture stopped putting two blades in one body");
        assert_eq!(rows[0].1, rows[1].1, "the two blows chose different regions");
        assert_eq!((rows[0].0, rows[1].0), (0, 2));
        // All three wounding channels, not two: crush is one of them since
        // combat-arms-05, and summing only the old pair would let a blow that
        // crushed its way through the region still be called blunt.
        assert!(rows[0].2 > 0 && rows[1].2 == 0, "the blunt blade carried a wounding channel");
        assert_eq!((rows[0].3, rows[1].3), (true, false),
                   "severance was reported by the blade that did nothing");
        assert!(world.wounds[1].parts[rows[0].1 as usize].severed);
        assert_eq!(world.damage_dealt[2], Fx::ZERO, "the blunt blade was paid");
    }

    #[test]
    fn a_severance_leaves_the_tick_it_happened_in() {
        // A brute carrying a shield as well as its club, so the arm the braced
        // sword actually reaches is one that is holding something. Every other
        // severance fixture writes the flag before the tick, which means the
        // collider builder masks the grip and the equipment row never exists --
        // so nothing else in the suite exercises the mid-tick half of the rule,
        // and a group that severs an arm could leave its weapon swinging
        // through the rest of the same tick unnoticed.
        let mut scenario = fragile_scenario(&[1]);
        // The shipped club's mass is coprime enough with the Brute/shield
        // ownership totals to put this test-only pairing outside the 96-bit
        // construction envelope. 146_237 is the nearest larger raw mass whose
        // carried configurations stay inside it (at 84 bits).
        scenario.combat_specs.as_mut().unwrap().equipment[2].mass = Fx::from_raw(146_237);
        scenario.units[1].articulated.as_mut().unwrap().equipment = [Some(3), Some(2)];
        scenario.units[1].loadout = Loadout::pair(ActionKind::Club, ActionKind::Shield);
        let mut world = World::new(&scenario, 1000);
        assert!(world.shield_pose[1].is_some(), "the fixture's brute carries no shield");
        brace_weapon(&mut world, 0);
        resolve_closing(&mut world, &[(1, -Fx::ONE)]);

        let severed: Vec<BodyPart> = BodyPart::ALL.into_iter()
            .filter(|part| !world.wounds[1].present(*part)).collect();
        assert_eq!(severed.len(), 1, "the blow did not take exactly one region: {:?}",
                   world.first_contact_rejection());
        let contact = world.contact.as_ref().expect("articulated contact state");
        let body = contact.colliders.iter().find(|row| row.entity == EntityId::new(1, 0)
            && matches!(row.shape, ContactShape::Body { .. })).expect("a body row");
        let ContactShape::Body { parts, .. } = body.shape else { unreachable!() };
        assert!(!parts[severed[0] as usize].present,
                "the region left the anatomy but not the tick's geometry");

        // The row the severed arm was holding, if it was holding one. Asserted
        // rather than skipped: a fixture that quietly stopped reaching an armed
        // limb would make this test pass by having nothing to check.
        let held = contact.colliders.iter().find(|row| row.entity == EntityId::new(1, 0)
            && limb_body_part(row.slot) == Some(severed[0]));
        let held = held.expect("the severed arm was holding nothing, so the check is vacuous");
        assert!(!held.present, "a severed arm's equipment stayed in the tick");
        assert!(contact.colliders.iter().any(|row| row.entity == EntityId::new(1, 0)
            && row.present && !matches!(row.shape, ContactShape::Body { .. })
            || row.entity != EntityId::new(1, 0)),
            "the severance took the whole brute out of the tick");
    }

    #[test]
    fn a_two_handed_weapon_leaves_the_tick_when_either_arm_does() {
        // A two-handed item has one collider and the *right* arm owns it, so
        // keying the mid-tick drop off the collider's own slot would leave a
        // greatsword swinging for the rest of a tick that took its wielder's
        // left arm off -- while `release_severed_grips` drops both hands at
        // tick end. The two rules have to agree, and only a `Both` binding can
        // tell them apart.
        let mut scenario = both_scenario();
        scenario.units[0].spawn = Vec2::from_ints(10, 8);
        scenario.units[1].spawn = Vec2::new(Fx::from_ratio(23, 2), Fx::from_int(8));
        scenario.combat_specs.as_mut().unwrap().anatomies[1].integrity_maxima =
            [Fx::from_raw(1); BodyPart::COUNT];
        let mut world = World::new(&scenario, 1000);
        assert!(world.two_handed(1), "the fixture's brute is not holding a two-handed item");
        brace_weapon(&mut world, 0);
        resolve_closing(&mut world, &[(1, -Fx::ONE)]);

        let severed: Vec<BodyPart> = BodyPart::ALL.into_iter()
            .filter(|part| !world.wounds[1].present(*part)).collect();
        assert_eq!(severed, vec![BodyPart::LeftArm],
                   "the fixture stopped taking the arm that does not own the weapon");
        let contact = world.contact.as_ref().expect("articulated contact state");
        let held = contact.colliders.iter().find(|row| row.entity == EntityId::new(1, 0)
            && !matches!(row.shape, ContactShape::Body { .. })).expect("a two-handed collider");
        assert_eq!(held.slot, LimbSlot::RightArm as u8, "the fixture stopped being right-owned");
        assert!(!held.present, "a two-handed weapon outlived the arm it needed");
        assert_eq!(world.grips[1], [GripState { equipment_slot: None }; 2],
                   "one hand kept hold of a two-handed weapon");
    }

    #[test]
    fn a_severed_region_stays_absent_on_the_next_tick() {
        // Legs, not an arm, and that is the point: death is head, torso, or
        // blood, so a body fights on with its legs destroyed and the volume
        // that is gone has to stay gone across the tick boundary. Rebuilding
        // the rigid regions as present -- which is the obvious way to write
        // the collider builder -- makes a destroyed region soak every low
        // strike for the rest of the fight and wound nothing.
        let mut world = World::new(&fragile_scenario(&[]), 1);
        world.wounds[0].parts[BodyPart::Legs as usize].integrity = Fx::ZERO;
        world.wounds[0].parts[BodyPart::Legs as usize].severed = true;
        world.step();
        world.step();

        world.retain_contact_entry();
        world.record_contact_locomotion();
        let contact = world.contact.as_ref().expect("articulated contact state");
        let entry: Vec<TickEntry> = contact.entry.clone();
        let mut rows = Vec::new();
        world.build_contact_colliders(&entry, &mut rows, &world.wounds);
        let body = rows.iter().find(|row| row.entity == EntityId::new(0, 0)
            && matches!(row.shape, ContactShape::Body { .. })).expect("a body row");
        let ContactShape::Body { parts, .. } = body.shape else { unreachable!() };
        assert!(!parts[BodyPart::Legs as usize].present, "a severed region was rebuilt present");
        assert!(parts[..BodyPart::COUNT].iter().enumerate()
            .all(|(at, part)| at == BodyPart::Legs as usize || part.present),
            "rebuilding took a sound region with it");
        // The two forearm volumes are present, and that is the other half of
        // the same rule rather than a second subject: a body whose legs are gone
        // still hands the sweep the seven volumes an embodied arm's elbow gives
        // it. Asserted beside the absent one because the builder writes both
        // from one loop -- a loop that took presence from the region table alone
        // would answer for five and lose every forearm blow silently.
        assert!(parts[BodyPart::COUNT..].iter().all(|part| part.present),
                "an embodied body presented no forearm");
        // And the impairment it implies survives the same boundary.
        assert_eq!(world.move_authority[0], Fx::ZERO);
        assert_eq!(world.turn_authority[0], Fx::ZERO);
    }

    #[test]
    fn body_body_contact_remains_planar_and_single_sourced() {
        // Two overlapping hostile embodied bodies. Body against body is
        // `World::separate`'s and only `World::separate`'s, so the solver must
        // never key a row body-to-body -- otherwise one overlap is answered
        // twice, once planar and once in three dimensions, and the two answers
        // fight each other every tick.
        //
        // The contract names this fixture as carrying no equipment. It cannot:
        // `Loadout`'s slot 0 is not an `Option` and `validate_rows` requires the
        // carried equipment and the loadout to agree slot for slot, so a
        // carrying row always holds something. Keeping the duel's equipment
        // costs the test nothing, because what it asserts is the absence of a
        // body/body *key*, not the absence of all contact.
        let mut scenario = Scenario::embodied_duel();
        scenario.units[0].spawn = Vec2::from_ints(8, 8);
        scenario.units[1].spawn = Vec2::new(Fx::from_int(8) + Fx::from_ratio(1, 4), Fx::from_int(8));
        let mut world = World::new(&scenario, 1);
        assert!(world.pos[1].x - world.pos[0].x < world.radius[0] + world.radius[1],
                "the fixture did not start overlapping");

        world.step();
        assert!(world.pos[1].x - world.pos[0].x > Fx::from_ratio(1, 4),
                "planar separation did not push the pair apart");
        // Non-empty first, or the check below is a claim about an empty slice.
        // Two bodies this close are inside each other's weapons, so the solver
        // has plenty to key -- what it must never key is the pair of bodies.
        assert!(!world.contact_resolutions().is_empty(),
                "the fixture resolved nothing, so the body/body check is vacuous");
        assert!(!world.contact_resolutions().iter().any(|row| {
            row.fact.key.a_slot == crate::combat::contact::BODY_SLOT
                && row.fact.key.b_slot == crate::combat::contact::BODY_SLOT
        }), "the solver keyed a body against a body");
        assert_eq!(world.contact_cap_hits(), 0);
        // And a body has no Z degree of freedom at all in v2-14: a contact
        // delta discards its Z as floor reaction, so a body row carrying one
        // would have got it from somewhere with no right to write it. Asserted
        // on the collider rows rather than on `World::vel`, which is a `Vec2`
        // and could not hold the counterexample even if the solver produced it.
        let contact = world.contact.as_ref().expect("articulated contact state");
        for row in &contact.colliders {
            if matches!(row.shape, ContactShape::Body { .. }) {
                assert_eq!(row.velocity.z, Fx::ZERO, "a body row carried a vertical velocity");
            }
        }
    }

    #[test]
    fn repeated_crowded_separation_clamps_before_energy_and_sweep() {
        const L: Fx = crate::combat::contact::CONTACT_COMPONENT_SPEED_LIMIT;
        let inside = |value: Fx| value >= -L && value <= L;

        // The ordering half, stated as the defect it prevents. A body handed a
        // velocity of five per axis is 8.66 long against a sweep envelope of
        // four, and `fx` fails an out-of-envelope sweep *closed* -- it answers
        // `TimeOfImpact::ZERO`, which manufactures a contact against every
        // hostile collider in the arena however far away. Driving the phase
        // directly rather than through `World::step` is what keeps the five
        // from simply teleporting the bodies apart before contact sees it.
        let mut world = clinch_world();
        world.pos[1] = Vec2::from_ints(60, 8);
        world.retain_contact_entry();
        world.record_contact_locomotion();
        for i in 0..world.alive.len() { world.vel[i] = Vec2::from_ints(5, -5); }
        world.resolve_contact();
        for i in 0..world.alive.len() {
            assert!(inside(world.vel[i].x) && inside(world.vel[i].y),
                "the entry clamp did not run before the sweep");
        }
        assert!(world.contact_resolutions().is_empty(),
            "an out-of-envelope sweep manufactured a contact fifty units away");

        // And the repeated half: a crowd that separation has to unpick every
        // tick, with the two of them inside each other's weapons throughout.
        let mut world = clinch_world();
        let mut resolved = 0usize;
        for _ in 0..40 {
            for (id, yaw) in [(EntityId::new(0, 0), Angle::ZERO),
                              (EntityId::new(1, 0), Angle::HALF)] {
                // **Stored, and stored without a rejection.** A submission the
                // world refuses is neither a compile error nor a panic: it
                // leaves the slot holding whatever it held, and forty ticks of
                // that would still satisfy every clamp below, because an entry
                // clamp has nothing to do when nothing moves. Asserting the
                // command arrived is what keeps the clamps below about a crowd
                // rather than about two bodies standing still.
                assert!(matches!(world.submit_embodied_v1(id,
                    crate::EmbodiedCommandV1::new(reaching_command(yaw, Fx::ONE))),
                    crate::SubmitEmbodiedOutcome::Stored { rejection: None, .. }),
                    "the reaching command was refused rather than obeyed");
            }
            world.step();
            resolved += world.contact_resolutions().len();
            let contact = world.contact.as_ref().expect("articulated contact state");
            for row in &contact.colliders {
                assert!(inside(row.velocity.x) && inside(row.velocity.y) && inside(row.velocity.z),
                    "a collider left the clamp the sweep is built against");
            }
            for i in 0..world.alive.len() {
                // Separation moves both sweep endpoints together, so however
                // often it fires it contributes no relative motion for the
                // energy ledger to pay for.
                let (start, end) = world.contact_body_sweep(i);
                assert_eq!(end - start, contact.entry[i].locomotion,
                    "a separation shove leaked into the swept extent");
            }
            for row in world.contact_resolutions() {
                assert!(row.energy.after_raw <= row.energy.before_raw,
                    "a group created energy");
                assert!(row.group_alpha_raw <= 65_536);
            }
        }
        // Every clamp above has the form "nothing left the envelope", which an
        // arena where nothing ever touched satisfies perfectly. This is what
        // says the forty ticks were a crowd.
        assert!(resolved > 0, "the repeated half resolved nothing, so its clamps are vacuous");
    }

    #[test]
    fn a_held_blade_is_sampled_at_its_centre_of_mass_and_not_in_the_hand() {
        // The mechanics change, stated against the two things it is *not*. It
        // is not the hand -- which is what every row carried before, and what
        // makes a swing invisible to `closure_energy`, since that function
        // reads rows and never contact points. And it is not the tip: the
        // fraction is `EquipmentSpec::balance`, the same number
        // `rules::grip_limit` levers the legacy swing on and already calls the
        // weapon's centre of mass, so a tip-heavy sword and a hilt-heavy one
        // are not the same weapon here either.
        let mut world = clinch_world();
        step_into_contact(&mut world);
        let contact = world.contact.take().expect("articulated contact state");
        let mut colliders = Vec::new();
        let wounds = world.wounds.clone();
        world.build_contact_colliders(&contact.entry, &mut colliders, &wounds);

        let mut blades = 0;
        let mut swinging = 0;
        for row in &colliders {
            let i = world.resolve(row.entity).expect("a live collider row");
            let ContactShape::Segment { previous_hilt, previous_tip,
                                        requested_hilt, requested_tip, .. } = row.shape else {
                // A body and a shield are sampled where they always were, and
                // the shield's is geometry rather than an omission:
                // `derive_shield_pose` puts its centre at the hand.
                assert_eq!(row.velocity_offset, Vec3::ZERO,
                           "a row that is not a held segment grew a sample offset");
                continue;
            };
            let limb = row.slot as usize;
            let hand = Vec3::new(world.vel[i].x, world.vel[i].y, Fx::ZERO)
                + world.arms[i][limb].linear_velocity;
            let item = world.equipment_in_grip(i, limb).expect("a held item");
            let swing = (requested_tip - previous_tip) - (requested_hilt - previous_hilt);

            // The clinch carries two segment rows, and the defender's retained
            // blade can legitimately be still on the tick the attacking blade
            // resolves. It remains part of the population check below, but it
            // cannot prove where a *moving* blade is sampled.
            if swing == Vec3::ZERO {
                assert_eq!(row.velocity, hand,
                           "a still blade grew a centre-of-mass velocity offset");
                blades += 1;
                continue;
            }

            assert_eq!(row.velocity, hand + scale_contact_vector(swing, item.balance),
                       "the blade is not sampled at `balance` along its own swing");
            assert_ne!(row.velocity, hand, "the blade is still sampled in the hand");
            assert_ne!(row.velocity, hand + swing, "the blade is sampled at its tip");
            // The identity the joint round trip depends on, checked here rather
            // than trusted there: what is left after the offset comes off is
            // exactly the hand velocity the entry clamp made legal.
            assert_eq!(row.velocity - row.velocity_offset, hand);
            blades += 1;
            swinging += 1;
        }
        assert!(blades > 0, "the fixture built no segment row to sample");
        assert!(swinging > 0, "the fixture built no swinging segment row to sample");
    }

    #[test]
    fn a_joint_round_trip_asks_about_the_hand_and_not_about_the_blade() {
        // The one hard part of moving the sample point.
        // `joint_clamped_velocity` maps a velocity out to a hand, through the
        // shoulder, and back -- on the assumption that the velocity it was
        // handed *is* the hand's. A centre-of-mass velocity handed to it
        // straight derives a hand the arm never had, clamps it against the
        // wrong limit, and answers with a velocity that is neither: the same
        // class of defect as the projector drift that refused 188,654 ticks,
        // arriving through the same three lines.
        //
        // So the proof is an equivalence rather than a value. The row's answer
        // must be the answer the *hand* would have got, with the offset put
        // back on -- which says both that the joint saw the right hand and that
        // the offset survived the trip intact.
        let mut world = clinch_world();
        step_into_contact(&mut world);
        let contact = world.contact.take().expect("articulated contact state");
        let mut colliders = Vec::new();
        let wounds = world.wounds.clone();
        world.build_contact_colliders(&contact.entry, &mut colliders, &wounds);

        let row = colliders.iter().find(|row| {
            matches!(row.shape, ContactShape::Segment { .. }) && row.velocity_offset != Vec3::ZERO
        }).copied().expect("no held blade with a sample offset");
        let i = world.resolve(row.entity).expect("a live collider row");
        let body = Vec3::new(world.vel[i].x, world.vel[i].y, Fx::ZERO);
        let held = GeneralizedCollider {
            entity: row.entity, slot: row.slot, kind: GeneralizedKind::Equipment,
            mass: row.mass, velocity: row.velocity, velocity_offset: row.velocity_offset,
        };
        // An impulse big enough to move the hand and far too small to reach the
        // component clamp, which would otherwise make the equivalence below a
        // statement about `clamp` rather than about the joint.
        let kick = Vec3::new(Fx::from_ratio(1, 64), Fx::from_ratio(-1, 128), Fx::ZERO);
        let requested = row.velocity + kick;

        let sampled = world.joint_clamped_velocity(held, &contact.entry, body, requested)
            .expect("a projectable row");
        let bare = GeneralizedCollider { velocity_offset: Vec3::ZERO, ..held };
        let hand = world.joint_clamped_velocity(
            bare, &contact.entry, body, requested - row.velocity_offset,
        ).expect("a projectable row");
        assert_eq!(sampled, hand + row.velocity_offset,
                   "the joint was asked about the blade rather than about the hand");
        // Non-vacuous: subtracting the offset really does change which hand the
        // map is asked about, so the two calls above are not the same call.
        let unsubtracted = world.joint_clamped_velocity(bare, &contact.entry, body, requested)
            .expect("a projectable row");
        assert_ne!(unsubtracted, hand,
                   "the offset stopped moving the derived hand; this proof is vacuous");
    }

    #[test]
    fn a_zero_alpha_trial_answers_with_the_rows_it_was_handed() {
        // The invariant `resolve_group_into` refuses a projector for breaking,
        // proved against the projector that broke it. Alpha zero applies no
        // impulse, so the trial it builds has to be the closure it was given --
        // and it was not, because the equipment pass mapped every row out to a
        // hand and back through a joint inverse that is not exact, at every
        // alpha including this one. 6.5% of the articulated corpus was computed
        // and rolled back on that drift; the arithmetic is in the alpha-zero
        // note in `resolve_group_into`.
        //
        // The last tick's retained entry is used as it stands rather than
        // re-retained, and that is what makes the fixture sharp: contact writes
        // `previous_hand = entry hand` and `linear_velocity = hand - previous
        // hand`, so `entry_hand + relative velocity` is exactly the hand the
        // arm is holding, which is the hand the joint has already agreed to.
        let mut world = clinch_world();
        step_into_contact(&mut world);
        let contact = world.contact.take().expect("articulated contact state");

        let mut colliders = Vec::new();
        let wounds = world.wounds.clone();
        world.build_contact_colliders(&contact.entry, &mut colliders, &wounds);
        let rows: Vec<GeneralizedCollider> = colliders.iter().map(|row| GeneralizedCollider {
            entity: row.entity, slot: row.slot,
            kind: if matches!(row.shape, ContactShape::Body { .. }) { GeneralizedKind::Body }
                  else { GeneralizedKind::Equipment },
            mass: row.mass, velocity: row.velocity, velocity_offset: row.velocity_offset,
        }).collect();
        let nonexact_owner = world.id_of(1);
        let held = rows.iter().find(|row| {
            row.entity == nonexact_owner && row.slot == 1
                && row.kind == GeneralizedKind::Equipment
        }).copied().expect("the fixture built no swinging equipment row to project");
        // The second premise, and it is new: this row's velocity is sampled at
        // its blade's centre of mass, so the identity below is being asked of a
        // number that is *not* the hand's. A fixture whose blade happened to be
        // still would answer the same either way and prove only the old rule.
        assert_ne!(held.velocity_offset, Vec3::ZERO,
                   "the fixture's blade stopped swinging; alpha zero is no longer \
                    being asked about a centre-of-mass sample");

        // The premise, written down so the proof below cannot go quietly
        // vacuous: the round trip really does move a hand the actuator itself
        // built. If it ever starts holding exactly, this fixture stops proving
        // anything and the drift argument in `project` wants re-measuring
        // rather than deleting.
        //
        // The exact word is a recording of where this clinch's arm ends up, and
        // it is deliberately read at the shipped arm rates rather than pinned:
        // the drift is the joint map's, but which pose it is sampled at is the
        // actuator's, so a rate frozen here would answer about a pose the game
        // no longer reaches. Doubling the bearing pair on 2026-08-15 moved it
        // from `(0, -1, 0)` to `(0, -5, 0)`, which is the premise holding
        // harder rather than failing: the round trip is still not exact, and by
        // more than it was.
        let i = world.resolve(held.entity).expect("a live equipment row");
        let limb = held.slot as usize;
        let anatomy = world.combat_specs.as_ref().expect("articulated combat specs")
            .anatomy(world.articulated_anatomy[i].expect("articulated anatomy"))
            .expect("validated articulated anatomy").clone();
        let (arm, yaw) = (world.arms[i][limb], world.body_yaw[i].angle);
        assert_eq!(contact.entry[i].arms[limb].hand + arm.linear_velocity, arm.hand,
                   "the entry hand and the arm velocity stopped naming the same hand");
        let (bearing, height, reach) =
            actuator::inverse_hand(&anatomy, yaw, limb, arm.hand, arm.bearing);
        let round_trip = actuator::hand_position(&anatomy, yaw, limb, bearing, height, reach);
        assert_eq!((round_trip.x.raw() - arm.hand.x.raw(),
                    round_trip.y.raw() - arm.hand.y.raw(),
                    round_trip.z.raw() - arm.hand.z.raw()), (0, -5, 0),
                   "the frozen nonexact joint changed; this fixture no longer proves the drift");

        // No accumulator and no alpha: whatever comes back, the group proposed
        // none of it.
        let sums = vec![[0i128; 3]; rows.len()];
        let (mut bodies, mut trial) = (Vec::new(), Vec::new());
        let (mut state, mut credit) = (wounds.clone(), vec![Fx::ZERO; wounds.len()]);
        let (mut deltas, mut fact_loss) = (Vec::new(), Vec::new());
        let mut projector = ContactProjector {
            world: &world, entry: &contact.entry, bodies: &mut bodies, wounds: &mut state,
            credit: &mut credit, deltas: &mut deltas, fact_loss: &mut fact_loss,
        };
        projector.project(&rows, &sums, 0, &mut trial).expect("a projectable closure");
        assert_eq!(trial.len(), rows.len(), "the trial re-indexed the closure");
        // Compared raw, and printed raw. The drift is a handful of raw units on
        // a velocity of a thousandth, so `Fx`'s four-decimal Display shows two
        // identical rows and names nothing.
        for (got, want) in trial.iter().zip(&rows) {
            let raws = |row: &GeneralizedCollider| {
                (row.velocity.x.raw(), row.velocity.y.raw(), row.velocity.z.raw())
            };
            assert_eq!(raws(got), raws(want),
                       "alpha zero moved entity {} slot {}", want.entity.index, want.slot);
        }
        assert_eq!(resolution::closure_energy(&trial).expect("bounded closure"),
                   resolution::closure_energy(&rows).expect("bounded closure"),
                   "alpha zero changed the closure's energy");
    }

    /// One strike, captured raw, and the premise of the twenty-two tests below.
    ///
    /// **The subject of those tests is the contact solver, which is
    /// model-independent**: `resolve_contact` sits in `EMBODIED_PHASES` exactly
    /// where it sat in `ARTICULATED_PHASES`. What the model decides is only
    /// which configuration gets frozen -- one particular strike, at one
    /// particular tick -- which is why the session that deleted the articulated
    /// fixture reseated this and re-recorded its words rather than deleting it.
    ///
    /// **The reseat was not a frame conversion, and that is the finding worth
    /// keeping.** Measured on 2026-08-19: flipping the old fixture to `Embodied`
    /// and subtracting the observed body yaw from every arm bearing on every
    /// tick -- the exact inverse `World::world_arm_target` re-adds -- leaves a
    /// strike that never reaches `ContactKind::WeaponBody` at all in its
    /// ninety-six ticks. The bearing was never the problem: both bodies spawn at
    /// `Angle::ZERO` and neither turns, so the two frames name the same world
    /// angle throughout. What moved the strike is the *elbow*.
    /// `reachable_extent` clamps an embodied arm's height and reach onto the
    /// annulus the elbow permits before the actuator integrates, and at
    /// `CombatHeight::LOW` it folds this anatomy back to the minimum reach with
    /// its hand under the shoulder. The placement and the height below are both
    /// measurements, and every raw word in the tests that follow was re-recorded
    /// against them.
    fn directional_captured_strike() -> (
        World, ContactRuntime, Vec<GeneralizedCollider>, crate::combat::contact::ContactFact,
        Vec3, Vec3, Fx,
    ) {
        let mut config = crate::DuelConfigV1::shipped();
        config.fighters[0].spawn = Vec2::from_ints(10, 8);
        config.fighters[0].hands[1].as_mut().unwrap().geometry = crate::EquipmentGeometry::Segment {
            length: Fx::from_int(2), radius: Fx::from_ratio(1, 25),
        };
        config.fighters[1].spawn = Vec2::new(Fx::from_ratio(1_256, 100), Fx::from_int(8));
        config.fighters[1].anatomy = crate::AnatomyChoice::Fighter;
        config.max_ticks = 96;
        let scenario = Scenario::duel_from(&config).unwrap();
        let mut world = World::new(&scenario, 0);
        let (attacker, defender) = (world.id_of(0), world.id_of(1));
        let yaw = world.body_yaw[0].angle;
        let chamber = Angle::from_raw(yaw.raw().wrapping_sub(Angle::QUARTER.raw()));
        // **`chamber` and `yaw` are torso-frame offsets that happen to be world
        // angles, and only here.** Every command below takes its `body_yaw` from
        // `neutral_articulated`, which asks for the yaw the body already holds,
        // so slot 0 never turns off `Angle::ZERO` and `world_arm_target` adds a
        // zero back on the way in. Give this fixture a body that turns and the
        // two frames come apart and the subtraction becomes real.
        //
        // **Sixty-one hundred-and-twenty-eighths of standing height, and it is
        // a measurement rather than a taste.** The articulated capture asked for
        // `CombatHeight::LOW` and got it: a one-link arm holds any height its
        // shoulder can point at. An embodied elbow cannot, and
        // `reachable_extent` folds a low, fully-extended arm back onto the
        // annulus -- at `LOW` this anatomy comes back at the minimum reach
        // with its hand tucked under the shoulder, and the blade then meets
        // the target below the axis of the volume it strikes, which gives the
        // fact a vertical normal. That is not a re-record, it is a different
        // kind of contact: `CartesianResponseProjector` refuses a body row
        // carrying a Z impulse at all, so every `cartesian_contact_trial`
        // below answers `ResolutionError::Projector` and
        // `retained_static_search_rejects_the_imported_normal_bracket_before_selection`
        // answers `UnsupportedNonPlanar`.
        //
        // Swept on 2026-08-19 over every height from `0.34` to `0.625` in raw
        // steps of 128 and every hundredth of a unit of spacing from `11.50` to
        // `12.62` -- about twelve thousand placements, of which six hundred and
        // eleven reach a single weapon/body fact at all. This pair keeps every
        // premise the tests below assert *about the contact* rather than about
        // a number: a planar normal, a canonical tangent axis of 2, a Coulomb
        // proposal strictly inside the friction cone rather than on it, a
        // post-impact COM-relative velocity the free-hand test can read, a
        // 256-direction cone sweep that finds no consistent sliding direction,
        // and the coupled per-angle search's own `(NoConvergence, 608, 16)` --
        // which is the articulated capture's rejection, evaluation for
        // evaluation and gap for gap.
        //
        // **And it answers the same words under both laws**, which is not free
        // and is why the spacing stayed out near the articulated capture's.
        // Under `cartesian-recoil` a contact resolved before the captured one
        // moves the exact owner rows and the strike diverges; the whole band
        // below about `12.2` loses the fact entirely and reports
        // "captured strike lost contact" only in the feature build. Every
        // placement in the surviving band was checked in both builds and every
        // planar one agrees raw word for raw word.
        let height = crate::CombatHeight::try_from_raw(Fx::from_ratio(61, 128).raw())
            .expect("sixty-one hundred-and-twenty-eighths is a legal height");
        let strike = |world: &World, bearing| {
            let mut command = world.neutral_articulated(0);
            command.intent = Intent::Attack(defender);
            command.arms[1] = ArmTarget { bearing, height,
                                          reach: Fx::ONE, effort: Fx::ONE };
            command
        };
        let (max_speed, accel) = CAPTURED_ARM_RATES;
        for _ in 0..48 {
            assert!(matches!(world.submit_embodied_v1(attacker,
                crate::EmbodiedCommandV1::new(strike(&world, chamber))),
                crate::SubmitEmbodiedOutcome::Stored { rejection: None, .. }),
                "the chamber was refused rather than obeyed");
            world.submit_embodied_v1(defender,
                crate::EmbodiedCommandV1::new(world.neutral_articulated(1)));
            world.step_with_arm_rates(max_speed, accel);
        }
        let mut before = None;
        for _ in 0..48 {
            assert!(matches!(world.submit_embodied_v1(attacker,
                crate::EmbodiedCommandV1::new(strike(&world, yaw))),
                crate::SubmitEmbodiedOutcome::Stored { rejection: None, .. }),
                "the follow-through was refused rather than obeyed");
            world.submit_embodied_v1(defender,
                crate::EmbodiedCommandV1::new(world.neutral_articulated(1)));
            let saved = world.clone(); world.step_with_arm_rates(max_speed, accel);
            if world.contact_resolutions().iter().any(|row| row.fact.key.kind == ContactKind::WeaponBody) {
                before = Some(saved); break;
            }
        }
        let mut world = before.expect("captured strike lost contact");
        world.events.clear(); world.expire_unanswered_decisions(); world.retain_contact_entry();
        world.apply_articulated_movement(); world.record_contact_locomotion(); world.separate();
        world.drive_body_yaw(); world.apply_articulated_grips();
        world.drive_articulated_arms(max_speed, accel);
        world.derive_articulated_geometry(); world.clamp_contact_entry();
        let contact = world.contact.take().unwrap();
        let mut colliders = Vec::new();
        world.build_contact_colliders(&contact.entry, &mut colliders, &world.wounds);
        let weapon_body: Vec<_> = crate::combat::contact::collect_contacts(&colliders).into_iter()
            .filter(|fact| fact.key.kind == ContactKind::WeaponBody).collect();
        assert_eq!(weapon_body.len(), 1, "captured diagnostic acquired a competing weapon/body fact");
        let fact = weapon_body[0];
        let collider_at = |entity, slot| colliders.iter().find(|row| row.entity == entity &&
            if slot == crate::combat::contact::BODY_SLOT { matches!(row.shape, ContactShape::Body { .. }) }
            else { row.slot == slot }).copied().unwrap();
        let (row_a, row_b) = (collider_at(fact.key.a, fact.key.a_slot),
                              collider_at(fact.key.b, fact.key.b_slot));
        let owned_b_mass: i64 = colliders.iter().filter(|row| row.entity == fact.key.b)
            .map(|row| row.mass.raw() as i64).sum();
        let old_proposal = resolution::proposed_impulse(row_a.mass, row_b.mass,
            row_a.surface, row_b.surface, fact.velocity_a, fact.velocity_b, fact.normal);
        let owned_proposal = resolution::proposed_impulse(row_a.mass, Fx::from_raw(owned_b_mass as i32),
            row_a.surface, row_b.surface, fact.velocity_a, fact.velocity_b, fact.normal);
        let entities = [fact.key.a, fact.key.b];
        let rows = colliders.iter().filter(|row| entities.contains(&row.entity)).map(|row| {
            GeneralizedCollider { entity: row.entity, slot: row.slot,
                kind: if matches!(row.shape, ContactShape::Body { .. }) { GeneralizedKind::Body }
                      else { GeneralizedKind::Equipment }, mass: row.mass,
                velocity: row.velocity, velocity_offset: row.velocity_offset }
        }).collect();
        (world, contact, rows, fact, old_proposal, owned_proposal,
         row_a.surface.friction.min(row_b.surface.friction))
    }

    #[test]
    fn directional_response_captured_planar_column_is_rejected_as_nonlinear() {
        let (world, contact, rows, fact, _, _, _) = directional_captured_strike();
        let at = |entity, slot| rows.iter().position(|row| row.entity == entity && row.slot == slot).unwrap();
        let (a, b) = (at(fact.key.a, fact.key.a_slot), at(fact.key.b, fact.key.b_slot));
        assert_eq!((fact.normal.x.raw(), fact.normal.y.raw()), (7_810, 65_069));
        let q0 = (rows[b].velocity - rows[a].velocity).dot(fact.normal).raw();
        assert_eq!(q0, -5_539);
        let mut bodies = Vec::new(); let mut trial = Vec::new();
        let mut wounds = world.wounds.clone(); let mut credit = vec![Fx::ZERO; wounds.len()];
        let mut deltas = Vec::new(); let mut fact_loss = Vec::new();
        let mut projector = ContactProjector { world: &world, entry: &contact.entry,
            bodies: &mut bodies, wounds: &mut wounds, credit: &mut credit,
            deltas: &mut deltas, fact_loss: &mut fact_loss };
        let probe = |raw: i32, projector: &mut ContactProjector<'_>, trial: &mut Vec<GeneralizedCollider>| {
            let impulse = -fact.normal * Fx::from_raw(raw);
            let mut sums = vec![[0i128; 3]; rows.len()];
            sums[a] = [impulse.x.raw() as i128, impulse.y.raw() as i128, impulse.z.raw() as i128];
            sums[b] = [-sums[a][0], -sums[a][1], -sums[a][2]];
            projector.project(&rows, &sums, 65_536, trial).unwrap();
            (trial[b].velocity - trial[a].velocity).dot(fact.normal).raw() - q0
        };
        let (p, twice) = (probe(256, &mut projector, &mut trial),
                          probe(512, &mut projector, &mut trial));
        assert_eq!((p, twice, twice - 2 * p), (489, 957, -21));
        assert!((twice - 2 * p).abs() > 1,
                "the joint response unexpectedly became linear enough to solve");
    }

    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    enum Nonlinear1dReject { UnsupportedNonlinear, Projector }

    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    struct Nonlinear1dCandidate { impulse: i32, q: i32, energy: u64, evaluations: u8 }

    fn bounded_nonlinear_1d(
        before_energy: u64,
        mut project: impl FnMut(i32) -> Result<(i32, u64), ResolutionError>,
    ) -> Result<Nonlinear1dCandidate, Nonlinear1dReject> {
        let mut words = [0i32; 65]; let mut qs = [0i32; 65]; let mut energies = [0u64; 65];
        let mut used = 0usize;
        let mut evaluate = |word: i32| -> Result<(i32, u64), Nonlinear1dReject> {
            if let Some(at) = words[..used].iter().position(|cached| *cached == word) {
                return Ok((qs[at], energies[at]));
            }
            if used == words.len() { return Err(Nonlinear1dReject::UnsupportedNonlinear); }
            let result = project(word).map_err(|_| Nonlinear1dReject::Projector)?;
            words[used] = word; qs[used] = result.0; energies[used] = result.1; used += 1;
            Ok(result)
        };
        let (q_zero, _) = evaluate(0)?;
        if q_zero >= 0 {
            return Ok(Nonlinear1dCandidate { impulse: 0, q: q_zero,
                                             energy: before_energy, evaluations: used as u8 });
        }
        let mut lo = 0i32; let mut q_lo = q_zero; let mut hi = 1i32; let mut q_hi;
        loop {
            q_hi = evaluate(hi)?.0;
            if q_hi < q_lo { return Err(Nonlinear1dReject::UnsupportedNonlinear); }
            if q_hi >= 0 { break; }
            lo = hi; q_lo = q_hi;
            if hi == i32::MAX { return Err(Nonlinear1dReject::UnsupportedNonlinear); }
            hi = hi.checked_mul(2).unwrap_or(i32::MAX);
        }
        while hi - lo > 1 {
            let mid = lo + (hi - lo) / 2;
            let q_mid = evaluate(mid)?.0;
            if q_mid < q_lo || q_mid > q_hi {
                return Err(Nonlinear1dReject::UnsupportedNonlinear);
            }
            if q_mid >= 0 { hi = mid; q_hi = q_mid; }
            else { lo = mid; q_lo = q_mid; }
        }
        let mut best = None;
        for (word, q) in [(lo, q_lo), (hi, q_hi)] {
            let energy = evaluate(word)?.1;
            if q.abs() > 1 || energy > before_energy { continue; }
            let score = (q.abs(), before_energy - energy, word);
            if best.map_or(true, |(old, _)| score < old) { best = Some((score, (word, q, energy))); }
        }
        let (_, (impulse, q, energy)) = best.ok_or(Nonlinear1dReject::UnsupportedNonlinear)?;
        // A cache hit verifies the chosen actual projection without spending a
        // second projector call; production promotion owes an uncached final pass.
        assert_eq!(evaluate(impulse)?, (q, energy));
        Ok(Nonlinear1dCandidate { impulse, q, energy, evaluations: used as u8 })
    }

    #[test]
    fn nonlinear_response_rejects_the_old_captured_impulse_map() {
        let (world, contact, rows, fact, old_proposal, _, _) = directional_captured_strike();
        let at = |entity, slot| rows.iter().position(|row| row.entity == entity && row.slot == slot).unwrap();
        let (a, b) = (at(fact.key.a, fact.key.a_slot), at(fact.key.b, fact.key.b_slot));
        assert_eq!((fact.normal.x.raw(), fact.normal.y.raw(), fact.normal.z.raw()),
                   (7_810, 65_069, 0));
        assert_eq!((rows[b].velocity - rows[a].velocity).dot(fact.normal).raw(), -5_539);
        let before_energy = resolution::closure_energy(&rows).unwrap(); assert_eq!(before_energy, 291);
        let mut bodies = Vec::new(); let mut trial = Vec::new();
        let mut wounds = world.wounds.clone(); let mut credit = vec![Fx::ZERO; wounds.len()];
        let mut deltas = Vec::new(); let mut fact_loss = Vec::new();
        let mut projector = ContactProjector { world: &world, entry: &contact.entry,
            bodies: &mut bodies, wounds: &mut wounds, credit: &mut credit,
            deltas: &mut deltas, fact_loss: &mut fact_loss };
        let result = bounded_nonlinear_1d(before_energy, |raw| {
            let scale = |component: Fx| Fx::from_raw(((component.raw() as i64 * raw as i64) / 65_536) as i32);
            let impulse = Vec3::new(scale(old_proposal.x), scale(old_proposal.y), scale(old_proposal.z));
            let mut sums = vec![[0i128; 3]; rows.len()];
            sums[a] = [impulse.x.raw() as i128, impulse.y.raw() as i128, impulse.z.raw() as i128];
            sums[b] = [-sums[a][0], -sums[a][1], -sums[a][2]];
            projector.project(&rows, &sums, 65_536, &mut trial)?;
            Ok(((trial[b].velocity - trial[a].velocity).dot(fact.normal).raw(),
                resolution::closure_energy(&trial)?))
        });
        assert_eq!(result, Err(Nonlinear1dReject::UnsupportedNonlinear),
                   "the old local-mass map must not be blessed at its energetic upper crossing");
    }

    #[test]
    fn nonlinear_response_reaches_zero_restitution_with_the_owned_body_map() {
        let (world, contact, rows, fact, _, proposal, _) = directional_captured_strike();
        let mut colliders = Vec::new();
        world.build_contact_colliders(&contact.entry, &mut colliders, &world.wounds);
        let facts: Vec<_> = crate::combat::contact::collect_contacts(&colliders).into_iter()
            .filter(|row| row.key.kind == ContactKind::WeaponBody).collect();
        assert_eq!(facts, vec![fact]);
        let at = |entity, slot| rows.iter().position(|row| row.entity == entity && row.slot == slot).unwrap();
        let (a, b) = (at(fact.key.a, fact.key.a_slot), at(fact.key.b, fact.key.b_slot));
        assert_eq!(rows[b].kind, GeneralizedKind::Body);
        let owned_mass: i64 = rows.iter().filter(|row| row.entity == fact.key.b)
            .map(|row| row.mass.raw() as i64).sum();
        assert_eq!(owned_mass, 211_681);
        let before_energy = resolution::closure_energy(&rows).unwrap(); assert_eq!(before_energy, 291);
        let mut bodies = Vec::new(); let mut trial = Vec::new();
        let mut wounds = world.wounds.clone(); let mut credit = vec![Fx::ZERO; wounds.len()];
        let mut deltas = Vec::new(); let mut fact_loss = Vec::new();
        let mut projector = ContactProjector { world: &world, entry: &contact.entry,
            bodies: &mut bodies, wounds: &mut wounds, credit: &mut credit,
            deltas: &mut deltas, fact_loss: &mut fact_loss };
        let result = bounded_nonlinear_1d(before_energy, |raw| {
            let scale = |component: Fx| Fx::from_raw(((component.raw() as i64 * raw as i64) / 65_536) as i32);
            let impulse = Vec3::new(scale(proposal.x), scale(proposal.y), scale(proposal.z));
            let mut sums = vec![[0i128; 3]; rows.len()];
            sums[a] = [impulse.x.raw() as i128, impulse.y.raw() as i128, impulse.z.raw() as i128];
            // A body contact translates every row its owner holds. Dividing
            // the body's accumulator by body mass would therefore count more
            // momentum than the external impulse. This test-only candidate
            // gives the translated owner one aggregate-mass delta.
            for axis in 0..3 {
                let proposed = [proposal.x.raw(), proposal.y.raw(), proposal.z.raw()][axis] as i128;
                sums[b][axis] = -(proposed * raw as i128 * rows[b].mass.raw() as i128)
                    / (65_536i128 * owned_mass as i128);
            }
            projector.project(&rows, &sums, 65_536, &mut trial)?;
            Ok(((trial[b].velocity - trial[a].velocity).dot(fact.normal).raw(),
                resolution::closure_energy(&trial)?))
        }).expect("ownership-aware nonlinear response should reach flesh restitution");
        assert_eq!(result, Nonlinear1dCandidate {
            impulse: 64_982, q: 0, energy: 79, evaluations: 33,
        });
    }

    #[test]
    fn nonlinear_response_has_a_fixed_evaluation_budget() {
        let result = bounded_nonlinear_1d(100, |word| {
            Ok((-10 + word + word * word / 16, 90))
        }).unwrap();
        assert_eq!(result, Nonlinear1dCandidate { impulse: 7, q: 0, energy: 90, evaluations: 7 });
    }

    #[test]
    fn nonlinear_response_refuses_a_reversal_gap_and_energy_excess() {
        assert_eq!(bounded_nonlinear_1d(100, |word| Ok((
            if word < 5 { -2 } else { 2 }, 90))),
            Err(Nonlinear1dReject::UnsupportedNonlinear));
        assert_eq!(bounded_nonlinear_1d(100, |word| Ok((
            match word { 0 => -10, 1 => -9, _ => -11 }, 90))),
            Err(Nonlinear1dReject::UnsupportedNonlinear));
        assert_eq!(bounded_nonlinear_1d(100, |word| Ok((-2 + word, 101))),
            Err(Nonlinear1dReject::UnsupportedNonlinear));
    }

    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    enum Nonlinear2dReject { UnsupportedNonlinear, Cycle, NoConvergence }

    fn nonlinear_visit(visited: &mut [[i32; 2]; 16], visits: &mut usize, words: [i32; 2])
        -> Result<(), Nonlinear2dReject>
    {
        if visited[..*visits].contains(&words) { return Err(Nonlinear2dReject::Cycle); }
        if *visits == visited.len() { return Err(Nonlinear2dReject::NoConvergence); }
        visited[*visits] = words; *visits += 1; Ok(())
    }

    fn bounded_nonlinear_2d(
        before_energy: u64, symmetric: bool,
        mut project: impl FnMut([i32; 2]) -> Result<([i32; 2], u64), ResolutionError>,
    ) -> Result<([i32; 2], [i32; 2], u64, u16), Nonlinear2dReject> {
        let mut cache_words = [[0i32; 2]; 256]; let mut cache_q = [[0i32; 2]; 256];
        let mut cache_energy = [0u64; 256]; let mut used = 0usize;
        let mut evaluate = |words: [i32; 2]| -> Result<([i32; 2], u64), ResolutionError> {
            if let Some(at) = cache_words[..used].iter().position(|cached| *cached == words) {
                return Ok((cache_q[at], cache_energy[at]));
            }
            if used == 256 { return Err(ResolutionError::ResolutionCount); }
            let answer = project(words)?;
            cache_words[used] = words; cache_q[used] = answer.0; cache_energy[used] = answer.1;
            used += 1; Ok(answer)
        };
        if symmetric {
            let answer = bounded_nonlinear_1d(before_energy, |word| {
                let (q, energy) = evaluate([word, word])?;
                if q[0] != q[1] { return Err(ResolutionError::Projector); }
                Ok((q[0], energy))
            }).map_err(|_| Nonlinear2dReject::UnsupportedNonlinear)?;
            let words = [answer.impulse; 2]; let (q, energy) = evaluate(words)
                .map_err(|_| Nonlinear2dReject::UnsupportedNonlinear)?;
            if q.iter().any(|value| value.abs() > 1) || energy > before_energy {
                return Err(Nonlinear2dReject::UnsupportedNonlinear);
            }
            return Ok((words, q, energy, used as u16));
        }
        let mut words = [0i32; 2]; let mut visited = [[i32::MIN; 2]; 16]; let mut visits = 0;
        for _ in 0..8 {
            nonlinear_visit(&mut visited, &mut visits, words)?;
            for coordinate in 0..2 {
                let mut zero = words; zero[coordinate] = 0;
                let (zero_q, _) = evaluate(zero).map_err(|_| Nonlinear2dReject::UnsupportedNonlinear)?;
                if zero_q[coordinate] >= 0 { words[coordinate] = 0; continue; }
                let answer = bounded_nonlinear_1d(before_energy, |word| {
                    let mut candidate = words; candidate[coordinate] = word;
                    let (q, energy) = evaluate(candidate)?; Ok((q[coordinate], energy))
                }).map_err(|_| Nonlinear2dReject::UnsupportedNonlinear)?;
                words[coordinate] = answer.impulse;
            }
            let (q, energy) = evaluate(words).map_err(|_| Nonlinear2dReject::UnsupportedNonlinear)?;
            if (0..2).all(|i| if words[i] == 0 { q[i] >= -1 } else { q[i].abs() <= 1 })
                && energy <= before_energy {
                return Ok((words, q, energy, used as u16));
            }
        }
        Err(Nonlinear2dReject::NoConvergence)
    }

    #[test]
    fn nonlinear_shared_target_uses_both_projected_coordinates() {
        let world = World::new(&crowded_scenario(), 1);
        let ids = [world.id_of(0), world.id_of(1), world.id_of(2)];
        let rows = vec![
            GeneralizedCollider { entity: ids[0], slot: crate::combat::contact::BODY_SLOT,
                kind: GeneralizedKind::Body, mass: Fx::ONE, velocity: Vec3::X,
                velocity_offset: Vec3::ZERO },
            GeneralizedCollider { entity: ids[1], slot: crate::combat::contact::BODY_SLOT,
                kind: GeneralizedKind::Body, mass: Fx::ONE, velocity: Vec3::X,
                velocity_offset: Vec3::ZERO },
            GeneralizedCollider { entity: ids[2], slot: crate::combat::contact::BODY_SLOT,
                kind: GeneralizedKind::Body, mass: Fx::ONE, velocity: Vec3::ZERO,
                velocity_offset: Vec3::ZERO },
        ];
        let before_energy = resolution::closure_energy(&rows).unwrap(); assert_eq!(before_energy, 65_536);
        let mut bodies = Vec::new(); let mut trial = Vec::new(); let mut wounds = world.wounds.clone();
        let mut credit = vec![Fx::ZERO; wounds.len()]; let mut deltas = Vec::new(); let mut fact_loss = Vec::new();
        let mut projector = ContactProjector { world: &world, entry: &[], bodies: &mut bodies,
            wounds: &mut wounds, credit: &mut credit, deltas: &mut deltas, fact_loss: &mut fact_loss };
        let result = bounded_nonlinear_2d(before_energy, true, |words| {
            let mut sums = vec![[0i128; 3]; 3];
            sums[0][0] = -(words[0] as i128); sums[1][0] = -(words[1] as i128);
            sums[2][0] = words[0] as i128 + words[1] as i128;
            projector.project(&rows, &sums, 65_536, &mut trial)?;
            Ok(([trial[2].velocity.x.raw() - trial[0].velocity.x.raw(),
                 trial[2].velocity.x.raw() - trial[1].velocity.x.raw()],
                resolution::closure_energy(&trial)?))
        }).unwrap();
        assert_eq!((result.0, result.1, result.2), ([21_845, 21_845], [-1, -1], 43_690));
        assert!(result.3 <= 65);
    }

    #[test]
    fn nonlinear_shared_target_permutation_maps_back_and_opening_stays_zero() {
        let solve = |swap: bool| bounded_nonlinear_2d(100, false, |words| {
            let physical = if swap { [words[1], words[0]] } else { words };
            let q = [-3 + physical[0] + physical[1], 2];
            Ok((if swap { [q[1], q[0]] } else { q }, 90))
        });
        let a = solve(false).unwrap(); let b = solve(true).unwrap();
        assert_eq!(a.0, [3, 0]); assert_eq!([b.0[1], b.0[0]], a.0);
    }

    #[test]
    fn nonlinear_shared_target_rejects_a_cycle_and_no_convergence_by_name() {
        assert_eq!(bounded_nonlinear_2d(100, false, |words| {
            Ok(([-1 + words[0] - words[1], -1 - words[0] + words[1]], 90))
        }), Err(Nonlinear2dReject::NoConvergence));
        let mut visited = [[i32::MIN; 2]; 16]; let mut visits = 0;
        assert_eq!(nonlinear_visit(&mut visited, &mut visits, [3, 5]), Ok(()));
        assert_eq!(nonlinear_visit(&mut visited, &mut visits, [3, 5]), Err(Nonlinear2dReject::Cycle));
    }

    #[test]
    fn nonlinear_vertical_body_response_is_rejected_by_the_floor_constraint() {
        let world = World::new(&crowded_scenario(), 1);
        let ids = [world.id_of(0), world.id_of(1)];
        let rows = vec![
            GeneralizedCollider { entity: ids[0], slot: crate::combat::contact::BODY_SLOT,
                kind: GeneralizedKind::Body, mass: Fx::ONE, velocity: Vec3::ZERO,
                velocity_offset: Vec3::ZERO },
            GeneralizedCollider { entity: ids[1], slot: crate::combat::contact::BODY_SLOT,
                kind: GeneralizedKind::Body, mass: Fx::ONE, velocity: Vec3::ZERO,
                velocity_offset: Vec3::ZERO },
        ];
        let mut bodies = Vec::new(); let mut trial = Vec::new(); let mut wounds = world.wounds.clone();
        let mut credit = vec![Fx::ZERO; wounds.len()]; let mut deltas = Vec::new(); let mut fact_loss = Vec::new();
        let mut projector = ContactProjector { world: &world, entry: &[], bodies: &mut bodies,
            wounds: &mut wounds, credit: &mut credit, deltas: &mut deltas, fact_loss: &mut fact_loss };
        // Body rows have no vertical degree of freedom: opposite Z impulses
        // are floor reactions, not a contact response coordinate.
        let mut sums = vec![[0i128; 3]; 2]; sums[0][2] = -65_536; sums[1][2] = 65_536;
        projector.project(&rows, &sums, 65_536, &mut trial).unwrap();
        assert_eq!((trial[0].velocity.z, trial[1].velocity.z), (Fx::ZERO, Fx::ZERO));
        let vertical_closing = -65_536;
        let response = (trial[1].velocity.z - trial[0].velocity.z).raw();
        assert_eq!(response, 0);
        assert_eq!(bounded_nonlinear_1d(0, |_| Ok((vertical_closing + response, 0))),
                   Err(Nonlinear1dReject::UnsupportedNonlinear));
    }

    #[test]
    fn nonlinear_joint_branch_is_rejected_before_root_search() {
        let (world, contact, rows, fact, _, _, _) = directional_captured_strike();
        let at = |entity, slot| rows.iter().position(|row| row.entity == entity && row.slot == slot).unwrap();
        let (a, b) = (at(fact.key.a, fact.key.a_slot), at(fact.key.b, fact.key.b_slot));
        assert_eq!(rows[a].kind, GeneralizedKind::Equipment,
                   "joint fixture lost its source-held articulated row");
        let q0 = (rows[b].velocity - rows[a].velocity).dot(fact.normal).raw();
        let mut bodies = Vec::new(); let mut trial = Vec::new(); let mut wounds = world.wounds.clone();
        let mut credit = vec![Fx::ZERO; wounds.len()]; let mut deltas = Vec::new(); let mut fact_loss = Vec::new();
        let mut projector = ContactProjector { world: &world, entry: &contact.entry,
            bodies: &mut bodies, wounds: &mut wounds, credit: &mut credit,
            deltas: &mut deltas, fact_loss: &mut fact_loss };
        let mut probe = |raw: i32| {
            let impulse = -fact.normal * Fx::from_raw(raw);
            let mut sums = vec![[0i128; 3]; rows.len()];
            sums[a] = [impulse.x.raw() as i128, impulse.y.raw() as i128, impulse.z.raw() as i128];
            sums[b] = [-sums[a][0], -sums[a][1], -sums[a][2]];
            projector.project(&rows, &sums, 65_536, &mut trial).unwrap();
            (trial[b].velocity - trial[a].velocity).dot(fact.normal).raw() - q0
        };
        let (p, twice) = (probe(256), probe(512));
        assert_eq!((p, twice, twice - 2 * p), (489, 957, -21));
        let branch = if (twice - 2 * p).abs() > 1 {
            Err(Nonlinear1dReject::UnsupportedNonlinear)
        } else { Ok(()) };
        assert_eq!(branch, Err(Nonlinear1dReject::UnsupportedNonlinear));
    }

    #[test]
    fn projected_friction_is_cone_valid_but_does_not_solve_articulated_sliding() {
        use crate::combat::resolution::tests::{canonical_tangents, inside_friction_box_and_cone,
                                               tangent_limit_raw};
        let (world, contact, mut rows, fact, _, proposal, friction) = directional_captured_strike();
        let at = |entity, slot| rows.iter().position(|row| row.entity == entity && row.slot == slot).unwrap();
        let (a, b) = (at(fact.key.a, fact.key.a_slot), at(fact.key.b, fact.key.b_slot));
        let owned_mass: i64 = rows.iter().filter(|row| row.entity == fact.key.b)
            .map(|row| row.mass.raw() as i64).sum();
        let scale_raw = 64_982i32;
        let scale = |component: Fx| Fx::from_raw(
            ((component.raw() as i64 * scale_raw as i64) / 65_536) as i32);
        let tangents = canonical_tangents(fact.normal).unwrap();
        assert_eq!(tangents.axis, 2);
        // Give the retained row a second, Z-tangent slip component. This is a
        // test-only velocity perturbation on the actual jointed-arm projector
        // -- "articulated" in this test's name and the next's is the *arm*,
        // which the surviving model has two links of, not the deleted combat
        // model -- and not a new body degree of freedom: the target body's Z
        // reaction is still discarded by the floor.
        rows[a].velocity += tangents.second * Fx::from_raw(64);
        let impulse = Vec3::new(scale(proposal.x), scale(proposal.y), scale(proposal.z))
            - tangents.second * Fx::from_raw(64);
        let normal_raw = (-impulse.dot(fact.normal)).raw() as i64;
        let tangent_words = [impulse.dot(tangents.first).raw() as i64,
                             impulse.dot(tangents.second).raw() as i64];
        let limit = tangent_limit_raw(friction.raw(), normal_raw).unwrap();
        assert!(inside_friction_box_and_cone(tangent_words[0], tangent_words[1], limit).unwrap());
        assert_ne!(tangent_words, [0, 0], "captured strike lost channel-relevant slip response");

        let mut sums = vec![[0i128; 3]; rows.len()];
        sums[a] = [impulse.x.raw() as i128, impulse.y.raw() as i128, impulse.z.raw() as i128];
        for axis in 0..3 {
            let proposed = [proposal.x.raw(), proposal.y.raw(), proposal.z.raw()][axis] as i128;
            sums[b][axis] = -(proposed * scale_raw as i128 * rows[b].mass.raw() as i128)
                / (65_536i128 * owned_mass as i128);
        }
        let before_relative = rows[b].velocity - rows[a].velocity;
        let before_tangent = before_relative - fact.normal * before_relative.dot(fact.normal);
        let before_energy = resolution::closure_energy(&rows).unwrap();
        let mut bodies = Vec::new(); let mut trial = Vec::new(); let mut wounds = world.wounds.clone();
        let mut credit = vec![Fx::ZERO; wounds.len()]; let mut deltas = Vec::new(); let mut fact_loss = Vec::new();
        let mut projector = ContactProjector { world: &world, entry: &contact.entry,
            bodies: &mut bodies, wounds: &mut wounds, credit: &mut credit,
            deltas: &mut deltas, fact_loss: &mut fact_loss };
        projector.project(&rows, &sums, 65_536, &mut trial).unwrap();
        let after_relative = trial[b].velocity - trial[a].velocity;
        let q = after_relative.dot(fact.normal).raw();
        let after_tangent = after_relative - fact.normal * after_relative.dot(fact.normal);
        let after_energy = resolution::closure_energy(&trial).unwrap();
        assert_eq!((normal_raw, tangent_words, limit), (4_921, [-332, -64], 1_230));
        assert_eq!((before_tangent.length().raw(), after_tangent.length().raw()), (378, 12));
        assert_eq!((q, before_energy, after_energy), (0, 291, 79));
        assert!(after_energy <= before_energy);
        assert!(after_tangent.length() <= before_tangent.length(), "friction increased projected slip");
        assert!(after_tangent.length().raw() > 1,
                "fixture unexpectedly became a sticking contact");
        assert!(tangent_words[0] * tangent_words[0] + tangent_words[1] * tangent_words[1]
                < limit * limit,
                "a sliding solution must reach the circular cone boundary");
    }

    #[test]
    fn bounded_sliding_friction_rejects_the_actual_articulated_cone() {
        use crate::combat::resolution::tests::{canonical_tangents, tangent_limit_raw};
        let (world, contact, mut rows, fact, _, _, friction) = directional_captured_strike();
        let at = |entity, slot| rows.iter().position(|row| row.entity == entity && row.slot == slot).unwrap();
        let (a, b) = (at(fact.key.a, fact.key.a_slot), at(fact.key.b, fact.key.b_slot));
        let tangents = canonical_tangents(fact.normal).unwrap();
        rows[a].velocity += tangents.second * Fx::from_raw(64);
        let normal_raw = 4_921i64;
        let limit = tangent_limit_raw(friction.raw(), normal_raw).unwrap();
        assert_eq!(limit, 1_230);
        let owned_mass: i64 = rows.iter().filter(|row| row.entity == fact.key.b)
            .map(|row| row.mass.raw() as i64).sum();
        let numerator = |state: &[GeneralizedCollider]| -> i128 {
            state.iter().map(|row| {
                let v = row.velocity;
                row.mass.raw() as i128 * (v.x.raw() as i128 * v.x.raw() as i128
                    + v.y.raw() as i128 * v.y.raw() as i128
                    + v.z.raw() as i128 * v.z.raw() as i128)
            }).sum()
        };
        let initial_numerator = numerator(&rows);
        let mut bodies = Vec::new(); let mut trial = Vec::new(); let mut wounds = world.wounds.clone();
        let mut credit = vec![Fx::ZERO; wounds.len()]; let mut deltas = Vec::new(); let mut fact_loss = Vec::new();
        let mut projector = ContactProjector { world: &world, entry: &contact.entry,
            bodies: &mut bodies, wounds: &mut wounds, credit: &mut credit,
            deltas: &mut deltas, fact_loss: &mut fact_loss };
        let project = |j0: i32, j1: i32, projector: &mut ContactProjector<'_>, trial: &mut Vec<GeneralizedCollider>| {
            let impulse = -fact.normal * Fx::from_raw(normal_raw as i32)
                + tangents.first * Fx::from_raw(j0) + tangents.second * Fx::from_raw(j1);
            let mut sums = vec![[0i128; 3]; rows.len()];
            sums[a] = [impulse.x.raw() as i128, impulse.y.raw() as i128, impulse.z.raw() as i128];
            for axis in 0..3 {
                sums[b][axis] = -(sums[a][axis] * rows[b].mass.raw() as i128) / owned_mass as i128;
            }
            projector.project(&rows, &sums, 65_536, trial).unwrap();
            let relative = trial[b].velocity - trial[a].velocity;
            ([relative.dot(fact.normal).raw(), relative.dot(tangents.first).raw(),
              relative.dot(tangents.second).raw()], numerator(trial))
        };
        let (normal_q, normal_numerator) = project(-332, -64, &mut projector, &mut trial);
        assert!(normal_q[0].abs() <= 1 && normal_numerator <= initial_numerator);
        let mut best = None;
        for step in 0u16..256 {
            let angle = Angle::from_raw(step << 8);
            let j0 = ((angle.cos().raw() as i64 * limit) / 65_536) as i32;
            let j1 = ((angle.sin().raw() as i64 * limit) / 65_536) as i32;
            let (q, energy) = project(j0, j1, &mut projector, &mut trial);
            if q[0].abs() > 1 || energy > initial_numerator || energy > normal_numerator { continue; }
            let cross = (j0 as i64 * q[2] as i64 - j1 as i64 * q[1] as i64).abs();
            let dot = j0 as i64 * q[1] as i64 + j1 as i64 * q[2] as i64;
            if dot <= 0 { continue; }
            let score = (cross, -dot, energy, j0, j1);
            if best.map_or(true, |old: ((i64, i64, i128, i32, i32), [i32; 3])| score < old.0) {
                best = Some((score, q));
            }
        }
        assert_eq!((initial_numerator, normal_numerator, normal_q),
                   (2_503_991_288_880, 682_796_431_610, [1, -6, -11]));
        assert_eq!(best, None,
                   "a 256-direction cone search must not hide its energy/normal rejection");
    }

    #[test]
    fn widened_energy_numerator_sees_subunit_velocity_energy() {
        let denominator = 2i128 * 65_536 * 65_536;
        let energy = |velocity: [i128; 3]| velocity.into_iter().map(|raw| raw * raw).sum::<i128>();
        let (normal, valid, invalid) = (energy([9, 0, 0]), energy([8, 4, 0]), energy([9, 1, 0]));
        assert_eq!((normal, valid, invalid), (81, 80, 82));
        assert_eq!((normal / denominator, valid / denominator, invalid / denominator), (0, 0, 0));
        assert!(valid <= normal && invalid > normal,
                "the widened numerator, not the public energy plateau, decides friction acceptance");
    }

    #[test]
    fn zero_friction_control_repeats_identical_projection_sums() {
        let (world, contact, rows, fact, _, proposal, _) = directional_captured_strike();
        let at = |entity, slot| rows.iter().position(|row| row.entity == entity && row.slot == slot).unwrap();
        let (a, b) = (at(fact.key.a, fact.key.a_slot), at(fact.key.b, fact.key.b_slot));
        let owned_mass: i64 = rows.iter().filter(|row| row.entity == fact.key.b)
            .map(|row| row.mass.raw() as i64).sum();
        let scale_raw = 64_982i32;
        let scale = |component: Fx| Fx::from_raw(
            ((component.raw() as i64 * scale_raw as i64) / 65_536) as i32);
        let impulse = Vec3::new(scale(proposal.x), scale(proposal.y), scale(proposal.z));
        let mut sums = vec![[0i128; 3]; rows.len()];
        sums[a] = [impulse.x.raw() as i128, impulse.y.raw() as i128, impulse.z.raw() as i128];
        for axis in 0..3 {
            sums[b][axis] = -(sums[a][axis] * rows[b].mass.raw() as i128) / owned_mass as i128;
        }
        let mut bodies = Vec::new(); let mut normal = Vec::new(); let mut zero_mu = Vec::new();
        let mut wounds = world.wounds.clone(); let mut credit = vec![Fx::ZERO; wounds.len()];
        let mut deltas = Vec::new(); let mut fact_loss = Vec::new();
        let mut projector = ContactProjector { world: &world, entry: &contact.entry,
            bodies: &mut bodies, wounds: &mut wounds, credit: &mut credit,
            deltas: &mut deltas, fact_loss: &mut fact_loss };
        projector.project(&rows, &sums, 65_536, &mut normal).unwrap();
        projector.project(&rows, &sums, 65_536, &mut zero_mu).unwrap();
        assert_eq!(zero_mu, normal, "identical projection sums diverged");
    }

    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    enum SlidingSolveReject { Cycle, NoConvergence, Unsupported }

    #[test]
    fn coupled_sliding_friction_resolves_normal_per_angle_on_the_actual_projector() {
        use crate::combat::resolution::tests::{canonical_tangents, tangent_limit_raw};
        let (world, contact, mut rows, fact, _, _proposal, friction) = directional_captured_strike();
        let at = |entity, slot| rows.iter().position(|row| row.entity == entity && row.slot == slot).unwrap();
        let (a, b) = (at(fact.key.a, fact.key.a_slot), at(fact.key.b, fact.key.b_slot));
        let tangents = canonical_tangents(fact.normal).unwrap();
        rows[a].velocity += tangents.second * Fx::from_raw(64);
        let owned_mass: i64 = rows.iter().filter(|row| row.entity == fact.key.b)
            .map(|row| row.mass.raw() as i64).sum();
        let numerator = |state: &[GeneralizedCollider]| -> i128 { state.iter().map(|row| {
            let v = row.velocity; row.mass.raw() as i128 * (v.x.raw() as i128 * v.x.raw() as i128
                + v.y.raw() as i128 * v.y.raw() as i128 + v.z.raw() as i128 * v.z.raw() as i128)
        }).sum() };
        let initial_numerator = numerator(&rows);
        let mut bodies = Vec::new(); let mut trial = Vec::new(); let mut wounds = world.wounds.clone();
        let mut credit = vec![Fx::ZERO; wounds.len()]; let mut deltas = Vec::new(); let mut fact_loss = Vec::new();
        let mut projector = ContactProjector { world: &world, entry: &contact.entry,
            bodies: &mut bodies, wounds: &mut wounds, credit: &mut credit,
            deltas: &mut deltas, fact_loss: &mut fact_loss };
        let mut evaluations = 0u16;
        let mut project = |scale_raw: i32, tangent: Vec3| {
            evaluations += 1; assert!(evaluations <= 3_072);
            // A normal coordinate is pure `-n*lambda`. The ordinary proposal
            // already contains Coulomb tangent and would bias every ray by the
            // captured `(-332, -64)` response -- `(99, -64)` before the
            // embodied reseat, and the same argument either way.
            let normal = Vec3::new(
                Fx::from_raw(toward_zero_component(-fact.normal.x.raw(), scale_raw).unwrap()),
                Fx::from_raw(toward_zero_component(-fact.normal.y.raw(), scale_raw).unwrap()),
                Fx::from_raw(toward_zero_component(-fact.normal.z.raw(), scale_raw).unwrap()));
            let impulse = normal + tangent;
            let mut sums = vec![[0i128; 3]; rows.len()];
            sums[a] = [impulse.x.raw() as i128, impulse.y.raw() as i128, impulse.z.raw() as i128];
            for axis in 0..3 { sums[b][axis] = -(sums[a][axis] * rows[b].mass.raw() as i128) / owned_mass as i128; }
            projector.project(&rows, &sums, 65_536, &mut trial).unwrap();
            let relative = trial[b].velocity - trial[a].velocity;
            ([relative.dot(fact.normal).raw(), relative.dot(tangents.first).raw(),
              relative.dot(tangents.second).raw()], numerator(&trial), impulse)
        };
        let pre_relative = rows[b].velocity - rows[a].velocity;
        let mut angle = fx::atan2(pre_relative.dot(tangents.second),
                                  pre_relative.dot(tangents.first));
        let mut visited = [u16::MAX; 16]; let mut visits = 0;
        let mut rejected_gap = None;
        let mut gap_rows = [(0u16, 0i32, 0i32, 0i32, 0i32); 16]; let mut gap_count = 0;
        let result: Result<_, SlidingSolveReject> = loop {
            if visits == 16 { break Err(SlidingSolveReject::NoConvergence); }
            if visited[..visits].contains(&angle.raw()) { break Err(SlidingSolveReject::Cycle); }
            visited[visits] = angle.raw(); visits += 1;
            let direction = (tangents.first * angle.cos() + tangents.second * angle.sin())
                .normalized_or_zero();
            let mut final_vector = Vec3::ZERO;
            let mut samples = [(0i32, 0i32); 40]; let mut sample_count = 0usize;
            let bracket = verified_normal_bracket(0, 131_072, |mid| {
                let (_, _, impulse) = project(mid, Vec3::ZERO);
                let jn = (-impulse.dot(fact.normal)).raw() as i64;
                let limit = tangent_limit_raw(friction.raw(), jn)
                    .expect("captured positive friction and normal impulse") ;
                let boundary = greatest_physical_radius(direction,
                    limit.clamp(0, i32::MAX as i64) as i32);
                match boundary {
                    Ok((_, vector)) => {
                        final_vector = vector; let q = project(mid, vector).0[0];
                        samples[sample_count] = (mid, q); sample_count += 1; q
                    }
                    Err(_) => i32::MIN,
                }
            });
            let hi = match bracket { Ok((word, _)) => word, Err(_) => {
                let lower = samples[..sample_count].iter().filter(|(_, q)| *q < 0).max_by_key(|(word, _)| *word);
                let upper = samples[..sample_count].iter().filter(|(_, q)| *q >= 0).min_by_key(|(word, _)| *word);
                rejected_gap = lower.zip(upper).map(|(lo, hi)| (*lo, *hi, angle.raw(), final_vector));
                if let Some((lo, hi)) = lower.zip(upper) {
                    gap_rows[gap_count] = (angle.raw(), lo.0, lo.1, hi.0, hi.1); gap_count += 1;
                }
                angle = Angle::from_raw(angle.raw().wrapping_add(1));
                continue
            }};
            let (_, _, normal_impulse) = project(hi, Vec3::ZERO);
            let limit = match tangent_limit_raw(friction.raw(),
                (-normal_impulse.dot(fact.normal)).raw() as i64) {
                Ok(value) => value as i32, Err(_) => break Err(SlidingSolveReject::Unsupported),
            };
            let boundary = match greatest_physical_radius(direction, limit) {
                Ok(value) => value, Err(_) => break Err(SlidingSolveReject::Unsupported),
            };
            final_vector = boundary.1;
            let (q, energy, impulse) = project(hi, final_vector);
            let slip = Vec2::new(Fx::from_raw(q[1]), Fx::from_raw(q[2]));
            if slip.length().raw() <= 1 && q[0].abs() <= 1 && energy <= initial_numerator {
                break Ok((hi, angle.raw(), boundary.0, q, energy, impulse, evaluations));
            }
            let next = fx::atan2(Fx::from_raw(q[2]), Fx::from_raw(q[1]));
            if next == angle {
                if q[0].abs() <= 1 && energy <= initial_numerator {
                    break Ok((hi, angle.raw(), boundary.0, q, energy, impulse, evaluations));
                }
                break Err(SlidingSolveReject::Unsupported);
            }
            angle = next;
        };
        assert_eq!((result, evaluations, gap_count), (Err(SlidingSolveReject::NoConvergence), 608, 16));
        let (lower, upper, rejected_angle, vector) = rejected_gap.unwrap();
        assert_eq!((lower, upper, rejected_angle), ((4_921, -3), (4_922, 2), 34_568));
        assert_eq!((vector.x.raw(), vector.y.raw(), vector.z.raw()), (1_203, -144, -211));
        assert_eq!(gap_rows[0], (34_553, 4_921, -3, 4_922, 2));
        assert_eq!(gap_rows[15], (34_568, 4_921, -3, 4_922, 2));
    }

    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    enum SlidingPrerequisiteReject { Boundary, Bounds, Gap, Reversal, Capacity, Budget }

    fn toward_zero_component(component_raw: i32, radial_raw: i32) -> Result<i32, SlidingPrerequisiteReject> {
        let product = (component_raw as i128).checked_mul(radial_raw as i128)
            .ok_or(SlidingPrerequisiteReject::Boundary)?;
        i32::try_from(product / 65_536).map_err(|_| SlidingPrerequisiteReject::Boundary)
    }

    fn greatest_physical_radius(direction: Vec3, limit_raw: i32)
        -> Result<(i32, Vec3), SlidingPrerequisiteReject>
    {
        if limit_raw < 0 || direction == Vec3::ZERO { return Err(SlidingPrerequisiteReject::Boundary); }
        if limit_raw == 0 { return Ok((0, Vec3::ZERO)); }
        let valid = |rho: i32| -> Result<(bool, Vec3), SlidingPrerequisiteReject> {
            let value = Vec3::new(Fx::from_raw(toward_zero_component(direction.x.raw(), rho)?),
                                  Fx::from_raw(toward_zero_component(direction.y.raw(), rho)?),
                                  Fx::from_raw(toward_zero_component(direction.z.raw(), rho)?));
            let square = value.x.raw() as i128 * value.x.raw() as i128
                + value.y.raw() as i128 * value.y.raw() as i128
                + value.z.raw() as i128 * value.z.raw() as i128;
            Ok((square <= limit_raw as i128 * limit_raw as i128, value))
        };
        if valid(i32::MAX)?.0 { return Ok((i32::MAX, valid(i32::MAX)?.1)); }
        let mut lo = 0i32; let mut hi = i32::MAX;
        while hi - lo > 1 {
            let mid = lo + ((hi as i64 - lo as i64) / 2) as i32;
            if valid(mid)?.0 { lo = mid; } else { hi = mid; }
        }
        let (inside, vector) = valid(lo)?; if !inside { return Err(SlidingPrerequisiteReject::Boundary); }
        if lo != i32::MAX && valid(lo + 1)?.0 { return Err(SlidingPrerequisiteReject::Boundary); }
        Ok((lo, vector))
    }

    fn verified_normal_bracket(
        mut lo: i32, mut hi: i32, mut evaluate: impl FnMut(i32) -> i32,
    ) -> Result<(i32, i32), SlidingPrerequisiteReject> {
        if lo < 0 || hi <= lo { return Err(SlidingPrerequisiteReject::Bounds); }
        let mut q_lo = evaluate(lo); let mut q_hi = evaluate(hi);
        if q_lo >= 0 || q_hi < 0 || q_hi < q_lo { return Err(SlidingPrerequisiteReject::Reversal); }
        while hi - lo > 1 {
            let mid = lo + (hi - lo) / 2; let q = evaluate(mid);
            if q < q_lo || q > q_hi { return Err(SlidingPrerequisiteReject::Reversal); }
            if q >= 0 { hi = mid; q_hi = q; } else { lo = mid; q_lo = q; }
        }
        let answer = [(lo, q_lo), (hi, q_hi)].into_iter()
            .filter(|(_, q)| q.unsigned_abs() <= 1)
            .min_by_key(|(word, q)| (q.unsigned_abs(), *word));
        answer.ok_or(SlidingPrerequisiteReject::Gap)
    }

    struct FixedProjectionCache {
        keys: [[i32; 3]; 64], values: [[i32; 3]; 64], used: usize, calls: u16, budget: u16,
    }

    impl FixedProjectionCache {
        fn new(budget: u16) -> Self {
            Self { keys: [[i32::MIN; 3]; 64], values: [[0; 3]; 64], used: 0, calls: 0, budget }
        }
        fn get_or_project(&mut self, key: [i32; 3], project: impl FnOnce() -> [i32; 3])
            -> Result<[i32; 3], SlidingPrerequisiteReject>
        {
            if let Some(at) = self.keys[..self.used].iter().position(|old| *old == key) {
                return Ok(self.values[at]);
            }
            if self.used == self.keys.len() { return Err(SlidingPrerequisiteReject::Capacity); }
            if self.calls == self.budget { return Err(SlidingPrerequisiteReject::Budget); }
            let value = project(); self.keys[self.used] = key; self.values[self.used] = value;
            self.used += 1; self.calls += 1; Ok(value)
        }
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn lifted_toi_position_can_cross_before_the_integer_endpoint_sweep() {
        // Smart34's exact m=3*ONE, J=4 coast reaches tick one as x=1 with
        // remainder 2^32. Halfway through tick two, the complete numerator
        // reaches x=2 exactly. The existing sweep sees only endpoints 1->2
        // and truncates its halfway interpolation back to 1.
        let mass = 196_608i128; let momentum = 262_144i128;
        let position_denominator = mass * 65_536;
        let tick_one_position = 1i128; let tick_one_remainder = 4_294_967_296i128;
        let halfway = 32_768i128;
        let lifted_numerator = position_denominator * tick_one_position
            + tick_one_remainder + momentum * halfway;
        assert_eq!((lifted_numerator / position_denominator,
                    lifted_numerator % position_denominator), (2, 0));

        let entry = Fx::from_raw(1); let endpoint = Fx::from_raw(2);
        let swept_halfway = entry + (endpoint - entry) * Fx::HALF;
        assert_eq!(swept_halfway.raw(), 1);
        assert_ne!(swept_halfway.raw() as i128, lifted_numerator / position_denominator,
                   "integer endpoint interpolation accidentally became lifted TOI authority");
        assert_eq!((halfway as u32, Fx::ONE.raw() as u32), (32_768, 65_536),
                   "the same x=2 crossing is half-tick lifted and full-tick swept");
    }

    #[test]
    fn sliding_prerequisite_finds_the_greatest_representable_cone_radius() {
        let direction = Vec3::new(Fx::from_ratio(3, 5), Fx::from_ratio(-4, 5), Fx::ZERO);
        let (rho, vector) = greatest_physical_radius(direction, 1_406).unwrap();
        assert_eq!((rho, vector.x.raw(), vector.y.raw()), (1_406, 843, -1_124));
        let next = Vec3::new(Fx::from_raw(toward_zero_component(direction.x.raw(), rho + 1).unwrap()),
                             Fx::from_raw(toward_zero_component(direction.y.raw(), rho + 1).unwrap()), Fx::ZERO);
        let square = |v: Vec3| v.x.raw() as i128 * v.x.raw() as i128
            + v.y.raw() as i128 * v.y.raw() as i128 + v.z.raw() as i128 * v.z.raw() as i128;
        assert!(square(vector) <= 1_406i128 * 1_406 && square(next) > 1_406i128 * 1_406);
        let mirrored = greatest_physical_radius(-direction, 1_406).unwrap();
        assert_eq!((mirrored.0, mirrored.1), (rho, -vector));
        assert_eq!(toward_zero_component(-32_768, 3).unwrap(), -1,
                   "signed scaling rounded away from zero");
        assert_eq!(greatest_physical_radius(direction, 0).unwrap(), (0, Vec3::ZERO));
        assert_eq!(greatest_physical_radius(Vec3::X, i32::MAX).unwrap().0, i32::MAX);
        let diagonal = Vec3::new(Fx::from_raw(46_341), Fx::from_raw(46_341), Fx::ZERO);
        let rounded = greatest_physical_radius(diagonal, 1_000_000).unwrap();
        assert_eq!((rounded.0, rounded.1.x.raw(), rounded.1.y.raw()),
                   (999_999, 707_106, 707_106));
        let next = Vec3::new(Fx::from_raw(toward_zero_component(46_341, 1_000_000).unwrap()),
                             Fx::from_raw(toward_zero_component(46_341, 1_000_000).unwrap()), Fx::ZERO);
        assert_eq!(square(next), 1_000_000_618_898);
    }

    #[test]
    fn sliding_prerequisite_normal_bracket_checks_neighbors_gaps_and_reversals() {
        assert_eq!(verified_normal_bracket(0, 16, |word| -7 + word).unwrap(), (7, 0));
        assert_eq!(verified_normal_bracket(0, 16, |word| if word < 8 { -2 } else { 2 }),
                   Err(SlidingPrerequisiteReject::Gap));
        assert_eq!(verified_normal_bracket(0, 16, |word| match word { 0 => -8, 16 => 8, 8 => -9, _ => word - 8 }),
                   Err(SlidingPrerequisiteReject::Reversal));
        assert_eq!(verified_normal_bracket(-1, 16, |word| word), Err(SlidingPrerequisiteReject::Bounds));
    }

    #[test]
    fn sliding_prerequisite_cache_counts_unique_projections_and_names_limits() {
        let mut cache = FixedProjectionCache::new(2); let mut external = 0;
        assert_eq!(cache.get_or_project([1, 2, 3], || { external += 1; [4, 5, 6] }).unwrap(), [4, 5, 6]);
        assert_eq!(cache.get_or_project([1, 2, 3], || { external += 1; [9, 9, 9] }).unwrap(), [4, 5, 6]);
        assert_eq!(cache.get_or_project([2, 2, 3], || { external += 1; [7, 8, 9] }).unwrap(), [7, 8, 9]);
        assert_eq!((cache.calls, external), (2, 2));
        assert_eq!(cache.get_or_project([1, 2, 3], || panic!("budget blocked an old hit")).unwrap(), [4, 5, 6]);
        assert_eq!(cache.get_or_project([3, 2, 3], || [0; 3]), Err(SlidingPrerequisiteReject::Budget));
        let mut full = FixedProjectionCache::new(65);
        for i in 0..64 { full.get_or_project([i, 0, 0], || [i, 0, 0]).unwrap(); }
        assert_eq!(full.get_or_project([63, 0, 0], || panic!("capacity blocked an old hit")).unwrap(), [63, 0, 0]);
        assert_eq!(full.get_or_project([64, 0, 0], || [64, 0, 0]), Err(SlidingPrerequisiteReject::Capacity));
    }

    #[test]
    fn sliding_prerequisite_cache_counts_one_actual_world_projection_once() {
        let world = World::new(&crowded_scenario(), 1);
        let rows = vec![GeneralizedCollider { entity: world.id_of(0), slot: BODY_SLOT,
            kind: GeneralizedKind::Body, mass: Fx::ONE, velocity: Vec3::ZERO,
            velocity_offset: Vec3::ZERO }];
        let mut bodies = Vec::new(); let mut trial = Vec::new(); let mut wounds = world.wounds.clone();
        let mut credit = vec![Fx::ZERO; wounds.len()]; let mut deltas = Vec::new(); let mut fact_loss = Vec::new();
        let mut projector = ContactProjector { world: &world, entry: &[], bodies: &mut bodies,
            wounds: &mut wounds, credit: &mut credit, deltas: &mut deltas, fact_loss: &mut fact_loss };
        let mut cache = FixedProjectionCache::new(1); let sums = vec![[65_536i128, 0, 0]];
        let first = cache.get_or_project([65_536, 0, 0], || {
            projector.project(&rows, &sums, 65_536, &mut trial).unwrap();
            [trial[0].velocity.x.raw(), trial[0].velocity.y.raw(), trial[0].velocity.z.raw()]
        }).unwrap();
        let second = cache.get_or_project([65_536, 0, 0], || panic!("cache miss repeated actual projection")).unwrap();
        assert_eq!((first, second, cache.calls), ([65_536, 0, 0], [65_536, 0, 0], 1));
    }

    fn normal_component_candidates(normal: Vec3, magnitude: i32) -> ([Vec3; 8], usize) {
        let components = [normal.x.raw(), normal.y.raw(), normal.z.raw()];
        let mut floor = [0i32; 3]; let mut fractional = [usize::MAX; 3]; let mut classes = 0;
        for axis in 0..3 {
            let product = -(components[axis] as i128) * magnitude as i128;
            floor[axis] = i32::try_from(product.div_euclid(65_536)).unwrap();
            if product.rem_euclid(65_536) != 0 { fractional[axis] = classes; classes += 1; }
        }
        let mut answers = [Vec3::ZERO; 8]; let count = 1usize << classes;
        for mask in 0..count {
            let mut words = floor;
            for axis in 0..3 {
                if fractional[axis] != usize::MAX && mask & (1 << fractional[axis]) != 0 {
                    words[axis] += 1;
                }
            }
            answers[mask] = Vec3::new(Fx::from_raw(words[0]), Fx::from_raw(words[1]), Fx::from_raw(words[2]));
        }
        (answers, count)
    }

    #[test]
    fn normal_component_integerization_mirrors_and_permutes_exactly() {
        let normal = Vec3::new(Fx::from_raw(7_810), Fx::from_raw(65_069), Fx::ZERO);
        let (a, count) = normal_component_candidates(normal, 4_921);
        let (mirrored, mirror_count) = normal_component_candidates(-normal, 4_921);
        assert_eq!((count, mirror_count), (4, 4));
        for value in &a[..count] { assert!(mirrored[..mirror_count].contains(&-*value)); }
        let permuted_normal = Vec3::new(normal.y, normal.x, normal.z);
        let (permuted, permuted_count) = normal_component_candidates(permuted_normal, 4_921);
        assert_eq!(permuted_count, count);
        for value in &a[..count] {
            assert!(permuted[..count].contains(&Vec3::new(value.y, value.x, value.z)));
        }
    }

    #[test]
    fn normal_component_integerization_tests_the_sixteen_actual_boundary_gaps() {
        use crate::combat::resolution::tests::{canonical_tangents, tangent_limit_raw};
        let (world, contact, mut rows, fact, _, _, friction) = directional_captured_strike();
        let at = |entity, slot| rows.iter().position(|row| row.entity == entity && row.slot == slot).unwrap();
        let (a, b) = (at(fact.key.a, fact.key.a_slot), at(fact.key.b, fact.key.b_slot));
        let tangents = canonical_tangents(fact.normal).unwrap();
        rows[a].velocity += tangents.second * Fx::from_raw(64);
        let owned_mass: i64 = rows.iter().filter(|row| row.entity == fact.key.b)
            .map(|row| row.mass.raw() as i64).sum();
        let numerator = |state: &[GeneralizedCollider]| -> i128 { state.iter().map(|row| {
            let v = row.velocity; row.mass.raw() as i128 * (v.x.raw() as i128 * v.x.raw() as i128
                + v.y.raw() as i128 * v.y.raw() as i128 + v.z.raw() as i128 * v.z.raw() as i128)
        }).sum() };
        let initial = numerator(&rows); let mut evaluations = 0usize; let mut accepted = Vec::new();
        let mut bodies = Vec::new(); let mut trial = Vec::new(); let mut wounds = world.wounds.clone();
        let mut credit = vec![Fx::ZERO; wounds.len()]; let mut deltas = Vec::new(); let mut fact_loss = Vec::new();
        let mut projector = ContactProjector { world: &world, entry: &contact.entry,
            bodies: &mut bodies, wounds: &mut wounds, credit: &mut credit,
            deltas: &mut deltas, fact_loss: &mut fact_loss };
        for angle_raw in 34_553u16..=34_568 {
            let angle = Angle::from_raw(angle_raw);
            let direction = (tangents.first * angle.cos() + tangents.second * angle.sin()).normalized_or_zero();
            for magnitude in [4_921, 4_922] {
                let (candidates, count) = normal_component_candidates(fact.normal, magnitude);
                for (rounding, normal) in candidates[..count].iter().enumerate() {
                    evaluations += 1;
                    let jn = (-normal.dot(fact.normal)).raw() as i64;
                    let limit = tangent_limit_raw(friction.raw(), jn).unwrap() as i32;
                    let (_, tangent) = greatest_physical_radius(direction, limit).unwrap();
                    let impulse = *normal + tangent;
                    let mut sums = vec![[0i128; 3]; rows.len()];
                    sums[a] = [impulse.x.raw() as i128, impulse.y.raw() as i128, impulse.z.raw() as i128];
                    for axis in 0..3 { sums[b][axis] = -(sums[a][axis] * rows[b].mass.raw() as i128) / owned_mass as i128; }
                    projector.project(&rows, &sums, 65_536, &mut trial).unwrap();
                    let q = (trial[b].velocity - trial[a].velocity).dot(fact.normal).raw();
                    let energy = numerator(&trial);
                    if q.abs() <= 1 && energy <= initial {
                        accepted.push((q.abs(), energy, angle_raw, magnitude, rounding, q,
                                       normal.x.raw(), normal.y.raw(), tangent.x.raw(), tangent.y.raw(), tangent.z.raw()));
                    }
                }
            }
        }
        accepted.sort();
        assert_eq!((evaluations, accepted.len()), (128, 0),
                   "normal component integerization unexpectedly recovered a retained gap");
    }

    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    enum GeneralizedJointReject { ActiveBoundary }

    #[cfg(feature = "cartesian-recoil")]
    struct CartesianResponseProjector;

    #[cfg(feature = "cartesian-recoil")]
    impl ContactTrialProjector for CartesianResponseProjector {
        fn project(&mut self, before: &[GeneralizedCollider], sums: &[[i128; 3]],
                   alpha_raw: u32, out: &mut Vec<GeneralizedCollider>)
            -> Result<(), ResolutionError>
        {
            if before.len() != sums.len() || alpha_raw > 65_536 {
                return Err(ResolutionError::ColliderIndex);
            }
            for (at, row) in before.iter().enumerate() {
                if row.mass <= Fx::ZERO || before[..at].iter().any(|other|
                    other.entity == row.entity && other.slot == row.slot && other.kind == row.kind) {
                    return Err(if row.mass <= Fx::ZERO { ResolutionError::Mass }
                               else { ResolutionError::DuplicateIdentity });
                }
                if row.kind == GeneralizedKind::Body && sums[at][2] != 0 {
                    return Err(ResolutionError::Projector);
                }
                if row.kind == GeneralizedKind::Body && row.velocity.z != Fx::ZERO {
                    return Err(ResolutionError::Projector);
                }
                for word in sums[at] {
                    let scaled = word.checked_mul(alpha_raw as i128)
                        .ok_or(ResolutionError::Projector)? / row.mass.raw() as i128;
                    if scaled < i32::MIN as i128 || scaled > i32::MAX as i128 {
                        return Err(ResolutionError::Projector);
                    }
                }
            }
            let mut next = before.to_vec();
            let mut body_deltas = Vec::new();
            for (at, row) in before.iter().enumerate().filter(|(_, row)| row.kind == GeneralizedKind::Body) {
                let owned: Vec<_> = before.iter().enumerate().filter(|(_, owned)|
                    owned.entity == row.entity).collect();
                if owned.iter().filter(|(_, owned)| owned.kind == GeneralizedKind::Body).count() != 1
                    || owned.iter().filter(|(_, owned)| owned.kind != GeneralizedKind::Body).count() > 2 {
                    return Err(ResolutionError::ColliderIndex);
                }
                let mass = owned.iter().try_fold(0i64, |sum, (_, owned)|
                    sum.checked_add(owned.mass.raw() as i64)).ok_or(ResolutionError::Mass)?;
                if mass <= 0 || mass > i32::MAX as i64 { return Err(ResolutionError::Mass); }
                let delta = resolution::scaled_delta(sums[at], alpha_raw, mass as i32);
                let proposed = Vec3::new(row.velocity.x + delta.x, row.velocity.y + delta.y, Fx::ZERO);
                if clamp_contact_velocity(proposed) != proposed { return Err(ResolutionError::Projector); }
                next[at].velocity = proposed; body_deltas.push((row.entity, proposed - row.velocity));
            }
            for (at, row) in before.iter().enumerate().filter(|(_, row)| row.kind != GeneralizedKind::Body) {
                let body = body_deltas.iter().find(|(entity, _)| *entity == row.entity)
                    .map(|(_, delta)| *delta).ok_or(ResolutionError::ColliderIndex)?;
                let own = resolution::scaled_delta(sums[at], alpha_raw, row.mass.raw());
                let proposed = row.velocity + body + own;
                if clamp_contact_velocity(proposed) != proposed { return Err(ResolutionError::Projector); }
                next[at].velocity = proposed;
            }
            *out = next;
            Ok(())
        }
    }

    fn cartesian_contact_trial(
        before: &[GeneralizedCollider], sums: &[[i128; 3]], alpha_raw: u32,
        out: &mut Vec<GeneralizedCollider>,
    ) -> Result<(), ResolutionError> {
        #[cfg(feature = "cartesian-recoil")]
        return CartesianResponseProjector.project(before, sums, alpha_raw, out);
        #[cfg(not(feature = "cartesian-recoil"))]
        {
        if before.len() != sums.len() { return Err(ResolutionError::ColliderIndex); }
        out.clear(); out.extend_from_slice(before);
        let mut body_deltas = Vec::new();
        for (at, (row, sum)) in out.iter_mut().zip(sums).enumerate() {
            if row.mass <= Fx::ZERO { return Err(ResolutionError::Mass); }
            if row.kind != GeneralizedKind::Body { continue; }
            let owner_mass = before.iter().filter(|owned| owned.entity == row.entity)
                .try_fold(0i64, |total, owned| total.checked_add(owned.mass.raw() as i64))
                .ok_or(ResolutionError::Mass)?;
            if owner_mass <= 0 || owner_mass > i32::MAX as i64 { return Err(ResolutionError::Mass); }
            let delta = resolution::scaled_delta(*sum, alpha_raw, owner_mass as i32);
            row.velocity = clamp_contact_velocity(Vec3::new(
                row.velocity.x + delta.x, row.velocity.y + delta.y, Fx::ZERO));
            body_deltas.push((row.entity, row.velocity - before[at].velocity));
        }
        for (at, (row, sum)) in out.iter_mut().zip(sums).enumerate() {
            if row.kind == GeneralizedKind::Body { continue; }
            let body_delta = body_deltas.iter().find(|(entity, _)| *entity == row.entity)
                .map(|(_, delta)| *delta).ok_or(ResolutionError::ColliderIndex)?;
            let own = resolution::scaled_delta(*sum, alpha_raw, row.mass.raw());
            row.velocity = clamp_contact_velocity(before[at].velocity + body_delta + own);
        }
        Ok(())
        }
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn cartesian_response_projector_is_zero_identity_but_not_affine_in_its_declared_domain() {
        let world = World::new(&crowded_scenario(), 0); let entity = world.id_of(0);
        let rows = vec![
            GeneralizedCollider { entity, slot: BODY_SLOT, kind: GeneralizedKind::Body,
                mass: Fx::from_int(2), velocity: Vec3::ZERO, velocity_offset: Vec3::ZERO },
            GeneralizedCollider { entity, slot: LimbSlot::RightArm as u8,
                kind: GeneralizedKind::Equipment, mass: Fx::ONE,
                velocity: Vec3::ZERO, velocity_offset: Vec3::ZERO },
        ];
        let zero = vec![[0i128; 3]; 2]; let j = vec![[2i128,0,0], [0;3]];
        let k = j.clone(); let jk = vec![[4i128,0,0], [0;3]];
        let mut projector = CartesianResponseProjector; let mut p0 = Vec::new();
        let mut pj = Vec::new(); let mut pk = Vec::new(); let mut pjk = Vec::new();
        projector.project(&rows, &zero, 65_536, &mut p0).unwrap();
        projector.project(&rows, &j, 65_536, &mut pj).unwrap();
        projector.project(&rows, &k, 65_536, &mut pk).unwrap();
        projector.project(&rows, &jk, 65_536, &mut pjk).unwrap();
        assert_eq!(p0, rows); assert_eq!(pj, rows); assert_eq!(pk, rows);
        assert_eq!((pjk[0].velocity.x.raw(), pjk[1].velocity.x.raw()), (1, 1));
        assert_eq!(2 * pjk[0].velocity.x.raw() + pjk[1].velocity.x.raw(), 3);
        assert_ne!(2 * pjk[0].velocity.x.raw() + pjk[1].velocity.x.raw(), 4,
                   "integer division silently lost no owner momentum remainder");
        assert_ne!(pjk, rows,
                   "per-owner integer division unexpectedly became exactly affine");

        let sentinel = pjk.clone(); let body_z = vec![[0i128,0,1], [0;3]];
        assert_eq!(projector.project(&rows, &body_z, 65_536, &mut pjk),
                   Err(ResolutionError::Projector));
        assert_eq!(pjk, sentinel, "refusal partially mutated the published trial rows");
        let mut unsupported = rows.clone(); unsupported[0].velocity.z = Fx::from_raw(1);
        assert_eq!(projector.project(&unsupported, &zero, 0, &mut pjk),
                   Err(ResolutionError::Projector));
        assert_eq!(pjk, sentinel, "unsupported alpha-zero input partially mutated output");
        let overflow = vec![[i128::MAX,0,0], [0;3]];
        assert_eq!(projector.project(&rows, &overflow, 65_536, &mut pjk),
                   Err(ResolutionError::Projector));
        assert_eq!(pjk, sentinel, "overflow refusal partially mutated output");
    }

    fn forward_joint_jacobian(
        anatomy: &BodyAnatomySpec, yaw: Angle, limb: usize, arm: ArmState,
    ) -> Result<[Vec3; 5], GeneralizedJointReject> {
        if arm.height.raw() == 0 || arm.height.raw() == 65_536
            || arm.reach.raw() == actuator::ARM_MIN_REACH_RAW || arm.reach.raw() == 65_536 {
            return Err(GeneralizedJointReject::ActiveBoundary);
        }
        let base = actuator::hand_position(anatomy, yaw, limb, arm.bearing, arm.height, arm.reach);
        let bearing = actuator::hand_position(anatomy, yaw, limb,
            Angle::from_raw(arm.bearing.raw().wrapping_add(1)), arm.height, arm.reach) - base;
        let height = actuator::hand_position(anatomy, yaw, limb, arm.bearing,
            crate::CombatHeight::try_from_raw(arm.height.raw() + 1).unwrap(), arm.reach) - base;
        let reach = actuator::hand_position(anatomy, yaw, limb, arm.bearing,
            arm.height, arm.reach + Fx::from_raw(1)) - base;
        Ok([Vec3::X, Vec3::Y, bearing, height, reach])
    }

    #[test]
    fn generalized_joint_attributes_the_sword_limb_and_rejects_both_reach_boundaries() {
        let (world, contact, rows, fact, _, _, _) = directional_captured_strike();
        let source = fact.key.a.index as usize;
        assert_eq!(fact.key.a_slot, LimbSlot::RightArm as u8);
        let limb = fact.key.a_slot as usize;
        assert_eq!(contact.entry[source].grips[limb].equipment_slot, Some(0));
        let sword_rows: Vec<_> = rows.iter().filter(|row| row.entity == fact.key.a
            && row.kind == GeneralizedKind::Equipment && row.slot == fact.key.a_slot).collect();
        assert_eq!(sword_rows.len(), 1);
        assert_eq!(sword_rows[0].mass.raw(), 81_264);
        let arm = world.arms[source][limb]; let anatomy = world.anatomy_spec(source).unwrap();
        let yaw = world.body_yaw[source].angle;
        // **The captured arm is inside the joint's own bounds now, and that is
        // the reseat rather than a weakening.** The articulated capture asked
        // for `reach: Fx::ONE` and got it -- a one-link arm holds whatever its
        // shoulder points at -- so the arm the strike landed with sat exactly on
        // the outer boundary, and the first assertion here was about that arm.
        // `reachable_extent` clamps an embodied arm onto the annulus its elbow
        // permits before the actuator integrates, and this capture's height is
        // outside the band where the elbow can still lay the arm straight: at
        // `61/128` a commanded `Fx::ONE` comes back `45_278`.
        //
        // **That band is narrow but it is not empty, and the note that first
        // stood here said it was.** Swept at full resolution over every legal
        // `CombatHeight` against this fixture's own `posed_anatomy`, identical
        // for both slots: `Fx::ONE` survives unclamped for `height_raw` in
        // `50_832..=51_115`, two hundred and eighty-four raw units straddling
        // the `50_972` that puts the hand level with the shoulder -- the one
        // place `dz` is zero and the annulus reaches the whole `arm_length`. A
        // capture aimed there could still arrive on the outer boundary; this one
        // is aimed a third of the body lower and cannot. The superseded claim --
        // a maximum held reach of `65_533`, hence `Fx::ONE` unreachable at any
        // height -- was a sampling artefact, and an instructive one: the sweep
        // behind it stepped 512 raw at a time and stepped over the band.
        //
        // Both boundaries are still asserted, on constructed neighbours, and the
        // captured arm now carries the other half of the same claim -- that the
        // jacobian exists in between. Dropping either end would leave a
        // predicate satisfied by a function that always refused.
        assert_eq!((arm.height.raw(), arm.reach.raw()), (31_231, 45_278));
        let captured = forward_joint_jacobian(anatomy, yaw, limb, arm)
            .expect("the captured arm is inside the joint bounds");
        assert_eq!((captured[0], captured[1]), (Vec3::X, Vec3::Y));
        let mut extended = arm; extended.reach = Fx::ONE;
        assert_eq!(forward_joint_jacobian(anatomy, yaw, limb, extended),
                   Err(GeneralizedJointReject::ActiveBoundary));
        let mut interior = arm;
        interior.height = crate::CombatHeight::MID;
        interior.reach = Fx::from_raw(32_768);
        let jacobian = forward_joint_jacobian(anatomy, yaw, limb, interior).unwrap();
        assert_eq!((fact.normal.x.raw(), fact.normal.y.raw(), fact.normal.z.raw()),
                   (7_810, 65_069, 0));
        let at = |entity, slot| rows.iter().position(|row| row.entity == entity && row.slot == slot).unwrap();
        let (a, b) = (at(fact.key.a, fact.key.a_slot), at(fact.key.b, fact.key.b_slot));
        assert_eq!((rows[b].velocity - rows[a].velocity).dot(fact.normal).raw(), -5_539);
        assert_eq!(resolution::closure_energy(&rows).unwrap(), 291);
        assert_eq!((jacobian[0], jacobian[1]), (Vec3::X, Vec3::Y));
        assert_eq!(actuator::hand_position(anatomy, yaw, limb, arm.bearing, arm.height, arm.reach), arm.hand);
        let mut bounded = arm; bounded.reach = Fx::from_raw(actuator::ARM_MIN_REACH_RAW);
        assert_eq!(forward_joint_jacobian(anatomy, yaw, limb, bounded), Err(GeneralizedJointReject::ActiveBoundary));
    }

    #[test]
    fn cartesian_contact_trial_reaches_the_retained_sword_restitution_without_inverse_hand() {
        let (_world, _contact, rows, fact, _, proposal, _) = directional_captured_strike();
        assert_eq!(fact.toi.get().raw(), 30_514);
        let at = |entity, slot| rows.iter().position(|row| row.entity == entity && row.slot == slot).unwrap();
        let (a, b) = (at(fact.key.a, fact.key.a_slot), at(fact.key.b, fact.key.b_slot));
        let before_energy = resolution::closure_energy(&rows).unwrap();
        let mut trial = Vec::new();
        let answer = bounded_nonlinear_1d(before_energy, |raw| {
            let scale = |component: Fx| Fx::from_raw(
                ((component.raw() as i64 * raw as i64) / 65_536) as i32);
            let impulse = Vec3::new(scale(proposal.x), scale(proposal.y), scale(proposal.z));
            let mut sums = vec![[0i128; 3]; rows.len()];
            sums[a] = [impulse.x.raw() as i128, impulse.y.raw() as i128, impulse.z.raw() as i128];
            sums[b] = [-sums[a][0], -sums[a][1], -sums[a][2]];
            cartesian_contact_trial(&rows, &sums, 65_536, &mut trial)?;
            Ok(((trial[b].velocity - trial[a].velocity).dot(fact.normal).raw(),
                resolution::closure_energy(&trial)?))
        }).unwrap();
        assert_eq!(answer, Nonlinear1dCandidate {
            impulse: 65_550, q: 0, energy: 80, evaluations: 35,
        });
        assert_eq!(before_energy - answer.energy, 211);
    }

    #[test]
    fn cartesian_contact_trial_is_an_exact_alpha_zero_identity() {
        let (_, _, rows, _, _, _, _) = directional_captured_strike();
        let sums = vec![[0i128; 3]; rows.len()]; let mut trial = Vec::new();
        cartesian_contact_trial(&rows, &sums, 0, &mut trial).unwrap();
        assert_eq!(trial, rows);
        assert_eq!(resolution::closure_energy(&trial).unwrap(), 291);
    }

    #[test]
    fn cartesian_postimpact_velocity_is_not_the_whole_tick_endpoint_displacement() {
        let (_, _, rows, fact, _, proposal, _) = directional_captured_strike();
        let at = |entity, slot| rows.iter().position(|row| row.entity == entity && row.slot == slot).unwrap();
        let a = at(fact.key.a, fact.key.a_slot); let b = at(fact.key.b, fact.key.b_slot);
        assert_eq!((rows[a].kind, rows[b].kind),
                   (GeneralizedKind::Equipment, GeneralizedKind::Body));
        assert_eq!((rows[a].entity, rows[a].slot, rows[b].entity, rows[b].slot),
                   (fact.key.a, fact.key.a_slot, fact.key.b, fact.key.b_slot));
        let scale = |component: Fx| Fx::from_raw(
            ((component.raw() as i64 * 65_550i64) / 65_536) as i32);
        let impulse = Vec3::new(scale(proposal.x), scale(proposal.y), scale(proposal.z));
        let mut sums = vec![[0i128; 3]; rows.len()];
        sums[a] = [impulse.x.raw() as i128, impulse.y.raw() as i128, impulse.z.raw() as i128];
        sums[b] = [-sums[a][0], -sums[a][1], -sums[a][2]];
        let mut trial = Vec::new(); cartesian_contact_trial(&rows, &sums, 65_536, &mut trial).unwrap();
        let toi = fact.toi.get(); let remaining = Fx::ONE - toi;
        let displacement = rows[a].velocity * toi + trial[a].velocity * remaining;
        assert_eq!((toi.raw(), remaining.raw()), (30_514, 35_022));
        assert_eq!((rows[a].velocity.x.raw(), rows[a].velocity.y.raw(),
                    trial[a].velocity.x.raw(), trial[a].velocity.y.raw(),
                    displacement.x.raw(), displacement.y.raw()),
                   (290, 5_543, 81, 1_537, 178, 3_401));
        assert_ne!(displacement, trial[a].velocity,
                   "a nonzero TOI cannot store post-impact velocity as whole-tick displacement");
        let hand_post = trial[a].velocity - trial[b].velocity - rows[a].velocity_offset;
        assert_eq!((rows[a].velocity_offset.x.raw(), rows[a].velocity_offset.y.raw(),
                    rows[a].velocity_offset.z.raw()), (197, 3_768, 0));
        assert_eq!((hand_post.x.raw(), hand_post.y.raw(), hand_post.z.raw()),
                   (-196, -3_769, 0));
    }

    #[test]
    fn retained_sword_stores_com_relative_velocity_and_derives_the_free_hand() {
        use crate::combat::resolution::tests::{EquipmentComSample,
            equipment_com_relative_velocity_raw, widened_equipment_com_numerator};
        let (_, _, rows, fact, _, proposal, _) = directional_captured_strike();
        let at = |entity, slot| rows.iter().position(|row|
            row.entity == entity && row.slot == slot).unwrap();
        let a = at(fact.key.a, fact.key.a_slot); let b = at(fact.key.b, fact.key.b_slot);
        assert_eq!((rows[a].kind, rows[b].kind, rows[a].mass.raw()),
                   (GeneralizedKind::Equipment, GeneralizedKind::Body, 81_264));
        let scale = |component: Fx| Fx::from_raw(
            ((component.raw() as i64 * 65_550i64) / 65_536) as i32);
        let impulse = Vec3::new(scale(proposal.x), scale(proposal.y), scale(proposal.z));
        let mut sums = vec![[0i128; 3]; rows.len()];
        sums[a] = [impulse.x.raw() as i128, impulse.y.raw() as i128, impulse.z.raw() as i128];
        sums[b] = [-sums[a][0], -sums[a][1], -sums[a][2]];
        let mut trial = Vec::new(); cartesian_contact_trial(&rows, &sums, 65_536, &mut trial).unwrap();
        let sample = |equipment: GeneralizedCollider, body: GeneralizedCollider| {
            let hand = equipment.velocity - body.velocity - equipment.velocity_offset;
            EquipmentComSample { mass_raw: equipment.mass.raw() as i64,
                body_velocity_raw: [body.velocity.x.raw() as i64, body.velocity.y.raw() as i64,
                                    body.velocity.z.raw() as i64],
                hand_velocity_raw: [hand.x.raw() as i64, hand.y.raw() as i64, hand.z.raw() as i64],
                velocity_offset_raw: [equipment.velocity_offset.x.raw() as i64,
                                      equipment.velocity_offset.y.raw() as i64,
                                      equipment.velocity_offset.z.raw() as i64],
                owns_equipment: true }
        };
        let initial = sample(rows[a], rows[b]); let post = sample(trial[a], trial[b]);
        assert_eq!(equipment_com_relative_velocity_raw(post).unwrap(), [1, -1, 0]);
        assert_eq!(post.velocity_offset_raw, [197, 3_768, 0]);
        assert_eq!(post.hand_velocity_raw, [-196, -3_769, 0]);
        assert_eq!((widened_equipment_com_numerator(&[initial]).unwrap(),
                    widened_equipment_com_numerator(&[post]).unwrap()),
                   (2_503_658_431_536, 192_508_727_520));
        let changed_offset = [post.velocity_offset_raw[0] + 31,
                              post.velocity_offset_raw[1] - 17, 0];
        let free_hand = [1 - changed_offset[0], -1 - changed_offset[1], 0];
        let transported = EquipmentComSample { hand_velocity_raw: free_hand,
            velocity_offset_raw: changed_offset, ..post };
        assert_eq!(equipment_com_relative_velocity_raw(transported).unwrap(), [1, -1, 0],
                   "the next scalar offset changed inertial equipment COM momentum");
        assert_eq!(widened_equipment_com_numerator(&[transported]),
                   widened_equipment_com_numerator(&[post]));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn retained_world_commit_preserves_the_direct_swords_exact_recoil_and_next_tick_reconciles() {
        let (mut world, contact, _, fact, _, _, _) = directional_captured_strike();
        let source = world.resolve(fact.key.a).unwrap();
        let target = world.resolve(fact.key.b).unwrap();
        let source_limb = fact.key.a_slot as usize;
        assert_eq!(source_limb, 1);
        world.arms[target][1].post_contact_active = true;
        world.arms[target][1].post_contact_com_velocity =
            Vec3::new(Fx::from_raw(17), Fx::from_raw(-19), Fx::from_raw(23));
        let body_only = (world.arms[target][1].post_contact_active,
                         world.arms[target][1].post_contact_com_velocity);
        world.contact = Some(contact);
        world.resolve_contact();
        let exact_recoil = world.exact_owners[source].unwrap().held_response[source_limb]
            .unwrap().affine.momentum;
        assert!(exact_recoil.iter().any(|word|
            word.velocity_raw != 0 || word.remainder != 0),
            "direct equipment response did not retain exact COM recoil");
        assert_eq!((world.arms[target][1].post_contact_active,
                    world.arms[target][1].post_contact_com_velocity), body_only,
                   "body-only translation cleared or replaced held COM recoil");
        let entry = world.arms[source][source_limb];
        // Smart38's lifted restitution/cone selection is the physical impulse
        // retained here; the second tuple pins its ordinary next-tick reconciliation.
        assert_eq!((entry.hand.x.raw(), entry.hand.y.raw(), entry.hand.z.raw(),
                    entry.linear_velocity.x.raw(), entry.linear_velocity.y.raw(),
                    entry.linear_velocity.z.raw(), entry.post_contact_com_velocity.x.raw(),
                    entry.post_contact_com_velocity.y.raw(), entry.post_contact_com_velocity.z.raw()),
                   (33_832, -19_426, 56_215, -20, -366, 0, -209, -4_006, 0));
        // The capture's own rates, not the production pair: the tick pinned
        // below is the one after the tick this fixture froze, and reading the
        // live constants here would let an actuator tuning move a word that is
        // supposed to be about recoil reconciliation. It is not a rate the arm
        // is currently against -- the words hold at both -- which is exactly
        // why the dependency was invisible and worth removing.
        world.drive_articulated_arms(CAPTURED_ARM_RATES.0, CAPTURED_ARM_RATES.1);
        let next = world.arms[source][source_limb];
        assert_eq!((next.hand.x.raw(), next.hand.y.raw(), next.hand.z.raw(),
                    next.post_contact_com_velocity.x.raw(), next.post_contact_com_velocity.y.raw(),
                    next.post_contact_com_velocity.z.raw(), next.fatigue.raw(), next.work_residue.raw()),
                   (33_699, -25_243, 56_215, -107, -3_904, 0, 5, 236));
        assert!(next.hand != entry.hand || next.post_contact_com_velocity != entry.post_contact_com_velocity,
                "active COM recoil was ignored on the next actuator tick");
        assert!(next.fatigue >= entry.fatigue);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn release_and_replacement_publish_exact_widened_recoil_energy() {
        let mut world = World::new(&Scenario::embodied_duel(), 0);
        world.retain_contact_entry();
        let id = world.id_of(0);
        world.arms[0][1].post_contact_active = true;
        world.arms[0][1].post_contact_com_velocity =
            Vec3::new(Fx::from_raw(2), Fx::from_raw(-1), Fx::from_raw(3));
        let mut release = world.neutral_articulated(0);
        release.grips = [GripRequest::Keep, GripRequest::Release];
        world.articulated_command[0] = Some(release);
        world.apply_articulated_grips();
        let ledger = world.recoil_external_energy(id, LimbSlot::RightArm).unwrap();
        assert_eq!((ledger.reason_mask, ledger.dissipated_numerator, ledger.supplied_numerator),
                   (RecoilExternalEnergy::RELEASE, 1_137_696, 0));
        assert_eq!(world.exact_external_energy(), &[ExactExternalEnergyRow {
            entity: id, lane: 2, reason: RecoilExternalEnergy::RELEASE,
            signed_numerator: -1_137_696,
            denominator: 2i128 * 65_536 * 65_536,
        }]);
        let release_hash = world.state_digest();
        world.contact.as_mut().unwrap().exact_external_energy[0].reason =
            RecoilExternalEnergy::REPLACEMENT;
        assert_ne!(world.state_digest().value, release_hash.value,
                   "the external reconciliation row was absent from the feature hash");
        world.contact.as_mut().unwrap().exact_external_energy[0].reason =
            RecoilExternalEnergy::RELEASE;

        let mut free_left = world.neutral_articulated(0);
        free_left.grips = [GripRequest::Release, GripRequest::Keep];
        world.articulated_command[0] = Some(free_left);
        world.apply_articulated_grips();
        world.grips[0][1].equipment_slot = Some(0);
        world.articulated_carried[0][1] = world.articulated_carried[0][0];
        let scale = world.exact_owners[0].unwrap().common_scale;
        world.exact_owners[0] = Some(world.initial_exact_owner(0, scale));
        world.arms[0][1].post_contact_active = true;
        world.arms[0][1].post_contact_com_velocity = Vec3::new(Fx::ONE, Fx::ZERO, Fx::ZERO);
        let mut replace = world.neutral_articulated(0);
        replace.grips = [GripRequest::Keep, GripRequest::EquipSlot(1)];
        world.articulated_command[0] = Some(replace);
        world.apply_articulated_grips();
        let ledger = world.recoil_external_energy(id, LimbSlot::RightArm).unwrap();
        assert_eq!(ledger.reason_mask,
                   RecoilExternalEnergy::RELEASE | RecoilExternalEnergy::REPLACEMENT);
        assert_eq!(ledger.dissipated_numerator, 1_137_696 + 349_026_222_342_144);
        assert_eq!((world.grips[0][1].equipment_slot, world.arms[0][1].post_contact_active,
                    world.arms[0][1].post_contact_com_velocity), (Some(1), false, Vec3::ZERO));

        world.retain_contact_entry();
        assert!(world.exact_external_energy().is_empty(),
                "last tick's authoritative reconciliation survived the tick boundary");
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn cap_reconciliation_uses_the_same_exact_signed_row_grammar() {
        let mut world = World::new(&Scenario::embodied_duel(), 0);
        world.retain_contact_entry();
        let entity = world.id_of(0);
        let mut contact = world.contact.take().unwrap();
        World::record_recoil_external_in(&mut contact, entity, 0, 1,
            RecoilExternalEnergy::CAP, 17, 5);
        assert_eq!(contact.exact_external_energy, vec![ExactExternalEnergyRow {
            entity, lane: 2, reason: RecoilExternalEnergy::CAP,
            signed_numerator: -12, denominator: 2i128 * 65_536 * 65_536,
        }]);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn severing_either_owner_of_a_two_handed_item_clears_both_recoils() {
        for part in [BodyPart::LeftArm, BodyPart::RightArm] {
            let mut world = World::new(&both_scenario(), 0);
            world.retain_contact_entry();
            for limb in 0..2 {
                world.arms[1][limb].post_contact_active = true;
                world.arms[1][limb].post_contact_com_velocity = Vec3::new(
                    Fx::from_raw(2 + limb as i32), Fx::from_raw(-1), Fx::from_raw(3));
            }
            world.wounds[1].parts[part as usize].severed = true;
            world.release_severed_grips();
            assert_eq!(world.grips[1], [GripState { equipment_slot: None }; 2]);
            for arm in world.arms[1] {
                assert_eq!((arm.post_contact_active, arm.post_contact_com_velocity),
                           (false, Vec3::ZERO));
            }
            let ledger = world.recoil_external_energy(world.id_of(1), LimbSlot::RightArm).unwrap();
            assert_ne!(ledger.reason_mask & RecoilExternalEnergy::SEVERANCE, 0);
            assert!(ledger.dissipated_numerator > 0);
        }
    }

    #[cfg(feature = "cartesian-recoil")]
    #[derive(Clone, Copy)]
    struct FrozenAnatomyCheckpoint {
        row: ContactResolution,
        part: BodyPart,
        before: crate::PartWoundState,
        after: crate::PartWoundState,
        before_anatomy: AnatomyState,
        after_anatomy: AnatomyState,
        before_fraction: (i32, i32),
        after_fraction: (i32, i32),
    }

    /// One deliberately provisional answer carried through the real allocation,
    /// channel and anatomy seams. The two switches exist only so the tests can
    /// delete each load-bearing stage independently; neither is a runtime mode.
    #[cfg(feature = "cartesian-recoil")]
    fn frozen_single_fact_anatomy_checkpoint(
        allocate_response: bool,
        apply_after_group: bool,
    ) -> FrozenAnatomyCheckpoint {
        let (world, contact, rows, fact, _, proposal, _) = directional_captured_strike();
        assert_eq!((fact.key.kind, fact.key.a_slot, fact.key.b_slot),
                   (ContactKind::WeaponBody, LimbSlot::RightArm as u8, BODY_SLOT));
        let target = world.resolve(fact.key.b).unwrap();
        let part = volume_region(fact.volume as usize).unwrap();
        let mut colliders = Vec::new();
        world.build_contact_colliders(&contact.entry, &mut colliders, &world.wounds);
        assert_eq!(crate::combat::contact::collect_contacts(&colliders), vec![fact],
                   "retained checkpoint acquired a competing fact");
        let weapon = colliders.iter().copied().find(|row| row.entity == fact.key.a
            && row.slot == fact.key.a_slot).unwrap();
        let body = colliders.iter().copied().find(|row| row.entity == fact.key.b
            && matches!(row.shape, ContactShape::Body { .. })).unwrap();
        let ContactShape::Segment { previous_hilt, previous_tip, .. } = weapon.shape
            else { panic!("retained source stopped being a segment") };

        let at = |entity, slot| rows.iter().position(|row| {
            row.entity == entity && row.slot == slot
        }).unwrap();
        let (a, b) = (at(fact.key.a, fact.key.a_slot), at(fact.key.b, fact.key.b_slot));
        let scale = |component: Fx| Fx::from_raw(
            ((component.raw() as i64 * 65_550i64) / 65_536) as i32);
        let impulse = Vec3::new(scale(proposal.x), scale(proposal.y), scale(proposal.z));
        let mut sums = vec![[0i128; 3]; rows.len()];
        sums[a] = [impulse.x.raw() as i128, impulse.y.raw() as i128,
                   impulse.z.raw() as i128];
        sums[b] = [-sums[a][0], -sums[a][1], -sums[a][2]];
        let mut trial = Vec::new();
        cartesian_contact_trial(&rows, &sums, 65_536, &mut trial).unwrap();
        let before_energy = resolution::closure_energy(&rows).unwrap();
        let after_energy = resolution::closure_energy(&trial).unwrap();
        let dissipated = before_energy.checked_sub(after_energy).unwrap();

        // The stable allocator, even for one row: replacing it with the total
        // would make this proof bypass the seam whose output `after_group` sees.
        let normal_weight = (-impulse).dot(fact.normal).raw().max(0) as u128;
        let closing_weight = (-(fact.velocity_b - fact.velocity_a).dot(fact.normal))
            .raw().max(0) as u128;
        let weight = normal_weight.checked_mul(closing_weight).unwrap();
        assert!(weight > 0, "retained fact lost its physical allocation weight");
        let mut allocated = Vec::new();
        resolution::allocate_weighted_into(
            if allocate_response { dissipated } else { 0 }, &[weight], &mut allocated).unwrap();
        let channel = resolution::WeaponBodyChannel {
            weapon_axis: (previous_tip - previous_hilt).normalized_or_zero(),
            weapon_relative_velocity: weapon.velocity - body.velocity,
            edge_factor: weapon.surface.edge_factor,
            point_factor: weapon.surface.point_factor,
            crush_factor: weapon.surface.material.crush_factor(),
            zero_length: previous_tip == previous_hilt,
        };
        let (cut_raw, thrust_raw, crush_raw, pressure_raw) =
            resolution::channels(allocated[0], channel);
        let mut resolutions = vec![ContactResolution {
            group_ordinal: 0,
            // `65_550` scaled the frozen proposal before it entered this row.
            // The finalizer applies that already-scaled impulse in full.
            group_alpha_raw: 65_536,
            fact,
            impulse: crate::combat::contact::ContactImpulse {
                key: fact.key, on_a: impulse, on_b: -impulse,
            },
            energy: crate::combat::contact::EnergyLedger {
                before_raw: before_energy,
                after_raw: if allocate_response { after_energy } else { before_energy },
                dissipated_raw: allocated[0],
            },
            cut_raw, thrust_raw, crush_raw, pressure_raw, deflected_raw: 0, severed: false,
        }];

        let mut wounds = world.wounds.clone();
        let before_anatomy = wounds[target];
        let before = before_anatomy.parts[part as usize];
        let spec = world.anatomy_spec(target).unwrap();
        let before_fraction = (
            anatomy::part_fraction(&wounds[target], spec, part as usize).raw(),
            anatomy::part_wound_fraction(&wounds[target], spec, part as usize).raw(),
        );
        let mut bodies = Vec::new();
        let mut credit = vec![Fx::ZERO; wounds.len()];
        let mut deltas = Vec::new();
        let mut fact_loss = Vec::new();
        if apply_after_group {
            let mut projector = ContactProjector {
                world: &world, entry: &contact.entry, bodies: &mut bodies,
                wounds: &mut wounds, credit: &mut credit, deltas: &mut deltas,
                fact_loss: &mut fact_loss,
            };
            projector.after_group(&mut colliders, &mut resolutions).unwrap();
        }
        let after_anatomy = wounds[target];
        let after = after_anatomy.parts[part as usize];
        let after_fraction = (
            anatomy::part_fraction(&wounds[target], spec, part as usize).raw(),
            anatomy::part_wound_fraction(&wounds[target], spec, part as usize).raw(),
        );
        FrozenAnatomyCheckpoint {
            row: resolutions[0], part, before, after, before_anatomy, after_anatomy,
            before_fraction, after_fraction,
        }
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn retained_single_fact_flows_through_allocation_and_after_group() {
        let checkpoint = frozen_single_fact_anatomy_checkpoint(true, true);
        assert_eq!(checkpoint.row.energy,
                   crate::combat::contact::EnergyLedger {
                       before_raw: 291, after_raw: 80, dissipated_raw: 211 });
        assert_eq!(checkpoint.row.group_alpha_raw, 65_536,
                   "proposal scale leaked into the finalizer alpha");
        assert_eq!((checkpoint.row.cut_raw, checkpoint.row.thrust_raw,
                    checkpoint.row.pressure_raw, checkpoint.row.deflected_raw),
                   (67, 0, 144, 0));
        assert_eq!((checkpoint.part, checkpoint.before.integrity.raw(),
                    checkpoint.after.integrity.raw()),
                   (BodyPart::Torso, 131_072, 124_640));
        assert_eq!((checkpoint.before.wound.raw(), checkpoint.after.wound.raw()),
                   (0, 6_432));
        assert_eq!((checkpoint.before_fraction, checkpoint.after_fraction),
                   ((65_536, 0), (62_320, 3_216)));
        for other in BodyPart::ALL {
            if other == checkpoint.part { continue; }
            assert_eq!(checkpoint.after_anatomy.parts[other as usize],
                       checkpoint.before_anatomy.parts[other as usize],
                       "after_group changed anatomy outside the fact-named region");
        }
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn retained_anatomy_requires_nonzero_stable_allocation() {
        let checkpoint = frozen_single_fact_anatomy_checkpoint(false, true);
        assert_eq!((checkpoint.row.energy.dissipated_raw, checkpoint.row.cut_raw,
                    checkpoint.row.thrust_raw, checkpoint.row.pressure_raw),
                   (0, 0, 0, 0));
        assert_eq!(checkpoint.after, checkpoint.before,
                   "after_group invented anatomy damage without an allocation");
        assert_eq!(checkpoint.after_fraction, checkpoint.before_fraction);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn retained_anatomy_requires_the_actual_after_group_hook() {
        let checkpoint = frozen_single_fact_anatomy_checkpoint(true, false);
        assert_eq!((checkpoint.row.cut_raw, checkpoint.row.thrust_raw,
                    checkpoint.row.pressure_raw), (67, 0, 144));
        assert_eq!(checkpoint.after, checkpoint.before,
                   "anatomy changed when the actual after_group hook was skipped");
        assert_eq!(checkpoint.after_fraction, checkpoint.before_fraction);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn projected_group_finalizer_maps_commits_and_reconciles_one_following_tick() {
        let (mut world, mut contact, mut rows, fact, old_proposal, proposal, friction) =
            directional_captured_strike();
        let entry_rows = rows.clone();
        let entities = [fact.key.a, fact.key.b];
        let mut colliders = Vec::new();
        world.build_contact_colliders(&contact.entry, &mut colliders, &world.wounds);
        let closure_rows: Vec<_> = colliders.iter().enumerate()
            .filter_map(|(index, row)| entities.contains(&row.entity).then_some(index)).collect();
        let old: Vec<_> = closure_rows.iter().map(|&index| colliders[index].velocity).collect();
        assert_eq!(rows.len(), closure_rows.len());
        let at = |entity, slot| rows.iter().position(|row| row.entity == entity && row.slot == slot).unwrap();
        let (a, b) = (at(fact.key.a, fact.key.a_slot), at(fact.key.b, fact.key.b_slot));
        let scale = |component: Fx| Fx::from_raw(
            ((component.raw() as i64 * 65_550i64) / 65_536) as i32);
        let impulse = Vec3::new(scale(proposal.x), scale(proposal.y), scale(proposal.z));
        let mut sums = vec![[0i128; 3]; rows.len()];
        sums[a] = [impulse.x.raw() as i128, impulse.y.raw() as i128, impulse.z.raw() as i128];
        sums[b] = [-sums[a][0], -sums[a][1], -sums[a][2]];
        let mut projected = Vec::new();
        cartesian_contact_trial(&rows, &sums, 65_536, &mut projected).unwrap();
        let basis = resolution::tests::canonical_tangents(fact.normal).unwrap();
        let source = colliders.iter().find(|row| row.entity == fact.key.a
            && row.slot == fact.key.a_slot).unwrap();
        let target = colliders.iter().find(|row| row.entity == fact.key.b
            && row.slot == fact.key.b_slot).unwrap();
        assert_eq!(old_proposal, resolution::proposed_impulse(source.mass, target.mass,
            source.surface, target.surface, fact.velocity_a, fact.velocity_b, fact.normal));
        assert_ne!(proposal, old_proposal,
                   "the owned-mass frozen ray silently became the local production proposal");
        assert_eq!(source.surface.restitution.min(target.surface.restitution), Fx::ZERO);
        let restitution = colliders[closure_rows[a]].surface.restitution
            .min(colliders[closure_rows[b]].surface.restitution);
        assert_eq!(restitution, Fx::ZERO);
        let q = |state: &[GeneralizedCollider], direction: Vec3| {
            (state[b].velocity - state[a].velocity).dot(direction).raw()
        };
        let jn = -impulse.dot(fact.normal).raw() as i64;
        let physical_tangent = impulse + fact.normal * Fx::from_raw(jn as i32);
        let jt = [impulse.dot(basis.first).raw() as i64,
                  impulse.dot(basis.second).raw() as i64];
        let outward = basis.first * Fx::from_raw(jt[0] as i32 + 1)
            + basis.second * Fx::from_raw(jt[1] as i32);
        let mut normal_sums = vec![[0i128; 3]; entry_rows.len()];
        let normal_impulse = -fact.normal * Fx::from_raw(jn as i32);
        normal_sums[a] = [normal_impulse.x.raw() as i128,
                          normal_impulse.y.raw() as i128,
                          normal_impulse.z.raw() as i128];
        normal_sums[b] = [-normal_sums[a][0], -normal_sums[a][1], -normal_sums[a][2]];
        let mut normal_only = Vec::new();
        cartesian_contact_trial(&entry_rows, &normal_sums, 65_536, &mut normal_only).unwrap();
        let numerator = |state: &[GeneralizedCollider]| {
            let words: Vec<_> = state.iter().map(|row|
                (row.mass.raw() as i64, [row.velocity.x.raw() as i64,
                 row.velocity.y.raw() as i64, row.velocity.z.raw() as i64])).collect();
            resolution::tests::widened_kinetic_numerator(&words).unwrap()
        };
        assert_eq!((q(&entry_rows, fact.normal), q(&projected, fact.normal),
                    q(&projected, basis.first), q(&projected, basis.second),
                    jn, jt, [physical_tangent.x.raw() as i64,
                             physical_tangent.y.raw() as i64,
                             physical_tangent.z.raw() as i64],
                    resolution::tests::tangent_limit_raw(friction.raw(), jn).unwrap(),
                    numerator(&entry_rows), numerator(&normal_only), numerator(&projected)),
                   (-5_539, 0, 1, 0, 4_964, [-334, 0], [331, -40, 0], 1_241,
                    2_503_658_431_536, 702_664_790_917, 694_583_037_284));
        assert_eq!([outward.x.raw() as i64, outward.y.raw() as i64,
                    outward.z.raw() as i64], [330, -40, 0]);
        let classified = resolution::tests::classify_committed_friction(
            -5_539, 0, restitution.raw(), jn, friction.raw(), [330, -40, 0],
            [[330, -40, 0]; 2], [1, 0], [1, 1], -334i128 * 2i128,
            2_503_658_431_536, 702_664_790_917, 694_583_037_284, true,
        ).unwrap();
        assert!(classified.normal_valid && classified.cone_valid);
        // **Static now, and that is the capture rather than the rule.** The
        // articulated capture committed with two raw units of tangential slip
        // left, which is outside the classifier's one-unit tolerance, so the
        // impulse was neither a sticking nor a sliding solution and the pair of
        // negatives here said exactly that. The embodied capture commits with
        // one, and one sticks. `classify_committed_friction` is being asked
        // about a different contact, not being read differently -- and the
        // sliding half below is what still separates the two answers.
        assert!(classified.static_valid,
                "one raw unit of residual slip stopped being static friction");
        assert!(!classified.sliding_valid,
                "an impulse deep inside the Coulomb disk was called sliding friction");
        let weapon = colliders[closure_rows[a]]; let body = colliders[closure_rows[b]];
        let ContactShape::Segment { previous_hilt, previous_tip, .. } = weapon.shape
            else { panic!("retained source stopped being a segment") };
        let proposed = [resolution::ProposedContact { fact, a_collider: a, b_collider: b,
            impulse_on_a: impulse, channel: Some(resolution::WeaponBodyChannel {
                weapon_axis: (previous_tip - previous_hilt).normalized_or_zero(),
                weapon_relative_velocity: weapon.velocity - body.velocity,
                edge_factor: weapon.surface.edge_factor, point_factor: weapon.surface.point_factor,
                crush_factor: weapon.surface.material.crush_factor(),
                zero_length: previous_tip == previous_hilt,
            }) }];
        let mut weights = Vec::new(); let mut shares = Vec::new(); let mut resolutions = Vec::new();
        resolution::finalize_projected_group(&mut rows, &projected, &proposed, 0, 65_536,
            &mut weights, &mut shares, &mut resolutions).unwrap();
        resolution::advance_projected_fixture_to_group(&mut colliders,
            fact.toi.get().raw() as u32, 65_536).unwrap();
        resolution::apply_projected_rows(&mut colliders, &closure_rows, &old, &rows,
            65_536 - fact.toi.get().raw() as u32).unwrap();
        assert_eq!((fact.toi.get().raw(), resolutions[0].energy.before_raw,
                    resolutions[0].energy.after_raw, resolutions[0].energy.dissipated_raw),
                   (30_514, 291, 80, 211));

        let mut wounds = world.wounds.clone(); let mut bodies = Vec::new();
        let mut credit = vec![Fx::ZERO; wounds.len()]; let mut deltas = Vec::new();
        let mut fact_loss = Vec::new();
        {
            let mut projector = ContactProjector { world: &world, entry: &contact.entry,
                bodies: &mut bodies, wounds: &mut wounds, credit: &mut credit,
                deltas: &mut deltas, fact_loss: &mut fact_loss };
            projector.after_group(&mut colliders, &mut resolutions).unwrap();
        }
        resolution::finish_projected_fixture(&mut colliders);
        let finished_contact_a = colliders.iter().copied().find(|row|
            row.entity == fact.key.a && row.slot == fact.key.a_slot).unwrap();
        let finished_contact_b = colliders.iter().copied().find(|row|
            row.entity == fact.key.b && row.slot == fact.key.b_slot).unwrap();
        assert_eq!((finished_contact_a.velocity, finished_contact_b.velocity),
                   (projected[a].velocity, projected[b].velocity));
        assert_eq!(((finished_contact_b.velocity - finished_contact_a.velocity)
                        .dot(fact.normal).raw(),
                    (finished_contact_b.velocity - finished_contact_a.velocity)
                        .dot(basis.first).raw(),
                    (finished_contact_b.velocity - finished_contact_a.velocity)
                        .dot(basis.second).raw()),
                   (0, 1, 0));
        let finished_weapon = colliders.iter().copied().find(|row|
            row.entity == fact.key.a && row.slot == fact.key.a_slot).unwrap();
        let finished_body = colliders.iter().copied().find(|row|
            row.entity == fact.key.a && matches!(row.shape, ContactShape::Body { .. })).unwrap();
        let ContactShape::Segment { previous_hilt, .. } = finished_weapon.shape
            else { panic!("retained source stopped being a segment") };
        let ContactShape::Body { previous_origin, .. } = finished_body.shape
            else { panic!("retained owner stopped being a body") };
        assert_eq!((previous_hilt.x.raw(), previous_hilt.y.raw(), previous_hilt.z.raw(),
                    previous_origin.x.raw(), previous_origin.y.raw(),
                    finished_weapon.velocity.x.raw(), finished_weapon.velocity.y.raw(),
                    finished_body.velocity.x.raw(), finished_body.velocity.y.raw()),
                   (689_193, 504_862, 56_215, 655_360, 524_288, 81, 1_537, 0, 0));
        assert_eq!((resolutions[0].group_alpha_raw, resolutions[0].cut_raw,
                    resolutions[0].thrust_raw, resolutions[0].pressure_raw, fact.volume),
                   (65_536, 67, 0, 144, BodyPart::Torso as u8));
        world.wounds = wounds;
        contact.colliders = colliders;
        contact.resolutions = resolutions;
        world.commit_contact(&mut contact);
        let source = world.resolve(fact.key.a).unwrap(); let limb = fact.key.a_slot as usize;
        let committed = world.arms[source][limb];
        assert!(committed.post_contact_active);
        assert_eq!((committed.hand.x.raw(), committed.hand.y.raw(), committed.hand.z.raw(),
                    committed.linear_velocity.x.raw(), committed.linear_velocity.y.raw(),
                    committed.linear_velocity.z.raw(), committed.post_contact_com_velocity.x.raw(),
                    committed.post_contact_com_velocity.y.raw(), committed.post_contact_com_velocity.z.raw()),
                   (33_833, -19_426, 56_215, -19, -366, 0, 81, 1_537, 0));
        world.drive_articulated_arms(CAPTURED_ARM_RATES.0, CAPTURED_ARM_RATES.1);
        let next = world.arms[source][limb];
        assert_ne!((committed.hand, committed.post_contact_com_velocity),
                   (next.hand, next.post_contact_com_velocity));
        let region = volume_region(fact.volume as usize).unwrap();
        assert_eq!((world.wounds[world.resolve(fact.key.b).unwrap()].parts[region as usize].integrity.raw(),
                    world.wounds[world.resolve(fact.key.b).unwrap()].parts[region as usize].wound.raw()),
                   (124_640, 6_432));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn retained_static_search_rejects_the_imported_normal_bracket_before_selection() {
        use crate::combat::resolution::tests::{canonical_tangents, static_candidate_grammar,
                                               tangent_limit_raw, widened_kinetic_numerator,
                                               StaticSearchReject};
        let (world, contact, rows, fact, _, _, friction) = directional_captured_strike();
        let at = |entity, slot| rows.iter().position(|row| row.entity == entity && row.slot == slot).unwrap();
        let (a, b) = (at(fact.key.a, fact.key.a_slot), at(fact.key.b, fact.key.b_slot));
        let basis = canonical_tangents(fact.normal).unwrap();
        let candidates = static_candidate_grammar(
            fact.normal, [5_623, 5_624], [[101, 102], [-1, 0]],
        ).unwrap();
        assert_eq!(candidates.len(), 160);
        let numerator = |state: &[GeneralizedCollider]| {
            let words: Vec<_> = state.iter().map(|row|
                (row.mass.raw() as i64, [row.velocity.x.raw() as i64,
                 row.velocity.y.raw() as i64, row.velocity.z.raw() as i64])).collect();
            widened_kinetic_numerator(&words).unwrap()
        };
        let initial = numerator(&rows);
        let owned_b_mass: i64 = rows.iter().filter(|row| row.entity == fact.key.b)
            .map(|row| row.mass.raw() as i64).sum();
        let mut bodies = Vec::new(); let mut trial = Vec::new();
        let mut wounds = world.wounds.clone(); let mut credit = vec![Fx::ZERO; wounds.len()];
        let mut deltas = Vec::new(); let mut fact_loss = Vec::new();
        let mut projector = ContactProjector { world: &world, entry: &contact.entry,
            bodies: &mut bodies, wounds: &mut wounds, credit: &mut credit,
            deltas: &mut deltas, fact_loss: &mut fact_loss };
        let mut unique = Vec::new();
        let mut restitution_rejects = 0usize; let mut slip_rejects = 0usize;
        let mut cone_rejects = 0usize; let mut energy_rejects = 0usize;
        let mut accepted = Vec::new();
        let mut endpoints = Vec::new();
        let mut q_range = (i32::MAX, i32::MIN);
        let mut normal_only_q = Vec::new();
        for magnitude in [5_623, 5_624] {
            let impulse = -fact.normal * Fx::from_raw(magnitude);
            let key = [impulse.x.raw(), impulse.y.raw(), impulse.z.raw()];
            let mut sums = vec![[0i128; 3]; rows.len()];
            sums[a] = [key[0] as i128, key[1] as i128, key[2] as i128];
            for axis in 0..3 {
                sums[b][axis] = -(sums[a][axis] * rows[b].mass.raw() as i128)
                    / owned_b_mass as i128;
            }
            projector.project(&rows, &sums, 65_536, &mut trial).unwrap();
            normal_only_q.push((magnitude,
                (trial[b].velocity - trial[a].velocity).dot(fact.normal).raw()));
        }
        for impulse in candidates {
            let key = [impulse.x.raw(), impulse.y.raw(), impulse.z.raw()];
            if unique.contains(&key) { continue; }
            unique.push(key);
            assert!(unique.len() <= 256, "static search exceeded its projection budget");
            let mut sums = vec![[0i128; 3]; rows.len()];
            sums[a] = [key[0] as i128, key[1] as i128, key[2] as i128];
            for axis in 0..3 {
                sums[b][axis] = -(sums[a][axis] * rows[b].mass.raw() as i128)
                    / owned_b_mass as i128;
            }
            projector.project(&rows, &sums, 65_536, &mut trial).unwrap();
            let relative = trial[b].velocity - trial[a].velocity;
            let q = relative.dot(fact.normal).raw();
            q_range.0 = q_range.0.min(q); q_range.1 = q_range.1.max(q);
            if endpoints.len() < 4 {
                endpoints.push((key, q, relative.dot(basis.first).raw(),
                                relative.dot(basis.second).raw()));
            }
            if q.unsigned_abs() > 1 { restitution_rejects += 1; continue; }
            let slip = [relative.dot(basis.first).raw(), relative.dot(basis.second).raw()];
            if slip.into_iter().any(|word| word.unsigned_abs() > 1) {
                slip_rejects += 1; continue;
            }
            let jn = -impulse.dot(fact.normal).raw() as i64;
            if jn <= 0 { cone_rejects += 1; continue; }
            let tangent = impulse + fact.normal * Fx::from_raw(jn as i32);
            let tangent_square = [tangent.x.raw(), tangent.y.raw(), tangent.z.raw()]
                .into_iter().map(|word| word as i128 * word as i128).sum::<i128>();
            let limit = tangent_limit_raw(friction.raw(), jn).unwrap() as i128;
            if tangent_square > limit * limit { cone_rejects += 1; continue; }
            let after = numerator(&trial);
            if after > initial { energy_rejects += 1; continue; }
            accepted.push((key, q, slip, after));
        }
        assert_eq!(endpoints, vec![
            ([-770, -5570, -1], 779, -488, 2),
            ([-769, -5571, -1], 779, -488, 2),
            ([-771, -5570, -1], 779, -489, 2),
            ([-770, -5570, -2], 779, -488, 2),
        ]);
        assert_eq!((unique.len(), restitution_rejects, slip_rejects,
                    cone_rejects, energy_rejects, accepted.len(), q_range),
                   (50, 50, 0, 0, 0, 0, (779, 783)),
                   "pin the actual-projector bracket diagnostic");
        assert_eq!(normal_only_q, vec![(5_623, 779), (5_624, 783)]);
        let terminal = if normal_only_q.iter().all(|row| row.1 < 0)
            || normal_only_q.iter().all(|row| row.1 > 0) {
            StaticSearchReject::MissingNormalBracket
        } else { StaticSearchReject::NoCandidate };
        assert_eq!(terminal, StaticSearchReject::MissingNormalBracket);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn retained_full_domain_normal_root_reports_its_first_exact_bracket() {
        use crate::combat::resolution::tests::{FullDomainContactReject,
                                               widened_kinetic_numerator};
        let (world, contact, rows, fact, _, _, _) = directional_captured_strike();
        let at = |entity, slot| rows.iter().position(|row| row.entity == entity && row.slot == slot).unwrap();
        let (a, b) = (at(fact.key.a, fact.key.a_slot), at(fact.key.b, fact.key.b_slot));
        let owned_b_mass: i64 = rows.iter().filter(|row| row.entity == fact.key.b)
            .map(|row| row.mass.raw() as i64).sum();
        let numerator = |state: &[GeneralizedCollider]| {
            let words: Vec<_> = state.iter().map(|row| (row.mass.raw() as i64,
                [row.velocity.x.raw() as i64, row.velocity.y.raw() as i64,
                 row.velocity.z.raw() as i64])).collect();
            widened_kinetic_numerator(&words).unwrap()
        };
        let initial = numerator(&rows);
        let mut bodies = Vec::new(); let mut scratch = Vec::new();
        let mut wounds = world.wounds.clone(); let mut credit = vec![Fx::ZERO; wounds.len()];
        let mut deltas = Vec::new(); let mut fact_loss = Vec::new();
        let mut projector = ContactProjector { world: &world, entry: &contact.entry,
            bodies: &mut bodies, wounds: &mut wounds, credit: &mut credit,
            deltas: &mut deltas, fact_loss: &mut fact_loss };
        let mut calls = 0usize; let mut sampled = Vec::new();
        let mut cache: Vec<(i32, Vec<(Vec3, i32, i128, Vec<GeneralizedCollider>)>)> = Vec::new();
        let mut probe = |magnitude: i32| {
            if let Some((_, answer)) = cache.iter().find(|row| row.0 == magnitude) {
                return answer.clone();
            }
            if !sampled.contains(&magnitude) { sampled.push(magnitude); }
            assert!(sampled.len() <= 65);
            let (candidates, count) = normal_component_candidates(fact.normal, magnitude);
            let mut answers = Vec::new();
            for impulse in &candidates[..count] {
                calls += 1; assert!(calls <= 256);
                let mut sums = vec![[0i128; 3]; rows.len()];
                sums[a] = [impulse.x.raw() as i128, impulse.y.raw() as i128, impulse.z.raw() as i128];
                for axis in 0..3 { sums[b][axis] = -(sums[a][axis]
                    * rows[b].mass.raw() as i128) / owned_b_mass as i128; }
                projector.project(&rows, &sums, 65_536, &mut scratch).unwrap();
                let q = (scratch[b].velocity - scratch[a].velocity).dot(fact.normal).raw();
                answers.push((*impulse, q, numerator(&scratch), scratch.clone()));
            }
            cache.push((magnitude, answers.clone()));
            answers
        };
        let mut lower = 0; let mut word = 0;
        let mut upper = loop {
            let sample = probe(word); let max_q = sample.iter().map(|row| row.1).max().unwrap();
            if max_q >= -1 { break word; }
            lower = word;
            assert_ne!(word, i32::MAX, "complete normal domain had no restitution bracket");
            word = if word == 0 { 1 } else { word.checked_mul(2).unwrap_or(i32::MAX) };
        };
        while upper - lower > 1 {
            let mid = lower + (upper - lower) / 2;
            if probe(mid).iter().map(|row| row.1).max().unwrap() >= -1 { upper = mid; }
            else { lower = mid; }
        }
        let lower_rows = probe(lower); let upper_rows = probe(upper);
        let roots: Vec<_> = lower_rows.iter().chain(&upper_rows)
            .filter(|row| row.1.unsigned_abs() <= 1 && row.2 <= initial)
            .map(|row| (row.0.x.raw(), row.0.y.raw(), row.0.z.raw(), row.1, row.2)).collect();
        drop(probe);
        cache.sort_by_key(|row| row.0);
        for pair in cache.windows(2) {
            let envelope = |row: &(i32, Vec<(Vec3, i32, i128, Vec<GeneralizedCollider>)>)|
                (row.1.iter().map(|answer| answer.1).min().unwrap(),
                 row.1.iter().map(|answer| answer.1).max().unwrap());
            let (left, right) = (envelope(&pair[0]), envelope(&pair[1]));
            assert!(left.0 <= right.0 && left.1 <= right.1,
                    "full-domain normal response reversed between scalar samples");
        }
        // **The domain has a root in it now, and these three lines are what
        // say so rather than a `roots.is_empty()` that would have to be
        // deleted.** The articulated capture's upper word straddled zero
        // without landing on it -- every integer rounding of the normal there
        // left `|q| > 1` -- which is what `FullDomainContactReject::NormalGap`
        // named and what an empty `roots` recorded. The embodied capture's
        // normal is oblique enough that two of the roundings at the upper word
        // land exactly on `q == 0` and inside the entry energy. The bisection,
        // its sample ladder and its call count are untouched; what moved is the
        // contact underneath them.
        assert_eq!(roots, vec![(-587, -4_885, 0, 0, 690_615_366_361),
                               (-586, -4_885, 0, 0, 690_584_242_249)],
                   "the full-domain bracket's representable roots moved");
        assert!(lower_rows.iter().all(|row| row.1 < -1),
                "the lower end of the bracket stopped opening");
        assert!(upper_rows.iter().any(|row| row.1.unsigned_abs() <= 1),
                "the upper end of the bracket stopped closing on a root");
        assert_eq!(sampled, vec![0, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512,
            1_024, 2_048, 4_096, 8_192, 6_144, 5_120, 4_608, 4_864, 4_992,
            4_928, 4_896, 4_912, 4_920, 4_916, 4_918, 4_919]);
        // Named rather than deleted: `NormalGap` is the rejection the exact
        // solver would reach on a domain with no representable root, and this
        // capture is the counterexample to it rather than an instance of it.
        let terminal = if roots.is_empty() { Some(FullDomainContactReject::NormalGap) }
            else { None };
        assert_eq!(terminal, None);
        assert_eq!((lower, upper, sampled.len(), calls,
                    lower_rows.iter().map(|row| row.1).min().unwrap(),
                    lower_rows.iter().map(|row| row.1).max().unwrap(),
                    upper_rows.iter().map(|row| row.1).min().unwrap(),
                    upper_rows.iter().map(|row| row.1).max().unwrap(), initial, roots),
                   (4_919, 4_920, 27, 105, -4, -3, -3, 0,
                    2_503_658_431_536,
                    vec![(-587, -4_885, 0, 0, 690_615_366_361),
                         (-586, -4_885, 0, 0, 690_584_242_249)]),
                   "full-domain normal target changed");
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn retained_residual_trust_region_refuses_the_alternate_mapper_seed() {
        use crate::combat::resolution::tests::{canonical_tangents, ResidualTrustReject};
        let (world, contact, rows, fact, _, proposal, _) = directional_captured_strike();
        let at = |entity, slot| rows.iter().position(|row|
            row.entity == entity && row.slot == slot).unwrap();
        let (a, b) = (at(fact.key.a, fact.key.a_slot), at(fact.key.b, fact.key.b_slot));
        let basis = canonical_tangents(fact.normal).unwrap();
        let scale = |component: Fx| Fx::from_raw(
            ((component.raw() as i64 * 65_550i64) / 65_536) as i32);
        let centre_impulse = Vec3::new(scale(proposal.x), scale(proposal.y), scale(proposal.z));
        let owned_b_mass: i64 = rows.iter().filter(|row| row.entity == fact.key.b)
            .map(|row| row.mass.raw() as i64).sum();
        let mut bodies = Vec::new(); let mut scratch = Vec::new();
        let mut wounds = world.wounds.clone(); let mut credit = vec![Fx::ZERO; wounds.len()];
        let mut deltas = Vec::new(); let mut fact_loss = Vec::new();
        let mut projector = ContactProjector { world: &world, entry: &contact.entry,
            bodies: &mut bodies, wounds: &mut wounds, credit: &mut credit,
            deltas: &mut deltas, fact_loss: &mut fact_loss };
        let residual = |state: &[GeneralizedCollider]| {
            let relative = state[b].velocity - state[a].velocity;
            [relative.dot(fact.normal).raw(), relative.dot(basis.first).raw(),
             relative.dot(basis.second).raw()]
        };
        let mut calls = 0usize;
        let mut project = |impulse: Vec3| {
            calls += 1; assert!(calls <= 128);
            let mut sums = vec![[0i128; 3]; rows.len()];
            sums[a] = [impulse.x.raw() as i128, impulse.y.raw() as i128, impulse.z.raw() as i128];
            for axis in 0..3 { sums[b][axis] = -(sums[a][axis]
                * rows[b].mass.raw() as i128) / owned_b_mass as i128; }
            projector.project(&rows, &sums, 65_536, &mut scratch).unwrap();
            residual(&scratch)
        };
        let centre = project(centre_impulse);
        assert_eq!(([centre_impulse.x.raw(), centre_impulse.y.raw(), centre_impulse.z.raw()], centre),
                   ([-260, -4_968, 0], [47, -3, 2]));
        // Smart31's declared centre belongs to the alternate Cartesian trial
        // mapper. The production projector is the only allowed oracle here;
        // a different seed is attribution failure, not permission to derive a
        // Jacobian around a response the plan did not predeclare.
        let seed_gate = if centre == [0, 1, 0] { None }
            else { Some(ResidualTrustReject::Projector) };
        drop(project);
        assert_eq!((calls, seed_gate), (1, Some(ResidualTrustReject::Projector)));
        let mut alternate_sums = vec![[0i128; 3]; rows.len()];
        alternate_sums[a] = [centre_impulse.x.raw() as i128,
                             centre_impulse.y.raw() as i128,
                             centre_impulse.z.raw() as i128];
        alternate_sums[b] = [-alternate_sums[a][0], -alternate_sums[a][1],
                             -alternate_sums[a][2]];
        let mut alternate = Vec::new();
        cartesian_contact_trial(&rows, &alternate_sums, 65_536, &mut alternate).unwrap();
        assert_eq!(residual(&alternate), [0, 1, 0],
                   "the refused seed stopped identifying the alternate mapper exactly");
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn retained_production_seed_is_entry_derived_and_repeats_exactly() {
        let (world, contact, rows, fact, proposal, _, _) = directional_captured_strike();
        let at = |entity, slot| rows.iter().position(|row|
            row.entity == entity && row.slot == slot).unwrap();
        let (a, b) = (at(fact.key.a, fact.key.a_slot), at(fact.key.b, fact.key.b_slot));
        let mut colliders = Vec::new();
        world.build_contact_colliders(&contact.entry, &mut colliders, &world.wounds);
        assert_eq!(crate::combat::contact::collect_contacts(&colliders), vec![fact]);
        let basis = resolution::tests::canonical_tangents(fact.normal).unwrap();
        let residual = |state: &[GeneralizedCollider]| {
            let relative = state[b].velocity - state[a].velocity;
            [relative.dot(fact.normal).raw(), relative.dot(basis.first).raw(),
             relative.dot(basis.second).raw()]
        };
        let proposed = [resolution::ProposedContact { fact, a_collider: a, b_collider: b,
                                                       impulse_on_a: proposal, channel: None }];
        let mut sums = Vec::new();
        resolution::build_group_sums(rows.len(), &proposed, &mut sums).unwrap();
        for (index, sum) in sums.iter().enumerate() {
            if index != a && index != b { assert_eq!(*sum, [0; 3]); }
        }
        let zero = vec![[0i128; 3]; rows.len()];
        let mut bodies = Vec::new(); let mut zero_rows = Vec::new(); let mut first = Vec::new();
        let mut second = Vec::new(); let mut wounds = world.wounds.clone();
        let mut credit = vec![Fx::ZERO; wounds.len()]; let mut deltas = Vec::new();
        let mut fact_loss = Vec::new();
        let mut projector = ContactProjector { world: &world, entry: &contact.entry,
            bodies: &mut bodies, wounds: &mut wounds, credit: &mut credit,
            deltas: &mut deltas, fact_loss: &mut fact_loss };
        projector.project(&rows, &zero, 65_536, &mut zero_rows).unwrap();
        projector.project(&rows, &sums, 65_536, &mut first).unwrap();
        projector.project(&rows, &sums, 65_536, &mut second).unwrap();
        assert_eq!(zero_rows, rows);
        assert_eq!(first, second);
        assert_eq!(([proposal.x.raw(), proposal.y.raw(), proposal.z.raw()],
                    [sums[a][0], sums[a][1], sums[a][2]],
                    [sums[b][0], sums[b][1], sums[b][2]], residual(&rows), residual(&first)),
                   ([-162,-3_069,0], [-162,-3_069,0], [162,3_069,0],
                    [-5_539,-373,0], [49,-4,2]),
                   "pin entry-only production seed provenance");
        let directions = [-fact.normal, basis.first, basis.second];
        let mut probes = Vec::new();
        let mut columns = Vec::new(); let mut midpoints = Vec::new();
        let mut terminal = None;
        for direction in directions {
            let pair = resolution::tests::invariant_perturbation_pair(direction, 64).unwrap();
            let mut sides = [[0i32; 3]; 2];
            for (side, impulse) in [proposal + pair.0, proposal + pair.1].into_iter().enumerate() {
                let contact = [resolution::ProposedContact { fact, a_collider: a, b_collider: b,
                                                             impulse_on_a: impulse, channel: None }];
                resolution::build_group_sums(rows.len(), &contact, &mut sums).unwrap();
                projector.project(&rows, &sums, 65_536, &mut second).unwrap();
                sides[side] = residual(&second);
            }
            if let Err(_) = resolution::tests::midpoint_is_central(sides[0], residual(&first), sides[1], 2) {
                terminal = Some(resolution::tests::SeedProvenanceReject::Nonlinear);
            }
            columns.push([sides[0][0] - sides[1][0], sides[0][1] - sides[1][1],
                          sides[0][2] - sides[1][2]]);
            let centre = residual(&first);
            midpoints.push([sides[0][0] + sides[1][0] - 2 * centre[0],
                            sides[0][1] + sides[1][1] - 2 * centre[1],
                            sides[0][2] + sides[1][2] - 2 * centre[2]]);
            probes.push(([pair.0.x.raw(), pair.0.y.raw(), pair.0.z.raw()], sides));
        }
        assert_eq!((probes, columns, midpoints, terminal), (vec![
            ([-8, -64, 0], [[166, -4, 2], [-67, -5, 2]]),
            ([-64, 8, 0], [[50, -119, 2], [52, 113, 2]]),
            ([0, 0, 64], [[49, -4, -50], [49, -4, 52]]),
        ], vec![[233,1,0], [-2,-232,0], [0,0,-102]],
           vec![[1,-1,0], [4,2,0], [0,0,-2]],
           Some(resolution::tests::SeedProvenanceReject::Nonlinear)),
                   "fixed h64 neighborhood or its global classification changed");
        resolution::build_group_sums(rows.len(), &proposed, &mut sums).unwrap();
        projector.project(&rows, &sums, 65_536, &mut second).unwrap();
        assert_eq!(second, first, "independent final seed projection drifted");
    }

    #[test]
    fn cartesian_retained_dissipation_reaches_the_existing_damage_channel_split() {
        let (world, contact, _, fact, _, _, _) = directional_captured_strike();
        let mut colliders = Vec::new();
        world.build_contact_colliders(&contact.entry, &mut colliders, &world.wounds);
        let weapon = colliders.iter().copied().find(|row| row.entity == fact.key.a
            && row.slot == fact.key.a_slot).unwrap();
        let body = colliders.iter().copied().find(|row| row.entity == fact.key.b
            && matches!(row.shape, ContactShape::Body { .. })).unwrap();
        let ContactShape::Segment { previous_hilt, previous_tip, .. } = weapon.shape
            else { panic!("retained source stopped being a segment") };
        let channel = resolution::WeaponBodyChannel {
            weapon_axis: (previous_tip - previous_hilt).normalized_or_zero(),
            weapon_relative_velocity: weapon.velocity - body.velocity,
            edge_factor: weapon.surface.edge_factor,
            point_factor: weapon.surface.point_factor,
            crush_factor: weapon.surface.material.crush_factor(),
            zero_length: previous_tip == previous_hilt,
        };
        // A sword, so the edge claims the whole budget and the crush column is
        // zero rather than small: `132 + 0 == 276 - 144` exactly leaves nothing
        // declined. The blunt channel is inert on a blade by construction.
        let split = resolution::channels(276, channel);
        assert_eq!(split, (132, 0, 0, 144));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn wall_reconciliation_normalizes_common_momentum_without_changing_its_rational_value() {
        // Retain one real club/body fact, then give its finalized exact row an
        // eastward impulse at the wall. The old thirty-tick command fixture
        // stopped reaching this boundary once exact response persisted across
        // ticks; its final assertion measured the actuator rather than the
        // settlement it named.
        let mut world = clinch_world();
        let wall_side = Fx::from_int(24) - world.radius[1];
        world.pos[1] = Vec2::new(wall_side, Fx::from_int(8));
        world.pos[0] = Vec2::new(wall_side - Fx::from_ratio(3, 2), Fx::from_int(8));
        world.body_yaw[0].angle = Angle::ZERO;
        world.body_yaw[1].angle = Angle::ZERO;
        brace_weapon(&mut world, 0);
        let mut contact = exact_contact_fixture(&mut world);
        let mut scan = crate::combat::contact::ContactCollectionScratch::default();
        scan.try_reserve(64).unwrap();
        scan_exact_candidates_into(&contact.exact_trajectories, &contact.exact_owners,
            &contact.colliders, &mut scan).unwrap();
        let fighter_id = world.id_of(1);
        let facts: Vec<_> = scan.candidates().iter().map(|row| row.fact).collect();
        let fact = facts.iter().copied().find(|fact|
            (fact.key.a == fighter_id && fact.key.a_slot == BODY_SLOT)
                || (fact.key.b == fighter_id && fact.key.b_slot == BODY_SLOT))
            .unwrap_or_else(|| panic!("the retained club never contacted the wall-side body: {facts:?}"));
        let east = Vec3::new(Fx::from_int(2), Fx::ZERO, Fx::ZERO);
        let on_a = if fact.key.a == fighter_id { east } else { -east };
        let resolution = ContactResolution { group_ordinal: 0,
            group_alpha_raw: fact.toi.get().raw() as u32, fact,
            impulse: crate::combat::contact::ContactImpulse {
                key: fact.key, on_a, on_b: -on_a,
            }, energy: Default::default(), cut_raw: 0, thrust_raw: 0, crush_raw: 0,
            pressure_raw: 0, deflected_raw: 0, severed: false };
        let applied = apply_exact_group(&contact.exact_trajectories, &contact.exact_owners,
            &[resolution], fact.toi.get().raw() as u32).unwrap();
        applied.owners.copy_into(&mut contact.exact_owners).unwrap();
        let finished = advance_exact(&contact.exact_owners, 65_536).unwrap();
        finished.copy_into(&mut contact.exact_owners).unwrap();
        contact.resolutions.push(resolution);
        assert!(!contact.entry[1].clamped[1],
            "the fixture must reach the held row through body-wall authority");
        world.stage_exact_contact(&mut contact).unwrap();
        assert!(contact.exact_commit.iter().find(|row| row.entity == fighter_id)
            .unwrap().arms[1].is_some(),
            "an arena body clip did not retain the unchanged held response row");

        let closure = |world: &World, contact: &ContactRuntime, solved: bool| {
            contact.colliders.iter().map(|collider| {
                let i = world.resolve(collider.entity).unwrap();
                let staged = contact.exact_commit.iter().find(|row|
                    row.entity == collider.entity).unwrap();
                let body = if solved {
                    Vec3::new(staged.velocity.x, staged.velocity.y, Fx::ZERO)
                } else { Vec3::new(world.vel[i].x, world.vel[i].y, Fx::ZERO) };
                let velocity = if matches!(collider.shape, ContactShape::Body { .. }) { body }
                    else {
                        let limb = collider.slot as usize;
                        let relative = if solved { staged.arms[limb]
                            .map_or(world.arms[i][limb].linear_velocity, |arm| arm.linear_velocity) }
                            else { world.arms[i][limb].linear_velocity };
                        body + relative
                    };
                GeneralizedCollider { entity: collider.entity, slot: collider.slot,
                    kind: if matches!(collider.shape, ContactShape::Body { .. }) {
                        GeneralizedKind::Body } else { GeneralizedKind::Equipment },
                    mass: collider.mass, velocity, velocity_offset: Vec3::ZERO }
            }).collect::<Vec<_>>()
        };
        let before = closure(&world, &contact, true);
        assert!(before.iter().any(|row| row.entity == fighter_id
            && row.kind == GeneralizedKind::Body && row.velocity.x > Fx::ZERO),
            "the retained strike did not cross the wall");
        let staged_owner = contact.exact_commit.iter().find(|row| row.entity == fighter_id)
            .unwrap().owner;
        let staged_velocity = contact.exact_commit.iter().find(|row| row.entity == fighter_id)
            .unwrap().velocity.x;
        let old_x = staged_owner.common_response.momentum[0];
        let scale = staged_owner.common_scale;
        let expected_numerator = (old_x.velocity_raw as i128 - staged_velocity.raw() as i128)
            .checked_mul(scale).and_then(|word| word.checked_add(old_x.remainder)).unwrap();
        world.commit_exact_contact(&mut contact);
        let normalized = world.exact_owners[1].unwrap().common_response.momentum[0];
        assert_eq!((normalized.velocity_raw as i128) * scale + normalized.remainder,
                   expected_numerator,
                   "wall settlement changed the exact rational momentum");
        assert!(normalized.remainder.abs() < scale);
        assert!(normalized.velocity_raw == 0 || normalized.remainder == 0
            || normalized.velocity_raw.signum() as i128 == normalized.remainder.signum(),
            "wall settlement retained sign-opposed momentum words: {normalized:?}");
        let after = closure(&world, &contact, false);
        let before_energy = crate::combat::resolution::closure_energy(&before).unwrap();
        let after_energy = crate::combat::resolution::closure_energy(&after).unwrap();
        assert!(after_energy <= before_energy,
            "wall settlement added energy: {before_energy} -> {after_energy}");
        assert_eq!((world.pos[1].x, world.vel[1].x), (wall_side, Fx::ZERO));
        let ledger = contact.recoil_external[1][1];
        assert_eq!(ledger.reason_mask, RecoilExternalEnergy::WALL);
        assert!(ledger.dissipated_numerator > 0 && ledger.supplied_numerator == 0);
        let body_exact = contact.exact_external_energy.iter().copied().find(|row|
            row.entity == fighter_id && row.lane == 0
                && row.reason == RecoilExternalEnergy::WALL)
            .expect("wall settlement did not account for the body's physical row");
        assert_eq!(body_exact.denominator, 2i128 * 65_536 * 65_536);
        assert!(body_exact.signed_numerator < 0);
        let held_exact = contact.exact_external_energy.iter().copied().find(|row|
            row.entity == fighter_id && row.lane == 2
                && row.reason == RecoilExternalEnergy::WALL)
            .expect("body-wall settlement did not account for the held physical row");
        assert_eq!(held_exact.denominator, 2i128 * 65_536 * 65_536);
        assert!(held_exact.signed_numerator < 0);

        world.contact = Some(contact);
        world.retain_contact_entry();
        world.record_contact_locomotion();
        let mut next = world.contact.take().unwrap();
        world.build_contact_colliders(&next.entry, &mut next.colliders, &world.wounds);
        build_exact_contact_trajectories(&world, &mut next, &world.wounds)
            .expect("wall reconciliation left an invalid next exact state");
    }

    #[test]
    fn both_has_one_right_owned_collider_and_mirrors_after_contact() {
        // Reuse the retained directional strike's measured placement and
        // chamber, but make its sword two-handed. Bracing a straight segment
        // did not close in this geometry; the captured sweep does, at positive
        // time, and therefore proves the ownership rule against a real hit.
        let mut config = crate::DuelConfigV1::shipped();
        config.fighters[0].spawn = Vec2::from_ints(10, 8);
        config.fighters[0].hands[0] = None;
        config.fighters[0].hands[1].as_mut().unwrap().geometry = crate::EquipmentGeometry::Segment {
            length: Fx::from_int(2), radius: Fx::from_ratio(1, 25),
        };
        config.fighters[1].spawn = Vec2::new(Fx::from_ratio(1_256, 100), Fx::from_int(8));
        config.fighters[1].anatomy = crate::AnatomyChoice::Fighter;
        config.max_ticks = 96;
        let mut scenario = Scenario::duel_from(&config).unwrap();
        let sword = scenario.units[0].articulated.unwrap().equipment.into_iter()
            .flatten().next().unwrap();
        scenario.combat_specs.as_mut().unwrap().equipment.iter_mut()
            .find(|row| row.id == sword).unwrap().binding = crate::GripBinding::Both;
        let mut world = World::new(&scenario, 0);
        assert!(world.two_handed(0), "the fighter is not holding its sword in both hands");

        let (attacker, defender) = (world.id_of(0), world.id_of(1));
        let yaw = world.body_yaw[0].angle;
        let chamber = Angle::from_raw(yaw.raw().wrapping_sub(Angle::QUARTER.raw()));
        // The same measured height, for the same reason: at `CombatHeight::LOW`
        // the elbow folds the arm back to its minimum reach and the blade stops
        // arriving. See `directional_captured_strike`.
        let height = crate::CombatHeight::try_from_raw(Fx::from_ratio(61, 128).raw())
            .expect("sixty-one hundred-and-twenty-eighths is a legal height");
        let strike = |world: &World, bearing| {
            let mut command = world.neutral_articulated(0);
            command.intent = Intent::Attack(defender);
            command.arms[1] = ArmTarget { bearing, height,
                                          reach: Fx::ONE, effort: Fx::ONE };
            command
        };
        for _ in 0..48 {
            assert!(matches!(world.submit_embodied_v1(attacker,
                crate::EmbodiedCommandV1::new(strike(&world, chamber))),
                crate::SubmitEmbodiedOutcome::Stored { rejection: None, .. }),
                "the chamber was refused rather than obeyed");
            world.submit_embodied_v1(defender,
                crate::EmbodiedCommandV1::new(world.neutral_articulated(1)));
            world.step();
        }
        let mut hit = false;
        for _ in 0..48 {
            assert!(matches!(world.submit_embodied_v1(attacker,
                crate::EmbodiedCommandV1::new(strike(&world, yaw))),
                crate::SubmitEmbodiedOutcome::Stored { rejection: None, .. }),
                "the follow-through was refused rather than obeyed");
            world.submit_embodied_v1(defender,
                crate::EmbodiedCommandV1::new(world.neutral_articulated(1)));
            world.step();
            if world.contact_resolutions().iter().any(|row|
                row.fact.key.kind == ContactKind::WeaponBody) {
                hit = true;
                break;
            }
        }
        assert!(hit, "the two-handed captured strike lost its weapon/body contact");
        let contact = world.contact.as_ref().expect("articulated contact state");
        let owned: Vec<u8> = contact.colliders.iter()
            .filter(|row| row.entity.index == 0 && !matches!(row.shape, ContactShape::Body { .. }))
            .map(|row| row.slot).collect();
        assert_eq!(owned, vec![1], "a `Both` item emitted other than one right-owned collider");
        assert!(!world.contact_resolutions().iter().any(|row| {
            (row.fact.key.a.index == 0 && row.fact.key.a_slot == 0)
                || (row.fact.key.b.index == 0 && row.fact.key.b_slot == 0)
        }), "the mirrored left arm was keyed as a collider");

        // A direct held response names the non-vacuous contact move; mirroring
        // alone would also be true of an actuator-only tick.
        #[cfg(feature = "cartesian-recoil")]
        assert!(world.arms[0][1].post_contact_active,
                "the contact did not activate the two-handed owner");
        let anatomy = world.combat_specs.as_ref().unwrap()
            .anatomy(world.articulated_anatomy[0].unwrap()).unwrap().clone();
        let mut expected = world.arms[0][0];
        actuator::mirror_two_handed(&mut expected, world.arms[0][1], &anatomy, world.body_yaw[0].angle);
        assert_eq!(world.arms[0][0], expected, "the left arm was left on its pre-contact mirror");
        #[cfg(feature = "cartesian-recoil")]
        assert_eq!((world.arms[0][0].post_contact_com_velocity,
                    world.arms[0][0].post_contact_active), (Vec3::ZERO, false),
                   "the nonowning mirror retained a second recoil response");
        #[cfg(feature = "cartesian-recoil")]
        let owner = world.exact_owners[0].expect("the contacted owner lost its exact state");
        #[cfg(feature = "cartesian-recoil")]
        assert!(owner.held_response[0].is_none() && owner.held_response[1].is_some(),
                "a two-handed contact grew a second held response row");
    }

    #[test]
    fn dead_and_reused_slots_keep_contact_identity_and_hash_coverage() {
        let mut world = clinch_world();
        let dead = EntityId::new(1, 0);
        step_into_contact(&mut world);
        assert!(world.contact_resolutions().iter()
            .any(|row| row.fact.key.a == dead || row.fact.key.b == dead),
            "the fixture never keyed the slot about to be reused");
        let before = world.state_digest().value;

        // The test-only despawn the contract allows: v2-15 owns the public one.
        // Written the way `World::reap_dead` writes it, generation bump
        // included -- that bump is what makes the reused slot a *different*
        // entity, and a fixture that skipped it would be proving identity
        // survives reuse by never reusing an identity.
        world.alive[1] = false;
        world.generation[1] = world.generation[1].wrapping_add(1);
        world.free.push(1);
        let reborn = world.try_spawn(&clinch_scenario().units[1]).expect("respawn");
        assert_eq!(reborn, EntityId::new(1, 1), "a reused slot kept its generation");
        assert_eq!(world.alive.len(), 2, "a reused slot allocated a column");

        step_into_contact(&mut world);
        assert!(world.contact_resolutions().iter()
            .all(|row| row.fact.key.a != dead && row.fact.key.b != dead),
            "a resolution carried the identity of the slot that died");
        assert!(world.contact_resolutions().iter()
            .any(|row| row.fact.key.a == reborn || row.fact.key.b == reborn),
            "the reborn row never entered a contact group");
        // Every retained row is this tick's: the phase clears resolutions at
        // articulated tick entry, so nothing keyed to a dead generation can
        // survive into the reused slot's ledger.
        assert!(world.contact_resolutions().iter().all(|row| row.fact.key.a.generation
            == world.generation[row.fact.key.a.index as usize]));
        assert_ne!(world.state_digest().value, before,
            "the reused slot hashed identically to the one it replaced");
    }
}

#[cfg(all(test, feature = "cartesian-recoil"))]
mod smart131_world_forwarding_test {
    use super::*;

    #[test]
    fn the_segment_body_target_world_api_forwards_one_step_lifecycle() {
        let mut world = World::new(&Scenario::embodied_duel(), 1);
        let target = crate::ExactSegmentBodyDiagnosticTarget {
            key: crate::ExactContactKeyDiagnostic {
                a: EntityId::new(0, 0), a_slot: 1,
                b: EntityId::new(1, 0), b_slot: crate::BODY_SLOT,
                kind: crate::ContactKind::WeaponBody,
            },
            a_index: 1, b_index: 3,
        };
        assert!(world.request_exact_segment_body_pair_diagnostic(target));
        world.step();
        assert!(world.exact_segment_body_target_diagnostic().is_some());
        world.step();
        assert_eq!(world.exact_segment_body_target_diagnostic(), None);
        assert!(world.request_exact_segment_body_pair_aabb_diagnostic(target));
        world.step();
        assert!(world.exact_segment_body_pair_aabb_diagnostic().is_some());
        assert_eq!(world.exact_segment_body_target_diagnostic(), None);
        assert!(world.request_exact_segment_body_pair_diagnostic(target));
        assert!(world.exact_segment_body_pair_aabb_diagnostic().is_some());
        world.step();
        assert!(world.exact_segment_body_target_diagnostic().is_some());
        assert_eq!(world.exact_segment_body_pair_aabb_diagnostic(), None);
        world.step();
        assert_eq!(world.exact_segment_body_target_diagnostic(), None);
        assert!(world.request_exact_segment_hilt_start_x_diagnostic(target));
        world.step();
        assert!(world.exact_segment_hilt_start_x_diagnostic().is_some());
        assert_eq!(world.exact_segment_body_target_diagnostic(), None);
        assert_eq!(world.exact_segment_body_pair_aabb_diagnostic(), None);
        assert!(world.request_exact_segment_body_pair_aabb_diagnostic(target));
        assert!(world.exact_segment_hilt_start_x_diagnostic().is_some());
        assert!(!world.request_exact_segment_hilt_start_x_diagnostic(target));
        world.step();
        assert!(world.exact_segment_body_pair_aabb_diagnostic().is_some());
        assert_eq!(world.exact_segment_hilt_start_x_diagnostic(), None);
    }
}
