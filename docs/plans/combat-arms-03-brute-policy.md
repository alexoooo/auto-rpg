# Combat arms 03 -- a Brute that can fight

**Status:** **completed 2026-08-16, and the predeclared target was missed.** The
harness landed, the policy landed and does measurably what it was built to do, and it
did **not** make the Brute a real opponent. See the closing note. Depends on
[session 02](combat-arms-02-two-handed-coupling.md) landing and being measured. See
[the overview](combat-arms-00-overview.md).

**Re-measure before writing a line of policy.** Session 02 removed the Brute's largest
handicap. The whole point of sequencing them is that this policy is written against a
Brute that can already swing, and the corpus after 02 is the baseline this session is
judged on -- not the one in this file.

## Part 1 -- the harness gap, first

`lab trace` and `script_from` put **one policy on both sides**
(`crates/lab/src/main.rs`), and only the browser Arena can run two different
articulated policies (`crates/web/src/lib.rs` holds
`Arena::policies: [Box<dyn ArticulatedPolicy>; 2]`). `docs/reference/articulated-abi.md`
says as much: `policy::run_articulated` installs one policy on both sides and is
"useless for an arena".

So **"Brute-tactical versus Fighter-attack-moves" cannot be measured natively today.**
Add an asymmetric matchup to `lab articulated` -- a `--hero-policy` / `--monster-policy`
pair, or one `--matchup a:b` -- before the policy, or the result cannot be reported.

Follow the refusal discipline the file already uses: name the offending input in the
refusal, **return** it rather than printing and exiting so a test can assert the
sentence, and refuse an asymmetric flag anywhere it cannot be honoured (the frozen
competence gate already refuses every measurement-changing override by name; the new
keys join that list).

Test: `an_asymmetric_matchup_runs_a_different_policy_on_each_side` -- assert the two
sides' submitted command streams differ, not merely that the flag parsed.

## Part 2 -- the policy

Next free code is **6**. `ArticulatedPolicyKind` in `crates/policy/src/lib.rs` owns
`ALL`, `code`, `from_code`, `from_name`, `name` and `build`, and
`articulated_policy_codes_are_append_only_and_reserve_the_learned_one` asserts
`from_code(6) == None` -- that line is the first thing to edit, and it becomes an
assertion about 7 plus a positive one for 6.

### What it should do that nothing does today

**Attack where the plate is not.** This is the single largest untaken opportunity in
the tree. `choose_plan` in `crates/policy/src/articulated_tactics.rs` iterates all five
body regions by both hands and two arcs, and scores by **nearest region centre** -- it
never consults `foe.shield` at all. The observation publishes the plate's centre, its
normal and both half-extents (`crates/sim/src/obs.rs`), and blocking is purely
geometric: there is no block roll and no shield stat, only "was the plate in the swept
path". A policy that tests plate coverage of a candidate region before choosing it is
playing a game nothing in the tree plays.

The plate is small -- a quarter by a quarter -- and its centre follows the hand while
its normal follows body yaw, so at any given guard height it leaves a different hole.
That hole is what to aim at.

**Strike on the withdrawal.** `weapon_is_withdrawing` already exists and is already
used for `StrikeWeaponArm`; the opening it detects is worth more against a shielded
opponent than a fresh chamber is.

**Spend the 18-tick cadence better.** The Brute re-plans half as often as the Fighter,
so a plan that needs frequent correction is worth less to it than a committed one. Bias
toward fewer, better-chosen commits rather than the Measure/Seek loop.

### What it gets to work with

`ArticulatedObservation` gives exact proprioception and perception-noised opponents:
body position, five region volumes, both weapon segments, the shield, `severed_mask`,
and a one-tick `contact_timing` imminence signal. It publishes **no opponent weapon
velocity** -- `StrikePlanner` already caches one previous observation to difference it,
and a policy wanting acceleration, or wanting to tell a chamber from a commit, needs
two or three frames of its own history. That is allowed: a policy owns its state, and
`reset()` is the contract for clearing it.

## Registration -- five mirrors

Update together, or the Arena prints a command that does not exist:

- `client/src/runtime/arena-config.ts` -- `ARENA_POLICY_NAMES`, where index **is** the
  code;
- `client/src/arena/picker.ts` -- the `POLICIES` list, **and** `traceCommandFor`'s name
  chain and the refusal sentence that enumerates `--policy`'s vocabulary;
- `crates/lab/src/main.rs` -- the `Script` enum, `policy()`, `name()`, `token()` and
  `script_from`'s choice table;
- `docs/reference/articulated-abi.md` -- the policy table.

## Two stale mirrors to fix while here

- `docs/reference/articulated-abi.md`'s policy table lists codes 0-4 only, and the
  string `tactical` appears nowhere in the file although code 5 ships and is selectable
  in the browser.
- `AGENTS.md` and `crates/policy/src/lib.rs` both state the lab's `--policy` vocabulary
  is `composed|windmill|neutral`. The actual table in `crates/lab/src/main.rs` is
  `composed|windmill|tactical`; `neutral` is not accepted. The `lab` help text is
  correct, so it is the two prose claims that are wrong.

