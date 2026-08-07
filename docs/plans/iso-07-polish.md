# iso-07 — polish

**Goal:** the items deliberately deferred, each independent of the others. Take them in any order,
or none.

**Depends on:** `iso-06` landed and verified.

Each item states its trigger — the observation that justifies doing it. **If the trigger has not
been observed, skip the item.** Several of these are only worth doing if they actually bother
someone.

---

## 1. Aiming under manual control

**Trigger:** manual sword control feels like it misses.

`main.js:3000-3008` derives the aim bearing from `pointer.x/y`, the cursor's *ground* point. Under
iso, aiming at a monster's chest aims at the floor roughly a body-height behind it, so the blade
goes past the target.

This is the one genuine gameplay regression the conversion introduces, and the fix is a design
decision rather than a port: **aim at `unitAt`'s pick when there is one, and at the ground point
when there is not.**

```js
const quarry = unitAt(pointer, state);
const tx = quarry ? quarry.x : pointer.x;
const ty = quarry ? quarry.y : pointer.y;
const dx = tx - state.hero.x;
const dy = ty - state.hero.y;
```

`unitAt` already runs once a frame for the cursor affordance (`main.js:7173`), so hoist that result
rather than calling it twice.

Consider whether this should apply under top-down too. It is arguably better there as well — but it
changes a control that works today, so decide deliberately and write down which.

**Landed. Iso only** — the decision and its artefact are recorded in `pushInput`'s own comment.
Top-down has no height, so the ground point already *is* what is being pointed at; applying the pick
there would change a working control rather than fix a broken one, and `[tactical]`/`[dev]` are the
A/B control.

**There was nothing to hoist**, and the premise above is wrong: the affordance's pick is gated on
`!(controlMask & CONTROL_LIMB)` and the aim only matters *under* `CONTROL_LIMB` (the module reads
`input_aim`/`input_reach` nowhere else), so the two picks are complementary and never both run.
`pushInput`'s pick carries the same mask gate, which keeps `unitAt` at one call a frame.

## 2. Two-tone wall faces

**Trigger:** the blocks read flat.

`iso-03` ships one side colour for both vertical faces. Splitting them costs a third baked path
(`wallBandFaceY`) and a third `ctx.fill` per band in the merge walk:

```js
const WALL_TOP   = "#161c28";   // catches what light there is
const WALL_XFACE = "#0e131c";   // the +x face, half lit
const WALL_YFACE = "#090d14";   // the +y face, in shadow
```

Fills are free, so the cost is the extra path and the extra fill call — about 24 more calls per
frame at default framing. Cheap.

## 3. Per-projection `CAMERA_OVERSCAN`

**Trigger:** the void at the screen corners reads badly when the camera is against an edge.

Clamping to the *bounding box* of the diamond lets the screen corners sit over a wedge of void that
the top-down clamp would not permit, because the diamond's slanted edges cut the corners of the safe
rect. That is the correct picture of that place — it is what the room looks like from there — but it
is more void than top-down shows.

The lever is a smaller overscan under iso, as a column in the `PROJ` table:

```js
PROJ_TOPDOWN.overscan = 1.5;   // CAMERA_OVERSCAN today
PROJ_ISO.overscan = 0.75;
```

**Do not clamp to the inscribed rhombus instead.** It would refuse to centre a hero standing in the
north corner at all, which is much worse than showing some void.

## 4. The hero depth bias

**Trigger:** the outline pass is not enough and the hero feels lost behind rock.

The knob is `depth + BIAS` for the hero in `buildDrawList`. **Its artefact is stated up front:** it
breaks the merge walk's monotonicity — the band cursor advances past a band that a later, shallower
item still needs drawn first — so the hero will draw over a wall it is a fraction of a unit behind,
and the transition will flicker for a frame.

If taken, keep it small (≤ 0.35) and be prepared to revert it. The outline pass is the intended
answer; this is the escape hatch.

## 5. Elliptical vignette

**Trigger:** the vignette reads round in a 2:1 space.

