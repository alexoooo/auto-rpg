# Warrior punch

Notes on where the Warrior's punch stands. They say what is true now and how to read it again;
what is worked next is the run's brief ([AGENTS.md](../../AGENTS.md#the-rules)), never a line here.

## Goal

Raise the value of the Warrior's punch: the table's `punch` row on `workshop-fighter`, its cells
the loadouts with an empty hand (`empty,empty`, `empty,club`, `empty,sword`). The value is the
life a punch trades a second ([the table](../reference/the-table.md)). The punch is the straight
punch at the trunk with an empty hand; no other blow is part of this goal.

## Where it stands

The row's cells are not read. Each reads two protocols of the Strike drill: a still target
(`still`) and a target walked to (`walk`), each asking the punch
where it is offered: the middle mark (the trunk), with each empty hand. The still and walked-to
target stands with its arms lowered (`drill-stand`), and no reading against it is played yet:

```powershell
npm run evaluate -- table --body workshop-fighter --skill punch --play --baseline --workers <logical processors>
npm run evaluate -- table --body workshop-fighter --skill punch --by hand
```

The first plays the row and names its baselines; the second reads it again, playing nothing.

What is known of the installed punch, from trials against a target standing in guard, which
stopped 2 of 96 of them:

- **Where it lands, the blow is strong**: the fist meets the mark at a median 7.3 m/s, above a
  person's rear hand.
- **It landed about three in four, still or walked to**: 23 of 32 and 46 of 64 with empty hands.
  The window reaches 0.06 m past the punch's stand-off (`band`), and the steer is trained on that
  window; the rest were refused (5 and 7), missed or began outside it.
- **In a fight it lands three of eight** (`fight`), which is no part of the row: what the punch
  brings in a fight is its profile's. The punch's window is not where fighters
  stand ([the approaches](../approaches.md#unarmed-strikes)): footwork and openings, the Mind's
  and not the punch's ([Blows in fights](../roadmap.md#next)).

What is not checked: no fresh agent has checked the installed steer
([the claim](../recipes/skill.md#the-claim)).

## Open questions

- **Why trunk punches are refused**: against the guarded target 5 of 32 still and 7 of 64 walked
  to ended `refused` with no reason, in the window and ready. A trial's last phase and its times are read with `drillTrial`
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
  built from the Strike drill's fights (`--protocol fights`) by
  `research/skills/strikes/strike-profiles.mjs` into
  `assets/skills/strikes/strike-profiles/strike-profiles.json`. The asset's are still the ones
  measured at a drill's target; no fight is played for them yet.
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
