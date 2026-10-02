/**
 * **Recipes for a test** that wants a blow that is not the repertoire's to change, each with its
 * window as it was measured on a head-sized mark and its net at a hung head (Node core stand,
 * Rapier, 120 Hz, the arena's rulebook).
 */

/**
 * **A fast straight**, for a test that wants a hard blow of a bare right hand: the Warrior's,
 * found by a search that scored a straight from the guard by its fist's forward speed into a
 * head-sized mark (9.5 m/s at 960 Hz), its target straight ahead of the head.
 */
export const WARRIOR_STRAIGHT = Object.freeze({
  "model": "workshop-fighter",
  "held": "fist",
  "band": "high",
  "strike": {
    "name": "searched right straight",
    "hand": "right",
    "pushes": [
      {
        "channel": "thoracic rotation right",
        "sense": -1,
        "from": 0.12185710500979843,
        "to": 0.26286377360248714,
        "level": 0.44434518368168885
      },
      {
        "channel": "thoracic flexion",
        "sense": -1,
        "from": 0.13463757002196422,
        "to": 0.17330513559689525,
        "level": 1
      },
      {
        "channel": "thoracic lateral flexion right",
        "sense": 1,
        "from": 0.05938494350680515,
        "to": 0.2244318160600191,
        "level": 0.1482711089640257
      },
      {
        "channel": "shoulder.right flexion",
        "sense": 1,
        "from": 0,
        "to": 0.1882055345324896,
        "level": 0.998104265562214
      },
      {
        "channel": "shoulder.right abduction",
        "sense": -1,
        "from": 0.2903074637314782,
        "to": 0.4646573067361912,
        "level": 1
      },
      {
        "channel": "elbow.right flexion",
        "sense": -1,
        "from": 0.2519900253770776,
        "to": 0.48630152675003163,
        "level": 0.9181564427444091
      }
    ]
  },
  "place": {
    "ahead": 0.479,
    "up": 0
  },
  "found": "a fixture: the straight a search found by its fist's forward speed into a head-sized mark",
  "window": {
    "along": [
      -0.02,
      0.08
    ],
    "across": [
      -0.14,
      0
    ],
    "up": [
      -0.02,
      0.1
    ]
  },
  "net": -0.028
});

/**
 * **The Rogue's straight**, found as the Warrior's was (8.1 m/s at 960 Hz): its fist and the
 * forearm behind it both land on a head in its window.
 */
export const ROGUE_STRAIGHT = Object.freeze({
  "model": "workshop-rogue",
  "held": "fist",
  "band": "high",
  "strike": {
    "name": "searched right straight",
    "hand": "right",
    "pushes": [
      {
        "channel": "thoracic rotation right",
        "sense": -1,
        "from": 0.2468148735424247,
        "to": 0.3999377301313438,
        "level": 0.2038024312696961
      },
      {
        "channel": "lumbar rotation right",
        "sense": -1,
        "from": 0.12388712474175834,
        "to": 0.2807975134559946,
        "level": 0.7599331149050009
      },
      {
        "channel": "thoracic lateral flexion right",
        "sense": 1,
        "from": 0.20154501335439934,
        "to": 0.37904383861079205,
        "level": 0.666618632937466
      },
      {
        "channel": "shoulder.right flexion",
        "sense": 1,
        "from": 0.0262435824484234,
        "to": 0.20684814309172403,
        "level": 0.6780481637151463
      },
      {
        "channel": "shoulder.right abduction",
        "sense": -1,
        "from": 0.24736957067177975,
        "to": 0.43543044561320754,
        "level": 1
      },
      {
        "channel": "shoulder.right internal rotation",
        "sense": -1,
        "from": 0.17507924991569662,
        "to": 0.256306359544828,
        "level": 0.3025614918791635
      },
      {
        "channel": "elbow.right flexion",
        "sense": -1,
        "from": 0.27368295939207854,
        "to": 0.47032533929899917,
        "level": 0.991256355391015
      }
    ]
  },
  "place": {
    "ahead": 0.403,
    "up": 0
  },
  "found": "a fixture: the straight a search found by its fist's forward speed into a head-sized mark",
  "window": {
    "along": [
      -0.08,
      0.02
    ],
    "across": [
      -0.02,
      0.08
    ],
    "up": [
      -0.06,
      0.08
    ]
  },
  "net": -0.022
});

