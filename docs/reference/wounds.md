# Wounds

What the impact literature gives the rules of a blow (`watchBlows`, `src/combat/blows.ts`): how
stiff each part of a body is under a blunt load (`CONTACT_STIFFNESS`,
`src/core/bodies/human/tables/contact-stiffness.ts`), and what was found for a fist, a point and
an edge. Each paper's citation is its `SOURCES` entry (`src/core/sources.ts`); the rules
themselves are `src/combat/rulebook.ts` and `src/combat/share.ts`.
`node research/blow-shares.mjs` prints every stiffness and share from the specs.

## Stiffness

A surface's stiffness is one number, N/m: the force a blunt load pressed into it meets, over how
far it gives, the same at any speed, area or direction.

| Row | N/mm | What was measured, and how | Source |
|---|---|---|---|
| head | 201 | The nasal bone of 24 male cadavers under a free-falling 3.2 kg impactor with a flat 6.45 cm² face, at 4 to 16 J. After a 6 mm toe the response has two slopes: 55 (SD 56) N/mm to 20 % of the peak force, the soft tissue's, then 201 (SD 118) from 20 to 80 %, the bone's, which is taken. | `cormier-2009`, Table 14 |
| upperTrunk | 17.0 | The intact chest of three cadavers under a 15.2 cm rigid hub pressed into the sternum at about 1 m/s, to 20 % of the chest's depth: 184.4, 173.3 and 152.3 N/cm, 170.0 in the mean. | `kent-2005`, Table 3 |
| thigh | 247.1 | Fifteen femurs of eight men bent to failure at mid-shaft, three-point, by a 12 mm impactor at about 1.2 m/s: the support load at failure, 4349 (SD 746) N, over the mid-bone deflection at failure, 17.6 (SD 3.8) mm. The division is the table's rule; the paper states no stiffness. | `funk-2004`, Results |
| hand | 122.3 | Isolated porcine second metacarpals in quasi-static three-point bending: 122.3 (SD 35.0) N/mm. A bone's bending, not a fist's contact stiffness ([Gaps](#gaps)). | `ochman-2011`, Results |

The other six rows are lent ([Gaps](#gaps)). An item is rigid (a club, a buckler, a sword): it states no stiffness and takes no
share of a blow, and the part it strikes takes the whole. Two items that meet wound nobody.

## Gaps

`contact-stiffness-gaps`: where no study read gives a part's stiffness under a blunt load, it
takes a neighbour's whole.

| Row | Takes | Why that neighbour |
|---|---|---|
| middleTrunk | the upper trunk's | the nearest part measured; the abdomen is softer than the chest in every figure seen, none confirmed |
| lowerTrunk | the middle trunk's | the same; a pelvis struck on its bone is stiffer |
| upperArm, forearm, shank | the femur's | a long bone under flesh, bent across; the one such bone with a load and a deflection read |
| foot | the hand's | the same kind of bones |

Two rows are a study's value read as something it did not measure: **the hand's is a pig's
metacarpal in bending** (no human fist's stiffness against a surface was found), and **the head's
is its face's**, the surface a blow is aimed at.

## Shares

The surfaces that met are springs in series under one force, so each stores F²/2k: a surface's
share of a blow's energy is its compliance over the sum, the more the softer it is
(`energyShares`). So a fist on a head takes 0.62 of the blow and on a chest 0.12; a club, rigid,
takes none and what it strikes takes all.

## The fist

A bare fist that strikes flesh takes only what its share brings past a threshold
(`Rulebook.fist`): the energy a hand stores loaded to a knuckle's even chance of injury, F²/2k at
3.0 kN (`carpanen-2019`) on the hand's 122.3 N/mm, 36.8 J. It is a deductible: a share of 50 J
costs the hand 13.2 J's worth. Against an item (a club, a blade, armour) the hand takes its whole
share. A bare foot has the same threshold, so a stomp on a trunk, of which the foot stores 12 %,
costs it nothing below 300 J; a body that names no foot end, the reptile, spares no foot.

## Mechanisms

Blunt, an edge and an axe are priced by the joule, blunt 1 : an edge 5.7 : an axe 7.7
(`MECHANISM_PRICE`). A held point wounds by its depth (`pointWound`):

    depth = min(length, max(0, energy - breach) / resistance)
    wound = through x full life x min(1, depth / thickness)

What the literature gives them:

- **The skin's breach, 0.25 J, and the resistance, 20 N**: the energy and force for a knife to
  penetrate a skin simulant, 0.17 to 0.56 J and 18 to 36 N over four household knives
  (`gilchrist-2008`). The force bounds the tissue past the skin from above: once the skin is
  perforated, further penetration meets negligible resistance (Knight 1975, as Horsfall et al.
  1999 read it).
- **People stab** at 28.1 J mean, 6.0 m/s, underarm, and up to 115 J overarm (Horsfall et al.
  1999; [the thrust's bar](human-strike-reference.md#3a-one-handed-thrust-a-persons-stab)).
- **An edge is plausible on soft tissue**, and only 1.5 to 3.4 times blunt on bone (Gentile et al.
  2019; Gaudet et al. 2020).
- **An axe against a sword** is supported by nothing found either way.
