"""BOITATÁ — "Serpente de Brasa" (versão mecanizada).

A cobra de fogo que protege os campos, aqui contida numa couraça de obsidiana e ouro: o fogo vive
DENTRO do corpo e aparece entre as escamas. Traços da lenda mantidos: serpente enorme, olhos
gigantes de fogo, corpo em chamas. O corpo é feito de MÓDULOS (anéis de escamas) iguais: no Blender
eles são enfileirados ao longo de uma espiral; no Godot e no Hero Select, cada módulo é instanciado
ao longo do corpo simulado (que muda de forma durante o jogo).

Nós do .glb: cabeca (com mandibula), segmento (módulo-modelo, em +Z = frente), cauda (ponta).
"""
import numpy as np
from math import tau, pi, cos, sin, radians

from . import geo, kit, mats, parts
from .parts import C, CU, RU, JA, BO, AC, BR, NU, VI, EX, Builder, align_y, keel, bulge

ID = 'boitata'
F = geo.FRONT
UPV = np.array((0.0, 0.0, 1.0))
HERO_COLOR = (1.0, 0.55, 0.1)
HEIGHT = 2.0
SEG_L = 0.42          # comprimento do módulo em escala 1
SEG_R = 0.45          # raio de referência do módulo (escala 1)


def materials():
    return {
        'carvao': mats.make('boi_obsidiana', (0.018, 0.02, 0.024), 0.9, 0.3, 'metal', detail=0.4),
        'cobre': mats.make('boi_ouro', (0.95, 0.68, 0.28), 1.0, 0.22, 'metal'),
        'rubro': mats.make('boi_escama', (0.008, 0.045, 0.042), 0.55, 0.3, 'paint', coat=0.3, detail=0.35),
        'jade': mats.make('boi_marfim', (0.82, 0.76, 0.64), 0.2, 0.3, 'paint', coat=0.3),
        'borracha': mats.make('boi_borracha', (0.011, 0.011, 0.012), 0.0, 0.55, 'rubber'),
        'aco': mats.make('boi_aco', (0.62, 0.63, 0.66), 1.0, 0.18, 'metal'),
        'brasa': mats.make('boi_brasa', (0.1, 0.03, 0.0), 0.0, 0.5, 'emit', (1.0, 0.42, 0.06), 2.6),
        'nucleo': mats.make('boi_nucleo', (0.2, 0.15, 0.0), 0.0, 0.4, 'emit', (1.0, 0.78, 0.32), 4.0),
        'visor': mats.make('boi_vidro', (0.003, 0.004, 0.006), 0.2, 0.05, 'glass'),
        'extra': mats.make('boi_fogo_azul', (0.02, 0.05, 0.1), 0.0, 0.5, 'emit', (0.25, 0.55, 1.0), 2.6),
    }


