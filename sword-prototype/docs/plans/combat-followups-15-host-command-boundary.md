# Session 15 -- separate host camera state from combat commands

## Outcome

Remove `zoom` from every human and policy combat command while preserving wheel smoothing,
camera framing and takeover behaviour byte-for-byte where those behaviours are observable.
After this session a `Mind` can express only things a fighter consumes. Camera state belongs
to `Controls`, never to `Intent`, an option, a checkpoint probe or a policy evaluator.

This is an interface correction, not a balance change. It must not move feature v3, option
names, policy decisions, bout results or any existing learning artifact contract.

## Implement

1. In `src/mind.ts#L9-L63`, stop aliasing `Intent` to DOM-side `InputState`. Define the
   combat-owned shape in this DOM-free module:

   ~~~typescript
   export interface Intent {
     forward: number;
     strafe: number;
     turn: number;
     driving: HandName;
     posture: PostureIntent;
     primary: HandIntent;
     secondary: HandIntent;
   }
   ~~~

   Move `PostureIntent` beside it. Keep the type-only `HumanOwnership` dependency or replace
   it with a local structural type; do not introduce a runtime import of `input.ts` into the
   headless graph.
   Delete `InputState`; do not leave it as an alias for source compatibility.
2. In `src/input.ts#L51-L73`, type `Controls.state` directly as `Intent` and remove `zoom`. Add
   `zoom: number` to the host-owned `CameraGestureState` in `src/camera.ts#L21-L29`, initialize
   it to `1`, and make `Controls.sample` slew `this.camera.zoom` from `zoomNotches`.
3. In `src/main.ts#L862`, read `controls.camera.zoom`. Preserve the current exponential
   target, limits and follow-camera formula exactly.
4. Remove `zoom` from `NEUTRAL`, `freshIntent`, `boundIntent`, `blankIntent` consumers,
   Centipede commands, `splitMind`, `handover`, `composeTactic`, `FactorizedHandAction`,
   movement partials and all scripted policies. A movement partial owns exactly
   `forward/strafe/turn`; the contamination check rejects any hand or posture write without
   needing a camera sentinel.
5. Remove zoom from `scripts/promotion-evaluator.mjs#L22` and every JS fixture. Do not replace
   it with a constant column, because that would retain the false action dimension under a
   different spelling.
6. Update the controller boundary and takeover sections of `docs/design.md`; update the
   controls section of `README.md`. State explicitly that the human and AI share the combat
   command, while camera gestures remain host-only.
7. Update the first house rule in `AGENTS.md`. It currently reads *"`Mind.decide` returns an
   `Intent`, which is a type alias for the human's own `InputState`"*, and this session deletes
   `InputState`. The rule itself is unchanged and still load-bearing -- a policy plays with the
   controller a person plays with -- but its wording becomes false the moment this lands, and a
   house rule that describes a type that no longer exists stops being paid attention to. The
   seam survives; the alias does not.

## Tests and adversarial proof

Add or update these exact tests:

- `tests/minds.test.mjs`: `a_combat_intent_contains_no_camera_state` and
  `split_mind_composes_only_fighter_commands`.
- `tests/handover.test.mjs`: `handover_rebases_both_hands_without_a_camera_field`.
- `tests/arena.test.mjs`: `wheel_zoom_reaches_both_limits_without_mutating_the_human_intent`
  and retain the existing camera geometry assertions.
- `tests/options.test.mjs`: `movement_partials_own_only_the_three_locomotion_axes`.
- `tests/integration.test.mjs`: `every_policy_returns_a_finite_zoom_free_combat_command`.
- `tests/ai-evaluation.test.mjs`: `promotion_finiteness_checks_cover_every_combat_number`.

Watch `a_combat_intent_contains_no_camera_state` fail against the current alias before the
edit. Then temporarily make `main.ts` read a constant `1` and watch the max-zoom camera test
fail. A passing type check alone is not proof: the plain-JS fixtures are precisely where a
stale field can survive.

## Accept

- Wheel zoom looks and measures the same at both limits and through smoothing.
- `rg -n "intent\\.zoom|asked\\.zoom|movement\\.zoom|state\\.zoom" src tests scripts` has no
  result. `camera.zoom` is the sole live zoom value.
- `InputState` no longer exists; all callers use `Intent` for fighter commands and explicit
  camera state for camera commands.
- Headless imports still do not load DOM modules.
- Feature version remains 3 only because session 16 owns its replacement. Do not add an
  adapter or compatibility test for zoom-bearing commands; no serialized command contract is
  supported.
- `npm test`, `npm run check` and `npm run build` pass.
