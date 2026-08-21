# Session 02 -- The checkpoint earns its name

**Status:** complete.
**Blocks:** session 03.

## Outcome

Train tactical V2 against the full roster, retain generation checkpoints under `target/`, and evaluate the champion on the disjoint held-out range. Only a checkpoint satisfying every overview row is copied to `checkpoints/learned-roster-v2.ckpt`.

## Procedure

1. Run a short smoke population and prove score improvement is not caused by one omitted opponent.
2. Run the named roster training preset with fixed seeds, mirrored fixtures and a wall-clock budget. The checkpoint records all optimizer settings and the exact roster mask.
3. Evaluate every generation champion on a smaller disjoint diagnostic set; this may choose which generation to evaluate fully, but may not change the promotion thresholds.
4. Run the 200-seed mirrored held-out table against every `PolicyKind` and replay sampled fights.
5. If any row misses, change the objective/model and repeat. Do not weaken the thresholds.

## Files

- `checkpoints/learned-roster-v2.ckpt` -- only after the gate passes.
- `docs/performance/learned-roster-policy.md` -- commands, artifact digest, training record, every held-out row, failures encountered and final verdict.
- `docs/architecture/learning.md` -- the artifact becomes current only on a pass.

## Verification

Re-read the artifact, repeat the held-out table, and compare its SHA-256. Run the full repository gate. The V1 artifact and all registered hashes remain byte-exact.
