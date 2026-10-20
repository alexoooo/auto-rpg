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
## Short sword

The first short sword's numbers are authored game design values (`owner-arena-items`), not
measurements of historical equipment. Its item frame has y from the butt toward the tip, x across
the blade between its two edges, and z through its thickness. Geometry and mass properties are
independent inputs: collider regions carry no additional mass.

| Quantity | Value |
|---|---|
| Mass | 0.75 kg |
| Centre of mass | (0, 0.29, 0) m from the butt |
| Principal inertia | (0.018, 0.0001, 0.018) kg m2 about that centre |
| Grip | 0.12 m long, 0.014 m radius |
| Guard | x = ±0.07 m, y = 0.12–0.145 m, z = ±0.006 m |
| Blade body | y = 0.145–0.58 m, x = ±0.02 m, z = ±0.003 m |
| Edge bevel | x = ±0.014 m at either flat face, tapering to x = ±0.02 m at z = 0 |
| Tip | A pyramid from the blade end to (0, 0.62, 0) m |
| Contact surface stiffness | 10,000,000,000 N/m |
| Edge and tip cone | Normal cosine at least 0.8 |

The hilt and flat are blunt. The right and left edge directions are +x and −x; the tip direction
is +y. The normal-cone rule classifies each impact from the strongest loaded shape pair and uses
the existing rulebook's mechanism price. The sword causes no sustained-load piercing injury.

`edge.right`, `edge.left` and `tip` are both contact-region names and named aiming points; the
edge points are midway along the blade body. The opposing edge point and the blade base supply
the collinear rear points used to control an edge direction or a tip direction. `bladeBase`
and `bladeEnd` define the parry line.
The item uses the existing hard-equipment sound for metal contact.
