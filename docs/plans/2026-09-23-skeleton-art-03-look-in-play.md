# Skeleton art -- 03 look in play

The owner judges the look and the frame time on their own machine; a tab driven from here gets no
frames (see AGENTS.md on hidden tabs). Navigate after every rebuild, do not reload.

## What to put in front of the owner

1. `/bench.html` with a skeleton on the stand, then `/` with skeleton against skeleton, then the
   dungeon with a skeleton hero.
2. Both faction tints side by side, and the rune eyes' glow in the orbits.
3. A severed arm and a lost skull: the pieces are children of the collider and should fall with
   the debris.
4. A sword build's closed hand (punch-dagger grip) and a fist build's fist.

## Known issues to show rather than guess at

- **The fist is drawn short of its collider.** Measured in the Node harness at bind, the drawn
  fingers end at z 0.381 while the fist sphere reaches 0.451, so a punch lands 70 mm ahead of the
  visible knuckles. The physics hand is 130 mm from wrist joint to fist centre, which is longer
  than an anatomical hand. There are two fixes, and the choice is the owner's:
  - Scale the fist build's hand along its axis. This makes a long, bony fist.
  - Move the fingers' piece so it fills the sphere. This leaves a gap at the knuckles.
- **Picking.** `Golem.register` makes every dressed mesh pickable, and `Targeting.update` picks
  every frame; `Takeover` picks too while it is armed. The skull is 23.3k triangles and the trunk
  20.3k.
  - Measured in the Node harness (NullEngine, `createHeadlessArena`, two `skeletonSetup()` bodies
    1.2 m apart, `pickWithRay` under Targeting's predicate), 2026-09-23:

    | | Mean pick | Ray over a body | Ray through the skull |
    |---|---|---|---|
    | primitives | 25-26 us | 33-35 us | ~30 us |
    | bones | 85-91 us | 229-247 us | 0.94-1.26 ms |

  - Targeting's predicate requires `isVisible`, so simply making the art unpickable would make a
    skeleton unpickable. The fix is a pick proxy: a low-poly invisible-to-the-eye mesh that the
    predicate accepts, or a predicate that accepts the hidden host. Measure frame time on the
    owner's machine first.
- **Render load.** A skeleton goes from about 17k to about 86k triangles, and the arena's shadow
  pass draws them again.
- **Startup.** All three pages wait for the 2.66 MB GLB before building a scene, whether or not a
  skeleton is in play.
- **No grain map.** The bone shading is vertex colour only. Add a tiling normal map only if the
  owner finds the bone too smooth. It must attach from its decode callback, as `surface()` does.

## Tuning

The fit and curl tables sit at the top of their sections in `scripts/skeleton/build-assets.py`.
Rebuild, then run `tests/skeleton-art.test.mjs`, whose tolerances are in `FIT`. Commit each round.

## AGENTS.md

Add one paragraph under "Where the design lives". It should name `scripts/skeleton/` as the
compiler, `public/assets/skeleton/README.md` as the rebuild recipe, and the winding rule: a
reflected source object's triangles are reversed, and Workbench previews cannot show that.
