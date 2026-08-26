# Warrior similarity phase 02 — first ten experiments

Experiments 0075–0084 tested whether rigid-v2 plus broader regional diagnostics
would let scalar edits to the accepted primitive model resume progress. It did
not. The accepted distance stayed `0.621632684510433`; no candidate cleared the
preregistered `0.002` global margin.

## Results

| experiment | hypothesis | delta | durable conclusion |
| --- | --- | ---: | --- |
| 0075 | compact complete head assembly | `-0.000260` | neural direction improved, but structural/front evidence worsened and the effect was sub-margin |
| 0076 | lengthen lower body | `+0.074509` | isolated height extension exposed tube-like thighs and failed every view |
| 0077 | narrow torso core | `+0.008531` | scalar X compression pinched the plate and exposed underlying masses |
| 0078 | reduce torso depth | `+0.005180` | sagittal scaling did not solve the torso’s authored-form mismatch |
| 0079 | narrow shield outline | `+0.000324` | rear and front projections disagree; width alone is not a coherent shield solution |
| 0080 | narrow sword blade | `+0.000922` | silhouette/material movement could not overcome structural/front-right loss |
| 0081 | reduce pauldron width | `-0.001182` | strongest coherent signal: six views and both neural terms improved, but structure and two views prevented acceptance |
| 0082 | compact gauntlets | `+0.001417` | smaller hands disappear instead of becoming articulated hands |
| 0083 | compact knees | `+0.007643` | smaller balls expose incompatible straight-limb transitions |
| 0084 | repeat fitted belt under v2 | `+0.002573` | v1’s strong profile gain was not robust to hierarchical waist structure and fixed registration |

The tenth experiment deliberately repeated phase 01’s best apparent protocol
false negative. Its clean mechanics but rigid-v2 regression resolved that
ambiguity: the old score rewarded removal of the profile shelf, while the
successor ruler found worse waist ownership and appearance in six views.

## What the block established

### The plateau is representational

The ten trials covered head, body proportions, torso width/depth, shield, sword,
shoulders, hands, knees, and waist. Nine regressed; the only coherent improvement
was too small to accept. This breadth makes a local bad-luck explanation
implausible. The same primitives cannot independently satisfy anatomy,
attachment, silhouette, and armour vocabulary.

Scalar edits repeatedly remove compensations. Large knees conceal cylinder
ends; a broad torso conceals disconnected plate/support geometry; oversized
hands imply contact that the equipment pose does not physically provide. A
single radius or scale can improve one outline only by exposing the neighboring
construction error.

### The pauldron signal is useful, but not a license to tune

0081 improved global neural `0.007976`, regional neural `0.006381`, silhouette
`0.000645`, and material appearance `0.000315`. It also improved six of eight
views. Hierarchical structure regressed `0.006880`, and the global gain was only
`0.001182`. The correct inference is not “try radius 0.145.” It is that the
accepted shoulder mass is too dominant and an authored shoulder/upper-arm
assembly is a high-value replacement target.

### The atlas still needs ownership review

The accepted report’s largest area-weighted residuals are shield field, sword
blade, hair/beard, torso, left forearm/upper arm, and shoulders. Some are real;
some contain visibility or semantic-publication mismatch. The shield field/rim
split is the clearest example. Before an optimizer follows a large residual,
candidate and reference masks must agree on what owns each visible pixel.

### Formal IDs should not be modeling scratch space

All ten candidates could have been screened cheaply from eight structural
renders before neural scoring. The next program creates multiple production
variants outside the ledger, rejects obvious failures, and formalizes only the
best mechanically valid candidate. Ten formal experiments should represent ten
credible discriminators, not ten first drafts.

## Direction

The next progress attempt changes four things:

1. audit visible reference/candidate ownership and measure an image-space oracle
   so the ruler’s attainable direction is known;
2. batch-fit coherent multi-parameter pose/proportion and equipment transforms
   instead of hand-tuning one dimension;
3. replace complete semantic subsystems with genuinely authored meshes;
4. apply UV/PBR texture only after the affected masks and contacts align.

The executable sequence and conditional 0085–0094 queue live in the current
[authored-search plan](../plans/warrior-authored-search-00-overview.md).

