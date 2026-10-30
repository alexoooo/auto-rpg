/**
 * **Everything a spec's numbers rest on.** A `Quantity` taken from a source names one of these
 * (`src/core/spec/quantity.ts`).
 *
 * - `literature`: a published measurement, cited so it can be found.
 * - `decision`: the owner's choice, with the date and the record that holds it. A design target is
 *   a decision, not a measurement, and is said to be one. A record since deleted is named with the
 *   commit that still has it, `path@commit`.
 * - `asset`: a file in this repository; `where` is a JSON pointer into it.
 * - `measurement`: a number measured from an asset or a run, with how and where the table is.
 */
type Source =
  | { readonly kind: "literature"; readonly cite: string; readonly link: string }
  | { readonly kind: "decision"; readonly date: string; readonly decided: string; readonly record: string }
  | { readonly kind: "asset"; readonly file: string; readonly what: string }
  | { readonly kind: "measurement"; readonly how: string; readonly record: string };

export const SOURCES = Object.freeze({
  "owner-arena-items": {
    kind: "decision", date: "2026-10-20",
    decided: "Authored mass properties, geometry and contact cones for the Arena's first equipment. These are game design values, not historical or biomechanical measurements.",
    record: "docs/reference/arena-items.md",
  },
  "owner-point-load": {
    kind: "decision", date: "2026-10-19",
    decided: "General piercing injury grows with aligned normal impulse above a shared 1 N load threshold. The game calibration targets unassisted reptile injury endings within 30 s and repeated material damage against humanoids; it is not measured tissue behaviour.",
    record: "docs/reference/reptile-bites.md",
  },
  "fall-bar": {
    kind: "measurement",
    how: "The depth under its asked height at which the stance's batteries count a fall (research/core-stance-trials.mjs); "
      + "set, not swept, and the bar a standing body is down by.",
    record: "docs/reference/stance-tuning.md#fallen",
  },
  "touch-bar": {
    kind: "decision", date: "2026-10-19",
    decided: "A body that stands is down, as a fight reads it, when a part but its feet and hands is at the ground, "
      + "whatever its mind asks: 3 cm, about half the least clearance those parts kept in the preset mirrors while a "
      + "fighter was up to 0.6 m under its standing height.",
    record: "docs/reference/down-timing.md#what-touches-the-ground",
  },
  "reptile-anatomy": {
    kind: "asset", file: "assets/reptile/body.json",
    what: "Authored estimates for the 8 kg sprawling reptile: geometry, tooth contact surfaces, mass weights, joint limits and muscle ceilings; docs/reference/reptile.md states their uncertainty and derivations.",
  },
  "contact-projection-fixture": {
    kind: "asset", file: "assets/research/contact-projection.json",
    what: "Synthetic sphere and welded offset load for the friction-projection comparison; fixture inputs, not anatomical measurements.",
  },
  "de-leva-1996": {
    kind: "literature",
    cite: "de Leva P (1996). Adjustments to Zatsiorsky-Seluyanov's segment inertia parameters. "
      + "J Biomech 29(9):1223-1230.",
    link: "https://doi.org/10.1016/0021-9290(95)00178-6",
  },
  "bohannon-1997": {
    kind: "literature",
    cite: "Bohannon RW (1997). Comfortable and maximum walking speed of adults aged 20-79 years: reference values "
      + "and determinants. Age Ageing 26(1):15-19. Men aged 20-29: comfortable 139.3 cm/s, maximum 253.3 cm/s.",
    link: "https://doi.org/10.1093/ageing/26.1.15",
  },
  "popelsky-2023": {
    kind: "literature",
    cite: "Popelsky A, Ylitalo K, Hockett C (2023). Backward walking speed: a novel mobility measure for younger and "
      + "older adults. Innov Aging 7(Suppl 1). Young adults (n = 20, mean age 22.9): forward 138.3 cm/s, "
      + "backward 82.6 cm/s, each at their own pace.",
    link: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10738916/",
  },
  "handford-2014": {
    kind: "literature",
    cite: "Handford ML, Srinivasan M (2014). Sideways walking: preferred is slow, slow is optimal, and optimal is "
      + "expensive. Biol Lett 10(1):20131006. Preferred sideways speed 0.575 m/s (SD 0.123).",
    link: "https://doi.org/10.1098/rsbl.2013.1006",
  },
  "hoogkamer-2018": {
    kind: "literature",
    cite: "Hoogkamer W, Kipp S, Frank JH, Farina EM, Luo G, Kram R (2018). A comparison of the energetic cost of "
      + "running in marathon racing shoes. Sports Med 48(4):1009-1019. Midsoles loaded force-constrained to about "
      + "2000 N over about 185 ms: the Nike Zoom Streak 6 deformed 6.1 mm and returned 65.5 % of its energy.",
    link: "https://doi.org/10.1007/s40279-017-0811-2",
  },
  "huber-2022": {
    kind: "literature",
    cite: "Huber SK, Knols RH, Held JPO, Christen T, de Bruin ED (2022). Agreement, reliability, and concurrent "
      + "validity of an outdoor, wearable-based walk ratio assessment in healthy adults and chronic stroke survivors. "
      + "Front Physiol 13:857963. The walk ratio (step length over step rate) of healthy people is around 0.6 "
      + "cm/(step/min), 0.58-0.63 (Bogen et al. 2018), and constant across walking speeds (Sekiya et al. 1996, "
      + "J Hum Mov Stud 30:241-257: men from 53 to 137 m/min).",
    link: "https://doi.org/10.3389/fphys.2022.857963",
  },
  "winter-table-4-1": {
    kind: "literature",
    cite: "Winter DA. Biomechanics and Motor Control of Human Movement, Table 4.1 (anthropometric data; "
      + "segment densities from Dempster 1955 via Miller & Nelson 1973 and Plagenhoef 1971).",
    link: "https://courses.grainger.illinois.edu/me481/sp2021/Anthro-Winter.pdf",
  },
  "workshop-envelope": {
    kind: "measurement",
    how: "scripts/core/workshop-envelope.mjs on the lossless character exports: the extents of the "
      + "clothed envelope's vertices that a foot's bones weigh most on, body frame, authored size, "
      + "rounded to 0.1 mm.",
    record: "scripts/core/workshop-envelope.mjs",
  },
  "workshop-fighter-rig": {
    kind: "asset", file: "assets/humanoid/workshop-fighter.json",
    what: "The Warrior's rig: bone heads and tails, Blender's frame, metres at the authored size, "
      + "exported from the model's Blender file by scripts/humanoid/export-workshop.py.",
  },
  "workshop-rogue-rig": {
    kind: "asset", file: "assets/humanoid/workshop-rogue.json",
    what: "The Rogue's rig, as the Warrior's.",
  },
  "workshop-fighter-trunk-hull": {
    kind: "asset", file: "assets/humanoid/workshop-fighter-trunk-hull.json",
    what: "The Warrior's trunk segments' surfaces: the convex hull corners of the clothed envelope's "
      + "vertices the trunk's bones weigh most on, body frame, authored size, rounded to 0.1 mm; written "
      + "by scripts/core/workshop-envelope.mjs --write.",
  },
  "workshop-rogue-trunk-hull": {
    kind: "asset", file: "assets/humanoid/workshop-rogue-trunk-hull.json",
    what: "The Rogue's trunk segments' surfaces, as the Warrior's.",
  },
  "workshop-fighter-bounds": {
    kind: "asset", file: "assets/humanoid/skin-bounds.json",
    what: "The Warrior's exact skin top at the authored size, with the lossless source's hash and accessor.",
  },
  "workshop-rogue-bounds": {
    kind: "asset", file: "assets/humanoid/skin-bounds.json",
    what: "The Rogue's exact skin top at the authored size, with the lossless source's hash and accessor.",
  },
  "workshop-fighter-hands": {
    kind: "asset", file: "assets/humanoid/workshop-fighter-hands.json",
    what: "The Warrior's hands from its bare skin: each open hand's convex hull with its palm patch and "
      + "the patch's centre, and each fist's convex hull, middle knuckle and strike point; body frame, "
      + "authored size, rounded to 0.1 mm; written by scripts/core/hand-envelope.mjs --write, "
      + "its rules in docs/reference/man-anatomy.md.",
  },
  "workshop-rogue-hands": {
    kind: "asset", file: "assets/humanoid/workshop-rogue-hands.json",
    what: "The Rogue's hands from its bare skin, as the Warrior's.",
  },
  "man-contact-geometry": {
    kind: "asset", file: "assets/humanoid/man-contact-geometry.json",
    what: "Man's contact surfaces from the Warrior's skin: each open hand's and fist's convex hull with "
      + "its palm patch, and each bare foot cut at the ball into a foot and a toe piece with their "
      + "hinge, sole and toe pad; body frame, authored size, rounded to 0.1 mm; written by "
      + "scripts/core/man-envelope.mjs --write, its "
      + "rules and approximations in docs/reference/man-anatomy.md.",
  },
  "falisse-2022-toes": {
    kind: "literature",
    cite: "Falisse A, Afschrift M, De Groote F (2022). Modeling toes contributes to realistic stance knee "
      + "mechanics in three-dimensional predictive simulations of walking. PLoS ONE 17(1):e0256311. "
      + "The metatarsophalangeal joint as a passive rotational spring, 25 N m/rad about a neutral "
      + "rest, with 2 N m s/rad of damping.",
    link: "https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0256311",
  },
  "opensim-gait2392-mtp": {
    kind: "literature",
    cite: "Delp SL et al. OpenSim Gait2392 model, mtp_angle coordinate: the metatarsophalangeal joint's "
      + "range, about -90 to +90 degrees about its axis.",
    link: "https://github.com/opensim-org/opensim-models/blob/master/Models/Gait2392_Simbody/gait2392_thelen2003muscle.osim",
  },
  "owner-typical-adult": {
    kind: "decision", date: "2026-09-27",
    decided: "A human at x1 is a typical adult, about 1.76-1.78 m and 78-80 kg for a man; the Rogue "
      + "keeps its own proportions and its size against the Warrior's.",
    record: "docs/plans/2026-09-27-warrior-rogue-reptile.md@2e99105f",
  },
  "cgpm-1901": {
    kind: "literature",
    cite: "3rd General Conference on Weights and Measures (CGPM), 1901: Declaration on the unit of mass "
      + "and on the definition of weight; conventional value of gn, 980.665 cm/s2.",
    link: "https://www.bipm.org/en/committees/cg/cgpm/3-1901/resolution-",
  },
  "skeleton-bones": {
    kind: "asset", file: "assets/skeleton/bones.json",
    what: "The skeleton's bones measured from its art at its bind, body frame, metres: each segment's bones' "
      + "solid volume, centroid, second moment per unit volume about the centroid and low-polygon hull; each "
      + "hand's hull, palm and strike; each foot's extents. Written by scripts/skeleton/bone-fit.mjs --write.",
  },
  "owner-skeleton-body": {
    kind: "decision", date: "2026-10-29",
    decided: "The skeleton is human-shaped, weighs 15 kg, and its body is fitted to its bones, approximate "
      + "and low-polygon.",
    record: "docs/art/skeleton.md#the-body-fitted-to-the-bones",
  },
  "owner-skeleton-motor": {
    kind: "decision", date: "2026-10-29",
    decided: "The skeleton's joints are motors, not muscles: torque falling in a straight line with speed, "
      + "no more held turned back than at rest, the same strength and speed both ways, each at the muscle's peak power, no tendons.",
    record: "docs/art/skeleton.md#motors-not-muscles",
  },
  "skeleton-bind": {
    kind: "asset", file: "assets/skeleton/bind.json",
    what: "The skeleton's parts as its art was fitted to them: for each build, each part's position and turn "
      + "(x, y, z, w) in the body frame at x1, facing +z with the soles on 0, and its box's min and max in its "
      + "own frame. Fixed, as the art is; exported by scripts/skeleton/export-bind.mjs@77a0cd77.",
  },
  "skeleton-placeholders": {
    kind: "decision", date: "2026-09-30",
    decided: "Proposed under the owner's ask of 2026-09-30 (the skeleton 'doesn't need to work properly, it "
      + "just needs to fit the new core'), and accepted by the owner on 2026-10-24: until the crypt skeleton has numbers of "
      + "its own, it is a typical man in the skeleton's shape (men's tables, the typical man's 79 kg, the "
      + "Warrior's 6 HP), its fists held thumb up as its art's guard shows them.",
    record: "docs/plans/2026-09-30-old-path-removal.md@2e99105f",
  },
  "skeleton-limbs-clear": {
    kind: "decision", date: "2026-10-03",
    decided: "The skeleton's thighs and upper arms, the placeholder typical man's at his densities, overlap "
      + "each other and its trunk as built, which holds its pelvis from turning. The owner chose 'just clear' "
      + "over the art's thin bones for now: they are no wider than leaves 4 mm between them and what they "
      + "share no joint with, the room its forearms have from its trunk as built.",
    record: "docs/reference/blows.md#steered",
  },
  "owner-hp-pool": {
    kind: "decision", date: "2026-09-27",
    decided: "Hit points: reptile 1, Rogue 4, Warrior 6. One HP pool per body; excess damage spreads to "
      + "neighbouring parts, nearest and inward first; the body dies when its HP is gone or its head is "
      + "emptied. A part severs once it is half its hit points past empty.",
    record: "docs/plans/2026-09-27-warrior-rogue-reptile.md@2e99105f",
  },
  "fdlibm": {
    kind: "literature",
    cite: "fdlibm, Sun Microsystems' freely distributable C math library (1993), as FreeBSD's msun carries it: "
      + "k_sin.c, k_cos.c, k_tan.c, e_rem_pio2.c, k_rem_pio2.c, e_asin.c, e_acos.c, s_atan.c, e_atan2.c, e_exp.c, "
      + "s_expm1.c, e_sinh.c, e_cosh.c, s_cbrt.c and s_scalbn.c. Its notice stands in src/core/math/real.ts.",
    link: "https://github.com/freebsd/freebsd-src/tree/main/lib/msun/src",
  },
  "owner-reaction-time": {
    kind: "decision", date: "2026-10-27",
    decided: "A mind sees every other body 0.15 s late, the quick end of a person's response to a seen cue (about "
      + "0.15 to 0.2 s); its own body at once. One rule for both sides, in seconds, converted to steps at the world's rate.",
    record: "docs/reference/play.md#reaction-time",
  },
  "owner-balance": {
    kind: "decision", date: "2026-09-30",
    decided: "How strongly a body is held up beyond its legs is an attribute of its character (the owner: "
      + "'i want that to be an attribute'), and its name is balance (the owner: '\"Balance\" is fine'). "
      + "It is a per cent of the body's own weight, the most force its assist gives (the owner: 'why can we "
      + "not have it as a percentage?'). Proposed, for the owner to confirm: with each per cent go 0.0026 "
      + "weight-metres of moment, the force at a lever of 0.26 m, so that 25 % is the ceiling measured at a "
      + "quarter of a weight and 50 N m for the Warrior. Every character has 0 (the owner, 2026-10-24: "
      + "'default balance 0').",
    record: "docs/reference/assist.md#balance",
  },
  "owner-haste": {
    kind: "decision", date: "2026-10-16",
    decided: "How fast a body's legs are beyond a person's is an attribute of its character, haste, as balance is: "
      + "the unloaded speed of the legs' muscles alone (the hip's, the knee's and the ankle's exertions), a per cent "
      + "over the human baseline as balance is over none, 0 by default and every character's 0, so that +50 is legs "
      + "half again as fast. A gait times itself to it; a forward force "
      + "on the root is not haste (it is an assist, and reads as sliding). Its range and each character's value are "
      + "the owner's; a bout or an experiment may give a body another. The shared character configuration "
      + "applies the percentage to each model's own baseline, including all four reptile leg chains.",
    record: "docs/reference/assist.md#haste",
  },
  "owner-toes": {
    kind: "decision", date: "2026-10-27",
    decided: "A human figure's feet may have toes, a setting of its character: the last 0.06 m of the foot at x1, to "
      + "the boot's toe, a slab 0.025 m thick, the foot's box running from the heel to them; and the ankle of a toed "
      + "foot dorsiflexes to 0.8 rad past the reference pose, beside the 43 degrees of a weight-bearing lunge (Konor "
      + "et al. 2012, Int J Sports Phys Ther 7(3):279-287, Table 2). Toes and the stop are what let the Warrior stand "
      + "up from hands and knees; Option Mind's fighter takes them now, the game's characters with the new stand-up.",
    record: "docs/reference/toes.md",
  },
  "owner-physique": {
    kind: "decision", date: "2026-10-08",
    decided: "A body may differ from its model by a physique of four attributes, each a factor that "
      + "changes one thing: size (every length, and the mass at the same density), weight (the mass "
      + "alone, a load the same muscles carry), strength (every peak torque) and speed (every muscle's "
      + "unloaded speed of shortening). An attribute left out is 1. The factors are the character's or "
      + "the run's; the grid's ranges are the owner's and live in research/physiques.mjs.",
    record: "docs/reference/competencies.md#physiques",
  },
  "owner-run-body": {
    kind: "decision", date: "2026-10-15",
    decided: "A body's numbers may be set to what gives a run like a person's, 3-4 m/s (the owner: 'we can "
      + "set it to the value that helps us achieve the result that we want -- which is better jog/run, "
      + "ideally comparable to real humans'). Each number set so is the one the run searched on the body "
      + "is fastest and surest at.",
    record: "docs/reference/run-body.md",
  },
  "owner-punch-body": {
    kind: "decision", date: "2026-10-24",
    decided: "A body's numbers may be set to what gives a punch like a person's (the owner: 'the speed curve "
      + "is arbitrary to me ... the goal is a human level punch'). Each number set so is the one a punch "
      + "searched on the Strike drill lands at the bar with.",
    record: "docs/reference/punch-body.md",
  },
  "owner-stride-room": {
    kind: "decision", date: "2026-10-18",
    decided: "A thigh's capsule leaves 30 mm between it and the other thigh with the legs hanging straight, "
      + "set to what gives a walk that does not meet itself (the owner, 2026-10-15: a body's number is set "
      + "to the value that achieves the result wanted). With less, the rigid thighs meet as one swings past "
      + "the other, at up to a blow's force; the Warrior's, at their mass and density, leave 31 mm.",
    record: "docs/reference/run-body.md",
  },
  "owner-part-hp-split": {
    kind: "decision", date: "2026-09-29",
    decided: "A core human's hit points are split over its segments by cross-section: each segment's "
      + "share is its mass to the two-thirds over the sum of the same over the body.",
    record: "docs/plans/2026-09-28-core-foundation.md@2e99105f",
  },
  "owner-physics-engine": {
    kind: "decision", date: "2026-09-29",
    decided: "The core runs on Rapier (the SIMD build), chosen on the physics bake-off's report.",
    record: "research/physics-bakeoff/REPORT.md",
  },
  "rapier-default-friction": {
    kind: "literature",
    cite: "Rapier user guide, Colliders, Friction: a collider's friction coefficient is 0.5 unless it is set.",
    link: "https://rapier.rs/docs/user_guides/javascript/colliders#friction",
  },
  "physics-bakeoff": {
    kind: "measurement",
    how: "research/physics-bakeoff/: Havok, MuJoCo and Rapier driven by one torque servo at 120 Hz against a 1920 Hz "
      + "reference (Node), each engine's cheapest setting that holds a standing human, a whole human and a pile.",
    record: "research/physics-bakeoff/REPORT.md",
  },
  "owner-physics-rate": {
    kind: "decision", date: "2026-09-25",
    decided: "Physics and control run at 120 Hz.",
    record: "docs/history.md@2e99105f#h66",
  },
  "workshop-volumes": {
    kind: "measurement",
    how: "Each model's skin, feet, jacket, trousers, collar and belt, closed by voxel flood fill in the "
      + "bind pose and extrapolated to a zero voxel from grids of 4.5 to 8 mm, at the authored size.",
    record: "docs/reference/human-strike-reference.md#8-the-workshop-models",
  },
  "moromizato-2016": {
    kind: "literature",
    cite: "Moromizato K, Kimura R, Fukase H, Yamaguchi K, Ishida H (2016). Whole-body patterns of the "
      + "range of joint motion in young adults: masculine type and feminine type. J Physiol Anthropol "
      + "35:23.",
    link: "https://doi.org/10.1186/s40101-016-0112-8",
  },
  "zwerus-2019": {
    kind: "literature",
    cite: "Zwerus EL, Willigenburg NW, Scholtes VA, Somford MP, Eygendaal D, van den Bekerom MPJ "
      + "(2019). Normative values and affecting factors for the elbow range of motion. Shoulder Elbow "
      + "11(3):215-224.",
    link: "https://doi.org/10.1177/1758573217728711",
  },
  "kitsoulis-2010": {
    kind: "literature",
    cite: "Kitsoulis P, Paraskevas G, Iliou K, Kanavaros P, Marini A (2010). Clinical study of the "
      + "factors affecting radioulnar deviation of the wrist joint. BMC Musculoskelet Disord 11:9.",
    link: "https://doi.org/10.1186/1471-2474-11-9",
  },
  "hallaceli-2014": {
    kind: "literature",
    cite: "HallaÃ§eli H, UruÃ§ V, Uysal HH, Ã–zden R, HallaÃ§eli Ã‡, Soyuer F, Ä°nce Parpucu T, Yengil E, "
      + "Cavlak U (2014). Normal hip, knee and ankle range of motion in the Turkish population. Acta "
      + "Orthop Traumatol Turc 48(1):37-42.",
    link: "https://doi.org/10.3944/AOTT.2014.3113",
  },
  "niewiadomski-2019": {
    kind: "literature",
    cite: "Niewiadomski C, Bianco RJ, Afquir S, Evin M, Arnoux PJ (2019). Experimental assessment of "
      + "cervical ranges of motion and compensatory strategies. Chiropr Man Therap 27:9.",
    link: "https://doi.org/10.1186/s12998-018-0223-x",
  },
  "jiang-2025": {
    kind: "literature",
    cite: "Jiang Z, Ye J, Cheng R, Zhang Q, Xu L, Tsai TY (2025). The baseline bubble inclinometer "
      + "measurement of sagittal thoracic spinal range of motion is reliable: validated by "
      + "optoelectronic motion capture system. J Back Musculoskelet Rehabil 39(1):242.",
    link: "https://doi.org/10.1177/10538127251357101",
  },
  "fujimori-2014": {
    kind: "literature",
    cite: "Fujimori T, Iwasaki M, Nagamoto Y, et al. (2014). Kinematics of the thoracic spine in trunk "
      + "lateral bending: in vivo three-dimensional analysis. Spine J 14(9):1991-1999. Read at "
      + "abstract level.",
    link: "https://doi.org/10.1016/j.spinee.2013.11.054",
  },
  "fujimori-2012": {
    kind: "literature",
    cite: "Fujimori T, Iwasaki M, Nagamoto Y, et al. (2012). Kinematics of the thoracic spine in trunk "
      + "rotation: in vivo 3-dimensional analysis. Spine 37(21):E1318-E1328. Read at abstract level.",
    link: "https://doi.org/10.1097/BRS.0b013e318267254b",
  },
  "pearcy-1985": {
    kind: "literature",
    cite: "Pearcy MJ (1985). Stereo radiography of lumbar spine motion. Acta Orthop Scand Suppl "
      + "212:1-45.",
    link: "https://doi.org/10.3109/17453678509154154",
  },
  "ds-2009": {
    kind: "literature",
    cite: "Danneskiold-SamsÃ¸e B, Bartels EM, BÃ¼low PM, Lund H, Stockmarr A, Holm CC, WÃ¤tjen I, "
      + "Appleyard M, Bliddal H (2009). Isokinetic and isometric muscle strength in a healthy "
      + "population with special reference to age and gender. Acta Physiol 197(Suppl 673):1-68.",
    link: "https://doi.org/10.1111/j.1748-1716.2009.02022.x",
  },
  "anderson-2007": {
    kind: "literature",
    cite: "Anderson DE, Madigan ML, Nussbaum MA (2007). Maximum voluntary joint torque as a function of "
      + "joint angle and angular velocity: model development and application to the lower limb. J "
      + "Biomech 40(14):3105-3113.",
    link: "https://doi.org/10.1016/j.jbiomech.2007.03.022",
  },
  "frey-law-2012": {
    kind: "literature",
    cite: "Frey-Law LA, Laake A, Avin KG, Heitsman J, Marler T, Abdel-Malek K (2012). Knee and elbow 3D "
      + "strength surfaces: peak torque-angle-velocity relationships. J Appl Biomech 28(6):726-737. Read in "
      + "the author manuscript.",
    link: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7050840/",
  },
  "thelen-2003": {
    kind: "literature",
    cite: "Thelen DG (2003). Adjustment of muscle mechanics model parameters to simulate dynamic "
      + "contractions in older adults. J Biomech Eng 125(1):70-77.",
    link: "https://nmbl.stanford.edu/publications/pdf/Thelen2003.pdf",
  },
  "pan-2025": {
    kind: "literature",
    cite: "Pan F, Cheng J, Kong C, Wang W, Lu S (2025). Sex-specific characteristics of the trunk "
      + "muscle behaviors in an asymptomatic adult cohort. Eur J Med Res 30:471.",
    link: "https://doi.org/10.1186/s40001-025-02742-w",
  },
  "vasavada-2001": {
    kind: "literature",
    cite: "Vasavada AN, Li S, Delp SL (2001). Three-dimensional isometric strength of neck muscles in "
      + "humans. Spine 26(17):1904-1909.",
    link: "https://nmbl.stanford.edu/publications/pdf/Vasavada2001.pdf",
  },
  "axelsson-2018": {
    kind: "literature",
    cite: "Axelsson P, Fredrikson P, Nilsson A, Andersson JK, KÃ¤rrholm J (2018). Forearm torque and "
      + "lifting strength: normative data. J Hand Surg Am 43(7):677.e1-677.e17.",
    link: "https://doi.org/10.1016/j.jhsa.2017.12.022",
  },
  "peleg-2025": {
    kind: "literature",
    cite: "Peleg S, Shemy E, Arnon M, Dvir Z (2025). Isokinetic strength profile of the wrist muscles: "
      + "a study of healthy women and men. J Funct Morphol Kinesiol 10(4):377.",
    link: "https://doi.org/10.3390/jfmk10040377",
  },
  "da-fonseca-2025": {
    kind: "literature",
    cite: "da Fonseca LF, Jeyaraman M, Jeyaraman N, Inojossa TR, Maciel ES, de Cesar Netto C, Mansur "
      + "NS, Astur DC (2025). Normative values of ankle strength and its importance for "
      + "rehabilitation and return to activity: a cross-sectional study. World J Orthop "
      + "16(10):108858.",
    link: "https://doi.org/10.5312/wjo.v16.i10.108858",
  },
  "abe-2003": {
    kind: "literature",
    cite: "Abe T, Kearns CF, Fukunaga T (2003). Sex differences in whole body skeletal muscle mass measured by "
      + "magnetic resonance imaging and its distribution in young Japanese adults. Br J Sports Med "
      + "37(5):436-440.",
    link: "https://doi.org/10.1136/bjsm.37.5.436",
  },
  "wood-handbook-2010": {
    kind: "literature",
    cite: "Forest Products Laboratory (2010). Wood Handbook: Wood as an Engineering Material. General Technical "
      + "Report FPL-GTR-190, USDA Forest Service, Madison, WI. Chapter 4, Methods for Calculating Density: the "
      + "worked example for white ash at 12 % moisture content (G12 0.605).",
    link: "https://research.fs.usda.gov/download/treesearch/37440.pdf",
  },
  "owner-club": {
    kind: "decision", date: "2026-09-27",
    decided: "The damage unit is the strongest hit with a club, one-handed: \"a club would be made of wood\". The club "
      + "is the game's wooden club: a 0.45 m haft of 18 mm radius and a 0.25 m swell of 40 mm radius, in ash. "
      + "Its dimensions are a real club's, not a tuning.",
    record: "src/golem/config.ts@77a0cd77",
  },
  "owner-weapon-ratios": {
    kind: "decision", date: "2026-09-27",
    decided: "Rescale scoring so that the strongest club hit is worth 1: one unit constant, applied where scoring "
      + "prices energy, and every weapon keeps its ratio to the club. The prices this rescales, joules per point "
      + "of wound: an edge 197.96 (cutJoulesPerDamage), an axe's edge 147.45 (chopJoulesPerDamage), blunt 1134.99 "
      + "(crushJoulesPerDamage), in CONFIG.combat; a point 34 (PROJECTILE_PENETRATION_V1.joulesPerDamage in "
      + "src/scoring.ts@77a0cd77).",
    record: "src/config.ts@77a0cd77",
  },
  "owner-damage-unit": {
    kind: "decision", date: "2026-10-01",
    decided: "\"should we just make it 100J what's so special about 138?\", and then that all of what was "
      + "planned with it be built. One hit point is 100 J of blunt blow; every weapon keeps its ratio to blunt "
      + "(owner-weapon-ratios). It replaces the unit of owner-club, the strongest club hit, which stays a "
      + "measurement (core-club-unit). The bodies' hit points are as they were "
      + "(owner-hp-pool), so each holds fewer joules: of the record's three options the first, which the owner "
      + "accepted on 2026-10-24.",
    record: "docs/reference/wounds.md#unit",
  },
  "core-club-unit": {
    kind: "measurement",
    how: "research/core-strike-search.mjs --model workshop-fighter --held 'wooden club' --band high --hz 960: the Warrior's "
      + "strongest one-handed blow with the wooden club at a head hung at its place (research/core-blow.mjs), thrown "
      + "standing on its own feet, built in the guard it holds (guardPosture), by cross-entropy search (Node core stand, "
      + "Rapier, ground on, no assist), its energy 1/2 mu v^2 from the masses the contact meets. 30 generations of 96 at "
      + "960 Hz, the coarsest rate a standing blow converges at, going on from the blow of "
      + "research/core-club-unit.json@7601bd36; read again by research/core-club-unit.mjs, eight throws a rate, at "
      + "1920 Hz, where it agrees with 480, 960 and 3840 Hz to 2 %. Recorded, not asked: the blow's energy is the "
      + "rate-converged reading, not the game's 120 Hz one (87.85 J there, two throws of the eight landing 7 J or less). The blow "
      + "and its readings are research/core-club-unit.json; the search is in docs/reference/blows.md#the-clubs-best-blow.",
    record: "research/core-club-unit.json",
  },
  "core-stance-envelope": {
    kind: "asset", file: "assets/core/stance-envelope.json",
    what: "What the core stance held with each body as a fight plays it (in the guard, under its character's "
      + "balance, with a club and empty-handed) at the game's rate: the gait battery's walks at "
      + "0.2-0.7 m/s five ways and the turn battery's half-turns at 0.25-4 rad/s both ways, walking at each "
      + "speed up to the fastest walk, begun from 0 to 1.5 s after the walk sets off and under way; how many "
      + "held at each, and the fastest held by the rule of "
      + "src/core/control/stance-envelope.ts; written by research/core-stance-envelope.mjs --write, whose "
      + "harness it names.",
  },
  "simbicon-run-envelope": {
    kind: "asset", file: "assets/core/simbicon-run-envelope.json",
    what: "What the SIMBICON walk (src/core/skills/simbicon.ts@ffdaaeea) free to run held with each body as a fight plays it, by "
      + "the batteries and rule of core-stance-envelope at its run's speeds, 0.3-3 m/s, each walk calm and in the "
      + "lab's 5 N gusts on four seeds; the walk and run's turns. Written by research/core-stance-envelope.mjs@ffdaaeea --legs simbicon-run "
      + "--gusts 1:5:1,2,3,4 --write, whose harness it names.",
  },
  "walk-run-envelope": {
    kind: "asset", file: "assets/core/walk-run-envelope.json",
    what: "How fast the walk and run (src/core/skills/walk-run.ts) free to run walked each way with each body as a fight "
      + "plays it, with each thing held: the fastest speed, 0.2-4.5 m/s, at which every walk held, calm and in the lab's "
      + "5 N gusts on four seeds; written by research/core-stance-envelope.mjs --legs walk-run --walks "
      + "--gusts 1:5:1,2,3,4 --write, whose harness it names. It measured no turns.",
  },
  "core-strikes": {
    kind: "asset", file: "assets/core/strikes.json",
    what: "The strike skill's repertoire (src/core/skills/strikes.ts): for a body, a thing held and a height "
      + "band, the right hand's strike found by search (research/core-strike-search.mjs), scored by the hit "
      + "points it takes from a target body under the rule less those it costs the body that throws it "
      + "(research/core-blow.mjs), thrown from standing in the guard; with where its target stood, ahead of the "
      + "head and above it, how it was searched, where about its place it still lands, and what it read on "
      + "replay; written by research/core-strike-repertoire.mjs --write from the searches' outputs, whose "
      + "harness it names.",
  },
  "core-grip": {
    kind: "decision", date: "2026-09-29",
    decided: "Recorded, not asked: a hand holds a haft across its knuckles, from the little finger's "
      + "to the index finger's, with the butt at the little finger's knuckle and the axis on the palm side of the "
      + "middle finger's knuckle, the haft's surface at the palm: the hand's capsule radius from the knuckle. A "
      + "real grip crosses the palm at a slant; this one does not.",
    record: "docs/plans/2026-09-28-core-foundation.md@2e99105f",
  },
  "reference-pose-assumptions": {
    kind: "decision", date: "2026-09-28",
    decided: "Proposed, for the owner to confirm: where no source or measurement gives an "
      + "angle, the workshop models' reference pose is taken as neutral in neck and spine, hip rotation "
      + "and foot roll; and the shoulder has no adduction beyond the anatomical position, since the "
      + "trunk is in the way.",
    record: "docs/reference/human-strike-reference.md#9-joint-ranges-and-strengths-for-the-core-human",
  },
  "cormier-2009": {
    kind: "literature",
    cite: "Cormier JM. Epidemiology and Biomechanical Analysis of Facial Fractures. PhD dissertation, Virginia "
      + "Polytechnic Institute and State University, 2009: cadaver faces struck by a flat-faced impactor; Table 14 "
      + "gives the nasal bone's stiffness at 20 % and between 20 and 80 % of peak force.",
    link: "https://hdl.handle.net/10919/26280",
  },
  "kent-2005": {
    kind: "literature",
    cite: "Kent R, Murakami D, Kobayashi S. Frontal thoracic response to dynamic loading: the role of superficial "
      + "tissues, viscera and the rib cage. Proc IRCOBI Conference 2005:355-365: three cadavers' chests loaded by "
      + "a hub, belts and a distributed load, intact, denuded and eviscerated; Table 3 gives the effective stiffness.",
    link: "https://www.ircobi.org/wordpress/downloads/irc0111/2005/Session6/64.pdf",
  },
  "funk-2004": {
    kind: "literature",
    cite: "Funk JR, Kerrigan JR, Crandall JR. Dynamic bending tolerance and elastic-plastic material properties of "
      + "the human femur. Annu Proc Assoc Adv Automot Med 2004;48:215-233: 15 femurs of 8 men bent to failure at "
      + "mid-shaft in dynamic three-point bending.",
    link: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3217417/",
  },
  "carpanen-2019": {
    kind: "literature",
    cite: "Carpanen D, Masouros SD, Begonia MT, et al. Injury risk of interphalangeal and metacarpophalangeal joints "
      + "under impact loading. J Mech Behav Biomed Mater 2019;97:306-311: cadaver fingers struck axially; the force "
      + "with an even chance of injury, 3.0 kN at the metacarpophalangeal joints and 4.2 kN at the proximal "
      + "interphalangeal ones.",
    link: "https://doi.org/10.1016/j.jmbbm.2019.05.031",
  },
  "owner-fist-threshold": {
    kind: "decision", date: "2026-10-09",
    decided: "\"it makes sense to have a damage threshold with a fist ... for now damage threshold is a simple "
      + "shortcut\", against distinguishing hard and soft surfaces later. The rule, its amount for the owner to "
      + "confirm: a bare hand meeting a body's own surface takes no wound from the first joules of its share, as many as load its "
      + "knuckles to an even chance of injury (carpanen-2019) on the hand's stiffness; past them it is wounded by "
      + "the rest. Against an item it takes its whole share.",
    record: "docs/reference/wounds.md#the-fist",
  },
  "owner-foot-threshold": {
    kind: "decision", date: "2026-10-29",
    decided: "\"yes, give the foot the fist's threshold\": a bare foot meeting a body's own surface takes no wound from "
      + "the first joules of its share, the fist's (owner-fist-threshold), so that a stomp's share no longer empties "
      + "the foot and passes on up the leg. A foot is a segment its body names as a foot end (BearingEndSpec).",
    record: "docs/reference/wounds.md#the-fist",
  },
  "ochman-2011": {
    kind: "literature",
    cite: "Ochman S, Vordemvenne T, Paletta J, Raschke MJ, Meffert RH, Doht S. Experimental fracture model versus "
      + "osteotomy model in metacarpal bone plate fixation. ScientificWorldJournal 2011;11:1692-1698: second "
      + "metacarpals of pigs in three-point bending; the intact bones' bending stiffness.",
    link: "https://doi.org/10.1100/2011/465371",
  },
  "contact-stiffness-gaps": {
    kind: "decision", date: "2026-10-02",
    decided: "Accepted by the owner on 2026-10-24: where no study read gives a part's stiffness under a blunt load, it "
      + "takes a neighbour's: the middle trunk the upper trunk's and the lower trunk the middle's, the upper arm, "
      + "forearm and shank the femur's, the foot the hand's; and the hand's is a porcine metacarpal's in bending, no "
      + "human fist's having been found. The head's is its face's until the head is two surfaces.",
    record: "docs/reference/wounds.md#gaps",
  },
} as const satisfies Readonly<Record<string, Source>>);

export type SourceKey = keyof typeof SOURCES;
