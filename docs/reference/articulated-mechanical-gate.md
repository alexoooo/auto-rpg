# Articulated mechanical gate

**Purpose:** Freeze the pin fixture, scripted commands, paired metrics, worker join, evidence schema, and visible review for v2-17.
**Status:** proposed
**Canonical source:** `crates/policy/src/articulated_script.rs`, `crates/lab/src/main.rs`, and the committed evidence record after v2-17 lands
**Update when:** The fixture, script phase, mirror, digest byte, denominator, threshold, worker message, artifact, or pin path changes.

## Canonical fixture and stop rule

`Scenario::articulated_duel()` is named `articulated-duel-v1`, uses
`Dungeon::open(24,16)`, has no portal/torches, and has `max_ticks=3_600`. The Fighter
is Heroes at `(7,6)`, body yaw raw zero, with Fighter anatomy, sword right, shield
left. The Brute is Monsters at `(17,10)`, body yaw raw `32_768`, with Brute anatomy and
the right-bound club and an empty left arm. Feet facing equals initial body yaw. Every anatomy field starts
at its documented maximum; actuator state uses the v2-13 spawn defaults. The scenario
uses `CombatModel::Articulated` and complete schema-1 immutable definitions.

A run uses seed `s`, answers every pending decision in ascending full identity with
one fresh `ScriptedArticulatedPolicy` per faction, calls `World::step`, and stops at
the first non-`None` outcome or immediately after tick 3,600. It records the typed
`StateDigest` domain/schema/value tuple at that exact stop. The canonical pin run is
seed zero, original orientation.

## Script semantics and digest

All bearings below are absolute world bearings under the submitted-command V1
contract. `toward` is the fixed-point angle from subject body position to the selected
nearest visible opponent, retaining current yaw if none is visible. Grips are always
Keep. An arm not named by an action tucks at body yaw, MID, reach 1/4, and effort
zero. Move directions are normalized-or-zero world XY.
Attack intent names the selected opponent's full identity; every Hold intent uses the
canonical zero target payload.

The selected height is `[LOW,MID,HIGH][(tick / 90) % 3]`. Cut direction alternates
by 360-tick cycle: even cycles are left cuts, odd cycles right cuts. The exact twelve
30-tick phases of `tick % 360` are:

| phase | ticks | command |
|---:|---:|---|
| 0 | 0..29 | Approach: move toward at magnitude one; yaw toward; guard selected height, reach 1/2, effort 1/2 |
| 1 | 30..59 | Approach with the same guard |
| 2 | 60..89 | Hold feet; yaw toward; guard selected height, reach 1/2, effort 3/4 |
| 3 | 90..119 | Cut chamber: attack intent; weapon bearing toward minus/plus 1/8 turn for left/right, reach 3/4, effort 1 |
| 4 | 120..149 | Cut commit: weapon bearing toward plus/minus 1/8 turn, reach 1, effort 1 |
| 5 | 150..179 | Rest: hold, weapon reach 1/4, effort zero; shield remains guard at effort 1/2 |
| 6 | 180..209 | Guard at the next height `(height_index+1)%3`, reach 3/4, effort 1 |
| 7 | 210..239 | Thrust chamber: attack, weapon bearing toward, reach 1/4, effort 1 |
| 8 | 240..269 | Thrust commit: attack, weapon bearing toward, reach 1, effort 1 |
| 9 | 270..299 | Withdraw: move directly away at magnitude 1/2, yaw toward, effort zero |
| 10 | 300..329 | Turn: hold feet, target yaw `toward + 1/8 turn`, guard selected height |
| 11 | 330..359 | Reface/rest: hold feet, yaw toward, reach 1/4, effort zero |

“Guard” is Hold intent. It uses the shield arm when a shield is bound and otherwise
the weapon arm, setting bearing to `toward` and the named height/reach/effort. Thus a
Fighter guards with its left shield and tucks its right sword; a Brute guards with its
right club and tucks its empty left arm. Cut/thrust phases alone use Attack with the
selected identity. If no opponent is visible, attack
phases become Hold/rest without inventing geometry. The Dev intermediate action is
Guard with height raw `24_576`; it is not part of this scripted digest.

