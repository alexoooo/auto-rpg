# The testbed's rest: what its plan named and nothing built

The testbed plan was deleted at `76b8da80e` on six bars the reviewing session wrote, none of which
named these. This plan holds everything that plan named and nothing built, but for bodies, what
they hold and the ground, which is [the numbers plan](2026-11-18-numbers.md)'s. **The numbers
plan's items are the owner's must-haves; these are a list kept so none is lost, and which of them
is needed is the owner's to say.** Not begun, and none is begun until the owner orders it. The
order of this plan, the numbers plan and [the back step](2026-11-16-back-step.md) is the owner's
to give.

## The goal, in the owner's words

Of the testbed (2026-11-17):

> if we will be adding many more skills and many more loadouts and character bodies, and fights
> will happen in many more environments (randomly generated levels, multiple units fighting each
> other, etc.) -- how do we handle this all in a clean/systematic/general/simple way?
> i am open to different ideas, including making the "profiles" a pluggable contract that can have
> multiple implementations (e.g. hard-coded esimator, vs coarse lookup table, vs decision forest,
> vs any other approach).
> what i want is a general ai testbed, that we can experiment on without being locked in to one
> way of doing things (unless we have a good reason to believe that one way is optimal or
> dominant).

Of the chooser, and to its place in the testbed "yes, add the chooser work to the testbed plan":

> right now it does 100 per step, and discards everything every step.
> what if we wanted it to be incrementally performing some number of search iterations per step,
> and then not throwing away the work each time.
> is there some principled way to do that?
> idreally i'd like to experiment with many different approaches to this, so it should be
> pluggable (and it might already be there with the Chooser).

Of a line played out by a policy: "i'm not sure how the policy play-out would scale". Standing: "We
just need to keep things simple and general, I don't want any ad-hoc hard-coded hacks."

On 2026-11-18, shown the list below: "please add a new plan to docs/plans/ -- it should have these
items in it (ie. everything other than the N^2 `numbers` plan, which are all must-have)": the
must-haves are the numbers plan's. And: "i want to get to a known good state before we keep
going."

## Where it stands

Built of the testbed, in [the approaches](../approaches.md#minds): the scorecard
(`src/evaluation/scorecard/`) and the match chosen on `warrior` and held out on `warrior-drawn`
(`src/evaluation/match/cases.ts`), both the Warrior empty-handed against itself alone; the
contracts (`OutcomeModel`, `src/skills/framework/outcomes.ts`; `OthersModel`,
`src/minds/option/percepts.ts`; `LineEnd`, `src/minds/option/chooser.ts`; a chooser, `Selection`,
`src/minds/choice.ts`). Their kinds:

| Contract | Built | Named and not built |
| --- | --- | --- |
| the outcome model | by hand; the nearest trials; a coarse table; a written form (the game's) | a forest; the world itself played forward |
| the others' model | the rate; the measured pressure (the game's); the foe's steps persisting and as measured | the Mind's own choosing in the foe's place |
| the line's end | the tail (the game's); a half-life; by distance; by the next exchange, two ways | a line played out by a cheap policy |
| the chooser | tree (the game's), valued, ranked; a warm start (`TreeConfig.keeps`) | the four kinds below that keep their work; a trained policy |

The tree chooser decides by 100 runs (`RUNS`, `src/minds/option/chooser.ts`) of a tree made anew,
its budget handed in as runs alone (`Budget`, `src/minds/option/parts.ts`). A strike is read one
way in a drill and in a bout (`readFought`, `strikeTrial`, `src/evaluation/strike/`) and profiles
can be built from bouts (`research/skills/strikes/bout-profiles.mjs`), but the game's tables are
the drills', and the back step's sways, the pressure's moments and the foe's steps are each
gathered by a script of their own (`research/minds/pressure-profiles.mjs`,
`research/minds/foe-steps.mjs`). Several units: two men on one read once
(`research/minds/two-on-one.mjs`).

## What done is

The list, and what built would mean for each; the wording is the agent's. Whose each is: 1 to 5
are the owner's own ask of the chooser (above), of which 1 and 2 are what they described; 6 is
the owner's example of a kind; 7 to 13 are the testbed plan's design, the agent's candidates.

**A chooser that keeps its work.** What a search found is evidence of a situation that has since
moved: it is used again by how like the new situation is and how old it is.

| Kind | What it keeps | What may go wrong |
| --- | --- | --- |
| the search spread over steps | the tree for the next decision, a few runs a step while the Option runs | it needs where the body will be then |
| the branch kept | the tree under the Option taken and the way it ended, as the new root | the body is never quite where the model left it: a test of near enough, else a tree anew |
| a table by situation | each rounded situation's worths, across decisions and bouts | a rounding too coarse joins unlike situations |
| a prior fitted from past searches | each Option's worth, as a model | its fitting, again as skills change |

1. **The search spread over steps**, a chooser kind beside the tree.
2. **The branch kept**, likewise.
3. **A table by situation**, likewise.
4. **A prior fitted from past searches**, likewise.
5. **The budget handed in as time** as well as runs.

Each of 1 to 4 is read against the tree chooser at the same budget, and by a step's worst
milliseconds, not its mean. What a chooser keeps is in its saved state, or is a cache a loaded
bout makes again and the bout plays the same without.

**The kinds the contracts named.**

6. **A forest**, an outcome model.
7. **The world itself played forward**, an outcome model off the game's clock: the truth each
   other outcome kind is read against.
8. **The Mind's own choosing in the foe's place**, an others' model: what the foe does next is
   what the Mind would choose standing where the foe stands.
9. **A line played out by a cheap policy**, off the game's clock: what each line's end is read
   against.
10. **A trained policy**, a chooser.

**Built in part.**

11. **One log**: a drill's trial and a bout's decision write the same row (the situation, the
    action, what followed over the seconds asked); every table the game's Mind reads (the
    strikes', the back step's, the pressure's, the foe's steps') is built from rows by one
    builder; drawn against chosen is a weight on rows.
12. **The scorecard and the match by body**: their readings sliced by body and by what it holds,
    on a set that is not the Warrior empty-handed alone (the set is the numbers plan's item 4 to
    make; this item reads on it).
13. **Several units**: what several foes cost against what the Mind expects of them, read beyond
    two men on one (two on two, three on one, each body), with its spread; where the two differ
    past it, the cause found and mended. (The Skeletons priced at about 20 times what they deal
    is the numbers plan's item 3.)

**Of every item.**

14. It is a kind named in a Mind's config with no source changed, in the picker where a person
    chooses that part, and every number in it is fitted, none typed.
15. It is read as the testbed read a kind: the scorecard, and a match against the game's Mind
    chosen on one set and held out on another, each figure with its spread. Built and read is
    met, whatever it reads; a kind is the game's only where it holds held out.
16. The game's Mind is unmoved where a kind is unset (the fingerprint).

An item leaves this list when it is built and read by 14 to 16, or when the owner strikes it by
name; no agent drops one. The plan is deleted when none is left.

## Not items: what the testbed plan left open

Carried so they are not lost; none is a bar here.

- **What the chosen moments hold that a start does not**: the foe's action and its progress, the
  seconds since the body's own last action ended and since it last decided.
- **A value read from bouts is the Minds' that fought them.** How a table is kept true as the Mind
  that reads it changes what it does is not answered.
- **Whether a long price is made of short ones**: the next 0.2 s by the foe's state, and the
  chance the foe begins a strike.

## Steps
