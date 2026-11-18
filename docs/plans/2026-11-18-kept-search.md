# A chooser that keeps its work

The testbed's step 8, its remainder. The testbed plan was deleted at `76b8da80e` with this step
built in part. It follows [the numbers plan](2026-11-18-numbers.md), which keeps its place ahead
of it unless the owner orders otherwise.

## The goal, in the owner's words

Of the chooser (2026-11-17), and to its place in the testbed "yes, add the chooser work to the
testbed plan":

> right now it does 100 per step, and discards everything every step.
> what if we wanted it to be incrementally performing some number of search iterations per step,
> and then not throwing away the work each time.
> is there some principled way to do that?
> idreally i'd like to experiment with many different approaches to this, so it should be
> pluggable (and it might already be there with the Chooser).

## Where it stands

The tree chooser decides every 0.2 s or at a cue (`DECIDING`, `src/minds/option/value.ts`) by 100
runs (`RUNS`, `src/minds/option/chooser.ts`) of a tree made anew. A chooser is a part with a state
of its own and one `decide` (`Selection`, `src/minds/choice.ts`), so one that keeps its work is
another kind. Built, both unset: the models' answers kept (`coarseTable`, 12% a bout faster, lost
0.451 held out) and a warm start (`TreeConfig.keeps`, won 0.635 held out by fighting less); and
the budget handed in, in runs (`Budget`, `src/minds/option/parts.ts`). See [the
approaches](../approaches.md#minds).

What a search found is evidence of a situation that has since moved: it is used again by how like
the new situation is and how old it is. The kinds:

| Kind | What it keeps | What may go wrong |
| --- | --- | --- |
| the models' answers kept | what each Option brings at a situation, by its numbers rounded | a rounding too fine never hits |
| a warm start | each Option's worth at the last decision, as the first estimate at this one | an old worth misleads the first runs: it fades with age |
| the branch kept | the tree under the Option taken and the way it ended, as the new root | the body is never quite where the model left it: a test of near enough, else a tree anew |
| the search spread over steps | the tree for the next decision, a few runs a step while the Option runs | it needs where the body will be then |
| a table by situation | each rounded situation's worths, across decisions and bouts | a rounding too coarse joins unlike situations |
| a prior fitted from past searches | each Option's worth, as a model | its fitting, again as skills change |

What a chooser keeps is in its saved state, or is a cache a loaded bout makes again and the bout
plays the same without.

## What done is

The agent's bar, until the owner gives one, theirs to change:

1. **The search spread over steps**: a few runs a step while an Option runs, its tree kept to the
   next decision; a chooser kind beside the tree, and in the picker.
2. **The branch kept**, likewise.
3. **A table by situation** and 4. **a prior fitted from past searches**, each built or struck by
   the owner by name.
5. **The budget handed in as time** as well as runs.
6. **Each read against the tree chooser at the same budget, held out**: bouts won, a step's worst
   milliseconds and standing silence, with their spreads.
7. **The game's Mind unmoved where a kind is unset** (the fingerprint).

Deleted only when each is met or struck by the owner by name; a record of not built is not met.

## Steps
