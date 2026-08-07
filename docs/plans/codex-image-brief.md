# Image-generation brief: art assets for auto-rpg

You are generating PNG art assets for the `auto-rpg` repository — images
only. A different agent owns all code, the manifest, integration, and
in-game review. You do not modify any JS, Rust, or JSON, you do not edit
`manifest.json`, and you do not need to run the game. Your deliverable is
image files plus a short report.

## The contract

Read `web/assets/ASSET_SPEC.md` first and treat it as binding. It defines the
isometric camera (projection ratios and a reference screenshot), the
committed painted style with its global light direction, the global
pixel-per-world-unit scale, the character layer convention (composite body
per facing with stride/idle frames, plus separate arm/weapon and shield
layers), the facing count and compass convention, each archetype's body size
at global scale, the weapon axis and reach-length convention, the
environment asset categories (floor top-face variants, wall side/top faces
matching the block extrusion, grime/moss decals, props, torch/lantern
flicker frames), the palette, and the file naming scheme. If anything in
this brief conflicts with ASSET_SPEC.md, the spec wins. If the spec is
ambiguous on something you need, stop and report the gap rather than
guessing — the spec is meant to be self-contained and a gap in it is a bug.
`web/assets/CONCEPT.png` is the style reference — match its rendering
style; directional inspiration for content, not a template to copy.

If `web/assets/FEEDBACK.md` exists, it contains the integrating agent's
review of your previous batch (in-game screenshots, what passed, what must
be regenerated and why). Read it after the spec and address every item
before producing anything new.

## Style

Diablo 1 (1996) Cathedral mood: grimy, desaturated, oppressive. **Painted**,
matching `CONCEPT.png`: hand-placed-stone feel, dirt and moss in the seams,
one global light direction as stated in the spec, consistent detail density
across every asset, nothing glossy, nothing outlined in black, nothing cute.
Soft painterly edges are fine — the contract is style consistency, not a
pixel grid. Palette and saturation rules are in the spec — in short,
near-black to umber-grey with bone highlights; saturation is reserved for
blood. Silhouette-first: every character must read at small size against
dark textured ground under dim torchlight, and every floor/wall texture must
stay quiet enough that figures and telegraphs pop over it. Environment
texture is the star of the mood but the servant of readability.

## Two things that go catastrophically wrong if misread

The spec states both. They are repeated here because each one silently
wastes an entire batch.

1. **Surfaces and faces are drawn flat and unprojected. Do not draw a
   diamond and do not draw a parallelogram.** A floor tile is a **square**
   of stone seen from straight above; a wall side face is a **rectangle** of
   stone seen straight on. The renderer applies the isometric shear itself.
   Art with the projection already baked in gets projected a second time and
   comes out as a rhombus of rhombuses.
2. **A composite body is a whole figure standing on its own feet, feet on
   the bottom edge of the canvas, centred left to right — in every facing
   and every frame.** The renderer plants it on a ground point and hangs its
   health bar off its crown, so a figure drawn a few pixels off centre bobs
   sideways as it walks and one floating above the bottom edge hovers. The
   arm and shield layers are drawn **detached and neutral**, relaxed along
   the facing, because the renderer rotates them to wherever the fight
   actually is — an arm drawn mid-swing gets rotated into a second, wrong
   mid-swing.

## Workflow — calibrate in two stages before mass-producing

The two calibration batches are split by **what the renderer does with the
asset**, not by what is easiest to draw. Each batch has exactly one
integration session waiting to receive it, so a batch that arrives early
waits, and a batch that mixes the two halves leaves half of itself
unreviewed.

1. **First session — the room**: produce only one floor top-face variant,
   one wall side-face + top-face pair, and one torch sprite. **No weapons,
   no figures, nothing else.** This is everything the renderer shears onto a
   surface or plants upright on a ground point, and it is what locks style,
   scale, palette, and geometry fit for every asset that follows. Stop there
   — the integrating agent wires them in, reviews in-game, and writes
   FEEDBACK.md.
2. **Second session — the body**: once FEEDBACK.md passes stage 1, produce
   ONE archetype (the Fighter) per the spec's layer convention — the
   composite body (legs+torso+head as one image) in every facing, with the
   stated stride/idle frames, plus its arm and shield layers — **and 2–3
   weapons** per the spec's axis/length convention. Match the style locked
   in stage 1 exactly. Stop and wait for review again.

   Weapons are here rather than in the first batch because a weapon image is
   two marker pixels and a drawing stretched between them: the renderer puts
   the hilt marker on a body's hand and the tip marker on the end of the
   blade the sim is actually swinging, and **length comes from the sim, never
   from your canvas**. There is nothing to review about a weapon until a
   figure is holding it, so one delivered early would sit unjudged. Draw them
   to read correctly at the heft the spec gives; the geometry is the
   renderer's problem and it is already proven.
3. **Before committing any batch**, self-check every image against the
   spec: canvas dimensions consistent with the stated scale and the
   subject's size at global scale; facing angles match the spec's compass
   convention; poses and stride frames match the per-facing reference;
   palette within the saturation rule; light direction consistent with the
   spec's global light; wall/floor pieces drawn to the exact tile geometry
   the spec gives; clean transparency.
4. **Production batches**: once FEEDBACK.md marks both calibrations passed,
   produce everything else — the remaining roster, all weapons and shields,
   remaining floor/wall variants, decals, props, lantern frames — reusing
   the exact generation settings/prompts that passed calibration, changing
   only the subject. Cross-asset consistency matters more than any single
   image. Deliver in coherent batches (one archetype complete, one asset
   category complete) rather than scattered singles, so each integration
   pass is meaningful.
5. Relative sizes between archetypes and weapon lengths come from the sim —
   the spec lists them at global scale, and your canvases must follow those
   numbers, never drift.
## Rules

- Commit only PNG files under `web/assets/`, at spec-conformant paths.
  Touch nothing else — no manifest edits, no code, no spec edits.
- Never overwrite an image that FEEDBACK.md marked as passed, unless
  FEEDBACK.md explicitly requests its regeneration.
- End every session with a short report: what was produced, which spec
  sections or FEEDBACK items each batch addresses, and any spec gaps or
  ambiguities encountered.
