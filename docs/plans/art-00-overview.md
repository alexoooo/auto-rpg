# Real art, real light, real sound — overview

**Not a session.** The map, the decisions, the corrections to the brief, and the facts every
session depends on. Sessions are `art-01` … `art-11`, each independently landable and each
leaving the game playable.

Read `art-sound-brief.md` for the mandate. This file is the plan.

---

## What this is

The `[regular]` view is already isometric and already draws a lit stone room. It becomes the
room in the concept art: umber stone in near-total darkness, torchlight the only light, bodies
built out of parts that move because the sim moved them, blood the only saturated thing on
screen, and a soundscape synthesised from the sim's own physics.

`[tactical]` and `[dev]` stay exactly what they are. They are the A/B control for this project
the same way they were the A/B control for the isometric conversion, and they are worth more
than any line saved by tidying them toward the art arm.

## The brief was written against assumptions, and six of them are wrong

This is the most valuable thing in this file. The brief describes work that is partly already
done, and an implementer who takes it at face value will rewrite working code.

| The brief assumes | The code says |
|---|---|
| The sim has no event mechanism; Part 1 must build one. | `crates/sim/src/event.rs` **exists**: `Damage`, `Death`, `Block`, `Parry`, `Loose`. `World::step` returns `&[Event]`. Four kinds already cross the ABI (`EVENT_DAMAGE`, `EVENT_BLOCK`, `EVENT_PARRY`, `EVENT_DECLARE`) at `EVENT_STRIDE = 5`, `MAX_EVENTS = 32`. |
| Every event must be emitted inside `world.step()`. | `Sim::note_declares` (`crates/web/src/lib.rs:1592`) **derives** an event by differencing a per-entity phase table across ticks, in `crates/web`, touching `crates/sim` not at all. It exists precisely because a 5-tick windup can begin and end between two `requestAnimationFrame` callbacks, so the page cannot difference frames and the module can. **Most of Part 1's list belongs there, not in the sim.** |
| Environmental torches must be placed render-side, seeded from tile coordinates. | Torches are **sim furniture**, generated with the dungeon and published through `furniture_ptr`. `readFurniture` (`main.js:762`) reads them; `drawTorchLight` (`main.js:6355`) draws an additive light per torch with a per-torch flicker phase. There is nothing to seed and nothing to invent. |
| The floor is a flat palette fill awaiting textures. | The floor is a **baked procedural flagstone tile** repeated through a `CanvasPattern` whose matrix carries the projection (`bakeFloorTile:4911`, `floorPatternNow:4998`). Eight courses of four stones with grain, mortar, a lit lip and a shadowed one, rebaked only when the zoom bucket moves. |
| A vignette and a player light must be added. | `arenaVignette` (`main.js:5807`) and `drawLantern` (`main.js:6438`) both exist, both cached, both keyed to the room rather than the camera. |
| WASD must be added (Part 2b). | WASD is **bound already** (`bindInput`, `main.js:3651`), gated on `CONTROL_FEET`, composed and normalised in `pushInput` (`main.js:3421`). What is missing is the one thing Part 2b is actually about: the screen-to-world transform. See `art-02`. |

What is genuinely absent, and is therefore what these sessions are for: segmented bodies, any
image file at all, any loading path at all, blood, props, decals, and every single byte of audio.

## Style direction — read the concept art, not the adjectives

`web/assets/CONCEPT.png` is the third image in the conversation and is the target. What it
actually commits us to, item by item, because "Diablo 1 mood" is not a specification:

> **This section is the most perishable thing in the plan and `art-01` §7 is what saves it.**
> `AGENTS.md` §Plans deletes the whole `art-*` set in the commit that finishes the topic, so
> everything below evaporates on the last day of the series unless it is written down somewhere
> durable first. `art-01` writes it into `DESIGN.md` as an "Art direction" section — in `art-01`,
> while the concept is open and the decisions are being made, rather than at the end as an act of
> recall. `DESIGN.md` is not created by this series; it already exists as the repository's record
> of why the rules are what they are, and the art has been the one thing missing from it.

