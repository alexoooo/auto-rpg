# Sword prototype -- remaining combat follow-ups

## Outcome

The arena, bodies, controls, armour, engagement instrumentation and all four research
implementations are complete. The remaining work is operational: spend the frozen research
budgets, select validation artifacts, open the blind tournament once, promote only a passing
controller, then complete the visible playtest and delete this plan set.

Durable implementation and measured facts live in
[the README](../../README.md), [design](../design.md) and
[measurements](../measurements.md). The concise continuation record is
[the handoff](combat-followups-handoff.md).

## Current evidence

- The prototype gate is green: 454 tests, TypeScript check, production build, texture pins,
  armour provenance and the Warrior GLB pin.
- Retained engineering smokes spent 30,720 NEAT-QD steps, 19,200 DAgger steps and 42,240
  exhaustive look-ahead steps. PPO's real-Havok resume and recurrent-gradient smokes are
  covered by the test suite.
- The look-ahead smoke covers all 13 body/loadout cells and all 220 compatible tactic cells.
- No required full-budget run has completed. There is no eligible candidate set, tournament
  manifest, held-out row or promoted policy.
- The attached browser pass was useful for model and screen inspection but ran at 1 fps.
  Arrow readability, camera feel and frame cost remain human-visible acceptance work.

## Remaining sessions

| session | remaining result | depends on |
| --- | --- | --- |
| [15](combat-followups-15-neat-qd-curriculum.md) | three full NEAT-QD runs and three declared ablations | current implementation |
| [16](combat-followups-16-dagger-imitation.md) | three full DAgger runs | current implementation |
| [17](combat-followups-17-ppo-self-play.md) | three full recurrent-PPO runs over the frozen DAgger league | 16 |
| [18](combat-followups-18-bounded-lookahead.md) | three full calibrated look-ahead fits | current implementation |
| [19](combat-followups-19-held-out-ai-tournament.md) | freeze four validation selections and execute the test matrix once | 15--18 |
| [20](combat-followups-20-promoted-ai-integration.md) | integrate one passing artifact, or add a new research session | 19 |
| [21](combat-followups-21-integration-and-playtest.md) | full lifecycle gate, visible playtest and durable close-out | 20 |

Sessions 15, 16 and 18 may run independently. Session 17 needs the three frozen DAgger
artifacts. Session 19 does not begin until every full report and artifact exists.

## Frozen budgets and thresholds

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

## Protected surfaces

Research execution must not change ordinary arena policy records, POLICIES, the feature or
action vocabulary, the Warrior GLB digest, or any runtime balance constant. Any such change
is a new implementation session, not part of spending these frozen budgets.

Each landed research session runs from sword-prototype/:

~~~powershell
npm test
npm run check
npm run build
~~~

Session 21 deletes this remaining plan set and handoff only after all results are folded into
durable documentation.
