# 2026-08 isometric conversion evidence

**Purpose:** Preserve what the Canvas isometric conversion changed, measured, and left unresolved.
**Status:** historical
**Canonical source:** this migrated evidence record, and nothing else. `WORLD_DPR_MAX` and `render` lived in `web/main.js`, retired with the Canvas page — a historical measurement cannot be re-anchored to code that no longer exists.
**Update when:** World-mode projection, backing resolution, pixel-identity method, or the isometric reference baseline changes.

**Date:** August 2026. **Hardware:** the user's Windows machine in a visible Chrome
window; CPU, GPU, driver, and display model were not recorded. Results are specific to
that setup.

This record preserves the measurements and corrections formerly under
`DESIGN.md#what-the-isometric-conversion-cost`.

## Method and controls

Work counts were compared against the top-down control, while foreground frame-strip
measurements were used for raster/compositor behavior. The simulation could be paused
to keep body count and scene state fixed. Resolution comparisons recorded CSS size,
display ratio, backing-store size, and repeated fps range. Grain and lighting effects
were independently removed. Pixel-identity checks froze the wall clock and simulation
and repeated captures within a load and across reloads.

## Conversion work

Isometric rock deleted the old per-frame `edge` stroke because lit tops and shaded
sides provide their own silhouette. An earlier draft called it the second-largest
stroke; that ranking was unsupported and is superseded. What is known is several
hundred undashed subpaths per frame before conversion and none afterward.

The conversion added filled depth bands and a larger level bake, paid on map or fog
revision rather than per tile per frame. Billboard bodies reduced their shadow from
two fills to one. The ground shear has determinant one, so fill area was unchanged;
the historical 13.41-screen vision-disc area stayed 13.41 and its perimeter grew 9%.
`drawReach` remained at the previously measured 567 marks.

Two top-down corrections were intentionally shared: the last unbounded route dash was
capped, and callouts retained the declaring body's radius after its live row vanished.
The earlier “exactly one top-down change” statement was stale and is superseded.

## Backing-store limit

At 1677 × 1101 CSS pixels and display ratio 1.6, World mode allocated 2683 × 1762
(4.73 million pixels) and ran at 7–9 fps while JavaScript submitted a frame in
0.36–0.50 ms; 113–119 ms remained in raster/composite work. A World-only ratio of
0.75 produced 1258 × 826 and 30–32 fps. At a fixed 1500 × 1000 comparison it produced
44–50 fps, versus 27–30 at ratio 1.0. Removing grain did not move the repeated range.
Removing vignette, torch pools, and lantern helped but harmed the intended art for
less gain. World mode therefore uses the softer 0.75 ratio while DOM and flat
diagnostic modes remain native resolution.

## Pixel identity

At `devicePixelRatio = 1.5`, one build emitted three different `toDataURL` strings
for the same paused, clock-frozen frame within one page load. At an integer ratio it
was stable across repeats and reloads. A byte-identity gate must therefore override
the ratio and resize before capture; monitor placement otherwise changes the test.

## Limitations and outstanding measurement

No trustworthy before/after `render` mean for the complete isometric conversion was
recorded, because Canvas commands are queued. Work counts support a prediction, not a
duration. Future measurement must use a visible foreground tab, repeat the baseline,
and name whether the comparison begins before or after the old edge stroke was
removed. These limitations are why Canvas remains the reference renderer rather than
the production performance bet.
