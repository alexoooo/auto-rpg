use crate::command::{
    ArticulatedCommandV1, ArticulatedPayloadError, Command, GripRequest, Intent, LimbCommand,
    Objective, Order, Strike, SubmittedCommand, ARTICULATED_PAYLOAD_BYTES,
    SUBMITTED_COMMAND_LAYOUT_VERSION,
};
use crate::combat::spec::{
    combat_specs_into, validate_construction, AnatomyRegion, AnatomyRegionSpec, ArmorSpec,
    ArticulatedUnitSpecV1, BodyAnatomySpec, CombatSpecError, CombatSpecTableV1,
    EquipmentGeometry, EquipmentSpec, GripBinding, Material, SurfaceSpec,
    BODY_ANATOMY_SPEC_V1_BYTES, COMBAT_SPEC_SCHEMA_V1, MAX_ANATOMY_SPECS,
    MAX_EQUIPMENT_SPECS, SEGMENT_EQUIPMENT_SPEC_V1_BYTES, SHIELD_EQUIPMENT_SPEC_V1_BYTES,
};
use crate::dungeon::{Cardinal, Dungeon, Torch, DOOR, OPEN, WALL};
use crate::entity::{Body, EntityId, Faction};
use crate::hash_domain::HashDomain;
use crate::loadout::Loadout;
use crate::replay::{CommandRecord, ObjectiveRecord, OrderRecord, Replay, SubmittedCommandRecord};
use crate::rules::Stats;
use crate::scenario::{
    action_definition_bytes, scenario_v1_fields_into, CombatModel, Scenario, ScenarioByteSink,
    UnitSpec,
};
use crate::world::World;
use fx::{Angle, Fx, Hash64, Vec2};

pub const REPLAY_CODEC_VERSION: u16 = 2;
pub const REPLAY_CODEC_VERSION_V1: u16 = 1;
pub const LEGACY_COMMAND_SCHEMA: u16 = 0;
pub const ARTICULATED_COMMAND_SCHEMA_RESERVED: u16 = 1;
const _: () = assert!(ARTICULATED_COMMAND_SCHEMA_RESERVED == SUBMITTED_COMMAND_LAYOUT_VERSION);

pub const MAX_REPLAY_ENVELOPE_BYTES: usize = 16_777_216;
pub const MAX_SCENARIO_RECORD_BYTES: usize = 1_048_576;
pub const MAX_SCENARIO_NAME_BYTES: usize = 1_024;
pub const MAX_DUNGEON_TILES: usize = 65_536;
pub const MAX_SCENARIO_UNITS: usize = 4_096;
pub const MAX_SCENARIO_TORCHES: usize = 8_192;
pub const MAX_COMMAND_RECORDS: usize = 262_144;
pub const MAX_ORDER_RECORDS: usize = 65_536;
pub const MAX_OBJECTIVE_RECORDS: usize = 65_536;