- **The room is brown-black, not blue-black.** Today's palette is cold — `--bg: #090b10`,
  `WALL_TOP: #161c28`, flagstones at `rgb(20,24,36)`–`rgb(30,34,46)` where *blue is the channel
  carrying the contrast* (`main.js:5845` says so explicitly). The concept has no blue anywhere
  except the hero's own ring. Every one of those constants moves. `art-01`.
- **The stone is hand-placed and irregular.** Big flags on the floor, coursed blocks on the wall
  faces, moss and dirt in the seams, a crack here and there. Not a repeating swatch — the
  concept's floor has visibly different stones in different places.
- **Figures are small, dark and rim-lit.** A body is a silhouette with a warm edge where the
  torch is and near-black everywhere else. Detail is in the silhouette, not in the interior.
  This is what makes the procedural fallback rig viable as a shipping look: the concept's
  figures are barely more than a good silhouette.
- **Light comes from things.** Two torches and a lantern in the concept, each with a visible
  fixture, a pool on the floor, and warm bounce up the wall behind it. Everything more than a
  few units from a light is *gone*, not dim.
- **The only saturated things are the flame, the blood and the two team rings.** The rings in
  the concept are thin, dim, and sit under the feet — exactly the device the game already has.
- **The HUD is framed, not floating.** Bone text on near-black behind thin warm-iron frames.
  The concept's bottom-left panel is the reference for the vitals cluster.

**Two decisions were taken with the user and are settled:**

| | |
|---|---|
| **Art style** | **Painted, matching the concept.** Not pixel art. The images are drawn at the game's own pixels-per-world-unit and composited with `imageSmoothingEnabled` left on, soft alpha edges, no black outline. This reverses the brief's "chunky pixel-art at a stated texel density" clause, on two arguments: the concept is painted, and a diffusion model asked for pixel art produces anti-aliased fake pixel art that fails its own texel-density check on inspection. The cost is real and is stated as law in `ASSET_SPEC.md`: art is authored for the default framing and is soft at the top of the zoom range. |
| **Codex's calibration** | **Two gates, split by what the renderer does with the asset.** Stage 1 is the room — one floor top face, one wall side/top pair, one torch: everything the renderer shears onto a surface or plants on a ground point. It locks style, scale, palette and geometry fit. Stage 2 is everything that hangs off a body — one archetype's composite body, arm and shield, **and the first two or three weapons**. **The procedural rig from `art-05` is the shipping look until stage 2 passes.** `codex-image-brief.md` has both gates; `art-07` holds the first and `art-08` holds the second, and **each gate is held by exactly one session** so that no batch lands with nowhere to be reviewed. |
| **Character layer economy** | **Coarse for images, fine for the fallback.** The image rig is a **composite body** per facing (legs + torso + head as one drawing, with 2–3 stride frames and an idle) plus separately articulated **arm+weapon** and **shield** layers. The procedural fallback rig stays fully segmented, because it is drawn rather than generated. `art-05`'s rig code and `art-06`'s manifest must support both granularities per archetype. The reason is stated in the brief and is worth repeating: generation is unreliable for an isolated "far leg of a Brute facing south-east", reliable for a whole figure, and **the articulation that must be exact is the weapon's** — which is procedural in both rigs and never a sprite frame. |

## Decisions taken — settled, do not revisit

| | |
|---|---|
| **Projection** | Unchanged. `PROJ_ISO`, 2:1, `K = scale`. Nothing in these sessions touches `projX`/`projY`/`lift`/`groundSpace`'s coefficients. |
| **Renderer** | Canvas2D, behind a seam. `art-04` splits the renderer into an **extract** pass that emits a flat draw list and a **backend** that consumes it, and after it lands **no per-frame `ctx` call lives outside `web/draw.js`.** Canvas2D is the only backend written in this series — WebGL2 is not in scope, `art-04` §8 says why writing one now would be premature, and `art-07` §6 says when to stop and report rather than reach for it. What the seam buys is that a second backend later is a file rather than a rewrite threaded through everything that knows what a unit is. |
| **Scope of the treatment** | Canvas art is `[regular]`-only, gated on `artOn()`. The HUD/CSS restyle is **global**, because there is one DOM and three view modes share it; `art-01` argues that. |
| **No build step** | Plain classic scripts. `web/main.js` is loaded by `<script src="main.js">` with no `type="module"` and contains no `import`/`export`. New JS files are additional classic `<script>` tags placed **before** `main.js`; top-level `const` in a classic script lands in the global lexical scope and is visible to scripts loaded after it. No bundler, no npm, no external library. |
| **Assets are data** | PNGs under `web/assets/` and one `manifest.json` are expected and fine. `tools/serve.js` already serves `.png` and `.json` with correct MIME types (`tools/serve.js:34-45`) — nothing to add there. |
| **Sim changes** | Exactly two, both in `art-03`, both proven inert: one read-only field on `UnitView`, one new `Event` variant. Everything else is derived in `crates/web`. |
| **Audio** | Fully synthesised, Web Audio, no files, no libraries. Two sessions. |

