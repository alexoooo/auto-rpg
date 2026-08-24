# Session 18 -- point the promotion instrument at a person

## Outcome

Establish whether the engagement gates are reachable at all, by measuring a human player on
the exact instrument that will judge every research artifact, in the exact harness the human
plays in. Then answer the feel questions that `docs/measurements.md` still lists as open,
while the game is still free to change.

This session spends hours, not weeks, and it can invalidate the entire compute phase. That is
its purpose. No research budget is authorized until it lands.

## Why this comes before compute

The thresholds were frozen before any of the four directions ran, which is the right order for
honesty and the wrong order for feasibility. Nothing has ever been shown to reach them:
`docs/measurements.md` records legacy specialists at **0.2282** opportunity-attack and the
scripted meta at **0.2031**, against a **0.65** gate -- the binding gate is roughly 3x away and
has never been cleared by anything.

And the instrument has never been pointed at a person. There is no shared recorder to point.
`behaviourRecord()` at `src/options.ts#L418` is constructed only by
`scripts/evaluate-options.mjs` and `scripts/training-evaluator.mjs`; the research path builds
its own `EngagementTracker` by hand in `scripts/research-havok.mjs#L28` on top of `runBout`'s
`onSample`/`onEvent` callbacks; and `src/main.ts`'s render loop builds nothing at all. A human
bout currently produces no engagement row. A gate that no player can clear is a mis-specified
gate, and months of compute chasing it would be the most expensive possible way to find out.

## One recorder, two loops

The two bout loops -- `runBout` in `scripts/measure.mjs` and the render loop in `src/main.ts`
-- already expose the same two events. Give them one recorder instead of one hand-rolled
tracker and one absence.

1. Add a DOM-free `BoutRecorder` in TypeScript that owns a `BehaviourRecord` per fighter and
   consumes exactly `onSample({ view, dt, clock })` and `onEvent(event)` -- the shapes
   `runBout` already emits. It calls the existing `recordBehaviourSample`, `recordCombatEvent`
   and `recordIntentAttack`; it does not reimplement any of them.
2. Drive it from both loops. `scripts/research-havok.mjs` replaces its hand-built tracker with
   the recorder; `src/main.ts` drives the recorder from the same two events. After this there
   is one construction site, and a metric that exists in one loop and not the other is a bug
   with a test.
3. **The recorder is blind to who is deciding.** It reads published `FighterView` and combat
   events only. It may not read `Controls`, pointer state, `driving`, `actingHand` provenance,
   or whether the mind is human. A human row and a policy row differ only in the mind that
   produced the commands.
4. A human emits no option label, so attack intent comes from the label-free intent-edge path
   the evaluator already uses for controllers without option labels -- including bow release,
   and including natural attacks. Do not add a human-only attack detector; if the label-free
   path is weaker than the labelled one, that weakness applies to the specialist controls too
   and must be stated rather than patched on one side.
5. Expose the live record and derived engagement row as `__sword.engagement`, per fighter,
   readable mid-bout, reset by restart.
6. At verdict, print one gate table per fighter: each threshold, the achieved value, the signed
   margin, pass/fail. Same column names, same order, same derivation as the headless report,
   produced by a single shared formatter. Do not re-implement the table for the page.
7. Optional and worth the hour: a HUD panel behind an existing toggle showing the two or three
   gates that move fastest, so a mistake is visible during the bout rather than after it.

## Take the readings

Every measurement names its harness, and this one has a trap in it. The baseline rows in
`docs/measurements.md` were taken in the **bench** harness (`scripts/measure.mjs`, NullEngine
with real Havok). A person plays in the **page** harness. Those two are already known to
disagree -- 264.97 mm against 242.88 mm on the arm's peak transient with identical code, about
9 %, and why is still not established. A human page row compared against a bench baseline row
is not a comparison.

So take three sets, and label every row with its harness:

- **Human, page harness.** Play the cells named in the engagement baseline, both sides,
  mirrored, enough repeats per cell that a single good or bad bout cannot carry it. Record
  every row, including the ones where you played badly; a trimmed set answers a different
  question.
