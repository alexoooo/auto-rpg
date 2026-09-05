# Session 08 -- assembly and the arena

**Status (2026-09-04): implemented, human gate not yet asked.** A golem assembles from five module
slots, walks, is driven through `Intent` on a `golem-v1` control surface, can be taken over by a
person with the cursor rebased onto the pose it is in, sheds a module when its socket joint goes,
and reaches a verdict against a Warrior duelist from either corner; measured in the Node arena
harness only, and every threshold in `tests/golem-arena.test.mjs` is provisional.

## Outcome

A golem unit in the setup screen. The owner picks one option per slot, fights a Warrior duelist
with the mouse on the primary effector, swaps sockets with `F`, walks and crouches with the
keys, takes over either body with `C`, pauses, restarts, and reaches a verdict with severed
modules lying on the floor. Nothing about the Warrior's side of the bout changes.

## Frozen choices

- `Golem` implements `Combatant` from `src/units.ts` with `articulated` null and `hands` 2: the
  two effector sockets are exactly `primary` and `secondary`, so `HandName` fits without
  widening, `splitMind` has a hand to act with, and the hand-keyed behaviour record keeps
  working. Head strikers file with `hand` null through the body-neutral channel.
- Control goes through a `GolemControlEndpoint` with surface tag `"golem-v1"`, a clone of
  `HumanoidControlEndpoint` in `src/humanoid-control.ts`: same install, policy, human and
  release paths, same `splitMind` and `handover` composition. `Intent` is not widened.
- Human takeover currently gates on the concrete `Fighter` through `isArticulatedCombatant`.
  Replace that gate with a small capability interface (a body that can report effector poses for
  cursor seeding and accept a human driver) that both `Fighter` and `Golem` implement. The
  handover seeding rule stays: the cursor's meaning is rebased to the pose the hand is in, so a
  taken body never snaps its effector at full force.
- A golem's parts carry their own vitality weights on their `PartState`, because the bout's
  weight table throws on an unknown key by design. Vitality is derived from local health as it
  is for every other body; the head is fatal; the torso core is fatal at zero.
- Severing a module is breaking its socket joint: the socket joint has health, and when it goes
  the module's subtree detaches as loose physics with its shell, exactly as the Warrior's arm
  drops. A golem does not bleed. The blood system reads the combat log and decides for itself;
  give it a dust variant or let it stay silent for stone, but do not call it from the sever path.
- Collision: one side's golem parts share that side's bits and ignore each other, with no
  self-collision pair; each terminal's layer is against the enemy, so blades and whips pass
  through their owner and a plate stops an enemy blade. The `COLLIDES` rows written in Session
  04 are the whole rule.

## Implement

1. **Assembly.** `src/golem/golem.ts`: `GolemBuild` is one option id per slot (a two-socket
   effector fills both); `Golem` builds locomotion, torso on the locomotion root, head and
   effectors on the torso's sockets, assigns layers through `writeCollisionFilter` on leaves,
   collects parts into limbs and `PartState`s, collects strikers, and implements every
   `Combatant` member: `limbFor`, `damageTargetFor`, `applyDamage`, `parriedBy`, `sever`,
   `nearestPartTo`, `centre`, `aimPoint`, `feetPosition`, `owns`, `describe` (including
   `effectors` from each effector module's `view()`), `observe`, `publishProjectiles`,
   `occlusionPoints`, `stopFighting`, `dispose`, plus `locomotion` from the locomotion module.
2. **Control.** `src/golem/golem-control.ts` and the per-boundary dispatch: split the incoming
   `Intent` into the five module commands and call `command` on each; every physics substep call
   `step` on each. The pair step in `src/control-host.ts` (observe both, step both, resolve
   locomotion as a pair) is unchanged.
3. **Registry.** A `golem` row in `UNIT_REGISTRY`: `controlSurface` `"golem-v1"`,
   `supportedLocomotionPort`, `humanAdapter` true through the new capability interface,
   `compatiblePolicies` `idle` for now (Session 09 adds a mind), `anatomy` derived from the
   assembled build, reach and heights from the modules. The registry's loadout concept is
   replaced for golems by a module build: extend `SideSetup` with an optional `golem` field and
   give `src/setup.ts` a five-slot picker for golem corners generated from
   `src/golem/registry.ts`, with a default build (biped, plain torso, a blade on the ladder's top
   chain, a plate on the same chain, plain head). Effector slots pick a chain and a terminal
   separately, and the picker hides pairs the registry does not have.
4. **Arena wiring.** `buildBout` in `src/main.ts` constructs a `Golem` for a golem corner; the
   HUD's vitality bar and critical-injury diagnostic read the golem's parts; `G` shows either
   the bench overlay generalised to any `Combatant` or the rig view widened, and this session
   picks one and deletes the other.
5. **Headless.** `tests/golem-arena.test.mjs` using `scripts/measure.mjs` as a library: a golem
   with the default build against a Warrior duelist for a full bout on both sides, reaching a
   verdict without a thrown error; a golem that loses its primary effector keeps fighting with the
   secondary; a decapitated golem is dead; twenty-five rebuilds leak nothing the arena audit can
   see. The Warrior-versus-Warrior integration suite is unchanged and green.

## Human gate

The owner fights the Warrior duelist as the golem for five minutes, then takes the Warrior over
and fights the idle golem. The questions: does it feel like Die by the Sword; does the golem read
as one body; does a severed module falling off read as a wound. The verdict goes into this file's
status line.

## Verification

```powershell
npm run check
node --test tests/golem-arena.test.mjs tests/integration.test.mjs
npm test
npm run build
npm run measure
git diff --check -- .
```

`npm run dev`, play the bout described in the human gate, pause, restart, take over, verdict.
Stop the server and confirm the port is free.
