# Similarity iteration protocol

The goal of an iteration is not merely to lower one number. It is to learn one
reusable fact about how authored changes affect the reference match, while
leaving behind enough evidence to reproduce the decision.

## Fixed controls

Keep the `rigid-v1` references, annotations, cameras, renderer, model weights,
formula version, and component weights unchanged during an asset experiment.
Changing the ruler and the object in one iteration makes the result
uninterpretable. Metric improvements use their own experiment and first rescore
the accepted asset on both versions.

Use one causal theme per experiment. A theme may move several coordinates when
they form one indivisible feature, such as mirroring the complete sword and
shield assembly. Do not combine unrelated shape, material, lighting, and camera
changes just because they fit in one edit.

Formal IDs are confirmation evidence, not modeling scratch space. Before
preregistering a representation-level candidate, screen at least three
materially different variants through all eight low-cost structural renders,
contact checks, and full-resolution production review. Neural scoring is for the
shortlist. A scalar edit to a representation family already closed by two
failures is not a new hypothesis.

## One iteration

1. Create `experiments/NNNN-short-name.md` from `TEMPLATE.md`. Before editing,
   state the visual observation, falsifiable hypothesis, exact change boundary,
   expected component/view movement, and rejection conditions.
2. Run `npm run similarity`, then snapshot it with
   `npm run similarity:experiment:snapshot -- NNNN-short-name baseline`.
   The snapshot command refuses a stale report, a non-canonical score, an
   incomplete pre-registration, a non-sequential ID, or a source that differs
   from `accepted-state.json`. Snapshots are immutable and written atomically.
3. Make only the registered asset change. Do not tune the metric or reference
   annotation in response to the candidate.
4. Run `npm run similarity`, then snapshot it with
   `npm run similarity:experiment:snapshot -- NNNN-short-name candidate`.
   The ignored `.review/experiments/` directory retains the renders, reports,
   source hashes, component deltas, and view deltas used for the decision. The
   The report hashes must match every render and landmark file at capture time;
   mask overlays and the exact authored source are retained with both stages.
5. Inspect all eight candidate renders and mask overlays. A lower score is kept
   only when the image changed in the intended way and the diagnostic movement
   has a plausible causal explanation. Use the randomized human A/B tool when
   the visual result is ambiguous.
6. Treat an absolute aggregate change smaller than `0.001` as inconclusive until
   repeated. This is a decision margin, not a claim about statistical noise.
   Reject or revise candidates that improve the aggregate by exploiting an
   annotation error, damaging an important unmeasured quality, or causing a
   large unexplained component/view regression.
7. Keep a successful source edit and regenerate `public/assets/warrior.glb`.
   Revert an unsuccessful source edit to the captured baseline, but retain its experiment record because
   a disproved hypothesis is still useful. Retain its progress frame too, and
   label its decision. Complete the record with the exact result, decision,
   an explicit all-eight-view review, observations, and the next highest-value
   question. Leave `Status: proposed` until the record is complete, then run
   `npm run similarity:experiment:decide -- NNNN-short-name accepted|rejected`.
   This command verifies the candidate or reverted baseline source, advances
   `accepted-state.json`, retains the front frame, and regenerates the gallery.
8. Run `npm run similarity:experiment:audit`, then the nested `AGENTS.md` gates.
   The audit checks contiguous records, immutable evidence, report hashes,
   accepted-source continuity, checkpoint state, and gallery membership. The next iteration starts from the last
   accepted asset and cites any earlier observation it builds upon.

The tracked Markdown record is durable knowledge. Generated evidence stays
ignored because eight beauty images, eight masks, and neural reports are large;
their hashes and numerical summary in the record make the evidence identifiable.

## Closing an experimental phase

A long experiment chain does not remain indefinitely as hundreds of active
records, progress images, and ignored render files. Close a phase when its ruler,
search space, or asset representation has reached a durable plateau, or before a
successor phase changes any of those controls.

The transition has five required products:

