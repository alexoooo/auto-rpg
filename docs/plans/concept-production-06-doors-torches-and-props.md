# Concept production 06 -- doors, torches, and dungeon props

**Status:** implemented. Presentation/assets only; no registered hash moved.

Consume `DUNGEON_OBJECT_V1`. Door runs become thick hinged leaves with frames,
ironwork and collision-aligned pivots. Show latch pressure, then animate the open edge
over 450ms; an initially open door starts open. Torch backplates sit against the
published solid face and their socket/flame projects into adjacent walkable space.
Author iron supports, bowls/hafts, layered tapered flame, deterministic flicker,
sparks, smoke and bounded warm light.

Author barrels, pottery, webs, water, blood, vines, loose bricks, rubble and break
debris. Authoritative kinds follow object state; blood, vines and loose-brick scatter
remain deterministic non-colliding art. Destruction effects trigger only on state
edges and never feed back.

Red-first tests verify door hinge/pivot/progress, inside-facing torches in all four
directions, light/socket closure, object identity, break disposal, fog gating and
fallback. Run pinned room/prop exports, validators, renderer, TypeScript, build, docs
and diff gates.
