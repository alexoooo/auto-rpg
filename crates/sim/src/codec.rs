use crate::command::{
    ArticulatedCommandV1, ArticulatedPayloadError, GripRequest, Objective, Order,
    SubmittedCommand, SUBMITTED_COMMAND_LAYOUT_VERSION,
};
#[cfg(test)]
use crate::command::{Intent, ReleaseRequest};
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
use crate::replay::{ObjectiveRecord, OrderRecord, Replay, SubmittedCommandRecord};
use crate::rules::Stats;
use crate::scenario::{
    action_definition_bytes, scenario_v1_fields_into, Scenario, ScenarioByteSink, UnitSpec,
    SCENARIO_IDENTITY_WORD, SCENARIO_MODEL_TAG,
};
use crate::world::World;
use fx::{Fx, Hash64, Vec2};
#[cfg(test)]
use fx::Angle;

pub const REPLAY_CODEC_VERSION: u16 = 2;
pub const REPLAY_CODEC_VERSION_V1: u16 = 1;
// **Schema `0` was the legacy command record stream and has no constant any
// more.** `validate_envelope` refused any envelope declaring it while the
// versioned vector was non-empty, and no surviving scenario wrote it, so the
// section was unwritable as well as unread; it is out of the format rather than
// frozen empty inside it. A file still carrying the number is refused by that
// number: `UnknownCommandSchema(0)` from the header check in `decode`, and
// `CommandModelMismatch` from the schema tuple for an envelope assembled in
// memory. Neither reads a byte of the section it declares.
/// Was 1 through payload layout 1. It is the envelope's declared command
/// schema, and the assertion below is what makes it the layout version rather
/// than a number that merely started out equal to it -- a payload widening that
/// left this behind would write envelopes claiming a schema whose width they do
/// not have.
pub const ARTICULATED_COMMAND_SCHEMA_RESERVED: u16 = 2;
const _: () = assert!(ARTICULATED_COMMAND_SCHEMA_RESERVED == SUBMITTED_COMMAND_LAYOUT_VERSION);
/// The envelope schema an embodied replay declares.
///
/// A third value rather than a reuse of the articulated one, because the two
/// payloads are separate contracts whose widths will diverge: an envelope has to
/// say which width its command records have before anything reads one. Schemas
/// 0, 1 and 2 keep their meanings exactly.
pub const EMBODIED_COMMAND_SCHEMA: u16 = 3;

/// The scenario-record model tag the retired articulated body wrote.
///
/// **A number and not a variant, and it has to go on being one.** The enum it
/// came off is deleted, but a replay somebody saved still opens with this byte,
/// and a decoder that stopped knowing it would either read an articulated fight
/// as an embodied one or refuse it as an unknown discriminant -- the first is a
/// fight that never happened out of a record of one that did, and the second
/// loses the ability to say *which* retired model the file is. Both scenario
/// readers below accept it and the schema tuple in `decode` is what refuses it:
/// there is no articulated world left to play it into, so a format that decoded
/// it would be accepting a file it cannot run.
///
/// `0` was Legacy and is refused one step earlier, by
/// `UnknownDiscriminant(CombatModel, 0)`, because those bytes describe a fight
/// between two discs with one blade angle each and there is nothing in the
/// surviving record they could be read as.
const RETIRED_ARTICULATED_MODEL_TAG: u8 = 1;