## Acceptance, predeclared

On `lab articulated --seeds 100 --mirrored` with the asymmetric matchup, Brute on the
new policy against Fighter on `attack-moves`, report: Brute end health, Fighter end
health, severances, decided rate, and solver rejections.

**The honest bar is that the Brute becomes a real opponent, not that it always wins.**
Write the target down before running: the Fighter's end health falls meaningfully below
the `0.99` it currently ends at, and the Brute lands region-taking blows rather than
grazes. If it wins outright after session 02, say so and say why; if it does not, that
is a result about the loadout and the anatomy, not a reason to keep tuning the policy
until the number moves.

**Do not select the policy by win rate.** `AGENTS.md`'s standing rule is not to choose
mechanics by wound outcome, and a policy tuned against one opponent on one corpus is
the `49/100` recertification that had to be reverted.

## Predeclared target, written 2026-08-16 before any code

Session 02 landed and moved the corpus, so the bar is set against **its** numbers and
not against the ones this file was drafted with. The post-02 baseline, both sides on
one script with the Brute two-handed, is Fighter `0.9885`, Brute `0.5271`, 110
severances, 8.5% decided, Fighter 200/200.

On `lab articulated --seeds 100 --mirrored --b-two-handed on` with the asymmetric
matchup, Brute on the new policy and Fighter on `attack-moves`:

- **The Fighter stops ending untouched.** Its end health falls below `0.90`, against
  the `0.98`-`0.99` it ends at today. This is the honest bar: it says the Brute reached
  a body, repeatedly, against a guard that is actually being used.
- **The Brute takes regions rather than grazing.** At least one severance is credited
  to a Brute blow across the corpus.
- **Refusals stay at zero.** Solver rejections and refused submissions do not rise; a
  policy that wins by emitting commands the world refuses has not won anything.

**Winning is not the bar and will not be claimed as one.** If the Brute takes the
matchup outright, that is reported with the reason; if it does not, the deficit is a
result about the loadout and the anatomy, not a licence to keep tuning until a number
moves. The scoring rule is chosen from the plate geometry below, never from a win rate.

## Verification

```powershell
cargo test
cargo test --workspace --features cartesian-recoil
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
npx tsc --noEmit
node --test client/test/studio-shell.test.mjs
node tools/check_docs.js
git diff --check
```

**Predicted pin movement: none.** `ARTICULATED_COMMAND_HASH` is a hand-written payload
against an unstepped world and `ARTICULATED_STREAM_DIGEST`'s fixture never calls the
scripted policies -- its registry row in `docs/reference/hashes.md` proves it with the
2026-08-10 case where all three script digests moved and it did not. `ARPG-SCRIPT-V1`
is a per-run digest; a new policy runs under its own name. Also re-check
`cargo run --release -p lab -- duel --seeds 400` win rates, which `AGENTS.md` names as
the second regression surface for any `crates/policy` change.

## Completed, 2026-08-16 -- the target was missed, and that is the result

### What landed

**The harness.** `--hero-policy` / `--monster-policy` name a script per side on both
`lab articulated` and `lab trace`, refused by returned sentence rather than by
`process::exit`, and joined to `competence_override`'s frozen-receipt refusal list.
`Matchup` carries the pair; `impl From<Script> for Matchup` keeps every symmetric
caller spelling itself in one word, so an unflagged run is the corpus it always was.
The asymmetric keys take `attack-moves` by name, which `--policy` cannot spell.

**The policy**, registered as code **6**, `openings`. It is
`TacticalArticulatedPolicy` with one axis changed: `PlanScoring::UncoveredRegion`
leads `choose_plan`'s sort key with whether the opponent's plate already covers the
candidate sweep, tested with the same `swept_segment_segment` the contact phase uses
and against the same plate capsule `can_cover` builds. `SHIELD_COVER_MARGIN = 1/8` is
half the shipped plate's quarter half-width. It is a **preference, not a filter**: a
fully covered body still yields a plan, because `decide_with_intent` answers a missing
plan with footwork and a filter would turn a good guard into a pacifist.

### The measurement, and the miss

All rows are `--seeds 100 --mirrored --b-two-handed on`, 200 trials.

| Fighter | Brute | Fighter hp | Brute hp | Fighter kills | Brute kills | decided | severances | weapon/shield |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| attack-moves | attack-moves | 0.9885 | 0.5271 | 17 | **0** | 8.5% | 110 | 20.78% |
| attack-moves | tactical | 0.9980 | 0.6089 | 12 | **0** | 6.0% | 51 | 9.68% |
| attack-moves | **openings** | 0.9978 | 0.5866 | 19 | **0** | 9.5% | 70 | 8.70% |
| tactical | tactical | 0.9985 | 0.5272 | 13 | **0** | 6.5% | 152 | 9.33% |
| openings | openings | 0.9980 | 0.5863 | 7 | **0** | 3.5% | 170 | 8.71% |
| **openings** | attack-moves | 0.9928 | 0.6209 | 5 | **0** | 2.5% | 187 | 13.60% |