/**
 * **A club blow**, the Warrior's with the wooden club in its right hand: found by a search that
 * scored the swell's speed into a head-sized mark, with a chamber before its pushes; its window
 * runs from over the head to 0.58 m under it.
 */
export const WARRIOR_CLUB_BLOW = Object.freeze({
  "model": "workshop-fighter",
  "held": "wooden club",
  "band": "high",
  "strike": {
    "name": "searched right club blow",
    "hand": "right",
    "chamber": {
      "seconds": 0.5680725576425553,
      "pose": {
        "thoracic rotation right": -0.026714900954498688,
        "shoulder.right flexion": 2.896265346888592,
        "shoulder.right abduction": 1.2772011979051856,
        "shoulder.right internal rotation": 0.2563398675572923,
        "elbow.right flexion": 1.2578507567605721,
        "wrist.right flexion": 1.021194350613254,
        "wrist.right radial deviation": -0.5281400911855298,
        "wrist.right pronation": 0.3221298557344603
      }
    },
    "pushes": [
      {
        "channel": "thoracic rotation right",
        "sense": -1,
        "from": 0.07033728967269667,
        "to": 0.20927081108745924,
        "level": 0.4315629261847498
      },
      {
        "channel": "thoracic flexion",
        "sense": 1,
        "from": 0.060493824440181775,
        "to": 0.17947813993604178,
        "level": 0.18430851278571775
      },
      {
        "channel": "thoracic lateral flexion right",
        "sense": 1,
        "from": 0.16037400785238345,
        "to": 0.3143078241117403,
        "level": 0.556457458946644
      },
      {
        "channel": "lumbar flexion",
        "sense": 1,
        "from": 0.029711507143819652,
        "to": 0.3061421122151833,
        "level": 0.9648700158789313
      },
      {
        "channel": "shoulder.right flexion",
        "sense": -1,
        "from": 0,
        "to": 0.12239353359840516,
        "level": 0.23711942856265886
      },
      {
        "channel": "shoulder.right abduction",
        "sense": -1,
        "from": 0.11941362635613761,
        "to": 0.27330829776988674,
        "level": 0.986967867726512
      },
      {
        "channel": "shoulder.right internal rotation",
        "sense": 1,
        "from": 0.17736530718717608,
        "to": 0.2971600342317118,
        "level": 0.3456758069347265
      },
      {
        "channel": "elbow.right flexion",
        "sense": -1,
        "from": 0.06396122857306648,
        "to": 0.3336912315943339,
        "level": 0.9259173704930284
      },
      {
        "channel": "wrist.right flexion",
        "sense": 1,
        "from": 0.17784641165539875,
        "to": 0.34211547397359326,
        "level": 0.8541741379444527
      },
      {
        "channel": "wrist.right radial deviation",
        "sense": -1,
        "from": 0.09223198594787203,
        "to": 0.34615271808976705,
        "level": 0.9590302635041966
      },
      {
        "channel": "wrist.right pronation",
        "sense": 1,
        "from": 0.22188715042097815,
        "to": 0.40151788299072494,
        "level": 0.12306155678220713
      }
    ]
  },
  "place": {
    "ahead": 1.05,
    "up": 0
  },
  "found": "a fixture: the club blow a search found by its swell's speed into a head-sized mark",
  "window": {
    "along": [
      -0.02,
      0.08
    ],
    "across": [
      -0.04,
      0
    ],
    "up": [
      -0.58,
      0.2
    ]
  },
  "net": 0.981
});

/** The three, as a repertoire. */
export const FIXTURE_REPERTOIRE = Object.freeze([WARRIOR_STRAIGHT, ROGUE_STRAIGHT, WARRIOR_CLUB_BLOW]);
