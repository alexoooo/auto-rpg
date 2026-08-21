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

## One iteration

1. Create `experiments/NNNN-short-name.md` from `TEMPLATE.md`. Before editing,
   state the visual observation, falsifiable hypothesis, exact change boundary,
   expected component/view movement, and rejection conditions.
2. Run `npm run similarity`, then snapshot it with
   `npm run similarity:experiment:snapshot -- NNNN-short-name baseline`.
3. Make only the registered asset change. Do not tune the metric or reference
   annotation in response to the candidate.
4. Run `npm run similarity`, then snapshot it with
   `npm run similarity:experiment:snapshot -- NNNN-short-name candidate`.
   The ignored `.review/experiments/` directory retains the renders, reports,
   source hashes, component deltas, and view deltas used for the decision. The
   same command copies the candidate's fixed front view into the tracked
   `experiments/progress/` gallery.
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
   Revert an unsuccessful source edit, but retain its experiment record because
   a disproved hypothesis is still useful. Retain its progress frame too, and
   label its decision in `experiments/progress/README.md`. Complete the record
   with the exact result, decision, observations, and the next highest-value question.
8. Run the nested `AGENTS.md` gates. The next iteration starts from the last
   accepted asset and cites any earlier observation it builds upon.

The tracked Markdown record is durable knowledge. Generated evidence stays
ignored because eight beauty images, eight masks, and neural reports are large;
their hashes and numerical summary in the record make the evidence identifiable.