# ====================================================================== cabeça
def head(b):
    r = b.r
    H = np.array((0.0, 0.0, 0.55))
    rel = lambda *v: H + np.array(v, float)
    r.pivot('cabeca', H, 'corpo')
    sk = geo.LoftSurf([rel(0, 0.36, 0.02), rel(0, 0.1, 0.04), rel(0, -0.15, 0.02), rel(0, -0.38, -0.01), rel(0, -0.56, -0.04), rel(0, -0.64, -0.05)],
                      a=[0.19, 0.215, 0.19, 0.135, 0.088, 0.045], b=[0.3, 0.36, 0.31, 0.21, 0.13, 0.06], p=[2.6, 3.0, 3.0, 2.8, 2.6, 2.4], ref=UPV)
    b.part('cabeca', sk.tube(44, 40, m=BR), None, 1)
    vt, vm, vbt = (kit.vdir(sk, 0.4, d) for d in (UPV, (-1, 0, 0), (0, 0, -1)))
    # couraça do crânio: placas do topo com quilha, laterais em escamas, beiço de ouro
    for (u0, u1) in ((0.0, 0.3), (0.32, 0.6), (0.62, 0.88)):
        b.part('cabeca', geo.plate(sk, u0, u1, vt - 0.17, vt + 0.17, 10, 12, 0.008, 0.03, C, thick_fn=keel(0.8, 0.14)))
    for (u0, u1) in ((0.02, 0.3), (0.56, 0.92)):
        b.sym('cabeca', geo.plate(sk, u0, u1, vt + 0.13, vt + 0.31, 10, 8, 0.01, 0.024, RU, thick_fn=lambda U, V: 1 + 0.6 * (1 - U) ** 2))
    b.sym('cabeca', geo.plate(sk, 0.05, 0.94, vt + 0.31, vt + 0.43, 16, 6, 0.008, 0.02, C))
    b.sym('cabeca', geo.plate(sk, 0.08, 0.95, vt + 0.415, vt + 0.44, 16, 3, 0.022, 0.008, CU), (0.002, 1), 1)
    b.part('cabeca', geo.plate(sk, 0.86, 1.0, vt - 0.22, vt + 0.22, 6, 10, 0.008, 0.022, CU))
    b.part('cabeca', geo.ellipsoid(rel(0, -0.635, -0.045), (0.07, 0.04, 0.05), nu=24, nv=12, m=CU), None, 1)
    # olhos gigantes de fogo com pupila em fenda, órbita de ouro e sobrancelha pesada
    ue = sk.u_at(H[1] - 0.06, axis=1)
    for sx in (1, -1):
        ve = kit.vdir(sk, ue, (sx * 1.0, 0.0, 0.55))
        P, N = sk.grid2(np.array([[ue]]), np.array([[ve]]))
        e = P[0, 0] + N[0, 0] * 0.03
        ed = geo.unit(N[0, 0] + (0, -0.35, 0.0))
        Re = parts.align_z(ed, (0, 0, 1))
        b.part('cabeca', geo.ellipsoid(e, (0.07, 0.092, 0.058), (2.2, 2.2), Re, 32, 16, NU), None, 1)
        b.part('cabeca', geo.lathe([(0.084, -0.04), (0.104, -0.03), (0.11, -0.004), (0.1, 0.018), (0.088, 0.022), (0.082, 0.004)],
                                   44, e - ed * 0.01, ed, (0, 0, 1), False, CU), (0.003, 2), 1)
        b.part('cabeca', geo.box(e + ed * 0.056, (0.012, 0.004, 0.13), Re, C), (0.0015, 1), 1)
        brow = geo.EllipsoidSurf(e + (0.0, 0.01, 0.05), (0.12, 0.12, 0.07))
        b.part('cabeca', geo.plate(brow, 0.08 if sx > 0 else 0.42, 0.58 if sx > 0 else 0.92, 0.62, 0.95, 12, 8, 0.004, 0.03, C,
                                   thick_fn=keel(0.6, 0.25)))
        # guelras com fogo atrás dos olhos
        g = rel(0.27 * sx, 0.17, 0.0)
        Rg = geo.euler(0, 0, -90 * sx) @ geo.euler(0, 0, 0)
        b.part('cabeca', geo.vent(g, geo.euler(0, 0, 90 - 12 * sx), 0.16, 0.11, 6, 0.03, 0.01, 30, C, CU, BR), (0.002, 1), 0)
        # narinas-bocal
        n0 = rel(0.05 * sx, -0.6, 0.03)
        nd = geo.unit((0.2 * sx, -1.0, 0.5))
        b.part('cabeca', geo.lathe([(0.0, 0.0), (0.018, 0.0), (0.02, 0.02), (0.016, 0.026), (0.0, 0.022)], 16, n0, nd, m=CU), (0.0015, 1), 1)
        b.part('cabeca', geo.lathe([(0.0, 0.0), (0.012, 0.0), (0.012, 0.004), (0.0, 0.004)], 12, n0 + nd * 0.022, nd, m=EX), None, 0)
        r.anchor('FX_narina_' + ('r' if sx > 0 else 'l'), n0 + nd * 0.05, 'cabeca')
        # presas superiores
        f0 = rel(0.1 * sx, -0.47, -0.08)
        b.part('cabeca', geo.sweep([f0, f0 + (0.0, -0.01, -0.07), f0 + (-0.01 * sx, 0.012, -0.15)], geo.circle(10, 0.02), 10,
                                   ref=(1, 0, 0), scale=lambda s: (1 - s) ** 0.9, caps=(True, True), m=JA), (0.002, 1), 1)
    r.anchor('FX_olho_r', rel(0.27, -0.12, 0.12), 'cabeca')
    r.anchor('FX_olho_l', rel(-0.27, -0.12, 0.12), 'cabeca')
    # chifres-barbatana varridos para trás (ouro, pontas em brasa)
    horns = geo.Cage()
    for k in range(5):
        xk = (k - 2) * 0.075
        root = rel(xk, 0.06 + 0.06 * abs(k - 2), 0.21 - 0.03 * abs(k - 2))
        d = geo.unit((xk * 1.6, 1.0, 0.85 - 0.12 * abs(k - 2)))
        Lh = 0.6 - 0.1 * abs(k - 2)
        side = geo.unit(np.cross(d, (0, 0, 1)) + 1e-4)
        ctrl = [root, root + d * Lh * 0.4 + (0, 0, 0.04), root + d * Lh * 0.75 + (0, 0.04, 0.03), root + d * Lh + (0, 0.1, -0.02)]
        horns.merge(geo.sweep(ctrl, geo.superellipse(10, 0.05, 0.016, 2.2), 16, ref=side, scale=lambda s: (1 - s) ** 0.85,
                              caps=(True, True), m_fn=lambda s: C if s < 0.45 else (CU if s < 0.75 else BR)))
    b.part('cabeca', horns, (0.002, 1), 1)
    r.anchor('FX_chifres', rel(0.0, 0.42, 0.62), 'cabeca')
    # colar do pescoço
    nk = geo.LoftSurf([rel(0, 0.3, 0.02), rel(0, 0.42, 0.0), rel(0, 0.52, -0.02)], a=[0.25, 0.27, 0.28], b=[0.3, 0.31, 0.32], p=2.6, ref=UPV)
    b.part('cabeca', nk.tube(8, 40, m=BR), None, 1)
    b.part('cabeca', geo.plate(nk, 0.0, 0.42, 0.0, 1.0, 4, 44, 0.006, 0.026, CU, wrap=True), (0.004, 2))
    b.part('cabeca', geo.plate(nk, 0.5, 0.95, 0.0, 1.0, 5, 44, 0.004, 0.03, C, wrap=True, thick_fn=lambda U, V: 1 + 0.5 * (1 - U)))

    # ---------------- mandíbula articulada
    J = rel(0, 0.12, -0.06)
    r.pivot('mandibula', J, 'cabeca')
    jw = geo.LoftSurf([rel(0, 0.2, -0.11), rel(0, -0.1, -0.16), rel(0, -0.4, -0.155), rel(0, -0.57, -0.13)],
                      a=[0.08, 0.075, 0.06, 0.03], b=[0.25, 0.235, 0.16, 0.07], p=2.6, ref=UPV)
    b.part('mandibula', jw.tube(30, 32, m=C), None, 1)
    vt2 = kit.vdir(jw, 0.5, UPV)
    b.part('mandibula', geo.plate(jw, 0.04, 0.96, vt2 + 0.33, vt2 + 0.67, 16, 10, 0.006, 0.024, C, thick_fn=keel(0.5, 0.2)))
    b.sym('mandibula', geo.plate(jw, 0.05, 0.92, vt2 + 0.14, vt2 + 0.33, 14, 6, 0.008, 0.02, RU))
    b.sym('mandibula', geo.plate(jw, 0.06, 0.94, vt2 + 0.12, vt2 + 0.145, 14, 3, 0.02, 0.007, CU), (0.002, 1), 1)
    b.part('mandibula', geo.ellipsoid(rel(0, -0.24, -0.1), (0.13, 0.26, 0.022), nu=24, nv=10, m=BR), None, 1)
    teeth = geo.Cage()
    for sx in (1, -1):
        for k in range(6):
            t = k / 5
            p = rel(sx * (0.2 - 0.12 * t), -0.08 - 0.42 * t, -0.105 + 0.01 * t)
            hgt = 0.05 if k == 5 else 0.032
            teeth.merge(geo.lathe([(0.013, 0.0), (0.011, hgt * 0.4), (0.0, hgt)], 10, p, (0.0, -0.1, 1.0), m=JA))
    b.part('mandibula', teeth, (0.0015, 1), 1)
    r.anchor('FX_boca', rel(0.0, -0.5, -0.06), 'mandibula')


