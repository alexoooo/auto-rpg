# The table

The drills' Option Mind (`option-drill`: its priors, its options run in their order, no profile
and no tree search), its drill opponents made from it, on every body, loadout and skill
(`src/evaluation/table/`), each cell valued in the game's own terms (`trialValue`), every trial
its own value:

| Skill | Value | Better |
| --- | --- | --- |
| stand-up | seconds from a fall made to a verified stand, a fall not stood at the 30 s cap (`timeToStand`) | lower |
| walk, run | seconds lost against the orders (`orderTime`), a trial ended down charged the rest of its rise (`ordersValue`) | lower |
| punch, stomp, bonk, cut, thrust | life taken from the target less life lost, a second of the action's cycle from its start to the limb back at guard, a fall adding its rise; 0 for a blow not begun where it was asked (`strikeTrade`, `strikeOffered`) | higher |
| buckler-cover | life lost to the opponent's blows over the trial, those while down among them (`coverValue`) | lower |

- **Seconds lost against the orders**: under a move with a pace, the seconds the progress along
  the way asked falls short of that pace over the order's span (faster gains nothing); with no
  pace, short of 4 m/s (`UNPACED`, a person's run), so faster gains; under a stop, every second
  not standing still. A body down makes no progress.
- **A fall's rise** is the body and loadout's stand-up value now, the cap where it is unread, so
  a risky act and a safe one are priced alike.
- **A cell reads its skill on its own merit**, in a drill built for it: a blow at a still target
  and one walked to (`still`, `walk`), which let it happen. What a blow brings in a fight is
  another reading, its profile's, taken in fights and never in a cell
  ([the evaluations](../architecture.md#evaluations)).
- **A strike is asked only what its Mind offers**: a cell is a body, a loadout and a skill the
  Mind has there (`Skill.has`, `strikesBy`), and a strike's cases are the drill's conditions at
  the marks and with the limbs its Option names on that body (`caseFaults`). A drill's rung lists
  every mark and limb a strike is asked at; each strike's cases are its own of them.
- **No profile decides anything in a cell**: the cell's Mind prices by hand-set priors, never
  by a profile, so a skill's reading never depends on what its profiles said of it, and a change
  to a skill is read without rebuilding them. A strike drill orders the blow firmly
  (`Orders.firm`), and the Mind begins it as soon as the skill admits it, before it prices
  anything (`Choice.bound`); the stand-up drill leaves the way up to the Mind, priced by its
  priors. In a fight the game's Mind (`option`) chooses by its profiles.
- **A blow not begun is worth 0**: where the drill's fixture reaches a case the strike is offered
  at and no blow begins, the trial counts at 0. The skill did not deliver there: it refused the
  start (`refused`, `waiting`), the body never came into its window (`outside`) or fell first
  (`fell`), or it was ordered and its skill no longer admitted it (`unbegun`).
- **What does not count**: a fall not made, a blow whose fixture did not reach its case, a cover
  never attacked. Their counts are reported beside the value.
- **The figures beside** a value decide nothing: a strike's hit against the person's (`BAR`), the
  falls stood within the owner's 10 s, the share of blows the buckler met first.

A reading counts only over its whole protocol: every case present and none faulted. A cell's
value is the mean of every counted trial of its readings; a cell whose readings are whole with no
trial counted (every fall not made, every cover unattacked) is marked nothing
counted, its counts beside it. The Warrior's run reads the Travel confirmation protocol, the Rogue's the
Locomotion run protocol, the walk the Locomotion `every` protocol on every body.

A cell is compared with its baseline, its first reading when its work begins (named by
`npm run evaluate -- table --baseline`: a pointer at that reading's result, which is then kept),
trial by trial on the conditions both counted, every reading of the cell pooled
(`compareValues`): better or worse where the 95 % paired bootstrap interval of the mean difference
leaves zero on that side, else within noise.

`npm run evaluate -- table` reads the drills' results (`assets/evaluations/<drill>.json`,
`src/evaluation/results.ts`) and prints the grid: each cell's value and its mark against its
baseline. Asked for some cells (`--body`, `--skill`, `--loadout`), it prints their lines after the
grid: the cell, then a line a reading with its figures, how many trials came to each outcome, its
baseline and its Ratings link. The link follows the game's address, the built game served on a
port of its own (`npm run build`, then `npm run preview -- --port <port> --strictPort`).
`--by <field>` adds the outcomes at each value of one field of the conditions, any of them
(`mark`, `hand`, `gap`, `across`, `start`), so where a cell loses is read from its saved trials.
A result keeps a few numbers a trial, what its judge needs (`keep`), and its outcome, by the name
of the trial's condition, so the table plays nothing to read.

The table reads the game's rate, 120 Hz. 480 Hz is held out: a search and a confirmation read it
beside 120 Hz ([the skill recipe](../recipes/skill.md)), and no cell does. The cases a reading
must hold are its subject's of its protocol as they are now. A reading stands as it was read, shown with the commit
and date it was read at, until its cell is asked for again: its trials answer the protocol's cases
by condition, so a change to the code asks for no replay.

`npm run evaluate -- table --play --workers 22` plays each reading that has no whole result and
keeps it. `--fresh` plays the readings of the cells asked for (`--body`, `--skill`, `--loadout`)
again on the code now, and prints under each a line comparing it with the reading it replaced
(`replaced`), paired the way the baseline is: the version before against the version now, which
the baseline is not after a cell's first change. The stand-up reading that prices a fall is
played again only where a cell asked for reads it. Both play one reading at a time, each to evaluate's budget (10 minutes; the table takes no `--budget` of its own): a pass keeps every
trial it plays (`.tmp/evaluations/`) and every complete unit in its result, names a reading that failed at its end and
plays the rest, and with `--baseline` names a cell's baseline as soon as its reading is whole.
Passes are repeated until none plays. Node, core world, 120 Hz, each command 1 step late
(`COMMAND_DELAY`). A reading that is not whole cannot become a baseline.
