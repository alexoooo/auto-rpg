# art-01 — the room goes umber

**Goal:** the `[regular]` view's colours become the concept's colours, the darkness gets deeper
and grainier, and the HUD gets bone text behind thin iron frames. No new shapes, no new data, no
Rust.

**Leaves the game:** the same game, in the right palette. Every art judgement from `art-05`
onward is now made against the background those sprites will actually sit on.

**Depends on:** nothing. This is the first session and it can land the day it is read.

---

## 0. Before anything

Commit `web/assets/CONCEPT.png` (the concept image) as the first act of this session, creating
`web/assets/`. Every later session references it; a mood target that lives in a chat log is a
mood target nobody can check a sprite against six weeks later. Nothing loads it — it is a
reference file in the repository, and `art-06` is what makes `web/assets/` a code path.

Record the baseline: `cargo run --release -p lab -- hash` and the test counts. This session
touches no Rust, so all four Rust/wasm tripwires are a formality — run them anyway, at the end,
to catch a stray edit.

## 1. One palette object, and every colour in the file reads from it

Today the canvas colours are scattered: `#0c1017` twice (`main.js:4919`, `6268`), `WALL_TOP` and
`WALL_XFACE` (`5881-5882`), the door pairs (`5900-5912`), the torch triple (`5930-5932`), the
vignette's three stops written inline (`5822-5824`), `#6ee7ff` inline in `drawPortal` (`6816`),
the two skins (`6894-6915`), and a dozen `rgba(...)` literals inside `drawCharacter`,
`drawLimb`, `drawMarks` and `drawShot`.

They do not all become one object — the `rgba(...)` literals with per-call alphas are fine where
they are. What becomes one object is **every base tone**, declared once above `WALL_TOP` and read
everywhere:

```js
/** The room's palette, and the whole of it.
 *
 *  Named rather than inline because the concept's look is a *relationship*
 *  between these tones -- rock lighter than distant floor, flame brighter than
 *  anything, blood the only saturation -- and a relationship that is spelled out
 *  at fifteen call sites is a relationship that drifts. */
const PAL = {
  void:       "#0b0a08", // never-seen, and the page's own background
  mortar:     "#100d0a", // what every seam shows through to
  stoneLo:    "#241e14", // darkest flagstone; `bakeFloorTile` is where it is realised
  stoneHi:    "#2e281e", // brightest flagstone, same
  rockSide:   "#1e1a14", // a block's +x / +y faces
  rockTop:    "#3a342c", // a block's lit top face
  rockLip:    "#57503f", // the lit edge of a course
  timberTop:  "#5a3d1c", // a door, lit face
  timberSide: "#33220f",
  iron:       "#2a1d10", // a torch bracket
  flame:      "#e8842c",
  flameCore:  "#fff0c4",
  bone:       "#c9bfa8", // highlights and any text on the canvas
  boneDim:    "#8c8474",
  blood:      "#7a1010",
  bloodHot:   "#c0392b",
  cold:       "#3d4f5c", // portal and magic, and nothing else
};
```

Those are the brief's hexes where the brief gave one (`void`, `rockTop`, `rockLip`, `bone`,
`blood`, `bloodHot`, `cold`) and derived to sit between them where it did not.

**Do not add a colour to this object that only one call site uses.** The object exists to make
the relationships checkable; padding it with one-offs turns it back into a list.

## 2. What each constant becomes

