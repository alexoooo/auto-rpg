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

Values are hp traded a second; counts are begun / on the mark / trials. The cell's mark compares
it with its baseline, using the paired 95% interval.

| Loadout | Cell | Against baseline | Still: value; counts | Walk: value; counts |
| --- | --- | --- | --- | --- |
| `empty,empty` | 0.256 | better | 0.275; 96 / 78 / 96 | 0.246; 192 / 152 / 192 |
| `empty,club` | 0.190 | within noise | 0.169; 48 / 34 / 48 | 0.200; 96 / 74 / 96 |
| `empty,sword` | 0.249 | within noise | 0.252; 48 / 32 / 48 | 0.248; 96 / 74 / 96 |

Every Warrior punch trial begins, across all three loadouts. Each still reading is better than
its baseline; the empty-handed walk is better, the club and sword walks within noise. The
empty-handed still reading's median fist speed on the mark is 6.94 m/s; the walk's is 7.16 m/s
(the person's rear hand 6.8 m/s, lead 5.3 m/s). The walks end down in three empty-handed trials,
one with the club and one with the sword; their values include the fall's price.

What is not checked: no fresh agent has checked the installed steer
([the claim](../recipes/skill.md#the-claim)), and the drill's fight reading and Option Mind's combat
footwork remain unread for this goal.

### Why the close trials do not begin

The empty-handed still cases at gaps 0.6–0.9 m begin on all 48 conditions: 45 land, three miss.
The saved readings use Node, `rapier-coordinate`, at 120 Hz with one command step of delay.

**Facing on the final approach.** Place and range orders with an explicit facing keep it over
the final metre (`FACE_NEAR`, `src/minds/ordered.ts`), so a short backing correction faces the
target throughout. Before that, navigation supplies the route's facing (`facesTravel`,
`src/skills/framework/intent.ts`, applied in `arbiter.ts`), allowing the forward-only run on a
long trip. With no explicit facing, the route supplies it throughout. A direct walk keeps its
explicit facing. Standing holds the stance's heading (`walking`,
`src/skills/locomotion/locomotion.ts`), so the final facing is asked while the body still walks.

**An unbegun strike is positioned again.** The drill (`src/minds/command/drill.ts`) reads the
menu while its strike order has not begun. When readiness becomes `position`, it resumes its
ordinary walk into the window, then orders the strike again once admitted. A strike already
under way is carried through.

The window is attainable and quiet enough for admission on every Warrior still condition.
Whether a useful punch can be delivered without backing out remains open. Unchecked: the
remaining not-begun conditions on the Rogue and Skeleton, other strikes, walk and run drills,
480 Hz, fights outside the fingerprint, Option Mind's combat footwork and every reel.

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
