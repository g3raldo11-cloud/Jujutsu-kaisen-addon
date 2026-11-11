"""BOITATÁ — a cobra de fogo (versão orgânica, esculpida).

Serpente enorme coberta de escamas sobrepostas (geometria de verdade, milhares de escamas), ventre
em placas largas, cabeça de dragão com chifres varridos para trás, arcos das sobrancelhas, espinhos
nas bochechas, boca aberta com presas e língua bifurcada, e MUITOS OLHOS de fogo ao longo do corpo
(a cobra que guarda os olhos dos bichos). Chamas correm pelas bordas do corpo.

O corpo é gerado ao longo de um caminho: enrolado para os renders e reto (com uma corrente de ossos)
para o jogo, onde os ossos seguem o corpo simulado.
"""
import bpy
import numpy as np
from math import tau, pi, cos, sin, radians
from mathutils import Matrix, Vector

from . import geo, kit, sculpt, org, rig as rigmod
from .humano import Hero

ID = 'boitata'
HERO_COLOR = (1.0, 0.55, 0.1)
HEIGHT = 2.2
UP = np.array((0.0, 0.0, 1.0))
R_MAX = 0.32


def radius_at(t):
    """Raio ao longo do corpo (0 = pescoço, 1 = ponta da cauda)."""
    if t < 0.12:
        return R_MAX * (0.82 + 0.18 * t / 0.12)
    return R_MAX * max(0.035, (1.0 - (t - 0.12) / 0.88) ** 1.15)


def materials():
    M = {}
    M['escama'] = scale_material()
    M['ventre'] = org.solid('boi_ventre', (0.32, 0.22, 0.12), 0.32, 0.0, 30.0, 0.15, coat=0.4, variation=0.3)
    M['pele'] = head_scales_material()
    M['chifre'] = org.solid('boi_chifre', (0.2, 0.15, 0.1), 0.42, 0.0, 50.0, 0.4, coat=0.3, variation=0.5)
    M['dente'] = org.solid('boi_dente', (0.82, 0.76, 0.62), 0.3, 0.0, 80.0, 0.1, coat=0.4, sss=0.2)
    M['boca'] = org.solid('boi_boca', (0.2, 0.025, 0.02), 0.35, 0.0, 60.0, 0.2, sss=0.5)
    M['lingua'] = org.solid('boi_lingua', (0.25, 0.02, 0.03), 0.3, 0.0, 80.0, 0.15, sss=0.5)
    M['olho'] = org.glow('boi_olho', (1.0, 0.82, 0.45), 9.0)
    M['olho_corpo'] = org.glow('boi_olho_corpo', (0.75, 0.92, 1.0), 7.0)
    M['pupila'] = org.solid('boi_pupila', (0.005, 0.004, 0.004), 0.2, 0.0)
    return M


def head_scales_material():
    m, nt, bs = org._nt('boi_pele_escamas')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    vo = nt.nodes.new('ShaderNodeTexVoronoi')
    vo.feature = 'DISTANCE_TO_EDGE'
    vo.inputs['Scale'].default_value = 26.0
    nt.links.new(tc.outputs['Object'], vo.inputs['Vector'])
    edge = org._math(nt, 'SUBTRACT', 1.0, org._math(nt, 'MULTIPLY', vo.outputs['Distance'], 9.0), clamp=True)
    mix = nt.nodes.new('ShaderNodeMixRGB')
    mix.inputs['Color1'].default_value = (0.17, 0.1, 0.04, 1)
    mix.inputs['Color2'].default_value = (0.02, 0.012, 0.006, 1)
    nt.links.new(edge, mix.inputs['Fac'])
    nt.links.new(mix.outputs['Color'], bs.inputs['Base Color'])
    org._bump(nt, bs, vo.outputs['Distance'], 0.5, 0.004)
    org._set(bs, 'Roughness', 0.42)
    org._set(bs, 'Coat Weight', 0.3)
    org._set(bs, 'Emission Color', (1.0, 0.32, 0.04, 1))
    nt.links.new(org._math(nt, 'MULTIPLY', org._math(nt, 'POWER', edge, 8.0), 1.2), bs.inputs['Emission Strength'])
    m.use_backface_culling = True
    org._gltf(m, (0.12, 0.07, 0.03), 0.0, 0.45)
    return m


