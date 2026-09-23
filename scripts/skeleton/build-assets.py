"""Fit the CC0 anatomical skeleton onto the physics skeleton's parts and write skeleton.glb.

Run: blender --background --disable-autoexec assets/skeleton/skeleton-source.blend \
       --python scripts/skeleton/build-assets.py -- assets/skeleton/bind.json public/assets/skeleton/skeleton.glb [.review]

Every piece is rigid: one mesh per physics part, written in that part's host-local frame in the
game's own left-handed coordinates (+Y up, +Z forward, +X the body's right), so the runtime parents
it at the identity transform and converts nothing. A standard glTF viewer therefore shows the model
mirrored; `extras.frame` says so. Source bones are placed by anatomical landmarks (femoral heads,
humeral heads, joint ends) onto the physics joints read from bind.json.
"""
import bpy, json, math, struct, sys
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion, noise
from mathutils.bvhtree import BVHTree

args = sys.argv[sys.argv.index('--') + 1:]
bind = json.loads(Path(args[0]).read_text())
out = Path(args[1]); out.parent.mkdir(parents=True, exist_ok=True)
review = Path(args[2]) if len(args) > 2 else None

# ------------------------------------------------------------------------------------ targets
PREFIX = "left.golem."
hosts = {}
for r in bind:
    if r['build'] != 'fist/fist': continue
    x, y, z, w = r['rotation']
    hosts[r['id'][len(PREFIX):]] = dict(pos=Vector(r['position']), rot=Quaternion((w, x, y, z)),
        size=Vector([b - a for a, b in zip(r['min'], r['max'])]))
def along(key, local): return hosts[key]['rot'] @ Vector(local)
def end(key, sign): h = hosts[key]; return h['pos'] + along(key, (0, 1, 0)) * (sign * h['size'].y / 2)

# ------------------------------------------------------------------------------------- source
SX = bpy.data.objects['GEO-skeletion.skull'].matrix_world.translation.x
def to_game(v): return np.array((-(v[0] - SX), v[2], -v[1]))  # a reflection: CCW winding becomes CW

class Geo:
    """Triangles with per-corner UVs, in game coordinates."""
    def __init__(self, P, N, T, UV): self.P, self.N, self.T, self.UV = P, N, T, UV
    def copy(self): return Geo(self.P.copy(), self.N.copy(), self.T.copy(), self.UV.copy())
    def affine(self, A, t):
        A = np.asarray(A, float)
        self.P = self.P @ A.T + t
        n = self.N @ np.linalg.inv(A)  # inverse transpose, row vectors
        self.N = n / np.linalg.norm(n, axis=1, keepdims=True)
        return self

def load(name):
    obj = bpy.data.objects['GEO-skeletion.' + name]
    me = obj.data; mw = obj.matrix_world
    me.calc_loop_triangles()
    P = np.array([to_game(mw @ v.co) for v in me.vertices])
    nm = mw.to_3x3().inverted().transposed()
    N = np.array([(lambda n: (-n.x, n.z, -n.y))(nm @ v.normal) for v in me.vertices])
    N /= np.linalg.norm(N, axis=1, keepdims=True)
    uv = me.uv_layers.active.data
    T = np.array([t.vertices[:] for t in me.loop_triangles])
    UV = np.array([[uv[l].uv[:] for l in t.loops] for t in me.loop_triangles])
    return Geo(P, N, T, UV)

def group(names): return [load(n) for n in names]
def points(geos): return np.concatenate([g.P for g in geos])

def pca(P):
    c = P.mean(0); _, _, vt = np.linalg.svd(P - c, full_matrices=False); return vt
def band(P, axis, which, width):
    t = P @ axis
    return P[t < t.min() + width] if which == 'min' else P[t > t.max() - width]
def medial_cap(P, down, width):
    """Centre of a long bone's head: a sphere fitted to the medial half of its proximal end."""
    cap = band(P, down, 'min', width)
    cap = cap[np.abs(cap[:, 0]) <= np.median(np.abs(cap[:, 0]))]
    A = np.column_stack((2 * cap, np.ones(len(cap))))
    c = np.linalg.lstsq(A, (cap ** 2).sum(1), rcond=None)[0]
    return c[:3]
def ends(P, down, width=.02):
    """Centres of the proximal and distal bands along the bone's own principal axis."""
    a = pca(P)[0]
    if a @ down < 0: a = -a
    return band(P, a, 'min', width).mean(0), band(P, a, 'max', width).mean(0)

