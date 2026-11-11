"""Peças orgânicas e materiais realistas: pele com subsuperfície e brasas, cabelo de fogo,
saia de fibras, cordas e amarrações, colar de dentes, lança, olhos, pano, madeira e pedra,
além de um cenário de mata (árvores, cipós, samambaias, folhas, névoa e fachos de luz)."""
import bpy
import numpy as np
from math import tau, pi, cos, sin, radians

from . import geo, kit, sculpt, mats


# ====================================================================== materiais
def _nt(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bs = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bs.outputs[0], out.inputs['Surface'])
    m.use_backface_culling = False
    return m, nt, bs


def _set(bs, k, v):
    if k in bs.inputs:
        bs.inputs[k].default_value = v


def _gltf(m, base, metal, rough, emis=(0, 0, 0), strength=0.0):
    m['gltf_base'] = list(base)
    m['gltf_metal'] = metal
    m['gltf_rough'] = rough
    m['gltf_emis'] = list(emis)
    m['gltf_strength'] = strength


def _noise(nt, scale, detail=4.0, coord='Object'):
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = scale
    nz.inputs['Detail'].default_value = detail
    nt.links.new(tc.outputs[coord], nz.inputs['Vector'])
    return nz


def _bump(nt, bs, height, strength, dist=0.002):
    b = nt.nodes.new('ShaderNodeBump')
    b.inputs['Strength'].default_value = strength
    b.inputs['Distance'].default_value = dist
    nt.links.new(height, b.inputs['Height'])
    nt.links.new(b.outputs['Normal'], bs.inputs['Normal'])
    return b


def _math(nt, op, a, b=None, clamp=False):
    n = nt.nodes.new('ShaderNodeMath')
    n.operation = op
    n.use_clamp = clamp
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            n.inputs[i].default_value = float(v)
        else:
            nt.links.new(v, n.inputs[i])
    return n.outputs[0]


def skin(name, base=(0.05, 0.03, 0.022), ember=(1.0, 0.28, 0.03), ember_strength=7.0, sss=(0.6, 0.22, 0.12), rough=0.58):
    """Pele: subsuperfície, poros (relevo fino), oleosidade variável; o atributo 'brasa' faz as
    rachaduras brilharem e o atributo 'cinza' escurece/aspereja a pele queimada em volta."""
    m, nt, bs = _nt(name)
    _set(bs, 'Subsurface Weight', 0.22)
    _set(bs, 'Subsurface Radius', sss)
    _set(bs, 'Subsurface Scale', 0.012)
    _set(bs, 'Specular IOR Level', 0.45)
    _set(bs, 'Coat Weight', 0.0)
    _set(bs, 'Sheen Weight', 0.15)
    pores = _noise(nt, 900.0, 2.0)
    fine = _noise(nt, 140.0, 6.0)
    blot = _noise(nt, 9.0, 3.0)
    at_b = nt.nodes.new('ShaderNodeAttribute')
    at_b.attribute_name = 'brasa'
    at_c = nt.nodes.new('ShaderNodeAttribute')
    at_c.attribute_name = 'cinza'
    # cor: base com manchas suaves; queimado (cinza) escurece e acinzenta
    mix1 = nt.nodes.new('ShaderNodeMixRGB')
    mix1.blend_type = 'MULTIPLY'
    mix1.inputs['Color1'].default_value = (*base, 1)
    nt.links.new(blot.outputs['Color'], mix1.inputs['Color2'])
    mix1.inputs['Fac'].default_value = 0.55
    ash = nt.nodes.new('ShaderNodeMixRGB')
    ash.inputs['Color2'].default_value = (0.018, 0.014, 0.013, 1)
    nt.links.new(mix1.outputs['Color'], ash.inputs['Color1'])
    nt.links.new(at_c.outputs['Fac'], ash.inputs['Fac'])
    nt.links.new(ash.outputs['Color'], bs.inputs['Base Color'])
    r = _math(nt, 'ADD', _math(nt, 'MULTIPLY', fine.outputs['Fac'], 0.18), rough - 0.09)
    r = _math(nt, 'ADD', r, _math(nt, 'MULTIPLY', at_c.outputs['Fac'], 0.35), clamp=True)
    nt.links.new(r, bs.inputs['Roughness'])
    h = _math(nt, 'ADD', _math(nt, 'MULTIPLY', pores.outputs['Fac'], 0.6), _math(nt, 'MULTIPLY', fine.outputs['Fac'], 0.4))
    _bump(nt, bs, h, 0.12, 0.001)
    # brilho das brasas
    em = _math(nt, 'MULTIPLY', _math(nt, 'POWER', at_b.outputs['Fac'], 1.3), ember_strength)
    cr = nt.nodes.new('ShaderNodeValToRGB')
    cr.color_ramp.elements[0].color = (ember[0] * 0.8, ember[1] * 0.3, ember[2] * 0.2, 1)
    cr.color_ramp.elements[1].color = (1.0, min(1.0, ember[1] * 2.2), min(1.0, ember[2] * 3), 1)
    nt.links.new(at_b.outputs['Fac'], cr.inputs['Fac'])
    nt.links.new(cr.outputs['Color'], bs.inputs['Emission Color'])
    nt.links.new(em, bs.inputs['Emission Strength'])
    m.use_backface_culling = True
    _gltf(m, base, 0.0, rough)
    m['gltf_vertex_emission'] = list(ember)
    return m


