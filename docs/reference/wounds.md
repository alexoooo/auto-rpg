# Wounds

What the impact literature gives the rules of a blow (`watchBlows`, `src/combat/blows.ts`): how
stiff each part of a body is under a blunt load (`CONTACT_STIFFNESS`,
`src/core/bodies/human/tables/contact-stiffness.ts`), and what was found for a fist, a point and
an edge. Each paper's citation is its `SOURCES` entry (`src/core/sources.ts`); the rules
themselves are `src/combat/rulebook.ts` and `src/combat/share.ts`.
`node research/blow-shares.mjs` prints every stiffness and share from the specs.

## Stiffness

A surface's stiffness is one number, N/m: the force a blunt load pressed into it meets, over how
far it gives, the same at any speed, area or direction. A human figure reads its rows by what it
is made of (`HumanFigure.substance`): flesh, the Warrior and the Rogue, or bare bone, the
Skeleton.

| Row | N/mm | What was measured, and how | Source |
|---|---|---|---|
| head | 201 | The nasal bone of 24 male cadavers under a free-falling 3.2 kg impactor with a flat 6.45 cm² face, at 4 to 16 J. After a 6 mm toe the response has two slopes: 55 (SD 56) N/mm to 20 % of the peak force, the soft tissue's, then 201 (SD 118) from 20 to 80 %, the bone's, which is taken. | `cormier-2009`, Table 14 |
| upperTrunk, flesh | 17.0 | The intact chest of three cadavers under a 15.2 cm rigid hub pressed into the sternum at about 1 m/s, to 20 % of the chest's depth: 184.4, 173.3 and 152.3 N/cm, 170.0 in the mean. | `kent-2005`, Table 3 |
| upperTrunk, bone | 5.4 | The same three chests under the same hub with their skin, fat and muscle taken off and their organs out, the rib cage alone: 94.9, 36.2 and 31.2 N/cm, 54.1 in the mean. With the flesh off and the organs still in, 99.4. | `kent-2005`, Table 3 |
| middleTrunk, bone | 251 | Eight lumbar motion segments (L2-3 and L4-5 of four women, 17 to 58), two vertebrae with the disc and ligaments between them, moved ±0.5 mm front to back with no load down the spine: 251 (SE 42) N/mm. A joint's shear, not a struck vertebra's give ([Gaps](#gaps)); under 500 N down the spine it is 397 to 473. | `gardner-morse-2004`, Table 1 |
| lowerTrunk, bone | 135.9 | Ten isolated pelvic bones, nine of men, loaded on the iliac crest to 500 N at 5 mm/min: 206, 129, 211, 206, 155, 72, 46, 88, 141 and 105 N/mm, of which the mean is the table's; the paper gives none. Through the hip socket the same ten read 201 to 423. | `guillemot-1998`, Table 3 |
| thigh | 247.1 | Fifteen femurs of eight men bent to failure at mid-shaft, three-point, by a 12 mm impactor at about 1.2 m/s: the support load at failure, 4349 (SD 746) N, over the mid-bone deflection at failure, 17.6 (SD 3.8) mm. The division is the table's rule; the paper states no stiffness. | `funk-2004`, Results |
| hand | 122.3 | Isolated porcine second metacarpals in quasi-static three-point bending: 122.3 (SD 35.0) N/mm. A bone's bending, not a fist's contact stiffness ([Gaps](#gaps)). | `ochman-2011`, Results |
| foot | 1160 | The heel pads of limbs amputated for vascular disease, each still on most of its heel bone and cut from the leg, compressed in a servo-hydraulic machine to about 2 kN at 0.1 to 70 Hz: the stiffness at a load of the body's weight, 1160 (SD 170) kN/m, n = 5. The rate did not change it. The pad stiffens as it is loaded: one pad read 2.96 to 3.14 kN/mm at 1 kN. | `bennett-1990`, Results |

The other five rows are lent ([Gaps](#gaps)). The head's, the thigh's and the hand's are each a
bone's own reading, so flesh and bare bone share them, and they share the heel's, no heel bone
having been read without its pad. The two differ in the trunk alone. Of bare bone the spine and
the hip bone are each about as stiff as a long bone, and the rib cage is not: it bends, so bare
it gives three times what the chest its flesh and organs fill does, and takes the more of a
blow. Of bare bone three rows are lent, the arm's two and the shank's.

An item is rigid (a club, a buckler, a sword): it states no stiffness and takes no share of a
blow, and the part it strikes takes the whole. Two items that meet wound nobody.

## Gaps

`contact-stiffness-gaps`: where no study read gives a part's stiffness under a blunt load, it
takes a neighbour's whole.

| Row | Takes | Why that neighbour |
|---|---|---|
| middleTrunk | the upper trunk's | the nearest part measured; the abdomen is softer than the chest in every figure seen, none confirmed. Of flesh only |
| lowerTrunk | the middle trunk's | the same; a pelvis struck on its bone is stiffer. Of flesh only |
| upperArm, forearm, shank | the femur's | a long bone under flesh, bent across; the one such bone with a load and a deflection read |

Four rows are a study's value read as something it did not measure: **bare bone's middle trunk
is a lumbar joint's shear** (nothing was found for a vertebra struck across), **the hand's is a
pig's metacarpal in bending** (no human fist's stiffness against a surface was found), **the
head's is its face's**, the surface a blow is aimed at, and **the foot's is its heel's**. For the ball
of the foot nothing was found at a blow's loads, and no human metatarsal's bending stiffness.

The heel's is the heel alone. A sole struck with the leg behind it gives far more, the ankle and
the leg giving with it: 54.9 N/mm over the first 7 mm, then 633.8, in one cadaver leg under a
pendulum (Gallenberger et al. 2013, Figure 3). That give is the body's joints', which the physics
has, not the surface's.

## Shares

The surfaces that met are springs in series under one force, so each stores F²/2k: a surface's
share of a blow's energy is its compliance over the sum, the more the softer it is
(`energyShares`). So a fist on a head takes 0.62 of the blow, on a chest 0.12 and on a bare rib
cage 0.04; a club, rigid, takes none and what it strikes takes all.

## The fist

A bare fist that strikes flesh takes only what its share brings past a threshold
(`Rulebook.fist`): the energy a hand stores loaded to a knuckle's even chance of injury, F²/2k at
3.0 kN (`carpanen-2019`) on the hand's 122.3 N/mm, 36.8 J. It is a deductible: a share of 50 J
costs the hand 13.2 J's worth. Against an item (a club, a blade, armour) the hand takes its whole
share. A bare foot has the same threshold, so a stomp on a trunk, of which the foot stores 1.4 %,
costs it nothing below 2,500 J, and a kick on a leg, of which it stores 18 %, nothing below
210 J; a body that names no foot end, the reptile, spares no foot.

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
