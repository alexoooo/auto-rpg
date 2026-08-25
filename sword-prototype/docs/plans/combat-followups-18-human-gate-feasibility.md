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
`docs/measurements.md` records the scripted specialists at **0.2282** opportunity-attack and the
scripted meta at **0.2031**, against a **0.65** gate -- the binding gate is roughly 3x away and
has never been cleared by anything.

And the instrument has never been pointed at a person. There is no shared recorder to point.
`behaviourRecord()` is constructed by **nothing outside the tests** -- session 17 Stage A
deleted `scripts/evaluate-options.mjs` and `scripts/training-evaluator.mjs`, which were its
only two callers, and the note now beside it in `src/options.ts` names this session as the
reader it is being kept for. The research path builds its own `EngagementTracker` by hand in
`scripts/research-havok.mjs#L28` on top of `runBout`'s `onSample`/`onEvent` callbacks, and
`src/main.ts`'s render loop builds nothing at all. A human bout currently produces no
engagement row. A gate that no player can clear is a mis-specified
gate, and months of compute chasing it would be the most expensive possible way to find out.

## One recorder, two loops

The two bout loops -- `runBout` in `scripts/measure.mjs` and the render loop in `src/main.ts`
-- already expose the same two events. Give them one recorder instead of one hand-rolled
tracker and one absence.

1. Add a DOM-free `BoutRecorder` in TypeScript that owns a `BehaviourRecord` per fighter and
   consumes exactly `onSample({ view, dt, clock })` and `onEvent(event)`. **That is not the
   shape `runBout` emits.** `runBout` emits `{ left, right, dt, clock }` carrying `Combatant`s
   (`scripts/measure.mjs#L283`); `{ view, dt, clock }` is `runResearchBout`'s per-fighter hook
   re-projection one layer up (`scripts/research-havok.mjs#L55-L56`). Take the per-fighter
   shape and adapt at the bench call sites: a side-agnostic recorder is the whole point, and
   the page has no pair-shaped event to give it. It calls the existing
   `recordBehaviourSample`, `recordCombatEvent` and `recordIntentAttack`; it reimplements none
   of them, and it also owns the striker-side-to-defender-side flip. **Both files that used to
   hand-roll that flip are deleted**; the surviving statement of it is
   `scripts/research-havok.mjs`'s `onEvent`, plus the block-credit paragraph under "Session 17
   Stage A" in `docs/measurements.md`.
2. Move `OPPORTUNITY_WINDOW_SECONDS` and `STALL_WINDOW_SECONDS` out of `tournament.ts` and
   into `engagement.ts`, re-exporting from `tournament.ts`. `engagement.ts#L3` imports them
   upward today, so a recorder that imports `engagement.ts` drags `artifact.ts` and
   `research-matrix.ts` into the page bundle. Two lines, and it breaks the chain.
3. Drive it from both loops. `scripts/research-havok.mjs` replaces its hand-built tracker with
   the recorder; `src/main.ts` drives the recorder from the same two events. After this there
   is one construction site, and a metric that exists in one loop and not the other is a bug
   with a test.
4. **Two page-side costs the plan originally missed, both load-bearing.** The page never sees
   an `Intent` -- `Fighter.update` calls `this.mind.decide` and keeps the result
   (`src/fighter.ts#L1381`) -- so intent must be captured by wrapping the mind, and
   `fighter.mind` is **reassigned by takeover** (`src/main.ts#L601`, `#L619`). A wrapper
   installed only in `mindFor` is discarded the first time a person takes a body over, which
   is the only case this session exists to measure; `handOver` (`#L560`) must re-wrap. And
   contacts must come from `Combat`'s `onReport` third argument (`src/combat.ts#L216`), which
   `src/main.ts#L367-L368` does not currently pass -- **not** from the page's blood drain at
   `#L461-L475`, which breaks on `report.at <= seen` and cannot separate two contacts stamped
   in the same frame.
5. **The recorder is blind to who is deciding.** It reads published `FighterView` and combat
   events only. It may not read `Controls`, pointer state, `driving`, `actingHand` provenance,
   or whether the mind is human. A human row and a policy row differ only in the mind that
   produced the commands.
6. A human emits no option label, so attack intent comes from the label-free intent-edge path
   the evaluator already uses for controllers without option labels -- including bow release,
   and including natural attacks. Do not add a human-only attack detector.
