# Implementation brief: segmented art, animation, and sound for auto-rpg

You are working in the `auto-rpg` repository (github.com/alexoooo/auto-rpg): a
deterministic auto-battler with a fixed-point (16.16) simulation in
`crates/sim`, an agent boundary in `crates/policy`, a hand-rolled wasm ABI in
`crates/web`, and a vanilla no-build-step frontend in `web/`. Read `README.md`
and `DESIGN.md` in full before writing any code. Read the existing renderer in
`web/` and the snapshot ABI in `crates/web` before touching either.

Your task: give the game rich segmented (paper-doll) character art, procedural
animation, a dark Diablo-1-style visual treatment, and fully synthesized
event-driven sound — without violating any of the architectural guarantees
below.

**Division of labor**: you implement everything except the PNG image assets
themselves. Images are produced in separate sessions by a different agent
working from `codex-image-brief.md` against the asset contract you author
(the manifest schema and `web/assets/ASSET_SPEC.md`, defined in Part 2). Your
implementation must be complete and playable before any image exists, via the
procedural fallback rendering, and must pick up images automatically as they
land in the manifest. All sound is synthesized programmatically by you — there
are no audio asset files in this project.

---

## Hard constraints — violating any of these fails the task

1. **The determinism claim is untouchable.** The five hashes asserted by
   `node --test tools/wasm_check.js` must not change, and
   `cargo run --release -p lab -- verify --seeds 200` must still report all
   runs identical on re-run and exact on replay. Run both before your first
   commit to record the baseline, and after every change that touches
   `crates/sim` or `crates/web`.
2. **The sim stays engine-free and dependency-free.** `crates/sim` may gain an
   event-emission mechanism (defined below) but no rendering, audio, timing,
   I/O, or float code, and no external crates. Nothing in the event path may
   mutate simulation state or alter tick outcomes — events are derived,
   write-only output.
3. **The renderer never lies.** Animation must be driven by sim state (facing,
   blade bearing, action phase, phase progress, velocity), never by canned
   clips with their own timelines. A windup that lasts 33 ticks in the sim
   must visibly last 33 ticks on screen. Telegraph legibility is a gameplay
   mechanic; art that obscures or desynchronizes from it is a bug.
4. **All new rendering and audio lives render-side**: in `web/` (JS) and, only
   if strictly needed for snapshot/event plumbing, `crates/web`. The no-build-
   step property of `web/` is preserved: plain JS modules, no bundler, no npm.
   Web Audio API and Canvas2D/WebGL2 are browser-native and allowed; external
   JS libraries are not, for now. Generated image/audio assets committed under
   `web/assets/` are expected and fine — they are data, not dependencies.
5. **All existing tests pass** (`cargo test`, currently ~393) and the three
   view modes (`G`: regular / tactical / dev) keep working. Tactical and dev
   views must remain the plain readable disc-and-wedge views — the new art
   applies to the `[regular]` view only.

---

## Part 1 — sim event stream (small, sim-side, do this first)

Sound and hit effects need transitions, not states. Add a per-tick event list
that the sim emits alongside its existing snapshot output.

- Define an `Event` enum in `crates/sim` covering at minimum: blow landed
  (attacker, target, energy, position, blade radius at contact), block,
  parry/deflection (with the shield-disturbance magnitude that already exists
  in the collision math), stagger, action phase transition (guard → windup →
  strike → recovery, per entity), action swap, footstep-scale movement events
  or a per-entity moving/stopped transition, death, spawn, projectile launch
  and impact, portal open, level descent.
- Events are plain POD structs of fixed-point/int fields, collected into a
  `Vec<Event>` cleared each tick, populated during `world.step()` at the exact
  sites where those transitions already happen. Reading world state to build
  an event is fine; writing world state from event code is forbidden.
- Extend the wasm ABI in `crates/web` to expose the event list each frame the
  same way snapshots are exposed (flat, POD, no serde).
- Add a sim test that runs a canned fight and asserts the event stream is
  identical across two runs of the same seed (determinism of events), and
  rerun the hash checks to prove state hashes did not move.

## Part 2 — segmented paper-doll rendering

Replace the `[regular]` view's current character drawing with layered
segmented bodies, posed from sim state every frame.

**Rig.** Define a small number of skeleton archetypes (humanoid is enough to
start; the Skitterer may need a low quadruped/insectoid variant — check how
current archetypes are drawn and decide). Each rig is an ordered list of
segments: e.g. shadow, legs, torso, off-arm (+shield), head, main-arm,
weapon. Each segment has an anchor point, a pivot, and a z-order. Rig
definitions live in a JS data file in `web/` — they are cosmetic and belong
render-side.

