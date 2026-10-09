# Configurable minds: a mind is a tree of parts the player can see and change

## Outcome

A player can see and change what drives any body, in the Arena, the Lab and the Crypt:

- the mind itself;
- its tactics;
- its skills, one per kind of action;
- the sub-minds it hands its body to when it is down.

A new skill appears as an option wherever that kind of skill can go. A mind can be given several
skills of one kind and choose among them as it fights. The research skills that run in real time
(the punch layer, the whole-body solve) are offered as experimental parts beside the game's.

## How it is built

A mind is a tree of plain-data **parts**. Each part is `{ kind, ...settings, ...slots }`:

- a **setting** is a field a person may change, as `ControllerField` is today;
- a **slot** holds another part, or a ranked list of parts, of a stated **role**.

Each kind of part is registered once, with:

- its role;
- its label;
- its stage (`game` or `experimental`);
- its fields and slots;
- its default config;
- which bodies it fits;
- what is wrong with a config of it.

The editor, the inspector, links, saves and fault-finding are each written once, over that
registry, and work for every part, including parts added later. Making a part stays with its
role's module, as a `switch` on its kind with a `never` default, as `subMind` does today.

| Role | What it is | Kinds after this plan |
|---|---|---|
| `mind` | what a fight makes for a body (`Minded`) | `fighter`, `quadruped`, `direct` |
| `sub-mind` | takes the body while it wants it (`SubMind`) | `lie`, `staged-rise`, `support-recovery` |
| `tactics` | sight to `Intent` (`Tactics`) | `seek`, `openings`, `script`, `stand` |
| `locomotion` | `move`, `face`, `lower` | `stance-walk` |
| `guard` | `Intent.guard` | `cover-guard` |
| `blow` | a `BlowAttack` | `recipe-strike`, `path-strike`, `choose-blow`; `driven-strike`, `whole-body-strike` (experimental) |
| `kick` | a `KickAttack` | `front-kick` |
| `support` | fighting from low support | `support-fold` |

The fighter's skills sit in its own slots: `locomotion`, `guard`, `blow`, and the optional
`kick` and `support`. An empty optional slot means the fighter does not do that.

**Rules the design holds to:**

- **A part is data.** Players compose parts; they never supply code. A trained policy would be a
  part whose weights are data.
- **Research `tuning` stays on the part it tunes** and never travels in a link, as today.
- **A skill is the unit of choice for its action.** A blow skill owns the whole blow: wind-up,
  swing and return.
- **The tactics read what the skills can do, and never their settings.** Whether a fighter kicks
  is whether it has a kick skill. Whether it fights from the ground is whether it has a support
  skill. The timings the path tactics plan by come from the blow skill's `abilities`. Each choice
  lives in one place.
- **A combination that cannot work is a fault, named by its path in the tree**, for example
  `skills.blow: the path strike carries out a blow only along a path, and these tactics name
  none`. The Arena already shows a fault and plays the preset whole. Every screen does the same.
- **A selector is a part.** `choose-blow` holds a list of blow parts and a policy. `hosting`
  already chooses among ranked sub-minds the same way.
- **Presets keep their ids** (`classic`, `combat`, `brawler`, `scrapper`, `kicker`, `crawl`), so
  today's links still pick the same mind.

## Decided (owner, 2026-10-09)

- **Nothing is hidden.**
  - Every part of a role is listed in its picker. A part that does not fit the body, or that the
    screen does not provide for, is shown disabled, with the reason.
  - Experimental parts are offered beside the game's, each labelled "experimental". There is no
    switch.
  - A part's research `tuning` is shown read-only under it, in the editor and the inspector.
- **A link is an implementation detail**, done the simplest way that works.
  - A side's mind travels as its preset's id or, once edited, as its whole config in JSON, one
    parameter.
  - No per-setting keys, no old-key aliases, no diffing against the preset.
  - The writer leaves `tuning` out, and the reader drops any it finds, so research settings still
    never travel in a link.
  - A config with a fault plays its preset, as today.