# ====================================================================== módulo do corpo (anel de escamas)
def chevron(v0, v1, ub, uf, point):
    """Escama com a borda de trás em ponta (V) — u cresce de trás (cauda) para a frente (cabeça)."""
    def fn(UN, VN):
        V = v0 + (v1 - v0) * VN
        tri = 1.0 - np.abs(2.0 * VN - 1.0)
        u_back = ub - point * tri
        return u_back + (uf - u_back) * UN, V
    return fn


def module(b, pv='segmento', length=SEG_L):
    """Anel de escamas: a traseira é um pouco mais larga e passa por cima da frente do próximo módulo
    (como escamas de verdade); o fogo interno aparece só pelas frestas finas."""
    r = b.r
    L = length
    ext = 0.16
    ms = geo.LoftSurf([(0, L / 2 + ext, 0), (0, L / 2, 0), (0, 0, 0), (0, -L / 2, 0)],
                      a=[0.455, 0.45, 0.432, 0.42], b=[0.475, 0.47, 0.452, 0.44], p=2.5, ref=UPV)
    b.part(pv, ms.tube(8, 40, m=BR, u0=0.18, u1=1.0), None, 1)
    vt = kit.vdir(ms, 0.5, UPV)
    uf = 0.985
    rows = [(-0.085, 0.085, C, 0.03, 0.14), (0.091, 0.2, RU, 0.026, 0.16), (0.206, 0.315, RU, 0.024, 0.16),
            (0.321, 0.425, C, 0.022, 0.14)]
    for (v0, v1, m, th, pt) in rows:
        cg = geo.plate(ms, nu=9, nv=7, off=0.012, thick=th, m=m, uvfn=chevron(vt + v0, vt + v1, 0.13, uf, pt),
                       thick_fn=lambda U, V: 1.0 + 0.5 * (1 - U) ** 2)
        if v0 < 0:
            b.part(pv, cg, (0.004, 2), 1)
        else:
            b.sym(pv, cg, (0.004, 2), 1)
        # friso de ouro seguindo a borda em V
        edge = geo.plate(ms, nu=2, nv=7, off=0.012 + th * 1.35, thick=0.005, m=CU,
                         uvfn=lambda UN, VN, v0=v0, v1=v1, pt=pt: (chevron(vt + v0, vt + v1, 0.13, uf, pt)(UN * 0.0, VN)[0] + 0.012 + UN * 0.025,
                                                                   vt + v0 + (v1 - v0) * VN))
        if v0 < 0:
            b.part(pv, edge, (0.0015, 1), 1)
        else:
            b.sym(pv, edge, (0.0015, 1), 1)
    b.part(pv, geo.plate(ms, nu=8, nv=8, off=0.01, thick=0.022, m=C, uvfn=chevron(vt + 0.431, vt + 0.569, 0.13, uf, 0.06)), (0.004, 2), 1)
    # barbatana dorsal em ouro com fresta de fogo
    top = 0.43 + 0.05
    fin = [(0.17, 0.0), (-0.14, 0.0), (-0.08, 0.07), (0.06, 0.2), (0.19, 0.26), (0.12, 0.11)]
    b.part(pv, geo.extrude(fin, 0.024, (0, 0, top), (0, 1, 0), (0, 0, 1), CU), (0.004, 2), 1)
    b.part(pv, geo.extrude([(0.11, 0.04), (-0.05, 0.04), (0.06, 0.15), (0.13, 0.17)], 0.028, (0, 0, top), (0, 1, 0), (0, 0, 1), BR), (0.002, 1), 0)
    bl = geo.bolts_on(ms, [(u, vt + s * 0.075) for u in (0.35, 0.6, 0.85) for s in (-1, 1)], 0.045, 0.011, 0.008, CU)
    b.part(pv, bl, None, 0)
    r.anchor('FX_barbatana', (0, 0.02, top + 0.26), pv)


