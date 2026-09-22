# Skeleton 01 -- a fingerprint of every stone and human body

**Depends on:** nothing. **Moves:** nothing in `src/`. **Lands:** one harness module, one test.

## Why this comes first

Sessions 02 to 07 refactor code that every stone and human body runs through: the armour seam,
the arm chains, the torso and head builders, every shell builder. Each promises that stone and
human bodies do not move by a single bit. Today nothing can check that promise:

- Every determinism test in `tests/` compares two runs **in the same process**, so a change that
  moves stone physics deterministically passes all of them.
- The exact physical pins are build-time only: swing inertia equal to `STROKE_INERTIA.ref`
  (`tests/golem-arena.test.mjs`), the wrist cast masses (`tests/golem-bench.test.mjs`), two fatal
  parts with weights summing to 5.4, the default dimensions. None of them runs a solver step.
- Behavioural tests assert floors ("more than 5 hits"), which a moved body passes.

So this session adds an instrument that hashes what the bodies actually do, compared across two
commits.

## What it runs

New file `tests/harness/body-fingerprint.mjs`. Measured on 2026-09-22 (the Node harness): a
six-second bout with the per-substep hashing below takes about 1.9 s of wall time, one effector
bench 0.22 to 0.31 s, one torso or head bench 0.07 to 0.19 s, one locomotion run 0.21 s. The
whole fingerprint is about 30 s, most of it the twelve bouts.

**Bouts** (`runBout` from `tests/harness/bout-runner.mjs`), each `maxSeconds: 6`,
`locomotionMode: "supported"`, `physics: await freshHavok()`, default separation. The two bodies
go in as `leftGolem` and `rightGolem`, and the policies as `left` and `right`:

| Section | Left | Right | Policies |
| --- | --- | --- | --- |
| `bout:default~two-blades` | `default` | `two-blades` | golem-duelist / golem-fencer |
| `bout:mace~maul` | `mace` | `maul` | same |
| `bout:whip~fists` | `whip` | `fists` | same |
| `bout:ram-capped~ram-blade` | `ram-capped` | `ram-blade` | same |
| `bout:wheel~multileg` | `wheel` | `multileg` | same |
| `bout:plated~pitch-blade` | `plated` | `pitch-blade` | same |
| `bout:reach-blade~reach-maul` | inline: reach blade, reach plate | inline: reach maul, reach maul | same |
| `bout:reach-mace~pitch-mace` | inline: reach mace, reach fist | inline: pitch mace, pitch fist | same |
| `bout:human-warrior~human-maul` | `human-warrior` | `human-maul` | humanoid-duelist / humanoid-duelist |
| `bout:human-unarmed~mace` | `human-unarmed` | `mace` | humanoid-duelist / golem-duelist |
| `bout:human-dual-swords~default` | `human-dual-swords` | `default` | humanoid-duelist / golem-duelist |
| `bout:human-mace-whip~default` | inline: `humanSetup("mace", "whip")` | `default` | humanoid-duelist / golem-duelist |

A side is either a build name or an inline setup. A name is looked up in `PLAYABLE_BUILDS` in
`src/golem/roster.ts`, and the table refuses a name it cannot find. An inline stone setup is
`{ ...defaultGolemSetup(), primary: { chain, terminal }, secondary: { chain, terminal } }`, and
every inline setup is passed through `golemSetupRefusal` when the module loads, which throws on a
refusal. All four inline setups above are accepted today (checked 2026-09-22). Seeds for bout `i`
are `[0x5ce1e700 + 2 * i, 0x5ce1e701 + 2 * i]`.

Every stone named build and every human build appears at least once. The inline rows exist
because no named build uses the reach chain, the pitch chain's mace and fist, or the human mace and
whip, and session 04 edits `buildArmCore`, which the reach chain shares. With them, every one of
the 32 registered modules is in a fight: the 15 stone chain effectors, `effector.none`, the six
anatomical effectors, all three stone locomotions, both stone torsos, both stone heads, and the
human legs, torso and head.

**Benches:**

- `bench:<id>` -- `runGolemBench({ moduleId: id })` for every entry of `GOLEM_MODULES` whose
  `mode === "effector"`, read from the registry rather than listed (the same rule
  `EFFECTOR_IDS` in `tests/golem-bench.test.mjs` follows).
- `torso:<id>` -- `runTorsoBench({ torsoId: id, headId: null })` for every `mode === "torso"`
  entry; `head:<id>` -- `runTorsoBench({ torsoId: null, headId: id })` for every
  `mode === "head"` entry. Both shapes run on 9.18.1 today (checked 2026-09-22).
- `walk:<key>` -- `runGolemLocomotion({ moduleId: key })` for every key of `LOCOMOTION_MODULES`
  in `tests/harness/golem-bench.mjs` (today `biped`, `wheel`, `multileg`). The human legs are
  covered by the bouts; this session does not widen `LOCOMOTION_MODULES`.

## What each section hashes

`createHash("sha256")` from `node:crypto`, one per section.

- **A bout** feeds the hash from `onSample`, which runs once per solver substep (240 Hz): for each
  side (`left` then `right`) and each of `unit.limbs` in order, a `Float64Array` of
  `part.mesh.position.x/y/z`, `part.mesh.rotationQuaternion.x/y/z/w`, `health` and
  `severed ? 1 : 0`. Update the hash with the array's bytes. Read `mesh.position` and
  `mesh.rotationQuaternion` and nothing else -- `getWorldMatrix()` and `absolutePosition` stamp
  the render id when read (see `AGENTS.md`), and a hash must not change what it measures.
  `onEvent` feeds `JSON.stringify(event)` into the same hash. After `runBout` returns, feed
  `JSON.stringify` of `{ winner, ending, text, deathRegion, seconds, left, right }` from the
  result.
