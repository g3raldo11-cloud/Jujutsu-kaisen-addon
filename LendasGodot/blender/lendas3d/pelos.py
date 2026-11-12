"""Pelos de verdade (objetos de curvas do Blender, renderizados fio a fio no Cycles): cabelo crespo
curto, sobrancelhas e cílios. Os fios nascem da superfície do corpo esculpido e seguem a cabeça na pose
(o objeto é preso ao osso). Também os olhos realistas (esclera, íris com brilho, pupila e córnea)."""
import bpy
import numpy as np
from math import tau, pi

from . import geo, kit


def _surface(ob, mask_fn):
    """Vértices e normais da malha (repouso) que passam na máscara."""
    me = ob.data
    n = len(me.vertices)
    V = np.empty(n * 3)
    N = np.empty(n * 3)
    me.vertices.foreach_get('co', V)
    me.vertices.foreach_get('normal', N)
    V = V.reshape(-1, 3)
    N = N.reshape(-1, 3)
    M = np.array(ob.matrix_world)
    V = V @ M[:3, :3].T + M[:3, 3]
    N = geo.unit(N @ M[:3, :3].T)
    sel = mask_fn(V, N)
    return V[sel], N[sel]


def _tangent_frame(N, ref=(0, 0, 1)):
    ref = np.broadcast_to(np.asarray(ref, float), N.shape)
    T = np.cross(N, ref)
    bad = np.linalg.norm(T, axis=1) < 1e-4
    T[bad] = np.cross(N[bad], (1.0, 0, 0))
    T = geo.unit(T)
    B = np.cross(N, T)
    return T, B


def curves_object(name, P, R, mat, col, parent=None, bone=None):
    """Cria o objeto de curvas: P (fios, pontos, 3) em mundo, R (fios, pontos) raios."""
    nc, npc, _ = P.shape
    cv = bpy.data.hair_curves.new(name)
    cv.add_curves([npc] * nc)
    cv.position_data.foreach_set('vector', np.ascontiguousarray(P, np.float32).ravel())
    if 'radius' not in cv.attributes:
        cv.attributes.new('radius', 'FLOAT', 'POINT')
    cv.attributes['radius'].data.foreach_set('value', np.ascontiguousarray(R, np.float32).ravel())
    cv.materials.append(mat)
    ob = bpy.data.objects.new(name, cv)
    col.objects.link(ob)
    if parent is not None:
        from mathutils import Matrix
        bpy.context.view_layer.update()
        ob.parent = parent
        ob.parent_type = 'BONE'
        ob.parent_bone = bone
        bpy.context.view_layer.update()
        ob.matrix_world = Matrix.Identity(4)
    return ob


def coily(roots, N, rng, length=(0.006, 0.012), coil_r=(0.0011, 0.0019), turns_per_cm=(3.0, 4.5), flow=None,
          pts=14, thick=0.00005):
    """Fios crespos (cabelo 4C curto): hélice apertada em volta da direção de crescimento, com
    variação de raio, passo e fase por fio. ``flow``: direção para onde o cabelo deita (mundo)."""
    n = len(roots)
    L = rng.uniform(*length, n)
    rc = rng.uniform(*coil_r, n)
    turns = rng.uniform(*turns_per_cm, n) * L * 100.0
    ph = rng.uniform(0, tau, n)
    d = N.copy()
    if flow is not None:
        d = geo.unit(N * 0.75 + np.asarray(flow) * 0.35 + rng.normal(0, 0.15, (n, 3)))
    T, B = _tangent_frame(d)
    s = np.linspace(0, 1, pts)
    ang = ph[:, None] + turns[:, None] * tau * s[None]
    grow = (L[:, None] * s[None])
    # o raio da espiral abre logo depois da raiz (o fio sai reto do couro cabeludo e então enrola)
    rr = rc[:, None] * np.clip(s[None] * 4.0, 0, 1)
    P = (roots[:, None, :] + d[:, None, :] * grow[..., None]
         + (np.cos(ang)[..., None] * T[:, None, :] + np.sin(ang)[..., None] * B[:, None, :]) * rr[..., None])
    P += rng.normal(0, 0.00012, P.shape) * s[None, :, None]
    R = thick * (1.0 - 0.55 * s)[None].repeat(n, 0)
    return P, R


