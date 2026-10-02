# Blows 03: any touch is a blow, shared by the surfaces that met

## Goal

A blow is a closing touch between any two segments of two sides, and the two surfaces that met
share its energy by their compliance. `STRIKERS` goes. A segment states its surface's stiffness,
from the impact literature; an item with none stated is rigid. Every bout is worth something
else afterwards: the standing table is measured before and after, and three of the owner's
choices are put with their tables.

It needs plan 02's record and reading.

## Files

| File | Change |
|---|---|
| `src/core/spec/quantity.ts` | Units `N/mm` and `N/m`, and the conversion. |
| `src/core/spec/body.ts` | `SurfaceSpec`; `SegmentSpec.surface`; `ItemSpec.surface?`; the head comment's last sentence. |
| `src/core/human/tables/contact-stiffness.ts` | New: `CONTACT_STIFFNESS`, by `DeLevaSegment`. |
| `src/core/human/segments.ts` | `humanSegments` gives each segment its row's surface. |
| `src/core/sources.ts` | One literature entry for each paper read; `contact-stiffness-gaps`. |
| `src/core/rules/share.ts` | New: `energyShares`. |
| `src/core/rules/blows.ts` | The loop over every segment; shares by surface; `STRIKERS` goes. |
| `src/lab/targets.ts` | A dummy's surface is the attacker's head's. |
| `research/bout.mjs`, `bout-baseline.mjs` | A bout's row gains what the new rule is read by. |
| `tests/core-share.test.mjs` | New. |
| `tests/core-blows.test.mjs`, `core-human.test.mjs`, `core-skeleton.test.mjs`, `core-spec.test.mjs`, every fixture that writes a `SegmentSpec` | See Tests. |
| `docs/reference/wounds.md` | New record. |
| `docs/reference/bouts.md`, `blows.md`, `play.md`, `docs/architecture.md`, `docs/roadmap.md`, `README.md`, `AGENTS.md` | See Documents. |

## A surface (`body.ts`, `quantity.ts`)

```ts
/**
 * **What a blow reads of a surface** (`src/core/rules/share.ts`): how stiff it is under a blunt
 * load pressed into it, N/m. The softer of two surfaces that meet takes the more of a blow.
 */
export interface SurfaceSpec {
  readonly stiffness: Quantity<number>;
}
```

- `SegmentSpec.surface: SurfaceSpec`, required: a segment is anatomy and has one.
- `ItemSpec.surface?: SurfaceSpec`: "Absent, the item is rigid: it takes no share of a blow."
- The head comment's "Contact surfaces join the spec when a rule first reads them" becomes what a
  surface is and that the blows' rule reads it.
- `Unit` gains `"N/mm"` and `"N/m"`; `CONVERSIONS` gains `"N/mm": { to: "N/m", factor: 1000 }`.

## The table (`contact-stiffness.ts`)

```ts
/**
 * **How stiff each part of a human is under a blunt load**, N/mm, as the impact literature
 * measured it on cadavers, by de Leva's segments. A part no study gives takes a neighbour's under
 * `contact-stiffness-gaps`. The table, its gaps and what the shares do when a value is halved or
 * doubled: `docs/reference/wounds.md#stiffness`.
 */
export const CONTACT_STIFFNESS: Readonly<Record<DeLevaSegment, Quantity<number>>>;
```

**Before a number is written, its paper is opened** and the value found in it as cited; the
source's `cite` and `link` are the paper's. A value not found as cited is a gap. The candidates,
from the design file's Readings:

| Row | N/mm | Source |
|---|---|---|
| head | 201 | Cormier et al. 2010, the nasal bone's second slope |
| upperTrunk | 26.3 | Lobdell 1973; if only reachable second-hand, Kent 2005's 17 |
| middleTrunk | one reading of 21 to 70 | Cavanaugh 1986, at the impact speed nearest a blow's |
| lowerTrunk | the middle trunk's | gap |
| thigh | 247 | Funk 2004: 4.35 kN over 17.6 mm, by a `derive` whose rule is that division |
| upperArm, forearm, shank | the thigh's | gap |
| hand | 122 | Ochman 2011, porcine: the paper's value, and named in the gaps' decision |
| foot | the hand's | gap |

```ts
  "contact-stiffness-gaps": {
    kind: "decision", date: "<the day it lands>",
    decided: "Proposed, for the owner to confirm: where no study gives a part's stiffness under a blunt load, it "
      + "takes a neighbour's: the lower trunk the middle trunk's, the upper arm, forearm and shank the femur's, "
      + "the foot the hand's; and the hand's is a porcine figure, no human fist's having been found. The head's "
      + "is its face's until the head is two surfaces.",
    record: "docs/reference/wounds.md#gaps",
  },
