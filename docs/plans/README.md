# Plans

Reviewed 2026-09-28. The primary workstream is the core foundation; the case for it is
[the foundation audit](../analysis/2026-09-28-foundation-audit.md).

| Plan | Status |
|---|---|
| [The core foundation](2026-09-28-core-foundation.md) | **Active** from 2026-09-28: a physically based core beside the old one, humans first. |
| [Old path removal](2026-09-30-old-path-removal.md) | **Landed** 2026-09-30, part of the core foundation: the Arena, the Crypt and the skeleton onto the core, then the old path deleted, Havok with it; minds and skills step 5 is next. |
| [Minds and skills](2026-09-30-minds-and-skills.md) | **Active** from 2026-09-30, part of the core foundation: the lab's scenarios driven by minds through skills; strikes as searched recipes now, hand goals next. |
| [Warrior, Rogue and the reptile](2026-09-27-warrior-rogue-reptile.md) | **Paused** 2026-09-28 and salvaged by the core foundation: Session 2 steps 1-5 landed, step 6 is parked on `wip/s2-step6-human-ranges`, and Sessions 3-5 become the core's stages 5 and 7. |
| [Depths](2026-09-23-depths-00-overview.md) | Dungeon workstream. Session 06, authored set pieces, is outstanding. |
| [Dungeon look](2026-09-24-dungeon-look-00-overview.md) | Dungeon workstream. Session 06, an optional pixel-look experiment, is outstanding. |
| [Skeleton art](2026-09-23-skeleton-art-00-overview.md) | Session 03, the visual review, and session 04, an optional costume, are outstanding. |

## Removed documents

Completed, closed and superseded plans and analyses are deleted rather than kept. A comment or
note that cites one says which commit still has it, as "(in git at c76ce6bc)"; read it with

```powershell
git show <commit>:docs/<path>
```

| Commit | What it still has |
|---|---|
| `c76ce6bc` | The skill-ceiling plan set (closed 2026-09-27), every dated analysis from 2026-09-22 to 2026-09-27 except the human strike reference, the next-phase consolidation, and the standing notes `docs/humanoids.md` and `docs/movement-stability.md`. |
| `8ea28dc2` | Seventeen completed dungeon-look, dungeon-feedback and skill-ceiling session plans, removed 2026-09-27. |
| `0517aaf5^` | `docs/measurements.md` and `docs/design.md`, which older comments still cite. |
| `77a0cd77` | The old path, deleted 2026-09-30: the stone golem, its minds, walking and scoring, the module bench, the art proof, Havok, the old league's research and results, and their tests (`2026-09-30-old-path-removal.md`, step 5). |