def tail(b, pv='cauda'):
    r = b.r
    ts = geo.LoftSurf([(0, -0.22, 0), (0, 0.1, 0.01), (0, 0.45, 0.03), (0, 0.72, 0.05)], a=[0.42, 0.34, 0.2, 0.05], b=[0.44, 0.35, 0.21, 0.05],
                      p=2.6, ref=UPV)
    b.part(pv, ts.tube(24, 36, m=BR), None, 1)
    vt = kit.vdir(ts, 0.5, UPV)
    for (u0, u1) in ((0.02, 0.32), (0.35, 0.62), (0.65, 0.9)):
        b.part(pv, geo.plate(ts, u0, u1, vt - 0.14, vt + 0.14, 8, 10, 0.01, 0.03, C, thick_fn=keel(0.7, 0.14)))
        b.sym(pv, geo.plate(ts, u0, u1, vt + 0.14, vt + 0.29, 8, 8, 0.01, 0.024, RU, thick_fn=lambda U, V: 1 + 0.6 * U ** 2))
        b.sym(pv, geo.plate(ts, u0, u1, vt + 0.29, vt + 0.42, 8, 6, 0.008, 0.02, C))
        b.part(pv, geo.plate(ts, u0, u1, vt + 0.42, vt + 0.58, 6, 8, 0.008, 0.02, C))
    # lâmina-chama na ponta (ouro com fogo azul)
    blade = [(0.0, -0.06), (0.25, -0.1), (0.55, -0.02), (0.75, 0.12), (0.5, 0.08), (0.62, 0.22), (0.3, 0.12), (0.0, 0.08)]
    b.part(pv, geo.extrude(blade, 0.03, (0, 0.6, 0.05), (0, 1, 0), (0, 0, 1), CU), (0.004, 2), 1)
    b.part(pv, geo.extrude([(0.15, -0.02), (0.45, -0.01), (0.58, 0.1), (0.3, 0.06)], 0.036, (0, 0.6, 0.05), (0, 1, 0), (0, 0, 1), EX), (0.002, 1), 0)
    r.anchor('FX_cauda', (0, 1.25, 0.15), pv)


