# Smart AI 121 -- ordinary exact wall replay

**Status:** stopped and reverted; its failure is closed by the separately reviewed
[Smart127 body-wall successor](smart-ai-127-body-wall-authority.md). The complete
predeclared 56-tick east-wall run
matched live/live/replay and produced the accepted strike, both exact remainder
classes and the ordinary release, but no defender body `WALL` row. The missing
Smart36 checkpoint-E boundary proof therefore remained missing at this checkpoint.
No production edit, digest or pin survived this session.

## Result

The accepted WeaponBody receipt was `45/46`. Both exact momentum and position
remainder classes were present on every recorded state from tick 45 through tick 56.
The ordinary right-hand release was published at tick 54 as the Fighter lane-2 row

```text
signed numerator = -1_073_625_268_272
denominator       =      8_589_934_592
```

Both live runs and recorded replay matched at every tick across the complete planned
comparison. The required defender body `RecoilExternalEnergy::WALL` row never
appeared. That absence is the stop condition: replay equality and a release are not a
substitute for the predeclared ordinary boundary reaction.

The retained log is `target/smart121-east-wall.log`, SHA-256
`25B3D423C3425DA0BC6D11FD0113ECB7F8E1D313521B01D03F76EA861DC648B3`.
The temporary fixture/diagnostic branch was reverted. Do not retune the wall, spawn,
timing, reach, anatomy or loadout from this result. Smart122 and Smart123 remain
blocked until a separately reviewed lifecycle classification supplies the missing
ordinary boundary authority.

Smart127 later made that classification without changing this stopped result. It
found that the response is westward and northward, so the east wall was behind it;
the response-aligned north translation produced the ordinary body row while keeping
this session's strike, timing, reach, loadout and 56-tick horizon unchanged.

Smart36's existing live/rerun/replay test reaches accepted exact response and an
ordinary release, but its south-wall response never crosses the integer boundary.
The later source-41 ordinal-3144 strike supplies a stronger, mechanics-selected
ordinary response. This session translates that already-frozen relative geometry to
one wall before measuring it. It does not search after seeing the result.

## A -- one predeclared ordinary boundary fixture

Edit [`crates/sim/src/replay.rs`](../../crates/sim/src/replay.rs). If sharing the
runner would otherwise duplicate the command stream, add
`crates/sim/src/exact_diagnostics.rs` and its feature-gated module declaration in
[`crates/sim/src/lib.rs`](../../crates/sim/src/lib.rs). Do not edit owner rows,
poses, finalized groups or contact facts directly.

Freeze this fixture before the first run:

```text
seed                         0
room                         shipped 24 x 16 open duel
defender                     neutral Brute
defender centre              (24 - Body::Brute.radius(), 8)
defender centre raw          (1_526_989, 524_288)
attacker                     Fighter, left shield, right 2-unit sword
attacker offset from target  (-163_840, -65_536) raw
attacker centre raw          (1_363_149, 458_752)
target                       Legs
ticks 0..27                  chamber command
ticks 28..52                 commit command
tick 53                      neutral arms, right GripRequest::Release
ticks 54..55                 neutral arms, GripRequest::Keep
hard horizon                 56 ticks
strike reach                 61_440 raw
effort                       65_536 raw
```

Construct the wall coordinate as
`Fx::from_int(24) - Body::Brute.radius()` and assert its raw value is `1_526_989`.
Spell the already-frozen ordinal-3144 bearing schedule and the literal tick ranges
above in the diagnostic runner; `sim` must not acquire a dependency on `policy`.
The Brute receives the neutral command on every tick. Submit only ordinary
`ArticulatedCommandV1` values, record the stored values, and replay those records.
Run the complete hard horizon even after the qualifying contact: tick 53 is the
ordinary right-grip release whose exact external row this proof requires, and ticks
54--55 prove the released state survives neutral Keep commands. Do not extend the
commit beyond tick 52 or stop the run at contact.

The fixture qualifies only if it has all of:

- at least one accepted right-sword-to-Brute-Legs WeaponBody group;
- nonzero exact momentum and position remainders;
- an outward response clamped at the east wall and an exact body-lane
  `RecoilExternalEnergy::WALL` row;
- a later ordinary `RecoilExternalEnergy::RELEASE` row;
- no cap and no exact refusal before the wall row.

If any condition fails, record the first exact tick/phase/key and stop. Do not move
the wall, spawn, timing, reach, anatomy or loadout in this session.

## B -- live, rerun and recorded replay

Refactor the existing
`exact_trajectory_live_rerun_and_replay_match_every_tick_and_breakpoint` test to use
the shared runner, preserving its exact per-tick comparisons. Add:

```rust
#[test]
fn ordinary_exact_trajectory_crosses_a_wall_and_replays_every_authoritative_word() {}
```

At every tick compare both live runs and `Replay::play_until` across state digest,
contact resolutions, cap count, exact external ledger, rejection provenance,
anatomy, articulated pose and grips. Assert the accepted group, both remainder
classes, wall row and release row rather than inferring them from final equality.

Mutation proof: move the defender inward by one raw word, or suppress the expected
outward response only in a test oracle. The wall assertion must fail while the
live/rerun/replay equality comparison remains green; restore the mutation. A direct
owner or pose mutation is forbidden because it would no longer prove an ordinary
command boundary.

## Verification and stop

```powershell
$env:CARGO_INCREMENTAL='0'
cargo test -p sim --features cartesian-recoil ordinary_exact_trajectory -- --nocapture
cargo test -p sim --features cartesian-recoil exact_trajectory_live_rerun -- --nocapture
cargo test -p sim
cargo test -p sim --features cartesian-recoil
node tools/check_docs.js
git diff --check
```

Record exact tick, key, region, impulse, wall row, release row and live/rerun/replay
receipts. Smart122 remains blocked unless this session is green.
