# art-08 — the figures get their skin

**Status (2026-08-08): Fighter calibration integrated and visually reviewed.** The 32 body
frames, eight main-arm facings, eight shield facings, and knife, shortsword and sword are in the
manifest and pass `measure_assets.js`. The review changed the renderer in three bounded ways:
actor layers rotate from their manifest shoulder pivot without inventing a hand marker; weapon
images continue to span the simulation's exact hilt and tip; and the old cyan upright rim was
removed because it obscured the delivered model. User review also rejected drawing the hero
after every wall -- that made the figure float and erased the wall face -- so foreground walls
now retain their cap and face while yielding locally near the hero. The hidden-browser frame-rate
number is not evidence; the repeated visible baseline in acceptance item 12 remains a user-side
measurement before the overall production gate can be called held.

**Goal:** Codex's second calibration batch — one archetype's composite body, its arm and shield
layers, and the first two or three weapons — is measured, entered in the manifest, reviewed
in-game against the fallback it replaces, and either passed or sent back. Whatever the real art
proves the rig or the spec got wrong is fixed **here**, and the character gate in `FEEDBACK.md`
flips.

**Leaves the game:** one archetype wearing real art, every other archetype on the procedural rig,
and both readable standing side by side. `?noart=1` still reverts the lot.

**Depends on:** `art-06` (loader, manifest, `measure_assets.js`, the fixtures), `art-07` (the
stone the figures are judged against, and **the environment gate passed** — batch 2 does not begin
until it is), and `art-04`, whose frame dump is half the review instrument in §4.

**Unblocks:** Codex mass production. Every batch after this one is a production batch integrated
by a recurring pass rather than a session.

---

## 1. Why this is a session and not a chore appended to `art-05`

`art-05` lands the rig with zero image files, and `art-06` proves the sprite path against fixtures
that are *deliberately fake* — a magenta checker and thirty-two green rectangles with notches in
them. Neither of those is a drawing anybody made an art judgement about. **This session is the
first time real character art meets the rig**, and it is the only place three specific things can
be found out:

- a composite body whose crown does not land on `uprightTop(kind)`, so the health bar floats or
  clips — invisible in the PNG, obvious in the game;
- an arm whose neutral pose fights the renderer's rotation at some facings and not others,
  because "relaxed along the facing" meant something slightly different to the artist at `n` than
  at `se`;
- drift between facings — eight drawings of the same Fighter that are not quite the same Fighter,
  which reads as the figure breathing sideways as it turns and which no single image fails on.

Every one of those is a **rig or spec** change, not an art change. `art-05` cannot budget for them
because it has nothing to look at; `art-07` is the environment's session and would be reviewing a
body against a room it is simultaneously building. So they get budgeted here, once, with a session
gate on them — which is the whole difference between planned work and a retrofit.

**Three verdicts, in this order of preference**, and picking the wrong one is the failure mode of
the session:

| verdict | when | what happens |
|---|---|---|
| **`FEEDBACK.md` item** | the spec was clear and the image does not follow it | one entry, one defect, a screenshot reference; nothing in the repository changes |
| **spec fix** | the image follows the spec and the spec was ambiguous | fix `ASSET_SPEC.md`, note the change in `FEEDBACK.md`, and **every previously passed asset the change touches goes back to suspect** |
| **rig change** | the art is right and the renderer is wrong | §4's bounded list, and nothing outside it without stopping to report |

Default to the first. Reach for the third last. A rig bent to fit one batch is a rig the next
batch has to be bent to fit again.

## 2. Measure before you look

Run `tools/measure_assets.js` over the whole batch **before opening the game**. It is the
mechanical half of the review and it is cheaper than every other half put together:

- PNG format — colour type 6, depth 8, non-interlaced, asserted;
- the cell matches the archetype's declared cell exactly (Fighter `128 × 160`);
- the alpha bounding box sits on the cell's bottom edge, horizontally centred, within a pixel or
  two;
- **every frame of one facing shares a bounding-box centre** — this is the check that catches the
  sideways bob, and it is the one defect that is invisible in the file and unmissable in motion;