# ---------------------------------------------------------------------------------- fitting
def frame(axis, anterior):
    a = axis / np.linalg.norm(axis)
    f = anterior - a * (anterior @ a); f /= np.linalg.norm(f)
    return np.column_stack((np.cross(a, f), a, f))
def fit_axis(Ps, Ds, fs, Pt, Dt, ft, s):
    """Two-point fit: stretch along the bone to the physics joint spacing, `s` across it."""
    k = np.linalg.norm(Dt - Pt) / np.linalg.norm(Ds - Ps)
    Fs, Ft = frame(Ds - Ps, fs), frame(Dt - Pt, ft)
    A = Ft @ np.diag((s, k, s)) @ Fs.T
    return A, Pt - A @ Ps
def fit_similar(anchor_s, anchor_t, s, width=None):
    """Upright pieces keep their orientation; `width` stretches across the body only."""
    A = np.diag((width or s, s, s)); return A, anchor_t - A @ anchor_s
def apply(geos, fit):
    A, t = fit; return [g.copy().affine(A, t) for g in geos]
def at(fit, p): A, t = fit; return A @ p + t

UP, FWD, DOWN = np.array((0, 1., 0)), np.array((0, 0, 1.)), np.array((0, -1., 0))
v = lambda vec: np.array(vec[:])

# Global scale: the physics skeleton's head top over the source's skull top, both from the floor.
feet = points(group([n for n in ('foot_calcaneus.L', 'metatarsal.1.L', 'distal.1.L')]))
skull = group(['skull'])[0]
floor = feet[:, 1].min()
S = (end('head.head', 1)[1] - 0) / (skull.P[:, 1].max() - floor)
print(f"SCALE global {S:.3f}")

pieces = {}  # key -> list of Geo in game world bind coordinates
extras = {}

# Pelvis and legs --------------------------------------------------------------------------
side_of = {'L': -1, 'R': 1}  # legs: L is -X
femur = {s: points(group([f'leg_femur.{s}'])) for s in 'LR'}
head_of_femur = {s: medial_cap(femur[s], DOWN, .06) for s in 'LR'}
hip_t = {s: end(f'legs.thigh{s}', 1) for s in 'LR'}
s_pelvis = np.linalg.norm(v(hip_t['L'] - hip_t['R'])) / np.linalg.norm(head_of_femur['L'] - head_of_femur['R'])
pelvis_fit = fit_similar((head_of_femur['L'] + head_of_femur['R']) / 2, v((hip_t['L'] + hip_t['R']) / 2), S, s_pelvis)
pelvis_src = group(['hip', 'sacral', 'coccygeal'])
pieces['legs.pelvis'] = apply(pelvis_src, pelvis_fit)
sacrum_top = at(pelvis_fit, band(pelvis_src[1].P, UP, 'max', .015).mean(0))
print(f"SCALE pelvis {s_pelvis:.3f}")

for s in 'LR':
    foot_names = ['foot_calcaneus', 'foot_center', 'foot_talus'] + [f'metatarsal.{i}' for i in range(1, 6)] \
        + [f'proximal.{i}' for i in range(1, 6)] + [f'middle.{i}' for i in range(2, 6)] + [f'distal.{i}' for i in range(1, 6)]
    foot = group([f'{n}.{s}' for n in foot_names])
    talus = foot[2].P
    talus_top = band(talus, UP, 'max', .01).mean(0)
    ankle_t = v(end(f'legs.shin{s}', -1))
    foot_fit = fit_similar(np.array((talus_top[0], floor, talus_top[2])), np.array((ankle_t[0], 0., ankle_t[2])), S)
    pieces[f'legs.foot{s}'] = apply(foot, foot_fit)
    talus_t = at(foot_fit, talus_top)

    knee_s = ends(femur[s], DOWN)[1]
    thigh_fit = fit_axis(head_of_femur[s], knee_s, FWD, v(hip_t[s]), v(end(f'legs.thigh{s}', -1)), FWD, S)
    pieces[f'legs.thigh{s}'] = apply(group([f'leg_femur.{s}', f'leg_patella.{s}']), thigh_fit)

    shin = group([f'leg_tibula.{s}', f'leg_fibula.{s}'])
    tib_top, tib_bottom = ends(shin[0].P, DOWN)
    shin_fit = fit_axis(tib_top, tib_bottom, FWD, v(end(f'legs.shin{s}', 1)), np.array((ankle_t[0], talus_t[1], ankle_t[2])), FWD, S)
    pieces[f'legs.shin{s}'] = apply(shin, shin_fit)