def fiber(name, base=(0.42, 0.33, 0.16), base2=(0.25, 0.18, 0.08), rough=0.7):
    """Palha/fibra vegetal: variação de cor ao longo e entre as fibras, veios finos."""
    m, nt, bs = _nt(name)
    nz = _noise(nt, 30.0, 3.0)
    streak = nt.nodes.new('ShaderNodeTexWave')
    streak.wave_type = 'BANDS'
    streak.bands_direction = 'Z'
    streak.inputs['Scale'].default_value = 220.0
    streak.inputs['Distortion'].default_value = 4.0
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nt.links.new(tc.outputs['Object'], streak.inputs['Vector'])
    mix = nt.nodes.new('ShaderNodeMixRGB')
    mix.inputs['Color1'].default_value = (*base, 1)
    mix.inputs['Color2'].default_value = (*base2, 1)
    nt.links.new(nz.outputs['Fac'], mix.inputs['Fac'])
    nt.links.new(mix.outputs['Color'], bs.inputs['Base Color'])
    _set(bs, 'Roughness', rough)
    _set(bs, 'Sheen Weight', 0.4)
    _set(bs, 'Subsurface Weight', 0.1)
    _bump(nt, bs, streak.outputs['Fac'], 0.25, 0.001)
    _gltf(m, base, 0.0, rough)
    return m


def solid(name, base, rough=0.5, metal=0.0, bump_scale=0.0, bump=0.0, coat=0.0, sss=0.0, variation=0.25):
    m, nt, bs = _nt(name)
    _set(bs, 'Base Color', (*base, 1))
    _set(bs, 'Roughness', rough)
    _set(bs, 'Metallic', metal)
    _set(bs, 'Coat Weight', coat)
    _set(bs, 'Subsurface Weight', sss)
    if bump_scale > 0:
        nz = _noise(nt, bump_scale, 6.0)
        _bump(nt, bs, nz.outputs['Fac'], bump, 0.002)
        mix = nt.nodes.new('ShaderNodeMixRGB')
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Color1'].default_value = (*base, 1)
        mix.inputs['Fac'].default_value = variation
        nt.links.new(nz.outputs['Color'], mix.inputs['Color2'])
        nt.links.new(mix.outputs['Color'], bs.inputs['Base Color'])
    m.use_backface_culling = True
    _gltf(m, base, metal, rough)
    return m


def wood(name, base=(0.16, 0.08, 0.035), rough=0.55):
    m, nt, bs = _nt(name)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1.0, 1.0, 0.06)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    wv = nt.nodes.new('ShaderNodeTexWave')
    wv.wave_type = 'RINGS'
    wv.inputs['Scale'].default_value = 8.0
    wv.inputs['Distortion'].default_value = 6.0
    wv.inputs['Detail'].default_value = 3.0
    nt.links.new(mp.outputs['Vector'], wv.inputs['Vector'])
    mix = nt.nodes.new('ShaderNodeMixRGB')
    mix.inputs['Color1'].default_value = (*base, 1)
    mix.inputs['Color2'].default_value = (base[0] * 0.5, base[1] * 0.45, base[2] * 0.4, 1)
    nt.links.new(wv.outputs['Fac'], mix.inputs['Fac'])
    nt.links.new(mix.outputs['Color'], bs.inputs['Base Color'])
    _set(bs, 'Roughness', rough)
    _bump(nt, bs, wv.outputs['Fac'], 0.15, 0.002)
    m.use_backface_culling = True
    _gltf(m, base, 0.0, rough)
    return m


