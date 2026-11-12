"""Efeitos para os renders do Blender: fogo volumétrico, línguas de fogo, faíscas, brasas no ar,
fumaça, fitas de vento, poeira, folhas e raios de energia. Tudo é geometria/shader de verdade
(volumes e malhas emissivas), sem imagens coladas."""
import bpy
import numpy as np
from math import tau, pi, cos, sin

from . import geo, kit

_COL = 'Efeitos'


def _col():
    return kit.collection(_COL)


def _obj(name, cage, mat, attr=None):
    me = kit.cage_to_mesh(cage, name, 60.0, {'s': attr} if attr is not None else None)
    if isinstance(mat, (list, tuple)):
        for m in mat:
            me.materials.append(m)
    else:
        me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    _col().objects.link(ob)
    ob.visible_shadow = False
    return ob


def _nodes(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    return m, nt, nt.nodes.new('ShaderNodeOutputMaterial')


def _math(nt, op, a, b=None, clamp=False):
    n = nt.nodes.new('ShaderNodeMath')
    n.operation = op
    n.use_clamp = clamp
    for k, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            n.inputs[k].default_value = float(v)
        else:
            nt.links.new(v, n.inputs[k])
    return n.outputs[0]


def _ramp(nt, fac, stops):
    cr = nt.nodes.new('ShaderNodeValToRGB')
    els = cr.color_ramp.elements
    while len(els) < len(stops):
        els.new(0.5)
    for e, (pos, col) in zip(els, stops):
        e.position = pos
        e.color = (*col, 1.0)
    nt.links.new(fac, cr.inputs['Fac'])
    return cr.outputs['Color']


FIRE_STOPS = [(0.0, (0.25, 0.01, 0.0)), (0.3, (1.0, 0.12, 0.01)), (0.6, (1.0, 0.42, 0.04)), (0.85, (1.0, 0.75, 0.25)), (1.0, (1.0, 0.95, 0.75))]
BLUE_STOPS = [(0.0, (0.0, 0.02, 0.2)), (0.3, (0.05, 0.25, 1.0)), (0.6, (0.3, 0.7, 1.0)), (0.85, (0.75, 0.92, 1.0)), (1.0, (1.0, 1.0, 1.0))]


def volume_material(name, kind='fire', strength=40.0, density=8.0, scale=(3.0, 3.0, 1.6), seed=0.0,
                    stops=None, smoke_color=(0.05, 0.05, 0.05), taper=1.6, cutoff=0.2, swirl=0.0):
    """Volume procedural para um domínio com coordenadas de objeto x,y em [-1,1] e z em [0,1].
    kind: 'fire' (emite), 'smoke' (só densidade), 'dust' (poeira clara), 'tornado' (funil girando)."""
    m, nt, out = _nodes(name)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sp = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sp.inputs[0])
    x, y, z = sp.outputs['X'], sp.outputs['Y'], sp.outputs['Z']
    co = tc.outputs['Object']
    if swirl:
        vr = nt.nodes.new('ShaderNodeVectorRotate')
        vr.rotation_type = 'Z_AXIS'
        nt.links.new(co, vr.inputs['Vector'])
        nt.links.new(_math(nt, 'MULTIPLY', z, swirl), vr.inputs['Angle'])
        co = vr.outputs[0]
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = scale
    mp.inputs['Location'].default_value = (seed * 1.7, seed * 2.3, -seed)
    nt.links.new(co, mp.inputs['Vector'])
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.noise_dimensions = '4D'
    nz.inputs['W'].default_value = seed
    nz.inputs['Scale'].default_value = 1.0
    nz.inputs['Detail'].default_value = 8.0
    nz.inputs['Roughness'].default_value = 0.58
    nz.inputs['Distortion'].default_value = 0.35
    nt.links.new(mp.outputs['Vector'], nz.inputs['Vector'])
    # raio permitido diminui com a altura (chama afunila); funil do tornado alarga para cima
    r2 = _math(nt, 'ADD', _math(nt, 'MULTIPLY', x, x), _math(nt, 'MULTIPLY', y, y))
    rad = _math(nt, 'SQRT', r2)
    if kind == 'tornado':
        allowed = _math(nt, 'ADD', 0.3, _math(nt, 'MULTIPLY', z, 0.7))
        ring = _math(nt, 'ABSOLUTE', _math(nt, 'SUBTRACT', _math(nt, 'DIVIDE', rad, allowed), 0.75))
        shape = _math(nt, 'SUBTRACT', 1.0, _math(nt, 'MULTIPLY', ring, 3.0), clamp=True)
    else:
        allowed = _math(nt, 'SUBTRACT', 1.0, _math(nt, 'MULTIPLY', z, 1.0 / taper * 1.2), clamp=True)
        shape = _math(nt, 'SUBTRACT', 1.0, _math(nt, 'DIVIDE', rad, _math(nt, 'MAXIMUM', allowed, 0.02)), clamp=True)
    vfade = _math(nt, 'MULTIPLY', _math(nt, 'MULTIPLY', z, 7.0, clamp=True), _math(nt, 'MULTIPLY', _math(nt, 'SUBTRACT', 1.0, z), 2.0, clamp=True))
    shape = _math(nt, 'MULTIPLY', shape, vfade)
    d = _math(nt, 'SUBTRACT', _math(nt, 'MULTIPLY', nz.outputs['Fac'], _math(nt, 'POWER', shape, 0.6)), cutoff)
    d = _math(nt, 'MULTIPLY', d, 1.0 / max(0.05, 0.6 - cutoff), clamp=True)
    pv = nt.nodes.new('ShaderNodeVolumePrincipled')
    nt.links.new(_math(nt, 'MULTIPLY', d, density), pv.inputs['Density'])
    pv.inputs['Color'].default_value = (*smoke_color, 1)
    if kind in ('fire',):
        nt.links.new(_ramp(nt, d, stops or FIRE_STOPS), pv.inputs['Emission Color'])
        nt.links.new(_math(nt, 'MULTIPLY', _math(nt, 'POWER', d, 1.5), strength), pv.inputs['Emission Strength'])
        pv.inputs['Absorption Color'].default_value = (0.2, 0.05, 0.01, 1)
    elif kind == 'tornado' and strength > 0:
        nt.links.new(_ramp(nt, d, stops or BLUE_STOPS), pv.inputs['Emission Color'])
        nt.links.new(_math(nt, 'MULTIPLY', d, strength), pv.inputs['Emission Strength'])
    nt.links.new(pv.outputs[0], out.inputs['Volume'])
    return m


