//! Absolute articulated collider construction.
//!
//! Arms and shield poses remain body-origin-relative in authoritative state.
//! Contact owns the single conversion to world coordinates here; doing it at
//! each collector call was exactly how an origin could be added twice.

use crate::{AnatomyRegion, BodyAnatomySpec, EquipmentGeometry, EquipmentSpec,
            EquipmentSpecId, GripBinding, GripState, LimbSlot, SurfaceSpec};
use super::actuator::{self, ArmState, ShieldPose};
use fx::{Angle, Fx, Vec3};

/// One held segment at one pose, in **world** space: the hilt is the absolute
/// hand and the tip is one item length along the arm's bearing.
///
/// Public because the published pose row draws exactly this and there is no
/// reason for a second struct carrying the same three fields. The rest of this
/// module stays crate-private: a collider row is the contact phase's business.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct SegmentPose {
    pub hilt: Vec3,
    pub tip: Vec3,
    pub radius: Fx,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) struct SegmentCollider {
    pub owner: LimbSlot,
    pub equipment: EquipmentSpecId,
    pub previous: SegmentPose,
    pub requested: SegmentPose,
    pub mass: Fx,
    pub surface: SurfaceSpec,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) struct ShieldFace {
    pub corners: [Vec3; 4],
    pub normal: Vec3,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) struct ShieldCollider {
    pub owner: LimbSlot,
    pub equipment: EquipmentSpecId,
    pub previous: ShieldFace,
    pub requested: ShieldFace,
    pub mass: Fx,
    pub surface: SurfaceSpec,
}

/// One region's volume at one pose, as an inclusive capsule.
///
/// A sphere is the degenerate case with `lower == upper`, which is what the
/// head is; the vertical regions differ only in that their two endpoints share
/// an X and a Y. Nothing downstream needs to know which of the three it has,
/// and that is the point of collapsing all five onto one shape: the sweep, the
/// medial distance, and the outward normal are then one piece of code rather
/// than three that could disagree at a boundary.
///
/// Public for the same reason [`SegmentPose`] is: the subject-scoped
/// observation publishes an opponent's five regions, and the reference's "head
/// sphere" is this shape with `lower == upper`. A parallel sphere type beside
/// it would be a second answer to "where is a head" that could drift from the
/// one the contact phase sweeps.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct RegionVolume {
    pub lower: Vec3,
    pub upper: Vec3,
    pub radius: Fx,
    /// False for a severed arm. An absent region has no volume to sweep and no
    /// grip to drive, which is a stronger statement than a zero-radius one:
    /// a degenerate capsule is still a point that can be hit.
    pub present: bool,
}

pub(crate) fn segment_pose(body_origin: Vec3, arm: ArmState, item: EquipmentSpec) -> Option<SegmentPose> {
    let EquipmentGeometry::Segment { length, radius } = item.geometry else { return None };
    let hilt = body_origin + arm.hand;
    let tip = hilt + Vec3::new(
        arm.bearing.cos() * length,
        arm.bearing.sin() * length,
        Fx::ZERO,
    );
    Some(SegmentPose { hilt, tip, radius })
}

pub(crate) fn held_segment_colliders(
    previous_body: Vec3,
    requested_body: Vec3,
    previous_arms: [ArmState; 2],
    requested_arms: [ArmState; 2],
    grips: [GripState; 2],
    carried: [Option<EquipmentSpecId>; 2],
    equipment: impl Fn(EquipmentSpecId) -> Option<EquipmentSpec>,
) -> [Option<SegmentCollider>; 2] {
    let mut result = [None; 2];
    for limb in 0..2 {
        let Some(carried_slot) = grips[limb].equipment_slot else { continue };
        let Some(equipment_id) = carried.get(carried_slot as usize).copied().flatten() else { continue };
        let Some(item) = equipment(equipment_id) else { continue };
        if item.binding == GripBinding::Both && limb == LimbSlot::LeftArm as usize {
            continue;
        }
        let Some(previous) = segment_pose(previous_body, previous_arms[limb], item) else { continue };
        let requested = segment_pose(requested_body, requested_arms[limb], item)
            .expect("one immutable equipment geometry");
        result[limb] = Some(SegmentCollider {
            owner: if limb == 0 { LimbSlot::LeftArm } else { LimbSlot::RightArm },
            equipment: equipment_id,
            previous,
            requested,
            mass: item.mass,
            surface: item.surface,
        });
    }
    result
}

