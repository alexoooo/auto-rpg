# Wounds

What a blow costs each surface that meets in it: how stiff each part of a body is under a blunt
load, who takes what of a blow by that, and what each part holds, beside what the impact
literature measured. The rule is `watchBlows` (`src/core/rules/blows.ts`); the shares are
`energyShares` (`src/core/rules/share.ts`); the table is `CONTACT_STIFFNESS`
(`src/core/human/tables/contact-stiffness.ts`).

```powershell
node research/blow-shares.mjs
```

prints the tables of Stiffness, Shares, Sensitivity and Tolerances from the specs.

## Stiffness

A surface's stiffness is one number, N/m: the force a blunt load pressed into it meets, over how
far it gives. It does not change with speed, with the area pressed or with direction. Each value
was read in its paper, at the table or the passage its `Quantity` names.

| Row | N/mm | What was measured, and how | Source |
|---|---|---|---|
| head | 201 | The nasal bone of 24 male cadavers under a free-falling 3.2 kg impactor with a flat 6.45 cm² face, at 4 to 16 J. The response has two slopes after a 6 mm toe: 55 (SD 56) N/mm to 20 % of the peak force, then 201 (SD 118) from 20 to 80 %. The second is taken: it is the bone's, the first the soft tissue's over it. | `cormier-2009`, Table 14 |
| upperTrunk | 17.0 | The intact chest of three cadavers under a 15.2 cm rigid hub pressed into the sternum at about 1 m/s, to 20 % of the chest's depth: 184.4, 173.3 and 152.3 N/cm, 170.0 in the mean. | `kent-2005`, Table 3 |
| thigh | 247.1 | Fifteen femurs of eight men bent to failure at mid-shaft, three-point, by a 12 mm impactor at about 1.2 m/s: the summed support load at failure, 4349 (SD 746) N, over the mid-bone deflection at failure, 17.6 (SD 3.8) mm. The paper states no stiffness; the division is the table's rule. | `funk-2004`, Results |
| hand | 122.3 | The second metacarpals of pigs, isolated, in quasi-static three-point bending: the intact bones' bending stiffness, 122.3 (SD 35.0) N/mm. A bone's bending, and no fist's contact stiffness: see Gaps. | `ochman-2011`, Results |

The other six rows are lent: see Gaps.

Read and not used:

- **The skull's vault**: 812 (SD 139) N/mm quasi-static and 4023 (SD 541) dynamic, over 12 intact
  heads (Yoganandan et al. 1995, J Neurotrauma 12(4):659-668, its abstract). The head is one
  surface, and its face's is taken, since a fighter's blow is aimed at the face; the vault is the
  head's second surface when a segment takes several.
- **The frontal bone**: 331 (SD 180) then 731 (SD 461) N/mm under the same impactor as the nose
  (`cormier-2009`, Table 10).
- **The chest as a fitted spring**: 26.3 N/mm (Lobdell et al. 1973), found only quoted by a later
  paper, and a model's spring, not a measurement.
- **The abdomen**: no number was found in a paper that could be opened. The 21 to 70 N/mm
  earlier attributed to Cavanaugh 1986 and Hardy 2001 was not confirmed.
- **Bare long bones in short-span bending**: the humerus 1470, the ulna 1110 and the radius 700
  N/mm (Singh et al. 2019, J Appl Biomater Funct Mater 17(2), Table 3), on defleshed 120 mm
  sections at 1 mm a minute: not a limb struck.
- **The heel pad**: about 900 N/mm at body weight (Aerts et al. 1995, J Biomech 28:1299-1308,
  its abstract), on isolated pads.

**An item with no stated surface is rigid**: it takes no share of a blow. White ash across its
grain crushes at about 8 MPa and bone fractures at about 10 MPa of contact pressure, so a club
is not clearly rigid on a small patch; recorded, and the club's blow is the struck part's whole
by it.

## Gaps

`contact-stiffness-gaps` (`src/core/sources.ts`), proposed, for the owner to confirm. Where no
study read gives a part's stiffness under a blunt load, it takes a neighbour's whole:

