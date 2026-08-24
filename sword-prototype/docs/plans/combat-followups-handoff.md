# Combat follow-ups handoff -- 2026-08-24

## Where the prototype is

The implementation phase is complete through the session-19 execution boundary. Mechanics,
controls, bodies, imported armour, AI observations/actions, four research algorithms,
artifact deployment and indexed tournament resume are in the tree. Durable explanations are
in [the README](../../README.md), [design](../design.md) and
[measurements](../measurements.md).

No learned policy is promoted. The held-out tournament has not been opened.

## Last verified state

From sword-prototype/:

- npm test: 454 passed.
- npm run check: passed.
- npm run build: passed.
- npm run texture:verify, npm run armour:verify, npm run asset:verify: passed.
- npm run measure -- --seed 20260824: completed in 310.4 s.
- npm run ai:options -- --seed 20260824: all 12 frozen legacy/meta parity rows matched.
- Port 5180 has no listener.

The root node tools/check_docs.js currently reports 29 stale root-document source anchors.
None is under sword-prototype; do not misattribute them to this topic.

## Retained smoke evidence

| directory | meaning |
| --- | --- |
| asset-src/learning/research/session15-workers8-smoke/ | NEAT-QD, 30,720 exact steps |
| asset-src/learning/research/session16-final-workers8/ | DAgger, 19,200 exact steps |
| asset-src/learning/research/session18-minimum/ | exhaustive look-ahead, 42,240 exact steps, 13 cells |

These prove execution and accounting only. They are forbidden as tournament candidates or PPO
league champions.

## What remains

1. Run [session 15](combat-followups-15-neat-qd-curriculum.md),
   [session 16](combat-followups-16-dagger-imitation.md) and
   [session 18](combat-followups-18-bounded-lookahead.md). They can run independently.
2. Run [session 17](combat-followups-17-ppo-self-play.md) after all DAgger artifacts exist.
3. Freeze and execute [session 19](combat-followups-19-held-out-ai-tournament.md) exactly once.
4. Integrate a policy only if it passes [session 20](combat-followups-20-promoted-ai-integration.md).
5. Finish the visible/browser and lifecycle close-out in
   [session 21](combat-followups-21-integration-and-playtest.md).

Short-run extrapolation is roughly 86 hours for one NEAT seed and 125 hours for one DAgger
seed on this host, before NEAT ablations. Treat those as scheduling estimates, never as spent
steps.

## Important traps from adversarial review

- A continuous viable attack episode must not be reopened every 0.75 s; that launders one
  opportunity into many.
- Research contacts must map factually: arrow to bow, bite to natural bite, fists to the
  actual hand. Never assign a contact to the first viable key.
- Worker count is an execution knob, not part of semantic artifact identity.
- PPO currently and deliberately refuses workers above one.
- A handless body can recover and bite, but cannot cover. The exhaustive look-ahead smoke
  found this after focused tests initially missed it.
- Tournament manifest, artifact bytes and raw-row prefix are immutable after the first test
  row. Resume indexed holes; never start a new test seed range.
- If no candidate passes, add research. Do not ship the least-bad controller.

## First action for the next session

Choose one of sessions 15, 16 or 18, reserve the multi-day compute window, record the exact
command and start time in measurements, and run it without changing any frozen constant.
