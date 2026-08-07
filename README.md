# auto-rpg

An isometric auto-battler where you give rough directions and your character
fights for itself — and where character stats are wired into the AI rather than
into damage numbers. Levelling intellect literally makes your character think
more often; levelling perception literally widens and sharpens what it sees.

Two frontends over one simulation: a browser game, and a headless lab that runs
the identical simulation as fast as the machine allows.

## Status

Milestone 2: playable. The headless sim came first on purpose — the simulation,
the agent boundary, determinism and the experiment harness are the parts that
would have been shaped wrongly by a renderer arriving early.

There is now a browser build: a generated dungeon, one character, and you click
where you want it to go. Nothing in the page does the walking. The click becomes
a standing `Order::Goto` in the sim's player-input channel, and the character's
own utility AI works out how to get there — round the masonry, when to brake, and
that a click in the rock means "as close as a body can stand". You are giving
directions to something that decides for itself, which is the whole game.

The level is 48 by 32, carved into rooms and three-wide corridors, with the
opposition already standing in it and a way out at the far end. Kill everything
and the portal opens; walk into it and the next floor is generated, deeper and
better attended, with your character carried down whole. See "The floor plan" in
`DESIGN.md` for why a grid, why three tiles wide, and why routing is something
the sim is *asked* for rather than something it works out for itself.

And the rock stops eyes, not only bodies. Neither side engages through a wall, so
a monster comes *round* one rather than walking into it, and losing sight keeps
the hunt rather than ending it — bounded by `HUNT_RANGE`, eighteen units measured
along the route, because without a bound everything on the level converges on
tick one and a floor arrives as one brawl held in a large room. A blow that would
have to cross masonry does not land either: not being able to *see* something and
not being able to *hit* it are different claims, and only the second one stops the
Brute's axe, which is long enough to reach across a one-tile wall by 0.15.

And there is something to fight. `S` and `B` send in a skitterer or a brute, and
the fight runs itself under the same policies the lab evolves — no set piece, no
script. Your character opens on the **Duelist** and the monsters on the naive
`UtilityPolicy` it is measured against, and either side can be handed the other
from its own rail.

And a click is a command, not a suggestion. The feet obey a live `Goto` in the
middle of a fight while the hands go on targeting and swinging, so a character
walked out of a doorway it is losing in covers the walk as it leaves. Arrival
hands the feet back, and so does *Stand down*, which is a `Goto` at your own feet.
The wounded character obeys too: somebody who clicks while it is hurt is answering
the same question `caution` was about to answer, and the player wins.

That is a correction, and for a while it read as a pathfinding bug. `Order::Goto`
was consulted in exactly one place per policy, and that place is only reached when
nothing is in sight — so in a dungeon, where something always is, the player's
input channel had no effect during a fight at all. The route the sim was being
asked for was computed on every observation and thrown away. It was never wrong.
It was never asked.

And a drag is a path. Trace one across the floor and it becomes a queue of
waypoints — sampled about every 1.2 world units, 24 legs at most — walked in
order and held on the last; a tap is still the plain click this game has always
had, and the next plain click cancels whatever is left. Mouse, pen and finger are
one path through pointer events rather than three. Every leg is a standing
`Order::Goto` and not a rail, so it is still the character deciding how to walk
it — and the queue lives in the browser crate rather than in the sim, because one
standing order per faction is a contract and not a limitation.

And you can lose. When your character falls the room does not reset: the things
that killed it are still standing exactly where they were, and you send in a
replacement — `1` for a fighter, `2` for a rogue — to walk into the fight in
progress. Which is worth choosing rather than defaulting. A rogue thinks every
ten ticks instead of twelve and sees 14.4 units instead of 9.6, and falls over at
52 health instead of 84; the same policy runs both. Watching the same room go
differently is the shortest demonstration this project has that stats are wired
into the AI rather than into a damage number.

