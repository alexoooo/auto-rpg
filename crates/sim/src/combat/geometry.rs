//! Absolute articulated collider construction.
//!
//! Arms and shield poses remain body-origin-relative in authoritative state.
//! Contact owns the single conversion to world coordinates here; doing it at
//! each collector call was exactly how an origin could be added twice.

use crate::{AnatomyRegion, BodyAnatomySpec, EquipmentGeometry, EquipmentSpec,
            EquipmentSpecId, GripBinding, GripState, LimbSlot, SurfaceSpec};
use super::actuator::{ArmState, ShieldPose};
use fx::{Fx, Vec3};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) struct SegmentPose {
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

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) struct BodyCapsule {
    pub centre: Vec3,
    pub half_axis: Fx,
    pub radius: Fx,
    pub mass: Fx,
    pub surface: SurfaceSpec,
    pub region: Option<AnatomyRegion>,
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

pub(crate) fn temporary_body_capsule(
    body_origin: Vec3,
    anatomy: &BodyAnatomySpec,
    mass: Fx,
) -> BodyCapsule {
    let radius = anatomy.regions.iter().map(|region| region.radius).max().unwrap_or(Fx::ZERO);
    let middle = anatomy.standing_height / Fx::from_int(2);
    BodyCapsule {
        centre: body_origin + Vec3::new(Fx::ZERO, Fx::ZERO, middle),
        half_axis: (middle - radius).max(Fx::ZERO),
        radius,
        mass,
        surface: anatomy.surface,
        region: None,
    }
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
    fn the_temporary_body_capsule_uses_one_regionless_volume() {
        let anatomy = spec::fighter_anatomy();
        let body = temporary_body_capsule(Vec3::from_ints(4, 5, 0), &anatomy, Fx::from_int(3));
        let radius = anatomy.regions.iter().map(|row| row.radius).max().unwrap();
        let middle = anatomy.standing_height / Fx::from_int(2);
        assert_eq!(body.centre, Vec3::new(Fx::from_int(4), Fx::from_int(5), middle));
        assert_eq!(body.radius, radius);
        assert_eq!(body.half_axis, (middle - radius).max(Fx::ZERO));
        assert_eq!(body.region, None);
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