# Trunk, girdle, neck, head ----------------------------------------------------------------
humerus = {s: points(group([f'arm_humerus.{s}'])) for s in 'LR'}
head_of_humerus = {s: medial_cap(humerus[s], DOWN, .05) for s in 'LR'}
ARM = {'R': 'primary', 'L': 'secondary'}  # primary is +X, the body's right
shoulder_t = {s: v(end(f'{ARM[s]}.upperArm', 1)) for s in 'LR'}
s_trunk = np.linalg.norm(shoulder_t['L'] - shoulder_t['R']) / np.linalg.norm(head_of_humerus['L'] - head_of_humerus['R'])
trunk_fit = fit_similar((head_of_humerus['L'] + head_of_humerus['R']) / 2, (shoulder_t['L'] + shoulder_t['R']) / 2, S, s_trunk)
thoracic = ['spine_thoracic_t1', 'spine_thoracic_2', 'spine_thoracic_t3'] + [f'spine_thoracic_{i}' for i in range(4, 11)] \
    + ['spine_thoracic_t11', 'spine_thoracic_t12']
core_src = group(['ripcage'] + thoracic)
pieces['trunk.core'] = apply(core_src, trunk_fit)
t1_top = at(trunk_fit, band(core_src[1].P, UP, 'max', .01).mean(0))
t12_bottom = at(trunk_fit, band(core_src[-1].P, UP, 'min', .01).mean(0))
print(f"SCALE trunk {s_trunk:.3f}")
for s in 'LR':
    pieces[f'{ARM[s]}.collar'] = apply(group([f'shoulder_scapula.{s}', f'clavicle.{s}']), trunk_fit)

lumbar_names = ['spine_lumbar_l1', 'spine_lumbar_l1.5', 'spine_lumbar_l2', 'spine_lumbar_l2.5', 'spine_lumbar_l3',
    'spine_lumbar_l3.5', 'spine_lumbar_l4', 'spine_lumbar_l4.5', 'spine_lumbar_l5']
lumbar = group(lumbar_names); lp = points(lumbar)
waist_fit = fit_axis(band(lp, UP, 'min', .012).mean(0), band(lp, UP, 'max', .012).mean(0), FWD, sacrum_top, t12_bottom, FWD,
    S)
pieces['trunk.waist'] = apply(lumbar, waist_fit)

head_top_t = v(end('head.head', 1))
cervical = group([f'spine_cervical_c{i}' for i in range(1, 8)]); cp = points(cervical)
c1_top = band(cervical[0].P, UP, 'max', .008).mean(0)
head_fit = fit_similar(np.array((c1_top[0], skull.P[:, 1].max(), c1_top[2])), np.array((0., head_top_t[1], 0.)), S)
pieces['head.head'] = apply([skull], head_fit)
neck_fit = fit_axis(band(cp, UP, 'min', .01).mean(0), c1_top, FWD, t1_top, at(head_fit, c1_top), FWD, S)
pieces['head.neck'] = apply(cervical, neck_fit)

def orbit_centres(geo):
    """Centre of each eye socket: the centroid of where rays cast straight back go deepest."""
    tree = BVHTree.FromPolygons([Vector(p) for p in geo.P], geo.T.tolist())
    top, front = geo.P[:, 1].max(), geo.P[:, 2].max()
    found = []
    for sign in (-1, 1):
        deep = []
        for x in np.linspace(.015, .05, 22):
            for y in np.linspace(top - .12, top - .05, 36):
                hit = tree.ray_cast(Vector((sign * x, y, front + .05)), Vector((0, 0, -1)), .12)
                if .03 < (front - (hit[0].z if hit[0] is not None else front - .12)) < .08: deep.append((x, y))
        x, y = np.mean(deep, axis=0)
        found.append(np.array((sign * x, y, front - .045)))
    return found
eyes = orbit_centres(pieces['head.head'][0])
print("EYES", [e.round(3).tolist() for e in eyes])

