//! Per-owner articulated clearance.
//!
//! Hostile contact deliberately excludes one entity from itself. This phase is
//! the complementary anatomical constraint: fixed workspace, endpoint-linear
//! sweeps, no damage/event route, and no contact-runtime participation.

use super::*;
use crate::combat::actuator::ArmWorkProposal;
use crate::combat::geometry::{held_segment_colliders, held_shield_collider,
                              jointed_body_region_volumes};
use crate::combat::limb::{elbow_point, shoulder, Elbow};

const SELF_COLLISION_PASSES: usize = 8;
const SELF_COLLISION_BISECTIONS: usize = 16;

#[derive(Clone, Copy)]
enum SelfShape {
    Segment { limb: usize, kind: u8, a: Vec3, b: Vec3, radius: Fx },
    Rectangle { limb: usize, corners: [Vec3; 4] },
}

#[derive(Clone, Copy)]
struct OwnerPose {
    shapes: [[Option<SelfShape>; 4]; 2],
    rigid: [RegionVolume; 3],
    shoulders: [Vec3; 2],
}

#[derive(Clone, Copy)]
struct Hit {
    fraction: Fx,
    participants: [bool; 2],
    pair: crate::diagnostics::SelfCollisionAttemptDiagnostic,
}

pub(super) struct ConstrainedArms {
    pub arms: [ArmState; 2],
    pub planes: [ElbowPlaneState; 2],
    pub physical_com: [Vec3; 2],
    pub fractions: [Fx; 2],
}

fn shield_pose_for(
    table: &CombatSpecTableV1, arms: [ArmState; 2], grips: [GripState; 2],
    carried: [Option<EquipmentSpecId>; 2],
) -> Option<ShieldPose> {
    for limb in 0..2 {
        let Some(slot) = grips[limb].equipment_slot else { continue };
        let Some(id) = carried.get(slot as usize).copied().flatten() else { continue };
        let Some(item) = table.equipment(id) else { continue };
        if let crate::EquipmentGeometry::Shield { half_width, half_height, thickness }
            = item.geometry
        {
            return Some(ShieldPose {
                centre: arms[limb].hand,
                normal: Vec3::new(arms[limb].bearing.cos(), arms[limb].bearing.sin(), Fx::ZERO),
                half_width, half_height, thickness,
            });
        }
    }
    None
}

fn socket_trim(a: Vec3, b: Vec3, shoulder: Vec3, radius: Fx) -> (Vec3, Vec3) {
    let raw_distance_sq = |point: Vec3| {
        let dx = point.x.raw() as i128 - shoulder.x.raw() as i128;
        let dy = point.y.raw() as i128 - shoulder.y.raw() as i128;
        let dz = point.z.raw() as i128 - shoulder.z.raw() as i128;
        dx * dx + dy * dy + dz * dz
    };
    let radius_sq = radius.raw() as i128 * radius.raw() as i128;
    let (socket, far, reversed) = if raw_distance_sq(a) <= raw_distance_sq(b) {
        (a, b, false)
    } else {
        (b, a, true)
    };
    let axis = far - socket;
    let length = axis.length();
    let trimmed = if length <= radius || !length.is_positive() {
        far
    } else {
        // The socket boundary itself is excluded. Start the live segment at
        // the first representable point beyond it; otherwise the capsule at a
        // trimmed endpoint would immediately re-introduce the inclusive point
        // the semantic exclusion just removed.
        let mut distance = radius + Fx::EPSILON;
        let mut point = socket + axis * (distance / length);
        for _ in 0..8 {
            if raw_distance_sq(point) > radius_sq { break }
            distance += Fx::EPSILON;
            point = socket + axis * (distance / length);
        }
        point
    };
    if reversed { (far, trimmed) } else { (trimmed, far) }
}

fn shape_at(a: SelfShape, b: SelfShape, fraction: Fx) -> SelfShape {
    match (a, b) {
        (SelfShape::Segment { limb, kind, a: a0, b: a1, radius },
         SelfShape::Segment { a: b0, b: b1, .. }) => SelfShape::Segment {
            limb, kind, a: Vec3::lerp(a0, b0, fraction),
            b: Vec3::lerp(a1, b1, fraction), radius,
        },
        (SelfShape::Rectangle { limb, corners: a },
         SelfShape::Rectangle { corners: b, .. }) => SelfShape::Rectangle {
            limb,
            corners: core::array::from_fn(|i| Vec3::lerp(a[i], b[i], fraction)),
        },
        _ => a,
    }
}

fn overlap(a: SelfShape, b: SelfShape) -> bool {
    separation(a, b) <= Fx::ZERO
}

