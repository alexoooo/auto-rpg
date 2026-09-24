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
