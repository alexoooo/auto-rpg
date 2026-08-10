//! Pure coupled impulse resolution for articulated contact groups.
//!
//! World integration supplies generalized collider rows and commits the result.
//! This module deliberately knows nothing about world columns or scheduling.

use crate::combat::contact::{
    contact_at_pose, map_local_to_global, put_u32, put_u64, scan_candidates_into,
    try_reserve_exact, write_fact, write_impulse, Candidate, ContactCapacityError,
    ContactCollectionScratch, ContactCollider, ContactFact,
    ContactImpulse, ContactKey, ContactKind, ContactResolution, ContactShape, ContactSolverState,
    EnergyLedger, RegionSweep, BODY_SLOT, MAX_CONTACT_FACTS_PER_GROUP, MAX_CONTACT_GROUPS_PER_TICK,
    MAX_CONTACT_RESOLUTIONS_PER_TICK,
};
use crate::combat::spec::{AnatomyRegion, SurfaceSpec};
use crate::{EntityId, Faction};
use fx::{Fx, TimeOfImpact, Vec3};

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
pub enum ResolutionError {
    ColliderIndex, EnergyNumerator, ResolutionCount, Mass, Projector, DuplicateIdentity,
}

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
        // Checked here as well as in the projector, so that a non-positive mass
        // reports what it is from whichever side reaches it first. `Fx::MIN`
        // otherwise drove the numerator negative and came back as an energy
        // overflow, while `-1` came back as `Mass` -- one defect, two names.
        if row.mass <= Fx::ZERO { return Err(ResolutionError::Mass); }
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

/// The exact applied raw delta for one accumulator component. Shared with
/// `World`'s coupled projector rather than re-spelled there: the alpha and mass
/// fixed-point scales cancel with no extra factor of 65,536, and two copies of
/// that arithmetic is two chances to grow one.
pub(crate) fn scaled_delta(sum: [i128; 3], alpha_raw: u32, mass_raw: i32) -> Vec3 {
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
    ///
    /// `out` must end up the same length as `before`, row for row: the greedy
    /// alpha search calls this up to eighteen times per group and treats the
    /// last call as authoritative, so a projector that dropped or added a row
    /// would silently re-index the closure. `resolve_group_into` checks rather
    /// than trusts, because the interesting implementation is World's and it
    /// runs a joint clamp that can fail.
    fn project(
        &mut self,
        before: &[GeneralizedCollider],
        sums: &[[i128; 3]],
        alpha_raw: u32,
        out: &mut Vec<GeneralizedCollider>,
    ) -> Result<(), ResolutionError>;
    /// Apply one resolved group to whatever authoritative state the *next*
    /// re-sweep has to see, and finish the group's rows.
    ///
    /// This is where wounds land. It is a hook rather than a pass after the
    /// driver returns because severance has to reach the geometry inside the
    /// tick: an arm taken off by the first group must not still be swinging in
    /// the second, and the second group's candidate scan is three lines below
    /// this call. `rows` is handed over mutably for the same reason -- the
    /// deflected budget and the severance flag are facts about what the wound
    /// did, and only the implementation that applies the wound knows them.
    ///
    /// The default does nothing, which is exactly right for a fixture with no
    /// anatomy behind its colliders: the pure driver stays pure.
    fn after_group(
        &mut self,
        _colliders: &mut [ContactCollider],
        _rows: &mut [ContactResolution],
    ) -> Result<(), ResolutionError> {
        Ok(())
    }
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
            // Not merely a bad ledger: `scaled_delta` divides by this.
            if row.mass <= Fx::ZERO { return Err(ResolutionError::Mass); }
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
    // `after <= before` is the whole point of the alpha search, and alpha zero
    // always satisfies it, so a violation is a broken projector rather than a
    // hard input. Say so with an error instead of a release-mode subtraction
    // that would wrap, or a `copy_from_slice` that would panic on a short row.
    if trial_rows.len() != colliders.len() || after > before {
        return Err(ResolutionError::Projector);
    }
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
    // `thrust_base + cut_base` is at most `available`, so `share - cut - thrust`
    // cannot underflow while both factors are at most one. `validate_surface`
    // guarantees that for every spec-built surface, but this function is public
    // and takes a raw `SurfaceSpec`, so the bound is enforced here rather than
    // assumed -- an above-one factor would otherwise panic on the subtraction,
    // in release too, since the workspace keeps overflow checks on.
    let factor = |value: Fx| value.raw().clamp(0, 65_536) as u128;
    let thrust = (thrust_base * factor(channel.point_factor) / 65_536) as u64;
    let cut = (cut_base * factor(channel.edge_factor) / 65_536) as u64;
    (cut, thrust, share - cut - thrust)
}

#[derive(Clone, Default)]
pub struct ContactTickScratch {
    collection: ContactCollectionScratch,
    group_facts: Vec<ContactFact>,
    closure_entities: Vec<EntityId>,
    closure_rows: Vec<usize>,
    generalized: Vec<GeneralizedCollider>,
    proposed: Vec<ProposedContact>,
    sums: Vec<[i128; 3]>,
    trial: Vec<GeneralizedCollider>,
    weights: Vec<u128>,
    shares: Vec<u64>,
    group_rows: Vec<ContactResolution>,
    old_velocities: Vec<Vec3>,
    suppressed: Vec<Resolved>,
    capped_entities: Vec<EntityId>,
}

impl ContactTickScratch {
    /// `collider_bound` is `n*3` and `candidate_bound` is `pairs*16` for the
    /// allocated-slot high water `n`. Every other bound in here is a frozen
    /// constant rather than the caller's to choose, so it is not a parameter:
    /// a caller that could pass a small fact bound could make the driver
    /// reallocate inside a tick, which is the one thing this reservation buys.
    pub fn try_reserve(
        &mut self, collider_bound: usize, candidate_bound: usize,
    ) -> Result<(), ContactCapacityError> {
        self.collection.try_reserve(candidate_bound)?;
        try_reserve_exact(&mut self.group_facts, MAX_CONTACT_FACTS_PER_GROUP)?;
        try_reserve_exact(&mut self.closure_entities, collider_bound)?;
        try_reserve_exact(&mut self.closure_rows, collider_bound)?;
        try_reserve_exact(&mut self.generalized, collider_bound)?;
        try_reserve_exact(&mut self.proposed, MAX_CONTACT_FACTS_PER_GROUP)?;
        // The contract reserves accumulators at the fact bound, but they are
        // sized to the closure, so honour whichever is larger: the two bounds
        // are independent and only happen to be ordered at today's ceiling.
        try_reserve_exact(&mut self.sums, MAX_CONTACT_FACTS_PER_GROUP.max(collider_bound))?;
        try_reserve_exact(&mut self.trial, collider_bound)?;
        try_reserve_exact(&mut self.weights, MAX_CONTACT_FACTS_PER_GROUP)?;
        try_reserve_exact(&mut self.shares, MAX_CONTACT_FACTS_PER_GROUP)?;
        try_reserve_exact(&mut self.group_rows, MAX_CONTACT_FACTS_PER_GROUP)?;
        try_reserve_exact(&mut self.old_velocities, collider_bound)?;
        try_reserve_exact(&mut self.suppressed, candidate_bound)?;
        try_reserve_exact(&mut self.capped_entities, collider_bound)?;
        Ok(())
    }

    /// The infallible form, for callers holding their own scratch who would
    /// have nothing useful to do with the failure. `World` uses the fallible
    /// one: its caller is a browser that has already handed a page typed-array
    /// views into linear memory, and aborting there blanks the screen.
    pub fn reserve(&mut self, collider_bound: usize, candidate_bound: usize) {
        self.try_reserve(collider_bound, candidate_bound).expect("contact scratch reservation");
    }

