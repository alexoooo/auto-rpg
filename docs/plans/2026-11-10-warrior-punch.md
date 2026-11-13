# Warrior punch

Notes on where the Warrior's punch stands. They say what is true now and how to read it again;
what is worked next is the run's brief ([AGENTS.md](../../AGENTS.md#the-rules)), never a line here.

## Goal

Raise the value of the Warrior's punch: the table's `punch` row on `workshop-fighter`, its cells
the loadouts with an empty hand (`empty,empty`, `empty,club`, `empty,sword`). The value is the
life a punch trades a second ([the table](../reference/the-table.md)). The punch is the straight
punch at the trunk with an empty hand; no other blow is part of this goal.

## Where it stands

The row reads a still target (`still`) and a target walked to (`walk`), each standing with its
arms lowered (`drill-stand`). Each asks the straight punch at the trunk, with each empty hand,
against the Warrior, the Rogue and the Skeleton. Read the saved results, playing nothing:

```powershell
npm run evaluate -- table --body workshop-fighter --skill punch
npm run evaluate -- table --body workshop-fighter --skill punch --loadout empty,empty --by gap
```

Values are hp traded a second; counts are begun / on the mark / trials. Every cell is within
noise of its baseline, which names the same saved reading.

| Loadout | Cell | Still: value; counts | Walk: value; counts |
| --- | --- | --- | --- |
| `empty,empty` | 0.165 | 0.107; 52 / 33 / 96 | 0.194; 188 / 137 / 192 |
| `empty,club` | 0.176 | 0.067; 28 / 13 / 48 | 0.231; 96 / 64 / 96 |
| `empty,sword` | 0.225 | 0.126; 29 / 16 / 48 | 0.274; 95 / 71 / 96 |

The empty-handed still reading has 44 not begun: 37 `outside`, six `unbegun`, one `refused`.
Its median fist speed on the mark is 7.13 m/s; the walk's is 6.91 m/s (the person's rear hand
6.8 m/s, lead 5.3 m/s). The club and sword still readings have 20 and 19 not begun, including
20 and 18 `outside`, respectively. Their causes are not diagnosed here.