**Posing from sim truth.** Each frame, for each entity, compute the pose:

- Body faces the sim's facing angle; the facing wedge in tactical view is the
  ground truth to match.
- The main arm + weapon segment rotates to the sim's actual blade bearing.
  During windup, interpolate the arm from guard pose to cocked pose using the
  sim's phase progress (ticks elapsed / phase duration — expose phase progress
  in the snapshot if it isn't already there). During strike, the arm sweeps
  the committed line the sim is actually testing damage along. During
  recovery, the arm returns over the real recovery duration.
- The shield/off-arm poses from the guard bearing the sim holds.
- Legs: procedural walk cycle whose stride frequency derives from actual
  velocity magnitude; blend to idle when stopped. Lean the torso slightly
  into acceleration (the quarter-second momentum ramp is in the sim — read
  it, don't fake it).
- Stagger and recoil: displace/tilt the body using the sim's actual recoil
  numbers when the corresponding events arrive.
- Secondary motion (breathing idle, follow-through overshoot, cloth sway) is
  allowed as pure garnish: it may never move a segment enough to misrepresent
  reach, bearing, or phase. When in doubt, less.

**Art assets — you author the contract, not the images.** Images are produced
by a separate agent in separate sessions; your job is to make that possible
and safe:

- **Manifest**: `web/assets/manifest.json` maps each archetype × segment slot
  and each weapon/shield to a file, and records per image: anchor point (px),
  pivot (px), and world-unit scale. The renderer consumes only the manifest —
  no hardcoded filenames or offsets in JS. Missing entries or missing files
  fall back silently to procedural rendering.
- **`web/assets/ASSET_SPEC.md`**: author this document as the binding
  contract for the image-generation sessions. It must specify: the game's
  camera perspective (top-down) with a reference screenshot; the single
  global pixel-per-world-unit scale (pick it from the current renderer's zoom
  range so sprites draw near 1:1 at default zoom); transparent background and
  tight-crop requirements; the full segment list per archetype (shadow, legs,
  torso, head, main arm, off arm) with the pose each must be drawn in and
  where its pivot must sit; the weapon-sprite axis convention so the renderer
  can align art to the sim's blade line, with length matching the item's
  reach parameter at global scale; the Part 3 palette as hex values with the
  saturation rule; and the naming convention (`brute/torso.png`,
  `weapons/axe_heavy.png`). Everything an image session needs must be in this
  one file — assume its author has read nothing else.
- **Procedural fallback**: implement shaped-vector fallback drawing per
  segment slot — palette-colored, silhouette-correct, grim, not programmer
  rectangles. The game must look intentional and be fully playable with zero
  image files, and any future item gets an automatic look before its art
  exists.
- **Weapon-by-parameter**: weapon art (fallback and manifest lookup alike) is
  keyed by physical parameters where possible (reach → length, mass → visual
  heft), so new items resolve to plausible art by default; document the
  convention in ASSET_SPEC.md.
- Lazy-load images via the manifest with graceful per-file fallback. This is
  the first loading path `web/` has ever had — keep it under ~100 lines.

## Part 3 — Diablo 1 visual treatment

Target mood: the Cathedral levels of Diablo (1996) — oppressive darkness,
torchlight, desaturated stone, blood as the only saturated thing on screen.

- **Palette** (define once as named constants, use everywhere): near-black
  backgrounds `#0b0a08`; stone greys warmed slightly toward umber
  `#3a342c` / `#57503f`; bone `#c9bfa8` for highlights and UI text; deep
  blood red `#7a1010` with hot core `#c0392b` reserved for damage, blood, and
  health; a cold accent `#3d4f5c` for magic/portal only. Nothing else gets
  saturation.
- **Lighting**: a radial light field centered on the player character (and
  smaller glows on the portal and any projectiles), multiplied over the scene;
  darkness at the edges is near-total. Integrate with the existing fog
  rendering: never-seen stays black, remembered-but-unseen renders in a
  desaturated darker key with no dynamic light, in-sight gets the light
  field. The existing fade-out/dashed-outline behavior for occluded monsters
  is a gameplay feature — preserve its timings exactly, restyle it to fit
  (e.g. ember-like afterimage rather than dashes, if it stays equally
  readable).
- **Ground and walls**: restyle the flagstones and brick lip to the palette;
  add sparse grime/crack variation seeded from tile coordinates (render-side
  hash, not sim RNG). Keep the 4-unit scale grid available in all views.
- **Post pass**: strengthen the existing vignette; optionally a very subtle
  film-grain/dither in the darkness. No bloom, no chromatic aberration —
  1996 didn't have it and it reads as modern gloss.
- **Blood**: blow-landed events spawn render-side particles and persistent
  floor decals (bounded pool, oldest decals fade). Decal randomness comes
  from a render-side RNG, never the sim's.
- **UI/HUD**: restyle existing HUD elements (health, `left N`, hover
  readouts, the `?` help, Tab panel) to the palette — bone text on near-
  black, thin umber frames. Do not add new HUD elements; do not change what
  information is shown. If a display font is wanted, use a system serif
  stack or a single self-hosted open-license blackletter-adjacent face for
  headings only; body/readout text stays a legible sans/mono as it is now.
- **Performance**: the light field and post pass must hold 60fps with ~10
  entities on a mid laptop in Canvas2D. Implement the light/vignette as a
  cached offscreen canvas composited per frame, not per-pixel JS. If profiling
  shows Canvas2D cannot hold frame rate with layered segments + particles,
  say so and stop — WebGL2 batching is a separate decision, not part of this
  task.

## Part 4 — sound (fully synthesized, Web Audio API, no libraries, no files)

All audio is generated programmatically. This is a feature, not a fallback:
synthesis parameters derive from the sim's own physics, so the soundscape is
as honest as the renderer. Be ambitious here — this is procedural sound
design, not beeps.

- Build a small audio module in `web/`: unlock-on-first-gesture (browser
  autoplay policy), a master gain, a small effects bus (one shared
  convolution or feedback-delay reverb tuned to "stone room"), and an
  event-sound router consuming the Part 1 event stream.
- **Physics-driven synthesis**: every sound's parameters come from event
  data, not from constants. Blow landed → layered impact (filtered noise
  transient + low resonant body) where the event's kinetic energy drives
  loudness and brightness and the target's mass drives resonant pitch — a
  Brute being hit sounds heavier than a Skitterer because it is. Block/parry
  → metallic clank whose sharpness scales with the disturbance magnitude the
  collision math already computes. Stagger → low scrape/thud scaled by
  displacement. Death → heavier, longer variant of impact plus a body-fall.
  Windup start → short rising creak/whoosh (the audio telegraph — it must
  fire at windup start, same honesty as the visuals, and may scale with the
  weapon's mass). Footsteps → filtered thumps rate-matched to the walk cycle,
  weight from body mass. Projectile launch/impact, portal loop, descent
  stinger: same principle throughout.
- **Variation without samples**: randomize synthesis parameters per firing
  (render-side RNG) — small jitter on pitch, filter cutoff, envelope times —
  so repeated hits never machine-gun. Distance attenuation and L/R pan from
  event position relative to camera center.
- **Mood**: dark and dull, not arcade-bright. Favor low-passed noise, low
  sine/triangle bodies, short decays, the shared stone reverb at low mix. No
  chiptune squarewaves.
- Keep a single tuning table (one JS object mapping event type → base
  synthesis params) so the soundscape can be adjusted in one place. A `M`
  key or existing settings surface toggles mute; default volume modest.
- Audio must degrade to silence gracefully if the context fails — never block
  rendering or input.
- Audio must degrade to silence gracefully if the context fails — never block
  rendering or input.

## Part 5 — order of work and acceptance

Work in this order, committing at each milestone with the checks green:

1. Baseline: record current hashes, tests, and a `bench --carved` number.
2. Part 1 events + ABI + tests. **Gate: hashes unchanged, event determinism
   test passes.**
3. Rig + posing in `[regular]` view on procedural fallback segments (this
   proves pivots, z-order, and pose math with zero image variables). **Gate:
   a Brute's 33-tick windup is visibly readable and matches tactical view's
   wedge/reach truth side-by-side; all three `G` views intact.**
4. Asset contract: manifest schema, ASSET_SPEC.md (with reference screenshot
   and the fallback look as the style baseline), lazy-load path. Prove the
   pipeline by hand-making one trivial test PNG for one segment and loading
   it through the manifest. **Gate: game runs identically with the test
   image present, absent, or malformed; ASSET_SPEC.md is self-contained.**
   Image generation now proceeds in separate sessions against that spec and
   can land incrementally at any point after this milestone.
5. Diablo treatment: palette, light field, fog restyle, blood, HUD. **Gate:
   60fps with player + 6 monsters; fog timings unchanged.**
6. Synthesized audio. **Gate: sounds fire from events only; parameters
   audibly track physics (a Brute hit vs a Skitterer hit are distinguishable
   blind); mute works; no console errors on autoplay-restricted first
   load.**

Throughout: if any instruction here conflicts with what you find in
`DESIGN.md` or the code, stop and report the conflict rather than guessing —
the repo's determinism rules win over this brief.
