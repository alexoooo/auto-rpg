# Found but not fixed

A register of defects and gaps that were **measured** during the combat follow-ups and deliberately
left alone. Everything here has evidence attached and a stated reason it was not closed on the spot.

This exists because the alternative is worse. A finding that turns up mid-task has three fates: fix
it now and quietly widen the job, mention it once in a report nobody re-reads, or write it down
where the next person will look. Only the third survives a week. **An entry here is not a promise to
fix.** Several of these are decisions rather than debts, and say so.

## How to read an entry

Each one carries: what is wrong, the evidence, why it was not fixed, and what closing it would cost.
Where a measurement is quoted, the harness and the coverage space are named -- a number without
those is the failure mode this directory has hit four times, and every one of those four was exact
over the wrong space rather than sloppy.

When an entry is closed, move it to **Closed** at the bottom with the commit, rather than deleting
it. The reason a thing was left alone is worth as much as the fix.

---

## Open

### 1. All five tournament safety flags are hardcoded `true`

`scripts/tournament-executor.mjs:49-50` is the sole producer of the `safety` object and writes
`{finiteAnatomical: true, capabilities: true, postVerdict: true, stuckActions: true, lifecycle: true}`
unconditionally. The aggregate fold at `src/learning/tournament.ts:274-277` is a conjunction seeded
all-`true`, so it cannot answer anything else. The five `if (!safety.X) failures.push(...)` branches
in `assessTournamentCandidate` are therefore **dead in production**, reachable only from test
literals.

`docs/design.md:325` documents the five as a registration requirement -- *"and five safety flags --
finite/anatomical commands, capability masking, no post-verdict action, no stuck action, and
lifecycle"* -- with nothing behind them. No separate harness computes them and is merely unwired;
there is no producer at all.

**Why it matters more than a missing check.** A tournament report that says "capability failure:
none" when nothing examined capability is worse than one that stays silent, because a reader cannot
tell a passed check from an absent one. Sessions 23--25 promote a champion on this verdict.

**Why not fixed.** Computing five real safety properties is a session of work, not a fix: each needs
a definition, a place in the bout loop to observe it, and a test that watches it go false on a body
that genuinely fails. `scripts/measure.mjs:221,364-370` has an `onVerdict` / `postVerdictFrames`
mechanism that `tests/integration.test.mjs:98` already uses for a post-verdict lifecycle assertion,
so one of the five has a head start; the other four do not.

**Cost to close.** One session. Natural home is session 23, which already lists *"common cells,
mirrors, controls, safety evidence"* as a verification item
(`combat-followups-23-held-out-ai-tournament.md:51`) without wiring any computation.

### 2. `decisionsPerSecond` in the tournament report is systematically under-reported

`scripts/evaluate-ai.mjs:76` sums the per-decision counts across **all** raw rows, including the
three controls. The controls contribute exactly zero, because `mindFactoryForTournament` returns
`() => control` for them (`scripts/tournament-executor.mjs:35`) and discards the `onDecision`
callback the harness passes -- so `randomMetaMind`, `scriptedMetaMind` and `policyMind` never
report a decision. With three controls and *N* candidates the throughput figure is low by a factor
of `(3 + N) / N`.

**Why not fixed.** It is a one-line fix, but it changes a reported number, and the right fix depends
on an unsettled question: whether controls *should* record their decisions at all. They cannot
today, because none of the three control minds accepts a decision hook. Making them record is the
useful version -- it gives every learned candidate a scripted baseline to be compared against on the
same axis -- and it is a larger change than the arithmetic.

**Cost to close.** One line for the arithmetic. Half a session for the useful version.

### 3. The DAgger teacher can never emit a `thrust`

`src/learning/tactical-teacher.ts:319` is the whole action rule:

```
const action: HandActionName = weapon === "bow" ? "shoot" : weapon === "empty" ? "punch" : "cut";
```

Any held weapon that is not a bow answers `cut`. So the three-branch thrust aiming rule written in
stage C2b is authored, exported and driven by its own test, and **no rollout can reach it.**

**Why not fixed.** Making it reachable is not a bug fix, it is a change to what the teacher *does* --
every sword cut would become a thrust unless a real choice rule is authored between them, and
authoring that rule is a combat-design decision with a balance consequence that has not been
measured.

**Cost to close.** A measured choice rule plus a before-and-after on the null control. Belongs with
whatever session next revisits the teacher.

### 4. A bite's target head is untrainable, in three independent ways

`tacticTargets("bite")` offers only `vital` (`src/options.ts:398`), so the target head has one legal
option on a biting body and the mask leaves nothing to choose. `handActionOption`'s bite branch
never reads `target` at all. And the aim would not matter if it did: a centipede's bite measured
over four seed pairs produced **232 contacts -- 172 left shin, 60 right shin, zero head, zero
torso.**

Each of the three is defensible alone. Together they mean a learned target head cannot be trained,
evaluated or falsified on a bite.

**Why not fixed.** Giving a bite a real aim means giving the natural-attack channel a stroke
envelope it does not have. That is body work, not contract work.

**Coverage space of the measurement.** One unit (`centipede`), four seed pairs, the shipped bite
envelope. It says nothing about any other natural attack, because there is no other natural attack.

### 5. The teacher labels every `cut` with a constant `vital`

The justification on record was a stage B measurement showing that a named aim moved a cut's head
share only 0.071 to 0.045 -- so varying the label would teach a correlation the body would not
produce. **That measurement was superseded**: it compared each named region against `"as-measured"`,
whose cursor sits a median 0.0127 from `high`, so it was one stroke measured twice. Since `4d461ea`
gave named strokes a real span, a named cut separates by roughly 8.7x.

