# Art delivery size

The Fighter and Rogue share 4.45 MB of base web resources. Workshop animation and its descriptors
add 3.28 MB. All decoder files together add 0.71 MB; a device downloads only the ones it needs.
The complete inventory is 28.67 MB including all decoders, the HDR and the menu image, before
HTTP compression. Sources and inspection exports are outside the served directory.

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
The table above isolates character resources. Environment delivery uses the same compiler.

## Environment delivery

Harness: `npm run assets:report`, the pinned tools and source catalogue described in the
[art workflow](../art/assets.md). Shared resources are counted once; figures exclude manifest and
licence text and include all decoder variants, rather than only those one device requests.

| Resources | Bytes |
|---|---:|
| Four losslessly compressed environment/skeleton models | 8,230,228 |
| Selected environment textures, at most 1024 pixels | 10,255,104 |
| HDR environment and menu image | 1,741,651 |
| Complete inventory including characters, animations and decoders | 28,668,153 |

Colour uses ETC1S quality 200. Normal and material maps use UASTC quality 2 and Zstandard 18.
Existing JPEG maps remain the delivery choice where KTX2 would be larger. Geometry retains exact
accessor bytes, including triangle order, with authored frames and metadata preserved. The
skeleton's compressed reader produces the same complete piece records as its original GLB.
Integrated delivery is checked in Edge at 1440 by 900: Arena, Obstacle Court, generated depths,
the reference chamber and Random Crypt, including skeletons. Actual KTX2 files and Meshopt
models load through self-hosted decoders. Root and `/auto-rpg/` bases resolve without external
decoder requests or superseded full-size URLs; an Arena close view retains the authored walls
and floor detail. Other devices are not visually qualified by this check.

## Environment compression candidates

The comparison below measures three texture profiles against the 53.39 MB reference inventory.
The 1024-pixel candidate is 28.63 MB including decoder files; the served export above additionally
retains exact triangle order and authored frames. The other profiles remain experimental.

Harness: the Node artifact experiment at `4ea43369`, Sharp 0.35.5, KTX Software 4.4.2,
glTF Transform 4.5.0 and Meshopt 1.3.0. Rows, source hashes, scripts and visual comparisons are
kept under `research/runs/art-compression-2026-10-21/`. The two-texture 1024-pixel pilot took
3.71 seconds and priced the comparison at two to three minutes; all 51 texture encodes took
122.19 seconds. The decision is the delivery profile: native resolution for close detail,
1024 pixels for the default, or 512 pixels where smaller downloads justify reduced detail.

Colour uses ETC1S quality 200. Normal and packed material data use UASTC quality 2 and Zstandard
18, with full mip chains. A conversion is kept only when smaller than the existing file;
several existing JPEG data maps remain smaller than their KTX2 exports. The character resources,
HDR and menu image retain their current bytes. Four other models use lossless Meshopt and keep
all triangles, reducing their combined 15,054,192 bytes to 8,187,376 bytes.

| Environment texture cap | All art bytes | With all decoder files | Art reduction |
|---|---:|---:|---:|
| Reference files at `4ea43369` | 52,675,757 | 53,390,121 | — |
| Native resolution, at most 2048 | 35,427,341 | 36,141,705 | 32.7% |
| 1024 | 27,910,937 | 28,625,301 | 47.0% |
| 512 | 21,543,016 | 22,257,380 | 59.1% |

These are sums of measured candidate bytes across the entire asset inventory, before HTTP
compression. Manifest and licence text are excluded. They are not a single screen's download.
An existing smaller file retains its original resolution, including above the candidate cap.

The Forge texture subset alone is 18,225,161 bytes currently, 11,231,860 at native resolution,
3,693,585 at 1024 and 1,086,796 at 512, counting every KTX2 export without selecting smaller
originals. Colour, normal and material maps require different treatment, as described by the
[Khronos texture guidance](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_texture_basisu#using-ktx-v2-images-with-basis-universal-supercompression-for-material-textures).

### Visual check

The local production Arena is viewed in Edge at 1440 by 900, with simulation held at time zero,
at gameplay distance and with a closer floor camera. Texture candidates are decoded to RGBA8
PNG for comparison; the lossless compressed Forge model loads directly. This isolates the
export's image loss; GPU-specific transcoding is outside those decoded-image previews. The
integrated delivery check above exercises actual KTX2 in Edge. Other devices are not visually
qualified by these comparisons.
The 1024 and 512 candidates look close to the source at the tested gameplay distance. The 1024
candidate retains more texels for zooming in and is the default recommendation; 512 is an
optional smaller profile, rather than a claim of equal quality at every distance.

### Tried and not kept

Quantizing positions to 14 bits, normals to 10 and UVs to 12 with Meshopt reduces the four models
to 4,796,564 bytes without changing their triangle counts. The Forge shows visible wall artifacts
in Arena, so this export is excluded from the candidate totals. Its rows and screenshots are
kept alongside the lossless candidates; further savings require preserving the renderer's
template and transform contracts through the export.