Three lines around the fill in `drawLevel`, the same `save`/`scale(1, 0.5)`/`restore` shape as the
lantern in `iso-06` §5 — with the same caution about the `fillRect` bounds needing to be expanded
to compensate.

## 6. Banded remembered walls

**Trigger:** a ghost is visible through a remembered wall and it looks wrong.

`iso-04` bands only the lit walls; remembered ones are drawn unbanded in the ground layer, so they
cannot occlude. The escalation is two more band arrays (`wallBandTopSeen`, `wallBandSideSeen`) and
four fills per band instead of two — the same code, applied twice.

Expected to be rare: a remembered wall is by construction out of the hero's sight, so it is either
off screen or beyond the lantern.

## 7. Interior rock holes

**Trigger:** unseen interior rock reads as a pit in the plateau.

Should have been settled in `iso-03`'s acceptance test. If it was deferred: emit a top face for
solid tiles that are 4-adjacent to a seen tile, as well as for seen tiles themselves.

## 8. Documentation

**Not optional — take this one.**

- `README.md:3` opens *"A top-down auto-battler…"*, which stops being true.
- The `[regular]` / `[tactical]` / `[dev]` description in `README.md` needs the projection column.
- `DESIGN.md`'s "Performance notes" should record what the conversion actually cost: the `edge`
  stroke deleted, the body shadow simplified, the band fills added, and the measured `render` mean
  before and after. That section is the project's memory of how this was measured and it should not
  end at the top-down era.
- Two stale comments still claim the room is 24×16 world units (`main.js:3961`, `main.js:2024`); it
  is 48×32. Unrelated to this project, but they are in files being edited anyway.

  **Landed: only one of the two was still stale.** The `resize`/`fit` comment was rewritten in
  `iso-01` when `fit` became projection-dependent, and already says `48x32`. The flagstone-bake
  comment was the one left, and is now fixed. Nothing else in `main.js` quotes a room dimension:
  `drawLantern`'s `4124x2749 CSS pixels` is 48×32 at zoom 1 and is correct, and
  `let arena = { x: 24, y: 16 }` is an initial value overwritten from the frame at boot, not a claim.

## 9. The room's lighting stops at the rock line

**Trigger:** the plateau reads as uniformly lit at every distance, or the fog boundary across rock
reads as a hard band.

Neither of the two falloffs has ever painted on rock. `drawLantern` does `ctx.clip(levelPaths.floorLit)`
before its fill, and the vignette is painted inside the floor pass's own clip in `drawLevel` — so
both are floor-only, in both projections. Rock is lit by its flat tone and nothing else, wherever it
stands relative to the lantern.

Top-down this was invisible and had been since the vignette landed: rock was one tone darker than
the darkest floor, so there was nothing on it for a falloff to darken and no cue that would have
changed if there were. Under iso the top face catches light on purpose — `WALL_TOP` is inside the
flagstone's own tonal range — so a plateau at the far edge of sight is now brighter than the floor
in front of it, and the eye has something to notice.

Two options, and they are not the same size:

- **Darken `WALL_TOP` below the darkest lit floor.** One constant. It gives up the lit top face,
  which is the thing that makes a block read as a block rather than a lifted silhouette, and it puts
  the room back on tone-as-the-only-cue — the top-down premise, under a projection that no longer
  needs it. Cheap, and a real loss.
- **Paint the falloff over the wall paths too.** More correct: the light stops being a property of
  the floor and starts being a property of the room. The cost is that under `iso-04` the lit walls
  are banded by `tx + ty`, so it is a fill per band per gradient rather than one fill each — the
  same shape as §6's escalation, and the same reason it is not free. Fills are cheap, but the band
  count is not one.

**It interacts with §2.** Two-tone faces already ask what "lit" means for a vertical surface; if
both are taken, decide the falloff and the face tones together, or the `+y` face ends up carrying
two different stories about where the light is.

---

## Tripwires

All five from `iso-00-overview.md`, after every item taken.
