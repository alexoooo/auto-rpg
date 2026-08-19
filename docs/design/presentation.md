# Presentation

**Purpose:** Preserve the shipped visual language, the boundary between gameplay readouts and rendering style, and the evidence required of shipped figures.
**Status:** current
**Canonical source:** [`web/assets/ASSET_SPEC.md`](../../web/assets/ASSET_SPEC.md), [`client/src/render/`](../../client/src/render/renderer.ts), and the [renderer contract](../reference/renderer-contract.md#renderer-owned-snapshot-boundary)
**Update when:** Art direction, view-mode controls, HUD language, the published body proportions, or the reference renderer changes.

## A warm, legible room

The room is brown-black rather than blue-black. Materials separate primarily by
lightness, not hue; doors and flame spend the limited chroma budget where recognition
needs it. Palette constants are relationships, not independent swatches, and should
be tuned as a ladder. The source of truth is the asset authoring contract, not a
copied color table here. It was `PAL` in `web/main.js` until the Canvas page was
retired, and no single constant has inherited that role.

World-mode environment marks obey the room palette. Gameplay instruments — health,
lock, destination, reach, and visibility readouts — retain deliberate chroma and are
shared with the flat Tactical and Dev controls. Desaturating a screenshot is the
review: a material that disappears was relying on hue instead of value.

Figures read first as silhouettes with a warm rim. At roughly forty pixels tall the
body archetype and facing must remain recognizable without interior detail. That is
the standard for both procedural fallback and authored art, and why the current PNG
pipeline may mix composite bodies with procedural limb or weapon layers while art is
integrated.

The HUD is framed rather than floating: bone text, near-black scrims, and thin warm
iron borders. It is one DOM shared by all view modes and does not repaint its style on
a mode switch. Blur was removed on measurement; the flat opaque scrim is both the
look and the cheaper implementation.

Occlusion must hide the room without hiding the player from their own controls.
World mode therefore keeps ordinary depth ordering, then yields foreground masonry
only inside a soft, upright, hero-sized ellipse where a nearby wall would cover the
hero. The wall's shaded side remains outside that local cutaway; fading a complete
depth band erased the room face and made the geometry read as a disappearing slab.
The gate and clipped paint lived beside `wallBandCutsHero` in `web/main.js`, and went
with it; the rule survives as art direction the 3D path owes rather than as code.

Blur and dash state are measured costs, and the rule outlives the renderer that
measured it. Do not add `shadowBlur` as ambient polish or introduce another
dashed-stroke pass without a foreground-browser comparison and the repeated baseline
required by the
[Canvas evidence method](../performance/evidence/2026-08-canvas-rendering.md#method-and-controls).
The measurement was taken on the retired Canvas path; what generalizes is the method and
the refusal to accept a polish pass on assertion, not the millisecond figures.

## The published anatomy has no neck

The arena's `[Texture]` proxy draws every published capsule at its published radius, and
the result is a body without a neck. The recordings publish a torso radius of 0.35 on the
Fighter and 0.40 on the Brute against a 0.20/0.25 head and a 0.30/0.35 leg capsule, so a
head drawn faithfully sits inside the shoulders' own silhouette and the legs sit under
the middle of something wider than they are. Lit and shadowed it reads as a body in a
room; it does not read as a fighter.

**That is the published anatomy and not a proxy defect** — `[Geometry]` draws the same
silhouette out of the same rows, which is what settles it. The implemented presentation
fix is an authored rig whose art narrows a shape the simulation still sweeps at its published
radius. A presentation layer that quietly narrowed a published capsule would be drawing a
body nothing swept, which is the one thing neither dress may do. **Whether it is
acceptable is still an owner's judgement**: the current Fighter and Brute have
separate authored limb chains and class equipment, with automated 40-pixel silhouette
bounds, but foreground reset/walk/fog/Arena review remains the acceptance authority.
That review is recorded in the
[arena matrix](../performance/v2-arena-matrix.md#owed-visual-judgements).

## What the 2026-08-17 production pass established

Nine sessions of concept-production work landed against `web/assets/CONCEPT.png`, and the
durable half of what they built belongs here rather than in a finished plan.

- **All four wall orientations exist with stable topology identity.** Disclosure and
  remembered-state changes no longer delete and recreate the same facade, which was the
  defect that made walls flicker on every fog update.
- **Walls have physical depth, coping, and authored 1/2/3/5/8-cell modules**, and the map
  is filled by floor or overburden rather than by blank background pretending to be world
  geometry. The solid/open envelope is still the authoritative tile topology; the geometry
  composed inside it is presentation.
- **Figures are assembled at their authoritative pose by direct joint-local mesh
  parenting.** The former pale quad and orange head fragment came from broken GPU
  skin/root composition, and the repair carries a mutation-proven regression -- which is
  the standard, because a rig that silently falls back to a proxy looks like a rig.
- **Doors are physical hinged publications**, torch fixtures and authoritative torch
  objects use the pinned authored flame path, and the old cone and duplicate room-proxy
  artifacts are gone.
- **Six views are directly selectable** -- World, Geometry, Top Down, First Person, Free,
  Dev -- with mouse movement the default, direct tank movement opt-in, and Q/E turns.
- **The HUD is reachable without covering the play field**: FPS readout, health, equipment,
  control cluster and a collapsed Systems drawer.

**What it did not establish is style parity, and the pass was frozen rather than
finished.** The current capture is an acceptance baseline: the target reads as one painted
scene and the current renderer has the same broad composition vocabulary while its
individual systems still read as separate 3D assets. The six specific comparison failures
carried forward -- fire scale, stone relief, floor breakup, combatant finish, composition
hierarchy and HUD art direction -- are forward work and are listed with their owed sessions
in [the concept production plan](../plans/concept-production-00-overview.md), alongside
this document, which owns the shipped visual language.

## Renderer roles

**There is one renderer.** This section described the Canvas path as the playable
reference and the control for every presentation comparison; that page was retired during
the embodied-combat work, along with about 16.2k lines that no build included and no test
executed. Comments and documents citing `web/main.js`, `web/draw.js`, `web/rig.js` or
`web/assets.js` as a source of truth are stale by definition, and several presentation
constants in `client/src/render/` were derived from it and now say so in the past tense.

What survives of it is art direction rather than code, and where that is so this document
says which rule the 3D path *owes* rather than which file implements it -- the local
cutaway rule above is the worked example.

The shipped presentation path is the Babylon client. It defaults to the procedural greybox
and can load the pinned representative-room GLB for review. It reads renderer-owned
snapshot copies, repeats the authoritative visibility boundary, and never owns simulation
state. The durable rationale is recorded in
[ADR 0003](../decisions/0003-renderer-outside-sim.md).

## Superseded DESIGN destinations

This document supersedes `DESIGN.md#art-direction`. The historical Canvas and
isometric performance claims formerly adjacent to that section live under
[performance evidence](../performance/README.md), not in the visual contract.
