"""SACI — o redemoinho (versão orgânica, esculpida).

Jovem negro, magro e atlético, de UMA PERNA SÓ (a outra é uma perna fantasma feita de vento, que
aparece como efeito), com a carapuça vermelha comprida voando ao vento, calção vermelho rasgado
(a perna vazia balança), faixa na cintura, lenço no pescoço, cachimbo de barro na mão,
tornozeleira de contas e olhos que brilham.
"""
import bpy
import numpy as np
from math import tau, pi, cos, sin, radians
from mathutils import Matrix, Vector

from . import geo, kit, sculpt, anatomy, org, rig as rigmod
from .humano import Hero, section, transfer_nearest, anchors, rot_world, bone_world, clay, skeleton as human_bones

ID = 'saci'
HERO_COLOR = (0.9, 0.08, 0.06)
WIND = (0.55, 0.85, 1.0)
HEIGHT = 2.0
F = np.array((0.0, -1.0, 0.0))
UP = np.array((0.0, 0.0, 1.0))


def cloth_rings(V, zs, center, rmax, pad, rng, folds=0.004, n=48, hem_noise=0.0):
    """Anéis de pano em volta do corpo (contornos + folga + dobras)."""
    rings = []
    for i, z in enumerate(zs):
        th, rad = section(V, z, center, band=0.006, n=n, pad=pad, rmax=rmax)
        ph = rng.uniform(0, tau)
        fold = folds * (np.sin(th * 7 + ph) * 0.6 + np.sin(th * 13 + ph * 2) * 0.4)
        r = rad + fold
        zz = np.full(n, z)
        if hem_noise and i == len(zs) - 1:
            zz = zz - hem_noise * (0.5 + 0.5 * np.sin(th * 9 + ph)) * rng.uniform(0.5, 1.0, n)
        rings.append(np.stack([center[0] + np.cos(th) * r, center[1] + np.sin(th) * r, zz], 1))
    return rings