---

## The six load-bearing facts

### 1. The goldens cannot move, and the frame layout is not one of them

The five tripwires are below. Two of the things these sessions *do* look like they should move a
golden and provably cannot:

- **Widening the frame is not a hash change.** `tools/wasm_check.js` holds `UNIT_STRIDE`,
  `SHOT_STRIDE`, `EVENT_STRIDE`, `HEADER_LEN` and `FRAME_LAYOUT_VERSION` as **its own mirrored
  constants** (`tools/wasm_check.js:74`, `363-373`) and asserts the module agrees with it. So a
  wider row is an edit to that file — a deliberate, visible, one-line-each edit — and not a hash
  moving. The five hashes are `World::state_hash` and `selftest_hash`; the frame buffer is not
  hashed by anything.
- **Events are not state.** `World::events` is cleared at the top of every `step` and read
  write-only afterwards. `state_hash` walks positions, velocities, health and the rest
  (`world.rs:2475`); it does not walk the event list, and `crates/sim/tests/determinism.rs`
  would say so if it did. A new `Event` variant cannot reach a hash.

**Do not quote a hash from memory or from an old plan.** `iso-00-overview.md` states that
`lab hash` prints `0x00b48ceb21081d1d`; the current value in `tools/wasm_check.js` is
`0xfe31370e141ef531`, because gameplay landed in between. That document was not wrong when it
was written and is wrong now, which is exactly why **every session records its own baseline
before it starts** and compares against that.

### 2. `PROJ.upright` is the bit, and `artOn()` never stands in for it

`iso-00` §3, still the single easiest mistake in this codebase, and these sessions add far more
opportunities to make it than the conversion did. Everything new that lies on the floor goes
through `groundSpace`; everything new that stands up goes through `projX`/`projY`/`lift` and
joins the depth walk. Nothing infers the projection from whether art is on.

`groundSpace`'s doc comment (`main.js:4522-4538`) carries **a register of its fourteen call
sites** and says a fifteenth belongs in it on the way in. `art-05`, `art-07` and `art-09` each
add call sites. Update the register in the same commit; that comment is the thing to grep when
the question is what the shear touches, and a register that has silently gone stale is worse
than no register.

### 3. Strokes are the scarce resource; fills, sprites and text are free

From `DESIGN.md`, "Performance notes", measured by removing work on the machine that was slow:

| | fps |
|---|---|
| baseline, 8 bodies | 11.2 |
| `stroke()` no-op | **54.4** |
| every drawing primitive no-op | 49.9 |
| game loop stopped entirely | 59.5 |

Killing `stroke` alone recovered as much as killing all drawing. Fills, `fillRect`, `drawImage`,
sprites and text were collectively free. A long dashed stroke is catastrophic and superlinear —
five times the marks cost 8.9× the time.

**This is the most favourable measurement any art project could ask for and it points the whole
plan.** Sprite blits, particle fills, decal fills, a cached light field and a cached grain layer
are the cheap direction. What is *not* cheap, and what every session must therefore avoid
inventing: a new dashed pattern whose mark count scales with zoom or radius. `MAX_DASH_SEGMENTS`
is 96 and `arcDash`/`pathDash` (`main.js:7074`, `7099`) exist to cap one; any new dash goes
through them or does not ship.

The corollary that catches people: **`ctx.shadowBlur` is not a fill.** It is a per-pixel blur
pass and it is banned outright in these sessions. Soft light comes from cached radial gradients
composited with `lighter`, which is what `drawTorchLight` already does.