    /// The entities the iteration cap froze on the last solved tick, in the
    /// order the closure discovered them. World needs this to zero the arm
    /// scalar speeds and mirror `Both`, neither of which a collider row can
    /// express.
    pub fn capped_entities(&self) -> &[EntityId] { &self.capped_entities }

    /// Every retained capacity, so a test can prove a solved tick grew none of
    /// them. Capacity is not state, which is why this is not public.
    #[cfg(test)]
    pub(crate) fn capacities(&self) -> Vec<usize> {
        vec![
            self.collection.candidate_capacity(),
            self.group_facts.capacity(), self.closure_entities.capacity(),
            self.closure_rows.capacity(), self.generalized.capacity(),
            self.proposed.capacity(), self.sums.capacity(), self.trial.capacity(),
            self.weights.capacity(), self.shares.capacity(), self.group_rows.capacity(),
            self.old_velocities.capacity(), self.suppressed.capacity(),
            self.capped_entities.capacity(),
        ]
    }
}

/// Pure multi-group driver over explicit collider trajectories. World supplies
/// rows, the projector that knows how a body delta reaches its held equipment,
/// and retained scratch; the driver performs no authoritative allocation when
/// those capacities were reserved for the high-water bound.
pub fn solve_contact_tick<P: ContactTrialProjector>(
    colliders: &mut [ContactCollider],
    projector: &mut P,
    state: &mut ContactSolverState,
    resolutions: &mut Vec<ContactResolution>,
    scratch: &mut ContactTickScratch,
) -> Result<u8, ResolutionError> {
    // Identity is the full `(EntityId, LimbSlot)` pair, and this is checked in
    // release rather than merely asserted in debug. A duplicated row makes the
    // index lookups resolve a candidate onto whichever row is found first, so
    // the impulse lands on the wrong collider while its twin sits unmoved -- and
    // since the candidate scan sorts in place, "found first" then depends on the
    // sort's handling of equal keys, which turns a silently wrong answer into a
    // silently *nondeterministic* one. Measured: 13 of 24 row permutations of a
    // three-row duplicate fixture disagreed. The in-place sort's soundness
    // argument is exactly this precondition, so the precondition cannot be
    // debug-only. `n` is at most 192 and the pair scan below is already
    // quadratic with geometry in the inner loop, so this costs nothing worth
    // measuring.
    for i in 0..colliders.len() {
        for j in i + 1..colliders.len() {
            if colliders[i].entity == colliders[j].entity && colliders[i].slot == colliders[j].slot {
                return Err(ResolutionError::DuplicateIdentity);
            }
        }
    }
    resolutions.clear();
    scratch.suppressed.clear();
    scratch.capped_entities.clear();
    let mut global = 0u32;
    let mut groups = 0u8;

    loop {
        scan_candidates_into(colliders, &mut scratch.collection);
        forget_closing_keys(&mut scratch.suppressed, scratch.collection.candidates());

        let Some(time) = earliest_group_time(global, scratch.collection.candidates(), &scratch.suppressed)
        else {
            finish_all(colliders);
            return Ok(groups);
        };

        // Counting before the advance is what makes the overflow rule's
        // "restore the tentative pose" unnecessary rather than merely undone:
        // the pose has not left the last-safe `g` yet. Membership is mapped-time
        // equality, and the map is many-to-one, so distinct local fractions that
        // land on one global time are simultaneous -- which is what the contract
        // asks for and what a test on local equality would miss.
        let members = count_group_members(
            global, time, scratch.collection.candidates(), &scratch.suppressed)?;

        // No ordinal left, or a simultaneous set too large to resolve as one
        // system. Neither is truncation: no prefix of a group is privileged.
        if groups == MAX_CONTACT_GROUPS_PER_TICK || members > MAX_CONTACT_FACTS_PER_GROUP {
            cap_at_last_safe_pose(colliders, global, time, scratch, state);
            return Ok(groups);
        }

        advance_all(colliders, time - global, 65_536 - global);

        let group_toi = TimeOfImpact::new_clamped(Fx::from_raw(time as i32));
        scratch.group_facts.clear();
        for index in 0..scratch.collection.candidates().len() {
            let fact = scratch.collection.candidates()[index].fact;
            if suppressed(&fact, global, &scratch.suppressed) { continue; }
            if map_local_to_global(global, fact.toi.get().raw() as u32) != time { continue; }
            let a = collider_index(colliders, fact.key.a, fact.key.a_slot)
                .ok_or(ResolutionError::ColliderIndex)?;
            let b = collider_index(colliders, fact.key.b, fact.key.b_slot)
                .ok_or(ResolutionError::ColliderIndex)?;
            if let Some(recomputed) = contact_at_pose(&colliders[a], &colliders[b], group_toi) {
                scratch.group_facts.push(recomputed);
            }
        }
        // Unstable for the same reason as the candidate scan: one member per
        // key, so the key is a strict total order and the stable sort would only
        // buy a heap allocation the driver is not allowed to make.
        scratch.group_facts.sort_unstable_by_key(|fact| fact.key);
        scratch.group_facts.dedup_by_key(|fact| fact.key);

        // Whole-entity closure. A body impulse drags every collider that body
        // holds, so that equipment's kinetic energy has to be inside the ledger
        // even when it carries no fact of its own -- otherwise the group could
        // "pay" for its own energy gain out of a bystander's clamp. Rows
        // outside the closure are neither measured nor moved.
        scratch.closure_entities.clear();
        for fact in &scratch.group_facts {
            push_unique(&mut scratch.closure_entities, fact.key.a);
            push_unique(&mut scratch.closure_entities, fact.key.b);
        }
        scratch.closure_rows.clear();
        for (index, row) in colliders.iter().enumerate() {
            if scratch.closure_entities.contains(&row.entity) { scratch.closure_rows.push(index); }
        }

        scratch.generalized.clear();
        for &index in &scratch.closure_rows {
            let row = colliders[index];
            scratch.generalized.push(GeneralizedCollider {
                entity: row.entity, slot: row.slot,
                kind: if matches!(row.shape, ContactShape::Body { .. }) { GeneralizedKind::Body }
                      else { GeneralizedKind::Equipment },
                mass: row.mass, velocity: row.velocity,
            });
        }

        scratch.proposed.clear();
        for index in 0..scratch.group_facts.len() {
            let fact = scratch.group_facts[index];
            let a = closure_index(&scratch.generalized, fact.key.a, fact.key.a_slot)
                .ok_or(ResolutionError::ColliderIndex)?;
            let b = closure_index(&scratch.generalized, fact.key.b, fact.key.b_slot)
                .ok_or(ResolutionError::ColliderIndex)?;
            let (row_a, row_b) = (colliders[scratch.closure_rows[a]], colliders[scratch.closure_rows[b]]);
            let impulse_on_a = proposed_impulse(
                row_a.mass, row_b.mass, row_a.surface, row_b.surface,
                fact.velocity_a, fact.velocity_b, fact.normal,
            );
            let channel = if fact.key.kind == ContactKind::WeaponBody {
                Some(weapon_body_channel(row_a, row_b))
            } else { None };
            scratch.proposed.push(ProposedContact { fact, a_collider: a, b_collider: b, impulse_on_a, channel });
        }

        scratch.old_velocities.clear();
        for &index in &scratch.closure_rows { scratch.old_velocities.push(colliders[index].velocity); }

        resolve_group_into(
            &mut scratch.generalized, &scratch.proposed, groups, projector,
            &mut scratch.sums, &mut scratch.trial, &mut scratch.weights, &mut scratch.shares,
            &mut scratch.group_rows,
        )?;

        // The contract's parenthesization is `delta * (65_536-t)/65_536` in
        // saturated Fx, and Fx multiplication floors. A truncate-toward-zero
        // helper agrees on every positive delta and disagrees by one raw unit
        // on negative ones, which is exactly the byte the behavioral corpus
        // pins in case 2.
        let remaining = Fx::from_raw((65_536 - time) as i32);
        for ((&index, &old), generalized) in scratch.closure_rows.iter()
            .zip(&scratch.old_velocities).zip(&scratch.generalized) {
            translate_requested(&mut colliders[index], (generalized.velocity - old) * remaining);
            colliders[index].velocity = generalized.velocity;
        }

        // The group is settled: hand it to the projector before the next scan
        // sees the colliders, so a severance can take an arm out of the tick it
        // happened in rather than the one after.
        projector.after_group(colliders, &mut scratch.group_rows)?;

        // Eight groups of at most 512 rows fit the 4,096 ceiling exactly, so
        // this is an invariant rather than a live limit -- and it is checked
        // rather than assumed, because a silent reallocation here is precisely
        // what the browser no-growth proof would fail to see.
        if resolutions.len().saturating_add(scratch.group_rows.len()) > MAX_CONTACT_RESOLUTIONS_PER_TICK {
            return Err(ResolutionError::ResolutionCount);
        }
        resolutions.extend_from_slice(&scratch.group_rows);

        // Record against the velocities the group actually left behind, not the
        // pre-group ones the fact carries.
        for index in 0..scratch.group_facts.len() {
            let fact = scratch.group_facts[index];
            let a = collider_index(colliders, fact.key.a, fact.key.a_slot)
                .ok_or(ResolutionError::ColliderIndex)?;
            let b = collider_index(colliders, fact.key.b, fact.key.b_slot)
                .ok_or(ResolutionError::ColliderIndex)?;
            remember_resolved(&mut scratch.suppressed, Resolved {
                key: fact.key, global: time, normal: fact.normal,
                relative_velocity: colliders[b].velocity - colliders[a].velocity,
            });
        }
        global = time;
        groups += 1;
    }
}