- no four-pixel grey halo against transparency.

**Nothing that fails the tool is worth a review pass.** It goes straight back as a `FEEDBACK.md`
item, and the rest of the batch is reviewed without it — a half-integrated actor is a legal state
(`art-06` acceptance test 7) and holding the whole batch hostage to one bad facing wastes the
round trip.

Then paste the tool's proposed fragments into `manifest.json`. Only this session's agent edits
that file, and no entry points at a file that does not exist.

## 3. Weapons are reviewed here, in a hand

A weapon sprite is two marker pixels and a drawing between them: `hilt` lands on the projected
hilt, `tip` on the projected tip, and the renderer stretches whatever is in between. **`art-05`
§4 gives the hilt and tip from the sim's own blade segment**, so a weapon has no reviewable
properties at all until a body is holding it and swinging it along `limbAngle`. That is why the
weapons moved out of the environment batch and into this one — see `art-00`'s calibration row.

What to check, and it is short because the geometry is not negotiable:

- the drawn blade still lies on the projected true blade line. Freeze a strike, hit `G` for
  `[tactical]`, and the top-down blade is at the same bearing and the same extension. **A sprite
  that needs the hilt marker moved to look right is a sprite whose hilt marker is wrong**, and
  moving the projection to suit it would put the bright thing somewhere other than the hitbox;
- heft reads against mass. A heavy axe and a light blade are the same length as the sim says and
  different weights as the drawing says. That is the whole of "weapon by parameter";
- the ground shadow still sits under the tip (`art-05` §4), because that is where the hit is;
- length is **never** a property of the image. An image whose content does not fill the span
  between its own markers stretches to fill it, and that is the artist's problem to fix, not the
  manifest's.

## 4. The review, and the two instruments

`?noart=1` is the A/B and `G` is the truth overlay. Everything below is checked with the sprite
on, then with it off, then in `[tactical]` if the answer is about geometry rather than taste.

- **The half-and-half state.** Delete `fighter/arm_e.png` and the composite body draws with a
  fallback arm on it. This is what every integration pass looks like halfway through; if it reads
  badly that is a `FEEDBACK.md` item, never a code path to forbid (`art-05` §3).
- **`body` and the four fallback segments are alternatives, not additions.** One `if` at the top
  of the walk, and getting it wrong draws a figure inside a figure. Check it against `art-04`'s
  frame dump, not by eye: a Fighter with a full sprite set emits **four** layer items plus the
  ground pre-pass, and eleven means both arms of the `if` ran. A figure inside a figure is nearly
  invisible when the outer one is opaque, which is exactly why this is a count and not a look.
- **The walk is indexed by `stride`, not timed.** Walk into a wall — the frame freezes. Get shoved
  — the frame does not cycle. Walk at half speed — the cycle halves. If any of that fails, the
  frame index is being driven by a clock somewhere and hard constraint 3 is broken.
- **The cycle reads as `walk1, walk2, walk3, walk2`** and not as a pop at the wrap.
- **The crown.** Health bar, callout pill, damage floater and pick box all still sit on the head,
  for the sprite Fighter and a fallback Brute standing side by side, at both extremes of the zoom.
  `bodyTopWorld`, `anchorY` and `unitAt` read `BODY_H` and none of them knows the body is a
  sprite — a body whose drawn crown disagrees with `uprightTop(kind)` is an art defect with a
  measurable size, so state the size in the `FEEDBACK.md` item rather than the adjective.
- **The collision ring.** House rule 4: the ring is unconditional and it must not lie. A figure
  drawn narrower than its own ring is the specific failure `ASSET_SPEC.md` warns about with the
  Brute, and it shows up as a body apparently standing inside a hoop.
- **Facing drift.** Turn slowly through a full circle and watch the silhouette, not the detail.
  The figure should turn; it should not change size, change build, or breathe sideways.
