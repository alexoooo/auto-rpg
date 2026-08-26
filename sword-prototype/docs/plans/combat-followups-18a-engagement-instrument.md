# Session 18a -- build the instrument before anybody plays

> **Complete 2026-08-26.** The common recorder, page and bench wiring, shared gate table,
> human-safe rendering, specialist bench command and resume-version boundary are implemented.
> No engagement reading was taken and no threshold or feel constant moved. Session 18b is next.
> The completed tree passes 652 tests, type-check and production build; the 120-bout null control
> remains 66/120 at seed 20260823 with 176.17 damage, 10 severs and 1496/1670 scoring contacts.

> **This file is code. Nothing is measured here.**
>
> Session 18 was written as one session and reads as "go and play the game". Four fifths of
> it is software that does not exist yet, and the confusion is real rather than a
> misreading: **a human bout currently produces no engagement row at all**, so the sitting
> session 18 describes cannot be started, let alone missed.
>
> So it splits, on the pattern session 19 used: **18a is a run that can be measured, 18b is
> the person measuring it, and 18a lands first.** 18b is
> `docs/plans/combat-followups-18-human-gate-feasibility.md` -- unchanged in what it asks
> for, now unblocked rather than impossible. Nothing in this file requires a judgement about
> the game, and nothing in it may take a reading.

## Outcome

A bout driven by a person and a bout driven by a policy produce **the same engagement row,
through the same code, in both the page and the bench harness** -- and a gate table with
signed margins can be printed for either one.

That is the whole of it. No cells are played, no numbers are recorded in
`docs/measurements.md`, no gate is corrected, and no number in `src/config.ts` moves.

## Why the instrument does not exist

Three facts, each verifiable in the tree today:

- `behaviourRecord()` in `src/options.ts` is constructed by **nothing outside the tests**.
  Session 17 Stage A deleted `scripts/evaluate-options.mjs` and
  `scripts/training-evaluator.mjs`, its only two callers, and the note beside it names
  session 18 as the reader it is being kept for.
- The research path builds its own `EngagementTracker` by hand in
  `scripts/research-havok.mjs`, on top of `runBout`'s `onSample`/`onEvent` callbacks.
- `src/main.ts`'s render loop builds nothing at all. The page has never recorded an
  engagement anything.

One recorder, two loops. That is the shape.

## What already exists, so nothing is built twice

**Session 19 already shipped the gate-table formatter**, and the session-18 plan's claim that
"no such formatter exists" is stale. `scripts/research-ledger.mjs` exports `measuredGate`,
`unavailableGate` and `engagementGates`, producing exactly the row 18 asks for -- name,
status, value, threshold, comparison, signed margin -- with `validateGate` refusing a row
whose margin does not recompute, and tamper tests behind it in `tests/ledger.test.mjs`.

It cannot be reached from the page. `tsconfig.json` includes only `src` and `vite.config.ts`,
so a formatter living in `scripts/` is outside the TypeScript program and `src/main.ts` may
not import it. **Moving it is the work; writing it is not.**

Likewise already present and not to be reimplemented: `recordBehaviourSample`,
`recordCombatEvent` and `recordIntentAttack` in `src/options.ts`; `EngagementTracker`,
`attackOpportunity` and `opportunityForAction` in `src/learning/engagement.ts`.

## The work, in order

### 1. Break the `options.ts` <-> `tournament.ts` cycle

Move `OPPORTUNITY_WINDOW_SECONDS` and `STALL_WINDOW_SECONDS` out of
`src/learning/tournament.ts` into `src/learning/engagement.ts`, re-exported from
`tournament.ts` so no other caller moves. `engagement.ts` imports them upward today, and that
one edge is why the docstring at the top of `tournament.ts` forbids evaluating any of its
imports at module scope.

Do this first; everything after it is easier without the cycle. **Do not claim a bundle
saving.** `src/main.ts` already pulls `learning/artifact.ts`, `learning/persistence.ts` and
nine of their siblings in through `loadChampionSoFarMind`, which session 19 added. This
removes `learning/tournament.ts` from the page build and nothing else.

### 2. `src/recorder.ts` -- one recorder, no DOM

A `BoutRecorder` owning one `BehaviourRecord` per fighter. It calls the three existing record
functions and reimplements none of them.

- **Per-fighter shape.** It consumes `{ view, dt, clock }` and one combat event at a time.
  That is not what `runBout` emits -- `runBout` emits `{ left, right, dt, clock }` carrying
  `Combatant`s, and the per-fighter shape is `runResearchBout`'s re-projection one layer up.
  Adapt at the bench call site. A side-agnostic recorder is the whole point, and the page has
  no pair-shaped event to give it.
- **It owns the striker-side-to-defender-side flip.** Both files that hand-rolled that are
  deleted. The two surviving statements are `research-havok.mjs`'s `onEvent` and the
  `block:empty` branch of `drain` in `scripts/measure.mjs`, which credits the block to the
  *other* side. Read both, then write it once.
- **Blind by construction.** It may not read `Controls`, pointer state, `driving`,
  `actingHand` provenance, or whether a mind is human. A human row and a policy row differ
  only in the mind that produced the commands.

