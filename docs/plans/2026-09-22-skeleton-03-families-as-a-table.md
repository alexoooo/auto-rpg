# Skeleton 03 -- body families as a declared table

**Depends on:** 01. Independent of 02. **Moves:** no stone or human body; the setup screen
looks and behaves exactly as before. **Lands:** a rewritten `src/golem/family.ts`, one new file,
and the two-family literals in five places replaced by table reads.

## The problem

`src/golem/family.ts` infers a family by exclusion:

```ts
const HUMAN_MODULES = new Set(["locomotion.human", "torso.human", "head.human", "anatomical"]);
export const moduleFamily = (id: string): BodyFamily =>
  HUMAN_MODULES.has(id) || id.startsWith("effector.anatomical.") ? "human" : "golem";
```

Any id it does not recognise is `"golem"`. If this stays, the skeleton's modules would be stone
modules the moment they are registered. They would appear on the stone shelves, in stone random
draws and in the stone refusal, and a skeleton setup would be refused as mixed. Nothing would
throw, which is the "ternary chain with a default branch" trap in `AGENTS.md`.

Two-family literals also sit in `src/bout.ts` (the codec), `src/setup.ts` (two hard-coded
buttons, two `case`s, a binary `randomize`), `src/golem/build.ts` (the refusal text) and
`src/dungeon/run.ts` (the policy choice). A third family would have to find every one.

## The change

### `src/golem/family.ts` (rewritten)

```ts
import type { ChainId } from "./module.ts";

/**
 * The body families, in the order the setup screen offers them.
 *
 * Declared, never inferred. Every module belongs to exactly one family by a row below, and an id
 * with no row throws instead of joining a family by default: a module registered without a row
 * would otherwise land on another family's shelves, in its random draws and its refusal, silently.
 */
export const BODY_FAMILIES = ["human", "golem"] as const;
export type BodyFamily = (typeof BODY_FAMILIES)[number];

export const isBodyFamily = (value: unknown): value is BodyFamily =>
  typeof value === "string" && (BODY_FAMILIES as readonly string[]).includes(value);

/** What the setup screen's button for each family says. */
export const FAMILY_LABEL: Readonly<Record<BodyFamily, string>> =
  Object.freeze({ human: "Human warrior", golem: "Stone golem" });

/** The policy a corner is given when a person picks the family's button. */
export const FAMILY_POLICY: Readonly<Record<BodyFamily, string>> =
  Object.freeze({ human: "humanoid-duelist", golem: "golem-duelist" });

/** Each arm chain's family. Total over `ChainId`, so a new chain is a compile error here. */
export const CHAIN_FAMILY = Object.freeze({
  none: "golem", pitch: "golem", reach: "golem", wrist: "golem", anatomical: "human",
} as const satisfies Record<ChainId, BodyFamily>);

/** Each locomotion, torso and head module's family. `tests/body-family.test.mjs` holds this
 *  table and the registry to the same set of ids, in both directions. */
export const BODY_MODULE_FAMILY: Readonly<Record<string, BodyFamily>> = Object.freeze({
  "locomotion.biped": "golem", "locomotion.wheel": "golem", "locomotion.multileg": "golem",
  "torso.plain": "golem", "torso.plated": "golem",
  "head.plain": "golem", "head.ram": "golem",
  "locomotion.human": "human", "torso.human": "human", "head.human": "human",
});

/**
 * The family of a module id, a chain id, or an effector id (`effector.<chain>` or
 * `effector.<chain>.<terminal>`). Throws on an id with no row.
 */
export function moduleFamily(id: string): BodyFamily {
  if (Object.hasOwn(BODY_MODULE_FAMILY, id)) return BODY_MODULE_FAMILY[id];
  const chain = id.startsWith("effector.") ? id.split(".")[1] : id;
  if (Object.hasOwn(CHAIN_FAMILY, chain)) return CHAIN_FAMILY[chain as ChainId];
  throw new Error(`"${id}" belongs to no body family; give it a row in src/golem/family.ts`);
}

/** A setup's family: its own field when it has one, else its locomotion's. */
export function bodyFamily(setup: { family?: BodyFamily; locomotion: string }): BodyFamily {
  return setup.family ?? moduleFamily(setup.locomotion);
}
```

Use `Object.hasOwn` and not `table[id]`. A lookup by plain index returns
`Object.prototype.constructor` for the id `"constructor"`. `build.ts` already uses `Object.hasOwn`
for `EFFECTOR_CHAINS` for the same reason.

