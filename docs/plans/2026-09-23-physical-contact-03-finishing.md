# Physical contact 03: minds can finish a downed body

## Why

When one fighter is down, the other usually cannot hurt it. Exploration found why:

- **The view never says a body is down.**
  - `SupportState` stays inside locomotion.
  - The only trace is `crouch` pinned at 1, which is the same reading as a deliberate full crouch.
- **Standing heights.** `vitalHeight` and `crownHeight` are fixed at standing height (`Golem`
  constructor), and three kinds of aim read them:
  - v3's trunk thrust aims at `them.vitalHeight` (`tactics-v3.ts`);
  - v4 scales every `targetHeight` by the standing crown;
  - `options.ts` `targetHeight` builds its named regions from both.
- **The envelope stops short of the floor.** `liftMin` on the wrist envelope is -0.95, which is
  clipped for floor clearance and leaves the blade point 0.50 m off the floor (`src/golem/config.ts`).
  A mark below `liftMin` clamps both ends of the commit, and the stroke flattens into a horizontal
  pass.
- **The stand-off ignores that the other is down.** `tacticalRanges` floors the hold distance at
  `them.reach * standOffFraction`, and a downed body still publishes its full reach.

## Changes

1. **The view publishes support state.**
   - Add `support: "supported" | "staggered" | "fallen" | "rising"` to `BodyView` for self and
     opponent, filled in `Golem.describe`.
   - Add a live `vitalPoint` (the core's `mesh.position`, never a world matrix; see the trap in
     `AGENTS.md`).
   - `research/lab/environment.mjs` fills its view through `describe`, so it follows.
   - Grow `BODY_FIELDS` in `tests/fixtures/view.mjs`, `facing()` in `tests/minds.test.mjs`, and the
     `view()` helpers in `tests/options.test.mjs` and `tests/recorder.test.mjs` together.
   - Make `publishedFixture` work on a golem publication, since it throws on one today, and use it
     for a test built from a real downed body.
2. **Standing minds finish.** In v1 to v4 and the `options.ts` executor, while the other body is
   `fallen` or `rising`:
   - drop the reach-based stand-off to the attacker's own strike range against the live vital
     point;
   - aim at the live vital point rather than a standing height;
   - take the derived crouch.

   Keep it one shared helper in `src/action-primitives.ts` or `tactics.ts` rather than four copies.
   That is a change to shared execution code, so play bouts either side of it.
3. **Strokes reach the floor.**
   - Re-measure where the floor clip is actually needed, with the floor contact excluded from the
     stroke readings (see the lash note in `AGENTS.md`).
   - Lower `liftMin` per chain as far as the bench allows without the blade grinding the floor at
     rest.
   - If a chain cannot reach a lying core even crouched, record it rather than bending the envelope.
4. **A downed mind fights weakly, and does not go limp.** The owner's rule: a body on the ground
   swings and parries, and the grounded tone from 02 is what makes it weak. The mind is not what
   makes it weak.
   - While self is `fallen` or `rising`, a mind keeps choosing both strokes and guards.
   - It aims from its live socket, not a standing one. It drops only the strokes whose mark is out
     of reach from where it lies.
   - "Parry" means the hand's `guard` button: guard reach, with the item on the covering line from
     `actionCoverAt`. It is not an active deflection.
   - Pin it with a test built from a real downed publication: a downed mind in reach issues a
     stroke, and one facing a threat issues a guard.

## Measure

- **The downed-target census from 01**: the share of downed seconds with damage landed, and damage a
  downed second.
- **Target:** a downed body is struck in most of its downed seconds when the standing side is in
  reach.
- **Before and after:** x1 against x1 either side, and the fingerprint diff.
- **Mutation-check the finishing helper:** make it ignore `support` and watch the census test go red.

## Owner's eye list (session 10)

- A standing golem finishing a fallen one with a blade, a mace and a fist.
- The fallen one swinging and guarding back from the ground, weakly.

## Inputs from session 01

The downed-target census is not what "the other usually cannot hurt it" predicts, on stone:

- stone's standing side lands damage in 58.8 % of the other's downed seconds, at 0.586 damage a
  downed second against 0.214 a standing one;
- the skeleton lands in 30.4 %, at 0.072 against 0.022;
- the giant group in 46.2 %.

The socket is 1.56 m from the downed core (stone, p50), inside the blade's reach. The target
("struck in most of its downed seconds when in reach") is therefore already met on stone and not on
the skeleton. The mechanisms in "Why" are still real, and change 4 (a downed body fights) is the
owner's rule whatever the census says. So the session stands. Read its before and after per family,
and do not claim stone's figure as its work.

## What landed, 2026-09-24

Every figure is in `docs/analysis/2026-09-23-attribute-measurements.md` "Physical contact 03:
finishing", with its harness. What differs from the plan above:

- **The helpers live in `src/downed.ts`**, not `action-primitives.ts` or `tactics.ts`. The golem
  executors import no value outside `hands.ts` and `rng.ts`, and `downed.ts` imports only a type,
  so all five executors take the rule from one copy: `isDowned`, `standOffReach` and `finishPoint`.
- **The low aim was already there.** Every golem executor aims at the published shoulder, and a
  lying body's shoulder is live and low, so the aim and the derived crouch dropped with no help.
  With the helper made to ignore `support`, every aim and crouch figure in
  `tests/golem-finishing.test.mjs` still holds. What the helper changes is the **hold**, with the
  same lying publication as the control and `support` edited back to `supported`:

  | Mind | Downed | Said to be standing | Standing |
  | --- | ---: | ---: | ---: |
  | golem-duelist | 0.55 | 0.80 | 1.45 |
  | golem-champion | 0.70 | 0.80 | 1.45 |
  | golem-miser | 0.20 | 0.85 | 1.45 |

  These are the nearest gaps at which each mind still walks in, in metres (Node harness, headless
  arena, a skeleton pair). It also aims at the core itself, 0.21 m on from the column over the feet
  for this fall. The brawler closes on anything, so it is not asked.
- **Change 3 was not taken: strokes already reach the floor.** In the one-second windows when the
  standing side's socket was within its own reach of a downed core, it touched the body in 99.3 %
  (stone), 87.3 % (skeleton) and 98.8 % (giant group). A lower `liftMin` would buy a contact
  that already happens. The skeleton's shortfall is scoring, not reach: it scores in 33.4 % of those
  windows, against 11.7 % of the same windows with both bodies up. Its blows land under its
  weapon's energy floor, which is sessions 04 and 05's. `CHAIN_REACH.liftMin` stays at -0.95, and
  the bench's floor clearance with it.
- **Change 4 needed no code.** A downed golem mind in reach already thrusts, guards and aims up
  from its live socket. `a_downed_mind_in_reach_strikes_and_guards_from_its_live_socket` pins it,
  and it went red under a mutant that went limp on the floor.
- **Stone does not fall physically.** Its biped sets no `Knockdown` table, so a stone body that is
  `fallen` stays on its feet: its core read 1.286 m fallen against 1.289 standing. That is why the
  finishing fixture is a skeleton. Session 08 owns the knockdown table.
- **The target is met on stone and the giant group and missed on the skeleton.** In-reach windows
  scored: 69.0 % and 73.6 % against 33.4 %.
- **The census found a defect in session 02's rise.** A rising carrier walked on its mind's request
  and led the other body into its own rise target. See session 02's "What landed".
