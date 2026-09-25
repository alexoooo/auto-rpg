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

## Depends on

Sessions 02 and 03.
