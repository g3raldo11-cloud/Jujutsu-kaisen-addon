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


def skin(name, base=(0.05, 0.03, 0.022), ember=(1.0, 0.28, 0.03), ember_strength=7.0, sss=(1.0, 0.38, 0.2), rough=0.58):
    """Pele: subsuperfície, poros (relevo fino), oleosidade variável; o atributo 'brasa' faz as
    rachaduras brilharem e o atributo 'cinza' escurece/aspereja a pele queimada em volta."""
    m, nt, bs = _nt(name)
    _set(bs, 'Subsurface Weight', 0.55)
    _set(bs, 'Subsurface Radius', sss)
    _set(bs, 'Subsurface Scale', 0.0065)
    _set(bs, 'Subsurface Anisotropy', 0.75)
    _set(bs, 'Specular IOR Level', 0.45)
    _set(bs, 'Coat Weight', 0.0)
    # sem "sheen" branco: numa pele escura (albedo ~4%) qualquer camada branca domina e a pele fica cinza
    _set(bs, 'Sheen Weight', 0.0)
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
    # palmas/solas mais claras e rosadas; lábios mais escuros
    at_p = nt.nodes.new('ShaderNodeAttribute')
    at_p.attribute_name = 'palma'
    at_l = nt.nodes.new('ShaderNodeAttribute')
    at_l.attribute_name = 'labio'
    palm = nt.nodes.new('ShaderNodeMixRGB')
    nt.links.new(ash.outputs['Color'], palm.inputs['Color1'])
    palm.inputs['Color2'].default_value = (min(1, base[0] * 3.2), min(1, base[1] * 2.7), min(1, base[2] * 2.6), 1)
    nt.links.new(_math(nt, 'MULTIPLY', at_p.outputs['Fac'], 0.75), palm.inputs['Fac'])
    lip = nt.nodes.new('ShaderNodeMixRGB')
    nt.links.new(palm.outputs['Color'], lip.inputs['Color1'])
    lip.inputs['Color2'].default_value = (base[0] * 0.75, base[1] * 0.5, base[2] * 0.5, 1)
    nt.links.new(_math(nt, 'MULTIPLY', at_l.outputs['Fac'], 0.8), lip.inputs['Fac'])
    nt.links.new(lip.outputs['Color'], bs.inputs['Base Color'])
    r = _math(nt, 'ADD', _math(nt, 'MULTIPLY', fine.outputs['Fac'], 0.18), rough - 0.09)
    r = _math(nt, 'ADD', r, _math(nt, 'MULTIPLY', at_c.outputs['Fac'], 0.35), clamp=True)
    r = _math(nt, 'SUBTRACT', r, _math(nt, 'MULTIPLY', at_l.outputs['Fac'], 0.22), clamp=True)
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


