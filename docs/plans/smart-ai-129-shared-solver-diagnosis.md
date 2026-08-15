# Smart AI 129 -- frozen shared-solver diagnosis

**Status:** planned. Diagnose whether Smart128's controlled strong-reference and
held-control arms reject the exact same rows with the exact same per-row solver
counts. This is an offline query over the two frozen CSV receipts. It does not run a
World, inspect first-rejection provenance, change mechanics or policy, analyze
Tactical productivity, tune from the corpus, or open held-out work.

## Frozen input authority

Read both files and no substitute:

```text
target/smart128-calibration-a.csv
target/smart128-calibration-b.csv
```

Before parsing, require byte equality. Each must be exactly 309,770 bytes, 901 lines,
and SHA-256
`6e892f830c915d86ab88980832dc9daf82921c44842f9cc6b2d41de88c813a8a`.
They were produced from source commit
`7813de079e237f613ec59c4ef38aeee8b399742f` under `cartesian-recoil` on native MSVC
x86-64 Windows. A missing file, byte mismatch or receipt mismatch is
`invalid-receipt-stop` and writes no diagnosis artifact.

The header has exactly 110 columns and must match this complete literal sequence:

```text
fingerprint,seed,mirrored,target,offset_x_raw,offset_y_raw,bracket_equal,reference_unique,reference_crossed,held_inert,held_legal,reference_legal,tactical_legal,productive_unique_crossing_contact_dissipation,productive_cut_or_thrust_matching_integrity,reference_contact_tick,reference_region,reference_weapon_body_facts,reference_competing_facts,reference_tip_speed_raw,reference_energy_before_raw,reference_dissipated_raw,reference_cut_raw,reference_thrust_raw,reference_pressure_raw,reference_integrity_loss_head_raw,reference_integrity_loss_torso_raw,reference_integrity_loss_left_arm_raw,reference_integrity_loss_right_arm_raw,reference_integrity_loss_legs_raw,reference_wound_gain_head_raw,reference_wound_gain_torso_raw,reference_wound_gain_left_arm_raw,reference_wound_gain_right_arm_raw,reference_wound_gain_legs_raw,reference_blood_loss_raw,reference_refusals,reference_solver_rejections,reference_cap_hits,reference_energy_excess_raw,held_contact_tick,held_weapon_body_facts,held_competing_facts,held_energy_before_raw,held_dissipated_raw,held_cut_raw,held_thrust_raw,held_pressure_raw,held_integrity_loss_head_raw,held_integrity_loss_torso_raw,held_integrity_loss_left_arm_raw,held_integrity_loss_right_arm_raw,held_integrity_loss_legs_raw,held_wound_gain_head_raw,held_wound_gain_torso_raw,held_wound_gain_left_arm_raw,held_wound_gain_right_arm_raw,held_wound_gain_legs_raw,held_blood_loss_raw,held_refusals,held_solver_rejections,held_cap_hits,held_energy_excess_raw,tactical_intended_region,tactical_intended_hand,tactical_first_cross_tick,tactical_first_contact_tick,tactical_first_contact_cross_tick,tactical_first_contact_region,tactical_first_contact_hand,tactical_first_contact_attributed_facts,tactical_first_contact_competing_facts,tactical_first_contact_dissipated_raw,tactical_first_contact_cut_or_thrust_raw,tactical_first_contact_matching_integrity_loss_raw,tactical_peak_tip_speed_raw,tactical_peak_normal_closing_raw,tactical_peak_energy_before_raw,tactical_peak_dissipated_raw,tactical_cut_raw,tactical_thrust_raw,tactical_pressure_raw,tactical_integrity_loss_head_raw,tactical_integrity_loss_torso_raw,tactical_integrity_loss_left_arm_raw,tactical_integrity_loss_right_arm_raw,tactical_integrity_loss_legs_raw,tactical_wound_gain_head_raw,tactical_wound_gain_torso_raw,tactical_wound_gain_left_arm_raw,tactical_wound_gain_right_arm_raw,tactical_wound_gain_legs_raw,tactical_blood_loss_raw,tactical_unattributed_anatomy_changes,tactical_decision_tick,tactical_outcome,tactical_refusals,tactical_solver_rejections,tactical_cap_hits,tactical_energy_excess_raw,commits,crossings,weapon_body_facts,positive_closing,dissipated_groups,above_floor,cut_or_thrust,integrity_losses,open_wounds,body_decisions
```

Require the canonical 900-row descriptor order exactly:

```text
seed 0..24
  mirrored false, true
    target fighter, brute
      offset raw (-196608,-65536), (-196608,0), (-196608,65536),
                 (-163840,-65536), (-163840,0), (-163840,65536),
                 (-131072,-65536), (-131072,0), (-131072,65536)
```

Compute `descriptorSetDigest` as SHA-256 over ASCII
`ARPG-SMART129-DESCRIPTORS-V1\n` followed by one canonical row per line:

```text
seed,mirrored,target,offset_x_raw,offset_y_raw\n
```

This digest is an output receipt, not a pin. Do not sort before validating or hashing;
sorting could hide a reordered input.

## Tool and permitted columns

Add [`tools/diagnose_smart128.js`](../../tools/diagnose_smart128.js) and
[`tools/diagnose_smart128.test.js`](../../tools/diagnose_smart128.test.js), using only
Node's standard library. The production input paths, expected receipt, header and
descriptor grammar are constants. The only option is
`--out-prefix target/smart129-shared-solver-a`, which controls output location and
creates `.txt` and `.json`; reject every input, SHA, filter, query or thread override.

