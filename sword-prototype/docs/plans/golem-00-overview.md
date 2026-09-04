# Golem -- live roadmap

> **2026-09-04 status: planned, nothing landed.** Twelve files, one per landable session.
> Session 01 (demolition) may start at once. Every later session ends at a human gate that the
> owner records in that session's status line; an agent may not write "accepted" there.

## Why this plan exists

Three body experiments ran in this prototype and none produced a fighter the owner wanted to
look at:

- **Warrior.** Anchor-driven three-bone arms on a skinned human costume. The fighting works and
  is the one thing worth keeping. The arm motion never looked right (an elbow that wrapped around
  the back, a shield hand that swung behind the trunk), and several fix attempts each cleared a
  measured proxy without clearing the owner's complaint. The costume pipeline cost a great deal
  and still read as a mannequin.
- **Constructs and the Forge.** Free-form bodies from primitives, player-authored Actions and
  Minds, a learning ladder. Bulky colliders that bumped into themselves, joint-space position
  motors chasing targets, and a mind that never looked coherent. No learned mind ever trained.
  Every fix attempt failed completely.
- **Effigy.** The fixed humanoid construct with hand-authored tactics. Stiff, ugly, and unchanged
  after many corrections, while its measured dynamism corpus turned green.

The one finding all three share, and the finding this plan is built on: **each attempt was gated
by a scalar proxy** (anchor stray in millimetres, dynamism path length, stuck-step counts) **that
turned green while the owner's judgement stayed red.** This plan reverses the order. A person
looks first. A metric becomes a regression floor only after a person has said yes.

The physical causes are recorded here as *candidates*, not verified facts. Sessions 02 and 03
exist to tell them apart by isolating one module at a time:

- A six-axis hand pin on a seven-axis arm has a spare axis, so any command near the edge of the
  chain's envelope resolves to the least-violation pose, which is an elbow behind the back.
- Joint-space position motors at the torque needed to move stone are stiff by construction: no
  lag, no follow-through, no secondary motion.
- Bulky colliders on one body contact each other, and a motor fighting a contact reads as jitter.
- Continuous dynamic-root balance is infeasible here (both bodies fell within half a second in
  the recorded bracket), so any locomotion that is not a carrier is a fall.

## The design

**A fixed body plan of five slots**, each filled by one pre-made module:

| slot | reads from `Intent` | first options |
| --- | --- | --- |
| locomotion | `forward`, `strafe`, `turn`, `posture.crouch` | biped, wheel, multileg |
| torso | `posture.trunkLean`, `posture.trunkTwist` | plain, plated |
| primary effector | `primary: HandIntent` | a chain from the ladder below, with a terminal |
| secondary effector | `secondary: HandIntent` | the same shelf; a plate terminal is the usual pick |
| head | `natural: NaturalIntent` | plain, ram |

The torso carries the three upper sockets and sits on the locomotion root through a soft
motorised waist. The five channels above are the existing `Intent` split exactly, so the mouse
and a scripted mind keep driving the same seam. Nothing new is asked of `src/mind.ts`.

**Weapons are body parts.** After One Must Fall: there is no held item. The Warrior's held items
produced the visual glitches that never went away (fingers clipping through a shield, a handle
that was not visibly held), and every one of them is an artefact of a grip: a hand closed around
a separate object through a weld whose frame had to agree with the hand's. A golem has no grip.
A sword is a blade at the end of an arm and a shield is a plate at the end of an arm; the plate
is no more special than the blade, and neither needs a hand. Severing a module leaves a physical
object in the arena, and Session 10 makes that object the thing a winner can take. Modding the
unit replaces choosing equipment.

**A module is** a physics chain (slender colliders), an authored geometric shell parented to those
colliders, a controller that runs every physics substep, a declared envelope, a mass, per-part
health and vitality weight, and a severing rule. The contract lands in Session 02 and every later
module implements it unchanged:

```ts
export type GolemSlot = "locomotion" | "torso" | "primary" | "secondary" | "head";

export interface GolemModuleDefinition<Command> {
  readonly id: string;             // stable, e.g. "locomotion.biped" or "effector.pitch.blade"
  readonly slot: GolemSlot;
  readonly label: string;
  readonly massKg: number;
  build(ctx: ModuleBuild): BuiltModule<Command>;
}

export interface BuiltModule<Command> {
  readonly parts: readonly GolemPart[];       // health, vitalityWeight, fatal, collider, shell
  readonly strikers: readonly Striking[];     // may be empty
  command(next: Command): void;               // once per control boundary
  step(dt: number): void;                     // once per physics substep, 240 Hz
  envelope(): ModuleEnvelope;                 // what it can reach, published to minds
  view(): EffectorView | null;                // effectors only
  sever(): void;
  dispose(): void;
}
```

