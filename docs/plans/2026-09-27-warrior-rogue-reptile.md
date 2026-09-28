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
3. **The trunk.** The human waist gets its own twist rate and range, set from swing data: the upper
   trunk turns at about 10-16 rad/s through about 100 degrees. Today it has stone's 4 rad/s and
   0.65 rad. `humanoidDuelist`'s x0.35 on the twist goes, or is argued for with a measurement.
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
