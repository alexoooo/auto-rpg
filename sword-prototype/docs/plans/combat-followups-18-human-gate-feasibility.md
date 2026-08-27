# Session 18b -- point the promotion instrument at a person

> **Split, 2026-08-26. Read `docs/plans/combat-followups-18a-engagement-instrument.md`
> first, and do not start this file until it has landed.**
>
> This session was written as one and reads as "go and play the game". Its recorder half landed
> as 18a, and the page now has a **Guided playtest** flow that owns the declared schedule, capture,
> autosave and report. What remains here is the person, the readings and the verdicts, unchanged
> in what they ask for. No human row or gate-feasibility verdict exists yet.
>
> The filename keeps its `-18-` stem because `src/options.ts` names it in a docstring that
> has to resolve. The heading is 18b; the path is not.
>
> **Three claims below are superseded by session 19 and are struck rather than rewritten.**
> "No such formatter exists and none of the four current derivations produces a margin" is
> false -- `scripts/research-ledger.mjs` ships one, and moving it into the TypeScript program
> is 18a's item 7. The instruction to replace the never-attacked cell's `+Infinity` now
> re-opens a landed, tested ledger contract; only its human-facing rendering is still open.
> And items 7 and 10 remain the same optional HUD panel written twice.

> **Corrections, 2026-08-26.** Measured against the tree at `86b74c8`.
>
> - **Eight anchors in this file pointed at the wrong line** and have been re-pointed by
>   locating the construct each sentence names: `assessTournamentCandidate` is at
>   `tournament.ts:375`, the never-attacked cell's `Number.POSITIVE_INFINITY` at `:712` (there
>   is no `Infinity` anywhere near the old `:241-245`), the inline matcher at
>   `options.ts:1331`, the credit loop at `:1332`, the guard-release branch at `:1315`, the
>   engagement tracker at `research-havok.mjs:32`, the `opportunityForAction` call at `:149`
>   and the `onSample` re-projection at `:174`. `tests/docs.test.mjs` could not see any of
>   these: it checks that an anchor lands *inside* its file, not that it lands on what the
>   prose means.
> - **"None of the four current derivations produces a margin" is a stale count.** Since
>   session 17A there is **one** derivation over the frozen thresholds,
>   `assessTournamentCandidate`; the other two threshold comparisons in the tree are ad-hoc
>   floors on different constants. This file's own later sentence already calls it "the only
>   derivation" -- the two halves contradict each other.
> - **The bundle cost is overstated.** `research-matrix.ts` is a type-only import in
>   `tournament.ts` and erases; the real cost is `artifact.ts` and `persistence.ts`. The fix
>   is still right.
> - **Items 7 and 10 are the same item** (the optional HUD panel), written twice. Delete one.
> - **The session numbering collides.** `docs/measurements.md` already carries headings for
>   "Session 18", "Session 19" and "Session 27" that are *owner follow-ups*, not these plan
>   sessions. Say which numbering a new heading uses before writing one.
> - The axe and the `sword+axe` loadout are playable now and are missing from the feel-question
>   list. So is the 14.2-point duelist swing session 16 shipped, which
>   `docs/measurements.md` now carries as an owed item.

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

Before 18a, the instrument had never been pointed at a person: there was no shared recorder,
`behaviourRecord()` was constructed by nothing outside tests, the research path hand-built an
`EngagementTracker`, and `src/main.ts` produced no engagement row. **That condition is
superseded.** The shared `BoutRecorder` and guided page acquisition now exist; what has still
never happened is the human sitting itself. A gate that no player can clear is a mis-specified
gate, and months of compute chasing it would be the most expensive possible way to find out.

## One recorder, two loops

The two bout loops -- `runBout` in `scripts/measure.mjs` and the render loop in `src/main.ts`
-- already expose the same two events. Give them one recorder instead of one hand-rolled
tracker and one absence.

