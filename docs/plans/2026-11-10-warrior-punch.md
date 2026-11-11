# Warrior punch

Notes on where the Warrior's punch stands. They say what is true now and how to read it again;
what is worked next is the run's brief ([AGENTS.md](../../AGENTS.md#the-rules)), never a line here.

## Goal

Raise the value of the Warrior's punch: the table's `punch` row on `workshop-fighter`, its cells
the loadouts with an empty hand (`empty,empty`, `empty,club`, `empty,sword`). The value is the
life a punch trades a second ([the table](../reference/the-table.md)). The punch is the straight
punch at the trunk with an empty hand; no other blow is part of this goal.

## Where it stands

The row, from saved results, playing nothing:

```powershell
npm run evaluate -- table --body workshop-fighter --skill punch --by mark
npm run evaluate -- table --body workshop-fighter --skill punch --by hand
```

Each cell reads three protocols of the Strike drill: a still target (`still`), a target walked to
(`walk`) and a moment of a fight (`fight`), each asking the punch where it is offered: the middle
mark (the trunk), with each empty hand. The cells read 0.888 (`empty,empty`, within noise of its
baseline), 0.555 (`empty,club`, better) and 0.798 hp a second (`empty,sword`, better). The
`empty,empty` cell's trials:

| Protocol | Value | Trials |
| --- | --- | --- |
| `still` | 1.106 | 23 landed, 5 refused, 2 outside, 1 guarded, 1 missed |
| `walk` | 0.881 | 46 landed, 7 refused, 6 missed, 4 outside, 1 guarded |
| `fight` | 0.068 | 3 landed, 2 elsewhere, 1 guarded, 1 refused, 1 outside |

What they say:

- **The blow is not what limits the cell.** Where it lands, the fist meets the mark at a median
  7.3 m/s, above a person's rear hand.
- **It lands about three in four, still or walked to.** The window reaches 0.06 m past the
  punch's stand-off (`band`), and the steer is trained on that window, so few trials stay
  `outside`; the rest are refused or miss.
- **The target's guard stops 3 of the 104 still and walked-to trials.** That target stands in
  guard (`drill-stand`, `src/evaluation/strike/cases.ts`).
- **In a fight it lands three of eight.** The punch's window is not where fighters stand
  ([the approaches](../approaches.md#unarmed-strikes)): footwork and openings, the Mind's and not
  the punch's ([Blows in fights](../roadmap.md#next)).
- **Holding a club or a sword**, the empty hand's punch lands 10 and 8 of 16 on `still`.

What is not checked: no fresh agent has watched the installed steer's reel
([the claim](../recipes/skill.md#the-claim)), so the cells marked better are readings and no
claim.

## Open questions

- **Why trunk punches are refused**: 5 of 32 still and 7 of 64 walked to end `refused` with no
  reason, in the window and ready. A trial's last phase and its times are read with `drillTrial`
  (`punch-drill.mjs`) on the game's mind (`MINDS.option.config`), one condition at a time; the
  reel (the Ratings link on each reading's line, opened as
  [the table](../reference/the-table.md) says) shows it.
- **Whether a later checkpoint of the steer lands more**: a checkpoint is screened on
  `punch-policy-check.mjs` (160 trials a rate, seed 5001) against the installed network.

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
  the training environments. The installed network is the record's own; a policy is screened
  against it by extracting it (`network` in the record) to a file.
- **One protocol of the drill**, played and not kept:
  `npm run evaluate -- strike option/straight-punch --protocol still`; with `--write` it becomes
  the newest result the table reads. Price it from its first trials.
- **The row, played again on the code now**:
  `npm run evaluate -- table --body workshop-fighter --skill punch --fresh --workers <logical processors>`.
  Each reading has its baseline, so the lines then say better, worse or within noise.
- Work goes under `.tmp/warrior-punch/`.

## Completion

The owner takes the row as it reads. What worked then goes into the recipes, what the owner
accepts a mechanism cannot do into the approaches, and these notes are deleted.
