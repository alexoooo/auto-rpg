# Coarse physical hand poses

The capsule hand: what a figure without measured hands (the skeleton) keeps whole, and what every
grip uses. `src/core/human/segments.ts` cites it for the closed capsule's end. A figure with measured
hands (`HumanFigure.hands`: the workshop humans) has its open hand on the palm's hull and its fist on
the fist's hull ([contact anatomy](man-anatomy.md); their effect on the punch: [man-punch](man-punch.md)).

## The capsules

- The hand is one rigid segment. Its open capsule is the de Leva hand length with the
  volume/density construction.
- The closed capsule keeps the proximal end and radius; its distal centre is the rig's third
  metacarpal head. The `strike` point is that head plus the radius along the reference hand.
- Grip uses the closed envelope; attachment frames still come from the rig's knuckles and palm
  thickness.
- Length and thickness derive from sourced quantities; mass, centre and inertia keep the rigid-hand
  approximation in every pose. It is a contact approximation, not a measured clenched hand, and has
  no finger articulation.

## Changing pose

- Empty hands start open; compound equipment starts in grip and keeps its registered envelope. A
  separate capture leaves the envelope until closure is requested, then uses the grip envelope.
- A request waits for an unloaded hand and an unobstructed replacement envelope. Collider handles,
  ownership, filters, CCD, transforms, velocities and mass stay unchanged.
- An attached item keeps its envelope on an opening request; an authorized release lets the pending
  opening through. An opening request neither releases nor attaches an item.
- Pending and applied requests are replay state; recovery does not wait on a pending change.
- Character-preview closures are cosmetic and carry no collision authority.
