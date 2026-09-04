# Session 09 -- the central mind

**Status (2026-09-04): planned.** Depends on 08. Human gate: not yet asked.

## Outcome

A scripted golem mind, `golem-duelist`, that fights the Warrior duelist and another golem with
any accepted build. It reasons over what its modules publish, not over which modules it has, so
a new option on the shelf needs no new mind.

## Frozen choices

- **Scripted, not learned.** A state machine in the shape of `duelistMind` in `src/policies.ts`
  and of the deleted effigy tactics: approach, hold measure, orbit left or right, cover, chamber,
  commit, withdraw, recover, with hysteresis and dwell so it does not flicker. It returns an
  `Intent` through `Mind.decide` like every other policy and is registered in `POLICIES`.
- **It reads capabilities, not module ids.** Reach, tip, tip velocity and loss come from
  `BodyView.effectors`; the stroke primitives an effector supports and its envelope come from
  the module's published `ModuleEnvelope` (added to the view for golems in Session 08 or here).
  Whether the golem can crouch comes from the locomotion module's height range. The mind picks a
  stroke by capability, and the capability is the pair: the chain says which strokes exist (a
  pitch chain chops, a reach chain thrusts and cuts) and the terminal says what a stroke is for
  (a blade cuts, a plate covers the incoming line, a mace arrives). A ram lunges when the
  opponent is inside effector reach and the primary is recovering.
- **Every hand command it emits is inside the envelope.** The mind asks the module to clamp,
  never the reverse; it does not know the Warrior's reach tables and does not use
  `src/action-primitives.ts`, whose strokes are shaped for the Warrior's arm.
- **The dynamism measures come back as regression floors only.** Ground path, lateral excursion,
  accumulated heading, orbit switches, completed attacks and unlabelled passive intervals, taken
  relative to the Warrior-versus-Warrior distribution in the same harness, are pinned after the
  owner says it looks like a fight, never before.

## Implement

1. `src/golem/tactics.ts`: the state machine, its frozen constants with a short table each, and
   the capability dispatch. `src/golem/golem-policies.ts` registers `golem-duelist` and
   `golem-idle` in `POLICIES` and the registry marks them compatible with the golem unit only.
2. Extend the golem's `describe` with the envelope and stroke capabilities per effector, and the
   locomotion height range, in a `GolemView` extension of `BodyView` that non-golem minds ignore.
3. Mirrored bouts through `scripts/measure.mjs`: `golem-duelist` against Warrior `duelist` on
   both sides, `golem-duelist` against `golem-duelist`, and the default build against each other
   accepted build. Print the policy table with the golem rows added.
4. `tests/golem-mind.test.mjs`: every emitted hand command lies inside the module's envelope over
   a full bout; the mind never stalls more than the passive-interval budget while in range; a
   golem whose primary is the none chain still closes and uses its secondary or ram; determinism under a
   fixed seed.

## Human gate

The owner watches `golem-duelist` against the Warrior duelist for three bouts and against itself
for two, then takes over mid-bout. The questions: does it look like it is fighting; does it use
what it has; does it stop doing things for no reason. The verdict goes into this file's status
line. After a yes, the dynamism floors are pinned in `docs/measurements.md` with the harness and
seeds named.

## Verification

```powershell
npm run check
node --test tests/golem-mind.test.mjs tests/golem-arena.test.mjs
npm run measure
npm test
npm run build
git diff --check -- .
```
