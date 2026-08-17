# Concept production -- overview

**Status:** active and handed off after the 2026-08-17 production pass. The owner
froze further visual iteration for a later session; session 09 records the honest
comparison baseline and next actions.

The permanent target is `web/assets/CONCEPT.png`: a filled, painterly isometric
dungeon with continuous architectural mass, readable human combatants, warm local
fire, compact controls, stable cameras, and no blank or cookie-cutter presentation.
The authoritative maze remains tile topology. Presentation may compose continuous
and sub-tile geometry inside that envelope; authoritative dungeon objects use fixed
point world positions.

## Session order

| session | result | depends on |
|---|---|---|
| [01](concept-production-01-controls-hud-and-idle.md) | restored live controls, production HUD, stationary default | none |
| [02](concept-production-02-six-view-camera-system.md) | World, Geometry, Top Down, First Person, Free, Dev | 01 |
| [03](concept-production-03-filled-world-and-occlusion.md) | filled overburden, thick walls, stable local transparency | 02 |
| [04](concept-production-04-production-combatants.md) | production Fighter and Brute with LODs and baked materials | 02 |
| [05](concept-production-05-dungeon-object-authority.md) | deterministic physical props and append-only publication | 01 |
| [06](concept-production-06-doors-torches-and-props.md) | physical doors, correctly mounted fire, authored props | 03 and 05 |
| [07](concept-production-07-modular-environment-art.md) | irregular modular masonry, blended surfaces and dressing | 03 and 06 |
| [08](concept-production-08-integrated-acceptance.md) | foreground comparison, performance and owner decision | 01 through 07 |
| [09](concept-production-09-visual-handoff.md) | frozen comparison baseline and prioritized next sessions | 08 |

Sessions 01--04 and 06--09 are presentation-only. Session 05 is the sole
authoritative session. It expects `ROOM_HASH`, `BATTLE_HASH`, `SWAP_HASH`, and
`BOW_HASH` to move because all four initialize the generated dungeon. `LAB_HASH`,
`GOLDEN_STATE_HASH`, learned inference, combat-spec, articulated command/stream,
exact trajectory, lifted solver, and articulated-duel pins must not move.

Every session lands playable and green, proves each new regression red by mutating
the protected line, and compares a foreground screenshot beside `CONCEPT.png` when
it changes visible output. Green loaders and validators never substitute for owner
acceptance. The topic closes only after session 08's remaining matrix and
visible-rAF evidence receive explicit owner acceptance; session 09 is the handoff,
not a substitute for those rows.

The rejected `visual-recovery-*` plans are retired rather than retained as a false
progress ledger. Their still-correct contracts belong in architecture/reference
docs; their screenshots remain historical failing evidence in the room matrix.