fn separation(a: SelfShape, b: SelfShape) -> Fx {
    match (a, b) {
        (SelfShape::Segment { a: a0, b: a1, radius: ar, .. },
         SelfShape::Segment { a: b0, b: b1, radius: br, .. }) => {
            let closest = fx::closest_points_on_segments(a0, a1, b0, b1);
            let radius = ar + br;
            closest.a.distance(closest.b) - radius
        }
        (SelfShape::Segment { a, b, radius, .. }, SelfShape::Rectangle { corners, .. })
        | (SelfShape::Rectangle { corners, .. }, SelfShape::Segment { a, b, radius, .. }) => {
            let closest = fx::closest_points_segment_rectangle(a, b, corners);
            closest.a.distance(closest.b) - radius
        }
        (SelfShape::Rectangle { .. }, SelfShape::Rectangle { .. }) => Fx::ONE,
    }
}

fn relative_speed(a0: SelfShape, a1: SelfShape, b0: SelfShape, b1: SelfShape) -> Fx {
    let endpoints = |a, b| match (a, b) {
        (SelfShape::Segment { a: a0, b: a1, .. },
         SelfShape::Segment { a: b0, b: b1, .. }) =>
            ([b0 - a0, b1 - a1, Vec3::ZERO, Vec3::ZERO], 2),
        (SelfShape::Rectangle { corners: a, .. },
         SelfShape::Rectangle { corners: b, .. }) =>
            (core::array::from_fn(|i| b[i] - a[i]), 4),
        _ => ([Vec3::ZERO; 4], 0),
    };
    let (ad, an) = endpoints(a0, a1);
    let (bd, bn) = endpoints(b0, b1);
    let mut speed = Fx::ZERO;
    for ai in 0..an {
        for bi in 0..bn {
            speed = speed.max((ad[ai] - bd[bi]).length());
        }
    }
    speed
}

fn last_clear(a0: SelfShape, a1: SelfShape, b0: SelfShape, b1: SelfShape)
    -> Option<Fx>
{
    let speed = relative_speed(a0, a1, b0, b1);
    let bracket = fx::conservative_sweep_after_release_bracket(speed, |fraction| {
        separation(shape_at(a0, a1, fraction), shape_at(b0, b1, fraction))
    })?;
    if bracket.exhausted { return Some(bracket.last_clear.get()); }
    let mut clear = bracket.last_clear.get();
    let mut hit = bracket.first_hit.get();
    for _ in 0..SELF_COLLISION_BISECTIONS {
        let middle = Fx::from_raw((clear.raw() as i64
            + (hit.raw() as i64 - clear.raw() as i64) / 2) as i32);
        if overlap(shape_at(a0, a1, middle), shape_at(b0, b1, middle)) {
            hit = middle;
        } else {
            clear = middle;
        }
    }
    Some(clear)
}

pub(super) fn annulus_last_clear(
    entry: Vec3, proposed: Vec3, shoulder: Vec3,
    links: crate::combat::limb::Elbow, inner: Fx, outer: Fx,
)
    -> Option<Fx>
{
    let speed = (proposed - entry).length();
    let hand_at = |fraction| Vec3::lerp(entry, proposed, fraction);
    let distance = |fraction| (hand_at(fraction) - shoulder).length();
    let valid = |fraction| {
        let delta = hand_at(fraction) - shoulder;
        let square = delta.x.raw() as i128 * delta.x.raw() as i128
            + delta.y.raw() as i128 * delta.y.raw() as i128
            + delta.z.raw() as i128 * delta.z.raw() as i128;
        let inner_square = inner.raw() as i128 * inner.raw() as i128;
        let outer_square = outer.raw() as i128 * outer.raw() as i128;
        square >= inner_square && square <= outer_square
            && crate::combat::limb::elbow_point(
                shoulder, hand_at(fraction), links, Angle::ZERO).is_some()
    };
    // Stance moves the shoulder before the arms phase. A hand that was valid
    // against last tick's shoulder can therefore enter this path just outside
    // the new annulus. Treat that entry like structural overlap: allow it to
    // become reachable, then constrain any same-tick re-exit. Returning zero
    // here would restore the invalid old hand forever.
    let bracket_for = |inside: bool| fx::conservative_sweep_after_release_bracket(speed, |fraction| {
        if inside { distance(fraction) - inner } else { outer - distance(fraction) }
    });
    let mut winner = [bracket_for(true), bracket_for(false)].into_iter().flatten()
        .min_by_key(|row| row.last_clear.get().raw())?;
    let mut clear = winner.last_clear.get();
    let mut hit = winner.first_hit.get();
    for _ in 0..SELF_COLLISION_BISECTIONS {
        let middle = Fx::from_raw((clear.raw() as i64
            + (hit.raw() as i64 - clear.raw() as i64) / 2) as i32);
        if valid(middle) { clear = middle } else { hit = middle }
    }
    winner.last_clear = fx::TimeOfImpact::new_clamped(clear);
    Some(winner.last_clear.get())
}

fn constrained_fractions(
    current: [Fx; 2], participants: [bool; 2], fraction: Fx,
) -> [Fx; 2] {
    if participants == [true; 2] {
        let shared = current[0].min(current[1]) * fraction;
        return [shared; 2]
    }
    core::array::from_fn(|limb| if participants[limb] {
        current[limb] * fraction
    } else {
        current[limb]
    })
}

