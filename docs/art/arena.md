# Arena

A circular stone platform with concentric paving, a bronze compass inlay, a low masonry parapet,
crimson standards and eight braziers, after the owner's arena concepts. All of it is built in
code from the forge kit (`assets/forge/`, [its readme](../../assets/forge/README.md)) and the
runtime geometry; no other raster asset is downloaded or generated, so there is nothing to
rebuild outside the source.

## The rule it keeps

`src/arena/room.ts` owns the ring's authoritative geometry, and its dimensions are recorded in
[look](../reference/look.md). The art stays inside it: `forge-room.ts` fills the wall boxes from
the forge masonry asset at the colliders' positions and rotations, the brazier bands stay inside
each pedestal, and the paving lies 0.006 m above the collision plane. Every dimension below is a
visual choice; no anatomy, controller or combat tuning changes for the look.

## The pieces

- **Braziers** (`src/arena/forge-room.ts`): a bronze bowl 0.28 m high at y = 1.55 m, 1.08 m
  across at its lip and 0.7 m at its base, and three 0.09 m bands at heights 0.12, 1.35 and
  1.65 m, all inside the pedestal. Flames are the shared animated flame shader.
- **Paving** (`src/arena/forge-style.ts`): four stone courses bounded by radii 0.06, 3.4, 6.4,
  9.5 and 13.2 m, with 12, 24, 36 and 48 stones, each arc in four subdivisions with 0.08 m dark
  mortar seams. The underlay is at -0.01 m. The forge stone colour, carved normal and packed
  material maps shade it at 2.4 m a repeat.
- **Inlay** (`forge-style.ts`): bronze rings 0.055 m wide, flattened, at radii 1.25, 3.4, 6.4,
  9.5 and 12.8 m; eight compass rays alternating 4.5 and 2.4 m around a 0.75 m root; a fine ember
  ring at 12.87 m lights the rim.
- **Foundation**: 27 m across and 2.4 m deep.
- **Banners** (`paintArenaBanners`): a spear-and-circle seal on a 256 by 512 canvas texture, a
  burgundy field, bronze ink, shaded folds and deterministic flecks.

The setup screen's contender previews are described in [menu](menu.md).