### 4. A sprite is a fill, but a *layer* is a draw call, and the fallback has more of them than the art

`drawCharacter` is 0.04× the screen in fill area at 41 bodies — four hundredths — so the pixels
are not the question. The question is call count.

The two granularities land on opposite sides of it, which is worth knowing before profiling
either: the **image** rig is four layers (body, arm, weapon, shield) plus the ground pre-pass, so
it is *cheaper* than today's body; the **fallback** rig is seven fills plus the pre-pass, so at
`MAX_UNITS` it is ~960 calls a frame against ~500 today. The measurement above says that is
affordable and does not say it is free, so `art-05` carries a count-and-measure gate rather than
an assurance — **and it must be measured on the fallback**, which is the expensive arm and the
one that ships first.

### 5. Most events belong in `crates/web`, because `Sim::advance` sees every tick and the page does not

`Sim::advance` (`crates/web/src/lib.rs:1323`) runs `for _ in 0..frames` with up to eight ticks
of catch-up per animation frame, and already differences three things across each tick: the
hero handle, the dungeon fingerprint, and — in `note_declares` — a per-entity `Swing` table. A
phase transition, a footfall, a weapon swap, a portal opening and a descent are all differences
of things already visible there. **None of them is a reason to touch `crates/sim`.**

What genuinely cannot be derived: the magnitude of an involuntary shove, because a velocity
delta mixes the blow's impulse with the body's own traction-limited acceleration and telling
them apart from outside would be a heuristic. That gets one new `Event` variant, and the walk
cycle gets one new `UnitView` field. Two changes, both inert, both in `art-03`, and no others.

### 6. The fog keeps authority over every light and every sprite

`canSee` (`main.js:3255`) and the `visible` column are the sim's answer about what the player
can see, and the whole lighting model is cosmetic *within* it. Never-seen stays black.
Remembered-but-unseen draws at `SEEN_ALPHA = 0.4` with no dynamic light. A torch may not reveal
a body the character's vision has not. The ghost fade (`GHOST_FADE_MS = 400`,
`GHOST_HOLD_MS = 2000`, `ghostOf:8436`) is a gameplay feature: **its timings do not move**, and
restyling it is allowed only if the restyle is equally readable.

---

## Layer diagram, after `art-09`

New rows marked `+`. Everything unmarked is where it is today and stays there.

```
GROUND LAYER            (no depth; painter order)
  floor passes            clip diamonds -> texture -> vignette -> grid
+                         -> tile-seeded decals (grime, moss, cracks)
+ blood decals            bounded pool, oldest fades, baked to one offscreen layer
  remembered walls        unbanded, both faces
  lantern                 last, after the rock
  portal, trail, route, destination/lock
  vision discs
  reach rings
DEPTH LAYER             (merge walk)
+ props                   barrels/crates/rubble, depth-sorted with everything else
  lit wall bands   x   { corpses, monsters, hero, shots }
+                        each body is now a segment list, not one path
+ blood particles         depth-sorted by their own ground point
OVERLAY LAYER           (screen space)
  hero outline pass
  health bars, floaters, callouts
+ grain / dither          one cached tile, composited over the lot
```

Two placements are load-bearing and are the ones an implementer will get wrong:

- **Props join the depth walk; they do not go on the ground layer.** A barrel is a standing
  object that must occlude and be occluded like a body. Putting it on the ground layer paints it
  under every wall.
- **Grain goes over everything including the HUD-facing overlay, and is one composited tile.**
  Per-pixel JS noise is the one thing in this project that would genuinely cost a frame.

**After `art-04` every row here is *emitted*, not drawn.** The three layer names become the `layer`
field on a draw item; order within the ground and overlay layers is order of emission, and order
within the depth layer is the merge key it already uses. Nothing about the diagram changes — what
changes is that one function paints all of it.

---

## Session order and what each leaves

