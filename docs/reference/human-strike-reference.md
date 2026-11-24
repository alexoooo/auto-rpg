# Human striking biomechanics: reference values for calibrating a simulated fighter

What the literature measured of human strikes (sections 1 to 3b: the strike bars, `BAR` in
`src/evaluation/strike/read.ts`), how the human models' stature and volume were measured
(section 8, `src/core/bodies/human/model.ts`), and how the core human's joint strengths were
weighed and checked (section 9, `src/core/bodies/human/muscle.ts`, `tables/`).

All units are SI. "Typical" means an untrained or recreational adult male where such data exist; otherwise the lowest-skill group studied, which is named. Values are mean ± SD unless marked otherwise. **Derived** marks a number computed here from the cited inputs, not reported by the source: a textbook model (a point effective mass for the fist, a uniform rod about its end for a stick), an order-of-magnitude check.

## 1. Punches (straight jab/cross, hook)

| Quantity | Typical (untrained / novice) | Elite | Source |
|---|---|---|---|
| Fist speed at impact, straight rear-hand punch | 8.0 ± 1.2 m/s (29 untrained men, 87 kg, pad on a wall force plate; people with punching training excluded). Non-dominant hand 6.2 ± 0.9 m/s. Speed is the hand's over its last 10 cm (Table 3, male) | 9.14 ± 2.06 m/s (7 Olympic boxers, 18 straight punches to a Hybrid III face; gloved) | Adamec et al. 2021, Int J Legal Med 135:853, https://epub.ub.uni-muenchen.de/76042/1/76042.pdf ; Walilko, Viano & Bir 2005, Br J Sports Med 39:710, https://www.sportmedicine.ru/articles/biomechanics_of_the_head_for_olympic_boxer_punches_to_the_face.pdf |
| Fist speed, other elite measurements (straight) | Junior boxers: cross peak 8.1 ± 1.3 m/s; lead straight peak 6.32 ± 0.42, at contact 4.87 ± 0.39 m/s | Cross peak 8.1 ± 2.1 m/s (15 elite); lead straight peak 7.16 ± 0.48, at contact 5.56 ± 0.61 (8 elite); rear peak 7.75 ± 0.66, at impact 6.18 ± 0.8; lead 6.76 / 5.24 (17 elite, 66 kg); straight right 7.8 ± 1.5 (range 6.1-9.4; 8 elite amateurs) | Dinu & Louis 2020, Front Sports Act Living, https://pmc.ncbi.nlm.nih.gov/articles/PMC7739747/ ; Front Physiol 2022, doi 10.3389/fphys.2022.1015154, https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2022.1015154/full ; Wan & Liu 2026, BMC Sports Sci Med Rehabil, https://pmc.ncbi.nlm.nih.gov/articles/PMC13285485/ ; Cheraghi et al. 2014, Ann Appl Sport Sci 2(2):39, http://aassjournal.com/article-1-136-en.pdf |
| Fist speed, karate reverse punch (ungloved) | not measured | 11.0-11.9 m/s (mean 11.5) | Smith & Hamill 1986, as cited by Walilko et al. 2005 (above). Beranek et al. 2020 meta-analysis (28 studies): straight and reverse punches exceed 10 m/s, https://doi.org/10.1080/14763141.2020.1778075 |
| Fist speed, hook (rear) | Junior 8.9 ± 0.9 m/s | 11.2 ± 2.0 m/s (15 elite) | Dinu & Louis 2020 (above) |
| Fist speed, uppercut (rear) | Junior 7.3 ± 1.0 m/s | 10.2 ± 1.8 m/s | Dinu & Louis 2020 (above) |
| Effective mass, straight punch | 2.93 ± 0.81 kg by impulse / velocity (dominant hand; non-dominant 3.27 ± 0.93; Table 3, male). Palm strike 1.43 kg, chop 1.21 kg | 2.9 ± 2.0 kg by momentum conservation (range by class: flyweight 2.3, light-welterweight 2.7, middleweight 0.8 with a flexed wrist, super-heavyweight 5.0 ± 2.4). Rigid wrist 3.35 kg, flexed wrist 2.01 kg. Karate ~4.1 kg (bag-momentum method). Kung fu palm strike 2.62 ± 0.33 kg | Adamec et al. 2021; Walilko et al. 2005; Smith & Hamill 1986 via Walilko; Neto, Magini & Saba 2007, J Appl Biomech 23:139, https://pubmed.ncbi.nlm.nih.gov/17603133/ |
| Peak force, straight rear hand | 1665 ± 401 N (range ~930-2490; untrained, padded wall plate). Novice boxers 2381 ± 328 N; intermediate 3722 ± 375 N | 4800 ± 601 N (elite, Smith 2000, padded dynamometer). 3427 ± 811 N (Olympic, Hybrid III face; middleweight 2625, super-heavyweight 4345 ± 280). 4096 N (one world-ranked heavyweight; 7 kg pendulum). Cross 3158 ± 1467 N (elite) vs 1021 ± 449 N (junior) | Adamec et al. 2021; Smith, Dyson, Hale & Janaway 2000, J Sports Sci 18:445, https://www.tandfonline.com/doi/abs/10.1080/02640410050074377 ; Walilko et al. 2005; Atha et al. 1985 via Walilko; Dinu & Louis 2020 |
| Peak force, lead hand (jab / lead straight) | Novice 1604 N; intermediate 2283 N; junior 1035 ± 220 N; untrained non-dominant 1506 N | 2847 N (elite; Smith 2000). 1508 ± 411 N (elite; Front Physiol 2022). 1244 ± 411 N (Wan & Liu 2026) | Smith et al. 2000; Front Physiol 2022; Wan & Liu 2026; Adamec et al. 2021 |
| Peak force, hook | Junior 544 ± 235 N | 2999 ± 1818 N (elite). Taekwondo athletes: hook 1843 N vs straight 1659 N | Dinu & Louis 2020; Busko & Nikolaidis, quoted in Del Vecchio 2022, https://pmc.ncbi.nlm.nih.gov/articles/PMC9784821/ |
| Impulse | 22.8 ± 5.7 N s (untrained, dominant; contact 27 ± 5 ms); non-dominant 20.2 N s | ~25 ± 8 N s (Olympic; read from a misaligned PDF table, so approximate; contact ~11 ms). Lead straight 24.7 ± 5.3 vs junior 16.8 ± 2.9 (units printed as "N·ms", almost certainly N s). Karate bag momentum 47.4 N s | Adamec et al. 2021; Walilko et al. 2005; Front Physiol 2022; Smith & Hamill 1986 via Walilko |
| Fist kinetic energy, 1/2 m_eff v^2 (**derived**) | ~94 J (2.93 kg at 8.0 m/s) | ~120 J (2.9 kg at 9.1 m/s); range ~30-250 J across the effective-mass spread | Derived from Adamec 2021 and Walilko 2005 |
| Energy delivered to the target | not measured | 17.2 ± 8.9 J into the Hybrid III head (super-heavyweight 20.2); head delta-v 2.97 m/s; peak punch power 6574 ± 3453 W | Walilko et al. 2005 |