def build(detail=2, voxel=0.00205):
    col = kit.collection(ID)
    body = anatomy.Body('saci_corpo', 1.70, build=0.82, lean=0.9, legs=(True, False), feet_backward=False,
                        arm_angle=30.0, ears_pointed=0.0, gaunt=0.0)
    k = body.k
    lm = body.lm
    ob = sculpt.build_body(body, voxel, col=col)
    sculpt.noise_displace(ob, 0.0004, 260.0, seed=5)
    V = sculpt.verts(ob)
    sculpt.set_attr(ob, 'brasa', np.zeros(len(V)))
    sculpt.set_attr(ob, 'cinza', np.zeros(len(V)))
    M = {
        'pele': org.skin('saci_pele', (0.07, 0.04, 0.027), (1.0, 0.3, 0.05), 0.0, (0.7, 0.28, 0.15), 0.52),
        'olho': org.glow('saci_olho', (1.0, 0.36, 0.08), 8.0),
        'pano': org.cloth('saci_pano', (0.36, 0.016, 0.02), 0.86, 0.45, 180.0),
        'calcao': org.cloth('saci_calcao', (0.26, 0.018, 0.02), 0.88, 0.4, 160.0),
        'faixa': org.cloth('saci_faixa', (0.3, 0.025, 0.022), 0.85, 0.45, 180.0),
        'barro': org.solid('saci_barro', (0.32, 0.15, 0.08), 0.62, 0.0, 70.0, 0.25, variation=0.4),
        'madeira': org.wood('saci_madeira', (0.12, 0.06, 0.03)),
        'brasa': org.glow('saci_brasa', (1.0, 0.32, 0.04), 6.0),
        'conta': org.solid('saci_conta', (0.6, 0.45, 0.2), 0.3, 0.6, coat=0.6),
        'corda': org.fiber('saci_corda', (0.18, 0.12, 0.06), (0.1, 0.06, 0.03), 0.8),
    }
    ob.data.materials.append(M['pele'])
    meshes = {'corpo': ob}

    def add(name, cage, mat, sub=0, attrs=None, solid=0.0):
        me = kit.cage_to_mesh(cage, name, 50.0, attrs)
        me.materials.append(M[mat])
        o = bpy.data.objects.new(name, me)
        col.objects.link(o)
        if solid:
            md = o.modifiers.new('Espessura', 'SOLIDIFY')
            md.thickness = solid
            md.offset = 1.0
        if sub:
            md = o.modifiers.new('Sub', 'SUBSURF')
            md.levels = sub
            md.render_levels = sub
        if solid or sub:
            o = sculpt.apply_mods(o)
        o.data.polygons.foreach_set('use_smooth', [True] * len(o.data.polygons))
        meshes[name] = o
        return o

    rng = np.random.default_rng(21)
    # ---------------- olhos
    eyes = geo.Cage()
    for sx, side in ((1, 'r'), (-1, 'l')):
        out = geo.unit(F + np.array((0.28 * sx, 0, 0.02)))
        eyes.merge(org.eye(lm['olho_' + side] + out * 0.0015, (0.0118, 0.0055, 0.0062), out, tilt=6 * sx))
    add('olhos', eyes, 'olho')

    # ---------------- calção: quadril, perna direita e a perna vazia (rasgadas)
    zc = 0.865 * k
    hip = cloth_rings(V, np.linspace(1.0 * k, zc, 8), (0.0, 0.012), 0.2 * k, 0.013, rng, 0.004)
    sculpt.noise_displace(add('calcao_quadril', geo.tube(hip, False, False), 'calcao', 2, solid=0.004), 0.003, 26.0, seed=9)
    Hr = lm['quadril_r']
    zs = np.linspace(zc + 0.02, 0.6 * k, 10)
    leg = cloth_rings(V, zs, (Hr[0] + 0.004, Hr[1] - 0.004), 0.11 * k, 0.016, rng, 0.006, hem_noise=0.03)
    sculpt.noise_displace(add('calcao_perna', geo.tube(leg, False, False), 'calcao', 2, solid=0.004), 0.0035, 24.0, seed=10)
    Hl = lm['quadril_l']
    empty = []
    for i, t in enumerate(np.linspace(0, 1, 10)):
        z = zc + 0.02 - t * 0.24 * k
        c = np.array((Hl[0] - 0.01 - 0.05 * t * t, Hl[1] + 0.03 * t * t, z))
        r = (0.078 - 0.012 * t) * k
        th = np.linspace(0, tau, 40, endpoint=False)
        rr = r * (1 + 0.08 * np.sin(th * 5 + i) * t) * np.where(np.cos(th) > 0, 1.0 - 0.35 * t, 1.0)
        zz = np.full(40, z) - (0.03 * (0.5 + 0.5 * np.sin(th * 7 + 2)) * rng.uniform(0.5, 1, 40) if i == 9 else 0)
        empty.append(np.stack([c[0] + np.cos(th) * rr, c[1] + np.sin(th) * rr, zz], 1))
    sculpt.noise_displace(add('calcao_vazio', geo.tube(empty, False, False), 'calcao', 2, solid=0.0035), 0.004, 22.0, seed=11)

    # ---------------- faixa na cintura com nó e pontas
    zb = 1.0 * k
    th, rad = section(V, zb, (0.0, 0.012), pad=0.02, rmax=0.2 * k)
    band = [np.array((cos(a) * r, 0.012 + sin(a) * r, zb)) for a, r in zip(th, rad)]
    band.append(band[0])
    add('faixa', geo.sweep(band, geo.superellipse(10, 0.006, 0.022, 3.0), 120, ref=UP, smooth=False, caps=(False, False)), 'faixa', 1)
    knot = np.array((0.15 * k, -0.06 * k, zb))
    add('faixa_no', geo.ellipsoid(knot, (0.026, 0.02, 0.024), nu=24, nv=12), 'faixa', 1)
    tails = geo.Cage()
    for j, (dx, L) in enumerate(((0.02, 0.26), (-0.015, 0.21))):
        p0 = knot + np.array((dx, -0.01, -0.01))
        ctrl = [p0, p0 + np.array((0.03, -0.02, -L * 0.4)), p0 + np.array((0.07 + dx, 0.02, -L * 0.75)), p0 + np.array((0.1 + dx, 0.06, -L))]
        tails.merge(geo.sweep(ctrl, geo.superellipse(8, 0.022, 0.004, 3.0), 18, ref=(0, -1, 0), twist=0.8,
                              scale=lambda s: (1.0 - 0.3 * s, 1.0), caps=(True, True)))
    add('faixa_pontas', tails, 'faixa', 1)

    # ---------------- lenço no pescoço (nó na frente, pontas ao vento)
    zn = 1.535 * k
    thn, radn = section(V, zn, (0.0, 0.0), pad=0.012, rmax=0.085 * k)
    ring = [np.array((cos(a) * r, sin(a) * r, zn - 0.025 * max(0.0, -sin(a)) ** 2)) for a, r in zip(thn, radn)]
    ring.append(ring[0])
    add('lenco', geo.sweep(ring, geo.superellipse(10, 0.012, 0.02, 2.6), 90, ref=UP, smooth=False, caps=(False, False)), 'pano', 1)
    kn = np.array((0.0, -0.075 * k, zn - 0.03))
    add('lenco_no', geo.ellipsoid(kn, (0.02, 0.016, 0.018), nu=20, nv=10), 'pano', 1)
    lt = geo.Cage()
    for dx in (0.012, -0.01):
        p0 = kn + np.array((dx, 0.0, -0.01))
        ctrl = [p0, p0 + np.array((0.04 + dx, 0.04, -0.03)), p0 + np.array((0.1, 0.14, -0.02)), p0 + np.array((0.16, 0.24, 0.0))]
        lt.merge(geo.sweep(ctrl, geo.superellipse(8, 0.02, 0.003, 3.0), 18, ref=UP, twist=1.2,
                           scale=lambda s: (1.0 - 0.6 * s, 1.0), caps=(True, True)))
    add('lenco_pontas', lt, 'pano', 1)

    # ---------------- carapuça vermelha: base justa na cabeça, corpo de pano, ponta longa ao vento
    zh = 1.79 * k
    thh, radh = section(V, zh, (0.0, 0.014 * k), pad=0.007, rmax=0.12 * k)
    c0 = np.array((0.0, 0.014 * k, zh))
    path = [c0, c0 + np.array((0.0, 0.01, 0.07)), c0 + np.array((0.01, 0.07, 0.14)), c0 + np.array((0.05, 0.18, 0.16)),
            c0 + np.array((0.12, 0.33, 0.1)), c0 + np.array((0.2, 0.47, 0.02)), c0 + np.array((0.27, 0.58, -0.05))]
    P = geo.resample(geo.catmull(path, 12), 70)
    T, N, B = geo.frames(P, (0, 0, 1))
    rings = []
    rbase = np.interp(np.linspace(0, tau, 40, endpoint=False), thh, radh, period=tau)
    for i in range(len(P)):
        t = i / (len(P) - 1)
        th = np.linspace(0, tau, 40, endpoint=False)
        if i == 0:
            rings.append(np.stack([c0[0] + np.cos(th) * rbase, c0[1] + np.sin(th) * rbase, np.full(40, zh - 0.006)], 1))
            continue
        r = (0.1 * k) * (1 - t) ** 0.85 + 0.008
        flat = 1.0 - 0.45 * t
        fold = 1.0 + 0.06 * np.sin(th * 6 + t * 9) * min(1.0, t * 3) + 0.03 * np.sin(th * 11 + t * 21)
        rings.append(P[i] + (np.cos(th)[:, None] * B[i] * flat + np.sin(th)[:, None] * N[i]) * (r * fold)[:, None])
    cap = geo.tube(rings, False, True)
    capv = np.concatenate([np.full(40, i / (len(rings) - 1)) for i in range(len(rings))])
    co = add('carapuca', cap, 'pano', 2, {'s': capv})
    sculpt.noise_displace(co, 0.004, 22.0, seed=7)
    sculpt.noise_displace(co, 0.0012, 70.0, seed=8)
    add('carapuca_barra', geo.torus(c0 + np.array((0, 0, 0.002)), UP, float(np.mean(rbase)) + 0.004, 0.007, 64, 10), 'pano', 1)

    # ---------------- cachimbo de barro na mão esquerda (haste de madeira, brasa no fornilho)
    pal = lm['palma_l']
    W, E = lm['pulso_l'], lm['cotovelo_l']
    d = geo.unit(W - E)
    bowl = pal + np.array((-0.03, -0.035, 0.0))
    pipe = geo.Cage()
    pipe_w = geo.Cage()
    pipe.merge(geo.lathe([(0.0, -0.028), (0.016, -0.028), (0.024, -0.012), (0.027, 0.014), (0.025, 0.03), (0.02, 0.028), (0.0, 0.026)],
                         24, bowl, UP))
    stem = [bowl + np.array((0.0, 0.012, -0.012)), bowl + np.array((0.02, 0.06, -0.01)), bowl + np.array((0.045, 0.11, 0.005))]
    pipe_w.merge(geo.sweep(stem, geo.circle(10, 0.0055), 16, caps=(True, True)))
    add('cachimbo', pipe, 'barro', 1)
    add('cachimbo_haste', pipe_w, 'madeira', 1)
    add('cachimbo_brasa', geo.lathe([(0.0, 0.0), (0.019, 0.0), (0.018, 0.006), (0.0, 0.008)], 20, bowl + np.array((0, 0, 0.022)), UP), 'brasa')
    # ---------------- tornozeleira de contas
    A = lm['tornozelo_r']
    beads = geo.Cage()
    for i in range(18):
        a = tau * i / 18
        beads.merge(geo.ellipsoid(A + np.array((cos(a) * 0.036 * k, sin(a) * 0.036 * k + 0.004, 0.055 * k)), (0.0055,) * 3, nu=10, nv=6))
    add('tornozeleira', beads, 'conta', 1)
    add('tornozeleira_fio', org.rope_wrap(A + np.array((0, 0.004, 0.055 * k)), UP, 0.034 * k, 0.004, 1, 0.0018), 'corda')

    # ---------------- esqueleto e pesos
    lmk = dict(lm)
    lmk['k'] = k
    head_top = np.array((0.0, 0.014 * k, zh + 0.06))
    bones = human_bones(ID, lmk, leg_names=('perna', 'canela', 'pe'), legs=('r',),
                        extra=[('gorro', tuple(head_top), tuple(c0 + np.array((0.12, 0.33, 0.1))), 'cabeca')])
    arm = rigmod.armature(ID + '_esqueleto', bones, col)
    rigmod.heat_weights(ob, arm)
    for name, o in meshes.items():
        if name == 'corpo':
            continue
        if name in ('calcao_quadril', 'calcao_perna', 'tornozeleira', 'tornozeleira_fio'):
            transfer_nearest(ob, o, arm)
        elif name in ('cachimbo', 'cachimbo_haste', 'cachimbo_brasa'):
            rigmod.rigid(o, arm, 'mao_l')
        elif name == 'carapuca':
            s = np.zeros(len(o.data.vertices))
            o.data.attributes['s'].data.foreach_get('value', s)
            t = np.clip((s - 0.15) / 0.5, 0, 1)
            rigmod.assign(o, ['cabeca', 'gorro'], np.stack([1 - t, t], 1))
            rigmod.bind(o, arm)
        elif name in ('olhos', 'carapuca_barra'):
            rigmod.rigid(o, arm, 'cabeca')
        elif name.startswith('lenco'):
            rigmod.rigid(o, arm, 'pescoco')
        else:
            rigmod.rigid(o, arm, 'corpo')
    tip = P[-1]
    anchors(arm, [('FX_gorro', 'gorro', tip), ('FX_olhos', 'cabeca', (lm['olho_r'] + lm['olho_l']) / 2),
                  ('FX_cachimbo', 'mao_l', bowl + np.array((0, 0, 0.05))), ('FX_mao_r', 'mao_r', lm['palma_r']),
                  ('FX_perna_vento', 'corpo', np.array((Hl[0], Hl[1], 0.6 * k))), ('FX_pe', 'pe', lm['pe_r'])])
    return Hero(ID, col, arm, meshes, lm)


