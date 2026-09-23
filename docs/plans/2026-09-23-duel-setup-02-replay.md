# Duel setup -- 02 Replay and Random replay replace waves

Waves was a setup-screen mode: a seeded queue of roster builds, fought one after another from the
left corner, carrying wear between them. The owner wants it to be a click at the end of a bout
instead: **Replay** or **Random replay**.

## A verdict bar

- `#bout-end` in `index.html`: a compact `<aside>` sibling of `#pause-menu`, outside `#curtain`,
  at the bottom centre and never full-screen. It holds three buttons: **Replay**, **Random
  replay** and **Setup**. The verdict line stays in `#mode`, just below it.
- It is shown in phase `over` only, and steps aside while the pause menu is up, which carries the
  same actions. It owns its own element and nothing else: never `#curtain`, `#pause-menu`, or any
  `<details>`.
- The pause menu's "Restart bout" becomes **Replay**, with **Random replay** beside it. `R` stays
  Replay.

## Random replay

- It keeps your corner exactly as it stands, including the durability that `collectSalvage` writes,
  and redraws **the corner you do not drive** -- the right one when nobody drives.
- The draw moves out of `SetupScreen.randomize` in `src/setup.ts` into a pure
  `randomCorner(matchup, side, seed)` in `src/random-corner.ts` (Node-loadable, `.ts` imports).
  The screen's Randomize and the host both call it, so there is one rule. A seed whose draw runs
  out of tries is followed by the next, and the corner keeps the seed that drew it.
- `fittedPolicy` keeps the corner's policy when `assessPolicy` admits it for the new build, and
  otherwise gives it the family's own duelist (`FAMILY_POLICY`). Not the first applicable one in
  `POLICIES` order: that list opens with the researched variants and carries `idle`.
- Then it goes down Replay's path (`restartHost` in `src/host-run.ts`), and writes
  `linkFor(state.matchup)` to the URL as Fight does.

## Waves goes

- Delete `src/waves.ts`, `tests/waves.test.mjs`, `tests/wave-carry.test.mjs`, and the `waveEnemy`
  case in `tests/policy-applicability.test.mjs`.
- From `src/main.ts`: `run`, `waveNotice`, `openRun` and `advanceWave`. From `src/setup.ts`: the
  mode panel and the `inert` corner.
- From `src/bout.ts`: `Mode`, `modeOf` and `withMode`. `matchupFromQuery` still **accepts** a
  `mode` field in an old link and drops it.
- **What is lost:** wear carried from one opponent to the next, and the run counter. With its only
  writer gone, `GolemSetup.wear` goes too -- its codec branch, and its reads in `src/golem/golem.ts`;
  an old link carrying it opens a whole body. Salvage and the parts bin stay; `collectSalvage`
  already runs whenever somebody is human, and a fitted socket's `durability` is how a body still
  arrives worn.
- `README.md`: the `C` row and the "Wave mode" roadmap line. AGENTS.md: wherever it names
  `#pause-menu` as the only in-game surface.

## Tests

- `#bout-end` sits outside `#curtain` (source text, beside the existing `#pause-menu` check in
  `tests/host-run.test.mjs`).
- `randomCorner` never changes the corner it was not asked to draw, and draws the same body for the
  same seed; a seed whose draw throws moves on to the next one and keeps it.
- An old link with `mode: "waves"` decodes, and the result carries no `mode`.

## Browser check

Finish a bout, press Replay, finish another, press Random replay: the corner you drive is
unchanged and the other is a new body. Open an old `?matchup=` link carrying `mode: "waves"`.