### Reading the punch figures

- **Effective mass depends on its definition**: momentum into an instrumented head (Walilko),
  impulse over fist velocity (Adamec), bag momentum (Smith & Hamill). Within one study SDs reach
  70 % of the mean (Walilko: 2.9 ± 2.0 kg), mainly by wrist rigidity and weight class. A punch
  mass of 2-4 kg is defensible; 1 kg is a floppy wrist, 5+ kg a super-heavyweight driving through.
- **Peak force depends on target stiffness, padding and gloves.** The same elite straight punch
  reads 1500 N into a padded plate (Front Physiol 2022) and 3400-4800 N into a Hybrid III face or
  a stiff dynamometer (Walilko; Smith 2000); contact lasts ~11 ms on the dummy face, ~27 ms on the
  padded wall. Impulse (~20-25 N s for a hard straight punch) and fist speed calibrate better
  than peak N.
- **"Peak" and "at impact" speeds differ**: straight punches often slow before contact (7.2 m/s
  peak, 5.6 at contact; Front Physiol 2022). Untrained and elite straight-punch speeds overlap
  (8.0 vs 8.1-9.1 m/s); skill shows in effective mass, force and hook and uppercut speed.

## 2. One-handed stick/club/baton, and bats as a two-handed ceiling

| Quantity | Typical | Elite / ceiling | Source |
|---|---|---|---|
| Tip speed, 1.0 kg, 0.65 m steel rod, overhead strike | One-handed maximum: men 23.9 m/s, women 17.2 m/s; two-handed 24.2 / 18.3 (50 lay volunteers) | No trained-striker data found | Muggenthaler et al. 2018, Int J Legal Med, https://pubmed.ncbi.nlm.nih.gov/29546494/ |
| Tip speed vs rod mass and length (0.5/1.0/1.5 kg; 40/65/90 cm) | Men 14.0-35.5 m/s, women 10.4-28.3 m/s. Speed rises as mass falls and as length grows; it also depends on sex and exercise habit | -- | Trinh et al. 2018, Int J Legal Med, https://link.springer.com/article/10.1007/s00414-017-1734-z |
| Stick-type blunt instrument, 180 simulated strikes | 11.3-36.0 m/s overall; men 20.1-36.0, women 11.6-29.1 | -- | Li et al. 2022, Fa Yi Xue Za Zhi, doi 10.12116/j.issn.1004-5619.2020.401108 |
| Rod kinetic energy (**derived**) | ~95 J (uniform 1 kg, 0.65 m rod pivoting at its end, 23.9 m/s tip: KE = m v_tip^2 / 6; tip angular velocity ~37 rad/s). The real pivot is nearer the shoulder, so the arm adds energy on top of this | -- | Derived from Muggenthaler 2018 |
| Energy transferred by household implements (10 volunteers, 500 strikes) | Crutch 75.5 ± 10.7 J; nylon hammer 70.6 ± 9.2; cooking pot 63.4 ± 9.5; vacuum tube 61.2 ± 10.9; frying pan 53.2 ± 9.3 J | -- | Frantz, Sprenger & Jackowski 2026, Forensic Sci Int, https://pubmed.ncbi.nlm.nih.gov/41478000/ |
| Baseball bat speed at the sweet spot | College batters: ~30-32 m/s at 0.71 m from the knob (15 cm from the tip); knob angular velocity 43-46 rad/s. College baseball and fast-pitch softball: 22-31 m/s | MLB Statcast mean ~32 m/s (72 mph at 6 in from the head, top 90 % of swings). Professional maximum linear bat speed 31 m/s | Nathan, Crisco, Greenwald, Russell & Smith 2011, Sports Eng 13:153, https://www.acs.psu.edu/drussell/Publications/NathanCrisco-SportsEng.pdf ; Koenig et al. 2004, Sports Eng 7:105, https://link.springer.com/article/10.1007/BF02915922 ; https://baseballsavant.mlb.com/leaderboard/bat-tracking ; Welch et al. 1995, JOSPT 22:193, https://www.jospt.org/doi/10.2519/jospt.1995.22.5.193 |