# Arms and hands ---------------------------------------------------------------------------
FINGERS = ['index', 'middle', 'ring', 'little']
CURL = {'proximal': 1.45, 'middle': 1.65, 'distal': 1.05}  # radians: a closed fist
def curl_hand(s):
    """Close the source hand into a fist, bone by bone about each proximal end."""
    meta = {f: load(f'metacarpal.{f}.{s}') for f in FINGERS + ['thumb']}
    bones = {(f, seg): load(f'{seg}.{f}.{s}') for f in FINGERS + ['thumb'] for seg in ('proximal', 'middle', 'distal')
             if not (f == 'thumb' and seg == 'middle')}
    mp = np.concatenate([meta[f].P for f in FINGERS])
    normal = pca(mp)[2]
    tips = np.concatenate([bones[(f, 'distal')].P for f in FINGERS]).mean(0)
    if (tips - mp.mean(0)) @ normal < 0: normal = -normal
    print('PALM', s, 'tip offset', round(float((tips - mp.mean(0)) @ normal), 4), 'normal', normal.round(2))
    wrist_side = load(f'hand_center.{s}').P.mean(0)
    thumb = [meta['thumb'], bones[('thumb', 'proximal')], bones[('thumb', 'distal')]]
    t_dir = thumb[1].P.mean(0) - meta['thumb'].P.mean(0); t_dir /= np.linalg.norm(t_dir)
    t_base = band(meta['thumb'].P, t_dir, 'min', .004).mean(0)
    t_axis = np.cross(t_dir, normal); t_axis /= np.linalg.norm(t_axis)
    R = np.array(Matrix.Rotation(-.55, 3, Vector(t_axis)))
    for b in thumb: b.affine(R, t_base - R @ t_base)
    for f in FINGERS + ['thumb']:
        chain = [seg for seg in ('proximal', 'middle', 'distal') if (f, seg) in bones]
        base = meta[f].P.mean(0)
        for i in reversed(range(len(chain))):
            seg = chain[i]; g = bones[(f, seg)]
            before = bones[(f, chain[i - 1])].P if i else meta[f].P
            direction = g.P.mean(0) - before.mean(0)
            direction /= np.linalg.norm(direction)
            pivot = band(before, direction, 'max', .004).mean(0) - direction * .005
            angle = CURL[seg] * (.55 if f == 'thumb' else 1)
            axis = np.cross(direction, normal); axis /= np.linalg.norm(axis)
            R = np.array(Matrix.Rotation(angle, 3, Vector(axis)))
            for later in chain[i:]:
                b = bones[(f, later)]; b.affine(R, pivot - R @ pivot)
    carpals = [load(f'hand_center.{s}')]
    return carpals + [meta[f] for f in FINGERS + ['thumb']], list(bones.values()), normal, wrist_side

for s in 'LR':
    arm = ARM[s]
    up_fit = fit_axis(head_of_humerus[s], ends(humerus[s], DOWN)[1], FWD, shoulder_t[s], v(end(f'{arm}.upperArm', -1)),
        v(along(f'{arm}.upperArm', (0, 0, 1))), S)
    pieces[f'{arm}.upperArm'] = apply(group([f'arm_humerus.{s}']), up_fit)
    fore = group([f'arm_radius.{s}', f'arm_ulna.{s}'])
    fp = points(fore)
    fore_top = ends(fp, DOWN)[0]
    radius_bottom = ends(fore[0].P, DOWN)[1]
    wrist_t = v(end(f'{arm}.rollRing', -1))
    fore_fit = fit_axis(fore_top, radius_bottom, FWD, v(end(f'{arm}.forearm', 1)), wrist_t, v(along(f'{arm}.forearm', (0, 0, 1))), S)
    pieces[f'{arm}.forearm'] = apply(fore, fore_fit)

    palm, fingers, normal, _ = curl_hand(s)
    knuckle = band(palm[2].P, DOWN, 'max', .008).mean(0)  # the middle metacarpal's head
    direction = v(along(f'{arm}.wrist', (0, -1, 0)))  # distal along the wrist link
    medial = np.array((-1., 0, 0)) if arm == 'primary' else np.array((1., 0, 0))
    reach = np.linalg.norm(knuckle - radius_bottom) * S
    hand_fit = fit_axis(radius_bottom, knuckle, normal, wrist_t, wrist_t + direction * reach, medial, S)
    pieces[f'{arm}.wrist'] = apply(palm + fingers, hand_fit)
    pieces[f'{arm}.wrist.bare'] = apply(palm, hand_fit)
    pieces[f'{arm}.fist'] = apply(fingers, hand_fit)