### 3. Drive it from the bench loop

`scripts/research-havok.mjs` loses its hand-built `EngagementTracker`, its
`opportunityForAction` call and its `tracker.contact` call. All three become recorder calls.
After this there is one construction site, and a metric that exists in one loop and not the
other is a bug with a test rather than a discrepancy nobody can see.

### 4. Drive it from the page loop -- three costs, all load-bearing

**Intent.** The page never sees one: `Fighter.update` calls `this.mind.decide` and keeps the
result locally. The session-18 plan says to wrap the mind, and **that instruction has aged
badly**: `Fighter.mind` is a plain public field whose own docstring promises that taking a
body over is `fighter.mind = somethingElse` with nothing else to do, there are now three
assignment sites in `src/main.ts` -- both branches of `handOver` and session 19's
`__sword.research.load` -- and a fourth is documented as a console idiom. A wrapper installed
at write sites is a list that goes stale.

Prefer an **intent observer on `Fighter`, called immediately after `decide`**. It survives
every reassignment, keeps the pointer-swap promise intact, and is blind to mind identity by
construction, which is the previous section's constraint for free. If a wrapper is chosen
instead, say why, and re-wrap at all three sites.

**Contacts.** Pass `Combat`'s third constructor argument at both `new Combat(...)` calls in
`buildBout`. **Not** the page's blood drain, which breaks on `report.at <= seen` and cannot
separate two contacts stamped in the same frame.

**Samples.** Sample in `arena.scene.onBeforePhysicsObservable` at the `1/240` control step,
which is where `scripts/measure.mjs` samples. Not in `runRenderLoop`: `observe` republishes
the view once per solver substep and the peak of a swing lives inside a frame.

### 5. Label-free attack intent, on both sides

A human emits no option label, so attack intent comes from the label-free intent-edge path --
including bow release, including natural attacks. Do not add a human-only attack detector.

**Take the specialist controls label-free too.** The frozen 0.2282 and 0.2031 baseline rows
ran *both* detectors into one shared `_engagement`, and `EngagementTracker.attack` is
first-writer-wins, so the two blended silently. The file that produced them is deleted and
the rows cannot be re-derived from it. A human has no labels and cannot reproduce a mixture,
so the only honest comparison is label-free on both sides.

Calling `recordBehaviourSample` with a null option keeps the geometry sample, the range bins,
crouch, vitality and seconds, and skips the labelled attack branch. That is the label-free
mode; a second recorder is not needed.

### 6. `__sword.engagement`, per fighter, readable mid-bout

Build the recorder inside `buildBout` and expose it through a getter beside `left`, `right`
and `combats`. `behaviourRecord` defines `_engagement` non-writable, so a restart must
**reconstruct** the recorder rather than reset it in place -- and `rebuild()` already replaces
the whole bout object, which is why building it there gets the reconstruction for free.

### 7. Move the gate table into the TypeScript program

- Move `measuredGate`, `unavailableGate`, `engagementGates` and the threshold contract into
  `src/learning/gates.ts`, re-exported from `scripts/research-ledger.mjs` so session 19's
  ledger contract and its tests keep passing **without being edited**. If one of them needs
  editing, the move changed behaviour and a frozen contract has been re-opened by accident.
- Rewrite `assessTournamentCandidate` in `src/learning/tournament.ts` to consume those rows.
  Session 19 left that file untouched, so it still pushes threshold strings with no achieved
  value, and there are now genuinely two derivations of the same gates in the tree.
- Fix two literals while consuming: the threshold contract imports six of its eight
  thresholds from `tournament.ts` and hardcodes `0.10` and `0.15` for the symmetric-cap and
  specialist-gap gates, beside the constants that already hold those numbers.

**The never-attacked cell is decided, not open.** Session 19 shipped a no-attack bout as
`Infinity` with a `-Infinity` signed margin, frozen in the ledger row shape and held by
`validateGate`. The session-18 plan says to change it; doing so re-opens a landed, tested
contract. Read what that plan actually objects to -- `+Infinity` *in a report a person reads*
-- and change only the human-facing rendering. The wire value stays.

### 8. `scripts/measure-engagement.mjs` -- the command that does not exist

**Nothing in the tree can produce a bench engagement row.** `npm run ai:evaluate` refuses
`--split train` and `--split validation` by name, refuses `--write-engagement-baseline` by
name, and the test split requires a frozen manifest that does not exist. The surviving bench
path that emits an engagement record is `runResearchBout`, which already returns its tracker's
record.

So: a script over `runResearchBout` that runs a named set of cells with the specialist rule
`scripts/tournament-executor.mjs` already owns -- crawler for the centipede, archer for
`bow+empty`, duelist otherwise -- and prints through the shared formatter from item 7.
Without it the page-to-bench offset cannot be measured at all, and 18b's own precondition
says no conclusion may be drawn from either harness until it is.

### 9. Optional: a HUD gate panel