def ember_strands(name, strength=6.0):
    """Mechas em brasa para o render realista: carvão escuro na raiz, brilho que esquenta até a ponta
    (vermelho -> laranja -> amarelo), tremulando com ruído. O fogo de verdade sai delas (simulação)."""
    m, nt, bs = _nt(name)
    at = nt.nodes.new('ShaderNodeAttribute')
    at.attribute_name = 's'
    nz = _noise(nt, 35.0, 5.0)
    s = _math(nt, 'ADD', at.outputs['Fac'], _math(nt, 'MULTIPLY', _math(nt, 'SUBTRACT', nz.outputs['Fac'], 0.5), 0.35), clamp=True)
    cr = nt.nodes.new('ShaderNodeValToRGB')
    els = cr.color_ramp.elements
    els[0].position, els[0].color = 0.0, (0.0, 0.0, 0.0, 1)
    els[1].position, els[1].color = 1.0, (1.0, 0.72, 0.28, 1)
    for pos, col in ((0.22, (0.35, 0.03, 0.0)), (0.5, (1.0, 0.2, 0.015)), (0.8, (1.0, 0.45, 0.06))):
        e = els.new(pos)
        e.color = (*col, 1)
    nt.links.new(s, cr.inputs['Fac'])
    _set(bs, 'Base Color', (0.025, 0.018, 0.014, 1))
    _set(bs, 'Roughness', 0.55)
    nt.links.new(cr.outputs['Color'], bs.inputs['Emission Color'])
    nt.links.new(_math(nt, 'MULTIPLY', _math(nt, 'POWER', s, 1.4), strength), bs.inputs['Emission Strength'])
    _bump(nt, bs, nz.outputs['Fac'], 0.3, 0.002)
    # metade de fora de cada mecha vira chama: transparente e esfiapada pelo ruído (não parece palha)
    out = [n for n in nt.nodes if n.bl_idname == 'ShaderNodeOutputMaterial'][0]
    nz2 = _noise(nt, 18.0, 6.0)
    fade = _math(nt, 'MULTIPLY', _math(nt, 'SUBTRACT', at.outputs['Fac'], 0.45), 2.2, clamp=True)
    fade = _math(nt, 'ADD', fade, _math(nt, 'MULTIPLY', _math(nt, 'SUBTRACT', nz2.outputs['Fac'], 0.5), 1.2), clamp=True)
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(cr.outputs['Color'], em.inputs['Color'])
    nt.links.new(_math(nt, 'MULTIPLY', _math(nt, 'POWER', s, 1.2), strength * 0.6), em.inputs['Strength'])
    glowy = nt.nodes.new('ShaderNodeAddShader')
    nt.links.new(tr.outputs[0], glowy.inputs[0])
    nt.links.new(em.outputs[0], glowy.inputs[1])
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(fade, mix.inputs['Fac'])
    nt.links.new(bs.outputs[0], mix.inputs[1])
    nt.links.new(glowy.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    m.use_backface_culling = False
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
    # brilho aveludado na cor do próprio tecido (branco deixaria o vermelho rosado)
    _set(bs, 'Sheen Tint', (min(1, base[0] * 2.2 + 0.05), min(1, base[1] * 2.2 + 0.02), min(1, base[2] * 2.2 + 0.02), 1))
    _gltf(m, base, 0.0, rough)
    return m


def bark(name, base=(0.06, 0.045, 0.032), lichen=(0.32, 0.36, 0.28), moss=(0.035, 0.07, 0.02)):
    """Casca de árvore: fissuras verticais (Voronoi esticado), placas com relevo, liquens claros e
    musgo na base do tronco."""
    m, nt, bs = _nt(name)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1.0, 1.0, 0.22)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    vo = nt.nodes.new('ShaderNodeTexVoronoi')
    vo.feature = 'DISTANCE_TO_EDGE'
    vo.inputs['Scale'].default_value = 14.0
    nt.links.new(mp.outputs['Vector'], vo.inputs['Vector'])
    nz = _noise(nt, 22.0, 8.0)
    crack = _math(nt, 'POWER', _math(nt, 'MULTIPLY', vo.outputs['Distance'], 9.0, clamp=True), 0.5)
    h = _math(nt, 'ADD', _math(nt, 'MULTIPLY', crack, 0.7), _math(nt, 'MULTIPLY', nz.outputs['Fac'], 0.3))
    _bump(nt, bs, h, 0.9, 0.01)
    col = nt.nodes.new('ShaderNodeMixRGB')
    col.blend_type = 'MULTIPLY'
    col.inputs['Color1'].default_value = (*base, 1)
    nt.links.new(crack, col.inputs['Fac'])
    col.inputs['Color2'].default_value = (0.35, 0.3, 0.27, 1)
    inv = _math(nt, 'SUBTRACT', 1.0, crack)
    nt.links.new(inv, col.inputs['Fac'])
    # liquens: manchas claras
    lz = _noise(nt, 3.5, 6.0)
    lmask = _math(nt, 'MULTIPLY', _math(nt, 'SUBTRACT', lz.outputs['Fac'], 0.58), 6.0, clamp=True)
    lic = nt.nodes.new('ShaderNodeMixRGB')
    nt.links.new(col.outputs['Color'], lic.inputs['Color1'])
    lic.inputs['Color2'].default_value = (*lichen, 1)
    nt.links.new(lmask, lic.inputs['Fac'])
    # musgo perto do chão
    sp = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Generated'], sp.inputs[0])
    wz = nt.nodes.new('ShaderNodeSeparateXYZ')
    gp = nt.nodes.new('ShaderNodeNewGeometry')
    nt.links.new(gp.outputs['Position'], wz.inputs[0])
    low = _math(nt, 'SUBTRACT', 1.0, _math(nt, 'MULTIPLY', wz.outputs['Z'], 0.9), clamp=True)
    mmask = _math(nt, 'MULTIPLY', low, _math(nt, 'ADD', nz.outputs['Fac'], 0.1), clamp=True)
    mos = nt.nodes.new('ShaderNodeMixRGB')
    nt.links.new(lic.outputs['Color'], mos.inputs['Color1'])
    mos.inputs['Color2'].default_value = (*moss, 1)
    nt.links.new(mmask, mos.inputs['Fac'])
    nt.links.new(mos.outputs['Color'], bs.inputs['Base Color'])
    _set(bs, 'Roughness', 0.88)
    _gltf(m, base, 0.0, 0.88)
    return m