And they fight with **one hand**, holding one thing at a time. Inspired by *Die
by the Sword*, in 2D: a body is a size and a stat sheet, and what it fights with
is a separate choice -- a **loadout** of up to two actions, one of them in hand.
A blade takes a **line** and a **release** and runs four phases against them --
guard, windup, strike, recovery. An attack therefore *announces itself*: a
Brute spends 33 ticks with its axe cocked back before the blade is dangerous,
which is two or three chances for a Fighter to notice and answer, and none at all
for another Brute. Past the telegraph the cut commits and the line freezes. Miss,
and the recovery is a window in which the hand can do nothing at all.

That shape is deliberate and it replaced something worse. When an agent could
command the blade's bearing every tick, the optimal play — for a policy, for
evolution, and for a person with a mouse — was to hold the sword out and spin it.
Not because windmilling was strong, but because there was no instant at which an
attack *began*, and so no instant at which one could be read, dodged or punished.
Only a striking blade deals damage now, so a blade rotating outside its window is
furniture.

Damage is the blade's **kinetic energy** where it happens to connect — ½mv², with
the speed falling out of `spin × arm` — so every weapon hits hardest at the tip,
every weapon has a radius inside which it cannot hurt anyone at all, and what
happens between those two is a square rather than a line. A Brute's blow is worth
five times as much at the end of its arc as it is to a Fighter pressed against its
chest, and the first two fifths of its haft are not worth swinging at all. That is
what gives a light fighter something to do about a heavy one — and **where an
enemy's blade stops being dangerous is now something you have to judge**, blurred
by perception like everything else you can see, rather than something a policy is
told.

So there is a second mind to choose from, and it is the one your character
arrives with. The **Duelist** scores eight competing stances every time it is
allowed to think — close, trade, circle to the guard's blind side, step off the
swing plane, brace the shield on the line the blade will actually arrive along,
punish a recovery, feint, break off — and picks one, with hysteresis so it
commits instead of dithering.

It is also **a mind per thing you can hold**, which is what makes the loadout a
decision about footwork and not only about damage. A blade closes and keeps
station. A guard *never* closes — there is nothing on the other side of that walk
it could spend the ground on — and it steps out of a declared cut when there is
time to clear the arc, standing to catch the ones there is not. Legs run *away*;
that is the whole of what legs are for, and the fighter that wants to close does
it holding the blade.

Which is worth being precise about, because the sim has an opinion here that
contradicts the intuition. A blow is worth ½mv² at the radius it lands on, so
every blade hits **hardest at the tip** — backing off a step slides the contact
outward and makes the blow *worse*. There is no safe half-measure in giving
ground: either you clear the arc or you should not have moved. Both of those are
the same line of code, and it is a comparison rather than a preference.

Give that one policy three character sheets, change nothing else, and point all
three at the same Brute:

| wits            | wins | health it finishes on |
|-----------------|-----:|----------------------:|
| int 1 / per 1   |  35% |                  0.08 |
| int 8 / per 6   | 100% |                  0.56 |
| int 19 / per 18 | 100% |                  0.65 |

Same body, same weights, same opponent. A dull swordsman loses about two fights
in three and finishes the ones it wins on fumes; a capable one wins at the cost
of half of itself; a sharp one wins every time and pays a third. **That range is
the whole claim** — levelling intellect is
not a damage multiplier, it is thinking more often, and levelling perception is
not a sight radius, it is knowing where the blade will be.

And bodies have weight now. A character does not reach its walking speed on the
tick it is told to, or stop on the tick it is told to: it needs about a quarter
of a second either way, which works out to a body's width of ground before it
comes to rest. That one change moves spacing from a question about *position* —
stand at the right distance and you were safe, arbitrarily late — to a question
about *commitment*, because where a fighter will be shortly is already mostly
decided. Bodies also collide by mass rather than politely splitting the
difference, so a Skitterer can no longer shoulder a Brute off its feet.

It cost the top of the ladder something, and honestly: a sharp swordsman used to
finish on 0.82 and now finishes on 0.65, because being nearly untouchable
depended on stepping out of an arc *after* reading it, and now stepping takes
time. Dodging lost ground to blocking and out-tempoing. That is the physics
being right rather than a regression to tune away.

