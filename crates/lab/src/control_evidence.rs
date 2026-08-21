//! Reader for the browser's ARPGCTL1 accepted-command evidence.

use crate::args::Args;
use policy::RunConfig;
use sim::{CommandV1, EntityId, Faction, HashDomain, ReplayEnvelope, SubmittedCommand,
    SubmittedCommandRecord, World, EMBODIED_COMMAND_SCHEMA, EMBODIED_PAYLOAD_BYTES,
    MAX_COMMAND_RECORDS, MAX_REPLAY_ENVELOPE_BYTES};

const HEADER: usize = 48;
const ROW: usize = 13 + EMBODIED_PAYLOAD_BYTES;
fn u16_at(bytes: &[u8], at: usize) -> u16 { u16::from_le_bytes(bytes[at..at + 2].try_into().unwrap()) }
fn u32_at(bytes: &[u8], at: usize) -> u32 { u32::from_le_bytes(bytes[at..at + 4].try_into().unwrap()) }

#[derive(Clone)]
struct Evidence { baseline: ReplayEnvelope, tick: u32, controlled: Faction,
    truncated: bool, digest: u64, rows: Vec<SubmittedCommandRecord> }

fn decode(bytes: &[u8]) -> Result<Evidence, String> {
    if bytes.len() > MAX_REPLAY_ENVELOPE_BYTES { return Err("ARPGCTL1 exceeds the replay envelope byte cap".into()); }
    if bytes.len() < HEADER || &bytes[..8] != b"ARPGCTL1" { return Err("ARPGCTL1 magic or header is missing".into()); }
    if u16_at(bytes, 8) != EMBODIED_COMMAND_SCHEMA || bytes[10] != 2 || bytes[11] != 0
        || usize::from(u16_at(bytes, 12)) != ROW || usize::from(u16_at(bytes, 14)) != EMBODIED_PAYLOAD_BYTES
        || u16_at(bytes, 16) != sim::EMBODIED_COMMAND_LAYOUT_VERSION || u16_at(bytes, 18) != 0
        || bytes[35] != 0 || u16_at(bytes, 38) != 0 {
        return Err("ARPGCTL1 command grammar or reserved fields are not version 1".into());
    }
    if bytes[33] & !1 != 0 || bytes[34] != HashDomain::EmbodiedV1 as u8 || u16_at(bytes, 36) != 1 {
        return Err("ARPGCTL1 flags or typed state-digest grammar are unknown".into());
    }
    let baseline_len = u32_at(bytes, 20) as usize;
    let tick = u32_at(bytes, 24);
    let count = u32_at(bytes, 28) as usize;
    if count > MAX_COMMAND_RECORDS || count > (tick as usize).saturating_mul(2) {
        return Err("ARPGCTL1 accepted-command count exceeds two rows per tick".into());
    }
    let expected = HEADER.checked_add(baseline_len)
        .and_then(|n| n.checked_add(count.checked_mul(ROW)?))
        .ok_or_else(|| "ARPGCTL1 length overflow".to_string())?;
    if expected != bytes.len() { return Err("ARPGCTL1 length does not reach exact EOF".into()); }
    let baseline = ReplayEnvelope::decode(&bytes[HEADER..HEADER + baseline_len])
        .map_err(|e| format!("ARPGCTL1 baseline replay was refused: {e:?}"))?;
    if baseline.tick_limit != 0 || baseline.replay.ticks != 0 || !baseline.replay.submitted_entries.is_empty() {
        return Err("ARPGCTL1 baseline is not a zero-tick replay with no commands".into());
    }
    let defaults = RunConfig::default().orders;
    if baseline.replay.orders.len() != 2 || baseline.replay.objectives.len() != 2
        || baseline.replay.orders[0].tick != 0 || baseline.replay.orders[0].faction != Faction::Heroes
        || baseline.replay.orders[0].order != defaults[0] || baseline.replay.orders[1].tick != 0
        || baseline.replay.orders[1].faction != Faction::Monsters || baseline.replay.orders[1].order != defaults[1]
        || baseline.replay.objectives[0].tick != 0 || baseline.replay.objectives[0].faction != Faction::Heroes
        || baseline.replay.objectives[0].objective != sim::Objective::None
        || baseline.replay.objectives[1].tick != 0 || baseline.replay.objectives[1].faction != Faction::Monsters
        || baseline.replay.objectives[1].objective != sim::Objective::None {
        return Err("ARPGCTL1 baseline does not carry the arena's exact orders and objectives".into());
    }
    let controlled = match bytes[32] { 0 => Faction::Heroes, 1 => Faction::Monsters,
        v => return Err(format!("ARPGCTL1 controlled faction {v} is unknown")) };
    let mut rows = Vec::with_capacity(count);
    let mut previous = 0;
    let mut same_tick = 0;
    for index in 0..count {
        let at = HEADER + baseline_len + index * ROW;
        let row_tick = u32_at(bytes, at);
        if row_tick >= tick || (index > 0 && row_tick < previous) {
            return Err("ARPGCTL1 command ticks are not monotonic inside the recorded horizon".into());
        }
        same_tick = if index > 0 && row_tick == previous { same_tick + 1 } else { 1 };
        if same_tick > 2 { return Err(format!("ARPGCTL1 tick {row_tick} carries more than two accepted commands")); }
        let entity = EntityId::new(u32_at(bytes, at + 4), u32_at(bytes, at + 8));
        if bytes[at + 12] != 2 || entity.generation != 0 || entity.index as usize >= baseline.replay.scenario.units.len() {
            return Err("ARPGCTL1 command kind or initial-roster identity is invalid".into());
        }
        let payload: &[u8; EMBODIED_PAYLOAD_BYTES] = bytes[at + 13..at + ROW].try_into().unwrap();
        let command = CommandV1::from_payload_bytes(payload)
            .map_err(|e| format!("ARPGCTL1 command payload was refused: {e:?}"))?;
        rows.push(SubmittedCommandRecord { tick: row_tick, entity,
            command: SubmittedCommand::Embodied(command) });
        previous = row_tick;
    }
    let controlled_index = baseline.replay.scenario.units.iter().position(|u| u.faction == controlled)
        .ok_or_else(|| "ARPGCTL1 controlled faction has no initial body".to_string())? as u32;
    for expected_tick in 0..tick {
        if !rows.iter().any(|r| r.tick == expected_tick && r.entity.index == controlled_index) {
            return Err(format!("ARPGCTL1 is missing the controlled command at tick {expected_tick}"));
        }
    }
    Ok(Evidence { baseline, tick, controlled, truncated: bytes[33] & 1 != 0,
        digest: u64::from(u32_at(bytes, 40)) | (u64::from(u32_at(bytes, 44)) << 32), rows })
}

