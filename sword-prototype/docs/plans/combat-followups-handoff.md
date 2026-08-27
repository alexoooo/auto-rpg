# Combat follow-ups handoff -- 2026-08-26

> **Sessions 19 and 18a have landed, 18b's player-facing acquisition flow is ready, and the
> pre-throughput research foundation is in place.** PPO has a real repeated outer loop; all four
> directions have indexed ledger/resume/finalization; run IDs and look-ahead outputs are stable;
> one canonical config/contract preflight refuses stale runs before solver work; stance-head
> absence is explicit; and tournament safety is measured rather than filled with `true`. The next
> action is still **a person using the instrument**. No human gate verdict, throughput schedule,
> research rung, held-out tournament or promotion has occurred.

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

## Last verified baseline

The guided-acquisition landing was green under `npm test`, `npm run check` and `npm run build`.
Do not carry its test count forward while the PPO-parallelism work is active; re-measure the whole
tree at the next landing. Its behavioural null control was:

- `node scripts/measure.mjs --only duelist-swinger --bouts 120` at seed 20260823 --
  **66/120 = 55.0 %**, 176.17 damage, 10 severs, 1496/1670 scoring contacts. This is the null
  control; it has not moved across any of the last twelve commits and it must not move under a
  tactic-layer change, because `src/policies.ts` does not import `src/options.ts`.
- `node tools/check_docs.js` from the repository root -- 29 problems, **0 matching
  "sword-prototype"**. Those 29 are pre-existing anchors into `crates/` and are not this
  prototype's; the command has been red for longer than this topic has existed, so do not read
  its exit code as a signal about work here.

## The historical finding that changed session 19

The old PPO runner could not spend a step budget. Asked for 400,000 solver steps an arm -- 800,000
across the two -- an invocation consumed **5,508**, seven tenths of one per cent. Three facts multiply:
`runResearchBout` clamps a bout to `min(boutCapSeconds, limit / physicsHz)` and every stratum
sets 45 s against 240 Hz, so 10,800 steps is the ceiling on one bout however large the budget;
a bout ends when somebody dies rather than at the cap, so a real bout costs about 1,400; and
`trainPpo` ran exactly four bouts, two arms by two splits, and performed exactly two gradient
updates at any budget.

More generally, **a step budget is not a learning budget for three of the four directions.**
NEAT-QD and DAgger scale by `--generations` and `--iterations`; `--solver-steps` only lengthens
the bouts inside a fixed number of updates. Only look-ahead turns steps into fitted rows.

Session 19 closed that defect with repeated collect/update/validation jobs and resumable
checkpoint publication. The 5,508-step/twenty-second result remains a measurement of the retired
four-bout runner and must not schedule the current one. Sessions 20--22 still derive the current
update ceilings and parallel execution shape from new measurements.

## First action for the next session

Open the game and click **Guided playtest** on the setup screen. The page now owns the declaration:
validation base seed 310013; six cells; both sides; one excluded shakedown; four human repeats per
side (48 official human rows); and one page-specialist control per side (12 rows), always against
Warrior/sword+empty/Swinger. It chooses each matchup, records every verdict and frame/focus fact,
and autosaves between bouts. The person only plays and adds observations, then uses **Copy results
for Codex** or **Download report**. After those page readings exist, take the matching bench
specialist rows and make the three gate-feasibility verdicts. Do not move a threshold after any
research result has been seen.

## What remains

| session | result | depends on |
| --- | --- | --- |
| 18a | **complete** -- versioned shared recorder, gate table and bench command; no readings | 19 |
| 18b | **acquisition UI ready; no readings yet** -- measure a person on the promotion instrument; settle the open feel questions | 18a |
| 19 | **complete** -- a run that can be run, a ledger, plateau rule, watchable champion-so-far | -- |
| 20 | **pre-throughput foundation complete; measurements blocked** -- measure throughput/parallelism and derive every ceiling, in updates | 18b, 19 |
| 21 | one seed per direction under a one-day ceiling, then advance or kill each | 20 |
| 22 | remaining seeds and declared ablations for surviving directions only | 21 |
| 23 | freeze one selection per surviving direction and execute the test matrix once | 22 |
| 24 | integrate one passing artifact, or record the negative result | 23 |
| 25 | full lifecycle gate, confirming playtest, durable close-out, delete this plan set | 24 |

Session 25 deletes the remaining plan set and this handoff, after all results are folded into
durable documentation. Sessions 15--17 have already been through that fold; the pattern is on
record in `828b74b`.

## Two commands the plan set invokes that do not exist

`--rung` (sessions 21 and 22 require it) and `--verify-promoted` (sessions 24 and 25 invoke it).
PPO and look-ahead now honor `--run-id`, and look-ahead writes to its run directory without
manual artifact/report paths. Session 20 must freeze the measured schedule before `--rung` can
resolve it; session 23 or 24 owns `--verify-promoted`.

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
- An absent stance head and a learned head that chose one stance must not produce the same
  utilisation record. The controller declares its stance width; a body that consumes no posture
  narrows the free set explicitly.
- Tournament safety comes from the command, capability, tactic, verdict-tail and successful
  return-after-teardown observations of the bout being recorded. The lifecycle flag is not a
  resource census; the integration audit owns that proof. Missing evidence is a refusal, never a
  passing default.

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