/// The earliest global time any unsuppressed candidate maps onto.
fn earliest_group_time(
    global: u32, candidates: &[Candidate], resolved: &[Resolved],
) -> Option<u32> {
    candidates.iter()
        .filter(|candidate| !suppressed(&candidate.fact, global, resolved))
        .map(|candidate| map_local_to_global(global, candidate.fact.toi.get().raw() as u32))
        .min()
}

fn count_group_members(
    global: u32, time: u32, candidates: &[Candidate], resolved: &[Resolved],
) -> Result<usize, ResolutionError> {
    let mut members = 0usize;
    for candidate in candidates {
        if suppressed(&candidate.fact, global, resolved) { continue; }
        if map_local_to_global(global, candidate.fact.toi.get().raw() as u32) != time { continue; }
        members = members.checked_add(1).ok_or(ResolutionError::ResolutionCount)?;
    }
    Ok(members)
}

/// One key already resolved: the global time it resolved at, the normal it
/// resolved on, and the relative velocity it was left with.
#[derive(Clone, Copy)]
struct Resolved { key: ContactKey, global: u32, normal: Vec3, relative_velocity: Vec3 }

/// Zero-time suppression, remembered for the whole tick rather than for one
/// group. A pair that has come to rest against itself stays at the same point
/// and re-sweeps at local zero every group thereafter; if an unrelated group
/// could clear the memory, the pair would resolve again, burn an ordinal, and
/// drive the tick into a spurious cap.
///
/// Two conditions retire a repeat, and the second is not optional. The stored
/// normal is what makes the first survivable at a coincident point --
/// recomputing the degenerate velocity-derived normal after a bounce would flip
/// it and call a separating pair closing.
fn suppressed(fact: &ContactFact, global: u32, resolved: &[Resolved]) -> bool {
    if fact.toi.get() != Fx::ZERO { return false; }
    let Ok(index) = resolved.binary_search_by_key(&fact.key, |row| row.key) else { return false };
    let relative = fact.velocity_b - fact.velocity_a;
    // Separating, or sliding tangentially: the ordinary case.
    if relative.dot(resolved[index].normal) >= Fx::ZERO { return true; }
    // Still closing, but genuinely nothing has changed since the group that
    // resolved it, so resolving it again must produce the identical result.
    // That case is reachable and common: an impulse is `closing/inv_sum` in
    // truncating fixed point, so any residual closing speed small enough to
    // truncate to zero leaves the pair closing and unresolvable. Left alone it
    // re-resolves once per remaining ordinal, all of them no-ops, and ends in a
    // `cap_hits` increment -- hashed state, invented out of a rounding floor.
    //
    // Both halves of "nothing has changed" are load-bearing, and the time half
    // was learned the hard way. Testing the velocity alone suppressed contacts
    // that had every right to resolve: a group elsewhere advances global time,
    // which slides both of these colliders along their trajectories, and the
    // recomputed normal can rotate under an unchanged relative velocity. A
    // randomised sweep put that at 3,376 wrongly suppressed closing contacts,
    // one of them closing at 3.95 units per tick. Comparing the normal instead
    // does not work -- at a coincident point it is derived from that same
    // velocity, so it agrees precisely when the velocity does. Only an
    // unmoved pose makes "identical state" true, and time is what moves it.
    global == resolved[index].global && relative == resolved[index].relative_velocity
}

/// A positive local time means the pair separated and is closing again, so the
/// key leaves the set and may resolve normally.
fn forget_closing_keys(resolved: &mut Vec<Resolved>, candidates: &[Candidate]) {
    for candidate in candidates {
        if candidate.fact.toi.get() == Fx::ZERO { continue; }
        if let Ok(index) = resolved.binary_search_by_key(&candidate.fact.key, |row| row.key) {
            resolved.remove(index);
        }
    }
}

fn remember_resolved(resolved: &mut Vec<Resolved>, row: Resolved) {
    match resolved.binary_search_by_key(&row.key, |entry| entry.key) {
        Ok(index) => resolved[index] = row,
        Err(index) => resolved.insert(index, row),
    }
}

fn push_unique(entities: &mut Vec<EntityId>, entity: EntityId) {
    if !entities.contains(&entity) { entities.push(entity); }
}

fn collider_index(rows: &[ContactCollider], entity: EntityId, slot: u8) -> Option<usize> {
    rows.iter().position(|row| row.entity == entity &&
        if slot == BODY_SLOT { matches!(row.shape, ContactShape::Body { .. }) } else { row.slot == slot })
}

fn closure_index(rows: &[GeneralizedCollider], entity: EntityId, slot: u8) -> Option<usize> {
    rows.iter().position(|row| row.entity == entity &&
        if slot == BODY_SLOT { row.kind == GeneralizedKind::Body } else { row.slot == slot })
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
        ContactShape::Body { previous_origin, parts, .. } => ContactShape::Body {
            previous_origin, requested_origin: previous_origin,
            parts: parts.map(|part| RegionSweep {
                requested_lower: part.previous_lower, requested_upper: part.previous_upper, ..part
            }),
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
        ContactShape::Body { previous_origin, requested_origin, parts } => {
            *previous_origin = interpolate_raw(*previous_origin, *requested_origin, numerator, denominator);
            for part in parts.iter_mut() {
                part.previous_lower = interpolate_raw(part.previous_lower, part.requested_lower, numerator, denominator);
                part.previous_upper = interpolate_raw(part.previous_upper, part.requested_upper, numerator, denominator);
            }
        }
    }
}

fn interpolate_raw(a: Vec3, b: Vec3, numerator: u32, denominator: u32) -> Vec3 {
    // A zero denominator means the tick is fully consumed, so there is no
    // remaining time to advance through and the answer is the current pose. It
    // can only arrive alongside a zero numerator, and returning the requested
    // end instead would jump a collider forward on a step that asked for
    // nothing -- inert today only because the two coincide at tick end.
    if denominator == 0 { return a; }
    let component = |a: Fx, b: Fx| {
        let delta = b.raw() as i128 - a.raw() as i128;
        Fx::from_raw((a.raw() as i128 + delta * numerator as i128 / denominator as i128) as i32)
    };
    Vec3::new(component(a.x, b.x), component(a.y, b.y), component(a.z, b.z))
}

