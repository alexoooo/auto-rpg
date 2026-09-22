# Skeleton 06 -- the skeleton's modules, registered and benched

**Depends on:** 02, 03, 04 and 05. **Moves:** no stone or human body. **Lands:** the fourth set
of body modules and a skeletal arm; the `skeleton` family in the family table; bench coverage;
and measured torques for the neck and waist.

## Modules

New file `src/golem/skeleton/body.ts`. It follows the shape of `src/golem/humanoid/body.ts`:
tables spread from the stone ones, and a wrapper that stamps the family's armour on every body
part.

| Slot | Id | Built by | Table |
| --- | --- | --- | --- |
| locomotion | `locomotion.skeleton` | `bipedDefinition` | `SKELETON_BIPED` |
| torso | `torso.ribcage` | `torsoModule` | `RIBCAGE`, with waist `SPINE` |
| head | `head.skull` | `headModule` | `SKULL`, with head tuning `{ guardPitch: 0.25, ram: null }` |
| arms | chain `skeletal` | `wristChainFrom` | `SKELETAL_REACH`, `SKELETAL_WRIST` |

The terminals are the stone shelf, with one exception: the fist is refitted as a bone fist.

### The tables (draft values)

Session 08 measures these and sets the final numbers. What matters here is that each value
has a reason.

```ts
/** Bone turns an edge and shatters under a club. See the overview's damage table. */
export const SKELETON_ARMOUR: ArmourByHit = Object.freeze({ cut: 0.5, thrust: 0.6, slap: 0, crush: 0 });

export const SKELETON_BIPED = {
  ...LOCOMOTION_BIPED, look: "bone" as ShellLook,
  pelvisWidth: 0.28, pelvisHeight: 0.12, pelvisDepth: 0.16, pelvisMass: 3.0, pelvisHealth: 90,
  hipSide: 0.09, hipInset: 0.02,
  thighRadius: 0.028, thighMass: 1.2, thighHealth: 35,
  shinLength: 0.39, shinRadius: 0.024, shinMass: 0.8, shinHealth: 30,
  footLength: 0.24, footWidth: 0.09, footHeight: 0.05, footMass: 0.5, footHealth: 25,
  footprintRadius: 0.28,
};

/** The waist: one vertebra standing for the lumbar spine. Health is the ribcage's own, because
 *  severing the torso module takes the ribcage with it and the ribcage is fatal. */
export const SPINE = {
  ...TORSO_WAIST, look: "bone" as ShellLook,
  ballLength: 0.22, ballRadius: 0.035, ballMass: 1.5, ballHealth: 110,
  // leanTorque, twistTorque: measured below; start from TORSO_WAIST's
};

export const RIBCAGE: TorsoTuning = {
  ...TORSO_PLAIN, look: "bone",
  coreWidth: 0.30, coreHeight: 0.38, coreDepth: 0.20, coreMass: 5, coreHealth: 110,
  coreFatal: true,
  coreArmour: 0,           // the wrapper below replaces it with SKELETON_ARMOUR
  socketSide: 0.19, socketHeight: 0.13, neckHeight: 0.21,
};

export const SKULL = {
  ...HEAD_NECK, look: "bone" as ShellLook, headFatal: false,
  neckLength: 0.10, neckRadius: 0.02, neckMass: 0.3, neckHealth: 20, neckVitalityWeight: 0.3,
  headWidth: 0.16, headHeight: 0.20, headDepth: 0.20, headMass: 1.5, headHealth: 40,
  headVitalityWeight: 0.6, headArmour: 0, browOffset: 0.09,
  // pitchTorque, yawTorque: measured below
};

/** Stone link lengths, thin and light. The lengths are kept so that every terminal's stated limits
 *  (derived against 0.42 + 0.36 m) stay true. See the overview. */
export const SKELETAL_REACH = {
  ...CHAIN_REACH, look: "bone" as ShellLook,
  collarRadius: 0.035, collarMass: 0.3, collarHealth: 20,
  upperRadius: 0.022, upperMass: 0.6, upperHealth: 25,
  foreRadius: 0.018, foreMass: 0.4, foreHealth: 20,
};

export const SKELETAL_WRIST = {
  ...CHAIN_WRIST, look: "bone" as ShellLook,
  ringRadius: 0.02, ringMass: 0.2, ringHealth: 12,
  wristRadius: 0.016, wristMass: 0.2, wristHealth: 12,
};

export const SKELETAL_FIST = {
  ...TERMINAL_FIST, look: "bone" as ShellLook, armour: SKELETON_ARMOUR,
  radius: 0.05, mass: 0.4, health: 20,
};
```

