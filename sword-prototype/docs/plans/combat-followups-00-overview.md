# Sword prototype -- remaining combat research

## Current status -- software ready, human gate and research runs open (2026-08-30)

The shared engagement recorder, player-facing Guided playtest, resumable append-only research
ledger, deterministic checkpoint cadence, plateau rules and all four research runners are
implemented. Their completed session plans have been removed; the runtime contracts and evidence
are durable in `docs/design.md`, `docs/measurements.md`, `README.md` and `AGENTS.md`.

Only engineering smokes have run. No complete human-feasibility sitting, derived throughput
schedule, three-seed research ladder, scaled run, blind tournament, promotion or final confirming
playtest exists. Those are the live sessions below. Supported locomotion is complete, but the live
Construct Forge combat-unit/projectile continuation will change physical balance; do not freeze
compute schedules or spend production compute until both the human gate and Construct Forge
Session 30 are complete.

## Live session order

| session | remaining result | depends on |
| --- | --- | --- |
| [18b](combat-followups-18-human-gate-feasibility.md) | measure a person on the promotion instrument; settle open feel questions | landed recorder/UI |
| [20](combat-followups-20-throughput-and-ceilings.md) | measure throughput/parallelism and derive every per-direction ceiling | 18b, Construct Forge 30 |
| [21](combat-followups-21-research-ladder.md) | one seed per direction under a one-day ceiling, then advance or kill | 20 |
| [22](combat-followups-22-scaled-runs.md) | remaining seeds and declared ablations for surviving directions | 21 |
| [23](combat-followups-23-held-out-ai-tournament.md) | freeze selections and execute the blind test matrix once | 22 |
| [24](combat-followups-24-promoted-ai-integration.md) | integrate one passing artifact or record the negative | 23 |
| [25](combat-followups-25-integration-and-playtest.md) | lifecycle gate, confirming playtest and durable close-out | 24 |

[Found but not fixed](combat-followups-99-found-not-fixed.md) is a measured live-issue register,
not another ordered session. Closed entries are removed once their result is durable.

## Frozen research contract

- Commands contain locomotion, posture, two hands and the natural attack channel; camera state is
  host-only.
- Learned input remains feature v4 with exact columns, normalization, mirror mapping and factual
  threat selection.
- Learned output remains tactic v2:
  `movement + action + effector + target + stance + persistence`.
- Action/effector/target combinations come from the exact legal mask. No named request may be
  redirected silently to another hand, target or action.
- Observations remain perfect world state but contain no opponent intent, policy state, solver
  object or label.
- Old feature/action artifacts and resume files are refused before a solver step; they are not
  migrated.
- The checkpoint ledger observes. Job indices, not wall time or worker completion order, decide
  cadence, resume and plateau. Wall time is reported only.

Supported locomotion is a physical execution change, not a new learned command. If its
implementation moves feature/tactic/research-contract digests, treat that as a leak. It will move
bout outcomes and balance-config/source identities, so all throughput and research measurements
must be taken afterwards.

## Budgets and gates

Session 20 derives learning updates and solver steps from measured throughput. The fixed windows
remain:

- rung 1: at most 24 hours per direction per seed;
- scaled run: at most 3x that direction's rung-1 plateau count and never over 72 hours per seed;
- ablations: 10% of that direction's scaled ceiling.

A run stops at plateau or ceiling and records which. A run still improving at the ceiling is the
only evidence that may buy a larger window.

Engagement thresholds remain provisional until Session 18b measures a competent person: attack at
an opportunity >= 0.65; damaging contact per attack >= 0.20; near-range stall <= 0.15; first-attack
p90 <= 6 s; symmetric time-cap rate <= 0.10; worst-cell specialist gap <= 0.15; at least three
non-recover Actions each >= 8%; every measured safety property passing. A gate a person cannot
reach is corrected before research, never after a candidate has been seen.

The missing `--rung` command belongs to Sessions 20--21. The missing `--verify-promoted` command
belongs to Sessions 23--24. Unknown flags must be refused by name rather than ignored.

## Gate

Every landed session runs from `sword-prototype/`:

```powershell
npm test
npm run check
npm run build
```

Session 25 deletes this remaining plan set after every result has moved into durable documentation.
