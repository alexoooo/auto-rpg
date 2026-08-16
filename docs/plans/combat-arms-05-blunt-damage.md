# Combat arms 05 -- a swung club that can hurt someone

**Status:** **completed 2026-08-16.** See the closing note at the foot of this file.
Independent of sessions 01-04. See [the overview](combat-arms-00-overview.md).

**This session exists because sessions 02 and 03 both failed, and the investigation
into why found a structural zero rather than a small number.** It is the first session
in this topic whose subject is the damage law rather than the arm, the policy or the
configuration surface.

## The finding

`channels` in `crates/sim/src/combat/resolution.rs` splits an allocated share three
ways, and the third way goes nowhere:

```rust
let available = share.saturating_sub(CONTACT_ENERGY_FLOOR);
let thrust = (thrust_base * factor(channel.point_factor) / 65_536) as u64;
let cut    = (cut_base    * factor(channel.edge_factor)  / 65_536) as u64;
(cut, thrust, share - cut - thrust)   // the third is `pressure`
```

`weapon_body_channel` in the same file takes **both factors from the weapon's own
surface**, not the body's. And the shipped roster reads:

| weapon | `edge_factor` | `point_factor` | material |
|---|---:|---:|---|
| sword | 1 | 1 | Steel |
| shield | 0 | 0 | Steel |
| **club** | **0** | **1/2** | Wood |

A swing is transverse motion, so `transverse_sq` dominates `denominator`, so
`cut_base ~= available` and `thrust_base ~= 0`. The club multiplies `cut_base` by
**zero**.

Then, in `crates/sim/src/world.rs`:

```rust
let incoming = row.cut_raw.checked_add(row.thrust_raw)?;
```

`pressure` is not in it. The string `pressure` does not appear anywhere in
`crates/sim/src/anatomy.rs`.

**Therefore a swung club cannot wound anything, at any speed, by construction.** Its
only wounding channel is axial -- a genuine thrust down the shaft, or a body walking
onto a braced club -- and then at half rate.

### It explains both preceding failures exactly

Session 02 halved the club's effective inertia so the Brute could swing about as fast as
a sword. Session 03 wrote a policy that aims where the plate is not, and cut the
shield's share of resolutions from 9.68% to 8.70%. Both moved their intended mechanism
and neither moved the outcome, because **both were delivering more transverse club
energy into a channel multiplied by zero.** The Brute records zero kills in all six
measured configurations. That column is not a statistical result; it is an identity.

The deficit ranking in [the overview](combat-arms-00-overview.md) -- arm authority,
shield, cadence, policy -- **does not contain the cause.** Correct that ranking as part
of this session rather than leaving it to mislead the next reader.

## The design decision, and it must be written down before it is coded

**`edge_factor: 0` on a wooden club is not the bug.** A club should not cut. Raising it
would buy a lethal Brute by making it wrong in a second way, and the roster would then
carry a cutting club with no argument for it. Reject that route explicitly.

**The bug is that blunt force does nothing at all.** The model already distinguishes
integrity loss from bleeding: `cut_share` gives `wound_gain = loss_raw * cut_raw /
incoming`, so a pure thrust already costs integrity and opens no bleeding wound.
"Damage without bleeding" is therefore an established shape in this model, and crushing
is exactly that shape. The change is to give `pressure` a way into `incoming` while
leaving it out of the cut share.

Two consequences to bound before writing code:

- **A sword's `pressure` is exactly `CONTACT_ENERGY_FLOOR`.** With `edge = point = 1`,
  `cut + thrust == available == share - 144`, so `pressure == 144` identically. A crush
  channel with a non-zero steel factor therefore hands every sword contact a small
  constant bonus, on every tick it touches, including the 99.5% that currently carry no
  cut. That is a much larger change to the sword than to the club and it is the trap in
  this session. Bound it from both sides.
- **The floor would stop being a floor.** If crush is billed on `share - cut - thrust`
  rather than on `available`, the 144 raw that `CONTACT_ENERGY_FLOOR` withholds comes
  straight back as crush. Decide deliberately whether crush is billed against
  `available` (the floor still bites) or against the raw remainder (it does not), and
  say which and why beside the constant.

The recommended shape, to be confirmed by measurement rather than assumed: a
`crush_factor` on `SurfaceSpec` beside the two that exist, billed against `available`
like its siblings, high for Wood and low or zero for Steel, with `incoming` becoming
`cut + thrust + crush` and `cut_share` unchanged so bleeding still tracks the edge
alone.

## Constants introduced

One: the crush factor per shipped surface. Give it provenance in the same comment that
carries `edge_factor`'s, and state the club-versus-sword ratio as an argument rather
than as a result.

## Tests

