# Sword prototype -- remaining combat follow-ups

## Outcome

Do not spend the multi-day research budgets against the current interface. The simulator,
research implementations and tournament machinery exist, but the policy boundary still mixes
camera state into combat commands, learned controllers cannot choose an acting hand, aim
region or body stance, and no policy can observe an arrow in flight. Sessions 15--18 correct and freeze that
boundary first. Sessions 19--25 then spend the budgets, select on validation, open the blind
tournament once and promote only a passing controller.

Durable descriptions of the implementation as it exists today remain in
[the README](../../README.md), [design](../design.md) and
[measurements](../measurements.md). [The handoff](combat-followups-handoff.md) is the concise
continuation record. Each interface session updates those durable documents when its change
lands; this plan does not describe unimplemented behaviour as fact.

## Why the compute phase moved

- `zoom` is a host camera value carried through every `Intent`, option, handover and evaluator
  even though the camera reads `Controls.state.zoom` directly and no fighter consumes it.
- `driving` means mouse ownership for a person but acting hand inside an option. A learned
  controller emits neither; `handActionOption(action)` silently prefers the primary hand.
- The v3 feature vector identifies all four held weapons exactly, but has no projectile state.
  A shield policy can know that the opponent holds a bow and still cannot see the arrow.
- v3 publishes only scalar hand-tip speed. It cannot distinguish an incoming tip from one
  travelling away, and an empty fist currently reports zero tip speed.
- Cross-body training omits opponent posture and most morphology/natural-attack state, while
  `time_since_damage` actually means time since damage dealt.
- Crouch, lean and twist are fixed consequences of the chosen hand action. They are not a
  learned tactical choice, despite being described as AI-controlled degrees of freedom.

The existing 30,720-step NEAT-QD, 19,200-step DAgger and 42,240-step look-ahead smokes remain
useful historical evidence only. Before preflight, fold their conclusions into
`docs/measurements.md` and delete their artifacts and resume state. Stale-version refusal is
tested with synthetic headers; the repository does not keep old runnable payloads merely to
test that they are old.

## No backwards-compatibility phase

Feature v4 and tactic v2 replace their predecessors. There is no migration reader, legacy
mode, compatibility alias, dual evaluator, old checkpoint export or fallback execution path.
Keep current hand-written specialists as opponents and baselines, but call them specialists;
do not preserve an obsolete API by calling everything before it “legacy.” Historical results
survive as compact prose/tables in durable documentation, not as code paths or 300 kB JSON
fixtures.

Sessions 15--18 remove superseded symbols and files in the same change that replaces them.
After session 18, an audit for `legacy`, `compat`, `v1`, `v2`, `v3`, `OPTION_NAMES`, old
checkpoint readers and old run directories must be empty except for explicitly reviewed
historical prose, protocol terms such as browser compatibility events, and NEAT's mathematical
`compatibilityDistance`.

## Remaining sessions

| session | remaining result | depends on |
| --- | --- | --- |
| [15](combat-followups-15-host-command-boundary.md) | remove camera zoom from policy commands without changing camera behaviour | current implementation |
| [16](combat-followups-16-policy-perception-v4.md) | publish projectile/vector/morphology observations and freeze feature v4 | 15 |
| [17](combat-followups-17-tactic-output-v2.md) | make acting hand and bounded body stance explicit policy outputs | 16 |
| [18](combat-followups-18-compute-contract-preflight.md) | adversarially audit and freeze the exact multi-day compute contract | 17 |
| [19](combat-followups-19-neat-qd-curriculum.md) | three full NEAT-QD runs and three declared ablations | 18 |
| [20](combat-followups-20-dagger-imitation.md) | three full DAgger runs | 18 |
| [21](combat-followups-21-ppo-self-play.md) | three full recurrent-PPO runs over the frozen DAgger league | 20 |
| [22](combat-followups-22-bounded-lookahead.md) | three full calibrated look-ahead fits | 18 |
| [23](combat-followups-23-held-out-ai-tournament.md) | freeze four validation selections and execute the test matrix once | 19--22 |
| [24](combat-followups-24-promoted-ai-integration.md) | integrate one passing artifact, or add a new research session | 23 |
| [25](combat-followups-25-integration-and-playtest.md) | full lifecycle gate, visible playtest and durable close-out | 24 |

Sessions 15--18 are sequential because each changes the contract the next audits. After 18,
sessions 19, 20 and 22 may run independently. Session 21 needs the three frozen DAgger
artifacts. Session 23 does not begin until every full report and artifact exists.

## Contract that session 18 must freeze

- Combat commands contain locomotion, posture and two hands; camera zoom is host-only.
- Learned input is feature v4, with exact column names, normalization, mirror mapping and
  threat-selection grammar pinned by a digest.
- Learned output is tactic v2:
  `movement + hand action + effector + target + stance + persistence`.
- An action/effector/target tuple is selected jointly from a legal mask. There is no silent
  fallback from a requested primary hand to the secondary or from a requested low/high target
  to the skill's old hard-coded aim.
- The full view contains every live, unspent projectile without allocations after warm-up.
  The learned vector receives the most imminent opponent threat, selected factually from
  melee tips, fists, natural attacks and arrows.
- Observations remain perfect world state for now: no opponent intent, solver object, policy
  state or test label; also no invented vision cone, occlusion or sensor noise.
- Old feature/action artifacts, reports and resume files are removed. A minimal current codec
  rejects synthetic stale headers before any solver step; it does not parse or migrate them.

## Frozen budgets and thresholds

These remain unchanged, but are not authorized until session 18 records the final schema
digest and passes the preflight.

- Full solver budget: 1,800,000,000 steps per algorithm and seed.
- Seeds: 310013, 310019, 310031.
- NEAT ablations: without curriculum, without QD and fixed species threshold,
  180,000,000 steps each.
- Opportunity attack rate >= 0.65; attack contact rate >= 0.20.
- Near-range stall share <= 0.15; first-attack p90 <= 6 s.
- Symmetric time-cap rate <= 0.10; worst-cell specialist gap <= 0.15.
- At least three permitted non-recover actions each occupy >= 8%.
- Every safety flag must pass.

Do not lower a gate, replace a full run with a smoke, select on test, or advertise
adaptive-v1 merely because the required execution is expensive.

## Protected surfaces after session 18

Research execution must not change ordinary arena policy records, `POLICIES`, feature v4,
tactic v2, normalization, legal masks, threat selection, the Warrior GLB digest or any
runtime balance constant. Any such change invalidates every in-progress run and requires a
new implementation session plus a new compute-contract digest.

Every landed session runs from `sword-prototype/`:

~~~powershell
npm test
npm run check
npm run build
~~~

Session 25 deletes this remaining plan set and handoff only after all results are folded into
durable documentation.
