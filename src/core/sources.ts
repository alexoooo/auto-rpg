/**
 * **Everything a spec's numbers rest on.** A `Quantity` taken from a source names one of these
 * (`src/core/spec/quantity.ts`); `tests/core-spec.test.mjs` checks that each file a source names
 * exists, and reads an asset's number back from the asset.
 *
 * - `literature`: a published measurement, cited so it can be found.
 * - `decision`: the owner's choice, with the date and the record that holds it. A design target is
 *   a decision, not a measurement, and is said to be one.
 * - `asset`: a file in this repository; `where` is a JSON pointer into it.
 * - `measurement`: a number measured from an asset or a run, with how and where the table is.
 */
export type Source =
  | { readonly kind: "literature"; readonly cite: string; readonly link: string }
  | { readonly kind: "decision"; readonly date: string; readonly decided: string; readonly record: string }
  | { readonly kind: "asset"; readonly file: string; readonly what: string }
  | { readonly kind: "measurement"; readonly how: string; readonly record: string };

export const SOURCES = Object.freeze({
  "de-leva-1996": {
    kind: "literature",
    cite: "de Leva P (1996). Adjustments to Zatsiorsky-Seluyanov's segment inertia parameters. "
      + "J Biomech 29(9):1223-1230.",
    link: "https://doi.org/10.1016/0021-9290(95)00178-6",
  },
  "winter-table-4-1": {
    kind: "literature",
    cite: "Winter DA. Biomechanics and Motor Control of Human Movement, Table 4.1 (anthropometric data; "
      + "segment densities from Dempster 1955 via Miller & Nelson 1973 and Plagenhoef 1971).",
    link: "https://courses.grainger.illinois.edu/me481/sp2021/Anthro-Winter.pdf",
  },
  "workshop-envelope": {
    kind: "measurement",
    how: "scripts/core/workshop-envelope.mjs on public/assets/humanoid/workshop-*.glb: the extents of the "
      + "clothed envelope's vertices that a foot's bones weigh most on, body frame, authored size, "
      + "rounded to 0.1 mm. tests/core-human.test.mjs measures them again.",
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
      + "by scripts/core/workshop-envelope.mjs --write, and measured again by tests/core-human.test.mjs.",
  },
  "workshop-rogue-trunk-hull": {
    kind: "asset", file: "assets/humanoid/workshop-rogue-trunk-hull.json",
    what: "The Rogue's trunk segments' surfaces, as the Warrior's.",
  },
  "workshop-fighter-glb": {
    kind: "asset", file: "public/assets/humanoid/workshop-fighter.glb",
    what: "The Warrior's model; a pointer is into its glTF JSON chunk.",
  },
  "workshop-rogue-glb": {
    kind: "asset", file: "public/assets/humanoid/workshop-rogue.glb",
    what: "The Rogue's model; a pointer is into its glTF JSON chunk.",
  },
  "owner-typical-adult": {
    kind: "decision", date: "2026-09-27",
    decided: "A human at x1 is a typical adult, about 1.76-1.78 m and 78-80 kg for a man; the Rogue "
      + "keeps its own proportions and its size against the Warrior's.",
    record: "docs/plans/2026-09-27-warrior-rogue-reptile.md",
  },
  "cgpm-1901": {
    kind: "literature",
    cite: "3rd General Conference on Weights and Measures (CGPM), 1901: Declaration on the unit of mass "
      + "and on the definition of weight; conventional value of gn, 980.665 cm/s2.",
    link: "https://www.bipm.org/en/committees/cg/cgpm/3-1901/resolution-",
  },
  "owner-hp-pool": {
    kind: "decision", date: "2026-09-27",
    decided: "Hit points: reptile 1, Rogue 4, Warrior 6. One HP pool per body; excess damage spreads to "
      + "neighbouring parts, nearest and inward first; the body dies when its HP is gone or its head is "
      + "emptied. A part severs on its overkill, as the old game's health below -0.5 x max.",
    record: "docs/plans/2026-09-27-warrior-rogue-reptile.md",
  },
  "owner-part-hp-split": {
    kind: "decision", date: "2026-09-29",
    decided: "A core human's hit points are split over its segments by cross-section: each segment's "
      + "share is its mass to the two-thirds over the sum of the same over the body.",
    record: "docs/plans/2026-09-28-core-foundation.md",
  },
  "owner-physics-rate": {
    kind: "decision", date: "2026-09-25",
    decided: "Physics and control run at 120 Hz, from the release of 2026-09-25.",
    record: "docs/history.md#h66",
  },
  "workshop-volumes": {
    kind: "measurement",
    how: "Each model's skin, feet, jacket, trousers, collar and belt, closed by voxel flood fill in the "
      + "bind pose and extrapolated to a zero voxel from grids of 4.5 to 8 mm, at the authored size.",
    record: "docs/analysis/2026-09-27-human-strike-reference.md#8-the-workshop-models",
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
    cite: "Hallaçeli H, Uruç V, Uysal HH, Özden R, Hallaçeli Ç, Soyuer F, İnce Parpucu T, Yengil E, "
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
    cite: "Danneskiold-Samsøe B, Bartels EM, Bülow PM, Lund H, Stockmarr A, Holm CC, Wätjen I, "
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
    cite: "Axelsson P, Fredrikson P, Nilsson A, Andersson JK, Kärrholm J (2018). Forearm torque and "
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
      + "Its dimensions were set by the session that made it, as a real club's rather than a tuning, and have "
      + "stood in the game since.",
    record: "src/golem/config.ts",
  },
  "core-grip": {
    kind: "decision", date: "2026-09-29",
    decided: "Recorded, not asked (core stage 5): a hand holds a haft across its knuckles, from the little finger's "
      + "to the index finger's, with the butt at the little finger's knuckle and the axis on the palm side of the "
      + "middle finger's knuckle, the haft's surface at the palm: the hand's capsule radius from the knuckle. A "
      + "real grip crosses the palm at a slant; this one does not.",
    record: "docs/plans/2026-09-28-core-foundation.md",
  },
  "stage1-assumptions": {
    kind: "decision", date: "2026-09-28",
    decided: "Proposed in core stage 1, for the owner to confirm: where no source or measurement gives an "
      + "angle, the workshop models' reference pose is taken as neutral in neck and spine, hip rotation "
      + "and foot roll; and the shoulder has no adduction beyond the anatomical position, since the "
      + "trunk is in the way.",
    record: "docs/analysis/2026-09-27-human-strike-reference.md#9-joint-ranges-and-strengths-for-the-core-human",
  },
} as const satisfies Readonly<Record<string, Source>>);

export type SourceKey = keyof typeof SOURCES;