So the constant label now rests on a reason that no longer holds. The label may still be the right
one -- nobody has measured whether a varying cut aim helps -- but the argument recorded beside it is
void.

**Why not fixed.** It is a teacher-behaviour change and needs its own before-and-after, same as
item 3.

### 6. The option layer has no per-weapon guard placement

Measured before `4d461ea`, option-driven, 24 bouts per loadout against `swinger`: `sword+shield`
took **294.7** damage, `sword+buckler` **176.1**, `sword+sword` **202.8**. A shield is the best
guard in the game and produced the worst outcome -- the ordering is not merely off, it is inverted.

The cause found at the time was that a guard was placed identically regardless of what the hand held.
`4d461ea` addressed one half of that (the supporting hand now steps outboard off the line the leader
holds, via `ACTION_TUNING.guardSpread`), but **the loadout comparison has not been re-run since**,
so the current ordering is unknown.

**Why not fixed.** Guard placement per weapon is a combat-design job with real balance consequences,
and it needs the re-measurement first to know how much of the gap `4d461ea` already closed.

**First step is cheap:** re-run the three loadouts at 24 bouts and put the numbers here.

### 7. The tactic tuple is an output but never an input

The feature vector carries `current_movement_*` and `current_action_*`. By the same logic it wants
`current_effector_*`, `current_target_*` and `current_stance_*` -- a controller that cannot perceive
the stance it is holding cannot learn to hold one deliberately.

**Why not fixed.** It is a `featureVersion` bump, which invalidates every checked-in artifact and
every pinned golden in the set. That belongs to a deliberate feature-contract revision, not to an
output change riding in beside it.

### 8. The quality-diversity descriptor is thin, and the argument that kept it is now the only one

The descriptor was left alone partly on the arithmetic `125 x 72 = 9,000` cells against 10,240
genome-evaluations -- "sparser than one elite per cell". That `72` was the nominal `3 x 4 x 6`
reused as a count of legal tuples. Measured: the maximum `|deployableTactics|` on any body is **21**,
the union over the whole body space is 33, and over the thirteen research cells 24. On the true
figures it is 3,000 cells and **3.4 elites per cell** -- thin, but a tuning objection rather than a
refusal.

**The decision stands and the descriptor is unchanged.** What changed is that the outcome-descriptor
argument is now the *only* reason left holding it up, and the record should say so rather than
letting a retired arithmetic argument look like support.

### 9. Nineteen exports went live-to-test-only in session 17 and are still there

`src/learning/evaluation.ts:1-14` carries the one note about it. Eight of the nineteen are in that
file; the rest are `initialPopulation` in `genome.ts`, both of `jobs.ts`, `Network` in `network.ts`,
and three fitness/novelty functions in `meta.ts`. `behaviourRecord` and its three writers in
`options.ts` are in the same state, kept explicitly because session 18's `BoutRecorder` is built on
them (`src/options.ts:1079-1089`).

**Why not fixed.** Deleting them is only correct if session 18 lands without them. The note beside
each already says "if that session lands without them, they go", which is the right trigger.

### 10. Roughly 114 code-span file references name a file that does not exist

Measured at `ab52947` over every `.ts`, `.mjs`, `.js` and `.md` file in the prototype outside
`node_modules`, `dist`, `.deps-stage`, `public` and the gitignored `.review`, resolving each
reference against the whole tree by path suffix: **1,520 code-span file references, 114 stale, 20 of
them in live source and durable docs.** Only 67 carry a line anchor at all, and none of those points
past the end of its file -- so the failure mode is not drifting line numbers, it is references to
scripts session 17 stage A deleted (`evaluate-options.mjs` 19 times, `promotion.ts` 15,
`checkpoint.ts` 13, `training-evaluator.mjs` 12, `promotion-evaluator.mjs` 11, `train-meta.mjs` 9).

**The design problem is not the count.** Most of the 114 are *correct*: `src/learning/evaluation.ts:5-7`
and `src/options.ts:1082-1084` name deleted scripts in order to say they were deleted, and a checker
that demands they resolve would force falsifying accurate history. A handful are genuinely wrong
live pointers -- `kinds.ts` at `src/mind.ts:10` and `src/weapon.ts:26`, `sword.ts` at
`src/main.ts:670` and `docs/design.md:579`, `DESIGN.md` at `src/options.ts:357`. Separating the two
is the work.

**What is already known about the fix.** `tools/check_docs.js` **does** walk
`sword-prototype/docs/**`, verified by probe. It catches a missing file and an out-of-range line;
it checks that a named symbol sits within four lines of the anchor **only when the link text is the
backticked symbol**; and it separately requires the anchor to point at the start of a declaration,
a comment block, or the file. Prose link text gets no symbol check. So the conversion that puts an
anchor under a real check is a Markdown link whose text is the backticked symbol and whose href is
the source path with an `#L` line fragment, aimed at a declaration. Written out here as prose rather
than as an example, because `tools/check_docs.js` reads examples too -- the first draft of this
paragraph spelled the recipe as a real link and the checker refused it for naming a missing file,
which is the most direct evidence available that the check is live on this directory.

That covers Markdown. It does nothing for the 602 code-span references inside source comments, which
cannot be Markdown links and would need a prototype-side test.

---

## Closed

### `TACTICAL_TEACHER_VERSION` was never compared to anything

Recorded during session 17 stage C2a: the constant had three readers and all three *wrote* it, so
bumping it refused exactly zero rows and a row labelled by teacher 1 was indistinguishable from one
labelled by teacher 2. Closed in stage C2b -- `validateDaggerRow` now compares it
(`src/learning/dagger.ts:68`) and `tests/dagger.test.mjs:382-391` watches the refusal fire.