`family.ts` imports only a type, so it stays loadable by Node and cannot form a cycle. Both tables
are exported because test 2 below reads `BODY_MODULE_FAMILY`, and the overview lists both as
introduced constants.

### Throwing is safe at every caller. Audited 2026-09-22:

| Caller | Where its ids come from |
| --- | --- |
| `golemChainOptions` / `golemLocomotionOptions` / `golemTorsoOptions` / `golemHeadOptions` in `build.ts` | the registry lists themselves |
| `golemSetupRefusal` in `build.ts` | called only after each slot has resolved to a registered module |
| `randomGolemSetup` in `build.ts` | the option lists |
| `setup.ts` customize panel, `bodyFamily(build)` | a matchup that passed `golemSetupRefusal`: `main.ts` refuses a decoded link before building (`linkRefusal`), and every picker offers registered ids only |
| `setup.ts` bin filter, `moduleFamily(entry.id)` | `readPartsBin` in `src/golem/parts-bin.ts` refuses an entry whose id `knownOption` does not offer |
| `setup.ts` `randomize`, `bodyFamily(...)` | the same matchup |
| `src/dungeon/main.ts`, `bodyFamily(setup)` | `PLAYABLE_BUILDS`, refused at load in `roster.ts` |

The implementer re-runs this audit with `grep -rn "moduleFamily\|bodyFamily" src` and adds any
new caller to the table in the commit message.

### New file `src/golem/family-setup.ts`

This cannot live in `family.ts`. `build.ts` imports `family.ts`, so importing `build.ts` back
would create a cycle.

```ts
import type { GolemSetup } from "../bout.ts";
import { defaultGolemSetup } from "./build.ts";
import type { BodyFamily } from "./family.ts";
import { humanSetup } from "./humanoid/presets.ts";

/** The body a family's button builds. Total, so a new family is a compile error here. */
export const FAMILY_SETUP: Readonly<Record<BodyFamily, () => GolemSetup>> = Object.freeze({
  human: () => humanSetup(),
  golem: () => defaultGolemSetup(),
});
```

### `src/golem/build.ts` -- the refusal text

The message ends `Choose Human warrior or Stone golem to select a complete body.` Build it from
the table:

```ts
const listed = (words: readonly string[]): string =>
  words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} or ${words.at(-1)}`;
// in golemSetupRefusal:
return `The ${slot} belongs to the ${moduleFamily(id)} body family, not ${family}. `
  + `Choose ${listed(BODY_FAMILIES.map((f) => FAMILY_LABEL[f]))} to select a complete body.`;
