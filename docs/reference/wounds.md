# Wounds

What a blow costs each surface that meets in it: how stiff each part of a body is under a blunt
load (`CONTACT_STIFFNESS`, `src/core/human/tables/contact-stiffness.ts`), who takes what of a
blow by that (`energyShares`, `src/core/rules/share.ts`), what a bare fist or foot is spared, and
how deep a held point goes, from the impact literature. The rule is `watchBlows`
(`src/core/rules/blows.ts`). `node research/blow-shares.mjs` prints the Stiffness and Shares
tables from the specs.

## Stiffness

A surface's stiffness is one number, N/m: the force a blunt load pressed into it meets, over how
far it gives, the same at any speed, area or direction. Each value is read in its paper, at the
table or passage its `Quantity` names.

| Row | N/mm | What was measured, and how | Source |
|---|---|---|---|
| head | 201 | The nasal bone of 24 male cadavers under a free-falling 3.2 kg impactor with a flat 6.45 cm² face, at 4 to 16 J. After a 6 mm toe the response has two slopes: 55 (SD 56) N/mm to 20 % of the peak force, the soft tissue's, then 201 (SD 118) from 20 to 80 %, the bone's, which is taken. | `cormier-2009`, Table 14 |
| upperTrunk | 17.0 | The intact chest of three cadavers under a 15.2 cm rigid hub pressed into the sternum at about 1 m/s, to 20 % of the chest's depth: 184.4, 173.3 and 152.3 N/cm, 170.0 in the mean. | `kent-2005`, Table 3 |
| thigh | 247.1 | Fifteen femurs of eight men bent to failure at mid-shaft, three-point, by a 12 mm impactor at about 1.2 m/s: the support load at failure, 4349 (SD 746) N, over the mid-bone deflection at failure, 17.6 (SD 3.8) mm. The division is the table's rule; the paper states no stiffness. | `funk-2004`, Results |
| hand | 122.3 | Isolated porcine second metacarpals in quasi-static three-point bending: 122.3 (SD 35.0) N/mm. A bone's bending, not a fist's contact stiffness ([Gaps](#gaps)). | `ochman-2011`, Results |

The other six rows are lent ([Gaps](#gaps)). **An item with no stated surface is rigid**: it
takes no share of a blow, and the part it strikes takes the whole.

## Gaps

`contact-stiffness-gaps` (`src/core/sources.ts`): where no study read gives a part's stiffness
under a blunt load, it takes a neighbour's whole. A lent row is a `derive` of the row it borrows
and of the gap's `1`, so its provenance names the paper and the gap both.

| Row | Takes | Why that neighbour |
|---|---|---|
| middleTrunk | the upper trunk's, 17.0 N/mm | the nearest part measured; the abdomen is softer than the chest in every figure seen, none confirmed |
| lowerTrunk | the middle trunk's | the same; a pelvis struck on its bone is stiffer |
| upperArm, forearm, shank | the femur's, 247.1 N/mm | a long bone under flesh, bent across; the one such bone with a load and a deflection read |
| foot | the hand's, 122.3 N/mm | the same kind of bones |

Two rows are a study's value read as something it did not measure: **the hand's is a pig's
metacarpal in bending** (no human fist's stiffness against a surface was found), and **the head's
is its face's**, the surface a blow is aimed at.

## Shares

The surfaces that met are springs in series under one force, so each stores F²/2k: a surface's
share of a blow's energy is its compliance over the sum, the more the softer it is. A rigid
surface's share is 0; two rigid surfaces share nothing.

| Meeting | First's share | Second's share |
|---|---|---|
| hand, head | 0.622 | 0.378 |
| hand, upper trunk | 0.122 | 0.878 |
| hand, hand | 0.500 | 0.500 |
| hand, forearm | 0.669 | 0.331 |
| hand, thigh | 0.669 | 0.331 |
| foot, thigh | 0.669 | 0.331 |
| foot, shank | 0.669 | 0.331 |
| head, head | 0.500 | 0.500 |
| head, upper trunk | 0.078 | 0.922 |
| forearm, upper trunk | 0.064 | 0.936 |
| forearm, forearm | 0.500 | 0.500 |
| club, head | 0 | 1 |
| club, hand | 0 | 1 |
| club, club | 0 | 0 |

## The fist

**A bare fist that strikes flesh takes only what its share brings past a threshold**
(`Rulebook.fist`, `src/core/rules/rulebook.ts`): the energy a hand stores loaded to a knuckle's
even chance of injury, F²/2k at 3.0 kN (`carpanen-2019`, the metacarpophalangeal joints' axial
force at 50 % risk) on the hand's 122.3 N/mm (`CONTACT_STIFFNESS.hand`), 36.8 J, all of it the
threshold (`owner-fist-threshold`). It is a deductible: a share of 50 J costs the hand 13.2 J's
worth. It holds where a segment with hand poses meets a body's own surface and neither side holds
an item there; against an item (a club, a blade, armour) the hand takes its whole share.

**A bare foot has the fist's threshold** (`owner-foot-threshold`): a foot is a segment its body
names as a foot end (`spec.ends`), spared as a hand is. A foot shares a blow as a hand does (its
stiffness is the hand's, [Gaps](#gaps)), so a stomp on a trunk, of which the foot stores 12 %,
costs it nothing below 300 J. A body that names no foot end, the reptile, spares no foot.

## Mechanisms

Blunt, an edge and an axe are priced by the joule, blunt 1 : an edge 5.7 : an axe 7.7
(`MECHANISM_PRICE`, `src/core/rules/rulebook.ts`). Every blow is blunt until an item states an
edge or a point. A held point wounds by its depth (`pointWound`, `owner-point-depth`):

    depth = min(length, max(0, energy - breach) / resistance)
    wound = through x full life x min(1, depth / thickness)

- `energy` is the struck side's share of the blow (`energyShares`).
- `breach` is the sum over the layers over every part (`Rulebook.layers`): the skin's 0.25 J, the
  energy for a knife to penetrate a skin simulant, 0.17 to 0.56 J over four household knives
  (Gilchrist et al. 2008, `gilchrist-2008`). A point short of a layer meets as blunt with the
  energy that reached it.
- `resistance` is 20 N (`Rulebook.resistance`): the force those knives penetrated the skin simulant
  at, 18 to 36 N (Gilchrist et al. 2008). It bounds the tissue past the skin from above: once the
  skin is perforated, further penetration meets negligible resistance (Knight 1975, as Horsfall et
  al. 1999 read it).
- `length` is the point's own `depth` (`SurfaceSpec.directed`, `src/core/items/sword.ts`): the
  short sword's tip to the blade's base.
- `thickness` is the struck part's least width (`partThickness`, `src/core/rules/pool.ts`): a
  capsule's diameter, a box's least side, a hull's extent along its least principal axis.
- `through` is a quarter (`Rulebook.through`); the wound then costs life as any blow does, at its
  part's group's factor.

A point meeting an item meets it blunt. An anatomical point (the reptile's bite) wounds by its
press (`pointLoadDamage`), not by this rule.

The literature behind the prices and the thrust:

- **People stab** at 28.1 J mean, 6.0 m/s, underarm (men, 142 stabs; 95th percentile 54.9 J,
  8.3 m/s; at most 63.4 J), and up to 115 J overarm (Horsfall et al. 1999, Table 1;
  [the thrust's bar](human-strike-reference.md#3a-one-handed-thrust-a-persons-stab)).
- **An edge is plausible on soft tissue**, and only 1.5 to 3.4 times blunt on bone (Gentile et al.
  2019; Gaudet et al. 2020).
- **An axe against a sword** is supported by nothing found either way.
