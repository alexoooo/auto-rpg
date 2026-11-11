# Warrior punch

## Goal

Raise the value of the Warrior's punch: the table's `punch` row on `workshop-fighter`, its cells
the loadouts with an empty hand (`empty,empty`, `empty,club`, `empty,sword`). The value is the
life a punch trades a second ([the table](../reference/the-table.md)). `empty,empty` is worked
first; the other two cells are read with every change and worked after it.

The work follows [the skill recipe](../recipes/skill.md): read it first, then the
[Unarmed strikes](../approaches.md#unarmed-strikes),
[Judging](../approaches.md#judging-a-skill-or-a-mind) and [Minds](../approaches.md#minds) sections
of the approaches and the commits their entries name (`git log -i --grep=punch`).

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
- **Half the cell is the head, and it is at a ceiling for a straight punch.** A blow not begun
  counts 0. The drill Commander asks for the choice of its member's menu at the mark it orders
  (`src/minds/command/drill.ts`), and Option Mind's punch names the middle mark alone
  (`STRAIGHT_PUNCH`, `src/entrants/option/mind.ts`). A straight punch cannot reach the drill
  target's head past its guard ([the approaches](../approaches.md#unarmed-strikes)), and the
  punch's record keeps it off the head (`above`). A blow around or over a guard is another skill,
  read on its own row.
- **At the trunk it lands about three in four, still or walked to.** The rest never come into the
  window (`outside`), miss, meet the guard or are refused.
- **In a fight it lands none of eight.** The punch's window is not where fighters stand
  ([the approaches](../approaches.md#unarmed-strikes)).
- **Holding a club or a sword**, the hand that holds it has no punch, so three quarters of those
  cells' cases are refused by the mark and the hand alone, and 78 to 85 % in all; the empty hand's
  trunk punch lands 4 and 5 of 16 on `still`, against 12 of 16 with both hands empty.

## The questions, by the value each can move

1. **The trunk cases it does not land**: 9 of 32 still and 17 of 64 walked to. By `gap`,
   `across`, `hand` and `start` (`--by`) they spread evenly. Two kinds come before the blow:
   `outside`, the walk never brings the body into the punch's window (`band` 0.03 m past its
   stand-off, `CROWDED` 0.05 m short of it), and a `refused` with no reason, in the window and
   ready but never settled for the drill to order it within its patience. The rest, walked to, miss
   or meet the guard. A trial's last phase and its times are read with `drillTrial`
   (`punch-drill.mjs`) on the game's mind (`MINDS.option.config`), one condition at a time; the
   reel (the Ratings link on each reading's line, opened as [the table](../reference/the-table.md)
   says) shows it.
2. **The fight.** None of eight lands. This is footwork and openings, the Mind's and not the
   punch's ([Minds](../approaches.md#minds)): the roadmap's
   [Blows in fights](../roadmap.md#next), not worked here. Its eight cases stay in the cell's
   value.
3. **The cells with a club or a sword**: why the empty hand's punch lands a third as often with
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
