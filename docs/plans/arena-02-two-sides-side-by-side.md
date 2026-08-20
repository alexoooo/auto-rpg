# Arena 02 -- two sides, side by side

**Status:** ready. Independent of session 01; blocks 03 and 05.

The picker is two stacked rows of `<select>`s with the seed and the **[Run selected
fight]** button jammed into the end of the second one (`web/index.html:434-501`). This
session makes it the screen the owner asked for: **the page splits in half, A is
configured on the left and B on the right**, and it gains the one choice the whole topic
turns on -- who drives each side.

## The screen

Selection is a **phase of `#/arena`, not a second route.** The reasons are concrete
rather than aesthetic: the route already owns the Babylon stage, the lazily constructed
Worker, the `ResizeObserver`s over four canvases and the window keydown handler, and a
second route would need a second copy of the mount and dispose discipline that
`every_registration_that_outlives_the_route_subtree_is_released_in_the_same_file`
(`client/test/studio-shell.test.mjs:1182`) exists to hold. One route, two phases,
`select` and `fight`, with the stage hidden in the first and the picker collapsed to a
one-line summary with a **[Change]** button in the second.

```
+-------------------------------+-------------------------------+
|            FIGHTER A          |            FIGHTER B          |
|      (3D preview, session 03) |      (3D preview, session 03) |
|                               |                               |
|  anatomy   [Fighter      v]   |  anatomy   [Brute        v]   |
|  left      [Shield       v]   |  left      [empty        v]   |
|  right     [Sword        v]   |  right     [Club         v]   |
|  two-handed [ ]               |  two-handed [ ]               |
|  driven by [tactical     v]   |  driven by [scripted     v]   |
|  off hand  [--           v]   |  off hand  [--           v]   |
+-------------------------------+-------------------------------+
|  seed [3]        <refusal or notes>            [    Fight    ] |
+---------------------------------------------------------------+
```

**The seed and the button leave side B's column.** They belong to the matchup and not to
a fighter, and their present home is an accident of the row layout that a split screen
makes visible: side B is not "the side that owns the seed".

**"driven by" is one control with the policy list plus one entry**, not a policy select
beside a control checkbox. The two are not independent -- a human side still needs a
policy for its off hand -- and two controls that must agree are two controls that can
disagree. So the list is `neutral / scripted / scripted-level / tactical /
tactical-fixed-guard / you (keyboard and mouse)`, and picking the last reveals the **off
hand** row, which is the same policy list and is disabled and shown as `--` otherwise.

## The model

`SideChoice` gains one field. `client/src/arena/picker.ts:123`:

```ts
export interface SideChoice {
  readonly anatomy: AnatomyCode;
  readonly left: HandCode;
  readonly right: HandCode;
  readonly twoHanded: boolean;
  /**
   * The policy that decides this side, or -- when `control` is `"human"` -- the
   * policy that decides everything the hand at the keyboard does not claim.
   *
   * **One byte, two meanings, and the meaning is the control byte's job to
   * pick.** The alternative was a second `offHandPolicy` field that is ignored
   * whenever `control` is `"policy"`, which is a field that is wrong half the
   * time and a second place for the two to disagree.
   */
  readonly policy: PolicyCode;
  readonly control: ControlCode;
}

/** Who fills this side's navigation and primary arm. */
export type ControlCode = "policy" | "human";
```

`review()` stays pure, stays the single entry point, and gains three refusals and one
note. Each names the control it is about, in the shape the existing ones use.

```ts
// Both sides human: one keyboard, two bodies.
if (matchup.a.control === "human" && matchup.b.control === "human") {
  return {
    refusal: "Fighter A and Fighter B are both set to be driven by you, and this page has "
      + "one keyboard and one pointer. Set one of the two back to a policy.",
    notes: [],
  };
}
```

```ts
// A human side whose primary hand is empty.
for (const [label, side] of sides(matchup)) {
  if (side.control !== "human") continue;
  if (side.right === "empty") {
    return {
      refusal: `${label} is set to be driven by you, but its right hand is empty and the `
        + `right hand is the one the pointer aims. Give ${label} a weapon in its right hand, `
        + `or hand ${label} back to a policy.`,
      notes: [],
    };
  }
}
```

```ts
// The build that cannot honour it yet. Deleted by session 05, and it is the
// reason this session is allowed to ship the control at all.
if (!CONTROL_AVAILABLE && (matchup.a.control === "human" || matchup.b.control === "human")) {
  return {
    refusal: "A side is set to be driven by you, and this build has no input path for the "
      + "arena yet: arena_start would refuse it with ARENA_CONTROL_UNAVAILABLE. Set both "
      + "sides to a policy.",
    notes: [],
  };
}
```