# ------------------------------------------------------------------------- to host frames
HOST = lambda key: key.removesuffix('.bare')
def to_local(key, geos):
    h = hosts[HOST(key)]
    Rinv = np.array(h['rot'].inverted().to_matrix())
    return [g.affine(Rinv, -Rinv @ v(h['pos'])) for g in geos]
world = {k: [g.copy() for g in gs] for k, gs in pieces.items()}
local = {k: to_local(k, gs) for k, gs in pieces.items()}
hl = hosts['head.head']
extras['head.head'] = {'eyes': [(np.array(hl['rot'].inverted().to_matrix()) @ (e - v(hl['pos']))).round(5).tolist() for e in eyes]}

# ----------------------------------------------------------------------------- shading
IVORY, AGED = np.array((.80, .73, .58)), np.array((.40, .31, .20))
def shade(geos, rays=20, reach=.05):
    """Aged bone: occlusion within the piece, darkened crevices, and a slow grime noise."""
    P = np.concatenate([g.P for g in geos]); N = np.concatenate([g.N for g in geos])
    T = np.concatenate([g.T + off for g, off in zip(geos, np.cumsum([0] + [len(g.P) for g in geos[:-1]]))])
    tree = BVHTree.FromPolygons([Vector(p) for p in P], T.tolist())
    rng = np.random.default_rng(7)
    dirs = rng.normal(size=(rays, 3)); dirs /= np.linalg.norm(dirs, axis=1, keepdims=True)
    C = np.empty((len(P), 4))
    for i, (p, n) in enumerate(zip(P, N)):
        hemi = np.where((dirs @ n)[:, None] < 0, -dirs, dirs)
        origin = Vector(p + n * .0008)
        blocked = sum(1 for d in hemi if tree.ray_cast(origin, Vector(d), reach)[0] is not None)
        ao = 1 - blocked / rays
        q = Vector(p * 9)
        grime = .5 + .5 * noise.fractal(q, .6, 2.2, 4)
        base = IVORY + (AGED - IVORY) * np.clip(.15 + .55 * grime + .35 * (1 - ao), 0, 1)
        C[i, :3] = base * (.35 + .65 * ao ** 1.4); C[i, 3] = 1
    out, at_ = [], 0
    for g in geos: out.append(C[at_:at_ + len(g.P)]); at_ += len(g.P)
    return out

# ------------------------------------------------------------------------------- export
def primitive(geos, colours):
    """Weld corners that share a vertex and a UV; one indexed primitive per piece."""
    P, N, UV, C, I = [], [], [], [], []
    for g, col in zip(geos, colours):
        seen = {}
        for tri, uvs in zip(g.T, g.UV):
            for vi, uv in zip(tri, uvs):
                key = (int(vi), round(float(uv[0]), 5), round(float(uv[1]), 5))
                if key not in seen:
                    seen[key] = len(P); P.append(g.P[vi]); N.append(g.N[vi]); UV.append((uv[0], 1 - uv[1])); C.append(col[vi])
                I.append(seen[key])
    return (np.array(P, np.float32), np.array(N, np.float32), np.array(UV, np.float32),
            np.clip(np.array(C) * 255 + .5, 0, 255).astype(np.uint8), np.array(I, np.uint32))

doc = {'asset': {'version': '2.0', 'generator': 'scripts/skeleton/build-assets.py'},
       'extras': {'frame': 'game host-local, left-handed, +Y up, +Z forward; not standard glTF handedness'},
       'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [], 'accessors': [], 'bufferViews': [],
       'buffers': [{'byteLength': 0}]}
blob = bytearray()
def view(data, target):
    while len(blob) % 4: blob.append(0)
    doc['bufferViews'].append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(data), 'target': target})
    blob.extend(data); return len(doc['bufferViews']) - 1
def accessor(arr, comp, kind, target, normalized=False, bounds=False):
    a = {'bufferView': view(arr.tobytes(), target), 'componentType': comp, 'count': len(arr), 'type': kind}
    if normalized: a['normalized'] = True
    if bounds: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
    doc['accessors'].append(a); return len(doc['accessors']) - 1

