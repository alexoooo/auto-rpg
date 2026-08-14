# Smart AI 117 -- expose the controlled Robust Strike Arena preset

**Status:** complete as a feature-only demonstration; standard production promotion
is withheld. The named controlled preset reproduces ordinal 3144 through its
first qualifying contact with zero rejection: raw event tick 52, published frame 53,
54 frames total from `maxTicks=53`, energy `346 -> 68`, dissipation 278 and cut 133.
The source-41 corpus also stops when that qualifying contact is observed; continuing
to ticks 54--56 is not stronger evidence and introduces a later rejection. This is
not a generalized Tactical default. Smart118 owns visible verification only.

The overnight receipt originally called the feature artifact "shipped" because
`npm run test:wasm-memory` passed before `npm run build`. That order was load-bearing:
the memory test reads the artifact already on disk and does not build or identify its
mode, so it had tested the preceding default artifact. A fresh feature build later
showed that its compatibility clinch never reaches the legacy cap, one picker-valid
two-Brute configuration exceeds the exact lattice envelope, and the old learned
death fixture times out. The preset remains valid evidence, but `npm run dev` and
`npm run build` remain on default mechanics until Smart122--124 close authority and
the feature browser boundary has mode-correct fixtures and named refusals.

## A -- one exact preset, no search or policy retune

Add `Robust Strike (controlled)` beside the existing Arena picker in
[`client/src/arena/arena.ts`](../../client/src/arena/arena.ts), with its pure config
constructor in
[`client/src/runtime/arena-config.ts`](../../client/src/runtime/arena-config.ts).
It writes the existing 120-byte Arena configuration, layout version 1, with no new
field or policy code:

```text
seed/max ticks       0 / 53
hero                 Fighter, policy Tactical code 5
hero spawn raw       (622592,458752) = (9.5,7)
hero left            shipped shield
hero right           sword mass/balance shipped, length 131072, radius 2621
monster              Brute, policy Neutral code 0
monster spawn raw    (786432,524288) = (12,8)
monster hands        shipped loadout (left empty, right club)
target/body part     monster Legs
schedule             28 chamber commands, then up to 28 strike commands;
                     stop immediately after the qualifying contact
chamber reach        65536
strike reach         61440
effort               65536
bearing              declared spawn offset, minus then plus one eighth turn
```

Those are Smart101's canonical ordinal-3144 case: Brute, offset
`(-163840,-65536)`, worst physical dissipation 278. The sword length/radius and fixed
Legs height come from the exact source-41 grammar in
[`crates/lab/src/strong_strike.rs`](../../crates/lab/src/strong_strike.rs); do not use
the picker's shipped 0.95-unit sword or an observed/noisy bearing.

The 56-tick grammar remains the predeclared schedule, but this controlled measurement
runs only through the first qualifying contact. `contact_tick=Some(53)` in the central
corpus is the observation after integrating raw event tick 52. The Arena therefore
uses `maxTicks=53` and publishes frames `0..=53`. `maxTicks=54` was tested and still
admits one later rejection; the earlier read-only `54` recommendation is superseded.
This is not a weakened acceptance rule: the source-41 measurement loop itself breaks
on the first qualifying contact and never used post-contact ticks to select the row.

Implement a constructor on
[`TacticalArticulatedPolicy`](../../crates/policy/src/articulated_tactics.rs), named
for the controlled robust-strike schedule. It remains policy code 5 but carries a
private bounded preset state: declared target id, attacking `RightArm`, fixed Legs
height and phase tick `0..56`. It submits through the ordinary
`ArticulatedCommandV1` seam and delegates no command to Lab. The web factory in
[`crates/web/src/lib.rs`](../../crates/web/src/lib.rs) may select that constructor
only when the complete canonical preset bytes above match; every ordinary code-5
configuration still constructs `TacticalArticulatedPolicy::default()`. Match all
fields, including both equipment rows and reserved zeros, so a merely similar custom
fight cannot silently acquire scripted behavior.

This narrowly controlled constructor is not a solver or policy retune. It extracts
the already-frozen source-41 command grammar into policy and makes its controlled
preconditions visible. Do not change ordinary Tactical target scoring, approach,
guard, recovery, solver bounds, damage law or the generalized competence threshold.

## B -- exact Rust boundary and combat outcome

Share one schedule helper between Lab's source-41 fixture and the controlled policy,
owned by `crates/policy/src/articulated_tactics.rs`; Lab supplies the declared offset
and observed Legs height and must remain byte-equal. Add:

```rust
#[test] fn robust_strike_preset_is_exactly_source_41_ordinal_3144() {}
#[test] fn robust_strike_preset_submits_twenty_eight_chamber_then_twenty_eight_strike_words() {}
#[test] fn robust_strike_preset_targets_brute_legs_through_tactical_code_five() {}
#[test] fn a_nearby_arena_config_uses_ordinary_tactical_instead_of_the_preset() {}
#[test] fn robust_strike_arena_publishes_the_attributed_event_and_matching_damage() {}
```