```

With two families this is byte-identical to today's text. Assert it (see Tests below).

### `src/bout.ts` -- the codec

In `readGolem`:

```ts
if (value.family !== undefined) {
  if (!isBodyFamily(value.family)) return null;
  golem.family = value.family;
}
```

`GolemSetup.family?` already types as `BodyFamily`, so no type edit is needed.

`isBodyFamily` is a value import from `src/golem/`, and `bout.ts` says in two places that it may
not have one. Its header says `tests/bout.test.mjs` runs the file under Node "with no DOM and no
Babylon anywhere in its graph", and `golemMatchup`'s doc comment says "This module cannot import
`src/golem/` to check it itself". The import is safe only because `family.ts` has nothing but a
type import. So:

- Import it as `import { isBodyFamily } from "./golem/family.ts";`, and put a comment above it
  in the style of the one above the `hands.ts` import: `family.ts` imports only a type, which is
  the only reason this file may have it.
- Correct the header, which says "The only value import here is `config.ts`" and already has a
  second one (`hands.ts`). Say instead that the value imports are `config.ts`, `hands.ts` and
  `golem/family.ts`, none of which reaches Babylon, and that the test below enforces it.
- Correct `golemMatchup`'s sentence to say what is true: this module may not import the golem
  registry or anything that builds a body, so it cannot check a build itself. It may import
  `family.ts`, which is a table.
- Add the enforcement to `tests/bout.test.mjs`, because a comment cannot hold the rule. The test
  is `bout_loads_with_babylon_unresolvable`. It runs a child Node process with a resolve hook
  that throws on any specifier starting `@babylonjs/`, imports `src/bout.ts`, and asserts exit
  status 0. It walks the real import graph rather than grepping the source:

  ```js
  const hooks = `export async function resolve(specifier, context, next) {
    if (specifier.startsWith("@babylonjs/")) throw new Error("reached " + specifier + " from " + context.parentURL);
    return next(specifier, context);
  }`;
  const register = `import { register } from "node:module"; register(${JSON.stringify("data:text/javascript," + encodeURIComponent(hooks))});`;
  const run = spawnSync(process.execPath, [
    "--import", "data:text/javascript," + encodeURIComponent(register),
    "--input-type=module", "-e", `await import(${JSON.stringify(pathToFileURL("src/bout.ts").href)});`,
  ], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  ```

  Prototyped on Node 24.15.0 on 2026-09-22. `src/bout.ts` and `src/golem/family.ts` exit 0, and
  `src/golem/build.ts` exits 1 with "reached @babylonjs/core/Maths/math.vector.js from
  .../effectors/effector.ts". Put that control in the test too, and assert that it fails, so the
  hook is shown to bite. Also watch the real test go red by adding
  `import "@babylonjs/core/Maths/math.vector.js";` to `family.ts`.

### `src/setup.ts` -- buttons, handler, randomize

Replace the two literal buttons with one generated per family, keeping today's order and text:

```ts
${BODY_FAMILIES.map((family) =>
  `<button class="action quiet" type="button" data-side="${side}" data-field="family" data-family="${family}">${FAMILY_LABEL[family]}</button>`).join("\n          ")}
```

Replace `case "stone"` and `case "human"` with:

```ts
case "family": {
  const side = target.dataset.side as Side;
  const family = target.dataset.family;
  if ((side !== "left" && side !== "right") || !isBodyFamily(family)) return;
  this.matchup = withGolemBuild(this.matchup, side, FAMILY_SETUP[family](), randomSeed());
  this.matchup = withPolicy(this.matchup, side, FAMILY_POLICY[family]);
  break;
}
```

This keeps today's call order (build, then policy, with `randomSeed()` called once), so each button
does exactly what its old `case` did.

`randomize` becomes an exhaustive switch:

```ts
const family = this.matchup[side].golem ? bodyFamily(this.matchup[side].golem!) : "golem";
const draw = (): GolemSetup => {
  switch (family) {
    case "golem": return other ? randomViableOpponent(rng, other) : randomViableGolemSetup(rng);
    case "human": return randomGolemSetup(rng, family);
    default: { const unhandled: never = family; throw new Error(`no random draw for ${unhandled}`); }
  }
};
const build = draw();
```

The `golem` arm keeps the viability draws, which are stone-only today (`src/golem/viability.ts`).
The `human` arm keeps the plain draw.

Drop the now-unused `humanSetup` and `defaultGolemSetup` imports from `setup.ts`. Today each is
used only in the `case` this session deletes, and `noUnusedLocals` will insist.
`randomGolemSetup` is still used by `randomize` and stays.

### `src/dungeon/run.ts`

```ts
const policy = definition.createPolicy!(FAMILY_POLICY[bodyFamily(setup)], Math.floor(random() * 0xffffffff));
```

This matches `hasAnatomicalArm` for every setup the dungeon can hold, because a human setup's
chains are both `anatomical` and a stone setup has none. Keep `hasAnatomicalArm`: `presets.ts`
exports it and a test may use it. Remove the import from `run.ts` only.

### `src/golem/humanoid/appearance.ts`

The human skin selects parts by substring:
`p.moduleId.includes(".human") || p.moduleId.includes(".anatomical.")`. Replace it with
`moduleFamily(p.moduleId) === "human"`. It selects the same set today, and it keeps a skeleton
module named, say, `torso.human-ribcage` from being skinned as a person. Check what `moduleId`
holds at that site before changing it. If it is ever a non-module string, leave the substring and
note why. `appearance.ts` is loaded by Node through `golem.ts`, so the new import needs its
extension: `import { moduleFamily } from "../family.ts";`.

### Left as they are, deliberately

- `src/dungeon/main.ts`: `bodyFamily(setup) !== "human"` hides the human *equipment* pickers.
  That question really is about the human family.
- `bench/main.ts`: the `appearance === "human"` checks are about how a part is drawn, and session
  05 deals with them.

## Tests

### `tests/body-family.test.mjs`

Rewrite it to loop over `BODY_FAMILIES` and `FAMILY_SETUP` instead of the pair
`[humanSetup(), defaultGolemSetup()]` and the binary `other`:

- Every family's setup is accepted, including with `family` deleted.
- For every ordered pair of different families and every slot, the mixed setup is refused
  `/body family/`, and `golemEffectorPlan` throws.
- For every family, 100 random draws stay inside it, and every shelf is non-empty and all of one
  family.

New tests in the same file:

1. `every_registered_module_has_exactly_one_family` -- for each `GOLEM_MODULES` entry,
   `moduleFamily(id)` does not throw. For an effector, compare against an expectation the test
   holds itself:
   `const EXPECTED_CHAIN_FAMILY = { none: "golem", pitch: "golem", reach: "golem", wrist: "golem", anatomical: "human" };`.
   Assert that `moduleFamily(effectorId)` equals `EXPECTED_CHAIN_FAMILY[chain]`, and that every
   chain in `EFFECTOR_CHAINS` has a row there. Comparing with `moduleFamily(chain)` instead could
   never fail, because the effector lookup *is* the chain lookup. Session 06 adds
   `skeletal: "skeleton"` to this test table.
2. `the_family_table_names_nothing_the_registry_does_not_offer` -- every `BODY_MODULE_FAMILY`
   key is a registered id. Export the table for this test, or expose `familyTableIds()`.
3. `an_unknown_id_throws_rather_than_joining_a_family` -- `moduleFamily("torso.bone")` throws
   `/no body family/`, and so do `moduleFamily("constructor")` and
   `moduleFamily("effector.constructor.blade")`.
4. `the_codec_reads_every_family_and_refuses_others` -- round-trip
   `matchupFromQuery(matchupQuery(golemMatchup(FAMILY_SETUP[f]())))` for every `f` in
   `BODY_FAMILIES`, and assert that the family survives. Then edit the encoded family to
   `"not-a-family"` and assert that `matchupFromQuery` returns `null`. Do not use `"skeleton"`:
   session 06 makes it a family, and the test would then go red for the right reason.
   `readGolem` is private,
   and these two exported functions are its only callers. Read `matchupQuery` first to see how the
   golem record is encoded, so the edit is made to the real encoding.
5. `the_refusal_names_every_family_by_its_label` -- a mixed setup's refusal ends with exactly
   `Choose Human warrior or Stone golem to select a complete body.` That is today's text, pinned
   so the generated one cannot drift. When session 06 adds a third family, this becomes
   `Choose Human warrior, Stone golem or Skeleton to select a complete body.`
6. `every_family_has_a_label_a_policy_and_a_setup` -- `POLICIES` (in `src/mind.ts`) is an array
   of `Policy` records, so assert `POLICIES.some((p) => p.name === FAMILY_POLICY[f])`. Also assert
   that `FAMILY_SETUP[f]()` passes `golemSetupRefusal` and that its `bodyFamily` is `f`.

Watch test 3 go red against the old `family.ts`, which returns `"golem"` for all three.

### Other test files that name families

- `tests/golem-random.test.mjs`: the `draws(..., "human")` concatenations become
  `BODY_FAMILIES.flatMap((f) => draws(seed, DRAWS, f))` in the three tests that use them. This
  matters in session 06. `over_a_few_hundred_draws_every_option_of_every_slot_appears` compares
  against the unfiltered option lists, so it can only stay green when every family is drawn.
- `tests/policy-applicability.test.mjs`: replace
  `moduleFamily(option.chain) === "human" ? humanSetup() : defaultGolemSetup()` with
  `FAMILY_SETUP[moduleFamily(option.chain)]()`.
- `tests/forge-style.test.mjs` filters to `"golem"` on purpose (forge art is stone art). Leave it.

## One-off check, not committed

Before deleting the old function, paste it into a scratch script under `.review/` and compare old
and new `moduleFamily` for every `GOLEM_MODULES` id, every `GOLEM_EFFECTORS` chain and every
effector id. They must agree on all of them. Record the count compared in the commit message.

## Verification

```powershell
node tests/harness/body-fingerprint.mjs --out .review/fp-before.json   # before editing
npm test
npm run check
npm run build
node tests/harness/body-fingerprint.mjs --out .review/fp-after.json --against .review/fp-before.json
```

Every section must be `same`. Then check the page, because no test covers `setup.ts`. Start
`npm run dev` with `run_in_background`. On `/`, both corners must show "Human warrior" then
"Stone golem". Each button must give the same caption and policy as before, and Randomize must
stay inside the current family. Then stop the server and kill it by PID
(`netstat -ano | findstr ":5180"`). Commit.
