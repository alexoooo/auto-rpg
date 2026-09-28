# Warrior, Rogue and the reptile

Planned 2026-09-27 from the owner's brief:

- Focus on the two new human forms, the Rogue and the Warrior.
- Add a quadruped reptile enemy the size of a small dog.
- Set hit points to reptile 1, Rogue 4 and Warrior 6.
- Keep body-part damage, but carry excess damage into neighbouring parts, so one blow can kill
  from anywhere.
- The strongest punch does 1 damage.

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
  is Session 5's reading to take.

## Session 2: the damage unit

- Measure the strongest punch: the Warrior's bare fist, at default attributes, over enough bouts
  and a punch bench that the maximum is a punch rather than a contact flick (see the peak and
  exclusion traps in `docs/history.md`).
- Rescale scoring so that punch is worth 1. That is one unit constant, applied where scoring
  prices energy. Every weapon keeps its ratio to the fist.
- Record the table beside the constant.

## Session 3: one HP pool with overflow

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

## Session 4: the reptile

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

## Session 5: readings and eye gates

- Readings, Node bout runner, several seeds:
  - Warrior against reptile, Rogue against reptile, and a Warrior mirror;
  - how many blows each takes to end a fight;
  - how often a one-shot happens and how often a limb is severed.
- Eye gates for the owner:
  - the reptile's look and gait;
  - a one-shot through an arm;
  - a pack of reptiles against the Warrior in the dungeon.