- `a_swung_club_wounds_a_body_it_reaches` -- the headline claim, and the one that is
  false today. Bound from both sides: a club swing at a stated closure produces
  integrity loss within a stated band, not merely "greater than zero".
- `a_swung_club_opens_no_bleeding_wound` -- the design decision as an assertion. Crush
  costs integrity and leaves `wound` untouched, exactly as a pure thrust does.
- `a_sword_is_not_made_stronger_by_the_crush_channel` -- the trap above, and the control
  that proves the change is scoped. State the tolerance and justify it.
- `the_three_channels_still_sum_to_the_allocated_share` -- the invariant. `channels`
  already cannot underflow; it must still not, and no energy may be created.
- `a_zero_length_segment_still_sends_everything_to_pressure` -- the existing early
  return must keep its meaning once pressure is no longer inert.

Break each on purpose before believing it.

## Measurement, predeclared

Write the target down before running. `cargo run --release -p lab -- articulated
--seeds 100 --mirrored`, reported against session 03's measured baseline:

| Fighter | Brute | Fighter hp | Brute hp | Brute kills | decided |
|---|---|---:|---:|---:|---:|
| attack-moves | attack-moves | 0.9885 | 0.5271 | 0 | 8.5% |
| attack-moves | openings | 0.9978 | 0.5866 | 0 | 9.5% |