Two reads carry most of it. A declared cut travels along a line, and a line can
miss — so the duellist replays the cut it can see and asks whether it is even
aimed at it before deciding to defend. And a guard has *mass*: a shield still
travelling toward the bearing a blow lands on stops a fraction of what a planted
one does, so answering a telegraph early is worth something and answering it late
is worse than not answering at all.

Weapons have weight too, and it is worth being precise about what that buys,
because it is not the obvious answer. It buys **no damage at all** — not a little,
none, and the cancellation is exact. A swing is a fixed torque over a fixed arc,
so the work is the same whatever you are swinging; and the ceiling that stops a
light weapon short is how hard you can *hold on* to it, which goes as mass times
lever and cancels the mass in ½mv² term for term. Double the axe and it arrives
proportionally slower carrying exactly the same energy. Measured across a roster
whose weapons span 2.6× in mass, blade energy came out at 0.0395, 0.0383 and
0.0393 for three of the four.

What weight buys is **momentum**, where nothing cancels it — and the biggest lever
on it is not the weapon at all, it is the body being hit. One identical Brute cut
sends a Skitterer seven of its own body-widths and moves another Brute a
fourteenth of one: a hundredfold spread, where in damage it is the *same blow*.
Being heavy is a defence that no stat buys and no skill answers.

The two do not rank the roster the same way either, which is why both are in the
observation. A Skitterer's knife is dense and hafted well forward and its wielder
is feeble, so it shoves better than it cuts — a fighter that guessed how far
something would throw it from how much it hurt would guess wrong in the one
matchup where the answer matters most.

The same collision decides what happens to the two arms. Catch an axe on a
buckler and the axe barely notices while your guard is thrown wide open; catch a
knife on a tower shield and the knife comes off it hard enough to be punished.
Both numbers fall out of one calculation from the two moments of inertia, so
they cannot contradict each other — which the pair of hand-set constants they
replaced very much could, and did: the old rule had a Rogue disturbing a guard
nearly four times as hard as a Brute.

And being stopped costs *ground*. A blade reversed by a shield in a single tick
is a shove no footing holds, so a blocked cut staggers the fighter who threw it
half a walking pace out of position. A clean swing costs nothing — static
friction, the same reason a swordsman does not slide across the floor when they
cut.

The fighter who pays most for that is not the one you would guess. Recoil is a
ratio — your weapon's mass against your body's — so the **heaviest** character in
the game is the one its own axe moves least, four hundredths of a body radius,
and the lightest is a Skitterer whose dense, forward-hafted knife costs it 1.6 of
its own radii on one committed cut: four fifths of its own width, forty times what
the Brute pays. A Skitterer that swings is a Skitterer that is somewhere else
afterwards. Its fighter can see that number before it commits, which is the whole
point of it being in the observation.

Walking into somebody splits on the mass ratio too, so how much the other body
weighs relative to yours is a thing your character can now judge — badly, if its
perception is poor, since a Brute is denser than it looks and a Skitterer lighter.
What it does *not* get is a body-check. That was built and measured and taken back
out: shoving only beats swinging where swinging has stopped working, and in this
roster it never quite does, because bodies are wider than the gap. A Brute with a
Skitterer pressed against its chest is down to a seventh of its best blow and that
is still better than a shove.

And you can take over. Three independent switches, `C`, `V` and `X` —
**Movement**, **Action** and **Aim**: the feet, the choice of what to hold, and
the attack. WASD steers; the mouse aims the line and **click to cut** — one
click, one attack, with the same windup and the same recovery the AI pays. `1`
and `2` change what is in your hand, and the swap costs the same ticks it costs
the AI. Whichever of the three you do not hold, the AI keeps doing — on its own
reaction clock, because that is a stat.

Independent means all eight combinations, including the interesting one:
**Aim** without **Action** hands you the cuts and leaves the weapon to the
character, so you are throwing blows something else decided to arm you for.

