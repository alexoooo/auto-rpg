# Session 05 -- next-agent handoff

## Mission

Resume at experiment 0088 only after creating a genuinely authored,
nonprimitive torso-to-waist subsystem. Do not spend formal IDs adjusting the
existing generator's radii, adding attached plates, rotating the shield, or
applying a generic texture. The last sprint stopped specifically because those
families no longer predict production-valid progress.

The desired deliverable is three visibly distinct Blender-authored
torso-to-waist candidates, one user-ranked production-valid finalist, and at
most one formal experiment confirming that finalist under `rigid-v5`. If none
passes the unscored readiness funnel, stop without creating 0088 and report
what prevented authorship.

## Exact starting checkpoint

| field | value |
| --- | --- |
| latest closed | `0087-hand-pivoted-shield-yaw` (rejected) |
| latest accepted | `0085-tall-narrow-proportion-model` |
| next legal ID | `0088` |
| active phase | `phase-05` |
| formula | `2` |
| reference profile | `rigid-v5` / `frozen-consistent-ontology` |
| accepted distance | `0.8581357420344911` |
| acceptance margin | `0.002` |
| accepted source SHA-256 | `f377cb5093ecb68b35d98fbe4e43cb83062bde61ec9ead0be4bf8d396a628b92` |
| accepted report SHA-256 | `1073cd52c174c9b82b6b24a22380cd3add86ad67fa7a43717ebd00aadc1b18bc` |

The accepted source is `asset-src/build_warrior.py`. Its retained broad change
is the floor-pivoted root scale `.91` in X and `1.10` in Z. The canonical
`public/assets/warrior.glb` validates at 918,004 bytes and 44,244 triangles.

`experiments/0087-hand-pivoted-shield-yaw.md` is the only top-level active-phase
record, but it is fully decided. The audit phrase `1 active` means one record in
the active phase, not one proposed experiment. Do not edit or renumber it.

The current `.review/similarity-v2` directory may still contain the rejected
0087 candidate report even though the source was restored. Before snapshotting
0088, run `npm run similarity:v5`; the snapshot command will then bind the fresh
accepted-source render and report.

## Read first

1. `AGENTS.md` in this directory.
2. [Rigid-v5 sprint record](../analysis/rigid-v5-cardinal-segmentation-and-sprint.md).
3. [Rigid-v4 audit](../analysis/rigid-v4-target-segmentation-audit.md) for the
   rationale behind accepted 0085.
4. [Phase-02 debrief](../analysis/phase-02-first-ten-debrief.md) for the closed
   scalar families.
5. [Authored asset boundary](../reference/authored-asset-v2.md).
6. [Session 03](warrior-authored-search-03-authored-subsystems.md) and
   [session 04](warrior-authored-search-04-next-ten.md).

## What exists and what does not

- `asset-src/v2/warrior-v2.blend` is an inspectable deterministic export
  foundation with semantic extras, UVs, tangents, and PBR textures. It still
  inherits the primitive v1 geometry. It is not the sought authored model.
- `asset-src/v3/` contains screening scripts and parameter records only. There
  is no `warrior-v3.blend`, exporter, contract, or genuine authored subsystem
  yet. Creating those is the next session's central work.
- `metric/reference/rigid-v5/` is frozen. Do not tune it in response to a
  candidate.
- `metric/reference/proposals/warrior-angles-cardinal-imagegen-v2.png` is the
  reviewed cardinal segmentation proposal. It is not a mask to copy directly.
- `asset-src/textures/worn-dark-steel-albedo-v1.png` is a reusable generated
  tile. Its broad application was screened and found sub-margin; do not use it
  as the primary change in 0088.
- Temporary torso, shield, and texture screening renders have been removed.
  Formal `.review/experiments` evidence and phase archives remain.

## Ruler interpretation

The user's segmentation concern was correct. `rigid-v4` accidentally routed
pure `left` and `right` through the diagonal sheet because it used a substring
test. `rigid-v5` uses the exact cardinal set `{front, left, back, right}` and a
shared ontology. Cardinal mail material pixels are present in all four views.

The structural waist remains coarse even in v5. Treat waist and mail residuals
as broad guidance, not exact pixel supervision for individual lames or chain
links. The fixed references also come from two AI concept sheets whose
projections are not completely consistent. A candidate that improves one view
by sacrificing its neighbor may be exposing that inconsistency rather than a
parameter worth tuning.

Never compare the absolute v5 score with v4, v3, or v2. Only candidate-minus-
baseline deltas inside one frozen profile are asset evidence.

## Closed or paused families

Do not reopen these without a materially different representation:

- whole-root scaling after accepted 0085;
- smooth circular/ring-loft torso shells after 0086;
- nearby shield-yaw tuning after 0087;
- generic steel albedo mottling over primitive surfaces;
- primitive or procedural gauntlets, hands, arm tubes, elbow cops, ears,
  sideburn blobs, hair arrays, pauldron blocks, radial skirt panels, torus
  collars, and shallow center-fan breastplate domes;
- small rivet, seam, pommel, or material scalar sweeps intended to compensate
  for missing broad form.