| where | today | becomes | note |
|---|---|---|---|
| `bakeFloorTile` mortar, `4919` | `#0c1017` | `PAL.mortar` | |
| `bakeFloorTile` stone, `4940` | `rgb(t, t+4, t+12)`, `t ∈ 20..30` | a whole-step walk from `PAL.stoneLo` to `PAL.stoneHi` | the channel order inverts: **warm now carries the contrast, where blue used to**. As landed the two ends are *read* rather than transcribed, so `PAL` and the painted floor cannot drift — same eleven tones, `(36,30,20)`–`(46,40,30)`, same `rand()` order |
| `bakeFloorTile` lit lip, `4944` | `rgba(190,212,248,0.05)` | `rgba(201,191,168,0.06)` | bone, not sky |
| `bakeFloorTile` grain, `4957-4960` | blue-white / black | `rgba(201,191,168,α)` / black, same α | |
| `WALL_TOP`, `5881` | `#161c28` | `PAL.rockTop` | |
| `WALL_XFACE`, `5882` | `#0e131c` | `PAL.rockSide` | |
| `DOOR_TOP` / `DOOR_XFACE`, `5900-5901` | `#3b2c1d` / `#261c13` | `PAL.timberTop` / `PAL.timberSide` | **brighter than today, and §3 is why** |
| `TORCH_IRON`, `5930` | `#3a2a1a` | `PAL.iron` | **darker than today, and §3 is why** |
| `TORCH_FLAME_TONE` / `TORCH_CORE_TONE` | `#e8842c` / `#ffe6a8` | `PAL.flame` / `PAL.flameCore` | the flame is already right; the core goes a step hotter |
| `arenaVignette` stops, `5822-5824` | `rgba(9,11,16, 0 / .20 / .62)` | `rgba(11,10,8, 0 / .28 / .80)` | see §5 |
| `drawPortal`, `6816` | `#6ee7ff` inline | `PAL.cold` | the one cold thing left in the room |
| `drawCharacter` outline, `8021`/`8087` | `rgba(9,11,16,0.85)` | `rgba(11,10,8,0.85)` | |
| `drawCharacter` ring, `7884` | `rgba(150,180,230,0.16)` | `rgba(201,191,168,0.14)` | |

**Two constants deliberately do not move**, and moving them is the mistake this table exists to
prevent:

- **`#0c1017` at `6268`** is top-down rock, not floor mortar. It is the same six characters as
  the mortar one line 1,349 up and a completely different thing: the flat modes' single rock
  tone, unreachable with the art on. Leave it. This is the one place in the file where two
  identical literals must stop being identical, and it is worth a comment saying so.
- **`DOOR_TOP_FLAT` / `DOOR_XFACE_FLAT` (`5911-5912`)** are the flat modes' door pair by
  construction. Leave them.

## 3. Two second-order consequences the palette change causes, both real

These are the parts of this session that are not a find-and-replace, and both come from the same
fact: **today's palette is blue bordering on monochrome, so any warm hue is the loudest thing it
can say without raising a voice.** Three comments in `main.js` say so explicitly
(`5888-5899`, `5916-5929`, `5948-5950`). Once the room is umber, warmth stops being loud.

- **The door loses its read.** `DOOR_TOP`'s whole argument (`main.js:5888`) is that
  `(59,44,29)` against `(22,28,40)` is a hue flip *and* a doubling of brightness. Against
  `PAL.rockTop` at `(58,52,44)` it is neither — it is the same family at the same brightness,
  and a shut door becomes indistinguishable from a wall block from across the room. The fix is
  chroma first and brightness second, never hue: `#5a3d1c` is `(90,61,28)`, which has visible
  saturation where the rock has almost none. **Rewrite that comment**; the argument it makes is
  about to become false and a stale argument is worse than none. And write the honest number
  into it: on relative luminance the lift over the rock top is **1.23×**, *down* from the
  warm-on-cold pair's 1.67×, so this session bought the door's read with chroma and paid for it
  in brightness. (This plan said "a 1.6× lift" until it was checked — that was the red channel
  alone.)
- **The torch stops being readable by hue and must be readable by contrast.** Same paragraph,
  same cause. `TORCH_IRON` goes *down* to `#2a1d10` and `TORCH_CORE_TONE` goes *up* to
  `#fff0c4`, widening both steps, because the two steps are now carrying the whole read. The
  bracket must stay darker than the flame by more than the flame is brighter than the wall — the
  rule the existing comment states, re-satisfied at the new numbers.

Also re-check, and re-tune if it fails, the arithmetic `TORCH_STOPS` documents (`main.js:5943`):
a first stop of `rgba(255,176,92,0.26)` adds `(66,46,24)` to what is under it, which was
"roughly a doubling of a lit flagstone" at `(20,24,36)`–`(30,34,46)`. The new flagstones are
`(36,30,20)`–`(46,40,30)`, so the same stop is now about a 1.7× lift rather than a 2×. If a lit
pool no longer reads as *lit*, raise the first stop; **do not raise it past the point where the
pool's rim goes hard**, which is what the second stop at `0.45` is holding back.

## 4. The skins split in two, so `[tactical]` stays byte-identical