def soil(name, base=(0.03, 0.022, 0.016), wet=0.25):
    """Chão de terra/húmus: manchas de umidade (mais escuro e menos áspero), grãos e torrões."""
    m, nt, bs = _nt(name)
    big = _noise(nt, 0.9, 4.0)
    mid = _noise(nt, 14.0, 6.0)
    fine = _noise(nt, 160.0, 3.0)
    col = nt.nodes.new('ShaderNodeMixRGB')
    col.blend_type = 'MULTIPLY'
    col.inputs['Color1'].default_value = (*base, 1)
    nt.links.new(mid.outputs['Color'], col.inputs['Color2'])
    col.inputs['Fac'].default_value = 0.5
    wetm = _math(nt, 'MULTIPLY', _math(nt, 'SUBTRACT', big.outputs['Fac'], 0.45), 5.0, clamp=True)
    dk = nt.nodes.new('ShaderNodeMixRGB')
    dk.blend_type = 'MULTIPLY'
    nt.links.new(col.outputs['Color'], dk.inputs['Color1'])
    dk.inputs['Color2'].default_value = (0.55, 0.55, 0.55, 1)
    nt.links.new(wetm, dk.inputs['Fac'])
    nt.links.new(dk.outputs['Color'], bs.inputs['Base Color'])
    nt.links.new(_math(nt, 'SUBTRACT', 0.95, _math(nt, 'MULTIPLY', wetm, wet)), bs.inputs['Roughness'])
    h = _math(nt, 'ADD', _math(nt, 'MULTIPLY', mid.outputs['Fac'], 0.6), _math(nt, 'MULTIPLY', fine.outputs['Fac'], 0.4))
    _bump(nt, bs, h, 0.6, 0.006)
    _gltf(m, base, 0.0, 0.9)
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
def forest(seed=7, radius=(3.2, 14.0), trunks=34, fog=0.03, ground_r=40.0, light_color=(0.75, 0.9, 1.0), rich=False,
           avoid=None, litter_r=5.0):
    """Clareira na mata: troncos com raízes tabulares, cipós, samambaias, folhas no chão.
    ``rich`` (render realista): casca com fissuras e liquens, folhiço de milhares de folhas curvadas,
    samambaias com folíolos, gravetos e troncos ao fundo sumindo na névoa."""
    col = kit.collection('Mata')
    rng = np.random.default_rng(seed)
    bark = globals()['bark']('mata_casca') if rich else solid('mata_casca', (0.05, 0.04, 0.03), 0.85, 0.0, 6.0, 0.6, variation=0.5)
    moss = solid('mata_musgo', (0.03, 0.07, 0.025), 0.9, 0.0, 20.0, 0.4)
    soil = globals()['soil']('mata_chao') if rich else solid('mata_chao', (0.025, 0.02, 0.015), 0.9, 0.0, 3.0, 0.3, variation=0.5)
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
    if rich:
        # troncos ao fundo (somem na névoa e dão profundidade)
        for i in range(46):
            a = rng.uniform(0, tau)
            r = rng.uniform(14.0, 30.0)
            c = np.array((cos(a) * r, sin(a) * r, (r / ground_r) ** 2 * 0.8 - 0.1))
            R0 = rng.uniform(0.2, 0.7)
            H = rng.uniform(14, 22)
            trunk_c.merge(geo.sweep([c, c + (rng.normal(0, 0.3), rng.normal(0, 0.3), H * 0.5), c + (rng.normal(0, 0.6), rng.normal(0, 0.6), H)],
                                    geo.circle(14, R0), 12, scale=lambda s: 1 - 0.4 * s, caps=(False, True)))
    add(trunk_c, 'troncos', bark, 1)
    add(root_c, 'raizes', bark, 1)
    add(vine_c, 'cipos', vinem)
    if rich:
        from . import mata
        fern_m = mata.leaf_material('mata_samambaia', mata.GREEN_LEAVES, 0.5, 0.35, (0.9, 1.0, 0.45), 0.25)
        cam_a = -1.2                                       # as câmeras ficam na frente, em -Y (um pouco para +X)

        def in_view(a, r, width, rmax):
            return abs(((a - cam_a + pi) % tau) - pi) < width and r < rmax
        clumps = []
        for i in range(150):
            a = rng.uniform(0, tau)
            r = rng.uniform(2.2, 13.0)
            if in_view(a, r, 0.5, 4.2):
                continue                                   # nada grudado na lente
            clumps.append((cos(a) * r, sin(a) * r, (r / ground_r) ** 2 * 0.8))
        objs.append(mata.fern('samambaias', fern_m, rng, clumps))
        spots = []
        for i in range(34):
            a = rng.uniform(0, tau)
            r = rng.uniform(3.0, 14.0)
            if in_view(a, r, 0.8, 7.5):
                continue
            spots.append((cos(a) * r, sin(a) * r, (r / ground_r) ** 2 * 0.8))
        green = mata.leaf_material('mata_folha_verde', mata.GREEN_LEAVES, 0.45, 0.35, (0.9, 1.0, 0.45), 0.25)
        objs += list(mata.saplings('arvoretas', 'arvoretas_folhas', bark, green, rng, spots))
        dry = mata.leaf_material('mata_folhico', mata.DRY_LEAVES, 0.62, 0.12, (1.0, 0.7, 0.35), 0.3, sheen=0.2)
        objs.append(mata.litter('folhico', dry, rng, 11000, (0, 0.3), litter_r, avoid, ground_r))
        objs.append(mata.twigs('gravetos', bark, rng, 240, litter_r * 0.8, avoid))
        return objs
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


