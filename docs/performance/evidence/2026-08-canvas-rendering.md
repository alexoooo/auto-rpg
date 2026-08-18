# 2026-08 Canvas rendering evidence

**Purpose:** Preserve the measurements that located the shipped Canvas renderer's bottlenecks and corrected four misleading hypotheses.
**Status:** historical
**Canonical source:** this migrated evidence record, and nothing else. `drawVision` and `MAX_DASH_SEGMENTS` lived in `web/main.js`, retired with the Canvas page — a historical measurement cannot be re-anchored to code that no longer exists, and pointing this line at the 3D renderer would claim these numbers were measured against it.
**Update when:** The Canvas baseline, profiling method, or interpretation of these measurements changes.

**Date:** August 2026. **Hardware:** the user's hybrid-core Windows laptop and its
visible Chrome window; exact CPU, GPU, and driver were not recorded, so these results
must not be generalized as a cross-machine budget.

This record preserves the measurements formerly under
`DESIGN.md#performance-notes` and the method repeated in
`AGENTS.md#gotchas-that-have-already-cost-time`.

## Method and controls

Pure JavaScript phases were timed directly. Raster/compositor work was measured only
in a visible foreground tab, because an automated hidden tab throttles animation and
uses software rasterization. Canvas work was removed by no-oping the actual primitive,
not by hiding the canvas. Moving-scene comparisons were paired on identical frames,
and every run ended by repeating the baseline. A large `idle` beside a small `render`
was treated as evidence that work completed after the callback.

Native `lab bench` was pinned to logical CPU 0 at high priority and interpreted as
best-of-three because migration across hybrid cores caused 2–3× swings.

## Simulation and JavaScript results

`lab bench --carved` measured 199,613 ticks/s for 200 depth-5 dungeon rollouts of
3,600 ticks on one thread, versus 185–201k for the uncarved 4v6 skirmish. Browser
`step` measured about 0.09 ms in a 16.7 ms frame.

At 64 units, parsing 1,870 floats cost 0.577 ms, including 0.380 ms boxing a copy.
Direct parsing of the live `Float32Array` into pooled rows reduced parse to 0.011 ms;
interpolation added 0.044 ms. `drawLevel` moved from 0.139 to 0.069 ms. Four clean
`getBoundingClientRect` calls cost 0.018 ms but 0.666 ms after dirty layout.

These timings do not establish Canvas raster duration. Repeating `render` in a loop
gave 6.6, 4.7, 4.4, 23.0, and 7.1 ms at 5, 20, 50, 150, and 300 iterations: a
non-monotonic back-pressure result, not a per-call cost.

## Overdraw: real, but not the final bottleneck

With 41 visible bodies on a 6.5-million-pixel canvas, fill-area accounting found
`drawVision` at 13.41 screens, `drawLantern` at 1.74, `drawLevel` at 0.50, and
`drawCharacter` at 0.04. The obvious character-drawing hypothesis was wrong. Limiting
filled sight discs reduced total fill from 15.69 screens to 2.60, but eight bodies
still ran at roughly 11 fps.

## Stroke tessellation

Primitive removal on the same paused scene produced:

| Configuration | fps |
|---|---:|
| baseline, 8 bodies | 11.2 |
| `stroke()` no-op | 54.4 |
| every drawing primitive no-op | 49.9 |
| game loop stopped | 59.5 |

Attribution found `drawVision` producing 3,363 dash subpaths per frame at a 792 px
radius, 80% of all dashing. A controlled second round measured 13.7 fps shipped,
40.5 with 12 dashes, 53.8 with solid sight rings, 52.3 with rings absent, and 59.3
with all strokes absent. Solid sight rings shipped. `drawReach` retained its measured
567 dashed marks; a global ceiling protects patterns from runaway radii.

## Compositor blur

After the dash fix, a live two-round comparison measured baseline 33.2 fps,
`updateHud` suppressed 33.0, HUD `backdrop-filter` removed 43.0, all strokes
suppressed 55.5, and all Canvas rendering suppressed 55.9. The DOM-write hypothesis
was wrong; seventeen compositor blurs cost about 7 ms per frame on this machine. The
HUD now uses a flatter, more opaque scrim.

## Limitations

The evidence describes one Windows laptop, one visible Chrome configuration, and the
scenes recorded above. It cannot predict another GPU or browser. “Fills are free” was
only true at the measured backing-store size and was later narrowed by the isometric
record. Canvas command-submission timings must not be presented as raster timings.
