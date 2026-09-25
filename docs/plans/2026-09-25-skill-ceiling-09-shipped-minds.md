# Session 09: shipped minds, and the clean break

## Goal

The minds a player meets, built on the control stack, each gated on its fraction of the expert
across bodies and attributes. Then the old tree goes.

## The minds

At least one per school named in `docs/analysis/2026-09-22-attributes-and-mind-schools.md`, each a
decision layer over session 08's skills:

- **Tactician.** Rules over skills, reading beliefs, obeying orders. The ported duelist is its first
  member.
- **Planner.** A cheap version of the expert. It uses a learned or fitted forward model in place of
  forks, which a shipped game cannot afford at scale. It searches over skill parameters within its
  budget. More budget means a deeper or wider search, and that is the Intelligence attribute.
- **Continuous.** A learned policy over skill parameters, trained bottom-up:
  - imitation of the expert on drill states, which is plentiful data now that forks exist and
    teachers are not replaying from t = 0;
  - then self-play in the league on asymmetric pairs, trained across randomised attributes;
  - reward terms include the structural columns, so the stall and the stand-off are priced.

Not every school has to beat every other. A mind may specialise, and it is labelled honestly with
the matchups where it is worse.

## Gates

For each shipped mind:

- **Fraction of the expert**, on drills and in the league, per family and per weapon class, across
  every attribute's range. The band is set from the first measurement. Any attribute level where
  the fraction falls off a cliff (the mind breaks) fails.
- **It uses its attributes.** On the attribute audit's behaviour measures, the mind's behaviour
  shifts in the same direction as the expert's, by at least a stated share of the expert's shift.
- **Mirror by side**, and the idle-dummy gate.
- **Beats the frozen benchmarks.** At least one shipped mind beats the frozen duelist, miser and
  needle on drills and in the league, at n = 384, before any of them is removed.
- **Cost on the owner's laptop.** A bout with the largest party the dungeon spawns keeps its frame
  rate, with minds at their default budget. Read on the frame meter.

## The clean break

When the gates pass, one commit per item:

- remove `tactics.ts`, `tactics-v2.ts`, `tactics-v3.ts`, `tactics-v4.ts`, `pilot.ts`,
  `duel-model*.ts`, `style-model*.ts`, `champion.ts`, `tactics-champions.ts`, `planner.ts`,
  `tactician.ts`, `styles/`, `research-candidates.ts`, `researched-*`, `lab-*.ts`,
  `neural-features.ts` and `stroke-rows.ts`, and whatever else only they import;
- remove the `Intent` adapter from session 06;
- remove the frozen benchmarks;
- remove `src/policy-ratings.json` and its rating code, which a new league re-creates on the new
  minds;
- retire the lab's pilot, direct and residual surfaces and its admission JSON. `research/lab/`
  keeps its lessons documents, and the runner, workers, paired statistics and admission gates are
  kept and pointed at the new stack;
- rewrite `AGENTS.md` sections that describe removed code;
- rename the minds' tests to the new stack.

## Depends on

Session 08.