def termite_mound(c, H, R, rng, n=48, rows=40):
    """Cupinzeiro do cerrado: torre de terra irregular com caroços e escorridos."""
    th = np.linspace(0, tau, n, endpoint=False)
    rings = []
    ph = rng.uniform(0, tau, 4)
    for i in range(rows):
        t = i / (rows - 1)
        r = R * (1.0 - t ** 1.6) ** 0.7 * (1.0 + 0.25 * np.exp(-t * 6))
        lump = (1 + 0.12 * np.sin(th * 3 + ph[0] + t * 4) + 0.07 * np.sin(th * 7 + ph[1] - t * 9)
                + 0.05 * np.sin(th * 13 + ph[2]) * (1 - t) + rng.normal(0, 0.015, n))
        cx = c[0] + 0.12 * R * np.sin(t * 2.5 + ph[3]) * t
        cy = c[1] + 0.1 * R * np.cos(t * 2.0 + ph[3]) * t
        rings.append(np.stack([cx + np.cos(th) * r * lump, cy + np.sin(th) * r * lump, np.full(n, c[2] + H * t)], 1))
    return geo.tube(rings, False, True)


def cerrado_tree(c, H, R0, rng, leafy=True):
    """Árvore torta do cerrado: tronco sinuoso com casca grossa, galhos retorcidos e tufos de folhas
    largas e duras nas pontas. Devolve (gaiola do lenho, pontas dos galhos)."""
    wood = geo.Cage()
    pts = [np.asarray(c, float)]
    for j in range(1, 7):
        pts.append(pts[-1] + np.array((rng.normal(0, 0.18), rng.normal(0, 0.18), H / 6 * rng.uniform(0.7, 1.15))))
    wood.merge(geo.sweep(pts, geo.circle(14, R0), 30, ref=(1, 0, 0), scale=lambda s: (1 - 0.55 * s) * (1 + 0.35 * max(0, 0.12 - s) * 8),
                         caps=(True, True)))
    tips = []

    def branch(p0, d, L, r, depth):
        mids = [p0]
        for q in range(1, 4):
            mids.append(mids[-1] + geo.unit(d + rng.normal(0, 0.35, 3)) * L / 3)
        wood.merge(geo.sweep(mids, geo.circle(8, r), 10, ref=(0, 0, 1), scale=lambda s: 1 - 0.6 * s, caps=(True, True)))
        if depth == 0:
            tips.append(mids[-1])
            return
        for b in range(rng.integers(2, 4)):
            nd = geo.unit(d + rng.normal(0, 0.6, 3) + np.array((0, 0, 0.35)))
            branch(mids[-1], nd, L * rng.uniform(0.5, 0.75), r * 0.55, depth - 1)
    for b in range(rng.integers(3, 6)):
        j = rng.integers(3, 6)
        ba = rng.uniform(0, tau)
        branch(pts[j], geo.unit((cos(ba), sin(ba), rng.uniform(0.25, 0.9))), rng.uniform(0.6, 1.2), R0 * 0.45, 2)
    tips.append(pts[-1])
    return wood, tips