The note, because `review` advises as well as refuses: a human side against `neutral`
stands still and is not a test of anything, exactly as
`the_picker_says_when_a_choice_it_honours_shows_the_reader_nothing` already covers
neutral against neutral.

## The wire: arena config layout 2 becomes 3

`ARENA_FIGHTER_RESERVED` is two bytes at offset 2 of each 56-byte fighter block, and its
comment says what they are for -- alignment, and room a policy or anatomy registry past
256 entries would grow into. **One of them stops being reserved, which is a layout change
and not a free bit**, and that sentence is already written in this file at
`crates/web/src/lib.rs:1204-1210` about the last byte that did this. Follow it: bump the
version, rewrite the comment, keep the second byte reserved.

```rust
// crates/web/src/lib.rs
/// `3` since arena-02: layout `2` required byte `2` of every fighter block to be
/// zero, and that byte now carries [`ARENA_CONTROL_POLICY`] or
/// [`ARENA_CONTROL_HUMAN`]. A byte that stops being reserved is a layout change,
/// not a free bit, because a version-2 writer's promise about it no longer holds.
pub const ARENA_CONFIG_LAYOUT_VERSION: u16 = 3;

const ARENA_FIGHTER_CONTROL: usize = 2;
/// One byte, still reserved, still the alignment and still the registry headroom.
const ARENA_FIGHTER_RESERVED: usize = 3;

/// This side is decided entirely by its policy byte. What every layout-2
/// configuration meant, which is why it is zero.
pub const ARENA_CONTROL_POLICY: u8 = 0;
/// This side's navigation and primary arm come from the host. Its policy byte
/// still builds the mind that drives the off hand.
pub const ARENA_CONTROL_HUMAN: u8 = 1;

/// A fighter's control byte is neither of the two above.
pub const ARENA_UNKNOWN_CONTROL: u8 = 28;
/// A human side was configured and this build has no arena input path.
///
/// **Retired by arena-05 rather than renumbered.** The code stays spent, on the
/// rule `ARENA_POLICY_UNAVAILABLE` and `ARENA_NO_CHECKPOINT` already established:
/// a URL or a saved configuration can carry a refusal code, so renumbering one
/// down into a gap makes an old artifact say something new.
pub const ARENA_CONTROL_UNAVAILABLE: u8 = 29;
```

**The control byte must not reach `Scenario`.** `duel_from(&DuelConfigV1)` reads anatomy,
hands, spawn and `max_ticks`, and `arena_fingerprint_*` is taken over what it built. A
control byte inside that would make the human fight and the AI fight at the same seed two
different fixtures, and the comparison this whole topic exists to make would stop being
possible. The byte is read by `arena_start` and kept on the host side of the line, and
`the_arena_fingerprint_does_not_change_when_a_side_is_handed_to_a_human` asserts it by
building both configurations and comparing the two fingerprint words.

## The seven places the layout moves together

A partial mirror update is not green even if the page still draws. **This list read
"five" until it was checked against the tree, which is the same undercount this repository
has already shipped twice -- count from the list, never from the heading.**

1. `crates/web/src/lib.rs` -- the layout constants, `arena_config_layout_version()`, the
   decoder's control-byte branch, and the two new refusal codes with the doc comment each
   refusal carries.
2. **`ARENA_REASONS`, `crates/web/src/lib.rs:1528`** -- a hand-maintained `[u8; 28]` whose
   only consumer is the distinctness assert at `:1557`. **A new refusal code compiles
   without touching it**, and is then never checked for distinctness against the
   twenty-eight that are. That is precisely the fails-open shape the array's own doc
   comment at `:1520-1527` claims to close, and it is the easiest thing on this list to
   miss.
3. `client/src/runtime/arena-config.ts` -- `ARENA_CONFIG_LAYOUT_VERSION`, the
   `encodeArenaConfig` write, the `decodeArenaConfig` read, and `ARENA_REFUSALS` gaining
   two rows so `describeArenaRefusal` can name them.
4. **`client/test/worker-protocol.test.mjs:1311`** --
   `assert.equal(Object.keys(CONFIG.ARENA_REFUSALS).length, 28)`, a literal. Two new
   refusals make it 30.
5. **`tools/wasm_check.js`** -- it carries its own `const ARENA_CONFIG_LAYOUT_VERSION = 2`
   at `:2574`, writes it into the staged buffer at `:2651`, and asserts the export answers
   it at `:2720`. This session's own verification block runs it.
6. `client/src/arena/picker.ts` -- `ControlCode`, the three refusals, `arenaConfigOf`.
7. `client/src/runtime/arena-recorder.ts:539` -- the read-back check. It verifies
   `arena_policy(faction)` against the byte sent; it gains the control byte the same way,
   or the header labels a fight with a control it is not running.

