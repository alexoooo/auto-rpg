//! Pure coupled impulse resolution for articulated contact groups.
//!
//! World integration supplies generalized collider rows and commits the result.
//! This module deliberately knows nothing about world columns or scheduling.

use crate::combat::contact::{
    collect_contacts_into, map_local_to_global, put_u32, put_u64, write_fact, write_impulse,
    ContactCollectionScratch, ContactCollider, ContactFact, ContactImpulse, ContactKey,
    ContactKind, ContactResolution, ContactShape, ContactSolverState, EnergyLedger,
    BODY_SLOT, MAX_CONTACT_GROUPS_PER_TICK,
};
use crate::combat::spec::SurfaceSpec;
use crate::EntityId;
use fx::{Fx, Vec3};

pub const CONTACT_ENERGY_FLOOR: u64 = 144;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct GeneralizedCollider {
    pub entity: EntityId,
    pub slot: u8,
    pub kind: GeneralizedKind,
    pub mass: Fx,
    pub velocity: Vec3,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum GeneralizedKind { Body, Equipment }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct WeaponBodyChannel {
    pub weapon_axis: Vec3,
    pub weapon_relative_velocity: Vec3,
    pub edge_factor: Fx,
    pub point_factor: Fx,
    pub zero_length: bool,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ProposedContact {
    pub fact: ContactFact,
    pub a_collider: usize,
    pub b_collider: usize,
    pub impulse_on_a: Vec3,
    pub channel: Option<WeaponBodyChannel>,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ResolutionError { ColliderIndex, EnergyNumerator }

pub fn proposed_impulse(
    mass_a: Fx,
    mass_b: Fx,
    surface_a: SurfaceSpec,
    surface_b: SurfaceSpec,
    velocity_a: Vec3,
    velocity_b: Vec3,
    normal: Vec3,
) -> Vec3 {
    let relative = velocity_b - velocity_a;
    let normal_speed = relative.dot(normal);
    let closing = (-normal_speed).max(Fx::ZERO);
    if closing == Fx::ZERO || mass_a <= Fx::ZERO || mass_b <= Fx::ZERO {
        return Vec3::ZERO;
    }
    let restitution = surface_a.restitution.min(surface_b.restitution);
    let friction = surface_a.friction.min(surface_b.friction);
    let inverse_sum = Fx::ONE / mass_a + Fx::ONE / mass_b;
    if inverse_sum == Fx::ZERO { return Vec3::ZERO; }
    let normal_impulse = (Fx::ONE + restitution) * closing / inverse_sum;
    let tangent = relative - normal * normal_speed;
    let friction_impulse = (friction * normal_impulse).min(tangent.length() / inverse_sum);
    -normal * normal_impulse + tangent.normalized_or_zero() * friction_impulse
}

/// Exact 16.16 kinetic-energy raw value for a generalized closure.
pub fn closure_energy(rows: &[GeneralizedCollider]) -> Result<u64, ResolutionError> {
    let mut numerator = 0i128;
    for row in rows {
        let v = row.velocity;
        let square = v.x.raw() as i128 * v.x.raw() as i128
            + v.y.raw() as i128 * v.y.raw() as i128
            + v.z.raw() as i128 * v.z.raw() as i128;
        let term = (row.mass.raw() as i128).checked_mul(square)
            .ok_or(ResolutionError::EnergyNumerator)?;
        numerator = numerator.checked_add(term).ok_or(ResolutionError::EnergyNumerator)?;
    }
    if numerator < 0 { return Err(ResolutionError::EnergyNumerator); }
    let quotient = numerator / (2i128 * 65_536 * 65_536);
    u64::try_from(quotient).map_err(|_| ResolutionError::EnergyNumerator)
}

fn scaled_delta(sum: [i128; 3], alpha_raw: u32, mass_raw: i32) -> Vec3 {
    debug_assert!(mass_raw > 0);
    let component = |value: i128| {
        let raw = value * alpha_raw as i128 / mass_raw as i128;
        Fx::from_raw(raw.clamp(i32::MIN as i128, i32::MAX as i128) as i32)
    };
    Vec3::new(component(sum[0]), component(sum[1]), component(sum[2]))
}

pub trait ContactTrialProjector {
    /// Rebuild one trial from the immutable pre-group rows. Implementations may
    /// project body Z into the floor, propagate a body delta to held equipment,
    /// and inverse-map/clamp joint poses before writing their final velocities.
    fn project(
        &mut self,
        before: &[GeneralizedCollider],
        sums: &[[i128; 3]],
        alpha_raw: u32,
        out: &mut Vec<GeneralizedCollider>,
    ) -> Result<(), ResolutionError>;
}

pub struct IndependentPointProjector;

impl ContactTrialProjector for IndependentPointProjector {
    fn project(
        &mut self,
        before: &[GeneralizedCollider],
        sums: &[[i128; 3]],
        alpha_raw: u32,
        out: &mut Vec<GeneralizedCollider>,
    ) -> Result<(), ResolutionError> {
        out.clear();
        out.extend_from_slice(before);
        for (row, sum) in out.iter_mut().zip(sums) {
            if row.mass <= Fx::ZERO { return Err(ResolutionError::EnergyNumerator); }
            let delta = scaled_delta(*sum, alpha_raw, row.mass.raw());
            row.velocity = clamp_vec(row.velocity + delta);
        }
        Ok(())
    }
}

fn clamp_vec(value: Vec3) -> Vec3 {
    const L: Fx = crate::combat::contact::CONTACT_COMPONENT_SPEED_LIMIT;
    Vec3::new(value.x.clamp(-L, L), value.y.clamp(-L, L), value.z.clamp(-L, L))
}

/// Resolve one immutable simultaneous group. Facts must already be key-sorted.
/// Every accumulator is applied once; the returned rows preserve that order.
pub fn resolve_group(
    colliders: &mut [GeneralizedCollider],
    contacts: &[ProposedContact],
    group_ordinal: u8,
) -> Result<Vec<ContactResolution>, ResolutionError> {
    let mut sums = Vec::with_capacity(colliders.len());
    let mut trial = Vec::with_capacity(colliders.len());
    let mut weights = Vec::with_capacity(contacts.len());
    let mut shares = Vec::with_capacity(contacts.len());
    let mut output = Vec::with_capacity(contacts.len());
    resolve_group_into(colliders, contacts, group_ordinal, &mut IndependentPointProjector,
        &mut sums, &mut trial, &mut weights, &mut shares, &mut output)?;
    Ok(output)
}

pub fn resolve_group_into<P: ContactTrialProjector>(
    colliders: &mut [GeneralizedCollider],
    contacts: &[ProposedContact],
    group_ordinal: u8,
    projector: &mut P,
    sums: &mut Vec<[i128; 3]>,
    trial_rows: &mut Vec<GeneralizedCollider>,
    weights: &mut Vec<u128>,
    shares: &mut Vec<u64>,
    output: &mut Vec<ContactResolution>,
) -> Result<(), ResolutionError> {
    let before = closure_energy(colliders)?;
    sums.clear();
    sums.resize(colliders.len(), [0i128; 3]);
    for contact in contacts {
        if contact.a_collider >= colliders.len() || contact.b_collider >= colliders.len() {
            return Err(ResolutionError::ColliderIndex);
        }
        add(&mut sums[contact.a_collider], contact.impulse_on_a);
        add(&mut sums[contact.b_collider], -contact.impulse_on_a);
    }

    projector.project(colliders, sums, 65_536, trial_rows)?;
    let full_energy = closure_energy(trial_rows)?;
    let alpha_raw = if full_energy <= before {
        65_536
    } else {
        let mut accepted = 0u32;
        for bit in (0..=15).rev() {
            let candidate = accepted | (1 << bit);
            projector.project(colliders, sums, candidate, trial_rows)?;
            if closure_energy(trial_rows)? <= before { accepted = candidate; }
        }
        accepted
    };
    projector.project(colliders, sums, alpha_raw, trial_rows)?;
    let after = closure_energy(trial_rows)?;
    debug_assert!(after <= before);
    colliders.copy_from_slice(trial_rows);
    let ledger = EnergyLedger { before_raw: before, after_raw: after, dissipated_raw: before - after };

    allocate_shares_into(ledger.dissipated_raw, contacts, alpha_raw, weights, shares)?;
    output.clear();
    for (contact, &share) in contacts.iter().zip(shares.iter()) {
        let on_a = scale_impulse(contact.impulse_on_a, alpha_raw);
        let (cut_raw, thrust_raw, pressure_raw) = match contact.channel {
            Some(channel) if contact.fact.key.kind == ContactKind::WeaponBody => channels(share, channel),
            _ => (0, 0, 0),
        };
        output.push(ContactResolution {
            group_ordinal,
            group_alpha_raw: alpha_raw,
            fact: contact.fact,
            impulse: ContactImpulse { key: contact.fact.key, on_a, on_b: -on_a },
            energy: ledger,
            cut_raw,
            thrust_raw,
            pressure_raw,
            deflected_raw: 0,
            severed: false,
        });
    }
    Ok(())
}

fn add(sum: &mut [i128; 3], value: Vec3) {
    sum[0] += value.x.raw() as i128;
    sum[1] += value.y.raw() as i128;
    sum[2] += value.z.raw() as i128;
}

fn scale_impulse(value: Vec3, alpha_raw: u32) -> Vec3 {
    let scale = |raw: i32| Fx::from_raw((raw as i128 * alpha_raw as i128 / 65_536) as i32);
    Vec3::new(scale(value.x.raw()), scale(value.y.raw()), scale(value.z.raw()))
}

fn allocate_shares_into(
    total: u64, contacts: &[ProposedContact], alpha_raw: u32,
    weights: &mut Vec<u128>, shares: &mut Vec<u64>,
) -> Result<(), ResolutionError> {
    weights.clear();
    for row in contacts {
        let applied = scale_impulse(row.impulse_on_a, alpha_raw);
        let normal = (-applied).dot(row.fact.normal).raw().max(0) as u128;
        let closing = (-(row.fact.velocity_b - row.fact.velocity_a).dot(row.fact.normal))
            .raw().max(0) as u128;
        weights.push(normal.checked_mul(closing).ok_or(ResolutionError::EnergyNumerator)?);
    }
    allocate_weighted_into(total, weights, shares)
}

pub fn allocate_weighted(total: u64, weights: &[u128]) -> Vec<u64> {
    let mut result = Vec::with_capacity(weights.len());
    allocate_weighted_into(total, weights, &mut result).expect("bounded contact weights");
    result
}

pub fn allocate_weighted_into(
    total: u64, weights: &[u128], result: &mut Vec<u64>,
) -> Result<(), ResolutionError> {
    let sum = weights.iter().try_fold(0u128, |sum, &weight| sum.checked_add(weight))
        .ok_or(ResolutionError::EnergyNumerator)?;
    result.clear();
    result.resize(weights.len(), 0);
    if sum == 0 { return Ok(()); }
    let last = weights.iter().rposition(|&weight| weight > 0).unwrap();
    let mut used = 0u64;
    for index in 0..last {
        if weights[index] == 0 { continue; }
        let product = (total as u128).checked_mul(weights[index]).ok_or(ResolutionError::EnergyNumerator)?;
        let share = (product / sum) as u64;
        result[index] = share;
        used = used.checked_add(share).ok_or(ResolutionError::EnergyNumerator)?;
    }
    result[last] = total - used;
    Ok(())
}

pub fn channels(share: u64, channel: WeaponBodyChannel) -> (u64, u64, u64) {
    if channel.zero_length { return (0, 0, share); }
    let axial = channel.weapon_relative_velocity.dot(channel.weapon_axis).max(Fx::ZERO);
    let axial_sq = axial.raw() as u128 * axial.raw() as u128;
    let velocity = channel.weapon_relative_velocity;
    let total_sq = velocity.x.raw() as i128 * velocity.x.raw() as i128
        + velocity.y.raw() as i128 * velocity.y.raw() as i128
        + velocity.z.raw() as i128 * velocity.z.raw() as i128;
    let transverse_sq = (total_sq - axial_sq as i128).max(0) as u128;
    let denominator = axial_sq + transverse_sq;
    if denominator == 0 { return (0, 0, share); }
    let available = share.saturating_sub(CONTACT_ENERGY_FLOOR);
    let thrust_base = available as u128 * axial_sq / denominator;
    let cut_base = available as u128 * transverse_sq / denominator;
    let thrust = (thrust_base * channel.point_factor.raw().max(0) as u128 / 65_536) as u64;
    let cut = (cut_base * channel.edge_factor.raw().max(0) as u128 / 65_536) as u64;
    (cut, thrust, share - cut - thrust)
}

#[derive(Default)]
pub struct ContactTickScratch {
    pub collection: ContactCollectionScratch,
    pub pose_collection: ContactCollectionScratch,
    generalized: Vec<GeneralizedCollider>,
    proposed: Vec<ProposedContact>,
    sums: Vec<[i128; 3]>,
    trial: Vec<GeneralizedCollider>,
    weights: Vec<u128>,
    shares: Vec<u64>,
    group_rows: Vec<ContactResolution>,
    pose_rows: Vec<ContactCollider>,
    old_velocities: Vec<Vec3>,
    predecessor: Vec<(ContactKey, Vec3)>,
    next_predecessor: Vec<(ContactKey, Vec3)>,
    closure_entities: Vec<EntityId>,
}

impl ContactTickScratch {
    pub fn reserve(&mut self, colliders: usize, candidates: usize, facts: usize) {
        self.collection.reserve(candidates, facts);
        self.pose_collection.reserve(candidates, facts);
        reserve(&mut self.generalized, colliders);
        reserve(&mut self.proposed, facts);
        reserve(&mut self.sums, colliders);
        reserve(&mut self.trial, colliders);
        reserve(&mut self.weights, facts);
        reserve(&mut self.shares, facts);
        reserve(&mut self.group_rows, facts);
        reserve(&mut self.pose_rows, colliders);
        reserve(&mut self.old_velocities, colliders);
        reserve(&mut self.predecessor, facts);
        reserve(&mut self.next_predecessor, facts);
        reserve(&mut self.closure_entities, colliders);
    }
}

fn reserve<T>(rows: &mut Vec<T>, capacity: usize) {
    if rows.capacity() < capacity { rows.reserve(capacity - rows.capacity()); }
}

/// Pure multi-group driver over explicit collider trajectories. World supplies
/// rows and retained scratch; the driver performs no authoritative allocation
/// when those capacities were reserved for the high-water bound.
pub fn solve_contact_tick(
    colliders: &mut [ContactCollider],
    state: &mut ContactSolverState,
    resolutions: &mut Vec<ContactResolution>,
    scratch: &mut ContactTickScratch,
) -> Result<u8, ResolutionError> {
    resolutions.clear();
    scratch.predecessor.clear();
    let mut global = 0u32;
    let mut groups = 0u8;

    loop {
        collect_contacts_into(colliders, &mut scratch.collection);
        scratch.collection.facts.retain(|fact| !suppressed(fact, &scratch.predecessor));
        let Some(local) = scratch.collection.facts.iter().map(|fact| fact.toi.get().raw() as u32).min() else {
            finish_all(colliders);
            return Ok(groups);
        };
        if groups == MAX_CONTACT_GROUPS_PER_TICK {
            cap_closure(colliders, &scratch.collection.facts, state, &mut scratch.closure_entities);
            return Ok(groups);
        }
        let time = map_local_to_global(global, local);
        advance_all(colliders, time - global, 65_536 - global);

        scratch.pose_rows.clear();
        scratch.pose_rows.extend(colliders.iter().copied().map(freeze_sweep));
        collect_contacts_into(&scratch.pose_rows, &mut scratch.pose_collection);
        scratch.pose_collection.facts.retain(|fact| {
            fact.toi.get() == Fx::ZERO && !suppressed(fact, &scratch.predecessor)
        });
        for fact in &mut scratch.pose_collection.facts {
            fact.toi = fx::TimeOfImpact::new_clamped(Fx::from_raw(time as i32));
        }
        if scratch.pose_collection.facts.is_empty() {
            // Geometry's conservative answer may be one raw unit outside exact
            // overlap. Keep the equal earliest candidates it certified.
            scratch.pose_collection.facts.extend(
                scratch.collection.facts.iter().copied()
                    .filter(|fact| fact.toi.get().raw() as u32 == local)
            );
            for fact in &mut scratch.pose_collection.facts {
                fact.toi = fx::TimeOfImpact::new_clamped(Fx::from_raw(time as i32));
            }
        }
        scratch.pose_collection.facts.sort_by_key(|fact| fact.key);
        scratch.pose_collection.facts.dedup_by_key(|fact| fact.key);

        scratch.generalized.clear();
        scratch.generalized.extend(colliders.iter().map(|row| GeneralizedCollider {
            entity: row.entity, slot: row.slot,
            kind: if matches!(row.shape, ContactShape::Body { .. }) { GeneralizedKind::Body } else { GeneralizedKind::Equipment },
            mass: row.mass, velocity: row.velocity,
        }));
        scratch.proposed.clear();
        for &fact in &scratch.pose_collection.facts {
            let a = collider_index(colliders, fact.key.a, fact.key.a_slot).ok_or(ResolutionError::ColliderIndex)?;
            let b = collider_index(colliders, fact.key.b, fact.key.b_slot).ok_or(ResolutionError::ColliderIndex)?;
            let impulse_on_a = proposed_impulse(
                colliders[a].mass, colliders[b].mass, colliders[a].surface, colliders[b].surface,
                fact.velocity_a, fact.velocity_b, fact.normal,
            );
            let channel = if fact.key.kind == ContactKind::WeaponBody {
                Some(weapon_body_channel(colliders[a], colliders[b]))
            } else { None };
            scratch.proposed.push(ProposedContact { fact, a_collider: a, b_collider: b, impulse_on_a, channel });
        }
        scratch.old_velocities.clear();
        scratch.old_velocities.extend(colliders.iter().map(|row| row.velocity));
        resolve_group_into(
            &mut scratch.generalized, &scratch.proposed, groups, &mut IndependentPointProjector,
            &mut scratch.sums, &mut scratch.trial, &mut scratch.weights, &mut scratch.shares,
            &mut scratch.group_rows,
        )?;
        for (row, generalized) in colliders.iter_mut().zip(&scratch.generalized) {
            row.velocity = generalized.velocity;
        }
        let remaining = 65_536 - time;
        for ((row, &old), generalized) in colliders.iter_mut().zip(&scratch.old_velocities).zip(&scratch.generalized) {
            translate_requested(row, scale_raw(generalized.velocity - old, remaining, 65_536));
        }
        resolutions.extend_from_slice(&scratch.group_rows);
        scratch.next_predecessor.clear();
        scratch.next_predecessor.extend(scratch.pose_collection.facts.iter().map(|fact| (fact.key, fact.normal)));
        core::mem::swap(&mut scratch.predecessor, &mut scratch.next_predecessor);
        global = time;
        groups += 1;
    }
}

fn suppressed(fact: &ContactFact, predecessor: &[(ContactKey, Vec3)]) -> bool {
    if fact.toi.get() != Fx::ZERO { return false; }
    predecessor.binary_search_by_key(&fact.key, |row| row.0).ok()
        .map(|index| (fact.velocity_b - fact.velocity_a).dot(predecessor[index].1) >= Fx::ZERO)
        .unwrap_or(false)
}

fn collider_index(rows: &[ContactCollider], entity: EntityId, slot: u8) -> Option<usize> {
    rows.iter().position(|row| row.entity == entity &&
        if slot == BODY_SLOT { matches!(row.shape, ContactShape::Body { .. }) } else { row.slot == slot })
}

fn weapon_body_channel(weapon: ContactCollider, body: ContactCollider) -> WeaponBodyChannel {
    let (axis, zero_length) = match weapon.shape {
        ContactShape::Segment { previous_hilt, previous_tip, .. } => {
            let delta = previous_tip - previous_hilt;
            (delta.normalized_or_zero(), delta == Vec3::ZERO)
        }
        _ => (Vec3::ZERO, true),
    };
    WeaponBodyChannel { weapon_axis: axis, weapon_relative_velocity: weapon.velocity - body.velocity,
                        edge_factor: weapon.surface.edge_factor, point_factor: weapon.surface.point_factor,
                        zero_length }
}

fn freeze_sweep(mut row: ContactCollider) -> ContactCollider {
    row.shape = match row.shape {
        ContactShape::Segment { previous_hilt, previous_tip, radius, .. } => ContactShape::Segment {
            previous_hilt, previous_tip, requested_hilt: previous_hilt, requested_tip: previous_tip, radius,
        },
        ContactShape::Shield { previous, .. } => ContactShape::Shield { previous, requested: previous },
        ContactShape::Body { previous_lower, previous_upper, radius, .. } => ContactShape::Body {
            previous_lower, previous_upper, requested_lower: previous_lower, requested_upper: previous_upper, radius,
        },
    };
    row
}

fn advance_all(rows: &mut [ContactCollider], numerator: u32, denominator: u32) {
    for row in rows { advance_shape(&mut row.shape, numerator, denominator); }
}

fn advance_shape(shape: &mut ContactShape, numerator: u32, denominator: u32) {
    match shape {
        ContactShape::Segment { previous_hilt, previous_tip, requested_hilt, requested_tip, .. } => {
            *previous_hilt = interpolate_raw(*previous_hilt, *requested_hilt, numerator, denominator);
            *previous_tip = interpolate_raw(*previous_tip, *requested_tip, numerator, denominator);
        }
        ContactShape::Shield { previous, requested } => {
            for i in 0..4 { previous[i] = interpolate_raw(previous[i], requested[i], numerator, denominator); }
        }
        ContactShape::Body { previous_lower, previous_upper, requested_lower, requested_upper, .. } => {
            *previous_lower = interpolate_raw(*previous_lower, *requested_lower, numerator, denominator);
            *previous_upper = interpolate_raw(*previous_upper, *requested_upper, numerator, denominator);
        }
    }
}

fn interpolate_raw(a: Vec3, b: Vec3, numerator: u32, denominator: u32) -> Vec3 {
    if denominator == 0 { return b; }
    let component = |a: Fx, b: Fx| {
        let delta = b.raw() as i128 - a.raw() as i128;
        Fx::from_raw((a.raw() as i128 + delta * numerator as i128 / denominator as i128) as i32)
    };
    Vec3::new(component(a.x, b.x), component(a.y, b.y), component(a.z, b.z))
}

fn scale_raw(value: Vec3, numerator: u32, denominator: u32) -> Vec3 {
    let component = |value: Fx| Fx::from_raw((value.raw() as i128 * numerator as i128 / denominator as i128) as i32);
    Vec3::new(component(value.x), component(value.y), component(value.z))
}

fn translate_requested(row: &mut ContactCollider, delta: Vec3) {
    match &mut row.shape {
        ContactShape::Segment { requested_hilt, requested_tip, .. } => { *requested_hilt += delta; *requested_tip += delta; }
        ContactShape::Shield { requested, .. } => for point in requested { *point += delta; },
        ContactShape::Body { requested_lower, requested_upper, .. } => { *requested_lower += delta; *requested_upper += delta; }
    }
}

fn finish_all(rows: &mut [ContactCollider]) {
    for row in rows { advance_shape(&mut row.shape, 1, 1); }
}

fn cap_closure(
    rows: &mut [ContactCollider], facts: &[ContactFact], state: &mut ContactSolverState,
    closure_entities: &mut Vec<EntityId>,
) {
    closure_entities.clear();
    for fact in facts {
        if !closure_entities.contains(&fact.key.a) { closure_entities.push(fact.key.a); }
        if !closure_entities.contains(&fact.key.b) { closure_entities.push(fact.key.b); }
    }
    for row in rows {
        if closure_entities.contains(&row.entity) {
            row.velocity = Vec3::ZERO;
            row.shape = freeze_sweep(*row).shape;
        } else {
            advance_shape(&mut row.shape, 1, 1);
        }
    }
    state.cap_hits = state.cap_hits.saturating_add(1);
}

pub fn serialize_contact_corpus(ticks: &[(u32, &[ContactResolution], u32)]) -> Vec<u8> {
    let mut bytes = b"ARPG-CONTACT-V1".to_vec();
    for &(tick, rows, cap_hits) in ticks {
        put_u32(&mut bytes, tick);
        put_u32(&mut bytes, rows.len() as u32);
        put_u32(&mut bytes, if rows.is_empty() { 0 } else { 1 });
        put_u32(&mut bytes, rows.len() as u32);
        put_u32(&mut bytes, if rows.is_empty() { 0 } else { 1 });
        for row in rows { write_fact(&mut bytes, row.fact); }
        for row in rows { write_impulse(&mut bytes, row.impulse); }
        if let Some(row) = rows.first() {
            put_u64(&mut bytes, row.energy.before_raw);
            put_u64(&mut bytes, row.energy.after_raw);
            put_u64(&mut bytes, row.energy.dissipated_raw);
        }
        put_u32(&mut bytes, cap_hits);
    }
    bytes
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::combat::contact::{BODY_SLOT, ContactKey};
    use crate::combat::spec::Material;
    use crate::EntityId;
    use fx::{Hash64, TimeOfImpact};

    fn surface(restitution: Fx) -> SurfaceSpec {
        SurfaceSpec { restitution, friction: Fx::ZERO, edge_factor: Fx::ONE,
                      point_factor: Fx::ONE, material: Material::Steel }
    }

    fn state(index: u32, velocity: Vec3) -> GeneralizedCollider {
        GeneralizedCollider { entity: EntityId::new(index, 0), slot: 1,
            kind: GeneralizedKind::Equipment, mass: Fx::ONE, velocity }
    }

    fn fact(a: u32, b: u32, kind: ContactKind, toi: i32, va: i32, vb: i32) -> ContactFact {
        ContactFact {
            key: ContactKey { a: EntityId::new(a, 0), a_slot: 1,
                              b: EntityId::new(b, 0), b_slot: if kind == ContactKind::WeaponBody { BODY_SLOT } else { 1 }, kind },
            toi: TimeOfImpact::new_clamped(Fx::from_raw(toi)), region: 0xff,
            point: Vec3::new(Fx::from_raw(toi), Fx::ZERO, Fx::ZERO), normal: Vec3::X,
            velocity_a: Vec3::new(Fx::from_raw(va), Fx::ZERO, Fx::ZERO),
            velocity_b: Vec3::new(Fx::from_raw(vb), Fx::ZERO, Fx::ZERO),
        }
    }

    fn proposed(fact: ContactFact, a: usize, b: usize, restitution: Fx) -> ProposedContact {
        ProposedContact { fact, a_collider: a, b_collider: b,
            impulse_on_a: proposed_impulse(Fx::ONE, Fx::ONE, surface(restitution), surface(restitution),
                                           fact.velocity_a, fact.velocity_b, fact.normal), channel: None }
    }

    #[test]
    fn a_true_simultaneous_group_uses_one_pre_group_state() {
        let mut states = [
            state(0, Vec3::X), state(1, Vec3::ZERO), state(2, Vec3::ZERO),
        ];
        let contacts = [proposed(fact(0, 1, ContactKind::WeaponWeapon, 16_384, 65_536, 0), 0, 1, Fx::ZERO),
                        proposed(fact(0, 2, ContactKind::WeaponWeapon, 16_384, 65_536, 0), 0, 2, Fx::ZERO)];
        let rows = resolve_group(&mut states, &contacts, 0).unwrap();
        assert_eq!((rows[0].energy.before_raw, rows[0].energy.after_raw, rows[0].energy.dissipated_raw), (32_768, 16_384, 16_384));
        assert_eq!(states.iter().map(|s| s.velocity.x.raw()).collect::<Vec<_>>(), vec![0, 32_768, 32_768]);
    }

    #[test]
    fn shared_limb_group_energy_is_clamped_as_one_system() {
        let mut states = [
            state(0, Vec3::X), state(1, Vec3::ZERO), state(2, Vec3::ZERO),
        ];
        let contacts = [proposed(fact(0, 1, ContactKind::WeaponWeapon, 16_384, 65_536, 0), 0, 1, Fx::ONE),
                        proposed(fact(0, 2, ContactKind::WeaponWeapon, 16_384, 65_536, 0), 0, 2, Fx::ONE)];
        let rows = resolve_group(&mut states, &contacts, 0).unwrap();
        assert_eq!(rows[0].group_alpha_raw, 43_691);
        assert_eq!((rows[0].energy.before_raw, rows[0].energy.after_raw), (32_768, 32_768));
        assert_eq!(states.iter().map(|s| s.velocity.x.raw()).collect::<Vec<_>>(), vec![-21_846, 43_691, 43_691]);
    }

    #[test]
    fn the_greedy_alpha_keeps_only_individually_valid_bits() {
        let mut states = [state(0, Vec3::X), state(1, Vec3::ZERO), state(2, Vec3::ZERO)];
        let contacts = [proposed(fact(0, 1, ContactKind::WeaponWeapon, 0, 65_536, 0), 0, 1, Fx::ONE),
                        proposed(fact(0, 2, ContactKind::WeaponWeapon, 0, 65_536, 0), 0, 2, Fx::ONE)];
        assert_eq!(resolve_group(&mut states, &contacts, 0).unwrap()[0].group_alpha_raw, 43_691);
    }

    #[test]
    fn group_energy_accumulation_never_saturates() {
        let rows = vec![GeneralizedCollider { entity: EntityId::new(0, 0), slot: 1,
            kind: GeneralizedKind::Equipment, mass: Fx::from_int(8),
            velocity: Vec3::from_ints(4, 4, 4) }; 192];
        let numerator: i128 = rows.iter().map(|row| row.mass.raw() as i128 *
            (row.velocity.x.raw() as i128 * row.velocity.x.raw() as i128 * 3)).sum();
        assert_eq!(numerator, 20_752_587_082_923_245_568);
        assert_eq!(closure_energy(&rows), Ok(2_415_919_104));
    }

    #[test]
    fn contact_resolution_channels_do_not_narrow() {
        let total = u64::from(u32::MAX) + 1;
        assert_eq!(allocate_weighted(total, &[1]), vec![total]);
        let row = WeaponBodyChannel { weapon_axis: Vec3::X, weapon_relative_velocity: Vec3::ZERO,
                                      edge_factor: Fx::ONE, point_factor: Fx::ONE, zero_length: true };
        assert_eq!(channels(total, row), (0, 0, total));
    }

    #[test]
    fn transverse_motion_records_cut_and_axial_motion_records_thrust() {
        let transverse = WeaponBodyChannel { weapon_axis: Vec3::X, weapon_relative_velocity: Vec3::Y,
                                             edge_factor: Fx::ONE, point_factor: Fx::ONE, zero_length: false };
        let axial = WeaponBodyChannel { weapon_axis: Vec3::X, weapon_relative_velocity: Vec3::X,
                                       ..transverse };
        let (cut, thrust, _) = channels(16_384, transverse);
        assert!(cut > thrust);
        let (cut, thrust, _) = channels(16_384, axial);
        assert!(thrust > cut);
    }

    #[test]
    fn the_contact_corpus_has_a_documented_byte_order() {
        let zero = EnergyLedger::default();
        let mut all = Vec::new();
        for (tick, kind) in [ContactKind::WeaponWeapon, ContactKind::WeaponShield, ContactKind::WeaponBody].into_iter().enumerate() {
            let base = fact(0, 1, kind, 0, 0, 0);
            let f = ContactFact {
                key: ContactKey {
                    b_slot: match kind { ContactKind::WeaponShield => 0, ContactKind::WeaponBody => BODY_SLOT, _ => 1 },
                    ..base.key
                },
                region: if kind == ContactKind::WeaponBody { 1 } else { 0xff },
                point: Vec3::Z,
                ..base
            };
            let row = ContactResolution { group_ordinal: 0, group_alpha_raw: 65_536, fact: f,
                impulse: ContactImpulse { key: f.key, on_a: Vec3::ZERO, on_b: Vec3::ZERO }, energy: zero,
                cut_raw: 0, thrust_raw: 0, pressure_raw: 0, deflected_raw: 0, severed: false };
            all.push((tick as u32 + 1, row));
        }
        let ticks = [(0, &[][..], 0), (all[0].0, core::slice::from_ref(&all[0].1), 0),
                     (all[1].0, core::slice::from_ref(&all[1].1), 0),
                     (all[2].0, core::slice::from_ref(&all[2].1), 0)];
        let bytes = serialize_contact_corpus(&ticks);
        let mut hash = Hash64::new(); hash.write_bytes(&bytes);
        assert_eq!(bytes.len(), 591);
        assert_eq!(hash.finish(), 0x1adf_a9e0_1e36_edf9);
    }
}
