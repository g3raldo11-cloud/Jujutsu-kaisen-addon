"""Escultura procedural orgânica.

1. Blocagem por METABALLS: ossos como cápsulas e músculos como elipsoides que se fundem
   suavemente (o mesmo princípio de "esculpir com massas" do ZBrush/ZSpheres).
2. União de peças por REMESH VOXEL: corpo + dedos + orelhas + nariz viram uma única malha
   fechada e uniforme (como o DynaMesh), que depois é suavizada.
3. Detalhes: rachaduras (Voronoi em numpy) afundadas na malha, com um atributo por vértice que
   o material usa para brilhar (marcas de brasa); ruído de pele; dobras de pano.

Unidades em metros, Z para cima, frente = -Y.
"""
import bpy
import bmesh
import numpy as np
from math import radians
from mathutils import Matrix, Vector

from . import geo, kit

K = 0.575  # raio da superfície de uma bola-metaball de raio 1 (rigidez 2, limiar 0.6)


def _quat_from_axes(x, y, z):
    M = Matrix(np.stack([geo.unit(x), geo.unit(y), geo.unit(z)], 1).tolist())
    return M.to_quaternion()


def frame_along(d, ref=(0, -1, 0)):
    """Eixos (x, y, z) com z ao longo de ``d`` e y o mais perto possível de ``ref``."""
    z = geo.unit(d)
    ref = np.asarray(ref, float)
    if abs(np.dot(geo.unit(ref), z)) > 0.97:
        ref = np.array((1.0, 0, 0))
    y = geo.unit(ref - z * np.dot(ref, z))
    x = np.cross(y, z)
    return x, y, z


class Sculpt:
    """Coleção de elementos metaball; ``to_mesh`` poligoniza e devolve um objeto de malha."""

    def __init__(self, name):
        self.name = name
        self.els = []

    def ellip(self, c, radii, axes=None, neg=False, stiff=2.0):
        """Elipsoide com SEMIEIXOS de superfície ``radii`` (x, y, z) nos eixos ``axes``."""
        radii = np.asarray(radii, float)
        m = float(radii.max())
        q = None if axes is None else _quat_from_axes(*axes)
        self.els.append(('ELLIPSOID', np.asarray(c, float), m / K, radii / m, q, neg, stiff))

    def ball(self, c, r, neg=False, stiff=2.0):
        self.els.append(('BALL', np.asarray(c, float), r / K, None, None, neg, stiff))

    def capsule(self, p0, p1, r, neg=False, stiff=2.0):
        """Cápsula de raio de superfície ``r`` entre p0 e p1 (pontas arredondadas além dos pontos)."""
        p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
        d = p1 - p0
        L = float(np.linalg.norm(d))
        q = None
        if L > 1e-6:
            x = d / L
            tmp = np.array((0, 0, 1.0)) if abs(x[2]) < 0.9 else np.array((1.0, 0, 0))
            y = geo.unit(np.cross(tmp, x))
            q = _quat_from_axes(x, y, np.cross(x, y))
        self.els.append(('CAPSULE', (p0 + p1) / 2, r / K, np.array((L / 2, 0, 0)), q, neg, stiff))

    def muscle(self, p0, p1, w, dpt, ref=(0, -1, 0), neg=False, stiff=2.0, bulge=1.0):
        """Músculo fusiforme entre p0 e p1: largura ``w`` (eixo x), profundidade ``dpt`` (eixo y, perto de ``ref``)."""
        p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
        x, y, z = frame_along(p1 - p0, ref)
        half = float(np.linalg.norm(p1 - p0)) / 2
        self.ellip((p0 + p1) / 2, (w * bulge, dpt * bulge, half), (x, y, z), neg, stiff)

    def mirror(self):
        """Duplica todos os elementos espelhados em X (lado oposto do corpo)."""
        out = []
        for (t, c, r, s, q, neg, st) in self.els:
            c2 = c * np.array((-1.0, 1, 1))
            q2 = None
            if q is not None:
                M = np.array(q.to_matrix())
                S = np.diag((-1.0, 1, 1))
                M2 = S @ M @ S
                q2 = Matrix(M2.tolist()).to_quaternion()
            out.append((t, c2, r, s, q2, neg, st))
        self.els += out

    def to_mesh(self, res=0.004, threshold=0.6, col=None):
        mb = bpy.data.metaballs.new(self.name)
        mb.resolution = res
        mb.render_resolution = res
        mb.threshold = threshold
        ob = bpy.data.objects.new(self.name, mb)
        (col or bpy.context.scene.collection).objects.link(ob)
        for (t, c, r, s, q, neg, st) in self.els:
            el = mb.elements.new(type=t)
            el.co = Vector(c)
            el.radius = r
            el.stiffness = st
            el.use_negative = neg
            if s is not None:
                el.size_x, el.size_y, el.size_z = float(s[0]), float(s[1]), float(s[2])
            if q is not None:
                el.rotation = q
        kit.deselect_all()
        bpy.context.view_layer.objects.active = ob
        ob.select_set(True)
        bpy.ops.object.convert(target='MESH')
        me_ob = bpy.context.view_layer.objects.active
        me_ob.name = self.name
        return me_ob


