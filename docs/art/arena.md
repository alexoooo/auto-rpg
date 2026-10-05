# Arena

The owner's arena concepts guide the circular stone platform, concentric paving, bronze compass
inlay, low masonry parapet, crimson standards and eight braziers. The setup has a standing
contender on each side and a full-ring overview between them. Its only text names the screen,
side, selected character, play mode or an action.

`src/render/character-preview.ts` serves both the Dungeon lineup and the Arena contenders.
Each Arena canvas has one full-body camera and an unstepped preview world. Changing a selection
loads its dresser once per canvas and disposes the prior skin and body. Revision counters let
only the latest choice install a model. The canvases render on asset readiness, selection and
resize; page teardown aborts and disposes them. The existing lighting and framing choices are
recorded in `menu.md`. Preview bodies do not enter the fight's world.

`src/arena/room.ts` owns the ring's authoritative geometry. `docs/reference/look.md` records its
dimensions. `forge-room.ts` fills the wall boxes from the existing forge masonry asset, so visible
masonry and collision share their positions and rotations. Bronze bowls and three 0.09 m bands
at heights 0.12, 1.35 and 1.65 m remain inside each pedestal. The bowl is 0.28 m high at y=1.55,
1.08 m across at its lip and 0.7 m at its base. Flames are the shared animated flame shader.

`forge-style.ts` constructs four stone courses bounded by radii 0.06, 3.4, 6.4, 9.5 and 13.2 m,
with 12, 24, 36 and 48 stones. Each arc has four subdivisions and 0.08 m dark mortar seams. Paving lies
0.006 m above the collision plane; the underlay is at -0.01 m. The existing forge stone colour,
carved normal and packed material maps shade it, at 2.4 m per repeat. Bronze rings at radii 1.25,
3.4, 6.4, 9.5 and 12.8 m are 0.055 m wide and flattened vertically. Eight compass rays alternate
4.5 and 2.4 m lengths around a 0.75 m root. A fine ember ring at 12.87 m lights the rim. The
foundation is 27 m across and 2.4 m deep. All dimensions here are visual choices made for this
composition. No anatomy, controller or combat tuning changes to achieve the look.

`paintArenaBanners` draws a spear-and-circle seal on a 256 by 512 canvas texture, with a burgundy
field, bronze ink, shaded folds and deterministic flecks. This is code-native art; the existing
forge assets and runtime geometry are sufficient to rebuild it. No additional downloaded or
generated raster assets are needed.
