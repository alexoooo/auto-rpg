# The table

Option Mind on every body, loadout and skill (`src/evaluation/table/`), each cell valued in the
game's own terms (`trialValue`), every trial its own value:

| Skill | Value | Better |
| --- | --- | --- |
| stand-up | seconds from a fall made to a verified stand, a fall not stood at the 30 s cap (`timeToStand`) | lower |
| walk, run | seconds lost against the orders (`orderTime`), a trial ended down charged the rest of its rise (`ordersValue`) | lower |
| punch, stomp, bonk, cut, thrust | life taken from the target less life lost, a second of the action's cycle from its start to the limb back at guard, a fall adding its rise (`strikeValue`) | higher |
| buckler-cover | life lost to the opponent's blows over the trial, those while down among them (`coverValue`) | lower |

- **Seconds lost against the orders**: under a move with a pace, the seconds the progress along
  the way asked falls short of that pace over the order's span (faster gains nothing); with no
  pace, short of 4 m/s (`UNPACED`, a person's run), so faster gains; under a stop, every second
  not standing still. A body down makes no progress.
- **A fall's rise** is the body and loadout's stand-up value now, the cap where it is unread, so
  a risky act and a safe one are priced alike.
- **What does not count**: a fall not made, a blow not begun (the Mind refused it), a cover never
  attacked. Their counts are reported beside the value.
- **The figures beside** a value decide nothing: a strike's hit against the person's (`BAR`), the
  falls stood within the owner's 10 s, the share of blows the buckler met first.

A reading counts only over its whole protocol: every case present and none faulted. A cell's
value is the mean of every counted trial of its readings; a cell whose readings are whole with no
trial counted (every blow refused or never begun, every cover unattacked) is marked nothing
counted, its counts beside it. The Warrior's run reads the Travel confirmation protocol, the Rogue's the
Locomotion run protocol, the walk the Locomotion `every` protocol on every body.

A cell is compared with its baseline, its first reading when its work begins (named by
`npm run evaluate -- table --baseline`: a pointer at that reading's result, which is then kept),
trial by trial on the conditions both counted, every reading of the cell pooled
(`compareValues`): better or worse where the 95 % paired bootstrap interval of the mean difference
leaves zero on that side, else within noise.

`npm run evaluate -- table` reads the drills' results (`assets/evaluations/<drill>.json`,
`src/evaluation/results.ts`) and links each reading's Ratings page. A result keeps a few numbers a
trial, what its judge needs (`keep`), by the name of the trial's condition, so the table plays
nothing to read. It derives the required cases from each current protocol. A reading
read at an earlier version (its subject's, or the code of a case it played: the drill and its
opponent) stands as it was read, its commit and date shown and marked not
the version now: its trials answer the protocol's cases by condition, so a change elsewhere in the
mind asks for no replay.

`npm run evaluate -- table --play --workers 22` plays each reading that has no whole result and
keeps it; a reading read at an earlier version is kept, so a change to the code plays
nothing. `--fresh` plays the readings of the cells asked for (`--body`, `--skill`, `--loadout`)
again on the code now; the stand-up reading that prices a fall is played again only where a cell
asked for reads it. Both play one reading at a time, each to evaluate's budget (`--budget`, 10 minutes): a pass keeps every
trial it plays (`.tmp/evaluations/`) and every complete unit in its result, names a reading that failed at its end and
plays the rest, and with `--baseline` names a cell's baseline as soon as its reading is whole.
Passes are repeated until none plays. Node, core world, 120 Hz, each command 1 step late
(`COMMAND_DELAY`). The report names each
reading's harness and whether its version is current. Incomplete current coverage cannot become a
baseline.
