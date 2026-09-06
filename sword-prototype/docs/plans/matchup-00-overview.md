# Matchup -- live roadmap

> **2026-09-05 status: plan set written, session 00 landed, nothing accepted.** Ten files, one
> per landable session. Sessions 01 to 09 are open. Every session from 01 on ends at a human gate
> that the owner records in that session's status line; an agent may not write "accepted" there.
> The golem plan set (`golem-00-overview.md` and its eleven session files) stays in place beside
> this one: its own gates are still open and this set does not answer them.

## Why this plan exists

The golem-versus-golem fight reached a state the owner would watch (2026-09-05: "I love it!").
The owner then asked for the next tier, in their own words, and this set is those asks in order:

- the ram head "was cool, but didn't do damage";
- a fist terminal;
- the mace "basically just ties hands together and doesn't do anything -- it should be a strong
  attack", and on being asked: a one-handed mace **and** a two-handed maul where both hands meet
  at one point on the handle, heavy and long;
- a whip with longer segments and greater reach;
- a matchup screen where the two builds are *seen* rather than picked from dropdowns, each side
  randomised at a click, and the fight runs from there; golem-only;
- and, "what I think is missing most", **strong AI**: hand-coded improvements first, look-ahead
  and other advanced methods, ML where it earns its place, tournaments so strength accumulates
  over time for different body configurations, and a neural self-play contender in the same
  league. The owner expects that ML may not be the strongest and wants that reported honestly.

The ram question has an answer before any code moves, and it is recorded here so nobody re-derives
it: the ram row in `src/scoring.ts` exists and scores, but the model is a speed ramp that ignores
the plate's 21 kg and the lunging torso, so one contact at the measured 1.3 to 1.8 m/s is worth a
fifth of a blade stroke against a bar worth 184. And the mind fires the ram only in `recover` and
`measure`, where it commands no trunk lean, so the waist half of the lunge that `docs/design.md`
describes never happens. Health is not the cause. Session 01 fixes both halves.

## Live session order

| session | outcome | after |
| --- | --- | --- |
| [00](matchup-00-overview.md) | this file, and one seeded generator in `src/rng.ts` shared by every session below | -- |
| [01](matchup-01-impulse-ram-fist.md) | momentum-based scoring; a ram exchange that leans in; a fist terminal | 00 |
| [02](matchup-02-mace-maul-whip.md) | stroke shapes by weapon kind; one-handed mace; two-handed maul; longer whip | 01 |
| [03](matchup-03-matchup-screen.md) | the visual matchup screen with per-side randomise | 00 |
| [04](matchup-04-tournament.md) | parallel seeded tournament harness with ratings per policy and build class | 03 |
| [05](matchup-05-tactics-v2.md) | hand-coded tactics v2, `golem-fencer`, every feature with a tournament row | 02, 04 |
| [06](matchup-06-planner.md) | look-ahead over a calibrated duel model, `golem-planner` | 05 |
| [07](matchup-07-tuning.md) | evolutionary parameter tuning per build class, `golem-champion` | 06 |
| [08](matchup-08-neural.md) | a neural self-play contender over the same tactical options, `golem-neural` | 07 |
| [09](matchup-09-close.md) | durable record, final tables, owner gates listed, this set left in place | 08 |

Sessions 01 and 03 depend only on 00 and may run in parallel. Session 04 needs the random build
generator from 03. Session 02 needs the impulse row from 01.

## Frozen choices for this set

1. **A golem sees of its opponent only what `BodyView` publishes today**: weapon kinds, reach,
   tips, tip velocity, health, natural attacks. Opponent `capabilities` stay withheld, as
   `src/golem/module.ts` argues. A stronger mind reads more carefully; it does not read more.
2. **The mind commands positions and reach inside the envelope, through `writeAim` in
   `src/golem/tactics.ts`, and nothing else.** No scripted stroke returns to the body. A stronger
   stroke is a better path for the commanded point, not a new mode in the chain.
3. **Every new tactic is a constant in a table with a sweep row behind it, or it does not ship.**
   The `GOLEM_TACTICS` discipline: a number, its harness, its seed, its date, and the row that
   chose it. A feature with no row is a guess.
4. **Learning in this set** is parameter tuning of hand-written machines, a planning model
   calibrated from tournament logs, and one neural contender that chooses among the same tactical
   options the hand-written executor runs. No learned artifact writes a raw hand command. Every
   learned artifact is checked in as a versioned table carrying its run seed and date, and is
   refused by version on load rather than silently reinterpreted.
5. **One Havok arena per JS realm.** Parallelism is `worker_threads`, one realm each, sequential
   inside. Two bouts in one realm is the trap `scripts/measure.mjs` records, and it is not
   reopened here.
6. **Golem-versus-golem is the cell.** The Warrior cell is a regression check, never the target.
   A number swept against the Warrior is a number about the Warrior.
7. **Structural measures, then the owner's eye.** Stand-off distance, blows per stroke, lead
   changes, winner's remaining health, time inside one's own inner radius: the measures that
   earned the first yes. A policy that rates higher and reads worse on those is reported, not
   shipped, and the final judge is the owner watching random matchups.
8. **Stop rule.** A session gets at most two correction sessions before its status line records
   the stop.

## Conventions for this plan set

- A session's status line is the only line an agent edits in another session's file, and only to
  record a landed dependency. Human-gate verdicts are written by the owner.
- No line anchors in these files. Name the construct.
- **A file that does not exist yet is named without a code span.** The docs gate counts every
  backticked path under `docs/plans/` that resolves nowhere, and that counter is pinned at zero;
  a session that creates the file may put the backticks on afterwards.
- Every session runs `npm run check`, `npm test`, `npm run build` and `git diff --check` from
  inside `sword-prototype/` before landing, plus the root docs checker when it touches a Markdown
  link, and leaves no dev server running.
- A session that deletes a file regenerates `docs/deleted-paths.md` in a second commit.
- Durable results go to `docs/design.md` (what it is) and `docs/measurements.md` (what was
  measured, in which harness, with which seed). These files are not a second authority.
- Long headless runs are part of the work (owner's decision, 2026-09-05): the dev host has 32
  hardware threads, and tournament and tuning sessions use them. Raw logs are gitignored;
  summaries and champion tables are committed.

## Human gates

Each session names its own gate. The set as a whole has one: the owner opens the matchup screen,
randomises both sides a dozen times, watches each fight, and says whether it reads as high-level
fighting. Until that is written into this file by the owner, the status line above stays as it is.