## 3. One-handed sword cut

Peer-reviewed data are thin; most figures are from practitioners.

| Quantity | Typical (novice) | Elite / trained | Source |
|---|---|---|---|
| Saber tip speed, vertical cut, arm only | 12.97-14.93 m/s (n = 3 novices) | 17.55-19.53 m/s (n = 3 fencers) | Greene, Barona & Simon 2023, J Emerging Investigators 6, https://emerginginvestigators.org/articles/21-230/pdf (high-school research journal; weak) |
| Longsword, speed of the cutting section (1.39 kg Albion Crecy; impact node 0.606 m from the guard) | -- | ~20 m/s peak (one practitioner; phone slow-motion video) | Franklin (SwordSTEM) 2018, https://swordstem.com/2018/08/22/how-fast-do-swords-move-try-1/ (not peer-reviewed) |
| Tip impact speed, illustrative | -- | ~27 m/s (60 mph) example | Turner, ARMA, https://thearma.org/spotlight/GTA/motions_and_impacts3.htm (not peer-reviewed) |
| Blow energy, sword or axe | ~60-65 J for a 1 kg one-handed sword | 60-130 J; ~130 J for a 2 kg two-handed weapon | Williams 2003, *The Knight and the Blast Furnace*, as quoted by ACOUP 2019, https://acoup.blog/2019/06/21/collections-punching-through-some-armor-myths/ (secondary) |

