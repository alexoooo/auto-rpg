# Session 04 -- terminals: plate, mace and whip

**Status (2026-09-04): planned.** Depends on 03 (or on 02 with the ladder stopped at rung 1).
Human gate: not yet asked.

## Outcome

Three more terminals, each offered on every accepted chain: a plate that blocks by being in the
way, a mace that needs both effector sockets, and a whip that is a chain of bodies. With these the
effector shelf covers attack, defence, reach and the one deliberately floppy thing, and Session 08
has enough to assemble a golem worth fighting with.

A terminal is judged once per accepted chain, because the chain is what moves it and a plate on
a pitch chain is a different thing to hold than a plate on a wrist chain.

## Frozen choices

- **A terminal contributes nothing to control.** It is a body, a weld, a striker, a layer and a
  shell. If a terminal file ever reads `HandIntent`, the factoring has leaked and the session
  stops to put it back. What `roll` means (edge, face, lash) is declared by the terminal as a
  frame offset the chain's last link is asked to turn to; the chain does not know why.
- **The plate blocks because it is a collider on the layer an enemy blade collides with**, which
  the layer table already provides for a held shield. Its facing follows the strapped-shield rule
  in the design doc: the plate points away from its owner's centre along the sphere of the
  chain's reach, as squarely as the chain allows. On a wrist chain `roll` turns it within stops;
  on a pitch or reach chain it faces where the forearm points. It has no edge striker; a
  `thrust` bash is a mass bite at low weight, like the fist.
- **No self-collision pair for the plate.** The held shield collided with its owner's trunk
  because a redundant arm could be commanded into it. A low-axis chain with an envelope cannot,
  so the plate ignores its own golem like every other part. If the bench shows a plate passing
  through its own torso on a legal command, the envelope is wrong, and that is fixed in the chain,
  not by a collision pair.
- **The mace occupies both effector sockets.** The measured lesson stands: two position motors
  on one rigid body fight, and the trailing grip is left unmotorised. The primary socket's chain
  carries the anchor; the secondary socket's chain is a passive constraint to the mace's shaft;
  the registry marks the pair as claiming both sockets so nothing else can take the secondary.
  `F` still swaps the cursor between sockets on the bench, and on a mace the swap changes
  nothing, which is the honest behaviour. A bow is not built this session: the arrow pool and
  draw model exist and a later session can mount them, but assembly, the mind and loot come
  first.
- **The whip is physics, not control.** A chain of light capsule segments on spherical joints
  with damping, welded to the last link. No new driven axis. The striker is the last few
  segments with a mass bite scaled by segment speed. The whip passes through its owner (a
  blade's rule) because a whip that snags on its own torso is a bench session nobody asked for.
  It is offered only on the wrist chain, because without roll a lash has no start.

## Implement

1. **Plate.** `src/golem/effectors/terminals/plate.ts`: a slender box on the shield layer with a
   chamfered stone shell and a bronze rim, the facing rule, the bash striker, the `roll` frame
   offset. Publish through the chain's `EffectorView` with `weapon` naming the plate so a mind
   can cover a line with it.
2. **Layer bits.** Decide in `src/physics.ts` whether golem terminals reuse the existing
   `*_SWORD` and `*_SHIELD` side bits or take new `*_GOLEM_*` bits, and write the `COLLIDES` rows
   with the same "why" paragraph the table's other rows carry. Verify with the existing
   filter-exactness helper that filters land on leaves, not containers.
3. **Mace.** `src/golem/effectors/terminals/mace.ts`: a heavy head on a shaft with two weld
   frames, one for the driven chain and one for the passive chain; its `sockets` is 2. Its
   presence narrows the effector envelope the chain publishes, and the chain says so.
4. **Whip.** `src/golem/effectors/terminals/whip.ts`: segment count, length, mass and damping in
   its table; segments on no collision with the owner; the strike window measured with the same
   exclusions as every other tip-speed reading.
5. **Registry.** Add every legal pair to `src/golem/registry.ts`. Illegal pairs (whip on a pitch
   chain, mace on the none chain) are absent from the `Record` type, not refused at runtime.
6. **Bench and headless.** Add the pairs to the bench's picker, the scripted sequences (a plate
   asked to cover the centre line and then to face away; a mace chop; a whip lash) and the
   assertions in `tests/golem-bench.test.mjs`: zero self-contact for every pair, the passive
   grip's error staying below the driven grip's on the mace, the whip's tip speed inside the
   excluded windows, and clean dispose for the multi-body whip.
7. **Two-effector bench mode.** Put two effectors on the stand at once (one per socket) so the
   owner can drive a blade with a plate on the other side and see whether they read as one body.
   `F` swaps.

## Human gate

Per terminal, on each accepted chain, the three questions. For the plate add: does it look like
it is blocking, or like a plate floating near an arm. For the mace add: does the trailing arm
look attached. For the whip add: does the chain look heavy or like string. Verdicts go into this
file's status line as a small table of terminal by chain.

## Verification

```powershell
npm run check
node --test tests/golem-bench.test.mjs
node scripts/golem-bench.mjs --chain reach --terminal plate
node scripts/golem-bench.mjs --chain wrist --terminal mace
node scripts/golem-bench.mjs --chain wrist --terminal whip
npm test
npm run build
git diff --check -- .
```
