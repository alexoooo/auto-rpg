# Warrior, Rogue and the reptile

> **Paused 2026-09-28.** The owner chose to build a physically based core first
> ([the core foundation](2026-09-28-core-foundation.md)); its salvage table says where each piece of
> this plan goes. Session 2 steps 1-5 landed; step 6 is parked on `wip/s2-step6-human-ranges`.

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
- `docs/analysis/2026-09-27-human-strike-realism.md` (in git at c76ce6bc) has the findings.
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

   **Done 2026-09-28** (`RATES`, `TORQUES` and `HUMAN_ARM_DRIVE` in `src/golem/humanoid/arm.ts`,
   each with its table).
   - The command rates double, to [6, 6, 8, 8, 10, 10, 8] rad/s, and the servo ceiling goes from 8
     to 24, a typical punch's elbow extension.
   - On the stand (Node golem bench, 120 Hz), the arm alone now drives:
     - a weapon at 12-13 m/s, against 9-11 before; a novice's arm-only saber cut is 13-15;
     - a fist at 6-7 m/s, against 3.6-4.6 before.
   - **Past x2 the torques bind.** x3 and a joint-by-joint human set gain under 1 m/s at the
     tip, and the hand strays further.
     - So the arm speed attribute above x1 no longer speeds the arm on the stand: x1.5 reads 13.1
       m/s against 13.7 (Node impact bench).
     - Step 6's elite end needs something other than rates.
   - H64 before and after, Warrior / Rogue:
     - Stroke stray: fist 23/24 mm to 81/138, club 184/96 to 302/276, blade 363/102 to 310/178.
     - Parry: overshoot 5/5 mm to 1/7, and arrival 0.042 s to 0.025.
   - **A free-air peak overstates a weapon.** A trunk-driven swing on the bout runner reads the club
     at 20-22 m/s at x2, 90 % of a lay man's one-handed 1 kg rod.
     - Most of that is the club throwing the forearm's roll to its stop as the arm stops.
     - With pronation at 50 N m, the Warrior's club reads 10.2.
     - A human reaches the rod's 24 m/s through proximal-to-distal sequencing, not pose-to-pose
       rates. That is step 6's strike search.
     - An acceleration-limited command profile was tried and helped neither the speed nor the
       following.
   - **Pronation stays 25 N m, not 12.**
     - At 12 the driven weapon slows (Warrior club 12.5 to 10.5 m/s, Rogue club 17.9 to 7.7), and
       the forearm loses the weapon's roll.
     - At 50 it is faster, but four times a man's.
     - After a full-speed stroke the Rogue's forearm swings from stop to stop and settles in about
       1.5 s. The Warrior's comes off its stop in about 0.4 s. Both are there at x1 too, only
       smaller.
   - Fights: 96-bout mirrors on the Node research runner, seed 20260923, against step 3's sets.
     - Golem duelist and walker:

       | build | damage a bout | knockdowns a bout | Delta ln s |
       |---|---:|---:|---:|
       | warrior | 0.51 / 1.54 | 0.44 / 0.38 | -0.109 +- 0.036 |
       | warrior-sword | 1.67 / 3.41 | 0.32 / 0.62 | -0.149 +- 0.040 |
       | warrior-club | 0.36 / 0.47 | 6.94 / 7.85 | -0.003 +- 0.009 |
       | rogue-sword | 0.32 / 0.55 | 0.33 / 0.76 | -0.027 +- 0.015 |

       warrior-unarmed and rogue are inert before and after.
     - `humanoid-duelist`:
       - warrior-sword damage goes from 0.21 to 0.94 a bout;
       - rogue-sword from 0.12 to 0.62;
       - warrior from 0.13 to 0.53;
       - warrior-club's real blows from 142 to 266, with its damage still 0.01.
       Every duelist build still runs to the cap.
   - `tests/human-arm-limits.test.mjs`:
     - Its rate check now lowers the rate, and is mutation-checked: a rate that ignores
       `armSpeed` goes red.
     - Its two momenta are re-pinned.
     - The overlap fixture moves to the fist at x0.5.
   - The screens' warm-up is a duelist mirror, so their states moved:
     - The impact screen's control, the duelist's own cut, now lands at 31.2 J, where it touched
       nothing. The forced sweep lands 0.572 J.
     - The chamber screen's straight plan now slaps flat at 7.23 J, edge alignment 0.03.
       - chamber/t0.15/r0.45/a0.8 now touches nothing, so the test takes t0.3/r0.45/a1.2, which
         cuts at 4.91 J with edge alignment 0.919.
       - Six chambers of twelve still reach the opponent.
   - The arm speed test's travel window is three substeps: at x2 the anatomical wrist reached its
     target within six.
   - `research/human-arm-limits.mjs` names a `mace` terminal that no longer exists (the club
     replaced it); unchanged here.