| session | leaves the game | touches Rust |
|---|---|---|
| `art-01-palette` | the same game, in the concept's colours. Nothing structural. | no |
| `art-02-controls` | W moves up the screen. A gameplay bug fixed. | no |
| `art-03-events` | identical on screen; the frame carries everything sound and reactions will need. | **yes, and only here** |
| `art-04-display-list` | byte-identical in all three views; the renderer has a seam through it. | no |
| `art-05-rig` | bodies made of parts that walk, wind up, swing and lean. Zero image files. | no |
| `art-06-assets` | a manifest, a loader, a spec, a measuring tool, and three fixtures proving the path. | no |
| `art-07-world` | the room in the concept's stone, with props and decals. | no |
| `art-08-actors` | one archetype in real art, holding real weapons, beside fallback bodies. | no |
| `art-09-blood` | blows land visibly: recoil, spray, floor decals, death. | no |
| `art-10-audio` | the room has weight and impacts have physics. | no |
| `art-11-voices` | the full soundscape. | no |

**`art-01` and `art-02` are deliberately first and deliberately trivial.** The brief puts the
Diablo treatment sixth, after the assets. That is the wrong order here for a reason that is
specific to this project rather than a matter of taste: **every art judgement in `art-05`
through `art-09` is a judgement made against a background**, and reviewing a warm umber sprite
against today's cold blue floor will produce feedback about the sprite that is really feedback
about the floor. The palette costs one session, risks nothing, and makes every later review
mean something. `art-02` is first because reviewing eight facings of a body requires driving it
around, and the control for doing that is currently broken under iso.

**`art-03` is the only session that touches Rust and it must land alone**, on the same argument
`iso-01` had to: it is the one place a determinism failure can enter, its acceptance test is
that nothing on screen changes, and a bug in it found later would be found while three other
things are also new.

**`art-04` is the other inert session and it goes before the rig, not after it.** It is cheap
insurance bought at the one moment it is cheap: the renderer's new emitters are all still
unwritten. `art-05` adds seven layers per body, `art-07` adds patterns, props and decals,
`art-09` adds two particle pools — write those against `ctx` and the seam becomes a rewrite
threaded through every function that knows what a unit is, which is the thing the seam exists to
prevent. Land it first and each of those sessions simply emits. Its gate is that all three views
are byte-identical, which is checkable rather than eyeballed, and its return is collected whether
or not a second backend is ever written: see `art-04` §5.

---

## How Claude and Codex interleave

Nothing here runs in parallel by accident. **Each Codex batch is unblocked by the session
immediately before it and consumed by the session immediately after it**, so no batch is ever in
flight without a named session waiting to receive it, and no session is ever waiting on art.

| # | who | what | unblocked by |
|---|---|---|---|
| 1 | Claude | `art-01` … `art-06` | — |
| 2 | Codex | **batch 1 — the room.** One floor top face, one wall side/top pair, one torch | `art-06` ships `ASSET_SPEC.md` |
| 3 | Claude | **`art-07-world`** — integrate, review in-game, hold gate 1 | batch 1 lands |
| 4 | Codex | **batch 2 — the body.** One archetype's composite body, arm and shield; 2–3 weapons | gate 1 passes |
| 5 | Claude | **`art-08-actors`** — integrate, review in-game, hold gate 2 | batch 2 lands |
| 6 | Codex | **production.** The rest of the roster, all weapons and shields, remaining floor/wall variants, decals, props, lantern frames | gate 2 passes |
| 7 | Claude | `art-09` … `art-11`, with a recurring integration pass whenever a production batch lands | — |

Three properties make that safe rather than merely tidy:

- **Claude never waits on art.** Every session leaves the game complete with zero image files.
  `art-05`'s procedural rig is the shipping look until gate 2 passes; `art-07`'s procedural bake
  stays underneath the manifest; and a missing key, a missing file, a failed decode and an
  unparseable manifest all resolve to the same fallback with at most one console warning. If Codex
  delivers nothing at all, the series still finishes and the game is still intentional.
- **Codex never waits on code after step 2.** It reads two documents and writes PNGs. It does not
  run the game, does not need to know what changed in `web/`, and is never blocked on a session
  landing except at the two gates, which are exactly the two places blocking is the point.
