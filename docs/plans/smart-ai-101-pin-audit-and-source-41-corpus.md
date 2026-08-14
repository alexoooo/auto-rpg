# Smart AI 101 -- audit the default stream pin, then rerun source 41

**Status:** complete. The paired default audit agreed exactly, the single owned
`ARTICULATED_STREAM_DIGEST` move is landed in both owners and the durable registry,
and Smart102's test-only fixture corrections restored the complete workspace. The
unchanged source-41 corpus then ran all 7,560 central orientations and selected robust
ordinal 3144. Smart103 owns promotion and the previously frozen 95/100 competence
gate; Smart101 made no policy or UI change.

## A -- frozen pin prediction and paired pre-update capture

Expected registered movement is exactly one value:

```text
ARTICULATED_STREAM_DIGEST  0xf7d3a9c73aa59981 -> 0xdbbd86fedd61c4c7
COMBAT_GEOMETRY_HASH       unchanged 0x9d15344883cf6e9c
CONTACT_BEHAVIOR_DIGEST    unchanged 0x587b0259e877105a
all other registered pins  unchanged
```

The stream move is a values move, not a layout move. Smart51's reflection-safe
actuator/interpolation and Smart59's weapon COM sampling reach the default twenty-tick
published stream. Smart53/55/57/61 and exact certification/retained geometry are
feature-only. No stride, section, count grammar, command fixture or ABI version
changes. Smart61's earlier paired witness found `0xdbbd86fedd61c4c7`; that is the
predeclared expectation, not permission to accept another number.

Before editing either constant, build native and a fresh default release wasm from
the same tree. Capture the failing old-pin native assertion's actual value and the
wasm checker's actual value independently. Require both equal each other and equal
`0xdbbd86fedd61c4c7`. Capture geometry and contact behavior from their paired checks
and require the unchanged values above. Any other value, disagreement, additional pin
movement or corpus-length change stops without editing a constant.

```powershell
cargo test -p web native_and_wasm_pose_event_stream_digests_match -- --nocapture
$env:CARGO_TARGET_DIR='target/smart101-default-wasm'
cargo build --release --target wasm32-unknown-unknown -p web
$wasm=Resolve-Path 'target/smart101-default-wasm/wasm32-unknown-unknown/release/web.wasm'
$wasm.Path; (Get-Item $wasm).Length; (Get-FileHash -Algorithm SHA256 $wasm).Hash
node --test tools/wasm_check.js
Remove-Item Env:CARGO_TARGET_DIR
```

These commands are expected to be red only at the old stream constant. Preserve both
actual/expected outputs as the paired audit receipt; do not infer one target from the
other.

## B -- update both owners and the durable registry once

Only after A agrees exactly, replace `ARTICULATED_STREAM_DIGEST` in
`crates/web/src/lib.rs` and `tools/wasm_check.js`. Update its row in
`docs/reference/hashes.md` with the new and old values, the Smart51/59 values-change
rationale, explicit no-layout-change statement and paired evidence. Append the
accepted pin move to `docs/performance/v2-articulated-contact-research.md`.

Do not alter geometry/contact constants, fixture bytes, row counts, tests or the ABI
to make a value fit. Re-run the native test, rebuild default wasm before its checker,
then run complete default, feature and workspace gates. Any new failure or second pin
move stops before the corpus.

