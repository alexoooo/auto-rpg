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
- **Material plugins on one material share one shader**: a GLSL function a plugin adds is named by
  that plugin (`valueNoise(name, …)`), or two plugins' copies of it fail to compile together.
  `getCustomCode` is first called from `MaterialPluginBase`'s constructor, before a subclass has
  set its fields, and again when the shader compiles: it reads a field as maybe unset.
- **Observers are removed asynchronously**: count the active ones, not the calls to remove.
- **A transparent overlay drawing over geometry keeps stencil masks read-only**
  (`material.stencil.enabled = true`, `mask = 0`); otherwise a HighlightLayer can fill its quad
  with a character's silhouette.
- **An environment map's brightest pixel must fit a half float** (65504): Babylon filters the map
  into half-float textures, and a phone uploads it as them. A desktop GPU clamps a brighter
  value; a phone's makes it infinite, and every surface whose reflection reaches it loses that
  channel. A clear sky's sun at 75776 red and 71168 green, with its blue under the limit, drew
  the Arena's floor and fighters saturated blue in blocks on a phone and nothing wrong on a
  desktop. `node scripts/art/radiance.mjs cap` dims such pixels, and `npm run assets:check`
  refuses them.
- **The Tactical view turns the scene's textures off** (`scene.texturesEnabled`): a standard
  material that is nothing but its textures then draws a black quad. What must read in both views
  carries a colour of its own (a route's chalk) or draws with a `ShaderMaterial`, which samples
  its texture whatever the flag (a contact marker).

## Pointers

- **Pointer events only**; read `event.buttons`. A DOM control over the canvas stops `pointerdown`
  and `pointermove`, lets `pointerup` through, and blurs on click.

## In a browser

- **A browser check uses the Chrome on this machine**: the browser tools can reach the owner's
  other computer too, and both report themselves local; the one on this machine is the one that
  loads its preview server. Where only the other is connected, its tab shows an error page for a
  server `curl` reads; the look is then made headless with this machine's Edge
  (`msedge.exe --headless=new --remote-debugging-port=<port>`, a `--user-data-dir` under `.tmp/`),
  driven over its debugging protocol with Node's own `WebSocket`: `Runtime.evaluate` and
  `Page.captureScreenshot`. A look at a given screen size is made the same way
  (`Emulation.setDeviceMetricsOverride`, a phone's with `mobile: true`): the tools' own tab can
  be zoomed, 307 px wide at a device pixel ratio of 2.5, and resizing its window does not change
  that.
- **A link that names its matchup starts the bout itself**: clicking Fight again restarts it and
  disposes the running world's worker.
- **A hidden tab does not render**: check `document.visibilityState` and that `engine.frameId`
  moves.
- **The Arena's, crowd's and Crypt's worlds are in workers**: `await __arena.step(n)` (or
  `__crowd`, `__dungeon`) steps and draws; `__arena.world.tape()`, `__arena.verdict` and
  `__dungeon.run` read the state.
- **A probe of a page's frames reads the world's time**: `received()` empties on each call and the
  page's frame meter calls it every frame, so a probe reads none of it; `__arena.world.newest[0]`
  is the newest step's time in seconds. Headless Edge draws a frame every 18 ms, so a count of
  frames over 16.7 ms counts them all.
- **A file at one address that names hashed files is fetched with `cache: "no-cache"`** (the art
  list, `assets/generated/manifest.json`): GitHub Pages lets a browser keep a file ten minutes,
  and a list kept from before a publish names files the publish replaced. Their requests fail,
  and a body whose skin does not load is drawn as its plain shapes (`dresserFor`), which looks
  like the Tactical view; the Arena's setup then says so.
- `Material.isReady(mesh)` is false outside a render pass; use `mesh.material`, not
  `scene.materials`; after a hot reload, navigate.

## Tools on Windows

- **PowerShell runs `npm` as `npm.ps1`, which its execution policy refuses** (`Restricted`):
  call `npm.cmd` there, with the same arguments; the policy is left as it is.

- **`git worktree remove` on a worktree with a `node_modules` junction empties the main
  checkout's.** Delete the folder with `npm run clean` (or Node's `rmSync`), then
  `git worktree prune`.
- **`npm ci` cannot run while a dev server holds the native bindings** (`EPERM` unlinking
  `rolldown-binding.win32-x64-msvc.node`), and port 5180's is the owner's: restore a gutted
  `node_modules` with `npm install --no-save`, which installs the lockfile's versions around the
  held files, then check each package's version against `package-lock.json`.
- **A worktree keeps what it played in its own `.cache/evaluations/`**, not the main checkout's,
  so deleting the tree deletes every row it played. Copy that folder (and the tree's `.tmp/`) under
  `research/runs/<task>/` first.
- **A worktree at a commit before `c8dce4e31` reads three `.blend` files as modified**
  (`chamber.blend`, `forge.blend`, `skeleton-source.blend`: plain blobs there, LFS-tracked by the
  attributes Git applies), so its build is "uncommitted" and `evaluate --write` (and `table
  --fresh`, which writes) refuses to keep what it played. `git status --porcelain` shows them;
  `git update-index --assume-unchanged` on the three makes it clean.
- **Python's `open(path, 'w')` writes cp1252**: Vite's build then refuses the file while `tsc` and
  `npm test` pass. Pass `encoding='utf-8'`.
- **Git Bash dies in its own startup at times**, leaving `bash.exe.stackdump` in the repository
  root (every frame in `msys-2.0.dll`, the runtime's fatal-error exit). Many bash launches at
  once or in quick succession are the common thread. A dump's first lines and time, and what was
  running, are read before `npm run clean` deletes it; the remedy left is a newer Git for Windows.
- **A shell rewrites quotes, backticks and `$` in text passed inline** (`node -e`, a heredoc,
  `git commit -m`): an edit script or a commit message is written to a file with the file tool,
  then run or passed by path (`node <file>`, `git commit -F <file>`). One file is edited with the
  edit tool, not a script.
- **A background wait ends on its own**: a watcher loop outlives the tool that started it, so it
  gets a timeout or an exit condition, and its pattern must be able to match (a training run's
  checkpoints are named by decisions, `model-12060672`, not round millions).
- **A saved evaluation result is found again when only the foe's character changed**: a strike
  rung's foe is its body as its character holds its skills (`assets/characters/characters.json`),
  and the key a result is kept by does not hold them. A subject played against a foe holding one
  variation is "found" against a foe holding another and reads the first; play it with `--fresh`.
- **A change to code alone finds the rows played before it**: a row's key holds the question and
  the mind data it loads, not the code (`keyOf`, `run.ts`), so a reading of a code change made in
  place, committed or not, or of a worktree moved from one commit to another, reads the old code's
  rows as the new code's. A records change plays fresh rows; a code change does not. The header
  says it (`0 cases to play, 1200 found`, then "4 of the 1200 rows found from other code played
  again: 3 read as kept", the one other a row the new code no longer plays). An A/B of code is
  read where its header says `0 found`, or with `--fresh`.
