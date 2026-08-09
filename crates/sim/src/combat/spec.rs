use crate::{ActionKind, LimbSlot};
use crate::scenario::ScenarioByteSink;
use fx::Fx;

pub const COMBAT_SPEC_SCHEMA_V1: u16 = 1;
pub const MAX_ANATOMY_SPECS: usize = 64;
pub const MAX_EQUIPMENT_SPECS: usize = 128;
pub const BODY_ANATOMY_SPEC_V1_BYTES: usize = 195;
pub const SEGMENT_EQUIPMENT_SPEC_V1_BYTES: usize = 40;
pub const SHIELD_EQUIPMENT_SPEC_V1_BYTES: usize = 44;

pub type AnatomySpecId = u16;
pub type EquipmentSpecId = u16;

#[repr(u8)]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum AnatomyRegion { Head = 0, Torso = 1, LeftArm = 2, RightArm = 3, Legs = 4 }

impl AnatomyRegion {
    pub const ALL: [AnatomyRegion; 5] = [
        AnatomyRegion::Head, AnatomyRegion::Torso, AnatomyRegion::LeftArm,
        AnatomyRegion::RightArm, AnatomyRegion::Legs,
    ];
}

#[repr(u8)]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Material { Flesh = 0, Steel = 1, Wood = 2 }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct SurfaceSpec {
    pub restitution: Fx,
    pub friction: Fx,
    pub edge_factor: Fx,
    pub point_factor: Fx,
    pub material: Material,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ArmorSpec {
    pub coverage: Fx,
    pub hardness: Fx,
    pub absorption: Fx,
    pub material: Material,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct AnatomyRegionSpec {
    pub region: AnatomyRegion,
    pub centre_z: Fx,
    pub half_height: Fx,
    pub radius: Fx,
}

#[derive(Clone, PartialEq, Eq, Debug)]
pub struct BodyAnatomySpec {
    pub id: AnatomySpecId,
    pub schema: u16,
    pub standing_height: Fx,
    pub shoulder_height: Fx,
    pub shoulder_half_width: Fx,
    pub arm_length: Fx,
    pub hand_radius: Fx,
    pub regions: [AnatomyRegionSpec; 5],
    pub surface: SurfaceSpec,
    pub integrity_maxima: [Fx; 5],
    pub blood_max: Fx,
    pub armor: [ArmorSpec; 5],
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum EquipmentGeometry {
    Segment { length: Fx, radius: Fx },
    Shield { half_width: Fx, half_height: Fx, thickness: Fx },
}

#[repr(u8)]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum GripBinding { Left = 0, Right = 1, Both = 2 }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct EquipmentSpec {
    pub id: EquipmentSpecId,
    pub schema: u16,
    pub action: ActionKind,
    pub mass: Fx,
    pub balance: Fx,
    pub geometry: EquipmentGeometry,
    pub binding: GripBinding,
    pub surface: SurfaceSpec,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ArticulatedUnitSpecV1 {
    pub anatomy: AnatomySpecId,
    pub equipment: [Option<EquipmentSpecId>; 2],
}

#[derive(Clone, PartialEq, Eq, Debug)]
pub struct CombatSpecTableV1 {
    pub anatomies: Vec<BodyAnatomySpec>,
    pub equipment: Vec<EquipmentSpec>,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum CombatSpecError {
    MissingTable,
    UnexpectedTable,
    UnitPresence,
    TooManyAnatomies,
    TooManyEquipment,
    IdOrder,
    UnknownSchema,
    Dimension,
    Fraction,
    Maximum,
    MissingReference,
    LoadoutMismatch,
    GripConflict,
}

impl CombatSpecTableV1 {
    pub fn fixtures() -> CombatSpecTableV1 {
        CombatSpecTableV1 {
            anatomies: vec![fighter_anatomy(), brute_anatomy()],
            equipment: vec![sword(), shield(), club()],
        }
    }

    pub fn anatomy(&self, id: AnatomySpecId) -> Option<&BodyAnatomySpec> {
        self.anatomies.binary_search_by_key(&id, |row| row.id).ok().map(|i| &self.anatomies[i])
    }

    pub fn equipment(&self, id: EquipmentSpecId) -> Option<&EquipmentSpec> {
        self.equipment.binary_search_by_key(&id, |row| row.id).ok().map(|i| &self.equipment[i])
    }

    pub(crate) fn fingerprint_into<S: ScenarioByteSink>(
        &self,
        units: &[crate::UnitSpec],
        sink: &mut S,
    ) {
        write_combat_specs(self, units.iter().map(|unit| {
            unit.articulated.expect("validated articulated unit")
        }), sink);
    }

    pub(crate) fn rows_into<S: ScenarioByteSink>(
        &self,
        units: &[ArticulatedUnitSpecV1],
        sink: &mut S,
    ) {
        write_combat_specs(self, units.iter().copied(), sink);
    }
}

fn write_combat_specs<S, I>(table: &CombatSpecTableV1, units: I, sink: &mut S)
where
    S: ScenarioByteSink,
    I: IntoIterator<Item = ArticulatedUnitSpecV1>,
    I::IntoIter: ExactSizeIterator,
{
    let units = units.into_iter();
    sink.write_u8(1);
    sink.write_u16(COMBAT_SPEC_SCHEMA_V1);
    sink.write_u16(table.anatomies.len() as u16);
    for row in &table.anatomies { write_anatomy(row, sink); }
    sink.write_u16(table.equipment.len() as u16);
    for row in &table.equipment { write_equipment(row, sink); }
    sink.write_u16(units.len() as u16);
    for row in units { write_unit(row, sink); }
}

pub(crate) fn combat_specs_into<S: ScenarioByteSink>(
    table: Option<&CombatSpecTableV1>,
    units: &[crate::UnitSpec],
    sink: &mut S,
) {
    match table {
        None => sink.write_u8(0),
        Some(table) => table.fingerprint_into(units, sink),
    }
}

pub fn validate_construction(
    model: crate::CombatModel,
    table: Option<&CombatSpecTableV1>,
    units: &[crate::UnitSpec],
) -> Result<(), CombatSpecError> {
    match model {
        crate::CombatModel::Legacy => {
            if table.is_some() { return Err(CombatSpecError::UnexpectedTable); }
            if units.iter().any(|unit| unit.articulated.is_some()) { return Err(CombatSpecError::UnitPresence); }
            return Ok(());
        }
        crate::CombatModel::Articulated => {}
    }
    let table = table.ok_or(CombatSpecError::MissingTable)?;
    if units.iter().any(|unit| unit.articulated.is_none()) { return Err(CombatSpecError::UnitPresence); }
    let rows = units.iter().map(|unit| unit.articulated.unwrap()).collect::<Vec<_>>();
    let loadouts = units.iter().map(|unit| unit.loadout).collect::<Vec<_>>();
    validate_rows(table, &rows, &loadouts)
}

pub(crate) fn validate_rows(
    table: &CombatSpecTableV1,
    rows: &[ArticulatedUnitSpecV1],
    loadouts: &[crate::Loadout],
) -> Result<(), CombatSpecError> {
    if rows.len() != loadouts.len() { return Err(CombatSpecError::UnitPresence); }
    if table.anatomies.len() > MAX_ANATOMY_SPECS { return Err(CombatSpecError::TooManyAnatomies); }
    if table.equipment.len() > MAX_EQUIPMENT_SPECS { return Err(CombatSpecError::TooManyEquipment); }
    if !strict_ids(&table.anatomies, |row| row.id) || !strict_ids(&table.equipment, |row| row.id) {
        return Err(CombatSpecError::IdOrder);
    }
    for anatomy in &table.anatomies { validate_anatomy(anatomy)?; }
    for equipment in &table.equipment { validate_equipment(equipment)?; }
    for (&row, &loadout) in rows.iter().zip(loadouts) {
        if table.anatomy(row.anatomy).is_none() { return Err(CombatSpecError::MissingReference); }
        for slot in 0..2 {
            match (row.equipment[slot], loadout.slot(slot)) {
                (None, None) => {}
                (Some(id), Some(action)) => {
                    let item = table.equipment(id).ok_or(CombatSpecError::MissingReference)?;
                    if item.action != action { return Err(CombatSpecError::LoadoutMismatch); }
                }
                _ => return Err(CombatSpecError::LoadoutMismatch),
            }
        }
        validate_bindings(table, row)?;
    }
    Ok(())
}

fn strict_ids<T>(rows: &[T], id: impl Fn(&T) -> u16) -> bool {
    rows.windows(2).all(|pair| id(&pair[0]) < id(&pair[1]))
}

fn validate_anatomy(row: &BodyAnatomySpec) -> Result<(), CombatSpecError> {
    if row.schema != COMBAT_SPEC_SCHEMA_V1 { return Err(CombatSpecError::UnknownSchema); }
    let dimensions = [row.standing_height, row.shoulder_height, row.shoulder_half_width, row.arm_length, row.hand_radius];
    if dimensions.iter().any(|v| v.raw() < 0 || *v > Fx::from_int(8))
        || row.shoulder_height >= row.standing_height || row.arm_length > Fx::from_int(4)
    { return Err(CombatSpecError::Dimension); }
    for (at, region) in row.regions.iter().enumerate() {
        if region.region != AnatomyRegion::ALL[at]
            || [region.centre_z, region.half_height, region.radius].iter().any(|v| v.raw() < 0 || *v > Fx::from_int(8))
        { return Err(CombatSpecError::Dimension); }
    }
    validate_surface(row.surface)?;
    if row.integrity_maxima.iter().chain(core::iter::once(&row.blood_max))
        .any(|v| v.raw() <= 0 || *v > Fx::from_int(64))
    { return Err(CombatSpecError::Maximum); }
    for armor in row.armor { validate_armor(armor)?; }
    Ok(())
}

fn validate_equipment(row: &EquipmentSpec) -> Result<(), CombatSpecError> {
    if row.schema != COMBAT_SPEC_SCHEMA_V1 { return Err(CombatSpecError::UnknownSchema); }
    if row.mass.raw() <= 0 || row.mass > Fx::from_int(8) || !fraction(row.balance) {
        return Err(CombatSpecError::Dimension);
    }
    let dimensions = match row.geometry {
        EquipmentGeometry::Segment { length, radius } => [length, radius, Fx::ZERO],
        EquipmentGeometry::Shield { half_width, half_height, thickness } => [half_width, half_height, thickness],
    };
    if dimensions.iter().any(|v| v.raw() < 0 || *v > Fx::from_int(8)) { return Err(CombatSpecError::Dimension); }
    if matches!(row.geometry, EquipmentGeometry::Shield { .. }) && row.binding == GripBinding::Both {
        return Err(CombatSpecError::GripConflict);
    }
    validate_surface(row.surface)
}

fn validate_surface(row: SurfaceSpec) -> Result<(), CombatSpecError> {
    if [row.restitution, row.friction, row.edge_factor, row.point_factor].into_iter().all(fraction) {
        Ok(())
    } else { Err(CombatSpecError::Fraction) }
}

fn validate_armor(row: ArmorSpec) -> Result<(), CombatSpecError> {
    if [row.coverage, row.hardness, row.absorption].into_iter().all(fraction) {
        Ok(())
    } else { Err(CombatSpecError::Fraction) }
}

fn fraction(value: Fx) -> bool { (0..=Fx::ONE.raw()).contains(&value.raw()) }

fn validate_bindings(table: &CombatSpecTableV1, unit: ArticulatedUnitSpecV1) -> Result<(), CombatSpecError> {
    let first = unit.equipment[0].and_then(|id| table.equipment(id));
    let second = unit.equipment[1].and_then(|id| table.equipment(id));
    if let (Some(a), Some(b)) = (first, second) {
        if a.id == b.id || a.binding == GripBinding::Both || b.binding == GripBinding::Both {
            return Err(CombatSpecError::GripConflict);
        }
        if a.binding == b.binding { return Err(CombatSpecError::GripConflict); }
        if matches!(a.geometry, EquipmentGeometry::Shield { .. })
            && matches!(b.geometry, EquipmentGeometry::Shield { .. }) {
            return Err(CombatSpecError::GripConflict);
        }
    }
    Ok(())
}

pub fn resolved_equipment(
    table: &CombatSpecTableV1,
    unit: ArticulatedUnitSpecV1,
) -> Result<[Option<EquipmentSpecId>; 2], CombatSpecError> {
    validate_bindings(table, unit)?;
    let mut arms = [None; 2];
    for id in unit.equipment.into_iter().flatten() {
        let item = table.equipment(id).ok_or(CombatSpecError::MissingReference)?;
        match item.binding {
            GripBinding::Left => arms[LimbSlot::LeftArm as usize] = Some(id),
            GripBinding::Right => arms[LimbSlot::RightArm as usize] = Some(id),
            GripBinding::Both => arms = [Some(id), Some(id)],
        }
    }
    Ok(arms)
}

pub(crate) fn grips_valid(
    table: &CombatSpecTableV1,
    unit: ArticulatedUnitSpecV1,
    grips: [crate::GripRequest; 2],
) -> bool {
    for arm in 0..grips.len() {
        if !grip_valid_for_arm(table, unit, grips, arm) { return false; }
    }
    true
}

pub(crate) fn grip_valid_for_arm(
    table: &CombatSpecTableV1,
    unit: ArticulatedUnitSpecV1,
    grips: [crate::GripRequest; 2],
    arm: usize,
) -> bool {
    let crate::GripRequest::EquipSlot(slot) = grips[arm] else { return true };
    let Some(id) = unit.equipment.get(slot as usize).copied().flatten() else { return false };
    let Some(item) = table.equipment(id) else { return false };
    match item.binding {
        GripBinding::Left => arm == LimbSlot::LeftArm as usize,
        GripBinding::Right => arm == LimbSlot::RightArm as usize,
        GripBinding::Both => grips == [crate::GripRequest::EquipSlot(slot); 2],
    }
}

fn write_surface<S: ScenarioByteSink>(row: SurfaceSpec, sink: &mut S) {
    sink.write_i32(row.restitution.raw()); sink.write_i32(row.friction.raw());
    sink.write_i32(row.edge_factor.raw()); sink.write_i32(row.point_factor.raw());
    sink.write_u8(row.material as u8);
}

fn write_armor<S: ScenarioByteSink>(row: ArmorSpec, sink: &mut S) {
    sink.write_i32(row.coverage.raw()); sink.write_i32(row.hardness.raw());
    sink.write_i32(row.absorption.raw()); sink.write_u8(row.material as u8);
}

pub(crate) fn write_anatomy<S: ScenarioByteSink>(row: &BodyAnatomySpec, sink: &mut S) {
    sink.write_u16(row.id); sink.write_u16(row.schema);
    for value in [row.standing_height, row.shoulder_height, row.shoulder_half_width, row.arm_length, row.hand_radius] {
        sink.write_i32(value.raw());
    }
    for region in row.regions {
        sink.write_u8(region.region as u8); sink.write_i32(region.centre_z.raw());
        sink.write_i32(region.half_height.raw()); sink.write_i32(region.radius.raw());
    }
    write_surface(row.surface, sink);
    for value in row.integrity_maxima { sink.write_i32(value.raw()); }
    sink.write_i32(row.blood_max.raw());
    for armor in row.armor { write_armor(armor, sink); }
}

pub(crate) fn write_equipment<S: ScenarioByteSink>(row: &EquipmentSpec, sink: &mut S) {
    sink.write_u16(row.id); sink.write_u16(row.schema); sink.write_u8(row.action.code() as u8);
    sink.write_i32(row.mass.raw()); sink.write_i32(row.balance.raw());
    match row.geometry {
        EquipmentGeometry::Segment { length, radius } => {
            sink.write_u8(0); sink.write_i32(length.raw()); sink.write_i32(radius.raw());
        }
        EquipmentGeometry::Shield { half_width, half_height, thickness } => {
            sink.write_u8(1); sink.write_i32(half_width.raw()); sink.write_i32(half_height.raw()); sink.write_i32(thickness.raw());
        }
    }
    sink.write_u8(row.binding as u8); write_surface(row.surface, sink);
}

pub(crate) fn write_unit<S: ScenarioByteSink>(row: ArticulatedUnitSpecV1, sink: &mut S) {
    sink.write_u16(row.anatomy);
    for item in row.equipment {
        match item { None => sink.write_u8(0), Some(id) => { sink.write_u8(1); sink.write_u16(id); } }
    }
}

const fn r(n: i32, d: i32) -> Fx { Fx::from_ratio(n, d) }
const FLESH_SURFACE: SurfaceSpec = SurfaceSpec {
    restitution: Fx::ZERO, friction: r(1,2), edge_factor: Fx::ZERO,
    point_factor: Fx::ZERO, material: Material::Flesh,
};
const NO_ARMOR: ArmorSpec = ArmorSpec {
    coverage: Fx::ZERO, hardness: Fx::ZERO, absorption: Fx::ZERO, material: Material::Flesh,
};

pub fn fighter_anatomy() -> BodyAnatomySpec {
    BodyAnatomySpec {
        id: 1, schema: 1, standing_height: r(9,5), shoulder_height: r(7,5),
        shoulder_half_width: r(1,4), arm_length: r(3,4), hand_radius: r(1,10),
        regions: [
            AnatomyRegionSpec { region: AnatomyRegion::Head, centre_z: r(17,10), half_height: r(1,10), radius: r(1,5) },
            AnatomyRegionSpec { region: AnatomyRegion::Torso, centre_z: r(11,10), half_height: r(2,5), radius: r(7,20) },
            AnatomyRegionSpec { region: AnatomyRegion::LeftArm, centre_z: r(6,5), half_height: r(3,10), radius: r(3,20) },
            AnatomyRegionSpec { region: AnatomyRegion::RightArm, centre_z: r(6,5), half_height: r(3,10), radius: r(3,20) },
            AnatomyRegionSpec { region: AnatomyRegion::Legs, centre_z: r(2,5), half_height: r(2,5), radius: r(3,10) },
        ],
        surface: FLESH_SURFACE, integrity_maxima: [Fx::from_int(2); 5], blood_max: Fx::from_int(12),
        armor: [NO_ARMOR; 5],
    }
}

pub fn brute_anatomy() -> BodyAnatomySpec {
    BodyAnatomySpec {
        id: 2, schema: 1, standing_height: Fx::from_int(2), shoulder_height: r(3,2),
        shoulder_half_width: r(3,10), arm_length: r(17,20), hand_radius: r(3,25),
        regions: [
            AnatomyRegionSpec { region: AnatomyRegion::Head, centre_z: r(19,10), half_height: r(1,10), radius: r(1,4) },
            AnatomyRegionSpec { region: AnatomyRegion::Torso, centre_z: r(6,5), half_height: r(9,20), radius: r(2,5) },
            AnatomyRegionSpec { region: AnatomyRegion::LeftArm, centre_z: r(13,10), half_height: r(7,20), radius: r(1,5) },
            AnatomyRegionSpec { region: AnatomyRegion::RightArm, centre_z: r(13,10), half_height: r(7,20), radius: r(1,5) },
            AnatomyRegionSpec { region: AnatomyRegion::Legs, centre_z: r(9,20), half_height: r(9,20), radius: r(7,20) },
        ],
        surface: FLESH_SURFACE, integrity_maxima: [Fx::from_int(3); 5], blood_max: Fx::from_int(18),
        armor: [NO_ARMOR; 5],
    }
}

pub fn sword() -> EquipmentSpec { EquipmentSpec {
    id: 1, schema: 1, action: ActionKind::Sword, mass: r(31,25), balance: r(11,20),
    geometry: EquipmentGeometry::Segment { length: r(19,20), radius: r(1,25) },
    binding: GripBinding::Right,
    surface: SurfaceSpec { restitution: r(1,8), friction: r(1,4), edge_factor: Fx::ONE, point_factor: Fx::ONE, material: Material::Steel },
} }

pub fn shield() -> EquipmentSpec { EquipmentSpec {
    id: 2, schema: 1, action: ActionKind::Shield, mass: r(9,10), balance: r(7,20),
    geometry: EquipmentGeometry::Shield { half_width: r(7,20), half_height: r(1,2), thickness: r(1,20) },
    binding: GripBinding::Left,
    surface: SurfaceSpec { restitution: r(1,8), friction: r(3,4), edge_factor: Fx::ZERO, point_factor: Fx::ZERO, material: Material::Steel },
} }

pub fn club() -> EquipmentSpec { EquipmentSpec {
    id: 3, schema: 1, action: ActionKind::Club, mass: r(223,100), balance: r(61,100),
    geometry: EquipmentGeometry::Segment { length: r(29,20), radius: r(3,50) },
    binding: GripBinding::Right,
    surface: SurfaceSpec { restitution: r(1,4), friction: r(1,2), edge_factor: Fx::ZERO, point_factor: r(1,2), material: Material::Wood },
} }

#[cfg(test)]
mod tests {
    use super::*;

    struct Bytes(Vec<u8>);
    impl ScenarioByteSink for Bytes {
        fn write_u8(&mut self, value: u8) { self.0.push(value); }
        fn write_u16(&mut self, value: u16) { self.0.extend_from_slice(&value.to_le_bytes()); }
        fn write_u32(&mut self, value: u32) { self.0.extend_from_slice(&value.to_le_bytes()); }
        fn write_i32(&mut self, value: i32) { self.0.extend_from_slice(&value.to_le_bytes()); }
        fn write_bytes(&mut self, value: &[u8]) { self.0.extend_from_slice(value); }
    }

    #[test]
    fn sword_right_shield_left_and_club_right_are_the_only_v1_fixtures() {
        let table = CombatSpecTableV1::fixtures();
        assert_eq!(table.anatomies.iter().map(|row| row.id).collect::<Vec<_>>(), [1, 2]);
        assert_eq!(table.equipment.iter().map(|row| (row.id, row.action, row.binding)).collect::<Vec<_>>(), [
            (1, ActionKind::Sword, GripBinding::Right),
            (2, ActionKind::Shield, GripBinding::Left),
            (3, ActionKind::Club, GripBinding::Right),
        ]);
    }

    #[test]
    fn every_fixture_leaf_matches_the_hand_built_v1_values() {
        let fighter = fighter_anatomy();
        let brute = brute_anatomy();
        let anatomy_values = |row: &BodyAnatomySpec| {
            let mut values = vec![row.standing_height, row.shoulder_height, row.shoulder_half_width,
                row.arm_length, row.hand_radius];
            for region in row.regions { values.extend([region.centre_z, region.half_height, region.radius]); }
            values.extend([row.surface.restitution, row.surface.friction, row.surface.edge_factor, row.surface.point_factor]);
            values.extend(row.integrity_maxima); values.push(row.blood_max);
            for armor in row.armor { values.extend([armor.coverage, armor.hardness, armor.absorption]); }
            values.into_iter().map(Fx::raw).collect::<Vec<_>>()
        };
        let raw = |n, d| Fx::from_ratio(n, d).raw();
        assert_eq!(anatomy_values(&fighter), [
            raw(9,5),raw(7,5),raw(1,4),raw(3,4),raw(1,10),
            raw(17,10),raw(1,10),raw(1,5), raw(11,10),raw(2,5),raw(7,20),
            raw(6,5),raw(3,10),raw(3,20), raw(6,5),raw(3,10),raw(3,20),
            raw(2,5),raw(2,5),raw(3,10), 0,raw(1,2),0,0,
            raw(2,1),raw(2,1),raw(2,1),raw(2,1),raw(2,1),raw(12,1),
            0,0,0, 0,0,0, 0,0,0, 0,0,0, 0,0,0,
        ]);
        assert_eq!(anatomy_values(&brute), [
            raw(2,1),raw(3,2),raw(3,10),raw(17,20),raw(3,25),
            raw(19,10),raw(1,10),raw(1,4), raw(6,5),raw(9,20),raw(2,5),
            raw(13,10),raw(7,20),raw(1,5), raw(13,10),raw(7,20),raw(1,5),
            raw(9,20),raw(9,20),raw(7,20), 0,raw(1,2),0,0,
            raw(3,1),raw(3,1),raw(3,1),raw(3,1),raw(3,1),raw(18,1),
            0,0,0, 0,0,0, 0,0,0, 0,0,0, 0,0,0,
        ]);
        assert_eq!(fighter.regions.map(|row| row.region), AnatomyRegion::ALL);
        assert_eq!(brute.regions.map(|row| row.region), AnatomyRegion::ALL);
        assert!(fighter.armor.into_iter().all(|row| row.material == Material::Flesh));
        assert!(brute.armor.into_iter().all(|row| row.material == Material::Flesh));
        let sword = sword(); let shield = shield(); let club = club();
        assert_eq!((sword.mass.raw(), sword.balance.raw(), sword.binding, sword.surface),
            (raw(31,25), raw(11,20), GripBinding::Right,
             SurfaceSpec { restitution: Fx::from_ratio(1,8), friction: Fx::from_ratio(1,4), edge_factor: Fx::ONE, point_factor: Fx::ONE, material: Material::Steel }));
        assert_eq!(sword.geometry, EquipmentGeometry::Segment { length: Fx::from_ratio(19,20), radius: Fx::from_ratio(1,25) });
        assert_eq!((shield.mass.raw(), shield.balance.raw(), shield.binding, shield.surface),
            (raw(9,10), raw(7,20), GripBinding::Left,
             SurfaceSpec { restitution: Fx::from_ratio(1,8), friction: Fx::from_ratio(3,4), edge_factor: Fx::ZERO, point_factor: Fx::ZERO, material: Material::Steel }));
        assert_eq!(shield.geometry, EquipmentGeometry::Shield { half_width: Fx::from_ratio(7,20), half_height: Fx::from_ratio(1,2), thickness: Fx::from_ratio(1,20) });
        assert_eq!((club.mass.raw(), club.balance.raw(), club.binding, club.surface),
            (raw(223,100), raw(61,100), GripBinding::Right,
             SurfaceSpec { restitution: Fx::from_ratio(1,4), friction: Fx::from_ratio(1,2), edge_factor: Fx::ZERO, point_factor: Fx::from_ratio(1,2), material: Material::Wood }));
        assert_eq!(club.geometry, EquipmentGeometry::Segment { length: Fx::from_ratio(29,20), radius: Fx::from_ratio(3,50) });
    }

    #[test]
    fn spec_ids_are_keys_and_not_registry_indexes() {
        let mut table = CombatSpecTableV1::fixtures();
        table.equipment[0].id = 11;
        table.equipment[1].id = 22;
        table.equipment[2].id = 33;
        assert_eq!(table.equipment(22).unwrap().action, ActionKind::Shield);
        assert!(table.equipment(1).is_none());
    }

    #[test]
    fn left_and_right_limb_slots_have_stable_discriminants() {
        assert_eq!(LimbSlot::LeftArm as u8, 0);
        assert_eq!(LimbSlot::RightArm as u8, 1);
    }

    #[test]
    fn immutable_specs_change_scenario_fingerprints() {
        let scenario = crate::Scenario::articulated_duel();
        let original = scenario.fingerprint();
        let mut changed = scenario.clone();
        changed.combat_specs.as_mut().unwrap().equipment[0].mass += Fx::from_raw(1);
        assert_ne!(changed.fingerprint(), original);
        let mut changed = scenario.clone();
        changed.units[0].articulated.as_mut().unwrap().anatomy = 2;
        assert_ne!(changed.fingerprint(), original);
    }

    #[test]
    fn unknown_duplicate_missing_and_mismatched_specs_fail_closed() {
        let scenario = crate::Scenario::articulated_duel();
        assert_eq!(validate_construction(scenario.combat_model, scenario.combat_specs.as_ref(), &scenario.units), Ok(()));
        let mut changed = scenario.clone();
        changed.combat_specs.as_mut().unwrap().anatomies[0].schema = 2;
        assert_eq!(validate_construction(changed.combat_model, changed.combat_specs.as_ref(), &changed.units), Err(CombatSpecError::UnknownSchema));
        let mut changed = scenario.clone();
        changed.combat_specs.as_mut().unwrap().equipment[1].id = 1;
        assert_eq!(validate_construction(changed.combat_model, changed.combat_specs.as_ref(), &changed.units), Err(CombatSpecError::IdOrder));
        let mut changed = scenario.clone();
        changed.units[0].articulated.as_mut().unwrap().anatomy = 99;
        assert_eq!(validate_construction(changed.combat_model, changed.combat_specs.as_ref(), &changed.units), Err(CombatSpecError::MissingReference));
        let mut changed = scenario.clone();
        changed.combat_specs.as_mut().unwrap().equipment[0].action = ActionKind::Club;
        assert_eq!(validate_construction(changed.combat_model, changed.combat_specs.as_ref(), &changed.units), Err(CombatSpecError::LoadoutMismatch));
    }

    #[test]
    fn fixed_spec_records_have_the_documented_byte_widths() {
        let table = CombatSpecTableV1::fixtures();
        for anatomy in &table.anatomies {
            let mut bytes = Bytes(Vec::new());
            write_anatomy(anatomy, &mut bytes);
            assert_eq!(bytes.0.len(), BODY_ANATOMY_SPEC_V1_BYTES);
        }
        let mut digest = fx::Hash64::new();
        table.rows_into(&[
            ArticulatedUnitSpecV1 { anatomy: 1, equipment: [Some(1), Some(2)] },
            ArticulatedUnitSpecV1 { anatomy: 2, equipment: [Some(3), None] },
        ], &mut digest);
        assert_eq!(digest.finish(), 0xf518_cd24_4980_f2d4);
        for equipment in &table.equipment {
            let mut bytes = Bytes(Vec::new());
            write_equipment(equipment, &mut bytes);
            let expected = match equipment.geometry {
                EquipmentGeometry::Segment { .. } => SEGMENT_EQUIPMENT_SPEC_V1_BYTES,
                EquipmentGeometry::Shield { .. } => SHIELD_EQUIPMENT_SPEC_V1_BYTES,
            };
            assert_eq!(bytes.0.len(), expected);
        }
    }

    #[test]
    fn legacy_scenarios_carry_no_articulated_specs() {
        for scenario in [crate::Scenario::duel(), crate::Scenario::room(), crate::Scenario::skirmish(1, 2, 2)] {
            assert_eq!(scenario.combat_specs, None);
            assert!(scenario.units.iter().all(|unit| unit.articulated.is_none()));
            assert_eq!(validate_construction(scenario.combat_model, None, &scenario.units), Ok(()));
        }
    }
}