def lashes(curve, out, up, count, rng, length=(0.007, 0.0105), curl=0.55, thick=0.00006, pts=8, spread=0.25):
    """Cílios ao longo da borda da pálpebra: saem para fora e curvam para cima (ou para baixo)."""
    C = geo.resample(geo.catmull(curve, 8), 64)
    t = np.sort(rng.uniform(0.05, 0.95, count))
    idx = (t * (len(C) - 1)).astype(int)
    base = C[idx]
    mid = 1.0 - np.abs(t - 0.5) * 2.0
    L = rng.uniform(*length, count) * (0.55 + 0.45 * mid)
    s = np.linspace(0, 1, pts)
    o = geo.unit(np.asarray(out, float))
    u = geo.unit(np.asarray(up, float))
    lat = geo.unit(np.cross(u, o))
    P = np.empty((count, pts, 3))
    for i in range(count):
        side = (t[i] - 0.5) * spread
        d0 = geo.unit(o + u * 0.25 + lat * side)
        bend = u * curl
        a = s * 1.2
        P[i] = base[i] + (d0[None] * np.sin(a)[:, None] / 1.2 + bend[None] * (1 - np.cos(a))[:, None] / 1.2) * L[i]
    R = thick * (1.0 - 0.8 * s)[None].repeat(count, 0)
    return P, R


def brows(ob, line, rng, density=900, width=0.0055, length=(0.004, 0.008), flow_out=(1, 0, 0), pts=6, thick=0.00005):
    """Sobrancelha: fios curtos nascendo numa faixa em volta da linha, deitados para fora e para cima."""
    C = geo.resample(geo.catmull(line, 8), 80)

    def mask(V, N):
        d = np.full(len(V), 1e9)
        for a, b in zip(C[:-1], C[1:]):
            ab = b - a
            t = np.clip(((V - a) @ ab) / (ab @ ab), 0, 1)
            d = np.minimum(d, np.linalg.norm(V - (a + t[:, None] * ab), axis=1))
        return d < width
    V, N = _surface(ob, mask)
    if len(V) == 0:
        return None, None
    k = min(density, len(V) * 4)
    i = rng.integers(0, len(V), k)
    T, B = _tangent_frame(N[i])
    roots = V[i] + (T * rng.normal(0, 0.0006, (k, 1)) + B * rng.normal(0, 0.0006, (k, 1)))
    flow = geo.unit(np.asarray(flow_out, float))
    # direção: deitada sobre a pele (componente tangente do fluxo) + um pouco para fora
    f = flow[None] - (N[i] @ flow)[:, None] * N[i]
    d = geo.unit(geo.unit(f) * 0.85 + N[i] * 0.25 + np.array((0, 0, 0.2)) + rng.normal(0, 0.12, (k, 3)))
    L = rng.uniform(*length, k)
    s = np.linspace(0, 1, pts)
    sag = -N[i] * 0.25
    P = roots[:, None, :] + (d[:, None, :] * s[None, :, None] + sag[:, None, :] * (s ** 2)[None, :, None]) * L[:, None, None]
    R = thick * (1.0 - 0.7 * s)[None].repeat(k, 0)
    return P, R