def scale_material():
    """Escamas: centro dourado-amarronzado, bordas escuras (atributo 'borda'), manchas no dorso
    (atributo 'mancha') e brilho de brasa saindo entre as escamas (atributo 'fenda')."""
    m, nt, bs = org._nt('boi_escamas')
    ab = nt.nodes.new('ShaderNodeAttribute')
    ab.attribute_name = 'borda'
    am = nt.nodes.new('ShaderNodeAttribute')
    am.attribute_name = 'mancha'
    nz = org._noise(nt, 60.0, 3.0)
    c1 = nt.nodes.new('ShaderNodeMixRGB')
    c1.inputs['Color1'].default_value = (0.2, 0.12, 0.045, 1)
    c1.inputs['Color2'].default_value = (0.02, 0.012, 0.006, 1)
    nt.links.new(org._math(nt, 'POWER', ab.outputs['Fac'], 1.6), c1.inputs['Fac'])
    c2 = nt.nodes.new('ShaderNodeMixRGB')
    c2.blend_type = 'MULTIPLY'
    nt.links.new(c1.outputs['Color'], c2.inputs['Color1'])
    c2.inputs['Color2'].default_value = (0.12, 0.08, 0.05, 1)
    nt.links.new(am.outputs['Fac'], c2.inputs['Fac'])
    c3 = nt.nodes.new('ShaderNodeMixRGB')
    c3.blend_type = 'MULTIPLY'
    c3.inputs['Fac'].default_value = 0.3
    nt.links.new(c2.outputs['Color'], c3.inputs['Color1'])
    nt.links.new(nz.outputs['Color'], c3.inputs['Color2'])
    nt.links.new(c3.outputs['Color'], bs.inputs['Base Color'])
    org._set(bs, 'Emission Color', (1.0, 0.32, 0.04, 1))
    nt.links.new(org._math(nt, 'MULTIPLY', org._math(nt, 'POWER', ab.outputs['Fac'], 6.0), 1.6), bs.inputs['Emission Strength'])
    org._set(bs, 'Coat Weight', 0.35)
    org._set(bs, 'Coat Roughness', 0.25)
    nt.links.new(org._math(nt, 'ADD', 0.3, org._math(nt, 'MULTIPLY', ab.outputs['Fac'], 0.35)), bs.inputs['Roughness'])
    org._bump(nt, bs, nz.outputs['Fac'], 0.15, 0.001)
    m.use_backface_culling = False
    org._gltf(m, (0.24, 0.15, 0.06), 0.0, 0.45)
    return m


