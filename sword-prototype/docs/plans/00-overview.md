# Sword prototype -- the body joins the fight

## Outcome

Turn the current arm-and-weapon prototype into a whole-body combat experiment: a fight has
one legible vitality state and stops when decided; arrows can be followed; wrists, trunk and
legs contribute anatomical motion; an empty hand is useful; surfaces carry authored detail;
and a learned hierarchical policy can discover when to use the resulting actions.

This plan begins after master-plan session 05 (`a095877`), which added the bow. The working
tree was clean when this plan was written on 2026-08-23.

## Playtest decisions already made

- A human beat `swinger`; do not change its 0.34 / 0.13 / 0.10 / 0.42 s cycle to make it
  easier.
- The gait-driven knees look good; keep `CONFIG.body.gaitDrivesLegs = true`.
- The bow interaction is good, but its arrows are too hard to track.
- A bout wants one coherent health bar. A torso at zero must be fatal, but local part health
  remains because severing, lost arms and gait damage depend on it.
- Once the verdict exists, neither policies nor contact scoring may continue the fight.

Those are durable findings in [`../measurements.md`](../measurements.md#what-is-still-owed),
not tasks to re-open in the sessions below.

## The whole-body health rule

Session 01 introduces no second mutable hit-point pool. It derives vitality from the local
part states already owned by `Fighter`:

```ts
injury(part) = 1 - clamp(part.health / part.maxHealth, 0, 1)
vitality = clamp(1 - sum(injury(part) * VITAL_WEIGHT[part.key]), 0, 1)
beaten = vitality === 0
```

The first weights are intentionally simple and visible:

| part | weight |
| --- | ---: |
| head, torso | 1.0 each |
| pelvis | 0.50 |
| each upper arm, forearm or hand | 0.10 |
| each thigh or shin | 0.125 |

Thus a ruined head or torso is fatal on its own, while combinations of serious non-vital
wounds can also exhaust the body. Local health still decides whether a particular limb is
critical or severed. The headless corpus must record bout length, cause of death, body part
hit distribution and winner before and after; weights may move only with that table in
`src/config.ts`. The formula, keys and tests land before the HUD starts relying on it.

## New control vocabulary

Raw `x`/`y` and “turn” are too ambiguous to survive contact with three coordinate frames.
The plan uses these names:

```ts
interface HandIntent {
  pointerX: number;
  pointerY: number;
  roll: number;       // forearm pronation/supination, bounded
  wristBend: number;  // 0..1 -> 0..pi/2 anatomical bend
  thrust: boolean;
  guard: boolean;
}

interface PostureIntent {
  trunkLean: number;  // -1..1, sagittal lean about the hips
  trunkTwist: number; // -1..1, shoulders turning over planted hips
  crouch: number;     // 0..1, tall to fully bent
}
```

The player's pointer, buttons and locomotion remain human-controlled. In human play the
selected policy owns `roll`, `wristBend`, `trunkLean`, `trunkTwist`, `crouch`, and the hand
not under the mouse. `splitMind` is the one ownership table; the UI and the simulation may
not each invent a copy.

The pelvis/hips become the locomotion reference. Trunk motion happens about the waist while
the pelvis stays planted. Hand positions continue to be expressed against the upright
fighter frame (world vertical plus pelvis heading), even while shoulder sockets move with
the trunk. That prevents leaning from silently remapping the mouse.

## Learning direction

Do not begin with look-ahead. Havok exposes no cheap, exact clone/restore seam; rebuilding a
scene per branch would make a combat-time planner unusable. Do not begin with an end-to-end
deep net either: it would spend the first experiment relearning the stable action geometry
already in `policies.ts` and would be difficult to interpret.

Sessions 11-13 use a hierarchical controller:

1. action-specific options own short skills such as close, disengage, cover, cut, thrust,
   punch and shoot;
2. a compact NEAT network reads factual `FighterView` features every 0.10 s and selects an
   option plus a persistence value;
3. novelty descriptors reward distinct range, guard, handedness and attack-transition
   patterns alongside winning, so selection has a reason to retain new behaviours;
4. a learned checkpoint ships only after mirrored held-out bouts beat the scripted baseline
   without collapsing to one option.

Every option still returns the same `Intent` a person uses. Learning earns no direct joint or
physics authority.

## Sessions and order

| session | result | depends on |
| --- | --- | --- |
| [01](01-vitality-and-a-clean-ending.md) | one derived vitality bar; combat authority stops at the verdict | bow session 05 |
| [02](02-traceable-arrows.md) | pooled high-contrast arrow head/fletch and flight trails | 01 |
| [03](03-anatomical-wrist.md) | bounded roll, wrist bend, mirrored arm mapping, AI-owned orientation | 02 |
| [04](04-articulated-trunk.md) | shoulders lean and twist over planted hips without remapping the mouse | 03 |
| [05](05-crouch-and-reactive-posture.md) | crouch plus a procedural posture policy for human and AI play | 04 |
| [06](06-bare-hands.md) | empty hands block and punch through the real combat model | 05 |
| [07](07-texture-pipeline.md) | digest-pinned CC0 texture and UV pipeline proven in the page | 06 |
| [08](08-character-surfaces.md) | textured skin, cloth, leather and armour with side readability | 07 |
| [09](09-weapon-and-object-surfaces.md) | textured held weapons, arrows and ring objects | 08 |
| [10](10-arena-surfaces.md) | textured floor, walls and room dressing without new authority | 09 |
| [11](11-action-options-and-evaluation.md) | composable action options and a reproducible behaviour corpus | 10 |
| [12](12-neat-meta-training.md) | seeded NEAT trainer, novelty archive and checkpoint codec | 11 |
| [13](13-learned-meta-policy.md) | held-out learned policy available in the setup screen | 12 |
| [14](14-integration-and-playtest.md) | final balance, visual and performance pass; plan set closes | 13 |

No session depends on an uncommitted result from a later one. Art sessions are deliberately
before training so the final learned-policy playtest measures the game that will actually be
looked at, but the learning code reads no cosmetic state.

## Invariants across every session

- Keep the prototype standalone; import nothing from `../client`, `../crates`, `../tools`,
  `../web`, or `../warrior-prototype`.
- Policies use `Intent`; cosmetics carry no physics or hit authority.
- Physics runs at the fixed solver step through `scene.onBeforePhysicsObservable`.
- No body, mesh, observer or trail count may grow across resets or pooled-arrow reuse.
- New `FighterView` fields need real readers and updates to both JavaScript fixtures named in
  `AGENTS.md`.
- Match each edited file's existing line endings. Do not normalize `src/style.css`.
- Every new assertion must be mutation-checked: break the line it is intended to guard and
  watch the named test fail.

## Verification and pins

This standalone prototype has no golden hashes. Sessions 01, 03-06 and 11-13 may move the
headless policy table because they deliberately change rules or control; each predicts the
direction, captures a before/after table with the same seed and explains every unexpected
move. Sessions 02 and 07-10 are cosmetic and must not move outcomes or damage totals.

Every session runs, from `sword-prototype/`:

```powershell
npm test
npm run check
npm run build
```

Mechanics and AI sessions also run `npm run measure -- --seed 20260823`. Asset sessions run
`npm run asset:verify`. Browser acceptance uses `npm run dev` attached to its shell on port
5180; whoever starts it stops it and verifies the port has no listener.
