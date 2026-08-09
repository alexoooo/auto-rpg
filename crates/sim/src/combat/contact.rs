//! Stable contact evidence and ordering for articulated combat.
//!
//! Collection owns geometry, but resolution owns no geometry at all: this file
//! is the narrow byte-stable handoff between the two.  Keeping the rows plain
//! also lets replay, wasm, and the mechanical proof inspect the same result.

use crate::{EntityId, Faction};
use crate::combat::spec::SurfaceSpec;
use fx::{
    closest_points_on_segments, closest_points_segment_rectangle,
    swept_segment_rectangle, swept_segment_segment, swept_segment_vertical_capsule,
    Fx, TimeOfImpact, Vec3,
};

pub const MAX_CONTACT_GROUPS_PER_TICK: u8 = 8;
pub const MAX_ARTICULATED_ENTITIES: usize = 64;
pub const MAX_CONTACT_FACTS_PER_GROUP: usize = 512;
pub const MAX_CONTACT_RESOLUTIONS_PER_TICK: usize = 4_096;
pub const BODY_SLOT: u8 = 0xff;
pub const CONTACT_COMPONENT_SPEED_LIMIT: Fx = Fx::from_int(4);

#[repr(u8)]
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug)]
pub enum ContactKind { WeaponWeapon = 0, WeaponShield = 1, WeaponBody = 2 }

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug)]
pub struct ContactKey {
    pub a: EntityId,
    pub a_slot: u8,
    pub b: EntityId,
    pub b_slot: u8,
    pub kind: ContactKind,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ContactFact {
    pub key: ContactKey,
    pub toi: TimeOfImpact,
    pub region: u8,
    pub point: Vec3,
    pub normal: Vec3,
    pub velocity_a: Vec3,
    pub velocity_b: Vec3,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ContactImpulse { pub key: ContactKey, pub on_a: Vec3, pub on_b: Vec3 }

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct EnergyLedger {
    pub before_raw: u64,
    pub after_raw: u64,
    pub dissipated_raw: u64,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct ContactSolverState { pub cap_hits: u32 }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ContactResolution {
    pub group_ordinal: u8,
    pub group_alpha_raw: u32,
    pub fact: ContactFact,
    pub impulse: ContactImpulse,
    pub energy: EnergyLedger,
    pub cut_raw: u64,
    pub thrust_raw: u64,
    pub pressure_raw: u64,
    pub deflected_raw: u64,
    pub severed: bool,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ContactShape {
    Segment {
        previous_hilt: Vec3, previous_tip: Vec3,
        requested_hilt: Vec3, requested_tip: Vec3,
        radius: Fx,
    },
    Shield { previous: [Vec3; 4], requested: [Vec3; 4] },
    Body {
        previous_lower: Vec3, previous_upper: Vec3,
        requested_lower: Vec3, requested_upper: Vec3,
        radius: Fx,
    },
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ContactCollider {
    pub entity: EntityId,
    pub faction: Faction,
    pub slot: u8,
    pub mass: Fx,
    pub surface: SurfaceSpec,
    pub velocity: Vec3,
    pub shape: ContactShape,
}

#[derive(Clone, Copy)]
struct Candidate { fact: ContactFact, distance_sq: Fx, feature: u8 }

#[derive(Default)]
pub struct ContactCollectionScratch {
    candidates: Vec<Candidate>,
    pub facts: Vec<ContactFact>,
}

impl ContactCollectionScratch {
    pub fn reserve(&mut self, candidate_bound: usize, fact_bound: usize) {
        self.candidates.reserve(candidate_bound.saturating_sub(self.candidates.capacity()));
        self.facts.reserve(fact_bound.saturating_sub(self.facts.capacity()));
    }
}

/// Collect the immutable earliest facts for explicit collider rows. World owns
/// construction and capacity; this function owns only the hostile matrix and
/// its full-identity ordering.
pub fn collect_contacts(colliders: &[ContactCollider]) -> Vec<ContactFact> {
    let mut scratch = ContactCollectionScratch::default();
    collect_contacts_into(colliders, &mut scratch);
    scratch.facts
}

pub fn collect_contacts_into(colliders: &[ContactCollider], scratch: &mut ContactCollectionScratch) {
    scratch.candidates.clear();
    scratch.facts.clear();
    for i in 0..colliders.len() {
        for j in i + 1..colliders.len() {
            let a = colliders[i];
            let b = colliders[j];
            if a.entity == b.entity || a.faction == b.faction { continue; }
            if let Some(candidate) = candidate(a, b) { scratch.candidates.push(candidate); }
        }
    }
    scratch.candidates.sort_by_key(|row| (row.fact.key, row.fact.toi, row.distance_sq, row.feature));
    scratch.candidates.dedup_by_key(|row| row.fact.key);
    scratch.facts.extend(scratch.candidates.iter().map(|row| row.fact));
}

fn candidate(a: ContactCollider, b: ContactCollider) -> Option<Candidate> {
    match (a.shape, b.shape) {
        (ContactShape::Segment { .. }, ContactShape::Segment { .. }) => {
            let ((weapon_a, shape_a), (weapon_b, shape_b)) =
                if (a.entity, a.slot) <= (b.entity, b.slot) { ((a, a.shape), (b, b.shape)) }
                else { ((b, b.shape), (a, a.shape)) };
            segment_segment_candidate(weapon_a, shape_a, weapon_b, shape_b)
        }
        (ContactShape::Segment { .. }, ContactShape::Shield { .. }) => segment_shield_candidate(a, a.shape, b, b.shape),
        (ContactShape::Shield { .. }, ContactShape::Segment { .. }) => segment_shield_candidate(b, b.shape, a, a.shape),
        (ContactShape::Segment { .. }, ContactShape::Body { .. }) => segment_body_candidate(a, a.shape, b, b.shape),
        (ContactShape::Body { .. }, ContactShape::Segment { .. }) => segment_body_candidate(b, b.shape, a, a.shape),
        _ => None,
    }
}

fn segment_segment_candidate(
    a: ContactCollider, sa: ContactShape, b: ContactCollider, sb: ContactShape,
) -> Option<Candidate> {
    let ContactShape::Segment { previous_hilt: ah0, previous_tip: at0,
        requested_hilt: ah1, requested_tip: at1, radius: ar } = sa else { unreachable!() };
    let ContactShape::Segment { previous_hilt: bh0, previous_tip: bt0,
        requested_hilt: bh1, requested_tip: bt1, radius: br } = sb else { unreachable!() };
    let toi = swept_segment_segment(ah0, at0, ah1, at1, ar, bh0, bt0, bh1, bt1, br)?;
    let t = toi.get();
    let closest = closest_points_on_segments(
        Vec3::lerp(ah0, ah1, t), Vec3::lerp(at0, at1, t),
        Vec3::lerp(bh0, bh1, t), Vec3::lerp(bt0, bt1, t),
    );
    Some(make_candidate(a, b, ContactKind::WeaponWeapon, toi, closest.a, closest.b, closest.distance_sq, 0))
}

fn segment_shield_candidate(
    weapon: ContactCollider, segment: ContactShape, shield: ContactCollider, rectangle: ContactShape,
) -> Option<Candidate> {
    let ContactShape::Segment { previous_hilt, previous_tip, requested_hilt, requested_tip, radius } = segment else { unreachable!() };
    let ContactShape::Shield { previous, requested } = rectangle else { unreachable!() };
    let toi = swept_segment_rectangle(previous_hilt, previous_tip, requested_hilt, requested_tip,
                                      radius, previous, requested)?;
    let t = toi.get();
    let face = previous.map(|point| point); // array interpolation is deliberately written by corner.
    let face = [
        Vec3::lerp(face[0], requested[0], t), Vec3::lerp(face[1], requested[1], t),
        Vec3::lerp(face[2], requested[2], t), Vec3::lerp(face[3], requested[3], t),
    ];
    let closest = closest_points_segment_rectangle(
        Vec3::lerp(previous_hilt, requested_hilt, t),
        Vec3::lerp(previous_tip, requested_tip, t), face,
    );
    Some(make_candidate(weapon, shield, ContactKind::WeaponShield, toi,
                        closest.a, closest.b, closest.distance_sq, closest.feature))
}

fn segment_body_candidate(
    weapon: ContactCollider, segment: ContactShape, body: ContactCollider, capsule: ContactShape,
) -> Option<Candidate> {
    let ContactShape::Segment { previous_hilt, previous_tip, requested_hilt, requested_tip, radius } = segment else { unreachable!() };
    let ContactShape::Body { previous_lower, previous_upper, requested_lower, requested_upper, radius: body_radius } = capsule else { unreachable!() };
    let previous_centre = midpoint(previous_lower, previous_upper);
    let requested_centre = midpoint(requested_lower, requested_upper);
    let half_height = (previous_upper.z - previous_lower.z) / 2;
    let toi = swept_segment_vertical_capsule(
        previous_hilt, previous_tip, requested_hilt, requested_tip,
        previous_centre, requested_centre, half_height, radius + body_radius,
    )?;
    let t = toi.get();
    let closest = closest_points_on_segments(
        Vec3::lerp(previous_hilt, requested_hilt, t),
        Vec3::lerp(previous_tip, requested_tip, t),
        Vec3::lerp(previous_lower, requested_lower, t),
        Vec3::lerp(previous_upper, requested_upper, t),
    );
    Some(make_candidate(weapon, body, ContactKind::WeaponBody, toi,
                        closest.a, closest.b, closest.distance_sq, 0))
}

fn make_candidate(
    a: ContactCollider, b: ContactCollider, kind: ContactKind, toi: TimeOfImpact,
    point_a: Vec3, point_b: Vec3, distance_sq: Fx, feature: u8,
) -> Candidate {
    let delta = point_b - point_a;
    let normal = if delta != Vec3::ZERO {
        delta.normalized_or_zero()
    } else if toi == TimeOfImpact::ZERO {
        Vec3::X
    } else {
        let relative = (a.velocity - b.velocity).normalized_or_zero();
        if relative == Vec3::ZERO { Vec3::X } else { relative }
    };
    Candidate {
        fact: ContactFact {
            key: ContactKey { a: a.entity, a_slot: a.slot, b: b.entity,
                              b_slot: if kind == ContactKind::WeaponBody { BODY_SLOT } else { b.slot }, kind },
            toi, region: 0xff, point: midpoint(point_a, point_b), normal,
            velocity_a: a.velocity, velocity_b: b.velocity,
        },
        distance_sq,
        feature,
    }
}

fn midpoint(a: Vec3, b: Vec3) -> Vec3 {
    let component = |a: Fx, b: Fx| Fx::from_raw(((a.raw() as i64 + b.raw() as i64) / 2) as i32);
    Vec3::new(component(a.x, b.x), component(a.y, b.y), component(a.z, b.z))
}

/// Map a local inclusive tick fraction onto the unconsumed global fraction.
/// The ceiling is load-bearing: committing one raw unit before geometry's
/// conservative answer can introduce a contact on one target only.
pub fn map_local_to_global(global_raw: u32, local_raw: u32) -> u32 {
    debug_assert!(global_raw <= 65_536 && local_raw <= 65_536);
    let remaining = 65_536u64 - global_raw as u64;
    global_raw + ((remaining * local_raw as u64 + 65_535) / 65_536) as u32
}

pub(crate) fn write_fact(bytes: &mut Vec<u8>, fact: ContactFact) {
    put_u32(bytes, fact.key.a.index);
    put_u32(bytes, fact.key.a.generation);
    put_u32(bytes, fact.key.a_slot as u32);
    put_u32(bytes, fact.key.b.index);
    put_u32(bytes, fact.key.b.generation);
    put_u32(bytes, fact.key.b_slot as u32);
    put_u32(bytes, fact.key.kind as u32);
    put_u32(bytes, fact.toi.get().raw() as u32);
    put_u32(bytes, fact.region as u32);
    put_vec3(bytes, fact.point);
    put_vec3(bytes, fact.normal);
    put_vec3(bytes, fact.velocity_a);
    put_vec3(bytes, fact.velocity_b);
}

pub(crate) fn write_impulse(bytes: &mut Vec<u8>, impulse: ContactImpulse) {
    put_u32(bytes, impulse.key.a.index);
    put_u32(bytes, impulse.key.a.generation);
    put_u32(bytes, impulse.key.a_slot as u32);
    put_u32(bytes, impulse.key.b.index);
    put_u32(bytes, impulse.key.b.generation);
    put_u32(bytes, impulse.key.b_slot as u32);
    put_u32(bytes, impulse.key.kind as u32);
    put_vec3(bytes, impulse.on_a);
    put_vec3(bytes, impulse.on_b);
}

pub(crate) fn put_u32(bytes: &mut Vec<u8>, value: u32) { bytes.extend_from_slice(&value.to_le_bytes()); }
pub(crate) fn put_u64(bytes: &mut Vec<u8>, value: u64) { bytes.extend_from_slice(&value.to_le_bytes()); }
fn put_vec3(bytes: &mut Vec<u8>, value: Vec3) {
    put_u32(bytes, value.x.raw() as u32);
    put_u32(bytes, value.y.raw() as u32);
    put_u32(bytes, value.z.raw() as u32);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::combat::spec::Material;

    fn surface() -> SurfaceSpec {
        SurfaceSpec { restitution: Fx::ZERO, friction: Fx::ZERO, edge_factor: Fx::ONE,
                      point_factor: Fx::ONE, material: Material::Steel }
    }

    fn segment(entity: u32, faction: Faction, from: Vec3, to: Vec3, velocity: Vec3) -> ContactCollider {
        ContactCollider { entity: EntityId::new(entity, 0), faction, slot: 1, mass: Fx::ONE,
            surface: surface(), velocity,
            shape: ContactShape::Segment { previous_hilt: from, previous_tip: from,
                                           requested_hilt: to, requested_tip: to, radius: Fx::ZERO } }
    }

    #[test]
    fn contact_keys_include_generation_and_have_one_total_order() {
        let mut keys = Vec::new();
        for generation in [1, 0] {
            for slot in [1, 0] {
                keys.push(ContactKey {
                    a: EntityId::new(0, generation), a_slot: slot,
                    b: EntityId::new(1, 0), b_slot: slot,
                    kind: ContactKind::WeaponWeapon,
                });
            }
        }
        keys.sort();
        assert_eq!(keys.iter().map(|k| (k.a.generation, k.a_slot)).collect::<Vec<_>>(),
                   vec![(0, 0), (0, 1), (1, 0), (1, 1)]);
    }

    #[test]
    fn global_time_ceil_does_not_commit_before_contact() {
        assert_eq!(map_local_to_global(1, 1), 2);
        assert_eq!(map_local_to_global(32_768, 32_768), 49_152);
    }

    #[test]
    fn the_last_raw_local_step_collapses_to_tick_end() {
        assert_eq!(map_local_to_global(65_535, 1), 65_536);
        assert_eq!(map_local_to_global(65_536, 1), 65_536);
    }

    #[test]
    fn allies_and_self_geometry_do_not_enter_contact_groups() {
        let same_faction = [segment(0, Faction::Heroes, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO),
                            segment(1, Faction::Heroes, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO)];
        assert!(collect_contacts(&same_faction).is_empty());
        let same_entity = [same_faction[0], ContactCollider { faction: Faction::Monsters, ..same_faction[0] }];
        assert!(collect_contacts(&same_entity).is_empty());
    }

    #[test]
    fn an_initially_separating_overlap_receives_no_attracting_impulse() {
        let quarter = Fx::from_ratio(1, 4);
        let rows = [segment(0, Faction::Heroes, Vec3::ZERO, Vec3::new(-quarter, Fx::ZERO, Fx::ZERO), -Vec3::X * quarter),
                    segment(1, Faction::Monsters, Vec3::ZERO, Vec3::new(quarter, Fx::ZERO, Fx::ZERO), Vec3::X * quarter)];
        let facts = collect_contacts(&rows);
        assert_eq!(facts.len(), 1);
        assert_eq!(facts[0].toi, TimeOfImpact::ZERO);
        assert_eq!(facts[0].normal, Vec3::X);
        let impulse = crate::combat::resolution::proposed_impulse(
            Fx::ONE, Fx::ONE, surface(), surface(), facts[0].velocity_a, facts[0].velocity_b, facts[0].normal,
        );
        assert_eq!(impulse, Vec3::ZERO);
    }

    #[test]
    fn a_positive_time_exact_crossing_uses_relative_velocity_for_its_normal() {
        let weapon = segment(0, Faction::Heroes, Vec3::X,
            Vec3::new(-Fx::ONE, Fx::ZERO, Fx::ZERO), Vec3::new(-Fx::TWO, Fx::ZERO, Fx::ZERO));
        let face = [
            Vec3::new(Fx::ZERO, -Fx::HALF, -Fx::HALF),
            Vec3::new(Fx::ZERO, Fx::HALF, -Fx::HALF),
            Vec3::new(Fx::ZERO, Fx::HALF, Fx::HALF),
            Vec3::new(Fx::ZERO, -Fx::HALF, Fx::HALF),
        ];
        let shield = ContactCollider { entity: EntityId::new(1, 0), faction: Faction::Monsters,
            slot: 0, mass: Fx::ONE, surface: surface(), velocity: Vec3::ZERO,
            shape: ContactShape::Shield { previous: face, requested: face } };
        let facts = collect_contacts(&[weapon, shield]);
        assert_eq!(facts.len(), 1);
        assert!(facts[0].toi > TimeOfImpact::ZERO);
        assert_eq!(facts[0].normal, -Vec3::X);
        let impulse = crate::combat::resolution::proposed_impulse(
            Fx::ONE, Fx::ONE, surface(), surface(), facts[0].velocity_a, facts[0].velocity_b, facts[0].normal,
        );
        assert!(impulse.x > Fx::ZERO);
    }

    #[test]
    fn a_body_facing_shield_blocks_only_its_surface() {
        let face = [
            Vec3::new(Fx::ZERO, -Fx::HALF, -Fx::HALF), Vec3::new(Fx::ZERO, Fx::HALF, -Fx::HALF),
            Vec3::new(Fx::ZERO, Fx::HALF, Fx::HALF), Vec3::new(Fx::ZERO, -Fx::HALF, Fx::HALF),
        ];
        let shield = ContactCollider { entity: EntityId::new(2, 0), faction: Faction::Monsters,
            slot: 0, mass: Fx::ONE, surface: surface(), velocity: Vec3::ZERO,
            shape: ContactShape::Shield { previous: face, requested: face } };
        let hit = segment(0, Faction::Heroes, Vec3::X, -Vec3::X, -Vec3::X * Fx::TWO);
        let miss = segment(1, Faction::Heroes,
            Vec3::new(Fx::ONE, Fx::from_ratio(3, 4), Fx::ZERO),
            Vec3::new(-Fx::ONE, Fx::from_ratio(3, 4), Fx::ZERO), -Vec3::X * Fx::TWO);
        let facts = collect_contacts(&[hit, miss, shield]);
        assert_eq!(facts.len(), 1);
        assert_eq!(facts[0].key.a.index, 0);
        assert_eq!(facts[0].key.kind, ContactKind::WeaponShield);
    }
}
