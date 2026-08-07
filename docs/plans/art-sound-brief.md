# Implementation brief: segmented art, animation, and sound for auto-rpg

You are working in the `auto-rpg` repository (github.com/alexoooo/auto-rpg): a
deterministic auto-battler with a fixed-point (16.16) simulation in
`crates/sim`, an agent boundary in `crates/policy`, a hand-rolled wasm ABI in
`crates/web`, and a vanilla no-build-step frontend in `web/`. Read `README.md`
and `DESIGN.md` in full before writing any code. Read the existing renderer in
`web/` and the snapshot ABI in `crates/web` before touching either.

Your task: give the game rich segmented (paper-doll) character art, procedural
animation, a dark Diablo-1-style visual treatment, WASD movement, and fully
synthesized event-driven sound — without violating any of the architectural
guarantees below.

**Current state you build on**: the `[regular]` view is already isometric —
the projection, extruded wall blocks, ground-projected telegraphs/paths, and
team-colored bodies with ground shadows exist and work. Read that projection
code first; every screen-space decision in this brief goes through it. The
tactical and dev views remain top-down and are the sim-truth reference.
`web/assets/CONCEPT.png` (if present) is the mood target: heavy grimy stone,
environmental torchlight, small figures in a big dark world — directional,
not one-to-one.

**Read the plan, not just this brief.** `art-00-overview.md` and the nine session files beside
it are written against the code as it actually stands, with line numbers, and they are what an
implementer works from. This file is the mandate — the *why*, the constraints, and the acceptance
bar. Those are the *what* and the *in what order*.

**Six things this brief assumes that the code contradicts.** They are listed in full, with line
numbers, in `art-00-overview.md`; an implementer who takes this brief at face value will rewrite
working code. In short: the sim **already has an event enum** and eleven kinds already cross the
ABI; **not every event belongs in the sim**, because `Sim::note_bodies` in `crates/web` already
derives one by differencing a per-entity table across ticks and it sees every tick where the page
does not; **torches are already sim furniture** with an additive light field and a flicker;
**the floor is already a baked procedural flagstone texture** whose pattern matrix carries the
projection; **the vignette and the player lantern already exist**, both cached; and **WASD is
already bound** — what is missing is the screen-to-world transform, which is the one thing
Part 2b is actually about.

What is genuinely absent, and is what the sessions are for: segmented bodies, any image file, any
loading path, blood, props, decals, and every byte of audio.

**Division of labor**: you implement everything except producing the PNG
image files themselves. Images are produced in separate sessions by a
different agent working from `codex-image-brief.md` against the asset
contract you author (the manifest schema and `web/assets/ASSET_SPEC.md`,
defined in Part 2). That agent delivers raw images only — **you own
integration**: measuring anchors/pivots, writing manifest entries, reviewing
the result in-game, and writing `web/assets/FEEDBACK.md` to direct its next
batch (defined in Part 2c). Your implementation must be complete and
playable before any image exists, via the procedural fallback rendering. All
sound is synthesized programmatically by you — there are no audio asset
files in this project.
 
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
   **Isometric corollary**: all sim-truth geometry — blade lines, telegraph
   arcs, reach and vision rings, paths — is always continuous and drawn by
   pushing world coordinates through the one shared camera projection
   (circles render as ellipses; never draw a screen-space circle for a world
   circle). Body *art* may quantize facing to 8 or 16 directions if the
   asset style requires it, but quantized art augments the continuous truth
   overlays and never replaces them, and the weapon/blade visual must track
   the true projected bearing continuously regardless of body facing.
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
## Part 2 — segmented paper-doll rendering (isometric)

Replace the `[regular]` view's current stylized bodies with layered segmented
figures, posed from sim state every frame and drawn through the existing
isometric projection.

**Rig.** Define a small number of skeleton archetypes (humanoid first; the
Skitterer may need a low quadruped/insectoid variant — check how current
archetypes are drawn and decide). Each rig is an ordered list of layers where
draw order is a *function of facing relative to the camera*: as the sim's
facing angle crosses the projection's axes, layers swap z-order (weapon
passes behind the body when the figure faces away). Figures are anchored at
the feet on the projected ground position; height extends up the screen. Rig
definitions live in a JS data file in `web/` — cosmetic, render-side.

**Layer economy — image art vs fallback.** The *image-art* rig is
deliberately coarse, because AI generation is unreliable for isolated body
parts and the articulation that must be exact is the weapon's: per facing, a
**composite body layer** (legs + torso + head as one image, with 2–3 stride
frames for the walk cycle plus an idle), and separately articulated
**arm+weapon** (and shield) layers that the renderer poses continuously.
This keeps the roster's image count tractable (tens, not hundreds) and
concentrates articulation exactly where the honesty rules bind. The
*procedural fallback* rig may remain fully segmented (shadow, legs, torso,
arms, head, weapon) since it's drawn, not generated. The manifest and rig
code must support both granularities per archetype.