def hair_material(name, melanin=0.97, redness=0.35, rough=0.32, radial=0.45, coat=0.12, random_color=0.12):
    """Cabelo (modelo de fibra do Cycles: reflexo, transmissão e segundo reflexo pela melanina)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    hb = nt.nodes.new('ShaderNodeBsdfHairPrincipled')
    if hasattr(hb, 'parametrization'):
        hb.parametrization = 'MELANIN'
    for k, v in (('Melanin', melanin), ('Melanin Redness', redness), ('Roughness', rough), ('Radial Roughness', radial),
                 ('Coat', coat), ('Random Color', random_color), ('Random Roughness', 0.12), ('IOR', 1.55)):
        if k in hb.inputs:
            hb.inputs[k].default_value = v
    nt.links.new(hb.outputs[0], out.inputs['Surface'])
    m['gltf_base'] = [0.02, 0.015, 0.012]
    m['gltf_metal'] = 0.0
    m['gltf_rough'] = 0.5
    m['gltf_emis'] = [0.0, 0.0, 0.0]
    m['gltf_strength'] = 0.0
    return m


# ====================================================================== olhos realistas
def eyeball(center, size, outward, up=(0, 0, 1), tilt=0.0, nu=96, nv=48):
    """Olho (globo amendoado entre as pálpebras) com atributo 'eixo' = cosseno do ângulo até o centro
    da pupila: o material desenha esclera, anel do limbo, íris e pupila a partir dele."""
    from math import radians
    x = geo.unit(np.cross(up, outward))
    x = geo.rot(outward, radians(tilt)) @ x
    z = geo.unit(np.cross(outward, x))
    R = np.stack([x, outward, z], 1)
    cage = geo.ellipsoid(center, (size[0], size[1], size[2]), (2.0, 2.0), R, nu, nv)
    V = np.asarray(cage.verts) - np.asarray(center)
    loc = V @ R                                   # coordenadas locais (x, frente, z)
    sph = geo.unit(loc / np.asarray(size))
    # a íris é um disco de verdade no olho: usa a esfera "inflada" na frente
    eixo = sph[:, 1]
    return cage, eixo


def eye_material(name, iris=(0.16, 0.07, 0.025), glow=(1.0, 0.38, 0.06), glow_strength=3.0, sclera=(0.72, 0.64, 0.58),
                 iris_cos=0.83, pupil_cos=0.975):
    """Esclera levemente amarelada com veias suaves, anel escuro do limbo, íris com fibras radiais que
    brilham (olhos do Saci acesos como brasa), pupila e uma camada de verniz (córnea molhada)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bs = nt.nodes.new('ShaderNodeBsdfPrincipled')
    at = nt.nodes.new('ShaderNodeAttribute')
    at.attribute_name = 'eixo'
    e = at.outputs['Fac']
    cr = nt.nodes.new('ShaderNodeValToRGB')
    els = cr.color_ramp.elements
    stops = [(0.0, sclera), (iris_cos - 0.035, sclera), (iris_cos - 0.008, (0.08, 0.05, 0.04)), (iris_cos + 0.004, iris),
             (pupil_cos - 0.012, tuple(c * 1.6 for c in iris)), (pupil_cos - 0.002, (0.01, 0.008, 0.007)), (1.0, (0.004, 0.004, 0.004))]
    while len(els) < len(stops):
        els.new(0.5)
    for el, (p, c) in zip(els, stops):
        el.position = p
        el.color = (*c, 1)
    nt.links.new(e, cr.inputs['Fac'])
    # fibras radiais da íris (ondas em volta do eixo) e veias na esclera
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nzv = nt.nodes.new('ShaderNodeTexNoise')
    nzv.inputs['Scale'].default_value = 900.0
    nzv.inputs['Detail'].default_value = 6.0
    nt.links.new(tc.outputs['Object'], nzv.inputs['Vector'])
    mix = nt.nodes.new('ShaderNodeMixRGB')
    mix.blend_type = 'MULTIPLY'
    mix.inputs['Fac'].default_value = 0.35
    nt.links.new(cr.outputs['Color'], mix.inputs['Color1'])
    nt.links.new(nzv.outputs['Color'], mix.inputs['Color2'])
    nt.links.new(mix.outputs['Color'], bs.inputs['Base Color'])
    # brilho só na íris
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = iris_cos
    mr.inputs['From Max'].default_value = iris_cos + 0.02
    nt.links.new(e, mr.inputs['Value'])
    mr2 = nt.nodes.new('ShaderNodeMapRange')
    mr2.inputs['From Min'].default_value = pupil_cos - 0.004
    mr2.inputs['From Max'].default_value = pupil_cos - 0.016
    nt.links.new(e, mr2.inputs['Value'])
    mul = nt.nodes.new('ShaderNodeMath')
    mul.operation = 'MULTIPLY'
    nt.links.new(mr.outputs['Result'], mul.inputs[0])
    nt.links.new(mr2.outputs['Result'], mul.inputs[1])
    mul2 = nt.nodes.new('ShaderNodeMath')
    mul2.operation = 'MULTIPLY'
    nt.links.new(mul.outputs[0], mul2.inputs[0])
    mul2.inputs[1].default_value = glow_strength
    bs.inputs['Emission Color'].default_value = (*glow, 1)
    nt.links.new(mul2.outputs[0], bs.inputs['Emission Strength'])
    bs.inputs['Roughness'].default_value = 0.25
    for k, v in (('Coat Weight', 1.0), ('Coat Roughness', 0.02), ('Coat IOR', 1.376), ('Subsurface Weight', 0.25),
                 ('Specular IOR Level', 0.5)):
        if k in bs.inputs:
            bs.inputs[k].default_value = v
    if 'Subsurface Radius' in bs.inputs:
        bs.inputs['Subsurface Radius'].default_value = (1.0, 0.4, 0.3)
    if 'Subsurface Scale' in bs.inputs:
        bs.inputs['Subsurface Scale'].default_value = 0.002
    nt.links.new(bs.outputs[0], out.inputs['Surface'])
    # no jogo (glTF sem os nós): olho escuro da cor da íris, aceso pela brasa
    m['gltf_base'] = list(iris)
    m['gltf_metal'] = 0.0
    m['gltf_rough'] = 0.25
    m['gltf_emis'] = list(glow)
    m['gltf_strength'] = max(2.0, glow_strength * 3.0)
    return m
