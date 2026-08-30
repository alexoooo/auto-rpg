# Session 20 -- prove the pile-up and freeze the pair boundary

## Outcome

Land a behaviour-neutral evidence and stepping foundation. The current Warrior-versus-small-
Construct closure must be identified as rejected rather than accepted as a vaguely upright bout.
Every two-body harness must then share one two-phase order: both bodies observe and decide, and
only afterwards may a pair-level locomotion resolver commit either side.

Nothing in this session moves a body differently. The resolver and supported-locomotion port are
dormant, so all existing saved digests and physical bout results must remain unchanged.

## Implement

1. Add `src/supported-locomotion.ts` with pure, DOM-free records and classifiers:

   ```ts
   export interface LocomotionRequest {
     readonly localForward: number;
     readonly localRight: number;
     readonly yaw: number;
     readonly recover: boolean;
   }

   export interface SupportedLocomotionPort {
     beginControlStep(): void;
     request(value: LocomotionRequest): void;
     sample(): SupportedLocomotionSample;
     commit(resolution: LocomotionResolution): void;
     clear(reason: string): void;
   }
   ```

   `classifySupportedClosure` consumes retained step samples and rejects non-finite data, missing
   inward requests, a cell that never reaches the separation envelope, any composite-posture loss,
   penetration dwell, unbounded part speed/joint-frame error, or a summary that disagrees with its
   samples. It does not read a final position and call that a bout.

2. Refactor `stepControlledPair` at `src/control-host.ts#L47` into the only pair scheduler:

   ```ts
   left.observe(right, clock);
   right.observe(left, clock);
   left.locomotion?.beginControlStep();
   right.locomotion?.beginControlStep();
   left.control.driver.step(dt);
   right.control.driver.step(dt);
   resolveSupportedPair(left.locomotion, right.locomotion, dt);
   ```

   Add `readonly locomotion?: SupportedLocomotionPort | null` to `ControlledBody`; absence and an
   explicit null port have identical no-op semantics. The dormant port makes this behaviour-neutral.
   `stepPair` at `src/fighter.ts#L1997` becomes a compatibility wrapper around it. `LabBody` is not
   currently a `ControlledBody` (`publish(opponent, dt)` is not `observe(opponent, clock)`), so add
   an adapter owned by `ConstructLabBout` rather than pretending the types already match. Migrate
   `ConstructLabBout.step` at `src/construct/lab-bout.ts#L113`, the Workshop probe loop at
   `src/main.ts#L1018`, page loop at `src/main.ts#L850`, `scripts/measure.mjs`,
   `scripts/construct-warrior-bout.mjs` and pair-stepping tests to the same boundary.

   The source guard extracts two-body schedules and refuses a publish/observe pair followed by two
   direct driver/update calls outside `control-host.ts`, `fighter.ts`'s compatibility wrapper and
   the named adapter. It does not ban legitimate one-body `Fighter.update` or `Centipede.update`
   calls. No body commits supported movement from inside `driver.step`.

3. Add `scripts/measure-supported-locomotion.mjs`. Its v1 corpus is exact and rejects unknown
   flags. Retain fixed-step samples for Warrior/Warrior and Warrior/shipping Swordbearer, both side
   assignments, with attacks disabled. The Warrior requests fixed inward motion and the current
   Construct holds its shipped `brace`; do not claim the Construct can request movement before the
   supported Actions exist. Pin fixture version, initial transforms, profile/control digests,
   duration, step count, scenario order and side. Each cell must actually enter the declared
   envelope and keep the Warrior commanded inward for the frozen dwell; a body that never closes is
   red, not safe. The physically scaled 0.90 m fixture is introduced and specified in Session 23,
   not confused with the existing synthetic 0.90 m profile threshold.

4. Record the current asymmetric result in `docs/measurements.md` as the pre-fix rejected baseline.
   Read positions/quaternions directly from root nodes, advance the render ID and physics through
   the established fixed-step path, keep bodies awake, and count damage/events from retained rows
   rather than the newest-24 `Combat.log` window.

5. Before refactoring the scheduler, retain one frozen old-path trace containing publish order,
   driver order, root transforms, controls and combat events. After the wrapper lands, replay the
   identical fixture and require exact trace equality. A no-op port test alone does not establish
   behaviour neutrality.

6. Extend `scripts/qualify-construct-learning-entry.mjs` with a refusal-tested
   `--expect rejected|qualified|recorded`. A matching expected status exits zero; a mismatch names
   expected and actual and returns nonzero. `recorded` accepts either valid terminal status only so
   a caller can archive evidence without calling rejection success. Unknown/missing values refuse.

## Tests watched failing

Add `tests/supported-locomotion-evidence.test.mjs` and extend `tests/units.test.mjs`:

- `the_current_clinch_heap_trace_is_rejected_as_discombobulated`
- `a_closure_cell_must_really_request_move_enter_range_and_remain_inward`
- `closure_acceptance_is_recomputed_from_exact_unique_retained_cells`
- `non_finite_relabelled_duplicate_reordered_and_over_cap_evidence_is_refused`
- `both_bodies_decide_before_either_locomotion_port_commits`
- `swapping_step_call_order_cannot_change_pair_resolution`
- `page_bench_construct_lab_and_Workshop_share_the_same_pair_step`
- `the_two_phase_wrapper_reproduces_the_frozen_pre_refactor_trace_exactly`
- `qualification_expectation_returns_success_only_for_the_named_terminal_status`

Mutation proofs: remove continuous posture, accept final separation only, duplicate a good cell,
relabel its side, let a never-closing cell pass, commit the left port before the right decides, and
leave one old direct stepping path. Each mutation must make its named test red before restoration.

## Accept

```powershell
node --test tests/supported-locomotion-evidence.test.mjs tests/units.test.mjs tests/construct-lab.test.mjs tests/integration.test.mjs
node scripts/measure-supported-locomotion.mjs --baseline
npm run construct:qualify -- --out <fresh-directory> --workers 8 --expect rejected
npm test
npm run check
npm run build
```

All current Body/control/program/sensor and research contract digests remain unchanged. The broad
Construct source fingerprint may move because it hashes runtime sources; re-run a fresh rejected
qualification and record that source-only move without changing the measured Warden run verdict.
