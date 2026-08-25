# Combat follow-ups handoff -- 2026-08-24

## Where the prototype is

Mechanics, controls, bodies, imported armour, AI research implementations, artifact deployment
and indexed tournament resume are implemented. No learned policy is promoted and the held-out
tournament has not been opened.

Do **not** start any research job yet. Two reviews changed the order:

1. The policy seam review found that the feature-v3/action-v1 contract is not the interface
   worth spending compute on. Sessions 15--17 correct it.
2. The compute-phase review found that sessions 18--22 as originally written reproduced the
   failure this directory exists to escape -- a frozen budget nobody measured, a search that
   outranked the game, and no falsification branch. Sessions 18--22 were replaced. Read
   **What the compute phase must not repeat** in [the overview](combat-followups-00-overview.md)
   before touching any research plan; those three replacements are standing rules, not a
   one-time correction.

## Last verified state

From `sword-prototype/` before the new interface work:

- `npm test`: 454 passed.
- `npm run check`: passed.
- `npm run build`: passed.
- `npm run texture:verify`, `npm run armour:verify`, `npm run asset:verify`: passed.
- `npm run measure -- --seed 20260824`: completed in 310.4 s.
- `npm run ai:options -- --seed 20260824`: all 12 frozen legacy/meta parity rows matched, and
  the command exited 0.

  **Scoped, 2026-08-24.** A session-17 correction replaced this line with "this line is wrong";
  that correction was itself wrong and the original claim stands. `evaluate-options.mjs`
  compared its whole document against `baseline-v1.json` **only when the two base seeds
  agreed** -- otherwise it logged `evaluation seed ... is not checked-in baseline seed ...;
  report completed without replacing it` and fell through to a clean exit. The baseline's
  `baseSeed` is 20260827, so `--seed 20260824` skipped the only check the stale
  `featureVersion: 2` could trip. The paired parity rows run regardless of seed and did match.

  What *was* red is the other invocation: `npm run ai:options` at its **default** seed, also
  20260827, compared and threw `evaluation differs from baseline-v1.json`, and had since
  session 14. Two invocations, two answers; conflating them is what produced the bad
  correction. Session 17 deleted the command, the baseline and the evaluator, so neither runs
  now; `docs/measurements.md`, "Session 17 Stage A", has the account.
- Port 5180 has no listener.

The root `node tools/check_docs.js` currently reports 29 stale root-document source anchors.
None is under `sword-prototype`; do not misattribute them to this topic.

## Interface findings that changed the order

- Camera zoom is not an AI action. It is merely present because `Intent` aliases the human
  `InputState`; only `main.ts` reads the human controls' value.
- Learned networks choose five movement options, seven hand actions and persistence. They do
  not choose the hand or aim region. The option adapter normally chooses primary, silently
  falls back, and supplies its own fixed target.
- Learned v3 has exact one-hot weapon identity for both hands on both bodies, so weapon
  awareness itself is present.
- Neither `FighterView` nor v3 carries arrows in flight. An agent knows a bow exists but cannot
  time a block or dodge against its projectile.
- A hand publishes only tip-speed magnitude, and a bare fist publishes zero. Incoming versus
  receding motion is therefore unavailable at the learned boundary.
- The learned controller does not choose crouch/lean/twist; fixed skills choose them.

## Compute findings that changed the plan

- **The gates have never been pointed at a person, and there is no shared recorder to point.**
  `behaviourRecord()` at `src/options.ts#L887` is built by **nothing outside the tests**: its
  only two callers were `scripts/evaluate-options.mjs` and `scripts/training-evaluator.mjs`,
  which session 17 stage A deleted. `scripts/research-havok.mjs#L28` hand-rolls its own
  `EngagementTracker` on top of `runBout`'s `onSample`/`onEvent` callbacks; and the render loop
  in `src/main.ts` builds nothing. A human bout produces no engagement row. Opportunity-attack
  0.65 has never been shown reachable by a controller *or* a player, against specialist
  controls at 0.2282 and 0.2031 -- and see `docs/measurements.md` on what the 16 rows behind
  0.2282 contain, because two of its eight cells are a club duelist and an idle control.
- **The old budget was an accept criterion, not a measurement.** 1,800,000,000 steps rested on
  a 30,720-step NEAT smoke and a 19,200-step DAgger smoke -- 0.0017 % and 0.0011 % of it,
  extrapolated about 58,600x and 93,800x.
- **The measured half of the old schedule was already 659 hours** of continuous eight-worker
  compute (NEAT 3x86 h plus 26 h ablations, DAgger 3x125 h), with PPO and look-ahead
  unmeasured. PPO is the likely dominant cost and the runner restricts it to `--workers 1`.
