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

A reading's value is the mean of its trials, and only over its whole protocol: every case present
and none faulted. The Warrior's run reads the Travel confirmation protocol, the Rogue's the
Locomotion run protocol, the walk the Locomotion `every` protocol on every body.

A cell is compared with its baseline, its first reading when its work begins (kept by
`npm run evaluate -- table --baseline` in `assets/evaluations/<drill>/baselines.json`), trial by
trial on the conditions both counted, every reading of the cell pooled (`compareValues`): better or
worse where the 95 % paired bootstrap interval of the mean difference leaves zero on that side,
else within noise. Each reading is also shown against its best version.

`npm run evaluate -- table` reads saved evidence and links each reading's Ratings page. It derives
the required cases from each current protocol and merges compatible partial records. A reading
recorded at an earlier version stands as of its record, its commit and date shown and marked not
the version now: its rows answer the protocol's cases by condition, so a change elsewhere in the
mind asks for no replay. A row read before its reader recorded what the value needs counts for
nothing; `--play` replays it.

`npm run evaluate -- table --play --workers 22` plays missing current cases and writes their rows.
Node, core world, 120 Hz, each command 1 step late (`COMMAND_DELAY`). The report names each
reading's recorded harness and whether its version is current. A baseline keeps all records
contributing its cases; incomplete current coverage cannot become a baseline.
