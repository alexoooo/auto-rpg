# Warrior, Rogue and the reptile

Planned 2026-09-27 from the owner's brief:

- Focus on the two new human forms, the Rogue and the Warrior.
- Add a quadruped reptile enemy the size of a small dog.
- Set hit points to reptile 1, Rogue 4 and Warrior 6.
- Keep body-part damage, but carry excess damage into neighbouring parts, so one blow can kill
  from anywhere.
- The strongest punch does 1 damage. Revised the same day: the strongest club hit, a club being
  wood. Then: a typical human at default attributes strikes like a typical adult, and one at maximum
  attributes and size like an elite one.

The owner's answers, 2026-09-27:

| Question | Answer |
|---|---|
| Legacy human | Retire it. The workshop Warrior and Rogue are the only humans. |
| Overflow and death | One HP pool. Excess spreads to neighbouring parts, nearest and inward first. The body dies when its HP is gone or its head is emptied. |
| Golem and skeleton HP | Keep today's toughness relative to the human, in the new unit. |
| Reptile | It bites. Several spawn in the dungeon, and it is selectable in the arena. |

## Session 1: Warrior and Rogue are the humans

- `FAMILY_SETUP.human`, `ARMED_SETUP.human` and `randomGolemSetup(rng, "human")` build the workshop
  Warrior.
- The setup screen's model choice offers Warrior and Rogue only.
- The legacy builds move onto the Warrior where the workshop equipment allows: sword and shield,
  sword alone, unarmed. The workshop hands carry a sword or a fist on the right and a shield or a
  fist on the left, so dual swords, the maul, the mace and the whip wait for the equipment system.
- The dungeon hero defaults to the Warrior and can be the Rogue.
- The legacy appearance (`warrior.glb` and `humanoid/appearance.ts`) goes. Tag
  `pre-next-phase-cleanup` keeps it.
- Labels say "Warrior" and "Rogue". The model ids stay `workshop-fighter` and `workshop-rogue`,
  because saved matchups carry them.

**Done 2026-09-27.** Builds are `warrior`, `warrior-sword`, `warrior-unarmed`, `rogue` and
`rogue-sword`. Two things surfaced in the tests, with the Warrior as target:

- **Arrows ended on speculative contacts.** An arrow ended its flight on any solver event, and Combat
  scored it. Havok reports a speculative contact on a 9 mm shaft at 46 m/s while the point is still
  short of the face, at a point that is nowhere on the shaft. Every dungeon arrow at a Warrior scored
  zero as a shaft slap, and the legacy "shield blocks" were near-misses. An arrow now publishes its
  own swept hits on `Striking.contactEvents`, and Combat reads only those (Node headless arena:
  0.49 to 0.50 per dungeon arrow, point first).
- **The Warrior's shield rides its own flank.** Facing an archer square, no hand command brings the
  plate across the centreline, so it blocks only when the body turns its shield side to the
  shot. Worth an eye check when the Warrior's guard is next looked at.
- **The Rogue's second arrow can miss wide.** At an idle Warrior at 5 m it passed 5 mm outside the
  core's edge on seeds 17/29. The lead term reads the target's stagger after the first hit. This
  is Session 6's reading to take.

## Session 2: a human strikes like a human

Sources:
- `docs/analysis/2026-09-27-human-strike-realism.md` has the findings.
- `docs/analysis/2026-09-27-human-strike-reference.md` has the sourced human values.
- The strike search is `research/strike-optimizer.mjs`.

Each change is checked against the reference at default, minimum and maximum attributes, and every
row names its harness.

The owner's answers, 2026-09-27:

| Question | Answer |
|---|---|
| What size x1 means | A typical adult, about 1.76-1.78 m and 78-80 kg. The Rogue keeps its own proportions. |
| How scoring reads a blow | Arrival read whole. Today's fractions move into the joules-per-damage prices. |
| A straight arm billing the body | A joint give model, so a locked arm gives as a real one does. |
| Order | This session first; the damage unit is set on real numbers after it. |
| The top of the size range | Many elite fighters are over 2 m, so the human ceiling reaches past 2 m. |

