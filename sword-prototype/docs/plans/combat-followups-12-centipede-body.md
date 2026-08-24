# Session 12 -- a short, long, segmented fighter that bites

## Outcome

Centipede is a genuinely non-humanoid Combatant, not a stretched Warrior: low to the floor,
long, articulated, segmented, able to turn and bite, damageable by segment, and honest in
setup about having no hands or equipment.

## Declared first contract

- One head plus eight body segments, about 2.1 m nose-to-tail and 0.38 m at the crown.
- Adjacent segments use constrained yaw/pitch articulation; self-collision is disabled only
  for its own chain, not against opponents, world, shields or weapons.
- No hands and no equipment. Setup disables both hand pickers and refuses a non-empty loadout
  by naming Centipede and the item.
- `bite` is the only natural striker in this session. The unfinished requested phrase "bite
  or" remains reserved; no tail sting, spit or weapon mount is invented.
- The head at zero health is fatal. Each segment contributes 0.125 vitality weight; losing
  enough body segments can also exhaust vitality. Severing a segment detaches the tailward
  chain as inert debris; it does not create a second living creature.
- Human locomotion uses W/S, A/D and Q/E. The pointer aims the head; left button commits a
  bite/lunge and right button curls into a compact guard. Crouch/waist/wrist controls are
  explicitly unsupported and disabled, not accepted and ignored.

## Implement

1. Add `src/bodies/centipede.ts` implementing the common `Combatant` seam with its own part
   graph, view writer, locomotion and disposal. Do not add Centipede branches throughout
   `Fighter`.
2. Add natural-striker capability to the unit/action registry. Generalize observation and
   option masking around named attacks rather than fabricating two `HandView`s. Existing
   Warrior feature/checkpoint version moves if the feature schema changes; old experimental
   bytes must refuse by name.
3. Implement a pure bite phase (chamber, lunge, recover) returning ordinary supported input.
   Add a `crawler` policy using close/bite/guard, plus a human adapter for the declared keys.
4. Build segment colliders, joints, health/vitality, severing and collision filters. A detached
   tail becomes `DEBRIS` and cannot bite, observe, move or score.
5. Add procedural fallback art and a total costume descriptor. Cosmetic segments follow the
   authoritative bodies and own no shapes.

## Tests first

Add `tests/centipede.test.mjs` plus registry/integration cases:

- `centipede_builds_one_head_eight_segments_and_each_declared_joint_once`
- `centipede_refuses_every_hand_loadout_by_name`
- `a_bite_uses_one_natural_striker_and_scores_at_most_once_per_contact_window`
- `zero_head_health_or_exhausted_segment_vitality_ends_the_centipede`
- `severing_a_segment_turns_the_tail_into_inert_debris`
- `centipede_self_exemptions_do_not_exempt_opponents_world_shields_or_weapons`
- `centipede_disposes_every_segment_constraint_observer_and_costume_piece`
- `warrior_broot_and_centipede_target_each_others_published_vital_geometry`

Mutate segment count, accept a sword, leave a detached tail striker active, exempt enemy
weapons and omit one constraint disposal. Each named test must fail.

## Measurement and acceptance

Run mirrored Centipede-vs-Warrior and Centipede-vs-Broot cells against sword, shield and bare
hands. Record turning radius, speed, bite attempts/contacts, segment hit distribution,
severing, vitality, wins, duration and lifecycle counts. In both cameras it must read as one
low articulated creature rather than capsules following a hidden humanoid root.

```powershell
npm test
npm run check
npm run build
npm run measure -- --only centipede --bouts 40 --seed 20260824
```