7. **Take the specialist controls label-free too, and supersede the mixed rows.** The frozen
   0.2282 and 0.2031 baseline rows were produced with *both* detectors running into one shared
   `_engagement`: the deleted `evaluate-options.mjs` recorded the labelled path through
   `recordBehaviourSample` and the label-free one through `recordIntentAttack` in the same
   `onSample`, and `EngagementTracker.attack` (`engagement.ts#L137`) is first-writer-wins, so
   the two blended silently. **The file is gone and the rows cannot be re-derived from it**, so
   the comparison has to be built fresh here rather than diffed against a rerun. A human has no labels and cannot reproduce a mixture, so the
   only honest comparison is label-free on both sides. Re-take the controls that way, report
   the mixed rows as superseded, and state the difference between the two derivations as a
   measured quantity rather than a footnote.
8. Expose the live record and derived engagement row as `__sword.engagement`, per fighter,
   readable mid-bout. Build it inside `buildBout` and expose it through a getter beside
   `left`/`right`/`combats`: `behaviourRecord`'s `_engagement` is defined non-writable, so a
   restart must **reconstruct** the recorder, not reset it in place.
9. At verdict, print one gate table per fighter: each threshold, the achieved value, the signed
   margin, pass/fail. Same column names, same order, same derivation as the headless report,
   produced by a single shared formatter. **No such formatter exists and none of the four
   current derivations produces a margin** -- `assessTournamentCandidate`
   (`tournament.ts#L197-L221`) emits threshold strings with no achieved value. Build one over
   `TOURNAMENT_THRESHOLDS`, and rewrite `assessTournamentCandidate` to consume its rows, or
   the count of independent derivations goes from four to five. Fix one meaning for a
   never-attacked cell while you are there: `tournament.ts#L241-L245` says `+Infinity`, and it
   is now the **only** derivation -- session 17 stage A deleted the `evaluate-ai.mjs` helper
   that answered `null` for the same cell, so this is a choice to make rather than a
   disagreement to settle. It is exactly the cell a bad human bout makes, and `+Infinity` in a
   report a person reads is not the choice.
10. Optional and worth the hour: a HUD panel behind an existing toggle showing the two or three
   gates that move fastest, so a mistake is visible during the bout rather than after it. The
   rig and learned-options panels in `src/hud.ts` are the pattern; it rides the existing Tab
   toggle for free.
7. Optional and worth the hour: a HUD panel behind an existing toggle showing the two or three
   gates that move fastest, so a mistake is visible during the bout rather than after it.

## Take the readings

Every measurement names its harness, and this one has a trap in it. The baseline rows in
`docs/measurements.md` were taken in the **bench** harness (`scripts/measure.mjs`, NullEngine
with real Havok). A person plays in the **page** harness. Those two are already known to
disagree -- 264.97 mm against 242.88 mm on the arm's peak transient with identical code, about
9 %, and why is still not established. A human page row compared against a bench baseline row
is not a comparison.

There is now a second, *named* mechanism for a gate offset, and it is specific to these gates.
The control step is `1/240` in both harnesses, so every duration accumulator -- stall, drought,
retreat -- is harness-identical. But `attack` and `contact` window arithmetic reads
`view.clock`, and the page advances that clock by a wall-clock delta capped at `1/20`
(`src/main.ts#L936`, `src/config.ts#L38`) where the bench advances it by an exact `1/60`
(`scripts/measure.mjs#L348`). Under frame drops the page's clock therefore runs fast against
simulated motion and the 0.75 s opportunity window closes early, which depresses
opportunity-attack for reasons that have nothing to do with how anybody played. **Record frame
rate beside every human row**, and if a sitting drops frames, that row is evidence about the
instrument before it is evidence about the player.

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
  `a_label_free_mind_and_a_labelled_mind_agree_on_attack_intent_for_a_single_weapon_cut` --
  this is the one that decides whether a human row is comparable to a specialist row at all,
  and it is deliberately scoped, because **the two paths are already known to disagree in four
  ways** and a test asserting general agreement would simply fail. `opportunitiesForAction`
  requires `striker === "sword"` for `thrust` (`engagement.ts#L79`) where the inline matcher
  falls through to `true` (`options.ts#L509`); `research-havok.mjs#L36` credits only the first
  matching row where `options.ts#L510` credits every match, which depresses dual-wield
  conversion; the labelled paths fire on an option-change edge and the label-free path on a
  button edge at 240 Hz; and only the label-free path counts a guard *release* as an attack
  (`options.ts#L493`). Add `the_four_known_attack_path_disagreements_are_measured_not_assumed`
  beside it, pinning each one with a fixture, so the limit is a number in the report rather
  than a caveat in prose.
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