# ====================================================================== apresentação (render)
def pose_hero(hero):
    arm = hero.arm
    rot_world(arm, 'coluna', (0, 0, 1), -6)
    rot_world(arm, 'coluna', (1, 0, 0), -4)
    rot_world(arm, 'braco_l', (1, 0, 0), -32)
    rot_world(arm, 'antebraco_l', (1, 0, 0), -70)
    rot_world(arm, 'antebraco_l', (0, 1, 0), 18)
    rot_world(arm, 'braco_r', (0, 1, 0), 10)
    rot_world(arm, 'cabeca', (0, 0, 1), 12)
    rot_world(arm, 'cabeca', (1, 0, 0), -6)
    rot_world(arm, 'canela', (1, 0, 0), 8)


def present(hero, mode, a, path):
    from . import stage, fx, mats
    w, h = map(int, a.res.split('x'))
    if mode == 'retrato':
        w, h = 1080, 1350
    if mode == 'argila':
        return clay(hero, a, path)
    arm = hero.arm
    lm = hero.lm
    k = 1.70 / 1.85
    stage.setup_render((w, h), a.samples, 0.05, volumetric=True)
    stage.world(horizon=(0.09, 0.07, 0.09), zenith=(0.012, 0.016, 0.03), fog=0.02, fog_color=(0.65, 0.72, 0.9))
    stage.spot_light('Lua', (2.5, 4.0, 8.5), (0.0, 0.0, 0.8), 7000.0, (0.7, 0.8, 1.0), 28, 0.5, 0.25, 1.0)
    stage.area_light('Principal', (2.4, -3.0, 3.0), (0, 0, 1.1), 330.0, (1.0, 0.86, 0.75), 2.5, 0.0)
    stage.area_light('Recorte_frio', (-2.8, 2.0, 2.2), (0, 0, 1.2), 700.0, WIND, 1.5, 0.05)
    stage.area_light('Preenchimento', (-2.5, -3.0, 1.0), (0, 0, 1.0), 110.0, (0.6, 0.65, 0.9), 4.0, 0.0)
    org.cerrado(seed=4)
    pose_hero(hero)
    if not a.nofx:
        rng = np.random.default_rng(9)
        windm = fx.ribbon_material('saci_fita', (0.75, 0.92, 1.0), 1.5, 0.28)
        ghost = fx.tongue_material('saci_fantasma', 2.2, fx.BLUE_STOPS, alpha_pow=1.0)
        leafm = org.solid('saci_folha_viva', (0.5, 0.12, 0.03), 0.55, 0.0, 30.0, 0.15, sss=0.3)
        leafm2 = org.solid('saci_folha_seca2', (0.55, 0.3, 0.06), 0.6, 0.0, 30.0, 0.15, sss=0.2)
        dust = mats.make('saci_poeira', (0.4, 0.32, 0.22), 0.0, 0.9, 'paint', detail=0.0)
        spark = mats.emission_only('saci_faisca', (0.65, 0.92, 1.0), 4.0)[0]
        ember = mats.emission_only('saci_fagulha', (1.0, 0.42, 0.08), 6.0)[0]
        # ---- perna fantasma de vento: espiral de fitas + línguas azuladas descendo do quadril até o chão
        top = bone_world(arm, 'corpo', np.array((lm['quadril_l'][0], lm['quadril_l'][1], 0.84 * k)))
        foot = np.array((top[0] - 0.05, top[1] - 0.02, 0.02))
        n = 26
        roots, dirs = [], []
        for i in range(n):
            t = i / (n - 1)
            c = top * (1 - t) + foot * t
            ang = rng.uniform(0, tau)
            roots.append(c + np.array((cos(ang), sin(ang), 0)) * (0.06 - 0.03 * t) * k)
            dirs.append((cos(ang + 1.6) * 0.6, sin(ang + 1.6) * 0.6, -0.6 + rng.uniform(-0.3, 0.3)))
        fx.tongues('perna_fantasma', roots, dirs, rng.uniform(0.12, 0.26, n), rng.uniform(0.02, 0.04, n), ghost, seed=3, wobble=0.6)
        R = np.eye(3)
        fx.wind_ribbons('perna_fitas', foot, 14, 0.05, 0.08, float(top[2] - foot[2]), windm, seed=4, width=0.004, turns=(1.0, 2.0))
        tm = fx.volume_material('saci_perna_vol', 'tornado', 1.6, 6.0, (3.0, 3.0, 1.6), 3.0, fx.BLUE_STOPS, smoke_color=(0.7, 0.8, 0.95),
                                cutoff=0.34, swirl=10.0)
        fx.volume_domain('perna_volume', foot, 0.13, float(top[2] - foot[2]) + 0.05, tm)
        # ---- redemoinho no chão em volta (poeira e folhas)
        fx.wind_ribbons('redemoinho', (0, 0, 0.0), 12, 0.55, 1.2, 1.5, windm, seed=1, width=0.005, turns=(0.35, 0.8))
        tm2 = fx.volume_material('saci_funil', 'tornado', 0.25, 3.0, (3.0, 3.0, 1.2), 2.0, fx.BLUE_STOPS, smoke_color=(0.6, 0.52, 0.42),
                                 cutoff=0.36, swirl=8.0)
        fx.volume_domain('funil', (0, 0, 0), 1.2, 1.8, tm2)
        fx.motes('folhas_vermelhas', (0, 0, 0.1), 90, 1.6, 2.0, 0.026, leafm, seed=5, flat=True)
        fx.motes('folhas_secas', (0, 0, 0.1), 70, 1.8, 1.8, 0.024, leafm2, seed=6, flat=True)
        fx.motes('poeira', (0, 0, 0.0), 300, 1.6, 0.9, 0.004, dust, seed=7)
        fx.streaks('faiscas_vento', (0, 0, 0.3), 60, 1.0, 1.6, spark, seed=8, length=(0.03, 0.09), thick=0.0014, up=0.25, swirl=2.5)
        # ---- cachimbo: brasa, fumaça e fagulhas
        tip = bone_world(arm, 'mao_l', np.asarray(hero.world.get('FX_cachimbo', lm['palma_l'])))
        pipe_ob = hero.meshes['cachimbo_brasa']
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        ev = pipe_ob.evaluated_get(dg)
        mev = ev.to_mesh()
        Pv = np.array([v.co[:] for v in mev.vertices])
        ev.to_mesh_clear()
        tip = (Pv.mean(0) @ np.array(pipe_ob.matrix_world)[:3, :3].T + np.array(pipe_ob.matrix_world)[:3, 3]) + np.array((0, 0, 0.01))
        fx.smoke_volume('fumaca_cachimbo', tip, 0.12, 0.9, density=2.6, seed=3.3, color=(0.75, 0.75, 0.78))
        fx.streaks('fagulhas_cachimbo', tip, 16, 0.03, 0.16, ember, seed=8, length=(0.008, 0.025), thick=0.0012)
        stage.point_light('luz_cachimbo', tip + np.array((0, -0.02, 0.02)), 6.0, (1.0, 0.45, 0.1), 0.03)
        stage.point_light('luz_perna', (top + foot) / 2 + np.array((0, -0.1, 0)), 60.0, WIND, 0.15)
        stage.point_light('luz_olhos', bone_world(arm, 'cabeca', (lm['olho_r'] + lm['olho_l']) / 2) + np.array((0, -0.06, 0)), 3.0, (1.0, 0.4, 0.1), 0.02)
    if mode == 'retrato':
        stage.camera((0.95, -3.0, 0.95), (0.0, 0.0, 1.0), 52, 2.4, focus=(0.0, -0.05, 1.4))
    elif mode == 'close':
        stage.camera((0.4, -1.15, 1.7), (0.0, 0.0, 1.6), 60, 1.6, focus=(0.0, -0.08, 1.6))
    else:
        stage.camera((1.5, -4.2, 0.95), (0.1, 0.2, 1.0), 40, 2.6, focus=(0.0, -0.05, 1.4))
    stage.render(path)
