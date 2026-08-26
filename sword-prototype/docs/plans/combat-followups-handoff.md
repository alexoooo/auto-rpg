# Combat follow-ups handoff -- 2026-08-26

> **Session 19 has landed.** The PPO outer loop, all four resume/checkpoint paths, the common
> append-only ledger, deterministic plateau/ceiling stops, watcher, crash-safe finalization and
> page-side champion-so-far debugging are implemented. The pre-session findings retained below are
> historical and are superseded by `docs/measurements.md` under "Session 19 supersession". The next
> automated session is 20 after the human gate work in 18; no held-out tournament or promotion has
> occurred.

## Read these three things first

1. **`AGENTS.md`** at the prototype root. The working contract: commands, determinism rules,
   the seven house rules, and the traps that have already cost somebody time.
2. **`combat-followups-00-overview.md`**, specifically *What the compute phase must not repeat*
   and *What sessions 19 and 20 inherit*. The first is the standing rules this plan set exists
   to enforce; the second is eleven findings with no other home.
3. **`combat-followups-99-found-not-fixed.md`**. Twenty-two measured defects and decisions
   deliberately left alone, each with its evidence and what closing it would cost. Entries 20,
   21 and 22 are new and bear directly on the next session.

## Where the prototype is

Mechanics, controls, bodies, imported armour, four AI research implementations, artifact
deployment and indexed tournament resume are implemented. **No learned policy is promoted and
the held-out tournament has not been opened.**

Sessions 15, 16 and 17 have landed -- the policy boundary is corrected, feature v4 is frozen,
and acting hand, aim region and body stance are explicit policy outputs. Seven further commits
landed after them: the four owner follow-ups, a documentation-pointer gate, PPO's learned
persistence head, and the dwell marginal that made that head readable. **Their plan files are
deleted**, under this repository's rule that durable results from a closed session belong in a
design, reference or measurement document rather than in a plan. What they measured is in
`docs/measurements.md`, what they decided is in `docs/design.md` and beside the code, and the
compressed rules are in `AGENTS.md`.

## Last verified state

At `HEAD`, from `sword-prototype/`:

- `npm test` -- **593 passed, 0 failed**
- `npm run check` -- clean
- `npm run build` -- clean, ~615 ms
- `node scripts/measure.mjs --only duelist-swinger --bouts 120` at seed 20260823 --
  **66/120 = 55.0 %**, 176.17 damage, 10 severs, 1496/1670 scoring contacts. This is the null
  control; it has not moved across any of the last twelve commits and it must not move under a
  tactic-layer change, because `src/policies.ts` does not import `src/options.ts`.
- `node tools/check_docs.js` from the repository root -- 29 problems, **0 matching
  "sword-prototype"**. Those 29 are pre-existing anchors into `crates/` and are not this
  prototype's; the command has been red for longer than this topic has existed, so do not read
  its exit code as a signal about work here.

## The finding that changes what the next session is

**PPO cannot spend a step budget.** Asked for 400,000 solver steps an arm -- 800,000 across the
two -- an invocation consumed **5,508**, seven tenths of one per cent. Three facts multiply:
`runResearchBout` clamps a bout to `min(boutCapSeconds, limit / physicsHz)` and every stratum
sets 45 s against 240 Hz, so 10,800 steps is the ceiling on one bout however large the budget;
a bout ends when somebody dies rather than at the cap, so a real bout costs about 1,400; and
`trainPpo` runs exactly four bouts, two arms by two splits. It also performs exactly **two
gradient updates** at any budget -- `ppoHeadUpdate` has one call site inside a two-element loop
and there is no `--iterations` flag.

More generally, **a step budget is not a learning budget for three of the four directions.**
NEAT-QD and DAgger scale by `--generations` and `--iterations`; `--solver-steps` only lengthens
the bouts inside a fixed number of updates. Only look-ahead turns steps into fitted rows.

Sessions 20, 21 and 22 derive a step ceiling from measured throughput, run a 24-hour rung
against it, and scale to 72-hour seeds. **For PPO a 24-hour rung completes in about twenty
seconds.** The full account, with its coverage space, is in `docs/measurements.md` under *What
a long run cannot yet tell anybody*.

## First action for the next session

**Session 19, with its scope widened to "make a run runnable, then make it legible", in that
order.** Its plan file carries the corrections; read them before its body, because they change
what the session is.

Concretely, before any ledger row is designed:

1. **Give PPO an outer loop** -- iterations of collect-then-update -- so `--solver-steps` buys
   gradient steps rather than one oversized batch, and so four bouts stops being the whole run.
   This is the single highest-value change in the plan set and **no session owned it**.
2. **Condition or remove the exact-budget throws** in `train-neat-qd.mjs` and
   `collect-dagger.mjs`, which throw unless `consumedSolverSteps === solverSteps` exactly. A
   plateau rule stops a run early by construction, so it cannot land while they stand. Retire
   `fullBudgetCompleted: solverSteps === 1_800_000_000` from both report schemas and
   `RESEARCH_SOLVER_STEP_BUDGET` from `src/learning/research.ts` at the same time.
3. **Give `train-lookahead.mjs` a state file and resume.** It has neither.

Then the ledger, the plateau rule and the champion-so-far are what session 19 says they are.
**If that looks like more than one session, split it: 19a "a run that can be run", 19b "a run
that can be watched", and 19a lands first** -- everything from session 20 onward is arithmetic
over a machine that currently stops after about 180 simulated seconds.

Two things that make 19 cheaper than it reads: **two of the four runners already keep most of a
ledger row** (`train-neat-qd.mjs` pushes a per-generation row with `validationWorstCellScore`
and `archiveCoverage`, flushed every five generations; `collect-dagger.mjs` pushes one per
iteration), so this generalises a working cadence rather than inventing a schema. And its
nineteen line anchors were checked one at a time and **all nineteen resolve and match their
prose** -- the cleanest file in the set.

**The alternative, if 19a looks too large for the day: session 18.** It is a person at a
keyboard, it needs no runner at all, and it is the only session that can invalidate the
promotion gates -- opportunity-attack 0.65 has never been shown reachable by a controller *or*
a player. It also has an unpaid debt waiting: the perception change moved the duelist 14.2
points against the swinger and nobody has played it. It unblocks nothing, which is the argument
against; it can falsify the whole compute phase for a day's work, which is the argument for.

## What remains

| session | result | depends on |
| --- | --- | --- |
| 18 | measure a person on the promotion instrument; settle the open feel questions | -- |
| 19 | a run that can be run, then a ledger, plateau rule and watchable champion-so-far | -- |
| 20 | measure real throughput and derive every ceiling, **in updates** | 18, 19 |
| 21 | one seed per direction under a one-day ceiling, then advance or kill each | 20 |
| 22 | remaining seeds and declared ablations for surviving directions only | 21 |
| 23 | freeze one selection per surviving direction and execute the test matrix once | 22 |
| 24 | integrate one passing artifact, or record the negative result | 23 |
| 25 | full lifecycle gate, confirming playtest, durable close-out, delete this plan set | 24 |

Session 25 deletes the remaining plan set and this handoff, after all results are folded into
durable documentation. Sessions 15--17 have already been through that fold; the pattern is on
record in `828b74b`.

## Three commands the plan set invokes that do not exist

`--rung` (nothing implements it; sessions 21 and 22 both require it), `--run-id` (exists in
NEAT-QD and DAgger, silently ignored by PPO and look-ahead), and `--verify-promoted` (nothing
implements it; sessions 24 and 25 both invoke it). Register entry 22. Each needs an owner
before the session that calls it.

## Retained smoke evidence

| directory | meaning after the interface correction |
| --- | --- |
| `asset-src/learning/research/session15-workers8-smoke/` | old v3/action-v1 NEAT-QD execution evidence only |
| `asset-src/learning/research/session16-final-workers8/` | old v3/action-v1 DAgger execution evidence only |
| `asset-src/learning/research/session18-minimum/` | old tactical/look-ahead accounting evidence only |

Session 20 folds any still-useful totals into `docs/measurements.md` and deletes all three. Do
not carry historical runnable payloads into the new contract.

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

Compute, and these are the ones this pass added:

- **A budget is a ceiling, never an accept criterion.** The number that proves this matters is
  still in the tree in three places; retiring it is session 19's.
- **A run that cannot be watched cannot be abandoned**, and a run nobody can abandon is one the
  game gets frozen around. That is the failure this whole plan set was rewritten to escape.
- **State the coverage space before the result.** Seven exact sweeps over the wrong space were
  taken during this effort; the worst measured a change on the tree without that change and
  matched `HEAD` bit for bit. `docs/measurements.md` carries this as its second governing rule.
- **A number pointing at nothing is worse than no number**, and re-pointing a knowingly dead
  anchor makes it read as freshly verified. Name the construct; a line number is a fact with no
  test.
