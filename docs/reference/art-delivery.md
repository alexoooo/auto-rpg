# Character delivery size

The Fighter and Rogue share 4.45 MB of base web resources. Workshop animation and its descriptors
add 3.28 MB. All decoder files together add 0.71 MB; a device downloads only the ones it needs.

## What is used

The [art pipeline](../art/assets.md) serves one set of geometry and textures to both gameplay and
the workshop. The texture profile is at most 1024 pixels, ETC1S quality 200 for colour and UASTC
quality 2 for normal/material data. Geometry, skin weights, rig frames and animation values are
checked through an exact lossless Meshopt round trip, including triangle index order.

## Measurement

Harness: `npm run assets:report`, static production artifacts, Windows x64, Blender 4.5.12,
KTX Software 4.4.2 and the pinned Node dependencies. Sizes are file bytes before HTTP compression,
not elapsed loading times or GPU memory. Shared resources are counted once in combined totals.
The source masters are the LFS originals whose hashes are in the rig JSON.

| Resources | Bytes |
|---|---:|
| Fighter base, including its shared dependencies | 2,648,711 |
| Rogue base, including its shared dependencies | 2,852,601 |
| Both bases, shared dependencies counted once | 4,446,295 |
| Workshop additions for both characters | 3,280,511 |
| All self-hosted decoder files | 714,364 |

The comparison is the ordinary committed GLBs at `44790a14`: gameplay 34,056,660 bytes and
workshop 53,832,604 bytes. Those independently embedded artwork. Their combined 87,889,264 bytes
correspond to 8,441,170 bytes of shared delivery resources and all decoders with this profile.
The remaining environment art is outside these figures and this migration.