1. Add a DOM-free `BoutRecorder` in TypeScript that owns a `BehaviourRecord` per fighter and
   consumes exactly `onSample({ view, dt, clock })` and `onEvent(event)`. **That is not the
   shape `runBout` emits.** `runBout` emits `{ left, right, dt, clock }` carrying `Combatant`s
   (`scripts/measure.mjs#L283`); `{ view, dt, clock }` is `runResearchBout`'s per-fighter hook
   re-projection one layer up (`scripts/research-havok.mjs#L174`). Take the per-fighter
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
   (`src/fighter.ts#L1458`) -- so intent must be captured by wrapping the mind, and
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
   `onSample`, and `EngagementTracker.attack` (`engagement.ts#L179`) is first-writer-wins, so
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
   produced by a single shared formatter. ~~**No such formatter exists and none of the four
   current derivations produces a margin** -- `assessTournamentCandidate` emits threshold strings
   with no achieved value. Build one over `TOURNAMENT_THRESHOLDS`, and rewrite
   `assessTournamentCandidate` to consume its rows, or the count of independent derivations goes
   from four to five.~~ **Superseded 2026-08-26 by session 18a:** `learning/gates.ts` is the one
   derivation and all three consumers use it. ~~Fix one meaning for a never-attacked cell while you
   are there: the tournament says `+Infinity`, so this is a choice to make rather than a
   disagreement to settle.~~ **Superseded 2026-08-26 by sessions 19 and 18a:** wire Infinity stays;
   the shared human table renders it as “never attacked”.
   **Superseded for 18b acquisition, 2026-08-26:** the guided panel prints and exports the complete
   shared table for the scheduled actor, which is the subject of the human/specialist comparison.
   It does not present the fixed Swinger opponent as a second research row. Both underlying
   `BoutRecorder` records remain available through the ordinary diagnostic seam.
10. Optional and worth the hour: a HUD panel behind an existing toggle showing the two or three
   gates that move fastest, so a mistake is visible during the bout rather than after it. The
   rig and learned-options panels in `src/hud.ts` are the pattern; it rides the existing Tab
   toggle for free.
~~7. Optional and worth the hour: a HUD panel behind an existing toggle showing the two or three
gates that move fastest, so a mistake is visible during the bout rather than after it.~~
**Superseded 2026-08-26:** this duplicated item 10; item 10 is the sole optional HUD task.

## Take the readings

### Player-facing procedure

Click **Guided playtest** on the ordinary setup screen. Do not use DevTools, paste code, enter
seeds or manually rebuild matchups: `src/playtest.ts` pins the validation base seed 310013 and an
immutable 61-assignment protocol. It runs one excluded shakedown, then four human repeats on both
sides of six cells (48 official human rows), followed by one page-specialist control on both sides
of those cells (12 rows). Every assignment faces Warrior/sword+empty/Swinger. The human controller
is reported honestly as `human+idle-spare`: the player drives the selected hand while the existing
Idle policy owns the unused hand, and `F` changes which hand is driven.

The panel autosaves after each verdict and may be exited between bouts; reopening resumes the same
assignment. Reloading during a bout records an explicit aborted attempt and retries it rather than
advancing the schedule. At the end, **Copy results for Codex** or **Download report** produces the
complete protocol, rows, missing assignments, frame/focus integrity and feel answers. The player
hands that single report to the implementer, who takes the matching bench specialist rows and makes
the verdicts below.

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
(`src/main.ts#L940`, `src/config.ts#L38`) where the bench advances it by an exact `1/60`
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
  ways** and a test asserting general agreement would simply fail. `opportunityForAction`
  requires `striker === "sword"` for `thrust` (`engagement.ts#L118-L123`) where the inline matcher
  falls through to `true` (`options.ts#L1331`); `research-havok.mjs#L149` credits exactly one row,
  **the hand the label named**, where `options.ts#L1332` credits every viable match, which
  depresses dual-wield conversion; the labelled paths fire on an option-change edge and the
  label-free path on a button edge at 240 Hz; and only the label-free path counts a guard
  *release* as an attack (`options.ts#L1315`). (This said "credits only the first matching row",
  which was the defect fixed on 2026-08-25 -- the first row was the primary fist whichever hand
  the label named. The disagreement survives; its cause changed.)
  Add `the_four_known_attack_path_disagreements_are_measured_not_assumed`
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
