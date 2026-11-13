# Skill variations

## Goal

A character chooses its skills, and which variation of each. A variation is its own code, so a
change to one skill's variation changes no other skill and no character that does not use it.
The game lets a player choose and unlock skills and their variations for a character.

## The design

**A character is four things:**

```json
{
  "model": "man",
  "attributes": { "size": 1, "strength": 1 },
  "items": { "left": "empty", "right": "sword" },
  "skills": { "straight-punch": "drive", "sword-thrust": "drive", "stomp": "stomp" }
}
```

- `skills` maps each skill the character has to the variation it uses. A skill it does not list,
  it does not have.
- The Warrior, the Rogue and the Skeleton are characters of this shape, as data.

**A variation is one folder of code and one settings file**, its settings keyed by model name:

```
src/skills/strikes/straight-punch/drive/                 the code
assets/skills/strikes/straight-punch/drive.json          { "man": { settings, network } }
```

A model with no settings in the file cannot use the variation, and a character naming it is
refused when it is built, with the reason.

**The Mind decides when and how to use the character's skills**: which one, with which limb, at
what target, aimed how. It offers an Option only for a skill the character has, run by the
character's variation of it.

**Shared code is mechanics, never decisions**: the reach solve, the face aligner, timed pushes, the
strike window, the prepare, commit and release lifecycle. It lives in `src/skills/strikes/shared/`
and names no skill and no model. When a blow commits, what posture it prepares in and how it drives
are a variation's.

**The rule:** a variation imports only shared code and the framework, never another variation.

## Where it stands

- **A skill's per-body variation is data only**: settings and a network per body
  (`SkillRecord`, `src/skills/framework/records.ts`), looked up by the body's model.
- **Each strike is a folder holding one variation**: `straight-punch/drive/`, `sword-thrust/drive/`,
  `club-blow/swing/`, `bonk/swing/`, `stomp/stomp/` and `bite/bite/` in `src/skills/strikes/`, each
  skill's part (`index.ts`) running its one variation, the mechanics they share in `shared/`. A
  variation's settings are `assets/skills/strikes/<skill>/<variation>.json`, its data
  `dataOf("<skill>/<variation>")`.
- **A character is a model, its attributes and its skills** (`CharacterConfig`,
  `src/core/bodies/models.ts`): its skills each by the variation it runs (`SkillChoices`, on its spec
  as `BodySpec.skills`), its model's character's (`assets/characters/characters.json`) where it
  names none. Its items are the bout's loadouts (`DuelRecipe.loadouts`), not yet the character's.
- **The Option Mind offers only the character's skills**: a skill's part fits only a body whose
  character has it, and runs the variation it chose (`src/skills/framework/variations.ts`). A
  strike's digest names its variation. The Arena sets each side's skills by its panel and its link
  (`left.skills=`).
- **The fingerprint names the cases that moved** (`node scripts/fingerprint.mjs --compare`), not the
  variations each case ran.

## The order

Each step plays the game as before: `node scripts/fingerprint.mjs --compare` identical,
`npm run check`, `npm test`, `npm run build`.

1. **The checks**: the import rule in `scripts/source-boundary.mjs`; the fingerprint records the
   variations each case runs, and `--compare` given a changed variation fails on a moved case
   that does not run it.
2. **The documents**: the skill recipe's "No body is named in control code", the architecture's
   "Tuned per body" and its source boundaries, and rule 7 of [AGENTS.md](../../AGENTS.md#the-rules),
   each saying that shared code is general and a character's specialisation is a variation it
   chooses.

## Open

- **Evaluation's cache**: a case's code is the import closure of what it plays (`caseCoder`,
  `scripts/build-identity.mjs`), so the variations' files re-key every strike case and evaluate plays
  them again instead of replaying them. Saved readings stay as read.
- **A skill's aim reading its variation**: the bite's aim (`first-exposed`, `bite/jaw-aim.ts`)
  imports the bite variation's settings, so the import rule of step 1 meets it.
- **Attributes**: a variation is tuned and measured at its model's default attributes, and a
  character with other attributes runs those settings untuned. A variation covering a range of
  attributes is a stage of its own.
- **One variation per skill**: `skills` gives a character one variation of each skill; holding two
  of one skill at once is a list in its place.
- **The Skeleton's guard** asks for angles past its joint limits (`guardPosture`,
  `src/skills/guard/guard.ts`: shoulder abduction -0.2 rad below its 0 minimum, elbow flexion
  1.3 rad past its 0.84 maximum). The guard is read by every skill, so it is a question of its own.
- **The Warrior's punch from its guard**, the blow committing only with the arm at its prepare
  posture, is a variation of the straight punch the Warrior chooses, read in a run of its own once
  the structure lands.
