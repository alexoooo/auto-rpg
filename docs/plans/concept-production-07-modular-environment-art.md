# Concept production 07 -- modular environment and painterly surfaces

**Status:** complete on 2026-08-17. Room asset pins moved; simulation hashes did not.

Generator 6 now exports continuous coursed wall modules spanning 1, 2, 3, 5,
and 8 cells, four floor sources whose allowed quarter turns provide eight or
more treatments, four painterly material roles, and the existing corner, end,
door, torch, rubble, root, and barrel roles. The 1,254-square source atlas is
preserved; deterministic 896-square albedo/normal/ORM embeds keep the shipped
set under its global compressed-byte budget.

The room runtime packs boundary faces into the longest authored modules, keeps
solid-cell coping and overburden inside the solid/open envelope, and selects
floor variants without checkerboards. Physical torches use the pinned
314-square derived flame sprite and broad bounded point lights. The original
1,254-square 4 x 4 VFX/decal atlas remains pinned and served, but live dressing
is currently restricted to rubble: the root card, barrel/pottery and web proxy
sources were removed from the cutaway after visible review showed a pale floor
quadrilateral and orange dome. They remain authored sources for a future mesh
rebuild and never enter simulation state.

Final room identities are:

| Identity | SHA-256 |
|---|---|
| build inputs | `52296f2178324c57387e47a6a4a717f138051288768e9805e778781ba5975b9f` |
| sidecar | `021363e6f4857fcdca39718a4779ee432dbc309bb156ef311f2004192052e62d` |
| GLB | `7d1a2c4b9ea3483f4c4461b72430144c6dca21f5e6bd024bafa1fdcb4bccc139` |
| validator | `0157a21f928f21159d612179684f8b1ffe5813e684b2f6df294816e0e5516189` |

The GLB has 19 nodes, 18 meshes, five materials, 8,307 vertices, and 4,128
triangles. GLB plus sidecar is 15,828,555 bytes and estimated residency is
43,465,984 bytes. The complete shipped room/combatant/VFX set is 64,520,583
bytes, leaving 2,588,281 bytes beneath the 67,108,864-byte cap.

Pinned Blender double export, the 16 asset tests, strict validator, TypeScript,
and all 125 render contracts pass. The final current-source World evidence is
[concept-production World](../performance/evidence/2026-08-concept-production-world.png),
1534 x 889, SHA-256
`12e905bfd83e16d94b7b11d2f1055a95ae4f6d1651558a7656c1b4b73ff1197f`.
It records an assembled Fighter, visible authored flames, closed Systems drawer,
and no proxy quad/dome. It is correctness evidence, not rAF/performance evidence.

Honest visual handoff: compared with `CONCEPT.png`, the shipped flame sprites
are oversized and overbright, masonry and floors remain darker/flatter, and
dressing is sparse after the proxy-source exclusions. Those are future art
direction gaps; this session does not disguise them as completed polish.