And the number matches. `web.wasm` and the native lab produce the *same 64-bit
state hash* for the same run — `0x00b48ceb21081d1d` — so the fixed-point
simulation really is bit-identical across MSVC x86-64 and wasm32, rather than
merely designed to be.

![The room, mid-walk](web/media/screenshot.jpg)

The destination marker stays dim until the character actually acts on the click.
That gap is up to twelve ticks, and it is not input lag — it is the intellect
stat, which is the same number the HUD is showing you.

And you see what your character sees. The floor is remembered once looked at:
black where it has never been seen, dim where it has been and is not now, lit
where it is in sight, and a descent forgets all of it. A monster that steps behind
rock does not blink out — it fades over about 400 ms and leaves a dashed outline
for another two seconds, at the pose it was last in rather than at the position it
actually has, because an outline tracking a body through stone is a wallhack with
a fade on it. Two things ignore the fog on purpose, and both read as bugs if
nobody says so: the portal is drawn whether you have seen it or not, since knowing
where the exit is from the moment you arrive is what turns "kill everything" into
"fight your way there", and `left N` counts every monster alive, because it is the
level's clear condition and not a perception.

`G` cycles three views, or the selector beside **Keys**. `[regular]` is the room
as it looks: a 2:1 isometric room, where the rock stands up as blocks with a lit
top and shaded sides, bodies are upright billboards planted on flat ground
shadows, and something standing behind a block is behind it. `[tactical]` drops
the art — silhouette, head, drop shadow, body gradient, flagstones, the vignette —
for a disc and a facing wedge on flat ground, and keeps every readout: limb, reach
rings, vision discs, health, arrows, damage numbers, callouts, trail, destination,
route and portal. `[dev]` is tactical bodies with no fog at all and the tick strip
open, which is one intent stated once instead of twice — the chevron button that
used to open that strip is gone. Both of those are the same room seen flat from
above, and staying top-down is deliberate rather than unfinished: they are the A/B
control for the isometric conversion, so anything that changes in one projection
and not the other is something the projection did. The scale grid, one line every
four units, stays in all three — under iso it runs on the tile diagonals, which
are those same world lines seen from the new angle.

And `Space` freezes it, or the button beside **driving**. The world stops and
nothing else does: rendering, the camera, the zoom, the hover readouts and *every
order control* keep working, so a room can be read over and handed a path while it
is standing still. In a game whose only input is a standing order, a pause you
cannot give orders during would be a screenshot.

## Layout

```
crates/fx       deterministic math: 16.16 fixed point, vectors, angles, PCG32
crates/sim      the game: world, tick, observations, actions, replay
crates/policy   agent policies + the run harness
crates/lab      headless experiment CLI
crates/web      the browser boundary: a hand-rolled wasm ABI, no wasm-bindgen
web/            the page you click on: vanilla HTML, CSS and JS, no build step
tools/          the sine table generator, a dev server, the wasm/native check
docs/plans/     working plans, updated in place as sessions complete
```

Nothing in the workspace has an external dependency. Parallelism is
`std::thread::scope`, argument parsing is forty lines, and the sine table is
committed as source. That is not minimalism for its own sake: this project's
central claim is that a run is reproducible forever, and every dependency is
something that can change behaviour underneath that claim.

## Getting started

To play it:

```
rustup target add wasm32-unknown-unknown          # once
node tools/serve.js                               # builds the wasm, serves the page
```

Then open the printed URL. Click to send the character somewhere, or drag to trace
it a path; right-click or `Esc` to make it hold its ground; `F` to withdraw the
order entirely and watch it decide for itself; `S` and `B` to send in a skitterer
or a brute; `1` and `2` to choose which of the two things you are carrying is in
your hand; `C`, `V` and `X` to take its movement, its choice of kit or its aim; `E`
for the Hero rail, which stays live after your character falls so you can dress the
next one — and keeps the attributes you set rather than handing them back to the
archetype; `Space` to freeze the world; `G` to cycle how the room is drawn; the
wheel to zoom; `R` to open a fresh room. The `?` in the corner holds the same list,
kept in the page rather than here. A server is needed because a `file://` page
cannot instantiate wasm — that is the only reason.

