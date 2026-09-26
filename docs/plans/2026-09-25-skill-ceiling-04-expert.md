# Session 04: the reference expert

## Goal

An offline mind that gets as much out of a body as search can. It is the instrument every body and
attribute decision is judged by, and the ceiling every shipped mind is measured against. It never
ships in this form.

## Why a search and not a written mind

Every mind in the tree was written or tuned for particular bodies. So when a body scores badly
under one, nobody can tell a bad body from a mind that never learned it. A search over the body's
command space, using forks of the actual world, adapts to any morphology and any attributes with
nobody authoring anything. What it scores on a body is a fact about the body.

## Shape

- **Receding-horizon sampling search** over the command surface, using session 02's fork. Keep the
  top candidates, refine, commit a short prefix, then fork again. The candidate generator starts
  from structured proposals and adds noise. The proposals are the naive ladder's commands, holds,
  and strokes toward sampled marks. The search does not care where a candidate comes from.
- **The objective** is damage dealt minus damage taken over the horizon, with a terminal value for
  standing, being down and position. The structural guard columns are priced in, so the expert does
  not win by stalling: session 03's stall and stand-off seconds carry a cost. Each term is logged
  per decision.
- **Two instruments**, per the owner's decision:
  - **Full knowledge.** Inside a rollout the opponent is its real mind, restored from its snapshot
    and reseeded. The expert knows the policy and not the dice. Built first, because it is the
    cheaper of the two and the closer to a ceiling.
  - **Model-only.** Inside a rollout the opponent is predicted, not replayed. The first model is
    persistence: it keeps its current commands. A learned predictor may replace it, and when it
    does, its accuracy against real opponents is reported beside it.

  The gap between the two is how much of a win came from reading that particular opponent. Where the
  two disagree about a body, that body gets a closer look in session 05. One known way for the full
  knowledge instrument to mislead: it finds a blind spot in a naive mind and lifts every body's
  headroom by the same amount, which says nothing about the bodies.
- **Command surface.** Until session 06 the expert drives `Intent`. That is a mouse-shaped surface,
  so this session's figures are headroom *under the old surface*. Session 06 re-measures them, and
  the difference is the value of the new surface.

## Compute

At 39x real time headless, an expert deciding 8 times a second over 32 one-second rollouts runs at
about 1/250 of real time. That is a few minutes a bout on one lane, with about 10 effective lanes on
this host. These figures are an estimate from the 240 Hz harness; the session measures its own.
Drills are where the expert is affordable at scale. Full bouts are for confirmation.

## Measure

- **Score against compute.** On a fixed drill suite and a fixed set of bodies, vary candidates and
  horizon over a grid. A body's headroom is only called if the curve has flattened. If it is still
  rising, the figure is a lower bound and is reported as one.
- **The expert against the naive ladder,** on drills and in the league, x1 stone against x1 stone,
  for both instruments.
- **Sanity checks:**
  - the expert beats idle on every body it is put on;
  - it never loses its own mirror by side;
  - a mutation that blinds its fork (restores a stale state) makes it measurably worse.

## Gate

The full-knowledge expert beats the duelist clearly on x1 stone, in drills and in the league. If it
cannot, then either the fork, the objective or the search is wrong, and this session finds which
before session 05 uses it as a ruler.

**Result, 2026-09-25** (`docs/analysis/2026-09-25-expert.md`). The expert is `tests/harness/expert.mjs`:
a receding-horizon search over closed-loop plans on exact forks, driving `Intent`, never shipped.
The default is `expert@c8,h1`: 8 candidates, a 1 s horizon, 4 decisions a second.

- **The gate passes.**
  - **League** (Node bout runner, league protocol, blade class against its four variants, 8
    clusters, n = 128): the expert beat the duelist in **128 of 128** bouts, on both sides. The bar
    margin was 0.833 [0.812, 0.853] and d was 8.37.
  - **Drills** (drill runner, paired by start), expert against duelist:
    - survive-cut: 86.0 against 32.3 % (+53.8 ± 10.6, n 93);
    - punish-miss: 100 against 67.5 % (n 200);
    - land-clean-blow: 100 against 79.0 % (n 200);
    - get-inside: 100 against 91.7 %, inside in 0.38 against 1.14 s (n 60);
    - hold-range: 100 against 96.7 %, with a better share in band (n 60);
    - finish: level (n 60).

    It beats every rung of the ladder except the walker's speed on get-inside, 0.38 against
    0.33 s. The cause is the objective: it prices earliness at 0.25 / 3 bars a second.
- **Sanity checks.**
  - **Beats idle** in 108 of 108 bouts, all seven weapon classes.
  - **Its mirror is inside its band:** the left corner scored 48.4 % over 64 distinct bouts, ±12.3.
  - **A stale fork is measurably worse where it can be.** `-lag` (one decision stale) falls to the
    duelist's 29 % on survive-cut. `-blind` (four stale) is inert on survive-cut, because the
    first decision decides the drill and that decision is exact under it. It is 41 points down on
    punish-miss.
- **Compute.** Flat in candidates (c4 to c32) on every drill from c8. The horizon is a trade-off
  rather than a budget.
  - Headroom is called everywhere except survive-cut's low line, which reads 20 → 33 % from c4 to
    c32 on 15 starts and is a lower bound.
- **Model-only** (persistence), beside full knowledge:
  - survive-cut 50.5 % against 86.0 %;
  - level on the other five drills;
  - 85.9 % against the duelist in the league (n 64, d 1.51).

  Reading the duelist is survive-cut's headroom, and it more than doubles the league margin.
- **Cost** (Node bout runner, one lane): 2.7 s a decision, 11 s of wall a game second.

**Open for the owner:**
- the ruler's budget;
- full knowledge or persistence, or both;
- whether the drill task should weight time more heavily;
- which stale-fork mutation stands.

## Depends on

Sessions 02 and 03.