- **The Crypt.** The player configures the party's minds. Enemies have their model's
  pre-configured mind, which the player can view in the inspector but not change.

## Chunks, each landing green

Every chunk changes mind or skill contracts, so each runs the full gate:

- `npm test`, `npm run check` and `npm run build`;
- `node --test tests/core-boundary.test.mjs tests/exports.test.mjs tests/comments.test.mjs`;
- the line-ending gate and `git diff --check`.

**The behaviour lock** is `scripts/fingerprint.mjs`, run on the commit before the chunk and again
on the chunk:

```powershell
node scripts/fingerprint.mjs --workers 12 --json research/runs/minds/before-<n>.json
node scripts/fingerprint.mjs --workers 12 --compare research/runs/minds/before-<n>.json
```

Chunks 1 to 4 and 6 are structural for every existing preset, and leave every pose line as it was.

**The stop rule.** A chunk that cannot hold the lines does not land with them moved. It stops, and
the difference is reported with the case and the step where the poses part.

Browser checks use `npm run preview -- --port 5181`, killed by PID afterwards. Port 5180 may be
the owner's.

### 1. Parts and slots: the registry, links and a recursive panel

Nothing changes how a body moves. The sub-minds become parts, and today's `down` field becomes
the fighters' `subs` slot.

**Files:**
- `src/core/mind/parts.ts` (**new**):
  - `Role`, `Stage`;
  - `Part<C>` (role, label, stage, fields, slots, `defaults`, `fits(spec, config)`,
    `faults(config)`);
  - `Slot<C>`: key, label, role, `many`, `optional`, `read(config)`, `write(config, value)`;
  - `slot()` and `slotList()`, beside `choice()`, `toggle()` and `number()`.

  Generic over the tree:
  - `partOf(config)`, which throws for an unknown kind as `controllerOf` does;
  - `treeFaults(config)`: each fault prefixed with its path (`subs.0`);
  - `treeFits(spec, config)`;
  - `withoutTuning(config)`: the tree with every part's `tuning` left out;
  - `kindsFor(role, spec, offered)`: every part of a role, each with null or the reason it
    cannot go there: it does not fit the body, or needs what the screen does not provide
    (`offered`, chunk 4's `script`). A slot set to a kind takes that kind's `defaults`.
- `src/core/mind/fields.ts`:
  - `ControllerField` becomes `PartField`;
  - `down()` and `DOWN` are deleted.
- `src/core/mind/sub-minds.ts`: `SUB_MIND_PARTS`, one entry per `SubMindConfig` kind:
  - `lie`: "Lie still";
  - `staged-rise`: "Rise by stages";
  - `support-recovery`: "Rise, then steady".
- `src/core/mind/controllers.ts`:
  - `Controller` becomes `MindPart extends Part`, keeping `presets`, `builtIn` and `create`;
  - `CONTROLLERS` keeps its role;
  - `fieldsOf` and `controllerOf` are replaced by `partOf`;
  - each fighter gets a `subs` slot of role `sub-mind`, `many`.
- `src/core/mind/catalog.ts` (**new**): `PARTS`, every part by kind across roles, typed so
  that a kind without an entry does not compile, as `CONTROLLERS` is.
- `src/core/mind/minds.ts`: `createMind` refuses a config with any `treeFaults`.
- `src/core/models.ts`: `modelSupportsMind` reads `treeFits`.
- `src/ui/mind-link.ts` (**new**, no DOM):
  - `readMind(text, preset)`: the config parsed from JSON with its tuning dropped, or the preset
    for text that does not parse, a kind no part has, or a tree with a fault;
  - `writeMind(config)`: `withoutTuning`, as JSON.
- `src/ui/mind-editor.ts` (**new**): `mindEditor(config, { label, spec, offered, onChange })`,
  drawing the tree recursively:
  - a field as today's panel draws it, through the field's own `read` and `write`;
  - a single slot as a picker of every kind `kindsFor` gives, the ones that cannot go there
    disabled with their reason, opening the chosen part's own fields and slots beneath;
  - a list slot as an ordered list with add, remove and move up;
  - a part of stage `experimental` labelled so;
  - a part's `tuning`, read-only;
  - faults with their paths.
- `src/arena/matchup.ts`:
  - a side's mind is `&control=` (its preset), or `&left.mind=` / `&right.mind=`, the whole
    config through `readMind`, which wins;
  - `settled`, `linkedSettings`, `settingsSearch`, `settingKey` and `GUARD_PARAM` are deleted;
  - `readMinds` and `controllerLabel` read the two parameters.
- `src/arena/main.ts`: the settings panel is `mindEditor`. The panel's DOM handling stays as
  AGENTS.md says: stop `pointerdown`, blur on change.
- `scripts/fingerprint.mjs`: reads minds through `readMinds` as before.
- `tests/core-parts.test.mjs` (**new**), `tests/core-controllers.test.mjs`,
  `tests/arena-controls.test.mjs`
- `docs/architecture.md` (Minds); `AGENTS.md` (Pages: `&left.mind=` in place of
  `&left.<field>=`)

**Tests:**
- every kind in `PARTS` has a role, and every slot's role has at least one part;
- every preset, with `tuning` set on it, goes through `writeMind` and `readMind` back to itself
  without the tuning, as a whole record;
- text that does not parse, an unknown kind, and a tree with a fault each read as the preset;
- a fault in a nested part comes back with its path;
- a part of the wrong role in a slot is a fault;
- `kindsFor` lists the quadruped's mind for a humanoid, disabled with its reason;
- with `withoutTuning` made to keep one part's tuning, the round-trip test goes red.

**Gate:** the full gate, and the behaviour lock unchanged. In the browser, check the Arena's
panel for every preset, with a sub-mind added, moved and removed.

### 2. One skill set: role contracts and an arbiter

Nothing changes how a body moves. The two skill stacks become one arbiter over role-typed
skills, so a skill of a role can be swapped for another.

**Files:**
- `src/core/skills/skill.ts`, the contracts:
  - `Claim`, what a skill asks for this step:
    - `hands: Record<Side, EffectorGoal | null>`;
    - `posture: Pose | null`;
    - `pushes`;
    - `handPoses`;
    - `legs: LegsAsk`.
  - `LegsAsk`, a union by kind:
    - `free`: the tactics' walk;
    - `hold`: no walk;
    - `walk`: walk, face and steer;
    - `place`: a footing.
  - `AttackSkill<A> extends Skill`:
    - `accepts(attack)`;
    - `command(view, attack, legs, dt): Claim | null`;
    - `idle?(walking, dt)`;
    - `report`;
    - `abilities`.
  - `BlowSkill = AttackSkill<BlowAttack>`, `KickSkill = AttackSkill<KickAttack>`.
  - `Abilities`, what a skill set tells its tactics:
    - `paths: AttackTuning | null`;
    - `kick: KickTuning | null`;
    - `ground: boolean`.
- `src/core/skills/arbiter.ts` (**new**): `skillSet(body, tactics, { locomotion, guard, blow,
  kick, support }, settings): Skills`. It runs in the order `combatSkills` runs today:
  1. a kick under way, or asked for, blocks a blow;
  2. the blow's claim;
  3. the guard covers the hands the blow has not;
  4. the legs carry out the claim's `LegsAsk`, or the tactics' walk when it is `free`;
  5. the support skill adjusts the stance and posture;
  6. the kick's motion is merged last.

  Its report adds `holders`: for each of the legs, the trunk and each hand, the part that has it.
  The inspector reads it in chunk 4.
- `src/core/skills/strike.ts`: `strikeSkill` answers `BlowSkill`. `accepts` takes any blow, and
  the recipe strike throws its own recipe for the hand. Its `StrikeCommand` maps to a `Claim`:
  `footing` to `place`, and walk, face and steer to `walk`.
- `src/core/skills/combat.ts`: `pathStrike(body, settings)` answers `BlowSkill`: both hands'
  strike cycles, overlap, and the planted foundation. `accepts` takes a blow that names a path.
  `combatSkills` is deleted.
- `src/core/skills/kick.ts`: `kickSkill` answers `KickSkill`.
- `src/core/skills/support-fold.ts`: `supportFold` answers the arbiter's support slot.
- `src/core/skills/skills.ts`: `recipeSkills` is deleted. `Skills` and `SkillReport` stay.
- `src/core/mind/recipe-fighter.ts`, `src/core/mind/path-fighter.ts`, `src/lab/actor.ts`: make
  their skills with `skillSet`.
- `tests/core-strike-skill.test.mjs`, `tests/skill-arbiter.test.mjs` (**new**)
- `docs/architecture.md` (Skills)

**Tests:**
- the arbiter gives each hand to the blow's claim and the rest to the guard;
- a kick blocks a blow;
- `LegsAsk.place` reaches `legs.place`;
- `holders` names the parts;
- with the arbiter's order of steps swapped, a whole-path test on the stand goes red.

**Gate:** the full gate, and the behaviour lock unchanged. Under the stop rule, a stack that cannot
be re-expressed to the bit stays one composite part of its own until the difference is found;
the chunk then lands only the stack that holds.

### 3. Tactics and skills in the config: one fighter

Nothing changes how a body moves. Recipe fighter and path fighter become presets of one
`fighter`, whose tactics and skills are parts.

**Files:**
- `src/core/mind/config.ts`:
  - `FighterConfig { kind: "fighter"; tactics; skills: { locomotion, guard, blow, kick, support }; subs }`.
  - `TacticsConfig`:
    - `SeekConfig` (`seek`): `guard`, `aim`, `range`, and `tuning` `{ threat, edge }`;
    - `OpeningsConfig` (`openings`): `hands`, `strikes`, `prefers`, `defence`, `combinations`,
      `spacing`, `spacingStep`, and `tuning` `{ openings }`.
  - Skill configs, each with its `tuning` moved from the fighter's:
    - `stance-walk`: `turnLimit`, `turnStartup`;
    - `cover-guard`: `covering`;
    - `recipe-strike`: `repertoire`, `placed`, `steer`;
    - `path-strike`: `overlap`, plus `tuning` `paths`, `execution`;
    - `front-kick`: `Partial<KickTuning>`;
    - `support-fold`.
  - `kicks` and `ground` leave the config: they are the `kick` and `support` slots.
  - Today's presets are re-expressed under the same names and ids: `RECIPE_FIGHTER`, `CLASSIC`,
    `COMBAT`, `BRAWLER`, `SCRAPPER`, `KICKER`.
- `src/core/mind/fighter.ts` (**new**): `createFighter`, `fighterFaults`.
  - The body's `feedback` and `contactIdentity` are asked for by the skills that read contact (the
    path strike), so a recipe fighter's body is built as today's.
  - `combinations` other than `none` needs `hands` `alternate`, as `pathFaults` says today.