## 3a. One-handed thrust: a person's stab

Horsfall, Prosser, Watson & Champion 1999, Forensic Sci Int 102:79-89, Table 1, read at its source
(https://doi.org/10.1016/S0379-0738(99)00055-9): volunteers (students, police, an exhibition's
visitors) stabbed a 12-layer Aeroflex target on a Plastolena block with an instrumented knife (an
80 mm diamond-section commando blade, a large hilt with a disc guard), one or two underarm stabs
each and some overarm; force by a load washer behind the blade, velocity and energy from the
hilt's accelerometer. The table gives the mean, the 95th percentile and the maximum, no SD.

| Group | Stabs | Energy: mean, 95 %, max (J) | Velocity at impact: mean, 95 %, max (m/s) |
|---|---:|---|---|
| All underarm | 157 | 26.4, 54.4, 63.4 | 5.8, 8.2, 10.1 |
| All overarm | 46 | 46.1, 77.3, 114.9 | 8.5, 11.0, 11.6 |
| Men, underarm | 142 | 28.1, 54.9, 63.4 | 6.0, 8.3, 10.1 |
| Women, underarm | 15 | 10.8, 22.4, 30.9 | 4.6, 6.0, 7.4 |

- **The mean less one SD** (**derived**, the SD from the 95th percentile on a normal spread,
  (P95 - mean) / 1.645): men underarm, energy 28.1 - 16.3 = **11.8 J**, velocity 6.0 - 1.40 =
  **4.6 m/s**.
- **What the energy holds**: the knife's, hand's and arm's kinetic energy, and the muscular work
  pushed through the target as the knife went in (about 200 N over 60.5 mm, 12 J, by the paper's
  own estimate). The rules' energy is the impact's alone ([wounds](wounds.md#mechanisms)), so the
  thrust's bar is the point's speed, with its energy and wound reported beside it.

## 3b. Stomp

| Quantity | Typical (novice) | Trained | Source |
|---|---|---|---|
| Stomp, mean peak force on a force plate | men 8494 to 9016 N, women 4694 to 5970 N (55 volunteers; sturdy and soft shoes, with and without an elastic layer like a scalp). Jumping on it is about twice | -- | Schirmer et al. 2016, Int J Legal Med 130(3):827-34, https://doi.org/10.1007/s00414-015-1254-7 (the abstract only; no SD there) |
| Stamp on a dummy lying in a simulated ruck, the foot's inbound speed (high-speed video) | 4.3 m/s mean, 2.1 to 6.3 m/s (12 participants; no SD in the abstract) | -- | Oudshoorn, Driscoll, Dunn & James 2018, J Sports Sci 36(8):914-919, https://doi.org/10.1080/02640414.2017.1346273 (the abstract only) |

- **The stomp's mean less one SD** (**derived**): Oudshoorn et al. give a mean and a range, no
  SD; a normal sample of 12 spans about 3.26 SD (the expected range, `d2`), so the SD is about
  (6.3 - 2.1) / 3.26 = 1.29 m/s and the bar 4.3 - 1.29 = **3.0 m/s**, the foot's speed into the
  contact (`Bar.foot`, `src/evaluation/strike/read.ts`). Schirmer's force is not read: the rules
  price a contact's energy, not a plate's peak.

## 3c. Front kick

| Quantity | Novice | Sub-elite | Elite | Source |
|---|---|---|---|---|
| Front kick at a solid target, middle distance and height, the foot's maximum speed | 7.7 ± 1.2 m/s (1 result, 16 men) | 8.56 ± 1.08 m/s (11, 127) | 9.61 ± 1.05 m/s (10, 103) | Vagner, Cleather, Olah, Vacek & Stastny 2023, Sports 11(8):141, https://doi.org/10.3390/sports11080141, Table 1 (a review: its studies' means and SDs weighted by participants, men; in brackets the results and participants pooled) |
| The same kick into the air, the foot's maximum speed | -- | 10.74 ± 1.01 m/s (2, 22) | 12.25 ± 0.18 m/s (1, 1) | the same |
| Front kick at a target, its total execution time | -- | 1.140 ± 0.221 s (1, 12) | 1.076 ± 0.099 s (3, 29) | the same; into the air, elite, 0.950 s (1, 1) |

- **A scale, not a bar**: the kick's time is read from the action's start, the order, to contact
  on the mark; the review's from the kick's start to the target, as each study defined it. No
  bar reads them: the kick is valued as every blow is, its foot's speed over its last 0.1 m
  reported beside it (`src/evaluation/table/cells.ts`).

## 8. The human models

Measurements of this repository's assets for the core's human spec (`src/core/bodies/human/`).

**Stature** is the top of the skin: the maximum y of `base__skin`'s positions in
the lossless cached GLBs (`losslessModelPath`), bind pose, soles on 0; hair is not stature. It is the
GLB's own figure, the maximum its position accessor states (`/accessors/231/max/1` in the
Warrior's file, `/accessors/220/max/1` in the Rogue's).

