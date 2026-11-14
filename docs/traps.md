# Traps

What has bitten in code that calls Rapier or Babylon, handles a pointer, or is checked in a
browser, and in the tools on the development machine. Read the section before changing code of
its kind or running those tools.

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
- **A transparent overlay drawing over geometry keeps stencil masks read-only**
  (`material.stencil.enabled = true`, `mask = 0`); otherwise a HighlightLayer can fill its quad
  with a character's silhouette.

## Pointers

- **Pointer events only**; read `event.buttons`. A DOM control over the canvas stops `pointerdown`
  and `pointermove`, lets `pointerup` through, and blurs on click.

## In a browser

- **A browser check uses the Chrome on this machine**: the browser tools can reach the owner's
  other computer too, and both report themselves local; the one on this machine is the one that
  loads its preview server.
- **A hidden tab does not render**: check `document.visibilityState` and that `engine.frameId`
  moves.
- **The Arena's, crowd's and Crypt's worlds are in workers**: `await __arena.step(n)` (or
  `__crowd`, `__dungeon`) steps and draws; `__arena.world.tape()`, `__arena.verdict` and
  `__dungeon.run` read the state.
- `Material.isReady(mesh)` is false outside a render pass; use `mesh.material`, not
  `scene.materials`; after a hot reload, navigate.

## Tools on Windows

- **PowerShell runs `npm` as `npm.ps1`, which its execution policy refuses** (`Restricted`):
  call `npm.cmd` there, with the same arguments; the policy is left as it is.

- **`git worktree remove` on a worktree with a `node_modules` junction empties the main
  checkout's.** Delete the folder with `npm run clean` (or Node's `rmSync`), then
  `git worktree prune`.
- **Python's `open(path, 'w')` writes cp1252**: Vite's build then refuses the file while `tsc` and
  `npm test` pass. Pass `encoding='utf-8'`.
- **Git Bash dies in its own startup at times**, leaving `bash.exe.stackdump` in the repository
  root (every frame in `msys-2.0.dll`, the runtime's fatal-error exit), which fails
  `tests/workspace.test.mjs`. Many bash launches at once or in quick succession are the common
  thread; a long script with quotes and backticks in a quoted heredoc is safer written to a file
  first. A dump's first lines and time, and what was running, are read before `npm run clean`
  deletes it; the remedy left is a newer Git for Windows.
- **A background wait ends on its own**: a watcher loop outlives the tool that started it, so it
  gets a timeout or an exit condition, and its pattern must be able to match (a training run's
  checkpoints are named by decisions, `model-12060672`, not round millions).