The room is the page. The camera is centred on your character and clamped to the
walls, so walking into a corner stops the view rather than showing you the void
past it — and everything that is worth reading but not worth watching lives
behind `Tab` instead of in a sidebar that used to leave the arena a postage
stamp on a 1080p display.

To work on it:

```
cargo test                                        # 393 tests, a couple of seconds
cargo run --release -p lab -- bench   --seeds 2000
cargo run --release -p lab -- verify  --seeds 200
cargo run --release -p lab -- duel    --seeds 400
cargo run --release -p lab -- hash
cargo run --release -p lab -- evolve  --gens 30 --pop 24 --seeds 8 --policy duelist
node --test tools/wasm_check.js                   # wasm must equal native
```

`verify` is the interesting one: it runs a batch of fights, re-runs each of
them, replays each of them, and requires all three to agree bit for bit.

`duel` is the newest one, and it exists so that "a clever policy can beat a
brute" is a measurement rather than an opinion. It runs one-on-one across many
seeds and reports not just a win rate but *how* the fight was won — blows,
blocks, parries — because two policies can post the same win rate by completely
different means, and only one of them is swordsmanship. There is a fuller matchup
sweep behind `cargo test --release -p policy --test duel -- --ignored --nocapture
sweep`, which prints every archetype pairing under every policy.

`wasm_check` is the other one. It instantiates the wasm module under Node and
asserts five hashes against numbers recorded from a native build — one from a
canned 4v6 fight, one from a scripted click-and-walk, one from a monster sent
into the room and fought to a finish, one that runs on past the character's
death to the replacement coming in on its recycled entity slot, and one that
puts an arrow in the air, which is the only one of the five that exercises the
projectile arithmetic at all. If any of them
moves, the claim this whole architecture is built to support has stopped being
true, and the failure message says so rather than making you work it out.

Measured on a 20-thread desktop:

```
200 runs verified: identical on re-run and exact on replay

running 2000 rollouts of 4v6 across 20 threads
fitness  n=2000   mean=60.4570  min=2.8316  p25=8.4250  med=11.9616  p75=132.2336  max=151.6629
outcomes 821 wins, 1115 losses, 64 draws, 0 mutual (41% win rate, 921 ticks avg)
throughput 5404 rollouts/s, 4979831 ticks/s, 2816563 decisions/s (0.37s wall)
```

Five million simulated ticks per second, and every one of them reproducible.

That number carried one asterisk, and `bench --carved` exists to remove it.
Every scenario the lab iterates stands on an open rectangle, and `Dungeon::sees`
is `!carved || raycast(..)` — so not one of those five million ticks has ever
walked a ray. The build you actually play carves rooms and corridors, where that
short-circuit is false and sight costs a DDA per pair per decision. `--carved`
points the same bench at a generated dungeon, on one thread unless told
otherwise, because the figure worth having there is per-core: a browser frame
gets one core and needs sixty ticks out of it.

```
running 200 rollouts of a carved depth-5 dungeon, 3600 ticks each, across 1 threads (utility)
throughput 117 rollouts/s, 199613 ticks/s, 178368 decisions/s (1.71s wall)
```

Two hundred thousand ticks a second on one core with the walls in — against
185–201k across repeated runs of the same 4v6 skirmish on one thread. Nine
bodies casting real rays cost, within the noise of the measurement, what ten
bodies short-circuiting do. Both numbers are worth keeping and they answer
different questions: 4.98M is what the whole machine does when it is grinding
rollouts for `evolve`, and 200k is what one core does on the floor plan the
game ships — about 3,300x the sixty ticks a second a frame budget asks for.

## The three decisions everything else follows from