def volume_domain(name, base, radius, height, mat, R=None):
    c = geo.box((0, 0, 0.5), (2.0, 2.0, 1.0))
    ob = _obj(name, c, mat)
    ob.location = base
    ob.scale = (radius, radius, height)
    if R is not None:
        from mathutils import Matrix
        ob.rotation_euler = Matrix([list(r) for r in R]).to_euler()
    return ob


def fire_volume(name, base, radius, height, strength=40.0, density=6.0, seed=0.0, stops=None, scale=(3, 3, 1.6), R=None):
    m = volume_material(name + '_mat', 'fire', strength, density, scale, seed, stops)
    return volume_domain(name, base, radius, height, m, R)


def smoke_volume(name, base, radius, height, density=3.0, seed=0.0, color=(0.04, 0.04, 0.045), scale=(2.2, 2.2, 1.2)):
    m = volume_material(name + '_mat', 'smoke', 0.0, density, scale, seed, smoke_color=color, taper=3.0, cutoff=0.25)
    return volume_domain(name, base, radius, height, m)


def tongue_material(name, strength=20.0, stops=None, alpha_pow=1.3):
    """Língua de fogo: cor e transparência pelo atributo 's' (0 = base, 1 = ponta) + ruído esfiapado."""
    m, nt, out = _nodes(name)
    at = nt.nodes.new('ShaderNodeAttribute')
    at.attribute_name = 's'
    s = at.outputs['Fac']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 9.0
    nz.inputs['Detail'].default_value = 5.0
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    heat = _math(nt, 'SUBTRACT', 1.0, _math(nt, 'MULTIPLY', s, 0.9))
    heat = _math(nt, 'MULTIPLY', heat, _math(nt, 'ADD', 0.6, _math(nt, 'MULTIPLY', nz.outputs['Fac'], 0.7)), clamp=True)
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(_ramp(nt, heat, stops or FIRE_STOPS), em.inputs['Color'])
    nt.links.new(_math(nt, 'MULTIPLY', _math(nt, 'ADD', heat, 0.25), strength), em.inputs['Strength'])
    alpha = _math(nt, 'POWER', _math(nt, 'SUBTRACT', 1.0, s, clamp=True), alpha_pow)
    alpha = _math(nt, 'MULTIPLY', alpha, _math(nt, 'ADD', 0.35, nz.outputs['Fac']), clamp=True)
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(alpha, mix.inputs['Fac'])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    kit.set_blend(m, 'HASHED', 'NONE')
    m.use_backface_culling = False
    return m


