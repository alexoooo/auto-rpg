# Wounds

What a blow costs each surface that meets in it: how stiff each part of a body is under a blunt
load (`CONTACT_STIFFNESS`, `src/core/human/tables/contact-stiffness.ts`), who takes what of a
blow by that (`energyShares`, `src/core/rules/share.ts`), and what each part holds, beside what
the impact literature measured. The rule is `watchBlows` (`src/core/rules/blows.ts`).
`node research/blow-shares.mjs` prints the tables of Stiffness, Shares and Sensitivity from the
specs, and the energy a blow on each part must bring ([Tolerances](#tolerances)).

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
takes no share of a blow. White ash across its grain crushes at about 8 MPa and bone fractures at
about 10 MPa of contact pressure, so a club is not clearly rigid on a small patch; the club's
blow is the struck part's whole by the rule.

Read and not used:

- **The skull's vault**: 812 (SD 139) N/mm quasi-static, 4023 (SD 541) dynamic, 12 intact heads
  (Yoganandan et al. 1995, J Neurotrauma 12(4):659-668, abstract). The face's is taken, since a
  blow is aimed at the face; the vault is the head's second surface when a segment takes several.
- **The frontal bone**: 331 (SD 180) then 731 (SD 461) N/mm, the nose's impactor (`cormier-2009`,
  Table 10).
- **The chest as a fitted spring**: 26.3 N/mm (Lobdell et al. 1973), found only quoted, and a
  model's spring.
- **The abdomen**: no number found in a paper that could be opened; the 21 to 70 N/mm attributed
  to Cavanaugh 1986 and Hardy 2001 is not confirmed.
- **Bare long bones in short-span bending**: humerus 1470, ulna 1110, radius 700 N/mm (Singh et
  al. 2019, J Appl Biomater Funct Mater 17(2), Table 3), defleshed 120 mm sections at 1 mm a
  minute: not a limb struck.
- **The heel pad**: about 900 N/mm at body weight (Aerts et al. 1995, J Biomech 28:1299-1308,
  abstract), on isolated pads.

## Gaps

`contact-stiffness-gaps` (`src/core/sources.ts`): where no study read gives a part's stiffness
under a blunt load, it takes a neighbour's whole. A lent row is a `derive` of the row it borrows
and of the decision's `1`, so its provenance names the paper and the decision both.

| Row | Takes | Why that neighbour |
|---|---|---|
| middleTrunk | the upper trunk's, 17.0 N/mm | the nearest part measured; the abdomen is softer than the chest in every figure seen, none confirmed |
| lowerTrunk | the middle trunk's | the same; a pelvis struck on its bone is stiffer |
| upperArm, forearm, shank | the femur's, 247.1 N/mm | a long bone under flesh, bent across; the one such bone with a load and a deflection read |
| foot | the hand's, 122.3 N/mm | the same kind of bones |

Two rows are a study's value read as something it did not measure, and the decision names them:
**the hand's is a pig's metacarpal in bending** (no human fist's stiffness against a surface was
found), and **the head's is its face's**, until the head is two surfaces.

## Shares

The surfaces that met are springs in series under one force, so each stores F²/2k: a surface's
share of a blow's energy is its compliance over the sum, the more the softer it is.

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

A bare fist is a poor weapon against a head, which gives it back five eighths of the blow, and a
fair one against a trunk; a club costs its holder nothing; a bare hand that meets a club takes the
whole blow; two clubs meeting wound nobody. Nothing authored says so.

## Sensitivity

**The shares.** A surface's share at half and twice the table's stiffness:

| Surface varied | Met by | Half | As it is | Twice |
|---|---|---|---|---|
| hand | head | 0.767 | 0.622 | 0.451 |
| hand | upper trunk | 0.218 | 0.122 | 0.065 |
| hand | forearm | 0.802 | 0.669 | 0.503 |
| foot | thigh | 0.802 | 0.669 | 0.503 |
| foot | hand | 0.667 | 0.500 | 0.333 |
| middle or lower trunk | hand | 0.935 | 0.878 | 0.782 |
| upper arm, forearm or shank | hand | 0.497 | 0.331 | 0.198 |
| shank | foot | 0.497 | 0.331 | 0.198 |

A factor of two in a gap moves a share by 0.06 to 0.17. The hand's decides most: a fist on a head
costs the puncher 45 to 77 % of the blow across a factor of four.

**The bouts.** Every ordered pair of the three bodies at gaps 3 to 5 m by 0.5, empty-handed, both
hands half, once and twice as stiff (`node research/bout-baseline.mjs --gaps 3,3.5,4,4.5,5 --held
empty --hand 0.5`, and `--hand 2`; `--unit 138.26`; Node core world, 120 Hz, each side's balance
its character's). No bout is decided by a wound, so the 45 bouts are the same in all three, and
what the sides lose together is the same; what moves is who loses it:

| Left | Right | HP a bout the blows took | Of it, a side's own bare hand: hand half / as is / twice |
|---|---|---|---|
| Warrior | Rogue | 0.247 | 0.083 / 0.066 / 0.049 |
| Warrior | Skeleton | 0.231 | 0.032 / 0.026 / 0.020 |
| Rogue | Rogue | 0.178 | 0.027 / 0.022 / 0.017 |
| Rogue | Skeleton | 0.318 | 0.064 / 0.052 / 0.038 |
| Skeleton | Rogue | 0.187 | 0.024 / 0.021 / 0.018 |
| Skeleton | Skeleton | 0.147 | 0.030 / 0.025 / 0.019 |
| every matchup, 45 bouts | | 0.145 | 0.029 / 0.024 / 0.018 |

The matchups with the Warrior on the right are counted only in the last row: they end at 2.9 s
before any touch ([bouts.md](bouts.md#a-blow-has-two-sides)). With a club in every right hand the
hands' factor changes less still: only a left hand is bare.

## Unit

**One hit point is 100 J of blunt blow** (`Rulebook.unit`, `owner-damage-unit`), and every
mechanism keeps its ratio to blunt. The owner, 2026-10-01: "should we just make it 100J what's so
special about 138?". The unit had been the Warrior's strongest one-handed club blow as measured
then, 138.26 J. The club's best blow stays a measurement (`CLUB_BEST`,
`src/core/rules/rulebook.ts`, `core-club-unit`): 138.23 J, worth 1.38 hit points
([blows.md](blows.md#the-clubs-best-blow)).

The owner's words name the number and not what becomes of the bodies' hit points. Of the three
options, the rulebook has the first, and the owner accepted it (2026-10-24):

| Option | In the game |
|---|---|
| **100 J, hit points as they are** | Every body holds 28 % fewer joules: the Warrior's 6 HP is 600 J where it was 830 J, the Rogue's 4 is 400 J where 553 J. The club's best blow empties a Warrior's head (0.446 HP) three times over, where 2.2 times. |
| 100 J, hit points raised to hold the joules | No fight changes; the numbers shown do: Warrior 8.3, Rogue 5.5. |
| 138.26 J kept | Nothing changes; the unit is a measurement, and moves if the club's blow is measured again. |

What the first does to the arena's bouts (`node research/bout-baseline.mjs --gaps
3,3.5,4,4.5,5`, and `--unit 138.26` on the same tree; the club in every right hand; Node core
world, 120 Hz):

| Over 45 bouts | 138.26 J a hit point | 100 J |
|---|---|---|
| Bouts by ending | fallen 33, severed 8, fatal 4 | fallen 31, severed 12, fatal 2 |
| Bout time, s | 633 | 601 |
| HP a bout the blows took, both sides | 0.419 | 0.543 |
| Bouts with another winner or another second | - | 2 |

A wound moves no body, so a bout differs only from the step a wound decides it: 43 of 45 keep
their winner and second. Bare-handed all 45 are the same bouts, their blows taking 0.200 HP a
bout where 0.145. The rows: [bouts.md](bouts.md#a-hit-point-is-100-j).

## Life

**One life bar, which is the truth, and a bar on each limb** (`src/core/rules/pool.ts`,
`owner-life`). The owner, 2026-11-01: health should be easy to understand and familiar to
players, and keep severing like Die by the Sword; of the options put, B, the life bar and a bar on
each limb drawn on the body diagram.

- **Life** is the body's hit points (Warrior 6, Rogue 4, `owner-hp-pool`). A blow takes its damage
  from life times its part's group's factor (`Rulebook.life`, `lifeFactor`). A page's bar is life
  over full life; no living body reads it empty.
- **Each segment is in one group** (`WoundSpec`, `woundGroups`): vital, a limb (`LimbSpec`) or the
  trunk, every segment in neither. A vital part named `whole` never comes off; nor does the trunk.
- **A limb's bar** is its share of full life. A blow on the limb takes its whole damage from the bar
  too; at 0 the limb is crippled, and further blows take only life. A crippled limb is weaker: the
  muscles of every joint whose child is in it keep `Rulebook.crippled` of their peak torques
  (`crippleLimb`).
- **A heavy cut takes a limb off**: an edge or axe blow worth at least `Rulebook.severBlow` of the
  limb's full bar that leaves the bar at 0 takes off the struck segment and every one beyond it. A
  lethal edge or axe blow on a vital part not `whole` takes it off the same way. A cut costs
  `Rulebook.severLoss` of full life beside the blow. A blunt blow or a lighter cut cripples; a point
  never cuts. The part cut off falls free with what its hand holds (`cutOff`): its muscles give
  nothing, it is no longer the body's to itself or to the others, and none of its blows count.
- **A body is out** when its life is spent (`slain`), a vital part comes off (`beheaded`), or a limb
  whose loss is `out` loses any part (`maimed`). The first ending stands.

The defaults, the owner's to change once seen in play; a share is of full life, so it holds for
every body:

| Number | Default | What it means for the Warrior (6 HP) |
|---|---|---|
| `Rulebook.life` | vital 2, trunk 1, limb 0.5 | the club's best blow (1.38 HP) takes 2.76 HP on the head, 1.38 on the trunk, 0.69 on a limb: three to the head kill, five to the trunk |
| a human's limbs | arm 0.25 of full life, `fights on`; leg 0.35, `out` | two of the club's best blows cripple an arm or a leg; a body never stands on one leg |
| `Rulebook.crippled` | 0.5 | a crippled leg limps: walking at 1 m/s (Node stand, Rapier, 120 Hz, the Warrior, no assist), the weak leg swung 0.46 s against 0.29 s and stepped 0.61 m against 0.34 m; asked 1.4 m/s it went 0.80 m/s against 1.25 |
| `Rulebook.severBlow` | 0.5 | a cut worth half an arm's bar (0.75 HP, 13 J of an edge) takes off an arm it empties |
| `Rulebook.severLoss` | 0.15 | a cut costs 0.9 HP |
| `Rulebook.through` | 0.25 | a point through the head takes 3 HP, through the trunk 1.5 |

The Skeleton's groups follow its family's intent (the owner, 2026-09-22: decapitation not fatal, the
ribcage is, losing a leg ends it, limbs come off easily): its ribcage (`upperTrunk`) vital and
`whole`; its head a limb (0.2, `fights on`); its arms 0.15 (`fights on`) and legs 0.25 (`out`).
A quadruped's (`assets/reptile/body.json`, and the rat's and the authored body's, which share its
layout): head and jaw vital; each leg 0.2 (`out`); its tail 0.15 (`fights on`).

Decisions the owner may reverse: the numbers; that a limb's blows count half to life; that losing a
leg ends the fight (Die by the Sword lets a body hop); that a cut costs a fixed loss and does not
bleed.

## Tolerances

**What each blow does under the defaults** ([Life](#life)), from the rules (`blowDamage`,
`pointWound`, `lifeFactor`, `partThickness`), Node: the club's best blow (`CLUB_BEST`, 138.23 J
blunt, 1.38 HP), the sword's measured cut at 15 and 20 J and thrust at 25 and 28 J
([held blows](held-blows.md)), each with the struck share 1. A cell is the life taken, and on a
limb, after the slash, what the limb's bar loses; the Warrior's limb bars are an arm's 1.50 HP and a
leg's 2.10:

| Part | Group | Thickness, m | Club's best | Cut 15 J | Cut 20 J | Thrust 25 or 28 J |
|---|---|---:|---|---|---|---|
| head | vital | 0.183 | 2.76 | 1.72 | 2.29 | 3.00, through |
| upper, middle, lower trunk | trunk | 0.215 to 0.261 | 1.38 | 0.86 | 1.15 | 1.50, through |
| upper arm, forearm, hand | arm | 0.053 to 0.107 | 0.69 / 1.38 | 0.43 / 0.86 | 0.57 / 1.15 | 0.75 / 1.50, through |
| thigh, shank, foot | leg | 0.098 to 0.190 | 0.69 / 1.38 | 0.43 / 0.86 | 0.57 / 1.15 | 0.75 / 1.50, through |

So three of the club's best blows on the head kill a Warrior, where two leave it 0.48 HP; a
thrust through the head takes half its life. A 15 J cut takes off an arm whose bar it
empties (0.86 is past half the arm's 1.50), and a leg's only at 20 J (1.15 past 1.05). A thrust
empties an arm's bar at once, but a point never cuts. The Rogue's (4 HP) are the same blows on
two-thirds of the life and bars: its head is through past 3.1 J, its arm's bar 1.00. The
Skeleton's head is a limb (bar 1.20), its ribcage vital (2.76 a club's best). The energy that
spends a whole body's life on a part, and that empties its limb's bar, prints from
`node research/blow-shares.mjs`: the Warrior's head 300 J of blunt blow, its trunk 600 J, an arm's
bar 150 J and a leg's 210 J.

What the literature gives a part before it breaks. "Mine" is arithmetic on a paper's numbers (a
spring's ½ F x or F²/2k), no paper's own figure:

| Part | The literature | J | The rules', Warrior: to spend its life (head) or empty its limb's bar, J |
|---|---|---|---|
| head, the vault | failure at 33.5 J quasi-static and 28.0 J dynamic, 12 intact heads (Yoganandan et al. 1995, abstract) | 28 to 34 | 300 |
| head, the nose | an even chance of fracture at 450 to 850 N (Cormier et al. 2010, Ann Adv Automot Med 54:3-14); over the dissertation's toe and two slopes, 1.2 to 2.5 J (mine) | 1 to 3 | 300 |
| head, the frontal bone | an even chance of fracture at 1885 to 2405 N (Cormier et al. 2011, J Biomech Eng 133(2):021004, abstract); at 731 N/mm, 2.4 to 4.0 J (mine) | 2 to 4 | 300 |
| thigh | 4349 N at 17.6 mm (`funk-2004`): 38 J (mine) | 38 | 210 |
| hand | an even chance of injury at 3.0 kN on the knuckle joints (Carpanen et al. 2019, J Mech Behav Biomed Mater 97:306-311, abstract); at 122.3 N/mm, 37 J (mine, a human load on a pig's stiffness) | 37 | 150 |
| trunk | none read: `kent-2005` breaks nothing at 20 % of the chest's depth | - | 600 |

A boxer's straight punch is 3427 N at 9.14 m/s with an effective mass of 2.9 kg (Walilko, Viano
and Bir 2005, Br J Sports Med 39:710-719, not opened at its source): 121 J in the fist as it lands
(mine). Against these the rules' bodies are a game's: a head takes several blows that would break
bone, as the owner asked of a life bar; the fist's threshold keeps a bare hand from emptying its arm
on its own blows.

## The fist

**A bare fist that strikes flesh takes only what its share brings past a threshold**
(`Rulebook.fist`, the side's damage in `src/core/rules/blows.ts`): the energy a hand stores loaded
to a knuckle's even chance of injury, F²/2k at 3.0 kN (`carpanen-2019`) on the hand's 122.3 N/mm
(`CONTACT_STIFFNESS.hand`), 36.8 J, all of it the threshold by the owner's decision
(`owner-fist-threshold`). It is a deductible: a share of 50 J costs the hand 13.2 J's worth. It
holds where a segment with hand poses and no item meets a body's own surface; against an item (a
club, a blade, armour) the hand takes its whole share. A Warrior's hand comes off at 36.8 + 13.2
= 50 J of its own share, against a head a blow of about 80 J, where a boxer's straight punch
brings 121 J.

**A bare foot has the fist's threshold** (`owner-foot-threshold`): a foot is a segment its body
names as a foot end (`BearingEndSpec`), spared as a hand is. A foot shares a blow as a hand does
(its stiffness is the hand's, [Gaps](#gaps)), so a stomp on a trunk, of which the foot stores
12 %, costs it nothing below 300 J; one that meets a head, a thigh or a forearm costs it what its
62 to 67 % brings past 36.8 J. A body that names no foot end, the reptile, spares no foot.

## Mechanisms

Blunt, an edge and an axe are priced by the joule, blunt 1 : an edge 5.7 : an axe 7.7
(`MECHANISM_PRICE`, `src/core/rules/rulebook.ts`). Every blow is blunt until an item states an
edge or a point. A point wounds by its depth (`pointWound`, `owner-point-depth`):

    depth = min(length, max(0, energy - breach) / resistance)
    wound = through x full life x min(1, depth / thickness)

- `energy` is the struck side's share of the blow (`energyShares`).
- `breach` is the sum over the layers over every part (`Rulebook.layers`): the skin's 0.25 J, the
  energy for a knife to penetrate a skin simulant, 0.17 to 0.56 J over four household knives
  (Gilchrist et al. 2008, read at its source, `gilchrist-2008`). A point short of a layer meets as
  blunt with the energy that reached it.
- `resistance` is 20 N (`Rulebook.resistance`): the force those knives penetrated the skin simulant
  at, 18 to 36 N (Gilchrist et al. 2008). It bounds the tissue past the skin from above: once the
  skin is perforated, further penetration meets negligible resistance (Knight 1975, as Horsfall et
  al. 1999 read it at its source).
- `length` is the point's own `depth` (`SurfaceSpec.directed`): the short sword's 0.475 m, its tip
  to the blade's base.
- `thickness` is the struck part's least width (`partThickness`, `src/core/rules/pool.ts`): a
  capsule's diameter, a box's least side, a hull's extent along its least principal axis.
- `through` is a quarter (`Rulebook.through`, `owner-life`); the wound then costs life as any
  blow does, at its part's group's factor, and on a limb its whole goes to the limb's bar
  ([Life](#life)). A point never cuts. A point meeting an item meets it blunt. An anatomical point (the reptile's bite) wounds by
  its press (`pointLoad`), not by this rule.

So any held point past about 5.5 J goes through a Warrior's trunk, and one past 3.9 J through its
head: the measured thrusts, 25 to 28 J, go through every part of every body (the Rogue's head
0.145 m thick, through past 3.1 J; the Skeleton's 0.131 m, past 2.9 J). What each does to each part
is in [Tolerances](#tolerances).

Against the literature (none of these opened at its source but where said):

- **People stab** at 28.1 J mean, 6.0 m/s, underarm (men, 142 stabs; 95th percentile 54.9 J,
  8.3 m/s; at most 63.4 J), and up to 115 J overarm (Horsfall et al. 1999, Table 1, read at its
  source; [the thrust's bar](human-strike-reference.md#3a-one-handed-thrust-a-persons-stab)).
- **An edge is plausible on soft tissue**, and only 1.5 to 3.4 times blunt on bone (Gentile et al.
  2019; Gaudet et al. 2020).
- **An axe against a sword** is supported by nothing found either way.