**The sim has no engine in it.** `crates/sim` depends on `crates/fx` and
nothing else — no Bevy, no window, no threads, no clock, no I/O. A renderer will
be a separate crate that reads snapshots. This costs a little glue and buys:
tests that run in microseconds, ten thousand rollouts as one `chunks_mut`,
renderer swappable (or absent) forever, and engine version churn that never
reaches gameplay code.

**No floating point in the simulation.** IEEE-754 makes `+ - * /` and `sqrt`
bit-exact everywhere, but `sin`/`cos`/`exp`/`powf` are libm implementations and
the libm in a wasm binary is not the one in your platform's C library. One ULP
is enough to diverge a fight. So the sim is 16.16 fixed point with a committed
sine table, and it is bit-identical on every target by construction.

**Replays record actions, not seeds.** The obvious design logs the seed and
re-runs the policies. That works until a policy is a neural network, and then a
wasm SIMD matmul and a native AVX matmul disagree in the last bit, an `argmax`
flips, and the replay diverges from the run it claims to reproduce. Recording
decisions means playback never runs inference at all — so the portability
requirement lands only on the sim, which genuinely is portable, and the policy
is free to be as unportable as it likes.

## The agent boundary

```rust
loop {
    for id in world.pending_decisions() {   // whose decision clock is due
        let obs = world.observe(id);        // what they can perceive
        world.submit(id, policy(obs));      // what they chose to do
    }
    world.step();                           // advance one tick
}
```

`Observation` in, `Command` out. A hand-authored utility AI, a neural policy, a
recorded log and a human all enter through the same door, and the sim cannot
tell them apart. The player's "rough directions" are just another field on the
observation — a standing `Order` per faction that agents interpret with whatever
wits they have.

## Stats drive the AI, not the network

| Stat | Effect |
|------|--------|
| intellect | ticks between decisions (20 → 1, so 3/second up to 60/second) |
| perception | sight range, positional noise, how well it can read an enemy's blade |
| agility | movement speed, and how hard and fast a hand can be swung |
| power | multiplier on impact speed |
| vitality | health |

One trained policy will serve every character build. A dim character is not
running a worse network — it is running the same network on a blurrier picture,
less often. That is legible on a character sheet, cheap to balance (these are
knobs, not retraining runs), and it gives the lab an obvious axis to sweep.

Perception earned a second job when combat became geometric, and the split it
settled into is the interesting part. *That* an enemy is winding up arrives
**exact** — a blade hauled back over a shoulder is not a subtle cue, and anyone
can see a blow is coming. *When* it lands and *along which line* are blurred
hard: at `perception 0` the timing read is off by about twelve ticks against a
Brute's thirty-three-tick telegraph. A dim character is not blind to the attack.
It is late, and it guesses the line wrong, which is a much more interesting way
to lose than not noticing.

## Where this goes next

1. ~~A renderer over the sim, then the wasm build.~~ Done — `crates/web` and
   `web/`, about two hundred lines of Rust and one page, no dependencies either
   side.
2. ~~`lab hash` from wasm; the number must match native.~~ Done, and it does.
   `node --test tools/wasm_check.js`.
3. A tiny fixed-size MLP behind the same `Policy` trait, trained by the
   evolution loop that already exists. The feature vector it will be frozen
   against is already there and already versioned, and it now carries what a
   defender needs to answer a swing rather than only what a walker needs to find
   one.
4. Stance scoring that knows about time-to-kill. The Duelist's weakest matchup is
   a Skitterer against a Brute, where it loses to the baseline badly: with a
   2.4-damage weapon against a 132-health target it needs some fifty-five blows,
   and every defensive stance it chooses costs tempo it cannot afford. Nothing in
   the scoring can see that, which is a real limitation rather than a tuning
   accident — `lab duel` measures it and the sweep prints it.
5. Per-unit orders. An order is currently per-faction, which is exactly right
   for one hero and obviously wrong for a party — and it is why the page refuses
   to put a second character in the room rather than have one click send both.
6. Spatial partitioning, when a scenario needs hundreds of entities rather than
   dozens. Not before.

See [DESIGN.md](DESIGN.md) for the rules that keep the determinism guarantee
true.