# ------------------------------------------------------------------ operações sobre malhas

def apply_mods(ob):
    kit.deselect_all()
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.convert(target='MESH')
    return bpy.context.view_layer.objects.active


def join(objs, name):
    kit.deselect_all()
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    return ob


def remesh(ob, voxel=0.004, smooth=0, smooth_factor=0.5, adapt=0.0):
    """União voxel (DynaMesh): funde peças que se tocam numa malha única, depois suaviza."""
    me = ob.data
    me.remesh_voxel_size = voxel
    me.remesh_voxel_adaptivity = adapt
    me.use_remesh_fix_poles = True
    kit.deselect_all()
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.voxel_remesh()
    if smooth:
        md = ob.modifiers.new('Suaviza', 'SMOOTH')
        md.factor = smooth_factor
        md.iterations = smooth
        ob = apply_mods(ob)
    return ob


def cage_object(cage, name, col=None, sub=0):
    me = kit.cage_to_mesh(cage, name, 60.0)
    ob = bpy.data.objects.new(name, me)
    (col or bpy.context.scene.collection).objects.link(ob)
    if sub:
        md = ob.modifiers.new('Sub', 'SUBSURF')
        md.levels = sub
        md.render_levels = sub
    return ob


def verts(ob):
    n = len(ob.data.vertices)
    V = np.zeros(n * 3)
    ob.data.vertices.foreach_get('co', V)
    return V.reshape(-1, 3)


def normals(ob):
    n = len(ob.data.vertices)
    N = np.zeros(n * 3)
    ob.data.vertices.foreach_get('normal', N)
    return N.reshape(-1, 3)


def set_verts(ob, V):
    ob.data.vertices.foreach_set('co', np.asarray(V, float).ravel())
    ob.data.update()


def set_attr(ob, name, values):
    me = ob.data
    a = me.attributes.get(name) or me.attributes.new(name, 'FLOAT', 'POINT')
    a.data.foreach_set('value', np.asarray(values, float))


def _vnoise(V, scale, seed):
    """Ruído de valor 3D suave (0..1) por vértice."""
    rng = np.random.default_rng(seed)
    G = 24
    grid = rng.uniform(0, 1, (G, G, G))
    p = (V * scale) % G
    i0 = np.floor(p).astype(int)
    f = p - i0
    f = f * f * (3 - 2 * f)
    i1 = (i0 + 1) % G
    val = 0.0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                ix = i1[:, 0] if dx else i0[:, 0]
                iy = i1[:, 1] if dy else i0[:, 1]
                iz = i1[:, 2] if dz else i0[:, 2]
                w = (f[:, 0] if dx else 1 - f[:, 0]) * (f[:, 1] if dy else 1 - f[:, 1]) * (f[:, 2] if dz else 1 - f[:, 2])
                val = val + grid[ix, iy, iz] * w
    return val


def cracks(ob, mask, seeds=1200, width=0.0035, depth=0.0025, seed=0, plate=0.0006, broken=0.35):
    """Rachaduras tipo Voronoi (F2 - F1) afundadas na malha onde ``mask`` > 0, com largura variável,
    trechos interrompidos (``broken``) e placas com alturas diferentes entre as fendas.

    Devolve a intensidade por vértice (0..1), usada como atributo 'brasa' no material."""
    from scipy.spatial import cKDTree
    V = verts(ob)
    N = normals(ob)
    rng = np.random.default_rng(seed)
    idx = np.nonzero(mask > 0.01)[0]
    if len(idx) == 0:
        return np.zeros(len(V))
    pick = rng.choice(idx, size=min(seeds, len(idx)), replace=False)
    tree = cKDTree(V[pick])
    d, cell = tree.query(V, k=2)
    edge = d[:, 1] - d[:, 0]
    wv = width * (0.45 + 0.9 * _vnoise(V, 35.0, seed + 1))
    k = np.clip(1.0 - edge / wv, 0.0, 1.0) ** 1.5
    if broken > 0:
        cont = _vnoise(V, 22.0, seed + 2)
        k *= np.clip((cont - broken * 0.6) / 0.25, 0.0, 1.0)
    k *= np.clip(mask, 0, 1)
    off = rng.uniform(-1, 1, len(pick))[cell[:, 0]] * plate * np.clip(mask, 0, 1)
    V2 = V - N * (k * depth - off)[:, None]
    set_verts(ob, V2)
    return k