- **Specialist control, page harness.** The same specialist policies over the same cells, run
  in the page, so the human has a control taken in its own harness.
- **Specialist control, bench harness.** The existing baseline, re-derived if session 17's
  deletions moved anything, so the page-to-bench offset for these gates is itself measured.

Write all three into `docs/measurements.md` under one dated heading, with the harness named in
the heading and in each table. If the page-to-bench offset on any gate exceeds the margin the
gate is being judged by, say so plainly -- that is a finding about the instrument, and it
outranks any conclusion drawn from either set.

## Settle the open feel questions

The game is unfrozen now and will be less free later. While a person is already at the
keyboard, close as many of the named-open questions from `docs/measurements.md` as the sitting
allows: fixed-camera body-relative human aim; both zoom clamps; walking and crouching material
comparison; the 0.08-versus-0.3 corpse-strength pair; broader blood-scale play; bow draw under
pressure; the axe's missing thrust; in-flight arrow-trace readability; shield and buckler
interception now that session 16 aims cover at a predicted arrow crossing; and the full
Fixed/Overhead loadout, side and hand-choice matrix.

Every resulting change to a number in `src/config.ts` carries its measured before/after table
beside it, per the standing house rule. Land these as ordinary commits. They are not a
distraction from the research phase; they are the reason the research phase exists, and they
are cheapest to make now.

## Decide

Compare the human rows against each gate and record one of three verdicts per gate, with its
evidence, in `docs/measurements.md`:

- **Reachable and discriminating.** A competent human clears it and the specialists do not.
  The gate stands unchanged and is now known to measure something a player can do.
- **Reachable but trivial.** Both the human and the specialists clear it comfortably. The gate
  stands but is recorded as non-binding; it must not be cited as evidence a controller is good.
- **Not reachable.** A competent human cannot clear it in the cells where the specialists fail.
  Correct the gate here, in this session, with the human rows as the argument, and state what
  the corrected threshold is measuring. A gate corrected against human evidence before any
  research run is honest; the same edit after seeing a run is not, and session 20's digest
  freezes it against exactly that.

If the human clears 0.65 opportunity-attack easily while every specialist sits near 0.20, that
is the strongest possible authorization for the compute phase: the gap is real, a player-shaped
behaviour exists on the other side of it, and a search has something to find.

## Tests and adversarial proof

- `tests/recorder.test.mjs`:
  `the_same_sample_and_event_stream_produces_the_same_record_in_both_loops` -- replay one
  recorded stream through the recorder as driven by each loop and require equal records;
  `the_engagement_recorder_reads_no_controls_or_mind_identity`;
  `a_label_free_mind_and_a_labelled_mind_agree_on_attack_intent_for_the_same_commands` --
  this is the one that decides whether a human row is comparable to a specialist row at all.
- `tests/engagement.test.mjs`: `the_gate_table_formatter_is_shared_by_page_and_report` --
  assert on the produced rows, not on the existence of a function.
- `tests/arena.test.mjs`: `restart_resets_both_engagement_records_to_a_fresh_bout`.

Feed a scripted mind through the visible loop and watch the both-loops test fail while the page
still has no recorder. Then hand the formatter a row that misses one gate by 0.001 and confirm
the table reports the signed margin rather than rounding it to a pass. A test that only asserts
the table is non-empty proves nothing here.

## Accept

- A human bout produces a complete engagement row and a printed gate table with signed margins.
- The recorder is provably blind to mind identity; page and headless rows come from one
  construction site and one formatter, and `scripts/research-havok.mjs` no longer keeps a
  hand-built tracker of its own.
- Label-free and labelled attack intent are shown to agree, or their disagreement is measured
  and stated as a limit on every comparison in this session.
- `docs/measurements.md` carries human, page-control and bench-control tables under a dated
  heading, each naming its harness, plus the measured page-to-bench offset on every gate.
- Every gate carries one of the three verdicts with its evidence, and any correction is
  recorded before any research run exists.
- Feel changes made during the sitting carry their before/after tables in `src/config.ts`.
- `npm test`, `npm run check` and `npm run build` pass.
