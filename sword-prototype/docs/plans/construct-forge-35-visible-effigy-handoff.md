# Session 35 -- visible Effigy handoff

**Status (2026-09-03): UI and physical receipt implemented; visible human handoff remains owed.**
The arena renders the non-interactive `EFFIGY: phase -- action / controller` line from the ordinary
decision/scheduler snapshot and the setup screen names the Warrior sword+buckler versus built-in
Effigy-Mind review. It remains inside the arena on pause; it neither captures camera input nor
replaces the game view. The eight-cell physical corpus and its permanent-gauntlet contact witness
are now green, so no red automated gate blocks this handoff. A person must still answer the three
visible questions below in a real browser.

## Outcome

Make the Swordbearer’s current tactical intent legible in the real arena, preserve normal
real-time-with-pause interaction and camera inspection, and hand the player a short, concrete
review rather than console instructions.

## Implement

1. In the existing arena diagnostics surface, show one compact line while a Swordbearer is active:

   ```text
   EFFIGY: orbit-left -- orbit-left / supported-biped-combat-move
   ```

   The line identifies tactical phase, admitted Action and controller. When the Effigy is holding,
   it names the public reason -- `guarding incoming blade`, `recovering support`, `blocked lane`,
   or `no line of sight` -- from the retained decision/Action diagnostic. It is not a second state
   machine and cannot write a command.

2. Place that line inside the existing non-modal arena overlay. Pausing freezes simulation only:
   it must not replace the arena, open a large popover, capture pointer input, or prevent orbit,
   zoom and pan camera controls. The normal resume/restart controls remain compact and optional.

3. Add a visible playtest setup row for Warrior Duelist (sword + buckler) versus Swordbearer
   Effigy with the built-in authored policy selected. It must show the policy name and phase line
   without exposing implementation code or requiring console pasting.

4. Update `docs/design.md`, `docs/measurements.md`, and this overview with the selected athletic
   chassis, public tactical Action surface, current dynamism receipt, rejected alternatives and
   remaining qualification state. The actual player review belongs in `docs/plans/construct-forge-16-integration-and-playtest.md`;
   do not claim it happened until a person supplies the verdict.

5. Ask the visible reviewer to run three 30-second bouts, pause freely and inspect from two camera
   distances. The reviewer answers only:

   - Does the Effigy visibly pursue, circle, turn, defend, attack, recover and reposition?
   - Does it ever read as a stationary damaging turret or as blocking itself with its own body?
   - Does the athletic stone-and-bronze silhouette read as a golem automaton rather than a bulky
     mannequin?

   A negative answer reopens Session 32 or 33 with the screenshot/time marker, not a health or
   damage tweak.

## Verification

```powershell
npm test
npm run check
npm run build
git diff --check -- .
```

A visible browser is mandatory for the final three questions. Hidden-tab, software-rasterized or
headless browser output may verify diagnostics but cannot close the visual handoff.
