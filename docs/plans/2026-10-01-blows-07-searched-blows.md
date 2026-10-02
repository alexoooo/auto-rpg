# Blows 07: blows found by search, for every body and thing held, scored by the rule

## Goal

One evaluator scores any strike by any body with anything in its hand: the damage it does a
target body under `watchBlows`, less the damage it costs the body that throws it, standing
afterwards whether it lands or misses. One search finds a recipe for each body, thing held and
height band. The strike skill chooses the recipe whose window holds the target and falls back to
the placed blow. The fist's speed and the club's energy into a mark stop being what a search
scores.

It is the open-ended one: its structure is fixed here, and its recipes are whatever the searches
find. It is read on the target bodies and scored by the rule that shares a blow between its two
surfaces, both landed, and needs plan 05's windows.

## Files

| File | Change |
|---|---|
| `src/lab/targets.ts` | `dummySpec(attacker, part)`. |
| `research/core-blow.mjs` | New: `evaluateBlow`, `BANDS`, `CORE_BLOW_HARNESS`. |
| `research/core-strike-search.mjs`, `core-strike-worker.mjs` | `--held`, `--band`; the evaluator is `evaluateBlow`. |
| `research/core-strike.mjs`, `core-club-strike.mjs` | Keep what decodes a candidate (`decode`, `perturbed`, `pushed`, `chambered`, and the club's); their two evaluators go. |
| `research/core-strike-window.mjs`, `core-strike-repertoire.mjs` | Read by `evaluateBlow`; write the new record. |
| `src/core/skills/strikes.ts` | `Recipe.band`, `place`, `net`; `recipeFor` by height. |
| `src/core/skills/strike.ts` | The recipe chosen by the target's height; `reach` from the high band's. |
| `assets/core/strikes.json` | The recipes found. |
| `src/core/mind/config.ts`, `fighter.ts` | `FighterMindConfig.aim`; `seekFoe`'s target by it. |
| `src/lab/blow.ts`, `club-blow.ts`, `blow-scenario.ts` | The Blow scenario reads a target body; `watchClubBlow` goes. |
| `tests/research-blow.test.mjs` | New. |
| `tests/core-strike-skill.test.mjs`, `lab-targets.test.mjs`, `core-orders.test.mjs` | See Tests. |
| `docs/reference/blows.md`, `human-and-strikes.md`, `bouts.md`, `docs/architecture.md`, `docs/roadmap.md`, `README.md` | See Documents. |

## The evaluator (`research/core-blow.mjs`)

```js
/**
 * The height bands a recipe is searched in: what a foe of the attacker's own build has there,
 * and so what the target body is the mass and the surface of.
 */
export const BANDS = { high: "head", middle: "upperTrunk" };

/** Seconds after a strike's pushes end in which the body must stay up, and by whose end it must stand on both feet. */
const RECOVER = 1;

/**
 * One strike, thrown standing from the guard as the strike skill throws it (`throwBlow`,
 * `src/lab/blow.ts`), at a target body of `band` hung `ahead` of the head (`hangDummy`), or at
 * nothing (`dummy: false`). Returns what the rule read: `done`, the hit points the target lost;
 * `cost`, those the thrower lost; `nearest`, m; `fell`; `stood`, whether it stood on both feet
 * at the end of `RECOVER`.
 */
export async function evaluateBlow({ model, held, hand, strike, band, ahead, hz, ground, dummy = true });

/** A candidate's score from one evaluation: net hit points for a hit; under any hit, by how near, for a miss; `FELL` for a fall or for not standing after. */
export function scoreOf(reading);
```

- The target's height is the band's: the attacker's own segment of that name, its centre of mass
  as the attacker stands, moved `ahead`. A search chooses `ahead` as it chooses the distance
  today; the height is the spec's.
- `dummySpec(attacker, part)`: a ball of that part's mass, with its surface; its radius the
  head capsule's for the head, and for another part the radius of a ball of its mass at its
  density (`SEGMENT_DENSITY`), by a named rule.
- A candidate's score is its mean over the trials, as today (`perturbed`, the grounds), plus one
  trial thrown at nothing: a blow that leaves the body down or not standing when it misses scores
  `FELL` whatever it does when it lands.
- `CORE_BLOW_HARNESS` names the stand, the engine, the rate, the target and that no assist is on.

`research/core-strike-search.mjs`: `--held fist|<an item's name>` in place of `--weapon`,
`--band high|middle`; `--from` goes on from a recipe of today's, which is where every search
starts where there is one. The freedoms a candidate may push stay each loadout's (`pushed`,
`clubPushed`): a list by what is held, in one table in `core-blow.mjs`, so an item added later
adds a row.

## The price, before anything runs

