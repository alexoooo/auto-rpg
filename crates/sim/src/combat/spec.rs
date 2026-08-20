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
    /// The region count, named once. Every regional array in the crate -- the
    /// immutable maxima, the armor rows and the mutable wound rows -- is this
    /// wide, and a literal `5` in any of them is a place the five could
    /// disagree.
    ///
    /// **The swept volumes are no longer among them.** They were, and the
    /// sentence above used to say so; an arm with an elbow is two capsules
    /// answering for one region, so the collider's volume list is
    /// [`BODY_VOLUME_COUNT`] and this number is what anatomy is *about* --
    /// where a wound lands, what armor covers, what can be severed.
    pub const COUNT: usize = 5;

    pub const ALL: [AnatomyRegion; AnatomyRegion::COUNT] = [
        AnatomyRegion::Head, AnatomyRegion::Torso, AnatomyRegion::LeftArm,
        AnatomyRegion::RightArm, AnatomyRegion::Legs,
    ];

    /// The region a `#[repr(u8)]` discriminant names, or `None`.
    ///
    /// Written as an index into `ALL` rather than a `match`, so a region added
    /// to the enum cannot be silently missing here.
    pub const fn from_index(index: usize) -> Option<AnatomyRegion> {
        if index < AnatomyRegion::COUNT { Some(AnatomyRegion::ALL[index]) } else { None }
    }
}

/// How many swept volumes a body presents to the contact solver.
///
/// **Seven volumes over five regions, and the gap between those two numbers is
/// the whole of this vocabulary.** Volumes `0..5` are the five regions in
/// [`AnatomyRegion::ALL`] order and keep those indices exactly, so every corpus
/// recorded before the elbow existed still names the same capsule. Volumes 5
/// and 6 are the two forearms, and they exist only on a body whose arms have an
/// elbow to split them at.
///
/// A forearm is deliberately **not** a sixth and seventh region. Anatomy is the
/// list of things that can be wounded, armored and severed, and a forearm is
/// none of those on its own -- it is part of an arm, it is covered by the arm's
/// armor row, and losing it is losing the arm. Growing `AnatomyRegion` would
/// have widened the wound rows, the integrity maxima, the armor table, the
/// published pose block and the anatomy hash row, all to say something anatomy
/// does not need to know.
pub const BODY_VOLUME_COUNT: usize = AnatomyRegion::COUNT + 2;

/// The volume a limb's forearm occupies.
///
/// Appended after the five regions rather than interleaved beside each arm,
/// because the five leading indices are what a recorded corpus, a published
/// region row and a mirrored-fight region swap all read positionally.
pub const fn forearm_volume(limb: usize) -> usize {
    AnatomyRegion::COUNT + limb
}

/// The region a swept volume belongs to, or `None` for an index no body has.
///
/// **The one bridge between the two numberings, and it exists so that there is
/// exactly one.** A contact fact names the volume the solver chose; a wound,
/// a severance and a published body part all want the region. Both forearms
/// answer their own arm, which is what lets the selection tuple
/// `(toi, medial_distance_squared, BodyPart)` tolerate two volumes competing
/// for one part without ever producing a part no anatomy has.
pub const fn volume_region(volume: usize) -> Option<AnatomyRegion> {
    if volume < AnatomyRegion::COUNT {
        AnatomyRegion::from_index(volume)
    } else if volume == forearm_volume(LimbSlot::LeftArm as usize) {
        Some(AnatomyRegion::LeftArm)
    } else if volume == forearm_volume(LimbSlot::RightArm as usize) {
        Some(AnatomyRegion::RightArm)
    } else {
        None
    }
}

#[repr(u8)]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Material { Flesh = 0, Steel = 1, Wood = 2 }