def tongues(name, roots, dirs, lengths, widths, mat, seed=0, wobble=0.35, sides=8, samples=14, flat=0.45):
    """Várias línguas de fogo (tubos achatados, ondulados, afinando até a ponta)."""
    rng = np.random.default_rng(seed)
    cage = geo.Cage()
    attr = []
    for p, d, L, w in zip(roots, dirs, lengths, widths):
        p = np.asarray(p, float)
        d = geo.unit(np.asarray(d, float))
        side = geo.unit(np.cross(d, rng.normal(0, 1, 3)))
        ctrl = [p]
        for k in range(1, 5):
            t = k / 4
            ctrl.append(p + d * L * t + side * w * wobble * np.sin(t * 5 + rng.uniform(0, 6)) * (0.5 + t)
                        + np.cross(d, side) * w * wobble * 0.6 * np.cos(t * 4 + rng.uniform(0, 6)) * t)
        prof = geo.superellipse(sides, w, w * flat, 2.0)
        tc = geo.sweep(ctrl, prof, samples, ref=side, scale=lambda s: (1 - s) ** 0.8 * (0.55 + 0.45 * np.sin(min(1, s * 3) * pi / 2)),
                       caps=(True, False))
        base = len(cage.verts)
        cage.merge(tc)
        n = len(tc.verts)
        attr += [min(1.0, (k // sides) / (samples - 1)) for k in range(n)]
    return _obj(name, cage, mat, attr)


def streaks(name, origin, count, radius, height, mat, seed=0, length=(0.04, 0.12), thick=0.004, up=1.0, swirl=0.0, R=None):
    """Faíscas como riscos curtos (aparência de movimento) espalhadas num cilindro."""
    rng = np.random.default_rng(seed)
    cage = geo.Cage()
    o = np.asarray(origin, float)
    for i in range(count):
        a = rng.uniform(0, tau)
        r = radius * np.sqrt(rng.uniform(0.05, 1))
        h = rng.uniform(0, height) ** 1.0
        p = o + np.array((cos(a) * r, sin(a) * r, h))
        tang = np.array((-sin(a), cos(a), 0.0))
        d = geo.unit(np.array((0, 0, up)) + rng.normal(0, 0.45, 3) + tang * swirl)
        L = rng.uniform(*length)
        bend = geo.unit(np.cross(d, (0, 0, 1)) + 1e-3) * L * 0.25
        ctrl = [p, p + d * L * 0.5 + bend * 0.5, p + d * L + bend]
        cage.merge(geo.sweep(ctrl, geo.circle(4, thick * rng.uniform(0.6, 1.3)), 5,
                             scale=lambda s: (1 - s) * 0.8 + 0.2, caps=(True, True)))
    if R is not None:
        cage.apply(R, (0, 0, 0))
    return _obj(name, cage, mat)


def motes(name, origin, count, radius, height, size, mat, seed=0, flat=False, R=None):
    """Brasas/poeira/vagalumes: pequenas esferas espalhadas (ou folhas, se ``flat``)."""
    rng = np.random.default_rng(seed)
    cage = geo.Cage()
    o = np.asarray(origin, float)
    for i in range(count):
        a = rng.uniform(0, tau)
        r = radius * np.sqrt(rng.uniform(0, 1))
        p = o + np.array((cos(a) * r, sin(a) * r, rng.uniform(0, height)))
        s = size * rng.uniform(0.4, 1.4)
        if flat:
            leaf = [(0, -1.0), (0.45, -0.5), (0.55, 0.2), (0.0, 1.0), (-0.55, 0.2), (-0.45, -0.5)]
            Rr = geo.euler(*rng.uniform(0, 360, 3))
            cage.merge(geo.extrude(np.asarray(leaf) * s, s * 0.08, p, Rr[:, 0], Rr[:, 1]))
        else:
            cage.merge(geo.ellipsoid(p, (s, s, s), nu=8, nv=5))
    if R is not None:
        cage.apply(R, (0, 0, 0))
    return _obj(name, cage, mat)


def ribbon_material(name, color, strength=6.0, alpha=0.7):
    m, nt, out = _nodes(name)
    at = nt.nodes.new('ShaderNodeAttribute')
    at.attribute_name = 's'
    s = at.outputs['Fac']
    # transparente nas duas pontas, mais forte no meio
    a = _math(nt, 'MULTIPLY', _math(nt, 'SINE', _math(nt, 'MULTIPLY', s, pi)), alpha, clamp=True)
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*color, 1)
    em.inputs['Strength'].default_value = strength
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(a, mix.inputs['Fac'])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    kit.set_blend(m, 'HASHED', 'NONE')
    m.use_backface_culling = False
    return m


def wind_ribbons(name, origin, count, r0, r1, height, mat, seed=0, width=0.02, turns=(0.6, 1.4)):
    """Fitas de vento em espiral (redemoinho)."""
    rng = np.random.default_rng(seed)
    cage = geo.Cage()
    attr = []
    o = np.asarray(origin, float)
    for i in range(count):
        a0 = rng.uniform(0, tau)
        tr = rng.uniform(*turns)
        h0 = rng.uniform(0, height * 0.7)
        h1 = h0 + rng.uniform(0.25, 0.6) * height
        n = 30
        t = np.linspace(0, 1, n)
        a = a0 + t * tr * tau
        h = h0 + (h1 - h0) * t
        r = r0 + (r1 - r0) * (h / height) + rng.uniform(-0.05, 0.05)
        pts = o + np.stack([np.cos(a) * r, np.sin(a) * r, h], 1)
        w = width * rng.uniform(0.6, 1.4)
        prof = np.array([(0.0, -w), (0.0, w)])
        rings = []
        T, N, B = geo.frames(pts, (0, 0, 1))
        for k in range(n):
            rings.append(np.array([pts[k] - B[k] * w * 0.15 - (0, 0, w), pts[k] + B[k] * w * 0.15 + (0, 0, w)]))
        base = len(cage.verts)
        c = geo.tube(rings, False, False, 0, wrap=False)
        cage.merge(c)
        attr += [k // 2 / (n - 1) for k in range(len(c.verts))]
    return _obj(name, cage, mat, attr)


def bolt_arc(name, p0, p1, mat, seed=0, amp=0.06, thick=0.006, branches=2):
    """Arco de energia fractal com ramificações."""
    cage = geo.Cage()
    pts = geo.jagged(p0, p1, 24, amp, seed)
    cage.merge(geo.sweep(pts, geo.circle(5, thick), len(pts) * 2, smooth=False, scale=lambda s: 1 - 0.5 * s))
    rng = np.random.default_rng(seed + 9)
    for b in range(branches):
        k = rng.integers(3, len(pts) - 3)
        q0 = pts[k]
        q1 = q0 + rng.normal(0, amp * 2.5, 3)
        bp = geo.jagged(q0, q1, 10, amp * 0.5, seed + b)
        cage.merge(geo.sweep(bp, geo.circle(4, thick * 0.6), len(bp) * 2, smooth=False, scale=lambda s: 1 - 0.8 * s))
    return _obj(name, cage, mat)


def glow_decals(name, shapes, mat):
    """Marcas no chão (pegadas em brasa, rachaduras): polígonos 2D extrudados bem finos."""
    cage = geo.Cage()
    for poly, z in shapes:
        cage.merge(geo.extrude(poly, 0.004, (0, 0, z), (1, 0, 0), (0, 1, 0)))
    return _obj(name, cage, mat)
