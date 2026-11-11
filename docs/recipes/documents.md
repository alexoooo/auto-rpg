# Writing documents

The rules a change to a document keeps. [AGENTS.md](../../AGENTS.md#documents) says what each
document holds.

- **Every sentence is true of the code now, something a reader acts on, and said once.** Plain
  technical English, the present tense. No dates, session or step numbers, commit hashes, owner
  quotes, comparisons to other games, "there is no X", or what used to be. A paper or an asset
  path is provenance and stays, as do the approaches' evidence commits. The story of a change,
  its before/after tables included, goes in the commit message; what it shows a mechanism cannot
  do goes in the approaches as well, once the owner accepts it.
- **AGENTS.md stays short.** A kind of work's rules go in its recipe; AGENTS.md takes only what
  every change keeps, and a change to it rewords or replaces before it adds.
- **A plan is notes, never instructions.** It holds its goal, where the work stands as the table
  reads it, the questions open and how to pick it up, each reading with the command that reads it
  again. It proposes no step and names no skill the owner did not ask for: what is worked next is
  the run's brief. A reading taken on the way goes in its commit message.
- **A brief is a file the owner reads** (`docs/briefs/`): the run's first message as
  [AGENTS.md](../../AGENTS.md#the-rules) shapes it, the request in the owner's words, the one
  document that quotes them. It is never left in `.tmp/` or only in a conversation.
- **A brief is read through before it is approved**, by a fresh agent of the kind that
  will run it, in a session that runs nothing:
  `codex exec -s read-only --ephemeral -C . -o .tmp/brief-read/<round>.md - < .tmp/brief-read/ask.md`,
  where `ask.md` holds the text below with the brief's path. What a round misreads or finds
  missing is fixed in the brief, the documents or the code and committed, and a new session reads
  again. The read-through ends at a round on the committed text whose answer changes nothing the
  run would do; a clean read says the brief is clear, never that the run will work.

  > This is a read-through, not the run: run no `node`, `npm` or `npx` command and change no
  > file; read any file, and use read-only commands (`git log`, `git show`, `rg`). The owner will
  > start a run whose whole first message is the brief `<brief>`. Read it, and what it leads you
  > to, as you would at that run's start. Then answer: 1. its goal and its one question; 2. every
  > step in order, each exact command, what you wait for and how you choose between branches;
  > 3. which files you change, which you commit, in which commits, and which you must not commit;
  > 4. when the run stops and what its one report holds; 5. anything unclear, contradictory or
  > missing, what you would guess, and anything that would fail as written (a path, a flag, a
  > file), checked by reading the code.
- **The next brief is chosen from the last run's report**, once its claims are checked against
  its commits and saved results (read, not played), and quotes the owner's goal it serves.
- **A driven goal**: the owner may set an agent to drive a goal unattended. It writes each brief,
  has it read through, approves it, starts the run (`codex exec -C . -o .tmp/runs/<brief>.md -`
  with the brief on its input, the owner's own Codex settings), checks its report and chooses the
  next. It stops and reports to the owner once the goal is met, or when no next brief has evidence
  behind it.
- **The roadmap says where the work stands.** A line of it is taken up on the owner's request.
  What the owner should see goes on its list to watch, and an agent never marks it seen. Status
  lives in the roadmap; code never cites a plan or an analysis.
- **A number cites a document only when it comes from a paper or an asset.** A value tuned for a
  result says in one line what it does, and has no record.
- **A reference record holds what code uses**: no history, no "tried and not kept"; what an
  approach cannot do is an entry in the approaches. A deleted record is not cited, `path@commit`
  included.
- **What worked is kept**: before a plan is deleted, the steps, settings and budgets that met
  its goal go into the recipe for that kind of work. A recipe step that misled a run is corrected
  in the same change.
- **A wrong document is corrected or deleted**, not annotated; a change updates the documents it
  makes wrong.
- **Links and anchors resolve**: `tests/documents.test.mjs`.
