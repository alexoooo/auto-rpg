# Documents: clean, minimal and current

## Why

The documents and code comments have grown into about 21,000 lines over 122 Markdown files,
much of it history, dated notes, owner quotes, measurements read at old commits, and claims the
code no longer makes. The project has consolidated on the Options design; the documents should
describe that, and nothing else.

Every sentence left must be true of the code now, something a reader acts on, and said once.

Decided with the owner: a number cites a document only when it comes from a paper or an asset. A
value tuned for a result gets a one-line comment saying what it does, and its reference record
goes.

## The target

| Document | Holds | Budget |
| --- | --- | --- |
| `README.md` | what the game is, how to run it, the screens, the controls | 60 lines |
| `AGENTS.md` | commands, rules no test enforces, the engine and browser traps that have bitten | 120 lines |
| `docs/architecture.md` | the layers, their contracts, where each lives | 400 lines |
| `docs/roadmap.md` | current goals and open items, one line each | 100 lines |
| `docs/plans/` | plans in flight | as needed |
| `docs/reference/` | only what code needs and a comment cannot hold | as few as possible |
| `docs/art/` | how to rebuild each asset | as needed |

Writing rules, for documents and comments alike: plain technical English; the present tense; no
dates, session or step numbers, commit hashes, owner quotes, comparisons to other games, asset
trivia, "there is no X", or what used to be. Provenance a reader needs (a paper, an asset path)
stays.

## Steps

1. **AGENTS.md rewritten.** The rules first, so every later step follows them. Keep the commands,
   the rules a test does not enforce, and the Babylon, Rapier and browser traps. A rule a test
   enforces becomes one line naming the test. Replace the rules that make agents write notes: a
   tuned number needs no record; a before/after table goes in the commit message, not a document;
   a reference record has no "tried and not kept". The Documents table and the writing rules above
   go in. The owner reads it before it lands.
   Check: the files and anchors it cites exist, `git diff --check`, the line-ending gate.

2. **A link check in the gate.** `tests/doc-links.test.mjs`: every `docs/…md` path and `#anchor`
   cited in `src/`, `scripts/`, `tests/` and `research/*.mjs`, and every relative link in a
   tracked Markdown file, resolves; a `path@commit` citation is exempt. Fix what it finds (for
   example `docs/reference/vanguard.md`, which no longer exists). Every later deletion leans on it.
   Check: the gate; under a second.

3. **README.md rewritten** to the target: one line on what the game is ("A browser game of
   physically simulated, AI-driven combat."), running it, the screens, the controls. The owner
   reads it before it lands.
   Check: as step 1.

4. **architecture.md rewritten** around the Options design: each layer's job, contract and
   files, in a section a layer. Built from the code as it is, not edited down from the current
   text. A fact a reference record holds that the architecture needs moves here, said once.
   Check: as step 1; a second agent reads it against the code to refute each claim.

5. **The roadmap, plans and analysis.** The roadmap down to current goals and open items, one
   line each, with no history in the items' text. Delete every plan whose work has landed, and the
   creature-art analysis if decided; fold what is left of a plan's open items into the roadmap.
   `docs/diagrams/` pages that show a superseded design are deleted.
   Check: as step 1.

6. **Sources hold papers and assets.** `Source` (`src/core/sources.ts`) keeps `literature` and
   `asset`; `decision` and `measurement` become `tuned`, one line saying what the value is set
   for, with no date or record. `src/core/spec/quantity.ts` and its readers follow; AGENTS.md's
   rule on tuned constants says the same.
   Check: the gate; the fingerprint, no case moved.

7. **Reference and art records sorted.** Each of `docs/reference/` and `docs/art/` is deleted
   (the default), folded into the comment or architecture section that needs it, or trimmed to
   what code depends on. Batches run by sub-agents, each record's survivors read against the
   current code by a second agent framed to refute them. Code citations of a deleted record are
   rewritten or removed. The asset and vendor READMEs (`assets/`, `public/assets/`, `vendor/`) and
   `research/README.md` get the same treatment.
   Check: the gate (the link check); as step 1 for the documents.

8. **Code comments cleaned**, one folder at a time: dates, owner quotes, plan and session
   references, commit hashes, "replaced", "the old", "used to", figures read at past commits, and
   narrative that restates the code. A comment keeps what the code is and, where not obvious, why.
   Check: `npm run check` and the gate; a diff that touches a line of code gets the fingerprint.

The owner reads steps 1 and 3 before they land; the rest lands without check-ins, a commit a step
or a batch.

## Done when

- The tracked Markdown is the target set, each document within its budget.
- The link check is in the gate and green.
- A search of `src/` comments and the documents for dates, commit hashes, "owner" and plan or
  step references finds only literature citations and `path@commit` provenance.
- `docs/reference/` holds only records code cites for something a comment cannot say.
