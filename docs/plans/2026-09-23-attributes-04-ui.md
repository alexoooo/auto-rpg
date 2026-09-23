# Attributes 04 -- seeing and setting attributes

Lands the owner's three surfaces:

- each arena setup corner, where attributes are set;
- the dungeon hero dialog, where they are set;
- the in-fight diagnostics, where they are read only.

At this point one stat, movement, is live, so every control can be checked against a body that
actually changes.

## What lands

1. **`src/attributes-ui.ts`** (new): a small DOM builder, shared by both pages.
   - One row per `ATTRIBUTES` entry. A **live** row gets:
     - a `<input type="range">` (min, max and step from the table);
     - a readout (`x1.20`);
     - a per-row reset.
   - A row that is not live shows as a disabled line saying it is not yet available. The owner
     sees the whole list and the order, and nothing pretends to work.
   - One "Reset all" button.
   - Controls carry `data-field="attribute"` and `data-attribute="<id>"`, so `SetupScreen`'s
     delegated `change` handler routes them the way it routes every other control.
   - Any logic that needs a test goes into `src/golem/attributes.ts` or `src/bout.ts`, not this
     file. Node has no DOM, and a rule written in DOM code is a rule no test can reach.
2. **Arena setup corners** (`src/setup.ts`).
   - Each corner's block gains an "Attributes" section after its policy and control rows, open by
     default. It is setup, not diagnostics, so it does not belong to the pause rule.
   - A change calls `withGolemAttribute` (session 01) and goes through `onSelection`. The link is
     rewritten by `history.replaceState`, as every other choice is.
   - The body is rebuilt. `bodies(matchup)` in `src/main.ts` fingerprints `setup.golem`, which now
     contains `attributes`. Confirm that by reading that function, then prove it by driving the
     page.
   - The corner caption (`describeGolemSetup`) appends `describeAttributes` when it is not empty,
     so a changed body says so.
   - An inert corner (the waves mode's right side) shows its attributes disabled.
   - Randomize and the family buttons **keep** the corner's attributes. They pick a body, not a
     tuning. `withGolemBuild` and the family path must carry the field across; add a test for each.
3. **Dungeon hero** (`dungeon.html` `#start-panel`, `src/dungeon/main.ts`).
   - The same rows go under the build and equipment pickers.
   - The start handler puts the values on `heroSetup` before `new DungeonRun(...)`. `DungeonRun`
     builds the hero from that setup already.
   - Enemies are built with no attributes.
   - Nothing is persisted, because the dungeon persists nothing today. If the owner wants the
     values remembered, that is a question for them, not a default.
4. **In-fight readout** (`src/hud.ts`, fed through `Telemetry` from `src/main.ts`).
   - A line per side inside the existing collapsed diagnostics `<details>`: "attributes: movement
     x1.20", or "attributes: default".
   - The HUD never opens or closes the disclosure. That is the pause rule in AGENTS.md: pause does
     not grant UI permission.
   - The dungeon HUD gets the same line for the hero, beside `#hero-name`.
5. **Styles.** `src/style.css`, beside the setup screen's `.field` rules, and
   `src/dungeon/style.css`, beside `.dialog .field`. The rows must fit the corner at phone width
   with no horizontal scroll.

## Tests

- `withGolemBuild`, the family path and `randomize` keep `attributes`. Use a whole-setup
  `deepEqual` against an expected setup, not one leaf.
- `describeAttributes` text for none, one and several values.
- `tests/host-run.test.mjs` already reads `index.html` and `main.ts` as text. Extend it to assert
  that the diagnostics line exists and that nothing in the pause path touches the disclosure's
  `open`.

## Browser check (the owner's server on 5180; navigate, do not reload)

1. Move a slider. The readout, the caption and the link all change, and the body rebuilds: read
   the carrier's `maxSpeedMps` from the console handle.
2. Navigate to the link. The values come back.
3. Reset one row, then all rows. The link loses the field.
4. Start a bout. The diagnostics line lists the value, and pausing leaves the disclosure as it
   was.
5. Dungeon: set movement, start a run, and see the hero's line. The hero is faster than at 1.00.
6. Take screenshots of both panels.

The tab may be backgrounded. See AGENTS.md on hidden tabs: step and render by hand before believing
a black canvas.

## Done when

A person can see every attribute, set the live ones on either page, share a link that carries
them, and read them during a fight.