- `src/core/mind/recipe-tactics.ts`, `src/core/mind/path-tactics.ts`: tactics made from their
  part and the skill set's `Abilities`, never from a fighter config. `resolvePath` is split by
  part.
- `src/core/mind/tactics-of.ts` (**new**): `tacticsOf(config, spec, name, abilities, orders)`.
- `src/core/mind/recipe-fighter.ts` and `path-fighter.ts` are deleted.
- `src/core/mind/controllers.ts`: one `fighter` entry with all five fighter presets.
- `src/core/tasks/support-entry.ts`, and the research scripts that build fighter configs:
  `research/arena-combat.mjs`, `body-cost.mjs`, `bout-trace.mjs`, `core-rise-trials.mjs`,
  `core-rise.mjs`.
- `tests/core-parts.test.mjs`, `tests/core-controllers.test.mjs`, `tests/arena-controls.test.mjs`,
  `tests/arena-fork.test.mjs`, `tests/core-fork.test.mjs`, `tests/core-ground.test.mjs`,
  `tests/harness/fork.mjs`
- `docs/architecture.md` (Minds), `docs/reference/controller-presets.md` (the presets' new shape,
  same figures)

**Tests:**
- every preset id reads to its re-expressed config;
- Classic with its blow set to the path strike is a fault at `skills.blow`, and the preset plays;
- Combat with its blow set to the recipe strike plays;
- a fighter with no kick skill never asks for a kick;
- a forked bout under each preset goes on as the unforked one.

