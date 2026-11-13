# Skill variations

## Goal

A character chooses its skills, and which variation of each. A variation is its own code, so a
change to one skill's variation changes no other skill and no character that does not use it.
The game lets a player choose and unlock skills and their variations for a character.

## The design

**A character is four things:**

```json
{
  "model": "workshop-fighter",
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
assets/skills/strikes/straight-punch/drive.json          { "workshop-fighter": { settings, network } }
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
  (`SkillRecord`, `src/skills/framework/records.ts`), looked up by `bodyKey`
  (`src/core/bodies/spec/body.ts`).
- **The record key carries labels that tell nothing apart.** `bodyKey` adds `+toes` where a body's
  feet have toes and `+<variant>` where its spec names one. Every human is built with toes
  (`shapedSpec`, `src/core/bodies/human/spec.ts`) and no body names a variant, so every human key
  ends in `+toes`. 92 files under `assets/`, `src/`, `research/`, `scripts/` and `tests/` hold such
  keys, most of them saved research runs.
- **Two executors run more than one skill:**

  | Executor | Skills it runs |
  | --- | --- |
  | `straightPunchExecutor`, `src/skills/strikes/straight-punch.ts` | the straight punch (`punch-part.ts`) on every body, the sword thrust (`held-blow.ts`) |
  | `swingExecutor`, `src/skills/strikes/swing.ts` | the club blow and the bonk (`swing-part.ts`) |

  A change to either one's decisions changes every skill and body it runs.
- **A character is a model and its attributes** (`CharacterConfig`, `src/core/bodies/models.ts`);
  its items are the bout's loadouts (`DuelRecipe.loadouts`); its skills are its mind's Options
  (`OPTION_DEFAULTS`, `src/entrants/option/mind.ts`), the same list for every character, each
  offered where the body fits its skill.
- **The fingerprint names the cases that moved** (`node scripts/fingerprint.mjs --compare`), not the
  variations each case ran.

## The order

Each step plays the game as before: `node scripts/fingerprint.mjs --compare` identical,
`npm run check`, `npm test`, `npm run build`.

1. **Record keys are model names**: `bodyKey` drops `+toes` and `BodySpec.variant`; every record
   under `assets/` and every tool that writes or reads one uses the model name.
2. **Variations**: `straight-punch.ts` into shared code, `straight-punch/drive/` and
   `sword-thrust/drive/`; `swing.ts` into shared code, `club-blow/swing/` and `bonk/swing/`; the
   stomp and the bite one variation each. Each skill's settings file becomes its variation's.
3. **Characters choose skills**: `CharacterConfig` gains `skills`; the three characters' skills as
   data, each the variation it runs now; the bout recipe carries each side's character;
   Option Mind offers only the character's skills, each run by its variation. The Arena sets each
   side's variations, by its panel and its link.
4. **The checks**: the import rule in `scripts/source-boundary.mjs`; the fingerprint records the
   variations each case runs, and `--compare` given a changed variation fails on a moved case
   that does not run it.
5. **The documents**: the skill recipe's "No body is named in control code", the architecture's
   "Tuned per body" and its source boundaries, and rule 7 of [AGENTS.md](../../AGENTS.md#the-rules),
   each saying that shared code is general and a character's specialisation is a variation it
   chooses.

## Open

- **Evaluation's cache**: a case's code is the import closure of what it plays (`caseCoder`,
  `scripts/build-identity.mjs`), so moving files re-keys every strike case and evaluate plays them
  again instead of replaying them. Saved readings stay as read. The price is said before step 2.
- **Saved research runs** under `research/runs/` hold `+toes` keys as they were written; whether a
  tool reads them again decides whether step 1 touches them.
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