Zero refused submissions in every row.

**The bar was Fighter end health below `0.90`. It ended at `0.9978`.** Missed, and not
narrowly -- the Fighter's health does not move outside `0.9885`-`0.9985` under *any*
pairing measured here, including the two that predate this session.

**The mechanism nevertheless works, and that is what makes the miss informative.**
Against the same `attack-moves` Fighter, swapping the Brute from `tactical` to
`openings` cuts the shield's share of resolutions from 9.68% to 8.70%; symmetrically it
falls from 9.33% to 8.71%. The policy finds the hole it was written to find, roughly a
tenth of the plate's interception, repeatably. It also makes the Brute commit more:
severances 51 -> 70 and the decided rate 6.0% -> 9.5% against the same opponent.

**And none of it reaches the Fighter.** The Brute records **zero kills in all six
configurations**, and the extra aggression is paid for out of its own health
(0.6089 -> 0.5866). Beating the guard was worth almost exactly nothing, which is
evidence about where the deficit actually is:

- Target selection is **not** the binding constraint. It was moved, measurably, in the
  intended direction, and the outcome did not follow.
- The `attack-moves` control remains the most *lethal* script on either body (17 kills
  against 13 for tactical and 7 for openings), while producing the fewest severances.
  Fewer, harder commits beat more, better-aimed ones -- which points at closure energy
  per blow rather than at blow placement.
- `openings` on the **Fighter** is the least lethal row in the table (5 kills) while
  taking the most limbs (187). Taking limbs and ending fights have come apart.

**No tuning was done against any of this.** `SHIELD_COVER_MARGIN` was fixed from the
plate geometry before the first run and not revisited; the divisor-by-win-rate failure
mode `AGENTS.md` names is exactly what these numbers would have invited.

**What session 04 and any successor should read off this.** The remaining Brute deficit
is not the shield and not the policy. It is that a Brute blow does not carry enough
energy into a body to matter, which is the same 35x scale gap
`docs/reference/articulated-mechanical-gate.md` already records and which session 02
found from the other side. A ranged or mass-based change is a mechanics session, not a
policy one.

### Pins -- the prediction held

**No registered pin moved**, verified by comparing every wide hash literal against
`HEAD` rather than by trusting the suite: `docs/reference/hashes.md` 39 identical,
`crates/web/src/lib.rs` 28, `tools/wasm_check.js` 22,
`crates/sim/src/combat/arena.rs` 7, `crates/sim/src/world.rs` 6. `hashes.md`'s diff is
line-anchor drift alone: two insertions in `lib.rs` moved eleven anchors by exactly
`+8`, recomputed from source and re-verified.

`LEARNED_INFERENCE_DIGEST` did not move, which is the load-bearing one:
`PlanScoring` is a new axis beside `TacticalIntentV1` rather than a new intent, so the
learned action vocabulary is untouched by construction. Adding an intent would have
been a re-score.

### Two things this session did not expect

**`the_learned_code_is_refused_by_name` used `6` as "a number nobody has heard of".**
Appending `openings` made that false and the test went red -- the append-only registry
working rather than a nuisance. The sentinel is now `7`, with an assertion that
`from_code(7) == None` beside it so the next append is told what to do.

**Mixed pairings now have a `lab trace` command**, so
`a_recording_command_exists_only_where_lab_trace_could_actually_produce_one` was
pinning a claim this session deliberately falsified. Rewritten rather than re-recorded:
scripted mixed pairings assert the new `--hero-policy`/`--monster-policy` command,
`learned` keeps its narrower `--opponent` spelling, and `neutral` still has none in
either direction because it is a browser policy and not a `lab` script.

### One stale mirror that was not there

The plan named `AGENTS.md` and `crates/policy/src/lib.rs` as both claiming the lab's
`--policy` vocabulary is `composed|windmill|neutral`. **`AGENTS.md` does not contain
that claim** -- its only `neutral` is "behaviour-neutral" in an unrelated sentence, and
its four `--policy` lines are all correct. Only the `lib.rs` doc comment was wrong, and
it now names the real vocabulary and says which word was never accepted.

The `articulated-abi.md` policy table was stale as described, listing codes 0-4 and
never mentioning `tactical`; it now carries 5 and 6 and says it was behind.

### Gate results

| gate | result |
|---|---|
| `cargo test --workspace --no-fail-fast` | exit 0 |
| `cargo test --workspace --features cartesian-recoil --no-fail-fast` | exit 0, 738 in the largest suite |
| `cargo build --release --target wasm32-unknown-unknown -p web` | exit 0 |
| `node --test tools/wasm_check.js` | 30/30, native == wasm |
| `npx tsc --noEmit` | exit 0 |
| `node --test client/test/studio-shell.test.mjs` | 23/23 |
| `node --test client/test/worker-protocol.test.mjs` | 64/64 |
| `node tools/check_docs.js` | passed |
| `git diff --check` | clean |
| `lab duel --seeds 400` | 59.5% win rate, 1414 ticks mean -- the legacy surface is untouched by an articulated policy |
