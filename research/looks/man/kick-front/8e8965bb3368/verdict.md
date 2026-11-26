# man's kick/front at 8e8965bb3368: the search's best by generation 5, at 480 Hz (no search reads it)

Looks like the motion: yes
Works some of the time: yes (on the stance of 1045962b6: landed 9 of 16 counted, none down, value 0.177; at 120 Hz, 11 landed, none down. Before the stance's tilted reach, 1ab5d8918, and its catch's pre-swing, 1045962b6: 5 landed, 3 down; at 120 Hz, 1 down)

What the strips show: a fast kick, its chamber 0.1 s (the search's lower bound) and its extension
0.15 s. As the leg drives out the trunk is thrown back and the arms up; the leg retracts, the foot is
set down behind and the kicker stands.

Its falls before were the stance's catch, which every skill stands on, not the kick's set-down
(read in traces in `.tmp/front-fall/`):
- d529beb4: the catch aimed 0.6 to 0.75 m behind, but the pelvis had rotated back over a bearing
  hip at its extension stop (-0.42 rad, the engine's limit), so the swing leg could not reach there:
  the reach took the hip's range from the vertical, as if the pelvis were upright (1ab5d8918).
- f7f31586: a second catch swung a foot whose knee was straight at its stop: the solve asked the
  knee almost nothing to lift it, and the hip dragged it along the ground until the sole bore the
  body and the pelvis flipped back. A catch has no pre-swing; its swing now bends the knee as a
  walk's pre-swing does (1045962b6).