def cerrado(seed=4, tufts=420, trees=10, ground_r=40.0, rich=False, avoid=None):
    """Cerrado ao entardecer: chão seco, touceiras de capim, árvores tortas, pedras.
    ``rich`` (render realista): terra vermelha com seixos, milhares de touceiras de capim fino,
    cupinzeiros, árvores tortas com casca grossa e folhas de verdade, folhas secas no chão."""
    col = kit.collection('Cerrado')
    rng = np.random.default_rng(seed)
    if rich:
        return _cerrado_rich(col, rng, ground_r, avoid)
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


def _cerrado_rich(col, rng, ground_r, avoid):
    from . import mata
    soil_m = soil('cerrado_terra', (0.17, 0.075, 0.04), wet=0.05)
    bark_m = bark('cerrado_casca', (0.11, 0.09, 0.075), lichen=(0.42, 0.42, 0.36), moss=(0.1, 0.09, 0.05))
    rock = solid('cerrado_pedra', (0.16, 0.13, 0.11), 0.85, 0.0, 15.0, 0.7, variation=0.5)
    clay = soil('cerrado_cupim', (0.2, 0.095, 0.05), wet=0.0)
    grass = mata.grass_material('cerrado_capim')
    leaf = mata.leaf_material('cerrado_folha', [(0.0, (0.06, 0.1, 0.03)), (0.5, (0.1, 0.13, 0.04)), (1.0, (0.16, 0.15, 0.05))],
                              0.45, 0.25, (1.0, 0.9, 0.45), 0.2)
    dry = mata.leaf_material('cerrado_folha_seca', mata.DRY_LEAVES, 0.6, 0.15, (1.0, 0.7, 0.35), 0.3, sheen=0.2)
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

    def free(x, y, r_cam=3.2, ang=0.55):
        a = np.arctan2(y, x)
        r = np.hypot(x, y)
        if r < r_cam and abs(((a + pi / 2 + pi) % tau) - pi) < ang:
            return False                                  # deixa livre a frente (câmera em -Y)
        for ax, ay, ar in (avoid or []):
            if np.hypot(x - ax, y - ay) < ar:
                return False
        return True

    # chão com ondulação suave
    g = geo.Cage()
    n = 128
    rings = []
    for r in np.linspace(0, ground_r, 56):
        th = np.linspace(0, tau, n, endpoint=False)
        z = 0.02 * np.sin(th * 3 + r * 0.7) * min(1, r / 3) + (r / ground_r) ** 2 * 1.2 + rng.normal(0, 0.004, n) * min(1, r / 2)
        rings.append(np.stack([np.cos(th) * r, np.sin(th) * r, z], 1))
    base = g.add(np.concatenate(rings))
    g.grid(base, len(rings), n, True)
    add(g, 'chao_cerrado', soil_m)
    # capim: perto, médio e longe
    roots = []
    for i in range(2600):
        r = rng.uniform(0.6, 26.0) ** 1.0
        a = rng.uniform(0, tau)
        x, y = cos(a) * r, sin(a) * r
        if free(x, y):
            roots.append((x, y, (r / ground_r) ** 2 * 1.2))
    objs.append(mata.blades('capim', grass, rng, roots, per=(12, 26), height=(0.22, 0.62), width=(0.0022, 0.0042)))
    # cupinzeiros
    mc = geo.Cage()
    for (r, a, H, R) in ((5.5, 1.2, 1.3, 0.42), (8.0, 2.3, 0.9, 0.35), (11.0, 0.5, 1.7, 0.55), (4.2, 2.6, 0.6, 0.28),
                         (14.0, 1.9, 1.1, 0.4), (7.0, -0.9, 0.8, 0.32)):
        x, y = cos(a) * r, sin(a) * r
        if not free(x, y):
            continue
        mc.merge(termite_mound((x, y, (r / ground_r) ** 2 * 1.2 - 0.05), H, R, rng))
    add(mc, 'cupinzeiros', clay, 1)
    # árvores tortas com folhas
    wood = geo.Cage()
    tips = []
    for i in range(14):
        a = rng.uniform(0, tau)
        r = rng.uniform(4.0, 16.0)
        x, y = cos(a) * r, sin(a) * r
        if not free(x, y, 5.0, 0.6):
            continue
        w, tp = cerrado_tree((x, y, (r / ground_r) ** 2 * 1.2), rng.uniform(2.2, 4.4), rng.uniform(0.09, 0.17), rng)
        wood.merge(w)
        tips += tp
    add(wood, 'arvores_cerrado', bark_m, 1)
    # tufos de folhas largas nas pontas dos galhos
    nl, nw = 8, 5
    allP = []
    for tpt in tips:
        k = 70
        P, lt, lx, L = mata.leaves(k, rng, length=(0.08, 0.15), aspect=(0.35, 0.55), curl=(0.1, 0.8), fold=(0.1, 0.35))
        dirs = geo.unit(rng.normal(0, 1, (k, 3)) + np.array((0, 0, 0.6)))
        yaw = np.arctan2(dirs[:, 1], dirs[:, 0]) - pi / 2
        pitch = np.arcsin(np.clip(dirs[:, 2], -1, 1))
        R = mata._rot_batch(yaw, pitch + 0.6, rng.normal(0, 0.6, k))
        Pw = np.einsum('nij,nvj->nvi', R, P) + (np.asarray(tpt) + rng.normal(0, 0.16, (k, 3)) * np.array((1, 1, 0.7)))[:, None, :]
        allP.append((Pw, lt, lx))
    if allP:
        Pw = np.concatenate([a[0] for a in allP])
        F = mata._grid_faces(nl, nw, len(Pw))
        cor = np.repeat(rng.uniform(0, 1, len(Pw)), nl * nw)
        me = kit.fast_mesh('copas_cerrado', Pw.reshape(-1, 3), F, {'cor': cor, 'lt': np.concatenate([a[1] for a in allP]).ravel(),
                                                                  'lx': np.concatenate([a[2] for a in allP]).ravel()})
        me.materials.append(leaf)
        ob = bpy.data.objects.new('copas_cerrado', me)
        col.objects.link(ob)
        objs.append(ob)
    # pedras e seixos
    rc = geo.Cage()
    for i in range(40):
        a = rng.uniform(0, tau)
        r = rng.uniform(0.8, 10.0)
        x, y = cos(a) * r, sin(a) * r
        if not free(x, y):
            continue
        sz = rng.uniform(0.02, 0.09) if i > 8 else rng.uniform(0.12, 0.35)
        rc.merge(geo.ellipsoid((x, y, (r / ground_r) ** 2 * 1.2 + sz * 0.15), (sz, sz * rng.uniform(0.6, 1), sz * rng.uniform(0.35, 0.6)),
                               (2.4, 2.4), geo.rot((0, 0, 1), rng.uniform(0, tau)), 14, 8))
    add(rc, 'pedras', rock, 1)
    # folhas secas espalhadas
    objs.append(mata.litter('folhas_cerrado', dry, rng, 2600, (0, 0.5), 5.0, avoid, ground_r, 1.2, col, length=(0.05, 0.12)))
    return objs
