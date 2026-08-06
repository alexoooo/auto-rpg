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

---

## Tripwires

All five from `iso-00-overview.md`, after every item taken.