`Command` is `HandIntent` for effectors, a `LocomotionRequest` plus crouch for locomotion, the
two trunk numbers for the torso, and `NaturalIntent` for the head.

**An effector module is a chain and a terminal, chosen independently.**

- The **chain** owns everything about motion: the driven axes, the drive, the envelope, the
  mouse mapping and the strokes. The bench exists to get chains right, and every chain is
  benched with the same blade terminal so that what is being judged is the chain.
- The **terminal** is what sits at the chain's end: its collider, its mass, its striker kind
  through the existing bite table (edge, point, mass or none), its collision layer against the
  enemy, and its shell. It contributes nothing to control. It is its own rigid body, welded once
  to the chain's last link in the frame its own weld demands, because scoring, severing and loot
  all want a blade or a plate to be an identifiable body, and the construct experiment recorded
  that compound child shapes cannot be told apart by engine handle.

```ts
export type ChainId = "none" | "pitch" | "reach" | "wrist";
export type TerminalId = "blade" | "plate" | "mace" | "whip";

export interface EffectorChainDefinition {
  readonly id: ChainId;
  readonly axes: 0 | 1 | 3 | 5;
  build(ctx: ModuleBuild): BuiltChain;         // links, joints, drive, envelope, strokes
}

export interface EffectorTerminalDefinition {
  readonly id: TerminalId;
  readonly sockets: 1 | 2;                     // a mace needs both effector sockets
  readonly bite: "edge" | "point" | "mass" | "none";
  build(ctx: ModuleBuild, onto: BuiltChain): BuiltTerminal;   // body, weld, striker, shell
}

// An effector option is a pair. The registry is a Record over every legal pair, so an
// unbuilt pair is a compile error, not a silent substitution.
```

A sword is blade-on-wrist. A shield is plate-on-reach. A pitch-plate is a legal, cheap, heavy
block. What `roll` means is the terminal's business (which way the edge faces, which way the
plate faces), and only a chain with a roll axis can express it.

**The chain ladder.** Every rung stays as a pickable option; the ladder is an order of
construction, not a replacement sequence. Rung *n* is built only after rung *n-1* has passed the
human gate, and a rung that fails twice stops the ladder there.

| rung | chain | driven axes | target the chain is given | session |
| --- | --- | --- | --- | --- |
| 0 | none | 0 | none; the socket carries a cap that can shove | 02 |
| 1 | pitch | 1 | one pitch angle from `pointerY`; `thrust` is a chop, `guard` raises | 02 |
| 2 | reach | 3 | a point from pointer azimuth/elevation and `thrust`/`guard` reach | 03 |
| 3 | wrist | 5 | rung 2 plus roll and bend from `roll`/`wristBend` | 03 |

**The terminals.** Each is built once and then offered on every accepted chain.

| terminal | sockets | bite | `roll` on a wrist chain means | session |
| --- | --- | --- | --- | --- |
| blade | 1 | edge | which way the edge faces | 02 |
| plate | 1 | none; mass on a `thrust` bash | which way the plate faces | 04 |
| mace | 2 | mass | nothing; a mace has no edge | 04 |
| whip | 1 | mass, scaled by segment speed | which way the lash starts | 04 |

## Frozen rules

1. **A human looks first.** Each module is accepted by the owner driving it on the bench with
   the mouse for about a minute and answering three questions: does it read as a limb rather
   than a robot arm or a rope; does its motion carry weight (lag, follow-through, recoil); does
   anything look wrong (pose flips, jitter, self-contact, a stroke that does not stop where it
   should). The answers go into the session's status line. Metrics are recorded after a yes and
   become regression floors; they never substitute for the yes.
2. **A module has no more driven axes than its target specifies.** Every reachable target has
   exactly one pose. Redundancy returns only per module, with a designed resolution, and only
   after the simpler rung passed.
3. **Commands live inside the module's envelope.** The module publishes what it can reach; the
   mouse mapping and the mind both pick inside it. A controller never receives an unreachable
   target and never needs a refusal branch for one.
4. **Drives are soft and force-capped, targets are rate-limited, strokes are velocity events.**
   Weight comes from a finite force budget against real mass, not from a tuned spring and not
   from high torque. A swing is an angular-velocity profile with follow-through, not a pose
   sequence. Raising a motor ceiling still requires the before/after table beside the number, as
   the house rule says.
5. **Slender colliders, and a golem's own parts never collide with each other.** A terminal
   declares its layer against the *enemy*: a blade passes through its owner, as the layer table
   already argues, and a plate stops an enemy blade. The held shield had to collide with its
   owner's trunk because a redundant arm could be commanded into it; a low-axis chain with an
   envelope cannot, so no self-collision pair is planned, and one is added only if the bench
   shows a need.