# ====================================================================== corpo com escamas
def body_mesh(path, sides=72, ring_step=0.012, scale_rows=0.042, scale_cols=19, seed=1):
    """Tubo do corpo (ventre achatado com placas) + escamas sobrepostas. Devolve gaiolas e atributos."""
    rng = np.random.default_rng(seed)
    P = geo.catmull(path, 24)
    L = geo.arclen(P)[-1]
    n = max(40, int(L / ring_step))
    P = geo.resample(P, n)
    T, N, B = geo.frames(P, UP)
    # mantém o "para cima" do corpo apontando para cima (o ventre para o chão) quando possível
    for i in range(n):
        up = UP - T[i] * np.dot(UP, T[i])
        if np.linalg.norm(up) > 0.2:
            up = geo.unit(up)
            N[i] = up
            B[i] = np.cross(T[i], up)
    s = np.linspace(0, 1, n)
    rad = np.array([radius_at(t) for t in s])
    th = np.linspace(0, tau, sides, endpoint=False)
    # seção: dorso arredondado, ventre achatado (th = pi é o ventre)
    belly = np.clip(np.cos(th - pi), 0, 1)
    rings = []
    plates = 0.5 + 0.5 * np.cos(np.linspace(0, L / 0.045 * tau, n))
    for i in range(n):
        r = rad[i] * (1.0 - 0.18 * belly ** 2 + 0.035 * belly ** 3 * plates[i])
        rings.append(P[i] + (np.cos(th)[:, None] * N[i] + np.sin(th)[:, None] * B[i]) * r[:, None])
    tube = geo.tube(rings, True, True)
    # escamas: grade (fileira ao longo x coluna em volta), deslocadas meia escama a cada fileira
    rows = int(L / scale_rows)
    verts, faces, borda, mancha = [], [], [], []
    gu, gv = 10, 8
    UU, VV = np.meshgrid(np.linspace(0, 1, gu), np.linspace(-1, 1, gv), indexing='ij')
    base_i = 0
    for ri in range(rows):
        t_back = (ri + 1.0) / rows
        t_front = (ri - 0.35) / rows
        if t_front < 0:
            continue
        i_mid = int((ri + 0.3) / rows * (n - 1))
        rr = rad[min(i_mid, n - 1)]
        cols = max(8, int(scale_cols * (0.6 + 0.4 * rr / R_MAX)))
        for ci in range(cols):
            a = (ci + 0.5 * (ri % 2)) / cols * tau
            if abs(((a - pi + pi) % tau) - pi) < 0.75:          # sem escamas no ventre (placas)
                continue
            half = tau / cols * 0.62
            tt = t_front + (t_back - t_front) * UU
            aa = a + half * VV * (1.0 - 0.45 * UU ** 2)       # escama afinando para trás (ponta)
            idx = np.clip((tt * (n - 1)).astype(int), 0, n - 1)
            frac = np.clip(tt * (n - 1) - idx, 0, 1)
            idx2 = np.clip(idx + 1, 0, n - 1)
            Pc = P[idx] * (1 - frac)[..., None] + P[idx2] * frac[..., None]
            Nc = N[idx] * (1 - frac)[..., None] + N[idx2] * frac[..., None]
            Bc = B[idx] * (1 - frac)[..., None] + B[idx2] * frac[..., None]
            rc = rad[idx] * (1 - frac) + rad[idx2] * frac
            bel = np.clip(np.cos(aa - pi), 0, 1)
            rs = rc * (1.0 - 0.18 * bel ** 2)
            lift = rc * (0.012 + 0.07 * UU ** 1.4) * (1.0 - 0.55 * np.abs(VV) ** 2)
            dirv = np.cos(aa)[..., None] * Nc + np.sin(aa)[..., None] * Bc
            Q = Pc + dirv * (rs + lift)[..., None]
            Q += rng.normal(0, rc[0, 0] * 0.004, Q.shape)
            verts.append(Q.reshape(-1, 3))
            for u in range(gu - 1):
                for v in range(gv - 1):
                    a0 = base_i + u * gv + v
                    faces.append((a0, a0 + 1, a0 + gv + 1, a0 + gv))
            e = np.clip(np.maximum(np.abs(VV), UU ** 3), 0, 1)
            borda.append(e.reshape(-1))
            m = 0.5 + 0.5 * np.sin(t_back * 70 + np.cos(a) * 3) * np.cos(a * 2)
            mancha.append(np.full(gu * gv, np.clip(m, 0, 1) * max(0.0, np.cos(a))))
            base_i += gu * gv
    sc = geo.Cage()
    sc.verts = [tuple(p) for p in np.concatenate(verts)]
    sc.faces = faces
    sc.mats = [0] * len(faces)
    return tube, sc, np.concatenate(borda), np.concatenate(mancha), (P, T, N, B, s, rad)


def body_eyes(frame, count=9, seed=2):
    """Olhos de fogo nas laterais do corpo (dos dois lados), cada um com pupila em fenda."""
    P, T, N, B, s, rad = frame
    rng = np.random.default_rng(seed)
    eyes, pupils = geo.Cage(), geo.Cage()
    n = len(P)
    for k in range(count):
        t = 0.1 + 0.62 * k / max(1, count - 1) + rng.uniform(-0.02, 0.02)
        i = int(t * (n - 1))
        for side in (1, -1):
            a = side * radians(58 + rng.uniform(-6, 6))
            d = geo.unit(cos(a) * N[i] + sin(a) * B[i])
            r = rad[i]
            c = P[i] + d * (r * 1.1)
            sz = r * 0.3
            Rm = np.stack([T[i], d, np.cross(T[i], d)], 1)
            eyes.merge(geo.ellipsoid(c, (sz, sz * 0.32, sz * 0.48), (2.0, 2.0), Rm, 20, 10))
            pupils.merge(geo.ellipsoid(c + d * sz * 0.22, (sz * 0.1, sz * 0.2, sz * 0.4), (2.0, 2.0), Rm, 12, 8))
            pupils.merge(geo.torus(c - d * sz * 0.05, d, sz * 1.0, sz * 0.18, 24, 8))
    return eyes, pupils