```

A gap row is a `derive` of the row it borrows and of
`sourced(1, "1", "contact-stiffness-gaps", "a part no study gives takes its neighbour's whole")`,
by the rule "the neighbour's, times the share of it taken": the number is written once, and the
provenance walk shows the paper and the decision both.

`humanSegments` adds `surface: { stiffness: si(CONTACT_STIFFNESS[plan.row]) }`. The skeleton is
built by the same function and takes the same table under `skeleton-placeholders`, which already
says it is a man in the skeleton's shape.

## The shares (`share.ts`)

```ts
/**
 * **Who takes a blow's energy.** The surfaces that met are springs in series under one force, so
 * each stores F^2 / 2k: a surface's share is its compliance over the sum of them all. A rigid
 * surface (null) has no compliance and takes none; where every surface is rigid, nobody does.
 * The list is every layer between the two bodies, in any order: today, the two that touched.
 */
export function energyShares(stiffness: readonly (number | null)[]): number[] {
  const compliance = stiffness.map((k) => {
    if (k !== null && !(k > 0 && Number.isFinite(k))) throw new Error(`a surface's stiffness is a finite N/m over 0, or null for a rigid one, not ${k}`);
    return k === null ? 0 : 1 / k;
  });
  const sum = compliance.reduce((a, b) => a + b, 0);
  return compliance.map((c) => (sum > 0 ? c / sum : 0));
}
```

## The rule (`blows.ts`)

`STRIKERS`, `strikers` and `isStriker` go. The hook:

```ts
  const hook = world.afterStep(() => {
    const now = new Set<string>();
    for (const first of owners.values()) {
      if (!inFight(first)) continue;
      for (const contact of world.physics.contactsOf(first.segment.body)) {
        const second = owners.get(contact.other);
        // Each pair of bodies is read once, from the one built first.
        if (!second || second.key < first.key || second.fighter.side === first.fighter.side || !inFight(second)) continue;
        const key = `${first.key}:${second.key}`;
        now.add(key);
        if (state.touching.has(key)) continue;
        // ... closing, the masses met and the energy, as they are read today ...
        const pair = strongest(contact.pairs);
        const shares = energyShares([stiffnessOf(first, pair.mine), stiffnessOf(second, pair.theirs)]);
        // ... each side wounded by its share, the first then the second; the record; onBlow ...
      }
    }
    state.touching = now;
    remember();
  });
```

- `inFight(owned)`: its fighter's pool has not ended and the segment is attached.
- `stiffnessOf(owned, shape)`: the owner of that shape (`Rigid.owners`): the segment's
  `surface.stiffness.value`, or the held item's `surface?.stiffness.value ?? null`.
- `watchBlows` refuses, as it is made, a fighter with a segment that states no surface.
- Both sides are wounded even where the first's wound ends its pool: the blow is one event. A
  bout in which both pools end in one step is the draw `Duel.decide` already gives.
- Every blow is `blunt`. The module's comment says what a blow is now, in the present tense, and
  loses "The strikers are the hands".

**What a step costs.** Every segment's contacts are read, not two hands'. `research/crypt-step.mjs`
and `research/body-cost.mjs` are read before and after; the figures go to
`docs/reference/play.md#bodies-in-the-step`. If a crypt step with its full count of bodies costs
over a tenth more, the engine seam gains one pass over the world's touching pairs
(`PhysicsWorld.contacts()`), and the watch reads that in place of a call a segment; that is a
change of its own, landed before this one.

## What a bout's row gains (`research/bout.mjs`)

Per side: `own`, the hit points it lost to blows in which its surface was its own bare hand;
`jostled`, those it lost to blows in which neither surface was a hand nor an item; `ruined`, the
hands it had emptied by a blow of their own, and `off`, those taken off by one; and per bout
`blows`, `clashes`, as today. `bout-baseline.mjs` prints them a matchup.

## Tests

`tests/core-share.test.mjs`:

1. **`two surfaces share a blow by their compliance`**: `[100, 300]` gives `[0.75, 0.25]`;
   alike, a half each; `[100, null]` gives `[1, 0]`; `[null, null]` gives `[0, 0]`; three layers
   `[100, 300, null]` give `[0.75, 0.25, 0]`; the shares of any list with a compliant layer sum
   to 1 to the last bit or two.
2. **`a stiffness that is no stiffness is refused`**: 0, a negative, `NaN`, infinity.

`tests/core-blows.test.mjs`, the fixtures' balls given surfaces:

3. **`a fist sent into a body wounds both, each by its share`**: surfaces 100 and 300 kN/m: the
   record whole; the two damages are `blowDamage` of 0.75 and 0.25 of the energy, and sum to
   `blowDamage` of the whole.