**Posing from sim truth.**

- Body facing derives from the sim's facing angle mapped into the camera's
  frame. If the asset style uses quantized facings (constraint 3), pick the
  nearest facing for body artwork while all attachment points and the
  weapon still follow the continuous angle.
- The weapon layer aligns to the projection of the sim's actual blade line
  — endpoints in world space, projected, sprite stretched/rotated between
  them. During windup, interpolate arm+weapon from guard pose to cocked pose
  by the sim's phase progress (expose phase progress in the snapshot if it
  isn't already); during strike, sweep the committed line the sim is testing
  damage along; during recovery, return over the real recovery duration.
- The shield/off-arm poses from the guard bearing the sim holds, projected.
- Walk: stride-frame selection (or leg cycle, for the fallback rig) driven by
  actual velocity magnitude, blended to idle when stopped; lean the body into
  acceleration (the momentum ramp is in the sim — read it, don't fake it).
  Screen-vertical travel will look slower than horizontal under the
  projection; this is correct perspective — do not compensate.
- Stagger and recoil: displace/tilt using the sim's actual recoil numbers
  when events arrive.
- Secondary motion (breathing, follow-through, sway) is pure garnish and may
  never misrepresent reach, bearing, or phase. When in doubt, less.
## Part 2b — WASD movement input

Add WASD as a movement input alongside the existing mouse navigation, wired
into the takeover/driving system's Movement channel:

- WASD is a **screen-space intent**: W means "up the screen." Compose the
  pressed keys into a screen vector, transform it into a world-space
  direction through the *inverse* of the camera projection, and normalize
  (diagonals must not be faster; world speed stays uniform regardless of
  screen direction).
- The action submitted through the ABI — and therefore recorded in replays —
  is the **world-space movement intent**, never raw keys or screen vectors.
  Replays must be camera-independent; the sim never learns a camera exists.
- WASD (movement) + mouse (aim) must work simultaneously as twin-stick
  control when both channels are player-held. Keybind conflicts with
  existing single-key bindings must be resolved in favor of documented,
  non-surprising behavior — check the current key map first and report any
  collision rather than silently rebinding.
  **Art assets — you author the contract, not the images.** Images are produced
  by a separate agent in separate sessions; your job is to make that possible
  and safe:

- **Manifest**: `web/assets/manifest.json` maps each archetype × layer ×
  facing (and stride frame) and each weapon/shield to a file, and records
  per image: anchor point (px), pivot (px), and world-unit scale. The
  renderer consumes only the manifest — no hardcoded filenames or offsets in
  JS. Missing entries or missing files fall back silently to procedural
  rendering.
- **`web/assets/ASSET_SPEC.md`**: author this document as the binding
  contract for the image-generation sessions. It must specify: the game's
  isometric camera (exact projection ratios/angles taken from the projection
  code, with a reference screenshot); the committed art style — **painted,
  matching `CONCEPT.png`**: grimy hand-placed-stone feel, one stated global
  light direction, consistent detail density across all assets (soft
  painterly edges are fine; style consistency, not a texel grid, is the
  contract); the single global pixel-per-world-unit scale (from the current
  default zoom so sprites draw near 1:1); transparent background and
  tight-crop requirements; for characters: the facing count (8 unless the
  rig argues otherwise — you decide and the spec states it as law), the
  composite-body-plus-arm/weapon layer convention from Part 2 with the pose
  and stride frames each facing must be drawn in and where pivots sit, and
  each archetype's body size at global scale; the weapon-sprite axis
  convention (drawn along a stated axis at stated length-per-reach so the
  renderer can stretch it along the projected blade line); for the
  environment: floor tile top-face textures with N variants, wall/pillar
  side-face and top-face textures matching the existing block extrusion
  geometry, grime/moss/crack overlay decals, cosmetic props (barrels,
  crates, rubble), and torch/lantern sprites with 2–3 flicker frames; the
  Part 3 palette as hex values with the saturation rule; and the naming
  convention (`brute/body_e_walk1.png`, `env/floor_a.png`,
  `weapons/axe_heavy.png`). Everything an image session needs must be in
  this one file — assume its author has read nothing else.
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
## Part 2c — image integration and review (recurring)

The image agent delivers raw PNGs under `web/assets/` and nothing else — no
manifest edits, no code. Each time a batch lands, you run an integration
pass:

- **Integrate**: for each new image, measure anchor, pivot, and scale from
  the actual pixels (script this — a small node tool that reads each PNG and
  proposes anchor/pivot per the spec's conventions beats eyeballing) and
  write the manifest entries. Only you edit `manifest.json`; never point an
  entry at a file that doesn't exist.
- **Review in-game**: load the `[regular]` view and check the batch where it
  matters — pivots don't wobble through the walk cycle, facing changes, or
  blade swing; z-order reads at all facings; scale sits right against the
  fallback bodies and the 4-unit grid; floor/wall pieces meet the block
  extrusion with no seams; textures stay quiet under figures and telegraphs;
  palette holds.
- **Write `web/assets/FEEDBACK.md`**: the sole channel back to the image
  agent, read at the start of every image session. For each asset: passed
  (locked — not to be regenerated) or regenerate, with the specific defect
  and a screenshot reference where useful. Keep it cumulative and current.
- **Calibration gates, in order**: the first image batch is **environment +
  weapons** (one floor variant, one wall side/top pair, one torch, 2–3
  weapons) — the categories AI generation handles reliably — and it
  calibrates style, scale, and geometry fit. The second batch is **one
  archetype's character set** (composite body in all facings + stride
  frames, plus its arm/weapon layers), which calibrates the harder
  character pipeline against the already-locked style. Do not mark either
  calibration passed in FEEDBACK.md until it survives the full in-game
  review — mass production reuses whatever passed calibration, so a defect
  that slips through multiplies across the whole asset set.
- If review shows the defect lives in your spec rather than the images
  (ambiguous pose description, wrong tile geometry), fix ASSET_SPEC.md, note
  the change in FEEDBACK.md, and treat previously passed assets touched by
  the change as suspect.
## Part 3 — Diablo 1 visual treatment

Target mood: the Cathedral levels of Diablo (1996) — oppressive darkness,
torchlight, desaturated stone, blood as the only saturated thing on screen.

- **Palette** (define once as named constants, use everywhere): near-black
  backgrounds `#0b0a08`; stone greys warmed slightly toward umber
  `#3a342c` / `#57503f`; bone `#c9bfa8` for highlights and UI text; deep
  blood red `#7a1010` with hot core `#c0392b` reserved for damage, blood, and
  health; a cold accent `#3d4f5c` for magic/portal only. Nothing else gets
  saturation.
- **Lighting**: layered light fields multiplied over the scene — a radial
  light on the player character, plus **environmental torches/lanterns**
  placed render-side on wall faces (positions seeded deterministically from
  tile coordinates via a render-side hash, so a floor always lights the same
  way without touching sim RNG), plus small glows on the portal and
  projectiles. Torch light flickers subtly. Darkness away from all lights is
  near-total. **Fog keeps authority**: lights are cosmetic within what the
  character can see — never-seen stays black, remembered-but-unseen renders
  in a desaturated darker key with no dynamic light, and a lit torch must
  never reveal entities or geometry the character's vision hasn't. The
  existing fade-out/dashed-outline behavior for occluded monsters is a
  gameplay feature — preserve its timings exactly, restyle it to fit (e.g.
  ember-like afterimage) only if equally readable.
- **Ground and walls**: surfaces draw from manifest textures (floor top
  faces, wall side/top faces) with the procedural palette fill as fallback;
  variation and grime/moss decals are seeded from tile coordinates
  (render-side hash, never sim RNG). Keep the 4-unit scale grid available.
- **Props**: cosmetic barrels/crates/rubble placed render-side, seeded from
  tile coordinates. **Honesty rule**: the sim has no prop colliders, so
  props may only be placed on non-walkable cells or flush against wall
  bases — never on open floor where they'd imply collision that doesn't
  exist. Density low; the concept's emptiness is part of the mood.
- **Team identity**: keep the existing ground rings/shadows under figures as
  the friend/foe read (concept shows the same device); ring color is the one
  saturation exception besides blood and must stay subordinate to the mood
  (thin, dim, brightening only on hover/selection).
- **Post pass**: strengthen the existing vignette; optionally a very subtle
  film-grain/dither in the darkness. No bloom, no chromatic aberration —
  1996 didn't have it and it reads as modern gloss.
- **Blood**: blow-landed events spawn render-side particles and persistent
  floor decals (bounded pool, oldest decals fade). Decal randomness comes
  from a render-side RNG, never the sim's.
- **UI/HUD**: restyle existing HUD elements to the palette — bone text on
  near-black, thin umber/iron frames, in the spirit of the concept's framed
  panels (vitals bottom-left, action slots with keybinds, status/log line,
  pause/speed controls). You may *reorganize* existing elements toward that
  layout, but do not add new information and do not remove any existing
  readout or keybind affordance; every current element must remain
  discoverable. If a display font is wanted, use a system serif stack or a
  single self-hosted open-license face for headings only; body/readout text
  stays a legible sans/mono as it is now.
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
## Part 5 — order of work and acceptance

Baseline first: record the current hashes, the test counts and a `bench --carved` number, and
compare against **what you recorded** rather than against any number written in a document —
these documents go stale and one of them already has.

Then work in this order, committing at each session with the checks green. Each session file
carries its own gate and its own explicit non-goals:

| # | session | part | gate |
|---|---|---|---|
| 1 | `art-01-palette` | Part 3 (palette, post, HUD) | the canvas in `[tactical]`/`[dev]` is byte-identical; the room reads as the concept's material |
| 2 | `art-02-controls` | Part 2b | W moves up the screen at every zoom; diagonal speed equals cardinal in world units; twin-stick works; what crosses the wall is still a world vector |
| 3 | `art-03-events` | Part 1 | **all five hashes unchanged**; event determinism test passes; nothing on screen changes |
| 4 | `art-04-display-list` | — (structural) | **all three views byte-identical**, by `toDataURL` diff, at each of its three commits; no per-frame `ctx` call outside `web/draw.js`; no frame-rate movement |
| 5 | `art-05-rig` | Part 2 | a Brute's 33-tick windup is visibly readable and visibly 33 ticks; the drawn weapon lies on the projected true blade line while `[tactical]` shows the same moment top-down; z-order is correct at all 8 facings; all three `G` views intact |
| 6 | `art-06-assets` | Part 2 (contract), Part 2c | the game runs identically with test images present, absent, renamed, truncated or missing; `ASSET_SPEC.md` is self-contained; three fixtures prove the three transforms |
| 7 | `art-07-world` | Part 3 (light, texture, props), Part 2c | 60fps with the player, six monsters and ~8 torch lights; fog timings unchanged; no prop where a body can stand; **gate 1 written and flipped** |
| 8 | `art-08-actors` | Part 2c | the sprite Fighter stands, walks, swings and takes its health bar on its head beside fallback bodies; `?noart=1` reverts it and nothing else; **gate 2 written and flipped** |
| 9 | `art-09-blood` | Part 3 (blood) | blood is the only saturated thing on screen; a replayed fight bleeds the same way |
| 10 | `art-10-audio` | Part 4 | sounds fire from events only; a Brute hit and a Skitterer hit are distinguishable blind; mute works; no console error on an autoplay-restricted first load |
| 11 | `art-11-voices` | Part 4 | the audio telegraph lasts exactly as long as the windup and stops when the windup is interrupted |

**The order is not the one an earlier draft of this brief gave, and the change is deliberate.**
The treatment went sixth, after the assets; the *palette* half of it goes first, because every
art judgement from the rig onward is a judgement made against a background, and reviewing a warm
umber sprite against a cold blue floor produces feedback about the sprite that is really feedback
about the floor. It costs one session and risks nothing. WASD goes second because reviewing eight
facings requires driving the body around, and that control is currently broken under iso.
`art-03` is third and **must land alone**: it is the only session that touches Rust and the only
place a determinism failure can enter.

**Two sessions are additions to this brief rather than parts of it, and `art-00` argues both.**
`art-04` splits the renderer into an extract pass that emits a flat draw list and a backend that
consumes it, and it goes fourth — before the rig — because the rig, the world session and the
blood session are the renderer's three big new emitters and writing them against `ctx` is what
would make a later backend swap a rewrite instead of a file. `art-08` owns the integration and
review of Codex's character-and-weapon batch, because that batch has to land somewhere and the
rig session closes long before it arrives.

**Part 2c is not "recurring work alongside the remaining sessions" any more.** The two calibration
batches each get a named session that receives them — `art-07` holds gate 1, `art-08` holds
gate 2 — so no batch is ever in flight without somewhere to land, and only the *production*
batches after gate 2 are integrated by recurring passes. `art-00`'s interleave table is the
schedule. The gates are still yours to hold.

One correction to Part 2c's own text while you are there: the weapons move from the first batch to
the second. A weapon is two marker pixels and a drawing stretched between them, so it has nothing
reviewable about it until a body is swinging it; `art-06` proves the transform with a fixture
instead, and `art-08` reviews the real ones in a hand.

Throughout: if any instruction here conflicts with what you find in `DESIGN.md` or the code, stop
and report the conflict rather than guessing — the repo's determinism rules win over this brief,
and this brief has already been wrong about the code six times.