- **The channel is one-way in each direction and the two directions share no file.** Claude → Codex
  is `ASSET_SPEC.md` (binding, self-contained) and `FEEDBACK.md` (cumulative, two verdicts).
  Codex → Claude is PNGs at spec-conformant paths plus a short report. **Codex never edits
  `manifest.json`, any code, or the spec** — an agent that can write the manifest is an agent that
  can point an entry at a file that does not exist, which is `art-06` §3's argument for the
  measuring tool printing fragments rather than writing them.

**Why the gates split where they do.** The brief puts 2–3 weapons in batch 1, on the reasonable
ground that weapons are what generation handles most reliably. They move to batch 2 here because
the gates are split by **what the renderer does with the asset**, not by what is easy to draw: a
weapon is two marker pixels and a drawing stretched between them, and the renderer puts those
markers on the projected hilt and tip of the sim's own blade segment. Until a body is holding it
and swinging it, a weapon sprite has no reviewable property at all — so reviewing one in batch 1
would mean reviewing it against nothing, and `art-07` would be holding half a gate it has no
instrument for. `art-06` §6 proves the weapon transform with a deliberately fake fixture instead,
which is cheaper and unambiguous. The result is the property that matters: **one gate, one
holding session, no orphaned batch.**

---

## Tripwires — run at the end of every session, all five

```
cargo test --workspace
cargo run --release -p lab -- hash
cargo run --release -p lab -- verify --seeds 200
node --test tools/wasm_check.js
node --check web/main.js          # and every new .js file in web/
```

**Record the baseline before the first commit of each session** — the hash, the test count, the
`wasm_check` test count — and compare against what you recorded, not against a number written in
a document. `art-01`, `art-02` and `art-04` through `art-11` touch no Rust at all, so for those
the first four are a formality that costs two minutes and catches the one thing nobody expects:
a stray edit.

`art-03` is the session where these matter. Its own gate is stricter and is stated there.

**From `art-04` onward there is a sixth, and it is a house rule rather than a formality:**

```
grep -n 'ctx\.' web/*.js     # hits web/draw.js and the named bakes, nothing else
```

A new per-frame `ctx` call site outside `web/draw.js` is a review failure, not a style note — it
is one more place a second backend would have to be threaded through, which is the entire cost
`art-04` was paid to remove. The bakes are exempt and are whitelisted by name in `draw.js`'s doc
comment, because what they produce is a paint source rather than a drawing.

There is one more, and it is the cheapest bug-finder on the page:

```
open the game, check the console for assertion failures
```

`assertProjection` (`main.js:10696`) runs at boot and asserts the projection round-trips, that
`shear === upright` across the whole table, and that `UPRIGHTS` was authored against the live
`ex`. `art-05` replaces `UPRIGHTS`; the third assertion is about the rig now and must be updated
to keep saying something true rather than deleted.

---

## Housekeeping

- Line numbers throughout these documents are from `web/main.js` at **10,958 lines** and
  `crates/web/src/lib.rs` at **7,363 lines**, and will drift as sessions land. Where a number
  and a quoted snippet disagree, trust the snippet.
- Code comments reference `world-01` and `world-07`. Those are a session series whose plan files
  were never committed — the work landed in `bdf1f75 gameplay improvements`. This series is
  `art-*` and does not collide with it.
- `web/assets/` does not exist yet. `art-06` creates it. Until then no session may reference a
  file inside it except `CONCEPT.png`, which should be committed at the start of `art-01` so the
  palette work has its target in the repository rather than in a chat log. `CONCEPT.png` is
  permanent, is not an asset, and is never regenerated — `FEEDBACK.md` says so.
- **`DESIGN.md` already exists and this series mostly reads it.** Twenty-odd citations, all
  read-only: the performance measurements, the profiling method, "damage is kinetic energy", the
  open questions. Four sessions write to it, and the shape is deliberate — **`art-01` §7 creates
  the "Art direction" section** from the concept, while the concept is open; then `art-07`,
  `art-09` and `art-11` each **append what they measured**, two or three lines apiece: the
  texture-and-light law, the saturation check as run, the audio laws and one open question.
  **Every other session leaves it alone.** A session that wants to *decide* something there has
  probably found a decision that belongs in its own file, and `AGENTS.md` calls `DESIGN.md` a
  "short document, load-bearing" — a section growing a paragraph per session stops being read,
  which is a slower version of losing it.