| Row | Takes | Why that neighbour |
|---|---|---|
| middleTrunk | the upper trunk's, 17.0 N/mm | the nearest part measured; the abdomen is softer than the chest in every figure seen, none of them confirmed |
| lowerTrunk | the middle trunk's | the same; a pelvis struck on its bone is stiffer |
| upperArm, forearm, shank | the femur's, 247.1 N/mm | a long bone under flesh, bent across; the one such bone with a load and a deflection read |
| foot | the hand's, 122.3 N/mm | the same kind of bones |

Two rows are a study's value read as something it did not measure, and the decision names them:

- **The hand's is a pig's metacarpal in bending.** No stiffness of a human fist against a
  surface was found.
- **The head's is its face's**, until the head is two surfaces.

A lent row is a `derive` of the row it borrows and of the decision's `1`, so its provenance
names the paper and the decision both.

## Shares

The surfaces that met are springs in series under one force, so each stores F²/2k: a surface's
share of a blow's energy is its compliance over the sum. A surface takes the more of a blow the
softer it is beside the other.

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

So a bare fist is a poor weapon against a head, which gives it back five eighths of the blow,
and a fair one against a trunk; a club costs its holder nothing anywhere; a bare hand that meets
a club takes the whole blow; and two clubs meeting wound nobody. Nothing authored says so.

## Sensitivity

**The shares.** A surface's share where it is half and twice as stiff as the table has it:

| Surface varied | Met by | Its share at half its stiffness | As it is | At twice |
|---|---|---|---|---|
| hand | head | 0.767 | 0.622 | 0.451 |
| hand | upper trunk | 0.218 | 0.122 | 0.065 |
| hand | forearm | 0.802 | 0.669 | 0.503 |
| foot | thigh | 0.802 | 0.669 | 0.503 |
| foot | hand | 0.667 | 0.500 | 0.333 |
| middle or lower trunk | hand | 0.935 | 0.878 | 0.782 |
| upper arm, forearm or shank | hand | 0.497 | 0.331 | 0.198 |
| shank | foot | 0.497 | 0.331 | 0.198 |

A factor of two in a gap moves a share by 0.06 to 0.17. The hand's is the one that decides
most: a fist on a head costs the puncher from 45 to 77 % of the blow across a factor of four.

**The bouts.** Node, the core world, Rapier, 120 Hz, each side's balance its character's: every
ordered pair of the three bodies at gaps of 3, 3.5, 4, 4.5 and 5 m, nothing in either right
hand, with both hands' surfaces half, once and twice as stiff
(`node research/bout-baseline.mjs --gaps 3,3.5,4,4.5,5 --held empty --hand 0.5`, and `--hand 2`).
Wounds change no bout until one decides it and none of these is decided by a wound, so the 45
bouts are the same bouts in all three: every ending, second and blow is the same, and so is what
the two sides lose together, since the two shares sum to one. What moves is who loses it:

| Left | Right | HP a bout the blows took | Of it, a side's own bare hand in the blow: hand at half | As it is | At twice |
|---|---|---|---|---|---|
| Warrior | Rogue | 0.247 | 0.083 | 0.066 | 0.049 |
| Warrior | Skeleton | 0.231 | 0.032 | 0.026 | 0.020 |
| Rogue | Rogue | 0.178 | 0.027 | 0.022 | 0.017 |
| Rogue | Skeleton | 0.318 | 0.064 | 0.052 | 0.038 |
| Skeleton | Rogue | 0.187 | 0.024 | 0.021 | 0.018 |
| Skeleton | Skeleton | 0.147 | 0.030 | 0.025 | 0.019 |
| every matchup, 45 bouts | | 0.145 | 0.029 | 0.024 | 0.018 |