The reusable lesson is not that shape or texture is unimportant. It is that the
current stock primitives cannot express fitted, irregular, layered armour, and
generic texture cannot repair that geometry.

## Session implementation

### 1. Establish authored v3 authority

Create:

- `asset-src/v3/warrior-v3.blend` -- authoritative editable Blender source;
- `asset-src/v3/export_warrior_v3.py` -- deterministic export;
- `asset-src/v3/warrior-v3.contract.json` -- root, semantic nodes, material
  slots, sockets, bounds, topology and payload limits;
- `scripts/build-warrior-v3.mjs` and `scripts/validate-warrior-v3.mjs`;
- package scripts `asset:v3:build` and `asset:v3:validate`.

It is acceptable to import the accepted control as a spatial guide, but the new
torso and waist must be authored mesh data. Their primary silhouette may not be
generated from spheres, cones, cylinders, tori, flat badges, or circular ring
lofts.

Keep the current accepted asset parallel and untouched during screening. Export
v3 to a comparison GLB such as `public/assets/warrior-v3.glb`; do not replace
`warrior.glb` before formal acceptance.

### 2. Author three torso-to-waist designs

All three must include front, back, shoulder transition, lower rib/waist
transition, and crotch/upper-thigh coverage as one coherent subsystem. Suggested
design space:

1. a forged cuirass with broad nonradial front/rear planes and a short,
   integrated fauld transition;
2. an overlapping two- or three-lame waist with explicit over/under order and
   fewer broad anatomical panels rather than a repeated radial ring;
3. an asymmetric battle-worn plate system with restrained side articulation,
   preserving bilateral mass but avoiding perfectly repeated decoration.

These are design directions, not permission to bundle unrelated materials,
pose, shield, hair, or lighting changes. Use neutral accepted-like materials in
the form screen. UV seams and region ownership must already be stable so later
texture work does not require another topology rewrite.

### 3. Unscored readiness funnel

For each variant:

1. Render all eight fixed views.
2. Validate manifold topology, normals, UVs, semantic extras, bounds, and GLB
   re-import parity.
3. Inspect torso, waist, shoulder, thigh-root, shield-occluded and rear views at
   full resolution.
4. Reject any egg, rubber tunic, barrel, skirt cage, pouch row, repeated piano
   keys, badge, floating plate, open crotch, cloth hole, swallowed thigh, or
   impossible bend.
5. Produce a labelled contact sheet and ask the user to rank target similarity
   and production coherence separately.
6. Run classical v5 only on production-valid variants. A credible finalist
   should improve by more than noise and should not win solely through one
   inconsistent view.

Only the preferred finalist proceeds to a full neural score. Formal experiment
0088 is confirmation of those frozen bytes, not another opportunity to tune.

### 4. Formal 0088 boundary

Copy `experiments/TEMPLATE.md` to a descriptive `0088-*.md`. Preregister:

- exact source/mesh/parameter digest;
- the complete replacement node set and what is removed;
- expected global, structure, silhouette, torso/waist-region, and per-view
  movement;
- unchanged head, arms, equipment, cameras, landmarks, ruler, and materials;
- hard production gates from the readiness review;
- GLB source/re-import parity and contact invariants.

Use the standard lifecycle:

```powershell
npm run similarity:v5
npm run similarity:experiment:snapshot -- 0088-name baseline
# Apply only the frozen candidate.
npm run similarity:v5
npm run similarity:experiment:snapshot -- 0088-name candidate
# Complete all-eight review and the record.
npm run similarity:experiment:decide -- 0088-name accepted
# or: restore the baseline source, rerender, then decide rejected.
npm run similarity:experiment:audit
```

The aggregate must improve by at least the checkpoint margin `.002`, but that
alone is insufficient. Require coherent torso/waist structural improvement,
bounded unaffected spill, no major view sacrifice, and a production pass.

## Required gates

Run from `warrior-prototype`:

```powershell
npm run similarity:test
npm run similarity:experiment:audit
npm test
npm run asset:validate
npm run asset:v2:validate
npm run asset:v3:validate
npm run lint
npm run build
```

Run `node tools/check_docs.js` from the repository root after documentation
changes. Do not run the root Rust/wasm/game gates unless the standalone boundary
was accidentally crossed; no root game, crate, client, wasm, replay, or golden
hash is expected to move.

## Stop and escalation rules

- Do not create 0088 if no authored variant passes readiness.
- Do not nearby-tune a formally rejected candidate.
- Stop after two production failures in the same new representation.
- Stop the sprint after three consecutive readiness misses and write a debrief.
- If Blender mesh authorship cannot be performed credibly in the available
  tool environment, say so. Do not disguise another scripted primitive assembly
  as authored topology.
- If torso-to-waist proves blocked, the next distinct subsystem is an authored
  continuous head/hair/beard replacement. It has the same three-variant and
  user-ranking gate.

## Definition of done

The handoff is complete when either:

1. one production-valid authored subsystem is formally accepted and the
   canonical GLB/checkpoint advances atomically; or
2. the authored screen is honestly shown to be blocked or invalid, no formal ID
   is wasted, and the next distinct subsystem is documented.

Success is a representation-level fact, not reaching experiment 0094.

