# Auto-RPG

A browser game of physically simulated, AI-driven melee, after *Die by the Sword* (1998) and
*One Must Fall* (1994).

There is no attack button and no animation. A fighter is a body of jointed segments driven by
muscles with the strength and speed of their anatomy, and a mind that decides what the body does;
a blow is a club carried into something by the arm that swings it, and it wounds by the energy it
brings. The bodies are the Warrior and the Rogue, two humans measured from their workshop models,
and the crypt's skeleton.

## Play online

[Play Auto-RPG](https://alexoooo.github.io/auto-rpg/) in your browser: the link opens the main
menu, with **New Game** (the crypt), **Arena** and **Lab**.

GitHub Actions tests and builds each push to `main` and publishes `dist/` to GitHub Pages
(`.github/workflows/pages.yml`), building with `npm run build -- --base=/auto-rpg/`.

## Run it locally

Requires **Node 22.13.0 or newer**; `.npmrc` sets `engine-strict=true`, so an older Node makes
`npm ci` refuse rather than warn.

```powershell
npm ci        # not `npm install`: the exact lockfile
npm run dev   # http://localhost:5180
npm run check # tsc, no emit
npm test      # the core's tests, headless, and the pages' rules
npm run build # check, then the production bundle
```

Everything the pages need is committed, so a fresh clone runs with no download step.

## The Arena

Pick a body for each side (Warrior, Rogue or Skeleton) and press **Fight**. Each side carries a
wooden club in its right hand and is driven by its own mind: it walks at the other and, once within
reach, attacks the head. A side is out when its wounds end it or its body falls; at the two-minute
bell the fuller bar wins, and equal bars draw. You watch: there are no orders for a side yet.

| Input | Does |
| --- | --- |
| Middle or right drag | orbit the camera |
| Wheel | zoom |
| Space / Esc | pause and resume a bout (leaving the window pauses too) |
| R | this bout again |
| Random replay | at a verdict or in the pause menu: the right side is redrawn |
| ? | the controls |

A link can name its matchup and open the bout directly:
`?play=arena&matchup=workshop-fighter,crypt-skeleton` (the bodies are `workshop-fighter`,
`workshop-rogue` and `crypt-skeleton`).

## The Crypt

Choose **New Game**, then the dungeon, your hero (Warrior, Rogue or Skeleton), up to three
companions and a seed, and walk to the exit's green ring. Everybody carries a club; the enemies are
skeletons, built and woken as the party comes near. The run is won when anybody standing reaches
the exit and lost when the whole party is down.

The dungeons:
- **Generated depths** (the default): a floor of rooms and corridors after Diablo's Cathedral.
- **The Rootbound Crypt**: one authored chamber and three skeletons.
- **Random Crypt**: four authored-kit chambers, generated from the seed.

With both control switches off, click the floor to attack-move, click an enemy to lock on, or drag
to draw a force-move route. **1**-**4** or a click selects a member, **Shift** adds, **0** selects
everybody, and **F** calls the selected companions back.

| Keyboard movement | Mouse facing | Controls |
| --- | --- | --- |
| Off | Off | Mouse orders; the minds face and fight |
| On | Off | WASD/arrows move the hero relative to the screen; the mind faces and attacks |
| Off | On | The cursor sets the hero's facing; the mind explores, moves and attacks |
| On | On | WASD/arrows move, the cursor faces; attacks are automatic |

The wheel zooms. Space/Esc pauses and resumes, **?** shows the controls, and losing focus pauses
without resuming on its own.

## The Lab

**Lab** on the main menu (`?play=lab`) lists scenarios that stand one core body and exercise it:

- **Stance**: walk it from the keyboard (W/S or Up/Down forward and back, A/D or Left/Right
  sideways, Q/E turn while walking) and shove it from the panel.
- **Routine**: it walks out, strikes three times, turns and walks back.
- **Run**: it goes round a track as fast as its walk holds.
- **Blow**: it swings the club blow that sets the damage unit into a head.

The panel chooses the body, what each hand holds, boots and armour, the camera (Free, Isometric or
Chase), the view, and 120 or 480 Hz. The transport pauses (Space), steps one physics step at a
time, scrubs, and slows time to 1/4 or 1/10.

## The other pages

- **The character workshop** (`/character-lab.html`): the Warrior's and Rogue's workshop models
  with every loadout and their authored preview motion. Drag to orbit, right-drag to pan, scroll
  to zoom; **Inspect grip** frames the equipped hand.
- **The physics bench** (`/physics-bench.html`): MuJoCo and Rapier under one controller, timed on
  the bake-off's cases ([the report](research/physics-bakeoff/REPORT.md)).

## Status

**Working**: the Arena and the Crypt on the core, with the Warrior, the Rogue and the skeleton,
each armed with a club; the lab's scenarios; the character workshop; the physics bench.

**Not yet**: rising after a fall (a fallen body is out), orders a person can give a side in the
Arena, weapons beyond the club, and the AI above a single fighter's mind. See
[the roadmap](docs/roadmap.md).

## Where things are

| Path | What it holds |
| --- | --- |
| `src/core/` | the core: specs, bodies, muscles, motor control, skills, minds and the rules of a fight |
| `src/arena/`, `src/dungeon/`, `src/core-lab/` | the Arena, the Crypt and the Lab |
| `src/character-lab/`, `src/physics-bench/` | the character workshop and the physics bench |
| `src/app.ts`, `index.html` | the main menu and the screens' routing |
| `tests/` | `node --test` suites; `tests/harness/` stands a core body headless |
| `research/` | measurements of the core and the physics bake-off ([README](research/README.md)) |
| `assets/` | data the core reads (rigs, envelopes, strikes) and the art's Blender sources |
| `public/assets/` | what the pages load: models, maps, the environment map |
| `scripts/` | asset builders (Blender) and measurement scripts |
| `docs/` | [architecture](docs/architecture.md), [roadmap](docs/roadmap.md), [art](docs/art/), plans and reference records |

[AGENTS.md](AGENTS.md) holds the rules for working in this repository.

## Assets

The environment map is `kloofendal_43d_clear` from [Poly Haven](https://polyhaven.com), CC0,
committed as `public/assets/env.hdr`. `public/assets/textures/` carries digest-pinned CC0 1K maps,
registered in `src/render/textures.json`. The humans are customized MakeHuman/MPFB CC0 models
([docs/art/characters.md](docs/art/characters.md)); the skeleton is Blender Studio's CC0 realistic
skeleton ([docs/art/skeleton.md](docs/art/skeleton.md)); the crypt's chamber and kit and the
arena's forge kit are original generated work, each with its Blender source under `assets/`
([docs/art/crypt.md](docs/art/crypt.md)).

## Troubleshooting

**`Port 5180 is already in use`**: an earlier dev server is still alive. Stop it rather than using
another port, or you will edit one server while reading another:

```powershell
netstat -ano | findstr ":5180"
taskkill /F /PID <the pid>
```

**Black screen, but the overlay updates**: Chrome does not paint WebGL in a hidden or backgrounded
tab, and the DOM overlay keeps compositing, so it looks like a broken renderer. Bring the window to
the front; `document.visibilityState` in the console tells you which it is.

**`EBADENGINE` during install**: Node is older than 22.13.0.

## Licence

MIT ([LICENSE](LICENSE)). Third-party assets keep their own licences, as above.
