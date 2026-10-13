# Discrete combat actions and configurable tactics

## Goal and scope

Separate choosing whom to attack from choosing what to do, and give both ordinary tactics and a
future meta-policy the same discrete action vocabulary. The Lab's Attack scenario exercises the
game's orders, senses, policies and skills against physical targets. It owns the experiment's
environment, not an alternative combat controller.

Keep the design small: a shared target context, an action catalogue, replaceable selectors and a
bounded execution contract. Extend the existing mind configuration and skill arbitration. Do not
build a general scripting language, a second behaviour engine or a Lab-specific action system.
Recovery and the current When down configuration are outside this work. Backward compatibility
with superseded configurations is not required.

## Current code and the gap

- `src/core/mind/intent.ts` describes hand blows and foot kicks. A blow can specify one of six
  path families and continuous path parameters. Those families are not six independently
  supported actions: executors differ in which parameters they actually use. A hand blow can
  also use a held item; the category does not mean exclusively bare-handed punching.
- `src/core/skills/skill.ts` provides the current blow execution contract. Its `accepts` and
  `busy` predicates do not provide a complete capability, initiation and termination contract.
- `src/core/skills/choose.ts` chooses an executor using first-able, rotation or historical contact
  scores. It inherits range information from its first option and counts contact with any foe.
  This is a useful starting point for selection, but is not yet a reliable action catalogue or
  an outcome model for planning.
- `src/core/mind/targets.ts` turns a foe order into a world point. The explicit-order branch in
  `src/core/mind/path-tactics.ts` then bypasses autonomous opening selection. Ordering an attack
  on a body should constrain the target while retaining the configured attack policy.
- `src/core/mind/behaviours.ts` composes behaviours by command channel. Target selection inside
  separate behaviours needs to become shared context, so movement and attack agree on the foe.

## Decision boundaries

```text
Orders + sensed bodies
          |
          v
Target selector -> selected target context
                            |
Body + equipment + configured actions + live target geometry
                            |
                            v
                    Action candidates
                            |
                            v
                      Action selector
                            |
                            v
                   One action instance
                            |
                            v
                Skills -> muscles -> physics
                            |
                            v
                   Progress and outcome
```

The target selector chooses a sensed body identity. A player's attack order locks that choice;
an automatic selector may choose nearest, seeded random or a configured priority. The action
selector chooses among candidates for that body. Target selection never prescribes a punch path,
and action selection never silently substitutes another foe.

Keep target eligibility and action feasibility callable separately. This lets a future joint
selector compare actions across eligible targets without duplicating either rule. A player lock
restricts that candidate set to the ordered body. If the ordered body disappears, report target
loss; switching to another body requires an explicit automatic-selection policy or new order.

Live target context contains sensed geometry and motion, not engine handles. It is shared by
positioning, aiming and attack selection. Defensive behaviours may respond to other threats, but
cannot change the attack target. Preserve ordinary movement/stop orders and their precedence;
an attack order is not a shortcut around the policy pipeline.

## Discrete actions, continuous execution

An attack choice names a registered technique, effector, target region and configured variant.
For example, this is illustrative configuration, not a new fixed schema of required techniques:

```json
{
  "technique": "straight-punch",
  "effector": "right-hand",
  "target": { "body": "target-7", "region": "surface" },
  "variant": "standard"
}
```

All choices are discrete. Candidate regions come from the target's supported anatomy or surfaces;
a generic physical object need not pretend to have a head. The skill resolves the chosen region
into a live aim point and controls tracking, trajectory, timing, balance and muscles. The policy
does not emit arbitrary world points, joint angles, path vectors or per-step extension values.
The executor declares when it can still track and when a committed motion must finish.

Selectable differences use named, immutable variants. Numerical tuning belongs to the configured
variant or controller and is validated there. Do not enumerate every numerical combination as an
action. Generate only configured, supported candidates for the current body and target, in stable
order; discrete does not mean that every character shares one enormous Cartesian product.

### Technique and implementation are separate