The command-stream digest is FNV-1a-64 prefixed by ASCII `ARPG-SCRIPT-V1`. For each
accepted or safe-fallback stored command feed little-endian tick, subject index,
subject generation, then the canonical 51-byte articulated payload from
[`articulated-command-v1.md`](articulated-command-v1.md#canonical-51-byte-articulated-payload).
Include the record count as a final `u32`. This digest always describes one run's
stored command stream; the evidence fixture's `scriptDigest` is specifically the
canonical seed-zero/original run, not a source-code digest. Replay evidence is a
second FNV-1a-64 digest prefixed by ASCII `ARPG-REPLAY-EVIDENCE-V1`, followed by the
exact codec-V2 replay bytes and no length or terminator.

## Mirror and denominators

The spatial mirror is reflection across `y=8`, which preserves the faction-derived
spawn yaws without adding another scenario field:

```text
position' = (x, 16 - y)
vector' = (x, -y)
angle' = 0 - angle (wrapping u16)
point/normal use the same Y reflection; X and Z are unchanged
```

Identity, faction, body/spec, decision timing, seed, and policy are not swapped. Thus
each seed contributes one original and one mirror and measures north/south geometry,
not Fighter/Brute balance. “Side advantage” is the absolute difference between
Fighter win counts in the 400 original and 400 mirrored runs divided by 400.

There are exactly 800 primary trials. Tick-limit outcomes must be at most 79
(`79/800 < 10%`). The absolute original/mirror Fighter-win count difference must be
at most 20 (`20/400 = 5 percentage points`). Mutual destruction is decisive, not a
tick-limit outcome, and is not credited as a Fighter win.

## Coverage and invariant thresholds

Aggregate only the 800 primary trials. A contact counts in LOW, MID, or HIGH from the
contacting arm's accepted `ArmTarget.height` on that tick, and only when it equals the
raw constant exactly; intermediate values enter no bucket. The counting unit is one
event row `(tick, contact_group_ordinal, ContactKey)`: deduplicate only duplicate
copies within that group, never recurring contacts across ticks/groups. All minima
are inclusive:

| evidence | minimum |
|---|---:|
| weapon/body contact at LOW, MID, HIGH | 8 each |
| contacts naming left and right limb slots | 8 each |
| positive cut channel / positive thrust channel | 16 each |
| weapon/weapon parry groups | 8 |
| weapon/shield deflections | 8 |
| distinct contacted anatomy families | 3, each with at least 8 contacts |
| ticks with living leg fraction below one | 30 |
| ticks with living shock above zero | 30 |
| severance events | 2 |

Anatomy families are Head, Torso, Arms (left/right combined), and Legs. Across every
primary tick, `max(0, ledger.after-ledger.before)` must be exactly raw zero, stream
digest equality must hold, and `contact_cap_hits` must be zero. The dedicated cap
fixture is excluded from that last aggregate and must increment exactly once.

## Windmill comparison

Run original and mirrored seeds `0..99` for both policies, 200 paired trials per
policy. “Windmill” alternates cut commit endpoints every 30 ticks at effort one,
never chambers, guards, withdraws, or rests, and otherwise uses the same target/yaw
and grips. “Composed” is the canonical script above.

For each policy, `damage` is the checked `u128` sum of the final raw existing
`World::damage_dealt(Heroes)` and `World::damage_dealt(Monsters)` columns over all 200
trials. `work` is the checked `u128` sum over both arms, both entities, and every tick
of the actuator contract's positive pre-fatigue `work.raw` term
(`inertia * inertia * effort * sum(abs(delta scalar speed))`), before division by
`FATIGUE_WORK_SCALE_RAW`; a lab-only `ActuatorWorkLedger` exposes that derived term
and enters neither state nor hashing. Compute `efficiency = damage/work` once from
the corpus sums. Composed
must have at least `6/5` of windmill efficiency. Its tick-limit count may exceed the
windmill count by at most 10 (five percentage points). Both corpora require zero
energy creation and zero cap hits. A zero windmill work denominator is a test failure,
not infinite composed efficiency. Compare the ratio without division in checked
`u128`: `5*composed_damage*windmill_work >=
6*windmill_damage*composed_work`; checked overflow is a failed measurement.

## Named recorded fixtures

Commit canonical replay bytes under `fixtures/articulated/` and one evidence row for
each ID. Fixtures use the canonical dungeon/specs unless the delta column says
otherwise. `F@(x,y)` and `B@(x,y)` replace spawn positions; faction-derived yaws stay
zero/HALF. Before every tick the fixture driver submits both commands in identity
order regardless of decision clock, records the accepted values, steps once, and
stops after the listed number of steps without outcome early-stop.

The command DSL is exact. `Z(a)` is `(bearing=a,height=MID,reach=1/4,effort=0)`.
`FG(h)` is Fighter Hold/move zero/yaw zero, left `(0,h,3/4,1)`, right `Z(0)`.
`FE(h)` is Fighter Hold/move zero/yaw zero, left `Z(0)`, right `(0,h,1,0)`.
`FC(h,s)` is Fighter Attack(B), move zero/yaw zero, left `Z(0)`, right
`(s/8 turn,h,1,1)`. `FT(h)` is the same with right `(0,h,1,1)`. `BH` is Brute
Hold/move zero/yaw HALF, left `Z(HALF)`, right `(HALF,MID,1/4,0)`. `BT(h,m)` is
Brute Attack(F), move `m`, yaw HALF, left `Z(HALF)`, right `(HALF,h,1,1)`.
`BC(h,s)` changes that right bearing to `HALF+s/8 turn`. All grips Keep; Hold has
canonical zero target. A range `a..b:X/Y` includes both endpoints and submits Fighter
X, Brute Y. Fractions are exact `Fx::from_ratio`; angle names are raw constants.

| ID / seed / stop | exact initial delta and command ranges | exact predicate |
|---|---|---|
| `stationary-edge`, 1000, 60 | `F@(10,8), B@(23/2,8)`; `0..59:FE(MID)/BH` | `count(WeaponBody)>=1 && sum(cut.raw)==0` |
| `braced-point`, 1001, 60 | same positions; `0..59:FE(MID)/BT(MID,(-1,0))` | some WeaponBody row has `thrust.raw>0` and Fighter sword point velocity is zero |
| `shield-height`, 1002, 180 | `F@(10,8), B@(12,8)`; `0..59:FG(MID)/BT(MID,(-1,0))`, `60..119:FG(LOW)/BT(HIGH,(1,0))`, `120..179:FG(LOW)/BT(HIGH,(-1,0))` | matching-height WeaponShield has `deflected>0`; mismatched attack has WeaponBody and no WeaponShield row |
| `intermediate-height`, 1003, 120 | `F@(10,8), B@(12,8)`; `0..119:FT(24576)/BH` | every accepted/applied right target retains raw 24,576 and at least one joined WeaponBody row uses it |
| `turn-shield`, 1004, 120 | `F@(8,8), B@(18,8)`; `0..119:FG(MID) with yaw QUARTER/BH` | Fighter XY unchanged, yaw nonzero, final shield normal differs from tick zero |
| `sequential-simultaneous`, 1005, 120 | `F@(10,8), B@(12,8)`; `0..59:FC(MID,-1)/BC(MID,+1)`, `60..119:FC(MID,+1)/BC(MID,-1)` | one tick has two increasing group ordinals and one ordinal has at least two distinct keys |
| `parry-transfer`, 1006, 90 | same positions; `0..89:FC(MID,+1)/BC(MID,-1)` | WeaponWeapon exists and both owning arm velocities have nonzero pre/post delta |
| `armor-incidence`, 1007, 180 | Brute torso armor coverage/hardness/absorption one; `F@(10,8), B@(12,8)`; `0..89:FT(MID)/BH`, `90..179:FC(MID,+1)/BH` | chosen grazing torso row deflection exceeds chosen square row and both energy excesses are zero |
| `arm-severance`, 1008, 180 | Fighter left/right integrity maxima raw 1; `F@(10,8), B@(12,8)`; `0..89:FG(MID)/BC(MID,+1)`, `90..179:FE(MID)/BC(MID,-1)` | both arm severance bits occur and each binding is absent on the next re-sweep |
| `leg-shock`, 1009, 180 | Fighter leg maximum raw 1; `F@(10,8), B@(12,8)`; `0..89:FG(LOW)/BT(LOW,(-1,0))`; `90..179` Fighter Hold requests move `(1,0)`, Brute BH | requested direction stays `(1,0)`, applied acceleration is below an uninjured control, shock becomes positive then decreases |
| `mutual-fatal`, 1010, 120 | both torso and blood maxima raw 1; `F@(10,8), B@(12,8)`; `0..119:FT(MID)/BT(MID,(-1,0))` | one group makes both torso integrities zero and outcome is MutualDestruction |
| `contact-cap`, 1011, 1 | `F@(10,8), B@(12,8)`; both UnitSpec loadouts are `[Sword,Sword]`; equipment IDs are Fighter `[101,102]`, Brute `[103,104]`. Every row is schema 1, ActionKind Sword, mass 1, balance 1/2, Segment length 2/radius 1/100, surface restitution 1/friction 0/edge 0/point 1/material Steel; odd ID binding Left, even ID Right. Tick-zero Fighter bearings are `-1/8,+1/8`, Brute `HALF+1/8,HALF-1/8`, all MID/reach 1/effort 1, move zero, Attack(other), Keep | `cap_hits` changes 0→1, involved end poses equal last-safe poses, and every remaining pair's signed separation at the stored pose is nonnegative |

Fixture generation fails if any predicate is false and never records expected bytes
from a failing run. The committed replay plus SHA-256 is authority; tests regenerate
commands from this table and require byte equality, so expectations are not derived
from the implementation under test.

## Worker integration

`WORKER_PROTOCOL_VERSION` becomes `2`. The host continues to accept exact V1 sessions
as legacy-only and returns the old V1 message/snapshot shape and old buffer capacity
for their lifetime. A V2 `InitMessage` has optional `combatModel:0|1`; omission means
Legacy `0`. Reset preserves protocol version and initialized model.
V2 `CommandMessage.command` is a union of
the existing legacy command and `{kind:"articulated", subjectIndex, subjectGeneration,
payload:ArrayBuffer}`. Payload byte length is exactly 55 and transfers to the worker;
bytes 0..1 are the sole layout field. Model, inner layout, reserved byte, canonical
payload, and full subject identity are validated before acceptance into the target-tick
queue. Rejections use the normal
`commandAck` with reasons `wrongModel`, `unknownLayout`, or
`invalidArticulatedCommand`; old epoch, late tick, ordering, and queue rules remain
unchanged. Applied acknowledgement includes numeric `commandReject` when the sim
stored a safe fallback.

The generated V2 snapshot capacity appends pose and combat-event blocks after the current
furniture block, using `align4(n)=(n+3)&!3`:

```text
POSE_OFFSET = align4(FURNITURE_OFFSET + FURNITURE_MAX*FURNITURE_STRIDE)
COMBAT_EVENT_OFFSET = POSE_OFFSET + MAX_POSES*POSE_STRIDE*4
SNAPSHOT_BUFFER_BYTES = COMBAT_EVENT_OFFSET
                      + MAX_COMBAT_EVENTS*COMBAT_EVENT_STRIDE*4
```

Against the accepted V1 base ABI (`FURNITURE_OFFSET=25_404`,
`FURNITURE_MAX=512`, `FURNITURE_STRIDE=4` bytes), these evaluate exactly to
`POSE_OFFSET=27_452`, `COMBAT_EVENT_OFFSET=44_348`, and
`SNAPSHOT_BUFFER_BYTES=77_116`. Generation asserts both the formula and these input
base constants; a prior legacy ABI change requires updating this reference rather
than silently retaining stale numeric offsets.

Snapshot metadata fields are `poseLength`, `posesDropped`, `combatEventLength`, and
`combatEventsDropped`; lengths count rows. Shape validation checks the generated
strides/capacities and exact buffer byte length before exposing a view.
The worker copies only pose identities visible to the subject and drops an event if
either non-`NONE` identity is absent from that filtered set. It then transfers one
complete lease under the existing epoch/pool/coalescing rules. Legacy mode publishes
zero new lengths and byte-identical legacy sections in a V2-capacity buffer; an
accepted V1 session instead publishes the exact old capacity and no new metadata.
Visibility removal does not
increment authoritative overflow drop counts. Tests cover wrong model/layout,
short/long payload, stale identity, late tick, old epoch, reset, three checked-out
buffers, filtering, and maximum-capacity offsets.

This deliberately drops a lethal contact once its participant has no live pose;
combat-event layout V1 has no event-time visibility word, and retaining it from identity alone would disclose
a hidden death. The mechanical evidence still records that event inside the trusted
native/wasm stream before worker filtering. Death presentation is actor disappearance;
adding a visible lethal-contact effect later requires a versioned event-time
disclosure field rather than a previous-frame visibility guess.

## Evidence JSON and visible review

`docs/performance/evidence/v2-articulated-gate.json` is UTF-8 JSON with sorted keys
and this required shape:

```json
{
  "schema": 1,
  "command": "cargo run --release -p lab -- articulated --seeds 400 --mirrored --record",
  "sourceCommit": "40 lowercase hex",
  "fixture": { "name": "articulated-duel-v1", "scenarioFingerprint": "16 hex", "combatSpecSchema": 1, "replayCodecVersion": 2, "hashDomain": "ArticulatedV1", "hashSchema": 1, "scriptDigest": "16 hex" },
  "primary": { "seeds": 400, "trials": 800, "tickLimits": 0, "fighterWinsOriginal": 0, "fighterWinsMirrored": 0, "mutualDestructions": 0, "coverage": {}, "maxEnergyExcessRaw": 0, "contactCapHits": 0 },
  "windmill": { "seeds": 100, "trialsPerPolicy": 200, "composedDamageRaw": "decimal", "composedWorkRaw": "decimal", "windmillDamageRaw": "decimal", "windmillWorkRaw": "decimal", "composedTickLimits": 0, "windmillTickLimits": 0 },
  "pin": { "seed": 0, "replayPath": "fixtures/articulated/articulated-duel-v1-seed-0.replay", "replaySha256": "64 hex", "finalTick": 0, "stateDomain": "ArticulatedV1", "stateSchema": 1, "stateValue": "16 hex", "replayDigest": "16 hex", "poseDigest": "16 hex", "eventDigest": "16 hex" },
  "fixtures": [],
  "automatedResult": "pass|revise|stop",
  "visibleResult": "pending|pass|revise|stop",
  "result": "pending|pass|revise|stop"
}
```

Coverage uses the exact table keys and integer counts. Each fixture row contains ID,
seed, replay path/SHA-256, script/replay/state/pose/event 16-hex digests, cap hits,
replay codec version `2`, hash domain/schema, maximum energy excess raw, and boolean
predicate result. Decimal strings hold summed
raw values that may exceed JavaScript's safe integer. The lab writer sets
`automatedResult`, leaves `visibleResult` and final `result` pending, and writes sorted
keys. The foreground review update copies its verdict into `visibleResult`; final
result is pass only when both components pass, otherwise revise/stop by the harsher
verdict.

`sourceCommit` is the clean mechanics commit checked out for the run, immediately
before evidence artifacts are added; it is not the later commit containing this JSON.

Visible review uses 15 two-second 60-fps WebM clips: three each for `guard-height`,
`committed-attack`, `parry-deflection`, `arm-loss`, and `leg-impairment`. Store them
under `docs/performance/evidence/v2-articulated-review/` with shuffled numeric names,
plus a same-tick overlay PNG for each. A manifest records SHA-256, seed, tick range,
hidden truth label, and overlay tick. The reviewer sees clips with labels/debug off
and records one of the five labels before opening truth. Commit
`docs/performance/evidence/v2-articulated-review.md` with browser/GPU, foreground
visibility confirmation, answers, per-label/overall score, overlay identity/region/
height/normal/severance checks, and `pass|revise|stop`. Pass is at least 12/15 overall,
at least 2/3 per label, and zero overlay disagreements.

## Pin proof

The canonical replay path is
`fixtures/articulated/articulated-duel-v1-seed-0.replay`; evidence pins its SHA-256.
`crates/sim/tests/determinism.rs` decodes `include_bytes!` for that path, verifies
codec version 2 and the scenario fingerprint, replays stored commands without linking
policy, and compares the resulting ArticulatedV1 StateDigest domain, schema, and value.
`crates/web` includes the same bytes and exports its 32 raw SHA-256 bytes through
`articulated_golden_replay_sha256_ptr/len`, plus `articulated_hash_domain()`,
`articulated_hash_schema()`, `articulated_hash_lo()`, and `articulated_hash_hi()`;
`tools/wasm_check.js` verifies the bytes' SHA-256 and all three tuple fields. The
native direct run, native replay, and wasm replay must be equal before the value enters
the two code pins and [`hashes.md`](hashes.md#golden-registry).
