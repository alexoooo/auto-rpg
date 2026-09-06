# Session 02 -- stroke shapes, a one-handed mace, a two-handed maul, a longer whip

**Status (2026-09-06): implemented; the human gate is open.** Stroke shapes by weapon kind,
a one-socket mace, the two-hands-one-grip maul, an eight-bead whip with its own kind; the bench,
the tests, the variant table and the shape sweeps are in `docs/measurements.md` under Session 02 of
the matchup set. Two things the numbers said that the plan did not: a wrist is cast to the load it
carries (`CHAIN_WRIST.carryRatio`), because an 18 kg bar on a 1.8 kg ring is a mass ratio the
solver does not hold; and the whip's wind-up needed its own `chamberSeconds`, because a 0.22 s
chamber turns a wrist 0.55 rad and a wind-up of -1.0 and of 0 were the same bout to the last digit.
The mace and the maul win every bout against the default build in under eight seconds, which is
a strong attack and possibly a balance the AI sessions will have to answer; the whip splits its
bouts with the default at less damage and more severs. The owner's eye on the bench decides.

## Outcome

The mind swings each weapon the way that weapon wants to be swung. A mace is a strong one-handed
attack. A maul is the strongest attack on the shelf, and it is two hands on one grip. A whip
reaches.

## Why

The two-socket mace holds the haft at two points on straight arms, which pins swing, roll and
bend to zero and leaves the trunk as the only thing that aims it: 8.3 damage a bout against the
blade's 72.6. The whip's six 0.11 m beads are bounded by the bench's floor contact and lash 0.66 m.
And the mind has one stroke, a cut arc, which it applies to a plate, a club and a lash alike.

## Frozen choices

- **Stroke shapes by weapon kind.** `src/golem/tactics.ts` replaces its single chamber-and-commit
  arc with a table keyed by `WeaponKind`: chamber swing, chamber lift, chamber reach, follow swing,
  follow lift, stroke seconds, a step-in, and a roll. A sword cuts as today; a club smashes from
  high and back down through the mark with a step-in; a fist punches straight; a shield bashes;
  a whip sweeps wide with the trunk twisting behind it. `WeaponKind` in `src/hands.ts` gains a
  `whip` member so a lash can be told from a smash by the thing that plans it; `GRIPS` stays a
  total record. Every shape row carries a sweep against the golem-versus-golem cell.
- **The mace claims one socket.** Haft on the chain's last link, head mass about 18 kg, limits
  open so swing, roll and bend come from the chain, published reach the measured settled tip and
  not the 1.10 m upper bound. Scored by the impulse row with the head mass. The two-socket loop
  is not kept under the mace's name; it is replaced by the maul.
- **The maul claims both sockets, and both hands meet at one point on the handle.** Owner's
  specification, 2026-09-05: not two grips on straight extended arms, but both hands at one grip
  so both chains push the same point and their force budgets add. Heavy and long: haft about
  1.3 m, head about 30 kg, grip about 0.35 m from the butt. Built as one rigid part (a bar and a
  ball from `src/golem/effectors/shell.ts`), each chain's hand joined to it at the shared grip by
  a ball joint. No second grip, so no loop and nothing pinned; the chains' own limits apply.
- **The mind learns one new fact about itself, `pairedHands`.** `GolemCapabilities` in
  `src/golem/module.ts` says whether both sockets hold one terminal. When they do, the mind
  treats the pair as one attacker and writes the spare hand the same aim as the acting hand,
  guard and stroke alike. It still reads no module id.
- **The whip is eight segments of 0.16 m.** 1.28 m of lash, four striking beads, per-segment
  mass kept so the whole gets heavier with length, damping re-swept. It publishes a droop-aware
  reach, the settled tip's distance rather than the segment sum, so the range gates stand where
  the lash lands. The bench's whip sequence raises its marks so the floor stops being the
  ceiling on measured speed, and the exclusion window is recorded as a number.

## Implement

1. `src/hands.ts` `whip` kind; `src/golem/build.ts` `TERMINAL_DESCRIPTION` rows; the stroke
   shape table and the paired-hand rule in `src/golem/tactics.ts`; `pairedHands` in
   `src/golem/module.ts` and `src/golem/golem.ts`.
2. `src/golem/config.ts` `TERMINAL_MACE` reworked for one socket, a new `TERMINAL_MAUL`, and
   `TERMINAL_WHIP` lengthened. `src/golem/effectors/terminals/mace.ts` rebuilt on the blade's
   pattern; a new maul terminal file beside it; `src/golem/effectors/terminals/whip.ts` and its
   stale "1.04 m lash" comment. `src/golem/registry.ts`: mace on pitch, reach and wrist; maul on
   reach and wrist, with pitch decided on the bench.
3. `scripts/golem-bench.mjs`: a maul sequence that drives both chains to one cursor, the whip
   marks raised. `tests/golem-bench.test.mjs`, `tests/golem-arena.test.mjs`,
   `tests/golem-mind.test.mjs` ("a mace is aimed with the trunk" becomes "a mace is smashed
   overhead" and "a maul is swung with both hands on one grip").
4. `docs/measurements.md`: the variant table re-taken; damage per contact and contacts per bout
   for mace, maul, whip and blade side by side. `docs/design.md`: the mace section rewritten for
   mace and maul, the whip figures corrected.

## Human gate

The owner drives a mace, a maul and the long whip on the bench, then watches each against the
default build. Does a smash read as a smash; does the maul read as two hands behind one blow;
does the whip reach. Verdict into this file's status line.

## Verification

```powershell
npm run check
node scripts/golem-bench.mjs --terminal mace
node scripts/golem-bench.mjs --terminal maul
node scripts/golem-bench.mjs --terminal whip
node --test tests/golem-bench.test.mjs tests/golem-arena.test.mjs tests/golem-mind.test.mjs tests/scoring.test.mjs
npm run measure -- --only golem --bouts 8
npm test
npm run build
git diff --check -- .
```