**Gate:** the full gate, and the behaviour lock unchanged. In the browser, every preset in the Arena
shows its tree, and a link written from an edited tree opens the same bout.

### 4. The Lab and the Crypt take configs, and the inspector

Nothing changes how a body moves under the default minds.

**Files:**
- `src/core/mind/minds.ts`: `MindWiring.script?: Tactics`, the tactics a page supplies.
- `src/core/mind/tactics-of.ts`, two tactics parts:
  - `script`, which needs `offered.script`, and carries out the page's script;
  - `stand`, which stands in guard facing its heading (today's `LAB_MINDS.guard`).
- `src/lab/actor.ts`:
  - `labActor(built, world, { mind: FighterConfig, assist, stance, allows })`;
  - `drive(script, { watch })` makes the mind with `wiring.script` set to the barred and
    watched script;
  - a mode's `RecipeOptions` become the recipe strike's and the guard's `tuning` in the config it
    passes;
  - `deciding` moves here from `src/lab/minds.ts`.
- `src/lab/minds.ts`: deleted. `LAB_MINDS` and `LAB_DOWN` become two Lab presets in
  `src/lab/scenarios.ts`:
  - `script`: the script on the game's recipe skills, lying still;
  - `guard`: standing in guard.
- `src/lab/scenarios.ts`: `&mind=` is a Lab preset's id or a whole config (`readMind`). `&down=`
  is deleted: it is the config's `subs`.
- `src/lab/blow.ts`, `src/lab/routine.ts`: pass their skill overrides as config `tuning`.
- `src/lab/hud/character-section.ts`: the Type and Down choices become `mindEditor`.
- `src/lab/hud/thinking-section.ts`: the inspector.
- `src/dungeon/run.ts`: `RunOptions.minds`, the party's configs by model. Enemies take their
  model's (`modelInfo`).
- `src/dungeon/main.ts`:
  - the start panel's party rows get a mind picker and `mindEditor`;
  - the party's minds travel as `&mind=`, through `readMind`;
  - the selected member's panel shows the inspector;
  - an enemy under the cursor (`src/dungeon/hover.ts`) or selected shows the inspector, read-only.
- `src/ui/mind-inspector.ts` (**new**): `mindInspector(minded, config)` draws the config's
  tree, marking live:
  - who has the body (`PhysicalBody.has`);
  - which part holds the legs, the trunk and each hand (`SkillReport.holders`);
  - each selector's last choice and its counts (chunk 5).
- `src/arena/main.ts`: the inspector for each side, in the bout's HUD.
- `tests/lab-actor.test.mjs`, `tests/lab-scenarios.test.mjs`, `tests/lab-blow.test.mjs`,
  `tests/lab-routine.test.mjs`, `tests/dungeon-party.test.mjs`, `tests/ui-mind-link.test.mjs`
  (**new**)
- `docs/architecture.md` (Minds, The screens), `README.md` (choosing and changing a mind)

**Tests:**
- `&mind=script` and `&mind=guard` open the scenario under the minds `LAB_MINDS` gave;
- on a screen that provides no script, the `script` tactics part is listed disabled, with its
  reason;
- a party member given a path fighter in `RunOptions.minds` is built under it, while the
  enemies keep their model's;
- the inspector's holders name the blow part while a blow is under way, and the guard's after it.

**Gate:** the full gate, and the behaviour lock unchanged (the Lab's run and routine, and the
crypt's runs, are among its cases). In the browser, on each of the three screens: open a mind,
change a part, see the inspector follow a bout.

### 5. Choosing between skills

**Files:**
- `src/core/skills/choose.ts` (**new**): `chooseSkill<A>(options, policy)` answers
  `AttackSkill<A>`.
  - A choice is made when a blow begins. That option keeps the body until its report says the
    blow has ended. The others idle, and are resumed when the body is theirs again.
  - The policies, all deterministic, with no random number:
    - `first-able`: the first option that `accepts` the attack;
    - `rotate`: each blow begun goes to the next option that accepts it;
    - `scored`: the option with the highest (landed + 1) / (thrown + 2) from its own reports,
      ties to the higher rank. The counts are in its `state`, so a fork carries them.
  - Its `abilities` are the first option's. Its report adds `chosen` and the counts.
- `src/core/mind/config.ts`: `ChooseBlowConfig { kind: "choose-blow"; options: BlowConfig[];
  policy }`, with a list slot `options` of role `blow`. An empty list is a fault.
- `src/core/skills/arbiter.ts`: the `blow` slot takes it like any blow part.
- `tests/core-choose.test.mjs` (**new**)
- `docs/architecture.md` (Skills)

**Tests:**
- `rotate` alternates between two parts;
- `scored` moves to the option that lands, with one option mutated never to land;
- `first-able` falls through to the option that accepts;
- a fork in the middle of a blow goes on to the bit;
- with the counts kept outside `state`, the fork test goes red.

**Gate:** the full gate, and the behaviour lock unchanged, since no preset uses the selector. In
the browser, an Arena fighter given `choose-blow` over the recipe strike and the path strike
shows each choice in the inspector.

### 6. The research skills as experimental parts

Each part changes no preset. Each is measured on the punch competency, and its cost per step is
read.

**Files:**
- `src/core/skills/combat.ts`: `driven-strike`, the punch layer, as a blow part of stage
  `experimental` sharing `pathStrike`'s code under a setting:
  - a flat-out trunk turn in the swing;
  - the arm aimed from where the trunk is;
  - a deeper wind-up;
  - a swing time from the distance and a target speed.

  It is rebuilt from the prototype recorded in
  `docs/analysis/2026-10-08-punch-layer.md` ("A layer on the tracked arm"). Its fields are the
  ones that study varied.
- `src/core/skills/whole-body-strike.ts` (**new**): the spike's solve (`wholeBodyTracking`)
  under a blow, as a blow part of stage `experimental`.
  - A field `drive`: `timed`, the spike's path; or `flat-out`, the greedy test's push along the
    line.
  - While its blow is under way it claims the legs, the trunk and both hands.
  - What `research/whole-body-spike.mjs` and `research/greedy-punch.mjs` built for this moves
    here, and the scripts import it.
- `research/competencies.mjs`, `research/control-foundation-trials.mjs`: the punch competency
  takes a blow part (`--blow <kind>`, with `--blow-settings <path=value,...>`).
- `docs/reference/competencies.md`: each part's punch rows at 120 and 480 Hz.
- `docs/reference/step-cost.md`: each part's time per body per step while it strikes.
- `tests/core-experimental-blows.test.mjs` (**new**)

**Tests:**
- on the stand, each part takes a blow, lands it or misses, gives the body back, and the body
  stays up;
- each part is `experimental`, and is offered in every blow picker with that label.

**Gate:**
- the full gate, and the behaviour lock unchanged;
- the punch competency rows for each part, recorded whether they pass or not;
- each part's step cost recorded.

In the browser, each part is chosen and watched in the Arena and the Lab.

## Out of scope here

- **The ceiling search's schedules.** They are fitted muscle timetables: a measuring stick, not a
  controller, and they are not parts. Replaying one in the Lab would need a plan of its own.
- **The skill contract that tactics choose by** (`ready`, `estimate`), which is
  [Robust skills](2026-10-08-skills-platform.md) chunk 4. It extends the role contracts of chunk 2
  here. When it lands, `chooseSkill` gains an `estimate` policy. Whichever of the two lands second
  builds on the other in `src/core/skills/skill.ts`.
- **Parts for the quadruped and the skeleton beyond their minds.** They take slots on the same
  registry when they have skills of their own to offer.
- **Saving minds a player has made** under names of their own. Links carry them meanwhile.
