# Attributes 08 -- armour

Armour scales each part's armour fraction: the share of a blow that the part shrugs off. It follows
the per-stat protocol in `-00-overview.md`. The owner expects armour to come from item stats
eventually. So `resolveAttributes` stays a fold over sources, and this session wires only the
settable one.

## The knob

**Where the fraction is set.** `GolemPart.armour` is set when a part is built, as a number or as
`ArmourByHit` (per kind of blow: cut, thrust, slap, crush; skeleton 02). The values:
- stone: plain torso core 0.10, plated 0.34, head 0.05;
- human: 0.35 by default and 0.5 at the core and head;
- skeleton: `SKELETON_ARMOUR`, `{cut 0.5, thrust 0.6, slap 0, crush 0}`.

**Where it is read.** Every hit goes through `Combat` → `Golem.applyDamage` → `armourOf` →
`partArmour` → `armourAgainst` → `armouredDamage` in `src/scoring.ts`, which throws when armour is
1 or above.

**Where to scale it.** Scale once, where the golem captures its parts (`Golem.register`, beside
where health is set), and write the scaled value onto the part:
- a number is multiplied;
- an `ArmourByHit` has every field multiplied.

The result is clamped to `ARMOUR_CAP`, 0.9, a named constant with its reason in its doc comment:
`armouredDamage` refuses 1, and a part that ignores nine blows in ten is already the end of the
range.

**Equipment is never reached.** `limbFor` refuses it, so armour on a shield, blade, mace, maul or
whip does nothing, and the stat does not touch it.

## Expect a small effect, and say so

A multiplier on a small fraction is small. Stone's head at 0.05 becomes 0.0625 at x1.25. The
skeleton's slap and crush are 0, and stay 0 at any setting. That is how the owner's rule works, not
a defect. **But if the sweep reads flat on stone, bring the owner the alternative** rather than
choosing it here: scale the share of damage that *passes through*, so that pass = (1 - a)^r. With
that rule x2 on 0.10 gives an armour of 0.19, and even zero armour stays zero. It is a different
rule and the owner's call.

## Bench

Use a scripted blow, not a bout. Deliver one standard cut, one thrust and one crush to the torso
core and to the head of the stone default, the plated torso and the skeleton, and read the damage
booked at 0.75, 1.0, 1.25 and 1.5. The damage must fall as armour rises, as the arithmetic says,
until the cap binds. If an existing scoring test already delivers a blow, put this there. Otherwise
`tests/scoring.test.mjs` can cover the arithmetic, and a small combat fixture can cover the path.

## Sweep

Run the protocol levels on the stone default, the plated build and the skeleton, each as its own
table. The columns to read: damage taken per bout by the modified side, parts ruined, and win rate
and d.

## Done when

- Armour is `live` with a measured range, and the cap is named and argued.
- The tables are recorded.
- If stone reads flat, the question about pass-through scaling is in the report to the owner.
- The fingerprint reads all `same` at 1.00.
