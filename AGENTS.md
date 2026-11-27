# Working on Auto-RPG

**The owner's standard**: "the most important thing is to maintain and even increase the code
quality of this project. we need to implement everything in the most simple and general way that
we can"; "I always want everything to be just a skill. I don't want any ad-hoc hard-coded hacks."
A new capability enters by the config path those already there take, on main, where the owner can
pick it in the game before it is judged: "the first thing I want is to see it". What measures
better than the game stays pickable in the game and is reported first; nothing selectable,
measured or collected is removed without the owner's word.

[README](README.md) says what the game is, the documents below the rest. Work toward the owner's
goal runs unattended, overnight included. A second session that reviews it reads read-only and
sends a note only with its evidence, never asking the work to wait for the owner or adding to the
owner's bar; the worker answers a note with a reading and keeps going.

## Commands

```powershell
npm ci                    # the exact lockfile, never `install`
npm run dev               # http://localhost:5180
npm run check             # type-check
npm test                  # the gate
npm run build             # type-check, then the bundle
npm run pull:merge        # fetch, merge, validate once, commit; -- --continue after resolving conflicts
npm run match -- <a> <b>  # two minds, each on each side, one digest
npm run evaluate -- <id>  # an evaluation's cases where no row has them; --fresh plays its subjects' again; --write keeps its results
npm run evaluate -- table # the grid from saved results; plays nothing (its flags: docs/reference/the-table.md)
npm run measure -- <entrant> [<entrant>]  # one matchup (mind/body/left,right; one is its mirror) into the fight record, then its fits; --write keeps them; stopped by its PID, run again to go on
npm run clean             # delete crash dumps, bytecode and day-old .tmp/ work; list the strays
node scripts/fingerprint.mjs          # what the game computes: --json <file> before a change, --compare <file> after names every fight, mirror bout and table reading it moved
node scripts/inventory.mjs            # what each body's Mind reads to price a fight, and where each reading comes from; plays no bout: --json <file> before a change, --compare <file> after names every row it moved
```

## Checks and landing

- **Checks by change**: code, `npm run check` and `npm test`; browser code, assets, dependencies
  or build config, also `npm run build`; something to see, a brief look in a browser, and a change
  to what a config resolves to, a headless one at the Arena with the mind editor open (the pages
  build Minds from the same configs, so code checks alone do not show they open); a change to
  what a Mind or a skill does, or a refactor claiming none, the fingerprint, each case it moves
  named; a change to what a Mind reads to price a fight (a lookup, a measured asset, a number
  set by hand, a body's default config), the inventory, each row it moves named; a change to
  what a Mind or a skill remembers, the fingerprint with `--relay 127`; prose only,
  `node --test tests/documents.test.mjs` (the links) and `git diff --check`, nothing more.
- **Landing**: commit each landable change on main, naming the checks run and any failure left.
  No push and no branch unless the owner asks: a push to main publishes the README's Play link.
- **Pull and merge** with `npm run pull:merge`; resolve conflicts by meaning, stage only those
  files and `-- --continue`. Never stash or commit unrelated work.
- **Servers**: leave none running. Port 5180 may be the owner's: never restart or kill it; use
  `npm run preview` on another port and kill it by PID (`netstat -ano | findstr :<port>`; killing
  `npx` leaves `vite` running).
- **Temporary files** in `.tmp/<task>/`, deleted when the task lands; something kept outside Git
  gets its own `.gitignore` line (`npm run clean` lists what has none).

## Documents

| Document | Holds |
| --- | --- |
| [the skill recipe](docs/recipes/skill.md) | the procedure every skill follows (author, look, make it work some of the time, then tune) and the rules each step binds. Read before work on a skill, an Option, a body's control, a table cell or a training run |
| [the approaches](docs/approaches.md) | what each approach to travel, standing up, unarmed and weapon strikes, guarding and minds has done and has not, with its evidence commits. Read before work on any of those |
| [the code recipe](docs/recipes/code.md) | simulation and source boundaries, code conventions. Read before changing code |
| [the traps](docs/traps.md) | what has bitten in Babylon, Rapier, a browser and the tools on Windows. Read its tools section every session; the rest before code that calls Rapier or Babylon, handles a pointer or is checked in a browser |
| [the test rules](tests/README.md) | what a test may be; each test's own reason is the comment above it. Read before changing a test |
| [the architecture](docs/architecture.md) | the layers, their contracts, where each lives |
| `docs/plans/` | the work in hand: the owner's goal in the owner's words and where the work stands. Deleted when it lands, what worked moved into its recipe |
| `docs/reference/` | only what code needs and a comment cannot hold |
| `docs/art/`, asset and vendor READMEs | where each asset comes from and how to rebuild it |

A document says what is true of the code now, once; a wrong one is corrected or deleted. The
story of a change goes in its commit message; a finding goes in the document above that holds its
kind, never in an agent's own memory.
