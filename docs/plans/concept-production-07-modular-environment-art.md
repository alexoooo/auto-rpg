# Concept production 07 -- modular environment and painterly surfaces

**Status:** planned. Room asset pins move; simulation hashes do not.

Replace cookie-cutter tiles with continuous modules spanning 1, 2, 3, 5 and 8 cells,
plus irregular corners, arches, buttresses, collapsed edges, stairs, coping and rubble
transitions. Visual transforms may be sub-tile but must stay inside the authoritative
solid/open envelope and never imply false walkability.

Create multiple 2048 painterly albedo/normal/ORM atlases for floor, masonry,
wood/iron, overburden and props. Provide at least eight floor treatments and six wall
treatments with deterministic non-checkerboard selection, macro grime/value masks,
and cross-boundary cracks, puddles, blood, roots, debris, moss and erosion. Preserve
warm upper-right key, cool-dark ambient separation, localized fire and rough
materials. Total compressed assets remain <=64MiB and estimated peak GPU <=512MiB.

Red-first tests cover seams, role closure, variant coverage/checkerboards, macro
repetition, collision-safe envelopes, value hierarchy and budgets. Run pinned Blender
double export, all validators, renderer/build/toolchain/docs/deps/diff gates.

