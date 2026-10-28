# Auto-RPG

A browser game of physically simulated, AI-driven melee, after *Die by the Sword* (1998) and
*One Must Fall* (1994).

There is no attack button and no animation. A fighter is a body of jointed segments driven by
muscles with the strength and speed of their anatomy, and a mind decides what the body does. A
blow is whatever one body carries into another, and it wounds by the energy it brings. The bodies
are the Warrior and the Rogue (two humans), the crypt's skeleton, and a four-legged reptile with a
driven jaw.

**[Play it in your browser](https://alexoooo.github.io/auto-rpg/).** The main menu opens the
**Dungeon** (the Crypt), **Arena**, **Lab**, **Ratings** and **Tools** (development viewers).

## Run it locally

Requires Node 22.13.0 or newer (`.npmrc` sets `engine-strict`) and Git LFS for the art
originals. The first asset build downloads pinned local tools; subsequent builds reuse the cache.

```powershell
git lfs install
git lfs pull  # full-quality art originals and shared textures
npm ci        # the exact lockfile
npm run assets # compressed art delivery files
npm run dev   # http://localhost:5180
npm test      # the gate: step cost, the core's boundary, the mind contract, no strays
npm run build # type-check, then the production bundle
```

Each push to `main` is tested, built and published to GitHub Pages (`.github/workflows/pages.yml`).
The [asset pipeline](docs/art/assets.md) owns sources, compression, caching and size reports.

## The Arena

Pick a character for each side (Warrior, Rogue, Skeleton or Reptile) and press **Fight**. You
watch, or take a side under **Play as**: your side then does what you order and nothing else.
A side is out when its wounds end it, or when it stays down past the chosen recovery window. At the
two-minute bell the fuller health bar wins.

| Panel | Chooses |
| --- | --- |
| Attributes | Size, Weight, Strength, Speed, HP; Balance (assist, % of body weight; 0 is unassisted), Haste (leg speed) and Toes |
| Controller | the mind: Duellist (the default), Options fighter, Puncher, Tempo fighter, Vanguard, Kinetic; the Reptile's Crawl and bite. Classic, Counter-puncher and Behaviours are off the menu; a link may still name them |
| Mind | any part of the chosen mind; during a bout, a read-only view of the mind as it fights |
| Loadout | each hand: nothing, a wooden club, a buckler or a short sword |
| Level | Open stage, or Obstacle court (solid columns, tomb and bench) |
| After a fall | keep fighting while fallen fighters try to rise (default), or defeat after 15, 30 or 60 s down, or at the first fall |
| Appearance | the Warrior's skin: Original, Industrial, Steampunk or Futuristic (same body) |
| View | World or Tactical (collision shapes); Free, Isometric or Chase camera; focus |

Under each health bar a body diagram shows each part's health; a short feed names what the
fighter is doing and whether it connected. The bout is heard: footfalls, swings, blows, falls.

| Input | Does |
| --- | --- |
| W A S D or arrows | go, relative to the camera, as fast as the legs hold; Shift walks |
| Pointer | where your fighter faces while it walks |
| Left button | attack the body part under the pointer; hold to keep attacking |
| Left click on the floor | go there |
| Middle or right drag, wheel | orbit and zoom the Free camera |
| Space or Esc | pause and resume |
| R | the same bout again |
| ? | the controls |

Every setting travels in the link, so a bout can be shared or opened directly:

| Parameter | Example |
| --- | --- |
| `matchup` | `?play=arena&matchup=workshop-fighter,crypt-skeleton` (`workshop-fighter`, `workshop-rogue`, `crypt-skeleton`, `reptile`) |
| `control` | `&control=puncher,duellist` |
| `left.loadout`, `right.loadout` | `&left.loadout=buckler,sword` (left hand, right hand) |
| `you` | `&you=left` |
| `level`, `gap`, `cap`, `recovery` | `&level=obstacle-court&gap=3&cap=30&recovery=60` |
| `<side>.<attribute>` | `&left.strength=1.5&right.balance=10` |
| `appearance`, `view`, `camera`, `projection`, `focus` | `&appearance=industrial,relic` |
| `#case=` | a recorded case from the Ratings: its recipe and orders, with its choices in the pickers |

## The Crypt

Choose **Dungeon**, pick a hero (Warrior, Rogue or Skeleton), a level, up to three companions, and
press **Start**. Reach the exit's green ring; the run is lost when the whole party is down.
Everybody carries a club; skeletons and reptile packs wake as the party comes near, and attack as
a mob, spread over the party.

- **Generated depths** (default): rooms and corridors after Diablo's Cathedral.
- **The Rootbound Crypt**: one authored chamber, three skeletons.
- **Random Crypt**: four kit-built chambers from the seed.

| Input | Does |
| --- | --- |
| Click the floor | the selected go there, fighting what they meet; several take places about it at the slowest one's pace |
| Click an enemy | the selected attack it |
| Drag on the floor | the selected walk the drawn route past every foe |
| Right-click the floor, or an ally | the selected face there, or follow that ally |
| Q, E | the selected turn an eighth of a turn left, right |
| H, X | the selected hold where they stand, or stop |
| F | the selected companions come back to the hero |
| 1-4 or a click on an ally, 0 | select a member (Shift adds), or everybody |

Two switches hand movement to the keyboard (WASD steers the one selected, or the hero) and facing
to the cursor; the minds do the rest. **Minds** sets each hero's mind; **Options** holds the seed,
rendering quality, and who leads each side: the party by you or by the level-clearer, an AI that
plays it by itself (`&party=clearer`), and the enemies as a mob or each on its own
(`&enemies=independent`).

## The Lab

**Lab** (`?play=lab`) stands one body and exercises it. Each scenario's settings and
readout sit at the sides; **Character** picks the body, loadout, balance and mind; the transport
pauses, single-steps, scrubs and slows time.

- **Stance**: walk it from the keyboard and shove it.
- **Stand-up**: the owner's falls, on an open floor or against a column, wall, tomb or bench.
- **Attack**: seeded targets for the body's game mind to approach and strike.
- **Locomotion**: courses (circle, line, square, diamond, random destinations) at a set pace, with
  wind; **Gait** picks what moves it.

## Ratings

**Ratings** (`?play=ratings`, also from the Arena) shows every evaluation's kept records
(`assets/evaluations/`) in its task's units: a contest's ratings with their intervals, minds compared
on the kits both have, and the matchup grid; a battery's figures by subject and by any condition.
A subject opens its history across versions and pools and its cases, worst matchups first; a
bout case recorded with its world opens in the Arena to watch. A drill's subject (the Strike drill,
under Skills) shows a square for each trial, a reel of each outcome's trials, and a reel that plays
the failed trials first, and says whether the owner has accepted it. The Arena plays a reel's trials
one after another in place, each as long as it was scored, with auto-play on unless unticked. The
address keeps what is shown: `&evaluation=`, `&pool=`, `&subject=`, `&version=`, `&by=`, `&case=`.

