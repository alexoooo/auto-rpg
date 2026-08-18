# Fight 04 -- the fight that ends

**Status:** ready. Depends on session 03. Blocks 05.

Sessions 02 and 03 give a body something to aim and something to defend with. This is the
session that has to make a duel *finish*, and it is the one carrying the overview's
preregistered acceptance.

## Why the fights do not end, measured rather than guessed

The obvious reading of `91.8% reached tick 3600` is that the bodies never get near each
other. The corpus says the opposite. Over 400 trials the script produces **816,852 contact
resolutions**, of which **626,361 are weapon-on-body**:

```text
contacts  816852 resolutions, 6366 cap hits
blocked   106019 weapon/shield (12.98% of resolutions), 626361 weapon/body, 84472 weapon/weapon
blows     332 severances, max weapon-body energy raw 45760, worst tick took 16.3432 health
health    fighter ends on 0.8687 mean, brute on 0.6021 mean
```

That is **1,566 weapon-on-body facts per trial** delivering, between them, about 0.40 of
the Brute's health. A shade over a ten-thousandth of a health point per contact.

The bodies are not failing to reach each other. They are standing inside each other and
*rubbing*. Damage in this simulation is kinetic energy -- `DESIGN.md` argues the squared
law at length and it is what finally made reach pay -- so a blade travelling at nearly
zero relative speed does nearly nothing, however many times it touches. The occasional
real blow exists (`worst tick took 16.3432 health`) and is drowned in noise.

**So the fix is not "hit harder". It is "stop touching".** A fighter that holds measure,
then crosses it once at speed, converts 1,566 worthless facts into a handful of expensive
ones. `articulated_tactics.rs` already has the machinery -- `MEASURE_MARGIN`,
`MEASURE_MIN_FRACTION`, `in_measure`, `WITHDRAW_SPEED` -- and session 02 brought it across
untuned. This session tunes it against the embodied body, which has hips the planner has
never seen.

Record the same four lines after every change. **The number to watch is not the win rate,
it is `weapon/body` per trial**; if that falls by an order of magnitude while severances
hold or rise, the fight has become a fight.

## What this session may change

1. **Measure.** `MEASURE_MARGIN_RAW` and `MEASURE_MIN_FRACTION` decide how far outside
   strike range the feet hold. Too tight and the bodies rub; too wide and neither ever
   commits and the clock still runs out. It is bounded from both sides by construction,
   which makes it the one constant here that can be swept honestly.
2. **Commit.** `COMMIT_MIN_OPENING_RAW`, new: the smallest opening the planner will spend a
   commit on. Today `choose_plan` takes the best candidate whatever its score, so a body
   commits into a covered line as readily as into an open one. A floor turns "always
   swinging" into "waiting", which is what makes a withdrawal mean something.
3. **The twist budget.** An embodied torso cannot turn past `STANCE_TWIST_LIMIT_RAW`
   without a step, and the planner does not know that: it asks for turns the stance phase
   clamps, and a clamped turn is a plan arriving late. `ObservedStance::twist_fraction` is
   published and is already read by the script. Reading it here means the planner asks for
   the turn it can have.
4. **The elevation term goes.** `--high-ground` measured 759 seeking wins against 839
   level over 1,600 trials -- **-5.00 percentage points, doubly witnessed** -- and it is
   still switched on in the shipped script. It is not ported into the tactical policy, and
   `EmbodiedPolicyKind::Scripted` keeps it, because the script is a frozen control and
   removing the term would move `EMBODIED_CORPUS_DIGEST` for no gain. The corpus record
   already carries the result; this session's job is to make sure the *new* fighter does
   not inherit a term that lost.

## What this session may not change

- **No mechanic.** Not the actuator, not the contact solver, not the anatomy, not a spec
  row. If the acceptance cannot be met without changing a mechanic, that is a finding and
  it is recorded as one -- it is a different topic with a different measurement, and it
  would move every pin in the registry.
- **No new perception channel.** The overview says so and it is repeated here because this
  is the session that will want one. If the honest conclusion is that the fighter cannot
  meet the bar without seeing walls, write that down; do not quietly publish a column.
- **No threshold weakened after the fact.** The four acceptance numbers are in the
  overview, declared before any of this was written.

## The acceptance corpus

`embodied-duel-v1`, 400 seeds, both orientations, both side assignments, pooled:

```powershell
cargo run --release -p lab -- embodied --seeds 400 --mirrored --policy tactical
cargo run --release -p lab -- embodied --seeds 400 --mirrored --hero-policy tactical --monster-policy scripted
cargo run --release -p lab -- embodied --seeds 400 --mirrored --hero-policy scripted --monster-policy tactical
cargo run --release -p lab -- embodied --seeds 400 --mirrored --slope --policy tactical
```

| quantity | baseline | acceptance |
|---|---:|---:|
| trials decided by a body | 8.2% | at least 50% |
| median fight length | 3600 ticks | under 1800 ticks |
| tactical wins against the script | -- | at least 60% |
| guard diagonal | 52.06% | at least 70% |

The `--slope` run is not part of the acceptance and is run anyway: a fighter tuned only on
flat ground that falls apart on the sculpted fixture has been tuned to a fixture rather
than to a game, and the sculpted corpus is the cheapest way to find that out.

Every constant this session moves gets its provenance written beside it -- **which sweep,
which value won, and the test that would catch it drifting in both directions.** A
constant chosen by running the corpus and then recorded without the corpus is exactly what
`embodied_script.rs` refused to do, and it refused for the right reason.

## The report

`docs/performance/embodied-tactical-policy.md`, which sessions 02 and 03 started, becomes
the record of this topic. It needs the host and date line, the exact commands, the three
pooled arms, the sweep table for every constant moved, and -- if any row missed -- a
`revise` decision with the matched evidence and no softened number.

## Hash expectations

**Nothing moves.** `Scripted` still is not edited. If a sweep is tempting enough to reach
into the script, that is the moment to stop: the control is what every number in this
topic is measured against, and a control that moves with the subject measures nothing.

## Verification

```powershell
cargo test
cargo test -p policy
cargo test -p lab
cargo test -p sim --features cartesian-recoil
cargo run --release -p lab -- embodied --corpus-digest
cargo run --release -p lab -- verify --seeds 200
cargo run --release -p lab -- verify --slope --seeds 50
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
node --test "client/test/*.test.mjs"
```

## Acceptance

1. Four preregistered rows met, or `revise` recorded with the matched evidence.
2. `weapon/body` facts per trial reported before and after, as the diagnosis this session
   was built on.
3. Every moved constant carries its sweep and a two-sided bounding test.
4. No pin moved.
5. The performance record is complete enough that session 05 can delete
   `articulated_tactics.rs` without deleting a measurement.