5. **Joint give.**
   - `effectiveMassAt` couples the chain to the body only as far as each joint's torque can hold
     over the contact.
   - Targets: a punch of 2-4 kg, and a club head under about 1.5 kg.
   - The shove reads the arrival whole with it, and `shoveReadFractions` goes. Read whole on
     today's masses, the shove doubled the maul mirror's falls and added two or three a bout to
     the skeleton's and the club Warrior's (the table is at `shoveReadFractions`), so the falls
     are measured on masses that are right.
   - It touches every family's scoring and falls, so it gets a bout comparison across families.

   **Done 2026-09-28**: joint give landed as 20830082. The whole shove was landed and reverted.

   - **Joint give** (`contactGive` in `src/golem/effective-mass.ts`, `contactGiveAt` in
     `src/body-inertia.ts`).
     - Each motored free axis of each joint on the chain becomes a bounded row, holding up to its
       live motor ceiling times `CONFIG.combat.jointHoldSeconds`. The pivot rows and the locked
       axes stay hard.
     - The contact is an active-set box problem. With the set fixed, the give is linear in the
       impulse, so `Combat` solves the pair for the impulse at which both sides' give together
       equals the closing speed, then reads each side's mass as that impulse over its own give.
     - A soft contact that every joint holds reads the whole body behind it; a hard one reads the
       free chain.
     - `tests/effective-mass.test.mjs` checks a closed form, and 48 random chains against an
       independent projected Gauss-Seidel solve. 16 or more of those cases must saturate, as the
       control.
   - **The hold is 15 ms**, the middle of the reference contact times: 11 ms on a dummy's face and
     27 ms on a padded wall. The best searched strikes, re-read at each hold (Node bout runner,
     `research/strike-eval.mjs`, the Warrior at x1 against an idle Warrior), striker kg:

     | hold ms | 0 | 8 | 15 | 27 |
     |---|---:|---:|---:|---:|
     | punch, 12.1 m/s | 1.45 | 1.70 | 1.91 | 2.24 |
     | club, 16.3 m/s | 1.90 | 1.98 | 2.05 | 2.16 |

     - Searched again under the hold, the punch is 115 J at 11.3 m/s and 2.05 kg. The reference
       is a typical 94 J at 2.93 kg and 8 m/s, and an elite 120 J.
     - The punch is inside the 2-4 kg target from about 15 ms. The club does not reach its
       under-1.5 kg target at any hold: it reads 1.9 kg with every joint free.
   - **The club is heavy for its size.** The 1.15 kg ash club reads about 2 kg at the head with the
     arm free. That is its geometry and its grip, not the joints, and is Session 3's question
     together with the damage unit.
   - **Census.** Contacts closing over 5 m/s, median striker kg, free / 15 ms (Node bout runner,
     golem-duelist mirrors, 4 x 60 s):

     | build | strike | free | held |
     |---|---|---:|---:|
     | warrior-unarmed | punch | 0.62 | 1.40 |
     | warrior-club | club | 0.97 | 1.10 |
     | warrior-sword | sword | 0.69 | 0.81 |
     | rogue-sword | sword | 0.56 | 0.70 |
     | fists | fist | 3.82 | 7.55 |
     | mace | club | 4.01 | 4.85 |
     | default | sword | 1.36 | 2.20 |
     | skeleton-warrior | sword | 1.42 | 2.59 |
     | maul | club | 17.8 | 21.1 |
     | skeleton-maul | club | 15.4 | 12.9 |

     The whip is unchanged. A bout takes the same wall time with the hold as without.
   - Fights with joint give alone: 96-bout mirrors on the Node research runner, seed 20260923,
     golem duelist and walker.
     - The humans, against step 4's sets:

       | build | damage a bout | knockdowns a bout | Delta ln s |
       |---|---:|---:|---:|
       | warrior-sword | 3.41 / 4.36 | 0.62 / 0.82 | -0.057 +- 0.013 |
       | warrior | 1.59 / 1.91 | 0.39 / 0.45 | -0.030 +- 0.010 |
       | warrior-club | 0.47 / 0.52 | 7.85 / 9.46 | -0.001 +- 0.009 |
       | warrior-unarmed | 0.01 / 0.01 | 1.18 / 2.21 | -0.001 +- 0.001 |
       | rogue-sword | 0.55 / 0.78 | 0.76 / 1.06 | -0.009 +- 0.011 |

       The bow mirror is inert before and after.
     - The other families, against step 2's sets (steps 3 and 4 moved only humans):

       | build | median s | damage a bout | knockdowns a bout | Delta ln s |
       |---|---:|---:|---:|---:|
       | default | 12.3 / 7.7 | 6.90 / 7.47 | 0.10 / 0.05 | -0.57 +- 0.12 |
       | fists | 86.0 / 35.9 | 3.75 / 5.61 | 1.13 / 0.64 | -0.93 +- 0.06 |
       | mace | 51.2 / 36.0 | 5.65 / 6.44 | 0.53 / 0.69 | -0.34 +- 0.09 |
       | skeleton-warrior | 56.5 / 31.4 | 1.95 / 2.13 | 9.07 / 7.11 | -0.49 +- 0.14 |
       | maul | 58.7 / 60.4 | 5.46 / 5.72 | 4.02 / 4.47 | +0.02 +- 0.08 |
       | whip | 99.9 / 97.0 | 2.90 / 3.02 | 0.24 / 0.30 | -0.023 +- 0.008 |
       | ram-capped | 113.6 / 113.6 | 1.61 / 1.54 | 0.70 / 0.74 | -0.011 +- 0.021 |

     - A stone body's blows now bill its body, so its fights end sooner: the fists mirror in under
       half the time.
     - Three human bouts in 96 hit the runner's five-minute wall limit under CPU load. The
       comparison pairs on the bouts both sides finished.
   - **The shove stays fractional; reading it whole was reverted.** 8e496d0b read the arrival
     whole and dropped `shoveReadFractions`, and 4350cb8e reverts it: its bout gate failed. The
     change raised knockdowns a bout on every family that shoves, human and stone. Fraction / whole,
     both with joint give (Node research runner, 96-bout mirrors, seed 20260923, golem duelist and
     walker):

     | build | knockdowns a bout | Delta knockdowns |
     |---|---:|---:|
     | warrior-club | 9.46 / 15.05 | +5.6 +- 0.9 |
     | rogue-sword | 1.06 / 6.28 | +5.2 +- 1.1 |
     | maul | 4.47 / 8.16 | +3.7 +- 0.6 |
     | warrior-unarmed | 2.21 / 4.69 | +2.5 +- 0.6 |
     | skeleton-warrior | 7.11 / 9.44 | +2.3 +- 0.8 |
     | warrior | 0.45 / 2.06 | +1.6 +- 0.4 |
     | fists | 0.64 / 1.89 | +1.3 +- 0.3 |
     | warrior-sword | 0.82 / 1.78 | +1.0 +- 0.3 |

     The rogue mirror is inert before and after. The chain stopped before default, whip, mace
     and ram-capped, since the gate had already failed.
     - The masses are no longer the problem; the fall line is. The stability ledger fells a body
       once its shove crosses the passive tipping line (`tippingLineMps` x stability), and nothing
       in it takes a step. A real body steps under a shove it cannot absorb standing. So the
       fraction stands in for the step until the ledger has one: an **open decision for the
       owner**.
   - **Open: ram-capped flings a body.** The capped ram's shove lands contacts at 15-28 m/s closing
     on 44-150 kg, up to 21 kJ. Traced in bout seeds [5, 6] at t = 54.817 s (Node bout runner):
     - every part of both bodies goes from 1-4 m/s to 15-32 m/s in one frame;
     - the struck body's pelvis then holds 13-17 m/s for over a third of a second while it falls.
     It is the solver, not the reading, and it predates joint give. It is not fixed here.
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