`ARENA_CONFIG_BYTES` stays 120: this change spends a reserved byte and adds none. What
guards that is the const assert at `crates/web/src/lib.rs:1330` and the width checks in
`tools/wasm_check.js:2571` and `:2719` -- **there is no test named for the number**, so do
not go looking for one.

**Byte 2 is validated as zero today**, which is what makes the layout-version argument
above correct rather than decorative: `crates/web/src/lib.rs:6610` refuses a nonzero
reserved byte with `ARENA_NONCANONICAL`, so a layout-2 writer's promise about it is real
and breaking it is a version bump.

## Files

| file | change |
|---|---|
| `web/index.html` | `route-arena`'s picker becomes two columns plus a matchup footer; `#a-control`, `#b-control`, `#a-off-hand`, `#b-off-hand`; the seed and **[Fight]** move to the footer; a `#change-matchup` button for the fight phase |
| `client/src/arena/picker.ts` | `ControlCode`, `SideChoice.control`, three refusals, one note, `readMatchup`/`pickerControls`/`arenaConfigOf` |
| `client/src/arena/arena.ts` | the `select`/`fight` phase, and the picker summary line |
| `client/src/runtime/arena-config.ts` | layout 3, the control byte, two refusal rows |
| `client/src/runtime/arena-recorder.ts` | the read-back check |
| `crates/web/src/lib.rs` | layout 3, the control byte, `ARENA_UNKNOWN_CONTROL`, `ARENA_CONTROL_UNAVAILABLE`, and `ARENA_REASONS` |
| `client/test/worker-protocol.test.mjs` | the literal refusal count at `:1311` |
| `tools/wasm_check.js` | its own copy of the layout version at `:2574` |
| `docs/reference/articulated-abi.md` | the refusal-by-name table gains two rows, **and** the layout version written down at `:614` and `:667` |
| `docs/architecture/browser-runtime.md` | the arena's configuration paragraph, **and the three `#L` anchors at `:447-449`** |

**The anchors are not optional and they are easy to forget.**
`docs/architecture/browser-runtime.md:447-449` point at `crates/web/src/lib.rs#L1702`,
`#L4395` and `#L5469`, and `tools/check_docs.js` holds each to a plus-or-minus-two-line
window around the symbol it names. This session inserts layout constants near 1240 and
refusal constants near 1520 -- both above 1702 -- so all three shift and all three are
re-anchored in the same change. `node tools/check_docs.js` is in the verification block
below and will say so.

## Tests

`client/test/studio-shell.test.mjs`:

- `the_arena_configures_a_on_the_left_and_b_on_the_right`
- `both_sides_driven_by_you_is_refused_by_naming_the_one_keyboard`
- `a_human_side_with_an_empty_right_hand_is_refused_by_naming_the_hand`
- `a_human_side_is_refused_by_name_until_the_input_path_exists`
- `the_picker_and_the_config_agree_on_every_control_code` -- the existing
  `the_picker_and_the_config_agree_on_every_policy_code` next door is the model
- `the_off_hand_policy_is_hidden_and_disabled_while_a_side_is_driven_by_a_policy`
- `the_seed_and_the_fight_button_belong_to_the_matchup_and_not_to_side_b`

`crates/web/src/lib.rs`, in its own suite:

- `an_unknown_control_byte_is_refused_by_name`
- `a_layout_two_configuration_is_refused_rather_than_read_as_layout_three`
- `the_arena_fingerprint_does_not_change_when_a_side_is_handed_to_a_human`

`tools/wasm_check.js`: the sweep that already asserts a registered policy code installs
and reads back gains the control byte, so both targets agree on the refusal.

**Show each failing.** The one that will be green while broken is
`the_picker_and_the_config_agree_on_every_control_code` if it iterates a list it also
defines; it must iterate the *encoder's* codes and check them against the *picker's*
options, which is the shape the policy version next door already uses.

## Acceptance

1. The screen splits, A on the left and B on the right, and both columns carry the same
   controls in the same order.
2. Every control byte the page can send either takes effect or comes back as a named
   refusal, and a test asserts the sentence.
3. `arena_fingerprint_*` is identical for the same loadout whether a side is human or not.
4. The AI-versus-AI path is unchanged: same defaults (`tactical` against `scripted`), same
   fight, same recording.

## Hash expectations

**Nothing in the golden registry moves.** `ARENA_CONFIG_LAYOUT_VERSION` moves 2 to 3 and
is not a golden hash; `arena_fingerprint_*` must **not** move and there is a test that
says so.

## Verification

```powershell
cargo test
cargo build --release
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node --test "client/test/*.test.mjs"
npm run check
npm run check:abi
node tools/check_docs.js
node tools/check_deps.js
npm run dev        # foreground, stopped before the session ends
```
