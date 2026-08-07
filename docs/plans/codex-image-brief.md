# Image-generation brief: art assets for auto-rpg

You are generating PNG art assets for the `auto-rpg` repository — images
only. A different agent owns all code, the manifest, integration, and
in-game review. You do not modify any JS, Rust, or JSON, you do not edit
`manifest.json`, and you do not need to run the game. Your deliverable is
image files plus a short report.

## The contract

Read `web/assets/ASSET_SPEC.md` first and treat it as binding. It defines the
isometric camera (projection ratios and a reference screenshot), the
committed pixel-art style and texel density, the global pixel-per-world-unit
scale, the character facing-set convention (how many quantized facings and
the pose per facing), the segment list per archetype, each archetype's body
size at global scale, the weapon axis and reach-length convention, the
environment asset categories (floor top-face variants, wall side/top faces
matching the block extrusion, grime/moss decals, props, torch/lantern
flicker frames), the palette, and the file naming scheme. If anything in
this brief conflicts with ASSET_SPEC.md, the spec wins. If the spec is
ambiguous on something you need, stop and report the gap rather than
guessing — the spec is meant to be self-contained and a gap in it is a bug.
`web/assets/CONCEPT.png`, if present, is the mood reference — directional
inspiration, not a template to copy.

If `web/assets/FEEDBACK.md` exists, it contains the integrating agent's
review of your previous batch (in-game screenshots, what passed, what must
be regenerated and why). Read it after the spec and address every item
before producing anything new.

## Style

Diablo 1 (1996) Cathedral mood: grimy, desaturated, oppressive. Chunky
pixel art at the spec's stated texel density — hand-placed-stone feel, dirt
and moss in the seams, nothing glossy, nothing outlined in black, nothing
cute. Palette and saturation rules are in the spec — in short, near-black to
umber-grey with bone highlights; saturation is reserved for blood.
Silhouette-first: every character segment must read at small size against
dark textured ground under dim torchlight, and every floor/wall texture must
stay quiet enough that figures and telegraphs pop over it. Environment
texture is the star of the mood but the servant of readability.

## Workflow — small calibration batch first

1. **First session (calibration batch)**: produce only (a) the complete
   segment set for ONE archetype (the Fighter) in ALL facings the spec
   requires, plus one weapon, and (b) one floor top-face variant, one wall
   side-face + top-face pair, and one torch sprite. Exact scale and poses
   per spec, transparent backgrounds, tight-cropped, spec-conformant
   filenames. Stop there — the integrating agent will wire these into the
   game, review them in-place, and write FEEDBACK.md.
2. **Before committing**, self-check every image against the spec: pixel
   dimensions consistent with the stated scale and the archetype's body
   size; facing angles match the spec's compass convention; poses match the
   per-facing reference; palette within the saturation rule; no
   anti-aliased halos against transparency at the stated texel density;
   wall/floor pieces drawn to the exact tile geometry the spec gives.
3. **Subsequent sessions (production batches)**: once FEEDBACK.md marks
   calibration passed, produce the remaining assets — the roster in all
   facings, all weapons and shields, remaining floor/wall variants, decals,
   props, lantern frames — reusing the exact generation settings/prompts
   that passed calibration, changing only the subject. Cross-asset
   consistency matters more than any single image. Deliver in coherent
   batches (one archetype complete, one asset category complete) rather
   than scattered singles, so each integration pass is meaningful.
4. Relative sizes between archetypes come from the sim — the spec lists
   each archetype's body size at global scale, and your canvases must
   follow those numbers, never drift.
## Rules

- Commit only PNG files under `web/assets/`, at spec-conformant paths.
  Touch nothing else — no manifest edits, no code, no spec edits.
- Never overwrite an image that FEEDBACK.md marked as passed, unless
  FEEDBACK.md explicitly requests its regeneration.
- End every session with a short report: what was produced, which spec
  sections or FEEDBACK items each batch addresses, and any spec gaps or
  ambiguities encountered.
 
