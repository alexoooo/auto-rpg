/**
 * **Everything a spec's numbers rest on.** A `Quantity` taken from a source names one of these
 * (`src/core/spec/quantity.ts`).
 *
 * - `literature`: a published measurement, cited so it can be found.
 * - `asset`: a file in this repository; `where` is a JSON pointer into it.
 * - `tuned`: a value set for a result in play; `for` says in one line what it is set for.
 */
type Source =
  | { readonly kind: "literature"; readonly cite: string; readonly link: string }
  | { readonly kind: "asset"; readonly file: string; readonly what: string }
  | { readonly kind: "tuned"; readonly for: string };

export const SOURCES = Object.freeze({
  "owner-arena-items": {
    kind: "tuned",
    for: "The Arena's first equipment: mass, geometry and contact cones authored for play.",
  },
  "owner-point-load": {
    kind: "tuned",
    for: "A point's or a bite's injury grows with its aligned normal impulse above 1 N, set so a reptile's "
      + "bites end a fight within 30 s and wear a humanoid down.",
  },
  "fall-bar": {
    kind: "tuned",
    for: "The depth under its asked height at which a standing body counts as fallen.",
  },
  "touch-bar": {
    kind: "tuned",
    for: "How near the ground a part but a foot or a hand counts as touching it, so a standing body reads "
      + "as down: about half the least clearance those parts keep while a fighter is up.",
  },
  "rat-anatomy": {
    kind: "asset", file: "assets/rat/body.json",
    what: "The rat's anatomy fitted to Poly Haven's Street Rat (scripts/rat/fit.mjs): trunk, head, jaw, legs under the trunk and tail where the art's are, the head and jaw carried .5 rad above the art's so the open jaw clears the floor (HEAD_RAISE, scripts/rat/landmarks.mjs), and the body standing .08 m above the art on stretched legs (LEG_RAISE); mass, joint ranges, teeth and paw footprint the authored quadruped's (assets/quadruped/authored-body.json), but the hips' second and third axes at ±1.6 rad, the range its righting needs to lever it off its side; the legs' muscles twice the authored torques at 40 rad/s and the weight carried forward to the head (LEG_STRENGTH, LEG_SPEED, WEIGHTS, scripts/rat/fit.mjs), set for a trot at 1 m/s; the neck's torque scaled by the head and jaw's weighted lever about it.",
  },
  "reptile-anatomy": {
    kind: "asset", file: "assets/reptile/body.json",
    what: "The 8 kg sprawling reptile fitted to the grass lizard scan (scripts/reptile/fit.mjs): trunk, head, jaw, legs and tail where the posed art's are, its tail shortened to .28 of the scan's so its footprint fits a Crypt room three times, and light (weights .15 and .08, peaks 1.5 and .6 N m) so the trot is not dragged to a stop. Mass weights, joint limits, muscle ceilings, teeth and paw footprint are the authored quadruped's estimates (assets/quadruped/authored-body.json), the leg joints' unloaded speed (20 rad/s) set for travel at 1.0 m/s or more, the neck's torque scaled by the head and jaw's weighted lever about it.",
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
    kind: "tuned",
    for: "Each foot's extents from the workshop models' clothed envelope, as "
      + "scripts/core/workshop-envelope.mjs prints them.",
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
      + "authored size, rounded to 0.1 mm; written by scripts/core/hand-envelope.mjs --write.",
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
      + "scripts/core/man-envelope.mjs --write.",
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
    kind: "tuned",
    for: "A human at x1 is a typical adult, about 1.76-1.78 m and 78-80 kg for a man; the Rogue keeps her "
      + "own proportions and her size against the Warrior's.",
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
    kind: "tuned",
    for: "The skeleton is human-shaped, weighs 15 kg, and its body is fitted to its bones, approximate and "
      + "low-polygon.",
  },
  "owner-skeleton-motor": {
    kind: "tuned",
    for: "The skeleton's joints are motors: torque falling in a straight line with speed, the same "
      + "strength and speed both ways, each at the muscle's peak power, no tendons.",
  },
  "skeleton-bind": {
    kind: "asset", file: "assets/skeleton/bind.json",
    what: "The skeleton's parts as its art was fitted to them: for each build, each part's position and turn "
      + "(x, y, z, w) in the body frame at x1, facing +z with the soles on 0, and its box's min and max in its "
      + "own frame. Fixed, as the art is.",
  },
  "skeleton-placeholders": {
    kind: "tuned",
    for: "Until the skeleton has numbers of its own it is a typical man in its shape (men's tables, 79 kg, "
      + "6 HP), its fists held thumb up as its art's guard shows them.",
  },
  "skeleton-limbs-clear": {
    kind: "tuned",
    for: "The skeleton's thighs and upper arms are no wider than leaves 4 mm between them and what they "
      + "share no joint with, so its pelvis turns.",
  },
  "owner-hp-pool": {
    kind: "tuned",
    for: "Hit points: reptile 1, Rogue 4, Warrior 6.",
  },
  "owner-life": {
    kind: "tuned",
    for: "Life and limb bars set for health a player reads at a glance: each part group's factor on life, "
      + "each limb's share of full life, crippling at empty and severing.",
  },
  "fdlibm": {
    kind: "literature",
    cite: "fdlibm, Sun Microsystems' freely distributable C math library (1993), as FreeBSD's msun carries it: "
      + "k_sin.c, k_cos.c, k_tan.c, e_rem_pio2.c, k_rem_pio2.c, e_asin.c, e_acos.c, s_atan.c, e_atan2.c, e_exp.c, "
      + "s_expm1.c, e_sinh.c, e_cosh.c, s_cbrt.c and s_scalbn.c. Its notice stands in src/core/math/real.ts.",
    link: "https://github.com/freebsd/freebsd-src/tree/main/lib/msun/src",
  },
  "owner-reaction-time": {
    kind: "tuned",
    for: "A mind sees every other body 0.15 s late, the quick end of a person's response to a seen cue, "
      + "and its own body at once.",
  },
  "owner-balance": {
    kind: "tuned",
    for: "Balance, a character's attribute: the most force its assist gives, a per cent of its weight, "
      + "with 0.0026 weight-metres of moment a per cent; every character's is 0.",
  },
  "owner-haste": {
    kind: "tuned",
    for: "Haste, a character's attribute: the legs' muscles' unloaded speed, a per cent over the human "
      + "baseline; every character's is 0.",
  },
  "owner-toes": {
    kind: "tuned",
    for: "A human figure's toes: the last 0.06 m of the foot at x1, a slab 0.025 m thick, and a toed ankle "
      + "dorsiflexing to 0.8 rad, set so the Warrior stands up from hands and knees.",
  },
  "owner-physique": {
    kind: "tuned",
    for: "A body's physique: size, weight, strength and speed, each a factor that changes one thing, 1 "
      + "where left out.",
  },
  "owner-run-body": {
    kind: "tuned",
    for: "A body's numbers set for a run like a person's, 3-4 m/s: each the value the run is fastest and "
      + "surest at.",
  },
  "owner-skeleton-arms": {
    kind: "tuned",
    for: "The skeleton's arm motors' speed: the least factor over the peak-power line at which its "
      + "straight punch reaches its bar.",
  },
  "owner-rogue-arms": {
    kind: "tuned",
    for: "The Rogue's arm factors: the least at which she stands up best from the target falls in every "
      + "loadout.",
  },
  "owner-punch-body": {
    kind: "tuned",
    for: "A body's numbers set for a punch like a person's: each the value at which the Strike drill's "
      + "punch lands at its bar.",
  },
  "owner-stride-room": {
    kind: "tuned",
    for: "A thigh's capsule leaves 30 mm to the other thigh with the legs hanging straight, so a stride's "
      + "thighs do not meet.",
  },
  "owner-physics-engine": {
    kind: "tuned",
    for: "The core runs on Rapier, the engine the physics bake-off (research/physics-bakeoff/) chose.",
  },
  "rapier-default-friction": {
    kind: "literature",
    cite: "Rapier user guide, Colliders, Friction: a collider's friction coefficient is 0.5 unless it is set.",
    link: "https://rapier.rs/docs/user_guides/javascript/colliders#friction",
  },
  "physics-bakeoff": {
    kind: "tuned",
    for: "Rapier's solver iterations: the cheapest setting that holds a standing human, a whole human and "
      + "a pile at 120 Hz (research/physics-bakeoff/).",
  },
  "owner-command-delay": {
    kind: "tuned",
    for: "A body's command takes effect one step after the step it is made on, the same in every world, so "
      + "each body's mind runs beside the world.",
  },
  "owner-physics-rate": {
    kind: "tuned",
    for: "Physics and control run at 120 Hz.",
  },
  "workshop-volumes": {
    kind: "tuned",
    for: "Each workshop model's skin, feet and clothes closed by voxel flood fill in the bind pose and "
      + "extrapolated to a zero voxel, at the authored size.",
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
    kind: "tuned",
    for: "The wooden club: a 0.45 m haft of 18 mm radius and a 0.25 m swell of 40 mm radius, in ash, a "
      + "real club's dimensions.",
  },
  "owner-weapon-ratios": {
    kind: "tuned",
    for: "Joules per point of wound by kind of blow; every weapon keeps its ratio to blunt.",
  },
  "owner-point-depth": {
    kind: "tuned",
    for: "A point wounds by its depth: past each layer it breaches, as deep as its energy left drives it "
      + "and no deeper than its length, taking hit points by depth over the part's least width.",
  },
  "gilchrist-2008": {
    kind: "literature",
    cite: "Gilchrist MD, Keenan S, Curtis M, Cassidy M, Byrne G, Destrade M (2008). Measuring knife stab penetration "
      + "into skin simulant using a novel biaxial tension device. Forensic Sci Int 177(1):52-65. Four household knives "
      + "into a polyurethane skin simulant under biaxial tension: the force to penetrate was in the order of 20 N "
      + "(18 to 36 N), the energy approximately 0.25 J (0.17 to 0.56 J), the out of plane displacement about 20 mm.",
    link: "https://doi.org/10.1016/j.forsciint.2007.10.010",
  },
  "owner-damage-unit": {
    kind: "tuned",
    for: "One hit point is 100 J of blunt blow.",
  },
  "core-club-unit": {
    kind: "tuned",
    for: "The Warrior's strongest one-handed blow with the wooden club, searched standing and read at a "
      + "rate where it has converged.",
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
  "walk-run-envelope": {
    kind: "asset", file: "assets/core/walk-run-envelope.json",
    what: "How fast the walk and run (src/core/skills/locomotion/walk-run.ts) free to run walked each way with each body as a fight "
      + "plays it, with each thing held: the fastest speed, 0.2-4.5 m/s, at which every walk held, calm and in the lab's "
      + "5 N gusts on four seeds; written by research/core-stance-envelope.mjs --legs walk-run --walks "
      + "--gusts 1:5:1,2,3,4 --write, whose harness it names. It measured no turns.",
  },
  "core-grip": {
    kind: "tuned",
    for: "A hand holds a haft across its knuckles, little finger to index, the haft's surface at the palm; "
      + "a real grip's slant across the palm is left out.",
  },
  "reference-pose-assumptions": {
    kind: "tuned",
    for: "Where no source gives an angle, the reference pose is neutral in neck, spine, hip rotation and "
      + "foot roll, and the shoulder has no adduction past the anatomical position.",
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
    kind: "tuned",
    for: "A bare hand on a body's own surface takes no wound from the first joules of its share, as many "
      + "as load its knuckles to an even chance of injury (carpanen-2019); against an item, its whole "
      + "share.",
  },
  "owner-foot-threshold": {
    kind: "tuned",
    for: "A bare foot has the fist's threshold, so a stomp's share does not empty the foot and pass up the "
      + "leg.",
  },
  "ochman-2011": {
    kind: "literature",
    cite: "Ochman S, Vordemvenne T, Paletta J, Raschke MJ, Meffert RH, Doht S. Experimental fracture model versus "
      + "osteotomy model in metacarpal bone plate fixation. ScientificWorldJournal 2011;11:1692-1698: second "
      + "metacarpals of pigs in three-point bending; the intact bones' bending stiffness.",
    link: "https://doi.org/10.1100/2011/465371",
  },
  "contact-stiffness-gaps": {
    kind: "tuned",
    for: "A part no study gives a blunt stiffness for takes a neighbour's: the middle trunk the upper's, "
      + "the lower the middle's, upper arm, forearm and shank the femur's, the foot the hand's, the hand "
      + "a porcine metacarpal's, the head its face's.",
  },
} as const satisfies Readonly<Record<string, Source>>);

export type SourceKey = keyof typeof SOURCES;
