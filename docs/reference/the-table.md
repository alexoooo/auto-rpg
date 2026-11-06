# The table

Option Mind on every body, loadout and skill (`src/evaluation/table/`). Stand-up and the run are
met or short on their definitions (`verdictOf`): stand-up on the [owner's
target](rising.md#the-owners-target), each body and loadout's sixteen falls on its gates, the run
on its bar. Every other cell is best effort: each reading's score (`scoreOf`, better higher),
read against the cell's baseline, its first reading when its work begins (kept by
`npm run evaluate -- table --baseline` in `assets/evaluations/<drill>/baselines.json`), and
beside its best version's; a strike's with the person's figure (`BAR`), a scale that gates
nothing. A scored cell is above, at or below its baseline, or has none.

`npm run evaluate -- table` reads saved evidence and links each reading's Ratings page. It derives
the required case keys from each current protocol and merges compatible partial records. Stand-up
and run cells are met only when every required case is present and passes; missing and faulted
cases remain explicit. Faulted scores are unavailable, and Cover identifies trials in which its
opponent attempted no attack.

`npm run evaluate -- table --play --workers 22` plays missing current cases and writes their rows.
Node, core world, 120 Hz, each command 1 step late (`COMMAND_DELAY`). The report names each
reading's recorded harness and whether its version is current. A baseline keeps all records
contributing its cases; incomplete current coverage cannot become a baseline.
