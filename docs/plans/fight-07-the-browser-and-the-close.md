# Fight 07 -- the browser, the documents, and the close

**Status:** ready once session 06 has landed. Closes the topic.

Everything up to here has been measured in a headless corpus. This session puts the
fighter in front of a person, repairs the documents the deletions left behind, and deletes
this plan set.

## The studio opens on the fighter

Two routes and two defaults.

**`#/game`, the dungeon.** `Sim::try_new` currently opens both sides on
`EmbodiedPolicyKind::Scripted` and its comment explains, at length, that the registry held
one mind, a copy of it with a term switched off, and a control that stands there -- so
there was no contrast worth watching and both sides opened on the same entry. **That is no
longer true.** The registry now holds a fighter and the script is the control, which is
exactly the asymmetry the comment says was missing. Open the room on the tactical fighter
on both sides, and rewrite the comment rather than deleting it: it is a good record of a
constraint that was real and stopped being real.

**`#/arena`.** Session 05 moved it to `EmbodiedPolicyKind`. Its dropdown is the page's
whole subject -- watching the same room go differently when the selection moves -- so it
lists all four entries, and the default pairing is **tactical against scripted**, which is
the comparison the topic was built to make visible.

**A request the page cannot honour must be refused by name.** Two consecutive reviews
found ten instances of that bug in this repository, always the same shape: a control
accepts an input it cannot act on and says nothing. Every policy code the dropdown can
send must either take effect or come back as a named refusal a test can assert.

## What the owner has to judge, because no gate can

`AGENTS.md` is explicit that rendering performance cannot be measured from an automated
browser tab: a Claude-in-Chrome tab is always `visibilityState: "hidden"`, which is not a
throttle but a stop, and it rasterises in software. Four confident wrong hypotheses in a
row came out of ignoring that.

So this session **hands the owner a script and reads their answer**, and does not
substitute a screenshot for it:

1. `npm run dev`, in the foreground, stopped before the session finishes.
2. `#/game` -- watch one Fighter-versus-Brute encounter through to a body. Does it read as
   two people fighting?
3. `#/arena` -- run tactical against scripted, then tactical against tactical, and confirm
   the two look different.
4. The frame time, from a visible foreground tab, against
   [the arena matrix](../performance/v2-arena-matrix.md) and
   [the room matrix](../performance/v2-room-matrix.md), both of which still owe rows to a
   person.

**Only the owner's judgement on step 2 closes this topic.** The corpus in session 04 is
evidence that the fight resolves and is not evidence that it is worth watching, and those
are different claims. If the answer is no, the finding is recorded with what specifically
reads wrong and the topic gains a session rather than a lowered bar.

## The documents the deletions left behind

Two models were deleted across this topic and the one before it, and the reference tree
still describes both. Measured on 2026-08-18, mentions of the retired models:

```text
docs/reference/articulated-abi.md          33
docs/reference/articulated-actuators.md    16
docs/reference/hashes.md                   19
docs/reference/contact-solver.md           12
docs/reference/hash-domains-v1.md          15
docs/reference/replay-codec-v1.md           7
docs/reference/articulated-command-v1.md    7
docs/reference/combat-specs.md              6
docs/reference/replay-codec-v2-combat-specs.md  6
docs/reference/articulated-mechanical-gate.md   6
docs/reference/anatomy-health.md            4
docs/reference/commands.md                  4
docs/reference/worker-protocol.md           3
```

Not all of them are wrong -- `hashes.md`'s nineteen are mostly the retired-pin table,
which exists precisely to name what is gone -- and **that is the distinction this session
has to make one file at a time.** Three kinds:

- **History that says so.** Keep. The retired-pin table, the superseded-DESIGN blocks, and
  the correction records are the repository's own house style and deleting them would lose
  the corrections.
- **Prose in the present tense about a model that does not exist.** Repair.
  `articulated-abi.md` is the worst of these: it describes the legacy loop dropping
  commands, `set_policy` refusing four legacy codes, and a Legacy observation appending 472
  zeroes. All three describe machinery that is gone, in the present tense, in the document a
  browser-side reader is sent to first.
- **A `path#Lnnn` anchor pointing at a symbol that moved or went.** `check_docs.js` catches
  these and it is the reason to run it rather than trust a read-through.

`articulated-mechanical-gate.md` needs a decision rather than a repair: it is the contract
for a gate on a model that no longer exists, and the honest options are *retire it as
history* or *rewrite it as the embodied gate*. The recommendation is to retire it and let
`docs/performance/embodied-tactical-policy.md` -- written by sessions 02 through 04 -- be
the live gate record, because a gate contract with no fixture is a promise nothing can
keep.

## The knowledge that has to outlive the plans

`AGENTS.md` says durable results from closed sessions belong in architecture, design,
reference or performance documents, and that the plan set is deleted in the commit that
finishes the topic. Before deleting this one, confirm each of these has a home:

| what | where |
|---|---|
| the corpus baseline, the acceptance table, and every measured result | `docs/performance/embodied-tactical-policy.md` |
| what the tactical policy reads and why the guard is a read | `docs/architecture/policy.md` |
| the state stream after session 01, and why `facing` survived | `crates/sim/src/world/hash.rs` and `docs/reference/hashes.md` |
| the two exact-law digests' ported fixture | the golden registry rows |
| the ABI prefix being historical | `docs/reference/articulated-abi.md` |

Then delete `docs/plans/fight-*.md` -- all eight files -- in the commit that closes the
topic, and repoint the roadmap links in `AGENTS.md`, `README.md`, `DESIGN.md` and
`docs/README.md` at whatever the next live topic is.

## Hash expectations

**Nothing moves.** This session changes two defaults, a dropdown, and prose.

The browser goldens that would once have caught a changed default are gone -- `ROOM_HASH`,
`BATTLE_HASH`, `SWAP_HASH` and `BOW_HASH` were all Legacy fixtures and are in the retired
table -- so **the client suites and `wasm_check` are the whole of the automated cover for
this session.** That is worth stating plainly rather than discovering: a changed default
in `crates/web` is exactly the kind of change those four pins used to catch.

## Verification

```powershell
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
node tools/check_deps.js
node --test "client/test/*.test.mjs"
npm run check:abi
npm run dev        # foreground, stopped before the session ends
```

## Acceptance

1. Both routes open on the tactical fighter, and `#/arena` can be moved off it and back.
2. Every policy code the page can send either takes effect or is refused by name, with a
   test that asserts the refusal sentence.
3. `check_docs.js` green, with no reference document describing a deleted model in the
   present tense.
4. The owner has watched a fight at a foreground browser and said whether it reads as two
   people fighting.
5. `docs/plans/fight-*.md` deleted, the four roadmap links repointed, and the commit
   message naming what moved into which durable document.