/// The tag every submitted-command record in the stream carries.
///
/// The same number as [`SCENARIO_MODEL_TAG`] and a **separate contract**: the
/// model tag says which body the scenario describes and this one says how wide
/// the payload after it is. `0` was the legacy limb record and `1` the
/// fifty-three byte articulated payload; both are retired, and
/// `read_submitted_command` refuses them by number rather than reading a record
/// at the wrong width and desynchronising every record after it.
const EMBODIED_COMMAND_RECORD_TAG: u8 = 2;

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
/// Tick, entity index, entity generation, the kind byte, and the payload:
/// `4 + 4 + 4 + 1 + EMBODIED_PAYLOAD_BYTES`.
///
/// The thirteen-byte prefix is the same one the retired articulated record had,
/// and only the width after it ever differed. `ARTICULATED_COMMAND_BYTES` stood
/// beside this and was 64 while that payload was 51; it went when the last
/// reader of a fifty-three byte record did.
const EMBODIED_COMMAND_BYTES: usize = 13 + crate::command::EMBODIED_PAYLOAD_BYTES;
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
    SubmittedCommandKind,
    ArticulatedCommand,
    CommandGrip,
    OrderFaction,
    OrderKind,
    OrderPayload,
    ObjectiveFaction,
    ObjectiveKind,
    /// A release verb byte that is neither `Keep` nor `Loose`.
    ///
    /// Appended here rather than filed next to [`ReplayField::CommandGrip`]
    /// where it reads better. Nothing serializes these discriminants today, so
    /// the tidier placement would almost certainly be harmless -- but "almost
    /// certainly harmless" is not a reason to renumber a diagnostic that
    /// several crates match on, and appending costs one comment.
    CommandRelease,
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
        let codec_version = codec_version_for();
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

        // One count and one loop. The branch that stood here chose between the
        // legacy record stream and this one on `command_schema`, and every
        // envelope that can still be encoded took this arm -- so the bytes a
        // surviving replay writes are the bytes it wrote before.
        out.u32(self.replay.submitted_entries.len() as u32);
        for record in &self.replay.submitted_entries { write_submitted_command(&mut out, *record); }
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
        // The retired legacy schema is not on this list, so a file carrying it
        // stops here and by its own number rather than being carried as far as
        // the tuple check below. Refusing it by name is the whole of what a
        // retired schema value owes a reader.
        if command_schema != SUBMITTED_COMMAND_LAYOUT_VERSION
            && command_schema != EMBODIED_COMMAND_SCHEMA
        {
            return Err(ReplayDecodeError::UnknownCommandSchema(command_schema));
        }
        let domain_code = reader.u8()?;
        let hash_domain = match domain_code {
            0 => HashDomain::LegacyV1,
            1 => HashDomain::ArticulatedV1,
            2 => HashDomain::EmbodiedV1,
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
        // **One legal combination, where there were two.** The articulated one
        // -- schema 2, `ArticulatedV1`, model tag 1 -- was legal until the model
        // that could play it was deleted, and it is refused here rather than
        // further in: `read_submitted_command` used to catch the mismatch a
        // record at a time, which was the right refusal while an articulated
        // file could still be decoded into a world, and is the wrong one now
        // that it cannot. Every column is still compared by number, so a file
        // carrying any of the three retired values is refused by that value.
        let tuple_ok = matches!(
            (command_schema, hash_domain, hash_schema, scanned.combat_model),
            (EMBODIED_COMMAND_SCHEMA, HashDomain::EmbodiedV1, 1, SCENARIO_MODEL_TAG)
        );
        if !tuple_ok {
            return Err(ReplayDecodeError::CommandModelMismatch);
        }
        if tick_limit > scanned.max_ticks {
            return Err(ReplayDecodeError::InvalidField(ReplayField::TickLimit));
        }
        let stream_start = reader.at;
        scan_streams(&mut reader, scanned.unit_count, tick_limit, None, None)?;
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
            Some(&scenario),
            None,
        )?;
        debug_assert!(validation.is_empty());
        let mut records = DecodedStreams::default();
        let mut second = ByteReader { bytes, at: stream_start };
        scan_streams(&mut second, scanned.unit_count, tick_limit, Some(&scenario), Some(&mut records))?;
        debug_assert!(second.is_empty());

        let replay = Replay {
            seed,
            scenario,
            scenario_fingerprint,
            ticks: tick_limit,
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
fn codec_version_for() -> u16 {
    // One answer, now that there is one model that writes replays, and no
    // argument left to take one from. Version 1 was the Legacy ceiling; a v1
    // envelope reaching the decoder is refused by `scan_combat_extension`, which
    // answers `MissingCombatSpecs` -- a better refusal than a version comparison
    // because it names the section that a v1 record cannot have.
    REPLAY_CODEC_VERSION
}

/// The unit ceiling in force for one scenario record.
///
/// `MAX_SCENARIO_UNITS` bounds the *field*; how many units a model can actually
/// simulate is a separate question, and the contact solver answers it --
/// `MAX_ARTICULATED_ENTITIES` is its authoritative entity capacity, not a
/// browser publication limit, so row 65 can never be honoured however it
/// arrives. A version-1 record keeps 4,096 exactly: same bytes, same offsets,
/// same error, because those are pinned by fixture.
///
/// **The model half of this test is gone and the ceiling is not, which is the
/// whole of what to understand here.** It was `model == Articulated` until the
/// articulated fixtures were reseated off it, then `model.uses_contact_solver()`,
/// and now nothing: the ceiling was never a property of a model, it is a
/// property of the solver, and the solver owns it unconditionally.
/// `contact_bounds` answers `ContactCapacityError::EntityLimit` above
/// `MAX_ARTICULATED_ENTITIES` for every world that reaches it. While the test
/// named a model, an embodied replay carrying 65 units encoded cleanly, decoded
/// cleanly and then could not be stepped -- a file the format accepted and the
/// simulator could not run. Measured on the way in: with the model spelling
/// restored, `codec_v2_rejects_unit_row_65_before_unit_allocation` reports
/// `Ok(..)` from `encode` where it expects `LimitExceeded(ScenarioUnits)`. That
/// refusal is a bug fix and it must not evaporate with the predicate that
/// happened to be carrying it.
///
/// The overflow keeps `ReplayLimit::ScenarioUnits`. The tag names the field that
/// was too large, not the constant that bounded it, and no caller can act
/// differently on the two -- both mean "send fewer units". A new variant would
/// also change an exported enum that `replay-codec-v1.md` transcribes verbatim,
/// to say something the existing one already says.
///
/// `codec_version` stays, and it is the one thing here that is not the solver's.
/// A version-1 record is malformed in a deeper way and already answers
/// `MissingCombatSpecs`; narrowing its ceiling first would change that error
/// for no gain, and the 4,096 above is pinned by fixture.
fn scenario_unit_ceiling(codec_version: u16) -> usize {
    if codec_version == REPLAY_CODEC_VERSION {
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
    // **Three columns where there were four, and the fourth did not shrink -- it
    // stopped existing.** The model column read a `Scenario` in memory and never
    // a wire byte, so with one model a tuple could not disagree with itself
    // about it. The retired *header* values are still here and still refused by
    // number: an envelope assembled with the articulated schema or the
    // articulated hash domain is what this catches, one step before it can
    // become a file.
    let tuple_ok = matches!(
        (envelope.command_schema, envelope.hash_domain, envelope.hash_schema),
        (EMBODIED_COMMAND_SCHEMA, HashDomain::EmbodiedV1, 1)
    );
    if !tuple_ok {
        return Err(ReplayValidationError::CommandModelMismatch);
    }
    // The cross-check that used to follow -- that the vector matching the
    // declared schema is the non-empty one -- had nothing left to compare once
    // the legacy vector went. There is one command vector now, and the tuple
    // above is what says which grammar the records in it are written in.
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
    validate_construction(scenario.combat_specs.as_ref(), &scenario.units)
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
    if scenario.units.len() > scenario_unit_ceiling(codec_version_for()) {
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
    validate_count(replay.submitted_entries.len(), MAX_COMMAND_RECORDS, ReplayLimit::CommandRecords)?;
    validate_count(replay.orders.len(), MAX_ORDER_RECORDS, ReplayLimit::OrderRecords)?;
    validate_count(
        replay.objectives.len(),
        MAX_OBJECTIVE_RECORDS,
        ReplayLimit::ObjectiveRecords,
    )?;
    let roster = replay.scenario.units.len();
    let mut prior = None;
    for (at, record) in replay.submitted_entries.iter().enumerate() {
        validate_tick(prior, record.tick, at, ReplayStream::Commands, tick_limit, false)?;
        prior = Some(record.tick);
        if !initial_id(record.entity, roster) {
            return Err(ReplayValidationError::InvalidField(ReplayField::CommandSubject));
        }
        // **The grammar comparison that stood here had two grammars to compare.**
        // A record whose model disagreed with the scenario's was refused as
        // `CommandModelMismatch`; with one variant in `SubmittedCommand` and no
        // model on a `Scenario`, an in-memory record cannot disagree with
        // anything. The refusal survives where it can still bite, which is the
        // wire: `read_submitted_command` checks the record tag against the one
        // the surviving grammar writes and refuses `0` and `1` by number.
        let SubmittedCommand::Embodied(command) = record.command;
        let command = command.articulated;
        command.payload_bytes();
        crate::command::validate_articulated(command)
            .map_err(|_| ReplayValidationError::InvalidField(ReplayField::ArticulatedCommand))?;
        let unit = &replay.scenario.units[record.entity.index as usize];
        validate_grips(command, replay.scenario.combat_specs.as_ref(), unit)?;
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
    // The combat extension, unconditionally: it was written for every model with
    // articulated columns, which is every model that can still be encoded.
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
    Some(len)
}

fn payload_len(scenario_len: usize, replay: &Replay) -> Option<usize> {
    let command_bytes = replay.submitted_entries.iter().try_fold(0usize, |sum, record| {
        let width = match record.command {
            SubmittedCommand::Embodied(_) => EMBODIED_COMMAND_BYTES,
        };
        sum.checked_add(width)
    })?;
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
    submitted_commands: Vec<SubmittedCommandRecord>,
    orders: Vec<OrderRecord>,
    objectives: Vec<ObjectiveRecord>,
}

fn scan_streams(
    reader: &mut ByteReader<'_>,
    roster: usize,
    tick_limit: u32,
    scenario: Option<&Scenario>,
    mut output: Option<&mut DecodedStreams>,
) -> Result<(), ReplayDecodeError> {
    let command_count = read_count(reader, MAX_COMMAND_RECORDS, ReplayLimit::CommandRecords)?;
    if let Some(out) = output.as_deref_mut() {
        out.submitted_commands = Vec::with_capacity(command_count);
    }
    let mut prior = None;
    for at in 0..command_count {
        let record = read_submitted_command(reader, roster, scenario)?;
        decode_tick(prior, record.tick, at, ReplayStream::Commands, tick_limit, false)?;
        prior = Some(record.tick);
        if let Some(out) = output.as_deref_mut() { out.submitted_commands.push(record); }
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
    /// The record's model tag as it was read, not as an enum: the tuple in
    /// `decode` compares it against [`SCENARIO_MODEL_TAG`] so that a file
    /// carrying [`RETIRED_ARTICULATED_MODEL_TAG`] is refused by its number.
    combat_model: u8,
    max_ticks: u32,
    unit_count: usize,
    fingerprint: u64,
}

fn read_combat_extension(
    reader: &mut ByteReader<'_>,
    codec_version: u16,
    loadouts: &[Loadout],
) -> Result<Option<(CombatSpecTableV1, Vec<ArticulatedUnitSpecV1>)>, ReplayDecodeError> {
    // A version-1 record has no extension section and every model that can carry
    // one needs it, so the model half of this test answered the same way for
    // everything that reached it.
    if codec_version == REPLAY_CODEC_VERSION_V1 {
        return Err(ReplayDecodeError::MissingCombatSpecs);
    }
    // `0` is "no table", which was legal for Legacy and is refused **by that
    // number** rather than absorbed into the unknown-discriminant arm: a record
    // saying it has no spec table is well-formed and unplayable, which is a
    // different fact from a record whose presence byte is nonsense.
    match reader.u8()? {
        0 => return Err(ReplayDecodeError::InvalidField(ReplayField::CombatSpecPresence)),
        1 => {}
        value => return Err(ReplayDecodeError::UnknownDiscriminant {
            field: ReplayField::CombatSpecPresence,
            value: value as u32,
        }),
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
    unit_count: usize,
) -> Result<(), ReplayDecodeError> {
    // Both branches answer `read_combat_extension`'s, and for its reasons.
    if codec_version == REPLAY_CODEC_VERSION_V1 {
        return Err(ReplayDecodeError::MissingCombatSpecs);
    }
    match reader.u8()? {
        0 => return Err(ReplayDecodeError::InvalidField(ReplayField::CombatSpecPresence)),
        1 => {}
        value => return Err(ReplayDecodeError::UnknownDiscriminant { field: ReplayField::CombatSpecPresence, value: value as u32 }),
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
    // The model tag opens the record and nothing here reads its value: this pass
    // only has to walk to the extension. It is still matched rather than skipped
    // so that the set of tags this file knows is written in one shape in all
    // three readers -- see `scan_scenario`.
    match reader.u8()? {
        RETIRED_ARTICULATED_MODEL_TAG | SCENARIO_MODEL_TAG => {}
        _ => unreachable!("scan_scenario has already refused every other value"),
    }
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
    read_combat_extension(&mut reader, codec_version, &loadouts)?;
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
        // Two tags, and one of them names a model that no longer exists. `0` was
        // Legacy and is refused here: those bytes describe a fight between two
        // discs with one blade angle each, and decoding them as an embodied
        // scenario would produce a fight that never happened out of a record of
        // one that did. `1` was Articulated and is *carried*, so that the tuple
        // in `decode` can refuse the whole envelope by that number rather than
        // this reader refusing a byte it does in fact recognise.
        tag @ (RETIRED_ARTICULATED_MODEL_TAG | SCENARIO_MODEL_TAG) => tag,
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
    // Decided from the header's codec version, long before anything is
    // allocated. It read the combat-model tag as well, which is why the comment
    // here used to point at the first byte of the record; the ceiling is the
    // solver's rather than a model's and `scenario_unit_ceiling` says why.
    let ceiling = scenario_unit_ceiling(codec_version);
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
    scan_combat_extension(&mut reader, codec_version, unit_count)?;
    if !reader.is_empty() {
        return Err(ReplayDecodeError::TrailingBytes);
    }
    let mut hash = Hash64::new();
    hash.write_bytes(b"ARPG-SCENARIO");
    // **The same constant `Scenario::try_fingerprint` writes**, and that is the
    // whole reason it is a constant: this is a second computation of the same
    // fingerprint from the decoded bytes, and the two copies disagreed once
    // already. A record carrying the retired articulated tag therefore computes
    // an *embodied* fingerprint here, which is harmless because the tuple in
    // `decode` has already refused the envelope by that tag.
    hash.write_u16(SCENARIO_IDENTITY_WORD);
    hash.write_bytes(&bytes[..identity_end]);
    hash.write_bytes(&bytes[extension_start..]);
    Ok(ScenarioScan {
        combat_model,
        max_ticks,
        unit_count,
        fingerprint: hash.finish(),
    })
}

fn build_scenario(bytes: &[u8], codec_version: u16) -> Result<Scenario, ReplayDecodeError> {
    let mut reader = ByteReader::new(bytes);
    // Read and discarded: a `Scenario` has no model field to put it in, and
    // `decode` has already refused every envelope whose tag is not
    // [`SCENARIO_MODEL_TAG`]. The match is kept rather than a `reader.u8()?`
    // because this pass must refuse exactly what the scan pass refused -- a
    // reader that skipped the byte would build a scenario out of a record the
    // scan had rejected if the two were ever called in the other order.
    match reader.u8()? {
        RETIRED_ARTICULATED_MODEL_TAG | SCENARIO_MODEL_TAG => {}
        value => return Err(ReplayDecodeError::UnknownDiscriminant {
            field: ReplayField::CombatModel,
            value: value as u32,
        }),
    }
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
    // Same ceiling as the scan pass, from the same version word: the two must
    // not be able to disagree, or the stream offsets the scan agreed to stop
    // reading at would not be the ones this pass builds from.
    let ceiling = scenario_unit_ceiling(codec_version);
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
    let extension = read_combat_extension(&mut reader, codec_version, &loadouts)?;
    if let Some((_, rows)) = &extension {
        for (unit, row) in units.iter_mut().zip(rows) { unit.articulated = Some(*row); }
    }
    if !reader.is_empty() {
        return Err(ReplayDecodeError::TrailingBytes);
    }
    Ok(Scenario {
        name,
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

/// The record tag is checked against [`EMBODIED_COMMAND_RECORD_TAG`] rather than
/// trusted: a reader that took the width from the tag byte would read whatever
/// number of bytes a corrupt or retired file asked it to.
///
/// **`command_schema` was a parameter, and the envelope's schema is what chose
/// the expected tag.** With one schema in the tuple that argument can no longer
/// disagree with anything, so the expected tag is the constant directly. What
/// the parameter bought is unchanged and is why the check is still here.
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
        EMBODIED_COMMAND_RECORD_TAG => {}
        // `0` and `1` are the retired grammars, refused **by their numbers**:
        // a file carrying either is a file this decoder cannot play, and saying
        // so is what stops it being read at the wrong width instead.
        0 | 1 => return Err(ReplayDecodeError::CommandModelMismatch),
        value => return Err(ReplayDecodeError::UnknownDiscriminant {
            field: ReplayField::SubmittedCommandKind,
            value: value as u32,
        }),
    }
    // **The width is the surviving payload's, and it was not always.** This read
    // `ARTICULATED_PAYLOAD_BYTES` for both schemas while the two widths were
    // equal, and the equality was the only thing holding it up: the moment the
    // embodied payload grew to 57 the writer emitted four bytes this reader did
    // not consume, and everything after the command stream was read from four
    // bytes too early. It does not surface as a wrong command -- it surfaces as
    // the order-stream count being read out of the middle of a payload, which is
    // why `an_embodied_envelope_round_trips_through_its_own_schema` failed as
    // `LimitExceeded(OrderRecords)` rather than as a mismatched field.
    let payload = reader.take(crate::command::EMBODIED_PAYLOAD_BYTES)?;
    // Its own reader, and not `ArticulatedCommandV1::from_payload_bytes` plus a
    // wrapper: the wrapper could only supply a neutral plane, which is a silent
    // way of dropping a field a replay is required to reproduce verbatim.
    let payload: &[u8; crate::command::EMBODIED_PAYLOAD_BYTES] =
        payload.try_into().unwrap();
    let command = SubmittedCommand::Embodied(
        crate::command::EmbodiedCommandV1::from_payload_bytes(payload)
            .map_err(payload_decode_error)?);
    // The grip check below is over the shared half.
    let articulated = match command {
        SubmittedCommand::Embodied(embodied) => embodied.articulated,
    };
    for grip in articulated.grips {
        if let GripRequest::EquipSlot(slot) = grip {
            if slot > 1 {
                return Err(ReplayDecodeError::InvalidField(ReplayField::CommandGrip));
            }
            if let Some(scenario) = scenario {
                let unit = &scenario.units[entity.index as usize];
                let valid = match (scenario.combat_specs.as_ref(), unit.articulated) {
                    (Some(table), Some(row)) =>
                        crate::combat::spec::grips_valid(table, row, articulated.grips),
                    _ => unit.loadout.holds(slot as usize),
                };
                if !valid {
                    return Err(ReplayDecodeError::InvalidField(ReplayField::CommandGrip));
                }
            }
        }
    }
    Ok(SubmittedCommandRecord { tick, entity, command })
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
        ArticulatedPayloadError::UnknownRelease { value, .. } => ReplayDecodeError::UnknownDiscriminant {
            field: ReplayField::CommandRelease,
            value: value as u32,
        },
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

fn write_submitted_command(out: &mut ByteWriter, record: SubmittedCommandRecord) {
    out.u32(record.tick);
    out.u32(record.entity.index);
    out.u32(record.entity.generation);
    match record.command {
        SubmittedCommand::Embodied(command) => {
            out.u8(EMBODIED_COMMAND_RECORD_TAG);
            out.bytes.extend_from_slice(&command.payload_bytes());
        }
    }
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

    // **`replay_codec_v1_matches_the_documented_offset_fixture` is gone, and it is
    // the one deletion here that costs something.** It pinned the version-1
    // envelope's byte offsets against the table in
    // `docs/reference/replay-codec-v1.md`, built from the smallest Legacy
    // scenario the encoder would take. Version 1 was the Legacy ceiling: no
    // surviving scenario writes it, so the fixture cannot be constructed and the
    // offsets it pinned have no producer left to drift. What still checks the v1
    // header is the refusal path -- a v1 envelope now fails the schema tuple,
    // which `replay_decoder_rejects_a_model_schema_domain_mismatch` covers -- so
    // the format is refused by name rather than silently mis-read. The offset
    // table in that document is now history rather than a contract, and the
    // document should say so.

    /// The smallest scenario the surviving model will encode.
    ///
    /// **It is not as small as it was.** These tests want a minimum because they
    /// are about byte offsets, truncation and discriminants rather than about a
    /// fight, and the old minimum was a Legacy scenario with no spec table and no
    /// units at all. A world with articulated columns refuses both: every unit
    /// needs an anatomy row and the table has to be present, which
    /// `validate_construction` checks before anything is allocated. So the floor
    /// is one tile, the roster is one dressed body, and the table is the shipped
    /// fixture set -- and that is the floor of the format now.
    fn minimal_scenario(name: &str) -> Scenario {
        let mut hero = UnitSpec {
            kind: Body::Fighter,
            faction: Faction::Heroes,
            stats: Body::Fighter.base_stats(),
            loadout: Body::Fighter.default_loadout(),
            articulated: None,
            spawn: Vec2::ZERO,
        };
        crate::scenario::equip_fixture_body(&mut hero);
        Scenario {
            name: name.to_string(),
            combat_specs: Some(crate::CombatSpecTableV1::fixtures()),
            dungeon: Dungeon::open(1, 1),
            units: vec![hero],
            portal: None,
            torches: Vec::new(),
            max_ticks: 1,
        }
    }

    /// A valid envelope round the given scenario.
    ///
    /// **The tag used to be hard-coded legacy** -- command schema `0` and
    /// `HashDomain::LegacyV1` -- because every scenario these refusal tests built
    /// was Legacy, and then it was read off the scenario's model while there
    /// were two. It is hard-coded again, to the one pair the tuple accepts: a
    /// scenario no longer says which, and every test below that wants a retired
    /// header writes one over these bytes itself, which is the only way a
    /// decoder will ever meet one again.
    fn envelope_for(scenario: Scenario, ticks: u32) -> ReplayEnvelope {
        let (command_schema, hash_domain) = (EMBODIED_COMMAND_SCHEMA, HashDomain::EmbodiedV1);
        let mut replay = Replay::new(&scenario, 7);
        replay.finish(ticks);
        ReplayEnvelope {
            command_schema,
            hash_domain,
            hash_schema: 1,
            scenario_fingerprint: replay.scenario_fingerprint,
            seed: replay.seed,
            tick_limit: replay.ticks,
            replay,
        }
    }

    /// The two arms get **different** planes and neither is zero, so a reader
    /// that dropped the field, read one offset twice, or read the pair at the
    /// articulated width cannot round-trip by accident.
    const EMBODIED_FIXTURE_PLANE: [Angle; 2] =
        [Angle::from_raw(0x4567), Angle::from_raw(0x89ab)];

    fn embodied_envelope() -> ReplayEnvelope {
        embodied_envelope_for(Scenario::embodied_duel())
    }

    #[test]
    fn an_embodied_envelope_round_trips_through_its_own_schema() {
        let envelope = embodied_envelope();
        let bytes = envelope.encode().expect("encodes");
        let decoded = ReplayEnvelope::decode(&bytes).expect("embodied envelope");
        assert_eq!(decoded.command_schema, EMBODIED_COMMAND_SCHEMA);
        assert_eq!(decoded.hash_domain, HashDomain::EmbodiedV1);
        assert_eq!(decoded.replay.submitted_entries, envelope.replay.submitted_entries);
        assert!(matches!(
            decoded.replay.submitted_entries[0].command,
            SubmittedCommand::Embodied(_)
        ));
    }

    /// The record is read at the **embodied** width, and the plane survives it.
    ///
    /// Two failures live here and the equality above would report either of them
    /// as one mismatch, so they are separated: a reader that reconstructs the
    /// record through `EmbodiedCommandV1::new` loses the plane while consuming
    /// the right number of bytes, and a reader that consumes
    /// `ARTICULATED_PAYLOAD_BYTES` desynchronises the stream so that everything
    /// after this record is read from four bytes too early. The stream is one
    /// record long here, so the second failure surfaces as a trailing-byte
    /// refusal rather than as garbage -- which is exactly why the plane is
    /// asserted on its own as well.
    #[test]
    fn an_embodied_command_record_carries_its_swing_plane() {
        let envelope = embodied_envelope();
        let bytes = envelope.encode().expect("encodes");
        let decoded = ReplayEnvelope::decode(&bytes).expect("embodied envelope");
        // Irrefutable since the retired grammar left the enum: the `else` arm
        // that stood here panicked on a variant that no longer exists.
        let SubmittedCommand::Embodied(command) = decoded.replay.submitted_entries[0].command;
        assert_eq!(command.swing_plane, EMBODIED_FIXTURE_PLANE);
        // And the width is the embodied one, counted from the tag byte rather
        // than from a constant this file also uses to write it.
        let tag = tag_offset(&bytes);
        assert_eq!(&bytes[tag + 1..tag + 1 + crate::command::EMBODIED_PAYLOAD_BYTES],
                   command.payload_bytes().as_slice());
    }

    /// The record tag is read against the envelope's declared schema and not
    /// against itself, so an embodied replay carrying articulated records is a
    /// model mismatch rather than fifty-three bytes read at the wrong width.
    #[test]
    fn an_embodied_schema_replay_refuses_an_articulated_tag() {
        let envelope = embodied_envelope();
        let mut bytes = envelope.encode().expect("encodes");
        let tag = tag_offset(&bytes);
        assert_eq!(bytes[tag], 2, "the embodied record tag is not where this test looked");
        bytes[tag] = 1;
        assert_eq!(ReplayEnvelope::decode(&bytes).unwrap_err(), ReplayDecodeError::CommandModelMismatch);
        bytes[tag] = 0;
        assert_eq!(ReplayEnvelope::decode(&bytes).unwrap_err(), ReplayDecodeError::CommandModelMismatch);
        bytes[tag] = 3;
        assert!(matches!(
            ReplayEnvelope::decode(&bytes),
            Err(ReplayDecodeError::UnknownDiscriminant {
                field: ReplayField::SubmittedCommandKind, value: 3,
            })
        ));
    }

    /// The same claim from the other side of the pair, and the sharpest case the
    /// format has: **a whole articulated file, agreeing with itself, refused.**
    ///
    /// **The envelope is assembled by patching bytes rather than by building a
    /// `Scenario`**, and that is the reseat rather than a shortcut. Nothing in
    /// this crate constructs the retired model any more, so the articulated
    /// header is written the only way a decoder will ever meet one again -- as
    /// numbers in a file somebody kept.
    ///
    /// **What refuses it moved, and moving it was the point.** While an
    /// articulated replay could still be decoded into a world, the header tuple
    /// accepted this combination and `read_submitted_command` caught the
    /// mismatched *record* a moment later; the demonstration that used to stand
    /// here patched the record tag to agree as well and watched the same bytes
    /// answer `LimitExceeded(OrderRecords)`, because a fifty-seven byte payload
    /// read at the fifty-three byte width puts the order count in the middle of
    /// a record. That is no longer a file anything could play, so the tuple
    /// refuses the envelope before a payload is read at any width -- which is
    /// the second assertion below, and the reason it is worth two: a format that
    /// accepted a self-consistent retired file would be accepting a file it
    /// cannot run.
    #[test]
    fn an_articulated_schema_replay_refuses_an_embodied_tag() {
        let mut bytes = embodied_envelope().encode().expect("encodes");
        bytes[6..8].copy_from_slice(&SUBMITTED_COMMAND_LAYOUT_VERSION.to_le_bytes());
        bytes[8] = HashDomain::ArticulatedV1 as u8;
        // The scenario record opens with the combat-model tag, and `1` is the
        // retired Articulated discriminant that `scan_scenario` still knows by
        // name -- which is what pairs with the header written above.
        bytes[HEADER_BYTES] = 1;
        let tag = tag_offset(&bytes);
        assert_eq!(bytes[tag], 2, "the embodied record tag is not where this test looked");
        assert_eq!(ReplayEnvelope::decode(&bytes).unwrap_err(), ReplayDecodeError::CommandModelMismatch);
        // And with the record tag agreeing too, so that nothing in the file
        // disagrees with anything else in it. Same refusal, and it has to be the
        // same one: the header is what the decoder can refuse without trusting a
        // width it has no reader for.
        bytes[tag] = 1;
        assert_eq!(ReplayEnvelope::decode(&bytes).unwrap_err(), ReplayDecodeError::CommandModelMismatch);
    }

    /// The header tuple binds schema, hash domain and combat model together, so
    /// an embodied scenario cannot be shipped under an articulated header.
    ///
    /// It is refused at **encode**, one step earlier than the decoder would
    /// catch it, which is the better of the two places: a mismatched envelope
    /// never reaches a file. The decoder still refuses it -- see
    /// `an_embodied_schema_replay_refuses_an_articulated_tag`, which reaches the
    /// decode path by editing bytes the encoder already wrote.
    #[test]
    fn an_embodied_scenario_refuses_an_articulated_header() {
        let mut envelope = embodied_envelope();
        envelope.command_schema = SUBMITTED_COMMAND_LAYOUT_VERSION;
        envelope.hash_domain = HashDomain::ArticulatedV1;
        assert_eq!(
            envelope.encode().unwrap_err(),
            ReplayEncodeError::Invalid(ReplayValidationError::CommandModelMismatch),
        );
    }

    /// Locates the one submitted record's tag byte: the stream count sits four
    /// bytes past the scenario record, and each record is tick plus a
    /// twelve-byte identity before the tag.
    fn tag_offset(bytes: &[u8]) -> usize {
        let scenario_bytes =
            u32::from_le_bytes(bytes[HEADER_BYTES - 4..HEADER_BYTES].try_into().unwrap()) as usize;
        HEADER_BYTES + scenario_bytes + 4 + 12
    }

    /// One valid embodied envelope over `scenario`, carrying one record.
    ///
    /// **This was `articulated_envelope_for`, and reseating it merged two
    /// fixtures into one.** The embodied builder above took this one's output
    /// and rewrote every record, which meant the only command grammar the wire
    /// still writes was reached through the retired one -- a fixture chain that
    /// could not outlive the model. It writes the record it means now.
    fn embodied_envelope_for(scenario: Scenario) -> ReplayEnvelope {
        let mut replay = Replay::new(&scenario, 7);
        let arm = ArmTarget {
            bearing: Angle::QUARTER,
            height: CombatHeight::MID,
            reach: Fx::HALF,
            effort: Fx::ONE,
        };
        let mut command = crate::command::EmbodiedCommandV1::new(ArticulatedCommandV1 {
            move_dir: Vec2::ZERO,
            body_yaw: Angle::QUARTER,
            intent: Intent::Hold,
            arms: [arm; 2],
            grips: [GripRequest::Keep; 2],
            // Asymmetric so the round trip below actually covers the two
            // bytes layout 2 added. Both `Keep` would leave them zero, and
            // a codec that dropped them entirely would still pass.
            releases: [ReleaseRequest::Keep, ReleaseRequest::Loose],
        });
        command.swing_plane = EMBODIED_FIXTURE_PLANE;
        replay.record_submitted(0, EntityId::new(0, 0), SubmittedCommand::Embodied(command));
        replay.finish(1);
        ReplayEnvelope {
            command_schema: EMBODIED_COMMAND_SCHEMA,
            hash_domain: HashDomain::EmbodiedV1,
            hash_schema: 1,
            scenario_fingerprint: replay.scenario_fingerprint,
            seed: replay.seed,
            tick_limit: replay.ticks,
            replay,
        }
    }

    #[test]
    fn submitted_commands_round_trip_in_documented_field_order() {
        let envelope = embodied_envelope();
        let bytes = envelope.encode().unwrap();
        let start = stream_start(&bytes);
        assert_eq!(u32::from_le_bytes(bytes[start..start + 4].try_into().unwrap()), 1);
        let mut expected = [0u8; EMBODIED_COMMAND_BYTES];
        // `2` is the embodied record tag. Every offset below it is unchanged by
        // the reseat, which is the point of the shared fifty-three byte prefix:
        // the fork between the two payloads was about width and ownership, not
        // about where a field sits.
        expected[12] = 2;
        expected[21..23].copy_from_slice(&Angle::QUARTER.raw().to_le_bytes());
        expected[32..34].copy_from_slice(&Angle::QUARTER.raw().to_le_bytes());
        expected[34..38].copy_from_slice(&CombatHeight::MID.raw().to_le_bytes());
        expected[38..42].copy_from_slice(&Fx::HALF.raw().to_le_bytes());
        expected[42..46].copy_from_slice(&Fx::ONE.raw().to_le_bytes());
        expected[46..48].copy_from_slice(&Angle::QUARTER.raw().to_le_bytes());
        expected[48..52].copy_from_slice(&CombatHeight::MID.raw().to_le_bytes());
        expected[52..56].copy_from_slice(&Fx::HALF.raw().to_le_bytes());
        expected[56..60].copy_from_slice(&Fx::ONE.raw().to_le_bytes());
        // The two release verbs close the record, at `13 + 51` and `13 + 52`.
        // The left arm keeps and stays zero; the right looses.
        expected[64] = 0;
        expected[65] = 1;
        // The two swing planes close the embodied record, at `13 + 53` and
        // `13 + 55`. Different values on the two arms, so a writer that read
        // one offset twice is caught here as well as in the round trip.
        expected[66..68].copy_from_slice(&EMBODIED_FIXTURE_PLANE[0].raw().to_le_bytes());
        expected[68..70].copy_from_slice(&EMBODIED_FIXTURE_PLANE[1].raw().to_le_bytes());
        assert_eq!(&bytes[start + 4..start + 4 + EMBODIED_COMMAND_BYTES], &expected);
        let decoded = ReplayEnvelope::decode(&bytes).unwrap();
        assert_eq!(decoded.replay.submitted_entries, envelope.replay.submitted_entries);
        assert!(decoded.play().is_ok());
    }

    #[test]
    fn a_loose_verb_round_trips_through_the_replay_codec() {
        // The typed value rather than the bytes: the fixture above already pins
        // where they sit, and what this has to say is that a replay carries the
        // verb rather than reconstructing a default. A codec that dropped the
        // two bytes would decode `Keep, Keep` and the byte assertion alone
        // would not notice, because it reads the *encoded* buffer.
        for releases in [[ReleaseRequest::Keep, ReleaseRequest::Keep],
                         [ReleaseRequest::Keep, ReleaseRequest::Loose],
                         [ReleaseRequest::Loose, ReleaseRequest::Keep],
                         [ReleaseRequest::Loose, ReleaseRequest::Loose]] {
            let mut envelope = embodied_envelope();
            let SubmittedCommand::Embodied(mut command) =
                envelope.replay.submitted_entries[0].command;
            command.articulated.releases = releases;
            envelope.replay.submitted_entries[0].command = SubmittedCommand::Embodied(command);
            let bytes = envelope.encode().unwrap();
            let decoded = ReplayEnvelope::decode(&bytes).unwrap();
            let SubmittedCommand::Embodied(back) =
                decoded.replay.submitted_entries[0].command;
            assert_eq!(back.articulated.releases, releases, "the replay lost the release verbs");
            assert_eq!(back, command, "the replay changed something else too");
        }
    }

    #[test]
    fn combat_specs_round_trip_in_documented_field_order() {
        let envelope = embodied_envelope();
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
    fn codec_v1_replays_fail_with_missing_combat_specs() {
        let mut bytes = embodied_envelope().encode().unwrap();
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
    fn codec_v2_rejects_a_combat_spec_presence_mismatch() {
        // **The first half of this test is gone with the model it was about.** It
        // took a Legacy scenario -- which carries no spec table -- appended the
        // version-2 presence byte as `0`, and checked that the v2 decoder
        // accepted "no table, and it says so". Every surviving scenario carries a
        // table, so `presence == 0` is now a refusal rather than a shape, and it
        // is the refusal the half below checks.
        let mut embodied = embodied_envelope().encode().unwrap();
        let scenario_len = u32::from_le_bytes(embodied[36..40].try_into().unwrap()) as usize;
        let extension_len = 1 + 2 + 2 + 2 * BODY_ANATOMY_SPEC_V1_BYTES + 2
            + SEGMENT_EQUIPMENT_SPEC_V1_BYTES + SHIELD_EQUIPMENT_SPEC_V1_BYTES
            + SEGMENT_EQUIPMENT_SPEC_V1_BYTES + 2 + 8 + 6;
        embodied[HEADER_BYTES + scenario_len - extension_len] = 0;
        assert_eq!(decode_error(&embodied), ReplayDecodeError::InvalidField(ReplayField::CombatSpecPresence));
    }

    #[test]
    fn codec_v2_rejects_every_combat_spec_discriminant_bound_and_reference_class() {
        let base = embodied_envelope().encode().unwrap();
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

        let mut two_geometry_shields = embodied_envelope();
        let table = two_geometry_shields.replay.scenario.combat_specs.as_mut().unwrap();
        table.equipment[0].geometry = table.equipment[1].geometry;
        assert_eq!(two_geometry_shields.encode(), Err(ReplayEncodeError::Invalid(
            ReplayValidationError::InvalidField(ReplayField::ArticulatedUnitSpec),
        )));
    }

    #[test]
    fn malformed_command_groups_are_refused_before_construction() {
        let base = embodied_envelope().encode().unwrap();
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

        let mut with_order = embodied_envelope();
        with_order.replay.record_order(0, Faction::Heroes, Order::Hold);
        let mut bad = with_order.encode().unwrap();
        let order = stream_start(&bad) + 4 + EMBODIED_COMMAND_BYTES + 4;
        bad[order + 5] = 9;
        assert_eq!(decode_error(&bad), ReplayDecodeError::UnknownDiscriminant {
            field: ReplayField::OrderKind, value: 9,
        });
    }

    fn put_u32(bytes: &mut [u8], at: usize, value: u32) {
        bytes[at..at + 4].copy_from_slice(&value.to_le_bytes());
    }

    /// Records one neutral submitted command, on the only stream there is.
    ///
    /// **These tests used `Replay::record`**, the legacy command stream, because
    /// it was the cheapest record to build. That stream became unwritable when
    /// the legacy grammar went -- an envelope carrying it had to declare command
    /// schema `0`, which no surviving scenario writes -- and the comment here
    /// said it would stay frozen in the format until the same step removed the
    /// legacy columns from the state hash, so that the format moved once rather
    /// than twice. This is that step, and the section is gone.
    fn hold(replay: &mut Replay, tick: u32, entity: EntityId) {
        replay.record_submitted(tick, entity, SubmittedCommand::Embodied(
            crate::command::EmbodiedCommandV1::new(neutral_command())));
    }

    /// A command every field of which is the quiet value.
    fn neutral_command() -> ArticulatedCommandV1 {
        ArticulatedCommandV1 {
            move_dir: Vec2::ZERO,
            body_yaw: Angle::ZERO,
            intent: Intent::Hold,
            arms: [ArmTarget {
                bearing: Angle::ZERO,
                height: CombatHeight::MID,
                reach: Fx::ZERO,
                effort: Fx::ZERO,
            }; 2],
            grips: [GripRequest::Keep; 2],
            releases: [ReleaseRequest::Keep; 2],
        }
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
        let base = envelope_for(Scenario::embodied_duel(), 2).encode().unwrap();

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
        let base = envelope_for(Scenario::embodied_duel(), 2).encode().unwrap();
        for end in 0..HEADER_BYTES {
            assert_eq!(decode_error(&base[..end]), ReplayDecodeError::TooShort, "cut {end}");
        }
        for end in HEADER_BYTES..base.len() {
            assert_eq!(decode_error(&base[..end]), ReplayDecodeError::PayloadLength, "cut {end}");
        }

        let mut one = minimal_scenario("x");
        one.torches = vec![Torch { tx: 0, ty: 0, face: Cardinal::NegX }];
        one.max_ticks = 2;
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
        // 130 and not 104: the unit record grew by the articulated row, which is
        // eight bytes of anatomy and equipment ids, and the spec table it points
        // into follows the torches.
        put_u32(&mut bad, 130, MAX_SCENARIO_TORCHES as u32 + 1);
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
        // 134 and not 108: the torch block sits past the unit records, and a unit
        // record grew by its articulated row.
        bad[134] = 1;
        assert_eq!(decode_error(&bad), ReplayDecodeError::InvalidField(ReplayField::TorchPosition));
    }

    /// A structurally valid embodied scenario with exactly `rows` unit rows.
    ///
    /// Every added row carries its own binding on purpose. `try_fingerprint`
    /// runs `validate_construction` before any scenario bound is looked at, so a
    /// roster padded with bare `UnitSpec`s reports
    /// `InvalidField(ArticulatedUnitSpec)` and proves nothing about the ceiling.
    ///
    /// **It was an articulated roster, and the ceiling followed it here rather
    /// than the other way round.** `scenario_unit_ceiling` asked whether the
    /// model *was* Articulated; reseating this fixture is what showed that the
    /// question belongs to the contact solver instead. See that function.
    fn unit_roster(rows: usize) -> Scenario {
        let mut scenario = Scenario::embodied_duel();
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
    fn codec_v2_rejects_unit_row_65_before_unit_allocation() {
        let full = embodied_envelope_for(unit_roster(MAX_ARTICULATED_ENTITIES));
        let bytes = full.encode().unwrap();
        let decoded = ReplayEnvelope::decode(&bytes).unwrap();
        assert_eq!(decoded.replay.scenario.units.len(), MAX_ARTICULATED_ENTITIES);
        assert_eq!(decoded.replay.scenario, full.replay.scenario);
        assert_eq!(decoded.encode().unwrap(), bytes);

        let over = embodied_envelope_for(unit_roster(MAX_ARTICULATED_ENTITIES + 1));
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
    fn replay_decoder_rejects_every_header_and_scenario_discriminant() {
        let mut scenario = minimal_scenario("x");
        scenario.torches = vec![Torch { tx: 0, ty: 0, face: Cardinal::NegX }];
        scenario.max_ticks = 2;
        let scenario = scenario;
        let base = envelope_for(scenario, 1).encode().unwrap();
        let mut bad = base.clone();
        bad[4..6].copy_from_slice(&3u16.to_le_bytes());
        assert_eq!(decode_error(&bad), ReplayDecodeError::UnknownCodecVersion(3));
        // **The articulated schema, whatever number it currently is.** This
        // fixture is embodied, so declaring the articulated command schema over
        // it is a model mismatch rather than an unknown schema. Written through
        // the constant because the two arms below swapped numbers when the
        // payload widened -- 1 was the articulated schema and 2 was unknown;
        // now 2 is the schema and 1 is a retired one -- and a test that spells
        // them out is a test that has to be edited every time, by someone who
        // may reach for whichever edit makes it pass.
        let mut bad = base.clone();
        bad[6..8].copy_from_slice(&ARTICULATED_COMMAND_SCHEMA_RESERVED.to_le_bytes());
        assert_eq!(decode_error(&bad), ReplayDecodeError::CommandModelMismatch);
        let retired = ARTICULATED_COMMAND_SCHEMA_RESERVED - 1;
        let mut bad = base.clone();
        bad[6..8].copy_from_slice(&retired.to_le_bytes());
        assert_eq!(decode_error(&bad), ReplayDecodeError::UnknownCommandSchema(retired));
        // And `0`, which is retired in the other direction: 1 was reserved and
        // never shipped, while 0 was a real schema a decoder read a whole
        // section for. A file still carrying it has to be **refused by that
        // number** rather than parsed as one of the two surviving widths, which
        // is what the header check does now that the section is gone. Spelled as
        // a literal because the constant that named it went with the section.
        let mut bad = base.clone();
        bad[6..8].copy_from_slice(&0u16.to_le_bytes());
        assert_eq!(decode_error(&bad), ReplayDecodeError::UnknownCommandSchema(0));
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
            ReplayDecodeError::UnknownHashSchema { domain: HashDomain::EmbodiedV1, schema: 2 }
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
            // 138 and not 112: the unit record grew by its articulated row, and
            // the torch block sits past the units.
            (138, 9, ReplayField::TorchFace),
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
        let mut envelope = envelope_for(Scenario::embodied_duel(), 3);
        hold(&mut envelope.replay, 0, EntityId::new(0, 0));
        envelope.replay.record_order(0, Faction::Heroes, Order::Hold);
        envelope.replay.record_objective(0, Faction::Heroes, Objective::None);
        let base = envelope.encode().unwrap();
        // One record count; a submitted record is a thirteen-byte header and the
        // embodied payload, whose own intent tag is at 10 and first grip at 47 --
        // the shared prefix's offsets, which the swing plane was appended past.
        let command = stream_start(&base) + 4;
        let submitted_bytes = EMBODIED_COMMAND_BYTES;
        let order = command + submitted_bytes + 4;
        let objective = order + ORDER_BYTES + 4;
        let mutations = [
            (command + 13 + 10, 9u8, ReplayField::CommandIntent),
            // `CommandStrike` had no successor and is gone with the record it
            // named: a strike was a *legacy* limb verb, and a jointed arm is
            // driven by a bearing, a height, a reach and an effort with no
            // discriminant among them. The grip is the payload's tagged field
            // and takes its place here.
            (command + 13 + 47, 9, ReplayField::CommandGrip),
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
        // A `Hold` carries no target, so a non-zero one beside it is a record two
        // readers would disagree about. Payload offset 11 is the target's first
        // byte; the header before it is thirteen.
        bad[command + 13 + 11] = 1;
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

        // **On the submitted stream, where the same canonical form is checked.**
        // A `Flee` carries no target, so a non-zero target beside it is a record
        // that two readers would disagree about -- and the payload refuses it
        // structurally, before any of it reaches a world.
        let mut flee = envelope_for(Scenario::embodied_duel(), 3);
        let mut command = neutral_command();
        command.intent = Intent::Flee;
        flee.replay.record_submitted(0, EntityId::new(0, 0), SubmittedCommand::Embodied(
            crate::command::EmbodiedCommandV1::new(command)));
        let mut bad = flee.encode().unwrap();
        // The record count (4), the record header (tick, index, generation and the
        // grammar tag = 13), then the payload's own intent-target offset (11).
        let target = stream_start(&bad) + 4 + 13 + 11;
        bad[target] = 1;
        assert_eq!(
            decode_error(&bad),
            ReplayDecodeError::NonCanonicalField(ReplayField::CommandIntentTarget)
        );

        let mut regroup = envelope_for(Scenario::embodied_duel(), 3);
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
        let base = envelope_for(Scenario::embodied_duel(), 2).encode().unwrap();
        let mut bad = base.clone();
        bad[40] = 9;
        assert_eq!(
            decode_error(&bad),
            ReplayDecodeError::UnknownDiscriminant {
                field: ReplayField::CombatModel,
                value: 9,
            }
        );

        let mut with_command = envelope_for(Scenario::embodied_duel(), 2);
        hold(&mut with_command.replay, 0, EntityId::new(0, 0));
        let mut bad = with_command.encode().unwrap();
        let record = stream_start(&bad) + 4;
        // The record's thirteen-byte header, then the payload's intent-target
        // offset. A `Hold` with a target set is a record two readers disagree on.
        bad[record + 13 + 11] = 1;
        assert_eq!(
            decode_error(&bad),
            ReplayDecodeError::NonCanonicalField(ReplayField::CommandIntentTarget)
        );
    }

    #[test]
    fn replay_decoder_rejects_nonmonotonic_streams_and_records_after_the_limit() {
        let mut envelope = envelope_for(Scenario::embodied_duel(), 3);
        hold(&mut envelope.replay, 1, EntityId::new(0, 0));
        hold(&mut envelope.replay, 2, EntityId::new(1, 0));
        let base = envelope.encode().unwrap();
        // One record count, then the first record: a thirteen-byte header and a
        // fifty-seven byte embodied payload. The count used to be described as
        // "the legacy stream or the submitted one, never both", and there has
        // been one stream since the legacy grammar went.
        let first = stream_start(&base) + 4;
        let second = first + EMBODIED_COMMAND_BYTES;

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
        let mut envelope = envelope_for(Scenario::embodied_duel(), 2);
        hold(&mut envelope.replay, 0, EntityId::new(0, 0));
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
        // **The mismatch is between a retired domain and the surviving one.**
        // This wrote `ArticulatedV1` over a Legacy envelope's domain byte, and
        // then -- while the fixture was articulated -- `EmbodiedV1` over that.
        // The fixture is embodied by construction now, so `EmbodiedV1` would be
        // the no-op and the retired `ArticulatedV1` is what the header must
        // refuse. A domain byte a decoder still knows by name, over a scenario
        // that is not in it, is exactly what the tuple exists to catch.
        let mut bad = envelope_for(Scenario::embodied_duel(), 2).encode().unwrap();
        bad[8] = HashDomain::ArticulatedV1 as u8;
        assert_eq!(decode_error(&bad), ReplayDecodeError::CommandModelMismatch);
    }

    #[test]
    fn replay_decoder_rejects_a_changed_action_registry_definition() {
        let mut bad = envelope_for(Scenario::embodied_duel(), 2).encode().unwrap();
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
        let mut scenario = Scenario::embodied_duel();
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
        let base = envelope_for(Scenario::embodied_duel(), 2);
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
        let mut envelope = envelope_for(Scenario::embodied_duel(), 2);
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
        for change in 0..3 {
            let mut envelope = envelope_for(Scenario::embodied_duel(), 2);
            match change {
                // The retired schema, which is the sharpest case this tuple
                // has: an envelope declaring the legacy command grammar over a
                // scenario that is not legacy, assembled in memory rather than
                // decoded, so the header check that refuses the number on the
                // way in never sees it and the tuple is the whole of the
                // refusal. Written as `0` because the constant that named it
                // went with the record stream it declared.
                0 => envelope.command_schema = 0,
                // The mismatched values are the *retired* ones now: the envelope
                // is embodied by construction, so writing the embodied domain
                // over it changes nothing and the replay plays.
                //
                // **There were four dimensions and there are three.** The fourth
                // wrote `CombatModel::Articulated` onto the scenario, and it was
                // the one assertion in this file that needed the model as a
                // value rather than as a byte, because `validate_envelope` reads
                // a `Scenario` in memory and never a wire. With one model a
                // scenario carries no model column at all, so that was not a
                // dimension that narrowed -- it stopped being a dimension, and
                // the case is deleted rather than reseated. The wire's own model
                // tag is still refused by number, one layer down, and
                // `an_articulated_schema_replay_refuses_an_embodied_tag` is what
                // asserts it.
                1 => envelope.hash_domain = HashDomain::ArticulatedV1,
                2 => envelope.hash_schema = 2,
                _ => unreachable!(),
            }
            assert_eq!(
                play_error(&envelope),
                ReplayPlayError::Invalid(ReplayValidationError::CommandModelMismatch),
                "tuple dimension {change}",
            );
        }

        let mut envelope = envelope_for(Scenario::embodied_duel(), 2);
        envelope.replay.scenario.name = "x".repeat(MAX_SCENARIO_NAME_BYTES + 1);
        sync_fingerprint(&mut envelope);
        assert_eq!(
            play_error(&envelope),
            ReplayPlayError::Invalid(ReplayValidationError::LimitExceeded(
                ReplayLimit::ScenarioNameBytes,
            ))
        );

        let mut envelope = envelope_for(Scenario::embodied_duel(), 2);
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

        let mut envelope = envelope_for(Scenario::embodied_duel(), 2);
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

        let mut envelope = envelope_for(Scenario::embodied_duel(), 2);
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

        let mut envelope = envelope_for(Scenario::embodied_duel(), 2);
        hold(&mut envelope.replay, 1, EntityId::new(0, 0));
        hold(&mut envelope.replay, 0, EntityId::new(1, 0));
        assert_eq!(
            play_error(&envelope),
            ReplayPlayError::Invalid(ReplayValidationError::NonMonotonic {
                stream: ReplayStream::Commands,
                at: 1,
            })
        );

        let mut envelope = envelope_for(Scenario::embodied_duel(), 2);
        hold(&mut envelope.replay, 2, EntityId::new(0, 0));
        assert_eq!(
            play_error(&envelope),
            ReplayPlayError::Invalid(ReplayValidationError::RecordAfterTickLimit {
                stream: ReplayStream::Commands,
                tick: 2,
            })
        );

        // A generation the initial roster never issued. `hold` records against
        // the submitted stream, which is where the subject check now lives.
        let mut envelope = envelope_for(Scenario::embodied_duel(), 2);
        hold(&mut envelope.replay, 0, EntityId::new(0, 1));
        assert_eq!(
            play_error(&envelope),
            ReplayPlayError::Invalid(ReplayValidationError::InvalidField(
                ReplayField::CommandSubject,
            )),
            "a submitted command named a body the roster never had",
        );

        let mut envelope = envelope_for(Scenario::embodied_duel(), 2);
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
        let envelope = envelope_for(Scenario::embodied_duel(), 2);
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

