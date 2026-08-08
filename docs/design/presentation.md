# Presentation

**Purpose:** Preserve the shipped visual language and the boundary between gameplay readouts and rendering style.
**Status:** current
**Canonical source:** [`web/main.js`](../../web/main.js#L6512), [`web/style.css`](../../web/style.css), [`web/assets/ASSET_SPEC.md`](../../web/assets/ASSET_SPEC.md), and the [renderer contract](../reference/renderer-contract.md#renderer-owned-snapshot-boundary)
**Update when:** Art direction, view-mode controls, HUD language, or the reference renderer changes.

## A warm, legible room

The room is brown-black rather than blue-black. Materials separate primarily by
lightness, not hue; doors and flame spend the limited chroma budget where recognition
needs it. Palette constants are relationships, not independent swatches, and should
be tuned as a ladder. The current source of truth is [`PAL`](../../web/main.js#L6512)
and the asset authoring contract, not a copied color table here.

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
The current gate and clipped paint live beside
[`foregroundWallVisibility`](../../web/main.js#L11085).

The Canvas reference path also treats blur and dash state as measured costs. Do not
add `shadowBlur` as ambient polish or introduce another dashed-stroke pass without a
foreground-browser comparison and the repeated baseline required by the
[Canvas evidence method](../performance/evidence/2026-08-canvas-rendering.md#method-and-controls).
That is a renderer-specific budget, not a simulation or art-asset rule.

## Renderer roles

The shipped Canvas renderer remains the playable reference and diagnostic renderer.
It is the control for simulation, visibility, and presentation comparisons, and its
Tactical and Dev modes remain useful even after a production client exists.

The shipped v2 presentation proof is a separate procedural Babylon greybox. It reads
renderer-owned snapshot copies, repeats the authoritative visibility boundary, and
never owns simulation state. It establishes the replaceable client seam and backend
fallback, but it does not yet establish production art or pass the pending foreground
performance gate. The durable rationale is recorded in
[ADR 0003](../decisions/0003-renderer-outside-sim.md).

## Superseded DESIGN destinations

This document supersedes `DESIGN.md#art-direction`. The historical Canvas and
isometric performance claims formerly adjacent to that section live under
[performance evidence](../performance/README.md), not in the visual contract.