| Model | Skin top at the authored size | At x1 (x 1.77 / 1.880) |
|---|---|---|
| Warrior (`man`) | 1.8805 m | 1.770 m |
| Rogue (`woman`) | 1.7305 m | 1.629 m |

x1 is a typical adult (`owner-typical-adult` in `SOURCES`): 1.77 m and 79 kg for a man. The
Rogue takes the Warrior's factor, so she keeps her size against him.

**Volume.** Each model's skin, feet, jacket, trousers, collar and belt were closed by voxel flood
fill in the bind pose and extrapolated to a zero voxel from grids of 4.5 to 8 mm (a finer grid
leaks through a seam). What is enclosed, and what is not outside, bracket the volume (litres, at
the authored size); the taken value is `VOLUME` in `src/core/bodies/human/model.ts`:

| Model | Enclosed | Not outside | Taken |
|---|---|---|---|
| Warrior | 107.6 | 111.4 | 109.5 |
| Rogue | 78.0 | 81.6 | 79.8 |

The ratio is 0.729 on either bound to the third digit, and the clothes are the same garments on
both. The Rogue's mass is the Warrior's 79 kg times this ratio, 57.6 kg: her own build's mass at
the same density.

## 9. Joint strengths for the core human

The tables' comments name each source and what it measured (`tables/joint-torques.ts`,
`tables/range-of-motion.ts`, `tables/abe-2003.ts`), `muscle.ts` the rule: a model's torque is
young men's measured torque times the model's regional muscle over those men's. Here: the rules
weighed for the regional muscle, the check against the women's measured column, which is never an
input, and what stays unexplained.

### 9.1 Three rules weighed

The Rogue's predicted torque over the women's measured torque at her mass:

| Rule | Shoulder | Elbow and wrist | Hip and knee | Ankle | Trunk (Pan) | Neck |
|---|---|---|---|---|---|---|
| A. Janssen 2000's upper and lower body, 18-29 y | 1.19-1.46 | 0.80-1.25 | 0.82-1.28 | 1.04-1.26 | 0.76-0.87 | 1.28-1.60 |
| B. Abe 2003 alone: how much muscle and where, from the same people | 1.02-1.24 | 0.63-0.98 | 0.69-1.09 | 1.06-1.28 | 0.65-0.75 | 1.09-1.37 |
| C. Janssen's total muscle per kg, shared out by Abe's regional shares | 1.19-1.45 | 0.73-1.15 | 0.81-1.27 | 1.23-1.50 | 0.76-0.87 | 1.27-1.59 |

The spec uses **B**. The reason is not its fit: both sexes' shares come from the same people in the
same scanner, so their ratio carries no difference of method, which A and C cannot claim. That B
also fits best was seen after the choice was argued, and is reported, not relied on.

