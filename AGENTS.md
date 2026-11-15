# Working on Auto-RPG

[README](README.md) says what the game is; the [architecture](docs/architecture.md) how it is
built; the [plan](docs/plans/2026-11-15-better-punch.md) what is in work, in the owner's words.
Work toward the owner's goal runs unattended, overnight included.

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
npm run clean             # delete crash dumps, bytecode and day-old .tmp/ work; list the strays
node scripts/fingerprint.mjs          # what the game computes, before and after a refactor
```

## Checks and landing

- **Checks by change**: code, `npm run check` and `npm test`; browser code, assets, dependencies
  or build config, also `npm run build`; something to see, a brief look in a browser; a refactor
  claiming no behaviour change, the fingerprint; prose only, `node --test tests/documents.test.mjs`
  (the links) and `git diff --check`, nothing more.
- **Landing**: commit each landable change on main, naming the checks run and any failure left.
  No push and no branch unless the owner asks: a push to main publishes the README's Play link
  (`.github/workflows/pages.yml` runs `npm test`, `npm run check` and `npm run build` on a fresh
  checkout).
- **Pull and merge** with `npm run pull:merge`; resolve conflicts by meaning, stage only those
  files and `-- --continue`. Never stash or commit unrelated work.
- **Servers**: leave none running. Port 5180 may be the owner's: never restart or kill it; use
  `npm run preview` on another port and kill it by PID (`netstat -ano | findstr :<port>`; killing
  `npx` leaves `vite` running).
- **Temporary files** in `.tmp/<task>/`, a run's output among them, worktrees in
  `.tmp/worktrees/<name>/`; deleted when the task lands. Something kept outside Git gets its own
  `.gitignore` line (`npm run clean` lists what has none).

## Documents

| Document | Holds |
| --- | --- |
| [the skill recipe](docs/recipes/skill.md) | how a skill has been made and trained, and what was found on the way. Read before work on a skill, an Option, a body's control, a table cell or a training run |
| [the approaches](docs/approaches.md) | what each approach to travel, standing up, weapon strikes, guarding and minds has done and has not, with its evidence commits. Read before work on any of those |
| [the code recipe](docs/recipes/code.md) | simulation and source boundaries, code conventions. Read before changing code |
| [the traps](docs/traps.md) | what has bitten in Babylon, Rapier, a browser and the tools on Windows. Read its tools section every session; the rest before code that calls Rapier or Babylon, handles a pointer or is checked in a browser |
| [the test rules](tests/README.md) | what a test may be; each test's own reason is the comment above it. Read before changing a test |
| [the architecture](docs/architecture.md) | the layers, their contracts, where each lives |
| `docs/plans/` | the work in hand: the owner's goal in the owner's words and where the work stands. Deleted when it lands, what worked moved into its recipe |
| `docs/reference/` | only what code needs and a comment cannot hold |
| `docs/art/`, asset and vendor READMEs | where each asset comes from and how to rebuild it |

A document says what is true of the code now, once. The story of a change goes in its commit
message; a finding goes in the document above that holds its kind, never in an agent's own
memory. A wrong document is corrected or deleted. Links resolve: `tests/documents.test.mjs`.
