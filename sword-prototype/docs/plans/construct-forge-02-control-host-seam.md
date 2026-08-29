# Session 02 -- remove the humanoid assumption from the arena control seam

## Outcome

The arena can host different command surfaces without turning `Intent` into an untyped bag.
Warrior, Broot, Centipede and KayKit continue to use their exact current `Mind`/`Intent` path;
future constructs install a separately versioned action driver through the same opaque host seam.

## Current fault line

`Combatant` in `src/units.ts#L48` requires `mind: Mind`, `view: FighterView` and a humanoid intent
observer. `mindFor` in `src/main.ts#L339` constructs one `Mind` for every unit. That worked only
while every non-humanoid either impersonated the hand contract or had one exceptional natural
channel. An arbitrary joint/action graph cannot honestly enter there.

## Implement

Create `src/control-host.ts`:

~~~ts
export interface InstalledDriver {
  readonly surface: string;
  readonly name: string;
  step(dt: number): void;
  stop(reason: "verdict" | "handover" | "dispose"): void;
}

export interface ControlRecordingPort {
  attach(recorder: BoutRecorder, side: Side): void;
  sample(dt: number, clock: number): void;
  detach(): void;
}

export interface ControlEndpoint {
  readonly surface: string;
  readonly driver: InstalledDriver; // getter for the currently installed driver
  readonly recording: ControlRecordingPort | null;
  installPolicy(name: string, seed?: number): void;
  installHuman(): void;
  releaseHuman(): void;
  stopFighting(): void;
  dispose(): void;
}
~~~

`stepPair` keeps its fairness order: observe both bodies first, then call left and right
`control.driver.step(dt)`. A humanoid driver performs exactly today's `Mind.decide` -> intent tap ->
body application; no second `Combatant.update` call survives. A construct driver later performs
command production -> scheduler -> motor writes behind the same one call. Projectile aging after a
verdict remains on `Combatant.stepProjectiles`, outside a stopped driver.

Each endpoint constructs its own typed human or policy adapter, then exposes only the bound
`InstalledDriver` lifecycle to the host. A humanoid endpoint is built with the shared human `Mind`
and ownership source as typed constructor dependencies, plus achieved-pose callbacks used by the
existing `handover`; therefore parameterless `installHuman()` has something real to install and
can seed both hands/posture exactly as today. Headless definitions pass no human source and publish
that absence. No body-facing view or command is cast through `unknown`.

The endpoint checks the surface tag before installation and refuses
`control source for surface X cannot drive surface Y`. The typed implementations remain
`src/humanoid-control.ts` over `Mind`, `FighterView` and `Intent`, and later
`src/construct/control.ts` over construct types.

Driver replacement is transactional: construct and surface-check the candidate before touching the
current driver; on success stop the old driver once with `handover`, install the candidate and seed
its body-facing state, while failure leaves the old driver running. `stopFighting` stops command
production once with `verdict` but preserves projectile aging; `dispose` detaches recording, stops
any still-live driver once with `dispose` and releases endpoint-owned observers. A recording port
refuses a second simultaneous attachment by name, and `detach`/endpoint disposal release all taps
without disposing the caller-owned `BoutRecorder`.

Move policy construction behind `UnitDefinition` in `src/units.ts#L96`: a definition creates the
body and its endpoint together, publishes its own `{ name, label }` driver options and declares
whether a human adapter exists. Humanoid definitions project their current options from `POLICIES`;
a later construct definition may publish `construct-hold` without pretending it is a `Mind`.
`CombatantBuild` stops taking a prebuilt `mind`; it receives the selected driver name/seed and the
definition's typed optional human dependency. The humanoid definition alone supplies `Mind` and
pose callbacks to `HumanoidControlEndpoint`; the registry never widens them to an arbitrary bag.
Replace the public Fighter assumptions on `Combatant` with `readonly control: ControlEndpoint`.
Keep compatibility getters on `Fighter` only for direct tests and the `__sword` debugger; host code
uses explicit capability ports for rig overlay, pose-seeded takeover and camera orientation, never
`instanceof Fighter` hidden in `isArticulatedCombatant`.

Update handover and setup in `src/main.ts#L339`, `policyForUnit` at `src/units.ts#L340` and
the policy options and Control radio rendering in `src/setup.ts#L185`. Rebuild a side's policy
options from its selected definition and preserve its selection only when that exact driver remains
available. An incompatible saved selection remains visibly invalid and disables Fight with the
exact reason until the player chooses another driver; changing unit never silently installs the
default or Idle. A surface with no human adapter disables `you` with a reason.

Keep `BoutRecorder` at `src/recorder.ts#L27` on humanoid commands without keeping humanoid fields on
`Combatant`: the humanoid endpoint's `ControlRecordingPort` owns the typed `FighterView`/`Intent`
tap and per-side sample. Main calls `endpoint.recording?.attach/sample`; Centipede supplies the same
humanoid port, and a construct endpoint returns null until session 04 adds its recorder. Mixed
matchups therefore never fabricate a `FighterView` or require a host class switch.

## Tests watched failing

Extend `tests/units.test.mjs` and `tests/handover.test.mjs`:

- `each_unit_builds_the_control_surface_its_definition_declares`
- `a_driver_for_one_surface_is_refused_by_the_other_surface_name`
- `humanoid_policy_handover_keeps_the_exact_command_on_both_sides_of_the_seam`
- `a_body_without_a_human_adapter_disables_you_instead_of_installing_a_policy`
- `the_host_never_switches_on_a_concrete_Fighter_or_Construct_class`
- `both_bodies_observe_before_either_installed_driver_steps`
- `a_surface_without_a_recording_port_is_not_sampled_as_a_humanoid`
- `a_failed_driver_replacement_keeps_the_old_driver_and_disposal_stops_each_owner_once`
- `recording_attach_detach_and_endpoint_dispose_leave_no_command_observer`

Watch the parity test fail by swapping primary and secondary in the humanoid adapter. Watch the
surface test fail by removing the runtime tag check while handing it a construct fixture. Replace
the capability dispatch with the old hidden `instanceof Fighter` helper and require the host test
to fail behaviorally; a source grep that merely moves the switch into another file is false green.

## Regression and accept

Bracket this shared-host change:

~~~powershell
npm run measure -- --only duelist-swinger --bouts 120
npm test
npm run check
npm run build
~~~

The seed-20260823 null control must reproduce the complete current report row in
`docs/measurements.md`--duelist 66/120 plus every reported damage, sever, contact and duration
column--rather than merely falling inside an unspecified sampling range. The exact script/command
parity test remains byte-identical. Existing feature, tactic, artifact and research digests do not
move.