A technique describes the intended physical action; an executor implements it. Recipe strike,
path strike, driven strike and whole-body strike are implementation choices, not automatically
four distinct combat techniques. Existing path families can become techniques or variants only
where their distinction is implemented and their capability is explicit. Do not preserve all six
as selectable actions merely because the old union lists them.

Each configured action binds its technique and variant to one compatible executor. Different
research implementations can be compared using explicitly named bindings; ordinary policies
need not know which controller solves the motion. Held equipment and body structure participate
in capability checking. Never silently interpret an unsupported hook as a straight punch, or
advertise an empty-hand action for a weapon configuration it does not support.

Use the registration and validation pattern in `src/core/mind/parts.ts` and
`src/core/mind/catalog.ts`. Action registrations own their semantics, supported bindings and
parameter validation. The catalogue, editor and selectors read that source of truth. Adding a
technique may require its implementation and registration, but must not require a special case
in every selector, screen or planner. Closed protocol unions remain typed and exhaustively handled.

### Positioning and waiting are actions too

Expose bounded positioning actions alongside attacks: enter a chosen technique's usable range,
increase separation, circle to either side, and hold guard. These are examples of registered
actions, not a mandatory list embedded in the policy loop. Distances, angles and dwell durations
come from validated configuration or the chosen technique's requirements.

Use long-range approach as an explicit action. An attack owns its final alignment and local
stance adjustment, not an unbounded pursuit. A simple behaviour can compose approach then attack;
both steps retain the same target and selected technique. Moving targets can invalidate readiness
and cause reconsideration. Dungeon route finding retains its existing owner; define the handoff
to local positioning so navigation and the attack skill never issue competing movement commands.

Every action has a completion condition and a bounded failure condition. A guard action used by a
planner holds for its configured interval; background guarding can continue whenever arbitration
leaves resources free. Keep that distinction explicit instead of forcing a policy to select guard
on every physics step.

## The minimal execution contract

Separate immutable action definitions, candidate observations and mutable action instances.
Implement only fields with an immediate reader; a future planner does not justify unused metadata.

| Contract | Required meaning |
| --- | --- |
| Identity | Stable configured action ID and a distinct ID for each started instance. |
| Capability | Whether this body, equipment and executor support this action at all. |
| Readiness | Ready, needs positioning, or temporarily blocked, with a reason and actionable requirements. |
| Start | Revalidate a candidate against current observations and either start or explicitly refuse it. |
| Progress | Phase, relevant progress, and whether cancellation is currently allowed. |
| Termination | Completed, cancelled, interrupted, target lost or stalled, with a reason. |
| Outcome | Observed contacts and consequences associated with this instance, independently of termination. |

The action owns its target, effector, variant and executor from accepted start through termination.
Do not select again on every tick merely because a controller has not entered its swing. Ordinary
reselection happens at termination or an explicit permitted cancellation point. A new player order
can request cancellation; committed motion follows the executor's cancellation contract. Recovery
may forcibly interrupt ownership through the existing sub-mind mechanism and must release claims.

There is one active deliberate action per fighter initially. Keep simultaneous background guard
and support in the existing skill arbiter (`src/core/skills/arbiter.ts`), which remains the authority
for limb and body claims. Do not add a competing policy-level limb scheduler. All control continues
on the world's existing physics clock (`src/core/world.ts`).

Contacts enter as observations and are consumed at the next control step. Attribute an attack
contact using the active instance, requested target and actual attacking surface, including a held
item when relevant. A torso bump that removes a Lab target is not a successful punch. Distinguish
requested-target contact, other contact and no qualifying contact; completion alone is not a hit.
Damage comes only from existing combat rules. Report uncertainty where contact attribution is
insufficient rather than inventing accuracy, damage or causal credit.

Catalogue definitions and configuration are immutable. Instance state, selection history, random
state and pending observations are plain snapshot data under the existing state ownership rules
(`src/core/state.ts`). No functions, nodes or engine handles enter replay state. Candidate order,
tie-breaking and seeded randomness must reproduce after replay or fork.

## Customizable behaviours and presets

