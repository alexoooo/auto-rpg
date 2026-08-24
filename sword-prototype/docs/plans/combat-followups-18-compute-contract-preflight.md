# Session 18 -- adversarial compute-contract preflight

## Outcome

Prove that feature v4 and tactic v2 mean the same thing to all four research algorithms,
runtime deployment, resume, mirroring and tournament execution. Emit one immutable schema
digest and a preflight report. Only this passing report authorizes sessions 19--22 to spend
multi-day budgets.

## One canonical contract

In `src/learning/deployment.ts#L12-L15`, replace the partial artifact contract with a frozen
`COMPUTE_CONTRACT` containing:

~~~typescript
{
  featureVersion: 4,
  featureNames: FEATURE_COLUMNS,
  tacticVersion: 2,
  movementNames: MOVEMENT_NAMES,
  actionNames: HAND_ACTION_NAMES,
  effectorNames: EFFECTOR_NAMES,
  targetNames: TARGET_NAMES,
  stanceNames: STANCE_NAMES,
  normalizationVersion: 1,
  threatSelectionVersion: 1,
}
~~~

Serialize it with one canonical JSON writer and SHA-256 the UTF-8 bytes. Store the digest in
every checkpoint, artifact, resume file, report, league entry and tournament candidate.
Readers compare both digest and explicit names, because a digest-only error cannot explain
which contract differs. Mismatch refusal occurs before the headless arena or worker pool is
created.

## Preflight command

Add `scripts/preflight-research.mjs` and `npm run ai:preflight`. With a fixed seed it must:

1. Exercise every `researchMatrix("train")` body/loadout cell and every legal tactic-v2 tuple
   through a real Havok step, including dual swords, sword/shield, bow, two fists and
   Centipede bite.
2. Include approaching, crossing, receding, planted and pooled arrows; assert the feature
   threat and cover target selected in each case.
3. Encode, mirror and separately re-observe asymmetric scenes. Assert exact feature equality,
   legal tuple equality and mirror-twice identity.
4. Run minimum NEAT-QD, DAgger, recurrent PPO and look-ahead jobs; deploy their artifacts and
   execute complete bouts rather than stopping at codec round-trip.
5. For each resumable algorithm, compare uninterrupted, interrupted/resumed, workers-1 and
   supported-workers-8 bytes. PPO continues to refuse workers above one by name.
6. Feed synthetic stale-contract bytes, a reordered feature list, a reordered effector list
   and a changed normalization version. Each must fail before a counted solver step. Do not
   keep an old parser or artifact file for this test.
7. Record steps, wall time, throughput, peak memory, finite-command count, legal-pair count,
   schema digest and artifact digests into
   `asset-src/learning/research/interface-v4-preflight/report.json`.

Preflight artifacts prove plumbing only and are permanently ineligible for validation,
league or tournament selection. Encode `purpose: "preflight"` in their envelope and make all
candidate readers refuse it.

## Fundamental-interface audit

Add `tests/learning-interface.test.mjs` as the contract owner. It must extract shapes from the
actual codec/deployment tables, not grep source, and assert:

- no feature or output name contains camera, zoom, mouse, takeover, train, validation, test,
  reward, future contact or opponent policy;
- all held weapons are represented for both hands on both bodies;
- arrow and bite threats are represented;
- every legal action has at least one legal effector/target tuple in every compatible research
  cell and every emitted effector/target is executable without fallback;
- all physical command numbers are finite and bounded over exhaustive legal tuples;
- posture and effector behaviour counters can distinguish every stance/hand;
- the schema digest changes if any name, order, scale, mirror rule, mask rule, normalization
  or threat-ranking version changes.

Make the digest-change test fail once by omitting `threatSelectionVersion` from canonical
serialization. Make the synthetic-stale-contract test fail once by moving contract validation
after arena construction and assert that zero solver steps were spent.

## Repository cleanup gate

Before generating the preflight artifact:

1. Delete every pre-v4/action-v2 directory under `asset-src/learning/research/` and
   `asset-src/learning/runs/`, plus old promotion smoke files. Retain no resume JSON, champion
   payload or copied report from sessions 12--18.
2. Confirm the historical numbers those files uniquely supported are already present in
   `docs/measurements.md`; add only compact tables/provenance, not embedded raw payloads.
3. Audit source, scripts, tests, package commands and assets for old checkpoint, v1/v3,
   `OPTION_NAMES`, migration, legacy-mode and parity code. Maintain a short allowlist only for
   genuinely current meanings such as NEAT compatibility distance and browser compatibility
   events.
4. The preflight directory must be the only research artifact directory after the smoke run,
   and its envelope is current-contract `purpose: "preflight"`.

## Documentation and authorization

Update `docs/design.md` with the final observation table, tactic table, perfect-information
boundary, threat ranking, normalization, mirror rules and host/combat split. Update
`docs/measurements.md` with the preflight command, digest, exact cell/tuple counts, throughput
and memory. Update this overview if measured tuple counts or feasible worker settings differ
from the plan; record the correction rather than silently editing an expectation.

## Accept

- `npm run ai:preflight -- --seed 20260824` passes twice with the same report/artifact bytes
  except explicitly excluded wall-clock fields.
- The report accounts for every requested solver step and names zero unspent steps.
- Synthetic stale contracts fail before solver step one; no stale artifact/resume remains in
  the repository.
- `npm test`, `npm run check`, `npm run build`,
  `npm run measure -- --seed 20260824` and `npm run ai:preflight -- --seed 20260824` pass.
  `ai:options` no longer exists.
- The exact compute-contract digest is copied into sessions 19--23 before their first run.
  Any later interface change cancels authorization and requires a new preflight.
