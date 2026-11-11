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