fn envelope(e: &Evidence, rows: Vec<SubmittedCommandRecord>) -> ReplayEnvelope {
    let mut out = e.baseline.clone(); out.tick_limit = e.tick; out.replay.ticks = e.tick;
    out.replay.submitted_entries = rows; out
}

pub fn run(args: &Args) -> Result<(), String> {
    let path = args.text("in").ok_or_else(|| "control-evidence requires --in PATH".to_string())?;
    let bytes = std::fs::read(path).map_err(|e| format!("{path} could not be read: {e}"))?;
    let evidence = decode(&bytes)?;
    let full = envelope(&evidence, evidence.rows.clone());
    let full_bytes = full.encode().map_err(|e| format!("full replay was refused: {e:?}"))?;
    let full_world = full.play().map_err(|e| format!("full replay could not play: {e:?}"))?;
    let full_digest = full_world.state_digest();
    if full_digest.domain != HashDomain::EmbodiedV1 || full_digest.schema != 1 || full_digest.value != evidence.digest {
        return Err(format!("full replay diverged from browser digest: browser 0x{:016x}, replay 0x{:016x}", evidence.digest, full_digest.value));
    }
    let controlled = evidence.baseline.replay.scenario.units.iter().position(|u| u.faction == evidence.controlled).unwrap() as u32;
    let initial = World::new(&evidence.baseline.replay.scenario, evidence.baseline.seed);
    let period = u32::from(initial.stats(EntityId::new(controlled, 0))
        .ok_or_else(|| "controlled body has no stats".to_string())?.decision_period().max(1));
    let thinned_rows = evidence.rows.iter().copied()
        .filter(|r| r.entity.index != controlled || r.tick % period == 0).collect::<Vec<_>>();
    let thinned = envelope(&evidence, thinned_rows);
    let thinned_bytes = thinned.encode().map_err(|e| format!("thinned replay was refused: {e:?}"))?;
    let thinned_world = thinned.play().map_err(|e| format!("thinned replay could not play: {e:?}"))?;
    if let Some(path) = args.text("full-out") { std::fs::write(path, &full_bytes).map_err(|e| format!("{path} could not be written: {e}"))?; }
    if let Some(path) = args.text("thinned-out") { std::fs::write(path, &thinned_bytes).map_err(|e| format!("{path} could not be written: {e}"))?; }
    println!("ARPGCTL1 {:?} tick horizon {}{}", evidence.controlled, evidence.tick,
        if evidence.truncated { " (truncated evidence)" } else { "" });
    println!("full    records {} digest 0x{:016x} outcome {:?}", evidence.rows.len(), full_digest.value, full_world.outcome());
    println!("thinned records {} period {} digest 0x{:016x} outcome {:?}", thinned.replay.submitted_entries.len(), period, thinned_world.state_digest().value, thinned_world.outcome());
    Ok(())
}

#[cfg(test)]
mod tests { use super::*; #[test] fn arpgctl1_rows_are_codec_exact() { assert_eq!((HEADER, ROW, EMBODIED_PAYLOAD_BYTES), (48, 70, 57)); } }