Provide independent configuration slots for target selection and action selection. Begin with
fixed choice, rotation and ordered conditional choice over the same candidate contract; add
seeded random or scored selection when needed. Conditions use shared observations and readiness
predicates. They do not copy range calculations or probe controller-specific internal fields.

Seek and Choose openings become configurations of these shared decisions, positioning and defence.
Seek can prefer a configured attack and approach when required. Choose openings can rank candidate
regions and techniques using the geometry already owned by `src/core/mind/openings.ts`. Behaviours
remains the customization surface, with presets supplying ordinary editable configurations.
Replace the old Choose a blow wrapper with action selection over explicit bindings; do not retain
two nested selectors with competing ownership or incompatible success scores.

Reuse mind config validation, serialization and `src/ui/mind-editor.ts`. The editor should expose
target policy, action policy, available actions and their bindings, without maintaining a separate
hard-coded attack menu. Unsupported configuration produces a clear validation error. Experimental
implementations retain their status; inclusion in the catalogue is not a claim of physical quality.

A future meta-policy receives the same candidates and outcomes. It may choose an action directly
or choose among configured policies, with an explicit ownership boundary. Planning over action
sequences additionally needs an outcome/duration model; a discrete vocabulary alone does not
supply one. Estimated costs and durations, if later needed, must be labelled estimates and kept
separate from measured execution outcomes. Training, search and learned models are not this task.

## Attack scenario integration

`src/lab/attack-mode.ts` and `src/lab/attack-scenario.ts` continue to own physical target creation,
movement, wind, selection UI and removal after impact. Automatic attack orders remain the default,
with click-to-select override. Target speed defaults to zero and wind remains configurable.

The Lab issues ordinary target orders. Its automatic target policy can advance after a target is
hit or lost, while any committed action still follows the shared execution contract. Show the
selected body, chosen action, readiness, current phase and last outcome through normal reports.
Keep the scenario's count of impacted targets distinct from action success. No timers in the Lab
choose hands, trigger swings, force poses or declare combat success.

## Implementation sequence and acceptance

1. **Define and exercise the contract with one real attack.** Add the shared target context,
   supported-action binding, readiness and instance lifecycle. Carry target identity through
   orders to execution. Migrate a supported straight-punch binding through the complete game
   path; do not publish a broad catalogue of names whose executors ignore the distinctions.
2. **Separate positioning and selection.** Make approach explicit, share technique requirements,
   and implement fixed, rotation and ordered conditional selectors. Add a second genuinely
   distinct supported action to establish that selection and readiness are not punch-specific.
   Replace Choose a blow and migrate its callers/configuration; remove superseded paths.
3. **Compose the tactics presets.** Move Seek and Choose openings onto shared target/action
   decisions and ordinary behaviour configuration. Reuse their applicable geometry and defence
   logic. Update the editor and game callers together, without compatibility aliases.
4. **Finish Lab visibility and integration checks.** Keep the existing physical targets and
   controls; display shared reports. Update architecture, roadmap and player documentation where
   the changes make them wrong. Delete this plan when the work lands.

Acceptance covers the whole order-to-contact path, not isolated endpoint mocks:

- A player-selected body remains the target even when another foe is nearer; automatic selection
  and moving-target tracking use the same execution route. An explicit order still exercises the
  configured action selector instead of forcing a straight blow.
- Two supported actions expose their own requirements. Unsupported body/equipment/technique
  combinations are rejected; none silently falls back to another motion.
- Selection remains stable throughout an instance, including preparation. Changed orders, target
  removal, blocked approach and recovery interruption produce explicit, bounded outcomes and
  release ownership correctly.
- Requested-target contact, incidental contact and completed misses remain distinguishable.
  Lab target removal cannot inflate an action's hit count.
- Replay/fork preserves target, selected action, lifecycle and seeded selection state. Normal
  guarding, navigation and skill resource arbitration continue to work.

Use focused tests for these contracts and an end-to-end physical Attack fixture. Follow the
repository's normal code gates (`npm run check`, `npm test`, and `npm run build` for browser
changes); run related slow tests only when their covered behaviour changes. Briefly inspect the
visible Lab controls and reports. No new benchmark campaign or physical robustness claim is part
of this design work.
