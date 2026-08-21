# The fighter that learned the whole roster

**Status:** complete -- full native, exact-law, wasm, browser, replay, ABI, documentation, and dependency gates passed.
**Outcome:** Train one tactical checkpoint against every shipped `PolicyKind`, require it to win consistently on disjoint mirrored seeds, then expose that exact artifact as a selectable policy without moving authoritative state or an existing golden.

## Contract

The learned fighter is the existing tactical-V2 network above `StrikePlanner`, not a second command grammar. The network may choose `Close`, a named strike, `Guard`, either evade, or `Disengage`; the fixed-point planner remains the only component that constructs commands. Its chamber and commit use `Fx::ONE` effort. Its feet hold measure, cross it during the commit, and withdraw during recovery.

Training walks all five entries of `PolicyKind::ALL` in both fixture orientations. A candidate's roster score is the minimum opponent mean, so strength against four opponents cannot buy a failure against the fifth. The safety term penalizes a decision sample inside the currently observed enemy weapon envelope unless the stored candidate is making a full-effort attack or withdrawing at least `7/8` speed directly away. Literal outside time remains a separate reported column. This correction was measured rather than assumed: a Fighter that won 65--83% of held-out fights spent only 59.5% outside against a scripted Brute because that longer-reach opponent continuously pursued, so spatial occupancy was partly the opponent's action. The candidate does own whether it attacks, escapes, or lingers. None of this evidence enters `World`, a command, a replay, or a digest.

Promotion requires, for each opponent separately over 200 held-out seeds in both orientations:

- no refused candidate command;
- replay equality on sampled learned fights;
- at least 60% wins, counting a points decision for Heroes as a win and a draw/loss as not a win;
- a 95% Wilson lower bound above 50%;
- every attacking command that the learned tactical wrapper offers has at least one arm at `Fx::ONE` effort;
- at least 90% of decision samples are outside the observed enemy weapon envelope, a full-effort attack, or a decisive withdrawal; literal outside time is always printed and cannot be substituted for this column.

If any row misses, the artifact remains native-only evidence and session 03 does not start.

## Sessions

1. [`learned-roster-01-the-score-cannot-hide.md`](learned-roster-01-the-score-cannot-hide.md) -- roster-min objective, spacing/force evidence, and an evaluator that names every opponent.
2. [`learned-roster-02-the-checkpoint-earns-its-name.md`](learned-roster-02-the-checkpoint-earns-its-name.md) -- train, evaluate on disjoint seeds, iterate without moving the gate, and commit the exact tactical checkpoint only if it passes.
3. [`learned-roster-03-the-policy-you-can-select.md`](learned-roster-03-the-policy-you-can-select.md) -- add the checkpoint-backed policy to native trace and the Arena after the artifact passes.

## Hash prediction

Sessions 01 and 02 change only host-side learning, reporting, a new tactical checkpoint, and tests. Session 03 adds a new browser-local inference choice and a new tactical inference receipt. No simulation rule, fixed-point input grammar, scenario construction, existing default configuration, replay codec, frame/publication ABI, state-digest grammar, or existing learned-V1 checkpoint changes. Therefore every registered hash and fingerprint must remain exact, including `LEARNED_INFERENCE_DIGEST`. A new tactical-V2 cross-target digest is additive; it is not permission to re-record an existing pin.
