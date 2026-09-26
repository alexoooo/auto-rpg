# Dungeon look 03b: walls ghost around the hero

The owner, after session 03: the main problem is the wall transparency. "It's an abrupt square",
and it should be "gradual and partial", "kinda like ghosting through", as in Diablo 1.

**What it was.** Session 02's cut-away dropped 13 of 16 pixels of any wall inside a world-space box
in front of the hero: 8.98 units (`fadeDepth`) toward the camera and 3.5 to either side, both in
sqrt 2-per-metre units. Outside the box it dropped none. On screen that is a square hole with a hard
rim.

**What it is.** It is now an oval centred on the hero as the screen sees it:
- **The rule.** `CUT_AWAY` and `cutAway(hero, at, pitch)` in `src/dungeon/fog.ts`. The shader in
  `src/dungeon/fog-plugin.ts` copies it by hand.
- **Projection.**
  - A wall point's height on screen relative to the middle of the body is
    `(y - centre) cos(pitch) - along sin(pitch)`.
  - `along` and `across` are its offsets from the hero toward the camera and sideways, in metres.
  - The oval's half-width and half-height are `CUT_AWAY.across` and `CUT_AWAY.up`, each measured from its centre:
    3.6 m and 3.2 m since dungeon feedback 01.
- **The drop** is at most `most` (0.8, 13 of 16 pixels), so the wall ghosts rather than vanishes:
  - it stays at `most` out to `CUT_AWAY.soft` of the oval's radius (0.2 since dungeon feedback 01);
  - it falls to none at the rim by a smoothstep, so the opening has no edge.
- **Nothing behind the hero is cut.** The drop rises from none to full over the first 0.35 m toward
  the camera. That is short enough that a wall the hero is pressed against gets the full drop: its
  face is 0.28 m off a human's centre, so 0.4 m toward the camera in the hero's own column.
- **The wall's foot stays whole.** It is whole below 0.1 m and fully in the cut above 0.5 m, so the
  footprint still reads.
- **Pitch.** `fogBand` now carries the pitch's cosine and sine where it carried the depth and side
  margin. `fadeDepth` and `FOG_LOOK.sideMargin`/`dither` are gone.

All numbers were set by eye and are judged on the owner's machine.

## Tests (`tests/dungeon-fog.test.mjs`)

**`a_wall_in_front_ghosts_around_the_hero_and_the_opening_has_no_edge`**, at 30 and 45 degrees:
- A wall in front, at every depth that can hide the middle of the body, is at the full drop where
  it covers it. That includes 0.4 m, a wall the hero is pressed against.
- There is no edge. Along four lines, no 2 cm step changes the share by a tenth of `most`:
  - across a wall face;
  - up it;
  - toward the camera;
  - across a wall top.
- Every point on one line of sight through the soft ring drops the same share. This is what makes
  the cut a screen-space one.
- It is partial, and only in front. The share never exceeds `most`, and it is zero:
  - behind the hero;
  - at the foot;
  - outside the oval's width;
  - on a low wall far in front.
- A steeper camera cuts more of the top of a wall 1 m in front.

**`the_cut_away_shader_is_cutAway_and_is_handed_the_pitch`** is a text tripwire on the shader's
copy, operators included. It also checks that `fogBand` is bound with the pitch after `update`, and
`fogHero` with the hero.

The old `the_fade_band_is_todays_at_the_default_pitch` left with `fadeDepth`.

**Mutations, all red:**
- a hard-edged oval;
- the foot cut;
- the hero's back cut;
- a whole wall dropped;
- the screen-height sign flipped;
- the pitch's cosine dropped;
- the height projected to the ground plane;
- the shader's sign flipped;
- `fogBand` bound with the sine and cosine swapped;
- the pitch never updated;
- the shader dropping a flat 0.8.

**From review:** the ramp toward the camera was 0.8 m, so a wall the hero was pressed against dropped
0.44 of its pixels over the body, not 0.8. It is 0.35 m now, and 0.4 m and 0.55 m are in the test.

## Measured

**Setup:** the page, Chrome, a hidden tab, `?play=dungeon&floor=b&wall=b`. The engine's own render
loop was stepped by hand, with the plugin's hero pinned.

**Control:** with the cut aimed away, a wall stub between the camera and the golem hides the golem
completely.

**Result:** aimed at the golem, the stub ghosts around it, the golem shows through, and the stub is
solid again toward its foot and its lower edge. On a long wall, the opening is an oval with no rim.

## Owner's checklist

1. Walk behind a wall. Does it ghost, and is the opening's size right?
   - `CUT_AWAY.across` and `up` set the size.
   - `most` sets how see-through the heart is.
   - `soft` sets how soon it starts to fade.
2. Is the 4x4 dither pattern acceptable at your resolution, or should the ghost be smoother? A
   smoother ghost means blending, and so sorting.
