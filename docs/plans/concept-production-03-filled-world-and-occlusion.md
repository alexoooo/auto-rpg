# Concept production 03 -- filled world, masonry mass, and occlusion

**Status:** implemented as runtime presentation geometry. Neither room asset pins nor
Rust hashes moved.

In `client/src/render/room-environment.ts`, retain stable four-sided face identity but
replace thin boundary facades with thick masonry volumes joined to authored dark
overburden. Unknown map cells are covered by opaque rough roof/stone art with a ragged
disclosure frontier. Outside-map screen area receives bounded cliff/skirt and cavern
stone rather than empty black canvas. VIS 0 still owns no entity, effect, sound,
shadow or pick disclosure.

Extend `room-occlusion.ts` from height-lowering to eased local transparency. Walls,
roofs, doors and large props whose projected bounds overlap the hero plus margin fade
to 22% alpha and leave the shadow set while faded; clearing the hero restores the
same object. No camera quadrant deletes an entire side and disclosure never rebuilds
an existing face.

Red-first tests:

```text
unknown_and_outside_space_are_filled_by_non_disclosing_stone_art
outer_boundaries_are_thick_masonry_joined_to_overburden
only_objects_covering_the_hero_fade_and_restore_the_same_identity
walking_all_four_room_sides_never_removes_or_rebuilds_a_wall
```

Run pinned room export/validator if geometry changes, then renderer, TypeScript,
build, docs and diff gates.