The first compares all 120 config bytes and all 53 attacker/neutral-defender commands
through the qualifying event against a direct source-41 run. The second freezes the
28-tick phase boundary and exact bearing/height/reach/effort words while proving the
underlying schedule remains defined for up to 56 ticks. The event test drives the
existing `arena_start` / `arena_step` / combat-event / region publication seam and
requires one uniquely attributed hero-right-sword to Brute-body resolution in Legs,
nonzero energy dissipation, nonzero cut or thrust, and matching positive Legs
integrity loss. Also require zero command refusals, zero solver rejections and no
energy increase. This is post-selection outcome verification; damage did not select
ordinal 3144.

Mutate one config byte, phase length, reach, bearing source, target region, Tactical
code, defender command, event attribution and damage-region join independently; the
named test must go red each time, then be restored.

```powershell
cargo test -p policy robust_strike_preset -- --nocapture
cargo test -p lab --features cartesian-recoil ordinal_3144 -- --nocapture
cargo test -p web --features cartesian-recoil robust_strike_arena -- --nocapture
cargo test --workspace --features cartesian-recoil
```

## C -- UI contract and feature build

The preset control must say `controlled`, `Tactical code 5`, `neutral Brute`, `Legs`,
and `28 + 28 command schedule`, while naming the certified stop at frame 53; it must
not say default, competent, 95/100 or autonomous duel.
Selecting it fills/locks the exact displayed loadout and spawn summary, while
`Custom fight` returns to all existing controls and `composed/composed`. The Worker
remains lazy until **Run selected fight**. Extend
[`client/test/studio-shell.test.mjs`](../../client/test/studio-shell.test.mjs) and the
existing worker tests:

```js
test("robust strike is an explicit controlled preset with exact ordinal 3144 bytes", async () => {});
test("robust strike stays lazy and records tactical code five against neutral", async () => {});
test("robust strike joins its legs event to the published integrity loss", async () => {});
test("leaving the preset restores the ordinary composed arena", async () => {});
```

Build the feature acceptance wasm explicitly with `cartesian-recoil`; `npm run dev`
and `npm run build` remain default while the feature is not authoritative.
`npm run view` remains build-free. This is a build-mode distinction, not a runtime
mechanics toggle. Record feature artifact sizes and SHA-256 as receipts without
calling them production artifacts.

```powershell
npm run check
node --test client/test/studio-shell.test.mjs
npm run test:worker
npm run test:wasm-memory
npm run check:abi
npm run build
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
$env:ARPG_CARTESIAN_RECOIL='1'
node --test tools/wasm_check.js
Remove-Item Env:ARPG_CARTESIAN_RECOIL
node tools/check_docs.js
git diff --check
```

The existing 120-byte layout, frame/pose/region/event layouts, trace schema and policy
codes do not move. Existing registered pins are budgeted zero; the feature wasm
receipt must agree with native but remains unregistered unless a separate pre-code
pin-ownership plan says otherwise. Any config mismatch, ordinary-Tactical behavior
change, missing/ambiguous event, wrong region, zero damage channel, refusal, solver
rejection, existing-pin movement or target disagreement stops before Smart118.

## Completed feature-only receipt

The controlled configuration fingerprints to `0x82012ef80cd9be11`. At
`maxTicks=53`, its raw WeaponBody event is tick 52, the UI publication is frame/tick
53, and the recording contains 54 frames. The attributed right-sword-to-Brute-Legs
row has group energy `346 -> 68`, dissipation/share 278, cut 133, thrust 0, pressure
145 and zero solver rejection. The complete feature workspace log
`target/smart117-feature-final.log` is 124,970 bytes with SHA-256
`0F55C04D4F37D54D13685E5905F94A0F7C1E4FB01EE9E3201B2E12182AFDE40F`.
The feature artifacts used for browser acceptance were `dist/index.html`, 20,840
bytes, SHA-256
`8520AB4B30F51D2176A9C21B04A31D3BFDEE93EF3E53F9A0F5965AD30F638386`, and
`dist/web.wasm`, 986,144 bytes, SHA-256
`A1C99043468EEE05CAF0F2BA1B1A4E4AEE2122C59BFFE461B914443E68580663`.
The same feature artifact then passed all 28 tests in `tools/wasm_check.js` with
zero skips. That equality suite remains valid feature evidence; it does not repair
the mode-mismatched memory-test receipt described above. Feature mode changed only
the native command witness to
`0x5fcaba34556b2737` and the stream witness to `0xa6835666303601d2`; the other
26 checks, including every registered browser golden, ran unchanged. The retained
`target/smart117-feature-wasm-check.log` is SHA-256
`CB3AC6CB5ED877EBB76E9EC2AE3944C479AAA213357FDB341E8299FF97D92C7A`.