`HERO_SKIN` and `MONSTER_SKIN` (`main.js:6894-6915`) are read by both the art body and the flat
disc. Retoning them in place would repaint `[tactical]` and `[dev]`, and those two modes are the
A/B control for this entire project.

So `skinOf` gains a branch and the table gains a second row:

```js
/** The readout skins -- **byte-identical to what they have always been** -- and
 *  the art skins beside them.
 *
 *  Two tables and not one retone, because the two modes want opposite things.
 *  `[tactical]`'s disc is a *diagnostic*: cyan against red at full chroma is the
 *  most separable pair on a dark screen and it should stay that. `[world]`'s body
 *  is a figure in a torchlit room, where full chroma is the one thing the concept
 *  never does -- the faction read there is carried by the rim light's hue at low
 *  alpha and by the ring on the floor, not by the fill. */
const HERO_SKIN_FLAT = { /* today's HERO_SKIN, unchanged, to the byte */ };
const MONSTER_SKIN_FLAT = { /* today's MONSTER_SKIN, unchanged */ };

const HERO_SKIN_ART = {
  glow: "127,166,189",
  body: ["#8fa8b4", "#38505e"],
  deep: "#141c22",
  wedge: "127,166,189",
  fan: wedgeFans("127,166,189"),
  bar: "#7fa6bd",
};

const MONSTER_SKIN_ART = {
  glow: "168,84,66",
  body: ["#a89080", "#5a4032"],
  deep: "#1c1410",
  wedge: "168,84,66",
  fan: wedgeFans("168,84,66"),
  bar: "#c0705e",
};

function skinOf(unit) {
  const hero = unit.faction === FACTION_HEROES;
  if (!artOn()) return hero ? HERO_SKIN_FLAT : MONSTER_SKIN_FLAT;
  return hero ? HERO_SKIN_ART : MONSTER_SKIN_ART;
}
```

`wedgeFans` is called four times at module scope instead of twice, so the page still builds
every wedge string once and allocates none per frame — the property `main.js:6868-6886`
measured and defends.

`HERO_THROUGH` (`main.js:9237`) is hoisted from `HERO_SKIN.glow` and is iso-only, so it reads
`HERO_SKIN_ART.glow`. Grep for every other reference to the two names and decide each one
consciously; there are few.

**The team ring is the one saturation exception and it must stay subordinate.** Both art glows
above are pulled a long way toward grey — `127,166,189` is the brief's `#3d4f5c` brightened, not
today's `110,231,255`. The concept's rings are thin and dim and read only because everything
around them is brown. If after `art-05` a body's faction is hard to call at a glance, the answer
is *ring alpha on hover and selection*, not chroma on the fill.

## 5. The darkness gets deeper, and gains grain

**The vignette.** Three stops (`main.js:5822-5824`), retoned to `PAL.void` and pushed from
`0.62` to `0.80` at the rim. The concept has near-total darkness at the frame edge; today's
`0.62` leaves the corners legible. The gradient is cached and keyed on the arena's screen box,
so this costs nothing new.

While in there: the comment at `main.js:5796` flags that a circular gradient over a 2:1 box
reads a shade round for the space, with the fix costed at three lines
(`save` / `scale(1, 0.5)` / `restore`). **Take it.** It was deferred to `iso-07` pending whether
anyone noticed; a session whose entire subject is how the room's light reads is where that
question gets answered, and the answer at a 0.80 rim is that a round falloff over a diamond room
darkens the north and south corners visibly more than the east and west ones.

**The grain.** A single cached tile, composited over the whole canvas at the end of `render`,
gated on `artOn()`:

- Bake one 256×256 tile of monochrome noise with `grainRandom` (`main.js:4884`) — the same
  xorshift the floor uses, at a different constant seed, for the same reason: a rebake must
  produce the same tile or the room fizzes when the window resizes.
- `ctx.createPattern(tile, "repeat")`, drawn as one `fillRect` over the viewport at
  `globalAlpha ≈ 0.035` with `globalCompositeOperation = "overlay"` — or plain `source-over` at
  a lower alpha if `overlay` costs anything measurable. **Measure both**; `DESIGN.md` says fills
  are free and says nothing about blend modes.
- **In screen space, not world space.** Grain is a property of the picture, not of the floor. It
  does not pan, it does not zoom, and it therefore never needs rebaking at all — one tile for
  the life of the page.