```powershell
cargo test -p web native_and_wasm_pose_event_stream_digests_match -- --nocapture
cargo test -p sim
cargo test -p sim --features cartesian-recoil
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
cargo test -p web --features cartesian-recoil native_and_wasm_pose_event_stream_digests_match -- --nocapture
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

## C -- unchanged complete Smart41 corpus

Only after A--B are wholly green, run exactly the existing source-41 command with no
new flag or measurement-dependent input:

```powershell
$env:CARGO_INCREMENTAL='0'
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --noise-free-mirror-corpus
Remove-Item Env:CARGO_INCREMENTAL
```

The checksum grammar `41`, declared-spawn bearing, anatomical reflection, four
contiguous 16 MiB-stack shards, complete enumeration and no-early-stop law remain
byte-for-byte Smart41. Central order is chamber, strike, reach, target anatomy, the
existing nine approach offsets, then orientation:
`7 * 6 * 5 * 2 * 9 * 2 = 7560`. Run all central cases. For every eligible mirrored
pair, run all 18 local cases from strike delta `[-1,0,1]`, reach delta
`[-256,0,256]`, and both orientations, with chamber fixed.

Eligibility, one-word mirror tolerances and selection remain unchanged. Selection is
maximin physical dissipation, then minimum central chamber-plus-strike duration, then
minimum ordinal. Damage remains excluded from eligibility and selection. Print and
record elapsed milliseconds and command seconds, central/local counts, eligible plain
and mirror counts, robust-pair count, selected literal or `none`, all overlapping
rejection counters, source version and checksum.

No result authorizes post-hoc retuning. If no robust pair exists, preserve the exact
stopped result. If a pair is selected, preserve its predeclared selection and author a
separate outcome/gate session; do not inspect damage to choose a runner-up. Smart101
does not change mechanics, policy, learning or the arena UI.

## D -- final boundary

After the corpus, rerun documentation/diff checks and record the exact result here and
in the durable research document. The paired stream update is Smart101's entire pin
budget; no new pin may be added.

```powershell
node tools/check_docs.js
git diff --check
```

Only if the corpus selects a robust pair may the next predeclared session validate
post-selection wound strength and expose the already validated smart AI in the arena.
Until that result exists, no retune, policy promotion, learning run or UI claim is
authorized.

## Complete result

With the old constants still installed, native MSVC and a fresh default wasm both
returned `0xdbbd86fedd61c4c7`; only then were the two constant owners updated from
`0xf7d3a9c73aa59981`. Geometry remained `0x9d15344883cf6e9c`, contact behavior
remained `0x587b0259e877105a`, and the contact corpus remained 3,548 bytes. The fresh
pre-update default artifact was:

```text
C:\Users\ostro\IdeaProjects\auto-rpg\target\smart101-default-wasm\wasm32-unknown-unknown\release\web.wasm
bytes 654355
sha256 D0955C84322627886495D0F4BD084EDDD59490D34CA06D6C724BFB050612F184
```

The complete feature sim log `target/smart101-feature-final.log` is green at
`685 passed; 0 failed; 3 ignored; 156.51s`, with determinism `10/10` in `0.19s`.
The workspace log reached Lab and stopped at:

```text
target/smart101-lab-control.log
a_zero_energy_excess_is_only_evidence_while_the_solver_refuses_nothing
the windmill control: the solver refused a tick, so the zero above audits nothing
left: 1
right: 0
0 passed; 1 failed; 83 filtered out; 0.55s
```

The initial workspace occurrence in `target/smart101-workspace-final.log` reports Lab
`78 passed; 1 failed; 5 ignored` in `4.73s`. Smart102 subsequently corrected only the
diagnosed test contracts: the Lab windmill refusal, policy's stale one-raw reach
literal, and web's owned post-Smart51/59 boundary/high-water witnesses. The final
workspace log `target/smart102-workspace-final-3.log` is green, including Lab `79/79`,
policy `133/133`, sim `542 passed / 0 failed / 1 ignored`, determinism `10/10`, and web
`124 passed / 0 failed / 4 ignored`.

Only then did the exact command in C run. Its complete receipt is
`target/smart101-corpus-final.log`, 812,866 bytes, SHA-256
`55975673586889218FCBD1FA64F4F8C2C01DE19143C2222249D5AA4E5442703F`:

```text
source=41 central_oriented=7560 local_oriented=2826 robust_pairs=124
eligible plain=157 mirror=157 selected=Some(80)
checksum=272625115ee9a09a elapsed_ms=7885045
selected ordinal=3144 chamber=28 strike=28 reach=61440
         target=Brute offset=(-163840,-65536) worst_dissipated=278
```

All 18 predeclared local cases around ordinal 3144 were eligible in both
orientations and each dissipated 278 raw. The overlapping central rejection counters
were missing contact/attribution `5730`, crossing `5730`, reach `5740`, motion `5730`,
impulse `5850`, dissipation `5998`, refusal `0`, solver `3362`, cap `0`, energy `0`
and alpha `5730`. Selection used only the frozen maximin dissipation, duration and
ordinal law; damage was not read for selection. This completes Smart101 without a
retune. Smart103 may promote exactly this literal and must stop if its independent
moving-fight competence gate fails.