# ====================================================================== cabeça
def head_parts(seed=3, jaw_open=30.0):
    """Cabeça de dragão-serpente em coordenadas locais: focinho para -Y, nuca em y = 0.
    Devolve (crânio [malha unida], mandíbula [malha unida], peças separadas por material)."""
    from .sculpt import Sculpt
    rng = np.random.default_rng(seed)
    sk = Sculpt('boi_cranio')
    E = sk.ellip
    E((0, -0.2, 0.06), (0.2, 0.27, 0.14))           # crânio
    E((0, -0.53, 0.02), (0.12, 0.22, 0.075))        # focinho
    E((0, -0.42, -0.04), (0.14, 0.26, 0.05))        # maxila / lábio superior
    E((0, 0.1, -0.02), (0.25, 0.28, 0.21))          # pescoço
    for sx in (1, -1):
        E((0.14 * sx, -0.31, 0.15), (0.075, 0.15, 0.055), (geo.unit((1, 0.2 * sx, 0)), geo.unit((-0.2 * sx, 1, 0)), (0, 0, 1)))   # arcos
        E((0.17 * sx, -0.2, -0.01), (0.06, 0.17, 0.065))                                                                       # zigomático
        E((0.1 * sx, -0.08, 0.13), (0.08, 0.1, 0.06))
    ja = radians(jaw_open)
    hinge = np.array((0.0, -0.06, -0.06))
    Rj = geo.rot((1, 0, 0), -ja)
    jw = Sculpt('boi_mandibula')
    jw.ellip(hinge + Rj @ np.array((0, -0.28, -0.07)), (0.11, 0.28, 0.05), (Rj @ np.array((1.0, 0, 0)), Rj @ np.array((0, 1.0, 0)), Rj @ np.array((0, 0, 1.0))))
    for sx in (1, -1):
        jw.ellip(hinge + Rj @ np.array((0.1 * sx, -0.1, -0.05)), (0.06, 0.12, 0.05))
    parts = {'chifre': geo.Cage(), 'dente': geo.Cage(), 'boca': geo.Cage(), 'lingua': geo.Cage(), 'olho': geo.Cage(), 'pupila': geo.Cage()}
    jparts = {'dente': geo.Cage(), 'boca': geo.Cage(), 'lingua': geo.Cage()}
    for sx in (1, -1):
        # chifres grandes varridos para trás, com anéis
        r0 = np.array((0.12 * sx, -0.14, 0.16))
        ctrl = [r0, r0 + np.array((0.08 * sx, 0.18, 0.1)), r0 + np.array((0.16 * sx, 0.42, 0.12)), r0 + np.array((0.2 * sx, 0.6, 0.02))]
        parts['chifre'].merge(geo.sweep(ctrl, geo.circle(14, 0.05), 40, ref=(0, 0, 1),
                                        scale=lambda t: (1 - t) ** 0.9 * (1.0 + 0.08 * np.cos(t * 26) ** 4) + 0.02, caps=(True, True)))
        # espinhos nas bochechas e na nuca
        for j in range(5):
            p0 = np.array((0.2 * sx, -0.08 + j * 0.06, -0.03 - j * 0.01))
            d = geo.unit((0.7 * sx, 0.6, -0.1 - 0.05 * j))
            parts['chifre'].merge(geo.lathe([(0.02 - j * 0.002, 0.0), (0.014, 0.04), (0.0, 0.1 - j * 0.008)], 10, p0, d))
        # olhos (globo luminoso amendoado) e pupila em fenda
        ec = np.array((0.17 * sx, -0.36, 0.125))
        ed = geo.unit((0.85 * sx, -0.45, 0.35))
        Rm = np.stack([geo.unit(np.cross((0, 0, 1), ed)), ed, geo.unit(np.cross(ed, np.cross((0, 0, 1), ed)))], 1)
        parts['olho'].merge(geo.ellipsoid(ec, (0.058, 0.03, 0.038), (2.0, 2.0), Rm, 24, 12))
        parts['pupila'].merge(geo.ellipsoid(ec + ed * 0.02, (0.008, 0.014, 0.032), (2.0, 2.0), Rm, 12, 8))
        # presas superiores e fileira de dentes
        f0 = np.array((0.07 * sx, -0.58, -0.07))
        parts['dente'].merge(geo.sweep([f0, f0 + np.array((0.0, 0.01, -0.07)), f0 + np.array((-0.01 * sx, 0.04, -0.16))], geo.circle(10, 0.02), 14,
                                       ref=(1, 0, 0), scale=lambda t: (1 - t) ** 0.8 + 0.03, caps=(True, True)))
        for j in range(9):
            t = j / 8
            p = np.array(((0.09 + 0.05 * t) * sx, -0.52 + 0.4 * t, -0.075))
            parts['dente'].merge(geo.lathe([(0.011, 0.0), (0.008, 0.02), (0.0, 0.045 - 0.015 * t)], 8, p, (0.0, 0.1, -1.0)))
            pj = hinge + Rj @ (np.array(((0.085 + 0.03 * t) * sx, -0.5 + 0.38 * t, -0.03)) - hinge + np.array((0, 0, 0.04)))
            jparts['dente'].merge(geo.lathe([(0.01, 0.0), (0.007, 0.018), (0.0, 0.04 - 0.012 * t)], 8, pj, Rj @ np.array((0.0, -0.1, 1.0))))
        pf = hinge + Rj @ (np.array((0.06 * sx, -0.52, 0.0)) - hinge)
        jparts['dente'].merge(geo.sweep([pf, pf + Rj @ np.array((0, -0.01, 0.06)), pf + Rj @ np.array((0.01 * sx, -0.03, 0.13))], geo.circle(10, 0.016), 12,
                                        ref=(1, 0, 0), scale=lambda t: (1 - t) ** 0.8 + 0.03, caps=(True, True)))
    # céu da boca e gengivas, e a língua bifurcada saindo da boca
    parts['boca'].merge(geo.ellipsoid((0, -0.36, -0.085), (0.11, 0.24, 0.03), nu=32, nv=12))
    jparts['boca'].merge(geo.ellipsoid(hinge + Rj @ np.array((0, -0.26, -0.03)), (0.095, 0.24, 0.03), nu=32, nv=12))
    t0 = hinge + Rj @ np.array((0, -0.2, -0.0))
    t1 = hinge + Rj @ np.array((0, -0.5, 0.03))
    t2 = t1 + np.array((0.0, -0.22, -0.06))
    jparts['lingua'].merge(geo.sweep([t0, t1, t2], geo.superellipse(10, 0.025, 0.008, 2.2), 20, ref=(0, 0, 1), scale=lambda t: 1 - 0.4 * t,
                                     caps=(True, True)))
    for sx in (1, -1):
        jparts['lingua'].merge(geo.sweep([t2, t2 + np.array((0.03 * sx, -0.08, -0.01)), t2 + np.array((0.07 * sx, -0.14, 0.03))],
                                         geo.superellipse(8, 0.013, 0.006, 2.2), 12, ref=(0, 0, 1), scale=lambda t: (1 - t) ** 0.8 + 0.05,
                                         caps=(True, True)))
    return sk, jw, parts, jparts, hinge