- **Janssen's upper body cannot be used as it is.** It mixes arms with trunk, and women's arms carry
  less of their muscle than their trunks do. So A over-predicts the Rogue's shoulder by up to 46 %
  (z = 2.0 and 2.1 in the women's SD, for internal rotation and adduction).
- **What no rule explains: the trunk.** Every rule puts the Rogue's trunk at 0.65-0.87 of Pan's
  women. Per kilogram of body mass Pan's women turn the trunk with 87-99 % of the men's torque,
  where Abe's women have 63-70 % of the men's muscle cross-section at the xiphoid, lumbar and
  iliac crest levels. A seated trunk test may recruit the hip extensors, and women's moment arms
  may differ; neither is established.
- **Two smaller misses:** Anderson's hip flexion and extension (its 7 women's normalised peaks
  exceed its 7 men's) and Peleg's ulnar deviation (20 women, concentric).

The middle Rogue ratio reads 0.97. Scaling by mass alone moves the middle to 1.39. Leaving her mass
out moves it to 1.25.

### 9.2 The check, by exertion

The Rogue's predicted torque over the women's measured torque at her mass, under rule B, on the
measured peaks, before what `modelSpec` sets over them (`IN_USE`, `HUMAN_EXERTIONS`):

| Joint | Ratio by exertion |
|---|---|
| Shoulder | flexion 1.16, extension 1.16, abduction 1.07, adduction 1.18, external rotation 1.02, internal rotation 1.24 |
| Elbow | flexion 0.98, extension 0.96 |
| Forearm | supination 0.76, pronation 0.83 |
| Wrist | flexion 0.85, extension 0.96, ulnar deviation 0.63, radial deviation 0.83 |
| Hip | flexion 0.69, extension 0.69, abduction 0.99, adduction 1.06, external rotation 0.82, internal rotation 1.09 |
| Knee | extension 0.92, flexion 0.90 |
| Ankle and foot | dorsiflexion 1.15, plantar flexion 1.09, inversion 1.06, eversion 1.28 |
| Trunk | flexion 0.75, extension 0.65, lateral flexion right 0.66 and left 0.70, rotation right 0.68 and left 0.68 |
| Neck | flexion 1.09, extension 1.35, lateral flexion 1.23, rotation 1.37 |

**Why Danneskiold-Samsøe et al. 2009 (DS2009) is the spine of the table**: it is the only source found
with isometric N m by sex and age band for the shoulder, elbow, wrist, hip rotation, knee and
ankle together, from one laboratory on one dynamometer. For some rows it does not say which of
two test angles the tabulated value is.

**Hip abduction and adduction.** DS2009 reads high against the only other isometric N m source:

| Source | Posture | Abduction (N m) | Adduction (N m) |
|---|---|---|---|
| DS2009, men 20-29 | Side-lying | 185 | 217 |
| DS2009, women 20-29 | Side-lying | 114 | 124 |
| Gonçalves et al. 2021, sexes pooled (69.9 kg) | Custom rig, supine | 95 | 124 |
| Gonçalves et al. 2021, sexes pooled (69.9 kg) | Biodex, side-lying | 117 | 90 |

DS2009 is kept because it is the only source split by sex, and because it keeps the hip in the same
laboratory as the knee and ankle.

### 9.3 Limits

- **The spine joints sit on the CERV-MIDH line**, at de Leva's trunk boundaries, not on the spine.
- **The reference pose is not the anatomical position**: the Warrior's elbows are bent 46 degrees,
  his arms abducted 41 degrees and turned out about 5 at the shoulder. Each joint's limits are its
  source's ranges less that bind (`src/core/bodies/human/joints.ts`).
- **Neck and spine are taken as neutral** in the reference pose (`reference-pose-assumptions`).
  The head measures 5.1 degrees (Warrior) and 9.3 (Rogue) from the trunk line, and the trunk line
  itself 1.8 degrees forward and 2.3 back; the rig does not say how much of either is posture and
  how much is the geometry of its landmarks.
- **The trunk's sex ratio** is unexplained (9.1).