def flame_strands(name, strength=4.0):
    """Mechas de fogo: atributo 's' (0 raiz -> 1 ponta) vai de vermelho-escuro a amarelo."""
    m, nt, bs = _nt(name)
    at = nt.nodes.new('ShaderNodeAttribute')
    at.attribute_name = 's'
    nz = _noise(nt, 40.0, 4.0)
    s = _math(nt, 'ADD', at.outputs['Fac'], _math(nt, 'MULTIPLY', _math(nt, 'SUBTRACT', nz.outputs['Fac'], 0.5), 0.25), clamp=True)
    cr = nt.nodes.new('ShaderNodeValToRGB')
    els = cr.color_ramp.elements
    els[0].position = 0.0
    els[0].color = (0.05, 0.004, 0.002, 1)
    els[1].position = 1.0
    els[1].color = (1.0, 0.85, 0.4, 1)
    e = els.new(0.3)
    e.color = (0.6, 0.04, 0.01, 1)
    e = els.new(0.62)
    e.color = (1.0, 0.32, 0.03, 1)
    nt.links.new(s, cr.inputs['Fac'])
    nt.links.new(cr.outputs['Color'], bs.inputs['Base Color'])
    nt.links.new(cr.outputs['Color'], bs.inputs['Emission Color'])
    nt.links.new(_math(nt, 'MULTIPLY', _math(nt, 'POWER', s, 2.2), strength), bs.inputs['Emission Strength'])
    _set(bs, 'Roughness', 0.4)
    _gltf(m, (0.6, 0.12, 0.02), 0.0, 0.5, (1.0, 0.35, 0.05), 2.0)
    return m


def glow(name, color, strength):
    m, nt, bs = _nt(name)
    _set(bs, 'Base Color', (*[c * 0.3 for c in color], 1))
    _set(bs, 'Emission Color', (*color, 1))
    _set(bs, 'Emission Strength', strength)
    m.use_backface_culling = True
    _gltf(m, [c * 0.3 for c in color], 0.0, 0.4, color, strength)
    return m


def cloth(name, base, rough=0.75, sheen=0.6, weave=320.0):
    """Tecido: trama fina (relevo), brilho aveludado nas bordas, variação de tom."""
    m, nt, bs = _nt(name)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    w1 = nt.nodes.new('ShaderNodeTexWave')
    w1.inputs['Scale'].default_value = weave
    w2 = nt.nodes.new('ShaderNodeTexWave')
    w2.inputs['Scale'].default_value = weave
    w2.bands_direction = 'Y'
    for w in (w1, w2):
        nt.links.new(tc.outputs['Object'], w.inputs['Vector'])
    h = _math(nt, 'MULTIPLY', w1.outputs['Fac'], w2.outputs['Fac'])
    _bump(nt, bs, h, 0.2, 0.0008)
    nz = _noise(nt, 6.0, 3.0)
    mix = nt.nodes.new('ShaderNodeMixRGB')
    mix.blend_type = 'MULTIPLY'
    mix.inputs['Color1'].default_value = (*base, 1)
    mix.inputs['Fac'].default_value = 0.4
    nt.links.new(nz.outputs['Color'], mix.inputs['Color2'])
    nt.links.new(mix.outputs['Color'], bs.inputs['Base Color'])
    _set(bs, 'Roughness', rough)
    _set(bs, 'Sheen Weight', sheen)
    _set(bs, 'Sheen Roughness', 0.4)
    _gltf(m, base, 0.0, rough)
    return m


# ====================================================================== peças
def rope_wrap(center, axis, radius, length, turns, thick, ref=None):
    """Amarração de corda (hélice) em volta de um membro."""
    path = geo.helix_path(np.asarray(center) - geo.unit(axis) * length / 2, axis, radius, length, turns, int(turns * 18) + 2, ref)
    return geo.sweep(path, geo.circle(8, thick), len(path), smooth=False, ref=axis, caps=(True, True))


def twisted_rope(path, thick, strands=3, twists=40):
    """Corda trançada: três fios enrolados ao longo do caminho."""
    P = geo.resample(geo.catmull(path, 12), max(40, twists * 8))
    T, N, B = geo.frames(P)
    s = np.linspace(0, 1, len(P))
    out = geo.Cage()
    for k in range(strands):
        a = s * twists * tau + k * tau / strands
        Q = P + (np.cos(a)[:, None] * N + np.sin(a)[:, None] * B) * thick * 0.75
        out.merge(geo.sweep(Q, geo.circle(7, thick * 0.62), len(Q), smooth=False, caps=(True, True)))
    return out