- **Not gated on the vignette and not inside it.** It goes over the bodies, the walls and the
  overlay layer, which is the whole point: it is what stops a large dark area reading as a flat
  fill, and the largest dark areas on screen are the ones with nothing in them.

No bloom. No chromatic aberration. No `shadowBlur` anywhere — see `art-00` §3.

## 6. The HUD

This is the one part of the session that is **global rather than `[regular]`-only**, and that is
a decision rather than an oversight: there is one DOM, three view modes share it, and a HUD that
repainted itself on `G` would be a mode switch that flashes the whole page. The canvas is the
A/B control; the chrome around it is not, and never was.

**`web/style.css`, the `:root` block (`style.css:5-45`):**

| var | today | becomes |
|---|---|---|
| `--bg` | `#090b10` | `#0b0a08` |
| `--panel` | `#11141c` | `#15120e` |
| `--panel-line` | `#1e2331` | `#312a1e` |
| `--ink` | `#e7ecf4` | `#c9bfa8` |
| `--ink-dim` | `#8f9bb0` | `#8c8474` |
| `--ink-faint` | `#5d6779` | `#5c564a` |
| `--accent` | `#6ee7ff` | `#7fa6bd` |
| `--accent-warm` | `#ffcf70` | `#e8b45c` |
| `--enemy` | `#ff8a7a` | `#c0705e` |
| `--scrim` | `rgba(9,11,16,0.88)` | `rgba(11,10,8,0.88)` |
| — | — | `--blood: #7a1010`, `--blood-hot: #c0392b` |

**`--scrim` keeps its 0.88 and its lack of blur.** That number is a measurement — seventeen
blurred elements cost ~7 ms a frame, about 10 fps, measured twice with a repeated baseline
(`style.css:22-30`, `DESIGN.md`). A frame is not a place to spend a look.

**Frames, in the concept's spirit.** The pills, slots and rails get a 1 px `--panel-line` border
and a 1 px inset highlight at `rgba(201,191,168,0.06)`, which is what reads as bevelled iron
without a gradient or an image. Nothing gains a border-radius it does not have; the concept's
panels are square-cornered and the page's are gently rounded, and squaring them is a change to
the layout's character that this session is not for.

**The life globe** (`drawGlobe`, `main.js:9522`) goes blood red. Health is on the brief's short
list of things allowed saturation, the concept's globe is red, and the globe is the one HUD
element that is drawn rather than styled — its liquid, its rim and its wobble highlight all move
to `PAL.blood` / `PAL.bloodHot` / `PAL.bone`. Its `GLOBE_MS` cadence and its wall-clock wobble
do not move.

**A display face for headings only, and only if it is free.** `.brand` and `.rail-title` may
take a system serif stack (`ui-serif, Georgia, "Times New Roman", serif`). No web font, no
self-hosted font, no `@font-face`: `style.css:1-3` states that no font, sheet or image is
fetched from anywhere, and that property is worth more than a display face. Every readout,
label, number and keybind stays on the existing sans and mono stacks — the concept's small text
is legible and modern, and a serif in a stat readout is a legibility regression wearing a
costume.

**Do not add or remove one readout, one keybind hint or one control.** Restyling is in scope;
reorganising is allowed; deleting is not. Every element discoverable today stays discoverable.

## 7. Write the art direction into `DESIGN.md`, in this session

`DESIGN.md` is **not created by this series.** It exists, it is two thousand lines of *why the
rules are what they are*, and every other session in this plan only reads it — for the performance
measurements, the profiling method, "damage is kinetic energy", the open questions. This session
is one of the two that writes to it, and the reason is a deadline.

**`AGENTS.md` §Plans: "the whole set is deleted in the commit that finishes the topic."** So
`art-00`'s reading of the concept — brown-black not blue-black, hand-placed stone, figures as
silhouettes with a warm rim, light that comes from things, chroma reserved for flame and blood and
the two rings — **has a deletion date.** What outlives it today is `PAL`'s doc comment, a PNG with
no argument attached, and `ASSET_SPEC.md`, which is written for an image generator that has read
nothing else and is a production contract rather than a record of why. That is precisely the
failure mode `DESIGN.md` exists to prevent for the sim, and the art currently has no equivalent.

So: add a short **"Art direction"** section to `DESIGN.md`, sourced from `web/assets/CONCEPT.png`
rather than from adjectives — and write it **now**, while the decisions are being made and the
concept is open in the other window, not at the end of the series when it becomes an act of
recall. Every clause traceable to something visible in the image:

- **The room is brown-black, not blue-black** — and say what that cost. `main.js:5845` used to
  state that blue was the channel carrying flagstone contrast; after this session it is not.
  Record what carries it instead, so the next person to "fix the contrast" does not reach for the
  channel this session deliberately emptied.
- **`PAL` is a relationship, not fifteen colours.** Rock lighter than distant floor, flame
  brighter than anything, blood the only saturation. Quote the hexes once, here — this becomes the
  copy the rest of the repository cites, including `ASSET_SPEC.md`.
- **One global light, upper right, warm.** Every asset in the game is lit by it. This is the one
  rule that cannot be rescued by putting an asset next to something else, which is why it belongs
  in the durable file and not only in the generation brief.
- **Light comes from things**, each with a fixture, a pool and warm bounce up the wall behind it;
  beyond a few units from one the room is *gone*, not dim. And the bound: the fog decides what is
  visible, the lighting is cosmetic within `canSee`, and a torch never reveals what vision has
  not.
- **Chroma is reserved** — flame, blood, and the two thin team rings. The check is the
  desaturated screenshot, not a code review (`art-09` §6).
- **Figures are silhouettes with a warm rim.** Detail lives in the outline, not the interior.
  That is what makes a procedural rig a *shipping look* rather than a placeholder — the argument
  `art-05` §6 spends and `art-08` re-tests by shrinking the window to forty pixels.
- **The HUD is framed, not floating.** Bone on near-black behind thin warm iron.

Then the pointer, because the section is worth little without it: **`web/assets/CONCEPT.png` is
the target and it stays in the repository permanently.** §0 commits it, nothing loads it, it is
not an asset, and `art-06`'s `FEEDBACK.md` says so in as many words.

**Later sessions append what they measured, not what they decided again.** `art-07` adds the
texture-and-light law it arrives at, `art-09` the saturation check as run, `art-11` the audio laws
it already plans to write (`art-11` §6). Keep it tight — `AGENTS.md` calls `DESIGN.md` a "short
document, load-bearing", and a section that grows a paragraph per session stops being read, which
is a slower version of the same loss.

---

## Acceptance test

1. **`[tactical]` and `[dev]` are byte-identical on the canvas.** Pause the sim (`Space`) at a
   fixed tick with a Brute and a Skitterer standing, screenshot each mode before and after the
   session, and diff. The HUD will differ — that is §6's stated exception. **The canvas must
   not.** If it does, a constant reachable with `art` false was retoned; §2's two "deliberately
   do not move" rows are the usual culprits.
2. Open `[regular]` beside `web/assets/CONCEPT.png`. The room reads as the same material. It
   will not read as the same *detail* — that is `art-07` — and it should not be tuned toward
   detail here.
3. A shut door is findable from across a dark room. An open one reads as a pair of jambs.
4. A torch reads as a light source at five pixels: bracket, flame, hot core, three separable
   tones.
5. Stand in a corner with both rails open. The frame edges are near-black, not merely dim, and
   the darkness has texture in it rather than banding.
6. The grain does not crawl when the camera pans, does not swim when the camera zooms, and does
   not fizz when the window is resized.
7. `floorBakes` (`main.js:4873`) is still in single digits after a minute of wheeling the zoom.
8. The fps chip is where it was. A retone cannot cost frames; if it does, the grain's blend mode
   is the only candidate and §5 says to measure it.
9. **`DESIGN.md` has an "Art direction" section and it survives the plan's deletion.** The test
   is §7's own: hand it to someone who has read neither `art-00` nor the concept, and ask why the
   floor is umber, where the light comes from, what is allowed to be saturated, and what makes a
   body readable at forty pixels. Four answers from that section alone, or it is not finished —
   the same standard `art-06` holds `ASSET_SPEC.md` to, for the same reason.

## Tripwires

All five from `art-00-overview.md`. No Rust changed, so the first four are a formality — run
them anyway.

## Explicitly not in this session

- Any image file except committing `CONCEPT.png` as a reference. `art-06`.
- Floor and wall *textures*. The procedural bake gets retoned, not replaced. `art-07`.
- Blood, props, decals. `art-07`, `art-09`.
- Any change to what the HUD says. Restyle only.
