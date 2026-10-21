# Arena equipment specifications

The buckler's and short sword's numbers: authored game values (`owner-arena-items`), a small
centre-grip buckler and a one-handed short sword as the owner asked, not measurements of historical
equipment. Muscle limits are unchanged.

## Buckler

A rigid octagonal disc, 0.16 m radius, 0.012 m thick, 0.8 kg, on a handle 0.12 m long, 0.018 m
radius, 0.1 kg: 0.9 kg in all. The item frame has y along the grip, x across the face and z outward.
The disc is centred halfway along the handle and 0.065 m outward from its axis, clearing the fist.
Handle and disc take their solid-cylinder moments, combined by the parallel-axis rule.

The boss is the disc's centre, outward normal +z; the shield guard places the boss and turns the
face. The collider is the octagonal prism the renderer draws, an ordinary rigid metal surface, with
no attack point, damage bonus, durability or breakage.

## Short sword

The item frame has y from butt to tip, x across the blade between its edges, z through its
thickness. Geometry and mass are independent inputs: colliders carry no mass.

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

- Hilt and flat are blunt. The right and left edges face +x and −x, the tip +y; the normal cone
  classifies each impact from the strongest loaded shape pair at the rulebook's mechanism price. No
  sustained-load piercing.
- `edge.right`, `edge.left` and `tip` name both contact regions and aiming points; the edge points
  are midway along the blade body. The opposite edge point and the blade base give the rear points
  for aiming an edge or the tip; `bladeBase` and `bladeEnd` define the parry line.
- Metal contact uses the hard-equipment sound.