impl World {
    fn owner_pose(
        &self, i: usize, anatomy: &BodyAnatomySpec, arms: [ArmState; 2],
        planes: [ElbowPlaneState; 2],
    ) -> OwnerPose {
        let table = self.combat_specs.as_ref().expect("articulated combat specs");
        let yaw = self.body_yaw[i].angle;
        let links = Elbow::of(anatomy);
        let shoulders = core::array::from_fn(|limb| shoulder(anatomy, yaw, limb));
        let elbows = core::array::from_fn(|limb|
            elbow_point(shoulders[limb], arms[limb].hand, links, planes[limb].held));
        let present = [
            self.wounds[i].present(BodyPart::Head),
            self.wounds[i].present(BodyPart::Torso),
            self.wounds[i].present(BodyPart::LeftArm),
            self.wounds[i].present(BodyPart::RightArm),
            self.wounds[i].present(BodyPart::Legs),
        ];
        let regions = jointed_body_region_volumes(
            Vec3::ZERO, anatomy, yaw, arms.map(|arm| arm.hand), present, elbows,
        );
        let held = held_segment_colliders(
            Vec3::ZERO, Vec3::ZERO, arms, arms, self.grips[i], self.body_carried[i],
            |id| table.equipment(id).copied(),
        );
        let shield_pose = shield_pose_for(table, arms, self.grips[i], self.body_carried[i]);
        let shield = held_shield_collider(
            Vec3::ZERO, Vec3::ZERO, shield_pose, shield_pose,
            self.grips[i], self.body_carried[i], |id| table.equipment(id).copied(),
        );
        let mut shapes = [[None; 4]; 2];
        for limb in 0..2 {
            let upper = if limb == 0 { 2 } else { 3 };
            let fore = if limb == 0 { 5 } else { 6 };
            for (kind, region) in [(0u8, regions[upper]), (1u8, regions[fore])] {
                if region.present {
                    shapes[limb][kind as usize] = Some(SelfShape::Segment {
                        limb, kind, a: region.lower, b: region.upper, radius: region.radius,
                    });
                }
            }
            if let Some(collider) = held[limb] {
                shapes[limb][2] = Some(SelfShape::Segment {
                    limb, kind: 2, a: collider.requested.hilt,
                    b: collider.requested.tip, radius: collider.requested.radius,
                });
            }
        }
        if let Some(collider) = shield {
            let limb = collider.owner as usize;
            shapes[limb][3] = Some(SelfShape::Rectangle {
                limb, corners: collider.requested.corners,
            });
        }
        OwnerPose {
            shapes,
            rigid: [regions[0], regions[1], regions[4]],
            shoulders,
        }
    }

    fn first_self_hit(&self, previous: OwnerPose, requested: OwnerPose) -> Option<Hit> {
        let mut winner = None;
        for limb in 0..2 {
            for kind in 0..4 {
                let (Some(moving0), Some(moving1)) =
                    (previous.shapes[limb][kind], requested.shapes[limb][kind]) else { continue };
                for (rigid_order, region) in [0usize, 1, 2].into_iter().enumerate() {
                    let (mut pair_moving0, mut pair_moving1) = (moving0, moving1);
                    let (obstacle0, obstacle1) = (
                        SelfShape::Segment { limb: 2, kind: rigid_order as u8,
                            a: previous.rigid[region].lower, b: previous.rigid[region].upper,
                            radius: previous.rigid[region].radius },
                        SelfShape::Segment { limb: 2, kind: rigid_order as u8,
                            a: requested.rigid[region].lower, b: requested.rigid[region].upper,
                            radius: requested.rigid[region].radius },
                    );
                    if !previous.rigid[region].present || !requested.rigid[region].present { continue }
                    // Rigid index one is torso. Only its upper-arm socket is a
                    // semantic neighbour; trimming exactly one arm radius makes
                    // both sides of that boundary part of the same sweep law.
                    if kind == 0 && region == 1 {
                        if let SelfShape::Segment { a, b, radius, .. } = pair_moving0 {
                            let (a, b) = socket_trim(a, b, previous.shoulders[limb], radius);
                            pair_moving0 = SelfShape::Segment { limb, kind: 0, a, b, radius };
                        }
                        if let SelfShape::Segment { a, b, radius, .. } = pair_moving1 {
                            let (a, b) = socket_trim(a, b, requested.shoulders[limb], radius);
                            pair_moving1 = SelfShape::Segment { limb, kind: 0, a, b, radius };
                        }
                    }
                    if let Some(fraction) = last_clear(
                        pair_moving0, pair_moving1, obstacle0, obstacle1,
                    ) {
                        let hit = Hit {
                            fraction,
                            participants: core::array::from_fn(|x| x == limb),
                            pair: crate::diagnostics::SelfCollisionAttemptDiagnostic {
                                moving_limb: limb as u8,
                                moving_shape: kind as u8,
                                obstacle: crate::diagnostics::SelfCollisionObstacleDiagnostic::Body {
                                    region: [0u8, 1, 4][region],
                                },
                                last_clear: fraction,
                            },
                        };
                        if winner.is_none_or(|old: Hit| hit.fraction < old.fraction) { winner = Some(hit); }
                    }
                }
                let other = 1 - limb;
                for obstacle_kind in 0..4 {
                    let (Some(obstacle0), Some(obstacle1)) =
                        (previous.shapes[other][obstacle_kind], requested.shapes[other][obstacle_kind])
                        else { continue };
                    // Two plates cannot reach runtime: `validate_bindings`
                    // refuses a two-shield loadout. Rectangle/rectangle has no
                    // silent fallback here because accepting that loadout
                    // would first require adding its deterministic predicate.
                    if matches!((moving0, obstacle0),
                        (SelfShape::Rectangle { .. }, SelfShape::Rectangle { .. })) { continue }
                    if let Some(fraction) = last_clear(moving0, moving1, obstacle0, obstacle1) {
                        let hit = Hit {
                            fraction,
                            participants: [true; 2],
                            pair: crate::diagnostics::SelfCollisionAttemptDiagnostic {
                                moving_limb: limb as u8,
                                moving_shape: kind as u8,
                                obstacle: crate::diagnostics::SelfCollisionObstacleDiagnostic::OppositeShape {
                                    limb: other as u8,
                                    shape: obstacle_kind as u8,
                                },
                                last_clear: fraction,
                            },
                        };
                        if winner.is_none_or(|old: Hit| hit.fraction < old.fraction) { winner = Some(hit); }
                    }
                }
            }
        }
        winner
    }