def build(detail=2):
    M = materials()
    rig = kit.Rig(ID, M)
    rig.pivot('corpo', (0, 0, 0), ID)
    b = Builder(rig, detail)
    head(b)
    rig.pivot('segmento', (0, 0, 0), 'corpo')
    rig.pivot('cauda', (0, 0, 0), 'corpo')
    module(b)
    tail(b)
    rig.finalize()
    return rig


def body_radius(t):
    """Mesmo perfil do Godot (0 = pescoço, 1 = ponta da cauda)."""
    if t < 0.22:
        return 0.36 + (0.48 - 0.36) * t / 0.22
    return 0.48 + (0.03 - 0.48) * ((t - 0.22) / 0.78) ** 1.15


def chain(rig, path_pts, count=34, name='corpo_vivo'):
    """Enfileira cópias ligadas (mesma malha) do módulo ao longo do caminho, afinando até a cauda."""
    import bpy
    from mathutils import Matrix
    col = kit.collection('Serpente')
    seg = rig.meshes['segmento']
    tail_ob = rig.meshes['cauda']
    P = geo.resample(geo.catmull(path_pts, 16), 600)
    d = geo.arclen(P)
    total = d[-1]
    s = 0.0
    k = 0
    placed = []
    while s < total and k < 200:
        t = s / total
        sc = max(0.14, body_radius(t) / SEG_R)
        i = int(np.searchsorted(d, s))
        i = min(max(i, 1), len(P) - 2)
        p = P[i]
        fwd = geo.unit(P[i - 1] - P[i + 1])           # para a cabeça
        up = geo.unit(UPV - fwd * np.dot(UPV, fwd))
        x = np.cross(-fwd, up)
        R = np.stack([x, -fwd, up], 1)                # local -Y = frente
        last = (total - s) < SEG_L * sc * 2.2 or sc <= 0.15
        src = tail_ob if last else seg
        ob = bpy.data.objects.new(f'{name}_{k:02d}', src.data)
        col.objects.link(ob)
        M = np.eye(4)
        M[:3, :3] = R * sc
        M[:3, 3] = p
        ob.matrix_world = Matrix(M.tolist())
        placed.append((ob, p, fwd, up, sc))
        k += 1
        if last:
            break
        s += SEG_L * sc * 0.97
    return placed


