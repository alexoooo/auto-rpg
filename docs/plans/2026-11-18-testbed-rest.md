# The testbed's rest: what its plan named and nothing built

The testbed plan was deleted at `76b8da80e` on six bars the reviewing session wrote, none of which
named these. This plan holds everything that plan named and nothing built, but for bodies and
what they hold as numbers: that was the numbers plan's, folded on 2026-11-25 into
[the measured Mind plan](2026-11-25-measured-mind.md). The ground, struck from the numbers plan
by the owner, is item 14 here. **The numbers plan's items are the owner's must-haves; these are a
list kept so none is lost, and which of them is needed is the owner's to say.** It sits, none of
it pending or next (the owner, 2026-11-18, through the reviewing session: "re the testbed-rest,
i'm not sure yet exactly what parts of that we need. that plan can just sit there for now, it
doesn't have to be pending"). None is begun here until the owner orders it.

Items 4, 8 and 10 are worked in the measured Mind plan, by the owner's order of it, and parts of
11 and 18; each says so below. Such an item leaves this list as any does: built and read by 19
to 21, or struck by the owner by name.

## The goal, in the owner's words

Of the testbed (2026-11-17):

> if we will be adding many more skills and many more loadouts and character bodies, and fights
> will happen in many more environments (randomly generated levels, multiple units fighting each
> other, etc.) -- how do we handle this all in a clean/systematic/general/simple way?
> what we have now is just a small fraction of where i want to get, if we want to have a scalable
> system (boht in terms of scope, and also interms of throughput/latency), then is there a
> different way that you would apporach the problem?
> i am open to different ideas, including making the "profiles" a pluggable contract that can have
> multiple implementations (e.g. hard-coded esimator, vs coarse lookup table, vs decision forest,
> vs any other approach).
> what i want is a general ai testbed, that we can experiment on without being locked in to one
> way of doing things (unless we have a good reason to believe that one way is optimal or
> dominant).

And, of the predictions:

> what about authored code for the predictions functions? this reminds me a bit of Stockfish where
> pre-deep-learning the eval was authored code, and that went pretty far.

Of the chooser, and to its place in the testbed "yes, add the chooser work to the testbed plan":

> right now it does 100 per step, and discards everything every step.
> what if we wanted it to be incrementally performing some number of search iterations per step,
> and then not throwing away the work each time.
> is there some principled way to do that?
> idreally i'd like to experiment with many different approaches to this, so it should be
> pluggable (and it might already be there with the Chooser).

Of a line played out by a policy: "i'm not sure how the policy play-out would scale". Standing: "We
just need to keep things simple and general, I don't want any ad-hoc hard-coded hacks." And: "I
want to avoid have to re-calculate things, the goal is development velocity so we want to
gracefully fall back to stale data. If we need to do a lot of re-calculation, that will result in
weaker fighting due to fewer iterations vs accepting some degree of staleness."

On 2026-11-18, shown the list below: "please add a new plan to docs/plans/ -- it should have these
items in it (ie. everything other than the N^2 `numbers` plan, which are all must-have)": the
must-haves are the numbers plan's. And: "i want to get to a known good state before we keep
going."

## Where it stands

Built of the testbed, in [the approaches](../approaches.md#minds): the scorecard
(`src/evaluation/scorecard/`) and the match chosen on `warrior` and held out on `warrior-drawn`
(`src/evaluation/match/cases.ts`), both the Warrior empty-handed against itself alone, and since
then the rat against him (the tournament's `gaps`, `src/evaluation/tournament/cases.ts`); the
contracts (`OutcomeModel`, `src/skills/framework/outcomes.ts`; `ExchangePredictor`,
`src/minds/option/contract/predictors.ts`; the search's leaf, `src/minds/option/choosers/leaves.ts`; a chooser, `Chooser`,
`src/minds/option/contract/chooser.ts`). Their kinds:

| Contract | Built | Named and not built |
| --- | --- | --- |
| the outcome model | by hand; the nearest trials; a written form (the game's); a coarse table, removed | a forest; the world itself played forward |
| the others' model | the rate; the measured pressure (the game's); the foe's replies searched, for a foe of the same body; the foe's steps persisting and as measured, removed | the Mind's own choosing in the place of a foe of another body |
| the line's end | the tail (the game's); a value fitted to what followed (the empty-handed man's); a half-life, by distance and by the next exchange two ways, removed | a line played out by a cheap policy |
| the chooser | tree (the game's), valued, ranked; a warm start (`keeps`, `option-warm`); a prior fitted to past searches' runs, removed | the other three kinds below that keep their work; a trained policy |

The tree chooser decides by 50 runs (`RUNS`, `src/minds/option/choosers/parts.ts`) of a tree made anew,
its budget handed in as runs alone (`TreeConfig.runs`). A strike is read one
way in a drill and in a bout (`readFought`, `strikeTrial`, `src/evaluation/strike/`) and profiles
can be built from bouts (`research/skills/strikes/bout-profiles.mjs`), but the game's tables are
the drills', and the back step's sways and the pressure's moments are each gathered by a script
of their own (`research/minds/pressure-profiles.mjs`). Several units: two men on one read once (`16d74daf4`, its
script since deleted).

## What done is

The list, and what built would mean for each; the wording is the agent's. Whose each is: 1 to 5
are the owner's own ask of the chooser (above), of which 1 and 2 are what they described; 6 is
the owner's example of a kind; 7 to 18 are the testbed plan's design, the agent's candidates, 14
to 18 found after this list was first written.

**A chooser that keeps its work.** What a search found is evidence of a situation that has since
moved: it is used again by how like the new situation is and how old it is.

| Kind | What it keeps | What may go wrong |
| --- | --- | --- |
| the search spread over steps | the tree for the next decision, a few runs a step while the Option runs | it needs where the body will be then |
| the branch kept | the tree under the Option taken and the way it ended, as the new root | the body is never quite where the model left it: a test of near enough, else a tree anew |
| a table by situation | each rounded situation's worths, across decisions and bouts | a rounding too coarse joins unlike situations |
| a prior fitted from past searches | each Option's worth, as a model | its fitting, again as skills change |

1. **The search spread over steps**, a chooser kind beside the tree. The Warrior's Mind plan took
   it and closed with it not read ([the approaches](../approaches.md#minds), "Not yet read").
2. **The branch kept**, a chooser kind beside the tree, and likewise taken and not read.
3. **A table by situation**, a chooser kind beside the tree.
4. **A prior fitted from past searches**, a chooser kind beside the tree. Built once, read and
   removed (the approaches). Worked in [the measured Mind plan](2026-11-25-measured-mind.md), as
   its action prior.
5. **The budget handed in as time** as well as runs.

Each of 1 to 4 is read against the tree chooser at the same budget, and by a step's worst
milliseconds, not its mean. What a chooser keeps is in its saved state, or is a cache a loaded
bout makes again and the bout plays the same without.

**The kinds the contracts named.**

6. **A forest**, an outcome model.
7. **The world itself played forward**, an outcome model off the game's clock: the truth each
   other outcome kind is read against.
8. **The Mind's own choosing in the foe's place**, an others' model: what the foe does next is
   what the Mind would choose standing where the foe stands. Built for a foe of the same body
   (`repliedSearch`). For any foe it is worked in the measured Mind plan: the foe's Options
   built from his own body, weighted by the action prior.
9. **A line played out by a cheap policy**, off the game's clock: what each line's end is read
   against.
10. **A trained policy**, a chooser. Worked in the measured Mind plan: a body deciding by the
    action prior alone.

**Built in part.**

11. **One log**: a drill's trial and a bout's decision write the same row (the situation, the
    action, what followed over the seconds asked); every table the game's Mind reads (the
    strikes', the back step's, the pressure's) is built from rows by one builder; drawn against
    chosen is a weight on rows. The measured Mind plan's fight record is the row a bout's
    decision writes, and its fits read from rows. A drill's trial writing the same row, the one
    builder of the strikes' and the sways' tables, and the weight are left here.
12. **The scorecard and the match by body**: their readings sliced by body and by what it holds,
    on a set that is not the Warrior empty-handed alone. The set (bodies and the club crossed)
    does not exist; it was the numbers plan's to make and is now the measured Mind plan's,
    parked there by the owner with what a body holds. This item reads on it.
13. **Several units**: what several foes cost against what the Mind expects of them, read beyond
    two men on one (two on two, three on one, each body), with its spread; where the two differ
    past it, the cause found and mended. (The Skeletons priced at about 20 times what they deal
    are likely priced by the rate, having no pressure table. The measured Mind plan's
    mechanism for what a foe deals needs no table; its reading on the Skeletons is this item's.)

**Named by the testbed plan and found unbuilt later.**

14. **The ground near as numbers** in the situation (room behind, slope, the nearest wall), read by
    the outcome and by a line's end. Struck from the numbers plan by the owner (2026-11-18): "i
    don't care about the ground stuff, what I am asking is to remove N^2 bottlenecks."
15. **The punch measured again with one dealt**: the strike table was measured counting every
    touch of the striker, while a strike's dealt is now read as its limb's touches while its action
    ran, a drill's and a fight's alike (`StrikeReading.dealt`, `src/evaluation/strike/read.ts`), so
    the game's table counts dealt another way than its reader. Measured again once, on
    `sparring-stances`, and not kept: priced right, the punch stood off and was walked into, the
    over-priced punch paying for a stay's unpriced cost. To be read once the foe's steps or the
    line's end price a stay.
16. **A model's own reading held out by bout** on the scorecard: a kind's table (the pressure's)
    built from half the bouts and read on the rest.
17. **The strikes' exits split** into the body's own change and the foe's, as the back step's is
    (`sways: "own"`), the foe's asked of the others' model.
18. **A line's end written over the state**. The Warrior's Mind plan built and read it for the
    empty-handed man, by hand-chosen terms and as a value fitted to what followed
    ([the approaches](../approaches.md#minds)). The fitted value for every body is worked in
    the measured Mind plan; the authored terms and weights below are left here.
    The owner's authored evaluation (the goal): each
    side's life, range by each one's reach, who is how far into what, who is down, and what the
    back step found (the body's facing, whether a strike is on offer), several weights fitted by
    bouts won and held out. The written line's ends built before it (by distance, and by the
    next exchange two ways) read nothing of the state past those, and are removed. What
    [the back step](../approaches.md#guarding)'s
    order asks of a sway's pricing. The owner (through the reviewing session, 2026-11-18): "my
    suspition is that the pricing problems can be fixed with a proper Stockfish-style authored
    features + weights design. it's on if we don't have one universal best value function, we can
    have player agency (choosing the Mind config) if it turns otu that the fighting performance
    hasa rock-paper-scissors dynamic (i.e. if there is no single dominant strategy)."

**Of every item.**

19. It is a kind named in a Mind's config with no source changed, in the picker where a person
    chooses that part, and every number in it is fitted, none typed.
20. It is read as the testbed read a kind: the scorecard, and a match against the game's Mind
    chosen on one set and held out on another, each figure with its spread. Built and read is
    met, whatever it reads; a kind is the game's only where it holds held out. A kind that does
    not beat the game's Mind is not for that alone dropped: by the owner's word (item 18), several
    with none dominant is an outcome, each a Mind config a player chooses; a match among them reads
    whether they go round.
21. The game's Mind is unmoved where a kind is unset (the fingerprint).

An item leaves this list when it is built and read by 19 to 21, or when the owner strikes it by
name; no agent drops one. The plan is deleted when none is left.

## Not items: what the testbed plan left open

Carried so they are not lost; none is a bar here.

- **What the chosen moments hold that a start does not**: the foe's action and its progress, the
  seconds since the body's own last action ended and since it last decided.
- **A value read from bouts is the Minds' that fought them.** How a table is kept true as the Mind
  that reads it changes what it does: it is not, by the owner's word (2026-11-25, in
  [the measured Mind plan](2026-11-25-measured-mind.md)'s goal). A measurement is a best effort
  that goes stale as others are made, and is refreshed from time to time.
- **Whether a long price is made of short ones**: the next 0.2 s by the foe's state, and the
  chance the foe begins a strike.