    pub(super) fn constrain_arm_proposals(
        &mut self, i: usize, anatomy: &BodyAnatomySpec,
        entry: [ArmState; 2], proposed: [ArmState; 2],
        entry_planes: [ElbowPlaneState; 2], proposed_planes: [ElbowPlaneState; 2],
        work: [ArmWorkProposal; 2], linked: bool,
    ) -> ConstrainedArms {
        self.self_collision_attempt[i] = None;
        // **TEMPORARY DIAGNOSTIC -- see `actuator::UNLIMITED_MOTION`.** A swept
        // stop is a motion limit as surely as a rate ceiling is, so the probe
        // that removes the ceilings has to remove this too or it would answer
        // the owner's question with the arm still pinned at its own legs.
        // Revert with the switch.
        if actuator::UNLIMITED_MOTION {
            return ConstrainedArms {
                arms: proposed, planes: proposed_planes,
                physical_com: [work[0].physical_com_at(Fx::ONE),
                               work[1].physical_com_at(Fx::ONE)],
                fractions: [Fx::ONE; 2],
            };
        }
        let mut proposed = proposed;
        let previous = self.owner_pose(i, anatomy, entry, entry_planes);
        let mut fractions = [Fx::ONE; 2];
        let mut arms = proposed;
        let mut planes = proposed_planes;
        let mut physical_com = [work[0].physical_com_at(Fx::ONE),
                                work[1].physical_com_at(Fx::ONE)];
        let mut minimum = [Fx::ZERO; 2];
        let plane_at = |a: ElbowPlaneState, b: ElbowPlaneState, fraction: Fx| {
            let delta = b.held.delta(a.held);
            let held = Angle::from_raw(a.held.raw().wrapping_add(
                ((delta as i64 * fraction.raw() as i64) / Fx::ONE.raw() as i64) as u16));
            ElbowPlaneState { held, commanded: b.commanded }
        };
        let mut involved = [false; 2];
        let links = crate::combat::limb::Elbow::of(anatomy);
        let (inner, outer) = links.reach_bounds();
        for limb in 0..2 {
            let shoulder = crate::combat::limb::shoulder(anatomy, self.body_yaw[i].angle, limb);
            let valid = |hand: Vec3| {
                let delta = hand - shoulder;
                let square = delta.x.raw() as i128 * delta.x.raw() as i128
                    + delta.y.raw() as i128 * delta.y.raw() as i128
                    + delta.z.raw() as i128 * delta.z.raw() as i128;
                square >= inner.raw() as i128 * inner.raw() as i128
                    && square <= outer.raw() as i128 * outer.raw() as i128
                    && crate::combat::limb::elbow_point(
                        shoulder, hand, links, proposed_planes[limb].held).is_some()
            };
            if !valid(proposed[limb].hand) {
                let old = proposed[limb].hand;
                let (height, reach, hand) = crate::combat::limb::reachable_pose(
                    anatomy, self.body_yaw[i].angle, limb, proposed[limb].bearing,
                    proposed[limb].height, proposed[limb].reach, links);
                proposed[limb].height = height;
                proposed[limb].reach = reach;
                proposed[limb].hand = hand;
                proposed[limb].linear_velocity = hand - proposed[limb].previous_hand;
                physical_com[limb] += hand - old;
                arms[limb] = proposed[limb];
            }
            let entry_valid = {
                let delta = entry[limb].hand - shoulder;
                let square = delta.x.raw() as i128 * delta.x.raw() as i128
                    + delta.y.raw() as i128 * delta.y.raw() as i128
                    + delta.z.raw() as i128 * delta.z.raw() as i128;
                square >= inner.raw() as i128 * inner.raw() as i128
                    && square <= outer.raw() as i128 * outer.raw() as i128
                    && crate::combat::limb::elbow_point(
                        shoulder, entry[limb].hand, links, entry_planes[limb].held).is_some()
            };
            if !entry_valid {
                debug_assert!(valid(proposed[limb].hand),
                    "joint recovery did not produce a valid endpoint");
                let valid_at = |fraction| valid(Vec3::lerp(
                    entry[limb].hand, proposed[limb].hand, fraction));
                let mut invalid = Fx::ZERO;
                let mut clear = Fx::ONE;
                for _ in 0..SELF_COLLISION_BISECTIONS {
                    let middle = Fx::from_raw((invalid.raw() as i64
                        + (clear.raw() as i64 - invalid.raw() as i64) / 2) as i32);
                    if valid_at(middle) { clear = middle } else { invalid = middle }
                }
                minimum[limb] = clear;
            }
            let Some(fraction) = annulus_last_clear(
                entry[limb].hand, proposed[limb].hand, shoulder,
                links, inner, outer) else { continue };
            fractions[limb] = fraction;
            involved[limb] = true;
        }
        if linked {
            let fraction = fractions[0].min(fractions[1]).max(minimum[0].max(minimum[1]));
            fractions = [fraction; 2];
            involved = [true; 2];
        }
        for limb in 0..2 {
            if fractions[limb] == Fx::ONE { continue }
            let achieved = actuator::achieved_arm_state(
                entry[limb], proposed[limb], work[limb], anatomy,
                self.body_yaw[i].angle, limb, fractions[limb], true);
            arms[limb] = achieved.0;
            physical_com[limb] = achieved.1;
            planes[limb] = plane_at(entry_planes[limb], proposed_planes[limb], fractions[limb]);
        }
        for _ in 0..SELF_COLLISION_PASSES {
            let requested = self.owner_pose(i, anatomy, arms, planes);
            let Some(hit) = self.first_self_hit(previous, requested) else { break };
            if self.self_collision_attempt[i].is_none() {
                self.self_collision_attempt[i] = Some(hit.pair);
            }
            let next_fractions = constrained_fractions(
                fractions, hit.participants, hit.fraction);
            for limb in 0..2 {
                if !hit.participants[limb] { continue }
                involved[limb] = true;
                fractions[limb] = next_fractions[limb].max(minimum[limb]);
                let achieved = actuator::achieved_arm_state(
                    entry[limb], proposed[limb], work[limb], anatomy,
                    self.body_yaw[i].angle, limb, fractions[limb], true);
                arms[limb] = achieved.0;
                physical_com[limb] = achieved.1;
                planes[limb] = plane_at(entry_planes[limb], proposed_planes[limb], fractions[limb]);
            }
            if linked {
                let fraction = fractions[0].min(fractions[1]).max(minimum[0].max(minimum[1]));
                for limb in 0..2 {
                    fractions[limb] = fraction;
                    involved[limb] = true;
                    let achieved = actuator::achieved_arm_state(
                        entry[limb], proposed[limb], work[limb], anatomy,
                        self.body_yaw[i].angle, limb, fraction, true);
                    arms[limb] = achieved.0;
                    physical_com[limb] = achieved.1;
                    planes[limb] = plane_at(entry_planes[limb], proposed_planes[limb], fraction);
                }
            }
        }
        if let Some(hit) = self.first_self_hit(previous, self.owner_pose(i, anatomy, arms, planes)) {
            for limb in 0..2 {
                if hit.participants[limb] || involved[limb] {
                    let fraction = if linked { minimum[0].max(minimum[1]) } else { minimum[limb] };
                    let achieved = actuator::achieved_arm_state(
                        entry[limb], proposed[limb], work[limb], anatomy,
                        self.body_yaw[i].angle, limb, fraction, true);
                    arms[limb] = achieved.0;
                    planes[limb] = plane_at(entry_planes[limb], proposed_planes[limb], fraction);
                    physical_com[limb] = achieved.1;
                }
            }
        }
        debug_assert!(arms.into_iter().enumerate().all(|(limb, arm)|
            crate::combat::limb::elbow_point(
                crate::combat::limb::shoulder(anatomy, self.body_yaw[i].angle, limb),
                arm.hand, links, planes[limb].held).is_some()),
            "owner constraint committed an arm outside its elbow annulus: entity={i} fractions={fractions:?}");
        ConstrainedArms { arms, planes, physical_com, fractions }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn segment(a: Vec3, b: Vec3, radius: Fx) -> SelfShape {
        SelfShape::Segment { limb: 0, kind: 0, a, b, radius }
    }

    fn shaped_segment(limb: usize, kind: u8, a: Vec3, b: Vec3, radius: Fx) -> SelfShape {
        SelfShape::Segment { limb, kind, a, b, radius }
    }

    fn absent_region() -> RegionVolume {
        RegionVolume { lower: Vec3::ZERO, upper: Vec3::ZERO, radius: Fx::ZERO, present: false }
    }

    fn owner_pose(shapes: [[Option<SelfShape>; 4]; 2]) -> OwnerPose {
        OwnerPose { shapes, rigid: [absent_region(); 3], shoulders: [Vec3::ZERO; 2] }
    }

    fn scanner() -> World {
        World::new(&Scenario::embodied_duel(), 1)
    }

    #[test]
    fn socket_clearance_is_pinned_on_both_sides_of_one_upper_arm_radius() {
        let radius = Fx::from_ratio(1, 4);
        for (a, b) in [(Vec3::ZERO, Vec3::X), (Vec3::X, Vec3::ZERO)] {
            let (trimmed_a, trimmed_b) = socket_trim(a, b, Vec3::ZERO, radius);
            let live = if trimmed_a.distance_sq(Vec3::ZERO)
                < trimmed_b.distance_sq(Vec3::ZERO) { trimmed_a } else { trimmed_b };
            let raw_sq = |point: Vec3| {
                let x = point.x.raw() as i128;
                let y = point.y.raw() as i128;
                let z = point.z.raw() as i128;
                x * x + y * y + z * z
            };
            let boundary = radius.raw() as i128 * radius.raw() as i128;
            assert!(raw_sq(live) > boundary);
            let inside = Vec3::new(Fx::from_raw(live.x.raw() - 1), live.y, live.z);
            assert!(raw_sq(inside) <= boundary);
        }
    }

    #[test]
    fn two_reachable_endpoints_cannot_commit_a_chord_inside_the_elbow_annulus() {
        let anatomy = crate::fighter_anatomy();
        let links = crate::combat::limb::Elbow::of(&anatomy);
        let (inner, outer) = links.reach_bounds();
        let shoulder = Vec3::ZERO;
        let entry = Vec3::new(outer, Fx::ZERO, Fx::ZERO);
        let proposed = Vec3::new(-outer, Fx::ZERO, Fx::ZERO);
        let fraction = annulus_last_clear(
            entry, proposed, shoulder, links, inner, outer)
            .expect("the chord never entered the elbow stop");
        assert!(fraction > Fx::ZERO && fraction < Fx::ONE,
            "the annulus did not constrain the interior chord: {fraction:?}");
        let hand = Vec3::lerp(entry, proposed, fraction);
        assert!(crate::combat::limb::elbow_point(
            shoulder, hand, links, Angle::ZERO).is_some(),
            "the committed endpoint has no elbow");
        assert!(crate::combat::limb::elbow_point(
            shoulder, Vec3::lerp(entry, proposed, Fx::from_ratio(1, 2)),
            links, Angle::ZERO).is_none(),
            "the midpoint mutation never entered the forbidden inner annulus");
    }

    #[test]
    fn a_moving_pair_uses_one_shared_fraction_after_an_earlier_single_arm_stop() {
        let current = [Fx::from_ratio(1, 2), Fx::from_ratio(3, 4)];
        assert_eq!(
            constrained_fractions(current, [true; 2], Fx::from_ratio(1, 2)),
            [Fx::from_ratio(1, 4); 2],
        );
        assert_eq!(
            constrained_fractions(current, [true, false], Fx::from_ratio(1, 2)),
            [Fx::from_ratio(1, 4), Fx::from_ratio(3, 4)],
        );
    }

    #[test]
    fn a_held_sword_cannot_sweep_through_its_owners_torso() {
        let moving0 = segment(Vec3::from_ints(-2, 0, 0), Vec3::from_ints(-1, 0, 0), Fx::from_ratio(1, 10));
        let moving1 = segment(Vec3::from_ints(1, 0, 0), Vec3::from_ints(2, 0, 0), Fx::from_ratio(1, 10));
        let torso = segment(Vec3::from_ints(0, 0, -1), Vec3::from_ints(0, 0, 1), Fx::from_ratio(1, 3));
        let clear = last_clear(moving0, moving1, torso, torso).expect("the blade crosses the torso");
        assert!(clear > Fx::ZERO && clear < Fx::ONE);
        assert!(!overlap(shape_at(moving0, moving1, clear), torso));
        assert!(overlap(shape_at(moving0, moving1, clear + Fx::EPSILON), torso));
    }

    #[test]
    fn an_entry_overlap_may_clear_but_cannot_clear_and_reenter() {
        let stationary = segment(Vec3::ZERO, Vec3::ZERO, Fx::from_ratio(1, 4));
        let start = segment(Vec3::ZERO, Vec3::ZERO, Fx::ZERO);
        let clear_end = segment(Vec3::X, Vec3::X, Fx::ZERO);
        assert_eq!(last_clear(start, clear_end, stationary, stationary), None);

        let bracket = fx::conservative_sweep_after_release_bracket(Fx::from_int(2), |time| {
            Fx::from_ratio(1, 4) - (time * Fx::from_int(2) - Fx::ONE).abs()
        }).expect("the released path re-enters");
        assert!(bracket.last_clear.get() > Fx::HALF);
        assert!(bracket.first_hit.get() > bracket.last_clear.get());
    }

    #[test]
    fn opposite_arms_stop_at_one_shared_contact_fraction() {
        let radius = Fx::from_ratio(1, 10);
        let mut before = [[None; 4]; 2];
        let mut after = before;
        before[0][0] = Some(shaped_segment(0, 0,
            Vec3::from_ints(-2, 0, 0), Vec3::from_ints(-1, 0, 0), radius));
        after[0][0] = Some(shaped_segment(0, 0,
            Vec3::from_ints(1, 0, 0), Vec3::from_ints(2, 0, 0), radius));
        before[1][1] = Some(shaped_segment(1, 1,
            Vec3::from_ints(0, -1, 0), Vec3::from_ints(0, 1, 0), radius));
        after[1][1] = before[1][1];
        let hit = scanner().first_self_hit(owner_pose(before), owner_pose(after))
            .expect("the arms crossed without a self hit");
        assert_eq!(hit.participants, [true; 2]);
        assert!(hit.fraction > Fx::ZERO && hit.fraction < Fx::ONE);
        assert_eq!(constrained_fractions([Fx::from_ratio(3, 4), Fx::HALF],
            hit.participants, Fx::HALF), [Fx::from_ratio(1, 4); 2],
            "moving/moving participants did not inherit one shared minimum fraction");
    }

    #[test]
    fn opposite_held_items_and_a_shield_are_part_of_the_same_scan() {
        let radius = Fx::from_ratio(1, 10);
        let mut before = [[None; 4]; 2];
        let mut after = before;
        before[0][2] = Some(shaped_segment(0, 2,
            Vec3::from_ints(-2, 0, 0), Vec3::from_ints(-1, 0, 0), radius));
        after[0][2] = Some(shaped_segment(0, 2,
            Vec3::from_ints(1, 0, 0), Vec3::from_ints(2, 0, 0), radius));
        before[1][2] = Some(shaped_segment(1, 2,
            Vec3::from_ints(0, -1, 0), Vec3::from_ints(0, 1, 0), radius));
        after[1][2] = before[1][2];
        let held = scanner().first_self_hit(owner_pose(before), owner_pose(after))
            .expect("removing the held-segment scan must make this fail");
        assert_eq!(held.pair.volume_codes(), (7, 8));

        let plate = SelfShape::Rectangle { limb: 1, corners: [
            Vec3::from_ints(0, -1, -1), Vec3::from_ints(0, 1, -1),
            Vec3::from_ints(0, 1, 1), Vec3::from_ints(0, -1, 1),
        ] };
        before[1][2] = None; after[1][2] = None;
        before[1][3] = Some(plate); after[1][3] = Some(plate);
        let shield = scanner().first_self_hit(owner_pose(before), owner_pose(after))
            .expect("the opposite shield was omitted from the scan");
        assert_eq!(shield.pair.volume_codes(), (7, 9));
    }

    #[test]
    fn adjacent_shoulder_elbow_hand_and_hilt_shapes_are_not_self_contacts() {
        let same = shaped_segment(0, 0, Vec3::ZERO, Vec3::X, Fx::from_ratio(1, 4));
        let mut shapes = [[None; 4]; 2];
        shapes[0] = [Some(same), Some(same), Some(same), None];
        assert!(scanner().first_self_hit(owner_pose(shapes), owner_pose(shapes)).is_none(),
            "same-arm semantic neighbours entered the opposite-arm/body scanner");
    }

    #[test]
    fn a_two_handed_item_contributes_one_held_shape_for_its_driving_arm() {
        let mut scenario = Scenario::embodied_duel();
        let mut both = crate::club();
        both.id = 4;
        both.binding = crate::GripBinding::Both;
        scenario.combat_specs.as_mut().unwrap().equipment.push(both);
        scenario.units[1].combat_spec.as_mut().unwrap().equipment = [Some(4), None];
        let world = World::new(&scenario, 1);
        assert_eq!(world.grips[1].map(|grip| grip.equipment_slot), [Some(0); 2]);
        let anatomy = world.anatomy_spec(1).unwrap();
        let pose = world.owner_pose(1, anatomy, world.arms[1], world.elbow_plane[1]);
        assert_eq!(pose.shapes.iter().filter(|row| row[2].is_some()).count(), 1,
            "GripBinding::Both duplicated one held segment into the self scan");
    }

    #[test]
    fn self_collision_selects_the_earliest_pair_in_canonical_order() {
        let radius = Fx::from_ratio(1, 10);
        let moving0 = shaped_segment(0, 0,
            Vec3::from_ints(-2, 0, 0), Vec3::from_ints(-1, 0, 0), radius);
        let moving1 = shaped_segment(0, 0,
            Vec3::from_ints(1, 0, 0), Vec3::from_ints(2, 0, 0), radius);
        let obstacle = RegionVolume { lower: Vec3::from_ints(0, -1, 0),
            upper: Vec3::from_ints(0, 1, 0), radius, present: true };
        let mut before = owner_pose([[Some(moving0), None, None, None], [None; 4]]);
        let mut after = owner_pose([[Some(moving1), None, None, None], [None; 4]]);
        before.rigid = [obstacle; 3]; after.rigid = [obstacle; 3];
        let hit = scanner().first_self_hit(before, after).expect("the canonical tie vanished");
        assert_eq!(hit.pair.moving_limb, 0);
        assert_eq!(hit.pair.moving_shape, 0);
        assert_eq!(hit.pair.obstacle,
            crate::diagnostics::SelfCollisionObstacleDiagnostic::Body { region: 0 },
            "reversing the pair order changed the winner of an exact tie");
    }

    #[test]
    fn self_collision_is_reflection_and_limb_swap_invariant() {
        fn reflected(shape: SelfShape) -> SelfShape {
            match shape {
                SelfShape::Segment { limb, kind, a, b, radius } => SelfShape::Segment {
                    limb: 1 - limb, kind,
                    a: Vec3::new(a.x, -a.y, a.z), b: Vec3::new(b.x, -b.y, b.z), radius,
                },
                SelfShape::Rectangle { .. } => unreachable!(),
            }
        }
        let radius = Fx::from_ratio(1, 10);
        let moving0 = shaped_segment(0, 1,
            Vec3::from_ints(-2, -1, 0), Vec3::from_ints(-1, -1, 0), radius);
        let moving1 = shaped_segment(0, 1,
            Vec3::from_ints(1, -1, 0), Vec3::from_ints(2, -1, 0), radius);
        let fixed = shaped_segment(1, 0,
            Vec3::from_ints(0, -2, 0), Vec3::from_ints(0, 0, 0), radius);
        let mut a0 = [[None; 4]; 2]; let mut a1 = a0;
        a0[0][1] = Some(moving0); a1[0][1] = Some(moving1);
        a0[1][0] = Some(fixed); a1[1][0] = Some(fixed);
        let plain = scanner().first_self_hit(owner_pose(a0), owner_pose(a1)).unwrap();
        let mut b0 = [[None; 4]; 2]; let mut b1 = b0;
        b0[1][1] = Some(reflected(moving0)); b1[1][1] = Some(reflected(moving1));
        b0[0][0] = Some(reflected(fixed)); b1[0][0] = Some(reflected(fixed));
        let mirror = scanner().first_self_hit(owner_pose(b0), owner_pose(b1)).unwrap();
        assert_eq!(plain.fraction, mirror.fraction);
        assert_eq!(plain.participants, mirror.participants);
        assert_eq!(plain.participants, [true; 2],
            "the reflected pair stopped only the scanner's canonical moving side");
    }

    #[test]
    fn the_iteration_and_bisection_budgets_are_exact_contract_values() {
        assert_eq!(SELF_COLLISION_PASSES, 8);
        assert_eq!(SELF_COLLISION_BISECTIONS, 16);
    }

    #[test]
    fn a_self_constraint_emits_no_event_damage_or_contact_energy() {
        let scenario = crate::diagnostics::stream_digest_scenario();
        let mut world = World::new(&scenario, crate::diagnostics::STREAM_DIGEST_SEED);
        for (id, command) in crate::diagnostics::stream_digest_commands() {
            assert!(matches!(world.submit(id, command), crate::SubmitOutcome::Stored { .. }));
        }
        let mut reached = None;
        for tick in 1..=crate::diagnostics::STREAM_DIGEST_TICKS {
            let health = [world.health_fraction(Faction::Heroes),
                          world.health_fraction(Faction::Monsters)];
            world.step();
            let attempt = [EntityId::new(0, 0), EntityId::new(1, 0)].into_iter()
                .find_map(|id| world.self_collision_attempt(id));
            if attempt.is_none() { continue }
            assert_eq!([world.health_fraction(Faction::Heroes),
                        world.health_fraction(Faction::Monsters)], health,
                "the owner's anatomical stop applied damage");
            assert!(world.events.is_empty(), "the owner's anatomical stop emitted an event");
            assert!(world.contact_resolutions().is_empty(),
                "the owner's anatomical stop entered hostile contact resolution");
            #[cfg(feature = "cartesian-recoil")]
            assert!(world.exact_external_energy().is_empty(),
                "the owner's anatomical stop wrote contact energy");
            reached = Some(tick);
            break;
        }
        assert!(reached.is_some(), "the registered stream no longer reaches its self constraint");
    }
}