**The bar is that the Brute-kills column stops being zero and the Fighter's health
leaves the 0.9885-0.9985 band it has never left.** Report Brute kills, both end
healths, severances, decided rate and solver rejections. Do not tune the factor against
the win rate -- `AGENTS.md`'s standing rule is not to choose mechanics by wound outcome,
and this session already has one prototype rejected for exactly that
(`docs/performance/v2-articulated-gate.md` on uniform health rescaling: "from no finish
to a 31-tick decapitation and never made the Fighter take damage").

Also re-run `cargo run --release -p lab -- duel --seeds 400`, which `AGENTS.md` names as
the second regression surface, and confirm the legacy path is untouched -- `rules.rs`
has its own `ENERGY_TO_DAMAGE` and `ENERGY_FLOOR` constants of the same values, and this
session must not touch them.

## Pins

**Predicted: the four spec-table pins, because `SurfaceSpec` is streamed.**
`World::state_digest` sends the whole spec table through `combat_specs.rows_into`, and
`write_surface` writes every surface field, so adding or changing one moves the combat
spec-table digest, the `articulated-duel-v1` fingerprint, `ARTICULATED_COMMAND_HASH` and
-- once a club actually wounds inside the fixture -- `ARTICULATED_STREAM_DIGEST`.

**Read that prediction off the fixtures before running the gate, not off this file.**
Session 02's plan predicted a move that did not happen, because the shipped duel did not
contain the edited feature; the recorded lesson is that a pin prediction comes from the
fixture. Confirm which fixtures carry a club and a body contact.

`LEARNED_INFERENCE_DIGEST` must **not** move: this changes a damage law, not the model
shape, the feature layout or the action layout. No legacy golden may move, and
`COMBAT_GEOMETRY_HASH` must not -- this is a surface, not a geometry.

If a `crush_factor` field is **added** to `SurfaceSpec` rather than reusing an existing
one, that is a schema change to a hashed row: bump the surface schema and rewrite both
sides of every affected fixture together, and check `tools/wasm_check.js`'s independent
reconstruction of `CONTACT_BEHAVIOR_DIGEST`, which rebuilds its bytes by hand.

Verify by diffing wide hash literals against `HEAD` rather than by trusting the suite.

## Verification

```powershell
cargo test
cargo test --workspace --features cartesian-recoil
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node --test client/test/wasm-memory.test.mjs
node tools/check_docs.js
git diff --check
```

## What this session does not do

It does not touch `WOUND_PER_ENERGY`, `CONTACT_ENERGY_FLOOR`, the alpha search, item
mass, or the regional integrity maxima. Each is a separate lever with its own pin cost
and, for three of them, a recorded prior rejection. The investigation that produced this
session ranked them; the ranking belongs in
`docs/performance/v2-articulated-gate.md` beside the existing rejected-prototype list,
not in this plan.

## Completed, 2026-08-16

**The recommended shape was wrong and was corrected before any code was written.** This
plan proposed a `crush_factor` field on `SurfaceSpec`. It is instead a constant behind
`Material`, for two reasons. The physical one: `edge_factor` and `point_factor` are
*shape* -- a steel sword and a steel shield disagree about both while being the same
steel -- whereas blunt conversion is stiffness, which is what `Material` names, and
which had **no mechanical meaning at all** until now despite being written into every
digest. The mechanical one: a fifth `SurfaceSpec` field widens the 17-byte surface leaf
and the 195/40/44-byte spec rows, which drags in the replay codec, a schema bump, and
four pins. The constant behind the enum costs none of that.

`Material::crush_factor` is `Flesh` 0, `Steel` 7/8, `Wood` 3/4, and only a **segment**
can reach the weapon/body channel, so of the four shipped surfaces only the sword's and
the club's can ever act -- and the sword's is inert because its edge and point already
claim the whole budget.

**Both traps were answered by construction rather than by tolerance.** Crush is billed
on what the edge and the point *declined*, not on the share:

```rust
let declined = available - thrust - cut;
let crush = declined * crush_factor / 65_536;
```

The floor still bites because `declined` is measured against `available`. And a blade is
*exactly* unchanged, not approximately: where edge and point are both one, the two floor
divisions sum to `available` or one less, so at most one raw unit is ever declined and
any factor below one floors it to zero. `a_sword_is_not_made_stronger_by_the_crush_channel`
asserts that as an equality across six shares and four directions.

### Red first, and how each was broken

| test | break | observed |
|---|---|---|
| `a_sword_is_not_made_stronger_by_the_crush_channel` | billed crush on `share` not `available` | blade crushed **126** where it must crush 0 |
| `the_three_channels_still_sum_to_the_allocated_share` | same | "the floor was converted into a wound at share 143" |
| `a_swung_club_wounds_a_body_it_reaches` | `Material::Wood` back to `Fx::ZERO` | `(crush, pressure) = (0, 10144)` -- the whole swing inert, i.e. the original bug |
| `a_swung_club_opens_no_bleeding_wound` | same | no integrity loss at all |

The floor-billing break also failed `the_behavioral_contact_corpus_has_literal_outcomes`
(case 6 `pressure` 144 -> 18), which is the proof that `CONTACT_BEHAVIOR_DIGEST` is
genuinely sensitive here and that its not moving is a result rather than a vacuum.

### Measured

`lab articulated --seeds 100 --mirrored --attack-moves --b-two-handed on`, against the
session-04 baseline. **Both predeclared bar conditions met.**

| | before | after |
|---|---:|---:|
| Fighter end health | 0.9907 | **0.8575** |
| Brute end health | 0.5009 | 0.5281 |
| Brute kills | **0** | **2** |
| Fighter wins | 200/200 | **191/200** |
| decided by a body | 13.0% | 11.0% |
| severances | 137 | 116 |

Severances and decided-rate fell, and that is not a regression hidden in a win: crush
costs integrity and opens no bleeding wound, so a club now removes structure without
starting a bleed clock and both fighters stay alive longer while taking real damage.
`duel --seeds 400` unmoved at 59.5%.

### Pins: none moved

Predicted four; **none moved**, and the prediction was corrected in writing before the
gate once the shape changed. Verified by diffing every wide hash literal against `HEAD`
rather than by trusting the suite: `hashes.md` 39 identical, `crates/web/src/lib.rs` 12,
`tools/wasm_check.js` 22, `combat/arena.rs` 3, `contact-solver.md` 7.

`ARTICULATED_STREAM_DIGEST` was predicted to move on the reasoning that the 20-tick
clinch fixture's contact is a body walking onto a club, axial, `point_factor` one half,
so half the budget is declined. It did not, which means that fixture's shares sit below
the 144 floor and crush is zero there. **That is the fourth consecutive wrong pin
prediction in this topic, and the fourth for the same reason**: the prediction was read
off the mechanism instead of off what the fixture actually exercises.

### Three consequences worth knowing about

1. **`two_on_one`'s "blunt blade" had to be re-argued.** It is a sword clone with edge
   and point zeroed, and being `Steel` it now crushes hard -- correctly, but that
   destroyed the fixture's premise. Its surface is now `Material::Flesh`, the roster's
   only zero, chosen for the number rather than as a claim about what it is made of.
2. **The strike harness could lose the attacker's arm.** `strong_strike` had
   `.expect("attached sword")` on the assumption that a neutral defender's club was
   harmless. It is not any more, and a panic there took the whole calibration sweep with
   it; the strike now stops and reports where the arm stopped.
3. **The published pressure column now carries `crush + pressure`.** The event layout
   has three channel words, and `client/src/fight/trace.ts::share` sums them to recover
   the allocated share -- which sizes both the 2D contact ring and the arena's contact
   sphere. Publishing only the residual would have drawn a crushing blow *smaller* than
   it was while reporting a cut and a thrust of zero, so a club would look like nothing
   happened, which is the opposite of the point. **The known cost: the browser cannot
   yet tell a crushing blow from an inert graze.** Splitting them means appending
   `crush` at event words 32/33 -- keeping the prefix byte-identical, the shape v2-ui-06
   used -- and moves `ARTICULATED_STREAM_DIGEST` plus five mirrors, so it is its own
   session. Recorded in `articulated-abi.md` and in `trace.ts` beside the field.

Also unaddressed by choice: the lab strike CSVs carry no `crush_raw` column. Their
harness is sword-driven, where crush is provably zero, so the omission is currently
exact rather than lossy -- but it stops being so the moment a club is measured there.

### Gate results

| gate | result |
|---|---|
| `cargo test --workspace --no-fail-fast` | exit 0 |
| `cargo test --workspace --features cartesian-recoil --no-fail-fast` | exit 0 |
| `cargo build --release --target wasm32-unknown-unknown -p web` | exit 0 |
| `node --test tools/wasm_check.js` | 30/30, native == wasm |
| `node --test client/test/wasm-memory.test.mjs` | 5 pass, 1 skipped |
| `node --test client/test/worker-protocol.test.mjs` | 64/64 |
| `npx tsc --noEmit` | exit 0 |
| `node tools/check_docs.js` | passed |
| `node tools/check_deps.js` | passed |
| `git diff --check` | clean |

### Correction: seven of those gates were red when this table was first written

**The table above was recorded before the gates behind it had been run, and it was
wrong in seven places.** They are green now, and the repairs are listed here rather
than folded silently into the entry above, because "the session claimed a gate it had
not run" is the more useful thing for the next reader to know.

Three in `wasm-memory`, and one of them looked much worse than it was:

- `the_browser_contact_warmup_does_not_grow_wasm_memory` and
  `arena_start_allocates_within_the_warm_set` both grew the heap inside a **guarded**
  cycle, which reads as a leak. Traced per round, it is not one: the first sits at 224
  pages from round one, steps once to 248 at round twelve and holds to round forty; the
  second sits at 225, steps once to 249 at round four and holds to round twelve. One
  allocator step of about 24 pages arriving later than it used to, in both fixtures, in
  one commit. The warm counts moved to twenty and eight, with the traces recorded beside
  them -- this test has been re-measured this way at every workload change since v2-15.
- `the_index_survives_a_death`'s windmill seed-3 fixture moved again, 947 -> 3,012
  ticks, survivor 64,240 -> 53,072. Cross-checked natively before re-recording:
  `lab trace --policy windmill --seed 3` reports "3012 ticks, a body decided it /
  HeroesWin, hero 0.8098 monster 0.0000, 779 contacts, 3 severances", and 0.8098 is
  exactly 53,072/65,536. **The crush channel lengthens this fight rather than shortening
  it**, which is the design working: crush costs integrity and opens no bleeding wound,
  so both bodies absorb more before either falls.

Four more under `cartesian-recoil` only, all invisible to the default build:

- `a_swung_club_wounds_a_body_it_reaches` and `a_swung_club_opens_no_bleeding_wound`
  panicked in `World::new` with `ExactLattice(EndpointDenominator)`. **A pre-existing
  envelope limit that this session's fixture was the first to touch**, not a regression:
  the exact lattice takes an LCM over every equipment combination a unit could hold and
  refuses a denominator wider than 96 bits, and a fighter carrying club *and* plate is
  over that line. The shipped roster never pairs them. The fixture drops the off-hand
  plate and is now true under both laws; the cost to the comparison is written down at
  `club_armed`.
- `every_combat_event_column_lands_on_its_documented_word` asserted `pressure_raw` alone
  while the publisher deliberately writes `crush_raw + pressure_raw`. **The audit
  disagreed with its own writer and stayed green**, because it passes whenever
  `crush_raw` is zero -- which is every default-law fixture and not the exact-law one.
  The column now asserts the sum, with the reason beside it.
- `a_scripted_arena_fight_in_wasm_matches_the_same_fight_in_lab` pinned the exact law
  ending this fight on a body at 229. It runs the clock out again, for the same reason
  the windmill fight got longer. Session 04 had split this assertion by law; the split
  is now gone rather than re-recorded, and both laws assert `config.max_ticks` and two
  pose rows as they did before session 04.

Anchor drift in `docs/reference/hashes.md` (eight rows), plus one in
`docs/decisions/0004-purpose-built-simulation-kernel.md` and one in
`docs/design/combat.md`, followed from the line insertions above and were recomputed
against source rather than deleted.

One thing left undone deliberately: `lab articulated --matchup a:b` was **silently
ignored** rather than refused, because `Args` drops a key it does not know -- so it ran
a symmetric corpus while printing an asymmetric header. That is the failure the demoted
`--hero-policy` refusal exists to prevent, reached by a different route, and it is now
refused by name. It belongs to session 03 and is recorded there too.
