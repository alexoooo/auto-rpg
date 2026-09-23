# Duel setup -- 03 the contender layout

With who-drives and waves gone from the screen, what is left is two builds and a Fight button.
This session lays them out the way the concept does: two framed columns at the edges, an open
centre where the fighters stand, a title at the top and FIGHT at the bottom.

## `index.html` `#curtain`

- The title "Golem Duel", with a one-line subtitle.
- `#matchup` holds two `.contender` columns fixed to the left and right edges, with an **empty
  centre**. The curtain's darkening gradient sits only behind the columns.
- **FIGHT** at the bottom centre, with the one-line refusal under it when Fight is disabled. The
  screen owns Fight's enabled state from boot on, so a link that arrives refused boots with Fight
  already disabled.
- A footer: **How to play**, which opens `#help`; the dungeon link; the boot note. The boot note
  is one quiet line when it says only "Havok ready.", and wraps to as many lines as it needs when
  it carries a refused link or an overridden constant, because those are read whole.
- Deleted: the lede, `#policies` and the keys hint. The `#curtain` and `#pause-menu` literals that
  `tests/host-run.test.mjs` pins stay.

## Each contender (`corner()` in `src/setup.ts`)

1. "Left contender" or "Right contender", with the seed the build was drawn from beside it ("picked
   by hand" once a picker has moved), shown always rather than only in Customize.
2. **Body**: the three families as a segmented control, from `BODY_FAMILIES` and `FAMILY_LABEL` in
   `src/golem/family.ts`. This is the concept's MATERIAL.
3. **Build summary**: `golemBuildRows` in `src/golem/build.ts`, one row per part -- Legs, Torso,
   Head, Main hand, Off hand -- each with a small inline-SVG glyph and the short label from the
   option tables, cut at " - ". A two-handed primary (`sockets === 2`) is one "Both hands" row, and
   `describeGolemSetup` is now those rows joined. "Main" and "Off" rather than "Right" and "Left",
   because the primary is not always the right hand. Every word is written as text, never as
   markup: a corner off a link carries whatever strings the link did. The lit family segment is
   the current state, and pressing it again does nothing; Randomize is the fresh draw.
4. **Attributes**: the sliders from `attributesPanel` in `src/attributes-ui.ts`, open and compact.
5. **Policy**: the select, whose options read `label · badge`, then one sentence from
   `policyLine`, then a rating badge from `policyRatingBadge` in `src/policy-rating.ts` ("1538",
   "1538 provisional" or "unrated") whose `title` holds `policyRatingNote`, the evidence scope and
   the applicability reason. An inapplicable policy shows its status in the badge in a warning
   colour with the reason first in the tooltip. The tooltip is a `title` only: the badge takes
   focus, so a keyboard reaches it, but nothing draws a custom popover.
6. **Randomize** and **Customize**. Customize swaps the summary for the nine slot selects and shows
   the show-all-policies box, and the parts bin row appears in the open centre while either corner
   is customizing. Its label becomes Done.

Removed from the screen: the Move/Attack boxes (session 01 made them redundant), the mode radios
(session 02) and the stalemate note. `unviablePairNote` in `src/golem/viability.ts` and its test in
`tests/golem-random.test.mjs` go with the note: nothing else reads it. The boxes were the only
control that edited a corner's move/attack split, so `takeBody` in `src/bout.ts` now takes the whole
body through `withChannels`, and a split a link carried cannot leave a Take with half of one.

## `src/policy-lines.ts`

- `policyLine(name)`: one sentence for each hand-written policy in `POLICIES` (`src/mind.ts`),
  taken from its mind's doc comment, in an explicit table.
- A researched policy needs no row: `research/promotion.mjs` and `research/admit-lab.mjs` append to
  `researched-variants.json` and `researched-lab.json` unattended, and a table that had to be
  edited after them would turn the suite red on every admission. A variant's line names its parent
  the way `promote` names it in the label; a lab entry's is generic. A row in the table overrides
  either, and the ones published today have rows.
- `#help` gains a Policies list rendered from it, in place of the glossary.

## CSS (`src/style.css`, `src/forge-ui.css`)

Stone panels with a gold hairline border and corner ornaments drawn in CSS, gold small-caps section
heads, a large gold FIGHT, and Georgia throughout. It must fit a 1366x768 window without scrolling,
which is the reason `#help` exists at all.

## Tests

- `policyLine` is total over `POLICIES`; every line is one sentence under 90 characters. Mutation:
  remove a hand-written entry and it goes red.
- The next admission has a line: the real published records plus a renamed variant and a renamed
  lab entry. Mutation: drop the derived fallback, or let it win over the table, and it goes red.
- `golemBuildRows` gives one row per part and one hand row for a two-handed weapon.
- Only strings pinned to deleted UI change. `describeGolemSetup` and the rating labels keep their
  tests.