def eye(center, size, outward, up=(0, 0, 1), tilt=0.0):
    """Olho amendoado (globo luminoso achatado entre as pálpebras)."""
    x = geo.unit(np.cross(up, outward))
    x = geo.rot(outward, radians(tilt)) @ x
    z = geo.unit(np.cross(outward, x))
    R = np.stack([x, outward, z], 1)
    return geo.ellipsoid(center, (size[0], size[1], size[2]), (2.0, 2.0), R, 24, 12)


def fiber_strand(root, d, length, width, thick, rng, sway=0.25, droop=None, out=None):
    """Fibra/mecha achatada que pende e balança, afinando na ponta. Devolve (cage, s por vértice)."""
    root = np.asarray(root, float)
    d = geo.unit(d)
    side = geo.unit(np.cross(d, out if out is not None else (0, 0, 1)) + 1e-5)
    ctrl = [root]
    for k in range(1, 5):
        t = k / 4
        bend = side * width * 2.5 * sway * np.sin(t * 3 + rng.uniform(0, 6)) * t
        sag = np.zeros(3) if droop is None else np.asarray(droop) * t * t * length
        ctrl.append(root + d * length * t + bend + sag)
    prof = geo.superellipse(6, width, thick, 2.0)
    n = 12
    cg = geo.sweep(ctrl, prof, n, ref=out if out is not None else (0, 0, 1), twist=rng.uniform(-1.2, 1.2),
                   scale=lambda s: (1.0 - 0.55 * s ** 1.5, 1.0), caps=(True, True))
    sv = [min(1.0, (i // 6) / (n - 1)) for i in range(len(cg.verts))]
    return cg, sv


def spear(base, top, shaft_r=0.014, blade_len=0.24, blade_w=0.062):
    """Lança: haste de madeira afinando, amarrações, lâmina de pedra lascada e penas.
    Devolve dict de gaiolas por material: madeira, corda, pedra, pena_vermelha, pena_azul."""
    base, top = np.asarray(base, float), np.asarray(top, float)
    ax = geo.unit(top - base)
    L = float(np.linalg.norm(top - base))
    xa, ya, za = geo.basis_from(ax, (1, 0, 0))
    rng = np.random.default_rng(3)
    # haste com leve irregularidade (galho trabalhado à mão)
    n = 60
    rings = []
    for i in range(n):
        t = i / (n - 1)
        r = shaft_r * (1.0 - 0.18 * t) * (1.0 + 0.04 * np.sin(t * 37) + 0.02 * np.sin(t * 91))
        c = base + ax * L * t + xa * 0.004 * np.sin(t * 5.0) + ya * 0.003 * np.sin(t * 7.0 + 1)
        th = np.linspace(0, tau, 14, endpoint=False)
        rings.append(c + (np.cos(th)[:, None] * xa + np.sin(th)[:, None] * ya) * r)
    wood_c = geo.tube(rings, True, True)
    cord = geo.Cage()
    for (t0, t1, tn) in ((0.9, 0.95, 9), (0.55, 0.6, 9), (0.83, 0.85, 4)):
        c = base + ax * L * (t0 + t1) / 2
        cord.merge(rope_wrap(c, ax, shaft_r * 1.05, L * (t1 - t0), tn, 0.0028, xa))
    # lâmina: losango alongado, facetado nas bordas (pedra lascada)
    tip0 = top - ax * 0.01
    outline = []
    for i in range(24):
        t = i / 23
        w = blade_w / 2 * np.sin(np.pi * t ** 0.85) * (1.0 - 0.35 * t)
        outline.append((w, t * blade_len))
    pts = [(w, h) for (w, h) in outline] + [(-w, h) for (w, h) in reversed(outline)]
    blade = geo.extrude(np.asarray(pts), 0.012, tip0, xa, ax)
    V = np.asarray(blade.verts)
    Z = np.cross(xa, ax)
    rel = V - tip0
    edge = np.abs(rel @ xa) / (blade_w / 2 + 1e-9)
    thick_k = np.clip(1.0 - edge ** 2, 0.05, 1.0)
    V = tip0 + (rel @ xa)[:, None] * xa + (rel @ ax)[:, None] * ax + ((rel @ Z) * thick_k)[:, None] * Z
    V += rng.normal(0, 0.0008, V.shape)
    blade.verts = [tuple(p) for p in V]
    # penas penduradas em cordões
    feathers = {'pena_vermelha': geo.Cage(), 'pena_azul': geo.Cage()}
    for k in range(4):
        anchor = base + ax * L * 0.87 + xa * 0.016 * cos(k * 1.7) + ya * 0.016 * sin(k * 1.7)
        hang = anchor - za * 0.0 - ax * (0.07 + 0.02 * k) + xa * 0.02 * cos(k * 1.7)
        cord.merge(geo.sweep([anchor, (anchor + hang) / 2 + xa * 0.004, hang], geo.circle(6, 0.0016), 8, caps=(True, True)))
        fl = 0.13 + 0.02 * (k % 2)
        vane = []
        for i in range(16):
            t = i / 15
            w = 0.016 * np.sin(np.pi * min(1, t * 1.1)) * (1 - 0.3 * t)
            vane.append((w, -t * fl))
        poly = [(w, h) for (w, h) in vane] + [(-w * 0.8, h) for (w, h) in reversed(vane)]
        Rk = geo.rot(ax, k * 1.3)
        f = geo.extrude(np.asarray(poly), 0.0015, hang, Rk @ xa, ax)
        feathers['pena_vermelha' if k % 2 == 0 else 'pena_azul'].merge(f)
    return {'madeira': wood_c, 'corda': cord, 'pedra': blade, **feathers}


# ====================================================================== cenário: mata
def forest(seed=7, radius=(3.2, 14.0), trunks=34, fog=0.03, ground_r=40.0, light_color=(0.75, 0.9, 1.0)):
    """Clareira na mata: troncos com raízes tabulares, cipós, samambaias, folhas no chão."""
    col = kit.collection('Mata')
    rng = np.random.default_rng(seed)
    bark = solid('mata_casca', (0.05, 0.04, 0.03), 0.85, 0.0, 6.0, 0.6, variation=0.5)
    moss = solid('mata_musgo', (0.03, 0.07, 0.025), 0.9, 0.0, 20.0, 0.4)
    soil = solid('mata_chao', (0.025, 0.02, 0.015), 0.9, 0.0, 3.0, 0.3, variation=0.5)
    leaf = solid('mata_folha', (0.04, 0.11, 0.035), 0.55, 0.0, 30.0, 0.15, sss=0.3)
    leaf_dry = solid('mata_folha_seca', (0.16, 0.08, 0.025), 0.7, 0.0, 30.0, 0.15)
    vinem = solid('mata_cipo', (0.06, 0.05, 0.03), 0.8, 0.0, 10.0, 0.3)
    objs = []

    def add(cage, name, mat, sub=0):
        me = kit.cage_to_mesh(cage, name, 60.0)
        me.materials.append(mat)
        ob = bpy.data.objects.new(name, me)
        col.objects.link(ob)
        if sub:
            md = ob.modifiers.new('Sub', 'SUBSURF')
            md.levels = sub
            md.render_levels = sub
        objs.append(ob)
        return ob

    # chão
    g = geo.Cage()
    n = 96
    rings = []
    for i, r in enumerate(np.linspace(0, ground_r, 40)):
        th = np.linspace(0, tau, n, endpoint=False)
        z = rng.normal(0, 0.01, n) * min(1, r / 3) + (r / ground_r) ** 2 * 0.8
        rings.append(np.stack([np.cos(th) * r, np.sin(th) * r, z], 1))
    base = g.add(np.concatenate(rings))
    g.grid(base, len(rings), n, True)
    add(g, 'chao_mata', soil)
    trunk_c = geo.Cage()
    root_c = geo.Cage()
    vine_c = geo.Cage()
    fern_c = geo.Cage()
    for i in range(trunks):
        a = rng.uniform(0, tau)
        if abs(((a - pi / 2 + pi) % tau) - pi) < 0.75:      # deixa a frente (câmera em -Y) aberta
            a += pi
        r = rng.uniform(*radius)
        c = np.array((cos(a) * r, sin(a) * r, 0.0))
        R0 = rng.uniform(0.18, 0.55)
        H = rng.uniform(9, 16)
        lean = rng.normal(0, 0.05, 2)
        rings = []
        for j in range(26):
            t = j / 25
            rr = R0 * (1.0 - 0.45 * t) * (1 + 0.5 * max(0, 0.08 - t) * 12)
            cc = c + np.array((lean[0] * t * H, lean[1] * t * H, t * H))
            th = np.linspace(0, tau, 18, endpoint=False)
            wob = 1 + 0.08 * np.sin(th * 3 + j * 0.7) + 0.05 * rng.normal(0, 1, 18)
            rings.append(cc + np.stack([np.cos(th) * rr * wob, np.sin(th) * rr * wob, np.zeros(18)], 1))
        trunk_c.merge(geo.tube(rings, True, True))
        for k in range(rng.integers(3, 6)):
            ra = rng.uniform(0, tau)
            d = np.array((cos(ra), sin(ra), 0.0))
            p0 = c + d * R0 * 0.6 + (0, 0, R0 * 2.2)
            p1 = c + d * R0 * 2.4 + (0, 0, 0.12)
            p2 = c + d * R0 * 3.6 + (0, 0, -0.05)
            root_c.merge(geo.sweep([p0, p1, p2], geo.superellipse(8, R0 * 0.18, R0 * 0.55, 2.0), 14, ref=(0, 0, 1),
                                   scale=lambda s: 1 - 0.75 * s, caps=(True, True)))
        if rng.uniform() < 0.6:
            top = c + np.array((lean[0] * H * 0.7, lean[1] * H * 0.7, H * 0.7))
            end = top + np.array((rng.normal(0, 1.2), rng.normal(0, 1.2), -H * rng.uniform(0.45, 0.68)))
            mid = (top + end) / 2 + np.array((0, 0, -1.0))
            vine_c.merge(geo.sweep([top, mid, end], geo.circle(6, rng.uniform(0.012, 0.03)), 30, caps=(True, True)))
    add(trunk_c, 'troncos', bark, 1)
    add(root_c, 'raizes', bark, 1)
    add(vine_c, 'cipos', vinem)
    # samambaias e folhagem baixa em volta da clareira
    for i in range(70):
        a = rng.uniform(0, tau)
        if abs(((a - pi / 2 + pi) % tau) - pi) < 0.5 and rng.uniform() < 0.7:
            continue
        r = rng.uniform(2.4, 7.5)
        c = np.array((cos(a) * r, sin(a) * r, 0.0))
        for f in range(rng.integers(5, 9)):
            fa = rng.uniform(0, tau)
            d = geo.unit((cos(fa), sin(fa), rng.uniform(0.6, 1.4)))
            L = rng.uniform(0.5, 1.1)
            spine = [c, c + d * L * 0.5 + (0, 0, 0.1), c + d * L + (0, 0, -0.15)]
            fern_c.merge(geo.sweep(spine, geo.superellipse(4, 0.09, 0.004, 2.0), 10, ref=(0, 0, 1),
                                   scale=lambda s: (1 - s) ** 0.6 * (0.4 + 0.6 * np.sin(min(1, s * 3) * pi / 2)), caps=(True, True)))
    add(fern_c, 'samambaias', leaf)
    # folhas secas no chão perto do personagem
    from . import fx
    fx.motes('folhas_chao', (0, 0, 0.003), 1400, 3.0, 0.004, 0.035, leaf_dry, seed=seed + 1, flat=True)
    return objs


def cerrado(seed=4, tufts=420, trees=10, ground_r=40.0):
    """Cerrado ao entardecer: chão seco, touceiras de capim, árvores tortas, pedras."""
    col = kit.collection('Cerrado')
    rng = np.random.default_rng(seed)
    soil = solid('cerrado_chao', (0.1, 0.065, 0.04), 0.92, 0.0, 4.0, 0.45, variation=0.5)
    grass = fiber('cerrado_capim', (0.45, 0.36, 0.16), (0.24, 0.19, 0.08), 0.75)
    bark = solid('cerrado_casca', (0.07, 0.055, 0.042), 0.9, 0.0, 8.0, 0.8, variation=0.5)
    leaf = solid('cerrado_folha', (0.07, 0.11, 0.035), 0.6, 0.0, 30.0, 0.1, sss=0.25)
    rock = solid('cerrado_pedra', (0.13, 0.12, 0.11), 0.85, 0.0, 15.0, 0.7, variation=0.5)

    def add(cage, name, mat, sub=0):
        me = kit.cage_to_mesh(cage, name, 60.0)
        me.materials.append(mat)
        ob = bpy.data.objects.new(name, me)
        col.objects.link(ob)
        if sub:
            md = ob.modifiers.new('Sub', 'SUBSURF')
            md.levels = sub
            md.render_levels = sub
        return ob

    g = geo.Cage()
    n = 96
    rings = []
    for r in np.linspace(0, ground_r, 40):
        th = np.linspace(0, tau, n, endpoint=False)
        z = rng.normal(0, 0.012, n) * min(1, r / 2) + (r / ground_r) ** 2 * 1.2
        rings.append(np.stack([np.cos(th) * r, np.sin(th) * r, z], 1))
    base = g.add(np.concatenate(rings))
    g.grid(base, len(rings), n, True)
    add(g, 'chao_cerrado', soil)
    gc = geo.Cage()
    for i in range(tufts):
        a = rng.uniform(0, tau)
        r = rng.uniform(0.7, 14.0) ** 1.0
        if r < 3.5 and abs(((a + pi / 2 + pi) % tau) - pi) < 0.5:
            continue                                     # deixa livre a linha da câmera (frente, -Y)
        c = np.array((cos(a) * r, sin(a) * r, 0.0))
        for b in range(rng.integers(7, 14)):
            ba = rng.uniform(0, tau)
            d = geo.unit((cos(ba) * 0.35, sin(ba) * 0.35, 1.0))
            L = rng.uniform(0.18, 0.55)
            p0 = c + np.array((cos(ba), sin(ba), 0)) * 0.015
            ctrl = [p0, p0 + d * L * 0.5, p0 + d * L + np.array((cos(ba), sin(ba), 0)) * L * 0.35 - np.array((0, 0, L * 0.12))]
            gc.merge(geo.sweep(ctrl, geo.superellipse(4, 0.0035, 0.0008, 2.0), 8, ref=(0, 0, 1),
                               scale=lambda s: (1 - s) ** 0.7, caps=(True, True)))
    add(gc, 'capim', grass)
    tc = geo.Cage()
    lc = geo.Cage()
    for i in range(trees):
        a = rng.uniform(0, tau)
        if abs(((a + pi / 2 + pi) % tau) - pi) < 0.6:
            a += pi
        r = rng.uniform(4.5, 13.0)
        c = np.array((cos(a) * r, sin(a) * r, 0.0))
        H = rng.uniform(2.4, 4.6)
        pts = [c]
        for j in range(1, 6):
            pts.append(pts[-1] + np.array((rng.normal(0, 0.22), rng.normal(0, 0.22), H / 5)))
        R0 = rng.uniform(0.08, 0.16)
        tc.merge(geo.sweep(pts, geo.circle(10, R0), 24, ref=(1, 0, 0), scale=lambda s: 1 - 0.55 * s, caps=(True, True)))
        for b in range(rng.integers(3, 6)):
            j = rng.integers(2, 5)
            p0 = pts[j]
            ba = rng.uniform(0, tau)
            d = geo.unit((cos(ba), sin(ba), rng.uniform(0.2, 0.9)))
            L = rng.uniform(0.6, 1.4)
            bp = [p0, p0 + d * L * 0.5 + np.array((0, 0, rng.uniform(-0.2, 0.2))), p0 + d * L]
            tc.merge(geo.sweep(bp, geo.circle(8, R0 * 0.45), 12, ref=(0, 0, 1), scale=lambda s: 1 - 0.7 * s, caps=(True, True)))
            for q in range(5):
                lc.merge(geo.ellipsoid(bp[-1] + rng.normal(0, 0.18, 3) + np.array((0, 0, 0.15)), (rng.uniform(0.2, 0.38),) * 2 + (0.14,),
                                       nu=12, nv=8))
    add(tc, 'arvores_cerrado', bark, 1)
    add(lc, 'copas_cerrado', leaf, 1)
    rc = geo.Cage()
    for i in range(14):
        a = rng.uniform(0, tau)
        r = rng.uniform(1.6, 9.0)
        if r < 3 and abs(((a + pi / 2 + pi) % tau) - pi) < 0.6:
            continue
        rc.merge(geo.ellipsoid((cos(a) * r, sin(a) * r, 0.02), (rng.uniform(0.12, 0.4), rng.uniform(0.1, 0.3), rng.uniform(0.06, 0.18)),
                               (2.6, 2.6), geo.rot((0, 0, 1), rng.uniform(0, tau)), 16, 10))
    add(rc, 'pedras', rock, 1)
