# Duel setup redesign -- overview

The owner (2026-09-23) found the arena's setup curtain sloppy and wordy -- "large amounts of
meaningless text" -- and sent a concept image: a title at the top, two framed contender columns in
dark stone and gold, an open centre where the two fighters stand, a large FIGHT button and a small
footer. The concept is a guide to **look and feel**, not a spec to reproduce item by item: an
element in it that means nothing here, such as SETTINGS, is not built.

Five files, one per session. Each session lands green on its own and is committed as it lands.
Behaviour goes first, so that the new layout has nothing left to host but the build.

| Session | File | What lands |
| --- | --- | --- |
| 01 | `-01-drive-any-time.md` | Take or let go of either body from the HUD, in a fight or a pause |
| 02 | `-02-replay.md` | A verdict bar with Replay and Random replay; waves mode deleted |
| 03 | `-03-contenders.md` | The contender layout, one-line policies with a rating badge, and the glossary moved into `#help` |
| 04 | `-04-look.md` | The showcase camera framed into the open centre, and a look pass with the owner |

## What the owner decided (2026-09-23)

- **Who drives is not a pre-battle choice.** "At any point it should be possible to select which
  character the player wants to control." The setup screen loses its Move/Attack boxes, and the
  choice is made in the game.
- **Waves is not a game mode.** "Instead of just replay it should be possible to choose [replay |
  random replay] -- so it becomes an in-game click instead of a game mode."
- **Attributes show on each side**, in that side's contender panel.
- **Short line plus tooltip.** Each policy gets one sentence and a rating badge whose full note is
  on hover. The lede, the stalemate warning and the static glossary leave the screen; the glossary
  goes to How to play (`#help`).
- **Keep Georgia.** No font asset.

## Rules every session keeps

- `ArenaPresentation` in `src/host-run.ts`: setup owns `#curtain`, pause owns `#pause-menu`, and
  neither may touch the other's element. A new surface owns only itself.
- "A key that pauses must never also be the key that leaves for setup" (`pauseAction` in
  `src/bout.ts`).
- Pause does not grant UI permission: nothing opens, closes or expands a `<details>` on its own.
- `npm test`, `npm run check` and `npm run build`, and a commit gated on `git diff --numstat`
  matching `git diff --ignore-cr-at-eol --numstat`.
- Every new test is mutation-checked. The owner judges the look on their own machine; a tab driven
  from here gets no frames.