# ====================================================================== apresentação (render)
def present(rig, mode, a, path):
    from . import stage, fx
    import bpy
    from mathutils import Matrix
    w, h = map(int, a.res.split('x'))
    if mode == 'retrato':
        w, h = 1080, 1350
    stage.setup_render((w, h), a.samples, 0.05, volumetric=True)
    stage.world(horizon=(0.04, 0.024, 0.015), zenith=(0.004, 0.004, 0.007), fog=0.006, fog_color=(1.0, 0.8, 0.6))
    stage.studio(HERO_COLOR, rim2=(0.3, 0.55, 1.0), key_energy=700, rim_energy=1200, top_energy=1300)
    top = stage.pedestal(HERO_COLOR, radius=1.75)
    stage.halo((1.0, 0.5, 0.1), (0, 4.2, 2.2), 2.6, 0.6)
    # cabeça erguida, olhando para a câmera, boca entreaberta
    head = rig.nodes['cabeca']
    head.location = (0.05, -0.45, 1.3)
    head.scale = (1.3, 1.3, 1.3)
    rig.pose('cabeca', 10, 0, -14)
    rig.pose('mandibula', 24, 0, 0)
    for nm in ('segmento', 'cauda'):
        rig.nodes[nm].location = (0, 0, -50)          # módulos-modelo fora de cena
    rig.root.location.z = top
    bpy.context.view_layer.update()
    Mh = np.array(head.matrix_world)
    neck = (Mh @ np.array((0, 0.5, -0.02, 1.0)))[:3]
    back = geo.unit(Mh[:3, :3] @ np.array((0, 1.0, 0)))
    z0 = top + 0.0
    coil = [neck, neck + back * 0.35 + (0, 0, -0.08), (0.45, 0.55, z0 + 1.15), (0.95, 0.55, z0 + 0.62), (1.25, 0.05, z0 + 0.46),
            (1.1, -0.6, z0 + 0.42), (0.5, -1.05, z0 + 0.4), (-0.3, -1.1, z0 + 0.36), (-1.0, -0.7, z0 + 0.32), (-1.25, 0.05, z0 + 0.28),
            (-1.0, 0.75, z0 + 0.24), (-0.35, 1.05, z0 + 0.2), (0.25, 0.95, z0 + 0.17), (0.6, 0.6, z0 + 0.14)]
    placed = chain(rig, coil)
    if not a.nofx:
        rng = np.random.default_rng(31)
        hot = fx.tongue_material('boi_lingua', 3.0)
        blue = fx.tongue_material('boi_lingua_azul', 2.6, fx.BLUE_STOPS)
        ember = mats.emission_only('boi_fagulha', (1.0, 0.5, 0.1), 6.0)[0]
        ember2 = mats.emission_only('boi_brasa_ar', (1.0, 0.4, 0.06), 3.0)[0]
        # chamas sobre as barbatanas de cada módulo (douradas, algumas azuladas)
        roots, dirs, Ls, Ws, broots, bdirs = [], [], [], [], [], []
        for (ob, p, fwd, up, sc) in placed[:-1]:
            tipp = p + up * (0.43 + 0.046 + 0.2) * sc
            for j in range(3):
                q = tipp + fwd * rng.uniform(-0.08, 0.08) * sc
                dd = up + -fwd * 0.6 + rng.normal(0, 0.2, 3)
                if rng.uniform() < 0.25:
                    broots.append(q); bdirs.append(dd)
                else:
                    roots.append(q); dirs.append(dd)
                Ls.append(rng.uniform(0.18, 0.4) * sc)
                Ws.append(rng.uniform(0.035, 0.06) * sc)
        fx.tongues('chamas_dorso', roots, dirs, Ls[:len(roots)], Ws[:len(roots)], hot, seed=1)
        if broots:
            fx.tongues('chamas_dorso_azuis', broots, bdirs, Ls[len(roots):], Ws[len(roots):], blue, seed=2)
        # sopro de fogo saindo da boca
        mouth = (np.array(rig.nodes['mandibula'].matrix_world) @ np.array((0, -0.62, 0.02, 1.0)))[:3]
        fwd_h = geo.unit(-(np.array(head.matrix_world)[:3, :3] @ np.array((0, 1.0, 0))))
        R = parts.align_z(fwd_h + (0, 0, -0.25), (0, 0, 1))
        dom = fx.fire_volume('sopro', (0, 0, 0), 0.32, 1.6, strength=5.0, density=6.0, seed=2.7, scale=(3, 3, 1.2))
        dom.matrix_world = Matrix(np.block([[R * np.array([0.32, 0.32, 1.6]), mouth[:, None]], [np.zeros((1, 3)), np.ones((1, 1))]]).tolist())
        fx.tongues('sopro_linguas', [mouth] * 10, [fwd_h + rng.normal(0, 0.18, 3) + (0, 0, -0.2) for _ in range(10)],
                   rng.uniform(0.4, 0.9, 10), rng.uniform(0.05, 0.09, 10), hot, seed=3, wobble=0.5)
        # chifres em chamas e olhos que iluminam
        hfx = np.asarray(rig.world['FX_chifres'])
        hw = (np.array(head.matrix_world) @ np.array((0, 0.32, 0.45, 1.0)))[:3]
        fx.fire_volume('fogo_chifres', hw + (0, 0.05, -0.15), 0.3, 0.8, strength=3.5, density=5.0, seed=4.1)
        # rachaduras de lava no chão e brasas
        cr = geo.Cage()
        for k in range(22):
            a0 = rng.uniform(0, tau)
            r0 = rng.uniform(1.95, 2.6)
            pts = [(cos(a0) * r0, sin(a0) * r0, 0.004)]
            for j in range(6):
                a0 += rng.normal(0, 0.2)
                r0 += rng.uniform(0.08, 0.22)
                pts.append((cos(a0) * r0, sin(a0) * r0, 0.004))
            cr.merge(geo.sweep(pts, geo.superellipse(6, 0.012, 0.004, 2.0), 20, ref=(0, 0, 1), scale=lambda s: 1 - 0.8 * s, smooth=False))
        fx._obj('rachaduras', cr, mats.emission_only('boi_lava', (1.0, 0.3, 0.04), 1.6)[0])
        fx.motes('brasas_ar', (0, 0.3, 0.0), 300, 3.5, 3.4, 0.005, ember2, seed=5)
        fx.streaks('faiscas_ar', (0, 0.2, 0.4), 70, 2.6, 2.8, ember, seed=6, length=(0.03, 0.08), thick=0.0018)
        for i, (ob, p, fwd, up, sc) in enumerate(placed[:-1:5]):
            stage.point_light(f'luz_corpo{i}', p + up * 0.75 * sc, 40.0 * sc, (1.0, 0.5, 0.12), 0.1)
        for nm in ('FX_olho_r', 'FX_olho_l'):
            q = (np.array(rig.nodes['cabeca'].matrix_world) @ np.append(np.asarray(rig.world[nm]) - np.asarray(rig.world['cabeca']), 1.0))[:3]
            stage.point_light('luz_' + nm, q, 25.0, (1.0, 0.7, 0.3), 0.05)
        stage.point_light('luz_sopro', mouth + fwd_h * 0.6, 120.0, (1.0, 0.5, 0.12), 0.2)
    if mode == 'retrato':
        stage.camera((1.9, -5.0, 2.1 + top), (0.0, -0.1, 0.95 + top), 34, 2.8, focus=(0.1, -0.5, 1.3 + top))
    elif mode == 'close':
        stage.camera((1.2, -2.4, 1.7 + top), (0.15, -0.35, 1.3 + top), 45, 2.0, focus=(0.15, -0.5, 1.3 + top))
    else:
        stage.camera((2.6, -5.4, 2.3 + top), (0.0, -0.1, 0.85 + top), 32, 2.8, focus=(0.1, -0.5, 1.3 + top))
    stage.render(path)


def prepare_export(rig):
    """No .glb os módulos-modelo ficam na origem; o Godot/web instanciam ao longo do corpo."""
    for nm in ('segmento', 'cauda'):
        rig.nodes[nm].location = (0, 0, 0)
    rig.nodes['cabeca'].location = (0, 0, 0.55)


def prepare_preview(rig):
    rig.nodes['segmento'].location = (1.3, 0.4, 0.45)
    rig.nodes['cauda'].location = (-1.3, 0.4, 0.45)