- **A bench** hashes `JSON.stringify(result)`. JSON prints every finite double in its shortest
  round-trip form, so it is exact. Checked 2026-09-22: `effector.wrist.blade` gives the same
  digest in two separate processes.

Print only the first 16 hex digits per section; the full digest goes in the file.

## Its interface

```text
node tests/harness/body-fingerprint.mjs --out .review/fp-before.json
node tests/harness/body-fingerprint.mjs --out .review/fp-after.json --against .review/fp-before.json
node tests/harness/body-fingerprint.mjs --only bout: --out ...
```

- `--out <file>` writes `{ "version": 1, "sections": { "<name>": "<sha256 hex>" } }`, with
  sections sorted by name.
- `--against <file>` compares and prints one line per section: `same`, `MOVED`, `new` or
  `GONE`. The process exits 1 if any section is `MOVED` or `GONE` and 0 otherwise. `new` is not a
  failure, because sessions 06 and 07 add skeleton sections on purpose.
- `--may-move <regex>` works with `--against`. A section whose name matches the pattern and moved
  is printed `moved (allowed)` and does not fail the run. This is for a session that changes one
  family's values on purpose: session 08 passes `--may-move "skeleton|skeletal|ribcage|skull"`,
  and every other section still has to read `same`. A `GONE` section always fails, whether or not
  it matches.
- `--only <prefix>` runs only the sections whose names start with the prefix. This is for
  bisecting, and a partial file must never be used as a `--against` baseline, so write
  `"partial": true` into it and refuse one as a baseline.

Export the pieces so the test can call them without spawning a process:

```js
export const FINGERPRINT_VERSION = 1;
export const BOUTS = Object.freeze([ /* the table above */ ]);
export async function fingerprintBout(spec) { /* -> hex digest */ }
export async function fingerprintBench(kind, id) { /* kind: "bench" | "torso" | "head" | "walk" */ }
export async function fingerprint({ only = "" } = {}) { /* -> { version, sections } */ }
export function compareFingerprints(before, after, mayMove = null) { /* -> [{ name, status }] */ }
```

Run the command-line half only when the module is the entry point
(`process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href`), so importing it
runs nothing. The `process.argv[1] &&` matters: under `node -e` there is no `argv[1]`, and
`pathToFileURL(undefined)` throws.

## The test

New file `tests/body-fingerprint.test.mjs`. Three tests, about 5 to 6 s together:

1. `a_fingerprint_is_the_same_twice_in_one_process` -- `fingerprintBout(BOUTS[0])` twice, equal.
   Also `fingerprintBench("bench", "effector.wrist.blade")` twice, equal.
2. `a_stone_mass_moves_the_stone_sections_and_not_the_human_ones` -- read
   `bench:effector.wrist.blade` and `bench:effector.anatomical.blade`, then save
   `CHAIN_REACH.foreMass`, set it to 1.01 times the saved value, and read both again. Restore the
   saved value in `finally`, rather than dividing by 1.01, which need not give the same double
   back. The wrist one must differ and the anatomical one must not. This is the mutation that shows the instrument can see
   a stone change, and that it does not smear it onto another family. `CHAIN_REACH` is a plain
   object that the bench sweeps already mutate. Do not use `CHAIN_WRIST.wristMass`: the wrist link
   is cast to `max(wristMass, carryRatio * carried)`, and under a blade the carry term wins, so
   that mutation is a no-op and would make the test pass for the wrong reason.
3. `compare_reports_moved_gone_and_new` -- `compareFingerprints` on three small hand-built
   objects. Assert on the full returned array with `assert.deepEqual`, not on a count. Call it once
   more with `mayMove = /^b/`, where section `a` moved and section `b` moved. Only `b` becomes
   `moved (allowed)`; `a` stays `MOVED`. A pattern that excused everything would pass a test that
   only checked the allowed case.

Watch test 2 go red before trusting it: comment out the mutation and see "the wrist section did
not move" fail.

## Cross-process check (by hand, once)

```powershell
node tests/harness/body-fingerprint.mjs --out .review/fp-a.json
node tests/harness/body-fingerprint.mjs --out .review/fp-b.json --against .review/fp-a.json
```

Every line should read `same`, with exit 0. Record the wall time in the harness module's
docstring, naming the harness. If any section differs between two processes, stop: something in
it is not deterministic (a `Date.now()`, a `Math.random()` reached by a policy, iteration over a
`Map` keyed by an object), and the fingerprint cannot be the gate until that is found. Report it
to the owner rather than excluding the section.

## What the fingerprint does not see

Shell meshes carry no bodies, so a cosmetic change is invisible to it. Session 05 checks those
directly. UI text, labels and button order are invisible too, and session 03 checks them by test.

## Done when

- `npm test`, `npm run check` and `npm run build` pass.
- The cross-process check reads all `same`.
- The docstring records the wall time and the date.
- Committed, including a `.review/fp-<sha>.json` baseline only if the owner wants it tracked.
  `.review/` is gitignored, so by default each later session takes its own baseline with `--out`
  before its first edit and compares with `--against` after its last.