Every other field (joint limits, rates, damping, gait, the vitality weights not listed,
`footFriction`, the carrier) is the stone value. Why each changed value is what it is:

- **Masses are stated in kilograms.** `kg()` in `config.ts` scales stone volume and is not
  exported. A skeleton comes to about 20 kg of body before its weapons, against about 86 for the
  stone default (per-limb figures, 2026-09-22 Node harness).
- **Health is set so a clean blade needs about as many hits as it needs on stone.** Cut armour
  0.5 and a light part take about a quarter of the blade's stone damage, so a forearm at 20
  (0.48 after `healthScale`) takes 2 to 3 clean hits at 10 m/s, and so does a stone forearm at
  100. The mace needs about two thirds as many hits on a bone forearm as on a stone one (3 to 4,
  against about 6), as the overview says.
- **A light body is knocked down by almost any blow, and nothing in these tables changes that
  yet.** The fall decision is already mass-scaled. `stepSupportedLocomotionState` in
  `src/supported-locomotion-state.ts` adds each blow's horizontal shove divided by the supported
  mass to a ledger. That ledger drains at 0.020 m/s per second, and the body falls when it
  passes `FALL_SPECIFIC_IMPULSE_MPS` (0.014) times the table's `braceCapacityMultiplier` (1.5 for
  the stone biped, so 0.021 m/s). The shove itself, in `Combat`, is
  `speed * 0.11 * (1.35 - quality * 0.7)` N.s and does not depend on the target. Arithmetic,
  2026-09-22:

  | Body | Supported mass | Falls at | One clean cut at 10 m/s | A slap at 5 m/s |
  | --- | --- | --- | --- | --- |
  | stone default | about 89 kg | 1.87 N.s | 0.72 N.s | 0.74 N.s |
  | skeleton (tables above) | 8 + about 15.3 = 23.3 kg | 0.49 N.s (0.37 at full stride) | 0.72 | 0.74 |

  So a stone golem goes down to about three blows in quick succession, and the skeleton to one.
  The lever is the skeleton's own `braceCapacityMultiplier` and `gaitStabilityScaleMin` in
  `SKELETON_BIPED`, which the biped reads per table. Holding the stone golem's fall line would
  take about 5.7, where the multileg uses 2.6. This session keeps the stone value and measures it
  (item 5 below). Session 08 puts the choice to the owner, because "less sturdy" was asked for
  and "falls to every touch" may or may not be what was meant.
- **Vitality weights are stone's**, except the neck (0.3, stone 0.8) and the skull (0.6, stone
  2). Decapitation then costs about 0.07 to 0.14 of the bar, depending on which piece is cut,
  instead of the stone head's 0.44. That is what makes "not fatal" true at the vitality bar as
  well as at `fatal`. A severed module zeroes only the piece that was struck (`Golem.sever`).
- **The ribcage is fatal and the skull is not.** That is the owner's rule, carried by
  `coreFatal` and `headFatal` from session 04. The pelvis is left fatal on purpose.
- **The spine's health equals the ribcage's.** The waist is part of the torso module, so
  severing it severs the ribcage (`Golem.sever` marks every part of the module severed), and
  that is fatal. With the stone waist's share of health, the spine would be an easier kill than
  the ribcage. This is an owner decision, listed in session 08.

### Modules and the wrapper

