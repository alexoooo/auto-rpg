# Image-generation brief: segment art for auto-rpg

You are generating PNG art assets for the `auto-rpg` repository. The
rendering code, rig, manifest loader, and fallback art already exist — your
only job is producing images and registering them in the manifest. You do not
modify any JS or Rust code.

## The contract

Read `web/assets/ASSET_SPEC.md` first and treat it as binding. It defines the
camera perspective, the global pixel-per-world-unit scale, the segment list
per archetype with required poses and pivot placement, the weapon axis and
reach-length convention, the palette, and the file naming scheme. If anything
in this brief conflicts with ASSET_SPEC.md, the spec wins. If the spec is
ambiguous on something you need, stop and report the gap rather than
guessing — the spec is meant to be self-contained and a gap in it is a bug.

## Style

Diablo 1 (1996) Cathedral mood: grimy, desaturated, oppressive. Palette and
saturation rules are in the spec — in short, near-black to umber-grey with
bone highlights; saturation is reserved for blood. Silhouette-first: every
segment must read at small size against near-black under a dim radial light.
Painterly-chunky beats clean vector; nothing glossy, nothing outlined in
black, nothing cute.

## Workflow — calibrate before mass-producing

1. Generate the complete segment set for ONE archetype (the Fighter) plus
   one weapon, at the exact scale and poses the spec requires, on
   transparent backgrounds, tight-cropped.
2. Add their manifest entries with measured anchor/pivot coordinates.
3. Load the game, screenshot the result in the `[regular]` view standing
   next to the procedural-fallback rendering of another archetype, and
   self-review: perspective matches the camera; scale is right relative to
   the fallback bodies and the 4-unit grid; pivots don't wobble during the
   walk cycle or blade swing; palette obeys the saturation rule; the windup
   pose reads clearly.
4. Fix and regenerate until that one archetype passes. Only then produce the
   rest of the roster, all weapons, and all shields — reusing the exact
   generation settings/prompts that passed calibration, changing only the
   subject. Cross-roster consistency matters more than any single image.
5. Relative sizes between archetypes come from the sim (the spec lists each
   archetype's body size at global scale) — a Brute's torso is bigger than a
   Fighter's because the numbers say so, never because a canvas drifted.

## Rules

- Commit only PNGs under `web/assets/` and edits to
  `web/assets/manifest.json`. Touch nothing else.
- Every manifest entry you add must include anchor, pivot, and scale measured
  from the actual image, not copied from another entry.
- A missing or wrong image must never break the game — the fallback covers
  absence — so never commit a manifest entry pointing at a file that doesn't
  exist.
- Verify at the end: load the game, confirm every archetype and weapon
  renders from your images with no fallback segments visible in a normal
  fight, and attach final screenshots of each archetype in your report.
