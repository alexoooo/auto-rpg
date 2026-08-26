# Rigid-v5 cardinal segmentation and phase-05 sprint

## Decision

The user's observation that the diagonal segmentation was cleaner than the
cardinal segmentation identified a real ruler defect. `rigid-v4` selected its
source sheet with a substring test: any view containing `left` or `right` used
the diagonal proposal. That accidentally included the pure cardinal `left` and
`right` views. The cardinal views also relied on coarser height-based repairs,
which produced inconsistent left/right legs and sometimes omitted the visible
mail field below the waist.

`rigid-v5` fixes the routing and freezes one shared ontology across all eight
views. Its accepted-control baseline is `0.8581357420344911`. This is ruler
movement from v4, not asset progress, and v4/v5 absolute scores are not
comparable.

## Reference construction

The cardinal concept sheet received a second image-generation segmentation
proposal, retained at
`metric/reference/proposals/warrior-angles-cardinal-imagegen-v2.png`. The
generation prompt requested a pixel-aligned, flat-color semantic mask with the
original four silhouettes and layout preserved, consistent limb ownership, and
the chainmail/under-armour region retained. As with the earlier proposals, the
generated image is evidence and a visual aid rather than direct scoring truth.

`metric/prepare_v5_reference.py` provides the deterministic scoring boundary:

- `front`, `left`, `back`, and `right` use the cardinal source exactly;
- the four diagonal views use the diagonal source;
- both paths use the same diagonal-derived class ontology;
- target silhouettes, reviewed annotations, and fixed registration remain in
  control of the metric rather than the generated pixels;
- the material pass retains visible mail below the waist where the proposal
  supports it.

All eight structural masks and the four cardinal material masks were reviewed
before the profile status changed to `frozen-consistent-ontology`. Cardinal
mail pixels are nontrivial in every view: front `3847`, left `2702`, back `6231`,
and right `4635`.

This is still an approximate segmentation. In particular, waist construction
remains one coarse structural class even where the material mask distinguishes
mail from plate or cloth. That is acceptable for broad-form selection, but it
must not be interpreted as pixel-perfect supervision for individual faulds,
chain links, hands, or other small regions.

## Sprint results

The sprint began from accepted experiment 0085: the `.91` X / `1.10` Z
floor-pivoted whole-warrior scale. It screened three torso shells, six shield
transforms, and three export-compatible UV texture scopes. Two candidates were
strong enough to consume formal IDs.

### 0086 -- longline torso shell

The longline six-ring torso improved the v4 aggregate by
`-0.0012890495464901`, but the full-resolution review rejected it. Its continuous
smooth surface read as a rubber tunic or egg rather than forged armour. The
lobstered screen read as shelves/bands, and the forged screen did not beat the
accepted control. This closes ring-loft torso shells as a shortcut; the next
torso candidate needs authored plate planes, overlap, and a deliberate waist
transition rather than another radius profile.

### 0087 -- hand-pivoted shield yaw

A 20-degree hand-pivoted shield yaw improved the v5 aggregate from
`0.8581357420344911` to `0.8555808491543346`, a delta of
`-0.002554892880156423`. Structure improved `-0.006707439`, but silhouette
regressed `+0.001787080`; only four views improved, and front-left regressed
`+0.015462103`, just beyond the registered cap. The transformed shield
landmarks were correctly carried with the geometry, so this was not a stale
anchor artifact. The candidate was rejected and the nearby yaw family is
closed: the mixed-view response reflects target projection inconsistency and
contact/occlusion tradeoffs rather than an unsolved scalar angle.

### UV texture screen -- no formal ID

The built-in image-generation tool produced a tileable dark worn-steel albedo,
retained at `asset-src/textures/worn-dark-steel-albedo-v1.png`. The Blender
screen used an ordinary image-texture node connected to Principled base color,
real UVs, repeat sampling, metallic `.72`, and roughness `.56`; it was therefore
an exportable material test, not a review-only procedural shader.

An initial screening bug selected almost every UV-bearing mesh for the broad
variant, including skin and hair. The corrected boundary selects only objects
whose accepted material slot is exactly `worn_dark_steel`. With accepted v5
classical distance `0.7712202763495937`, the results were:

| scope | distance | delta |
| --- | ---: | ---: |
| torso only | 0.7711586238255230 | -0.0000616525240707 |
| upper body | 0.7713005177528950 | +0.0000802414033013 |
| all rigid steel | 0.7718343525478100 | +0.0006140761982163 |

The mottling was visually restrained and did not create obvious noise, but no
scope approached the formal margin. The result does not close texture work. It
closes generic whole-region albedo mottling on the current primitive surfaces.
Future texture work needs authored UV islands and material-specific plate, mail,
leather, skin, and hair maps, evaluated only after each region's form aligns.

## Process findings

- Formal IDs worked as confirmation rather than modeling scratch space: nine
  torso/shield alternatives and three texture scopes were screened outside the
  ledger, while only two fixed candidates entered it.
- Candidate landmarks must transform with rigid equipment. The shield screen
  caught and corrected that integrity error before formal capture.
- The phase archive transition exposed a lifecycle bug: the next phase was
  seeded with the old phase baseline instead of the terminal accepted
  checkpoint. `scripts/archive-similarity-phase.mjs` now seeds both distance and
  hashes from the terminal checkpoint, and the archive-aware audit passes.
- The sprint stop rule fired after three consecutive readiness misses: torso,
  shield, and texture. Running thirteen more variations would not be evidence of
  progress.

## Next direction

The next sprint should not reopen torso ring lofts, shield yaw, or global steel
mottling. Its first deliverable should be one genuinely authored, nonprimitive
subsystem with deliberate topology and UV ownership. The highest-value choice
is a complete torso-to-waist armour assembly: broad front and rear plate planes,
an articulated but nonrepetitive waist transition, and no ignored-cloth hole.
Prepare three visibly distinct designs in Blender, reject production failures
before scoring, and formalize only a user-preferred candidate that beats the
v5 classical screen by a credible margin. Head/hair is the fallback if that
subsystem cannot be authored cleanly.

The executable handoff, including exact checkpoint hashes, artifact ownership,
commands, and stop rules, is
[session 05](../plans/warrior-authored-search-05-next-agent-handoff.md).

## Current artifact map

- Accepted authoring source: `asset-src/build_warrior.py`, source SHA-256
  `f377cb5093ecb68b35d98fbe4e43cb83062bde61ec9ead0be4bf8d396a628b92`.
- Accepted v5 report: SHA-256
  `1073cd52c174c9b82b6b24a22380cd3add86ad67fa7a43717ebd00aadc1b18bc`.
- Canonical GLB: `public/assets/warrior.glb`, 918,004 bytes, 44,244
  triangles, zero validator issues.
- Parallel v2 GLB: `public/assets/warrior-v2.glb`, 2,260,756 bytes, 44,340
  triangles, 24 semantic regions, zero validator issues. Its topology still
  derives from the primitive control.
- Frozen ruler: `metric/reference/rigid-v5/`.
- Cardinal proposal: `metric/reference/proposals/warrior-angles-cardinal-imagegen-v2.png`.
- Reusable texture source: `asset-src/textures/worn-dark-steel-albedo-v1.png`.
- Formal 0086 evidence is compacted in `experiments/archive/phase-04/`;
  formal 0087 remains as the decided active-phase record.

No formal experiment is proposed. Global numbering continues at 0088. The
ignored working report directory may contain the rejected 0087 render, so the
next session must rerender the accepted source with `npm run similarity:v5`
before capturing a new baseline.
