# Coarse physical hand poses

The hand remains one rigid segment. Its open capsule is the existing de Leva hand length and
volume/density construction. The closed capsule retains its proximal endpoint and radius, with
its distal centre at the rig's third metacarpal head. The named `strike` point is that head plus
the radius along the reference hand. Grip uses the same coarse closed envelope; attachment
frames continue to come from the rig's knuckles and palm thickness.

This envelope is an explicit contact approximation, not measured clenched-hand anatomy. Its
length and thickness derive entirely from existing sourced quantities. The renderer's fitted
fist and club grip provide the corresponding visual poses. Empty hands start open; compound
equipment starts in grip. Compound-held items retain their registered hand envelope for
compatibility with the qualified equipment controller. A separate capture leaves the envelope
unchanged until closure is requested, at which point it uses the closed grip envelope.
Character-preview closure overrides remain cosmetic and grant no collision authority.
Mass, centre of mass and inertia retain the existing sourced rigid-hand approximation in every
configuration; finger articulation and its internal work are absent.

A request waits for an unloaded hand and an unobstructed replacement envelope. Collider
handles, ownership, filters, CCD settings, body transforms, velocities and mass properties stay
unchanged. Attached equipment retains its current envelope on an opening request; a closing
request selects grip, and an authorized release allows the pending opening.
Pending and applied requests are replay state. An opening request does not release an item or
attach another, and recovery does not require a pending change to complete.

Qualification measurements are added alongside the punch calibration before a combat profile
using these shapes is promoted.
