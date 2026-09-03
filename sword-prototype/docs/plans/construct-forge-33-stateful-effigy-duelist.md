# Session 33 -- stateful Swordbearer duelist

**Status (2026-09-02): implemented; live physical gate remains open.**
`SwordbearerTactics` is now the built-in-only deterministic driver, with public advance, withdraw
and two orbit Actions using `supported-biped-combat-move`; saved programs remain on `ConstructMind`.
The carrier can turn while moving, stays within physical support/recovery authority, and the
director exposes phase/reason through the normal snapshot. Its unit tests include command grammar,
mirror parity, committed-latch handling, threat/off-hand behavior and loss fallback. Session 34
owns whether that correct surface survives every frozen physical cell.

## Outcome

Make the fixed Swordbearer visibly approach, turn, orbit, defend with its left arm, make a
committed physical sword attack, recover, withdraw and choose a new lane. It must use ordinary
public Actions and public sensor facts only; it does not get a physics handle, a transform, a
collision exception, a target object or a hidden damage action.

## Public surface

Extend the humanoid control graph in `src/construct/humanoid.ts#L284` while retaining existing
`move`, `turn`, `dodge-*`, `sweep`, `guard`, `stow-sword` and `recover` IDs for saved programs:

```ts
{ id: "advance", controller: "supported-biped-combat-move", group: "locomotion",
  claims: ["resource:balance"], parameters: combatMoveParameters }
{ id: "withdraw", controller: "supported-biped-combat-move", group: "locomotion",
  claims: ["resource:balance"], parameters: combatMoveParameters }
{ id: "orbit-left", controller: "supported-biped-combat-move", group: "locomotion",
  claims: ["resource:balance"], parameters: combatMoveParameters }
{ id: "orbit-right", controller: "supported-biped-combat-move", group: "locomotion",
  claims: ["resource:balance"], parameters: combatMoveParameters }
```

`combatMoveParameters` is exactly `{ forward, right, yaw, speed }`, with forward/right/yaw in
`[-1, 1]` and speed in `[0, 1.6] m/s`. Update `src/construct/biped.ts#L31` so the new supported
mode drives yaw during a move and retains the real two-foot brace/leg motor pattern; it stages the
same carrier request and balance claim as existing movement. Extend
`src/construct/learning/mirror.ts#L18` so `right` and `yaw` mirror for this controller.

Add public opponent-sensor facts in `HUMANOID_SENSORS` and publish them at
`src/construct/construct.ts#L629`:

```ts
"opponent-weapon-local-vx" | "opponent-weapon-local-vy" | "opponent-weapon-local-vz"
"opponent-weapon-speed-mps"
```

They are the live described mounted/held weapon tip velocity in the Effigy's local frame, zero
when no weapon is present. They must follow the existing BodyView/EffectorView reading boundary
and be mirrored with local X; no render read may produce a sensor fact.

## Tactical director

1. Add a `swordbearer-tactics` module in `src/construct/`, a deterministic driver implementing the same
   command/diagnostic seam as `ConstructMind`. It owns this closed phase enum:

   ```ts
   export type SwordbearerTacticalPhase =
     | "approach" | "orbit-left" | "orbit-right" | "guard" | "chamber"
     | "commit" | "withdraw" | "counter" | "recover";
   ```

   `ConstructControl.buildPolicy()` at `src/construct/control.ts#L176` registers this driver only
   for the built-in `humanoid-authored` Swordbearer policy. `construct-hold` and Forge-saved
   `ConstructProgram`s keep their current `ConstructMind` path. The director emits the same
   `ConstructCommand` grammar and the snapshot exposes its phase as a normal decision diagnostic.

2. Freeze the movement profile in `SWORDBEARER_TACTICS_V1`: approach at `1.20 m/s`; orbit with
   `{ forward: 0.35, right: +/-0.80, yaw: +/-0.70, speed: 1.05 }`; withdrawal with
   `{ forward: -0.80, right: +/-0.35, yaw: +/-0.45, speed: 0.95 }`; dodge at the existing
   `1.05 m/s`. Use the current 1.15 m retreat, 1.85 m working stop and 2.10 m sweep ceiling.

3. Choose phase transitions only from published facts and action terminals. Approach above 1.85 m;
   orbit in the working band; guard/counter when the visible enemy weapon is approaching the core
   lane at at least `5 m/s`; chamber/commit only after a clear, upright working-lane opening;
   withdraw after every sweep terminal; recover/stow after support loss. Alternate orbit direction
   after every completed sweep and flip it after a blocked lane or threat dodge. A committed sweep
   keeps its present controller/latch semantics; the director cannot retarget it mid-stroke.

4. The director must hold `offhand-guard` concurrently with sword/locomotion only when the real
   left arm is intact and the threat condition holds. The left arm remains posture-only; it cannot
   become a shield module, scorer or cross-body teleport. Sword loss leaves supported movement and
   defense available; arm loss removes only the guard; a fall gives recovery exclusive locomotion
   authority.

5. Add a `construct-swordbearer-tactics` test module in `tests/`, covering phase transitions, action grammar,
   deterministic orbit alternation, mirror parity, true simultaneous movement/yaw, threat guard,
   loss fallbacks and saved-program compatibility. Mutate the controller to zero yaw during orbit,
   pin an orbit side, reopen a committed sweep every frame, and feed a hidden weapon velocity;
   each corresponding test must turn red.

## Verification

```powershell
node --test tests/construct-swordbearer-duelist.test.mjs
node --test tests/construct-perception.test.mjs tests/construct-locomotion-fallbacks.test.mjs
npm test
npm run check
npm run build
git diff --check -- .
```
