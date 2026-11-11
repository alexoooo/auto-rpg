# Brief: the Rogue's stand-up

The first message of a run ([AGENTS.md](../../AGENTS.md#the-rules)), as written; a run starts on it once the owner approves it.

1. Request: "stand-up for all". This run: the Rogue (`workshop-rogue`), the table's `stand-up` row, and nothing else.
2. Question: which one technique of her route loses the most (fails or is slowest), and does changing it bring her row down?
3. Find it: `npm run evaluate -- rise --protocol placed-bodies`, then `npm run evaluate -- rise --protocol moving-bodies`; read the `workshop-rogue` lines against the Warrior's and name the one technique chosen and why.
4. Change: that one technique as the Rogue runs it, in her own record where the technique keeps one a body (`assets/skills/recovery/`). No other body, no Mind, no drill, no table code; a change that needs code other bodies share stops the run with a report.
5. Not to retry (`docs/approaches.md`, Standing up): shorter stage times; more strength; a route that presses her chest up on her arms.
6. After the change: `node research/skills/recovery/edge-profiles.mjs --model workshop-rogue --write`, then one commit on main holding the change and the rebuilt profiles together, before the row is read: a reading is kept only where the commit holds its code unchanged.
7. Measure: `npm run evaluate -- table --body workshop-rogue --skill stand-up`, before (15.16, 23.61, 24.53, 13.94, 18.08 s, saved, not replayed) and after with `--fresh`; the chosen technique's Rise lines are read again after the change by line 3's commands. The change is kept where the row's lines show a cell better and none worse; else it is reverted by a new commit, the profiles with it.
8. A kept change is checked before it is reported ([the skill recipe](../recipes/skill.md#the-claim)): a fresh agent, in Node alone, reads the row's saved lines and outcomes and plays the held-out falls once (`npm run evaluate -- rising-target option --protocol fresh`). Their saved reading (`66a46676`) is older than the row's (`91ab9291`), so a difference there may be partly other code: the report says so where it leans on it. Nothing is opened or checked in a browser.
9. The Rise drill's `-bodies` protocols and the one-body profile rebuild are played here for the first time: a defect in either is fixed at its cause and named in the report.
10. Machine time: 60 minutes of play in all, the held-out falls included. Stops at the row read after one change, or at the budget with what is unread reverted. `npm run check`, `npm test` and `npm run build` passing; committed on main, not pushed. One report: the row and the technique's Rise lines before and after, the fresh agent's words, each defect fixed, anything done beyond the question, and what is unchecked.
