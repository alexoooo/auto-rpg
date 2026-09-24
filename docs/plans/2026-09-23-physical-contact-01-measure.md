# Physical contact 01: measure first

No behaviour change. The body fingerprint reads all `same`. What this session writes is the baseline
every later session is judged against, so it goes into a new section,
`docs/analysis/2026-09-23-attribute-measurements.md` "Physical contact baselines". Every figure names
its harness.

## 1. The giant preset in the sweep instrument

- Promote `.review/giant-sweep.mjs` into `research/stat-sweep.mjs` as
  `--attributes <preset>[,<preset>...]`. The presets are:
  - `max`: every live row at its `max`;
  - `max-normal-body`: max with size and weight at 1;
  - `size-weight-max`.
- Each preset is a level whose modified corner carries that whole attribute set, beside an explicit
  all-ones control.
- Test the preset parsing and that the control carries all ones.
- Rerun at 192 blocks, so the baseline is from the committed instrument.

## 2. Stuck-down census

- A new `research/downed-census.mjs` plays probe-mind bouts through `runJobs` (stone default mirror,
  skeleton duelist mirror, and the giant preset against x1; 96 blocks each).
- It records every fallen episode per side:
  - start, length and end (rose, bout ended, or died);
  - what the rise gate refused, per boundary. The reasons come from `risingEligibility` and the
    port's occupancy.
- Classify every episode longer than 5 s:
  - no recover input (`locomotionCommand.recover` false);
  - occupancy refused;
  - wall (the recovery sweep's fraction below 1);
  - stuck in `rising` without posture;
  - re-hit during the rise;
  - lying cap.
- Report counts, the p50, p90 and max episode length, and the share of bout time spent in episodes
  longer than 5 s.
- The episode has to be read from the port's support state. Expose a read-only accessor if none
  exists; it is instrumentation, not behaviour.

## 3. Downed-target census

In the same bouts, record:

- the share of the other side's fallen and rising seconds in which the standing side lands damage;
- its damage a downed second, against its damage a standing second;
- the distance from the standing side's socket to the downed side's core.

## 4. Effective-mass ground truth

A new bench, `tests/harness/impact-bench.mjs`, which also runs directly under `node`:

- Hang a free, `DYNAMIC`, gravity-free test mass (5, 20, 90 and 500 kg spheres) in the headless
  arena.
- Drive each striker through it with its own stroke from the bench stand:
  - blade, fist, mace, maul, whip weight, plate bash, the `none` chain's cap, the ram lunge, and the
    human fist;
  - at x1 and at the `max` preset.
- Read the test mass's velocity change `dv` and the striker's closing speed `v` at contact. The
  implied effective mass for a perfectly plastic contact is `m_eff = M * dv / (v - dv)`. Report the
  restitution the pair shows as well.
- Tabulate the implied m_eff against the declared `impactMassKg`.
- This is the ground truth session 05's computed m_eff is validated against. Keep the bench as a
  harness so 05 can run it again.

## 5. Lift and push bench

A new bench, `tests/harness/lift-bench.mjs`:

- A keyframed test body is fitted with a force readout, which sums the contact impulses per solver
  step through `getCollisionObservable`.
- An arm on the bench stand is commanded up into it from below, and then sideways into it.
- Report the sustained force, meaning the mean over the last 0.5 s of a 1.5 s hold, for:
  - each arm chain: reach, wrist, skeletal, pitch, and the human arm;
  - with and without a terminal;
  - at x1, x1.25 and `max`.
- Put the family's body weight next to it.

## 6. Mass census

A table per family (stone default, skeleton warrior, human warrior, wheel, multileg):

- whole-body mass;
- the mass of each part class (trunk, pelvis, legs, head, arm links, items);
- the supported mass the stability model divides by (`supportedMassKg`);
- `golemUpperMassKg` beside the solver's.

Read the masses from `getMassProperties` on every body a golem owns.

## Done when

- The preset and its test are committed.
- The four instruments are committed under `research/` or `tests/harness/`.
- The baselines section is written.
- The fingerprint is `same`.