Parse only these structural columns after validating the full header:

```text
seed, mirrored, target, offset_x_raw, offset_y_raw, bracket_equal
reference_weapon_body_facts, reference_crossed, reference_solver_rejections
held_inert, held_solver_rejections
tactical_first_contact_tick, tactical_first_contact_cross_tick
tactical_solver_rejections, tactical_unattributed_anatomy_changes
```

`reference missing` means `reference_weapon_body_facts == 0`.
`reference uncrossed` means `reference_crossed == false`.
`Tactical cross-order` means a nonempty `tactical_first_contact_tick` whose
`tactical_first_contact_cross_tick` is empty or greater than the contact tick.
All reported intersections overlap and must be labelled that way; never sum them as
disjoint causes.

Do not parse or branch on productivity booleans, outcome, decision, waterfall,
energy, contact channels, integrity, wound or blood columns. A poison fixture changes
all forbidden values while holding permitted columns fixed and must produce a
byte-identical diagnostic payload excluding input-receipt metadata, because changed
input bytes necessarily change the receipt SHA embedded in the full report.

## Predeclared output

Write deterministic UTF-8 JSON with two-space indentation and a final newline, plus a
fixed plain-text rendering of the same values. Neither contains wall time. Field and
section order is:

1. schema `smart129-shared-solver-diagnosis-1`, source commit, both input paths,
   byte/line/SHA receipts, and `descriptorSetDigest`;
2. guard counts for rows, bracket drift and descriptor mismatch;
3. a complete 2x2 table of `reference_solver_rejections > 0` by
   `held_solver_rejections > 0`, ordered `(false,false)`, `(false,true)`,
   `(true,false)`, `(true,true)`;
4. positive-set identity and per-row-count identity, including held-only ordinals,
   reference-only ordinals and shared ordinals whose counts differ, all in canonical
   order;
5. fixed marginals in this order: mirror `false,true`; anatomy `fighter,brute`; the
   nine offsets in descriptor order; seeds `0..24`;
6. shared-solver intersections with reference missing, reference uncrossed, held
   non-inert, Tactical solver-positive, Tactical unattributed-positive and Tactical
   cross-order.

Every marginal row contains exactly:

```text
cases, referencePositive, heldPositive, bothPositive,
referenceOnly, heldOnly, equalPositiveCounts, unequalPositiveCounts
```

The identity section reports both set equality and the stronger vector equality
across all 900 rows. The 2x2 and every marginal must sum to its declared denominator.
Any bracket drift, descriptor error, impossible integer/boolean/optional field, or
table-sum mismatch is `invalid-schema-order-stop` and writes neither output. Refuse an
existing final or sibling temporary path. Write both complete renderings to temporary
siblings, then rename them to their final names. Any write or rename failure must
remove every temporary and final created by that invocation and return a named
refusal, so a reader can never mistake a half-pair or stale mixed pair for the result.

## Tests and mutation proof

Add these exact fixture tests without reading the real Smart128 artifacts:

```javascript
test("both frozen receipts must be byte identical and authority exact", () => {});
test("the full 110 column header and canonical descriptor order are required", () => {});
test("the solver two by two table counts every row once", () => {});
test("positive set identity is weaker than per row count identity", () => {});
test("mirror anatomy offset and seed marginals keep canonical order", () => {});
test("shared solver intersections overlap and retain their labels", () => {});
test("productivity outcome channel and damage columns cannot affect diagnosis", () => {});
test("a refused diagnosis writes no artifact", () => {});
test("a diagnosis publishes both artifacts or cleans the whole pair", () => {});
test("text and json output are byte identical on repeat", () => {});
```

Make the tests red, one mutation at a time, by comparing only set membership and
ignoring unequal positive counts; swapping held and reference axes; sorting offsets
lexically; treating shared intersections as a partition; accepting one altered input
receipt; reading one poisoned forbidden column; and retaining the first final after a
second-rename failure. Restore every mutation before analysis.

```powershell
node --test tools/diagnose_smart128.test.js
node tools/diagnose_smart128.js --out-prefix target/smart129-shared-solver-a
node tools/diagnose_smart128.js --out-prefix target/smart129-shared-solver-b
```

Commit the tool and tests green before either production invocation. Run both from
that clean commit and require byte-identical A/B `.txt` files and byte-identical A/B
`.json` files. Record each artifact's byte length and SHA-256 with the tool commit in
the durable matched-tactical evidence. Do not infer a result from console fragments.

## Decision and stop boundary

- If receipts, header, descriptor order, bracket guard or output invariants fail,
  record `invalid-input-stop`. Do not diagnose or regenerate Smart128.
- If the held/reference positive sets and all 900 per-row counts are exactly
  identical, record `shared-solver-counts-identical`. The next plan owns
  first-rejection provenance for the full shared class in canonical descriptor order;
  this result alone does not prove a shared internal cause.
- If either set membership or any per-row count differs, record
  `controlled-arm-solver-asymmetry`. The next plan diagnoses held/reference arm
  asymmetry from the earliest canonical mismatch; it does not inspect a favorable
  subset.

Smart129 performs no instrumentation, first-rejection rerun, mechanics or policy
change, Tactical tuning, held-out calibration, moving competence gate, training,
feature promotion, UI work or `ARTICULATED_HASH` creation. Expected registered pin
moves are exactly zero. Verification is:

```powershell
node --test tools/diagnose_smart128.test.js
node tools/check_docs.js
git diff --check
```

After the evidence is durable, delete this plan. Any successor gets a new
predeclared session rather than extending this offline query after seeing its output.