impl Material {
    /// How much of a blow's *declined* energy this material drives into tissue
    /// as crushing, in `[0,1]`.
    ///
    /// # Why this is a material and not a surface field
    ///
    /// [`SurfaceSpec::edge_factor`] and [`SurfaceSpec::point_factor`] are
    /// **shape**: they ask whether the thing has an edge and whether it has a
    /// point, and a steel sword and a steel shield disagree about both while
    /// being the same steel. Crushing asks the opposite question -- how much of
    /// a blow the thing passes on instead of soaking up in its own deformation
    /// -- and that is stiffness, which is exactly what `Material` names. So the
    /// coefficient hangs here, on the field every surface already carries, and
    /// **no byte moves**: `write_surface` has always written `material`, so the
    /// spec-table digest, the `articulated-duel-v1` fingerprint and the replay
    /// codec's `BODY_ANATOMY_SPEC_V1_BYTES` are all untouched by this. A field
    /// beside `point_factor` would have cost all three plus a schema bump, and
    /// bought no distinction the roster can express.
    ///
    /// This is also the first mechanical meaning `Material` has ever had. It was
    /// written into every digest and read by nothing.
    ///
    /// # The numbers
    ///
    /// Only a **segment** ever reaches the weapon/body channel -- `ContactKey`
    /// builds `WeaponBody` from `Segment` against `Body` and nothing else, and
    /// `channels` sends a non-segment straight to pressure through
    /// `zero_length`. So of the four shipped surfaces only the sword's and the
    /// club's can act, and the sword's is inert for a separate reason given
    /// below.
    ///
    /// - **Wood, 3/4.** A club is a purpose-built blunt weapon: the roster's
    ///   heaviest item at `223/100` against the sword's `31/25`, with its mass
    ///   furthest forward at a `balance` of `61/100` against `11/20`. Crushing
    ///   is the whole of its design intent, so it passes on most of what its
    ///   absent edge could not cut. Not all of it: wood is compliant, and the
    ///   club is the springiest surface shipped at a `restitution` of `1/4`,
    ///   twice either steel item's `1/8`.
    /// - **Steel, 7/8.** Stiffer than wood, so it soaks up less of the blow
    ///   itself. **Unobservable on the shipped roster**, and deliberately so:
    ///   the sword's edge and point are both `1`, which claims the entire
    ///   available budget and leaves nothing to decline, and the shield is not a
    ///   segment. It is set for the axis it names rather than for an effect it
    ///   has today, so that a steel blunt weapon -- a mace -- lands above a
    ///   wooden one when somebody adds it.
    /// - **Flesh, 0.** A body is never the weapon side of a weapon/body pair, so
    ///   this is unreachable. Zero states that, where any other number would
    ///   imply that walking into somebody is an attack.
    ///
    /// What is *not* modelled is concentration: a club head and a flat plank of
    /// the same wood crush alike here, because the channel carries no contact
    /// area. `edge_factor` and `point_factor` are the only concentration terms
    /// the model has, and neither describes a blunt face.
    pub const fn crush_factor(self) -> Fx {
        match self {
            Material::Flesh => Fx::ZERO,
            Material::Steel => r(7, 8),
            Material::Wood => r(3, 4),
        }
    }
}

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
    pub regions: [AnatomyRegionSpec; AnatomyRegion::COUNT],
    pub surface: SurfaceSpec,
    pub integrity_maxima: [Fx; AnatomyRegion::COUNT],
    pub blood_max: Fx,
    pub armor: [ArmorSpec; AnatomyRegion::COUNT],
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
pub struct UnitSpecV1 {
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
    /// A fighter was described holding nothing in either hand.
    ///
    /// **Not producible by `validate_rows`, and appended anyway**, because the
    /// thing that refuses it is [`crate::Scenario::duel_from`] and the caller
    /// there is a picker with two dropdowns both reading "empty". `validate_rows`
    /// would answer `LoadoutMismatch` for the same configuration -- via
    /// `(None, Some(_))` against a [`crate::Loadout`] whose `primary` is not an
    /// `Option` -- and that is a true sentence about the table and a useless one
    /// to put in front of a person. A distinct variant is what lets the refusal
    /// name the mistake.
    ///
    /// **Making `Loadout::primary` an `Option` is not the fix, and the next
    /// session should not rediscover it as one.** `primary` is written by
    /// `action_definition_bytes` through `scenario_v1_fields_into`, which is the
    /// ScenarioV1 identity stream *and* the replay codec: an option tag in front
    /// of it moves **every scenario fingerprint in this repository**, the pinned
    /// `articulated-duel-v1` included, and invalidates every recorded replay in
    /// one edit. A fighter holding nothing also has no rule to run -- see
    /// [`crate::Loadout::set`], which already refuses to empty slot zero for the
    /// same reason. The empty-handed fighter is a configuration the game does
    /// not have, not a gap in the type.
    NoEquipment,
    /// A Bow was not described as the sole right-hand item under a two-handed
    /// grip. This names the action-specific rule a caller can correct without guessing:
    /// the articulated Bow has one authoritative carrying shape.
    BowGrip,
    /// A hand item named an [`crate::ActionKind`] with no shipped equipment row.
    ///
    /// The row is where a scenario-local item takes its [`SurfaceSpec`] from,
    /// and a surface is a measured material rather than a dimension: there is no
    /// honest fallback material, and inventing one would be inventing combat
    /// geometry nobody measured. Four actions have rows -- `Sword`, `Shield`,
    /// `Club`, and the runtime-only `Bow` -- and the mapping stays total by
    /// refusing the rest
    /// rather than by falling back to whichever row looks nearest.
    UnknownAction,
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
            unit.combat_spec.expect("validated articulated unit")
        }), sink);
    }

    pub(crate) fn rows_into<S: ScenarioByteSink>(
        &self,
        units: &[UnitSpecV1],
        sink: &mut S,
    ) {
        write_combat_specs(self, units.iter().copied(), sink);
    }
}