total = 0
for key in sorted(local):
    P, N, UV, C, I = primitive(local[key], shade(local[key]))
    total += len(P)
    small = len(P) < 65536
    prim = {'attributes': {'POSITION': accessor(P, 5126, 'VEC3', 34962, bounds=True), 'NORMAL': accessor(N, 5126, 'VEC3', 34962),
            'TEXCOORD_0': accessor(UV, 5126, 'VEC2', 34962), 'COLOR_0': accessor(C, 5121, 'VEC4', 34962, normalized=True)},
            'indices': accessor(I.astype(np.uint16 if small else np.uint32), 5123 if small else 5125, 'SCALAR', 34963)}
    doc['meshes'].append({'name': key, 'primitives': [prim], 'extras': extras.get(key, {})})
    doc['nodes'].append({'name': key, 'mesh': len(doc['meshes']) - 1})
    doc['scenes'][0]['nodes'].append(len(doc['nodes']) - 1)
    print(f"PIECE {key:24s} {len(P):6d} v {len(I) // 3:6d} t")
while len(blob) % 4: blob.append(0)
doc['buffers'][0]['byteLength'] = len(blob)
js = json.dumps(doc, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
out.write_bytes(struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(blob)) + struct.pack('<II', len(js), 0x4E4F534A) + js
                + struct.pack('<II', len(blob), 0x004E4942) + bytes(blob))
print(f"WROTE {out} {out.stat().st_size} bytes, {total} vertices per full set")

# ------------------------------------------------------------------------------- review
if review:
    review.mkdir(parents=True, exist_ok=True)
    for obj in list(bpy.data.objects): bpy.data.objects.remove(obj, do_unlink=True)
    to_bl = lambda P: np.column_stack((-P[:, 0], -P[:, 2], P[:, 1]))
    show = [k for k in world if not k.endswith('.bare') and not k.endswith('.fist')]
    for key in show:
        geos = world[key]
        P = np.concatenate([g.P for g in geos]); off = np.cumsum([0] + [len(g.P) for g in geos[:-1]])
        T = np.concatenate([g.T + o for g, o in zip(geos, off)])
        me = bpy.data.meshes.new(key); me.from_pydata(to_bl(P).tolist(), [], T.tolist()); me.shade_smooth()
        obj = bpy.data.objects.new(key, me); bpy.context.scene.collection.objects.link(obj)
        col = np.concatenate(shade(geos, rays=8))
        attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT'); attr.data.foreach_set('color', col.ravel())
    for e in eyes:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=.011, location=(-e[0], -e[2], e[1]))
    for key, h in hosts.items():
        if key.endswith('fist') or key.endswith('rollRing'): continue
        bpy.ops.mesh.primitive_cube_add(size=1)
        box = bpy.context.object; box.name = 'collider.' + key
        M = np.array(((-1, 0, 0), (0, 0, -1), (0, 1., 0)))
        R = M @ np.array(h['rot'].to_matrix()) @ M.T @ np.diag((1., -1, 1)) @ M @ np.diag(h['size'][:]) @ M.T
        W = Matrix.Identity(4); p = M @ v(h['pos'])
        for i in range(3):
            for j in range(3): W[i][j] = R[i][j]
            W[i][3] = p[i]
        box.matrix_world = W
        box.display_type = 'WIRE'; box.hide_render = False
        mod = box.modifiers.new('w', 'WIREFRAME'); mod.thickness = .0015
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'; scene.display.shading.color_type = 'VERTEX'
    scene.display.shading.light = 'STUDIO'; scene.display.shading.show_cavity = True
    scene.render.resolution_x, scene.render.resolution_y = 900, 1100
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scene.collection.objects.link(cam); scene.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.85
    for name, loc in {'front': (0, -3, .85), 'side': (3, 0, .85), 'three-quarter': (2.2, -2.2, 1.1)}.items():
        cam.location = loc
        d = Vector((0, 0, .85)) - Vector(loc); cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str((review / f'skeleton-{name}.png').resolve())
        bpy.ops.render.render(write_still=True)
    cam.data.ortho_scale = .5
    for name, loc, aim in [('hand', (-1.2, -.33, .93), (-.19, -.33, .93)), ('hand-top', (-.19, -.33, 2), (-.19, -.33, .93)),
                           ('skull', (.5, -1.5, 1.6), (0, 0, 1.52))]:
        cam.data.ortho_scale = .5 if name == 'skull' else .3
        cam.location = loc
        d = Vector(aim) - Vector(loc); cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str((review / f'skeleton-{name}.png').resolve())
        bpy.ops.render.render(write_still=True)
    print("RENDERED", review)
