# Traps

What has bitten in code that calls Rapier or Babylon, handles a pointer, or is checked in a
browser. Read the section before changing code of its kind.

## Rapier

- **Motor impulse** is applied to the joint's parent; `jointMotorImpulse` reads the last substep,
  `jointMotorStepImpulse` sums the step. Neither measures work.
- **A joint's angles are the ones its limit reads** (`jointAngles`); press a limit before trusting
  a reading. **Build a jointed body in the pose its joints demand**, or the solver flings it.
- **A fast chain's controller asks for the motion under way** (`bias` in `bodyDynamics`,
  gyroscopic torque included).
- **Bodies never sleep**; **linear velocity is the centre of mass's**, not the node's.
- **Zero self-contacts proves only that no pair was admitted**: measure clearance geometrically.

## Babylon

- **Side-effect imports are load-bearing** (shadows, depth renderer, post-process, HDR, shaders,
  `Culling/ray.js` for `scene.pick`, the glTF loader).
- **Read a mesh's transform from `position` and `rotationQuaternion`**: `getWorldMatrix()` caches
  per render id. Turn a vector with `applyRotationQuaternionToRef`, never `rotateByQuaternionToRef`.
- **Materials belong to the scene**: a body part disposes with `dispose(false, false)`.
- **Observers are removed asynchronously**: count the active ones, not the calls to remove.

## Pointers

- **Pointer events only**; read `event.buttons`. A DOM control over the canvas stops `pointerdown`
  and `pointermove`, lets `pointerup` through, and blurs on click.

## In a browser

- **A hidden tab does not render**: check `document.visibilityState` and that `engine.frameId`
  moves.
- **The Arena's, crowd's and Crypt's worlds are in workers**: `await __arena.step(n)` (or
  `__crowd`, `__dungeon`) steps and draws; `__arena.world.tape()`, `__arena.verdict` and
  `__dungeon.run` read the state.
- `Material.isReady(mesh)` is false outside a render pass; use `mesh.material`, not
  `scene.materials`; after a hot reload, navigate.