The cells are three bodies (`workshop-fighter`, `workshop-rogue`, `crypt-skeleton`), two things
held (fist, the wooden club) and two bands: twelve, each searched from three seeds. One
generation of one cell is timed on the development host at the population and trials to be used;
the price is that, times generations, times thirty-six, and it is put to the owner with the
option of the cells to run first (the Warrior's four) before the rest.

## The repertoire (`strikes.ts`, `strikes.json`)

```ts
interface Recipe {
  readonly model: string;
  readonly held: string;
  /** The height band it was searched in (`BANDS`, `research/core-blow.mjs`). */
  readonly band: string;
  readonly strike: Strike;
  /** Where its target stood: ahead of the striker's head, and above it, m. */
  readonly place: { readonly ahead: number; readonly up: number };
  readonly found: string;
  /** Where about its place it lands, the three ways. */
  readonly window: StrikeWindow;
  /** What it read on replay: hit points done less hit points cost, the mean of eight. */
  readonly net: number;
}
```

`distance` becomes `place.ahead`. `window.up` is about `place.up`.

```ts
/**
 * The recipe `spec`'s `hand` throws, with what it holds, at a target `up` m above its head: of
 * those for what it holds, the body's own before another body's, the one whose window holds that
 * height. Null if none does.
 */
export function recipeFor(repertoire: Repertoire, spec: BodySpec, hand: Hand, up: number): Chosen | null;
```

The skill asks it when an attack is taken up, with the target's height over the head as it
stands; null is the placed blow. `StrikeReport.reach` is the high band's `place.ahead` for each
hand.

**A recipe that does not beat the placed blow is not kept.** A cell's recipe enters the asset
only if its `net` at its place is over the placed blow's at the same target, read by the same
evaluator (`keeps`, exported by `research/core-strike-repertoire.mjs`). A cell without one is
thrown at by placement, and the record says so. A kept recipe's `net` may be under 0: a bare
fist at a head costs the hand more than it does the head, and is still the best that hand has
there.

## Where a fighter aims

```ts
  /** What of a foe a fighter attacks: its head; or, of its head and upper trunk, the one its hand's recipe nets more on. */
  readonly aim: "head" | "pays";
```

`FIGHTER.aim` is `"head"`. `seekFoe` takes it and, under `"pays"`, reads each band's `net` for
the right hand from the report (`StrikeReport.nets`, the chosen recipes' by band). The rule
predicts a bare fist nets more on a trunk and a club on a head; whether aiming so wins bouts is
measured, not assumed: `research/bout.mjs` over the standing table's matchups, `"pays"` against
`"head"` on the same seeds and mirrored, 384 bouts a cell, the paired difference in the bar's
margin and its effect size, on fresh seeds a second time. `"pays"` becomes the default only if it
wins on both; that is a change of its own, and the owner's choice.

## The Blow scenario

It throws a stored blow at a target body and reads `LandedBlow`: the two sides' shares, damage
and masses met, in place of the club's energy into a mark. `watchClubBlow` and `ClubLanding` go;
`core-club-unit`'s measurement keeps its record (`research/core-club-unit.json`) and names its
harness at the commit that held it.

## Tests

`tests/research-blow.test.mjs`:

1. **`a blow is scored by what it does less what it costs`**: the Warrior's club recipe at its
   place: `done` over 0, `cost` 0, `nearest` 0, `fell` false, `stood` true, the reading whole.
   The Warrior's straight at a head: `cost` over 0 and the two sum to the blow's damage.
2. **`a blow thrown at nothing does nothing and is read`**: `done` 0, `nearest` null, `stood`
   true. The target 0.5 m beyond reach: a miss scored under any hit, nearer scoring higher.
3. **`a blow that leaves the body down scores a fall`**: a strike of every trunk freedom pushed
   flat out for a second: `FELL`, with the target and without.
4. **`a middle target is the upper trunk's mass and surface`**: `dummySpec`'s record.

`core-strike-skill`: `recipeFor` by height (a head-high target takes the high recipe, a
chest-high one the middle, one between the windows none); the body's own before another's;
mirrored, `window.up` is carried. Every recipe in the asset whole: its `window.up` holds 0, its
`net` is a finite number, its `found` names the harness. The club's test
(`the_repertoires_club_blow_is_the_clubs_best`) reads the recipe by `evaluateBlow` and holds it
to the asset's `net`.

`research-blow`, **`a cell keeps its recipe only over the placed blow`**: `keeps` of a recipe
netting 0.4 against a placed 0.3 is true; 0.3 against 0.3, and -0.2 against -0.1, false; -0.1
against -0.2, true.

`lab-targets`: the targets' battery on four targets has the high and middle ones struck by
recipes (`report.strike.blow`).

`core-orders`: `seekFoe` under `"pays"` with a fist aims at the upper trunk when its middle
recipe nets more, and at the head under `"head"`.

## Mutations, each must go red

- `cost` left out of the score: test 1's straight.
- The trial at nothing dropped: test 3 without the target.
- A miss scored over a hit: test 2.
- `recipeFor` ignores `up`: the strike-skill test.
- The middle dummy given the head's surface: test 4.
- `keeps` compares against 0, not the placed blow's: its test's last two cases.

## Documents

- `docs/reference/blows.md`: `## Searched` (each cell: how it was searched, its `net` on the
  target body at 120, 480 and 1920 Hz, the mean of eight; the same blow on a standing Warrior and
  a standing Rogue; the placed blow beside it); the targets' battery after, beside the two before;
  `## Aim` (the paired table).
- `docs/reference/human-and-strikes.md`: the windows, three ways, for each recipe.
- `docs/reference/bouts.md`: the standing table measured again and replaced.
- `docs/architecture.md`, Skills: recipes by band, chosen by window, the placed blow under them.
- `docs/roadmap.md`, Strikes: what is left is the design file's Later, moved here in its order,
  and How it extends moved into `docs/architecture.md` as what the seams are for.
- `README.md`: the lab's Blow scenario.

The design file and this plan are deleted in the commit that lands it.

## Verification

```powershell
node scripts/fingerprint.mjs > before.txt
node research/bout-baseline.mjs > bouts-before.txt
npm test
npm run check
npm run build
node scripts/fingerprint.mjs > after.txt
node research/bout-baseline.mjs > bouts-after.txt
node research/bout-trace.mjs
node research/core-targets.mjs
node research/core-strike-repertoire.mjs
```

Every arena, crypt and lab line changes with the recipes. The commit carries them before and
after and the new trace digest.

**The bar.** On the targets' battery, each body with each thing held strikes nine in ten of the
high and middle targets over three seeds and falls at none. The low stratum is reported, and is
a crouch's to turn.

**Eye gate.** The owner watches each body's recipes in the Routine and a bout of each matchup.
