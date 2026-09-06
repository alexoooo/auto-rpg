# Session 03 -- the matchup screen

**Status (2026-09-05): planned.**

## Outcome

The setup screen shows two golems standing in the arena. Each side has a Randomize button, a
control choice (mind or you), a policy picker and a one-line caption of the build. Fight starts
the bout; Leave brings the screen back. Golem-only, by the owner's decision.

## Frozen choices

- **A random build is a pure, seeded function.** One id per slot from the option lists in
  `src/golem/build.ts`, checked by `golemSetupRefusal`, deterministic under a seed from
  `src/rng.ts`. It lives beside `defaultGolemSetup` and imports no Babylon. `Matchup` in
  `src/bout.ts` carries a seed per side so a pair round-trips through the URL, and a reducer
  randomises one side.
- **The showcase is the arena with physics off.** A golem body exists only through Havok, so the
  two builds are built at their start marks through the same `buildBout` path in `src/main.ts`
  that a fight uses, with physics disabled the way `leave` already disables it. Randomize rebuilds
  one side. The camera frames both through `orbitFraming` in `src/camera.ts` and orbits slowly.
- **The dropdowns survive behind a toggle.** Each side keeps a Customize toggle that reveals the
  per-slot selects, so a hand-picked build and the loot shelf in `src/golem/parts-bin.ts` keep
  working. The unit picker leaves the screen; the Warrior, Broot and Centipede stay in code,
  in `withUnit`, and in the headless measure as regression cells.
- **The HTML structure is kept.** `index.html` keeps `#curtain` over `#matchup` with `#pause-menu`
  beside it, and its div balance, because `tests/host-run.test.mjs` reads the file as text. The
  `#policies` prose is rewritten for what the picker now offers.

## Implement

1. The generator and its test: N draws all pass refusal, every slot value appears over a few
   hundred draws, seeded draws repeat. `tests/bout.test.mjs` for the reducer and the URL round
   trip.
2. `src/setup.ts` `SetupScreen` rebuilt around two panels and a centre; `src/main.ts` gains the
   showcase state, rebuilding one side on Randomize and keeping physics off until `begin`.
3. `index.html` and its prose; `tests/host-run.test.mjs` still green.
4. Verified in Chrome on port 5180 with the hidden-tab discipline from `AGENTS.md`, and the dev
   server stopped afterwards.

## Human gate

The owner opens the screen, randomises each side several times, starts a fight, leaves, and does
it again. Can they tell what each golem is before the fight starts. Verdict into this file's
status line.

## Verification

```powershell
npm run check
node --test tests/bout.test.mjs tests/host-run.test.mjs tests/golem-arena.test.mjs
npm test
npm run build
git diff --check -- .
```