def noise_displace(ob, amount=0.0015, scale=40.0, seed=0, mask=None):
    """Relevo orgânico leve (poros grandes, irregularidades de pele) por ruído de valor 3D."""
    V = verts(ob)
    N = normals(ob)
    rng = np.random.default_rng(seed)
    G = 24
    grid = rng.uniform(-1, 1, (G, G, G))
    p = (V * scale) % G
    i0 = np.floor(p).astype(int)
    f = p - i0
    f = f * f * (3 - 2 * f)
    i1 = (i0 + 1) % G
    val = 0.0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                ix = i1[:, 0] if dx else i0[:, 0]
                iy = i1[:, 1] if dy else i0[:, 1]
                iz = i1[:, 2] if dz else i0[:, 2]
                w = (f[:, 0] if dx else 1 - f[:, 0]) * (f[:, 1] if dy else 1 - f[:, 1]) * (f[:, 2] if dz else 1 - f[:, 2])
                val = val + grid[ix, iy, iz] * w
    m = 1.0 if mask is None else mask
    set_verts(ob, V + N * (val * amount * m)[:, None])


def _seg_dist(V, a, b):
    ab = b - a
    t = np.clip(((V - a) @ ab) / max(float(ab @ ab), 1e-12), 0.0, 1.0)
    return np.linalg.norm(V - (a + t[:, None] * ab), axis=1)


def grooves(ob, items, smooth_pts=6):
    """Pincel de vinco: afunda a malha ao longo de polilinhas (separação de músculos, rugas, dobras).
    ``items``: lista de (pontos, largura, profundidade); profundidade negativa levanta (crista)."""
    V = verts(ob)
    N = normals(ob)
    disp = np.zeros(len(V))
    for pts, w, d in items:
        pts = geo.catmull(pts, smooth_pts) if len(pts) > 2 else np.asarray(pts, float)
        lo = pts.min(0) - 3 * w
        hi = pts.max(0) + 3 * w
        sel = np.nonzero(np.all((V >= lo) & (V <= hi), axis=1))[0]
        if len(sel) == 0:
            continue
        dist = np.full(len(sel), 1e9)
        for i in range(len(pts) - 1):
            dist = np.minimum(dist, _seg_dist(V[sel], pts[i], pts[i + 1]))
        prof = np.exp(-(dist / w) ** 2)
        disp[sel] = np.where(np.abs(d * prof) > np.abs(disp[sel]), d * prof, disp[sel])
    set_verts(ob, V - N * disp[:, None])


def bumps(ob, items):
    """Pincel de volume: infla/afunda regiões esféricas (centro, raio, altura)."""
    V = verts(ob)
    N = normals(ob)
    disp = np.zeros(len(V))
    for c, r, h in items:
        d = np.linalg.norm(V - c, axis=1)
        disp += h * np.exp(-(d / r) ** 2)
    set_verts(ob, V + N * disp[:, None])


def smooth_mod(ob, iterations=4, factor=0.5, vgroup=None):
    md = ob.modifiers.new('Suaviza', 'SMOOTH')
    md.factor = factor
    md.iterations = iterations
    if vgroup:
        md.vertex_group = vgroup
    return apply_mods(ob)


def build_body(body, voxel=0.003, smooth=3, meta_res=0.005, col=None):
    """Blocagem -> poligonização -> união com as peças -> remesh voxel -> suavização -> vincos."""
    ob = body.s.to_mesh(meta_res, col=col)
    objs = [ob]
    for i, cg in enumerate(body.parts):
        objs.append(cage_object(cg, f'{body.name}_peca{i}', col))
    ob = join(objs, body.name)
    ob = remesh(ob, voxel, smooth=smooth, smooth_factor=0.6)
    if body.grooves:
        grooves(ob, body.grooves)
    if body.bumps:
        bumps(ob, body.bumps)
    ob = smooth_mod(ob, 1, 0.35)
    if getattr(body, 'extras', None):
        ex = []
        for i, cg in enumerate(body.extras):
            eo = cage_object(cg, f'{body.name}_extra{i}', col, sub=2)
            ex.append(apply_mods(eo))
        ob = join([ob] + ex, body.name)
    ob.data.polygons.foreach_set('use_smooth', [True] * len(ob.data.polygons))
    return ob
