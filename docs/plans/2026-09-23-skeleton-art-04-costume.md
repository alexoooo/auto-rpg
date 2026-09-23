# Skeleton art -- 04 costume

Only if the owner asks for it after `-03`. The reference image's cloth, belts and bracers are what
geometry alone did not deliver.

## Shape

Rigid cosmetic gear, parented like the bones, with no body and no pick authority. Its colour
follows the faction.

| Piece | Host | Note |
|---|---|---|
| tattered loincloth and belt | `legs.pelvis` | A rigid skirt clips the thighs. Run a clearance sweep through a full stride, and cut the cloth into front and back flaps if it fails. |
| bracers | `*.forearm` | Keep clear of the wrist's full flexion. |
| one shoulder plate | `primary.collar` or `secondary.collar` | Check it against the upper arm's whole envelope. |

## Rules that carry over

- The pieces are emitted by the same compiler into the same GLB, keyed like `legs.pelvis.cloth`.
- The runtime is unchanged apart from dressing more than one piece per part.
- Sample the clearance from `mesh.position` and `mesh.rotationQuaternion` over a driven sweep.
  A collision filter cannot report a costume piece inside a limb (AGENTS.md, "A collision filter
  that forbids a pair...").
- The cloth owns its material through the palette, not per mesh. The disposal contract is the one
  in `src/golem/effectors/shell.ts`.
