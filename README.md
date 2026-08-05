# auto-rpg

A top-down auto-battler where you give rough directions and your character
fights for itself — and where character stats are wired into the AI rather than
into damage numbers. Levelling intellect literally makes your character think
more often; levelling perception literally widens and sharpens what it sees.

Two frontends over one simulation: a browser game, and a headless lab that runs
the identical simulation as fast as the machine allows.

## Status

Milestone 2: playable. The headless sim came first on purpose — the simulation,
the agent boundary, determinism and the experiment harness are the parts that
would have been shaped wrongly by a renderer arriving early.

There is now a browser build: an empty room, one character, and you click where
you want it to go. Nothing in the page does the walking. The click becomes a
standing `Order::Goto` in the sim's player-input channel, and the character's own
utility AI works out how to get there, when to brake, and that a click inside a
wall means "as close as a body can stand". You are giving directions to something
that decides for itself, which is the whole game.

And there is something to fight. `S` and `B` send in a skitterer or a brute, and
the fight runs itself under the same `UtilityPolicy` the lab evolves — no set
piece, no script. Watch what it does to your order: a visible enemy *outranks* a
`Goto`, so the character breaks off the walk and turns to meet the thing. That is
not the order channel leaking; it is the character having its own judgement about
what matters more, which is the point.

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

So there is a second mind to choose from. The **Duelist** scores eight competing
stances every time it is allowed to think — close, trade, circle to the guard's
blind side, step off the swing plane, brace the shield on the line the blade will
actually arrive along, punish a recovery, feint, break off — and picks one, with
hysteresis so it commits instead of dithering.

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

And you can take over. Three independent toggles, `C`, `V` and `X`: the feet, the
attack, and the choice of what to hold. WASD steers; the mouse aims the line and
**click to cut** -- one click, one attack, with the same windup and the same
recovery the AI pays. `1` and `2` change what is in your hand, and the swap costs
the same ticks it costs the AI. Whichever half you do not hold, the AI
keeps fighting with — on its own reaction clock, because that is a stat.

And the number matches. `web.wasm` and the native lab produce the *same 64-bit
state hash* for the same run — `0x3c730bb2a5473a52` — so the fixed-point
simulation really is bit-identical across MSVC x86-64 and wasm32, rather than
merely designed to be.

![The room, mid-walk](web/media/screenshot.jpg)

The destination marker stays dim until the character actually acts on the click.
That gap is up to twelve ticks, and it is not input lag — it is the intellect
stat, which is the same number the HUD is showing you.

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

Then open the printed URL. Click to send the character somewhere; right-click or
`Esc` to make it hold its ground; `F` to withdraw the order entirely and watch it
decide for itself; `S` and `B` to send in a skitterer or a brute; `1` and `2` to
send in a new character once yours has fallen; `C` and `V` to take its feet or
its sword; the wheel to zoom; `Tab` for the details panel; `R` to open a fresh
room. A server is needed because a `file://` page cannot instantiate wasm — that
is the only reason.

The room is the page. The camera is centred on your character and clamped to the
walls, so walking into a corner stops the view rather than showing you the void
past it — and everything that is worth reading but not worth watching lives
behind `Tab` instead of in a sidebar that used to leave the arena a postage
stamp on a 1080p display.

To work on it:

```
cargo test                                        # 197 tests, under a second
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
asserts four hashes against numbers recorded from a native build — one from a
canned 4v6 fight, one from a scripted click-and-walk, one from a monster sent
into the room and fought to a finish, and one that runs on past the character's
death to the replacement coming in on its recycled entity slot. If any of them
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