/// The swept face, built from the pose normal **as published**.
///
/// `normal` is republished verbatim and is not renormalised, and `left` is
/// `(-n.y, n.x, 0)` -- so `side` is as long as `n` is, and the front offset
/// `n * (thickness/2)` carries the same length. `up` is `Vec3::Z * half_height`
/// and carries none of it. A consumer that rebuilds this face from a unit
/// normal scaled by `half_width` builds a face the contact phase did not sweep:
/// over the three recorded fixtures' 10542 published plates `||n| - 65536|`
/// reaches 1.2534, a relative 1.9e-5, which on a 0.25 half-width is 4.8e-6
/// world units. That was the whole of the arena proxy's worst agreement gap
/// before it was fixed there. `n.z` is zero on every published plate *by
/// construction*: `World::derive_shield_pose` writes the normal as
/// `Vec3::new(bearing.cos(), bearing.sin(), Fx::ZERO)`, where `bearing` is the
/// carrying arm's -- it was `body_yaw`'s until 2026-08-16, and the planar
/// property this paragraph depends on is the same either way, because both are
/// an `Angle` and neither has a vertical part. A `z` component would not cost
/// this face its shape -- `left` zeroes `z` and `up` is `Vec3::Z`, so `side`
/// and `up` stay perpendicular whatever `n.z` is and the corners stay a
/// rectangle -- it would leave the *published* normal disagreeing with the
/// plane those corners span.
pub(crate) fn shield_face(body_origin: Vec3, pose: ShieldPose) -> ShieldFace {
    let normal = pose.normal;
    let front = body_origin + pose.centre + normal * (pose.thickness / Fx::from_int(2));
    let left = Vec3::new(-normal.y, normal.x, Fx::ZERO);
    let side = left * pose.half_width;
    let up = Vec3::Z * pose.half_height;
    ShieldFace {
        corners: [front - side - up, front + side - up, front + side + up, front - side + up],
        normal,
    }
}

pub(crate) fn held_shield_collider(
    previous_body: Vec3,
    requested_body: Vec3,
    previous_pose: Option<ShieldPose>,
    requested_pose: Option<ShieldPose>,
    grips: [GripState; 2],
    carried: [Option<EquipmentSpecId>; 2],
    equipment: impl Fn(EquipmentSpecId) -> Option<EquipmentSpec>,
) -> Option<ShieldCollider> {
    let previous_pose = previous_pose?;
    let requested_pose = requested_pose?;
    for limb in 0..2 {
        let Some(carried_slot) = grips[limb].equipment_slot else { continue };
        let Some(equipment_id) = carried.get(carried_slot as usize).copied().flatten() else { continue };
        let Some(item) = equipment(equipment_id) else { continue };
        if item.binding == GripBinding::Both && limb == LimbSlot::LeftArm as usize {
            continue;
        }
        if matches!(item.geometry, EquipmentGeometry::Shield { .. }) {
            return Some(ShieldCollider {
                owner: if limb == 0 { LimbSlot::LeftArm } else { LimbSlot::RightArm },
                equipment: equipment_id,
                previous: shield_face(previous_body, previous_pose),
                requested: shield_face(requested_body, requested_pose),
                mass: item.mass,
                surface: item.surface,
            });
        }
    }
    None
}

