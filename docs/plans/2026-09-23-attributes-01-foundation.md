# Attributes 01 -- the attribute record, the setup field, and the build context

Lands the data path for all nine stats and makes none of them live. At the end of this session a
setup can carry `attributes`, the URL round-trips it, validation refuses a bad value, and every
module builder can read the resolved record from its build context. No builder reads it yet, so
every body is bit-identical.

## What lands

1. **`src/golem/attributes.ts`** (new). Pure and loadable in Node; relative imports carry `.ts`.
   - `ATTRIBUTE_IDS`: `movement`, `turning`, `stability`, `recovery`, `armour`, `toughness`,
     `armSpeed`, `weight`, `size`, in the owner's order.
   - `ATTRIBUTES: Record<AttributeId, { label, min, max, step, live }>`. Every row starts at
     `live: false` with `min = max = 1`. The stat's own session sets the range and turns it live.
   - `resolveAttributes(setup)`: returns every id with its default of 1, overlaid with the setup's
     values, frozen.
     - It is written as a fold over a list of sources, and today that list holds only the setup.
     - Items will be a second source for armour and arm speed.
     - Resolved values are clamped nowhere: validation refuses a bad value at the door, so a
       resolved number is always one that was accepted.
   - `attributesRefusal(partial)`: returns a message naming the id when a value is:
     - an unknown id;
     - not finite;
     - outside `[min, max]`;
     - not 1 on a row that is not `live`.

     Otherwise it returns `null`.
   - `describeAttributes(resolved)`: a short text listing only the non-default values
     (`"movement x1.20, armour x0.90"`), or `""`. Sessions 04 and later display it.
2. **The setup field**, in `src/bout.ts`.
   - `GolemSetup.attributes?: Readonly<Partial<Record<AttributeId, number>>>`. Leaving it out means
     every stat is at its default, so every existing setup, named build and link is unchanged.
   - Copy it in `copyGolem`.
   - Read it in `readGolem` through a new `readAttributes`, modelled on `readWear`. That reader
     refuses a non-object and any value that is not a number, and leaves the ranges to validation.
   - A reducer, `withGolemAttribute(matchup, side, id, value)`. Setting a value back to 1 deletes
     the key, and deleting the last key deletes the field, so a default body writes no
     `attributes` into its link.
3. **Validation.** `golemSetupRefusal` in `src/golem/build.ts` calls `attributesRefusal`.
4. **The build context.**
   - `ModuleBuild` in `src/golem/module.ts` gains `readonly attributes?: Readonly<Record<AttributeId, number>>`.
     It is optional, like `companion` and `world`, because the benches and tests that build a
     module alone construct their own contexts.
   - The `Golem` constructor in `src/golem/golem.ts` resolves the record once and hands it to every
     `definition.build(ctx)`. `effectorModule` already passes its context on to the chain and the
     terminal.
   - Add a helper, `attribute(ctx, id)`, that returns `ctx.attributes?.[id] ?? 1`. Every later
     session reads through it, so there is one spelling of the default.
   - The golem keeps the record on a public readonly field, `attributes`, for the HUD. It does
     **not** go into `FighterView`: no mind reads it, and an unread view field drifts.

## Tests (new, in `tests/attributes.test.mjs`, plus rows in `tests/bout.test.mjs`)

- `resolveAttributes` of a setup with no field is all ones. A setup with values keeps them and
  defaults the rest.
- `attributesRefusal`: one assertion each for an unknown id, NaN, above `max`, below `min`, and a
  non-live row at a value other than 1.
  - Session 01 has no live row. So the range cases are driven by a test-local live row, built by
    spreading `ATTRIBUTES` inside the test. The shipped table must not grow a fixture row.
- Codec: `matchupFromQuery(matchupQuery(m))` round-trips a setup with attributes, and a link with
  a malformed `attributes` is refused.
- `copyGolem` keeps the field. The assertion compares whole setups with `assert.deepEqual`, not
  one leaf.
- The reducer: set, reset to 1 (the key is gone), and reset of the last key (the field is gone).
- The build context: a golem built from a setup with attributes exposes the resolved record on
  `golem.attributes`, and a module's build receives the same record. For the second, wrap one
  registered definition's `build` in the test and restore it in `finally`.

Mutation checks, each restored:
- drop the field from `copyGolem`;
- drop it from `readGolem`;
- make the reducer keep a key set back to 1;
- skip `attributesRefusal` in `golemSetupRefusal`.

Each must turn a test red.

## Gate

- The fingerprint: a baseline on the parent commit, then `--against`. Every section must read
  `same`.
- `npm test`, `npm run check`, `npm run build`, and the line-ending check.

## Done when

The field travels from a setup through a link and a copy to every module builder's context,
validation guards it, and no body has moved.
