# Strike cadence admission

Shorter chamber and return times increase fixed-face contacts but fail complete
Arena admission. Playable Scrapper retains its original trajectory timings.
`combat-cadence-screen.json.gz` retains all 32 standing cells and 19 admission
trials, their immutable configurations, source fingerprint and base commit.
These are development diagnostics; they produce no competitive rating.

Every trial uses the Node unpinned core stand or Node Arena Duel, rapier-coordinate,
120 Hz, Warrior fists, balance 0 (0/0 in Arena), ordinary muscle limits and
unchanged wound rules. There is no pose/velocity installation or extra assist.

## Standing screen

Each eight-second stand starts in ordinary guard, excludes the first two seconds,
and repeats one hand/family against a fixed front face or the same point in empty
space. The target is +/-0.10 m across, 1.23 m high and 0.60 m ahead. Forward contact
velocity is sampled before impact; contact mass is the game's free-joint reading
at the actual post-step solver point/normal. It is not delivered motor work.

| Profile | Chamber / return / quiet hold (s) | Requested contact speed (m/s) |
|---|---|---:|
| Reference | 0.22 / 0.32 / 0.05 | 5 |
| Moderate | 0.16 / 0.22 / 0.05 | 5 |
| Fast | 0.12 / 0.18 / 0.025 | 5 |
| Higher-speed ask | 0.16 / 0.22 / 0.05 | 7 |

| Profile | Straight contacts, left/right | Cross contacts, left/right | Failed miss returns, left/right cross |
|---|---:|---:|---:|
| Reference | 8/7 | 8/8 | 0/0 |
| Moderate | 10/9 | 9/8 | 0/0 |
| Fast | 11/11 | 11/10 | 0/0 |
| Higher-speed ask | 9/9 | 8/8 | 2/0 |

All standing cells remain upright and use zero assistance. The moderate/fast
cells have no failed hit or miss cycles. Fast straight contact speed bottoms at
3.606/3.551 m/s, compared with reference 4.130/4.219 m/s. Faster requested timing
is not faster actual impact. The higher-speed ask fails the left cross miss and
is rejected before Arena admission.

## Whole Arena admission

Each timing profile runs the same 30 s self-play recipe. The two new profiles
also run four 45 s knockdown fixtures (each fixed attacking hand, lying and
normally recovering foe) and both hands' eight-second hook hit/miss stands.
The low fixtures follow `research/ground-combat.mjs`: ordinary 90 N s world +Z
shove at 3 s, attacker released from standing orders at 4 s, continuing recovery.
The opposing recovery attempt need not finish under attack.

| Profile | Self-play driven contacts, left/right | Driven damage, left/right (HP) | Trunk contacts, left/right |
|---|---:|---:|---:|
| Reference | 16/19 | 0.269/0.415 | 10/11 |
| Moderate | 16/21 | 0.259/0.369 | 10/10 |
| Fast | 23/24 | 0.385/0.377 | 11/10 |

All self-play rows remain upright, use zero assistance and have no pressure-only
episode of two seconds. Fast timing increases total driven contacts from 35 to
47, but total driven damage only from 0.684 to 0.762 HP (about 11%). Trunk contact
counts stay at 21; many additional contacts meet hands or forearms. This one
recipe does not establish a damage distribution or stronger competitive policy.

| Profile | Low driven contacts: left lying/rising, right lying/rising | Attacker falls / 4 | Hook contacts, left/right |
|---|---|---:|---:|
| Moderate | 3/2, 17/2 | 1 | 8/8 |
| Fast | 4/3, 20/1 | 1 | 1/5 |

Both profiles fall in the left stationary low fixture after attacking and returning
standing. The fast right stationary case also has two failed cycles; its recovering
case records only one low driven contact and 60 ready steps, below the existing
ability gates. Both profiles therefore fail low admission. Their complete failed
rows remain available. Hook misses return without failures/falls, but fast timing
loses contact accuracy; more completed returns cannot establish a useful hook.

No new setting is installed in the playable preset. The common executor, retained
opponents, actual contact accounting and recovery path remain available for later
iterations. Stronger combat requires the physical low and standing gates to pass
together, followed by active-opponent evaluation.