Compare saved versions with `npm run compare -- before.jsonl after.jsonl --subject <id>`;
`--previous <id>` selects a differently named baseline. It reads matched evidence, reports gaps
and changed context, and keeps obsolete implementations in Git history. The
[evaluation architecture](docs/architecture.md#evaluations) defines what a comparison holds fixed.

## Tools

**Tools** (`?play=tools`) opens a separate directory of development viewers. Each page returns
to it through **← Tools**.

- **Control foundation** (`/control-foundation.html`): a pinned reach task, comparing controllers.
- **Physical control tasks** (`/control-tasks.html`): support transfer, a shared bar, point strikes.
- **Character workshop** (`/character-lab.html`): the human models with every loadout.
- **Physics bench** (`/physics-bench.html`): MuJoCo and Rapier on the bake-off's cases
  ([report](research/physics-bakeoff/REPORT.md)).

## Status

Working: the Arena and the Crypt with the Warrior, Rogue, Skeleton and Reptile; clubs, buckler and
sword; fighting on after a fall; the Lab's scenarios. Not yet reliable: getting up from every fall,
finishing a fight decisively, and AI above a single fighter. See [the roadmap](docs/roadmap.md).

## Where things are

| Path | Holds |
| --- | --- |
| `src/core/` | bodies, muscles, motor control, skills, minds and the rules of a fight |
| `src/arena/`, `src/dungeon/`, `src/lab/`, `src/ratings/` | the Arena, the Crypt, the Lab and the Ratings |
| `src/render/`, `src/audio/`, `src/ui/` | drawing, sound and panels the screens share |
| `src/app.ts`, `index.html` | the main menu and routing |
| `src/evaluation/` | evaluations: the match and every question of how well something does; records in `assets/evaluations/` |
| `tests/` | the gate's few contract tests (`node --test`) |
| `research/` | measurement scripts ([README](research/README.md)) |
| `assets/`, `public/assets/` | data the core reads and Blender sources; what the pages load |
| `scripts/` | asset builders and the evaluation runner |
| `docs/` | [architecture](docs/architecture.md), [roadmap](docs/roadmap.md), plans, reference records, [art](docs/art/), [diagrams](docs/diagrams/) |

[AGENTS.md](AGENTS.md) holds the rules for working in this repository.

## Assets and licence

MIT ([LICENSE](LICENSE)); third-party assets keep their own licences. The environment map is Poly
Haven's `kloofendal_43d_clear` (CC0); textures are CC0 maps listed in `src/render/textures.json`;
the humans are customised MakeHuman/MPFB CC0 models ([characters](docs/art/characters.md)); the
skeleton is Blender Studio's CC0 skeleton ([skeleton](docs/art/skeleton.md)); the crypt
([crypt](docs/art/crypt.md)) and the arena's forge kit ([forge](assets/forge/README.md)) are
original, with Blender sources under `assets/`.

## Troubleshooting

- **Port 5180 in use**: an earlier dev server is alive. Find it with `netstat -ano | findstr :5180`
  and stop it with `taskkill /F /PID <pid>`.
- **Black screen while the overlay updates**: the tab is hidden or in the background, and Chrome
  does not paint WebGL there. Bring it to the front.
- **`EBADENGINE` on install**: Node is older than 22.13.0.