```ts
function boneDefinition<T extends { parts: readonly GolemPart[] }, D extends { build(ctx: ModuleBuild): T }>(definition: D): D {
  return { ...definition, build(ctx: ModuleBuild) {
    const built = definition.build(ctx);
    return { ...built, parts: built.parts.map((part) => ({ ...part, combatRole: "body" as const, armour: SKELETON_ARMOUR })) };
  } } as D;
}

export const skeletonBiped = boneDefinition(bipedDefinition("locomotion.skeleton", "skeleton legs", SKELETON_BIPED));
export const ribcageTorso = boneDefinition(torsoModule("torso.ribcage", "ribcage", RIBCAGE, SPINE));
export const skullHead = boneDefinition(headModule("head.skull", "skull", { guardPitch: 0.25, ram: null }, SKULL));

const SKELETAL_TERMINALS: Readonly<Record<TerminalId, EffectorTerminalDefinition>> = Object.freeze({
  blade: bladeTerminal, plate: plateTerminal, mace: maceTerminal,
  whip: whipTerminal, maul: maulTerminal, fist: fistDefinition(SKELETAL_FIST),
});
export const skeletalEquipment = (terminal: EffectorTerminalDefinition): EffectorTerminalDefinition =>
  SKELETAL_TERMINALS[terminal.id];

export const skeletalChain = wristChainFrom("skeletal", "skeletal arm - reach plus roll and bend",
  SKELETAL_REACH, SKELETAL_WRIST, { fitTerminal: skeletalEquipment, armour: SKELETON_ARMOUR });
```

`combatRole: "body"` is what `humanDefinition` stamps too. Check its effect in `golem.ts`
(`guarding: part.combatRole === "body" ? false : ...`) before copying it. For locomotion, torso
and head parts the answer is the same either way, because their slot is not a hand.

`SKELETAL_TERMINALS` is a total record, not a `terminal.id === "fist" ? ... : terminal` ternary.
`AGENTS.md` records the ternary-with-a-default trap, and a record makes a new terminal a compile
error here. Note that the stone terminals' parts carry no armour: a sword in a skeleton's hand is
the same sword.

### New file `src/golem/skeleton/presets.ts`

```ts
export const skeletonSetup = (primary = "blade", secondary = "plate"): GolemSetup => {
  if (primary === "maul" || secondary === "maul") primary = secondary = "maul";
  return { family: "skeleton", locomotion: "locomotion.skeleton", torso: "torso.ribcage", head: "head.skull",
    primary: { chain: "skeletal", terminal: primary }, secondary: { chain: "skeletal", terminal: secondary } };
};
```

Named builds wait for session 07. `FAMILY_SETUP` needs the function now.

## Registration (append only)

- `src/golem/module.ts`: `ChainId` gains `"skeletal"`.
- `src/golem/family.ts`: `BODY_FAMILIES` becomes `["human", "golem", "skeleton"]`, and the
  buttons follow that order. Add `FAMILY_LABEL.skeleton = "Skeleton"`,
  `FAMILY_POLICY.skeleton = "golem-duelist"` and `CHAIN_FAMILY.skeletal = "skeleton"`. Add
  `BODY_MODULE_FAMILY` rows for the three body ids.
- `src/golem/family-setup.ts`: `skeleton: () => skeletonSetup()`.
- `src/golem/registry.ts`: `EFFECTOR_CHAINS.skeletal = skeletalChain`. Append to the **end** of
  `GOLEM_MODULES`, after the human entries:
  `...Object.values(EFFECTOR_TERMINALS).map((terminal) => benchOption(effectorModule(skeletalChain, terminal), "effector", handChannel))`,
  then `skeletonBiped` (with the same fixture lambda the human biped uses), `ribcageTorso` and
  `skullHead`. Appending keeps every existing index stable: `defaultGolemSetup` reads `[0]`, and
  the bench page lists in registry order.
- `src/golem/build.ts`: append to `GOLEM_LOCOMOTION`, `TORSOS` and `HEADS`.
- `src/setup.ts`: `randomize` gets `case "skeleton": return randomGolemSetup(rng, family);`. It
  will not compile without it, which is the point of the exhaustive switch.

**Check `effectorModule`'s id format** before trusting the ids above. The plan assumes
`effector.<chain>.<terminal>`, which is what every existing id looks like. The chain id has no
`.`, which `build.ts` requires.

## Bench harness

In `tests/harness/golem-bench.mjs` and `tests/golem-bench.test.mjs`:

