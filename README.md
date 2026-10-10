# Auto-RPG

A browser game of physically simulated, AI-driven melee, after *Die by the Sword* (1998) and
*One Must Fall* (1994).

There is no attack button and no animation. A fighter is a body of jointed segments driven by
muscles with the strength and speed of their anatomy, and a mind that decides what the body does;
a blow is a club carried into something by the arm that swings it, and it wounds by the energy it
brings. The bodies are the Warrior and the Rogue, two humans measured from their workshop models,
the crypt's skeleton, and a small, sprawling reptile with four legs and a driven jaw.

## Play online

[Play Auto-RPG](https://alexoooo.github.io/auto-rpg/) in your browser: the link opens the main
menu, with **Dungeon** (the crypt), **Arena** and **Lab**.

GitHub Actions tests and builds each push to `main` and publishes `dist/` to GitHub Pages
(`.github/workflows/pages.yml`), building with `npm run build -- --base=/auto-rpg/`.

## Run it locally

Requires **Node 22.13.0 or newer**; `.npmrc` sets `engine-strict=true`, so an older Node makes
`npm ci` refuse rather than warn.

```powershell
npm ci        # not `npm install`: the exact lockfile
npm run dev   # http://localhost:5180
npm run check # tsc, no emit
npm test      # the fast tests: the core, the rules and a short bout (npm run test:all: every test)
npm run build # check, then the production bundle
```

Everything the pages need is committed, so a fresh clone runs with no download step.

## The Arena

Choose the standing character on each side (Warrior, Rogue, Skeleton or Reptile) and press **Fight**.
The Warrior also has an **Appearance** selector: Original, Industrial, Steampunk or Futuristic. The three
robot shells keep the Warrior's physics and abilities. The Lab offers the same choices and can
switch skins during playback without restarting the scenario. Arena links keep each side's
appearance in `&appearance=industrial,relic`; Lab links use, for example, `&appearance=duelist`.

The **View** panel switches between the character skins (**World**) and their collision shapes
(**Tactical**). Choose **Free**, **Isometric** or **Chase**, and focus on both fighters or either
side. Isometric offers orthographic and perspective projection; Chase follows one fighter.
These controls work while paused and after the verdict. Links retain the view with `view`,
`camera`, `projection` and `focus` parameters.

Each contender has a **Controller** choice: Classic fighter, **Combat**, **Brawler**, **Scrapper**,
**Kicker (experimental)**, or one made of behaviours: **Behaviours**, **Runner**, **Charger**,
**Left hand only** or **Kicks only (experimental)**. A preset you change in the panel reads
**Custom (from** its preset**)**.
Humanoids choose a wooden club or empty hands.
The Reptile uses **Crawl and bite**, carries no equipment and has 1 HP at 8 kg. It trots toward
opponents, slows for contact, and shifts its weight before placing one paw during close fighting
and withdrawal. It bites reachable body surfaces with its physical jaw.
Try `?play=arena&matchup=workshop-fighter,reptile&held=empty&recovery=continue`.
Its anatomy is an authored estimate; its blunt bite is weak, and fighting effectiveness remains
unqualified against humanoids. [Control checks](docs/reference/reptile.md) cover standing, fast
travel, biting mirror matches, release and recovery. Recovery may take several retries,
particularly from awkward leg positions.
Every humanoid preset is one fighter whose tactics and skills you can change in the Arena's
panel. Classic seeks its foe and strikes by searched recipes; Combat, Brawler, Scrapper and Kicker
choose openings and strike along hand paths on a shared strike cycle, Scrapper fighting from low
support too and Kicker kicking.
A fighter's tactics may instead be **Behaviours**: a ranked list you build in the panel from
following orders, running away, closing in, keeping a distance, striking (with the hand you name),
kicking (with the foot you name) and guarding. Each step the first behaviour that wants the legs,
the attack or a hand has it, so Runner is just "run away, guard" and Left hand only is "strike with
the left, guard". A strike names its blow and a kick its kick, so under Behaviours the fighter has
no Blow, Kick or Low support of its own to set. A kick walks in and kicks the nearest standing
leg within reach; the front kick is slow, and a foe who keeps moving rarely lets it land.
Any of them may throw one of two experimental blows from the punch's research instead: the
driven strike, which turns the trunk flat out behind the arm, or the whole-body strike, one
solve over every muscle at once ([measured](docs/reference/competencies.md#research-blows)).
Against Classic on two Warriors ([384 bouts each](docs/reference/controller-presets.md)), every
preset wins bare-handed (Kicker 1.00, Combat 0.99, Brawler and Scrapper 0.98), all of it at the
time cap, and loses with clubs (Combat 0.24, Brawler 0.12, Kicker 0.10, Scrapper 0.10), often by
a wound. Finishing power remains under evaluation.
**Puncher** is Classic throwing the straight punch: it stands an arm apart, where the foe's head
is eight tenths of its arm's length from its punching shoulder once the punch turns that shoulder
forward, sets its fist on the line to the head, and drives its hips, chest and arm at once at a
pose with the arm straight through the target. Bare-handed it wounds a Warrior standing in guard,
most of it on the chest and the guarding arms.
Brawler is the experimental body-targeting fighter, with measured punch paths, guards and
escapes. Try
`?play=arena&matchup=workshop-fighter,workshop-fighter&control=brawler&held=empty&balance=0`.
Scrapper adds supported low attacks against fallen or rising opponents. Start with two
empty-handed Warriors:
`?play=arena&matchup=workshop-fighter,workshop-fighter&control=scrapper&held=empty&balance=0`.
It creates room for punches, approaches low targets, acquires foot support and returns to
standing. The checks cover both hands; unreachable placements time out and retry. Combat retains the earlier
controller for comparison and replay.
Kicker adds low front kicks with either foot to Scrapper. Start with empty-handed Warriors
and `control=kicker`. It usually punches against moving opponents; its kicks are qualified
against a quiet defender, and stronger competitive fighting remains under evaluation.

**After a fall** defaults to continuing the fight while players try to get up. It can also
select defeat after 15, 30 or 60 seconds down, or on the first fall. The HUD names the
current controller or recovery attempt. Combat, Brawler, Scrapper and Kicker rise with the
reference pose sequence, then verify quiet foot support before resuming walking or attacks.
[Development checks](docs/reference/recovery-cycle.md)
cover Warrior with empty hands and a club; recovery takes about 25-29 seconds in passing cases,
and one tested club fall direction still fails. Arena Classic also attempts the staged rise. Recovery remains imperfect and may need retries.
Try `?play=arena&matchup=workshop-fighter,workshop-rogue&control=scrapper,classic&held=empty&recovery=60`.
These choices travel in links and replays (`control`, `held`, `recovery`).

The circular stone arena is enclosed by a low parapet, with eight braziers around its edge. Each
humanoid starts with a wooden club unless selected otherwise. Its mind walks at the opponent and
attacks its head; the reptile approaches a surface near its mouth. A side is out when its wounds end it or it stays down for the chosen recovery
window, when one is selected. At the two-minute bell the fuller bar wins; equal bars draw.

A blow costs both who meet in it. Any two parts of the two bodies that come together closing
have met in a blow, and the two surfaces share its energy: the softer takes the more. A fist
takes most of its own punch to a head and little of one to a chest. A held weapon is rigid and
costs its holder nothing: what a club strikes takes the whole blow, a bare hand that meets a
club takes all of it, and two clubs meeting wound nobody.

The bout is heard until its verdict: footfalls, the air of a swing, a club on a body or on the
other club, a body against a wall. The verdict silences it, the deciding blow included.

You watch, or you take a side: pick it under **Play as**, or open
`?play=arena&matchup=workshop-fighter,workshop-rogue&you=left`. Your side then does what you
order and nothing else: it does not attack unasked. It turns only while it walks, so walk to
turn; across its heading or backward it walks at half pace.

| Input | Does |
| --- | --- |
| W A S D, or the arrows | walk, as the camera sees the ground |
| Pointer | where your fighter faces while it walks |
| Left button | attack where you point; hold to keep attacking |
| Middle or right drag | orbit the Free camera |
| Wheel | zoom |
| Pause / Resume buttons, or Space / Esc | pause and resume a bout (leaving the window pauses too) |
| R | this bout again |
| Random replay | at a verdict or in the pause menu: the right side is redrawn |
| ? | the controls |

A link can name its matchup and open the bout directly:
`?play=arena&matchup=workshop-fighter,crypt-skeleton` (the bodies are `workshop-fighter`,
`workshop-rogue` and `crypt-skeleton`). It may also say how far apart the two start (`&gap=3`,
metres), how long the bout may run (`&cap=30`, seconds) and what each right hand holds
(`&held=empty` for a bare-handed bout, or `&held=empty,club` left then right) which controller each side
runs (`&control=classic,brawler`), each side's mind as edited in the **Mind** panel under its
controller (`&left.mind=`, written by the panel), and carry a bout's orders after a `#tape=`, which the arena then plays
again by itself.

During a bout, **Mind** under each side's bar opens that side's mind as it fights: who has the
body, which of its parts holds the legs, the trunk and each hand, and the whole of it, read-only.

## The Crypt

Choose **Dungeon**, click a standing character (Warrior, Rogue or Skeleton), choose a **Level**,
and press **Start**. Companions default to **None**; up to three can join. **Options** holds the seed
and the crypt levels' rendering quality. **Minds** chooses each hero's mind as a party member: its
own, a preset, or any of its parts changed. Walk to the exit's green ring. Everybody carries a club; the enemies are
skeletons, built and woken as the party comes near. The run is won when anybody standing reaches
the exit and lost when the whole party is down. What the party sees it hears: footfalls, swings,
blows and falls, nearer ones louder, over the torches and the drips. The **Mind** panel shows the
mind of the enemy under the pointer, else of the enemy the party fights, else of the first selected
member: an enemy's mind is its body's own, shown and never changed.

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

**Lab** on the main menu (`?play=lab`) lists scenarios that stand one body and exercise it:

- **Stance**: walk it from the keyboard (W/S or Up/Down forward and back, A/D or Left/Right
  sideways, Q/E turn while walking) and shove it.
- **Routine**: it walks out, strikes at ten targets hung high, middle and low, turns and walks
  back. Each target is a ball of its own head, and the table says what the blow did to it or how
  near it passed. `&targets=` (0 to 30) and `&seed=` in the address choose how many and which.
- **Run**: it goes round a track as fast as its walk holds.
- **Blow**: it throws a stored blow, the Warrior's strongest club blow or any searched recipe, at
  a target hung where that blow's target stood, a ball of a head or of an upper trunk, and says
  what the blow cost each of the two.

Its sections, each of which folds away, choose the body and its balance, what each hand holds,
boots and armour, its mind (**Preset**: Script carries out the scenario, Guard stands in guard;
any of its parts may be changed, among them what has the body once it is down: the staged rise gets
the Warrior up from most falls, with the club or without) and the strikes it may throw, the camera
(Free, Isometric or Chase), the view, and 120 or 480 Hz; one shows the mind as it goes and logs
what it decides.
The transport pauses (Space), steps one physics step at a time, scrubs, and slows time to 1/4 or
1/10.

The body is heard: its footfalls, its landing when it falls, a shove, the air of a swing and the
club on the head. A replay sounds as the run did; paused, scrubbing or seeking, the page is
silent. The volume is at the end of the transport, and a browser plays nothing until the page has
had a click or a key.

## The other pages

- **Control foundation** (`/control-foundation.html`, linked from the Lab): compare direct
  actuator feedback with the layered servo on a pinned reach task. Step, save, restore and
  verify replay on any of the three bodies. This is a controller/research fixture, not a test
  of standing or combat.
- **Physical control tasks** (`/control-tasks.html`, linked from Control foundation): watch any
  body transfer support between its feet, move one shared bar and release either hand, or
  strike a fixed target with either hand or independent clubs and return after a hit or miss.
  Play, step, save and verify replay use the same tasks as the research runner. These controlled
  experiments do not yet demonstrate getting up or fighting an opponent.
- **The character workshop** (`/character-lab.html`): the Warrior's and Rogue's workshop models
  with every loadout and their authored preview motion. Drag to orbit, right-drag to pan, scroll
  to zoom; **Inspect grip** frames the equipped hand.
- **The physics bench** (`/physics-bench.html`): MuJoCo and Rapier under one controller, timed on
  the bake-off's cases ([the report](research/physics-bakeoff/REPORT.md)).

## Status

**Working**: the Arena and the Crypt on the core, with the Warrior, the Rogue and the skeleton,
with empty hands or a club; the reptile with its crawl and jaw; the lab's scenarios; the character
workshop; the physics bench. Generated crypt rooms mix skeletons and three-reptile packs.
Arena bouts continue after falls by default: fighters attempt recovery, and Scrapper can
attack low while an opponent is down or rising. Warrior fists are the measured low-combat scope.

**Not yet**: reliable recovery across every body and fallen pose, decisive finishing by the
new combat controller, turning on the spot, weapons beyond the club, and the AI above a single
fighter's mind. See
[the roadmap](docs/roadmap.md).

## Where things are

| Path | What it holds |
| --- | --- |
| `src/core/` | the core: specs, bodies, muscles, motor control, skills, minds and the rules of a fight |
| `src/arena/`, `src/dungeon/`, `src/lab/` | the Arena, the Crypt and the Lab |
| `src/render/`, `src/audio/` | what the screens share: bodies drawn, surfaces, post-processing; sound |
| `src/character-lab/`, `src/physics-bench/` | the character workshop and the physics bench |
| `src/app.ts`, `index.html` | the main menu and the screens' routing |
| `tests/` | `node --test` suites; `tests/harness/` stands a body headless |
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
skeleton ([docs/art/skeleton.md](docs/art/skeleton.md)); the crypt's chamber and kit
([docs/art/crypt.md](docs/art/crypt.md)) and the arena's forge kit
([assets/forge/README.md](assets/forge/README.md)) are original generated work, each with its
Blender source under `assets/`.

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
