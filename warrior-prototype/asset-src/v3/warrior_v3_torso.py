"""Three authored torso-to-waist designs for the warrior-v3 screen.

Each design replaces the same set of control nodes with one coherent subsystem:
a front plate, a back plate, the shoulder and armhole transition, a lower rib
and waist transition, a belted waist, an articulated fauld, and mail that closes
the crotch and upper thigh. The designs are meant to be told apart at a glance,
not to differ by a scalar.

Column indices below address the ring produced by ``plates.ring``. Column ``0``
is the front centre line, column ``11`` is the back centre line, and columns
``12``-``21`` mirror the sword side of the body.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path


_spec = importlib.util.spec_from_file_location(
    "warrior_v3_plates", Path(__file__).resolve().parent / "warrior_v3_plates.py")
plates = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(plates)


VARIANTS = ("forged-cuirass", "lamellar-waist", "battleworn-plate")

# Control nodes this subsystem takes ownership of. Everything else -- head,
# arms, legs, equipment, gorget, cross-body strap, cloth -- stays untouched.
REMOVED = (
    "padded_torso", "cuirass_mass", "breastplate", "breastplate_shadow",
    "cuirass_ridge_0", "cuirass_ridge_1", "cuirass_ridge_2", "cuirass_ridge_3",
    "belt", "belt_buckle",
    "fauld_0", "fauld_1", "fauld_2",
    "fauld_edge_0", "fauld_edge_1", "fauld_edge_2",
)

# The front and back plates stop short of each other at the widest point of the
# flank. The strip between them is where the mail under-layer shows through,
# which is what gives the plate boundary an edge to read against.
FRONT_COLUMNS = (17, 18, 19, 20, 21, 0, 1, 2, 3, 4, 5)
BACK_COLUMNS = (7, 8, 9, 10, 11, 12, 13, 14, 15)
RIGHT_HIP_COLUMNS = (2, 3, 4, 5)
LEFT_HIP_COLUMNS = (17, 18, 19, 20)

# A forged section. The corners are placed so a crease threshold of about
# twenty degrees catches exactly five folds per side -- the centre keel, its
# flank, the front chamfer, the rear chamfer and the spine ridge -- and leaves
# the broad planes between them smooth.
FORGED_PROFILE = (
    (0.000, -1.000, 1.00), (0.100, -1.000, 0.15), (0.340, -0.995, 0.00),
    (0.600, -0.960, 0.00), (0.800, -0.870, 0.00), (0.950, -0.560, 0.00),
    (1.000, -0.120, 0.00), (0.985, 0.330, 0.00), (0.880, 0.720, 0.00),
    (0.620, 0.925, 0.00), (0.150, 0.940, 0.00), (0.000, 1.060, 0.00),
)

# An anatomical section: the centre line falls back into a sternum groove and
# the pectoral plane just outboard of it carries the fullest depth.
ANATOMICAL_PROFILE = (
    (0.000, -0.900, 0.00), (0.150, -1.000, 0.00), (0.380, -0.990, 0.00),
    (0.620, -0.940, 0.00), (0.810, -0.845, 0.00), (0.955, -0.540, 0.00),
    (1.000, -0.110, 0.00), (0.985, 0.335, 0.00), (0.880, 0.725, 0.00),
    (0.620, 0.930, 0.00), (0.150, 0.945, 0.00), (0.000, 1.055, 0.00),
)

# A slab section: a broad, nearly flat front carried out to a late and abrupt
# chamfer, so the plate reads as heavy stock rather than as a fitted shell.
SLAB_PROFILE = (
    (0.000, -1.000, 0.30), (0.200, -1.000, 0.10), (0.480, -0.998, 0.00),
    (0.740, -0.985, 0.00), (0.900, -0.930, 0.00), (0.990, -0.680, 0.00),
    (1.000, -0.180, 0.00), (0.990, 0.320, 0.00), (0.900, 0.740, 0.00),
    (0.640, 0.945, 0.00), (0.160, 0.955, 0.00), (0.000, 1.045, 0.00),
)

# The soft body worn under the plate. It is rounder on purpose: it is a filler
# layer that shows at the arm gaps and the flank seam, never a primary edge.
MAIL_PROFILE = (
    (0.000, -1.000, 0.00), (0.230, -0.980, 0.00), (0.460, -0.935, 0.00),
    (0.680, -0.845, 0.00), (0.850, -0.640, 0.00), (0.965, -0.270, 0.00),
    (1.000, 0.180, 0.00), (0.955, 0.580, 0.00), (0.800, 0.850, 0.00),
    (0.560, 0.970, 0.00), (0.290, 1.010, 0.00), (0.000, 1.030, 0.00),
)

# Armhole drop at the flanks and a small throat notch on the centre line.
FRONT_TOP_EDGE = (-0.230, -0.170, -0.090, -0.020, 0.010, -0.046,
                  0.010, -0.020, -0.090, -0.170, -0.230)
# Where the upper plate laps down over the plackart.
UPPER_BOTTOM_EDGE = (0.030, 0.024, 0.012, -0.002, -0.012, -0.018,
                     -0.012, -0.002, 0.012, 0.024, 0.030)
# The plackart point, which the belt is then worn over.
PLACKART_BOTTOM_EDGE = (0.026, 0.022, 0.014, 0.004, -0.006, -0.014,
                        -0.006, 0.004, 0.014, 0.022, 0.026)
BACK_TOP_EDGE = (-0.150, -0.078, -0.014, 0.014, 0.026, 0.014, -0.014, -0.078, -0.150)
# Where the back plate laps down over the culet.
BACK_UPPER_BOTTOM_EDGE = (0.026, 0.018, 0.006, -0.004, -0.010, -0.004, 0.006,
                          0.018, 0.026)
BACK_BOTTOM_EDGE = (0.004, 0.008, 0.012, 0.016, 0.020, 0.016, 0.012, 0.008, 0.004)

# A fauld hangs lower at the front than it does over the hips.
FAULD_HEM = (-0.018, -0.016, -0.013, -0.008, -0.004, -0.001, 0.000, 0.000, 0.000,
             0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, -0.001,
             -0.004, -0.008, -0.013, -0.016)
TASSET_HEM = (-0.004, -0.014, -0.018, -0.012)

# The battle-worn belt is deliberately not level: it rides up on the sword side
# and hangs on the shield side.
CANTED_BELT = (-0.010, -0.007, -0.004, -0.001, 0.001, 0.003, 0.004, 0.004, 0.003,
               0.002, 0.001, 0.000, -0.003, -0.006, -0.010, -0.014, -0.018,
               -0.021, -0.022, -0.020, -0.017, -0.014)


def _stations(profile, rows, lift=0.0):
    return [plates.station(profile, z, width, front, back, keel, lift)
            for z, width, front, back, keel in rows]


def _band(profile, top, bottom, lift=0.0):
    return _stations(profile, (top, bottom), lift)


def _slice(sections, top, bottom):
    """Cut a plate out of a taller loft at two authored heights."""
    span = range(len(sections[0][1]))
    def at(z):
        return (z, [plates.sample(sections, z, column) for column in span])
    kept = [entry for entry in sections if bottom < entry[0] < top]
    return [at(top)] + kept + [at(bottom)]


def _lifted(sections, amount):
    return [(z, plates.inflate(points, amount)) for z, points in sections]


def _cuirass(profile, rows, materials, root, thickness=0.017,
             seam=(1.180, 1.240), lap=0.018):
    """A breastplate lapping down over a plackart, closed by one back plate.

    The horizontal lap is what stops the front reading as a single continuous
    shell. It is a construction line, not a decoration: the upper plate is
    pushed proud of the lower one so the seam casts its own shadow.
    """
    steel = materials["steel"]
    sections = _stations(profile, rows)
    plates.surface("cuirass_breastplate",
                   _lifted(_slice(sections, sections[0][0], seam[0]), lap),
                   steel, root, columns=FRONT_COLUMNS, thickness=thickness,
                   top_edge=FRONT_TOP_EDGE, bottom_edge=UPPER_BOTTOM_EDGE)
    plates.surface("cuirass_plackart",
                   _slice(sections, seam[1], sections[-1][0]),
                   steel, root, columns=FRONT_COLUMNS, thickness=thickness,
                   bottom_edge=PLACKART_BOTTOM_EDGE)
    plates.surface("cuirass_backplate",
                   _lifted(_slice(sections, sections[0][0], seam[0]), lap),
                   steel, root, columns=BACK_COLUMNS, thickness=thickness,
                   top_edge=BACK_TOP_EDGE, bottom_edge=BACK_UPPER_BOTTOM_EDGE)
    plates.surface("cuirass_culet",
                   _slice(sections, seam[1], sections[-1][0]),
                   steel, root, columns=BACK_COLUMNS, thickness=thickness,
                   bottom_edge=BACK_BOTTOM_EDGE)


def _underlayer(rows, materials, root):
    plates.surface("torso_underlayer", _stations(MAIL_PROFILE, rows),
                   materials["black"], root, cap=True, bevel=0.0,
                   sharp_degrees=52.0, region="torso",
                   material_class="mail_underlayer")


def _mail_skirt(rows, materials, root):
    plates.surface("fauld_mail_skirt", _stations(MAIL_PROFILE, rows),
                   materials["black"], root, cap=True, bevel=0.0,
                   sharp_degrees=52.0, region="waist",
                   material_class="mail_underlayer")


def _belt(profile, top, bottom, materials, root, lift=0.016, edge=None):
    plates.surface("belt", _band(profile, top, bottom, lift), materials["leather"],
                   root, thickness=0.012, top_edge=edge, bottom_edge=edge,
                   sharp_degrees=42.0, bevel=0.003, region="waist",
                   material_class="leather")


def _buckle(profile, rows, materials, root, lift=0.032):
    plates.surface("belt_buckle", _stations(profile, rows, lift), materials["brass"],
                   root, columns=(21, 0, 1), thickness=0.010, bevel=0.003,
                   region="waist", material_class="dark_plate")


def _lames(profile, lames, materials, root, hem=FAULD_HEM):
    """Articulated waist plates, each lapping over the one below it."""
    for index, (top, bottom, lift) in enumerate(lames):
        plates.surface(f"fauld_lame_{index}", _band(profile, top, bottom, lift),
                       materials["steel"], root, thickness=0.015,
                       bottom_edge=hem if index == len(lames) - 1 else None,
                       sharp_degrees=30.0, region="waist",
                       material_class="dark_plate")


def _tasset(name, profile, rows, columns, materials, root, lift=0.010,
            thickness=0.014):
    plates.surface(name, _stations(profile, rows, lift), materials["steel"], root,
                   columns=columns, thickness=thickness, bottom_edge=TASSET_HEM,
                   sharp_degrees=30.0, region="waist", material_class="dark_plate")


def forged_cuirass(materials, root):
    """One broad forged cuirass flowing into a short integrated fauld."""
    _underlayer(((1.510, .166, .116, .108, 0), (1.460, .234, .168, .142, 0),
                 (1.350, .272, .196, .162, 0), (1.220, .278, .196, .170, 0),
                 (1.100, .256, .184, .166, 0), (1.010, .224, .160, .150, 0),
                 (0.900, .240, .172, .160, 0), (0.845, .246, .175, .162, 0)),
                materials, root)
    _cuirass(FORGED_PROFILE,
             ((1.500, .214, .148, .128, .020), (1.440, .264, .190, .156, .028),
              (1.345, .306, .218, .176, .034), (1.225, .310, .218, .184, .030),
              (1.105, .284, .200, .178, .022), (1.010, .248, .174, .160, .012),
              (0.940, .264, .184, .168, .008)), materials, root)
    _belt(FORGED_PROFILE, (0.972, .254, .180, .166, 0), (0.892, .252, .179, .165, 0),
          materials, root)
    _buckle(FORGED_PROFILE, ((0.958, .256, .181, .167, 0), (0.925, .258, .182, .168, 0),
                             (0.898, .256, .181, .167, 0)), materials, root)
    _lames(FORGED_PROFILE, (
        ((0.912, .264, .186, .170, 0), (0.850, .282, .198, .180, 0), .012),
        ((0.860, .284, .199, .181, 0), (0.796, .302, .211, .192, 0), .006),
        ((0.806, .304, .212, .193, 0), (0.735, .320, .223, .203, 0), .000),
    ), materials, root)
    for name, columns in (("fauld_tasset_right", RIGHT_HIP_COLUMNS),
                          ("fauld_tasset_left", LEFT_HIP_COLUMNS)):
        _tasset(name, FORGED_PROFILE, ((0.790, .312, .218, .198, 0),
                                       (0.720, .318, .222, .202, 0),
                                       (0.655, .312, .218, .198, 0)),
                columns, materials, root)
    _mail_skirt(((0.870, .246, .176, .162, 0), (0.790, .262, .186, .172, 0),
                 (0.710, .276, .196, .180, 0), (0.650, .280, .198, .182, 0)),
                materials, root)


def lamellar_waist(materials, root):
    """An anatomical cuirass over an explicitly overlapping three-lame waist."""
    _underlayer(((1.510, .182, .116, .108, 0), (1.460, .256, .174, .144, 0),
                 (1.344, .302, .208, .164, 0), (1.224, .310, .206, .174, 0),
                 (1.110, .286, .188, .170, 0), (1.028, .250, .162, .154, 0),
                 (0.930, .268, .176, .164, 0), (0.870, .274, .179, .166, 0)),
                materials, root)
    _cuirass(ANATOMICAL_PROFILE,
             ((1.500, .232, .148, .130, 0), (1.438, .286, .200, .156, 0),
              (1.336, .332, .234, .178, 0), (1.228, .340, .226, .188, 0),
              (1.118, .312, .202, .184, 0), (1.030, .272, .176, .164, 0),
              (0.962, .288, .188, .172, 0)), materials, root,
             thickness=0.019, seam=(1.190, 1.250))
    _belt(ANATOMICAL_PROFILE, (0.995, .282, .184, .170, 0),
          (0.915, .280, .183, .169, 0), materials, root)
    _buckle(ANATOMICAL_PROFILE, ((0.982, .284, .185, .171, 0),
                                 (0.950, .286, .186, .172, 0),
                                 (0.922, .284, .185, .171, 0)), materials, root)
    lames = (((0.930, .292, .190, .175, 0), (0.868, .308, .200, .184, 0), .014),
             ((0.878, .310, .202, .185, 0), (0.812, .330, .214, .196, 0), .007),
             ((0.822, .332, .216, .197, 0), (0.752, .354, .230, .209, 0), .000))
    _lames(ANATOMICAL_PROFILE, lames, materials, root)
    # A rolled edge on each lame is the signature of this design: it is what
    # makes the over/under order legible instead of reading as stacked shelves.
    for index, (_, bottom, lift) in enumerate(lames):
        z, width, front, back, _ = bottom
        plates.surface(f"fauld_edge_{index}", _band(
            ANATOMICAL_PROFILE, (z + .012, width, front, back, 0),
            (z - .004, width, front, back, 0), lift + .008),
            materials["bright"], root, thickness=0.006, sharp_degrees=44.0,
            bevel=0.002, region="waist", material_class="bright_edge")
    _mail_skirt(((0.890, .278, .182, .168, 0), (0.800, .296, .193, .178, 0),
                 (0.730, .308, .200, .184, 0), (0.688, .312, .203, .186, 0)),
                materials, root)


def battleworn_plate(materials, root):
    """An asymmetric, field-repaired plate system with a canted belt."""
    steel = materials["steel"]
    rows = ((1.505, .244, .156, .138, .014), (1.445, .296, .200, .164, .020),
            (1.350, .342, .230, .186, .024), (1.230, .350, .234, .196, .022),
            (1.110, .330, .216, .190, .016), (1.005, .298, .194, .178, .010),
            (0.938, .312, .204, .186, .006))
    _underlayer(((1.510, .188, .120, .112, 0), (1.460, .262, .176, .148, 0),
                 (1.350, .306, .204, .170, 0), (1.226, .318, .210, .180, 0),
                 (1.102, .300, .196, .176, 0), (1.000, .272, .178, .164, 0),
                 (0.898, .288, .188, .172, 0), (0.842, .294, .191, .174, 0)),
                materials, root)
    sections = _stations(SLAB_PROFILE, rows)
    # The front is two plates with the seam carried off the centre line, so the
    # mass stays bilateral while the construction does not.
    plates.surface("cuirass_breastplate", sections, steel, root,
                   columns=(17, 18, 19, 20, 21, 0, 1), thickness=0.018,
                   top_edge=(-0.230, -0.170, -0.090, -0.020, 0.010, -0.046, 0.010),
                   bottom_edge=(0.026, 0.022, 0.014, 0.004, -0.006, -0.014, -0.006))
    plates.surface("cuirass_lap_plate", _lifted(sections, .012), steel, root,
                   columns=(0, 1, 2, 3, 4, 5), thickness=0.018,
                   top_edge=(-0.046, 0.010, -0.020, -0.090, -0.170, -0.230),
                   bottom_edge=(-0.014, -0.006, 0.004, 0.014, 0.022, 0.026))
    plates.surface("cuirass_backplate", sections, steel, root,
                   columns=BACK_COLUMNS, thickness=0.018,
                   top_edge=BACK_TOP_EDGE, bottom_edge=BACK_BOTTOM_EDGE)
    # A scavenged reinforcing plate riveted over the shield-side chest.
    plates.surface("cuirass_reinforce", _stations(SLAB_PROFILE, (
        (1.395, .338, .228, .184, .022), (1.270, .348, .232, .194, .022),
        (1.150, .328, .214, .189, .016)), .022), steel, root,
        columns=(18, 19, 20), thickness=0.013, sharp_degrees=30.0)
    _belt(SLAB_PROFILE, (0.978, .306, .200, .184, 0), (0.898, .304, .199, .183, 0),
          materials, root, edge=CANTED_BELT)
    _buckle(SLAB_PROFILE, ((0.964, .308, .201, .185, 0), (0.932, .310, .202, .186, 0),
                           (0.904, .308, .201, .185, 0)), materials, root, lift=.034)
    _lames(SLAB_PROFILE, (
        ((0.906, .314, .205, .188, 0), (0.842, .332, .216, .197, 0), .010),
        ((0.852, .334, .217, .198, 0), (0.778, .354, .230, .209, 0), .000),
    ), materials, root)
    for name, columns, bottom in (("fauld_tasset_right", RIGHT_HIP_COLUMNS, 0.700),
                                  ("fauld_tasset_left", LEFT_HIP_COLUMNS, 0.664)):
        _tasset(name, SLAB_PROFILE, (
            (0.800, .344, .224, .203, 0), ((0.800 + bottom) / 2, .350, .228, .206, 0),
            (bottom, .346, .226, .204, 0)), columns, materials, root,
            lift=.012, thickness=0.015)
    _mail_skirt(((0.874, .284, .185, .171, 0), (0.792, .300, .195, .181, 0),
                 (0.722, .312, .203, .187, 0), (0.674, .316, .206, .189, 0)),
                materials, root)


BUILDERS = {
    "forged-cuirass": forged_cuirass,
    "lamellar-waist": lamellar_waist,
    "battleworn-plate": battleworn_plate,
}


def build(variant, materials, root):
    BUILDERS[variant](materials, root)