- `sequenceFor`: an `effector.skeletal.` prefix gets `REACH_SEQUENCE`, as the wrist does.
- `anchored`: add `effector.skeletal.`.
- `LOCOMOTION_MODULES`: add `skeleton: skeletonBiped`.
- The plate-clearance test ("a plate keeps clear of its own stand and of a real torso in its own
  envelope") loops over a hand-written list, `["effector.pitch.plate", "effector.reach.plate",
  "effector.wrist.plate"]`. Its `boxesFor(socketWorld)` builds the stand box plus one box per
  torso from the `TorsoTuning` tables `TORSO_PLAIN` and `TORSO_PLATED`, because it needs
  `socketSide`, `socketHeight`, `socketFront` and the core dimensions. `golemTorsoOptions`
  returns only `{ id, label }`, so it cannot supply them. Give `boxesFor` a second parameter,
  the list of `[name, tuning]` pairs. Make the loop's rows `[id, torsos]`, pass the stone pair for
  the three stone plates, and add `["effector.skeletal.plate", [["ribcage", RIBCAGE]]]`. The
  anatomical plate is not in the list today; adding it is a separate question.
- The maul-grip test loops over `["effector.reach.maul", "effector.wrist.maul"]`. Add
  `"effector.skeletal.maul"`. Its assertions are the real guard on the second hand: grip taken
  in under 2 s, latched within `joinWithin`, settled in under 0.2 s, grip stray under 1 mm and
  under the anchor's own stray, and no self-contacts, contacts or stuck steps.
- The stroke-stray gate (a cut must not stray more than 50 mm from its anchor) is one
  `runStrokeBench({ moduleId: "effector.wrist.blade", shape: chosen })` call, not a loop. Add the
  same call and the same three assertions (miss, speed at the mark, anchor stray) for
  `"effector.skeletal.blade"`. If the miss or the speed fails on the skeletal arm, record the
  reading and report it. Do not lower a threshold that was measured on stone.

Grep `tests/` for other hand-written chain lists and decide for each whether the skeletal chain
belongs. `tests/golem-idle-stability.test.mjs` does, because a thin, light arm is exactly what
might buzz at rest. It cannot take the chain id the way it takes `'wrist'` and `'reach'`: it
builds `defaultGolemSetup()` and overwrites both chains, which for `'skeletal'` is a stone body on
a bone arm. `golemSetupRefusal` refuses that as mixed families, and `new Golem` throws through
`golemEffectorPlan`. Loop over named setups instead: `wrist` and `reach` keep today's
overwritten default, and `skeleton` is `skeletonSetup()`.

## Measure, then set: the neck, the waist and the legs

This follows `AGENTS.md`'s rule: "Size a force off the arm rather than off the scale", and never
raise a ceiling without a before/after table beside it.

1. **Neck.** Run `runTorsoBench({ torsoId: null, headId: "head.skull" })` at stone torques and at
   stone x (1.5 / 13.12), which is the ratio of head masses. The skull is 1.5 kg; the stone head
   is `kg(81)`, which is 13.12 kg. Compare the settle, overshoot and ripple columns against the
   stone head's own run. Keep the smallest torque whose readout is no worse than stone's. Write
   the table into the `SKULL` doc comment, naming the harness.
2. **Waist.** Do the same with `runTorsoBench({ torsoId: "torso.ribcage", headId: "head.skull" })`.
   Start from the ratio of the two bodies' real upper masses, and sweep around it. Take those
   masses from built bodies: stand each with `standAGolem` and sum
   `getMassProperties().mass` over the torso, head, primary and secondary limbs.
   `golemUpperMassKg` in `build.ts` is not the right source. It adds each chain's published
   `massKg`, which is the chain unloaded, before the ring and link are cast to the terminal. That
   is about 12 % under for stone, and for the skeleton's maul it gives about 27.5 kg against
   about 39 kg built.
3. **Legs.** Run `runGolemLocomotion({ moduleId: "skeleton" })` and the walk sequences at stone
   torques. If the joint lag, foot slip or `riseBudgetSeconds` columns are worse than the stone
   biped's, sweep `hipTorque`, `kneeTorque` and `ankleTorque` downward (lighter legs are more
   likely to buzz than to lack authority). Record the result either way.
4. **Arm.** Run `runGolemBench` for all six `effector.skeletal.*` modules and put each beside its
   `effector.wrist.*` twin. The stroke-stray and maul-grip gates added under "Bench harness"
   above must pass.

   The ring and link are each cast to `carryRatio` times the terminal's mass: 0.52 kg under a
   blade, 1.17 under a mace, 3.11 under a maul. Heavy links on a light forearm are not new. The
   stone maul already hangs 3.11 kg on each of them from a 1.43 kg forearm, about 2.2 to 1. The
   skeleton's maul hangs the same 3.11 kg on each from a 0.4 kg forearm, about 7.8 to 1, and it is
   the row most likely to fail. If the mace or maul rows fail the gates, raise `foreMass` and
   `upperMass`, not the radii: the owner wants thin colliders, not light ones.

   **If a skeletal pair fails its bench and one session cannot fix it, leave that pair out of
   `GOLEM_MODULES`**, drop its row from the gate lists above, and say so in the commit. Do not ship
   a pair that fails its gates. The shelf and the random draws follow the registry
   automatically.
5. **Knockdown.** Measure the fall line the stability table above predicts. The stone biped's
   knockdown doc comment in `config.ts` straddled its own threshold with a pair of impulses (10
   and 12 N.s, at the mass it had before 2026-09-18). Do the same for `locomotion.skeleton` at the
   stone `braceCapacityMultiplier`, around the predicted 0.49 N.s, and record whether it stays up
   or falls at each impulse. Then read the ledger in a short bout: the specific impulse each landed
   blow adds, from the supported-locomotion readout's `stability.specificImpulseMps`
   (`src/supported-locomotion-production.ts`). Root displacement alone does not show it. Do not change
   `braceCapacityMultiplier` here. Session 08 brings the table to the owner.

Record every table in a `.review/skeleton-bench-<date>.txt` and transcribe the rows you chose
into the doc comments.

## Tests

In `tests/golem-arena.test.mjs`, beside `a_decapitated_golem_is_dead_and_the_bouts_own_rule_agrees`.
That file already has what these tests need: `standAGolem(t, { setup })`, which stands one body
on a slab and returns `run(seconds)` and a live `intent`, and `moduleLimbs(golem, slot)`.

1. `a_skeleton_trunk_and_legs_weigh_under_a_third_of_stone` -- stand `skeletonSetup()` and
   `defaultGolemSetup()`. `Limb` has no slot field, so select by key prefix with
   `moduleLimbs(golem, "locomotion")`, `"torso"` and `"head"`. Sum
   `limb.part.body.getMassProperties().mass` over those. The arms are left out whole, because the
   weapon each arm holds is the same terminal in both bodies and would blur the comparison.
   Assert that the skeleton's total is under 0.35 of stone's. The draft tables put it at about
   16.3 kg against 75.0, or 0.22, so the bound is not tight. Also assert that the skeleton forearm's
   collider radius equals `SKELETAL_REACH.foreRadius` to within 1e-6 (Havok stores float32),
   which proves the table reached the collider.
2. `the_ribcage_is_fatal_and_the_skull_is_not` -- the skeleton's fatal limbs are exactly the pelvis
   and the ribcage core, found by `moduleLimbs(golem, "locomotion")` and `"torso"`. The stone
   default's are still exactly the pelvis and the head.
3. `every_skeleton_part_is_bone_armoured` -- for every body limb, `golem.applyDamage(limb, 10,
   "cut")` returns 5 and `golem.applyDamage(limb, 10, "crush")` returns 10. A blade limb returns
   10 for both. Reset `health` between calls, or use a fresh stand.
4. `bone_takes_a_club_better_than_a_blade` -- on a skeleton forearm, `"crush"` applies twice what
   `"cut"` applies. On a stone forearm the two are equal. This is the body-level test that catches
   `Golem.applyDamage` passing a constant kind, which is the mutation session 02 could not reach.
   Say so in the test's comment, and run that mutation to watch the test go red.
5. `a_decapitated_skeleton_is_not_beaten` -- stand a skeleton for 1 s, then sever its neck (the
   first head-module limb, which is not fatal) with `golem.sever(limb, new Vector3(0, 1, 0))`.
   Assert that `alive` is true, that `beaten(golem.limbs)` is false, and that
   `vitality(golem.limbs)` is above 0.8. Then run 1.5 s with `intent.forward = 1` and assert that
   the root moved more than 0.2 m: a headless skeleton still walks. The stone half is the
   existing test beside it, so each direction fails on its own name.
6. `severing_the_spine_ends_a_skeleton` -- sever the torso module's waist limb, and `alive` is
   false and `beaten` is true. This pins the consequence of module-level severing, so a later
   change to it has to change this test.

`skeletonSetup` is imported from `src/golem/skeleton/presets.ts`, and `beaten` and `vitality`
from `src/bout.ts`, as the existing test does.

Update:

- `tests/body-family.test.mjs` test 5: the refusal now ends
  `Choose Human warrior, Stone golem or Skeleton to select a complete body.` Test 1's
  `EXPECTED_CHAIN_FAMILY` gains `skeletal: "skeleton"`. Test 4 already uses `"not-a-family"` as
  its unknown family, so it needs no change.
- `tests/golem-torso-head.test.mjs`: the build, publish and dispose loop runs over two
  hand-written lists, `const TORSOS = ["torso.plain", "torso.plated"]` and
  `const HEADS = ["head.plain", "head.ram"]`. Add `torso.ribcage` and `head.skull`. (The human
  torso and head are missing too, and whether to add them is a separate question.) The loop then
  asserts `fatal.length === (slot === "head" ? 1 : 0)`, with the comment "a head ends the golem and
  a trunk does not". Both halves are false for a skeleton. Replace the assertion with a table
  keyed by id: `{ "torso.plain": 0, "torso.plated": 0, "torso.ribcage": 1, "head.plain": 1,
  "head.ram": 1, "head.skull": 0 }`. Replace the comment with one saying the fatal flag is each
  body plan's own, read from its table since session 04.
- The loops over `BODY_FAMILIES`, `EFFECTOR_IDS` and `GOLEM_EFFECTORS` should pick the skeleton up
  without a hand edit. If one of them does not, find out why before patching the test. Grep
  `tests/` for other hand-written module lists (`"torso.plain"`, `"head.ram"`, `"wrist"`), as
  above, and decide for each one.

## Comments that stop being true

A skeleton makes two comments in `Golem.sever` false. Rewrite them in this session, in the same
commit that makes them false:

- The doc paragraph "`beaten` ends a bout the moment a `fatal` part is severed, so the head and
  the pelvis remain exactly as lethal to lose as they read" becomes "... so whatever a body's
  tables declare fatal (the stone head, the skeleton's ribcage, every pelvis) remains exactly as
  lethal to lose as it reads".
- The inline comment "The two fatal slots. A head is fatal because the module says so and a pelvis
  because the locomotion module does" becomes a statement that each module's table says which of
  its parts are fatal.

Also check the doc comment of `a_decapitated_golem_is_dead_and_the_bouts_own_rule_agrees` in
`tests/golem-arena.test.mjs`. It is still true of stone; add "stone" where it generalises. The
comments about the ram in `head.ts`, `ram.ts` and `config.ts` ("the head is the fatal part") are
about the stone head and stay as they are.

## Verification

```powershell
node tests/harness/body-fingerprint.mjs --out .review/fp-before.json   # before editing
npm test
npm run check
npm run build
node tests/harness/body-fingerprint.mjs --out .review/fp-after.json --against .review/fp-before.json
```

Every stone and human section must be `same`. The new `bench:effector.skeletal.*`, `torso:`,
`head:` and `walk:skeleton` sections appear as `new`.

Then do the first visual review. Start `npm run dev` with `run_in_background`, open
`/bench.html`, and stand each skeleton module on the block with both looks in view. Adjust the
`bone-shells.ts` proportions until a person reads them as bones, and take a screenshot of each
module for the commit. Chrome does not paint WebGL in a hidden tab; if the tab is backgrounded,
step and render by hand as `AGENTS.md` describes. Stop the server and kill it by PID. Commit.