const HEADER_BYTES: usize = 40;
const LEGACY_COMMAND_BYTES: usize = 37;
const SUBMITTED_LEGACY_COMMAND_BYTES: usize = 38;
const ARTICULATED_COMMAND_BYTES: usize = 64;
const ORDER_BYTES: usize = 14;
const OBJECTIVE_BYTES: usize = 6;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ReplayLimit {
    EnvelopeBytes,
    ScenarioRecordBytes,
    ScenarioNameBytes,
    DungeonTiles,
    ScenarioUnits,
    ScenarioTorches,
    AnatomySpecs,
    EquipmentSpecs,
    CommandRecords,
    OrderRecords,
    ObjectiveRecords,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ReplayStream {
    Commands,
    Orders,
    Objectives,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ReplayField {
    Seed,
    TickLimit,
    ScenarioFingerprint,
    CombatModel,
    ScenarioName,
    DungeonDimensions,
    DungeonTileCount,
    DungeonTile,
    PortalPresence,
    PortalPosition,
    UnitBody,
    UnitFaction,
    UnitSpawn,
    PrimaryAction,
    SecondaryPresence,
    SecondaryAction,
    ActionRole,
    TorchPosition,
    TorchFace,
    CombatSpecPresence,
    CombatSpecSchema,
    AnatomySpec,
    EquipmentSpec,
    ArticulatedUnitSpec,
    CommandSubject,
    CommandIntent,
    CommandIntentTarget,
    CommandStrike,
    SubmittedCommandKind,
    ArticulatedCommand,
    CommandGrip,
    OrderFaction,
    OrderKind,
    OrderPayload,
    ObjectiveFaction,
    ObjectiveKind,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ReplayValidationError {
    EnvelopeReplayMismatch(ReplayField),
    LimitExceeded(ReplayLimit),
    InvalidField(ReplayField),
    NonCanonicalField(ReplayField),
    NonMonotonic { stream: ReplayStream, at: u32 },
    RecordAfterTickLimit { stream: ReplayStream, tick: u32 },
    CommandModelMismatch,
    ScenarioFingerprintMismatch { stored: u64, computed: u64 },
    MissingCombatSpecs,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ReplayDecodeError {
    TooShort,
    BadMagic,
    UnknownCodecVersion(u16),
    MissingCombatSpecs,
    UnknownCommandSchema(u16),
    UnknownHashDomain(u8),
    UnknownHashSchema { domain: HashDomain, schema: u16 },
    ReservedHeaderBits,
    PayloadLength,
    LimitExceeded(ReplayLimit),
    InvalidUtf8,
    UnknownDiscriminant { field: ReplayField, value: u32 },
    InvalidField(ReplayField),
    NonCanonicalField(ReplayField),
    NonMonotonic { stream: ReplayStream, at: u32 },
    RecordAfterTickLimit { stream: ReplayStream, tick: u32 },
    CommandModelMismatch,
    RegistryDefinitionMismatch { action: u8 },
    ScenarioFingerprintMismatch { stored: u64, computed: u64 },
    TrailingBytes,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ReplayEncodeError {
    SizeOverflow,
    Invalid(ReplayValidationError),
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ReplayPlayError {
    Invalid(ReplayValidationError),
}

#[derive(Clone, Debug)]
pub struct ReplayEnvelope {
    pub command_schema: u16,
    pub hash_domain: HashDomain,
    pub hash_schema: u16,
    pub scenario_fingerprint: u64,
    pub seed: u64,
    pub tick_limit: u32,
    pub replay: Replay,
}

impl ReplayEnvelope {
    pub fn encode(&self) -> Result<Vec<u8>, ReplayEncodeError> {
        validate_envelope(self).map_err(ReplayEncodeError::Invalid)?;
        let scenario_len = scenario_record_len(&self.replay.scenario)
            .ok_or(ReplayEncodeError::SizeOverflow)?;
        let payload_len = payload_len(scenario_len, &self.replay)
            .ok_or(ReplayEncodeError::SizeOverflow)?;
        let total_len = HEADER_BYTES.checked_add(payload_len)
            .ok_or(ReplayEncodeError::SizeOverflow)?;

        let mut out = ByteWriter::with_capacity(total_len);
        out.bytes.extend_from_slice(b"ARPG");
        let codec_version = codec_version_for(self.replay.scenario.combat_model);
        out.u16(codec_version);
        out.u16(self.command_schema);
        out.u8(self.hash_domain as u8);
        out.u8(0);
        out.u16(self.hash_schema);
        out.u32(payload_len as u32);
        out.u64(self.scenario_fingerprint);
        out.u64(self.seed);
        out.u32(self.tick_limit);
        out.u32(scenario_len as u32);

        let scenario = &self.replay.scenario;
        scenario_v1_fields_into(scenario, scenario.name.len() as u16, &mut out);
        out.u32(scenario.torches.len() as u32);
        for torch in &scenario.torches {
            out.u16(torch.tx);
            out.u16(torch.ty);
            out.u8(cardinal_code(torch.face));
        }
        if codec_version == REPLAY_CODEC_VERSION {
            combat_specs_into(scenario.combat_specs.as_ref(), &scenario.units, &mut out);
        }

        let command_count = if self.command_schema == LEGACY_COMMAND_SCHEMA {
            self.replay.entries.len()
        } else {
            self.replay.submitted_entries.len()
        };
        out.u32(command_count as u32);
        if self.command_schema == LEGACY_COMMAND_SCHEMA {
            for record in &self.replay.entries { write_command(&mut out, *record); }
        } else {
            for record in &self.replay.submitted_entries { write_submitted_command(&mut out, *record); }
        }
        out.u32(self.replay.orders.len() as u32);
        for record in &self.replay.orders {
            write_order(&mut out, *record);
        }
        out.u32(self.replay.objectives.len() as u32);
        for record in &self.replay.objectives {
            write_objective(&mut out, *record);
        }
        debug_assert_eq!(out.bytes.len(), total_len);
        Ok(out.bytes)
    }

    pub fn decode(bytes: &[u8]) -> Result<ReplayEnvelope, ReplayDecodeError> {
        if bytes.len() > MAX_REPLAY_ENVELOPE_BYTES {
            return Err(ReplayDecodeError::LimitExceeded(ReplayLimit::EnvelopeBytes));
        }
        if bytes.len() < HEADER_BYTES {
            return Err(ReplayDecodeError::TooShort);
        }
        let mut reader = ByteReader::new(bytes);
        if reader.take(4)? != b"ARPG" {
            return Err(ReplayDecodeError::BadMagic);
        }
        let codec_version = reader.u16()?;
        if codec_version != REPLAY_CODEC_VERSION_V1 && codec_version != REPLAY_CODEC_VERSION {
            return Err(ReplayDecodeError::UnknownCodecVersion(codec_version));
        }
        let command_schema = reader.u16()?;
        if command_schema != LEGACY_COMMAND_SCHEMA
            && command_schema != SUBMITTED_COMMAND_LAYOUT_VERSION
        {
            return Err(ReplayDecodeError::UnknownCommandSchema(command_schema));
        }
        let domain_code = reader.u8()?;
        let hash_domain = match domain_code {
            0 => HashDomain::LegacyV1,
            1 => HashDomain::ArticulatedV1,
            value => return Err(ReplayDecodeError::UnknownHashDomain(value)),
        };
        if reader.u8()? != 0 {
            return Err(ReplayDecodeError::ReservedHeaderBits);
        }
        let hash_schema = reader.u16()?;
        if hash_schema != 1 {
            return Err(ReplayDecodeError::UnknownHashSchema {
                domain: hash_domain,
                schema: hash_schema,
            });
        }
        let payload_bytes = reader.u32()? as usize;
        let scenario_fingerprint = reader.u64()?;
        let seed = reader.u64()?;
        let tick_limit = reader.u32()?;
        let scenario_bytes = reader.u32()? as usize;
        if HEADER_BYTES.checked_add(payload_bytes) != Some(bytes.len()) {
            return Err(ReplayDecodeError::PayloadLength);
        }
        if scenario_bytes > MAX_SCENARIO_RECORD_BYTES {
            return Err(ReplayDecodeError::LimitExceeded(ReplayLimit::ScenarioRecordBytes));
        }
        if scenario_bytes > payload_bytes {
            return Err(ReplayDecodeError::PayloadLength);
        }
        let scenario_slice = reader.take(scenario_bytes)?;
        let scanned = scan_scenario(scenario_slice, codec_version)?;
        let tuple_ok = matches!(
            (command_schema, hash_domain, hash_schema, scanned.combat_model),
            (LEGACY_COMMAND_SCHEMA, HashDomain::LegacyV1, 1, CombatModel::Legacy)
                | (SUBMITTED_COMMAND_LAYOUT_VERSION, HashDomain::ArticulatedV1, 1, CombatModel::Articulated)
        );
        if !tuple_ok {
            return Err(ReplayDecodeError::CommandModelMismatch);
        }
        if tick_limit > scanned.max_ticks {
            return Err(ReplayDecodeError::InvalidField(ReplayField::TickLimit));
        }
        let stream_start = reader.at;
        scan_streams(&mut reader, scanned.unit_count, tick_limit, command_schema, None, None)?;
        if !reader.is_empty() {
            return Err(ReplayDecodeError::TrailingBytes);
        }

        validate_combat_extension_after_eof(scenario_slice, codec_version)?;
        if scenario_fingerprint != scanned.fingerprint {
            return Err(ReplayDecodeError::ScenarioFingerprintMismatch {
                stored: scenario_fingerprint,
                computed: scanned.fingerprint,
            });
        }

        // No owned scenario field or final record vector exists above this
        // line. Corrupt input pays only bounded scalar validation; allocation
        // begins after scenario, streams, and exact EOF have all agreed.
        let scenario = build_scenario(scenario_slice, codec_version)?;
        let mut validation = ByteReader { bytes, at: stream_start };
        scan_streams(
            &mut validation,
            scanned.unit_count,
            tick_limit,
            command_schema,
            Some(&scenario),
            None,
        )?;
        debug_assert!(validation.is_empty());
        let mut records = DecodedStreams::default();
        let mut second = ByteReader { bytes, at: stream_start };
        scan_streams(&mut second, scanned.unit_count, tick_limit, command_schema, Some(&scenario), Some(&mut records))?;
        debug_assert!(second.is_empty());

        let replay = Replay {
            seed,
            scenario,
            scenario_fingerprint,
            ticks: tick_limit,
            entries: records.commands,
            submitted_entries: records.submitted_commands,
            orders: records.orders,
            objectives: records.objectives,
        };
        Ok(ReplayEnvelope {
            command_schema,
            hash_domain,
            hash_schema,
            scenario_fingerprint,
            seed,
            tick_limit,
            replay,
        })
    }

    pub fn play(&self) -> Result<World, ReplayPlayError> {
        validate_envelope(self).map_err(ReplayPlayError::Invalid)?;
        Ok(self.replay.play())
    }
}

/// The codec version a scenario in memory is written at.
///
/// One function because encode and encode-side validation have to agree: a
/// scenario cleared by the ceiling of one version and then written at the other
/// is a replay that its own decoder rejects.
fn codec_version_for(model: CombatModel) -> u16 {
    if model == CombatModel::Legacy { REPLAY_CODEC_VERSION_V1 } else { REPLAY_CODEC_VERSION }
}

/// The unit ceiling in force for one scenario record.
///
/// `MAX_SCENARIO_UNITS` bounds the *field*; how many units a model can actually
/// simulate is a separate question, and for Articulated the contact solver
/// answers it -- `MAX_ARTICULATED_ENTITIES` is its authoritative entity
/// capacity, not a browser publication limit, so row 65 can never be honoured
/// however it arrives. Legacy keeps 4,096 exactly: same bytes, same offsets,
/// same error, because those are pinned by fixture.
///
/// The overflow keeps `ReplayLimit::ScenarioUnits`. The tag names the field that
/// was too large, not the constant that bounded it, and no caller can act
/// differently on the two -- both mean "send fewer units". A new variant would
/// also change an exported enum that `replay-codec-v1.md` transcribes verbatim,
/// to say something the existing one already says.
///
/// `codec_version` is not redundant with the model. A V1 record carrying the
/// Articulated tag is malformed in a deeper way and already answers
/// `MissingCombatSpecs`; narrowing its ceiling first would change that error for
/// no gain.
fn scenario_unit_ceiling(codec_version: u16, model: CombatModel) -> usize {
    if codec_version == REPLAY_CODEC_VERSION && model == CombatModel::Articulated {
        crate::combat::contact::MAX_ARTICULATED_ENTITIES
    } else {
        MAX_SCENARIO_UNITS
    }
}

fn validate_envelope(envelope: &ReplayEnvelope) -> Result<(), ReplayValidationError> {
    if envelope.seed != envelope.replay.seed {
        return Err(ReplayValidationError::EnvelopeReplayMismatch(ReplayField::Seed));
    }
    if envelope.tick_limit != envelope.replay.ticks {
        return Err(ReplayValidationError::EnvelopeReplayMismatch(ReplayField::TickLimit));
    }
    if envelope.scenario_fingerprint != envelope.replay.scenario_fingerprint {
        return Err(ReplayValidationError::EnvelopeReplayMismatch(
            ReplayField::ScenarioFingerprint,
        ));
    }
    let tuple_ok = matches!(
        (envelope.command_schema, envelope.hash_domain, envelope.hash_schema, envelope.replay.scenario.combat_model),
        (LEGACY_COMMAND_SCHEMA, HashDomain::LegacyV1, 1, CombatModel::Legacy)
            | (SUBMITTED_COMMAND_LAYOUT_VERSION, HashDomain::ArticulatedV1, 1, CombatModel::Articulated)
    );
    if !tuple_ok {
        return Err(ReplayValidationError::CommandModelMismatch);
    }
    if (envelope.command_schema == LEGACY_COMMAND_SCHEMA && !envelope.replay.submitted_entries.is_empty())
        || (envelope.command_schema == SUBMITTED_COMMAND_LAYOUT_VERSION && !envelope.replay.entries.is_empty())
    {
        return Err(ReplayValidationError::CommandModelMismatch);
    }
    let computed = envelope.replay.scenario.try_fingerprint().map_err(|error| match error {
        crate::ScenarioFingerprintError::NameTooLong { .. } => ReplayValidationError::LimitExceeded(ReplayLimit::ScenarioNameBytes),
        crate::ScenarioFingerprintError::InvalidCombatSpecs(CombatSpecError::MissingTable) => ReplayValidationError::MissingCombatSpecs,
        crate::ScenarioFingerprintError::InvalidCombatSpecs(_) => ReplayValidationError::InvalidField(ReplayField::ArticulatedUnitSpec),
    })?;
    if envelope.replay.scenario_fingerprint != computed {
        return Err(ReplayValidationError::ScenarioFingerprintMismatch {
            stored: envelope.replay.scenario_fingerprint,
            computed,
        });
    }
    validate_scenario(&envelope.replay.scenario, envelope.tick_limit)?;
    validate_records(&envelope.replay, envelope.tick_limit)?;
    let scenario_len = scenario_record_len(&envelope.replay.scenario)
        .ok_or(ReplayValidationError::LimitExceeded(ReplayLimit::ScenarioRecordBytes))?;
    if scenario_len > MAX_SCENARIO_RECORD_BYTES {
        return Err(ReplayValidationError::LimitExceeded(ReplayLimit::ScenarioRecordBytes));
    }
    let total = payload_len(scenario_len, &envelope.replay)
        .and_then(|payload| HEADER_BYTES.checked_add(payload))
        .ok_or(ReplayValidationError::LimitExceeded(ReplayLimit::EnvelopeBytes))?;
    if total > MAX_REPLAY_ENVELOPE_BYTES {
        return Err(ReplayValidationError::LimitExceeded(ReplayLimit::EnvelopeBytes));
    }
    Ok(())
}

fn validate_scenario(scenario: &Scenario, tick_limit: u32) -> Result<(), ReplayValidationError> {
    validate_construction(scenario.combat_model, scenario.combat_specs.as_ref(), &scenario.units)
        .map_err(|error| match error {
            CombatSpecError::TooManyAnatomies => ReplayValidationError::LimitExceeded(ReplayLimit::AnatomySpecs),
            CombatSpecError::TooManyEquipment => ReplayValidationError::LimitExceeded(ReplayLimit::EquipmentSpecs),
            CombatSpecError::MissingTable => ReplayValidationError::MissingCombatSpecs,
            _ => ReplayValidationError::InvalidField(ReplayField::ArticulatedUnitSpec),
        })?;
    if scenario.name.len() > MAX_SCENARIO_NAME_BYTES {
        return Err(ReplayValidationError::LimitExceeded(ReplayLimit::ScenarioNameBytes));
    }
    let tiles = scenario.dungeon.tiles();
    if tiles.len() > MAX_DUNGEON_TILES {
        return Err(ReplayValidationError::LimitExceeded(ReplayLimit::DungeonTiles));
    }
    if tiles.iter().any(|tile| !matches!(*tile, OPEN | WALL | DOOR)) {
        return Err(ReplayValidationError::InvalidField(ReplayField::DungeonTile));
    }
    // After `validate_construction` above, and deliberately: `try_fingerprint`
    // has already run the same construction check, so a roster that is both
    // oversized and malformed reports the malformation either way. Moving the
    // ceiling up would only separate it from the other scenario bounds.
    let model = scenario.combat_model;
    if scenario.units.len() > scenario_unit_ceiling(codec_version_for(model), model) {
        return Err(ReplayValidationError::LimitExceeded(ReplayLimit::ScenarioUnits));
    }
    if scenario.torches.len() > MAX_SCENARIO_TORCHES {
        return Err(ReplayValidationError::LimitExceeded(ReplayLimit::ScenarioTorches));
    }
    if tick_limit > scenario.max_ticks {
        return Err(ReplayValidationError::InvalidField(ReplayField::TickLimit));
    }
    if let Some(portal) = scenario.portal {
        if !point_in_extent(portal, scenario.dungeon.cols(), scenario.dungeon.rows()) {
            return Err(ReplayValidationError::InvalidField(ReplayField::PortalPosition));
        }
    }
    for unit in &scenario.units {
        if !point_in_extent(unit.spawn, scenario.dungeon.cols(), scenario.dungeon.rows()) {
            return Err(ReplayValidationError::InvalidField(ReplayField::UnitSpawn));
        }
    }
    for torch in &scenario.torches {
        if torch.tx >= scenario.dungeon.cols() || torch.ty >= scenario.dungeon.rows() {
            return Err(ReplayValidationError::InvalidField(ReplayField::TorchPosition));
        }
    }
    Ok(())
}

fn validate_records(replay: &Replay, tick_limit: u32) -> Result<(), ReplayValidationError> {
    validate_count(replay.entries.len().saturating_add(replay.submitted_entries.len()), MAX_COMMAND_RECORDS, ReplayLimit::CommandRecords)?;
    validate_count(replay.orders.len(), MAX_ORDER_RECORDS, ReplayLimit::OrderRecords)?;
    validate_count(
        replay.objectives.len(),
        MAX_OBJECTIVE_RECORDS,
        ReplayLimit::ObjectiveRecords,
    )?;
    let roster = replay.scenario.units.len();
    let mut prior = None;
    for (at, record) in replay.entries.iter().enumerate() {
        validate_tick(prior, record.tick, at, ReplayStream::Commands, tick_limit, false)?;
        prior = Some(record.tick);
        if !initial_id(record.entity, roster) {
            return Err(ReplayValidationError::InvalidField(ReplayField::CommandSubject));
        }
        if let Intent::Attack(target) = record.command.intent {
            if !initial_id(target, roster) {
                return Err(ReplayValidationError::InvalidField(
                    ReplayField::CommandIntentTarget,
                ));
            }
        }
    }
    prior = None;
    for (at, record) in replay.submitted_entries.iter().enumerate() {
        validate_tick(prior, record.tick, at, ReplayStream::Commands, tick_limit, false)?;
        prior = Some(record.tick);
        if !initial_id(record.entity, roster) {
            return Err(ReplayValidationError::InvalidField(ReplayField::CommandSubject));
        }
        match record.command {
            SubmittedCommand::Legacy(_) => return Err(ReplayValidationError::CommandModelMismatch),
            SubmittedCommand::Articulated(command) => {
                command.payload_bytes();
                crate::command::validate_articulated(command)
                    .map_err(|_| ReplayValidationError::InvalidField(ReplayField::ArticulatedCommand))?;
                let unit = &replay.scenario.units[record.entity.index as usize];
                validate_grips(command, replay.scenario.combat_specs.as_ref(), unit)?;
            }
        }
    }
    prior = None;
    for (at, record) in replay.orders.iter().enumerate() {
        validate_tick(prior, record.tick, at, ReplayStream::Orders, tick_limit, true)?;
        prior = Some(record.tick);
        if let Order::Focus(target) = record.order {
            if !initial_id(target, roster) {
                return Err(ReplayValidationError::InvalidField(ReplayField::OrderPayload));
            }
        }
    }
    prior = None;
    for (at, record) in replay.objectives.iter().enumerate() {
        validate_tick(prior, record.tick, at, ReplayStream::Objectives, tick_limit, true)?;
        prior = Some(record.tick);
    }
    Ok(())
}

fn validate_count(
    actual: usize,
    maximum: usize,
    limit: ReplayLimit,
) -> Result<(), ReplayValidationError> {
    if actual > maximum {
        Err(ReplayValidationError::LimitExceeded(limit))
    } else {
        Ok(())
    }
}

fn validate_grips(command: ArticulatedCommandV1, table: Option<&CombatSpecTableV1>, unit: &UnitSpec)
    -> Result<(), ReplayValidationError>
{
    if let (Some(table), Some(row)) = (table, unit.articulated) {
        if crate::combat::spec::grips_valid(table, row, command.grips) { return Ok(()); }
        return Err(ReplayValidationError::InvalidField(ReplayField::CommandGrip));
    }
    for grip in command.grips {
        if let GripRequest::EquipSlot(slot) = grip {
            if !unit.loadout.holds(slot as usize) {
                return Err(ReplayValidationError::InvalidField(ReplayField::CommandGrip));
            }
        }
    }
    Ok(())
}

fn validate_tick(
    prior: Option<u32>,
    tick: u32,
    at: usize,
    stream: ReplayStream,
    limit: u32,
    inclusive: bool,
) -> Result<(), ReplayValidationError> {
    if prior.map_or(false, |previous| tick < previous) {
        return Err(ReplayValidationError::NonMonotonic { stream, at: at as u32 });
    }
    if if inclusive { tick > limit } else { tick >= limit } {
        return Err(ReplayValidationError::RecordAfterTickLimit { stream, tick });
    }
    Ok(())
}

fn scenario_record_len(scenario: &Scenario) -> Option<usize> {
    let mut len = 1usize.checked_add(2)?.checked_add(scenario.name.len())?;
    len = len.checked_add(2 + 2 + 4)?.checked_add(scenario.dungeon.tiles().len())?;
    len = len.checked_add(4 + 1)?;
    if scenario.portal.is_some() {
        len = len.checked_add(8)?;
    }
    len = len.checked_add(4)?;
    for unit in &scenario.units {
        len = len.checked_add(if unit.loadout.secondary.is_some() { 68 } else { 42 })?;
    }
    len = len.checked_add(4)?.checked_add(scenario.torches.len().checked_mul(5)?)?;
    if scenario.combat_model == CombatModel::Articulated {
        let table = scenario.combat_specs.as_ref()?;
        len = len.checked_add(1 + 2 + 2)?;
        len = len.checked_add(table.anatomies.len().checked_mul(BODY_ANATOMY_SPEC_V1_BYTES)?)?;
        len = len.checked_add(2)?;
        for row in &table.equipment {
            len = len.checked_add(match row.geometry {
                EquipmentGeometry::Segment { .. } => SEGMENT_EQUIPMENT_SPEC_V1_BYTES,
                EquipmentGeometry::Shield { .. } => SHIELD_EQUIPMENT_SPEC_V1_BYTES,
            })?;
        }
        len = len.checked_add(2)?;
        for unit in &scenario.units {
            let row = unit.articulated?;
            len = len.checked_add(4 + row.equipment.iter().flatten().count().checked_mul(2)?)?;
        }
    }
    Some(len)
}

fn payload_len(scenario_len: usize, replay: &Replay) -> Option<usize> {
    let command_bytes = replay.entries.len().checked_mul(LEGACY_COMMAND_BYTES)?
        .checked_add(replay.submitted_entries.iter().try_fold(0usize, |sum, record| {
            let width = match record.command {
                SubmittedCommand::Legacy(_) => SUBMITTED_LEGACY_COMMAND_BYTES,
                SubmittedCommand::Articulated(_) => ARTICULATED_COMMAND_BYTES,
            };
            sum.checked_add(width)
        })?)?;
    scenario_len
        .checked_add(4)?.checked_add(command_bytes)?
        .checked_add(4)?.checked_add(replay.orders.len().checked_mul(ORDER_BYTES)?)?
        .checked_add(4)?.checked_add(replay.objectives.len().checked_mul(OBJECTIVE_BYTES)?)
}

fn point_in_extent(point: Vec2, cols: u16, rows: u16) -> bool {
    let x = point.x.raw() as i64;
    let y = point.y.raw() as i64;
    x >= 0 && y >= 0 && x <= (cols as i64) << 16 && y <= (rows as i64) << 16
}

fn initial_id(id: EntityId, roster: usize) -> bool {
    id.generation == 0 && (id.index as usize) < roster
}

#[derive(Default)]
struct DecodedStreams {
    commands: Vec<CommandRecord>,
    submitted_commands: Vec<SubmittedCommandRecord>,
    orders: Vec<OrderRecord>,
    objectives: Vec<ObjectiveRecord>,
}

fn scan_streams(
    reader: &mut ByteReader<'_>,
    roster: usize,
    tick_limit: u32,
    command_schema: u16,
    scenario: Option<&Scenario>,
    mut output: Option<&mut DecodedStreams>,
) -> Result<(), ReplayDecodeError> {
    let command_count = read_count(reader, MAX_COMMAND_RECORDS, ReplayLimit::CommandRecords)?;
    if let Some(out) = output.as_deref_mut() {
        if command_schema == LEGACY_COMMAND_SCHEMA {
            out.commands = Vec::with_capacity(command_count);
        } else {
            out.submitted_commands = Vec::with_capacity(command_count);
        }
    }
    let mut prior = None;
    for at in 0..command_count {
        if command_schema == LEGACY_COMMAND_SCHEMA {
            let record = read_command(reader, roster)?;
            decode_tick(prior, record.tick, at, ReplayStream::Commands, tick_limit, false)?;
            prior = Some(record.tick);
            if let Some(out) = output.as_deref_mut() { out.commands.push(record); }
        } else {
            let record = read_submitted_command(reader, roster, scenario)?;
            decode_tick(prior, record.tick, at, ReplayStream::Commands, tick_limit, false)?;
            prior = Some(record.tick);
            if let Some(out) = output.as_deref_mut() { out.submitted_commands.push(record); }
        }
    }

    let order_count = read_count(reader, MAX_ORDER_RECORDS, ReplayLimit::OrderRecords)?;
    if let Some(out) = output.as_deref_mut() {
        out.orders = Vec::with_capacity(order_count);
    }
    prior = None;
    for at in 0..order_count {
        let record = read_order(reader, roster)?;
        decode_tick(prior, record.tick, at, ReplayStream::Orders, tick_limit, true)?;
        prior = Some(record.tick);
        if let Some(out) = output.as_deref_mut() {
            out.orders.push(record);
        }
    }

    let objective_count = read_count(reader, MAX_OBJECTIVE_RECORDS, ReplayLimit::ObjectiveRecords)?;
    if let Some(out) = output.as_deref_mut() {
        out.objectives = Vec::with_capacity(objective_count);
    }
    prior = None;
    for at in 0..objective_count {
        let record = read_objective(reader)?;
        decode_tick(prior, record.tick, at, ReplayStream::Objectives, tick_limit, true)?;
        prior = Some(record.tick);
        if let Some(out) = output.as_deref_mut() {
            out.objectives.push(record);
        }
    }
    Ok(())
}

fn read_count(
    reader: &mut ByteReader<'_>,
    maximum: usize,
    limit: ReplayLimit,
) -> Result<usize, ReplayDecodeError> {
    let count = reader.u32()? as usize;
    if count > maximum {
        Err(ReplayDecodeError::LimitExceeded(limit))
    } else {
        Ok(count)
    }
}

fn decode_tick(
    prior: Option<u32>,
    tick: u32,
    at: usize,
    stream: ReplayStream,
    limit: u32,
    inclusive: bool,
) -> Result<(), ReplayDecodeError> {
    if prior.map_or(false, |previous| tick < previous) {
        return Err(ReplayDecodeError::NonMonotonic { stream, at: at as u32 });
    }
    if if inclusive { tick > limit } else { tick >= limit } {
        return Err(ReplayDecodeError::RecordAfterTickLimit { stream, tick });
    }
    Ok(())
}

struct ScenarioScan {
    combat_model: CombatModel,
    max_ticks: u32,
    unit_count: usize,
    fingerprint: u64,
}

fn read_combat_extension(
    reader: &mut ByteReader<'_>,
    codec_version: u16,
    model: CombatModel,
    loadouts: &[Loadout],
) -> Result<Option<(CombatSpecTableV1, Vec<ArticulatedUnitSpecV1>)>, ReplayDecodeError> {
    if codec_version == REPLAY_CODEC_VERSION_V1 {
        return if model == CombatModel::Articulated {
            Err(ReplayDecodeError::MissingCombatSpecs)
        } else {
            Ok(None)
        };
    }
    let present = reader.u8()?;
    match (model, present) {
        (CombatModel::Legacy, 0) => return Ok(None),
        (CombatModel::Legacy, 1) | (CombatModel::Articulated, 0) => {
            return Err(ReplayDecodeError::InvalidField(ReplayField::CombatSpecPresence));
        }
        (_, 2..=u8::MAX) => return Err(ReplayDecodeError::UnknownDiscriminant {
            field: ReplayField::CombatSpecPresence,
            value: present as u32,
        }),
        (CombatModel::Articulated, 1) => {}
    }
    let schema = reader.u16()?;
    if schema != COMBAT_SPEC_SCHEMA_V1 {
        return Err(ReplayDecodeError::UnknownDiscriminant {
            field: ReplayField::CombatSpecSchema,
            value: schema as u32,
        });
    }
    let anatomy_count = reader.u16()? as usize;
    if anatomy_count > MAX_ANATOMY_SPECS {
        return Err(ReplayDecodeError::LimitExceeded(ReplayLimit::AnatomySpecs));
    }
    let mut anatomies = Vec::with_capacity(anatomy_count);
    for _ in 0..anatomy_count { anatomies.push(read_anatomy_spec(reader)?); }
    let equipment_count = reader.u16()? as usize;
    if equipment_count > MAX_EQUIPMENT_SPECS {
        return Err(ReplayDecodeError::LimitExceeded(ReplayLimit::EquipmentSpecs));
    }
    let mut equipment = Vec::with_capacity(equipment_count);
    for _ in 0..equipment_count { equipment.push(read_equipment_spec(reader)?); }
    let unit_count = reader.u16()? as usize;
    if unit_count != loadouts.len() {
        return Err(ReplayDecodeError::InvalidField(ReplayField::ArticulatedUnitSpec));
    }
    let mut rows = Vec::with_capacity(unit_count);
    for _ in 0..unit_count {
        let anatomy = reader.u16()?;
        let mut carried = [None; 2];
        for item in &mut carried {
            *item = match reader.u8()? {
                0 => None,
                1 => Some(reader.u16()?),
                value => return Err(ReplayDecodeError::UnknownDiscriminant {
                    field: ReplayField::ArticulatedUnitSpec,
                    value: value as u32,
                }),
            };
        }
        rows.push(ArticulatedUnitSpecV1 { anatomy, equipment: carried });
    }
    let table = CombatSpecTableV1 { anatomies, equipment };
    crate::combat::spec::validate_rows(&table, &rows, loadouts)
        .map_err(map_combat_decode_error)?;
    Ok(Some((table, rows)))
}

fn scan_combat_extension(
    reader: &mut ByteReader<'_>,
    codec_version: u16,
    model: CombatModel,
    unit_count: usize,
) -> Result<(), ReplayDecodeError> {
    if codec_version == REPLAY_CODEC_VERSION_V1 {
        return if model == CombatModel::Articulated { Err(ReplayDecodeError::MissingCombatSpecs) } else { Ok(()) };
    }
    match (model, reader.u8()?) {
        (CombatModel::Legacy, 0) => return Ok(()),
        (CombatModel::Legacy, 1) | (CombatModel::Articulated, 0) => return Err(ReplayDecodeError::InvalidField(ReplayField::CombatSpecPresence)),
        (_, value @ 2..=u8::MAX) => return Err(ReplayDecodeError::UnknownDiscriminant { field: ReplayField::CombatSpecPresence, value: value as u32 }),
        (CombatModel::Articulated, 1) => {}
    }
    let schema = reader.u16()?;
    if schema != COMBAT_SPEC_SCHEMA_V1 { return Err(ReplayDecodeError::UnknownDiscriminant { field: ReplayField::CombatSpecSchema, value: schema as u32 }); }
    let anatomies = reader.u16()? as usize;
    if anatomies > MAX_ANATOMY_SPECS { return Err(ReplayDecodeError::LimitExceeded(ReplayLimit::AnatomySpecs)); }
    let mut previous = None;
    for _ in 0..anatomies {
        let row = read_anatomy_spec(reader)?;
        if previous.map_or(false, |id| row.id <= id) { return Err(ReplayDecodeError::InvalidField(ReplayField::AnatomySpec)); }
        previous = Some(row.id);
    }
    let equipment = reader.u16()? as usize;
    if equipment > MAX_EQUIPMENT_SPECS { return Err(ReplayDecodeError::LimitExceeded(ReplayLimit::EquipmentSpecs)); }
    previous = None;
    for _ in 0..equipment {
        let row = read_equipment_spec(reader)?;
        if previous.map_or(false, |id| row.id <= id) { return Err(ReplayDecodeError::InvalidField(ReplayField::EquipmentSpec)); }
        previous = Some(row.id);
    }
    if reader.u16()? as usize != unit_count { return Err(ReplayDecodeError::InvalidField(ReplayField::ArticulatedUnitSpec)); }
    for _ in 0..unit_count {
        reader.u16()?;
        for _ in 0..2 {
            match reader.u8()? {
                0 => {}
                1 => { reader.u16()?; }
                value => return Err(ReplayDecodeError::UnknownDiscriminant { field: ReplayField::ArticulatedUnitSpec, value: value as u32 }),
            }
        }
    }
    Ok(())
}

fn validate_combat_extension_after_eof(bytes: &[u8], codec_version: u16) -> Result<(), ReplayDecodeError> {
    let mut reader = ByteReader::new(bytes);
    let model = match reader.u8()? { 0 => CombatModel::Legacy, 1 => CombatModel::Articulated, _ => unreachable!() };
    let name_len = reader.u16()? as usize;
    reader.take(name_len)?;
    let cols = reader.u16()? as usize;
    let rows = reader.u16()? as usize;
    let tile_count = reader.u32()? as usize;
    debug_assert_eq!(cols.checked_mul(rows), Some(tile_count));
    reader.take(tile_count)?;
    reader.u32()?;
    if reader.u8()? == 1 { reader.take(8)?; }
    let unit_count = reader.u32()? as usize;
    let mut loadouts = Vec::with_capacity(unit_count);
    for _ in 0..unit_count {
        reader.take(2 + 5 + 8)?;
        let primary = read_action_definition(&mut reader, ReplayField::PrimaryAction)?;
        let secondary = match reader.u8()? {
            0 => None,
            1 => Some(read_action_definition(&mut reader, ReplayField::SecondaryAction)?),
            _ => unreachable!(),
        };
        loadouts.push(Loadout { primary, secondary });
    }
    let torch_count = reader.u32()? as usize;
    reader.take(torch_count.checked_mul(5).ok_or(ReplayDecodeError::TooShort)?)?;
    read_combat_extension(&mut reader, codec_version, model, &loadouts)?;
    debug_assert!(reader.is_empty());
    Ok(())
}

fn read_anatomy_spec(reader: &mut ByteReader<'_>) -> Result<BodyAnatomySpec, ReplayDecodeError> {
    let id = reader.u16()?;
    let schema = reader.u16()?;
    if schema != COMBAT_SPEC_SCHEMA_V1 { return Err(ReplayDecodeError::UnknownDiscriminant { field: ReplayField::AnatomySpec, value: schema as u32 }); }
    let standing_height = Fx::from_raw(reader.i32()?);
    let shoulder_height = Fx::from_raw(reader.i32()?);
    let shoulder_half_width = Fx::from_raw(reader.i32()?);
    let arm_length = Fx::from_raw(reader.i32()?);
    let hand_radius = Fx::from_raw(reader.i32()?);
    let mut regions = [AnatomyRegionSpec {
        region: AnatomyRegion::Head, centre_z: Fx::ZERO, half_height: Fx::ZERO, radius: Fx::ZERO,
    }; 5];
    for region in &mut regions {
        region.region = read_region(reader)?;
        region.centre_z = Fx::from_raw(reader.i32()?);
        region.half_height = Fx::from_raw(reader.i32()?);
        region.radius = Fx::from_raw(reader.i32()?);
    }
    let surface = read_surface(reader, ReplayField::AnatomySpec)?;
    let mut integrity_maxima = [Fx::ZERO; 5];
    for value in &mut integrity_maxima { *value = Fx::from_raw(reader.i32()?); }
    let blood_max = Fx::from_raw(reader.i32()?);
    let mut armor = [ArmorSpec { coverage: Fx::ZERO, hardness: Fx::ZERO, absorption: Fx::ZERO, material: Material::Flesh }; 5];
    for value in &mut armor { *value = read_armor(reader)?; }
    Ok(BodyAnatomySpec { id, schema, standing_height, shoulder_height, shoulder_half_width,
        arm_length, hand_radius, regions, surface, integrity_maxima, blood_max, armor })
}

fn read_equipment_spec(reader: &mut ByteReader<'_>) -> Result<EquipmentSpec, ReplayDecodeError> {
    let id = reader.u16()?;
    let schema = reader.u16()?;
    if schema != COMBAT_SPEC_SCHEMA_V1 { return Err(ReplayDecodeError::UnknownDiscriminant { field: ReplayField::EquipmentSpec, value: schema as u32 }); }
    let action_code = reader.u8()?;
    let action = crate::ActionKind::from_code(action_code as u32).ok_or(
        ReplayDecodeError::UnknownDiscriminant { field: ReplayField::EquipmentSpec, value: action_code as u32 }
    )?;
    let mass = Fx::from_raw(reader.i32()?);
    let balance = Fx::from_raw(reader.i32()?);
    let geometry = match reader.u8()? {
        0 => EquipmentGeometry::Segment { length: Fx::from_raw(reader.i32()?), radius: Fx::from_raw(reader.i32()?) },
        1 => EquipmentGeometry::Shield { half_width: Fx::from_raw(reader.i32()?), half_height: Fx::from_raw(reader.i32()?), thickness: Fx::from_raw(reader.i32()?) },
        value => return Err(ReplayDecodeError::UnknownDiscriminant { field: ReplayField::EquipmentSpec, value: value as u32 }),
    };
    let binding = match reader.u8()? {
        0 => GripBinding::Left,
        1 => GripBinding::Right,
        2 => GripBinding::Both,
        value => return Err(ReplayDecodeError::UnknownDiscriminant { field: ReplayField::EquipmentSpec, value: value as u32 }),
    };
    let surface = read_surface(reader, ReplayField::EquipmentSpec)?;
    Ok(EquipmentSpec { id, schema, action, mass, balance, geometry, binding, surface })
}

fn read_region(reader: &mut ByteReader<'_>) -> Result<AnatomyRegion, ReplayDecodeError> {
    match reader.u8()? {
        0 => Ok(AnatomyRegion::Head), 1 => Ok(AnatomyRegion::Torso),
        2 => Ok(AnatomyRegion::LeftArm), 3 => Ok(AnatomyRegion::RightArm),
        4 => Ok(AnatomyRegion::Legs),
        value => Err(ReplayDecodeError::UnknownDiscriminant { field: ReplayField::AnatomySpec, value: value as u32 }),
    }
}

fn read_material(reader: &mut ByteReader<'_>, field: ReplayField) -> Result<Material, ReplayDecodeError> {
    match reader.u8()? {
        0 => Ok(Material::Flesh), 1 => Ok(Material::Steel), 2 => Ok(Material::Wood),
        value => Err(ReplayDecodeError::UnknownDiscriminant { field, value: value as u32 }),
    }
}

fn read_surface(reader: &mut ByteReader<'_>, field: ReplayField) -> Result<SurfaceSpec, ReplayDecodeError> {
    Ok(SurfaceSpec { restitution: Fx::from_raw(reader.i32()?), friction: Fx::from_raw(reader.i32()?),
        edge_factor: Fx::from_raw(reader.i32()?), point_factor: Fx::from_raw(reader.i32()?),
        material: read_material(reader, field)? })
}

fn read_armor(reader: &mut ByteReader<'_>) -> Result<ArmorSpec, ReplayDecodeError> {
    Ok(ArmorSpec { coverage: Fx::from_raw(reader.i32()?), hardness: Fx::from_raw(reader.i32()?),
        absorption: Fx::from_raw(reader.i32()?), material: read_material(reader, ReplayField::AnatomySpec)? })
}

fn map_combat_decode_error(error: CombatSpecError) -> ReplayDecodeError {
    match error {
        CombatSpecError::TooManyAnatomies => ReplayDecodeError::LimitExceeded(ReplayLimit::AnatomySpecs),
        CombatSpecError::TooManyEquipment => ReplayDecodeError::LimitExceeded(ReplayLimit::EquipmentSpecs),
        CombatSpecError::MissingTable => ReplayDecodeError::MissingCombatSpecs,
        CombatSpecError::UnknownSchema => ReplayDecodeError::UnknownDiscriminant { field: ReplayField::CombatSpecSchema, value: 0 },
        _ => ReplayDecodeError::InvalidField(ReplayField::ArticulatedUnitSpec),
    }
}

fn scan_scenario(bytes: &[u8], codec_version: u16) -> Result<ScenarioScan, ReplayDecodeError> {
    let mut reader = ByteReader::new(bytes);
    let combat_model = match reader.u8()? {
        0 => CombatModel::Legacy,
        1 => CombatModel::Articulated,
        value => return Err(ReplayDecodeError::UnknownDiscriminant {
            field: ReplayField::CombatModel,
            value: value as u32,
        }),
    };
    let name_len = reader.u16()? as usize;
    if name_len > MAX_SCENARIO_NAME_BYTES {
        return Err(ReplayDecodeError::LimitExceeded(ReplayLimit::ScenarioNameBytes));
    }
    core::str::from_utf8(reader.take(name_len)?).map_err(|_| ReplayDecodeError::InvalidUtf8)?;
    let cols = reader.u16()?;
    let rows = reader.u16()?;
    let tile_count = reader.u32()? as usize;
    if tile_count > MAX_DUNGEON_TILES {
        return Err(ReplayDecodeError::LimitExceeded(ReplayLimit::DungeonTiles));
    }
    if (cols as usize).checked_mul(rows as usize) != Some(tile_count) {
        return Err(ReplayDecodeError::InvalidField(ReplayField::DungeonTileCount));
    }
    let tiles = reader.take(tile_count)?;
    if let Some(tile) = tiles.iter().find(|tile| !matches!(**tile, OPEN | WALL | DOOR)) {
        return Err(ReplayDecodeError::UnknownDiscriminant {
            field: ReplayField::DungeonTile,
            value: *tile as u32,
        });
    }
    let max_ticks = reader.u32()?;
    match reader.u8()? {
        0 => {}
        1 => {
            let point = Vec2::new(Fx::from_raw(reader.i32()?), Fx::from_raw(reader.i32()?));
            if !point_in_extent(point, cols, rows) {
                return Err(ReplayDecodeError::InvalidField(ReplayField::PortalPosition));
            }
        }
        value => return Err(ReplayDecodeError::UnknownDiscriminant {
            field: ReplayField::PortalPresence,
            value: value as u32,
        }),
    }
    // The combat-model tag is the first byte of the record, so the ceiling is
    // already decided here -- one field ahead of the first unit row and long
    // before anything is allocated.
    let ceiling = scenario_unit_ceiling(codec_version, combat_model);
    let unit_count = read_count(&mut reader, ceiling, ReplayLimit::ScenarioUnits)?;
    for _ in 0..unit_count {
        match reader.u8()? {
            0..=3 => {}
            value => return Err(ReplayDecodeError::UnknownDiscriminant {
                field: ReplayField::UnitBody,
                value: value as u32,
            }),
        }
        match reader.u8()? {
            0..=1 => {}
            value => return Err(ReplayDecodeError::UnknownDiscriminant {
                field: ReplayField::UnitFaction,
                value: value as u32,
            }),
        }
        reader.take(5)?;
        let spawn = Vec2::new(Fx::from_raw(reader.i32()?), Fx::from_raw(reader.i32()?));
        if !point_in_extent(spawn, cols, rows) {
            return Err(ReplayDecodeError::InvalidField(ReplayField::UnitSpawn));
        }
        read_action_definition(&mut reader, ReplayField::PrimaryAction)?;
        match reader.u8()? {
            0 => {}
            1 => { read_action_definition(&mut reader, ReplayField::SecondaryAction)?; }
            value => return Err(ReplayDecodeError::UnknownDiscriminant {
                field: ReplayField::SecondaryPresence,
                value: value as u32,
            }),
        }
    }
    let identity_end = reader.at;
    let torch_count = read_count(&mut reader, MAX_SCENARIO_TORCHES, ReplayLimit::ScenarioTorches)?;
    for _ in 0..torch_count {
        let tx = reader.u16()?;
        let ty = reader.u16()?;
        if tx >= cols || ty >= rows {
            return Err(ReplayDecodeError::InvalidField(ReplayField::TorchPosition));
        }
        match reader.u8()? {
            0..=3 => {}
            value => return Err(ReplayDecodeError::UnknownDiscriminant {
                field: ReplayField::TorchFace,
                value: value as u32,
            }),
        }
    }
    let extension_start = reader.at;
    scan_combat_extension(&mut reader, codec_version, combat_model, unit_count)?;
    if !reader.is_empty() {
        return Err(ReplayDecodeError::TrailingBytes);
    }
    let mut hash = Hash64::new();
    hash.write_bytes(b"ARPG-SCENARIO");
    hash.write_u16(if combat_model == CombatModel::Legacy { 1 } else { 2 });
    hash.write_bytes(&bytes[..identity_end]);
    if combat_model == CombatModel::Articulated {
        hash.write_bytes(&bytes[extension_start..]);
    }
    Ok(ScenarioScan {
        combat_model,
        max_ticks,
        unit_count,
        fingerprint: hash.finish(),
    })
}

fn build_scenario(bytes: &[u8], codec_version: u16) -> Result<Scenario, ReplayDecodeError> {
    let mut reader = ByteReader::new(bytes);
    let combat_model = match reader.u8()? {
        0 => CombatModel::Legacy,
        1 => CombatModel::Articulated,
        value => return Err(ReplayDecodeError::UnknownDiscriminant {
            field: ReplayField::CombatModel,
            value: value as u32,
        }),
    };
    let name_len = reader.u16()? as usize;
    if name_len > MAX_SCENARIO_NAME_BYTES {
        return Err(ReplayDecodeError::LimitExceeded(ReplayLimit::ScenarioNameBytes));
    }
    let name = core::str::from_utf8(reader.take(name_len)?)
        .map_err(|_| ReplayDecodeError::InvalidUtf8)?
        .to_string();
    let cols = reader.u16()?;
    let rows = reader.u16()?;
    let tile_count = reader.u32()? as usize;
    if tile_count > MAX_DUNGEON_TILES {
        return Err(ReplayDecodeError::LimitExceeded(ReplayLimit::DungeonTiles));
    }
    if (cols as usize).checked_mul(rows as usize) != Some(tile_count) {
        return Err(ReplayDecodeError::InvalidField(ReplayField::DungeonTileCount));
    }
    let tiles = reader.take(tile_count)?.to_vec();
    if tiles.iter().any(|tile| !matches!(*tile, OPEN | WALL | DOOR)) {
        return Err(ReplayDecodeError::UnknownDiscriminant {
            field: ReplayField::DungeonTile,
            value: *tiles.iter().find(|tile| !matches!(**tile, OPEN | WALL | DOOR)).unwrap() as u32,
        });
    }
    let max_ticks = reader.u32()?;
    let portal = match reader.u8()? {
        0 => None,
        1 => {
            let point = Vec2::new(Fx::from_raw(reader.i32()?), Fx::from_raw(reader.i32()?));
            if !point_in_extent(point, cols, rows) {
                return Err(ReplayDecodeError::InvalidField(ReplayField::PortalPosition));
            }
            Some(point)
        }
        value => return Err(ReplayDecodeError::UnknownDiscriminant {
            field: ReplayField::PortalPresence,
            value: value as u32,
        }),
    };
    // Same ceiling as the scan pass, from the same tag: the two must not be able
    // to disagree, or the stream offsets the scan agreed to stop reading at
    // would not be the ones this pass builds from.
    let ceiling = scenario_unit_ceiling(codec_version, combat_model);
    let unit_count = read_count(&mut reader, ceiling, ReplayLimit::ScenarioUnits)?;
    let mut units = Vec::with_capacity(unit_count);
    for _ in 0..unit_count {
        let kind = match reader.u8()? {
            0 => Body::Fighter,
            1 => Body::Rogue,
            2 => Body::Brute,
            3 => Body::Skitterer,
            value => return Err(ReplayDecodeError::UnknownDiscriminant {
                field: ReplayField::UnitBody,
                value: value as u32,
            }),
        };
        let faction = read_faction(&mut reader, ReplayField::UnitFaction)?;
        let stats = Stats::new(reader.u8()?, reader.u8()?, reader.u8()?, reader.u8()?, reader.u8()?);
        let spawn = Vec2::new(Fx::from_raw(reader.i32()?), Fx::from_raw(reader.i32()?));
        if !point_in_extent(spawn, cols, rows) {
            return Err(ReplayDecodeError::InvalidField(ReplayField::UnitSpawn));
        }
        let primary = read_action_definition(&mut reader, ReplayField::PrimaryAction)?;
        let secondary = match reader.u8()? {
            0 => None,
            1 => Some(read_action_definition(&mut reader, ReplayField::SecondaryAction)?),
            value => return Err(ReplayDecodeError::UnknownDiscriminant {
                field: ReplayField::SecondaryPresence,
                value: value as u32,
            }),
        };
        units.push(UnitSpec {
            kind,
            faction,
            stats,
            loadout: Loadout { primary, secondary },
            articulated: None,
            spawn,
        });
    }
    let torch_count = read_count(&mut reader, MAX_SCENARIO_TORCHES, ReplayLimit::ScenarioTorches)?;
    let mut torches = Vec::with_capacity(torch_count);
    for _ in 0..torch_count {
        let tx = reader.u16()?;
        let ty = reader.u16()?;
        let face = match reader.u8()? {
            0 => Cardinal::NegX,
            1 => Cardinal::PosX,
            2 => Cardinal::NegY,
            3 => Cardinal::PosY,
            value => return Err(ReplayDecodeError::UnknownDiscriminant {
                field: ReplayField::TorchFace,
                value: value as u32,
            }),
        };
        if tx >= cols || ty >= rows {
            return Err(ReplayDecodeError::InvalidField(ReplayField::TorchPosition));
        }
        torches.push(Torch { tx, ty, face });
    }
    let loadouts = units.iter().map(|unit| unit.loadout).collect::<Vec<_>>();
    let extension = read_combat_extension(&mut reader, codec_version, combat_model, &loadouts)?;
    if let Some((_, rows)) = &extension {
        for (unit, row) in units.iter_mut().zip(rows) { unit.articulated = Some(*row); }
    }
    if !reader.is_empty() {
        return Err(ReplayDecodeError::TrailingBytes);
    }
    Ok(Scenario {
        name,
        combat_model,
        combat_specs: extension.map(|(table, _)| table),
        dungeon: Dungeon::from_tiles(cols, rows, tiles),
        units,
        portal,
        torches,
        max_ticks,
    })
}

fn read_action_definition(
    reader: &mut ByteReader<'_>,
    field: ReplayField,
) -> Result<crate::ActionKind, ReplayDecodeError> {
    let bytes = reader.take(26)?;
    let action = crate::ActionKind::from_code(bytes[0] as u32).ok_or(
        ReplayDecodeError::UnknownDiscriminant { field, value: bytes[0] as u32 },
    )?;
    if bytes[1] > 3 {
        return Err(ReplayDecodeError::UnknownDiscriminant {
            field: ReplayField::ActionRole,
            value: bytes[1] as u32,
        });
    }
    if bytes != action_definition_bytes(action) {
        return Err(ReplayDecodeError::RegistryDefinitionMismatch { action: bytes[0] });
    }
    Ok(action)
}

fn read_command(reader: &mut ByteReader<'_>, roster: usize) -> Result<CommandRecord, ReplayDecodeError> {
    let tick = reader.u32()?;
    let entity = EntityId::new(reader.u32()?, reader.u32()?);
    if !initial_id(entity, roster) {
        return Err(ReplayDecodeError::InvalidField(ReplayField::CommandSubject));
    }
    let move_dir = Vec2::new(Fx::from_raw(reader.i32()?), Fx::from_raw(reader.i32()?));
    let intent_tag = reader.u8()?;
    let target = EntityId::new(reader.u32()?, reader.u32()?);
    let intent = match intent_tag {
        0 => {
            if target.index != 0 || target.generation != 0 {
                return Err(ReplayDecodeError::NonCanonicalField(ReplayField::CommandIntentTarget));
            }
            Intent::Hold
        }
        1 => {
            if !initial_id(target, roster) {
                return Err(ReplayDecodeError::InvalidField(ReplayField::CommandIntentTarget));
            }
            Intent::Attack(target)
        }
        2 => {
            if target.index != 0 || target.generation != 0 {
                return Err(ReplayDecodeError::NonCanonicalField(ReplayField::CommandIntentTarget));
            }
            Intent::Flee
        }
        value => return Err(ReplayDecodeError::UnknownDiscriminant {
            field: ReplayField::CommandIntent,
            value: value as u32,
        }),
    };
    let angle = Angle::from_raw(reader.u16()?);
    let reach = Fx::from_raw(reader.i32()?);
    let strike = match reader.u8()? {
        0 => Strike::None,
        1 => Strike::Nearest,
        2 => Strike::Widdershins,
        3 => Strike::Sunwise,
        value => return Err(ReplayDecodeError::UnknownDiscriminant {
            field: ReplayField::CommandStrike,
            value: value as u32,
        }),
    };
    let slot = reader.u8()?;
    Ok(CommandRecord {
        tick,
        entity,
        command: Command {
            move_dir,
            intent,
            limb: LimbCommand { angle, reach, strike },
            slot,
        },
    })
}

fn read_submitted_command(
    reader: &mut ByteReader<'_>,
    roster: usize,
    scenario: Option<&Scenario>,
) -> Result<SubmittedCommandRecord, ReplayDecodeError> {
    let tick = reader.u32()?;
    let entity = EntityId::new(reader.u32()?, reader.u32()?);
    if !initial_id(entity, roster) {
        return Err(ReplayDecodeError::InvalidField(ReplayField::CommandSubject));
    }
    match reader.u8()? {
        0 => return Err(ReplayDecodeError::CommandModelMismatch),
        1 => {}
        value => return Err(ReplayDecodeError::UnknownDiscriminant {
            field: ReplayField::SubmittedCommandKind,
            value: value as u32,
        }),
    }
    let payload: &[u8; ARTICULATED_PAYLOAD_BYTES] = reader
        .take(ARTICULATED_PAYLOAD_BYTES)?
        .try_into()
        .unwrap();
    let command = ArticulatedCommandV1::from_payload_bytes(payload)
        .map_err(payload_decode_error)?;
    for grip in command.grips {
        if let GripRequest::EquipSlot(slot) = grip {
            if slot > 1 {
                return Err(ReplayDecodeError::InvalidField(ReplayField::CommandGrip));
            }
            if let Some(scenario) = scenario {
                let unit = &scenario.units[entity.index as usize];
                let valid = match (scenario.combat_specs.as_ref(), unit.articulated) {
                    (Some(table), Some(row)) => crate::combat::spec::grips_valid(table, row, command.grips),
                    _ => unit.loadout.holds(slot as usize),
                };
                if !valid {
                    return Err(ReplayDecodeError::InvalidField(ReplayField::CommandGrip));
                }
            }
        }
    }
    Ok(SubmittedCommandRecord {
        tick,
        entity,
        command: SubmittedCommand::Articulated(command),
    })
}

fn payload_decode_error(error: ArticulatedPayloadError) -> ReplayDecodeError {
    match error {
        ArticulatedPayloadError::UnknownIntent(value) => ReplayDecodeError::UnknownDiscriminant {
            field: ReplayField::CommandIntent,
            value: value as u32,
        },
        ArticulatedPayloadError::UnknownGrip { value, .. } => ReplayDecodeError::UnknownDiscriminant {
            field: ReplayField::CommandGrip,
            value: value as u32,
        },
        ArticulatedPayloadError::NonCanonicalIntent =>
            ReplayDecodeError::NonCanonicalField(ReplayField::CommandIntentTarget),
        ArticulatedPayloadError::NonCanonicalGrip(_) =>
            ReplayDecodeError::NonCanonicalField(ReplayField::CommandGrip),
        ArticulatedPayloadError::OutOfRange(_) =>
            ReplayDecodeError::InvalidField(ReplayField::ArticulatedCommand),
    }
}

fn read_order(reader: &mut ByteReader<'_>, roster: usize) -> Result<OrderRecord, ReplayDecodeError> {
    let tick = reader.u32()?;
    let faction = read_faction(reader, ReplayField::OrderFaction)?;
    let tag = reader.u8()?;
    let first = reader.u32()?;
    let second = reader.u32()?;
    let order = match tag {
        0 => {
            require_zero_payload(first, second, ReplayField::OrderPayload)?;
            Order::Hold
        }
        1 => Order::Advance(Vec2::new(Fx::from_raw(first as i32), Fx::from_raw(second as i32))),
        2 => {
            require_zero_payload(first, second, ReplayField::OrderPayload)?;
            Order::Regroup
        }
        3 => {
            let id = EntityId::new(first, second);
            if !initial_id(id, roster) {
                return Err(ReplayDecodeError::InvalidField(ReplayField::OrderPayload));
            }
            Order::Focus(id)
        }
        4 => Order::Goto(Vec2::new(Fx::from_raw(first as i32), Fx::from_raw(second as i32))),
        value => return Err(ReplayDecodeError::UnknownDiscriminant {
            field: ReplayField::OrderKind,
            value: value as u32,
        }),
    };
    Ok(OrderRecord { tick, faction, order })
}

fn read_objective(reader: &mut ByteReader<'_>) -> Result<ObjectiveRecord, ReplayDecodeError> {
    let tick = reader.u32()?;
    let faction = read_faction(reader, ReplayField::ObjectiveFaction)?;
    let objective = match reader.u8()? {
        0 => Objective::None,
        1 => Objective::Order,
        2 => Objective::Hunt,
        value => return Err(ReplayDecodeError::UnknownDiscriminant {
            field: ReplayField::ObjectiveKind,
            value: value as u32,
        }),
    };
    Ok(ObjectiveRecord { tick, faction, objective })
}

fn read_faction(reader: &mut ByteReader<'_>, field: ReplayField) -> Result<Faction, ReplayDecodeError> {
    match reader.u8()? {
        0 => Ok(Faction::Heroes),
        1 => Ok(Faction::Monsters),
        value => Err(ReplayDecodeError::UnknownDiscriminant { field, value: value as u32 }),
    }
}

fn require_zero_payload(first: u32, second: u32, field: ReplayField) -> Result<(), ReplayDecodeError> {
    if first == 0 && second == 0 {
        Ok(())
    } else {
        Err(ReplayDecodeError::NonCanonicalField(field))
    }
}

fn write_command(out: &mut ByteWriter, record: CommandRecord) {
    out.u32(record.tick);
    out.u32(record.entity.index);
    out.u32(record.entity.generation);
    out.i32(record.command.move_dir.x.raw());
    out.i32(record.command.move_dir.y.raw());
    match record.command.intent {
        Intent::Hold => {
            out.u8(0);
            out.u32(0);
            out.u32(0);
        }
        Intent::Attack(target) => {
            out.u8(1);
            out.u32(target.index);
            out.u32(target.generation);
        }
        Intent::Flee => {
            out.u8(2);
            out.u32(0);
            out.u32(0);
        }
    }
    out.u16(record.command.limb.angle.raw());
    out.i32(record.command.limb.reach.raw());
    out.u8(record.command.limb.strike.discriminant() as u8);
    out.u8(record.command.slot);
}

fn write_submitted_command(out: &mut ByteWriter, record: SubmittedCommandRecord) {
    out.u32(record.tick);
    out.u32(record.entity.index);
    out.u32(record.entity.generation);
    match record.command {
        SubmittedCommand::Legacy(command) => {
            out.u8(0);
            write_command_payload(out, command);
        }
        SubmittedCommand::Articulated(command) => {
            out.u8(1);
            out.bytes.extend_from_slice(&command.payload_bytes());
        }
    }
}

fn write_command_payload(out: &mut ByteWriter, command: Command) {
    out.i32(command.move_dir.x.raw());
    out.i32(command.move_dir.y.raw());
    match command.intent {
        Intent::Hold => { out.u8(0); out.u32(0); out.u32(0); }
        Intent::Attack(target) => { out.u8(1); out.u32(target.index); out.u32(target.generation); }
        Intent::Flee => { out.u8(2); out.u32(0); out.u32(0); }
    }
    out.u16(command.limb.angle.raw());
    out.i32(command.limb.reach.raw());
    out.u8(command.limb.strike.discriminant() as u8);
    out.u8(command.slot);
}

fn write_order(out: &mut ByteWriter, record: OrderRecord) {
    out.u32(record.tick);
    out.u8(record.faction.index() as u8);
    out.u8(record.order.discriminant() as u8);
    match record.order {
        Order::Hold | Order::Regroup => {
            out.u32(0);
            out.u32(0);
        }
        Order::Advance(point) | Order::Goto(point) => {
            out.i32(point.x.raw());
            out.i32(point.y.raw());
        }
        Order::Focus(id) => {
            out.u32(id.index);
            out.u32(id.generation);
        }
    }
}

fn write_objective(out: &mut ByteWriter, record: ObjectiveRecord) {
    out.u32(record.tick);
    out.u8(record.faction.index() as u8);
    out.u8(record.objective.discriminant() as u8);
}

fn cardinal_code(face: Cardinal) -> u8 {
    match face {
        Cardinal::NegX => 0,
        Cardinal::PosX => 1,
        Cardinal::NegY => 2,
        Cardinal::PosY => 3,
    }
}

struct ByteWriter {
    bytes: Vec<u8>,
}

impl ByteWriter {
    fn with_capacity(capacity: usize) -> ByteWriter {
        ByteWriter { bytes: Vec::with_capacity(capacity) }
    }

    fn u8(&mut self, value: u8) { self.bytes.push(value); }
    fn u16(&mut self, value: u16) { self.bytes.extend_from_slice(&value.to_le_bytes()); }
    fn u32(&mut self, value: u32) { self.bytes.extend_from_slice(&value.to_le_bytes()); }
    fn u64(&mut self, value: u64) { self.bytes.extend_from_slice(&value.to_le_bytes()); }
    fn i32(&mut self, value: i32) { self.bytes.extend_from_slice(&value.to_le_bytes()); }
}

impl ScenarioByteSink for ByteWriter {
    fn write_bytes(&mut self, bytes: &[u8]) {
        self.bytes.extend_from_slice(bytes);
    }
}

struct ByteReader<'a> {
    bytes: &'a [u8],
    at: usize,
}

impl<'a> ByteReader<'a> {
    fn new(bytes: &'a [u8]) -> ByteReader<'a> { ByteReader { bytes, at: 0 } }

    fn take(&mut self, count: usize) -> Result<&'a [u8], ReplayDecodeError> {
        let end = self.at.checked_add(count).ok_or(ReplayDecodeError::PayloadLength)?;
        let value = self.bytes.get(self.at..end).ok_or(ReplayDecodeError::PayloadLength)?;
        self.at = end;
        Ok(value)
    }

    fn u8(&mut self) -> Result<u8, ReplayDecodeError> { Ok(self.take(1)?[0]) }
    fn u16(&mut self) -> Result<u16, ReplayDecodeError> {
        Ok(u16::from_le_bytes(self.take(2)?.try_into().unwrap()))
    }
    fn u32(&mut self) -> Result<u32, ReplayDecodeError> {
        Ok(u32::from_le_bytes(self.take(4)?.try_into().unwrap()))
    }
    fn u64(&mut self) -> Result<u64, ReplayDecodeError> {
        Ok(u64::from_le_bytes(self.take(8)?.try_into().unwrap()))
    }
    fn i32(&mut self) -> Result<i32, ReplayDecodeError> {
        Ok(i32::from_le_bytes(self.take(4)?.try_into().unwrap()))
    }
    fn is_empty(&self) -> bool { self.at == self.bytes.len() }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::combat::contact::MAX_ARTICULATED_ENTITIES;
    use crate::{ActionKind, ArmTarget, CombatHeight};

    fn envelope_for(scenario: Scenario, ticks: u32) -> ReplayEnvelope {
        let mut replay = Replay::new(&scenario, 7);
        replay.finish(ticks);
        ReplayEnvelope {
            command_schema: LEGACY_COMMAND_SCHEMA,
            hash_domain: HashDomain::LegacyV1,
            hash_schema: 1,
            scenario_fingerprint: replay.scenario_fingerprint,
            seed: replay.seed,
            tick_limit: replay.ticks,
            replay,
        }
    }

    fn articulated_envelope() -> ReplayEnvelope {
        articulated_envelope_for(Scenario::articulated_duel())
    }

    fn articulated_envelope_for(scenario: Scenario) -> ReplayEnvelope {
        let mut replay = Replay::new(&scenario, 7);
        let arm = ArmTarget {
            bearing: Angle::QUARTER,
            height: CombatHeight::MID,
            reach: Fx::HALF,
            effort: Fx::ONE,
        };
        replay.record_submitted(0, EntityId::new(0, 0), SubmittedCommand::Articulated(
            ArticulatedCommandV1 {
                move_dir: Vec2::ZERO,
                body_yaw: Angle::QUARTER,
                intent: Intent::Hold,
                arms: [arm; 2],
                grips: [GripRequest::Keep; 2],
            }
        ));
        replay.finish(1);
        ReplayEnvelope {
            command_schema: SUBMITTED_COMMAND_LAYOUT_VERSION,
            hash_domain: HashDomain::ArticulatedV1,
            hash_schema: 1,
            scenario_fingerprint: replay.scenario_fingerprint,
            seed: replay.seed,
            tick_limit: replay.ticks,
            replay,
        }
    }

    #[test]
    fn submitted_commands_round_trip_in_documented_field_order() {
        let envelope = articulated_envelope();
        let bytes = envelope.encode().unwrap();
        let start = stream_start(&bytes);
        assert_eq!(u32::from_le_bytes(bytes[start..start + 4].try_into().unwrap()), 1);
        let mut expected = [0u8; 64];
        expected[12] = 1;
        expected[21..23].copy_from_slice(&Angle::QUARTER.raw().to_le_bytes());
        expected[32..34].copy_from_slice(&Angle::QUARTER.raw().to_le_bytes());
        expected[34..38].copy_from_slice(&CombatHeight::MID.raw().to_le_bytes());
        expected[38..42].copy_from_slice(&Fx::HALF.raw().to_le_bytes());
        expected[42..46].copy_from_slice(&Fx::ONE.raw().to_le_bytes());
        expected[46..48].copy_from_slice(&Angle::QUARTER.raw().to_le_bytes());
        expected[48..52].copy_from_slice(&CombatHeight::MID.raw().to_le_bytes());
        expected[52..56].copy_from_slice(&Fx::HALF.raw().to_le_bytes());
        expected[56..60].copy_from_slice(&Fx::ONE.raw().to_le_bytes());
        assert_eq!(&bytes[start + 4..start + 68], &expected);
        let decoded = ReplayEnvelope::decode(&bytes).unwrap();
        assert_eq!(decoded.replay.submitted_entries, envelope.replay.submitted_entries);
        assert!(decoded.replay.entries.is_empty());
        assert!(decoded.play().is_ok());
    }

    #[test]
    fn combat_specs_round_trip_in_documented_field_order() {
        let envelope = articulated_envelope();
        let bytes = envelope.encode().unwrap();
        assert_eq!(u16::from_le_bytes(bytes[4..6].try_into().unwrap()), REPLAY_CODEC_VERSION);
        let scenario_len = u32::from_le_bytes(bytes[36..40].try_into().unwrap()) as usize;
        let scenario_bytes = &bytes[HEADER_BYTES..HEADER_BYTES + scenario_len];
        let extension_len = 1 + 2 + 2
            + 2 * BODY_ANATOMY_SPEC_V1_BYTES
            + 2 + SEGMENT_EQUIPMENT_SPEC_V1_BYTES + SHIELD_EQUIPMENT_SPEC_V1_BYTES
            + SEGMENT_EQUIPMENT_SPEC_V1_BYTES
            + 2 + 8 + 6;
        let extension = &scenario_bytes[scenario_bytes.len() - extension_len..];
        assert_eq!(extension[0], 1);
        assert_eq!(u16::from_le_bytes(extension[1..3].try_into().unwrap()), COMBAT_SPEC_SCHEMA_V1);
        assert_eq!(u16::from_le_bytes(extension[3..5].try_into().unwrap()), 2);
        assert_eq!(u16::from_le_bytes(extension[5..7].try_into().unwrap()), 1);
        let equipment_count_at = 5 + 2 * BODY_ANATOMY_SPEC_V1_BYTES;
        assert_eq!(u16::from_le_bytes(extension[equipment_count_at..equipment_count_at + 2].try_into().unwrap()), 3);
        let unit_count_at = equipment_count_at + 2 + SEGMENT_EQUIPMENT_SPEC_V1_BYTES
            + SHIELD_EQUIPMENT_SPEC_V1_BYTES + SEGMENT_EQUIPMENT_SPEC_V1_BYTES;
        assert_eq!(u16::from_le_bytes(extension[unit_count_at..unit_count_at + 2].try_into().unwrap()), 2);
        let decoded = ReplayEnvelope::decode(&bytes).unwrap();
        assert_eq!(decoded.replay.scenario, envelope.replay.scenario);
        assert_eq!(decoded.encode().unwrap(), bytes);
    }

    #[test]
    fn codec_v1_articulated_replays_fail_with_missing_combat_specs() {
        let mut bytes = articulated_envelope().encode().unwrap();
        let scenario_len = u32::from_le_bytes(bytes[36..40].try_into().unwrap()) as usize;
        let extension_len = 1 + 2 + 2
            + 2 * BODY_ANATOMY_SPEC_V1_BYTES
            + 2 + SEGMENT_EQUIPMENT_SPEC_V1_BYTES + SHIELD_EQUIPMENT_SPEC_V1_BYTES
            + SEGMENT_EQUIPMENT_SPEC_V1_BYTES
            + 2 + 8 + 6;
        let extension_at = HEADER_BYTES + scenario_len - extension_len;
        bytes.drain(extension_at..HEADER_BYTES + scenario_len);
        bytes[4..6].copy_from_slice(&REPLAY_CODEC_VERSION_V1.to_le_bytes());
        let payload_len = u32::from_le_bytes(bytes[12..16].try_into().unwrap()) as usize - extension_len;
        bytes[12..16].copy_from_slice(&(payload_len as u32).to_le_bytes());
        bytes[36..40].copy_from_slice(&((scenario_len - extension_len) as u32).to_le_bytes());
        assert_eq!(ReplayEnvelope::decode(&bytes).unwrap_err(), ReplayDecodeError::MissingCombatSpecs);
    }

    #[test]
    fn codec_v2_accepts_legacy_presence_zero_and_rejects_presence_mismatches() {
        let mut legacy = envelope_for(Scenario::duel(), 1).encode().unwrap();
        let scenario_len = u32::from_le_bytes(legacy[36..40].try_into().unwrap()) as usize;
        legacy.insert(HEADER_BYTES + scenario_len, 0);
        legacy[4..6].copy_from_slice(&REPLAY_CODEC_VERSION.to_le_bytes());
        let payload_len = u32::from_le_bytes(legacy[12..16].try_into().unwrap()) + 1;
        legacy[12..16].copy_from_slice(&payload_len.to_le_bytes());
        legacy[36..40].copy_from_slice(&((scenario_len + 1) as u32).to_le_bytes());
        assert_eq!(ReplayEnvelope::decode(&legacy).unwrap().replay.scenario, Scenario::duel());

        let mut articulated = articulated_envelope().encode().unwrap();
        let scenario_len = u32::from_le_bytes(articulated[36..40].try_into().unwrap()) as usize;
        let extension_len = 1 + 2 + 2 + 2 * BODY_ANATOMY_SPEC_V1_BYTES + 2
            + SEGMENT_EQUIPMENT_SPEC_V1_BYTES + SHIELD_EQUIPMENT_SPEC_V1_BYTES
            + SEGMENT_EQUIPMENT_SPEC_V1_BYTES + 2 + 8 + 6;
        articulated[HEADER_BYTES + scenario_len - extension_len] = 0;
        assert_eq!(decode_error(&articulated), ReplayDecodeError::InvalidField(ReplayField::CombatSpecPresence));
    }

    #[test]
    fn codec_v2_rejects_every_combat_spec_discriminant_bound_and_reference_class() {
        let base = articulated_envelope().encode().unwrap();
        let scenario_len = u32::from_le_bytes(base[36..40].try_into().unwrap()) as usize;
        let extension_len = 1 + 2 + 2 + 2 * BODY_ANATOMY_SPEC_V1_BYTES + 2
            + SEGMENT_EQUIPMENT_SPEC_V1_BYTES + SHIELD_EQUIPMENT_SPEC_V1_BYTES
            + SEGMENT_EQUIPMENT_SPEC_V1_BYTES + 2 + 8 + 6;
        let ext = HEADER_BYTES + scenario_len - extension_len;
        let cases: &[(usize, &[u8], ReplayDecodeError)] = &[
            (ext + 1, &2u16.to_le_bytes(), ReplayDecodeError::UnknownDiscriminant { field: ReplayField::CombatSpecSchema, value: 2 }),
            (ext + 3, &65u16.to_le_bytes(), ReplayDecodeError::LimitExceeded(ReplayLimit::AnatomySpecs)),
            (ext + 7, &2u16.to_le_bytes(), ReplayDecodeError::UnknownDiscriminant { field: ReplayField::AnatomySpec, value: 2 }),
            (ext + 200, &1u16.to_le_bytes(), ReplayDecodeError::InvalidField(ReplayField::AnatomySpec)),
            (ext + 29, &[9], ReplayDecodeError::UnknownDiscriminant { field: ReplayField::AnatomySpec, value: 9 }),
            (ext + 110, &[9], ReplayDecodeError::UnknownDiscriminant { field: ReplayField::AnatomySpec, value: 9 }),
            (ext + 395, &129u16.to_le_bytes(), ReplayDecodeError::LimitExceeded(ReplayLimit::EquipmentSpecs)),
            (ext + 399, &2u16.to_le_bytes(), ReplayDecodeError::UnknownDiscriminant { field: ReplayField::EquipmentSpec, value: 2 }),
            (ext + 401, &[255], ReplayDecodeError::UnknownDiscriminant { field: ReplayField::EquipmentSpec, value: 255 }),
            (ext + 410, &[9], ReplayDecodeError::UnknownDiscriminant { field: ReplayField::EquipmentSpec, value: 9 }),
            (ext + 419, &[9], ReplayDecodeError::UnknownDiscriminant { field: ReplayField::EquipmentSpec, value: 9 }),
            (ext + 436, &[9], ReplayDecodeError::UnknownDiscriminant { field: ReplayField::EquipmentSpec, value: 9 }),
            (ext + 521, &1u16.to_le_bytes(), ReplayDecodeError::InvalidField(ReplayField::ArticulatedUnitSpec)),
            (ext + 525, &[9], ReplayDecodeError::UnknownDiscriminant { field: ReplayField::ArticulatedUnitSpec, value: 9 }),
        ];
        for (at, replacement, expected) in cases {
            let mut bad = base.clone();
            bad[*at..*at + replacement.len()].copy_from_slice(replacement);
            assert_eq!(decode_error(&bad), *expected, "mutation at extension byte {}", at - ext);
        }
        for (at, raw) in [
            (ext + 9, -1i32),       // standing height
            (ext + 94, Fx::ONE.raw() + 1), // surface fraction
            (ext + 111, 0),         // integrity maximum
        ] {
            let mut bad = base.clone();
            bad[at..at + 4].copy_from_slice(&raw.to_le_bytes());
            assert_eq!(decode_error(&bad), ReplayDecodeError::InvalidField(ReplayField::ArticulatedUnitSpec));
        }
        let mut missing = base.clone();
        missing[ext + 523..ext + 525].copy_from_slice(&99u16.to_le_bytes());
        assert_eq!(decode_error(&missing), ReplayDecodeError::InvalidField(ReplayField::ArticulatedUnitSpec));
        let mut mismatch = base.clone();
        mismatch[ext + 401] = ActionKind::Club.code() as u8;
        assert_eq!(decode_error(&mismatch), ReplayDecodeError::InvalidField(ReplayField::ArticulatedUnitSpec));
        let mut conflict = base.clone();
        conflict[ext + 463] = GripBinding::Right as u8;
        assert_eq!(decode_error(&conflict), ReplayDecodeError::InvalidField(ReplayField::ArticulatedUnitSpec));

        let mut geometry_shield_both = base.clone();
        geometry_shield_both[ext + 441] = ActionKind::Club.code() as u8;
        geometry_shield_both[ext + 463] = GripBinding::Both as u8;
        assert_eq!(decode_error(&geometry_shield_both),
            ReplayDecodeError::InvalidField(ReplayField::ArticulatedUnitSpec));

        let mut two_geometry_shields = articulated_envelope();
        let table = two_geometry_shields.replay.scenario.combat_specs.as_mut().unwrap();
        table.equipment[0].geometry = table.equipment[1].geometry;
        assert_eq!(two_geometry_shields.encode(), Err(ReplayEncodeError::Invalid(
            ReplayValidationError::InvalidField(ReplayField::ArticulatedUnitSpec),
        )));
    }

    #[test]
    fn schema_one_rejects_every_malformed_command_group_before_construction() {
        let base = articulated_envelope().encode().unwrap();
        let record = stream_start(&base) + 4;
        let mut bad = base.clone();
        bad[record + 12] = 0;
        assert_eq!(decode_error(&bad), ReplayDecodeError::CommandModelMismatch);
        let mut bad = base.clone();
        bad[record + 12] = 9;
        assert_eq!(decode_error(&bad), ReplayDecodeError::UnknownDiscriminant {
            field: ReplayField::SubmittedCommandKind, value: 9,
        });
        let mut bad = base.clone();
        bad[record + 23] = 9;
        assert_eq!(decode_error(&bad), ReplayDecodeError::UnknownDiscriminant {
            field: ReplayField::CommandIntent, value: 9,
        });
        let mut bad = base.clone();
        bad[record + 24] = 1;
        assert_eq!(decode_error(&bad), ReplayDecodeError::NonCanonicalField(
            ReplayField::CommandIntentTarget,
        ));
        let mut bad = base.clone();
        bad[record + 61] = 1;
        assert_eq!(decode_error(&bad), ReplayDecodeError::NonCanonicalField(
            ReplayField::CommandGrip,
        ));
        let mut bad = base.clone();
        bad[record + 60] = 9;
        assert_eq!(decode_error(&bad), ReplayDecodeError::UnknownDiscriminant {
            field: ReplayField::CommandGrip, value: 9,
        });
        for payload_offset in [0usize, 21, 39] {
            let mut bad = base.clone();
            bad[record + 13 + payload_offset..record + 17 + payload_offset]
                .copy_from_slice(&(Fx::ONE.raw() + 1).to_le_bytes());
            assert_eq!(decode_error(&bad), ReplayDecodeError::InvalidField(
                ReplayField::ArticulatedCommand,
            ));
        }
        let mut bad = base.clone();
        bad[record + 60] = 2;
        bad[record + 61] = 7;
        assert_eq!(decode_error(&bad), ReplayDecodeError::InvalidField(ReplayField::CommandGrip));
        let mut bad = base.clone();
        bad[record..record + 4].copy_from_slice(&1u32.to_le_bytes());
        assert_eq!(decode_error(&bad), ReplayDecodeError::RecordAfterTickLimit {
            stream: ReplayStream::Commands, tick: 1,
        });
        let mut bad = base.clone();
        bad[record + 4..record + 8].copy_from_slice(&99u32.to_le_bytes());
        assert_eq!(decode_error(&bad), ReplayDecodeError::InvalidField(ReplayField::CommandSubject));

        let mut with_order = articulated_envelope();
        with_order.replay.record_order(0, Faction::Heroes, Order::Hold);
        let mut bad = with_order.encode().unwrap();
        let order = stream_start(&bad) + 4 + ARTICULATED_COMMAND_BYTES + 4;
        bad[order + 5] = 9;
        assert_eq!(decode_error(&bad), ReplayDecodeError::UnknownDiscriminant {
            field: ReplayField::OrderKind, value: 9,
        });
    }

    fn put_u32(bytes: &mut [u8], at: usize, value: u32) {
        bytes[at..at + 4].copy_from_slice(&value.to_le_bytes());
    }

    fn scenario_len(bytes: &[u8]) -> usize {
        u32::from_le_bytes(bytes[36..40].try_into().unwrap()) as usize
    }

    fn stream_start(bytes: &[u8]) -> usize {
        HEADER_BYTES + scenario_len(bytes)
    }

    fn decode_error(bytes: &[u8]) -> ReplayDecodeError {
        match ReplayEnvelope::decode(bytes) {
            Ok(_) => panic!("malformed replay decoded successfully"),
            Err(error) => error,
        }
    }

    fn sync_fingerprint(envelope: &mut ReplayEnvelope) {
        let fingerprint = envelope.replay.scenario.fingerprint();
        envelope.replay.scenario_fingerprint = fingerprint;
        envelope.scenario_fingerprint = fingerprint;
    }

    fn play_error(envelope: &ReplayEnvelope) -> ReplayPlayError {
        match envelope.play() {
            Ok(_) => panic!("invalid replay played successfully"),
            Err(error) => error,
        }
    }

    #[test]
    fn replay_codec_v1_matches_the_documented_offset_fixture() {
        let scenario = Scenario {
            name: "x".to_string(),
            combat_model: CombatModel::Legacy,
            combat_specs: None,
            dungeon: Dungeon::open(1, 1),
            units: Vec::new(),
            portal: None,
            torches: Vec::new(),
            max_ticks: 1,
        };
        assert_eq!(scenario.fingerprint(), 0x22c5_4dc8_462a_1204);
        let replay = Replay {
            seed: 0,
            scenario,
            scenario_fingerprint: 0x22c5_4dc8_462a_1204,
            ticks: 0,
            entries: Vec::new(),
            submitted_entries: Vec::new(),
            orders: Vec::new(),
            objectives: Vec::new(),
        };
        let envelope = ReplayEnvelope {
            command_schema: 0,
            hash_domain: HashDomain::LegacyV1,
            hash_schema: 1,
            scenario_fingerprint: replay.scenario_fingerprint,
            seed: 0,
            tick_limit: 0,
            replay,
        };
        let expected: [u8; 78] = [
            0x41, 0x52, 0x50, 0x47, 0x01, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x01, 0x00, 0x26, 0x00, 0x00, 0x00,
            0x04, 0x12, 0x2a, 0x46, 0xc8, 0x4d, 0xc5, 0x22,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x1a, 0x00, 0x00, 0x00,
            0x00, 0x01, 0x00, 0x78, 0x01, 0x00, 0x01, 0x00,
            0x01, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ];
        let encoded = envelope.encode().unwrap();
        assert_eq!(encoded, expected);
        let decoded = ReplayEnvelope::decode(&expected).unwrap();
        assert_eq!(decoded.replay.scenario, envelope.replay.scenario);
        assert_eq!(decoded.replay.entries.len(), 0);
    }

    #[test]
    fn replay_codec_round_trips_every_legacy_variant() {
        let mut tiles = vec![OPEN; 24 * 16];
        tiles[1] = WALL;
        tiles[2] = DOOR;
        let mut scenario = Scenario::duel();
        scenario.dungeon = Dungeon::from_tiles(24, 16, tiles);
        scenario.max_ticks = 20;
        scenario.units = ActionKind::ALL.into_iter().enumerate().map(|(i, action)| {
            let kind = Body::ALL[i % Body::ALL.len()];
            UnitSpec {
                kind,
                faction: if i % 2 == 0 { Faction::Heroes } else { Faction::Monsters },
                stats: kind.base_stats(),
                loadout: Loadout::pair(action, ActionKind::ALL[(i + 1) % ActionKind::ALL.len()]),
                articulated: None,
                spawn: Vec2::from_ints(2 + i as i32, 2 + (i % 3) as i32),
            }
        }).collect();
        scenario.torches = vec![
            Torch { tx: 1, ty: 1, face: Cardinal::NegX },
            Torch { tx: 2, ty: 1, face: Cardinal::PosX },
            Torch { tx: 3, ty: 1, face: Cardinal::NegY },
            Torch { tx: 4, ty: 1, face: Cardinal::PosY },
        ];
        let mut envelope = envelope_for(scenario, 10);
        let hero = EntityId::new(0, 0);
        let foe = EntityId::new(1, 0);
        let intents = [Intent::Hold, Intent::Attack(foe), Intent::Flee, Intent::Hold];
        let strikes = [Strike::None, Strike::Nearest, Strike::Widdershins, Strike::Sunwise];
        for i in 0..4 {
            envelope.replay.record(i as u32, hero, Command {
                move_dir: Vec2::new(Fx::from_raw(i as i32 - 2), Fx::from_raw(2 - i as i32)),
                intent: intents[i],
                limb: LimbCommand {
                    angle: Angle::from_raw((i * 17_000) as u16),
                    reach: Fx::from_raw(i as i32 * 13),
                    strike: strikes[i],
                },
                slot: i as u8,
            });
        }
        let orders = [
            Order::Hold,
            Order::Advance(Vec2::new(Fx::MIN, Fx::MAX)),
            Order::Regroup,
            Order::Focus(foe),
            Order::Goto(Vec2::new(Fx::MAX, Fx::MIN)),
        ];
        for (tick, order) in orders.into_iter().enumerate() {
            envelope.replay.record_order(tick as u32, Faction::Heroes, order);
        }
        for (tick, objective) in [Objective::None, Objective::Order, Objective::Hunt]
            .into_iter().enumerate()
        {
            envelope.replay.record_objective(tick as u32, Faction::Monsters, objective);
        }
        let bytes = envelope.encode().unwrap();
        let decoded = ReplayEnvelope::decode(&bytes).unwrap();
        assert_eq!(decoded.replay.scenario, envelope.replay.scenario);
        assert_eq!(decoded.replay.entries, envelope.replay.entries);
        assert_eq!(decoded.replay.orders, envelope.replay.orders);
        assert_eq!(decoded.replay.objectives, envelope.replay.objectives);
        assert_eq!(
            decoded.replay.scenario.units.iter().map(|unit| unit.kind).collect::<Vec<_>>(),
            Body::ALL.into_iter().chain(Body::ALL).collect::<Vec<_>>()
        );
        assert_eq!(
            decoded.replay.scenario.units.iter().map(|unit| unit.loadout.primary).collect::<Vec<_>>(),
            ActionKind::ALL
        );
        assert_eq!(decoded.encode().unwrap(), bytes);
    }

    #[test]
    fn replay_decoder_checks_outer_bounds_before_allocating() {
        let bytes = vec![0; MAX_REPLAY_ENVELOPE_BYTES + 1];
        assert_eq!(
            decode_error(&bytes),
            ReplayDecodeError::LimitExceeded(ReplayLimit::EnvelopeBytes)
        );
        assert_eq!(decode_error(&[]), ReplayDecodeError::TooShort);
    }

    #[test]
    fn replay_decoder_rejects_bad_lengths_counts_utf8_and_trailing_data() {
        let base = envelope_for(Scenario::duel(), 2).encode().unwrap();

        let mut bad = base.clone();
        put_u32(&mut bad, 12, 1);
        assert_eq!(decode_error(&bad), ReplayDecodeError::PayloadLength);

        let mut bad = base.clone();
        bad[43] = 0xff;
        assert_eq!(decode_error(&bad), ReplayDecodeError::InvalidUtf8);

        let mut bad = base.clone();
        let start = stream_start(&bad);
        put_u32(&mut bad, start, MAX_COMMAND_RECORDS as u32 + 1);
        assert_eq!(
            decode_error(&bad),
            ReplayDecodeError::LimitExceeded(ReplayLimit::CommandRecords)
        );
        let mut bad = base.clone();
        put_u32(&mut bad, start + 4, MAX_ORDER_RECORDS as u32 + 1);
        assert_eq!(
            decode_error(&bad),
            ReplayDecodeError::LimitExceeded(ReplayLimit::OrderRecords)
        );
        let mut bad = base.clone();
        put_u32(&mut bad, start + 8, MAX_OBJECTIVE_RECORDS as u32 + 1);
        assert_eq!(
            decode_error(&bad),
            ReplayDecodeError::LimitExceeded(ReplayLimit::ObjectiveRecords)
        );

        let mut bad = base;
        bad.push(0);
        let payload = (bad.len() - HEADER_BYTES) as u32;
        put_u32(&mut bad, 12, payload);
        assert_eq!(decode_error(&bad), ReplayDecodeError::TrailingBytes);
    }

    #[test]
    fn replay_decoder_rejects_every_truncation_and_bounded_count_before_construction() {
        let base = envelope_for(Scenario::duel(), 2).encode().unwrap();
        for end in 0..HEADER_BYTES {
            assert_eq!(decode_error(&base[..end]), ReplayDecodeError::TooShort, "cut {end}");
        }
        for end in HEADER_BYTES..base.len() {
            assert_eq!(decode_error(&base[..end]), ReplayDecodeError::PayloadLength, "cut {end}");
        }

        let mut one = Scenario {
            name: "x".to_string(),
            combat_model: CombatModel::Legacy,
            combat_specs: None,
            dungeon: Dungeon::open(1, 1),
            units: vec![UnitSpec {
                kind: Body::Fighter,
                faction: Faction::Heroes,
                stats: Body::Fighter.base_stats(),
                loadout: Loadout::single(ActionKind::Sword),
                articulated: None,
                spawn: Vec2::ZERO,
            }],
            portal: None,
            torches: vec![Torch { tx: 0, ty: 0, face: Cardinal::NegX }],
            max_ticks: 2,
        };
        let base = envelope_for(one.clone(), 1).encode().unwrap();
        let cases = [
            (41usize, (MAX_SCENARIO_NAME_BYTES as u32 + 1) as u16, ReplayDecodeError::LimitExceeded(ReplayLimit::ScenarioNameBytes)),
        ];
        for (at, value, expected) in cases {
            let mut bad = base.clone();
            bad[at..at + 2].copy_from_slice(&value.to_le_bytes());
            assert_eq!(decode_error(&bad), expected);
        }

        let mut bad = base.clone();
        put_u32(&mut bad, 48, MAX_DUNGEON_TILES as u32 + 1);
        assert_eq!(decode_error(&bad), ReplayDecodeError::LimitExceeded(ReplayLimit::DungeonTiles));
        let mut bad = base.clone();
        put_u32(&mut bad, 48, 0);
        assert_eq!(decode_error(&bad), ReplayDecodeError::InvalidField(ReplayField::DungeonTileCount));
        let mut bad = base.clone();
        put_u32(&mut bad, 58, MAX_SCENARIO_UNITS as u32 + 1);
        assert_eq!(decode_error(&bad), ReplayDecodeError::LimitExceeded(ReplayLimit::ScenarioUnits));
        let mut bad = base.clone();
        put_u32(&mut bad, 104, MAX_SCENARIO_TORCHES as u32 + 1);
        assert_eq!(decode_error(&bad), ReplayDecodeError::LimitExceeded(ReplayLimit::ScenarioTorches));
        let mut bad = base.clone();
        put_u32(&mut bad, 36, MAX_SCENARIO_RECORD_BYTES as u32 + 1);
        assert_eq!(decode_error(&bad), ReplayDecodeError::LimitExceeded(ReplayLimit::ScenarioRecordBytes));

        one.portal = Some(Vec2::ZERO);
        let portal = envelope_for(one.clone(), 1).encode().unwrap();
        let mut bad = portal;
        put_u32(&mut bad, 58, 65_537);
        assert_eq!(decode_error(&bad), ReplayDecodeError::InvalidField(ReplayField::PortalPosition));

        one.portal = None;
        let extent = envelope_for(one, 1).encode().unwrap();
        let mut bad = extent.clone();
        put_u32(&mut bad, 69, 65_537);
        assert_eq!(decode_error(&bad), ReplayDecodeError::InvalidField(ReplayField::UnitSpawn));
        let mut bad = extent;
        bad[108] = 1;
        assert_eq!(decode_error(&bad), ReplayDecodeError::InvalidField(ReplayField::TorchPosition));
    }

    /// A structurally valid Articulated scenario with exactly `rows` unit rows.
    ///
    /// Every added row carries its own binding on purpose. `try_fingerprint`
    /// runs `validate_construction` before any scenario bound is looked at, so a
    /// roster padded with bare `UnitSpec`s reports
    /// `InvalidField(ArticulatedUnitSpec)` and proves nothing about the ceiling.
    fn articulated_roster(rows: usize) -> Scenario {
        let mut scenario = Scenario::articulated_duel();
        let template = scenario.units[1];
        while scenario.units.len() < rows {
            let at = scenario.units.len();
            scenario.units.push(UnitSpec {
                spawn: Vec2::from_ints(1 + (at % 20) as i32, 1 + (at / 20) as i32),
                ..template
            });
        }
        scenario
    }

    /// A Legacy roster on an arena wide enough to stand 4,096 units on distinct
    /// tiles, so the only bound a full roster can trip is the one under test.
    fn legacy_roster(rows: usize) -> Scenario {
        let mut scenario = Scenario::duel();
        scenario.dungeon = Dungeon::open(64, 64);
        let template = scenario.units[0];
        scenario.units = (0..rows)
            .map(|at| UnitSpec {
                spawn: Vec2::from_ints((at % 64) as i32, (at / 64) as i32),
                ..template
            })
            .collect();
        scenario
    }

    /// Where the u32 unit count sits in an encoded envelope.
    ///
    /// Derived from the record grammar rather than pinned: the byte-exact
    /// fixture and the truncation suite own the offsets, and these two tests are
    /// about which ceiling applies, not about where the field lives.
    fn unit_count_at(scenario: &Scenario) -> usize {
        HEADER_BYTES + 1 + 2 + scenario.name.len() + 2 + 2 + 4
            + scenario.dungeon.tiles().len() + 4 + 1
            + if scenario.portal.is_some() { 8 } else { 0 }
    }

    #[test]
    fn codec_v2_rejects_articulated_row_65_before_unit_allocation() {
        let full = articulated_envelope_for(articulated_roster(MAX_ARTICULATED_ENTITIES));
        let bytes = full.encode().unwrap();
        let decoded = ReplayEnvelope::decode(&bytes).unwrap();
        assert_eq!(decoded.replay.scenario.units.len(), MAX_ARTICULATED_ENTITIES);
        assert_eq!(decoded.replay.scenario, full.replay.scenario);
        assert_eq!(decoded.encode().unwrap(), bytes);

        let over = articulated_envelope_for(articulated_roster(MAX_ARTICULATED_ENTITIES + 1));
        let expected = ReplayValidationError::LimitExceeded(ReplayLimit::ScenarioUnits);
        assert_eq!(over.encode(), Err(ReplayEncodeError::Invalid(expected)));
        assert_eq!(play_error(&over), ReplayPlayError::Invalid(expected));

        let at = unit_count_at(&full.replay.scenario);
        assert_eq!(
            u32::from_le_bytes(bytes[at..at + 4].try_into().unwrap()),
            MAX_ARTICULATED_ENTITIES as u32,
        );
        let mut row_65 = bytes.clone();
        put_u32(&mut row_65, at, MAX_ARTICULATED_ENTITIES as u32 + 1);
        assert_eq!(
            decode_error(&row_65),
            ReplayDecodeError::LimitExceeded(ReplayLimit::ScenarioUnits),
        );

        // Before the first unit row is even discriminated: corrupt the body tag
        // one byte further on and the count still answers, though that same
        // corruption on its own is caught.
        let mut also_corrupt = row_65;
        also_corrupt[at + 4] = 9;
        assert_eq!(
            decode_error(&also_corrupt),
            ReplayDecodeError::LimitExceeded(ReplayLimit::ScenarioUnits),
        );
        let mut body_only = bytes.clone();
        body_only[at + 4] = 9;
        assert_eq!(decode_error(&body_only), ReplayDecodeError::UnknownDiscriminant {
            field: ReplayField::UnitBody, value: 9,
        });

        // And before the roster vector: `Vec::with_capacity(u32::MAX)` of
        // `UnitSpec` is more memory than a host will commit, so an error
        // returned rather than an abort is the proof nothing was reserved.
        let mut absurd = bytes;
        put_u32(&mut absurd, at, u32::MAX);
        assert_eq!(
            decode_error(&absurd),
            ReplayDecodeError::LimitExceeded(ReplayLimit::ScenarioUnits),
        );
    }

    #[test]
    fn legacy_codec_retains_its_4096_unit_ceiling() {
        // 65 is refused for a model, not for a codec: Legacy must not notice it.
        let sixty_five = envelope_for(legacy_roster(MAX_ARTICULATED_ENTITIES + 1), 1)
            .encode().unwrap();
        assert_eq!(
            ReplayEnvelope::decode(&sixty_five).unwrap().replay.scenario.units.len(),
            MAX_ARTICULATED_ENTITIES + 1,
        );

        let full = envelope_for(legacy_roster(MAX_SCENARIO_UNITS), 1);
        let bytes = full.encode().unwrap();
        let decoded = ReplayEnvelope::decode(&bytes).unwrap();
        assert_eq!(decoded.replay.scenario.units.len(), MAX_SCENARIO_UNITS);
        assert_eq!(decoded.replay.scenario, full.replay.scenario);

        let over = envelope_for(legacy_roster(MAX_SCENARIO_UNITS + 1), 1);
        let expected = ReplayValidationError::LimitExceeded(ReplayLimit::ScenarioUnits);
        assert_eq!(over.encode(), Err(ReplayEncodeError::Invalid(expected)));
        assert_eq!(play_error(&over), ReplayPlayError::Invalid(expected));

        let at = unit_count_at(&full.replay.scenario);
        let mut row_4097 = bytes;
        put_u32(&mut row_4097, at, MAX_SCENARIO_UNITS as u32 + 1);
        assert_eq!(
            decode_error(&row_4097),
            ReplayDecodeError::LimitExceeded(ReplayLimit::ScenarioUnits),
        );
    }

    #[test]
    fn replay_decoder_rejects_every_header_and_scenario_discriminant() {
        let scenario = Scenario {
            name: "x".to_string(),
            combat_model: CombatModel::Legacy,
            combat_specs: None,
            dungeon: Dungeon::open(1, 1),
            units: vec![UnitSpec {
                kind: Body::Fighter,
                faction: Faction::Heroes,
                stats: Body::Fighter.base_stats(),
                loadout: Loadout::single(ActionKind::Sword),
                articulated: None,
                spawn: Vec2::ZERO,
            }],
            portal: None,
            torches: vec![Torch { tx: 0, ty: 0, face: Cardinal::NegX }],
            max_ticks: 2,
        };
        let base = envelope_for(scenario, 1).encode().unwrap();
        let mut bad = base.clone();
        bad[4..6].copy_from_slice(&3u16.to_le_bytes());
        assert_eq!(decode_error(&bad), ReplayDecodeError::UnknownCodecVersion(3));
        let mut bad = base.clone();
        bad[6..8].copy_from_slice(&1u16.to_le_bytes());
        assert_eq!(decode_error(&bad), ReplayDecodeError::CommandModelMismatch);
        let mut bad = base.clone();
        bad[6..8].copy_from_slice(&2u16.to_le_bytes());
        assert_eq!(decode_error(&bad), ReplayDecodeError::UnknownCommandSchema(2));
        let mut bad = base.clone();
        bad[8] = 9;
        assert_eq!(decode_error(&bad), ReplayDecodeError::UnknownHashDomain(9));
        let mut bad = base.clone();
        bad[9] = 1;
        assert_eq!(decode_error(&bad), ReplayDecodeError::ReservedHeaderBits);
        let mut bad = base.clone();
        bad[10..12].copy_from_slice(&2u16.to_le_bytes());
        assert_eq!(
            decode_error(&bad),
            ReplayDecodeError::UnknownHashSchema { domain: HashDomain::LegacyV1, schema: 2 }
        );

        let mutations = [
            (40usize, 9u8, ReplayField::CombatModel),
            (52, 9, ReplayField::DungeonTile),
            (57, 9, ReplayField::PortalPresence),
            (62, 9, ReplayField::UnitBody),
            (63, 9, ReplayField::UnitFaction),
            (77, 9, ReplayField::PrimaryAction),
            (78, 9, ReplayField::ActionRole),
            (103, 9, ReplayField::SecondaryPresence),
            (112, 9, ReplayField::TorchFace),
        ];
        for (at, value, field) in mutations {
            let mut bad = base.clone();
            bad[at] = value;
            assert_eq!(
                decode_error(&bad),
                ReplayDecodeError::UnknownDiscriminant { field, value: value as u32 },
                "field {field:?}",
            );
        }
    }

    #[test]
    fn replay_decoder_rejects_every_stream_discriminant_and_canonical_zero_payload() {
        let mut envelope = envelope_for(Scenario::duel(), 3);
        envelope.replay.record(0, EntityId::new(0, 0), Command::HOLD);
        envelope.replay.record_order(0, Faction::Heroes, Order::Hold);
        envelope.replay.record_objective(0, Faction::Heroes, Objective::None);
        let base = envelope.encode().unwrap();
        let command = stream_start(&base) + 4;
        let order = command + LEGACY_COMMAND_BYTES + 4;
        let objective = order + ORDER_BYTES + 4;
        let mutations = [
            (command + 20, 9u8, ReplayField::CommandIntent),
            (command + 35, 9, ReplayField::CommandStrike),
            (order + 4, 9, ReplayField::OrderFaction),
            (order + 5, 9, ReplayField::OrderKind),
            (objective + 4, 9, ReplayField::ObjectiveFaction),
            (objective + 5, 9, ReplayField::ObjectiveKind),
        ];
        for (at, value, field) in mutations {
            let mut bad = base.clone();
            bad[at] = value;
            assert_eq!(
                decode_error(&bad),
                ReplayDecodeError::UnknownDiscriminant { field, value: value as u32 },
            );
        }
        let mut bad = base.clone();
        bad[command + 21] = 1;
        assert_eq!(
            decode_error(&bad),
            ReplayDecodeError::NonCanonicalField(ReplayField::CommandIntentTarget)
        );
        let mut bad = base.clone();
        bad[order + 6] = 1;
        assert_eq!(
            decode_error(&bad),
            ReplayDecodeError::NonCanonicalField(ReplayField::OrderPayload)
        );

        let mut flee = envelope_for(Scenario::duel(), 3);
        flee.replay.record(0, EntityId::new(0, 0), Command { intent: Intent::Flee, ..Command::HOLD });
        let mut bad = flee.encode().unwrap();
        let command = stream_start(&bad) + 4;
        bad[command + 21] = 1;
        assert_eq!(
            decode_error(&bad),
            ReplayDecodeError::NonCanonicalField(ReplayField::CommandIntentTarget)
        );

        let mut regroup = envelope_for(Scenario::duel(), 3);
        regroup.replay.record_order(0, Faction::Heroes, Order::Regroup);
        let mut bad = regroup.encode().unwrap();
        let order = stream_start(&bad) + 4 + 4;
        bad[order + 6] = 1;
        assert_eq!(
            decode_error(&bad),
            ReplayDecodeError::NonCanonicalField(ReplayField::OrderPayload)
        );
    }

    #[test]
    fn replay_decoder_rejects_unknown_and_noncanonical_discriminants() {
        let base = envelope_for(Scenario::duel(), 2).encode().unwrap();
        let mut bad = base.clone();
        bad[40] = 9;
        assert_eq!(
            decode_error(&bad),
            ReplayDecodeError::UnknownDiscriminant {
                field: ReplayField::CombatModel,
                value: 9,
            }
        );

        let mut with_command = envelope_for(Scenario::duel(), 2);
        with_command.replay.record(0, EntityId::new(0, 0), Command::HOLD);
        let mut bad = with_command.encode().unwrap();
        let record = stream_start(&bad) + 4;
        bad[record + 21] = 1;
        assert_eq!(
            decode_error(&bad),
            ReplayDecodeError::NonCanonicalField(ReplayField::CommandIntentTarget)
        );
    }

    #[test]
    fn replay_decoder_rejects_nonmonotonic_streams_and_records_after_the_limit() {
        let mut envelope = envelope_for(Scenario::duel(), 3);
        envelope.replay.record(1, EntityId::new(0, 0), Command::HOLD);
        envelope.replay.record(2, EntityId::new(1, 0), Command::HOLD);
        let base = envelope.encode().unwrap();
        let first = stream_start(&base) + 4;
        let second = first + LEGACY_COMMAND_BYTES;

        let mut bad = base.clone();
        put_u32(&mut bad, second, 0);
        assert_eq!(
            decode_error(&bad),
            ReplayDecodeError::NonMonotonic { stream: ReplayStream::Commands, at: 1 }
        );

        let mut bad = base;
        put_u32(&mut bad, second, 3);
        assert_eq!(
            decode_error(&bad),
            ReplayDecodeError::RecordAfterTickLimit {
                stream: ReplayStream::Commands,
                tick: 3,
            }
        );
    }

    #[test]
    fn replay_decoder_rejects_entity_handles_outside_the_initial_roster() {
        let mut envelope = envelope_for(Scenario::duel(), 2);
        envelope.replay.record(0, EntityId::new(0, 0), Command::HOLD);
        let mut bad = envelope.encode().unwrap();
        let record = stream_start(&bad) + 4;
        put_u32(&mut bad, record + 8, 1);
        assert_eq!(
            decode_error(&bad),
            ReplayDecodeError::InvalidField(ReplayField::CommandSubject)
        );
    }

    #[test]
    fn replay_decoder_rejects_a_model_schema_domain_mismatch() {
        let mut bad = envelope_for(Scenario::duel(), 2).encode().unwrap();
        bad[8] = HashDomain::ArticulatedV1 as u8;
        assert_eq!(decode_error(&bad), ReplayDecodeError::CommandModelMismatch);
    }

    #[test]
    fn replay_decoder_rejects_a_changed_action_registry_definition() {
        let mut bad = envelope_for(Scenario::duel(), 2).encode().unwrap();
        let needle = action_definition_bytes(ActionKind::Sword);
        let at = bad.windows(needle.len()).position(|window| window == needle).unwrap();
        bad[at + 2] ^= 1;
        assert_eq!(
            decode_error(&bad),
            ReplayDecodeError::RegistryDefinitionMismatch {
                action: ActionKind::Sword.code() as u8,
            }
        );
    }

    #[test]
    fn replay_decoder_rejects_a_stop_after_the_scenario_cutoff() {
        let mut scenario = Scenario::duel();
        scenario.max_ticks = 1;
        let mut bad = envelope_for(scenario, 1).encode().unwrap();
        put_u32(&mut bad, 32, 2);
        assert_eq!(
            decode_error(&bad),
            ReplayDecodeError::InvalidField(ReplayField::TickLimit)
        );
    }

    #[test]
    fn encode_and_play_reject_each_duplicate_envelope_field_mismatch() {
        let base = envelope_for(Scenario::duel(), 2);
        let cases = [ReplayField::Seed, ReplayField::TickLimit, ReplayField::ScenarioFingerprint];
        for field in cases {
            let mut envelope = base.clone();
            match field {
                ReplayField::Seed => envelope.seed ^= 1,
                ReplayField::TickLimit => envelope.tick_limit ^= 1,
                ReplayField::ScenarioFingerprint => envelope.scenario_fingerprint ^= 1,
                _ => unreachable!(),
            }
            let expected = ReplayValidationError::EnvelopeReplayMismatch(field);
            assert_eq!(envelope.encode(), Err(ReplayEncodeError::Invalid(expected)));
            assert!(matches!(envelope.play(), Err(ReplayPlayError::Invalid(error)) if error == expected));
        }
    }

    #[test]
    fn replay_play_rechecks_identity_before_constructing_a_world() {
        let mut envelope = envelope_for(Scenario::duel(), 2);
        envelope.replay.scenario.name.push('x');
        let computed = envelope.replay.scenario.fingerprint();
        let expected = ReplayValidationError::ScenarioFingerprintMismatch {
            stored: envelope.replay.scenario_fingerprint,
            computed,
        };
        assert!(matches!(envelope.play(), Err(ReplayPlayError::Invalid(error)) if error == expected));
    }

    #[test]
    fn replay_play_rechecks_tuple_scenario_bounds_order_ticks_and_entities() {
        for change in 0..4 {
            let mut envelope = envelope_for(Scenario::duel(), 2);
            match change {
                0 => envelope.command_schema = ARTICULATED_COMMAND_SCHEMA_RESERVED,
                1 => envelope.hash_domain = HashDomain::ArticulatedV1,
                2 => envelope.hash_schema = 2,
                3 => envelope.replay.scenario.combat_model = CombatModel::Articulated,
                _ => unreachable!(),
            }
            assert_eq!(
                play_error(&envelope),
                ReplayPlayError::Invalid(ReplayValidationError::CommandModelMismatch),
                "tuple dimension {change}",
            );
        }

        let mut envelope = envelope_for(Scenario::duel(), 2);
        envelope.replay.scenario.name = "x".repeat(MAX_SCENARIO_NAME_BYTES + 1);
        sync_fingerprint(&mut envelope);
        assert_eq!(
            play_error(&envelope),
            ReplayPlayError::Invalid(ReplayValidationError::LimitExceeded(
                ReplayLimit::ScenarioNameBytes,
            ))
        );

        let mut envelope = envelope_for(Scenario::duel(), 2);
        let cols = envelope.replay.scenario.dungeon.cols();
        let rows = envelope.replay.scenario.dungeon.rows();
        let mut tiles = envelope.replay.scenario.dungeon.tiles().to_vec();
        tiles[0] = 9;
        envelope.replay.scenario.dungeon = Dungeon::from_tiles(cols, rows, tiles);
        sync_fingerprint(&mut envelope);
        assert_eq!(
            play_error(&envelope),
            ReplayPlayError::Invalid(ReplayValidationError::InvalidField(
                ReplayField::DungeonTile,
            ))
        );

        let mut envelope = envelope_for(Scenario::duel(), 2);
        envelope.replay.scenario.portal = Some(Vec2::new(
            Fx::from_raw((envelope.replay.scenario.dungeon.cols() as i32) * 65_536 + 1),
            Fx::ZERO,
        ));
        sync_fingerprint(&mut envelope);
        assert_eq!(
            play_error(&envelope),
            ReplayPlayError::Invalid(ReplayValidationError::InvalidField(
                ReplayField::PortalPosition,
            ))
        );

        let mut envelope = envelope_for(Scenario::duel(), 2);
        envelope.replay.scenario.torches.push(Torch {
            tx: envelope.replay.scenario.dungeon.cols(),
            ty: 0,
            face: Cardinal::NegX,
        });
        assert_eq!(
            play_error(&envelope),
            ReplayPlayError::Invalid(ReplayValidationError::InvalidField(
                ReplayField::TorchPosition,
            ))
        );

        let mut envelope = envelope_for(Scenario::duel(), 2);
        envelope.replay.record(1, EntityId::new(0, 0), Command::HOLD);
        envelope.replay.record(0, EntityId::new(1, 0), Command::HOLD);
        assert_eq!(
            play_error(&envelope),
            ReplayPlayError::Invalid(ReplayValidationError::NonMonotonic {
                stream: ReplayStream::Commands,
                at: 1,
            })
        );

        let mut envelope = envelope_for(Scenario::duel(), 2);
        envelope.replay.record(2, EntityId::new(0, 0), Command::HOLD);
        assert_eq!(
            play_error(&envelope),
            ReplayPlayError::Invalid(ReplayValidationError::RecordAfterTickLimit {
                stream: ReplayStream::Commands,
                tick: 2,
            })
        );

        let mut envelope = envelope_for(Scenario::duel(), 2);
        envelope.replay.record(0, EntityId::new(0, 1), Command::HOLD);
        assert_eq!(
            play_error(&envelope),
            ReplayPlayError::Invalid(ReplayValidationError::InvalidField(
                ReplayField::CommandSubject,
            ))
        );

        let mut envelope = envelope_for(Scenario::duel(), 2);
        envelope.replay.record_order(0, Faction::Heroes, Order::Focus(EntityId::new(9, 0)));
        assert_eq!(
            play_error(&envelope),
            ReplayPlayError::Invalid(ReplayValidationError::InvalidField(
                ReplayField::OrderPayload,
            ))
        );
    }

    #[test]
    fn scenario_fingerprint_and_codec_share_one_canonical_byte_sink() {
        let envelope = envelope_for(Scenario::duel(), 2);
        let bytes = envelope.encode().unwrap();
        let decoded = ReplayEnvelope::decode(&bytes).unwrap();
        assert_eq!(decoded.replay.scenario.fingerprint(), envelope.scenario_fingerprint);
        for action in ActionKind::ALL {
            let definition = action_definition_bytes(action);
            assert_eq!(definition.len(), 26);
            assert_eq!(definition[0], action.code() as u8);
        }
    }
}
