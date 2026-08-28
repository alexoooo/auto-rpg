# Session 02 -- remove the humanoid assumption from the arena control seam

## Outcome

The arena can host different command surfaces without turning `Intent` into an untyped bag.
Warrior, Broot, Centipede and KayKit continue to use their exact current `Mind`/`Intent` path;
future constructs install a separately versioned action driver through the same opaque host seam.

## Current fault line

`Combatant` in `src/units.ts#L44` requires `mind: Mind`, `view: FighterView` and a humanoid intent
observer. `mindFor` in `src/main.ts#L338` constructs one `Mind` for every unit. That worked only
while every non-humanoid either impersonated the hand contract or had one exceptional natural
channel. An arbitrary joint/action graph cannot honestly enter there.

## Implement

Create `src/control-host.ts`:

~~~ts
export interface InstalledDriver {
  readonly surface: string;
  readonly name: string;
  step(dt: number): void;
  stop(): void;
}

export interface ControlEndpoint {
  readonly surface: string;
  readonly driver: InstalledDriver;
  installPolicy(name: string, seed?: number): void;
  installHuman(): void;
  releaseHuman(): void;
  stop(): void;
}
~~~

Each endpoint constructs its own typed human or policy adapter, then exposes only the bound
`InstalledDriver` lifecycle to the host. It checks the surface tag before installation and refuses
`control source for surface X cannot drive surface Y`. The typed implementations remain
`src/humanoid-control.ts` over `Mind`, `FighterView` and `Intent`, and later
`src/construct/control.ts` over construct types. No body-facing view or command is cast through
`unknown`.

Move policy construction behind `UnitDefinition` in `src/units.ts#L94`: a definition creates the
body and its endpoint together, publishes its own `{ name, label }` driver options and declares
whether a human adapter exists. Humanoid definitions project their current options from `POLICIES`;
a later construct definition may publish `construct-hold` without pretending it is a `Mind`.
Replace the public
Fighter assumptions on `Combatant` with `readonly control: ControlEndpoint`. Keep compatibility
getters on `Fighter` only long enough for current tests and the `__sword` debugger; mark the host
call sites that still use them and remove those call sites in this session.

Update handover and setup in `src/main.ts#L338`, policy compatibility in `src/units.ts#L243` and
the policy options and Control radio rendering in `src/setup.ts#L184`. Rebuild a side's policy
options from its selected definition and preserve its selection only when that exact driver remains
available. A surface with no human adapter disables
`you` with a reason; it never installs Idle as a silent substitute. Keep `BoutRecorder` at
`src/recorder.ts#L27` on the humanoid command observer for now. Construct action recording lands
with session 05.

## Tests watched failing

Extend `tests/units.test.mjs` and `tests/handover.test.mjs`:

- `each_unit_builds_the_control_surface_its_definition_declares`
- `a_driver_for_one_surface_is_refused_by_the_other_surface_name`
- `humanoid_policy_handover_keeps_the_exact_command_on_both_sides_of_the_seam`
- `a_body_without_a_human_adapter_disables_you_instead_of_installing_a_policy`
- `the_host_never_switches_on_a_concrete_Fighter_or_Construct_class`

Watch the parity test fail by swapping primary and secondary in the humanoid adapter. Watch the
surface test fail by removing the runtime tag check while handing it a construct fixture.

## Regression and accept

Bracket this shared-host change:

~~~powershell
npm run measure -- --only duelist-swinger --bouts 120
npm test
npm run check
npm run build
~~~

The seed-20260823 null control must remain within its already recorded sampling result; an exact
script/command parity test must remain byte-identical. Existing feature, tactic, artifact and
research digests do not move.
