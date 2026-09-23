# Duel setup -- 03 the contender layout

With who-drives and waves gone from the screen, what is left is two builds and a Fight button.
This session lays them out the way the concept does: two framed columns at the edges, an open
centre where the fighters stand, a title at the top and FIGHT at the bottom.

## `index.html` `#curtain`

- The title "Golem Duel", with a one-line subtitle.
- `#matchup` holds two `.contender` columns fixed to the left and right edges, with an **empty
  centre**. The curtain's darkening gradient sits only behind the columns.
- **FIGHT** at the bottom centre, with the one-line refusal under it when Fight is disabled.
- A footer: **How to play**, which opens `#help`; the dungeon link; the boot note.
- Deleted: the lede, `#policies` and the keys hint. The `#curtain` and `#pause-menu` literals that
  `tests/host-run.test.mjs` pins stay.

## Each contender (`corner()` in `src/setup.ts`)

1. "Left contender" or "Right contender".
2. **Body**: the three families as a segmented control, from `BODY_FAMILIES` and `FAMILY_LABEL` in
   `src/golem/family.ts`. This is the concept's MATERIAL.
3. **Build summary**: five rows -- Legs, Torso, Head, Right hand, Left hand -- each with a small
   inline-SVG glyph and the short label from the option tables, cut at " - " as
   `describeGolemSetup` in `src/golem/build.ts` does.
4. **Attributes**: the sliders from `attributesPanel` in `src/attributes-ui.ts`, open and compact.
5. **Policy**: the select, then one sentence from `policyLine`, then a rating badge
   (`policyRatingLabel`) whose `title` is `policyRatingNote`, both in `src/policy-rating.ts`. An
   inapplicable policy shows the badge in a warning colour with the reason in the tooltip.
6. **Randomize** and **Customize**. Customize swaps the summary for the nine slot selects, the
   show-all-policies box, the seed and the parts bin row.

Removed from the screen: the Move/Attack boxes (session 01 made them redundant), the mode radios
(session 02) and the stalemate note. `unviablePairNote` in `src/golem/viability.ts` and its test in
`tests/golem-random.test.mjs` go with the note: nothing else reads it.

## `src/policy-lines.ts`

- `policyLine(name)`: one sentence for each hand-written policy in `POLICIES` (`src/mind.ts`),
  taken from its mind's doc comment. A researched variant gets a line built from its base's.
- `#help` gains a Policies list rendered from it, in place of the glossary.

## CSS (`src/style.css`, `src/forge-ui.css`)

Stone panels with a gold hairline border and corner ornaments drawn in CSS, gold small-caps section
heads, a large gold FIGHT, and Georgia throughout. It must fit a 1366x768 window without scrolling,
which is the reason `#help` exists at all.

## Tests

- `policyLine` is total over `POLICIES`; every line is one sentence under about 90 characters.
  Mutation: remove an entry and it goes red.
- Only strings pinned to deleted UI change. `describeGolemSetup` and the rating labels keep their
  tests.
