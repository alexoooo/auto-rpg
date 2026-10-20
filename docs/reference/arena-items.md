# Arena equipment specifications

These are authored game dimensions under `owner-arena-items`, following the owner's request for
a small centre-grip buckler and a one-handed short sword. They establish physical equipment;
they do not establish historical accuracy or fighting capability. Muscle limits are unchanged.

## Buckler

The buckler is a rigid octagonal disc of 0.16 m radius, 0.012 m thickness and 0.8 kg mass, with a
0.12 m long, 0.018 m radius handle of 0.1 kg. Its item frame has y along the grip, x across the
face and z outward. The disc is centred halfway along the handle and 0.065 m outward from its
axis, leaving clearance for the fist. The handle and disc use their solid-cylinder moments,
combined with the parallel-axis rule; the mass is 0.9 kg in total.

The named boss is the disc's centre. Its outward normal is +z, and the shield guard controls
both the boss's place and the face's orientation. The collider is the same octagonal prism the
renderer draws, with an ordinary rigid metal surface. It has no attack aim point, damage bonus,
durability or breakage rule.