Steps, in landing order. Each is its own commit, with a bout either side wherever it touches a fight.

1. **Scoring reads arrival whole.** `arrivalReadFractions` goes, and each kind's joules-per-damage
   divides by its fraction squared. Damage is then unchanged except at the speed floors; report
   what the floors change.

   **Done 2026-09-27.** Each mechanism has one price, so blunt took the row measured on the club
   and the fist, 0.62. The whip and the ram were at 0.56, and each now pays 1.226 times what it did
   for a blow, with a floor 10 % slower. The shove kept its fraction as `shoveReadFractions` (step 5
   has why). The builds were compared as 96-bout mirrors: duelist and walker, the Node research
   runner, seed 20260923, the same blocks before and after. Default, fists, mace, maul,
   skeleton-warrior, warrior, warrior-club and warrior-unarmed are bit-identical. Two moved:
   - the whip mirror: 2.32 to 2.90 damage a bout, Delta ln s -0.039 +- 0.004;
   - ram-capped: 1.53 to 1.61, Delta ln s -0.005 +- 0.002.

   The same run showed that the human mirrors barely fight: under 0.3 damage a bout, and every
   bout runs to the cap.
2. **Anthropometry.**
   - x1 is a typical adult, and each model's scale comes from its own stature.
   - Segment masses follow de Leva's fractions of a body mass set by the model's build. Today every
     part mass is a constant, so the Rogue weighs what the Warrior does.
   - The human hand comes to about 0.5 kg.

   **Done 2026-09-28** (`src/golem/humanoid/anthropometry.ts`).
   - A human is built at its size stat times `WORKSHOP_FIT_SCALE`, 1.77 / 1.88 (`builtAttributes`
     in `src/golem/build.ts`). At x1 the Warrior's skin stands 1.77 m and the Rogue's 1.63 m.
   - Body mass: the Warrior 79 kg, and the Rogue 57.6 kg, the Warrior's mass times the ratio of the
     two models' voxelized volumes.
   - Every part takes de Leva's fraction of its model's body mass. The Warrior's hand link and fist
     together weigh 0.48 kg.
   - Readings, Node headless bout: the built Warrior weighs 79.00 kg and the Rogue 57.57 kg.
     `tests/workshop-anthropometry.test.mjs` pins every part's mass, the neck height and the carried
     upper mass at x1 and x1.1.
   - `golemUpperMassKg` had been reading the bench human's torso and head tables for every human;
     it now reads the model's own.
   - The head collider's top stands 8.6 cm above the skin, at 1.851 m on the Warrior and 1.714 m on
     the Rogue. That is a hitbox finding, not fixed here.
   - Arm bench, before and after: the Node golem bench at 120 Hz, the model's own arm on the stand
     (`runStrokeBench` with `human`). Stroke stray and peak driven tip speed, before and after:

     | arm | stroke stray mm | peak driven tip m/s |
     |---|---:|---:|
     | Warrior sword | 436 / 363 | 11.6 / 11.1 |
     | Warrior club | 353 / 184 | 11.0 / 9.4 |
     | Warrior fist | 35 / 23 | 3.3 / 3.6 |
     | Rogue sword | 152 / 102 | 6.9 / 10.4 |
     | Rogue club | 213 / 96 | 6.9 / 8.9 |
     | Rogue fist | 57 / 24 | 4.1 / 4.6 |

     Parry overshoot stays at 3 to 5 mm. Tip lag on the sword and the club is 0.8 to 1.4 m both
     before and after; that is step 4's.
   - Fights: 96-bout mirrors on the Node research runner, seed 20260923, the same blocks as step 1.
     All seven non-human builds are bit-identical (default, fists, mace, maul, whip, ram-capped,
     skeleton-warrior). The human builds, before and after:

     | build | damage a bout | knockdowns a bout | Delta ln s |
     |---|---:|---:|---:|
     | warrior | 0.29 / 0.15 | 0.43 / 0.40 | -0.002 +- 0.006 |
     | warrior-sword | 0.68 / 0.38 | 0.40 / 0.31 | +0.009 +- 0.004 |
     | warrior-club | 0.22 / 0.07 | 7.17 / 6.84 | +0.009 +- 0.008 |
     | warrior-unarmed | 0.01 / 0.00 | 2.07 / 1.63 | +0.001 +- 0.001 |
     | rogue-sword | 0.12 / 0.12 | 0.35 / 0.32 | -0.006 +- 0.009 |
     | rogue (bow) | 0.00 / 0.00 | 0.02 / 0.03 | 0 |

     A lighter body delivers less, as it should. Nearly every human bout still runs to the cap. The
     bow mirror lands nothing either before or after.
   - Screens re-pinned: the chamber screen's best cut is now 2.04 J, and three of its twelve chambers
     reach the opponent where none did. The impact screen's best is 0.95 J.
   - Grip poses are looked up at the built size, and the pose table starts at x0.80, so a stat below
     x0.85 wears the x0.80 poses.
