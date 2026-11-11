# Warrior punch

## Goal

Raise the value of the Warrior's punch: the table's `punch` row on `workshop-fighter`, its cells
the loadouts with an empty hand (`empty,empty`, `empty,club`, `empty,sword`). The value is the
life a punch trades a second ([the table](../reference/the-table.md)). `empty,empty` is worked
first; the other two cells are read with every change and worked after it.

The work follows [the skill recipe](../recipes/skill.md): read it first, then the
[Unarmed strikes](../approaches.md#unarmed-strikes),
[Judging](../approaches.md#judging-a-skill-or-a-mind) and [Minds](../approaches.md#minds) sections
of the approaches and the commits their entries name. `git log -i --grep=punch` lists about 500
commits; `git log -i --grep=punch --grep=head --all-match --oneline` lists the ones where a punch
met a head, the history of question 1.

## Where it stands

The row, from saved results, playing nothing:

```powershell
npm run evaluate -- table --body workshop-fighter --skill punch --by mark
npm run evaluate -- table --body workshop-fighter --skill punch --by hand
```

Each reading is its cell's baseline already (its line says `baseline this reading`), so
`--baseline` has nothing to name.

Each cell reads three protocols of the Strike drill: a still target (`still`), a target walked to
(`walk`) and a moment of a fight (`fight`). Every protocol orders the punch at the high mark (the
head) and the middle mark (the trunk), with each hand. The `empty,empty` cell's trials:

| Protocol | High mark | Middle mark |
| --- | --- | --- |
| `still` | 32 of 32 refused | 23 landed, 6 outside, 3 refused |
| `walk` | 64 of 64 refused | 47 landed, 5 missed, 5 outside, 4 guarded, 3 refused |
| `fight` | 8 of 8 refused | 3 outside, 2 guarded, 2 missed, 1 refused, none landed |

What they say:

- **The blow is not what limits the cell.** Where it lands, the fist meets the mark at a median
  7.3 m/s, above a person's rear hand.
- **Half the cell is the head, and the Mind has no punch for it.** A blow not begun counts 0. The
  drill Commander asks for the choice of its member's menu at the mark it orders
  (`src/minds/command/drill.ts`), and Option Mind's punch names the middle mark alone: its Option's
  default regions (`strikeKind`, `src/minds/option/kinds.ts`), which its config keeps
  (`STRAIGHT_PUNCH`, `src/entrants/option/mind.ts`). A punch at the head is a second Option of
  the punch's skill, its target and its aim its own
  ([one act an Option](../recipes/skill.md#an-options-code)), as the bonk is the club's at the
  head (`BONK_OPTION`); a mind's two strikes by one skill are told apart by name (`strikeName`).
- **At the trunk it lands about three in four, still or walked to.** The rest never come into the
  window (`outside`), miss, meet the guard or are refused.
- **In a fight it lands none of eight.** The punch's window is not where fighters stand
  ([the approaches](../approaches.md#unarmed-strikes)).
- **Holding a club or a sword**, the hand that holds it has no punch, so three quarters of those
  cells' cases are refused by the mark and the hand alone, and 78 to 85 % in all; the empty hand's
  trunk punch lands 4 and 5 of 16 on `still`, against 12 of 16 with both hands empty.

## The questions, by the value each can move

1. **A punch at the head.** It is half of every reading. Before anything is built, read what the
   punch does there as it is. In the working tree, add a second punch to the game's config
   (`OPTION_DEFAULTS.options`, `src/entrants/option/mind.ts`): `STRAIGHT_PUNCH_OPTION.defaults`
   with its `regions` the high mark, the centre aim those defaults carry (the bonk's at the head)
   and `STRAIGHT_PUNCH`'s support. Then play the `still` protocol, not kept:
   `npm run evaluate -- strike option/straight-punch --protocol still`. It plays the Warrior's and
   the Rogue's 64 cases each, the high mark and the middle. Its signal is the Warrior's 32 high
   cases: how many begin, how many meet the head, and the life they take.
   - **The trunk cases are the check on the run**: outcomes equal to the table above show that
     neither the code since those readings nor the second Option has moved the trunk punch. Where
     they differ, the protocol played on the tree unchanged says which did.
   - **Still refused**: each trial's line names its reason (the menu, the window or the entry),
     and that part is the next change.
   - **Begun and not reaching the head**: the skill recipe's step 3 for a head punch, its schedule
     searched at the high mark (`punch-drill.mjs`).
   - **Reaching the head and taking life**: the Option stays in the config, its profiles are built
     (`strike-profiles.mjs`), and the change is read on every body's punch row, because every body
     shares the config.

   What a fist takes from a head, and the threshold a bare fist is spared, are in
   [wounds](../reference/wounds.md#the-fist); read the threshold again before a punch is trained
   on the head. A drill opponent's guard stands over its head: a punch there goes around or over
   the guard, or waits for it to open.
2. **The trunk cases it does not land**: 9 of 32 still and 17 of 64 walked to. Read them by `gap`,
   `across`, `hand` and `start` (`--by`) for where they gather, then watch those in the cell's
   reel (the Ratings link on each reading's line, opened as
   [the table](../reference/the-table.md) says).
3. **The fight.** None of eight lands. This is footwork and openings, the Mind's and not the
   punch's ([Minds](../approaches.md#minds)): the roadmap's
   [Blows in fights](../roadmap.md#next), not worked here. Its eight cases stay in the cell's
   value.
4. **The cells with a club or a sword**: why the empty hand's punch lands a third as often with
   an item in the other hand.

## To pick it up

- **The skill**: the executor `src/skills/strikes/straight-punch.ts`, its part `punch-part.ts`,
  what its network reads `learned-punch.ts`, its window `strike-window.ts`; its record and the
  network's layout in `assets/skills/strikes/straight-punch/`.
- **The Option**: `strikeKind` and `STRAIGHT_PUNCH_OPTION` in `src/minds/option/kinds.ts`; the
  game's config in `src/entrants/option/mind.ts`; its profiles, which price it for the Mind, are
  built by `research/skills/strikes/strike-profiles.mjs` into
  `assets/skills/strikes/strike-profiles/strike-profiles.json`.
- **The drill**: its cases `src/evaluation/strike/cases.ts`, its reader and what each outcome
  means `src/evaluation/strike/read.ts`, its score `score.ts`.
- **Research**: `research/skills/strikes/straight-punch/` holds the schedule search
  (`punch-drill.mjs`), the held-out screen of a schedule or a policy (`punch-policy-check.mjs`) and
  the training environments; the kept training run is `research/runs/punch-ppo14/` (its README
  names each file).
- **One protocol of the drill**, played and not kept:
  `npm run evaluate -- strike option/straight-punch --protocol still`; with `--write` it becomes
  the newest result the table reads. Price it from its first trials.
- **The row, played again on the code now**:
  `npm run evaluate -- table --body workshop-fighter --skill punch --fresh --workers <logical processors>`.
  Each reading has its baseline, so the lines then say better, worse or within noise.
- Work goes under `.tmp/warrior-punch/`.

## Completion

Each cell of the row stands at a kept gain or a ceiling named from a reading, the report gives the
row's lines as the work began and as it ends, and the claim is made as
[the skill recipe](../recipes/skill.md#the-claim) says. What a mechanism could not do goes into
the approaches, what worked into the recipes, and this plan is deleted.