4. **`what an item strikes takes the whole blow`**: a hand holding a ball, the ball landing: the
   holder's share 0 and its wound null; the struck's 1.
5. **`two items meeting wound nobody`**: `isClash`.
6. **`a bare hand that meets an item takes the whole blow`**.
7. **`any two segments that meet have met in a blow`**: a ball named `foot.left` sent into one
   named `thigh.right`; and a `head` into an `upperTrunk`.
8. **`a touch lands once, and once for the two bodies`**: one blow in the list for one meeting,
   whichever body was built first; pressed together for a second, still one.
9. **`a part that has come off neither wounds nor is wounded`**, on either side.
10. **`a fighter with a segment that states no surface is refused`**.
11. The Warrior's club on the skeleton's head: the head's side takes all, the record whole, as
    today's.

`tests/core-human.test.mjs`, `core-skeleton.test.mjs`: every segment's surface is its row's, in
N/m, and `specProvenanceFaults` is empty; a gap's provenance names the decision.

Fixtures that write a `SegmentSpec` by hand gain a surface: `tests/fixtures/`, `tests/harness/`,
and the tests' own `lone` and `ball` (thirteen `shape:` sites today).

## Mutations, each must go red

- The shares swapped (stiffness over the sum, not compliance): tests 1 and 3.
- An item's absent surface read as the hand's: tests 4, 5 and 6.
- The `second.key < first.key` guard dropped: test 8 (two blows).
- The loop left over the hands alone: test 7.
- The second side not wounded once the first's pool ends: a case of test 3 with a 1 HP fist.
- The surface read from `pair.theirs` for both: test 3's record.
- `CONTACT_STIFFNESS` read without `si`: the human test's N/m.

## Measured, and put to the owner

Node bouts, Rapier, 120 Hz, each side's balance named, `research/bout-baseline.mjs` on the
standing table's matchups and seeds (`docs/reference/bouts.md#standing-table`), before and after:
how each bout ended, its length, blows a bout, and the columns above.

1. **A hand ruined by its own punch.** The table's `ruined` and `off` a bout, by matchup, bare
   hands and clubs. The options: leave it; or a blunt blow never takes a part off
   (`pool.wound`'s margin read only for a blow that is not blunt, which is none today). What each
   does to how bouts end is the table run both ways with the rulebook's override.
2. **Jostling.** `jostled` a bout against all the hit points lost. The options: leave it; or a
   floor (`Rulebook`, a decision's `Quantity`, joules) under which a touch is not a blow, with
   the table at two floors.
3. **The gaps.** `docs/reference/wounds.md#sensitivity`: the shares of the design's meetings with
   each gap's value halved and doubled, and the standing table with the hand's so.

Nothing is built for an option the owner has not chosen. The plan lands on the rule as the
design states it; a choice the owner makes is a change after it, with this table as its before.

## Documents

- `docs/reference/wounds.md`: new. `## Stiffness` (the table, each value with its paper, what
  was measured and how); `## Gaps`; `## Sensitivity`; `## Shares` (the meetings' shares on the
  landed values); `## Tolerances` (the pool's joules to empty each part beside the literature's,
  from the design file); `## Mechanisms` (the design file's, for the plan that brings an edge).
- `docs/reference/bouts.md`: a section with the tables before and after, the harness, each side's
  balance. The standing table is replaced by the one after.
- `docs/reference/blows.md#baseline`: the targets' battery run again, beside the first.
- `docs/architecture.md`, Rules and wounds: a blow is any two segments of two sides meeting; who
  takes it; an item is rigid. Spec: a segment's surface.
- `docs/roadmap.md`: Strikes loses whatever says only hands strike; the open items gain the
  owner's choices not yet made.
- `README.md`, How to play: a blow costs both who meet in it; a held weapon costs its holder
  nothing.
- `AGENTS.md`, the core's rules: "**A blow has no striker.** Any two segments of two sides that
  meet closing have met in a blow, and the two surfaces share its energy by their compliance
  (`energyShares`, `src/core/rules/share.ts`); an item with no stated surface is rigid. A part's
  tolerance is the pool's rule and no part has its own."

## Verification

```powershell
node scripts/fingerprint.mjs > before.txt
node research/bout-baseline.mjs > bouts-before.txt
node research/crypt-step.mjs > step-before.txt
npm test
npm run check
npm run build
node scripts/fingerprint.mjs > after.txt
node research/bout-baseline.mjs > bouts-after.txt
node research/crypt-step.mjs > step-after.txt
node research/bout-trace.mjs
node research/core-targets.mjs
```

The fingerprint's arena, crypt and lab routine lines change; the levels', the sight's and the
shaders' do not. The commit carries them before and after and the new trace digest.

**Eye gate.** The owner watches a bare-handed bout and a club bout, reads the three tables, and
answers the three choices.