3. **The trunk.** The human waist gets its own twist rate and range, set from swing data: the upper
   trunk turns at about 10-16 rad/s through about 100 degrees. Today it has stone's 4 rad/s and
   0.65 rad. `humanoidDuelist`'s x0.35 on the twist goes, or is argued for with a measurement.

   **Done 2026-09-28** (`HUMAN_WAIST` and `HUMAN_TORSO` in `src/golem/humanoid/body.ts`).
   - `twistMax` is 0.87 rad, 100 degrees from wind-up to follow-through, and `twistRate` is 8.
   - The core's peak turn rate in a free-air swing, Node bout runner at 120 Hz:
     - Warrior 11.0 rad/s, Rogue 9.7-10.4 rad/s, where both were 5.0 at the old rate.
     - The servo carries the core past its command, so the rate is set on what the core achieves.
       The elite band is reached at 10-12, and it belongs to step 6's arm speed.
   - `twistTorque` stays 360. A trunk's own axial torque is 65-145 N m, but the pelvis does not
     turn into a blow here, and at 145 the Warrior's core reaches only 9 rad/s. The table is at
     `HUMAN_WAIST`.
   - The x0.35 goes. It had no rationale, and nothing measured argues for it.
   - Fights: 96-bout mirrors on the Node research runner, seed 20260923, before and after.
     - Under the golem duelist and walker, the trunk is a power source now:

       | build | damage a bout | real blows a bout | Delta ln s |
       |---|---:|---:|---:|
       | warrior-sword | 0.38 / 1.67 | 15 / 48 | -0.077 +- 0.013 |
       | warrior | 0.15 / 0.51 | 46 / 58 | -0.018 +- 0.012 |
       | warrior-club | 0.07 / 0.36 | 458 / 475 | -0.014 +- 0.006 |
       | rogue-sword | 0.12 / 0.32 | 90 / 117 | -0.004 +- 0.010 |

       Knockdowns do not move, except warrior-unarmed at -0.37 +- 0.27 a bout.
     - `humanoid-duelist` mirrors, trunk and x0.35 removed together:
       - warrior-sword goes from 1.8 to 10.6 real blows a bout;
       - rogue-sword from 0.01 to 0.12 damage;
       - warrior-club from 0 to 0.41 +- 0.13 knockdowns.
       Every build keeps its length. With the trunk alone, the x0.35 left every column where it
       was.
   - **The human duelist's mirrors barely wound, before and after.**
     - Every bout runs to the cap, at under 0.3 damage.
     - The unarmed mirror files more than 800 contacts over the energy floor a bout, and none of
       them wounds.
     - What those contacts strike is Session 3's question.
   - Screens: the chamber screen's warm-up is a duelist mirror, so its state moved.
     - Its cell reads 0.866 J at edge alignment 0.880.
     - Six of the twelve chambers reach the opponent, where three did before.
   - `authored human policy closes and wounds` now reads the vitality threshold inside its loop, as
     its comment says. 44/79 struck twice but moved the bar to 0.9994 only. Mutation-checked: a
     primary hand held at neutral goes red.