One hand was emptied by a blow of its own in each of the three, in the same bout of the Warrior
against the Rogue, and none came off. The three matchups with the Warrior on the right are left out of
the rows and counted in the last: its 15 bouts end at 2.9 s before any touch
([bouts.md](bouts.md#a-blow-has-two-sides)). With the club in every right hand the hands' factor
changes less still: only a left hand is bare.

## Tolerances

**What a part tolerates is the pool's rule** (`partHitPoints`, `src/core/rules/pool.ts`): its
cross-section's share of the body's hit points, times the unit. No part has a tolerance of its
own. The energy that empties each part, which a blow must bring to that surface as its share, at
138.26 J a hit point:

| Part | Warrior and skeleton (6 HP): kg | HP | J | Rogue (4 HP): kg | HP | J |
|---|---|---|---|---|---|---|
| head | 5.48 | 0.446 | 61.6 | 3.85 | 0.291 | 40.2 |
| upperTrunk | 12.61 | 0.776 | 107.4 | 8.90 | 0.508 | 70.3 |
| middleTrunk | 12.90 | 0.788 | 109.0 | 8.44 | 0.491 | 67.9 |
| lowerTrunk | 8.82 | 0.612 | 84.6 | 7.18 | 0.441 | 60.9 |
| upperArm | 2.14 | 0.238 | 32.9 | 1.47 | 0.153 | 21.2 |
| forearm | 1.28 | 0.169 | 23.4 | 0.79 | 0.102 | 14.0 |
| hand | 0.48 | 0.088 | 12.2 | 0.32 | 0.056 | 7.7 |
| thigh | 11.19 | 0.717 | 99.1 | 8.51 | 0.494 | 68.3 |
| shank | 3.42 | 0.325 | 45.0 | 2.77 | 0.234 | 32.3 |
| foot | 1.08 | 0.151 | 20.9 | 0.74 | 0.097 | 13.4 |

A part comes off half its hit points past empty (`Rulebook.severMargin`): a Warrior's hand at
18.3 J of its own share, which against a head is a blow of 29 J.

Beside them, what the literature gives a part before it breaks. "Mine" is arithmetic on a
paper's numbers, a spring's ½ F x or F²/2k, and no paper's own figure:

| Part | The literature | J | The pool's, Warrior, J |
|---|---|---|---|
| head, the vault | failure at 33.5 J quasi-static and 28.0 J dynamic, 12 intact heads (Yoganandan et al. 1995, its abstract) | 28 to 34 | 61.6 |
| head, the nose | an even chance of fracture at 450 to 850 N (Cormier et al. 2010, Ann Adv Automot Med 54:3-14); over the dissertation's toe and two slopes that is 1.2 to 2.5 J (mine) | 1 to 3 | 61.6 |
| head, the frontal bone | an even chance of fracture at 1885 to 2405 N (Cormier et al. 2011, J Biomech Eng 133(2):021004, its abstract); at 731 N/mm, 2.4 to 4.0 J (mine) | 2 to 4 | 61.6 |
| thigh | 4349 N at 17.6 mm (`funk-2004`): 38 J (mine) | 38 | 99.1 |
| hand | an even chance of injury at 3.0 kN on the knuckle joints (Carpanen et al. 2019, J Mech Behav Biomed Mater 97:306-311, its abstract); at 122.3 N/mm, 37 J (mine, a human load on a pig's stiffness) | 37 | 12.2 |
| trunk | none read: `kent-2005` loads a chest to 20 % of its depth and breaks nothing | - | 107.4 |

A boxer's straight punch is 3427 N at 9.14 m/s with an effective mass of 2.9 kg (Walilko, Viano
and Bir 2005, Br J Sports Med 39:710-719, not opened at its source for this record): 121 J in the
fist as it lands (mine).

Against these the pool's vault and thigh are within a factor of three, on the tough side; its
head is far tougher than a face; and its hand is about a third as tough as a knuckle. A
tolerance of a part's own is not built: the pool's rule stands, by the owner's answer.

## Mechanisms

The rulebook's prices are blunt 1 : an edge 5.7 : a point 33, a joule (`MECHANISM_PRICE`,
`src/core/rules/rulebook.ts`). Every blow is blunt until an item states an edge or a point.
Against the literature, for the plan that brings one:

- **A point is in range.** People stab at up to 64 J underarm and 115 J overarm (Horsfall et al.
  1999); skin is breached at about 0.25 J by a sharp knife (Gilchrist et al. 2008).
- **An edge is plausible on soft tissue**, and only 1.5 to 3.4 times blunt on bone (Gentile et
  al. 2019; Gaudet et al. 2020).
- **An axe against a sword** is supported by nothing found either way.

None of these five was opened at its source for this record: each is read again before a number
of it enters a spec.