def build(detail=2, voxel=0.004, coiled=False, path=None):
    col = kit.collection(ID)
    M = materials()
    meshes = {}

    def add(name, cage, mat, sub=0, attrs=None):
        me = kit.cage_to_mesh(cage, name, 50.0, attrs)
        me.materials.append(M[mat])
        o = bpy.data.objects.new(name, me)
        col.objects.link(o)
        if sub:
            md = o.modifiers.new('Sub', 'SUBSURF')
            md.levels = sub
            md.render_levels = sub
            o = sculpt.apply_mods(o)
        o.data.polygons.foreach_set('use_smooth', [True] * len(o.data.polygons))
        meshes[name] = o
        return o

    # ---------------- corpo (reto para o jogo; o render passa o caminho enrolado)
    if path is None:
        path = [np.array((0.0, 0.25 + 0.7 * i, R_MAX * 1.05)) for i in range(10)]
    tube, scales, borda, mancha, frame = body_mesh(path)
    add('corpo', tube, 'ventre', 1)
    add('escamas', scales, 'escama', 0, {'borda': borda, 'mancha': mancha})
    eyes, pupils = body_eyes(frame)
    add('olhos_corpo', eyes, 'olho_corpo', 1)
    add('pupilas_corpo', pupils, 'pupila')
    # ---------------- cabeça (unida por voxel) e mandíbula
    P, T, N, B, s, rad = frame
    sk, jw, parts, jparts, hinge = head_parts()
    head_pos = P[0] + T[0] * 0.02
    HS = 1.4
    fwd = -T[0]
    yv = -geo.unit(fwd)                                          # local: -Y = frente
    zv = geo.unit(UP - yv * np.dot(UP, yv))
    Rh = np.stack([np.cross(yv, zv), yv, zv], 1)

    def place_cage(cg):
        cg.apply(Rh * HS, head_pos)
        return cg
    skull = sk.to_mesh(0.006, col=col)
    skull = sculpt.remesh(skull, voxel * 0.8, smooth=3)
    jaw = jw.to_mesh(0.006, col=col)
    jaw = sculpt.remesh(jaw, voxel * 0.8, smooth=3)
    for o, nm in ((skull, 'cabeca'), (jaw, 'mandibula')):
        Mw = np.eye(4)
        Mw[:3, :3] = Rh * HS
        Mw[:3, 3] = head_pos
        o.data.transform(Matrix(Mw.tolist()))
        o.data.materials.append(M['pele'])
        sculpt.noise_displace(o, 0.004, 22.0, seed=4)
        sculpt.noise_displace(o, 0.0012, 90.0, seed=5)
        o.data.polygons.foreach_set('use_smooth', [True] * len(o.data.polygons))
        o.name = nm
        meshes[nm] = o
    for key, cg in parts.items():
        if cg.verts:
            add('cabeca_' + key, place_cage(cg), key if key in M else 'pele', 1 if key in ('chifre', 'dente', 'olho') else 0)
    for key, cg in jparts.items():
        if cg.verts:
            add('mandibula_' + key, place_cage(cg), key, 1)

    # ---------------- esqueleto: corrente de ossos ao longo do corpo + cabeça + mandíbula
    bones = []
    nb = 28
    idx = np.linspace(0, len(P) - 1, nb + 1).astype(int)
    for b in range(nb):
        bones.append((f'coluna_{b:02d}', tuple(P[idx[b]]), tuple(P[idx[b + 1]]), f'coluna_{b - 1:02d}' if b else None))
    hb = head_pos + Rh @ np.array((0, 0.05, 0.0)) * HS
    bones.append(('cabeca', tuple(hb), tuple(hb + Rh @ np.array((0, -0.4, 0.0)) * HS), 'coluna_00'))
    jh = head_pos + Rh @ hinge * HS
    bones.append(('mandibula', tuple(jh), tuple(jh + Rh @ np.array((0, -0.4, -0.15)) * HS), 'cabeca'))
    arm = rigmod.armature(ID + '_esqueleto', bones, col)
    names = [b[0] for b in bones[:nb]]
    seg_s = np.linspace(0, 1, nb + 1)
    from scipy.spatial import cKDTree
    tree = cKDTree(P)

    def chain_weights(o):
        V = sculpt.verts(o)
        _, ii = tree.query(V)
        t = s[ii]
        f = np.clip(t * nb - 0.5, 0, nb - 1)
        i0 = np.floor(f).astype(int)
        i1 = np.clip(i0 + 1, 0, nb - 1)
        w1 = f - i0
        W = np.zeros((len(V), nb))
        W[np.arange(len(V)), i0] += 1 - w1
        W[np.arange(len(V)), i1] += w1
        rigmod.assign(o, names, W)
        rigmod.bind(o, arm)
    for nm in ('corpo', 'escamas', 'olhos_corpo', 'pupilas_corpo'):
        chain_weights(meshes[nm])
    for nm, o in meshes.items():
        if nm.startswith('cabeca'):
            rigmod.rigid(o, arm, 'cabeca')
        elif nm.startswith('mandibula'):
            rigmod.rigid(o, arm, 'mandibula')
    from .humano import anchors
    tip = P[-1]
    anchors(arm, [('FX_boca', 'mandibula', head_pos + Rh @ np.array((0, -0.62, -0.05)) * HS),
                  ('FX_olho_r', 'cabeca', head_pos + Rh @ np.array((0.16, -0.37, 0.12)) * HS),
                  ('FX_olho_l', 'cabeca', head_pos + Rh @ np.array((-0.16, -0.37, 0.12)) * HS),
                  ('FX_chifres', 'cabeca', head_pos + Rh @ np.array((0, 0.25, 0.3)) * HS),
                  ('FX_cauda', f'coluna_{nb - 1:02d}', tip)])
    lm = {'cabeca': head_pos, 'cauda': tip, 'head_scale': HS, 'Rh': Rh}
    hero = Hero(ID, col, arm, meshes, lm)
    hero.frame = frame
    return hero