- **Silhouette at forty pixels.** Shrink the window until the Fighter is forty pixels tall. It
  must still be a Fighter, and the ground ring and facing wedge must still carry team and bearing.
  The cyan model rim from `art-05` was rejected during calibration because it covered the actual
  armour and read as selection geometry; do not restore it as a substitute for a clear silhouette.
- **Against the stone.** `art-07`'s floor is now under it. A figure that disappears into the
  texture is either too dark or standing on a texture that is too loud, and telling those apart is
  what the `?noart=1` toggle is for: flip the floor to the procedural bake and see which one
  moved.

## 5. What a rig change may legitimately be

The bounded list, because "the rig can change here" without a boundary is how a session becomes
open-ended:

1. **Per-archetype anchor trim** — a constant offset in the manifest entry, not in JS. This is the
   manifest's job and it is the first answer to almost every placement complaint.
2. **The arm's neutral-pose reference angle**, if the batch shows the spec's "relaxed along the
   facing" resolves differently per facing. Fix the *spec* first; the rig only changes if the
   drawn convention is defensible and the renderer's assumption is not.
3. **The idle-blend threshold** from `art-05`'s `strideRate`, if real stride art makes the
   fallback's chosen cut-in look wrong. It is one constant.
4. **The sheet escalation** — one image per archetype with a `cell` grid, which `art-06`'s schema
   already carries the field for. This is the answer **only** if cross-image drift turns out to be
   the failure mode in review, and `art-06` says explicitly not to start there: individual figures
   are what generation does well and a grid is what it does badly.

Anything else — a new manifest `kind`, a per-facing table in JS, a second rig granularity, a
cached pose canvas — is out of scope, and the instruction is `art-00`'s: **stop and report the
conflict rather than inventing a fifth option.**

## 6. Flipping the gate

`FEEDBACK.md`'s header goes to passed only when the batch survives the whole of §4, not when it
survives the screenshots. **Mass production reuses whatever passed calibration**, so a defect that
slips through here multiplies across the remaining roster, every weapon and every shield — which
is `art-00`'s argument for having a gate at all.

When it flips, write into `FEEDBACK.md` the two things the next batch actually needs: which
generation settings passed, and the per-archetype numbers from `ASSET_SPEC.md` restated for the
roster that has not been drawn yet. The gate is a handoff, not a verdict.

---

## Acceptance test

1. `tools/measure_assets.js` runs clean over the whole batch, or every failure is a written
   `FEEDBACK.md` item.
2. The sprite Fighter and a fallback Brute stand side by side and both read as bodies of the right
   size, on the same floor, under the same light.
3. `?noart=1` reverts the Fighter to the procedural rig with **no other change on screen**.
4. A body with a sprite body and a deleted arm file draws with a fallback arm and does not throw.
5. The frame dump shows four layer items plus the pre-pass for a fully-sprited Fighter, and seven
   plus the pre-pass for a fallback one.
6. The walk freezes when the body is walled, does not cycle under a shove, and halves when the
   speed halves.
7. A frozen strike puts the drawn blade on the same bearing and extension as `[tactical]`'s
   top-down line, and the ground shadow under the tip.
8. Health bars, callouts, floaters and the pick box sit on the head at both extremes of the zoom.
9. Turn through a full circle: no pop at a facing boundary, no change of build.
10. `[tactical]` and `[dev]` are byte-identical.
11. The console is clean at boot, `assertProjection` included.
12. No frame-rate movement against a repeated baseline — the image rig is *fewer* draw calls than
    the fallback it replaces, so a regression here means both arms of the `if` are running.

## Tripwires

All five. No Rust changed.

## Explicitly not in this session

- The rest of the roster. Rogue, Brute and Skitterer stay on the procedural rig until they pass
  through a production batch, and that is a recurring integration pass rather than a session.
- Remaining environment variants, decals, props and lantern frames. Same: production batches,
  integrated against `art-07`'s code, which does not change to receive them.
- Blood, recoil and death reactions. `art-09` — the recoil the rig tilts on already exists from
  `art-05`; what it does to a sprite body is not different from what it does to a fallback one.
- Any new rendering capability. If the batch needs one, that is §5's stop-and-report.
