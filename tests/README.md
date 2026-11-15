# Engineering checks

`npm test` runs the cases below `tests/`. It accepts no skill's capability
([the table](../docs/reference/the-table.md) reads that) and reads no time
([step cost](../docs/reference/step-cost.md)); what a step allocates is held under
[ceilings](../docs/reference/step-cost.md#allocation-ceilings).

## The rules

- **Tests are a liability; less is more.** A new test reproduces a concrete observed regression:
  its commit names the failure and the broken code on which it fails. A new feature, a contract
  by itself or an artificial mutant is not a reason to add one. Skill behaviour belongs in drills
  and paired evaluations; broad replay batteries and timing are explicit diagnostics. Keep a test
  under about 10 s; how well a mind plays is a match, not a test.
- **Every test says why it is there**, in a comment directly above it: the failure it reproduces
  and why a drill or another check does not show it. A test with no comment above it fails the
  gate (`unjustifiedTests`, `scripts/documents.mjs`).
- **Test the contract**: inputs, outputs, what can be observed; never a tuned number or a last
  run's trajectory. Rules and replay are held to exact equality.
- **A fixture that did not reach its case says so** before the asserts; bouts are capped. A
  fixture is a recipe or a placed pose, not stored bytes.
- **A green test can assert nothing**: assert whole records, with a fixture that can show the
  defect, along the whole path.
- **A scanner's fixture is paired with its repository scan**: a clean repository alone cannot
  tell a working scanner from one that reports nothing.
- **Never green by relaxing**: no eased threshold, easier seed or regenerated expectation. A red
  physical check names its recipe, seed, condition and value against its limit.
- **Node imports `src/` directly**: relative imports carry `.ts`; no parameter properties. The
  headless stand is `tests/harness/core-stand.mjs`.
- **Under CPU load a dropped test count is a timeout**, not a regression: re-run on a quiet
  machine.