# ====================================================================== apresentação (render)
def coil_path(top=0.0):
    """Corpo enrolado: o pescoço ergue a cabeça; o corpo dá uma volta e meia; a cauda se curva na frente."""
    return [np.array(p) for p in (
        (0.05, -0.45, 1.55), (0.0, -0.15, 1.4), (-0.05, 0.25, 1.05), (0.2, 0.6, 0.65), (0.75, 0.75, 0.36),
        (1.3, 0.35, 0.3), (1.45, -0.3, 0.3), (1.05, -0.9, 0.3), (0.35, -1.15, 0.29), (-0.4, -1.05, 0.28),
        (-1.05, -0.6, 0.27), (-1.3, 0.05, 0.25), (-1.05, 0.7, 0.24), (-0.45, 1.05, 0.22), (0.25, 1.15, 0.2),
        (0.9, 0.95, 0.16), (1.25, 0.45, 0.12), (1.0, 0.05, 0.1), (0.55, -0.2, 0.12), (0.25, -0.55, 0.22))]


def present(hero, mode, a, path_png):
    from . import stage, fx, mats
    w, h = map(int, a.res.split('x'))
    if mode == 'retrato':
        w, h = 1080, 1350
    if mode == 'argila':
        from .humano import clay
        return clay(hero, a, path_png)
    stage.setup_render((w, h), a.samples, 0.05, volumetric=True)
    stage.world(horizon=(0.03, 0.02, 0.018), zenith=(0.004, 0.005, 0.008), fog=0.022, fog_color=(0.9, 0.7, 0.55))
    stage.spot_light('Lua', (-2.5, 4.5, 9.0), (0.0, 0.0, 0.6), 7000.0, (0.6, 0.75, 1.0), 30, 0.5, 0.3, 1.0)
    stage.area_light('Principal', (3.0, -3.5, 3.5), (0, 0, 0.9), 380.0, (1.0, 0.9, 0.8), 3.0, 0.0)
    stage.area_light('Recorte', (-3.0, 3.0, 2.5), (0, 0, 1.0), 900.0, (1.0, 0.5, 0.15), 2.0, 0.05)
    org.forest(seed=13, trunks=26)
    frame = hero.frame
    P, T, N, B, s, rad = frame
    if not a.nofx:
        rng = np.random.default_rng(31)
        hot = fx.tongue_material('boi_lingua_fogo', 3.0)
        blue = fx.tongue_material('boi_lingua_azul', 2.4, fx.BLUE_STOPS)
        ember = mats.emission_only('boi_fagulha', (1.0, 0.5, 0.1), 6.0)[0]
        ember2 = mats.emission_only('boi_brasa_ar', (1.0, 0.4, 0.06), 3.0)[0]
        # chamas correndo pelas bordas do corpo (dorso e laterais), algumas azuladas
        roots, dirs, Ls, Ws, broots, bdirs, bLs, bWs = [], [], [], [], [], [], [], []
        n = len(P)
        for i in range(8, n - 20, 11):
            for side in ((-1, 0, 0, 1) if (i // 11) % 2 else (0, 1)):
                ang = side * radians(50) + rng.normal(0, 0.25)
                d = geo.unit(cos(ang) * N[i] + sin(ang) * B[i])
                r0 = P[i] + d * rad[i] * 1.02
                dd = geo.unit(d * 0.5 + UP * 0.9 + np.array((0.25, 0.15, 0)) + rng.normal(0, 0.25, 3))
                L = rng.uniform(0.08, 0.5) ** 1.3 * 1.5 * (0.4 + rad[i] / R_MAX)
                W = rng.uniform(0.03, 0.06) * (0.5 + rad[i] / R_MAX)
                if rng.uniform() < 0.32:
                    broots.append(r0); bdirs.append(dd); bLs.append(L); bWs.append(W)
                else:
                    roots.append(r0); dirs.append(dd); Ls.append(L); Ws.append(W)
        fx.tongues('chamas_corpo', roots, dirs, Ls, Ws, hot, seed=1, wobble=0.45)
        fx.tongues('chamas_azuis', broots, bdirs, bLs, bWs, blue, seed=2, wobble=0.45)
        for i in range(10, n - 30, int(n / 8)):
            fx.fire_volume(f'fogo_corpo{i}', P[i] + N[i] * rad[i] * 0.6, rad[i] * 1.6, 0.7, strength=1.8, density=3.0, seed=i * 0.37,
                           scale=(3, 3, 1.4))
            stage.point_light(f'luz_corpo{i}', P[i] + N[i] * rad[i] * 1.8, 70.0 * rad[i] / R_MAX, (1.0, 0.45, 0.12), 0.15)
        # sopro de fogo saindo da boca aberta
        HS = hero.lm['head_scale']
        mouth = hero.lm['cabeca'] + hero.lm['Rh'] @ np.array((0, -0.66, -0.06)) * HS
        fwd = -T[0]
        R = np.stack([np.cross(geo.unit(fwd + (0, 0, -0.35)), (1, 0, 0)), np.array((1.0, 0, 0)), geo.unit(fwd + (0, 0, -0.35))], 1)
        fx.tongues('sopro', [mouth] * 12, [geo.unit(fwd + (0, 0, -0.3)) + rng.normal(0, 0.15, 3) for _ in range(12)],
                   rng.uniform(0.4, 0.95, 12), rng.uniform(0.05, 0.09, 12), hot, seed=3, wobble=0.5)
        stage.point_light('luz_sopro', mouth + fwd * 0.5, 160.0, (1.0, 0.5, 0.12), 0.2)
        stage.point_light('luz_olhos', hero.lm['cabeca'] + hero.lm['Rh'] @ np.array((0, -0.5, 0.35)) * HS, 60.0, (1.0, 0.8, 0.5), 0.1)
        stage.area_light('Rosto', hero.lm['cabeca'] + np.array((1.2, -1.6, 0.6)), hero.lm['cabeca'], 160.0, (1.0, 0.85, 0.7), 1.0, 0.0)
        fx.motes('brasas_ar', (0, 0.0, 0.0), 320, 3.0, 3.2, 0.0045, ember2, seed=5)
        fx.streaks('faiscas_ar', (0, 0.0, 0.3), 90, 2.4, 2.6, ember, seed=6, length=(0.03, 0.08), thick=0.0016)
        fx.smoke_volume('fumaca', (0.0, 0.6, 0.6), 1.8, 2.6, density=0.8, seed=7.0, color=(0.25, 0.2, 0.18))
    if mode == 'retrato':
        stage.camera((1.5, -4.1, 1.55), (0.0, -0.25, 0.95), 40, 2.8, focus=(0.05, -0.55, 1.5))
    elif mode == 'close':
        stage.camera((1.1, -2.1, 1.75), (0.05, -0.55, 1.4), 45, 2.0, focus=(0.05, -0.8, 1.45))
    else:
        stage.camera((2.6, -5.0, 1.9), (0.0, -0.05, 0.75), 34, 2.8, focus=(0.0, -0.5, 1.4))
    stage.render(path_png)


def build_render(detail=2):
    """Versão enrolada (para os renders)."""
    return build(detail, path=coil_path())