6. **The shell is not the collider.** Cosmetics never carry authority (house rule); the collider
   is what the module needs to work, the shell is what it looks like, and the shell is authored
   per module from a handful of primitives with proportions chosen on the bench.
7. **Fixed 240 Hz, control on the physics clock, no force applied from outside the solver.**
   These are the existing house rules and each one carries a recorded shake behind it.
8. **One seam.** A policy plays with the controller a person plays with. `Intent` is the whole
   command surface, and a golem control endpoint is a clone of the humanoid one with a new
   surface tag, not a widening of `Intent`.
9. **No learning in this plan set.** Three full learned runs failed promotion and the construct
   ladder never opened. The central mind is a scripted state machine over module-declared
   capabilities. If learning ever returns, it returns as parameter tuning of that machine.
10. **Stop rule.** A rung or module gets at most two correction sessions. If the owner still
    says no, the record says so and the ladder stops at the last accepted rung. This plan does
    not repeat the pattern of tuning against a proxy until it is green.

## What is kept, dropped and salvaged

**Kept (untouched or lightly edited):** the Warrior and Broot as opponents and as the reference
for "fights well"; the Centipede as a working non-humanoid; `src/physics.ts` and its layer table;
the 240 Hz step; `src/scoring.ts`, `src/combat.ts`, severing and vitality in `src/bout.ts`;
the four `src/supported-locomotion*.ts` files and `src/supported-root-drive.ts`; `src/mind.ts`,
`src/policies.ts`, `src/options.ts`, `src/action-primitives.ts`; `src/control-host.ts` and
`src/humanoid-control.ts`; `src/host-run.ts`; input, camera, HUD, setup, arena, blood, arrows,
textures.

**Dropped (Session 01):** `src/forge/`, all of `src/construct/`, all of `src/learning/`, the
KayKit unit, the guided playtest, their scripts, tests, npm commands, doc sections and the old
plan set.

**Salvaged by copy-and-cut before deletion:** the construct stone/bronze material recipes and the
procedural stone plugin with its health-driven wear; the engagement instrument that
`src/options.ts` imports; the construct headless-arena harness as the bench's Node harness.

**Reused as an idea, not as code:** the anchor drive in `src/arm.ts` (massless kinematic anchor,
force-capped six-axis position motor, `setTargetTransform` so the constraint sees a velocity, a
rate-limited target); the construct group-scoped motor writer; the dynamism measures.

## Live session order

| session | landable result | depends on |
| --- | --- | --- |
| [01](golem-01-demolition.md) | forge, constructs, learning, KayKit, playtest and the old plans gone; gate green | -- |
| [02](golem-02-effector-bench.md) | bench page, module contract, anchor drive, the blade terminal, chains 0 and 1 accepted | 01 |
| [03](golem-03-unique-pose-arms.md) | chains 2 and 3 accepted, or the ladder honestly stopped | 02 |
| [04](golem-04-terminals.md) | plate, mace and whip terminals accepted on every accepted chain | 03 |
| [05](golem-05-locomotion-bench-and-biped.md) | locomotion contract and a biped that walks, crouches, falls and rises | 02 |
| [06](golem-06-wheel-and-multileg.md) | wheel and multileg locomotion accepted | 05 |
| [07](golem-07-torso-and-head.md) | plain and plated torsos; plain and ram heads | 02 |
| [08](golem-08-assembly-and-arena.md) | a golem unit in the arena, mouse-driven against the Warrior duelist | 04, 05, 07 |
| [09](golem-09-central-mind.md) | a scripted golem mind that fights the Warrior duelist and another golem | 08 |
| [10](golem-10-body-parts-as-loot.md) | severed modules survive a verdict and can be fitted before the next bout | 08 |
| [11](golem-11-playtest-record-and-close.md) | owner playtest, durable record, this plan set deleted | 09, 10 |

Sessions 05 and 07 depend only on 02 and may run in parallel with 03 and 04. Session 06 is
optional before 08: the first assembled golem needs one locomotion option, not three.

## Conventions for this plan set

- A session's status line is the only line an agent edits in another session's file, and only to
  record a landed dependency. Human-gate verdicts are written by the owner.
- No line anchors in these files. Name the construct; the docs gate over `docs/plans/` pins
  anchored references into deleted files at zero, and Session 01 deletes a great deal.
- Every session runs `npm run check`, `npm test`, `npm run build` and `git diff --check` before
  landing, plus the root `node tools/check_docs.js` when it touches a Markdown link.
- A session that deletes a file regenerates `docs/deleted-paths.md` in a second commit, because
  the register is derived from committed deletions and the gate is red in between.
- Durable results go to `docs/design.md` (what it is) and `docs/measurements.md` (what was
  measured, in which harness). Completed plans are not a second authority; Session 11 deletes
  this set.
