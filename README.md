# Sword prototype

A browser game of physically simulated melee, after *Die by the Sword* (1998) and
*One Must Fall* (1994).

There is no attack button and no animation. A fighter is a body of jointed segments driven by
muscles with the strength and speed of their anatomy; a blow is a club carried into something by
the arm that swings it, and it wounds by the energy it brings. The bodies are the Warrior and the
Rogue, two humans measured from their workshop models, and the crypt's skeleton.

This repository is the whole game. See [AGENTS.md](AGENTS.md) for the working notes.

## Play online

[Play the game](https://alexoooo.github.io/auto-rpg/) in your browser: the link opens the main menu.

GitHub Actions tests and builds each push to `main`, then publishes `dist/` to GitHub Pages
(repository Settings > Pages, source **GitHub Actions**). The workflow builds with
`npm run build -- --base=/auto-rpg/`; public asset URLs follow that base. Local `npm run dev`
serves at `/`.

## The Arena

Pick a body for each side and press **Fight**. Each side carries the wooden club in its right hand
and is driven by its own mind: it walks at the other and, once within reach, attacks the head. A
side is out when its wounds end it or its body falls; at the two-minute bell the fuller bar wins.
You watch: the core has no orders for a person to give a side yet.

| Input | Does |
| --- | --- |
| Middle or right drag | orbit the camera |
| Wheel | zoom |
| Space / Esc | pause, and resume |
| R | this bout again |
| Random replay | at a verdict or in the pause menu -- the right side is redrawn |
| ? | the controls |

A link names its matchup (`?play=arena&matchup=workshop-fighter,crypt-skeleton`) and opens the bout
directly.

## The Crypt

Choose **New Game** from the main menu, pick a hero and a seed, and walk a generated floor of rooms
to the green exit circle. The hero is the Warrior, the companions Rogues, the enemies skeletons,
each with a club. An enemy wakes when the party comes near. The run is lost when the whole party
is down and won when anybody standing reaches the exit.

With both control switches off, click the floor to attack-move, click an enemy to lock on, or drag
to draw a force-move route. **1**-**4** or a click selects a member, **Shift** adds, **0** selects
everybody, and **F** calls the selected companions back.

| Keyboard movement | Mouse facing | Controls |
| --- | --- | --- |
| Off | Off | Mouse orders; the minds face and fight |
| On | Off | WASD/arrows move relative to the screen |
| Off | On | Cursor controls facing |
| On | On | WASD/arrows move, cursor controls facing |

Space/Esc pauses and resumes; focus loss pauses without resuming on its own.

## The other pages

- **The lab** (`?play=lab`, from the main menu): scenarios that stand one core body and exercise
  it -- stance, walks, strikes, blows -- with a Free, an Isometric or a Chase camera.
- **The character workshop** (`/character-lab.html`): the human models, their grips and anatomy.
- **The physics bench** (`/physics-bench.html`): MuJoCo and Rapier under one controller, on the
  bake-off's cases (`research/physics-bakeoff/REPORT.md`).

## Running it

Requires **Node 22.13.0 or newer**. `.npmrc` sets `engine-strict=true`, so an older Node makes
`npm ci` refuse rather than warn.

```powershell
npm ci        # not `npm install` -- exact lockfile, identical on every machine
npm run dev   # http://localhost:5180, strictPort
npm run check # tsc, no emit
npm test      # the core's tests, headless, and the pages' rules
npm run build # production bundle
```

Everything the pages need is committed, so a fresh clone runs with no download step.

## Troubleshooting

**`Port 5180 is already in use`**
An earlier dev server is still alive. Stop it rather than using another port, or you will edit
one server while reading another:

```powershell
netstat -ano | findstr ":5180"
taskkill /F /PID <the pid>
```

**Black screen, but the overlay updates**
Chrome does not paint WebGL in a hidden or backgrounded tab, and the DOM overlay keeps
compositing, so it looks like a broken renderer. Bring the window to the front;
`document.visibilityState` in the console tells you which it is.

**`EBADENGINE` during install**
Node is older than 22.13.0.

## How it is built

**Babylon.js** draws, and **Rapier** (its SIMD build, WebAssembly) simulates. Everything that
fights is built by the core (`src/core/`): a body's spec -- its segments, masses, joints and
muscles -- is built into rigid bodies and joints, and one world step at 120 Hz runs physics,
control, combat and the clock together, on the page and in Node alike.

- **Every number in a spec says where it came from**: a paper, a measurement, an asset or the
  owner's decision, or a named rule over other numbers. Nothing is fitted to feel.
- **Muscles give torques**, bounded by their anatomy's strength and speed; a servo asks the body's
  own dynamics what torque carries a joint where a skill wants it.
- **A mind drives a body only through its command.** A fighter's mind names where to walk, where
  to look and whom to strike; the body's skills carry it out.
- **A blow wounds by the energy it brings**: the masses that meet and their closing speed along
  the contact normal, in a unit set by one searched club blow. A wound takes hit points from the
  part it reaches, and a part can come off.

The engine sits behind an interface (`src/core/engine/`), which is how the bake-off could drive
Havok, MuJoCo and Rapier with one controller; its report chose Rapier.

## Assets

The environment map is `kloofendal_43d_clear` from [Poly Haven](https://polyhaven.com), CC0,
committed as `public/assets/env.hdr`. `public/assets/textures` carries digest-pinned CC0 1K maps,
registered in `src/textures.json`, which `src/materials.ts` reads. The humans are MakeHuman CC0
models (`assets/character-lab/`); the skeleton, the crypt kit and the forge kit are original
generated work, each with its Blender source under `assets/`.

## Status

**Working**: the Arena and the Crypt on the core, with the Warrior, the Rogue and the skeleton,
each armed with a club; the lab's scenarios; the character workshop; the physics bench.

**Next**: the fighters' minds and skills (`docs/plans/2026-09-30-minds-and-skills.md`), rising
from a fall, and orders a person can give a side in the Arena.