1. Write a debrief under `docs/analysis/` that records the accepted checkpoint,
   transferable findings, closed representation families, metric limitations,
   and the reason a new phase is warranted. This is the durable interpretation;
   do not make future agents reconstruct it from dozens of `Next question`
   sections.
2. Write a multi-session successor plan under `docs/plans/`. It names ruler and
   asset version boundaries, session order, exact gates, reference/hash
   expectations, and the condition that permits formal experiments to resume.
3. Compact the closed phase under `experiments/archive/phase-NN/`. Retain one
   complete concatenated ledger, a machine-readable manifest with source/report
   and result hashes, a labelled front-render contact sheet, and a short archive
   README. The ledger preserves the full individual narratives; the debrief
   carries only conclusions that remain useful.
4. Verify the compact archive before pruning. The archive manifest must cover a
   contiguous, fully decided range and reproduce its terminal accepted source,
   report, distance, and experiment identity. Global numbering continues after
   the archive; it never resets or silently reuses an ID.
5. Remove the superseded top-level records, individual progress frames, and
   `.review` snapshots only after verification. Also remove disposable build
   output. Keep pinned model caches, environments, and dependencies when another
   phase is imminent; they are reusable tooling rather than historical evidence.

For phase 01 the explicit commands are:

```powershell
npm run similarity:phase:contact-sheet -- experiments/progress experiments/archive/phase-01/front-contact-sheet.png
npm run similarity:phase:archive -- phase-01 phase-02
npm run similarity:experiment:audit
```

The archive command refuses an active proposal, source/checkpoint mismatch,
missing progress frame, missing snapshot summary, noncontiguous range, or an
existing archive. It writes the ledger and manifest before changing the active
checkpoint, prunes only after those products exist, and finishes by running the
archive-aware audit.

An archive closes evidence storage, not intellectual responsibility. If an old
candidate becomes relevant under a new ruler, cite its archived ID and rerun it
as a newly preregistered experiment. Never retroactively change its decision or
splice a formula-v2 score into the formula-v1 ledger.

## Phase-02 evidence

Phase 02 uses rigid-v2 as its primary diagnostic report. Each experiment records
the global result, affected-region movement, unaffected spill, contacts, and an
all-eight-view production review. Formula v1 is still run as a historical
diagnostic but its number is not compared directly to the v2 phase baseline.

Rigid-v2 remains provisionally calibrated. Acceptance therefore requires the
global margin from `metric/calibration/profile.json`, the preregistered affected
region gain, bounded unaffected spill, coherent neural movement, and an explicit
production-coherence pass. Ambiguous results additionally use the digest-pinned
blinded A/B tool, which records target similarity and production coherence
separately.

The current contracts are [similarity v2](../docs/reference/similarity-v2.md)
and [authored asset v2](../docs/reference/authored-asset-v2.md).

Experiments 0075–0084 confirmed that isolated scalar edits remain stalled under
the better ruler. Their durable interpretation is the
[phase-02 first-ten debrief](../docs/analysis/phase-02-first-ten-debrief.md).
The next block follows the
[authored-search plan](../docs/plans/warrior-authored-search-00-overview.md).
Its ruler transition is recorded in the
[rigid-v4 target-segmentation audit](../docs/analysis/rigid-v4-target-segmentation-audit.md),
and experiment 0085 must still cross a representation boundary.

The active phase now uses `rigid-v5`. The v5 transition corrects exact
cardinal/diagonal source routing and freezes a consistent eight-view ontology;
it does not credit the resulting baseline movement as asset progress. The
[rigid-v5 cardinal audit and sprint record](../docs/analysis/rigid-v5-cardinal-segmentation-and-sprint.md)
owns the rationale, limitations, and experiments 0086-0087. No new formal
record may start until the authored-subsystem readiness gate is restored. The
[next-agent handoff](../docs/plans/warrior-authored-search-05-next-agent-handoff.md)
pins the exact checkpoint and owns the implementation sequence for experiment
0088.