What is not checked: no fresh agent has checked the installed steer
([the claim](../recipes/skill.md#the-claim)).

### Why the close trials do not begin

All 42 empty-handed still trials not begun at gaps 0.6–0.9 m reproduce their saved outcome in
Node, on `rapier-coordinate`, at 120 Hz with one command step of delay. Each is traced on every
step, then confirmed on its own condition with only run-local footwork changes. Every confirmation
begins with the installed punch settings and network unchanged. These are causes of failure to
begin, not a reading of a better installed skill.

| Gap, m | Footwork: travel facing (`outside`) | Footwork: strike order not retried (`unbegun`) | Total footwork |
| --- | --- | --- | --- |
| 0.6 | 12 | 0 | 12 |
| 0.7 | 12 | 0 | 12 |
| 0.8 | 8 | 4 | 12 |
| 0.9 | 4 | 2 | 6 |

Punch, mixed punch-and-footwork, neither and unresolved each count zero.

**Travel facing, 36 trials.** The drill orders a `place` at `straightSpot` with a facing toward
the target (`src/minds/command/drill.ts`). `orderedIntent` (`src/minds/ordered.ts`) sets
`travelFacing` when `facing === null || request.kind !== "direct"`: the navigator's direction
overrides the ordered facing while travelling (`navigated`,
`src/skills/framework/arbiter.ts`). From close, that turns the body away as it walks out.
The stance's heading turns only while it walks (`walking`, `src/skills/locomotion/locomotion.ts`),
so a stop near the right place can leave it facing away and outside the window. In 35 trials the
menu never becomes ready; the remaining trial, `ffa5de93` (Warrior, right hand, across 0.2 m,
gap 0.9 m), turns back and approaches again, entering the geometry only at 8.383 s, still swinging,
before patience ends it at 8.5 s.

Representative `68042329`: Warrior target, left hand, across 0, gap 0.6 m
([Ratings](https://alexoooo.github.io/auto-rpg/?play=ratings&evaluation=strike&protocol=still&subject=option-drill%2Fstraight-punch)).
At the step ending 0.508 s, the target is 0.385 m ahead of the stance against a window of
0.702–0.812 m; the head is another 0.010 m forward. The drill orders a place 0.354 m away,
facing 1.345 rad. By 5 s the body stands within 0.003 m of the window's computed spot but its
heading is 5.168 rad against the spot's 2.068 rad. It never receives a strike order. At 8.5 s it
stands at 0.002 m/s, the target 0.842 m behind it against a window 0.778–0.888 m ahead.
Changing only the copied `orderedIntent` predicate to `facing === null` preserves the explicit
facing while walking: this trial begins at 5.275 s. Immediately before admission the body stands
at 0.032 m/s with the target 0.738 m ahead, inside 0.705–0.815 m. The same isolated change
makes each of the 36 trials begin, at 3.792–7.100 s.

**Strike order not retried, six trials.** The drill sees readiness near the window's inner edge,
orders a strike, and enters `striking`. Its `if (!begun) return decided(member,
strike(state.struck!, state.set))` keeps ordering a stand and strike after readiness becomes
`position`, without walking back into the window. All six stay quiet outside it until 8.5 s.

Representative `3d8b5e1d`: Rogue target, left hand, across 0, gap 0.9 m
([Ratings](https://alexoooo.github.io/auto-rpg/?play=ratings&evaluation=strike&protocol=still&subject=option-drill%2Fstraight-punch)).
At 0.508 s the strike is ordered with the target 0.669507 m ahead against a near edge
0.668568 m; the head is 0.009899 m forward of the stance. At 0.517 s the target is
0.668354 m ahead against 0.668528 m: outside by 0.000174 m while the body stands at
0.058 m/s. The order remains latched. At 8.5 s the target is 0.622 m ahead against a near
edge 0.663 m and the body stands below 0.001 m/s. A copied drill that resumes positioning
when an unbegun strike's readiness becomes `position` removes that latch; on its own it
encounters the travel-facing failure and still does not begin. With that change and the copied
facing predicate above, the trial begins at 3.367 s, standing at 0.032 m/s with the target
0.675 m ahead inside 0.660–0.770 m. Each of the six begins with these two footwork changes,
at 3.292–3.817 s; one misses afterward. Trace times name the step just completed; the body's
view used for readiness is one physics step earlier.

The window is attainable and quiet enough for admission on every diagnosed condition. These
42 failures support correcting the drill's footwork; they supply no reason to choose a dedicated
close punch over a punch spanning close and far ranges. Whether either delivers a useful blow
without backing out remains open. No diagnostic change is installed, and the saved readings
remain unchanged. Unchecked: the two not begun at 1.1 m, the club and sword cells' causes,
the Rogue's and Skeleton's own punches, the walk rung, 480 Hz, fights, Option Mind's combat
footwork and every reel.

## Open questions

- **Why trunk punches are refused**: against the guarded target 5 of 32 still and 7 of 64 walked
  to ended `refused` with no reason, in the window and ready. A trial's last phase and its times are read with `playTrial`
  (`research/drill-trials.mjs`: its reading's `phase`) on the cell's subject, one case at a time; the
  reel (the Ratings link on each reading's line, opened as
  [the table](../reference/the-table.md) says) shows it.
- **Whether a later checkpoint of the steer lands more**: a checkpoint is screened on
  `punch-policy-check.mjs` (its environment's twin places at 120 Hz; with `--cell`, the cells'
  own cases at 120 and 480 Hz, the worse counting) against the installed network.

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
- **Research**: `research/skills/strikes/straight-punch/` holds the schedule search on
  the row's training twins (`punch-drill.mjs`, its `--confirm` on the cells' own cases), the screen
  of a schedule or a policy (`punch-policy-check.mjs`) and the training environment, on the twin. The installed network is the record's own; a policy is screened
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