- **The old protected-surface rule froze every runtime balance constant for that duration**,
  which would have frozen the entire named-open feel agenda in `docs/measurements.md` for over
  a month.
- **A run is currently a black box until it terminates.** `src/learning/checkpoint.ts` was an
  artifact serializer and session 17 deleted it; there is still no elapsed-time, interval or
  cadence hook anywhere in `src/learning/`. `--resume` and `--stop-after-jobs` allow stopping and continuing; neither
  reports anything.
- **The page and the bench disagree.** 264.97 mm against 242.88 mm on the arm's peak transient,
  about 9 %, cause not established. A human plays in the page; the baseline was taken in the
  bench. Session 18 must take its own page-harness control or its comparison means nothing.

## Retained smoke evidence

| directory | meaning after the interface correction |
| --- | --- |
| `asset-src/learning/research/session15-workers8-smoke/` | old v3/action-v1 NEAT-QD execution evidence only |
| `asset-src/learning/research/session16-final-workers8/` | old v3/action-v1 DAgger execution evidence only |
| `asset-src/learning/research/session18-minimum/` | old tactical/look-ahead accounting evidence only |

Session 20 folds any still-useful totals into `docs/measurements.md` and deletes all three.
Do not carry historical runnable payloads into the new contract.

## What remains

1. Remove camera zoom from combat commands --
   [session 15](combat-followups-15-host-command-boundary.md).
2. Add vector/projectile/morphology perception and feature v4 --
   [session 16](combat-followups-16-policy-perception-v4.md).
3. Add explicit effector and bounded learned stance outputs --
   [session 17](combat-followups-17-tactic-output-v2.md).
4. Point the promotion instrument at a person and settle the open feel questions --
   [session 18](combat-followups-18-human-gate-feasibility.md).
5. Make a long run legible: ledger, plateau rule, champion-so-far --
   [session 19](combat-followups-19-run-legibility.md).
6. Measure throughput, derive every ceiling, freeze the contract --
   [session 20](combat-followups-20-throughput-and-ceilings.md).
7. Run the ladder and kill what does not move --
   [session 21](combat-followups-21-research-ladder.md).
8. Scale only survivors, then sessions 23--25.

## Adversarial constraints

Interface, unchanged:

- A camera value must not survive under a renamed combat field or an untyped fixture.
- `FighterView.projectiles` contains facts, not `isIncoming`, `shouldBlock` or a chosen target.
  Threat ranking belongs in the feature writer and must be pinned independently.
- An arrow is live only while `live && !spent`; a planted or pooled arrow is not a threat.
- Publish velocity vectors from the physics body before contact. Do not reuse the arrow's
  arrival-speed scoring cache as perception.
- Mirror mappings must transform vector components and swap left/right stance labels; an
  involution test alone is insufficient unless asymmetric fixtures make every sign matter.
- Action, effector and target are a joint legal choice. Independent argmax followed by fallback
  silently trains one policy and executes another.
- Capability masks may use published equipment/body facts, but may not reveal opponent policy,
  test split, reward, future contacts or tournament labels.
- Any feature/action/version/digest mismatch must fail before a research runner spends its
  first solver step.
- Backwards compatibility is explicitly out of scope. Delete old trainers, codecs, aliases,
  parity harnesses and fixtures; do not build adapters into the current contract.

Compute, new:

- The engagement recorder must be blind to mind identity. A human row and a policy row differ
  only in the mind that produced the commands.
- Every measurement names its harness. A page reading and a bench reading are not comparable
  without the measured offset between them.
- Checkpoint cadence is a job-index quantity, never a wall-clock trigger. The ledger observes;
  it never participates. Byte-identical resume with checkpointing on and off is the test that
  proves it.
- A ledger row is written whether or not anything improved. "No new champion" is a row with
  signed margins beside it.
- A step budget is a ceiling. The stop is a declared plateau rule computed from the ledger, and
  the report says which condition stopped the run.
- The game outranks the run. Balance changes stay legal; a run in flight is finished under its
  recorded digest or discarded, as an explicit choice.
- A gate may be corrected against human evidence before any research run exists, and never
  after a run has been seen.
- If no candidate passes, the next session is an interface, fitness or gate session. It is
  never a bigger run, and it is never the least-bad controller under a softer name.

## First action for the next session

Implement session 15 and watch its new camera/intent separation tests fail against the current
`zoom` field before making them pass. No compute window is reserved, and none may be reserved
before session 20 lands.