fn translate_requested(row: &mut ContactCollider, delta: Vec3) {
    match &mut row.shape {
        ContactShape::Segment { requested_hilt, requested_tip, .. } => { *requested_hilt += delta; *requested_tip += delta; }
        ContactShape::Shield { requested, .. } => for point in requested { *point += delta; },
        ContactShape::Body { requested_origin, parts, .. } => {
            *requested_origin += delta;
            for part in parts.iter_mut() { part.requested_lower += delta; part.requested_upper += delta; }
        }
    }
}

fn finish_all(rows: &mut [ContactCollider]) {
    for row in rows { advance_shape(&mut row.shape, 1, 1); }
}

/// Stop the contact that has no ordinal left -- or whose simultaneous set is
/// too large to resolve as one system -- and let the rest of the tick finish.
///
/// Seeding is the earliest remaining group only. A contact scheduled for later
/// in the tick has not happened yet and has no reason to be frozen by this one;
/// seeding from every surviving fact would freeze bystanders and make the
/// transitive step below vacuous, since every fact would already have
/// contributed both of its entities.
fn cap_at_last_safe_pose(
    colliders: &mut [ContactCollider], global: u32, time: u32,
    scratch: &mut ContactTickScratch, state: &mut ContactSolverState,
) {
    scratch.capped_entities.clear();
    for candidate in scratch.collection.candidates() {
        if suppressed(&candidate.fact, global, &scratch.suppressed) { continue; }
        if map_local_to_global(global, candidate.fact.toi.get().raw() as u32) != time { continue; }
        push_unique(&mut scratch.capped_entities, candidate.fact.key.a);
        push_unique(&mut scratch.capped_entities, candidate.fact.key.b);
    }
    // Transitive by whole owning entity: a remaining fact that touches anything
    // already frozen drags its other entity in too, or that entity would sweep
    // through the thing its opponent just stopped against.
    loop {
        let before = scratch.capped_entities.len();
        for candidate in scratch.collection.candidates() {
            if suppressed(&candidate.fact, global, &scratch.suppressed) { continue; }
            let key = candidate.fact.key;
            let (a, b) = (scratch.capped_entities.contains(&key.a),
                          scratch.capped_entities.contains(&key.b));
            if a && !b { scratch.capped_entities.push(key.b); }
            else if b && !a { scratch.capped_entities.push(key.a); }
        }
        if scratch.capped_entities.len() == before { break; }
    }
    for row in colliders.iter_mut() {
        if scratch.capped_entities.contains(&row.entity) {
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

/// The portable behavioral proof is generated through the same collector,
/// grouping driver, and resolver used by World integration.
pub fn contact_behavior_corpus() -> Result<Vec<u8>, ResolutionError> {
    let mut bytes = b"ARPG-CONTACT-BEHAVIOR-V2".to_vec();
    for case_id in 0..=6u32 {
        let mut colliders = behavior_case(case_id);
        // One collider per label here, so the label count is the allocated-slot
        // high water the documented bounds are written against.
        let high_water = colliders.len();
        let pairs = if high_water < 2 { 0 } else { high_water * (high_water - 1) / 2 };
        let mut state = ContactSolverState::default();
        let mut resolutions = Vec::with_capacity(MAX_CONTACT_RESOLUTIONS_PER_TICK);
        let mut scratch = ContactTickScratch::default();
        scratch.reserve(high_water * 3, pairs * 16);
        let groups = solve_contact_tick(&mut colliders, &mut IndependentPointProjector,
                                        &mut state, &mut resolutions, &mut scratch)?;
        put_u32(&mut bytes, case_id);
        put_u32(&mut bytes, colliders.len() as u32);
        put_u32(&mut bytes, resolutions.len() as u32);
        put_u32(&mut bytes, groups as u32);
        put_u32(&mut bytes, state.cap_hits);
        for row in &resolutions {
            put_u32(&mut bytes, row.group_ordinal as u32);
            put_u32(&mut bytes, row.group_alpha_raw);
            write_fact(&mut bytes, row.fact);
            write_impulse(&mut bytes, row.impulse);
            put_u64(&mut bytes, row.energy.before_raw);
            put_u64(&mut bytes, row.energy.after_raw);
            put_u64(&mut bytes, row.energy.dissipated_raw);
            put_u64(&mut bytes, row.cut_raw);
            put_u64(&mut bytes, row.thrust_raw);
            put_u64(&mut bytes, row.pressure_raw);
            put_u64(&mut bytes, row.deflected_raw);
        }
        for row in &colliders {
            // A segment reports its tip. Every case but the sword is built from
            // zero-length rows where that is also the hilt, so this is one rule
            // rather than a case number smuggled into the serializer.
            let x = match row.shape {
                ContactShape::Segment { previous_tip, .. } => previous_tip.x,
                ContactShape::Body { previous_origin, .. } => previous_origin.x,
                ContactShape::Shield { previous, .. } => previous[0].x,
            };
            put_u32(&mut bytes, x.raw() as u32);
            put_u32(&mut bytes, row.velocity.x.raw() as u32);
        }
    }
    Ok(bytes)
}

fn behavior_case(case_id: u32) -> Vec<ContactCollider> {
    use crate::combat::spec::Material;
    // Restitution is the only surface coefficient the case table varies.
    let restitution = if case_id == 1 || case_id == 6 { Fx::ZERO } else { Fx::ONE };
    let surface = SurfaceSpec { restitution, friction: Fx::ZERO,
        edge_factor: Fx::ONE, point_factor: Fx::ONE, material: Material::Steel };
    let point = |label: u32, faction: Faction, x: i32, velocity: i32| ContactCollider {
        entity: EntityId::new(label, 0), faction, slot: 1, mass: Fx::ONE, surface,
        velocity: Vec3::new(Fx::from_raw(velocity), Fx::ZERO, Fx::ZERO),
        present: true,
        shape: ContactShape::Segment {
            previous_hilt: Vec3::new(Fx::from_raw(x), Fx::ZERO, Fx::ZERO),
            previous_tip: Vec3::new(Fx::from_raw(x), Fx::ZERO, Fx::ZERO),
            requested_hilt: Vec3::new(Fx::from_raw(x.saturating_add(velocity)), Fx::ZERO, Fx::ZERO),
            requested_tip: Vec3::new(Fx::from_raw(x.saturating_add(velocity)), Fx::ZERO, Fx::ZERO),
            radius: Fx::ZERO,
        },
    };
    match case_id {
        0 => Vec::new(),
        1 | 2 => vec![
            point(0, Faction::Heroes, 0, 65_536),
            point(1, Faction::Monsters, 16_384, 0),
            point(2, Faction::Monsters, 16_384, 0),
        ],
        3 => vec![
            point(0, Faction::Heroes, 0, 65_536),
            point(1, Faction::Monsters, 16_384, 0),
            point(2, Faction::Heroes, 32_768, 0),
        ],
        4 => vec![
            point(0, Faction::Heroes, 0, 16_384),
            point(1, Faction::Monsters, 0, -16_384),
        ],
        5 => (0..10).map(|label| point(
            label, if label % 2 == 0 { Faction::Heroes } else { Faction::Monsters },
            label as i32 * 4_096, if label == 0 { 65_536 } else { 0 },
        )).collect(),
        6 => {
            let mut weapon = point(0, Faction::Heroes, 0, 65_536);
            weapon.shape = ContactShape::Segment {
                previous_hilt: Vec3::ZERO,
                previous_tip: Vec3::new(Fx::HALF, Fx::ZERO, Fx::ZERO),
                requested_hilt: Vec3::X,
                requested_tip: Vec3::new(Fx::from_ratio(3, 2), Fx::ZERO, Fx::ZERO),
                radius: Fx::ZERO,
            };
            // Five coincident zero-radius points, so the body is geometrically
            // the single point v2-14's row was and the whole regional apparatus
            // shows up in exactly one byte: the tie-break falls through time
            // and medial distance to `BodyPart` order and answers Head.
            let body_point = Vec3::X;
            let part = RegionSweep {
                previous_lower: body_point, previous_upper: body_point,
                requested_lower: body_point, requested_upper: body_point,
                radius: Fx::ZERO, present: true,
            };
            let body = ContactCollider { entity: EntityId::new(1, 0), faction: Faction::Monsters,
                slot: BODY_SLOT, mass: Fx::ONE, surface, velocity: Vec3::ZERO, present: true,
                shape: ContactShape::Body { previous_origin: body_point, requested_origin: body_point,
                    parts: [part; AnatomyRegion::COUNT] } };
            vec![weapon, body]
        }
        _ => unreachable!(),
    }
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

    struct Solved {
        colliders: Vec<ContactCollider>,
        resolutions: Vec<ContactResolution>,
        groups: u8,
        cap_hits: u32,
        grew: bool,
    }

    impl Solved {
        /// The serialized final row per collider, in the corpus's own terms.
        fn finals(&self) -> Vec<(i32, i32)> {
            self.colliders.iter().map(|row| {
                let x = match row.shape {
                    ContactShape::Segment { previous_tip, .. } => previous_tip.x,
                    ContactShape::Body { previous_origin, .. } => previous_origin.x,
                    ContactShape::Shield { previous, .. } => previous[0].x,
                };
                (x.raw(), row.velocity.x.raw())
            }).collect()
        }

        fn ledgers(&self) -> Vec<(u64, u64, u64)> {
            self.resolutions.iter()
                .map(|row| (row.energy.before_raw, row.energy.after_raw, row.energy.dissipated_raw))
                .collect()
        }

        /// `(group ordinal, alpha, A index, B index, global TOI raw)` per row.
        fn shape(&self) -> Vec<(u8, u32, u32, u32, i32)> {
            self.resolutions.iter().map(|row| (
                row.group_ordinal, row.group_alpha_raw,
                row.fact.key.a.index, row.fact.key.b.index, row.fact.toi.get().raw(),
            )).collect()
        }
    }

    /// Drive explicit collider rows through the production driver at the
    /// documented reservation bounds, and report whether any retained capacity
    /// grew on the way.
    ///
    /// `grew` is weaker than "allocated nothing" and must not be read as that
    /// claim: it compares `Vec::capacity()` before and after, so it is blind to
    /// a buffer allocated and freed inside a call -- which is exactly how a
    /// stable sort's scratch space hid here until an allocator-counting probe
    /// found it. The browser no-growth proof in checkpoint C is the real check.
    fn solve_rows(mut colliders: Vec<ContactCollider>) -> Solved {
        let high_water = colliders.len();
        let pairs = if high_water < 2 { 0 } else { high_water * (high_water - 1) / 2 };
        let mut state = ContactSolverState::default();
        let mut resolutions = Vec::with_capacity(MAX_CONTACT_RESOLUTIONS_PER_TICK);
        let mut scratch = ContactTickScratch::default();
        scratch.reserve(high_water * 3, pairs * 16);
        let reserved = scratch.capacities();
        let groups = solve_contact_tick(&mut colliders, &mut IndependentPointProjector,
                                        &mut state, &mut resolutions, &mut scratch).unwrap();
        Solved { colliders, resolutions, groups, cap_hits: state.cap_hits,
                 grew: scratch.capacities() != reserved }
    }

    fn solve_case(case_id: u32) -> Solved { solve_rows(behavior_case(case_id)) }

    #[test]
    fn a_true_simultaneous_group_uses_one_pre_group_state() {
        let solved = solve_case(1);
        assert_eq!((solved.groups, solved.cap_hits), (1, 0));
        // Both targets sit at the same x, so one mapped time carries both facts
        // and both rows carry ordinal zero and one shared ledger.
        assert_eq!(solved.shape(), vec![(0, 65_536, 0, 1, 16_384), (0, 65_536, 0, 2, 16_384)]);
        assert_eq!(solved.ledgers(), vec![(32_768, 16_384, 16_384); 2]);
        // The pre-group state is what makes this one group rather than two: the
        // second fact still sees the striker at full speed, not at the speed the
        // first fact would have left it.
        for row in &solved.resolutions {
            assert_eq!(row.fact.velocity_a.x.raw(), 65_536);
            assert_eq!(row.fact.velocity_b, Vec3::ZERO);
            assert_eq!(row.impulse.on_a.x.raw(), -32_768);
        }
        assert_eq!(solved.finals(), vec![(16_384, 0), (40_960, 32_768), (40_960, 32_768)]);
    }

    #[test]
    fn shared_limb_group_energy_is_clamped_as_one_system() {
        let solved = solve_case(2);
        assert_eq!((solved.groups, solved.cap_hits), (1, 0));
        // Full alpha would hand the pair more energy than it arrived with, so
        // the greedy search backs the whole group off together -- one alpha for
        // both facts, not one per fact.
        assert_eq!(solved.shape(), vec![(0, 43_691, 0, 1, 16_384), (0, 43_691, 0, 2, 16_384)]);
        assert_eq!(solved.ledgers(), vec![(32_768, 32_768, 0); 2]);
        assert_eq!(solved.finals(), vec![(-1, -21_846), (49_152, 43_691), (49_152, 43_691)]);
    }

    #[test]
    fn one_sweep_recomputes_after_two_sequential_contacts() {
        let solved = solve_case(3);
        assert_eq!((solved.groups, solved.cap_hits), (2, 0));
        // The second contact is only reachable if the sweep was rebuilt from the
        // pose and velocity the first group left behind. Re-interpolating from
        // tick start would leave entity 1 stationary and find nothing.
        assert_eq!(solved.shape(), vec![(0, 65_536, 0, 1, 16_384), (1, 65_536, 1, 2, 32_768)]);
        assert_eq!(solved.ledgers(), vec![(32_768, 32_768, 0); 2]);
        assert_eq!(solved.finals(), vec![(16_384, 0), (32_768, 0), (65_536, 65_536)]);
        assert!(!solved.grew);
    }

    #[test]
    fn persistent_zero_time_contacts_do_not_livelock() {
        let solved = solve_case(4);
        assert_eq!((solved.groups, solved.cap_hits), (1, 0));
        assert_eq!(solved.shape(), vec![(0, 65_536, 0, 1, 0)]);
        assert_eq!(solved.ledgers(), vec![(4_096, 4_096, 0)]);
        assert_eq!(solved.finals(), vec![(-16_384, -16_384), (16_384, 16_384)]);

        // The harder half: a suppressed pair has to stay suppressed across a
        // group it has nothing to do with. Entities 0 and 1 meet head-on and
        // stop dead against each other, so they stay coincident with zero
        // relative approach and re-sweep at local zero forever; entities 2 and 3
        // meet later, off in Y. If that unrelated group could clear the memory,
        // the dead pair would resolve again every ordinal until the tick capped.
        let dead_pair = |index: u32, faction, velocity: i32| ContactCollider {
            entity: EntityId::new(index, 0), faction, slot: 1, mass: Fx::ONE,
            surface: surface(Fx::ZERO), velocity: Vec3::new(Fx::from_raw(velocity), Fx::ZERO, Fx::ZERO),
            present: true,
            shape: ContactShape::Segment {
                previous_hilt: Vec3::ZERO, previous_tip: Vec3::ZERO,
                requested_hilt: Vec3::new(Fx::from_raw(velocity), Fx::ZERO, Fx::ZERO),
                requested_tip: Vec3::new(Fx::from_raw(velocity), Fx::ZERO, Fx::ZERO),
                radius: Fx::ZERO } };
        let elsewhere = |index: u32, faction, x: i32, velocity: i32| {
            let at = |x: i32| Vec3::new(Fx::from_raw(x), Fx::ONE, Fx::ZERO);
            ContactCollider {
                entity: EntityId::new(index, 0), faction, slot: 1, mass: Fx::ONE, present: true,
                surface: surface(Fx::ZERO), velocity: Vec3::new(Fx::from_raw(velocity), Fx::ZERO, Fx::ZERO),
                shape: ContactShape::Segment {
                    previous_hilt: at(x), previous_tip: at(x),
                    requested_hilt: at(x + velocity), requested_tip: at(x + velocity),
                    radius: Fx::ZERO } }
        };
        let crowded = solve_rows(vec![
            dead_pair(0, Faction::Heroes, 16_384),
            dead_pair(1, Faction::Monsters, -16_384),
            elsewhere(2, Faction::Heroes, 0, 65_536),
            elsewhere(3, Faction::Monsters, 16_384, 0),
        ]);
        assert_eq!((crowded.groups, crowded.cap_hits), (2, 0));
        assert_eq!(crowded.shape(), vec![(0, 65_536, 0, 1, 0), (1, 65_536, 2, 3, 16_384)]);

        // The third way in, and the one the separating rule alone cannot close:
        // a pair that is still closing but whose impulse rounds away. An impulse
        // is `closing/inv_sum` in truncating fixed point, so at equal unit
        // masses every odd raw closing speed leaves the pair exactly where it
        // was. Nothing separates, nothing is suppressed by velocity sign, and
        // the pair re-resolves once per remaining ordinal until the cap invents
        // a `cap_hits` increment out of a rounding floor.
        // At equal unit masses an odd closing speed always leaves one raw unit
        // behind, whatever it started at: 65,535 dissipates properly on its
        // first group and still ends up stalled on the residual.
        for closing in [1, 3, 7, 9, 65_535] {
            let stalled = solve_rows(vec![
                dead_pair(0, Faction::Heroes, closing),
                dead_pair(1, Faction::Monsters, 0),
            ]);
            assert_eq!((stalled.groups, stalled.cap_hits), (1, 0),
                       "closing {closing} raw re-resolved instead of settling");
            assert_eq!(stalled.resolutions.len(), 1);
        }
        // Closing one raw unit is the pure case: the impulse rounds entirely
        // away, so the single group is a no-op and there is nothing to dissipate.
        let inert = solve_rows(vec![
            dead_pair(0, Faction::Heroes, 1), dead_pair(1, Faction::Monsters, 0)]);
        assert_eq!(inert.resolutions[0].impulse.on_a, Vec3::ZERO);
        assert_eq!(inert.resolutions[0].energy.dissipated_raw, 0);

        // Soundness costs an ordinal, and this pins the price. The unresolvable
        // pair is suppressed only while global time stands still; once an
        // unrelated group advances it, both colliders have moved along their
        // trajectories and the pair is genuinely new state, so it is re-examined
        // rather than assumed inert. Skipping that re-examination is what a
        // randomised sweep caught suppressing 3,376 real closing contacts, one
        // of them at nearly four units per tick.
        let revisited = solve_rows(vec![
            dead_pair(0, Faction::Heroes, 1),
            dead_pair(1, Faction::Monsters, 0),
            elsewhere(2, Faction::Heroes, 0, 65_536),
            elsewhere(3, Faction::Monsters, 16_384, 0),
        ]);
        assert_eq!((revisited.groups, revisited.cap_hits), (3, 0));
    }

    #[test]
    fn cap_exhaustion_stops_at_the_last_safe_pose() {
        let solved = solve_case(5);
        assert_eq!((solved.groups, solved.cap_hits), (8, 1));
        assert_eq!(solved.resolutions.len(), 8);
        assert_eq!(solved.shape(), (0..8u32).map(|k|
            (k as u8, 65_536, k, k + 1, 4_096 * (k as i32 + 1))).collect::<Vec<_>>());
        // Label 8 took the eighth group's momentum and had a requested end of
        // 65,536 pending. The cap freezes it where it stood rather than letting
        // it finish the sweep that had nothing left to resolve it against.
        assert_eq!(solved.finals(), vec![
            (4_096, 0), (8_192, 0), (12_288, 0), (16_384, 0), (20_480, 0),
            (24_576, 0), (28_672, 0), (32_768, 0), (32_768, 0), (36_864, 0),
        ]);
        assert!(!solved.grew);
    }

    #[test]
    fn contact_results_survive_entity_and_limb_index_permutations() {
        // Case 1 with labels 0 and 2 exchanged, the right slot swapped for the
        // left, and the rows handed over in the opposite order. Nothing here is
        // identity except the full `(EntityId, LimbSlot)` pair.
        let relabel = |label: u32| match label { 0 => 2, 2 => 0, other => other };
        let permuted: Vec<ContactCollider> = behavior_case(1).into_iter().rev()
            .map(|mut row| {
                row.entity = EntityId::new(relabel(row.entity.index), 0);
                row.slot = 0;
                row
            }).collect();
        let (original, permuted) = (solve_case(1), solve_rows(permuted));

        assert_eq!(original.groups, permuted.groups);
        assert_eq!(original.cap_hits, permuted.cap_hits);
        assert_eq!(original.ledgers(), permuted.ledgers());

        // Facts mirror rather than match: relabelling makes the striker the
        // higher identity, so it becomes B, and the normal and impulse flip with
        // it. What has to survive is the unordered pair, and what each entity
        // actually receives.
        let pairs = |solved: &Solved, map: &dyn Fn(u32) -> u32| {
            let mut rows: Vec<(u32, u32)> = solved.resolutions.iter().map(|row| {
                let (a, b) = (map(row.fact.key.a.index), map(row.fact.key.b.index));
                (a.min(b), a.max(b))
            }).collect();
            rows.sort();
            rows
        };
        assert_eq!(pairs(&original, &|label| label), pairs(&permuted, &relabel));

        let received = |solved: &Solved, map: &dyn Fn(u32) -> u32| {
            let mut rows: Vec<(u32, i32)> = solved.resolutions.iter().flat_map(|row| [
                (map(row.fact.key.a.index), row.impulse.on_a.x.raw()),
                (map(row.fact.key.b.index), row.impulse.on_b.x.raw()),
            ]).collect();
            rows.sort();
            rows
        };
        assert_eq!(received(&original, &|label| label), received(&permuted, &relabel));

        let mut mapped: Vec<(u32, (i32, i32))> = permuted.colliders.iter()
            .map(|row| relabel(row.entity.index)).zip(permuted.finals()).collect();
        mapped.sort();
        assert_eq!(mapped.into_iter().map(|(_, row)| row).collect::<Vec<_>>(), original.finals());
    }

    #[test]
    fn a_bystander_outside_the_group_closure_stays_out_of_its_ledger() {
        // Case 2 plus one hostile row parked far away and moving fast across the
        // group's axis. It touches nothing, so nothing about the group may
        // change -- and in particular its kinetic energy must not appear in a
        // ledger it has no part in, where it would be serialized as evidence and
        // could pay for the group's own energy gain during the alpha search.
        let mut rows = behavior_case(2);
        let far = Vec3::from_ints(8, 8, 0);
        rows.push(ContactCollider {
            entity: EntityId::new(9, 0), faction: Faction::Monsters, slot: 1, mass: Fx::ONE,
            present: true, surface: surface(Fx::ONE), velocity: Vec3::Y * Fx::TWO,
            shape: ContactShape::Segment {
                previous_hilt: far, previous_tip: far,
                requested_hilt: far + Vec3::Y * Fx::TWO, requested_tip: far + Vec3::Y * Fx::TWO,
                radius: Fx::ZERO } });
        let solved = solve_rows(rows);

        assert_eq!(solved.ledgers(), vec![(32_768, 32_768, 0); 2]);
        assert_eq!(solved.shape(), vec![(0, 43_691, 0, 1, 16_384), (0, 43_691, 0, 2, 16_384)]);
        assert_eq!(&solved.finals()[..3], &[(-1, -21_846), (49_152, 43_691), (49_152, 43_691)]);
        // The bystander finished its own sweep untouched.
        assert_eq!(solved.colliders[3].velocity, Vec3::Y * Fx::TWO);
        assert_eq!(solved.finals()[3], (Fx::from_int(8).raw(), 0));
    }

    #[test]
    fn an_oversized_simultaneous_group_caps_instead_of_truncating() {
        // 23 against 23, every one of them coincident at the origin, makes 529
        // simultaneous facts against a 512 ceiling. No prefix of a simultaneous
        // group is privileged, so the answer is to resolve none of it and cap.
        let crowd: Vec<ContactCollider> = (0..46u32).map(|index| {
            let velocity = if index % 2 == 0 { 4_096 } else { -4_096 };
            ContactCollider {
                entity: EntityId::new(index, 0),
                faction: if index % 2 == 0 { Faction::Heroes } else { Faction::Monsters },
                slot: 1, mass: Fx::ONE, present: true, surface: surface(Fx::ZERO),
                velocity: Vec3::new(Fx::from_raw(velocity), Fx::ZERO, Fx::ZERO),
                shape: ContactShape::Segment {
                    previous_hilt: Vec3::ZERO, previous_tip: Vec3::ZERO,
                    requested_hilt: Vec3::new(Fx::from_raw(velocity), Fx::ZERO, Fx::ZERO),
                    requested_tip: Vec3::new(Fx::from_raw(velocity), Fx::ZERO, Fx::ZERO),
                    radius: Fx::ZERO } }
        }).collect();
        let solved = solve_rows(crowd);

        assert_eq!((solved.groups, solved.cap_hits), (0, 1));
        assert!(solved.resolutions.is_empty());
        // Everything is inside the closure, so everything holds its last-safe
        // pose at the origin instead of finishing its sweep.
        assert!(solved.finals().iter().all(|&row| row == (0, 0)));
        assert!(!solved.grew);
    }

    /// One length-1 sword lying along +X with its tip resting on a zero-radius
    /// body capsule at the origin: the shared fixture for the channel proofs.
    fn braced_sword(sword: Vec3, body: Vec3) -> Vec<ContactCollider> {
        let steel = SurfaceSpec { restitution: Fx::ZERO, friction: Fx::ZERO,
            edge_factor: Fx::ONE, point_factor: Fx::ONE, material: Material::Steel };
        let hilt = Vec3::new(-Fx::ONE, Fx::ZERO, Fx::ZERO);
        vec![
            ContactCollider {
                entity: EntityId::new(0, 0), faction: Faction::Heroes, slot: 1,
                mass: Fx::ONE, surface: steel, velocity: sword, present: true,
                shape: ContactShape::Segment {
                    previous_hilt: hilt, previous_tip: Vec3::ZERO,
                    requested_hilt: hilt + sword, requested_tip: sword, radius: Fx::ZERO } },
            ContactCollider {
                entity: EntityId::new(1, 0), faction: Faction::Monsters, slot: BODY_SLOT,
                mass: Fx::ONE, surface: steel, velocity: body, present: true,
                shape: ContactShape::Body {
                    previous_origin: Vec3::ZERO, requested_origin: body,
                    parts: [RegionSweep {
                        previous_lower: Vec3::ZERO, previous_upper: Vec3::ZERO,
                        requested_lower: body, requested_upper: body,
                        radius: Fx::ZERO, present: true,
                    }; AnatomyRegion::COUNT] } },
        ]
    }

    #[test]
    fn a_stationary_edge_does_not_cut() {
        // Resting steel is still a contact -- the fact exists -- but nothing
        // closes, so there is no dissipated energy to allocate and no channel
        // can be nonzero. An edge that cuts by mere presence is the bug.
        let solved = solve_rows(braced_sword(Vec3::ZERO, Vec3::ZERO));
        assert_eq!(solved.resolutions.len(), 1);
        let row = solved.resolutions[0];
        assert_eq!(row.fact.key.kind, ContactKind::WeaponBody);
        assert_eq!(row.energy.dissipated_raw, 0);
        assert_eq!((row.cut_raw, row.thrust_raw, row.pressure_raw), (0, 0, 0));
    }

    #[test]
    fn running_onto_a_braced_point_records_positive_thrust() {
        // The sword does not move; the body runs onto it. Relative motion is
        // purely along the blade, so the whole share above the floor is thrust
        // and none of it is cut.
        let quarter = Fx::from_ratio(1, 4);
        let solved = solve_rows(braced_sword(Vec3::ZERO, Vec3::new(-quarter, Fx::ZERO, Fx::ZERO)));
        assert_eq!(solved.resolutions.len(), 1);
        let row = solved.resolutions[0];
        assert_eq!((row.energy.before_raw, row.energy.after_raw, row.energy.dissipated_raw),
                   (2_048, 1_024, 1_024));
        assert!(row.thrust_raw > 0);
        assert_eq!(row.cut_raw, 0);
        // The 144 floor never reaches a channel; it lands in pressure.
        assert_eq!((row.cut_raw, row.thrust_raw, row.pressure_raw), (0, 880, 144));
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

        // The zero-length row above returns before any widened arithmetic runs,
        // so on its own it cannot prove the products stay `u64`. Drive a real
        // decomposition of the same above-`u32` share: purely axial, so the
        // whole of it above the 144 floor has to survive in thrust.
        let axial = WeaponBodyChannel { weapon_relative_velocity: Vec3::X, zero_length: false, ..row };
        assert_eq!(channels(total, axial), (0, total - CONTACT_ENERGY_FLOOR, CONTACT_ENERGY_FLOOR));

        // A factor above one would drive `share - cut - thrust` negative and
        // panic on the subtraction, in release too. `validate_surface` cannot
        // produce one, but this allocator is public and takes a raw surface.
        let unbounded = WeaponBodyChannel { edge_factor: Fx::from_int(8),
                                            point_factor: Fx::from_int(8), ..axial };
        assert_eq!(channels(total, unbounded), (0, total - CONTACT_ENERGY_FLOOR, CONTACT_ENERGY_FLOOR));
        let transverse = WeaponBodyChannel { weapon_relative_velocity: Vec3::Y, ..unbounded };
        let (cut, thrust, pressure) = channels(1_000, transverse);
        assert_eq!((cut, thrust), (856, 0));
        assert_eq!(pressure, 144);
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

    /// One expected resolution, transcribed from the reference's case table.
    /// Everything constant across the whole corpus -- generation zero, A in the
    /// right slot, normal +X, zero Y/Z, `deflected=0` -- is supplied by the
    /// writer rather than repeated eighteen times.
    struct Expected {
        ordinal: u32, alpha: u32,
        a_index: u32, b_index: u32, b_slot: u32, kind: u32,
        toi: i32, region: u32, point_x: i32,
        velocity_a: i32, velocity_b: i32, on_a: i32,
        energy: (u64, u64, u64),
        channels: (u64, u64, u64),
    }

    /// A weapon/weapon row at `toi`, whose contact point rides the global time.
    /// It names no region, because there is no anatomy on the far side of it.
    fn ww(ordinal: u32, alpha: u32, a_index: u32, toi: i32, on_a: i32,
          energy: (u64, u64, u64)) -> Expected {
        Expected { ordinal, alpha, a_index, b_index: a_index + 1, b_slot: 1, kind: 0,
                   toi, region: 0xff, point_x: toi, velocity_a: 65_536, velocity_b: 0, on_a,
                   energy, channels: (0, 0, 0) }
    }

    fn expect_u32(bytes: &mut Vec<u8>, value: u32) { bytes.extend_from_slice(&value.to_le_bytes()); }
    fn expect_u64(bytes: &mut Vec<u8>, value: u64) { bytes.extend_from_slice(&value.to_le_bytes()); }

    /// An XYZ vector whose Y and Z are zero, written as raw `i32` bits.
    fn expect_axial(bytes: &mut Vec<u8>, x: i32) {
        expect_u32(bytes, x as u32);
        expect_u32(bytes, 0);
        expect_u32(bytes, 0);
    }

    fn expect_key(bytes: &mut Vec<u8>, row: &Expected) {
        expect_u32(bytes, row.a_index);
        expect_u32(bytes, 0);
        expect_u32(bytes, 1);
        expect_u32(bytes, row.b_index);
        expect_u32(bytes, 0);
        expect_u32(bytes, row.b_slot);
        expect_u32(bytes, row.kind);
    }

    /// 8 ordinal/alpha + 84 fact + 52 impulse + 24 ledger + 32 channels = 200.
    fn expect_row(bytes: &mut Vec<u8>, row: &Expected) {
        expect_u32(bytes, row.ordinal);
        expect_u32(bytes, row.alpha);
        expect_key(bytes, row);
        expect_u32(bytes, row.toi as u32);
        expect_u32(bytes, row.region);
        expect_axial(bytes, row.point_x);
        expect_axial(bytes, 65_536);
        expect_axial(bytes, row.velocity_a);
        expect_axial(bytes, row.velocity_b);
        expect_key(bytes, row);
        expect_axial(bytes, row.on_a);
        expect_axial(bytes, -row.on_a);
        expect_u64(bytes, row.energy.0);
        expect_u64(bytes, row.energy.1);
        expect_u64(bytes, row.energy.2);
        expect_u64(bytes, row.channels.0);
        expect_u64(bytes, row.channels.1);
        expect_u64(bytes, row.channels.2);
        expect_u64(bytes, 0);
    }

    fn expect_case(bytes: &mut Vec<u8>, case_id: u32, groups: u32, cap_hits: u32,
                   rows: &[Expected], finals: &[(i32, i32)]) {
        expect_u32(bytes, case_id);
        expect_u32(bytes, finals.len() as u32);
        expect_u32(bytes, rows.len() as u32);
        expect_u32(bytes, groups);
        expect_u32(bytes, cap_hits);
        for row in rows { expect_row(bytes, row); }
        for &(x, velocity) in finals {
            expect_u32(bytes, x as u32);
            expect_u32(bytes, velocity as u32);
        }
    }

    /// The behavioral corpus written out by hand from
    /// `docs/reference/contact-solver.md`, with no solver in the loop. This is
    /// the point of the fixture: a corpus that re-serialized production rows
    /// would agree with a drifting solver by construction and prove nothing.
    fn expected_behavior_corpus() -> Vec<u8> {
        let mut bytes = b"ARPG-CONTACT-BEHAVIOR-V2".to_vec();

        expect_case(&mut bytes, 0, 0, 0, &[], &[]);

        // Both targets sit at the same x, so one mapped time carries two facts
        // and they share group ordinal zero, one alpha, and one ledger.
        expect_case(&mut bytes, 1, 1, 0, &[
            ww(0, 65_536, 0, 16_384, -32_768, (32_768, 16_384, 16_384)),
            Expected { b_index: 2, ..ww(0, 65_536, 0, 16_384, -32_768, (32_768, 16_384, 16_384)) },
        ], &[(16_384, 0), (40_960, 32_768), (40_960, 32_768)]);

        // Restitution 1 doubles the demanded impulse, so the group cannot take
        // full alpha and the greedy 16-bit search settles on 43,691.
        expect_case(&mut bytes, 2, 1, 0, &[
            ww(0, 43_691, 0, 16_384, -43_691, (32_768, 32_768, 0)),
            Expected { b_index: 2, ..ww(0, 43_691, 0, 16_384, -43_691, (32_768, 32_768, 0)) },
        ], &[(-1, -21_846), (49_152, 43_691), (49_152, 43_691)]);

        // Label 2 is an ally of label 0, so the momentum reaches it only
        // through label 1 -- two mapped times, two ordinals.
        expect_case(&mut bytes, 3, 2, 0, &[
            ww(0, 65_536, 0, 16_384, -65_536, (32_768, 32_768, 0)),
            ww(1, 65_536, 1, 32_768, -65_536, (32_768, 32_768, 0)),
        ], &[(16_384, 0), (32_768, 0), (65_536, 65_536)]);

        // Coincident at tick start, so the normal is the unconditional +X and
        // the post-exchange repeat is suppressed against that stored normal.
        expect_case(&mut bytes, 4, 1, 0, &[
            Expected { velocity_a: 16_384, velocity_b: -16_384,
                       ..ww(0, 65_536, 0, 0, -32_768, (4_096, 4_096, 0)) },
        ], &[(-16_384, -16_384), (16_384, 16_384)]);

        // A Newton's cradle exactly one group longer than the tick allows: the
        // ninth contact has no ordinal left and caps instead of resolving.
        let cradle: Vec<Expected> = (0..8)
            .map(|k| ww(k as u32, 65_536, k as u32, 4_096 * (k + 1), -65_536, (32_768, 32_768, 0)))
            .collect();
        expect_case(&mut bytes, 5, 8, 1, &cradle, &[
            (4_096, 0), (8_192, 0), (12_288, 0), (16_384, 0), (20_480, 0),
            (24_576, 0), (28_672, 0), (32_768, 0), (32_768, 0), (36_864, 0),
        ]);

        // The one row with widened channels: a purely axial strike puts every
        // dissipated raw above the 144 floor into thrust, and the floor itself
        // into pressure. Its point is where the tip lands, not the global time.
        // Its region is Head, and the zero is load-bearing: the body's five
        // volumes are coincident, so the choice falls all the way through the
        // contract's tuple to `BodyPart` order.
        expect_case(&mut bytes, 6, 1, 0, &[
            Expected { b_index: 1, b_slot: 0xff, kind: 2, point_x: 65_536,
                       region: AnatomyRegion::Head as u32, channels: (0, 16_240, 144),
                       ..ww(0, 65_536, 0, 32_768, -32_768, (32_768, 16_384, 16_384)) },
        ], &[(81_920, 32_768), (81_920, 32_768)]);

        bytes
    }

    #[test]
    fn the_behavioral_contact_corpus_has_literal_outcomes() {
        let expected = expected_behavior_corpus();
        assert_eq!(expected.len(), 3_548, "hand-built corpus is not the pinned length");
        let bytes = contact_behavior_corpus().unwrap();
        if let Some(offset) = (0..bytes.len().min(expected.len()))
            .find(|&index| bytes[index] != expected[index]) {
            // Report the containing 4-byte word: every field in this grammar is
            // word-aligned, so the word index is what locates the bad field.
            let word = offset / 4 * 4;
            panic!("production corpus differs at byte {offset} (word {}): produced {:02x?}, expected {:02x?}",
                   word / 4, &bytes[word..word + 4], &expected[word..word + 4]);
        }
        assert_eq!(bytes.len(), expected.len(), "production corpus has a different length");
        let mut hash = Hash64::new(); hash.write_bytes(&bytes);
        // Moved by v2-15, and by exactly one byte: case 6's body is now five
        // regional volumes rather than one anonymous capsule, so its fact names
        // the region it chose. The geometry is unchanged -- the five volumes
        // are the same coincident point the single capsule was -- and the
        // region byte went from `0xff` to Head's zero. Previously
        // `0xfe6ce41ec023c1e5`.
        assert_eq!(hash.finish(), 0x587b_0259_e877_105a);
    }

    #[test]
    fn contact_corpus_matches_on_eight_native_threads() {
        let expected = contact_behavior_corpus().unwrap();
        std::thread::scope(|scope| {
            let mut handles = Vec::new();
            for _ in 0..8 { handles.push(scope.spawn(contact_behavior_corpus)); }
            for handle in handles { assert_eq!(handle.join().unwrap().unwrap(), expected); }
        });
    }
}