/// The five regional volumes at one pose, in `AnatomyRegion` order.
///
/// Head, torso and legs are rigid against the body origin: the immutable
/// `centre_z`/`half_height` pair is read straight out of the spec and only the
/// origin moves them. The arms are not -- an arm is the capsule from its
/// yaw-rotated shoulder to wherever the actuator has just put the hand -- which
/// is why this takes a yaw and two hands rather than an origin alone. A blow
/// that lands on a raised arm has to land on the arm, and the arm is only where
/// the pose says it is.
/// `present` is the caller's, region by region, and it covers all five rather
/// than the two limbs a fight usually takes off. A destroyed pair of legs is
/// survivable -- death is head, torso, or blood -- so a body can go on fighting
/// with a region that has to stay gone, and hardcoding presence for the three
/// rigid regions would quietly resurrect it on the next tick's rebuild.
pub fn body_region_volumes(
    body_origin: Vec3,
    anatomy: &BodyAnatomySpec,
    yaw: Angle,
    hands: [Vec3; 2],
    present: [bool; AnatomyRegion::COUNT],
) -> [RegionVolume; AnatomyRegion::COUNT] {
    let mut volumes = [RegionVolume { lower: body_origin, upper: body_origin,
                                      radius: Fx::ZERO, present: true };
                       AnatomyRegion::COUNT];
    for (at, region) in anatomy.regions.iter().enumerate() {
        let vertical = |half: Fx| body_origin + Vec3::new(Fx::ZERO, Fx::ZERO, region.centre_z + half);
        volumes[at] = match region.region {
            AnatomyRegion::Head => RegionVolume {
                lower: vertical(Fx::ZERO), upper: vertical(Fx::ZERO),
                radius: region.radius, present: present[at],
            },
            AnatomyRegion::Torso | AnatomyRegion::Legs => RegionVolume {
                lower: vertical(-region.half_height), upper: vertical(region.half_height),
                radius: region.radius, present: present[at],
            },
            AnatomyRegion::LeftArm | AnatomyRegion::RightArm => {
                let limb = if region.region == AnatomyRegion::LeftArm {
                    LimbSlot::LeftArm as usize
                } else {
                    LimbSlot::RightArm as usize
                };
                RegionVolume {
                    lower: body_origin + actuator::shoulder(anatomy, yaw, limb),
                    upper: body_origin + hands[limb],
                    radius: region.radius,
                    present: present[at],
                }
            }
        };
    }
    volumes
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::combat::{actuator, spec};
    use fx::Angle;

    fn arm(hand: Vec3, bearing: Angle) -> ArmState {
        let mut arm = actuator::tucked_arm(hand);
        arm.bearing = bearing;
        arm
    }

    #[test]
    fn weapon_endpoints_add_body_origin_exactly_once() {
        let pose = segment_pose(
            Vec3::from_ints(10, 20, 0),
            arm(Vec3::from_ints(1, 2, 3), Angle::ZERO),
            spec::sword(),
        ).unwrap();
        assert_eq!(pose.hilt, Vec3::from_ints(11, 22, 3));
        assert_eq!(pose.tip, pose.hilt + Vec3::new(spec::sword().geometry_length(), Fx::ZERO, Fx::ZERO));
    }

    #[test]
    fn shield_front_corners_have_the_frozen_order_and_offset() {
        let pose = ShieldPose {
            centre: Vec3::from_ints(1, 2, 3),
            normal: Vec3::X,
            half_width: Fx::from_int(2),
            half_height: Fx::ONE,
            thickness: Fx::HALF,
        };
        let face = shield_face(Vec3::from_ints(10, 20, 0), pose);
        let x = Fx::from_int(11) + Fx::from_ratio(1, 4);
        assert_eq!(face.corners, [
            Vec3::new(x, Fx::from_int(20), Fx::from_int(2)),
            Vec3::new(x, Fx::from_int(24), Fx::from_int(2)),
            Vec3::new(x, Fx::from_int(24), Fx::from_int(4)),
            Vec3::new(x, Fx::from_int(20), Fx::from_int(4)),
        ]);
        assert_eq!(face.normal, Vec3::X);

        let item = spec::shield();
        let collider = held_shield_collider(
            Vec3::from_ints(9, 20, 0), Vec3::from_ints(10, 20, 0),
            Some(pose), Some(pose),
            [GripState { equipment_slot: Some(0) }, GripState { equipment_slot: None }],
            [Some(item.id), None],
            |id| if id == item.id { Some(item) } else { None },
        ).unwrap();
        assert_eq!(collider.owner, LimbSlot::LeftArm);
        assert_eq!(collider.requested, face);
        assert_eq!(collider.previous.corners[0].x, face.corners[0].x - Fx::ONE);
        assert_eq!((collider.mass, collider.surface), (item.mass, item.surface));

        let mut both = item;
        both.binding = GripBinding::Both;
        let collider = held_shield_collider(
            Vec3::ZERO, Vec3::ZERO, Some(pose), Some(pose),
            [GripState { equipment_slot: Some(0) }; 2], [Some(both.id), None],
            |id| if id == both.id { Some(both) } else { None },
        ).unwrap();
        assert_eq!(collider.owner, LimbSlot::RightArm);
    }

    #[test]
    fn both_equipment_emits_one_right_owned_collider() {
        let mut both = spec::club();
        both.binding = GripBinding::Both;
        let arms = [arm(Vec3::ZERO, Angle::ZERO), arm(Vec3::ZERO, Angle::ZERO)];
        let rows = held_segment_colliders(
            Vec3::ZERO, Vec3::ZERO, arms, arms,
            [GripState { equipment_slot: Some(0) }; 2],
            [Some(both.id), None],
            |id| if id == both.id { Some(both) } else { None },
        );
        assert!(rows[0].is_none());
        assert_eq!(rows[1].unwrap().owner, LimbSlot::RightArm);
    }

    #[test]
    fn the_five_region_volumes_are_a_sphere_two_columns_and_two_arms() {
        let anatomy = spec::fighter_anatomy();
        let origin = Vec3::from_ints(4, 5, 0);
        let hands = [Vec3::from_ints(1, 2, 1), Vec3::from_ints(1, -2, 1)];
        let volumes = body_region_volumes(origin, &anatomy, Angle::ZERO, hands,
                                          [true; AnatomyRegion::COUNT]);

        let head = anatomy.regions[AnatomyRegion::Head as usize];
        assert_eq!(volumes[AnatomyRegion::Head as usize], RegionVolume {
            lower: origin + Vec3::new(Fx::ZERO, Fx::ZERO, head.centre_z),
            upper: origin + Vec3::new(Fx::ZERO, Fx::ZERO, head.centre_z),
            radius: head.radius, present: true,
        }, "the head is a sphere, not a column of its half height");

        for region in [AnatomyRegion::Torso, AnatomyRegion::Legs] {
            let spec = anatomy.regions[region as usize];
            let volume = volumes[region as usize];
            assert_eq!(volume.lower, origin + Vec3::new(Fx::ZERO, Fx::ZERO, spec.centre_z - spec.half_height));
            assert_eq!(volume.upper, origin + Vec3::new(Fx::ZERO, Fx::ZERO, spec.centre_z + spec.half_height));
            assert_eq!((volume.radius, volume.present), (spec.radius, true));
        }

        // An arm runs shoulder to hand and carries the immutable arm radius --
        // not the region's centre/half-height, which stay fingerprinted V1
        // construction data this session does not rewrite.
        for (limb, region) in [(0usize, AnatomyRegion::LeftArm), (1, AnatomyRegion::RightArm)] {
            let volume = volumes[region as usize];
            assert_eq!(volume.lower, origin + actuator::shoulder(&anatomy, Angle::ZERO, limb));
            assert_eq!(volume.upper, origin + hands[limb]);
            assert_eq!(volume.radius, anatomy.regions[region as usize].radius);
        }

        // A severed region is absent rather than degenerate, and that is true
        // of the rigid three as well as the two limbs: a body fights on with
        // its legs destroyed, and those legs must not come back.
        for gone in AnatomyRegion::ALL {
            let mut present = [true; AnatomyRegion::COUNT];
            present[gone as usize] = false;
            let cut = body_region_volumes(origin, &anatomy, Angle::ZERO, hands, present);
            assert!(!cut[gone as usize].present, "{gone:?} survived its own absence");
            assert!(cut.iter().enumerate().all(|(at, row)| at == gone as usize || row.present));
        }
    }

    trait SegmentLength {
        fn geometry_length(self) -> Fx;
    }

    impl SegmentLength for EquipmentSpec {
        fn geometry_length(self) -> Fx {
            match self.geometry {
                EquipmentGeometry::Segment { length, .. } => length,
                EquipmentGeometry::Shield { .. } => Fx::ZERO,
            }
        }
    }
}