fn write_combat_specs<S, I>(table: &CombatSpecTableV1, units: I, sink: &mut S)
where
    S: ScenarioByteSink,
    I: IntoIterator<Item = UnitSpecV1>,
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

/// Every construction check a scenario owes before a world exists.
///
/// **It took the combat model as its first argument and ignored it** -- the body
/// was `let _ = model;` for as long as two models both had articulated columns,
/// which is to say for the whole life of the parameter. It is dropped rather
/// than kept as a marker: a parameter no callee reads is a parameter six call
/// sites have to invent a value for, and the invented value is what makes a
/// later reader think the check is model-dependent.
pub fn validate_construction(
    table: Option<&CombatSpecTableV1>,
    units: &[crate::UnitSpec],
) -> Result<(), CombatSpecError> {
    let table = table.ok_or(CombatSpecError::MissingTable)?;
    if units.iter().any(|unit| unit.combat_spec.is_none()) { return Err(CombatSpecError::UnitPresence); }
    let rows = units.iter().map(|unit| unit.combat_spec.unwrap()).collect::<Vec<_>>();
    let loadouts = units.iter().map(|unit| unit.loadout).collect::<Vec<_>>();
    validate_rows(table, &rows, &loadouts)
}

pub(crate) fn validate_rows(
    table: &CombatSpecTableV1,
    rows: &[UnitSpecV1],
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

fn validate_bindings(table: &CombatSpecTableV1, unit: UnitSpecV1) -> Result<(), CombatSpecError> {
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
    unit: UnitSpecV1,
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
    unit: UnitSpecV1,
    grips: [crate::GripRequest; 2],
) -> bool {
    for arm in 0..grips.len() {
        if !grip_valid_for_arm(table, unit, grips, arm) { return false; }
    }
    true
}

pub(crate) fn grip_valid_for_arm(
    table: &CombatSpecTableV1,
    unit: UnitSpecV1,
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

pub(crate) fn write_unit<S: ScenarioByteSink>(row: UnitSpecV1, sink: &mut S) {
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

/// A 0.5 x 0.5 round shield, and the small dimensions are the whole point.
///
/// **The plate used to be a door.** Its centre is its holding hand, so
/// [`CombatHeight`](crate::CombatHeight) puts it at 0.45 / 0.90 / 1.35 on a
/// Fighter, and a `half_height` of 1/2 therefore spanned 0.40..1.40 at MID
/// against a torso of 0.70..1.50, arms of 0.90..1.50 and a head of 1.60..1.80.
/// The plan that shrank it said that covered "the whole torso" at two heights;
/// the derivation says it never did -- 87.5% at MID, 81.25% at HIGH -- and that
/// the real complaint is a different one. **Every setting answered at least one
/// region outright**: the whole of the legs at LOW, and the whole of the head
/// and both arms at HIGH. Four cells an attacker had no answer to at all, which
/// is what "too easy to block" turns out to mean once it is written as
/// intervals.
///
/// A quarter each way answers nothing outright, leaves a different hole at
/// every height, and gives the three settings three different best-covered
/// regions -- legs, torso, an arm.
/// `the_plate_leaves_a_different_hole_at_every_guard_height` derives both
/// tables from these numbers rather than restating them, and that is where the
/// derivation belongs: a table written into this comment is a table that can go
/// stale against the line below it, which is precisely how the claim above got
/// into a plan.
///
/// **Mass, balance and surface deliberately did not move with it**, and the
/// resulting inconsistency is recorded rather than quietly fixed: a plate at
/// 36% of the face area still weighing 9/10 is heavy. `equipment_inertia` feeds
/// arm acceleration, so editing the mass in the same commit would confound
/// every attrition number with a change in how fast the guard arm can travel.
/// One variable at a time; the mass is a measurement somebody still owes.
///
/// The old `7/20` by `1/2` is a **tall shield** and not a lost calibration: a
/// second equipment row for a session that wants a second defensive archetype.
/// Adding it here would move the spec-table digest for no measurement at all.
pub fn shield() -> EquipmentSpec { EquipmentSpec {
    id: 2, schema: 1, action: ActionKind::Shield, mass: r(9,10), balance: r(7,20),
    geometry: EquipmentGeometry::Shield { half_width: r(1,4), half_height: r(1,4), thickness: r(1,20) },
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
        // v2-20 shrank the plate to a quarter each way and moved nothing else
        // in this row -- the mass, the balance, the thickness, the binding and
        // the surface above are all still the v1 values, which is what makes
        // the attrition numbers that session recorded attributable to the face
        // area alone.
        assert_eq!(shield.geometry, EquipmentGeometry::Shield { half_width: Fx::from_ratio(1,4), half_height: Fx::from_ratio(1,4), thickness: Fx::from_ratio(1,20) });
        assert_eq!((club.mass.raw(), club.balance.raw(), club.binding, club.surface),
            (raw(223,100), raw(61,100), GripBinding::Right,
             SurfaceSpec { restitution: Fx::from_ratio(1,4), friction: Fx::from_ratio(1,2), edge_factor: Fx::ZERO, point_factor: Fx::from_ratio(1,2), material: Material::Wood }));
        assert_eq!(club.geometry, EquipmentGeometry::Segment { length: Fx::from_ratio(29,20), radius: Fx::from_ratio(3,50) });
    }

    /// The `[LOW, MID, HIGH]` order every table in this test is written in.
    const GUARDS: [(&str, crate::CombatHeight); 3] = [
        ("LOW ", crate::CombatHeight::LOW),
        ("MID ", crate::CombatHeight::MID),
        ("HIGH", crate::CombatHeight::HIGH),
    ];

    /// How much of each region a plate of `half_height` hides at each guard
    /// height: the vertical overlap in raw fixed point, `[guard][region]`.
    ///
    /// Everything comes out of the fixtures and out of `hand_position` -- the
    /// one function the world uses to place a hand -- so a change to the
    /// anatomy, to `CombatHeight`'s three constants or to how a height becomes a
    /// z moves this table with it. That is the whole point of computing it here
    /// rather than writing a coverage table into a comment where it can rot.
    ///
    /// **The plate's z does not depend on the arm.** `hand_position` gives the
    /// hand `standing_height * height` and puts bearing and reach in x and y
    /// only, and `derive_shield_pose` takes the plate's centre from that hand,
    /// so the reach passed below is arbitrary and the vertical answer is the
    /// same for every pose the guard can hold. What the reach *does* change is
    /// lateral coverage, which this table says nothing about: a plate can be at
    /// the right height and still be a foot to the left of the blow.
    fn plate_overlap(half_height: Fx) -> [[i32; AnatomyRegion::COUNT]; 3] {
        let fighter = fighter_anatomy();
        GUARDS.map(|(_, height)| {
            let hand = crate::combat::actuator::hand_position(
                &fighter, fx::Angle::ZERO, LimbSlot::LeftArm as usize,
                fx::Angle::ZERO, height, Fx::from_ratio(3, 4),
            );
            let (low, high) = (hand.z - half_height, hand.z + half_height);
            fighter.regions.map(|region| {
                let bottom = region.centre_z - region.half_height;
                let top = region.centre_z + region.half_height;
                (high.min(top).raw() - low.max(bottom).raw()).max(0)
            })
        })
    }

    #[test]
    fn the_plate_leaves_a_different_hole_at_every_guard_height() {
        // **The reason v2-20 shrank the shield, derived rather than asserted.**
        // A guard height is only a decision if the three settings answer
        // different attacks; a plate that covers the body whatever you do with
        // it turns the one channel the off arm has into a formality, and turns
        // the fight this repository is trying to make legible into a fight with
        // no gradient in it for anything to learn.
        //
        // Read on the Fighter, which is the only body on this roster that
        // carries a plate, and vertically, which is the axis `CombatHeight`
        // moves. Both bounds of both intervals come from the same spec table.
        let fighter = fighter_anatomy();
        let region_span = fighter.regions.map(|r| (r.half_height + r.half_height).raw());
        let EquipmentGeometry::Shield { half_height, .. } = shield().geometry else {
            panic!("the shield fixture carries shield geometry");
        };
        assert_eq!(half_height, Fx::from_ratio(1, 4), "the shipped plate");
        let shipped = plate_overlap(half_height);
        // The plate this replaced, kept here as the other half of the
        // comparison and not as a live constant: `7/20 x 1/2` is the tall
        // shield a later session may add as its own equipment row.
        let superseded = plate_overlap(Fx::from_ratio(1, 2));

        // Printed so the derivation is readable evidence and not just a pass.
        // `cargo test -p sim -- --nocapture the_plate_leaves` is the command.
        for (name, table) in [("1/4 (shipped)", shipped), ("1/2 (superseded)", superseded)] {
            println!("fighter vertical coverage, shield half_height {name}:");
            for (guard, row) in GUARDS.iter().zip(table) {
                let cells: Vec<String> = AnatomyRegion::ALL.iter().enumerate()
                    .map(|(at, region)| format!(
                        "{region:?} {:.2}%",
                        100.0 * row[at] as f64 / region_span[at] as f64
                    ))
                    .collect();
                println!("  {}  {}", guard.0, cells.join("  "));
            }
        }

        // Raw fixed point, pinned, because that is what the arithmetic above
        // produces and a decimal would round. Region extents are
        // Head 104,858..117,964, Torso 45,875..98,303, either Arm
        // 58,983..98,303 and Legs 0..52,428; the hand sits at 29,491 / 58,982 /
        // 88,473, which is `standing_height` truncated to 117,964 times a
        // quarter, a half and three quarters.
        assert_eq!(shipped, [
            //  Head  Torso   LeftArm RightArm Legs
            [   0,      0,      0,      0,      32_768 ],
            [   0,      29_491, 16_383, 16_383, 9_830  ],
            [   0,      26_214, 26_214, 26_214, 0      ],
        ]);
        assert_eq!(superseded, [
            [   0,      16_384, 3_276,  3_276,  52_428 ],
            [   0,      45_875, 32_767, 32_767, 26_214 ],
            [   13_106, 42_598, 39_320, 39_320, 0      ],
        ]);

        // **Nothing is answered completely any more, and four things used to
        // be.** A cell equal to the region's own extent is a region the guard
        // hides outright at that height, which is what an attacker has no
        // answer to: the old plate did that to the legs at LOW and to the head
        // and both arms at HIGH.
        let complete = |table: [[i32; AnatomyRegion::COUNT]; 3]| {
            table.iter().flat_map(|row| row.iter().enumerate())
                .filter(|(at, &cell)| cell == region_span[*at])
                .count()
        };
        assert_eq!(complete(superseded), 4, "the old plate answered four cells outright");
        assert_eq!(complete(shipped), 0, "the new plate answers nothing outright");

        // **The head is open at every guard height, which is the claim**, and
        // the old plate hid it whole at HIGH, which is what changed. Asserted
        // as the whole column rather than at the one height that is close,
        // because "the shield cannot take the head off the table" is the
        // property a reader is entitled to rely on.
        assert!(shipped.iter().all(|row| row[AnatomyRegion::Head as usize] == 0));
        assert_eq!(
            superseded[2][AnatomyRegion::Head as usize],
            region_span[AnatomyRegion::Head as usize],
            "the old plate hid the whole head at HIGH"
        );
        // **HIGH is flush with the chin to within a raw unit, and that is a
        // coincidence rather than a clearance.** The plate's top lands at
        // 104,857 and the head begins at 104,858 -- one part in 65,536 of a
        // world unit, which is 0.0015% of the head's own extent and is the
        // truncation of `standing_height` at `9/5` landing where it does. It is
        // recorded so nobody reads a designed margin into it, and deliberately
        // *not* pinned at one raw: an anatomy or `CombatHeight` edit that moved
        // it to two or to ten would be no more and no less correct, and the
        // assertion above already fails the moment it goes to zero and the
        // plate starts covering the head. Asserted only in the direction that
        // means something.
        let top_at_high = crate::combat::actuator::hand_position(
            &fighter, fx::Angle::ZERO, LimbSlot::LeftArm as usize,
            fx::Angle::ZERO, crate::CombatHeight::HIGH, Fx::from_ratio(3, 4),
        ).z + half_height;
        let head = fighter.regions[AnatomyRegion::Head as usize];
        let chin = (head.centre_z - head.half_height).raw();
        assert!(top_at_high.raw() < chin, "a HIGH guard reached the head");
        println!(
            "  HIGH tops out at {} raw against a chin at {chin}: clear by {}",
            top_at_high.raw(),
            chin - top_at_high.raw()
        );

        // **Three settings, three different regions best answered**, which is
        // the property that makes the height a choice: legs at LOW, torso at
        // MID, either arm at HIGH. The old plate had the same argmax -- legs,
        // torso, head -- but with two of the three answered in full, so the
        // choice was between "cover everything that matters" and "cover
        // everything that matters and the head".
        let best = |table: [[i32; AnatomyRegion::COUNT]; 3]| table.map(|row| {
            (0..AnatomyRegion::COUNT)
                .max_by_key(|&at| (row[at] as i64) * 65_536 / region_span[at] as i64)
                .expect("five regions")
        });
        // HIGH is written as `RightArm` because `max_by_key` answers the last
        // of equal keys and the two arms are the same interval to the raw unit.
        // The claim is "an arm", and `LeftArm` ties it exactly.
        assert_eq!(best(shipped), [
            AnatomyRegion::Legs as usize,
            AnatomyRegion::Torso as usize,
            AnatomyRegion::RightArm as usize,
        ]);
        assert_eq!(
            shipped[2][AnatomyRegion::LeftArm as usize],
            shipped[2][AnatomyRegion::RightArm as usize]
        );
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
        let scenario = crate::Scenario::embodied_duel();
        let original = scenario.fingerprint();
        let mut changed = scenario.clone();
        changed.combat_specs.as_mut().unwrap().equipment[0].mass += Fx::from_raw(1);
        assert_ne!(changed.fingerprint(), original);
        let mut changed = scenario.clone();
        changed.units[0].combat_spec.as_mut().unwrap().anatomy = 2;
        assert_ne!(changed.fingerprint(), original);
    }

    #[test]
    fn unknown_duplicate_missing_and_mismatched_specs_fail_closed() {
        let scenario = crate::Scenario::embodied_duel();
        assert_eq!(validate_construction(scenario.combat_specs.as_ref(), &scenario.units), Ok(()));
        let mut changed = scenario.clone();
        changed.combat_specs.as_mut().unwrap().anatomies[0].schema = 2;
        assert_eq!(validate_construction(changed.combat_specs.as_ref(), &changed.units), Err(CombatSpecError::UnknownSchema));
        let mut changed = scenario.clone();
        changed.combat_specs.as_mut().unwrap().equipment[1].id = 1;
        assert_eq!(validate_construction(changed.combat_specs.as_ref(), &changed.units), Err(CombatSpecError::IdOrder));
        let mut changed = scenario.clone();
        changed.units[0].combat_spec.as_mut().unwrap().anatomy = 99;
        assert_eq!(validate_construction(changed.combat_specs.as_ref(), &changed.units), Err(CombatSpecError::MissingReference));
        let mut changed = scenario.clone();
        changed.combat_specs.as_mut().unwrap().equipment[0].action = ActionKind::Club;
        assert_eq!(validate_construction(changed.combat_specs.as_ref(), &changed.units), Err(CombatSpecError::LoadoutMismatch));
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
            UnitSpecV1 { anatomy: 1, equipment: [Some(1), Some(2)] },
            UnitSpecV1 { anatomy: 2, equipment: [Some(3), None] },
        ], &mut digest);
        // Moved once, by v2-20, and by exactly six bytes: the shield row's
        // `half_width` and `half_height` each went from a `7/20` and a `1/2` to
        // a `1/4`. Previously `0xf518_cd24_4980_f2d4`. `SHIELD_EQUIPMENT_SPEC_V1_BYTES`
        // is still 44 below, which is the point of asserting both here -- the
        // values moved and the widths did not, so this is a fixture edit and
        // not a format change.
        assert_eq!(digest.finish(), 0x78e5_b57a_e0c6_bbd6);
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

    /// The two numberings agree where they overlap and nowhere else.
    ///
    /// The first assertion is the load-bearing one: a volume index below
    /// `AnatomyRegion::COUNT` names the region with the same number, which is
    /// what lets every corpus recorded before the elbow existed keep meaning
    /// what it meant. The rest bound the bridge on both sides, so a seventh
    /// volume added without a region to answer for cannot pass as a sixth.
    #[test]
    fn a_volume_index_below_five_is_its_own_region_and_a_forearm_is_its_arm() {
        for (index, region) in AnatomyRegion::ALL.into_iter().enumerate() {
            assert_eq!(volume_region(index), Some(region));
        }
        assert_eq!(volume_region(forearm_volume(LimbSlot::LeftArm as usize)),
                   Some(AnatomyRegion::LeftArm));
        assert_eq!(volume_region(forearm_volume(LimbSlot::RightArm as usize)),
                   Some(AnatomyRegion::RightArm));
        assert_eq!(volume_region(BODY_VOLUME_COUNT), None);
        assert_eq!(BODY_VOLUME_COUNT, 7);
        // Every volume answers for some region, which is what the wounding
        // path relies on when it turns a contact fact into a body part.
        assert!((0..BODY_VOLUME_COUNT).all(|volume| volume_region(volume).is_some()));
    }

}