4. **Arm speed.**
   - Joint command rates move toward human joint speeds: elbow 22-41 rad/s, and a swing driven
     from the trunk.
   - Measure the arm bench's stroke stray and parry overshoot before and after (H64).
   - Torques stay human; pronation comes down to about 12 N m.
5. **Joint give.**
   - `effectiveMassAt` couples the chain to the body only as far as each joint's torque can hold
     over the contact.
   - Targets: a punch of 2-4 kg, and a club head under about 1.5 kg.
   - The shove reads the arrival whole with it, and `shoveReadFractions` goes. Read whole on
     today's masses, the shove doubled the maul mirror's falls and added two or three a bout to
     the skeleton's and the club Warrior's (the table is at `shoveReadFractions`), so the falls
     are measured on masses that are right.
   - It touches every family's scoring and falls, so it gets a bout comparison across families.
6. **Human attribute ranges.**
   - Size runs from about x0.9 to about x1.18 around the new x1: for a 1.77 m x1, from 1.59 m to
     about 2.09 m. Heavyweight boxers stand 1.98-2.13 m (Klitschko, Fury, Valuev). The ceiling is a
     human row of its own, checked on the human feet. Today's x1.1 is the stone biped's foot slip,
     and the human arms alone allowed x1.25.
   - Weight becomes a build range of about x0.85-1.25, not a doubling of density.
   - Arm speed spans typical to elite.
   - Run the strike search at minimum, default and maximum for the punch, the one-handed club and
     the sword, and check each against the reference.

## Session 3: the damage unit

- Measure the strongest club hit: the Warrior's club at default attributes, found by the strike
  search. That is the best contact, not a fight's typical one.
- Rescale scoring so that hit is worth 1. That is one unit constant, applied where scoring prices
  energy. Every weapon keeps its ratio to the club.
- Record the table beside the constant.

## Session 4: one HP pool with overflow

- **Each body has an HP total.**
  - Warrior 6 and Rogue 4, per model.
  - Reptile 1, per family.
  - Every other body is its table health summed and scaled, so that the retired human's table
    comes to 6. That keeps today's ratios: skeleton about 2, stone golem about 7, six-legged golem
    about 9.
  - Toughness and worn durability multiply as they do now.
- **Part HP.** A part's max HP is the total split by the parts' declared table health. Shields and
  equipment stay unwoundable and hold none. Vitality weights retire, and the bar becomes the
  attached HP over the total.
- **Overflow.**
  - A part absorbs at most what it has left.
  - The sever rule reads the overkill (the old "health below -0.5 x max").
  - The excess then walks the attached part graph from the struck part, parent before children,
    filling each part in turn.
  - The part graph is each module's own chain, plus socket joints between modules. Where a
    module's list is not a chain, it declares `joinedTo`.
- **Severing.** A severed module's remaining HP leaves with it.
- **Death.** The attached pool reaches zero, or a head is emptied. Carriers stop being fatal. The
  skeleton's ribcage stays fatal, because it is that body's head. The dungeon and the arena use the
  same rule.

## Session 5: the reptile

- A new family, `reptile`, with modules:
  - a quadruped locomotion, parameterising `multilegDefinition` for four legs and a trot;
  - a small torso with a tail;
  - a head with a lunging jaw that scores as `bite`;
  - a family-owned empty chain for both hand sockets.
- About 0.3 m tall and 0.7 m long without the tail, and about 8 kg.
- HP 1.
- A `reptile-biter` mind: the duelist's head-first mode, tuned for a fast, low body.
- Several spawn at once in the dungeon, and it is selectable in the arena.
- Appearance starts as procedural scaled shells; a modelled asset is later art work.

## Session 6: readings and eye gates

- Readings, Node bout runner, several seeds:
  - Warrior against reptile, Rogue against reptile, and a Warrior mirror;
  - how many blows each takes to end a fight;
  - how often a one-shot happens and how often a limb is severed.
- Eye gates for the owner:
  - the reptile's look and gait;
  - a one-shot through an arm;
  - a pack of reptiles against the Warrior in the dungeon.
