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

The Canvas reference path also treats blur and dash state as measured costs. Do not
add `shadowBlur` as ambient polish or introduce another dashed-stroke pass without a
foreground-browser comparison and the repeated baseline required by the
[Canvas evidence method](../performance/evidence/2026-08-canvas-rendering.md#method-and-controls).
That is a renderer-specific budget, not a simulation or art-asset rule.

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

## Renderer roles

The shipped Canvas renderer remains the playable reference and diagnostic renderer.
It is the control for simulation, visibility, and presentation comparisons, and its
Tactical and Dev modes remain useful even after a production client exists.

The shipped v2 presentation path defaults to the procedural Babylon greybox and can
load the pinned representative-room GLB for review. Both read renderer-owned snapshot
copies, repeat the authoritative visibility boundary, and never own simulation
state. The room pipeline establishes reproducible authored-asset delivery, not a
visible art or foreground performance pass; both decisions remain pending. The
durable rationale is recorded in [ADR 0003](../decisions/0003-renderer-outside-sim.md).

## Superseded DESIGN destinations

This document supersedes `DESIGN.md#art-direction`. The historical Canvas and
isometric performance claims formerly adjacent to that section live under
[performance evidence](../performance/README.md), not in the visual contract.