Two or three gates that move fastest, behind the existing `Tab` readout toggle. The rig and
learned-options panels in `src/hud.ts` are the pattern. Worth the hour before 18b, because a
mistake becomes visible during a bout rather than after it, and 18b plays several dozen.

## Tests, each watched failing

`tests/recorder.test.mjs`, new:

- `the_same_sample_and_event_stream_produces_the_same_record_in_both_loops` -- replay one
  recorded stream through the recorder as driven by each loop and require equal records.
  Watch it fail by feeding a scripted mind through the visible loop **before** item 4 lands.
- `the_engagement_recorder_reads_no_controls_or_mind_identity` -- a source-text assertion, the
  shape `options_and_features_have_no_mutable_config_backdoor` already uses. Mutate by adding
  a read of the driven side and confirm it turns red.
- `a_label_free_mind_and_a_labelled_mind_agree_on_attack_intent_for_a_single_weapon_cut` --
  deliberately scoped to one weapon cut, because the two paths are already known to disagree
  in four ways and a test asserting general agreement would simply fail.
- `the_four_known_attack_path_disagreements_are_measured_not_assumed` -- one fixture each, so
  the limit is a number in the report rather than a caveat in prose:
  1. `opportunityForAction` requires a sword for `thrust`; the inline matcher in
     `recordBehaviourSample` falls through to true.
  2. `research-havok.mjs` credits exactly the hand the label named; the credit loop in
     `options.ts` credits every viable match, which depresses dual-wield conversion.
  3. The labelled paths fire on an option-change edge, the label-free path on a button edge
     at 240 Hz.
  4. Only the label-free path counts a guard *release* as an attack.

`tests/engagement.test.mjs`, new:

- `the_gate_table_formatter_is_shared_by_page_and_report` -- assert on the produced rows,
  never on the existence of a function. **Three consumers now, not two:** the page,
  `assessTournamentCandidate`, and session 19's ledger. Pin all three against one set of rows
  or the move quietly forks it again.
- Hand the formatter a row that misses one gate by **0.001** and confirm the table reports the
  signed margin rather than rounding it to a pass. A test that only asserts the table is
  non-empty proves nothing here.

`tests/arena.test.mjs`:

- `restart_resets_both_engagement_records_to_a_fresh_bout`. Mutate by resetting the record in
  place instead of reconstructing it -- the non-writable `_engagement` is what makes the
  in-place version wrong, and this test is what has to say so.

`tests/ledger.test.mjs`: unchanged, and staying green through item 7 is the assertion.

## What this session may not do

Stated as a rule rather than left to judgement, because it is what makes the split honest:

- **No readings.** No table enters `docs/measurements.md` except the null control below.
- **No verdicts.** No gate is declared reachable, trivial or unreachable here.
- **No gate corrections.** A threshold moved in a session that took no human evidence is
  exactly the edit session 20's digest freezes against.
- **No feel changes.** No number in `src/config.ts` moves; those belong to 18b, beside their
  measured before/after tables.

## Accept

- A human bout produces a complete engagement row, readable mid-bout as `__sword.engagement`.
- Page and bench rows come from one construction site and one formatter, and
  `scripts/research-havok.mjs` keeps no hand-built tracker of its own.
- The recorder is provably blind to mind identity.
- Label-free and labelled attack intent are shown to agree on the scoped case, and their four
  known disagreements are each pinned by a fixture.
- A gate table with signed margins can be printed for a page bout and for a bench bout, from
  one formatter, and `tests/ledger.test.mjs` is green without edits.
- `npm run measure -- --only duelist-swinger --bouts 120` at seed 20260823 still reads
  **66/120 = 55.0 %**. It cannot move -- `src/policies.ts` does not import `src/options.ts` --
  but this session edits `measure.mjs`'s callback plumbing, which is the one way it could.
- `PLAN_SURFACE` in `tests/docs.test.mjs` re-pinned, with the reason above it updated rather
  than only the number.
- The stale claims in `docs/plans/combat-followups-18-human-gate-feasibility.md` are struck
  and dated rather than quietly rewritten: the duplicated HUD item, the derivation count, and
  "no such formatter exists".
- `npm test`, `npm run check` and `npm run build` pass.
- Each landable change committed as it lands.

## What 18b needs from this, and what it still has to decide

18b cannot start until the first four items land. It needs four things from here, and two
decisions are still open when it does:

| 18b needs | from |
| --- | --- |
| a live engagement row in the page | items 2, 4, 6 |
| a gate table with signed margins, page and bench | item 7 |
| a bench control command | item 8 |
| the page bout cap settable to the strata's 45 s | already true via `__sword.config` |

**Two decisions 18b must make before it plays, not after.** The page's policy picker offers
`idle`, `swinger`, `duelist`, `archer` and `crawler`; the research `specialist` opponent is
exactly `policyMind("swinger")` and maps cleanly, but `scripted-meta` and `random-meta` are in
no picker. Either restrict the sitting to one opponent and say so, or add the two meta minds
first. And fifteen cells across three opponents and two mirrors is ninety jobs a split, which
nobody plays: choose the cell list and write it down **before** playing it, under
`docs/measurements.md`'s second governing rule.
